from flask import Blueprint, g, request

from config.database import get_database
from middleware.auth_middleware import auth_required
from services.wallet_service import (
    create_demo_deposit_for_development,
    create_demo_withdrawal_for_development,
    credit_demo_wallet_for_development,
    get_wallet_balance,
    get_wallet_ledger_history,
    transfer_between_user_wallets,
)
from utils.response import error_response, success_response


wallet_api = Blueprint("wallet_api", __name__, url_prefix="/api/wallet")


SETTINGS_KEY = "main"


def to_float(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def to_bool(value, default=False):
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        value = value.strip().lower()
        if value in ["true", "1", "yes", "on"]:
            return True
        if value in ["false", "0", "no", "off"]:
            return False

    return default


def normalize_status(value):
    value = str(value or "").strip()

    status_map = {
        "Trading Enabled": "trading_enabled",
        "Maintenance Mode": "maintenance_mode",
        "Withdrawals Paused": "withdrawals_paused",
        "Trading Paused": "trading_paused",

        "trading_enabled": "trading_enabled",
        "maintenance_mode": "maintenance_mode",
        "withdrawals_paused": "withdrawals_paused",
        "trading_paused": "trading_paused",
    }

    return status_map.get(value, "trading_enabled")


def get_admin_wallet_settings():
    default_settings = {
        "platform_status": "trading_enabled",
        "pause_withdrawals": False,
        "withdrawal_review_limit": 10000,
        "daily_withdrawal_limit": 50000,
        "require_kyc_for_withdrawals": True,
    }

    try:
        db = get_database()

        saved_settings = (
            db.system_settings.find_one({"settings_key": SETTINGS_KEY})
            or db.system_settings.find_one(sort=[("updated_at", -1)])
            or {}
        )

        final_settings = {
            **default_settings,
            **saved_settings,
        }

        print(
            "DEMO WITHDRAW SETTINGS APPLIED:",
            {
                "platform_status": final_settings.get("platform_status"),
                "pause_withdrawals": final_settings.get("pause_withdrawals"),
                "withdrawal_review_limit": final_settings.get("withdrawal_review_limit"),
                "daily_withdrawal_limit": final_settings.get("daily_withdrawal_limit"),
            },
        )

        return final_settings

    except Exception as error:
        print("DEMO WITHDRAW SETTINGS ERROR:", str(error))
        return default_settings


def validate_demo_withdrawal_settings(amount):
    settings = get_admin_wallet_settings()

    withdrawal_amount = to_float(amount, 0)

    if withdrawal_amount <= 0:
        return {
            "success": False,
            "message": "Withdrawal amount is required.",
            "errors": {
                "amount": "Invalid withdrawal amount."
            },
            "status_code": 422,
        }

    platform_status = normalize_status(settings.get("platform_status"))

    if platform_status in ["maintenance_mode", "withdrawals_paused"]:
        return {
            "success": False,
            "message": "Withdrawals are currently disabled by admin.",
            "errors": {
                "withdrawal": "Withdrawals are paused from settings."
            },
            "status_code": 403,
        }

    if to_bool(settings.get("pause_withdrawals"), False):
        return {
            "success": False,
            "message": "Withdrawals are currently paused by admin.",
            "errors": {
                "withdrawal": "Pause withdrawals is enabled in settings."
            },
            "status_code": 403,
        }

    withdrawal_limit = to_float(settings.get("withdrawal_review_limit"), 0)

    if withdrawal_limit > 0 and withdrawal_amount > withdrawal_limit:
        return {
            "success": False,
            "message": f"Withdrawal amount exceeds admin limit of {withdrawal_limit:g} USDT.",
            "errors": {
                "amount": f"Maximum withdrawal limit is {withdrawal_limit:g} USDT."
            },
            "status_code": 403,
        }

    daily_limit = to_float(settings.get("daily_withdrawal_limit"), 0)

    if daily_limit > 0 and withdrawal_amount > daily_limit:
        return {
            "success": False,
            "message": f"Withdrawal amount exceeds daily limit of {daily_limit:g} USDT.",
            "errors": {
                "amount": f"Daily withdrawal limit is {daily_limit:g} USDT."
            },
            "status_code": 403,
        }

    return {
        "success": True,
        "amount": withdrawal_amount,
        "settings": settings,
    }


@wallet_api.get("/usdt-rate")
def get_usdt_rate_endpoint():
    from services.system_settings_service import get_usdt_inr_rate
    rate = float(get_usdt_inr_rate() or 88.50)
    return success_response(
        message="Current USDT rate fetched successfully.",
        data={
            "usdt_rate": rate,
            "currency": "INR",
            "formatted": f"1 USDT = ₹{rate:g} INR",
            "unit_inr": rate,
        }
    )


@wallet_api.post("/select-currency")
@auth_required
def select_primary_currency():
    from utils.date_helper import now_utc

    data = request.get_json(silent=True) or {}
    currency = str(data.get("currency") or "INR").strip().upper()
    if currency not in ["INR", "USDT"]:
        return error_response(message="Invalid currency selection. Choose INR or USDT.", status_code=422)

    db = get_database()
    wallet = db.wallets.find_one({"user_id": str(g.current_user_id)})
    if wallet and wallet.get("is_currency_locked"):
        return error_response(
            message=f"Currency is locked to {wallet.get('primary_currency', 'INR')}. Selection cannot be changed.",
            status_code=400,
        )

    db.wallets.update_one(
        {"user_id": str(g.current_user_id)},
        {
            "$set": {
                "primary_currency": currency,
                "is_currency_locked": True,
                "main_wallet.currency": currency,
                "updated_at": now_utc(),
            }
        },
        upsert=False
    )
    result = get_wallet_balance(g.current_user_id)
    return success_response(
        message=f"Primary account currency locked to {currency} successfully.",
        data=result.get("data", {})
    )


@wallet_api.get("/balance")
@auth_required
def balance():
    from bson import ObjectId
    user_id = str(g.current_user["_id"])
    sub_account_id = request.args.get("sub_account_id") or request.args.get("sub_user_id") or request.headers.get("X-Sub-User-Id")

    target_user_id = user_id
    if sub_account_id and str(sub_account_id) != "main" and str(sub_account_id) != user_id:
        db = get_database()
        user_doc = db.users.find_one({"_id": ObjectId(user_id)})
        if user_doc:
            actual_parent_id = user_doc.get("parent_user_id") or user_id
            sub_user = db.users.find_one({
                "_id": ObjectId(sub_account_id),
                "parent_user_id": actual_parent_id
            })
            if sub_user:
                target_user_id = str(sub_user["_id"])

    result = get_wallet_balance(target_user_id)

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )



@wallet_api.get("/ledger")
@auth_required
def ledger():
    parent_id = getattr(g, "token_user_id", None) or str(g.current_user["_id"])
    target_user_id = str(g.current_user["_id"])
    sub_account_id = request.args.get("sub_account_id") or request.args.get("sub_user_id")

    if sub_account_id == "main":
        target_user_id = parent_id
    elif sub_account_id and sub_account_id != target_user_id:
        from bson import ObjectId
        from config.database import get_database
        if ObjectId.is_valid(str(sub_account_id)):
            db = get_database()
            sub_user = db.users.find_one({
                "_id": ObjectId(str(sub_account_id)),
                "parent_user_id": parent_id
            })
            if not sub_user:
                return error_response(
                    message="Unauthorized: This sub-account does not belong to your account.",
                    status_code=403
                )
            target_user_id = str(sub_user["_id"])

    result = get_wallet_ledger_history(target_user_id)

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )


@wallet_api.get("/overview-stats")
@auth_required
def overview_stats():
    from datetime import datetime, timedelta
    from config.database import get_database
    from bson import ObjectId
    db = get_database()
    
    actual_parent_id = g.current_user.get("parent_user_id") or getattr(g, "token_user_id", None) or str(g.current_user["_id"])
    parent_id = str(actual_parent_id)
    target_user_id = str(g.current_user["_id"])
    sub_account_id = request.args.get("sub_account_id") or request.args.get("sub_user_id")

    if sub_account_id == "main":
        target_user_id = parent_id
    elif sub_account_id and sub_account_id != target_user_id:
        if ObjectId.is_valid(str(sub_account_id)):
            sub_user = db.users.find_one({
                "_id": ObjectId(str(sub_account_id)),
                "parent_user_id": parent_id
            })
            if sub_user:
                target_user_id = str(sub_user["_id"])
    
    # Date parsing helper for robust date comparisons across string/datetime types
    def _parse_ts(v):
        if isinstance(v, datetime):
            return v
        if isinstance(v, str) and v.strip():
            try:
                clean_v = v.strip().replace("Z", "+00:00")
                if "+" in clean_v:
                    return datetime.fromisoformat(clean_v.split("+")[0][:19])
                return datetime.fromisoformat(clean_v[:19])
            except Exception:
                pass
        return None

    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    # Profile-wide user IDs (parent + all subaccounts) for global VIP volume
    all_profile_user_ids = [parent_id]
    try:
        sub_docs = list(db.users.find({"parent_user_id": parent_id}, {"_id": 1}))
        all_profile_user_ids.extend([str(s["_id"]) for s in sub_docs])
    except Exception:
        pass

    # 1. Profile-wide 30d Trading Volume & VIP Tier
    profile_trades = list(db.trades.find({"user_id": {"$in": all_profile_user_ids}}))
    recent_profile_trades = [t for t in profile_trades if (_parse_ts(t.get("created_at")) or datetime.min) >= thirty_days_ago]
    total_volume = sum(
        float(t.get("amount") or (float(t.get("quantity", 0)) * float(t.get("price", 0))))
        for t in recent_profile_trades
    )

    # Account-specific trades for Realized P&L
    all_user_trades = list(db.trades.find({"user_id": target_user_id}))
    recent_trades = [t for t in all_user_trades if (_parse_ts(t.get("created_at")) or datetime.min) >= thirty_days_ago]
    
    # Determine VIP tier
    if total_volume >= 250000:
        vip_tier = "VIP 3"
        next_vip = "VIP 4"
        tier_target = 1000000
        tier_name = "Pro Max"
    elif total_volume >= 50000:
        vip_tier = "VIP 2"
        next_vip = "VIP 3"
        tier_target = 250000
        tier_name = "Pro"
    elif total_volume >= 10000:
        vip_tier = "VIP 1"
        next_vip = "VIP 2"
        tier_target = 50000
        tier_name = "Advanced"
    else:
        vip_tier = "VIP 0"
        next_vip = "VIP 1"
        tier_target = 10000
        tier_name = "Basic"
        
    volume_progress = min(100.0, round((total_volume / max(tier_target, 1)) * 100, 1))
    saved_fees = round(total_volume * 0.0002, 2)
    
    # 2. Calculate 30d Realized P&L and Closed Trades Count
    closed_trades = [
        t for t in recent_trades
        if t.get("trade_type") == "close" or t.get("realized_pnl") is not None or t.get("net_realized_pnl") is not None
    ]
    
    # Also check closed positions in db.positions
    user_closed_positions = list(db.positions.find({"user_id": target_user_id, "status": "closed"}))
    recent_closed_positions = [
        p for p in user_closed_positions
        if (_parse_ts(p.get("closed_at") or p.get("updated_at") or p.get("created_at")) or datetime.min) >= thirty_days_ago
    ]

    # Combine realized PnL
    if closed_trades:
        total_realized_pnl = sum(
            float(t.get("net_realized_pnl") if t.get("net_realized_pnl") is not None else (t.get("realized_pnl") or 0.0))
            for t in closed_trades
        )
        trades_closed_count = len(closed_trades)
    else:
        total_realized_pnl = sum(
            float(p.get("net_realized_pnl") if p.get("net_realized_pnl") is not None else (p.get("realized_pnl") or 0.0))
            for p in recent_closed_positions
        )
        trades_closed_count = len(recent_closed_positions)

    total_realized_pnl = round(total_realized_pnl, 2)

    # 3. Calculate User Tasks & Rewards
    user_doc = db.users.find_one({"_id": ObjectId(target_user_id)}) or {}
    email_done = bool(user_doc.get("is_email_verified") or user_doc.get("status") == "active")
    kyc_done = bool(user_doc.get("kyc_status") == "approved")
    deposit_done = db.deposits.count_documents({"user_id": target_user_id, "status": "completed"}) > 0
    trade_done = (len(all_user_trades) > 0) or (db.trades.count_documents({"user_id": target_user_id}) > 0) or (db.trading_positions.count_documents({"user_id": target_user_id}) > 0)
    security_done = bool(user_doc.get("two_factor_enabled") or user_doc.get("phone"))
    
    tasks = [
        {"id": "email", "label": "Account Registration", "completed": email_done, "reward": 5.0},
        {"id": "kyc", "label": "Identity Verification", "completed": kyc_done, "reward": 10.0},
        {"id": "deposit", "label": "First Deposit", "completed": deposit_done, "reward": 15.0},
        {"id": "trade", "label": "First Trade", "completed": trade_done, "reward": 20.0},
        {"id": "security", "label": "Security Setup", "completed": security_done, "reward": 10.0},
    ]
    completed_tasks_count = sum(1 for t in tasks if t["completed"])
    total_rewards_earned = sum(t["reward"] for t in tasks if t["completed"])
    rewards_progress = round((completed_tasks_count / 5) * 100, 1)
    
    # 4. Calculate Referral Stats (profile-wide)
    from services.referral_service import ensure_referral_profile
    parent_user_doc = db.users.find_one({"_id": ObjectId(parent_id)}) if ObjectId.is_valid(parent_id) else g.current_user
    ref_profile = ensure_referral_profile(parent_user_doc or g.current_user)
    users_invited = int(ref_profile.get("total_invites", 0)) if ref_profile else 0
    referral_earnings = float(ref_profile.get("total_rewards", 0.0)) if ref_profile else 0.0
    referral_code = str(ref_profile.get("referral_code") or (parent_user_doc or user_doc).get("referral_code") or "")
    referral_progress = min(100.0, round((users_invited / 10.0) * 100, 1))

    return success_response(
        message="Overview stats fetched successfully.",
        data={
            "volume_30d": {
                "amount": round(total_volume, 2),
                "saved_fees": saved_fees,
                "current_tier": vip_tier,
                "next_tier": next_vip,
                "tier_name": tier_name,
                "progress_pct": volume_progress,
            },
            "realized_pnl_30d": {
                "amount": total_realized_pnl,
                "currency": "USD",
                "trades_closed": trades_closed_count,
            },
            "rewards": {
                "total_rewards": round(total_rewards_earned, 2),
                "completed_tasks": completed_tasks_count,
                "total_tasks": 5,
                "progress_pct": rewards_progress,
                "max_bonus": 500.0,
            },
            "referrals": {
                "total_invited": users_invited,
                "earnings": round(referral_earnings, 2),
                "rebate_pct": 20,
                "referral_code": referral_code,
                "progress_pct": referral_progress,
            }
        },
        status_code=200
    )


@wallet_api.post("/transfer")
@auth_required
def transfer():
    data = request.get_json(silent=True) or {}
    result = transfer_between_user_wallets(
        g.current_user_id,
        data.get("amount"),
        data.get("direction") or data.get("transfer_direction"),
        data.get("currency"),
    )

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"],
        )

    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"],
    )


@wallet_api.post("/demo-credit")
@auth_required
def demo_credit():
    data = request.get_json(silent=True) or {}
    result = credit_demo_wallet_for_development(g.current_user_id, data.get("amount"))

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"]
    )


@wallet_api.post("/demo-deposit")
@auth_required
def demo_deposit():
    data = request.get_json(silent=True) or {}
    result = create_demo_deposit_for_development(
        g.current_user_id,
        data.get("amount"),
        data.get("crypto_network") or "TRC20",
    )

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"]
    )


@wallet_api.post("/demo-withdraw")
@auth_required
def demo_withdraw():
    data = request.get_json(silent=True) or {}

    settings_check = validate_demo_withdrawal_settings(data.get("amount"))

    if not settings_check["success"]:
        return error_response(
            message=settings_check["message"],
            errors=settings_check["errors"],
            status_code=settings_check["status_code"]
        )

    result = create_demo_withdrawal_for_development(
        g.current_user_id,
        data.get("amount"),
        data.get("crypto_network") or "TRC20",
        data.get("withdrawal_address"),
    )

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"]
    )


@wallet_api.post("/transfer-sub")
@auth_required
def transfer_sub():
    from config.database import get_database
    from models.user_model import find_user_by_id
    from models.wallet_model import find_wallet_by_user_id, normalize_wallet_currency, format_wallet
    from models.ledger_model import create_ledger_entry
    from services.system_settings_service import get_usdt_inr_rate
    from utils.date_helper import now_utc
    from pymongo import ReturnDocument
    from bson import ObjectId
    from utils.security import get_bearer_token
    from utils.jwt_helper import verify_token
    import uuid

    data = request.get_json(silent=True) or {}
    amount_val = data.get("amount")
    try:
        amount = round(float(amount_val or 0.0), 8)
    except (TypeError, ValueError):
        return error_response(message="Invalid transfer amount.", status_code=422)

    if amount <= 0:
        return error_response(message="Transfer amount must be greater than 0.", status_code=422)

    direction = str(data.get("direction") or "").strip().lower()
    if direction not in {"main_to_sub", "sub_to_main", "main_to_trading", "trading_to_main"}:
        return error_response(message="Invalid transfer direction. Use main_to_sub or sub_to_main.", status_code=422)

    if direction == "main_to_trading":
        direction = "main_to_sub"
    elif direction == "trading_to_main":
        direction = "sub_to_main"

    sub_user_id = str(data.get("sub_user_id") or "").strip()
    if not sub_user_id:
        sub_user_id = str(request.headers.get("X-Active-User-Id") or "main")

    # Get the token owner (Main User)
    token = get_bearer_token(request)
    token_result = verify_token(token)
    main_user_id = token_result["data"].get("user_id")

    # Target account validation
    db = get_database()
    target_user = None
    if sub_user_id in ("main", str(main_user_id)):
        target_user = db.users.find_one({"_id": ObjectId(main_user_id)})
        is_sub = False
    else:
        if ObjectId.is_valid(sub_user_id):
            target_user = db.users.find_one({"_id": ObjectId(sub_user_id), "parent_user_id": str(main_user_id)})
            if not target_user:
                target_user = db.users.find_one({"_id": ObjectId(sub_user_id)})
        if not target_user:
            target_user = db.users.find_one({"client_id": sub_user_id, "parent_user_id": str(main_user_id)})
            if not target_user:
                target_user = db.users.find_one({"client_id": sub_user_id})
        is_sub = True

    if not target_user:
        return error_response(message="Target account not found or does not belong to you.", status_code=404)

    target_sub_id = str(target_user["_id"])
    is_demo_account = bool(target_user.get("is_demo") or target_user.get("account_mode") == "demo" or target_user.get("plan") == "demo")
    is_target_mt5 = bool(target_user.get("selected_platform") == "mt5" or target_user.get("platform") == "mt5" or "cent" in str(target_user.get("plan", "")).lower())
    is_cent_account = bool(target_user.get("plan") == "cent" or "cent" in str(target_user.get("plan", "")).lower())

    requested_currency = str(data.get("currency") or "").strip().upper()
    if is_target_mt5 and requested_currency == "INR":
        return error_response(message="MetaTrader 5 accounts only support USDT/USC transfers.", status_code=422)

    # Convert requested USC transfer amount into base USDT
    is_usc_transfer = requested_currency == "USC" or (is_cent_account and bool(data.get("is_usc")))
    if is_usc_transfer:
        amount = round(amount / 100.0, 8)
        if amount <= 0:
            return error_response(message="Transfer amount too small.", status_code=422)

    # Fetch wallets
    main_wallet_doc = db.wallets.find_one({"user_id": str(main_user_id)})
    if not main_wallet_doc:
        return error_response(message="Main wallet not found.", status_code=404)
    main_wallet_doc = normalize_wallet_currency(main_wallet_doc)

    target_wallet_doc = db.wallets.find_one({"user_id": target_sub_id})
    if not target_wallet_doc:
        return error_response(message="Target trading wallet not found.", status_code=404)
    target_wallet_doc = normalize_wallet_currency(target_wallet_doc)

    if requested_currency and requested_currency != "USC":
        primary_currency = requested_currency
    else:
        primary_currency = "USDT" if (is_demo_account or is_target_mt5) else str(main_wallet_doc.get("primary_currency") or "USDT").upper()

    bucket_prefix = "main_wallet_inr" if primary_currency == "INR" else "main_wallet_usdt"
    usdt_rate = float(get_usdt_inr_rate() or 88.50)
    amount_inr = round(amount * usdt_rate, 2)
    reference_id = f"TRF-SUB-{uuid.uuid4().hex[:12].upper()}"

    # Determine if transferring within the sub-account's own main wallet (demo or funded sub-account)
    sub_main_avail = float((target_wallet_doc.get(bucket_prefix) or {}).get("available_balance", 0.0))
    internal_sub_transfer = is_demo_account or (is_sub and sub_main_avail >= amount)

    if direction == "main_to_sub":
        if internal_sub_transfer:
            # Transfer directly from sub-account's own main_wallet -> trading_wallet
            if sub_main_avail < amount:
                return error_response(message=f"Insufficient Main Wallet ({primary_currency}) balance in this account.", status_code=422)

            inc_target = {
                "main_wallet_usdt.available_balance": -amount,
                "main_wallet_usdt.total_balance": -amount,
                "main_wallet.available_balance": -amount,
                "main_wallet.total_balance": -amount,
                "main_wallet_inr.available_balance": -amount_inr,
                "main_wallet_inr.total_balance": -amount_inr,
                "trading_wallet_usdt.available_balance": amount,
                "trading_wallet_usdt.total_balance": amount,
                "trading_wallet.available_balance": amount,
                "trading_wallet.total_balance": amount,
                "trading_wallet_inr.available_balance": amount_inr,
                "trading_wallet_inr.total_balance": amount_inr,
                "available_balance": amount,
                "total_balance": amount,
            }

            res_target = db.wallets.find_one_and_update(
                {"_id": target_wallet_doc["_id"], f"{bucket_prefix}.available_balance": {"$gte": amount}},
                {"$inc": inc_target, "$set": {"updated_at": now_utc()}},
                return_document=ReturnDocument.AFTER
            )
            if not res_target:
                return error_response(message="Transfer failed due to insufficient Main Wallet funds.", status_code=422)

            create_ledger_entry(
                user_id=target_sub_id,
                wallet_id=target_wallet_doc["_id"],
                transaction_type="main_to_trading_transfer",
                direction="transfer",
                amount=amount,
                balance_before=sub_main_avail,
                balance_after=round(sub_main_avail - amount, 8),
                reference_id=reference_id,
                description=f"Transferred ${amount:g} USDT from Main Wallet -> Trading Wallet.",
                currency=primary_currency
            )

            return success_response(
                message="Wallet transfer completed successfully.",
                data={
                    "wallet": format_wallet(res_target),
                    "reference_id": reference_id
                }
            )

        else:
            # Transfer from parent main wallet -> sub trading wallet
            main_wallet_bucket = main_wallet_doc.get(bucket_prefix) or {}
            main_available = round(float(main_wallet_bucket.get("available_balance", 0.0)), 8)
            if main_available < amount:
                return error_response(message=f"Insufficient Main Wallet ({primary_currency}) balance.", status_code=422)

            if primary_currency == "INR":
                usdt_credit = round(amount / usdt_rate, 4)
                inc_main = {
                    "main_wallet_inr.available_balance": -amount,
                    "main_wallet_inr.total_balance": -amount,
                }
                inc_target = {
                    "trading_wallet_inr.available_balance": usdt_credit,
                    "trading_wallet_inr.total_balance": usdt_credit,
                    "trading_wallet.available_balance": usdt_credit,
                    "trading_wallet.total_balance": usdt_credit,
                    "available_balance": usdt_credit,
                    "total_balance": usdt_credit,
                }
                main_desc = f"Transferred ₹{amount:g} INR from Main Wallet -> Sent ${usdt_credit:g} USDT to {target_user.get('name')}'s Trading Wallet (Rate: 1 USDT = ₹{usdt_rate:g} INR)."
                target_desc = f"Received ${usdt_credit:g} USDT in Trading Wallet <- Transferred ₹{amount:g} INR from Main Wallet."
            else:
                inc_main = {
                    "main_wallet_usdt.available_balance": -amount,
                    "main_wallet_usdt.total_balance": -amount,
                    "main_wallet.available_balance": -amount,
                    "main_wallet.total_balance": -amount,
                }
                inc_target = {
                    "trading_wallet_usdt.available_balance": amount,
                    "trading_wallet_usdt.total_balance": amount,
                    "trading_wallet.available_balance": amount,
                    "trading_wallet.total_balance": amount,
                    "available_balance": amount,
                    "total_balance": amount,
                }
                main_desc = f"Transferred ${amount:g} USDT from Main Wallet -> Sent ${amount:g} USDT to {target_user.get('name')}'s Trading Wallet."
                target_desc = f"Received ${amount:g} USDT in Trading Wallet <- Transferred ${amount:g} USDT from Main Wallet."

            res_main = db.wallets.find_one_and_update(
                {"_id": main_wallet_doc["_id"], f"{bucket_prefix}.available_balance": {"$gte": amount}},
                {"$inc": inc_main, "$set": {"updated_at": now_utc()}},
                return_document=ReturnDocument.AFTER
            )
            if not res_main:
                return error_response(message="Transfer failed due to insufficient funds.", status_code=422)

            res_target = db.wallets.find_one_and_update(
                {"_id": target_wallet_doc["_id"]},
                {"$inc": inc_target, "$set": {"updated_at": now_utc()}},
                return_document=ReturnDocument.AFTER
            )

            main_balance_after = round(float(res_main.get(bucket_prefix, {}).get("available_balance", 0.0)), 8)
            create_ledger_entry(
                user_id=main_user_id,
                wallet_id=main_wallet_doc["_id"],
                transaction_type="sub_transfer_debit",
                direction="transfer",
                amount=amount,
                balance_before=round(main_balance_after + amount, 8),
                balance_after=main_balance_after,
                reference_id=reference_id,
                description=main_desc,
                currency=primary_currency
            )

            target_balance_after = round(float(res_target.get("trading_wallet", {}).get("available_balance", 0.0)), 8)
            credit_amt = usdt_credit if primary_currency == "INR" else amount
            create_ledger_entry(
                user_id=target_sub_id,
                wallet_id=target_wallet_doc["_id"],
                transaction_type="sub_transfer_credit",
                direction="transfer",
                amount=credit_amt,
                balance_before=round(target_balance_after - credit_amt, 8),
                balance_after=target_balance_after,
                reference_id=reference_id,
                description=target_desc,
                currency="USDT"
            )

            return success_response(
                message="Sub-account transfer completed successfully.",
                data={
                    "wallet": format_wallet(res_target if is_sub else res_main),
                    "reference_id": reference_id
                }
            )

    else: # direction == "sub_to_main"
        bucket_trading = "trading_wallet_inr" if primary_currency == "INR" else "trading_wallet_usdt"
        trading_bucket = target_wallet_doc.get(bucket_trading) or {}
        target_available = round(float(trading_bucket.get("available_balance", 0.0)), 8)
        
        if target_available < amount:
            return error_response(message=f"Insufficient Trading Wallet ({'INR' if primary_currency == 'INR' else 'USDT'} Margin) balance.", status_code=422)

        if internal_sub_transfer:
            # Transfer directly from sub-account's trading_wallet -> its own main_wallet
            inc_target = {
                "trading_wallet_usdt.available_balance": -amount,
                "trading_wallet_usdt.total_balance": -amount,
                "trading_wallet.available_balance": -amount,
                "trading_wallet.total_balance": -amount,
                "trading_wallet_inr.available_balance": -amount_inr,
                "trading_wallet_inr.total_balance": -amount_inr,
                "available_balance": -amount,
                "total_balance": -amount,
                "main_wallet_usdt.available_balance": amount,
                "main_wallet_usdt.total_balance": amount,
                "main_wallet.available_balance": amount,
                "main_wallet.total_balance": amount,
                "main_wallet_inr.available_balance": amount_inr,
                "main_wallet_inr.total_balance": amount_inr,
            }

            res_target = db.wallets.find_one_and_update(
                {"_id": target_wallet_doc["_id"], f"{bucket_trading}.available_balance": {"$gte": amount}},
                {"$inc": inc_target, "$set": {"updated_at": now_utc()}},
                return_document=ReturnDocument.AFTER
            )
            if not res_target:
                return error_response(message="Transfer failed due to insufficient Trading Wallet funds.", status_code=422)

            create_ledger_entry(
                user_id=target_sub_id,
                wallet_id=target_wallet_doc["_id"],
                transaction_type="trading_to_main_transfer",
                direction="transfer",
                amount=amount,
                balance_before=target_available,
                balance_after=round(target_available - amount, 8),
                reference_id=reference_id,
                description=f"Transferred ${amount:g} USDT from Trading Wallet -> Main Wallet.",
                currency=primary_currency
            )

            return success_response(
                message="Wallet transfer completed successfully.",
                data={
                    "wallet": format_wallet(res_target),
                    "reference_id": reference_id
                }
            )

        else:
            # Transfer from sub trading wallet -> parent main wallet
            if primary_currency == "INR":
                inr_credit = round(amount * usdt_rate, 2)
                inc_target = {
                    "trading_wallet_inr.available_balance": -amount,
                    "trading_wallet_inr.total_balance": -amount,
                    "trading_wallet.available_balance": -amount,
                    "trading_wallet.total_balance": -amount,
                    "available_balance": -amount,
                    "total_balance": -amount,
                }
                inc_main = {
                    "main_wallet_inr.available_balance": inr_credit,
                    "main_wallet_inr.total_balance": inr_credit,
                }
                main_desc = f"Received ₹{inr_credit:g} INR in Main Wallet <- Transferred ${amount:g} USDT from {target_user.get('name')}'s Trading Wallet (Rate: 1 USDT = ₹{usdt_rate:g} INR)."
                target_desc = f"Transferred ${amount:g} USDT from Trading Wallet -> Sent ₹{inr_credit:g} INR to Main Wallet."
            else:
                inc_target = {
                    "trading_wallet_usdt.available_balance": -amount,
                    "trading_wallet_usdt.total_balance": -amount,
                    "trading_wallet.available_balance": -amount,
                    "trading_wallet.total_balance": -amount,
                    "available_balance": -amount,
                    "total_balance": -amount,
                }
                inc_main = {
                    "main_wallet_usdt.available_balance": amount,
                    "main_wallet_usdt.total_balance": amount,
                    "main_wallet.available_balance": amount,
                    "main_wallet.total_balance": amount,
                }
                main_desc = f"Received ${amount:g} USDT in Main Wallet <- Transferred ${amount:g} USDT from {target_user.get('name')}'s Trading Wallet."
                target_desc = f"Transferred ${amount:g} USDT from Trading Wallet -> Sent ${amount:g} USDT to Main Wallet."

            res_target = db.wallets.find_one_and_update(
                {"_id": target_wallet_doc["_id"], f"{bucket_trading}.available_balance": {"$gte": amount}},
                {"$inc": inc_target, "$set": {"updated_at": now_utc()}},
                return_document=ReturnDocument.AFTER
            )
            if not res_target:
                return error_response(message="Transfer failed due to insufficient funds in trading wallet.", status_code=422)

            res_main = db.wallets.find_one_and_update(
                {"_id": main_wallet_doc["_id"]},
                {"$inc": inc_main, "$set": {"updated_at": now_utc()}},
                return_document=ReturnDocument.AFTER
            )

            target_balance_after = round(float(res_target.get("trading_wallet", {}).get("available_balance", 0.0)), 8)
            create_ledger_entry(
                user_id=target_sub_id,
                wallet_id=target_wallet_doc["_id"],
                transaction_type="sub_transfer_debit",
                direction="transfer",
                amount=amount,
                balance_before=round(target_balance_after + amount, 8),
                balance_after=target_balance_after,
                reference_id=reference_id,
                description=target_desc,
                currency="USDT"
            )

            main_balance_after = round(float(res_main.get(bucket_prefix, {}).get("available_balance", 0.0)), 8)
            credit_amt = inr_credit if primary_currency == "INR" else amount
            create_ledger_entry(
                user_id=main_user_id,
                wallet_id=main_wallet_doc["_id"],
                transaction_type="sub_transfer_credit",
                direction="transfer",
                amount=credit_amt,
                balance_before=round(main_balance_after - credit_amt, 8),
                balance_after=main_balance_after,
                reference_id=reference_id,
                description=main_desc,
                currency=primary_currency
            )

            return success_response(
                message="Sub-account transfer completed successfully.",
                data={
                    "wallet": format_wallet(res_main),
                    "target_wallet": format_wallet(res_target),
                    "reference_id": reference_id
                }
            )


@wallet_api.post("/exchange")
@auth_required
def exchange_assets():
    try:
        data = request.get_json(silent=True) or {}
        from_asset = data.get("from_asset")
        to_asset = data.get("to_asset")
        amount = data.get("amount")
        execute = data.get("execute", False)

        from services.wallet_service import exchange_user_assets
        result = exchange_user_assets(
            user_id=g.current_user_id,
            from_asset=from_asset,
            to_asset=to_asset,
            amount=amount,
            execute=execute,
        )

        if result.get("success"):
            return success_response(
                message=result.get("message", "Success"),
                data=result.get("data", {}),
                status_code=result.get("status_code", 200),
            )
        
        return error_response(
            message=result.get("message", "Exchange failed."),
            errors=result.get("errors", {}),
            status_code=result.get("status_code", 400),
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error_response(message=f"Exchange processing error: {str(e)}", status_code=500)


@wallet_api.post("/internal-transfer")
@auth_required
def internal_transfer():
    try:
        data = request.get_json(silent=True) or {}
        asset = data.get("asset")
        recipient_info = data.get("recipient_info") or data.get("recipient")
        amount = data.get("amount")

        from services.wallet_service import internal_transfer_between_users
        result = internal_transfer_between_users(
            sender_id=g.current_user_id,
            recipient_info=recipient_info,
            amount=amount,
            asset=asset
        )

        if result.get("success"):
            return success_response(
                message=result.get("message"),
                data=result.get("data"),
                status_code=result.get("status_code", 200)
            )

        return error_response(
            message=result.get("message", "Internal transfer failed."),
            errors=result.get("errors", {}),
            status_code=result.get("status_code", 400)
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error_response(message=f"Internal transfer processing error: {str(e)}", status_code=500)


@wallet_api.get("/lookup-recipient")
@auth_required
def lookup_recipient():
    try:
        query = request.args.get("query", "").strip()
        if not query:
            return error_response(message="Query parameter is required.", status_code=400)
            
        from config.database import get_database
        db = get_database()
        
        # 1. Match by Email (case-insensitive)
        recipient_user = db.users.find_one({"email": query.lower()}) or db.users.find_one({"email": query})
        
        # 2. Match by Client ID
        if not recipient_user:
            recipient_user = db.users.find_one({"client_id": query})
            
        # 3. Match by Crypto Address
        matched_other_asset = None
        if not recipient_user:
            active_asset = request.args.get("asset", "").strip().upper()
            or_queries = []
            NETWORKS = ["TRC20", "ERC20", "BEP20", "BITCOIN", "SOLANA", "RIPPLE", "CARDANO", "INTERNAL"]
            
            if active_asset:
                assets_to_check = [active_asset]
            else:
                assets_to_check = ["INR", "USDT", "BTC", "ETH", "SOL", "USDC", "BNB", "XRP", "ADA"]
                
            for asset in assets_to_check:
                asset_lower = asset.lower()
                for net in NETWORKS:
                    or_queries.append({f"main_wallet_{asset_lower}.addresses.{net}": query})
            
            matched_wallet = db.wallets.find_one({"$or": or_queries})
            
            # If not matched for active asset, check if it matches another asset
            if not matched_wallet and active_asset:
                other_queries = []
                other_assets = ["INR", "USDT", "BTC", "ETH", "SOL", "USDC", "BNB", "XRP", "ADA"]
                if active_asset in other_assets:
                    other_assets.remove(active_asset)
                for asset in other_assets:
                    asset_lower = asset.lower()
                    for net in NETWORKS:
                        other_queries.append({f"main_wallet_{asset_lower}.addresses.{net}": query})
                
                matched_other = db.wallets.find_one({"$or": other_queries})
                if matched_other:
                    for asset in other_assets:
                        asset_lower = asset.lower()
                        for net in NETWORKS:
                            addr_val = ((matched_other.get(f"main_wallet_{asset_lower}") or {}).get("addresses") or {}).get(net)
                            if addr_val == query:
                                matched_other_asset = asset
                                break
                        if matched_other_asset:
                            break
                            
            if matched_wallet:
                user_id = matched_wallet.get("user_id")
                from bson import ObjectId
                try:
                    recipient_user = db.users.find_one({"_id": ObjectId(user_id)})
                except Exception:
                    recipient_user = db.users.find_one({"client_id": user_id})

        if not recipient_user:
            if matched_other_asset:
                return success_response(
                    message=f"Address belongs to another asset ({matched_other_asset}).",
                    data={"found": False, "matched_different_asset": matched_other_asset}
                )
            return success_response(message="Recipient not found.", data={"found": False})

        email = recipient_user.get("email", "")
        masked_email = ""
        if "@" in email:
            parts = email.split("@")
            masked_email = parts[0][:3] + "***@" + parts[1] if len(parts[0]) > 3 else parts[0] + "***@" + parts[1]
        else:
            masked_email = email

        return success_response(
            message="Recipient found.",
            data={
                "found": True,
                "name": recipient_user.get("name", "Unknown"),
                "email": masked_email,
                "client_id": recipient_user.get("client_id", "")
            }
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error_response(message=f"Recipient lookup processing error: {str(e)}", status_code=500)
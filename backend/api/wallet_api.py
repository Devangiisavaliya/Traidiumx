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
    result = get_wallet_balance(g.current_user_id)

    parent_user_id = g.current_user.get("parent_user_id")
    if parent_user_id and result.get("success") and "wallet" in result.get("data", {}):
        parent_result = get_wallet_balance(parent_user_id)
        if parent_result.get("success") and "wallet" in parent_result.get("data", {}):
            parent_wallet = parent_result["data"]["wallet"]
            sub_wallet = result["data"]["wallet"]
            
            # Merge parent's main wallet values into sub-account wallet response
            sub_wallet["main_wallet"] = parent_wallet.get("main_wallet")
            sub_wallet["main_wallet_inr"] = parent_wallet.get("main_wallet_inr")
            sub_wallet["main_wallet_usdt"] = parent_wallet.get("main_wallet_usdt")
            sub_wallet["deposit_wallet"] = parent_wallet.get("deposit_wallet")
            sub_wallet["withdrawal_wallet"] = parent_wallet.get("withdrawal_wallet")
            sub_wallet["currency"] = parent_wallet.get("currency")
            sub_wallet["primary_currency"] = parent_wallet.get("primary_currency")
            sub_wallet["is_currency_locked"] = parent_wallet.get("is_currency_locked")

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )



@wallet_api.get("/ledger")
@auth_required
def ledger():
    user_id = str(g.current_user["_id"])
    sub_account_id = request.args.get("sub_account_id")

    if sub_account_id:
        from bson import ObjectId
        db = get_database()
        
        user_doc = db.users.find_one({"_id": ObjectId(user_id)})
        if not user_doc:
            return error_response(message="User not found.", status_code=404)

        actual_parent_id = user_doc.get("parent_user_id") or user_id

        # Verify that sub_account_id belongs to a sub-account owned by the parent
        sub_user = db.users.find_one({
            "_id": ObjectId(sub_account_id),
            "parent_user_id": actual_parent_id
        })
        if not sub_user:
            return error_response(
                message="Unauthorized: This sub-account does not belong to your account.",
                status_code=403
            )
        # Use sub-account user ID to load ledger
        user_id = sub_account_id

    result = get_wallet_ledger_history(user_id)

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
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
    if direction not in {"main_to_sub", "sub_to_main"}:
        return error_response(message="Invalid transfer direction. Use main_to_sub or sub_to_main.", status_code=422)

    sub_user_id = str(data.get("sub_user_id") or "").strip()
    if not sub_user_id:
        return error_response(message="Sub-account ID is required.", status_code=422)

    # Get the token owner (Main User)
    token = get_bearer_token(request)
    token_result = verify_token(token)
    main_user_id = token_result["data"].get("user_id")

    # Target account validation
    db = get_database()
    if sub_user_id == "main" or sub_user_id == main_user_id:
        target_user = db.users.find_one({"_id": ObjectId(main_user_id)})
        is_sub = False
    else:
        target_user = db.users.find_one({"_id": ObjectId(sub_user_id), "parent_user_id": str(main_user_id)})
        is_sub = True

    if not target_user:
        return error_response(message="Target account not found or does not belong to you.", status_code=404)

    # Fetch wallets
    main_wallet_doc = db.wallets.find_one({"user_id": str(main_user_id)})
    if not main_wallet_doc:
        return error_response(message="Main wallet not found.", status_code=404)
    main_wallet_doc = normalize_wallet_currency(main_wallet_doc)

    target_wallet_doc = db.wallets.find_one({"user_id": str(sub_user_id) if is_sub else str(main_user_id)})
    if not target_wallet_doc:
        return error_response(message="Target trading wallet not found.", status_code=404)
    target_wallet_doc = normalize_wallet_currency(target_wallet_doc)

    requested_currency = str(data.get("currency") or "").strip().upper()
    if requested_currency:
        primary_currency = requested_currency
    else:
        if target_user.get("is_inr_trading_account"):
            primary_currency = "INR"
        else:
            primary_currency = str(main_wallet_doc.get("primary_currency") or "INR").upper()

    bucket_prefix = "main_wallet_inr" if primary_currency == "INR" else "main_wallet_usdt"
    main_wallet_bucket = main_wallet_doc.get(bucket_prefix) or {}
    usdt_rate = float(get_usdt_inr_rate() or 88.50)
    
    reference_id = f"TRF-SUB-{uuid.uuid4().hex[:12].upper()}"

    if direction == "main_to_sub":
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
            user_id=str(target_user["_id"]),
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

    else: # direction == "sub_to_main"
        bucket_trading = "trading_wallet_inr" if primary_currency == "INR" else "trading_wallet_usdt"
        trading_bucket = target_wallet_doc.get(bucket_trading) or {}
        target_available = round(float(trading_bucket.get("available_balance", 0.0)), 8)
        
        if target_available < amount:
            return error_response(message=f"Insufficient Trading Wallet ({'INR' if primary_currency == 'INR' else 'USDT'} Margin) balance.", status_code=422)
 
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
            user_id=str(target_user["_id"]),
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

    updated_main_wallet = db.wallets.find_one({"user_id": str(main_user_id)})
    return success_response(
        message="Sub-account transfer completed successfully.",
        data={
            "wallet": format_wallet(updated_main_wallet),
            "reference_id": reference_id
        }
    )
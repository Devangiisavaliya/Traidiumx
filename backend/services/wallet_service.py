import uuid
from datetime import datetime, timezone

from pymongo import ReturnDocument

from config.settings import settings
from models.deposit_model import create_deposit, find_deposit_by_id, format_deposit, update_deposit_status
from models.ledger_model import create_ledger_entry, format_ledger_items, get_user_ledger, get_wallet_ledger_collection
from models.withdrawal_model import create_withdrawal, find_withdrawal_by_id, format_withdrawal, update_withdrawal_status
from services.fee_service import calculate_account_platform_fee, calculate_withdrawal_fee_breakdown
from services.kyc_status_service import require_kyc_approved
from models.wallet_model import (
    MAIN_WALLET,
    TRADING_WALLET,
    create_default_wallet,
    find_wallet_by_user_id,
    format_wallet,
    get_wallets_collection,
    normalize_wallet_currency,
    ensure_admin_profit_wallet,
)
from utils.date_helper import now_utc


WALLET_PRECISION = 8


def _money(value):
    return round(float(value or 0.0), WALLET_PRECISION)


def _platform_fee_cycle_start(cycle):
    now = datetime.now(timezone.utc)
    cycle_key = str(cycle or "one_time").strip().lower()

    if cycle_key == "daily":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)

    if cycle_key == "monthly":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    return None


def _platform_fee_cycle_marker(cycle):
    now = datetime.now(timezone.utc)
    cycle_key = str(cycle or "one_time").strip().lower()

    if cycle_key == "daily":
        return now.strftime("%Y-%m-%d")

    if cycle_key == "monthly":
        return now.strftime("%Y-%m")

    return "one_time"


def _platform_fee_already_charged(user_id, cycle):
    query = {
        "user_id": str(user_id),
        "transaction_type": "platform_fee_debit",
        "reference_id": {"$regex": "^PF-"},
        "status": "completed",
    }

    cycle_start = _platform_fee_cycle_start(cycle)
    if cycle_start is not None:
        query["created_at"] = {"$gte": cycle_start}

    return get_wallet_ledger_collection().count_documents(query, limit=1) > 0


def _platform_fee_marker_filter(cycle):
    cycle_key = str(cycle or "one_time").strip().lower()
    marker = _platform_fee_cycle_marker(cycle_key)

    if cycle_key == "one_time":
        return {
            "$or": [
                {"account_platform_fee_one_time_charged_at": {"$exists": False}},
                {"account_platform_fee_one_time_charged_at": None},
            ]
        }

    return {
        "$or": [
            {"account_platform_fee_last_cycle_key": {"$exists": False}},
            {"account_platform_fee_last_cycle_key": {"$ne": marker}},
        ]
    }


def _platform_fee_marker_update(cycle, reference_id):
    cycle_key = str(cycle or "one_time").strip().lower()
    marker = _platform_fee_cycle_marker(cycle_key)
    now = now_utc()

    update = {
        "account_platform_fee_last_charged_at": now,
        "account_platform_fee_last_reference_id": reference_id,
        "account_platform_fee_last_cycle": cycle_key,
        "account_platform_fee_last_cycle_key": marker,
        "updated_at": now,
    }

    if cycle_key == "one_time":
        update["account_platform_fee_one_time_charged_at"] = now
        update["account_platform_fee_one_time_reference_id"] = reference_id

    return update


def _sync_platform_fee_marker_if_ledger_exists(user_id, cycle):
    """Prevent a second debit for users charged before marker fields existed."""
    if not _platform_fee_already_charged(user_id, cycle):
        return False

    get_wallets_collection().update_one(
        {"user_id": str(user_id)},
        {"$set": _platform_fee_marker_update(cycle, "legacy-ledger-sync")},
    )
    return True


def apply_account_platform_fee_if_due(user_id, trigger="wallet_access"):
    """Charge separate Platform Fee when due without touching Trading Fee.

    This uses an atomic wallet update marker so simultaneous wallet balance and
    wallet ledger requests cannot charge the same one-time/daily/monthly fee
    twice. Trading Fee remains handled only by futures/options execution.
    """
    wallet = ensure_user_wallet(user_id)
    fee_info = calculate_account_platform_fee(wallet.get("available_balance", 0.0))
    fee_amount = _money(fee_info.get("platform_fee_usdt", 0.0))
    cycle = fee_info.get("cycle", "one_time")

    if not fee_info.get("enabled") or fee_amount <= 0:
        return {"success": True, "charged": False, "reason": "disabled", "wallet": wallet, "fee": fee_info}

    # Old versions only wrote ledger entries, not wallet marker fields. Sync that
    # state first so one-time/daily/monthly Platform Fee never repeats.
    if _sync_platform_fee_marker_if_ledger_exists(user_id, cycle):
        wallet = ensure_user_wallet(user_id)
        return {"success": True, "charged": False, "reason": "already_charged", "wallet": wallet, "fee": fee_info}

    primary_currency = str(wallet.get("primary_currency") or "INR").upper()

    from services.system_settings_service import get_usdt_inr_rate
    usdt_rate = float(get_usdt_inr_rate() or 88.50)

    fee_in_currency = fee_amount
    if primary_currency == "INR":
        fee_in_currency = _money(fee_amount * usdt_rate)

    main_wallet = wallet.get("main_wallet") or {}
    main_available = _money(main_wallet.get("available_balance", 0.0))

    if main_available < fee_in_currency:
        return {
            "success": False,
            "charged": False,
            "reason": "insufficient_available_balance",
            "message": "Insufficient available balance for platform fee.",
            "wallet": wallet,
            "fee": fee_info,
        }

    reference_id = f"PF-{str(cycle).upper()}-{uuid.uuid4().hex[:10].upper()}"
    marker_filter = _platform_fee_marker_filter(cycle)
    marker_update = _platform_fee_marker_update(cycle, reference_id)

    query = {
        "user_id": str(user_id),
        "main_wallet.available_balance": {"$gte": fee_in_currency},
        **marker_filter,
    }
    update = {
        "$inc": {
            "main_wallet.available_balance": -fee_in_currency,
            "main_wallet.total_balance": -fee_in_currency,
        },
        "$set": marker_update,
    }

    wallet_before = get_wallets_collection().find_one_and_update(
        query,
        update,
        return_document=ReturnDocument.BEFORE,
    )

    if not wallet_before:
        wallet_now = ensure_user_wallet(user_id)
        if _sync_platform_fee_marker_if_ledger_exists(user_id, cycle):
            wallet_now = ensure_user_wallet(user_id)
            return {"success": True, "charged": False, "reason": "already_charged", "wallet": wallet_now, "fee": fee_info}

        main_wallet_now = wallet_now.get("main_wallet") or {}
        main_available_now = _money(main_wallet_now.get("available_balance", 0.0))
        if main_available_now < fee_in_currency:
            return {
                "success": False,
                "charged": False,
                "reason": "insufficient_available_balance",
                "message": "Insufficient available balance for platform fee.",
                "wallet": wallet_now,
                "fee": fee_info,
            }

        return {"success": True, "charged": False, "reason": "already_charged", "wallet": wallet_now, "fee": fee_info}

    balance_before = _money(wallet_before.get("main_wallet", {}).get("available_balance", 0.0))
    balance_after = _money(balance_before - fee_in_currency)
    description = (
        f"Platform fee charged ({str(cycle).replace('_', ' ')}) from admin settings. "
        f"Trigger: {trigger}."
    )

    create_ledger_entry(
        user_id=user_id,
        wallet_id=wallet_before.get("_id"),
        transaction_type="platform_fee_debit",
        direction="debit",
        amount=fee_in_currency,
        balance_before=balance_before,
        balance_after=balance_after,
        reference_id=reference_id,
        description=description,
        currency=primary_currency,
    )

    if fee_in_currency > 0:
        try:
            credit_admin_profit_wallet(
                amount=fee_in_currency,
                transaction_type="platform_fee_profit",
                reference_id=reference_id,
                description=f"Admin profit from platform fee ({str(cycle).replace('_', ' ')}) for user {user_id}.",
                currency=primary_currency,
            )
        except Exception as error:
            print(f"Warning: admin platform-fee profit credit failed for user {user_id}: {error}")

    wallet_after = ensure_user_wallet(user_id)
    return {
        "success": True,
        "charged": True,
        "message": "Platform fee charged successfully.",
        "wallet": wallet_after,
        "fee": fee_info,
        "reference_id": reference_id,
    }


def ensure_user_wallet(user_id):
    wallet = find_wallet_by_user_id(user_id)

    if wallet:
        return normalize_wallet_currency(wallet)

    create_default_wallet(user_id)
    return find_wallet_by_user_id(user_id)


def get_wallet_balance(user_id):
    platform_fee_result = apply_account_platform_fee_if_due(user_id, "wallet_balance")
    wallet = ensure_user_wallet(user_id)

    return {
        "success": True,
        "message": "Wallet balance fetched successfully.",
        "data": {
            "wallet": format_wallet(wallet),
            "platform_fee": {
                "charged": bool(platform_fee_result.get("charged")),
                "amount": _money((platform_fee_result.get("fee") or {}).get("platform_fee_usdt", 0.0)),
                "cycle": (platform_fee_result.get("fee") or {}).get("cycle"),
                "reason": platform_fee_result.get("reason"),
            },
        },
        "status_code": 200,
    }


def get_wallet_ledger_history(user_id):
    platform_fee_result = apply_account_platform_fee_if_due(user_id, "wallet_ledger")
    wallet = ensure_user_wallet(user_id)
    ledger_items = get_user_ledger(user_id)

    return {
        "success": True,
        "message": "Wallet ledger fetched successfully.",
        "data": {
            "wallet": format_wallet(wallet),
            "ledger": format_ledger_items(ledger_items),
            "platform_fee": {
                "charged": bool(platform_fee_result.get("charged")),
                "amount": _money((platform_fee_result.get("fee") or {}).get("platform_fee_usdt", 0.0)),
                "cycle": (platform_fee_result.get("fee") or {}).get("cycle"),
                "reason": platform_fee_result.get("reason"),
            },
        },
        "status_code": 200,
    }


def _development_guard(feature_name):
    if settings.APP_ENV != "development":
        return {
            "success": False,
            "message": f"{feature_name} is allowed only in development mode.",
            "errors": {"environment": settings.APP_ENV},
            "status_code": 403,
        }
    return None


def _validate_demo_wallet_amount(amount, action_label):
    try:
        amount = _money(amount)
    except (TypeError, ValueError):
        amount = 0.0

    if amount < 10:
        return amount, {
            "success": False,
            "message": f"Minimum demo {action_label} amount is 10 USDT.",
            "errors": {"amount": f"Minimum demo {action_label} amount is 10 USDT."},
            "status_code": 422,
        }

    if amount > 1000000:
        return amount, {
            "success": False,
            "message": f"Maximum demo {action_label} amount is 1000000 USDT.",
            "errors": {"amount": f"Maximum demo {action_label} amount is 1000000 USDT."},
            "status_code": 422,
        }

    return amount, None


def _clean_demo_network(network):
    value = str(network or "TRC20").strip().upper()
    return value if value in ["TRC20", "ERC20", "BEP20"] else "TRC20"


def _demo_deposit_address(network):
    return {
        "TRC20": "TDEmoDepositAddress1111111111111111111",
        "ERC20": "0x1111111111111111111111111111111111111111",
        "BEP20": "0x2222222222222222222222222222222222222222",
    }.get(network, "TDEmoDepositAddress1111111111111111111")


def _demo_withdrawal_address(network, address=None):
    clean_address = str(address or "").strip()
    if clean_address:
        return clean_address
    return {
        "TRC20": "TDEmoWithdrawalAddress111111111111111111",
        "ERC20": "0x3333333333333333333333333333333333333333",
        "BEP20": "0x4444444444444444444444444444444444444444",
    }.get(network, "TDEmoWithdrawalAddress111111111111111111")


def create_demo_deposit_for_development(user_id, amount, crypto_network="TRC20"):
    guard = _development_guard("Demo wallet deposit")
    if guard:
        return guard

    amount, error = _validate_demo_wallet_amount(amount, "deposit")
    if error:
        return error

    crypto_network = _clean_demo_network(crypto_network)
    deposit_reference = f"DEMO-DEP-{uuid.uuid4().hex[:12].upper()}"
    tx_hash = f"DEMO{uuid.uuid4().hex.upper()}"

    deposit_id = create_deposit(
        {
            "user_id": str(user_id),
            "deposit_reference": deposit_reference,
            "gateway_order_id": f"DEV-DEMO-DEPOSIT-{deposit_reference}",
            "amount": amount,
            "currency": "USDT",
            "status": "processing_demo_credit",
            "payment_method": "demo_crypto_deposit",
            "gateway": "development_demo_wallet",
            "gateway_payment_id": tx_hash,
            "crypto_asset": "USDT",
            "crypto_network": crypto_network,
            "deposit_address": _demo_deposit_address(crypto_network),
            "tx_hash": tx_hash,
            "explorer_url": "",
            "verification_status": "development_demo_verified",
            "verification_message": "Development demo deposit created for presentation only.",
            "confirmations": 0,
            "required_confirmations": 0,
            "verified_amount": amount,
            "verified_to_address": _demo_deposit_address(crypto_network),
            "risk_note": "Demo-only database entry. No real blockchain, UPI, bank, or payment gateway transaction occurred.",
            "remark": "Demo deposit created and wallet credited through wallet ledger.",
            "is_demo": True,
        }
    )

    wallet = credit_main_wallet(
        user_id=user_id,
        amount=amount,
        transaction_type="demo_deposit_credit",
        reference_id=str(deposit_id),
        description=f"Demo USDT deposit credited for presentation. Reference {deposit_reference}",
    )

    deposit = update_deposit_status(
        str(deposit_id),
        "completed",
        {
            "credited_at": now_utc(),
            "wallet_after_credit": {
                "available_balance": (wallet.get("main_wallet") or {}).get("available_balance", wallet.get("available_balance", 0.0)),
                "locked_balance": (wallet.get("main_wallet") or {}).get("locked_balance", 0.0),
                "total_balance": (wallet.get("main_wallet") or {}).get("total_balance", wallet.get("total_balance", 0.0)),
                "wallet_type": "main_wallet",
            },
        },
    ) or find_deposit_by_id(str(deposit_id))

    return {
        "success": True,
        "message": "Demo deposit added successfully. Deposit history and wallet ledger entries were saved in database.",
        "data": {
            "wallet": format_wallet(wallet),
            "deposit": format_deposit(deposit),
            "reference_id": str(deposit_id),
            "demo_mode": True,
        },
        "status_code": 200,
    }


def debit_available_wallet(user_id, amount, transaction_type, reference_id=None, description=""):
    wallet = ensure_user_wallet(user_id)
    amount = _money(amount)

    if amount <= 0:
        return {"success": False, "message": "Amount must be greater than 0.", "wallet": wallet}

    updated_wallet = _atomic_update_wallet(
        wallet_id=wallet["_id"],
        filter_extra={"available_balance": {"$gte": amount}},
        inc_data={
            "available_balance": -amount,
            "total_balance": -amount,
            "trading_wallet.available_balance": -amount,
            "trading_wallet.total_balance": -amount,
        },
    )

    if not updated_wallet:
        return {
            "success": False,
            "message": "Insufficient available balance.",
            "wallet": ensure_user_wallet(user_id),
        }

    balance_after = _money(updated_wallet.get("available_balance", 0.0))
    balance_before = _money(balance_after + amount)

    create_ledger_entry(
        user_id=user_id,
        wallet_id=wallet["_id"],
        transaction_type=transaction_type,
        direction="debit",
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        reference_id=reference_id,
        description=description,
    )

    return {"success": True, "message": "Amount debited successfully.", "wallet": ensure_user_wallet(user_id)}


def create_demo_withdrawal_for_development(user_id, amount, crypto_network="TRC20", withdrawal_address=None):
    kyc_restriction = require_kyc_approved(user_id, "demo withdrawal")
    if kyc_restriction:
        return kyc_restriction

    """Create a demo withdrawal request that still requires admin approval.

    Demo withdrawals now use the same admin-configured withdrawal fee and
    network-fee calculation as the live crypto-withdrawal flow. This keeps
    project testing accurate without changing the existing approval process.
    """
    guard = _development_guard("Demo wallet withdrawal request")
    if guard:
        return guard

    amount, error = _validate_demo_wallet_amount(amount, "withdrawal")
    if error:
        return error

    wallet = ensure_user_wallet(user_id)
    user_primary_currency = str((wallet or {}).get("primary_currency") or "INR").upper()
    is_inr = (user_primary_currency == "INR")

    if is_inr:
        withdrawal_method = "demo_inr_withdrawal"
        crypto_asset = "INR"
        crypto_network = "UPI/BANK"
        req_currency = "INR"
        req_tx_type = "demo_inr_withdrawal_request_lock"
        unit_sym = "₹"
        address_val = withdrawal_address if withdrawal_address else "UPI/BANK PAYOUT"
    else:
        withdrawal_method = "demo_crypto_withdrawal"
        crypto_asset = "USDT"
        crypto_network = _clean_demo_network(crypto_network)
        req_currency = "USDT"
        req_tx_type = "demo_withdrawal_request_lock"
        unit_sym = "$"
        address_val = _demo_withdrawal_address(crypto_network, withdrawal_address)

    fee_breakdown = calculate_withdrawal_fee_breakdown(amount, crypto_network)
    network_fee = _money(fee_breakdown.get("network_fee_usdt", 0.0))
    withdrawal_fee = _money(fee_breakdown.get("withdrawal_fee_usdt", 0.0))
    total_fee = _money(fee_breakdown.get("total_fee_usdt", network_fee + withdrawal_fee))
    # The user-entered amount is the total wallet debit/lock. Fees are deducted
    # from it, so request 100 with fees 3 pays out 97 and locks/debits 100.
    locked_amount = _money(amount)
    payout_amount = _money(max(amount - total_fee, 0.0))

    if total_fee > 0 and payout_amount <= 0:
        return {
            "success": False,
            "message": "Withdrawal amount must be greater than total fees.",
            "errors": {"amount": "Withdrawal amount must be greater than total fees."},
            "status_code": 422,
        }

    main_wallet = wallet.get("main_wallet") or {}
    available_balance = _money(main_wallet.get("available_balance", 0.0))
    if available_balance < locked_amount:
        return {
            "success": False,
            "message": "Insufficient Main Wallet balance for withdrawal amount.",
            "errors": {"wallet": "Insufficient Main Wallet balance for withdrawal amount."},
            "status_code": 422,
        }

    from admin.settings_routes import get_final_settings
    system_settings = get_final_settings()
    min_main_balance = _money(system_settings.get("min_main_wallet_balance", 0.0))

    if min_main_balance > 0:
        usdt_rate = float(system_settings.get("usdt_inr_rate", 88.50) or 88.50)
        min_required = min_main_balance * usdt_rate if is_inr else min_main_balance
        if available_balance - locked_amount < min_required:
            unit_label = f"₹{min_required:g} INR" if is_inr else f"${min_main_balance:g} USDT"
            return {
                "success": False,
                "message": f"Cannot withdraw. Enforced minimum Main Wallet balance of {unit_label} must be maintained.",
                "errors": {"amount": f"Main Wallet balance must not fall below the required minimum of {unit_label}."},
                "status_code": 422,
            }

    withdrawal_reference = f"DEMO-WD-{uuid.uuid4().hex[:12].upper()}"

    withdrawal_id = create_withdrawal(
        {
            "user_id": str(user_id),
            "withdrawal_reference": withdrawal_reference,
            "amount": amount,
            "currency": req_currency,
            "withdrawal_method": withdrawal_method,
            "crypto_asset": crypto_asset,
            "crypto_network": crypto_network,
            "withdrawal_address": address_val,
            "destination_tag": "",
            "network_fee": network_fee,
            "withdrawal_fee": withdrawal_fee,
            "total_fee": total_fee,
            "final_amount": payout_amount,
            "fee_breakdown": fee_breakdown,
            "locked_amount": locked_amount,
            "fees_deducted_from_amount": True,
            "status": "pending_admin_approval",
            "processing_mode": "admin_approval_required",
            "remark": "Demo withdrawal request created. Requested amount is locked; fees are deducted from that amount and payout happens only after admin approval.",
            "payout_reference": "",
            "tx_hash": "",
            "explorer_url": "",
            "risk_note": "Demo-only request. No final payout/debit happens until admin approves it.",
            "is_demo": True,
        }
    )

    lock_result = lock_main_wallet_amount(
        user_id=user_id,
        amount=locked_amount,
        transaction_type=req_tx_type,
        reference_id=str(withdrawal_id),
        description=(
            f"Demo {req_currency} withdrawal request locked for admin approval. "
            f"Reference {withdrawal_reference}. Payout {unit_sym}{payout_amount:g} {req_currency}, "
            f"company fee {unit_sym}{withdrawal_fee:g} {req_currency}, network fee {unit_sym}{network_fee:g} {req_currency}."
        ),
        currency=req_currency,
    )

    if not lock_result["success"]:
        update_withdrawal_status(str(withdrawal_id), "failed", {"remark": lock_result["message"]})
        return {
            "success": False,
            "message": lock_result["message"],
            "errors": {"wallet": lock_result["message"]},
            "status_code": 422,
        }

    withdrawal = find_withdrawal_by_id(str(withdrawal_id))

    return {
        "success": True,
        "message": "Withdrawal request created. Requested amount is locked; fees will be deducted from it on payout.",
        "data": {
            "wallet": format_wallet(lock_result["wallet"]),
            "withdrawal": format_withdrawal(withdrawal),
            "reference_id": str(withdrawal_id),
            "admin_approval_required": True,
            "demo_mode": True,
            "fee_breakdown": fee_breakdown,
        },
        "status_code": 201,
    }

def credit_demo_wallet_for_development(user_id, amount):
    # Backward-compatible endpoint used by the earlier demo button.
    return create_demo_deposit_for_development(user_id, amount, "TRC20")

def update_wallet_balances(wallet_id, available_balance, locked_balance):
    available_balance = _money(available_balance)
    locked_balance = _money(locked_balance)
    total_balance = _money(available_balance + locked_balance)

    get_wallets_collection().update_one(
        {"_id": wallet_id},
        {
            "$set": {
                "available_balance": available_balance,
                "locked_balance": locked_balance,
                "total_balance": total_balance,
                "trading_wallet.available_balance": available_balance,
                "trading_wallet.locked_balance": locked_balance,
                "trading_wallet.total_balance": total_balance,
                "updated_at": now_utc(),
            }
        },
    )


def _atomic_update_wallet(wallet_id, filter_extra, inc_data):
    filter_query = {"_id": wallet_id}
    filter_query.update(filter_extra or {})

    # Detect current active currency to sync sub-bucket increments
    try:
        from flask import request
        active_currency = str(request.headers.get("X-Navbar-Currency") or "USDT").strip().upper()
    except Exception:
        active_currency = "USDT"

    bucket_suffix = "inr" if active_currency == "INR" else "usdt"
    
    # Clone inc_data to avoid side-effects
    inc_data = dict(inc_data or {})
    extra_inc = {}
    for key, val in inc_data.items():
        if key.startswith("trading_wallet."):
            sub_key = key.replace("trading_wallet.", f"trading_wallet_{bucket_suffix}.")
            extra_inc[sub_key] = val
    inc_data.update(extra_inc)

    return get_wallets_collection().find_one_and_update(
        filter_query,
        {"$inc": inc_data, "$set": {"updated_at": now_utc()}},
        return_document=ReturnDocument.AFTER,
    )


def credit_wallet(user_id, amount, transaction_type, reference_id=None, description=""):
    wallet = ensure_user_wallet(user_id)
    amount = _money(amount)

    if amount <= 0:
        return wallet

    updated_wallet = _atomic_update_wallet(
        wallet_id=wallet["_id"],
        filter_extra={},
        inc_data={
            "available_balance": amount,
            "total_balance": amount,
            "trading_wallet.available_balance": amount,
            "trading_wallet.total_balance": amount,
        },
    )

    if not updated_wallet:
        return ensure_user_wallet(user_id)

    balance_after = _money(updated_wallet.get("available_balance", 0.0))
    balance_before = _money(balance_after - amount)

    create_ledger_entry(
        user_id=user_id,
        wallet_id=wallet["_id"],
        transaction_type=transaction_type,
        direction="credit",
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        reference_id=reference_id,
        description=description,
    )

    return ensure_user_wallet(user_id)


def lock_wallet_amount(user_id, amount, transaction_type, reference_id=None, description=""):
    wallet = ensure_user_wallet(user_id)
    amount = _money(amount)

    if amount <= 0:
        return {"success": False, "message": "Amount must be greater than 0.", "wallet": wallet}

    updated_wallet = _atomic_update_wallet(
        wallet_id=wallet["_id"],
        filter_extra={"available_balance": {"$gte": amount}},
        inc_data={
            "available_balance": -amount,
            "locked_balance": amount,
            "trading_wallet.available_balance": -amount,
            "trading_wallet.locked_balance": amount,
        },
    )

    if not updated_wallet:
        return {
            "success": False,
            "message": "Insufficient available balance.",
            "wallet": ensure_user_wallet(user_id),
        }

    balance_after = _money(updated_wallet.get("available_balance", 0.0))
    balance_before = _money(balance_after + amount)

    create_ledger_entry(
        user_id=user_id,
        wallet_id=wallet["_id"],
        transaction_type=transaction_type,
        direction="debit",
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        reference_id=reference_id,
        description=description,
    )

    return {"success": True, "message": "Amount locked successfully.", "wallet": ensure_user_wallet(user_id)}


def complete_locked_withdrawal(user_id, amount, reference_id=None, description=""):
    wallet = ensure_user_wallet(user_id)
    amount = _money(amount)

    if amount <= 0:
        return {"success": False, "message": "Amount must be greater than 0.", "wallet": wallet}

    updated_wallet = _atomic_update_wallet(
        wallet_id=wallet["_id"],
        filter_extra={"locked_balance": {"$gte": amount}},
        inc_data={
            "locked_balance": -amount,
            "total_balance": -amount,
        },
    )

    if not updated_wallet:
        return {
            "success": False,
            "message": "Insufficient locked balance.",
            "wallet": ensure_user_wallet(user_id),
        }

    total_after = _money(updated_wallet.get("total_balance", 0.0))
    total_before = _money(total_after + amount)

    finalized_description = description or "Locked withdrawal amount finalized."
    if "no extra debit" not in finalized_description.lower():
        finalized_description = (
            f"{finalized_description}. Locked amount {amount:g} USDT finalized; "
            "no extra debit was taken from available balance."
        )

    create_ledger_entry(
        user_id=user_id,
        wallet_id=wallet["_id"],
        transaction_type="withdrawal_completed",
        direction="finalized",
        amount=amount,
        balance_before=total_before,
        balance_after=total_after,
        reference_id=reference_id,
        description=finalized_description,
    )

    return {"success": True, "message": "Locked withdrawal completed successfully.", "wallet": ensure_user_wallet(user_id)}


def complete_locked_trading_wallet_debit(user_id, amount, transaction_type="mt5_funding_completed", reference_id=None, description=""):
    """Finalize an amount already locked from the Trading Wallet.

    Unlike the legacy withdrawal finalizer, this keeps both the top-level
    trading mirror and the nested Trading Wallet bucket synchronized. It is
    used only after an external MT5 funding provider confirms the credit.
    """
    wallet = ensure_user_wallet(user_id)
    amount = _money(amount)

    if amount <= 0:
        return {"success": False, "message": "Amount must be greater than 0.", "wallet": wallet}

    updated_wallet = _atomic_update_wallet(
        wallet_id=wallet["_id"],
        filter_extra={
            "locked_balance": {"$gte": amount},
            "trading_wallet.locked_balance": {"$gte": amount},
        },
        inc_data={
            "locked_balance": -amount,
            "total_balance": -amount,
            "trading_wallet.locked_balance": -amount,
            "trading_wallet.total_balance": -amount,
        },
    )

    if not updated_wallet:
        return {
            "success": False,
            "message": "Unable to finalize the locked Trading Wallet amount.",
            "wallet": ensure_user_wallet(user_id),
        }

    trading_after = _bucket_balance(updated_wallet, TRADING_WALLET, "total_balance")
    trading_before = _money(trading_after + amount)
    create_ledger_entry(
        user_id=user_id,
        wallet_id=wallet["_id"],
        transaction_type=transaction_type,
        direction="finalized",
        amount=amount,
        balance_before=trading_before,
        balance_after=trading_after,
        reference_id=reference_id,
        description=description or "Trading Wallet funds transferred to MetaTrader 5.",
    )

    return {
        "success": True,
        "message": "Locked Trading Wallet amount finalized successfully.",
        "wallet": ensure_user_wallet(user_id),
    }


def release_locked_amount(user_id, amount, transaction_type, reference_id=None, description=""):
    wallet = ensure_user_wallet(user_id)
    amount = _money(amount)

    if amount <= 0:
        return {"success": False, "message": "Amount must be greater than 0.", "wallet": wallet}

    updated_wallet = _atomic_update_wallet(
        wallet_id=wallet["_id"],
        filter_extra={"locked_balance": {"$gte": amount}},
        inc_data={
            "available_balance": amount,
            "locked_balance": -amount,
            "trading_wallet.available_balance": amount,
            "trading_wallet.locked_balance": -amount,
        },
    )

    if not updated_wallet:
        return {
            "success": False,
            "message": "Insufficient locked balance.",
            "wallet": ensure_user_wallet(user_id),
        }

    balance_after = _money(updated_wallet.get("available_balance", 0.0))
    balance_before = _money(balance_after - amount)

    create_ledger_entry(
        user_id=user_id,
        wallet_id=wallet["_id"],
        transaction_type=transaction_type,
        direction="credit",
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        reference_id=reference_id,
        description=description,
    )

    return {"success": True, "message": "Locked amount released successfully.", "wallet": ensure_user_wallet(user_id)}



# =========================
# MAIN/TRADING WALLET FLOW
# =========================

def _wallet_bucket_after(wallet, bucket_name):
    wallet = normalize_wallet_currency(wallet)
    return (wallet or {}).get(bucket_name) or {}


def _bucket_balance(wallet, bucket_name, field="available_balance"):
    return _money(_wallet_bucket_after(wallet, bucket_name).get(field, 0.0))


def credit_main_wallet(user_id, amount, transaction_type, reference_id=None, description="", currency="USDT"):
    wallet = ensure_user_wallet(user_id)
    amount = _money(amount)

    if amount <= 0:
        return wallet

    currency = str(currency or "USDT").strip().upper()
    bucket_prefix = "main_wallet_inr" if currency == "INR" else "main_wallet_usdt"

    updated_wallet = _atomic_update_wallet(
        wallet_id=wallet["_id"],
        filter_extra={},
        inc_data={
            f"{bucket_prefix}.available_balance": amount,
            f"{bucket_prefix}.total_balance": amount,
        },
    )

    if not updated_wallet:
        return ensure_user_wallet(user_id)

    main_after = _wallet_bucket_after(updated_wallet, bucket_prefix)
    balance_after = _money(main_after.get("available_balance", 0.0))
    balance_before = _money(balance_after - amount)

    create_ledger_entry(
        user_id=user_id,
        wallet_id=wallet["_id"],
        transaction_type=transaction_type,
        direction="credit",
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        reference_id=reference_id,
        description=description or "Main wallet credited.",
        currency=currency,
    )

    return ensure_user_wallet(user_id)


def lock_main_wallet_amount(user_id, amount, transaction_type, reference_id=None, description="", currency=None):
    wallet = ensure_user_wallet(user_id)
    amount = _money(amount)

    if not currency:
        currency = str((wallet or {}).get("primary_currency") or "INR").upper()
    else:
        currency = str(currency).strip().upper()

    if amount <= 0:
        return {"success": False, "message": "Amount must be greater than 0.", "wallet": wallet}

    bucket_prefix = "main_wallet_inr" if currency == "INR" else "main_wallet_usdt"

    updated_wallet = _atomic_update_wallet(
        wallet_id=wallet["_id"],
        filter_extra={f"{bucket_prefix}.available_balance": {"$gte": amount}},
        inc_data={
            f"{bucket_prefix}.available_balance": -amount,
            f"{bucket_prefix}.locked_balance": amount,
        },
    )

    if not updated_wallet:
        return {
            "success": False,
            "message": "Insufficient main wallet balance.",
            "wallet": ensure_user_wallet(user_id),
        }

    # Keep nested total exact after inc.
    main_after = _wallet_bucket_after(updated_wallet, bucket_prefix)
    total = _money(main_after.get("available_balance", 0.0) + main_after.get("locked_balance", 0.0))
    get_wallets_collection().update_one(
        {"_id": wallet["_id"]},
        {"$set": {f"{bucket_prefix}.total_balance": total, "updated_at": now_utc()}},
    )

    balance_after = _money(main_after.get("available_balance", 0.0))
    balance_before = _money(balance_after + amount)

    create_ledger_entry(
        user_id=user_id,
        wallet_id=wallet["_id"],
        transaction_type=transaction_type,
        direction="debit",
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        reference_id=reference_id,
        description=description or "Main wallet amount locked.",
        currency=currency,
    )

    return {"success": True, "message": "Main wallet amount locked successfully.", "wallet": ensure_user_wallet(user_id)}


def complete_main_locked_withdrawal(user_id, amount, reference_id=None, description="", currency=None):
    wallet = ensure_user_wallet(user_id)
    amount = _money(amount)

    if not currency:
        currency = str((wallet or {}).get("primary_currency") or "INR").upper()
    else:
        currency = str(currency).strip().upper()

    unit_sym = "₹" if currency == "INR" else "$"

    if amount <= 0:
        return {"success": False, "message": "Amount must be greater than 0.", "wallet": wallet}

    bucket_prefix = "main_wallet_inr" if currency == "INR" else "main_wallet_usdt"

    updated_wallet = _atomic_update_wallet(
        wallet_id=wallet["_id"],
        filter_extra={f"{bucket_prefix}.locked_balance": {"$gte": amount}},
        inc_data={
            f"{bucket_prefix}.locked_balance": -amount,
            f"{bucket_prefix}.total_balance": -amount,
        },
    )

    if not updated_wallet:
        return {
            "success": False,
            "message": "Insufficient locked main wallet balance.",
            "wallet": ensure_user_wallet(user_id),
        }

    main_after = _wallet_bucket_after(updated_wallet, bucket_prefix)
    total_after = _money(main_after.get("total_balance", 0.0))
    total_before = _money(total_after + amount)

    finalized_description = description or "Main wallet locked withdrawal finalized."
    if "no extra debit" not in finalized_description.lower():
        finalized_description = (
            f"{finalized_description}. Locked main wallet amount {unit_sym}{amount:g} {currency} finalized; "
            "no extra debit was taken from available balance."
        )

    tx_type = "inr_withdrawal_completed" if currency == "INR" else "withdrawal_completed"

    create_ledger_entry(
        user_id=user_id,
        wallet_id=wallet["_id"],
        transaction_type=tx_type,
        direction="finalized",
        amount=amount,
        balance_before=total_before,
        balance_after=total_after,
        reference_id=reference_id,
        description=finalized_description,
        currency=currency,
    )

    return {"success": True, "message": "Main wallet withdrawal completed successfully.", "wallet": ensure_user_wallet(user_id)}


def complete_main_locked_debit(user_id, amount, transaction_type="mt5_account_funding", reference_id=None, description="", currency=None):
    # Wrapper to support legacy/onboarding references
    return complete_main_locked_withdrawal(user_id, amount, reference_id=reference_id, description=description, currency=currency)


def release_main_locked_amount(user_id, amount, transaction_type, reference_id=None, description="", currency=None):
    wallet = ensure_user_wallet(user_id)
    amount = _money(amount)

    if not currency:
        currency = str((wallet or {}).get("primary_currency") or "INR").upper()
    else:
        currency = str(currency).strip().upper()

    if amount <= 0:
        return {"success": False, "message": "Amount must be greater than 0.", "wallet": wallet}

    bucket_prefix = "main_wallet_inr" if currency == "INR" else "main_wallet_usdt"

    updated_wallet = _atomic_update_wallet(
        wallet_id=wallet["_id"],
        filter_extra={f"{bucket_prefix}.locked_balance": {"$gte": amount}},
        inc_data={
            f"{bucket_prefix}.available_balance": amount,
            f"{bucket_prefix}.locked_balance": -amount,
        },
    )

    if not updated_wallet:
        return {
            "success": False,
            "message": "Insufficient locked main wallet balance.",
            "wallet": ensure_user_wallet(user_id),
        }

    main_after = _wallet_bucket_after(updated_wallet, bucket_prefix)
    total = _money(main_after.get("available_balance", 0.0) + main_after.get("locked_balance", 0.0))
    get_wallets_collection().update_one(
        {"_id": wallet["_id"]},
        {"$set": {f"{bucket_prefix}.total_balance": total, "updated_at": now_utc()}},
    )

    balance_after = _money(main_after.get("available_balance", 0.0))
    balance_before = _money(balance_after - amount)

    create_ledger_entry(
        user_id=user_id,
        wallet_id=wallet["_id"],
        transaction_type=transaction_type,
        direction="credit",
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        reference_id=reference_id,
        description=description or "Main wallet locked amount released.",
        currency=currency,
    )

    return {"success": True, "message": "Locked main wallet amount released successfully.", "wallet": ensure_user_wallet(user_id)}


def transfer_between_user_wallets(user_id, amount, direction, currency="USDT"):
    wallet = ensure_user_wallet(user_id)
    amount = _money(amount)
    direction = str(direction or "").strip().lower()

    if amount <= 0:
        return {"success": False, "message": "Transfer amount must be greater than 0.", "errors": {"amount": "Invalid amount."}, "status_code": 422}

    if direction not in {"main_to_trading", "trading_to_main"}:
        return {"success": False, "message": "Invalid transfer direction.", "errors": {"direction": "Use main_to_trading or trading_to_main."}, "status_code": 422}

    currency = str(currency or "USDT").strip().upper()
    bucket_prefix = "main_wallet_inr" if currency == "INR" else "main_wallet_usdt"
    main_wallet = wallet.get(bucket_prefix) or {}

    from services.system_settings_service import get_usdt_inr_rate
    usdt_rate = float(get_usdt_inr_rate() or 88.50)

    if direction == "main_to_trading":
        main_available = _money(main_wallet.get("available_balance", 0.0))

        if main_available < amount:
            return {
                "success": False,
                "message": f"Insufficient Main Wallet ({currency}) balance.",
                "errors": {"amount": "Insufficient balance."},
                "status_code": 422,
            }
        if currency == "INR":
            usdt_credit = round(amount / usdt_rate, 4)
            inc_data = {
                "main_wallet_inr.available_balance": -amount,
                "main_wallet_inr.total_balance": -amount,
                "trading_wallet_inr.available_balance": usdt_credit,
                "trading_wallet_inr.total_balance": usdt_credit,
                "trading_wallet.available_balance": usdt_credit,
                "trading_wallet.total_balance": usdt_credit,
                "available_balance": usdt_credit,
                "total_balance": usdt_credit,
            }
            description = f"Transferred ₹{amount:g} INR from Main Wallet -> Received ${usdt_credit:g} USDT in Trading Wallet (Rate: 1 USDT = ₹{usdt_rate:g} INR)."
        else:
            inc_data = {
                "main_wallet_usdt.available_balance": -amount,
                "main_wallet_usdt.total_balance": -amount,
                "trading_wallet_usdt.available_balance": amount,
                "trading_wallet_usdt.total_balance": amount,
                "trading_wallet.available_balance": amount,
                "trading_wallet.total_balance": amount,
                "available_balance": amount,
                "total_balance": amount,
            }
            description = f"Transferred ${amount:g} USDT from Main Wallet -> Trading Wallet."

        filter_extra = {f"{bucket_prefix}.available_balance": {"$gte": amount}}
        txn_type = "main_to_trading_transfer"
    else:
        bucket_trading = "trading_wallet_inr" if currency == "INR" else "trading_wallet_usdt"
        trading_bucket = wallet.get(bucket_trading) or {}
        trading_available = _money(trading_bucket.get("available_balance", 0.0))

        if trading_available < amount:
            return {
                "success": False,
                "message": f"Insufficient Trading Wallet ({'INR' if currency == 'INR' else 'USDT'} Margin) balance.",
                "errors": {"amount": "Insufficient balance."},
                "status_code": 422,
            }

        if currency == "INR":
            inr_credit = round(amount * usdt_rate, 2)
            inc_data = {
                "trading_wallet_inr.available_balance": -amount,
                "trading_wallet_inr.total_balance": -amount,
                "trading_wallet.available_balance": -amount,
                "trading_wallet.total_balance": -amount,
                "main_wallet_inr.available_balance": inr_credit,
                "main_wallet_inr.total_balance": inr_credit,
                "available_balance": -amount,
                "total_balance": -amount,
            }
            description = f"Transferred ${amount:g} USDT from Trading Wallet -> Received ₹{inr_credit:g} INR in Main Wallet (Rate: 1 USDT = ₹{usdt_rate:g} INR)."
        else:
            inc_data = {
                "trading_wallet_usdt.available_balance": -amount,
                "trading_wallet_usdt.total_balance": -amount,
                "trading_wallet.available_balance": -amount,
                "trading_wallet.total_balance": -amount,
                "main_wallet_usdt.available_balance": amount,
                "main_wallet_usdt.total_balance": amount,
                "available_balance": -amount,
                "total_balance": -amount,
            }
            description = f"Transferred ${amount:g} USDT from Trading Wallet -> Main Wallet."

        filter_extra = {f"{bucket_trading}.available_balance": {"$gte": amount}, "available_balance": {"$gte": amount}}
        txn_type = "trading_to_main_transfer"

    updated_wallet = _atomic_update_wallet(
        wallet_id=wallet["_id"],
        filter_extra=filter_extra,
        inc_data=inc_data,
    )

    if not updated_wallet:
        source_label = "Main Wallet" if direction == "main_to_trading" else "Trading Wallet"
        return {
            "success": False,
            "message": f"Insufficient {source_label} balance.",
            "errors": {"wallet": f"Insufficient {source_label} balance."},
            "status_code": 422,
        }

    updated_wallet = ensure_user_wallet(user_id)
    source_bucket = bucket_prefix if direction == "main_to_trading" else TRADING_WALLET
    source_after = _bucket_balance(updated_wallet, source_bucket, "available_balance")
    balance_before = _money(source_after + amount)

    create_ledger_entry(
        user_id=user_id,
        wallet_id=wallet["_id"],
        transaction_type=txn_type,
        direction="transfer",
        amount=amount,
        balance_before=balance_before,
        balance_after=source_after,
        reference_id=f"TRF-{uuid.uuid4().hex[:12].upper()}",
        description=description,
        currency=currency if direction == "main_to_trading" else "USDT"
    )

    plan_profile = None
    try:
        from services.trading_plan_service import reconcile_user_plan
        plan_profile = (reconcile_user_plan(user_id, send_notice=True).get("data") or None)
    except Exception as error:
        print("PLAN RECONCILE AFTER TRANSFER ERROR:", error)

    return {
        "success": True,
        "message": "Wallet transfer completed successfully.",
        "data": {"wallet": format_wallet(updated_wallet), "trading_profile": plan_profile},
        "status_code": 200,
    }


def credit_admin_profit_wallet(amount, transaction_type, reference_id=None, description="", currency=None):
    amount = _money(amount)
    if amount <= 0:
        return ensure_admin_profit_wallet()

    currency = str(currency or "USDT").strip().upper()
    if currency not in ["INR", "USDT"]:
        currency = "USDT"

    from services.system_settings_service import get_usdt_inr_rate
    usdt_rate = float(get_usdt_inr_rate() or 88.50)

    usdt_amount = amount
    if currency == "INR":
        usdt_amount = _money(amount / usdt_rate)

    wallet = ensure_admin_profit_wallet()
    bucket_prefix = "main_wallet_inr" if currency == "INR" else "main_wallet_usdt"

    updated_wallet = _atomic_update_wallet(
        wallet_id=wallet["_id"],
        filter_extra={},
        inc_data={
            f"{bucket_prefix}.available_balance": amount,
            f"{bucket_prefix}.total_balance": amount,
            "main_wallet.available_balance": usdt_amount,
            "main_wallet.total_balance": usdt_amount,
        },
    ) or ensure_admin_profit_wallet()

    admin_after = _wallet_bucket_after(updated_wallet, MAIN_WALLET)
    balance_after_usdt = _money(admin_after.get("available_balance", 0.0))
    balance_before_usdt = _money(balance_after_usdt - usdt_amount)

    if currency == "INR":
        balance_after = _money(balance_after_usdt * usdt_rate)
        balance_before = _money(balance_before_usdt * usdt_rate)
    else:
        balance_after = balance_after_usdt
        balance_before = balance_before_usdt

    create_ledger_entry(
        user_id="__admin_profit_wallet__",
        wallet_id=wallet["_id"],
        transaction_type=transaction_type,
        direction="credit",
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        reference_id=reference_id,
        description=description or "Admin profit wallet credited.",
        currency=currency,
    )
    return ensure_admin_profit_wallet()

def settle_position_margin(user_id, margin_amount, realized_pnl, reference_id=None, description="", exit_trading_fee=0.0):
    wallet = ensure_user_wallet(user_id)
    margin_amount = _money(margin_amount)
    realized_pnl = _money(realized_pnl)

    if margin_amount <= 0:
        return {"success": False, "message": "Margin amount must be greater than 0.", "wallet": wallet}

    # Display settlement amount is based on the position margin, but the wallet
    # write below never credits margin that is not actually locked. This keeps
    # real-trade close safe even when frontend optimistic UI and backend wallet
    # lock are not perfectly synced yet.
    settlement_amount = _money(max(margin_amount + realized_pnl, 0.0))

    locked_balance = _money(wallet.get("locked_balance", 0.0))
    available_balance = _money(wallet.get("available_balance", 0.0))
    total_balance = _money(wallet.get("total_balance", available_balance + locked_balance))

    # Floating values stored in Mongo can miss by tiny decimals. Clamp instead of
    # blocking close with "Unable to settle position margin safely".
    locked_to_release = _money(min(max(locked_balance, 0.0), margin_amount))
    available_delta = _money(locked_to_release + realized_pnl)

    available_after = _money(available_balance + available_delta)
    locked_after = _money(max(locked_balance - locked_to_release, 0.0))
    total_after = _money(total_balance + realized_pnl)

    # If a loss is bigger than releasable margin + available balance, do not leave
    # the position stuck. Floor balances at 0 and write a ledger note. Admin can
    # still audit the realized P&L from the trade/position records.
    forced_floor = False
    if available_after < 0:
        forced_floor = True
        available_after = 0.0

    minimum_total = _money(available_after + locked_after)
    if total_after < minimum_total:
        total_after = minimum_total
    if total_after < 0:
        forced_floor = True
        total_after = 0.0

    updated_wallet = get_wallets_collection().find_one_and_update(
        {"_id": wallet["_id"]},
        {
            "$set": {
                "available_balance": available_after,
                "locked_balance": locked_after,
                "total_balance": total_after,
                "trading_wallet.available_balance": available_after,
                "trading_wallet.locked_balance": locked_after,
                "trading_wallet.total_balance": total_after,
                "updated_at": now_utc(),
            }
        },
        return_document=ReturnDocument.AFTER,
    )

    if not updated_wallet:
        return {
            "success": False,
            "message": "Wallet not found for position settlement.",
            "wallet": ensure_user_wallet(user_id),
        }

    ledger_description = description or "Position closed."
    if locked_to_release < margin_amount:
        missing_locked = _money(margin_amount - locked_to_release)
        ledger_description = (
            f"{ledger_description}. Margin lock mismatch auto-settled safely; "
            f"missing locked margin {missing_locked:g} USDT was not double-credited."
        ).strip()
    if forced_floor:
        ledger_description = (
            f"{ledger_description}. Wallet balance floored at 0 during loss settlement."
        ).strip()

    balance_before = available_balance
    balance_after = _money(updated_wallet.get("available_balance", 0.0))

    exit_trading_fee = _money(exit_trading_fee)
    if exit_trading_fee > 0:
        balance_after_gross = _money(balance_after + exit_trading_fee)
    else:
        balance_after_gross = balance_after

    ledger_amount_gross = _money(abs(balance_after_gross - balance_before))

    create_ledger_entry(
        user_id=user_id,
        wallet_id=wallet["_id"],
        transaction_type="position_close_settlement",
        direction="credit" if balance_after_gross >= balance_before else "debit",
        amount=ledger_amount_gross,
        balance_before=balance_before,
        balance_after=balance_after_gross,
        reference_id=reference_id,
        description=ledger_description,
    )

    if exit_trading_fee > 0:
        create_ledger_entry(
            user_id=user_id,
            wallet_id=wallet["_id"],
            transaction_type="trading_fee_debit",
            direction="debit",
            amount=exit_trading_fee,
            balance_before=balance_after_gross,
            balance_after=balance_after,
            reference_id=reference_id,
            description=f"Trading fee for futures close position {reference_id}",
        )

    return {
        "success": True,
        "message": "Position margin settled successfully.",
        "settlement_amount": settlement_amount,
        "realized_pnl": realized_pnl,
        "wallet": ensure_user_wallet(user_id),
    }


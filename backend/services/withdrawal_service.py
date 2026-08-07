import re
import uuid

from config.settings import settings
from config.database import get_database
from services.kyc_status_service import require_kyc_approved
from services.fee_service import calculate_withdrawal_fee_breakdown
from models.withdrawal_model import (
    create_withdrawal,
    find_user_withdrawal_by_id,
    format_withdrawal,
    format_withdrawals,
    get_user_withdrawals,
    update_withdrawal_status,
)
from services.blockchain_service import build_explorer_url
from services.wallet_service import (
    complete_main_locked_withdrawal,
    ensure_user_wallet,
    lock_main_wallet_amount,
    release_main_locked_amount,
)
from models.wallet_model import format_wallet
from utils.date_helper import now_utc
from utils.security import sanitize_text
from utils.validators import clean_string, validate_positive_number


ALLOWED_WITHDRAWAL_METHODS = ["crypto_withdrawal", "inr_withdrawal"]
SUPPORTED_CRYPTO_ASSETS = ["USDT", "INR", "BTC", "ETH", "SOL", "USDC", "BNB", "XRP", "ADA"]
SUPPORTED_CRYPTO_NETWORKS = ["TRC20", "ERC20", "BEP20", "BITCOIN", "SOLANA", "RIPPLE", "CARDANO", "UPI/BANK"]

TRON_ADDRESS_PATTERN = re.compile(r"^T[1-9A-HJ-NP-Za-km-z]{33}$")
EVM_ADDRESS_PATTERN = re.compile(r"^0x[a-fA-F0-9]{40}$")
BTC_ADDRESS_PATTERN = re.compile(r"^(1|3|bc1)[a-zA-Z0-9]{25,90}$", re.IGNORECASE)
SOL_ADDRESS_PATTERN = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
XRP_ADDRESS_PATTERN = re.compile(r"^r[1-9A-HJ-NP-Za-km-z]{24,34}$")
ADA_ADDRESS_PATTERN = re.compile(r"^(addr1|Ae2|Ddz)[a-zA-Z0-9]{25,110}$", re.IGNORECASE)

SETTINGS_KEY = "main"


def to_bool_setting(value, default=False):
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        value = value.strip().lower()
        if value in ["true", "1", "yes", "on"]:
            return True
        if value in ["false", "0", "no", "off"]:
            return False

    return default


def to_float_setting(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def get_admin_withdrawal_settings():
    default_settings = {
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

        return final_settings

    except Exception as error:
        print("ADMIN WITHDRAWAL SETTINGS ERROR:", str(error))
        return default_settings


def validate_crypto_withdrawal_address(network, address):
    if not address:
        return False, "User payout address/details required."

    network = clean_string(network).upper()

    if network == "UPI/BANK":
        return True, ""

    if network == "TRC20":
        if TRON_ADDRESS_PATTERN.match(address):
            return True, ""
        return False, "Please enter a valid TRC20 wallet address starting with T."

    if network in ["ERC20", "BEP20"]:
        if EVM_ADDRESS_PATTERN.match(address):
            return True, ""
        return False, f"Please enter a valid {network} EVM wallet address starting with 0x."

    if network == "BITCOIN":
        if BTC_ADDRESS_PATTERN.match(address):
            return True, ""
        return False, "Please enter a valid Bitcoin address (starting with 1, 3, or bc1)."

    if network == "SOLANA":
        if SOL_ADDRESS_PATTERN.match(address):
            return True, ""
        return False, "Please enter a valid Solana base58 wallet address."

    if network == "RIPPLE":
        if XRP_ADDRESS_PATTERN.match(address):
            return True, ""
        return False, "Please enter a valid Ripple wallet address starting with r."

    if network == "CARDANO":
        if ADA_ADDRESS_PATTERN.match(address):
            return True, ""
        return False, "Please enter a valid Cardano wallet address starting with addr1."

    return False, "Unsupported withdrawal network."


def check_kyc_for_withdrawal(user_id):
    admin_settings = get_admin_withdrawal_settings()
    require_kyc = to_bool_setting(admin_settings.get("require_kyc_for_withdrawals"), False if settings.APP_ENV == "development" else True)

    if not require_kyc or settings.APP_ENV == "development":
        return True, ""

    return require_kyc_approved(user_id, action_name="withdrawal")


def create_withdrawal_request(user_id, data):
    admin_settings = get_admin_withdrawal_settings()
    wallet = ensure_user_wallet(user_id)

    amount = data.get("amount")
    withdrawal_method = clean_string(data.get("withdrawal_method") or "crypto_withdrawal").lower()
    crypto_asset = clean_string(data.get("crypto_asset") or "").upper()
    crypto_network = clean_string(data.get("crypto_network") or "").upper()
    withdrawal_address = clean_string(data.get("withdrawal_address") or data.get("crypto_address") or "")
    destination_tag = sanitize_text(clean_string(data.get("destination_tag") or data.get("memo") or ""))

    if withdrawal_method == "inr_withdrawal" or crypto_asset == "INR":
        withdrawal_method = "inr_withdrawal"
        crypto_asset = "INR"
        crypto_network = "UPI/BANK"

    errors = {}

    if to_bool_setting(admin_settings.get("pause_withdrawals"), False):
        errors["withdrawal"] = "Withdrawals are currently paused by admin."

    kyc_allowed, kyc_error = check_kyc_for_withdrawal(user_id)
    if not kyc_allowed:
        errors["kyc"] = kyc_error

    is_valid_amount, amount_error = validate_positive_number(amount, "Amount")
    if not is_valid_amount:
        errors["amount"] = amount_error
        amount = 0.0
    else:
        amount = float(amount)
        if withdrawal_method == "inr_withdrawal":
            if amount < 10:
                errors["amount"] = "Minimum INR withdrawal amount is ₹10."
        else:
            if amount < settings.CRYPTO_WITHDRAWAL_MIN_USDT:
                errors["amount"] = f"Minimum crypto withdrawal amount is {settings.CRYPTO_WITHDRAWAL_MIN_USDT:g} USDT."
            if amount > settings.CRYPTO_WITHDRAWAL_MAX_USDT:
                errors["amount"] = f"Maximum crypto withdrawal amount is {settings.CRYPTO_WITHDRAWAL_MAX_USDT:g} USDT."

    if withdrawal_method == "inr_withdrawal":
        if not withdrawal_address:
            errors["withdrawal_address"] = "Please enter your UPI ID or Bank Account payout details."
    else:
        if crypto_network not in ["TRC20", "ERC20", "BEP20"]:
            errors["crypto_network"] = "Network must be one of: TRC20, ERC20, BEP20."
        else:
            is_valid_address, address_error = validate_crypto_withdrawal_address(crypto_network, withdrawal_address)
            if not is_valid_address:
                errors["withdrawal_address"] = address_error

    fee_breakdown = calculate_withdrawal_fee_breakdown(amount, crypto_network) if isinstance(amount, float) else {}
    network_fee = float(fee_breakdown.get("network_fee_usdt", 0.0) or 0.0)
    withdrawal_fee = float(fee_breakdown.get("withdrawal_fee_usdt", 0.0) or 0.0)
    total_fee = float(fee_breakdown.get("total_fee_usdt", network_fee + withdrawal_fee) or 0.0)
    total_lock_amount = round(float(amount), 8) if isinstance(amount, float) else 0.0
    payout_amount = round(max(float(amount) - total_fee, 0.0), 8) if isinstance(amount, float) else 0.0

    if not errors:
        if total_fee > 0 and payout_amount <= 0:
            errors["amount"] = "Withdrawal amount must be greater than total fees."
        is_inr = (withdrawal_method == "inr_withdrawal" or crypto_asset == "INR")
        main_bucket = wallet.get("main_wallet_inr") if is_inr else wallet.get("main_wallet_usdt")
        main_bucket = main_bucket or {}
        available_balance = float(main_bucket.get("available_balance", 0.0))
        if available_balance < total_lock_amount:
            errors["wallet"] = "Insufficient Main Wallet balance for withdrawal amount. Fees are deducted from the requested amount."
        else:
            from admin.settings_routes import get_final_settings
            system_settings = get_final_settings()
            usdt_rate = float(system_settings.get("usdt_inr_rate", 88.50) or 88.50)
            raw_min_balance = float(system_settings.get("min_main_wallet_balance", 0.0) or 0.0)
            is_inr = (withdrawal_method == "inr_withdrawal")

            if raw_min_balance > 0:
                min_required = raw_min_balance * usdt_rate if is_inr else raw_min_balance
                if available_balance - total_lock_amount < min_required:
                    unit_label = f"₹{min_required:g} INR" if is_inr else f"${raw_min_balance:g} USDT"
                    errors["amount"] = f"Cannot withdraw. Enforced minimum Main Wallet balance of {unit_label} must be maintained."

    if errors:
        return {"success": False, "message": "Validation failed.", "errors": errors, "status_code": 422}

    withdrawal_reference = f"TXW-{uuid.uuid4().hex[:12].upper()}"
    processing_mode = clean_string(settings.CRYPTO_WITHDRAWAL_PROCESSING_MODE or "backend_operations")
    is_inr = (withdrawal_method == "inr_withdrawal")
    req_currency = "INR" if is_inr else "USDT"
    req_tx_type = "inr_withdrawal_request" if is_inr else "crypto_withdrawal_request"
    unit_sym = "₹" if is_inr else "$"

    withdrawal_id = create_withdrawal(
        {
            "user_id": str(user_id),
            "withdrawal_reference": withdrawal_reference,
            "amount": round(float(amount), 8),
            "currency": req_currency,
            "withdrawal_method": withdrawal_method,
            "crypto_asset": crypto_asset,
            "crypto_network": crypto_network,
            "withdrawal_address": withdrawal_address,
            "destination_tag": destination_tag,
            "network_fee": network_fee,
            "withdrawal_fee": withdrawal_fee,
            "total_fee": total_fee,
            "final_amount": payout_amount,
            "fee_breakdown": fee_breakdown,
            "locked_amount": total_lock_amount,
            "fees_deducted_from_amount": True,
            "status": "pending_admin_approval",
            "processing_mode": processing_mode,
            "remark": "Withdrawal request created. Requested amount is locked; fees are deducted from that amount and payout happens only after admin approval or rejection/cancellation.",
            "payout_reference": "",
            "tx_hash": "",
            "explorer_url": "",
            "risk_note": "No UPI or Indian bank payout is used in this crypto wallet flow." if not is_inr else "INR Payout Flow",
        }
    )

    lock_result = lock_main_wallet_amount(
        user_id=user_id,
        amount=total_lock_amount,
        transaction_type=req_tx_type,
        reference_id=str(withdrawal_id),
        description=f"{req_currency} withdrawal request locked for reference {withdrawal_reference}. Payout {unit_sym}{payout_amount:g} {req_currency} after fee {unit_sym}{total_fee:g} {req_currency}.",
        currency=req_currency,
    )

    if not lock_result["success"]:
        update_withdrawal_status(str(withdrawal_id), "failed", {"remark": lock_result["message"]})
        return {"success": False, "message": lock_result["message"], "errors": {"wallet": lock_result["message"]}, "status_code": 422}

    withdrawal = find_user_withdrawal_by_id(user_id, str(withdrawal_id))

    return {
        "success": True,
        "message": f"{req_currency} withdrawal request created. Requested amount is locked; fees will be deducted from it on payout.",
        "data": {"withdrawal": format_withdrawal(withdrawal), "wallet": format_wallet(lock_result["wallet"])},
        "status_code": 201,
    }


def cancel_withdrawal_request(user_id, withdrawal_id):
    withdrawal = find_user_withdrawal_by_id(user_id, withdrawal_id)

    if not withdrawal:
        return {"success": False, "message": "Withdrawal request not found.", "errors": {"withdrawal": "Invalid withdrawal ID."}, "status_code": 404}

    if withdrawal.get("status") not in ["pending", "pending_payout", "pending_admin_approval", "queued"]:
        return {
            "success": False,
            "message": "Withdrawal cannot be cancelled.",
            "errors": {"status": f"Current status is {withdrawal.get('status')}."},
            "status_code": 400,
        }

    locked_amount = float(withdrawal.get("locked_amount", withdrawal.get("amount", 0.0)))
    req_currency = str(withdrawal.get("currency") or "INR").upper()
    is_inr = (req_currency == "INR" or withdrawal.get("withdrawal_method") == "inr_withdrawal")
    req_tx_type = "inr_withdrawal_cancelled" if is_inr else "crypto_withdrawal_cancelled"

    release_result = release_main_locked_amount(
        user_id=user_id,
        amount=locked_amount,
        transaction_type=req_tx_type,
        reference_id=withdrawal_id,
        description=f"{req_currency} withdrawal cancelled for reference {withdrawal.get('withdrawal_reference')}",
        currency=req_currency,
    )

    if not release_result["success"]:
        return {"success": False, "message": release_result["message"], "errors": {"wallet": release_result["message"]}, "status_code": 422}

    updated = update_withdrawal_status(
        withdrawal_id,
        "cancelled",
        {"cancelled_at": now_utc(), "remark": "Withdrawal cancelled by user. Locked balance released."},
    )

    return {
        "success": True,
        "message": f"Withdrawal cancelled and locked {req_currency} released successfully.",
        "data": {"withdrawal": format_withdrawal(updated), "wallet": format_wallet(release_result["wallet"])},
        "status_code": 200,
    }


def get_withdrawal_history(user_id):
    withdrawals = get_user_withdrawals(user_id)
    return {
        "success": True,
        "message": "Withdrawal history fetched successfully.",
        "data": {"withdrawals": format_withdrawals(withdrawals)},
        "status_code": 200,
    }


def complete_withdrawal_for_development(user_id, withdrawal_id):
    if settings.APP_ENV != "development":
        return {
            "success": False,
            "message": "Development withdrawal completion is not allowed in production.",
            "errors": {"environment": settings.APP_ENV},
            "status_code": 403,
        }

    withdrawal = find_user_withdrawal_by_id(user_id, withdrawal_id)
    if not withdrawal:
        return {"success": False, "message": "Withdrawal request not found.", "errors": {"withdrawal": "Invalid withdrawal ID."}, "status_code": 404}

    if withdrawal.get("status") == "completed":
        return {"success": False, "message": "Withdrawal already completed.", "errors": {"withdrawal": "Already completed."}, "status_code": 409}

    if withdrawal.get("status") not in ["pending", "pending_payout", "pending_admin_approval", "queued"]:
        return {"success": False, "message": "Withdrawal cannot be completed.", "errors": {"status": withdrawal.get("status")}, "status_code": 400}

    locked_amount = float(withdrawal.get("locked_amount", withdrawal.get("amount", 0.0)))
    req_currency = str(withdrawal.get("currency") or "USDT").upper()
    wallet_result = complete_main_locked_withdrawal(
        user_id=user_id,
        amount=locked_amount,
        reference_id=withdrawal_id,
        description=f"{req_currency} withdrawal completed for reference {withdrawal.get('withdrawal_reference')}. Locked amount finalized; no extra debit.",
        currency=req_currency,
    )

    if not wallet_result["success"]:
        return {"success": False, "message": wallet_result["message"], "errors": {"wallet": wallet_result["message"]}, "status_code": 422}

    tx_hash = f"DEV{uuid.uuid4().hex}"
    updated = update_withdrawal_status(
        withdrawal_id,
        "completed",
        {
            "payout_reference": f"DEV-CHAIN-TX-{uuid.uuid4().hex[:12].upper()}",
            "tx_hash": tx_hash,
            "explorer_url": build_explorer_url(withdrawal.get("crypto_network"), tx_hash),
            "completed_at": now_utc(),
            "remark": "Development crypto payout completed successfully.",
        },
    )

    return {
        "success": True,
        "message": "Development crypto withdrawal completed successfully.",
        "data": {"withdrawal": format_withdrawal(updated), "wallet": format_wallet(wallet_result["wallet"])},
        "status_code": 200,
    }
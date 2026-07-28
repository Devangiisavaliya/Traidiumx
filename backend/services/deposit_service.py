import re
import uuid

from config.database import get_database
from config.settings import settings

from models.deposit_model import (
    create_deposit,
    find_completed_deposit_by_tx_hash,
    find_deposit_by_id,
    find_deposit_by_tx_hash,
    find_user_deposit_by_id,
    format_deposit,
    format_deposits,
    get_user_deposits,
    update_deposit_status,
)
from models.wallet_model import format_wallet
from services.blockchain_service import build_explorer_url, verify_usdt_deposit
from services.wallet_service import credit_main_wallet, ensure_user_wallet
from services.system_settings_service import (
    get_crypto_deposit_address as get_admin_crypto_deposit_address,
    get_crypto_deposit_min_usdt,
    get_crypto_deposit_max_usdt,
)
from utils.date_helper import now_utc
from utils.validators import clean_string, validate_positive_number


ALLOWED_PAYMENT_METHODS = ["crypto_deposit"]
SUPPORTED_CRYPTO_ASSETS = ["USDT"]
SUPPORTED_CRYPTO_NETWORKS = ["TRC20", "ERC20", "BEP20"]

NETWORK_DETAILS = {
    "TRC20": {
        "label": "TRON (TRC20)",
        "asset": "USDT",
        "confirmation_note": "Send only USDT on TRON/TRC20 network.",
        "address_setting": "CRYPTO_DEPOSIT_USDT_TRC20_ADDRESS",
        "required_confirmations_setting": "CRYPTO_TRC20_REQUIRED_CONFIRMATIONS",
    },
    "ERC20": {
        "label": "Ethereum (ERC20)",
        "asset": "USDT",
        "confirmation_note": "Send only USDT on Ethereum/ERC20 network.",
        "address_setting": "CRYPTO_DEPOSIT_USDT_ERC20_ADDRESS",
        "required_confirmations_setting": "CRYPTO_ERC20_REQUIRED_CONFIRMATIONS",
    },
    "BEP20": {
        "label": "BNB Smart Chain (BEP20)",
        "asset": "USDT",
        "confirmation_note": "Send only USDT on BNB Smart Chain/BEP20 network.",
        "address_setting": "CRYPTO_DEPOSIT_USDT_BEP20_ADDRESS",
        "required_confirmations_setting": "CRYPTO_BEP20_REQUIRED_CONFIRMATIONS",
    },
}

TX_HASH_PATTERN = re.compile(r"^(0x[a-fA-F0-9]{64}|[a-fA-F0-9]{32,128})$")
DEMO_TX_REFERENCE_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{6,128}$")


def build_internal_address_confirmation_tx_hash():
    """Create a real-format internal reference for address-confirm demo deposits.

    The user-facing Futures popup can be used for a demo flow where the user
    copies the company deposit address and pastes the exact same address back
    to confirm that funds would be sent only to the company wallet. This is not
    a blockchain TXID, so we store a unique internal 64-hex reference to keep
    deposit history duplicate-safe without showing DEMO-TEST style text.
    """
    return f"{uuid.uuid4().hex}{uuid.uuid4().hex}"


def is_demo_deposit_context(deposit_address=""):
    """Return True only for an explicit developer direct-credit setup.

    Running the app in APP_ENV=development must never be enough to credit a
    deposit automatically. Users can paste any text into a TXID field, so the
    backend must credit Main Wallet only after blockchain verification or an
    explicit admin/developer approval path.
    """
    clean_address = clean_string(deposit_address).upper()
    return bool(
        settings.CRYPTO_DEPOSIT_DEV_DIRECT_CREDIT
        and (
            clean_address.startswith("TDEMO")
            or clean_address.startswith("0XDEMO")
            or clean_address.startswith("BDEMO")
            or "DEMO" in clean_address
        )
    )


def build_unique_gateway_order_id(payment_method, deposit_reference):
    environment_prefix = "DEV" if settings.APP_ENV == "development" else "CHAIN"
    method_prefix = str(payment_method or "crypto").upper().replace("_", "-")
    return f"{environment_prefix}-{method_prefix}-{deposit_reference}"


def get_crypto_network_address(network):
    details = NETWORK_DETAILS.get(network)
    if not details:
        return ""
    return clean_string(get_admin_crypto_deposit_address(network))


def get_crypto_network_confirmations(network):
    details = NETWORK_DETAILS.get(network)
    if not details:
        return 0
    return int(getattr(settings, details["required_confirmations_setting"], 0))


def get_crypto_deposit_addresses(user_id=None):
    wallet = ensure_user_wallet(user_id) if user_id is not None else None
    main_addresses = ((wallet or {}).get("main_wallet") or {}).get("addresses") or {}
    networks = []
    for network, details in NETWORK_DETAILS.items():
        # Admin Settings must be the first source of truth. The helper reads
        # system_settings first, then backend .env, then demo defaults. Old
        # per-user demo addresses stay only as a last fallback.
        address = clean_string(get_crypto_network_address(network) or main_addresses.get(network))
        networks.append(
            {
                "asset": details["asset"],
                "network": network,
                "label": details["label"],
                "address": address,
                "is_configured": bool(address),
                "required_confirmations": get_crypto_network_confirmations(network),
                "confirmation_note": details["confirmation_note"],
            }
        )

    return {
        "success": True,
        "message": "Crypto deposit addresses fetched successfully.",
        "data": {
            "asset": "USDT",
            "networks": networks,
            "min_amount": get_crypto_deposit_min_usdt(),
            "max_amount": get_crypto_deposit_max_usdt(),
            "supported_methods": ALLOWED_PAYMENT_METHODS,
            "fiat_methods_enabled": False,
            "auto_verify_enabled": bool(settings.CRYPTO_DEPOSIT_AUTO_VERIFY),
            "warning": "Crypto-only USDT Main Wallet. Send deposits only to the displayed company address for the selected network. Production should replace demo-format addresses with real controlled wallet addresses and use blockchain auto-verification; withdrawals still require admin approval.",
        },
        "status_code": 200,
    }


def validate_crypto_tx_hash(tx_hash, allow_demo_reference=False):
    cleaned_hash = clean_string(tx_hash)

    if not cleaned_hash:
        return False, "Transaction hash/TXID is required after sending USDT deposit.", ""

    if TX_HASH_PATTERN.match(cleaned_hash):
        return True, "", cleaned_hash

    # Local/demo mode keeps backward compatibility for old manual testing
    # references. The Futures popup now generates a real-format test TXID when
    # the field is left blank, so users do not see DEMO-TEST style text.
    if allow_demo_reference and DEMO_TX_REFERENCE_PATTERN.match(cleaned_hash):
        demo_reference = cleaned_hash if cleaned_hash.upper().startswith("DEMO") else f"DEMO-{cleaned_hash.upper()}"
        return True, "", demo_reference

    return False, "Please enter a valid blockchain transaction hash/TXID.", cleaned_hash


def _validate_deposit_input(user_id, data):
    amount = data.get("amount")
    payment_method = clean_string(data.get("payment_method") or "crypto_deposit").lower()
    crypto_asset = clean_string(data.get("crypto_asset") or "USDT").upper()
    crypto_network = clean_string(data.get("crypto_network") or "").upper()
    tx_hash = data.get("tx_hash")
    deposit_address_confirmation = clean_string(data.get("deposit_address_confirmation") or "")
    inr_utr_number = clean_string(data.get("inr_utr_number") or "")
    errors = {}

    if payment_method == "inr_deposit" or crypto_asset == "INR":
        payment_method = "inr_deposit"
        crypto_asset = "INR"
        crypto_network = "UPI/BANK"

    is_valid_amount, amount_error = validate_positive_number(amount, "Amount")
    if not is_valid_amount:
        errors["amount"] = amount_error
        amount = 0.0
    else:
        amount = float(amount)

    if payment_method == "inr_deposit":
        if amount < 10:
            errors["amount"] = "Minimum INR deposit amount is ₹10."
    else:
        min_deposit_amount = get_crypto_deposit_min_usdt()
        max_deposit_amount = get_crypto_deposit_max_usdt()
        if amount < min_deposit_amount:
            errors["amount"] = f"Minimum crypto deposit amount is {min_deposit_amount:g} USDT."
        if amount > max_deposit_amount:
            errors["amount"] = f"Maximum crypto deposit amount is {max_deposit_amount:g} USDT."

        if crypto_network not in SUPPORTED_CRYPTO_NETWORKS:
            errors["crypto_network"] = "Network must be one of: TRC20, ERC20, BEP20."

    wallet = ensure_user_wallet(user_id)
    main_addresses = ((wallet or {}).get("main_wallet") or {}).get("addresses") or {}
    deposit_address = clean_string(get_crypto_network_address(crypto_network) or main_addresses.get(crypto_network))

    address_confirmed_demo = False
    cleaned_hash = ""

    if payment_method == "inr_deposit":
        cleaned_hash = inr_utr_number or f"INR-UTR-{uuid.uuid4().hex[:10].upper()}"
    elif deposit_address_confirmation:
        if not deposit_address:
            errors["deposit_address_confirmation"] = "Company deposit address is not configured for this network."
        elif deposit_address_confirmation != deposit_address:
            errors["deposit_address_confirmation"] = "Deposit allowed only to the shown company wallet address. Copy the company address above and paste the exact same address here."
        else:
            address_confirmed_demo = True
            cleaned_hash = build_internal_address_confirmation_tx_hash()
    else:
        allow_demo_reference = is_demo_deposit_context(deposit_address)
        is_valid_hash, hash_error, cleaned_hash = validate_crypto_tx_hash(tx_hash, allow_demo_reference=allow_demo_reference)
        if not is_valid_hash:
            errors["tx_hash"] = hash_error

    return errors, {
        "amount": round(float(amount), 8) if not errors.get("amount") else 0.0,
        "payment_method": payment_method,
        "crypto_asset": crypto_asset,
        "crypto_network": crypto_network,
        "deposit_address": deposit_address,
        "deposit_address_confirmation": deposit_address_confirmation,
        "inr_utr_number": inr_utr_number,
        "address_confirmed_demo": address_confirmed_demo,
        "tx_hash": cleaned_hash,
    }


def _credit_verified_deposit(user_id, deposit_id, verification_result):
    deposit = find_deposit_by_id(deposit_id)
    if not deposit:
        return None, "Deposit not found."

    if deposit.get("status") == "completed":
        return deposit, "Deposit already credited."

    completed_duplicate = find_completed_deposit_by_tx_hash(deposit.get("tx_hash"))
    if completed_duplicate and str(completed_duplicate.get("_id")) != str(deposit_id):
        updated = update_deposit_status(
            deposit_id,
            "rejected",
            {
                "verification_status": "duplicate_completed_tx",
                "verification_message": "This TXID was already credited to another deposit request.",
                "remark": "Duplicate completed TXID blocked.",
            },
        )
        return updated, "Duplicate completed TXID blocked."

    amount = round(float(deposit.get("amount", 0.0)), 8)
    currency = str(deposit.get("currency") or "USDT").upper()
    wallet = credit_main_wallet(
        user_id=user_id,
        amount=amount,
        transaction_type="crypto_deposit_credit",
        reference_id=deposit_id,
        description=f"Verified USDT deposit credited for reference {deposit.get('deposit_reference')}",
        currency=currency,
    )

    updated = update_deposit_status(
        deposit_id,
        "completed",
        {
            "verification_status": "verified",
            "verification_message": verification_result.get("message", "USDT blockchain transfer verified."),
            "confirmations": verification_result.get("confirmations", 0),
            "required_confirmations": verification_result.get("required_confirmations", get_crypto_network_confirmations(deposit.get("crypto_network"))),
            "verified_amount": verification_result.get("verified_amount", amount),
            "verified_to_address": verification_result.get("verified_to_address", deposit.get("deposit_address", "")),
            "explorer_url": verification_result.get("explorer_url", build_explorer_url(deposit.get("crypto_network"), deposit.get("tx_hash"))),
            "credited_at": now_utc(),
            "remark": "Blockchain verification completed. USDT wallet credited through ledger.",
            "wallet_after_credit": {
                "available_balance": (wallet.get("main_wallet") or {}).get("available_balance", wallet.get("available_balance", 0.0)),
                "locked_balance": (wallet.get("main_wallet") or {}).get("locked_balance", 0.0),
                "total_balance": (wallet.get("main_wallet") or {}).get("total_balance", wallet.get("total_balance", 0.0)),
                "wallet_type": "main_wallet",
            },
        },
    )
    return updated, "Deposit verified and wallet credited successfully."


def create_deposit_request(user_id, data):
    from services.kyc_status_service import require_kyc_approved
    kyc_restriction = require_kyc_approved(user_id, "deposit")
    if kyc_restriction:
        return kyc_restriction

    errors, cleaned = _validate_deposit_input(user_id, data)

    if errors:
        return {"success": False, "message": "Validation failed.", "errors": errors, "status_code": 422}

    deposit_reference = f"TXD-{uuid.uuid4().hex[:12].upper()}"
    gateway_order_id = build_unique_gateway_order_id(cleaned["payment_method"], deposit_reference)

    is_inr = cleaned["payment_method"] == "inr_deposit"

    if is_inr:
        utr_ref = str(cleaned.get("inr_utr_number") or cleaned.get("tx_hash") or deposit_reference).strip()
        deposit_id = create_deposit(
            {
                "user_id": str(user_id),
                "deposit_reference": deposit_reference,
                "gateway_order_id": gateway_order_id,
                "amount": cleaned["amount"],
                "currency": "INR",
                "status": "completed",
                "payment_method": "inr_deposit",
                "gateway": "inr_payment_gateway",
                "gateway_payment_id": utr_ref,
                "crypto_asset": "INR",
                "crypto_network": "UPI/BANK",
                "deposit_address": "UPI / Bank Transfer",
                "tx_hash": utr_ref,
                "is_demo": True,
                "explorer_url": "",
                "verification_status": "verified",
                "verification_message": f"INR deposit of ₹{cleaned['amount']:g} credited via UPI/Bank. Ref: {utr_ref}",
                "confirmations": 1,
                "required_confirmations": 1,
                "verified_amount": cleaned["amount"],
                "verified_to_address": "Company UPI/Bank",
                "remark": "INR deposit credited to Main Wallet.",
                "risk_note": "Instant INR Deposit.",
            }
        )
        wallet = credit_main_wallet(
            user_id=user_id,
            amount=cleaned["amount"],
            transaction_type="inr_deposit_credit",
            reference_id=str(deposit_id),
            description=f"INR deposit credited to Main Wallet. Reference {deposit_reference}",
            currency="INR",
        )
        deposit = find_deposit_by_id(str(deposit_id))
        return {
            "success": True,
            "message": f"INR deposit of ₹{cleaned['amount']:g} credited to Main Wallet successfully.",
            "data": {
                "wallet": format_wallet(wallet),
                "deposit": format_deposit(deposit),
                "reference_id": str(deposit_id),
            },
            "status_code": 200,
        }

    # Crypto USDT Deposit flow
    tx_hash = str(cleaned.get("tx_hash") or "")
    explorer_url = build_explorer_url(cleaned.get("crypto_network"), tx_hash)
    is_demo_deposit = bool(
        cleaned.get("address_confirmed_demo")
        or tx_hash.upper().startswith("DEMO")
        or is_demo_deposit_context(cleaned.get("deposit_address"))
    )

    db = get_database()


    deposit_id = create_deposit(
        {
            "user_id": str(user_id),
            "deposit_reference": deposit_reference,
            "gateway_order_id": gateway_order_id,
            "amount": cleaned["amount"],
            "currency": "USDT",
            "status": "pending_blockchain_verification" if not is_demo_deposit else "processing_direct_credit",
            "payment_method": "crypto_deposit",
            "gateway": "company_address_confirmation_demo" if cleaned.get("address_confirmed_demo") else ("development_direct_credit" if is_demo_deposit else "blockchain_auto_verification"),
            "gateway_payment_id": cleaned["tx_hash"],
            "crypto_asset": cleaned["crypto_asset"],
            "crypto_network": cleaned["crypto_network"],
            "deposit_address": cleaned["deposit_address"],
            "deposit_address_confirmation": cleaned.get("deposit_address_confirmation", ""),
            "address_confirmed_demo": bool(cleaned.get("address_confirmed_demo")),
            "tx_hash": cleaned["tx_hash"],
            "is_demo": is_demo_deposit,
            "explorer_url": explorer_url,
            "verification_status": "direct_credit_pending" if is_demo_deposit else "not_checked",
            "verification_message": "Company deposit address matched. Demo Main Wallet credit is being posted directly; admin approval is not required." if cleaned.get("address_confirmed_demo") else ("Deposit received. Main Wallet credit is being posted directly; admin approval is not required." if is_demo_deposit else "Deposit request created. Blockchain auto-verification pending."),
            "confirmations": 0,
            "required_confirmations": 0 if is_demo_deposit else get_crypto_network_confirmations(cleaned["crypto_network"]),
            "verified_amount": 0.0,
            "verified_to_address": "",
            "remark": "Deposit address confirmation matched the company wallet address. Demo credit posted to Main Wallet. Withdrawals still require admin approval." if cleaned.get("address_confirmed_demo") else ("Deposit will credit Main Wallet directly. Withdrawals still require admin approval." if is_demo_deposit else "Wallet credit pending only until backend blockchain auto-verification completes. No admin approval is required for deposit."),
            "risk_note": "USDT Crypto deposit.",
        }
    )


    deposit = find_deposit_by_id(str(deposit_id))
    message = "Deposit submitted. Main Wallet will be credited after backend blockchain auto-verification."

    if is_demo_deposit:
        verification = {
            "verified": True,
            "status": "development_direct_credit",
            "message": "Company deposit address matched. Demo deposit credited directly to Main Wallet. Admin approval is not required for deposits.",
            "confirmations": 0,
            "required_confirmations": 0,
            "verified_amount": cleaned["amount"],
            "verified_to_address": cleaned["deposit_address"],
            "explorer_url": explorer_url,
        }
        deposit, message = _credit_verified_deposit(user_id, str(deposit_id), verification)
        message = "Deposit credited to Main Wallet successfully. Admin verification is required only for withdrawals."
    elif settings.CRYPTO_DEPOSIT_AUTO_VERIFY:
        verification = verify_usdt_deposit(
            cleaned["crypto_network"],
            cleaned["tx_hash"],
            cleaned["deposit_address"],
            cleaned["amount"],
        )
        if verification.get("verified"):
            deposit, message = _credit_verified_deposit(user_id, str(deposit_id), verification)
            message = "Blockchain deposit verified and credited to Main Wallet."
        else:
            deposit = update_deposit_status(
                str(deposit_id),
                "pending_blockchain_verification",
                {
                    "verification_status": verification.get("status", "pending"),
                    "verification_message": verification.get("message", "Blockchain auto-verification pending."),
                    "confirmations": verification.get("confirmations", 0),
                    "required_confirmations": verification.get("required_confirmations", get_crypto_network_confirmations(cleaned["crypto_network"])),
                    "verified_amount": verification.get("verified_amount", 0.0),
                    "verified_to_address": verification.get("verified_to_address", ""),
                    "explorer_url": verification.get("explorer_url", explorer_url),
                    "remark": "Deposit is waiting for blockchain/provider confirmation. Admin approval is not required.",
                },
            )
            message = "Deposit submitted. Waiting for blockchain/provider confirmation; admin approval is not required."
    else:
        # Safety mode: when automatic blockchain verification is disabled, the
        # deposit request must stay pending. Do not credit Main Wallet from a
        # user-submitted TXID alone, because that would allow any fake TXID to
        # add balance without funds reaching the company wallet.
        deposit = update_deposit_status(
            str(deposit_id),
            "pending_manual_verification",
            {
                "verification_status": "manual_company_wallet_check_required",
                "verification_message": "Deposit submitted. Wallet credit is pending until the company wallet transaction is verified.",
                "confirmations": 0,
                "required_confirmations": get_crypto_network_confirmations(cleaned["crypto_network"]),
                "verified_amount": 0.0,
                "verified_to_address": "",
                "explorer_url": explorer_url,
                "remark": "User-submitted TXID recorded. Credit only after blockchain/company wallet verification.",
            },
        )
        message = "Deposit submitted. Main Wallet will be credited only after company wallet/blockchain verification."

    return {
        "success": True,
        "message": message,
        "data": {"deposit": format_deposit(deposit)},
        "status_code": 201,
    }


def verify_deposit_request(user_id, deposit_id):
    deposit = find_user_deposit_by_id(user_id, deposit_id)
    if not deposit:
        return {"success": False, "message": "Deposit request not found.", "errors": {"deposit": "Invalid deposit ID."}, "status_code": 404}

    if deposit.get("status") == "completed":
        return {
            "success": True,
            "message": "Deposit is already verified and credited.",
            "data": {"deposit": format_deposit(deposit)},
            "status_code": 200,
        }

    if deposit.get("status") in ["rejected", "failed"]:
        return {"success": False, "message": "This deposit cannot be verified.", "errors": {"status": deposit.get("status")}, "status_code": 400}

    is_demo_deposit = bool(
        deposit.get("is_demo")
        or str(deposit.get("tx_hash", "")).upper().startswith("DEMO")
        or is_demo_deposit_context(deposit.get("deposit_address"))
    )

    if is_demo_deposit:
        verification = {
            "verified": True,
            "status": "development_direct_credit",
            "message": "Company deposit address matched. Demo deposit credited directly to Main Wallet. Admin approval is not required for deposits.",
            "confirmations": 0,
            "required_confirmations": 0,
            "verified_amount": float(deposit.get("amount", 0.0)),
            "verified_to_address": deposit.get("deposit_address", ""),
            "explorer_url": deposit.get("explorer_url", ""),
        }
        updated, message = _credit_verified_deposit(user_id, deposit_id, verification)
        return {
            "success": True,
            "message": "Deposit credited to Main Wallet successfully. Admin verification is required only for withdrawals.",
            "data": {"deposit": format_deposit(updated)},
            "status_code": 200,
        }

    verification = verify_usdt_deposit(
        deposit.get("crypto_network"),
        deposit.get("tx_hash"),
        deposit.get("deposit_address"),
        float(deposit.get("amount", 0.0)),
    )

    if verification.get("verified"):
        updated, message = _credit_verified_deposit(user_id, deposit_id, verification)
        return {"success": True, "message": message, "data": {"deposit": format_deposit(updated)}, "status_code": 200}

    updated = update_deposit_status(
        deposit_id,
        "pending_verification",
        {
            "verification_status": verification.get("status", "pending"),
            "verification_message": verification.get("message", "Verification pending."),
            "confirmations": verification.get("confirmations", 0),
            "required_confirmations": verification.get("required_confirmations", get_crypto_network_confirmations(deposit.get("crypto_network"))),
            "verified_amount": verification.get("verified_amount", 0.0),
            "verified_to_address": verification.get("verified_to_address", ""),
            "explorer_url": verification.get("explorer_url", deposit.get("explorer_url", "")),
        },
    )

    return {
        "success": False,
        "message": verification.get("message", "Blockchain verification is pending."),
        "errors": {"verification_status": verification.get("status", "pending")},
        "data": {"deposit": format_deposit(updated)},
        "status_code": 202,
    }


def get_deposit_history(user_id):
    deposits = get_user_deposits(user_id)
    return {
        "success": True,
        "message": "Deposit history fetched successfully.",
        "data": {"deposits": format_deposits(deposits)},
        "status_code": 200,
    }


def complete_deposit_for_development(user_id, deposit_id):
    if settings.APP_ENV != "development":
        return {
            "success": False,
            "message": "Development deposit completion is not allowed in production.",
            "errors": {"environment": settings.APP_ENV},
            "status_code": 403,
        }

    deposit = find_user_deposit_by_id(user_id, deposit_id)
    if not deposit:
        return {"success": False, "message": "Deposit request not found.", "errors": {"deposit": "Invalid deposit ID."}, "status_code": 404}

    if deposit.get("status") == "completed":
        return {"success": False, "message": "Deposit already completed.", "errors": {"deposit": "Already credited."}, "status_code": 409}

    verification = {
        "verified": True,
        "status": "verified_development",
        "message": "Development-only blockchain verification override.",
        "confirmations": get_crypto_network_confirmations(deposit.get("crypto_network")),
        "required_confirmations": get_crypto_network_confirmations(deposit.get("crypto_network")),
        "verified_amount": float(deposit.get("amount", 0.0)),
        "verified_to_address": deposit.get("deposit_address", ""),
        "explorer_url": deposit.get("explorer_url", ""),
    }

    updated, message = _credit_verified_deposit(user_id, deposit_id, verification)
    return {
        "success": True,
        "message": message,
        "data": {"deposit": format_deposit(updated)},
        "status_code": 200,
    }


def create_razorpay_order_service(user_id, amount):
    from services.kyc_status_service import require_kyc_approved
    kyc_restriction = require_kyc_approved(user_id, "deposit")
    if kyc_restriction:
        return kyc_restriction

    try:
        amount = float(amount)
    except (ValueError, TypeError):
        return {"success": False, "message": "Invalid amount.", "status_code": 400}

    if amount < 10:
        return {"success": False, "message": "Minimum INR deposit amount is ₹10.", "status_code": 400}

    deposit_reference = f"TXD-{uuid.uuid4().hex[:12].upper()}"
    gateway_order_id = f"order_{uuid.uuid4().hex[:14]}" # Fallback order ID if Razorpay is not configured/fails

    key_id = settings.RAZORPAY_KEY_ID
    key_secret = settings.RAZORPAY_KEY_SECRET

    use_sandbox_fallback = False
    if not key_id or not key_secret:
        # Fallback to local sandbox testing if keys are not set
        use_sandbox_fallback = True
        key_id = "rzp_test_placeholder_key"
        print("Warning: Razorpay keys not set. Falling back to sandbox test mode.")

    amount_paise = int(amount * 100)

    if not use_sandbox_fallback:
        import razorpay
        try:
            client = razorpay.Client(auth=(key_id, key_secret))
            razorpay_order = client.order.create({
                "amount": amount_paise,
                "currency": "INR",
                "receipt": deposit_reference,
                "payment_capture": 1
            })
            gateway_order_id = razorpay_order["id"]
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to create Razorpay order: {str(e)}",
                "status_code": 500
            }

    deposit_id = create_deposit(
        {
            "user_id": str(user_id),
            "deposit_reference": deposit_reference,
            "gateway_order_id": gateway_order_id,
            "amount": amount,
            "currency": "INR",
            "status": "pending_payment",
            "payment_method": "razorpay_deposit",
            "gateway": "razorpay",
            "gateway_payment_id": "",
            "crypto_asset": "INR",
            "crypto_network": "UPI/BANK",
            "deposit_address": "Razorpay Gateway",
            "tx_hash": "",
            "is_demo": use_sandbox_fallback,
            "explorer_url": "",
            "verification_status": "pending_payment",
            "verification_message": "Razorpay Sandbox Mode: Payment Pending" if use_sandbox_fallback else "Razorpay order created. Payment pending.",
            "confirmations": 0,
            "required_confirmations": 1,
            "verified_amount": 0.0,
            "verified_to_address": "Razorpay Merchant Account",
            "remark": "Razorpay order initiated.",
            "risk_note": "Razorpay Deposit.",
        }
    )

    return {
        "success": True,
        "message": "Razorpay order initiated successfully.",
        "data": {
            "deposit_id": str(deposit_id),
            "deposit_reference": deposit_reference,
            "razorpay_order_id": gateway_order_id,
            "amount": amount,
            "amount_paise": amount_paise,
            "key_id": key_id,
            "currency": "INR",
            "is_sandbox_fallback": use_sandbox_fallback
        },
        "status_code": 200
    }


def verify_razorpay_payment_service(user_id, data):
    from models.deposit_model import find_deposit_by_gateway_order_id
    
    razorpay_order_id = data.get("razorpay_order_id")
    razorpay_payment_id = data.get("razorpay_payment_id")
    razorpay_signature = data.get("razorpay_signature")

    if not razorpay_order_id or not razorpay_payment_id:
        return {"success": False, "message": "Missing payment signature details.", "status_code": 400}

    deposit = find_deposit_by_gateway_order_id(razorpay_order_id)
    if not deposit:
        return {"success": False, "message": "Deposit request not found for this order.", "status_code": 404}

    if deposit.get("status") == "completed":
        return {
            "success": True,
            "message": "Payment verified and credited already.",
            "data": {"deposit": format_deposit(deposit)},
            "status_code": 200
        }

    # If it's sandbox demo fallback (meaning keys were empty during order creation), bypass real verification
    is_sandbox = deposit.get("is_demo") or settings.RAZORPAY_KEY_ID == ""

    if not is_sandbox:
        if not razorpay_signature:
            return {"success": False, "message": "Missing payment signature.", "status_code": 400}
        import razorpay
        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        try:
            client.utility.verify_payment_signature({
                'razorpay_order_id': razorpay_order_id,
                'razorpay_payment_id': razorpay_payment_id,
                'razorpay_signature': razorpay_signature
            })
        except Exception as e:
            update_deposit_status(str(deposit["_id"]), "failed", {
                "verification_status": "signature_verification_failed",
                "verification_message": f"Signature verification failed: {str(e)}",
                "remark": "Invalid payment signature."
            })
            return {"success": False, "message": "Signature verification failed.", "status_code": 400}

    # Credit user's wallet
    amount = float(deposit["amount"])
    wallet = credit_main_wallet(
        user_id=deposit["user_id"],
        amount=amount,
        transaction_type="inr_deposit_credit",
        reference_id=str(deposit["_id"]),
        description=f"INR deposit credited to Main Wallet via Razorpay. Reference {deposit['deposit_reference']}",
        currency="INR"
    )

    updated = update_deposit_status(str(deposit["_id"]), "completed", {
        "gateway_payment_id": razorpay_payment_id,
        "tx_hash": razorpay_payment_id,
        "verification_status": "verified",
        "verification_message": f"Payment verified successfully (Sandbox)" if is_sandbox else f"Payment verified successfully. Payment ID: {razorpay_payment_id}",
        "credited_at": now_utc(),
        "verified_amount": amount,
        "confirmations": 1,
        "remark": "Deposited via Razorpay Payment Gateway.",
        "wallet_after_credit": {
            "available_balance": (wallet.get("main_wallet_inr") or {}).get("available_balance", 0.0),
            "locked_balance": (wallet.get("main_wallet_inr") or {}).get("locked_balance", 0.0),
            "total_balance": (wallet.get("main_wallet_inr") or {}).get("total_balance", 0.0),
            "wallet_type": "main_wallet_inr"
        }
    })

    return {
        "success": True,
        "message": "Payment verified and credited to Main Wallet successfully.",
        "data": {"deposit": format_deposit(updated)},
        "status_code": 200
    }


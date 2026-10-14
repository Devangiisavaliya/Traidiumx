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
SUPPORTED_CRYPTO_ASSETS = ["USDT", "BTC", "ETH", "SOL", "USDC", "BNB", "XRP", "ADA"]
SUPPORTED_CRYPTO_NETWORKS = ["TRC20", "ERC20", "BEP20", "BITCOIN", "SOLANA", "RIPPLE", "CARDANO"]

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
        "asset": "ETH",
        "confirmation_note": "Send ETH, ERC20-USDT, or ERC20-USDC on Ethereum/ERC20 network.",
        "address_setting": "CRYPTO_DEPOSIT_USDT_ERC20_ADDRESS",
        "required_confirmations_setting": "CRYPTO_ERC20_REQUIRED_CONFIRMATIONS",
    },
    "BEP20": {
        "label": "BNB Smart Chain (BEP20)",
        "asset": "BNB",
        "confirmation_note": "Send BNB or BEP20-USDT on BNB Smart Chain/BEP20 network.",
        "address_setting": "CRYPTO_DEPOSIT_USDT_BEP20_ADDRESS",
        "required_confirmations_setting": "CRYPTO_BEP20_REQUIRED_CONFIRMATIONS",
    },
    "BITCOIN": {
        "label": "Bitcoin (BTC)",
        "asset": "BTC",
        "confirmation_note": "Send only BTC on Bitcoin mainnet.",
        "address_setting": "CRYPTO_DEPOSIT_BTC_ADDRESS",
        "required_confirmations_setting": "CRYPTO_BTC_REQUIRED_CONFIRMATIONS",
    },
    "SOLANA": {
        "label": "Solana (SOL)",
        "asset": "SOL",
        "confirmation_note": "Send only SOL on Solana network.",
        "address_setting": "CRYPTO_DEPOSIT_SOL_ADDRESS",
        "required_confirmations_setting": "CRYPTO_SOL_REQUIRED_CONFIRMATIONS",
    },
    "RIPPLE": {
        "label": "Ripple (XRP)",
        "asset": "XRP",
        "confirmation_note": "Send only XRP on Ripple network.",
        "address_setting": "CRYPTO_DEPOSIT_XRP_ADDRESS",
        "required_confirmations_setting": "CRYPTO_XRP_REQUIRED_CONFIRMATIONS",
    },
    "CARDANO": {
        "label": "Cardano (ADA)",
        "asset": "ADA",
        "confirmation_note": "Send only ADA on Cardano network.",
        "address_setting": "CRYPTO_DEPOSIT_ADA_ADDRESS",
        "required_confirmations_setting": "CRYPTO_ADA_REQUIRED_CONFIRMATIONS",
    },
    "ETH": {
        "label": "Ethereum (ETH)",
        "asset": "ETH",
        "confirmation_note": "Send only ETH on Ethereum network.",
        "address_setting": "CRYPTO_DEPOSIT_ETH_ADDRESS",
        "required_confirmations_setting": "CRYPTO_ERC20_REQUIRED_CONFIRMATIONS",
    },
    "USDC": {
        "label": "USD Coin (USDC)",
        "asset": "USDC",
        "confirmation_note": "Send only USDC on ERC20/BEP20 network.",
        "address_setting": "CRYPTO_DEPOSIT_USDC_ADDRESS",
        "required_confirmations_setting": "CRYPTO_ERC20_REQUIRED_CONFIRMATIONS",
    },
    "BNB": {
        "label": "BNB Coin (BNB)",
        "asset": "BNB",
        "confirmation_note": "Send only BNB on BEP20 network.",
        "address_setting": "CRYPTO_DEPOSIT_BNB_ADDRESS",
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
        # Prioritize the user's permanent HD wallet address, fallback to user's wallet addresses, fallback to admin settings.
        address = ""
        if user_id:
            if network in ("TRC20", "BEP20", "ERC20", "ETH", "USDC", "BNB"):
                try:
                    from services.hd_wallet_service import get_or_create_user_deposit_address
                    evm_net = "BEP20" if network == "BNB" else ("ERC20" if network in ("ETH", "USDC") else network)
                    address = clean_string(get_or_create_user_deposit_address(user_id, evm_net))
                except Exception:
                    address = ""
            if not address:
                address = clean_string(main_addresses.get(network))
        if not address:
            address = clean_string(get_crypto_network_address(network))

        contract_address = ""
        if network in ("TRC20", "BEP20", "ERC20"):
            from services.blockchain_service import get_usdt_contract
            contract_address = get_usdt_contract(network)

        networks.append(
            {
                "asset": details["asset"],
                "network": network,
                "label": details["label"],
                "address": address,
                "is_configured": bool(address),
                "required_confirmations": get_crypto_network_confirmations(network),
                "confirmation_note": details["confirmation_note"],
                "contract_address": contract_address,
            }
        )

    from services.system_settings_service import get_runtime_system_settings
    settings_data = get_runtime_system_settings()
    btc_contract = clean_string(settings_data.get("crypto_deposit_btc_contract_address", ""))

    addresses_map = {n["network"]: n["address"] for n in networks}
    for n in networks:
        addresses_map[f"{n['asset']}_{n['network']}"] = n["address"]
        addresses_map[f"USDT_{n['network']}"] = n["address"]

    return {
        "success": True,
        "message": "Crypto deposit addresses fetched successfully.",
        "data": {
            "asset": "USDT",
            "networks": networks,
            "addresses": addresses_map,
            "min_amount": get_crypto_deposit_min_usdt(),
            "max_amount": get_crypto_deposit_max_usdt(),
            "btc_contract_address": btc_contract,
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
    crypto_asset = clean_string(data.get("crypto_asset") or data.get("currency") or "USDT").upper()
    crypto_network = clean_string(data.get("crypto_network") or data.get("network") or "TRC20").upper()
    tx_hash = data.get("tx_hash")
    deposit_address_confirmation = clean_string(data.get("deposit_address_confirmation") or "")
    inr_utr_number = clean_string(data.get("inr_utr_number") or "")
    errors = {}

    if payment_method == "inr_deposit" or crypto_asset == "INR":
        payment_method = "inr_deposit"
        crypto_asset = "INR"
        crypto_network = "UPI/BANK"

        from config.database import get_database
        from bson import ObjectId
        db = get_database()
        user_doc = db.users.find_one({"_id": ObjectId(str(user_id))}) if ObjectId.is_valid(str(user_id)) else None
        if user_doc and (user_doc.get("selected_platform") == "mt5" or user_doc.get("platform") == "mt5" or "cent" in str(user_doc.get("plan", "")).lower()):
            errors["account"] = "MetaTrader 5 accounts only support USDT deposits. Please deposit INR to your TraidiumX Main Wallet."

    is_valid_amount, amount_error = validate_positive_number(amount, "Amount")
    if not is_valid_amount:
        errors["amount"] = amount_error
        amount = 0.0
    else:
        amount = float(amount)

    if payment_method == "inr_deposit":
        from services.system_settings_service import get_inr_deposit_details
        inr_details = get_inr_deposit_details()
        min_inr = float(inr_details.get("min_deposit_inr") or 100.0)
        max_inr = float(inr_details.get("max_deposit_inr") or 500000.0)
        if amount < min_inr:
            errors["amount"] = f"Minimum INR deposit amount is ₹{min_inr:g}."
        elif amount > max_inr:
            errors["amount"] = f"Maximum INR deposit amount is ₹{max_inr:g}."
    else:
        from services.market_service import get_symbol_execution_price, get_symbol_ticker
        
        def get_asset_price(asset):
            if asset in ["USDT", "USDC"]:
                return 1.0
            # Check setting overrides first
            from admin.settings_routes import get_final_settings
            sys_settings = get_final_settings()
            override_val = sys_settings.get(f"rate_override_{asset.lower()}")
            try:
                if override_val is not None and float(override_val) > 0.0:
                    return float(override_val)
            except (ValueError, TypeError):
                pass
            
            res = get_symbol_execution_price(f"{asset}USDT")
            if res.get("success"):
                return float(res.get("price", 0.0))
            res_ticker = get_symbol_ticker(f"{asset}USDT")
            if res_ticker.get("success"):
                return float((res_ticker.get("data") or {}).get("last_price", 0.0))
            return 0.0

        asset_price = get_asset_price(crypto_asset)
        if asset_price <= 0:
            errors["crypto_asset"] = "Could not verify exchange rate for this asset."
            usd_amount = 0.0
        else:
            usd_amount = amount * asset_price

        min_deposit_amount = get_crypto_deposit_min_usdt()
        max_deposit_amount = get_crypto_deposit_max_usdt()

        if usd_amount < min_deposit_amount:
            min_coin = min_deposit_amount / asset_price if asset_price > 0 else 0
            errors["amount"] = f"Minimum deposit is ${min_deposit_amount:g} USDT value (≈ {min_coin:.4f} {crypto_asset})."
        if usd_amount > max_deposit_amount:
            max_coin = max_deposit_amount / asset_price if asset_price > 0 else 0
            errors["amount"] = f"Maximum deposit is ${max_deposit_amount:g} USDT value (≈ {max_coin:.4f} {crypto_asset})."

        if crypto_network not in SUPPORTED_CRYPTO_NETWORKS:
            errors["crypto_network"] = f"Network must be one of: {', '.join(SUPPORTED_CRYPTO_NETWORKS)}."

    from models.user_model import find_user_by_id
    user_doc = find_user_by_id(user_id) or {}
    parent_user_id = str(user_doc.get("parent_user_id") or user_id)

    wallet = ensure_user_wallet(parent_user_id)
    main_addresses = ((wallet or {}).get("main_wallet") or {}).get("addresses") or {}
    if crypto_network in ("TRC20", "BEP20", "ERC20"):
        from services.hd_wallet_service import get_or_create_user_deposit_address
        deposit_address = clean_string(get_or_create_user_deposit_address(parent_user_id, crypto_network))
    else:
        deposit_address = clean_string(main_addresses.get(crypto_network) or get_crypto_network_address(crypto_network))


    address_confirmed_demo = False
    cleaned_hash = ""

    clean_tx_hash = clean_string(tx_hash)
    clean_confirmation = clean_string(deposit_address_confirmation).lower()
    clean_target_address = clean_string(deposit_address).lower()

    if payment_method == "inr_deposit":
        cleaned_hash = inr_utr_number or f"INR-UTR-{uuid.uuid4().hex[:10].upper()}"
    elif clean_tx_hash:
        allow_demo_reference = bool(settings.CRYPTO_DEPOSIT_DEV_DIRECT_CREDIT)
        if allow_demo_reference and (clean_tx_hash.lower() == clean_target_address or clean_tx_hash.upper().startswith("DEMO") or not TX_HASH_PATTERN.match(clean_tx_hash)):
            cleaned_hash = build_internal_address_confirmation_tx_hash()
            address_confirmed_demo = True
        else:
            is_valid_hash, hash_error, cleaned_hash = validate_crypto_tx_hash(clean_tx_hash, allow_demo_reference=allow_demo_reference)
            if not is_valid_hash:
                errors["tx_hash"] = hash_error
    elif clean_confirmation:
        if not settings.CRYPTO_DEPOSIT_DEV_DIRECT_CREDIT:
            errors["deposit_address_confirmation"] = "Direct credit simulation is disabled in this environment."
        elif not clean_target_address:
            errors["deposit_address_confirmation"] = "Company deposit address is not configured for this network."
        elif clean_confirmation != clean_target_address:
            errors["deposit_address_confirmation"] = "Deposit allowed only to the shown company wallet address. Copy the company address above and paste the exact same address here."
        else:
            address_confirmed_demo = True
            cleaned_hash = build_internal_address_confirmation_tx_hash()
    else:
        allow_demo_reference = bool(settings.CRYPTO_DEPOSIT_DEV_DIRECT_CREDIT)
        if allow_demo_reference:
            cleaned_hash = build_internal_address_confirmation_tx_hash()
            address_confirmed_demo = True
        else:
            is_valid_hash, hash_error, cleaned_hash = validate_crypto_tx_hash(clean_tx_hash, allow_demo_reference=allow_demo_reference)
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

    from models.user_model import find_user_by_id
    user = find_user_by_id(user_id) or {}
    platform = str(user.get("selected_platform") or user.get("trading_platform") or "").lower()

    plan = str(user.get("plan") or user.get("active_plan") or "").lower()
    is_cent = plan == "cent" or "cent" in plan or bool(user.get("is_cent")) or "cent" in str(user.get("name") or "").lower()

    if is_cent:
        wallet = credit_main_wallet(
            user_id=user_id,
            amount=amount,
            transaction_type="crypto_deposit_credit",
            reference_id=deposit_id,
            description=f"Verified {currency} deposit credited to Cent Main Wallet ({amount * 100:g} USC) for reference {deposit.get('deposit_reference')}",
            currency=currency,
            platform=platform,
        )
        updated = update_deposit_status(
            deposit_id,
            "completed",
            {
                "platform": platform,
                "is_cent": True,
                "cent_balance_usc": round(amount * 100, 2),
                "verification_status": "verified",
                "verification_message": verification_result.get("message", f"{currency} blockchain transfer verified and credited to Cent Main Wallet ({amount * 100:g} USC)."),
                "confirmations": verification_result.get("confirmations", 0),
                "required_confirmations": verification_result.get("required_confirmations", get_crypto_network_confirmations(deposit.get("crypto_network"))),
                "verified_amount": verification_result.get("verified_amount", amount),
                "verified_to_address": verification_result.get("verified_to_address", deposit.get("deposit_address", "")),
                "explorer_url": verification_result.get("explorer_url", build_explorer_url(deposit.get("crypto_network"), deposit.get("tx_hash"))),
                "credited_at": now_utc(),
                "remark": f"Blockchain verification completed. {currency} credited to Cent Main Wallet as {amount * 100:g} USC.",
                "wallet_after_credit": {
                    "available_balance": (wallet.get("main_wallet_usdt") or {}).get("available_balance", 0.0),
                    "total_balance": (wallet.get("main_wallet_usdt") or {}).get("total_balance", 0.0),
                    "cent_balance_usc": round(amount * 100, 2),
                },
            },
        )
        return updated, f"Deposit verified and credited to Cent Main Wallet as {amount * 100:g} USC."

    if platform == "mt5":
        from services.mt5_service import credit_mt5_deposit
        mt5_acc = credit_mt5_deposit(
            user_id=user_id,
            amount=amount,
            reference_id=deposit_id,
            description=f"Verified {currency} deposit credited to MT5 Account for reference {deposit.get('deposit_reference')}",
        )
        updated = update_deposit_status(
            deposit_id,
            "completed",
            {
                "platform": "mt5",
                "verification_status": "verified",
                "verification_message": verification_result.get("message", f"{currency} blockchain transfer verified and credited to MT5."),
                "confirmations": verification_result.get("confirmations", 0),
                "required_confirmations": verification_result.get("required_confirmations", get_crypto_network_confirmations(deposit.get("crypto_network"))),
                "verified_amount": verification_result.get("verified_amount", amount),
                "verified_to_address": verification_result.get("verified_to_address", deposit.get("deposit_address", "")),
                "explorer_url": verification_result.get("explorer_url", build_explorer_url(deposit.get("crypto_network"), deposit.get("tx_hash"))),
                "credited_at": now_utc(),
                "remark": f"Blockchain verification completed. {currency} credited to MT5 Account.",
                "mt5_account_after_credit": {
                    "balance": (mt5_acc or {}).get("balance", 0.0),
                    "equity": (mt5_acc or {}).get("equity", 0.0),
                },
            },
        )
        return updated, "Deposit verified and MT5 account credited successfully."

    wallet = credit_main_wallet(
        user_id=user_id,
        amount=amount,
        transaction_type="crypto_deposit_credit",
        reference_id=deposit_id,
        description=f"Verified {currency} deposit credited for reference {deposit.get('deposit_reference')}",
        currency=currency,
    )

    updated = update_deposit_status(
        deposit_id,
        "completed",
        {
            "verification_status": "verified",
            "verification_message": verification_result.get("message", f"{currency} blockchain transfer verified."),
            "confirmations": verification_result.get("confirmations", 0),
            "required_confirmations": verification_result.get("required_confirmations", get_crypto_network_confirmations(deposit.get("crypto_network"))),
            "verified_amount": verification_result.get("verified_amount", amount),
            "verified_to_address": verification_result.get("verified_to_address", deposit.get("deposit_address", "")),
            "explorer_url": verification_result.get("explorer_url", build_explorer_url(deposit.get("crypto_network"), deposit.get("tx_hash"))),
            "credited_at": now_utc(),
            "remark": f"Blockchain verification completed. {currency} wallet credited through ledger.",
            "wallet_after_credit": {
                "available_balance": (wallet.get(f"main_wallet_{currency.lower()}") or {}).get("available_balance", 0.0),
                "locked_balance": (wallet.get(f"main_wallet_{currency.lower()}") or {}).get("locked_balance", 0.0),
                "total_balance": (wallet.get(f"main_wallet_{currency.lower()}") or {}).get("total_balance", 0.0),
                "wallet_type": f"main_wallet_{currency.lower()}",
            },
        },
    )

    # Save user's wallet address dynamically on first successful manual verification
    from_addr = verification_result.get("verified_from_address")
    if from_addr and deposit.get("crypto_network") == "TRC20":
        from config.database import get_database
        from bson import ObjectId
        db = get_database()
        db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"trc20_wallet_address": from_addr}}
        )

    # Trigger automated instant sweep and fallback to background retry thread
    net = (deposit.get("crypto_network") or verification_result.get("crypto_network") or "TRC20").upper()
    if net in ("TRC20", "BEP20") and getattr(settings, "DEPOSIT_SWEEP_ENABLED", True):
        dep_addr = deposit.get("deposit_address") or verification_result.get("verified_to_address")
        deposit_id_str = str(deposit_id)
        user_id_str = str(user_id)
        
        try:
            from services.hd_wallet_service import find_user_by_deposit_address
            from services.vault_sweep_service import sweep_address_to_vault, sweep_bep20_address_to_vault
            from config.database import get_database
            db = get_database()
            user_addr_rec = None
            if dep_addr:
                user_addr_rec = find_user_by_deposit_address(dep_addr, net)
            if not user_addr_rec and user_id_str:
                user_addr_rec = db.user_deposit_addresses.find_one({"user_id": user_id_str, "network": net})

            if user_addr_rec:
                if net == "BEP20":
                    sweep_res = sweep_bep20_address_to_vault(user_addr_rec, min_sweep_amount=0.1)
                else:
                    # Immediate fast sweep attempt (retries=2, retry_delay=1.0)
                    sweep_res = sweep_address_to_vault(user_addr_rec, min_sweep_amount=0.1, retries=2, retry_delay=1.0)
                
                if sweep_res.get("success"):
                    update_deposit_status(deposit_id_str, "completed", {"vault_sweep_tx_hash": sweep_res.get("tx_hash")})
                else:
                    # If balance not yet settled on-chain, spawn background retry worker
                    import threading
                    def _async_retry_sweep():
                        try:
                            if net == "BEP20":
                                async_res = sweep_bep20_address_to_vault(user_addr_rec, min_sweep_amount=0.1)
                            else:
                                async_res = sweep_address_to_vault(user_addr_rec, min_sweep_amount=0.1, retries=10, retry_delay=2.0)
                            if async_res.get("success"):
                                update_deposit_status(deposit_id_str, "completed", {"vault_sweep_tx_hash": async_res.get("tx_hash")})
                        except Exception:
                            pass
                    t = threading.Thread(target=_async_retry_sweep, daemon=True)
                    t.start()
        except Exception as ex:
            import logging
            logging.getLogger(__name__).warning("Instant sweep worker error: %s", ex)

    return updated, "Deposit verified and wallet credited successfully."


def auto_credit_deposit(from_address, tx_hash, amount, to_address=None):
    """Automatically create and complete a deposit request for the matched user.
    
    This is called by the background blockchain monitor daemon.
    """
    from config.database import get_database
    db = get_database()
    
    # 1. First, check if to_address belongs to a user's HD deposit address
    user = None
    if to_address:
        from services.hd_wallet_service import find_user_by_deposit_address
        hd_entry = find_user_by_deposit_address(to_address, "TRC20")
        if hd_entry and hd_entry.get("user_id"):
            from models.user_model import find_user_by_id
            user = find_user_by_id(hd_entry["user_id"])
            
    # 2. Fallback: match by sender wallet address if user linked TronLink
    if not user and from_address:
        user = db.users.find_one({"trc20_wallet_address": from_address})
        
    if not user:
        return {"success": False, "message": "No user registered for this deposit address or sender address."}
        
    user_id = str(user["_id"])
    
    # 3. Get proper destination deposit address
    deposit_address = clean_string(to_address) or clean_string(get_crypto_network_address("TRC20"))
    explorer_url = build_explorer_url("TRC20", tx_hash)

    verification = {
        "verified": True,
        "status": "verified",
        "message": "Automated background blockchain verification successful.",
        "confirmations": 1,
        "required_confirmations": get_crypto_network_confirmations("TRC20"),
        "verified_amount": float(amount),
        "verified_to_address": deposit_address,
        "verified_from_address": from_address,
        "explorer_url": explorer_url,
    }

    # 4. Check if a deposit with this tx_hash already exists
    existing = find_deposit_by_tx_hash(tx_hash)
    if existing:
        if existing.get("status") == "completed":
            return {"success": False, "message": f"Deposit with TXID {tx_hash} already credited."}
        # Complete the existing pending deposit
        dep, msg = _credit_verified_deposit(user_id, str(existing["_id"]), verification)
        return {"success": True, "message": f"Successfully verified pending deposit {amount} USDT for user {user.get('name')}."}

    deposit_reference = f"TXD-{uuid.uuid4().hex[:12].upper()}"
    gateway_order_id = build_unique_gateway_order_id("crypto_deposit", deposit_reference)
    
    # 5. Create deposit document
    deposit_id = create_deposit(
        {
            "user_id": user_id,
            "deposit_reference": deposit_reference,
            "gateway_order_id": gateway_order_id,
            "amount": float(amount),
            "currency": "USDT",
            "status": "pending_blockchain_verification",
            "payment_method": "crypto_deposit",
            "gateway": "blockchain_auto_verification",
            "gateway_payment_id": tx_hash,
            "crypto_asset": "USDT",
            "crypto_network": "TRC20",
            "deposit_address": deposit_address,
            "deposit_address_confirmation": deposit_address,
            "address_confirmed_demo": False,
            "tx_hash": tx_hash,
            "is_demo": False,
            "explorer_url": explorer_url,
            "verification_status": "verified",
            "verification_message": "Automated background blockchain verification successful.",
            "confirmations": 1,
            "required_confirmations": get_crypto_network_confirmations("TRC20"),
            "verified_amount": float(amount),
            "verified_to_address": deposit_address,
            "remark": "Automated background credit via TRON blockchain listener.",
            "risk_note": "Automated USDT deposit.",
        }
    )
    
    # 6. Credit the wallet
    deposit, message = _credit_verified_deposit(user_id, str(deposit_id), verification)
    return {"success": True, "message": f"Successfully auto-credited {amount} USDT to user {user.get('name')} (Ref: {deposit_reference})."}



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
        from models.user_model import find_user_by_id
        user = find_user_by_id(user_id) or {}
        platform = str(user.get("selected_platform") or user.get("trading_platform") or "").lower()

        plan = str(user.get("plan") or user.get("active_plan") or "").lower()
        is_cent = plan == "cent" or "cent" in plan or bool(user.get("is_cent")) or "cent" in str(user.get("name") or "").lower()

        if is_cent:
            from services.system_settings_service import get_usdt_inr_rate
            usdt_inr_rate = float(get_usdt_inr_rate() or 88.50)
            usd_amount = round(cleaned["amount"] / usdt_inr_rate, 2)
            wallet = credit_main_wallet(
                user_id=user_id,
                amount=usd_amount,
                transaction_type="inr_deposit_credit",
                reference_id=str(deposit_id),
                description=f"INR deposit of ₹{cleaned['amount']:g} credited to Cent Main Wallet as {usd_amount * 100:g} USC. Ref: {deposit_reference}",
                currency="USDT",
                platform=platform,
            )
            deposit = find_deposit_by_id(str(deposit_id))
            return {
                "success": True,
                "message": f"INR deposit of ₹{cleaned['amount']:g} (${usd_amount:g} USD / {usd_amount * 100:g} USC) credited to Cent Main Wallet successfully.",
                "data": {
                    "wallet": format_wallet(wallet),
                    "deposit": format_deposit(deposit),
                    "reference_id": str(deposit_id),
                },
                "status_code": 200,
            }

        if platform == "mt5":
            from services.system_settings_service import get_usdt_inr_rate
            usdt_inr_rate = float(get_usdt_inr_rate() or 88.50)
            usd_amount = round(cleaned["amount"] / usdt_inr_rate, 2)

            from services.mt5_service import credit_mt5_deposit, format_mt5_account
            mt5_acc = credit_mt5_deposit(
                user_id=user_id,
                amount=usd_amount,
                reference_id=str(deposit_id),
                description=f"INR deposit of ₹{cleaned['amount']:g} credited to MT5 Account as ${usd_amount:g} USD. Ref: {deposit_reference}",
            )
            deposit = find_deposit_by_id(str(deposit_id))
            return {
                "success": True,
                "message": f"INR deposit of ₹{cleaned['amount']:g} (${usd_amount:g} USD) credited to MT5 Account successfully.",
                "data": {
                    "mt5_account": format_mt5_account(mt5_acc),
                    "deposit": format_deposit(deposit),
                    "reference_id": str(deposit_id),
                },
                "status_code": 200,
            }

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
            "currency": cleaned["crypto_asset"],
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
            "verification_message": "Company deposit address matched. Demo Main Wallet credit is being posted directly; admin approval is not required." if cleaned.get("address_confirmed_demo") else (f"Deposit received. {cleaned['crypto_asset']} Main Wallet credit is being posted directly; admin approval is not required." if is_demo_deposit else f"Deposit request created. Blockchain auto-verification pending."),
            "confirmations": 0,
            "required_confirmations": 0 if is_demo_deposit else get_crypto_network_confirmations(cleaned["crypto_network"]),
            "verified_amount": 0.0,
            "verified_to_address": "",
            "remark": "Deposit address confirmation matched the company wallet address. Demo credit posted to Main Wallet. Withdrawals still require admin approval." if cleaned.get("address_confirmed_demo") else (f"Deposit will credit {cleaned['crypto_asset']} Main Wallet directly. Withdrawals still require admin approval." if is_demo_deposit else f"Wallet credit pending only until backend blockchain auto-verification completes. No admin approval is required for deposit."),
            "risk_note": f"{cleaned['crypto_asset']} Crypto deposit.",
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

    from admin.settings_routes import get_final_settings
    system_settings = get_final_settings()
    key_id = system_settings.get("razorpay_key_id") or settings.RAZORPAY_KEY_ID
    key_secret = system_settings.get("razorpay_key_secret") or settings.RAZORPAY_KEY_SECRET

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

    from admin.settings_routes import get_final_settings
    system_settings = get_final_settings()
    key_id = system_settings.get("razorpay_key_id") or settings.RAZORPAY_KEY_ID
    key_secret = system_settings.get("razorpay_key_secret") or settings.RAZORPAY_KEY_SECRET

    is_sandbox = deposit.get("is_demo") or key_id == ""

    if not is_sandbox:
        if not razorpay_signature:
            return {"success": False, "message": "Missing payment signature.", "status_code": 400}
        import razorpay
        client = razorpay.Client(auth=(key_id, key_secret))
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


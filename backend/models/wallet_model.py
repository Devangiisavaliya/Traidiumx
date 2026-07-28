from config.database import get_database
from config.settings import settings
from services.system_settings_service import get_crypto_deposit_addresses_map
from utils.date_helper import now_utc


WALLET_CURRENCY = "USDT"
MAIN_WALLET = "main_wallet"
TRADING_WALLET = "trading_wallet"
ADMIN_PROFIT_WALLET_USER_ID = "__admin_profit_wallet__"


DEFAULT_COMPANY_DEPOSIT_ADDRESSES = {
    # Demo-safe real-format addresses only. Replace these values from backend/.env
    # with the company's real controlled wallet addresses before production use.
    "TRC20": "TQp9K7vY3Wm2N8rF4cL6Xh5A1BzDgE2sRZ",
    "ERC20": "0x8A4b2C5D7e9F0a1B3c4D6E8F901234567890AbCd",
    "BEP20": "0xB2C7e9F1A4d6E8b0C3f5A7D9e1B234567890cDEF",
}


def _company_deposit_addresses():
    addresses = get_crypto_deposit_addresses_map()
    return {
        "TRC20": (addresses.get("TRC20") or DEFAULT_COMPANY_DEPOSIT_ADDRESSES["TRC20"]).strip(),
        "ERC20": (addresses.get("ERC20") or DEFAULT_COMPANY_DEPOSIT_ADDRESSES["ERC20"]).strip(),
        "BEP20": (addresses.get("BEP20") or DEFAULT_COMPANY_DEPOSIT_ADDRESSES["BEP20"]).strip(),
    }


def _money(value):
    try:
        return round(float(value or 0.0), 8)
    except (TypeError, ValueError):
        return 0.0


def _wallet_bucket(available=0.0, locked=0.0, wallet_type="main_wallet", addresses=None):
    available = _money(available)
    locked = _money(locked)
    bucket = {
        "wallet_type": wallet_type,
        "currency": WALLET_CURRENCY,
        "available_balance": available,
        "locked_balance": locked,
        "total_balance": _money(available + locked),
        "status": "active",
    }
    if addresses is not None:
        bucket["addresses"] = addresses
    return bucket


def build_demo_wallet_addresses(user_id=None):
    # Deposit addresses are company-level addresses, not per-user generated text.
    # The user sends USDT to the configured company address, then submits TXID.
    # Withdrawals still use the user's own external wallet address and admin approval.
    return _company_deposit_addresses()


def get_wallets_collection():
    db = get_database()
    return db.wallets


def create_default_wallet(user_id):
    main_addresses = build_demo_wallet_addresses(user_id)
    wallet = {
        "user_id": str(user_id),
        "currency": WALLET_CURRENCY,
        # Top-level fields are the Trading Wallet mirror so all existing
        # futures/options services continue to use trading funds only.
        "available_balance": 0.0,
        "locked_balance": 0.0,
        "total_balance": 0.0,
        "status": "active",
        "wallet_type": "multi_wallet_account",
        "main_wallet": _wallet_bucket(0.0, 0.0, MAIN_WALLET, main_addresses),
        "trading_wallet": _wallet_bucket(0.0, 0.0, TRADING_WALLET),
        "created_at": now_utc(),
        "updated_at": now_utc()
    }

    result = get_wallets_collection().insert_one(wallet)

    return result.inserted_id


def find_wallet_by_user_id(user_id):
    return get_wallets_collection().find_one({
        "user_id": str(user_id)
    })


def normalize_wallet_currency(wallet):
    """
    Wallet account now has two user wallets:
    - main_wallet: deposits + withdrawals + transfer source
    - trading_wallet: futures/options margin wallet

    The top-level available/locked/total fields are intentionally kept as the
    trading wallet mirror so existing trading services keep working without a
    risky rewrite.
    """
    if not wallet:
        return wallet

    updates = {}
    user_id = wallet.get("user_id")
    primary_currency = str(wallet.get("primary_currency") or (wallet.get("main_wallet") or {}).get("currency") or "INR").upper()
    
    main_addresses = build_demo_wallet_addresses(user_id)
    main_inr = wallet.get("main_wallet_inr")
    main_usdt = wallet.get("main_wallet_usdt")

    # If new currency buckets are missing, initialize them
    if not main_inr or not isinstance(main_inr, dict) or not main_usdt or not isinstance(main_usdt, dict):
        legacy_main = wallet.get("main_wallet") or {}
        legacy_currency = str(legacy_main.get("currency") or wallet.get("primary_currency") or "INR").upper()
        legacy_avail = _money(legacy_main.get("available_balance", 0.0))
        legacy_locked = _money(legacy_main.get("locked_balance", 0.0))

        if legacy_currency == "INR":
            main_inr = _wallet_bucket(legacy_avail, legacy_locked, "main_wallet_inr")
            main_inr["currency"] = "INR"
            main_usdt = _wallet_bucket(0.0, 0.0, "main_wallet_usdt", main_addresses)
            main_usdt["currency"] = "USDT"
        else:
            main_usdt = _wallet_bucket(legacy_avail, legacy_locked, "main_wallet_usdt", main_addresses)
            main_usdt["currency"] = "USDT"
            main_inr = _wallet_bucket(0.0, 0.0, "main_wallet_inr")
            main_inr["currency"] = "INR"

        updates["main_wallet_inr"] = main_inr
        updates["main_wallet_usdt"] = main_usdt
    else:
        # Check and normalize main_wallet_inr
        inr_avail = _money(main_inr.get("available_balance", 0.0))
        inr_locked = _money(main_inr.get("locked_balance", 0.0))
        inr_total = _money(inr_avail + inr_locked)
        if (
            main_inr.get("currency") != "INR"
            or main_inr.get("wallet_type") != "main_wallet_inr"
            or _money(main_inr.get("total_balance", 0.0)) != inr_total
        ):
            main_inr = {
                **_wallet_bucket(inr_avail, inr_locked, "main_wallet_inr"),
                "currency": "INR",
                "available_balance": inr_avail,
                "locked_balance": inr_locked,
                "total_balance": inr_total,
            }
            updates["main_wallet_inr"] = main_inr

        # Check and normalize main_wallet_usdt
        usdt_avail = _money(main_usdt.get("available_balance", 0.0))
        usdt_locked = _money(main_usdt.get("locked_balance", 0.0))
        usdt_total = _money(usdt_avail + usdt_locked)
        if (
            main_usdt.get("currency") != "USDT"
            or main_usdt.get("wallet_type") != "main_wallet_usdt"
            or _money(main_usdt.get("total_balance", 0.0)) != usdt_total
            or not main_usdt.get("addresses")
        ):
            main_usdt = {
                **_wallet_bucket(usdt_avail, usdt_locked, "main_wallet_usdt", main_addresses),
                "currency": "USDT",
                "available_balance": usdt_avail,
                "locked_balance": usdt_locked,
                "total_balance": usdt_total,
            }
            updates["main_wallet_usdt"] = main_usdt

    # For legacy compatibility, also ensure a valid main_wallet is set
    current_main = updates.get("main_wallet_inr") or main_inr
    if primary_currency == "USDT":
        current_main = updates.get("main_wallet_usdt") or main_usdt
        
    legacy_main = {
        **current_main,
        "wallet_type": MAIN_WALLET,
    }
    if (
        not wallet.get("main_wallet")
        or wallet.get("main_wallet", {}).get("currency") != primary_currency
        or _money(wallet.get("main_wallet", {}).get("available_balance", 0.0)) != _money(legacy_main.get("available_balance", 0.0))
    ):
        updates["main_wallet"] = legacy_main

    # Dynamic Trading Wallet Selection (USDT vs INR)
    # Check current active navbar currency from the request headers
    try:
        from flask import request
        active_currency = str(request.headers.get("X-Navbar-Currency") or "USDT").strip().upper()
    except Exception:
        active_currency = "USDT"

    # Initialize sub-buckets if missing
    trading_usdt = wallet.get("trading_wallet_usdt")
    trading_inr = wallet.get("trading_wallet_inr")

    if not trading_usdt or not isinstance(trading_usdt, dict) or not trading_inr or not isinstance(trading_inr, dict):
        legacy_trading = wallet.get("trading_wallet") or {}
        legacy_avail = _money(legacy_trading.get("available_balance", 0.0))
        legacy_locked = _money(legacy_trading.get("locked_balance", 0.0))
        
        # Determine fallback base depending on legacy_currency
        if primary_currency == "INR":
            trading_inr = _wallet_bucket(legacy_avail, legacy_locked, "trading_wallet_inr")
            trading_inr["currency"] = "USDT"
            trading_usdt = _wallet_bucket(0.0, 0.0, "trading_wallet_usdt")
            trading_usdt["currency"] = "USDT"
        else:
            trading_usdt = _wallet_bucket(legacy_avail, legacy_locked, "trading_wallet_usdt")
            trading_usdt["currency"] = "USDT"
            trading_inr = _wallet_bucket(0.0, 0.0, "trading_wallet_inr")
            trading_inr["currency"] = "USDT"
            
        updates["trading_wallet_usdt"] = trading_usdt
        updates["trading_wallet_inr"] = trading_inr
    else:
        # Check and normalize trading_wallet_inr
        inr_avail = _money(trading_inr.get("available_balance", 0.0))
        inr_locked = _money(trading_inr.get("locked_balance", 0.0))
        inr_total = _money(inr_avail + inr_locked)
        if (
            trading_inr.get("currency") != "USDT"
            or trading_inr.get("wallet_type") != "trading_wallet_inr"
            or _money(trading_inr.get("total_balance", 0.0)) != inr_total
        ):
            trading_inr = {
                **_wallet_bucket(inr_avail, inr_locked, "trading_wallet_inr"),
                "currency": "USDT",
                "available_balance": inr_avail,
                "locked_balance": inr_locked,
                "total_balance": inr_total,
            }
            updates["trading_wallet_inr"] = trading_inr

        # Check and normalize trading_wallet_usdt
        usdt_avail = _money(trading_usdt.get("available_balance", 0.0))
        usdt_locked = _money(trading_usdt.get("locked_balance", 0.0))
        usdt_total = _money(usdt_avail + usdt_locked)
        if (
            trading_usdt.get("currency") != "USDT"
            or trading_usdt.get("wallet_type") != "trading_wallet_usdt"
            or _money(trading_usdt.get("total_balance", 0.0)) != usdt_total
        ):
            trading_usdt = {
                **_wallet_bucket(usdt_avail, usdt_locked, "trading_wallet_usdt"),
                "currency": "USDT",
                "available_balance": usdt_avail,
                "locked_balance": usdt_locked,
                "total_balance": usdt_total,
            }
            updates["trading_wallet_usdt"] = trading_usdt

    # Mirror active trading sub-bucket to the top-level trading_wallet representation
    active_trading = updates.get("trading_wallet_inr") or trading_inr
    if active_currency == "USDT":
        active_trading = updates.get("trading_wallet_usdt") or trading_usdt

    trading_available = _money(active_trading.get("available_balance", 0.0))
    trading_locked = _money(active_trading.get("locked_balance", 0.0))
    trading_total = _money(trading_available + trading_locked)

    trading_source = {
        **_wallet_bucket(trading_available, trading_locked, TRADING_WALLET),
        "currency": "USDT",
        "available_balance": trading_available,
        "locked_balance": trading_locked,
        "total_balance": trading_total,
    }
    updates["trading_wallet"] = trading_source

    top_available = trading_available
    top_locked = trading_locked
    top_total = trading_total
    
    updates["available_balance"] = top_available
    updates["locked_balance"] = top_locked
    updates["total_balance"] = top_total

    if wallet.get("currency") != WALLET_CURRENCY:
        updates["currency"] = WALLET_CURRENCY
    if wallet.get("wallet_type") != "multi_wallet_account":
        updates["wallet_type"] = "multi_wallet_account"

    if updates:
        updates["updated_at"] = now_utc()
        get_wallets_collection().update_one({"_id": wallet["_id"]}, {"$set": updates})
        wallet = find_wallet_by_user_id(wallet.get("user_id"))

    return wallet


def ensure_admin_profit_wallet():
    wallet = find_wallet_by_user_id(ADMIN_PROFIT_WALLET_USER_ID)
    if wallet:
        return normalize_wallet_currency(wallet)

    wallet = {
        "user_id": ADMIN_PROFIT_WALLET_USER_ID,
        "currency": WALLET_CURRENCY,
        "available_balance": 0.0,
        "locked_balance": 0.0,
        "total_balance": 0.0,
        "status": "active",
        "wallet_type": "admin_profit_wallet",
        "main_wallet": _wallet_bucket(0.0, 0.0, "admin_profit_wallet", {}),
        "trading_wallet": _wallet_bucket(0.0, 0.0, TRADING_WALLET),
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    get_wallets_collection().insert_one(wallet)
    return find_wallet_by_user_id(ADMIN_PROFIT_WALLET_USER_ID)


def format_wallet_bucket(bucket, fallback_type, fallback_currency=WALLET_CURRENCY):
    bucket = bucket or {}
    available = _money(bucket.get("available_balance", 0.0))
    locked = _money(bucket.get("locked_balance", 0.0))
    return {
        "wallet_type": bucket.get("wallet_type", fallback_type),
        "currency": bucket.get("currency", fallback_currency),
        "available_balance": available,
        "locked_balance": locked,
        "total_balance": _money(bucket.get("total_balance", available + locked)),
        "status": bucket.get("status", "active"),
        "addresses": bucket.get("addresses", {}),
    }


def format_wallet(wallet):
    if not wallet:
        return None

    wallet = normalize_wallet_currency(wallet)
    primary_currency = wallet.get("primary_currency") or wallet.get("main_wallet", {}).get("currency") or "INR"
    is_currency_locked = False

    main_wallet = format_wallet_bucket(wallet.get("main_wallet"), MAIN_WALLET, primary_currency)
    trading_wallet = format_wallet_bucket(wallet.get("trading_wallet"), TRADING_WALLET, WALLET_CURRENCY)
    main_wallet_inr = format_wallet_bucket(wallet.get("main_wallet_inr"), "main_wallet_inr", "INR")
    main_wallet_usdt = format_wallet_bucket(wallet.get("main_wallet_usdt"), "main_wallet_usdt", "USDT")

    from services.system_settings_service import get_usdt_inr_rate
    usdt_rate = float(get_usdt_inr_rate() or 88.50)

    return {
        "id": str(wallet["_id"]),
        "user_id": wallet.get("user_id"),
        "currency": primary_currency,
        "primary_currency": primary_currency,
        "is_currency_locked": is_currency_locked,
        "usdt_inr_rate": usdt_rate,
        "wallet_type": wallet.get("wallet_type", "multi_wallet_account"),
        # Backward-compatible top-level values = Trading Wallet.
        "available_balance": trading_wallet["available_balance"],
        "locked_balance": trading_wallet["locked_balance"],
        "total_balance": trading_wallet["total_balance"],
        "status": wallet.get("status", "active"),
        "main_wallet": main_wallet,
        "trading_wallet": trading_wallet,
        "main_wallet_inr": main_wallet_inr,
        "main_wallet_usdt": main_wallet_usdt,
        "trading_wallet_usdt": format_wallet_bucket(wallet.get("trading_wallet_usdt"), "trading_wallet_usdt", WALLET_CURRENCY),
        "trading_wallet_inr": format_wallet_bucket(wallet.get("trading_wallet_inr"), "trading_wallet_inr", WALLET_CURRENCY),
        "deposit_wallet": main_wallet,
        "withdrawal_wallet": main_wallet,
    }



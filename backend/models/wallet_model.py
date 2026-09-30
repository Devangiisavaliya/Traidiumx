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
    "BITCOIN": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    "SOLANA": "HN7cAB2133LQV7t3W3x2fGfY1c5f3c5f3c5f3c5f3c5f",
    "RIPPLE": "rEb8QCgNs9rkec2QCQKsE2wo9T3p45WstX",
    "CARDANO": "Ae2tdPwUPEYx5g5P7w5UaXfGfM4vXfP5p3d",
}


def _company_deposit_addresses():
    addresses = get_crypto_deposit_addresses_map()
    return {
        "TRC20": (addresses.get("TRC20") or DEFAULT_COMPANY_DEPOSIT_ADDRESSES["TRC20"]).strip(),
        "ERC20": (addresses.get("ERC20") or DEFAULT_COMPANY_DEPOSIT_ADDRESSES["ERC20"]).strip(),
        "BEP20": (addresses.get("BEP20") or DEFAULT_COMPANY_DEPOSIT_ADDRESSES["BEP20"]).strip(),
        "BITCOIN": (addresses.get("BITCOIN") or DEFAULT_COMPANY_DEPOSIT_ADDRESSES["BITCOIN"]).strip(),
        "SOLANA": (addresses.get("SOLANA") or DEFAULT_COMPANY_DEPOSIT_ADDRESSES["SOLANA"]).strip(),
        "RIPPLE": (addresses.get("RIPPLE") or DEFAULT_COMPANY_DEPOSIT_ADDRESSES["RIPPLE"]).strip(),
        "CARDANO": (addresses.get("CARDANO") or DEFAULT_COMPANY_DEPOSIT_ADDRESSES["CARDANO"]).strip(),
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
    if not user_id:
        return _company_deposit_addresses()

    try:
        from services.hd_wallet_service import get_or_create_user_deposit_address
        trc20_address = get_or_create_user_deposit_address(user_id, "TRC20")
        bep20_address = get_or_create_user_deposit_address(user_id, "BEP20")
        erc20_address = get_or_create_user_deposit_address(user_id, "ERC20")
    except Exception:
        trc20_address = "TPDQ3DTMQWSg4iJ7dhKXsSAKT83jfD49GP"
        bep20_address = "0xB2C7e9F1A4d6E8b0C3f5A7D9e1B234567890cDEF"
        erc20_address = "0xB2C7e9F1A4d6E8b0C3f5A7D9e1B234567890cDEF"

    import hashlib
    # Deterministic generation using user_id for remaining networks
    def gen_addr(network):
        if network == "TRC20":
            return trc20_address
        if network == "BEP20":
            return bep20_address
        if network == "ERC20":
            return erc20_address
        h = hashlib.sha256(f"{user_id}_{network}".encode()).hexdigest()
        if network == "BITCOIN":
            return "1" + h[:33]
        elif network == "SOLANA":
            alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
            seed = int(h, 16)
            res = []
            while seed > 0 and len(res) < 44:
                res.append(alphabet[seed % 58])
                seed = seed // 58
            return "".join(res).zfill(44)
        elif network == "RIPPLE":
            return "r" + h[:33]
        elif network == "CARDANO":
            return "Ae2td" + h[:28]
        elif network == "INTERNAL":
            return "txinr" + h[:35]
        return "0x" + h[:40]

    return {
        "TRC20": trc20_address,
        "ERC20": gen_addr("ERC20"),
        "BEP20": gen_addr("BEP20"),
        "BITCOIN": gen_addr("BITCOIN"),
        "SOLANA": gen_addr("SOLANA"),
        "RIPPLE": gen_addr("RIPPLE"),
        "CARDANO": gen_addr("CARDANO"),
        "INTERNAL": gen_addr("INTERNAL"),
    }



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

    SUPPORTED_ASSETS = ["INR", "USDT", "BTC", "ETH", "SOL", "USDC", "BNB", "XRP", "ADA"]
    
    # Fast path: if wallet is already initialized with all buckets, avoid slow HD derivation
    is_fully_normalized = True
    for asset in SUPPORTED_ASSETS:
        asset_lower = asset.lower()
        if f"main_wallet_{asset_lower}" not in wallet or f"trading_wallet_{asset_lower}" not in wallet:
            is_fully_normalized = False
            break
            
    if is_fully_normalized and wallet.get("primary_currency"):
        return wallet

    updates = {}
    user_id = wallet.get("user_id")
    primary_currency = str(wallet.get("primary_currency") or (wallet.get("main_wallet") or {}).get("currency") or "INR").upper()
    
    main_addresses = build_demo_wallet_addresses(user_id)
    
    coin_to_network = {
        "USDT": "TRC20",
        "USDC": "ERC20",
        "BTC": "BITCOIN",
        "ETH": "ERC20",
        "SOL": "SOLANA",
        "BNB": "BEP20",
        "XRP": "RIPPLE",
        "ADA": "CARDANO",
        "INR": "INTERNAL"
    }

    # 1. Initialize and normalize all currency buckets
    for asset in SUPPORTED_ASSETS:
        asset_lower = asset.lower()
        main_key = f"main_wallet_{asset_lower}"
        trading_key = f"trading_wallet_{asset_lower}"

        # Get primary address map for this asset
        asset_addresses = None
        if main_addresses:
            expected_net = coin_to_network.get(asset)
            expected_addr = main_addresses.get(expected_net)
            if expected_net and expected_addr:
                asset_addresses = {expected_net: expected_addr}

        # Initialize/normalize main_wallet_<asset>
        main_bucket = wallet.get(main_key)
        avail = 0.0
        locked = 0.0

        if asset == primary_currency and not main_bucket:
            legacy_main = wallet.get("main_wallet") or {}
            if str(legacy_main.get("currency") or "").upper() == primary_currency:
                avail = _money(legacy_main.get("available_balance", 0.0))
                locked = _money(legacy_main.get("locked_balance", 0.0))

        if not main_bucket or not isinstance(main_bucket, dict):
            main_bucket = _wallet_bucket(avail, locked, main_key, asset_addresses)
            main_bucket["currency"] = asset
            updates[main_key] = main_bucket
        else:
            inr_avail = _money(main_bucket.get("available_balance", 0.0))
            inr_locked = _money(main_bucket.get("locked_balance", 0.0))
            inr_total = _money(inr_avail + inr_locked)
            
            is_legacy = False
            expected_net = coin_to_network.get(asset)
            expected_addr = main_addresses.get(expected_net) if expected_net else None
            
            if expected_net and expected_addr:
                stored_addresses = main_bucket.get("addresses") or {}
                if len(stored_addresses) != 1 or expected_net not in stored_addresses or stored_addresses[expected_net] != expected_addr:
                    is_legacy = True

            if (
                main_bucket.get("currency") != asset
                or main_bucket.get("wallet_type") != main_key
                or _money(main_bucket.get("available_balance", 0.0)) != inr_avail
                or _money(main_bucket.get("locked_balance", 0.0)) != inr_locked
                or _money(main_bucket.get("total_balance", 0.0)) != inr_total
                or (expected_net and (not main_bucket.get("addresses") or is_legacy))
            ):
                main_bucket = {
                    **_wallet_bucket(inr_avail, inr_locked, main_key, asset_addresses),
                    "currency": asset,
                    "available_balance": inr_avail,
                    "locked_balance": inr_locked,
                    "total_balance": inr_total,
                }
                updates[main_key] = main_bucket

        # Initialize/normalize trading_wallet_<asset>
        trading_bucket = wallet.get(trading_key)
        t_avail = 0.0
        t_locked = 0.0

        if asset == primary_currency and not trading_bucket:
            legacy_trading = wallet.get("trading_wallet") or {}
            t_avail = _money(legacy_trading.get("available_balance", 0.0))
            t_locked = _money(legacy_trading.get("locked_balance", 0.0))

        if not trading_bucket or not isinstance(trading_bucket, dict):
            trading_bucket = _wallet_bucket(t_avail, t_locked, trading_key)
            trading_bucket["currency"] = "USDT"
            updates[trading_key] = trading_bucket
        else:
            inr_avail = _money(trading_bucket.get("available_balance", 0.0))
            inr_locked = _money(trading_bucket.get("locked_balance", 0.0))
            inr_total = _money(inr_avail + inr_locked)
            if (
                trading_bucket.get("currency") != "USDT"
                or trading_bucket.get("wallet_type") != trading_key
                or _money(trading_bucket.get("available_balance", 0.0)) != inr_avail
                or _money(trading_bucket.get("locked_balance", 0.0)) != inr_locked
                or _money(trading_bucket.get("total_balance", 0.0)) != inr_total
            ):
                trading_bucket = {
                    **_wallet_bucket(inr_avail, inr_locked, trading_key),
                    "currency": "USDT",
                    "available_balance": inr_avail,
                    "locked_balance": inr_locked,
                    "total_balance": inr_total,
                }
                updates[trading_key] = trading_bucket

    # For legacy compatibility, also ensure a valid main_wallet is set
    current_main_key = f"main_wallet_{primary_currency.lower()}"
    current_main = updates.get(current_main_key) or wallet.get(current_main_key)
    if not current_main:
        current_main = updates.get("main_wallet_usdt") or wallet.get("main_wallet_usdt")

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

    try:
        from flask import request
        active_currency = request.headers.get("X-Navbar-Currency")
        if not active_currency:
            from config.database import get_database
            from bson import ObjectId
            db = get_database()
            user = db.users.find_one({"_id": ObjectId(wallet.get("user_id"))})
            active_currency = user.get("last_navbar_currency") if user else "USDT"
    except Exception:
        active_currency = "USDT"

    active_currency = str(active_currency or "USDT").strip().upper()
    if active_currency not in ("INR", "USDT"):
        active_currency = "USDT"

    active_trading_key = f"trading_wallet_{active_currency.lower()}"
    active_trading = updates.get(active_trading_key) or wallet.get(active_trading_key)

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

    updates["available_balance"] = trading_available
    updates["locked_balance"] = trading_locked
    updates["total_balance"] = trading_total

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
    is_currency_locked = wallet.get("is_currency_locked", False)

    main_wallet = format_wallet_bucket(wallet.get("main_wallet"), MAIN_WALLET, primary_currency)
    trading_wallet = format_wallet_bucket(wallet.get("trading_wallet"), TRADING_WALLET, WALLET_CURRENCY)

    from services.system_settings_service import get_usdt_inr_rate
    usdt_rate = float(get_usdt_inr_rate() or 88.50)

    formatted = {
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
        "deposit_wallet": main_wallet,
        "withdrawal_wallet": main_wallet,
    }

    # Add dynamic main and trading buckets
    SUPPORTED_ASSETS = ["INR", "USDT", "BTC", "ETH", "SOL", "USDC", "BNB", "XRP", "ADA"]
    for asset in SUPPORTED_ASSETS:
        asset_lower = asset.lower()
        formatted[f"main_wallet_{asset_lower}"] = format_wallet_bucket(wallet.get(f"main_wallet_{asset_lower}"), f"main_wallet_{asset_lower}", asset)
        formatted[f"trading_wallet_{asset_lower}"] = format_wallet_bucket(wallet.get(f"trading_wallet_{asset_lower}"), f"trading_wallet_{asset_lower}", "USDT")

    return formatted



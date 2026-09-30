from config.database import get_database
from config.settings import settings
from utils.validators import clean_string


SETTINGS_KEY = "main"

CRYPTO_DEPOSIT_DEFAULTS = {
    "TRC20": "TW5dUozuu2twx31cvH8NUBceFKn9TnPNLJ",
    "ERC20": "0x8A4b2C5D7e9F0a1B3c4D6E8F901234567890AbCd",
    "BEP20": "0xB2C7e9F1A4d6E8b0C3f5A7D9e1B234567890cDEF",
    "BITCOIN": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    "SOLANA": "HN7cAB2133LQV7t3W3x2fGfY1c5f3c5f3c5f3c5f3c5f",
    "RIPPLE": "rEb8QCgNs9rkec2QCQKsE2wo9T3p45WstX",
    "CARDANO": "Ae2tdPwUPEYx5g5P7w5UaXfGfM4vXfP5p3d",
    "ETH": "0x8A4b2C5D7e9F0a1B3c4D6E8F901234567890AbCd",
    "USDC": "0x8A4b2C5D7e9F0a1B3c4D6E8F901234567890AbCd",
    "BNB": "0xB2C7e9F1A4d6E8b0C3f5A7D9e1B234567890cDEF",
}

ADDRESS_SETTING_KEYS = {
    "TRC20": "crypto_deposit_usdt_trc20_address",
    "ERC20": "crypto_deposit_usdt_erc20_address",
    "BEP20": "crypto_deposit_usdt_bep20_address",
    "BITCOIN": "crypto_deposit_btc_address",
    "SOLANA": "crypto_deposit_sol_address",
    "RIPPLE": "crypto_deposit_xrp_address",
    "CARDANO": "crypto_deposit_ada_address",
    "ETH": "crypto_deposit_eth_address",
    "USDC": "crypto_deposit_usdc_address",
    "BNB": "crypto_deposit_bnb_address",
}

ENV_ADDRESS_KEYS = {
    "TRC20": "CRYPTO_DEPOSIT_USDT_TRC20_ADDRESS",
    "ERC20": "CRYPTO_DEPOSIT_USDT_ERC20_ADDRESS",
    "BEP20": "CRYPTO_DEPOSIT_USDT_BEP20_ADDRESS",
    "BITCOIN": "CRYPTO_DEPOSIT_BTC_ADDRESS",
    "SOLANA": "CRYPTO_DEPOSIT_SOL_ADDRESS",
    "RIPPLE": "CRYPTO_DEPOSIT_XRP_ADDRESS",
    "CARDANO": "CRYPTO_DEPOSIT_ADA_ADDRESS",
    "ETH": "CRYPTO_DEPOSIT_ETH_ADDRESS",
    "USDC": "CRYPTO_DEPOSIT_USDC_ADDRESS",
    "BNB": "CRYPTO_DEPOSIT_BNB_ADDRESS",
}


def _to_float(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


_settings_cache = {"data": None, "updated_at": 0}


def clear_settings_cache():
    _settings_cache["data"] = None
    _settings_cache["updated_at"] = 0


def get_runtime_system_settings():
    """Read admin saved settings without importing admin routes.

    This keeps user wallet/deposit services using the values saved from
    Admin > Settings immediately. If Mongo is unavailable, backend .env stays
    as a safe fallback.
    """
    now = time.time()
    if _settings_cache["data"] is not None and now - _settings_cache["updated_at"] < 30:
        return _settings_cache["data"]

    try:
        db = get_database()
        data = (
            db.system_settings.find_one({"settings_key": SETTINGS_KEY})
            or db.system_settings.find_one(sort=[("updated_at", -1)])
            or {}
        )
        _settings_cache["data"] = data
        _settings_cache["updated_at"] = now
        return data
    except Exception as error:
        print("SYSTEM SETTINGS READ ERROR:", str(error))
        return _settings_cache["data"] or {}


def get_crypto_deposit_address(network):
    network = clean_string(network).upper()
    setting_key = ADDRESS_SETTING_KEYS.get(network)
    env_key = ENV_ADDRESS_KEYS.get(network)
    if not setting_key or not env_key:
        return ""

    saved = get_runtime_system_settings()
    saved_address = clean_string(saved.get(setting_key))
    env_address = clean_string(getattr(settings, env_key, ""))
    return saved_address or env_address or CRYPTO_DEPOSIT_DEFAULTS.get(network, "")


def get_crypto_deposit_addresses_map():
    return {
        "TRC20": get_crypto_deposit_address("TRC20"),
        "ERC20": get_crypto_deposit_address("ERC20"),
        "BEP20": get_crypto_deposit_address("BEP20"),
        "BITCOIN": get_crypto_deposit_address("BITCOIN"),
        "SOLANA": get_crypto_deposit_address("SOLANA"),
        "RIPPLE": get_crypto_deposit_address("RIPPLE"),
        "CARDANO": get_crypto_deposit_address("CARDANO"),
        "ETH": get_crypto_deposit_address("ETH"),
        "USDC": get_crypto_deposit_address("USDC"),
        "BNB": get_crypto_deposit_address("BNB"),
    }


def get_crypto_deposit_min_usdt():
    saved = get_runtime_system_settings()
    return _to_float(saved.get("crypto_deposit_min_usdt"), float(getattr(settings, "CRYPTO_DEPOSIT_MIN_USDT", 10)))


def get_crypto_deposit_max_usdt():
    saved = get_runtime_system_settings()
    return _to_float(saved.get("crypto_deposit_max_usdt"), float(getattr(settings, "CRYPTO_DEPOSIT_MAX_USDT", 1000000)))


import time
import requests

_usdt_rate_cache = {"rate": 88.50, "updated_at": 0}


def get_usdt_inr_rate():
    now = time.time()
    # Cache successful fetches for 5 minutes (300 seconds) to prevent excessive network requests
    if now - _usdt_rate_cache["updated_at"] < 300:
        return _usdt_rate_cache["rate"]

    try:
        saved = get_runtime_system_settings()
        custom_rate = _to_float(saved.get("usdt_inr_rate"), 0.0)
        if custom_rate > 0:
            _usdt_rate_cache["rate"] = custom_rate
            _usdt_rate_cache["updated_at"] = now
            return custom_rate
    except Exception:
        pass

    try:
        # Reduced timeout to 1.5s to fail-fast and avoid blocking backend handlers
        res = requests.get("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr", timeout=1.5)
        if res.status_code == 200:
            data = res.json()
            rate = float(data.get("tether", {}).get("inr", 88.50))
            if rate > 0:
                _usdt_rate_cache["rate"] = rate
                _usdt_rate_cache["updated_at"] = now
                return rate
        else:
            # Non-200 responses: cache the failure state for 60s (retry cooldown)
            _usdt_rate_cache["updated_at"] = now - 240
    except Exception as error:
        print("USDT RATE FETCH NOTICE:", str(error))
        # Network/Timeout exceptions: cache the failure state for 60s (retry cooldown)
        _usdt_rate_cache["updated_at"] = now - 240

    return _usdt_rate_cache.get("rate", 88.50)


def get_inr_deposit_details():
    saved = get_runtime_system_settings()
    return {
        "upi_id": saved.get("inr_deposit_upi_id") or "traidiumx@upi",
        "account_name": saved.get("inr_deposit_account_name") or "TraidiumX Trading Services Pvt Ltd",
        "bank_name": saved.get("inr_deposit_bank_name") or "HDFC Bank",
        "account_number": saved.get("inr_deposit_account_number") or "50100498765432",
        "ifsc_code": saved.get("inr_deposit_ifsc_code") or "HDFC0000128",
        "min_deposit_inr": _to_float(saved.get("inr_deposit_min"), 100.0),
        "max_deposit_inr": _to_float(saved.get("inr_deposit_max"), 500000.0),
    }



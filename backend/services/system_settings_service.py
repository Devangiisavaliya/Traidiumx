from config.database import get_database
from config.settings import settings
from utils.validators import clean_string


SETTINGS_KEY = "main"

CRYPTO_DEPOSIT_DEFAULTS = {
    "TRC20": "TQp9K7vY3Wm2N8rF4cL6Xh5A1BzDgE2sRZ",
    "ERC20": "0x8A4b2C5D7e9F0a1B3c4D6E8F901234567890AbCd",
    "BEP20": "0xB2C7e9F1A4d6E8b0C3f5A7D9e1B234567890cDEF",
}

ADDRESS_SETTING_KEYS = {
    "TRC20": "crypto_deposit_usdt_trc20_address",
    "ERC20": "crypto_deposit_usdt_erc20_address",
    "BEP20": "crypto_deposit_usdt_bep20_address",
}

ENV_ADDRESS_KEYS = {
    "TRC20": "CRYPTO_DEPOSIT_USDT_TRC20_ADDRESS",
    "ERC20": "CRYPTO_DEPOSIT_USDT_ERC20_ADDRESS",
    "BEP20": "CRYPTO_DEPOSIT_USDT_BEP20_ADDRESS",
}


def _to_float(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def get_runtime_system_settings():
    """Read admin saved settings without importing admin routes.

    This keeps user wallet/deposit services using the values saved from
    Admin > Settings immediately. If Mongo is unavailable, backend .env stays
    as a safe fallback.
    """
    try:
        db = get_database()
        return (
            db.system_settings.find_one({"settings_key": SETTINGS_KEY})
            or db.system_settings.find_one(sort=[("updated_at", -1)])
            or {}
        )
    except Exception as error:
        print("SYSTEM SETTINGS READ ERROR:", str(error))
        return {}


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
    if now - _usdt_rate_cache["updated_at"] < 60:
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
        res = requests.get("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr", timeout=3)
        if res.status_code == 200:
            data = res.json()
            rate = float(data.get("tether", {}).get("inr", 88.50))
            if rate > 0:
                _usdt_rate_cache["rate"] = rate
                _usdt_rate_cache["updated_at"] = now
                return rate
    except Exception as error:
        print("USDT RATE FETCH NOTICE:", str(error))

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



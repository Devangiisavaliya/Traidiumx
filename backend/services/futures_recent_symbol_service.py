import re

from models.futures_recent_symbol_model import (
    delete_expired_user_recent_symbols,
    delete_user_recent_symbol,
    format_recent_symbol,
    format_recent_symbols,
    get_user_recent_symbols,
    upsert_user_recent_symbol,
)


SUPPORTED_FUTURES_SYMBOLS = {
    "BTCUSDT": "BTC-USDT",
    "ETHUSDT": "ETH-USDT",
    "BNBUSDT": "BNB-USDT",
    "SOLUSDT": "SOL-USDT",
    "XRPUSDT": "XRP-USDT",
    "DOGEUSDT": "DOGE-USDT",
    "ADAUSDT": "ADA-USDT",
    "AVAXUSDT": "AVAX-USDT",
    "LINKUSDT": "LINK-USDT",
    "LTCUSDT": "LTC-USDT",
    "TRXUSDT": "TRX-USDT",
    "DOTUSDT": "DOT-USDT",
    "BCHUSDT": "BCH-USDT",
    "ATOMUSDT": "ATOM-USDT",
    "UNIUSDT": "UNI-USDT",
    "APTUSDT": "APT-USDT",
    "XAUUSD": "XAUUSD",
}


def normalize_futures_symbol(value):
    return re.sub(r"[^A-Z0-9]", "", str(value or "").strip().upper())


def record_user_recent_futures_symbol(user_id, payload):
    symbol = normalize_futures_symbol((payload or {}).get("symbol"))

    if symbol not in SUPPORTED_FUTURES_SYMBOLS:
        return {
            "success": False,
            "message": "Unsupported futures symbol.",
            "errors": {"symbol": "Select a supported TraidiumX futures market."},
            "status_code": 422,
        }

    delete_expired_user_recent_symbols(user_id)
    saved = upsert_user_recent_symbol(
        user_id=user_id,
        symbol=symbol,
        label=SUPPORTED_FUTURES_SYMBOLS[symbol],
    )
    recent_symbols = get_user_recent_symbols(user_id)

    return {
        "success": True,
        "message": "Recently viewed futures symbol updated.",
        "data": {
            "recent_symbol": format_recent_symbol(saved),
            "symbols": format_recent_symbols(recent_symbols),
            "retention_days": 7,
        },
        "status_code": 200,
    }


def get_user_recent_futures_symbols(user_id):
    delete_expired_user_recent_symbols(user_id)
    recent_symbols = get_user_recent_symbols(user_id)

    return {
        "success": True,
        "message": "Recently viewed futures symbols loaded.",
        "data": {
            "symbols": format_recent_symbols(recent_symbols),
            "retention_days": 7,
        },
        "status_code": 200,
    }


def remove_user_recent_futures_symbol(user_id, symbol):
    normalized = normalize_futures_symbol(symbol)
    delete_user_recent_symbol(user_id, normalized)
    delete_expired_user_recent_symbols(user_id)
    recent_symbols = get_user_recent_symbols(user_id)

    return {
        "success": True,
        "message": "Recently viewed futures symbol removed.",
        "data": {
            "symbols": format_recent_symbols(recent_symbols),
            "retention_days": 7,
        },
        "status_code": 200,
    }

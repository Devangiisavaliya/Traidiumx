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
    "NEARUSDT": "NEAR-USDT",
    "SUIUSDT": "SUI-USDT",
    "1000PEPEUSDT": "PEPE-USDT",
    "PEPEUSDT": "PEPE-USDT",
    "1000SHIBUSDT": "SHIB-USDT",
    "SHIBUSDT": "SHIB-USDT",
    "MATICUSDT": "MATIC-USDT",
    "ARBUSDT": "ARB-USDT",
    "OPUSDT": "OP-USDT",
    "INJUSDT": "INJ-USDT",
    "WIFUSDT": "WIF-USDT",
    "FETUSDT": "FET-USDT",
    "TIAUSDT": "TIA-USDT",
    "FILUSDT": "FIL-USDT",
    "ETCUSDT": "ETC-USDT",
    "XLMUSDT": "XLM-USDT",
    "RENDERUSDT": "RENDER-USDT",
    "SEIUSDT": "SEI-USDT",
    "ICPUSDT": "ICP-USDT",
    "FTMUSDT": "FTM-USDT",
    "XAUUSD": "XAUUSD",
}


def normalize_futures_symbol(value):
    return re.sub(r"[^A-Z0-9]", "", str(value or "").strip().upper())


def _get_symbol_label(symbol):
    if symbol in SUPPORTED_FUTURES_SYMBOLS:
        return SUPPORTED_FUTURES_SYMBOLS[symbol]
    if symbol.endswith("USDT"):
        base = symbol[:-4]
        return f"{base}-USDT"
    if symbol.endswith("USD"):
        base = symbol[:-3]
        return f"{base}-USD"
    return symbol


def record_user_recent_futures_symbol(user_id, payload):
    symbol = normalize_futures_symbol((payload or {}).get("symbol"))

    if not symbol or len(symbol) < 3:
        return {
            "success": False,
            "message": "Unsupported futures symbol.",
            "errors": {"symbol": "Select a supported TraidiumX futures market."},
            "status_code": 422,
        }

    label = _get_symbol_label(symbol)

    delete_expired_user_recent_symbols(user_id)
    saved = upsert_user_recent_symbol(
        user_id=user_id,
        symbol=symbol,
        label=label,
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

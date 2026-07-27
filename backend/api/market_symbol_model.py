from config.database import get_database
from utils.date_helper import now_utc


def get_market_symbols_collection():
    db = get_database()
    return db.market_symbols


def upsert_market_symbol(symbol_data):
    symbol = symbol_data["symbol"].upper()

    symbol_data["symbol"] = symbol
    symbol_data["updated_at"] = now_utc()

    get_market_symbols_collection().update_one(
        {
            "symbol": symbol
        },
        {
            "$set": symbol_data,
            "$setOnInsert": {
                "created_at": now_utc()
            }
        },
        upsert=True
    )

    return get_market_symbols_collection().find_one({
        "symbol": symbol
    })


def get_active_market_symbols():
    symbols = get_market_symbols_collection().find({
        "is_active": True
    }).sort("sort_order", 1)

    return list(symbols)


def find_market_symbol(symbol):
    return get_market_symbols_collection().find_one({
        "symbol": symbol.upper()
    })


def format_market_symbol(symbol):
    if not symbol:
        return None

    return {
        "id": str(symbol["_id"]),
        "symbol": symbol.get("symbol"),
        "base_asset": symbol.get("base_asset"),
        "quote_asset": symbol.get("quote_asset", "USDT"),
        "display_name": symbol.get("display_name"),
        "market_type": symbol.get("market_type", "futures"),
        "min_qty": symbol.get("min_qty", 0.001),
        "max_leverage": symbol.get("max_leverage", 20),
        "price_precision": symbol.get("price_precision", 2),
        "quantity_precision": symbol.get("quantity_precision", 3),
        "is_active": symbol.get("is_active", True),
        "sort_order": symbol.get("sort_order", 0),
        "provider": symbol.get("provider", "binance_futures"),
        "provider_symbol": symbol.get("provider_symbol"),
        "ui_symbol": symbol.get("ui_symbol"),
        "status": "active" if symbol.get("is_active", True) else "inactive"
    }


def format_market_symbols(symbols):
    return [format_market_symbol(symbol) for symbol in symbols]
from datetime import datetime
import threading
import time

import requests

from config.settings import settings
from models.market_symbol_model import (
    find_market_symbol,
    format_market_symbol,
    format_market_symbols,
    get_active_market_symbols,
    upsert_market_symbol
)
from utils.validators import clean_string, validate_market_symbol


GOLD_SYMBOLS = ["XAUUSD", "GOLDUSD"]
BINANCE_SYMBOL_ALIASES = {
    "XAUUSD": "XAUUSDT",
    "GOLDUSD": "XAUUSDT"
}

_PREMIUM_INDEX_CACHE = {}
_PREMIUM_INDEX_CACHE_LOCK = threading.Lock()
_PREMIUM_INDEX_CACHE_SECONDS = 0.2
_TICKER_CACHE = {}
_TICKER_CACHE_LOCK = threading.Lock()
_TICKER_CACHE_SECONDS = 0.2


DEFAULT_SYMBOLS = [
    {
        "symbol": "BTCUSDT",
        "base_asset": "BTC",
        "quote_asset": "USDT",
        "display_name": "Bitcoin / USDT",
        "market_type": "futures",
        "min_qty": 0.001,
        "max_leverage": 50,
        "price_precision": 2,
        "quantity_precision": 3,
        "is_active": True,
        "sort_order": 1
    },
    {
        "symbol": "ETHUSDT",
        "base_asset": "ETH",
        "quote_asset": "USDT",
        "display_name": "Ethereum / USDT",
        "market_type": "futures",
        "min_qty": 0.01,
        "max_leverage": 50,
        "price_precision": 2,
        "quantity_precision": 2,
        "is_active": True,
        "sort_order": 2
    },
    {
        "symbol": "BNBUSDT",
        "base_asset": "BNB",
        "quote_asset": "USDT",
        "display_name": "BNB / USDT",
        "market_type": "futures",
        "min_qty": 0.01,
        "max_leverage": 25,
        "price_precision": 2,
        "quantity_precision": 2,
        "is_active": True,
        "sort_order": 3
    },
    {
        "symbol": "SOLUSDT",
        "base_asset": "SOL",
        "quote_asset": "USDT",
        "display_name": "Solana / USDT",
        "market_type": "futures",
        "min_qty": 0.1,
        "max_leverage": 25,
        "price_precision": 3,
        "quantity_precision": 1,
        "is_active": True,
        "sort_order": 4
    },
    {
        "symbol": "XRPUSDT",
        "base_asset": "XRP",
        "quote_asset": "USDT",
        "display_name": "XRP / USDT",
        "market_type": "futures",
        "min_qty": 1,
        "max_leverage": 20,
        "price_precision": 4,
        "quantity_precision": 0,
        "is_active": True,
        "sort_order": 5
    },
    {
        "symbol": "DOGEUSDT",
        "base_asset": "DOGE",
        "quote_asset": "USDT",
        "display_name": "Dogecoin / USDT",
        "market_type": "futures",
        "min_qty": 1,
        "max_leverage": 20,
        "price_precision": 5,
        "quantity_precision": 0,
        "is_active": True,
        "sort_order": 6
    },
    {
        "symbol": "ADAUSDT",
        "base_asset": "ADA",
        "quote_asset": "USDT",
        "display_name": "Cardano / USDT",
        "market_type": "futures",
        "min_qty": 1,
        "max_leverage": 20,
        "price_precision": 5,
        "quantity_precision": 0,
        "is_active": True,
        "sort_order": 7
    },
    {
        "symbol": "AVAXUSDT",
        "base_asset": "AVAX",
        "quote_asset": "USDT",
        "display_name": "Avalanche / USDT",
        "market_type": "futures",
        "min_qty": 0.1,
        "max_leverage": 25,
        "price_precision": 3,
        "quantity_precision": 1,
        "is_active": True,
        "sort_order": 8
    },
    {
        "symbol": "LINKUSDT",
        "base_asset": "LINK",
        "quote_asset": "USDT",
        "display_name": "Chainlink / USDT",
        "market_type": "futures",
        "min_qty": 0.1,
        "max_leverage": 25,
        "price_precision": 3,
        "quantity_precision": 1,
        "is_active": True,
        "sort_order": 9
    },
    {
        "symbol": "LTCUSDT",
        "base_asset": "LTC",
        "quote_asset": "USDT",
        "display_name": "Litecoin / USDT",
        "market_type": "futures",
        "min_qty": 0.01,
        "max_leverage": 25,
        "price_precision": 2,
        "quantity_precision": 2,
        "is_active": True,
        "sort_order": 10
    },
    {
        "symbol": "TRXUSDT",
        "base_asset": "TRX",
        "quote_asset": "USDT",
        "display_name": "TRON / USDT",
        "market_type": "futures",
        "min_qty": 1,
        "max_leverage": 20,
        "price_precision": 5,
        "quantity_precision": 0,
        "is_active": True,
        "sort_order": 11
    },
    {
        "symbol": "DOTUSDT",
        "base_asset": "DOT",
        "quote_asset": "USDT",
        "display_name": "Polkadot / USDT",
        "market_type": "futures",
        "min_qty": 0.1,
        "max_leverage": 20,
        "price_precision": 3,
        "quantity_precision": 1,
        "is_active": True,
        "sort_order": 12
    },
    {
        "symbol": "BCHUSDT",
        "base_asset": "BCH",
        "quote_asset": "USDT",
        "display_name": "Bitcoin Cash / USDT",
        "market_type": "futures",
        "min_qty": 0.01,
        "max_leverage": 20,
        "price_precision": 2,
        "quantity_precision": 2,
        "is_active": True,
        "sort_order": 13
    },
    {
        "symbol": "ATOMUSDT",
        "base_asset": "ATOM",
        "quote_asset": "USDT",
        "display_name": "Cosmos / USDT",
        "market_type": "futures",
        "min_qty": 0.1,
        "max_leverage": 20,
        "price_precision": 3,
        "quantity_precision": 1,
        "is_active": True,
        "sort_order": 14
    },
    {
        "symbol": "UNIUSDT",
        "base_asset": "UNI",
        "quote_asset": "USDT",
        "display_name": "Uniswap / USDT",
        "market_type": "futures",
        "min_qty": 0.1,
        "max_leverage": 20,
        "price_precision": 3,
        "quantity_precision": 1,
        "is_active": True,
        "sort_order": 15
    },
    {
        "symbol": "APTUSDT",
        "base_asset": "APT",
        "quote_asset": "USDT",
        "display_name": "Aptos / USDT",
        "market_type": "futures",
        "min_qty": 0.1,
        "max_leverage": 20,
        "price_precision": 4,
        "quantity_precision": 1,
        "is_active": True,
        "sort_order": 16
    },
    {
        "symbol": "XAUUSD",
        "base_asset": "XAU",
        "quote_asset": "USDT",
        "display_name": "Gold / USDT Perpetual",
        "market_type": "futures",
        "provider": "binance_futures",
        "provider_symbol": "XAUUSDT",
        "ui_symbol": "XAUUSD",
        "min_qty": 0.01,
        "max_leverage": 20,
        "price_precision": 2,
        "quantity_precision": 2,
        "is_active": True,
        "sort_order": 17
    }
]


DEFAULT_SYMBOL_MAP = {item["symbol"]: item for item in DEFAULT_SYMBOLS}


def get_default_symbol_config(symbol):
    symbol = clean_string(symbol).upper()
    config = DEFAULT_SYMBOL_MAP.get(symbol)
    return config.copy() if config else None


def ensure_default_market_symbol(symbol):
    symbol = clean_string(symbol).upper()
    stored_symbol = find_market_symbol(symbol)

    default_config = get_default_symbol_config(symbol)

    if default_config:
        # Default futures page symbols must always remain tradeable.
        return upsert_market_symbol(default_config)

    if stored_symbol and stored_symbol.get("is_active", False):
        return stored_symbol

    return None


def ensure_default_market_symbols_exist():
    """
    Keep the backend default symbol catalog aligned with the futures frontend.
    This prevents frontend dropdown pairs from failing with "symbol not supported".
    """
    for symbol_data in DEFAULT_SYMBOLS:
        stored_symbol = find_market_symbol(symbol_data["symbol"])

        if not stored_symbol:
            upsert_market_symbol(symbol_data.copy())
            continue

        # Keep all futures dropdown defaults active and aligned with the frontend catalog.
        upsert_market_symbol(symbol_data.copy())


def is_gold_symbol(symbol):
    return clean_string(symbol).upper() in GOLD_SYMBOLS


def seed_default_market_symbols():
    seeded_symbols = []

    for symbol_data in DEFAULT_SYMBOLS:
        symbol = upsert_market_symbol(symbol_data.copy())
        seeded_symbols.append(format_market_symbol(symbol))

    return {
        "success": True,
        "message": "Default market symbols seeded successfully.",
        "data": {
            "symbols": seeded_symbols
        },
        "status_code": 200
    }


def get_market_symbols():
    ensure_default_market_symbols_exist()
    symbols = get_active_market_symbols()

    return {
        "success": True,
        "message": "Market symbols fetched successfully.",
        "data": {
            "symbols": format_market_symbols(symbols)
        },
        "status_code": 200
    }


def ensure_supported_symbol(symbol):
    symbol = clean_string(symbol).upper()

    is_valid_symbol, symbol_error = validate_market_symbol(symbol)
    if not is_valid_symbol:
        return False, symbol_error, None

    stored_symbol = ensure_default_market_symbol(symbol)

    if not stored_symbol or not stored_symbol.get("is_active", False):
        return False, "This market symbol is not supported by TraidiumX.", None

    return True, "", stored_symbol


def binance_get(endpoint, params=None):
    url = f"{settings.BINANCE_FUTURES_BASE_URL}{endpoint}"

    try:
        response = requests.get(
            url,
            params=params or {},
            timeout=settings.MARKET_REQUEST_TIMEOUT
        )

        if response.status_code != 200:
            return {
                "success": False,
                "message": "Market data provider returned an error.",
                "errors": {
                    "status_code": response.status_code,
                    "response": response.text
                }
            }

        return {
            "success": True,
            "data": response.json()
        }

    except requests.exceptions.Timeout:
        return {
            "success": False,
            "message": "Market data request timed out.",
            "errors": {
                "timeout": "Please try again."
            }
        }

    except requests.exceptions.RequestException as error:
        return {
            "success": False,
            "message": "Market data provider connection failed.",
            "errors": {
                "provider": str(error)
            }
        }




def _cached_ticker_24hr(provider_symbol):
    """Share one short-lived ticker result across every user/order check."""
    provider_symbol = clean_string(provider_symbol).upper()
    now = time.monotonic()

    with _TICKER_CACHE_LOCK:
        cached = _TICKER_CACHE.get(provider_symbol)
        if cached and now - cached["at"] <= _TICKER_CACHE_SECONDS:
            return cached["result"]

    result = binance_get(
        endpoint="/fapi/v1/ticker/24hr",
        params={"symbol": provider_symbol},
    )

    with _TICKER_CACHE_LOCK:
        _TICKER_CACHE[provider_symbol] = {"at": now, "result": result}

    return result

def _cached_premium_index(provider_symbol):
    """Return Binance Futures mark/index/funding data with a short shared cache."""
    provider_symbol = clean_string(provider_symbol).upper()
    now = time.monotonic()

    with _PREMIUM_INDEX_CACHE_LOCK:
        cached = _PREMIUM_INDEX_CACHE.get(provider_symbol)
        if cached and now - cached["at"] <= _PREMIUM_INDEX_CACHE_SECONDS:
            return cached["result"]

    result = binance_get(
        endpoint="/fapi/v1/premiumIndex",
        params={"symbol": provider_symbol},
    )

    with _PREMIUM_INDEX_CACHE_LOCK:
        _PREMIUM_INDEX_CACHE[provider_symbol] = {
            "at": now,
            "result": result,
        }

    return result


def get_symbol_mark_price(symbol):
    """Fetch real Mark Price, Index Price and Funding Rate from Binance Futures."""
    is_supported, error, stored_symbol = ensure_supported_symbol(symbol)

    if not is_supported:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": {"symbol": error},
            "status_code": 422,
        }

    provider_symbol = get_provider_symbol(stored_symbol)
    result = _cached_premium_index(provider_symbol)

    if not result.get("success"):
        return {
            "success": False,
            "message": result.get("message", "Unable to fetch mark price."),
            "errors": result.get("errors", {}),
            "status_code": 502,
        }

    premium = result.get("data") or {}

    return {
        "success": True,
        "message": "Live mark price fetched successfully from Binance Futures.",
        "data": {
            "symbol": stored_symbol["symbol"],
            "provider_symbol": provider_symbol,
            "mark_price": safe_float(premium.get("markPrice")),
            "index_price": safe_float(premium.get("indexPrice")),
            "estimated_settle_price": safe_float(premium.get("estimatedSettlePrice")),
            "last_funding_rate": safe_float(premium.get("lastFundingRate")),
            "interest_rate": safe_float(premium.get("interestRate")),
            "next_funding_time": premium.get("nextFundingTime"),
            "source": "binance_futures_premium_index",
        },
        "status_code": 200,
    }


def get_symbol_execution_price(symbol, prefer_mark=False):
    """Return a validated live price. Mark Price is used for risk/PnL/TP-SL."""
    if prefer_mark:
        mark_result = get_symbol_mark_price(symbol)
        if mark_result.get("success"):
            mark_price = safe_float((mark_result.get("data") or {}).get("mark_price"))
            if mark_price > 0:
                return {
                    "success": True,
                    "price": mark_price,
                    "price_type": "mark_price",
                    "data": mark_result.get("data"),
                }

    ticker_result = get_symbol_ticker(symbol)
    if not ticker_result.get("success"):
        return ticker_result

    price = safe_float((ticker_result.get("data") or {}).get("last_price"))
    return {
        "success": price > 0,
        "price": price,
        "price_type": "last_price",
        "data": ticker_result.get("data"),
        "message": ticker_result.get("message"),
        "errors": ticker_result.get("errors", {}),
    }


def get_provider_symbol(stored_symbol):
    """
    User-facing symbols can differ from the exchange/provider symbol.
    Example: UI/internal symbol XAUUSD maps to Binance Futures XAUUSDT.
    """
    internal_symbol = clean_string(stored_symbol.get("symbol")).upper()
    provider_symbol = clean_string(stored_symbol.get("provider_symbol")).upper()

    if provider_symbol:
        return provider_symbol

    return BINANCE_SYMBOL_ALIASES.get(internal_symbol, internal_symbol)


def build_binance_ticker_response(stored_symbol, ticker, premium=None):
    provider_symbol = get_provider_symbol(stored_symbol)
    premium = premium or {}
    last_price = safe_float(ticker.get("lastPrice"))
    mark_price = safe_float(premium.get("markPrice"), last_price)
    index_price = safe_float(premium.get("indexPrice"), mark_price)

    return {
        "success": True,
        "message": "Live ticker and premium-index data fetched successfully from Binance Futures.",
        "data": {
            "symbol": stored_symbol["symbol"],
            "provider_symbol": provider_symbol,
            "display_name": stored_symbol.get("display_name"),
            "last_price": last_price,
            "mark_price": mark_price,
            "index_price": index_price,
            "last_funding_rate": safe_float(premium.get("lastFundingRate")),
            "interest_rate": safe_float(premium.get("interestRate")),
            "next_funding_time": premium.get("nextFundingTime"),
            "price_change": safe_float(ticker.get("priceChange")),
            "price_change_percent": safe_float(ticker.get("priceChangePercent")),
            "high_price": safe_float(ticker.get("highPrice")),
            "low_price": safe_float(ticker.get("lowPrice")),
            "volume": safe_float(ticker.get("volume")),
            "quote_volume": safe_float(ticker.get("quoteVolume")),
            "open_price": safe_float(ticker.get("openPrice")),
            "source": "binance_futures"
        },
        "status_code": 200
    }



def safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def get_display_pair(symbol):
    symbol = clean_string(symbol).upper()

    if is_gold_symbol(symbol):
        return "XAU-USD"

    if symbol.endswith("USDT"):
        return f"{symbol.replace('USDT', '')}-USDT"

    return symbol


def get_market_category(stored_symbol):
    symbol = clean_string(stored_symbol.get("symbol")).upper()
    market_type = clean_string(stored_symbol.get("market_type", "futures")).lower()

    if is_gold_symbol(symbol) or "commodity" in market_type:
        return "Commodities"

    if "option" in market_type:
        return "Options"

    return "USDT Futures"


def get_all_binance_tickers():
    """
    Fetch the full Binance Futures 24h ticker board once and map by provider symbol.
    This is safer for the Markets page than sending one HTTP request per row.
    """
    result = binance_get(endpoint="/fapi/v1/ticker/24hr")

    if not result["success"]:
        return result

    ticker_map = {}

    for ticker in result.get("data", []):
        provider_symbol = clean_string(ticker.get("symbol")).upper()

        if provider_symbol:
            ticker_map[provider_symbol] = ticker

    return {
        "success": True,
        "data": ticker_map
    }


def build_market_board_item(stored_symbol, ticker=None, board_timestamp=None):
    internal_symbol = clean_string(stored_symbol.get("symbol")).upper()
    provider_symbol = get_provider_symbol(stored_symbol)
    quote_asset = clean_string(stored_symbol.get("quote_asset", "USDT")).upper() or "USDT"
    ticker = ticker or {}
    last_price = safe_float(ticker.get("lastPrice"))
    change_percent = safe_float(ticker.get("priceChangePercent"))
    quote_volume = safe_float(ticker.get("quoteVolume"))

    return {
        "symbol": internal_symbol,
        "ui_symbol": stored_symbol.get("ui_symbol") or internal_symbol,
        "provider": stored_symbol.get("provider", "binance_futures"),
        "provider_symbol": provider_symbol,
        "pair": get_display_pair(internal_symbol),
        "display_name": stored_symbol.get("display_name") or get_display_pair(internal_symbol),
        "base_asset": stored_symbol.get("base_asset"),
        "quote_asset": "USDT" if is_gold_symbol(internal_symbol) else quote_asset,
        "category": get_market_category(stored_symbol),
        "market_type": stored_symbol.get("market_type", "futures"),
        "min_qty": stored_symbol.get("min_qty", 0.001),
        "max_leverage": stored_symbol.get("max_leverage", 20),
        "price_precision": stored_symbol.get("price_precision", 2),
        "quantity_precision": stored_symbol.get("quantity_precision", 3),
        "last_price": last_price,
        "price_change": safe_float(ticker.get("priceChange")),
        "price_change_percent": change_percent,
        "high_price": safe_float(ticker.get("highPrice")),
        "low_price": safe_float(ticker.get("lowPrice")),
        "volume": safe_float(ticker.get("volume")),
        "quote_volume": quote_volume,
        "open_price": safe_float(ticker.get("openPrice")),
        "is_live": last_price > 0,
        "is_active": stored_symbol.get("is_active", True),
        "sort_order": stored_symbol.get("sort_order", 0),
        "trade_page": "futures",
        "source": "binance_futures",
        "source_label": "Binance Futures",
        "updated_at": board_timestamp or datetime.utcnow().isoformat() + "Z"
    }


def build_options_market_items(futures_items, board_timestamp=None):
    """
    The Options terminal currently supports BTC and ETH only.
    These rows are not fake order data; they route to the backend-controlled Options page
    and reuse the live underlying ticker fetched through the market service.
    """
    options_config = [
        {
            "symbol": "BTC_OPTIONS",
            "underlying": "BTC",
            "provider_symbol": "BTCUSDT",
            "pair": "BTC Options",
            "display_name": "BTC USDT Options · Calls / Puts",
            "sort_order": 101
        },
        {
            "symbol": "ETH_OPTIONS",
            "underlying": "ETH",
            "provider_symbol": "ETHUSDT",
            "pair": "ETH Options",
            "display_name": "ETH USDT Options · Calls / Puts",
            "sort_order": 102
        },
        {
            "symbol": "SOL_OPTIONS",
            "underlying": "SOL",
            "provider_symbol": "SOLUSDT",
            "pair": "SOL Options",
            "display_name": "SOL USDT Options · Calls / Puts",
            "sort_order": 103
        }
    ]

    ticker_by_provider = {
        item.get("provider_symbol"): item
        for item in futures_items
    }

    option_items = []

    for config in options_config:
        underlying_ticker = ticker_by_provider.get(config["provider_symbol"], {})

        option_items.append({
            "symbol": config["symbol"],
            "ui_symbol": config["symbol"],
            "provider": "traidiumx_options_engine",
            "provider_symbol": config["provider_symbol"],
            "underlying": config["underlying"],
            "pair": config["pair"],
            "display_name": config["display_name"],
            "base_asset": config["underlying"],
            "quote_asset": "USDT",
            "category": "Options",
            "market_type": "options",
            "min_qty": 1,
            "max_leverage": 1,
            "price_precision": 2,
            "quantity_precision": 0,
            "last_price": underlying_ticker.get("last_price", 0),
            "price_change": underlying_ticker.get("price_change", 0),
            "price_change_percent": underlying_ticker.get("price_change_percent", 0),
            "high_price": underlying_ticker.get("high_price", 0),
            "low_price": underlying_ticker.get("low_price", 0),
            "volume": underlying_ticker.get("volume", 0),
            "quote_volume": underlying_ticker.get("quote_volume", 0),
            "open_price": underlying_ticker.get("open_price", 0),
            "is_live": underlying_ticker.get("is_live", False),
            "is_active": True,
            "sort_order": config["sort_order"],
            "trade_page": "options",
            "source": "traidiumx_options_engine",
            "source_label": "Options Engine",
            "updated_at": board_timestamp or datetime.utcnow().isoformat() + "Z"
        })

    return option_items


def get_market_board():
    """
    Company-level market board response for the Markets page.
    Backend controls the supported symbol list and the frontend only renders what this
    endpoint returns. No INR/demo rows are returned because the wallet is crypto-only.
    """
    ensure_default_market_symbols_exist()
    symbols = get_active_market_symbols()
    ticker_result = get_all_binance_tickers()
    ticker_map = ticker_result.get("data", {}) if ticker_result.get("success") else {}
    provider_errors = [] if ticker_result.get("success") else [ticker_result.get("message")]
    board_timestamp = datetime.utcnow().isoformat() + "Z"

    futures_items = []
    has_ticker_board = ticker_result.get("success", False)

    for stored_symbol in symbols:
        provider_symbol = get_provider_symbol(stored_symbol)
        ticker = ticker_map.get(provider_symbol)

        if ticker is None and has_ticker_board:
            single_ticker_result = binance_get(
                endpoint="/fapi/v1/ticker/24hr",
                params={
                    "symbol": provider_symbol
                }
            )

            if single_ticker_result.get("success"):
                ticker = single_ticker_result.get("data", {})
            else:
                provider_errors.append(f"{stored_symbol.get('symbol')}: {single_ticker_result.get('message')}")
                ticker = {}
        elif ticker is None:
            ticker = {}

        futures_items.append(build_market_board_item(stored_symbol, ticker, board_timestamp))

    futures_items.sort(key=lambda item: item.get("sort_order", 999))
    option_items = build_options_market_items(futures_items, board_timestamp)
    markets = futures_items + option_items

    futures_count = len([item for item in markets if item["category"] == "USDT Futures"])
    commodity_count = len([item for item in markets if item["category"] == "Commodities"])
    options_count = len([item for item in markets if item["category"] == "Options"])
    live_count = len([item for item in markets if item.get("is_live")])

    return {
        "success": True,
        "message": "Company market board fetched successfully.",
        "data": {
            "markets": markets,
            "stats": {
                "total_contracts": len(markets),
                "futures_count": futures_count,
                "commodity_count": commodity_count,
                "options_count": options_count,
                "live_count": live_count,
                "max_leverage": max([item.get("max_leverage", 1) for item in futures_items] or [1])
            },
            "source": "backend_market_board",
            "provider": "binance_futures",
            "last_updated": board_timestamp,
            "refresh_interval_ms": 3000,
            "warnings": provider_errors[:5]
        },
        "status_code": 200
    }


def get_symbol_ticker(symbol):
    is_supported, error, stored_symbol = ensure_supported_symbol(symbol)

    if not is_supported:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": {
                "symbol": error
            },
            "status_code": 422
        }

    provider_symbol = get_provider_symbol(stored_symbol)
    result = _cached_ticker_24hr(provider_symbol)

    if not result["success"]:
        return {
            "success": False,
            "message": result["message"],
            "errors": result["errors"],
            "status_code": 502
        }

    premium_result = _cached_premium_index(provider_symbol)
    premium = premium_result.get("data") if premium_result.get("success") else {}

    return build_binance_ticker_response(stored_symbol, result["data"], premium)


def get_symbol_orderbook(symbol):
    is_supported, error, stored_symbol = ensure_supported_symbol(symbol)

    if not is_supported:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": {
                "symbol": error
            },
            "status_code": 422
        }

    provider_symbol = get_provider_symbol(stored_symbol)
    result = binance_get(
        endpoint="/fapi/v1/depth",
        params={
            "symbol": provider_symbol,
            "limit": 20
        }
    )

    if not result["success"]:
        return {
            "success": False,
            "message": result["message"],
            "errors": result["errors"],
            "status_code": 502
        }

    orderbook = result["data"]

    return {
        "success": True,
        "message": "Live orderbook fetched successfully from Binance Futures.",
        "data": {
            "symbol": stored_symbol["symbol"],
            "provider_symbol": provider_symbol,
            "bids": [
                {
                    "price": float(bid[0]),
                    "quantity": float(bid[1])
                }
                for bid in orderbook.get("bids", [])
            ],
            "asks": [
                {
                    "price": float(ask[0]),
                    "quantity": float(ask[1])
                }
                for ask in orderbook.get("asks", [])
            ],
            "source": "binance_futures"
        },
        "status_code": 200
    }


def get_symbol_recent_trades(symbol):
    is_supported, error, stored_symbol = ensure_supported_symbol(symbol)

    if not is_supported:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": {
                "symbol": error
            },
            "status_code": 422
        }

    provider_symbol = get_provider_symbol(stored_symbol)
    result = binance_get(
        endpoint="/fapi/v1/trades",
        params={
            "symbol": provider_symbol,
            "limit": 20
        }
    )

    if not result["success"]:
        return {
            "success": False,
            "message": result["message"],
            "errors": result["errors"],
            "status_code": 502
        }

    trades = result["data"]

    return {
        "success": True,
        "message": "Recent trades fetched successfully from Binance Futures.",
        "data": {
            "symbol": stored_symbol["symbol"],
            "provider_symbol": provider_symbol,
            "trades": [
                {
                    "id": trade.get("id"),
                    "price": float(trade.get("price", 0)),
                    "quantity": float(trade.get("qty", 0)),
                    "time": trade.get("time"),
                    "is_buyer_maker": trade.get("isBuyerMaker", False)
                }
                for trade in trades
            ],
            "source": "binance_futures"
        },
        "status_code": 200
    }

import hashlib
import hmac
import time
import requests
from config.settings import settings
from models.market_symbol_model import find_market_symbol

# Connection pooling session setup
_SESSION = requests.Session()
_adapter = requests.adapters.HTTPAdapter(pool_connections=25, pool_maxsize=25, max_retries=1)
_SESSION.mount("https://", _adapter)
_SESSION.mount("http://", _adapter)

_CREDS_CACHE = None
_CREDS_CACHE_TIME = 0

# Symbol mapping helper
BINANCE_SYMBOL_ALIASES = {
    "XAUUSD": "XAUUSDT",
    "GOLDUSD": "XAUUSDT",
    "PEPEUSDT": "1000PEPEUSDT",
    "SHIBUSDT": "1000SHIBUSDT",
    "BONKUSDT": "1000BONKUSDT",
    "FLOKIUSDT": "1000FLOKIUSDT",
    "LUNCUSDT": "1000LUNCUSDT",
}

def _map_symbol(symbol):
    clean = str(symbol or "").upper().replace("-", "").replace("_", "").strip()
    return BINANCE_SYMBOL_ALIASES.get(clean, clean)

def _get_binance_credentials():
    global _CREDS_CACHE, _CREDS_CACHE_TIME
    now = time.time()
    if _CREDS_CACHE and now - _CREDS_CACHE_TIME < 30.0:
        return _CREDS_CACHE

    try:
        from admin.settings_routes import get_final_settings
        db_settings = get_final_settings()
        api_key = db_settings.get("binance_api_key", "").strip()
        secret_key = db_settings.get("binance_secret_key", "").strip()
        is_testnet = db_settings.get("binance_is_testnet", True)
        
        if api_key:
            res = (api_key, secret_key, is_testnet)
            _CREDS_CACHE = res
            _CREDS_CACHE_TIME = now
            return res
    except Exception as e:
        print(f"Error loading Binance credentials from DB: {e}")
        
    res = (settings.BINANCE_API_KEY, settings.BINANCE_SECRET_KEY, settings.BINANCE_IS_TESTNET)
    _CREDS_CACHE = res
    _CREDS_CACHE_TIME = now
    return res

def _get_base_url(is_testnet):
    if is_testnet:
        return "https://demo-fapi.binance.com"
    return "https://fapi.binance.com"

_SERVER_TIME_OFFSET = 0
_LAST_SYNC_TIME = 0

def _get_server_time_offset(base_url):
    global _SERVER_TIME_OFFSET, _LAST_SYNC_TIME
    now = time.time()
    if now - _LAST_SYNC_TIME < 60:
        return _SERVER_TIME_OFFSET
    try:
        res = _SESSION.get(f"{base_url}/fapi/v1/time", timeout=5).json()
        server_time = int(res.get("serverTime", 0))
        if server_time > 0:
            _SERVER_TIME_OFFSET = server_time - int(now * 1000)
            _LAST_SYNC_TIME = now
    except Exception as e:
        print(f"Failed to sync Binance server time: {e}")
    return _SERVER_TIME_OFFSET

def _send_signed_request(method, endpoint, params=None):
    api_key, secret_key, is_testnet = _get_binance_credentials()
    if not api_key or not secret_key:
        print("Binance API keys not configured. Skipping request.")
        return {"success": False, "message": "Binance API keys not configured."}

    base_url = _get_base_url(is_testnet)
    
    # Copy or initialize params
    payload = params.copy() if params else {}
    
    # Add timestamp in milliseconds synced with Binance server clock
    offset = _get_server_time_offset(base_url)
    payload["timestamp"] = int(time.time() * 1000) + offset
    if "recvWindow" not in payload:
        payload["recvWindow"] = 10000
    
    # Generate query string with sorted parameters
    sorted_params = sorted(payload.items())
    query_string = "&".join([f"{k}={v}" for k, v in sorted_params])
    
    # Generate signature
    signature = hmac.new(
        secret_key.encode("utf-8"),
        query_string.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    
    # Construct final URL with query parameters
    url = f"{base_url}{endpoint}?{query_string}&signature={signature}"
    
    headers = {
        "X-MBX-APIKEY": api_key
    }
    
    try:
        if method.upper() == "POST":
            response = _SESSION.post(url, headers=headers, timeout=10)
        elif method.upper() == "DELETE":
            response = _SESSION.delete(url, headers=headers, timeout=10)
        elif method.upper() == "GET":
            response = _SESSION.get(url, headers=headers, timeout=10)
        else:
            return {"success": False, "message": f"Unsupported HTTP method: {method}"}
            
        response_json = response.json()
        
        if response.status_code == 200:
            return {"success": True, "data": response_json}
        else:
            return {
                "success": False, 
                "message": response_json.get("msg", "Binance API Error"), 
                "code": response_json.get("code"),
                "status_code": response.status_code
            }
    except Exception as e:
        print(f"Exception during Binance API request to {endpoint}: {e}")
        return {"success": False, "message": str(e)}

_BINANCE_MARGIN_CACHE = {}
_BINANCE_LEVERAGE_CACHE = {}

def set_binance_leverage_and_margin(symbol, leverage, margin_mode):
    """Align leverage and margin type on Binance Futures for the given symbol."""
    symbol_mapped = _map_symbol(symbol)
    leverage = int(leverage)
    margin_type = str(margin_mode or "ISOLATED").upper().strip()  # ISOLATED or CROSS
    
    # 1. Set Margin Type if not already configured
    if _BINANCE_MARGIN_CACHE.get(symbol_mapped) != margin_type:
        margin_res = _send_signed_request("POST", "/fapi/v1/marginType", {
            "symbol": symbol_mapped,
            "marginType": margin_type
        })
        if margin_res["success"] or margin_res.get("code") == -4046:
            _BINANCE_MARGIN_CACHE[symbol_mapped] = margin_type
        else:
            print(f"Warning: Failed to set Binance margin type to {margin_type}: {margin_res.get('message')}")

    # 2. Set Leverage if not already configured
    if _BINANCE_LEVERAGE_CACHE.get(symbol_mapped) != leverage:
        lev_res = _send_signed_request("POST", "/fapi/v1/leverage", {
            "symbol": symbol_mapped,
            "leverage": leverage
        })
        if lev_res["success"]:
            _BINANCE_LEVERAGE_CACHE[symbol_mapped] = leverage
        else:
            print(f"Warning: Failed to set Binance leverage to {leverage}x for {symbol_mapped}: {lev_res.get('message')}")
            return {"success": False, "message": lev_res.get("message")}

    return {"success": True}

def place_binance_futures_order(symbol, side, quantity, leverage, margin_mode, price=None, order_type="MARKET", reduce_only=False):
    """Place an entry or exit order on Binance Futures."""
    api_key, _, _ = _get_binance_credentials()
    if not api_key:
        return {"success": False, "message": "Binance integration not enabled."}
        
    symbol_mapped = _map_symbol(symbol)
    side_upper = str(side).upper().strip()  # BUY or SELL
    type_upper = str(order_type).upper().strip()  # LIMIT or MARKET
    
    # 1. Align risk configuration first (skip for close/reduce-only orders)
    if not reduce_only:
        config_res = set_binance_leverage_and_margin(symbol, leverage, margin_mode)
        if not config_res["success"]:
            return {"success": False, "message": f"Failed to align risk settings on Binance: {config_res['message']}"}
        
    # 2. Query symbol precision to format quantities and prices correctly
    price_precision = 2
    quantity_precision = 3
    
    meta = find_market_symbol(symbol)
    if meta:
        price_precision = int(meta.get("price_precision", 2))
        quantity_precision = int(meta.get("quantity_precision", 3))
        
    formatted_qty = f"{float(quantity):.{quantity_precision}f}"
    
    params = {
        "symbol": symbol_mapped,
        "side": side_upper,
        "type": type_upper,
        "quantity": formatted_qty,
        "reduceOnly": "true" if reduce_only else "false"
    }
    
    if type_upper == "LIMIT":
        if not price:
            return {"success": False, "message": "Price is required for LIMIT order."}
        formatted_price = f"{float(price):.{price_precision}f}"
        params["price"] = formatted_price
        params["timeInForce"] = "GTC"  # Good 'Til Cancelled is standard

    print(f"Placing Binance Futures Order: {params}")
    res = _send_signed_request("POST", "/fapi/v1/order", params)
    
    if res["success"]:
        order_data = res["data"]
        order_id = order_data.get("orderId")
        avg_p = float(order_data.get("avgPrice", 0.0) or 0.0)

        # If avgPrice is 0.0, calculate directly from filled quote / qty without an extra API call
        if avg_p == 0.0:
            cum_quote = float(order_data.get("cumQuote", 0.0) or 0.0)
            cum_qty = float(order_data.get("cumQty", 0.0) or order_data.get("executedQty", 0.0) or 0.0)
            if cum_quote > 0 and cum_qty > 0:
                avg_p = cum_quote / cum_qty

        # Fallback to GET only if avg_p is still 0.0
        if avg_p == 0.0 and order_id:
            try:
                detail_res = _send_signed_request("GET", "/fapi/v1/order", {
                    "symbol": symbol_mapped,
                    "orderId": order_id
                })
                if detail_res.get("success"):
                    order_data = detail_res.get("data", order_data)
                    avg_p = float(order_data.get("avgPrice", 0.0) or 0.0)
            except Exception as e:
                print(f"Failed to fetch Binance order details: {e}")

        print(f"Successfully placed order on Binance. Order ID: {order_id}, Avg Price: {avg_p}")
        return {
            "success": True,
            "binance_order_id": str(order_id),
            "status": order_data.get("status"),
            "price": float(order_data.get("price", 0.0) or price or 0.0),
            "avg_price": avg_p if avg_p > 0 else float(price or 0.0),
            "raw_response": order_data
        }
    else:
        print(f"Failed to place order on Binance: {res.get('message')}")
        return {"success": False, "message": res.get("message")}

def close_binance_futures_position(symbol, side, quantity, leverage, margin_mode):
    """Close an open position on Binance Futures by placing a reduce-only opposite market order."""
    # To close a position:
    # If position is Long (opened with BUY), close it with a SELL market order.
    # If position is Short (opened with SELL), close it with a BUY market order.
    close_side = "SELL" if str(side).upper().strip() in ("BUY", "LONG") else "BUY"
    
    return place_binance_futures_order(
        symbol=symbol,
        side=close_side,
        quantity=quantity,
        leverage=leverage,
        margin_mode=margin_mode,
        order_type="MARKET",
        reduce_only=True
    )

def update_binance_tp_sl(symbol, position_side, quantity, take_profit=None, stop_loss=None):
    """Cancel existing TP/SL trigger orders on Binance Futures and place new ones."""
    api_key, _, _ = _get_binance_credentials()
    if not api_key:
        return {"success": False, "message": "Binance integration not enabled."}

    symbol_mapped = _map_symbol(symbol)
    side_upper = str(position_side).upper().strip()  # BUY or SELL
    close_side = "SELL" if side_upper in ("BUY", "LONG") else "BUY"

    # 1. Fetch open orders for this symbol to find existing TP/SL orders
    open_orders_res = _send_signed_request("GET", "/fapi/v1/openOrders", {"symbol": symbol_mapped})
    if open_orders_res["success"]:
        existing_orders = open_orders_res["data"]
        # Cancel any existing TAKE_PROFIT_MARKET or STOP_MARKET orders for this symbol
        for order in existing_orders:
            ot = order.get("type", "")
            if ot in ("TAKE_PROFIT_MARKET", "STOP_MARKET"):
                cancel_res = _send_signed_request("DELETE", "/fapi/v1/order", {
                    "symbol": symbol_mapped,
                    "orderId": order.get("orderId")
                })
                if cancel_res["success"]:
                    print(f"Canceled old Binance TP/SL order {order.get('orderId')}")

    # Query symbol precision
    price_precision = 2
    quantity_precision = 3
    meta = find_market_symbol(symbol)
    if meta:
        price_precision = int(meta.get("price_precision", 2))
        quantity_precision = int(meta.get("quantity_precision", 3))

    results = []

    # 2. Place new Take Profit order if specified
    if take_profit and float(take_profit) > 0:
        formatted_tp = f"{float(take_profit):.{price_precision}f}"
        tp_params = {
            "symbol": symbol_mapped,
            "side": close_side,
            "type": "TAKE_PROFIT_MARKET",
            "stopPrice": formatted_tp,
            "closePosition": "true",
            "workingType": "MARK_PRICE"
        }
        tp_res = _send_signed_request("POST", "/fapi/v1/order", tp_params)
        if tp_res["success"]:
            print(f"Placed Binance Take Profit order at {formatted_tp}")
            results.append({"type": "TP", "order_id": tp_res["data"].get("orderId")})
        else:
            print(f"Failed to place Binance Take Profit: {tp_res.get('message')}")

    # 3. Place new Stop Loss order if specified
    if stop_loss and float(stop_loss) > 0:
        formatted_sl = f"{float(stop_loss):.{price_precision}f}"
        sl_params = {
            "symbol": symbol_mapped,
            "side": close_side,
            "type": "STOP_MARKET",
            "stopPrice": formatted_sl,
            "closePosition": "true",
            "workingType": "MARK_PRICE"
        }
        sl_res = _send_signed_request("POST", "/fapi/v1/order", sl_params)
        if sl_res["success"]:
            print(f"Placed Binance Stop Loss order at {formatted_sl}")
            results.append({"type": "SL", "order_id": sl_res["data"].get("orderId")})
        else:
            print(f"Failed to place Binance Stop Loss: {sl_res.get('message')}")

    return {"success": True, "orders": results}


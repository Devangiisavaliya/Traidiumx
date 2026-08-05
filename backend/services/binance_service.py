import hashlib
import hmac
import time
import requests
from config.settings import settings
from models.market_symbol_model import find_market_symbol

# Connection pooling session
_SESSION = requests.Session()

# Symbol mapping helper
BINANCE_SYMBOL_ALIASES = {
    "XAUUSD": "XAUUSDT",
    "GOLDUSD": "XAUUSDT"
}

def _map_symbol(symbol):
    symbol_upper = str(symbol).upper().strip()
    return BINANCE_SYMBOL_ALIASES.get(symbol_upper, symbol_upper)

def _get_binance_credentials():
    # Attempt to load from database system settings
    try:
        from admin.settings_routes import get_final_settings
        db_settings = get_final_settings()
        api_key = db_settings.get("binance_api_key", "").strip()
        secret_key = db_settings.get("binance_secret_key", "").strip()
        is_testnet = db_settings.get("binance_is_testnet", True)
        
        # If API key is present in DB, use it
        if api_key:
            return api_key, secret_key, is_testnet
    except Exception as e:
        print(f"Error loading Binance credentials from DB: {e}")
        
    # Otherwise fallback to env file settings
    return settings.BINANCE_API_KEY, settings.BINANCE_SECRET_KEY, settings.BINANCE_IS_TESTNET

def _get_base_url(is_testnet):
    if is_testnet:
        return "https://demo-fapi.binance.com"
    return "https://fapi.binance.com"

def _send_signed_request(method, endpoint, params=None):
    api_key, secret_key, is_testnet = _get_binance_credentials()
    if not api_key or not secret_key:
        print("Binance API keys not configured. Skipping request.")
        return {"success": False, "message": "Binance API keys not configured."}

    base_url = _get_base_url(is_testnet)
    
    # Copy or initialize params
    payload = params.copy() if params else {}
    
    # Add timestamp in milliseconds
    payload["timestamp"] = int(time.time() * 1000)
    
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

_BINANCE_CONFIG_CACHE = {}

def set_binance_leverage_and_margin(symbol, leverage, margin_mode):
    """Align leverage and margin type on Binance Futures for the given symbol."""
    symbol_mapped = _map_symbol(symbol)
    leverage = int(leverage)
    margin_type = str(margin_mode).upper().strip()  # ISOLATED or CROSS
    
    cache_key = (symbol_mapped, leverage, margin_type)
    if _BINANCE_CONFIG_CACHE.get(cache_key):
        return {"success": True}
    
    # 1. Set Margin Type
    # Note: Binance API throws an error -4046 if the margin type is already what we requested.
    # We should catch and ignore that error.
    margin_res = _send_signed_request("POST", "/fapi/v1/marginType", {
        "symbol": symbol_mapped,
        "marginType": margin_type
    })
    if not margin_res["success"]:
        # Code -4046 / "No need to change margin type." can be ignored
        if margin_res.get("code") == -4046:
            print(f"Binance: Margin type already set to {margin_type} for {symbol_mapped}.")
        else:
            print(f"Warning: Failed to set Binance margin type to {margin_type}: {margin_res.get('message')}")
            
    # 2. Set Leverage
    lev_res = _send_signed_request("POST", "/fapi/v1/leverage", {
        "symbol": symbol_mapped,
        "leverage": leverage
    })
    if not lev_res["success"]:
        print(f"Warning: Failed to set Binance leverage to {leverage}x for {symbol_mapped}: {lev_res.get('message')}")
        return {"success": False, "message": lev_res.get("message")}
        
    print(f"Binance: Successfully configured {symbol_mapped} with {leverage}x leverage and {margin_type} margin mode.")
    _BINANCE_CONFIG_CACHE[cache_key] = True
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
        print(f"Successfully placed order on Binance. Order ID: {order_data.get('orderId')}")
        return {
            "success": True,
            "binance_order_id": str(order_data.get("orderId")),
            "status": order_data.get("status"),
            "price": float(order_data.get("price", 0.0) or price or 0.0),
            "avg_price": float(order_data.get("avgPrice", 0.0) or price or 0.0),
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


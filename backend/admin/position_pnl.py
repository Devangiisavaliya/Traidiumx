import requests


BINANCE_FUTURES_TICKER_URL = "https://fapi.binance.com/fapi/v1/ticker/price"


def _to_number(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_symbol(symbol):
    text = str(symbol or "").upper().strip()
    return text.replace("/", "").replace("-", "").replace("_", "")


def get_binance_mark_price(symbol):
    clean_symbol = normalize_symbol(symbol)

    if not clean_symbol:
        return 0.0

    try:
        response = requests.get(
            BINANCE_FUTURES_TICKER_URL,
            params={"symbol": clean_symbol},
            timeout=5,
        )
        response.raise_for_status()
        data = response.json()
        return _to_number(data.get("price"))
    except Exception:
        return 0.0


def calculate_unrealized_pnl(position):
    side = str(
        position.get("position_side")
        or position.get("side")
        or ""
    ).lower()

    quantity = _to_number(position.get("quantity") or position.get("qty"))
    entry_price = _to_number(position.get("entry_price") or position.get("entry"))

    mark_price = _to_number(
        position.get("mark_price")
        or position.get("mark")
        or position.get("current_price")
    )

    if mark_price <= 0:
        mark_price = get_binance_mark_price(position.get("symbol"))

    if entry_price <= 0 or mark_price <= 0 or quantity <= 0:
        return {
            "mark_price": mark_price,
            "unrealized_pnl": _to_number(position.get("unrealized_pnl") or position.get("pnl")),
            "roi_percent": _to_number(position.get("roi_percent") or position.get("roi")),
        }

    if side in ["short", "sell"]:
        pnl = (entry_price - mark_price) * quantity
    else:
        pnl = (mark_price - entry_price) * quantity

    margin_amount = _to_number(position.get("margin_amount") or position.get("margin"))
    roi_percent = (pnl / margin_amount * 100) if margin_amount > 0 else 0.0

    return {
        "mark_price": round(mark_price, 8),
        "unrealized_pnl": round(pnl, 8),
        "roi_percent": round(roi_percent, 4),
    }
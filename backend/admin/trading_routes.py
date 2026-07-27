from datetime import datetime, time, timedelta, timezone
import re

from bson import ObjectId
from flask import Blueprint, request

from config.database import get_database
from utils.response import error_response, success_response
from .middleware import admin_required
from .permissions import permission_required
from .utils import build_pagination, parse_int, serialize_documents, serialize_document
from .position_pnl import calculate_unrealized_pnl


admin_trading_api = Blueprint("admin_trading_api", __name__, url_prefix="/trading")

ORDER_OPEN_STATUSES = ["open", "pending", "pending_trigger", "partially_filled", "OPEN", "PENDING", "PENDING_TRIGGER", "PARTIALLY_FILLED"]
ORDER_FILLED_STATUSES = ["filled", "executed", "completed", "FILLED", "EXECUTED", "COMPLETED"]
ORDER_CANCELLED_STATUSES = ["cancelled", "canceled", "rejected", "expired", "failed", "CANCELLED", "CANCELED", "REJECTED", "EXPIRED", "FAILED"]
POSITION_OPEN_STATUSES = ["open", "OPEN"]
POSITION_CLOSED_STATUSES = ["closed", "liquidated", "settled", "CLOSED", "LIQUIDATED", "SETTLED"]


def _as_object_id(value):
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def _regex(value):
    return re.compile(re.escape(str(value or "").strip()), re.IGNORECASE)


def _number(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default




def _clean_leverage(value, default=1.0):
    try:
        if value is None or value == "":
            return default
        text = str(value).lower().replace("x", "").strip()
        parsed = float(text)
        return parsed if parsed > 0 else default
    except (TypeError, ValueError):
        return default


def _calc_margin_amount(item, notional_value, default=0.0):
    explicit = _number(
        item.get("margin_amount")
        or item.get("used_margin")
        or item.get("margin_used")
        or item.get("required_margin")
        or item.get("wallet_lock_amount")
        or item.get("wallet_locked_amount")
        or item.get("margin")
    )
    if explicit > 0:
        return explicit
    leverage = _clean_leverage(item.get("leverage"), default=1.0)
    if notional_value > 0 and leverage > 0:
        return round(notional_value / leverage, 8)
    return default

def _parse_date(value, end_of_day=False):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        # Admin filters use YYYY-MM-DD. fromisoformat also supports ISO timestamps.
        if len(text) == 10:
            day = datetime.fromisoformat(text).date()
            t = time.max if end_of_day else time.min
            return datetime.combine(day, t, tzinfo=timezone.utc)
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except Exception:
        return None


def _status_filter(value, kind):
    status = str(value or "").strip().lower()
    if not status or status == "all":
        return None

    if kind == "orders":
        if status == "open":
            return {"$in": ORDER_OPEN_STATUSES}
        if status in ["filled", "completed", "executed"]:
            return {"$in": ORDER_FILLED_STATUSES}
        if status in ["cancelled", "canceled", "rejected", "failed"]:
            return {"$in": ORDER_CANCELLED_STATUSES}
        if status in ["pending", "trigger"]:
            return {"$in": ["pending", "pending_trigger", "PENDING", "PENDING_TRIGGER"]}

    if kind == "positions":
        if status == "open":
            return {"$in": POSITION_OPEN_STATUSES}
        if status == "closed":
            return {"$in": POSITION_CLOSED_STATUSES}
        if status in ["liquidated", "settled"]:
            return {"$in": [status, status.upper()]}

    return {"$in": [status, status.upper()]}


def _side_filter(value):
    side = str(value or "").strip().lower()
    if not side or side == "all":
        return None
    values = {side, side.upper()}
    if side == "long":
        values.update(["buy", "BUY"])
    if side == "short":
        values.update(["sell", "SELL"])
    return {"$in": list(values)}


def _find_matching_user_ids(db, search_text):
    text = str(search_text or "").strip()
    if not text:
        return []
    rx = _regex(text)
    matches = db.users.find(
        {
            "$or": [
                {"name": rx},
                {"full_name": rx},
                {"username": rx},
                {"email": rx},
                {"phone": rx},
                {"mobile": rx},
            ]
        },
        {"_id": 1}
    ).limit(100)
    return [str(item.get("_id")) for item in matches]


def _apply_date_filter(query):
    created_range = {}
    date_from = _parse_date(request.args.get("date_from"), end_of_day=False)
    date_to = _parse_date(request.args.get("date_to"), end_of_day=True)
    if date_from:
        created_range["$gte"] = date_from
    if date_to:
        created_range["$lte"] = date_to
    if created_range:
        query["created_at"] = created_range


def _build_order_query(db):
    user_id = str(request.args.get("user_id") or "").strip()
    symbol = str(request.args.get("symbol") or "").strip().upper()
    status = _status_filter(request.args.get("status"), "orders")
    side = _side_filter(request.args.get("side"))
    order_type = str(request.args.get("type") or request.args.get("order_type") or "").strip().lower()
    search = str(request.args.get("search") or "").strip()

    query = {}
    if user_id:
        oid = _as_object_id(user_id)
        possible = [user_id]
        if oid:
            possible.append(oid)
        query["user_id"] = {"$in": possible}
    if symbol:
        query["symbol"] = symbol
    if status:
        query["status"] = status
    if side:
        query["side"] = side
    if order_type and order_type != "all":
        query["order_type"] = {"$in": [order_type, order_type.upper()]}

    if search:
        rx = _regex(search)
        user_ids = _find_matching_user_ids(db, search)
        ors = [
            {"symbol": rx},
            {"order_reference": rx},
            {"user_id": rx},
            {"status": rx},
            {"side": rx},
            {"order_type": rx},
        ]
        if user_ids:
            ors.append({"user_id": {"$in": user_ids}})
        query["$or"] = ors

    _apply_date_filter(query)
    return query


def _build_option_order_query(db):
    user_id = str(request.args.get("user_id") or "").strip()
    symbol = str(request.args.get("symbol") or "").strip().upper()
    status = _status_filter(request.args.get("status"), "orders")
    side = _side_filter(request.args.get("side"))
    order_type = str(request.args.get("type") or request.args.get("order_type") or "").strip().lower()
    search = str(request.args.get("search") or "").strip()

    query = {}
    if user_id:
        oid = _as_object_id(user_id)
        possible = [user_id]
        if oid:
            possible.append(oid)
        query["user_id"] = {"$in": possible}

    and_filters = []

    if symbol:
        clean_symbol = symbol.replace("/", "").replace("-", "")
        underlying = clean_symbol.replace("USDT", "").replace("USDC", "").replace("BUSD", "")
        and_filters.append({
            "$or": [
                {"symbol": clean_symbol},
                {"underlying": underlying},
                {"underlying": clean_symbol},
                {"contract": _regex(clean_symbol)},
                {"contract": _regex(underlying)},
            ]
        })

    if status:
        query["status"] = status

    if side:
        and_filters.append({
            "$or": [
                {"side": side},
                {"action": side},
            ]
        })

    if order_type and order_type != "all":
        query["order_type"] = {"$in": [order_type, order_type.upper()]}

    if search:
        rx = _regex(search)
        user_ids = _find_matching_user_ids(db, search)
        ors = [
            {"symbol": rx},
            {"underlying": rx},
            {"contract": rx},
            {"order_reference": rx},
            {"user_id": rx},
            {"status": rx},
            {"side": rx},
            {"action": rx},
            {"option_side": rx},
            {"order_type": rx},
            {"expiry_code": rx},
        ]
        if user_ids:
            ors.append({"user_id": {"$in": user_ids}})
        and_filters.append({"$or": ors})

    if and_filters:
        query["$and"] = and_filters

    _apply_date_filter(query)
    return query



def _empty_query():
    return {"_id": {"$exists": False}}


def _filled_only_filter_allows_record():
    status = str(request.args.get("status") or "all").strip().lower()
    if not status or status == "all":
        return True
    return status in ["filled", "completed", "executed"]


def _type_filter_allows_market_close():
    order_type = str(request.args.get("type") or request.args.get("order_type") or "all").strip().lower()
    if not order_type or order_type == "all":
        return True
    return order_type in ["market", "close"]


def _build_close_trade_query(db):
    """Close position events are stored in trades, not orders.
    Admin Orders page shows them as clean CLOSE records so BUY close = SELL and SELL close = BUY is auditable.
    """
    if not _filled_only_filter_allows_record() or not _type_filter_allows_market_close():
        return _empty_query()

    user_id = str(request.args.get("user_id") or "").strip()
    symbol = str(request.args.get("symbol") or "").strip().upper()
    side = _side_filter(request.args.get("side"))
    search = str(request.args.get("search") or "").strip()

    query = {"trade_type": {"$in": ["close", "CLOSE"]}}
    and_filters = []

    if user_id:
        oid = _as_object_id(user_id)
        possible = [user_id]
        if oid:
            possible.append(oid)
        query["user_id"] = {"$in": possible}
    if symbol:
        query["symbol"] = symbol
    if side:
        query["side"] = side

    if search:
        rx = _regex(search)
        user_ids = _find_matching_user_ids(db, search)
        ors = [
            {"symbol": rx},
            {"trade_reference": rx},
            {"user_id": rx},
            {"side": rx},
            {"trade_type": rx},
            {"close_reason": rx},
        ]
        if user_ids:
            ors.append({"user_id": {"$in": user_ids}})
        and_filters.append({"$or": ors})

    if and_filters:
        query["$and"] = and_filters

    _apply_date_filter(query)
    return query


def _build_option_close_fill_query(db):
    """Options close records are stored in option_fills with action=CLOSE."""
    if not _filled_only_filter_allows_record() or not _type_filter_allows_market_close():
        return _empty_query()

    # Buy/Sell side filter is not reliable for options CLOSE fills, so hide close fills when a side is explicitly selected.
    if str(request.args.get("side") or "all").strip().lower() not in ["", "all"]:
        return _empty_query()

    user_id = str(request.args.get("user_id") or "").strip()
    symbol = str(request.args.get("symbol") or "").strip().upper()
    search = str(request.args.get("search") or "").strip()

    query = {"action": {"$in": ["CLOSE", "close"]}}
    and_filters = []

    if user_id:
        oid = _as_object_id(user_id)
        possible = [user_id]
        if oid:
            possible.append(oid)
        query["user_id"] = {"$in": possible}

    if symbol:
        clean_symbol = symbol.replace("/", "").replace("-", "")
        underlying = clean_symbol.replace("USDT", "").replace("USDC", "").replace("BUSD", "")
        and_filters.append({
            "$or": [
                {"underlying": underlying},
                {"underlying": clean_symbol},
                {"contract": _regex(clean_symbol)},
                {"contract": _regex(underlying)},
            ]
        })

    if search:
        rx = _regex(search)
        user_ids = _find_matching_user_ids(db, search)
        ors = [
            {"fill_reference": rx},
            {"contract": rx},
            {"underlying": rx},
            {"user_id": rx},
            {"action": rx},
            {"option_side": rx},
        ]
        if user_ids:
            ors.append({"user_id": {"$in": user_ids}})
        and_filters.append({"$or": ors})

    if and_filters:
        query["$and"] = and_filters

    _apply_date_filter(query)
    return query

def _order_market_filter():
    value = str(request.args.get("market") or request.args.get("market_type") or "all").strip().lower()
    if value in ["future", "futures", "futures_orders"]:
        return "futures"
    if value in ["option", "options", "option_orders"]:
        return "options"
    return "all"


def _build_position_query(db):
    user_id = str(request.args.get("user_id") or "").strip()
    symbol = str(request.args.get("symbol") or "").strip().upper()
    status = _status_filter(request.args.get("status"), "positions")
    side = _side_filter(request.args.get("side") or request.args.get("position_side"))
    risk = str(request.args.get("risk") or request.args.get("risk_level") or "").strip().lower()
    market = str(request.args.get("market") or request.args.get("market_type") or "").strip().lower()
    search = str(request.args.get("search") or "").strip()

    query = {}
    and_filters = []

    if user_id:
        oid = _as_object_id(user_id)
        possible = [user_id]
        if oid:
            possible.append(oid)
        query["user_id"] = {"$in": possible}
    if symbol:
        query["symbol"] = symbol
    if status:
        query["status"] = status
    if side:
        and_filters.append({
            "$or": [
                {"position_side": side},
                {"side": side},
            ]
        })
    if risk and risk != "all":
        and_filters.append({
            "$or": [
                {"risk_level": {"$in": [risk, risk.upper()]}},
                {"risk": {"$in": [risk, risk.upper()]}},
            ]
        })

    if market and market != "all":
        market_values = [market, market.upper(), market.rstrip("s"), market.rstrip("s").upper()]
        and_filters.append({
            "$or": [
                {"market_type": {"$in": market_values}},
                {"trading_type": {"$in": market_values}},
                {"segment": {"$in": market_values}},
                {"product_type": {"$in": market_values}},
            ]
        })

    if search:
        rx = _regex(search)
        user_ids = _find_matching_user_ids(db, search)
        ors = [
            {"symbol": rx},
            {"display_symbol": rx},
            {"ticker_symbol": rx},
            {"contract": rx},
            {"user_id": rx},
            {"status": rx},
            {"position_side": rx},
            {"side": rx},
        ]
        if user_ids:
            ors.append({"user_id": {"$in": user_ids}})
        and_filters.append({"$or": ors})

    if and_filters:
        query["$and"] = and_filters

    _apply_date_filter(query)
    return query




def _position_market_filter():
    value = str(request.args.get("market") or request.args.get("market_type") or "all").strip().lower()
    if value in ["future", "futures", "futures_positions"]:
        return "futures"
    if value in ["option", "options", "option_positions"]:
        return "options"
    return "all"


def _build_option_position_query(db):
    """Build query for option_positions so Admin Positions shows Options too.
    Options use fields like contract/underlying/action/option_side instead of symbol/side.
    """
    user_id = str(request.args.get("user_id") or "").strip()
    symbol = str(request.args.get("symbol") or "").strip().upper()
    status = _status_filter(request.args.get("status"), "positions")
    side = _side_filter(request.args.get("side") or request.args.get("position_side"))
    risk = str(request.args.get("risk") or request.args.get("risk_level") or "").strip().lower()
    market = _position_market_filter()
    search = str(request.args.get("search") or "").strip()

    if market == "futures":
        return _empty_query()

    query = {}
    and_filters = []

    if user_id:
        oid = _as_object_id(user_id)
        possible = [user_id]
        if oid:
            possible.append(oid)
        query["user_id"] = {"$in": possible}

    if symbol:
        clean_symbol = symbol.replace("/", "").replace("-", "")
        underlying = clean_symbol.replace("USDT", "").replace("USDC", "").replace("BUSD", "")
        and_filters.append({
            "$or": [
                {"contract": _regex(clean_symbol)},
                {"option_symbol": _regex(clean_symbol)},
                {"underlying": {"$in": [underlying, clean_symbol, symbol]}},
                {"symbol": {"$in": [clean_symbol, symbol]}},
            ]
        })

    if status:
        query["status"] = status

    if side:
        and_filters.append({
            "$or": [
                {"action": side},
                {"side": side},
                {"position_side": side},
            ]
        })

    # Most option_positions do not store risk. Only apply risk filter when the field exists.
    if risk and risk != "all":
        and_filters.append({
            "$or": [
                {"risk_level": {"$in": [risk, risk.upper()]}},
                {"risk": {"$in": [risk, risk.upper()]}},
            ]
        })

    if search:
        rx = _regex(search)
        user_ids = _find_matching_user_ids(db, search)
        ors = [
            {"contract": rx},
            {"option_symbol": rx},
            {"underlying": rx},
            {"symbol": rx},
            {"user_id": rx},
            {"status": rx},
            {"action": rx},
            {"side": rx},
            {"option_side": rx},
            {"expiry_code": rx},
        ]
        if user_ids:
            ors.append({"user_id": {"$in": user_ids}})
        and_filters.append({"$or": ors})

    if and_filters:
        query["$and"] = and_filters

    _apply_date_filter(query)
    return query



def _order_lifecycle_status_kind():
    value = str(request.args.get("status") or "all").strip().lower()
    if not value or value == "all":
        return "all"
    if value in ["active", "open", "pending", "running"]:
        return "active"
    if value in ["filled", "completed", "executed", "closed", "settled"]:
        return "filled"
    if value in ["cancelled", "canceled", "rejected", "expired", "failed"]:
        return "cancelled"
    return value


def _build_lifecycle_position_query(db):
    """Positions are the single trade lifecycle source for Admin Orders.
    One open/close trade = one row. Status is Active while open and Filled after close.
    """
    if _order_market_filter() == "options":
        return _empty_query()
    if _order_lifecycle_status_kind() == "cancelled":
        return _empty_query()

    user_id = str(request.args.get("user_id") or "").strip()
    symbol = str(request.args.get("symbol") or "").strip().upper()
    side = _side_filter(request.args.get("side"))
    order_type = str(request.args.get("type") or request.args.get("order_type") or "").strip().lower()
    search = str(request.args.get("search") or "").strip()
    status_kind = _order_lifecycle_status_kind()

    query = {}
    and_filters = []

    if user_id:
        oid = _as_object_id(user_id)
        possible = [user_id]
        if oid:
            possible.append(oid)
        query["user_id"] = {"$in": possible}
    if symbol:
        query["symbol"] = symbol
    if status_kind == "active":
        query["status"] = {"$in": POSITION_OPEN_STATUSES}
    elif status_kind == "filled":
        query["status"] = {"$in": POSITION_CLOSED_STATUSES}
    if side:
        and_filters.append({"$or": [{"position_side": side}, {"side": side}]})
    if order_type and order_type != "all":
        and_filters.append({"$or": [{"order_type": {"$in": [order_type, order_type.upper()]}}, {"type": {"$in": [order_type, order_type.upper()]}}]})
    if search:
        rx = _regex(search)
        user_ids = _find_matching_user_ids(db, search)
        ors = [
            {"symbol": rx}, {"display_symbol": rx}, {"ticker_symbol": rx},
            {"user_id": rx}, {"status": rx}, {"position_side": rx}, {"side": rx},
        ]
        if user_ids:
            ors.append({"user_id": {"$in": user_ids}})
        and_filters.append({"$or": ors})
    if and_filters:
        query["$and"] = and_filters
    _apply_date_filter(query)
    return query


def _build_lifecycle_option_position_query(db):
    if _order_market_filter() == "futures":
        return _empty_query()
    if _order_lifecycle_status_kind() == "cancelled":
        return _empty_query()

    user_id = str(request.args.get("user_id") or "").strip()
    symbol = str(request.args.get("symbol") or "").strip().upper()
    side = _side_filter(request.args.get("side"))
    order_type = str(request.args.get("type") or request.args.get("order_type") or "").strip().lower()
    search = str(request.args.get("search") or "").strip()
    status_kind = _order_lifecycle_status_kind()

    query = {}
    and_filters = []

    if user_id:
        oid = _as_object_id(user_id)
        possible = [user_id]
        if oid:
            possible.append(oid)
        query["user_id"] = {"$in": possible}

    if symbol:
        clean_symbol = symbol.replace("/", "").replace("-", "")
        underlying = clean_symbol.replace("USDT", "").replace("USDC", "").replace("BUSD", "")
        and_filters.append({"$or": [
            {"contract": _regex(clean_symbol)},
            {"option_symbol": _regex(clean_symbol)},
            {"underlying": {"$in": [underlying, clean_symbol, symbol]}},
            {"symbol": {"$in": [clean_symbol, symbol]}},
        ]})

    if status_kind == "active":
        query["status"] = {"$in": POSITION_OPEN_STATUSES}
    elif status_kind == "filled":
        query["status"] = {"$in": POSITION_CLOSED_STATUSES}

    if side:
        and_filters.append({"$or": [{"action": side}, {"side": side}, {"position_side": side}]})
    if order_type and order_type != "all":
        and_filters.append({"$or": [{"order_type": {"$in": [order_type, order_type.upper()]}}, {"type": {"$in": [order_type, order_type.upper()]}}]})
    if search:
        rx = _regex(search)
        user_ids = _find_matching_user_ids(db, search)
        ors = [
            {"contract": rx}, {"option_symbol": rx}, {"underlying": rx}, {"symbol": rx},
            {"user_id": rx}, {"status": rx}, {"action": rx}, {"side": rx}, {"option_side": rx},
        ]
        if user_ids:
            ors.append({"user_id": {"$in": user_ids}})
        and_filters.append({"$or": ors})
    if and_filters:
        query["$and"] = and_filters
    _apply_date_filter(query)
    return query


def _pending_order_status_condition():
    status_kind = _order_lifecycle_status_kind()
    if status_kind == "filled":
        return None
    if status_kind in ["active", "open", "pending"]:
        return {"$in": ORDER_OPEN_STATUSES}
    if status_kind == "cancelled":
        return {"$in": ORDER_CANCELLED_STATUSES}
    return {"$in": ORDER_OPEN_STATUSES + ORDER_CANCELLED_STATUSES}


def _build_pending_futures_order_query(db):
    if _order_market_filter() == "options":
        return _empty_query()
    status_condition = _pending_order_status_condition()
    if status_condition is None:
        return _empty_query()
    query = _build_order_query(db)
    query["status"] = status_condition
    return query


def _build_pending_option_order_query(db):
    if _order_market_filter() == "futures":
        return _empty_query()
    status_condition = _pending_order_status_condition()
    if status_condition is None:
        return _empty_query()
    query = _build_option_order_query(db)
    query["status"] = status_condition
    return query


def _entry_side_label(value):
    raw = str(value or "").strip().lower()
    if raw in ["short", "sell"]:
        return "SELL"
    return "BUY"


def _exit_side_label(value):
    return "BUY" if _entry_side_label(value) == "SELL" else "SELL"


def _position_to_lifecycle_order(db, position, market_type="futures"):
    enriched = dict(position)
    if not enriched.get("user"):
        enriched = _enrich_positions(db, [position])[0]
    is_closed = _position_is_closed(enriched)
    entry = _number(enriched.get("entry_price"))
    exit_price = _number(enriched.get("exit_price"))
    qty = _number(enriched.get("quantity") or enriched.get("qty"))
    notional = _number(enriched.get("notional_value") or enriched.get("notional") or (qty * entry))
    margin = _number(enriched.get("margin_amount") or enriched.get("margin") or _calc_margin_amount(enriched, notional))
    active_pnl = _number(enriched.get("realized_pnl") if is_closed else enriched.get("unrealized_pnl"))
    side = enriched.get("position_side") or enriched.get("side") or enriched.get("action") or "buy"
    created_at = enriched.get("created_at") or enriched.get("opened_at") or enriched.get("date")
    closed_at = enriched.get("closed_at") or enriched.get("settled_at") or enriched.get("liquidated_at") or enriched.get("updated_at")

    item = dict(enriched)
    item["market_type"] = market_type
    item["order_type"] = enriched.get("order_type") or enriched.get("type") or "market"
    item["status"] = "filled" if is_closed else "active"
    item["order_status"] = item["status"]
    item["purpose"] = "lifecycle"
    item["entry_side"] = _entry_side_label(side)
    item["exit_side"] = _exit_side_label(side) if is_closed else "-"
    item["side"] = item["entry_side"]
    item["quantity"] = qty
    item["entry_price"] = entry
    item["exit_price"] = exit_price if is_closed else 0
    item["price"] = entry
    item["notional_value"] = notional
    item["margin_amount"] = margin
    item["pnl"] = active_pnl
    item["realized_pnl"] = active_pnl if is_closed else 0
    item["unrealized_pnl"] = active_pnl if not is_closed else 0
    item["display_symbol"] = enriched.get("display_symbol") or enriched.get("contract") or enriched.get("option_symbol") or enriched.get("symbol")
    item["ticker_symbol"] = enriched.get("ticker_symbol") or _normalize_symbol_for_ticker(enriched.get("symbol"), enriched.get("underlying"), enriched.get("contract"))
    item["created_at"] = created_at
    item["updated_at"] = closed_at if is_closed else enriched.get("updated_at")
    item["order_reference"] = enriched.get("order_reference") or enriched.get("position_reference")
    item["is_lifecycle_order"] = True
    return item


def _enrich_lifecycle_positions(db, positions, market_type="futures"):
    base = _enrich_positions(db, positions) if positions else []
    return [_position_to_lifecycle_order(db, position, market_type=market_type) for position in base]


def _enrich_pending_lifecycle_orders(db, orders, market_type="futures"):
    base = _enrich_option_orders(db, orders) if market_type == "options" else _enrich_orders(db, orders)
    enriched = []
    for item in base:
        status_group = str(item.get("status") or "").lower()
        is_cancelled = status_group in [s.lower() for s in ORDER_CANCELLED_STATUSES]
        item["status"] = "cancelled" if is_cancelled else "active"
        item["order_status"] = item["status"]
        item["purpose"] = "pending" if not is_cancelled else "cancelled"
        item["entry_side"] = _entry_side_label(item.get("side") or item.get("action"))
        item["exit_side"] = "-"
        item["entry_price"] = _number(item.get("price"))
        item["exit_price"] = 0
        item["pnl"] = 0
        item["market_type"] = market_type
        item["is_lifecycle_order"] = False
        enriched.append(item)
    return enriched


def _lifecycle_order_created_at(item):
    value = item.get("updated_at") or item.get("closed_at") or item.get("created_at")
    if isinstance(value, datetime):
        return value
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


def _pending_order_summary(db, collection_name, query):
    summary = _collection_order_summary(db, collection_name, query)
    # Pending/non-lifecycle rows count as Active, not Filled.
    return {
        "total": summary.get("total", 0),
        "open": summary.get("total", 0) - summary.get("cancelled", 0),
        "filled": 0,
        "cancelled": summary.get("cancelled", 0),
        "today": summary.get("today", 0),
        "margin_amount": summary.get("margin_amount", 0),
        "notional_value": summary.get("notional_value", 0),
    }


def _lifecycle_order_summary(db, futures_pos_query, options_pos_query, futures_pending_query, options_pending_query):
    futures_positions = _position_summary(db, futures_pos_query, "positions")
    option_positions = _position_summary(db, options_pos_query, "option_positions")
    futures_pending = _pending_order_summary(db, "orders", futures_pending_query)
    options_pending = _pending_order_summary(db, "option_orders", options_pending_query)
    return _merge_summaries(
        {
            "total": futures_positions.get("total", 0),
            "open": futures_positions.get("open", 0),
            "filled": futures_positions.get("closed", 0),
            "cancelled": 0,
            "today": 0,
            "margin_amount": futures_positions.get("margin_amount", 0),
            "notional_value": futures_positions.get("notional_value", 0),
        },
        {
            "total": option_positions.get("total", 0),
            "open": option_positions.get("open", 0),
            "filled": option_positions.get("closed", 0),
            "cancelled": 0,
            "today": 0,
            "margin_amount": option_positions.get("margin_amount", 0),
            "notional_value": option_positions.get("notional_value", 0),
        },
        futures_pending,
        options_pending,
    )

def _sort_timestamp(item):
    value = item.get("updated_at") or item.get("created_at") or item.get("closed_at")
    if isinstance(value, datetime):
        return value.timestamp()
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0


def _combine_position_summaries(*items):
    result = {
        "total": 0,
        "open": 0,
        "closed": 0,
        "long": 0,
        "short": 0,
        "high_risk": 0,
        "critical_risk": 0,
        "margin_amount": 0.0,
        "notional_value": 0.0,
        "unrealized_pnl": 0.0,
        "realized_pnl": 0.0,
    }
    for item in items:
        for key in result:
            result[key] += _number((item or {}).get(key), 0)
    result["margin_amount"] = round(result["margin_amount"], 8)
    result["notional_value"] = round(result["notional_value"], 8)
    result["unrealized_pnl"] = round(result["unrealized_pnl"], 8)
    result["realized_pnl"] = round(result["realized_pnl"], 8)
    return result

def _load_user_map(db, docs):
    ids = []
    for item in docs:
        value = item.get("user_id")
        if value is None:
            continue
        text = str(value)
        ids.append(text)

    object_ids = [oid for oid in (_as_object_id(value) for value in ids) if oid]
    user_query = []
    if object_ids:
        user_query.append({"_id": {"$in": object_ids}})
    if ids:
        user_query.append({"id": {"$in": ids}})
        user_query.append({"user_id": {"$in": ids}})

    if not user_query:
        return {}

    users = db.users.find({"$or": user_query})
    user_map = {}
    for user in users:
        payload = {
            "id": str(user.get("_id")),
            "name": user.get("name") or user.get("full_name") or user.get("username") or "Unknown User",
            "email": user.get("email") or "",
            "account_status": user.get("account_status") or user.get("status") or "active",
            "kyc_status": user.get("kyc_status") or "pending",
        }
        user_map[str(user.get("_id"))] = payload
        if user.get("id"):
            user_map[str(user.get("id"))] = payload
        if user.get("user_id"):
            user_map[str(user.get("user_id"))] = payload
    return user_map


def _risk_for_position(position):
    explicit = str(position.get("risk_level") or position.get("risk") or "").strip().lower()
    mark = _number(position.get("mark_price") or position.get("current_price") or position.get("entry_price"))
    liquidation = _number(position.get("liquidation_price"))
    distance = None

    if mark > 0 and liquidation > 0:
        distance = round(abs(mark - liquidation) / mark * 100, 4)
        if distance <= 3:
            risk = "critical"
        elif distance <= 8:
            risk = "high"
        elif distance <= 15:
            risk = "medium"
        else:
            risk = "low"
    else:
        risk = explicit or "low"

    return risk, distance


def _normalize_symbol_for_ticker(symbol=None, underlying=None, contract=None):
    text = str(symbol or "").upper().replace("/", "").replace("-", "").strip()
    if text and any(text.endswith(suffix) for suffix in ["USDT", "USDC", "BUSD"]):
        return text

    base = str(underlying or "").upper().replace("/", "").replace("-", "").strip()
    if not base and contract:
        match = re.match(r"([A-Z]+)", str(contract).upper())
        base = match.group(1) if match else ""

    if base and any(base.endswith(suffix) for suffix in ["USDT", "USDC", "BUSD"]):
        return base
    if base:
        return f"{base}USDT"
    return text or "BTCUSDT"


def _position_exit_price(position):
    return _number(
        position.get("exit_price")
        or position.get("close_price")
        or position.get("closed_price")
        or position.get("average_exit_price")
        or position.get("settlement_price")
        or position.get("sell_price")
        or position.get("filled_exit_price")
        or 0
    )


def _position_market_type(position):
    # Option positions are stored in a separate collection and may not carry market_type.
    # Detect them from options-specific fields so Admin Positions can show Futures + Options together.
    explicit = str(
        position.get("market_type")
        or position.get("trading_type")
        or position.get("segment")
        or position.get("product_type")
        or ""
    ).strip().lower()
    if explicit:
        if explicit in ["option", "options", "option_position", "option_positions"]:
            return "options"
        if explicit in ["future", "futures", "future_position", "futures_positions"]:
            return "futures"
        return explicit

    if position.get("contract") or position.get("option_side") or position.get("strike") or position.get("expiry_code"):
        return "options"
    return "futures"


def _position_is_closed(position):
    status_text = str(position.get("status") or "open").strip().lower()
    return status_text in ["closed", "settled", "liquidated"]


def _position_base_mark(position, entry_price=0.0, exit_price=0.0):
    # Admin list must load fast. Do not call Binance from backend for every historical row.
    # Open rows use stored mark/current/entry first; frontend live feed updates open rows after render.
    # Closed rows use exit price as mark because the trade is already settled.
    if _position_is_closed(position):
        return _number(
            exit_price
            or position.get("exit_price")
            or position.get("close_price")
            or position.get("closed_price")
            or position.get("average_exit_price")
            or position.get("settlement_price")
            or position.get("sell_price")
            or position.get("filled_exit_price")
            or position.get("mark_price")
            or position.get("current_price")
            or entry_price
        )

    return _number(
        position.get("mark_price")
        or position.get("mark")
        or position.get("current_price")
        or position.get("last_price")
        or entry_price
    )


def _position_calc_pnl(position, entry_price, mark_price, exit_price, quantity):
    status_text = str(position.get("status") or "open").strip().lower()
    side = str(position.get("position_side") or position.get("side") or "").lower()
    stored_realized = _number(position.get("realized_pnl") or position.get("closed_pnl") or position.get("settled_pnl") or position.get("profit_loss"))
    stored_unrealized = _number(position.get("unrealized_pnl") or position.get("pnl"))

    if status_text in ["closed", "settled", "liquidated"]:
        if stored_realized:
            return stored_realized, 0.0
        close_price = exit_price or mark_price
        if entry_price > 0 and close_price > 0 and quantity > 0:
            if side in ["short", "sell"]:
                return round((entry_price - close_price) * quantity, 8), 0.0
            return round((close_price - entry_price) * quantity, 8), 0.0
        return stored_realized, 0.0

    if stored_unrealized:
        return 0.0, stored_unrealized
    if entry_price > 0 and mark_price > 0 and quantity > 0:
        if side in ["short", "sell"]:
            return 0.0, round((entry_price - mark_price) * quantity, 8)
        return 0.0, round((mark_price - entry_price) * quantity, 8)
    return 0.0, stored_unrealized


def _position_roi(pnl, margin_amount, fallback=0.0):
    if margin_amount > 0:
        return round((pnl / margin_amount) * 100, 4)
    return _number(fallback)


def _enrich_orders(db, orders):
    user_map = _load_user_map(db, orders)
    enriched = []
    for order in orders:
        item = dict(order)
        user = user_map.get(str(item.get("user_id"))) or {}
        item["user"] = user
        item["user_name"] = user.get("name") or item.get("user_name") or item.get("full_name")
        item["email"] = user.get("email") or item.get("email")
        item["quantity"] = _number(item.get("quantity") or item.get("qty"))
        item["filled_quantity"] = _number(item.get("filled_quantity") or item.get("filled_qty") or item.get("executed_quantity") or item.get("executed_qty"))
        item["price"] = _number(item.get("limit_price") or item.get("estimated_price") or item.get("average_fill_price") or item.get("price"))
        item["average_fill_price"] = _number(item.get("average_fill_price") or item.get("execution_price") or item.get("filled_price"))
        item["notional_value"] = _number(item.get("notional_value") or item.get("notional") or item.get("total") or (item["quantity"] * item["price"]))
        item["leverage"] = _clean_leverage(item.get("leverage"), default=1.0)
        item["margin_amount"] = _calc_margin_amount(item, item["notional_value"])
        item["market_type"] = item.get("market_type") or item.get("segment") or "futures"
        item["purpose"] = item.get("purpose") or ("close" if item.get("reduce_only") else "open")
        item["display_symbol"] = item.get("symbol") or "-"
        item["ticker_symbol"] = _normalize_symbol_for_ticker(item.get("symbol"))
        enriched.append(item)
    return enriched


def _enrich_option_orders(db, orders):
    user_map = _load_user_map(db, orders)
    enriched = []
    for order in orders:
        item = dict(order)
        user = user_map.get(str(item.get("user_id"))) or {}
        underlying = str(item.get("underlying") or "").upper()
        contract = item.get("contract") or item.get("option_symbol") or ""
        ticker_symbol = _normalize_symbol_for_ticker(item.get("symbol"), underlying=underlying, contract=contract)

        item["user"] = user
        item["user_name"] = user.get("name") or item.get("user_name") or item.get("full_name")
        item["email"] = user.get("email") or item.get("email")
        item["market_type"] = "options"
        item["purpose"] = item.get("purpose") or "open"
        item["symbol"] = ticker_symbol
        item["ticker_symbol"] = ticker_symbol
        item["display_symbol"] = contract or ticker_symbol
        item["side"] = item.get("side") or item.get("action") or "buy"
        item["quantity"] = _number(item.get("quantity") or item.get("qty"))
        item["filled_quantity"] = _number(item.get("filled_quantity") or item.get("filled_qty") or item.get("executed_quantity") or item.get("executed_qty"))
        item["price"] = _number(item.get("price") or item.get("limit_price") or item.get("mark_price") or item.get("average_fill_price") or item.get("best_ask") or item.get("best_bid"))
        item["average_fill_price"] = _number(item.get("average_fill_price") or item.get("execution_price") or item.get("filled_price"))
        item["notional_value"] = _number(item.get("notional_value") or item.get("notional") or item.get("total") or (item["quantity"] * item["price"]))
        item["leverage"] = _clean_leverage(item.get("leverage"), default=1.0)
        item["margin_amount"] = _calc_margin_amount(item, item["notional_value"])
        enriched.append(item)
    return enriched


def _enrich_close_trades(db, trades):
    user_map = _load_user_map(db, trades)
    enriched = []
    for trade in trades:
        item = dict(trade)
        user = user_map.get(str(item.get("user_id"))) or {}
        qty = _number(item.get("quantity") or item.get("qty"))
        price = _number(item.get("price"))
        item["user"] = user
        item["user_name"] = user.get("name") or item.get("user_name") or item.get("full_name")
        item["email"] = user.get("email") or item.get("email")
        item["market_type"] = "futures"
        item["purpose"] = "close"
        item["order_type"] = "market"
        item["status"] = "filled"
        item["quantity"] = qty
        item["filled_quantity"] = qty
        item["price"] = price
        item["average_fill_price"] = price
        item["notional_value"] = _number(item.get("notional_value") or item.get("notional") or item.get("total") or (qty * price))
        item["leverage"] = _clean_leverage(item.get("leverage"), default=1.0)
        item["margin_amount"] = _calc_margin_amount(item, item["notional_value"])
        item["display_symbol"] = item.get("symbol") or "-"
        item["ticker_symbol"] = _normalize_symbol_for_ticker(item.get("symbol"))
        item["order_reference"] = item.get("trade_reference")
        item["updated_at"] = item.get("created_at")
        enriched.append(item)
    return enriched


def _enrich_option_close_fills(db, fills):
    user_map = _load_user_map(db, fills)
    enriched = []
    for fill in fills:
        item = dict(fill)
        user = user_map.get(str(item.get("user_id"))) or {}
        underlying = str(item.get("underlying") or "").upper()
        contract = item.get("contract") or item.get("option_symbol") or ""
        ticker_symbol = _normalize_symbol_for_ticker(None, underlying=underlying, contract=contract)
        qty = _number(item.get("quantity") or item.get("qty"))
        price = _number(item.get("price"))
        item["user"] = user
        item["user_name"] = user.get("name") or item.get("user_name") or item.get("full_name")
        item["email"] = user.get("email") or item.get("email")
        item["market_type"] = "options"
        item["purpose"] = "close"
        item["order_type"] = "market"
        item["status"] = "filled"
        item["symbol"] = ticker_symbol
        item["ticker_symbol"] = ticker_symbol
        item["display_symbol"] = contract or ticker_symbol
        item["side"] = item.get("side") or item.get("action") or "close"
        item["quantity"] = qty
        item["filled_quantity"] = qty
        item["price"] = price
        item["average_fill_price"] = price
        item["notional_value"] = _number(item.get("notional_value") or item.get("notional") or item.get("total") or (qty * price))
        item["leverage"] = _clean_leverage(item.get("leverage"), default=1.0)
        item["margin_amount"] = _calc_margin_amount(item, item["notional_value"])
        item["order_reference"] = item.get("fill_reference")
        item["updated_at"] = item.get("created_at")
        enriched.append(item)
    return enriched

def _enrich_positions(db, positions):
    user_map = _load_user_map(db, positions)
    enriched = []

    for position in positions:
        item = dict(position)
        user = user_map.get(str(item.get("user_id"))) or {}

        item["user"] = user
        item["user_name"] = user.get("name") or item.get("user_name") or item.get("full_name")
        item["email"] = user.get("email") or item.get("email")

        item["market_type"] = _position_market_type(item)
        item["ticker_symbol"] = _normalize_symbol_for_ticker(item.get("symbol"), underlying=item.get("underlying"), contract=item.get("contract") or item.get("option_symbol"))
        item["display_symbol"] = item.get("display_symbol") or item.get("contract") or item.get("option_symbol") or item.get("symbol") or item.get("ticker_symbol")
        item["side"] = item.get("side") or item.get("position_side") or item.get("action") or "buy"
        item["position_side"] = item.get("position_side") or item.get("side")

        item["quantity"] = _number(item.get("quantity") or item.get("qty"))
        item["entry_price"] = _number(item.get("entry_price") or item.get("entry") or item.get("open_price") or item.get("buy_price") or item.get("average_entry_price"))
        item["exit_price"] = _position_exit_price(item)
        item["mark_price"] = _position_base_mark(item, item["entry_price"], item["exit_price"])
        item["liquidation_price"] = _number(item.get("liquidation_price"))
        item["margin_amount"] = _number(item.get("margin_amount") or item.get("margin") or item.get("wallet_lock_amount") or item.get("wallet_locked_amount"))
        item["notional_value"] = _number(item.get("notional_value") or item.get("notional") or item.get("total") or (item["quantity"] * item["entry_price"]))

        realized, unrealized = _position_calc_pnl(
            item,
            item["entry_price"],
            item["mark_price"],
            item["exit_price"],
            item["quantity"],
        )
        item["realized_pnl"] = realized
        item["unrealized_pnl"] = unrealized
        active_pnl = realized if _position_is_closed(item) else unrealized
        item["roi_percent"] = _position_roi(active_pnl, item["margin_amount"], item.get("roi_percent") or item.get("roi"))

        risk, distance = _risk_for_position(item)
        item["risk_level"] = risk
        item["liquidation_distance_percent"] = distance

        enriched.append(item)

    return enriched

def _safe_aggregate(db, collection_name, pipeline, fallback=None):
    try:
        rows = list(db[collection_name].aggregate(pipeline))
        return rows[0] if rows else (fallback or {})
    except Exception:
        return fallback or {}


def _collection_order_summary(db, collection_name, query):
    collection = db[collection_name]
    total = collection.count_documents(query)
    open_count = collection.count_documents({**query, "status": {"$in": ORDER_OPEN_STATUSES}})
    filled_count = collection.count_documents({**query, "status": {"$in": ORDER_FILLED_STATUSES}})
    cancelled_count = collection.count_documents({**query, "status": {"$in": ORDER_CANCELLED_STATUSES}})
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_count = collection.count_documents({**query, "created_at": {"$gte": today_start}})

    totals = _safe_aggregate(
        db,
        collection_name,
        [
            {"$match": query},
            {"$group": {"_id": None, "margin_amount": {"$sum": "$margin_amount"}, "notional_value": {"$sum": "$notional_value"}}},
        ],
        {"margin_amount": 0, "notional_value": 0},
    )

    return {
        "total": total,
        "open": open_count,
        "filled": filled_count,
        "cancelled": cancelled_count,
        "today": today_count,
        "margin_amount": _number(totals.get("margin_amount")),
        "notional_value": _number(totals.get("notional_value")),
    }



def _close_record_summary(db, collection_name, query):
    total = db[collection_name].count_documents(query)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_count = db[collection_name].count_documents({**query, "created_at": {"$gte": today_start}})
    totals = _safe_aggregate(
        db,
        collection_name,
        [
            {"$match": query},
            {"$group": {"_id": None, "notional_value": {"$sum": "$notional_value"}}},
        ],
        {"notional_value": 0},
    )
    return {
        "total": total,
        "open": 0,
        "filled": total,
        "cancelled": 0,
        "today": today_count,
        "margin_amount": 0.0,
        "notional_value": _number(totals.get("notional_value")),
    }

def _merge_summaries(*items):
    result = {"total": 0, "open": 0, "filled": 0, "cancelled": 0, "today": 0, "margin_amount": 0.0, "notional_value": 0.0}
    for item in items:
        for key in result:
            result[key] += _number(item.get(key), 0)
    for key in ["total", "open", "filled", "cancelled", "today"]:
        result[key] = int(result[key])
    result["margin_amount"] = round(result["margin_amount"], 8)
    result["notional_value"] = round(result["notional_value"], 8)
    return result


def _order_summary(db, query):
    return _collection_order_summary(db, "orders", query)


def _combined_order_summary(db, futures_query=None, options_query=None, market_type="all", close_trade_query=None, option_close_fill_query=None):
    futures_query = futures_query or {}
    options_query = options_query or {}
    close_trade_query = close_trade_query or {"trade_type": {"$in": ["close", "CLOSE"]}}
    option_close_fill_query = option_close_fill_query or {"action": {"$in": ["CLOSE", "close"]}}

    if market_type == "futures":
        return _merge_summaries(
            _collection_order_summary(db, "orders", futures_query),
            _close_record_summary(db, "trades", close_trade_query),
        )
    if market_type == "options":
        return _merge_summaries(
            _collection_order_summary(db, "option_orders", options_query),
            _close_record_summary(db, "option_fills", option_close_fill_query),
        )
    return _merge_summaries(
        _collection_order_summary(db, "orders", futures_query),
        _collection_order_summary(db, "option_orders", options_query),
        _close_record_summary(db, "trades", close_trade_query),
        _close_record_summary(db, "option_fills", option_close_fill_query),
    )


def _order_created_at(item):
    value = item.get("created_at")
    if isinstance(value, datetime):
        return value
    return datetime.min.replace(tzinfo=timezone.utc)

def _position_summary(db, query, collection_name="positions"):
    # Fast summary: never call external Binance API here. Frontend live feed updates open futures rows after render.
    collection = db[collection_name]
    total = collection.count_documents(query)
    open_count = collection.count_documents({**query, "status": {"$in": POSITION_OPEN_STATUSES}})
    closed_count = collection.count_documents({**query, "status": {"$in": POSITION_CLOSED_STATUSES}})

    if collection_name == "option_positions":
        long_count = collection.count_documents({**query, "$or": [{"action": {"$in": ["buy", "BUY", "long", "LONG"]}}, {"side": {"$in": ["buy", "BUY", "long", "LONG"]}}]})
        short_count = collection.count_documents({**query, "$or": [{"action": {"$in": ["sell", "SELL", "short", "SHORT"]}}, {"side": {"$in": ["sell", "SELL", "short", "SHORT"]}}]})
    else:
        long_count = collection.count_documents({**query, "$or": [{"position_side": {"$in": ["long", "buy", "LONG", "BUY"]}}, {"side": {"$in": ["long", "buy", "LONG", "BUY"]}}]})
        short_count = collection.count_documents({**query, "$or": [{"position_side": {"$in": ["short", "sell", "SHORT", "SELL"]}}, {"side": {"$in": ["short", "sell", "SHORT", "SELL"]}}]})

    margin_total = 0.0
    notional_total = 0.0
    live_pnl_total = 0.0
    realized_pnl_total = 0.0
    high_risk = 0
    critical_risk = 0

    for raw in collection.find(query).sort("created_at", -1).limit(2000):
        item = dict(raw)
        item["market_type"] = "options" if collection_name == "option_positions" else _position_market_type(item)
        if collection_name == "option_positions":
            item["side"] = item.get("side") or item.get("action") or "buy"
            item["position_side"] = item.get("position_side") or item.get("side")

        qty = _number(item.get("quantity") or item.get("qty"))
        entry = _number(item.get("entry_price") or item.get("entry") or item.get("open_price") or item.get("buy_price") or item.get("average_entry_price"))
        exit_price = _position_exit_price(item)
        mark = _position_base_mark(item, entry, exit_price)
        margin = _number(item.get("margin_amount") or item.get("margin") or item.get("wallet_lock_amount") or item.get("wallet_locked_amount"))
        notional = _number(item.get("notional_value") or item.get("notional") or item.get("total") or (qty * entry))
        item["mark_price"] = mark
        item["exit_price"] = exit_price
        item["entry_price"] = entry
        item["quantity"] = qty
        item["margin_amount"] = margin

        realized, unrealized = _position_calc_pnl(item, entry, mark, exit_price, qty)
        margin_total += margin
        notional_total += notional
        if _position_is_closed(item):
            realized_pnl_total += realized
        else:
            live_pnl_total += unrealized

        risk, _ = _risk_for_position(item)
        if risk in ["high", "critical"]:
            high_risk += 1
        if risk == "critical":
            critical_risk += 1

    return {
        "total": total,
        "open": open_count,
        "closed": closed_count,
        "long": long_count,
        "short": short_count,
        "high_risk": high_risk,
        "critical_risk": critical_risk,
        "margin_amount": round(margin_total, 8),
        "notional_value": round(notional_total, 8),
        "unrealized_pnl": round(live_pnl_total, 8),
        "realized_pnl": round(realized_pnl_total, 8),
    }


@admin_trading_api.get("/orders")
@admin_required
@permission_required("trading.view")
def list_orders():
    db = get_database()
    page = parse_int(request.args.get("page"), default=1, minimum=1, maximum=100000)
    limit = parse_int(request.args.get("limit"), default=25, minimum=1, maximum=100)
    market_type = _order_market_filter()

    futures_pos_query = _build_lifecycle_position_query(db) if market_type in ["all", "futures"] else _empty_query()
    options_pos_query = _build_lifecycle_option_position_query(db) if market_type in ["all", "options"] else _empty_query()
    futures_pending_query = _build_pending_futures_order_query(db) if market_type in ["all", "futures"] else _empty_query()
    options_pending_query = _build_pending_option_order_query(db) if market_type in ["all", "options"] else _empty_query()

    fetch_size = min(max(page * limit + limit, limit), 500)
    combined = []

    futures_pos_total = db.positions.count_documents(futures_pos_query)
    options_pos_total = db.option_positions.count_documents(options_pos_query)
    futures_pending_total = db.orders.count_documents(futures_pending_query)
    options_pending_total = db.option_orders.count_documents(options_pending_query)

    if market_type in ["all", "futures"]:
        futures_positions = list(db.positions.find(futures_pos_query).sort("created_at", -1).limit(fetch_size)) if futures_pos_total else []
        combined.extend(_enrich_lifecycle_positions(db, futures_positions, market_type="futures"))

        pending_orders = list(db.orders.find(futures_pending_query).sort("created_at", -1).limit(fetch_size)) if futures_pending_total else []
        combined.extend(_enrich_pending_lifecycle_orders(db, pending_orders, market_type="futures"))

    if market_type in ["all", "options"]:
        option_positions = list(db.option_positions.find(options_pos_query).sort("created_at", -1).limit(fetch_size)) if options_pos_total else []
        combined.extend(_enrich_lifecycle_positions(db, option_positions, market_type="options"))

        pending_option_orders = list(db.option_orders.find(options_pending_query).sort("created_at", -1).limit(fetch_size)) if options_pending_total else []
        combined.extend(_enrich_pending_lifecycle_orders(db, pending_option_orders, market_type="options"))

    combined.sort(key=_lifecycle_order_created_at, reverse=True)
    total = futures_pos_total + options_pos_total + futures_pending_total + options_pending_total
    start = (page - 1) * limit
    page_orders = combined[start:start + limit]

    return success_response(
        message="Orders fetched successfully.",
        data={
            "orders": serialize_documents(page_orders),
            "pagination": build_pagination(page, limit, total),
            "summary": _lifecycle_order_summary(db, futures_pos_query, options_pos_query, futures_pending_query, options_pending_query),
        },
    )


@admin_trading_api.get("/orders/<order_id>")
@admin_required
@permission_required("trading.view")
def get_order_detail(order_id):
    db = get_database()
    oid = _as_object_id(order_id)
    if not oid:
        return error_response(message="Order not found.", errors={"order_id": "Invalid order ID."}, status_code=404)

    market_type = _order_market_filter()
    if market_type in ["all", "futures"]:
        order = db.orders.find_one({"_id": oid})
        if order:
            return success_response(message="Order detail fetched successfully.", data={"order": serialize_document(_enrich_orders(db, [order])[0])})

    if market_type in ["all", "options"]:
        order = db.option_orders.find_one({"_id": oid})
        if order:
            return success_response(message="Order detail fetched successfully.", data={"order": serialize_document(_enrich_option_orders(db, [order])[0])})

    return error_response(message="Order not found.", errors={"order_id": "Order was not found."}, status_code=404)


@admin_trading_api.get("/positions")
@admin_required
@permission_required("trading.view")
def list_positions():
    db = get_database()
    page = parse_int(request.args.get("page"), default=1, minimum=1, maximum=100000)
    limit = parse_int(request.args.get("limit"), default=25, minimum=1, maximum=100)
    market_type = _position_market_filter()

    futures_query = _build_position_query(db) if market_type in ["all", "futures"] else _empty_query()
    options_query = _build_option_position_query(db) if market_type in ["all", "options"] else _empty_query()

    futures_total = db.positions.count_documents(futures_query)
    options_total = db.option_positions.count_documents(options_query)
    total = futures_total + options_total

    # Fetch enough rows from both collections, merge by updated/created time, then paginate.
    fetch_size = min((page * limit) + limit, 500)
    futures_positions = list(db.positions.find(futures_query).sort("created_at", -1).limit(fetch_size)) if futures_total else []
    option_positions = list(db.option_positions.find(options_query).sort("updated_at", -1).limit(fetch_size)) if options_total else []

    for item in option_positions:
        item["market_type"] = "options"
        item["side"] = item.get("side") or item.get("action") or "buy"
        item["position_side"] = item.get("position_side") or item.get("side")

    combined = _enrich_positions(db, futures_positions + option_positions)
    combined.sort(key=_sort_timestamp, reverse=True)
    start = (page - 1) * limit
    page_rows = combined[start:start + limit]

    return success_response(
        message="Positions fetched successfully.",
        data={
            "positions": serialize_documents(page_rows),
            "pagination": build_pagination(page, limit, total),
            "summary": _combine_position_summaries(
                _position_summary(db, futures_query, "positions"),
                _position_summary(db, options_query, "option_positions"),
            ),
        },
    )


@admin_trading_api.get("/positions/<position_id>")
@admin_required
@permission_required("trading.view")
def get_position_detail(position_id):
    db = get_database()
    oid = _as_object_id(position_id)
    if not oid:
        return error_response(message="Position not found.", errors={"position_id": "Invalid position ID."}, status_code=404)

    position = db.positions.find_one({"_id": oid})
    if not position:
        position = db.option_positions.find_one({"_id": oid})
        if position:
            position["market_type"] = "options"
            position["side"] = position.get("side") or position.get("action") or "buy"
            position["position_side"] = position.get("position_side") or position.get("side")

    if not position:
        return error_response(message="Position not found.", errors={"position_id": "Position was not found."}, status_code=404)

    return success_response(
        message="Position detail fetched successfully.",
        data={"position": serialize_document(_enrich_positions(db, [position])[0])},
    )


@admin_trading_api.get("/summary")
@admin_required
@permission_required("trading.view")
def trading_summary():
    db = get_database()
    return success_response(
        message="Trading summary fetched successfully.",
        data={
            "orders": _combined_order_summary(db, {}, {}, "all"),
            "positions": _combine_position_summaries(
                _position_summary(db, {}, "positions"),
                _position_summary(db, {}, "option_positions"),
            ),
        },
    )


@admin_trading_api.get("/risk-summary")
@admin_required
@permission_required("trading.view")
def risk_summary():
    db = get_database()
    open_query = {"status": {"$in": POSITION_OPEN_STATUSES}}
    order_query = {"status": {"$in": ORDER_OPEN_STATUSES}}
    open_positions = db.positions.count_documents(open_query)
    open_orders = db.orders.count_documents(order_query) + db.option_orders.count_documents(order_query)

    position_pipeline = list(
        db.positions.aggregate([
            {"$match": open_query},
            {
                "$group": {
                    "_id": "$symbol",
                    "positions": {"$sum": 1},
                    "notional_value": {"$sum": "$notional_value"},
                    "margin_amount": {"$sum": "$margin_amount"},
                    "unrealized_pnl": {"$sum": "$unrealized_pnl"},
                }
            },
            {"$sort": {"notional_value": -1}},
            {"$limit": 20},
        ])
    )

    high_risk_positions = []
    for position in db.positions.find(open_query).sort("created_at", -1).limit(250):
        risk, distance = _risk_for_position(position)
        if risk in ["high", "critical"]:
            item = dict(position)
            item["risk_level"] = risk
            item["liquidation_distance_percent"] = distance
            high_risk_positions.append(item)

    return success_response(
        message="Risk summary fetched successfully.",
        data={
            "open_positions": open_positions,
            "open_orders": open_orders,
            "high_risk_positions": serialize_documents(high_risk_positions[:50]),
            "symbol_exposure": serialize_documents(position_pipeline),
        },
    )

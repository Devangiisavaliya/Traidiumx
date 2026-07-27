from datetime import datetime, timezone
import re

from bson import ObjectId
from flask import Blueprint, g, request

from config.database import get_database
from services.market_service import get_all_binance_tickers, get_provider_symbol
from utils.response import success_response, error_response
from .audit_service import create_admin_audit_log
from .middleware import admin_required
from .permissions import permission_required
from .utils import build_pagination, parse_int, serialize_document, serialize_documents


admin_market_api = Blueprint("admin_market_api", __name__, url_prefix="/markets")

MARKET_TYPES = {"spot", "futures", "options"}
PROVIDER_TYPES = {"binance", "binance_futures", "manual", "internal"}


def _utc_now():
    return datetime.now(timezone.utc)


def _as_object_id(value):
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def _regex(value):
    return re.compile(re.escape(str(value or "").strip()), re.IGNORECASE)


def _clean(value, upper=False, max_length=100):
    text = str(value or "").strip()
    if upper:
        text = text.upper()
    return text[:max_length]


def _to_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on", "active", "enabled"}


def _to_float(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value, default=0, minimum=None, maximum=None):
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default

    if minimum is not None and number < minimum:
        number = minimum

    if maximum is not None and number > maximum:
        number = maximum

    return number


def _market_collection(db):
    return db.market_symbols


def _admin_meta():
    return {
        "updated_by": getattr(g, "current_admin_email", "") or str(getattr(g, "current_admin_id", "")),
        "updated_by_id": str(getattr(g, "current_admin_id", "")),
        "updated_at": _utc_now(),
    }


def _normalize_symbol_payload(payload, existing=None, partial=False):
    data = dict(existing or {})
    errors = {}

    if not partial or "symbol" in payload:
        symbol = _clean(payload.get("symbol"), upper=True, max_length=30)
        symbol = symbol.replace("/", "").replace("-", "").replace("_", "")
        if not symbol:
            errors["symbol"] = "Symbol is required."
        data["symbol"] = symbol

    if not partial or "base_asset" in payload:
        base_asset = _clean(payload.get("base_asset"), upper=True, max_length=20)
        if not base_asset and data.get("symbol", "").endswith("USDT"):
            base_asset = data.get("symbol", "")[:-4]
        if not base_asset:
            errors["base_asset"] = "Base asset is required."
        data["base_asset"] = base_asset

    if not partial or "quote_asset" in payload:
        data["quote_asset"] = _clean(payload.get("quote_asset") or data.get("quote_asset") or "USDT", upper=True, max_length=20)

    if not partial or "display_name" in payload:
        display_name = _clean(payload.get("display_name"), max_length=120)
        if not display_name:
            display_name = f"{data.get('base_asset', '')} / {data.get('quote_asset', 'USDT')}".strip()
        data["display_name"] = display_name

    if not partial or "market_type" in payload:
        market_type = _clean(payload.get("market_type") or data.get("market_type") or "futures", max_length=20).lower()
        if market_type not in MARKET_TYPES:
            errors["market_type"] = "Market type must be spot, futures, or options."
        data["market_type"] = market_type

    if not partial or "provider" in payload:
        provider = _clean(payload.get("provider") or data.get("provider") or "binance_futures", max_length=30).lower()
        if provider not in PROVIDER_TYPES:
            errors["provider"] = "Provider must be binance, binance_futures, manual, or internal."
        data["provider"] = provider

    if not partial or "provider_symbol" in payload:
        provider_symbol = _clean(payload.get("provider_symbol") or data.get("provider_symbol") or data.get("symbol"), upper=True, max_length=40)
        data["provider_symbol"] = provider_symbol.replace("/", "").replace("-", "").replace("_", "")

    bool_fields = [
        ("is_active", True),
        ("futures_enabled", True),
        ("options_enabled", False),
        ("deposit_enabled", False),
        ("withdraw_enabled", False),
    ]
    for field, default in bool_fields:
        if not partial or field in payload:
            data[field] = _to_bool(payload.get(field), default=data.get(field, default))

    numeric_fields = {
        "min_qty": (0.001, 0, None),
        "max_leverage": (20, 1, 125),
        "price_precision": (2, 0, 10),
        "quantity_precision": (3, 0, 10),
        "sort_order": (0, 0, None),
    }
    for field, (default, minimum, maximum) in numeric_fields.items():
        if not partial or field in payload:
            if field == "min_qty":
                data[field] = _to_float(payload.get(field), default=data.get(field, default))
            else:
                data[field] = _to_int(payload.get(field), default=data.get(field, default), minimum=minimum, maximum=maximum)

    data["updated_at"] = _utc_now()
    data.pop("_id", None)

    if errors:
        return None, errors

    return data, {}


def _build_market_query():
    search = _clean(request.args.get("search"), max_length=80)
    status = _clean(request.args.get("status"), max_length=20).lower()
    market_type = _clean(request.args.get("market_type"), max_length=20).lower()
    quote_asset = _clean(request.args.get("quote_asset"), upper=True, max_length=20)
    provider = _clean(request.args.get("provider"), max_length=30).lower()
    futures = _clean(request.args.get("futures"), max_length=20).lower()
    options = _clean(request.args.get("options"), max_length=20).lower()

    query = {}

    if search:
        rx = _regex(search)
        query["$or"] = [
            {"symbol": rx},
            {"base_asset": rx},
            {"quote_asset": rx},
            {"display_name": rx},
            {"provider_symbol": rx},
        ]

    if status == "active":
        query["is_active"] = True
    elif status == "inactive":
        query["is_active"] = False

    if market_type and market_type != "all":
        query["market_type"] = market_type

    if quote_asset and quote_asset != "ALL":
        query["quote_asset"] = quote_asset

    if provider and provider != "all":
        query["provider"] = provider

    if futures in {"enabled", "true", "yes"}:
        query["futures_enabled"] = True
    elif futures in {"disabled", "false", "no"}:
        query["futures_enabled"] = False

    if options in {"enabled", "true", "yes"}:
        query["options_enabled"] = True
    elif options in {"disabled", "false", "no"}:
        query["options_enabled"] = False

    return query


def _market_stats(db):
    collection = _market_collection(db)
    total = collection.count_documents({})
    active = collection.count_documents({"is_active": True})
    inactive = collection.count_documents({"is_active": False})
    futures = collection.count_documents({"futures_enabled": True})
    options = collection.count_documents({"options_enabled": True})

    return {
        "total": total,
        "active": active,
        "inactive": inactive,
        "futures_enabled": futures,
        "options_enabled": options,
    }


def _live_ticker_map():
    try:
        result = get_all_binance_tickers()
        if not result.get("success"):
            return {}, result.get("message") or "Provider unavailable."
        return result.get("data") or {}, ""
    except Exception as error:
        return {}, str(error)


def _enrich_markets(rows, include_live=True):
    if not include_live:
        return rows, {"enabled": False, "provider_status": "disabled"}

    ticker_map, provider_error = _live_ticker_map()
    enriched = []
    live_count = 0

    for row in rows:
        item = dict(row)
        try:
            provider_symbol = get_provider_symbol(item)
        except Exception:
            provider_symbol = item.get("provider_symbol") or item.get("symbol")

        ticker = ticker_map.get(str(provider_symbol or "").upper(), {})
        last_price = _to_float(ticker.get("lastPrice"))
        quote_volume = _to_float(ticker.get("quoteVolume"))
        change_percent = _to_float(ticker.get("priceChangePercent"))

        if last_price > 0:
            live_count += 1

        item["provider_symbol"] = provider_symbol
        item["last_price"] = last_price
        item["price_change_percent"] = change_percent
        item["quote_volume"] = quote_volume
        item["is_live"] = last_price > 0
        item["live_updated_at"] = _utc_now()
        enriched.append(item)

    return enriched, {
        "enabled": True,
        "provider_status": "online" if not provider_error else "degraded",
        "provider_error": provider_error,
        "live_count": live_count,
    }


@admin_market_api.get("")
@admin_required
@permission_required("markets.view")
def list_markets():
    db = get_database()
    page = parse_int(request.args.get("page"), default=1, minimum=1, maximum=100000)
    limit = parse_int(request.args.get("limit"), default=25, minimum=1, maximum=100)
    include_live = str(request.args.get("include_live", "true")).lower() not in {"0", "false", "no"}
    query = _build_market_query()

    collection = _market_collection(db)
    total = collection.count_documents(query)
    rows = list(
        collection.find(query)
        .sort([("sort_order", 1), ("symbol", 1)])
        .skip((page - 1) * limit)
        .limit(limit)
    )
    rows, live_meta = _enrich_markets(rows, include_live=include_live)

    summary = _market_stats(db)
    summary.update({
        "live_count": live_meta.get("live_count", 0),
        "provider_status": live_meta.get("provider_status", "disabled"),
    })

    return success_response(
        message="Markets fetched successfully.",
        data={
            "markets": serialize_documents(rows),
            "pagination": build_pagination(page, limit, total),
            "summary": summary,
            "live": live_meta,
        },
    )


@admin_market_api.post("")
@admin_required
@permission_required("markets.manage")
def create_market():
    db = get_database()
    payload = request.get_json(silent=True) or {}
    data, errors = _normalize_symbol_payload(payload)

    if errors:
        return error_response(message="Market validation failed.", errors=errors, status_code=422)

    collection = _market_collection(db)
    if collection.find_one({"symbol": data["symbol"]}):
        return error_response(message="Market symbol already exists.", errors={"symbol": "Duplicate symbol."}, status_code=409)

    data.update(_admin_meta())
    data["created_at"] = _utc_now()
    result = collection.insert_one(data)
    created = collection.find_one({"_id": result.inserted_id})

    create_admin_audit_log(
        admin_id=getattr(g, "current_admin_id", ""),
        admin_email=getattr(g, "current_admin_email", ""),
        action="market.create",
        resource_type="market",
        resource_id=str(result.inserted_id),
        message=f"Created market {data.get('symbol')}.",
        metadata={"symbol": data.get("symbol")},
    )

    return success_response(message="Market created successfully.", data={"market": serialize_document(created)}, status_code=201)


@admin_market_api.put("/<market_id>")
@admin_required
@permission_required("markets.manage")
def update_market(market_id):
    db = get_database()
    oid = _as_object_id(market_id)
    if not oid:
        return error_response(message="Invalid market id.", errors={"id": "Invalid ObjectId."}, status_code=400)

    collection = _market_collection(db)
    existing = collection.find_one({"_id": oid})
    if not existing:
        return error_response(message="Market not found.", errors={"market": "Not found."}, status_code=404)

    payload = request.get_json(silent=True) or {}
    data, errors = _normalize_symbol_payload(payload, existing=existing, partial=True)

    if errors:
        return error_response(message="Market validation failed.", errors=errors, status_code=422)

    if data.get("symbol") != existing.get("symbol") and collection.find_one({"symbol": data.get("symbol"), "_id": {"$ne": oid}}):
        return error_response(message="Market symbol already exists.", errors={"symbol": "Duplicate symbol."}, status_code=409)

    data.update(_admin_meta())
    collection.update_one({"_id": oid}, {"$set": data})
    updated = collection.find_one({"_id": oid})

    create_admin_audit_log(
        admin_id=getattr(g, "current_admin_id", ""),
        admin_email=getattr(g, "current_admin_email", ""),
        action="market.update",
        resource_type="market",
        resource_id=market_id,
        message=f"Updated market {updated.get('symbol')}.",
        metadata={"symbol": updated.get("symbol")},
    )

    return success_response(message="Market updated successfully.", data={"market": serialize_document(updated)})


@admin_market_api.post("/<market_id>/toggle")
@admin_required
@permission_required("markets.manage")
def toggle_market(market_id):
    db = get_database()
    oid = _as_object_id(market_id)
    if not oid:
        return error_response(message="Invalid market id.", errors={"id": "Invalid ObjectId."}, status_code=400)

    payload = request.get_json(silent=True) or {}
    is_active = _to_bool(payload.get("is_active"), default=True)

    collection = _market_collection(db)
    existing = collection.find_one({"_id": oid})
    if not existing:
        return error_response(message="Market not found.", errors={"market": "Not found."}, status_code=404)

    update = {"is_active": is_active, **_admin_meta()}
    collection.update_one({"_id": oid}, {"$set": update})
    updated = collection.find_one({"_id": oid})

    create_admin_audit_log(
        admin_id=getattr(g, "current_admin_id", ""),
        admin_email=getattr(g, "current_admin_email", ""),
        action="market.activate" if is_active else "market.deactivate",
        resource_type="market",
        resource_id=market_id,
        message=f"{'Activated' if is_active else 'Deactivated'} market {updated.get('symbol')}.",
        metadata={"symbol": updated.get("symbol"), "is_active": is_active},
    )

    return success_response(message="Market status updated successfully.", data={"market": serialize_document(updated)})

from datetime import datetime, timedelta, timezone

from flask import Blueprint

from config.database import get_database
from utils.response import success_response
from .middleware import admin_required
from .permissions import permission_required


admin_dashboard_api = Blueprint("admin_dashboard_api", __name__, url_prefix="/dashboard")


PENDING_WITHDRAWAL_STATUSES = [
    "pending",
    "pending_payout",
    "pending_admin_approval",
    "queued",
    "PENDING",
    "PENDING_PAYOUT",
    "PENDING_ADMIN_APPROVAL",
    "QUEUED",
]


def _utc_now():
    return datetime.now(timezone.utc)


def _start_of_day(value):
    return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)


def _date_key(value):
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).strftime("%Y-%m-%d")
    return None


def _to_number(value, fallback=0):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return fallback


def _empty_daily_series(days=14):
    today = _start_of_day(_utc_now())
    start = today - timedelta(days=days - 1)
    labels = [(start + timedelta(days=index)).strftime("%Y-%m-%d") for index in range(days)]
    return start, labels


def _count_by_day(collection, match, date_field="created_at", days=14):
    start, labels = _empty_daily_series(days)
    query = dict(match or {})
    query[date_field] = {"$gte": start}
    buckets = {label: 0 for label in labels}

    for item in collection.find(query, {date_field: 1}):
        key = _date_key(item.get(date_field))
        if key in buckets:
            buckets[key] += 1

    return [{"date": label, "count": buckets[label]} for label in labels]


def _amount_by_day(collection, match, amount_fields, date_field="created_at", days=14):
    start, labels = _empty_daily_series(days)
    query = dict(match or {})
    query[date_field] = {"$gte": start}
    buckets = {label: 0 for label in labels}
    projection = {date_field: 1}
    for field in amount_fields:
        projection[field] = 1

    for item in collection.find(query, projection):
        key = _date_key(item.get(date_field))
        if key not in buckets:
            continue
        amount = 0
        for field in amount_fields:
            amount = _to_number(item.get(field))
            if amount:
                break
        buckets[key] += amount

    return [{"date": label, "amount": round(buckets[label], 8)} for label in labels]


def _status_breakdown(collection, match=None, field="status"):
    pipeline = []
    if match:
        pipeline.append({"$match": match})
    pipeline.extend([
        {"$group": {"_id": {"$ifNull": [f"${field}", "unknown"]}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ])
    return [
        {"status": str(item.get("_id") or "unknown"), "count": int(item.get("count", 0))}
        for item in collection.aggregate(pipeline)
    ]


def _wallet_totals(db):
    wallet_pipeline = list(
        db.wallets.aggregate([
            {
                "$group": {
                    "_id": None,
                    "available_balance": {
                        "$sum": {"$ifNull": ["$available_balance", 0]}
                    },
                    "locked_balance": {
                        "$sum": {"$ifNull": ["$locked_balance", 0]}
                    },
                }
            }
        ])
    )

    wallet_totals = wallet_pipeline[0] if wallet_pipeline else {
        "available_balance": 0,
        "locked_balance": 0,
    }

    wallet_totals.pop("_id", None)

    available_balance = _to_number(wallet_totals.get("available_balance"))
    locked_balance = _to_number(wallet_totals.get("locked_balance"))

    wallet_totals["available_balance"] = round(available_balance, 8)
    wallet_totals["locked_balance"] = round(locked_balance, 8)
    wallet_totals["total_balance"] = round(available_balance + locked_balance, 8)

    return wallet_totals


def _risk_alert_count(db):
    alert_count = 0

    open_statuses = ["open", "OPEN"]

    positions = db.positions.find(
        {"status": {"$in": open_statuses}},
        {
            "risk_level": 1,
            "risk": 1,
            "margin_ratio": 1,
            "liquidation_risk": 1,
            "liquidation_price": 1,
            "mark_price": 1,
            "current_price": 1,
            "entry_price": 1,
            "unrealized_pnl": 1,
            "pnl": 1,
            "margin_amount": 1,
            "margin": 1,
        },
    ).limit(5000)

    for position in positions:
        risk = str(position.get("risk_level") or position.get("risk") or "").lower()
        margin_ratio = _to_number(position.get("margin_ratio"))
        liquidation_risk = bool(position.get("liquidation_risk"))

        mark_price = _to_number(
            position.get("mark_price")
            or position.get("current_price")
            or position.get("entry_price")
        )
        liquidation_price = _to_number(position.get("liquidation_price"))

        pnl = _to_number(position.get("unrealized_pnl") or position.get("pnl"))
        margin_amount = _to_number(position.get("margin_amount") or position.get("margin"))

        is_high_risk = risk in ["high", "critical"]
        is_margin_risk = margin_ratio >= 0.8
        is_liquidation_flag = liquidation_risk

        is_near_liquidation = False
        if mark_price > 0 and liquidation_price > 0:
            distance_percent = abs(mark_price - liquidation_price) / mark_price * 100
            is_near_liquidation = distance_percent <= 10

        is_large_loss = False
        if pnl < 0 and margin_amount > 0:
            loss_percent = abs(pnl) / margin_amount * 100
            is_large_loss = loss_percent >= 50

        if (
            is_high_risk
            or is_margin_risk
            or is_liquidation_flag
            or is_near_liquidation
            or is_large_loss
        ):
            alert_count += 1

    return alert_count

def _daily_volume(db):
    since = _utc_now() - timedelta(hours=24)
    total = 0
    for collection_name in ("trades", "orders", "option_orders"):
        collection = db[collection_name]
        for item in collection.find({"created_at": {"$gte": since}}, {"notional": 1, "total": 1, "amount": 1, "quantity": 1, "price": 1}):
            amount = _to_number(item.get("notional") or item.get("total") or item.get("amount"))
            if not amount:
                amount = _to_number(item.get("quantity")) * _to_number(item.get("price"))
            total += amount
    return round(total, 8)


@admin_dashboard_api.get("/summary")
@admin_required
@permission_required("dashboard.view")
def dashboard_summary():
    db = get_database()

    total_users = db.users.count_documents({})
    active_users = db.users.count_documents({"account_status": "active"})
    blocked_users = db.users.count_documents({"account_status": {"$ne": "active"}})
    pending_kyc = db.kyc_requests.count_documents({"status": "pending"})
    approved_kyc = db.kyc_requests.count_documents({"status": "approved"})

    pending_withdrawals = db.withdrawals.count_documents({
        "status": {"$in": PENDING_WITHDRAWAL_STATUSES}
    })
    approved_withdrawals = db.withdrawals.count_documents({"status": {"$in": ["approved", "completed"]}})
    rejected_withdrawals = db.withdrawals.count_documents({"status": "rejected"})

    open_orders = db.orders.count_documents({"status": {"$in": ["open", "pending_trigger"]}})
    open_positions = db.positions.count_documents({"status": "open"})
    closed_positions = db.positions.count_documents({"status": {"$ne": "open"}})

    return success_response(
        message="Admin dashboard summary fetched successfully.",
        data={
            "users": {
                "total": total_users,
                "active": active_users,
                "blocked": blocked_users,
            },
            "kyc": {
                "pending": pending_kyc,
                "approved": approved_kyc,
            },
            "wallet": _wallet_totals(db),
            "withdrawals": {
                "pending": pending_withdrawals,
                "approved": approved_withdrawals,
                "rejected": rejected_withdrawals,
            },
            "trading": {
                "open_orders": open_orders,
                "open_positions": open_positions,
                "closed_positions": closed_positions,
                "daily_volume": _daily_volume(db),
                "risk_alerts": _risk_alert_count(db),
            },
        },
    )


@admin_dashboard_api.get("/analytics")
@admin_required
@permission_required("dashboard.view")
def dashboard_analytics():
    db = get_database()
    days = 14

    data = {
        "range": {"days": days},
        "users_growth": _count_by_day(db.users, {}, days=days),
        "deposits_volume": _amount_by_day(
            db.deposits,
            {"status": {"$in": ["approved", "completed", "confirmed", "APPROVED", "COMPLETED", "CONFIRMED"]}},
            ["amount", "deposit_amount", "usdt_amount"],
            days=days,
        ),
        "withdrawals_volume": _amount_by_day(
            db.withdrawals,
            {"status": {"$in": ["approved", "completed", "pending_admin_approval", "pending", "APPROVED", "COMPLETED", "PENDING_ADMIN_APPROVAL", "PENDING"]}},
            ["amount", "locked_amount", "withdrawal_amount"],
            days=days,
        ),
        "orders_by_status": _status_breakdown(db.orders),
        "positions_by_status": _status_breakdown(db.positions),
        "withdrawals_by_status": _status_breakdown(db.withdrawals),
    }

    return success_response(
        message="Admin dashboard analytics fetched successfully.",
        data=data,
    )

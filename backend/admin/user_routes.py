from datetime import datetime, time, timezone
import csv
import io
import re
import zipfile
from html import escape as xml_escape

from bson import ObjectId
from flask import Blueprint, Response, g, request

from config.database import get_database
from models.user_model import find_user_by_id
from services.user_status_service import apply_user_account_status, schedule_user_account_action
from services.notification_service import create_user_notification
from services.email_service import send_user_account_status_email
from utils.date_helper import now_utc
from utils.response import error_response, success_response
from .audit_service import create_admin_audit_log
from .middleware import admin_required
from .permissions import permission_required
from .position_pnl import calculate_unrealized_pnl
from .utils import build_pagination, parse_int, serialize_document, serialize_documents, serialize_value


admin_user_api = Blueprint("admin_user_api", __name__, url_prefix="/users")

ACTIVE_STATUSES = ["active", "ACTIVE"]
BLOCKED_STATUSES = ["blocked", "BLOCKED"]
SUSPENDED_STATUSES = ["suspended", "SUSPENDED"]
RESTRICTED_STATUSES = ["blocked", "suspended", "disabled", "deactivated", "banned", "BLOCKED", "SUSPENDED", "DISABLED", "DEACTIVATED", "BANNED"]


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




def _parse_grace_seconds(data):
    for key in ["grace_seconds", "graceSeconds", "grace_time_seconds"]:
        if key in data:
            try:
                return max(0, int(float(data.get(key) or 0)))
            except (TypeError, ValueError):
                return 0

    value = data.get("grace_minutes") or data.get("graceMinutes") or data.get("grace_time_minutes")
    try:
        return max(0, int(float(value or 0) * 60))
    except (TypeError, ValueError):
        return 0


def _parse_suspend_hours(data):
    try:
        return max(1, int(float(data.get("suspend_hours") or data.get("suspendHours") or 24)))
    except (TypeError, ValueError):
        return 24

def _parse_date(value, end_of_day=False):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        if len(text) == 10:
            day = datetime.fromisoformat(text).date()
            selected_time = time.max if end_of_day else time.min
            return datetime.combine(day, selected_time, tzinfo=timezone.utc)
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except Exception:
        return None


def _user_identity_terms(search):
    text = str(search or "").strip()
    if not text:
        return []

    rx = _regex(text)
    terms = [
        {"name": rx},
        {"full_name": rx},
        {"username": rx},
        {"email": rx},
        {"phone": rx},
        {"mobile": rx},
        {"country": rx},
        {"uid": rx},
        {"user_uid": rx},
        {"referral_code": rx},
    ]

    oid = _as_object_id(text)
    if oid:
        terms.append({"_id": oid})

    return terms


def _build_user_query():
    search = str(request.args.get("search") or "").strip()
    status = str(request.args.get("status") or "").strip().lower()
    kyc_status = str(request.args.get("kyc_status") or "").strip().lower()
    country = str(request.args.get("country") or "").strip()
    date_from = _parse_date(request.args.get("date_from"), end_of_day=False)
    date_to = _parse_date(request.args.get("date_to"), end_of_day=True)

    query = {}

    if search:
        query["$or"] = _user_identity_terms(search)

    if status and status != "all":
        if status == "restricted":
            query["account_status"] = {"$in": RESTRICTED_STATUSES}
        else:
            query["account_status"] = {"$in": [status, status.upper()]}

    if kyc_status and kyc_status != "all":
        query["kyc_status"] = {"$in": [kyc_status, kyc_status.upper()]}

    if country:
        query["country"] = _regex(country)

    created_range = {}
    if date_from:
        created_range["$gte"] = date_from
    if date_to:
        created_range["$lte"] = date_to
    if created_range:
        query["created_at"] = created_range

    # Hide sub-accounts from the main user management dashboard list
    query["parent_user_id"] = {"$exists": False}

    return query


def _wallet_user_keys(user_id):
    keys = [str(user_id)]
    oid = _as_object_id(user_id)
    if oid:
        keys.append(oid)
    return keys


def _wallet_projection():
    return {
        "available_balance": 1,
        "locked_balance": 1,
        "total_balance": 1,
        "balance": 1,
        "currency": 1,
        "updated_at": 1,
        "user_id": 1,
        "main_wallet": 1,
        "trading_wallet": 1,
    }


def _wallet_total(wallet):
    if not wallet:
        return 0.0
    available = _number(wallet.get("available_balance"))
    locked = _number(wallet.get("locked_balance"))
    explicit_total = _number(wallet.get("total_balance") or wallet.get("balance"))
    if explicit_total:
        return explicit_total
    return available + locked


def _load_wallet_map(db, users):
    user_ids = [str(user.get("_id")) for user in users if user.get("_id")]
    if not user_ids:
        return {}

    object_ids = [oid for oid in (_as_object_id(value) for value in user_ids) if oid]
    ors = [{"user_id": {"$in": user_ids}}]
    if object_ids:
        ors.append({"user_id": {"$in": object_ids}})

    wallet_map = {}
    for wallet in db.wallets.find({"$or": ors}, _wallet_projection()):
        key = str(wallet.get("user_id"))
        wallet_map[key] = wallet
    return wallet_map


def _enrich_users(db, users):
    wallet_map = _load_wallet_map(db, users)
    
    # Preload parent users if there are sub-accounts
    parent_ids = []
    for u in users:
        parent_id = u.get("parent_user_id")
        if parent_id:
            try:
                parent_ids.append(ObjectId(parent_id))
            except Exception:
                pass
    
    parent_map = {}
    if parent_ids:
        parents = list(db.users.find({"_id": {"$in": parent_ids}}))
        parent_map = {str(p["_id"]): p for p in parents}

    enriched = []

    for user in users:
        item = dict(user)
        item.pop("password_hash", None)
        
        # Override email and mobile if sub-account
        parent_user_id = item.get("parent_user_id")
        if parent_user_id:
            parent = parent_map.get(str(parent_user_id))
            if parent:
                item["email"] = parent.get("email", item.get("email"))
                item["mobile"] = parent.get("mobile", item.get("mobile"))
                item["kyc_status"] = parent.get("kyc_status", item.get("kyc_status"))
                item["kyc"] = parent.get("kyc_status", item.get("kyc_status"))

        wallet = wallet_map.get(str(item.get("_id"))) or {}
        item["wallet"] = wallet
        
        main_w = wallet.get("main_wallet") or {}
        trading_w = wallet.get("trading_wallet") or {}
        
        main_total = _number(main_w.get("total_balance") or (main_w.get("available_balance", 0.0) + main_w.get("locked_balance", 0.0)))
        trading_total = _number(trading_w.get("total_balance") or (trading_w.get("available_balance", 0.0) + trading_w.get("locked_balance", 0.0)))
        if not trading_total and not trading_w:
            trading_total = _number(wallet.get("total_balance") or wallet.get("balance") or (wallet.get("available_balance", 0.0) + wallet.get("locked_balance", 0.0)))
            
        item["available_balance"] = _number(trading_w.get("available_balance") or wallet.get("available_balance"))
        item["locked_balance"] = _number(trading_w.get("locked_balance") or wallet.get("locked_balance"))
        item["main_balance"] = round(main_total, 8)
        item["trading_balance"] = round(trading_total, 8)
        item["total_balance"] = round(main_total + trading_total, 8)
        item["account_status"] = item.get("account_status") or item.get("status") or "active"
        item["kyc_status"] = item.get("kyc_status") or item.get("kyc") or "pending"
        enriched.append(item)

    return enriched


def _user_base_match(user_id):
    oid = _as_object_id(user_id)
    possible = [str(user_id)]
    if oid:
        possible.append(oid)
    return possible


def _find_user_wallet(db, user_id):
    return db.wallets.find_one({"user_id": {"$in": _user_base_match(user_id)}}, _wallet_projection())


def _recent_user_docs(db, collection_name, user_id, limit=10):
    return list(
        db[collection_name]
        .find({"user_id": {"$in": _user_base_match(user_id)}})
        .sort("created_at", -1)
        .limit(limit)
    )


def _sum_collection_amount(db, collection_name, user_id, statuses=None, amount_fields=None):
    amount_fields = amount_fields or ["amount", "total", "usdt_amount", "locked_amount"]
    query = {"user_id": {"$in": _user_base_match(user_id)}}
    if statuses:
        query["status"] = {"$in": statuses}

    total = 0.0
    projection = {field: 1 for field in amount_fields}
    for doc in db[collection_name].find(query, projection):
        amount = 0.0
        for field in amount_fields:
            amount = _number(doc.get(field))
            if amount:
                break
        total += amount
    return round(total, 8)


def _position_side_label(position):
    side = str(position.get("position_side") or position.get("side") or "").strip().lower()
    if side in ["long", "buy"]:
        return "BUY"
    if side in ["short", "sell"]:
        return "SELL"
    return side.upper() if side else "-"


def _position_display_pnl(position):
    status = str(position.get("status") or "open").strip().lower()

    if status == "open":
        pnl_data = calculate_unrealized_pnl(position)
        position["mark_price"] = _number(pnl_data.get("mark_price") or position.get("mark_price") or position.get("current_price") or position.get("entry_price"))
        position["unrealized_pnl"] = _number(pnl_data.get("unrealized_pnl") or position.get("unrealized_pnl") or position.get("pnl"))
        position["roi_percent"] = _number(pnl_data.get("roi_percent") or position.get("roi_percent") or position.get("roi"))
        return _number(position.get("unrealized_pnl"))

    return _number(
        position.get("realized_pnl")
        or position.get("closed_pnl")
        or position.get("pnl")
        or position.get("unrealized_pnl")
    )


def _enrich_recent_positions(positions):
    enriched = []
    for position in positions:
        item = dict(position)
        display_pnl = _position_display_pnl(item)
        item["display_side"] = _position_side_label(item)
        item["display_pnl"] = round(display_pnl, 8)
        if str(item.get("status") or "").lower() != "open":
            item["unrealized_pnl"] = round(display_pnl, 8)
        enriched.append(item)
    return enriched


def _positions_pnl(db, user_id):
    total = 0.0
    for position in db.positions.find({"user_id": {"$in": _user_base_match(user_id)}}).sort("created_at", -1).limit(1000):
        total += _position_display_pnl(dict(position))
    return round(total, 8)


def _create_status_audit(user_id, status, reason, result):
    action = {
        "active": "user.activated",
        "blocked": "user.blocked",
        "suspended": "user.suspended",
    }.get(status, "user.status.updated")

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action=action,
        resource_type="user",
        resource_id=user_id,
        message=(
            f"User account restriction scheduled from {result.get('old_status')} to {result.get('scheduled_status')}."
            if result.get("scheduled_status")
            else f"User account status changed from {result.get('old_status')} to {status}."
        ),
        metadata={
            "old_status": result.get("old_status"),
            "new_status": result.get("new_status", status),
            "scheduled_status": result.get("scheduled_status"),
            "reason": reason,
            "grace_seconds": result.get("grace_seconds"),
            "grace_until": result.get("grace_until"),
            "suspend_hours": result.get("suspend_hours"),
            "enforcement": "Pending actions keep the user active during grace time; auth_required applies the final restriction after the timer ends.",
        },
    )




def _status_notice_content(status, reason, result):
    status = str(status or "").strip().lower()
    scheduled_status = str(result.get("scheduled_status") or "").strip().lower()
    final_status = scheduled_status or str(result.get("new_status") or status).strip().lower()
    reason = str(reason or result.get("reason") or "").strip()

    if scheduled_status:
        if scheduled_status == "blocked":
            title = "Account Block Scheduled"
            message = "Your TraidiumX account is scheduled to be blocked after the grace time ends."
            severity = "warning"
        else:
            title = "Account Suspend Scheduled"
            hours = result.get("suspend_hours") or 24
            message = f"Your TraidiumX account is scheduled to be suspended for {hours} hour(s) after the grace time ends."
            severity = "warning"
    elif final_status == "active":
        title = "Account Activated"
        message = "Your TraidiumX account is active again. You can continue using your account."
        severity = "success"
    elif final_status == "blocked":
        title = "Account Blocked"
        message = "Your TraidiumX account has been blocked by admin. Please contact support if you need help."
        severity = "danger"
    elif final_status == "suspended":
        hours = result.get("suspend_hours") or 24
        title = "Account Suspended"
        message = f"Your TraidiumX account has been suspended for {hours} hour(s). Please contact support if you need help."
        severity = "warning"
    else:
        title = "Account Status Updated"
        message = "Your TraidiumX account status was updated by admin."
        severity = "info"

    return title, message, severity, final_status, reason


def _send_status_notification_and_email(user_id, status, reason, result):
    """Best-effort user notification + email for admin status changes."""
    try:
        data_user = (result.get("data") or {}).get("user")
        user = data_user or find_user_by_id(user_id)
        if not user:
            return {"notification_created": False, "email_sent": False, "reason": "User not found."}

        title, message, severity, final_status, clean_reason = _status_notice_content(status, reason, result)
        metadata = {
            "old_status": result.get("old_status"),
            "new_status": result.get("new_status"),
            "scheduled_status": result.get("scheduled_status"),
            "final_status": final_status,
            "grace_seconds": result.get("grace_seconds"),
            "grace_until": result.get("grace_until"),
            "suspend_hours": result.get("suspend_hours"),
            "reason": clean_reason,
        }

        created = create_user_notification(
            user=user,
            title=title,
            message=message if not clean_reason else f"{message} Reason: {clean_reason}",
            notice_type="account_status",
            severity=severity,
            metadata=metadata,
            admin_id=g.current_admin_id,
            admin_email=g.current_admin_email,
        )

        email_status = {"sent": False, "reason": "User email not available."}
        user_email = str(user.get("email") or "").strip()
        if user_email:
            email_status = send_user_account_status_email(
                to_email=user_email,
                user_name=user.get("name") or user.get("full_name") or user.get("username") or "",
                title=title,
                message_text=message,
                reason=clean_reason,
            )

        return {
            "notification_created": bool(created),
            "notification_id": str(created.get("_id")) if created else None,
            "email_sent": bool(email_status.get("sent")),
            "email_reason": email_status.get("reason"),
        }
    except Exception as error:
        return {"notification_created": False, "email_sent": False, "reason": str(error)}

def _set_user_status(user_id, status, reason="", grace_seconds=0, suspend_hours=24):
    status = str(status or "").strip().lower()
    grace_seconds = max(0, int(grace_seconds or 0))

    if status in {"blocked", "suspended"} and grace_seconds > 0:
        result = schedule_user_account_action(
            user_id=user_id,
            action=status,
            reason=reason,
            grace_seconds=grace_seconds,
            suspend_hours=suspend_hours or 24,
            admin_id=g.current_admin_id,
            admin_email=g.current_admin_email,
        )
    else:
        result = apply_user_account_status(
            user_id=user_id,
            status=status,
            reason=reason,
            admin_id=g.current_admin_id,
            admin_email=g.current_admin_email,
            suspend_hours=suspend_hours or 24,
        )

    if not result["success"]:
        return error_response(
            message=result["message"],
            errors=result.get("errors", {}),
            status_code=result.get("status_code", 400),
        )

    _create_status_audit(user_id, status, reason, result)
    delivery_status = _send_status_notification_and_email(user_id, status, reason, result)

    data = result.get("data", {}) or {}
    if data.get("user"):
        data["user"] = serialize_document(data["user"])
    data["admin_notice_delivery"] = delivery_status

    return success_response(
        message=("User restriction scheduled successfully. Email and user notification processed." if result.get("scheduled_status") else "User status updated successfully. Email and user notification processed."),
        data=data,
        status_code=result.get("status_code", 200),
    )



def _fmt_export_date(value):
    if not value:
        return ""
    if isinstance(value, datetime):
        try:
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
        except Exception:
            return str(value)
    return str(value)


def _safe_export_name(value, fallback="user"):
    text = re.sub(r"[^A-Za-z0-9_-]+", "-", str(value or fallback)).strip("-")
    return text[:80] or fallback


def _money_text(value):
    numeric = _number(value)
    return f"{numeric:,.8f}".rstrip("0").rstrip(".") if numeric else "0"


def _first_amount(doc, fields=None):
    fields = fields or ["amount", "locked_amount", "withdrawal_amount", "deposit_amount", "usdt_amount", "total", "notional_value", "notional"]
    for field in fields:
        amount = _number(doc.get(field))
        if amount:
            return amount
    return 0.0


def _load_user_export_data(db, user_id):
    user = find_user_by_id(user_id)
    if not user:
        return None

    user.pop("password_hash", None)
    wallet = _find_user_wallet(db, user_id) or {}
    kyc = db.kyc_requests.find_one({"user_id": {"$in": _user_base_match(user_id)}}) or {}
    recent_orders = _recent_user_docs(db, "orders", user_id, 100)
    recent_positions = _enrich_recent_positions(_recent_user_docs(db, "positions", user_id, 100))
    recent_ledger = _recent_user_docs(db, "wallet_ledger", user_id, 250)
    recent_deposits = _recent_user_docs(db, "deposits", user_id, 100)
    recent_withdrawals = _recent_user_docs(db, "withdrawals", user_id, 100)
    audit_logs = list(
        db.admin_audit_logs.find({"resource_type": "user", "resource_id": str(user_id)})
        .sort("created_at", -1)
        .limit(100)
    )
    open_orders = db.orders.count_documents({"user_id": {"$in": _user_base_match(user_id)}, "status": {"$in": ["open", "pending", "pending_trigger", "OPEN", "PENDING", "PENDING_TRIGGER"]}})
    open_positions = db.positions.count_documents({"user_id": {"$in": _user_base_match(user_id)}, "status": {"$in": ["open", "OPEN"]}})
    total_deposit = _sum_collection_amount(db, "deposits", user_id, ["approved", "completed", "confirmed", "APPROVED", "COMPLETED", "CONFIRMED"])
    total_withdrawal = _sum_collection_amount(db, "withdrawals", user_id, ["approved", "completed", "APPROVED", "COMPLETED"], ["amount", "locked_amount", "withdrawal_amount"])
    futures_pnl = _positions_pnl(db, user_id)

    main_w = wallet.get("main_wallet") or {} if wallet else {}
    trading_w = wallet.get("trading_wallet") or {} if wallet else {}
    main_total = _number(main_w.get("total_balance") or (main_w.get("available_balance", 0.0) + main_w.get("locked_balance", 0.0)))
    trading_total = _number(trading_w.get("total_balance") or (trading_w.get("available_balance", 0.0) + trading_w.get("locked_balance", 0.0)))
    if not trading_total and not trading_w and wallet:
        trading_total = _number(wallet.get("total_balance") or wallet.get("balance") or (wallet.get("available_balance", 0.0) + wallet.get("locked_balance", 0.0)))

    return {
        "user": user,
        "wallet": wallet,
        "kyc": kyc,
        "summary": {
            "wallet_total": round(main_total + trading_total, 8),
            "available_balance": _number(trading_w.get("available_balance") or (wallet.get("available_balance") if wallet else 0)),
            "locked_balance": _number(trading_w.get("locked_balance") or (wallet.get("locked_balance") if wallet else 0)),
            "main_balance": round(main_total, 8),
            "trading_balance": round(trading_total, 8),
            "open_orders": open_orders,
            "open_positions": open_positions,
            "total_deposit": total_deposit,
            "total_withdrawal": total_withdrawal,
            "futures_pnl": futures_pnl,
        },
        "recent_orders": recent_orders,
        "recent_positions": recent_positions,
        "recent_ledger": recent_ledger,
        "recent_deposits": recent_deposits,
        "recent_withdrawals": recent_withdrawals,
        "audit_logs": audit_logs,
    }


def _user_display_name(user):
    return user.get("name") or user.get("full_name") or user.get("username") or "Unknown User"


def _export_sections(payload):
    user = payload["user"]
    wallet = payload["wallet"] or {}
    summary = payload["summary"] or {}
    kyc = payload.get("kyc") or {}
    sections = []

    sections.append(("User Profile", [
        ["User ID", str(user.get("_id") or "")],
        ["Name", _user_display_name(user)],
        ["Email", user.get("email") or ""],
        ["Phone", user.get("mobile") or user.get("phone") or ""],
        ["Country", user.get("country") or ""],
        ["Account Status", user.get("account_status") or user.get("status") or "active"],
        ["KYC Status", user.get("kyc_status") or user.get("kyc") or "pending"],
        ["KYC Request Status", kyc.get("status") or ""],
        ["Joined", _fmt_export_date(user.get("created_at"))],
        ["Last Login", _fmt_export_date(user.get("last_login_at") or user.get("last_login"))],
        ["Status Reason", user.get("account_status_reason") or user.get("suspend_reason") or user.get("blocked_reason") or ""],
    ]))

    sections.append(("Wallet Summary", [
        ["Main Wallet Balance", _money_text(summary.get("main_balance"))],
        ["Trading Wallet Balance", _money_text(summary.get("trading_balance"))],
        ["Total Assets (Combined)", _money_text(summary.get("wallet_total"))],
        ["Total Deposit", _money_text(summary.get("total_deposit"))],
        ["Total Withdrawal", _money_text(summary.get("total_withdrawal"))],
        ["Futures P&L", _money_text(summary.get("futures_pnl"))],
        ["Open Orders", summary.get("open_orders") or 0],
        ["Open Positions", summary.get("open_positions") or 0],
        ["Wallet Updated", _fmt_export_date(wallet.get("updated_at"))],
    ]))

    order_rows = [[
        item.get("symbol") or "",
        _position_side_label(item),
        item.get("status") or "",
        _money_text(_first_amount(item)),
        _fmt_export_date(item.get("created_at")),
    ] for item in payload.get("recent_orders") or []]
    sections.append(("Recent Orders", [["Symbol", "Side", "Status", "Amount", "Date"], *order_rows]))

    position_rows = [[
        item.get("symbol") or "",
        item.get("display_side") or _position_side_label(item),
        _money_text(item.get("display_pnl") or item.get("unrealized_pnl") or item.get("realized_pnl") or item.get("pnl")),
        item.get("status") or "",
        _fmt_export_date(item.get("created_at")),
    ] for item in payload.get("recent_positions") or []]
    sections.append(("Recent Positions", [["Symbol", "Side", "P&L", "Status", "Date"], *position_rows]))

    finance_rows = []
    for item in payload.get("recent_deposits") or []:
        finance_rows.append(["Deposit", item.get("reference") or item.get("tx_hash") or str(item.get("_id") or ""), item.get("network") or item.get("crypto_network") or "", _money_text(_first_amount(item)), item.get("status") or "", _fmt_export_date(item.get("created_at"))])
    for item in payload.get("recent_withdrawals") or []:
        finance_rows.append(["Withdrawal", item.get("withdrawal_reference") or item.get("reference") or str(item.get("_id") or ""), item.get("network") or item.get("crypto_network") or "", _money_text(_first_amount(item, ["amount", "locked_amount", "withdrawal_amount"])), item.get("status") or "", _fmt_export_date(item.get("created_at"))])
    sections.append(("Deposits & Withdrawals", [["Type", "Reference", "Network", "Amount", "Status", "Date"], *finance_rows]))

    ledger_rows = [[
        item.get("type") or item.get("transaction_type") or item.get("action") or "ledger",
        item.get("direction") or "",
        _money_text(_first_amount(item)),
        item.get("status") or "completed",
        _fmt_export_date(item.get("created_at")),
        item.get("description") or item.get("message") or "",
    ] for item in payload.get("recent_ledger") or []]
    sections.append(("Wallet Ledger", [["Type", "Direction", "Amount", "Status", "Date", "Description"], *ledger_rows]))

    audit_rows = [[
        item.get("action") or "audit",
        item.get("admin_email") or "system",
        item.get("message") or "",
        _fmt_export_date(item.get("created_at")),
    ] for item in payload.get("audit_logs") or []]
    sections.append(("Admin Audit Timeline", [["Action", "Admin", "Message", "Date"], *audit_rows]))
    return sections


def _sections_to_csv(sections):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["TraidiumX User Detail Export"])
    writer.writerow(["Generated At", _fmt_export_date(now_utc())])
    writer.writerow([])
    for title, rows in sections:
        writer.writerow([title])
        for row in rows:
            writer.writerow(row)
        writer.writerow([])
    return output.getvalue()


def _col_letter(index):
    result = ""
    while index:
        index, rem = divmod(index - 1, 26)
        result = chr(65 + rem) + result
    return result


def _xlsx_cell(ref, value="", style=0):
    safe = xml_escape("" if value is None else str(value))
    style_attr = f' s="{style}"' if style else ""
    return f'<c r="{ref}"{style_attr} t="inlineStr"><is><t xml:space="preserve">{safe}</t></is></c>'


def _build_xlsx(sections):
    max_cols = max([len(row) for _title, rows in sections for row in (rows or [[]])] + [6])
    max_cols = min(max(max_cols, 6), 8)
    last_col = _col_letter(max_cols)
    rows_xml = []
    merges = []

    def row_xml(row_index, values, style=0, height=None, row_style_map=None):
        row_style_map = row_style_map or {}
        height_attr = f' ht="{height}" customHeight="1"' if height else ""
        cells = []
        for col_index in range(1, max_cols + 1):
            value = values[col_index - 1] if col_index <= len(values) else ""
            ref = f"{_col_letter(col_index)}{row_index}"
            cells.append(_xlsx_cell(ref, value, row_style_map.get(col_index, style)))
        rows_xml.append(f'<row r="{row_index}"{height_attr}>{"".join(cells)}</row>')

    row_no = 1
    row_xml(row_no, ["TraidiumX User Detail Report"], 1, 28)
    merges.append(f"A{row_no}:{last_col}{row_no}")
    row_no += 1
    row_xml(row_no, [f"Generated At: {_fmt_export_date(now_utc())}"], 2, 22)
    merges.append(f"A{row_no}:{last_col}{row_no}")
    row_no += 1
    row_xml(row_no, ["This workbook contains profile, wallet, trading, finance and admin audit activity for the selected user."], 7, 24)
    merges.append(f"A{row_no}:{last_col}{row_no}")
    row_no += 1
    row_xml(row_no, [""], 0, 8)
    row_no += 1

    for title, section_rows in sections:
        section_rows = section_rows or []
        row_xml(row_no, [str(title).upper()], 3, 24)
        merges.append(f"A{row_no}:{last_col}{row_no}")
        row_no += 1
        for idx, row in enumerate(section_rows):
            if idx == 0:
                row_xml(row_no, row, 4, 22)
            else:
                row_xml(row_no, row, 5, 21, {1: 6})
            row_no += 1
        row_xml(row_no, [""], 0, 8)
        row_no += 1

    merge_xml = ""
    if merges:
        merge_xml = f'<mergeCells count="{len(merges)}">' + "".join(f'<mergeCell ref="{ref}"/>' for ref in merges) + '</mergeCells>'

    widths = [24, 24, 24, 20, 22, 24, 26, 28]
    cols_xml = "".join(f'<col min="{idx}" max="{idx}" width="{widths[idx-1]}" customWidth="1"/>' for idx in range(1, max_cols + 1))
    styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="10"/><color rgb="FF0F172A"/><name val="Inter"/><family val="2"/></font>
<font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Inter"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Inter"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF0891B2"/><name val="Inter"/><family val="2"/></font>
</fonts>
<fills count="7">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE0F2FE"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0891B2"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD6E4F0"/></left><right style="thin"><color rgb="FFD6E4F0"/></right><top style="thin"><color rgb="FFD6E4F0"/></top><bottom style="thin"><color rgb="FFD6E4F0"/></bottom><diagonal/></border>
<border><bottom style="medium"><color rgb="FF0891B2"/></bottom></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="2" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>"""
    sheet_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>{cols_xml}</cols>
<sheetData>{''.join(rows_xml)}</sheetData>
{merge_xml}
<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
</worksheet>"""
    workbook_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="User Detail Report" sheetId="1" r:id="rId1"/></sheets></workbook>"""
    rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"""
    workbook_rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>"""
    content_types_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>"""
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", rels_xml)
        zf.writestr("xl/workbook.xml", workbook_xml)
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        zf.writestr("xl/styles.xml", styles_xml)
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return data.getvalue()

def _pdf_escape(text):
    value = str(text or "").encode("latin-1", errors="replace").decode("latin-1")
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _wrap_pdf_line(text, width=92):
    text = str(text or "")
    words = text.split()
    if not words:
        return [""]
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > width and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def _truncate_pdf_text(value, max_chars):
    value = str(value or "")
    if len(value) <= max_chars:
        return value
    return value[:max(0, max_chars - 3)] + "..."


def _build_pdf(sections):
    page_w, page_h = 612, 792
    margin = 36
    content_w = page_w - (margin * 2)
    pages = []
    ops = []
    y = 0

    def color_cmd(color, stroke=False):
        r, g, b = color
        suffix = "RG" if stroke else "rg"
        return f"{r:.3f} {g:.3f} {b:.3f} {suffix}"

    def rect(x, y_pos, w, h, fill=None, stroke=None):
        if fill:
            ops.append(f"{color_cmd(fill)} {x:.2f} {y_pos:.2f} {w:.2f} {h:.2f} re f")
        if stroke:
            ops.append(f"{color_cmd(stroke, True)} {x:.2f} {y_pos:.2f} {w:.2f} {h:.2f} re S")

    def text_at(x, y_pos, value, size=9, bold=False, color=(0.09, 0.14, 0.22)):
        font = "F2" if bold else "F1"
        ops.append(f"BT /{font} {size:.2f} Tf {color_cmd(color)} {x:.2f} {y_pos:.2f} Td ({_pdf_escape(value)}) Tj ET")

    def finish_page():
        if not ops:
            return
        page_no = len(pages) + 1
        text_at(margin, 24, "TraidiumX Admin • User Detail Export", 8, False, (0.38, 0.45, 0.55))
        text_at(page_w - margin - 46, 24, f"Page {page_no}", 8, False, (0.38, 0.45, 0.55))
        pages.append("\n".join(ops))

    def start_page():
        nonlocal ops, y
        ops = []
        rect(0, page_h - 82, page_w, 82, fill=(0.05, 0.09, 0.16))
        rect(margin, page_h - 82, content_w, 3, fill=(0.09, 0.78, 0.91))
        text_at(margin, page_h - 40, "TRAIDIUMX USER DETAIL REPORT", 18, True, (1, 1, 1))
        text_at(margin, page_h - 60, f"Generated At: {_fmt_export_date(now_utc())}", 9, False, (0.74, 0.84, 0.95))
        y = page_h - 112

    def ensure_space(height):
        nonlocal y
        if y - height < 52:
            finish_page()
            start_page()

    def col_widths(count):
        count = max(1, min(count, 8))
        if count == 2:
            return [150, content_w - 150]
        if count == 4:
            return [130, 120, 180, content_w - 430]
        if count == 5:
            return [112, 92, 112, 112, content_w - 428]
        if count == 6:
            return [90, 108, 82, 90, 82, content_w - 452]
        return [content_w / count] * count

    start_page()
    for title, rows in sections:
        rows = rows or []
        ensure_space(58)
        rect(margin, y - 26, content_w, 26, fill=(0.93, 0.98, 1.0), stroke=(0.72, 0.86, 0.93))
        text_at(margin + 12, y - 17, str(title).upper(), 10, True, (0.03, 0.44, 0.55))
        y -= 32

        if not rows:
            ensure_space(24)
            text_at(margin + 10, y - 14, "No records found.", 9, False, (0.38, 0.45, 0.55))
            y -= 28
            continue

        col_count = max(len(row) for row in rows)
        widths = col_widths(col_count)
        x_positions = [margin]
        for width in widths[:-1]:
            x_positions.append(x_positions[-1] + width)

        header = rows[0]
        ensure_space(24)
        rect(margin, y - 22, content_w, 22, fill=(0.06, 0.10, 0.18), stroke=(0.13, 0.22, 0.34))
        for idx in range(col_count):
            value = header[idx] if idx < len(header) else ""
            text_at(x_positions[idx] + 5, y - 14, _truncate_pdf_text(value, max(8, int(widths[idx] / 5.3))), 7.5, True, (0.86, 0.93, 1.0))
        y -= 22

        data_rows = rows[1:] if len(rows) > 1 else []
        if not data_rows:
            ensure_space(24)
            rect(margin, y - 22, content_w, 22, fill=(0.98, 0.99, 1.0), stroke=(0.83, 0.88, 0.94))
            text_at(margin + 8, y - 14, "No records found.", 8.5, False, (0.38, 0.45, 0.55))
            y -= 22
        for row_index, row in enumerate(data_rows):
            cell_lines = []
            row_h = 22
            for idx in range(col_count):
                value = row[idx] if idx < len(row) else ""
                max_chars = max(8, int(widths[idx] / 4.7))
                lines = _wrap_pdf_line(value, max_chars)[:2]
                if len(lines) == 2 and len(" ".join(_wrap_pdf_line(value, max_chars))) > len(" ".join(lines)):
                    lines[-1] = _truncate_pdf_text(lines[-1], max_chars)
                cell_lines.append(lines)
                row_h = max(row_h, 14 + (len(lines) * 9))
            ensure_space(row_h)
            fill = (1, 1, 1) if row_index % 2 == 0 else (0.98, 0.99, 1.0)
            rect(margin, y - row_h, content_w, row_h, fill=fill, stroke=(0.86, 0.90, 0.95))
            for idx, lines in enumerate(cell_lines):
                for line_no, line in enumerate(lines):
                    text_at(x_positions[idx] + 5, y - 12 - (line_no * 9), _truncate_pdf_text(line, max(8, int(widths[idx] / 4.7))), 7.6, idx == 0, (0.10, 0.15, 0.24))
            y -= row_h
        y -= 12

    finish_page()

    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "",  # pages placeholder
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ]
    page_obj_ids = []
    for stream in pages:
        content_obj_id = len(objects) + 1
        encoded = stream.encode("latin-1", errors="replace")
        objects.append(f"<< /Length {len(encoded)} >>\nstream\n{stream}\nendstream")
        page_obj_id = len(objects) + 1
        page_obj_ids.append(page_obj_id)
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_w} {page_h}] "
            f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {content_obj_id} 0 R >>"
        )
    objects[1] = "<< /Type /Pages /Kids [" + " ".join(f"{pid} 0 R" for pid in page_obj_ids) + f"] /Count {len(page_obj_ids)} >>"

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = [0]
    for idx, obj in enumerate(objects, 1):
        offsets.append(out.tell())
        out.write(f"{idx} 0 obj\n".encode("latin-1"))
        out.write(str(obj).encode("latin-1", errors="replace"))
        out.write(b"\nendobj\n")
    xref_pos = out.tell()
    out.write(f"xref\n0 {len(objects)+1}\n".encode("latin-1"))
    out.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        out.write(f"{offset:010d} 00000 n \n".encode("latin-1"))
    out.write(f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF".encode("latin-1"))
    return out.getvalue()



_USERS_SUMMARY_CACHE = {"data": None, "timestamp": 0}

@admin_user_api.get("/summary")
@admin_required
@permission_required("users.view")
def users_summary():
    import time
    now_ts = time.time()
    if _USERS_SUMMARY_CACHE["data"] and (now_ts - _USERS_SUMMARY_CACHE["timestamp"]) < 10:
        return success_response(
            message="Users summary fetched successfully.",
            data=_USERS_SUMMARY_CACHE["data"]
        )

    db = get_database()
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    total = db.users.count_documents({})
    active = db.users.count_documents({"account_status": {"$in": ACTIVE_STATUSES}})
    blocked = db.users.count_documents({"account_status": {"$in": BLOCKED_STATUSES}})
    suspended = db.users.count_documents({"account_status": {"$in": SUSPENDED_STATUSES}})
    restricted = db.users.count_documents({"account_status": {"$in": RESTRICTED_STATUSES}})
    new_today = db.users.count_documents({"created_at": {"$gte": today}})
    pending_kyc = db.users.count_documents({"kyc_status": {"$in": ["pending", "PENDING", "review", "REVIEW", "under_review", "UNDER_REVIEW"]}})

    wallet_pipeline = list(db.wallets.aggregate([
        {
            "$group": {
                "_id": None,
                "trading_avail": {"$sum": {"$ifNull": ["$trading_wallet.available_balance", "$available_balance"]}},
                "trading_lock": {"$sum": {"$ifNull": ["$trading_wallet.locked_balance", "$locked_balance"]}},
                "main_total": {"$sum": {"$ifNull": ["$main_wallet.total_balance", 0]}},
                "trading_total": {"$sum": {"$ifNull": ["$trading_wallet.total_balance", "$total_balance"]}}
            }
        }
    ]))
    wallet = wallet_pipeline[0] if wallet_pipeline else {
        "trading_avail": 0.0,
        "trading_lock": 0.0,
        "main_total": 0.0,
        "trading_total": 0.0
    }
    trading_avail = _number(wallet.get("trading_avail"))
    trading_lock = _number(wallet.get("trading_lock"))
    main_total = _number(wallet.get("main_total"))
    trading_total = _number(wallet.get("trading_total"))

    summary_data = {
        "total": total,
        "active": active,
        "blocked": blocked,
        "suspended": suspended,
        "restricted": restricted,
        "new_today": new_today,
        "pending_kyc": pending_kyc,
        "wallet": {
            "available_balance": round(trading_avail, 8),
            "locked_balance": round(trading_lock, 8),
            "total_balance": round(main_total + trading_total, 8),
        },
    }

    _USERS_SUMMARY_CACHE["data"] = summary_data
    _USERS_SUMMARY_CACHE["timestamp"] = now_ts

    return success_response(
        message="Users summary fetched successfully.",
        data=summary_data,
    )


@admin_user_api.get("")
@admin_required
@permission_required("users.view")
def list_users():
    db = get_database()
    page = parse_int(request.args.get("page"), default=1, minimum=1, maximum=100000)
    limit = parse_int(request.args.get("limit"), default=25, minimum=1, maximum=100)
    min_balance = request.args.get("min_balance")
    max_balance = request.args.get("max_balance")

    query = _build_user_query()

    total = db.users.count_documents(query)
    users = list(
        db.users.find(query, {"password_hash": 0})
        .sort("created_at", -1)
        .skip((page - 1) * limit)
        .limit(limit)
    )
    enriched = _enrich_users(db, users)

    if min_balance not in [None, ""] or max_balance not in [None, ""]:
        min_value = _number(min_balance, None)
        max_value = _number(max_balance, None)
        filtered = []
        for user in enriched:
            balance = _number(user.get("total_balance"))
            if min_value is not None and balance < min_value:
                continue
            if max_value is not None and balance > max_value:
                continue
            filtered.append(user)
        enriched = filtered

    return success_response(
        message="Users fetched successfully.",
        data={
            "users": serialize_documents(enriched),
            "pagination": build_pagination(page, limit, total),
        },
    )


@admin_user_api.get("/export")
@admin_required
@permission_required("users.view")
def export_users():
    db = get_database()
    query = _build_user_query()
    users = list(db.users.find(query, {"password_hash": 0}).sort("created_at", -1).limit(5000))
    users = _enrich_users(db, users)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["User ID", "Name", "Email", "Phone", "Country", "KYC", "Status", "Main Wallet", "Trading Wallet", "Total Wallet", "Joined"])

    for user in users:
        writer.writerow([
            str(user.get("_id")),
            user.get("name") or user.get("full_name") or user.get("username") or "",
            user.get("email") or "",
            user.get("mobile") or user.get("phone") or "",
            user.get("country") or "",
            user.get("kyc_status") or "pending",
            user.get("account_status") or "active",
            _number(user.get("main_balance")),
            _number(user.get("trading_balance")),
            _number(user.get("total_balance")),
            user.get("created_at") or "",
        ])

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="users.exported",
        resource_type="user",
        resource_id="bulk",
        message="Admin exported users CSV.",
        metadata={"records": len(users)},
    )

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=traidiumx-users.csv"},
    )


@admin_user_api.get("/<user_id>/export")
@admin_required
@permission_required("users.view")
def export_user_detail(user_id):
    db = get_database()
    payload = _load_user_export_data(db, user_id)
    if not payload:
        return error_response(message="User not found.", errors={"user_id": "Invalid user ID."}, status_code=404)

    export_format = str(request.args.get("format") or request.args.get("type") or "csv").strip().lower()
    if export_format in ["excel", "xls"]:
        export_format = "xlsx"
    if export_format not in ["csv", "xlsx", "pdf"]:
        return error_response(message="Invalid export format.", errors={"format": "Use csv, xlsx or pdf."}, status_code=422)

    sections = _export_sections(payload)
    user = payload["user"]
    base_name = f"traidiumx-user-{_safe_export_name(_user_display_name(user))}-{_safe_export_name(user.get('_id'))}"

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action=f"user.detail.exported.{export_format}",
        resource_type="user",
        resource_id=str(user_id),
        message=f"Admin exported user detail as {export_format.upper()}.",
        metadata={"format": export_format, "user_email": user.get("email") or ""},
    )

    if export_format == "csv":
        data = _sections_to_csv(sections)
        return Response(
            data,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename={base_name}.csv"},
        )

    if export_format == "xlsx":
        data = _build_xlsx(sections)
        return Response(
            data,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={base_name}.xlsx"},
        )

    data = _build_pdf(sections)
    return Response(
        data,
        mimetype="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={base_name}.pdf"},
    )


@admin_user_api.get("/<user_id>")
@admin_required
@permission_required("users.view")
def user_detail(user_id):
    db = get_database()
    user = find_user_by_id(user_id)

    if not user:
        return error_response(message="User not found.", errors={"user_id": "Invalid user ID."}, status_code=404)

    user.pop("password_hash", None)

    if user.get("parent_user_id"):
        parent_user = find_user_by_id(user["parent_user_id"])
        if parent_user:
            user["email"] = parent_user.get("email", user.get("email"))
            user["mobile"] = parent_user.get("mobile", user.get("mobile"))
            user["kyc_status"] = parent_user.get("kyc_status", user.get("kyc_status"))

    wallet = _find_user_wallet(db, user_id)
    kyc = db.kyc_requests.find_one({"user_id": {"$in": _user_base_match(user_id)}})
    mt5_account = db.mt5_accounts.find_one({"user_id": str(user_id)})
    recent_orders = _recent_user_docs(db, "orders", user_id, 10)
    recent_positions = _recent_user_docs(db, "positions", user_id, 10)
    recent_ledger = _recent_user_docs(db, "wallet_ledger", user_id, 10)
    recent_deposits = _recent_user_docs(db, "deposits", user_id, 10)
    recent_withdrawals = _recent_user_docs(db, "withdrawals", user_id, 10)
    audit_logs = list(
        db.admin_audit_logs.find({"resource_type": "user", "resource_id": str(user_id)})
        .sort("created_at", -1)
        .limit(10)
    )

    # Fetch sub-accounts
    sub_accounts = list(db.users.find({"parent_user_id": str(user_id)}))
    serialized_subs = []
    for sub in sub_accounts:
        sub_wallet = _find_user_wallet(db, sub["_id"])
        trading_w = sub_wallet.get("trading_wallet") if sub_wallet else None
        if not isinstance(trading_w, dict):
            trading_w = {}
        serialized_subs.append({
            "id": str(sub["_id"]),
            "name": sub.get("name"),
            "client_id": sub.get("client_id"),
            "created_at": sub.get("created_at").isoformat() if sub.get("created_at") and hasattr(sub.get("created_at"), "isoformat") else (str(sub.get("created_at")) if sub.get("created_at") else None),
            "wallet": {
                "available_balance": _number(trading_w.get("available_balance") or 0.0),
                "locked_balance": _number(trading_w.get("locked_balance") or 0.0),
                "total_balance": _number(trading_w.get("total_balance") or 0.0),
            }
        })

    # Fetch parent info if it's a sub-account
    parent_user = None
    if user.get("parent_user_id"):
        parent_user = find_user_by_id(user["parent_user_id"])
        if parent_user:
            parent_user.pop("password_hash", None)

    open_orders = db.orders.count_documents({"user_id": {"$in": _user_base_match(user_id)}, "status": {"$in": ["open", "pending", "pending_trigger", "OPEN", "PENDING", "PENDING_TRIGGER"]}})
    open_positions = db.positions.count_documents({"user_id": {"$in": _user_base_match(user_id)}, "status": {"$in": ["open", "OPEN"]}})
    total_deposit = _sum_collection_amount(db, "deposits", user_id, ["approved", "completed", "confirmed", "APPROVED", "COMPLETED", "CONFIRMED"])
    total_withdrawal = _sum_collection_amount(db, "withdrawals", user_id, ["approved", "completed", "APPROVED", "COMPLETED"], ["amount", "locked_amount", "withdrawal_amount"])
    futures_pnl = _positions_pnl(db, user_id)

    main_w = wallet.get("main_wallet") or {} if wallet else {}
    trading_w = wallet.get("trading_wallet") or {} if wallet else {}
    main_total = _number(main_w.get("total_balance") or (main_w.get("available_balance", 0.0) + main_w.get("locked_balance", 0.0)))
    trading_total = _number(trading_w.get("total_balance") or (trading_w.get("available_balance", 0.0) + trading_w.get("locked_balance", 0.0)))
    if not trading_total and not trading_w and wallet:
        trading_total = _number(wallet.get("total_balance") or wallet.get("balance") or (wallet.get("available_balance", 0.0) + wallet.get("locked_balance", 0.0)))

    return success_response(
        message="User detail fetched successfully.",
        data={
            "user": serialize_document(user),
            "parent_user": serialize_document(parent_user) if parent_user else None,
            "sub_accounts": serialized_subs,
            "wallet": serialize_document(wallet),
            "kyc": serialize_document(kyc),
            "mt5_account": serialize_document(mt5_account),
            "summary": {
                "wallet_total": round(main_total + trading_total, 8),
                "available_balance": _number(trading_w.get("available_balance") or (wallet.get("available_balance") if wallet else 0)),
                "locked_balance": _number(trading_w.get("locked_balance") or (wallet.get("locked_balance") if wallet else 0)),
                "open_orders": open_orders,
                "open_positions": open_positions,
                "total_deposit": total_deposit,
                "total_withdrawal": total_withdrawal,
                "futures_pnl": futures_pnl,
            },
            "recent_orders": serialize_documents(recent_orders),
            "recent_positions": serialize_documents(_enrich_recent_positions(recent_positions)),
            "recent_ledger": serialize_documents(recent_ledger),
            "recent_deposits": serialize_documents(recent_deposits),
            "recent_withdrawals": serialize_documents(recent_withdrawals),
            "audit_logs": serialize_documents(audit_logs),
        },
    )


@admin_user_api.patch("/<user_id>/status")
@admin_required
@permission_required("users.update_status")
def update_user_status(user_id):
    data = request.get_json(silent=True) or {}
    status = str(data.get("status") or "").strip().lower()
    reason = str(data.get("reason") or "").strip()
    return _set_user_status(
        user_id,
        status,
        reason,
        grace_seconds=_parse_grace_seconds(data),
        suspend_hours=_parse_suspend_hours(data),
    )


@admin_user_api.post("/<user_id>/suspend")
@admin_required
@permission_required("users.update_status")
def suspend_user(user_id):
    data = request.get_json(silent=True) or {}
    return _set_user_status(
        user_id,
        "suspended",
        str(data.get("reason") or "Suspended by admin.").strip(),
        grace_seconds=_parse_grace_seconds(data),
        suspend_hours=_parse_suspend_hours(data),
    )


@admin_user_api.post("/<user_id>/block")
@admin_required
@permission_required("users.update_status")
def block_user(user_id):
    data = request.get_json(silent=True) or {}
    return _set_user_status(
        user_id,
        "blocked",
        str(data.get("reason") or "Blocked by admin.").strip(),
        grace_seconds=_parse_grace_seconds(data),
        suspend_hours=_parse_suspend_hours(data),
    )


@admin_user_api.post("/<user_id>/activate")
@admin_required
@permission_required("users.update_status")
def activate_user(user_id):
    data = request.get_json(silent=True) or {}
    return _set_user_status(user_id, "active", str(data.get("reason") or "Activated by admin.").strip())


@admin_user_api.post("/<user_id>/force-logout")
@admin_required
@permission_required("users.update_status")
def force_logout_user(user_id):
    db = get_database()
    oid = _as_object_id(user_id)
    if not oid:
        return error_response(message="Invalid user ID.", errors={"user_id": "Invalid ObjectId."}, status_code=422)

    user = db.users.find_one({"_id": oid}, {"password_hash": 0})
    if not user:
        return error_response(message="User not found.", errors={"user_id": "Invalid user ID."}, status_code=404)

    now = now_utc()
    db.users.update_one(
        {"_id": oid},
        {
            "$inc": {"session_version": 1},
            "$set": {
                "force_logout_at": now,
                "force_logout_by": str(g.current_admin_id or ""),
                "updated_at": now,
            },
        },
    )

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="user.force_logout",
        resource_type="user",
        resource_id=user_id,
        message="Admin forced user logout by incrementing session_version.",
        metadata={"security_action": True},
    )

    return success_response(message="Force logout applied successfully.", data={"user_id": user_id})


@admin_user_api.post("/<user_id>/reset-2fa")
@admin_required
@permission_required("users.update_status")
def reset_user_2fa(user_id):
    db = get_database()
    oid = _as_object_id(user_id)
    if not oid:
        return error_response(message="Invalid user ID.", errors={"user_id": "Invalid ObjectId."}, status_code=422)

    user = db.users.find_one({"_id": oid}, {"password_hash": 0})
    if not user:
        return error_response(message="User not found.", errors={"user_id": "Invalid user ID."}, status_code=404)

    now = now_utc()
    db.users.update_one(
        {"_id": oid},
        {
            "$set": {
                "two_factor_enabled": False,
                "two_factor_reset_at": now,
                "two_factor_reset_by": str(g.current_admin_id or ""),
                "updated_at": now,
            },
            "$unset": {"two_factor_secret": "", "two_factor_backup_codes": ""},
        },
    )

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="user.2fa.reset",
        resource_type="user",
        resource_id=user_id,
        message="Admin reset user 2FA.",
        metadata={"security_action": True},
    )

    return success_response(message="User 2FA reset successfully.", data={"user_id": user_id})


@admin_user_api.post("/<user_id>/mt5-credentials")
@admin_required
@permission_required("users.update_status")
def assign_mt5_credentials(user_id):
    db = get_database()
    oid = _as_object_id(user_id)
    if not oid:
        return error_response(message="Invalid user ID.", errors={"user_id": "Invalid ObjectId."}, status_code=422)

    user = db.users.find_one({"_id": oid})
    if not user:
        return error_response(message="User not found.", errors={"user_id": "Invalid user ID."}, status_code=404)

    data = request.get_json(silent=True) or {}
    login_id = str(data.get("login_id") or "").strip()
    password = str(data.get("password") or "").strip()
    server = str(data.get("server") or "").strip()

    if not login_id or not password or not server:
        return error_response(message="Login ID, Password, and Server Name are required.", errors={"fields": "Missing fields."}, status_code=422)

    # Save credentials in mt5_accounts collection
    from services.trading_onboarding_service import _encrypt_secret
    from models.mt5_account_model import upsert_mt5_account

    upsert_mt5_account(user_id, {
        "status": "credentials_sent",
        "connection_status": "pending",
        "login_id": login_id,
        "server": server,
        "password_encrypted": _encrypt_secret(password),
        "provisioning_note": "Credentials sent to registered email.",
        "mode": "existing_account",
        "broker_name": "MT5 Broker"
    })

    # Send email
    from services.email_service import send_mt5_credentials_assigned_email
    user_name = user.get("name") or user.get("full_name") or "Trader"
    email_result = send_mt5_credentials_assigned_email(
        to_email=user.get("email"),
        user_name=user_name,
        login_id=login_id,
        password=password,
        server=server
    )

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="user.mt5.credentials_assigned",
        resource_type="user",
        resource_id=user_id,
        message="Admin assigned MT5 credentials and sent email to user.",
        metadata={"login_id": login_id, "server": server, "email_sent": email_result.get("sent", False)},
    )

    if not email_result.get("sent"):
        return success_response(
            message=f"Credentials saved, but email sending failed: {email_result.get('reason')}",
            data={"email_sent": False}
        )

    return success_response(
        message="MT5 credentials assigned and email sent successfully.",
        data={"email_sent": True}
    )


@admin_user_api.get("/reminders-list")
@admin_required
@permission_required("users.view")
def list_reminders():
    db = get_database()
    
    all_users = list(db.users.find({}, {"password_hash": 0}).sort("created_at", -1))
    enriched_users = _enrich_users(db, all_users)
    
    reminders = []
    for u in enriched_users:
        kyc_status = str(u.get("kyc_status") or u.get("kyc") or "pending").lower()
        total_balance = float(u.get("total_balance", 0.0) or 0.0)
        
        if kyc_status != "approved":
            category = "kyc_pending"
            reason = "KYC Incomplete"
        elif total_balance <= 0:
            dep_count = db.deposits.count_documents({"user_id": str(u["_id"]), "status": "approved"})
            if dep_count == 0:
                category = "deposit_pending"
                reason = "KYC Approved, No Deposit"
            else:
                continue
        else:
            continue
            
        reminders.append({
            "id": str(u["_id"]),
            "name": u.get("name") or u.get("full_name") or u.get("username") or "Unknown User",
            "email": u.get("email") or "",
            "mobile": u.get("mobile") or u.get("phone") or "",
            "kyc_status": kyc_status,
            "total_balance": total_balance,
            "created_at": serialize_value(u.get("created_at")),
            "category": category,
            "reason": reason
        })
        
    return success_response(
        message="Follow-up users fetched successfully.",
        data={"reminders": reminders}
    )

@admin_user_api.post("/<user_id>/send-reminder")
@admin_required
@permission_required("users.update_status")
def send_user_reminder(user_id):
    db = get_database()
    user = db.users.find_one({"_id": _as_object_id(user_id)})
    if not user:
        return error_response(message="User not found.", status_code=404)
        
    data = request.get_json(silent=True) or {}
    reminder_type = str(data.get("type") or "").strip().lower()
    
    if reminder_type not in ["kyc_reminder", "deposit_reminder", "custom_email"]:
        return error_response(message="Invalid reminder type. Use kyc_reminder, deposit_reminder, or custom_email.", status_code=422)
        
    to_email = user.get("email")
    user_name = user.get("name") or user.get("full_name") or user.get("username") or "Trader"
    
    from services.email_service import send_kyc_required_email, send_first_deposit_email, send_admin_broadcast_email
    from services.notification_service import create_user_notification
    
    email_sent = False
    error_msg = ""
    
    if reminder_type == "kyc_reminder":
        res = send_kyc_required_email(to_email, user_name)
        email_sent = res.get("sent", False)
        error_msg = res.get("reason", "")
        create_user_notification(
            user=user,
            title="Reminder: Complete your KYC",
            message="Please complete your KYC identity verification to enable withdrawals and unlock full account features.",
            notice_type="kyc_reminder",
            severity="warning",
            admin_id=g.current_admin_id,
            admin_email=g.current_admin_email
        )
        log_message = "Sent KYC reminder email and notification."
        
    elif reminder_type == "deposit_reminder":
        res = send_first_deposit_email(to_email, user_name)
        email_sent = res.get("sent", False)
        error_msg = res.get("reason", "")
        create_user_notification(
            user=user,
            title="Make Your First Deposit",
            message="Your KYC is verified. Fund your wallet to start trading on MetaTrader 5 options and futures.",
            notice_type="deposit_reminder",
            severity="info",
            admin_id=g.current_admin_id,
            admin_email=g.current_admin_email
        )
        log_message = "Sent deposit reminder email and notification."
        
    else:  # custom_email
        subject = str(data.get("subject") or "").strip()
        message_text = str(data.get("message") or "").strip()
        
        if not subject or not message_text:
            return error_response(message="Subject and message are required for custom emails.", status_code=422)
            
        res = send_admin_broadcast_email(
            to_email=to_email,
            user_name=user_name,
            title=subject,
            message_text=message_text,
            severity="info"
        )
        email_sent = res.get("sent", False)
        error_msg = res.get("reason", "")
        
        create_user_notification(
            user=user,
            title=subject,
            message=message_text,
            notice_type="admin_custom_email",
            severity="info",
            admin_id=g.current_admin_id,
            admin_email=g.current_admin_email
        )
        log_message = f"Sent custom email: '{subject}'."

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="user.reminder_sent",
        resource_type="user",
        resource_id=user_id,
        message=log_message,
        metadata={"type": reminder_type, "email_sent": email_sent, "error": error_msg},
    )
    
    if not email_sent:
        return success_response(
            message=f"Reminder recorded and notification sent, but email failed: {error_msg}",
            data={"email_sent": False}
        )
        
    return success_response(
        message="Reminder email and notification sent successfully.",
        data={"email_sent": True}
    )


@admin_user_api.get("/deleted-accounts")
@admin_required
@permission_required("users.view")
def list_deleted_accounts():
    db = get_database()
    
    try:
        page = max(1, int(request.args.get("page") or 1))
    except (TypeError, ValueError):
        page = 1

    try:
        limit = min(100, max(1, int(request.args.get("limit") or 20)))
    except (TypeError, ValueError):
        limit = 20

    skip = (page - 1) * limit
    
    search = str(request.args.get("search") or "").strip()
    account_type = str(request.args.get("type") or "").strip().lower()
    
    query = {}
    if account_type in ["main", "sub"]:
        query["account_type"] = account_type
        
    if search:
        import re
        regex = re.compile(re.escape(search), re.IGNORECASE)
        query["$or"] = [
            {"name": regex},
            {"client_id": regex},
            {"email": regex},
            {"parent_name": regex},
            {"parent_client_id": regex},
            {"account_id": regex}
        ]
        
    total_count = db.deleted_account_logs.count_documents(query)
    cursor = db.deleted_account_logs.find(query).sort("deleted_at", -1).skip(skip).limit(limit)
    
    records = []
    for doc in cursor:
        records.append({
            "id": str(doc["_id"]),
            "account_type": doc.get("account_type", "sub"),
            "account_id": str(doc.get("account_id") or ""),
            "client_id": str(doc.get("client_id") or "N/A"),
            "name": doc.get("name") or "Account",
            "email": doc.get("email") or "",
            "mobile": doc.get("mobile") or "",
            "parent_user_id": str(doc.get("parent_user_id") or ""),
            "parent_name": doc.get("parent_name") or "",
            "parent_client_id": str(doc.get("parent_client_id") or ""),
            "deleted_by": doc.get("deleted_by", "user"),
            "deleted_by_name": doc.get("deleted_by_name", "User (Self)"),
            "refund_summary": doc.get("refund_summary") or "Zero Balance",
            "sub_accounts_count": doc.get("sub_accounts_count", 0),
            "deleted_at": doc.get("deleted_at").isoformat() if doc.get("deleted_at") else None
        })
        
    from datetime import datetime, timezone
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_naive = today_start.replace(tzinfo=None)
    
    stats = {
        "total_deleted": db.deleted_account_logs.count_documents({}),
        "main_deleted": db.deleted_account_logs.count_documents({"account_type": "main"}),
        "sub_deleted": db.deleted_account_logs.count_documents({"account_type": "sub"}),
        "today_deleted": db.deleted_account_logs.count_documents({
            "$or": [
                {"deleted_at": {"$gte": today_start}},
                {"deleted_at": {"$gte": today_start_naive}}
            ]
        })
    }
    
    return success_response(
        message="Deleted accounts retrieved successfully.",
        data={
            "records": records,
            "total": total_count,
            "page": page,
            "limit": limit,
            "pages": max(1, (total_count + limit - 1) // limit),
            "stats": stats
        }
    )


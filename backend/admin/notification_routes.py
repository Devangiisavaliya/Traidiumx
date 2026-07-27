from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, g, request

from config.database import get_database
from services.email_service import send_admin_broadcast_email
from services.notification_service import create_bulk_user_notifications
from utils.response import error_response, success_response
from .audit_service import create_admin_audit_log
from .middleware import admin_required
from .permissions import permission_required
from .utils import build_pagination, parse_int, serialize_documents


admin_notification_api = Blueprint("admin_notification_api", __name__, url_prefix="/notifications")

BROADCAST_COLLECTION = "admin_notification_broadcasts"
VALID_CHANNELS = {"notification", "email", "both"}
VALID_SEVERITIES = {"info", "success", "warning", "alert", "danger", "error"}
EMAIL_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="tx_notification_mail")


def _now():
    return datetime.now(timezone.utc)


def _clean_text(value, limit):
    text = str(value or "").strip()
    return text[:limit].strip()


def _normalize_severity(value):
    severity = str(value or "info").strip().lower()
    if severity in {"danger", "error", "red"}:
        return "alert"
    if severity in {"warn", "yellow"}:
        return "warning"
    if severity in {"green", "done"}:
        return "success"
    if severity in {"blue", "information"}:
        return "info"
    if severity not in {"info", "success", "warning", "alert"}:
        return "info"
    return severity


def _users_query(target):
    target = str(target or "all").strip().lower()
    if target == "active":
        return {"$or": [{"account_status": {"$in": ["active", "ACTIVE"]}}, {"account_status": {"$exists": False}}, {"account_status": None}]}
    return {}


def _users_projection():
    return {"_id": 1, "email": 1, "name": 1, "full_name": 1, "username": 1, "account_status": 1}


def _user_name(user):
    return user.get("name") or user.get("full_name") or user.get("username") or ""


def _broadcast_collection():
    db = get_database()
    collection = db[BROADCAST_COLLECTION]
    try:
        collection.create_index([("created_at", -1)])
        collection.create_index([("created_by_admin_id", 1), ("created_at", -1)])
        collection.create_index([("email_status", 1), ("created_at", -1)])
    except Exception:
        pass
    return collection


def _email_recipients(users):
    recipients = []
    for user in users:
        email = str(user.get("email") or "").strip()
        if not email:
            continue
        recipients.append({
            "email": email,
            "name": _user_name(user),
        })
    return recipients


def _send_broadcast_emails_async(broadcast_id, recipients, title, message, severity):
    """Send emails in the background so the admin page does not wait for SMTP."""

    sent = 0
    failed = 0
    last_reason = ""

    try:
        collection = _broadcast_collection()
        collection.update_one(
            {"_id": ObjectId(str(broadcast_id))},
            {"$set": {"email_status": "sending", "email_started_at": _now()}},
        )

        for recipient in recipients:
            result = send_admin_broadcast_email(
                to_email=recipient.get("email", ""),
                user_name=recipient.get("name", ""),
                title=title,
                message_text=message,
                severity=severity,
            )
            if result.get("sent"):
                sent += 1
            else:
                failed += 1
                last_reason = result.get("reason") or last_reason

        collection.update_one(
            {"_id": ObjectId(str(broadcast_id))},
            {
                "$set": {
                    "email_sent_count": sent,
                    "email_failed_count": failed,
                    "last_email_reason": last_reason,
                    "email_status": "completed" if failed == 0 else "completed_with_failures",
                    "email_completed_at": _now(),
                }
            },
        )
    except Exception as error:
        try:
            _broadcast_collection().update_one(
                {"_id": ObjectId(str(broadcast_id))},
                {
                    "$set": {
                        "email_sent_count": sent,
                        "email_failed_count": failed + max(0, len(recipients) - sent - failed),
                        "last_email_reason": str(error),
                        "email_status": "failed",
                        "email_completed_at": _now(),
                    }
                },
            )
        except Exception:
            pass


@admin_notification_api.get("/summary")
@admin_required
@permission_required("notifications.view")
def notification_summary():
    db = get_database()
    total_users = db.users.count_documents({})
    active_users = db.users.count_documents(_users_query("active"))
    users_with_email = db.users.count_documents({"email": {"$exists": True, "$nin": ["", None]}})
    recent = list(_broadcast_collection().find({}).sort("created_at", -1).limit(8))

    return success_response(
        message="Notification summary fetched successfully.",
        data={
            "total_users": total_users,
            "active_users": active_users,
            "users_with_email": users_with_email,
            "recent_broadcasts": serialize_documents(recent),
        },
    )


@admin_notification_api.get("/broadcasts")
@admin_required
@permission_required("notifications.view")
def list_broadcasts():
    page = parse_int(request.args.get("page"), default=1, minimum=1, maximum=100000)
    limit = parse_int(request.args.get("limit"), default=10, minimum=1, maximum=50)
    collection = _broadcast_collection()
    total = collection.count_documents({})
    broadcasts = list(collection.find({}).sort("created_at", -1).skip((page - 1) * limit).limit(limit))

    return success_response(
        message="Notification broadcasts fetched successfully.",
        data={
            "broadcasts": serialize_documents(broadcasts),
            "pagination": build_pagination(page, limit, total),
        },
    )


@admin_notification_api.post("/broadcast")
@admin_required
@permission_required("notifications.send")
def send_broadcast():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return error_response(message="Invalid notification payload.", errors={"payload": "JSON object required."}, status_code=400)

    title = _clean_text(data.get("title"), 120)
    message = _clean_text(data.get("message"), 2000)
    channel = str(data.get("channel") or "both").strip().lower()
    raw_severity = str(data.get("severity") or "info").strip().lower()
    severity = _normalize_severity(raw_severity)
    target = str(data.get("target") or "all").strip().lower()

    if not title:
        return error_response(message="Notification title is required.", errors={"title": "Title is required."}, status_code=422)
    if not message:
        return error_response(message="Notification message is required.", errors={"message": "Message is required."}, status_code=422)
    if channel not in VALID_CHANNELS:
        return error_response(message="Invalid delivery channel.", errors={"channel": "Use notification, email, or both."}, status_code=422)
    if raw_severity not in VALID_SEVERITIES:
        return error_response(message="Invalid severity.", errors={"severity": "Use info, success, warning, or alert."}, status_code=422)
    if target not in {"all", "active"}:
        return error_response(message="Invalid target audience.", errors={"target": "Use all or active."}, status_code=422)

    db = get_database()
    users = list(db.users.find(_users_query(target), _users_projection()))
    user_count = len(users)

    notification_result = {"inserted_count": 0}
    if channel in {"notification", "both"}:
        notification_result = create_bulk_user_notifications(
            users=users,
            title=title,
            message=message,
            notice_type="admin_broadcast",
            severity=severity,
            metadata={
                "target": target,
                "channel": channel,
                "sent_from": "admin_notifications_page",
            },
            admin_id=getattr(g, "current_admin_id", ""),
            admin_email=getattr(g, "current_admin_email", ""),
        )

    recipients = _email_recipients(users) if channel in {"email", "both"} else []
    email_attempted = len(recipients)
    email_status = "queued" if email_attempted else ("not_requested" if channel == "notification" else "no_recipients")

    broadcast_doc = {
        "title": title,
        "message": message,
        "channel": channel,
        "severity": severity,
        "target": target,
        "user_count": user_count,
        "notification_created_count": int(notification_result.get("inserted_count") or 0),
        "email_attempted_count": email_attempted,
        "email_queued_count": email_attempted,
        "email_sent_count": 0,
        "email_failed_count": 0,
        "email_status": email_status,
        "last_email_reason": "",
        "created_by_admin_id": getattr(g, "current_admin_id", ""),
        "created_by_admin_email": getattr(g, "current_admin_email", ""),
        "created_at": _now(),
    }
    inserted = _broadcast_collection().insert_one(broadcast_doc)
    broadcast_doc["_id"] = inserted.inserted_id

    if recipients:
        EMAIL_EXECUTOR.submit(_send_broadcast_emails_async, str(inserted.inserted_id), recipients, title, message, severity)

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="notifications.broadcast.sent",
        resource_type="notification",
        resource_id=str(inserted.inserted_id),
        message=f"Admin queued {channel} notification broadcast to {user_count} user(s).",
        metadata={
            "title": title,
            "target": target,
            "channel": channel,
            "severity": severity,
            "user_count": user_count,
            "notification_created_count": broadcast_doc["notification_created_count"],
            "email_attempted_count": email_attempted,
            "email_queued_count": email_attempted,
            "email_status": email_status,
        },
    )

    return success_response(
        message="Notification broadcast queued successfully.",
        data={
            "broadcast": serialize_documents([broadcast_doc])[0],
            "delivery": {
                "target_user_count": user_count,
                "notification_created_count": broadcast_doc["notification_created_count"],
                "email_attempted_count": email_attempted,
                "email_queued_count": email_attempted,
                "email_sent_count": 0,
                "email_failed_count": 0,
                "email_status": email_status,
                "last_email_reason": "",
            },
        },
        status_code=201,
    )

from datetime import datetime, timezone

from bson import ObjectId

from config.database import get_database


NOTIFICATION_COLLECTION = "user_notifications"


def _now():
    return datetime.now(timezone.utc)


def _serialize_value(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        # PyMongo can return UTC datetimes without tzinfo.
        # Always serialize notification dates as UTC ISO strings with "Z" so
        # the browser never treats UTC database time as local time.
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        else:
            value = value.astimezone(timezone.utc)
        return value.isoformat().replace("+00:00", "Z")
    return value


def serialize_notification(notification):
    if not notification:
        return {}

    item = dict(notification)
    item["id"] = str(item.get("_id"))
    item.pop("_id", None)

    for key, value in list(item.items()):
        item[key] = _serialize_value(value)

    return item


def _notifications_collection():
    db = get_database()
    collection = db[NOTIFICATION_COLLECTION]
    try:
        collection.create_index([("recipient_user_id", 1), ("created_at", -1)])
        collection.create_index([("recipient_user_id", 1), ("read_at", 1), ("created_at", -1)])
        collection.create_index([("type", 1), ("created_at", -1)])
    except Exception:
        # Index creation must never block the admin action that is creating a notice.
        pass
    return collection


def create_user_notification(user, title, message, notice_type="admin_notice", severity="info", metadata=None, admin_id="", admin_email=""):
    if not user or not user.get("_id"):
        return None

    now = _now()
    notification = {
        "recipient_user_id": str(user.get("_id")),
        "recipient_email": str(user.get("email") or "").strip().lower(),
        "recipient_name": str(user.get("name") or user.get("full_name") or user.get("username") or "").strip(),
        "type": str(notice_type or "admin_notice").strip().lower(),
        "severity": str(severity or "info").strip().lower(),
        "title": str(title or "TraidiumX Notice").strip(),
        "message": str(message or "").strip(),
        "metadata": metadata or {},
        "created_by_admin_id": str(admin_id or ""),
        "created_by_admin_email": str(admin_email or ""),
        "created_at": now,
        "read_at": None,
    }

    result = _notifications_collection().insert_one(notification)
    notification["_id"] = result.inserted_id
    return notification


def create_bulk_user_notifications(users, title, message, notice_type="admin_notice", severity="info", metadata=None, admin_id="", admin_email=""):
    users = list(users or [])
    now = _now()
    docs = []

    for user in users:
        if not user or not user.get("_id"):
            continue
        docs.append({
            "recipient_user_id": str(user.get("_id")),
            "recipient_email": str(user.get("email") or "").strip().lower(),
            "recipient_name": str(user.get("name") or user.get("full_name") or user.get("username") or "").strip(),
            "type": str(notice_type or "admin_notice").strip().lower(),
            "severity": str(severity or "info").strip().lower(),
            "title": str(title or "TraidiumX Notice").strip(),
            "message": str(message or "").strip(),
            "metadata": metadata or {},
            "created_by_admin_id": str(admin_id or ""),
            "created_by_admin_email": str(admin_email or ""),
            "created_at": now,
            "read_at": None,
        })

    if not docs:
        return {"inserted_count": 0}

    result = _notifications_collection().insert_many(docs, ordered=False)
    return {"inserted_count": len(result.inserted_ids)}


def get_user_notifications(user_id, limit=20, unread_only=False):
    query = {"recipient_user_id": str(user_id)}
    if unread_only:
        query["read_at"] = None

    try:
        safe_limit = max(1, min(int(limit or 20), 50))
    except (TypeError, ValueError):
        safe_limit = 20

    cursor = _notifications_collection().find(query).sort("created_at", -1).limit(safe_limit)
    return [serialize_notification(item) for item in cursor]


def mark_notifications_read(user_id, notification_ids=None):
    query = {"recipient_user_id": str(user_id), "read_at": None}

    ids = []
    for value in notification_ids or []:
        try:
            ids.append(ObjectId(str(value)))
        except Exception:
            continue

    if ids:
        query["_id"] = {"$in": ids}

    result = _notifications_collection().update_many(query, {"$set": {"read_at": _now()}})
    return {"matched_count": result.matched_count, "modified_count": result.modified_count}

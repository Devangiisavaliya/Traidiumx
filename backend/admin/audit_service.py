from datetime import datetime, time, timedelta

from flask import request

from config.database import get_database
from utils.date_helper import now_utc
from .utils import serialize_documents, parse_int


def get_admin_audit_logs_collection():
    return get_database().admin_audit_logs


import time as time_module

_SUMMARY_CACHE = {
    "data": None,
    "expires_at": 0,
}

_FILTERS_CACHE = {
    "data": None,
    "expires_at": 0,
}


def invalidate_audit_cache(status="success"):
    _FILTERS_CACHE["expires_at"] = 0
    if _SUMMARY_CACHE["data"]:
        _SUMMARY_CACHE["data"]["total"] = _SUMMARY_CACHE["data"].get("total", 0) + 1
        _SUMMARY_CACHE["data"]["today"] = _SUMMARY_CACHE["data"].get("today", 0) + 1
        if status in ["failed", "failure", "error"]:
            _SUMMARY_CACHE["data"]["failed"] = _SUMMARY_CACHE["data"].get("failed", 0) + 1


def create_admin_audit_log(
    admin_id=None,
    admin_email="",
    action="",
    resource_type="",
    resource_id="",
    status="success",
    message="",
    metadata=None,
):
    log_data = {
        "admin_id": str(admin_id) if admin_id else "",
        "admin_email": admin_email or "",
        "action": action or "",
        "resource_type": resource_type or "",
        "resource_id": str(resource_id) if resource_id else "",
        "status": status or "success",
        "message": message or "",
        "metadata": metadata or {},
        "ip_address": request.headers.get("X-Forwarded-For", request.remote_addr or ""),
        "user_agent": request.headers.get("User-Agent", ""),
        "created_at": now_utc(),
    }

    result = get_admin_audit_logs_collection().insert_one(log_data)
    invalidate_audit_cache(status)
    return result.inserted_id


def _normalize_filter(value):
    text = str(value or "").strip()
    if text.lower() == "all":
        return ""
    return text


def _parse_date(value, end_of_day=False):
    text = str(value or "").strip()
    if not text:
        return None

    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo:
            parsed = parsed.replace(tzinfo=None)
        return parsed
    except ValueError:
        pass

    try:
        date_value = datetime.strptime(text, "%Y-%m-%d").date()
        return datetime.combine(date_value, time.max if end_of_day else time.min)
    except ValueError:
        return None


def _build_audit_query(
    action="",
    admin_email="",
    resource_type="",
    status="",
    search="",
    date_from="",
    date_to="",
):
    action = _normalize_filter(action)
    status = _normalize_filter(status)
    resource_type = _normalize_filter(resource_type)
    admin_email = _normalize_filter(admin_email)
    search = _normalize_filter(search)

    query = {}

    if action:
        query["action"] = {"$regex": action, "$options": "i"}

    if admin_email:
        query["admin_email"] = {"$regex": admin_email, "$options": "i"}

    if resource_type:
        query["resource_type"] = {"$regex": resource_type, "$options": "i"}

    if status:
        query["status"] = {"$regex": status, "$options": "i"}

    if search:
        query["$or"] = [
            {"admin_email": {"$regex": search, "$options": "i"}},
            {"admin_id": {"$regex": search, "$options": "i"}},
            {"action": {"$regex": search, "$options": "i"}},
            {"resource_type": {"$regex": search, "$options": "i"}},
            {"resource_id": {"$regex": search, "$options": "i"}},
            {"message": {"$regex": search, "$options": "i"}},
            {"ip_address": {"$regex": search, "$options": "i"}},
        ]

    created_at = {}
    start_date = _parse_date(date_from)
    end_date = _parse_date(date_to, end_of_day=True)

    if start_date:
        created_at["$gte"] = start_date

    if end_date:
        created_at["$lte"] = end_date

    if created_at:
        query["created_at"] = created_at

    return query


def _summary(collection):
    now = time_module.time()
    if _SUMMARY_CACHE["data"] and now < _SUMMARY_CACHE["expires_at"]:
        return _SUMMARY_CACHE["data"]

    today_start = datetime.combine(datetime.utcnow().date(), time.min)
    today_end = today_start + timedelta(days=1)

    security_regex = {
        "$regex": "login|logout|auth|password|security|permission|block|suspend",
        "$options": "i",
    }

    critical_regex = {
        "$regex": "approve|reject|delete|block|suspend|withdrawal|risk",
        "$options": "i",
    }

    data = {
        "total": collection.count_documents({}),
        "today": collection.count_documents(
            {"created_at": {"$gte": today_start, "$lt": today_end}}
        ),
        "failed": collection.count_documents(
            {"status": {"$in": ["failed", "failure", "error"]}}
        ),
        "admins": len(
            collection.distinct("admin_email", {"admin_email": {"$nin": [None, ""]}})
        ),
        "security": collection.count_documents(
            {"$or": [{"action": security_regex}, {"message": security_regex}]}
        ),
        "critical": collection.count_documents(
            {"$or": [{"action": critical_regex}, {"resource_type": critical_regex}]}
        ),
    }

    _SUMMARY_CACHE["data"] = data
    _SUMMARY_CACHE["expires_at"] = now + 300
    return data


def _filters(collection):
    now = time_module.time()
    if _FILTERS_CACHE["data"] and now < _FILTERS_CACHE["expires_at"]:
        return _FILTERS_CACHE["data"]

    actions = sorted([item for item in collection.distinct("action") if item])
    resource_types = sorted([item for item in collection.distinct("resource_type") if item])

    data = {
        "actions": actions,
        "resource_types": resource_types,
    }
    _FILTERS_CACHE["data"] = data
    _FILTERS_CACHE["expires_at"] = now + 600
    return data


def list_admin_audit_logs(
    page=1,
    limit=50,
    action="",
    admin_email="",
    resource_type="",
    status="",
    search="",
    date_from="",
    date_to="",
):
    page = parse_int(page, default=1, minimum=1, maximum=100000)
    limit = parse_int(limit, default=50, minimum=1, maximum=200)

    collection = get_admin_audit_logs_collection()

    query = _build_audit_query(
        action=action,
        admin_email=admin_email,
        resource_type=resource_type,
        status=status,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )

    summary_data = _summary(collection)
    total = summary_data.get("total", 0) if not query else collection.count_documents(query)
    pages = (total + limit - 1) // limit if limit else 1

    logs = list(
        collection.find(query)
        .sort("created_at", -1)
        .skip((page - 1) * limit)
        .limit(limit)
    )

    return {
        "logs": serialize_documents(logs),
        "summary": summary_data,
        "filters": _filters(collection),
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": pages,
            "total_pages": pages,
            "has_next": page < pages,
            "has_prev": page > 1,
        },
    }


def get_admin_audit_logs(args=None):
    args = args or {}

    return list_admin_audit_logs(
        page=args.get("page", 1),
        limit=args.get("limit", 50),
        action=args.get("action", ""),
        admin_email=args.get("admin_email", ""),
        resource_type=args.get("resource_type", ""),
        status=args.get("status", ""),
        search=args.get("search", ""),
        date_from=args.get("date_from", ""),
        date_to=args.get("date_to", ""),
    )


def get_admin_audit_summary():
    collection = get_admin_audit_logs_collection()
    return _summary(collection)
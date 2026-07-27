from datetime import datetime, timedelta, timezone

from bson import ObjectId

from config.database import get_database
from utils.date_helper import now_utc

ACTIVE_ACCOUNT_STATUS = "active"
RESTRICTED_ACCOUNT_STATUSES = {
    "blocked",
    "suspended",
    "disabled",
    "deactivated",
    "banned",
}
ALLOWED_ADMIN_STATUSES = {"active", "blocked", "suspended"}
SCHEDULED_ACTIONS = {"blocked", "suspended"}
DEFAULT_SUSPEND_HOURS = 24


def _to_datetime(value):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    if isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except Exception:
            return None

    return None


def _seconds_until(value):
    target = _to_datetime(value)
    if not target:
        return 0
    return max(0, int((target - now_utc()).total_seconds()))


def _safe_int(value, default=0, minimum=0, maximum=None):
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        number = default
    number = max(minimum, number)
    if maximum is not None:
        number = min(number, maximum)
    return number


def normalize_account_status(user):
    """Return the effective user account status.

    Older/demo records may contain `status` instead of `account_status`.
    Admin enforcement must handle both so suspended users cannot bypass checks.
    Scheduled block/suspend actions are also enforced here when a user record
    is read by login/auth protected APIs.
    """
    if not user:
        return "unknown"

    refreshed = refresh_user_scheduled_status(user)
    if refreshed:
        user = refreshed

    status = user.get("account_status")
    if status is None or str(status).strip() == "":
        status = user.get("status", ACTIVE_ACCOUNT_STATUS)

    return str(status or ACTIVE_ACCOUNT_STATUS).strip().lower()


def is_user_active(user):
    return normalize_account_status(user) == ACTIVE_ACCOUNT_STATUS


def get_account_restriction_message(status):
    status = str(status or "").strip().lower()

    if status == "suspended":
        return "Your account is suspended. Please contact support."

    if status == "blocked":
        return "Your account is blocked. Please contact support."

    if status in {"disabled", "deactivated", "banned"}:
        return "Your account is restricted. Please contact support."

    return "Your account is not active. Please contact support."


def get_pending_account_action(user):
    if not user:
        return None

    pending = user.get("pending_account_action") or {}
    action = str(pending.get("action") or pending.get("final_status") or "").strip().lower()
    grace_until = _to_datetime(pending.get("grace_until"))

    if action not in SCHEDULED_ACTIONS or not grace_until:
        return None

    remaining = max(0, int((grace_until - now_utc()).total_seconds()))
    return {
        "action": action,
        "final_status": action,
        "reason": pending.get("reason") or user.get("account_status_reason") or "Admin account notice.",
        "grace_until": grace_until,
        "remaining_seconds": remaining,
        "suspend_hours": _safe_int(pending.get("suspend_hours"), DEFAULT_SUSPEND_HOURS, minimum=1),
        "created_at": _to_datetime(pending.get("created_at")),
        "created_by_email": pending.get("created_by_email") or "",
    }


def refresh_user_scheduled_status(user):
    """Apply scheduled block/suspend or auto-reactivate expired suspend.

    This keeps the user active during grace time. Once grace_until has passed,
    the final status is applied. Suspensions are auto-reactivated after
    suspended_until passes.
    """
    if not user or not user.get("_id"):
        return user

    db = get_database()
    now = now_utc()
    status = str(user.get("account_status") or user.get("status") or ACTIVE_ACCOUNT_STATUS).strip().lower()
    update_doc = None

    suspended_until = _to_datetime(user.get("suspended_until"))
    if status == "suspended" and suspended_until and suspended_until <= now:
        update_doc = {
            "$set": {
                "account_status": "active",
                "status": "active",
                "reactivated_at": now,
                "status_updated_at": now,
                "updated_at": now,
            },
            "$unset": {
                "account_status_reason": "",
                "suspend_reason": "",
                "suspended_until": "",
                "pending_account_action": "",
            },
        }
    else:
        pending = get_pending_account_action(user)
        if pending and pending["remaining_seconds"] <= 0 and status == "active":
            action = pending["action"]
            reason = pending["reason"] or ("Suspended by admin." if action == "suspended" else "Blocked by admin.")
            set_data = {
                "account_status": action,
                "status": action,
                "account_status_reason": reason,
                "status_updated_at": now,
                "updated_at": now,
                "scheduled_action_applied_at": now,
            }
            unset_data = {"pending_account_action": ""}

            if action == "suspended":
                suspend_hours = _safe_int(pending.get("suspend_hours"), DEFAULT_SUSPEND_HOURS, minimum=1)
                set_data.update({
                    "suspended_at": now,
                    "suspended_until": now + timedelta(hours=suspend_hours),
                    "suspend_reason": reason,
                })
                unset_data.update({"blocked_at": "", "blocked_reason": ""})
            else:
                set_data.update({
                    "blocked_at": now,
                    "blocked_reason": reason,
                })
                unset_data.update({"suspended_at": "", "suspended_until": "", "suspend_reason": ""})

            update_doc = {"$set": set_data, "$unset": unset_data}

    if update_doc:
        db.users.update_one({"_id": user["_id"]}, update_doc)
        return db.users.find_one({"_id": user["_id"]}) or user

    return user


def build_account_status_errors(user):
    user = refresh_user_scheduled_status(user)
    status = normalize_account_status(user)
    errors = {"account_status": status}

    reason = str(user.get("account_status_reason") or user.get("suspend_reason") or user.get("blocked_reason") or "").strip() if user else ""
    if reason:
        errors["reason"] = reason

    suspended_until = _to_datetime(user.get("suspended_until")) if user else None
    if suspended_until:
        errors["suspended_until"] = suspended_until.isoformat()

    pending = get_pending_account_action(user)
    if pending:
        errors["pending_action"] = pending["action"]
        errors["grace_until"] = pending["grace_until"].isoformat()
        errors["remaining_seconds"] = pending["remaining_seconds"]

    return errors


def build_account_status_service_result(user):
    user = refresh_user_scheduled_status(user)
    status = normalize_account_status(user)
    return {
        "success": False,
        "message": get_account_restriction_message(status),
        "errors": build_account_status_errors(user),
        "status_code": 403,
    }


def build_user_account_status_payload(user):
    user = refresh_user_scheduled_status(user)
    status = normalize_account_status(user)
    pending = get_pending_account_action(user)
    reason = str(user.get("account_status_reason") or user.get("suspend_reason") or user.get("blocked_reason") or "").strip() if user else ""
    suspended_until = _to_datetime(user.get("suspended_until")) if user else None

    payload = {
        "account_status": status,
        "is_active": status == "active",
        "reason": reason,
        "message": "Account is active." if status == "active" else get_account_restriction_message(status),
        "pending_action": None,
        "suspended_until": suspended_until.isoformat() if suspended_until else None,
        "suspended_remaining_seconds": _seconds_until(suspended_until) if suspended_until else 0,
    }

    if pending:
        action = pending["action"]
        action_word = "blocked" if action == "blocked" else "suspended"
        suspend_extra = f" for {pending['suspend_hours']} hours" if action == "suspended" else ""
        payload["pending_action"] = {
            "action": action,
            "final_status": action,
            "reason": pending["reason"],
            "grace_until": pending["grace_until"].isoformat(),
            "remaining_seconds": pending["remaining_seconds"],
            "suspend_hours": pending["suspend_hours"],
            "message": f"Your account will be {action_word}{suspend_extra}. Please complete any buy/sell/close action before the timer ends.",
        }
        payload["message"] = payload["pending_action"]["message"]
        payload["reason"] = pending["reason"]

    return payload


def schedule_user_account_action(user_id, action, reason="", grace_seconds=0, suspend_hours=DEFAULT_SUSPEND_HOURS, admin_id="", admin_email=""):
    action = str(action or "").strip().lower()
    reason = str(reason or "").strip()
    grace_seconds = _safe_int(grace_seconds, 0, minimum=0, maximum=60 * 60 * 24 * 30)
    suspend_hours = _safe_int(suspend_hours, DEFAULT_SUSPEND_HOURS, minimum=1, maximum=24 * 30)

    if action not in SCHEDULED_ACTIONS:
        return {
            "success": False,
            "message": "Invalid scheduled action.",
            "errors": {"action": "Action must be blocked or suspended."},
            "status_code": 422,
        }

    try:
        object_id = ObjectId(str(user_id))
    except Exception:
        return {
            "success": False,
            "message": "Invalid user ID.",
            "errors": {"user_id": "Invalid ObjectId."},
            "status_code": 422,
        }

    db = get_database()
    user = db.users.find_one({"_id": object_id})
    if not user:
        return {
            "success": False,
            "message": "User not found.",
            "errors": {"user_id": "Invalid user ID."},
            "status_code": 404,
        }

    now = now_utc()
    reason = reason or ("Suspended by admin." if action == "suspended" else "Blocked by admin.")
    grace_until = now + timedelta(seconds=grace_seconds)

    # Keep account active during grace time so user can close/open/sell/buy before final restriction.
    set_data = {
        "account_status": "active",
        "status": "active",
        "account_status_reason": reason,
        "status_updated_by": str(admin_id or ""),
        "status_updated_by_email": str(admin_email or ""),
        "status_updated_at": now,
        "updated_at": now,
        "pending_account_action": {
            "action": action,
            "final_status": action,
            "reason": reason,
            "grace_seconds": grace_seconds,
            "grace_until": grace_until,
            "suspend_hours": suspend_hours if action == "suspended" else None,
            "created_at": now,
            "created_by": str(admin_id or ""),
            "created_by_email": str(admin_email or ""),
        },
    }

    db.users.update_one({"_id": object_id}, {"$set": set_data})
    updated_user = db.users.find_one({"_id": object_id}, {"password_hash": 0})

    return {
        "success": True,
        "message": "User restriction scheduled successfully.",
        "data": {"user": updated_user, "account_status": build_user_account_status_payload(updated_user)},
        "status_code": 200,
        "old_status": normalize_account_status(user),
        "new_status": "active",
        "scheduled_status": action,
        "reason": reason,
        "grace_until": grace_until,
        "grace_seconds": grace_seconds,
        "suspend_hours": suspend_hours if action == "suspended" else None,
    }


def apply_user_account_status(user_id, status, reason="", admin_id="", admin_email="", suspend_hours=DEFAULT_SUSPEND_HOURS):
    status = str(status or "").strip().lower()
    reason = str(reason or "").strip()
    suspend_hours = _safe_int(suspend_hours, DEFAULT_SUSPEND_HOURS, minimum=1, maximum=24 * 30)

    if status not in ALLOWED_ADMIN_STATUSES:
        return {
            "success": False,
            "message": "Invalid user status.",
            "errors": {"status": "Status must be one of active, blocked, suspended."},
            "status_code": 422,
        }

    try:
        object_id = ObjectId(str(user_id))
    except Exception:
        return {
            "success": False,
            "message": "Invalid user ID.",
            "errors": {"user_id": "Invalid ObjectId."},
            "status_code": 422,
        }

    db = get_database()
    user = db.users.find_one({"_id": object_id})
    if not user:
        return {
            "success": False,
            "message": "User not found.",
            "errors": {"user_id": "Invalid user ID."},
            "status_code": 404,
        }

    now = now_utc()
    admin_id = str(admin_id or "")
    admin_email = str(admin_email or "")

    set_data = {
        "account_status": status,
        # Keep legacy/status UI-compatible field in sync with account_status.
        "status": status,
        "status_updated_by": admin_id,
        "status_updated_by_email": admin_email,
        "status_updated_at": now,
        "updated_at": now,
    }
    unset_data = {"pending_account_action": ""}

    if status == "suspended":
        set_data.update({
            "account_status_reason": reason or "Suspended by admin.",
            "suspended_at": now,
            "suspended_until": now + timedelta(hours=suspend_hours),
            "suspended_by": admin_id,
            "suspended_by_email": admin_email,
            "suspend_reason": reason or "Suspended by admin.",
        })
        unset_data.update({
            "blocked_at": "",
            "blocked_by": "",
            "blocked_by_email": "",
            "blocked_reason": "",
            "reactivated_at": "",
            "reactivated_by": "",
            "reactivated_by_email": "",
        })

    elif status == "blocked":
        set_data.update({
            "account_status_reason": reason or "Blocked by admin.",
            "blocked_at": now,
            "blocked_by": admin_id,
            "blocked_by_email": admin_email,
            "blocked_reason": reason or "Blocked by admin.",
        })
        unset_data.update({
            "suspended_at": "",
            "suspended_until": "",
            "suspended_by": "",
            "suspended_by_email": "",
            "suspend_reason": "",
            "reactivated_at": "",
            "reactivated_by": "",
            "reactivated_by_email": "",
        })

    else:  # active
        set_data.update({
            "reactivated_at": now,
            "reactivated_by": admin_id,
            "reactivated_by_email": admin_email,
        })
        unset_data.update({
            "account_status_reason": "",
            "suspended_at": "",
            "suspended_until": "",
            "suspended_by": "",
            "suspended_by_email": "",
            "suspend_reason": "",
            "blocked_at": "",
            "blocked_by": "",
            "blocked_by_email": "",
            "blocked_reason": "",
        })

    update_doc = {"$set": set_data}
    if unset_data:
        update_doc["$unset"] = unset_data

    db.users.update_one({"_id": object_id}, update_doc)
    updated_user = db.users.find_one({"_id": object_id}, {"password_hash": 0})

    return {
        "success": True,
        "message": "User status updated successfully.",
        "data": {"user": updated_user},
        "status_code": 200,
        "old_status": normalize_account_status(user),
        "new_status": status,
        "reason": reason,
    }

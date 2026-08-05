from bson import ObjectId

from config.database import get_database
from utils.date_helper import now_utc

APPROVED_KYC_STATUS = "approved"
REVIEWABLE_KYC_STATUSES = {"pending", "under_review", "review", "rejected"}
BLOCKING_KYC_STATUSES = {"not_submitted", "pending", "under_review", "review", "rejected"}


STATUS_LABELS = {
    "not_submitted": "Not Submitted",
    "pending": "Pending Verification",
    "under_review": "Under Verification",
    "review": "Under Verification",
    "approved": "Approved",
    "rejected": "Rejected",
}


STATUS_MESSAGES = {
    "not_submitted": "Please complete KYC to unlock deposits, trading, and withdrawals.",
    "pending": "Your KYC verification is being processed. Access will be enabled once approved.",
    "under_review": "Your KYC verification is being processed. Access will be enabled once approved.",
    "review": "Your KYC verification is being processed. Access will be enabled once approved.",
    "approved": "Your KYC is approved. Full account access is enabled.",
    "rejected": "Your KYC verification failed. Please check the reason and upload the correct document again.",
}


def normalize_kyc_status(status):
    value = str(status or "").strip().lower().replace("-", "_").replace(" ", "_")
    if value in {"", "none", "null"}:
        return "not_submitted"
    if value in {"submitted", "pending_review", "pending_admin_review", "pending_admin_approval"}:
        return "pending"
    if value in {"verified", "complete", "completed"}:
        return "approved"
    if value in {"declined", "failed"}:
        return "rejected"
    return value


def kyc_status_label(status):
    value = normalize_kyc_status(status)
    return STATUS_LABELS.get(value, value.replace("_", " ").title())


def kyc_status_message(status, remark=""):
    value = normalize_kyc_status(status)
    if value == "rejected" and str(remark or "").strip():
        return f"Rejected: {str(remark).strip()}"
    return STATUS_MESSAGES.get(value, "KYC approval is required before this action.")


def _to_object_id(value):
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def find_latest_kyc_for_user(user_id):
    db = get_database()
    return db.kyc_requests.find_one({"user_id": str(user_id)}, sort=[("updated_at", -1), ("created_at", -1)])


def check_and_apply_auto_approvals():
    import datetime
    from utils.date_helper import now_utc
    db = get_database()
    current_time = now_utc()
    threshold = current_time - datetime.timedelta(hours=24)
    
    # Strip timezone for MongoDB comparison if PyMongo is returning naive datetimes
    if threshold.tzinfo is not None:
        threshold = threshold.replace(tzinfo=None)
        
    old_requests = list(db.kyc_requests.find({
        "status": {"$in": ["pending", "under_review", "review"]},
        "created_at": {"$lt": threshold}
    }))
    
    for req in old_requests:
        kyc_id = req["_id"]
        user_id = req["user_id"]
        
        # Approve the request
        db.kyc_requests.update_one(
            {"_id": kyc_id},
            {"$set": {
                "status": "approved",
                "remark": "KYC auto-approved after 24 hours of admin pending review.",
                "approved_by": "system_auto_approve",
                "approved_at": now_utc(),
                "updated_at": now_utc()
            }}
        )
        
        # Update user profile status
        user_object_id = _to_object_id(user_id)
        if user_object_id:
            full_name = req.get("full_name", "")
            update_fields = {
                "kyc_status": "approved",
                "kyc_status_label": "Approved",
                "kyc_status_updated_at": now_utc(),
                "kyc_verified_at": now_utc(),
                "kyc_reject_reason": "",
                "updated_at": now_utc()
            }
            if full_name:
                update_fields.update({
                    "name": full_name,
                    "full_name": full_name,
                    "display_name": full_name,
                    "verified_name": full_name,
                })
            db.users.update_one(
                {"_id": user_object_id},
                {"$set": update_fields}
            )


def get_user_kyc_state(user_id, sync_user=True):
    """Return the effective KYC state for a user.

    `kyc_requests.status` is treated as the source of truth when a request exists.
    `users.kyc_status` is kept in sync so older UI/API code remains compatible.
    """
    check_and_apply_auto_approvals()
    db = get_database()
    user_object_id = _to_object_id(user_id)
    user = db.users.find_one({"_id": user_object_id}) if user_object_id else None

    # Inherit KYC status from parent if this is a sub-account
    if user and user.get("parent_user_id"):
        return get_user_kyc_state(user["parent_user_id"], sync_user=sync_user)

    kyc = find_latest_kyc_for_user(user_id)


    if kyc:
        status = normalize_kyc_status(kyc.get("status"))
        remark = str(kyc.get("remark") or kyc.get("reject_reason") or "").strip()
    else:
        status = normalize_kyc_status(user.get("kyc_status") if user else "not_submitted")
        if status in {"pending", "approved", "rejected"} and not kyc:
            # New users were historically created with kyc_status=pending.
            # Without an actual request this should be treated as not submitted.
            status = "not_submitted"
        remark = str(user.get("kyc_reject_reason") or user.get("kyc_remark") or "").strip() if user else ""

    if user_object_id and sync_user and user and normalize_kyc_status(user.get("kyc_status")) != status:
        update_data = {
            "kyc_status": status,
            "kyc_status_label": kyc_status_label(status),
            "kyc_status_updated_at": now_utc(),
            "updated_at": now_utc(),
        }
        update_op = {"$set": update_data}
        if status == "approved":
            update_data["kyc_verified_at"] = kyc.get("approved_at") or kyc.get("reviewed_at") or now_utc() if kyc else now_utc()
            update_data["kyc_reject_reason"] = ""
        elif status == "rejected":
            update_data["kyc_reject_reason"] = remark
            update_data["kyc_verified_at"] = None
        db.users.update_one({"_id": user_object_id}, update_op)

    return {
        "status": status,
        "status_label": kyc_status_label(status),
        "status_message": kyc_status_message(status, remark),
        "remark": remark,
        "kyc": kyc,
        "user": user,
        "can_submit": status in {"not_submitted", "rejected"},
        "can_review": status in REVIEWABLE_KYC_STATUSES,
        "is_approved": status == APPROVED_KYC_STATUS,
    }


def build_kyc_required_result(user_id, action_label="this action"):
    state = get_user_kyc_state(user_id)
    status = state["status"]

    if status == APPROVED_KYC_STATUS:
        return None

    action_label = str(action_label or "this action").strip() or "this action"
    return {
        "success": False,
        "message": f"KYC approved status required before {action_label}.",
        "errors": {
            "kyc_status": status,
            "kyc_status_label": state["status_label"],
            "kyc": state["status_message"],
        },
        "data": {
            "kyc_status": status,
            "kyc_status_label": state["status_label"],
            "kyc_status_message": state["status_message"],
            "can_submit_kyc": state["can_submit"],
        },
        "status_code": 403,
    }


def require_kyc_approved(user_id, action_label="this action"):
    return build_kyc_required_result(user_id, action_label)

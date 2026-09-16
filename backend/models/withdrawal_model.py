from bson import ObjectId

from config.database import get_database
from utils.date_helper import now_utc


def get_withdrawals_collection():
    db = get_database()
    return db.withdrawals


def create_withdrawal(withdrawal_data):
    withdrawal_data["created_at"] = now_utc()
    withdrawal_data["updated_at"] = now_utc()
    result = get_withdrawals_collection().insert_one(withdrawal_data)
    return result.inserted_id


def find_withdrawal_by_id(withdrawal_id):
    try:
        return get_withdrawals_collection().find_one({"_id": ObjectId(withdrawal_id)})
    except Exception:
        return None


def _user_id_match(user_id):
    """Match both legacy ObjectId and current string user_id values."""
    values = []
    text = str(user_id or "").strip()

    if text:
        values.append(text)
        try:
            values.append(ObjectId(text))
        except Exception:
            pass

    return {"user_id": {"$in": values}} if values else {"user_id": ""}


def find_user_withdrawal_by_id(user_id, withdrawal_id):
    try:
        query = {"_id": ObjectId(withdrawal_id)}
        query.update(_user_id_match(user_id))
        return get_withdrawals_collection().find_one(query)
    except Exception:
        return None


def get_user_withdrawals(user_id, limit=500):
    withdrawals = get_withdrawals_collection().find(_user_id_match(user_id)).sort("created_at", -1).limit(limit)
    return list(withdrawals)


def update_withdrawal_status(withdrawal_id, status, extra_data=None):
    update_data = {"status": status, "updated_at": now_utc()}
    if extra_data:
        update_data.update(extra_data)

    get_withdrawals_collection().update_one({"_id": ObjectId(withdrawal_id)}, {"$set": update_data})
    return find_withdrawal_by_id(withdrawal_id)


def get_withdrawal_status_meta(withdrawal):
    """Return user-facing withdrawal lifecycle metadata.

    The raw database status is still preserved for backend logic, but the
    wallet page needs a clear label/message after admin approve/reject actions.
    """
    status = str((withdrawal or {}).get("status") or "pending_admin_approval").lower()

    meta_map = {
        "pending": {
            "label": "Pending Admin Approval",
            "tone": "warning",
            "stage": "locked_waiting_admin",
            "message": "Amount is locked. Waiting for admin approval.",
            "can_cancel": True,
            "is_final": False,
        },
        "pending_admin_approval": {
            "label": "Pending Admin Approval",
            "tone": "warning",
            "stage": "locked_waiting_admin",
            "message": "Amount is locked. Waiting for admin approval.",
            "can_cancel": True,
            "is_final": False,
        },
        "pending_payout": {
            "label": "Pending Admin Approval",
            "tone": "warning",
            "stage": "locked_waiting_admin",
            "message": "Amount is locked. Waiting for admin approval.",
            "can_cancel": True,
            "is_final": False,
        },
        "queued": {
            "label": "Queued for Review",
            "tone": "warning",
            "stage": "locked_waiting_admin",
            "message": "Withdrawal is queued for admin review.",
            "can_cancel": True,
            "is_final": False,
        },
        "approved": {
            "label": "Approved by Admin",
            "tone": "success",
            "stage": "approved_final_debit_done",
            "message": "Admin approved this request. Locked balance has been finally withdrawn.",
            "can_cancel": False,
            "is_final": True,
        },
        "completed": {
            "label": "Completed",
            "tone": "success",
            "stage": "completed",
            "message": "Withdrawal completed successfully.",
            "can_cancel": False,
            "is_final": True,
        },
        "rejected": {
            "label": "Rejected by Admin",
            "tone": "danger",
            "stage": "rejected_released",
            "message": "Admin rejected this request. Locked balance has been released back to available wallet balance.",
            "can_cancel": False,
            "is_final": True,
        },
        "cancelled": {
            "label": "Cancelled by User",
            "tone": "neutral",
            "stage": "cancelled_released",
            "message": "You cancelled this request. Locked balance has been released back to available wallet balance.",
            "can_cancel": False,
            "is_final": True,
        },
        "failed": {
            "label": "Failed",
            "tone": "danger",
            "stage": "failed",
            "message": "Withdrawal failed. Contact support if balance was not released.",
            "can_cancel": False,
            "is_final": True,
        },
    }

    meta = dict(meta_map.get(status, {
        "label": status.replace("_", " ").title(),
        "tone": "warning",
        "stage": "unknown",
        "message": "Withdrawal status is being processed.",
        "can_cancel": False,
        "is_final": False,
    }))

    reject_reason = str((withdrawal or {}).get("reject_reason") or "").strip()
    if status == "rejected" and reject_reason:
        meta["message"] = f"Rejected reason: {reject_reason}"

    user_status_message = str((withdrawal or {}).get("user_status_message") or "").strip()
    if user_status_message:
        meta["message"] = user_status_message

    remark = str((withdrawal or {}).get("remark") or "").strip()
    if not user_status_message and status in ["approved", "completed"] and remark:
        meta["message"] = remark

    return meta


def _iso_or_none(value):
    return value.isoformat() if value else None


def format_withdrawal(withdrawal):
    if not withdrawal:
        return None

    status_meta = get_withdrawal_status_meta(withdrawal)
    approved_at = _iso_or_none(withdrawal.get("approved_at"))
    rejected_at = _iso_or_none(withdrawal.get("rejected_at"))
    cancelled_at = _iso_or_none(withdrawal.get("cancelled_at"))
    completed_at = _iso_or_none(withdrawal.get("completed_at"))

    return {
        "id": str(withdrawal["_id"]),
        "user_id": withdrawal.get("user_id"),
        "withdrawal_reference": withdrawal.get("withdrawal_reference"),
        "amount": withdrawal.get("amount", 0.0),
        "currency": withdrawal.get("currency", "USDT"),
        "withdrawal_method": withdrawal.get("withdrawal_method", "crypto_withdrawal"),
        "crypto_asset": withdrawal.get("crypto_asset", "USDT"),
        "crypto_network": withdrawal.get("crypto_network", ""),
        "withdrawal_address": withdrawal.get("withdrawal_address", ""),
        "destination_tag": withdrawal.get("destination_tag", ""),
        "network_fee": withdrawal.get("network_fee", 0.0),
        "withdrawal_fee": withdrawal.get("withdrawal_fee", 0.0),
        "total_fee": withdrawal.get("total_fee", withdrawal.get("network_fee", 0.0)),
        "final_amount": withdrawal.get("final_amount", withdrawal.get("amount", 0.0)),
        "fee_breakdown": withdrawal.get("fee_breakdown", {}),
        "locked_amount": withdrawal.get("locked_amount", withdrawal.get("amount", 0.0)),
        "status": withdrawal.get("status", "pending_admin_approval"),
        "status_label": status_meta["label"],
        "status_tone": status_meta["tone"],
        "status_stage": status_meta["stage"],
        "status_message": status_meta["message"],
        "can_cancel": status_meta["can_cancel"],
        "is_final": status_meta["is_final"],
        "processing_mode": withdrawal.get("processing_mode", "backend_operations"),
        "remark": withdrawal.get("remark", ""),
        "admin_note": withdrawal.get("admin_note", withdrawal.get("remark", "")),
        "reject_reason": withdrawal.get("reject_reason", ""),
        "approved_by": withdrawal.get("approved_by", ""),
        "approved_admin_email": withdrawal.get("approved_admin_email", ""),
        "approved_at": approved_at,
        "user_account_status_at_approval": withdrawal.get("user_account_status_at_approval", ""),
        "approved_while_user_restricted": bool(withdrawal.get("approved_while_user_restricted", False)),
        "history_visibility": withdrawal.get("history_visibility", ""),
        "rejected_by": withdrawal.get("rejected_by", ""),
        "rejected_admin_email": withdrawal.get("rejected_admin_email", ""),
        "rejected_at": rejected_at,
        "payout_reference": withdrawal.get("payout_reference", ""),
        "tx_hash": withdrawal.get("tx_hash", ""),
        "explorer_url": withdrawal.get("explorer_url", ""),
        "cancelled_at": cancelled_at,
        "completed_at": completed_at,
        "decision_at": approved_at or rejected_at or completed_at or cancelled_at,
        "created_at": _iso_or_none(withdrawal.get("created_at")),
        "updated_at": _iso_or_none(withdrawal.get("updated_at")),
    }


def format_withdrawals(withdrawals):
    return [format_withdrawal(withdrawal) for withdrawal in withdrawals]

from config.database import get_database
from utils.date_helper import now_utc


def get_kyc_collection():
    db = get_database()
    return db.kyc_requests


def find_kyc_by_user_id(user_id):
    return get_kyc_collection().find_one({"user_id": str(user_id)})


def create_or_update_kyc(user_id, kyc_data):
    existing_kyc = find_kyc_by_user_id(user_id)

    kyc_data["user_id"] = str(user_id)
    # The caller decides the final status. Older pending-admin flow used to
    # force every user submission to pending; the current user-side OCR flow
    # stores the OCR decision directly as approved or rejected.
    kyc_data["status"] = str(kyc_data.get("status") or "pending").strip().lower()
    kyc_data["updated_at"] = now_utc()
    kyc_data["submitted_at"] = now_utc()

    if existing_kyc:
        get_kyc_collection().update_one({"user_id": str(user_id)}, {"$set": kyc_data})
        return find_kyc_by_user_id(user_id)

    kyc_data["created_at"] = now_utc()
    result = get_kyc_collection().insert_one(kyc_data)
    return get_kyc_collection().find_one({"_id": result.inserted_id})


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def format_kyc(kyc):
    if not kyc:
        return None

    remark = kyc.get("remark", "") or kyc.get("reject_reason", "") or ""

    return {
        "id": str(kyc["_id"]),
        "user_id": kyc.get("user_id"),
        "full_name": kyc.get("full_name", ""),
        "verification_method": kyc.get("verification_method", "ocr_document"),
        "pan_number": kyc.get("pan_number", ""),
        "document_number": kyc.get("document_number", "") or kyc.get("pan_number", ""),
        "document_number_label": kyc.get("document_number_label", "Document Number"),
        "aadhaar_number": kyc.get("aadhaar_number", ""),
        "passport_number": kyc.get("passport_number", ""),
        "driving_license_number": kyc.get("driving_license_number", ""),
        "document_type": kyc.get("document_type", ""),
        "ocr_status": kyc.get("ocr_status", ""),
        "ocr_score": kyc.get("ocr_score", 0),
        "risk_score": kyc.get("risk_score", 0),
        "ocr_result": kyc.get("ocr_result", {}),
        "document_front": kyc.get("document_front", ""),
        "document_back": kyc.get("document_back", ""),
        "selfie": kyc.get("selfie", ""),
        "progress_step": kyc.get("progress_step", 0),
        "mobile_verified_number": kyc.get("mobile_verified_number", ""),
        "offline_ekyc_file": kyc.get("offline_ekyc_file", ""),
        "offline_ekyc_original_filename": kyc.get("offline_ekyc_original_filename", ""),
        "offline_ekyc_share_code": kyc.get("offline_ekyc_share_code", ""),
        "offline_ekyc_reference_masked": kyc.get("offline_ekyc_reference_masked", ""),
        "status": kyc.get("status", "pending"),
        "remark": remark,
        "reject_reason": kyc.get("reject_reason", "") or (remark if kyc.get("status") == "rejected" else ""),
        "reviewed_by": kyc.get("reviewed_by", ""),
        "approved_by": kyc.get("approved_by", ""),
        "rejected_by": kyc.get("rejected_by", ""),
        "created_at": _iso(kyc.get("created_at")),
        "submitted_at": _iso(kyc.get("submitted_at")),
        "updated_at": _iso(kyc.get("updated_at")),
        "reviewed_at": _iso(kyc.get("reviewed_at")),
        "approved_at": _iso(kyc.get("approved_at")),
        "rejected_at": _iso(kyc.get("rejected_at")),
    }

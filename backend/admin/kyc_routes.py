import os
import zipfile
from flask import Blueprint, Response, g, request, send_file

from config.database import get_database
from services.kyc_status_service import kyc_status_label, kyc_status_message, normalize_kyc_status
from utils.date_helper import now_utc
from utils.response import error_response, success_response
from .audit_service import create_admin_audit_log
from .middleware import admin_required
from .permissions import permission_required
from .utils import build_pagination, parse_int, serialize_document, to_object_id


admin_kyc_api = Blueprint("admin_kyc_api", __name__, url_prefix="/kyc")


def _safe_int(value, default=0):
    try:
        if value is None or value == "":
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _clean_text(value):
    return str(value or "").strip()


def _doc_name(path):
    if not path:
        return ""
    return os.path.basename(str(path).replace("\\", "/"))


def _document_meta(kyc_id, path, side):
    path = _clean_text(path)
    if not path:
        return {
            "side": side,
            "available": False,
            "filename": "",
            "url": "",
            "type": "",
        }

    extension = _doc_name(path).rsplit(".", 1)[-1].lower() if "." in _doc_name(path) else ""
    return {
        "side": side,
        "available": True,
        "filename": _doc_name(path),
        "url": f"/api/admin/kyc/{kyc_id}/document/{side}",
        "type": extension,
    }


def _basic_user_projection():
    return {
        "password_hash": 0,
        "password": 0,
        "reset_token": 0,
        "reset_token_hash": 0,
        "email_verification_token": 0,
    }


def _load_user(db, user_id):
    object_id = to_object_id(user_id)
    if not object_id:
        return None
    return db.users.find_one({"_id": object_id}, _basic_user_projection())


def _format_kyc_admin(item, user=None):
    formatted = serialize_document(item) or {}
    kyc_id = formatted.get("id") or formatted.get("_id") or str(item.get("_id") or "")

    status = normalize_kyc_status(item.get("status"))
    remark = _clean_text(item.get("remark") or item.get("reject_reason") or "")
    user_doc = serialize_document(user) if user else {}

    full_name = _clean_text(item.get("full_name") or user_doc.get("name") or user_doc.get("full_name") or user_doc.get("username") or "")
    email = _clean_text(item.get("email") or user_doc.get("email") or "")
    phone = _clean_text(item.get("phone") or item.get("mobile") or user_doc.get("phone") or user_doc.get("mobile") or "")

    formatted["id"] = kyc_id
    formatted["kyc_id"] = kyc_id
    formatted["user_id"] = str(item.get("user_id") or "")
    formatted["full_name"] = full_name or "Unknown User"
    formatted["email"] = email
    formatted["phone"] = phone
    formatted["pan_number"] = _clean_text(item.get("pan_number") or item.get("pan") or "")
    formatted["aadhaar_number"] = _clean_text(item.get("aadhaar_number") or item.get("document_number") or item.get("offline_ekyc_reference_masked") or "")
    formatted["driving_license_number"] = _clean_text(item.get("driving_license_number") or "")
    formatted["dob"] = _clean_text(item.get("dob") or user_doc.get("dob") or "")
    formatted["gender"] = _clean_text(item.get("gender") or user_doc.get("gender") or "")
    formatted["address"] = _clean_text(item.get("address") or user_doc.get("address") or "")
    formatted["document_number"] = formatted["aadhaar_number"] or formatted["pan_number"]
    formatted["document_number_label"] = "Aadhaar / Reference"
    formatted["document_type"] = _clean_text(item.get("document_type") or item.get("type") or "DigiLocker KYC")
    formatted["status"] = status
    formatted["status_label"] = kyc_status_label(status)
    formatted["status_message"] = kyc_status_message(status, remark)
    formatted["can_review"] = True
    formatted["remark"] = remark
    formatted["reject_reason"] = remark if status == "rejected" else ""
    formatted["risk_score"] = _safe_int(item.get("risk_score") or item.get("ocr_score") or item.get("score") or item.get("confidence_score"), 100 if status == "approved" else 0)
    formatted["ocr_status"] = _clean_text(item.get("ocr_status") or "")
    formatted["ocr_result"] = item.get("ocr_result") or {}
    formatted["document_front"] = _clean_text(item.get("document_front") or "")
    formatted["document_back"] = _clean_text(item.get("document_back") or "")
    formatted["offline_ekyc_file"] = _clean_text(item.get("offline_ekyc_file") or "")
    formatted["offline_ekyc_original_filename"] = _clean_text(item.get("offline_ekyc_original_filename") or "")
    formatted["offline_ekyc_share_code"] = _clean_text(item.get("offline_ekyc_share_code") or "")
    formatted["offline_ekyc_reference_masked"] = _clean_text(item.get("offline_ekyc_reference_masked") or "")
    formatted["verification_method"] = _clean_text(item.get("verification_method") or "aadhaar_offline_ekyc")
    offline_meta = _document_meta(kyc_id, item.get("offline_ekyc_file"), "offline")
    if offline_meta.get("available") and formatted.get("offline_ekyc_original_filename"):
        offline_meta["filename"] = formatted.get("offline_ekyc_original_filename")
    formatted["documents"] = {
        "front": _document_meta(kyc_id, item.get("document_front"), "front"),
        "back": _document_meta(kyc_id, item.get("document_back"), "back"),
        "selfie": _document_meta(kyc_id, item.get("selfie"), "selfie"),
        "offline": offline_meta,
    }

    formatted["user"] = user_doc or None
    return formatted


def _sync_user_kyc_status(db, user_id, status, extra=None):
    user_object_id = to_object_id(user_id)
    if not user_object_id:
        return

    status = normalize_kyc_status(status)
    update_data = {
        "kyc_status": status,
        "kyc_status_label": kyc_status_label(status),
        "kyc_status_updated_at": now_utc(),
        "updated_at": now_utc(),
    }
    if extra:
        update_data.update(extra)

    update_op = {"$set": update_data}
    if status == "rejected":
        update_op["$unset"] = {
            "kyc_draft_aadhaar_number": "",
            "kyc_draft_document_type": "",
            "kyc_draft_document_front": "",
            "kyc_draft_document_back": "",
            "kyc_draft_ocr_result": "",
            "kyc_draft_full_name": "",
            "kyc_documents_verified": "",
            "kyc_documents_verified_at": "",
            "kyc_progress_step": "",
            "kyc_mobile_verified": "",
            "kyc_mobile_verified_number": "",
            "kyc_mobile_verified_at": "",
            "kyc_digio_completed": "",
            "digio_request_id": "",
            "kyc_draft_driving_license_number": "",
            "kyc_draft_pan_number": "",
            "kyc_photo": "",
        }

    db.users.update_one({"_id": user_object_id}, update_op)


def _build_search_query(search):
    search = _clean_text(search)
    if not search:
        return {}
    return {
        "$or": [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"pan_number": {"$regex": search, "$options": "i"}},
            {"document_number": {"$regex": search, "$options": "i"}},
            {"offline_ekyc_reference_masked": {"$regex": search, "$options": "i"}},
            {"document_type": {"$regex": search, "$options": "i"}},
            {"user_id": {"$regex": search, "$options": "i"}},
            {"remark": {"$regex": search, "$options": "i"}},
            {"reject_reason": {"$regex": search, "$options": "i"}},
        ]
    }


def _normalize_filter_status(value):
    value = normalize_kyc_status(value or "")
    if value in {"", "all", "not_submitted"}:
        return ""
    if value == "review":
        return "under_review"
    return value


@admin_kyc_api.get("/summary")
@admin_required
@permission_required("kyc.view")
def kyc_summary():
    from services.kyc_status_service import check_and_apply_auto_approvals
    check_and_apply_auto_approvals()
    db = get_database()
    total = db.kyc_requests.count_documents({})
    pending = db.kyc_requests.count_documents({"status": {"$in": ["pending", "under_review", "review"]}})
    approved = db.kyc_requests.count_documents({"status": "approved"})
    rejected = db.kyc_requests.count_documents({"status": "rejected"})

    return success_response(
        message="KYC summary fetched successfully.",
        data={
            "summary": {
                "total": total,
                "pending": pending,
                "approved": approved,
                "rejected": rejected,
            }
        },
    )


@admin_kyc_api.get("")
@admin_kyc_api.get("/")
@admin_required
@permission_required("kyc.view")
def list_kyc_requests():
    from services.kyc_status_service import check_and_apply_auto_approvals
    check_and_apply_auto_approvals()
    db = get_database()
    page = parse_int(request.args.get("page"), default=1, minimum=1, maximum=100000)
    limit = parse_int(request.args.get("limit"), default=25, minimum=1, maximum=100)
    status = _normalize_filter_status(request.args.get("status") or "")
    search = _clean_text(request.args.get("search") or "")

    query = {}

    if status:
        if status == "pending":
            query["status"] = {"$in": ["pending", "under_review", "review"]}
        else:
            query["status"] = status

    search_query = _build_search_query(search)
    if search_query:
        query.update(search_query)

    total = db.kyc_requests.count_documents(query)
    items = list(
        db.kyc_requests.find(query)
        .sort("created_at", -1)
        .skip((page - 1) * limit)
        .limit(limit)
    )

    users_by_id = {}
    for item in items:
        user_id = item.get("user_id")
        user = _load_user(db, user_id)
        if user:
            users_by_id[str(user_id)] = user

    formatted = [_format_kyc_admin(item, users_by_id.get(str(item.get("user_id")))) for item in items]

    return success_response(
        message="KYC requests fetched successfully.",
        data={
            "kyc_requests": formatted,
            "pagination": build_pagination(page, limit, total),
        },
    )


@admin_kyc_api.get("/<kyc_id>")
@admin_required
@permission_required("kyc.view")
def kyc_detail(kyc_id):
    db = get_database()
    object_id = to_object_id(kyc_id)

    if not object_id:
        return error_response(message="Invalid KYC ID.", errors={"kyc_id": "Invalid ObjectId."}, status_code=422)

    kyc = db.kyc_requests.find_one({"_id": object_id})
    if not kyc:
        return error_response(message="KYC request not found.", errors={"kyc_id": "Invalid KYC ID."}, status_code=404)

    user = _load_user(db, kyc.get("user_id"))

    return success_response(
        message="KYC request detail fetched successfully.",
        data={"kyc": _format_kyc_admin(kyc, user), "user": serialize_document(user)},
    )


def _read_uidai_offline_xml_preview(path, share_code=""):
    """Return readable XML text from UIDAI Offline e-KYC XML/ZIP for admin preview."""
    safe_path = os.path.abspath(path)
    filename = _doc_name(safe_path).lower()

    if filename.endswith(".xml"):
        with open(safe_path, "rb") as handle:
            return handle.read(2_000_000).decode("utf-8", errors="replace")

    if filename.endswith(".zip"):
        password = (_clean_text(share_code) or "").encode("utf-8") or None
        with zipfile.ZipFile(safe_path, "r") as archive:
            xml_names = [name for name in archive.namelist() if name.lower().endswith(".xml")]
            if not xml_names:
                raise ValueError("No XML file found inside the uploaded Offline e-KYC ZIP.")
            xml_name = xml_names[0]
            try:
                data = archive.read(xml_name, pwd=password)
            except RuntimeError as exc:
                raise ValueError("Unable to open ZIP. Please check the saved share code.") from exc
            return data[:2_000_000].decode("utf-8", errors="replace")

    raise ValueError("Preview is available only for UIDAI Offline e-KYC XML or ZIP files.")


@admin_kyc_api.get("/<kyc_id>/document/<side>")
@admin_required
@permission_required("kyc.view")
def kyc_document(kyc_id, side):
    db = get_database()
    object_id = to_object_id(kyc_id)
    side = _clean_text(side).lower()

    if side not in {"front", "back", "offline", "selfie"}:
        return error_response(message="Invalid document side.", errors={"side": "Use front, back, selfie or offline."}, status_code=422)

    if not object_id:
        return error_response(message="Invalid KYC ID.", errors={"kyc_id": "Invalid ObjectId."}, status_code=422)

    kyc = db.kyc_requests.find_one({"_id": object_id})
    if not kyc:
        return error_response(message="KYC request not found.", errors={"kyc_id": "Invalid KYC ID."}, status_code=404)

    if side == "offline":
        path = kyc.get("offline_ekyc_file")
    elif side == "selfie":
        path = kyc.get("selfie")
    else:
        path = kyc.get(f"document_{side}")

    path = _clean_text(path or "")
    if not path:

        return error_response(message="Document not uploaded.", errors={"document": "File not found."}, status_code=404)

    safe_path = os.path.abspath(path)
    if not os.path.exists(safe_path):
        safe_path = os.path.abspath(os.path.join(os.getcwd(), path))

    if not os.path.exists(safe_path):
        return error_response(message="Document file missing from server.", errors={"document": "File missing."}, status_code=404)

    if side == "offline" and request.args.get("preview") == "1":
        try:
            share_code = request.args.get("share_code") or kyc.get("offline_ekyc_share_code") or ""
            xml_text = _read_uidai_offline_xml_preview(safe_path, share_code)
        except Exception as exc:
            return error_response(
                message="Unable to preview Offline e-KYC file. Please check the share code.",
                errors={"offline_ekyc": str(exc)},
                status_code=422,
            )
        return Response(xml_text, mimetype="text/xml")

    return send_file(safe_path, as_attachment=(side == "offline"))


@admin_kyc_api.post("/<kyc_id>/approve")
@admin_required
@permission_required("kyc.review")
def approve_kyc(kyc_id):
    db = get_database()
    data = request.get_json(silent=True) or {}
    remark = _clean_text(data.get("remark") or "KYC approved by admin.")
    object_id = to_object_id(kyc_id)

    if not object_id:
        return error_response(message="Invalid KYC ID.", errors={"kyc_id": "Invalid ObjectId."}, status_code=422)

    kyc = db.kyc_requests.find_one({"_id": object_id})
    if not kyc:
        return error_response(message="KYC request not found.", errors={"kyc_id": "Invalid KYC ID."}, status_code=404)

    current_status = normalize_kyc_status(kyc.get("status"))
    if current_status == "approved" and _clean_text(kyc.get("remark")) == remark:
        return error_response(message="KYC is already approved with this remark.", errors={"status": "approved"}, status_code=409)

    # Check for duplicate Aadhaar / PAN before approving
    user_id = kyc.get("user_id")
    aadhaar_num = _clean_text(kyc.get("aadhaar_number") or kyc.get("document_number") or "")
    pan_num = _clean_text(kyc.get("pan_number") or "")
    
    if aadhaar_num:
        duplicate_aadhaar = db.users.find_one({
            "_id": {"$ne": to_object_id(user_id)},
            "aadhaar_number": aadhaar_num,
            "kyc_status": "approved"
        }) or db.kyc_requests.find_one({
            "user_id": {"$ne": str(user_id)},
            "status": "approved",
            "$or": [{"aadhaar_number": aadhaar_num}, {"document_number": aadhaar_num}]
        })
        if duplicate_aadhaar:
            return error_response(
                message="Cannot approve: Another user is already approved with this Aadhaar Card.",
                status_code=400
            )
            
    if pan_num:
        duplicate_pan = db.users.find_one({
            "_id": {"$ne": to_object_id(user_id)},
            "pan_number": pan_num,
            "kyc_status": "approved"
        }) or db.kyc_requests.find_one({
            "user_id": {"$ne": str(user_id)},
            "status": "approved",
            "$or": [{"pan_number": pan_num}, {"document_number": pan_num}]
        })
        if duplicate_pan:
            return error_response(
                message="Cannot approve: Another user is already approved with this PAN Card.",
                status_code=400
            )


    now = now_utc()
    db.kyc_requests.update_one(
        {"_id": object_id},
        {
            "$set": {
                "status": "approved",
                "remark": remark,
                "reject_reason": "",
                "reviewed_by": g.current_admin_id,
                "reviewed_at": now,
                "approved_by": g.current_admin_id,
                "approved_at": now,
                "rejected_by": "",
                "rejected_at": None,
                "updated_at": now,
            }
        },
    )

    user_id = kyc.get("user_id")
    full_name = kyc.get("full_name", "")
    extra_fields = {
        "kyc_verified_at": now,
        "kyc_approved_by": g.current_admin_id,
        "kyc_reject_reason": "",
    }
    if full_name:
        extra_fields.update({
            "name": full_name,
            "full_name": full_name,
            "display_name": full_name,
            "verified_name": full_name,
        })
    _sync_user_kyc_status(
        db,
        user_id,
        "approved",
        extra_fields,
    )

    # Update referral relationship to verified if applicable
    try:
        from services.referral_service import mark_referral_as_verified
        mark_referral_as_verified(str(user_id))
    except Exception as ref_err:
        print(f"Error marking referral as verified for user {user_id}: {ref_err}")


    try:
        user = db.users.find_one({"_id": to_object_id(user_id)})
        if user:
            from services.email_service import send_first_deposit_email, send_kyc_approved_email
            from services.notification_service import create_user_notification
            
            send_kyc_approved_email(user.get("email"), user.get("name") or user.get("username", ""))
            send_first_deposit_email(user.get("email"), user.get("name") or user.get("username", ""))
            create_user_notification(
                user=user,
                title="KYC Approved! Make your first deposit",
                message="Congratulations! Your identity verification has been approved. You can now make your first deposit and start trading.",
                notice_type="kyc_approved",
                severity="success"
            )
    except Exception as approval_err:
        print("Failed to send KYC approval first deposit email/notification:", approval_err)

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="kyc.approved",
        resource_type="kyc",
        resource_id=kyc_id,
        message="KYC approved by admin.",
        metadata={"user_id": user_id, "remark": remark, "previous_status": current_status},
    )

    updated = db.kyc_requests.find_one({"_id": object_id})
    return success_response(message="KYC approved successfully.", data={"kyc": _format_kyc_admin(updated, _load_user(db, user_id))})


@admin_kyc_api.post("/<kyc_id>/reject")
@admin_required
@permission_required("kyc.review")
def reject_kyc(kyc_id):
    db = get_database()
    data = request.get_json(silent=True) or {}
    reason = _clean_text(data.get("reason") or data.get("remark") or "")
    object_id = to_object_id(kyc_id)

    if not reason:
        return error_response(
            message="Reject reason is required.",
            errors={"reason": "Please enter rejection reason."},
            status_code=422,
        )

    if not object_id:
        return error_response(message="Invalid KYC ID.", errors={"kyc_id": "Invalid ObjectId."}, status_code=422)

    kyc = db.kyc_requests.find_one({"_id": object_id})
    if not kyc:
        return error_response(message="KYC request not found.", errors={"kyc_id": "Invalid KYC ID."}, status_code=404)

    current_status = normalize_kyc_status(kyc.get("status"))
    if current_status == "rejected" and _clean_text(kyc.get("remark")) == reason:
        return error_response(message="KYC is already rejected with this reason.", errors={"status": "rejected"}, status_code=409)

    now = now_utc()
    db.kyc_requests.update_one(
        {"_id": object_id},
        {
            "$set": {
                "status": "rejected",
                "remark": reason,
                "reject_reason": reason,
                "reviewed_by": g.current_admin_id,
                "reviewed_at": now,
                "rejected_by": g.current_admin_id,
                "rejected_at": now,
                "approved_by": "",
                "approved_at": None,
                "updated_at": now,
            }
        },
    )

    user_id = kyc.get("user_id")
    _sync_user_kyc_status(
        db,
        user_id,
        "rejected",
        {
            "kyc_reject_reason": reason,
            "kyc_verified_at": None,
            "kyc_rejected_by": g.current_admin_id,
        },
    )

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="kyc.rejected",
        resource_type="kyc",
        resource_id=kyc_id,
        message="KYC rejected by admin.",
        metadata={"user_id": user_id, "reason": reason, "previous_status": current_status},
    )

    updated = db.kyc_requests.find_one({"_id": object_id})
    return success_response(message="KYC rejected successfully.", data={"kyc": _format_kyc_admin(updated, _load_user(db, user_id))})


@admin_kyc_api.get("/<kyc_id>/document/aadhaar")
@admin_required
@permission_required("kyc.view")
def download_aadhaar_pdf(kyc_id):
    db = get_database()
    object_id = to_object_id(kyc_id)
    if not object_id:
        return error_response(message="Invalid KYC ID.", status_code=422)
    kyc = db.kyc_requests.find_one({"_id": object_id})
    if not kyc:
        return error_response(message="KYC request not found.", status_code=404)
        
    path = kyc.get("document_front") or kyc.get("offline_ekyc_file") or ""
    path = _clean_text(path)
    if not path or not path.endswith("aadhaar.pdf") or not os.path.exists(path):
        import services.digio_service as digio_service
        user_id = kyc.get("user_id")
        user = db.users.find_one({"_id": to_object_id(user_id)})
        kid = user.get("digio_request_id") if user else None
        if kid:
            res = digio_service.get_kyc_details(kid)
            if res:
                action = next((a for a in res.get("actions", []) if a.get("type") in ["aadhaar_offline", "digilocker", "aadhaar_verification"]), None)
                if action and action.get("file_id"):
                    path = f"uploads/kyc/{user_id}/aadhaar.pdf"
                    os.makedirs(os.path.dirname(path), exist_ok=True)
                    digio_service.download_kyc_document(kid, action.get("file_id"), path, doc_type="AADHAAR")
                    db.kyc_requests.update_one({"_id": object_id}, {"$set": {"document_front": path, "offline_ekyc_file": path}})
    
    if path and os.path.exists(path):
        return send_file(os.path.abspath(path), mimetype="application/pdf", as_attachment=True, download_name="Aadhaar.pdf")
    return error_response(message="Aadhaar PDF document not available.", status_code=404)


@admin_kyc_api.get("/<kyc_id>/document/pan")
@admin_required
@permission_required("kyc.view")
def download_pan_pdf(kyc_id):
    db = get_database()
    object_id = to_object_id(kyc_id)
    if not object_id:
        return error_response(message="Invalid KYC ID.", status_code=422)
    kyc = db.kyc_requests.find_one({"_id": object_id})
    if not kyc:
        return error_response(message="KYC request not found.", status_code=404)
        
    path = kyc.get("document_back") or ""
    path = _clean_text(path)
    if not path or not path.endswith("pan.pdf") or not os.path.exists(path):
        user_id = kyc.get("user_id")
        possible_path = f"uploads/kyc/{user_id}/pan.pdf"
        if os.path.exists(possible_path):
            path = possible_path
            db.kyc_requests.update_one({"_id": object_id}, {"$set": {"document_back": path}})
        else:
            import services.digio_service as digio_service
            user = db.users.find_one({"_id": to_object_id(user_id)})
            kid = user.get("digio_request_id") if user else None
            if kid:
                res = digio_service.get_kyc_details(kid)
                if res:
                    action = next((a for a in res.get("actions", []) if a.get("type") == "pan"), None)
                    if action and action.get("file_id"):
                        path = possible_path
                        os.makedirs(os.path.dirname(path), exist_ok=True)
                        digio_service.download_kyc_document(kid, action.get("file_id"), path, doc_type="PAN")
                        db.kyc_requests.update_one({"_id": object_id}, {"$set": {"document_back": path}})
                        
    if path and os.path.exists(path):
        return send_file(os.path.abspath(path), mimetype="application/pdf", as_attachment=True, download_name="PAN.pdf")
    return error_response(message="PAN PDF document not available.", status_code=404)


@admin_kyc_api.get("/<kyc_id>/document/dl")
@admin_required
@permission_required("kyc.view")
def download_dl_pdf(kyc_id):
    db = get_database()
    object_id = to_object_id(kyc_id)
    if not object_id:
        return error_response(message="Invalid KYC ID.", status_code=422)
    kyc = db.kyc_requests.find_one({"_id": object_id})
    if not kyc:
        return error_response(message="KYC request not found.", status_code=404)
        
    path = kyc.get("driving_license_file") or ""
    path = _clean_text(path)
    if not path or not path.endswith("dl.pdf") or not os.path.exists(path):
        user_id = kyc.get("user_id")
        possible_path = f"uploads/kyc/{user_id}/dl.pdf"
        if os.path.exists(possible_path):
            path = possible_path
            db.kyc_requests.update_one({"_id": object_id}, {"$set": {"driving_license_file": path}})
        else:
            import services.digio_service as digio_service
            user = db.users.find_one({"_id": to_object_id(user_id)})
            kid = user.get("digio_request_id") if user else None
            if kid:
                res = digio_service.get_kyc_details(kid)
                if res:
                    action = next((a for a in res.get("actions", []) if a.get("type") in ["driving_license", "dl", "driving_license_verification"]), None)
                    if action and action.get("file_id"):
                        path = possible_path
                        os.makedirs(os.path.dirname(path), exist_ok=True)
                        digio_service.download_kyc_document(kid, action.get("file_id"), path)
                        db.kyc_requests.update_one({"_id": object_id}, {"$set": {"driving_license_file": path}})
                        
    if path and os.path.exists(path):
        return send_file(os.path.abspath(path), mimetype="application/pdf", as_attachment=True, download_name="Driving_License.pdf")
    return error_response(message="Driving License PDF document not available.", status_code=404)


@admin_kyc_api.post("/<kyc_id>/fetch-files")
@admin_required
@permission_required("kyc.review")
def fetch_digio_files(kyc_id):
    db = get_database()
    object_id = to_object_id(kyc_id)
    if not object_id:
        return error_response(message="Invalid KYC ID.", status_code=422)
    kyc = db.kyc_requests.find_one({"_id": object_id})
    if not kyc:
        return error_response(message="KYC request not found.", status_code=404)
        
    user_id = kyc.get("user_id")
    user = db.users.find_one({"_id": to_object_id(user_id)})
    kid = user.get("digio_request_id") if user else None
    if not kid:
        return error_response(message="No Digio Request ID associated with this user.", status_code=400)
        
    import services.digio_service as digio_service
    res = digio_service.get_kyc_details(kid)
    if not res:
        return error_response(message="Failed to fetch details from Digio.", status_code=500)
        
    actions = res.get("actions", [])
    aadhaar_file_id = ""
    pan_file_id = ""
    
    for action in actions:
        atype = action.get("type", "").lower()
        astatus = action.get("status", "").lower()
        if astatus in ["success", "approved", "done"]:
            if atype in ["aadhaar_offline", "digilocker", "aadhaar_verification"]:
                aadhaar_file_id = action.get("file_id") or action.get("execution_request_id") or ""
            elif atype in ["pan", "pan_verification", "generic"]:
                pan_file_id = action.get("file_id") or action.get("execution_request_id") or ""
                
    os.makedirs(f"uploads/kyc/{user_id}", exist_ok=True)
    
    aadhaar_path = f"uploads/kyc/{user_id}/aadhaar.pdf"
    if aadhaar_file_id:
        digio_service.download_kyc_document(kid, aadhaar_file_id, aadhaar_path, doc_type="AADHAAR")
        
    pan_path = f"uploads/kyc/{user_id}/pan.pdf"
    if pan_file_id:
        digio_service.download_kyc_document(kid, pan_file_id, pan_path, doc_type="PAN")
        
    db.kyc_requests.update_one(
        {"_id": object_id},
        {"$set": {
            "document_front": aadhaar_path,
            "document_back": pan_path,
            "offline_ekyc_file": aadhaar_path
        }}
    )
    
    updated = db.kyc_requests.find_one({"_id": object_id})
    return success_response(message="Digio files fetched successfully.", data={"kyc": _format_kyc_admin(updated, user)})


@admin_kyc_api.delete("/<kyc_id>")
@admin_required
@permission_required("kyc.review")
def delete_kyc(kyc_id):
    db = get_database()
    object_id = to_object_id(kyc_id)
    if not object_id:
        return error_response(message="Invalid KYC ID.", status_code=422)
    kyc = db.kyc_requests.find_one({"_id": object_id})
    if not kyc:
        return error_response(message="KYC request not found.", status_code=404)
        
    user_id = kyc.get("user_id")
    
    db.kyc_requests.delete_one({"_id": object_id})
    
    db.users.update_one(
        {"_id": to_object_id(user_id)},
        {"$set": {
            "kyc_status": "pending",
            "kyc_status_label": kyc_status_label("pending"),
            "kyc_status_updated_at": now_utc(),
            "kyc_verified_at": None,
            "kyc_mobile_verified": False,
            "kyc_mobile_verified_number": "",
            "digio_request_id": "",
            "name": "",
            "dob": "",
            "address": "",
            "pan_number": "",
            "aadhaar_number": "",
            "kyc_photo": "",
            "face_match_score": 0.0,
            "updated_at": now_utc()
        },
        "$unset": {
            "kyc_draft_aadhaar_number": "",
            "kyc_draft_document_front": "",
            "kyc_draft_document_back": "",
            "kyc_draft_ocr_result": "",
            "kyc_draft_full_name": "",
            "kyc_documents_verified": "",
            "kyc_documents_verified_at": "",
            "kyc_progress_step": "",
        }}
    )
    
    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="kyc.deleted",
        resource_type="kyc",
        resource_id=kyc_id,
        message="KYC deleted/reset by admin.",
        metadata={"user_id": user_id},
    )
    
    return success_response(message="KYC deleted and user state reset successfully.")

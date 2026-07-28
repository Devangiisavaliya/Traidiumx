from bson import ObjectId
import os

from flask import Blueprint, g, request

from middleware.auth_middleware import auth_required
from config.database import get_database
from config.settings import settings
from services.kyc_service import (
    get_kyc_status,
    save_kyc_aadhaar_number,
    scan_kyc_for_user,
    submit_kyc,
    send_kyc_mobile_otp,
    verify_kyc_aadhaar_documents,
    verify_kyc_mobile_otp,
)
from services.kyc_status_service import kyc_status_label
import services.digio_service as digio_service
from models.kyc_model import create_or_update_kyc
from utils.date_helper import now_utc
from utils.response import success_response, error_response


kyc_api = Blueprint("kyc_api", __name__, url_prefix="/api/kyc")


KYC_POLICY_VERSION = "KYC-AML-v1.0"


def _to_object_id(value):
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def _format_datetime(value):
    if not value:
        return ""

    if hasattr(value, "isoformat"):
        return value.isoformat()

    return str(value)


def _policy_payload(user=None):
    user = user or {}

    return {
        "policy_version": user.get("kyc_policy_version") or KYC_POLICY_VERSION,
        "acknowledged": bool(user.get("kyc_policy_acknowledged")),
        "acknowledged_at": _format_datetime(user.get("kyc_policy_acknowledged_at")),
    }


@kyc_api.post("/save-aadhaar-number")
@auth_required
def save_aadhaar_number():
    data = request.get_json(silent=True) or {}
    aadhaar_number = data.get("aadhaar_number") or request.form.get("aadhaar_number") or ""
    document_type = data.get("document_type") or request.form.get("document_type") or "aadhaar_card"
    result = save_kyc_aadhaar_number(g.current_user_id, aadhaar_number, document_type)
    if result["success"]:
        return success_response(
            message=result["message"],
            data=result.get("data", {}),
            status_code=result["status_code"],
        )
    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"],
    )


@kyc_api.post("/verify-documents")
@auth_required
def verify_documents():
    result = verify_kyc_aadhaar_documents(g.current_user_id, request.files)
    if result["success"]:
        return success_response(
            message=result["message"],
            data=result.get("data", {}),
            status_code=result["status_code"],
        )
    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"],
    )


@kyc_api.post("/submit")
@auth_required
def submit():
    result = submit_kyc(
        user_id=g.current_user_id,
        form_data=request.form,
        files=request.files
    )

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result["errors"],
        status_code=result["status_code"]
    )


@kyc_api.post("/scan")
@auth_required
def scan():
    result = scan_kyc_for_user(
        form_data=request.form,
        files=request.files
    )

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result.get("data", {}),
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"]
    )


@kyc_api.post("/send-otp")
@auth_required
def send_otp():
    data = request.get_json(silent=True) or {}
    mobile = data.get("mobile") or request.form.get("mobile") or ""
    
    result = send_kyc_mobile_otp(g.current_user_id, mobile)
    if result["success"]:
        return success_response(
            message=result["message"],
            data=result.get("data", {}),
            status_code=result["status_code"]
        )
    return error_response(
        message=result["message"],
        errors={"mobile": result["message"]},
        status_code=result["status_code"]
    )


@kyc_api.post("/verify-otp")
@auth_required
def verify_otp():
    data = request.get_json(silent=True) or {}
    mobile = data.get("mobile") or request.form.get("mobile") or ""
    otp = data.get("otp") or request.form.get("otp") or ""
    
    result = verify_kyc_mobile_otp(g.current_user_id, mobile, otp)
    if result["success"]:
        return success_response(
            message=result["message"],
            data=result.get("data", {}),
            status_code=result["status_code"]
        )
    return error_response(
        message=result["message"],
        errors={"otp": result["message"]},
        status_code=result["status_code"]
    )



@kyc_api.post("/extract")
@auth_required
def extract():
    file = request.files.get("offline_ekyc_file") or request.files.get("aadhaar_offline_file")
    share_code = request.form.get("share_code") or request.form.get("offline_share_code") or ""

    if not file or file.filename == "":
        return error_response(
            message="ZIP/XML file is required.",
            errors={"offline_ekyc_file": "ZIP/XML file is required."},
            status_code=422
        )
    if not share_code:
        return error_response(
            message="Share code is required.",
            errors={"share_code": "Share code is required."},
            status_code=422
        )

    from services.kyc_offline_ekyc_service import _read_offline_ekyc_xml, _parse_offline_ekyc_xml
    try:
        xml_text, read_error = _read_offline_ekyc_xml(file, share_code)
        if read_error:
            return error_response(
                message=read_error,
                errors={"offline_ekyc_file": read_error},
                status_code=422
            )

        details, parse_error = _parse_offline_ekyc_xml(xml_text)
        if parse_error:
            return error_response(
                message=parse_error,
                errors={"offline_ekyc_file": parse_error},
                status_code=422
            )

        return success_response(
            message="Details extracted successfully.",
            data={
                "name": details.get("name", ""),
                "reference_id_masked": details.get("aadhaar_uid_masked", "") or details.get("reference_id_masked", "")
            },
            status_code=200
        )
    except Exception as exc:
        return error_response(
            message=f"Extraction failed: {str(exc)}",
            errors={"offline_ekyc_file": str(exc)},
            status_code=500
        )


@kyc_api.get("/status")
@auth_required
def status():
    result = get_kyc_status(g.current_user_id)
    
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 1))
        local_ip = s.getsockname()[0]
    except Exception:
        local_ip = '127.0.0.1'
    finally:
        s.close()
        
    if "data" not in result:
        result["data"] = {}
    result["data"]["local_ip"] = local_ip
    result["data"]["server_port"] = request.host.split(':')[-1] if ':' in request.host else '5000'

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )


@kyc_api.get("/policy/status")
@auth_required
def policy_status():
    user_object_id = _to_object_id(g.current_user_id)

    if not user_object_id:
        return error_response(
            message="Invalid user session.",
            errors={"user": "Unable to resolve logged-in user."},
            status_code=401
        )

    db = get_database()
    user = db.users.find_one({"_id": user_object_id}) or {}

    return success_response(
        message="KYC-AML policy acknowledgement status fetched successfully.",
        data=_policy_payload(user),
        status_code=200
    )


@kyc_api.post("/policy/acknowledge")
@auth_required
def acknowledge_policy():
    data = request.get_json(silent=True) or {}

    if data.get("acknowledged") is False:
        return error_response(
            message="Please acknowledge the KYC-AML policy before saving.",
            errors={"acknowledged": "Acknowledgement is required."},
            status_code=422
        )

    user_object_id = _to_object_id(g.current_user_id)

    if not user_object_id:
        return error_response(
            message="Invalid user session.",
            errors={"user": "Unable to resolve logged-in user."},
            status_code=401
        )

    acknowledged_at = now_utc()
    update_data = {
        "kyc_policy_acknowledged": True,
        "kyc_policy_acknowledged_at": acknowledged_at,
        "kyc_policy_version": KYC_POLICY_VERSION,
        "updated_at": acknowledged_at,
    }

    db = get_database()
    db.users.update_one(
        {"_id": user_object_id},
        {"$set": update_data}
    )

    return success_response(
        message="KYC-AML policy acknowledged successfully.",
        data={
            "policy_version": KYC_POLICY_VERSION,
            "acknowledged": True,
            "acknowledged_at": _format_datetime(acknowledged_at),
        },
        status_code=200
    )


@kyc_api.post("/start-digio")
@auth_required
def start_digio():
    db = get_database()
    user_id = ObjectId(g.current_user_id)
    user = db.users.find_one({"_id": user_id})
    if not user:
        return error_response(message="User not found.", status_code=404)
    if not user.get("kyc_mobile_verified"):
        return error_response(message="Please verify your mobile number first.", status_code=400)
    identifier = user.get("email") or user.get("mobile")
    res = digio_service.create_kyc_request(identifier)
    if not res or not res.get("id"):
        err = res.get("error") if res else "Unknown error"
        return error_response(message="Failed to start Digio KYC session.", errors={"digio": err}, status_code=500)
    
    kid = res.get("id")
    access_token_id = res.get("access_token", {}).get("id")
    
    db.users.update_one(
        {"_id": user_id},
        {"$set": {
            "digio_request_id": kid,
            "kyc_status": "under_review",
            "updated_at": now_utc()
        }}
    )
    return success_response(
        message="Digio session started.",
        data={
            "kid": kid,
            "access_token": access_token_id,
            "environment": settings.DIGIO_ENVIRONMENT,
            "customer_identifier": identifier
        }
    )


@kyc_api.post("/complete-digio")
@auth_required
def complete_digio():
    db = get_database()
    user_id = ObjectId(g.current_user_id)
    user = db.users.find_one({"_id": user_id})
    if not user:
        return error_response(message="User not found.", status_code=404)
    
    kid = user.get("digio_request_id")
    if not kid:
        return error_response(message="No active Digio KYC session found.", status_code=400)
    
    res = digio_service.get_kyc_details(kid)
    if not res:
        return error_response(message="Failed to fetch details from Digio.", status_code=400)
        
    actions = res.get("actions", [])
    has_aadhaar = False
    has_pan = False
    
    for a in actions:
        atype = a.get("type", "").lower()
        adetails = a.get("details", {}) or {}
        if atype == "digilocker":
            if "aadhaar" in adetails:
                has_aadhaar = True
            if "pan" in adetails:
                has_pan = True
        elif atype in ["aadhaar_offline", "aadhaar_verification"]:
            has_aadhaar = True
        elif atype in ["pan", "pan_verification", "generic"]:
            has_pan = True
            
    if not (has_aadhaar and has_pan):
        status = res.get("status") if res else "unknown"
        return error_response(message=f"Aadhaar and PAN verification must be completed first. Status: {status}", status_code=400)
    
    # Extract details
    extracted_name = ""
    dob = ""
    address = ""
    pan = ""
    aadhaar_masked = ""
    dl_number = ""
    face_match_score = 100.0
    liveness_status = "success"
    
    aadhaar_file_id = ""
    pan_file_id = ""
    selfie_file_id = ""
    dl_file_id = ""
    
    for action in actions:
        atype = action.get("type", "").lower()
        astatus = action.get("status", "").lower()
        adetails = action.get("details", {}) or {}
        
        if atype == "digilocker":
            aadhaar_data = adetails.get("aadhaar", {}) or {}
            pan_data = adetails.get("pan", {}) or {}
            dl_data = adetails.get("driving_license", {}) or adetails.get("dl", {}) or {}
            
            if aadhaar_data:
                extracted_name = aadhaar_data.get("name") or extracted_name
                dob = aadhaar_data.get("dob") or dob
                address = aadhaar_data.get("current_address") or aadhaar_data.get("permanent_address") or address
                aadhaar_masked = aadhaar_data.get("id_number") or aadhaar_masked
                aadhaar_file_id = action.get("file_id") or action.get("execution_request_id") or ""
                
            if pan_data:
                pan = pan_data.get("id_number") or pan
                if not extracted_name:
                    extracted_name = pan_data.get("name") or extracted_name
                if not dob:
                    dob = pan_data.get("dob") or dob
                pan_file_id = action.get("file_id") or action.get("execution_request_id") or ""
                
            if dl_data:
                dl_number = dl_data.get("id_number") or dl_data.get("dl_number") or ""
                dl_file_id = action.get("file_id") or action.get("execution_request_id") or ""
                
        else:
            if astatus not in ["success", "approved", "done"]:
                continue
                
            if atype in ["aadhaar_offline", "aadhaar_verification"]:
                extracted_name = adetails.get("name") or adetails.get("full_name") or extracted_name
                dob = adetails.get("dob") or adetails.get("date_of_birth") or dob
                
                addr = adetails.get("address")
                if addr:
                    if isinstance(addr, dict):
                        parts = []
                        for k in ["house", "street", "loc", "po", "dist", "state", "pc"]:
                            if addr.get(k):
                                parts.append(str(addr.get(k)))
                        address = ", ".join(parts)
                    else:
                        address = str(addr)
                        
                aadhaar_masked = adetails.get("aadhaar_number") or adetails.get("masked_aadhaar") or adetails.get("reference_id") or aadhaar_masked
                aadhaar_file_id = action.get("file_id") or action.get("execution_request_id") or ""
                
            elif atype in ["pan", "pan_verification", "generic"]:
                pan = adetails.get("pan_number") or adetails.get("pan_no") or pan
                if not extracted_name:
                    extracted_name = adetails.get("name") or extracted_name
                if not dob:
                    dob = adetails.get("dob") or dob
                pan_file_id = action.get("file_id") or action.get("execution_request_id") or ""
                
            elif atype in ["driving_license", "dl", "driving_license_verification"]:
                dl_number = adetails.get("dl_number") or adetails.get("driving_license_number") or adetails.get("document_number") or ""
                dl_file_id = action.get("file_id") or action.get("execution_request_id") or ""
                
            elif atype in ["selfie", "image"]:
                face_match_score = float(adetails.get("face_match_score") or adetails.get("match_score") or 100.0)
                liveness_status = adetails.get("liveness_status") or ("success" if adetails.get("liveness") is True else "failed")
                selfie_file_id = action.get("file_id") or ""
            
    # Check for duplicate Aadhaar / PAN
    if aadhaar_masked:
        duplicate_aadhaar = db.users.find_one({
            "_id": {"$ne": user_id},
            "aadhaar_number": aadhaar_masked,
            "kyc_status": "approved"
        })
        if duplicate_aadhaar:
            return error_response(
                message="This Aadhaar Card is already registered with another approved account.",
                status_code=400
            )
            
    if pan:
        duplicate_pan = db.users.find_one({
            "_id": {"$ne": user_id},
            "pan_number": pan,
            "kyc_status": "approved"
        })
        if duplicate_pan:
            return error_response(
                message="This PAN Card is already registered with another approved account.",
                status_code=400
            )

    # Download files
    os.makedirs(f"uploads/kyc/{str(user_id)}", exist_ok=True)
    
    aadhaar_path = ""
    if aadhaar_file_id:
        aadhaar_path = f"uploads/kyc/{str(user_id)}/aadhaar.pdf"
        digio_service.download_kyc_document(kid, aadhaar_file_id, aadhaar_path, doc_type="AADHAAR")
        
    pan_path = ""
    if pan_file_id:
        pan_path = f"uploads/kyc/{str(user_id)}/pan.pdf"
        digio_service.download_kyc_document(kid, pan_file_id, pan_path, doc_type="PAN")
        
    selfie_path = ""
    if selfie_file_id:
        selfie_path = f"uploads/kyc/{str(user_id)}/selfie.jpg"
        digio_service.download_kyc_document(kid, selfie_file_id, selfie_path)
        
    dl_path = ""
    if dl_file_id:
        dl_path = f"uploads/kyc/{str(user_id)}/dl.pdf"
        digio_service.download_kyc_document(kid, dl_file_id, dl_path)
        
    # Update User document
    now = now_utc()
    user_update = {
        "kyc_status": "not_submitted",
        "kyc_status_label": kyc_status_label("not_submitted"),
        "kyc_status_updated_at": now,
        "kyc_draft_aadhaar_number": aadhaar_masked,
        "kyc_draft_pan_number": pan,
        "kyc_draft_driving_license_number": dl_number,
        "kyc_draft_full_name": extracted_name or user.get("name"),
        "kyc_draft_dob": dob,
        "kyc_draft_address": address,
        "kyc_draft_document_front": aadhaar_path,
        "kyc_draft_document_back": pan_path,
        "kyc_digio_completed": True,
        "kyc_progress_step": 3,
        "updated_at": now
    }
    db.users.update_one({"_id": user_id}, {"$set": user_update})
    
    updated_user = db.users.find_one({"_id": user_id})
    return success_response(
        message="DigiLocker details saved successfully. Please complete the selfie verification.",
        data={
            "kyc_status": "not_submitted",
            "current_step": 3,
            "step_states": {
                "1": "verified",
                "2": "verified",
                "3": "current"
            },
            "name": updated_user.get("name"),
            "aadhaar_number": updated_user.get("kyc_draft_aadhaar_number"),
            "pan_number": updated_user.get("kyc_draft_pan_number")
        }
    )

import random
import string
import datetime

@kyc_api.post("/short-code")
@auth_required
def create_short_code():
    db = get_database()
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.split(" ")[1] if " " in auth_header else auth_header
    
    code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    
    db.kyc_short_codes.update_one(
        {"user_id": str(g.current_user_id)},
        {"$set": {
            "code": code,
            "token": token,
            "expires_at": datetime.datetime.utcnow() + datetime.timedelta(minutes=10)
        }},
        upsert=True
    )
    
    return success_response(
        message="Short code generated successfully.",
        data={"code": code}
    )

@kyc_api.get("/resolve-code/<code>")
def resolve_short_code(code):
    db = get_database()
    record = db.kyc_short_codes.find_one({"code": code.upper()})
    
    if not record:
        return error_response(
            message="Invalid or expired session code.",
            errors={"code": "Session code not found."},
            status_code=404
        )
        
    expires_at = record.get("expires_at")
    if expires_at and expires_at < datetime.datetime.utcnow():
        return error_response(
            message="Session code has expired.",
            errors={"code": "Expired session code."},
            status_code=410
        )
        
    return success_response(
        message="Session code resolved successfully.",
        data={"token": record.get("token")}
    )

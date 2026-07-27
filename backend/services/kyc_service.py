from bson import ObjectId

from models.kyc_model import create_or_update_kyc, find_kyc_by_user_id, format_kyc
from models.user_model import get_users_collection
from services.kyc_ocr_service import scan_kyc_documents
from services.kyc_offline_ekyc_service import verify_offline_aadhaar_ekyc
from services.kyc_status_service import get_user_kyc_state, kyc_status_label, kyc_status_message, normalize_kyc_status
from utils.date_helper import now_utc
from utils.file_helper import save_kyc_file
from werkzeug.utils import secure_filename
from config.settings import settings
import os
import uuid
import re
from utils.security import sanitize_text
from utils.validators import (
    clean_document_number,
    clean_string,
    document_number_label,
    validate_document_type,
    validate_kyc_document_number,
    validate_name,
)


KYC_VERIFICATION_METHODS = {"aadhaar_offline_ekyc"}
OFFLINE_EKYC_EXTENSIONS = {"zip", "xml"}


def _normalize_verification_method(value):
    """KYC page now supports only UIDAI Aadhaar Offline e-KYC."""
    return "aadhaar_offline_ekyc"



def _user_object_id(user_id):
    try:
        return ObjectId(str(user_id))
    except Exception:
        return None


def _sync_user_kyc_status(user_id, status, extra=None):
    user_object_id = _user_object_id(user_id)
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
        }

    get_users_collection().update_one({"_id": user_object_id}, update_op)


def _collect_basic_kyc_input(form_data, files):
    full_name = sanitize_text(clean_string(form_data.get("full_name"))).upper()
    document_type = clean_string(form_data.get("document_type")).lower()
    raw_document_number = form_data.get("document_number") or form_data.get("pan_number") or ""
    document_number = clean_document_number(document_type, raw_document_number)

    errors = {}

    is_valid_name, name_error = validate_name(full_name.title())
    if not is_valid_name:
        errors["full_name"] = name_error

    is_valid_document_type, document_type_error = validate_document_type(document_type)
    if not is_valid_document_type:
        errors["document_type"] = document_type_error

    if is_valid_document_type:
        is_valid_number, number_error = validate_kyc_document_number(document_type, document_number)
        if not is_valid_number:
            errors["document_number"] = number_error
    else:
        errors["document_number"] = "Select a valid document type before entering document number."

    document_front = files.get("document_front")
    document_back = files.get("document_back")

    if not document_front or document_front.filename == "":
        errors["document_front"] = "Document front file is required."

    if not document_back or document_back.filename == "":
        errors["document_back"] = "Document back file is required for OCR KYC. Upload the back side also."

    return errors, {
        "verification_method": "ocr_document",
        "full_name": full_name,
        "document_type": document_type,
        "document_number": document_number,
        "document_front": document_front,
        "document_back": document_back,
    }


def _collect_offline_ekyc_input(form_data, files):
    full_name = sanitize_text(clean_string(form_data.get("full_name"))).upper()
    share_code = clean_string(form_data.get("share_code") or form_data.get("offline_share_code") or "")
    offline_file = files.get("offline_ekyc_file") or files.get("aadhaar_offline_file")
    errors = {}

    is_valid_name, name_error = validate_name(full_name.title())
    if not is_valid_name:
        errors["full_name"] = name_error

    if len(share_code) < 4 or len(share_code) > 12 or not re.match(r"^[A-Za-z0-9]+$", share_code):
        errors["share_code"] = "Share code must be 4-12 letters/numbers."

    if not offline_file or offline_file.filename == "":
        errors["offline_ekyc_file"] = "Aadhaar Offline e-KYC ZIP/XML file is required."
    else:
        extension = offline_file.filename.rsplit(".", 1)[-1].lower() if "." in offline_file.filename else ""
        if extension not in OFFLINE_EKYC_EXTENSIONS:
            errors["offline_ekyc_file"] = "Upload only UIDAI Offline e-KYC ZIP or XML file."

    return errors, {
        "verification_method": "aadhaar_offline_ekyc",
        "full_name": full_name,
        "document_type": "aadhaar_card",
        "document_number": "",
        "share_code": share_code,
        "offline_ekyc_file": offline_file,
        "document_front": None,
        "document_back": None,
    }


def _seek_offline_file(cleaned):
    offline_file = cleaned.get("offline_ekyc_file")
    if offline_file:
        try:
            offline_file.stream.seek(0)
        except Exception:
            pass


def _save_offline_ekyc_file(user_id, cleaned):
    _seek_offline_file(cleaned)
    offline_file = cleaned.get("offline_ekyc_file")
    if not offline_file or offline_file.filename == "":
        return None, {
            "success": False,
            "message": "File upload failed.",
            "errors": {"offline_ekyc_file": "Aadhaar Offline e-KYC file is required."},
            "status_code": 422,
        }

    extension = offline_file.filename.rsplit(".", 1)[-1].lower() if "." in offline_file.filename else ""
    if extension not in OFFLINE_EKYC_EXTENSIONS:
        return None, {
            "success": False,
            "message": "File upload failed.",
            "errors": {"offline_ekyc_file": "Upload only UIDAI Offline e-KYC ZIP or XML file."},
            "status_code": 422,
        }

    user_folder = os.path.join(settings.KYC_UPLOAD_FOLDER, str(user_id))
    os.makedirs(user_folder, exist_ok=True)
    original_filename = secure_filename(offline_file.filename)
    new_filename = f"offline_ekyc_{uuid.uuid4().hex}.{extension}"
    file_path = os.path.join(user_folder, new_filename)
    offline_file.save(file_path)
    return {"offline_ekyc_path": file_path.replace("\\", "/")}, None


def _duplicate_offline_ekyc_reference(user_id, reference_id):
    reference_id = clean_string(reference_id)
    if not reference_id:
        return False
    existing = find_kyc_by_user_id(user_id)
    db_query = {
        "user_id": {"$ne": str(user_id)},
        "offline_ekyc_reference_id": reference_id,
        "status": "approved",
    }
    from config.database import get_database
    db = get_database()
    return bool(db.kyc_requests.find_one(db_query))



def _seek_uploaded_files(cleaned):
    if cleaned.get("document_front"):
        try:
            cleaned["document_front"].stream.seek(0)
        except Exception:
            pass
    if cleaned.get("document_back"):
        try:
            cleaned["document_back"].stream.seek(0)
        except Exception:
            pass
    if cleaned.get("selfie"):
        try:
            cleaned["selfie"].stream.seek(0)
        except Exception:
            pass


def _save_uploaded_kyc_files(user_id, cleaned):
    _seek_uploaded_files(cleaned)
    front_result = save_kyc_file(cleaned["document_front"], user_id, "front")
    if not front_result["success"]:
        return None, {
            "success": False,
            "message": "File upload failed.",
            "errors": {"document_front": front_result["error"]},
            "status_code": 422,
        }

    back_path = ""
    if cleaned.get("document_back") and cleaned["document_back"].filename != "":
        back_result = save_kyc_file(cleaned["document_back"], user_id, "back")
        if not back_result["success"]:
            return None, {
                "success": False,
                "message": "File upload failed.",
                "errors": {"document_back": back_result["error"]},
                "status_code": 422,
            }
        back_path = back_result["path"]

    selfie_path = ""
    if cleaned.get("selfie") and cleaned["selfie"].filename != "":
        selfie_result = save_kyc_file(cleaned["selfie"], user_id, "selfie")
        if not selfie_result["success"]:
            return None, {
                "success": False,
                "message": "Selfie file upload failed.",
                "errors": {"selfie": selfie_result["error"]},
                "status_code": 422,
            }
        selfie_path = selfie_result["path"]

    return {"front_path": front_result["path"], "back_path": back_path, "selfie_path": selfie_path}, None



def _build_kyc_payload(cleaned, file_paths, scan_data, status, remark):
    document_type = cleaned["document_type"]
    document_number = cleaned["document_number"]
    status = normalize_kyc_status(status)
    now = now_utc()

    verification_method = clean_string(cleaned.get("verification_method") or "ocr_document").lower()
    display_document_number = scan_data.get("document_number") or scan_data.get("reference_id_masked") or document_number

    payload = {
        "status": status,
        "verification_method": verification_method,
        "full_name": cleaned["full_name"],
        "document_type": document_type,
        "document_number": display_document_number,
        "document_number_label": scan_data.get("document_number_label") or ("Aadhaar Card Number" if verification_method == "ocr_document" else "UIDAI Masked Aadhaar / Reference"),
        # Backward compatibility for existing admin/user table fields.
        "pan_number": display_document_number if document_type == "pan_card" and verification_method != "aadhaar_offline_ekyc" else "",
        "aadhaar_number": display_document_number if document_type == "aadhaar_card" else "",
        "passport_number": document_number if document_type == "passport" else "",
        "driving_license_number": document_number if document_type == "driving_license" else "",
        "document_front": file_paths.get("front_path", ""),
        "document_back": file_paths.get("back_path", ""),
        "selfie": file_paths.get("selfie_path", ""),

        "offline_ekyc_file": file_paths.get("offline_ekyc_path", ""),
        "offline_ekyc_original_filename": file_paths.get("offline_ekyc_original_filename", ""),
        "offline_ekyc_share_code": cleaned.get("share_code", ""),
        "offline_ekyc_reference_id": scan_data.get("reference_id_hash_source", ""),
        "offline_ekyc_reference_masked": scan_data.get("aadhaar_uid_masked") or scan_data.get("reference_id_masked", ""),
        "ocr_status": "passed" if status in {"approved", "pending"} else "failed",
        "ocr_score": int(scan_data.get("score", 0) or 0),
        "risk_score": int(scan_data.get("score", 0) or 0),
        "ocr_result": scan_data,
        "remark": remark,
        "reject_reason": remark if status == "rejected" else "",
        "reviewed_by": "system_ocr",
        "reviewed_at": now,
        "approved_by": "system_ocr" if status == "approved" else "",
        "approved_at": now if status == "approved" else None,
        "rejected_by": "system_ocr" if status == "rejected" else "",
        "rejected_at": now if status == "rejected" else None,
        "auto_decision": True,
        "decision_source": verification_method,
    }
    return payload


def _sync_after_decision(user_id, status, remark=""):
    if status == "approved":
        _sync_user_kyc_status(
            user_id,
            "approved",
            {
                "kyc_reject_reason": "",
                "kyc_verified_at": now_utc(),
            },
        )
    elif status == "rejected":
        _sync_user_kyc_status(
            user_id,
            "rejected",
            {
                "kyc_reject_reason": remark,
                "kyc_verified_at": None,
            },
        )
    else:
        _sync_user_kyc_status(
            user_id,
            status,
            {
                "kyc_reject_reason": "",
                "kyc_verified_at": None,
            },
        )


def scan_kyc_for_user(form_data, files):
    """Preview UIDAI Aadhaar Offline e-KYC verification only."""
    errors, cleaned = _collect_offline_ekyc_input(form_data, files)
    if errors:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": errors,
            "status_code": 422,
        }
    _seek_offline_file(cleaned)
    return verify_offline_aadhaar_ekyc(
        full_name=cleaned["full_name"],
        offline_file=cleaned["offline_ekyc_file"],
        share_code=cleaned["share_code"],
    )


def _validate_selfie_image(selfie_file_storage):
    """Reject non-selfie uploads and require one clear, reasonably close face."""
    try:
        import cv2
        import numpy as np
    except Exception as exc:
        print("Selfie validation dependency error:", exc)
        return "Selfie validation is unavailable on the server. Install OpenCV and try again."

    if not selfie_file_storage or not selfie_file_storage.filename:
        return "Selfie image is required."

    filename = secure_filename(selfie_file_storage.filename or "").lower()
    extension = filename.rsplit(".", 1)[-1] if "." in filename else ""
    allowed_extensions = {"jpg", "jpeg", "png", "webp"}
    allowed_mime_types = {"image/jpeg", "image/jpg", "image/png", "image/webp", "application/octet-stream", ""}

    if extension not in allowed_extensions:
        return "Upload a selfie in JPG, JPEG, PNG or WEBP format only."

    content_type = str(getattr(selfie_file_storage, "mimetype", "") or "").lower()
    if content_type not in allowed_mime_types:
        return "The selected file is not a supported selfie image."

    try:
        selfie_file_storage.stream.seek(0)
        raw_bytes = selfie_file_storage.stream.read()
        selfie_file_storage.stream.seek(0)

        if not raw_bytes:
            return "The selfie file is empty. Please choose another photo."
        if len(raw_bytes) > 10 * 1024 * 1024:
            return "The selfie file is too large. Maximum size is 10 MB."

        file_bytes = np.frombuffer(raw_bytes, np.uint8)
        image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        if image is None:
            return "Unable to read this image. Please upload a valid selfie photo."

        img_h, img_w = image.shape[:2]
        if img_h < 240 or img_w < 240:
            return "The selfie resolution is too low. Use an image of at least 240 x 240 pixels."

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        average_brightness = float(gray.mean())
        if average_brightness < 35:
            return "The selfie is too dark. Please upload a brighter, clearly visible face photo."
        if average_brightness > 225:
            return "The selfie is overexposed. Please upload a clearer face photo."

        sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        if sharpness < 18:
            return "The selfie is too blurry. Please upload a clear photo focused on your face."

        yunet_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "utils",
            "face_detection_yunet_2023mar.onnx",
        )
        dnn_verified = False
        if os.path.exists(yunet_path):
            try:
                # Set input size for YN
                detector = cv2.FaceDetectorYN.create(yunet_path, "", (img_w, img_h))
                _, faces = detector.detect(image)
                
                if faces is None or len(faces) == 0:
                    return "No clear face was detected. Upload a proper front-facing selfie, not a document, object or scenery photo."
                if len(faces) > 1:
                    return "Only one person is allowed in the selfie. Please upload a photo containing only your face."
                
                # Check face size and position
                x, y, w, h = [int(value) for value in faces[0][:4]]
                face_area_ratio = (w * h) / float(img_w * img_h)
                
                if face_area_ratio < 0.02 or (w / img_w) < 0.12 or (h / img_h) < 0.12:
                    return "The face is too small. Please take a closer selfie with your face clearly visible."
                if face_area_ratio > 0.85:
                    return "The face is too close to the camera. Keep your full face visible inside the frame."
                
                face_center_x = x + (w / 2)
                face_center_y = y + (h / 2)
                if not (img_w * 0.15 <= face_center_x <= img_w * 0.85 and img_h * 0.12 <= face_center_y <= img_h * 0.88):
                    return "Keep your face near the center of the selfie and upload again."
                
                dnn_verified = True
            except Exception as dnn_exc:
                print("DNN Face Detector error, falling back:", dnn_exc)

        if not dnn_verified:
            cascade_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                "utils",
                "haarcascade_frontalface_default.xml",
            )
            if not os.path.exists(cascade_path):
                return "Selfie face detector is missing on the server."
 
            if hasattr(cv2, "CascadeClassifier"):
                face_cascade = cv2.CascadeClassifier(cascade_path)
                if face_cascade.empty():
                    return "Selfie face detector could not be loaded on the server."
 
                min_face = max(60, int(min(img_h, img_w) * 0.12))
                faces = face_cascade.detectMultiScale(
                    gray,
                    scaleFactor=1.08,
                    minNeighbors=5,
                    minSize=(min_face, min_face),
                )
 
                if len(faces) == 0:
                    return "No clear face was detected. Upload a proper front-facing selfie, not a document, object or scenery photo."
                if len(faces) > 1:
                    return "Only one person is allowed in the selfie. Please upload a photo containing only your face."
 
                x, y, w, h = [int(value) for value in faces[0]]
                face_area_ratio = (w * h) / float(img_w * img_h)
                if face_area_ratio < 0.035 or (w / img_w) < 0.16 or (h / img_h) < 0.16:
                    return "The face is too small. Please take a closer selfie with your face clearly visible."
                if face_area_ratio > 0.72:
                    return "The face is too close to the camera. Keep your full face visible inside the frame."
 
                face_center_x = x + (w / 2)
                face_center_y = y + (h / 2)
                if not (img_w * 0.18 <= face_center_x <= img_w * 0.82 and img_h * 0.16 <= face_center_y <= img_h * 0.84):
                    return "Keep your face near the center of the selfie and upload again."
            else:
                return "Selfie verification is unavailable because face detector models are missing on this server."

        from services.kyc_ocr_service import _extract_text_from_filestorage

        selfie_file_storage.stream.seek(0)
        selfie_text, _ = _extract_text_from_filestorage(selfie_file_storage)
        selfie_file_storage.stream.seek(0)
        selfie_lower = str(selfie_text or "").lower()
        document_keywords = {
            "government of india", "unique identification", "uidai", "aadhaar",
            "date of birth", "permanent account", "income tax", "passport",
            "address", "signature",
        }
        if any(keyword in selfie_lower for keyword in document_keywords):
            return "This looks like a document photo, not a selfie. Upload a real photo containing only your face."

        return None
    except Exception as exc:
        print("Selfie face detection error:", exc)
        try:
            selfie_file_storage.stream.seek(0)
        except Exception:
            pass
        return "Unable to validate this selfie. Please upload a clear JPG, PNG or WEBP face photo."



def _extract_verified_aadhaar_name(front_text, email=""):
    """Pick the most reliable Latin-script name from the Aadhaar front OCR."""
    from collections import Counter
    from services.kyc_ocr_service import extract_name_from_aadhaar_ocr

    raw_lines = [re.sub(r"\s+", " ", line).strip() for line in str(front_text or "").splitlines()]
    raw_lines = [line for line in raw_lines if line]

    blocked_tokens = {
        "government", "india", "bharat", "unique", "identification", "authority", "uidai",
        "aadhaar", "aadhar", "card", "dob", "date", "birth", "year", "yob", "gender",
        "male", "female", "address", "issue", "issued", "download", "enrolment", "enrollment",
        "virtual", "signature", "help", "website", "www", "gov", "permanent", "account",
        "income", "tax", "passport", "father", "mother", "husband", "wife", "care", "photo",
        "document", "front", "back", "mobile", "phone", "email", "number", "resident",
    }
    footprint_tokens = ("dob", "date of birth", "year of birth", "yob", "male", "female", "gender")

    candidates = []
    normalized_counts = Counter()

    for index, raw_line in enumerate(raw_lines):
        line_lower = raw_line.lower()
        if any(token in line_lower for token in footprint_tokens):
            continue
        if any(char.isdigit() for char in raw_line):
            continue

        cleaned = re.sub(r"[^A-Za-z ]", " ", raw_line)
        words = [word for word in re.sub(r"\s+", " ", cleaned).strip().split() if len(word) >= 3]
        if len(words) < 2:
            continue

        # Names can be surrounded by OCR noise, so score every sensible 2-4 word window.
        for size in (3, 4, 2):
            if len(words) < size:
                continue
            for start in range(0, len(words) - size + 1):
                window = words[start:start + size]
                lowered = [word.lower() for word in window]
                if any(word in blocked_tokens for word in lowered):
                    continue
                if any(not re.search(r"[aeiouy]", word, re.IGNORECASE) for word in window):
                    continue

                phrase = " ".join(window)
                if not (6 <= len(phrase) <= 48):
                    continue

                normalized = " ".join(lowered)
                normalized_counts[normalized] += 1
                candidates.append((index, phrase, normalized, size))

    if candidates:
        footprint_indexes = [
            index for index, line in enumerate(raw_lines)
            if any(token in line.lower() for token in footprint_tokens)
        ]
        ranked = []
        for index, phrase, normalized, size in candidates:
            score = normalized_counts[normalized] * 6
            if size == 3:
                score += 6
            elif size == 2:
                score += 2

            nearest_footprint = min((abs(index - footprint) for footprint in footprint_indexes), default=99)
            if nearest_footprint == 1:
                score += 18
            elif nearest_footprint == 2:
                score += 12
            elif nearest_footprint == 3:
                score += 6

            compact = normalized.replace(" ", "")
            if compact.endswith(("bhai", "ben", "kumar", "kumari", "devi", "singh", "lal")):
                score += 4

            # Prefer clean title-like text over all-lowercase OCR fragments when scores tie.
            title_like = sum(1 for word in phrase.split() if word[:1].isupper())
            score += min(title_like, 3)
            ranked.append((score, normalized_counts[normalized], -abs(size - 3), phrase))

        ranked.sort(reverse=True)
        best_phrase = ranked[0][3]
        if ranked[0][0] >= 12:
            return " ".join(word.capitalize() for word in best_phrase.split())

    fallback = extract_name_from_aadhaar_ocr(str(front_text or ""), email=email)
    fallback = clean_string(fallback)
    if fallback and fallback.lower() != "aadhaar holder":
        return fallback
    return "Aadhaar Holder"


def _extract_direct_aadhaar_name(document_front):
    """Use mild OCR passes for the name; heavy document preprocessing can distort names."""
    try:
        from difflib import SequenceMatcher
        from PIL import Image, ImageOps
        from services.kyc_ocr_service import _ocr_command_ready

        pytesseract, ocr_error = _ocr_command_ready()
        if ocr_error:
            return ""

        document_front.stream.seek(0)
        image = ImageOps.exif_transpose(Image.open(document_front.stream)).convert("RGB")
        variants = [image, ImageOps.autocontrast(ImageOps.grayscale(image))]
        texts = []
        for variant in variants:
            value = pytesseract.image_to_string(variant, lang="eng", config="--oem 3 --psm 6")
            if value:
                texts.append(value)
        document_front.stream.seek(0)

        def candidate_before_dob(value):
            lines = [re.sub(r"\s+", " ", line).strip() for line in str(value or "").splitlines() if line.strip()]
            for index, line in enumerate(lines):
                lower = line.lower()
                if not any(token in lower for token in ("dob", "date of birth", "year of birth", "yob")):
                    continue
                for offset in (1, 2):
                    if index - offset < 0:
                        continue
                    cleaned = re.sub(r"[^A-Za-z ]", " ", lines[index - offset])
                    words = [word for word in re.sub(r"\s+", " ", cleaned).strip().split() if len(word) >= 3]
                    if len(words) >= 3:
                        # Most Aadhaar names are 2-4 words. Prefer the first clean 3 words;
                        # OCR often appends a short artifact after the real name.
                        return " ".join(words[:4] if len(words) == 4 and words[-1].lower().endswith(("bhai", "ben", "kumar", "devi", "singh")) else words[:3])
            return ""

        candidates = [candidate_before_dob(value) for value in texts]
        candidates = [value for value in candidates if len(value.split()) >= 2]
        if not candidates:
            return ""

        base_words = candidates[0].split()
        suffixes = ("bhai", "ben", "kumar", "kumari", "devi", "singh", "lal")

        for alternate in candidates[1:]:
            alt_words = alternate.split()
            if len(alt_words) != len(base_words):
                continue
            merged = []
            compatible = True
            for base_word, alt_word in zip(base_words, alt_words):
                similarity = SequenceMatcher(None, base_word.lower(), alt_word.lower()).ratio()
                if similarity < 0.55:
                    compatible = False
                    break

                base_lower = base_word.lower()
                alt_lower = alt_word.lower()
                base_skeleton = re.sub(r"[aeiouy]", "", base_lower)
                alt_skeleton = re.sub(r"[aeiouy]", "", alt_lower)

                if base_lower.endswith(suffixes):
                    chosen = base_word
                elif alt_lower.endswith(suffixes) and not base_lower.endswith(suffixes):
                    chosen = alt_word
                elif base_skeleton == alt_skeleton and len(alt_word) > len(base_word):
                    chosen = alt_word
                else:
                    chosen = base_word
                merged.append(chosen)

            if compatible:
                base_words = merged

        return " ".join(word.capitalize() for word in base_words)
    except Exception as exc:
        print("Direct Aadhaar name OCR error:", exc)
        try:
            document_front.stream.seek(0)
        except Exception:
            pass
        return ""

def _validate_aadhaar_document_images(aadhaar_number, document_front, document_back, user=None):
    """Run exact Aadhaar-number and front/back OCR checks before Step 4 opens."""
    from services.kyc_ocr_service import (
        _extract_document_numbers,
        _extract_text_from_filestorage,
    )

    if not document_front or document_front.filename == "":
        return {
            "success": False,
            "message": "Aadhaar card front side image is required.",
            "errors": {"document_front": "Front side image is required."},
            "status_code": 422,
        }
    if not document_back or document_back.filename == "":
        return {
            "success": False,
            "message": "Aadhaar card back side image is required.",
            "errors": {"document_back": "Back side image is required."},
            "status_code": 422,
        }

    front_text, front_error = _extract_text_from_filestorage(document_front)
    if front_error:
        return {
            "success": False,
            "message": front_error,
            "errors": {"document_front": front_error},
            "status_code": 422,
        }

    back_text, back_error = _extract_text_from_filestorage(document_back)
    if back_error:
        return {
            "success": False,
            "message": back_error,
            "errors": {"document_back": back_error},
            "status_code": 422,
        }

    front_text = str(front_text or "").strip()
    back_text = str(back_text or "").strip()
    if len(re.sub(r"\s+", "", front_text)) <= 10:
        return {
            "success": False,
            "message": "OCR could not read the Aadhaar front photo. Upload a clearer, uncropped front-side image.",
            "errors": {"document_front": "Unable to read the Aadhaar front side."},
            "status_code": 422,
        }
    if len(re.sub(r"\s+", "", back_text)) <= 10:
        return {
            "success": False,
            "message": "OCR could not read the Aadhaar back photo. Upload a clearer, uncropped back-side image.",
            "errors": {"document_back": "Unable to read the Aadhaar back side."},
            "status_code": 422,
        }

    ocr_text = "\n".join([front_text, back_text]).strip()
    extracted_numbers = _extract_document_numbers(ocr_text)
    found_numbers = [re.sub(r"\D", "", str(value)) for value in extracted_numbers.get("aadhaar_card", [])]
    
    print(f"[KYC OCR Debug] Expected Aadhaar: {aadhaar_number}")
    print(f"[KYC OCR Debug] Aadhaar OCR text extracted:\n{ocr_text}")
    print(f"[KYC OCR Debug] Extracted numbers: {extracted_numbers}")
    print(f"[KYC OCR Debug] Found numbers: {found_numbers}")

    if aadhaar_number not in found_numbers:
        return {
            "success": False,
            "message": "Aadhaar number does not exactly match the uploaded card photos. Check the number and upload clear front/back photos.",
            "errors": {"aadhaar_number": "Entered Aadhaar number was not found on the uploaded card."},
            "status_code": 422,
        }

    front_lower = front_text.lower()
    back_lower = back_text.lower()
    front_indicators = [
        "dob", "date of birth", "birth", "yob", "year of birth", "male", "female",
        "gender", "જન્મ", "મહિલા", "પુરૂષ", "नाम",
    ]
    back_indicators = [
        "address", "c/o", "care of", "s/o", "d/o", "w/o", "સરનામું", "पता",
        "father", "husband", "પોસ્ટ", "તાલુકો", "જીલ્લો", "પિન", "pincode", "pin code",
    ]

    front_has_front = any(indicator in front_lower for indicator in front_indicators)
    front_has_back = any(indicator in front_lower for indicator in back_indicators)
    back_has_front = any(indicator in back_lower for indicator in front_indicators)
    back_has_back = any(indicator in back_lower for indicator in back_indicators)

    if front_has_back and not front_has_front and back_has_front and not back_has_back:
        return {
            "success": False,
            "message": "Front and back Aadhaar photos appear to be swapped.",
            "errors": {
                "document_front": "This appears to be the back side.",
                "document_back": "This appears to be the front side.",
            },
            "status_code": 422,
        }
    if not front_has_front:
        return {
            "success": False,
            "message": "The front photo does not contain expected Aadhaar front-side details such as DOB or gender.",
            "errors": {"document_front": "Aadhaar front side could not be verified."},
            "status_code": 422,
        }
    if not back_has_back:
        return {
            "success": False,
            "message": "The back photo does not contain expected Aadhaar address-side details.",
            "errors": {"document_back": "Aadhaar back side could not be verified."},
            "status_code": 422,
        }

    user = user or {}
    extracted_name = _extract_direct_aadhaar_name(document_front) or _extract_verified_aadhaar_name(front_text, email=user.get("email", ""))
    scan_data = {
        "document_type": "aadhaar_card",
        "document_type_label": "Aadhaar Card",
        "document_number": aadhaar_number,
        "document_number_label": "Aadhaar Card Number",
        "full_name": extracted_name,
        "score": 100,
        "name_score": 100 if extracted_name != "Aadhaar Holder" else 0,
        "number_match": True,
        "document_score": 100,
        "matched_name_tokens": extracted_name.split() if extracted_name else [],
        "matched_document_keywords": ["AADHAAR", "FRONT_SIDE", "BACK_SIDE"],
        "detected_numbers": extracted_numbers,
        "ocr_preview": " ".join(ocr_text.split())[:800],
    }
    return {
        "success": True,
        "message": "Aadhaar front/back photos verified successfully.",
        "data": {"scan": scan_data, "full_name": extracted_name},
        "status_code": 200,
    }


def _draft_progress_payload(user):
    user = user or {}
    mobile_verified = bool(user.get("kyc_mobile_verified"))
    aadhaar_number = clean_string(user.get("kyc_draft_aadhaar_number"))
    doc_type = user.get("kyc_draft_document_type") or "aadhaar_card"
    documents_verified = bool(
        user.get("kyc_documents_verified")
        and user.get("kyc_draft_document_front")
        and (doc_type == "pan_card" or user.get("kyc_draft_document_back"))
    )

    if not mobile_verified:
        current_step = 1
    elif documents_verified:
        current_step = 4
    elif aadhaar_number:
        current_step = 3
    else:
        current_step = 2

    stored_step = user.get("kyc_progress_step")
    try:
        stored_step = int(stored_step)
    except (TypeError, ValueError):
        stored_step = current_step
    current_step = max(current_step, min(stored_step, 4))

    return {
        "current_step": current_step,
        "mobile_verified": mobile_verified,
        "mobile_number": user.get("kyc_mobile_verified_number", ""),
        "aadhaar_number": aadhaar_number,
        "aadhaar_number_saved": bool(aadhaar_number),
        "document_type": doc_type,
        "documents_verified": documents_verified,
        "draft_full_name": user.get("kyc_draft_full_name", ""),
        "draft_scan": user.get("kyc_draft_ocr_result", {}) or {},
        "step_states": {
            "1": "verified" if mobile_verified else "current",
            "2": "verified" if current_step > 2 else ("current" if current_step == 2 else "locked"),
            "3": "verified" if documents_verified else ("current" if current_step == 3 else "locked"),
            "4": "current" if current_step == 4 else "locked",
        },
    }


def save_kyc_aadhaar_number(user_id, aadhaar_number, document_type="aadhaar_card"):
    state = get_user_kyc_state(user_id)
    if state["status"] == "approved":
        return {
            "success": False,
            "message": "KYC is already approved.",
            "errors": {"kyc_status": "Approved KYC cannot be changed."},
            "status_code": 409,
        }
    if state["status"] in {"pending", "under_review", "review"}:
        return {
            "success": False,
            "message": "KYC is already submitted and under verification.",
            "errors": {"kyc_status": "Wait for the current verification result."},
            "status_code": 409,
        }

    user_object_id = _user_object_id(user_id)
    user = get_users_collection().find_one({"_id": user_object_id}) if user_object_id else None
    if not user or not user.get("kyc_mobile_verified"):
        return {
            "success": False,
            "message": "Verify your mobile number before saving document details.",
            "errors": {"mobile": "Mobile OTP verification is required first."},
            "status_code": 400,
        }

    document_type = clean_string(document_type).lower()
    if document_type in ("pan", "pan_card"):
        document_type = "pan_card"
    else:
        document_type = "aadhaar_card"

    if document_type == "pan_card":
        pan_number = clean_string(aadhaar_number).upper().replace(" ", "")
        if not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]{1}", pan_number):
            return {
                "success": False,
                "message": "PAN number must be in a valid format. Example: ABCDE1234F.",
                "errors": {"aadhaar_number": "Enter a valid 10-character PAN number."},
                "status_code": 422,
            }
        validated_number = pan_number
        doc_label = "PAN Card"
        doc_label_field = "PAN"
    else:
        aadhaar_num = re.sub(r"\D", "", clean_string(aadhaar_number))
        if not re.fullmatch(r"\d{12}", aadhaar_num):
            return {
                "success": False,
                "message": "Aadhaar number must be exactly 12 digits.",
                "errors": {"aadhaar_number": "Enter a valid 12-digit Aadhaar number."},
                "status_code": 422,
            }

        # Validate Verhoeff checksum
        d = [
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
            [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
            [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
            [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
            [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
            [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
            [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
            [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
            [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
            [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
        ]
        p = [
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
            [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
            [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
            [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
            [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
            [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
            [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
            [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
        ]
        c = 0
        reversed_digits = [int(x) for x in reversed(aadhaar_num)]
        for i, digit in enumerate(reversed_digits):
            c = d[c][p[i % 8][digit]]

        if c != 0 or aadhaar_num[0] in ('0', '1'):
            return {
                "success": False,
                "message": "Invalid Aadhaar card number. Please enter a valid mathematically verified card number.",
                "errors": {"aadhaar_number": "Aadhaar number check digit failed verification."},
                "status_code": 422,
            }
        validated_number = aadhaar_num
        doc_label = "Aadhaar Card"
        doc_label_field = "Aadhaar"

    from config.database import get_database

    duplicate = get_database().kyc_requests.find_one({
        "document_number": validated_number,
        "status": "approved",
        "user_id": {"$ne": str(user_id)},
    })
    if duplicate:
        return {
            "success": False,
            "message": f"This {doc_label} number is already verified on another account.",
            "errors": {"aadhaar_number": f"{doc_label} number is already in use."},
            "status_code": 422,
        }

    same_number = (clean_string(user.get("kyc_draft_aadhaar_number")) == validated_number and
                   clean_string(user.get("kyc_draft_document_type") or "aadhaar_card") == document_type)
    already_verified = same_number and bool(user.get("kyc_documents_verified"))
    set_data = {
        "kyc_draft_aadhaar_number": validated_number,
        "kyc_draft_document_type": document_type,
        "kyc_aadhaar_number_saved_at": now_utc(),
        "kyc_progress_step": 4 if already_verified else 3,
        "updated_at": now_utc(),
    }
    update = {"$set": set_data}
    if not already_verified:
        set_data["kyc_documents_verified"] = False
        update["$unset"] = {
            "kyc_draft_document_front": "",
            "kyc_draft_document_back": "",
            "kyc_draft_ocr_result": "",
            "kyc_draft_full_name": "",
            "kyc_documents_verified_at": "",
        }

    get_users_collection().update_one({"_id": user_object_id}, update)
    refreshed = get_users_collection().find_one({"_id": user_object_id}) or {}
    return {
        "success": True,
        "message": f"{doc_label_field} number saved. Upload the matching photo(s).",
        "data": _draft_progress_payload(refreshed),
        "status_code": 200,
    }


def _validate_pan_document_images(pan_number, document_front, user=None):
    """Run exact PAN-number and front OCR checks before Step 4 opens."""
    from services.kyc_ocr_service import (
        _extract_document_numbers,
        _extract_text_from_filestorage,
        _normalize_upper,
        _fuzzy_number_match,
        _name_match_score,
    )

    if not document_front or document_front.filename == "":
        return {
            "success": False,
            "message": "PAN card front side image is required.",
            "errors": {"document_front": "Front side image is required."},
            "status_code": 422,
        }

    front_text, front_error = _extract_text_from_filestorage(document_front)
    if front_error:
        return {
            "success": False,
            "message": front_error,
            "errors": {"document_front": front_error},
            "status_code": 422,
        }

    front_text = str(front_text or "").strip()
    if len(re.sub(r"\s+", "", front_text)) <= 10:
        return {
            "success": False,
            "message": "OCR could not read the PAN front photo. Upload a clearer, uncropped front-side image.",
            "errors": {"document_front": "Unable to read the PAN front side."},
            "status_code": 422,
        }

    ocr_text = front_text
    extracted_numbers = _extract_document_numbers(ocr_text)
    found_numbers = [_normalize_upper(value) for value in extracted_numbers.get("pan_card", [])]
    expected_number = _normalize_upper(pan_number)
    
    print(f"[KYC OCR Debug] Expected PAN: {expected_number}")
    print(f"[KYC OCR Debug] PAN OCR text extracted:\n{ocr_text}")
    print(f"[KYC OCR Debug] Extracted numbers: {extracted_numbers}")
    print(f"[KYC OCR Debug] Found numbers: {found_numbers}")

    number_match = expected_number in found_numbers or _fuzzy_number_match(expected_number, ocr_text, "pan_card")
    if not number_match:
        return {
            "success": False,
            "message": "PAN number does not exactly match the uploaded card photo. Check the number and upload a clear front photo.",
            "errors": {"aadhaar_number": "Entered PAN number was not found on the uploaded card."},
            "status_code": 422,
        }

    front_lower = front_text.lower()
    pan_indicators = ["pan", "income tax", "permanent account", "tax", "account", "india", "signature", "signature of holder"]
    has_pan_keywords = any(ind in front_lower for ind in pan_indicators)
    if not has_pan_keywords:
        return {
            "success": False,
            "message": "The uploaded photo does not look like a PAN card. Please upload a valid PAN card front side.",
            "errors": {"document_front": "PAN card front side could not be verified."},
            "status_code": 422,
        }

    user = user or {}
    registered_name = clean_string(user.get("full_name") or "")
    name_score, matched_name_tokens = _name_match_score(registered_name, ocr_text)
    if name_score < 45:
        return {
            "success": False,
            "message": f"Name on PAN Card does not match your registered name '{registered_name}'.",
            "errors": {"document_front": "Name mismatch on PAN card."},
            "status_code": 422,
        }

    scan_data = {
        "document_type": "pan_card",
        "document_type_label": "PAN Card",
        "document_number": expected_number,
        "document_number_label": "PAN Card Number",
        "full_name": registered_name,
        "score": 100,
        "name_score": name_score,
        "number_match": True,
        "document_score": 100,
        "matched_name_tokens": matched_name_tokens,
        "matched_document_keywords": ["PAN", "FRONT_SIDE"],
        "detected_numbers": extracted_numbers,
        "ocr_preview": " ".join(ocr_text.split())[:800],
    }
    return {
        "success": True,
        "message": "PAN front photo verified successfully.",
        "data": {"scan": scan_data, "full_name": registered_name},
        "status_code": 200,
    }


def verify_kyc_aadhaar_documents(user_id, files):
    state = get_user_kyc_state(user_id)
    if state["status"] == "approved":
        return {
            "success": False,
            "message": "KYC is already approved.",
            "errors": {"kyc_status": "Approved KYC cannot be changed."},
            "status_code": 409,
        }
    if state["status"] in {"pending", "under_review", "review"}:
        return {
            "success": False,
            "message": "KYC is already submitted and under verification.",
            "errors": {"kyc_status": "Wait for the current verification result."},
            "status_code": 409,
        }

    user_object_id = _user_object_id(user_id)
    user = get_users_collection().find_one({"_id": user_object_id}) if user_object_id else None
    if not user or not user.get("kyc_mobile_verified"):
        return {
            "success": False,
            "message": "Verify your mobile number first.",
            "errors": {"mobile": "Mobile OTP verification is required."},
            "status_code": 400,
        }

    document_number = clean_string(user.get("kyc_draft_aadhaar_number"))
    doc_type = user.get("kyc_draft_document_type") or "aadhaar_card"

    if doc_type == "pan_card":
        if not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]{1}", document_number.upper()):
            return {
                "success": False,
                "message": "Save a valid PAN card number before uploading card photo.",
                "errors": {"aadhaar_number": "Complete Step 2 first."},
                "status_code": 400,
            }
    else:
        if not re.fullmatch(r"\d{12}", document_number):
            return {
                "success": False,
                "message": "Save your Aadhaar number before uploading card photos.",
                "errors": {"aadhaar_number": "Complete Step 2 first."},
                "status_code": 400,
            }

    document_front = files.get("document_front")
    document_back = files.get("document_back")

    if doc_type == "pan_card":
        verification = _validate_pan_document_images(
            pan_number=document_number,
            document_front=document_front,
            user=user,
        )
    else:
        verification = _validate_aadhaar_document_images(
            aadhaar_number=document_number,
            document_front=document_front,
            document_back=document_back,
            user=user,
        )

    if not verification["success"]:
        return verification

    file_paths, upload_error = _save_uploaded_kyc_files(
        user_id,
        {"document_front": document_front, "document_back": document_back if doc_type != "pan_card" else None, "selfie": None},
    )
    if upload_error:
        return upload_error

    scan_data = verification["data"]["scan"]
    extracted_name = verification["data"]["full_name"]
    verified_at = now_utc()

    # Save the verified front/back document paths and transition to Step 4 (Selfie)
    get_users_collection().update_one(
        {"_id": user_object_id},
        {"$set": {
            "kyc_draft_document_front": file_paths.get("front_path", ""),
            "kyc_draft_document_back": file_paths.get("back_path", ""),
            "kyc_draft_ocr_result": scan_data,
            "kyc_draft_full_name": extracted_name,
            "kyc_documents_verified": True,
            "kyc_documents_verified_at": verified_at,
            "kyc_progress_step": 4,
            "updated_at": verified_at,
        }},
    )

    refreshed = get_users_collection().find_one({"_id": user_object_id}) or {}
    progress_data = _draft_progress_payload(refreshed)
    return {
        "success": True,
        "message": "Aadhaar front/back photos verified successfully. Please upload your selfie.",
        "data": progress_data,
        "status_code": 200,
    }


def submit_kyc(user_id, form_data, files):
    state = get_user_kyc_state(user_id)
    current_status = state["status"]
    if current_status == "approved":
        return {
            "success": False,
            "message": "KYC is already approved.",
            "errors": {"kyc_status": "Approved KYC cannot be overwritten."},
            "status_code": 409,
        }
    if current_status in {"pending", "under_review", "review"}:
        return {
            "success": False,
            "message": "KYC is already submitted and under verification.",
            "errors": {"kyc_status": "Wait for the current verification result."},
            "status_code": 409,
        }

    user_object_id = _user_object_id(user_id)
    user = get_users_collection().find_one({"_id": user_object_id}) if user_object_id else None
    if not user or not user.get("kyc_mobile_verified"):
        return {
            "success": False,
            "message": "Please verify your mobile number with OTP first.",
            "errors": {"mobile": "Mobile number must be verified via OTP first."},
            "status_code": 400,
        }

    aadhaar_number = clean_string(user.get("kyc_draft_aadhaar_number"))
    document_front_path = clean_string(user.get("kyc_draft_document_front"))
    document_back_path = clean_string(user.get("kyc_draft_document_back"))
    scan_data = user.get("kyc_draft_ocr_result", {}) or {}
    doc_type = user.get("kyc_draft_document_type") or "aadhaar_card"
    extracted_name = clean_string(user.get("kyc_draft_full_name")) or clean_string(scan_data.get("full_name")) or ("PAN Holder" if doc_type == "pan_card" else "Aadhaar Holder")

    if doc_type == "pan_card":
        if not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]{1}", aadhaar_number.upper()):
            return {
                "success": False,
                "message": "Complete PAN number Step 2 first.",
                "errors": {"aadhaar_number": "PAN number is not saved."},
                "status_code": 400,
            }
        if not user.get("kyc_documents_verified") or not document_front_path:
            return {
                "success": False,
                "message": "Verify the PAN front photo before submitting a selfie.",
                "errors": {"document_front": "Complete Step 3 first."},
                "status_code": 400,
            }
    else:
        if not re.fullmatch(r"\d{12}", aadhaar_number):
            return {
                "success": False,
                "message": "Complete Aadhaar number Step 2 first.",
                "errors": {"aadhaar_number": "Aadhaar number is not saved."},
                "status_code": 400,
            }
        if not user.get("kyc_documents_verified") or not document_front_path or not document_back_path:
            return {
                "success": False,
                "message": "Verify the Aadhaar front/back photos before submitting a selfie.",
                "errors": {"document_front": "Complete Step 3 first."},
                "status_code": 400,
            }

    selfie = files.get("selfie")
    selfie_error = _validate_selfie_image(selfie)
    if selfie_error:
        return {
            "success": False,
            "message": selfie_error,
            "errors": {"selfie": selfie_error},
            "status_code": 422,
        }

    selfie_result = save_kyc_file(selfie, user_id, "selfie")
    if not selfie_result["success"]:
        return {
            "success": False,
            "message": "Selfie file upload failed.",
            "errors": {"selfie": selfie_result["error"]},
            "status_code": 422,
        }

    status = "pending"
    doc_label = "PAN Card" if doc_type == "pan_card" else "Aadhaar Card"
    doc_num_label = "PAN Card Number" if doc_type == "pan_card" else "Aadhaar Card Number"
    
    remark = f"{doc_label} OCR and selfie checks passed for '{extracted_name}'. Pending admin review."
    message = "KYC steps completed successfully and submitted for verification."
    scan_data = dict(scan_data)
    scan_data.update({
        "document_type": doc_type,
        "document_type_label": doc_label,
        "document_number": aadhaar_number,
        "document_number_label": doc_num_label,
        "full_name": extracted_name,
        "number_match": True,
        "selfie_face_detected": True,
        "selfie_validation": "passed",
        "score": 100,
    })

    cleaned_input = {
        "verification_method": "ocr_document",
        "full_name": extracted_name,
        "document_type": doc_type,
        "document_number": aadhaar_number,
        "agree": True,
    }
    file_paths = {
        "front_path": document_front_path,
        "back_path": document_back_path if doc_type != "pan_card" else "",
        "selfie_path": selfie_result["path"],
    }
    kyc_payload = _build_kyc_payload(cleaned_input, file_paths, scan_data, status, remark)
    kyc_payload["progress_step"] = 4
    kyc_payload["mobile_verified_number"] = user.get("kyc_mobile_verified_number", "")
    kyc = create_or_update_kyc(user_id=user_id, kyc_data=kyc_payload)

    _sync_after_decision(user_id, status, remark)
    get_users_collection().update_one(
        {"_id": user_object_id},
        {"$set": {
            "name": extracted_name,
            "kyc_progress_step": 5,
            "updated_at": now_utc(),
        }},
    )

    formatted = format_kyc(kyc)
    formatted["status_label"] = kyc_status_label(status)
    formatted["status_message"] = kyc_status_message(status, remark)
    formatted["can_submit"] = False
    return {
        "success": True,
        "message": message,
        "data": {"kyc": formatted, "scan": scan_data, "current_step": 5},
        "status_code": 201,
    }

def get_kyc_status(user_id):
    state = get_user_kyc_state(user_id)
    kyc = state["kyc"]
    user_object_id = _user_object_id(user_id)
    user = get_users_collection().find_one({"_id": user_object_id}) if user_object_id else (state["user"] or {})
    user = user or {}

    formatted = format_kyc(kyc) if kyc else None
    if formatted:
        formatted["status_label"] = state["status_label"]
        formatted["status_message"] = state["status_message"]
        formatted["can_submit"] = state["can_submit"]
        formatted["reject_reason"] = state["remark"] if state["status"] == "rejected" else ""

    progress = _draft_progress_payload(user)
    if state["status"] in {"pending", "under_review", "review", "approved"}:
        progress["current_step"] = 5
        progress["step_states"] = {"1": "verified", "2": "verified", "3": "verified", "4": "verified"}

    data = {
        "kyc_status": state["status"],
        "kyc_status_label": state["status_label"],
        "kyc_status_message": state["status_message"],
        "can_submit": state["can_submit"],
        # KYC gates only withdrawals. Deposit, wallet transfer and trading are
        # available independently of KYC status.
        "can_trade": True,
        "can_transfer": True,
        "can_withdraw": state["is_approved"],
        "can_deposit": True,
        "kyc": formatted,
    }
    data.update(progress)

    return {
        "success": True,
        "message": "KYC status fetched successfully." if kyc else "KYC progress fetched successfully.",
        "data": data,
        "status_code": 200,
    }


def send_kyc_mobile_otp(user_id, mobile):
    import random
    import datetime

    user_object_id = _user_object_id(user_id)
    if not user_object_id:
        return {
            "success": False,
            "message": "Invalid user ID.",
            "status_code": 400
        }

    mobile = clean_string(mobile)
    if not re.match(r"^[6-9][0-9]{9}$", mobile):
        return {
            "success": False,
            "message": "Invalid mobile number. Must be a valid 10-digit number.",
            "status_code": 422
        }

    otp = str(random.randint(100000, 999999))
    expires_at = now_utc() + datetime.timedelta(minutes=5)

    get_users_collection().update_one(
        {"_id": user_object_id},
        {"$set": {
            "kyc_mobile_otp": otp,
            "kyc_mobile_otp_sent_to": mobile,
            "kyc_mobile_otp_expires_at": expires_at,
            "kyc_mobile_verified": False
        }}
    )

    # Try sending real SMS
    sms_sent = _send_actual_sms(mobile, otp)

    gateway = os.getenv("SMS_GATEWAY", "dev").lower().strip()
    dev_code = otp if (gateway == "dev" or not sms_sent) else None

    return {
        "success": True,
        "message": f"OTP sent to mobile number {mobile} via SMS." if sms_sent else f"OTP sent to mobile number {mobile}.",
        "data": {
            "dev_code": dev_code,
            "expires_seconds": 300
        },
        "status_code": 200
    }


def _send_actual_sms(mobile, otp):
    import requests
    gateway = os.getenv("SMS_GATEWAY", "dev").lower().strip()

    if gateway == "fast2sms":
        api_key = os.getenv("FAST2SMS_API_KEY")
        if not api_key:
            print("Fast2SMS API Key missing in .env")
            return False
        url = "https://www.fast2sms.com/dev/bulkV2"
        params = {
            "authorization": api_key,
            "variables_values": otp,
            "route": "otp",
            "numbers": mobile
        }
        try:
            r = requests.get(url, params=params, timeout=5)
            res = r.json()
            return res.get("return") is True
        except Exception as e:
            print("Fast2SMS send error:", e)
            return False

    elif gateway == "twilio":
        sid = os.getenv("TWILIO_ACCOUNT_SID")
        token = os.getenv("TWILIO_AUTH_TOKEN")
        sender = os.getenv("TWILIO_PHONE_NUMBER")
        if not sid or not token or not sender:
            print("Twilio credentials missing in .env")
            return False
        url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
        
        # Ensure correct country code format for international numbers
        to_number = mobile if mobile.startswith("+") else f"+91{mobile}"
        
        data = {
            "To": to_number,
            "From": sender,
            "Body": f"Your TraidiumX verification OTP is {otp}. Valid for 5 minutes."
        }
        try:
            r = requests.post(url, data=data, auth=(sid, token), timeout=5)
            return r.status_code in [200, 201]
        except Exception as e:
            print("Twilio send error:", e)
            return False

    return False



def verify_kyc_mobile_otp(user_id, mobile, otp):
    user_object_id = _user_object_id(user_id)
    if not user_object_id:
        return {
            "success": False,
            "message": "Invalid user ID.",
            "status_code": 400
        }

    mobile = clean_string(mobile)
    otp = clean_string(otp)

    user = get_users_collection().find_one({"_id": user_object_id})
    if not user:
        return {
            "success": False,
            "message": "User not found.",
            "status_code": 404
        }

    stored_otp = user.get("kyc_mobile_otp")
    stored_mobile = user.get("kyc_mobile_otp_sent_to")
    expires_at = user.get("kyc_mobile_otp_expires_at")

    if not stored_otp or stored_mobile != mobile:
        return {
            "success": False,
            "message": "Invalid mobile verification request. Please send OTP again.",
            "status_code": 400
        }

    if expires_at:
        current_time = now_utc()
        if expires_at.tzinfo is None and current_time.tzinfo is not None:
            current_time = current_time.replace(tzinfo=None)
        if current_time > expires_at:
            return {
                "success": False,
                "message": "OTP expired. Please request a new OTP.",
                "status_code": 400
            }


    if stored_otp != otp:
        return {
            "success": False,
            "message": "Incorrect OTP. Please enter the valid 6-digit code.",
            "status_code": 422
        }

    # Mark Step 1 as verified without reopening it on later visits.
    try:
        previous_step = int(user.get("kyc_progress_step") or 1)
    except (TypeError, ValueError):
        previous_step = 1

    get_users_collection().update_one(
        {"_id": user_object_id},
        {"$set": {
            "kyc_mobile_verified": True,
            "kyc_mobile_verified_number": mobile,
            "kyc_mobile_verified_at": now_utc(),
            "kyc_progress_step": max(previous_step, 2),
            "kyc_mobile_otp": "",
            "kyc_mobile_otp_sent_to": "",
            "updated_at": now_utc(),
        }}
    )
    refreshed = get_users_collection().find_one({"_id": user_object_id}) or {}

    return {
        "success": True,
        "message": "Mobile number verified successfully.",
        "data": _draft_progress_payload(refreshed),
        "status_code": 200
    }



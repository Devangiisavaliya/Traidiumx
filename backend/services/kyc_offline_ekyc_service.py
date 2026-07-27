import os
import re
import tempfile
import zipfile
from difflib import SequenceMatcher
from xml.etree import ElementTree as ET


SUPPORTED_OFFLINE_EKYC_EXTENSIONS = {"zip", "xml"}


def _clean(value):
    return str(value or "").strip()


def _normalize_name(value):
    value = re.sub(r"[^A-Z ]", " ", _clean(value).upper())
    return re.sub(r"\s+", " ", value).strip()


def _mask_reference(value):
    value = _clean(value)
    if len(value) <= 4:
        return value
    return f"{'*' * max(0, len(value) - 4)}{value[-4:]}"


def _name_score(expected_name, detected_name):
    expected = _normalize_name(expected_name)
    detected = _normalize_name(detected_name)
    if not expected or not detected:
        return 0

    if expected.replace(" ", "") == detected.replace(" ", ""):
        return 100

    expected_tokens = [t for t in expected.split() if len(t) >= 2]
    detected_tokens = [t for t in detected.split() if len(t) >= 2]
    if not expected_tokens or not detected_tokens:
        return int(round(SequenceMatcher(None, expected, detected).ratio() * 100))

    matched = 0
    for token in expected_tokens:
        best = max(SequenceMatcher(None, token, word).ratio() for word in detected_tokens)
        if best >= 0.84:
            matched += 1
    token_score = int(round((matched / len(expected_tokens)) * 100))
    full_score = int(round(SequenceMatcher(None, expected, detected).ratio() * 100))
    return max(token_score, full_score)


def _strip_xml_namespaces(root):
    for elem in root.iter():
        if "}" in elem.tag:
            elem.tag = elem.tag.split("}", 1)[1]
    return root


def _find_first(root, tag_name):
    tag_name = tag_name.lower()
    for elem in root.iter():
        if str(elem.tag).lower().endswith(tag_name):
            return elem
    return None


def _read_uploaded_bytes(file_storage):
    if not file_storage or not getattr(file_storage, "filename", ""):
        return None, "Aadhaar Offline e-KYC ZIP/XML file is required."

    filename = file_storage.filename or ""
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in SUPPORTED_OFFLINE_EKYC_EXTENSIONS:
        return None, "Upload the UIDAI Aadhaar Offline e-KYC ZIP or XML file only."

    try:
        file_storage.stream.seek(0)
        content = file_storage.stream.read()
        file_storage.stream.seek(0)
    except Exception as exc:
        return None, f"Unable to read uploaded e-KYC file: {exc}"

    if not content:
        return None, "Uploaded e-KYC file is empty."

    return {"filename": filename, "extension": extension, "content": content}, ""


def _extract_xml_from_zip(content, share_code):
    password = _clean(share_code).encode("utf-8")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
        tmp.write(content)
        zip_path = tmp.name

    try:
        with zipfile.ZipFile(zip_path, "r") as archive:
            xml_names = [name for name in archive.namelist() if name.lower().endswith(".xml")]
            if not xml_names:
                return "", "The ZIP does not contain UIDAI offline e-KYC XML."

            last_error = ""
            for name in xml_names:
                try:
                    data = archive.read(name, pwd=password or None)
                    if data:
                        return data.decode("utf-8", errors="replace"), ""
                except RuntimeError as exc:
                    last_error = str(exc)
                except Exception as exc:
                    last_error = str(exc)

            if last_error and "password" in last_error.lower():
                return "", "Invalid Aadhaar Offline e-KYC share code. Enter the same share code used on UIDAI/myAadhaar."
            return "", "Unable to open Aadhaar Offline e-KYC XML from the ZIP. Check the share code and try again."
    except zipfile.BadZipFile:
        return "", "Uploaded file is not a valid ZIP. Upload the original UIDAI Offline e-KYC ZIP."
    finally:
        try:
            os.remove(zip_path)
        except OSError:
            pass


def _read_offline_ekyc_xml(file_storage, share_code):
    uploaded, error = _read_uploaded_bytes(file_storage)
    if error:
        return "", error

    if uploaded["extension"] == "zip":
        if not _clean(share_code):
            return "", "Share code is required to open the Aadhaar Offline e-KYC ZIP."
        return _extract_xml_from_zip(uploaded["content"], share_code)

    try:
        return uploaded["content"].decode("utf-8", errors="replace"), ""
    except Exception as exc:
        return "", f"Unable to read Offline e-KYC XML: {exc}"


def _parse_offline_ekyc_xml(xml_text):
    try:
        root = ET.fromstring(xml_text.encode("utf-8"))
    except Exception as exc:
        return None, f"Invalid Aadhaar Offline e-KYC XML: {exc}"

    root = _strip_xml_namespaces(root)
    root_tag = str(root.tag or "").lower()
    if "offlinepaperlesskyc" not in root_tag and "kyc" not in root_tag:
        return None, "Uploaded XML does not look like UIDAI Aadhaar Offline e-KYC XML."

    poi = _find_first(root, "Poi")
    poa = _find_first(root, "Poa")
    pht = _find_first(root, "Pht")
    uid_data = _find_first(root, "UidData")
    signature = _find_first(root, "Signature")
    signature_value = _find_first(root, "SignatureValue")

    if poi is None:
        return None, "UIDAI Offline e-KYC XML is missing identity details."

    uid_value = _clean((uid_data.attrib.get("uid") or uid_data.attrib.get("UID") or "") if uid_data is not None else "")
    reference_id = (
        root.attrib.get("referenceId")
        or root.attrib.get("referenceID")
        or root.attrib.get("refId")
        or uid_value
        or root.attrib.get("uid")
        or ""
    )

    details = {
        "reference_id": _clean(reference_id),
        "aadhaar_uid": uid_value,
        "aadhaar_uid_masked": _mask_reference(uid_value) if uid_value else "",
        "reference_id_masked": _mask_reference(reference_id),
        "name": _clean(poi.attrib.get("name") or poi.attrib.get("Name")),
        "dob": _clean(poi.attrib.get("dob") or poi.attrib.get("DOB") or poi.attrib.get("yob") or poi.attrib.get("YOB")),
        "gender": _clean(poi.attrib.get("gender") or poi.attrib.get("Gender")),
        "care_of": _clean((poa.attrib.get("careof") or poa.attrib.get("co") or "") if poa is not None else ""),
        "address": " ".join([_clean(v) for v in (poa.attrib.values() if poa is not None else []) if _clean(v)]),
        "photo_present": bool(pht is not None and _clean(pht.text)),
        "signature_present": bool(signature is not None or signature_value is not None),
    }
    return details, ""


def _aadhaar_display_from_reference(reference_id):
    digits = re.sub(r"\D", "", _clean(reference_id))
    if len(digits) >= 4:
        return f"XXXXXXXX{digits[-4:]}", digits[-4:]
    masked = _mask_reference(reference_id)
    return masked or "UIDAI Offline e-KYC Reference", digits[-4:] if digits else ""


def verify_offline_aadhaar_ekyc(full_name, offline_file, share_code, aadhaar_last4=None):
    """Verify UIDAI Offline e-KYC ZIP/XML without trusting manual Aadhaar input.

    The full Aadhaar number is not expected from the user and is not stored.
    The displayed ID comes from the UIDAI XML reference/masked value extracted
    from the uploaded Offline e-KYC file.
    """
    xml_text, read_error = _read_offline_ekyc_xml(offline_file, share_code)
    if read_error:
        return {
            "success": False,
            "message": read_error,
            "errors": {"offline_ekyc_file": read_error},
            "status_code": 422,
        }

    details, parse_error = _parse_offline_ekyc_xml(xml_text)
    if parse_error:
        return {
            "success": False,
            "message": parse_error,
            "errors": {"offline_ekyc_file": parse_error},
            "status_code": 422,
        }

    detected_name = details.get("name", "")
    name_score = _name_score(full_name, detected_name)
    reference_id = details.get("reference_id", "")
    display_number, extracted_last4 = _aadhaar_display_from_reference(reference_id)
    reference_present = bool(_clean(reference_id))

    # UIDAI Offline XML should contain a digital-signature block. Full certificate
    # chain verification can be plugged in later, but unsigned/non-UIDAI-looking XML
    # must not auto approve.
    signature_present = bool(details.get("signature_present"))
    document_score = 100 if signature_present else 60

    errors = {}
    if name_score < 80:
        errors["full_name"] = "Full name does not match the UIDAI Offline e-KYC XML. Enter the exact Aadhaar name."
    if not reference_present:
        errors["offline_ekyc_file"] = "Offline e-KYC XML does not contain a UIDAI reference ID. Upload the original UIDAI Offline e-KYC file."
    if not signature_present:
        errors["offline_ekyc_file"] = "Offline e-KYC XML is missing UIDAI digital signature block. Upload the original UIDAI file."

    number_match = reference_present
    score = int(round((name_score * 0.55) + ((100 if number_match else 0) * 0.20) + (document_score * 0.25)))
    scan = {
        "verification_method": "aadhaar_offline_ekyc",
        "document_type": "aadhaar_card",
        "document_type_label": "Aadhaar Offline e-KYC",
        "document_number": display_number,
        "document_number_label": "UIDAI Masked Aadhaar / Reference",
        "aadhaar_last4": extracted_last4,
        "full_name": _clean(full_name).upper(),
        "detected_name": detected_name,
        "name_score": name_score,
        "number_match": number_match,
        "document_score": document_score,
        "score": max(0, min(100, score)),
        "reference_id_masked": details.get("aadhaar_uid_masked", "") or details.get("reference_id_masked", "") or display_number,
        "reference_id_hash_source": reference_id,
        "aadhaar_uid_masked": details.get("aadhaar_uid_masked", ""),
        "dob": details.get("dob", ""),
        "gender": details.get("gender", ""),
        "photo_present": details.get("photo_present", False),
        "signature_present": signature_present,
    }

    if errors:
        if "full_name" in errors:
            message = errors["full_name"]
        else:
            message = errors.get("offline_ekyc_file") or "Aadhaar Offline e-KYC verification failed."
        return {
            "success": False,
            "message": message,
            "errors": errors,
            "data": {"scan": scan},
            "status_code": 422,
        }

    return {
        "success": True,
        "message": "Aadhaar Offline e-KYC verified successfully. UIDAI XML name, masked Aadhaar/reference and signature structure matched.",
        "data": {"scan": scan},
        "status_code": 200,
    }

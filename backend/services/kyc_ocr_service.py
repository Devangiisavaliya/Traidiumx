import os
import re
import tempfile
from difflib import SequenceMatcher

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

from utils.validators import (
    clean_document_number,
    document_type_label,
    validate_kyc_document_number,
)


DOCUMENT_TYPE_KEYWORDS = {
    "pan_card": ["PAN", "INCOME TAX", "PERMANENT ACCOUNT"],
    # Keep only document-specific words here. Generic words like "Government of
    # India" appear on multiple Indian IDs and caused PAN images to look like
    # Aadhaar. If the Aadhaar number itself matches, doc score is raised later.
    "aadhaar_card": ["AADHAAR", "AADHAR", "UNIQUE IDENTIFICATION", "UIDAI"],
    "passport": ["PASSPORT"],
    "driving_license": ["DRIVING", "DRIVING LICENCE", "DRIVING LICENSE", "TRANSPORT"],
}


def _clean(value):
    return str(value or "").strip()


def _normalize_upper(value):
    return re.sub(r"[^A-Z0-9]", "", _clean(value).upper())


def _normalize_name(value):
    value = re.sub(r"[^A-Z ]", " ", _clean(value).upper())
    return re.sub(r"\s+", " ", value).strip()


def _name_tokens(value):
    return [token for token in _normalize_name(value).split() if len(token) >= 2]


def _ocr_command_ready():
    """Configure pytesseract for Windows default install if PATH is not refreshed."""
    try:
        import pytesseract
    except Exception as exc:  # pragma: no cover - dependency error is reported to UI
        return None, f"pytesseract is not installed: {exc}"

    windows_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(windows_path):
        pytesseract.pytesseract.tesseract_cmd = windows_path
    return pytesseract, ""


def _preprocess_image(image):
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")

    max_side = max(image.size)
    if max_side < 2200:
        scale = min(4.0, max(2.0, 2200 / max_side))
        scaled_image = image.resize((int(image.width * scale), int(image.height * scale)), Image.Resampling.LANCZOS)
    else:
        scaled_image = image

    gray = ImageOps.grayscale(scaled_image)
    autocontrast_gray = ImageOps.autocontrast(gray)
    high_contrast = ImageEnhance.Contrast(autocontrast_gray).enhance(1.6)
    sharp = ImageEnhance.Sharpness(high_contrast).enhance(1.6)

    variants = [
        scaled_image,
        autocontrast_gray,
        sharp,
    ]
    return variants


def _read_image_text(path):
    pytesseract, error = _ocr_command_ready()
    if error:
        return "", error

    try:
        image = Image.open(path)
    except Exception as exc:
        return "", f"Unable to open uploaded image: {exc}"

    texts = []
    configs = [
        "--oem 3 --psm 3",
        "--oem 3 --psm 6",
        "--oem 3 --psm 11",
        "--oem 3 --psm 11 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/:- ",
    ]
    for variant in _preprocess_image(image):
        for config in configs:
            try:
                text = pytesseract.image_to_string(variant, lang="eng", config=config)
                if text:
                    texts.append(text)
            except Exception as exc:
                return "", f"Tesseract OCR failed: {exc}"

    return "\n".join(texts), ""


def _read_pdf_text(path):
    try:
        import fitz  # PyMuPDF
    except Exception as exc:
        return "", f"PyMuPDF is required for PDF OCR: {exc}"

    texts = []
    temp_files = []
    try:
        doc = fitz.open(path)
        max_pages = min(len(doc), 2)
        for page_index in range(max_pages):
            page = doc[page_index]
            direct_text = page.get_text("text") or ""
            if direct_text.strip():
                texts.append(direct_text)

            pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), alpha=False)
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
            tmp.close()
            pix.save(tmp.name)
            temp_files.append(tmp.name)
            ocr_text, error = _read_image_text(tmp.name)
            if error:
                return "\n".join(texts), error
            texts.append(ocr_text)
        doc.close()
    except Exception as exc:
        return "", f"Unable to read PDF document: {exc}"
    finally:
        for tmp_path in temp_files:
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    return "\n".join(texts), ""


def _extract_text_from_filestorage(file_storage):
    if not file_storage or not getattr(file_storage, "filename", ""):
        return "", "Document file is required."

    suffix = os.path.splitext(file_storage.filename)[1].lower() or ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        file_storage.stream.seek(0)
        tmp.write(file_storage.stream.read())
        tmp_path = tmp.name
        file_storage.stream.seek(0)

    try:
        if suffix == ".pdf":
            return _read_pdf_text(tmp_path)
        return _read_image_text(tmp_path)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def _id_ocr_alternates(value):
    base = _normalize_upper(value)
    alternates = {base}
    # OCR often swaps visually similar letters/numbers.
    substitutions = [
        ("0", "O"), ("O", "0"),
        ("1", "I"), ("I", "1"), ("1", "L"), ("L", "1"),
        ("5", "S"), ("S", "5"),
        ("8", "B"), ("B", "8"),
        ("2", "Z"), ("Z", "2"),
        ("6", "G"), ("G", "6"),
        ("7", "T"), ("T", "7"),
    ]
    for old, new in substitutions:
        if old in base:
            alternates.add(base.replace(old, new))
    return alternates


def _normalize_pan_ocr_window(window):
    """Normalize OCR mistakes by PAN position: AAAAA9999A."""
    value = _normalize_upper(window)[:10]
    if len(value) != 10:
        return value

    letter_map = {
        "0": "O", "1": "I", "5": "S", "8": "B", "2": "Z",
        "6": "G", "7": "T", "4": "A",
    }
    digit_map = {
        "O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "T": "1",
        "S": "5", "B": "8", "Z": "2", "G": "6", "A": "4",
    }
    chars = []
    for index, char in enumerate(value):
        if index in {0, 1, 2, 3, 4, 9}:
            chars.append(letter_map.get(char, char))
        else:
            chars.append(digit_map.get(char, char))
    return "".join(chars)


def _pan_window_candidates(text):
    compact = _normalize_upper(text)
    candidates = set(re.findall(r"[A-Z0-9]{10}", compact))
    for i in range(0, max(0, len(compact) - 9)):
        candidates.add(compact[i:i + 10])
    return candidates


def _pan_number_match(expected_number, text):
    expected = _normalize_pan_ocr_window(expected_number)
    if not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", expected or ""):
        return False

    haystack = _normalize_upper(text)
    if expected in haystack:
        return True

    for candidate in _pan_window_candidates(text):
        normalized = _normalize_pan_ocr_window(candidate)
        if normalized == expected:
            return True
        # Allow minor OCR character errors when the candidate looks like a PAN.
        if re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", normalized or ""):
            if SequenceMatcher(None, expected, normalized).ratio() >= 0.78:
                return True
    return False


def _fuzzy_number_match(expected_number, text, document_type):
    expected = _normalize_upper(expected_number)
    haystack = _normalize_upper(text)
    if not expected or not haystack:
        return False

    if document_type == "pan_card":
        return _pan_number_match(expected, text)

    for value in _id_ocr_alternates(expected):
        if value and value in haystack:
            return True

    # Aadhaar should stay exact-digit based. Fuzzy matching is for OCR character
    # swaps in alphanumeric passport/DL numbers only.
    if document_type == "aadhaar_card":
        return expected in re.sub(r"\D", "", text)

    min_ratio = 0.82 if document_type == "driving_license" else 0.78
    size = len(expected)
    for offset in range(-2, 3):
        window_size = max(4, size + offset)
        for i in range(0, max(1, len(haystack) - window_size + 1)):
            window = haystack[i:i + window_size]
            if SequenceMatcher(None, expected, window).ratio() >= min_ratio:
                return True
            for alt in _id_ocr_alternates(expected):
                if SequenceMatcher(None, alt, window).ratio() >= min_ratio:
                    return True
    return False


def _extract_document_numbers(text):
    raw = _clean(text).upper()
    compact = _normalize_upper(raw)
    digits = re.sub(r"\D", "", raw)

    pan_values = set(re.findall(r"[A-Z]{5}[0-9]{4}[A-Z]", compact))
    # Include PAN-like OCR windows after position-aware normalization.
    for candidate in _pan_window_candidates(raw):
        normalized = _normalize_pan_ocr_window(candidate)
        if re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", normalized or ""):
            pan_values.add(normalized)
    pan_values = sorted(pan_values)

    aadhaar_values = []
    for match in re.findall(r"(?<!\d)(\d{4}\s?\d{4}\s?\d{4})(?!\d)", raw):
        value = re.sub(r"\D", "", match)
        if len(value) == 12:
            aadhaar_values.append(value)
    # fallback over continuous digits, but avoid phone-like 10 digit matches.
    for i in range(0, max(0, len(digits) - 11)):
        value = digits[i:i + 12]
        if len(value) == 12 and value not in aadhaar_values:
            aadhaar_values.append(value)

    passport_values = sorted(set(re.findall(r"[A-Z][0-9]{7}", compact)))

    dl_values = sorted(set(re.findall(r"[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{6,7}", compact)))

    return {
        "pan_card": pan_values,
        "aadhaar_card": aadhaar_values,
        "passport": passport_values,
        "driving_license": dl_values,
    }


def _document_type_score(document_type, text):
    haystack = _clean(text).upper()
    keywords = DOCUMENT_TYPE_KEYWORDS.get(document_type, [])
    if not keywords:
        return 0, []
    matched = [word for word in keywords if word in haystack]
    score = int(round((len(matched) / max(1, min(3, len(keywords)))) * 100))
    return min(score, 100), matched


def _name_match_score(full_name, text):
    expected = _normalize_name(full_name)
    haystack = _normalize_name(text)
    if not expected or not haystack:
        return 0, []

    expected_compact = expected.replace(" ", "")
    haystack_compact = haystack.replace(" ", "")

    if expected_compact and expected_compact in haystack_compact:
        return 100, _name_tokens(expected)

    tokens = _name_tokens(expected)
    if not tokens:
        return 0, []

    matched = []
    for token in tokens:
        if token in haystack:
            matched.append(token)
            continue
        # Allow one/two character OCR mistakes in names.
        best_ratio = 0.0
        for word in haystack.split():
            if abs(len(word) - len(token)) <= 2:
                best_ratio = max(best_ratio, SequenceMatcher(None, token, word).ratio())
        if best_ratio >= 0.82:
            matched.append(token)

    token_score = int(round((len(matched) / len(tokens)) * 100))
    # Also compare the entire expected name against OCR text windows.
    words = haystack.split()
    window_score = 0
    window_size = len(tokens)
    for i in range(0, max(1, len(words) - window_size + 1)):
        window = " ".join(words[i:i + window_size])
        window_score = max(window_score, int(round(SequenceMatcher(None, expected, window).ratio() * 100)))

    return max(token_score, window_score), matched


def scan_kyc_documents(full_name, document_type, document_number, document_front, document_back=None):
    document_type = _clean(document_type).lower()
    document_number = clean_document_number(document_type, document_number)
    full_name = _clean(full_name)

    front_text, front_error = _extract_text_from_filestorage(document_front)
    if front_error:
        return {
            "success": False,
            "message": front_error,
            "errors": {"document_front": front_error},
            "status_code": 422,
        }

    back_text = ""
    if document_back and getattr(document_back, "filename", ""):
        back_text, back_error = _extract_text_from_filestorage(document_back)
        if back_error:
            return {
                "success": False,
                "message": back_error,
                "errors": {"document_back": back_error},
                "status_code": 422,
            }

    ocr_text = "\n".join([front_text, back_text]).strip()
    if len(_normalize_upper(ocr_text)) < 20:
        return {
            "success": False,
            "message": "OCR could not detect readable text. Upload a clearer, well-lit document image.",
            "errors": {"document_front": "OCR could not detect readable text. Upload a clearer, well-lit document image."},
            "status_code": 422,
        }

    extracted_numbers = _extract_document_numbers(ocr_text)
    expected_number = _normalize_upper(document_number)
    found_numbers = [_normalize_upper(n) for n in extracted_numbers.get(document_type, [])]
    number_match = expected_number in found_numbers or _fuzzy_number_match(expected_number, ocr_text, document_type)

    name_score, matched_name_tokens = _name_match_score(full_name, ocr_text)
    doc_score, matched_doc_keywords = _document_type_score(document_type, ocr_text)

    # If OCR found even one strong keyword for the selected document type, do
    # not show a confusing "wrong document" error. Number/name errors will still
    # be shown separately.
    if matched_doc_keywords:
        doc_score = max(doc_score, 60)

    # If the ID number matches, the selected document is very likely correct.
    # PAN cards in WhatsApp photos often OCR only the word "PAN" and the number,
    # so raise the document score when the number is verified.
    if number_match and matched_doc_keywords:
        doc_score = max(doc_score, 100)
    elif number_match and doc_score < 70:
        doc_score = 70

    errors = {}
    if doc_score < 35:
        errors["document_type"] = f"Uploaded file does not look like {document_type_label(document_type)}. Select the correct document type or upload the correct document."

    if not number_match:
        label = document_type_label(document_type)
        errors["document_number"] = f"{label} number does not match the uploaded document. Enter the exact number printed on the document."

    if name_score < 70:
        errors["full_name"] = "Full name does not match the uploaded document clearly. Enter the exact name printed on the document or upload a clearer image."

    score = int(round((name_score * 0.45) + ((100 if number_match else 0) * 0.4) + (doc_score * 0.15)))
    result = {
        "document_type": document_type,
        "document_type_label": document_type_label(document_type),
        "document_number": document_number,
        "full_name": full_name,
        "score": max(0, min(100, score)),
        "name_score": name_score,
        "number_match": number_match,
        "document_score": doc_score,
        "matched_name_tokens": matched_name_tokens,
        "matched_document_keywords": matched_doc_keywords,
        "detected_numbers": extracted_numbers,
        "ocr_preview": " ".join(ocr_text.split())[:800],
    }

    if errors:
        if "document_type" in errors:
            message = errors["document_type"]
        elif "document_number" in errors:
            message = errors["document_number"]
        elif "full_name" in errors:
            message = errors["full_name"]
        else:
            message = "KYC scan failed. Please correct the highlighted details or upload a clearer matching document."
        return {
            "success": False,
            "message": message,
            "errors": errors,
            "data": {"scan": result},
            "status_code": 422,
        }

    return {
        "success": True,
        "message": "KYC scan passed. This document can be auto-approved.",
        "data": {"scan": result},
        "status_code": 200,
    }


def extract_name_from_aadhaar_ocr(text, email=""):
    lines = [line.strip() for line in text.split("\n") if line.strip()]

    headers = [
        "government", "india", "unique", "identification", "authority", "uidai",
        "government of india", "भारत सरकार", "ભારત સરકાર", "યૂનિક", "ઓળખ", "પ્રાધિકરણ"
    ]

    footprints = ["dob", "date of birth", "birth", "yob", "year", "male", "female", "gender", "father", "husband"]

    exclude_keywords = [
        "whatsapp", "screenshot", "status", "message", "chat", "online", "yesterday", "today",
        "delivered", "read", "type a message", "type a", "camera", "gallery", "photo", "document",
        "selected", "items", "files", "sent", "receive", "pm", "am", "clock", "battery", "wi-fi", "wifi"
    ]

    possible_names = []

    for line in lines:
        line_lower = line.lower()

        # Filter out system/headers, footprints, and screenshot metadata
        if any(h in line_lower for h in headers):
            continue

        if any(f in line_lower for f in footprints):
            continue

        if any(ex in line_lower for ex in exclude_keywords):
            continue

        # Check if line contains digits (names shouldn't)
        if any(c.isdigit() for c in line):
            continue

        cleaned_line = re.sub(r"[^A-Za-z ]", "", line).strip()
        
        # Clean up leading/trailing single and double letter artifacts (like "A I ")
        words = cleaned_line.split()
        while words and len(words[0]) <= 2 and words[0].upper() not in ["SR", "DR", "MR", "MS"]:
            words.pop(0)
        while words and len(words[-1]) <= 2 and words[-1].upper() not in ["JR", "II", "III"]:
            words.pop(-1)
        cleaned_line = " ".join(words)

        # Full names usually have at least two words and reasonable length
        if len(cleaned_line) >= 3 and len(cleaned_line) <= 40 and len(cleaned_line.split()) >= 2:
            possible_names.append(cleaned_line)


    if not possible_names:
        return "Aadhaar Holder"

    if email and "@" in email:
        username = email.split("@")[0].lower()
        cleaned_username = "".join(c for c in username if c.isalpha())

        best_name = possible_names[0]
        best_score = 0

        for name in possible_names:
            name_clean = "".join(c for c in name if c.isalpha()).lower()
            name_words = [w.lower() for w in name.split() if len(w) >= 3]
            
            # Base sequence similarity score
            score = SequenceMatcher(None, name_clean, cleaned_username).ratio()

            # Word-level overlap matching bonus
            word_match_bonus = 0
            for w in name_words:
                if w in cleaned_username or cleaned_username in w:
                    word_match_bonus += 0.8
                else:
                    for chunk_len in [5, 6, 7, 8]:
                        if len(cleaned_username) >= chunk_len:
                            for i in range(len(cleaned_username) - chunk_len + 1):
                                chunk = cleaned_username[i:i+chunk_len]
                                sim = SequenceMatcher(None, w, chunk).ratio()
                                if sim > 0.8:
                                    word_match_bonus += sim * 0.5
                                    break

            total_score = score + word_match_bonus

            # Bonus for typical Indian/Gujarati name suffixes
            if any(name_clean.endswith(suffix) for suffix in ["bhai", "ben", "kumar", "devi", "singh", "sen", "lal", "sukh"]):
                total_score += 0.2

            # Prefix matches bonus
            if name_clean.startswith(cleaned_username[:3]):
                total_score += 0.3

            if total_score > best_score:
                best_score = total_score
                best_name = name

        if best_score > 0.3:
            return best_name.title()

    return possible_names[0].title()




def extract_name_from_filename(filename):
    if not filename:
        return ""
    base = os.path.splitext(filename)[0]
    base = base.replace("_", " ").replace("-", " ")
    base = re.sub(r"(?i)\b(front|back|card|aadhaar|adhar|copy|scan|photo|img|image|test|doc|document)\b", "", base)
    cleaned = re.sub(r"[^A-Za-z ]", "", base).strip()
    if len(cleaned) >= 3:
        return cleaned.title()
    return ""


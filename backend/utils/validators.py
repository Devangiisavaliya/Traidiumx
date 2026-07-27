import re

from email_validator import validate_email, EmailNotValidError


def validate_required(value):
    return value is not None and str(value).strip() != ""


def clean_string(value):
    if value is None:
        return ""

    return str(value).strip()


def validate_name(name):
    name = clean_string(name)

    if len(name) < 2:
        return False, "Name must be at least 2 characters."

    if len(name) > 60:
        return False, "Name must not be greater than 60 characters."

    if not re.match(r"^[A-Za-z ]+$", name):
        return False, "Name must contain only letters and spaces."

    return True, ""


def validate_mobile(mobile):
    mobile = clean_string(mobile)

    if not re.match(r"^[6-9][0-9]{9}$", mobile):
        return False, "Mobile number must be 10 digits and start with 6, 7, 8 or 9."

    return True, ""


def validate_email_address(email):
    email = clean_string(email).lower()

    try:
        validate_email(email, check_deliverability=False)
        return True, ""

    except EmailNotValidError:
        return False, "Please enter a valid email address."


def validate_password_strength(password):
    if not password:
        return False, "Password is required."

    if len(password) < 8:
        return False, "Password must be at least 8 characters."

    if len(password) > 64:
        return False, "Password must not be greater than 64 characters."

    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."

    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."

    if not re.search(r"[0-9]", password):
        return False, "Password must contain at least one number."

    if not re.search(r"[@$!%*?&]", password):
        return False, "Password must contain at least one special character from @$!%*?&."

    return True, ""


def validate_positive_number(value, field_name):
    try:
        number = float(value)

        if number <= 0:
            return False, f"{field_name} must be greater than 0."

        return True, ""

    except (TypeError, ValueError):
        return False, f"{field_name} must be a valid number."


def validate_pan_number(pan_number):
    pan_number = clean_string(pan_number).upper()

    if not re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$", pan_number):
        return False, "PAN number must be in valid format. Example: ABCDE1234F."

    return True, ""


def validate_document_type(document_type):
    document_type = clean_string(document_type).lower()

    allowed_types = ["pan_card", "aadhaar_card", "passport", "driving_license"]

    if document_type not in allowed_types:
        return False, "Document type must be one of: pan_card, aadhaar_card, passport, driving_license."

    return True, ""


def validate_aadhaar_number(aadhaar_number):
    aadhaar_number = re.sub(r"\D", "", clean_string(aadhaar_number))

    if not re.match(r"^[0-9]{12}$", aadhaar_number):
        return False, "Aadhaar number must be exactly 12 digits."

    return True, ""


def validate_passport_number(passport_number):
    passport_number = clean_string(passport_number).upper().replace(" ", "")

    if not re.match(r"^[A-Z][0-9]{7}$", passport_number):
        return False, "Passport number must be in valid format. Example: A1234567."

    return True, ""


def validate_driving_license_number(license_number):
    license_number = clean_string(license_number).upper().replace(" ", "").replace("-", "")

    if not re.match(r"^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{6,7}$", license_number):
        return False, "Driving License number must be valid. Example: GJ0120201234567."

    return True, ""


def document_type_label(document_type):
    value = clean_string(document_type).lower()
    labels = {
        "pan_card": "PAN Card",
        "aadhaar_card": "Aadhaar Card",
        "passport": "Passport",
        "driving_license": "Driving License",
    }
    return labels.get(value, "KYC Document")


def document_number_label(document_type):
    value = clean_string(document_type).lower()
    labels = {
        "pan_card": "PAN Number",
        "aadhaar_card": "Aadhaar Number",
        "passport": "Passport Number",
        "driving_license": "Driving License Number",
    }
    return labels.get(value, "Document Number")


def clean_document_number(document_type, document_number):
    value = clean_string(document_number).upper()
    if clean_string(document_type).lower() == "aadhaar_card":
        return re.sub(r"\D", "", value)
    return value.replace(" ", "").replace("-", "")


def validate_kyc_document_number(document_type, document_number):
    document_type = clean_string(document_type).lower()
    document_number = clean_document_number(document_type, document_number)

    if document_type == "pan_card":
        return validate_pan_number(document_number)
    if document_type == "aadhaar_card":
        return validate_aadhaar_number(document_number)
    if document_type == "passport":
        return validate_passport_number(document_number)
    if document_type == "driving_license":
        return validate_driving_license_number(document_number)

    return False, "Select a valid document type."


def validate_market_symbol(symbol):
    symbol = clean_string(symbol).upper()

    if not re.match(r"^[A-Z0-9]{5,20}$", symbol):
        return False, "Symbol must be valid. Example: BTCUSDT or XAUUSD."

    supported_commodity_symbols = ["XAUUSD", "GOLDUSD"]

    if symbol.endswith("USDT"):
        return True, ""

    if symbol in supported_commodity_symbols:
        return True, ""

    return False, "Only USDT crypto futures and supported commodity symbols like XAUUSD are allowed."

import random

from pymongo.errors import DuplicateKeyError

from config.settings import settings
from models.email_verification_model import (
    create_email_registration_request,
    find_pending_email_registration_request,
    hash_verification_code,
    increment_email_verification_attempts,
    mark_email_registration_request_verified,
    reserve_email_verification_code_send,
)
from models.user_model import (
    create_google_user,
    create_user,
    find_user_by_email,
    find_user_by_client_id,
    find_user_by_id,
    find_user_by_google_sub,
    find_user_by_mobile,
    format_user,
    link_google_to_user,
    update_last_login,
)
from models.wallet_model import create_default_wallet
from services.email_service import send_google_login_alert_email, send_signup_verification_code_email
from services.google_oauth_service import verify_google_id_token
from services.user_status_service import build_account_status_service_result, is_user_active
from utils.jwt_helper import generate_token
from utils.password_helper import hash_password, verify_password
from utils.security import sanitize_text
from utils.validators import (
    clean_string,
    validate_email_address,
    validate_mobile,
    validate_name,
    validate_password_strength
)


def _create_login_payload(user):
    token = generate_token(
        user_id=str(user["_id"]),
        email=user["email"],
        role=user.get("role", "user")
    )

    return {
        "user": format_user(user),
        "token": token
    }


def _record_referral_if_available(referrer_code, referred_user_id):
    code = clean_string(referrer_code).upper()

    if not code:
        return

    try:
        from services.referral_service import record_referral_registration
        record_referral_registration(
            referral_code=code,
            referred_user_id=str(referred_user_id)
        )
    except Exception:
        # Referral should never break core registration.
        return


def _normalise_registration_payload(data):
    email = clean_string(data.get("email")).lower()
    name = sanitize_text(clean_string(data.get("name")))
    if not name and email:
        username = email.split("@")[0] if "@" in email else ""
        cleaned_username = "".join(c for c in username if c.isalpha())
        if len(cleaned_username) >= 2:
            name = cleaned_username.capitalize()
        else:
            name = "Trader"
    elif not name:
        name = "Trader"

    return {
        "name": name,
        "email": email,
        "mobile": clean_string(data.get("mobile")),
        "password": data.get("password", ""),
        "confirm_password": data.get("confirm_password", ""),
        "referral_code": clean_string(data.get("referral_code") or data.get("referral")).upper()
    }



def _validate_registration_payload(payload):
    errors = {}

    is_valid_name, name_error = validate_name(payload["name"])
    if not is_valid_name:
        errors["name"] = name_error

    is_valid_email, email_error = validate_email_address(payload["email"])
    if not is_valid_email:
        errors["email"] = email_error

    is_valid_mobile, mobile_error = validate_mobile(payload["mobile"])
    if not is_valid_mobile:
        errors["mobile"] = mobile_error

    is_valid_password, password_error = validate_password_strength(payload["password"])
    if not is_valid_password:
        errors["password"] = password_error

    if payload["password"] != payload["confirm_password"]:
        errors["confirm_password"] = "Password and confirm password do not match."

    if len(payload["referral_code"]) > 16:
        errors["referral_code"] = "Referral code must not be greater than 16 characters."

    return errors


def _validate_new_user_uniqueness(email, mobile):
    if find_user_by_email(email):
        return {
            "email": "This email is already used."
        }

    if find_user_by_mobile(mobile):
        return {
            "mobile": "This mobile number is already used."
        }

    return {}


def _masked_email(email):
    safe_email = clean_string(email).lower()
    if "@" not in safe_email:
        return safe_email

    name, domain = safe_email.split("@", 1)
    if len(name) <= 2:
        masked_name = f"{name[:1]}***"
    else:
        masked_name = f"{name[:2]}***{name[-1]}"

    return f"{masked_name}@{domain}"


def _generate_email_code():
    return str(random.randint(100000, 999999))


def start_email_registration(data, client_ip="", user_agent=""):
    """Validate email sign-up details and send a one-time verification code.

    The user and wallet are not created until verify_email_registration succeeds.
    Google sign-up remains separate and unchanged.
    """

    payload = _normalise_registration_payload(data)
    errors = _validate_registration_payload(payload)

    if errors:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": errors,
            "status_code": 422
        }

    uniqueness_errors = _validate_new_user_uniqueness(payload["email"], payload["mobile"])
    if uniqueness_errors:
        return {
            "success": False,
            "message": "User already exists.",
            "errors": uniqueness_errors,
            "status_code": 409
        }

    max_requests = int(getattr(settings, "REGISTER_EMAIL_CODE_MAX_REQUESTS", 3) or 3)
    limit_minutes = int(getattr(settings, "REGISTER_EMAIL_CODE_LIMIT_MINUTES", 30) or 30)
    rate_limit = reserve_email_verification_code_send(
        payload["email"],
        max_requests=max_requests,
        window_minutes=limit_minutes
    )

    if not rate_limit.get("allowed"):
        retry_after_seconds = int(rate_limit.get("retry_after_seconds", limit_minutes * 60) or (limit_minutes * 60))
        retry_after_minutes = max(1, (retry_after_seconds + 59) // 60)

        return {
            "success": False,
            "message": "Too many verification code requests.",
            "errors": {
                "email": f"You can send a verification code only {max_requests} times. Please try again after {retry_after_minutes} minutes.",
                "retry_after_seconds": retry_after_seconds,
                "resend_limit_minutes": limit_minutes
            },
            "status_code": 429
        }

    verification_code = _generate_email_code()
    expires_seconds = int(getattr(settings, "REGISTER_EMAIL_CODE_SECONDS", 120) or 120)
    if expires_seconds <= 0:
        expires_seconds = 120
    expires_minutes = max(1, (expires_seconds + 59) // 60)

    pending = create_email_registration_request(
        registration_data={
            "name": payload["name"],
            "email": payload["email"],
            "mobile": payload["mobile"],
            "password_hash": hash_password(payload["password"]),
            "referral_code": payload["referral_code"],
        },
        verification_code=verification_code,
        expires_seconds=expires_seconds,
        client_ip=client_ip,
        user_agent=user_agent
    )

    email_result = send_signup_verification_code_email(
        to_email=payload["email"],
        code=verification_code,
        expires_seconds=expires_seconds,
        expires_minutes=expires_minutes
    )

    data_payload = {
        "verification_required": True,
        "pending_id": str(pending["_id"]),
        "email": payload["email"],
        "masked_email": _masked_email(payload["email"]),
        "expires_seconds": expires_seconds,
        "expires_minutes": expires_minutes,
        "email_sent": email_result.get("sent", False),
        "email_delivery_note": email_result.get("reason", ""),
        "resend_remaining": int(rate_limit.get("remaining", 0) or 0),
        "resend_limit": int(rate_limit.get("max_requests", max_requests) or max_requests),
        "resend_limit_minutes": int(rate_limit.get("window_minutes", limit_minutes) or limit_minutes),
        "resend_locked_until": rate_limit.get("locked_until").isoformat() if rate_limit.get("locked_until") else ""
    }

    # Local development helper only. Keep disabled in production .env.
    if not email_result.get("sent") and getattr(settings, "REGISTER_EMAIL_DEV_CODE_ENABLED", True):
        data_payload["dev_code"] = verification_code

    message = "Verification code sent to your email."
    if not email_result.get("sent"):
        message = "Verification code generated. Email delivery is not configured."

    return {
        "success": True,
        "message": message,
        "data": data_payload,
        "status_code": 200
    }


def verify_email_registration(data):
    pending_id = clean_string(data.get("pending_id"))
    email = clean_string(data.get("email")).lower()
    code = clean_string(data.get("code") or data.get("verification_code"))

    errors = {}

    if not pending_id:
        errors["pending_id"] = "Verification request is missing. Please request a new code."

    is_valid_email, email_error = validate_email_address(email)
    if not is_valid_email:
        errors["email"] = email_error

    if not code or len(code) != 6 or not code.isdigit():
        errors["code"] = "Enter the 6 digit verification code sent to your email."

    if errors:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": errors,
            "status_code": 422
        }

    pending = find_pending_email_registration_request(pending_id=pending_id, email=email)

    if not pending:
        return {
            "success": False,
            "message": "Verification code expired or invalid.",
            "errors": {
                "code": "Code expired. Please resend verification code."
            },
            "status_code": 410
        }

    attempts = int(pending.get("attempts", 0) or 0)
    max_attempts = int(pending.get("max_attempts", 5) or 5)

    if attempts >= max_attempts:
        return {
            "success": False,
            "message": "Too many invalid verification attempts.",
            "errors": {
                "code": "Please resend verification code and try again."
            },
            "status_code": 429
        }

    expected_hash = pending.get("code_hash", "")
    provided_hash = hash_verification_code(email, code)

    if provided_hash != expected_hash:
        increment_email_verification_attempts(pending_id)
        return {
            "success": False,
            "message": "Invalid verification code.",
            "errors": {
                "code": "Verification code is incorrect."
            },
            "status_code": 422
        }

    # Re-check duplicates at final creation time to handle race conditions.
    uniqueness_errors = _validate_new_user_uniqueness(email, pending.get("mobile"))
    if uniqueness_errors:
        return {
            "success": False,
            "message": "User already exists.",
            "errors": uniqueness_errors,
            "status_code": 409
        }

    try:
        user_id = create_user({
            "name": pending.get("name", ""),
            "email": email,
            "mobile": pending.get("mobile", ""),
            "password_hash": pending.get("password_hash", ""),
            "auth_provider": "password",
            "email_verified": True,
        })

        create_default_wallet(user_id)
        _record_referral_if_available(pending.get("referral_code", ""), user_id)
        mark_email_registration_request_verified(pending_id, user_id=user_id)

        user = find_user_by_email(email)

        return {
            "success": True,
            "message": "Email verified and account created successfully.",
            "data": _create_login_payload(user),
            "status_code": 201
        }

    except DuplicateKeyError:
        return {
            "success": False,
            "message": "User already exists.",
            "errors": {
                "duplicate": "Email or mobile number already exists."
            },
            "status_code": 409
        }


def register_user(data):
    """Backward-compatible register endpoint.

    Without a code, it starts email verification. With pending_id + code, it verifies
    and creates the user. This prevents unverified email registration while keeping
    the existing /api/auth/register path safe.
    """

    if data.get("pending_id") and (data.get("code") or data.get("verification_code")):
        return verify_email_registration(data)

    return start_email_registration(data)


def login_user(data):
    from utils.validators import validate_email_address
    email = clean_string(data.get("email")).lower()
    password = data.get("password", "")

    errors = {}

    is_client_id = email.isdigit() and len(email) == 6

    if not is_client_id:
        is_valid_email, email_error = validate_email_address(email)
        if not is_valid_email:
            errors["email"] = email_error

    if not password:
        errors["password"] = "Password is required."

    if errors:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": errors,
            "status_code": 422
        }

    if is_client_id:
        user = find_user_by_client_id(email)
    else:
        user = find_user_by_email(email)

    if not user:
        return {
            "success": False,
            "message": "Invalid credentials.",
            "errors": {
                "credentials": "Invalid email/client ID or password."
            },
            "status_code": 401
        }

    if not is_user_active(user):
        return build_account_status_service_result(user)

    if not verify_password(password, user.get("password_hash")):
        return {
            "success": False,
            "message": "Invalid email or password.",
            "errors": {
                "credentials": "Invalid email or password."
            },
            "status_code": 401
        }

    update_last_login(str(user["_id"]))
    user = find_user_by_id(user["_id"])

    return {
        "success": True,
        "message": "Login successful.",
        "data": _create_login_payload(user),
        "status_code": 200
    }


def google_auth_user(data, client_ip="", user_agent=""):
    credential = data.get("credential") or data.get("id_token")
    referral_code = clean_string(data.get("referral_code") or data.get("referral")).upper()

    verified = verify_google_id_token(credential)

    if not verified.get("success"):
        return verified

    google_profile = verified["data"]
    google_sub = google_profile["google_sub"]
    email = google_profile["email"]

    user = find_user_by_google_sub(google_sub)

    if not user:
        user = find_user_by_email(email)

        if user:
            if not is_user_active(user):
                return build_account_status_service_result(user)

            link_google_to_user(str(user["_id"]), google_profile)
            update_last_login(str(user["_id"]))
            user = find_user_by_email(email)

        else:
            try:
                user_id = create_google_user(google_profile)
                create_default_wallet(user_id)
                _record_referral_if_available(referral_code, user_id)
                user = find_user_by_email(email)

            except DuplicateKeyError:
                return {
                    "success": False,
                    "message": "Google account already exists.",
                    "errors": {
                        "google": "This Google account is already linked. Please login."
                    },
                    "status_code": 409
                }

    if not is_user_active(user):
        return build_account_status_service_result(user)

    update_last_login(str(user["_id"]))
    user = find_user_by_email(email)

    # Google login alert email should never block login.
    email_result = send_google_login_alert_email(
        to_email=email,
        user_name=user.get("name", ""),
        client_ip=client_ip,
        user_agent=user_agent
    )

    login_payload = _create_login_payload(user)
    login_payload["login_alert_email_sent"] = email_result.get("sent", False)
    login_payload["login_alert_email_note"] = email_result.get("reason", "")

    return {
        "success": True,
        "message": "Google sign-up successful.",
        "data": login_payload,
        "status_code": 200
    }

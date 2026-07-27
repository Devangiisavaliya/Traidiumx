from datetime import timedelta
from secrets import randbelow, token_urlsafe

from config.settings import settings
from models.password_reset_model import (
    count_recent_password_reset_requests,
    create_password_reset_request,
    expire_active_password_reset_tokens_for_user,
    find_active_password_reset_code,
    find_active_password_reset_token,
    hash_reset_code,
    hash_reset_token,
    mark_password_reset_code_verified,
    mark_password_reset_token_used,
    normalize_reset_code,
)
from models.user_model import find_user_by_email, update_user_password
from services.email_service import send_password_reset_code_email
from utils.date_helper import now_utc
from utils.password_helper import hash_password
from utils.validators import clean_string, validate_email_address, validate_password_strength


GENERIC_RESET_MESSAGE = "If this email exists in TraidiumX, a password reset code has been sent."


def _is_development_mode():
    return str(settings.APP_ENV or "development").lower() != "production"


def _build_frontend_reset_url(base_url, token):
    """Legacy helper kept for older local reset-link tests."""
    base = str(base_url or "").rstrip("/")

    if not base:
        base = "http://127.0.0.1:5000"

    return f"{base}/src/pages/forgot-password.html?token={token}"


def _generate_password_reset_code():
    return f"{randbelow(1000000):06d}"


def _find_active_reset_user(email):
    user = find_user_by_email(email)

    if not user:
        return None

    if str(user.get("account_status", "active")).lower() not in {"active", "verified"}:
        return None

    return user


def request_password_reset(data, base_url=None, client_ip="", user_agent=""):
    email = clean_string(data.get("email")).lower()

    is_valid_email, email_error = validate_email_address(email)
    if not is_valid_email:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": {"email": email_error},
            "status_code": 422
        }

    user = _find_active_reset_user(email)

    # Do not reveal whether the email exists or whether the account can reset.
    if not user:
        return {
            "success": True,
            "message": GENERIC_RESET_MESSAGE,
            "data": {
                "email_queued": True,
                "account_checked": False
            },
            "status_code": 200
        }

    recent_count = count_recent_password_reset_requests(
        email=email,
        window_minutes=60
    )

    if recent_count >= settings.PASSWORD_RESET_MAX_REQUESTS_PER_HOUR:
        return {
            "success": False,
            "message": "Too many reset requests.",
            "errors": {
                "email": "Too many password reset requests. Please try again later."
            },
            "status_code": 429
        }

    reset_code = _generate_password_reset_code()
    expires_at = now_utc() + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_MINUTES)

    # Keep the unique token_hash field for database compatibility, but email the
    # six digit reset_code instead of a reset link.
    internal_token_hash = hash_reset_token(token_urlsafe(40))
    reset_code_hash = hash_reset_code(str(user["_id"]), email, reset_code)

    expire_active_password_reset_tokens_for_user(str(user["_id"]))

    create_password_reset_request(
        user_id=str(user["_id"]),
        email=email,
        token_hash=internal_token_hash,
        reset_code_hash=reset_code_hash,
        expires_at=expires_at,
        client_ip=client_ip,
        user_agent=user_agent
    )

    email_status = send_password_reset_code_email(
        to_email=email,
        code=reset_code,
        expires_minutes=settings.PASSWORD_RESET_TOKEN_MINUTES
    )

    response_data = {
        "email_queued": True,
        "email_sent": bool(email_status.get("sent")),
        "reset_method": "code",
        "expires_at": expires_at.isoformat(),
        "expires_in_minutes": settings.PASSWORD_RESET_TOKEN_MINUTES
    }

    # Development diagnostics are useful locally, but production must not expose
    # reset codes or SMTP internals.
    if _is_development_mode():
        response_data["email_delivery_note"] = email_status.get("reason")
        if settings.PASSWORD_RESET_DEV_LINK_ENABLED:
            response_data["dev_reset_code"] = reset_code

    return {
        "success": True,
        "message": GENERIC_RESET_MESSAGE,
        "data": response_data,
        "status_code": 200
    }


def verify_password_reset_code(data):
    email = clean_string(data.get("email")).lower()
    code = normalize_reset_code(data.get("code"))

    errors = {}

    is_valid_email, email_error = validate_email_address(email)
    if not is_valid_email:
        errors["email"] = email_error

    if len(code) != 6:
        errors["code"] = "Enter the 6 digit reset code."

    if errors:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": errors,
            "status_code": 422
        }

    user = _find_active_reset_user(email)
    reset_record = find_active_password_reset_code(str(user["_id"]), email, code) if user else None

    if not reset_record:
        return {
            "success": False,
            "message": "Reset code is invalid or expired.",
            "errors": {
                "code": "This reset code is invalid, expired or already used."
            },
            "status_code": 400
        }

    mark_password_reset_code_verified(reset_record["_id"])

    return {
        "success": True,
        "message": "Reset code verified. Enter your new password.",
        "data": {
            "email": email,
            "code_verified": True,
            "reset_ready": True
        },
        "status_code": 200
    }


def reset_password_with_code(data):
    email = clean_string(data.get("email")).lower()
    code = normalize_reset_code(data.get("code") or data.get("reset_code"))
    password = data.get("password", "")
    confirm_password = data.get("confirm_password", "")

    errors = {}

    is_valid_email, email_error = validate_email_address(email)
    if not is_valid_email:
        errors["email"] = email_error

    if len(code) != 6:
        errors["code"] = "Enter the 6 digit reset code."

    is_valid_password, password_error = validate_password_strength(password)
    if not is_valid_password:
        errors["password"] = password_error

    if password != confirm_password:
        errors["confirm_password"] = "Password and confirm password do not match."

    if errors:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": errors,
            "status_code": 422
        }

    user = _find_active_reset_user(email)
    reset_record = find_active_password_reset_code(str(user["_id"]), email, code) if user else None

    if not reset_record:
        return {
            "success": False,
            "message": "Reset code is invalid or expired.",
            "errors": {
                "code": "This reset code is invalid, expired or already used."
            },
            "status_code": 400
        }

    update_user_password(reset_record["user_id"], hash_password(password))
    mark_password_reset_token_used(reset_record["_id"])
    expire_active_password_reset_tokens_for_user(reset_record["user_id"])

    return {
        "success": True,
        "message": "Password reset successfully. Please login with your new password.",
        "data": {},
        "status_code": 200
    }


def reset_password_with_token(data):
    """Legacy reset-link support retained for older reset links.

    The active forgot-password UI now uses email reset codes. This function stays
    available so old local links do not break while the new code flow is used.
    """
    token = clean_string(data.get("token"))
    password = data.get("password", "")
    confirm_password = data.get("confirm_password", "")

    errors = {}

    if not token or len(token) < 32:
        errors["token"] = "Reset token is invalid or missing."

    is_valid_password, password_error = validate_password_strength(password)
    if not is_valid_password:
        errors["password"] = password_error

    if password != confirm_password:
        errors["confirm_password"] = "Password and confirm password do not match."

    if errors:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": errors,
            "status_code": 422
        }

    reset_record = find_active_password_reset_token(hash_reset_token(token))

    if not reset_record:
        return {
            "success": False,
            "message": "Reset link is invalid or expired.",
            "errors": {
                "token": "This reset link is invalid, expired or already used."
            },
            "status_code": 400
        }

    update_user_password(reset_record["user_id"], hash_password(password))
    mark_password_reset_token_used(reset_record["_id"])
    expire_active_password_reset_tokens_for_user(reset_record["user_id"])

    return {
        "success": True,
        "message": "Password reset successfully. Please login with your new password.",
        "data": {},
        "status_code": 200
    }

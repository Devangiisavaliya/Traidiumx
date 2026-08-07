from models.user_model import (
    find_user_by_id,
    find_user_by_mobile,
    format_user,
    get_users_collection,
    update_user_password
)
from utils.date_helper import now_utc
from utils.security import sanitize_text
from utils.password_helper import hash_password, verify_password
from utils.validators import (
    clean_string,
    validate_mobile,
    validate_name,
    validate_password_strength
)


def get_user_profile(user):
    return {
        "success": True,
        "message": "User profile fetched successfully.",
        "data": {
            "user": format_user(user)
        },
        "status_code": 200
    }


def update_user_profile(user, data):
    name = sanitize_text(clean_string(data.get("name")))
    mobile = clean_string(data.get("mobile"))

    errors = {}
    update_data = {}

    if "name" in data:
        is_valid_name, name_error = validate_name(name)

        if not is_valid_name:
            errors["name"] = name_error
        else:
            update_data["name"] = name

    if "mobile" in data:
        is_valid_mobile, mobile_error = validate_mobile(mobile)

        if not is_valid_mobile:
            errors["mobile"] = mobile_error
        else:
            existing_mobile_user = find_user_by_mobile(mobile)

            if existing_mobile_user and str(existing_mobile_user["_id"]) != str(user["_id"]):
                errors["mobile"] = "This mobile number is already used."
            else:
                update_data["mobile"] = mobile

    if "two_factor_enabled" in data:
        update_data["two_factor_enabled"] = bool(data["two_factor_enabled"])

    if errors:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": errors,
            "status_code": 422
        }

    if not update_data:
        return {
            "success": False,
            "message": "No valid data provided for update.",
            "errors": {
                "profile": "Please provide name, mobile or two-factor setting to update."
            },
            "status_code": 400
        }

    update_data["updated_at"] = now_utc()

    get_users_collection().update_one(
        {
            "_id": user["_id"]
        },
        {
            "$set": update_data
        }
    )

    updated_user = find_user_by_id(str(user["_id"]))

    return {
        "success": True,
        "message": "User profile updated successfully.",
        "data": {
            "user": format_user(updated_user)
        },
        "status_code": 200
    }


def change_user_password(user, data):
    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")
    confirm_password = data.get("confirm_password", "")

    errors = {}

    password_hash = user.get("password_hash", "")
    requires_current_password = bool(password_hash)

    if requires_current_password and not current_password:
        errors["current_password"] = "Current password is required."
    elif requires_current_password and not verify_password(current_password, password_hash):
        errors["current_password"] = "Current password is incorrect."

    is_valid_password, password_error = validate_password_strength(new_password)
    if not is_valid_password:
        errors["new_password"] = password_error

    if new_password != confirm_password:
        errors["confirm_password"] = "New password and confirm password do not match."

    if requires_current_password and current_password and new_password and current_password == new_password:
        errors["new_password"] = "New password must be different from current password."

    if errors:
        return {
            "success": False,
            "message": "Password change validation failed.",
            "errors": errors,
            "status_code": 422,
        }

    update_user_password(str(user["_id"]), hash_password(new_password))
    updated_user = find_user_by_id(str(user["_id"]))

    return {
        "success": True,
        "message": "Password changed successfully.",
        "data": {
            "user": format_user(updated_user),
        },
        "status_code": 200,
    }


def request_two_factor_toggle(user, action):
    from services.auth_service import _generate_email_code
    from models.email_verification_model import create_email_registration_request
    from services.email_service import send_2fa_toggle_code_email
    from config.settings import settings

    if action not in ["enable", "disable"]:
        return {
            "success": False,
            "message": "Invalid action.",
            "status_code": 400
        }

    current_enabled = bool(user.get("two_factor_enabled", False))
    if action == "enable" and current_enabled:
        return {
            "success": False,
            "message": "Two-Factor Authentication is already enabled.",
            "status_code": 400
        }
    if action == "disable" and not current_enabled:
        return {
            "success": False,
            "message": "Two-Factor Authentication is already disabled.",
            "status_code": 400
        }

    verification_code = _generate_email_code()
    expires_seconds = 120

    pending = create_email_registration_request(
        registration_data={
            "email": user["email"],
            "password_hash": user.get("password_hash", "")
        },
        verification_code=verification_code,
        expires_seconds=expires_seconds
    )

    email_result = send_2fa_toggle_code_email(
        to_email=user["email"],
        code=verification_code,
        action=action,
        expires_seconds=expires_seconds
    )

    if not email_result.get("sent") and getattr(settings, "REGISTER_EMAIL_DEV_CODE_ENABLED", True):
        print(f"\n[DEV MODE] 2FA {action} code for {user['email']}: {verification_code}\n")

    from services.auth_service import _masked_email
    masked_email = _masked_email(user["email"])

    return {
        "success": True,
        "message": f"Verification code sent to your email to {action} 2FA.",
        "data": {
            "pending_id": str(pending["_id"]),
            "email": user["email"],
            "masked_email": masked_email,
            "expires_seconds": expires_seconds
        },
        "status_code": 200
    }


def verify_two_factor_toggle(user, data):
    from models.email_verification_model import (
        find_pending_email_registration_request,
        mark_email_registration_request_verified,
        hash_verification_code,
        increment_email_verification_attempts
    )
    from models.user_model import get_users_collection, find_user_by_id, format_user

    code = clean_string(data.get("code"))
    pending_id = clean_string(data.get("pending_id"))
    action = clean_string(data.get("action"))

    if not code or not pending_id or action not in ["enable", "disable"]:
        return {
            "success": False,
            "message": "Verification code, action, and pending ID are required.",
            "status_code": 422
        }

    email = user["email"]
    pending = find_pending_email_registration_request(pending_id=pending_id, email=email)
    if not pending:
        return {
            "success": False,
            "message": "Verification code has expired or is invalid.",
            "errors": {
                "code": "Verification code has expired or is invalid."
            },
            "status_code": 400
        }

    if pending.get("attempts", 0) >= pending.get("max_attempts", 5):
        return {
            "success": False,
            "message": "Too many failed verification attempts. Please request a new code.",
            "errors": {
                "code": "Too many failed verification attempts. Please request a new code."
            },
            "status_code": 400
        }

    provided_hash = hash_verification_code(email, code)
    if pending.get("code_hash") != provided_hash:
        increment_email_verification_attempts(pending["_id"])
        return {
            "success": False,
            "message": "Incorrect verification code.",
            "errors": {
                "code": "Incorrect verification code."
            },
            "status_code": 400
        }

    mark_email_registration_request_verified(pending["_id"])

    new_state = (action == "enable")
    get_users_collection().update_one(
        {"_id": user["_id"]},
        {"$set": {
            "two_factor_enabled": new_state,
            "updated_at": now_utc()
        }}
    )

    updated_user = find_user_by_id(str(user["_id"]))

    return {
        "success": True,
        "message": f"Two-Factor Authentication has been successfully {'enabled' if new_state else 'disabled'}.",
        "data": {
            "user": format_user(updated_user)
        },
        "status_code": 200
    }

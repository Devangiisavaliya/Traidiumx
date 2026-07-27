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
                "profile": "Please provide name or mobile to update."
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

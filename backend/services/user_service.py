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


def permanently_delete_user_account(user):
    """
    Permanently delete a user account and all associated resources,
    including wallets, orders, positions, trades, KYC data, and sub-accounts.
    """
    from bson import ObjectId
    from config.database import get_database

    if not user or not user.get("_id"):
        return {
            "success": False,
            "message": "User not found or invalid user session.",
            "status_code": 404
        }

    db = get_database()

    # Determine primary user id
    parent_id = user.get("parent_user_id")
    primary_user_id = str(parent_id) if parent_id else str(user["_id"])

    primary_user = db.users.find_one({"_id": ObjectId(primary_user_id)}) or user
    email = str(primary_user.get("email") or "").strip().lower()
    mobile = str(primary_user.get("mobile") or "").strip()

    # Find all sub-accounts under this primary account
    sub_users = list(db.users.find({"parent_user_id": primary_user_id}))
    all_user_ids = [primary_user_id] + [str(s["_id"]) for s in sub_users]
    all_user_object_ids = [ObjectId(uid) for uid in all_user_ids if ObjectId.is_valid(uid)]

    from utils.date_helper import now_utc
    deletion_time = now_utc()

    # Log deletion in deleted_account_logs for Admin inspection
    try:
        db.deleted_account_logs.insert_one({
            "account_type": "main",
            "account_id": primary_user_id,
            "client_id": primary_user.get("client_id") or "N/A",
            "name": primary_user.get("name") or "Main User",
            "email": email or primary_user.get("email"),
            "mobile": mobile or primary_user.get("mobile"),
            "deleted_by": "user",
            "deleted_by_name": primary_user.get("name") or email,
            "sub_accounts_count": len(sub_users),
            "refund_summary": "All data permanently wiped upon user request",
            "deleted_at": deletion_time
        })
        for sdoc in sub_users:
            db.deleted_account_logs.insert_one({
                "account_type": "sub",
                "account_id": str(sdoc["_id"]),
                "client_id": sdoc.get("client_id") or "N/A",
                "name": sdoc.get("name") or "Sub-Account",
                "email": sdoc.get("email") or email,
                "parent_user_id": primary_user_id,
                "parent_name": primary_user.get("name") or "Main Account",
                "parent_client_id": primary_user.get("client_id"),
                "deleted_by": "user",
                "deleted_by_name": f"{primary_user.get('name')} (Closed with Main)",
                "refund_summary": "Cascade closed with Main Account",
                "deleted_at": deletion_time
            })
    except Exception as log_err:
        print(f"Warning: Failed to write deleted account log: {log_err}")

    # 1. Trading & Account Collections
    db.orders.delete_many({"user_id": {"$in": all_user_ids}})
    db.positions.delete_many({"user_id": {"$in": all_user_ids}})
    db.position_price_snapshots.delete_many({"user_id": {"$in": all_user_ids}})
    db.trades.delete_many({"user_id": {"$in": all_user_ids}})
    db.option_orders.delete_many({"user_id": {"$in": all_user_ids}})
    db.option_positions.delete_many({"user_id": {"$in": all_user_ids}})
    db.option_fills.delete_many({"user_id": {"$in": all_user_ids}})
    db.deposits.delete_many({"user_id": {"$in": all_user_ids}})
    db.withdrawals.delete_many({"user_id": {"$in": all_user_ids}})
    db.wallet_ledger.delete_many({"user_id": {"$in": all_user_ids}})
    db.wallets.delete_many({"user_id": {"$in": all_user_ids}})
    db.kyc_requests.delete_many({"user_id": {"$in": all_user_ids}})
    db.kyc_short_codes.delete_many({"user_id": {"$in": all_user_ids}})
    db.futures_recent_symbols.delete_many({"user_id": {"$in": all_user_ids}})
    db.mt5_accounts.delete_many({"user_id": {"$in": all_user_ids}})
    if "mt5_ledger" in db.list_collection_names():
        db.mt5_ledger.delete_many({"user_id": {"$in": all_user_ids}})
    db.custody_deposit_addresses.delete_many({"user_id": {"$in": all_user_ids}})
    db.user_deposit_addresses.delete_many({"user_id": {"$in": all_user_ids}})
    db.currency_switch_requests.delete_many({"user_id": {"$in": all_user_ids}})
    db.support_tickets.delete_many({"user_id": {"$in": all_user_ids}})
    db.custody_hot_wallet_logs.delete_many({"user_id": {"$in": all_user_ids}})

    # 2. Notifications & Referrals
    db.user_notifications.delete_many({"recipient_user_id": {"$in": all_user_ids}})
    db.notifications.delete_many({"user_id": {"$in": all_user_ids}})
    db.referral_profiles.delete_many({"user_id": {"$in": all_user_ids}})
    db.referral_relationships.delete_many({
        "$or": [
            {"referrer_user_id": {"$in": all_user_ids}},
            {"referred_user_id": {"$in": all_user_ids}}
        ]
    })

    # 3. Security tokens
    if email:
        db.password_reset_tokens.delete_many({"email": email})
        db.email_verification_codes.delete_many({"email": email})
    if mobile:
        db.email_verification_codes.delete_many({"mobile": mobile})

    # 4. Delete user documents
    db.users.delete_many({"_id": {"$in": all_user_object_ids}})
    db.users.delete_many({"parent_user_id": primary_user_id})

    return {
        "success": True,
        "message": "Account and all associated records have been permanently deleted.",
        "status_code": 200
    }

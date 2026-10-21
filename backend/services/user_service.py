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


def permanently_delete_user_account(user, reason=None, admin_email="admin"):
    """
    Soft-delete / Close user account and all associated resources.
    Preserves all database records (wallets, orders, positions, trades, KYC, support tickets, ledger)
    for compliance, auditing, and potential account restoration.
    Marks account_status as 'closed', is_closed as True, is_deleted as True,
    and increments token_version to immediately revoke all active sessions.
    """
    from bson import ObjectId
    from config.database import get_database

    if not user or not user.get("_id"):
        return {
            "success": False,
            "message": "User not found or invalid user session.",
            "status_code": 404,
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
    close_reason = reason or primary_user.get("account_status_reason") or "Account closed upon deletion request"

    # Log deletion in deleted_account_logs for Admin inspection (records kept)
    try:
        db.deleted_account_logs.insert_one({
            "account_type": "main",
            "account_id": primary_user_id,
            "client_id": primary_user.get("client_id") or "N/A",
            "name": primary_user.get("name") or "Main User",
            "email": email or primary_user.get("email"),
            "mobile": mobile or primary_user.get("mobile"),
            "deleted_by": "admin" if admin_email != "user" else "user",
            "deleted_by_name": admin_email or "Admin",
            "sub_accounts_count": len(sub_users),
            "refund_summary": "Account closed & archived (All records preserved in database)",
            "deleted_at": deletion_time,
            "status": "closed",
            "reason": close_reason,
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
                "deleted_by": "admin" if admin_email != "user" else "user",
                "deleted_by_name": f"{admin_email} (Closed with Main)",
                "refund_summary": "Cascade closed with Main Account (All records preserved)",
                "deleted_at": deletion_time,
                "status": "closed",
            })
    except Exception as log_err:
        print(f"Warning: Failed to write deleted account log: {log_err}")

    # Soft delete: update users to closed status, revoke tokens
    # Note: We intentionally DO NOT delete orders, positions, trades, wallets, KYC, or user documents.
    # All data remains safely preserved in MongoDB for historical records and audit.
    # To allow re-registration with the same email/mobile while preventing duplicate KYC:
    # We save original email & mobile in archived_email and archived_mobile, and release unique index.
    safe_del_time_str = deletion_time.strftime("%Y%m%d%H%M%S")
    released_email = f"{email}__closed_{safe_del_time_str}" if email else None
    released_mobile = f"{mobile}__closed_{safe_del_time_str}" if mobile else None

    primary_update = {
        "account_status": "closed",
        "is_closed": True,
        "is_deleted": True,
        "closed_at": deletion_time,
        "closed_reason": close_reason,
        "closed_by": admin_email or "admin",
        "archived_email": email,
        "archived_mobile": mobile,
        "updated_at": deletion_time,
    }
    if released_email:
        primary_update["email"] = released_email
    if released_mobile:
        primary_update["mobile"] = released_mobile

    db.users.update_one(
        {"_id": ObjectId(primary_user_id)},
        {
            "$set": primary_update,
            "$inc": {"token_version": 1},
        }
    )

    for sdoc in sub_users:
        sub_email = str(sdoc.get("email") or "").strip().lower()
        sub_mobile = str(sdoc.get("mobile") or "").strip()
        s_update = {
            "account_status": "closed",
            "is_closed": True,
            "is_deleted": True,
            "closed_at": deletion_time,
            "closed_reason": f"Cascade closed with main account: {close_reason}",
            "closed_by": admin_email or "admin",
            "archived_email": sub_email,
            "archived_mobile": sub_mobile,
            "updated_at": deletion_time,
        }
        if sub_email:
            s_update["email"] = f"{sub_email}__closed_{safe_del_time_str}_{str(sdoc['_id'])[:6]}"
        if sub_mobile:
            s_update["mobile"] = f"{sub_mobile}__closed_{safe_del_time_str}_{str(sdoc['_id'])[:6]}"
        db.users.update_one(
            {"_id": sdoc["_id"]},
            {"$set": s_update, "$inc": {"token_version": 1}}
        )

    # Invalidate active verification/reset codes
    if email:
        db.password_reset_tokens.delete_many({"email": email})
        db.email_verification_codes.delete_many({"email": email})
    if mobile:
        db.email_verification_codes.delete_many({"mobile": mobile})

    return {
        "success": True,
        "message": "Account has been successfully closed and archived. All historical records have been safely preserved.",
        "status_code": 200,
    }


def restore_closed_user_account(user_id, admin_email="admin"):
    """
    Restore / Reactivate a previously closed user account and its sub-accounts.
    Sets account_status to 'active', is_closed to False, is_deleted to False.
    """
    from bson import ObjectId
    from config.database import get_database
    from utils.date_helper import now_utc

    db = get_database()
    u_oid = ObjectId(user_id) if ObjectId.is_valid(user_id) else None
    if not u_oid:
        return {"success": False, "message": "Invalid user ID.", "status_code": 400}

    target_user = db.users.find_one({"_id": u_oid})
    if not target_user:
        return {"success": False, "message": "User not found.", "status_code": 404}

    parent_id = target_user.get("parent_user_id")
    primary_user_id = str(parent_id) if parent_id else str(target_user["_id"])

    sub_users = list(db.users.find({"parent_user_id": primary_user_id}))
    all_user_ids = [primary_user_id] + [str(s["_id"]) for s in sub_users]
    all_user_object_ids = [ObjectId(uid) for uid in all_user_ids if ObjectId.is_valid(uid)]

    now = now_utc()
    db.users.update_many(
        {
            "$or": [
                {"_id": {"$in": all_user_object_ids}},
                {"parent_user_id": primary_user_id},
            ]
        },
        {
            "$set": {
                "account_status": "active",
                "is_closed": False,
                "is_deleted": False,
                "restored_at": now,
                "restored_by": admin_email or "admin",
                "updated_at": now,
            },
            "$unset": {
                "closed_at": "",
                "closed_reason": "",
                "closed_by": "",
                "deletion_requested_at": "",
                "deletion_request_id": "",
            },
        },
    )

    # If there is a deletion request, mark it restored
    db.account_deletion_requests.update_many(
        {"user_id": {"$in": all_user_ids}},
        {"$set": {"status": "restored", "restored_at": now, "restored_by": admin_email, "updated_at": now}},
    )

    return {
        "success": True,
        "message": f"Account '{target_user.get('name')}' and associated accounts have been restored to active status.",
        "status_code": 200,
    }



def request_account_deletion(user, reason, feedback="", password=""):
    """
    Submit a user account deletion request for Admin review.
    Does NOT immediately delete data. Sets account_status to pending_deletion.
    """
    from bson import ObjectId
    from config.database import get_database

    if not user or not user.get("_id"):
        return {
            "success": False,
            "message": "User not found or invalid user session.",
            "status_code": 404,
        }

    db = get_database()
    user_id = str(user["_id"])

    # Verify password if user has one
    if user.get("password_hash"):
        if not password or not verify_password(password, user["password_hash"]):
            return {
                "success": False,
                "message": "Incorrect account password. Please enter your valid password to confirm deletion request.",
                "errors": {"password": "Incorrect password."},
                "status_code": 401,
            }

    # Clean inputs
    reason = clean_string(reason or "Other")
    feedback = clean_string(feedback or "")

    # Check for open positions
    open_positions_count = db.positions.count_documents({"user_id": user_id, "status": "open"})
    if open_positions_count > 0:
        return {
            "success": False,
            "message": f"Cannot request deletion. You have {open_positions_count} open trading position(s). Please close all open positions first.",
            "errors": {"positions": f"{open_positions_count} open positions"},
            "status_code": 400,
        }

    # Check for pending withdrawals
    pending_withdrawals_count = db.withdrawals.count_documents({
        "user_id": user_id,
        "status": {"$in": ["pending", "pending_admin_approval", "pending_payout", "queued"]},
    })
    if pending_withdrawals_count > 0:
        return {
            "success": False,
            "message": "Cannot request deletion. You have pending withdrawal requests in progress. Please wait for them to complete or cancel them.",
            "errors": {"withdrawals": f"{pending_withdrawals_count} pending withdrawals"},
            "status_code": 400,
        }

    # Check if a pending deletion request already exists
    existing_request = db.account_deletion_requests.find_one({
        "user_id": user_id,
        "status": "pending",
    })
    if existing_request:
        return {
            "success": False,
            "message": "You already have a pending account deletion request under admin review.",
            "data": {
                "request_id": str(existing_request["_id"]),
                "requested_at": existing_request.get("created_at").isoformat() if existing_request.get("created_at") else None,
                "reason": existing_request.get("reason"),
            },
            "status_code": 409,
        }

    # Capture wallet snapshot so Admin can see user's balances
    wallet = db.wallets.find_one({"user_id": user_id}) or {}
    main_inr = float(wallet.get("main_wallet_inr", {}).get("available_balance", 0.0) if isinstance(wallet.get("main_wallet_inr"), dict) else 0.0)
    main_usdt = float(wallet.get("main_wallet_usdt", {}).get("available_balance", 0.0) if isinstance(wallet.get("main_wallet_usdt"), dict) else 0.0)
    trading_bal = float(wallet.get("trading_wallet", {}).get("available_balance", wallet.get("available_balance", 0.0)) or 0.0)

    now = now_utc()
    req_doc = {
        "user_id": user_id,
        "client_id": user.get("client_id") or "N/A",
        "name": user.get("name") or "User",
        "email": user.get("email") or "",
        "mobile": user.get("mobile") or "",
        "reason": reason,
        "feedback": feedback,
        "wallet_balances": {
            "inr": main_inr,
            "usdt": main_usdt,
            "trading": trading_bal,
        },
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    }

    result = db.account_deletion_requests.insert_one(req_doc)

    # Set user status to pending_deletion
    db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "account_status": "pending_deletion",
                "deletion_requested_at": now,
                "deletion_request_id": str(result.inserted_id),
                "updated_at": now,
            }
        },
    )

    return {
        "success": True,
        "message": "Your account deletion request has been submitted. It is now under admin review and will be processed within 24-48 hours.",
        "data": {
            "request_id": str(result.inserted_id),
            "reason": reason,
            "requested_at": now.isoformat(),
            "status": "pending",
        },
        "status_code": 201,
    }


def cancel_account_deletion_request(user):
    """Cancel a pending account deletion request and restore user to active status."""
    from bson import ObjectId
    from config.database import get_database

    if not user or not user.get("_id"):
        return {"success": False, "message": "User not found.", "status_code": 404}

    db = get_database()
    user_id = str(user["_id"])
    now = now_utc()

    db.account_deletion_requests.update_one(
        {"user_id": user_id, "status": "pending"},
        {"$set": {"status": "cancelled", "cancelled_at": now, "updated_at": now}},
    )

    db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {"account_status": "active", "updated_at": now},
            "$unset": {"deletion_requested_at": "", "deletion_request_id": ""},
        },
    )

    return {
        "success": True,
        "message": "Your account deletion request has been cancelled. Your account remains active.",
        "status_code": 200,
    }


def get_user_deletion_request_status(user):
    """Fetch current deletion request status for the logged-in user."""
    from config.database import get_database

    if not user or not user.get("_id"):
        return {"success": False, "message": "User not found.", "status_code": 404}

    db = get_database()
    user_id = str(user["_id"])

    req = db.account_deletion_requests.find_one(
        {"user_id": user_id, "status": "pending"}
    )
    if not req:
        last_rejected = db.account_deletion_requests.find_one(
            {"user_id": user_id, "status": "rejected"},
            sort=[("processed_at", -1)]
        )
        data = {"has_pending_request": False}
        if last_rejected:
            data["last_rejected_request"] = {
                "request_id": str(last_rejected["_id"]),
                "reason": last_rejected.get("reason"),
                "reject_reason": last_rejected.get("reject_reason") or "Rejected by Admin",
                "processed_at": last_rejected.get("processed_at").isoformat() if last_rejected.get("processed_at") else None,
            }
        return {
            "success": True,
            "data": data,
            "status_code": 200,
        }

    return {
        "success": True,
        "data": {
            "has_pending_request": True,
            "request_id": str(req["_id"]),
            "reason": req.get("reason"),
            "feedback": req.get("feedback"),
            "requested_at": req.get("created_at").isoformat() if req.get("created_at") else None,
            "status": req.get("status"),
        },
        "status_code": 200,
    }


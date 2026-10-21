from bson import ObjectId

from config.database import get_database
from utils.date_helper import now_utc


import random

def get_users_collection():
    db = get_database()
    return db.users


def find_user_by_client_id(client_id):
    return get_users_collection().find_one({
        "client_id": str(client_id).strip()
    })


def generate_unique_client_id():
    db = get_users_collection()
    for _ in range(100):
        client_id = str(random.randint(100000, 999999))
        if not db.find_one({"client_id": client_id}):
            return client_id
    raise Exception("Unable to generate a unique Client ID.")


def find_user_by_email(email):
    return get_users_collection().find_one({
        "email": email
    })


def find_user_by_mobile(mobile):
    return get_users_collection().find_one({
        "mobile": mobile
    })


def find_user_by_google_sub(google_sub):
    if not google_sub:
        return None

    return get_users_collection().find_one({
        "google_sub": google_sub
    })


def find_user_by_id(user_id):
    try:
        if ObjectId.is_valid(str(user_id)):
            return get_users_collection().find_one({
                "_id": ObjectId(user_id)
            })
        return get_users_collection().find_one({
            "$or": [{"client_id": str(user_id)}, {"name": str(user_id)}]
        })
    except Exception:
        return None


def create_user(user_data):
    user_data["role"] = user_data.get("role", "user")
    user_data["kyc_status"] = user_data.get("kyc_status", "pending")
    user_data["account_status"] = user_data.get("account_status", "active")
    user_data["email_verified"] = bool(user_data.get("email_verified", False))
    user_data["mobile_verified"] = bool(user_data.get("mobile_verified", False))
    user_data["auth_provider"] = user_data.get("auth_provider", "password")
    user_data["selected_platform"] = user_data.get("selected_platform", "")
    user_data["preferred_plan"] = user_data.get("preferred_plan", "")
    user_data["active_plan"] = user_data.get("active_plan", "")
    user_data["active_spread_pips"] = float(user_data.get("active_spread_pips", 0) or 0)
    user_data["active_spread_type"] = str(user_data.get("active_spread_type", "fixed") or "fixed")
    user_data["active_spread_value"] = float(user_data.get("active_spread_value", 0.0) or 0.0)
    user_data["downgrade_warnings"] = int(user_data.get("downgrade_warnings", 0) or 0)
    user_data["created_at"] = now_utc()
    user_data["updated_at"] = now_utc()
    if not user_data.get("client_id"):
        user_data["client_id"] = generate_unique_client_id()

    result = get_users_collection().insert_one(user_data)

    return result.inserted_id


def create_google_user(google_profile):
    google_sub = str(google_profile.get("google_sub") or "").strip()
    email = str(google_profile.get("email") or "").strip().lower()
    name = str(google_profile.get("name") or email.split("@")[0]).strip()

    user_data = {
        "name": name,
        "email": email,
        # Existing project has a unique mobile index. Google sign-up does not collect phone number,
        # so store a non-display internal placeholder and hide it in format_user().
        "mobile": f"GOOGLE_{google_sub[-18:]}",
        "password_hash": "",
        "auth_provider": "google",
        "google_sub": google_sub,
        "google_picture": google_profile.get("picture", ""),
        "email_verified": True,
        "mobile_verified": False,
        "last_login_at": now_utc()
    }

    return create_user(user_data)


def link_google_to_user(user_id, google_profile):
    update_data = {
        "google_sub": google_profile.get("google_sub"),
        "google_picture": google_profile.get("picture", ""),
        "email_verified": True,
        "auth_provider": "password_google",
        "last_login_at": now_utc(),
        "updated_at": now_utc()
    }

    get_users_collection().update_one(
        {"_id": ObjectId(user_id)},
        {"$set": update_data}
    )


def update_last_login(user_id):
    get_users_collection().update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "last_login_at": now_utc(),
            "updated_at": now_utc()
        }}
    )


def update_user_password(user_id, password_hash):
    update_data = {
        "password_hash": password_hash,
        "auth_provider": "password",
        "password_changed_at": now_utc(),
        "updated_at": now_utc()
    }

    get_users_collection().update_one(
        {"_id": ObjectId(user_id)},
        {"$set": update_data}
    )


def add_bank_account(user_id, account_data):
    """Add a bank account to the user's saved bank accounts list."""
    import uuid
    account = {
        "id": str(uuid.uuid4()),
        "account_holder_name": str(account_data.get("account_holder_name") or "").strip(),
        "account_number": str(account_data.get("account_number") or "").strip(),
        "ifsc_code": str(account_data.get("ifsc_code") or "").strip().upper(),
        "bank_name": str(account_data.get("bank_name") or "").strip(),
        "upi_id": str(account_data.get("upi_id") or "").strip(),
        "account_type": str(account_data.get("account_type") or "savings").strip(),
        "is_primary": bool(account_data.get("is_primary", False)),
        "created_at": now_utc()
    }

    # If this account is primary, unset all others
    if account["is_primary"]:
        get_users_collection().update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"bank_accounts.$[].is_primary": False}}
        )

    get_users_collection().update_one(
        {"_id": ObjectId(user_id)},
        {"$push": {"bank_accounts": account}}
    )
    return account


def get_bank_accounts(user_id):
    """Return the list of saved bank accounts for a user."""
    user = get_users_collection().find_one(
        {"_id": ObjectId(user_id)},
        {"bank_accounts": 1}
    )
    if not user:
        return []
    accounts = user.get("bank_accounts") or []
    # Serialize datetime fields
    result = []
    for acc in accounts:
        result.append({
            "id": acc.get("id", ""),
            "account_holder_name": acc.get("account_holder_name", ""),
            "account_number": acc.get("account_number", ""),
            "ifsc_code": acc.get("ifsc_code", ""),
            "bank_name": acc.get("bank_name", ""),
            "upi_id": acc.get("upi_id", ""),
            "account_type": acc.get("account_type", "savings"),
            "is_primary": bool(acc.get("is_primary", False)),
            "created_at": acc.get("created_at").isoformat() if acc.get("created_at") else None
        })
    return result


def delete_bank_account(user_id, account_id):
    """Remove a bank account by its UUID id field."""
    result = get_users_collection().update_one(
        {"_id": ObjectId(user_id)},
        {"$pull": {"bank_accounts": {"id": account_id}}}
    )
    return result.modified_count > 0


def set_primary_bank_account(user_id, account_id):
    """Mark one bank account as primary and unset all others."""
    # First unset all
    get_users_collection().update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"bank_accounts.$[].is_primary": False}}
    )
    # Then set the chosen one
    get_users_collection().update_one(
        {"_id": ObjectId(user_id), "bank_accounts.id": account_id},
        {"$set": {"bank_accounts.$.is_primary": True}}
    )


def format_user(user):
    if not user:
        return None

    email = user.get("email", "")
    mobile = user.get("mobile", "")
    kyc_status = user.get("kyc_status", "pending")

    # Look up parent details if sub-account
    parent_user_id = user.get("parent_user_id")
    if parent_user_id:
        try:
            parent = get_users_collection().find_one({"_id": ObjectId(parent_user_id)})
            if parent:
                email = parent.get("email", email)
                mobile = parent.get("mobile", mobile)
                kyc_status = parent.get("kyc_status", kyc_status)
        except Exception:
            pass

    if isinstance(mobile, str) and mobile.startswith("GOOGLE_"):
        mobile = ""

    return {
        "id": str(user["_id"]),
        "client_id": user.get("client_id", ""),
        "name": user.get("name", ""),
        "email": email,
        "mobile": mobile,
        "role": user.get("role", "user"),
        "kyc_status": kyc_status,
        "account_status": user.get("account_status", "active"),
        "email_verified": user.get("email_verified", False),
        "mobile_verified": user.get("mobile_verified", False),
        "auth_provider": user.get("auth_provider", "password"),
        "google_picture": user.get("google_picture", ""),
        "selected_platform": user.get("selected_platform", ""),
        "selected_platform_name": user.get("selected_platform_name", ""),
        "preferred_plan": user.get("preferred_plan", ""),
        "active_plan": user.get("active_plan", ""),
        "active_spread_pips": user.get("active_spread_pips", 0.0),
        "active_spread_type": user.get("active_spread_type", "fixed"),
        "active_spread_value": user.get("active_spread_value", 0.0),
        "show_downgrade_warning": bool(user.get("show_downgrade_warning", False)),
        "downgrade_warnings": int(user.get("downgrade_warnings", 0)),
        "plan_funding_required": user.get("plan_funding_required", False),
        "two_factor_enabled": bool(user.get("two_factor_enabled", False)),
        "created_at": user.get("created_at").isoformat() if user.get("created_at") else None
    }

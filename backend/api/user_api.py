from flask import Blueprint, g, request

from models.user_model import find_user_by_id
from utils.jwt_helper import verify_token
from utils.security import get_bearer_token
from middleware.auth_middleware import auth_required, auth_required_allow_restricted
from services.user_service import change_user_password, get_user_profile, update_user_profile, request_two_factor_toggle, verify_two_factor_toggle
from services.user_status_service import build_user_account_status_payload
from services.notification_service import get_user_notifications, mark_notifications_read
from utils.response import success_response, error_response


user_api = Blueprint("user_api", __name__, url_prefix="/api/user")


def _current_user_from_token_without_status_block():
    token = get_bearer_token(request)
    if not token:
        return None, error_response(
            message="Unauthorized access.",
            errors={"token": "Bearer token is required."},
            status_code=401,
        )

    token_result = verify_token(token)
    if not token_result["valid"]:
        return None, error_response(
            message="Invalid or expired token.",
            errors={"token": token_result["message"]},
            status_code=401,
        )

    user_id = token_result["data"].get("user_id")
    user = find_user_by_id(user_id)
    if not user:
        return None, error_response(
            message="User not found.",
            errors={"user": "User account does not exist."},
            status_code=404,
        )

    return user, None


@user_api.get("/profile")
@auth_required_allow_restricted
def profile():
    result = get_user_profile(g.current_user)

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )


@user_api.get("/account-status")
def account_status():
    # This endpoint intentionally allows blocked/suspended users to read the reason,
    # grace timer, and suspend-until timer so the frontend can show a helpful banner.
    user, response = _current_user_from_token_without_status_block()
    if response:
        return response

    return success_response(
        message="Account status loaded successfully.",
        data=build_user_account_status_payload(user),
    )


@user_api.patch("/profile")
@auth_required
def update_profile():
    data = request.get_json(silent=True) or {}

    result = update_user_profile(g.current_user, data)

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result["errors"],
        status_code=result["status_code"]
    )


@user_api.post("/two-factor/request")
@auth_required
def two_factor_request():
    data = request.get_json(silent=True) or {}
    action = data.get("action")
    result = request_two_factor_toggle(g.current_user, action)
    if result["success"]:
        return success_response(
            message=result["message"],
            data=result.get("data", {}),
            status_code=result["status_code"]
        )
    return error_response(
        message=result["message"],
        status_code=result["status_code"]
    )


@user_api.post("/two-factor/verify")
@auth_required
def two_factor_verify():
    data = request.get_json(silent=True) or {}
    result = verify_two_factor_toggle(g.current_user, data)
    if result["success"]:
        return success_response(
            message=result["message"],
            data=result.get("data", {}),
            status_code=result["status_code"]
        )
    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"]
    )


@user_api.patch("/change-password")
@auth_required_allow_restricted
def change_password():
    data = request.get_json(silent=True) or {}

    result = change_user_password(g.current_user, data)

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result["errors"],
        status_code=result["status_code"]
    )


@user_api.get("/notifications")
@auth_required_allow_restricted
def notifications():
    limit = request.args.get("limit", 20)
    unread_only = str(request.args.get("unread_only") or request.args.get("unreadOnly") or "false").strip().lower() in {"1", "true", "yes", "on"}
    notifications_list = get_user_notifications(
        user_id=str(g.current_user.get("_id")),
        limit=limit,
        unread_only=unread_only,
    )

    return success_response(
        message="Notifications loaded successfully.",
        data={"notifications": notifications_list},
    )


@user_api.patch("/notifications/read")
@auth_required_allow_restricted
def mark_notifications_as_read():
    data = request.get_json(silent=True) or {}
    ids = data.get("notification_ids") or data.get("ids") or []
    if not isinstance(ids, list):
        ids = []

    result = mark_notifications_read(
        user_id=str(g.current_user.get("_id")),
        notification_ids=ids,
    )


    return success_response(
        message="Notifications marked as read.",
        data=result,
    )

@user_api.get("/sub-accounts")
@auth_required
def get_sub_accounts():
    from config.database import get_database
    from models.user_model import format_user
    from models.wallet_model import find_wallet_by_user_id, format_wallet
    from bson import ObjectId

    token = get_bearer_token(request)
    token_result = verify_token(token)
    token_user_id = token_result["data"].get("user_id")

    db = get_database()
    
    user_doc = db.users.find_one({"_id": ObjectId(token_user_id)})
    if not user_doc:
        return error_response(message="User not found.", status_code=404)

    # If user is a sub-account, fetch sibling sub-accounts of same parent
    parent_user_id = user_doc.get("parent_user_id") or str(user_doc["_id"])

    sub_users = list(db.users.find({
        "parent_user_id": parent_user_id,
        "is_inr_trading_account": {"$ne": True}
    }))
    
    sub_accounts_data = []

    # Add parent account info as a special entry
    parent_user = db.users.find_one({"_id": ObjectId(parent_user_id)})
    if parent_user:
        parent_wallet = find_wallet_by_user_id(parent_user_id)
        formatted_parent_wallet = format_wallet(parent_wallet) if parent_wallet else None
        sub_accounts_data.append({
            "id": parent_user_id,
            "name": parent_user.get("name") or "Main Trading Account",
            "client_id": parent_user.get("client_id"),
            "wallet": formatted_parent_wallet,
            "is_parent": True,
            "created_at": parent_user.get("created_at").isoformat() if parent_user.get("created_at") else None
        })

    for sub in sub_users:
        sub_id = str(sub["_id"])
        if sub_id == parent_user_id:
            continue
        wallet = find_wallet_by_user_id(sub_id)
        formatted_wallet = format_wallet(wallet) if wallet else None
        sub_accounts_data.append({
            "id": sub_id,
            "name": sub.get("name"),
            "client_id": sub.get("client_id"),
            "wallet": formatted_wallet,
            "created_at": sub.get("created_at").isoformat() if sub.get("created_at") else None
        })
        
    return success_response(
        message="Sub accounts retrieved successfully.",
        data=sub_accounts_data
    )


@user_api.post("/sub-accounts")
@auth_required
def create_sub_account_endpoint():
    from config.database import get_database
    from models.user_model import create_user
    from models.wallet_model import create_default_wallet
    from bson import ObjectId
    import uuid

    data = request.get_json(silent=True) or {}
    name = str(data.get("name") or "").strip()
    if not name:
        return error_response(message="Sub account name is required.", status_code=422)

    token = get_bearer_token(request)
    token_result = verify_token(token)
    main_user_id = token_result["data"].get("user_id")

    db = get_database()
    count = db.users.count_documents({"parent_user_id": str(main_user_id)})
    sub_index = count + 1

    if count >= 10:
        return error_response(message="Maximum of 10 sub accounts exceeded.", status_code=400)

    main_user = db.users.find_one({"_id": ObjectId(main_user_id)})
    if not main_user:
        return error_response(message="Main user not found.", status_code=404)

    parent_client_id = main_user.get("client_id", "MAIN")
    suffix = uuid.uuid4().hex[:6].upper()
    email = f"{parent_client_id}_sub_{sub_index}_{suffix}@traidiumx.local".lower()
    mobile = f"SUB_{parent_client_id}_{sub_index}_{suffix}"

    user_data = {
        "name": name,
        "email": email,
        "mobile": mobile,
        "password_hash": "",
        "parent_user_id": str(main_user_id),
        "role": "sub_account",
        "email_verified": True,
        "mobile_verified": True,
        "kyc_status": "approved",
    }

    sub_id = create_user(user_data)
    create_default_wallet(sub_id)

    return success_response(
        message="Sub account created successfully.",
        data={
            "id": str(sub_id),
            "name": name,
            "client_id": mobile
        },
        status_code=201
    )




# ──────────────────────────────────────────────────────────────────────────────
# Bank Account Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@user_api.get("/bank-accounts")
@auth_required
def list_bank_accounts():
    from models.user_model import get_bank_accounts
    user_id = str(g.current_user["_id"])
    accounts = get_bank_accounts(user_id)
    return success_response(
        message="Bank accounts retrieved successfully.",
        data={"bank_accounts": accounts}
    )


@user_api.post("/bank-accounts")
@auth_required
def create_bank_account():
    from models.user_model import add_bank_account, get_bank_accounts

    user_id = str(g.current_user["_id"])
    data = request.get_json(silent=True) or {}

    upi_id = str(data.get("upi_id") or "").strip()
    account_number = str(data.get("account_number") or "").strip()

    if not upi_id and not account_number:
        return error_response(
            message="Please provide at least a UPI ID or Bank Account Number.",
            errors={"fields": "upi_id or account_number is required."},
            status_code=422
        )

    existing = get_bank_accounts(user_id)
    if len(existing) >= 5:
        return error_response(
            message="Maximum of 5 bank accounts allowed.",
            errors={"limit": "You have reached the bank account limit."},
            status_code=400
        )

    account = add_bank_account(user_id, data)

    return success_response(
        message="Bank account saved successfully.",
        data={"bank_account": account},
        status_code=201
    )


@user_api.delete("/bank-accounts/<account_id>")
@auth_required
def remove_bank_account(account_id):
    from models.user_model import delete_bank_account

    user_id = str(g.current_user["_id"])
    deleted = delete_bank_account(user_id, account_id)

    if not deleted:
        return error_response(
            message="Bank account not found.",
            errors={"account_id": "No matching account found."},
            status_code=404
        )

    return success_response(
        message="Bank account removed successfully.",
        data={}
    )


@user_api.patch("/bank-accounts/<account_id>/set-primary")
@auth_required
def set_primary_bank_account_endpoint(account_id):
    from models.user_model import set_primary_bank_account, get_bank_accounts

    user_id = str(g.current_user["_id"])
    set_primary_bank_account(user_id, account_id)
    accounts = get_bank_accounts(user_id)

    return success_response(
        message="Primary bank account updated.",
        data={"bank_accounts": accounts}
    )

from functools import wraps

from flask import request, g

from models.user_model import find_user_by_id
from services.user_status_service import (
    build_account_status_service_result,
    is_user_active,
    refresh_user_scheduled_status,
)
from utils.jwt_helper import verify_token
from utils.response import error_response
from utils.security import get_bearer_token


def _load_authenticated_user(enforce_active_status=True):
    token = get_bearer_token(request)

    if not token:
        return None, error_response(
            message="Unauthorized access.",
            errors={
                "token": "Bearer token is required."
            },
            status_code=401
        )

    token_result = verify_token(token)

    if not token_result["valid"]:
        return None, error_response(
            message="Invalid or expired token.",
            errors={
                "token": token_result["message"]
            },
            status_code=401
        )

    user_id = token_result["data"].get("user_id")
    user = find_user_by_id(user_id)

    if not user:
        return None, error_response(
            message="User not found.",
            errors={
                "user": "User account does not exist."
            },
            status_code=404
        )

    # Scheduled block/suspend is enforced here. During grace time user stays active.
    user = refresh_user_scheduled_status(user)

    if enforce_active_status and not is_user_active(user):
        result = build_account_status_service_result(user)
        return None, error_response(
            message=result["message"],
            errors=result["errors"],
            status_code=result["status_code"]
        )

    # Store parent authenticated token user
    g.token_user = user
    g.token_user_id = str(user["_id"])

    # Sub-account context override
    active_user_id = request.headers.get("X-Active-User-Id")
    if active_user_id and active_user_id != str(user["_id"]):
        from config.database import get_database
        from bson import ObjectId
        db = get_database()
        try:
            if ObjectId.is_valid(active_user_id):
                sub_user = db.users.find_one({
                    "_id": ObjectId(active_user_id),
                    "parent_user_id": str(user["_id"])
                })
                if sub_user:
                    user = sub_user
        except Exception:
            pass

    # Update navbar currency only when changed
    nav_curr = request.headers.get("X-Navbar-Currency")
    if nav_curr and nav_curr in ("INR", "USDT") and user.get("last_navbar_currency") != nav_curr:
        from config.database import get_database
        from bson import ObjectId
        db = get_database()
        try:
            u_id = user["_id"] if isinstance(user["_id"], ObjectId) else (ObjectId(user["_id"]) if ObjectId.is_valid(str(user["_id"])) else user["_id"])
            db.users.update_one(
                {"_id": u_id},
                {"$set": {"last_navbar_currency": nav_curr}}
            )
            user["last_navbar_currency"] = nav_curr
        except Exception:
            pass

    g.current_user = user
    g.current_user_id = str(user["_id"])

    return user, None


def auth_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        _user, auth_error = _load_authenticated_user(enforce_active_status=True)

        if auth_error:
            return auth_error

        return func(*args, **kwargs)

    return wrapper


def auth_required_allow_restricted(func):
    """Authenticate the user but do not block wallet-withdrawal ownership routes.

    Blocked users still own their wallet funds. This decorator is intentionally
    limited to endpoints such as withdrawal request/history/cancel where the
    action must remain tied to the authenticated user but should not reveal total
    wallet balance on the frontend.
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        _user, auth_error = _load_authenticated_user(enforce_active_status=False)

        if auth_error:
            return auth_error

        return func(*args, **kwargs)

    return wrapper

from functools import wraps

from flask import request, g

from models.user_model import find_user_by_id
from services.user_status_service import (
    build_account_status_errors,
    get_account_restriction_message,
    is_user_active,
    normalize_account_status,
)
from utils.jwt_helper import verify_token
from utils.response import error_response
from utils.security import get_bearer_token


def auth_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        token = get_bearer_token(request)

        if not token:
            return error_response(
                message="Unauthorized access.",
                errors={
                    "token": "Bearer token is required."
                },
                status_code=401
            )

        token_result = verify_token(token)

        if not token_result["valid"]:
            return error_response(
                message="Invalid or expired token.",
                errors={
                    "token": token_result["message"]
                },
                status_code=401
            )

        user_id = token_result["data"].get("user_id")
        user = find_user_by_id(user_id)

        if not user:
            return error_response(
                message="User not found.",
                errors={
                    "user": "User account does not exist."
                },
                status_code=404
            )

        if not is_user_active(user):
            status = normalize_account_status(user)
            return error_response(
                message=get_account_restriction_message(status),
                errors=build_account_status_errors(user),
                status_code=403
            )

        g.current_user = user
        g.current_user_id = str(user["_id"])

        return func(*args, **kwargs)

    return wrapper

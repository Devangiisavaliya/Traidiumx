from functools import wraps

from flask import g, request

from utils.jwt_helper import verify_token
from utils.response import error_response
from .models import find_admin_by_id, format_admin


ALLOWED_ADMIN_ROLES = {"super_admin", "admin", "finance", "support", "risk"}


def _extract_bearer_token():
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        return ""

    return auth_header.replace("Bearer ", "", 1).strip()


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = _extract_bearer_token()

        if not token:
            return error_response(
                message="Admin authorization token is required.",
                errors={"authorization": "Missing Bearer token."},
                status_code=401,
            )

        verified = verify_token(token)

        if not verified.get("valid"):
            return error_response(
                message=verified.get("message", "Invalid admin token."),
                errors={"authorization": verified.get("message")},
                status_code=401,
            )

        payload = verified.get("data") or {}
        role = payload.get("role")

        if role not in ALLOWED_ADMIN_ROLES:
            return error_response(
                message="Admin access is required.",
                errors={"role": "Token does not belong to an admin account."},
                status_code=403,
            )

        admin = find_admin_by_id(payload.get("user_id"))

        if not admin:
            return error_response(
                message="Admin account not found.",
                errors={"admin": "Invalid admin account."},
                status_code=401,
            )

        if admin.get("status") != "active":
            return error_response(
                message="Admin account is not active.",
                errors={"status": admin.get("status")},
                status_code=403,
            )

        g.current_admin = admin
        g.current_admin_id = str(admin["_id"])
        g.current_admin_email = admin.get("email", "")
        g.current_admin_safe = format_admin(admin)

        return fn(*args, **kwargs)

    return wrapper

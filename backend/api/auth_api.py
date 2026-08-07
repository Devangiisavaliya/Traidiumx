from flask import Blueprint, request

from config.settings import settings
from services.auth_service import register_user, login_user, google_auth_user, start_email_registration, verify_email_registration, verify_login_2fa
from services.password_reset_service import request_password_reset, reset_password_with_code, verify_password_reset_code
from utils.response import success_response, error_response


auth_api = Blueprint("auth_api", __name__, url_prefix="/api/auth")


def _service_response(result):
    if result["success"]:
        return success_response(
            message=result["message"],
            data=result.get("data", {}),
            status_code=result.get("status_code", 200)
        )

    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result.get("status_code", 400)
    )


@auth_api.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    return _service_response(register_user(data))


@auth_api.post("/register/request-code")
def register_request_code():
    data = request.get_json(silent=True) or {}
    client_ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    user_agent = request.headers.get("User-Agent", "")

    return _service_response(start_email_registration(
        data=data,
        client_ip=client_ip,
        user_agent=user_agent
    ))


@auth_api.post("/register/verify")
def register_verify():
    data = request.get_json(silent=True) or {}
    return _service_response(verify_email_registration(data))


@auth_api.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    data["client_ip"] = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    data["user_agent"] = request.headers.get("User-Agent", "")
    return _service_response(login_user(data))


@auth_api.post("/login/verify")
def login_verify():
    data = request.get_json(silent=True) or {}
    return _service_response(verify_login_2fa(data))


@auth_api.get("/google/config")
def google_config():
    return success_response(
        message="Google sign-up configuration fetched successfully.",
        data={
            "enabled": bool(settings.GOOGLE_AUTH_ENABLED and settings.GOOGLE_CLIENT_ID),
            "client_id": settings.GOOGLE_CLIENT_ID if settings.GOOGLE_AUTH_ENABLED else ""
        }
    )


@auth_api.post("/google")
def google_auth():
    data = request.get_json(silent=True) or {}
    client_ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    user_agent = request.headers.get("User-Agent", "")

    return _service_response(google_auth_user(
        data=data,
        client_ip=client_ip,
        user_agent=user_agent
    ))


def _normalise_origin(value):
    origin = str(value or "").strip().rstrip("/")
    return origin


def _is_loopback_origin(origin):
    return origin.startswith("http://127.0.0.1") or origin.startswith("http://localhost")


def _resolve_password_reset_frontend_url(data):
    """Resolve the public frontend origin for password reset emails.

    Important for local mobile testing:
    - 127.0.0.1 works only on the same PC.
    - A phone must open the PC Wi-Fi IP, e.g. http://192.168.1.58:5000.

    Priority:
    1. PASSWORD_RESET_PUBLIC_URL / APP_PUBLIC_URL from backend .env
    2. FRONTEND_URL from backend .env if it is not localhost/127.0.0.1
    3. frontend_url sent by the browser
    4. request.host_url fallback
    """

    configured_public = _normalise_origin(
        getattr(settings, "PASSWORD_RESET_PUBLIC_URL", "") or getattr(settings, "APP_PUBLIC_URL", "")
    )
    if configured_public:
        return configured_public

    configured_frontend = _normalise_origin(getattr(settings, "FRONTEND_URL", ""))
    requested_origin = _normalise_origin((data or {}).get("frontend_url"))
    request_origin = _normalise_origin(request.host_url)

    # In production, use configured FRONTEND_URL when available.
    if configured_frontend and not _is_loopback_origin(configured_frontend):
        return configured_frontend

    # Development fallback: same origin used by the page request.
    if requested_origin:
        return requested_origin

    if configured_frontend:
        return configured_frontend

    return request_origin

@auth_api.post("/forgot-password/request")
def forgot_password_request():
    data = request.get_json(silent=True) or {}
    base_url = _resolve_password_reset_frontend_url(data)
    client_ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    user_agent = request.headers.get("User-Agent", "")

    result = request_password_reset(
        data=data,
        base_url=base_url,
        client_ip=client_ip,
        user_agent=user_agent
    )

    return _service_response(result)


@auth_api.post("/forgot-password/verify-code")
def forgot_password_verify_code():
    data = request.get_json(silent=True) or {}
    return _service_response(verify_password_reset_code(data))


@auth_api.post("/forgot-password/reset")
def forgot_password_reset():
    data = request.get_json(silent=True) or {}
    return _service_response(reset_password_with_code(data))

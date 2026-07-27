import hashlib
from datetime import datetime, timezone, timedelta
from secrets import randbelow, token_urlsafe


from flask import Blueprint, request
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from werkzeug.security import check_password_hash

from config.database import get_database
from config.settings import settings
from utils.jwt_helper import generate_token
from utils.date_helper import now_utc
from utils.password_helper import hash_password, verify_password
from utils.validators import clean_string, validate_email_address, validate_mobile, validate_name, validate_password_strength
from utils.response import success_response, error_response
from services.email_service import send_admin_password_reset_code_email, send_admin_registration_code_email
from .audit_service import create_admin_audit_log


admin_auth_api = Blueprint("admin_auth_api", __name__, url_prefix="/auth")


ALLOWED_SELF_REGISTER_ROLES = {"admin", "finance", "support", "risk"}
ADMIN_RESET_COLLECTION = "admin_password_reset_codes"
ADMIN_REGISTER_COLLECTION = "admin_registration_verification_codes"
ADMIN_REGISTER_CODE_MAX_REQUESTS = 3
ADMIN_REGISTER_CODE_LIMIT_MINUTES = 30
ADMIN_REGISTER_CODE_SECONDS = 120
GENERIC_ADMIN_RESET_MESSAGE = "If this admin email exists in TraidiumX, a password reset code has been sent."


def _is_development_mode():
    return str(getattr(settings, "APP_ENV", "development") or "development").lower() != "production"


def _normalize_email(value):
    return clean_string(value).lower()


def _normalize_code(value):
    return "".join(ch for ch in str(value or "") if ch.isdigit())[:6]


def _normalize_mobile(value):
    return "".join(ch for ch in str(value or "") if ch.isdigit())[:10]


def _validate_admin_mobile(value):
    mobile = _normalize_mobile(value)
    if len(mobile) != 10:
        return False, "Mobile number must be exactly 10 digits."
    return True, ""


def _generate_code():
    return f"{randbelow(1000000):06d}"


def _hash_admin_reset_code(admin_id, email, code):
    raw = f"{str(admin_id)}:{_normalize_email(email)}:{_normalize_code(code)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _hash_admin_register_code(email, code):
    raw = f"admin-register:{_normalize_email(email)}:{_normalize_code(code)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _admin_register_collection():
    db = get_database()
    collection = db[ADMIN_REGISTER_COLLECTION]
    try:
        collection.create_index("email")
        collection.create_index("code_hash")
        collection.create_index("status")
        collection.create_index("created_at")
        collection.create_index("expires_at", expireAfterSeconds=0, name="admin_register_expires_ttl")
    except Exception as error:
        print("ADMIN REGISTER INDEX ERROR:", str(error))
    return collection


def _expire_active_admin_register_codes(email):
    _admin_register_collection().update_many(
        {"email": _normalize_email(email), "status": "active"},
        {"$set": {"status": "expired", "expired_at": now_utc(), "updated_at": now_utc()}},
    )


def _count_recent_admin_register_requests(email):
    since = now_utc() - timedelta(minutes=ADMIN_REGISTER_CODE_LIMIT_MINUTES)
    return _admin_register_collection().count_documents({
        "email": _normalize_email(email),
        "created_at": {"$gte": since},
    })


def _admin_register_rate_limit_status(email):
    since = now_utc() - timedelta(minutes=ADMIN_REGISTER_CODE_LIMIT_MINUTES)
    query = {"email": _normalize_email(email), "created_at": {"$gte": since}}
    collection = _admin_register_collection()
    recent_count = collection.count_documents(query)
    oldest = collection.find_one(query, sort=[("created_at", 1)])
    reset_at = None
    retry_after_seconds = 0
    if oldest and oldest.get("created_at"):
        created_at = oldest.get("created_at")
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        reset_at = created_at + timedelta(minutes=ADMIN_REGISTER_CODE_LIMIT_MINUTES)
        retry_after_seconds = max(0, int((reset_at - now_utc()).total_seconds()))
    return recent_count, retry_after_seconds, reset_at


def _find_active_admin_register_code(email, code):
    normalized_code = _normalize_code(code)
    if len(normalized_code) != 6:
        return None

    return _admin_register_collection().find_one({
        "email": _normalize_email(email),
        "code_hash": _hash_admin_register_code(email, normalized_code),
        "status": "active",
        "expires_at": {"$gt": now_utc()},
    })


def _admin_reset_collection():
    db = get_database()
    collection = db[ADMIN_RESET_COLLECTION]
    try:
        collection.create_index("code_hash")
        collection.create_index("email")
        collection.create_index("admin_id")
        collection.create_index("status")
        collection.create_index("created_at")
        collection.create_index("expires_at", expireAfterSeconds=0, name="admin_reset_expires_ttl")
    except Exception as error:
        print("ADMIN RESET INDEX ERROR:", str(error))
    return collection


def _expire_active_admin_reset_codes(admin_id):
    _admin_reset_collection().update_many(
        {"admin_id": str(admin_id), "status": "active"},
        {"$set": {"status": "expired", "expired_at": now_utc(), "updated_at": now_utc()}},
    )


def _find_active_admin_reset_code(admin, email, code):
    normalized_code = _normalize_code(code)
    if not admin or len(normalized_code) != 6:
        return None
    return _admin_reset_collection().find_one({
        "admin_id": str(admin["_id"]),
        "email": _normalize_email(email),
        "code_hash": _hash_admin_reset_code(str(admin["_id"]), email, normalized_code),
        "status": "active",
        "expires_at": {"$gt": now_utc()},
    })


def _count_recent_admin_reset_requests(email, window_minutes=60):
    since = now_utc() - timedelta(minutes=window_minutes)
    return _admin_reset_collection().count_documents({
        "email": _normalize_email(email),
        "created_at": {"$gte": since},
    })


def _safe_admin_payload(admin):
    admin_status = get_admin_status(admin)
    return {
        "id": str(admin.get("_id", "")),
        "name": admin.get("name") or admin.get("full_name") or "Admin",
        "email": admin.get("email"),
        "role": admin.get("role", "admin"),
        "permissions": admin.get("permissions", []),
        "status": admin_status,
    }


def create_admin_token(admin):
    return generate_token(
        user_id=str(admin["_id"]),
        email=admin.get("email", ""),
        role=admin.get("role", "admin"),
    )


def get_admin_status(admin):
    if admin.get("status"):
        return str(admin.get("status") or "").strip().lower()

    if admin.get("is_active") is False:
        return "disabled"

    return "active"


def verify_admin_password(admin, password):
    """
    Supports both password systems used in this project:
    1) bcrypt hashes created by utils.password_helper.hash_password()
    2) werkzeug hashes created by werkzeug.generate_password_hash()

    It also safely handles invalid/old hash values so login never crashes with 500.
    """
    stored_password = str(admin.get("password_hash") or admin.get("password") or "")

    if not stored_password or not password:
        return False

    # Project seed_admin.py creates bcrypt hashes like: $2b$12$...
    if stored_password.startswith(("$2a$", "$2b$", "$2y$")):
        return verify_password(password, stored_password)

    # Some older records may use werkzeug hashes like: scrypt:... or pbkdf2:...
    if stored_password.startswith(("scrypt:", "pbkdf2:", "sha256:")):
        try:
            return check_password_hash(stored_password, password)
        except ValueError:
            return False

    # Development safety for old plain-text admin records.
    # If matched, migrate it to bcrypt so future logins are secure.
    if stored_password == password:
        try:
            db = get_database()
            db.admins.update_one(
                {"_id": admin["_id"]},
                {
                    "$set": {
                        "password_hash": hash_password(password),
                        "updated_at": datetime.now(timezone.utc),
                    },
                    "$unset": {"password": ""},
                },
            )
        except Exception as error:
            print("ADMIN PASSWORD MIGRATION ERROR:", str(error))
        return True

    return False


def safe_audit_login(admin, action, message, metadata=None, status="success"):
    try:
        create_admin_audit_log(
            admin_id=str(admin.get("_id", "")),
            admin_email=admin.get("email", ""),
            action=action,
            resource_type="admin",
            resource_id=str(admin.get("_id", "")),
            status=status,
            message=message,
            metadata=metadata or {},
        )
    except Exception as error:
        print("ADMIN LOGIN AUDIT ERROR:", str(error))


@admin_auth_api.post("/login")
def admin_login():
    db = get_database()
    payload = request.get_json(silent=True) or {}

    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")

    if not email or not password:
        return error_response(
            message="Email and password are required.",
            errors={"auth": "Missing credentials."},
            status_code=422,
        )

    admin = db.admins.find_one({"email": email})

    if not admin:
        return error_response(
            message="Invalid admin credentials.",
            errors={"auth": "Invalid email or password."},
            status_code=401,
        )

    admin_status = get_admin_status(admin)

    if admin_status != "active":
        return error_response(
            message="Admin account is disabled.",
            errors={"auth": "Account disabled."},
            status_code=403,
        )

    if not verify_admin_password(admin, password):
        safe_audit_login(
            admin=admin,
            action="admin.login_failed",
            message="Admin login failed due to invalid password.",
            status="failed",
            metadata={
                "ip_address": request.headers.get("X-Forwarded-For", request.remote_addr),
                "user_agent": request.headers.get("User-Agent", ""),
            },
        )

        return error_response(
            message="Invalid admin credentials.",
            errors={"auth": "Invalid email or password."},
            status_code=401,
        )

    token = create_admin_token(admin)

    login_ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    user_agent = request.headers.get("User-Agent", "")

    db.admins.update_one(
        {"_id": admin["_id"]},
        {
            "$set": {
                "last_login_at": datetime.now(timezone.utc),
                "last_login_ip": login_ip,
                "updated_at": datetime.now(timezone.utc),
            },
            "$inc": {"login_count": 1},
        },
    )

    safe_audit_login(
        admin=admin,
        action="admin.login",
        message="Admin logged in successfully.",
        status="success",
        metadata={
            "ip_address": login_ip,
            "user_agent": user_agent,
        },
    )

    return success_response(
        message="Admin login successful.",
        data={
            "token": token,
            "admin": {
                "id": str(admin["_id"]),
                "name": admin.get("name") or admin.get("full_name") or "Admin",
                "email": admin.get("email"),
                "role": admin.get("role", "admin"),
                "permissions": admin.get("permissions", []),
                "status": admin_status,
            },
        },
    )


@admin_auth_api.post("/register")
def admin_register():
    """Start admin registration by emailing a verification code.

    This mirrors the user-side signup flow: collect admin details, send a
    six-digit code, and create the admin account only after code verification.
    """

    db = get_database()
    payload = request.get_json(silent=True) or {}

    if not getattr(settings, "ADMIN_REGISTER_ENABLED", True):
        return error_response(
            message="Admin registration is disabled.",
            errors={"register": "Admin registration is disabled by configuration."},
            status_code=403,
        )

    name = clean_string(payload.get("name") or payload.get("full_name"))
    email = _normalize_email(payload.get("email"))
    mobile = _normalize_mobile(payload.get("mobile") or payload.get("phone"))
    password = str(payload.get("password") or "")
    confirm_password = str(payload.get("confirm_password") or "")
    requested_role = "admin"

    errors = {}

    is_valid_name, name_error = validate_name(name)
    if not is_valid_name:
        errors["name"] = name_error

    is_valid_email, email_error = validate_email_address(email)
    if not is_valid_email:
        errors["email"] = email_error

    is_valid_mobile, mobile_error = _validate_admin_mobile(mobile)
    if not is_valid_mobile:
        errors["mobile"] = mobile_error

    is_valid_password, password_error = validate_password_strength(password)
    if not is_valid_password:
        errors["password"] = password_error

    if password != confirm_password:
        errors["confirm_password"] = "Password and confirm password do not match."

    if errors:
        return error_response(
            message="Validation failed.",
            errors=errors,
            status_code=422,
        )

    existing_admin = db.admins.find_one({"email": email})
    if existing_admin:
        return error_response(
            message="Admin email already exists.",
            errors={"email": "An admin account already exists with this email."},
            status_code=409,
        )

    admin_count = db.admins.count_documents({})

    max_requests = ADMIN_REGISTER_CODE_MAX_REQUESTS
    limit_minutes = ADMIN_REGISTER_CODE_LIMIT_MINUTES
    recent_count, retry_after_seconds, limit_reset_at = _admin_register_rate_limit_status(email)
    if recent_count >= max_requests:
        return error_response(
            message="Too many verification code requests.",
            errors={
                "email": f"You can send admin verification code {max_requests} times. Please try again after {limit_minutes} minutes.",
                "retry_after_seconds": retry_after_seconds or limit_minutes * 60,
                "limit_reset_at": limit_reset_at.isoformat() if limit_reset_at else None,
            },
            status_code=429,
        )

    role = "super_admin" if admin_count == 0 else requested_role
    permissions = ["*"] if role == "super_admin" else []

    verification_code = _generate_code()
    expires_seconds = ADMIN_REGISTER_CODE_SECONDS
    expires_at = now_utc() + timedelta(seconds=expires_seconds)

    _expire_active_admin_register_codes(email)

    _admin_register_collection().insert_one({
        "name": name,
        "email": email,
        "mobile": mobile,
        "password_hash": hash_password(password),
        "role": role,
        "requested_role": requested_role,
        "permissions": permissions,
        "setup_code_used": False,
        "status": "active",
        "code_hash": _hash_admin_register_code(email, verification_code),
        "created_at": now_utc(),
        "updated_at": now_utc(),
        "expires_at": expires_at,
        "verified_at": None,
        "used_at": None,
        "client_ip": request.headers.get("X-Forwarded-For", request.remote_addr),
        "user_agent": str(request.headers.get("User-Agent", ""))[:300],
    })

    email_status = send_admin_registration_code_email(
        to_email=email,
        code=verification_code,
        expires_seconds=expires_seconds,
    )

    data = {
        "email": email,
        "verification_required": True,
        "email_queued": True,
        "email_sent": bool(email_status.get("sent")),
        "expires_at": expires_at.isoformat(),
        "expires_in_seconds": expires_seconds,
        "remaining_sends": max(0, max_requests - recent_count - 1),
        "max_sends": max_requests,
        "retry_after_seconds": retry_after_seconds if recent_count + 1 >= max_requests else 0,
        "limit_reset_at": limit_reset_at.isoformat() if limit_reset_at and recent_count + 1 >= max_requests else None,
    }
    if _is_development_mode():
        data["email_delivery_note"] = email_status.get("reason")

    return success_response(
        message="Admin verification code sent. Please check your email.",
        data=data,
        status_code=201,
    )


@admin_auth_api.post("/register/verify-code")
def admin_register_verify_code():
    """Verify admin registration email code and create the admin account."""

    db = get_database()
    payload = request.get_json(silent=True) or {}
    email = _normalize_email(payload.get("email"))
    code = _normalize_code(payload.get("code"))

    errors = {}
    is_valid_email, email_error = validate_email_address(email)
    if not is_valid_email:
        errors["email"] = email_error
    if len(code) != 6:
        errors["code"] = "Enter the 6 digit admin verification code."
    if errors:
        return error_response("Validation failed.", errors=errors, status_code=422)

    pending_admin = _find_active_admin_register_code(email, code)
    if not pending_admin:
        return error_response(
            message="Verification code is invalid or expired.",
            errors={"code": "This admin verification code is invalid, expired or already used."},
            status_code=400,
        )

    existing_admin = db.admins.find_one({"email": email})
    if existing_admin:
        _admin_register_collection().update_many(
            {"email": email, "status": "active"},
            {"$set": {"status": "used", "used_at": now_utc(), "updated_at": now_utc()}},
        )
        return error_response(
            message="Admin email already exists.",
            errors={"email": "An admin account already exists with this email."},
            status_code=409,
        )

    admin_count = db.admins.count_documents({})
    requested_role = str(pending_admin.get("requested_role") or pending_admin.get("role") or "admin").strip().lower()
    if requested_role not in ALLOWED_SELF_REGISTER_ROLES:
        requested_role = "admin"
    role = "super_admin" if admin_count == 0 else requested_role
    permissions = ["*"] if role == "super_admin" else []

    now = now_utc()
    admin_doc = {
        "name": pending_admin.get("name", "Admin"),
        "email": email,
        "mobile": pending_admin.get("mobile", ""),
        "password_hash": pending_admin.get("password_hash"),
        "role": role,
        "status": "active",
        "permissions": permissions,
        "created_at": now,
        "updated_at": now,
        "created_from": "admin_register_email_code",
        "email_verified_at": now,
        "last_login_at": None,
        "login_count": 0,
    }

    try:
        result = db.admins.insert_one(admin_doc)
        admin_doc["_id"] = result.inserted_id
    except DuplicateKeyError:
        return error_response(
            message="Admin email already exists.",
            errors={"email": "An admin account already exists with this email."},
            status_code=409,
        )

    _admin_register_collection().update_many(
        {"email": email, "status": "active"},
        {"$set": {"status": "used", "verified_at": now, "used_at": now, "updated_at": now}},
    )

    safe_audit_login(
        admin=admin_doc,
        action="admin.register",
        message="Admin registered after email verification code confirmation.",
        status="success",
        metadata={
            "role": admin_doc.get("role", "admin"),
            "ip_address": request.headers.get("X-Forwarded-For", request.remote_addr),
            "user_agent": request.headers.get("User-Agent", ""),
        },
    )

    return success_response(
        message="Admin email verified and account created successfully. Please login.",
        data={"admin": _safe_admin_payload(admin_doc)},
        status_code=201,
    )


@admin_auth_api.post("/forgot-password/request")
def admin_forgot_password_request():
    db = get_database()
    payload = request.get_json(silent=True) or {}
    email = _normalize_email(payload.get("email"))

    is_valid_email, email_error = validate_email_address(email)
    if not is_valid_email:
        return error_response(
            message="Validation failed.",
            errors={"email": email_error},
            status_code=422,
        )

    admin = db.admins.find_one({"email": email})

    # Do not reveal if an admin email exists.
    if not admin or get_admin_status(admin) != "active":
        return success_response(
            message=GENERIC_ADMIN_RESET_MESSAGE,
            data={"email_queued": True, "account_checked": False},
        )

    recent_count = _count_recent_admin_reset_requests(
        email=email,
        window_minutes=60,
    )
    max_requests = int(getattr(settings, "ADMIN_PASSWORD_RESET_MAX_REQUESTS_PER_HOUR", 5) or 5)

    if recent_count >= max_requests:
        return error_response(
            message="Too many reset requests.",
            errors={"email": "Too many admin password reset requests. Please try again later."},
            status_code=429,
        )

    reset_code = _generate_code()
    expires_minutes = int(getattr(settings, "PASSWORD_RESET_TOKEN_MINUTES", 30) or 30)
    expires_at = now_utc() + timedelta(minutes=expires_minutes)

    _expire_active_admin_reset_codes(str(admin["_id"]))

    _admin_reset_collection().insert_one({
        "admin_id": str(admin["_id"]),
        "email": email,
        "code_hash": _hash_admin_reset_code(str(admin["_id"]), email, reset_code),
        "status": "active",
        "created_at": now_utc(),
        "expires_at": expires_at,
        "verified_at": None,
        "used_at": None,
        "client_ip": request.headers.get("X-Forwarded-For", request.remote_addr),
        "user_agent": str(request.headers.get("User-Agent", ""))[:300],
        "internal_token": token_urlsafe(32),
    })

    email_status = send_admin_password_reset_code_email(
        to_email=email,
        code=reset_code,
        expires_minutes=expires_minutes,
    )

    data = {
        "email_queued": True,
        "email_sent": bool(email_status.get("sent")),
        "reset_method": "code",
        "expires_at": expires_at.isoformat(),
        "expires_in_minutes": expires_minutes,
    }
    if _is_development_mode():
        data["email_delivery_note"] = email_status.get("reason")
        if getattr(settings, "PASSWORD_RESET_DEV_LINK_ENABLED", True):
            data["dev_reset_code"] = reset_code

    return success_response(
        message=GENERIC_ADMIN_RESET_MESSAGE,
        data=data,
    )


@admin_auth_api.post("/forgot-password/verify-code")
def admin_forgot_password_verify_code():
    db = get_database()
    payload = request.get_json(silent=True) or {}
    email = _normalize_email(payload.get("email"))
    code = _normalize_code(payload.get("code"))

    errors = {}
    is_valid_email, email_error = validate_email_address(email)
    if not is_valid_email:
        errors["email"] = email_error
    if len(code) != 6:
        errors["code"] = "Enter the 6 digit admin reset code."
    if errors:
        return error_response("Validation failed.", errors=errors, status_code=422)

    admin = db.admins.find_one({"email": email})
    reset_record = _find_active_admin_reset_code(admin, email, code)

    if not reset_record:
        return error_response(
            message="Reset code is invalid or expired.",
            errors={"code": "This admin reset code is invalid, expired or already used."},
            status_code=400,
        )

    _admin_reset_collection().update_one(
        {"_id": reset_record["_id"]},
        {"$set": {"verified_at": now_utc(), "updated_at": now_utc()}},
    )

    return success_response(
        message="Reset code verified. Enter your new admin password.",
        data={"email": email, "code_verified": True, "reset_ready": True},
    )


@admin_auth_api.post("/forgot-password/reset")
def admin_forgot_password_reset():
    db = get_database()
    payload = request.get_json(silent=True) or {}
    email = _normalize_email(payload.get("email"))
    code = _normalize_code(payload.get("code") or payload.get("reset_code"))
    password = str(payload.get("password") or "")
    confirm_password = str(payload.get("confirm_password") or "")

    errors = {}
    is_valid_email, email_error = validate_email_address(email)
    if not is_valid_email:
        errors["email"] = email_error
    if len(code) != 6:
        errors["code"] = "Enter the 6 digit admin reset code."
    is_valid_password, password_error = validate_password_strength(password)
    if not is_valid_password:
        errors["password"] = password_error
    if password != confirm_password:
        errors["confirm_password"] = "Password and confirm password do not match."
    if errors:
        return error_response("Validation failed.", errors=errors, status_code=422)

    admin = db.admins.find_one({"email": email})
    reset_record = _find_active_admin_reset_code(admin, email, code)

    if not reset_record:
        return error_response(
            message="Reset code is invalid or expired.",
            errors={"code": "This admin reset code is invalid, expired or already used."},
            status_code=400,
        )

    db.admins.update_one(
        {"_id": admin["_id"]},
        {"$set": {"password_hash": hash_password(password), "updated_at": now_utc()}, "$unset": {"password": ""}},
    )

    _admin_reset_collection().update_many(
        {"admin_id": str(admin["_id"]), "status": "active"},
        {"$set": {"status": "used", "used_at": now_utc(), "updated_at": now_utc()}},
    )

    safe_audit_login(
        admin=admin,
        action="admin.password_reset",
        message="Admin password reset completed with email code.",
        status="success",
        metadata={
            "ip_address": request.headers.get("X-Forwarded-For", request.remote_addr),
            "user_agent": request.headers.get("User-Agent", ""),
        },
    )

    return success_response(
        message="Admin password reset successfully. Please login with your new password.",
        data={},
    )


@admin_auth_api.get("/me")
def admin_me():
    return success_response(
        message="Admin auth endpoint is available.",
        data={"status": "ok"},
    )

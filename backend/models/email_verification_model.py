import hashlib
from datetime import timedelta, timezone

from bson import ObjectId
from pymongo.errors import OperationFailure

from config.database import get_database
from utils.date_helper import now_utc


EMAIL_VERIFICATION_COLLECTION = "email_verification_codes"
EMAIL_VERIFICATION_RATE_LIMIT_COLLECTION = "email_verification_rate_limits"


def get_email_verification_collection():
    db = get_database()
    collection = db[EMAIL_VERIFICATION_COLLECTION]
    ensure_email_verification_indexes(collection)
    return collection


def get_email_verification_rate_limit_collection():
    db = get_database()
    collection = db[EMAIL_VERIFICATION_RATE_LIMIT_COLLECTION]
    ensure_email_verification_rate_limit_indexes(collection)
    return collection


def ensure_email_verification_rate_limit_indexes(collection):
    try:
        collection.create_index("email", unique=True)
        collection.create_index("window_expires_at")
    except OperationFailure:
        # Old local MongoDB index conflicts should not break registration flow.
        pass


def ensure_email_verification_indexes(collection):
    try:
        collection.create_index("email")
        collection.create_index("mobile")
        collection.create_index("status")
        collection.create_index("created_at")
        collection.create_index("expires_at")
        collection.create_index("code_hash")
        collection.create_index("expires_at", expireAfterSeconds=0, name="email_verification_expires_ttl")
    except OperationFailure:
        # Old local MongoDB index conflicts should not break registration flow.
        pass


def normalise_email(email):
    return str(email or "").strip().lower()


def _as_aware_utc_datetime(value):
    """Return MongoDB datetimes as timezone-aware UTC datetimes.

    PyMongo can return stored datetimes without tzinfo. The resend-limit
    comparison uses now_utc(), which is timezone-aware, so normalising here
    prevents a server 500 on the second code send.
    """

    if not value:
        return None

    if getattr(value, "tzinfo", None) is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def hash_verification_code(email, code):
    value = f"{normalise_email(email)}:{str(code or '').strip()}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def create_email_registration_request(registration_data, verification_code, expires_seconds=None, expires_minutes=None, client_ip="", user_agent=""):
    email = normalise_email(registration_data.get("email"))

    # Only one active code per email. New code invalidates the old code.
    expire_active_email_registration_requests(email)

    ttl_seconds = int(expires_seconds or 0)
    if ttl_seconds <= 0:
        ttl_seconds = int(expires_minutes or 10) * 60

    document = {
        "name": str(registration_data.get("name") or "").strip(),
        "email": email,
        "mobile": str(registration_data.get("mobile") or "").strip(),
        "password_hash": registration_data.get("password_hash", ""),
        "referral_code": str(registration_data.get("referral_code") or "").strip().upper(),
        "auth_provider": "password",
        "code_hash": hash_verification_code(email, verification_code),
        "status": "pending",
        "attempts": 0,
        "max_attempts": 5,
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(seconds=ttl_seconds),
        "expires_seconds": ttl_seconds,
        "verified_at": None,
        "client_ip": str(client_ip or "")[:80],
        "user_agent": str(user_agent or "")[:300]
    }

    result = get_email_verification_collection().insert_one(document)
    document["_id"] = result.inserted_id
    return document


def find_pending_email_registration_request(pending_id=None, email=None):
    query = {
        "status": "pending",
        "expires_at": {"$gt": now_utc()}
    }

    if pending_id:
        try:
            query["_id"] = ObjectId(pending_id) if not isinstance(pending_id, ObjectId) else pending_id
        except Exception:
            return None

    if email:
        query["email"] = normalise_email(email)

    return get_email_verification_collection().find_one(query)


def increment_email_verification_attempts(pending_id):
    get_email_verification_collection().update_one(
        {"_id": ObjectId(pending_id) if not isinstance(pending_id, ObjectId) else pending_id},
        {"$inc": {"attempts": 1}, "$set": {"updated_at": now_utc()}}
    )


def mark_email_registration_request_verified(pending_id, user_id=None):
    get_email_verification_collection().update_one(
        {"_id": ObjectId(pending_id) if not isinstance(pending_id, ObjectId) else pending_id},
        {
            "$set": {
                "status": "verified",
                "verified_at": now_utc(),
                "user_id": str(user_id) if user_id else "",
                "updated_at": now_utc()
            }
        }
    )


def expire_active_email_registration_requests(email):
    get_email_verification_collection().update_many(
        {
            "email": normalise_email(email),
            "status": "pending"
        },
        {
            "$set": {
                "status": "expired",
                "expired_at": now_utc(),
                "updated_at": now_utc()
            }
        }
    )


def reserve_email_verification_code_send(email, max_requests=3, window_minutes=30):
    """Reserve one sign-up verification code send for rate limiting.

    The verification code documents expire after the short code validity time, so
    rate-limit state is kept in a separate collection. This allows the project to
    enforce the required 3 sends / 30 minutes rule without changing the existing
    verification-code expiry behavior.
    """

    safe_email = normalise_email(email)
    safe_max_requests = max(1, int(max_requests or 3))
    safe_window_minutes = max(1, int(window_minutes or 30))
    current_time = now_utc()
    window_delta = timedelta(minutes=safe_window_minutes)
    collection = get_email_verification_rate_limit_collection()

    current = collection.find_one({"email": safe_email})

    if current:
        window_expires_at = _as_aware_utc_datetime(current.get("window_expires_at"))
        request_count = int(current.get("request_count", 0) or 0)

        if window_expires_at and window_expires_at > current_time:
            if request_count >= safe_max_requests:
                retry_after_seconds = max(1, int((window_expires_at - current_time).total_seconds()))
                return {
                    "allowed": False,
                    "request_count": request_count,
                    "remaining": 0,
                    "max_requests": safe_max_requests,
                    "window_minutes": safe_window_minutes,
                    "retry_after_seconds": retry_after_seconds,
                    "locked_until": window_expires_at
                }

            new_count = request_count + 1
            collection.update_one(
                {"_id": current["_id"]},
                {
                    "$set": {
                        "last_requested_at": current_time,
                        "updated_at": current_time
                    },
                    "$inc": {"request_count": 1}
                }
            )

            return {
                "allowed": True,
                "request_count": new_count,
                "remaining": max(0, safe_max_requests - new_count),
                "max_requests": safe_max_requests,
                "window_minutes": safe_window_minutes,
                "retry_after_seconds": max(1, int((window_expires_at - current_time).total_seconds())),
                "locked_until": window_expires_at
            }

    window_expires_at = current_time + window_delta
    collection.update_one(
        {"email": safe_email},
        {
            "$set": {
                "email": safe_email,
                "request_count": 1,
                "window_started_at": current_time,
                "window_expires_at": window_expires_at,
                "last_requested_at": current_time,
                "updated_at": current_time
            },
            "$setOnInsert": {
                "created_at": current_time
            }
        },
        upsert=True
    )

    return {
        "allowed": True,
        "request_count": 1,
        "remaining": max(0, safe_max_requests - 1),
        "max_requests": safe_max_requests,
        "window_minutes": safe_window_minutes,
        "retry_after_seconds": safe_window_minutes * 60,
        "locked_until": window_expires_at
    }


def count_recent_email_verification_requests(email, window_minutes=60):
    since = now_utc() - timedelta(minutes=int(window_minutes or 60))

    return get_email_verification_collection().count_documents({
        "email": normalise_email(email),
        "created_at": {"$gte": since}
    })

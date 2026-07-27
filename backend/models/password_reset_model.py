import hashlib
from datetime import timedelta


from bson import ObjectId
from pymongo.errors import OperationFailure

from config.database import get_database
from utils.date_helper import now_utc


PASSWORD_RESET_COLLECTION = "password_reset_tokens"


def get_password_reset_collection():
    db = get_database()
    collection = db[PASSWORD_RESET_COLLECTION]
    ensure_password_reset_indexes(collection)
    return collection


def ensure_password_reset_indexes(collection):
    try:
        collection.create_index("token_hash", unique=True)
        collection.create_index("reset_code_hash")
        collection.create_index("user_id")
        collection.create_index("email")
        collection.create_index("status")
        collection.create_index("created_at")
        collection.create_index("expires_at")
        # Expired reset rows are removed by MongoDB automatically after expiry.
        collection.create_index("expires_at", expireAfterSeconds=0, name="password_reset_expires_ttl")
    except OperationFailure:
        # Index conflicts should not break the request flow on old local databases.
        pass


def hash_reset_token(token):
    return hashlib.sha256(str(token).encode("utf-8")).hexdigest()


def normalize_reset_code(code):
    return "".join(ch for ch in str(code or "") if ch.isdigit())[:6]


def hash_reset_code(user_id, email, code):
    normalized_code = normalize_reset_code(code)
    normalized_email = str(email or "").strip().lower()
    raw_value = f"{str(user_id)}:{normalized_email}:{normalized_code}"
    return hashlib.sha256(raw_value.encode("utf-8")).hexdigest()


def create_password_reset_request(user_id, email, token_hash, expires_at, client_ip="", user_agent="", reset_code_hash=""):
    document = {
        "user_id": str(user_id),
        "email": str(email or "").strip().lower(),
        "token_hash": token_hash,
        "reset_code_hash": reset_code_hash,
        "reset_method": "code" if reset_code_hash else "link",
        "status": "active",
        "created_at": now_utc(),
        "expires_at": expires_at,
        "verified_at": None,
        "used_at": None,
        "client_ip": client_ip,
        "user_agent": str(user_agent or "")[:300]
    }

    result = get_password_reset_collection().insert_one(document)
    document["_id"] = result.inserted_id
    return document


def count_recent_password_reset_requests(email, window_minutes=60):
    since = now_utc() - timedelta(minutes=window_minutes)

    return get_password_reset_collection().count_documents({
        "email": str(email or "").strip().lower(),
        "created_at": {"$gte": since}
    })


def expire_active_password_reset_tokens_for_user(user_id):
    get_password_reset_collection().update_many(
        {
            "user_id": str(user_id),
            "status": "active"
        },
        {
            "$set": {
                "status": "expired",
                "expired_at": now_utc()
            }
        }
    )


def find_active_password_reset_token(token_hash):
    return get_password_reset_collection().find_one({
        "token_hash": token_hash,
        "status": "active",
        "expires_at": {"$gt": now_utc()}
    })


def find_active_password_reset_code(user_id, email, code):
    normalized_code = normalize_reset_code(code)

    if len(normalized_code) != 6:
        return None

    return get_password_reset_collection().find_one({
        "user_id": str(user_id),
        "email": str(email or "").strip().lower(),
        "reset_code_hash": hash_reset_code(user_id, email, normalized_code),
        "reset_method": "code",
        "status": "active",
        "expires_at": {"$gt": now_utc()}
    })


def mark_password_reset_code_verified(reset_id):
    get_password_reset_collection().update_one(
        {"_id": ObjectId(reset_id) if not isinstance(reset_id, ObjectId) else reset_id},
        {
            "$set": {
                "verified_at": now_utc(),
                "updated_at": now_utc()
            }
        }
    )


def mark_password_reset_token_used(reset_id):
    get_password_reset_collection().update_one(
        {"_id": ObjectId(reset_id) if not isinstance(reset_id, ObjectId) else reset_id},
        {
            "$set": {
                "status": "used",
                "used_at": now_utc(),
                "updated_at": now_utc()
            }
        }
    )

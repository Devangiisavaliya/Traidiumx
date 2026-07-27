from bson import ObjectId
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError

from config.database import get_database
from utils.date_helper import now_utc
from .utils import serialize_document


def get_admins_collection():
    return get_database().admins


def ensure_admin_indexes():
    collection = get_admins_collection()
    collection.create_index([("email", ASCENDING)], unique=True)
    collection.create_index([("status", ASCENDING)])
    collection.create_index([("role", ASCENDING)])


def find_admin_by_email(email):
    return get_admins_collection().find_one({"email": str(email or "").strip().lower()})


def find_admin_by_id(admin_id):
    try:
        return get_admins_collection().find_one({"_id": ObjectId(str(admin_id))})
    except Exception:
        return None


def create_admin(admin_data):
    ensure_admin_indexes()

    now = now_utc()
    admin_data["email"] = str(admin_data.get("email") or "").strip().lower()
    admin_data["name"] = str(admin_data.get("name") or "Admin").strip()
    admin_data["role"] = str(admin_data.get("role") or "admin").strip()
    admin_data["status"] = admin_data.get("status") or "active"
    admin_data["permissions"] = admin_data.get("permissions") or []
    admin_data["created_at"] = now
    admin_data["updated_at"] = now

    result = get_admins_collection().insert_one(admin_data)
    return result.inserted_id


def update_admin(admin_id, update_data):
    update_data["updated_at"] = now_utc()
    get_admins_collection().update_one(
        {"_id": ObjectId(str(admin_id))},
        {"$set": update_data},
    )
    return find_admin_by_id(admin_id)


def touch_admin_login(admin_id):
    return update_admin(
        admin_id,
        {
            "last_login_at": now_utc(),
            "login_count": 1,
        },
    )


def increment_admin_login(admin_id):
    get_admins_collection().update_one(
        {"_id": ObjectId(str(admin_id))},
        {
            "$set": {"last_login_at": now_utc(), "updated_at": now_utc()},
            "$inc": {"login_count": 1},
        },
    )
    return find_admin_by_id(admin_id)


def format_admin(admin):
    if not admin:
        return None

    formatted = serialize_document(admin)
    formatted.pop("password_hash", None)
    return formatted


def seed_admin_if_missing(email, password_hash, name="Super Admin", role="super_admin"):
    ensure_admin_indexes()

    existing = find_admin_by_email(email)
    if existing:
        return existing, False

    try:
        admin_id = create_admin(
            {
                "name": name,
                "email": email,
                "password_hash": password_hash,
                "role": role,
                "status": "active",
                "permissions": ["*"],
            }
        )
        return find_admin_by_id(admin_id), True
    except DuplicateKeyError:
        return find_admin_by_email(email), False

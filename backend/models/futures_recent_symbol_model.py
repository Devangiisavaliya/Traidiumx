from datetime import timedelta

from pymongo import ReturnDocument

from config.database import get_database
from utils.date_helper import now_utc


RECENT_SYMBOL_RETENTION_DAYS = 7
_indexes_ready = False


def get_futures_recent_symbols_collection():
    global _indexes_ready

    db = get_database()
    collection = db.futures_recent_symbols

    # The main application does not automatically run /api/db-init, so create
    # these indexes lazily on the first recent-symbol request as well.
    if not _indexes_ready:
        collection.create_index(
            [("user_id", 1), ("symbol", 1)],
            unique=True,
            name="user_symbol_unique",
        )
        collection.create_index(
            "last_viewed_at",
            expireAfterSeconds=RECENT_SYMBOL_RETENTION_DAYS * 24 * 60 * 60,
            name="last_viewed_at_ttl",
        )
        collection.create_index([("user_id", 1), ("last_viewed_at", -1)])
        _indexes_ready = True

    return collection


def upsert_user_recent_symbol(user_id, symbol, label):
    current_time = now_utc()

    return get_futures_recent_symbols_collection().find_one_and_update(
        {
            "user_id": str(user_id),
            "symbol": str(symbol).upper(),
        },
        {
            "$set": {
                "label": str(label),
                "last_viewed_at": current_time,
                "updated_at": current_time,
            },
            "$setOnInsert": {
                "created_at": current_time,
            },
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )


def delete_expired_user_recent_symbols(user_id):
    cutoff = now_utc() - timedelta(days=RECENT_SYMBOL_RETENTION_DAYS)

    return get_futures_recent_symbols_collection().delete_many({
        "user_id": str(user_id),
        "last_viewed_at": {"$lt": cutoff},
    }).deleted_count


def get_user_recent_symbols(user_id, limit=30):
    cutoff = now_utc() - timedelta(days=RECENT_SYMBOL_RETENTION_DAYS)

    cursor = get_futures_recent_symbols_collection().find({
        "user_id": str(user_id),
        "last_viewed_at": {"$gte": cutoff},
    }).sort("last_viewed_at", -1).limit(max(1, min(int(limit), 50)))

    return list(cursor)


def delete_user_recent_symbol(user_id, symbol):
    return get_futures_recent_symbols_collection().delete_many({
        "user_id": str(user_id),
        "symbol": str(symbol).upper(),
    }).deleted_count


def format_recent_symbol(item):
    if not item:
        return None

    return {
        "id": str(item.get("_id")),
        "symbol": item.get("symbol"),
        "label": item.get("label"),
        "last_viewed_at": item.get("last_viewed_at").isoformat() if item.get("last_viewed_at") else None,
        "created_at": item.get("created_at").isoformat() if item.get("created_at") else None,
    }


def format_recent_symbols(items):
    return [format_recent_symbol(item) for item in items]

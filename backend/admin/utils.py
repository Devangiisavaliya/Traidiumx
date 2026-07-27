from datetime import date, datetime
from decimal import Decimal

from bson import ObjectId


def to_object_id(value):
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def serialize_value(value):
    if isinstance(value, ObjectId):
        return str(value)

    if isinstance(value, datetime):
        return value.isoformat()

    if isinstance(value, date):
        return value.isoformat()

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, list):
        return [serialize_value(item) for item in value]

    if isinstance(value, tuple):
        return [serialize_value(item) for item in value]

    if isinstance(value, dict):
        return {key: serialize_value(item) for key, item in value.items()}

    return value


def serialize_document(document):
    if not document:
        return None

    serialized = serialize_value(document)
    if isinstance(serialized, dict) and "_id" in serialized:
        serialized["id"] = serialized["_id"]
    return serialized


def serialize_documents(documents):
    return [serialize_document(document) for document in documents]


def clean_string(value, max_length=None):
    text = str(value or "").strip()

    if max_length and len(text) > max_length:
        return text[:max_length]

    return text


def parse_int(value, default=1, minimum=1, maximum=500):
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default

    if number < minimum:
        return minimum

    if number > maximum:
        return maximum

    return number


def build_pagination(page, limit, total):
    pages = 0
    if limit > 0:
        pages = (total + limit - 1) // limit

    return {
        "page": page,
        "limit": limit,
        "total": total,
        "pages": pages,
        "has_next": page < pages,
        "has_prev": page > 1,
    }

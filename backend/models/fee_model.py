from config.database import get_database
from utils.date_helper import now_utc


FEE_CONFIG_COLLECTION = "fee_config"


def get_fee_config_collection():
    db = get_database()
    return db[FEE_CONFIG_COLLECTION]


def get_active_fee_config():
    return get_fee_config_collection().find_one({
        "status": "active"
    })


def upsert_fee_config(config_data):
    config_key = config_data.get("config_key", "default_company_fee_structure")

    config_data["config_key"] = config_key
    config_data["updated_at"] = now_utc()

    get_fee_config_collection().update_one(
        {
            "config_key": config_key
        },
        {
            "$set": config_data,
            "$setOnInsert": {
                "created_at": now_utc()
            }
        },
        upsert=True
    )

    return get_fee_config_collection().find_one({
        "config_key": config_key
    })


def _iso(value):
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def serialize_fee_config(config):
    if not config:
        return None

    return {
        "id": str(config.get("_id")),
        "config_key": config.get("config_key"),
        "status": config.get("status", "active"),
        "version": config.get("version", "1.0.0"),
        "currency": config.get("currency", "USDT"),
        "source": config.get("source", "backend_fee_config"),
        "updated_at": _iso(config.get("updated_at")),
        "sections": config.get("sections", []),
        "vip_tiers": config.get("vip_tiers", []),
        "calculator": config.get("calculator", {}),
        "policy_notes": config.get("policy_notes", []),
        "summary": config.get("summary", {})
    }

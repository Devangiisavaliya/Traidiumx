from bson import ObjectId
from config.database import get_database
from utils.date_helper import now_utc


def get_mt5_accounts_collection():
    return get_database().mt5_accounts


def find_mt5_account_by_user_id(user_id):
    return get_mt5_accounts_collection().find_one({"user_id": str(user_id)})


def upsert_mt5_account(user_id, data):
    payload = dict(data or {})
    payload["user_id"] = str(user_id)
    payload["updated_at"] = now_utc()
    get_mt5_accounts_collection().update_one(
        {"user_id": str(user_id)},
        {"$set": payload, "$setOnInsert": {"created_at": now_utc()}},
        upsert=True,
    )
    return find_mt5_account_by_user_id(user_id)


def format_mt5_account(account):
    if not account:
        return None
    login = str(account.get("login_id") or account.get("login") or "")
    masked_login = f"******{login[-4:]}" if login else ""
    return {
        "id": str(account.get("_id")) if account.get("_id") else "",
        "user_id": account.get("user_id", ""),
        "status": account.get("status", "not_created"),
        "mode": account.get("mode", "auto_provision"),
        "broker_name": account.get("broker_name", ""),
        "server": account.get("server", ""),
        "login_id": login,
        "masked_login_id": masked_login,
        "account_currency": account.get("account_currency", "USD"),
        "balance": account.get("balance", 0.0),
        "equity": account.get("equity", account.get("balance", 0.0)),
        "group": account.get("group", ""),
        "plan": account.get("plan", ""),
        "spread_pips": account.get("spread_pips", 0.0),
        "spread_type": account.get("spread_type", "fixed"),
        "spread_value": account.get("spread_value", 0.0),
        "connection_status": account.get("connection_status", "disconnected"),
        "provider_account_id": account.get("provider_account_id", ""),
        "provisioning_note": account.get("provisioning_note", ""),
        "password_setup_required": bool(account.get("password_setup_required", False)),
        "funding_status": account.get("funding_status", ""),
        "last_funding_amount": account.get("last_funding_amount", 0.0),
        "last_funding_reference_id": account.get("last_funding_reference_id", ""),
        "last_funded_at": account.get("last_funded_at").isoformat() if hasattr(account.get("last_funded_at"), "isoformat") else account.get("last_funded_at"),
        "group_sync_status": account.get("group_sync_status", ""),
        "group_sync_note": account.get("group_sync_note", ""),
        "created_at": account.get("created_at").isoformat() if hasattr(account.get("created_at"), "isoformat") else account.get("created_at"),
        "updated_at": account.get("updated_at").isoformat() if hasattr(account.get("updated_at"), "isoformat") else account.get("updated_at"),
    }

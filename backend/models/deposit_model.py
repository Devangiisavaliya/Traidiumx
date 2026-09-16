from bson import ObjectId

from config.database import get_database
from utils.date_helper import now_utc


def get_deposits_collection():
    db = get_database()
    return db.deposits


def create_deposit(deposit_data):
    deposit_data["created_at"] = now_utc()
    deposit_data["updated_at"] = now_utc()

    result = get_deposits_collection().insert_one(deposit_data)
    return result.inserted_id


def find_deposit_by_id(deposit_id):
    try:
        return get_deposits_collection().find_one({"_id": ObjectId(deposit_id)})
    except Exception:
        return None


def find_user_deposit_by_id(user_id, deposit_id):
    try:
        return get_deposits_collection().find_one({"_id": ObjectId(deposit_id), "user_id": str(user_id)})
    except Exception:
        return None


def find_deposit_by_tx_hash(tx_hash):
    return get_deposits_collection().find_one({"tx_hash": str(tx_hash)})


def find_deposit_by_gateway_order_id(gateway_order_id):
    return get_deposits_collection().find_one({"gateway_order_id": str(gateway_order_id)})



def find_completed_deposit_by_tx_hash(tx_hash):
    return get_deposits_collection().find_one({"tx_hash": str(tx_hash), "status": "completed"})


def get_user_deposits(user_id, limit=500):
    deposits = get_deposits_collection().find({"user_id": str(user_id)}).sort("created_at", -1).limit(limit)
    return list(deposits)


def update_deposit_status(deposit_id, status, extra_data=None):
    update_data = {"status": status, "updated_at": now_utc()}
    if extra_data:
        update_data.update(extra_data)

    get_deposits_collection().update_one({"_id": ObjectId(deposit_id)}, {"$set": update_data})
    return find_deposit_by_id(deposit_id)


def format_deposit(deposit):
    if not deposit:
        return None

    return {
        "id": str(deposit["_id"]),
        "user_id": deposit.get("user_id"),
        "deposit_reference": deposit.get("deposit_reference"),
        "amount": deposit.get("amount", 0.0),
        "currency": deposit.get("currency", "USDT"),
        "payment_method": deposit.get("payment_method", ""),
        "gateway": deposit.get("gateway", ""),
        "gateway_order_id": deposit.get("gateway_order_id", ""),
        "gateway_payment_id": deposit.get("gateway_payment_id", ""),
        "crypto_asset": deposit.get("crypto_asset", ""),
        "crypto_network": deposit.get("crypto_network", ""),
        "deposit_address": deposit.get("deposit_address", ""),
        "tx_hash": deposit.get("tx_hash", ""),
        "explorer_url": deposit.get("explorer_url", ""),
        "verification_status": deposit.get("verification_status", "not_checked"),
        "verification_message": deposit.get("verification_message", ""),
        "confirmations": deposit.get("confirmations", 0),
        "required_confirmations": deposit.get("required_confirmations", 0),
        "verified_amount": deposit.get("verified_amount", 0.0),
        "verified_to_address": deposit.get("verified_to_address", ""),
        "credited_at": deposit.get("credited_at").isoformat() if deposit.get("credited_at") else None,
        "status": deposit.get("status", "pending_verification"),
        "remark": deposit.get("remark", ""),
        "created_at": deposit.get("created_at").isoformat() if deposit.get("created_at") else None,
        "updated_at": deposit.get("updated_at").isoformat() if deposit.get("updated_at") else None,
    }


def format_deposits(deposits):
    return [format_deposit(deposit) for deposit in deposits]

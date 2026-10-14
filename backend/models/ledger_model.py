from config.database import get_database
from utils.date_helper import now_utc, to_iso_utc


def get_wallet_ledger_collection():
    db = get_database()
    return db.wallet_ledger


def create_ledger_entry(
    user_id,
    wallet_id,
    transaction_type,
    direction,
    amount,
    balance_before,
    balance_after,
    reference_id=None,
    description="",
    currency=None
):
    if not currency:
        tx_type_lower = str(transaction_type or "").lower()
        desc_upper = str(description or "").upper()
        if "inr" in tx_type_lower or "INR" in desc_upper or "₹" in desc_upper:
            currency = "INR"
        elif (
            "crypto" in tx_type_lower or 
            "usdt" in tx_type_lower or 
            "USDT" in desc_upper or
            "trading_fee" in tx_type_lower or
            "margin_lock" in tx_type_lower or
            "settlement" in tx_type_lower or
            "position" in tx_type_lower or
            "option" in tx_type_lower or
            "futures" in tx_type_lower
        ):
            currency = "USDT"
        else:
            try:
                db = get_database()
                wallet = db.wallets.find_one({"user_id": str(user_id)})
                if wallet:
                    currency = (
                        wallet.get("primary_currency")
                        or (wallet.get("main_wallet") or {}).get("currency")
                        or wallet.get("currency")
                    )
            except Exception:
                pass

    currency = str(currency or "USDT").strip().upper()
    if currency not in ["INR", "USDT"]:
        currency = "USDT"

    ledger_data = {
        "user_id": str(user_id),
        "wallet_id": str(wallet_id),
        "transaction_type": transaction_type,
        "direction": direction,
        "amount": float(amount),
        "balance_before": float(balance_before),
        "balance_after": float(balance_after),
        "reference_id": str(reference_id) if reference_id else None,
        "description": description,
        "currency": currency,
        "status": "completed",
        "created_at": now_utc()
    }

    result = get_wallet_ledger_collection().insert_one(ledger_data)

    return result.inserted_id


def get_user_ledger(user_id, limit=500):
    ledger_items = get_wallet_ledger_collection().find({
        "user_id": str(user_id)
    }).sort("created_at", -1).limit(limit)

    return list(ledger_items)


def format_ledger_item(item, wallet_currency_cache=None):
    if not item:
        return None

    tx_type_lower = str(item.get("transaction_type") or "").lower()
    desc_upper = str(item.get("description") or "").upper()

    if "inr" in tx_type_lower or "INR" in desc_upper or "₹" in desc_upper:
        currency = "INR"
    elif "crypto" in tx_type_lower or "usdt" in tx_type_lower or "USDT" in desc_upper:
        currency = "USDT"
    else:
        currency = item.get("currency")
        if not currency:
            user_id = str(item.get("user_id"))
            if wallet_currency_cache is not None and user_id in wallet_currency_cache:
                currency = wallet_currency_cache[user_id]
            else:
                try:
                    db = get_database()
                    w = db.wallets.find_one({"user_id": user_id})
                    if w:
                        currency = w.get("primary_currency") or (w.get("main_wallet") or {}).get("currency")
                        if wallet_currency_cache is not None:
                            wallet_currency_cache[user_id] = currency
                except Exception:
                    pass

    currency = str(currency or "USDT").strip().upper()
    if currency not in ["INR", "USDT"]:
        currency = "USDT"

    return {
        "_id": str(item["_id"]),
        "id": str(item["_id"]),
        "user_id": item.get("user_id"),
        "wallet_id": item.get("wallet_id"),
        "transaction_type": item.get("transaction_type"),
        "direction": item.get("direction"),
        "amount": item.get("amount", 0.0),
        "balance_before": item.get("balance_before", 0.0),
        "balance_after": item.get("balance_after", 0.0),
        "reference_id": item.get("reference_id"),
        "description": item.get("description", ""),
        "currency": currency,
        "status": item.get("status", "completed"),
        "created_at": to_iso_utc(item.get("created_at"))
    }


def format_ledger_items(items):
    wallet_currency_cache = {}
    return [format_ledger_item(item, wallet_currency_cache=wallet_currency_cache) for item in items]
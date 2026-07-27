from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ReturnDocument

from config.database import get_database
from utils.date_helper import now_utc


def get_orders_collection():
    db = get_database()
    return db.orders


def create_order(order_data):
    order_data["created_at"] = now_utc()
    order_data["updated_at"] = now_utc()

    result = get_orders_collection().insert_one(order_data)

    return result.inserted_id


def find_order_by_id(order_id):
    try:
        return get_orders_collection().find_one({
            "_id": ObjectId(order_id)
        })
    except InvalidId:
        return None


def get_user_orders(user_id, limit=100):
    orders = get_orders_collection().find({
        "user_id": str(user_id)
    }).sort("created_at", -1).limit(limit)

    return list(orders)


def get_user_open_orders(user_id):
    orders = get_orders_collection().find({
        "user_id": str(user_id),
        "status": {
            "$in": ["open", "pending_trigger"]
        }
    }).sort("created_at", -1)

    return list(orders)



def claim_order_for_action(order_id, user_id, action_status, allowed_statuses=None):
    """Atomically claim an open order so execute/cancel cannot run twice."""
    allowed_statuses = allowed_statuses or ["open", "pending_trigger"]
    try:
        return get_orders_collection().find_one_and_update(
            {
                "_id": ObjectId(order_id),
                "user_id": str(user_id),
                "status": {"$in": list(allowed_statuses)},
            },
            {
                "$set": {
                    "status": str(action_status),
                    "action_claimed_at": now_utc(),
                    "updated_at": now_utc(),
                }
            },
            return_document=ReturnDocument.BEFORE,
        )
    except InvalidId:
        return None


def release_order_action_claim(order_id, claimed_status, restore_status):
    """Release only the claim owned by the current action."""
    try:
        get_orders_collection().update_one(
            {"_id": ObjectId(order_id), "status": str(claimed_status)},
            {
                "$set": {
                    "status": str(restore_status),
                    "updated_at": now_utc(),
                },
                "$unset": {"action_claimed_at": ""},
            },
        )
        return find_order_by_id(order_id)
    except InvalidId:
        return None

def update_order(order_id, update_data):
    update_data["updated_at"] = now_utc()

    get_orders_collection().update_one(
        {
            "_id": ObjectId(order_id)
        },
        {
            "$set": update_data
        }
    )

    return find_order_by_id(order_id)


def format_order(order):
    if not order:
        return None

    return {
        "id": str(order["_id"]),
        "user_id": order.get("user_id"),
        "order_reference": order.get("order_reference"),
        "symbol": order.get("symbol"),
        "side": order.get("side"),
        "order_type": order.get("order_type"),
        "quantity": order.get("quantity", 0.0),
        "leverage": order.get("leverage", 1),
        "limit_price": order.get("limit_price"),
        "stop_price": order.get("stop_price"),
        "take_profit": order.get("take_profit"),
        "stop_loss": order.get("stop_loss"),
        "estimated_price": order.get("estimated_price", 0.0),
        "base_estimated_price": order.get("base_estimated_price", order.get("estimated_price", 0.0)),
        "platform": order.get("platform", "traidiumx"),
        "plan": order.get("plan", ""),
        "plan_name": order.get("plan_name", ""),
        "spread_pips": order.get("spread_pips", 0.0),
        "spread_type": order.get("spread_type", "fixed"),
        "spread_value": order.get("spread_value", 0.0),
        "pip_size": order.get("pip_size", 0.0),
        "spread_price": order.get("spread_price", 0.0),
        "notional_value": order.get("notional_value", 0.0),
        "margin_amount": order.get("margin_amount", 0.0),
        "platform_fee": order.get("platform_fee", 0.0),
        "trading_fee": order.get("trading_fee", order.get("platform_fee", 0.0)),
        "platform_fee_status": order.get("platform_fee_status"),
        "trading_fee_status": order.get("trading_fee_status", order.get("platform_fee_status")),
        "platform_fee_charged": order.get("platform_fee_charged", False),
        "trading_fee_charged": order.get("trading_fee_charged", order.get("platform_fee_charged", False)),
        "platform_fee_config": order.get("platform_fee_config", {}),
        "trading_fee_config": order.get("trading_fee_config", order.get("platform_fee_config", {})),
        "status": order.get("status", "open"),
        "filled_quantity": order.get("filled_quantity", 0.0),
        "average_fill_price": order.get("average_fill_price", 0.0),
        "reduce_only": order.get("reduce_only", False),
        "remark": order.get("remark", ""),
        "created_at": order.get("created_at").isoformat() if order.get("created_at") else None,
        "updated_at": order.get("updated_at").isoformat() if order.get("updated_at") else None,
        "cancelled_at": order.get("cancelled_at").isoformat() if order.get("cancelled_at") else None,
        "executed_at": order.get("executed_at").isoformat() if order.get("executed_at") else None,
        "liquidation_price": order.get("liquidation_price", 0.0),
        "risk": order.get("risk", {})
    }


def format_orders(orders):
    return [format_order(order) for order in orders]

def get_user_pending_trigger_orders(user_id):
    orders = get_orders_collection().find({
        "user_id": str(user_id),
        "status": "pending_trigger"
    }).sort("created_at", -1)

    return list(orders)
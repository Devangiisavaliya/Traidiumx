from bson import ObjectId
from bson.errors import InvalidId

from config.database import get_database
from utils.date_helper import now_utc


def get_option_orders_collection():
    return get_database().option_orders


def get_option_positions_collection():
    return get_database().option_positions


def get_option_fills_collection():
    return get_database().option_fills


def create_option_order(order_data):
    order_data["created_at"] = now_utc()
    order_data["updated_at"] = now_utc()
    result = get_option_orders_collection().insert_one(order_data)
    return result.inserted_id


def find_option_order_by_id(order_id):
    try:
        return get_option_orders_collection().find_one({"_id": ObjectId(order_id)})
    except (InvalidId, TypeError):
        return None


def update_option_order(order_id, update_data):
    update_data["updated_at"] = now_utc()
    try:
        get_option_orders_collection().update_one(
            {"_id": ObjectId(order_id)},
            {"$set": update_data}
        )
    except (InvalidId, TypeError):
        return None
    return find_option_order_by_id(order_id)


def get_user_option_orders(user_id, limit=100):
    return list(
        get_option_orders_collection()
        .find({"user_id": str(user_id)})
        .sort("created_at", -1)
        .limit(limit)
    )


def get_user_open_option_orders(user_id):
    return list(
        get_option_orders_collection()
        .find({"user_id": str(user_id), "status": {"$in": ["open", "pending_trigger"]}})
        .sort("created_at", -1)
    )


def get_user_conditional_option_orders(user_id):
    return list(
        get_option_orders_collection()
        .find({
            "user_id": str(user_id),
            "status": {"$in": ["open", "pending_trigger"]},
            "$or": [
                {"order_type": "STOP_LIMIT"},
                {"stop_price": {"$gt": 0}},
                {"take_profit": {"$gt": 0}},
                {"stop_loss": {"$gt": 0}}
            ]
        })
        .sort("created_at", -1)
    )


def create_option_fill(fill_data):
    fill_data["created_at"] = now_utc()
    result = get_option_fills_collection().insert_one(fill_data)
    return result.inserted_id


def get_user_option_fills(user_id, limit=100):
    return list(
        get_option_fills_collection()
        .find({"user_id": str(user_id)})
        .sort("created_at", -1)
        .limit(limit)
    )


def find_open_option_position(user_id, contract, action, option_side):
    return get_option_positions_collection().find_one({
        "user_id": str(user_id),
        "contract": str(contract),
        "action": str(action),
        "option_side": str(option_side),
        "status": "open"
    })


def create_option_position(position_data):
    position_data["created_at"] = now_utc()
    position_data["updated_at"] = now_utc()
    result = get_option_positions_collection().insert_one(position_data)
    return result.inserted_id


def update_option_position(position_id, update_data):
    update_data["updated_at"] = now_utc()
    try:
        get_option_positions_collection().update_one(
            {"_id": ObjectId(position_id)},
            {"$set": update_data}
        )
    except (InvalidId, TypeError):
        return None
    return get_option_positions_collection().find_one({"_id": ObjectId(position_id)})


def find_option_position_by_id(position_id):
    try:
        return get_option_positions_collection().find_one({"_id": ObjectId(position_id)})
    except (InvalidId, TypeError):
        return None


def get_user_open_option_positions(user_id):
    return list(
        get_option_positions_collection()
        .find({"user_id": str(user_id), "status": "open"})
        .sort("updated_at", -1)
    )


def _iso(value):
    return value.isoformat() if value else None


def format_option_order(order):
    if not order:
        return None
    return {
        "id": str(order.get("_id")),
        "order_reference": order.get("order_reference"),
        "user_id": order.get("user_id"),
        "contract": order.get("contract"),
        "underlying": order.get("underlying"),
        "action": order.get("action"),
        "option_side": order.get("option_side"),
        "order_type": order.get("order_type"),
        "strike": order.get("strike", 0),
        "expiry_code": order.get("expiry_code"),
        "price": order.get("price", 0),
        "best_bid": order.get("best_bid", 0),
        "best_ask": order.get("best_ask", 0),
        "mark_price": order.get("mark_price", 0),
        "quantity": order.get("quantity", 0),
        "notional_value": order.get("notional_value", 0),
        "wallet_lock_amount": order.get("wallet_lock_amount", 0),
        "wallet_lock_status": order.get("wallet_lock_status"),
        "platform_fee": order.get("platform_fee", 0),
        "trading_fee": order.get("trading_fee", order.get("platform_fee", 0)),
        "platform_fee_status": order.get("platform_fee_status"),
        "trading_fee_status": order.get("trading_fee_status", order.get("platform_fee_status")),
        "platform_fee_charged": order.get("platform_fee_charged", False),
        "trading_fee_charged": order.get("trading_fee_charged", order.get("platform_fee_charged", False)),
        "platform_fee_config": order.get("platform_fee_config", {}),
        "trading_fee_config": order.get("trading_fee_config", order.get("platform_fee_config", {})),
        "status": order.get("status"),
        "stop_price": order.get("stop_price", 0),
        "take_profit": order.get("take_profit", 0),
        "stop_loss": order.get("stop_loss", 0),
        "filled_quantity": order.get("filled_quantity", 0),
        "average_fill_price": order.get("average_fill_price", 0),
        "created_at": _iso(order.get("created_at")),
        "updated_at": _iso(order.get("updated_at")),
        "cancelled_at": _iso(order.get("cancelled_at")),
        "closed_at": _iso(order.get("closed_at")),
        "source": order.get("source"),
        "client_source": order.get("client_source"),
        "risk_mode": order.get("risk_mode"),
        "remark": order.get("remark", "")
    }


def format_option_position(position):
    if not position:
        return None
    return {
        "id": str(position.get("_id")),
        "position_reference": position.get("position_reference"),
        "entry_order_id": position.get("entry_order_id"),
        "entry_order_reference": position.get("entry_order_reference"),
        "user_id": position.get("user_id"),
        "contract": position.get("contract"),
        "underlying": position.get("underlying"),
        "action": position.get("action"),
        "option_side": position.get("option_side"),
        "strike": position.get("strike", 0),
        "expiry_code": position.get("expiry_code"),
        "quantity": position.get("quantity", 0),
        "entry_price": position.get("entry_price", 0),
        "margin_amount": position.get("margin_amount", 0),
        "wallet_locked_amount": position.get("wallet_locked_amount", 0),
        "close_price": position.get("close_price", 0),
        "realized_pnl": position.get("realized_pnl", 0),
        "gross_realized_pnl": position.get("gross_realized_pnl", position.get("realized_pnl", 0)),
        "net_realized_pnl": position.get("net_realized_pnl", position.get("realized_pnl", 0)),
        "exit_trading_fee": position.get("exit_trading_fee", 0),
        "entry_notional_value": position.get("entry_notional_value", 0),
        "wallet_settlement_status": position.get("wallet_settlement_status"),
        "source": position.get("source"),
        "status": position.get("status", "open"),
        "opened_at": _iso(position.get("opened_at")),
        "created_at": _iso(position.get("created_at")),
        "updated_at": _iso(position.get("updated_at")),
        "closed_at": _iso(position.get("closed_at"))
    }


def format_option_fill(fill):
    if not fill:
        return None
    return {
        "id": str(fill.get("_id")),
        "fill_reference": fill.get("fill_reference"),
        "order_id": fill.get("order_id"),
        "position_id": fill.get("position_id"),
        "user_id": fill.get("user_id"),
        "contract": fill.get("contract"),
        "underlying": fill.get("underlying"),
        "action": fill.get("action"),
        "option_side": fill.get("option_side"),
        "price": fill.get("price", 0),
        "quantity": fill.get("quantity", 0),
        "fee": fill.get("fee", 0),
        "fee_type": fill.get("fee_type"),
        "gross_realized_pnl": fill.get("gross_realized_pnl", fill.get("realized_pnl", 0)),
        "realized_pnl": fill.get("realized_pnl", 0),
        "net_realized_pnl": fill.get("net_realized_pnl", fill.get("realized_pnl", 0)),
        "source": fill.get("source"),
        "client_source": fill.get("client_source"),
        "created_at": _iso(fill.get("created_at"))
    }


def format_option_orders(orders):
    return [format_option_order(order) for order in orders]


def format_option_positions(positions):
    return [format_option_position(position) for position in positions]


def format_option_fills(fills):
    return [format_option_fill(fill) for fill in fills]

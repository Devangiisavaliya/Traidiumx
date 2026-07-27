from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ReturnDocument

from config.database import get_database
from utils.date_helper import now_utc


def get_positions_collection():
    db = get_database()
    return db.positions


def create_position(position_data):
    position_data["created_at"] = now_utc()
    position_data["updated_at"] = now_utc()

    result = get_positions_collection().insert_one(position_data)

    return result.inserted_id


def find_position_by_id(position_id):
    try:
        return get_positions_collection().find_one({
            "_id": ObjectId(position_id)
        })
    except InvalidId:
        return None



def claim_open_position_for_close(position_id, user_id):
    """Atomically claim an open position so it can only be settled once."""
    try:
        return get_positions_collection().find_one_and_update(
            {
                "_id": ObjectId(position_id),
                "user_id": str(user_id),
                "status": "open",
            },
            {
                "$set": {
                    "status": "closing",
                    "updated_at": now_utc(),
                }
            },
            return_document=ReturnDocument.BEFORE,
        )
    except InvalidId:
        return None


def release_position_close_claim(position_id):
    """Return a failed close claim to open state without reopening closed positions."""
    try:
        get_positions_collection().update_one(
            {
                "_id": ObjectId(position_id),
                "status": "closing",
            },
            {
                "$set": {
                    "status": "open",
                    "updated_at": now_utc(),
                }
            },
        )
    except InvalidId:
        return None

    return find_position_by_id(position_id)


def find_open_position(user_id, symbol, position_side):
    return get_positions_collection().find_one({
        "user_id": str(user_id),
        "symbol": symbol.upper(),
        "position_side": position_side,
        "status": "open"
    })


def get_user_open_positions(user_id):
    positions = get_positions_collection().find({
        "user_id": str(user_id),
        "status": "open"
    }).sort("created_at", -1)

    return list(positions)


def get_user_positions(user_id, limit=100):
    positions = get_positions_collection().find({
        "user_id": str(user_id)
    }).sort("created_at", -1).limit(limit)

    return list(positions)


def update_position(position_id, update_data):
    update_data["updated_at"] = now_utc()

    get_positions_collection().update_one(
        {
            "_id": ObjectId(position_id)
        },
        {
            "$set": update_data
        }
    )

    return find_position_by_id(position_id)


def format_position(position):
    if not position:
        return None

    return {
        "id": str(position["_id"]),
        "user_id": position.get("user_id"),
        "symbol": position.get("symbol"),
        "position_side": position.get("position_side"),
        "quantity": position.get("quantity", 0.0),
        "entry_price": position.get("entry_price", 0.0),
        "base_entry_price": position.get("base_entry_price", position.get("entry_price", 0.0)),
        "base_exit_price": position.get("base_exit_price", position.get("exit_price", 0.0)),
        "platform": position.get("platform", "traidiumx"),
        "plan": position.get("plan", ""),
        "plan_name": position.get("plan_name", ""),
        "spread_pips": position.get("spread_pips", 0.0),
        "spread_type": position.get("spread_type", "fixed"),
        "spread_value": position.get("spread_value", 0.0),
        "pip_size": position.get("pip_size", 0.0),
        "spread_price": position.get("spread_price", 0.0),
        "exit_price": position.get("exit_price", 0.0),
        "leverage": position.get("leverage", 1),
        "notional_value": position.get("notional_value", 0.0),
        "margin_amount": position.get("margin_amount", 0.0),
        "realized_pnl": position.get("realized_pnl", 0.0),
        "gross_realized_pnl": position.get("gross_realized_pnl", position.get("realized_pnl", 0.0)),
        "net_realized_pnl": position.get("net_realized_pnl", position.get("realized_pnl", 0.0)),
        "exit_trading_fee": position.get("exit_trading_fee", 0.0),
        "unrealized_pnl": position.get("unrealized_pnl", 0.0),
        "status": position.get("status", "open"),
        "created_at": position.get("created_at").isoformat() if position.get("created_at") else None,
        "updated_at": position.get("updated_at").isoformat() if position.get("updated_at") else None,
        "closed_at": position.get("closed_at").isoformat() if position.get("closed_at") else None,
        "liquidation_price": position.get("liquidation_price", 0.0),
        "take_profit": position.get("take_profit"),
        "stop_loss": position.get("stop_loss"),
        "tp_enabled": bool(position.get("take_profit")),
        "sl_enabled": bool(position.get("stop_loss")),
        "trigger_price_type": position.get("trigger_price_type", "mark_price"),
        "mark_price": position.get("mark_price", 0.0),
        "index_price": position.get("index_price", 0.0),
        "close_reason": position.get("close_reason"),
    }


def format_positions(positions):
    return [format_position(position) for position in positions]
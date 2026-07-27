from bson import ObjectId
from bson.errors import InvalidId

from config.database import get_database
from utils.date_helper import now_utc


def get_trades_collection():
    db = get_database()
    return db.trades


def create_trade(trade_data):
    trade_data["created_at"] = now_utc()

    result = get_trades_collection().insert_one(trade_data)

    return result.inserted_id


def find_trade_by_id(trade_id):
    try:
        return get_trades_collection().find_one({
            "_id": ObjectId(trade_id)
        })
    except InvalidId:
        return None


def get_user_trades(user_id, limit=100):
    trades = get_trades_collection().find({
        "user_id": str(user_id)
    }).sort("created_at", -1).limit(limit)

    return list(trades)


def format_trade(trade):
    if not trade:
        return None

    return {
        "id": str(trade["_id"]),
        "trade_reference": trade.get("trade_reference"),
        "user_id": trade.get("user_id"),
        "order_id": trade.get("order_id"),
        "position_id": trade.get("position_id"),
        "symbol": trade.get("symbol"),
        "side": trade.get("side"),
        "position_side": trade.get("position_side"),
        "trade_type": trade.get("trade_type"),
        "quantity": trade.get("quantity", 0.0),
        "price": trade.get("price", 0.0),
        "notional_value": trade.get("notional_value", 0.0),
        "fee_amount": trade.get("fee_amount", 0.0),
        "fee_type": trade.get("fee_type"),
        "gross_realized_pnl": trade.get("gross_realized_pnl", trade.get("realized_pnl", 0.0)),
        "realized_pnl": trade.get("realized_pnl", 0.0),
        "net_realized_pnl": trade.get("net_realized_pnl", trade.get("realized_pnl", 0.0)),
        "close_reason": trade.get("close_reason"),
        "created_at": trade.get("created_at").isoformat() if trade.get("created_at") else None
    }


def format_trades(trades):
    return [format_trade(trade) for trade in trades]
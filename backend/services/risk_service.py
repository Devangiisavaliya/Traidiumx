from config.settings import settings
from models.position_model import get_user_open_positions
from services.market_service import get_symbol_ticker
from services.pnl_service import calculate_position_pnl
from services.wallet_service import ensure_user_wallet


def calculate_liquidation_price(position_side, entry_price, leverage):
    entry_price = float(entry_price)
    leverage = int(leverage)

    if entry_price <= 0 or leverage <= 0:
        return 0.0

    maintenance_margin_rate = float(settings.MAINTENANCE_MARGIN_RATE)

    if position_side == "long":
        liquidation_price = entry_price * (1 - (1 / leverage) + maintenance_margin_rate)
    elif position_side == "short":
        liquidation_price = entry_price * (1 + (1 / leverage) - maintenance_margin_rate)
    else:
        liquidation_price = 0.0

    if liquidation_price < 0:
        liquidation_price = 0.0

    return round(liquidation_price, 8)


def get_risk_level(margin_usage_percent):
    margin_usage_percent = float(margin_usage_percent)

    if margin_usage_percent < 40:
        return "low"

    if margin_usage_percent < 70:
        return "medium"

    return "high"


def validate_order_risk(user_id, clean_data, estimated_price, margin_data):
    errors = {}

    wallet = ensure_user_wallet(user_id)

    trading_wallet = wallet.get("trading_wallet") if isinstance(wallet.get("trading_wallet"), dict) else {}
    available_balance = float(trading_wallet.get("available_balance", wallet.get("available_balance", 0.0)) or 0.0)
    locked_balance = float(trading_wallet.get("locked_balance", wallet.get("locked_balance", 0.0)) or 0.0)
    total_balance = float(trading_wallet.get("total_balance", available_balance + locked_balance) or 0.0)
    if total_balance <= 0 and (available_balance > 0 or locked_balance > 0):
        total_balance = available_balance + locked_balance

    margin_amount = float(margin_data.get("margin_amount", 0.0))
    notional_value = float(margin_data.get("notional_value", 0.0))

    symbol = clean_data["symbol"]
    side = clean_data["side"]
    leverage = int(clean_data["leverage"])

    position_side = "long" if side == "buy" else "short"

    open_positions = get_user_open_positions(user_id)
    # TraidiumX futures now uses separate position lots and does not enforce a
    # fixed count limit for open positions/open orders. Risk is controlled by
    # wallet margin, max order notional and total margin usage instead.

    if notional_value > settings.MAX_ORDER_NOTIONAL:
        errors["notional_value"] = f"Maximum order notional is {settings.MAX_ORDER_NOTIONAL}."

    if total_balance <= 0 or available_balance <= 0:
        errors["wallet"] = "Trading Wallet balance is required before placing order. Transfer funds from Main Wallet to Trading Wallet first."

    if total_balance > 0:
        max_margin_per_order = total_balance * (settings.MAX_MARGIN_PER_ORDER_PERCENT / 100)

        if margin_amount > max_margin_per_order:
            errors["margin_amount"] = (
                f"Order margin cannot exceed {settings.MAX_MARGIN_PER_ORDER_PERCENT}% "
                f"of wallet balance. Max allowed margin is {round(max_margin_per_order, 8)}."
            )

        max_total_margin_usage = total_balance * (settings.MAX_TOTAL_MARGIN_USAGE_PERCENT / 100)
        total_margin_after_order = locked_balance + margin_amount

        if total_margin_after_order > max_total_margin_usage:
            errors["margin_usage"] = (
                f"Total locked margin cannot exceed {settings.MAX_TOTAL_MARGIN_USAGE_PERCENT}% "
                f"of wallet balance. Max allowed locked margin is {round(max_total_margin_usage, 8)}."
            )

        if available_balance - margin_amount < settings.WALLET_SAFETY_BUFFER:
            errors["wallet_safety_buffer"] = (
                f"After order, wallet must keep at least {settings.WALLET_SAFETY_BUFFER} USDT available balance."
            )

    liquidation_price = calculate_liquidation_price(
        position_side=position_side,
        entry_price=estimated_price,
        leverage=leverage
    )

    margin_usage_after_order = 0.0

    if total_balance > 0:
        margin_usage_after_order = ((locked_balance + margin_amount) / total_balance) * 100

    risk_data = {
        "position_side": position_side,
        "estimated_entry_price": float(estimated_price),
        "liquidation_price": liquidation_price,
        "notional_value": round(notional_value, 8),
        "margin_amount": round(margin_amount, 8),
        "current_locked_margin": round(locked_balance, 8),
        "total_margin_after_order": round(locked_balance + margin_amount, 8),
        "total_wallet_balance": round(total_balance, 8),
        "margin_usage_percent_after_order": round(margin_usage_after_order, 4),
        "risk_level": get_risk_level(margin_usage_after_order)
    }

    if errors:
        return {
            "success": False,
            "message": "Risk validation failed.",
            "errors": errors,
            "data": {
                "risk": risk_data
            },
            "status_code": 422
        }

    return {
        "success": True,
        "message": "Risk validation passed.",
        "data": {
            "risk": risk_data,
            "liquidation_price": liquidation_price
        },
        "status_code": 200
    }


def calculate_liquidation_distance(position, current_price):
    current_price = float(current_price)

    liquidation_price = position.get("liquidation_price")

    if not liquidation_price:
        liquidation_price = calculate_liquidation_price(
            position_side=position.get("position_side"),
            entry_price=position.get("entry_price", 0.0),
            leverage=position.get("leverage", 1)
        )

    liquidation_price = float(liquidation_price)
    position_side = position.get("position_side")

    if liquidation_price <= 0 or current_price <= 0:
        return {
            "liquidation_price": liquidation_price,
            "liquidation_distance": 0.0,
            "liquidation_distance_percent": 0.0,
            "liquidation_risk": "unknown"
        }

    if position_side == "long":
        liquidation_distance = current_price - liquidation_price
    elif position_side == "short":
        liquidation_distance = liquidation_price - current_price
    else:
        liquidation_distance = 0.0

    liquidation_distance_percent = (liquidation_distance / current_price) * 100

    if liquidation_distance <= 0:
        liquidation_risk = "liquidated_zone"
    elif liquidation_distance_percent < 5:
        liquidation_risk = "high"
    elif liquidation_distance_percent < 15:
        liquidation_risk = "medium"
    else:
        liquidation_risk = "low"

    return {
        "liquidation_price": round(liquidation_price, 8),
        "liquidation_distance": round(liquidation_distance, 8),
        "liquidation_distance_percent": round(liquidation_distance_percent, 4),
        "liquidation_risk": liquidation_risk
    }


def get_user_risk_summary(user_id):
    wallet = ensure_user_wallet(user_id)
    
    try:
        from flask import request
        active_currency = request.headers.get("X-Navbar-Currency")
        if not active_currency:
            from config.database import get_database
            from bson import ObjectId
            db = get_database()
            user = db.users.find_one({"_id": ObjectId(user_id)})
            active_currency = user.get("last_navbar_currency") if user else "USDT"
    except Exception:
        active_currency = "USDT"

    active_currency = str(active_currency or "USDT").strip().upper()
    if active_currency not in ("INR", "USDT"):
        active_currency = "USDT"

    positions = get_user_open_positions(user_id)
    if active_currency == "INR":
        positions = [p for p in positions if p.get("currency") == "INR"]
    else:
        positions = [p for p in positions if p.get("currency") in ("USDT", None, "")]

    trading_wallet = wallet.get("trading_wallet") if isinstance(wallet.get("trading_wallet"), dict) else {}
    available_balance = float(trading_wallet.get("available_balance", wallet.get("available_balance", 0.0)) or 0.0)
    locked_balance = float(trading_wallet.get("locked_balance", wallet.get("locked_balance", 0.0)) or 0.0)
    total_balance = float(trading_wallet.get("total_balance", available_balance + locked_balance) or 0.0)
    if total_balance <= 0 and (available_balance > 0 or locked_balance > 0):
        total_balance = available_balance + locked_balance

    margin_usage_percent = 0.0

    if total_balance > 0:
        margin_usage_percent = (locked_balance / total_balance) * 100

    total_unrealized_pnl = 0.0
    position_risks = []

    for position in positions:
        ticker_result = get_symbol_ticker(position.get("symbol"))

        if ticker_result["success"]:
            current_price = float(ticker_result["data"]["last_price"])
        else:
            current_price = float(position.get("entry_price", 0.0))

        pnl_data = calculate_position_pnl(position, current_price)
        liquidation_data = calculate_liquidation_distance(position, current_price)

        total_unrealized_pnl += float(pnl_data.get("unrealized_pnl", 0.0))

        position_risks.append({
            "position_id": str(position["_id"]),
            "symbol": position.get("symbol"),
            "position_side": position.get("position_side"),
            "quantity": position.get("quantity", 0.0),
            "entry_price": position.get("entry_price", 0.0),
            "current_price": current_price,
            "margin_amount": position.get("margin_amount", 0.0),
            "unrealized_pnl": pnl_data.get("unrealized_pnl", 0.0),
            "roe_percent": pnl_data.get("roe_percent", 0.0),
            "liquidation_price": liquidation_data.get("liquidation_price", 0.0),
            "liquidation_distance_percent": liquidation_data.get("liquidation_distance_percent", 0.0),
            "liquidation_risk": liquidation_data.get("liquidation_risk", "unknown")
        })

    return {
        "success": True,
        "message": "Risk summary fetched successfully.",
        "data": {
            "wallet": {
                "available_balance": round(available_balance, 8),
                "locked_balance": round(locked_balance, 8),
                "total_balance": round(total_balance, 8),
                "margin_usage_percent": round(margin_usage_percent, 4),
                "wallet_risk_level": get_risk_level(margin_usage_percent)
            },
            "limits": {
                "max_open_positions": None,
                "max_open_positions_label": "unlimited",
                "max_order_notional": settings.MAX_ORDER_NOTIONAL,
                "max_margin_per_order_percent": settings.MAX_MARGIN_PER_ORDER_PERCENT,
                "max_total_margin_usage_percent": settings.MAX_TOTAL_MARGIN_USAGE_PERCENT,
                "wallet_safety_buffer": settings.WALLET_SAFETY_BUFFER,
                "maintenance_margin_rate": settings.MAINTENANCE_MARGIN_RATE
            },
            "positions": {
                "open_positions_count": len(positions),
                "total_unrealized_pnl": round(total_unrealized_pnl, 8),
                "items": position_risks
            }
        },
        "status_code": 200
    }
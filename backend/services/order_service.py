import uuid

from models.order_model import (
    claim_order_for_action,
    create_order,
    find_order_by_id,
    format_order,
    format_orders,
    get_user_open_orders,
    get_user_orders,
    release_order_action_claim,
    update_order
)
from services.fee_service import calculate_platform_charge
from services.market_service import ensure_supported_symbol, get_symbol_ticker
from services.trading_plan_service import apply_plan_spread_to_price, reconcile_user_plan
from services.risk_service import validate_order_risk
from services.wallet_service import (
    ensure_user_wallet,
    lock_wallet_amount,
    release_locked_amount
)
from utils.date_helper import now_utc
from utils.validators import clean_string, validate_market_symbol, validate_positive_number


ALLOWED_ORDER_SIDES = ["buy", "sell"]
ALLOWED_ORDER_TYPES = ["market", "limit", "stop_market", "stop_limit"]


def validate_order_payload(data):
    symbol = clean_string(data.get("symbol")).upper()
    side = clean_string(data.get("side")).lower()
    order_type = clean_string(data.get("order_type")).lower()

    quantity = data.get("quantity")
    leverage = data.get("leverage", 1)
    limit_price = data.get("limit_price")
    stop_price = data.get("stop_price")
    take_profit = data.get("take_profit")
    stop_loss = data.get("stop_loss")
    reduce_only = data.get("reduce_only", False)

    errors = {}
    stored_symbol = None

    is_supported, symbol_error, stored_symbol = ensure_supported_symbol(symbol)

    if not is_supported:
        errors["symbol"] = symbol_error

    if side not in ALLOWED_ORDER_SIDES:
        errors["side"] = "Side must be buy or sell."

    if order_type not in ALLOWED_ORDER_TYPES:
        errors["order_type"] = "Order type must be one of: market, limit, stop_market, stop_limit."

    is_valid_quantity, quantity_error = validate_positive_number(quantity, "Quantity")
    if not is_valid_quantity:
        errors["quantity"] = quantity_error
    else:
        quantity = float(quantity)

        if stored_symbol:
            min_qty = float(stored_symbol.get("min_qty", 0.001))

            if quantity < min_qty:
                errors["quantity"] = f"Minimum quantity for {symbol} is {min_qty}."

    try:
        leverage = int(leverage)
    except Exception:
        errors["leverage"] = "Leverage must be a valid integer."

    if "leverage" not in errors:
        if leverage < 1:
            errors["leverage"] = "Leverage must be at least 1."

        if stored_symbol:
            max_leverage = int(stored_symbol.get("max_leverage", 20))

            if leverage > max_leverage:
                errors["leverage"] = f"Maximum leverage for {symbol} is {max_leverage}x."

    if order_type in ["limit", "stop_limit"]:
        is_valid_limit_price, limit_price_error = validate_positive_number(limit_price, "Limit price")
        if not is_valid_limit_price:
            errors["limit_price"] = limit_price_error
        else:
            limit_price = float(limit_price)

    if order_type in ["stop_market", "stop_limit"]:
        is_valid_stop_price, stop_price_error = validate_positive_number(stop_price, "Stop price")
        if not is_valid_stop_price:
            errors["stop_price"] = stop_price_error
        else:
            stop_price = float(stop_price)

    if take_profit not in [None, "", 0, "0"]:
        is_valid_take_profit, take_profit_error = validate_positive_number(take_profit, "Take profit")
        if not is_valid_take_profit:
            errors["take_profit"] = take_profit_error
        else:
            take_profit = float(take_profit)
    else:
        take_profit = None

    if stop_loss not in [None, "", 0, "0"]:
        is_valid_stop_loss, stop_loss_error = validate_positive_number(stop_loss, "Stop loss")
        if not is_valid_stop_loss:
            errors["stop_loss"] = stop_loss_error
        else:
            stop_loss = float(stop_loss)
    else:
        stop_loss = None

    if not isinstance(reduce_only, bool):
        errors["reduce_only"] = "Reduce only must be true or false."

    if errors:
        return {
            "valid": False,
            "errors": errors,
            "clean_data": None
        }

    return {
        "valid": True,
        "errors": {},
        "clean_data": {
            "symbol": symbol,
            "side": side,
            "order_type": order_type,
            "quantity": float(quantity),
            "leverage": int(leverage),
            "limit_price": float(limit_price) if limit_price else None,
            "stop_price": float(stop_price) if stop_price else None,
            "take_profit": float(take_profit) if take_profit else None,
            "stop_loss": float(stop_loss) if stop_loss else None,
            "reduce_only": reduce_only,
            "symbol_meta": {
                "market_type": stored_symbol.get("market_type", "futures") if stored_symbol else "futures",
                "quote_asset": stored_symbol.get("quote_asset", "USDT") if stored_symbol else "USDT",
                "price_precision": stored_symbol.get("price_precision", 2) if stored_symbol else 2,
                "quantity_precision": stored_symbol.get("quantity_precision", 3) if stored_symbol else 3
            }
        }
    }


def get_price_for_margin(symbol, order_type, limit_price=None):
    if order_type in ["limit", "stop_limit"] and limit_price:
        return {
            "success": True,
            "price": float(limit_price)
        }

    ticker_result = get_symbol_ticker(symbol)

    if not ticker_result["success"]:
        return {
            "success": False,
            "message": "Unable to fetch live market price.",
            "errors": ticker_result.get("errors", {})
        }

    return {
        "success": True,
        "price": float(ticker_result["data"]["last_price"])
    }


def calculate_margin(quantity, price, leverage):
    notional_value = float(quantity) * float(price)
    margin_amount = notional_value / int(leverage)

    return {
        "notional_value": round(notional_value, 8),
        "margin_amount": round(margin_amount, 8)
    }


def validate_stop_order_against_current_market(clean_data):
    order_type = clean_data["order_type"]

    if order_type not in ["stop_market", "stop_limit"]:
        return {
            "success": True
        }

    ticker_result = get_symbol_ticker(clean_data["symbol"])

    if not ticker_result["success"]:
        return {
            "success": False,
            "message": "Unable to validate stop price with live market price.",
            "errors": ticker_result.get("errors", {}),
            "status_code": 502
        }

    current_price = float(ticker_result["data"]["last_price"])
    stop_price = float(clean_data["stop_price"])
    side = clean_data["side"]

    if side == "buy" and stop_price <= current_price:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": {
                "stop_price": f"For buy stop order, stop price must be above current market price. Current price is {current_price}."
            },
            "status_code": 422
        }

    if side == "sell" and stop_price >= current_price:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": {
                "stop_price": f"For sell stop order, stop price must be below current market price. Current price is {current_price}."
            },
            "status_code": 422
        }

    return {
        "success": True
    }


def validate_tp_sl_against_price(clean_data, reference_price):
    errors = {}
    reference_price = float(reference_price or 0)
    side = clean_data.get("side")
    take_profit = clean_data.get("take_profit")
    stop_loss = clean_data.get("stop_loss")

    if reference_price <= 0:
        return errors

    if side == "buy":
        if take_profit and float(take_profit) <= reference_price:
            errors["take_profit"] = "For Buy/Long order, take profit must be above entry/reference price."
        if stop_loss and float(stop_loss) >= reference_price:
            errors["stop_loss"] = "For Buy/Long order, stop loss must be below entry/reference price."
    elif side == "sell":
        if take_profit and float(take_profit) >= reference_price:
            errors["take_profit"] = "For Sell/Short order, take profit must be below entry/reference price."
        if stop_loss and float(stop_loss) <= reference_price:
            errors["stop_loss"] = "For Sell/Short order, stop loss must be above entry/reference price."

    return errors


def place_order(user_id, data):
    validation = validate_order_payload(data)

    if not validation["valid"]:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": validation["errors"],
            "status_code": 422
        }

    clean_data = validation["clean_data"]

    stop_validation = validate_stop_order_against_current_market(clean_data)

    if not stop_validation["success"]:
        return {
            "success": False,
            "message": stop_validation["message"],
            "errors": stop_validation["errors"],
            "status_code": stop_validation["status_code"]
        }

    price_result = get_price_for_margin(
        symbol=clean_data["symbol"],
        order_type=clean_data["order_type"],
        limit_price=clean_data["limit_price"]
    )

    if not price_result["success"]:
        return {
            "success": False,
            "message": price_result["message"],
            "errors": price_result["errors"],
            "status_code": 502
        }

    base_estimated_price = price_result["price"]
    plan_result = reconcile_user_plan(user_id, send_notice=True)
    plan_profile = plan_result.get("data", {}) if plan_result.get("success") else {}
    spread_result = apply_plan_spread_to_price(
        user_id=user_id,
        symbol=clean_data["symbol"],
        side=clean_data["side"],
        base_price=base_estimated_price,
        price_precision=(clean_data.get("symbol_meta") or {}).get("price_precision"),
        locked_plan=plan_profile.get("active_plan"),
        locked_spread_pips=plan_profile.get("active_spread_pips"),
        locked_spread_type=plan_profile.get("active_spread_type"),
    )
    estimated_price = spread_result["price"]

    protection_errors = validate_tp_sl_against_price(clean_data, estimated_price)
    if protection_errors:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": protection_errors,
            "status_code": 422
        }

    margin_data = calculate_margin(
        quantity=clean_data["quantity"],
        price=estimated_price,
        leverage=clean_data["leverage"]
    )

    risk_result = validate_order_risk(
        user_id=user_id,
        clean_data=clean_data,
        estimated_price=estimated_price,
        margin_data=margin_data
    )

    if not risk_result["success"]:
        return {
            "success": False,
            "message": risk_result["message"],
            "errors": risk_result["errors"],
            "status_code": risk_result["status_code"]
        }

    risk_data = risk_result["data"]

    wallet = ensure_user_wallet(user_id)
    trading_wallet = wallet.get("trading_wallet") if isinstance(wallet.get("trading_wallet"), dict) else {}
    available_balance = float(trading_wallet.get("available_balance", wallet.get("available_balance", 0.0)) or 0.0)
    platform_charge = calculate_platform_charge(margin_data["notional_value"], "futures")
    platform_fee = float(platform_charge.get("platform_fee_usdt", 0.0) or 0.0)
    required_available = round(float(margin_data["margin_amount"]) + platform_fee, 8)

    if available_balance < required_available:
        return {
            "success": False,
            "message": "Insufficient Trading Wallet balance.",
            "errors": {
                "wallet": f"Required margin plus trading fee is {required_available}, Trading Wallet available balance is {available_balance}. Transfer Main Wallet to Trading Wallet first."
            },
            "status_code": 422
        }

    order_reference = f"TXO-{uuid.uuid4().hex[:12].upper()}"

    if clean_data["order_type"] in ["stop_market", "stop_limit"]:
        status = "pending_trigger"
    else:
        status = "open"

    order_id = create_order({
        "user_id": str(user_id),
        "order_reference": order_reference,
        "symbol": clean_data["symbol"],
        "side": clean_data["side"],
        "order_type": clean_data["order_type"],
        "quantity": clean_data["quantity"],
        "leverage": clean_data["leverage"],
        "limit_price": clean_data["limit_price"],
        "stop_price": clean_data["stop_price"],
        "take_profit": clean_data.get("take_profit"),
        "stop_loss": clean_data.get("stop_loss"),
        "estimated_price": estimated_price,
        "base_estimated_price": base_estimated_price,
        "platform": "traidiumx",
        "plan": spread_result.get("plan"),
        "plan_name": spread_result.get("plan_name"),
        "spread_type": spread_result.get("spread_type"),
        "spread_pips": spread_result.get("spread_pips", 0.0),
        "pip_size": spread_result.get("pip_size", 0.0),
        "spread_price": spread_result.get("spread_price", 0.0),
        "notional_value": margin_data["notional_value"],
        "margin_amount": margin_data["margin_amount"],
        "platform_fee": platform_fee,
        "trading_fee": platform_fee,
        "platform_fee_status": "pending_execution" if platform_fee > 0 else "not_applicable",
        "trading_fee_status": "pending_execution" if platform_fee > 0 else "not_applicable",
        "platform_fee_config": platform_charge,
        "trading_fee_config": platform_charge,
        "liquidation_price": risk_data["liquidation_price"],
        "risk": risk_data["risk"],
        "status": status,
        "filled_quantity": 0.0,
        "average_fill_price": 0.0,
        "reduce_only": clean_data["reduce_only"],
        "remark": "Order placed. Margin locked from available balance."
    })

    lock_result = lock_wallet_amount(
        user_id=user_id,
        amount=margin_data["margin_amount"],
        transaction_type="order_margin_lock",
        reference_id=str(order_id),
        description=f"Margin locked for order {order_reference}"
    )

    if not lock_result["success"]:
        update_order(
            order_id=str(order_id),
            update_data={
                "status": "failed",
                "remark": lock_result["message"]
            }
        )

        return {
            "success": False,
            "message": lock_result["message"],
            "errors": {
                "wallet": lock_result["message"]
            },
            "status_code": 422
        }

    order = find_order_by_id(str(order_id))

    return {
        "success": True,
        "message": "Order placed successfully.",
        "data": {
            "order": format_order(order),
            "wallet": {
                "available_balance": lock_result["wallet"].get("available_balance", 0.0),
                "locked_balance": lock_result["wallet"].get("locked_balance", 0.0),
                "total_balance": lock_result["wallet"].get("total_balance", 0.0)
            },
            "risk": risk_data["risk"],
            "platform_fee": platform_fee,
            "trading_fee": platform_fee,
            "platform_charge": platform_charge,
            "trading_fee_config": platform_charge,
            "note": "Order accepted by backend trading risk engine."
        },
        "status_code": 201
    }


def get_order_history(user_id):
    orders = get_user_orders(user_id)

    return {
        "success": True,
        "message": "Order history fetched successfully.",
        "data": {
            "orders": format_orders(orders)
        },
        "status_code": 200
    }


def get_open_orders(user_id):
    orders = get_user_open_orders(user_id)

    return {
        "success": True,
        "message": "Open orders fetched successfully.",
        "data": {
            "orders": format_orders(orders)
        },
        "status_code": 200
    }


def cancel_order(user_id, order_id):
    order = find_order_by_id(order_id)

    if not order:
        return {
            "success": False,
            "message": "Order not found.",
            "errors": {
                "order": "Invalid order ID."
            },
            "status_code": 404
        }

    if order.get("user_id") != str(user_id):
        return {
            "success": False,
            "message": "Unauthorized order access.",
            "errors": {
                "order": "This order does not belong to current user."
            },
            "status_code": 403
        }

    if order.get("status") not in ["open", "pending_trigger"]:
        return {
            "success": False,
            "message": "Order cannot be cancelled.",
            "errors": {
                "status": f"Current order status is {order.get('status')}."
            },
            "status_code": 400
        }

    original_status = str(order.get("status") or "open")
    claimed_order = claim_order_for_action(
        order_id=order_id,
        user_id=user_id,
        action_status="cancelling",
        allowed_statuses=[original_status],
    )
    if not claimed_order:
        return {
            "success": False,
            "message": "Order is already being processed.",
            "errors": {"status": "The order was claimed by another request or worker."},
            "status_code": 409,
        }
    order = claimed_order
    margin_amount = float(order.get("margin_amount", 0.0))

    release_result = release_locked_amount(
        user_id=user_id,
        amount=margin_amount,
        transaction_type="order_margin_release",
        reference_id=order_id,
        description=f"Margin released after cancelling order {order.get('order_reference')}"
    )

    if not release_result["success"]:
        release_order_action_claim(order_id, "cancelling", original_status)
        return {
            "success": False,
            "message": release_result["message"],
            "errors": {
                "wallet": release_result["message"]
            },
            "status_code": 422
        }

    updated_order = update_order(
        order_id=order_id,
        update_data={
            "status": "cancelled",
            "remark": "Order cancelled by user. Margin released.",
            "cancelled_at": now_utc()
        }
    )

    return {
        "success": True,
        "message": "Order cancelled successfully.",
        "data": {
            "order": format_order(updated_order),
            "wallet": {
                "available_balance": release_result["wallet"].get("available_balance", 0.0),
                "locked_balance": release_result["wallet"].get("locked_balance", 0.0),
                "total_balance": release_result["wallet"].get("total_balance", 0.0)
            }
        },
        "status_code": 200
    }
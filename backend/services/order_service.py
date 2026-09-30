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
            max_leverage = int(stored_symbol.get("max_leverage", 1000))

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

    margin_mode = clean_string(data.get("margin_mode", "isolated")).lower()
    if margin_mode not in ["isolated", "cross"]:
        errors["margin_mode"] = "Margin mode must be isolated or cross."

    current_price = data.get("current_price") or data.get("price")
    try:
        current_price = float(current_price) if current_price else None
    except Exception:
        current_price = None

    currency = clean_string(data.get("currency", "")).upper()
    if currency not in ("INR", "USDT"):
        currency = None

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
            "current_price": current_price,
            "reduce_only": reduce_only,
            "margin_mode": margin_mode,
            "currency": currency,
            "symbol_meta": {
                "market_type": stored_symbol.get("market_type", "futures") if stored_symbol else "futures",
                "quote_asset": stored_symbol.get("quote_asset", "USDT") if stored_symbol else "USDT",
                "price_precision": stored_symbol.get("price_precision", 2) if stored_symbol else 2,
                "quantity_precision": stored_symbol.get("quantity_precision", 3) if stored_symbol else 3
            }
        }
    }


FALLBACK_ORDER_PRICES = {
    "BTCUSDT": 64200.0,
    "ETHUSDT": 3550.0,
    "BNBUSDT": 590.0,
    "SOLUSDT": 145.0,
    "XRPUSDT": 0.62,
    "DOGEUSDT": 0.125,
    "ADAUSDT": 0.45,
    "AVAXUSDT": 34.0,
    "LINKUSDT": 14.0,
    "LTCUSDT": 82.0,
    "TRXUSDT": 0.12,
    "DOTUSDT": 6.8,
    "BCHUSDT": 410.0,
    "ATOMUSDT": 7.2,
    "UNIUSDT": 9.5,
    "APTUSDT": 8.7,
    "NEARUSDT": 4.85,
    "SUIUSDT": 1.65,
    "1000PEPEUSDT": 0.0092,
    "PEPEUSDT": 0.0092,
    "1000SHIBUSDT": 0.0185,
    "SHIBUSDT": 0.0185,
    "MATICUSDT": 0.42,
    "ARBUSDT": 0.55,
    "OPUSDT": 1.42,
    "INJUSDT": 18.5,
    "WIFUSDT": 1.75,
    "FETUSDT": 1.25,
    "TIAUSDT": 5.20,
    "FILUSDT": 3.80,
    "ETCUSDT": 19.5,
    "XLMUSDT": 0.095,
    "RENDERUSDT": 5.40,
    "SEIUSDT": 0.32,
    "ICPUSDT": 7.80,
    "FTMUSDT": 0.65,
    "XAUUSD": 2350.0,
    "XAUUSDT": 2350.0,
}


def get_price_for_margin(symbol, order_type, limit_price=None, client_price=None):
    if order_type in ["limit", "stop_limit"] and limit_price:
        return {
            "success": True,
            "price": float(limit_price)
        }

    # 1. First priority: live client WebSocket price passed directly from frontend (0ms)
    if client_price and float(client_price) > 0:
        return {
            "success": True,
            "price": float(client_price)
        }

    # 2. Second priority: Local database market_symbol / memory cache (0ms)
    try:
        from database.database import find_market_symbol
        stored_sym = find_market_symbol(symbol)
        if stored_sym and stored_sym.get("last_price") and float(stored_sym["last_price"]) > 0:
            return {
                "success": True,
                "price": float(stored_sym["last_price"])
            }
    except Exception:
        pass

    # 3. Third priority: Static fallback dictionary (0ms)
    clean_key = clean_string(symbol).upper().replace("-", "").replace("/", "")
    if clean_key in FALLBACK_ORDER_PRICES:
        return {
            "success": True,
            "price": FALLBACK_ORDER_PRICES[clean_key]
        }

    # 4. Last resort: external network ticker
    try:
        ticker_result = get_symbol_ticker(symbol)
        if ticker_result.get("success") and ticker_result.get("data", {}).get("last_price"):
            price_val = float(ticker_result["data"]["last_price"])
            if price_val > 0:
                return {
                    "success": True,
                    "price": price_val
                }
    except Exception:
        pass

    return {
        "success": False,
        "message": "Unable to fetch live market price.",
        "errors": {"price": "Market price unavailable"}
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

    price_result = get_price_for_margin(
        symbol=clean_data["symbol"],
        order_type="market",
        client_price=clean_data.get("current_price")
    )

    if not price_result.get("success"):
        return {
            "success": False,
            "message": "Unable to validate stop price with live market price.",
            "errors": price_result.get("errors", {}),
            "status_code": 502
        }

    current_price = float(price_result["price"])
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
        limit_price=clean_data["limit_price"],
        client_price=clean_data.get("current_price")
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

    try:
        from flask import request
        header_curr = str(request.headers.get("X-Navbar-Currency") or "").strip().upper()
    except Exception:
        header_curr = ""

    active_currency = clean_data.get("currency") or header_curr or "USDT"
    if active_currency not in ("INR", "USDT"):
        active_currency = "USDT"

    wallet = ensure_user_wallet(user_id)
    bucket_suffix = "inr" if active_currency == "INR" else "usdt"
    trading_wallet = wallet.get(f"trading_wallet_{bucket_suffix}") or wallet.get("trading_wallet") or {}
    available_balance = float(trading_wallet.get("available_balance", wallet.get("available_balance", 0.0)) or 0.0)
    platform_charge = calculate_platform_charge(margin_data["notional_value"], "futures")
    platform_fee = float(platform_charge.get("platform_fee_usdt", 0.0) or 0.0)
    
    usdt_inr_rate = float(wallet.get("usdt_inr_rate", 88.50) or 88.50)
    if active_currency == "INR":
        margin_amount_to_lock = round(float(margin_data["margin_amount"]) * usdt_inr_rate, 2)
        platform_fee_to_charge = round(platform_fee * usdt_inr_rate, 2)
        required_available = round(margin_amount_to_lock + platform_fee_to_charge, 2)
    else:
        margin_amount_to_lock = round(float(margin_data["margin_amount"]), 8)
        platform_fee_to_charge = platform_fee
        required_available = round(margin_amount_to_lock + platform_fee, 8)

    if available_balance < required_available:
        curr_symbol = "₹" if active_currency == "INR" else "$"
        return {
            "success": False,
            "message": f"Insufficient {active_currency} Trading Wallet balance.",
            "errors": {
                "wallet": f"Required margin plus trading fee is {curr_symbol}{required_available}, Trading Wallet ({active_currency}) available balance is {curr_symbol}{available_balance}. Transfer Main Wallet to Trading Wallet first."
            },
            "status_code": 422
        }

    # Ensure margin mode consistency: cannot place an order with different margin mode if an open position exists for this symbol
    from models.position_model import get_positions_collection
    existing_position = get_positions_collection().find_one({
        "user_id": str(user_id),
        "symbol": clean_data["symbol"],
        "status": "open"
    })
    if existing_position:
        existing_margin_mode = str(existing_position.get("margin_mode", "isolated")).lower()
        if clean_data["margin_mode"].lower() != existing_margin_mode:
            return {
                "success": False,
                "message": f"You already have an open position in {clean_data['symbol']} using {existing_margin_mode.upper()} margin. Please close the existing position before opening trades with {clean_data['margin_mode'].upper()} margin.",
                "errors": {
                    "margin_mode": f"Symbol {clean_data['symbol']} currently has an active {existing_margin_mode} position."
                },
                "status_code": 400
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
        "currency": active_currency,
        "margin_mode": clean_data["margin_mode"],
        "remark": "Order placed. Margin locked from available balance."
    })

    lock_result = lock_wallet_amount(
        user_id=user_id,
        amount=margin_amount_to_lock,
        transaction_type="order_margin_lock",
        reference_id=str(order_id),
        description=f"Margin locked for order {order_reference}",
        currency=active_currency
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

    # Mirror LIMIT order to Binance asynchronously (non-blocking)
    from config.settings import settings
    if status == "open" and clean_data["order_type"] == "limit" and settings.BINANCE_API_KEY:
        import threading
        def _async_mirror_limit(oid, cdata):
            try:
                from services.binance_service import place_binance_futures_order
                binance_res = place_binance_futures_order(
                    symbol=cdata["symbol"],
                    side=cdata["side"],
                    quantity=cdata["quantity"],
                    leverage=cdata["leverage"],
                    margin_mode=cdata["margin_mode"],
                    price=cdata["limit_price"],
                    order_type="LIMIT"
                )
                if binance_res.get("success"):
                    binance_order_id = binance_res.get("binance_order_id")
                    binance_status = binance_res.get("status")
                    update_order(str(oid), {
                        "binance_order_id": binance_order_id,
                        "binance_status": binance_status,
                        "remark": f"Order placed. Mirrored to Binance as LIMIT. ID: {binance_order_id}"
                    })
                else:
                    update_order(str(oid), {
                        "remark": f"Order placed locally. Binance Limit Mirror Failed: {binance_res.get('message')}"
                    })
            except Exception as e:
                print(f"Exception mirroring LIMIT order to Binance in background: {e}")

        threading.Thread(target=_async_mirror_limit, args=(str(order_id), clean_data.copy()), daemon=True).start()

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

    # Cancel the mirrored LIMIT order on Binance if it exists
    binance_order_id = order.get("binance_order_id")
    from config.settings import settings
    if binance_order_id and settings.BINANCE_API_KEY:
        try:
            from services.binance_service import _send_signed_request, _map_symbol
            symbol_mapped = _map_symbol(order.get("symbol"))
            cancel_res = _send_signed_request("DELETE", "/fapi/v1/order", {
                "symbol": symbol_mapped,
                "orderId": binance_order_id
            })
            if cancel_res["success"]:
                print(f"Successfully canceled mirrored LIMIT order on Binance: {binance_order_id}")
            else:
                print(f"Warning: Failed to cancel mirrored LIMIT order on Binance: {cancel_res.get('message')}")
        except Exception as e:
            print(f"Exception canceling mirrored LIMIT order on Binance: {e}")

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
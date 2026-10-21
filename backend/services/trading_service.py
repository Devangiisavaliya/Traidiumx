import uuid

from config.database import get_database
from config.settings import settings
from models.order_model import (
    claim_order_for_action,
    find_order_by_id,
    format_order,
    get_user_open_orders,
    get_user_pending_trigger_orders,
    release_order_action_claim,
    update_order
)
from models.position_model import (
    claim_open_position_for_close,
    create_position,
    find_open_position,
    find_position_by_id,
    format_position,
    get_user_open_positions,
    release_position_close_claim,
    update_position
)
from models.wallet_model import format_wallet
from models.trade_model import (
    create_trade,
    find_trade_by_id,
    format_trade,
    format_trades,
    get_user_trades
)
from services.trading_plan_service import apply_plan_spread_to_price, require_internal_trading_ready, reconcile_user_plan
from services.market_service import get_symbol_mark_price, get_symbol_ticker
from services.order_service import (
    cancel_order,
    get_open_orders,
    get_order_history,
    place_order
)
from services.pnl_service import calculate_position_pnl
from services.risk_service import (
    calculate_liquidation_distance,
    calculate_liquidation_price,
    get_user_risk_summary
)
from services.fee_service import calculate_platform_charge
from services.wallet_service import credit_admin_profit_wallet, debit_available_wallet, ensure_user_wallet, settle_position_margin, lock_wallet_amount
from utils.date_helper import now_utc


def _to_float(value, default=0.0):
    try:
        parsed = float(value)
        return parsed if parsed == parsed else default
    except (TypeError, ValueError):
        return default


ALLOWED_CLOSE_REASONS = {
    "manual",
    "manual_close",
    "take_profit",
    "stop_loss",
    "liquidation",
    "admin_close",
    "system_close",
}


def normalize_close_reason(value):
    reason = str(value or "manual").strip().lower().replace(" ", "_")
    if reason == "manual_close":
        return "manual"
    return reason if reason in ALLOWED_CLOSE_REASONS else "manual"


def _mark_price_snapshot(symbol, fallback=0.0):
    result = get_symbol_mark_price(symbol)
    if result.get("success"):
        data = result.get("data") or {}
        mark_price = _to_float(data.get("mark_price"), fallback)
        if mark_price > 0:
            return {
                "success": True,
                "mark_price": mark_price,
                "index_price": _to_float(data.get("index_price"), mark_price),
                "funding_rate": _to_float(data.get("last_funding_rate"), 0.0),
                "next_funding_time": data.get("next_funding_time"),
                "source": data.get("source", "binance_futures_premium_index"),
            }

    ticker = get_symbol_ticker(symbol)
    if ticker.get("success"):
        data = ticker.get("data") or {}
        price = _to_float(data.get("mark_price") or data.get("last_price"), fallback)
        return {
            "success": price > 0,
            "mark_price": price,
            "index_price": _to_float(data.get("index_price"), price),
            "funding_rate": _to_float(data.get("last_funding_rate"), 0.0),
            "next_funding_time": data.get("next_funding_time"),
            "source": data.get("source", "binance_futures"),
        }

    return {
        "success": False,
        "mark_price": _to_float(fallback, 0.0),
        "index_price": _to_float(fallback, 0.0),
        "funding_rate": 0.0,
        "next_funding_time": None,
        "source": "unavailable",
        "errors": result.get("errors", ticker.get("errors", {})),
    }


def _calculate_trading_fee(notional_value, product="futures"):
    charge_config = calculate_platform_charge(notional_value, product)
    fee_amount = round(_to_float(charge_config.get("platform_fee_usdt"), 0.0), 8)
    return charge_config, fee_amount


def _debit_trading_fee(user_id, amount, reference_id, description):
    amount = round(_to_float(amount), 8)
    if amount <= 0:
        return {"success": True, "message": "No trading fee configured.", "wallet": ensure_user_wallet(user_id)}

    return debit_available_wallet(
        user_id=user_id,
        amount=amount,
        transaction_type="trading_fee_debit",
        reference_id=reference_id,
        description=description,
    )


def place_trading_order(user_id, data):
    trading_restriction = require_internal_trading_ready(user_id)
    if trading_restriction:
        return trading_restriction

    """
    Company-ready futures order entry.
    - Market orders are executed atomically by backend. If execution fails, margin is released.
    - Marketable limit orders are executed by backend immediately.
    - Non-marketable limit/stop orders remain open/pending and are processed by backend trigger engine.
    """
    order_result = place_order(user_id, data)

    if not order_result["success"]:
        return order_result

    order = order_result.get("data", {}).get("order") or {}
    order_id = order.get("id")
    order_type = str(order.get("order_type") or "").lower()

    if not order_id:
        return order_result

    should_execute_now = False
    execution_note = "Order accepted by backend trading engine."

    if order_type == "market":
        should_execute_now = True
        execution_note = "Market order executed by backend trading engine."
    elif order_type == "limit":
        match_result = check_limit_order_match(order)
        should_execute_now = bool(match_result.get("success") and match_result.get("triggered"))
        if should_execute_now:
            execution_note = "Marketable limit order executed by backend trading engine."

    if not should_execute_now:
        return order_result

    execution_result = execute_order_internal(
        user_id=user_id,
        order_id=order_id,
        remark=execution_note
    )

    if execution_result["success"]:
        merged_data = order_result.get("data", {}).copy()
        merged_data.update({
            "order": execution_result["data"].get("order"),
            "position": execution_result["data"].get("position"),
            "trade": execution_result["data"].get("trade"),
            "execution": {
                "status": "filled",
                "engine": "backend_futures_risk_engine",
                "note": execution_result["data"].get("note")
            }
        })

        return {
            "success": True,
            "message": "Order placed and executed successfully.",
            "data": merged_data,
            "status_code": 201
        }

    # Market orders must not remain half-open with locked margin if execution fails.
    if order_type == "market":
        cancel_order(user_id, order_id)
        return {
            "success": False,
            "message": execution_result.get("message", "Market order execution failed."),
            "errors": execution_result.get("errors", {"execution": "Backend execution failed."}),
            "status_code": execution_result.get("status_code", 502)
        }

    return order_result


def get_trading_order_history(user_id):
    return get_order_history(user_id)


def format_open_order_with_live_price(order):
    order_data = format_order(order)

    if not order_data:
        return None

    market = _mark_price_snapshot(order.get("symbol"), order.get("estimated_price", 0.0))
    current_price = _to_float(market.get("mark_price"), 0.0)

    order_data["current_price"] = round(current_price, 8)
    order_data["mark_price"] = round(current_price, 8)
    order_data["index_price"] = round(_to_float(market.get("index_price"), current_price), 8)
    order_data["funding_rate"] = _to_float(market.get("funding_rate"), 0.0)

    order_type = str(order.get("order_type") or "").lower()

    if order_type in ["limit", "stop_limit"]:
        match_result = check_limit_order_match(order)
        order_data["is_marketable"] = bool(match_result.get("success") and match_result.get("triggered"))
        order_data["market_rule"] = match_result.get("rule")
    else:
        order_data["is_marketable"] = False
        order_data["market_rule"] = "not_a_limit_order"

    return order_data


def get_trading_open_orders(user_id):
    orders = get_user_open_orders(user_id)

    return {
        "success": True,
        "message": "Open orders fetched successfully.",
        "data": {
            "orders": [item for item in [format_open_order_with_live_price(order) for order in orders] if item]
        },
        "status_code": 200
    }


def cancel_trading_order(user_id, order_id):
    return cancel_order(user_id, order_id)


def check_stop_order_trigger(order):
    if order.get("order_type") not in ["stop_market", "stop_limit"]:
        return {
            "success": True,
            "triggered": True,
            "current_price": None,
            "stop_price": None,
            "rule": "normal_order"
        }

    ticker_result = get_symbol_ticker(order.get("symbol"))

    if not ticker_result["success"]:
        return {
            "success": False,
            "message": "Unable to fetch live price for stop trigger check.",
            "errors": ticker_result.get("errors", {})
        }

    current_price = float(ticker_result["data"]["last_price"])
    stop_price = float(order.get("stop_price", 0.0))
    side = order.get("side")

    if side == "buy":
        triggered = current_price >= stop_price
        rule = "buy_stop_triggers_when_current_price_is_greater_than_or_equal_to_stop_price"
    elif side == "sell":
        triggered = current_price <= stop_price
        rule = "sell_stop_triggers_when_current_price_is_less_than_or_equal_to_stop_price"
    else:
        triggered = False
        rule = "invalid_side"

    return {
        "success": True,
        "triggered": triggered,
        "current_price": current_price,
        "stop_price": stop_price,
        "rule": rule
    }


def check_limit_order_match(order):
    if str(order.get("order_type") or "").lower() not in ["limit", "stop_limit"]:
        return {
            "success": True,
            "triggered": False,
            "rule": "not_a_limit_order"
        }

    limit_price = float(order.get("limit_price", 0.0) or 0.0)
    side = str(order.get("side") or "").lower()

    if limit_price <= 0:
        return {
            "success": False,
            "message": "Invalid limit price.",
            "errors": {"limit_price": "Limit price must be greater than zero."}
        }

    current_price = 0.0
    if order.get("base_estimated_price") and float(order.get("base_estimated_price")) > 0:
        current_price = float(order.get("base_estimated_price"))
    elif order.get("estimated_price") and float(order.get("estimated_price")) > 0:
        current_price = float(order.get("estimated_price"))
    elif order.get("current_price") and float(order.get("current_price")) > 0:
        current_price = float(order.get("current_price"))
    else:
        try:
            from database.database import find_market_symbol
            sym_doc = find_market_symbol(order.get("symbol"))
            if sym_doc and sym_doc.get("last_price") and float(sym_doc["last_price"]) > 0:
                current_price = float(sym_doc["last_price"])
        except Exception:
            pass

    if current_price <= 0:
        ticker_result = get_symbol_ticker(order.get("symbol"))
        if ticker_result.get("success") and ticker_result.get("data", {}).get("last_price"):
            current_price = float(ticker_result["data"]["last_price"])

    if current_price <= 0:
        return {
            "success": False,
            "message": "Unable to fetch live price for limit order check.",
            "errors": {"price": "Market price unavailable"}
        }

    if side == "buy":
        triggered = current_price <= limit_price
        rule = "buy_limit_executes_when_current_price_is_less_than_or_equal_to_limit_price"
    elif side == "sell":
        triggered = current_price >= limit_price
        rule = "sell_limit_executes_when_current_price_is_greater_than_or_equal_to_limit_price"
    else:
        triggered = False
        rule = "invalid_side"

    return {
        "success": True,
        "triggered": triggered,
        "current_price": current_price,
        "limit_price": limit_price,
        "rule": rule
    }


def get_execution_price(order, user_id=None):
    order_type = order.get("order_type")

    if order_type in ["limit", "stop_limit"] and order.get("limit_price"):
        base_price = float(order.get("limit_price"))
    elif order.get("base_estimated_price") and float(order.get("base_estimated_price")) > 0:
        base_price = float(order.get("base_estimated_price"))
    elif order.get("estimated_price") and float(order.get("estimated_price")) > 0:
        base_price = float(order.get("estimated_price"))
    elif order.get("current_price") and float(order.get("current_price")) > 0:
        base_price = float(order.get("current_price"))
    else:
        base_price = 0.0
        try:
            from database.database import find_market_symbol
            sym_doc = find_market_symbol(order.get("symbol"))
            if sym_doc and sym_doc.get("last_price") and float(sym_doc["last_price"]) > 0:
                base_price = float(sym_doc["last_price"])
        except Exception:
            pass

        if base_price <= 0:
            clean_k = clean_string(order.get("symbol", "")).upper().replace("-", "").replace("/", "")
            from services.order_service import FALLBACK_ORDER_PRICES
            if clean_k in FALLBACK_ORDER_PRICES:
                base_price = FALLBACK_ORDER_PRICES[clean_k]

        if base_price <= 0:
            ticker_result = get_symbol_ticker(order.get("symbol"))
            if ticker_result.get("success"):
                data = ticker_result.get("data", {})
                base_price = float(data.get("last_price") or data.get("mark_price") or 0.0)

        if base_price <= 0:
            return {
                "success": False,
                "message": "Unable to fetch live execution price.",
                "errors": {"price": "Live price unavailable"}
            }

    spread = apply_plan_spread_to_price(
        user_id=user_id or order.get("user_id"),
        symbol=order.get("symbol"),
        side=order.get("side"),
        base_price=base_price,
        locked_plan=order.get("plan"),
        locked_spread_pips=order.get("spread_pips"),
        locked_spread_type=order.get("spread_type"),
    )

    # apply_plan_spread_to_price() already returns the complete entry-only
    # plan adjustment. Reuse that same price for estimate, margin and fill so
    # there is no half-spread estimate/full-spread execution mismatch.
    execution_price = _to_float(spread.get("price"), base_price)

    return {
        "success": True,
        **spread,
        "price": round(execution_price, 8),
        "base_price": round(base_price, 8),
        "spread_adjustment": round(_to_float(spread.get("spread_price"), 0.0), 8),
        "spread_application": "entry_only",
    }


def create_or_update_position_from_order(user_id, order, execution_price):
    """
    Handle position creation and updates.
    - If platform == 'traidiumx': Uses One-Way Netting / Averaging mode (Binance standard).
      Same-symbol same-side orders are merged and weighted-averaged into the existing position.
      Opposite-side orders reduce or close the existing position.
    - If platform == 'mt5': Uses Hedging mode. Every order creates a separate position lot.
    """
    db = get_database()
    platform = str(order.get("platform") or "traidiumx").lower().strip()
    position_side = "long" if order.get("side") == "buy" else "short"
    quantity = float(order.get("quantity", 0.0) or 0.0)
    margin_amount = float(order.get("margin_amount", 0.0) or 0.0)
    exec_price = float(execution_price)
    base_exec_price = float(order.get("base_execution_price", execution_price))
    margin_mode = order.get("margin_mode", "isolated")
    leverage = order.get("leverage", 1)
    symbol = order.get("symbol")
    order_id = str(order.get("_id") or order.get("id"))

    wallet = ensure_user_wallet(user_id)
    trading_wallet = wallet.get("trading_wallet") if isinstance(wallet.get("trading_wallet"), dict) else {}
    available_balance = float(trading_wallet.get("available_balance", wallet.get("available_balance", 0.0)) or 0.0)
    locked_balance = float(trading_wallet.get("locked_balance", wallet.get("locked_balance", 0.0)) or 0.0)
    total_balance = available_balance + locked_balance

    # 1. MT5 Platform: Standard Hedging mode (create a separate lot position every time)
    if platform == "mt5":
        notional_value = quantity * exec_price
        liq_price = calculate_liquidation_price(
            position_side=position_side,
            entry_price=exec_price,
            leverage=leverage,
            margin_mode=margin_mode,
            wallet_balance=total_balance,
            quantity=quantity
        )
        pos_id = create_position({
            "user_id": str(user_id),
            "symbol": symbol,
            "order_id": order_id,
            "position_side": position_side,
            "display_side": "BUY" if position_side == "long" else "SELL",
            "quantity": quantity,
            "entry_price": exec_price,
            "base_entry_price": base_exec_price,
            "platform": "mt5",
            "plan": order.get("plan", "basic"),
            "plan_name": order.get("plan_name", "Basic"),
            "spread_type": order.get("spread_type", "fixed"),
            "spread_pips": order.get("spread_pips", 0.0),
            "pip_size": order.get("pip_size", 0.0),
            "spread_price": order.get("spread_price", 0.0),
            "exit_price": 0.0,
            "leverage": leverage,
            "notional_value": round(notional_value, 8),
            "margin_amount": margin_amount,
            "margin_mode": margin_mode,
            "liquidation_price": liq_price,
            "take_profit": order.get("take_profit"),
            "stop_loss": order.get("stop_loss"),
            "tp_enabled": bool(order.get("take_profit")),
            "sl_enabled": bool(order.get("stop_loss")),
            "trigger_price_type": "mark_price",
            "realized_pnl": 0.0,
            "unrealized_pnl": 0.0,
            "currency": order.get("currency", "USDT"),
            "status": "open"
        })
        return find_position_by_id(str(pos_id)), None

    # 2. TraidiumX Platform: One-Way Netting / Averaging mode
    existing = db.positions.find_one({
        "user_id": str(user_id),
        "symbol": symbol,
        "status": "open",
        "platform": "traidiumx"
    })

    # Case A: No existing open position -> Open initial position
    if not existing:
        notional_value = quantity * exec_price
        liq_price = calculate_liquidation_price(
            position_side=position_side,
            entry_price=exec_price,
            leverage=leverage,
            margin_mode=margin_mode,
            wallet_balance=total_balance,
            quantity=quantity
        )
        pos_id = create_position({
            "user_id": str(user_id),
            "symbol": symbol,
            "order_id": order_id,
            "position_side": position_side,
            "display_side": "BUY" if position_side == "long" else "SELL",
            "quantity": quantity,
            "entry_price": exec_price,
            "base_entry_price": base_exec_price,
            "platform": "traidiumx",
            "plan": order.get("plan", "basic"),
            "plan_name": order.get("plan_name", "Basic"),
            "spread_type": order.get("spread_type", "fixed"),
            "spread_pips": order.get("spread_pips", 0.0),
            "pip_size": order.get("pip_size", 0.0),
            "spread_price": order.get("spread_price", 0.0),
            "exit_price": 0.0,
            "leverage": leverage,
            "notional_value": round(notional_value, 8),
            "margin_amount": margin_amount,
            "margin_mode": margin_mode,
            "liquidation_price": liq_price,
            "take_profit": order.get("take_profit"),
            "stop_loss": order.get("stop_loss"),
            "tp_enabled": bool(order.get("take_profit")),
            "sl_enabled": bool(order.get("stop_loss")),
            "trigger_price_type": "mark_price",
            "realized_pnl": 0.0,
            "unrealized_pnl": 0.0,
            "currency": order.get("currency", "USDT"),
            "status": "open"
        })
        return find_position_by_id(str(pos_id)), None

    existing_side = existing.get("position_side")

    # Case B: Same direction -> Weighted Averaging!
    if existing_side == position_side:
        old_qty = float(existing.get("quantity", 0.0) or 0.0)
        total_qty = round(old_qty + quantity, 8)
        old_entry = float(existing.get("entry_price", 0.0) or 0.0)
        new_avg_entry = round(((old_qty * old_entry) + (quantity * exec_price)) / total_qty, 8)

        old_base = float(existing.get("base_entry_price", old_entry) or old_entry)
        new_avg_base = round(((old_qty * old_base) + (quantity * base_exec_price)) / total_qty, 8)

        old_margin = float(existing.get("margin_amount", 0.0) or 0.0)
        total_margin = round(old_margin + margin_amount, 8)
        total_notional = round(total_qty * new_avg_entry, 8)

        new_liq_price = calculate_liquidation_price(
            position_side=position_side,
            entry_price=new_avg_entry,
            leverage=leverage,
            margin_mode=margin_mode,
            wallet_balance=total_balance,
            quantity=total_qty
        )

        update_fields = {
            "quantity": total_qty,
            "entry_price": new_avg_entry,
            "base_entry_price": new_avg_base,
            "margin_amount": total_margin,
            "notional_value": total_notional,
            "liquidation_price": new_liq_price,
            "updated_at": now_utc(),
            "last_order_id": order_id
        }
        if order.get("take_profit"):
            update_fields["take_profit"] = order.get("take_profit")
            update_fields["tp_enabled"] = True
        if order.get("stop_loss"):
            update_fields["stop_loss"] = order.get("stop_loss")
            update_fields["sl_enabled"] = True

        db.positions.update_one({"_id": existing["_id"]}, {"$set": update_fields})
        return find_position_by_id(str(existing["_id"])), None

    # Case C: Opposite direction -> Reduce / Close / Flip!
    existing_qty = float(existing.get("quantity", 0.0) or 0.0)
    existing_entry = float(existing.get("entry_price", 0.0) or 0.0)
    existing_margin = float(existing.get("margin_amount", 0.0) or 0.0)
    pos_currency = str(existing.get("currency") or "USDT").strip().upper()
    usdt_inr_rate = float(wallet.get("usdt_inr_rate", 88.50) or 88.50)

    # Sub-case C1: Partial reduction (quantity < existing_qty)
    if quantity < existing_qty:
        close_qty = quantity
        rem_qty = round(existing_qty - close_qty, 8)

        # Realized PnL on closed quantity
        if existing_side == "long":
            gross_pnl = (exec_price - existing_entry) * close_qty
        else:
            gross_pnl = (existing_entry - exec_price) * close_qty

        close_notional = round(close_qty * exec_price, 8)
        _, exit_fee = _calculate_trading_fee(close_notional, "futures")
        net_pnl = round(gross_pnl - exit_fee, 8)

        # Proportional margin to release
        rel_margin = round(existing_margin * (close_qty / existing_qty), 8)
        rem_margin = round(existing_margin - rel_margin, 8)

        settle_margin = round(rel_margin * usdt_inr_rate, 2) if pos_currency == "INR" else rel_margin
        settle_pnl = round(net_pnl * usdt_inr_rate, 2) if pos_currency == "INR" else net_pnl
        settle_fee = round(exit_fee * usdt_inr_rate, 2) if pos_currency == "INR" else exit_fee

        settle_position_margin(
            user_id=user_id,
            margin_amount=settle_margin,
            realized_pnl=settle_pnl,
            reference_id=str(existing["_id"]),
            description=f"Partial close {close_qty} {symbol} ({existing_side})",
            exit_trading_fee=settle_fee,
            currency=pos_currency
        )

        wallet_after = ensure_user_wallet(user_id)
        trading_wallet_after = wallet_after.get("trading_wallet") if isinstance(wallet_after.get("trading_wallet"), dict) else {}
        avail_after = float(trading_wallet_after.get("available_balance", wallet_after.get("available_balance", 0.0)) or 0.0)
        lock_after = float(trading_wallet_after.get("locked_balance", wallet_after.get("locked_balance", 0.0)) or 0.0)
        tot_bal_after = avail_after + lock_after

        rem_liq_price = calculate_liquidation_price(
            position_side=existing_side,
            entry_price=existing_entry,
            leverage=existing.get("leverage", leverage),
            margin_mode=existing.get("margin_mode", margin_mode),
            wallet_balance=tot_bal_after,
            quantity=rem_qty
        )

        update_fields = {
            "quantity": rem_qty,
            "margin_amount": rem_margin,
            "notional_value": round(rem_qty * existing_entry, 8),
            "realized_pnl": round(float(existing.get("realized_pnl", 0.0) or 0.0) + net_pnl, 8),
            "liquidation_price": rem_liq_price,
            "updated_at": now_utc(),
            "last_order_id": order_id
        }
        db.positions.update_one({"_id": existing["_id"]}, {"$set": update_fields})

        trade_ref = f"TXT-{uuid.uuid4().hex[:12].upper()}"
        trade_id = create_trade({
            "trade_reference": trade_ref,
            "user_id": str(user_id),
            "order_id": order_id,
            "position_id": str(existing["_id"]),
            "symbol": symbol,
            "side": order.get("side"),
            "position_side": existing_side,
            "trade_type": "close",
            "quantity": close_qty,
            "price": exec_price,
            "notional_value": close_notional,
            "fee_amount": exit_fee,
            "fee_type": "trading_fee" if exit_fee > 0 else "none",
            "realized_pnl": net_pnl,
            "currency": pos_currency
        })
        return find_position_by_id(str(existing["_id"])), find_trade_by_id(str(trade_id))

    # Sub-case C2: Full close (quantity == existing_qty)
    elif quantity == existing_qty:
        close_res = close_trading_position(user_id, str(existing["_id"]), close_reason="market_order")
        closed_trade = db.trades.find_one({"position_id": str(existing["_id"]), "trade_type": "close"})
        return find_position_by_id(str(existing["_id"])), closed_trade

    # Sub-case C3: Position flip (quantity > existing_qty)
    else:
        # Step 1: Fully close existing position
        close_trading_position(user_id, str(existing["_id"]), close_reason="position_flip")
        # Step 2: Open new opposite position with excess quantity
        excess_qty = round(quantity - existing_qty, 8)
        ratio = excess_qty / quantity
        excess_margin = round(margin_amount * ratio, 8)
        excess_notional = round(excess_qty * exec_price, 8)

        new_liq_price = calculate_liquidation_price(
            position_side=position_side,
            entry_price=exec_price,
            leverage=leverage,
            margin_mode=margin_mode,
            wallet_balance=total_balance,
            quantity=excess_qty
        )

        pos_id = create_position({
            "user_id": str(user_id),
            "symbol": symbol,
            "order_id": order_id,
            "position_side": position_side,
            "display_side": "BUY" if position_side == "long" else "SELL",
            "quantity": excess_qty,
            "entry_price": exec_price,
            "base_entry_price": base_exec_price,
            "platform": "traidiumx",
            "plan": order.get("plan", "basic"),
            "plan_name": order.get("plan_name", "Basic"),
            "spread_type": order.get("spread_type", "fixed"),
            "spread_pips": order.get("spread_pips", 0.0),
            "pip_size": order.get("pip_size", 0.0),
            "spread_price": order.get("spread_price", 0.0),
            "exit_price": 0.0,
            "leverage": leverage,
            "notional_value": excess_notional,
            "margin_amount": excess_margin,
            "margin_mode": margin_mode,
            "liquidation_price": new_liq_price,
            "take_profit": order.get("take_profit"),
            "stop_loss": order.get("stop_loss"),
            "tp_enabled": bool(order.get("take_profit")),
            "sl_enabled": bool(order.get("stop_loss")),
            "trigger_price_type": "mark_price",
            "realized_pnl": 0.0,
            "unrealized_pnl": 0.0,
            "currency": order.get("currency", "USDT"),
            "status": "open"
        })
        return find_position_by_id(str(pos_id)), None


def create_open_trade(user_id, order, position, execution_price):
    trade_reference = f"TXT-{uuid.uuid4().hex[:12].upper()}"
    quantity = float(order.get("quantity", 0.0))
    notional_value = quantity * float(execution_price)

    trade_id = create_trade({
        "trade_reference": trade_reference,
        "user_id": str(user_id),
        "order_id": str(order["_id"]),
        "position_id": str(position["_id"]),
        "symbol": order.get("symbol"),
        "side": order.get("side"),
        "position_side": position.get("position_side"),
        "trade_type": "open",
        "quantity": quantity,
        "price": float(execution_price),
        "notional_value": round(notional_value, 8),
        "fee_amount": float(order.get("platform_fee", 0.0) or 0.0),
        "fee_type": "trading_fee" if float(order.get("platform_fee", 0.0) or 0.0) > 0 else "none",
        "realized_pnl": 0.0,
        "currency": order.get("currency", "USDT")
    })

    return find_trade_by_id(str(trade_id))


def execute_order_internal(user_id, order_id, remark="Order executed by backend trading engine."):
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
            "message": "Order cannot be executed.",
            "errors": {
                "status": f"Current order status is {order.get('status')}."
            },
            "status_code": 400
        }

    if order.get("status") == "pending_trigger":
        trigger_result = check_stop_order_trigger(order)

        if not trigger_result["success"]:
            return {
                "success": False,
                "message": trigger_result["message"],
                "errors": trigger_result["errors"],
                "status_code": 502
            }

        if not trigger_result["triggered"]:
            return {
                "success": False,
                "message": "Stop order trigger price not reached yet.",
                "errors": {
                    "current_price": trigger_result["current_price"],
                    "stop_price": trigger_result["stop_price"],
                    "rule": trigger_result["rule"]
                },
                "status_code": 400
            }

    price_result = get_execution_price(order, user_id=user_id)

    if not price_result["success"]:
        return {
            "success": False,
            "message": price_result["message"],
            "errors": price_result["errors"],
            "status_code": 502
        }

    execution_price = price_result["price"]
    spread_snapshot = {
        "platform": order.get("platform", "traidiumx"),
        "plan": price_result.get("plan") or order.get("plan", "basic"),
        "plan_name": price_result.get("plan_name") or order.get("plan_name", "Basic"),
        "spread_pips": price_result.get("spread_pips", order.get("spread_pips", 0.0)),
        "pip_size": price_result.get("pip_size", order.get("pip_size", 0.0)),
        "spread_price": price_result.get("spread_price", order.get("spread_price", 0.0)),
        "base_execution_price": price_result.get("base_price", execution_price),
    }
    order = {**order, **spread_snapshot}

    # Claim immediately before settlement/position creation. A concurrent
    # cancel request or another engine worker can no longer execute this order.
    original_status = str(order.get("status") or "open")
    claimed_order = claim_order_for_action(
        order_id=order_id,
        user_id=user_id,
        action_status="executing",
        allowed_statuses=[original_status],
    )
    if not claimed_order:
        return {
            "success": False,
            "message": "Order is already being processed.",
            "errors": {"status": "The order was claimed by another request or worker."},
            "status_code": 409,
        }
    # Re-apply the execution-time spread snapshot after claiming the order.
    # claim_order_for_action() returns the persisted pre-execution order, which
    # does not yet contain base_execution_price. Without this merge the
    # position stores base_entry_price equal to entry_price, making a correctly
    # applied spread impossible to verify from the API response.
    order = {**claimed_order, **spread_snapshot}

    quantity = float(order.get("quantity", 0.0) or 0.0)
    notional_value = round(quantity * float(execution_price), 8)
    platform_charge, platform_fee = _calculate_trading_fee(notional_value, "futures")
    if platform_fee <= 0 and order.get("platform_fee"):
        # Backward-compatible fallback for orders that were placed before settings were reloaded.
        platform_fee = round(_to_float(order.get("platform_fee"), 0.0), 8)

    if platform_fee > 0 and not order.get("platform_fee_charged"):
        fee_result = debit_available_wallet(
            user_id=user_id,
            amount=platform_fee,
            transaction_type="trading_fee_debit",
            reference_id=order_id,
            description=f"Trading fee for futures {str(order.get('side') or '').upper()} order {order.get('order_reference')}"
        )

        if not fee_result.get("success"):
            release_order_action_claim(order_id, "executing", original_status)
            return {
                "success": False,
                "message": fee_result.get("message", "Unable to debit trading fee."),
                "errors": {"platform_fee": fee_result.get("message", "Trading fee debit failed.")},
                "status_code": 422
            }

        try:
            credit_admin_profit_wallet(
                amount=platform_fee,
                transaction_type="futures_entry_trading_fee_credit",
                reference_id=order_id,
                description=f"Entry trading fee for futures {str(order.get('side') or '').upper()} order {order.get('order_reference')}",
            )
            # Distribute referral commission asynchronously
            try:
                from services.referral_service import distribute_referral_commission
                import threading
                threading.Thread(
                    target=distribute_referral_commission,
                    kwargs={
                        "referred_user_id": str(user_id),
                        "fee_amount": platform_fee,
                        "reference_id": order_id,
                        "description": "Futures order entry fee"
                    },
                    daemon=True
                ).start()
            except Exception as ref_err:
                print(f"Error launching referral commission thread for {order_id}: {ref_err}")
        except Exception as error:
            print(f"Warning: admin entry-fee credit failed for order {order_id}: {error}")

        order = dict(order)
        order["platform_fee"] = platform_fee
        order["trading_fee"] = platform_fee
        order["platform_fee_config"] = platform_charge
        order["trading_fee_config"] = platform_charge

    position_res = create_or_update_position_from_order(
        user_id=user_id,
        order=order,
        execution_price=execution_price
    )

    if isinstance(position_res, tuple):
        position, trade = position_res
    else:
        position, trade = position_res, None

    if not trade and position:
        trade = create_open_trade(
            user_id=user_id,
            order=order,
            position=position,
            execution_price=execution_price
        )

    # Mirror to Binance asynchronously (non-blocking) ONLY for TraidiumX Exchange platform orders
    order_platform = str(order.get("platform") or "traidiumx").lower().strip()
    is_test_order = bool(order.get("is_test") or str(user_id).startswith("test_") or "test" in str(order.get("order_reference", "")).lower())
    if order_platform == "traidiumx" and settings.BINANCE_API_KEY and not order.get("binance_order_id") and not is_test_order:
        import threading
        def _async_mirror_execution(ord_data, pos_id, exec_prc):
            try:
                from services.binance_service import place_binance_futures_order, update_binance_tp_sl
                binance_res = place_binance_futures_order(
                    symbol=ord_data.get("symbol"),
                    side=ord_data.get("side"),
                    quantity=ord_data.get("quantity"),
                    leverage=ord_data.get("leverage", 1),
                    margin_mode=ord_data.get("margin_mode", "isolated"),
                    price=exec_prc if ord_data.get("order_type") == "limit" else None,
                    order_type=ord_data.get("order_type", "MARKET")
                )
                if binance_res.get("success"):
                    b_id = binance_res.get("binance_order_id")
                    b_status = binance_res.get("status")
                    update_order(str(ord_data.get("_id") or ord_data.get("id")), {
                        "binance_order_id": b_id,
                        "binance_status": b_status,
                        "remark": f"Mirrored to Binance. ID: {b_id}"
                    })
                    if pos_id:
                        update_position(str(pos_id), {"binance_order_id": b_id})
                    tp = ord_data.get("take_profit")
                    sl = ord_data.get("stop_loss")
                    if tp or sl:
                        try:
                            update_binance_tp_sl(
                                symbol=ord_data.get("symbol"),
                                position_side=ord_data.get("side"),
                                quantity=ord_data.get("quantity"),
                                take_profit=tp,
                                stop_loss=sl
                            )
                        except Exception as tp_sl_err:
                            print(f"Failed to place TP/SL on Binance in background: {tp_sl_err}")
                else:
                    update_order(str(ord_data.get("_id") or ord_data.get("id")), {
                        "remark": f"Binance Mirror Failed: {binance_res.get('message')}"
                    })
            except Exception as b_err:
                print(f"Failed to mirror order to Binance in background: {b_err}")

        threading.Thread(
            target=_async_mirror_execution,
            args=(dict(order), str(position["_id"]), execution_price),
            daemon=True
        ).start()
    elif order_platform == "mt5":
        update_order(str(order.get("_id") or order.get("id")), {
            "remark": "MT5 account order. Binance mirroring skipped (MT5 only)."
        })

    # Update local order to filled status immediately for instant client response
    updated_order = update_order(
        order_id=order_id,
        update_data={
            "status": "filled",
            "filled_quantity": float(order.get("quantity", 0.0)),
            "average_fill_price": execution_price,
            "base_execution_price": spread_snapshot.get("base_execution_price", execution_price),
            "platform": spread_snapshot.get("platform", "traidiumx"),
            "plan": spread_snapshot.get("plan"),
            "plan_name": spread_snapshot.get("plan_name"),
            "spread_pips": spread_snapshot.get("spread_pips", 0.0),
            "pip_size": spread_snapshot.get("pip_size", 0.0),
            "spread_price": spread_snapshot.get("spread_price", 0.0),
            "platform_fee": platform_fee,
            "trading_fee": platform_fee,
            "platform_fee_status": "charged" if platform_fee > 0 else "not_applicable",
            "trading_fee_status": "charged" if platform_fee > 0 else "not_applicable",
            "platform_fee_charged": platform_fee > 0,
            "platform_fee_charged_at": now_utc() if platform_fee > 0 else None,
            "trading_fee_charged": platform_fee > 0,
            "trading_fee_charged_at": now_utc() if platform_fee > 0 else None,
            "platform_fee_config": platform_charge,
            "trading_fee_config": platform_charge,
            "remark": remark,
            "executed_at": now_utc(),
            "binance_order_id": order.get("binance_order_id"),
            "binance_status": order.get("binance_status")
        }
    )

    reconcile_user_plan(user_id, send_notice=True)

    return {
        "success": True,
        "message": "Order executed and position created successfully.",
        "data": {
            "order": format_order(updated_order),
            "position": format_position_with_live_pnl(position),
            "trade": format_trade(trade),
            "note": "Position created: " + remark
        },
        "status_code": 200
    }


def execute_order_for_development(user_id, order_id):
    if settings.APP_ENV != "development":
        return {
            "success": False,
            "message": "Development order execution is not allowed in production.",
            "errors": {
                "environment": settings.APP_ENV
            },
            "status_code": 403
        }

    return execute_order_internal(
        user_id=user_id,
        order_id=order_id,
        remark="Order executed in development mode."
    )


def format_position_with_live_pnl(position):
    market = _mark_price_snapshot(position.get("symbol"), position.get("entry_price", 0.0))
    mark_price = _to_float(market.get("mark_price"), position.get("entry_price", 0.0))

    pnl_data = calculate_position_pnl(position, mark_price)
    liquidation_data = calculate_liquidation_distance(position, mark_price)

    position_data = format_position(position)
    position_data.update(pnl_data)
    position_data.update(liquidation_data)
    position_data.update({
        "mark_price": round(mark_price, 8),
        "index_price": round(_to_float(market.get("index_price"), mark_price), 8),
        "funding_rate": _to_float(market.get("funding_rate"), 0.0),
        "next_funding_time": market.get("next_funding_time"),
        "trigger_price_type": "mark_price",
    })

    return position_data


def get_trading_positions(user_id):
    positions = get_user_open_positions(user_id)

    formatted_positions = []
    total_unrealized_pnl = 0.0
    total_margin = 0.0

    for position in positions:
        position_data = format_position_with_live_pnl(position)
        formatted_positions.append(position_data)
        total_unrealized_pnl += float(position_data.get("unrealized_pnl", 0.0))
        total_margin += float(position_data.get("margin_amount", 0.0))

    return {
        "success": True,
        "message": "Open positions fetched successfully.",
        "data": {
            "positions": formatted_positions,
            "summary": {
                "total_open_positions": len(formatted_positions),
                "total_margin": round(total_margin, 8),
                "total_unrealized_pnl": round(total_unrealized_pnl, 8)
            }
        },
        "status_code": 200
    }


def get_trading_trades(user_id):
    trades = get_user_trades(user_id)

    return {
        "success": True,
        "message": "Trade history fetched successfully.",
        "data": {
            "trades": format_trades(trades)
        },
        "status_code": 200
    }


def get_trading_pnl_summary(user_id):
    positions_result = get_trading_positions(user_id)

    return {
        "success": True,
        "message": "P&L summary fetched successfully.",
        "data": positions_result["data"]["summary"],
        "status_code": 200
    }


def get_trading_risk_summary(user_id):
    return get_user_risk_summary(user_id)


def close_trading_position(user_id, position_id, close_reason="manual"):
    """Close one position exactly once using Mark Price and backend-confirmed settlement."""
    close_reason = normalize_close_reason(close_reason)
    existing = find_position_by_id(position_id)

    if not existing:
        return {
            "success": False,
            "message": "Position not found.",
            "errors": {"position": "Invalid position ID."},
            "status_code": 404,
        }

    if existing.get("user_id") != str(user_id):
        return {
            "success": False,
            "message": "Unauthorized position access.",
            "errors": {"position": "This position does not belong to current user."},
            "status_code": 403,
        }

    if existing.get("status") != "open":
        return {
            "success": False,
            "message": "Position is already closing or closed.",
            "errors": {"status": f"Current position status is {existing.get('status')}."},
            "status_code": 409,
        }

    # This atomic claim prevents two browser clicks / workers from settling the same position twice.
    position = claim_open_position_for_close(position_id, user_id)
    if not position:
        current = find_position_by_id(position_id)
        return {
            "success": False,
            "message": "Position is already closing or closed.",
            "errors": {"status": (current or {}).get("status", "unknown")},
            "status_code": 409,
        }

    settlement_completed = False

    def fail(message, errors, status_code):
        if not settlement_completed:
            release_position_close_claim(position_id)
        return {
            "success": False,
            "message": message,
            "errors": errors,
            "status_code": status_code,
        }

    market = _mark_price_snapshot(position.get("symbol"), position.get("entry_price", 0.0))
    base_close_price = _to_float(market.get("mark_price"), 0.0)
    close_side = "sell" if position.get("position_side") == "long" else "buy"

    # Entry-only spread policy: close at the unadjusted backend Mark Price.
    # The complete plan spread was already charged when the position opened.
    close_price = base_close_price
    close_spread = {
        "plan": position.get("plan", "basic"),
        "plan_name": position.get("plan_name", "Basic"),
        "spread_pips": 0.0,
        "pip_size": position.get("pip_size", 0.0),
        "spread_price": 0.0,
        "spread_adjustment": 0.0,
        "base_price": base_close_price,
        "price": close_price,
        "spread_application": "entry_only",
    }

    if close_price <= 0:
        return fail(
            "Unable to fetch live Mark Price.",
            market.get("errors", {"market": "Mark Price unavailable."}),
            502,
        )

    binance_close_order_id = None
    binance_close_status = None
    binance_close_remark = ""

    position_platform = str(position.get("platform") or "traidiumx").lower().strip()
    is_test_pos = bool(position.get("is_test") or str(user_id).startswith("test_") or close_reason == "test")
    if position_platform == "traidiumx" and settings.BINANCE_API_KEY and not is_test_pos:
        try:
            from services.binance_service import close_binance_futures_position
            binance_res = close_binance_futures_position(
                symbol=position.get("symbol"),
                side=position.get("position_side"),
                quantity=position.get("quantity"),
                leverage=position.get("leverage", 1),
                margin_mode=position.get("margin_mode", "isolated")
            )
            if binance_res.get("success"):
                binance_close_order_id = binance_res.get("binance_order_id")
                binance_close_status = binance_res.get("status")
                binance_close_remark = f" Binance Close Order ID: {binance_close_order_id}"
                binance_exit_price = binance_res.get("avg_price")
                if binance_exit_price and binance_exit_price > 0:
                    close_price = binance_exit_price
                    base_close_price = binance_exit_price
            else:
                binance_close_remark = f" Binance Close Failed: {binance_res.get('message')}"
        except Exception as b_close_err:
            print(f"Exception closing Binance position: {b_close_err}")
    elif position_platform == "mt5":
        binance_close_remark = " (MT5 position closed, Binance close skipped)"

    pnl_data = calculate_position_pnl(position, close_price)
    gross_realized_pnl = _to_float(pnl_data.get("unrealized_pnl"), 0.0)
    margin_amount = _to_float(position.get("margin_amount"), 0.0)
    quantity = _to_float(position.get("quantity"), 0.0)
    close_notional_value = round(quantity * close_price, 8)
    exit_fee_config, exit_trading_fee = _calculate_trading_fee(close_notional_value, "futures")

    if close_reason == "liquidation":
        exit_trading_fee = 0.0

    # Margin + net P&L + exit fee are settled in one wallet write. This avoids
    # the temporary wrong wallet balance and removes the fee-after-close race.
    net_realized_pnl = round(gross_realized_pnl - exit_trading_fee, 8)
    position_currency = str(position.get("currency") or "USDT").strip().upper()

    user_wallet = ensure_user_wallet(user_id)
    usdt_inr_rate = float(user_wallet.get("usdt_inr_rate", 88.50) or 88.50)

    settle_margin = round(margin_amount * usdt_inr_rate, 2) if position_currency == "INR" else margin_amount
    settle_pnl = round(net_realized_pnl * usdt_inr_rate, 2) if position_currency == "INR" else net_realized_pnl
    settle_fee = round(exit_trading_fee * usdt_inr_rate, 2) if position_currency == "INR" else exit_trading_fee

    wallet_result = settle_position_margin(
        user_id=user_id,
        margin_amount=settle_margin,
        realized_pnl=settle_pnl,
        reference_id=position_id,
        description=f"Position closed for {position.get('symbol')} ({close_reason})",
        exit_trading_fee=settle_fee,
        currency=position_currency,
    )

    if not wallet_result.get("success"):
        return fail(
            wallet_result.get("message", "Unable to settle position margin."),
            {"wallet": wallet_result.get("message", "Position settlement failed.")},
            422,
        )

    settlement_completed = True
    wallet_after_close = wallet_result.get("wallet") or ensure_user_wallet(user_id)

    if exit_trading_fee > 0:
        try:
            credit_admin_profit_wallet(
                amount=exit_trading_fee,
                transaction_type="futures_exit_trading_fee_credit",
                reference_id=position_id,
                description=f"Exit trading fee for futures {position.get('symbol')} position {position_id}",
            )
            # Distribute referral commission if applicable
            try:
                from services.referral_service import distribute_referral_commission
                distribute_referral_commission(
                    referred_user_id=str(user_id),
                    fee_amount=exit_trading_fee,
                    reference_id=position_id,
                    description=f"Futures position close fee"
                )
            except Exception as ref_err:
                print(f"Error distributing referral commission for futures exit position {position_id}: {ref_err}")
        except Exception as error:
            # User settlement must not be rolled back after it has succeeded.
            print(f"Warning: admin exit-fee credit failed for {position_id}: {error}")

    spread_profit = round(float(position.get("spread_price", 0.0) or 0.0) * float(position.get("quantity", 0.0) or 0.0), 8)
    if spread_profit > 0:
        try:
            credit_admin_profit_wallet(
                amount=spread_profit,
                transaction_type="futures_spread_profit_credit",
                reference_id=position_id,
                description=f"Spread profit from futures {position.get('symbol')} position {position_id} (Plan: {position.get('plan_name')})",
            )
        except Exception as error:
            print(f"Warning: admin spread profit credit failed for {position_id}: {error}")

    updated_position = update_position(
        position_id=position_id,
        update_data={
            "status": "closed",
            "exit_price": close_price,
            "base_exit_price": base_close_price,
            "exit_spread_pips": 0.0,
            "exit_spread_price": 0.0,
            "exit_spread_adjustment": 0.0,
            "spread_application": "entry_only",
            "mark_price": close_price,
            "index_price": _to_float(market.get("index_price"), close_price),
            "trigger_price_type": "mark_price",
            "realized_pnl": net_realized_pnl,
            "gross_realized_pnl": round(gross_realized_pnl, 8),
            "exit_trading_fee": exit_trading_fee,
            "exit_trading_fee_config": exit_fee_config,
            "net_realized_pnl": net_realized_pnl,
            "unrealized_pnl": 0.0,
            "closed_at": now_utc(),
            "close_reason": close_reason,
            "binance_close_order_id": binance_close_order_id,
            "binance_close_status": binance_close_status,
            "binance_close_remark": binance_close_remark
        },
    )

    trade_id = create_trade({
        "trade_reference": f"TXT-{uuid.uuid4().hex[:12].upper()}",
        "user_id": str(user_id),
        "order_id": None,
        "position_id": position_id,
        "symbol": position.get("symbol"),
        "side": close_side,
        "position_side": position.get("position_side"),
        "trade_type": "close",
        "quantity": quantity,
        "price": close_price,
        "base_price": base_close_price,
        "plan": position.get("plan", "basic"),
        "plan_name": position.get("plan_name", "Basic"),
        "platform": position.get("platform", "traidiumx"),
        "base_exit_price": base_close_price,
        "exit_price": close_price,
        "spread_pips": 0.0,
        "pip_size": position.get("pip_size", 0.0),
        "spread_price": 0.0,
        "spread_adjustment": 0.0,
        "spread_application": "entry_only",
        "mark_price": close_price,
        "index_price": _to_float(market.get("index_price"), close_price),
        "trigger_price_type": "mark_price",
        "notional_value": close_notional_value,
        "fee_amount": exit_trading_fee,
        "fee_type": "trading_fee" if exit_trading_fee > 0 else "none",
        "gross_realized_pnl": round(gross_realized_pnl, 8),
        "realized_pnl": net_realized_pnl,
        "net_realized_pnl": net_realized_pnl,
        "close_reason": close_reason,
        "currency": position.get("currency", "USDT"),
        "binance_order_id": binance_close_order_id,
        "binance_status": binance_close_status,
        "remark": f"Position closed.{binance_close_remark}"
    })
    close_trade = find_trade_by_id(str(trade_id))
    reconcile_user_plan(user_id, send_notice=True)

    return {
        "success": True,
        "message": "Position closed successfully.",
        "data": {
            "position": format_position(updated_position),
            "trade": format_trade(close_trade),
            "wallet": {
                "available_balance": wallet_after_close.get("available_balance", 0.0),
                "locked_balance": wallet_after_close.get("locked_balance", 0.0),
                "total_balance": wallet_after_close.get("total_balance", 0.0),
                "settlement_amount": wallet_result.get("settlement_amount", 0.0),
                "gross_realized_pnl": round(gross_realized_pnl, 8),
                "exit_trading_fee": exit_trading_fee,
                "realized_pnl": net_realized_pnl,
                "net_realized_pnl": net_realized_pnl,
            },
            "close_reason": close_reason,
            "price_type": "mark_price",
        },
        "status_code": 200,
    }


def close_all_trading_positions(user_id, close_reason="manual"):
    """Close every open position through one backend request."""
    close_reason = normalize_close_reason(close_reason)
    positions = get_user_open_positions(user_id)
    closed = []
    failed = []

    for position in positions:
        position_id = str(position.get("_id"))
        result = close_trading_position(user_id, position_id, close_reason=close_reason)
        if result.get("success"):
            closed.append(result.get("data"))
        else:
            failed.append({
                "position_id": position_id,
                "symbol": position.get("symbol"),
                "message": result.get("message"),
                "errors": result.get("errors", {}),
            })

    remaining_positions = [
        format_position_with_live_pnl(position)
        for position in get_user_open_positions(user_id)
    ]
    wallet = format_wallet(ensure_user_wallet(user_id))

    # The batch request itself succeeded even when one independently changing
    # position could not be closed. Return the exact remaining server state so
    # the browser never needs a page refresh and never hides a failed position.
    return {
        "success": True,
        "message": (
            "All positions closed successfully."
            if not failed
            else f"{len(closed)} position(s) closed and {len(failed)} could not be closed."
        ),
        "data": {
            "closed_count": len(closed),
            "failed_count": len(failed),
            "closed_positions": closed,
            "failed_positions": failed,
            "positions": remaining_positions,
            "wallet": wallet,
        },
        "errors": {"positions": failed} if failed else {},
        "status_code": 200,
    }


def update_position_protection(user_id, position_id, data):
    """Persist TP/SL on the position record; browser memory is never authoritative."""
    position = find_position_by_id(position_id)

    if not position:
        return {
            "success": False,
            "message": "Position not found.",
            "errors": {"position": "Invalid position ID."},
            "status_code": 404,
        }

    if position.get("user_id") != str(user_id):
        return {
            "success": False,
            "message": "Unauthorized position access.",
            "errors": {"position": "This position does not belong to current user."},
            "status_code": 403,
        }

    if position.get("status") != "open":
        return {
            "success": False,
            "message": "TP/SL can only be updated on an open position.",
            "errors": {"status": position.get("status")},
            "status_code": 409,
        }

    tp_enabled = bool(data.get("tp_enabled", data.get("take_profit") not in [None, "", 0, "0"]))
    sl_enabled = bool(data.get("sl_enabled", data.get("stop_loss") not in [None, "", 0, "0"]))
    take_profit = _to_float(data.get("take_profit"), 0.0) if tp_enabled else 0.0
    stop_loss = _to_float(data.get("stop_loss"), 0.0) if sl_enabled else 0.0

    if tp_enabled and take_profit <= 0:
        return {
            "success": False,
            "message": "Valid Take Profit price is required.",
            "errors": {"take_profit": "Take Profit must be greater than zero."},
            "status_code": 422,
        }

    if sl_enabled and stop_loss <= 0:
        return {
            "success": False,
            "message": "Valid Stop Loss price is required.",
            "errors": {"stop_loss": "Stop Loss must be greater than zero."},
            "status_code": 422,
        }

    reference_price = _to_float(position.get("entry_price"), 0.0)
    side = str(position.get("position_side") or "").lower()
    errors = {}

    if side == "long":
        if take_profit and take_profit <= reference_price:
            errors["take_profit"] = "Long Take Profit must be above entry price."
        if stop_loss and stop_loss >= reference_price:
            errors["stop_loss"] = "Long Stop Loss must be below entry price."
    elif side == "short":
        if take_profit and take_profit >= reference_price:
            errors["take_profit"] = "Short Take Profit must be below entry price."
        if stop_loss and stop_loss <= reference_price:
            errors["stop_loss"] = "Short Stop Loss must be above entry price."

    if errors:
        return {
            "success": False,
            "message": "TP/SL validation failed.",
            "errors": errors,
            "status_code": 422,
        }

    updated = update_position(position_id, {
        "take_profit": take_profit or None,
        "stop_loss": stop_loss or None,
        "tp_enabled": bool(take_profit),
        "sl_enabled": bool(stop_loss),
        "trigger_price_type": "mark_price",
    })

    # Mirror updated TP/SL to Binance only for TraidiumX Exchange platform
    position_platform = str(position.get("platform") or "traidiumx").lower().strip()
    if position_platform == "traidiumx":
        try:
            from services.binance_service import _get_binance_credentials, update_binance_tp_sl
            api_key, _, _ = _get_binance_credentials()
            if api_key:
                update_binance_tp_sl(
                    symbol=position.get("symbol"),
                    position_side=position.get("position_side"),
                    quantity=position.get("quantity"),
                    take_profit=take_profit,
                    stop_loss=stop_loss
                )
        except Exception as tp_sl_err:
            print(f"Error mirroring updated TP/SL to Binance: {tp_sl_err}")

    return {
        "success": True,
        "message": "Position TP/SL updated successfully.",
        "data": {"position": format_position_with_live_pnl(updated)},
        "status_code": 200,
    }


# Backward-compatible alias for existing imports/routes. Closing a position is a normal trading action,
# not a development-only action.
def close_position_for_development(user_id, position_id):
    return close_trading_position(user_id, position_id)


def should_close_position_by_tp_sl(position, current_price):
    position_side = str(position.get("position_side") or "").lower()
    take_profit = position.get("take_profit")
    stop_loss = position.get("stop_loss")

    try:
        current_price = float(current_price)
        take_profit = float(take_profit) if take_profit not in [None, "", 0, "0"] else None
        stop_loss = float(stop_loss) if stop_loss not in [None, "", 0, "0"] else None
    except (TypeError, ValueError):
        return False, None

    if position_side == "long":
        if take_profit and current_price >= take_profit:
            return True, "take_profit"
        if stop_loss and current_price <= stop_loss:
            return True, "stop_loss"
    elif position_side == "short":
        if take_profit and current_price <= take_profit:
            return True, "take_profit"
        if stop_loss and current_price >= stop_loss:
            return True, "stop_loss"

    return False, None


def process_open_position_protection_orders(user_id):
    positions = get_user_open_positions(user_id)
    closed_positions = []
    skipped_positions = []
    failed_positions = []

    for position in positions:
        position_id = str(position.get("_id"))
        market = _mark_price_snapshot(position.get("symbol"), position.get("entry_price", 0.0))

        if not market.get("success"):
            failed_positions.append({
                "position_id": position_id,
                "symbol": position.get("symbol"),
                "reason": "Mark Price unavailable.",
                "errors": market.get("errors", {})
            })
            continue

        current_price = _to_float(market.get("mark_price"), 0.0)
        should_close, close_reason = should_close_position_by_tp_sl(position, current_price)

        if not should_close:
            skipped_positions.append({
                "position_id": position_id,
                "symbol": position.get("symbol"),
                "reason": "TP/SL not reached."
            })
            continue

        close_result = close_trading_position(user_id, position_id, close_reason=close_reason)

        if close_result.get("success"):
            closed_positions.append(close_result.get("data"))
        else:
            failed_positions.append({
                "position_id": position_id,
                "symbol": position.get("symbol"),
                "reason": close_result.get("message"),
                "errors": close_result.get("errors", {})
            })

    return {
        "closed_count": len(closed_positions),
        "skipped_count": len(skipped_positions),
        "failed_count": len(failed_positions),
        "closed_positions": closed_positions,
        "failed_positions": failed_positions
    }


def process_liquidations(user_id):
    from admin.settings_routes import get_final_settings
    system_settings = get_final_settings()
    if not system_settings.get("enable_auto_liquidation", True):
        return {
            "liquidated_count": 0,
            "liquidated_positions": []
        }

    positions = get_user_open_positions(user_id)
    if not positions:
        return {
            "liquidated_count": 0,
            "liquidated_positions": []
        }

    wallet = ensure_user_wallet(user_id)
    trading_wallet = wallet.get("trading_wallet") or {}
    available_balance = float(trading_wallet.get("available_balance", 0.0))

    total_unrealized_pnl = 0.0
    positions_to_check = []
    
    for pos in positions:
        pos_data = format_position_with_live_pnl(pos)
        unrealized_pnl = float(pos_data.get("unrealized_pnl", 0.0))
        total_unrealized_pnl += unrealized_pnl
        positions_to_check.append((pos, pos_data))

    liquidated_positions = []
    
    # Margin deficit check: available balance + total unrealized loss is negative
    should_liquidate_all = (available_balance + total_unrealized_pnl < 0)
    
    for pos, pos_data in positions_to_check:
        pos_id = str(pos.get("_id"))
        symbol = pos.get("symbol")
        position_side = pos.get("position_side")
        
        # Individual liquidation price check always uses Mark Price.
        market = _mark_price_snapshot(symbol, pos.get("entry_price", 0.0))
        if market.get("success"):
            current_price = _to_float(market.get("mark_price"), 0.0)
            liquidation_price = float(pos.get("liquidation_price") or 0.0)
            
            should_liquidate_pos = False
            if liquidation_price > 0 and current_price > 0:
                if position_side == "long" and current_price <= liquidation_price:
                    should_liquidate_pos = True
                elif position_side == "short" and current_price >= liquidation_price:
                    should_liquidate_pos = True
                    
            if should_liquidate_all or should_liquidate_pos:
                close_res = close_trading_position(user_id, pos_id, close_reason="liquidation")
                if close_res.get("success"):
                    liquidated_positions.append(pos_id)

    return {
        "liquidated_count": len(liquidated_positions),
        "liquidated_positions": liquidated_positions
    }


def process_pending_trading_orders(user_id):
    """Process marketable limit orders and triggered stop orders for the current user.
    This keeps the Futures page complete without exposing any frontend/dev execute button.
    """
    # 1. Process margin deficit or price crossing liquidations
    process_liquidations(user_id)

    # 2. Process TP/SL orders
    protection_result = process_open_position_protection_orders(user_id)
    open_orders = get_user_open_orders(user_id)

    processed_orders = []
    skipped_orders = []
    failed_orders = []

    for order in open_orders:
        order_id = str(order.get("_id"))
        order_type = str(order.get("order_type") or "").lower()
        status = str(order.get("status") or "").lower()

        should_execute = False
        reason = "Order not executable at current market price."
        remark = "Order executed by backend futures engine."

        if status == "open" and order_type in ["limit", "stop_limit"]:
            match_result = check_limit_order_match(order)
            if not match_result.get("success"):
                failed_orders.append({
                    "order_id": order_id,
                    "symbol": order.get("symbol"),
                    "reason": match_result.get("message"),
                    "errors": match_result.get("errors", {})
                })
                continue

            should_execute = bool(match_result.get("triggered"))
            reason = "Limit price not reached."
            remark = "Limit order matched by backend futures engine."

        elif status == "pending_trigger" and order_type in ["stop_market", "stop_limit"]:
            trigger_result = check_stop_order_trigger(order)
            if not trigger_result.get("success"):
                failed_orders.append({
                    "order_id": order_id,
                    "symbol": order.get("symbol"),
                    "reason": trigger_result.get("message"),
                    "errors": trigger_result.get("errors", {})
                })
                continue

            if not trigger_result.get("triggered"):
                skipped_orders.append({
                    "order_id": order_id,
                    "symbol": order.get("symbol"),
                    "side": order.get("side"),
                    "order_type": order_type,
                    "reason": "Stop trigger price not reached.",
                    "current_price": trigger_result.get("current_price"),
                    "stop_price": trigger_result.get("stop_price"),
                    "rule": trigger_result.get("rule")
                })
                continue

            if order_type == "stop_limit":
                limit_match = check_limit_order_match(order)
                if not limit_match.get("success"):
                    failed_orders.append({
                        "order_id": order_id,
                        "symbol": order.get("symbol"),
                        "reason": limit_match.get("message"),
                        "errors": limit_match.get("errors", {})
                    })
                    continue

                if not limit_match.get("triggered"):
                    update_order(order_id, {
                        "status": "open",
                        "remark": "Stop price triggered. Converted to open limit order."
                    })
                    skipped_orders.append({
                        "order_id": order_id,
                        "symbol": order.get("symbol"),
                        "side": order.get("side"),
                        "order_type": order_type,
                        "reason": "Stop triggered; waiting for limit price."
                    })
                    continue

            should_execute = True
            remark = "Stop order triggered and executed by backend futures engine."

        if not should_execute:
            skipped_orders.append({
                "order_id": order_id,
                "symbol": order.get("symbol"),
                "side": order.get("side"),
                "order_type": order_type,
                "reason": reason
            })
            continue

        execution_result = execute_order_internal(
            user_id=user_id,
            order_id=order_id,
            remark=remark
        )

        if execution_result["success"]:
            processed_orders.append(execution_result["data"])
        else:
            failed_orders.append({
                "order_id": order_id,
                "symbol": order.get("symbol"),
                "reason": execution_result.get("message"),
                "errors": execution_result.get("errors", {})
            })

    return {
        "success": True,
        "message": "Pending futures order processing completed.",
        "data": {
            "processed_count": len(processed_orders),
            "skipped_count": len(skipped_orders),
            "failed_count": len(failed_orders),
            "processed_orders": processed_orders,
            "skipped_orders": skipped_orders,
            "failed_orders": failed_orders,
            "position_protection": protection_result
        },
        "status_code": 200
    }


def process_stop_triggers_for_development(user_id):
    if settings.APP_ENV != "development":
        return {
            "success": False,
            "message": "Development stop trigger processing is not allowed in production.",
            "errors": {
                "environment": settings.APP_ENV
            },
            "status_code": 403
        }

    return process_pending_trading_orders(user_id)

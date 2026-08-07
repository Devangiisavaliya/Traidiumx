import re
from uuid import uuid4

from config.settings import settings

from services.fee_service import calculate_platform_charge
from services.trading_plan_service import require_internal_trading_ready, reconcile_user_plan
from services.wallet_service import (
    debit_available_wallet,
    ensure_user_wallet,
    lock_wallet_amount,
    release_locked_amount,
    settle_position_margin,
    credit_admin_profit_wallet,
)

from models.options_model import (
    create_option_fill,
    create_option_order,
    create_option_position,
    find_option_order_by_id,
    find_option_position_by_id,
    format_option_fill,
    format_option_fills,
    format_option_order,
    format_option_orders,
    format_option_position,
    format_option_positions,
    get_user_conditional_option_orders,
    get_user_open_option_orders,
    get_user_open_option_positions,
    get_user_option_fills,
    get_user_option_orders,
    update_option_order,
    update_option_position,
)
from models.wallet_model import format_wallet
from utils.date_helper import now_utc


ALLOWED_UNDERLYINGS = {"BTC", "ETH", "SOL"}
ALLOWED_ACTIONS = {"BUY", "SELL"}
ALLOWED_OPTION_SIDES = {"CALL", "PUT"}
ALLOWED_ORDER_TYPES = {"MARKET", "LIMIT", "STOP_LIMIT"}
MAX_OPTION_QUANTITY = 10000
MIN_OPTION_PRICE = 0.01
OPTION_TAKER_FEE_RATE = 0.0004
SHORT_OPTION_MARGIN_MULTIPLIER = 2.0
CONTRACT_RE = re.compile(r"^(BTC|ETH|SOL)-(\d+(?:\.\d+)?)-([0-9]{2}[A-Z]{3})-(CE|PE)$")


def _result(success, message, data=None, errors=None, status_code=200):
    return {
        "success": success,
        "message": message,
        "data": data or {},
        "errors": errors or {},
        "status_code": status_code,
    }


def _float(value, default=0.0):
    try:
        parsed = float(value)
        return parsed if parsed == parsed else default
    except (TypeError, ValueError):
        return default


def _int(value, default=0):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _reference(prefix):
    return f"{prefix}-{uuid4().hex[:14].upper()}"


def _calculate_trading_fee(notional_value):
    charge_config = calculate_platform_charge(notional_value, "options")
    return charge_config, round(_float(charge_config.get("platform_fee_usdt"), 0.0), 8)


def _debit_trading_fee(user_id, amount, reference_id, description):
    amount = round(_float(amount), 8)
    if amount <= 0:
        return {"success": True, "message": "No trading fee configured.", "wallet": ensure_user_wallet(user_id)}

    return debit_available_wallet(
        user_id=user_id,
        amount=amount,
        transaction_type="trading_fee_debit",
        reference_id=reference_id,
        description=description,
    )


def _format_wallet_service_result(result):
    """Keep wallet-service results JSON-safe for API responses."""
    if not isinstance(result, dict):
        return None

    formatted = {
        "success": bool(result.get("success")),
        "message": result.get("message", ""),
    }

    for key in ("settlement_amount", "realized_pnl", "charged", "reason", "reference_id"):
        if key in result:
            formatted[key] = result.get(key)

    if result.get("wallet") is not None:
        formatted["wallet"] = format_wallet(result.get("wallet"))

    return formatted


def _contract_errors(contract, underlying, option_side, strike, expiry_code):
    errors = {}
    match = CONTRACT_RE.match(str(contract or ""))

    if not match:
        errors["contract"] = "Contract format must be UNDERLYING-STRIKE-EXPIRY-CE/PE, for example BTC-65000-28JUN-CE."
        return errors

    contract_underlying, contract_strike, contract_expiry, contract_type = match.groups()
    expected_type = "CE" if option_side == "CALL" else "PE"

    if contract_underlying != underlying:
        errors["contract_underlying"] = "Contract underlying and selected underlying do not match."

    if expected_type != contract_type:
        errors["contract_type"] = "Contract type and selected option side do not match."

    if expiry_code and contract_expiry != expiry_code:
        errors["contract_expiry"] = "Contract expiry and selected expiry do not match."

    if abs(_float(contract_strike, 0.0) - _float(strike, 0.0)) > 0.000001:
        errors["contract_strike"] = "Contract strike and selected strike do not match."

    return errors


def _required_margin(action, notional):
    # BUY options lock premium. SELL/short options are riskier, so this internal
    # engine locks conservative collateral until a full broker risk engine is attached.
    if action == "SELL":
        return round(max(notional * SHORT_OPTION_MARGIN_MULTIPLIER, notional), 8)

    return round(notional, 8)


def _should_fill_order(action, order_type, price, best_bid, best_ask):
    if order_type == "MARKET":
        return True

    if order_type == "STOP_LIMIT":
        return False

    if action == "BUY":
        return price >= best_ask > 0

    return price <= best_bid if best_bid > 0 else False


def _merge_or_create_position(user_id, order):
    # IMPORTANT: Options positions are NOT averaged/merged.
    # Every filled option order creates a separate position lot so the user/admin can
    # see the exact entry price, quantity, margin and close price for that trade.
    qty = _int(order["quantity"], 0)
    price = _float(order["price"], 0.0)
    cost = round(price * qty, 4)
    locked_cost = _float(order.get("wallet_lock_amount"), cost)

    position_id = create_option_position({
        "position_reference": _reference("OPT-POS"),
        "entry_order_id": str(order.get("_id")),
        "entry_order_reference": order.get("order_reference"),
        "user_id": str(user_id),
        "contract": order["contract"],
        "underlying": order["underlying"],
        "action": order["action"],
        "option_side": order["option_side"],
        "strike": order["strike"],
        "expiry_code": order.get("expiry_code"),
        "quantity": qty,
        "entry_price": price,
        "entry_notional_value": cost,
        "margin_amount": locked_cost,
        "wallet_locked_amount": locked_cost,
        "status": "open",
        "opened_at": now_utc(),
        "source": order.get("source") or "traidiumx_backend_options_terminal",
    })

    return find_option_position_by_id(str(position_id))


def place_option_order(user_id, data):
    trading_restriction = require_internal_trading_ready(user_id)
    if trading_restriction:
        return trading_restriction

    underlying = str(data.get("underlying", "")).upper().strip()
    action = str(data.get("action", "")).upper().strip()
    option_side = str(data.get("option_side", data.get("side", ""))).upper().strip()
    order_type = str(data.get("order_type", "LIMIT")).upper().strip()
    contract = str(data.get("contract", "")).upper().strip()
    expiry_code = str(data.get("expiry_code", "")).upper().strip()

    strike = _float(data.get("strike"), 0.0)
    quantity = _int(data.get("quantity", data.get("qty")), 0)
    price = _float(data.get("price", data.get("limit_price")), 0.0)
    best_bid = _float(data.get("best_bid"), price)
    best_ask = _float(data.get("best_ask"), price)
    mark_price = _float(data.get("mark_price"), price)
    stop_price = _float(data.get("stop_price"), 0.0)
    take_profit = _float(data.get("take_profit"), 0.0)
    stop_loss = _float(data.get("stop_loss"), 0.0)
    source = str(data.get("source", "traidiumx_backend_options_terminal")).strip() or "traidiumx_backend_options_terminal"

    errors = {}

    if underlying not in ALLOWED_UNDERLYINGS:
        errors["underlying"] = "Only BTC, ETH and SOL options are supported in this phase."

    if action not in ALLOWED_ACTIONS:
        errors["action"] = "Action must be BUY or SELL."

    if option_side not in ALLOWED_OPTION_SIDES:
        errors["option_side"] = "Option side must be CALL or PUT."

    if order_type not in ALLOWED_ORDER_TYPES:
        errors["order_type"] = "Order type must be MARKET, LIMIT, or STOP_LIMIT."

    if not contract:
        errors["contract"] = "Option contract is required."

    if strike <= 0:
        errors["strike"] = "Strike price must be greater than 0."

    if quantity <= 0:
        errors["quantity"] = "Quantity must be greater than 0."
    elif quantity > MAX_OPTION_QUANTITY:
        errors["quantity"] = f"Quantity cannot be greater than {MAX_OPTION_QUANTITY} contracts per order."

    if price < MIN_OPTION_PRICE:
        errors["price"] = f"Order price must be at least {MIN_OPTION_PRICE} USDT."

    if best_bid < 0 or best_ask < 0 or mark_price < 0:
        errors["market_price"] = "Market bid, ask and mark price cannot be negative."

    if best_bid > 0 and best_ask > 0 and best_bid > best_ask:
        errors["market_spread"] = "Best bid cannot be greater than best ask."

    if order_type == "STOP_LIMIT" and stop_price <= 0:
        errors["stop_price"] = "Stop price is required for Stop Limit orders."

    if take_profit < 0 or stop_loss < 0:
        errors["bracket"] = "Take Profit and Stop Loss cannot be negative."

    if contract:
        errors.update(_contract_errors(contract, underlying, option_side, strike, expiry_code))

    if errors:
        return _result(False, "Options order validation failed.", errors=errors, status_code=422)

    notional = round(price * quantity, 8)
    required_margin = _required_margin(action, notional)

    if required_margin <= 0:
        return _result(False, "Options margin calculation failed.", errors={"margin": "Required margin must be greater than zero."}, status_code=422)

    if required_margin > float(settings.MAX_ORDER_NOTIONAL):
        return _result(
            False,
            "Options order exceeds maximum allowed notional.",
            data={"required_margin": required_margin, "max_order_notional": settings.MAX_ORDER_NOTIONAL},
            errors={"risk": f"Maximum allowed order margin is {settings.MAX_ORDER_NOTIONAL} USDT."},
            status_code=422,
        )

    order_reference = _reference("OPT-ORD")
    wallet = ensure_user_wallet(user_id)
    available_balance = _float(wallet.get("available_balance"), 0.0)
    platform_charge, platform_fee = _calculate_trading_fee(notional)
    required_available = round(required_margin + platform_fee, 8)

    if required_available > available_balance:
        return _result(
            False,
            "Insufficient wallet balance for options order.",
            data={
                "required_margin": required_margin,
                "platform_fee": platform_fee,
                "required_available": required_available,
                "available_balance": available_balance,
            },
            errors={
                "wallet": f"Required {required_available} USDT including trading fee, available {available_balance} USDT."
            },
            status_code=422,
        )

    terminal_instant_fill = (
        source in {"traidiumx_options_terminal_company_ready", "traidiumx_backend_options_terminal"}
        and order_type in {"MARKET", "LIMIT"}
    )
    should_fill = terminal_instant_fill or _should_fill_order(action, order_type, price, best_bid, best_ask)
    status = "filled" if should_fill else ("pending_trigger" if order_type == "STOP_LIMIT" else "open")
    quantity_filled = quantity if should_fill else 0

    # Company-ready internal ledger handling:
    # - Trading state is stored only in backend/MongoDB.
    # - Browser localStorage is never used for orders, fills or positions.
    # - Required premium/collateral is locked before order creation.
    lock_result = lock_wallet_amount(
        user_id=user_id,
        amount=required_margin,
        transaction_type="option_order_margin_locked",
        reference_id=order_reference,
        description=f"Locked {required_margin} USDT for {action} {contract} option order.",
        currency="USDT"
    )

    if not lock_result.get("success"):
        return _result(
            False,
            "Insufficient wallet balance for options order.",
            data={
                "required_margin": required_margin,
                "available_balance": available_balance,
            },
            errors={
                "wallet": lock_result.get("message", "Wallet lock failed.")
            },
            status_code=422,
        )

    wallet_after_lock = lock_result.get("wallet") or ensure_user_wallet(user_id)

    order_id = create_option_order({
        "order_reference": order_reference,
        "user_id": str(user_id),
        "contract": contract,
        "underlying": underlying,
        "action": action,
        "option_side": option_side,
        "order_type": order_type,
        "strike": strike,
        "expiry_code": expiry_code,
        "price": price,
        "best_bid": best_bid,
        "best_ask": best_ask,
        "mark_price": mark_price,
        "quantity": quantity,
        "notional_value": notional,
        "wallet_lock_amount": required_margin,
        "wallet_lock_status": "locked",
        "platform_fee": platform_fee,
        "trading_fee": platform_fee,
        "platform_fee_status": "pending_execution" if platform_fee > 0 else "not_applicable",
        "trading_fee_status": "pending_execution" if platform_fee > 0 else "not_applicable",
        "platform_fee_config": platform_charge,
        "trading_fee_config": platform_charge,
        "status": status,
        "purpose": "open",
        "stop_price": stop_price,
        "take_profit": take_profit,
        "stop_loss": stop_loss,
        "filled_quantity": quantity_filled,
        "average_fill_price": price if should_fill else 0.0,
        "source": "traidiumx_internal_options_engine",
        "client_source": source,
        "risk_mode": "conservative_collateral" if action == "SELL" else "premium_locked",
        "remark": "TraidiumX internal options engine order. Attach broker/provider adapter before enabling external live execution.",
    })

    order = find_option_order_by_id(str(order_id))
    position = None
    fill = None

    if should_fill:
        if platform_fee > 0:
            fee_result = _debit_trading_fee(
                user_id=user_id,
                amount=platform_fee,
                reference_id=str(order_id),
                description=f"Trading fee for options {action} order {order_reference}"
            )

            if not fee_result.get("success"):
                release_locked_amount(
                    user_id=user_id,
                    amount=required_margin,
                    transaction_type="option_order_margin_released",
                    reference_id=order_reference,
                    description=f"Released locked margin after trading fee failure for {contract}."
                )
                update_option_order(str(order_id), {
                    "status": "failed",
                    "wallet_lock_status": "released",
                    "platform_fee_status": "failed",
                    "remark": fee_result.get("message", "Trading fee debit failed."),
                })
                return _result(
                    False,
                    fee_result.get("message", "Unable to debit trading fee."),
                    errors={"platform_fee": fee_result.get("message", "Trading fee debit failed.")},
                    status_code=422,
                )

            order = update_option_order(str(order_id), {
                "platform_fee": platform_fee,
                "trading_fee": platform_fee,
                "platform_fee_status": "charged",
                "trading_fee_status": "charged",
                "platform_fee_charged": True,
                "platform_fee_charged_at": now_utc(),
                "trading_fee_charged": True,
                "trading_fee_charged_at": now_utc(),
                "platform_fee_config": platform_charge,
                "trading_fee_config": platform_charge,
            })

            try:
                credit_admin_profit_wallet(
                    amount=platform_fee,
                    transaction_type="options_entry_trading_fee_credit",
                    reference_id=str(order_id),
                    description=f"Entry trading fee for options {action} order {order_reference}",
                )
                # Distribute referral commission if applicable
                try:
                    from services.referral_service import distribute_referral_commission
                    distribute_referral_commission(
                        referred_user_id=str(user_id),
                        fee_amount=platform_fee,
                        reference_id=str(order_id),
                        description=f"Options order entry fee"
                    )
                except Exception as ref_err:
                    print(f"Error distributing referral commission for options order {order_id}: {ref_err}")
            except Exception as error:
                print(f"Warning: admin options entry-fee credit failed for order {order_id}: {error}")

        position = _merge_or_create_position(user_id, order)
        fill_id = create_option_fill({
            "fill_reference": _reference("OPT-FILL"),
            "order_id": str(order_id),
            "position_id": str(position["_id"]) if position else None,
            "user_id": str(user_id),
            "contract": contract,
            "underlying": underlying,
            "action": action,
            "option_side": option_side,
            "price": price,
            "quantity": quantity,
            "fee": platform_fee,
            "fee_type": "trading_fee" if platform_fee > 0 else "none",
            "source": "traidiumx_internal_options_engine",
            "client_source": source,
        })
        fill = get_user_option_fills(user_id, 1)[0]

    return _result(
        True,
        "Options order filled successfully." if should_fill else "Options order placed successfully.",
        data={
            "order": format_option_order(order),
            "position": format_option_position(position) if position else None,
            "fill": format_option_fill(fill) if fill else None,
            "wallet": format_wallet(ensure_user_wallet(user_id)),
            "wallet_balance_after": format_wallet(ensure_user_wallet(user_id)),
            "locked_amount": required_margin,
            "required_margin": required_margin,
            "notional_value": notional,
            "platform_fee": platform_fee,
            "trading_fee": platform_fee,
            "platform_charge": platform_charge,
            "trading_fee_config": platform_charge,
        },
        status_code=201,
    )


def get_option_order_history(user_id):
    orders = get_user_option_orders(user_id)
    return _result(True, "Options order history fetched successfully.", data={"orders": format_option_orders(orders)})


def get_option_open_orders(user_id):
    orders = get_user_open_option_orders(user_id)
    return _result(True, "Options open orders fetched successfully.", data={"orders": format_option_orders(orders)})


def get_option_conditional_orders(user_id):
    orders = get_user_conditional_option_orders(user_id)
    return _result(True, "Options conditional orders fetched successfully.", data={"orders": format_option_orders(orders)})


def get_option_positions(user_id):
    positions = get_user_open_option_positions(user_id)
    return _result(True, "Options positions fetched successfully.", data={"positions": format_option_positions(positions)})


def get_option_fills(user_id):
    fills = get_user_option_fills(user_id)
    return _result(True, "Options fills fetched successfully.", data={"fills": format_option_fills(fills)})


def cancel_option_order(user_id, order_id):
    order = find_option_order_by_id(order_id)

    if not order or str(order.get("user_id")) != str(user_id):
        return _result(False, "Options order not found.", errors={"order_id": "Invalid order id."}, status_code=404)

    if order.get("status") not in ["open", "pending_trigger"]:
        return _result(False, "Only open options orders can be cancelled.", errors={"status": order.get("status")}, status_code=422)

    locked_amount = _float(order.get("wallet_lock_amount"), 0.0)
    if locked_amount > 0 and order.get("wallet_lock_status") == "locked":
        release_result = release_locked_amount(
            user_id=user_id,
            amount=locked_amount,
            transaction_type="option_order_margin_released",
            reference_id=order.get("order_reference") or order_id,
            description=f"Released locked margin for cancelled option order {order.get('contract')}."
        )

        if not release_result.get("success"):
            return _result(
                False,
                "Option order could not be cancelled because wallet margin release failed.",
                errors={"wallet": release_result.get("message", "Wallet release failed.")},
                status_code=422,
            )

    updated = update_option_order(order_id, {
        "status": "cancelled",
        "wallet_lock_status": "released" if locked_amount > 0 else order.get("wallet_lock_status"),
        "cancelled_at": now_utc(),
    })

    return _result(True, "Options order cancelled successfully.", data={
        "order": format_option_order(updated),
        "wallet": format_wallet(ensure_user_wallet(user_id)),
        "wallet_balance_after": format_wallet(ensure_user_wallet(user_id)),
        "released_amount": locked_amount,
    })


def close_option_position(user_id, position_id, data=None):
    position = find_option_position_by_id(position_id)

    if not position or str(position.get("user_id")) != str(user_id):
        return _result(False, "Options position not found.", errors={"position_id": "Invalid position id."}, status_code=404)

    if position.get("status") != "open":
        if position.get("status") == "closed":
            wallet = format_wallet(ensure_user_wallet(user_id))
            return _result(True, "Options position already closed.", data={
                "position": format_option_position(position),
                "already_closed": True,
                "wallet": wallet,
                "wallet_balance_after": wallet,
            })

        return _result(False, "Only open positions can be closed.", errors={"status": position.get("status")}, status_code=422)

    data = data or {}
    qty = _int(position.get("quantity"), 0)
    entry_price = _float(position.get("entry_price"), 0.0)
    close_price = _float(data.get("mark_price", data.get("close_price")), entry_price)
    direction = 1 if position.get("action") == "BUY" else -1
    gross_realized_pnl = round((close_price - entry_price) * qty * direction, 4)
    close_notional = round(close_price * qty, 8)
    exit_fee_config, exit_trading_fee = _calculate_trading_fee(close_notional)
    locked_amount = _float(position.get("wallet_locked_amount"), 0.0)
    settlement_result = None

    projected_settlement = max(round(locked_amount + gross_realized_pnl, 8), 0.0)
    available_before_close = _float(ensure_user_wallet(user_id).get("available_balance"), 0.0)
    if exit_trading_fee > 0 and round(available_before_close + projected_settlement, 8) < exit_trading_fee:
        return _result(
            False,
            "Insufficient available balance for options exit trading fee.",
            errors={"trading_fee": f"Required {exit_trading_fee} USDT exit trading fee."},
            status_code=422,
        )

    if locked_amount > 0:
        settlement_result = settle_position_margin(
            user_id=user_id,
            margin_amount=locked_amount,
            realized_pnl=gross_realized_pnl,
            reference_id=str(position_id),
            description=f"Settled option position {position.get('contract')} at {close_price}.",
            currency="USDT"
        )

        if not settlement_result.get("success"):
            return _result(
                False,
                "Options position could not be closed because wallet settlement failed.",
                errors={"wallet": settlement_result.get("message", "Wallet settlement failed.")},
                status_code=422,
            )

    fee_result = _debit_trading_fee(
        user_id=user_id,
        amount=exit_trading_fee,
        reference_id=str(position_id),
        description=f"Exit trading fee for options position {position.get('contract')} {position_id}.",
    )
    if not fee_result.get("success"):
        return _result(
            False,
            fee_result.get("message", "Unable to debit options exit trading fee."),
            errors={"trading_fee": fee_result.get("message", "Options exit trading fee debit failed.")},
            status_code=422,
        )

    net_realized_pnl = round(gross_realized_pnl - exit_trading_fee, 8)

    if exit_trading_fee > 0:
        try:
            credit_admin_profit_wallet(
                amount=exit_trading_fee,
                transaction_type="options_exit_trading_fee_credit",
                reference_id=str(position_id),
                description=f"Exit trading fee for options position {position.get('contract')} {position_id}.",
            )
            # Distribute referral commission if applicable
            try:
                from services.referral_service import distribute_referral_commission
                distribute_referral_commission(
                    referred_user_id=str(user_id),
                    fee_amount=exit_trading_fee,
                    reference_id=str(position_id),
                    description=f"Options position close fee"
                )
            except Exception as ref_err:
                print(f"Error distributing referral commission for options exit position {position_id}: {ref_err}")
        except Exception as error:
            print(f"Warning: admin options exit-fee credit failed for position {position_id}: {error}")

    updated = update_option_position(position_id, {
        "status": "closed",
        "close_price": close_price,
        "realized_pnl": net_realized_pnl,
        "gross_realized_pnl": gross_realized_pnl,
        "net_realized_pnl": net_realized_pnl,
        "exit_trading_fee": exit_trading_fee,
        "exit_trading_fee_config": exit_fee_config,
        "wallet_settlement_status": "settled" if locked_amount > 0 else "legacy_no_locked_margin",
        "closed_at": now_utc(),
    })

    create_option_fill({
        "fill_reference": _reference("OPT-CLOSE"),
        "order_id": None,
        "position_id": str(position_id),
        "user_id": str(user_id),
        "contract": position.get("contract"),
        "underlying": position.get("underlying"),
        "action": "CLOSE",
        "option_side": position.get("option_side"),
        "price": close_price,
        "quantity": qty,
        "fee": exit_trading_fee,
        "fee_type": "trading_fee" if exit_trading_fee > 0 else "none",
        "gross_realized_pnl": gross_realized_pnl,
        "realized_pnl": net_realized_pnl,
        "net_realized_pnl": net_realized_pnl,
        "source": "traidiumx_backend_options_terminal",
    })

    return _result(True, "Options position closed successfully.", data={
        "position": format_option_position(updated),
        "gross_realized_pnl": gross_realized_pnl,
        "exit_trading_fee": exit_trading_fee,
        "realized_pnl": net_realized_pnl,
        "net_realized_pnl": net_realized_pnl,
        "wallet_settlement": _format_wallet_service_result(settlement_result),
        "wallet": format_wallet(ensure_user_wallet(user_id)),
        "wallet_balance_after": format_wallet(ensure_user_wallet(user_id)),
    })


def close_all_option_positions(user_id, data=None):
    data = data or {}
    marks = data.get("marks") if isinstance(data.get("marks"), dict) else {}
    positions = get_user_open_option_positions(user_id)

    if not positions:
        return _result(True, "No open option positions to close.", data={
            "closed_count": 0,
            "positions": [],
            "wallet": format_wallet(ensure_user_wallet(user_id)),
            "wallet_balance_after": format_wallet(ensure_user_wallet(user_id)),
        })

    closed_positions = []
    failures = []

    for position in positions:
        position_id = str(position.get("_id"))
        close_price = _float(marks.get(position_id), _float(position.get("entry_price"), 0.0))
        result = close_option_position(user_id, position_id, {"mark_price": close_price})

        if result.get("success"):
            closed = (result.get("data") or {}).get("position")
            if closed:
                closed_positions.append(closed)
        else:
            failures.append({
                "position_id": position_id,
                "message": result.get("message"),
                "errors": result.get("errors"),
            })

    if failures and not closed_positions:
        return _result(False, "Option positions could not be closed.", data={"failures": failures}, errors={"positions": failures}, status_code=422)

    return _result(True, "Option positions closed successfully.", data={
        "closed_count": len(closed_positions),
        "positions": closed_positions,
        "failures": failures,
        "wallet": format_wallet(ensure_user_wallet(user_id)),
        "wallet_balance_after": format_wallet(ensure_user_wallet(user_id)),
    })

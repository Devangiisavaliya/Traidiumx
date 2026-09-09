from flask import Blueprint, g, request

from middleware.auth_middleware import auth_required
from services.futures_recent_symbol_service import (
    get_user_recent_futures_symbols,
    record_user_recent_futures_symbol,
    remove_user_recent_futures_symbol,
)
from services.trading_service import (
    cancel_trading_order,
    close_all_trading_positions,
    close_trading_position,
    execute_order_for_development,
    get_trading_open_orders,
    get_trading_order_history,
    get_trading_pnl_summary,
    get_trading_positions,
    get_trading_trades,
    place_trading_order,
    process_stop_triggers_for_development,
    process_pending_trading_orders,
    update_position_protection,
    get_trading_risk_summary
)
from utils.response import success_response, error_response


trading_api = Blueprint("trading_api", __name__, url_prefix="/api/trading")


@trading_api.get("/recent-symbols")
@auth_required
def recent_symbols():
    result = get_user_recent_futures_symbols(g.current_user_id)

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )


@trading_api.post("/recent-symbols")
@auth_required
def record_recent_symbol():
    data = request.get_json(silent=True) or {}
    result = record_user_recent_futures_symbol(g.current_user_id, data)

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"]
    )


@trading_api.delete("/recent-symbols")
@auth_required
def delete_recent_symbol():
    data = request.get_json(silent=True) or {}
    symbol = data.get("symbol")

    if not symbol:
        return error_response(
            message="Symbol is required.",
            status_code=400
        )

    result = remove_user_recent_futures_symbol(g.current_user_id, symbol)

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )


@trading_api.post("/order")
@auth_required
def order():
    try:
        data = request.get_json(silent=True) or {}

        result = place_trading_order(g.current_user_id, data)

        if result.get("success"):
            return success_response(
                message=result.get("message", "Order placed successfully."),
                data=result.get("data", {}),
                status_code=result.get("status_code", 201)
            )

        return error_response(
            message=result.get("message", "Unable to place order."),
            errors=result.get("errors", {}),
            status_code=result.get("status_code", 400)
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error_response(
            message=f"Order processing error: {str(e)}",
            errors={"execution": str(e)},
            status_code=500
        )


@trading_api.get("/orders")
@auth_required
def orders():
    result = get_trading_order_history(g.current_user_id)

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )


@trading_api.get("/open-orders")
@auth_required
def open_orders():
    result = get_trading_open_orders(g.current_user_id)

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )


@trading_api.post("/cancel/<order_id>")
@auth_required
def cancel(order_id):
    result = cancel_trading_order(g.current_user_id, order_id)

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result["errors"],
        status_code=result["status_code"]
    )


@trading_api.post("/dev-execute/<order_id>")
@auth_required
def dev_execute(order_id):
    result = execute_order_for_development(g.current_user_id, order_id)

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result["errors"],
        status_code=result["status_code"]
    )


@trading_api.get("/positions")
@auth_required
def positions():
    result = get_trading_positions(g.current_user_id)

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )


@trading_api.get("/trades")
@auth_required
def trades():
    result = get_trading_trades(g.current_user_id)

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )


@trading_api.get("/pnl-summary")
@auth_required
def pnl_summary():
    result = get_trading_pnl_summary(g.current_user_id)

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )


@trading_api.post("/close-position/<position_id>")
@auth_required
def close_position(position_id):
    data = request.get_json(silent=True) or {}
    result = close_trading_position(
        g.current_user_id,
        position_id,
        close_reason=data.get("reason", "manual"),
    )

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result["errors"],
        status_code=result["status_code"]
    )


@trading_api.post("/close-all-positions")
@auth_required
def close_all_positions():
    data = request.get_json(silent=True) or {}
    result = close_all_trading_positions(
        g.current_user_id,
        close_reason=data.get("reason", "manual"),
    )

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"]
    )


@trading_api.patch("/positions/<position_id>/tp-sl")
@auth_required
def update_tp_sl(position_id):
    data = request.get_json(silent=True) or {}
    result = update_position_protection(g.current_user_id, position_id, data)

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"]
    )

@trading_api.post("/process-pending-orders")
@auth_required
def process_pending_orders():
    result = process_pending_trading_orders(g.current_user_id)

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result["errors"],
        status_code=result["status_code"]
    )


@trading_api.post("/dev-process-stop-triggers")
@auth_required
def dev_process_stop_triggers():
    result = process_stop_triggers_for_development(g.current_user_id)

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result["errors"],
        status_code=result["status_code"]
    )
@trading_api.get("/risk-summary")
@auth_required
def risk_summary():
    result = get_trading_risk_summary(g.current_user_id)

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )
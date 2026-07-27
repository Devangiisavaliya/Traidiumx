from flask import Blueprint, g, request

from middleware.auth_middleware import auth_required
from services.options_service import (
    cancel_option_order,
    close_option_position,
    close_all_option_positions,
    get_option_conditional_orders,
    get_option_fills,
    get_option_open_orders,
    get_option_order_history,
    get_option_positions,
    place_option_order,
)
from utils.response import success_response, error_response


options_api = Blueprint("options_api", __name__, url_prefix="/api/options")


def _send(result):
    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"],
        )

    return error_response(
        message=result["message"],
        errors=result["errors"],
        status_code=result["status_code"],
    )


def _safe_send(callback, fallback_message="Options request failed."):
    """Return JSON even when Flask debug mode would otherwise show an HTML error page."""
    try:
        return _send(callback())
    except Exception as error:
        return error_response(
            message=fallback_message,
            errors={
                "server": str(error) or "Unexpected server error.",
                "hint": "Check backend terminal logs for the full traceback."
            },
            status_code=500,
        )


@options_api.post("/order")
@auth_required
def order():
    data = request.get_json(silent=True) or {}
    return _safe_send(
        lambda: place_option_order(g.current_user_id, data),
        "Options order failed."
    )


@options_api.get("/orders")
@auth_required
def orders():
    return _send(get_option_order_history(g.current_user_id))


@options_api.get("/open-orders")
@auth_required
def open_orders():
    return _send(get_option_open_orders(g.current_user_id))


@options_api.get("/conditional-orders")
@auth_required
def conditional_orders():
    return _send(get_option_conditional_orders(g.current_user_id))


@options_api.get("/positions")
@auth_required
def positions():
    return _send(get_option_positions(g.current_user_id))


@options_api.get("/fills")
@auth_required
def fills():
    return _send(get_option_fills(g.current_user_id))


@options_api.post("/cancel/<order_id>")
@auth_required
def cancel(order_id):
    return _safe_send(
        lambda: cancel_option_order(g.current_user_id, order_id),
        "Options order cancel failed."
    )


@options_api.post("/close-position/<position_id>")
@auth_required
def close_position(position_id):
    data = request.get_json(silent=True) or {}
    return _safe_send(
        lambda: close_option_position(g.current_user_id, position_id, data),
        "Options position close failed."
    )


@options_api.post("/close-all-positions")
@auth_required
def close_all_positions():
    data = request.get_json(silent=True) or {}
    return _safe_send(
        lambda: close_all_option_positions(g.current_user_id, data),
        "Options close all positions failed."
    )

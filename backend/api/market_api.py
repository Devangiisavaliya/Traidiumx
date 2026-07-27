from flask import Blueprint

from config.settings import settings
from services.market_service import (
    get_market_board,
    get_market_symbols,
    get_symbol_orderbook,
    get_symbol_recent_trades,
    get_symbol_ticker,
    seed_default_market_symbols
)
from utils.response import success_response, error_response


market_api = Blueprint("market_api", __name__, url_prefix="/api/market")


def run_seed_symbols():
    if settings.APP_ENV != "development":
        return error_response(
            message="Market symbol seed is allowed only in development mode.",
            errors={
                "environment": settings.APP_ENV
            },
            status_code=403
        )

    result = seed_default_market_symbols()

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )


@market_api.post("/seed-symbols")
def seed_symbols_post():
    return run_seed_symbols()


@market_api.get("/seed-symbols")
def seed_symbols_get_for_development():
    return run_seed_symbols()




@market_api.get("/board")
def board():
    result = get_market_board()

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


@market_api.get("/symbols")
def symbols():
    result = get_market_symbols()

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"]
    )


@market_api.get("/ticker/<symbol>")
def ticker(symbol):
    result = get_symbol_ticker(symbol)

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


@market_api.get("/orderbook/<symbol>")
def orderbook(symbol):
    result = get_symbol_orderbook(symbol)

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


@market_api.get("/trades/<symbol>")
def trades(symbol):
    result = get_symbol_recent_trades(symbol)

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

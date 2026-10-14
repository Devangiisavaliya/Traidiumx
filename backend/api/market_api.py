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


@market_api.get("/research")
def market_research():
    from services.market_research_service import get_live_market_research_articles
    articles = get_live_market_research_articles()
    return success_response(
        message="Live market research articles fetched successfully.",
        data={"articles": articles}
    )


@market_api.get("/research/<article_id>")
def market_research_detail(article_id):
    from services.market_research_service import get_market_research_by_id
    article = get_market_research_by_id(article_id)
    if not article:
        return error_response(
            message="Research article not found.",
            status_code=404
        )
    return success_response(
        message="Research article fetched successfully.",
        data={"article": article}
    )


@market_api.get("/news")
def market_news():
    from services.market_news_service import get_live_market_news
    news_items = get_live_market_news()
    return success_response(
        message="Live market news fetched successfully.",
        data={"news": news_items}
    )


@market_api.get("/events")
def market_events():
    from services.market_events_service import get_live_upcoming_events
    events = get_live_upcoming_events()
    return success_response(
        message="Live upcoming events fetched successfully.",
        data={"events": events}
    )



from flask import Blueprint, request

from services.blog_service import (
    get_blog_categories,
    get_blog_post,
    get_blog_posts,
    subscribe_blog_newsletter,
)
from utils.response import success_response, error_response


blog_api = Blueprint("blog_api", __name__, url_prefix="/api/blog")


@blog_api.get("/posts")
def posts():
    featured_param = request.args.get("featured")
    featured = None

    if featured_param is not None:
        featured = str(featured_param).lower() in ["1", "true", "yes"]

    result = get_blog_posts(
        category=request.args.get("category"),
        search=request.args.get("search"),
        sort=request.args.get("sort", "latest"),
        limit=request.args.get("limit", 50),
        featured=featured,
    )

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"],
        )

    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"],
    )


@blog_api.get("/posts/<slug>")
def post_details(slug):
    increment_view = str(request.args.get("increment_view", "true")).lower() not in ["0", "false", "no"]
    result = get_blog_post(slug, increment_view=increment_view)

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"],
        )

    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"],
    )


@blog_api.get("/categories")
def categories():
    result = get_blog_categories()

    return success_response(
        message=result["message"],
        data=result["data"],
        status_code=result["status_code"],
    )


@blog_api.post("/newsletter")
def newsletter():
    payload = request.get_json(silent=True) or {}
    result = subscribe_blog_newsletter(
        email=payload.get("email"),
        source=payload.get("source", "blog"),
    )

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"],
        )

    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"],
    )

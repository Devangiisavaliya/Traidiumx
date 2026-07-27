from bson import ObjectId

from config.database import get_database
from utils.date_helper import now_utc


def get_blog_posts_collection():
    db = get_database()
    return db.blog_posts


def get_blog_subscribers_collection():
    db = get_database()
    return db.blog_subscribers


def upsert_blog_post(post_data):
    slug = str(post_data.get("slug", "")).strip().lower()

    if not slug:
        raise ValueError("Blog slug is required.")

    post_data["slug"] = slug
    post_data["updated_at"] = now_utc()

    get_blog_posts_collection().update_one(
        {"slug": slug},
        {
            "$setOnInsert": {
                **post_data,
                "views": int(post_data.get("views", 0)),
                "created_at": now_utc(),
            }
        },
        upsert=True,
    )

    return get_blog_posts_collection().find_one({"slug": slug})


def find_blog_post_by_slug(slug):
    return get_blog_posts_collection().find_one({
        "slug": str(slug or "").strip().lower(),
        "status": "published",
    })


def list_published_blog_posts(query=None, sort=None, limit=50):
    query = query or {"status": "published"}
    sort = sort or [("published_at", -1), ("sort_order", 1)]

    cursor = get_blog_posts_collection().find(query).sort(sort).limit(int(limit))
    return list(cursor)


def increment_blog_views(slug):
    get_blog_posts_collection().update_one(
        {"slug": str(slug or "").strip().lower(), "status": "published"},
        {"$inc": {"views": 1}, "$set": {"updated_at": now_utc()}},
    )


def upsert_blog_subscriber(email, source="blog"):
    normalized_email = str(email or "").strip().lower()

    get_blog_subscribers_collection().update_one(
        {"email": normalized_email},
        {
            "$set": {
                "email": normalized_email,
                "source": source or "blog",
                "status": "active",
                "updated_at": now_utc(),
            },
            "$setOnInsert": {
                "created_at": now_utc(),
            },
        },
        upsert=True,
    )

    return get_blog_subscribers_collection().find_one({"email": normalized_email})


def format_blog_post(post, include_content=False):
    if not post:
        return None

    published_at = post.get("published_at")

    formatted = {
        "id": str(post.get("_id")) if isinstance(post.get("_id"), ObjectId) else str(post.get("_id", "")),
        "slug": post.get("slug", ""),
        "title": post.get("title", ""),
        "category": post.get("category", "Education"),
        "date": post.get("date_label") or (published_at.strftime("%d %b %Y") if published_at else ""),
        "author": post.get("author", "TraidiumX Research"),
        "readTime": post.get("read_time", "5 min read"),
        "views": int(post.get("views", 0)),
        "featured": bool(post.get("featured", False)),
        "tags": post.get("tags", []),
        "excerpt": post.get("excerpt", ""),
        "source": "backend",
        "status": post.get("status", "published"),
        "published_at": published_at.isoformat() if published_at else None,
        "updated_at": post.get("updated_at").isoformat() if post.get("updated_at") else None,
    }

    if include_content:
        formatted["content"] = post.get("content", [])

    return formatted


def format_blog_posts(posts, include_content=False):
    return [format_blog_post(post, include_content=include_content) for post in posts]

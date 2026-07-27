import re
from datetime import datetime, timezone

from models.blog_model import (
    find_blog_post_by_slug,
    format_blog_post,
    format_blog_posts,
    get_blog_posts_collection,
    increment_blog_views,
    list_published_blog_posts,
    upsert_blog_post,
    upsert_blog_subscriber,
)


EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
ALLOWED_SORTS = {"latest", "popular", "short"}


DEFAULT_BLOG_POSTS = [
    {
        "slug": "futures-trading-basics",
        "title": "Futures Trading Basics for New Crypto Traders",
        "category": "Futures",
        "date_label": "22 Jun 2026",
        "published_at": datetime(2026, 6, 22, 9, 0, tzinfo=timezone.utc),
        "author": "TraidiumX Research",
        "read_time": "6 min read",
        "read_minutes": 6,
        "views": 18420,
        "featured": True,
        "tags": ["Futures", "Leverage", "Margin"],
        "excerpt": "Understand leverage, margin, liquidation and risk before placing your first futures trade.",
        "content": [
            "Crypto futures allow traders to take long or short exposure without directly holding the underlying asset. This makes futures powerful, but also risky when leverage is used carelessly.",
            "Leverage increases position size using margin. For example, with 10x leverage, a small margin can control a much larger position. This can increase profit potential, but losses can also move quickly.",
            "Liquidation risk is the most important concept for new futures traders. If margin becomes insufficient, the position can be force-closed. A strong risk plan should include position sizing, stop loss, and avoiding excessive leverage.",
            "Before real trading, beginners should understand mark price, index price, funding rate, margin mode, order type and position management.",
        ],
        "status": "published",
        "sort_order": 1,
    },
    {
        "slug": "options-chain-explained",
        "title": "Options Chain Explained: Calls, Puts and Strike Prices",
        "category": "Options",
        "date_label": "20 Jun 2026",
        "published_at": datetime(2026, 6, 20, 9, 0, tzinfo=timezone.utc),
        "author": "TraidiumX Academy",
        "read_time": "8 min read",
        "read_minutes": 8,
        "views": 15200,
        "featured": False,
        "tags": ["Options", "Call", "Put"],
        "excerpt": "Learn how to read an options chain, compare premiums and understand strike prices.",
        "content": [
            "An options chain shows available call and put contracts for different strike prices and expiry dates.",
            "A call option gives exposure to upside movement, while a put option gives exposure to downside movement. The premium is the price paid for the option contract.",
            "Important fields in an options chain include strike price, LTP, implied volatility, volume, open interest and option Greeks.",
            "Beginners should avoid buying random out-of-the-money options without understanding time decay and volatility risk.",
        ],
        "status": "published",
        "sort_order": 2,
    },
    {
        "slug": "risk-management-rules",
        "title": "7 Risk Management Rules Every Trader Should Follow",
        "category": "Risk",
        "date_label": "18 Jun 2026",
        "published_at": datetime(2026, 6, 18, 9, 0, tzinfo=timezone.utc),
        "author": "TraidiumX Desk",
        "read_time": "5 min read",
        "read_minutes": 5,
        "views": 21390,
        "featured": False,
        "tags": ["Risk", "Trading Plan", "Discipline"],
        "excerpt": "A practical checklist for controlling losses and protecting trading capital.",
        "content": [
            "Risk management is the foundation of long-term trading survival. Strategy matters, but capital protection matters more.",
            "A trader should define maximum risk per trade before entering the position. Many disciplined traders keep risk small relative to total capital.",
            "Stop loss, position size and leverage should be decided before the trade, not after emotional pressure begins.",
            "Journaling trades helps identify repeated mistakes and improve decision-making over time.",
        ],
        "status": "published",
        "sort_order": 3,
    },
    {
        "slug": "maker-vs-taker-fees",
        "title": "Maker vs Taker Fees: What Traders Need to Know",
        "category": "Fees",
        "date_label": "15 Jun 2026",
        "published_at": datetime(2026, 6, 15, 9, 0, tzinfo=timezone.utc),
        "author": "TraidiumX Support",
        "read_time": "4 min read",
        "read_minutes": 4,
        "views": 9800,
        "featured": False,
        "tags": ["Fees", "Maker", "Taker"],
        "excerpt": "Understand why different order types can have different fee rates.",
        "content": [
            "Maker and taker fees depend on how an order interacts with the order book.",
            "A maker order adds liquidity to the order book. A taker order removes liquidity by matching immediately with existing orders.",
            "Trading platforms often charge different fees for maker and taker orders. This encourages liquidity and improves market depth.",
            "For active traders, understanding fee impact is important because small fee differences can become meaningful at high volume.",
        ],
        "status": "published",
        "sort_order": 4,
    },
    {
        "slug": "funding-rate-guide",
        "title": "Funding Rate Guide for Perpetual Futures",
        "category": "Futures",
        "date_label": "12 Jun 2026",
        "published_at": datetime(2026, 6, 12, 9, 0, tzinfo=timezone.utc),
        "author": "TraidiumX Research",
        "read_time": "7 min read",
        "read_minutes": 7,
        "views": 12670,
        "featured": False,
        "tags": ["Funding", "Perpetual", "Futures"],
        "excerpt": "Learn why funding rates exist and how they affect long and short positions.",
        "content": [
            "Perpetual futures do not have a fixed expiry date, so funding rates help keep futures price close to the spot index price.",
            "Depending on market conditions, longs may pay shorts or shorts may pay longs at scheduled funding intervals.",
            "Funding rate is not the same as trading fee. It is a periodic payment between traders.",
            "Ignoring funding can reduce profitability, especially for high leverage or long-duration positions.",
        ],
        "status": "published",
        "sort_order": 5,
    },
    {
        "slug": "kyc-security-practices",
        "title": "Security and KYC Practices for Crypto Platforms",
        "category": "Security",
        "date_label": "10 Jun 2026",
        "published_at": datetime(2026, 6, 10, 9, 0, tzinfo=timezone.utc),
        "author": "TraidiumX Compliance",
        "read_time": "6 min read",
        "read_minutes": 6,
        "views": 8900,
        "featured": False,
        "tags": ["Security", "KYC", "Compliance"],
        "excerpt": "Why account security, KYC and AML checks matter for responsible trading platforms.",
        "content": [
            "Security and compliance are core requirements for any responsible crypto platform.",
            "KYC helps verify user identity and reduce misuse of financial services. AML checks help detect suspicious activity.",
            "Users should protect accounts with strong passwords, two-factor authentication and safe device practices.",
            "A production platform should include backend validation, audit logs, transaction monitoring and secure authentication.",
        ],
        "status": "published",
        "sort_order": 6,
    },
]


def ensure_default_blog_posts():
    collection = get_blog_posts_collection()

    created = 0
    for post in DEFAULT_BLOG_POSTS:
        existing = collection.find_one({"slug": post["slug"]})
        if not existing:
            upsert_blog_post(post.copy())
            created += 1

    return created


def _build_posts_query(category=None, search=None, featured=None):
    query = {"status": "published"}

    if category and str(category).strip().lower() != "all":
        query["category"] = str(category).strip()

    if featured is not None:
        query["featured"] = bool(featured)

    if search:
        safe_search = str(search).strip()
        if safe_search:
            query["$or"] = [
                {"title": {"$regex": safe_search, "$options": "i"}},
                {"excerpt": {"$regex": safe_search, "$options": "i"}},
                {"category": {"$regex": safe_search, "$options": "i"}},
                {"tags": {"$regex": safe_search, "$options": "i"}},
                {"author": {"$regex": safe_search, "$options": "i"}},
            ]

    return query


def _build_sort(sort_key):
    sort_key = sort_key if sort_key in ALLOWED_SORTS else "latest"

    if sort_key == "popular":
        return [("views", -1), ("published_at", -1)]

    if sort_key == "short":
        return [("read_minutes", 1), ("published_at", -1)]

    return [("published_at", -1), ("sort_order", 1)]


def get_blog_posts(category=None, search=None, sort="latest", limit=50, featured=None):
    ensure_default_blog_posts()

    try:
        limit = max(1, min(int(limit), 100))
    except (TypeError, ValueError):
        limit = 50

    query = _build_posts_query(category=category, search=search, featured=featured)
    posts = list_published_blog_posts(
        query=query,
        sort=_build_sort(sort),
        limit=limit,
    )

    categories = get_blog_categories()["data"]["categories"]

    return {
        "success": True,
        "message": "Blog posts fetched successfully.",
        "status_code": 200,
        "data": {
            "posts": format_blog_posts(posts),
            "count": len(posts),
            "categories": categories,
            "source": "MongoDB blog_posts",
        },
    }


def get_blog_post(slug, increment_view=True):
    ensure_default_blog_posts()

    post = find_blog_post_by_slug(slug)

    if not post:
        return {
            "success": False,
            "message": "Blog article not found.",
            "status_code": 404,
            "errors": {"slug": "No published blog article exists for this slug."},
        }

    if increment_view:
        increment_blog_views(slug)
        post = find_blog_post_by_slug(slug) or post

    related = get_related_blog_posts(post)

    return {
        "success": True,
        "message": "Blog article fetched successfully.",
        "status_code": 200,
        "data": {
            "post": format_blog_post(post, include_content=True),
            "related_posts": format_blog_posts(related),
            "source": "MongoDB blog_posts",
        },
    }


def get_related_blog_posts(current_post):
    query = {
        "status": "published",
        "slug": {"$ne": current_post.get("slug")},
        "$or": [
            {"category": current_post.get("category")},
            {"tags": {"$in": current_post.get("tags", [])}},
        ],
    }

    related = list_published_blog_posts(query=query, sort=[("published_at", -1)], limit=3)

    if related:
        return related

    return list_published_blog_posts(
        query={"status": "published", "slug": {"$ne": current_post.get("slug")}},
        sort=[("published_at", -1)],
        limit=3,
    )


def get_blog_categories():
    ensure_default_blog_posts()

    categories = []
    collection = get_blog_posts_collection()

    pipeline = [
        {"$match": {"status": "published"}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]

    total_count = collection.count_documents({"status": "published"})
    categories.append({"name": "All", "count": total_count})

    for item in collection.aggregate(pipeline):
        categories.append({"name": item.get("_id"), "count": item.get("count", 0)})

    tags = collection.distinct("tags", {"status": "published"})

    return {
        "success": True,
        "message": "Blog categories fetched successfully.",
        "status_code": 200,
        "data": {
            "categories": categories,
            "tags": sorted([tag for tag in tags if tag]),
        },
    }


def subscribe_blog_newsletter(email, source="blog"):
    normalized_email = str(email or "").strip().lower()

    if not normalized_email:
        return {
            "success": False,
            "message": "Email address is required.",
            "status_code": 422,
            "errors": {"email": "Please enter your email address."},
        }

    if not EMAIL_PATTERN.match(normalized_email):
        return {
            "success": False,
            "message": "Invalid email address.",
            "status_code": 422,
            "errors": {"email": "Please enter a valid email address."},
        }

    subscriber = upsert_blog_subscriber(normalized_email, source=source or "blog")

    return {
        "success": True,
        "message": "Newsletter subscription saved successfully.",
        "status_code": 200,
        "data": {
            "email": subscriber.get("email"),
            "status": subscriber.get("status", "active"),
        },
    }

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
        "excerpt": "Understand leverage, margin modes, liquidation risk, and essential order types before placing your first futures trade.",
        "content": [
            "1. Introduction to Crypto Futures: Crypto futures allow traders to speculate on the future price movements of assets like BTC, ETH, and SOL without physically holding the underlying tokens. On TraidiumX, you can take Long positions to profit from rising markets or Short positions to capitalize on market downtrends.",
            "2. How Leverage and Margin Work: Leverage allows you to open a position much larger than your collateral (Margin). For instance, with 10x leverage, a $100 initial margin controls a $1,000 position. While leverage accelerates potential profits, losses multiply at the exact same rate, making discipline critical.",
            "3. Isolated vs. Cross Margin Modes: TraidiumX supports both Isolated Margin (where risk is strictly confined to the margin assigned to that single trade) and Cross Margin (where your entire available futures balance is pooled to prevent early liquidation across multiple open trades).",
            "4. Liquidation Risk & Fair Mark Price: If the market moves against your position and your margin drops below the Maintenance Margin rate, liquidation is triggered. TraidiumX uses a weighted Mark Price index (sourced from top global spot exchanges) rather than the volatile Last Traded Price to protect traders against market manipulation and sudden wick liquidations.",
            "5. Core Order Types for Beginners: Successful traders rely on Limit Orders (for precise execution prices), Market Orders (for instant fills), and mandatory Stop-Loss / Take-Profit Orders to automate exits and control downside risk."
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
        "excerpt": "Learn how to read the options chain matrix, evaluate Call & Put premiums, strike prices, and key Option Greeks.",
        "content": [
            "1. What is an Options Chain?: An Options Chain is a live matrix displaying all available Call and Put options contracts for an underlying cryptocurrency across various expiration dates and strike prices, providing immediate insight into market liquidity and trader positioning.",
            "2. Calls vs. Puts Fundamentals: A Call Option grants the buyer the right (not obligation) to buy the asset at the Strike Price before expiration, while a Put Option grants the right to sell. Buyers pay a fixed upfront Premium, capping their maximum risk to the premium paid.",
            "3. Understanding Strike Moneyness: Strike prices are categorized into At-The-Money (ATM, strike closest to current spot price), In-The-Money (ITM, contracts possessing intrinsic value), and Out-Of-The-Money (OTM, contracts driven purely by time value and probability).",
            "4. Demystifying Option Greeks: TraidiumX provides real-time Greeks — Delta (price sensitivity relative to spot), Gamma (acceleration of Delta), Theta (daily time decay of premium), and Vega (sensitivity to changes in Implied Volatility).",
            "5. Open Interest (OI) & Max Pain: Tracking Open Interest across strikes highlights major institutional support and resistance zones. High call OI often acts as overhead resistance, while heavy put OI marks key market floors."
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
        "read_time": "7 min read",
        "read_minutes": 7,
        "views": 21390,
        "featured": False,
        "tags": ["Risk", "Trading Plan", "Discipline"],
        "excerpt": "A practical 7-rule checklist for controlling portfolio drawdown, managing leverage, and protecting trading capital.",
        "content": [
            "Rule 1: Stick to the 1% - 2% Capital Risk Rule — Never risk more than 1% to 2% of your total account balance on any single trade. If your account holds $10,000, your maximum dollar loss on a stopped-out position should never exceed $100 to $200.",
            "Rule 2: Always Set a Hard Stop-Loss Before Entry — Enter every trade with an automated stop-loss order placed directly in the engine. Mental stop-losses frequently fail during rapid market swings and emotionally charged moments.",
            "Rule 3: Keep Leverage Conservative (Under 10x) — Ultra-high leverage (such as 50x or 100x) reduces your liquidation buffer to less than 1-2%, guaranteeing liquidation from normal market volatility. Sustainable traders protect capital with modest leverage.",
            "Rule 4: Maintain a Minimum 1:2 Risk-to-Reward Ratio — Ensure that your expected profit target is at least twice the distance of your stop-loss. With a 1:2 R:R ratio, you remain profitable even with a 40% win rate.",
            "Rule 5: Strictly Eliminate Revenge Trading and FOMO — Experiencing losses is an unavoidable part of trading. Attempting to immediately win back losses by opening impulsive, oversized positions is the primary reason trader accounts get wiped out.",
            "Rule 6: Diversify Portfolio & Avoid Single-Asset Concentration — Never allocate all your trading capital into one coin or speculative contract. Balance your exposure across spot assets, stablecoins, and diversified derivative pairs.",
            "Rule 7: Maintain an Active Trade Journal — Document your trade entries, technical reasons, emotions, leverage, and outcomes. Systematically reviewing past trades turns costly mistakes into repeatable profitable habits."
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
        "read_time": "5 min read",
        "read_minutes": 5,
        "views": 9800,
        "featured": False,
        "tags": ["Fees", "Maker", "Taker"],
        "excerpt": "Understand how limit and market orders impact order book liquidity, exchange fee schedules, and trading profitability.",
        "content": [
            "1. Liquidity and the Central Order Book: Every trade on TraidiumX interacts with the order book in one of two roles: either as a Maker providing liquidity or as a Taker removing liquidity. The fee schedule differs based on which role your order takes.",
            "2. Maker Orders (Liquidity Providers): When you place a Limit Order that does not immediately match against existing bids or asks, it sits on the order book, creating market depth. TraidiumX rewards Makers with significantly lower transaction fee rates.",
            "3. Taker Orders (Liquidity Consumers): When you place a Market Order or aggressive Limit Order that matches instantly against resting orders, you consume liquidity from the book. Because you receive immediate execution, Takers pay standard taker fees.",
            "4. Leverage Multiplies Fee Impact: Fees are charged on the total notional trade value (Margin × Leverage), not just your initial margin. For example, a $1,000 margin position at 10x leverage incurs trading fees on the full $10,000 position upon entry and exit.",
            "5. Optimizing Fees on TraidiumX: Traders can reduce transaction costs by using 'Post-Only' order flags to ensure Maker status, maintaining 30-day trading volume to unlock VIP tier discounts, and leveraging promotional fee rebate programs."
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
        "excerpt": "Learn why funding rates exist in perpetual contracts, how 8-hour settlement intervals work, and how funding impacts positions.",
        "content": [
            "1. Why Perpetual Swaps Need Funding Rates: Traditional futures have set expiry dates where prices converge to spot. Perpetual futures never expire, so the Funding Rate mechanism continuously anchors the perpetual contract price to the underlying spot index price.",
            "2. Peer-to-Peer Settlement Mechanism: Funding payments are transferred directly between Long and Short traders. TraidiumX collects zero fee from funding payments; it serves purely as an economic balancing mechanism.",
            "3. Positive vs. Negative Funding Rates: When bullish sentiment pushes futures above spot, the funding rate is Positive, meaning Longs pay Shorts. When bearish sentiment pushes futures below spot, the funding rate is Negative, meaning Shorts pay Longs.",
            "4. The 8-Hour Settlement Schedule: On TraidiumX, funding settlements occur every 8 hours (at 00:00, 08:00, and 16:00 UTC). Traders only pay or receive funding if they hold open positions at the exact timestamp of settlement.",
            "5. Delta-Neutral Funding Arbitrage: Advanced traders capitalize on high positive funding rates by holding spot crypto while holding an equivalent 1x Short perpetual position, generating passive yield without directional price risk."
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
        "excerpt": "Why multi-signature cold storage, automated AML transaction monitoring, and tiered KYC safeguard crypto platforms.",
        "content": [
            "1. Defense-in-Depth Security Philosophy: TraidiumX implements institutional-grade cybersecurity architecture combined with strict Anti-Money Laundering (AML) and Know Your Customer (KYC) regulatory compliance to safeguard user funds and data.",
            "2. Tiered KYC Verification: Tier 1 verification enables basic trading and withdrawals using government-approved ID (such as PAN, Aadhaar, or Passport). Tier 2 unlocks elevated fiat limits and institutional features through proof of address and source-of-wealth validation.",
            "3. Cold Wallet Storage & Multi-Sig Vaults: Over 95% of digital assets are secured in air-gapped, multi-signature Cold Storage vaults protected by geographically distributed hardware security modules (HSMs). Hot wallets maintain only the necessary liquidity for daily withdrawals.",
            "4. Essential Account Security Measures: Users are protected with mandatory TOTP Two-Factor Authentication (2FA via Google Authenticator or hardware security keys), withdrawal address whitelisting with 24-hour lockout safeguards, and unique Anti-Phishing codes on all platform communications.",
            "5. On-Chain AML Monitoring: Advanced transaction surveillance systems scan deposits and withdrawals in real time against global sanctions lists, darknet mixers, and illicit wallet networks in compliance with international FATF and FIU standards."
        ],
        "status": "published",
        "sort_order": 6,
    },
]


def ensure_default_blog_posts():
    collection = get_blog_posts_collection()

    created = 0
    for post in DEFAULT_BLOG_POSTS:
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

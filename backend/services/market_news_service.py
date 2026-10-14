import hashlib
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import re
import requests


# In-memory cache for live news
_NEWS_CACHE = {
    "timestamp": 0,
    "news": []
}
CACHE_TTL_SECONDS = 300  # 5 minutes

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

NEWS_TOPIC_IMAGES = {
    "crypto": [
        "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&auto=format&fit=crop&q=80"
    ],
    "business": [
        "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&auto=format&fit=crop&q=80"
    ],
    "finance": [
        "https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1200&auto=format&fit=crop&q=80"
    ],
    "markets": [
        "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1516937941344-00b4e0337589?w=1200&auto=format&fit=crop&q=80"
    ],
    "policy": [
        "https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=1200&auto=format&fit=crop&q=80"
    ],
    "opinion": [
        "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&auto=format&fit=crop&q=80"
    ],
    "tech": [
        "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=1200&auto=format&fit=crop&q=80"
    ]
}


def _get_today_formatted():
    now = datetime.now()
    return f"{MONTH_NAMES[now.month - 1]} {now.day}, {now.year}"


def _clean_text(html_text):
    if not html_text:
        return ""
    cleaned = re.sub(r"<[^>]+>", "", html_text)
    cleaned = cleaned.replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", '"').replace("&#039;", "'")
    return " ".join(cleaned.split()).strip()


def _generate_news_id(url, title):
    raw = f"{url}-{title}".encode("utf-8")
    return hashlib.md5(raw).hexdigest()[:16]


def _detect_news_category(title, desc=""):
    t = (title + " " + desc).lower()
    if any(k in t for k in ["sec", "cftc", "prosecutor", "court", "law", "policy", "ruling", "judge", "fincen", "legislation", "regulat", "sanction"]):
        return "Policy"
    if any(k in t for k in ["opinion", "analyst says", "executive says", "viewpoint", "column", "editorial", "perspective"]):
        return "Opinion"
    if any(k in t for k in ["ai", "chip", "nvidia", "hardware", "software", "tech", "semiconductor", "apple", "microsoft", "robot", "cloud"]):
        return "Tech"
    if any(k in t for k in ["bank", "charter", "treasury", "yield", "bond", "liquidity", "fed", "ecb", "deposit", "interest rate"]):
        return "Finance"
    if any(k in t for k in ["etf", "s&p", "nasdaq", "dow", "futures", "liquidation", "rally", "plunge", "bull", "bear", "stock", "shares", "indices", "wti", "oil", "gold"]):
        return "Markets"
    if any(k in t for k in ["merger", "acquisition", "robinhood", "ledger", "startup", "venture", "fundraise", "earnings", "revenue", "ceo", "launch"]):
        return "Business"
    if any(k in t for k in ["bitcoin", "btc", "crypto", "ethereum", "eth", "solana", "xrp", "token", "defi", "web3", "wallet", "ledger", "miner"]):
        return "Crypto"
    return "Markets"


def get_curated_fallback_news():
    today = _get_today_formatted()
    return [
        {
            "id": "crypto-wall-street-wealth",
            "category": "Crypto",
            "date": today,
            "title": "Wall Street wealth creation model is unsustainable for most participants: Report",
            "summary": "Early Wall Street wealth-creation opportunities remain inaccessible to retail participants, driving decentralized liquidity growth.",
            "body": "Early Wall Street wealth-creation opportunities remain inaccessible to retail participants, but blockchain infrastructure and transparent decentralized exchange systems are rebalancing capital access across global market participants.",
            "publisher": "Cointelegraph",
            "image": "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&auto=format&fit=crop&q=80",
            "url": "https://cointelegraph.com/news/wall-street-wealth-creation-unsustainable-hyperliquid-ceo"
        },
        {
            "id": "policy-bitcoin-fog-ruling",
            "category": "Policy",
            "date": today,
            "title": "Prosecutors Cite Bitcoin Fog Ruling Against Roman Storm's Venue Challenge",
            "summary": "The Tornado Cash founder hit back in a tweet, noting FinCEN withdrew a proposed mixer rule over legal scope challenges.",
            "body": "The Tornado Cash founder hit back in a tweet, noting FinCEN withdrew a proposed mixer rule over legal scope challenges. Crypto defense attorneys argue code authorship should not be conflated with money transmission liability.",
            "publisher": "Cointelegraph",
            "image": "https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=1200&auto=format&fit=crop&q=80",
            "url": "https://cointelegraph.com/news/roman-storm-bitcoin-fog-doj-acquittal-bid"
        },
        {
            "id": "crypto-old-money-bitcoin-hands",
            "category": "Crypto",
            "date": today,
            "title": "'Old money' has stronger Bitcoin 'diamond hands,' says BingX exec",
            "summary": "BingX strategy chief Kevin Lee says wealthy investors are taking a longer-term approach to spot crypto holdings.",
            "body": "BingX strategy chief Kevin Lee says wealthy family offices and sovereign allocators are taking a longer-term approach to spot Bitcoin accumulations rather than reacting to short-term cyclical volatility.",
            "publisher": "Cointelegraph",
            "image": "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=1200&auto=format&fit=crop&q=80",
            "url": "https://cointelegraph.com/news/bingx-old-money-bitcoin-diamond-hands-token2049"
        },
        {
            "id": "markets-crypto-liquidations-550m",
            "category": "Markets",
            "date": today,
            "title": "Crypto liquidations hit $550M as Bitcoin price dips below $84K support",
            "summary": "Bitcoin fell 2.3% in two hours amid suspicion over the appearance of leveraged BTC short positions across perpetual markets.",
            "body": "Bitcoin fell 2.3% in two hours amid suspicion over the appearance of leveraged BTC short positions on derivative exchanges, causing cascade liquidations across long contracts before finding bid support.",
            "publisher": "Cointelegraph",
            "image": "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80",
            "url": "https://cointelegraph.com/markets/crypto-liquidations-hit-550m-as-bitcoin-price-dips-below-84k"
        },
        {
            "id": "finance-us-dollar-price-forecast",
            "category": "Finance",
            "date": today,
            "title": "US Dollar Price Forecast: Fed Minutes Loom, Can GBP/USD and EUR/USD Recover?",
            "summary": "The US dollar index consolidates near key resistance levels as market participants await FOMC meeting minutes for interest rate guidance.",
            "body": "The US dollar index consolidates near key resistance levels as market participants await FOMC meeting minutes for interest rate guidance, with currency traders assessing whether European counterparts can mount a technical recovery.",
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=1200&auto=format&fit=crop&q=80",
            "url": "https://www.fxempire.com/forecasts/article/us-dollar-price-forecast-fed-minutes-loom-can-gbp-usd-and-eur-usd-recover-1636162"
        },
        {
            "id": "markets-bitcoin-etf-119m-inflow",
            "category": "Markets",
            "date": today,
            "title": "Bitcoin ETFs rebound with $119M inflow as Ether extends losses",
            "summary": "Bitcoin ETFs returned to net inflows with $119 million on Tuesday despite falling prices, while Ether funds recorded mild outflows.",
            "body": "Bitcoin ETFs returned to net inflows with $119 million on Tuesday despite falling prices, while Ether funds recorded mild outflows. Institutional appetite remains concentrated in primary benchmark assets.",
            "publisher": "Cointelegraph",
            "image": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80",
            "url": "https://cointelegraph.com/markets/bitcoin-etf-rebound-119m-inflow-ether-extend-losses"
        },
        {
            "id": "business-trump-wlfi-usd1-payments",
            "category": "Business",
            "date": today,
            "title": "Trump-Backed WLFI Plans USD1 Payments for Online Businesses",
            "summary": "World Liberty Financial outlines integration roadmap to support USD1 digital asset settlement across enterprise e-commerce merchants.",
            "body": "World Liberty Financial outlines integration roadmap to support USD1 digital asset settlement across enterprise e-commerce merchants, enabling frictionless merchant processing without traditional payment rails.",
            "publisher": "Cointelegraph",
            "image": "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1200&auto=format&fit=crop&q=80",
            "url": "https://cointelegraph.com/news/trump-backed-wlfi-plans-usd1-payments-for-online-businesses"
        },
        {
            "id": "business-zcash-price-warning-pullback",
            "category": "Business",
            "date": today,
            "title": "Zcash Price Warning: Technicals Point to Potential 30% Pullback",
            "summary": "Zcash momentum faces key technical resistance as derivative open interest cools across major cryptocurrency exchanges.",
            "body": "Zcash momentum faces key technical resistance as derivative open interest cools across major cryptocurrency exchanges, signaling potential consolidation toward key multi-week Fibonacci retracement bands.",
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&auto=format&fit=crop&q=80",
            "url": "https://www.fxempire.com/forecasts/article/zec-price-warning-technicals-point-to-potential-30-zcash-pullback-1636299"
        },
        {
            "id": "tech-first-light-stocks-rally",
            "category": "Tech",
            "date": today,
            "title": "First Light News: Stocks Rally as Bond Bears Dig In",
            "summary": "Equities push higher into new session highs while fixed-income yields stabilize following central bank communications.",
            "body": "Equities push higher into new session highs while fixed-income yields stabilize following central bank communications, with technology and semiconductor equities leading broader exchange benchmark advances.",
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80",
            "url": "https://www.fxempire.com/forecasts/article/first-light-news-stocks-rally-as-bond-bears-dig-in-1636194"
        },
        {
            "id": "opinion-currencies-commodities-gold-ratios",
            "category": "Opinion",
            "date": today,
            "title": "From Currencies to Commodities: Leveraging Gold Ratios in Trading",
            "summary": "Historical commodity ratio models provide quantitative frameworks for macro portfolio balancing across precious metals.",
            "body": "Historical commodity ratio models provide quantitative frameworks for macro portfolio balancing across precious metals, helping traders navigate fluctuating yield curves and foreign exchange parity shifts.",
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1200&auto=format&fit=crop&q=80",
            "url": "https://www.fxempire.com/forecasts/article/from-currencies-to-commodities-leveraging-gold-ratios-in-trading-1635882"
        },
        {
            "id": "policy-russia-first-crypto-platforms",
            "category": "Policy",
            "date": today,
            "title": "Russia's First Crypto Platforms Register Under New Digital Assets Law",
            "summary": "National regulators approve inaugural domestic cryptocurrency infrastructure providers under recently ratified framework.",
            "body": "National regulators approve inaugural domestic cryptocurrency infrastructure providers under recently ratified framework, formalizing institutional trading channels and cross-border settlement protocols.",
            "publisher": "Cointelegraph",
            "image": "https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=1200&auto=format&fit=crop&q=80",
            "url": "https://cointelegraph.com/news/russia-first-crypto-platforms-register-new-law"
        },
        {
            "id": "tech-bitmine-layer1-hardcap",
            "category": "Tech",
            "date": today,
            "title": "Bitmine Proposes 5% Supply Hard Cap Standard for Layer-1 Networks",
            "summary": "Protocol developers present supply constraint proposal to enhance long-term economic predictability across decentralized networks.",
            "body": "Protocol developers present supply constraint proposal to enhance long-term economic predictability across decentralized networks, establishing cryptographic parameters for emission sustainability.",
            "publisher": "Cointelegraph",
            "image": "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&auto=format&fit=crop&q=80",
            "url": "https://cointelegraph.com/news/bitmine-ether-5-percent-supply-hard-cap"
        }
    ]


def _fetch_rss_feed_news(url, publisher, default_cat=None, limit=20):
    items_out = []
    today = _get_today_formatted()
    try:
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}, timeout=6)
        if resp.status_code == 200:
            root = ET.fromstring(resp.text)
            items = root.findall("./channel/item")
            for idx, item in enumerate(items[:limit]):
                title = (item.find("title").text if item.find("title") is not None else "").strip()
                link = (item.find("link").text if item.find("link") is not None else "").strip()
                desc = (item.find("description").text if item.find("description") is not None else "").strip()

                pub_el = item.find("pubDate")
                pub_dt = None
                if pub_el is not None and pub_el.text:
                    try:
                        pub_dt = parsedate_to_datetime(pub_el.text.strip())
                    except Exception:
                        pub_dt = None

                article_date = f"{MONTH_NAMES[pub_dt.month - 1]} {pub_dt.day}, {pub_dt.year}" if pub_dt is not None else today

                clean_desc = _clean_text(desc)
                if not clean_desc or len(clean_desc) < 15:
                    clean_desc = title

                summary_text = clean_desc[:110] + ("..." if len(clean_desc) > 110 else "")

                cat = default_cat or _detect_news_category(title, clean_desc)
                cat_lower = cat.lower()

                img_list = NEWS_TOPIC_IMAGES.get(cat_lower, NEWS_TOPIC_IMAGES["markets"])
                img = img_list[idx % len(img_list)]
                
                enclosure = item.find("enclosure")
                if enclosure is not None and enclosure.get("url"):
                    img = enclosure.get("url")

                if title and link:
                    items_out.append({
                        "id": _generate_news_id(link, title),
                        "category": cat,
                        "date": article_date,
                        "pub_dt": pub_dt,
                        "title": title,
                        "summary": summary_text,
                        "body": clean_desc,
                        "publisher": publisher,
                        "image": img,
                        "url": link
                    })
    except Exception as e:
        print(f"News RSS warning ({publisher}): {e}")
    return items_out


def get_live_market_news(force_refresh=False):
    global _NEWS_CACHE

    now_ts = time.time()
    if not force_refresh and (now_ts - _NEWS_CACHE["timestamp"]) < CACHE_TTL_SECONDS and len(_NEWS_CACHE["news"]) >= 10:
        return _NEWS_CACHE["news"]

    curated = get_curated_fallback_news()

    # Fetch live feeds across major breaking news publishers
    crypto_news = _fetch_rss_feed_news("https://cointelegraph.com/rss", "Cointelegraph", "Crypto", limit=25)
    yahoo_news1 = _fetch_rss_feed_news("https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,AAPL,MSFT,NVDA,BTC-USD,GC=F", "Yahoo Finance", limit=25)
    yahoo_news2 = _fetch_rss_feed_news("https://feeds.finance.yahoo.com/rss/2.0/headline?s=TSLA,AMZN,GOOGL,META", "Yahoo Finance", limit=20)

    all_live = []
    for l in [crypto_news, yahoo_news1, yahoo_news2]:
        all_live.extend(l)

    # Sort strictly by publication timestamp descending (freshest live articles first)
    min_dt = datetime.min.replace(tzinfo=timezone.utc)
    all_live.sort(key=lambda x: x.get("pub_dt") or min_dt, reverse=True)

    combined = []
    seen_ids = set()

    for item in all_live:
        if item["id"] not in seen_ids:
            seen_ids.add(item["id"])
            combined.append(item)

    # Append curated items as supplemental/fallback
    for item in curated:
        if item["id"] not in seen_ids:
            seen_ids.add(item["id"])
            combined.append(item)

    if not combined:
        combined = curated

    _NEWS_CACHE["news"] = combined
    _NEWS_CACHE["timestamp"] = now_ts
    return combined

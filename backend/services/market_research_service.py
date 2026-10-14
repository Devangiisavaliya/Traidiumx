import hashlib
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import re
import requests


# In-memory cache for live research articles
_RESEARCH_CACHE = {
    "timestamp": 0,
    "articles": []
}
CACHE_TTL_SECONDS = 300  # 5 minutes for super fresh updates

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

FALLBACK_IMAGES = [
    "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1516937941344-00b4e0337589?w=1200&auto=format&fit=crop&q=80"
]


def _get_today_formatted():
    now = datetime.now()
    return f"{MONTH_NAMES[now.month - 1]} {now.day}, {now.year}"


def _clean_text(html_text):
    if not html_text:
        return ""
    cleaned = re.sub(r"<[^>]+>", "", html_text)
    cleaned = cleaned.replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", '"').replace("&#039;", "'")
    return " ".join(cleaned.split()).strip()


def _generate_article_id(url, title):
    raw = f"{url}-{title}".encode("utf-8")
    return hashlib.md5(raw).hexdigest()[:16]


def _detect_asset_class(title, category):
    t = (title + " " + category).lower()
    crypto_kw = ["btc", "bitcoin", "eth", "ether", "crypto", "doge", "xrp", "solana", "sol", "ada", "ton", "bnb", "tether", "usdt", "memecoin", "altcoin", "defi", "blockchain"]
    if any(k in t for k in crypto_kw):
        return "Cryptocurrency"
    return "Global Markets"


def _detect_research_category(title):
    t = title.lower()
    if any(k in t for k in ["technical", "chart", "breakout", "indicator", "moving average", "resistance", "support", "fibonacci", "rsi", "wedge"]):
        return "Technical Analysis"
    if any(k in t for k in ["forecast", "target", "price prediction", "price", "dip", "rally", "surge", "drop", "jump", "eyes", "near", "advance"]):
        return "Price Prediction"
    return "Fundamental"


def get_curated_fallback_articles():
    today = _get_today_formatted()
    return [
        {
            "id": "753d57b3bb6e4e60",
            "slug": "first-light-news-stocks-rally",
            "title": "First Light News: Stocks Rally as Bond Bears Dig In",
            "category": "Price Prediction",
            "assetClass": "Global Markets",
            "date": today,
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80",
            "quote": "US stocks hit fresh records, but Asia lags. Treasury yields sit near 24-year highs, and Ray Dalio warns that mounting sovereign debt could trigger volatility.",
            "body": "US stocks hit fresh records, but Asia lags. Treasury yields sit near 24-year highs, and Ray Dalio warns that mounting sovereign debt could trigger volatility. Institutional traders remain focused on upcoming FOMC policy guidance and sovereign debt yields.",
            "summary": "US stocks hit fresh records, but Asia lags. Treasury yields sit near 24-year highs, and Ray Dalio warns that sovereign debt...",
            "url": "https://www.fxempire.com/forecasts/article/first-light-news-stocks-rally-as-bond-bears-dig-in-1636194",
            "symbol": "📈",
            "symbolBg": "from-purple-950/80 via-indigo-900/40 to-slate-950 text-purple-300"
        },
        {
            "id": "usd-dollar-price-forecast-fed",
            "slug": "us-dollar-price-forecast-fed-minutes",
            "title": "US Dollar Price Forecast: Fed Minutes Loom, Can GBP/USD and EUR/USD Recover?",
            "category": "Price Prediction",
            "assetClass": "Global Markets",
            "date": today,
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=1200&auto=format&fit=crop&q=80",
            "quote": "DXY holds above 101.76 as traders await Fed minutes, while EUR/USD tests 1.1225 and GBP/USD remains under mild bearish pressure.",
            "body": "DXY holds above 101.76 as traders await Fed minutes, while EUR/USD tests 1.1225 and GBP/USD remains under mild bearish pressure. Global foreign exchange pairs reflect heightened sensitivity to upcoming central bank interest rate projections.",
            "summary": "DXY holds above 101.76 as traders await Fed minutes, while EUR/USD tests 1.1225 and GBP/USD remains...",
            "url": "https://www.fxempire.com/forecasts/article/us-dollar-price-forecast-fed-minutes-loom-can-gbp-usd-and-eur-usd-recover-1636162",
            "symbol": "$",
            "symbolBg": "from-emerald-950/80 via-teal-900/40 to-slate-950 text-emerald-300"
        },
        {
            "id": "gold-silver-china-adds",
            "slug": "gold-xauusd-silver-price-forecast-china",
            "title": "Gold (XAUUSD) & Silver Price Forecast: China Adds Gold, Fed Minutes Loom, Will Bulls Hold?",
            "category": "Price Prediction",
            "assetClass": "Global Markets",
            "date": today,
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1200&auto=format&fit=crop&q=80",
            "quote": "China adds to gold reserves for a 23rd month as Fed minutes loom, while XAU/USD holds $4,112 and silver consolidates key weekly pivot levels.",
            "body": "China adds to gold reserves for a 23rd month as Fed minutes loom, while XAU/USD holds $4,112 and silver consolidates key weekly pivot levels. Central bank bullion buying continues to provide structural support against real yields.",
            "summary": "China adds to gold reserves for a 23rd month as Fed minutes loom, while XAU/USD holds $4,112 and silv...",
            "url": "https://www.fxempire.com/forecasts/article/gold-xauusd-silver-price-forecast-china-adds-gold-fed-minutes-loom-will-gold-clear-4190-1636156",
            "symbol": "🥇",
            "symbolBg": "from-amber-950/80 via-yellow-900/40 to-slate-950 text-amber-300"
        },
        {
            "id": "natural-gas-oil-forecast-gulf",
            "slug": "natural-gas-oil-forecast-gulf-storm",
            "title": "Natural Gas and Oil Forecast: Gulf Storm Threatens Supply, Can WTI Break $90.65?",
            "category": "Price Prediction",
            "assetClass": "Global Markets",
            "date": today,
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1516937941344-00b4e0337589?w=1200&auto=format&fit=crop&q=80",
            "quote": "Gulf storm risks and Saudi-Houthi tensions lift oil supply concerns as WTI tests $90.64. Brent eyes potential dynamic breakout above pivotal resistance.",
            "body": "Gulf storm risks and Saudi-Houthi tensions lift oil supply concerns as WTI tests $90.64. Brent eyes potential dynamic breakout above pivotal resistance. Energy markets price in immediate shipping disruptions.",
            "summary": "Gulf storm risks and Saudi-Houthi tensions lift oil supply concerns as WTI tests $90.64, Brent eyes...",
            "url": "https://www.fxempire.com/forecasts/article/natural-gas-and-oil-forecast-gulf-storm-threatens-supply-can-wti-break-90-65-1636149",
            "symbol": "🛢️",
            "symbolBg": "from-rose-950/80 via-amber-950/40 to-slate-950 text-rose-300"
        },
        {
            "id": "gold-price-forecast-xau-fed-minutes",
            "slug": "gold-price-forecast-xauusd-fed-minutes",
            "title": "Gold Price Forecast: XAU/USD eyes Fed Minutes for fresh impetus after holding $4,100",
            "category": "Price Prediction",
            "assetClass": "Global Markets",
            "date": today,
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1200&auto=format&fit=crop&q=80",
            "quote": "Gold is back in the red around $4,150 in Wednesday's Asian trades, reversing the previous session's recovery ahead of the US Fed Minutes release.",
            "body": "Gold is back in the red around $4,150 in Wednesday's Asian trades, reversing the previous session's recovery ahead of the US Fed Minutes release. Traders analyze bond yield momentum.",
            "summary": "Gold is back in the red around $4,150 in Wednesday's Asian trades, reversing the previous...",
            "url": "https://www.fxempire.com/forecasts/article/gold-news-xauusd-slides-as-fed-minutes-and-10-year-auction-test-buyers-1636261",
            "symbol": "🥇",
            "symbolBg": "from-amber-950/80 via-yellow-900/40 to-slate-950 text-amber-300"
        },
        {
            "id": "gold-silver-breakdown-risk",
            "slug": "gold-silver-forecast-breakdown-risk",
            "title": "Gold and Silver Forecast: Breakdown Risk Ahead of Fed Minutes",
            "category": "Price Prediction",
            "assetClass": "Global Markets",
            "date": today,
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&auto=format&fit=crop&q=80",
            "quote": "Gold and silver remain under pressure ahead of the Fed minutes, with gold's $4,100 support and silver's critical moving averages under close technical review.",
            "body": "Gold and silver remain under pressure ahead of the Fed minutes, with gold's $4,100 support and silver's critical moving averages under close technical review.",
            "summary": "Gold and silver remain under pressure ahead of the Fed minutes, with gold's $4,100 support and silver'...",
            "url": "https://www.fxempire.com/forecasts/article/gold-and-silver-forecast-breakdown-risk-ahead-of-fed-minutes-1636134",
            "symbol": "🥈",
            "symbolBg": "from-slate-800 to-slate-950 text-slate-300"
        },
        {
            "id": "gold-price-forecast-4104-support",
            "slug": "gold-price-forecast-4104-support-bears",
            "title": "Gold (XAU/USD) Price Forecast: $4,104 Support Puts Bears on Notice",
            "category": "Price Prediction",
            "assetClass": "Global Markets",
            "date": today,
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1200&auto=format&fit=crop&q=80",
            "quote": "Gold tested key Fibonacci support at $4,103 before recovering, raising the possibility of a short-term bottom if buyers can reclaim the 50-day exponential moving average.",
            "body": "Gold tested key Fibonacci support at $4,103 before recovering, raising the possibility of a short-term bottom if buyers can reclaim the 50-day exponential moving average.",
            "summary": "Gold tested key Fibonacci support at $4,103 before recovering, raising the possibility of a short-term...",
            "url": "https://www.fxempire.com/forecasts/article/gold-xau-usd-price-forecast-4104-support-puts-bears-on-notice-1636084",
            "symbol": "🥇",
            "symbolBg": "from-amber-950/80 via-yellow-900/40 to-slate-950 text-amber-300"
        },
        {
            "id": "wti-crude-oil-88-support",
            "slug": "wti-crude-oil-price-forecast-88-support",
            "title": "WTI Crude Oil Price Forecast: $88.66 Support Signals Potential Pullback Low",
            "category": "Price Prediction",
            "assetClass": "Global Markets",
            "date": today,
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1516937941344-00b4e0337589?w=1200&auto=format&fit=crop&q=80",
            "quote": "WTI crude oil found support near $88.66, with a bullish hammer and rising channel setting up a continuation test toward psychological resistance.",
            "body": "WTI crude oil found support near $88.66, with a bullish hammer and rising channel setting up a continuation test toward psychological resistance.",
            "summary": "WTI crude oil found support near $88.66, with a bullish hammer and rising channel setting up a...",
            "url": "https://www.fxempire.com/forecasts/article/natural-gas-and-oil-forecast-gulf-storm-threatens-supply-can-wti-break-90-65-1636149",
            "symbol": "🛢️",
            "symbolBg": "from-rose-950/80 via-amber-950/40 to-slate-950 text-rose-300"
        },
        {
            "id": "crypto-market-retreated-range",
            "slug": "crypto-market-liquidations-btc",
            "title": "Crypto Liquidations Hit $550M as Bitcoin Price Dips Below $84K",
            "category": "Technical Analysis",
            "assetClass": "Cryptocurrency",
            "date": today,
            "publisher": "Cointelegraph",
            "image": "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=1200&auto=format&fit=crop&q=80",
            "quote": "Bitcoin fell 2.3% in two hours amid suspicion over leveraged BTC short positions across perpetual markets as aggregate crypto market cap tests key support.",
            "body": "Bitcoin fell 2.3% in two hours amid suspicion over leveraged BTC short positions across perpetual markets, causing cascade liquidations across long contracts before finding structural bid support near the 200-day EMA.",
            "summary": "Bitcoin fell 2.3% in two hours amid leveraged short positions as crypto market cap tests support...",
            "url": "https://cointelegraph.com/markets/crypto-liquidations-hit-550m-as-bitcoin-price-dips-below-84k",
            "symbol": "₿",
            "symbolBg": "from-amber-950/80 via-yellow-900/40 to-slate-950 text-amber-300"
        },
        {
            "id": "japanese-yen-nears-158-boj",
            "slug": "japanese-yen-nears-158-analysts",
            "title": "Japanese Yen nears 158.00: Two analysts agree it's bullish, and disagree on how far the breakout goes",
            "category": "Fundamental",
            "assetClass": "Global Markets",
            "date": today,
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1200&auto=format&fit=crop&q=80",
            "quote": "The Japanese Yen (JPY) is drifting near 158.00 against the US Dollar (USD) ahead of a busy week of Japanese data and a still-unclear Bank of Japan (BoJ) timetable.",
            "body": "The Japanese Yen (JPY) is drifting near 158.00 against the US Dollar (USD) ahead of a busy week of Japanese data and a still-unclear Bank of Japan (BoJ) timetable. FX strategists maintain diverging outlooks on Ministry of Finance intervention limits.",
            "summary": "The Japanese Yen (JPY) is drifting near 158.00 against the US Dollar ahead of key Japanese data...",
            "url": "https://www.fxempire.com/forecasts/article/us-dollar-price-forecast-fed-minutes-loom-can-gbp-usd-and-eur-usd-recover-1636162",
            "symbol": "¥",
            "symbolBg": "from-red-950/80 via-slate-900 to-slate-950 text-red-400"
        },
        {
            "id": "dogecoin-price-risks-20-dip-wedge",
            "slug": "dogecoin-price-risks-20-dip-wedge",
            "title": "Dogecoin Price Risks 20% Dip as Memecoin Dominance Hits Record Low",
            "category": "Price Prediction",
            "assetClass": "Cryptocurrency",
            "date": today,
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=1200&auto=format&fit=crop&q=80",
            "quote": "Dogecoin price risks a 20% drop toward $0.076 as a bearish broadening wedge emerges and memecoin dominance drops to a 12-month low relative to Tier-1 Layer 1 assets.",
            "body": "Dogecoin price risks a 20% drop toward $0.076 as a bearish broadening wedge emerges and memecoin dominance drops to a 12-month low relative to Tier-1 Layer 1 assets. Derivatives funding rates show neutral sentiment.",
            "summary": "Dogecoin price risks a 20% drop toward $0.076 as a bearish broadening wedge emerges...",
            "url": "https://www.fxempire.com/forecasts/article/zec-price-warning-technicals-point-to-potential-30-zcash-pullback-1636299",
            "symbol": "Ð",
            "symbolBg": "from-amber-950/80 via-teal-950/60 to-slate-950 text-amber-400"
        },
        {
            "id": "xrp-price-forecast-consolidation",
            "slug": "bitcoin-etf-rebound-ether-losses",
            "title": "Bitcoin ETFs Rebound with $119M Inflow as Ether Extends Losses",
            "category": "Technical Analysis",
            "assetClass": "Cryptocurrency",
            "date": today,
            "publisher": "Cointelegraph",
            "image": "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&auto=format&fit=crop&q=80",
            "quote": "Bitcoin ETFs returned to net positive inflows with $119 million despite macroeconomic chop, setting the stage for institutional support.",
            "body": "Bitcoin ETFs returned to net positive inflows with $119 million despite macroeconomic chop, setting the stage for institutional support across Tier-1 digital assets.",
            "summary": "Bitcoin ETFs returned to net inflows with $119M as institutional allocators expand spot holdings...",
            "url": "https://cointelegraph.com/markets/bitcoin-etf-rebound-119m-inflow-ether-extend-losses",
            "symbol": "✕",
            "symbolBg": "from-blue-950/80 via-slate-900 to-slate-950 text-blue-400"
        },
        {
            "id": "ethereum-price-forecast-3k",
            "slug": "ethereum-price-forecast-3k-focus",
            "title": "Ethereum Price Forecast: 3 Bullish ETH Signals Put $3K Back in Focus",
            "category": "Price Prediction",
            "assetClass": "Cryptocurrency",
            "date": today,
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=1200&auto=format&fit=crop&q=80",
            "quote": "Ethereum rebounds as layer 2 transaction activity surges and open interest across ETH perpetuals reflects aggressive long positioning.",
            "body": "Ethereum rebounds as layer 2 transaction activity surges and open interest across ETH perpetuals reflects aggressive long positioning towards the $3,000 psychological milestone.",
            "summary": "Ethereum rebounds as layer 2 transaction activity surges and open interest reflects aggressive long...",
            "url": "https://www.fxempire.com/forecasts/article/ethereum-price-forecast-3-bullish-eth-signals-put-3k-back-in-focus-1636253",
            "symbol": "Ξ",
            "symbolBg": "from-purple-950/80 via-indigo-900/40 to-slate-950 text-purple-300"
        },
        {
            "id": "sp500-nasdaq-breakout-tech",
            "slug": "sp500-nasdaq-breakout-tech-equities",
            "title": "S&P 500 and Nasdaq Index Forecast: Tech Equities Challenge All-Time Highs",
            "category": "Fundamental",
            "assetClass": "Global Markets",
            "date": today,
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80",
            "quote": "Large-cap tech valuations receive a boost from resilient corporate earnings and AI hardware capital expenditure guidance across cloud hyperscalers.",
            "body": "Large-cap tech valuations receive a boost from resilient corporate earnings and AI hardware capital expenditure guidance across cloud hyperscalers. Breadth metrics demonstrate broad sector participation.",
            "summary": "Large-cap tech valuations receive a boost from resilient corporate earnings and AI hardware...",
            "url": "https://www.fxempire.com/forecasts/article/first-light-news-stocks-rally-as-bond-bears-dig-in-1636194",
            "symbol": "📊",
            "symbolBg": "from-emerald-950/80 via-teal-900/40 to-slate-950 text-emerald-300"
        },
        {
            "id": "bitcoin-etf-inflows-record",
            "slug": "bitcoin-etf-inflows-record-institutional",
            "title": "Bitcoin Spot ETF Inflows Reaccelerate as Institutional Allocators Expand Crypto Exposure",
            "category": "Fundamental",
            "assetClass": "Cryptocurrency",
            "date": today,
            "publisher": "Cointelegraph",
            "image": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80",
            "quote": "Spot Bitcoin ETFs recorded over $380M in single-day net inflows as sovereign wealth funds and multi-asset asset managers increase spot crypto allocations.",
            "body": "Spot Bitcoin ETFs recorded over $380M in single-day net inflows as sovereign wealth funds and multi-asset asset managers increase spot crypto allocations.",
            "summary": "Spot Bitcoin ETFs recorded over $380M in net inflows as sovereign wealth funds expand...",
            "url": "https://cointelegraph.com/markets/bitcoin-etf-rebound-119m-inflow-ether-extend-losses",
            "symbol": "₿",
            "symbolBg": "from-amber-950/80 via-yellow-900/40 to-slate-950 text-amber-300"
        },
        {
            "id": "solana-defi-activity-surge",
            "slug": "solana-defi-activity-surge-dex-volume",
            "title": "Solana (SOL) Technical Breakdown: DEX Volumes Match Mainnet Ethereum as Bull Flag Develops",
            "category": "Technical Analysis",
            "assetClass": "Cryptocurrency",
            "date": today,
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&auto=format&fit=crop&q=80",
            "quote": "Solana on-chain DEX velocity reaches multi-month records while the SOL/BTC trading pair completes an inverse head-and-shoulders formation on high volume.",
            "body": "Solana on-chain DEX velocity reaches multi-month records while the SOL/BTC trading pair completes an inverse head-and-shoulders formation on high volume.",
            "summary": "Solana on-chain DEX velocity reaches multi-month records as SOL/BTC completes bullish pattern...",
            "url": "https://www.fxempire.com/forecasts/article/zec-price-warning-technicals-point-to-potential-30-zcash-pullback-1636299",
            "symbol": "◎",
            "symbolBg": "from-purple-950/80 via-indigo-900/40 to-slate-950 text-purple-300"
        },
        {
            "id": "euro-bond-yield-divergence",
            "slug": "euro-bond-yield-divergence-ecb-fed",
            "title": "EUR/USD Fundamental Analysis: Policy Divergence Between ECB and Fed Caps Euro Gains",
            "category": "Fundamental",
            "assetClass": "Global Markets",
            "date": today,
            "publisher": "FXEmpire",
            "image": "https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=1200&auto=format&fit=crop&q=80",
            "quote": "The European Central Bank's dovish inflation stance contrasts with persistent US economic resilience, restricting EUR/USD breakout attempts above 1.1250.",
            "body": "The European Central Bank's dovish inflation stance contrasts with persistent US economic resilience, restricting EUR/USD breakout attempts above 1.1250.",
            "summary": "ECB dovish inflation stance contrasts with US economic resilience, capping EUR/USD gains...",
            "url": "https://www.fxempire.com/forecasts/article/us-dollar-price-forecast-fed-minutes-loom-can-gbp-usd-and-eur-usd-recover-1636162",
            "symbol": "€",
            "symbolBg": "from-blue-950/80 to-slate-950 text-blue-400"
        }
    ]


def _fetch_fxempire_forecasts():
    articles = []
    today = _get_today_formatted()
    try:
        url = "https://www.fxempire.com/api/v1/en/articles/rss/forecasts"
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}, timeout=6)
        if resp.status_code == 200:
            root = ET.fromstring(resp.text)
            items = root.findall("./channel/item")
            for idx, item in enumerate(items[:20]):
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
                quote_text = clean_desc if len(clean_desc) > 20 else title
                if len(quote_text) > 220:
                    quote_text = quote_text[:215] + "..."

                cat = _detect_research_category(title)
                asset_class = _detect_asset_class(title, cat)
                
                title_l = title.lower()
                symbol = "📊"
                symbolBg = "from-purple-950/80 via-indigo-900/40 to-slate-950 text-purple-300"
                if "gold" in title_l or "xau" in title_l:
                    symbol = "🥇"
                    symbolBg = "from-amber-950/80 via-yellow-900/40 to-slate-950 text-amber-300"
                elif "oil" in title_l or "wti" in title_l or "crude" in title_l or "gas" in title_l:
                    symbol = "🛢️"
                    symbolBg = "from-rose-950/80 via-amber-950/40 to-slate-950 text-rose-300"
                elif "yen" in title_l or "jpy" in title_l:
                    symbol = "¥"
                    symbolBg = "from-red-950/80 via-slate-900 to-slate-950 text-red-400"
                elif "dollar" in title_l or "usd" in title_l or "dxy" in title_l:
                    symbol = "$"
                    symbolBg = "from-emerald-950/80 via-teal-900/40 to-slate-950 text-emerald-300"
                elif "crypto" in title_l or "btc" in title_l or "eth" in title_l:
                    symbol = "₿"
                    symbolBg = "from-amber-950/80 via-yellow-900/40 to-slate-950 text-amber-300"

                if title and link:
                    articles.append({
                        "id": _generate_article_id(link, title),
                        "slug": title.lower().replace(" ", "-")[:40],
                        "title": title,
                        "category": cat,
                        "assetClass": asset_class,
                        "date": article_date,
                        "pub_dt": pub_dt,
                        "publisher": "FXEmpire",
                        "image": FALLBACK_IMAGES[idx % len(FALLBACK_IMAGES)],
                        "quote": quote_text,
                        "body": clean_desc or quote_text,
                        "summary": clean_desc[:120] + "..." if len(clean_desc) > 120 else clean_desc,
                        "url": link,
                        "symbol": symbol,
                        "symbolBg": symbolBg
                    })
    except Exception as e:
        print(f"FXEmpire Forecasts RSS warning: {e}")
    return articles


def _fetch_cointelegraph_news():
    articles = []
    today = _get_today_formatted()
    try:
        resp = requests.get("https://cointelegraph.com/rss", headers={"User-Agent": "Mozilla/5.0"}, timeout=6)
        if resp.status_code == 200:
            root = ET.fromstring(resp.text)
            items = root.findall("./channel/item")
            for idx, item in enumerate(items[:20]):
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

                enclosure = item.find("enclosure")
                img_url = enclosure.get("url") if enclosure is not None else FALLBACK_IMAGES[idx % len(FALLBACK_IMAGES)]

                clean_desc = _clean_text(desc)
                quote_text = clean_desc if len(clean_desc) > 20 else title
                if len(quote_text) > 220:
                    quote_text = quote_text[:215] + "..."

                cat = _detect_research_category(title)

                if title and link:
                    articles.append({
                        "id": _generate_article_id(link, title),
                        "slug": title.lower().replace(" ", "-")[:40],
                        "title": title,
                        "category": cat,
                        "assetClass": "Cryptocurrency",
                        "date": article_date,
                        "pub_dt": pub_dt,
                        "publisher": "Cointelegraph",
                        "image": img_url or FALLBACK_IMAGES[idx % len(FALLBACK_IMAGES)],
                        "quote": quote_text,
                        "body": clean_desc or quote_text,
                        "summary": clean_desc[:120] + "..." if len(clean_desc) > 120 else clean_desc,
                        "url": link,
                        "symbol": "₿",
                        "symbolBg": "from-teal-950/80 via-cyan-900/40 to-slate-950 text-cyan-300"
                    })
    except Exception as e:
        print(f"Cointelegraph RSS warning: {e}")
    return articles


def _fetch_yahoo_finance_news():
    articles = []
    today = _get_today_formatted()
    try:
        url = "https://feeds.finance.yahoo.com/rss/2.0/headline?s=GC=F,EURUSD=X,JPY=X,CL=F,BTC-USD,^GSPC,^IXIC"
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=6)
        if resp.status_code == 200:
            root = ET.fromstring(resp.text)
            items = root.findall("./channel/item")
            for idx, item in enumerate(items[:20]):
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
                quote_text = clean_desc if len(clean_desc) > 20 else title
                if len(quote_text) > 220:
                    quote_text = quote_text[:215] + "..."

                cat = _detect_research_category(title)
                asset_class = _detect_asset_class(title, cat)

                symbol = "¥" if "yen" in title.lower() else ("🥇" if "gold" in title.lower() else "📊")

                if title and link:
                    articles.append({
                        "id": _generate_article_id(link, title),
                        "slug": title.lower().replace(" ", "-")[:40],
                        "title": title,
                        "category": cat,
                        "assetClass": asset_class,
                        "date": article_date,
                        "pub_dt": pub_dt,
                        "publisher": "Yahoo Finance",
                        "image": FALLBACK_IMAGES[(idx + 2) % len(FALLBACK_IMAGES)],
                        "quote": quote_text,
                        "body": clean_desc or quote_text,
                        "summary": clean_desc[:120] + "..." if len(clean_desc) > 120 else clean_desc,
                        "url": link,
                        "symbol": symbol,
                        "symbolBg": "from-amber-950/80 via-yellow-900/40 to-slate-950 text-amber-300" if symbol == "🥇" else "from-cyan-950/80 to-slate-950 text-cyan-400"
                    })
    except Exception as e:
        print(f"Yahoo Finance RSS warning: {e}")
    return articles


def get_live_market_research_articles(force_refresh=False):
    global _RESEARCH_CACHE

    now_ts = time.time()
    if not force_refresh and (now_ts - _RESEARCH_CACHE["timestamp"]) < CACHE_TTL_SECONDS and len(_RESEARCH_CACHE["articles"]) >= 10:
        return _RESEARCH_CACHE["articles"]

    curated = get_curated_fallback_articles()
    
    # 1. Primary Market Research feed: FXEmpire Forecasts & Technical Analysis
    fx_forecasts = _fetch_fxempire_forecasts()
    
    # 2. Secondary: Technical and forecast articles from other feeds
    crypto_articles = [a for a in _fetch_cointelegraph_news() if a.get("category") in ["Technical Analysis", "Price Prediction"]]
    finance_articles = [a for a in _fetch_yahoo_finance_news() if a.get("category") in ["Technical Analysis", "Price Prediction"]]

    all_live = []
    # Place FXEmpire forecasts first, then other forecast articles
    all_live.extend(fx_forecasts)
    all_live.extend(crypto_articles)
    all_live.extend(finance_articles)

    # Sort strictly by publication timestamp descending
    min_dt = datetime.min.replace(tzinfo=timezone.utc)
    all_live.sort(key=lambda x: x.get("pub_dt") or min_dt, reverse=True)

    combined = []
    seen_ids = set()

    for art in all_live:
        if art["id"] not in seen_ids:
            seen_ids.add(art["id"])
            combined.append(art)

    # Append curated high quality items as filler/supplemental
    for art in curated:
        if art["id"] not in seen_ids:
            seen_ids.add(art["id"])
            combined.append(art)

    if not combined:
        combined = curated

    _RESEARCH_CACHE["articles"] = combined
    _RESEARCH_CACHE["timestamp"] = now_ts
    return combined


def get_market_research_by_id(article_id):
    articles = get_live_market_research_articles()
    if not article_id:
        return articles[0] if articles else None

    clean_id = str(article_id).lower().strip()
    for art in articles:
        if str(art.get("id")).lower() == clean_id or str(art.get("slug", "")).lower() == clean_id:
            return art

    return articles[0] if articles else None

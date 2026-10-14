"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Market Research Portal Engine - Nexus Edition
|--------------------------------------------------------------------------
| Handles seamless switching between 4-Column Card Grid View and
| Dedicated 2-Column Article Reader View with sticky "More research" sidebar.
|--------------------------------------------------------------------------
*/

(function () {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function getTodayFormatted() {
        const now = new Date();
        return `${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    }

    const FALLBACK_RESEARCH = [
        {
            id: "753d57b3bb6e4e60",
            slug: "first-light-news-stocks-rally",
            title: "First Light News: Stocks Rally as Bond Bears Dig In",
            category: "Price Prediction",
            assetClass: "Global Markets",
            date: getTodayFormatted(),
            publisher: "FXEmpire",
            image: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80",
            quote: "US stocks hit fresh records, but Asia lags. Treasury yields sit near 24-year highs, and Ray Dalio warns that sovereign debt could trigger volatility.",
            body: "US stocks hit fresh records, but Asia lags. Treasury yields sit near 24-year highs, and Ray Dalio warns that mounting sovereign debt could trigger volatility. Institutional traders remain focused on upcoming FOMC policy guidance and sovereign debt yields.",
            summary: "US stocks hit fresh records, but Asia lags. Treasury yields sit near 24-year highs, and Ray Dalio warns that sovereign debt...",
            url: "https://www.fxempire.com/forecasts/article/first-light-news-stocks-rally-as-bond-bears-dig-in-1636194"
        },
        {
            id: "usd-dollar-price-forecast-fed",
            slug: "us-dollar-price-forecast-fed-minutes",
            title: "US Dollar Price Forecast: Fed Minutes Loom, Can GBP/USD and EUR/USD Recover?",
            category: "Price Prediction",
            assetClass: "Global Markets",
            date: getTodayFormatted(),
            publisher: "FXEmpire",
            image: "https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=1200&auto=format&fit=crop&q=80",
            quote: "DXY holds above 101.76 as traders await Fed minutes, while EUR/USD tests 1.1225 and GBP/USD remains under mild bearish pressure.",
            body: "DXY holds above 101.76 as traders await Fed minutes, while EUR/USD tests 1.1225 and GBP/USD remains under mild bearish pressure. Global foreign exchange pairs reflect heightened sensitivity to upcoming central bank interest rate projections.",
            summary: "DXY holds above 101.76 as traders await Fed minutes, while EUR/USD tests 1.1225 and GBP/USD remains...",
            url: "https://www.fxempire.com/forecasts/article/us-dollar-price-forecast-fed-minutes-loom-can-gbp-usd-and-eur-usd-recover-1636162"
        },
        {
            id: "gold-silver-china-adds",
            slug: "gold-xauusd-silver-price-forecast-china",
            title: "Gold (XAUUSD) & Silver Price Forecast: China Adds Gold, Fed Minutes Loom, Will Bulls Hold?",
            category: "Price Prediction",
            assetClass: "Global Markets",
            date: getTodayFormatted(),
            publisher: "FXEmpire",
            image: "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1200&auto=format&fit=crop&q=80",
            quote: "China adds to gold reserves for a 23rd month as Fed minutes loom, while XAU/USD holds $4,112 and silver consolidates key weekly pivot levels.",
            body: "China adds to gold reserves for a 23rd month as Fed minutes loom, while XAU/USD holds $4,112 and silver consolidates key weekly pivot levels. Central bank bullion buying continues to provide structural support against real yields.",
            summary: "China adds to gold reserves for a 23rd month as Fed minutes loom, while XAU/USD holds $4,112 and silv...",
            url: "https://www.fxempire.com/forecasts/article/gold-xauusd-silver-price-forecast-china-adds-gold-fed-minutes-loom-will-gold-clear-4190-1636156"
        },
        {
            id: "natural-gas-oil-forecast-gulf",
            slug: "natural-gas-oil-forecast-gulf-storm",
            title: "Natural Gas and Oil Forecast: Gulf Storm Threatens Supply, Can WTI Break $90.65?",
            category: "Price Prediction",
            assetClass: "Global Markets",
            date: getTodayFormatted(),
            publisher: "FXEmpire",
            image: "https://images.unsplash.com/photo-1516937941344-00b4e0337589?w=1200&auto=format&fit=crop&q=80",
            quote: "Gulf storm risks and Saudi-Houthi tensions lift oil supply concerns as WTI tests $90.64. Brent eyes potential dynamic breakout above pivotal resistance.",
            body: "Gulf storm risks and Saudi-Houthi tensions lift oil supply concerns as WTI tests $90.64. Brent eyes potential dynamic breakout above pivotal resistance. Energy markets price in immediate shipping disruptions.",
            summary: "Gulf storm risks and Saudi-Houthi tensions lift oil supply concerns as WTI tests $90.64, Brent eyes...",
            url: "https://www.fxempire.com/forecasts/article/natural-gas-and-oil-forecast-gulf-storm-threatens-supply-can-wti-break-90-65-1636149"
        },
        {
            id: "gold-price-forecast-xau-fed-minutes",
            slug: "gold-price-forecast-xauusd-fed-minutes",
            title: "Gold Price Forecast: XAU/USD eyes Fed Minutes for fresh impetus after holding $4,100",
            category: "Price Prediction",
            assetClass: "Global Markets",
            date: getTodayFormatted(),
            publisher: "FXEmpire",
            image: "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1200&auto=format&fit=crop&q=80",
            quote: "Gold is back in the red around $4,150 in Wednesday's Asian trades, reversing the previous session's recovery ahead of the US Fed Minutes release.",
            body: "Gold is back in the red around $4,150 in Wednesday's Asian trades, reversing the previous session's recovery ahead of the US Fed Minutes release. Traders analyze bond yield momentum.",
            summary: "Gold is back in the red around $4,150 in Wednesday's Asian trades, reversing the previous...",
            url: "https://www.fxempire.com/forecasts/article/gold-news-xauusd-slides-as-fed-minutes-and-10-year-auction-test-buyers-1636261"
        },
        {
            id: "gold-silver-breakdown-risk",
            slug: "gold-silver-forecast-breakdown-risk",
            title: "Gold and Silver Forecast: Breakdown Risk Ahead of Fed Minutes",
            category: "Price Prediction",
            assetClass: "Global Markets",
            date: getTodayFormatted(),
            publisher: "FXEmpire",
            image: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&auto=format&fit=crop&q=80",
            quote: "Gold and silver remain under pressure ahead of the Fed minutes, with gold's $4,100 support and silver's critical moving averages under close technical review.",
            body: "Gold and silver remain under pressure ahead of the Fed minutes, with gold's $4,100 support and silver's critical moving averages under close technical review.",
            summary: "Gold and silver remain under pressure ahead of the Fed minutes, with gold's $4,100 support and silver'...",
            url: "https://www.fxempire.com/forecasts/article/gold-and-silver-forecast-breakdown-risk-ahead-of-fed-minutes-1636134"
        },
        {
            id: "gold-price-forecast-4104-support",
            slug: "gold-price-forecast-4104-support-bears",
            title: "Gold (XAU/USD) Price Forecast: $4,104 Support Puts Bears on Notice",
            category: "Price Prediction",
            assetClass: "Global Markets",
            date: getTodayFormatted(),
            publisher: "FXEmpire",
            image: "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1200&auto=format&fit=crop&q=80",
            quote: "Gold tested key Fibonacci support at $4,103 before recovering, raising the possibility of a short-term bottom if buyers can reclaim the 50-day exponential moving average.",
            body: "Gold tested key Fibonacci support at $4,103 before recovering, raising the possibility of a short-term bottom if buyers can reclaim the 50-day exponential moving average.",
            summary: "Gold tested key Fibonacci support at $4,103 before recovering, raising the possibility of a short-term...",
            url: "https://www.fxempire.com/forecasts/article/gold-xau-usd-price-forecast-4104-support-puts-bears-on-notice-1636084"
        },
        {
            id: "wti-crude-oil-88-support",
            slug: "wti-crude-oil-price-forecast-88-support",
            title: "WTI Crude Oil Price Forecast: $88.66 Support Signals Potential Pullback Low",
            category: "Price Prediction",
            assetClass: "Global Markets",
            date: getTodayFormatted(),
            publisher: "FXEmpire",
            image: "https://images.unsplash.com/photo-1516937941344-00b4e0337589?w=1200&auto=format&fit=crop&q=80",
            quote: "WTI crude oil found support near $88.66, with a bullish hammer and rising channel setting up a continuation test toward psychological resistance.",
            body: "WTI crude oil found support near $88.66, with a bullish hammer and rising channel setting up a continuation test toward psychological resistance.",
            summary: "WTI crude oil found support near $88.66, with a bullish hammer and rising channel setting up a...",
            url: "https://www.fxempire.com/forecasts/article/natural-gas-and-oil-forecast-gulf-storm-threatens-supply-can-wti-break-90-65-1636149"
        },
        {
            id: "crypto-market-retreated-range",
            slug: "crypto-market-liquidations-btc",
            title: "Crypto Liquidations Hit $550M as Bitcoin Price Dips Below $84K",
            category: "Technical Analysis",
            assetClass: "Cryptocurrency",
            date: getTodayFormatted(),
            publisher: "Cointelegraph",
            image: "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=1200&auto=format&fit=crop&q=80",
            quote: "Bitcoin fell 2.3% in two hours amid suspicion over leveraged BTC short positions across perpetual markets as aggregate crypto market cap tests key support.",
            body: "Bitcoin fell 2.3% in two hours amid suspicion over leveraged BTC short positions across perpetual markets, causing cascade liquidations across long contracts before finding structural bid support near the 200-day EMA.",
            summary: "Bitcoin fell 2.3% in two hours amid leveraged short positions as crypto market cap tests support...",
            url: "https://cointelegraph.com/markets/crypto-liquidations-hit-550m-as-bitcoin-price-dips-below-84k"
        },
        {
            id: "japanese-yen-nears-158-boj",
            slug: "japanese-yen-nears-158-analysts",
            title: "Japanese Yen nears 158.00: Two analysts agree it's bullish, and disagree on how far the breakout goes",
            category: "Fundamental",
            assetClass: "Global Markets",
            date: getTodayFormatted(),
            publisher: "FXEmpire",
            image: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1200&auto=format&fit=crop&q=80",
            quote: "The Japanese Yen (JPY) is drifting near 158.00 against the US Dollar (USD) ahead of a busy week of Japanese data and a still-unclear Bank of Japan (BoJ) timetable.",
            body: "The Japanese Yen (JPY) is drifting near 158.00 against the US Dollar (USD) ahead of a busy week of Japanese data and a still-unclear Bank of Japan (BoJ) timetable. FX strategists maintain diverging outlooks on Ministry of Finance intervention limits.",
            summary: "The Japanese Yen (JPY) is drifting near 158.00 against the US Dollar ahead of key Japanese data...",
            url: "https://www.fxempire.com/forecasts/article/us-dollar-price-forecast-fed-minutes-loom-can-gbp-usd-and-eur-usd-recover-1636162"
        },
        {
            id: "dogecoin-price-risks-20-dip-wedge",
            slug: "dogecoin-price-risks-20-dip-wedge",
            title: "Dogecoin Price Risks 20% Dip as Memecoin Dominance Hits Record Low",
            category: "Price Prediction",
            assetClass: "Cryptocurrency",
            date: getTodayFormatted(),
            publisher: "FXEmpire",
            image: "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=1200&auto=format&fit=crop&q=80",
            quote: "Dogecoin price risks a 20% drop toward $0.076 as a bearish broadening wedge emerges and memecoin dominance drops to a 12-month low relative to Tier-1 Layer 1 assets.",
            body: "Dogecoin price risks a 20% drop toward $0.076 as a bearish broadening wedge emerges and memecoin dominance drops to a 12-month low relative to Tier-1 Layer 1 assets. Derivatives funding rates show neutral sentiment.",
            summary: "Dogecoin price risks a 20% drop toward $0.076 as a bearish broadening wedge emerges...",
            url: "https://www.fxempire.com/forecasts/article/zec-price-warning-technicals-point-to-potential-30-zcash-pullback-1636299"
        },
        {
            id: "xrp-price-forecast-consolidation",
            slug: "bitcoin-etf-rebound-ether-losses",
            title: "Bitcoin ETFs Rebound with $119M Inflow as Ether Extends Losses",
            category: "Technical Analysis",
            assetClass: "Cryptocurrency",
            date: getTodayFormatted(),
            publisher: "Cointelegraph",
            image: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&auto=format&fit=crop&q=80",
            quote: "Bitcoin ETFs returned to net positive inflows with $119 million despite macroeconomic chop, setting the stage for institutional support.",
            body: "Bitcoin ETFs returned to net positive inflows with $119 million despite macroeconomic chop, setting the stage for institutional support across Tier-1 digital assets.",
            summary: "Bitcoin ETFs returned to net inflows with $119M as institutional allocators expand spot holdings...",
            url: "https://cointelegraph.com/markets/bitcoin-etf-rebound-119m-inflow-ether-extend-losses"
        },
        {
            id: "sp500-nasdaq-breakout-tech",
            slug: "sp500-nasdaq-breakout-tech-equities",
            title: "S&P 500 and Nasdaq Index Forecast: Tech Equities Challenge All-Time Highs",
            category: "Fundamental",
            assetClass: "Global Markets",
            date: getTodayFormatted(),
            publisher: "FXEmpire",
            image: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80",
            quote: "Large-cap tech valuations receive a boost from resilient corporate earnings and AI hardware capital expenditure guidance across cloud hyperscalers.",
            body: "Large-cap tech valuations receive a boost from resilient corporate earnings and AI hardware capital expenditure guidance across cloud hyperscalers. Breadth metrics demonstrate broad sector participation.",
            summary: "Large-cap tech valuations receive a boost from resilient corporate earnings and AI hardware...",
            url: "https://www.fxempire.com/forecasts/article/first-light-news-stocks-rally-as-bond-bears-dig-in-1636194"
        },
        {
            id: "bitcoin-etf-inflows-record",
            slug: "bitcoin-etf-inflows-record-institutional",
            title: "Bitcoin Spot ETF Inflows Reaccelerate as Institutional Allocators Expand Crypto Exposure",
            category: "Fundamental",
            assetClass: "Cryptocurrency",
            date: getTodayFormatted(),
            publisher: "Cointelegraph",
            image: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80",
            quote: "Spot Bitcoin ETFs recorded over $380M in single-day net inflows as sovereign wealth funds and multi-asset asset managers increase spot crypto allocations.",
            body: "Spot Bitcoin ETFs recorded over $380M in single-day net inflows as sovereign wealth funds and multi-asset asset managers increase spot crypto allocations.",
            summary: "Spot Bitcoin ETFs recorded over $380M in net inflows as sovereign wealth funds expand...",
            url: "https://cointelegraph.com/markets/bitcoin-etf-rebound-119m-inflow-ether-extend-losses"
        },
        {
            id: "solana-defi-activity-surge",
            slug: "solana-defi-activity-surge-dex-volume",
            title: "Solana (SOL) Technical Breakdown: DEX Volumes Match Mainnet Ethereum as Bull Flag Develops",
            category: "Technical Analysis",
            assetClass: "Cryptocurrency",
            date: getTodayFormatted(),
            publisher: "FXEmpire",
            image: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&auto=format&fit=crop&q=80",
            quote: "Solana on-chain DEX velocity reaches multi-month records while the SOL/BTC trading pair completes an inverse head-and-shoulders formation on high volume.",
            body: "Solana on-chain DEX velocity reaches multi-month records while the SOL/BTC trading pair completes an inverse head-and-shoulders formation on high volume.",
            summary: "Solana on-chain DEX velocity reaches multi-month records as SOL/BTC completes bullish pattern...",
            url: "https://www.fxempire.com/forecasts/article/zec-price-warning-technicals-point-to-potential-30-zcash-pullback-1636299"
        },
        {
            id: "euro-bond-yield-divergence",
            slug: "euro-bond-yield-divergence-ecb-fed",
            title: "EUR/USD Fundamental Analysis: Policy Divergence Between ECB and Fed Caps Euro Gains",
            category: "Fundamental",
            assetClass: "Global Markets",
            date: getTodayFormatted(),
            publisher: "FXEmpire",
            image: "https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=1200&auto=format&fit=crop&q=80",
            quote: "The European Central Bank's dovish inflation stance contrasts with persistent US economic resilience, restricting EUR/USD breakout attempts above 1.1250.",
            body: "The European Central Bank's dovish inflation stance contrasts with persistent US economic resilience, restricting EUR/USD breakout attempts above 1.1250.",
            summary: "ECB dovish inflation stance contrasts with US economic resilience, capping EUR/USD gains...",
            url: "https://www.fxempire.com/forecasts/article/us-dollar-price-forecast-fed-minutes-loom-can-gbp-usd-and-eur-usd-recover-1636162"
        }
    ];

    let allArticles = [];
    let selectedCategory = "all";
    let selectedAsset = "all";
    let searchQuery = "";
    let displayLimit = 16;
    const PAGE_SIZE = 12;

    function escapeHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function findArticle(targetId) {
        if (!targetId) return null;
        const cleanTarget = decodeURIComponent(String(targetId)).toLowerCase().trim();
        
        let found = allArticles.find(a => String(a.id).toLowerCase() === cleanTarget);
        if (found) return found;

        found = allArticles.find(a => a.slug && String(a.slug).toLowerCase() === cleanTarget);
        if (found) return found;

        found = allArticles.find(a => 
            String(a.id).toLowerCase().includes(cleanTarget) || 
            (a.slug && String(a.slug).toLowerCase().includes(cleanTarget))
        );
        if (found) return found;

        found = allArticles.find(a => {
            const titleWords = cleanTarget.replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(w => w.length > 2);
            const aTitle = (a.title || "").toLowerCase();
            return titleWords.some(w => aTitle.includes(w));
        });
        if (found) return found;

        found = FALLBACK_RESEARCH.find(a => 
            String(a.id).toLowerCase() === cleanTarget || 
            (a.slug && String(a.slug).toLowerCase() === cleanTarget)
        );
        return found || null;
    }

    async function loadResearchData(force = false) {
        try {
            const apiUrl = (window.API_BASE_URL || "/api") + "/market/research";
            const res = await fetch(apiUrl);
            if (res.ok) {
                const json = await res.json();
                if (json.data && Array.isArray(json.data.articles) && json.data.articles.length > 0) {
                    allArticles = json.data.articles;
                    sessionStorage.setItem("tx_all_market_research", JSON.stringify(allArticles));
                } else {
                    allArticles = FALLBACK_RESEARCH;
                }
            } else {
                allArticles = FALLBACK_RESEARCH;
            }
        } catch (e) {
            console.warn("Failed to fetch research from API, using fallback:", e);
            allArticles = FALLBACK_RESEARCH;
        }

        applyFiltersAndRender();
        handleInitialRouting();
    }

    function applyFiltersAndRender() {
        const query = searchQuery.toLowerCase().trim();

        const filtered = allArticles.filter(item => {
            if (selectedCategory !== "all") {
                const itemCat = (item.category || "").toLowerCase();
                if (itemCat !== selectedCategory.toLowerCase()) {
                    return false;
                }
            }

            if (selectedAsset !== "all") {
                const itemAsset = (item.assetClass || "").toLowerCase();
                if (itemAsset !== selectedAsset.toLowerCase()) {
                    return false;
                }
            }

            if (query) {
                const title = (item.title || "").toLowerCase();
                const quote = (item.quote || item.summary || item.body || "").toLowerCase();
                const cat = (item.category || "").toLowerCase();
                if (!title.includes(query) && !quote.includes(query) && !cat.includes(query)) {
                    return false;
                }
            }

            return true;
        });

        renderGrid(filtered);
    }

    function renderGrid(articles) {
        const grid = document.getElementById("txResearchGrid");
        const countEl = document.getElementById("txResearchCount");
        const emptyEl = document.getElementById("txResearchEmpty");
        const loadMoreWrap = document.getElementById("txLoadMoreWrap");

        if (!grid) return;

        if (articles.length === 0) {
            grid.innerHTML = "";
            if (countEl) countEl.textContent = "Showing 0 articles";
            if (emptyEl) emptyEl.classList.remove("hidden");
            if (loadMoreWrap) loadMoreWrap.classList.add("hidden");
            return;
        }

        if (emptyEl) emptyEl.classList.add("hidden");
        const toShow = articles.slice(0, displayLimit);

        if (countEl) {
            countEl.textContent = `Showing ${toShow.length} of ${articles.length} articles`;
        }

        grid.innerHTML = toShow.map((item, idx) => {
            const safeTitle = escapeHtml(item.title);
            const safeCategory = escapeHtml(item.category || "Research");
            const safeDate = escapeHtml(item.date || getTodayFormatted());
            const rawDesc = (item.summary || item.quote || item.body || "").replace(/<[^>]+>/g, "").trim();
            const safeDesc = escapeHtml(rawDesc.length > 140 ? (rawDesc.slice(0, 137) + "...") : rawDesc);
            const publisher = escapeHtml(item.publisher || "FXEmpire");
            const image = item.image || "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80";

            return `
                <div class="tx-research-card rounded-2xl border border-white/10 bg-[#091424]/90 hover:bg-[#0c1a30] hover:border-cyan-400/40 hover:-translate-y-1 transition duration-200 p-4 flex flex-col justify-between shadow-xl group cursor-pointer" data-index="${idx}">
                    
                    <!-- Thumbnail with floating category badge -->
                    <div class="relative w-full h-48 rounded-xl overflow-hidden mb-3.5 bg-slate-900 border border-white/5 shrink-0">
                        <img src="${image}" alt="${safeTitle}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="this.src='https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&auto=format&fit=crop&q=80';">
                        <div class="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-black/70 backdrop-blur-md text-white border border-white/15 shadow-sm">
                            ${safeCategory}
                        </div>
                    </div>

                    <!-- Meta info -->
                    <div class="flex items-center gap-1.5 text-xs text-slate-400 font-semibold mb-1.5">
                        <span class="text-slate-300 font-bold">${safeCategory}</span>
                        <span class="text-slate-600">|</span>
                        <span class="font-mono text-slate-400 text-[11px]">${safeDate}</span>
                    </div>

                    <!-- Headline -->
                    <h3 class="text-white font-bold text-sm sm:text-base line-clamp-2 mb-2 group-hover:text-cyan-300 transition duration-150 leading-snug">
                        ${safeTitle}
                    </h3>

                    <!-- Excerpt -->
                    <p class="text-slate-400 text-xs line-clamp-2 leading-relaxed opacity-85 mb-3.5">
                        ${safeDesc}
                    </p>

                    <!-- Bottom CTA -->
                    <div class="flex items-center justify-between pt-3 border-t border-white/5 mt-auto">
                        <span class="text-xs font-bold text-cyan-400 group-hover:text-cyan-300 flex items-center gap-1">
                            Read more <span class="text-xs">›</span>
                        </span>
                        <span class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                            ${publisher}
                        </span>
                    </div>

                </div>
            `;
        }).join("");

        grid.querySelectorAll(".tx-research-card").forEach(card => {
            card.addEventListener("click", () => {
                const idx = parseInt(card.getAttribute("data-index"), 10);
                const item = toShow[idx];
                if (item) openArticleReader(item);
            });
        });

        if (loadMoreWrap) {
            if (toShow.length < articles.length) {
                loadMoreWrap.classList.remove("hidden");
            } else {
                loadMoreWrap.classList.add("hidden");
            }
        }
    }

    function openArticleReader(articleOrId) {
        let article = null;
        if (typeof articleOrId === "object" && articleOrId !== null) {
            article = articleOrId;
        } else {
            article = findArticle(articleOrId) || allArticles[0];
        }

        if (!article) return;

        // Switch Views & Hide Subnav
        const subnavRow = document.getElementById("txSubnavRow");
        const gridView = document.getElementById("txGridView");
        const readerView = document.getElementById("txReaderView");

        if (subnavRow) {
            subnavRow.classList.add("hidden");
            subnavRow.style.display = "none";
        }
        if (gridView) gridView.classList.add("hidden");
        if (readerView) readerView.classList.remove("hidden");

        // Scroll to top
        window.scrollTo({ top: 0, behavior: "smooth" });

        // Update URL query state
        const targetId = article.id || article.slug || "";
        if (targetId) {
            const newUrl = window.location.pathname + `?id=${encodeURIComponent(targetId)}`;
            window.history.pushState({ articleId: targetId }, "", newUrl);
        }

        // Populate Left Column
        const titleEl = document.getElementById("txReaderTitle");
        const dateEl = document.getElementById("txReaderDate");
        const catEl = document.getElementById("txReaderCategory");
        const imageEl = document.getElementById("txReaderImage");
        const quoteEl = document.getElementById("txReaderQuote");
        const bodyEl = document.getElementById("txReaderBody");
        const pubFootEl = document.getElementById("txReaderPublisherFoot");
        const ctaBtn = document.getElementById("txReaderCtaBtn");

        function getDirectArticleUrl(art) {
            if (!art) return "https://www.fxempire.com";
            if (art.url && art.url.startsWith("http")) {
                const u = art.url.trim();
                if (u.includes("/article/") || u.includes("/news/") || u.includes("cointelegraph.com") || u.includes("coindesk.com") || u.includes("/forecast")) {
                    return u;
                }
                if (!u.endsWith("/news") && !u.endsWith("/crude-oil") && !u.endsWith("/gold") && !u.endsWith("/silver") && !u.endsWith("/usd-jpy") && !u.endsWith("/commodities") && !u.endsWith("fxempire.com/") && !u.endsWith("fxempire.com")) {
                    return u;
                }
            }
            const cleanTitle = encodeURIComponent((art.title || "").replace(/['"]/g, "").trim());
            const pub = (art.publisher || "FXEmpire").toLowerCase();
            if (pub.includes("fxempire")) {
                return `https://www.fxempire.com/?s=${cleanTitle}`;
            } else if (pub.includes("coindesk")) {
                return `https://www.coindesk.com/search?s=${cleanTitle}`;
            } else if (pub.includes("cointelegraph")) {
                return `https://cointelegraph.com/search?query=${cleanTitle}`;
            }
            return `https://www.google.com/search?q=${cleanTitle}+${encodeURIComponent(art.publisher || "")}`;
        }

        if (titleEl) titleEl.textContent = article.title || "";
        if (dateEl) dateEl.textContent = article.date || getTodayFormatted();
        if (catEl) catEl.textContent = article.category || "Price Prediction";
        if (pubFootEl) pubFootEl.textContent = article.publisher || "FXEmpire";
        if (imageEl) imageEl.src = article.image || "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80";
        if (quoteEl) quoteEl.textContent = article.quote || article.summary || article.title;
        if (bodyEl) bodyEl.textContent = article.body || article.quote || article.summary || "The global financial market structure continues to provide key structural insights as liquidity and monetary conditions develop.";
        if (ctaBtn) ctaBtn.href = getDirectArticleUrl(article);

        // Populate Right "More research" Sidebar
        renderSidebar(article);
    }

    function renderSidebar(currentArticle) {
        const sidebar = document.getElementById("txSidebarList");
        if (!sidebar) return;

        const otherArticles = allArticles.filter(a => String(a.id) !== String(currentArticle.id)).slice(0, 8);
        if (otherArticles.length === 0) {
            sidebar.innerHTML = `<div style="font-size: 0.75rem; color: #94a3b8; padding: 0.5rem 0; text-align: center;">No other research found</div>`;
            return;
        }

        sidebar.innerHTML = otherArticles.map(item => {
            const sTitle = escapeHtml(item.title);
            const sCat = escapeHtml(item.category || "Price Prediction");
            const sDate = escapeHtml(item.date || getTodayFormatted());
            const sImg = item.image || "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=400&auto=format&fit=crop&q=80";

            return `
                <div class="tx-sidebar-item" data-id="${escapeHtml(item.id)}">
                    <div class="tx-sidebar-thumb">
                        <img src="${sImg}" alt="${sTitle}" onerror="this.src='https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&auto=format&fit=crop&q=80';">
                    </div>
                    <div class="tx-sidebar-info">
                        <h4 class="tx-sidebar-title">
                            ${sTitle}
                        </h4>
                        <div class="tx-sidebar-meta">
                            ${sCat} • ${sDate}
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        sidebar.querySelectorAll(".tx-sidebar-item").forEach(el => {
            el.addEventListener("click", () => {
                const artId = el.getAttribute("data-id");
                openArticleReader(artId);
            });
        });
    }

    function backToGridView() {
        const subnavRow = document.getElementById("txSubnavRow");
        const gridView = document.getElementById("txGridView");
        const readerView = document.getElementById("txReaderView");

        if (subnavRow) {
            subnavRow.classList.remove("hidden");
            subnavRow.style.display = "flex";
        }
        if (readerView) readerView.classList.add("hidden");
        if (gridView) gridView.classList.remove("hidden");

        // Clear query param from URL
        window.history.pushState({}, "", window.location.pathname);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function handleInitialRouting() {
        const urlParams = new URLSearchParams(window.location.search);
        const paramId = urlParams.get("id");
        if (paramId) {
            openArticleReader(paramId);
        } else {
            backToGridView();
        }
    }

    window.addEventListener("popstate", () => {
        handleInitialRouting();
    });

    // Event Bindings
    document.addEventListener("DOMContentLoaded", () => {
        loadResearchData();

        // Category Pills
        const catContainer = document.getElementById("txCategoryPills");
        if (catContainer) {
            catContainer.querySelectorAll(".tx-pill-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    catContainer.querySelectorAll(".tx-pill-btn").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    selectedCategory = btn.getAttribute("data-cat");
                    displayLimit = 16;
                    applyFiltersAndRender();
                });
            });
        }

        // Asset Pills
        const assetContainer = document.getElementById("txAssetPills");
        if (assetContainer) {
            assetContainer.querySelectorAll(".tx-pill-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    assetContainer.querySelectorAll(".tx-pill-btn").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    selectedAsset = btn.getAttribute("data-asset");
                    displayLimit = 16;
                    applyFiltersAndRender();
                });
            });
        }

        // Live Search Input
        const searchInput = document.getElementById("txResearchSearch");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                searchQuery = e.target.value;
                displayLimit = 16;
                applyFiltersAndRender();
            });
        }

        // Refresh Button
        const refreshBtn = document.getElementById("txRefreshBtn");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", () => {
                const icon = refreshBtn.querySelector("svg");
                if (icon) icon.classList.add("animate-spin");
                loadResearchData(true).finally(() => {
                    setTimeout(() => {
                        if (icon) icon.classList.remove("animate-spin");
                    }, 600);
                });
            });
        }

        // Load More Button
        const loadMoreBtn = document.getElementById("txLoadMoreBtn");
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener("click", () => {
                displayLimit += PAGE_SIZE;
                applyFiltersAndRender();
            });
        }

        // Back to Grid Button
        const backBtn = document.getElementById("txBackToGridBtn");
        if (backBtn) backBtn.addEventListener("click", backToGridView);
    });

})();

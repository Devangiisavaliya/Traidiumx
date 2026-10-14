"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Market News Portal Engine - Nexus Edition
|--------------------------------------------------------------------------
| Handles seamless switching between 4-Column Card Grid View and
| Dedicated 2-Column News Reader View with sticky "More news" sidebar.
|--------------------------------------------------------------------------
*/

(function () {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function getTodayFormatted() {
        const now = new Date();
        return `${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    }

    const FALLBACK_NEWS = [
        {
            "id": "crypto-wall-street-wealth",
            "category": "Crypto",
            "date": getTodayFormatted(),
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
            "date": getTodayFormatted(),
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
            "date": getTodayFormatted(),
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
            "date": getTodayFormatted(),
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
            "date": getTodayFormatted(),
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
            "date": getTodayFormatted(),
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
            "date": getTodayFormatted(),
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
            "date": getTodayFormatted(),
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
            "date": getTodayFormatted(),
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
            "date": getTodayFormatted(),
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
            "date": getTodayFormatted(),
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
            "date": getTodayFormatted(),
            "title": "Bitmine Proposes 5% Supply Hard Cap Standard for Layer-1 Networks",
            "summary": "Protocol developers present supply constraint proposal to enhance long-term economic predictability across decentralized networks.",
            "body": "Protocol developers present supply constraint proposal to enhance long-term economic predictability across decentralized networks, establishing cryptographic parameters for emission sustainability.",
            "publisher": "Cointelegraph",
            "image": "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&auto=format&fit=crop&q=80",
            "url": "https://cointelegraph.com/news/bitmine-ether-5-percent-supply-hard-cap"
        }
    ];

    let allNews = [];
    let selectedCategory = "all";
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

    function findNews(targetId) {
        if (!targetId) return null;
        const cleanTarget = decodeURIComponent(String(targetId)).toLowerCase().trim();
        
        let found = allNews.find(n => String(n.id).toLowerCase() === cleanTarget);
        if (found) return found;

        found = allNews.find(n => 
            String(n.id).toLowerCase().includes(cleanTarget) || 
            (n.slug && String(n.slug).toLowerCase().includes(cleanTarget))
        );
        if (found) return found;

        found = allNews.find(n => {
            const titleWords = cleanTarget.replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(w => w.length > 2);
            const nTitle = (n.title || "").toLowerCase();
            return titleWords.some(w => nTitle.includes(w));
        });
        if (found) return found;

        found = FALLBACK_NEWS.find(n => String(n.id).toLowerCase() === cleanTarget);
        return found || null;
    }

    async function loadNewsData(force = false) {
        try {
            const apiUrl = (window.API_BASE_URL || "/api") + "/market/news";
            const res = await fetch(apiUrl);
            if (res.ok) {
                const json = await res.json();
                if (json.data && Array.isArray(json.data.news) && json.data.news.length > 0) {
                    allNews = json.data.news;
                    sessionStorage.setItem("tx_all_market_news", JSON.stringify(allNews));
                } else {
                    allNews = FALLBACK_NEWS;
                }
            } else {
                allNews = FALLBACK_NEWS;
            }
        } catch (e) {
            console.warn("Failed to fetch news from API, using fallback:", e);
            allNews = FALLBACK_NEWS;
        }

        applyFiltersAndRender();
        handleInitialRouting();
    }

    function applyFiltersAndRender() {
        const query = searchQuery.toLowerCase().trim();

        const filtered = allNews.filter(item => {
            if (selectedCategory !== "all") {
                const itemCat = (item.category || "").toLowerCase();
                if (itemCat !== selectedCategory.toLowerCase()) {
                    return false;
                }
            }

            if (query) {
                const title = (item.title || "").toLowerCase();
                const summary = (item.summary || item.body || "").toLowerCase();
                const cat = (item.category || "").toLowerCase();
                if (!title.includes(query) && !summary.includes(query) && !cat.includes(query)) {
                    return false;
                }
            }

            return true;
        });

        renderGrid(filtered);
    }

    function renderGrid(newsItems) {
        const grid = document.getElementById("txNewsGrid");
        const countEl = document.getElementById("txNewsCount");
        const emptyEl = document.getElementById("txNewsEmpty");
        const loadMoreWrap = document.getElementById("txLoadMoreNewsWrap");

        if (!grid) return;

        if (newsItems.length === 0) {
            grid.innerHTML = "";
            if (countEl) countEl.textContent = "Showing 0 articles";
            if (emptyEl) emptyEl.classList.remove("hidden");
            if (loadMoreWrap) loadMoreWrap.classList.add("hidden");
            return;
        }

        if (emptyEl) emptyEl.classList.add("hidden");
        const toShow = newsItems.slice(0, displayLimit);

        if (countEl) {
            countEl.textContent = `Showing ${toShow.length} of ${newsItems.length} articles`;
        }

        grid.innerHTML = toShow.map((item, idx) => {
            const safeTitle = escapeHtml(item.title);
            const safeCategory = escapeHtml(item.category || "News");
            const safeDate = escapeHtml(item.date || getTodayFormatted());
            const rawDesc = (item.summary || item.body || "").replace(/<[^>]+>/g, "").trim();
            const safeDesc = escapeHtml(rawDesc.length > 140 ? (rawDesc.slice(0, 137) + "...") : rawDesc);
            const publisher = escapeHtml(item.publisher || "FXEmpire");
            const image = item.image || "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80";

            return `
                <div class="tx-news-card rounded-2xl border border-white/10 bg-[#091424]/90 hover:bg-[#0c1a30] hover:border-cyan-400/40 hover:-translate-y-1 transition duration-200 p-4 flex flex-col justify-between shadow-xl group cursor-pointer" data-index="${idx}">
                    
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

        grid.querySelectorAll(".tx-news-card").forEach(card => {
            card.addEventListener("click", () => {
                const idx = parseInt(card.getAttribute("data-index"), 10);
                const item = toShow[idx];
                if (item) openNewsReader(item);
            });
        });

        if (loadMoreWrap) {
            if (toShow.length < newsItems.length) {
                loadMoreWrap.classList.remove("hidden");
            } else {
                loadMoreWrap.classList.add("hidden");
            }
        }
    }

    function openNewsReader(itemOrId) {
        let item = null;
        if (typeof itemOrId === "object" && itemOrId !== null) {
            item = itemOrId;
        } else {
            item = findNews(itemOrId) || allNews[0];
        }

        if (!item) return;

        // Switch Views & Hide Subnav
        const subnavRow = document.getElementById("txNewsSubnavRow");
        const gridView = document.getElementById("txNewsGridView");
        const readerView = document.getElementById("txNewsReaderView");

        if (subnavRow) {
            subnavRow.classList.add("hidden");
            subnavRow.style.display = "none";
        }
        if (gridView) gridView.classList.add("hidden");
        if (readerView) readerView.classList.remove("hidden");

        // Scroll to top
        window.scrollTo({ top: 0, behavior: "smooth" });

        // Update URL query state
        const targetId = item.id || "";
        if (targetId) {
            const newUrl = window.location.pathname + `?id=${encodeURIComponent(targetId)}`;
            window.history.pushState({ newsId: targetId }, "", newUrl);
        }

        // Populate Left Column
        const titleEl = document.getElementById("txNewsReaderTitle");
        const dateEl = document.getElementById("txNewsReaderDate");
        const catEl = document.getElementById("txNewsReaderCategory");
        const imageEl = document.getElementById("txNewsReaderImage");
        const bodyEl = document.getElementById("txNewsReaderBody");
        const pubFootEl = document.getElementById("txNewsReaderPublisherFoot");
        const ctaBtn = document.getElementById("txNewsReaderCtaBtn");

        function getDirectArticleUrl(newsItem) {
            if (!newsItem) return "https://www.fxempire.com";
            if (newsItem.url && newsItem.url.startsWith("http")) {
                return newsItem.url.trim();
            }
            const cleanTitle = encodeURIComponent((newsItem.title || "").replace(/['"]/g, "").trim());
            const pub = (newsItem.publisher || "FXEmpire").toLowerCase();
            if (pub.includes("fxempire")) {
                return `https://www.fxempire.com/?s=${cleanTitle}`;
            } else if (pub.includes("coindesk")) {
                return `https://www.coindesk.com/search?s=${cleanTitle}`;
            } else if (pub.includes("cointelegraph")) {
                return `https://cointelegraph.com/search?query=${cleanTitle}`;
            }
            return `https://www.google.com/search?q=${cleanTitle}+${encodeURIComponent(newsItem.publisher || "")}`;
        }

        if (titleEl) titleEl.textContent = item.title || "";
        if (dateEl) dateEl.textContent = item.date || getTodayFormatted();
        if (catEl) catEl.textContent = item.category || "Crypto";
        if (pubFootEl) pubFootEl.textContent = item.publisher || "CoinDesk";
        if (imageEl) imageEl.src = item.image || "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80";
        if (bodyEl) bodyEl.textContent = item.body || item.summary || "Full detailed news story available at original reporting agency.";
        if (ctaBtn) ctaBtn.href = getDirectArticleUrl(item);

        // Populate Right "More news" Sidebar
        renderNewsSidebar(item);
    }

    function renderNewsSidebar(currentItem) {
        const sidebar = document.getElementById("txNewsSidebarList");
        if (!sidebar) return;

        const otherNews = allNews.filter(n => String(n.id) !== String(currentItem.id)).slice(0, 8);
        if (otherNews.length === 0) {
            sidebar.innerHTML = `<div style="font-size: 0.75rem; color: #94a3b8; padding: 0.5rem 0; text-align: center;">No other news found</div>`;
            return;
        }

        sidebar.innerHTML = otherNews.map(item => {
            const sTitle = escapeHtml(item.title);
            const sCat = escapeHtml(item.category || "News");
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
                const newsId = el.getAttribute("data-id");
                openNewsReader(newsId);
            });
        });
    }

    function backToNewsGridView() {
        const subnavRow = document.getElementById("txNewsSubnavRow");
        const gridView = document.getElementById("txNewsGridView");
        const readerView = document.getElementById("txNewsReaderView");

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
            openNewsReader(paramId);
        } else {
            backToNewsGridView();
        }
    }

    window.addEventListener("popstate", () => {
        handleInitialRouting();
    });

    // Event Bindings
    document.addEventListener("DOMContentLoaded", () => {
        loadNewsData();

        // Category Pills
        const catContainer = document.getElementById("txNewsCategoryPills");
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

        // Live Search Input
        const searchInput = document.getElementById("txNewsSearch");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                searchQuery = e.target.value;
                displayLimit = 16;
                applyFiltersAndRender();
            });
        }

        // Refresh Button
        const refreshBtn = document.getElementById("txRefreshNewsBtn");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", () => {
                const icon = refreshBtn.querySelector("svg");
                if (icon) icon.classList.add("animate-spin");
                loadNewsData(true).finally(() => {
                    setTimeout(() => {
                        if (icon) icon.classList.remove("animate-spin");
                    }, 600);
                });
            });
        }

        // Load More Button
        const loadMoreBtn = document.getElementById("txLoadMoreNewsBtn");
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener("click", () => {
                displayLimit += PAGE_SIZE;
                applyFiltersAndRender();
            });
        }

        // Back to Grid Button
        const backBtn = document.getElementById("txNewsBackToGridBtn");
        if (backBtn) backBtn.addEventListener("click", backToNewsGridView);
    });

})();

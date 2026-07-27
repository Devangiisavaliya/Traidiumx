"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Markets Page - Company Backend Board
|--------------------------------------------------------------------------
| Backend source of truth: GET /api/market/board
| Supported symbols, XAUUSD -> Binance XAUUSDT mapping, Options entries,
| leverage and active status come from Flask/MongoDB service layer.
|--------------------------------------------------------------------------
*/

const MARKET_API_BASE = "/market";
const MARKET_BOARD_REFRESH_MS = 10000;
const MARKET_BINANCE_FALLBACK_MS = 3500;
const MARKET_LIVE_UI_REFRESH_MS = 300;
const MARKET_SLIDER_INTERVAL_MS = 5000;
const MARKET_INTRO_MIN_VISIBLE_MS = 1350;
const MARKET_INTRO_MAX_VISIBLE_MS = 5200;
const BINANCE_WS_BASE = "wss://fstream.binance.com/stream?streams=";
const BINANCE_TICKER_URL = "https://fapi.binance.com/fapi/v1/ticker/24hr";

let allMarkets = [];
let activeCategory = "USDT Futures";
let marketSocket = null;
let marketBoardTimer = null;
let marketBinanceFallbackTimer = null;
let marketUiRefreshTimer = null;
let marketSocketReconnectTimer = null;
let marketSliderAutoTimer = null;
let marketSliderRestartTimer = null;
let marketSliderResizeTimer = null;
let marketSliderIndex = 0;
let marketIntroHideTimer = null;
let marketIntroRemoveTimer = null;
let marketIntroSafetyTimer = null;
const marketIntroStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
let providerToInternalSymbols = new Map();
let marketMetaBySymbol = new Map();

const tableBody = document.getElementById("marketsTableBody");
const mobileCards = document.getElementById("marketsMobileCards");
const emptyState = document.getElementById("marketsEmptyState");
const searchInput = document.getElementById("marketSearchInput");
const sortSelect = document.getElementById("sortMarketSelect");

const totalContracts = document.getElementById("totalContracts");
const maxLeverageText = document.getElementById("maxLeverageText");
const usdtCount = document.getElementById("usdtCount");
const optionsCount = document.getElementById("optionsCount");
const commodityCount = document.getElementById("commodityCount");
const allCount = document.getElementById("allCount");

const topGainersList = document.getElementById("topGainersList");
const topLosersList = document.getElementById("topLosersList");
const trendingList = document.getElementById("trendingList");

const marketStatusText = document.getElementById("marketStatusText");
const marketDataSource = document.getElementById("marketDataSource");
const marketLastUpdated = document.getElementById("marketLastUpdated");
const marketBoardTitle = document.getElementById("marketBoardTitle");
const marketBoardSubtitle = document.getElementById("marketBoardSubtitle");
const marketsPageIntro = document.getElementById("marketsPageIntro");

function closeMarketsPageIntro(force = false) {
    if (!marketsPageIntro || marketsPageIntro.dataset.closed === "true") return;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = Math.max(0, now - marketIntroStartedAt);
    const remaining = force ? 0 : Math.max(0, MARKET_INTRO_MIN_VISIBLE_MS - elapsed);

    if (marketIntroHideTimer) {
        clearTimeout(marketIntroHideTimer);
    }

    marketIntroHideTimer = window.setTimeout(() => {
        if (marketsPageIntro.dataset.closed === "true") return;

        marketsPageIntro.dataset.closed = "true";
        marketsPageIntro.classList.add("is-exiting");
        document.body.classList.remove("markets-intro-active");

        if (marketIntroSafetyTimer) {
            clearTimeout(marketIntroSafetyTimer);
            marketIntroSafetyTimer = null;
        }

        marketIntroRemoveTimer = window.setTimeout(() => {
            marketsPageIntro.remove();
            marketIntroRemoveTimer = null;
        }, 620);
    }, remaining);
}

if (marketsPageIntro) {
    marketIntroSafetyTimer = window.setTimeout(() => {
        closeMarketsPageIntro(true);
    }, MARKET_INTRO_MAX_VISIBLE_MS);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function normalizeSymbol(symbol) {
    return String(symbol || "").toUpperCase().replace(/[^A-Z0-9_]/g, "");
}

function formatNumber(value, decimals = 2) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "--";
    }

    return number.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function parseDateValue(value) {
    if (!value) return null;

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatUpdatedAgo(value) {
    const date = parseDateValue(value);

    if (!date) {
        return "not synced";
    }

    const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

    if (diffSeconds < 3) return "just now";
    if (diffSeconds < 60) return `${diffSeconds}s ago`;

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ago`;
}

function formatClockTime(value) {
    const date = parseDateValue(value);

    if (!date) return "--";

    return date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function formatSourceLabel(value) {
    const source = String(value || "backend_market_board").toLowerCase();

    if (source.includes("websocket")) return "Binance WS";
    if (source.includes("binance")) return "Binance Futures";
    if (source.includes("options")) return "Options Engine";
    if (source.includes("backend")) return "Backend Snapshot";

    return source.replaceAll("_", " ");
}

function formatVolume(value, quoteAsset = "USDT") {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
        return "--";
    }

    if (number >= 1_000_000_000) {
        return `${formatNumber(number / 1_000_000_000, 2)}B ${quoteAsset}`;
    }

    if (number >= 1_000_000) {
        return `${formatNumber(number / 1_000_000, 2)}M ${quoteAsset}`;
    }

    return `${formatNumber(number, 2)} ${quoteAsset}`;
}

function getPriceDecimals(price) {
    const number = Number(price);

    if (!Number.isFinite(number)) {
        return 2;
    }

    if (number < 1) return 5;
    if (number < 100) return 3;
    return 2;
}

function getPairInitials(pair) {
    return String(pair || "")
        .replace(" Options", "")
        .split("-")[0]
        .slice(0, 4)
        .toUpperCase();
}

function getChangeClass(change) {
    return Number(change) >= 0 ? "text-emerald-400" : "text-red-400";
}

function getChangeBadgeClass(change) {
    return Number(change) >= 0
        ? "bg-emerald-400/10 text-emerald-400"
        : "bg-red-400/10 text-red-400";
}

function formatChange(change) {
    const numericChange = Number(change) || 0;
    const sign = numericChange >= 0 ? "+" : "";
    return `${sign}${numericChange.toFixed(2)}%`;
}

function isFuturesCategory(category) {
    return category === "USDT Futures" || category === "Commodities";
}

function isOptionsCategory(category) {
    return category === "Options";
}

function getTradeLink(market) {
    if (isOptionsCategory(market.category)) {
        const underlyingSymbol = market.providerSymbol || market.provider_symbol || "BTCUSDT";
        return `./options.html?symbol=${encodeURIComponent(underlyingSymbol)}`;
    }

    return `./futures.html?symbol=${encodeURIComponent(market.symbol)}`;
}

function getTradeText(market) {
    if (isOptionsCategory(market.category)) {
        return "Options";
    }

    return "Trade";
}

function getMarketSyncMarkup() {
    return `
        <span class="market-sync-visual" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span>
        </span>
        <span class="sr-only">Market status is being prepared</span>
    `;
}

function getMarketNetworkMarkup() {
    return `
        <span class="market-network-indicator">
            <span class="market-network-dot" aria-hidden="true"></span>
            <span>Market Network</span>
        </span>
    `;
}

function setMarketStatus(status, type = "loading", detail = "") {
    if (marketStatusText) {
        if (type === "loading") {
            marketStatusText.innerHTML = getMarketSyncMarkup();
            marketStatusText.className = "mt-2 flex min-h-8 items-center text-cyan-300";
        } else {
            marketStatusText.textContent = status;
            marketStatusText.className = type === "live"
                ? "mt-2 text-3xl font-black text-emerald-400"
                : "mt-2 text-3xl font-black text-red-400";
        }
    }

    if (marketDataSource) {
        if (type === "loading") {
            marketDataSource.innerHTML = getMarketNetworkMarkup();
            marketDataSource.className = "w-fit rounded-full bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-300";
            return;
        }

        const defaultText = type === "live"
            ? "Backend market board + Binance live feed"
            : "Market data unavailable";

        marketDataSource.textContent = detail || defaultText;
        marketDataSource.className = type === "live"
            ? "w-fit rounded-full bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-400"
            : "w-fit rounded-full bg-red-400/10 px-4 py-2 text-xs font-black text-red-400";
    }
}

function setBoardUpdatedTime(value, source = "backend_market_board") {
    if (!marketLastUpdated) return;

    marketLastUpdated.textContent = `${formatSourceLabel(source)} live market feed`;
}

function normalizeMarketItem(item) {
    const symbol = normalizeSymbol(item.symbol || item.ui_symbol || "");
    const category = item.category || (item.market_type === "options" ? "Options" : "USDT Futures");
    const price = Number(item.last_price || item.lastPrice || item.price || 0);
    const quoteAsset = item.quote_asset || item.quoteAsset || "USDT";
    const providerSymbol = normalizeSymbol(item.provider_symbol || item.providerSymbol || symbol);

    return {
        symbol,
        providerSymbol,
        pair: item.pair || symbol,
        name: item.display_name || item.displayName || item.name || symbol,
        category,
        leverage: category === "Options" ? "USDT Settled" : `${String(item.max_leverage || item.maxLeverage || 20).replace("x", "")}x`,
        ltp: price > 0 ? `${formatNumber(price, getPriceDecimals(price))} ${quoteAsset}` : "--",
        rawPrice: price,
        change: Number(item.price_change_percent || item.priceChangePercent || item.change || 0),
        volume: formatVolume(item.quote_volume || item.quoteVolume || item.volume || 0, quoteAsset),
        rawVolume: Number(item.quote_volume || item.quoteVolume || item.volume || 0),
        isLive: Boolean(item.is_live || item.isLive || price > 0),
        quoteAsset,
        marketType: item.market_type || item.marketType || "futures",
        tradePage: item.trade_page || item.tradePage || (category === "Options" ? "options" : "futures"),
        sortOrder: Number(item.sort_order || item.sortOrder || 999),
        highPrice: Number(item.high_price || item.highPrice || 0),
        lowPrice: Number(item.low_price || item.lowPrice || 0),
        source: item.source || "backend",
        sourceLabel: item.source_label || item.sourceLabel || formatSourceLabel(item.source),
        updatedAt: item.updated_at || item.updatedAt || item.last_updated || new Date().toISOString()
    };
}

function normalizeBoardResponse(response) {
    const data = response?.data || {};
    const markets = Array.isArray(data.markets) ? data.markets : [];

    return {
        markets: markets.map(normalizeMarketItem).filter((market) => market.symbol),
        stats: data.stats || {},
        source: data.source || "backend_market_board",
        provider: data.provider || "binance_futures",
        lastUpdated: data.last_updated || data.updated_at || null,
        warnings: Array.isArray(data.warnings) ? data.warnings : []
    };
}

function updateLookupMaps() {
    providerToInternalSymbols = new Map();
    marketMetaBySymbol = new Map();

    allMarkets.forEach((market) => {
        marketMetaBySymbol.set(market.symbol, market);

        if (market.providerSymbol && String(market.providerSymbol).endsWith("USDT")) {
            const existing = providerToInternalSymbols.get(market.providerSymbol) || [];
            if (!existing.includes(market.symbol)) {
                existing.push(market.symbol);
            }
            providerToInternalSymbols.set(market.providerSymbol, existing);
        }
    });
}

function sortMarketsByDefault(markets) {
    return markets.sort((a, b) => {
        if (a.category !== b.category) {
            const order = {
                "USDT Futures": 1,
                "Commodities": 2,
                "Options": 3
            };
            return (order[a.category] || 99) - (order[b.category] || 99);
        }

        return Number(a.sortOrder || 999) - Number(b.sortOrder || 999);
    });
}

function sortMarketsByVolumeDescending(markets) {
    return markets.sort((a, b) => {
        const volumeDifference = Number(b.rawVolume || 0) - Number(a.rawVolume || 0);

        if (volumeDifference !== 0) {
            return volumeDifference;
        }

        return Number(a.sortOrder || 999) - Number(b.sortOrder || 999);
    });
}

function getFilteredMarkets() {
    const searchValue = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const sortValue = sortSelect ? sortSelect.value : "volume";
    let markets = [...allMarkets];

    if (activeCategory !== "All") {
        markets = markets.filter((market) => market.category === activeCategory);
    }

    if (searchValue) {
        markets = markets.filter((market) => {
            return [market.symbol, market.providerSymbol, market.pair, market.name, market.category]
                .some((value) => String(value || "").toLowerCase().includes(searchValue));
        });
    }

    if (sortValue === "gainers") {
        markets.sort((a, b) => Number(b.change) - Number(a.change));
    } else if (sortValue === "losers") {
        markets.sort((a, b) => Number(a.change) - Number(b.change));
    } else if (sortValue === "volume") {
        sortMarketsByVolumeDescending(markets);
    } else if (sortValue === "price") {
        markets.sort((a, b) => Number(b.rawPrice || 0) - Number(a.rawPrice || 0));
    } else {
        sortMarketsByDefault(markets);
    }

    return markets;
}

function renderCounts(stats = null) {
    const futures = allMarkets.filter((market) => market.category === "USDT Futures");
    const commodities = allMarkets.filter((market) => market.category === "Commodities");
    const options = allMarkets.filter((market) => market.category === "Options");
    const maxLev = stats?.max_leverage || Math.max(...futures.concat(commodities).map((market) => Number(String(market.leverage).replace("x", "")) || 1), 1);

    if (totalContracts) totalContracts.textContent = stats?.total_contracts || allMarkets.length;
    if (maxLeverageText) maxLeverageText.textContent = `${maxLev}x`;
    if (usdtCount) usdtCount.textContent = stats?.futures_count || futures.length;
    if (commodityCount) commodityCount.textContent = stats?.commodity_count || commodities.length;
    if (optionsCount) optionsCount.textContent = stats?.options_count || options.length;
    if (allCount) allCount.textContent = stats?.total_contracts || allMarkets.length;
}

function renderSideList(container, markets) {
    if (!container) return;

    if (!markets.length) {
        container.innerHTML = `<div class="rounded-2xl bg-slate-950/70 p-4 text-sm font-bold text-slate-500">No live rows available.</div>`;
        return;
    }

    container.innerHTML = markets.slice(0, 4).map((market) => `
        <a href="${escapeHtml(getTradeLink(market))}" data-trade-symbol="${escapeHtml(market.symbol)}" class="flex items-center justify-between gap-3 rounded-2xl bg-slate-950/70 p-3 transition hover:bg-cyan-400/10">
            <div class="flex min-w-0 items-center gap-3">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-xs font-black text-cyan-400">
                    ${escapeHtml(getPairInitials(market.pair))}
                </div>
                <div class="min-w-0">
                    <p class="truncate text-sm font-black text-white">${escapeHtml(market.pair)}</p>
                    <p class="truncate text-xs text-slate-500">${escapeHtml(market.ltp)}</p>
                </div>
            </div>
            <p class="shrink-0 text-xs font-black ${getChangeClass(market.change)}">${escapeHtml(formatChange(market.change))}</p>
        </a>
    `).join("");

    initTradeLinkStorage();
}

function renderSidePanels() {
    const liveMarkets = allMarkets.filter((market) => isFuturesCategory(market.category) && market.isLive);
    const gainers = [...liveMarkets].sort((a, b) => Number(b.change) - Number(a.change));
    const losers = [...liveMarkets].sort((a, b) => Number(a.change) - Number(b.change));
    const trending = liveMarkets.filter((market) => ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "XAUUSD"].includes(market.symbol));

    renderSideList(topGainersList, gainers);
    renderSideList(topLosersList, losers);
    renderSideList(trendingList, trending.length ? trending : liveMarkets);
}

function updateHeading() {
    if (marketBoardTitle) marketBoardTitle.textContent = `${activeCategory} Markets`;

    if (!marketBoardSubtitle) return;

    if (activeCategory === "USDT Futures") {
        marketBoardSubtitle.textContent = "Backend-approved Binance Futures symbols with live ticker updates.";
    } else if (activeCategory === "Commodities") {
        marketBoardSubtitle.textContent = "XAUUSD is user-facing Gold; backend routes to Binance XAUUSDT.";
    } else if (activeCategory === "Options") {
        marketBoardSubtitle.textContent = "BTC/ETH options entries route to the backend-controlled Options terminal.";
    } else {
        marketBoardSubtitle.textContent = "All active company-approved trading markets from backend.";
    }
}

function renderDesktopTable(markets) {
    if (!tableBody) return;

    tableBody.innerHTML = markets.map((market) => {
        const tradeText = getTradeText(market);
        return `
            <tr class="transition hover:bg-cyan-400/[0.04]">
                <td class="px-5 py-5">
                    <div class="flex items-center gap-4">
                        <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-sm font-black text-cyan-400">
                            ${escapeHtml(getPairInitials(market.pair))}
                        </div>
                        <div>
                            <a href="${escapeHtml(getTradeLink(market))}" class="font-black text-white hover:text-cyan-400" data-trade-symbol="${escapeHtml(market.symbol)}">
                                ${escapeHtml(market.pair)}
                            </a>
                            <p class="mt-1 text-xs text-slate-500">${escapeHtml(market.name)}</p>
                        </div>
                    </div>
                </td>
                <td class="px-5 py-5"><span class="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-400">${escapeHtml(market.leverage)}</span></td>
                <td class="px-5 py-5">
                    <p class="font-black text-white">${escapeHtml(market.ltp)}</p>
                </td>
                <td class="px-5 py-5"><span class="rounded-full px-3 py-1 text-xs font-black ${getChangeBadgeClass(market.change)}">${escapeHtml(formatChange(market.change))}</span></td>
                <td class="px-5 py-5 text-slate-300">${escapeHtml(market.volume)}</td>
                <td class="px-5 py-5 text-right">
                    <a href="${escapeHtml(getTradeLink(market))}" class="inline-flex items-center justify-center rounded-full bg-cyan-400 px-5 py-2.5 text-xs font-black text-slate-950 hover:bg-cyan-300" data-trade-symbol="${escapeHtml(market.symbol)}">
                        ${escapeHtml(tradeText)}
                    </a>
                </td>
            </tr>
        `;
    }).join("");

    initTradeLinkStorage();
}

function renderMobileCards(markets) {
    if (!mobileCards) return;

    mobileCards.innerHTML = markets.map((market) => `
        <article class="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
            <div class="flex items-start justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-sm font-black text-cyan-400">
                        ${escapeHtml(getPairInitials(market.pair))}
                    </div>
                    <div>
                        <h3 class="font-black text-white">${escapeHtml(market.pair)}</h3>
                        <p class="mt-1 text-xs text-slate-500">${escapeHtml(market.category)}</p>
                    </div>
                </div>
                <span class="rounded-full px-3 py-1 text-xs font-black ${getChangeBadgeClass(market.change)}">${escapeHtml(formatChange(market.change))}</span>
            </div>
            <div class="mt-5 grid grid-cols-2 gap-3">
                <div class="rounded-2xl bg-slate-950/70 p-4"><p class="text-xs text-slate-500">Leverage / Mode</p><p class="mt-1 font-black text-cyan-400">${escapeHtml(market.leverage)}</p></div>
                <div class="rounded-2xl bg-slate-950/70 p-4"><p class="text-xs text-slate-500">LTP</p><p class="mt-1 font-black text-white">${escapeHtml(market.ltp)}</p></div>
                <div class="col-span-2 rounded-2xl bg-slate-950/70 p-4"><p class="text-xs text-slate-500">Volume</p><p class="mt-1 font-black text-white">${escapeHtml(market.volume)}</p></div>
            </div>
            <a href="${escapeHtml(getTradeLink(market))}" class="mt-5 inline-flex w-full items-center justify-center rounded-full bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-cyan-300" data-trade-symbol="${escapeHtml(market.symbol)}">
                ${escapeHtml(getTradeText(market))}
            </a>
        </article>
    `).join("");

    initTradeLinkStorage();
}

function renderMarkets() {
    const markets = getFilteredMarkets();

    updateHeading();
    renderDesktopTable(markets);
    renderMobileCards(markets);

    if (emptyState) {
        emptyState.classList.toggle("hidden", markets.length > 0);
    }
}

function refreshMarketUI(stats = null) {
    renderCounts(stats);
    renderSidePanels();
    renderMarkets();
}

function applyMarkets(markets, stats = null) {
    allMarkets = sortMarketsByDefault(markets);
    updateLookupMaps();
    refreshMarketUI(stats);
}

function setActiveTab(button) {
    document.querySelectorAll(".market-tab").forEach((tab) => tab.classList.remove("active-market-tab"));
    button.classList.add("active-market-tab");
}

function initTabs() {
    document.querySelectorAll(".market-tab").forEach((tab) => {
        if (tab.dataset.listenerAttached === "true") return;
        tab.dataset.listenerAttached = "true";
        tab.addEventListener("click", () => {
            activeCategory = tab.getAttribute("data-filter") || "USDT Futures";
            setActiveTab(tab);
            renderMarkets();
        });
    });
}

function initSearchAndSort() {
    if (searchInput && searchInput.dataset.listenerAttached !== "true") {
        searchInput.dataset.listenerAttached = "true";
        searchInput.addEventListener("input", renderMarkets);
    }

    if (sortSelect && sortSelect.dataset.listenerAttached !== "true") {
        sortSelect.dataset.listenerAttached = "true";
        sortSelect.addEventListener("change", renderMarkets);
    }
}

function initTradeLinkStorage() {
    document.querySelectorAll("[data-trade-symbol]").forEach((link) => {
        if (link.dataset.listenerAttached === "true") return;
        link.dataset.listenerAttached = "true";
        link.addEventListener("click", () => {
            const symbol = link.getAttribute("data-trade-symbol");
            const market = marketMetaBySymbol.get(symbol);

            if (!market) return;

            if (isOptionsCategory(market.category)) {
                localStorage.setItem("traidiumx_selected_options_symbol", market.providerSymbol || "BTCUSDT");
                return;
            }

            localStorage.setItem("traidiumx_selected_symbol", market.symbol);
        });
    });
}

function scheduleMarketUIRefresh() {
    if (marketUiRefreshTimer) return;

    marketUiRefreshTimer = window.setTimeout(() => {
        marketUiRefreshTimer = null;
        refreshMarketUI();
    }, MARKET_LIVE_UI_REFRESH_MS);
}

function updateMarketPriceFromTicker(providerSymbol, ticker, shouldRender = true) {
    const internalSymbols = providerToInternalSymbols.get(providerSymbol) || [];

    if (!internalSymbols.length) return false;

    const price = Number(ticker.c || ticker.lastPrice || ticker.price || 0);
    const change = Number(ticker.P || ticker.priceChangePercent || 0);
    const volume = Number(ticker.q || ticker.quoteVolume || 0);
    const highPrice = Number(ticker.h || ticker.highPrice || 0);
    const lowPrice = Number(ticker.l || ticker.lowPrice || 0);
    const updatedAt = new Date().toISOString();

    let changed = false;

    internalSymbols.forEach((internalSymbol) => {
        const index = allMarkets.findIndex((market) => market.symbol === internalSymbol);

        if (index === -1) return;

        const oldMarket = allMarkets[index];
        const nextPrice = price > 0 ? price : oldMarket.rawPrice;

        allMarkets[index] = {
            ...oldMarket,
            rawPrice: nextPrice,
            ltp: nextPrice > 0 ? `${formatNumber(nextPrice, getPriceDecimals(nextPrice))} ${oldMarket.quoteAsset}` : oldMarket.ltp,
            change: Number.isFinite(change) ? change : oldMarket.change,
            rawVolume: volume > 0 ? volume : oldMarket.rawVolume,
            volume: volume > 0 ? formatVolume(volume, oldMarket.quoteAsset) : oldMarket.volume,
            highPrice: highPrice > 0 ? highPrice : oldMarket.highPrice,
            lowPrice: lowPrice > 0 ? lowPrice : oldMarket.lowPrice,
            isLive: nextPrice > 0,
            updatedAt,
            source: "binance_live_feed",
            sourceLabel: "Binance Live"
        };

        changed = true;
    });

    if (changed) {
        updateLookupMaps();
        if (shouldRender) scheduleMarketUIRefresh();
    }

    return changed;
}

async function refreshBinanceTickerFallback() {
    if (document.hidden || !providerToInternalSymbols.size) return;

    const providerSymbols = [...providerToInternalSymbols.keys()]
        .filter((providerSymbol) => providerSymbol && providerSymbol.endsWith("USDT"))
        .slice(0, 60);

    if (!providerSymbols.length) return;

    try {
        const params = encodeURIComponent(JSON.stringify(providerSymbols));
        const response = await fetch(`${BINANCE_TICKER_URL}?symbols=${params}`, { cache: "no-store" });

        if (!response.ok) return;

        const tickers = await response.json();
        if (!Array.isArray(tickers)) return;

        let changed = false;
        tickers.forEach((ticker) => {
            const providerSymbol = normalizeSymbol(ticker.s || ticker.symbol || "");
            if (providerSymbol && updateMarketPriceFromTicker(providerSymbol, ticker, false)) {
                changed = true;
            }
        });

        if (changed) scheduleMarketUIRefresh();
    } catch (error) {
        console.warn("Markets Binance fallback failed:", error);
    }
}

function startMarketWebSocket() {
    if (marketSocket) {
        marketSocket.close();
        marketSocket = null;
    }

    const streams = [...providerToInternalSymbols.keys()]
        .filter((providerSymbol) => providerSymbol && providerSymbol.endsWith("USDT"))
        .map((providerSymbol) => `${providerSymbol.toLowerCase()}@ticker`);

    if (!streams.length) return;

    try {
        if (marketSocketReconnectTimer) {
            clearTimeout(marketSocketReconnectTimer);
            marketSocketReconnectTimer = null;
        }

        marketSocket = new WebSocket(`${BINANCE_WS_BASE}${streams.join("/")}`);

        marketSocket.onopen = () => setMarketStatus("Live", "live", "Backend market board + Binance live feed");
        marketSocket.onmessage = (event) => {
            try {
                const response = JSON.parse(event.data);
                const ticker = response.data || {};
                const providerSymbol = normalizeSymbol(ticker.s || ticker.symbol || "");

                if (providerSymbol) updateMarketPriceFromTicker(providerSymbol, ticker);
            } catch (error) {
                console.error("Markets WebSocket parse error:", error);
            }
        };
        marketSocket.onerror = () => console.warn("Markets WebSocket error; REST/backend fallback remains active.");
        marketSocket.onclose = () => {
            console.warn("Markets WebSocket closed. Reconnecting shortly.");
            if (!document.hidden && !marketSocketReconnectTimer) {
                marketSocketReconnectTimer = window.setTimeout(() => {
                    marketSocketReconnectTimer = null;
                    startMarketWebSocket();
                }, 2500);
            }
        };
    } catch (error) {
        console.error("Markets WebSocket start failed:", error);
    }
}

async function refreshMarketBoard(silent = true) {
    try {
        const response = await apiRequest(`${MARKET_API_BASE}/board`);
        const board = normalizeBoardResponse(response);

        if (!board.markets.length) {
            throw new Error("Backend market board returned no active markets.");
        }

        applyMarkets(board.markets, board.stats);
        setBoardUpdatedTime(board.lastUpdated, board.provider || board.source);
        setMarketStatus("Live", "live", board.warnings.length ? "Live with provider warnings" : "Backend market board + Binance live feed");

        if (!silent) startMarketWebSocket();
    } catch (error) {
        console.error("Market board refresh failed:", error);

        if (!silent) {
            allMarkets = [];
            refreshMarketUI({ total_contracts: 0, futures_count: 0, commodity_count: 0, options_count: 0, max_leverage: 0 });
            setMarketStatus("Offline", "error", showApiError(error, "Backend market board unavailable"));
        }
    } finally {
        closeMarketsPageIntro();

        if (typeof window.hidePageLoader === "function") {
            window.hidePageLoader();
        }
    }
}

function startMarketBoardPolling() {
    if (marketBoardTimer) {
        clearInterval(marketBoardTimer);
        marketBoardTimer = null;
    }

    if (marketBinanceFallbackTimer) {
        clearInterval(marketBinanceFallbackTimer);
        marketBinanceFallbackTimer = null;
    }

    if (marketUiRefreshTimer) {
        clearTimeout(marketUiRefreshTimer);
        marketUiRefreshTimer = null;
    }

    if (marketSocketReconnectTimer) {
        clearTimeout(marketSocketReconnectTimer);
        marketSocketReconnectTimer = null;
    }

    if (marketBinanceFallbackTimer) {
        clearInterval(marketBinanceFallbackTimer);
        marketBinanceFallbackTimer = null;
    }

    marketBoardTimer = window.setInterval(() => {
        if (!document.hidden) refreshMarketBoard(true);
    }, MARKET_BOARD_REFRESH_MS);

    marketBinanceFallbackTimer = window.setInterval(() => {
        refreshBinanceTickerFallback();
    }, MARKET_BINANCE_FALLBACK_MS);
}

function getMarketSliderElements() {
    const slider = document.getElementById("topMarketSlider");
    const slides = slider ? Array.from(slider.children) : [];
    const dots = Array.from(document.querySelectorAll("[data-slide-dot]"));

    return { slider, slides, dots };
}

function isMarketSliderMobile() {
    return window.matchMedia("(max-width: 1023px)").matches;
}

function updateMarketSliderDots(index, dots) {
    dots.forEach((dot, dotIndex) => {
        dot.className = dotIndex === index
            ? "h-1.5 w-5 rounded-full bg-violet-500 transition-all duration-300 cursor-pointer"
            : "h-1.5 w-1.5 rounded-full bg-slate-700 transition-all duration-300 cursor-pointer";
    });
}

function getMarketSlideOffset(slider, slide) {
    const sliderRect = slider.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    return slider.scrollLeft + slideRect.left - sliderRect.left;
}

function goToMarketSlide(index, behavior = "smooth") {
    const { slider, slides, dots } = getMarketSliderElements();

    if (!slider || !slides.length || !isMarketSliderMobile()) return;

    marketSliderIndex = ((index % slides.length) + slides.length) % slides.length;
    slider.scrollTo({
        left: getMarketSlideOffset(slider, slides[marketSliderIndex]),
        behavior
    });
    updateMarketSliderDots(marketSliderIndex, dots);
}

function stopMarketSliderAuto() {
    if (marketSliderAutoTimer) {
        clearInterval(marketSliderAutoTimer);
        marketSliderAutoTimer = null;
    }
}

function startMarketSliderAuto() {
    stopMarketSliderAuto();

    const { slides } = getMarketSliderElements();
    if (!isMarketSliderMobile() || slides.length < 2 || document.hidden) return;

    marketSliderAutoTimer = window.setInterval(() => {
        goToMarketSlide(marketSliderIndex + 1, "smooth");
    }, MARKET_SLIDER_INTERVAL_MS);
}

function restartMarketSliderAuto() {
    stopMarketSliderAuto();

    if (marketSliderRestartTimer) {
        clearTimeout(marketSliderRestartTimer);
    }

    marketSliderRestartTimer = window.setTimeout(() => {
        marketSliderRestartTimer = null;
        startMarketSliderAuto();
    }, MARKET_SLIDER_INTERVAL_MS);
}

function syncMarketSliderIndex() {
    const { slider, slides, dots } = getMarketSliderElements();
    if (!slider || !slides.length || !isMarketSliderMobile()) return;

    const sliderLeft = slider.getBoundingClientRect().left;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    slides.forEach((slide, index) => {
        const distance = Math.abs(slide.getBoundingClientRect().left - sliderLeft);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
        }
    });

    marketSliderIndex = closestIndex;
    updateMarketSliderDots(marketSliderIndex, dots);
}

function initMarketSlider() {
    const { slider, slides, dots } = getMarketSliderElements();
    if (!slider || !slides.length || !dots.length) return;

    if (slider.dataset.sliderInitialized !== "true") {
        slider.dataset.sliderInitialized = "true";

        let scrollFrame = null;
        slider.addEventListener("scroll", () => {
            if (scrollFrame) cancelAnimationFrame(scrollFrame);
            scrollFrame = requestAnimationFrame(() => {
                syncMarketSliderIndex();
                scrollFrame = null;
            });
        }, { passive: true });

        ["pointerdown", "touchstart"].forEach((eventName) => {
            slider.addEventListener(eventName, stopMarketSliderAuto, { passive: true });
        });

        ["pointerup", "pointercancel", "touchend"].forEach((eventName) => {
            slider.addEventListener(eventName, restartMarketSliderAuto, { passive: true });
        });
    }

    dots.forEach((dot, index) => {
        if (dot.dataset.listenerAttached === "true") return;
        dot.dataset.listenerAttached = "true";
        dot.addEventListener("click", () => {
            goToMarketSlide(index, "smooth");
            restartMarketSliderAuto();
        });
    });

    if (window.marketSliderResizeAttached !== true) {
        window.marketSliderResizeAttached = true;
        window.addEventListener("resize", () => {
            if (marketSliderResizeTimer) clearTimeout(marketSliderResizeTimer);
            marketSliderResizeTimer = window.setTimeout(() => {
                marketSliderResizeTimer = null;
                if (isMarketSliderMobile()) {
                    goToMarketSlide(marketSliderIndex, "auto");
                    startMarketSliderAuto();
                } else {
                    stopMarketSliderAuto();
                    slider.scrollTo({ left: 0, behavior: "auto" });
                }
            }, 180);
        }, { passive: true });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                stopMarketSliderAuto();
            } else {
                startMarketSliderAuto();
            }
        });
    }

    updateMarketSliderDots(marketSliderIndex, dots);
    startMarketSliderAuto();
}

async function loadMarkets() {
    setMarketStatus("", "loading");
    initTabs();
    initSearchAndSort();
    initMarketSlider();

    if (typeof apiRequest !== "function") {
        setMarketStatus("Config Error", "error", "api-config.js missing");
        closeMarketsPageIntro();
        return;
    }

    await refreshMarketBoard(false);
    startMarketBoardPolling();
}

window.addEventListener("pagehide", () => {
    if (marketSocket) {
        marketSocket.close();
        marketSocket = null;
    }

    if (marketBoardTimer) {
        clearInterval(marketBoardTimer);
        marketBoardTimer = null;
    }

    if (marketBinanceFallbackTimer) {
        clearInterval(marketBinanceFallbackTimer);
        marketBinanceFallbackTimer = null;
    }

    if (marketUiRefreshTimer) {
        clearTimeout(marketUiRefreshTimer);
        marketUiRefreshTimer = null;
    }

    if (marketSocketReconnectTimer) {
        clearTimeout(marketSocketReconnectTimer);
        marketSocketReconnectTimer = null;
    }

    stopMarketSliderAuto();

    if (marketSliderRestartTimer) {
        clearTimeout(marketSliderRestartTimer);
        marketSliderRestartTimer = null;
    }

    if (marketSliderResizeTimer) {
        clearTimeout(marketSliderResizeTimer);
        marketSliderResizeTimer = null;
    }

    if (marketIntroHideTimer) {
        clearTimeout(marketIntroHideTimer);
        marketIntroHideTimer = null;
    }

    if (marketIntroRemoveTimer) {
        clearTimeout(marketIntroRemoveTimer);
        marketIntroRemoveTimer = null;
    }

    if (marketIntroSafetyTimer) {
        clearTimeout(marketIntroSafetyTimer);
        marketIntroSafetyTimer = null;
    }
});

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadMarkets);
} else {
    loadMarkets();
}

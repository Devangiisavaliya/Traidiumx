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

function generateDynamicCoinSvg(symbolKey) {
    let hash = 0;
    const str = String(symbolKey || "COIN").toUpperCase();
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    const label = str.length > 5 ? str.slice(0, 4) : str;
    const fontSize = label.length > 3 ? "8.5" : "10.5";
    const safeStr = escapeHtml(str);

    return `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md">
        <defs>
            <linearGradient id="coinGrad_${safeStr}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="hsl(${hue}, 80%, 45%)"/>
                <stop offset="100%" stop-color="hsl(${(hue + 45) % 360}, 90%, 25%)"/>
            </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="16" fill="url(#coinGrad_${safeStr})"/>
        <circle cx="16" cy="16" r="14.5" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
        <text x="16" y="20.5" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="-0.3">${escapeHtml(label)}</text>
    </svg>`;
}

function getCoinLogoSvg(pair) {
    const rawPair = String(pair || "").replace(" Options", "").trim();
    let symbolKey = rawPair.split("-")[0].toUpperCase();

    if (symbolKey.endsWith("USDT") && symbolKey.length > 4) {
        symbolKey = symbolKey.slice(0, -4);
    } else if (symbolKey.endsWith("USD") && symbolKey.length > 3 && symbolKey !== "XAUUSD") {
        symbolKey = symbolKey.slice(0, -3);
    }

    const cleanBaseKey = symbolKey.replace(/^1000/, "");

    const pepeLogo = `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#0f2b1d"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#22c55e" stroke-width="1"/><path fill="#22c55e" d="M9 14c0-3 3-5 7-5s7 2 7 5c0 1.5-.5 3-1.5 4.2C20.5 19.5 18.5 21 16 21s-4.5-1.5-5.5-2.8C9.5 17 9 15.5 9 14z"/><circle cx="12.5" cy="13" r="2.2" fill="#fff"/><circle cx="19.5" cy="13" r="2.2" fill="#fff"/><circle cx="13" cy="13" r="1" fill="#0f2b1d"/><circle cx="20" cy="13" r="1" fill="#0f2b1d"/><path stroke="#0f2b1d" stroke-width="1.2" stroke-linecap="round" d="M12 17.5c2 1.2 6 1.2 8 0"/></svg>`;
    const shibLogo = `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#2b1509"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#f97316" stroke-width="1"/><path fill="#f97316" d="M8 10l4 4-2 6 6 3 6-3-2-6 4-4-5 1-3-4-3 4z"/><polygon fill="#fff" points="13,15 11,19 15,18"/><polygon fill="#fff" points="19,15 21,19 17,18"/><polygon fill="#000" points="15,20 17,20 16,21.5"/></svg>`;

    const logos = {
        "BTC": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#f7931a"/><path fill="#fff" d="M23.18 13.84c.34-2.28-1.4-3.5-3.78-4.31l.77-3.1-1.89-.47-.75 3c-.5 0-1-.13-1.5-.24l.76-3.05-1.89-.47-.77 3.09c-.41-.09-.82-.19-1.22-.29l-2.61-.65-.5 2.02s1.4.32 1.37.34c.77.19.9.7.88 1.1l-.88 3.53c.05.01.12.04.2.08l-.2-.05-1.23 4.94c-.09.23-.33.58-.87.45.02.03-1.37-.34-1.37-.34l-.94 2.18 2.47.62c.46.12.91.24 1.36.36l-.78 3.14 1.89.47.77-3.1c.52.14 1.02.27 1.52.39l-.77 3.09 1.89.47.78-3.13c3.22.61 5.64.36 6.66-2.55.82-2.34-.04-3.69-1.74-4.57 1.24-.29 2.17-1.1 2.42-2.77zm-4.33 6.05c-.58 2.35-4.53 1.08-5.8.76l1.04-4.16c1.28.32 5.37.95 4.76 3.4zm.59-6.08c-.53 2.14-3.83.99-4.89.73l.94-3.77c1.06.27 4.49.77 3.95 3.04z"/></svg>`,
        "BCH": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#8dc351"/><path fill="#fff" d="M22.5 13.5c.3-2.1-1.3-3.2-3.5-4l.7-2.9-1.7-.4-.7 2.8c-.5-.1-.9-.2-1.4-.3l.7-2.8-1.7-.4-.7 2.8c-.4-.1-.8-.2-1.1-.3l-2.4-.6-.5 1.9s1.3.3 1.3.3c.7.2.8.6.8 1l-.8 3.3c.1 0 .1 0 .2.1l-.2 0-1.1 4.6c-.1.2-.3.5-.8.4 0 0-1.3-.3-1.3-.3l-.9 2 2.3.6c.4.1.8.2 1.3.3l-.7 2.9 1.7.4.7-2.9c.5.1.9.2 1.4.3l-.7 2.9 1.7.4.7-2.9c3 .6 5.2.3 6.2-2.3.8-2.1 0-3.4-1.6-4.2 1.1-.3 2-1 2.2-2.5zm-4 5.6c-.5 2.1-4.1 1-5.3.7l.9-3.8c1.2.3 4.9.9 4.4 3.1zm.5-5.6c-.5 1.9-3.5.9-4.4.7l.8-3.4c.9.2 4.1.7 3.6 2.7z"/></svg>`,
        "ETH": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#627eea"/><path fill="#fff" fill-opacity=".6" d="M16 4v8.87l7.5 3.35z"/><path fill="#fff" d="M16 4L8.5 16.22l7.5-3.35z"/><path fill="#fff" fill-opacity=".6" d="M16 21.97v6.03l7.5-10.46z"/><path fill="#fff" d="M16 28v-6.03L8.5 17.54z"/><path fill="#fff" fill-opacity=".2" d="M16 20.57l7.5-4.35L16 12.87z"/><path fill="#fff" fill-opacity=".6" d="M8.5 16.22l7.5 4.35v-7.7z"/></svg>`,
        "BNB": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#f3ba2f"/><path fill="#fff" d="M12.12 13.84L16 9.96l3.88 3.88 2.2-2.2L16 5.56l-6.08 6.08zm-6.56 2.16l2.2-2.2L11.64 16l-3.88 3.88-2.2-2.2L7.68 16zm12.32 0l3.88-3.88 2.2 2.2L24.32 16l3.88 3.88-2.2 2.2zm-5.76 2.16L16 22.04l-3.88-3.88-2.2 2.2L16 26.44l6.08-6.08zm0-4.32L16 12.12l1.72 1.72L16 15.56l-1.72-1.72zm0 4.32L16 16.44l1.72 1.72L16 19.88l-1.72-1.72z"/></svg>`,
        "SOL": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#12141d"/><defs><linearGradient id="solGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00ffa3"/><stop offset="100%" stop-color="#dc1fff"/></linearGradient></defs><path fill="url(#solGrad)" d="M8 20.7l2.1-2.1h13.9l-2.1 2.1H8zm5.9-6.3l-2.1 2.1h13.9l2.1-2.1H13.9zM8 9.3l2.1-2.1h13.9l-2.1 2.1H8z"/></svg>`,
        "XRP": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#23292f"/><path fill="#fff" d="M22.67 8h2.66l-6.4 6.34 6.47 6.46h-2.66l-5.14-5.13-5.14 5.13H9.8l6.47-6.46L9.87 8h2.66l5.14 5.13L22.67 8z"/></svg>`,
        "DOGE": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#c2a633"/><path fill="#fff" d="M12 9h5.5c3.5 0 6.5 2.5 6.5 7s-3 7-6.5 7H12V9zm4 3v8h1.5c2 0 3.5-1.5 3.5-4s-1.5-4-3.5-4H16z"/><path fill="#fff" d="M9 15h9v2H9z"/></svg>`,
        "PEPE": pepeLogo,
        "1000PEPE": pepeLogo,
        "SHIB": shibLogo,
        "1000SHIB": shibLogo,
        "SUI": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#0f2942"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#38bdf8" stroke-width="1"/><path fill="#38bdf8" d="M16 6c-4 5.5-7 9.8-7 13.2 0 3.8 3.1 6.8 7 6.8s7-3 7-6.8C23 15.8 20 11.5 16 6zm0 16c-1.7 0-3-1.3-3-3 0-1.8 1.5-4.2 3-6.1 1.5 1.9 3 4.3 3 6.1 0 1.7-1.3 3-3 3z"/></svg>`,
        "NEAR": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#082b28"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#14b8a6" stroke-width="1"/><path fill="#14b8a6" d="M9.5 9h3.2l6.8 10.2V9h3v14h-3.2L12.5 12.8V23h-3V9z"/></svg>`,
        "FIL": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#08243b"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#0094ff" stroke-width="1"/><path fill="#0094ff" d="M11 7h10v3.5h-6.5v3.5H20v3.5h-5.5V25H11V7z"/></svg>`,
        "XLM": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#092233"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#14b6e4" stroke-width="1"/><path fill="#14b6e4" d="M24 8L8 15.5l5 2.5L20 11l-4.5 7.5L22 21 24 8zM8 24l5-2.5 3 1.5-8 1z"/></svg>`,
        "INJ": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#06212e"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#00f2ff" stroke-width="1"/><path fill="none" stroke="#00f2ff" stroke-width="2.5" stroke-linecap="round" d="M10 22C7.5 19.5 7.5 14 11 10.5S20 8 22.5 11.5s0 8-3.5 10.5S10 24 10 22z"/><circle cx="16" cy="16" r="3" fill="#00f2ff"/></svg>`,
        "DOT": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#141927"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#e6007a" stroke-width="1"/><circle cx="16" cy="9.5" r="2.2" fill="#e6007a"/><circle cx="16" cy="22.5" r="2.2" fill="#e6007a"/><circle cx="9.5" cy="16" r="2.2" fill="#e6007a"/><circle cx="22.5" cy="16" r="2.2" fill="#e6007a"/><circle cx="16" cy="16" r="1.8" fill="#e6007a"/></svg>`,
        "WIF": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#281b10"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#e3a152" stroke-width="1"/><path fill="#e3a152" d="M8 17c0-4 3.5-7 8-7s8 3 8 7v2H8v-2z"/><path fill="#8c5825" d="M6 18c0-1.5 4.5-2.5 10-2.5s10 1 10 2.5-4.5 2.5-10 2.5S6 19.5 6 18z"/></svg>`,
        "FET": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#072136"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#00a3ff" stroke-width="1"/><circle cx="11" cy="11" r="2" fill="#00a3ff"/><circle cx="16" cy="11" r="2" fill="#00a3ff"/><circle cx="21" cy="11" r="2" fill="#00a3ff"/><circle cx="11" cy="16" r="2" fill="#00a3ff"/><circle cx="16" cy="16" r="2.5" fill="#fff"/><circle cx="21" cy="16" r="2" fill="#00a3ff"/><circle cx="16" cy="21" r="2" fill="#00a3ff"/></svg>`,
        "ARB": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#081d33"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#28a0f0" stroke-width="1"/><path fill="#28a0f0" d="M16 7l8 12.5h-4.5L16 14l-3.5 5.5H8L16 7z"/><path fill="#fff" d="M16 11l4.5 7h-2.5L16 15l-2 3h-2.5l4.5-7z"/></svg>`,
        "ETC": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#062618"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#34fa99" stroke-width="1"/><path fill="#34fa99" fill-opacity=".7" d="M16 5v8.5l7 3.5z"/><path fill="#34fa99" d="M16 5L9 17l7-3.5z"/><path fill="#34fa99" fill-opacity=".7" d="M16 20.5v6.5l7-9.5z"/><path fill="#34fa99" d="M16 27v-6.5L9 17.5z"/></svg>`,
        "ICP": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#062133"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#29abe2" stroke-width="1"/><path fill="none" stroke="#29abe2" stroke-width="2.5" d="M11 16c-3 0-5-2-5-4s2-4 5-4 5 4 5 4 2 4 5 4 5-2 5-4-2-4-5-4-5 4-5 4-2-4-5-4z"/></svg>`,
        "OP": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#ff0420"/><path fill="#fff" d="M12 11c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 7c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm8-7c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 7c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`,
        "TIA": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#1e083a"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#7b2bf9" stroke-width="1"/><circle cx="16" cy="16" r="5" fill="#7b2bf9"/><circle cx="16" cy="8" r="2" fill="#c084fc"/><circle cx="16" cy="24" r="2" fill="#c084fc"/><circle cx="8" cy="16" r="2" fill="#c084fc"/><circle cx="24" cy="16" r="2" fill="#c084fc"/></svg>`,
        "ATOM": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#2e3148"/><circle cx="16" cy="16" r="3" fill="#fff"/><ellipse cx="16" cy="16" rx="10" ry="4" fill="none" stroke="#fff" stroke-width="1.5" transform="rotate(30 16 16)"/><ellipse cx="16" cy="16" rx="10" ry="4" fill="none" stroke="#fff" stroke-width="1.5" transform="rotate(-30 16 16)"/></svg>`,
        "RENDER": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#2e0505"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#e60000" stroke-width="1"/><path fill="#e60000" d="M10 8h7.5c2.5 0 4.5 1.5 4.5 4s-1.5 3.5-3.5 3.8L22 24h-4l-3-7.5H13V24h-3V8zm3 3.5v5h4c1.2 0 2-.8 2-2.5s-.8-2.5-2-2.5h-4z"/></svg>`,
        "RNDR": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#2e0505"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#e60000" stroke-width="1"/><path fill="#e60000" d="M10 8h7.5c2.5 0 4.5 1.5 4.5 4s-1.5 3.5-3.5 3.8L22 24h-4l-3-7.5H13V24h-3V8zm3 3.5v5h4c1.2 0 2-.8 2-2.5s-.8-2.5-2-2.5h-4z"/></svg>`,
        "SEI": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#2e070e"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#9e1b32" stroke-width="1"/><path fill="#9e1b32" d="M10 10c0-1.5 3-2 6-2s6 .5 6 2c0 2.5-12 2.5-12 6s9 4.5 12 2c0 2-3 4-6 4s-6-1-6-2.5"/></svg>`,
        "MATIC": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#8247e5"/><path fill="#fff" d="M21.2 12.8l-3.7-2.1c-.3-.2-.7-.2-1 0l-3.7 2.1c-.3.2-.5.5-.5.8v4.3c0 .3.2.7.5.8l3.7 2.1c.3.2.7.2 1 0l3.7-2.1c.3-.2.5-.5.5-.8v-4.3c0-.4-.2-.7-.5-.9zm-4.2 6.1l-2.4-1.4v-2.8l2.4 1.4v2.8z"/></svg>`,
        "POL": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#8247e5"/><path fill="#fff" d="M21.2 12.8l-3.7-2.1c-.3-.2-.7-.2-1 0l-3.7 2.1c-.3.2-.5.5-.5.8v4.3c0 .3.2.7.5.8l3.7 2.1c.3.2.7.2 1 0l3.7-2.1c.3-.2.5-.5.5-.8v-4.3c0-.4-.2-.7-.5-.9zm-4.2 6.1l-2.4-1.4v-2.8l2.4 1.4v2.8z"/></svg>`,
        "FTM": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#1969ff"/><path fill="#fff" d="M16 6l7 5.5V20.5L16 26l-7-5.5V11.5L16 6zm0 3.5L11.5 13 16 16.5 20.5 13 16 9.5zm0 13l4.5-3.5L16 15.5 11.5 19l4.5 3.5z"/></svg>`,
        "ADA": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#0033ad"/><circle cx="16" cy="16" r="4" fill="#fff"/><circle cx="16" cy="8" r="1.5" fill="#fff"/><circle cx="16" cy="24" r="1.5" fill="#fff"/><circle cx="8" cy="16" r="1.5" fill="#fff"/><circle cx="24" cy="16" r="1.5" fill="#fff"/></svg>`,
        "AVAX": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#e84142"/><path fill="#fff" d="M16 7l8.5 15h-4.5L16 15l-4 7H7.5L16 7z"/></svg>`,
        "LINK": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#375bd2"/><path fill="#fff" d="M16 6l7 4v8l-7 4-7-4v-8l7-4zm0 3.5L11.5 12v4L16 18.5l4.5-2.5v-4L16 9.5z"/></svg>`,
        "LTC": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#345d9d"/><path fill="#fff" d="M12 9h3v10h6v3H12V9zm-1 6l8-3v2l-8 3v-2z"/></svg>`,
        "TRX": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#ef0027"/><path fill="#fff" d="M7 8l18 3-7 14L7 8zm4 3l4.5 9 4.5-9H11z"/></svg>`,
        "UNI": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#ff007a"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/><path fill="#ffffff" d="M21.5 7.5l2.8-2.8c.4-.4.4-1 0-1.4s-1-.4-1.4 0l-3.2 3.2c-1.3-.8-2.8-1.2-4.4-1.1-2.4.2-4.6 1.3-6.2 3.1-2.2 2.4-3.2 5.7-2.6 8.9.6 3.2 2.7 5.8 5.7 6.8 1 .3 2.1.5 3.1.5 3.1 0 6.1-1.4 8.1-3.8 2-2.3 2.8-5.4 2.2-8.4-.3-1.6-1.1-3.1-2.1-4.2zm-2.8 12.3c-1.5 1.8-3.7 2.8-6 2.8-.8 0-1.6-.1-2.3-.4-2.2-.7-3.8-2.7-4.2-5-.4-2.3.3-4.7 2-6.4 1.2-1.3 2.8-2.1 4.5-2.2 1.2 0 2.4.4 3.4 1l-2.1 2.1c-.4.4-.4 1 0 1.4s1 .4 1.4 0l3.5-3.5c.7.8 1.2 1.8 1.4 2.9.4 2.3-.2 4.6-1.6 6.3z"/></svg>`,
        "APT": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#18181b"/><path fill="#fff" d="M16 6l9 16H7l9-16zm0 5l-5 9h10l-5-9z"/></svg>`,
        "XAU": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#d4af37"/><path fill="#fff" d="M16 6l8 4.5v11.5L16 26.5 8 22V10.5L16 6zm0 3.5L11 12.3v7.4l5 2.8 5-2.8v-7.4L16 9.5z"/></svg>`,
        "XAUUSD": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#d4af37"/><path fill="#fff" d="M16 6l8 4.5v11.5L16 26.5 8 22V10.5L16 6zm0 3.5L11 12.3v7.4l5 2.8 5-2.8v-7.4L16 9.5z"/></svg>`,
        "SAND": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#0084ff"/><path fill="#fff" d="M10 10h12v3H13v3h9v6H10v-3h9v-3h-9v-6z"/></svg>`,
        "MANTA": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#0046ff"/><path fill="#fff" d="M8 12c4 0 6 3 8 7 2-4 4-7 8-7-2 5-5 9-8 13-3-4-6-8-8-13z"/></svg>`,
        "ORCA": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#00c8b3"/><path fill="#fff" d="M9 16c0-3.5 3-6 7-6s7 2.5 7 6c0 3-2.5 5.5-6 6l4 4h-4l-3-3.5L11 25H8l4-5c-2-1-3-2.5-3-4z"/></svg>`
    };

    if (logos[symbolKey]) {
        return logos[symbolKey];
    }
    if (logos[cleanBaseKey]) {
        return logos[cleanBaseKey];
    }

    return generateDynamicCoinSvg(symbolKey);
}

function getPairInitials(pair) {
    return getCoinLogoSvg(pair);
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
        } else if (type === "live") {
            marketStatusText.innerHTML = `
                <span class="flex items-center gap-2.5">
                    <span class="inline-block h-3.5 w-3.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399]"></span>
                    <span>${status}</span>
                </span>
            `;
            marketStatusText.className = "mt-2 text-3xl font-black text-emerald-400";
        } else {
            marketStatusText.textContent = status;
            marketStatusText.className = "mt-2 text-3xl font-black text-red-400";
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
    
    let rawPrice = Number(item.last_price || item.lastPrice || item.price || 0);
    let rawChange = Number(item.price_change_percent || item.priceChangePercent || item.change || 0);
    let rawVol = Number(item.quote_volume || item.quoteVolume || item.volume || 0);

    if (rawPrice <= 0) {
        if (symbol === "MATIC" || symbol === "MATICUSDT") {
            rawPrice = 0.3794;
            rawChange = -0.28;
            if (rawVol <= 0) rawVol = 21540100;
        } else if (symbol === "FTM" || symbol === "FTMUSDT") {
            rawPrice = 0.6994;
            rawChange = -0.76;
            if (rawVol <= 0) rawVol = 14380500;
        }
    }

    let quoteAsset = item.quote_asset || item.quoteAsset || "USDT";
    let providerSymbol = normalizeSymbol(item.provider_symbol || item.providerSymbol || symbol);
    if (!providerSymbol.endsWith("USDT") && !providerSymbol.endsWith("USD") && category === "USDT Futures") {
        providerSymbol = `${providerSymbol}USDT`;
    }

    return {
        symbol,
        providerSymbol,
        pair: item.pair || symbol,
        name: item.display_name || item.displayName || item.name || symbol,
        category,
        leverage: category === "Options" ? "USDT Settled" : `${String(item.max_leverage || item.maxLeverage || 20).replace("x", "")}x`,
        ltp: rawPrice > 0 ? `${formatNumber(rawPrice, getPriceDecimals(rawPrice))} ${quoteAsset}` : "--",
        rawPrice: rawPrice,
        change: rawChange,
        volume: formatVolume(rawVol, quoteAsset),
        rawVolume: rawVol,
        isLive: Boolean(item.is_live || item.isLive || rawPrice > 0),
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
        <a href="${escapeHtml(getTradeLink(market))}" data-trade-symbol="${escapeHtml(market.symbol)}" class="flex items-center justify-between gap-2.5 rounded-2xl bg-slate-950/70 p-3 transition hover:bg-cyan-400/10">
            <div class="flex min-w-0 items-center gap-2.5">
                <div class="flex shrink-0 items-center justify-center">
                    ${getCoinLogoSvg(market.pair)}
                </div>
                <div class="flex min-w-0 flex-col sm:flex-row sm:items-center sm:gap-2">
                    <span class="truncate text-sm font-black text-white">${escapeHtml(market.pair)}</span>
                    <span class="truncate text-xs font-medium text-slate-400">${escapeHtml(market.ltp)}</span>
                </div>
            </div>
            <span class="shrink-0 text-xs font-black ${getChangeClass(market.change)}">${escapeHtml(formatChange(market.change))}</span>
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
    if (marketBoardTitle) {
        const displayCategory = activeCategory === "USDT Futures" ? "USDT Futures" : activeCategory;
        marketBoardTitle.textContent = `${displayCategory} Markets`;
    }

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
                        <div class="flex shrink-0 items-center justify-center">
                            ${getCoinLogoSvg(market.pair)}
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

    if (!markets.length) {
        mobileCards.innerHTML = "";
        return;
    }

    mobileCards.innerHTML = `
        <div class="rounded-2xl border border-[#1c283d] bg-[#0f1524] divide-y divide-[#192338] overflow-hidden shadow-2xl">
            ${markets.map((market) => {
                const changeVal = Number(market.change) || 0;
                const changeColorClass = changeVal >= 0 ? "text-emerald-400" : "text-rose-400";
                
                const pairStr = String(market.pair || market.symbol || "");
                const parts = pairStr.split("-");
                const baseSymbol = parts[0] || pairStr;
                const quoteSymbol = parts[1] ? `-${parts[1]}` : "";
                
                const rawPriceText = String(market.ltp || "")
                    .replace(" USDT", "")
                    .replace(" USD", "")
                    .trim();

                return `
                    <a href="${escapeHtml(getTradeLink(market))}" data-trade-symbol="${escapeHtml(market.symbol)}" class="flex items-center justify-between px-4 py-3.5 transition active:bg-[#182238] hover:bg-[#141c2e] group">
                        <div class="flex items-center gap-3 min-w-0">
                            <!-- Circular Coin Icon -->
                            <div class="flex shrink-0 items-center justify-center">
                                ${getCoinLogoSvg(market.pair)}
                            </div>
                            
                            <!-- Symbol & Leverage Subtext -->
                            <div class="min-w-0">
                                <div class="flex items-baseline gap-0.5 leading-none">
                                    <span class="font-black text-white text-sm tracking-wide">${escapeHtml(baseSymbol)}</span>
                                    <span class="text-xs font-bold text-slate-400">${escapeHtml(quoteSymbol)}</span>
                                </div>
                                <p class="text-[11px] font-bold text-slate-400 mt-1.5 leading-none">${escapeHtml(market.leverage)}</p>
                            </div>
                        </div>

                        <div class="flex items-center gap-3 shrink-0">
                            <!-- Price & 24H % Change -->
                            <div class="text-right leading-none">
                                <div class="flex items-baseline justify-end gap-1">
                                    <span class="font-black text-white text-sm tracking-tight">${escapeHtml(rawPriceText)}</span>
                                    <span class="text-[10px] font-bold text-slate-400">${escapeHtml(market.quoteAsset || "USDT")}</span>
                                </div>
                                <p class="text-[11px] font-extrabold ${changeColorClass} mt-1.5">${escapeHtml(formatChange(market.change))}</p>
                            </div>

                            <!-- Three Vertical Dots Menu Icon -->
                            <div class="text-slate-500 group-hover:text-slate-300 transition-colors pl-1">
                                <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                                </svg>
                            </div>
                        </div>
                    </a>
                `;
            }).join("")}
        </div>
    `;

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

        marketSocket.onopen = () => setMarketStatus("Operational", "live", "Backend market board + Binance live feed");
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
        setMarketStatus("Operational", "live", board.warnings.length ? "Operational with provider warnings" : "Backend market board + Binance live feed");

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
            ? "h-1.5 w-5 rounded-full bg-cyan-400 shadow-md shadow-cyan-400/50 transition-all duration-300 cursor-pointer"
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
    const txIntroStatus = document.getElementById("marketsIntroStatus");
    if (txIntroStatus) {
        const statuses = [
            "DECRYPTING ORDER BOOK DATA...",
            "SYNCING BLOCKCHAIN CONTRACTS...",
            "ESTABLISHING SECURE PORTAL...",
            "LIVE BOARD ACTIVE"
        ];
        let step = 0;
        const interval = setInterval(() => {
            const el = document.getElementById("marketsIntroStatus");
            if (el && document.getElementById("marketsPageIntro")) {
                if (step < statuses.length) {
                    el.textContent = statuses[step];
                    step++;
                } else {
                    clearInterval(interval);
                }
            } else {
                clearInterval(interval);
            }
        }, 320);
    }

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

"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Futures Terminal - API + Real Candle Movement + Compact Order Book
|--------------------------------------------------------------------------
| Features:
| - Binance Futures REST API initial candles
| - Binance Futures WebSocket live candle / orderbook / trades / ticker
| - Candle updates from BOTH kline + aggTrade price
| - Compact Order Book / Trades tab layout
| - B/S percentage bar
| - Backend JWT login, backend wallet balance and backend order submit
|--------------------------------------------------------------------------
*/

const REST_BASE = "https://fapi.binance.com/fapi/v1";
const WS_BASE = "wss://fstream.binance.com/stream?streams=";

const SESSION_KEY = "traidiumx_demo_session";
const WALLET_KEY = "traidiumx_demo_wallet_v1";
const POSITIONS_KEY = "traidiumx_demo_positions_v1";
const ORDERS_KEY = "traidiumx_demo_orders_v1";
const HISTORY_KEY = "traidiumx_demo_history_v1";

const pairs = [
    { symbol: "BTCUSDT", label: "BTC-USDT", icon: "₿", minQty: 0.001, step: 0.001, maxLeverage: 50, quoteAsset: "USDT", categories: ["layer1"], baseVol: "8.54B", defaultFunding: "0.00996%", defaultChange: -1.25 },
    { symbol: "BNBUSDT", label: "BNB-USDT", icon: "B", minQty: 0.01, step: 0.01, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1"], baseVol: "504.19M", defaultFunding: "0.00000%", defaultChange: 1.00 },
    { symbol: "ETHUSDT", label: "ETH-USDT", icon: "◆", minQty: 0.01, step: 0.01, maxLeverage: 50, quoteAsset: "USDT", categories: ["layer1"], baseVol: "6.53B", defaultFunding: "0.00255%", defaultChange: -0.68 },
    { symbol: "BCHUSDT", label: "BCH-USDT", icon: "C", minQty: 0.01, step: 0.01, maxLeverage: 20, quoteAsset: "USDT", categories: ["layer1"], baseVol: "122.64M", defaultFunding: "0.00181%", defaultChange: -0.16 },
    { symbol: "XRPUSDT", label: "XRP-USDT", icon: "X", minQty: 1, step: 1, maxLeverage: 20, quoteAsset: "USDT", categories: ["layer1"], baseVol: "795.47M", defaultFunding: "0.01000%", defaultChange: -0.38 },
    { symbol: "LTCUSDT", label: "LTC-USDT", icon: "Ł", minQty: 0.01, step: 0.01, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1"], baseVol: "155.06M", defaultFunding: "-0.00333%", defaultChange: -0.82 },
    { symbol: "TRXUSDT", label: "TRX-USDT", icon: "T", minQty: 1, step: 1, maxLeverage: 20, quoteAsset: "USDT", categories: ["layer1"], baseVol: "46.54M", defaultFunding: "+0.00068%", defaultChange: 0.58 },
    { symbol: "ETCUSDT", label: "ETC-USDT", icon: "E", minQty: 0.1, step: 0.1, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1"], baseVol: "46.82M", defaultFunding: "0.01000%", defaultChange: 3.96 },
    { symbol: "LINKUSDT", label: "LINK-USDT", icon: "L", minQty: 0.1, step: 0.1, maxLeverage: 25, quoteAsset: "USDT", categories: ["defi"], baseVol: "200.92M", defaultFunding: "-0.00066%", defaultChange: -4.64 },
    { symbol: "XLMUSDT", label: "XLM-USDT", icon: "X", minQty: 1, step: 1, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1"], baseVol: "86.79M", defaultFunding: "0.01000%", defaultChange: -1.28 },
    { symbol: "ADAUSDT", label: "ADA-USDT", icon: "A", minQty: 1, step: 1, maxLeverage: 20, quoteAsset: "USDT", categories: ["layer1"], baseVol: "191.30M", defaultFunding: "0.01000%", defaultChange: -1.04 },
    { symbol: "SOLUSDT", label: "SOL-USDT", icon: "S", minQty: 0.1, step: 0.1, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1"], baseVol: "1.82B", defaultFunding: "0.00850%", defaultChange: 2.15 },
    { symbol: "DOGEUSDT", label: "DOGE-USDT", icon: "Ð", minQty: 1, step: 1, maxLeverage: 20, quoteAsset: "USDT", categories: ["meme"], baseVol: "412.30M", defaultFunding: "0.01000%", defaultChange: -1.45 },
    { symbol: "AVAXUSDT", label: "AVAX-USDT", icon: "V", minQty: 0.1, step: 0.1, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1"], baseVol: "178.60M", defaultFunding: "0.00920%", defaultChange: -0.95 },
    { symbol: "DOTUSDT", label: "DOT-USDT", icon: "D", minQty: 0.1, step: 0.1, maxLeverage: 20, quoteAsset: "USDT", categories: ["layer1"], baseVol: "88.20M", defaultFunding: "0.00780%", defaultChange: 0.85 },
    { symbol: "ATOMUSDT", label: "ATOM-USDT", icon: "M", minQty: 0.1, step: 0.1, maxLeverage: 20, quoteAsset: "USDT", categories: ["layer1"], baseVol: "62.40M", defaultFunding: "0.01000%", defaultChange: -0.55 },
    { symbol: "UNIUSDT", label: "UNI-USDT", icon: "U", minQty: 0.1, step: 0.1, maxLeverage: 20, quoteAsset: "USDT", categories: ["defi"], baseVol: "74.10M", defaultFunding: "0.00640%", defaultChange: 1.20 },
    { symbol: "APTUSDT", label: "APT-USDT", icon: "P", minQty: 0.1, step: 0.1, maxLeverage: 20, quoteAsset: "USDT", categories: ["layer1"], baseVol: "95.80M", defaultFunding: "0.01000%", defaultChange: -2.10 },
    { symbol: "NEARUSDT", label: "NEAR-USDT", icon: "N", minQty: 0.1, step: 0.1, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1", "ai"], baseVol: "142.30M", defaultFunding: "0.00890%", defaultChange: 3.40 },
    { symbol: "SUIUSDT", label: "SUI-USDT", icon: "S", minQty: 0.1, step: 0.1, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1"], baseVol: "310.50M", defaultFunding: "0.01000%", defaultChange: 4.80 },
    { symbol: "1000PEPEUSDT", label: "PEPE-USDT", icon: "P", minQty: 10, step: 10, maxLeverage: 25, quoteAsset: "USDT", categories: ["meme"], providerSymbol: "1000PEPEUSDT", baseVol: "580.40M", defaultFunding: "0.01000%", defaultChange: -3.20 },
    { symbol: "1000SHIBUSDT", label: "SHIB-USDT", icon: "S", minQty: 10, step: 10, maxLeverage: 25, quoteAsset: "USDT", categories: ["meme"], providerSymbol: "1000SHIBUSDT", baseVol: "215.10M", defaultFunding: "0.01000%", defaultChange: -0.75 },
    { symbol: "MATICUSDT", label: "MATIC-USDT", icon: "M", minQty: 1, step: 1, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1"], baseVol: "84.70M", defaultFunding: "0.01000%", defaultChange: 0.40 },
    { symbol: "ARBUSDT", label: "ARB-USDT", icon: "A", minQty: 0.1, step: 0.1, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1"], baseVol: "110.20M", defaultFunding: "0.00950%", defaultChange: -1.15 },
    { symbol: "OPUSDT", label: "OP-USDT", icon: "O", minQty: 0.1, step: 0.1, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1"], baseVol: "98.40M", defaultFunding: "0.00900%", defaultChange: 1.60 },
    { symbol: "INJUSDT", label: "INJ-USDT", icon: "I", minQty: 0.1, step: 0.1, maxLeverage: 25, quoteAsset: "USDT", categories: ["defi"], baseVol: "82.30M", defaultFunding: "0.01000%", defaultChange: 2.80 },
    { symbol: "WIFUSDT", label: "WIF-USDT", icon: "W", minQty: 1, step: 1, maxLeverage: 25, quoteAsset: "USDT", categories: ["meme", "new"], baseVol: "245.80M", defaultFunding: "0.01000%", defaultChange: -2.60 },
    { symbol: "FETUSDT", label: "FET-USDT", icon: "F", minQty: 1, step: 1, maxLeverage: 25, quoteAsset: "USDT", categories: ["ai"], baseVol: "165.40M", defaultFunding: "0.01000%", defaultChange: 5.10 },
    { symbol: "TIAUSDT", label: "TIA-USDT", icon: "T", minQty: 0.1, step: 0.1, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1", "new"], baseVol: "89.10M", defaultFunding: "0.01000%", defaultChange: -1.80 },
    { symbol: "FILUSDT", label: "FIL-USDT", icon: "F", minQty: 0.1, step: 0.1, maxLeverage: 25, quoteAsset: "USDT", categories: ["ai"], baseVol: "68.30M", defaultFunding: "0.00800%", defaultChange: -0.90 },
    { symbol: "RENDERUSDT", label: "RENDER-USDT", icon: "R", minQty: 0.1, step: 0.1, maxLeverage: 25, quoteAsset: "USDT", categories: ["ai"], baseVol: "135.20M", defaultFunding: "0.01000%", defaultChange: 3.75 },
    { symbol: "SEIUSDT", label: "SEI-USDT", icon: "S", minQty: 1, step: 1, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1", "new"], baseVol: "78.90M", defaultFunding: "0.01000%", defaultChange: 2.20 },
    { symbol: "ICPUSDT", label: "ICP-USDT", icon: "I", minQty: 0.1, step: 0.1, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1"], baseVol: "54.20M", defaultFunding: "0.00750%", defaultChange: -1.10 },
    { symbol: "FTMUSDT", label: "FTM-USDT", icon: "F", minQty: 1, step: 1, maxLeverage: 25, quoteAsset: "USDT", categories: ["layer1"], baseVol: "42.10M", defaultFunding: "0.01000%", defaultChange: 0.90 },
    { symbol: "XAUUSDT", label: "XAU-USDT", icon: "G", minQty: 0.01, step: 0.01, maxLeverage: 20, marketType: "commodity", quoteAsset: "USDT", providerSymbol: "XAUUSDT", categories: ["tradfi"], baseVol: "1.15B", defaultFunding: "0.00500%", defaultChange: 0.35 }
];

const defaultPrices = {
    BTCUSDT: 64200,
    ETHUSDT: 3550,
    BNBUSDT: 590,
    SOLUSDT: 145,
    XRPUSDT: 0.62,
    DOGEUSDT: 0.125,
    ADAUSDT: 0.45,
    AVAXUSDT: 34,
    LINKUSDT: 14,
    LTCUSDT: 82,
    TRXUSDT: 0.12,
    DOTUSDT: 6.8,
    BCHUSDT: 410,
    ATOMUSDT: 7.2,
    UNIUSDT: 9.5,
    APTUSDT: 8.7,
    NEARUSDT: 4.85,
    SUIUSDT: 1.65,
    "1000PEPEUSDT": 0.0092,
    "1000SHIBUSDT": 0.0185,
    MATICUSDT: 0.42,
    ARBUSDT: 0.55,
    OPUSDT: 1.42,
    INJUSDT: 18.5,
    WIFUSDT: 1.75,
    FETUSDT: 1.25,
    TIAUSDT: 5.20,
    FILUSDT: 3.80,
    ETCUSDT: 19.5,
    XLMUSDT: 0.095,
    RENDERUSDT: 5.40,
    SEIUSDT: 0.32,
    ICPUSDT: 7.80,
    FTMUSDT: 0.65,
    XAUUSD: 2350
};

/* =========================
   MOVING LIVE TICKER CONFIG
========================= */

const INR_RATE = 83.35;

const tickerDisplayItems = [
    { symbol: "BTCUSDT", label: "BTC-USDT", quote: "USDT" },
    { symbol: "ETHUSDT", label: "ETH-USDT", quote: "USDT" },
    { symbol: "BNBUSDT", label: "BNB-USDT", quote: "USDT" },
    { symbol: "SOLUSDT", label: "SOL-USDT", quote: "USDT" },
    { symbol: "XRPUSDT", label: "XRP-USDT", quote: "USDT" },
    { symbol: "DOGEUSDT", label: "DOGE-USDT", quote: "USDT" },
    { symbol: "ADAUSDT", label: "ADA-USDT", quote: "USDT" },
    { symbol: "AVAXUSDT", label: "AVAX-USDT", quote: "USDT" },
    { symbol: "LINKUSDT", label: "LINK-USDT", quote: "USDT" },
    { symbol: "LTCUSDT", label: "LTC-USDT", quote: "USDT" },
    { symbol: "TRXUSDT", label: "TRX-USDT", quote: "USDT" },
    { symbol: "DOTUSDT", label: "DOT-USDT", quote: "USDT" },
    { symbol: "XAUUSD", label: "XAUUSD", quote: "USDT" }
];

const state = {
    currentSymbol: "BTCUSDT",
    interval: "1m",
    side: "BUY",
    orderType: "MARKET",
    marginMode: "isolated",

    currentPrice: 0,
    previousPrice: 0,
    currentCandle: null,

    chart: null,
    candleSeries: null,
    volumeSeries: null,

    marketSocket: null,
    tickerSocket: null,
    markPriceSocket: null,
    fastTradePriceSocket: null,
    markPrices: {},
    indexPrices: {},
    fundingRates: {},
    nextFundingTimes: {},
    reconnectTimers: {},
    reconnectAttempts: {},
    intentionalSocketStops: {},
    liveRowsTimer: null,
    fallbackTimer: null,
    candleWatchTimer: null,

    lastCandleUpdateAt: 0,
    activeBottomTab: "positions",
    orderHistoryPage: 1,
    tradeHistoryPage: 1,
    transactionHistoryPage: 1,
    lastPrices: {},
    goldTickerTimer: null,
    goldDepthTimer: null,
    commodityDepthLoading: false,
    lastCommodityDepthLoadAt: 0,

    trades: [],
    orderBook: {
        asks: [],
        bids: []
    },

    // Server-backed 7-day Futures wishlist.
    recentSymbols: [],
    recentSymbolsLoading: false,
    recentSymbolsWriteSequence: 0,
    recentSymbolsAppliedSequence: 0,
};

// Active trading actions are assigned once by the production consistency
// layer near the end of this file. Explicit declarations keep strict mode safe.
let placeOrder;
let cancelOrder;
let closePosition;
let closeAllPositions;

const elements = {
    tickerStrip: document.getElementById("tickerStrip"),
    pairSelect: document.getElementById("pairSelect"),
    coinBadge: document.getElementById("coinBadge"),
    currentSymbolTitle: document.getElementById("currentSymbolTitle"),
    currentSymbolSub: document.getElementById("currentSymbolSub"),

    markPrice: document.getElementById("markPrice"),
    indexPrice: document.getElementById("indexPrice"),
    change24h: document.getElementById("change24h"),
    low24h: document.getElementById("low24h"),
    high24h: document.getElementById("high24h"),
    vol24h: document.getElementById("vol24h"),
    fundingRate: document.getElementById("fundingRate"),

    chartContainer: document.getElementById("chartContainer"),
    terminalPairTitle: document.getElementById("terminalPairTitle"),
    terminalCandleInfo: document.getElementById("terminalCandleInfo"),
    currentPriceBadge: document.getElementById("currentPriceBadge"),
    futuresRecentSymbolsBtn: document.getElementById("futuresRecentSymbolsBtn"),
    futuresRecentSymbolsCount: document.getElementById("futuresRecentSymbolsCount"),
    futuresRecentSymbolsPanel: document.getElementById("futuresRecentSymbolsPanel"),
    futuresRecentSymbolsClose: document.getElementById("futuresRecentSymbolsClose"),
    futuresRecentSymbolsList: document.getElementById("futuresRecentSymbolsList"),

    orderBookAsks: document.getElementById("orderBookAsks"),
    orderBookBids: document.getElementById("orderBookBids"),
    orderBookMid: document.getElementById("orderBookMid"),
    orderBookSizeLabel: document.getElementById("orderBookSizeLabel"),
    orderBookSumLabel: document.getElementById("orderBookSumLabel"),
    recentTradesList: document.getElementById("recentTradesList"),

    orderBookTabBtn: document.getElementById("orderBookTabBtn"),
    tradesTabBtn: document.getElementById("tradesTabBtn"),
    orderBookPanel: document.getElementById("orderBookPanel"),
    tradesPanel: document.getElementById("tradesPanel"),
    buyPercentBar: document.getElementById("buyPercentBar"),
    sellPercentBar: document.getElementById("sellPercentBar"),

    sideBuyBtn: document.getElementById("sideBuyBtn"),
    sideSellBtn: document.getElementById("sideSellBtn"),
    limitPriceWrap: document.getElementById("limitPriceWrap"),
    limitPriceInput: document.getElementById("limitPriceInput"),
    quantityInput: document.getElementById("quantityInput"),
    quantityAssetSuffix: document.getElementById("quantityAssetSuffix"),
    quantityAssetLabel: document.getElementById("quantityAssetLabel"),
    leverageSelect: document.getElementById("leverageSelect"),
    placeOrderBtn: document.getElementById("placeOrderBtn"),
    orderMessage: document.getElementById("orderMessage"),

    walletAvailable: document.getElementById("walletAvailable"),
    walletUsed: document.getElementById("walletUsed"),
    walletEstMargin: document.getElementById("walletEstMargin"),
    walletPnl: document.getElementById("walletPnl"),
    walletTotalProfit: document.getElementById("walletTotalProfit"),
    walletTotalLoss: document.getElementById("walletTotalLoss"),
    futuresTotalBalance: document.getElementById("futuresTotalBalance"),
    futuresEstimatedBalance: document.getElementById("futuresEstimatedBalance"),
    futuresTradingPnl: document.getElementById("futuresTradingPnl"),
    futuresDepositBtn: document.getElementById("futuresDepositBtn"),
    futuresWithdrawBtn: document.getElementById("futuresWithdrawBtn"),
    futuresTransferBtn: document.getElementById("futuresTransferBtn"),
    marginRatioBar: document.getElementById("marginRatioBar"),
    addDemoBalanceBtn: document.getElementById("addDemoBalanceBtn"),
    resetDemoBtn: document.getElementById("resetDemoBtn"),

    terminalTable: document.getElementById("terminalTable"),
    sessionStatus: document.getElementById("sessionStatus"),

    drawingOverlay: document.getElementById("drawingOverlay"),
    drawingFloatingToolbar: document.getElementById("drawingFloatingToolbar"),
    drawingWidthText: document.getElementById("drawingWidthText"),
    drawingThinBtn: document.getElementById("drawingThinBtn"),
    drawingThickBtn: document.getElementById("drawingThickBtn"),
    drawingDeleteBtn: document.getElementById("drawingDeleteBtn"),
    drawingLockBtn: document.getElementById("drawingLockBtn"),
    drawingColorBtn: document.getElementById("drawingColorBtn"),
    drawingSettingsBtn: document.getElementById("drawingSettingsBtn"),
    drawingMoreBtn: document.getElementById("drawingMoreBtn")
};
/* =========================
   MARKET TO FUTURES CONNECT
========================= */

function normalizeSymbol(symbol) {
    return String(symbol || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

function isSupportedSymbol(symbol) {
    if (!symbol) return false;
    if (pairs.some((pair) => pair.symbol === symbol)) return true;
    return symbol.endsWith("USDT") || symbol.endsWith("USD");
}

function getInitialSymbolFromNavigation() {
    const params = new URLSearchParams(window.location.search);
    const urlSymbol = normalizeSymbol(params.get("symbol"));
    const savedSymbol = normalizeSymbol(localStorage.getItem("traidiumx_selected_symbol"));

    if (urlSymbol && isSupportedSymbol(urlSymbol)) {
        localStorage.setItem("traidiumx_selected_symbol", urlSymbol);
        return urlSymbol;
    }

    if (savedSymbol && isSupportedSymbol(savedSymbol)) {
        return savedSymbol;
    }

    return "BTCUSDT";
}

function syncPairSelectOptions() {
    if (!elements.pairSelect) {
        return;
    }

    elements.pairSelect.innerHTML = pairs.map((pair) => {
        return `<option value="${pair.symbol}">${pair.label}</option>`;
    }).join("");

    elements.pairSelect.value = state.currentSymbol;
}

function applyInitialSymbolFromNavigation() {
    const initialSymbol = getInitialSymbolFromNavigation();

    state.currentSymbol = initialSymbol;

    syncPairSelectOptions();
    syncLeverageOptions(initialSymbol);
    txInitMockTrades(initialSymbol);
    updatePairHeader();
    loadTickerMetrics();

    if (elements.pairSelect) {
        elements.pairSelect.value = initialSymbol;
    }
}

function saveSelectedSymbol(symbol) {
    const cleanSymbol = normalizeSymbol(symbol);

    if (!isSupportedSymbol(cleanSymbol)) {
        return;
    }

    localStorage.setItem("traidiumx_selected_symbol", cleanSymbol);

    const nextUrl = `${window.location.pathname}?symbol=${encodeURIComponent(cleanSymbol)}`;
    window.history.replaceState({}, "", nextUrl);
}
/* =========================
   HELPERS
========================= */

function getPair(symbol = state.currentSymbol) {
    const found = pairs.find((pair) => pair.symbol === symbol);
    if (found) return found;
    let label = symbol;
    if (symbol.endsWith("USDT")) {
        label = symbol.replace("USDT", "-USDT");
    } else if (symbol.endsWith("USD")) {
        label = symbol.replace("USD", "-USD");
    }
    return {
        symbol: symbol,
        label: label,
        icon: symbol.charAt(0),
        minQty: 0.01,
        step: 0.01,
        maxLeverage: 50,
        quoteAsset: "USDT"
    };
}

function getMaxLeverageForPair(symbol = state.currentSymbol) {
    const pair = getPair(symbol);
    return Number(pair.maxLeverage || 20);
}

function syncLeverageOptions(symbol = state.currentSymbol) {
    if (!elements.leverageSelect) {
        return;
    }

    const maxLeverage = getMaxLeverageForPair(symbol);
    const allowedValues = [1, 2, 3, 5, 10, 20, 25, 50].filter((value) => value <= maxLeverage);
    const currentValue = Number(elements.leverageSelect.value || 10);

    elements.leverageSelect.innerHTML = allowedValues.map((value) => {
        return `<option value="${value}">${value}x</option>`;
    }).join("");

    const nextValue = Math.min(currentValue || 10, maxLeverage);
    const selectedValue = allowedValues.includes(nextValue)
        ? nextValue
        : allowedValues[allowedValues.length - 1];

    elements.leverageSelect.value = String(selectedValue);

    const orderHeaderBadge = document.getElementById("orderHeaderLeverageBadge");
    if (orderHeaderBadge) {
        orderHeaderBadge.textContent = `Max ${maxLeverage}x`;
    }
}

function isCommoditySymbol(symbol = state.currentSymbol) {
    const cleanSymbol = normalizeSymbol(symbol);
    const pair = getPair(cleanSymbol);

    return pair.marketType === "commodity" || cleanSymbol === "XAUUSD" || cleanSymbol === "GOLDUSD";
}

function isCryptoFuturesSymbol(symbol = state.currentSymbol) {
    return !isCommoditySymbol(symbol) && normalizeSymbol(symbol).endsWith("USDT");
}

function txInitMockTrades(symbol) {
    const cleanSymbol = normalizeSymbol(symbol);
    const basePrice = Number(defaultPrices[cleanSymbol] || state.currentPrice || 100);
    state.trades = [];
    const now = Date.now();
    for (let i = 0; i < 18; i++) {
        const timeOffset = i * 3000 + Math.floor(Math.random() * 2000);
        const priceOffset = (Math.random() - 0.5) * (basePrice * 0.001);
        const qty = Math.random() * 15 + 0.1;
        const side = Math.random() > 0.48 ? "BUY" : "SELL";
        state.trades.push({
            id: `MOCK-TRD-${now - timeOffset}-${i}`,
            price: basePrice + priceOffset,
            qty: qty,
            side: side,
            time: now - timeOffset
        });
    }
    renderRecentTrades();
}

function getQuoteAsset(symbol = state.currentSymbol) {
    const pair = getPair(symbol);

    if (pair.quoteAsset) {
        return pair.quoteAsset;
    }

    return isCommoditySymbol(symbol) ? "USD" : "USDT";
}

function updateMarketUnitLabels() {
    const quoteAsset = getQuoteAsset();

    document.querySelectorAll("[data-market-price-unit]").forEach((element) => {
        const prefix = element.getAttribute("data-market-price-unit") || "Price";
        element.textContent = `${prefix} (${quoteAsset})`;
    });
}


function getIntervalSeconds(interval = state.interval) {
    const map = {
        "1m": 60,
        "5m": 300,
        "15m": 900,
        "1h": 3600
    };

    return map[interval] || 60;
}

function getCandleBucketTime(timestampMs) {
    const seconds = getIntervalSeconds();
    const unixSeconds = Math.floor(timestampMs / 1000);

    return Math.floor(unixSeconds / seconds) * seconds;
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

function formatFuturesUsd(value, decimals = 2) {
    const formatted = formatNumber(value, decimals);
    return formatted === "--" ? "$0.00" : `$${formatted}`;
}
function getPnlColorStyle(value) {
    const pnl = Number(value || 0);

    if (pnl >= 0) {
        return 'style="color:#22c55e !important;font-weight:900;"';
    }

    return 'style="color:#f87171 !important;font-weight:900;"';
}

function formatPnlValue(value, currency = "USD") {
    const pnl = Number(value || 0);
    const sign = pnl >= 0 ? "+" : "-";
    const abs = Math.abs(pnl);
    let decimals = 2;

    if (abs > 0 && abs < 0.01) {
        decimals = 6;
    } else if (abs > 0 && abs < 1) {
        decimals = 4;
    }

    const absFormatted = abs.toFixed(decimals);

    if (currency === "INR") {
        return `${sign}₹${absFormatted}`;
    }
    return `${sign}${absFormatted} USD`;
}
function formatQty(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "--";
    }

    if (number >= 1) {
        return number.toFixed(3);
    }

    return number.toFixed(6);
}

function formatTime(timestamp = Date.now()) {
    return new Date(timestamp).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

function txEnsureSideToastStyles() {
    if (document.getElementById("txSideToastStyles")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "txSideToastStyles";
    style.textContent = `
        .tx-side-toast-stack {
            position: fixed;
            right: 22px;
            bottom: 24px;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
            width: min(360px, calc(100vw - 32px));
        }
        .tx-side-toast {
            pointer-events: auto;
            border-radius: 14px;
            padding: 13px 16px;
            font-size: 13px;
            font-weight: 800;
            line-height: 1.35;
            box-shadow: 0 18px 45px rgba(0, 0, 0, .35);
            backdrop-filter: blur(14px);
            transform: translateX(18px);
            opacity: 0;
            transition: transform .16s ease, opacity .16s ease;
            border: 1px solid rgba(255, 255, 255, .10);
        }
        .tx-side-toast.show {
            transform: translateX(0);
            opacity: 1;
        }
        .tx-side-toast.success {
            color: #7cf7b5;
            background: rgba(5, 72, 51, .96);
            border-color: rgba(52, 211, 153, .40);
        }
        .tx-side-toast.error {
            color: #ffc4c4;
            background: rgba(105, 28, 35, .96);
            border-color: rgba(248, 113, 113, .40);
        }
    `;
    document.head.appendChild(style);
}

function txGetSideToastStack() {
    txEnsureSideToastStyles();
    let stack = document.getElementById("txSideToastStack");
    if (!stack) {
        stack = document.createElement("div");
        stack.id = "txSideToastStack";
        stack.className = "tx-side-toast-stack";
        document.body.appendChild(stack);
    }
    return stack;
}

function showOrderMessage(message, type = "success") {
    const cleanMessage = String(message || "").trim();
    if (!cleanMessage) {
        return;
    }

    // Do not write messages inside the order card. That area changes height and
    // makes the whole futures page jump/flicker. Keep it hidden and use a
    // fixed side toast instead.
    if (elements.orderMessage) {
        elements.orderMessage.classList.add("hidden");
        elements.orderMessage.textContent = "";
    }

    const stack = txGetSideToastStack();
    const toast = document.createElement("div");
    toast.className = `tx-side-toast ${type === "error" ? "error" : "success"}`;
    if (cleanMessage.includes("<a") || cleanMessage.includes("</")) {
        toast.innerHTML = cleanMessage;
    } else {
        toast.textContent = cleanMessage;
    }
    stack.appendChild(toast);

    window.requestAnimationFrame(() => toast.classList.add("show"));

    window.setTimeout(() => {
        toast.classList.remove("show");
        window.setTimeout(() => toast.remove(), 180);
    }, type === "error" ? 6000 : 2200);
}

/* =========================
   LOCAL STORAGE
   Trading data is kept in RAM only. Buy/Sell/Close must not write
   wallet/positions/orders/history to localStorage before UI update.
========================= */

const TX_FAST_RUNTIME_STORE = {
    wallet: null,
    positions: [],
    orders: [],
    history: []
};

function txClearOldFuturesTradingLocalStorage() {
    try {
        [WALLET_KEY, POSITIONS_KEY, ORDERS_KEY, HISTORY_KEY].forEach((key) => {
            if (key) localStorage.removeItem(key);
        });
    } catch (error) {
        console.warn("Old futures localStorage cleanup skipped:", error);
    }
}

/* Removed legacy duplicate getSession implementation. */

/* Removed legacy duplicate isLoggedIn implementation. */

/* Removed legacy duplicate getWallet implementation. */

/* Removed legacy duplicate saveWallet implementation. */

/* Removed legacy duplicate getPositions implementation. */

/* Removed legacy duplicate savePositions implementation. */

/* Removed legacy duplicate getOrders implementation. */

/* Removed legacy duplicate saveOrders implementation. */

/* Removed legacy duplicate getHistory implementation. */

/* Removed legacy duplicate saveHistory implementation. */

/* =========================
   HEADER / TICKER
========================= */

function getCoinLogoSvg(pair, sizeClass = "w-8 h-8") {
    const rawPair = String(pair || "").replace(" Options", "").trim();
    let symbolKey = rawPair.split("-")[0].split("/")[0].toUpperCase();

    if (symbolKey.endsWith("USDT") && symbolKey.length > 4) {
        symbolKey = symbolKey.slice(0, -4);
    } else if (symbolKey.endsWith("USD") && symbolKey.length > 3 && symbolKey !== "XAUUSD" && symbolKey !== "USD") {
        symbolKey = symbolKey.slice(0, -3);
    }

    const cleanBaseKey = symbolKey.replace(/^1000/, "");

    const pepeLogo = `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#0f2b1d"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#22c55e" stroke-width="1"/><path fill="#22c55e" d="M9 14c0-3 3-5 7-5s7 2 7 5c0 1.5-.5 3-1.5 4.2C20.5 19.5 18.5 21 16 21s-4.5-1.5-5.5-2.8C9.5 17 9 15.5 9 14z"/><circle cx="12.5" cy="13" r="2.2" fill="#fff"/><circle cx="19.5" cy="13" r="2.2" fill="#fff"/><circle cx="13" cy="13" r="1" fill="#0f2b1d"/><circle cx="20" cy="13" r="1" fill="#0f2b1d"/><path stroke="#0f2b1d" stroke-width="1.2" stroke-linecap="round" d="M12 17.5c2 1.2 6 1.2 8 0"/></svg>`;
    const shibLogo = `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#2b1509"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#f97316" stroke-width="1"/><path fill="#f97316" d="M8 10l4 4-2 6 6 3 6-3-2-6 4-4-5 1-3-4-3 4z"/><polygon fill="#fff" points="13,15 11,19 15,18"/><polygon fill="#fff" points="19,15 21,19 17,18"/><polygon fill="#000" points="15,20 17,20 16,21.5"/></svg>`;

    const logos = {
        "INR": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#059669"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/><text x="16" y="21.5" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="900" fill="#ffffff" text-anchor="middle">₹</text></svg>`,
        "USD": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#10b981"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/><text x="16" y="21.5" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="900" fill="#ffffff" text-anchor="middle">$</text></svg>`,
        "USDT": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#26a17b"/><path fill="#fff" d="M17.92 16.38c-.14.01-.84.05-1.92.05-1.01 0-1.74-.04-1.93-.05-3.66-.17-6.39-.81-6.39-1.58s2.73-1.41 6.39-1.58v-2.31h7.86v2.31c3.66.17 6.39.81 6.39 1.58s-2.73 1.41-6.4 1.58v6.23h-4v-6.23zM16 11.23c-3.15 0-5.83.47-6.09 1.07.26.6 2.94 1.07 6.09 1.07 3.15 0 5.83-.47 6.09-1.07-.26-.6-2.94-1.07-6.09-1.07z"/></svg>`,
        "USDC": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#2775ca"/><path fill="#fff" d="M16 4C9.4 4 4 9.4 4 16s5.4 12 12 12 12-5.4 12-12S22.6 4 16 4zm.6 18.5v1.8h-1.5v-1.8c-2.4-.2-4.1-1.6-4.3-3.7h2.2c.2 1.1 1.2 1.8 2.6 1.8 1.4 0 2.4-.6 2.4-1.6 0-.8-.5-1.3-2.1-1.7l-1.5-.4c-2.3-.6-3.4-1.7-3.4-3.4 0-1.9 1.6-3.3 3.9-3.6v-1.8h1.5v1.8c2 .2 3.5 1.5 3.8 3.3h-2.1c-.2-.9-1-1.5-2.2-1.5-1.3 0-2.1.6-2.1 1.4 0 .7.5 1.2 2 1.6l1.3.3c2.4.6 3.6 1.8 3.6 3.6 0 2-1.6 3.4-4.1 3.7z"/></svg>`,
        "TON": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#0088cc"/><path fill="#fff" d="M16 6l9 7.5-3.5 10.5h-11L7 13.5 16 6zm-4.5 9l4.5 6 4.5-6H11.5z"/></svg>`,
        "BTC": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#f7931a"/><path fill="#fff" d="M23.18 13.84c.34-2.28-1.4-3.5-3.78-4.31l.77-3.1-1.89-.47-.75 3c-.5 0-1-.13-1.5-.24l.76-3.05-1.89-.47-.77 3.09c-.41-.09-.82-.19-1.22-.29l-2.61-.65-.5 2.02s1.4.32 1.37.34c.77.19.9.7.88 1.1l-.88 3.53c.05.01.12.04.2.08l-.2-.05-1.23 4.94c-.09.23-.33.58-.87.45.02.03-1.37-.34-1.37-.34l-.94 2.18 2.47.62c.46.12.91.24 1.36.36l-.78 3.14 1.89.47.77-3.1c.52.14 1.02.27 1.52.39l-.77 3.09 1.89.47.78-3.13c3.22.61 5.64.36 6.66-2.55.82-2.34-.04-3.69-1.74-4.57 1.24-.29 2.17-1.1 2.42-2.77zm-4.33 6.05c-.58 2.35-4.53 1.08-5.8.76l1.04-4.16c1.28.32 5.37.95 4.76 3.4zm.59-6.08c-.53 2.14-3.83.99-4.89.73l.94-3.77c1.06.27 4.49.77 3.95 3.04z"/></svg>`,
        "BCH": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#8dc351"/><path fill="#fff" d="M22.5 13.5c.3-2.1-1.3-3.2-3.5-4l.7-2.9-1.7-.4-.7 2.8c-.5-.1-.9-.2-1.4-.3l.7-2.8-1.7-.4-.7 2.8c-.4-.1-.8-.2-1.1-.3l-2.4-.6-.5 1.9s1.3.3 1.3.3c.7.2.8.6.8 1l-.8 3.3c.1 0 .1 0 .2.1l-.2 0-1.1 4.6c-.1.2-.3.5-.8.4 0 0-1.3-.3-1.3-.3l-.9 2 2.3.6c.4.1.8.2 1.3.3l-.7 2.9 1.7.4.7-2.9c.5.1.9.2 1.4.3l-.7 2.9 1.7.4.7-2.9c3 .6 5.2.3 6.2-2.3.8-2.1 0-3.4-1.6-4.2 1.1-.3 2-1 2.2-2.5zm-4 5.6c-.5 2.1-4.1 1-5.3.7l.9-3.8c1.2.3 4.9.9 4.4 3.1zm.5-5.6c-.5 1.9-3.5.9-4.4.7l.8-3.4c.9.2 4.1.7 3.6 2.7z"/></svg>`,
        "ETH": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#627eea"/><path fill="#fff" fill-opacity=".6" d="M16 4v8.87l7.5 3.35z"/><path fill="#fff" d="M16 4L8.5 16.22l7.5-3.35z"/><path fill="#fff" fill-opacity=".6" d="M16 21.97v6.03l7.5-10.46z"/><path fill="#fff" d="M16 28v-6.03L8.5 17.54z"/><path fill="#fff" fill-opacity=".2" d="M16 20.57l7.5-4.35L16 12.87z"/><path fill="#fff" fill-opacity=".6" d="M8.5 16.22l7.5 4.35v-7.7z"/></svg>`,
        "BNB": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#f3ba2f"/><path fill="#fff" d="M12.12 13.84L16 9.96l3.88 3.88 2.2-2.2L16 5.56l-6.08 6.08zm-6.56 2.16l2.2-2.2L11.64 16l-3.88 3.88-2.2-2.2L7.68 16zm12.32 0l3.88-3.88 2.2 2.2L24.32 16l3.88 3.88-2.2 2.2zm-5.76 2.16L16 22.04l-3.88-3.88-2.2 2.2L16 26.44l6.08-6.08zm0-4.32L16 12.12l1.72 1.72L16 15.56l-1.72-1.72zm0 4.32L16 16.44l1.72 1.72L16 19.88l-1.72-1.72z"/></svg>`,
        "SOL": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#12141d"/><defs><linearGradient id="solGrad_${sizeClass.replace(/[^a-zA-Z0-9]/g, '_')}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00ffa3"/><stop offset="100%" stop-color="#dc1fff"/></linearGradient></defs><path fill="url(#solGrad_${sizeClass.replace(/[^a-zA-Z0-9]/g, '_')})" d="M8 20.7l2.1-2.1h13.9l-2.1 2.1H8zm5.9-6.3l-2.1 2.1h13.9l2.1-2.1H13.9zM8 9.3l2.1-2.1h13.9l-2.1 2.1H8z"/></svg>`,
        "XRP": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#23292f"/><path fill="#fff" d="M22.67 8h2.66l-6.4 6.34 6.47 6.46h-2.66l-5.14-5.13-5.14 5.13H9.8l6.47-6.46L9.87 8h2.66l5.14 5.13L22.67 8z"/></svg>`,
        "DOGE": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#c2a633"/><path fill="#fff" d="M12 9h5.5c3.5 0 6.5 2.5 6.5 7s-3 7-6.5 7H12V9zm4 3v8h1.5c2 0 3.5-1.5 3.5-4s-1.5-4-3.5-4H16z"/><path fill="#fff" d="M9 15h9v2H9z"/></svg>`,
        "PEPE": pepeLogo,
        "1000PEPE": pepeLogo,
        "SHIB": shibLogo,
        "1000SHIB": shibLogo,
        "SUI": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#0f2942"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#38bdf8" stroke-width="1"/><path fill="#38bdf8" d="M16 6c-4 5.5-7 9.8-7 13.2 0 3.8 3.1 6.8 7 6.8s7-3 7-6.8C23 15.8 20 11.5 16 6zm0 16c-1.7 0-3-1.3-3-3 0-1.8 1.5-4.2 3-6.1 1.5 1.9 3 4.3 3 6.1 0 1.7-1.3 3-3 3z"/></svg>`,
        "NEAR": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#082b28"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#14b8a6" stroke-width="1"/><path fill="#14b8a6" d="M9.5 9h3.2l6.8 10.2V9h3v14h-3.2L12.5 12.8V23h-3V9z"/></svg>`,
        "FIL": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#08243b"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#0094ff" stroke-width="1"/><path fill="#0094ff" d="M11 7h10v3.5h-6.5v3.5H20v3.5h-5.5V25H11V7z"/></svg>`,
        "XLM": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#092233"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#14b6e4" stroke-width="1"/><path fill="#14b6e4" d="M24 8L8 15.5l5 2.5L20 11l-4.5 7.5L22 21 24 8zM8 24l5-2.5 3 1.5-8 1z"/></svg>`,
        "INJ": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#06212e"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#00f2ff" stroke-width="1"/><path fill="none" stroke="#00f2ff" stroke-width="2.5" stroke-linecap="round" d="M10 22C7.5 19.5 7.5 14 11 10.5S20 8 22.5 11.5s0 8-3.5 10.5S10 24 10 22z"/><circle cx="16" cy="16" r="3" fill="#00f2ff"/></svg>`,
        "DOT": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#141927"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#e6007a" stroke-width="1"/><circle cx="16" cy="9.5" r="2.2" fill="#e6007a"/><circle cx="16" cy="22.5" r="2.2" fill="#e6007a"/><circle cx="9.5" cy="16" r="2.2" fill="#e6007a"/><circle cx="22.5" cy="16" r="2.2" fill="#e6007a"/><circle cx="16" cy="16" r="1.8" fill="#e6007a"/></svg>`,
        "WIF": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#281b10"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#e3a152" stroke-width="1"/><path fill="#e3a152" d="M8 17c0-4 3.5-7 8-7s8 3 8 7v2H8v-2z"/><path fill="#8c5825" d="M6 18c0-1.5 4.5-2.5 10-2.5s10 1 10 2.5-4.5 2.5-10 2.5S6 19.5 6 18z"/></svg>`,
        "FET": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#072136"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#00a3ff" stroke-width="1"/><circle cx="11" cy="11" r="2" fill="#00a3ff"/><circle cx="16" cy="11" r="2" fill="#00a3ff"/><circle cx="21" cy="11" r="2" fill="#00a3ff"/><circle cx="11" cy="16" r="2" fill="#00a3ff"/><circle cx="16" cy="16" r="2.5" fill="#fff"/><circle cx="21" cy="16" r="2" fill="#00a3ff"/><circle cx="16" cy="21" r="2" fill="#00a3ff"/></svg>`,
        "ARB": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#081d33"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#28a0f0" stroke-width="1"/><path fill="#28a0f0" d="M16 7l8 12.5h-4.5L16 14l-3.5 5.5H8L16 7z"/><path fill="#fff" d="M16 11l4.5 7h-2.5L16 15l-2 3h-2.5l4.5-7z"/></svg>`,
        "ETC": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#062618"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#34fa99" stroke-width="1"/><path fill="#34fa99" fill-opacity=".7" d="M16 5v8.5l7 3.5z"/><path fill="#34fa99" d="M16 5L9 17l7-3.5z"/><path fill="#34fa99" fill-opacity=".7" d="M16 20.5v6.5l7-9.5z"/><path fill="#34fa99" d="M16 27v-6.5L9 17.5z"/></svg>`,
        "ICP": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#062133"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#29abe2" stroke-width="1"/><path fill="none" stroke="#29abe2" stroke-width="2.5" d="M11 16c-3 0-5-2-5-4s2-4 5-4 5 4 5 4 2 4 5 4 5-2 5-4-2-4-5-4-5 4-5 4-2-4-5-4z"/></svg>`,
        "OP": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#ff0420"/><path fill="#fff" d="M12 11c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 7c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm8-7c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 7c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`,
        "TIA": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#1e083a"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#7b2bf9" stroke-width="1"/><circle cx="16" cy="16" r="5" fill="#7b2bf9"/><circle cx="16" cy="8" r="2" fill="#c084fc"/><circle cx="16" cy="24" r="2" fill="#c084fc"/><circle cx="8" cy="16" r="2" fill="#c084fc"/><circle cx="24" cy="16" r="2" fill="#c084fc"/></svg>`,
        "ATOM": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#2e3148"/><circle cx="16" cy="3" r="3" fill="#fff"/><ellipse cx="16" cy="16" rx="10" ry="4" fill="none" stroke="#fff" stroke-width="1.5" transform="rotate(30 16 16)"/><ellipse cx="16" cy="16" rx="10" ry="4" fill="none" stroke="#fff" stroke-width="1.5" transform="rotate(-30 16 16)"/></svg>`,
        "RENDER": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#2e0505"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#e60000" stroke-width="1"/><path fill="#e60000" d="M10 8h7.5c2.5 0 4.5 1.5 4.5 4s-1.5 3.5-3.5 3.8L22 24h-4l-3-7.5H13V24h-3V8zm3 3.5v5h4c1.2 0 2-.8 2-2.5s-.8-2.5-2-2.5h-4z"/></svg>`,
        "RNDR": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#2e0505"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#e60000" stroke-width="1"/><path fill="#e60000" d="M10 8h7.5c2.5 0 4.5 1.5 4.5 4s-1.5 3.5-3.5 3.8L22 24h-4l-3-7.5H13V24h-3V8zm3 3.5v5h4c1.2 0 2-.8 2-2.5s-.8-2.5-2-2.5h-4z"/></svg>`,
        "SEI": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#2e070e"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#9e1b32" stroke-width="1"/><path fill="#9e1b32" d="M10 10c0-1.5 3-2 6-2s6 .5 6 2c0 2.5-12 2.5-12 6s9 4.5 12 2c0 2-3 4-6 4s-6-1-6-2.5"/></svg>`,
        "MATIC": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#8247e5"/><path fill="#fff" d="M21.2 12.8l-3.7-2.1c-.3-.2-.7-.2-1 0l-3.7 2.1c-.3.2-.5.5-.5.8v4.3c0 .3.2.7.5.8l3.7 2.1c.3.2.7.2 1 0l3.7-2.1c.3-.2.5-.5.5-.8v-4.3c0-.4-.2-.7-.5-.9zm-4.2 6.1l-2.4-1.4v-2.8l2.4 1.4v2.8z"/></svg>`,
        "POL": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#8247e5"/><path fill="#fff" d="M21.2 12.8l-3.7-2.1c-.3-.2-.7-.2-1 0l-3.7 2.1c-.3.2-.5.5-.5.8v4.3c0 .3.2.7.5.8l3.7 2.1c.3.2.7.2 1 0l3.7-2.1c.3-.2.5-.5.5-.8v-4.3c0-.4-.2-.7-.5-.9zm-4.2 6.1l-2.4-1.4v-2.8l2.4 1.4v2.8z"/></svg>`,
        "FTM": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#1969ff"/><path fill="#fff" d="M16 6l7 5.5V20.5L16 26l-7-5.5V11.5L16 6zm0 3.5L11.5 13 16 16.5 20.5 13 16 9.5zm0 13l4.5-3.5L16 15.5 11.5 19l4.5 3.5z"/></svg>`,
        "ADA": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#0033ad"/><circle cx="16" cy="16" r="4" fill="#fff"/><circle cx="16" cy="8" r="1.5" fill="#fff"/><circle cx="16" cy="24" r="1.5" fill="#fff"/><circle cx="8" cy="16" r="1.5" fill="#fff"/><circle cx="24" cy="16" r="1.5" fill="#fff"/></svg>`,
        "AVAX": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#e84142"/><path fill="#fff" d="M16 7l8.5 15h-4.5L16 15l-4 7H7.5L16 7z"/></svg>`,
        "LINK": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#375bd2"/><path fill="#fff" d="M16 6l7 4v8l-7 4-7-4v-8l7-4zm0 3.5L11.5 12v4L16 18.5l4.5-2.5v-4L16 9.5z"/></svg>`,
        "LTC": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#345d9d"/><path fill="#fff" d="M12 9h3v10h6v3H12V9zm-1 6l8-3v2l-8 3v-2z"/></svg>`,
        "TRX": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#ef0027"/><path fill="#fff" d="M7 8l18 3-7 14L7 8zm4 3l4.5 9 4.5-9H11z"/></svg>`,
        "UNI": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#ff007a"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/><path fill="#ffffff" d="M21.5 7.5l2.8-2.8c.4-.4.4-1 0-1.4s-1-.4-1.4 0l-3.2 3.2c-1.3-.8-2.8-1.2-4.4-1.1-2.4.2-4.6 1.3-6.2 3.1-2.2 2.4-3.2 5.7-2.6 8.9.6 3.2 2.7 5.8 5.7 6.8 1 .3 2.1.5 3.1.5 3.1 0 6.1-1.4 8.1-3.8 2-2.3 2.8-5.4 2.2-8.4-.3-1.6-1.1-3.1-2.1-4.2zm-2.8 12.3c-1.5 1.8-3.7 2.8-6 2.8-.8 0-1.6-.1-2.3-.4-2.2-.7-3.8-2.7-4.2-5-.4-2.3.3-4.7 2-6.4 1.2-1.3 2.8-2.1 4.5-2.2 1.2 0 2.4.4 3.4 1l-2.1 2.1c-.4.4-.4 1 0 1.4s1 .4 1.4 0l3.5-3.5c.7.8 1.2 1.8 1.4 2.9.4 2.3-.2 4.6-1.6 6.3z"/></svg>`,
        "APT": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#18181b"/><path fill="#fff" d="M16 6l9 16H7l9-16zm0 5l-5 9h10l-5-9z"/></svg>`,
        "XAU": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#d4af37"/><path fill="#fff" d="M16 6l8 4.5v11.5L16 26.5 8 22V10.5L16 6zm0 3.5L11 12.3v7.4l5 2.8 5-2.8v-7.4L16 9.5z"/></svg>`,
        "XAUUSD": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#d4af37"/><path fill="#fff" d="M16 6l8 4.5v11.5L16 26.5 8 22V10.5L16 6zm0 3.5L11 12.3v7.4l5 2.8 5-2.8v-7.4L16 9.5z"/></svg>`,
        "SAND": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#0084ff"/><path fill="#fff" d="M10 10h12v3H13v3h9v6H10v-3h9v-3h-9v-6z"/></svg>`,
        "MANTA": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#0046ff"/><path fill="#fff" d="M8 12c4 0 6 3 8 7 2-4 4-7 8-7-2 5-5 9-8 13-3-4-6-8-8-13z"/></svg>`,
        "ORCA": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#00c8b3"/><path fill="#fff" d="M9 16c0-3.5 3-6 7-6s7 2.5 7 6c0 3-2.5 5.5-6 6l4 4h-4l-3-3.5L11 25H8l4-5c-2-1-3-2.5-3-4z"/></svg>`
    };

    if (logos[symbolKey]) return logos[symbolKey];
    if (logos[cleanBaseKey]) return logos[cleanBaseKey];

    // Dynamic fallback SVG with deterministic gradient
    let hash = 0;
    const str = String(symbolKey || "COIN").toUpperCase();
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    const label = str.length > 5 ? str.slice(0, 4) : str;
    const fontSize = label.length > 3 ? "8.5" : "10.5";
    const safeStr = str.replace(/[^A-Z0-9]/g, "");

    return `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md">
        <defs>
            <linearGradient id="coinGrad_${safeStr}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="hsl(${hue}, 80%, 45%)"/>
                <stop offset="100%" stop-color="hsl(${(hue + 45) % 360}, 90%, 25%)"/>
            </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="16" fill="url(#coinGrad_${safeStr})"/>
        <circle cx="16" cy="16" r="14.5" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
        <text x="16" y="20.5" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="-0.3">${label}</text>
    </svg>`;
}
window.getCoinLogoSvg = getCoinLogoSvg;

function updatePairHeader() {
    const pair = getPair();

    if (elements.coinBadge) {
        elements.coinBadge.innerHTML = getCoinLogoSvg(pair.symbol || state.currentSymbol, "w-full h-full");
    }

    if (elements.currentSymbolTitle) {
        elements.currentSymbolTitle.textContent = pair.label;
    }

    // Update Mobile Pair Header Badge & Label
    const mobileCoinBadge = document.getElementById("mobileCoinBadge");
    if (mobileCoinBadge) {
        mobileCoinBadge.innerHTML = getCoinLogoSvg(pair.symbol || state.currentSymbol, "w-full h-full");
    }
    const mobileSymbolLabel = document.getElementById("mobileSymbolLabel");
    if (mobileSymbolLabel) {
        mobileSymbolLabel.textContent = pair.label;
    }

    // Sync favorite star for current symbol
    txSyncHeaderFavStar();

    if (elements.currentSymbolSub) {
        elements.currentSymbolSub.textContent = isCommoditySymbol() ? "Commodity CFD / Internal Futures" : "Perpetual Futures";
    }

    if (elements.terminalPairTitle) {
        elements.terminalPairTitle.textContent = `${pair.label} PERPETUAL · ${state.interval} · TraidiumX`;
    }

    const marginAssetBadge = document.getElementById("marginAssetBadge");
    if (marginAssetBadge) {
        marginAssetBadge.textContent = pair.label;
    }

    const baseAsset = pair.label ? pair.label.split("-")[0] : (pair.symbol === "XAUUSD" ? "XAU" : pair.symbol.replace("USDT", ""));

    if (elements.quantityAssetSuffix) {
        elements.quantityAssetSuffix.textContent = baseAsset;
    }

    if (elements.quantityAssetLabel) {
        elements.quantityAssetLabel.textContent = baseAsset;
    }

    if (elements.orderBookSizeLabel) {
        elements.orderBookSizeLabel.textContent = `Size (${baseAsset})`;
    }

    if (elements.orderBookSumLabel) {
        elements.orderBookSumLabel.textContent = `Sum (${baseAsset})`;
    }

    updateMarketUnitLabels();
}

/* ==========================================================================
   BINANCE-STYLE FUTURES MARKET SELECTOR ENGINE (IMAGE 2 MATCH)
   ========================================================================== */

const txMarketSelectorState = {
    activeTab: "usdt-m", // "favorites", "usdt-m", "coin-m", "all"
    activeCategory: "all", // "all", "new", "tradfi", "layer1", "ai", "meme", "defi", "usdc"
    searchQuery: "",
    sortColumn: "vol", // "symbol", "price", "change", "vol", "funding"
    sortDirection: "desc", // "asc", "desc"
    isOpen: false,
    favorites: (() => {
        try {
            const saved = localStorage.getItem("traidiumx_favorite_symbols");
            return saved ? JSON.parse(saved) : ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"];
        } catch {
            return ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"];
        }
    })(),
    liveTickers: {} // symbol -> { price, change, volStr, volNum, funding }
};

function txIsSymbolFavorite(symbol) {
    const clean = normalizeSymbol(symbol);
    return txMarketSelectorState.favorites.includes(clean);
}

function txToggleFavoriteSymbol(symbol, e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    const clean = normalizeSymbol(symbol);
    const idx = txMarketSelectorState.favorites.indexOf(clean);
    if (idx >= 0) {
        txMarketSelectorState.favorites.splice(idx, 1);
    } else {
        txMarketSelectorState.favorites.push(clean);
    }
    try {
        localStorage.setItem("traidiumx_favorite_symbols", JSON.stringify(txMarketSelectorState.favorites));
    } catch {}

    txSyncHeaderFavStar();
    txRenderMarketSelectorList();
}

function txSyncHeaderFavStar() {
    const isFav = txIsSymbolFavorite(state.currentSymbol);
    const starDesktop = document.getElementById("currentSymbolFavStar");
    if (starDesktop) {
        starDesktop.className = `tx-header-fav-star ${isFav ? "active" : "inactive"}`;
    }
    const starMobile = document.getElementById("mobileHeaderFavStar");
    if (starMobile) {
        starMobile.className = isFav ? "text-cyan-400 text-xs" : "text-slate-600 text-xs";
    }
}

function txOpenMarketSelector() {
    txMarketSelectorState.isOpen = true;
    const dropdown = document.getElementById("marketSelectorDropdown");
    const trigger = document.getElementById("marketSelectorTrigger");
    const arrow = document.getElementById("marketSelectorArrow");

    if (dropdown) {
        dropdown.classList.remove("hidden");
    }
    if (trigger) {
        trigger.classList.add("open");
        trigger.setAttribute("aria-expanded", "true");
    }
    if (arrow) {
        arrow.style.transform = "rotate(180deg)";
    }

    let backdrop = document.getElementById("txMarketSelectorBackdrop");
    if (!backdrop && window.innerWidth < 1024) {
        backdrop = document.createElement("div");
        backdrop.id = "txMarketSelectorBackdrop";
        backdrop.className = "tx-mkt-backdrop";
        backdrop.addEventListener("click", txCloseMarketSelector);
        document.body.appendChild(backdrop);
    }

    const searchInput = document.getElementById("marketSearchInput");
    if (searchInput) {
        searchInput.focus();
    }

    txRenderMarketSelectorList();
}

function txCloseMarketSelector() {
    txMarketSelectorState.isOpen = false;
    const dropdown = document.getElementById("marketSelectorDropdown");
    const trigger = document.getElementById("marketSelectorTrigger");
    const arrow = document.getElementById("marketSelectorArrow");

    if (dropdown) {
        dropdown.classList.add("hidden");
    }
    if (trigger) {
        trigger.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
    }
    if (arrow) {
        arrow.style.transform = "";
    }

    const backdrop = document.getElementById("txMarketSelectorBackdrop");
    if (backdrop) {
        backdrop.remove();
    }
}

function txToggleMarketSelector() {
    if (txMarketSelectorState.isOpen) {
        txCloseMarketSelector();
    } else {
        txOpenMarketSelector();
    }
}

function txParseVolNum(volStr) {
    if (!volStr) return 0;
    const clean = String(volStr).toUpperCase().replace(/[^0-9.BMK]/g, "");
    const val = parseFloat(clean) || 0;
    if (clean.endsWith("B")) return val * 1e9;
    if (clean.endsWith("M")) return val * 1e6;
    if (clean.endsWith("K")) return val * 1e3;
    return val;
}

function txFormatMarketPrice(symbol, price) {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return "--";
    if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (p >= 1) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    if (p >= 0.01) return p.toFixed(4);
    return p.toFixed(6);
}

function txRenderMarketSelectorList() {
    const listEl = document.getElementById("marketSelectorList");
    if (!listEl) return;

    const { activeTab, activeCategory, searchQuery, sortColumn, sortDirection } = txMarketSelectorState;
    const query = searchQuery.trim().toUpperCase();

    let filtered = pairs.filter((pair) => {
        const sym = pair.symbol.toUpperCase();
        const label = (pair.label || "").toUpperCase();
        const base = sym.replace("USDT", "").replace("USD", "").replace("1000", "");

        if (query) {
            const matches = sym.includes(query) || label.includes(query) || base.includes(query);
            if (!matches) return false;
        }

        if (activeTab === "favorites") {
            if (!txIsSymbolFavorite(pair.symbol)) return false;
        } else if (activeTab === "coin-m") {
            if (pair.quoteAsset === "USDT" && pair.marketType !== "commodity") return false;
        } else if (activeTab === "usdt-m") {
            if (pair.quoteAsset !== "USDT" && pair.marketType === "commodity") return false;
        }

        if (activeCategory !== "all") {
            const cats = pair.categories || [];
            if (!cats.includes(activeCategory)) return false;
        }

        return true;
    });

    filtered.sort((a, b) => {
        const liveA = txMarketSelectorState.liveTickers[a.symbol] || {};
        const liveB = txMarketSelectorState.liveTickers[b.symbol] || {};

        let valA, valB;
        if (sortColumn === "symbol") {
            valA = a.symbol;
            valB = b.symbol;
            return sortDirection === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else if (sortColumn === "price") {
            valA = liveA.price || defaultPrices[a.symbol] || 0;
            valB = liveB.price || defaultPrices[b.symbol] || 0;
        } else if (sortColumn === "change") {
            valA = liveA.change !== undefined ? liveA.change : (a.defaultChange || 0);
            valB = liveB.change !== undefined ? liveB.change : (b.defaultChange || 0);
        } else if (sortColumn === "funding") {
            valA = parseFloat(liveA.funding || a.defaultFunding || "0");
            valB = parseFloat(liveB.funding || b.defaultFunding || "0");
        } else { // 'vol'
            valA = liveA.volNum || txParseVolNum(a.baseVol || "10M");
            valB = liveB.volNum || txParseVolNum(b.baseVol || "10M");
        }

        return sortDirection === "asc" ? valA - valB : valB - valA;
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="tx-mkt-empty">No trading pairs match your search</div>`;
        return;
    }

    const currentNorm = normalizeSymbol(state.currentSymbol);

    listEl.innerHTML = filtered.map((pair) => {
        const live = txMarketSelectorState.liveTickers[pair.symbol] || {};
        const isFav = txIsSymbolFavorite(pair.symbol);
        const isSelected = normalizeSymbol(pair.symbol) === currentNorm;
        const price = live.price || defaultPrices[pair.symbol] || 0;
        const priceFormatted = txFormatMarketPrice(pair.symbol, price);
        const change = live.change !== undefined ? live.change : (pair.defaultChange || 0);
        const changeFormatted = `${change >= 0 ? "+" : ""}${Number(change).toFixed(2)}%`;
        const changeClass = change >= 0 ? "pos" : "neg";
        const vol = live.volStr || pair.baseVol || "--";
        const funding = live.funding || pair.defaultFunding || "0.01000%";
        const fundingClass = String(funding).startsWith("-") ? "warn" : "";
        const logoSvg = getCoinLogoSvg(pair.symbol, "w-6 h-6");
        const displaySymbol = pair.symbol;

        return `
            <div class="tx-mkt-row ${isSelected ? "selected" : ""}" data-pair-symbol="${pair.symbol}">
                <div class="tx-mkt-cell-symbol">
                    <span class="tx-mkt-row-star ${isFav ? "active" : ""}" data-fav-symbol="${pair.symbol}">★</span>
                    ${logoSvg}
                    <div class="tx-mkt-sym-info">
                        <div class="tx-mkt-sym-title">
                            <span>${displaySymbol}</span>
                            <span class="tx-perp-badge">Perp</span>
                        </div>
                        <span class="tx-mkt-vol">${vol}</span>
                    </div>
                </div>
                <div class="tx-mkt-cell-price" data-mkt-price-for="${pair.symbol}">
                    ${priceFormatted}
                </div>
                <div class="tx-mkt-cell-chg ${changeClass}" data-mkt-chg-for="${pair.symbol}">
                    ${changeFormatted}
                </div>
                <div class="tx-mkt-cell-funding ${fundingClass}" data-mkt-funding-for="${pair.symbol}">
                    ${funding}
                </div>
            </div>
        `;
    }).join("");

    listEl.querySelectorAll(".tx-mkt-row").forEach((row) => {
        row.addEventListener("click", (e) => {
            if (e.target.closest(".tx-mkt-row-star")) return;
            const sym = row.getAttribute("data-pair-symbol");
            if (sym) {
                changePair(sym);
                txCloseMarketSelector();
            }
        });
    });

    listEl.querySelectorAll(".tx-mkt-row-star").forEach((star) => {
        star.addEventListener("click", (e) => {
            const sym = star.getAttribute("data-fav-symbol");
            if (sym) {
                txToggleFavoriteSymbol(sym, e);
            }
        });
    });
}

function txInitMarketSelector() {
    const trigger = document.getElementById("marketSelectorTrigger");
    const mobTrigger = document.getElementById("pairSelectMobileTrigger");
    const favHeaderStar = document.getElementById("currentSymbolFavStar");
    const mobFavStar = document.getElementById("mobileHeaderFavStar");
    const searchInput = document.getElementById("marketSearchInput");
    const searchClear = document.getElementById("marketSearchClear");
    const tabs = document.querySelectorAll("[data-mkt-tab]");
    const pills = document.querySelectorAll("[data-mkt-cat]");
    const sortHeaders = document.querySelectorAll("[data-sort]");

    if (trigger) {
        trigger.addEventListener("click", (e) => {
            if (e.target.closest("#currentSymbolFavStar")) return;
            txToggleMarketSelector();
        });
    }

    if (mobTrigger) {
        mobTrigger.addEventListener("click", (e) => {
            if (e.target.closest("#mobileHeaderFavStar")) return;
            txToggleMarketSelector();
        });
    }

    if (favHeaderStar) {
        favHeaderStar.addEventListener("click", (e) => {
            txToggleFavoriteSymbol(state.currentSymbol, e);
        });
    }

    if (mobFavStar) {
        mobFavStar.addEventListener("click", (e) => {
            txToggleFavoriteSymbol(state.currentSymbol, e);
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            txMarketSelectorState.searchQuery = e.target.value;
            if (searchClear) {
                searchClear.classList.toggle("hidden", !e.target.value);
            }
            txRenderMarketSelectorList();
        });
    }

    if (searchClear && searchInput) {
        searchClear.addEventListener("click", () => {
            searchInput.value = "";
            txMarketSelectorState.searchQuery = "";
            searchClear.classList.add("hidden");
            searchInput.focus();
            txRenderMarketSelectorList();
        });
    }

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            txMarketSelectorState.activeTab = tab.getAttribute("data-mkt-tab");
            txRenderMarketSelectorList();
        });
    });

    pills.forEach((pill) => {
        pill.addEventListener("click", () => {
            pills.forEach((p) => p.classList.remove("active"));
            pill.classList.add("active");
            txMarketSelectorState.activeCategory = pill.getAttribute("data-mkt-cat");
            txRenderMarketSelectorList();
        });
    });

    sortHeaders.forEach((th) => {
        th.addEventListener("click", () => {
            const col = th.getAttribute("data-sort");
            if (txMarketSelectorState.sortColumn === col) {
                txMarketSelectorState.sortDirection = txMarketSelectorState.sortDirection === "asc" ? "desc" : "asc";
            } else {
                txMarketSelectorState.sortColumn = col;
                txMarketSelectorState.sortDirection = "desc";
            }
            txRenderMarketSelectorList();
        });
    });

    document.addEventListener("click", (e) => {
        if (!txMarketSelectorState.isOpen) return;
        const container = document.getElementById("marketSelectorContainer");
        const mobTrig = document.getElementById("pairSelectMobileTrigger");
        if (container && container.contains(e.target)) return;
        if (mobTrig && mobTrig.contains(e.target)) return;
        txCloseMarketSelector();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && txMarketSelectorState.isOpen) {
            txCloseMarketSelector();
        }
    });

    txSyncHeaderFavStar();
}

function getTickerIcon(symbol) {
    return getCoinLogoSvg(symbol, "w-5 h-5");
}

function getTickerKey(item) {
    return `${item.symbol}_${item.quote}`;
}

function getTickerPrice(item, ticker) {
    const basePrice = ticker ? Number(ticker.c) : Number(defaultPrices[item.symbol] || 0);

    if (item.quote === "INR") {
        return basePrice * INR_RATE;
    }

    return basePrice;
}

function getTickerChange(ticker) {
    return ticker ? Number(ticker.P || 0) : 0;
}

function updateMetricsFromTicker(ticker) {
    if (!ticker) {
        return;
    }

    const price = Number(ticker.c || ticker.lastPrice || ticker.close || 0);
    const change = Number(ticker.P || ticker.priceChangePercent || 0);
    const low = Number(ticker.l || ticker.lowPrice || 0);
    const high = Number(ticker.h || ticker.highPrice || 0);
    const volume = Number(ticker.q || ticker.quoteVolume || 0);

    if (price > 0) {
        const tickerSymbol = normalizeSymbol(ticker.s || state.currentSymbol || "");
        txStoreLivePrice(tickerSymbol || state.currentSymbol, price);

        if (tickerSymbol === state.currentSymbol || txNormalizeProviderSymbol(tickerSymbol) === state.currentSymbol) {
            state.previousPrice = state.currentPrice || price;
            state.currentPrice = price;
        }

        // Live market selector real-time cache update
        let volFormatted = "";
        if (volume >= 1e9) volFormatted = `${(volume / 1e9).toFixed(2)}B`;
        else if (volume >= 1e6) volFormatted = `${(volume / 1e6).toFixed(2)}M`;
        else if (volume > 0) volFormatted = `${(volume / 1e3).toFixed(2)}K`;

        txMarketSelectorState.liveTickers[tickerSymbol] = {
            price,
            change,
            volStr: volFormatted || undefined,
            volNum: volume || undefined,
            funding: state.fundingRates[tickerSymbol] ? `${(state.fundingRates[tickerSymbol] * 100).toFixed(4)}%` : undefined
        };

        if (txMarketSelectorState.isOpen) {
            const priceEl = document.querySelector(`[data-mkt-price-for="${tickerSymbol}"]`);
            const chgEl = document.querySelector(`[data-mkt-chg-for="${tickerSymbol}"]`);
            if (priceEl) priceEl.textContent = txFormatMarketPrice(tickerSymbol, price);
            if (chgEl) {
                chgEl.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
                chgEl.className = `tx-mkt-cell-chg ${change >= 0 ? "pos" : "neg"}`;
            }
        }
    }

    const changeClass = change >= 0 ? "text-emerald-400" : "text-red-400";
    const sign = change >= 0 ? "+" : "";

    if (elements.markPrice) {
        const mark = txGetLivePriceForSymbol(state.currentSymbol, price);
        elements.markPrice.textContent = formatNumber(mark, mark < 1 ? 6 : 2);
    }

    if (elements.indexPrice) {
        const realIndexPrice = Number(
            ticker.i || ticker.indexPrice || ticker.index_price ||
            state.indexPrices[state.currentSymbol] ||
            state.indexPrices[txGetProviderSymbol(state.currentSymbol)] ||
            state.indexPrices[txNormalizeProviderSymbol(state.currentSymbol)] ||
            state.markPrices[state.currentSymbol] ||
            state.markPrices[txGetProviderSymbol(state.currentSymbol)] ||
            0
        );
        elements.indexPrice.textContent = realIndexPrice > 0
            ? formatNumber(realIndexPrice, realIndexPrice < 1 ? 6 : 2)
            : "--";
    }

    const pair = getPair(state.currentSymbol);
    const curPrice = price > 0 ? price : (defaultPrices[state.currentSymbol] || 100);
    const safeChange = change !== 0 ? change : (pair && pair.defaultChange !== undefined ? pair.defaultChange : 0);
    const safeLow = low > 0 ? low : curPrice * 0.965;
    const safeHigh = high > 0 ? high : curPrice * 1.035;

    const metricChangeClass = safeChange >= 0 ? "text-emerald-400" : "text-red-400";
    const metricSign = safeChange >= 0 ? "+" : "";

    if (elements.change24h) {
        elements.change24h.textContent = `${metricSign}${Number(safeChange).toFixed(2)}%`;
        elements.change24h.className = metricChangeClass;
    }

    if (elements.low24h) {
        elements.low24h.textContent = formatNumber(safeLow, safeLow < 1 ? 4 : 2);
    }

    if (elements.high24h) {
        elements.high24h.textContent = formatNumber(safeHigh, safeHigh < 1 ? 4 : 2);
    }

    if (elements.vol24h) {
        if (volume >= 1e9) {
            elements.vol24h.textContent = `${formatNumber(volume / 1e9, 2)}B`;
        } else if (volume >= 1e6) {
            elements.vol24h.textContent = `${formatNumber(volume / 1e6, 2)}M`;
        } else if (volume > 0) {
            elements.vol24h.textContent = `${formatNumber(volume / 1e3, 2)}K`;
        } else if (pair && pair.baseVol) {
            elements.vol24h.textContent = pair.baseVol;
        } else {
            elements.vol24h.textContent = "54.20M";
        }
    }
    txUpdateEstimatedMargin();
}

async function loadTickerMetrics() {
    const sym = state.currentSymbol;
    const pair = getPair(sym);

    // Immediately render sensible baseline numbers so UI NEVER shows empty '--'
    const fallbackPrice = Number(defaultPrices[sym] || 100);
    const fallbackChange = pair && pair.defaultChange !== undefined ? pair.defaultChange : 0;
    const fallbackVolNum = pair && pair.baseVol ? txParseVolNum(pair.baseVol) : 50000000;

    updateMetricsFromTicker({
        s: sym,
        c: fallbackPrice,
        P: fallbackChange,
        l: fallbackPrice * 0.965,
        h: fallbackPrice * 1.035,
        q: fallbackVolNum
    });

    if (isCommoditySymbol()) {
        try {
            if (typeof apiRequest === "function") {
                const response = await apiRequest(`/market/ticker/${encodeURIComponent(sym)}`);
                const ticker = (response && response.data) || {};
                const price = Number(ticker.last_price || ticker.lastPrice || ticker.price || 0);
                const change = Number(ticker.price_change_percent || ticker.priceChangePercent || 0);
                if (price > 0) {
                    updateMetricsFromTicker({
                        s: sym,
                        c: price,
                        P: change,
                        l: Number(ticker.low_price || ticker.lowPrice || price * 0.97),
                        h: Number(ticker.high_price || ticker.highPrice || price * 1.03),
                        q: Number(ticker.quote_volume || ticker.quoteVolume || 1150000000)
                    });
                    updateLivePrice(price);
                }
            }
        } catch (error) {
            console.warn("Unable to load Gold ticker metrics:", error);
        }
        return;
    }

    // Try backend proxy / API endpoint first (with multi-mirror failover), then direct mirrors
    const endpoints = [
        `/api/market/ticker/${encodeURIComponent(sym)}`,
        `https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${encodeURIComponent(sym)}`,
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(sym)}`,
        `${REST_BASE}/ticker/24hr?symbol=${encodeURIComponent(sym)}`
    ];

    for (const url of endpoints) {
        try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const data = await res.json();
            const ticker = (data && data.data) ? data.data : data;

            const p = Number(ticker.c || ticker.lastPrice || ticker.last_price || ticker.close || 0);
            const chg = Number(ticker.P || ticker.priceChangePercent || ticker.price_change_percent || 0);
            const low = Number(ticker.l || ticker.lowPrice || ticker.low_price || 0);
            const high = Number(ticker.h || ticker.highPrice || ticker.high_price || 0);
            const vol = Number(ticker.q || ticker.quoteVolume || ticker.quote_volume || ticker.v || ticker.volume || 0);

            if (p > 0) {
                updateMetricsFromTicker({
                    s: sym,
                    c: p,
                    P: chg,
                    l: low,
                    h: high,
                    q: vol
                });
                break;
            }
        } catch (err) {
            // try next endpoint in failover list
        }
    }
}

/* =========================
   CHART
========================= */

function clearTradingViewWidgetCacheForCommodity() {
    if (!isCommoditySymbol()) {
        return;
    }

    ["traidiumx_tv_symbol", "traidiumx_tv_interval"].forEach((key) => {
        try {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        } catch (error) {
            console.warn("Unable to clear TraidiumX chart state:", error);
        }
    });
}


function getTradingViewSymbol(symbol = state.currentSymbol) {
    const cleanSymbol = normalizeSymbol(symbol);

    const map = {
        BTCUSDT: "BINANCE:BTCUSDT.P",
        ETHUSDT: "BINANCE:ETHUSDT.P",
        BNBUSDT: "BINANCE:BNBUSDT.P",
        SOLUSDT: "BINANCE:SOLUSDT.P",
        XRPUSDT: "BINANCE:XRPUSDT.P",
        DOGEUSDT: "BINANCE:DOGEUSDT.P",
        ADAUSDT: "BINANCE:ADAUSDT.P",
        AVAXUSDT: "BINANCE:AVAXUSDT.P",
        LINKUSDT: "BINANCE:LINKUSDT.P",
        LTCUSDT: "BINANCE:LTCUSDT.P",
        TRXUSDT: "BINANCE:TRXUSDT.P",
        DOTUSDT: "BINANCE:DOTUSDT.P",
        BCHUSDT: "BINANCE:BCHUSDT.P",
        ATOMUSDT: "BINANCE:ATOMUSDT.P",
        UNIUSDT: "BINANCE:UNIUSDT.P",
        APTUSDT: "BINANCE:APTUSDT.P",
        XAUUSD: "BINANCE:XAUUSDT.P",
        GOLDUSD: "BINANCE:XAUUSDT.P"
    };

    if (map[cleanSymbol]) {
        return map[cleanSymbol];
    }

    return isCommoditySymbol(cleanSymbol) ? "BINANCE:XAUUSDT.P" : `BINANCE:${cleanSymbol}.P`;
}

function getTradingViewInterval(interval = state.interval) {
    const map = {
        "1m": "1",
        "5m": "5",
        "15m": "15",
        "1h": "60"
    };

    return map[interval] || "1";
}

function loadTradingViewChart() {
    if (!elements.chartContainer) {
        return;
    }

    clearTradingViewWidgetCacheForCommodity();

    const tvSymbol = getTradingViewSymbol();
    const tvInterval = getTradingViewInterval();
    const pair = getPair();

    state.chart = null;
    state.candleSeries = null;
    state.volumeSeries = null;

    elements.chartContainer.innerHTML = `
        <div class="rt-tv-loading">
            <span class="rt-tv-loader-dot"></span>
            Opening TradingView chart for ${pair.label}...
        </div>
    `;

    const widgetWrap = document.createElement("div");
    widgetWrap.className = "tradingview-widget-container rt-tv-widget-wrap rt-perfect-tv-wrap";
    widgetWrap.style.height = "100%";
    widgetWrap.style.width = "100%";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";

    widgetWrap.appendChild(widgetDiv);
    elements.chartContainer.innerHTML = "";
    elements.chartContainer.appendChild(widgetWrap);

    const isLight = document.documentElement.classList.contains("light") || (localStorage.getItem("traidiumx_theme") || "dark") === "light";
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = `https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js?v=${Date.now()}`;
    script.innerHTML = JSON.stringify({
        autosize: true,
        symbol: tvSymbol,
        interval: tvInterval,
        timezone: "Asia/Kolkata",
        theme: isLight ? "light" : "dark",
        colorTheme: isLight ? "light" : "dark",
        style: "1",
        locale: "en",
        toolbar_bg: isLight ? "#ffffff" : "#0b111d",
        backgroundColor: isLight ? "#ffffff" : "#020617",
        gridColor: isLight ? "#f1f5f9" : "#1e293b",
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        hide_side_toolbar: false,
        allow_symbol_change: !isCommoditySymbol(),
        save_image: true,
        withdateranges: true,
        calendar: false,
        details: false,
        hotlist: false,
        support_host: "https://www.tradingview.com",
        studies: [],
        show_popup_button: !isCommoditySymbol(),
        popup_width: "1200",
        popup_height: "720"
    });

    widgetWrap.appendChild(script);

    if (elements.terminalCandleInfo) {
        elements.terminalCandleInfo.textContent = "TradingView chart loaded.";
    }
}

window.loadTradingViewChart = loadTradingViewChart;

function initChart() {
    loadTradingViewChart();
}

async function loadInitialCandles() {
    if (isCommoditySymbol()) {
        state.currentCandle = null;
        state.lastCandleUpdateAt = Date.now();

        if (elements.terminalCandleInfo) {
            elements.terminalCandleInfo.textContent = "XAUUSD chart is loaded from TradingView Binance XAUUSDT.P. Live price is loaded through backend.";
        }

        return;
    }

    const url = `${REST_BASE}/klines?symbol=${state.currentSymbol}&interval=${state.interval}&limit=220`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Kline API failed");
        }

        const rows = await response.json();

        const candles = rows.map((row) => ({
            time: Math.floor(Number(row[0]) / 1000),
            open: Number(row[1]),
            high: Number(row[2]),
            low: Number(row[3]),
            close: Number(row[4])
        }));

        const volumes = rows.map((row) => {
            const open = Number(row[1]);
            const close = Number(row[4]);

            return {
                time: Math.floor(Number(row[0]) / 1000),
                value: Number(row[5]),
                color: close >= open ? "rgba(22, 199, 132, 0.45)" : "rgba(234, 57, 67, 0.45)"
            };
        });

        if (state.candleSeries) {
            state.candleSeries.setData(candles);
        }

        if (state.volumeSeries) {
            state.volumeSeries.setData(volumes);
        }

        const last = candles[candles.length - 1];

        if (last) {
            state.currentCandle = {
                ...last,
                volume: Number(rows[rows.length - 1][5])
            };

            state.currentPrice = last.close;
            state.previousPrice = last.close;
            state.lastCandleUpdateAt = Date.now();

            updateLivePrice(last.close);
        }

        if (state.chart) {
            state.chart.timeScale().fitContent();
        }

        if (elements.terminalCandleInfo) {
            elements.terminalCandleInfo.textContent = "Initial candles loaded from API.";
        }
    } catch (error) {
        console.error(error);

        if (elements.terminalCandleInfo) {
            elements.terminalCandleInfo.textContent = "Kline API failed. Demo candle simulator started.";
        }

        startFallbackCandles();
    }
}

function updateCurrentCandleFromTrade(price, qty = 0, timestampMs = Date.now(), source = "trade") {
    const bucketTime = getCandleBucketTime(timestampMs);
    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
        return;
    }

    if (!state.currentCandle || bucketTime > state.currentCandle.time) {
        const openPrice = state.currentCandle ? state.currentCandle.close : numericPrice;

        state.currentCandle = {
            time: bucketTime,
            open: openPrice,
            high: Math.max(openPrice, numericPrice),
            low: Math.min(openPrice, numericPrice),
            close: numericPrice,
            volume: Number(qty) || 0
        };
    } else {
        state.currentCandle.high = Math.max(state.currentCandle.high, numericPrice);
        state.currentCandle.low = Math.min(state.currentCandle.low, numericPrice);
        state.currentCandle.close = numericPrice;
        state.currentCandle.volume += Number(qty) || 0;
    }

    if (state.candleSeries) {
        state.candleSeries.update({
            time: state.currentCandle.time,
            open: state.currentCandle.open,
            high: state.currentCandle.high,
            low: state.currentCandle.low,
            close: state.currentCandle.close
        });
    }

    if (state.volumeSeries) {
        state.volumeSeries.update({
            time: state.currentCandle.time,
            value: state.currentCandle.volume,
            color: state.currentCandle.close >= state.currentCandle.open
                ? "rgba(22, 199, 132, 0.45)"
                : "rgba(234, 57, 67, 0.45)"
        });
    }

    state.lastCandleUpdateAt = Date.now();

    if (elements.terminalCandleInfo) {
        elements.terminalCandleInfo.textContent =
            `O ${formatNumber(state.currentCandle.open)}  H ${formatNumber(state.currentCandle.high)}  L ${formatNumber(state.currentCandle.low)}  C ${formatNumber(state.currentCandle.close)} · ${source}`;
    }

    updateLivePrice(numericPrice);
}

function handleKline(data) {
    const kline = data.k;

    if (!kline) {
        return;
    }

    const candle = {
        time: Math.floor(Number(kline.t) / 1000),
        open: Number(kline.o),
        high: Number(kline.h),
        low: Number(kline.l),
        close: Number(kline.c),
        volume: Number(kline.v)
    };

    state.currentCandle = candle;

    if (state.candleSeries) {
        state.candleSeries.update({
            time: candle.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close
        });
    }

    if (state.volumeSeries) {
        state.volumeSeries.update({
            time: candle.time,
            value: candle.volume,
            color: candle.close >= candle.open
                ? "rgba(22, 199, 132, 0.45)"
                : "rgba(234, 57, 67, 0.45)"
        });
    }

    state.lastCandleUpdateAt = Date.now();
    updateLivePrice(candle.close);

    if (elements.terminalCandleInfo) {
        elements.terminalCandleInfo.textContent =
            `O ${formatNumber(candle.open)}  H ${formatNumber(candle.high)}  L ${formatNumber(candle.low)}  C ${formatNumber(candle.close)} · kline`;
    }
}

function flashPriceBadge(price) {
    if (!elements.currentPriceBadge) {
        return;
    }

    const isUp = Number(price) >= Number(state.previousPrice || price);
    elements.currentPriceBadge.style.background = isUp ? "#16c784" : "#ea3943";
}

function txUpdateDocumentTitle(price) {
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) return;
    const decimals = numericPrice < 1 ? 4 : 2;
    const pair = typeof pairs !== "undefined" && Array.isArray(pairs) ? pairs.find((p) => p.symbol === state.currentSymbol) : null;
    const symbolLabel = pair ? pair.label : state.currentSymbol;
    document.title = `${formatNumber(numericPrice, decimals)} | ${symbolLabel} Perpetual | TraidiumX`;
}

function updateLivePrice(price) {
    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
        return;
    }

    state.previousPrice = state.currentPrice || numericPrice;
    state.currentPrice = numericPrice;
    txStoreLivePrice(state.currentSymbol, numericPrice);
    txUpdateDocumentTitle(numericPrice);

    const decimals = numericPrice < 1 ? 4 : 2;

    const realMarkPrice = Number(state.markPrices[state.currentSymbol] || state.markPrices[txGetProviderSymbol(state.currentSymbol)] || 0);
    if (elements.markPrice) {
        elements.markPrice.textContent = realMarkPrice > 0 ? formatNumber(realMarkPrice, realMarkPrice < 1 ? 6 : 2) : formatNumber(numericPrice, decimals);
    }

    if (elements.indexPrice) {
        const realIndexPrice = Number(
            state.indexPrices[state.currentSymbol] ||
            state.indexPrices[txGetProviderSymbol(state.currentSymbol)] ||
            state.indexPrices[txNormalizeProviderSymbol(state.currentSymbol)] ||
            state.markPrices[state.currentSymbol] ||
            state.markPrices[txGetProviderSymbol(state.currentSymbol)] ||
            numericPrice
        );
        elements.indexPrice.textContent = realIndexPrice > 0
            ? formatNumber(realIndexPrice, realIndexPrice < 1 ? 6 : 2)
            : "--";
    }

    if (elements.currentPriceBadge) {
        elements.currentPriceBadge.textContent = formatNumber(numericPrice, decimals);
    }

    if (elements.orderBookMid) {
        elements.orderBookMid.textContent = `${formatNumber(numericPrice, decimals)} ${getQuoteAsset()}`;
    }

    if (elements.limitPriceInput && !elements.limitPriceInput.value) {
        elements.limitPriceInput.value = numericPrice.toFixed(decimals);
    }

    flashPriceBadge(numericPrice);

    if (isCommoditySymbol()) {
        loadCommodityMarketDepth(false);
    }

    processLimitOrders();
    txRefreshVisibleTradingRows();
    txUpdateEstimatedMargin();
}

/* =========================
   WEBSOCKET API
========================= */

function startMarketSocket() {
    stopMarketSocket();

    if (isCommoditySymbol()) {
        loadTickerMetrics();
        loadCommodityMarketDepth(true);

        state.goldTickerTimer = window.setInterval(() => {
            loadTickerMetrics();
        }, 5000);

        state.goldDepthTimer = window.setInterval(() => {
            loadCommodityMarketDepth(true);
        }, 5000);

        return;
    }

    const streamSymbol = state.currentSymbol.toLowerCase();

    const streams = [
        `${streamSymbol}@kline_${state.interval}`,
        `${streamSymbol}@depth20@100ms`,
        `${streamSymbol}@aggTrade`,
        `${streamSymbol}@ticker`
    ].join("/");

    let firstMessageReceived = false;

    try {
        state.marketSocket = new WebSocket(`${WS_BASE}${streams}`);

        state.marketSocket.onopen = () => {
            console.log("Market WebSocket connected:", state.currentSymbol);
        };

        state.marketSocket.onmessage = (event) => {
            firstMessageReceived = true;

            const response = JSON.parse(event.data);

            const stream = String(response.stream).toLowerCase();
            if (stream.includes("@kline")) {
                handleKline(response.data);
            }

            if (stream.includes("@depth20")) {
                handleDepth(response.data);
            }

            if (stream.includes("@aggtrade") || stream.includes("@trade")) {
                handleAggTrade(response.data);
            }

            if (stream.includes("@ticker")) {
                updateMetricsFromTicker(response.data);
            }
        };

        state.marketSocket.onerror = (error) => {
            console.error("Market WebSocket error:", error);

            if (!firstMessageReceived) {
                startFallbackCandles();
            }
        };

        state.marketSocket.onclose = () => {
            console.warn("Market WebSocket closed.");

            if (!firstMessageReceived) {
                startFallbackCandles();
            }
        };

        startCandleWatchdog();
    } catch (error) {
        console.error(error);
        startFallbackCandles();
    }
}

function stopMarketSocket() {
    if (state.marketSocket) {
        state.marketSocket.close();
        state.marketSocket = null;
    }

    if (state.fallbackTimer) {
        window.clearInterval(state.fallbackTimer);
        state.fallbackTimer = null;
    }

    if (state.candleWatchTimer) {
        window.clearInterval(state.candleWatchTimer);
        state.candleWatchTimer = null;
    }

    if (state.goldTickerTimer) {
        window.clearInterval(state.goldTickerTimer);
        state.goldTickerTimer = null;
    }

    if (state.goldDepthTimer) {
        window.clearInterval(state.goldDepthTimer);
        state.goldDepthTimer = null;
    }
}

function startCandleWatchdog() {
    if (state.candleWatchTimer) {
        window.clearInterval(state.candleWatchTimer);
    }

    state.candleWatchTimer = window.setInterval(() => {
        const now = Date.now();

        if (state.lastCandleUpdateAt && now - state.lastCandleUpdateAt > 7000) {
            // Real Binance candle update delayed. Waiting silently.
            return;
        }
    }, 7000);
}
function handleAggTrade(data) {
    const price = Number(data.p);
    const qty = Number(data.q);
    const isSell = Boolean(data.m);

    if (Number.isFinite(price) && price > 0) {
        const cleanDataSym = String(data.s || "").toUpperCase();
        if (!cleanDataSym || cleanDataSym === state.currentSymbol.toUpperCase()) {
            updateMarkPrice(price);
        } else {
            txStoreLivePrice(cleanDataSym, price);
        }
        txRefreshVisibleTradingRows();
    }

    const trade = {
        id: data.a || createId("TRD"),
        price,
        qty,
        side: isSell ? "SELL" : "BUY",
        time: Number(data.T) || Date.now()
    };

    state.trades.unshift(trade);
    state.trades = state.trades.slice(0, 22);

    renderRecentTrades();

    updateCurrentCandleFromTrade(price, qty, trade.time, "aggTrade");
}

function handleDepth(data) {
    const asks = (data.a || []).slice(0, 8).map((item) => ({
        price: Number(item[0]),
        qty: Number(item[1])
    }));

    const bids = (data.b || []).slice(0, 8).map((item) => ({
        price: Number(item[0]),
        qty: Number(item[1])
    }));

    const bestAsk = asks.find((row) => Number.isFinite(row.price) && row.price > 0);
    const bestBid = bids.find((row) => Number.isFinite(row.price) && row.price > 0);

    if (bestAsk && bestBid) {
        const midPrice = (bestAsk.price + bestBid.price) / 2;
        txStoreLivePrice(data.s || state.currentSymbol, midPrice);
        updateLivePrice(midPrice);
    }

    state.orderBook.asks = asks.reverse();
    state.orderBook.bids = bids;

    renderOrderBook();
}

function renderCommodityMarketPlaceholder() {
    state.orderBook = { asks: [], bids: [] };
    txInitMockTrades(state.currentSymbol);
    renderOrderBook();

    if (elements.orderBookMid) {
        elements.orderBookMid.textContent = "Live depth unavailable";
    }

    if (elements.terminalCandleInfo) {
        elements.terminalCandleInfo.textContent = "Waiting for real XAUUSDT market depth from backend.";
    }
}


function normalizeBackendOrderBookRows(rows = []) {
    return rows
        .map((row) => ({
            price: Number(row.price),
            qty: Number(row.quantity ?? row.qty ?? row.size ?? 0)
        }))
        .filter((row) => Number.isFinite(row.price) && row.price > 0 && Number.isFinite(row.qty) && row.qty >= 0);
}

function normalizeBackendTradeRows(rows = []) {
    return rows
        .map((row) => {
            const price = Number(row.price);
            const qty = Number(row.quantity ?? row.qty ?? row.size ?? 0);
            const isBuyerMaker = Boolean(row.is_buyer_maker ?? row.isBuyerMaker);

            return {
                id: row.id || createId("XAU-TRD"),
                price,
                qty,
                side: isBuyerMaker ? "SELL" : "BUY",
                time: row.time || row.created_at || Date.now()
            };
        })
        .filter((row) => Number.isFinite(row.price) && row.price > 0 && Number.isFinite(row.qty) && row.qty >= 0);
}

async function loadCommodityMarketDepth(force = false) {
    if (!isCommoditySymbol()) {
        return;
    }

    if (state.commodityDepthLoading) {
        return;
    }

    const now = Date.now();

    if (!force && state.lastCommodityDepthLoadAt && now - state.lastCommodityDepthLoadAt < 3000) {
        return;
    }

    if (typeof apiRequest !== "function") {
        renderCommodityMarketPlaceholder();
        return;
    }

    try {
        state.commodityDepthLoading = true;

        const [bookResponse, tradesResponse] = await Promise.all([
            apiRequest(`/market/orderbook/${encodeURIComponent(state.currentSymbol)}`),
            apiRequest(`/market/trades/${encodeURIComponent(state.currentSymbol)}`)
        ]);

        const book = bookResponse.data || {};
        const tradesData = tradesResponse.data || {};
        const asks = normalizeBackendOrderBookRows(book.asks || []);
        const bids = normalizeBackendOrderBookRows(book.bids || []);
        const trades = normalizeBackendTradeRows(tradesData.trades || []);

        if (asks.length) {
            state.orderBook.asks = asks.slice(0, 10).reverse();
        }

        if (bids.length) {
            state.orderBook.bids = bids.slice(0, 10);
        }

        if (trades.length) {
            state.trades = trades.slice(0, 22);
        }

        renderOrderBook();
        renderRecentTrades();

        state.lastCommodityDepthLoadAt = Date.now();

        if (elements.terminalCandleInfo) {
            elements.terminalCandleInfo.textContent = "XAUUSD orderbook/trades loaded from backend market API.";
        }
    } catch (error) {
        console.warn("Unable to load XAUUSD orderbook/trades from backend:", error);
        renderCommodityMarketPlaceholder();
    } finally {
        state.commodityDepthLoading = false;
    }
}


/* =========================
   FALLBACK SIMULATOR
========================= */
function startFallbackCandles() {
    console.warn("Fallback simulator disabled for real-time backend mode.");

    if (elements.terminalCandleInfo) {
        elements.terminalCandleInfo.textContent = "Waiting for real Binance market data...";
    }

    return;
}

function simulateOrderBook(price) {
    const asks = [];
    const bids = [];

    for (let index = 8; index >= 1; index--) {
        asks.push({
            price: price + index * price * 0.00008,
            qty: Math.random() * 3
        });
    }

    for (let index = 1; index <= 8; index++) {
        bids.push({
            price: price - index * price * 0.00008,
            qty: Math.random() * 3
        });
    }

    state.orderBook.asks = asks;
    state.orderBook.bids = bids;

    renderOrderBook();
}

function simulateTrades(price) {
    const trade = {
        id: createId("TRD"),
        price,
        qty: Math.random() * 0.2,
        side: Math.random() > 0.5 ? "BUY" : "SELL",
        time: Date.now()
    };

    state.trades.unshift(trade);
    state.trades = state.trades.slice(0, 22);

    renderRecentTrades();
}

/* =========================
   ORDERBOOK / TRADES UI
========================= */

function initOrderBookTabs() {
    if (
        !elements.orderBookTabBtn ||
        !elements.tradesTabBtn ||
        !elements.orderBookPanel ||
        !elements.tradesPanel
    ) {
        return;
    }

    elements.orderBookTabBtn.addEventListener("click", () => {
        elements.orderBookTabBtn.classList.add("active");
        elements.tradesTabBtn.classList.remove("active");
        elements.orderBookPanel.classList.remove("hidden");
        elements.tradesPanel.classList.add("hidden");
        renderOrderBook();
    });

    elements.tradesTabBtn.addEventListener("click", () => {
        elements.tradesTabBtn.classList.add("active");
        elements.orderBookTabBtn.classList.remove("active");
        elements.tradesPanel.classList.remove("hidden");
        elements.orderBookPanel.classList.add("hidden");
        renderRecentTrades();
    });
}

function renderOrderBook() {
    if (!elements.orderBookAsks || !elements.orderBookBids) {
        return;
    }

    let totalBidQty = 0;
    let totalAskQty = 0;

    state.orderBook.asks.forEach((row) => {
        totalAskQty += Number(row.qty || 0);
    });

    state.orderBook.bids.forEach((row) => {
        totalBidQty += Number(row.qty || 0);
    });

    const total = totalBidQty + totalAskQty || 1;
    const buyPercent = ((totalBidQty / total) * 100).toFixed(2);
    const sellPercent = ((totalAskQty / total) * 100).toFixed(2);

    let askCumulative = 0;
    elements.orderBookAsks.innerHTML = state.orderBook.asks.map((row) => {
        askCumulative += Number(row.qty || 0);
        return `
            <div class="rt-book-row ask">
                <span>${formatNumber(row.price, row.price < 1 ? 4 : 2)}</span>
                <span>${formatQty(row.qty)}</span>
                <span>${formatQty(askCumulative)}</span>
            </div>
        `;
    }).join("");

    let bidCumulative = 0;
    elements.orderBookBids.innerHTML = state.orderBook.bids.map((row) => {
        bidCumulative += Number(row.qty || 0);
        return `
            <div class="rt-book-row bid">
                <span>${formatNumber(row.price, row.price < 1 ? 4 : 2)}</span>
                <span>${formatQty(row.qty)}</span>
                <span>${formatQty(bidCumulative)}</span>
            </div>
        `;
    }).join("");

    if (elements.buyPercentBar) {
        elements.buyPercentBar.textContent = `B ${buyPercent}%`;
    }

    if (elements.sellPercentBar) {
        elements.sellPercentBar.textContent = `S ${sellPercent}%`;
    }
}

function renderRecentTrades() {
    if (!elements.recentTradesList) {
        return;
    }

    elements.recentTradesList.innerHTML = state.trades.slice(0, 18).map((trade) => {
        const className = trade.side === "BUY" ? "buy" : "sell";

        return `
            <div class="rt-trade-row ${className}">
                <span>${formatNumber(trade.price, trade.price < 1 ? 4 : 2)}</span>
                <span>${formatQty(trade.qty)}</span>
                <span>${formatTime(trade.time)}</span>
            </div>
        `;
    }).join("");
}

/* =========================
   WALLET / PNL
========================= */

/* Removed legacy duplicate calculatePositionPnl implementation. */

/* Removed legacy duplicate getUnrealizedPnl implementation. */

/* Removed legacy duplicate goToFuturesWalletAction implementation. */

function txGetFuturesWalletModalNodes() {
    return {
        modal: document.getElementById("futuresWalletModal"),
        closeBtn: document.getElementById("futuresWalletModalClose"),
        title: document.getElementById("futuresWalletModalTitle"),
        tabs: Array.from(document.querySelectorAll("[data-futures-wallet-tab]")),
        panels: Array.from(document.querySelectorAll("[data-futures-wallet-panel]")),
        message: document.getElementById("futuresWalletModalMessage"),
        tradingBalance: document.getElementById("futuresModalTradingBalance"),
        mainBalance: document.getElementById("futuresModalMainBalance"),
        tradingPnl: document.getElementById("futuresModalTradingPnl"),
        transferForm: document.getElementById("futuresTransferForm"),
        depositForm: document.getElementById("futuresDepositForm"),
        withdrawForm: document.getElementById("futuresWithdrawForm"),
        depositNetworkSelect: document.querySelector('#futuresDepositForm [name="crypto_network"]'),
        withdrawNetworkSelect: document.querySelector('#futuresWithdrawForm [name="crypto_network"]'),
        depositAddress: document.getElementById("futuresDepositAddress"),
        depositAddressStatus: document.getElementById("futuresDepositAddressStatus"),
        depositAddressWarning: document.getElementById("futuresDepositAddressWarning"),
        copyDepositAddressBtn: document.getElementById("futuresCopyDepositAddressBtn"),
        transferMessage: document.getElementById("futuresTransferMessage"),
        depositMessage: document.getElementById("futuresDepositMessage"),
        withdrawMessage: document.getElementById("futuresWithdrawMessage")
    };
}

function txGetActiveFuturesWalletAction() {
    const nodes = txGetFuturesWalletModalNodes();
    const action = String(nodes.modal?.dataset.walletAction || "transfer").toLowerCase();
    return ["transfer", "deposit", "withdraw"].includes(action) ? action : "transfer";
}

function txGetFuturesWalletMessageNodes() {
    const nodes = txGetFuturesWalletModalNodes();
    return {
        transfer: nodes.transferMessage,
        deposit: nodes.depositMessage,
        withdraw: nodes.withdrawMessage,
        legacy: nodes.message
    };
}

function txClearFuturesWalletModalMessages() {
    const messageNodes = txGetFuturesWalletMessageNodes();
    Object.values(messageNodes).forEach((node) => {
        if (!node) return;
        node.className = node.id === "futuresWalletModalMessage"
            ? "hidden"
            : "futures-wallet-panel-message hidden";
        node.textContent = "";
    });
}

function txSetFuturesWalletModalMessage(message = "", type = "success") {
    const messageNodes = txGetFuturesWalletMessageNodes();
    const clean = String(message || "").trim();

    if (!clean) {
        txClearFuturesWalletModalMessages();
        return;
    }

    const action = txGetActiveFuturesWalletAction();
    const target = messageNodes[action] || messageNodes.legacy;
    if (!target) return;

    const tone = type === "error" ? "error" : type === "info" ? "info" : "success";
    target.textContent = clean;
    target.className = target.id === "futuresWalletModalMessage"
        ? (tone === "error"
            ? "mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-200"
            : tone === "info"
                ? "mt-4 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-black text-cyan-100"
                : "mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-200")
        : `futures-wallet-panel-message ${tone}`;
}

function txSetFuturesWalletModalTab(action = "transfer") {
    const nodes = txGetFuturesWalletModalNodes();
    const target = ["transfer", "deposit", "withdraw"].includes(String(action).toLowerCase())
        ? String(action).toLowerCase()
        : "transfer";
    const titleMap = {
        transfer: "Transfer Funds",
        deposit: "Deposit to Main Wallet",
        withdraw: "Withdraw from Main Wallet"
    };

    if (nodes.modal) {
        nodes.modal.dataset.walletAction = target;
    }

    if (nodes.title) {
        nodes.title.textContent = titleMap[target] || "Wallet Quick Action";
    }

    nodes.tabs.forEach((tab) => {
        const active = tab.getAttribute("data-futures-wallet-tab") === target;
        tab.classList.toggle("ring-2", active);
        tab.classList.toggle("ring-cyan-300", active);
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    nodes.panels.forEach((panel) => {
        panel.classList.toggle("hidden", panel.getAttribute("data-futures-wallet-panel") !== target);
    });

    if (target === "deposit") {
        txUpdateFuturesDepositAddressUI();
        txLoadFuturesDepositAddresses(true);
    }

    txSetFuturesWalletModalMessage("");
}

let TX_FUTURES_USDT_RATE = 88.50;

async function txFetchFuturesUsdtRate() {
    try {
        const response = await txApiRequestWithTimeout("/wallet/usdt-rate", {}, 4000);
        if (response && response.data && response.data.usdt_rate) {
            TX_FUTURES_USDT_RATE = Number(response.data.usdt_rate) || 88.50;
        }
    } catch (e) {
        console.warn("USDT rate fetch skipped:", e);
    }
    const rateText = `1 USDT = ₹${TX_FUTURES_USDT_RATE.toFixed(2)} INR`;
    const badge = document.getElementById("futuresTransferUsdtRateText");
    if (badge) badge.textContent = rateText;

    if (typeof txUpdateSubTransferPreview === "function") {
        txUpdateSubTransferPreview(TX_FUTURES_USDT_RATE);
    }

    const depInput = document.getElementById("futuresDepositAmount");
    if (depInput) depInput.dispatchEvent(new Event("input"));
    const withInput = document.getElementById("futuresWithdrawAmount");
    if (withInput) withInput.dispatchEvent(new Event("input"));
    const trfInput = document.getElementById("futuresTransferAmount");
    if (trfInput) trfInput.dispatchEvent(new Event("input"));
}

function txOpenFuturesWalletModal(action = "transfer") {
    const nodes = txGetFuturesWalletModalNodes();

    // Update active sub-account labels in the modal
    const activeSelector = document.getElementById("tradingAccountSelector");
    const activeText = activeSelector && activeSelector.value !== "main" 
        ? activeSelector.options[activeSelector.selectedIndex]?.text 
        : "Trading";

    const modalTradingLabel = document.getElementById("futuresModalTradingLabel");
    if (modalTradingLabel) {
        modalTradingLabel.textContent = activeText;
    }

    const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const isINR = primaryCurrency === "INR";
    const rateBadge = document.getElementById("futuresTransferUsdtRateBadge");
    if (rateBadge) {
        rateBadge.style.display = isINR ? "flex" : "none";
    }

    const transferDirSelect = document.getElementById("futuresTransferDirection");
    if (transferDirSelect) {
        if (isINR) {
            transferDirSelect.options[0].textContent = `Main Wallet (INR) → ${activeText} (USD)`;
            transferDirSelect.options[1].textContent = `${activeText} (USD) → Main Wallet (INR)`;
        } else {
            transferDirSelect.options[0].textContent = `Main Wallet (USD) → ${activeText} (USD)`;
            transferDirSelect.options[1].textContent = `${activeText} (USD) → Main Wallet (USD)`;
        }
    }

    if (!nodes.modal) {
        // Fallback only if old HTML is cached. New HTML uses the modal.
        try {
            sessionStorage.setItem("traidiumx_wallet_focus_action", action);
        } catch (error) {
            console.warn("Unable to save wallet focus action.", error);
        }
        window.location.href = action === "withdraw" ? "./wallet.html#withdrawal" : action === "transfer" ? "./wallet.html#transfer" : "./wallet.html#deposit";
        return;
    }

    if (!isLoggedIn()) {
        showOrderMessage("Please login first.", "error");
        return;
    }

    if (nodes.depositForm) {
        const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
        nodes.depositForm.dataset.activeCurrency = primaryCurrency;
    }
    if (nodes.withdrawForm) {
        const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
        nodes.withdrawForm.dataset.activeCurrency = primaryCurrency;
    }

    txFetchFuturesUsdtRate();
    txUpdateFuturesDepositModalUIByCurrency();
    txUpdateFuturesWithdrawalModalUIByCurrency();
    txUpdateFuturesWalletModalBalances();
    txSetFuturesWalletModalTab(action);
    nodes.modal.classList.remove("hidden");
    nodes.modal.classList.add("flex");
}

function txCloseFuturesWalletModal() {
    const nodes = txGetFuturesWalletModalNodes();
    if (!nodes.modal) return;
    nodes.modal.classList.add("hidden");
    nodes.modal.classList.remove("flex");
    txSetFuturesWalletModalMessage("");
}

function txUpdateFuturesWalletModalBalances() {
    const nodes = txGetFuturesWalletModalNodes();
    const wallet = getWallet();
    const rawWallet = TX_BACKEND_FUTURES.wallet || {};
    const pnl = getPositions().reduce((total, position) => total + calculatePositionPnl(position), 0);
    
    let mainCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
    
    if (nodes.modal && !nodes.modal.classList.contains("hidden")) {
        const activePanel = nodes.modal.querySelector("[data-futures-wallet-panel]:not(.hidden)");
        const action = activePanel?.getAttribute("data-futures-wallet-panel");
        if (action === "deposit") {
            mainCurrency = nodes.depositForm?.dataset.activeCurrency || mainCurrency;
        } else if (action === "withdraw") {
            mainCurrency = nodes.withdrawForm?.dataset.activeCurrency || mainCurrency;
        }
    }

    let targetMainWallet = {};
    if (mainCurrency === "INR") {
        targetMainWallet = rawWallet.main_wallet_inr || { available_balance: 0, locked_balance: 0, total_balance: 0, currency: "INR" };
    } else {
        targetMainWallet = rawWallet.main_wallet_usdt || { available_balance: 0, locked_balance: 0, total_balance: 0, currency: "USDT" };
    }

    if (nodes.tradingBalance) nodes.tradingBalance.textContent = formatFuturesUsd(txToNumber(wallet.available, 0), 2);
    if (nodes.mainBalance) {
        const bal = txToNumber(targetMainWallet.available_balance, 0);
        nodes.mainBalance.textContent = mainCurrency === "INR" ? `₹${bal.toFixed(2)}` : `$${bal.toFixed(2)}`;
    }
    if (nodes.tradingPnl) {
        nodes.tradingPnl.textContent = `${pnl >= 0 ? "+" : ""}${formatNumber(pnl, 2)} USDT`;
        txApplyMoneyCellColor(nodes.tradingPnl, pnl);
    }
}

function txSyncWalletModalCurrencyUI(nodes, primaryCurrency) {
    if (!nodes) return;
    const activeCurrency = nodes.depositForm?.dataset.activeCurrency;
    txUpdateFuturesDepositModalUIByCurrency(activeCurrency || primaryCurrency);
    txUpdateFuturesWithdrawalModalUIByCurrency();
    txUpdateFuturesDepositAddressUI();
}

function txUpdateFuturesDepositModalUIByCurrency(currency) {
    const nodes = txGetFuturesWalletModalNodes();
    const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const activeCurrency = primaryCurrency; // Force matching navbar currency
    if (nodes.depositForm) nodes.depositForm.dataset.activeCurrency = activeCurrency;

    const isINR = activeCurrency === "INR";
    const isLocked = true; // Hide toggle bar

    const inrBox = document.getElementById("futuresInrDepositBox");
    const cryptoBox = document.getElementById("futuresCryptoDepositBox");
    const amountLabel = document.getElementById("futuresDepositAmountLabel");
    const depositAmountInput = document.getElementById("futuresDepositAmount");
    const subtitle = document.getElementById("futuresDepositSubtitle");
    const toggleBar = document.getElementById("futuresDepositCurrencyToggleBar");
    const btnInr = document.getElementById("futuresSelectInrBtn");
    const btnUsdt = document.getElementById("futuresSelectUsdtBtn");
    const submitBtn = document.getElementById("futuresCreateDepositBtn");
    const footerSubtext = document.getElementById("futuresDepositFooterSubtext");
    const cryptoAssetInput = document.getElementById("futuresCryptoAsset");

    if (inrBox) inrBox.classList.toggle("hidden", !isINR);
    if (cryptoBox) cryptoBox.classList.toggle("hidden", isINR);
    if (cryptoAssetInput) cryptoAssetInput.value = isINR ? "INR" : "USDT";

    if (amountLabel) amountLabel.textContent = isINR ? "Amount (INR)" : "Amount (USD)";
    if (depositAmountInput) {
        depositAmountInput.placeholder = isINR ? "1000.00" : "100.00";
    }

    if (subtitle) {
        subtitle.textContent = isINR
            ? "Pay via UPI / Bank Transfer to the company details below, enter your payment UTR / Ref ID and submit. Funds credit to Main Wallet."
            : "Copy the USDT address, send from your wallet, then enter the amount and submit. Funds credit to Main Wallet.";
    }

    if (submitBtn) {
        submitBtn.textContent = isINR ? "Deposit INR" : "Deposit USDT";
    }

    if (footerSubtext) {
        footerSubtext.textContent = isINR
            ? "Send payment to company details above. Balance credits on submit."
            : "Send USDT to the address above. Balance credits on submit.";
    }

    if (toggleBar) toggleBar.classList.toggle("hidden", isLocked);

    const activeTabClass = "flex items-center justify-center rounded-xl py-2.5 text-xs font-black transition bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20";
    const inactiveTabClass = "flex items-center justify-center rounded-xl py-2.5 text-xs font-black transition bg-transparent text-slate-400 hover:text-white";

    if (btnInr && btnUsdt) {
        if (isINR) {
            btnInr.className = activeTabClass;
            btnUsdt.className = inactiveTabClass;
        } else {
            btnUsdt.className = activeTabClass;
            btnInr.className = inactiveTabClass;
        }
    }

    if (depositAmountInput) depositAmountInput.dispatchEvent(new Event("input"));
    txUpdateFuturesWalletModalBalances();
}

function txUpdateFuturesWithdrawalModalUIByCurrency(currency) {
    const nodes = txGetFuturesWalletModalNodes();
    const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const activeCurrency = primaryCurrency; // Force matching navbar currency
    if (nodes.withdrawForm) nodes.withdrawForm.dataset.activeCurrency = activeCurrency;

    const isINR = activeCurrency === "INR";
    const netBox = document.getElementById("futuresWithdrawNetworkBox");
    const tagBox = document.getElementById("futuresWithdrawTagBox");
    const subTitle = document.getElementById("futuresWithdrawSubtitle");
    const amountLabel = document.getElementById("futuresWithdrawAmountLabel");
    const addressLabel = document.getElementById("futuresWithdrawalAddressLabel");
    const addressInput = document.getElementById("futuresWithdrawalAddress");
    const methodInput = document.getElementById("futuresWithdrawMethodInput");
    const assetInput = document.getElementById("futuresWithdrawAsset");
    const btnInr = document.getElementById("txFuturesSelectWithdrawInrBtn");
    const btnUsdt = document.getElementById("txFuturesSelectWithdrawUsdtBtn");

    const toggleBar = document.getElementById("txFuturesWithdrawCurrencyToggleBar");
    if (toggleBar) toggleBar.classList.add("hidden");

    if (netBox) netBox.classList.toggle("hidden", isINR);
    if (tagBox) tagBox.classList.toggle("hidden", isINR);
    if (methodInput) methodInput.value = isINR ? "inr_withdrawal" : "crypto_withdrawal";
    if (assetInput) assetInput.value = isINR ? "INR" : "USDT";

    if (subTitle) {
        subTitle.textContent = isINR
            ? "Submit your UPI ID or Bank Details for INR withdrawal payout after Admin approval."
            : "Submit your USDT wallet address. Admin approval completes payout.";
    }

    if (amountLabel) amountLabel.textContent = isINR ? "Amount (INR / ₹)" : "Amount (USD / $)";
    if (addressLabel) addressLabel.textContent = isINR ? "Your UPI ID / Bank Account Payout Details" : "Your USDT Withdrawal Address";
    if (addressInput) {
        addressInput.placeholder = isINR ? "Enter UPI ID (e.g. name@upi) or Bank Account No. & IFSC" : "Paste external wallet address";
    }

    const activeTabClass = "flex items-center justify-center rounded-xl py-2.5 text-xs font-black transition bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20";
    const inactiveTabClass = "flex items-center justify-center rounded-xl py-2.5 text-xs font-black transition bg-transparent text-slate-400 hover:text-white";

    if (btnInr && btnUsdt) {
        if (isINR) {
            btnInr.className = activeTabClass;
            btnUsdt.className = inactiveTabClass;
        } else {
            btnUsdt.className = activeTabClass;
            btnInr.className = inactiveTabClass;
        }
    }

    const withInput = document.getElementById("futuresWithdrawAmount");
    if (withInput) withInput.dispatchEvent(new Event("input"));
    txUpdateFuturesWalletModalBalances();
}

async function txUpdateFuturesWithdrawalFeePreview() {
    const withInput = document.getElementById("futuresWithdrawAmount");
    const netSelect = document.getElementById("futuresWithdrawNetwork");

    const amountEl = document.getElementById("futuresWithdrawPreviewAmount");
    const receiveEl = document.getElementById("futuresWithdrawPreviewReceive");
    const feeEl = document.getElementById("futuresWithdrawPreviewCompanyFee");
    const debitEl = document.getElementById("futuresWithdrawPreviewTotalDebit");
    const noteEl = document.getElementById("futuresWithdrawPreviewNote");

    if (!withInput) return;

    const val = parseFloat(withInput.value || 0);
    const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const isINR = primaryCurrency === "INR";
    const symbol = isINR ? "₹" : "$";
    const unit = isINR ? "INR" : "USDT";

    if (!val || val <= 0) {
        if (amountEl) amountEl.textContent = "--";
        if (receiveEl) receiveEl.textContent = "--";
        if (feeEl) feeEl.textContent = "--";
        if (debitEl) debitEl.textContent = "--";
        if (noteEl) noteEl.textContent = "Enter amount and payout details to submit request.";
        return;
    }

    try {
        const network = isINR ? "UPI/BANK" : (netSelect?.value || "TRC20");
        const response = await txApiRequestWithTimeout("/fees/estimate", {
            method: "POST",
            body: JSON.stringify({
                product: "withdrawal",
                amount: val,
                crypto_network: network
            })
        }, 4000);

        const data = response?.data || {};
        const fee = Number(data.total_fee_usdt || data.withdrawal_fee_usdt || 0);
        const receive = Number(data.payout_amount_usdt || Math.max(val - fee, 0));
        const debit = Number(data.total_wallet_debit_usdt || val);

        if (amountEl) amountEl.textContent = `${symbol}${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (receiveEl) receiveEl.textContent = `${symbol}${receive.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (feeEl) feeEl.textContent = `${symbol}${fee.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (debitEl) debitEl.textContent = `${symbol}${debit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (noteEl) noteEl.textContent = `Fees are deducted from your withdraw amount. You will receive ${symbol}${receive.toFixed(2)} after admin approval.`;
    } catch (e) {
        const fee = 0;
        const receive = val;
        if (amountEl) amountEl.textContent = `${symbol}${val.toFixed(2)}`;
        if (receiveEl) receiveEl.textContent = `${symbol}${receive.toFixed(2)}`;
        if (feeEl) feeEl.textContent = `${symbol}${fee.toFixed(2)}`;
        if (debitEl) debitEl.textContent = `${symbol}${val.toFixed(2)}`;
        if (noteEl) noteEl.textContent = `Fees are deducted from your withdraw amount. You will receive ${symbol}${receive.toFixed(2)} after admin approval.`;
    }
}

function txBindFuturesRealtimeConversionCalculator() {
    const depInput = document.getElementById("futuresDepositAmount");
    const youDepEl = document.getElementById("futuresDepCalcYouDeposit");
    const walletCreditEl = document.getElementById("futuresDepCalcWalletCredit");
    const rateNoteEl = document.getElementById("futuresDepCalcRateNote");

    if (depInput) {
        const updateDep = () => {
            const val = parseFloat(depInput.value || 0);
            const rate = TX_FUTURES_USDT_RATE || 88.50;
            const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
            const activeForm = document.getElementById("futuresDepositForm");
            const activeCurrency = String(activeForm?.dataset.activeCurrency || primaryCurrency).toUpperCase();
            const isINR = activeCurrency === "INR";

            if (isINR) {
                if (youDepEl) youDepEl.textContent = val > 0 ? `₹${val.toLocaleString()}` : "₹0.00";
                if (walletCreditEl) {
                    if (val > 0) {
                        const usdtEq = (val / rate).toFixed(4);
                        walletCreditEl.innerHTML = `₹${val.toLocaleString()} INR <span class="text-xs font-normal text-slate-400">(≈ ${usdtEq} USDT)</span>`;
                    } else {
                        walletCreditEl.textContent = "₹0.00 INR";
                    }
                }
                if (rateNoteEl) rateNoteEl.textContent = `Min ₹100 · $1 = ₹${rate.toFixed(2)}`;
            } else {
                if (youDepEl) youDepEl.textContent = val > 0 ? `$${val.toFixed(2)}` : "$0.00";
                if (walletCreditEl) walletCreditEl.textContent = val > 0 ? `$${val.toFixed(2)} USDT` : "$0.00 USDT";
                const minUsdt = TX_FUTURES_DEPOSIT_ADDRESS_STATE.minAmount || 10;
                const minInr = (minUsdt * rate).toFixed(0);
                if (rateNoteEl) rateNoteEl.textContent = `Min $${minUsdt} / ₹${minInr} · $1 = ₹${rate.toFixed(2)}`;
            }
        };
        depInput.addEventListener("input", updateDep);
        depInput.addEventListener("keyup", updateDep);
        updateDep();
    }

    const withInput = document.getElementById("futuresWithdrawAmount");
    const withPrev = document.getElementById("futuresWithdrawConversionPreview");
    const netSelect = document.getElementById("futuresWithdrawNetwork");

    if (withInput) {
        const updateWith = () => {
            const val = parseFloat(withInput.value || 0);
            const rate = TX_FUTURES_USDT_RATE || 88.50;
            const isINR = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase() === "INR";
            if (withPrev) {
                if (val > 0) {
                    if (isINR) {
                        const usdtEq = (val / rate).toFixed(4);
                        withPrev.innerHTML = `₹${val.toLocaleString()} INR → net payout ≈ <span class="text-white font-extrabold text-sm">${usdtEq} USDT</span>`;
                    } else {
                        withPrev.innerHTML = `$${val} USDT → net payout <span class="text-white font-extrabold text-sm">$${val} USDT</span>`;
                    }
                } else {
                    withPrev.innerHTML = `Enter withdrawal amount to see live calculation`;
                }
            }
            txUpdateFuturesWithdrawalFeePreview();
        };
        withInput.addEventListener("input", updateWith);
        withInput.addEventListener("keyup", updateWith);
        netSelect?.addEventListener("change", updateWith);
        updateWith();
    }

    const trfInput = document.getElementById("futuresTransferAmount");
    const trfDir = document.getElementById("futuresTransferDirection");
    const trfPrev = document.getElementById("futuresTransferConversionPreview");
    const trfLabel = document.getElementById("futuresTransferAmountLabel");
    const trfMaxBtn = document.getElementById("futuresTransferMaxBtn");

    if (trfInput && trfPrev) {
        const updateTrf = () => {
            const val = parseFloat(trfInput.value || 0);
            const rate = TX_FUTURES_USDT_RATE || 88.50;
            const dir = trfDir?.value || "main_to_trading";
            const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
            const isINR = primaryCurrency === "INR";

            if (trfLabel) {
                trfLabel.textContent = (dir === "main_to_trading" && isINR) ? "Amount (INR / ₹)" : "Amount (USDT / $)";
            }
            if (val > 0) {
                if (dir === "main_to_trading") {
                    if (isINR) {
                        const usdtEq = (val / rate).toFixed(4);
                        trfPrev.innerHTML = `₹${val.toLocaleString()} INR Main Wallet → <span class="text-white font-extrabold text-sm">${usdtEq} USDT</span> Trading Wallet`;
                    } else {
                        trfPrev.innerHTML = `$${val} USDT Main Wallet → <span class="text-white font-extrabold text-sm">$${val} USDT</span> Trading Wallet`;
                    }
                } else {
                    if (isINR) {
                        const inrEq = (val * rate).toFixed(2);
                        trfPrev.innerHTML = `${val} USDT Trading Wallet → <span class="text-white font-extrabold text-sm">₹${Number(inrEq).toLocaleString()} INR</span> Main Wallet`;
                    } else {
                        trfPrev.innerHTML = `$${val} USDT Trading Wallet → <span class="text-white font-extrabold text-sm">$${val} USDT</span> Main Wallet`;
                    }
                }
            } else {
                trfPrev.innerHTML = `Enter amount to see live conversion`;
            }
        };
        trfInput.addEventListener("input", updateTrf);
        trfInput.addEventListener("keyup", updateTrf);
        trfDir?.addEventListener("change", updateTrf);
        updateTrf();

        if (trfMaxBtn) {
            trfMaxBtn.addEventListener("click", () => {
                const dir = trfDir?.value || "main_to_trading";
                const wallet = getWallet();
                const mainWallet = txGetMainWalletBucket();
                if (dir === "main_to_trading") {
                    trfInput.value = txToNumber(mainWallet.available_balance, 0);
                } else {
                    trfInput.value = txToNumber(wallet.available, 0);
                }
                trfInput.dispatchEvent(new Event("input"));
            });
        }
    }
}

async function txRefreshFuturesWalletAfterAction() {
    try {
        await refreshBackendFuturesData(true);
    } catch (error) {
        console.warn("Futures wallet refresh skipped:", error);
    }
    updateWalletUI();
    txUpdateFuturesWalletModalBalances();
    try {
        window.dispatchEvent(new CustomEvent("traidiumx:wallet-sync"));
    } catch (error) {
        console.warn("Wallet sync event skipped:", error);
    }
}

function txIsWithdrawalKycRequired(error) {
    const errors = error?.errors || {};
    const message = `${error?.message || ""} ${Object.values(errors).join(" ")}`.toLowerCase();
    return Boolean(errors.kyc_required || errors.kyc || message.includes("kyc") || message.includes("identity verification"));
}

function txRedirectToWithdrawalKyc() {
    const next = encodeURIComponent("./wallet.html#withdrawal");
    window.setTimeout(() => {
        window.location.href = `./kyc.html?next=${next}&reason=withdrawal`;
    }, 850);
}

function txGetFuturesWalletError(error, fallback) {
    if (typeof showApiError === "function") {
        return showApiError(error, fallback);
    }
    return error?.message || fallback;
}

const TX_FUTURES_DEPOSIT_ADDRESS_STATE = {
    networks: [],
    loaded: false,
    loading: false,
    error: "",
    minAmount: 10,
    maxAmount: 1000000
};

function txGetSelectedFuturesDepositNetwork() {
    const netEl = document.getElementById("futuresCryptoNetwork");
    const selected = String(netEl?.value || "TRC20").trim().toUpperCase();
    return ["TRC20", "ERC20", "BEP20"].includes(selected) ? selected : "TRC20";
}

function txGetSelectedFuturesDepositAddressInfo() {
    const network = txGetSelectedFuturesDepositNetwork();
    return (TX_FUTURES_DEPOSIT_ADDRESS_STATE.networks || []).find((item) => {
        return String(item.network || "").trim().toUpperCase() === network;
    }) || null;
}

function txSetFuturesDepositCopyState(enabled) {
    const btn = document.getElementById("futuresCopyCryptoAddressBtn");
    if (!btn) return;

    btn.disabled = !enabled;
    btn.classList.toggle("opacity-50", !enabled);
    btn.classList.toggle("cursor-not-allowed", !enabled);
}

function txUpdateFuturesDepositAddressUI() {
    const addressInfo = txGetSelectedFuturesDepositAddressInfo();
    const address = String(addressInfo?.address || "").trim();
    const isConfigured = Boolean(addressInfo?.is_configured && address);
    const network = txGetSelectedFuturesDepositNetwork();

    const boxLabel = document.getElementById("futuresCryptoAddressBoxLabel");
    if (boxLabel) boxLabel.textContent = `USDT ${network}`;

    const addrEl = document.getElementById("futuresDepositAddress");
    const statusEl = document.getElementById("futuresDepositAddressStatus");
    const confirmEl = document.getElementById("futuresDepositAddressConfirmation");

    if (addrEl) {
        addrEl.textContent = address || `USDT ${network} company address is not configured.`;
        addrEl.className = isConfigured
            ? "mt-2 block break-all font-mono text-sm font-bold text-white"
            : "mt-2 block break-all font-mono text-sm font-bold text-orange-200";
    }

    if (statusEl) {
        statusEl.textContent = isConfigured
            ? `${addressInfo.label || network} company address loaded from backend.`
            : `Configure USDT ${network} company address from Admin Settings.`;
        statusEl.className = isConfigured
            ? "mt-1 text-xs font-semibold text-emerald-300"
            : "mt-1 text-xs font-semibold text-orange-300";
    }

    if (confirmEl) confirmEl.value = address;
    txSetFuturesDepositCopyState(isConfigured);
}

async function txLoadFuturesDepositAddresses(silent = true) {
    if (TX_FUTURES_DEPOSIT_ADDRESS_STATE.loading || !isLoggedIn()) {
        txUpdateFuturesDepositAddressUI();
        return;
    }

    TX_FUTURES_DEPOSIT_ADDRESS_STATE.loading = true;
    TX_FUTURES_DEPOSIT_ADDRESS_STATE.error = "";
    txUpdateFuturesDepositAddressUI();

    try {
        const response = await txApiRequestWithTimeout("/deposit/crypto-addresses", {}, 5000);
        TX_FUTURES_DEPOSIT_ADDRESS_STATE.networks = response?.data?.networks || [];
        TX_FUTURES_DEPOSIT_ADDRESS_STATE.minAmount = Number(response?.data?.min_amount || 10);
        TX_FUTURES_DEPOSIT_ADDRESS_STATE.maxAmount = Number(response?.data?.max_amount || 1000000);
        const amountInput = document.getElementById("futuresDepositAmount");
        if (amountInput) {
            amountInput.min = String(TX_FUTURES_DEPOSIT_ADDRESS_STATE.minAmount || 0);
            amountInput.max = String(TX_FUTURES_DEPOSIT_ADDRESS_STATE.maxAmount || 1000000);
        }
        TX_FUTURES_DEPOSIT_ADDRESS_STATE.loaded = true;
    } catch (error) {
        TX_FUTURES_DEPOSIT_ADDRESS_STATE.error = txGetFuturesWalletError(error, "Unable to load company deposit address.");
        if (!silent) {
            txSetFuturesWalletModalMessage(TX_FUTURES_DEPOSIT_ADDRESS_STATE.error, "error");
        }
    } finally {
        TX_FUTURES_DEPOSIT_ADDRESS_STATE.loading = false;
        txUpdateFuturesDepositAddressUI();
    }
}

async function txCopyFuturesDepositAddress() {
    const addressInfo = txGetSelectedFuturesDepositAddressInfo();
    const address = String(addressInfo?.address || "").trim();

    if (!address || !addressInfo?.is_configured) {
        txSetFuturesWalletModalMessage("Company deposit address is not configured for this network.", "error");
        return;
    }

    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(address);
        } else {
            const temp = document.createElement("textarea");
            temp.value = address;
            temp.setAttribute("readonly", "readonly");
            temp.style.position = "fixed";
            temp.style.left = "-9999px";
            document.body.appendChild(temp);
            temp.select();
            document.execCommand("copy");
            document.body.removeChild(temp);
        }
        txSetFuturesWalletModalMessage("Company deposit address copied.", "success");
    } catch (error) {
        txSetFuturesWalletModalMessage("Unable to copy address. Please copy it manually.", "error");
    }
}

function txCopyFuturesInrUpiId() {
    const upiElement = document.getElementById("futuresInrUpiId");
    const upiText = upiElement ? upiElement.textContent.trim() : "traidiumx@upi";
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(upiText).then(() => {
            txSetFuturesWalletModalMessage(`UPI ID (${upiText}) copied to clipboard!`, "success");
        });
    } else {
        txSetFuturesWalletModalMessage(`UPI ID (${upiText}) copied!`, "success");
    }
}

function txSetWalletButtonLoading(button, loading) {
    if (!button) return;
    if (loading) {
        button.dataset.originalText = button.textContent || "Processing...";
        button.textContent = "Processing...";
        button.disabled = true;
        button.classList.add("opacity-60", "cursor-not-allowed");
        return;
    }
    button.textContent = button.dataset.originalText || button.textContent || "Submit";
    button.disabled = false;
    button.classList.remove("opacity-60", "cursor-not-allowed");
}

async function txHandleFuturesTransferSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form?.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const direction = String(formData.get("direction") || "main_to_trading");
    const amount = txToNumber(formData.get("amount"), 0);

    if (!amount || amount <= 0) {
        txSetFuturesWalletModalMessage("Please enter valid transfer amount.", "error");
        return;
    }

    try {
        txSetWalletButtonLoading(button, true);
        const activeSubId = localStorage.getItem("traidiumx_active_user_id");
        let response;
        if (activeSubId) {
            const mappedDirection = direction === "main_to_trading" ? "main_to_sub" : "sub_to_main";
            const currency = localStorage.getItem("tx_navbar_currency") || "USDT";
            response = await txApiRequestWithTimeout("/wallet/transfer-sub", {
                method: "POST",
                body: JSON.stringify({
                    amount: amount,
                    direction: mappedDirection,
                    sub_user_id: activeSubId,
                    currency: currency
                })
            }, 5000);
        } else {
            const currency = localStorage.getItem("tx_navbar_currency") || "USDT";
            response = await txApiRequestWithTimeout("/wallet/transfer", {
                method: "POST",
                body: JSON.stringify({ amount, direction, currency })
            }, 5000);
        }

        form.reset();
        if (response?.data?.wallet) {
            TX_BACKEND_FUTURES.wallet = response.data.wallet;
            TX_BACKEND_FUTURES.walletLoaded = true;
        }
        await txRefreshFuturesWalletAfterAction();
        txCloseFuturesWalletModal();
        showOrderMessage(response.message || "Wallet transfer completed successfully.", "success");
    } catch (error) {
        txSetFuturesWalletModalMessage(txGetFuturesWalletError(error, "Wallet transfer failed."), "error");
    } finally {
        txSetWalletButtonLoading(button, false);
    }
}

async function txHandleFuturesDepositSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form?.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const activeCurrency = String(form.dataset.activeCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const isINR = activeCurrency === "INR";
    const amount = txToNumber(formData.get("amount"), 0);

    if (!amount || amount <= 0) {
        txSetFuturesWalletModalMessage("Please enter valid deposit amount.", "error");
        return;
    }

    if (isINR) {
        const utr = String(formData.get("inr_utr_number") || "").trim();
        if (amount < 10) {
            txSetFuturesWalletModalMessage("Minimum deposit amount is ₹10 INR.", "error");
            return;
        }
        if (!utr) {
            txSetFuturesWalletModalMessage("Please enter 12-digit UTR or Transaction Ref ID.", "error");
            return;
        }
        try {
            txSetWalletButtonLoading(button, true);
            const response = await txApiRequestWithTimeout("/deposit/create", {
                method: "POST",
                body: JSON.stringify({
                    amount,
                    payment_method: "inr_deposit",
                    crypto_asset: "INR",
                    crypto_network: "UPI/BANK",
                    inr_utr_number: utr
                })
            }, 6000);

            form.reset();
            await txRefreshFuturesWalletAfterAction();
            txCloseFuturesWalletModal();
            showOrderMessage(response.message || "INR Deposit submitted. Main Wallet will be credited after verification.", "success");
        } catch (error) {
            if (txIsWithdrawalKycRequired(error)) {
                txClearFuturesWalletModalMessages();
                txCloseFuturesWalletModal();
                showOrderMessage(`KYC is compulsory at deposit time. Please complete KYC first. <a href="./kyc.html" class="underline font-black text-cyan-300">Click here to complete KYC</a>`, "error");
            } else {
                txSetFuturesWalletModalMessage(txGetFuturesWalletError(error, "Unable to create deposit."), "error");
            }
        } finally {
            txSetWalletButtonLoading(button, false);
        }
        return;
    }

    // USDT Deposit Flow
    const cryptoNetwork = String(formData.get("crypto_network") || "TRC20").trim().toUpperCase();
    const depositAddressConfirmation = String(document.getElementById("futuresDepositAddress")?.textContent || "").trim();
    if (amount < Number(TX_FUTURES_DEPOSIT_ADDRESS_STATE.minAmount || 10)) {
        txSetFuturesWalletModalMessage(`Minimum deposit amount is ${TX_FUTURES_DEPOSIT_ADDRESS_STATE.minAmount || 10} USDT.`, "error");
        return;
    }

    try {
        txSetWalletButtonLoading(button, true);
        const response = await txApiRequestWithTimeout("/deposit/create", {
            method: "POST",
            body: JSON.stringify({
                amount,
                payment_method: "crypto_deposit",
                crypto_asset: "USDT",
                crypto_network: cryptoNetwork,
                deposit_address_confirmation: depositAddressConfirmation
            })
        }, 6000);

        form.reset();
        await txRefreshFuturesWalletAfterAction();
        const depositStatus = String(response?.data?.deposit?.status || "").toLowerCase();
        const message = response.message || "Deposit submitted. Main Wallet will be credited only after company wallet/blockchain verification.";
        const tone = depositStatus === "completed" ? "success" : "info";
        txCloseFuturesWalletModal();
        showOrderMessage(message, tone);
    } catch (error) {
        if (txIsWithdrawalKycRequired(error)) {
            txClearFuturesWalletModalMessages();
            txCloseFuturesWalletModal();
            showOrderMessage(`KYC is compulsory at deposit time. Please complete KYC first. <a href="./kyc.html" class="underline font-black text-cyan-300">Click here to complete KYC</a>`, "error");
        } else {
            txSetFuturesWalletModalMessage(txGetFuturesWalletError(error, "Unable to create deposit."), "error");
        }
    } finally {
        txSetWalletButtonLoading(button, false);
    }
}

async function txHandleFuturesWithdrawSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form?.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const isINR = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase() === "INR";
    const amount = txToNumber(formData.get("amount"), 0);
    const cryptoNetwork = String(formData.get("crypto_network") || "TRC20").trim().toUpperCase();
    const withdrawalAddress = String(formData.get("withdrawal_address") || "").trim();
    const destinationTag = String(formData.get("destination_tag") || "").trim();

    if (!amount || amount <= 0) {
        txSetFuturesWalletModalMessage("Please enter valid withdrawal amount.", "error");
        return;
    }

    if (!withdrawalAddress) {
        txSetFuturesWalletModalMessage(isINR ? "Please enter Bank Account or UPI ID for withdrawal." : "Please enter withdrawal address.", "error");
        return;
    }

    try {
        txSetWalletButtonLoading(button, true);
        const response = await txApiRequestWithTimeout("/withdrawal/request", {
            method: "POST",
            body: JSON.stringify({
                amount,
                withdrawal_method: isINR ? "inr_withdrawal" : "crypto_withdrawal",
                crypto_asset: isINR ? "INR" : "USDT",
                crypto_network: isINR ? "UPI/BANK" : cryptoNetwork,
                withdrawal_address: withdrawalAddress,
                destination_tag: isINR ? "" : destinationTag
            })
        }, 6000);

        form.reset();
        await txRefreshFuturesWalletAfterAction();
        const message = response.message || (isINR ? "INR Withdrawal request created. Admin approval is required." : "Withdrawal request created. Admin approval and TX hash are required.");
        txCloseFuturesWalletModal();
        showOrderMessage(message, "success");
    } catch (error) {
        if (txIsWithdrawalKycRequired(error)) {
            txSetFuturesWalletModalMessage("KYC verification is required only before withdrawal. Redirecting to KYC...", "error");
            txRedirectToWithdrawalKyc();
        } else {
            txSetFuturesWalletModalMessage(txGetFuturesWalletError(error, "Unable to create withdrawal request."), "error");
        }
    } finally {
        txSetWalletButtonLoading(button, false);
    }
}

function initFuturesWalletQuickActions() {
    const nodes = txGetFuturesWalletModalNodes();
    if (!nodes.modal || nodes.modal.dataset.bound === "1") {
        return;
    }

    nodes.modal.dataset.bound = "1";
    nodes.closeBtn?.addEventListener("click", txCloseFuturesWalletModal);
    nodes.modal.addEventListener("click", (event) => {
        if (event.target === nodes.modal) txCloseFuturesWalletModal();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !nodes.modal.classList.contains("hidden")) {
            txCloseFuturesWalletModal();
        }
    });
    nodes.tabs.forEach((tab) => {
        tab.addEventListener("click", () => txSetFuturesWalletModalTab(tab.getAttribute("data-futures-wallet-tab")));
    });

    const btnUsdt = document.getElementById("futuresSelectUsdtBtn");
    const btnInr = document.getElementById("futuresSelectInrBtn");
    btnUsdt?.addEventListener("click", () => txUpdateFuturesDepositModalUIByCurrency("USDT"));
    btnInr?.addEventListener("click", () => txUpdateFuturesDepositModalUIByCurrency("INR"));

    const btnWithdrawUsdt = document.getElementById("txFuturesSelectWithdrawUsdtBtn");
    const btnWithdrawInr = document.getElementById("txFuturesSelectWithdrawInrBtn");
    btnWithdrawUsdt?.addEventListener("click", () => txUpdateFuturesWithdrawalModalUIByCurrency("USDT"));
    btnWithdrawInr?.addEventListener("click", () => txUpdateFuturesWithdrawalModalUIByCurrency("INR"));

    const copyInrBtn = document.getElementById("futuresCopyInrUpiBtn");
    copyInrBtn?.addEventListener("click", txCopyFuturesInrUpiId);

    const copyCryptoBtn = document.getElementById("futuresCopyCryptoAddressBtn");
    copyCryptoBtn?.addEventListener("click", txCopyFuturesDepositAddress);

    const cryptoNetSelect = document.getElementById("futuresCryptoNetwork");
    cryptoNetSelect?.addEventListener("change", txUpdateFuturesDepositAddressUI);

    txBindFuturesRealtimeConversionCalculator();

    nodes.transferForm?.addEventListener("submit", txHandleFuturesTransferSubmit);
    nodes.depositForm?.addEventListener("submit", txHandleFuturesDepositSubmit);
    nodes.withdrawForm?.addEventListener("submit", txHandleFuturesWithdrawSubmit);
}

/* Removed legacy duplicate updateWalletUI implementation. */

/* =========================
   DEMO ORDER LOGIC
========================= */

/* Removed legacy duplicate getOrderPrice implementation. */

function getQuantity() {
    return Number(elements.quantityInput?.value || 0);
}

function getLeverage() {
    const selectedLeverage = Number(elements.leverageSelect?.value || 1);
    const maxLeverage = getMaxLeverageForPair();

    if (!Number.isFinite(selectedLeverage) || selectedLeverage < 1) {
        return 1;
    }

    return Math.min(selectedLeverage, maxLeverage);
}

function calculateRequiredMargin(price, qty, leverage) {
    const notional = price * qty;
    const margin = notional / leverage;
    const fee = notional * 0.0004;

    return {
        notional,
        margin,
        fee,
        total: margin + fee
    };
}

/* Removed legacy duplicate placeOrder implementation. */

function createPositionFromOrder(order) {
    const positions = getPositions();

    positions.unshift({
        id: createId("POS"),
        orderId: order.id,
        symbol: order.symbol,
        pair: order.pair,
        side: order.side,
        qty: order.qty,
        entryPrice: order.price,
        leverage: order.leverage,
        margin: order.margin,
        fee: order.fee,
        openedAt: new Date().toISOString()
    });

    savePositions(positions);

    const history = getHistory();

    history.unshift({
        id: createId("HIS"),
        type: "OPEN",
        pair: order.pair,
        side: order.side,
        price: order.price,
        qty: order.qty,
        pnl: 0,
        fee: order.fee,
        createdAt: new Date().toISOString()
    });

    saveHistory(history);
}

/* Removed legacy duplicate processLimitOrders implementation. */

/* Removed legacy duplicate closePosition implementation. */

/* Removed legacy duplicate cancelOrder implementation. */

/* =========================
   BOTTOM TABLES
========================= */

/* Removed legacy duplicate renderBottomTable implementation. */

/* Removed legacy duplicate renderPositionsTable implementation. */

/* Removed legacy duplicate renderOpenOrdersTable implementation. */

/* Removed legacy duplicate renderOrderHistoryTable implementation. */

/* Removed legacy duplicate renderTradeHistoryTable implementation. */

/* =========================
   WORKING DRAWING TOOLS
========================= */

const drawingState = {
    activeTool: null,
    isDrawing: false,
    startX: 0,
    startY: 0,
    selectedDrawingId: null,
    lineWidth: 2,
    locked: false,
    hidden: false,
    activeTempElement: null
};

function hasDrawingOverlay() {
    return Boolean(elements.drawingOverlay);
}

function getOverlayPoint(event) {
    if (!elements.drawingOverlay) {
        return { x: 0, y: 0 };
    }

    const rect = elements.drawingOverlay.getBoundingClientRect();

    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function createSvgElement(tagName, attributes = {}) {
    const svgElement = document.createElementNS("http://www.w3.org/2000/svg", tagName);

    Object.keys(attributes).forEach((key) => {
        svgElement.setAttribute(key, attributes[key]);
    });

    return svgElement;
}

function getDrawingToolCategory(toolName) {
    const drawingTools = ["line", "levels", "brush", "text", "pattern", "measure"];

    return drawingTools.includes(toolName) ? "drawing" : "action";
}

function showDrawingMessage(message) {
    if (elements.terminalCandleInfo) {
        elements.terminalCandleInfo.textContent = message;
    }
}

function setActiveDrawingTool(toolName, button = null) {
    drawingState.activeTool = toolName;

    document.querySelectorAll("[data-drawing-tool]").forEach((item) => {
        item.classList.remove("active");
    });

    if (button) {
        button.classList.add("active");
    }

    if (!elements.drawingOverlay) {
        showDrawingMessage(`${toolName} selected, but drawing overlay missing in HTML.`);
        return;
    }

    const category = getDrawingToolCategory(toolName);

    if (category === "drawing" && !drawingState.locked) {
        elements.drawingOverlay.classList.add("active");
    } else {
        elements.drawingOverlay.classList.remove("active");
    }

    if (toolName === "cross") {
        elements.drawingOverlay.classList.remove("active");
        hideDrawingToolbar();
        showDrawingMessage("Crosshair selected.");
        return;
    }

    if (toolName === "zoom") {
        toggleChartFullscreen();
        return;
    }

    if (toolName === "magnet") {
        button?.classList.toggle("active");
        showDrawingMessage("Magnet mode toggled.");
        return;
    }

    if (toolName === "pencil-lock" || toolName === "lock") {
        toggleDrawingLock();
        return;
    }

    if (toolName === "hide") {
        toggleDrawingsVisibility();
        return;
    }

    if (toolName === "trash") {
        deleteAllDrawings();
        return;
    }

    if (toolName === "layers") {
        const count = elements.drawingOverlay.querySelectorAll("[data-drawing-id]").length;
        showDrawingMessage(`Layers opened. Total drawings: ${count}.`);
        showDrawingToolbar();
        return;
    }

    showDrawingMessage(`${toolName} tool selected. Click / drag on chart.`);
}

function showDrawingToolbar() {
    if (elements.drawingFloatingToolbar) {
        elements.drawingFloatingToolbar.classList.remove("hidden");
    }
}

function hideDrawingToolbar() {
    if (elements.drawingFloatingToolbar) {
        elements.drawingFloatingToolbar.classList.add("hidden");
    }
}

function clearTempDrawing() {
    if (!elements.drawingOverlay) {
        return;
    }

    elements.drawingOverlay.querySelectorAll("[data-temp='true']").forEach((item) => item.remove());
    drawingState.activeTempElement = null;
}

function markDrawingAsSelectable(element, drawingId) {
    element.setAttribute("data-drawing-id", drawingId);
    element.style.pointerEvents = "auto";

    element.addEventListener("click", (event) => {
        event.stopPropagation();
        selectDrawing(drawingId);
    });
}

function selectDrawing(drawingId) {
    if (!elements.drawingOverlay) {
        return;
    }

    drawingState.selectedDrawingId = drawingId;

    elements.drawingOverlay.querySelectorAll("[data-drawing-id]").forEach((item) => {
        item.classList.remove("selected");
        item.setAttribute("stroke-opacity", "0.95");
    });

    const selectedItems = elements.drawingOverlay.querySelectorAll(`[data-drawing-id="${drawingId}"]`);

    selectedItems.forEach((item) => {
        item.classList.add("selected");
        item.setAttribute("stroke-opacity", "1");
    });

    showDrawingToolbar();
    showDrawingMessage("Drawing selected.");
}

function createAnchorPoint(x, y, drawingId) {
    const point = createSvgElement("circle", {
        cx: x,
        cy: y,
        r: 5,
        class: "rt-drawing-point",
        "data-point-for": drawingId
    });

    point.style.pointerEvents = "auto";
    return point;
}

function startDrawing(event) {
    if (!elements.drawingOverlay || drawingState.locked) {
        return;
    }

    const toolName = drawingState.activeTool;

    if (!toolName || getDrawingToolCategory(toolName) !== "drawing") {
        return;
    }

    const point = getOverlayPoint(event);

    if (toolName === "text") {
        createTextDrawing(point.x, point.y);
        return;
    }

    if (toolName === "levels") {
        createHorizontalLevel(point.y);
        return;
    }

    if (toolName === "pattern") {
        createPatternDrawing(point.x, point.y);
        return;
    }

    drawingState.isDrawing = true;
    drawingState.startX = point.x;
    drawingState.startY = point.y;

    clearTempDrawing();

    if (toolName === "line" || toolName === "measure") {
        const line = createSvgElement("line", {
            x1: point.x,
            y1: point.y,
            x2: point.x,
            y2: point.y,
            class: toolName === "measure" ? "rt-drawing-measure-line" : "rt-drawing-line",
            "stroke-width": drawingState.lineWidth,
            "data-temp": "true"
        });

        elements.drawingOverlay.appendChild(line);
        drawingState.activeTempElement = line;
    }

    if (toolName === "brush") {
        const polyline = createSvgElement("polyline", {
            points: `${point.x},${point.y}`,
            class: "rt-drawing-brush",
            "stroke-width": drawingState.lineWidth,
            "data-temp": "true"
        });

        elements.drawingOverlay.appendChild(polyline);
        drawingState.activeTempElement = polyline;
    }
}

function moveDrawing(event) {
    if (!drawingState.isDrawing || !drawingState.activeTempElement) {
        return;
    }

    const point = getOverlayPoint(event);
    const toolName = drawingState.activeTool;

    if (toolName === "line" || toolName === "measure") {
        drawingState.activeTempElement.setAttribute("x2", point.x);
        drawingState.activeTempElement.setAttribute("y2", point.y);
    }

    if (toolName === "brush") {
        const oldPoints = drawingState.activeTempElement.getAttribute("points") || "";
        drawingState.activeTempElement.setAttribute("points", `${oldPoints} ${point.x},${point.y}`);
    }
}

function finishDrawing(event) {
    if (!drawingState.isDrawing || !drawingState.activeTempElement) {
        return;
    }

    drawingState.isDrawing = false;

    const point = getOverlayPoint(event);
    const toolName = drawingState.activeTool;
    const drawingId = createId("DRAW");

    const tempElement = drawingState.activeTempElement;
    tempElement.removeAttribute("data-temp");
    tempElement.setAttribute("stroke-width", drawingState.lineWidth);
    markDrawingAsSelectable(tempElement, drawingId);

    if (toolName === "line" || toolName === "measure") {
        tempElement.setAttribute("x2", point.x);
        tempElement.setAttribute("y2", point.y);

        const p1 = createAnchorPoint(drawingState.startX, drawingState.startY, drawingId);
        const p2 = createAnchorPoint(point.x, point.y, drawingId);

        elements.drawingOverlay.appendChild(p1);
        elements.drawingOverlay.appendChild(p2);

        if (toolName === "measure") {
            createMeasureLabel(drawingId, drawingState.startX, drawingState.startY, point.x, point.y);
        }
    }

    drawingState.activeTempElement = null;
    selectDrawing(drawingId);
}

function createHorizontalLevel(y) {
    if (!elements.drawingOverlay) {
        return;
    }

    const width = elements.drawingOverlay.clientWidth || 1000;
    const drawingId = createId("LEVEL");

    const line = createSvgElement("line", {
        x1: 0,
        y1: y,
        x2: width,
        y2: y,
        class: "rt-drawing-level",
        "stroke-width": drawingState.lineWidth
    });

    markDrawingAsSelectable(line, drawingId);
    elements.drawingOverlay.appendChild(line);
    selectDrawing(drawingId);
}

async function createTextDrawing(x, y) {
    if (!elements.drawingOverlay) {
        return;
    }

    const text = await txShowFuturesPrompt({
        title: "Add Chart Text",
        message: "Enter the note you want to place on the chart.",
        defaultValue: "Note",
        confirmText: "Add Text",
        cancelText: "Cancel"
    });

    if (!text) {
        return;
    }

    const drawingId = createId("TEXT");

    const textElement = createSvgElement("text", {
        x,
        y,
        class: "rt-drawing-text",
        "data-drawing-id": drawingId
    });

    textElement.textContent = text;
    markDrawingAsSelectable(textElement, drawingId);

    elements.drawingOverlay.appendChild(textElement);
    selectDrawing(drawingId);
}

function createPatternDrawing(x, y) {
    if (!elements.drawingOverlay) {
        return;
    }

    const drawingId = createId("PATTERN");
    const points = [
        `${x - 42},${y + 32}`,
        `${x - 12},${y - 35}`,
        `${x + 20},${y + 18}`,
        `${x + 48},${y - 22}`
    ].join(" ");

    const polyline = createSvgElement("polyline", {
        points,
        class: "rt-drawing-pattern",
        "stroke-width": drawingState.lineWidth,
        fill: "none"
    });

    markDrawingAsSelectable(polyline, drawingId);
    elements.drawingOverlay.appendChild(polyline);
    selectDrawing(drawingId);
}

function createMeasureLabel(drawingId, x1, y1, x2, y2) {
    const distance = Math.sqrt(((x2 - x1) ** 2) + ((y2 - y1) ** 2)).toFixed(0);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const label = createSvgElement("text", {
        x: midX + 8,
        y: midY - 8,
        class: "rt-drawing-label",
        "data-label-for": drawingId
    });

    label.textContent = `${distance}px`;
    elements.drawingOverlay.appendChild(label);
}

function updateSelectedLineWidth(width) {
    drawingState.lineWidth = width;

    if (elements.drawingWidthText) {
        elements.drawingWidthText.textContent = `${width}px`;
    }

    if (!drawingState.selectedDrawingId || !elements.drawingOverlay) {
        return;
    }

    const selectedItems = elements.drawingOverlay.querySelectorAll(`[data-drawing-id="${drawingState.selectedDrawingId}"]`);

    selectedItems.forEach((item) => {
        if (item.tagName.toLowerCase() !== "text") {
            item.setAttribute("stroke-width", width);
        }
    });
}

function deleteSelectedDrawing() {
    if (!elements.drawingOverlay || !drawingState.selectedDrawingId) {
        return;
    }

    const drawingId = drawingState.selectedDrawingId;

    elements.drawingOverlay.querySelectorAll(`[data-drawing-id="${drawingId}"]`).forEach((item) => item.remove());
    elements.drawingOverlay.querySelectorAll(`[data-point-for="${drawingId}"]`).forEach((item) => item.remove());
    elements.drawingOverlay.querySelectorAll(`[data-label-for="${drawingId}"]`).forEach((item) => item.remove());

    drawingState.selectedDrawingId = null;
    hideDrawingToolbar();
    showDrawingMessage("Selected drawing deleted.");
}

function deleteAllDrawings() {
    if (!elements.drawingOverlay) {
        return;
    }

    elements.drawingOverlay.innerHTML = "";
    drawingState.selectedDrawingId = null;
    hideDrawingToolbar();
    showDrawingMessage("All drawings deleted.");
}

function toggleDrawingLock() {
    drawingState.locked = !drawingState.locked;

    if (elements.drawingLockBtn) {
        elements.drawingLockBtn.classList.toggle("active", drawingState.locked);
    }

    if (elements.drawingOverlay) {
        elements.drawingOverlay.classList.toggle("active", !drawingState.locked && getDrawingToolCategory(drawingState.activeTool) === "drawing");
    }

    showDrawingMessage(drawingState.locked ? "Drawing tools locked." : "Drawing tools unlocked.");
}

function toggleDrawingsVisibility() {
    if (!elements.drawingOverlay) {
        return;
    }

    drawingState.hidden = !drawingState.hidden;
    elements.drawingOverlay.style.opacity = drawingState.hidden ? "0" : "1";
    showDrawingMessage(drawingState.hidden ? "Drawings hidden." : "Drawings visible.");
}

function toggleChartFullscreen() {
    if (!elements.chartContainer) {
        return;
    }

    elements.chartContainer.classList.toggle("rt-chart-fullscreen");

    if (state.chart && elements.chartContainer) {
        window.setTimeout(() => {
            state.chart.applyOptions({
                width: elements.chartContainer.clientWidth,
                height: elements.chartContainer.clientHeight
            });
        }, 50);
    }

    showDrawingMessage("Chart fullscreen toggled.");
}

function initChartActionButtons() {
    document.querySelectorAll("[data-chart-action]").forEach((button) => {
        button.addEventListener("click", () => {
            const action = button.getAttribute("data-chart-action");
            button.classList.toggle("active");

            if (action === "fullscreen") {
                toggleChartFullscreen();
                return;
            }

            if (action === "camera") {
                showDrawingMessage("Chart snapshot saved to clipboard.");
                return;
            }

            if (action === "indicators") {
                showDrawingMessage("Indicators clicked. SMA volume is already visible.");
                return;
            }

            if (action === "layout" && state.chart) {
                state.chart.timeScale().fitContent();
                showDrawingMessage("Chart layout reset.");
                return;
            }

            showDrawingMessage(`${action} clicked.`);
        });
    });
}

function initWorkingDrawingTools() {
    if (!hasDrawingOverlay()) {
        return;
    }

    document.querySelectorAll("[data-drawing-tool]").forEach((button) => {
        button.addEventListener("click", () => {
            const toolName = button.getAttribute("data-drawing-tool");
            setActiveDrawingTool(toolName, button);
        });
    });

    elements.drawingOverlay.addEventListener("mousedown", startDrawing);
    elements.drawingOverlay.addEventListener("mousemove", moveDrawing);
    elements.drawingOverlay.addEventListener("mouseup", finishDrawing);

    elements.drawingOverlay.addEventListener("mouseleave", () => {
        if (drawingState.isDrawing) {
            drawingState.isDrawing = false;
            clearTempDrawing();
        }
    });

    elements.drawingOverlay.addEventListener("click", (event) => {
        if (event.target === elements.drawingOverlay) {
            drawingState.selectedDrawingId = null;
        }
    });

    if (elements.drawingDeleteBtn) {
        elements.drawingDeleteBtn.addEventListener("click", deleteSelectedDrawing);
    }

    if (elements.drawingThinBtn) {
        elements.drawingThinBtn.addEventListener("click", () => updateSelectedLineWidth(1));
    }

    if (elements.drawingThickBtn) {
        elements.drawingThickBtn.addEventListener("click", () => updateSelectedLineWidth(3));
    }

    if (elements.drawingLockBtn) {
        elements.drawingLockBtn.addEventListener("click", toggleDrawingLock);
    }

    if (elements.drawingSettingsBtn) {
        elements.drawingSettingsBtn.addEventListener("click", () => {
            showDrawingMessage("Drawing settings clicked.");
        });
    }

    if (elements.drawingMoreBtn) {
        elements.drawingMoreBtn.addEventListener("click", () => {
            showDrawingMessage("More drawing options clicked.");
        });
    }

    if (elements.drawingColorBtn) {
        elements.drawingColorBtn.addEventListener("click", () => {
            showDrawingMessage("Blue drawing color selected.");
        });
    }
}


/* =========================
   UI EVENTS
========================= */

function updateSessionStatus() {
    if (elements.sessionStatus) {
        if (isLoggedIn()) {
            elements.sessionStatus.textContent = "Logged In";
            elements.sessionStatus.className = "text-emerald-400";
        } else {
            elements.sessionStatus.textContent = "Login Required";
            elements.sessionStatus.className = "text-orange-300";
        }
    }

    if (elements.placeOrderBtn) {
        if (isLoggedIn()) {
            const isSell = String(state.side || "BUY").toUpperCase() === "SELL";
            elements.placeOrderBtn.textContent = isSell ? "Sell / Short" : "Buy / Long";
            elements.placeOrderBtn.classList.toggle("sell-mode", isSell);
        } else {
            elements.placeOrderBtn.textContent = "Login to Trade";
            elements.placeOrderBtn.classList.remove("sell-mode");
        }
    }

    const loginHelp = document.getElementById("notLoggedInOrderHelp");
    if (loginHelp) {
        loginHelp.classList.toggle("hidden", isLoggedIn());
    }
}

function setOrderSide(side) {
    state.side = String(side || "BUY").toUpperCase();

    document.querySelectorAll(".rt-side-tabs button").forEach((button) => {
        const buttonSide = String(button.getAttribute("data-side") || "").toUpperCase();
        button.classList.toggle("active", buttonSide === state.side);
    });

    updateSessionStatus();
}

function setOrderType(type) {
    state.orderType = type;

    document.querySelectorAll("[data-order-type]").forEach((button) => {
        button.classList.toggle("active", button.getAttribute("data-order-type") === type);
    });

    const stopPriceWrap = document.getElementById("stopPriceWrap");

    if (elements.limitPriceWrap) {
        elements.limitPriceWrap.classList.toggle("hidden", !(type === "LIMIT" || type === "STOP_LIMIT"));
    }

    if (stopPriceWrap) {
        stopPriceWrap.classList.toggle("hidden", !(type === "STOP_LIMIT" || type === "STOP_MARKET"));
    }

    if (elements.terminalCandleInfo) {
        const labels = {
            MARKET: "Market order selected. It uses current live price.",
            LIMIT: "Limit order selected. Enter your limit price.",
            STOP_LIMIT: "Stop Limit selected. Enter trigger and limit price.",
            STOP_MARKET: "Stop Market selected. Enter stop trigger price."
        };

        elements.terminalCandleInfo.textContent = labels[type] || `${type} selected.`;
    }
    txUpdateEstimatedMargin();
}

function applyPercent(percent) {
    const wallet = getWallet();
    const price = state.currentPrice || getOrderPrice();
    const leverage = getLeverage();

    if (!price) {
        return;
    }

    const availableForMargin = wallet.available * (percent / 100);
    const qty = (availableForMargin * leverage) / price;
    const pair = getPair();
    const stepped = Math.max(pair.minQty, Math.floor(qty / pair.step) * pair.step);

    if (elements.quantityInput) {
        elements.quantityInput.value = stepped.toFixed(pair.step >= 1 ? 0 : 3);
    }
    txUpdateEstimatedMargin();
}
function changePair(symbol) {
    const cleanSymbol = normalizeSymbol(symbol);

    if (!isSupportedSymbol(cleanSymbol)) {
        showOrderMessage("This market is not supported in futures terminal yet.", "error");
        return;
    }

    state.currentSymbol = cleanSymbol;
    state.currentPrice = 0;
    state.previousPrice = 0;
    state.currentCandle = null;
    state.lastCandleUpdateAt = 0;
    txInitMockTrades(cleanSymbol);
    state.orderBook = { asks: [], bids: [] };

    saveSelectedSymbol(cleanSymbol);

    const pair = getPair(cleanSymbol);
    if (pair && elements.quantityInput) {
        elements.quantityInput.placeholder = `Min: ${pair.minQty}`;
        elements.quantityInput.min = pair.minQty;
        elements.quantityInput.step = pair.step;
    }

    syncLeverageOptions(cleanSymbol);
    updatePairHeader();
    loadTradingViewChart();

    if (elements.pairSelect) {
        elements.pairSelect.value = cleanSymbol;
    }

    const mobPairSel = document.getElementById("pairSelectMobile");
    if (mobPairSel) {
        mobPairSel.value = cleanSymbol;
    }

    if (elements.limitPriceInput) {
        elements.limitPriceInput.value = "";
    }

    stopMarketSocket();
    loadTickerMetrics();
    startMarketSocket();
    loadInitialCandles();
    renderOrderBook();
    renderRecentTrades();
    renderBottomTable();
    txRecordRecentSymbol(cleanSymbol);
}


function changeInterval(interval) {
    state.interval = interval;
    state.currentCandle = null;
    state.lastCandleUpdateAt = 0;

    document.querySelectorAll(".rt-interval").forEach((button) => {
        button.classList.toggle("active", button.getAttribute("data-interval") === interval);
    });

    updatePairHeader();
    loadTradingViewChart();
    stopMarketSocket();
    loadInitialCandles();
    startMarketSocket();
}

/* Removed legacy duplicate addDemoBalance implementation. */

/* Removed legacy duplicate resetDemo implementation. */

function updateFundingCountdown() {
    if (!elements.fundingRate) {
        return;
    }

    window.setInterval(() => {
        const now = new Date();
        const next = new Date(now);

        const utcHour = now.getUTCHours();
        const nextFundingHour = Math.ceil((utcHour + 1) / 8) * 8;

        next.setUTCHours(nextFundingHour % 24, 0, 0, 0);

        if (next <= now) {
            next.setUTCDate(next.getUTCDate() + 1);
        }

        const diff = Math.max(0, next - now);
        const hours = String(Math.floor(diff / 3600000)).padStart(2, "0");
        const minutes = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
        const seconds = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");

        elements.fundingRate.textContent = `-- / ${hours}:${minutes}:${seconds}`;
    }, 1000);
}

function txUpdateEstimatedMargin() {
    if (!elements.walletEstMargin) return;

    // Get order type (MARKET, LIMIT, STOP_LIMIT)
    const activeTab = document.querySelector(".rt-order-type-tabs button.active");
    const orderType = activeTab ? activeTab.getAttribute("data-order-type") : "MARKET";

    // Get price
    let price = 0;
    if (orderType === "MARKET") {
        price = Number(state.currentPrice || 0);
    } else {
        price = Number(elements.limitPriceInput ? elements.limitPriceInput.value : 0);
        if (price <= 0) {
            price = Number(state.currentPrice || 0);
        }
    }

    // Get quantity
    const quantity = Number(elements.quantityInput ? elements.quantityInput.value : 0);

    // Get leverage
    const leverage = Number(elements.leverageSelect ? elements.leverageSelect.value : 10);

    // Calculate estimated margin
    let estMargin = 0;
    if (price > 0 && quantity > 0 && leverage > 0) {
        estMargin = (quantity * price) / leverage;
    }

    // Update the UI
    elements.walletEstMargin.textContent = `${formatNumber(estMargin, 2)} USDT`;
}

function initMobileFuturesDrawer() {
    const mobileBuyBtn = document.getElementById("futuresMobileBuyBtn");
    const mobileSellBtn = document.getElementById("futuresMobileSellBtn");
    const mobileDrawer = document.getElementById("futuresMobileOrderDrawer");
    const mobileDrawerClose = document.getElementById("futuresMobileDrawerClose");
    const drawerTitle = document.getElementById("futuresMobileDrawerTitle");
    const drawerSlot = document.getElementById("futuresMobileOrderFormSlot");
    const orderPanelCard = document.querySelector(".rt-order-panel-card");

    if (!mobileBuyBtn || !mobileSellBtn || !mobileDrawer || !drawerSlot || !orderPanelCard) return;

    function openMobileDrawer(side) {
        if (orderPanelCard.parentElement !== drawerSlot) {
            drawerSlot.appendChild(orderPanelCard);
        }

        setOrderSide(side);

        const cleanSym = state.currentSymbol || "BTCUSDT";
        const coinName = cleanSym.replace("USDT", "").replace("USD", "");
        if (drawerTitle) {
            drawerTitle.textContent = side === "BUY" ? `Buy / Long ${coinName}` : `Sell / Short ${coinName}`;
        }

        mobileDrawer.classList.remove("hidden");
        mobileDrawer.classList.add("flex");
        document.body.style.overflow = "hidden";
    }

    function closeMobileDrawer() {
        mobileDrawer.classList.add("hidden");
        mobileDrawer.classList.remove("flex");
        document.body.style.overflow = "";
    }

    mobileBuyBtn.addEventListener("click", () => openMobileDrawer("BUY"));
    mobileSellBtn.addEventListener("click", () => openMobileDrawer("SELL"));

    if (mobileDrawerClose) {
        mobileDrawerClose.addEventListener("click", closeMobileDrawer);
    }

    mobileDrawer.addEventListener("click", (e) => {
        if (e.target === mobileDrawer) {
            closeMobileDrawer();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 1024) {
            const rightPanel = document.querySelector(".rt-right-panel");
            if (rightPanel && orderPanelCard.parentElement !== rightPanel) {
                rightPanel.appendChild(orderPanelCard);
            }
            closeMobileDrawer();
        }
    });
}

function initMobileSubNav() {
    const subNavButtons = document.querySelectorAll("[data-mobile-tab]");
    if (!subNavButtons.length) return;

    subNavButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const tabKey = button.getAttribute("data-mobile-tab");

            subNavButtons.forEach((btn) => {
                const isActive = btn === button;
                btn.classList.toggle("active", isActive);
                btn.classList.toggle("text-white", isActive);
                btn.classList.toggle("text-slate-400", !isActive);
                const indicator = btn.querySelector(".tab-indicator");
                if (indicator) indicator.classList.toggle("hidden", !isActive);
            });

            const leftTerminal = document.querySelector(".rt-left-terminal");
            const chartCard = document.querySelector(".rt-chart-card");
            const positionsWrapper = document.querySelector(".rt-positions-wrapper-col");

            // Strictly apply visibility toggles ONLY on mobile viewport (<= 1024px)
            if (window.innerWidth <= 1024) {
                if (leftTerminal) leftTerminal.style.display = "block";
                if (chartCard) chartCard.style.display = "block";
                if (positionsWrapper) positionsWrapper.style.display = "block";
            } else {
                // On Desktop (> 1024px), NEVER hide chart or positions wrapper!
                if (leftTerminal) leftTerminal.style.display = "";
                if (chartCard) chartCard.style.display = "";
                if (positionsWrapper) positionsWrapper.style.display = "";
            }

            const tabMap = {
                "positions": "positions",
                "orders": "openOrders",
                "openOrders": "openOrders",
                "history": "orderHistory",
                "orderHistory": "orderHistory",
                "tradeHistory": "tradeHistory",
                "transactionHistory": "transactionHistory"
            };
            const targetTerminalTab = tabMap[tabKey] || "positions";
            state.activeBottomTab = targetTerminalTab;

            document.querySelectorAll("[data-terminal-tab]").forEach((tab) => {
                tab.classList.toggle("active", tab.getAttribute("data-terminal-tab") === targetTerminalTab);
            });

            renderBottomTable();
        });
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 1024) {
            const leftTerminal = document.querySelector(".rt-left-terminal");
            const chartCard = document.querySelector(".rt-chart-card");
            const positionsWrapper = document.querySelector(".rt-positions-wrapper-col");
            if (leftTerminal) leftTerminal.style.display = "";
            if (chartCard) chartCard.style.display = "";
            if (positionsWrapper) positionsWrapper.style.display = "";
        }
    });
}

function initEvents() {
    initMobileFuturesDrawer();
    initMobileSubNav();
    if (elements.quantityInput) {
        elements.quantityInput.addEventListener("input", txUpdateEstimatedMargin);
        elements.quantityInput.addEventListener("change", txUpdateEstimatedMargin);
    }
    if (elements.limitPriceInput) {
        elements.limitPriceInput.addEventListener("input", txUpdateEstimatedMargin);
        elements.limitPriceInput.addEventListener("change", txUpdateEstimatedMargin);
    }
    if (elements.leverageSelect) {
        elements.leverageSelect.addEventListener("change", txUpdateEstimatedMargin);
    }
    // Custom Margin Mode Dropdown Handler
    const marginModeBtn = document.getElementById("marginModeBtn");
    const marginModeMenu = document.getElementById("marginModeMenu");
    const marginModeBtnText = document.getElementById("marginModeBtnText");

    if (marginModeBtn && marginModeMenu && marginModeBtnText) {
        marginModeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            marginModeMenu.classList.toggle("hidden");
        });

        document.addEventListener("click", () => {
            marginModeMenu.classList.add("hidden");
        });

        document.querySelectorAll(".margin-mode-option").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const val = btn.getAttribute("data-value");
                state.marginMode = val;

                if (val === "isolated") {
                    marginModeBtnText.textContent = "Isolated Margin";
                    marginModeBtn.style.setProperty("color", "#22d3ee", "important");
                    marginModeBtn.style.setProperty("border-color", "rgba(34, 211, 238, 0.2)", "important");
                } else {
                    marginModeBtnText.textContent = "Cross Margin";
                    marginModeBtn.style.setProperty("color", "#fbbf24", "important");
                    marginModeBtn.style.setProperty("border-color", "rgba(251, 191, 36, 0.2)", "important");
                }

                marginModeMenu.classList.add("hidden");
                txUpdateEstimatedMargin();
            });
        });
    }

    if (elements.pairSelect) {
        elements.pairSelect.addEventListener("change", () => {
            changePair(elements.pairSelect.value);
        });
    }

    const pairSelectMobile = document.getElementById("pairSelectMobile");
    if (pairSelectMobile) {
        pairSelectMobile.addEventListener("change", () => {
            changePair(pairSelectMobile.value);
        });
    }

    // Initialize Binance-Style Market Selector Modal / Dropdown
    if (typeof txInitMarketSelector === "function") {
        txInitMarketSelector();
    }

    const walletQuickBtn = document.getElementById("futuresMobileWalletQuickBtn");
    if (walletQuickBtn) {
        walletQuickBtn.addEventListener("click", () => {
            goToFuturesWalletAction("transfer");
        });
    }

    document.getElementById("mobileWalletTransferBtn")?.addEventListener("click", () => goToFuturesWalletAction("transfer"));
    document.getElementById("mobileWalletDepositBtn")?.addEventListener("click", () => goToFuturesWalletAction("deposit"));
    document.getElementById("mobileWalletWithdrawBtn")?.addEventListener("click", () => goToFuturesWalletAction("withdraw"));

    // Bind USD / INR Currency Toggle Pill inside Mobile Quick Bar
    const mobileCurrToggleContainer = document.getElementById("mobileQuickBarCurrencyToggle");
    if (mobileCurrToggleContainer) {
        const currBtns = mobileCurrToggleContainer.querySelectorAll("[data-currency-switch]");

        const syncActiveMobileCurrencyUI = () => {
            const activeCurr = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
            currBtns.forEach((btn) => {
                const btnCurr = (btn.getAttribute("data-currency-switch") || "").toUpperCase();
                const isActive = btnCurr === activeCurr;
                btn.classList.toggle("text-cyan-300", isActive);
                btn.classList.toggle("bg-cyan-500/20", isActive);
                btn.classList.toggle("border", isActive);
                btn.classList.toggle("border-cyan-400/40", isActive);
                btn.classList.toggle("text-slate-400", !isActive);
            });
        };

        currBtns.forEach((btn) => {
            btn.addEventListener("click", () => {
                const targetCurr = (btn.getAttribute("data-currency-switch") || "USDT").toUpperCase();
                localStorage.setItem("tx_navbar_currency", targetCurr);
                syncActiveMobileCurrencyUI();
                window.dispatchEvent(new CustomEvent("traidiumx:currency-change", { detail: { currency: targetCurr } }));
                if (typeof txUpdateFuturesWalletModalBalances === "function") {
                    txUpdateFuturesWalletModalBalances();
                }
                if (typeof renderPositionsTable === "function") {
                    renderPositionsTable();
                }
            });
        });

        syncActiveMobileCurrencyUI();
        window.addEventListener("traidiumx:currency-change", syncActiveMobileCurrencyUI);
        window.addEventListener("storage", (e) => {
            if (e.key === "tx_navbar_currency") {
                syncActiveMobileCurrencyUI();
            }
        });
    }

    document.querySelectorAll(".rt-interval").forEach((button) => {
        button.addEventListener("click", () => {
            changeInterval(button.getAttribute("data-interval"));
        });
    });

    document.querySelectorAll("[data-order-type]").forEach((button) => {
        button.addEventListener("click", () => {
            setOrderType(button.getAttribute("data-order-type"));
        });
    });

    document.querySelectorAll("[data-percent]").forEach((button) => {
        button.addEventListener("click", () => {
            applyPercent(Number(button.getAttribute("data-percent")));
        });
    });

    document.querySelectorAll("[data-terminal-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            state.activeBottomTab = button.getAttribute("data-terminal-tab");

            document.querySelectorAll("[data-terminal-tab]").forEach((tab) => {
                tab.classList.toggle("active", tab === button);
            });

            renderBottomTable();
        });
    });

    if (elements.sideBuyBtn) {
        elements.sideBuyBtn.addEventListener("click", () => setOrderSide("BUY"));
    }

    if (elements.sideSellBtn) {
        elements.sideSellBtn.addEventListener("click", () => setOrderSide("SELL"));
    }

    if (elements.placeOrderBtn) {
        elements.placeOrderBtn.addEventListener("click", placeOrder);
    }

    if (elements.addDemoBalanceBtn) {
        elements.addDemoBalanceBtn.addEventListener("click", addDemoBalance);
    }

    if (elements.resetDemoBtn) {
        elements.resetDemoBtn.addEventListener("click", resetDemo);
    }

    if (elements.futuresDepositBtn) {
        elements.futuresDepositBtn.addEventListener("click", () => goToFuturesWalletAction("deposit"));
    }

    if (elements.futuresWithdrawBtn) {
        elements.futuresWithdrawBtn.addEventListener("click", () => goToFuturesWalletAction("withdraw"));
    }

    if (elements.futuresTransferBtn) {
        elements.futuresTransferBtn.addEventListener("click", () => goToFuturesWalletAction("transfer"));
    }

    // Global Keyboard Shortcuts Integration
    document.addEventListener("keydown", (event) => {
        const shortcutsEnabled = localStorage.getItem("traidiumx_shortcuts") !== "false";
        if (!shortcutsEnabled) return;

        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
            return;
        }

        if (event.altKey && (event.key === "b" || event.key === "B")) {
            event.preventDefault();
            if (typeof setOrderSide === "function") {
                setOrderSide("BUY");
            }
            const inputEl = elements.limitPriceInput || elements.quantityInput;
            if (inputEl) {
                inputEl.focus();
                inputEl.select();
            }
        } else if (event.altKey && (event.key === "s" || event.key === "S")) {
            event.preventDefault();
            if (typeof setOrderSide === "function") {
                setOrderSide("SELL");
            }
            const inputEl = elements.limitPriceInput || elements.quantityInput;
            if (inputEl) {
                inputEl.focus();
                inputEl.select();
            }
        } else if (event.altKey && (event.key === "c" || event.key === "C")) {
            event.preventDefault();
            const openOrders = TX_BACKEND_FUTURES.openOrders || [];
            if (openOrders.length > 0) {
                const lastOrder = openOrders[openOrders.length - 1];
                const orderId = txGetId(lastOrder);
                if (orderId && typeof cancelOrder === "function") {
                    cancelOrder(orderId);
                }
            }
        } else if (event.altKey && (event.key === "m" || event.key === "M")) {
            event.preventDefault();
            const nextType = state.orderType === "LIMIT" ? "MARKET" : "LIMIT";
            if (typeof setOrderType === "function") {
                setOrderType(nextType);
            }
        }
    });

    initFuturesWalletQuickActions();
}


/* =========================
   ADVANCED FUTURES ICONS / DROPDOWNS
========================= */

const advancedUiState = {
    activeBookView: "both",
    selectedDrawingColor: "#2563eb",
    indicatorState: {
        sma: false,
        ema: false,
        vwap: false,
        volume: true
    }
};

function getEl(id) {
    return document.getElementById(id);
}

function getChartDropdown() {
    return getEl("chartToolDropdown");
}

function getActionDropdown() {
    return getEl("chartActionDropdown");
}

function getChartArea() {
    return document.querySelector(".rt-chart-area");
}

function closeAdvancedDropdowns(exceptId = null) {
    [getChartDropdown(), getActionDropdown()].forEach((dropdown) => {
        if (!dropdown) {
            return;
        }

        if (exceptId && dropdown.id === exceptId) {
            return;
        }

        dropdown.classList.add("hidden");
        dropdown.innerHTML = "";
    });
}

function positionDropdownNearButton(dropdown, button) {
    const chartArea = getChartArea();

    if (!dropdown || !button || !chartArea) {
        return;
    }

    const buttonRect = button.getBoundingClientRect();
    const areaRect = chartArea.getBoundingClientRect();

    let left = buttonRect.right - areaRect.left + 10;
    let top = buttonRect.top - areaRect.top;

    if (button.closest(".rt-chart-tabs") || button.closest(".rt-chart-header")) {
        left = buttonRect.left - areaRect.left;
        top = buttonRect.bottom - areaRect.top + 8;
    }

    if (left + 280 > areaRect.width) {
        left = Math.max(12, areaRect.width - 292);
    }

    if (top + 340 > areaRect.height) {
        top = Math.max(12, areaRect.height - 352);
    }

    dropdown.style.left = `${Math.max(12, left)}px`;
    dropdown.style.top = `${Math.max(12, top)}px`;
}

function renderDropdown(dropdown, title, items, button) {
    if (!dropdown) {
        return;
    }

    closeAdvancedDropdowns(dropdown.id);

    dropdown.innerHTML = `
        <div class="rt-dropdown-title">${title}</div>
        <div class="rt-dropdown-list">
            ${items.map((item) => `
                <button type="button" class="rt-dropdown-item" data-dropdown-action="${item.action}">
                    <span class="rt-dropdown-icon">${item.icon || "•"}</span>
                    <span>
                        <strong>${item.label}</strong>
                        <small>${item.description || ""}</small>
                    </span>
                    ${item.shortcut ? `<kbd>${item.shortcut}</kbd>` : ""}
                </button>
            `).join("")}
        </div>
    `;

    dropdown.classList.remove("hidden");
    positionDropdownNearButton(dropdown, button);

    dropdown.querySelectorAll("[data-dropdown-action]").forEach((itemButton) => {
        itemButton.addEventListener("click", () => {
            const action = itemButton.getAttribute("data-dropdown-action");
            const selectedItem = items.find((item) => item.action === action);

            if (selectedItem && typeof selectedItem.handler === "function") {
                selectedItem.handler();
            }

            if (!selectedItem || selectedItem.keepOpen !== true) {
                dropdown.classList.add("hidden");
            }
        });
    });
}

function setDrawingToolWithMessage(toolName, message, button = null) {
    setActiveDrawingTool(toolName, button);

    if (elements.terminalCandleInfo) {
        elements.terminalCandleInfo.textContent = message || `${toolName} selected.`;
    }
}

function setDrawingWidth(width) {
    updateSelectedLineWidth(width);

    if (elements.terminalCandleInfo) {
        elements.terminalCandleInfo.textContent = `Drawing stroke width set to ${width}px.`;
    }
}

function setDrawingColor(color) {
    advancedUiState.selectedDrawingColor = color;

    if (elements.drawingOverlay) {
        elements.drawingOverlay.style.setProperty("--drawing-color", color);
    }

    if (elements.terminalCandleInfo) {
        elements.terminalCandleInfo.textContent = "Drawing color updated.";
    }
}

function getDrawingMenuItems(toolName, button) {
    const commonLineItems = [
        {
            action: "trend-line",
            icon: "╱",
            label: "Trend Line",
            description: "Drag on chart to draw a line",
            shortcut: "Alt+T",
            handler: () => setDrawingToolWithMessage("line", "Trend Line selected. Drag on chart.", button)
        },
        {
            action: "ray-line",
            icon: "↗",
            label: "Ray / Extended Line",
            description: "Demo ray tool using line drawing",
            handler: () => setDrawingToolWithMessage("line", "Ray selected. Drag to draw extended line style.", button)
        },
        {
            action: "horizontal-level",
            icon: "━",
            label: "Horizontal Line",
            description: "Click once on chart to create level",
            handler: () => setDrawingToolWithMessage("levels", "Horizontal level selected. Click on chart.", button)
        },
        {
            action: "measure",
            icon: "↔",
            label: "Measure",
            description: "Drag to measure distance",
            handler: () => setDrawingToolWithMessage("measure", "Measure selected. Drag on chart.", button)
        }
    ];

    const menus = {
        cross: [
            {
                action: "crosshair",
                icon: "+",
                label: "Crosshair",
                description: "Default chart cursor",
                handler: () => setDrawingToolWithMessage("cross", "Crosshair selected.", button)
            },
            {
                action: "select",
                icon: "↖",
                label: "Select / Move",
                description: "Select existing drawing objects",
                handler: () => setDrawingToolWithMessage("cross", "Select mode enabled. Click a drawing to select.", button)
            }
        ],
        line: commonLineItems,
        levels: [
            {
                action: "horizontal-level",
                icon: "━",
                label: "Horizontal Level",
                description: "Click to place price level",
                handler: () => setDrawingToolWithMessage("levels", "Horizontal level selected. Click on chart.", button)
            },
            {
                action: "trend-line",
                icon: "╱",
                label: "Trend Line",
                description: "Drag to create a trend line",
                handler: () => setDrawingToolWithMessage("line", "Trend Line selected. Drag on chart.", button)
            },
            {
                action: "clear-levels",
                icon: "×",
                label: "Clear All Levels",
                description: "Delete all chart drawings",
                handler: deleteAllDrawings
            }
        ],
        brush: [
            {
                action: "brush-1",
                icon: "⌁",
                label: "Brush Thin",
                description: "Freehand drawing, 1px",
                handler: () => { setDrawingWidth(1); setDrawingToolWithMessage("brush", "Thin brush selected. Draw on chart.", button); }
            },
            {
                action: "brush-2",
                icon: "⌁",
                label: "Brush Regular",
                description: "Freehand drawing, 2px",
                handler: () => { setDrawingWidth(2); setDrawingToolWithMessage("brush", "Regular brush selected. Draw on chart.", button); }
            },
            {
                action: "brush-3",
                icon: "⌁",
                label: "Brush Thick",
                description: "Freehand drawing, 3px",
                handler: () => { setDrawingWidth(3); setDrawingToolWithMessage("brush", "Thick brush selected. Draw on chart.", button); }
            }
        ],
        text: [
            {
                action: "note-text",
                icon: "T",
                label: "Text Note",
                description: "Click on chart and type note",
                handler: () => setDrawingToolWithMessage("text", "Text selected. Click chart to add note.", button)
            },
            {
                action: "buy-label",
                icon: "B",
                label: "Buy Label",
                description: "Adds a text note on click",
                handler: () => setDrawingToolWithMessage("text", "Buy label tool selected. Click chart.", button)
            },
            {
                action: "sell-label",
                icon: "S",
                label: "Sell Label",
                description: "Adds a text note on click",
                handler: () => setDrawingToolWithMessage("text", "Sell label tool selected. Click chart.", button)
            }
        ],
        pattern: [
            {
                action: "abcd",
                icon: "◇",
                label: "ABCD Pattern",
                description: "Click to place demo pattern",
                handler: () => setDrawingToolWithMessage("pattern", "ABCD Pattern selected. Click on chart.", button)
            },
            {
                action: "triangle",
                icon: "△",
                label: "Triangle Pattern",
                description: "Demo pattern object",
                handler: () => setDrawingToolWithMessage("pattern", "Triangle pattern selected. Click on chart.", button)
            },
            {
                action: "channel",
                icon: "▱",
                label: "Parallel Channel",
                description: "Demo channel object",
                handler: () => setDrawingToolWithMessage("pattern", "Channel pattern selected. Click on chart.", button)
            }
        ],
        measure: [
            {
                action: "measure-distance",
                icon: "↔",
                label: "Price / Time Measurement",
                description: "Drag on chart to measure pixels",
                handler: () => setDrawingToolWithMessage("measure", "Measure selected. Drag on chart.", button)
            },
            {
                action: "ruler",
                icon: "▭",
                label: "Ruler",
                description: "Same measurement tool",
                handler: () => setDrawingToolWithMessage("measure", "Ruler selected. Drag on chart.", button)
            }
        ],
        zoom: [
            {
                action: "zoom-in",
                icon: "+",
                label: "Zoom In",
                description: "Zoom chart time scale in",
                handler: () => {
                    if (state.chart) state.chart.timeScale().scrollToRealTime();
                    showDrawingMessage("Chart moved to real time.");
                }
            },
            {
                action: "fit-content",
                icon: "⛶",
                label: "Fit Content",
                description: "Reset chart view",
                handler: () => {
                    if (state.chart) state.chart.timeScale().fitContent();
                    showDrawingMessage("Chart view fitted.");
                }
            },
            {
                action: "fullscreen",
                icon: "⛶",
                label: "Fullscreen",
                description: "Toggle expanded chart",
                handler: toggleChartFullscreen
            }
        ]
    };

    if (toolName === "magnet") {
        return [{ action: "magnet-toggle", icon: "🧲", label: "Toggle Magnet", description: "Snap drawings mode demo", handler: () => setActiveDrawingTool("magnet", button) }];
    }

    if (toolName === "pencil-lock" || toolName === "lock") {
        return [{ action: "lock-toggle", icon: "🔒", label: "Lock / Unlock Drawings", description: "Disable or enable drawing changes", handler: toggleDrawingLock }];
    }

    if (toolName === "hide") {
        return [{ action: "hide-toggle", icon: "👁", label: "Hide / Show Drawings", description: "Toggle drawing visibility", handler: toggleDrawingsVisibility }];
    }

    if (toolName === "trash") {
        return [
            { action: "delete-selected", icon: "⌫", label: "Delete Selected", description: "Remove selected drawing", handler: deleteSelectedDrawing },
            { action: "delete-all", icon: "🗑", label: "Delete All Drawings", description: "Clear chart drawings", handler: deleteAllDrawings }
        ];
    }

    if (toolName === "layers") {
        return [{ action: "layers-open", icon: "☰", label: "Open Object Tree", description: "View all drawings", handler: openLayersPanel }];
    }

    return menus[toolName] || [{ action: toolName, icon: "•", label: toolName, description: "Tool selected", handler: () => setDrawingToolWithMessage(toolName, `${toolName} selected.`, button) }];
}

function openDrawingToolDropdown(button, toolName) {
    const dropdown = getChartDropdown();
    const titleMap = {
        cross: "Cursor Tools",
        line: "Trend Line Tools",
        levels: "Line / Level Tools",
        brush: "Brush Tools",
        text: "Text Tools",
        pattern: "Pattern Tools",
        measure: "Measurement Tools",
        zoom: "Zoom Tools",
        magnet: "Magnet Tool",
        "pencil-lock": "Drawing Lock",
        lock: "Lock Drawing Tools",
        hide: "Visibility",
        trash: "Delete Tools",
        layers: "Object Tree"
    };

    renderDropdown(dropdown, titleMap[toolName] || "Drawing Tool", getDrawingMenuItems(toolName, button), button);
}

function showChartModal(title, bodyHtml) {
    const backdrop = getEl("chartModalBackdrop");
    const modalTitle = getEl("chartModalTitle");
    const modalBody = getEl("chartModalBody");

    if (!backdrop || !modalTitle || !modalBody) {
        return;
    }

    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    backdrop.classList.remove("hidden");
}

function closeChartModal() {
    const backdrop = getEl("chartModalBackdrop");

    if (backdrop) {
        backdrop.classList.add("hidden");
    }
}

function toggleIndicator(indicatorKey) {
    advancedUiState.indicatorState[indicatorKey] = !advancedUiState.indicatorState[indicatorKey];

    const enabled = advancedUiState.indicatorState[indicatorKey];
    const label = indicatorKey.toUpperCase();

    showDrawingMessage(`${label} indicator ${enabled ? "enabled" : "disabled"}.`);
}

function downloadChartSnapshot() {
    const chartCanvas = elements.chartContainer ? elements.chartContainer.querySelector("canvas") : null;

    if (!chartCanvas) {
        showDrawingMessage("Snapshot unavailable: chart canvas not found yet.");
        return;
    }

    try {
        const link = document.createElement("a");
        link.download = `${state.currentSymbol}-chart.png`;
        link.href = chartCanvas.toDataURL("image/png");
        link.click();
        showDrawingMessage("Chart snapshot downloaded.");
    } catch (error) {
        console.warn(error);
        showDrawingMessage("Snapshot blocked by browser canvas policy.");
    }
}

function getChartActionMenuItems(action) {
    if (action === "layout") {
        return [
            { action: "fit", icon: "⛶", label: "Fit Content", description: "Reset chart visible range", handler: () => { if (state.chart) state.chart.timeScale().fitContent(); showDrawingMessage("Chart content fitted."); } },
            { action: "realtime", icon: "→", label: "Go to Real Time", description: "Scroll chart to live candle", handler: () => { if (state.chart) state.chart.timeScale().scrollToRealTime(); showDrawingMessage("Chart moved to real time."); } },
            { action: "compact", icon: "▦", label: "Compact Layout", description: "Terminal layout kept in 3 columns", handler: () => showDrawingMessage("Compact layout active.") }
        ];
    }

    if (action === "indicators") {
        return [
            { action: "sma", icon: "S", label: "SMA 20", description: "Toggle demo SMA indicator", keepOpen: true, handler: () => toggleIndicator("sma") },
            { action: "ema", icon: "E", label: "EMA 50", description: "Toggle demo EMA indicator", keepOpen: true, handler: () => toggleIndicator("ema") },
            { action: "vwap", icon: "V", label: "VWAP", description: "Toggle demo VWAP indicator", keepOpen: true, handler: () => toggleIndicator("vwap") },
            { action: "volume", icon: "Vol", label: "Volume", description: "Volume histogram already visible", keepOpen: true, handler: () => toggleIndicator("volume") }
        ];
    }

    if (action === "formula") {
        return [
            { action: "open-formula", icon: "ƒx", label: "Open Formula Editor", description: "Create custom indicator formula UI", handler: () => showFormulaModal() },
            { action: "price-change", icon: "%", label: "Price Change %", description: "Demo formula preset", handler: () => showDrawingMessage("Formula preset selected: Price Change %.") },
            { action: "volatility", icon: "σ", label: "Volatility", description: "Demo formula preset", handler: () => showDrawingMessage("Formula preset selected: Volatility.") }
        ];
    }

    return [];
}

function openChartActionDropdown(button, action) {
    closeAdvancedDropdowns();

    if (action === "fullscreen") {
        toggleChartFullscreen();
        return;
    }

    if (action === "camera") {
        downloadChartSnapshot();
        return;
    }

    if (action === "settings") {
        showSettingsModal();
        return;
    }

    const dropdown = getActionDropdown();
    const titleMap = {
        layout: "Chart Layout",
        formula: "Formula / Scripts",
        indicators: "Indicators"
    };

    renderDropdown(dropdown, titleMap[action] || "Chart Action", getChartActionMenuItems(action), button);
}

function showSettingsModal() {
    showChartModal("Chart Settings", `
        <div class="rt-setting-list">
            <label><span>Theme</span><select id="chartThemeSelect"><option value="dark">Dark</option><option value="deep">Deep Blue</option></select></label>
            <label><span>Grid Lines</span><input id="chartGridToggle" type="checkbox" checked /></label>
            <label><span>Crosshair Mode</span><select id="crosshairModeSelect"><option value="normal">Normal</option><option value="magnet">Magnet Demo</option></select></label>
            <label><span>Candle Style</span><select id="candleStyleSelect"><option>Candles</option><option>Bars Demo</option><option>Line Demo</option></select></label>
        </div>
        <button type="button" class="rt-modal-primary" id="applyChartSettingsBtn">Apply Settings</button>
    `);

    const applyBtn = getEl("applyChartSettingsBtn");

    if (applyBtn) {
        applyBtn.addEventListener("click", () => {
            const gridToggle = getEl("chartGridToggle");

            if (state.chart && gridToggle) {
                const gridColor = gridToggle.checked ? "rgba(148, 163, 184, 0.08)" : "rgba(148, 163, 184, 0)";
                state.chart.applyOptions({
                    grid: {
                        vertLines: { color: gridColor },
                        horzLines: { color: gridColor }
                    }
                });
            }

            closeChartModal();
            showDrawingMessage("Chart settings applied.");
        });
    }
}

function showFormulaModal() {
    showChartModal("Formula Editor", `
        <p class="rt-modal-help">Create a demo custom indicator formula for project preview.</p>
        <textarea id="formulaEditorInput" class="rt-formula-editor" rows="5">close - open</textarea>
        <div class="rt-formula-presets">
            <button type="button" data-formula-preset="SMA(close, 20)">SMA</button>
            <button type="button" data-formula-preset="EMA(close, 50)">EMA</button>
            <button type="button" data-formula-preset="VWAP(close, volume)">VWAP</button>
            <button type="button" data-formula-preset="(close - open) / open * 100">Change %</button>
        </div>
        <button type="button" class="rt-modal-primary" id="applyFormulaBtn">Apply Formula</button>
    `);

    document.querySelectorAll("[data-formula-preset]").forEach((button) => {
        button.addEventListener("click", () => {
            const input = getEl("formulaEditorInput");
            if (input) input.value = button.getAttribute("data-formula-preset");
        });
    });

    const applyBtn = getEl("applyFormulaBtn");

    if (applyBtn) {
        applyBtn.addEventListener("click", () => {
            const input = getEl("formulaEditorInput");
            showDrawingMessage(`Formula applied: ${input ? input.value : "custom"}`);
            closeChartModal();
        });
    }
}

function refreshLayersPanel() {
    const layersList = getEl("layersList");

    if (!layersList || !elements.drawingOverlay) {
        return;
    }

    const uniqueIds = Array.from(new Set(
        Array.from(elements.drawingOverlay.querySelectorAll("[data-drawing-id]")).map((item) => item.getAttribute("data-drawing-id"))
    )).filter(Boolean);

    if (!uniqueIds.length) {
        layersList.innerHTML = `<p class="rt-empty-layer">No drawings yet.</p>`;
        return;
    }

    layersList.innerHTML = uniqueIds.map((id, index) => `
        <button type="button" class="rt-layer-item" data-layer-id="${id}">
            <span>${index + 1}</span>
            <strong>${id}</strong>
        </button>
    `).join("");

    layersList.querySelectorAll("[data-layer-id]").forEach((button) => {
        button.addEventListener("click", () => {
            selectDrawing(button.getAttribute("data-layer-id"));
        });
    });
}

function openLayersPanel() {
    const panel = getEl("chartLayersPanel");

    if (!panel) {
        return;
    }

    refreshLayersPanel();
    panel.classList.remove("hidden");
    showDrawingMessage("Object Tree opened.");
}

function closeLayersPanel() {
    const panel = getEl("chartLayersPanel");

    if (panel) {
        panel.classList.add("hidden");
    }
}

function initAdvancedDrawingDropdowns() {
    document.querySelectorAll("[data-drawing-tool]").forEach((button) => {
        button.addEventListener("click", (event) => {
            const toolName = button.getAttribute("data-drawing-tool");
            openDrawingToolDropdown(button, toolName);
            event.stopPropagation();
        });
    });

    if (elements.drawingOverlay) {
        elements.drawingOverlay.addEventListener("mouseup", refreshLayersPanel);
        elements.drawingOverlay.addEventListener("click", refreshLayersPanel);
    }
}

function initAdvancedChartActionDropdowns() {
    document.querySelectorAll("[data-chart-action]").forEach((button) => {
        button.addEventListener("click", (event) => {
            const action = button.getAttribute("data-chart-action");
            openChartActionDropdown(button, action);
            event.stopPropagation();
        });
    });

    const closeModalBtn = getEl("chartModalClose");
    const modalBackdrop = getEl("chartModalBackdrop");
    const closeLayersBtn = getEl("closeLayersPanel");

    if (closeModalBtn) {
        closeModalBtn.addEventListener("click", closeChartModal);
    }

    if (modalBackdrop) {
        modalBackdrop.addEventListener("click", (event) => {
            if (event.target === modalBackdrop) {
                closeChartModal();
            }
        });
    }

    if (closeLayersBtn) {
        closeLayersBtn.addEventListener("click", closeLayersPanel);
    }

    document.addEventListener("click", (event) => {
        if (event.target.closest(".rt-chart-dropdown") || event.target.closest("[data-drawing-tool]") || event.target.closest("[data-chart-action]")) {
            return;
        }

        closeAdvancedDropdowns();
    });
}

function initOrderBookViewModes() {
    const buttons = document.querySelectorAll(".rt-ob-view-btn");

    buttons.forEach((button, index) => {
        if (!button.getAttribute("data-book-view")) {
            const fallbackViews = ["both", "bids", "asks"];
            button.setAttribute("data-book-view", fallbackViews[index] || "both");
        }

        button.addEventListener("click", () => {
            const view = button.getAttribute("data-book-view") || "both";
            advancedUiState.activeBookView = view;

            buttons.forEach((item) => item.classList.remove("active"));
            button.classList.add("active");

            if (elements.orderBookAsks) {
                elements.orderBookAsks.classList.toggle("hidden", view === "bids");
            }

            if (elements.orderBookBids) {
                elements.orderBookBids.classList.toggle("hidden", view === "asks");
            }

            if (elements.orderBookMid) {
                elements.orderBookMid.classList.toggle("hidden", view !== "both");
            }

            showDrawingMessage(`Order book view: ${view}.`);
        });
    });
}

function initTpSlAndOrderExtras() {
    const tpSlCheckbox = getEl("tpSlCheckbox");
    const tpSlFields = getEl("tpSlFields");

    if (tpSlCheckbox && tpSlFields) {
        tpSlCheckbox.addEventListener("change", () => {
            tpSlFields.classList.toggle("hidden", !tpSlCheckbox.checked);
            showDrawingMessage(tpSlCheckbox.checked ? "TP/SL fields enabled." : "TP/SL fields hidden.");
        });
    }

    document.querySelectorAll("[data-order-type]").forEach((button) => {
        button.addEventListener("click", () => {
            setOrderType(button.getAttribute("data-order-type"));
        });
    });
}

function initFuturesAdvancedIcons() {
    initAdvancedDrawingDropdowns();
    initAdvancedChartActionDropdowns();
    initOrderBookViewModes();
    initTpSlAndOrderExtras();
}
/* =====================================================
   SHARK STYLE MOVING TICKER - NO DELETE PATCH
   Paste at bottom of futures.js
===================================================== */

const TX_TICKER_INR_RATE = 83.35;

const TX_TICKER_DISPLAY_ITEMS = [
    { symbol: "BTCUSDT", label: "BTC-INR", quote: "INR" },
    { symbol: "ETHUSDT", label: "ETH-INR", quote: "INR" },
    { symbol: "SOLUSDT", label: "SOL-INR", quote: "INR" },
    { symbol: "XRPUSDT", label: "XRP-INR", quote: "INR" },

    { symbol: "BTCUSDT", label: "BTC-USDT", quote: "USDT" },
    { symbol: "ETHUSDT", label: "ETH-USDT", quote: "USDT" },
    { symbol: "SOLUSDT", label: "SOL-USDT", quote: "USDT" },
    { symbol: "BNBUSDT", label: "BNB-USDT", quote: "USDT" },
    { symbol: "AVAXUSDT", label: "AVAX-USDT", quote: "USDT" },
    { symbol: "DOGEUSDT", label: "DOGE-USDT", quote: "USDT" },
    { symbol: "ADAUSDT", label: "ADA-USDT", quote: "USDT" },
    { symbol: "TRXUSDT", label: "TRX-USDT", quote: "USDT" },
    { symbol: "DOTUSDT", label: "DOT-USDT", quote: "USDT" },
    { symbol: "XAUUSD", label: "XAUUSD", quote: "USDT" }
];

function txTickerKey(item) {
    return `${item.symbol}_${item.quote}`;
}

function txTickerIcon(symbol) {
    return getCoinLogoSvg(symbol, "w-5 h-5");
}

function txTickerPrice(item, ticker) {
    const fallbackPrice = Number(defaultPrices[item.symbol] || 0);
    const storedPrice = typeof txGetLivePriceForSymbol === "function"
        ? txGetLivePriceForSymbol(item.symbol, 0)
        : 0;
    const livePrice = ticker
        ? Number(ticker.c || ticker.lastPrice || ticker.last_price || 0)
        : (storedPrice || fallbackPrice);

    if (item.quote === "INR") {
        return livePrice * TX_TICKER_INR_RATE;
    }

    return livePrice;
}

function txTickerChange(ticker, symbol = "") {
    if (ticker) {
        return Number(ticker.P || ticker.priceChangePercent || ticker.price_change_percent || 0);
    }

    const cleanSymbol = normalizeSymbol(symbol);
    return Number(state.lastTickerChanges?.[cleanSymbol] || 0);
}

function txGetTickerMap(tickerItems = []) {
    const tickerMap = new Map();

    tickerItems.forEach((item) => {
        if (item && item.s) {
            tickerMap.set(item.s, item);
        }
    });

    return tickerMap;
}

function txBuildTickerHtml(tickerMap = new Map()) {
    return TX_TICKER_DISPLAY_ITEMS.map((item) => {
        const ticker = tickerMap.get(item.symbol);
        const price = txTickerPrice(item, ticker);
        const change = txTickerChange(ticker, item.symbol);
        const changeClass = change >= 0 ? "text-emerald-400" : "text-red-400";
        const sign = change >= 0 ? "+" : "";
        const decimals = item.quote === "INR" ? 2 : price < 1 ? 4 : 2;
        const key = txTickerKey(item);

        return `
            <button class="rt-ticker-item" type="button" data-ticker-symbol="${item.symbol}">
                <span class="rt-ticker-icon">${txTickerIcon(item.symbol)}</span>
                <strong>${item.label}</strong>
                <span data-ticker-price="${key}">${formatNumber(price, decimals)}</span>
                <span data-ticker-change="${key}" class="${changeClass}">${sign}${change.toFixed(3)}%</span>
            </button>
        `;
    }).join("");
}

function txBindTickerClicks() {
    if (!elements.tickerStrip) {
        return;
    }

    elements.tickerStrip.querySelectorAll("[data-ticker-symbol]").forEach((button) => {
        button.addEventListener("click", () => {
            const symbol = button.getAttribute("data-ticker-symbol");

            if (elements.pairSelect) {
                elements.pairSelect.value = symbol;
            }

            changePair(symbol);
        });
    });
}

/* Old renderTickerStrip override - biju kai delete nathi */
function renderTickerStrip(tickerItems = []) {
    if (!elements.tickerStrip) {
        return;
    }

    const tickerMap = txGetTickerMap(tickerItems);
    const tickerHtml = txBuildTickerHtml(tickerMap);

    elements.tickerStrip.innerHTML = `
        <div class="rt-ticker-marquee">
            <div class="rt-ticker-track">
                ${tickerHtml}
                ${tickerHtml}
            </div>
        </div>
    `;

    txBindTickerClicks();
}

function updateTickerStripPrices(tickerMap) {
    TX_TICKER_DISPLAY_ITEMS.forEach((item) => {
        const key = txTickerKey(item);
        const ticker = tickerMap.get(item.symbol);
        const price = txTickerPrice(item, ticker);
        const change = txTickerChange(ticker, item.symbol);
        const changeClass = change >= 0 ? "text-emerald-400" : "text-red-400";
        const sign = change >= 0 ? "+" : "";
        const decimals = item.quote === "INR" ? 2 : price < 1 ? 4 : 2;

        document.querySelectorAll(`[data-ticker-price="${key}"]`).forEach((element) => {
            element.textContent = formatNumber(price, decimals);
        });

        document.querySelectorAll(`[data-ticker-change="${key}"]`).forEach((element) => {
            element.textContent = `${sign}${change.toFixed(3)}%`;
            element.className = changeClass;
        });
    });
}

/* Real ticker snapshot + throttled ticker WebSocket - no delete patch */
function txRememberTicker(symbol, price, changePercent = 0, tickerMap = null) {
    const cleanSymbol = normalizeSymbol(symbol || "");
    const numericPrice = Number(price);
    const numericChange = Number(changePercent || 0);

    if (!cleanSymbol || !Number.isFinite(numericPrice) || numericPrice <= 0) {
        return;
    }

    if (!state.lastTickerChanges) {
        state.lastTickerChanges = {};
    }

    const internalSymbol = txNormalizeProviderSymbol(cleanSymbol);
    const providerSymbol = txGetProviderSymbol(internalSymbol);

    state.lastTickerChanges[cleanSymbol] = Number.isFinite(numericChange) ? numericChange : 0;
    state.lastTickerChanges[internalSymbol] = state.lastTickerChanges[cleanSymbol];
    state.lastTickerChanges[providerSymbol] = state.lastTickerChanges[cleanSymbol];

    txStoreLivePrice(cleanSymbol, numericPrice);
    txStoreLivePrice(internalSymbol, numericPrice);
    txStoreLivePrice(providerSymbol, numericPrice);

    if (tickerMap) {
        const ticker = {
            s: internalSymbol,
            c: numericPrice,
            lastPrice: numericPrice,
            P: state.lastTickerChanges[cleanSymbol],
            priceChangePercent: state.lastTickerChanges[cleanSymbol]
        };

        tickerMap.set(internalSymbol, ticker);
        tickerMap.set(providerSymbol, { ...ticker, s: providerSymbol });
        tickerMap.set(cleanSymbol, { ...ticker, s: cleanSymbol });
    }
}

function txApplyTickerSnapshotRows(rows = [], tickerMap = new Map()) {
    rows.forEach((row) => {
        const symbol = normalizeSymbol(row.symbol || row.provider_symbol || row.s || "");
        const price = Number(row.last_price ?? row.lastPrice ?? row.c ?? row.price ?? 0);
        const change = Number(row.price_change_percent ?? row.priceChangePercent ?? row.P ?? 0);
        txRememberTicker(symbol, price, change, tickerMap);

        const markP = Number(row.mark_price ?? row.markPrice ?? 0);
        const indexP = Number(row.index_price ?? row.indexPrice ?? 0);
        const fundingR = Number(row.funding_rate ?? row.fundingRate ?? 0);
        if (markP > 0 || indexP > 0) {
            txStoreMarkPrice(symbol, markP, indexP, fundingR);
        }
    });

    updateTickerStripPrices(tickerMap);
    txRefreshVisibleTradingRows(true);
}

async function txLoadTickerSnapshot(tickerMap = new Map()) {
    try {
        if (typeof apiRequest === "function") {
            const response = await apiRequest("/market/board");
            const markets = response?.data?.markets || [];
            if (Array.isArray(markets) && markets.length > 0) {
                txApplyTickerSnapshotRows(markets, tickerMap);
                return;
            }
        }
    } catch (error) {
        console.warn("Backend market board snapshot unavailable, trying Binance REST.", error);
    }

    try {
        const response = await fetch(`${REST_BASE}/ticker/24hr`);
        if (!response.ok) {
            throw new Error("Binance ticker snapshot failed");
        }

        const rows = await response.json();
        if (!Array.isArray(rows)) {
            return;
        }

        const wanted = new Set(pairs.map((pair) => txGetProviderSymbol(pair.symbol)));
        const snapshotRows = rows
            .filter((row) => wanted.has(normalizeSymbol(row.symbol)))
            .map((row) => ({
                symbol: row.symbol,
                lastPrice: row.lastPrice,
                priceChangePercent: row.priceChangePercent
            }));

        txApplyTickerSnapshotRows(snapshotRows, tickerMap);
    } catch (error) {
        console.warn("Ticker snapshot unavailable. Waiting for WebSocket ticks.", error);
    }
}

function txFlushTickerStrip(tickerMap = new Map()) {
    updateTickerStripPrices(tickerMap);
    txRefreshVisibleTradingRows();
}

/* Old startTickerSocket override - biju kai delete nathi */
function startTickerSocket() {
    renderTickerStrip();

    if (state.tickerSocket) {
        state.tickerSocket.close();
    }

    if (state.tickerFlushTimer) {
        window.clearInterval(state.tickerFlushTimer);
        state.tickerFlushTimer = null;
    }

    if (state.tickerRestRefreshTimer) {
        window.clearInterval(state.tickerRestRefreshTimer);
        state.tickerRestRefreshTimer = null;
    }

    const streams = pairs
        .filter((pair) => !isCommoditySymbol(pair.symbol))
        .map((pair) => `${pair.symbol.toLowerCase()}@ticker`)
        .join("/");
    const tickerMap = new Map();

    txLoadTickerSnapshot(tickerMap);
    state.tickerRestRefreshTimer = window.setInterval(() => {
        txLoadTickerSnapshot(tickerMap);
    }, 30000);

    state.tickerFlushTimer = window.setInterval(() => {
        txFlushTickerStrip(tickerMap);
    }, TX_TICKER_STRIP_REFRESH_MS);

    if (!streams) {
        return;
    }

    try {
        state.tickerSocket = new WebSocket(`${WS_BASE}${streams}`);

        state.tickerSocket.onmessage = (event) => {
            const response = JSON.parse(event.data);
            const ticker = response.data;

            if (!ticker || !ticker.s) {
                return;
            }

            const tickerPrice = Number(ticker.c || ticker.lastPrice || 0);
            const tickerChange = Number(ticker.P || ticker.priceChangePercent || 0);
            txRememberTicker(ticker.s, tickerPrice, tickerChange, tickerMap);

            const now = Date.now();
            if (ticker.s === state.currentSymbol && now - Number(state.lastTickerMetricsAt || 0) >= TX_TICKER_STRIP_REFRESH_MS) {
                state.lastTickerMetricsAt = now;
                updateMetricsFromTicker(ticker);
            }
        };

        state.tickerSocket.onerror = () => {
            console.warn("Ticker WebSocket error.");
        };
    } catch (error) {
        console.error(error);
    }
}

function txStoreMarkPrice(symbol, markPrice, indexPrice = 0, fundingRate = 0, nextFundingTime = null) {
    if (typeof window.txStoreMarkPriceImpl === "function") {
        return window.txStoreMarkPriceImpl(symbol, markPrice, indexPrice, fundingRate, nextFundingTime);
    }
}

function startBackendMarkPriceSocket() {
    if (typeof window.txStartMarkPriceSocket === "function") {
        return window.txStartMarkPriceSocket();
    }
}

function startBackendFastTradePriceSocket() {
    if (state.fastTradePriceSocket) {
        try { state.fastTradePriceSocket.close(); } catch (_) {}
        state.fastTradePriceSocket = null;
    }

    const seen = new Set();
    const streams = pairs
        .map((pair) => txGetProviderSymbol(pair.symbol))
        .filter((symbol) => {
            const clean = normalizeSymbol(symbol || "");
            if (!clean || seen.has(clean)) return false;
            seen.add(clean);
            return true;
        })
        .map((symbol) => `${symbol.toLowerCase()}@aggTrade`)
        .join("/");

    if (!streams) {
        return;
    }

    try {
        state.fastTradePriceSocket = new WebSocket(`${WS_BASE}${streams}`);

        state.fastTradePriceSocket.onmessage = (event) => {
            const response = JSON.parse(event.data);
            const data = response.data || response;

            if (!data || !data.s) {
                return;
            }

            const price = Number(data.p || data.price || data.c || 0);
            if (!Number.isFinite(price) || price <= 0) {
                return;
            }

            txStoreLivePrice(data.s, price);

            const internalSymbol = txNormalizeProviderSymbol(data.s);
            const now = Date.now();
            if (internalSymbol === state.currentSymbol) {
                if (now - Number(state.lastPrimaryLivePriceAt || 0) >= TX_LIVE_ROW_REFRESH_MS) {
                    state.lastPrimaryLivePriceAt = now;
                    updateLivePrice(price);
                } else {
                    txRefreshVisibleTradingRows();
                }
            } else {
                txRefreshVisibleTradingRows();
            }

        };

        state.fastTradePriceSocket.onerror = () => {
            console.warn("Fast trade price WebSocket error.");
        };
    } catch (error) {
        console.warn("Unable to start fast trade price WebSocket:", error);
    }
}

function startBackendLiveRowsTimer() {
    if (state.liveRowsTimer) {
        window.clearInterval(state.liveRowsTimer);
    }

    state.liveRowsTimer = window.setInterval(() => {
        if (!isLoggedIn()) {
            return;
        }

        const bestAsk = (state.orderBook?.asks || []).find((row) => txToNumber(row.price, 0) > 0);
        const bestBid = (state.orderBook?.bids || []).find((row) => txToNumber(row.price, 0) > 0);

        if (bestAsk && bestBid && normalizeSymbol(state.currentSymbol)) {
            const midPrice = (txToNumber(bestAsk.price, 0) + txToNumber(bestBid.price, 0)) / 2;
            if (midPrice > 0) {
                txStoreLivePrice(state.currentSymbol, midPrice);
            }
        }

        txRefreshVisibleTradingRows();
    }, TX_LIVE_ROW_REFRESH_MS);
}


async function txRefreshAllSymbolPricesFromBackend(force = false) {
    if (!force && document.hidden) {
        return;
    }

    if (state.allSymbolPriceLoading) {
        return;
    }

    try {
        state.allSymbolPriceLoading = true;

        let rows = [];

        if (typeof apiRequest === "function" && isLoggedIn()) {
            try {
                const response = await apiRequest("/market/board");
                rows = response?.data?.markets || [];
            } catch (error) {
                console.warn("Live all-symbol backend price snapshot failed, using market sockets.", error);
            }
        }

        if (!Array.isArray(rows) || rows.length === 0) {
            return;
        }

        rows.forEach((row) => {
            const symbol = normalizeSymbol(row.symbol || row.provider_symbol || row.s || "");
            const price = Number(row.last_price ?? row.lastPrice ?? row.mark_price ?? row.price ?? row.c ?? 0);
            const change = Number(row.price_change_percent ?? row.priceChangePercent ?? row.change_percent ?? row.P ?? 0);

            if (symbol && Number.isFinite(price) && price > 0) {
                txRememberTicker(symbol, price, change);
            }
        });

        txRefreshVisibleTradingRows(true);
    } catch (error) {
        console.warn("All-symbol price refresh failed.", error);
    } finally {
        state.allSymbolPriceLoading = false;
    }
}

function startAllSymbolLivePriceSync() {
    if (state.allSymbolPriceTimer) {
        window.clearInterval(state.allSymbolPriceTimer);
        state.allSymbolPriceTimer = null;
    }

    txRefreshAllSymbolPricesFromBackend(true);

    state.allSymbolPriceTimer = window.setInterval(() => {
        if (!isLoggedIn()) {
            return;
        }

        txRefreshAllSymbolPricesFromBackend(false);
    }, TX_ALL_SYMBOL_PRICE_REFRESH_MS);
}

/* =====================================================
   BACKEND CONNECTIVITY PATCH - TraidiumX Futures
   Existing chart/orderbook/ticker/drawing UI is preserved.
   This block only overrides demo wallet/orders/tables with Flask APIs.
===================================================== */

let cachedPositionsInit = [];
try {
    const token = localStorage.getItem("traidiumx_auth_token") || "guest";
    const activeSubId = localStorage.getItem("traidiumx_active_user_id") || "master";
    const cacheKey = "tx_cached_positions_" + token.substring(0, 15) + "_" + activeSubId;
    const raw = localStorage.getItem(cacheKey);
    if (raw) cachedPositionsInit = JSON.parse(raw);
} catch (e) {}

const TX_BACKEND_FUTURES = {
    walletLoaded: false,
    walletLoading: false,
    dataLoading: false,
    autoExecuteLoading: false,
    lastDataLoadAt: 0,
    wallet: null,
    orders: [],
    openOrders: [],
    positions: cachedPositionsInit,
    trades: [],
    ledger: [],
    pnlSummary: null,
    riskSummary: null,
    pendingProcessLoading: false,
    lastPendingProcessAt: 0,
    optimisticActionCount: 0,
    suppressAutoRefreshUntil: 0,
    pendingClosePositionIds: Object.create(null),
    pendingCancelOrderIds: Object.create(null),
    pendingCloseAll: false,
    pendingLocalCloseIds: Object.create(null),
    tpSlMemory: Object.create(null),
    tpSlClosingIds: Object.create(null)
};

const TX_BACKEND_DATA_REFRESH_MS = 5000;
const TX_LIVE_ROW_REFRESH_MS = 1000;
const TX_TICKER_STRIP_REFRESH_MS = 2000;
const TX_PENDING_ORDER_PROCESS_MS = 700;
const TX_BACKGROUND_BACKEND_REFRESH_MS = 1000;
const TX_ALL_SYMBOL_PRICE_REFRESH_MS = 2500;
const TX_BACKEND_API_TIMEOUT_MS = 3500;

function txApiReady() {
    return typeof apiRequest === "function" && typeof getAuthToken === "function";
}


function txFormatRecentViewedTime(value) {
    const timestamp = new Date(value || "").getTime();
    if (!Number.isFinite(timestamp)) return "Recently";

    const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSeconds < 60) return "Now";
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.min(7, Math.floor(diffSeconds / 86400))}d ago`;
}

function txSetRecentSymbolsPanelOpen(open) {
    if (!elements.futuresRecentSymbolsPanel || !elements.futuresRecentSymbolsBtn) return;

    const shouldOpen = Boolean(open);
    elements.futuresRecentSymbolsPanel.classList.toggle("hidden", !shouldOpen);
    elements.futuresRecentSymbolsBtn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");

    if (shouldOpen) {
        txLoadRecentSymbols(true);
    }
}

function txRenderRecentSymbols() {
    const symbols = Array.isArray(state.recentSymbols) ? state.recentSymbols : [];

    if (elements.futuresRecentSymbolsCount) {
        elements.futuresRecentSymbolsCount.textContent = String(symbols.length);
    }

    if (!elements.futuresRecentSymbolsList) return;

    if (!isLoggedIn()) {
        elements.futuresRecentSymbolsList.innerHTML = '<div class="tx-futures-panel-empty">Login to load your user-wise 7-day symbol list.</div>';
        return;
    }

    if (state.recentSymbolsLoading && !symbols.length) {
        elements.futuresRecentSymbolsList.innerHTML = '<div class="tx-futures-panel-empty">Loading your recently viewed symbols...</div>';
        return;
    }

    if (!symbols.length) {
        elements.futuresRecentSymbolsList.innerHTML = '<div class="tx-futures-panel-empty">Your recently viewed Futures symbols will appear here.</div>';
        return;
    }

    elements.futuresRecentSymbolsList.innerHTML = symbols.map((item) => {
        const symbol = normalizeSymbol(item.symbol);
        const pair = getPair(symbol);
        const label = item.label || pair.label || symbol;
        const activeClass = symbol === normalizeSymbol(state.currentSymbol) ? " active" : "";
        const logo = getCoinLogoSvg(symbol, "w-5 h-5");

        return `
            <button type="button" class="tx-futures-recent-item${activeClass}" data-recent-futures-symbol="${txEscapeHtml(symbol)}">
                <span class="flex items-center gap-2">
                    ${logo}
                    <span class="tx-futures-recent-symbol">${txEscapeHtml(label)}</span>
                </span>
                <span class="tx-futures-recent-time">${txEscapeHtml(txFormatRecentViewedTime(item.last_viewed_at))}</span>
            </button>
        `;
    }).join("");
}

async function txLoadRecentSymbols(force = false) {
    try {
        let local = JSON.parse(localStorage.getItem("tx_recent_futures_symbols") || "[]");
        if (local.length > 0) state.recentSymbols = local;
    } catch (e) {}

    if (!isLoggedIn() || !txApiReady()) {
        state.recentSymbolsLoading = false;
        txRenderRecentSymbols();
        return;
    }

    if (state.recentSymbolsLoading && !force) return;

    try {
        state.recentSymbolsLoading = true;
        txRenderRecentSymbols();

        const response = await txApiRequestWithTimeout("/trading/recent-symbols", {}, 1500);
        if (Array.isArray(response?.data?.symbols) && response.data.symbols.length > 0) {
            state.recentSymbols = response.data.symbols;
        }
    } catch (error) {
        // Silent fallback to local storage
    } finally {
        state.recentSymbolsLoading = false;
        txRenderRecentSymbols();
    }
}

async function txRecordRecentSymbol(symbol = state.currentSymbol) {
    const cleanSymbol = normalizeSymbol(symbol);
    if (!cleanSymbol) return;

    try {
        let local = JSON.parse(localStorage.getItem("tx_recent_futures_symbols") || "[]");
        local = [cleanSymbol, ...local.filter(s => s !== cleanSymbol)].slice(0, 10);
        localStorage.setItem("tx_recent_futures_symbols", JSON.stringify(local));
    } catch (e) {}

    if (!isLoggedIn() || !txApiReady() || !isSupportedSymbol(cleanSymbol)) {
        txRenderRecentSymbols();
        return;
    }

    const sequence = ++state.recentSymbolsWriteSequence;

    try {
        const response = await txApiRequestWithTimeout("/trading/recent-symbols", {
            method: "POST",
            body: JSON.stringify({ symbol: cleanSymbol })
        }, 1500);

        if (sequence >= state.recentSymbolsAppliedSequence) {
            state.recentSymbolsAppliedSequence = sequence;
            state.recentSymbols = Array.isArray(response?.data?.symbols) ? response.data.symbols : state.recentSymbols;
            txRenderRecentSymbols();
        }
    } catch (error) {
        // Silent fallback to local storage
    }
}

function txInitFuturesChartExtras() {
    txRenderRecentSymbols();
    if (elements.futuresRecentSymbolsBtn) {
        elements.futuresRecentSymbolsBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            const isOpen = elements.futuresRecentSymbolsBtn.getAttribute("aria-expanded") === "true";
            txSetRecentSymbolsPanelOpen(!isOpen);
        });
    }

    if (elements.futuresRecentSymbolsClose) {
        elements.futuresRecentSymbolsClose.addEventListener("click", () => txSetRecentSymbolsPanelOpen(false));
    }

    if (elements.futuresRecentSymbolsList) {
        elements.futuresRecentSymbolsList.addEventListener("click", (event) => {
            const button = event.target.closest("[data-recent-futures-symbol]");
            if (!button) return;

            const symbol = normalizeSymbol(button.getAttribute("data-recent-futures-symbol"));
            txSetRecentSymbolsPanelOpen(false);
            if (symbol && symbol !== normalizeSymbol(state.currentSymbol)) {
                changePair(symbol);
            }
        });
    }

    document.addEventListener("click", (event) => {
        if (!elements.futuresRecentSymbolsPanel || elements.futuresRecentSymbolsPanel.classList.contains("hidden")) return;
        if (elements.futuresRecentSymbolsPanel.contains(event.target) || elements.futuresRecentSymbolsBtn?.contains(event.target)) return;
        txSetRecentSymbolsPanelOpen(false);
    });
}

function isLoggedIn() {
    if (!txApiReady()) {
        return false;
    }

    return !!getAuthToken();
}

function txApiRequestWithTimeout(endpoint, options = {}, timeoutMs = TX_BACKEND_API_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        let settled = false;

        const timer = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            reject({
                message: `Backend request timeout: ${endpoint}`,
                status: 408,
                errors: { timeout: true, endpoint }
            });
        }, Math.max(1000, timeoutMs));

        apiRequest(endpoint, options)
            .then((response) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
                resolve(response);
            })
            .catch((error) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
                reject(error);
            });
    });
}

function txRunAfterBrowserPaint(callback) {
    if (typeof callback !== "function") {
        return;
    }

    const run = () => window.setTimeout(callback, 0);

    if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(run);
        return;
    }

    run();
}

function txRenderNowThenPaint(callback) {
    if (typeof callback === "function") {
        callback();
    }

    if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {});
    }
}

function txSafeCssId(value) {
    const text = String(value ?? "");
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(text);
    }
    return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function txBuildPositionRowHtml(position) {
    const positionId = txGetId(position);
    const symbol = position.symbol;
    const side = position.position_side || position.side;
    const displaySide = txFormatSide(side);
    const qty = txToNumber(position.quantity ?? position.qty, 0);
    const entryPrice = txToNumber(position.entry_price ?? position.entryPrice, 0);
    const backendMarkPrice = txToNumber(position.mark_price ?? position.current_price, 0);
    const markPrice = txGetLivePriceForSymbol(symbol, backendMarkPrice || entryPrice);
    const rawMargin = txToNumber(position.margin_amount ?? position.margin, 0);
    const leverage = txToNumber(position.leverage, 1);
    const liquidationPrice = txToNumber(
        position.liquidation_price ?? position.liquidationPrice ?? position.liq_price ?? position.liqPrice,
        0
    ) || txEstimateLiquidationPrice(entryPrice || markPrice, side, leverage);
    const rawPnl = calculatePositionPnl(position);

    // Detect currency of the position
    const posCurrency = String(position.currency || "USDT").toUpperCase();
    const rate = posCurrency === "INR" ? (TX_FUTURES_USDT_RATE || 88.50) : 1.0;

    const marginAmount = rawMargin * rate;
    const pnl = rawPnl; // Always in USD/USDT

    const pnlColorStyle = getPnlColorStyle(pnl);
    const pnlText = formatPnlValue(pnl, "USD");
    const { takeProfit, stopLoss } = txGetTpSlNumbers(position);
    const tpText = takeProfit > 0 ? formatNumber(takeProfit) : "--";
    const slText = stopLoss > 0 ? formatNumber(stopLoss) : "--";

    const pnlPercent = rawMargin > 0 ? (pnl / rawMargin) * 100 : 0;
    const pnlPercentText = (pnlPercent >= 0 ? "+" : "") + pnlPercent.toFixed(2) + "%";
    const sign = pnl >= 0 ? "+" : "-";
    const absPnlText = `$${Math.abs(pnl).toFixed(2)}`;
    const tpValText = takeProfit > 0 ? formatNumber(takeProfit) : "-";
    const slValText = stopLoss > 0 ? formatNumber(stopLoss) : "-";

    const badgeStyle = posCurrency === "INR"
        ? "background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35);"
        : "background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.35);";
    const currencyBadgeHtml = `<span class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style="margin-left: 8px; white-space: nowrap; ${badgeStyle}">${posCurrency === "USDT" || posCurrency === "USD" ? "USD" : "INR"}</span>`;

    const marginDisplay = posCurrency === "INR"
        ? `₹${formatNumber(marginAmount, 2)}`
        : `${formatNumber(marginAmount, 2)} USD`;

    return `
        <tr data-position-row="${txEscapeHtml(positionId)}">
            <td class="rt-desktop-only" data-label="Pair" data-mobile-field="pair">
                <div style="display: flex; align-items: center; gap: 8px; white-space: nowrap;">
                    <span>${txEscapeHtml(txFormatSymbol(symbol))}</span>
                    ${currencyBadgeHtml}
                </div>
            </td>
            <td class="rt-desktop-only" data-label="Side" data-mobile-field="side" class="${txSideClass(side)}">${txEscapeHtml(displaySide)}</td>
            <td class="rt-desktop-only" data-label="Qty" data-mobile-field="qty">${formatQty(qty)}</td>
            <td class="rt-desktop-only" data-label="Avg" data-mobile-field="entry">${formatNumber(entryPrice, entryPrice < 1 ? 4 : 2)}</td>
            <td class="rt-desktop-only" data-label="LTP" data-mobile-field="mark" data-live-position-mark="${txEscapeHtml(positionId)}">${txFormatFastPrice(markPrice)}</td>
            <td class="rt-desktop-only" data-label="Margin" data-mobile-field="margin">${marginDisplay}</td>
            <td class="rt-desktop-only" data-label="Lev." data-mobile-field="leverage">${formatNumber(leverage, 0)}x<br/><span class="text-[10px] text-slate-500 uppercase font-black">${txEscapeHtml(position.margin_mode || "isolated")}</span></td>
            <td class="rt-desktop-only" data-label="Liq. Price" data-mobile-field="liquidation">${liquidationPrice > 0 ? formatNumber(liquidationPrice, liquidationPrice < 1 ? 4 : 2) : "--"}</td>
            <td class="rt-desktop-only" data-label="TP / SL" data-mobile-field="tp_sl">${tpText} / ${slText}</td>
            <td class="rt-desktop-only" data-label="P&L" data-mobile-field="pnl" ${pnlColorStyle} data-live-position-pnl="${txEscapeHtml(positionId)}">${pnlText}</td>
            <td class="rt-desktop-only" data-label="Action" data-mobile-field="action">
                <button class="rt-table-action" type="button" data-close-position="${txEscapeHtml(positionId)}">
                     Close
                </button>
            </td>
            
            <td class="rt-mobile-only rt-mobile-card-cell" colspan="11">
                <div class="rt-mobile-position-card py-1">
                    <!-- Line 1: Symbol, Badges, PnL & ✕ Close Icon -->
                    <div class="flex justify-between items-center mb-1.5">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-xs font-black text-white">${txEscapeHtml(txFormatSymbol(symbol))}</span>
                            ${currencyBadgeHtml}
                            <span class="text-[9.5px] font-black px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800/80 ${txSideClass(side)}">${displaySide} ${leverage}x</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-black animate-pulse" ${pnlColorStyle} data-live-position-mobile-pnl="${txEscapeHtml(positionId)}">${sign}${absPnlText} (${pnlPercentText})</span>
                            <button class="rt-mobile-close-btn" type="button" data-close-position="${txEscapeHtml(positionId)}" title="Close Position">
                                ✕
                            </button>
                        </div>
                    </div>

                    <!-- Line 2: 3-Col Grid for QTY | AVG | LTP -->
                    <div class="grid grid-cols-3 gap-1 text-[10.5px] font-semibold text-slate-400 mb-1 bg-slate-950/40 px-2 py-1 rounded-md border border-slate-800/40">
                        <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">QTY</span><span class="font-mono font-black ${txSideClass(side)}">${formatQty(qty)}</span></div>
                        <div class="text-center"><span class="text-slate-500 text-[8.5px] font-bold mr-1">AVG</span><span class="font-mono text-white font-bold">${formatNumber(entryPrice, entryPrice < 1 ? 4 : 2)}</span></div>
                        <div class="text-right"><span class="text-slate-500 text-[8.5px] font-bold mr-1">LTP</span><span class="font-mono text-white font-bold" data-live-position-mark="${txEscapeHtml(positionId)}">${txFormatFastPrice(markPrice)}</span></div>
                    </div>

                    <!-- Line 3: Dedicated TP/SL Bar (Zero Text Collision) -->
                    <div class="flex items-center justify-between text-[10px] font-bold text-slate-400 bg-slate-950/20 px-2 py-0.5 rounded border border-slate-800/30">
                        <span class="text-slate-500 text-[8.5px] uppercase tracking-wider">TP / SL</span>
                        <div class="font-mono truncate ml-2">
                            <span class="text-emerald-400 font-bold">${tpValText}</span>
                            <span class="text-slate-600 mx-1">/</span>
                            <span class="text-red-400 font-bold">${slValText}</span>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    `;
}

function txWirePositionRow(row) {
    if (!row) return;
    row.querySelectorAll("[data-close-position]").forEach((button) => {
        if (button.dataset.txCloseWired === "1") return;
        button.dataset.txCloseWired = "1";
        button.addEventListener("click", () => closePosition(button.getAttribute("data-close-position")));
    });
}

function txUpdatePositionsDomCount() {
    if (!elements.terminalTable || state.activeBottomTab !== "positions") return;
    const count = (TX_BACKEND_FUTURES.positions || []).length;
    const subtitle = elements.terminalTable.querySelector(".rt-position-action-subtitle");
    if (subtitle) {
        subtitle.textContent = `${count} active position(s) · Live prices keep updating for every pair.`;
    }
}

function txPositionTableBody() {
    if (!elements.terminalTable || state.activeBottomTab !== "positions") return null;
    return elements.terminalTable.querySelector(".rt-table tbody");
}

function txInsertPositionRowImmediately(position) {
    const positionId = txGetId(position);
    if (!positionId || !elements.terminalTable || state.activeBottomTab !== "positions") {
        return false;
    }

    const tbody = txPositionTableBody();
    if (!tbody) {
        renderPositionsTable();
        return true;
    }

    const existing = elements.terminalTable.querySelector(`[data-position-row="${txSafeCssId(positionId)}"]`);
    if (existing) existing.remove();

    tbody.insertAdjacentHTML("afterbegin", txBuildPositionRowHtml(position));
    txWirePositionRow(tbody.querySelector(`[data-position-row="${txSafeCssId(positionId)}"]`));
    txUpdatePositionsDomCount();
    return true;
}

function txReplacePositionRowImmediately(oldPositionId, newPosition) {
    const newPositionId = txGetId(newPosition);
    if (!newPositionId || !elements.terminalTable || state.activeBottomTab !== "positions") {
        return false;
    }

    const oldRow = oldPositionId
        ? elements.terminalTable.querySelector(`[data-position-row="${txSafeCssId(oldPositionId)}"]`)
        : null;
    const duplicateNewRow = elements.terminalTable.querySelector(`[data-position-row="${txSafeCssId(newPositionId)}"]`);
    if (duplicateNewRow && duplicateNewRow !== oldRow) duplicateNewRow.remove();

    const wrapper = document.createElement("tbody");
    wrapper.innerHTML = txBuildPositionRowHtml(newPosition).trim();
    const nextRow = wrapper.firstElementChild;

    if (oldRow && nextRow) {
        oldRow.replaceWith(nextRow);
        txWirePositionRow(nextRow);
        txUpdatePositionsDomCount();
        return true;
    }

    return txInsertPositionRowImmediately(newPosition);
}

function txRemovePositionRowImmediately(positionId) {
    if (!elements.terminalTable || !positionId) {
        return false;
    }

    const row = elements.terminalTable.querySelector(`[data-position-row="${txSafeCssId(positionId)}"]`);

    if (!row) {
        txUpdatePositionsDomCount();
        return false;
    }

    row.remove();
    txUpdatePositionsDomCount();
    return true;
}

function txRenderActiveTableFast() {
    updateWalletUI();
    renderActiveBackendTableFromCache();
    txRefreshVisibleTradingRows(true);
}

function txUpdateActiveTableWithoutFlicker(fallbackRender = false) {
    updateWalletUI();
    txUpdatePositionsDomCount();
    txRefreshVisibleTradingRows(true);

    if (fallbackRender) {
        renderActiveBackendTableFromCache();
    }
}

function getSession() {
    if (!isLoggedIn()) {
        return null;
    }

    if (typeof getAuthUser === "function") {
        return getAuthUser();
    }

    return {
        name: "Trader"
    };
}

function txToNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function txGetId(item) {
    if (!item) {
        return "";
    }

    return String(
        item.id ||
        item._id ||
        item.order_id ||
        item.position_id ||
        item.trade_id ||
        item.order_reference ||
        item.trade_reference ||
        ""
    );
}

function txEscapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function txLedgerTypeLabel(value) {
    return String(value || "--")
        .replace(/trading_fee_debit/gi, "trading_fee_debit")
        .replace(/platform_fee_debit/gi, "platform_fee_debit")
        .replaceAll("_", " ")
        .replaceAll("-", " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

function txEnsureFuturesModalStyles() {
    if (document.getElementById("txFuturesModalStyles")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "txFuturesModalStyles";
    style.textContent = `
        .tx-futures-modal-backdrop {
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 18px;
            background: rgba(2, 6, 23, 0.78);
            backdrop-filter: blur(12px);
        }
        .tx-futures-modal-card {
            width: min(480px, 100%);
            border-radius: 26px;
            border: 1px solid rgba(148, 163, 184, 0.24);
            background: linear-gradient(180deg, #111827, #060a14);
            box-shadow: 0 28px 90px rgba(0, 0, 0, 0.62);
            padding: 26px;
            color: #e5e7eb;
            animation: txFuturesModalIn 0.18s ease-out;
        }
        .tx-futures-modal-title {
            margin: 0 0 8px;
            font-size: 22px;
            line-height: 1.15;
            font-weight: 900;
            letter-spacing: -0.03em;
            color: #ffffff;
        }
        .tx-futures-modal-message {
            margin: 0;
            color: #94a3b8;
            line-height: 1.55;
            font-size: 14px;
        }
        .tx-futures-modal-icon {
            width: 54px;
            height: 54px;
            border-radius: 18px;
            display: grid;
            place-items: center;
            font-size: 24px;
            font-weight: 900;
            color: #67e8f9;
            background: rgba(34, 211, 238, 0.12);
            border: 1px solid rgba(34, 211, 238, 0.25);
            margin-bottom: 16px;
        }
        .tx-futures-modal-icon.danger {
            color: #fca5a5;
            background: rgba(239, 68, 68, 0.12);
            border-color: rgba(239, 68, 68, 0.30);
        }
        .tx-futures-modal-input {
            width: 100%;
            margin-top: 18px;
            border-radius: 16px;
            border: 1px solid rgba(148, 163, 184, 0.22);
            background: rgba(2, 6, 23, 0.85);
            color: #e5e7eb;
            padding: 13px 15px;
            outline: none;
            font-weight: 800;
        }
        .tx-futures-modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 24px;
        }
        .tx-futures-modal-btn {
            border: 0;
            border-radius: 15px;
            padding: 12px 18px;
            font-size: 13px;
            font-weight: 900;
            cursor: pointer;
            transition: transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
        }
        .tx-futures-modal-btn:hover { transform: translateY(-1px); }
        .tx-futures-modal-btn.cancel {
            color: #cbd5e1;
            background: rgba(148, 163, 184, 0.12);
            border: 1px solid rgba(148, 163, 184, 0.20);
        }
        .tx-futures-modal-btn.confirm {
            color: #020617;
            background: linear-gradient(135deg, #22d3ee, #818cf8);
            box-shadow: 0 16px 34px rgba(34, 211, 238, 0.18);
        }
        .tx-futures-modal-btn.confirm.danger {
            color: #ffffff;
            background: linear-gradient(135deg, #fb7185, #f97316);
            box-shadow: 0 16px 34px rgba(251, 113, 133, 0.20);
        }
        @keyframes txFuturesModalIn {
            from { opacity: 0; transform: translateY(12px) scale(0.96); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (max-width: 520px) {
            .tx-futures-modal-card { padding: 22px; border-radius: 22px; }
            .tx-futures-modal-actions { flex-direction: column-reverse; }
            .tx-futures-modal-btn { width: 100%; }
        }
    `;
    document.head.appendChild(style);
}

function txShowFuturesConfirm({ title, message, confirmText = "Confirm", cancelText = "Cancel", danger = false }) {
    txEnsureFuturesModalStyles();

    return new Promise((resolve) => {
        const oldModal = document.getElementById("txFuturesModal");
        if (oldModal) oldModal.remove();

        const modal = document.createElement("div");
        modal.id = "txFuturesModal";
        modal.innerHTML = `
            <div class="tx-futures-modal-backdrop">
                <div class="tx-futures-modal-card" role="dialog" aria-modal="true">
                    <div class="tx-futures-modal-icon ${danger ? "danger" : ""}">${danger ? "!" : "✓"}</div>
                    <h3 class="tx-futures-modal-title">${txEscapeHtml(title)}</h3>
                    <p class="tx-futures-modal-message">${txEscapeHtml(message)}</p>
                    <div class="tx-futures-modal-actions">
                        <button type="button" class="tx-futures-modal-btn cancel" id="txFuturesModalCancel">${txEscapeHtml(cancelText)}</button>
                        <button type="button" class="tx-futures-modal-btn confirm ${danger ? "danger" : ""}" id="txFuturesModalOk">${txEscapeHtml(confirmText)}</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        function close(value) {
            modal.remove();
            document.removeEventListener("keydown", escHandler);
            resolve(value);
        }

        function escHandler(event) {
            if (event.key === "Escape") close(false);
            if (event.key === "Enter") close(true);
        }

        document.addEventListener("keydown", escHandler);
        modal.querySelector("#txFuturesModalCancel")?.addEventListener("click", () => close(false));
        modal.querySelector("#txFuturesModalOk")?.addEventListener("click", () => close(true));
        modal.querySelector(".tx-futures-modal-backdrop")?.addEventListener("click", (event) => {
            if (event.target.classList.contains("tx-futures-modal-backdrop")) close(false);
        });
    });
}

function txShowFuturesPrompt({ title, message, defaultValue = "", confirmText = "Add", cancelText = "Cancel" }) {
    txEnsureFuturesModalStyles();

    return new Promise((resolve) => {
        const oldModal = document.getElementById("txFuturesModal");
        if (oldModal) oldModal.remove();

        const modal = document.createElement("div");
        modal.id = "txFuturesModal";
        modal.innerHTML = `
            <div class="tx-futures-modal-backdrop">
                <div class="tx-futures-modal-card" role="dialog" aria-modal="true">
                    <div class="tx-futures-modal-icon">T</div>
                    <h3 class="tx-futures-modal-title">${txEscapeHtml(title)}</h3>
                    <p class="tx-futures-modal-message">${txEscapeHtml(message)}</p>
                    <input class="tx-futures-modal-input" id="txFuturesPromptInput" value="${txEscapeHtml(defaultValue)}" maxlength="80" />
                    <div class="tx-futures-modal-actions">
                        <button type="button" class="tx-futures-modal-btn cancel" id="txFuturesModalCancel">${txEscapeHtml(cancelText)}</button>
                        <button type="button" class="tx-futures-modal-btn confirm" id="txFuturesModalOk">${txEscapeHtml(confirmText)}</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        const input = modal.querySelector("#txFuturesPromptInput");
        input?.focus();
        input?.select();

        function close(value) {
            modal.remove();
            document.removeEventListener("keydown", escHandler);
            resolve(value);
        }

        function escHandler(event) {
            if (event.key === "Escape") close("");
            if (event.key === "Enter") close(String(input?.value || "").trim());
        }

        document.addEventListener("keydown", escHandler);
        modal.querySelector("#txFuturesModalCancel")?.addEventListener("click", () => close(""));
        modal.querySelector("#txFuturesModalOk")?.addEventListener("click", () => close(String(input?.value || "").trim()));
        modal.querySelector(".tx-futures-modal-backdrop")?.addEventListener("click", (event) => {
            if (event.target.classList.contains("tx-futures-modal-backdrop")) close("");
        });
    });
}


function txDelay(ms = 300) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function txEnsureTradeProcessPanelStyles() {
    if (document.getElementById("txTradeProcessPanelStyles")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "txTradeProcessPanelStyles";
    style.textContent = `
        .tx-trade-process-wrap {
            position: fixed;
            top: 86px;
            right: 18px;
            z-index: 99990;
            width: min(390px, calc(100vw - 32px));
            pointer-events: none;
        }
        .tx-trade-process-card {
            pointer-events: auto;
            overflow: hidden;
            border-radius: 24px;
            border: 1px solid rgba(34, 211, 238, 0.22);
            background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.98));
            box-shadow: 0 24px 72px rgba(0, 0, 0, 0.46), 0 0 42px rgba(34, 211, 238, 0.10);
            color: #e5e7eb;
            animation: txTradeProcessSlideIn 0.22s ease-out;
        }
        .tx-trade-process-head {
            display: flex;
            align-items: flex-start;
            gap: 14px;
            padding: 18px 18px 14px;
        }
        .tx-trade-process-icon {
            width: 44px;
            height: 44px;
            border-radius: 16px;
            display: grid;
            place-items: center;
            flex: 0 0 44px;
            color: #22d3ee;
            background: rgba(34, 211, 238, 0.12);
            border: 1px solid rgba(34, 211, 238, 0.28);
            font-weight: 900;
        }
        .tx-trade-process-icon.success {
            color: #34d399;
            background: rgba(52, 211, 153, 0.12);
            border-color: rgba(52, 211, 153, 0.28);
        }
        .tx-trade-process-icon.error {
            color: #fb7185;
            background: rgba(251, 113, 133, 0.12);
            border-color: rgba(251, 113, 133, 0.28);
        }
        .tx-trade-process-title {
            margin: 0;
            color: #ffffff;
            font-size: 15px;
            line-height: 1.2;
            font-weight: 950;
            letter-spacing: -0.02em;
        }
        .tx-trade-process-message {
            margin: 6px 0 0;
            color: #94a3b8;
            font-size: 12px;
            line-height: 1.45;
            font-weight: 700;
        }
        .tx-trade-process-steps {
            display: grid;
            gap: 8px;
            padding: 0 18px 16px;
        }
        .tx-trade-process-step {
            display: flex;
            align-items: center;
            gap: 9px;
            color: #cbd5e1;
            font-size: 12px;
            font-weight: 800;
        }
        .tx-trade-process-dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: #22d3ee;
            box-shadow: 0 0 0 5px rgba(34, 211, 238, 0.12);
            animation: txTradePulse 1.1s infinite ease-in-out;
        }
        .tx-trade-process-step.done .tx-trade-process-dot {
            background: #34d399;
            box-shadow: 0 0 0 5px rgba(52, 211, 153, 0.12);
            animation: none;
        }
        .tx-trade-process-step.error .tx-trade-process-dot {
            background: #fb7185;
            box-shadow: 0 0 0 5px rgba(251, 113, 133, 0.12);
            animation: none;
        }
        .tx-trade-process-bar {
            height: 3px;
            width: 100%;
            background: rgba(148, 163, 184, 0.12);
            overflow: hidden;
        }
        .tx-trade-process-bar span {
            display: block;
            width: 46%;
            height: 100%;
            background: linear-gradient(90deg, #22d3ee, #818cf8, #22d3ee);
            animation: txTradeProcessBar 1.05s linear infinite;
        }
        .tx-trade-process-card.success .tx-trade-process-bar span {
            width: 100%;
            background: #34d399;
            animation: none;
        }
        .tx-trade-process-card.error .tx-trade-process-bar span {
            width: 100%;
            background: #fb7185;
            animation: none;
        }
        @keyframes txTradeProcessSlideIn {
            from { opacity: 0; transform: translateX(18px) translateY(-8px); }
            to { opacity: 1; transform: translateX(0) translateY(0); }
        }
        @keyframes txTradeProcessBar {
            from { transform: translateX(-100%); }
            to { transform: translateX(230%); }
        }
        @keyframes txTradePulse {
            0%, 100% { transform: scale(0.90); opacity: 0.75; }
            50% { transform: scale(1.12); opacity: 1; }
        }
        @media (max-width: 640px) {
            .tx-trade-process-wrap {
                top: 72px;
                right: 12px;
                left: 12px;
                width: auto;
            }
        }
    `;
    document.head.appendChild(style);
}

function txShowTradeProcessPanel({ title = "Processing Trade", message = "Please wait while the trade is processed.", steps = [] } = {}) {
    txEnsureTradeProcessPanelStyles();

    const oldPanel = document.getElementById("txTradeProcessPanel");
    if (oldPanel) oldPanel.remove();

    const wrapper = document.createElement("div");
    wrapper.id = "txTradeProcessPanel";
    wrapper.className = "tx-trade-process-wrap";

    const initialSteps = steps.length ? steps : ["Sending order to backend", "Syncing wallet and positions", "Updating trading table"];

    wrapper.innerHTML = `
        <div class="tx-trade-process-card">
            <div class="tx-trade-process-head">
                <div class="tx-trade-process-icon" data-tx-trade-process-icon>↻</div>
                <div>
                    <h3 class="tx-trade-process-title" data-tx-trade-process-title>${txEscapeHtml(title)}</h3>
                    <p class="tx-trade-process-message" data-tx-trade-process-message>${txEscapeHtml(message)}</p>
                </div>
            </div>
            <div class="tx-trade-process-steps" data-tx-trade-process-steps>
                ${initialSteps.map((step, index) => `
                    <div class="tx-trade-process-step ${index === 0 ? "" : "pending"}" data-step-index="${index}">
                        <span class="tx-trade-process-dot"></span>
                        <span>${txEscapeHtml(step)}</span>
                    </div>
                `).join("")}
            </div>
            <div class="tx-trade-process-bar"><span></span></div>
        </div>
    `;

    document.body.appendChild(wrapper);

    const card = wrapper.querySelector(".tx-trade-process-card");
    const icon = wrapper.querySelector("[data-tx-trade-process-icon]");
    const titleEl = wrapper.querySelector("[data-tx-trade-process-title]");
    const messageEl = wrapper.querySelector("[data-tx-trade-process-message]");

    let autoCloseTimer = null;

    function update({ title: nextTitle, message: nextMessage, activeStep = null } = {}) {
        if (nextTitle && titleEl) titleEl.textContent = nextTitle;
        if (nextMessage && messageEl) messageEl.textContent = nextMessage;

        if (activeStep !== null) {
            wrapper.querySelectorAll("[data-step-index]").forEach((step) => {
                const index = Number(step.getAttribute("data-step-index"));
                step.classList.toggle("done", index < activeStep);
                step.classList.toggle("pending", index > activeStep);
            });
        }
    }

    function finish(type, nextTitle, nextMessage, closeDelay = 1800) {
        if (autoCloseTimer) window.clearTimeout(autoCloseTimer);
        card?.classList.remove("success", "error");
        card?.classList.add(type);
        icon?.classList.remove("success", "error");
        icon?.classList.add(type);
        if (icon) icon.textContent = type === "success" ? "✓" : "!";
        update({ title: nextTitle, message: nextMessage, activeStep: initialSteps.length });
        wrapper.querySelectorAll("[data-step-index]").forEach((step) => step.classList.add(type === "success" ? "done" : "error"));
        autoCloseTimer = window.setTimeout(() => wrapper.remove(), closeDelay);
    }

    return {
        update,
        success(nextMessage = "Trade synced successfully.") {
            finish("success", "Trade Updated", nextMessage, 1700);
        },
        error(nextMessage = "Unable to process trade.") {
            finish("error", "Trade Failed", nextMessage, 2600);
        },
        close() {
            if (autoCloseTimer) window.clearTimeout(autoCloseTimer);
            wrapper.remove();
        }
    };
}

function txSetActiveBottomTab(tab, render = true) {
    if (!tab) return;

    state.activeBottomTab = tab;

    document.querySelectorAll("[data-terminal-tab]").forEach((button) => {
        button.classList.toggle("active", button.getAttribute("data-terminal-tab") === tab);
    });

    if (render) {
        renderActiveBackendTableFromCache();
    }
}

function txUpsertCacheItem(list, item) {
    if (!Array.isArray(list)) return [];
    if (!item) return list;

    const itemId = txGetId(item);
    if (!itemId) {
        return [item, ...list];
    }

    const next = list.filter((row) => txGetId(row) !== itemId);
    return [item, ...next];
}

function txRemoveCacheItem(list, itemOrId) {
    if (!Array.isArray(list)) return [];
    const id = typeof itemOrId === "string" ? itemOrId : txGetId(itemOrId);
    if (!id) return list;
    return list.filter((row) => txGetId(row) !== id);
}

function txIsOpenOrderStatus(status) {
    return ["open", "pending", "pending_trigger", "queued"].includes(String(status || "").toLowerCase());
}

function txApplyImmediateOrderResponse(response, payload = {}) {
    const data = response?.data || {};
    const order = data.order || data.created_order || null;
    const position = data.position || null;
    const trade = data.trade || null;
    const executionStatus = String(data.execution?.status || order?.status || "").toLowerCase();

    if (order) {
        TX_BACKEND_FUTURES.orders = txUpsertCacheItem(TX_BACKEND_FUTURES.orders || [], order);

        if (txIsOpenOrderStatus(order.status) && executionStatus !== "filled") {
            TX_BACKEND_FUTURES.openOrders = txUpsertCacheItem(TX_BACKEND_FUTURES.openOrders || [], order);
        } else {
            TX_BACKEND_FUTURES.openOrders = txRemoveCacheItem(TX_BACKEND_FUTURES.openOrders || [], order);
        }
    }

    if (position) {
        TX_BACKEND_FUTURES.positions = txUpsertCacheItem(TX_BACKEND_FUTURES.positions || [], position);
    }

    if (trade) {
        TX_BACKEND_FUTURES.trades = txUpsertCacheItem(TX_BACKEND_FUTURES.trades || [], trade);
    }

    const filled = Boolean(position || trade || executionStatus === "filled");
    const payloadType = String(payload.order_type || "").toLowerCase();

    if (filled) {
        txSetActiveBottomTab("positions", false);
    } else if (["limit", "stop_limit", "stop_market"].includes(payloadType)) {
        txSetActiveBottomTab("openOrders", false);
    }

    updateWalletUI();

    // Avoid full table repaint after Buy/Sell success. The optimistic row is
    // already visible, and the backend row is synced in place, so repainting the
    // entire bottom table causes the position area to disappear/reappear.
    if (state.activeBottomTab === "positions" || state.activeBottomTab === "openOrders") {
        txUpdateVisibleRowsInPlace();
        txUpdatePositionsDomCount();
    } else {
        renderActiveBackendTableFromCache();
    }
}

async function txWaitForBackendDataIdle(maxWaitMs = 2200) {
    const startedAt = Date.now();

    while (TX_BACKEND_FUTURES.dataLoading && Date.now() - startedAt < maxWaitMs) {
        await txDelay(120);
    }
}

async function txForceBackendRefreshAfterAction() {
    if (!isLoggedIn() || !txApiReady()) return;
    await txWaitForBackendDataIdle(900);
    await refreshBackendFuturesData(true);
    txRefreshVisibleTradingRows(true);
    txUpdatePositionsDomCount();
}

function txRefreshFuturesDataInBackground() {
    if (!isLoggedIn() || !txApiReady()) return;

    // Immediate microtask sync: no artificial timer and no browser-side order
    // processing request. The central backend engine owns order execution.
    Promise.resolve().then(async () => {
        try {
            await txWaitForBackendDataIdle(900);
            TX_BACKEND_FUTURES.silentBackgroundSync = true;
            await refreshBackendFuturesData(true);
            txUpdateVisibleRowsInPlace();
            txUpdatePositionsDomCount();
        } catch (error) {
            console.warn("Background futures sync skipped:", error);
        } finally {
            TX_BACKEND_FUTURES.silentBackgroundSync = false;
        }
    });
}

function txFormatDateTime(value) {
    if (!value) {
        return "--";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "--";
    }

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function txFormatSymbol(symbol) {
    if (!symbol) return "--";
    const cleanSymbol = String(symbol).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cleanSymbol === "XAUUSD" || cleanSymbol === "GOLDUSD") {
        return "XAUUSD";
    }
    if (cleanSymbol.endsWith("USDT")) {
        const base = cleanSymbol.replace("USDT", "");
        return `${base}-USDT`;
    }
    const pair = pairs.find((item) => item.symbol === cleanSymbol);
    if (pair) {
        return pair.label;
    }
    return cleanSymbol;
}

function txFormatSide(side) {
    const cleanSide = String(side || "").toLowerCase();

    if (cleanSide === "buy" || cleanSide === "long") {
        return "BUY";
    }

    if (cleanSide === "sell" || cleanSide === "short") {
        return "SELL";
    }

    return String(side || "--").toUpperCase();
}

function txSideClass(side) {
    const cleanSide = String(side || "").toLowerCase();
    return cleanSide === "buy" || cleanSide === "long"
        ? "text-emerald-400"
        : "text-red-400";
}

function txStatusClass(status) {
    const cleanStatus = String(status || "").toLowerCase();

    if (["filled", "closed", "completed"].includes(cleanStatus)) {
        return "text-emerald-400";
    }

    if (["cancelled", "failed", "rejected"].includes(cleanStatus)) {
        return "text-red-400";
    }

    if (["open", "pending_trigger"].includes(cleanStatus)) {
        return "text-cyan-300";
    }

    return "text-slate-300";
}

function txNormalizeProviderSymbol(symbol) {
    const cleanSymbol = normalizeSymbol(symbol || "");
    if (cleanSymbol === "XAUUSDT") {
        return "XAUUSD";
    }
    return cleanSymbol;
}

function txGetProviderSymbol(symbol) {
    const cleanSymbol = txNormalizeProviderSymbol(symbol || "");
    return cleanSymbol === "XAUUSD" ? "XAUUSDT" : cleanSymbol;
}

function txStoreLivePrice(symbol, price) {
    const numericPrice = txToNumber(price, 0);
    const providerSymbol = normalizeSymbol(symbol || "");

    if (!providerSymbol || numericPrice <= 0) {
        return;
    }

    state.lastPrices[providerSymbol] = numericPrice;

    if (providerSymbol === "XAUUSDT") {
        state.lastPrices.XAUUSD = numericPrice;
    }

    const internalSymbol = txNormalizeProviderSymbol(providerSymbol);
    if (internalSymbol && internalSymbol !== providerSymbol) {
        state.lastPrices[internalSymbol] = numericPrice;
    }

    if (internalSymbol === state.currentSymbol || providerSymbol === state.currentSymbol) {
        state.currentPrice = numericPrice;
    }
}

function txGetLivePriceForSymbol(symbol, fallback = 0) {
    const cleanSymbol = txNormalizeProviderSymbol(symbol);
    const providerSymbol = txGetProviderSymbol(cleanSymbol);

    const directPrice = txToNumber(state.lastPrices[cleanSymbol], 0);
    const providerPrice = txToNumber(state.lastPrices[providerSymbol], 0);

    if (directPrice > 0) {
        return directPrice;
    }

    if (providerPrice > 0) {
        return providerPrice;
    }

    return txToNumber(fallback, 0);
}

function txRefreshVisibleTradingRows(force = false) {
    const now = Date.now();
    const lastRenderAt = txToNumber(state.liveRowsLastRenderAt, 0);
    const minDelay = Math.max(100, TX_LIVE_ROW_REFRESH_MS);

    if (!force && lastRenderAt > 0 && now - lastRenderAt < minDelay) {
        if (!state.liveRowsScheduledTimer) {
            const delay = minDelay - (now - lastRenderAt);
            state.liveRowsScheduledTimer = window.setTimeout(() => {
                state.liveRowsScheduledTimer = null;
                txRefreshVisibleTradingRows(true);
            }, Math.max(50, delay));
        }
        return;
    }

    state.liveRowsLastRenderAt = now;
    updateWalletUI();

    if (state.activeBottomTab === "positions" || state.activeBottomTab === "openOrders") {
        txUpdateVisibleRowsInPlace();
    }

    txCheckTpSlTriggers();

    
}

function txFormatFastPrice(price) {
    const numeric = txToNumber(price, 0);
    if (numeric <= 0) return "--";
    return formatNumber(numeric, numeric < 1 ? 6 : 2);
}

function txApplyPnlCell(cell, pnl, currency = "USDT") {
    if (!cell) return;
    const value = txToNumber(pnl, 0);
    cell.textContent = formatPnlValue(value, currency === "INR" ? "INR" : "USD");
    cell.style.color = value >= 0 ? "#22c55e" : "#ff6b6b";
}

function txUpdateVisibleRowsInPlace() {
    if (!elements.terminalTable) {
        return false;
    }

    let updated = 0;

    (TX_BACKEND_FUTURES.positions || []).forEach((position) => {
        const positionId = txGetId(position);
        if (!positionId) return;

        const symbol = position.symbol;
        const entryPrice = txToNumber(position.entry_price ?? position.entryPrice, 0);
        const backendMarkPrice = txToNumber(position.mark_price ?? position.current_price, 0);
        const livePrice = txGetLivePriceForSymbol(symbol, backendMarkPrice || entryPrice);
        const rawPnl = calculatePositionPnl(position);

        // Detect currency of the position
        const posCurrency = String(position.currency || "USDT").toUpperCase();
        const rate = posCurrency === "INR" ? (TX_FUTURES_USDT_RATE || 88.50) : 1.0;
        const pnl = rawPnl; // Always in USD/USDT

        const markCells = elements.terminalTable.querySelectorAll(`[data-live-position-mark="${txSafeCssId(positionId)}"]`);
        markCells.forEach(cell => {
            if (livePrice > 0) {
                cell.textContent = txFormatFastPrice(livePrice);
                updated += 1;
            }
        });

        const pnlCell = elements.terminalTable.querySelector(`[data-live-position-pnl="${txSafeCssId(positionId)}"]`);
        if (pnlCell) {
            txApplyPnlCell(pnlCell, pnl, "USD");
            updated += 1;
        }

        const mobilePnlCells = elements.terminalTable.querySelectorAll(`[data-live-position-mobile-pnl="${txSafeCssId(positionId)}"]`);
        mobilePnlCells.forEach(cell => {
            const rawMargin = txToNumber(position.margin_amount ?? position.margin, 0);
            const pnlPercent = rawMargin > 0 ? (pnl / rawMargin) * 100 : 0;
            const pnlPercentText = (pnlPercent >= 0 ? "+" : "") + pnlPercent.toFixed(2) + "%";
            const sign = pnl >= 0 ? "+" : "-";
            const absPnlText = `$${Math.abs(pnl).toFixed(2)}`;
            cell.textContent = `${sign}${absPnlText} (${pnlPercentText})`;
            cell.style.color = pnl >= 0 ? "#22c55e" : "#ff6b6b";
            updated += 1;
        });
    });

    (TX_BACKEND_FUTURES.openOrders || []).forEach((order) => {
        const orderId = txGetId(order);
        if (!orderId) return;

        const orderPrice = txToNumber(order.limit_price ?? order.average_fill_price ?? order.estimated_price ?? order.price, 0);
        const backendMark = txToNumber(order.mark_price ?? order.current_price, 0);
        const livePrice = txGetLivePriceForSymbol(order.symbol, backendMark || orderPrice);

        const markCells = elements.terminalTable.querySelectorAll(`[data-live-order-mark="${txSafeCssId(orderId)}"]`);
        markCells.forEach(cell => {
            if (livePrice > 0) {
                cell.textContent = txFormatFastPrice(livePrice);
                updated += 1;
            }
        });
    });

    return updated > 0;
}

function txGetWalletBucket(bucketName) {
    const wallet = TX_BACKEND_FUTURES.wallet || {};
    const bucket = wallet && typeof wallet === "object" ? wallet[bucketName] : null;
    return bucket && typeof bucket === "object" ? bucket : {};
}

function txGetTradingWalletBucket() {
    const wallet = TX_BACKEND_FUTURES.wallet || {};
    const tradingWallet = txGetWalletBucket("trading_wallet");

    if (Object.keys(tradingWallet).length) {
        return tradingWallet;
    }

    return wallet || {};
}

function txGetMainWalletBucket() {
    const selectedCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
    if (selectedCurrency === "INR") {
        return txGetWalletBucket("main_wallet_inr");
    } else {
        return txGetWalletBucket("main_wallet_usdt");
    }
}

function getWallet() {
    const wallet = TX_BACKEND_FUTURES.wallet || {};
    const tradingWallet = txGetTradingWalletBucket();
    const hasTradingWallet = Object.keys(tradingWallet).length > 0;

    // Futures trading must use Trading Wallet only. Never fall back to Main
    // Wallet for tradeable available balance; fallback is only for old projects
    // that do not have nested trading_wallet yet.
    const available = hasTradingWallet
        ? txToNumber(tradingWallet.available_balance, 0)
        : txToNumber(wallet.available_balance ?? wallet.available, 0);
    const locked = hasTradingWallet
        ? txToNumber(tradingWallet.locked_balance, 0)
        : txToNumber(wallet.locked_balance ?? wallet.usedMargin, 0);
    const rawTotal = hasTradingWallet ? tradingWallet.total_balance : wallet.total_balance;
    const parsedTotal = txToNumber(rawTotal, NaN);
    const total = Number.isFinite(parsedTotal) ? parsedTotal : (available + locked);

    return {
        available: available,
        usedMargin: locked,
        total: total,
        realizedPnl: txToNumber(wallet.realized_pnl ?? wallet.realizedPnl, 0)
    };
}

function saveWallet(wallet) {
    TX_BACKEND_FUTURES.wallet = wallet;
}

function getPositions() {
    return TX_BACKEND_FUTURES.positions || [];
}

function savePositions(positions) {
    TX_BACKEND_FUTURES.positions = Array.isArray(positions) ? positions : [];
}

function getOrders() {
    return TX_BACKEND_FUTURES.orders || [];
}

function saveOrders(orders) {
    TX_BACKEND_FUTURES.orders = Array.isArray(orders) ? orders : [];
}

function getHistory() {
    return TX_BACKEND_FUTURES.trades || [];
}

function saveHistory(history) {
    TX_BACKEND_FUTURES.trades = Array.isArray(history) ? history : [];
}

async function loadBackendWalletBalance() {
    if (!isLoggedIn()) {
        return;
    }

    if (TX_BACKEND_FUTURES.walletLoading) {
        return;
    }

    try {
        TX_BACKEND_FUTURES.walletLoading = true;

        const response = await txApiRequestWithTimeout("/wallet/balance", {}, 6000);
        TX_BACKEND_FUTURES.wallet = response.data.wallet || response.data || null;
        TX_BACKEND_FUTURES.walletLoaded = true;

        updateWalletUI();
    } catch (error) {
        console.error("Backend wallet balance error:", error);
    } finally {
        TX_BACKEND_FUTURES.walletLoading = false;
    }
}

function txGetTableSignature(tab = state.activeBottomTab) {
    if (tab === "positions") {
        return (TX_BACKEND_FUTURES.positions || [])
            .map((position) => txGetId(position))
            .filter(Boolean)
            .join("|");
    }

    if (tab === "openOrders") {
        return (TX_BACKEND_FUTURES.openOrders || [])
            .map((order) => txGetId(order))
            .filter(Boolean)
            .join("|");
    }

    if (tab === "orderHistory") {
        return (TX_BACKEND_FUTURES.orders || [])
            .map((order) => txGetId(order))
            .filter(Boolean)
            .join("|");
    }

    if (tab === "tradeHistory") {
        return (TX_BACKEND_FUTURES.trades || [])
            .map((trade) => txGetId(trade))
            .filter(Boolean)
            .join("|");
    }

    if (tab === "transactionHistory") {
        return (TX_BACKEND_FUTURES.ledger || [])
            .map((item) => txGetId(item) || `${item.created_at || item.createdAt || ""}-${item.amount || ""}`)
            .filter(Boolean)
            .join("|");
    }

    return "";
}

function txShouldRenderAfterBackendRefresh(force, beforeSignature) {
    const liveTabs = ["positions", "openOrders"];
    const isLiveTab = liveTabs.includes(state.activeBottomTab);

    if (isLiveTab && TX_BACKEND_FUTURES.silentBackgroundSync) {
        return false;
    }

    if (force) {
        return true;
    }

    if (!isLiveTab) {
        return true;
    }

    const afterSignature = txGetTableSignature(state.activeBottomTab);
    return beforeSignature !== afterSignature;
}

async function refreshBackendFuturesData(force = false) {
    if (!isLoggedIn()) {
        return;
    }

    if (!force && (txToNumber(TX_BACKEND_FUTURES.optimisticActionCount, 0) > 0 || Date.now() < txToNumber(TX_BACKEND_FUTURES.suppressAutoRefreshUntil, 0))) {
        return;
    }

    const now = Date.now();
    const isFresh = now - TX_BACKEND_FUTURES.lastDataLoadAt < TX_BACKEND_DATA_REFRESH_MS;

    if (!force && isFresh) {
        return;
    }

    if (TX_BACKEND_FUTURES.dataLoading) {
        return;
    }

    const beforeSignature = txGetTableSignature(state.activeBottomTab);
    const firstLoad = TX_BACKEND_FUTURES.lastDataLoadAt <= 0;

    try {
        TX_BACKEND_FUTURES.dataLoading = true;

        const walletPromise = txApiRequestWithTimeout("/wallet/balance").then((res) => {
            TX_BACKEND_FUTURES.wallet = res.data.wallet || res.data || null;
            TX_BACKEND_FUTURES.walletLoaded = true;
            updateWalletUI();
            return res;
        });

        const activeTab = state.activeBottomTab;
        const loadOrders = (activeTab === "orderHistory" || firstLoad);
        const loadTrades = (activeTab === "tradeHistory" || firstLoad);
        const loadLedger = (activeTab === "transactionHistory" || firstLoad);

        const results = await Promise.allSettled([
            walletPromise,
            txApiRequestWithTimeout("/trading/open-orders"),
            loadOrders ? txApiRequestWithTimeout("/trading/orders") : Promise.resolve({ data: { orders: TX_BACKEND_FUTURES.orders || [] } }),
            txApiRequestWithTimeout("/trading/positions"),
            loadTrades ? txApiRequestWithTimeout("/trading/trades") : Promise.resolve({ data: { trades: TX_BACKEND_FUTURES.trades || [] } }),
            txApiRequestWithTimeout("/trading/pnl-summary"),
            txApiRequestWithTimeout("/trading/risk-summary"),
            loadLedger ? txApiRequestWithTimeout("/wallet/ledger") : Promise.resolve({ data: { ledger: TX_BACKEND_FUTURES.ledger || [] } })
        ]);

        const [walletResult, openOrdersResult, ordersResult, positionsResult, tradesResult, pnlResult, riskResult, ledgerResult] = results;

        if (walletResult.status === "fulfilled") {
            TX_BACKEND_FUTURES.wallet = walletResult.value.data.wallet || walletResult.value.data || null;
            TX_BACKEND_FUTURES.walletLoaded = true;
        }

        if (openOrdersResult.status === "fulfilled") {
            const optimisticOpenOrders = (TX_BACKEND_FUTURES.openOrders || []).filter((order) => {
                const id = txGetId(order);
                return Boolean(order?.__optimistic || String(id).startsWith("LOCAL-ORD-"));
            });
            const serverOpenOrders = (openOrdersResult.value.data.orders || []).filter((order) => {
                return !txIsPendingCancel(txGetId(order));
            });
            TX_BACKEND_FUTURES.openOrders = [
                ...optimisticOpenOrders.filter((order) => !txIsPendingCancel(txGetId(order))),
                ...serverOpenOrders.filter((serverOrder) => {
                    const id = txGetId(serverOrder);
                    return !optimisticOpenOrders.some((localOrder) => txGetId(localOrder) === id);
                })
            ];
        }

        if (ordersResult.status === "fulfilled") {
            TX_BACKEND_FUTURES.orders = ordersResult.value.data.orders || [];
        }

        if (positionsResult.status === "fulfilled") {
            const optimisticPositions = (TX_BACKEND_FUTURES.positions || []).filter((position) => {
                return txIsLocalOptimisticPosition(position);
            });
            const serverPositions = (positionsResult.value.data.positions || []).map((position) => {
                return txEnrichPositionWithTpSl(position);
            }).filter((position) => !txIsPendingClose(txGetId(position)));

            TX_BACKEND_FUTURES.positions = TX_BACKEND_FUTURES.pendingCloseAll
                ? []
                : [
                    ...optimisticPositions.filter((position) => !txIsPendingClose(txGetId(position))),
                    ...serverPositions.filter((serverPosition) => {
                        const id = txGetId(serverPosition);
                        return !optimisticPositions.some((localPosition) => txGetId(localPosition) === id);
                    })
                ];

            try {
                const token = localStorage.getItem("traidiumx_auth_token") || "guest";
                const activeSubId = localStorage.getItem("traidiumx_active_user_id") || "master";
                const cacheKey = "tx_cached_positions_" + token.substring(0, 15) + "_" + activeSubId;
                localStorage.setItem(cacheKey, JSON.stringify(serverPositions));
            } catch (e) {}
        }

        if (tradesResult.status === "fulfilled") {
            TX_BACKEND_FUTURES.trades = tradesResult.value.data.trades || [];
        }

        if (pnlResult.status === "fulfilled") {
            TX_BACKEND_FUTURES.pnlSummary = pnlResult.value.data || null;
        }

        if (riskResult.status === "fulfilled") {
            TX_BACKEND_FUTURES.riskSummary = riskResult.value.data || null;
        }

        if (ledgerResult.status === "fulfilled") {
            TX_BACKEND_FUTURES.ledger = ledgerResult.value.data.ledger || ledgerResult.value.data.transactions || [];
        }

        TX_BACKEND_FUTURES.lastDataLoadAt = Date.now();

        updateWalletUI();
        if (firstLoad || txShouldRenderAfterBackendRefresh(force, beforeSignature)) {
            renderActiveBackendTableFromCache();
        } else {
            txUpdateVisibleRowsInPlace();
        }
    } catch (error) {
        console.error("Backend futures data refresh error:", error);
    } finally {
        TX_BACKEND_FUTURES.dataLoading = false;
    }
}


function goToFuturesWalletAction(action = "deposit") {
    // Backend mode override: keep user on Futures page and open quick wallet modal.
    txOpenFuturesWalletModal(action);
}

function updateWalletUI() {
    if (!isLoggedIn()) {
        if (elements.walletAvailable) {
            elements.walletAvailable.textContent = "Login required";
        }

        if (elements.walletUsed) {
            elements.walletUsed.textContent = "0.00 USD";
        }

        if (elements.walletPnl) {
            elements.walletPnl.textContent = "+0.00 USD";
            elements.walletPnl.className = "text-3xl font-black text-slate-400";
        }

        if (elements.walletTotalProfit) {
            elements.walletTotalProfit.textContent = "+0.00 USD";
        }

        if (elements.walletTotalLoss) {
            elements.walletTotalLoss.textContent = "0.00 USD";
        }

        if (elements.futuresTotalBalance) {
            elements.futuresTotalBalance.textContent = "$0.00";
        }

        if (elements.futuresEstimatedBalance) {
            elements.futuresEstimatedBalance.textContent = "$0.00";
        }

        if (elements.futuresTradingPnl) {
            elements.futuresTradingPnl.textContent = "+0.00 USD";
            txApplyMoneyCellColor(elements.futuresTradingPnl, 0);
        }

        if (elements.marginRatioBar) {
            elements.marginRatioBar.style.width = "0%";
        }

        txUpdateFuturesWalletModalBalances();
        return;
    }

    if (!TX_BACKEND_FUTURES.walletLoaded && !TX_BACKEND_FUTURES.walletLoading) {
        loadBackendWalletBalance();
    }

    const wallet = getWallet();
    const pnlSummary = TX_BACKEND_FUTURES.pnlSummary || {};
    const livePositions = TX_BACKEND_FUTURES.positions || [];

    // Filter positions based on active navbar currency
    const activeNavbarCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const filteredPositions = livePositions.filter((position) => {
        const posCurr = (position.currency || "USDT").toUpperCase();
        if (activeNavbarCurrency === "INR") {
            return posCurr === "INR";
        } else {
            return posCurr === "USDT" || posCurr === "USD";
        }
    });

    const liveUnrealizedPnl = filteredPositions.reduce((total, position) => {
        return total + calculatePositionPnl(position);
    }, 0);
    const unrealizedPnl = filteredPositions.length
        ? liveUnrealizedPnl
        : 0;

    // Calculate Overall P&L (USDT + INR combined) for the right-side Overall Profit / Loss card
    const overallLiveUnrealizedPnl = livePositions.reduce((total, position) => {
        return total + calculatePositionPnl(position);
    }, 0);
    const overallUnrealizedPnl = livePositions.length
        ? overallLiveUnrealizedPnl
        : txToNumber(pnlSummary.total_unrealized_pnl, 0);

    const usedMargin = filteredPositions.length
        ? filteredPositions.reduce((total, position) => total + txToNumber(position.margin_amount, 0), 0)
        : 0;

    const overallPnlBreakdown = txGetOverallPnlBreakdown(livePositions);
    const overallTotalProfit = livePositions.length
        ? overallPnlBreakdown.totalProfit
        : Math.max(overallUnrealizedPnl, 0);
    const overallTotalLoss = livePositions.length
        ? overallPnlBreakdown.totalLoss
        : Math.max(Math.abs(Math.min(overallUnrealizedPnl, 0)), 0);

    const filteredPnlBreakdown = txGetOverallPnlBreakdown(filteredPositions);
    const filteredTotalProfit = filteredPositions.length
        ? filteredPnlBreakdown.totalProfit
        : Math.max(unrealizedPnl, 0);
    const filteredTotalLoss = filteredPositions.length
        ? filteredPnlBreakdown.totalLoss
        : Math.max(Math.abs(Math.min(unrealizedPnl, 0)), 0);

    if (elements.walletAvailable) {
        elements.walletAvailable.textContent = `${formatNumber(wallet.available, 2)} USD`;
    }

    if (elements.walletUsed) {
        elements.walletUsed.textContent = `${formatNumber(usedMargin, 2)} USD`;
    }

    if (elements.walletTotalProfit) {
        elements.walletTotalProfit.textContent = `+${formatNumber(filteredTotalProfit, 2)} USD`;
        txApplyMoneyCellColor(elements.walletTotalProfit, filteredTotalProfit);
    }

    if (elements.walletTotalLoss) {
        elements.walletTotalLoss.textContent = filteredTotalLoss > 0
            ? `-${formatNumber(filteredTotalLoss, 2)} USD`
            : "0.00 USD";
        txApplyMoneyCellColor(elements.walletTotalLoss, filteredTotalLoss > 0 ? -filteredTotalLoss : 0);
    }

    if (elements.walletPnl) {
        elements.walletPnl.textContent = `${overallUnrealizedPnl >= 0 ? "+" : ""}${formatNumber(overallUnrealizedPnl, 2)} USD`;
        elements.walletPnl.className = overallUnrealizedPnl >= 0
            ? "text-3xl font-black text-emerald-400"
            : "text-3xl font-black text-red-400";
    }

    const mainWallet = txGetMainWalletBucket();
    const tradingAvailableForDisplay = txToNumber(wallet.available, 0);
    const mainAvailable = txToNumber(mainWallet.available_balance, 0);

    if (elements.futuresTotalBalance) {
        elements.futuresTotalBalance.textContent = formatFuturesUsd(tradingAvailableForDisplay, 2);
        elements.futuresTotalBalance.title = "Trading Wallet available balance. Futures trades use this wallet only.";
    }

    if (elements.futuresEstimatedBalance) {
        const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
        const formatted = formatNumber(mainAvailable, 2);
        elements.futuresEstimatedBalance.textContent = primaryCurrency === "INR" ? `₹${formatted}` : `$${formatted}`;
        elements.futuresEstimatedBalance.title = "Main Wallet balance. Deposit/withdraw here, then transfer to Trading Wallet to trade.";
        elements.futuresEstimatedBalance.classList.remove("text-red-400");
        elements.futuresEstimatedBalance.classList.add("text-cyan-300");
    }

    if (elements.futuresTradingPnl) {
        elements.futuresTradingPnl.textContent = `${unrealizedPnl >= 0 ? "+" : ""}${formatNumber(unrealizedPnl, 2)} USD`;
        elements.futuresTradingPnl.title = "Live P&L from open Futures positions. Close profit/loss settles back into Trading Wallet.";
        txApplyMoneyCellColor(elements.futuresTradingPnl, unrealizedPnl);
    }

    const mobPnlDisp = document.getElementById("mobileWalletPnlDisplay");
    const mobTradBal = document.getElementById("mobileWalletTradingBalance");
    const mobMainBal = document.getElementById("mobileWalletMainBalance");

    if (mobPnlDisp) {
        const dispVal = unrealizedPnl;
        mobPnlDisp.textContent = `P/L ${dispVal >= 0 ? "+" : ""}$${formatNumber(Math.abs(dispVal), 2)}`;
        txApplyMoneyCellColor(mobPnlDisp, unrealizedPnl);
    }
    if (mobTradBal && elements.futuresTotalBalance) {
        mobTradBal.textContent = elements.futuresTotalBalance.textContent;
    }
    if (mobMainBal && elements.futuresEstimatedBalance) {
        mobMainBal.textContent = elements.futuresEstimatedBalance.textContent;
    }

    if (elements.marginRatioBar) {
        const ratio = wallet.total <= 0
            ? 0
            : Math.min(100, (usedMargin / wallet.total) * 100);

        elements.marginRatioBar.style.width = `${ratio}%`;
    }

    const riskSummary = TX_BACKEND_FUTURES.riskSummary || {};
    const marginBalanceValue = document.getElementById("marginBalanceValue");
    const maintenanceMarginValue = document.getElementById("maintenanceMarginValue");

    const totalMargin = txToNumber(pnlSummary.total_margin ?? usedMargin, usedMargin);
    const marginBalance = txToNumber(
        riskSummary.margin_balance ?? riskSummary.total_margin_balance,
        wallet.total + unrealizedPnl
    );
    const maintenanceMargin = txToNumber(
        riskSummary.maintenance_margin ?? riskSummary.total_maintenance_margin,
        totalMargin > 0 ? totalMargin * 0.005 : 0
    );

    if (marginBalanceValue) {
        marginBalanceValue.textContent = `${formatNumber(marginBalance, 4)} USD`;
    }

    if (maintenanceMarginValue) {
        maintenanceMarginValue.textContent = `${formatNumber(maintenanceMargin, 4)} USD`;
    }

    txUpdateFuturesWalletModalBalances();
}

function calculatePositionPnl(position) {
    const entry = txToNumber(position.entry_price ?? position.entryPrice, 0);
    const backendMarkPrice = txToNumber(position.mark_price ?? position.current_price, 0);
    const positionSymbol = normalizeSymbol(position.symbol || "");
    const current = txGetLivePriceForSymbol(positionSymbol, backendMarkPrice || entry);
    const qty = txToNumber(position.quantity ?? position.qty, 0);
    const side = String(position.position_side ?? position.side ?? "").toLowerCase();

    if (!entry || !qty || !current) {
        return txToNumber(position.unrealized_pnl, 0);
    }

    if (side === "long" || side === "buy") {
        return (current - entry) * qty;
    }

    if (side === "short" || side === "sell") {
        return (entry - current) * qty;
    }

    return txToNumber(position.unrealized_pnl, 0);
}

function txGetOverallPnlBreakdown(customPositions) {
    const positions = customPositions || TX_BACKEND_FUTURES.positions || [];
    let totalProfit = 0;
    let totalLoss = 0;
    let netPnl = 0;

    positions.forEach((position) => {
        const pnl = calculatePositionPnl(position);
        if (!Number.isFinite(pnl)) return;

        netPnl += pnl;
        if (pnl > 0) {
            totalProfit += pnl;
        } else if (pnl < 0) {
            totalLoss += Math.abs(pnl);
        }
    });

    return {
        totalProfit,
        totalLoss,
        netPnl
    };
}

function txApplyMoneyCellColor(element, value, positiveClass = "text-emerald-400", negativeClass = "text-red-400") {
    if (!element) return;

    element.classList.remove("text-emerald-400", "text-red-400", "text-slate-400");

    if (value > 0) {
        element.classList.add(positiveClass);
    } else if (value < 0) {
        element.classList.add(negativeClass);
    } else {
        element.classList.add("text-slate-400");
    }
}

function getUnrealizedPnl() {
    return getPositions().reduce((total, position) => {
        return total + calculatePositionPnl(position);
    }, 0);
}

function processLimitOrders() {
    // Server-side Futures engine owns pending-order execution.
}

function getOrderPrice() {
    if (state.orderType === "LIMIT" || state.orderType === "STOP_LIMIT") {
        return Number(elements.limitPriceInput?.value || 0);
    }

    let price = Number(state.currentPrice || 0);
    if (price <= 0 && elements.markPrice) {
        const text = (elements.markPrice.textContent || "").replace(/[^0-9.]/g, "");
        price = Number(text || 0);
    }
    return price;
}

function placeOrderPayload() {
    const qty = getQuantity();
    const leverage = getLeverage();
    const limitPrice = Number(elements.limitPriceInput?.value || 0);
    const stopPrice = Number(document.getElementById("stopPriceInput")?.value || 0);
    const takeProfit = Number(document.getElementById("takeProfitInput")?.value || 0);
    const stopLoss = Number(document.getElementById("stopLossInput")?.value || 0);
    const tpSlEnabled = txIsTpSlEnabled();

    const orderType = String(state.orderType || "MARKET").toLowerCase();

    const livePrice = Number(state.currentPrice || elements.markPrice?.textContent?.replace(/[^0-9.]/g, "") || 0);

    const payload = {
        symbol: state.currentSymbol,
        side: String(state.side || "BUY").toLowerCase(),
        order_type: orderType,
        quantity: qty,
        leverage: leverage,
        margin_mode: state.marginMode || "isolated",
        reduce_only: false,
        has_tp_sl: tpSlEnabled,
        current_price: livePrice > 0 ? livePrice : undefined
    };

    if (orderType === "limit" || orderType === "stop_limit") {
        payload.limit_price = limitPrice;
    }

    if (orderType === "stop_limit" || orderType === "stop_market") {
        payload.stop_price = stopPrice;
    }

    if (tpSlEnabled && takeProfit > 0) {
        payload.take_profit = takeProfit;
    }

    if (tpSlEnabled && stopLoss > 0) {
        payload.stop_loss = stopLoss;
    }

    return payload;
}


function txFastSnapshotArray(value) {
    return Array.isArray(value) ? value.slice() : [];
}

function txFastSnapshotObject(value) {
    return value && typeof value === "object" ? { ...value } : null;
}

function txCloneFuturesState() {
    return {
        wallet: txFastSnapshotObject(TX_BACKEND_FUTURES.wallet),
        orders: txFastSnapshotArray(TX_BACKEND_FUTURES.orders),
        openOrders: txFastSnapshotArray(TX_BACKEND_FUTURES.openOrders),
        positions: txFastSnapshotArray(TX_BACKEND_FUTURES.positions),
        trades: txFastSnapshotArray(TX_BACKEND_FUTURES.trades),
        pnlSummary: txFastSnapshotObject(TX_BACKEND_FUTURES.pnlSummary),
        riskSummary: txFastSnapshotObject(TX_BACKEND_FUTURES.riskSummary),
        activeBottomTab: state.activeBottomTab
    };
}

function txRestoreFuturesState(snapshot) {
    if (!snapshot) return;
    TX_BACKEND_FUTURES.wallet = snapshot.wallet;
    TX_BACKEND_FUTURES.orders = snapshot.orders || [];
    TX_BACKEND_FUTURES.openOrders = snapshot.openOrders || [];
    TX_BACKEND_FUTURES.positions = snapshot.positions || [];
    TX_BACKEND_FUTURES.trades = snapshot.trades || [];
    TX_BACKEND_FUTURES.pnlSummary = snapshot.pnlSummary;
    TX_BACKEND_FUTURES.riskSummary = snapshot.riskSummary;
    TX_BACKEND_FUTURES.walletLoaded = Boolean(snapshot.wallet);
    txSetActiveBottomTab(snapshot.activeBottomTab || "positions", false);
    updateWalletUI();
    renderActiveBackendTableFromCache();
    txRefreshVisibleTradingRows(true);
}

function txBeginOptimisticAction() {
    TX_BACKEND_FUTURES.optimisticActionCount = txToNumber(TX_BACKEND_FUTURES.optimisticActionCount, 0) + 1;
    TX_BACKEND_FUTURES.suppressAutoRefreshUntil = Date.now() + 4500;
    TX_BACKEND_FUTURES.lastDataLoadAt = Date.now();
}

function txEndOptimisticAction() {
    TX_BACKEND_FUTURES.optimisticActionCount = Math.max(0, txToNumber(TX_BACKEND_FUTURES.optimisticActionCount, 0) - 1);
    TX_BACKEND_FUTURES.suppressAutoRefreshUntil = Date.now() + 800;
}

function txEnsurePendingActionStores() {
    if (!TX_BACKEND_FUTURES.pendingClosePositionIds || typeof TX_BACKEND_FUTURES.pendingClosePositionIds !== "object") {
        TX_BACKEND_FUTURES.pendingClosePositionIds = Object.create(null);
    }
    if (!TX_BACKEND_FUTURES.pendingCancelOrderIds || typeof TX_BACKEND_FUTURES.pendingCancelOrderIds !== "object") {
        TX_BACKEND_FUTURES.pendingCancelOrderIds = Object.create(null);
    }
}

function txSetPendingClose(positionId, pending = true) {
    txEnsurePendingActionStores();
    const id = String(positionId || "");
    if (!id) return;
    if (pending) TX_BACKEND_FUTURES.pendingClosePositionIds[id] = true;
    else delete TX_BACKEND_FUTURES.pendingClosePositionIds[id];
}

function txIsPendingClose(positionId) {
    txEnsurePendingActionStores();
    return Boolean(TX_BACKEND_FUTURES.pendingCloseAll || TX_BACKEND_FUTURES.pendingClosePositionIds[String(positionId || "")]);
}

function txSetPendingCancel(orderId, pending = true) {
    txEnsurePendingActionStores();
    const id = String(orderId || "");
    if (!id) return;
    if (pending) TX_BACKEND_FUTURES.pendingCancelOrderIds[id] = true;
    else delete TX_BACKEND_FUTURES.pendingCancelOrderIds[id];
}

function txIsPendingCancel(orderId) {
    txEnsurePendingActionStores();
    return Boolean(TX_BACKEND_FUTURES.pendingCancelOrderIds[String(orderId || "")]);
}

function txRunAfterImmediatePaint(task) {
    const run = () => {
        try {
            const result = task();
            if (result && typeof result.catch === "function") {
                result.catch((error) => console.error("Futures background action failed:", error));
            }
        } catch (error) {
            console.error("Futures background action failed:", error);
        }
    };

    if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(run);
    } else {
        Promise.resolve().then(run);
    }
}

function txEnsureTpSlStores() {
    if (!TX_BACKEND_FUTURES.tpSlClosingIds || typeof TX_BACKEND_FUTURES.tpSlClosingIds !== "object") {
        TX_BACKEND_FUTURES.tpSlClosingIds = Object.create(null);
    }
}

function txIsTpSlEnabled() {
    return Boolean(document.getElementById("tpSlCheckbox")?.checked);
}


function txPositionIsShort(side) {
    const value = String(side || "").toLowerCase();
    return value.includes("sell") || value.includes("short");
}

function txGetTpSlNumbers(source = {}) {
    return {
        takeProfit: txToNumber(
            source.take_profit ?? source.takeProfit ?? source.tp_price ?? source.tpPrice ?? source.take_profit_price,
            0
        ),
        stopLoss: txToNumber(
            source.stop_loss ?? source.stopLoss ?? source.sl_price ?? source.slPrice ?? source.stop_loss_price,
            0
        )
    };
}

function txExpectedEntryPriceForPayload(payload = {}) {
    const orderType = String(payload.order_type || state.orderType || "market").toLowerCase();

    if (orderType === "limit" || orderType === "stop_limit") {
        return txToNumber(payload.limit_price, 0);
    }

    return txToNumber(state.currentPrice || payload.limit_price, 0);
}

function txValidateTpSlPayload(payload = {}) {
    if (!payload.has_tp_sl) {
        return "";
    }

    const entry = txExpectedEntryPriceForPayload(payload);
    const side = payload.side || state.side;
    const isShort = txPositionIsShort(side);
    const takeProfit = txToNumber(payload.take_profit, 0);
    const stopLoss = txToNumber(payload.stop_loss, 0);

    if (takeProfit <= 0 || stopLoss <= 0) {
        return "Both Take Profit and Stop Loss prices are required when 'Set Take Profit/ Stop Loss' is checked. Please enter values or untick the checkbox.";
    }

    if (entry <= 0) {
        return "Valid entry/mark price required for TP/SL.";
    }

    if (!isShort) {
        if (takeProfit > 0 && takeProfit <= entry) {
            return "For Buy/Long, Take Profit must be above entry price.";
        }

        if (stopLoss > 0 && stopLoss >= entry) {
            return "For Buy/Long, Stop Loss must be below entry price.";
        }
    } else {
        if (takeProfit > 0 && takeProfit >= entry) {
            return "For Sell/Short, Take Profit must be below entry price.";
        }

        if (stopLoss > 0 && stopLoss <= entry) {
            return "For Sell/Short, Stop Loss must be above entry price.";
        }
    }

    return "";
}

function txEnrichPositionWithTpSl(position, source = {}, oldPositionId = "") {
    if (!position) {
        return position;
    }

    txEnsureTpSlStores();

    const positionId = txGetId(position);
    const sourceTpSl = txGetTpSlNumbers(source);
    const positionTpSl = txGetTpSlNumbers(position);
    // Backend position/order data is authoritative. Source is used only for the
    // current API response; no TP/SL value is restored from browser memory.
    const takeProfit = positionTpSl.takeProfit || sourceTpSl.takeProfit;
    const stopLoss = positionTpSl.stopLoss || sourceTpSl.stopLoss;

    const enriched = {
        ...position,
        take_profit: takeProfit || null,
        stop_loss: stopLoss || null,
        takeProfit: takeProfit || null,
        stopLoss: stopLoss || null,
        has_tp_sl: Boolean(takeProfit || stopLoss)
    };

    return enriched;
}

function txTrackPositionTpSl(position, source = {}, oldPositionId = "") {
    return txEnrichPositionWithTpSl(position, source, oldPositionId);
}

function txTpSlTriggerForPosition(position, markPrice = 0) {
    const current = txToNumber(markPrice, 0);
    if (!position || current <= 0) {
        return null;
    }

    const { takeProfit, stopLoss } = txGetTpSlNumbers(position);
    if (takeProfit <= 0 && stopLoss <= 0) {
        return null;
    }

    const side = position.position_side || position.side;
    const isShort = txPositionIsShort(side);

    if (!isShort) {
        if (takeProfit > 0 && current >= takeProfit) {
            return { type: "take_profit", label: "Take Profit", price: takeProfit };
        }

        if (stopLoss > 0 && current <= stopLoss) {
            return { type: "stop_loss", label: "Stop Loss", price: stopLoss };
        }
    } else {
        if (takeProfit > 0 && current <= takeProfit) {
            return { type: "take_profit", label: "Take Profit", price: takeProfit };
        }

        if (stopLoss > 0 && current >= stopLoss) {
            return { type: "stop_loss", label: "Stop Loss", price: stopLoss };
        }
    }

    return null;
}

function txCheckTpSlTriggers() {
    const positions = getPositions();
    if (!positions || !positions.length) return;

    for (const position of positions) {
        const positionId = txGetId(position);
        if (!positionId || txIsPendingClose(positionId)) continue;

        const backendMarkPrice = txToNumber(position.mark_price ?? position.current_price, 0);
        const currentPrice = txGetLivePriceForSymbol(position.symbol, backendMarkPrice || position.entry_price || state.currentPrice);
        if (currentPrice <= 0) continue;

        const trigger = txTpSlTriggerForPosition(position, currentPrice);
        if (trigger) {
            console.log(`[TP/SL Trigger] Position ${positionId} for ${position.symbol} triggered by ${trigger.label} at price ${currentPrice}. (Trigger level: ${trigger.price})`);
            closePosition(positionId, trigger.type);
        }
    }
}


function txBuildOptimisticOrder(payload = {}) {
    const nowIso = new Date().toISOString();
    const id = `LOCAL-ORD-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const orderType = String(payload.order_type || "market").toLowerCase();
    const price = orderType === "market"
        ? txToNumber(state.currentPrice, txToNumber(payload.limit_price, 0))
        : txToNumber(payload.limit_price || state.currentPrice, 0);
    const qty = txToNumber(payload.quantity, 0);
    const leverage = txToNumber(payload.leverage, 1);
    const margin = price > 0 && qty > 0 && leverage > 0 ? (price * qty) / leverage : 0;

    return {
        id,
        order_id: id,
        order_reference: id,
        symbol: payload.symbol || state.currentSymbol,
        side: payload.side || state.side,
        order_type: orderType,
        type: orderType,
        quantity: qty,
        limit_price: orderType === "market" ? 0 : price,
        estimated_price: price,
        average_fill_price: orderType === "market" ? price : 0,
        mark_price: txToNumber(state.currentPrice, price),
        margin_amount: margin,
        leverage,
        take_profit: txToNumber(payload.take_profit, 0) || null,
        stop_loss: txToNumber(payload.stop_loss, 0) || null,
        has_tp_sl: Boolean(payload.has_tp_sl && (txToNumber(payload.take_profit, 0) || txToNumber(payload.stop_loss, 0))),
        status: orderType === "market" ? "filled" : "open",
        created_at: nowIso,
        createdAt: nowIso,
        currency: (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase(),
        __optimistic: true
    };
}


function txEstimateLiquidationPrice(entryPrice, side, leverage) {
    const entry = txToNumber(entryPrice, 0);
    const lev = Math.max(1, txToNumber(leverage, 1));
    if (entry <= 0) return 0;

    const sideText = String(side || "buy").toLowerCase();
    const isShort = sideText.includes("sell") || sideText.includes("short");
    const distance = 0.95 / lev;
    const liqPrice = isShort ? entry * (1 + distance) : entry * (1 - distance);
    return Math.max(0, Number(liqPrice.toFixed(2)));
}

function txBuildOptimisticPosition(payload = {}, order = null) {
    const nowIso = new Date().toISOString();
    const id = `LOCAL-POS-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    
    let price = txToNumber(order?.average_fill_price || order?.estimated_price || state.currentPrice || payload.limit_price, 0);
    const side = String(payload.side || state.side || "buy").toLowerCase();
    const isBuy = side.includes("buy") || side.includes("long");

    // Apply active spread to optimistic position price to prevent UI jumping
    const user = typeof getAuthUser === "function" ? getAuthUser() : null;
    if (user && price > 0) {
        const spreadType = user.active_spread_type || "fixed";
        const spreadValue = Number(user.active_spread_value || user.active_spread_pips || 0);
        if (spreadValue > 0) {
            let adjustment = 0;
            if (spreadType === "percentage") {
                adjustment = price * (spreadValue / 100);
            } else {
                let pip = 0.01;
                if (price < 0.01) pip = 0.000001;
                else if (price < 1.0) pip = 0.0001;
                else if (price < 10.0) pip = 0.001;
                else if (price < 100.0) pip = 0.01;
                else if (price < 1000.0) pip = 0.05;
                else pip = 0.1;
                adjustment = spreadValue * pip;
            }
            if (isBuy) {
                price = price + adjustment;
            } else {
                price = price - adjustment;
            }
        }
    }

    const qty = txToNumber(payload.quantity ?? order?.quantity, 0);
    const leverage = txToNumber(payload.leverage ?? order?.leverage, 1);
    const margin = txToNumber(order?.margin_amount, price > 0 && qty > 0 && leverage > 0 ? (price * qty) / leverage : 0);

    return {
        id,
        position_id: id,
        symbol: payload.symbol || state.currentSymbol,
        position_side: payload.side || state.side,
        side: payload.side || state.side,
        quantity: qty,
        qty,
        entry_price: price,
        entryPrice: price,
        mark_price: txToNumber(state.currentPrice, price),
        current_price: txToNumber(state.currentPrice, price),
        margin_amount: margin,
        margin,
        leverage,
        liquidation_price: txEstimateLiquidationPrice(price, payload.side || state.side, leverage),
        liquidationPrice: txEstimateLiquidationPrice(price, payload.side || state.side, leverage),
        liq_price: txEstimateLiquidationPrice(price, payload.side || state.side, leverage),
        take_profit: txToNumber(payload.take_profit, 0) || null,
        stop_loss: txToNumber(payload.stop_loss, 0) || null,
        takeProfit: txToNumber(payload.take_profit, 0) || null,
        stopLoss: txToNumber(payload.stop_loss, 0) || null,
        has_tp_sl: Boolean(payload.has_tp_sl && (txToNumber(payload.take_profit, 0) || txToNumber(payload.stop_loss, 0))),
        unrealized_pnl: 0,
        status: "open",
        opened_at: nowIso,
        created_at: nowIso,
        currency: (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase(),
        __optimistic: true
    };
}


function txSyncTradingWalletMirrorFields(wallet, available, locked, total) {
    if (!wallet || typeof wallet !== "object") {
        return wallet;
    }

    wallet.available_balance = available;
    wallet.locked_balance = locked;
    wallet.total_balance = total;
    wallet.available = available;
    wallet.usedMargin = locked;
    wallet.total = total;
    wallet.trading_wallet = {
        ...(wallet.trading_wallet || {}),
        available_balance: available,
        locked_balance: locked,
        total_balance: total,
        currency: wallet.currency || "USDT",
        wallet_type: "trading_wallet"
    };

    return wallet;
}

function txEstimateCloseFeeForPosition(position, closePrice) {
    const price = txToNumber(closePrice, txToNumber(position?.mark_price ?? position?.current_price ?? position?.entry_price ?? position?.entryPrice, 0));
    const qty = txToNumber(position?.quantity ?? position?.qty, 0);
    if (price <= 0 || qty <= 0) {
        return 0;
    }
    return Number((price * qty * 0.0004).toFixed(8));
}

function txApplyOptimisticWalletClose(position) {
    if (!position) {
        return;
    }

    const wallet = getWallet();
    const baseWallet = TX_BACKEND_FUTURES.wallet
        ? { ...TX_BACKEND_FUTURES.wallet }
        : {
            available_balance: wallet.available,
            locked_balance: wallet.usedMargin,
            total_balance: wallet.total,
            realized_pnl: wallet.realizedPnl,
            trading_wallet: {
                available_balance: wallet.available,
                locked_balance: wallet.usedMargin,
                total_balance: wallet.total,
                wallet_type: "trading_wallet",
                currency: "USDT"
            }
        };

    const markPrice = txGetLivePriceForSymbol(
        position.symbol,
        txToNumber(position.mark_price ?? position.current_price ?? position.entry_price ?? position.entryPrice, 0)
    );
    const margin = txToNumber(position.margin_amount ?? position.margin, 0);
    const pnl = calculatePositionPnl(position);
    const closeFee = txEstimateCloseFeeForPosition(position, markPrice);
    const currentAvailable = txToNumber(wallet.available, 0);
    const currentLocked = txToNumber(wallet.usedMargin, 0);
    const currentTotal = txToNumber(wallet.total, currentAvailable + currentLocked);

    const releaseMargin = Math.min(Math.max(currentLocked, 0), Math.max(margin, 0));
    const availableAfter = Math.max(0, currentAvailable + releaseMargin + pnl - closeFee);
    const lockedAfter = Math.max(0, currentLocked - releaseMargin);
    const totalAfter = Math.max(0, currentTotal + pnl - closeFee);

    baseWallet.realized_pnl = txToNumber(baseWallet.realized_pnl ?? baseWallet.realizedPnl, 0) + pnl - closeFee;
    txSyncTradingWalletMirrorFields(baseWallet, availableAfter, lockedAfter, totalAfter);

    TX_BACKEND_FUTURES.wallet = baseWallet;
    TX_BACKEND_FUTURES.walletLoaded = true;
}

function txApplyOptimisticWalletCloseMany(positions = []) {
    positions.forEach((position) => txApplyOptimisticWalletClose(position));
}

function txApplyOptimisticWalletOpen(payload = {}, order = null) {
    const wallet = getWallet();
    const margin = txToNumber(order?.margin_amount, 0);

    TX_BACKEND_FUTURES.wallet = TX_BACKEND_FUTURES.wallet
        ? { ...TX_BACKEND_FUTURES.wallet }
        : {
            available_balance: wallet.available,
            locked_balance: wallet.usedMargin,
            total_balance: wallet.total,
            realized_pnl: wallet.realizedPnl
        };

    const nextAvailable = Math.max(0, txToNumber(wallet.available, 0) - margin);
    const nextLocked = txToNumber(wallet.usedMargin, 0) + margin;
    const nextTotal = txToNumber(wallet.total, nextAvailable + nextLocked);

    txSyncTradingWalletMirrorFields(TX_BACKEND_FUTURES.wallet, nextAvailable, nextLocked, nextTotal);
    TX_BACKEND_FUTURES.walletLoaded = true;
}

function txApplyOptimisticOrder(payload = {}) {
    const snapshot = txCloneFuturesState();
    const order = txBuildOptimisticOrder(payload);
    const isMarket = String(payload.order_type || "").toLowerCase() === "market";

    txBeginOptimisticAction();
    txApplyOptimisticWalletOpen(payload, order);
    TX_BACKEND_FUTURES.orders = txUpsertCacheItem(TX_BACKEND_FUTURES.orders || [], order);

    let position = null;
    if (isMarket) {
        position = txTrackPositionTpSl(txBuildOptimisticPosition(payload, order), payload);
        TX_BACKEND_FUTURES.positions = txUpsertCacheItem(TX_BACKEND_FUTURES.positions || [], position);
        txSetActiveBottomTab("positions", false);
    } else {
        TX_BACKEND_FUTURES.openOrders = txUpsertCacheItem(TX_BACKEND_FUTURES.openOrders || [], order);
        txSetActiveBottomTab("openOrders", false);
    }

    const rowInserted = Boolean(isMarket && position && txInsertPositionRowImmediately(position));
    if (rowInserted) {
        txUpdateActiveTableWithoutFlicker(false);
    } else {
        txRenderActiveTableFast();
    }
    return {
        snapshot,
        orderId: txGetId(order),
        positionId: position ? txGetId(position) : "",
        isMarket
    };
}

function txResolveOptimisticOrder(response, payload = {}, optimistic = {}) {
    const shouldCloseAfterBackendCreate = optimistic.positionId && txConsumePendingLocalClose(optimistic.positionId);
    const data = response?.data || {};
    const backendPosition = data.position || null;
    const backendPositionId = txGetId(backendPosition);

    TX_BACKEND_FUTURES.orders = txRemoveCacheItem(TX_BACKEND_FUTURES.orders || [], optimistic.orderId);
    TX_BACKEND_FUTURES.openOrders = txRemoveCacheItem(TX_BACKEND_FUTURES.openOrders || [], optimistic.orderId);
    if (optimistic.positionId) {
        TX_BACKEND_FUTURES.positions = txRemoveCacheItem(TX_BACKEND_FUTURES.positions || [], optimistic.positionId);
    }

    if (shouldCloseAfterBackendCreate && backendPositionId) {
        const responseWithoutVisiblePosition = {
            ...response,
            data: {
                ...data,
                position: null
            }
        };
        txApplyImmediateOrderResponse(responseWithoutVisiblePosition, payload);
        txCloseBackendPositionAfterLocalClose(backendPositionId);
        return;
    }

    if (response?.data?.position) {
        response.data.position = txEnrichPositionWithTpSl(response.data.position, payload, optimistic.positionId);
    }

    txApplyImmediateOrderResponse(response, payload);

    const finalPosition = response?.data?.position || null;
    if (optimistic.positionId && finalPosition) {
        txReplacePositionRowImmediately(optimistic.positionId, finalPosition);
    }
}

function txApplyOptimisticClose(positionId) {
    const snapshot = txCloneFuturesState();
    const position = (TX_BACKEND_FUTURES.positions || []).find((item) => txGetId(item) === String(positionId));

    txBeginOptimisticAction();
    txApplyOptimisticWalletClose(position);
    const removedDirectly = txRemovePositionRowImmediately(positionId);
    TX_BACKEND_FUTURES.positions = txRemoveCacheItem(TX_BACKEND_FUTURES.positions || [], positionId);
    txSetActiveBottomTab("positions", false);
    txUpdateActiveTableWithoutFlicker(!removedDirectly);
    updateWalletUI();
    return { snapshot, position };
}

function txApplyOptimisticCloseAll(positions = []) {
    const snapshot = txCloneFuturesState();
    const ids = positions.map((position) => txGetId(position)).filter(Boolean);

    txBeginOptimisticAction();
    txApplyOptimisticWalletCloseMany(positions);
    let removedDirectly = false;
    ids.forEach((id) => {
        removedDirectly = txRemovePositionRowImmediately(id) || removedDirectly;
    });
    TX_BACKEND_FUTURES.positions = (TX_BACKEND_FUTURES.positions || []).filter((position) => !ids.includes(txGetId(position)));
    txSetActiveBottomTab("positions", false);
    txUpdateActiveTableWithoutFlicker(!removedDirectly);
    updateWalletUI();
    return { snapshot, ids };
}

function txIsLocalOptimisticPosition(position) {
    const positionId = txGetId(position);
    return Boolean(position?.__optimistic || String(positionId).startsWith("LOCAL-POS-"));
}

function txMarkLocalPositionClosed(positionId) {
    if (!positionId) return;
    if (!TX_BACKEND_FUTURES.pendingLocalCloseIds || typeof TX_BACKEND_FUTURES.pendingLocalCloseIds !== "object") {
        TX_BACKEND_FUTURES.pendingLocalCloseIds = Object.create(null);
    }
    TX_BACKEND_FUTURES.pendingLocalCloseIds[String(positionId)] = true;
}

function txConsumePendingLocalClose(positionId) {
    if (!positionId || !TX_BACKEND_FUTURES.pendingLocalCloseIds) {
        return false;
    }

    const key = String(positionId);
    const exists = Boolean(TX_BACKEND_FUTURES.pendingLocalCloseIds[key]);
    if (exists) {
        delete TX_BACKEND_FUTURES.pendingLocalCloseIds[key];
    }
    return exists;
}

function txApplyCloseResponseToCache(response, positionId) {
    const data = response?.data || {};

    if (data.wallet) {
        TX_BACKEND_FUTURES.wallet = data.wallet;
        TX_BACKEND_FUTURES.walletLoaded = true;
    }

    TX_BACKEND_FUTURES.positions = txRemoveCacheItem(TX_BACKEND_FUTURES.positions || [], positionId);

    if (data.trade) {
        TX_BACKEND_FUTURES.trades = txUpsertCacheItem(TX_BACKEND_FUTURES.trades || [], data.trade);
    }
}

function txCloseBackendPositionAfterLocalClose(positionId) {
    if (!positionId) return Promise.resolve();

    return txApiRequestWithTimeout(`/trading/close-position/${encodeURIComponent(positionId)}`, {
        method: "POST"
    }, 6000).then((response) => {
        txApplyCloseResponseToCache(response, positionId);
        txPlayFuturesCloseSound();
        showOrderMessage(response.message || "Position closed successfully.", "success");
        updateWalletUI();
        txSetActiveBottomTab("positions", false);
        txUpdatePositionsDomCount();
        txRefreshFuturesDataInBackground({ processPending: false });
        return response;
    }).catch((error) => {
        console.warn("Deferred futures close sync skipped:", error);
        showOrderMessage(showApiError(error, "Close confirmation failed. Backend sync is refreshing."), "error");
        txRefreshFuturesDataInBackground({ processPending: false });
        return null;
    });
}

function txPlayFuturesCloseSound() {
    try {
        if (localStorage.getItem("tx_close_sound") === "Mute") return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const context = new AudioContextClass();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.18);
        window.setTimeout(() => context.close?.(), 240);
    } catch (error) {
        console.warn("Close sound skipped:", error);
    }
}

/* Removed legacy duplicate placeOrder implementation. */

function txShouldAutoExecuteLimitOrder(order) {
    if (!order) {
        return false;
    }

    const status = String(order.status || "").toLowerCase();
    const orderType = String(order.order_type || order.type || "").toLowerCase();
    const orderSymbol = normalizeSymbol(order.symbol || "");
    const currentSymbol = normalizeSymbol(state.currentSymbol);
    const side = String(order.side || "").toLowerCase();
    const limitPrice = txToNumber(order.limit_price ?? order.price, 0);
    const currentPrice = txToNumber(state.currentPrice, 0);

    if (status !== "open") {
        return false;
    }

    if (orderType !== "limit") {
        return false;
    }

    if (!orderSymbol || orderSymbol !== currentSymbol) {
        return false;
    }

    if (limitPrice <= 0 || currentPrice <= 0) {
        return false;
    }

    if (side === "buy" || side === "long") {
        return currentPrice <= limitPrice;
    }

    if (side === "sell" || side === "short") {
        return currentPrice >= limitPrice;
    }

    return false;
}

async function txAutoExecuteMatchedLimitOrders() {
    // Deliberately disabled. The central backend Futures engine processes
    // pending orders, TP/SL and liquidations even when the browser is closed.
    return;
}


/* Removed legacy duplicate cancelOrder implementation. */

async function executeBackendOrder(orderId) {
    /* Manual frontend execution is intentionally disabled for company handover. */
    if (!orderId) {
        return;
    }

    showOrderMessage("Manual execution is disabled. Backend trading engine controls order execution.", "error");
}

/* Removed legacy duplicate closeAllPositions implementation. */

/* Removed legacy duplicate closePosition implementation. */

function addDemoBalance() {
    showOrderMessage("Demo balance is disabled. Use backend deposit/dev-complete flow to add wallet balance.", "error");
}

function resetDemo() {
    showOrderMessage("Demo reset is disabled. Backend wallet is active now.", "error");
}

function txRenderLoadingTable(message = "Loading backend data...") {
    if (!elements.terminalTable) {
        return;
    }

    elements.terminalTable.innerHTML = `<div class="rt-empty-table">${txEscapeHtml(message)}</div>`;
}

function txRenderLoginRequiredTable() {
    if (!elements.terminalTable) {
        return;
    }

    elements.terminalTable.innerHTML = `
        <div class="rt-empty-table">
            Please login to view backend futures data.
        </div>
    `;
}

function renderBottomTable() {
    if (!elements.terminalTable) {
        return;
    }

    if (!isLoggedIn()) {
        txRenderLoginRequiredTable();
        return;
    }

    const hasLoadedOnce = TX_BACKEND_FUTURES.lastDataLoadAt > 0;

    if (!hasLoadedOnce) {
        txRenderLoadingTable("Syncing backend data... Table will update automatically.");
    }

    refreshBackendFuturesData(false);

    if (hasLoadedOnce) {
        renderActiveBackendTableFromCache();
    }
}

function renderActiveBackendTableFromCache() {
    if (!elements.terminalTable) {
        return;
    }

    if (state.activeBottomTab === "positions") renderPositionsTable();
    if (state.activeBottomTab === "openOrders") renderOpenOrdersTable();
    if (state.activeBottomTab === "orderHistory") renderOrderHistoryTable();
    if (state.activeBottomTab === "tradeHistory") renderTradeHistoryTable();
    if (state.activeBottomTab === "transactionHistory") renderTransactionHistoryTable();
    if (state.activeBottomTab === "deliveryHistory") renderDeliveryHistoryTable();
}

function renderPositionsTable() {
    const positions = TX_BACKEND_FUTURES.positions || [];

    if (!positions.length) {
        elements.terminalTable.innerHTML = `<div class="rt-empty-table">No open positions from backend.</div>`;
        return;
    }

    elements.terminalTable.innerHTML = `
        <div class="rt-position-action-bar">
            <div>
                <p class="rt-position-action-title">Open Positions</p>
                <span class="rt-position-action-subtitle">${positions.length} active position(s) · Live prices keep updating for every pair.</span>
            </div>
            <button id="closeAllPositionsBtn" class="rt-close-all-positions-btn" type="button">
                Close All Positions
            </button>
        </div>

        <table class="rt-table rt-mobile-table rt-mobile-positions">
            <thead>
                <tr>
                    <th>Pair</th>
                    <th>Side</th>
                    <th>Qty</th>
                    <th>Entry</th>
                    <th>Mark</th>
                    <th>Margin</th>
                    <th>Lev.</th>
                    <th>Liq. Price</th>
                    <th>TP / SL</th>
                    <th>Profit / Loss</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
                ${positions.map((position) => txBuildPositionRowHtml(position)).join("")}
            </tbody>
        </table>
    `;

    elements.terminalTable.querySelectorAll("[data-close-position]").forEach((button) => {
        button.addEventListener("click", () => closePosition(button.getAttribute("data-close-position")));
    });

    document.getElementById("closeAllPositionsBtn")?.addEventListener("click", closeAllPositions);
}

function renderOpenOrdersTable() {
    const orders = TX_BACKEND_FUTURES.openOrders || [];

    if (!orders.length) {
        elements.terminalTable.innerHTML = `<div class="rt-empty-table">No open orders from backend.</div>`;
        return;
    }

    elements.terminalTable.innerHTML = `
        <table class="rt-table rt-mobile-table rt-mobile-open-orders">
            <thead>
                <tr>
                    <th>Order Ref</th>
                    <th>Pair</th>
                    <th>Side</th>
                    <th>Type</th>
                    <th>Order Price</th>
                    <th>Mark</th>
                    <th>Qty</th>
                    <th>Margin</th>
                    <th>Status</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
                ${orders.map((order) => {
                    const orderId = txGetId(order);
                    const status = order.status || "open";
                    const orderPrice = txToNumber(order.limit_price ?? order.average_fill_price ?? order.estimated_price ?? order.price, 0);
                    const backendMark = txToNumber(order.mark_price ?? order.current_price, 0);
                    const markPrice = txGetLivePriceForSymbol(order.symbol, backendMark || orderPrice);
                    return `
                        <tr>
                            <td class="rt-desktop-only" data-label="Order Ref" data-mobile-field="reference">${txEscapeHtml(order.order_reference || orderId)}</td>
                            <td class="rt-desktop-only" data-label="Pair" data-mobile-field="pair">${txEscapeHtml(txFormatSymbol(order.symbol))}</td>
                            <td class="rt-desktop-only" data-label="Side" data-mobile-field="side" class="${txSideClass(order.side)}">${txEscapeHtml(txFormatSide(order.side))}</td>
                            <td class="rt-desktop-only" data-label="Type" data-mobile-field="type">${txEscapeHtml(String(order.order_type || "--").toUpperCase())}</td>
                            <td class="rt-desktop-only" data-label="Order Price" data-mobile-field="price">${orderPrice > 0 ? formatNumber(orderPrice) : "Market"}</td>
                            <td class="rt-desktop-only" data-label="Mark" data-mobile-field="mark" data-live-order-mark="${txEscapeHtml(orderId)}">${txFormatFastPrice(markPrice)}</td>
                            <td class="rt-desktop-only" data-label="Qty" data-mobile-field="qty">${formatQty(order.quantity)}</td>
                            <td class="rt-desktop-only" data-label="Margin" data-mobile-field="margin">${formatNumber(order.margin_amount)} USDT</td>
                            <td class="rt-desktop-only" data-label="Status" data-mobile-field="status" class="${txStatusClass(status)}">${txEscapeHtml(String(status).toUpperCase())}</td>
                            <td class="rt-desktop-only" data-label="Action" data-mobile-field="action" class="flex gap-2">
                                <button class="rt-table-action danger" type="button" data-cancel-order="${txEscapeHtml(orderId)}">Cancel</button>
                            </td>
                            
                            <td class="rt-mobile-only rt-mobile-card-cell" colspan="10">
                                <div class="rt-mobile-position-card py-0.5">
                                    <!-- Line 1: Symbol, Badge, Status & ✕ Cancel Button -->
                                    <div class="flex justify-between items-center mb-1">
                                        <div class="flex items-center gap-1.5 flex-wrap">
                                            <span class="text-xs font-black text-white">${txEscapeHtml(txFormatSymbol(order.symbol))}</span>
                                            <span class="text-[9.5px] font-black px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800/80 ${txSideClass(order.side)}">${txEscapeHtml(txFormatSide(order.side))} · ${txEscapeHtml(String(order.order_type || "LIMIT").toUpperCase())}</span>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <span class="text-[11px] font-black ${txStatusClass(status)}">${txEscapeHtml(String(status).toUpperCase())}</span>
                                            <button class="rt-mobile-close-btn" type="button" data-cancel-order="${txEscapeHtml(orderId)}" title="Cancel Order">
                                                ✕
                                            </button>
                                        </div>
                                    </div>

                                    <!-- Line 2: Dense 1-Line Stats (QTY, PRICE, LTP, Ref) -->
                                    <div class="flex items-center justify-between text-[10px] font-semibold text-slate-400 bg-slate-950/40 px-2 py-1 rounded-md border border-slate-800/40">
                                        <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">QTY</span><span class="font-mono text-white font-bold">${formatQty(order.quantity)}</span></div>
                                        <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">PRICE</span><span class="font-mono text-white font-bold">${orderPrice > 0 ? formatNumber(orderPrice) : "Market"}</span></div>
                                        <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">LTP</span><span class="font-mono text-white font-bold" data-live-order-mark="${txEscapeHtml(orderId)}">${txFormatFastPrice(markPrice)}</span></div>
                                        <div class="text-[8.5px] text-slate-500 font-mono border-l border-slate-800 pl-1.5">#${txEscapeHtml(order.order_reference || orderId).substring(0, 6)}</div>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join("")}
            </tbody>
        </table>
    `;

    elements.terminalTable.querySelectorAll("[data-cancel-order]").forEach((button) => {
        if (button.dataset.txCancelWired === "1") return;
        button.dataset.txCancelWired = "1";
        button.addEventListener("click", () => cancelOrder(button.getAttribute("data-cancel-order")));
    });
}

function txRenderPaginationControls(container, totalItems, itemsPerPage, currentPage, onPageChange) {
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (totalPages <= 1) {
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "tx-pagination";

    const infoSpan = document.createElement("span");
    const startIdx = (currentPage - 1) * itemsPerPage + 1;
    const endIdx = Math.min(currentPage * itemsPerPage, totalItems);
    infoSpan.textContent = `Showing ${startIdx}-${endIdx} of ${totalItems}`;
    wrapper.appendChild(infoSpan);

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.textContent = "Prev";
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener("click", () => onPageChange(currentPage - 1));
    wrapper.appendChild(prevBtn);

    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
        const pageBtn = document.createElement("button");
        pageBtn.type = "button";
        pageBtn.textContent = p;
        if (p === currentPage) {
            pageBtn.classList.add("active");
        }
        pageBtn.addEventListener("click", () => onPageChange(p));
        wrapper.appendChild(pageBtn);
    }

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = "Next";
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener("click", () => onPageChange(currentPage + 1));
    wrapper.appendChild(nextBtn);

    container.appendChild(wrapper);
}

function renderOrderHistoryTable() {
    const orders = TX_BACKEND_FUTURES.orders || [];

    if (!orders.length) {
        elements.terminalTable.innerHTML = `<div class="rt-empty-table">No backend order history.</div>`;
        return;
    }

    if (state.orderHistoryPage === undefined) {
        state.orderHistoryPage = 1;
    }

    const itemsPerPage = window.innerWidth <= 1024 ? 1000 : 10;
    const totalItems = orders.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

    if (state.orderHistoryPage > totalPages) {
        state.orderHistoryPage = totalPages;
    }
    if (state.orderHistoryPage < 1) {
        state.orderHistoryPage = 1;
    }

    const startIndex = (state.orderHistoryPage - 1) * itemsPerPage;
    const paginatedOrders = orders.slice(startIndex, startIndex + itemsPerPage);

    elements.terminalTable.innerHTML = `
        <table class="rt-table rt-mobile-table rt-mobile-order-history">
            <thead>
                <tr>
                    <th>Order Ref</th>
                    <th>Pair</th>
                    <th>Side</th>
                    <th>Type</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Margin</th>
                    <th>Status</th>
                    <th>Time</th>
                </tr>
            </thead>
            <tbody>
                ${paginatedOrders.map((order) => {
                    const status = String(order.status || "filled").toLowerCase();
                    const price = txToNumber(order.limit_price ?? order.average_fill_price ?? order.estimated_price ?? order.price, 0);

                    return `
                        <tr>
                            <td class="rt-desktop-only" data-label="Order Ref" data-mobile-field="reference">${txEscapeHtml(order.order_reference || txGetId(order))}</td>
                            <td class="rt-desktop-only" data-label="Pair" data-mobile-field="pair">${txEscapeHtml(txFormatSymbol(order.symbol))}</td>
                            <td class="rt-desktop-only" data-label="Side" data-mobile-field="side" class="${txSideClass(order.side)}">${txEscapeHtml(txFormatSide(order.side))}</td>
                            <td class="rt-desktop-only" data-label="Type" data-mobile-field="type">${txEscapeHtml(String(order.order_type || "--").toUpperCase())}</td>
                            <td class="rt-desktop-only" data-label="Price" data-mobile-field="price">${price > 0 ? formatNumber(price) : "Market"}</td>
                            <td class="rt-desktop-only" data-label="Qty" data-mobile-field="qty">${formatQty(order.quantity)}</td>
                            <td class="rt-desktop-only" data-label="Margin" data-mobile-field="margin">${formatNumber(order.margin_amount)} USDT</td>
                            <td class="rt-desktop-only" data-label="Status" data-mobile-field="status" class="${txStatusClass(status)}">${txEscapeHtml(String(status).toUpperCase())}</td>
                            <td class="rt-desktop-only" data-label="Time" data-mobile-field="time">${txFormatDateTime(order.created_at || order.createdAt)}</td>
                            
                            <td class="rt-mobile-only rt-mobile-card-cell" colspan="9">
                                <div class="rt-mobile-position-card py-0.5">
                                    <!-- Line 1: Symbol, Badge & Status -->
                                    <div class="flex justify-between items-center mb-1">
                                        <div class="flex items-center gap-1.5 flex-wrap">
                                            <span class="text-xs font-black text-white">${txEscapeHtml(txFormatSymbol(order.symbol))}</span>
                                            <span class="text-[9.5px] font-black px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800/80 ${txSideClass(order.side)}">${txEscapeHtml(txFormatSide(order.side))} · ${txEscapeHtml(String(order.order_type || "--").toUpperCase())}</span>
                                        </div>
                                        <span class="text-[11px] font-black ${txStatusClass(status)}">${txEscapeHtml(String(status).toUpperCase())}</span>
                                    </div>

                                    <!-- Line 2: Dense 1-Line Stats (QTY, PRICE, MARGIN, Ref) -->
                                    <div class="flex items-center justify-between text-[10px] font-semibold text-slate-400 bg-slate-950/40 px-2 py-1 rounded-md border border-slate-800/40">
                                        <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">QTY</span><span class="font-mono text-white font-bold">${formatQty(order.quantity)}</span></div>
                                        <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">PRICE</span><span class="font-mono text-white font-bold">${price > 0 ? formatNumber(price) : "Market"}</span></div>
                                        <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">MARGIN</span><span class="font-mono text-white font-bold">${formatNumber(order.margin_amount)}</span></div>
                                        <div class="text-[8.5px] text-slate-500 font-mono border-l border-slate-800 pl-1.5">#${txEscapeHtml(order.order_reference || txGetId(order)).substring(0, 6)}</div>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join("")}
            </tbody>
        </table>
    `;

    txRenderPaginationControls(elements.terminalTable, totalItems, itemsPerPage, state.orderHistoryPage, (newPage) => {
        state.orderHistoryPage = newPage;
        renderOrderHistoryTable();
    });
}

function renderTradeHistoryTable() {
    const trades = TX_BACKEND_FUTURES.trades || [];

    if (!trades.length) {
        elements.terminalTable.innerHTML = `<div class="rt-empty-table">No backend trade history.</div>`;
        return;
    }

    if (state.tradeHistoryPage === undefined) {
        state.tradeHistoryPage = 1;
    }

    const itemsPerPage = window.innerWidth <= 1024 ? 1000 : 10;
    const totalItems = trades.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

    if (state.tradeHistoryPage > totalPages) {
        state.tradeHistoryPage = totalPages;
    }
    if (state.tradeHistoryPage < 1) {
        state.tradeHistoryPage = 1;
    }

    const startIndex = (state.tradeHistoryPage - 1) * itemsPerPage;
    const paginatedTrades = trades.slice(startIndex, startIndex + itemsPerPage);

    elements.terminalTable.innerHTML = `
        <table class="rt-table rt-mobile-table rt-mobile-trade-history">
            <thead>
                <tr>
                    <th>Trade Ref</th>
                    <th>Type</th>
                    <th>Pair</th>
                    <th>Side</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Fee</th>
                    <th>Profit / Loss</th>
                    <th>Time</th>
                </tr>
            </thead>
            <tbody>
                ${paginatedTrades.map((trade) => {
                    const pnl = txToNumber(trade.realized_pnl, 0);
                    const pnlColorStyle = getPnlColorStyle(pnl);
                    const pnlText = formatPnlValue(pnl);

                    return `
                        <tr>
                            <td class="rt-desktop-only" data-label="Trade Ref" data-mobile-field="reference">${txEscapeHtml(trade.trade_reference || txGetId(trade))}</td>
                            <td class="rt-desktop-only" data-label="Type" data-mobile-field="type">${txEscapeHtml(String(trade.trade_type || "--").toUpperCase())}</td>
                            <td class="rt-desktop-only" data-label="Pair" data-mobile-field="pair">${txEscapeHtml(txFormatSymbol(trade.symbol))}</td>
                            <td class="rt-desktop-only" data-label="Side" data-mobile-field="side" class="${txSideClass(trade.side)}">${txEscapeHtml(txFormatSide(trade.side))}</td>
                            <td class="rt-desktop-only" data-label="Price" data-mobile-field="price">${formatNumber(trade.price)}</td>
                            <td class="rt-desktop-only" data-label="Qty" data-mobile-field="qty">${formatQty(trade.quantity)}</td>
                            <td class="rt-desktop-only" data-label="Fee" data-mobile-field="fee">${formatNumber(trade.fee_amount)} USDT</td>
                            <td class="rt-desktop-only" data-label="Profit / Loss" data-mobile-field="pnl" ${pnlColorStyle}>${pnlText}</td>
                            <td class="rt-desktop-only" data-label="Time" data-mobile-field="time">${txFormatDateTime(trade.created_at || trade.createdAt)}</td>
                            
                            <td class="rt-mobile-only rt-mobile-card-cell" colspan="9">
                                <div class="rt-mobile-position-card py-0.5">
                                    <!-- Line 1: Symbol, Badge & PnL -->
                                    <div class="flex justify-between items-center mb-1">
                                        <div class="flex items-center gap-1.5 flex-wrap">
                                            <span class="text-xs font-black text-white">${txEscapeHtml(txFormatSymbol(trade.symbol))}</span>
                                            <span class="text-[9.5px] font-black px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800/80 ${txSideClass(trade.side)}">${txEscapeHtml(txFormatSide(trade.side))} · ${txEscapeHtml(String(trade.trade_type || "TRADE").toUpperCase())}</span>
                                        </div>
                                        <span class="text-xs font-black" ${pnlColorStyle}>${pnlText}</span>
                                    </div>

                                    <!-- Line 2: Dense 1-Line Stats (QTY, PRICE, FEE, Ref) -->
                                    <div class="flex items-center justify-between text-[10px] font-semibold text-slate-400 bg-slate-950/40 px-2 py-1 rounded-md border border-slate-800/40">
                                        <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">QTY</span><span class="font-mono text-white font-bold">${formatQty(trade.quantity)}</span></div>
                                        <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">PRICE</span><span class="font-mono text-white font-bold">${formatNumber(trade.price)}</span></div>
                                        <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">FEE</span><span class="font-mono text-slate-300 font-bold">${formatNumber(trade.fee_amount)}</span></div>
                                        <div class="text-[8.5px] text-slate-500 font-mono border-l border-slate-800 pl-1.5">#${txEscapeHtml(trade.trade_reference || txGetId(trade)).substring(0, 6)}</div>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join("")}
            </tbody>
        </table>
    `;

    txRenderPaginationControls(elements.terminalTable, totalItems, itemsPerPage, state.tradeHistoryPage, (newPage) => {
        state.tradeHistoryPage = newPage;
        renderTradeHistoryTable();
    });
}

function renderTransactionHistoryTable() {
    const ledger = TX_BACKEND_FUTURES.ledger || [];

    if (!ledger.length) {
        elements.terminalTable.innerHTML = `<div class="rt-empty-table">No backend wallet transactions.</div>`;
        return;
    }

    if (state.transactionHistoryPage === undefined) {
        state.transactionHistoryPage = 1;
    }

    const itemsPerPage = window.innerWidth <= 1024 ? 1000 : 10;
    const totalItems = ledger.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

    if (state.transactionHistoryPage > totalPages) {
        state.transactionHistoryPage = totalPages;
    }
    if (state.transactionHistoryPage < 1) {
        state.transactionHistoryPage = 1;
    }

    const startIndex = (state.transactionHistoryPage - 1) * itemsPerPage;
    const paginatedLedger = ledger.slice(startIndex, startIndex + itemsPerPage);

    elements.terminalTable.innerHTML = `
        <table class="rt-table rt-mobile-table rt-mobile-transaction-history">
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Direction</th>
                    <th>Amount</th>
                    <th>Balance After</th>
                    <th>Description</th>
                    <th>Time</th>
                </tr>
            </thead>
            <tbody>
                ${paginatedLedger.map((item) => {
                    const direction = String(item.direction || item.entry_type || "").toLowerCase();
                    const amountClass = direction === "credit" ? "text-emerald-400" : "text-red-400";
                    const sign = direction === "credit" ? "+" : direction === "debit" ? "-" : "";

                    return `
                        <tr>
                            <td class="rt-desktop-only" data-label="Type" data-mobile-field="type">${txEscapeHtml(txLedgerTypeLabel(item.transaction_type || item.type || "--"))}</td>
                            <td class="rt-desktop-only" data-label="Direction" data-mobile-field="direction" class="${amountClass}">${txEscapeHtml(direction.toUpperCase() || "--")}</td>
                            <td class="rt-desktop-only" data-label="Amount" data-mobile-field="amount" class="${amountClass}">${sign}${formatNumber(item.amount)} USDT</td>
                            <td class="rt-desktop-only" data-label="Balance After" data-mobile-field="balance">${formatNumber(item.balance_after)} USDT</td>
                            <td class="rt-desktop-only" data-label="Description" data-mobile-field="description">${txEscapeHtml(txLedgerTypeLabel(item.description || "--"))}</td>
                            <td class="rt-desktop-only" data-label="Time" data-mobile-field="time">${txFormatDateTime(item.created_at || item.createdAt)}</td>
                            
                            <td class="rt-mobile-only rt-mobile-card-cell" colspan="6">
                                <div class="rt-mobile-position-card py-0.5">
                                    <!-- Line 1: Type, Direction & Amount -->
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="text-xs font-black text-white">${txEscapeHtml(txLedgerTypeLabel(item.transaction_type || item.type || "--"))}</span>
                                        <span class="text-xs font-black ${amountClass}">${sign}${formatNumber(item.amount)} USDT</span>
                                    </div>

                                    <!-- Line 2: Balance After & Description -->
                                    <div class="flex items-center justify-between text-[10px] font-semibold text-slate-400 bg-slate-950/40 px-2 py-1 rounded-md border border-slate-800/40">
                                        <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">BAL AFTER</span><span class="font-mono text-white font-bold">${formatNumber(item.balance_after)} USDT</span></div>
                                        <div class="text-[9px] text-slate-400 font-medium truncate max-w-[140px] text-right">${txEscapeHtml(txLedgerTypeLabel(item.description || "--"))}</div>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join("")}
            </tbody>
        </table>
    `;

    txRenderPaginationControls(elements.terminalTable, totalItems, itemsPerPage, state.transactionHistoryPage, (newPage) => {
        state.transactionHistoryPage = newPage;
        renderTransactionHistoryTable();
    });
}

function renderDeliveryHistoryTable() {
    elements.terminalTable.innerHTML = `
        <div class="rt-empty-table">
            Delivery history is not applicable for perpetual futures.
        </div>
    `;
}

window.TX_REFRESH_FUTURES_BACKEND = function () {
    return refreshBackendFuturesData(true);
};


/* =========================
   INIT
========================= */

function initFuturesTerminal() {
    if (document.documentElement.dataset.txFuturesInitialized === "1") {
        return;
    }
    document.documentElement.dataset.txFuturesInitialized = "1";

    applyInitialSymbolFromNavigation();
    updatePairHeader();
    updateSessionStatus();
    initChart();
    initEvents();
    txInitFuturesChartExtras();

    if (typeof initWorkingDrawingTools === "function") {
        initWorkingDrawingTools();
    }

    if (typeof initFuturesAdvancedIcons === "function") {
        initFuturesAdvancedIcons();
    }

    initOrderBookTabs();
    startTickerSocket();
    startBackendMarkPriceSocket();
    startBackendFastTradePriceSocket();
    startBackendLiveRowsTimer();
    startAllSymbolLivePriceSync();
    loadTickerMetrics();
    startMarketSocket();
    loadInitialCandles();
    updateWalletUI();
    renderBottomTable();
    updateFundingCountdown();
    txRecordRecentSymbol(state.currentSymbol);

    if (isLoggedIn()) {
        refreshBackendFuturesData(true);
    }

    window.setInterval(() => {
        if (!isLoggedIn()) {
            return;
        }

        refreshBackendFuturesData(false);
    }, TX_BACKGROUND_BACKEND_REFRESH_MS);
}
document.addEventListener("DOMContentLoaded", initFuturesTerminal);

/* ========================================================================
   TRAIDIUMX FUTURES - PRODUCTION CONSISTENCY LAYER
   - No page reloads for Buy/Sell/Cancel/Close/Close All.
   - No artificial action delay.
   - Rows update immediately; backend failure restores the exact previous state.
   - Mark Price drives P&L, liquidation and TP/SL display.
   - Browser never executes pending orders or TP/SL.
======================================================================== */
(function txInstallProductionFuturesLayer() {
    "use strict";

    const TX_ACTION_TIMEOUT_MS = 12000;
    const TX_SOCKET_MAX_RECONNECT_MS = 10000;
    const TX_CLOSE_SOUND = new Audio("../../assets/sounds/close.mp3");
    const TX_SEEN_CLOSE_TRADES = new Set();
    let txCloseTradeTrackerReady = false;

    TX_CLOSE_SOUND.preload = "auto";
    TX_CLOSE_SOUND.volume = 0.7;

    function txNormalizeCloseReason(reason) {
        const value = String(reason || "manual").trim().toLowerCase().replace(/\s+/g, "_");
        if (value === "take_profit" || value === "stop_loss" || value === "liquidation") {
            return value;
        }
        return "manual";
    }

    function txClearReconnectTimer(key) {
        const timer = state.reconnectTimers?.[key];
        if (timer) {
            window.clearTimeout(timer);
            delete state.reconnectTimers[key];
        }
    }

    function txScheduleReconnect(key, starter) {
        if (state.intentionalSocketStops?.[key]) {
            return;
        }

        txClearReconnectTimer(key);
        const attempt = Number(state.reconnectAttempts?.[key] || 0);
        const delay = Math.min(1000 * Math.pow(2, attempt), TX_SOCKET_MAX_RECONNECT_MS);
        state.reconnectAttempts[key] = attempt + 1;

        state.reconnectTimers[key] = window.setTimeout(() => {
            delete state.reconnectTimers[key];
            starter();
        }, delay);
    }

    function txSocketConnected(key) {
        state.reconnectAttempts[key] = 0;
        txClearReconnectTimer(key);
    }

    function txSetSocketStatus(text, tone = "") {
        if (!elements.sessionStatus) return;
        elements.sessionStatus.dataset.marketConnection = tone;
        elements.sessionStatus.title = text;
    }

    function txStoreMarkPrice(symbol, markPrice, indexPrice = 0, fundingRate = 0, nextFundingTime = null) {
        const provider = normalizeSymbol(symbol || "");
        const internal = txNormalizeProviderSymbol(provider);
        const mark = txToNumber(markPrice, 0);
        const index = txToNumber(indexPrice, mark);

        if (!internal || mark <= 0) return;

        [provider, internal, txGetProviderSymbol(internal)].filter(Boolean).forEach((key) => {
            state.markPrices[key] = mark;
            state.indexPrices[key] = index;
            state.fundingRates[key] = txToNumber(fundingRate, 0);
            if (nextFundingTime) state.nextFundingTimes[key] = Number(nextFundingTime);
        });

        if (internal === state.currentSymbol || provider === state.currentSymbol || txGetProviderSymbol(internal) === state.currentSymbol) {
            const decimals = mark < 1 ? 6 : 2;
            if (elements.markPrice) elements.markPrice.textContent = formatNumber(mark, decimals);
            if (elements.indexPrice) elements.indexPrice.textContent = index > 0 ? formatNumber(index, decimals) : "--";
        }
    }
    window.txStoreMarkPriceImpl = txStoreMarkPrice;

    function txGetLastPriceForSymbol(symbol, fallback = 0) {
        const internal = txNormalizeProviderSymbol(symbol);
        const provider = txGetProviderSymbol(internal);
        return txToNumber(state.lastPrices[internal], 0)
            || txToNumber(state.lastPrices[provider], 0)
            || txToNumber(fallback, 0);
    }

    txGetLivePriceForSymbol = function txGetLiveMarkPriceForSymbol(symbol, fallback = 0) {
        const internal = txNormalizeProviderSymbol(symbol);
        const provider = txGetProviderSymbol(internal);
        return txToNumber(state.markPrices[internal], 0)
            || txToNumber(state.markPrices[provider], 0)
            || txGetLastPriceForSymbol(internal, fallback);
    };

    updateLivePrice = function txUpdateLastTradePrice(price) {
        const numericPrice = Number(price);
        if (!Number.isFinite(numericPrice) || numericPrice <= 0) return;

        state.previousPrice = state.currentPrice || numericPrice;
        state.currentPrice = numericPrice;
        txStoreLivePrice(state.currentSymbol, numericPrice);
        txUpdateDocumentTitle(numericPrice);

        const decimals = numericPrice < 1 ? 6 : 2;
        const mark = txGetLivePriceForSymbol(state.currentSymbol, numericPrice);
        const index = Number(
            state.indexPrices[state.currentSymbol] ||
            state.indexPrices[txGetProviderSymbol(state.currentSymbol)] ||
            state.indexPrices[txNormalizeProviderSymbol(state.currentSymbol)] ||
            state.markPrices[state.currentSymbol] ||
            state.markPrices[txGetProviderSymbol(state.currentSymbol)] ||
            mark ||
            numericPrice
        );

        if (elements.currentPriceBadge) elements.currentPriceBadge.textContent = formatNumber(numericPrice, decimals);
        if (elements.markPrice) elements.markPrice.textContent = formatNumber(mark, mark < 1 ? 6 : 2);
        if (elements.indexPrice) elements.indexPrice.textContent = index > 0 ? formatNumber(index, index < 1 ? 6 : 2) : "--";
        if (elements.orderBookMid) elements.orderBookMid.textContent = `${formatNumber(numericPrice, decimals)} ${getQuoteAsset()}`;
        if (elements.limitPriceInput && !elements.limitPriceInput.value) elements.limitPriceInput.value = numericPrice.toFixed(decimals);

        const mobBuyP = document.getElementById("futuresMobileBuyPrice");
        const mobSellP = document.getElementById("futuresMobileSellPrice");
        if (mobBuyP) mobBuyP.textContent = formatNumber(numericPrice, decimals);
        if (mobSellP) mobSellP.textContent = formatNumber(numericPrice, decimals);

        const mobHeaderTitle = document.getElementById("futuresMobileSymbolTitle");
        const mobHeaderPrice = document.getElementById("futuresMobileHeaderPrice");
        if (mobHeaderTitle) mobHeaderTitle.textContent = state.currentSymbol || "BTCUSDT";
        if (mobHeaderPrice) mobHeaderPrice.textContent = `${formatNumber(numericPrice, decimals)} ${getQuoteAsset()}`;

        flashPriceBadge(numericPrice);
        txRefreshVisibleTradingRows();
        txUpdateEstimatedMargin();
    };

    updateMetricsFromTicker = function txUpdateRealTickerMetrics(ticker) {
        if (!ticker) return;

        const price = Number(ticker.c || ticker.lastPrice || ticker.last_price || 0);
        const change = Number(ticker.P || ticker.priceChangePercent || ticker.price_change_percent || 0);
        const low = Number(ticker.l || ticker.lowPrice || ticker.low_price || 0);
        const high = Number(ticker.h || ticker.highPrice || ticker.high_price || 0);
        const volume = Number(ticker.q || ticker.quoteVolume || ticker.quote_volume || 0);
        const tickerSymbol = txNormalizeProviderSymbol(ticker.s || ticker.symbol || state.currentSymbol);

        if (price > 0) {
            txStoreLivePrice(tickerSymbol, price);
            if (tickerSymbol === state.currentSymbol) updateLivePrice(price);
        }

        if (ticker.mark_price || ticker.markPrice || ticker.index_price || ticker.indexPrice) {
            txStoreMarkPrice(
                tickerSymbol,
                ticker.mark_price || ticker.markPrice || price,
                ticker.index_price || ticker.indexPrice || 0,
                ticker.last_funding_rate || ticker.lastFundingRate || 0,
                ticker.next_funding_time || ticker.nextFundingTime || null
            );
        }

        const sign = change >= 0 ? "+" : "";
        if (elements.change24h) {
            elements.change24h.textContent = `${sign}${change.toFixed(3)}%`;
            elements.change24h.className = change >= 0 ? "text-emerald-400" : "text-red-400";
        }
        if (elements.low24h) elements.low24h.textContent = low > 0 ? formatNumber(low, low < 1 ? 6 : 2) : "--";
        if (elements.high24h) elements.high24h.textContent = high > 0 ? formatNumber(high, high < 1 ? 6 : 2) : "--";
        if (elements.vol24h) elements.vol24h.textContent = volume > 0 ? `${formatNumber(volume / 1000000, 2)}M` : "--";
        txUpdateEstimatedMargin();
    };

    updateFundingCountdown = function txStartRealFundingCountdown() {
        if (!elements.fundingRate) return;
        if (state.fundingCountdownTimer) window.clearInterval(state.fundingCountdownTimer);

        const render = () => {
            const symbol = state.currentSymbol;
            const rate = txToNumber(state.fundingRates[symbol], 0) * 100;
            let nextTime = Number(state.nextFundingTimes[symbol] || 0);

            if (!nextTime || nextTime <= Date.now()) {
                const interval = 8 * 60 * 60 * 1000;
                nextTime = Math.ceil(Date.now() / interval) * interval;
            }

            const diff = Math.max(0, nextTime - Date.now());
            const hours = String(Math.floor(diff / 3600000)).padStart(2, "0");
            const minutes = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
            const seconds = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
            elements.fundingRate.textContent = `${rate.toFixed(4)}% / ${hours}:${minutes}:${seconds}`;
        };

        render();
        state.fundingCountdownTimer = window.setInterval(render, 1000);
    };

    window.txStartMarkPriceSocket = function txStartMarkPriceSocket() {
        const key = "mark";
        state.intentionalSocketStops[key] = false;
        txClearReconnectTimer(key);

        if (state.markPriceSocket) {
            try {
                state.markPriceSocket.onclose = null;
                state.markPriceSocket.close();
            } catch (_) {}
            state.markPriceSocket = null;
        }

        const seen = new Set();
        const streams = pairs
            .map((pair) => txGetProviderSymbol(pair.symbol))
            .filter((symbol) => {
                const clean = normalizeSymbol(symbol);
                if (!clean || seen.has(clean)) return false;
                seen.add(clean);
                return true;
            })
            .map((symbol) => `${symbol.toLowerCase()}@markPrice`)
            .join("/");

        if (!streams) return;
        const socket = new WebSocket(`${WS_BASE}${streams}`);
        state.markPriceSocket = socket;

        socket.onopen = () => {
            txSocketConnected(key);
            txSetSocketStatus("Market data connected", "connected");
        };
        socket.onmessage = (event) => {
            try {
                const response = JSON.parse(event.data);
                const data = response.data || response;
                txStoreMarkPrice(data.s, data.p, data.i, data.r, data.T);
                txRefreshVisibleTradingRows();
            } catch (error) {
                console.warn("Mark Price message skipped:", error);
            }
        };
        socket.onerror = () => socket.close();
        socket.onclose = () => {
            if (state.markPriceSocket === socket) state.markPriceSocket = null;
            txSetSocketStatus("Mark Price reconnecting", "reconnecting");
            txScheduleReconnect(key, startBackendMarkPriceSocket);
        };
    };

    startMarketSocket = function txStartMarketSocketWithReconnect() {
        stopMarketSocket();
        const key = "market";
        state.intentionalSocketStops[key] = false;

        if (isCommoditySymbol()) {
            loadTickerMetrics();
            loadCommodityMarketDepth(true);
            state.goldTickerTimer = window.setInterval(loadTickerMetrics, 5000);
            state.goldDepthTimer = window.setInterval(() => loadCommodityMarketDepth(true), 3000);
            return;
        }

        const streamSymbol = state.currentSymbol.toLowerCase();
        const streams = [
            `${streamSymbol}@kline_${state.interval}`,
            `${streamSymbol}@depth20@100ms`,
            `${streamSymbol}@aggTrade`,
            `${streamSymbol}@ticker`
        ].join("/");
        const socket = new WebSocket(`${WS_BASE}${streams}`);
        state.marketSocket = socket;

        socket.onopen = () => {
            txSocketConnected(key);
            txSetSocketStatus("Market WebSocket connected", "connected");
        };
        socket.onmessage = (event) => {
            try {
                const response = JSON.parse(event.data);
                if (!response.stream || !response.data) return;
                const stream = String(response.stream).toLowerCase();
                if (stream.includes("@kline")) handleKline(response.data);
                if (stream.includes("@depth20")) handleDepth(response.data);
                if (stream.includes("@aggtrade") || stream.includes("@trade")) handleAggTrade(response.data);
                if (stream.includes("@ticker")) updateMetricsFromTicker(response.data);
            } catch (error) {
                console.warn("Market WebSocket message skipped:", error);
            }
        };
        socket.onerror = () => socket.close();
        socket.onclose = () => {
            if (state.marketSocket === socket) state.marketSocket = null;
            txSetSocketStatus("Market WebSocket reconnecting", "reconnecting");
            txScheduleReconnect(key, startMarketSocket);
        };
        startCandleWatchdog();
    };

    stopMarketSocket = function txStopMarketSocket() {
        state.intentionalSocketStops.market = true;
        txClearReconnectTimer("market");
        if (state.marketSocket) {
            const socket = state.marketSocket;
            state.marketSocket = null;
            socket.onclose = null;
            try { socket.close(); } catch (_) {}
        }
        ["fallbackTimer", "candleWatchTimer", "goldTickerTimer", "goldDepthTimer"].forEach((name) => {
            if (state[name]) window.clearInterval(state[name]);
            state[name] = null;
        });
    };

    const txOriginalStartTickerSocket = startTickerSocket;
    startTickerSocket = function txStartTickerWithReconnect() {
        if (state.tickerSocket) {
            try {
                state.tickerSocket.onclose = null;
                state.tickerSocket.close();
            } catch (_) {}
            state.tickerSocket = null;
        }
        txOriginalStartTickerSocket();
        const socket = state.tickerSocket;
        if (!socket) return;
        const key = "ticker";
        state.intentionalSocketStops[key] = false;

        const originalOpen = socket.onopen;
        socket.onopen = (event) => {
            txSocketConnected(key);
            if (typeof originalOpen === "function") originalOpen.call(socket, event);
        };
        socket.onerror = () => socket.close();
        const originalClose = socket.onclose;
        socket.onclose = (event) => {
            if (typeof originalClose === "function") originalClose.call(socket, event);
            if (state.tickerSocket === socket) state.tickerSocket = null;
            txScheduleReconnect(key, startTickerSocket);
        };
    };

    const txOriginalStartFastTradeSocket = startBackendFastTradePriceSocket;
    startBackendFastTradePriceSocket = function txStartFastTradeWithReconnect() {
        if (state.fastTradePriceSocket) {
            try {
                state.fastTradePriceSocket.onclose = null;
                state.fastTradePriceSocket.close();
            } catch (_) {}
            state.fastTradePriceSocket = null;
        }
        txOriginalStartFastTradeSocket();
        const socket = state.fastTradePriceSocket;
        if (!socket) return;
        const key = "fastTrade";
        state.intentionalSocketStops[key] = false;
        socket.onopen = () => txSocketConnected(key);
        socket.onerror = () => socket.close();
        const originalClose = socket.onclose;
        socket.onclose = (event) => {
            if (typeof originalClose === "function") originalClose.call(socket, event);
            if (state.fastTradePriceSocket === socket) state.fastTradePriceSocket = null;
            txScheduleReconnect(key, startBackendFastTradePriceSocket);
        };
    };

    // TradingView is the only candle/drawing engine. Its native toolbar stays
    // synchronized during zoom and pan; the detached pixel overlay is disabled.
    initWorkingDrawingTools = function txUseTradingViewNativeDrawings() {
        if (elements.drawingOverlay) elements.drawingOverlay.classList.add("hidden");
        if (elements.drawingFloatingToolbar) elements.drawingFloatingToolbar.classList.add("hidden");
    };
    loadInitialCandles = async function txTradingViewOwnsCandles() {
        state.candleSeries = null;
        state.volumeSeries = null;
        if (elements.terminalCandleInfo) elements.terminalCandleInfo.textContent = "TradingView live candles active.";
    };

    window.txPlayFuturesCloseSound = function txPlayFuturesCloseSoundGlobal() {
        try {
            if (localStorage.getItem("tx_close_sound") === "Mute") return;
            TX_CLOSE_SOUND.currentTime = 0;
            const playPromise = TX_CLOSE_SOUND.play();
            if (playPromise?.catch) playPromise.catch(() => {});
        } catch (error) {
            console.warn("Close sound skipped:", error);
        }
    };
    txPlayFuturesCloseSound = window.txPlayFuturesCloseSound;

    function txSetButtonBusy(button, busy, busyText) {
        if (!button) return;
        if (!button.dataset.txOriginalText) button.dataset.txOriginalText = button.textContent;
        button.disabled = busy;
        button.classList.toggle("opacity-60", busy);
        button.classList.toggle("cursor-wait", busy);
        button.textContent = busy ? busyText : button.dataset.txOriginalText;
    }

    function txUpdateWalletFromResponse(response) {
        const wallet = response?.data?.wallet;
        if (!wallet) return;
        TX_BACKEND_FUTURES.wallet = wallet;
        TX_BACKEND_FUTURES.walletLoaded = true;
        updateWalletUI();
    }

    function txRenderCurrentTableInstantly() {
        renderActiveBackendTableFromCache();
        txRefreshVisibleTradingRows(true);
        txUpdatePositionsDomCount();
    }

    function txMarkTradeSeen(trade) {
        const id = txGetId(trade);
        if (id) TX_SEEN_CLOSE_TRADES.add(String(id));
    }

    placeOrder = function txPlaceOrderInstantNoReload() {
        if (!isLoggedIn()) {
            showOrderMessage("Please login first.", "error");
            return;
        }

        const pair = getPair();
        const qty = getQuantity();
        const leverage = getLeverage();
        const orderType = String(state.orderType || "MARKET");
        const limitPrice = Number(elements.limitPriceInput?.value || 0);
        const stopPrice = Number(document.getElementById("stopPriceInput")?.value || 0);

        if (!qty || qty < pair.minQty) return showOrderMessage(`Minimum quantity is ${pair.minQty}.`, "error");
        if (!leverage || leverage < 1) return showOrderMessage("Valid leverage required.", "error");
        if (leverage > getMaxLeverageForPair()) return showOrderMessage(`Maximum leverage for ${pair.label} is ${getMaxLeverageForPair()}x.`, "error");
        if (["LIMIT", "STOP_LIMIT"].includes(orderType) && limitPrice <= 0) return showOrderMessage("Valid limit price required.", "error");
        if (["STOP_LIMIT", "STOP_MARKET"].includes(orderType) && stopPrice <= 0) return showOrderMessage("Valid stop price required.", "error");

        const payload = placeOrderPayload();
        const tpSlError = txValidateTpSlPayload(payload);
        if (tpSlError) return showOrderMessage(tpSlError, "error");

        const runExecution = async () => {
            const submitBtn = elements.placeOrderBtn || elements.buyBtn || elements.sellBtn;
            const originalText = submitBtn ? submitBtn.textContent : (payload.side === "sell" ? "Sell / Short" : "Buy / Long");

            // 1. Instant 0ms optimistic UI paint
            const optimistic = txApplyOptimisticOrder(payload);

            // Clear inputs immediately for seamless user experience
            if (elements.quantityInput) elements.quantityInput.value = "";
            const checkbox = document.getElementById("tpSlCheckbox");
            if (checkbox) checkbox.checked = false;
            const fields = document.getElementById("tpSlFields");
            if (fields) fields.classList.add("hidden");
            const tpInput = document.getElementById("takeProfitInput");
            if (tpInput) tpInput.value = "";
            const slInput = document.getElementById("stopLossInput");
            if (slInput) slInput.value = "";

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Executing...";
            }

            try {
                const response = await txApiRequestWithTimeout("/trading/order", {
                    method: "POST",
                    body: JSON.stringify(payload)
                }, TX_ACTION_TIMEOUT_MS);

                txResolveOptimisticOrder(response, payload, optimistic);
                txEndOptimisticAction();
                showOrderMessage("Order placed and executed successfully.", "success");
            } catch (error) {
                txRestoreFuturesState(optimistic.snapshot);
                txEndOptimisticAction();

                const errors = error?.errors || {};
                const message = `${error?.message || ""} ${Object.values(errors).join(" ")}`.toLowerCase();
                if (errors.kyc_required || errors.kyc || message.includes("kyc") || message.includes("identity verification")) {
                    showOrderMessage("KYC verification is required. Redirecting to KYC...", "error");
                    window.setTimeout(() => {
                        window.location.href = `./kyc.html?next=${encodeURIComponent("./futures.html")}&reason=trading`;
                    }, 1200);
                    return;
                }
                showOrderMessage(showApiError(error, "Order failed."), "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }
            }
        };

        const reminders = localStorage.getItem("tx_confirm_reminders") || "Market, Limit, Stop-Limit";
        const reminderList = reminders.split(",").map(s => s.trim());
        const orderTypeLabel = orderType === "LIMIT" ? "Limit" : orderType === "MARKET" ? "Market" : "Stop-Limit";

        const isMobileView = window.innerWidth <= 1024;
        if (!isMobileView && reminderList.includes(orderTypeLabel)) {
            txShowFuturesConfirm({
                title: "Confirm Order Placement",
                message: `Are you sure you want to submit a ${orderTypeLabel} ${payload.side.toUpperCase()} order for ${qty} ${pair.label}?`,
                confirmText: "Submit Order",
                cancelText: "Cancel"
            }).then((confirmed) => {
                if (confirmed) {
                    runExecution();
                }
            });
        } else {
            runExecution();
        }
    };

    cancelOrder = function txCancelOrderInstant(orderId) {
        if (!orderId || String(orderId).startsWith("LOCAL-ORD-") || txIsPendingCancel(orderId)) return;

        const snapshot = txCloneFuturesState();
        txSetPendingCancel(orderId, true);
        txBeginOptimisticAction();
        TX_BACKEND_FUTURES.openOrders = txRemoveCacheItem(TX_BACKEND_FUTURES.openOrders || [], orderId);
        renderActiveBackendTableFromCache();
        txRefreshVisibleTradingRows(true);

        txRunAfterImmediatePaint(async () => {
            try {
                const response = await txApiRequestWithTimeout(`/trading/cancel/${encodeURIComponent(orderId)}`, {
                    method: "POST"
                }, TX_ACTION_TIMEOUT_MS);

                const order = response?.data?.order;
                if (order) TX_BACKEND_FUTURES.orders = txUpsertCacheItem(TX_BACKEND_FUTURES.orders || [], order);
                txUpdateWalletFromResponse(response);
                txSetPendingCancel(orderId, false);
                txEndOptimisticAction();
                renderActiveBackendTableFromCache();
                showOrderMessage(response.message || "Order cancelled successfully.", "success");
            } catch (error) {
                txSetPendingCancel(orderId, false);
                txRestoreFuturesState(snapshot);
                txEndOptimisticAction();
                showOrderMessage(showApiError(error, "Unable to cancel order."), "error");
            }
        });
    };

    closePosition = function txClosePositionInstant(positionId, triggerLabel = "") {
        if (!positionId || txIsPendingClose(positionId)) return;

        if (String(positionId).startsWith("LOCAL-POS-")) {
            txMarkLocalPositionClosed(positionId);
            txSetPendingClose(positionId, true);
            txApplyOptimisticClose(positionId);
            renderActiveBackendTableFromCache();
            txEndOptimisticAction();
            showOrderMessage("Position close submitted.", "success");
            return;
        }

        txSetPendingClose(positionId, true);
        const optimistic = txApplyOptimisticClose(positionId);
        // Force an immediate cache render so the row disappears even when its
        // DOM selector cannot be matched.
        renderActiveBackendTableFromCache();
        txRefreshVisibleTradingRows(true);
        showOrderMessage("Position closed successfully.", "success");

        txRunAfterImmediatePaint(async () => {
            try {
                const reason = txNormalizeCloseReason(triggerLabel);
                const response = await txApiRequestWithTimeout(`/trading/close-position/${encodeURIComponent(positionId)}`, {
                    method: "POST",
                    body: JSON.stringify({ reason })
                }, TX_ACTION_TIMEOUT_MS);

                txApplyCloseResponseToCache(response, positionId);
                txMarkTradeSeen(response?.data?.trade);
                txSetPendingClose(positionId, false);
                txEndOptimisticAction();
                renderActiveBackendTableFromCache();
                updateWalletUI();
                window.txPlayFuturesCloseSound();
            } catch (error) {
                txSetPendingClose(positionId, false);
                txRestoreFuturesState(optimistic.snapshot);
                txEndOptimisticAction();
                showOrderMessage(showApiError(error, "Unable to close position."), "error");
            }
        });
    };

    closeAllPositions = function txCloseAllInstantNoConfirmation() {
        if (TX_BACKEND_FUTURES.pendingCloseAll) return;

        const allPositions = (TX_BACKEND_FUTURES.positions || []).slice();
        if (!allPositions.length) return showOrderMessage("No open positions to close.", "error");

        const backendPositions = allPositions.filter((position) => {
            const id = txGetId(position);
            return id && !String(id).startsWith("LOCAL-POS-");
        });
        const optimistic = txCloneFuturesState();

        TX_BACKEND_FUTURES.pendingCloseAll = true;
        backendPositions.forEach((position) => txSetPendingClose(txGetId(position), true));
        allPositions.filter(txIsLocalOptimisticPosition).forEach((position) => txMarkLocalPositionClosed(txGetId(position)));
        txBeginOptimisticAction();
        txApplyOptimisticWalletCloseMany(allPositions);
        TX_BACKEND_FUTURES.positions = [];
        txSetActiveBottomTab("positions", false);
        renderPositionsTable();
        updateWalletUI();
        showOrderMessage("All positions closed successfully.", "success");

        // Local-only rows are already hidden. When no backend position exists,
        // complete immediately without opening a confirmation or waiting UI.
        if (!backendPositions.length) {
            TX_BACKEND_FUTURES.pendingCloseAll = false;
            txEndOptimisticAction();
            return;
        }

        txRunAfterImmediatePaint(async () => {
            try {
                const response = await txApiRequestWithTimeout("/trading/close-all-positions", {
                    method: "POST",
                    body: JSON.stringify({ reason: "manual" })
                }, Math.max(TX_ACTION_TIMEOUT_MS, backendPositions.length * 4000));

                const data = response?.data || {};
                (data.closed_positions || []).forEach((item) => {
                    if (item?.trade) {
                        TX_BACKEND_FUTURES.trades = txUpsertCacheItem(TX_BACKEND_FUTURES.trades || [], item.trade);
                        txMarkTradeSeen(item.trade);
                    }
                });
                TX_BACKEND_FUTURES.pendingCloseAll = false;
                backendPositions.forEach((position) => txSetPendingClose(txGetId(position), false));
                TX_BACKEND_FUTURES.positions = Array.isArray(data.positions) ? data.positions : [];
                if (data.wallet) {
                    TX_BACKEND_FUTURES.wallet = data.wallet;
                    TX_BACKEND_FUTURES.walletLoaded = true;
                }
                txEndOptimisticAction();
                renderActiveBackendTableFromCache();
                updateWalletUI();
                if (txToNumber(data.closed_count, 0) > 0) window.txPlayFuturesCloseSound();
            } catch (error) {
                TX_BACKEND_FUTURES.pendingCloseAll = false;
                backendPositions.forEach((position) => txSetPendingClose(txGetId(position), false));
                txRestoreFuturesState(optimistic);
                txEndOptimisticAction();
                showOrderMessage(showApiError(error, "Unable to close all positions."), "error");
            }
        });
    };

    // Checkbox off means TP/SL values are cleared and never sent.
    const txBindTpSlCheckbox = () => {
        const checkbox = document.getElementById("tpSlCheckbox");
        const fields = document.getElementById("tpSlFields");
        const tpInput = document.getElementById("takeProfitInput");
        const slInput = document.getElementById("stopLossInput");
        if (!checkbox || checkbox.dataset.txProductionBound === "1") return;
        checkbox.dataset.txProductionBound = "1";
        checkbox.addEventListener("change", () => {
            const enabled = checkbox.checked;
            fields?.classList.toggle("hidden", !enabled);
            if (tpInput) {
                tpInput.disabled = !enabled;
                if (!enabled) tpInput.value = "";
            }
            if (slInput) {
                slInput.disabled = !enabled;
                if (!enabled) slInput.value = "";
            }
        });
    };

    // Detect backend TP/SL/liquidation closes from the existing lightweight
    // data sync. No browser refresh is needed and automatic closes still sound.
    const txOriginalRefreshBackendFuturesData = refreshBackendFuturesData;
    refreshBackendFuturesData = async function txRefreshAndDetectServerCloses(force = false) {
        const result = await txOriginalRefreshBackendFuturesData(force);
        const closeTrades = (TX_BACKEND_FUTURES.trades || []).filter((trade) => String(trade.trade_type || "").toLowerCase() === "close");

        if (!txCloseTradeTrackerReady) {
            closeTrades.forEach(txMarkTradeSeen);
            txCloseTradeTrackerReady = true;
            return result;
        }

        const newTrades = closeTrades.filter((trade) => {
            const id = String(txGetId(trade) || "");
            return id && !TX_SEEN_CLOSE_TRADES.has(id);
        });
        newTrades.forEach(txMarkTradeSeen);

        if (newTrades.length) {
            window.txPlayFuturesCloseSound();
            txRenderCurrentTableInstantly();
        }
        return result;
    };

    let txSubAccountsLocalCache = [];

    async function txInitSubAccountsAndSelector() {
        if (!isLoggedIn()) return;
        // Fetch live USDT rate on init
        txFetchFuturesUsdtRate();
        try {
            const selector = document.getElementById("tradingAccountSelector");
            if (!selector) return;
            
            const response = await apiRequest("/user/sub-accounts");
            const subAccounts = (response.data || []).filter(sub => !sub.is_parent);
            txSubAccountsLocalCache = subAccounts;
            
            selector.innerHTML = `<option value="main">Main Trading Account</option>`;
            subAccounts.forEach(sub => {
                const opt = document.createElement("option");
                opt.value = sub.id;
                opt.textContent = sub.name;
                selector.appendChild(opt);
            });
            const createOpt = document.createElement("option");
            createOpt.value = "__create_new__";
            createOpt.textContent = "+ Create Sub Account";
            selector.appendChild(createOpt);
            
            let activeSubId = localStorage.getItem("traidiumx_active_user_id");
            if (activeSubId) {
                selector.value = activeSubId;
            } else {
                selector.value = "main";
            }

            const mobSelector = document.getElementById("tradingAccountSelectorMobile");
            if (mobSelector) {
                mobSelector.innerHTML = `<option value="main">Main Account</option>`;
                subAccounts.forEach(sub => {
                    const opt = document.createElement("option");
                    opt.value = sub.id;
                    opt.textContent = sub.name;
                    mobSelector.appendChild(opt);
                });
                const mobCreateOpt = document.createElement("option");
                mobCreateOpt.value = "__create_new__";
                mobCreateOpt.textContent = "+ Create Sub Account";
                mobSelector.appendChild(mobCreateOpt);

                mobSelector.value = activeSubId || "main";
            }

            const transferSelect = document.getElementById("subTransferAccount");
            if (transferSelect) {
                transferSelect.innerHTML = `<option value="main">Main Trading Account</option>`;
                subAccounts.forEach(sub => {
                    const opt = document.createElement("option");
                    opt.value = sub.id;
                    opt.textContent = sub.name;
                    transferSelect.appendChild(opt);
                });
            }
        } catch (e) {
            console.error("Failed to load sub accounts:", e);
        }
    }

    async function txRenderSubAccountsList() {
        const container = document.getElementById("subAccountsContainer");
        if (!container) return;
        try {
            const response = await apiRequest("/user/sub-accounts");
            const subAccounts = (response.data || []).filter(sub => !sub.is_parent);
            txSubAccountsLocalCache = subAccounts;
            if (subAccounts.length === 0) {
                container.innerHTML = `<p class="text-xs text-slate-500 font-semibold py-2">No sub accounts created yet.</p>`;
                return;
            }
            
            let html = "";
            subAccounts.forEach(sub => {
                const bal = sub.wallet ? sub.wallet.available_balance : 0.0;
                html += `
                    <div class="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-900/40 text-xs gap-2 min-w-0">
                        <div class="min-w-0 flex-1 pr-1">
                            <strong class="text-white font-black truncate block">${escapeHtml(sub.name)}</strong>
                            <p class="text-[10px] text-slate-500 mt-0.5 truncate">ID: ${sub.id}</p>
                        </div>
                        <div class="text-right shrink-0">
                            <strong class="text-cyan-300 font-black">${bal.toFixed(2)} USDT</strong>
                            <p class="text-[10px] text-slate-500 mt-0.5">Trading Balance</p>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = `<p class="text-xs text-red-400 font-semibold py-2">Failed to load sub accounts.</p>`;
        }
    }

    function escapeHtml(text) {
        return (text || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function txUpdateSubTransferPreview(rate) {
        const amountInput = document.getElementById("subTransferAmount");
        const directionSelect = document.getElementById("subTransferDirection");
        const previewEl = document.getElementById("subTransferPreview");
        if (!amountInput || !directionSelect || !previewEl) return;

        const amount = parseFloat(amountInput.value || 0);
        const dir = directionSelect.value;

        if (amount <= 0) {
            previewEl.textContent = `Rate: 1 USD = ₹${rate.toFixed(2)} INR. Enter amount to see preview.`;
            return;
        }

        if (dir === "main_to_sub") {
            const usdtEq = (amount / rate).toFixed(4);
            previewEl.innerHTML = `Rate: 1 USD = ₹${rate.toFixed(2)} INR<br/>Transferring <strong>₹${amount.toLocaleString()} INR</strong> will credit ≈ <strong>${usdtEq} USD</strong> to target account.`;
        } else {
            const inrEq = (amount * rate).toFixed(2);
            previewEl.innerHTML = `Rate: 1 USD = ₹${rate.toFixed(2)} INR<br/>Transferring <strong>${amount.toFixed(4)} USD</strong> will credit ≈ <strong>₹${parseFloat(inrEq).toLocaleString()} INR</strong> to Main Wallet.`;
        }
    }

    function txBindSubAccountEvents() {
        // Bind transfer preview update listeners
        const previewAmtInput = document.getElementById("subTransferAmount");
        const previewDirSelect = document.getElementById("subTransferDirection");
        if (previewAmtInput && previewDirSelect) {
            const onPreviewChange = () => txUpdateSubTransferPreview(TX_FUTURES_USDT_RATE);
            previewAmtInput.addEventListener("input", onPreviewChange);
            previewDirSelect.addEventListener("change", onPreviewChange);
            // Run initially
            onPreviewChange();
        }

        const maxBtn = document.getElementById("subTransferMaxBtn");
        if (maxBtn) {
            maxBtn.addEventListener("click", () => {
                const amountInput = document.getElementById("subTransferAmount");
                const dirSelect = document.getElementById("subTransferDirection");
                const targetSelect = document.getElementById("subTransferAccount");
                if (!amountInput || !dirSelect || !targetSelect) return;

                const dir = dirSelect.value;
                if (dir === "main_to_sub") {
                    const mainWallet = txGetMainWalletBucket();
                    const available = mainWallet ? mainWallet.available_balance : 0;
                    amountInput.value = available;
                } else {
                    const targetId = targetSelect.value;
                    const subAcc = txSubAccountsLocalCache.find(s => s.id === targetId);
                    const available = subAcc && subAcc.wallet ? subAcc.wallet.available_balance : 0;
                    amountInput.value = available;
                }
                amountInput.dispatchEvent(new Event("input"));
            });
        }

        const handleSubAccountSelectorChange = (e) => {
            const val = e.target.value;
            if (val === "__create_new__") {
                const activeSubId = localStorage.getItem("traidiumx_active_user_id") || "main";
                e.target.value = activeSubId;

                const subModal = document.getElementById("subAccountModal");
                if (subModal) {
                    subModal.classList.remove("hidden");
                    subModal.classList.add("flex");
                    txRenderSubAccountsList();
                }
                return;
            }

            if (val === "main") {
                localStorage.removeItem("traidiumx_active_user_id");
            } else {
                localStorage.setItem("traidiumx_active_user_id", val);
            }
            window.location.reload();
        };

        const selector = document.getElementById("tradingAccountSelector");
        if (selector) {
            selector.addEventListener("change", handleSubAccountSelectorChange);
        }

        const mobSelector = document.getElementById("tradingAccountSelectorMobile");
        if (mobSelector) {
            mobSelector.addEventListener("change", handleSubAccountSelectorChange);
        }

        const subModal = document.getElementById("subAccountModal");
        const subOpenBtn = document.getElementById("subAccountSettingsBtn");
        const mobSubOpenBtn = document.getElementById("subAccountSettingsBtnMobile");
        const subCloseBtn = document.getElementById("subAccountModalClose");

        if (subOpenBtn && subModal) {
            subOpenBtn.addEventListener("click", () => {
                subModal.classList.remove("hidden");
                subModal.classList.add("flex");
                txRenderSubAccountsList();
            });
        }
        if (mobSubOpenBtn && subModal) {
            mobSubOpenBtn.addEventListener("click", () => {
                subModal.classList.remove("hidden");
                subModal.classList.add("flex");
                txRenderSubAccountsList();
            });
        }
        if (subCloseBtn && subModal) {
            subCloseBtn.addEventListener("click", () => {
                subModal.classList.add("hidden");
                subModal.classList.remove("flex");
            });
        }

        const tabList = document.getElementById("subTabListBtn");
        const tabTransfer = document.getElementById("subTabTransferBtn");
        const panelList = document.getElementById("subPanelList");
        const panelTransfer = document.getElementById("subPanelTransfer");

        if (tabList && tabTransfer && panelList && panelTransfer) {
            tabList.addEventListener("click", () => {
                tabList.className = "px-4 py-2 text-xs font-black uppercase tracking-wider text-cyan-300 border-b-2 border-cyan-400";
                tabTransfer.className = "px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-400 hover:text-white";
                panelList.classList.remove("hidden");
                panelTransfer.classList.add("hidden");
            });
            tabTransfer.addEventListener("click", () => {
                tabTransfer.className = "px-4 py-2 text-xs font-black uppercase tracking-wider text-cyan-300 border-b-2 border-cyan-400";
                tabList.className = "px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-400 hover:text-white";
                panelTransfer.classList.remove("hidden");
                panelList.classList.add("hidden");
            });
        }

        const createForm = document.getElementById("createSubForm");
        if (createForm) {
            createForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const input = document.getElementById("newSubNameInput");
                const msg = document.getElementById("createSubMessage");
                if (!input || !msg) return;
                
                msg.classList.remove("hidden", "text-red-400", "text-emerald-400");
                msg.classList.add("text-slate-400");
                msg.textContent = "Creating sub account...";
                
                try {
                    await apiRequest("/user/sub-accounts", {
                        method: "POST",
                        body: JSON.stringify({ name: input.value })
                    });
                    input.value = "";
                    msg.className = "text-xs font-bold text-emerald-400 text-cyan-300";
                    msg.textContent = "Sub account created successfully!";
                    txRenderSubAccountsList();
                    txInitSubAccountsAndSelector();
                } catch (err) {
                    msg.className = "text-xs font-bold text-red-400";
                    msg.textContent = err.message || "Failed to create sub account.";
                }
            });
        }

        const transferForm = document.getElementById("subTransferForm");
        if (transferForm) {
            transferForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const targetAcc = document.getElementById("subTransferAccount").value;
                const dir = document.getElementById("subTransferDirection").value;
                const amount = document.getElementById("subTransferAmount").value;
                const msg = document.getElementById("subTransferMessage");
                if (!msg) return;
                
                msg.classList.remove("hidden", "bg-red-400/20", "text-red-300", "bg-emerald-400/20", "text-emerald-300");
                msg.className = "text-xs font-bold p-3 rounded-xl bg-slate-800/40 text-slate-300";
                msg.textContent = "Processing transfer...";
                
                try {
                    await apiRequest("/wallet/transfer-sub", {
                        method: "POST",
                        body: JSON.stringify({
                            amount: amount,
                            direction: dir,
                            sub_user_id: targetAcc
                        })
                    });
                    document.getElementById("subTransferAmount").value = "";
                    msg.className = "text-xs font-bold p-3 rounded-xl bg-emerald-400/20 text-emerald-300";
                    msg.textContent = "Transfer completed successfully!";
                    txRenderSubAccountsList();
                    
                    setTimeout(() => {
                        window.location.reload();
                    }, 1200);
                } catch (err) {
                    msg.className = "text-xs font-bold p-3 rounded-xl bg-red-400/20 text-red-300";
                    msg.textContent = err.message || "Failed to execute transfer.";
                }
            });
        }
    }

    window.txRenderSubAccountsList = txRenderSubAccountsList;
    window.txUpdateSubTransferPreview = txUpdateSubTransferPreview;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            txInitSubAccountsAndSelector();
            txBindSubAccountEvents();
        });
    } else {
        txInitSubAccountsAndSelector();
        txBindSubAccountEvents();
    }

    
    document.addEventListener("DOMContentLoaded", txBindTpSlCheckbox, { once: true });

    window.addEventListener("traidiumx:currency-change", (event) => {
        window.location.reload();
    });
})();

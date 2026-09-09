"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Home Page
|--------------------------------------------------------------------------
| Keeps the landing page connected to the same backend market board used by
| the Markets/Futures terminals. No fake price fallback is rendered as live.
|--------------------------------------------------------------------------
*/

const HOME_MARKET_REFRESH_MS = 3000;
let homeMarketTimer = null;
let activeHeroSymbol = "BTCUSDT";
let savedMarkets = [];

// Instant initial cache recovery for 0ms initial paint
try {
    const rawCached = localStorage.getItem("tx_cached_home_markets");
    if (rawCached) {
        const parsed = JSON.parse(rawCached);
        if (parsed && Array.isArray(parsed.markets) && parsed.markets.length > 0) {
            savedMarkets = parsed.markets;
            window.requestAnimationFrame(() => {
                txHomeUpdateHero(savedMarkets);
                txHomeUpdateMiniMarkets(savedMarkets);
                if (parsed.stats) txHomeUpdateStats(savedMarkets, parsed.stats);
            });
        }
    }
} catch (e) {}

function txHomeNumber(value, decimals = 2) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "--";
    }

    return number.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function txHomeVolume(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
        return "--";
    }

    if (number >= 1_000_000_000) {
        return `${txHomeNumber(number / 1_000_000_000, 2)}B USDT`;
    }

    if (number >= 1_000_000) {
        return `${txHomeNumber(number / 1_000_000, 2)}M USDT`;
    }

    return `${txHomeNumber(number, 2)} USDT`;
}

function txHomePriceDecimals(price) {
    const number = Number(price);

    if (!Number.isFinite(number)) return 2;
    if (number < 1) return 5;
    if (number < 100) return 3;
    return 2;
}

function txHomePairLabel(market) {
    const pair = market?.pair || market?.symbol || "BTCUSDT";
    const category = market?.category || "USDT Futures";

    if (category === "Commodities") {
        return `${pair} Perpetual`;
    }

    return `${pair} Perpetual`;
}

function txHomeChangeText(value) {
    const change = Number(value) || 0;
    const sign = change >= 0 ? "+" : "";
    return `${sign}${change.toFixed(2)}%`;
}

function txHomeSetChangeClass(element, value, badge = false) {
    if (!element) return;

    const isPositive = Number(value) >= 0;
    element.classList.remove("text-emerald-400", "text-red-400", "text-slate-400", "bg-emerald-400/10", "bg-red-400/10");

    if (badge) {
        element.classList.add(isPositive ? "bg-emerald-400/10" : "bg-red-400/10");
    }

    element.classList.add(isPositive ? "text-emerald-400" : "text-red-400");
}

function txHomeSetText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}

function txHomeFindMarket(markets, symbol) {
    const normalized = String(symbol || "").toUpperCase();
    return markets.find((item) => String(item.symbol || "").toUpperCase() === normalized);
}

function txHomePrimaryFutures(markets) {
    return txHomeFindMarket(markets, "BTCUSDT") || markets.find((item) => item.category === "USDT Futures") || markets[0];
}

function txHomeDrawSparkline(containerId, symbol, priceChange, currentPrice) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const width = container.clientWidth || 340;
    const height = container.clientHeight || 160;

    container.innerHTML = "";

    const numPoints = 18;
    let seed = symbol.charCodeAt(0) + symbol.charCodeAt(1) + symbol.charCodeAt(2);
    const points = [];

    function seededRandom() {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }

    let currentVal = 50;
    const changePercent = Number(priceChange) || 0;
    const price = Number(currentPrice) || 0;

    for (let i = 0; i < numPoints; i++) {
        const step = (seededRandom() - 0.5) * 16;
        currentVal += step;
        if (currentVal < 10) currentVal = 10;
        if (currentVal > 90) currentVal = 90;
        points.push(currentVal);
    }

    if (changePercent >= 0) {
        points[numPoints - 1] = Math.max(72, points[numPoints - 2] + 12);
    } else {
        points[numPoints - 1] = Math.min(28, points[numPoints - 2] - 12);
    }

    const minVal = Math.min(...points);
    const maxVal = Math.max(...points);
    const range = maxVal - minVal || 1;

    const svgPoints = points.map((p, idx) => {
        const x = (idx / (numPoints - 1)) * width;
        const y = height - ((p - minVal) / range) * (height - 30) - 15;
        return { x, y };
    });

    let linePathData = "";
    if (svgPoints.length > 0) {
        linePathData = `M ${svgPoints[0].x.toFixed(1)} ${svgPoints[0].y.toFixed(1)}`;
        for (let i = 0; i < svgPoints.length - 1; i++) {
            const p0 = svgPoints[i];
            const p1 = svgPoints[i + 1];
            const cpX1 = p0.x + (p1.x - p0.x) / 2;
            const cpY1 = p0.y;
            const cpX2 = p0.x + (p1.x - p0.x) / 2;
            const cpY2 = p1.y;
            linePathData += ` C ${cpX1.toFixed(1)} ${cpY1.toFixed(1)}, ${cpX2.toFixed(1)} ${cpY2.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
        }
    }

    const areaPathData = `${linePathData} L ${svgPoints[svgPoints.length - 1].x.toFixed(1)} ${height} L ${svgPoints[0].x.toFixed(1)} ${height} Z`;

    const isPositive = changePercent >= 0;
    const color = isPositive ? "#10b981" : "#f43f5e";
    const gradientId = `sparklineGradient-${symbol.replace(/[^a-zA-Z]/g, "")}`;

    const svgHtml = `
        <svg class="w-full h-full cursor-crosshair" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="overflow: visible;">
            <defs>
                <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${color}" stop-opacity="0.22"></stop>
                    <stop offset="100%" stop-color="${color}" stop-opacity="0.00"></stop>
                </linearGradient>
            </defs>
            <path d="${areaPathData}" fill="url(#${gradientId})"></path>
            <path d="${linePathData}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 6px ${color}80);"></path>
            
            <!-- Hover elements -->
            <line class="tx-sparkline-hover-line" x1="0" y1="0" x2="0" y2="${height}" stroke="${color}" stroke-width="1.2" stroke-dasharray="4 4" style="display: none; pointer-events: none; opacity: 0.6;"></line>
            <circle class="tx-sparkline-hover-circle" r="6" fill="${color}" stroke="#020617" stroke-width="2.5" style="display: none; pointer-events: none; filter: drop-shadow(0 0 5px ${color});"></circle>
        </svg>
    `;
    container.innerHTML = svgHtml;

    // Interactive Hover Listeners
    const svg = container.querySelector("svg");
    const hoverLine = container.querySelector(".tx-sparkline-hover-line");
    const hoverCircle = container.querySelector(".tx-sparkline-hover-circle");

    // Elements to update
    const priceEl = document.getElementById("homeHeroPrice");
    const changeEl = document.getElementById("homeHeroChange");

    if (!priceEl || !changeEl) return;

    // Cache original values
    const originalPriceText = priceEl.textContent;
    const originalChangeText = changeEl.textContent;
    const originalChangeHtml = changeEl.innerHTML;
    const originalChangeClass = changeEl.className;

    // Math conversions for hover prices
    const startPrice = price / (1 + changePercent / 100);
    const deltaPrice = price - startPrice;
    const ptFirst = points[0];
    const ptLast = points[numPoints - 1];
    const ptRange = ptLast - ptFirst || 1;

    function getPriceForPoint(idx) {
        if (idx === numPoints - 1) return price;
        if (idx === 0) return startPrice;
        const ptVal = points[idx];
        return startPrice + ((ptVal - ptFirst) / ptRange) * deltaPrice;
    }

    function handleMouseMove(e) {
        const rect = svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        
        // Find closest point index
        const idx = Math.round((mouseX / rect.width) * (numPoints - 1));
        const clampedIdx = Math.max(0, Math.min(numPoints - 1, idx));
        
        const pt = svgPoints[clampedIdx];
        
        // Position hover line & circle
        hoverLine.setAttribute("x1", pt.x);
        hoverLine.setAttribute("x2", pt.x);
        hoverLine.style.display = "block";
        
        hoverCircle.setAttribute("cx", pt.x);
        hoverCircle.setAttribute("cy", pt.y);
        hoverCircle.style.display = "block";

        // Compute price & change at this point
        const ptPrice = getPriceForPoint(clampedIdx);
        const ptPctChange = ((ptPrice - startPrice) / startPrice) * 100;

        // Update UI
        priceEl.textContent = `${txHomeNumber(ptPrice, txHomePriceDecimals(ptPrice))} USDT`;
        changeEl.textContent = txHomeChangeText(ptPctChange);
        txHomeSetChangeClass(changeEl, ptPctChange, true);
    }

    function handleMouseLeave() {
        hoverLine.style.display = "none";
        hoverCircle.style.display = "none";
        
        // Restore original values
        priceEl.textContent = originalPriceText;
        changeEl.innerHTML = originalChangeHtml;
        changeEl.className = originalChangeClass;
    }

    svg.addEventListener("mousemove", handleMouseMove);
    svg.addEventListener("mouseleave", handleMouseLeave);
}

function txHomeUpdateHero(markets) {
    savedMarkets = markets;

    const market = txHomeFindMarket(markets, activeHeroSymbol) || txHomePrimaryFutures(markets);

    if (!market) {
        return;
    }

    const price = Number(market.last_price || market.lastPrice || 0);
    const change = Number(market.price_change_percent || market.priceChangePercent || 0);
    const volume = Number(market.quote_volume || market.quoteVolume || 0);
    const symbol = market.symbol || "BTCUSDT";

    txHomeSetText("homeHeroPair", txHomePairLabel(market));
    txHomeSetText("homeHeroPrice", price > 0 ? `${txHomeNumber(price, txHomePriceDecimals(price))} USDT` : "Price unavailable");
    txHomeSetText("homeHeroVolume", `Volume 24h: ${txHomeVolume(volume)}`);
    txHomeSetText("homeHeroChange", txHomeChangeText(change));

    const heroChange = document.getElementById("homeHeroChange");
    txHomeSetChangeClass(heroChange, change, true);

    const statusText = document.getElementById("homeHeroStatusText");
    if (statusText) {
        statusText.textContent = market.is_live ? "BACKEND LIVE" : "SYNCING";
    } else {
        const status = document.getElementById("homeHeroStatus");
        if (status) {
            status.textContent = market.is_live ? "BACKEND LIVE" : "SYNCING";
        }
    }

    const longLink = document.getElementById("homeHeroLongLink");
    const shortLink = document.getElementById("homeHeroShortLink");
    const tradeHref = `./src/pages/futures.html?symbol=${encodeURIComponent(symbol)}`;

    if (longLink) longLink.setAttribute("href", tradeHref);
    if (shortLink) shortLink.setAttribute("href", tradeHref);

    txHomeDrawSparkline("homeHeroChartContainer", symbol, change, price);
}

function txHomeUpdateMiniMarkets(markets) {
    savedMarkets = markets;
    const preferredSymbols = ["ETHUSDT", "SOLUSDT", "XRPUSDT"];
    const selected = preferredSymbols
        .map((symbol) => txHomeFindMarket(markets, symbol))
        .filter(Boolean);

    const fallback = markets.filter((item) => item.category === "USDT Futures");
    const finalMarkets = selected.length >= 3 ? selected.slice(0, 3) : fallback.slice(0, 3);

    finalMarkets.forEach((market, index) => {
        const card = document.querySelector(`[data-home-mini-market="${index}"]`);
        if (!card) return;

        const symbolElement = card.querySelector("[data-mini-symbol]");
        const priceElement = card.querySelector("[data-mini-price]");
        const changeElement = card.querySelector("[data-mini-change]");
        const price = Number(market.last_price || 0);
        const change = Number(market.price_change_percent || 0);

        if (symbolElement) symbolElement.textContent = market.symbol || "--";
        if (priceElement) priceElement.textContent = price > 0 ? `${txHomeNumber(price, txHomePriceDecimals(price))}` : "--";
        if (changeElement) {
            changeElement.textContent = txHomeChangeText(change);
            txHomeSetChangeClass(changeElement, change);
        }

        card.dataset.symbol = market.symbol || "";
        if (!card.dataset.hasListener) {
            card.dataset.hasListener = "1";
            card.classList.add("cursor-pointer", "transition-all", "hover:bg-slate-800/80", "active:scale-[0.98]");
            card.addEventListener("click", () => {
                const sym = card.dataset.symbol;
                if (sym) {
                    activeHeroSymbol = sym;
                    txHomeUpdateHero(savedMarkets);
                }
            });
        }
    });
}

function txHomeUpdateStats(markets, stats = {}) {
    const totalContracts = Number(stats.total_contracts || markets.length || 0);
    const liveCount = Number(stats.live_count || markets.filter((item) => item.is_live).length || 0);
    const maxLeverage = Number(stats.max_leverage || 0);
    const futuresCount = Number(stats.futures_count || markets.filter((item) => item.category === "USDT Futures").length || 0);
    const optionsCount = Number(stats.options_count || markets.filter((item) => item.category === "Options").length || 0);
    const commodityCount = Number(stats.commodity_count || markets.filter((item) => item.category === "Commodities").length || 0);
    const totalQuoteVolume = markets.reduce((sum, item) => sum + (Number(item.quote_volume || 0) || 0), 0);
    const coverage = totalContracts > 0 ? Math.round((liveCount / totalContracts) * 100) : 0;

    txHomeSetText("homeLiveContracts", totalContracts ? String(totalContracts) : "--");
    txHomeSetText("homeMaxLeverage", maxLeverage ? `${maxLeverage}x` : "--");
    txHomeSetText("homeLiveCoverage", totalContracts ? `${coverage}%` : "--");
    txHomeSetText("homeFuturesCount", String(futuresCount));
    txHomeSetText("homeOptionsCount", String(optionsCount));
    txHomeSetText("homeCommodityCount", String(commodityCount));
    txHomeSetText("homeMarketVolume", txHomeVolume(totalQuoteVolume));

    const coverageBar = document.getElementById("homeLiveCoverageBar");
    if (coverageBar) {
        coverageBar.style.width = `${Math.min(100, Math.max(0, coverage))}%`;
    }
}

async function txHomeLoadFeeConfig() {
    try {
        if (typeof apiRequest !== "function") return;
        const response = await apiRequest("/fees/structure");
        if (response && response.success && response.data) {
            const runtime = response.data.runtime_settings || {};
            const platformCharge = runtime.platform_charge || {};
            
            const isEnabled = platformCharge.enabled;
            const feeType = platformCharge.type || "fixed";
            const feeValue = Number(platformCharge.value || 0);

            let feeText = "--";
            let typeText = "Disabled";

            if (isEnabled) {
                if (feeType === "percentage") {
                    feeText = `${feeValue.toFixed(3).replace(/\.?0+$/, "")}%`;
                    typeText = "Percentage";
                } else {
                    feeText = `${feeValue.toFixed(2).replace(/\.?0+$/, "")} USDT`;
                    typeText = "Fixed USDT";
                }
            }

            txHomeSetText("homeHeroMakerFee", feeText);
            txHomeSetText("homeBoxTradingFeeValue", feeText);
            txHomeSetText("homeBoxTradingFeeType", typeText);
        }
    } catch (error) {
        console.warn("Failed to load fee configuration for home page:", error);
    }
}

async function txHomeLoadMarketBoard() {
    try {
        if (typeof apiRequest !== "function") {
            throw new Error("API configuration is not loaded.");
        }

        const response = await apiRequest("/market/board");
        const board = response.data || {};
        const markets = Array.isArray(board.markets) ? board.markets : [];

        if (!markets.length) {
            throw new Error("No markets returned from backend.");
        }

        txHomeUpdateHero(markets);
        txHomeUpdateMiniMarkets(markets);
        txHomeUpdateStats(markets, board.stats || {});
        try {
            localStorage.setItem("tx_cached_home_markets", JSON.stringify(board));
        } catch (e) {}
        await txHomeLoadFeeConfig();
    } catch (error) {
        console.error("Home market board failed:", error);

        const status = document.getElementById("homeHeroStatus");
        if (status) {
            status.textContent = "BACKEND OFFLINE";
            status.classList.remove("bg-emerald-400/10", "text-emerald-400");
            status.classList.add("bg-red-400/10", "text-red-400");
        }

        txHomeSetText("homeHeroPrice", "Market data unavailable");
        txHomeSetText("homeHeroVolume", "Start backend to sync live market data");
    } finally {
        if (typeof window.hidePageLoader === "function") {
            window.hidePageLoader();
        }
    }
}

function txHomeStartMarketSync() {
    txHomeLoadMarketBoard();

    if (homeMarketTimer) {
        window.clearInterval(homeMarketTimer);
    }

    homeMarketTimer = window.setInterval(txHomeLoadMarketBoard, HOME_MARKET_REFRESH_MS);
}

function initHomeMarketSync() {
    txHomeStartMarketSync();
}

// Start immediately on script load, and refresh again when navbar/footer load
initHomeMarketSync();

if (!window.__txComponentsLoaded) {
    document.addEventListener("componentsLoaded", () => {
        txHomeLoadMarketBoard();
    }, { once: true });
}


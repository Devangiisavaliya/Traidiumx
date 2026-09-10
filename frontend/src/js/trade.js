/**
 * TraidiumX - Unified Crypto Trade Engine (Spot & Instant Convert)
 * Integrated Real-Time TradingView Advanced Chart, Binance WebSocket & Portfolio Sync
 */
"use strict";

(function() {
    // Available Trading Pairs
    const PAIRS = [
        { symbol: "BTCUSDT", base: "BTC", quote: "USDT", name: "Bitcoin", price: 88450.00, change: 3.42, high: 89240.00, low: 85120.50, volBase: 28491.42, volQuote: 2519984920, precision: 2, icon: "₿", category: "layer1" },
        { symbol: "ETHUSDT", base: "ETH", quote: "USDT", name: "Ethereum", price: 3480.50, change: 2.15, high: 3540.00, low: 3390.20, volBase: 142850.10, volQuote: 497118348, precision: 2, icon: "Ξ", category: "layer1" },
        { symbol: "SOLUSDT", base: "SOL", quote: "USDT", name: "Solana", price: 185.75, change: 5.82, high: 189.50, low: 174.20, volBase: 892410.00, volQuote: 165765157, precision: 2, icon: "◎", category: "layer1" },
        { symbol: "BNBUSDT", base: "BNB", quote: "USDT", name: "BNB", price: 625.30, change: -0.85, high: 638.00, low: 618.00, volBase: 125000.00, volQuote: 78162500, precision: 2, icon: "❖", category: "layer1" },
        { symbol: "XRPUSDT", base: "XRP", quote: "USDT", name: "Ripple", price: 1.4250, change: 8.94, high: 1.4800, low: 1.3050, volBase: 5200000.00, volQuote: 7410000, precision: 4, icon: "✕", category: "layer1" },
        { symbol: "DOGEUSDT", base: "DOGE", quote: "USDT", name: "Dogecoin", price: 0.2450, change: 12.30, high: 0.2600, low: 0.2180, volBase: 12400000.00, volQuote: 3038000, precision: 4, icon: "Ð", category: "meme" },
        { symbol: "ADAUSDT", base: "ADA", quote: "USDT", name: "Cardano", price: 0.8240, change: -1.45, high: 0.8500, low: 0.8050, volBase: 4100000.00, volQuote: 3378400, precision: 4, icon: "₳", category: "layer1" },
        { symbol: "AVAXUSDT", base: "AVAX", quote: "USDT", name: "Avalanche", price: 34.60, change: 4.12, high: 35.80, low: 32.90, volBase: 310000.00, volQuote: 10726000, precision: 2, icon: "▲", category: "layer1" },
        { symbol: "LINKUSDT", base: "LINK", quote: "USDT", name: "Chainlink", price: 18.90, change: 1.75, high: 19.40, low: 18.20, volBase: 450000.00, volQuote: 8505000, precision: 2, icon: "⬡", category: "defi" }
    ];

    // State
    let currentPair = PAIRS[0];
    let currentOrderSide = "buy"; // "buy" | "sell"
    let currentOrderType = "limit"; // "limit" | "market" | "stop-limit"
    let currentOrderBookMode = "both"; // "both" | "bids" | "asks"
    let userHasManuallyEditedPrice = false;

    // WebSocket Reference
    let ws = null;
    let wsReconnectTimer = null;

    // User Holdings State (synced to localStorage)
    const DEFAULT_HOLDINGS = {
        USDT: 10000.00,
        BTC: 0.45,
        ETH: 2.50,
        SOL: 15.00,
        INR: 50000.00,
        BNB: 1.20,
        XRP: 500.00,
        DOGE: 2000.00,
        ADA: 300.00,
        AVAX: 10.00,
        LINK: 40.00
    };

    let userHoldings = {};
    let openOrders = [];
    let orderHistory = [];
    let tradeHistory = [];

    // Conversion Guaranteed Quote Countdown
    let convertCountdown = 5;
    let convertTimerInterval = null;

    // Audio Context for subtle sound FX
    let audioCtx = null;
    function playAudioTone(type) {
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === "suspended") {
                audioCtx.resume();
            }
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            if (type === "success") {
                osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
                osc.frequency.exponentialRampToValueAtTime(880.00, audioCtx.currentTime + 0.12); // A5
                gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.18);
            } else if (type === "cancel") {
                osc.frequency.setValueAtTime(440.00, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(220.00, audioCtx.currentTime + 0.14);
                gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.16);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.16);
            }
        } catch (e) {}
    }

    // Toast Notification System
    function showToast(title, message, type = "success") {
        const container = document.getElementById("txTradeToastContainer");
        if (!container) return;

        const toast = document.createElement("div");
        toast.className = "flex items-center gap-3 p-3.5 rounded-2xl bg-[#091224] border border-cyan-400/30 text-white shadow-2xl backdrop-blur-xl transition-all transform duration-300 translate-y-[-10px] opacity-0 pointer-events-auto";
        
        let iconHtml = `<div class="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✓</div>`;
        if (type === "error") {
            toast.classList.replace("border-cyan-400/30", "border-rose-500/40");
            iconHtml = `<div class="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">✕</div>`;
        } else if (type === "info") {
            iconHtml = `<div class="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">ℹ</div>`;
        }

        toast.innerHTML = `
            ${iconHtml}
            <div class="flex-1 min-w-0">
                <h4 class="text-xs font-black text-white">${title}</h4>
                <p class="text-[11px] font-medium text-slate-300 truncate">${message}</p>
            </div>
            <button type="button" class="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 cursor-pointer">✕</button>
        `;

        toast.querySelector("button").addEventListener("click", () => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(-10px)";
            setTimeout(() => toast.remove(), 250);
        });

        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = "1";
            toast.style.transform = "translateY(0)";
        });

        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.opacity = "0";
                toast.style.transform = "translateY(-10px)";
                setTimeout(() => toast.remove(), 250);
            }
        }, 4500);
    }

    // Load / Save Local State
    function loadLocalState() {
        try {
            const savedHoldings = localStorage.getItem("tx_user_holdings");
            userHoldings = savedHoldings ? JSON.parse(savedHoldings) : { ...DEFAULT_HOLDINGS };

            const savedOpen = localStorage.getItem("tx_open_orders");
            openOrders = savedOpen ? JSON.parse(savedOpen) : [];

            const savedOrderHist = localStorage.getItem("tx_order_history");
            orderHistory = savedOrderHist ? JSON.parse(savedOrderHist) : [];

            const savedTradeHist = localStorage.getItem("tx_trade_history");
            tradeHistory = savedTradeHist ? JSON.parse(savedTradeHist) : [];
        } catch (e) {
            userHoldings = { ...DEFAULT_HOLDINGS };
            openOrders = [];
            orderHistory = [];
            tradeHistory = [];
        }
    }

    function saveLocalState() {
        try {
            localStorage.setItem("tx_user_holdings", JSON.stringify(userHoldings));
            localStorage.setItem("tx_open_orders", JSON.stringify(openOrders));
            localStorage.setItem("tx_order_history", JSON.stringify(orderHistory));
            localStorage.setItem("tx_trade_history", JSON.stringify(tradeHistory));
        } catch (e) {}
    }

    // Formatters
    function formatCurrency(val, precision = 2) {
        if (val === undefined || val === null || isNaN(val)) return "0.00";
        return Number(val).toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision });
    }

    function formatNumber(val, decimals = 4) {
        if (val === undefined || val === null || isNaN(val)) return "0.00";
        return Number(val).toFixed(decimals);
    }

    // ========================================================
    // REAL TRADINGVIEW ADVANCED CHART EMBEDDING
    // ========================================================
    function loadTradingViewChart(symbolName = currentPair.symbol) {
        const chartContainer = document.getElementById("txTradingViewChartContainer");
        if (!chartContainer) return;

        chartContainer.innerHTML = "";

        const widgetWrap = document.createElement("div");
        widgetWrap.className = "tradingview-widget-container";
        widgetWrap.style.height = "100%";
        widgetWrap.style.width = "100%";

        const widgetDiv = document.createElement("div");
        widgetDiv.className = "tradingview-widget-container__widget";
        widgetDiv.style.height = "100%";
        widgetDiv.style.width = "100%";

        widgetWrap.appendChild(widgetDiv);
        chartContainer.appendChild(widgetWrap);

        const isLight = document.documentElement.classList.contains("light") || (localStorage.getItem("traidiumx_theme") || "dark") === "light";
        const script = document.createElement("script");
        script.type = "text/javascript";
        script.async = true;
        script.src = `https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js?v=${Date.now()}`;
        script.innerHTML = JSON.stringify({
            autosize: true,
            symbol: `BINANCE:${symbolName}`,
            interval: "15",
            timezone: "Asia/Kolkata",
            theme: isLight ? "light" : "dark",
            colorTheme: isLight ? "light" : "dark",
            style: "1",
            locale: "en",
            toolbar_bg: isLight ? "#ffffff" : "#091224",
            backgroundColor: isLight ? "#ffffff" : "#050b17",
            gridColor: isLight ? "#f1f5f9" : "rgba(30, 41, 59, 0.4)",
            enable_publishing: false,
            hide_top_toolbar: false,
            hide_legend: false,
            hide_side_toolbar: false,
            allow_symbol_change: true,
            save_image: true,
            withdateranges: true,
            calendar: false,
            details: false,
            hotlist: false,
            support_host: "https://www.tradingview.com",
            studies: []
        });

        widgetWrap.appendChild(script);
    }

    window.loadTradingViewChart = loadTradingViewChart;

    // Connect to Live Binance WebSocket for Orderbook, Recent Trades & Ticker stats
    function connectBinanceWs() {
        if (ws) {
            try { ws.close(); } catch (e) {}
        }

        const symbol = currentPair.symbol.toLowerCase();
        const wsUrl = `wss://stream.binance.com:9443/ws/${symbol}@trade/${symbol}@ticker`;

        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log("[TraidiumX] Binance WebSocket connected for " + symbol);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // 24h Ticker statistics
                    if (data.e === "24hrTicker") {
                        const high = parseFloat(data.h);
                        const low = parseFloat(data.l);
                        const volBase = parseFloat(data.v);
                        const volQuote = parseFloat(data.q);
                        const changePct = parseFloat(data.P);

                        currentPair.high = high;
                        currentPair.low = low;
                        currentPair.volBase = volBase;
                        currentPair.volQuote = volQuote;
                        currentPair.change = changePct;

                        updateHeaderStats(data.c ? parseFloat(data.c) : currentPair.price);
                    }

                    // Trade Tick
                    if (data.e === "trade") {
                        const tradePrice = parseFloat(data.p);
                        const tradeQty = parseFloat(data.q);
                        const isBuyerMaker = data.m; // true = Sell, false = Buy

                        addRecentTrade(tradePrice, tradeQty, !isBuyerMaker);
                        onLivePriceTick(tradePrice);
                    }
                } catch (err) {
                    console.error("[TraidiumX] WS parse error", err);
                }
            };

            ws.onerror = () => {
                startSimulatedTicks();
            };

            ws.onclose = () => {
                clearTimeout(wsReconnectTimer);
                wsReconnectTimer = setTimeout(connectBinanceWs, 5000);
            };
        } catch (e) {
            startSimulatedTicks();
        }
    }

    // Fallback Simulated Engine if WebSocket is offline
    let simInterval = null;
    function startSimulatedTicks() {
        if (simInterval) clearInterval(simInterval);
        simInterval = setInterval(() => {
            const delta = (Math.random() - 0.49) * (currentPair.price * 0.0006);
            const newPrice = Math.max(0.0001, currentPair.price + delta);
            const qty = Math.random() * 0.5 + 0.01;
            const isBuy = delta >= 0;

            onLivePriceTick(newPrice);
            addRecentTrade(newPrice, qty, isBuy);
        }, 1200);
    }

    // Update Header 24h Stats
    function updateHeaderStats(price) {
        const highEl = document.getElementById("txHeader24hHigh");
        const lowEl = document.getElementById("txHeader24hLow");
        const volBaseEl = document.getElementById("txHeader24hVolBase");
        const volQuoteEl = document.getElementById("txHeader24hVolQuote");
        const changeBadge = document.getElementById("txHeaderChangeBadge");

        if (highEl) highEl.innerText = "$" + formatCurrency(currentPair.high, currentPair.precision);
        if (lowEl) lowEl.innerText = "$" + formatCurrency(currentPair.low, currentPair.precision);
        if (volBaseEl) volBaseEl.innerText = formatCurrency(currentPair.volBase, 2);
        if (volQuoteEl) {
            const qVal = currentPair.volQuote;
            volQuoteEl.innerText = qVal >= 1e9 ? `$${(qVal / 1e9).toFixed(2)}B` : qVal >= 1e6 ? `$${(qVal / 1e6).toFixed(2)}M` : `$${formatCurrency(qVal, 0)}`;
        }

        if (changeBadge) {
            const isPos = currentPair.change >= 0;
            changeBadge.className = `inline-flex items-center gap-1 text-xs sm:text-sm font-black ${isPos ? "text-emerald-400" : "text-rose-400"}`;
            changeBadge.innerHTML = `<span>${isPos ? "▲ +" : "▼ "}${currentPair.change.toFixed(2)}%</span>`;
        }
    }

    // Real-time Price Update Handler
    function onLivePriceTick(price) {
        const oldPrice = currentPair.price;
        currentPair.price = price;

        const headerPriceEl = document.getElementById("txHeaderPrice");
        const inrPriceEl = document.getElementById("txHeaderInrPrice");
        const midPriceEl = document.getElementById("txMidPrice");
        const midIconEl = document.getElementById("txMidIcon");

        const formatted = "$" + formatCurrency(price, currentPair.precision);
        const inrFormatted = "≈ ₹" + formatCurrency(price * 88.50, 2);

        if (headerPriceEl) {
            headerPriceEl.innerText = formatted;
            headerPriceEl.classList.remove("flash-up", "flash-down");
            void headerPriceEl.offsetWidth; // reflow
            if (price >= oldPrice) {
                headerPriceEl.classList.add("flash-up");
                headerPriceEl.className = "text-xl sm:text-2xl font-black text-emerald-400 tracking-tight transition-colors flash-up";
            } else {
                headerPriceEl.classList.add("flash-down");
                headerPriceEl.className = "text-xl sm:text-2xl font-black text-rose-400 tracking-tight transition-colors flash-down";
            }
        }

        if (inrPriceEl) inrPriceEl.innerText = inrFormatted;

        if (midPriceEl) {
            midPriceEl.innerText = formatted;
            midPriceEl.className = price >= oldPrice 
                ? "text-lg sm:text-xl font-black text-emerald-400 font-mono tracking-wide" 
                : "text-lg sm:text-xl font-black text-rose-400 font-mono tracking-wide";
        }

        if (midIconEl) {
            midIconEl.innerText = price >= oldPrice ? "▲" : "▼";
            midIconEl.className = price >= oldPrice ? "text-sm font-black text-emerald-400" : "text-sm font-black text-rose-400";
        }

        // Sync order price with live market if user hasn't typed custom limit price or if Market order
        if (!userHasManuallyEditedPrice || currentOrderType === "market") {
            const priceInput = document.getElementById("txOrderPrice");
            if (priceInput && document.activeElement !== priceInput) {
                priceInput.value = price.toFixed(currentPair.precision);
                recalcOrderTotal();
            }
        }

        // Check if open limit orders should execute
        checkLimitOrderExecution(price);

        // Update Order Book rows
        updateOrderBook(price);

        // Update Convert Guaranteed Quote if converting
        updateConvertRateText();
    }

    // Order Book Generator (Pro Exchange Style matching Futures)
    function updateOrderBook(currentPrice) {
        const asksContainer = document.getElementById("txOrderBookAsks");
        const bidsContainer = document.getElementById("txOrderBookBids");
        if (!asksContainer || !bidsContainer) return;

        let askCount = currentOrderBookMode === "both" ? 8 : currentOrderBookMode === "asks" ? 16 : 0;
        let bidCount = currentOrderBookMode === "both" ? 8 : currentOrderBookMode === "bids" ? 16 : 0;

        let asksHtml = "";
        let bidsHtml = "";
        let totalAskVol = 0;
        let totalBidVol = 0;

        // Asks (Sells above market price - Red)
        if (askCount > 0) {
            let runningSum = 0;
            const askRows = [];
            for (let i = 1; i <= askCount; i++) {
                const askPrice = currentPrice * (1 + (i * 0.00035));
                const size = (Math.random() * 1.4 + 0.05) * (currentPrice > 1000 ? 1 : 15);
                runningSum += size;
                totalAskVol += size;
                const depthPct = Math.min(100, (i / askCount) * 85);
                askRows.push({ askPrice, size, sum: runningSum, depthPct });
            }

            // Render in descending price order
            askRows.reverse().forEach(row => {
                asksHtml += `
                    <div class="relative grid grid-cols-3 py-1 px-1.5 hover:bg-slate-800/60 cursor-pointer rounded transition font-mono text-xs sm:text-[13px]" onclick="window.txFillOrderPrice(${row.askPrice.toFixed(currentPair.precision)})">
                        <div class="absolute right-0 top-0 bottom-0 ob-depth-ask pointer-events-none" style="width: ${row.depthPct}%"></div>
                        <span class="text-rose-400 font-black relative z-10 tracking-tight">${formatCurrency(row.askPrice, currentPair.precision)}</span>
                        <span class="text-right text-white font-bold relative z-10">${formatNumber(row.size, 4)}</span>
                        <span class="text-right text-slate-300 font-bold relative z-10">${formatNumber(row.sum, 4)}</span>
                    </div>
                `;
            });
        }

        // Bids (Buys below market price - Green)
        if (bidCount > 0) {
            let runningSum = 0;
            for (let i = 1; i <= bidCount; i++) {
                const bidPrice = currentPrice * (1 - (i * 0.00035));
                const size = (Math.random() * 1.4 + 0.05) * (currentPrice > 1000 ? 1 : 15);
                runningSum += size;
                totalBidVol += size;
                const depthPct = Math.min(100, (i / bidCount) * 85);

                bidsHtml += `
                    <div class="relative grid grid-cols-3 py-1 px-1.5 hover:bg-slate-800/60 cursor-pointer rounded transition font-mono text-xs sm:text-[13px]" onclick="window.txFillOrderPrice(${bidPrice.toFixed(currentPair.precision)})">
                        <div class="absolute right-0 top-0 bottom-0 ob-depth-bid pointer-events-none" style="width: ${depthPct}%"></div>
                        <span class="text-emerald-400 font-black relative z-10 tracking-tight">${formatCurrency(bidPrice, currentPair.precision)}</span>
                        <span class="text-right text-white font-bold relative z-10">${formatNumber(size, 4)}</span>
                        <span class="text-right text-slate-300 font-bold relative z-10">${formatNumber(runningSum, 4)}</span>
                    </div>
                `;
            }
        }

        asksContainer.innerHTML = asksHtml;
        bidsContainer.innerHTML = bidsHtml;

        // Dynamic Buyer vs Seller Volume Ratio Bar
        const buyRatioEl = document.getElementById("txBuyRatioText");
        const sellRatioEl = document.getElementById("txSellRatioText");
        const buyBarEl = document.getElementById("txBuyRatioBar");
        const sellBarEl = document.getElementById("txSellRatioBar");

        if (buyRatioEl && sellRatioEl && buyBarEl && sellBarEl) {
            const sumVol = (totalBidVol + totalAskVol) || 1;
            const buyPct = Math.min(95, Math.max(5, (totalBidVol / sumVol) * 100));
            const sellPct = 100 - buyPct;

            buyRatioEl.innerText = `B ${buyPct.toFixed(2)}%`;
            sellRatioEl.innerText = `S ${sellPct.toFixed(2)}%`;
            buyBarEl.style.width = `${buyPct.toFixed(2)}%`;
            sellBarEl.style.width = `${sellPct.toFixed(2)}%`;
        }
    }

    // Order Book Controls (Tabs & Mode Switchers)
    function initOrderBookControls() {
        const obTabBtn = document.getElementById("txTabOrderBookBtn");
        const tradesTabBtn = document.getElementById("txTabMarketTradesBtn");
        const obView = document.getElementById("txOrderBookView");
        const tradesView = document.getElementById("txRecentTradesView");
        const ratioSec = document.getElementById("txOrderBookRatioSection");
        const modeToggles = document.getElementById("txOrderBookModeToggles");

        if (obTabBtn && tradesTabBtn) {
            obTabBtn.addEventListener("click", () => {
                obTabBtn.className = "px-2.5 py-1 text-xs font-black rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 transition";
                tradesTabBtn.className = "px-2.5 py-1 text-xs font-black rounded-lg text-slate-400 hover:text-white transition";
                if (obView) obView.classList.remove("hidden");
                if (tradesView) tradesView.classList.add("hidden");
                if (ratioSec) ratioSec.classList.remove("hidden");
                if (modeToggles) modeToggles.classList.remove("hidden");
            });

            tradesTabBtn.addEventListener("click", () => {
                tradesTabBtn.className = "px-2.5 py-1 text-xs font-black rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 transition";
                obTabBtn.className = "px-2.5 py-1 text-xs font-black rounded-lg text-slate-400 hover:text-white transition";
                if (tradesView) tradesView.classList.remove("hidden");
                if (obView) obView.classList.add("hidden");
                if (ratioSec) ratioSec.classList.add("hidden");
                if (modeToggles) modeToggles.classList.add("hidden");
            });
        }

        // Mode Toggles (both, bids, asks)
        document.querySelectorAll(".tx-ob-mode-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".tx-ob-mode-btn").forEach(b => {
                    b.classList.remove("active", "text-cyan-400", "bg-slate-800");
                    b.classList.add("text-slate-500");
                });
                btn.classList.add("active", "text-cyan-400", "bg-slate-800");
                btn.classList.remove("text-slate-500");

                currentOrderBookMode = btn.getAttribute("data-ob-mode");
                updateOrderBook(currentPair.price);
            });
        });
    }

    // Click on orderbook row autofills price in trade panel
    window.txFillOrderPrice = function(price) {
        userHasManuallyEditedPrice = true;
        const priceInput = document.getElementById("txOrderPrice");
        if (priceInput) {
            priceInput.value = price;
            recalcOrderTotal();
        }
    };

    // Recent Trades Stream
    const recentTrades = [];

    function addRecentTrade(price, amount, isBuy) {
        const listEl = document.getElementById("txRecentTradesList");
        if (!listEl) return;

        const now = new Date();
        const timeStr = now.toTimeString().split(" ")[0];

        const item = {
            price: price,
            amount: amount,
            isBuy: isBuy,
            time: timeStr
        };

        recentTrades.unshift(item);
        if (recentTrades.length > 25) recentTrades.pop();

        let html = "";
        recentTrades.forEach(t => {
            html += `
                <div class="grid grid-cols-3 py-1 px-1.5 hover:bg-slate-800/40 rounded transition font-mono text-xs sm:text-[13px]">
                    <span class="${t.isBuy ? "text-emerald-400" : "text-rose-400"} font-black">$${formatCurrency(t.price, currentPair.precision)}</span>
                    <span class="text-right text-white font-bold">${formatNumber(t.amount, 4)}</span>
                    <span class="text-right text-slate-300 font-bold text-xs">${t.time}</span>
                </div>
            `;
        });
        listEl.innerHTML = html;
    }

    // Top Pair Selector Dropdown Populator
    function initPairDropdown() {
        const btn = document.getElementById("txPairSelectorBtn");
        const menu = document.getElementById("txPairDropdownMenu");
        const container = document.getElementById("txPairsListContainer");
        const searchInput = document.getElementById("txPairSearchInput");

        function toggleDropdown(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            const isHidden = menu.classList.contains("hidden");
            if (isHidden) {
                menu.classList.remove("hidden");
                renderPairs("all", "");
                if (searchInput) {
                    searchInput.value = "";
                    setTimeout(() => searchInput.focus(), 60);
                }
            } else {
                menu.classList.add("hidden");
            }
        }

        btn.addEventListener("click", toggleDropdown);

        document.addEventListener("click", (e) => {
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                menu.classList.add("hidden");
            }
        });

        function renderPairs(filter = "all", search = "") {
            container.innerHTML = "";
            const q = search.toLowerCase().trim();

            const filtered = PAIRS.filter(p => {
                const matchCategory = filter === "all" || p.category === filter;
                const matchSearch = p.symbol.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
                return matchCategory && matchSearch;
            });

            filtered.forEach(p => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = `w-full flex items-center justify-between p-2 rounded-xl text-left transition hover:bg-[#13203c] bg-[#080f1d] border border-transparent cursor-pointer ${p.symbol === currentPair.symbol ? "!bg-cyan-500/20 !border-cyan-400/40" : ""}`;
                
                const isPositive = p.change >= 0;
                item.innerHTML = `
                    <div class="flex items-center gap-2.5">
                        <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400 font-black text-xs border border-cyan-400/30 shrink-0">
                            ${p.icon}
                        </span>
                        <div>
                            <div class="text-xs font-black text-white tracking-tight">${p.base}/<span class="text-slate-400">${p.quote}</span></div>
                            <div class="text-[10px] text-slate-400 font-semibold">${p.name}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-xs font-mono font-black text-slate-100">$${formatCurrency(p.price, p.precision)}</div>
                        <div class="text-[10px] font-extrabold ${isPositive ? "text-emerald-400" : "text-rose-400"} mt-0.5">${isPositive ? "+" : ""}${p.change}%</div>
                    </div>
                `;

                item.addEventListener("click", () => {
                    selectPair(p);
                    menu.classList.add("hidden");
                });

                container.appendChild(item);
            });
        }

        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                renderPairs("all", e.target.value);
            });
        }

        document.querySelectorAll(".tx-pair-filter").forEach(tab => {
            tab.addEventListener("click", () => {
                document.querySelectorAll(".tx-pair-filter").forEach(t => {
                    t.classList.remove("active", "bg-cyan-500/20", "text-cyan-300");
                    t.classList.add("text-slate-400");
                });
                tab.classList.add("active", "bg-cyan-500/20", "text-cyan-300");
                tab.classList.remove("text-slate-400");
                renderPairs(tab.getAttribute("data-filter"), searchInput ? searchInput.value : "");
            });
        });

        renderPairs();
    }

    function selectPair(pair) {
        currentPair = pair;
        userHasManuallyEditedPrice = false;

        // Update Header
        const iconEl = document.getElementById("txPairIcon");
        const symbolEl = document.getElementById("txActivePairSymbol");
        const unitLabels = document.querySelectorAll("#txUnitLabel, #txAmountCurrency");
        const buyBtn = document.getElementById("txSideBuyBtn");
        const sellBtn = document.getElementById("txSideSellBtn");
        const executeBtn = document.getElementById("txExecuteOrderBtn");

        if (iconEl) iconEl.innerText = pair.icon;
        if (symbolEl) symbolEl.innerText = `${pair.base}/${pair.quote}`;
        unitLabels.forEach(el => el.innerText = pair.base);
        document.querySelectorAll(".tx-base-sym").forEach(el => el.innerText = pair.base);
        if (buyBtn) {
            buyBtn.innerText = `Buy ${pair.base}`;
            buyBtn.className = `tx-side-btn tx-side-btn-buy ${currentOrderSide === "buy" ? "active" : ""}`;
        }
        if (sellBtn) {
            sellBtn.innerText = `Sell ${pair.base}`;
            sellBtn.className = `tx-side-btn tx-side-btn-sell ${currentOrderSide === "sell" ? "active" : ""}`;
        }
        if (executeBtn) {
            executeBtn.innerText = `${currentOrderSide === "buy" ? "Buy" : "Sell"} ${pair.base}`;
            executeBtn.className = `tx-btn-execute ${currentOrderSide === "buy" ? "tx-btn-execute-buy" : "tx-btn-execute-sell"}`;
        }

        // Reset Order Price Input
        const priceInput = document.getElementById("txOrderPrice");
        if (priceInput) priceInput.value = pair.price.toFixed(pair.precision);

        // Load Real TradingView Chart
        loadTradingViewChart(pair.symbol);

        // Connect WebSocket for live orderbook & trades
        connectBinanceWs();
        updateBalanceDisplays();
        updateHeaderStats(pair.price);
        recalcOrderTotal();
    }

    // Trade Panel & Calculation Handlers
    function initTradePanel() {
        const spotTabBtn = document.getElementById("txModeTabSpot");
        const convertTabBtn = document.getElementById("txModeTabConvert");
        const spotPanel = document.getElementById("txSpotOrderPanel");
        const convertPanel = document.getElementById("txConvertPanel");

        if (spotTabBtn && convertTabBtn) {
            spotTabBtn.addEventListener("click", () => {
                spotTabBtn.className = "flex items-center justify-center gap-2 py-2.5 text-sm font-black rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 transition";
                convertTabBtn.className = "flex items-center justify-center gap-2 py-2.5 text-sm font-black rounded-lg text-slate-400 hover:text-white transition";
                spotPanel.classList.remove("hidden");
                convertPanel.classList.add("hidden");
            });

            convertTabBtn.addEventListener("click", () => {
                convertTabBtn.className = "flex items-center justify-center gap-2 py-2.5 text-sm font-black rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 transition";
                spotTabBtn.className = "flex items-center justify-center gap-2 py-2.5 text-sm font-black rounded-lg text-slate-400 hover:text-white transition";
                convertPanel.classList.remove("hidden");
                spotPanel.classList.add("hidden");
                startConvertTimer();
                updateConvertPreview();
            });
        }

        // Side Buttons: BUY vs SELL
        const buyBtn = document.getElementById("txSideBuyBtn");
        const sellBtn = document.getElementById("txSideSellBtn");
        const executeBtn = document.getElementById("txExecuteOrderBtn");

        function updateSideUI() {
            if (!buyBtn || !sellBtn || !executeBtn) return;
            if (currentOrderSide === "buy") {
                buyBtn.className = "tx-side-btn tx-side-btn-buy active";
                sellBtn.className = "tx-side-btn tx-side-btn-sell";
                executeBtn.innerText = `Buy ${currentPair.base}`;
                executeBtn.className = "tx-btn-execute tx-btn-execute-buy";
            } else {
                sellBtn.className = "tx-side-btn tx-side-btn-sell active";
                buyBtn.className = "tx-side-btn tx-side-btn-buy";
                executeBtn.innerText = `Sell ${currentPair.base}`;
                executeBtn.className = "tx-btn-execute tx-btn-execute-sell";
            }
            const pctSlider = document.getElementById("txOrderPctSlider");
            const pctSliderVal = document.getElementById("txPctSliderVal");
            if (pctSlider) pctSlider.value = 0;
            if (pctSliderVal) pctSliderVal.innerText = "0%";
            updateBalanceDisplays();
            recalcOrderTotal();
        }

        if (buyBtn && sellBtn) {
            buyBtn.addEventListener("click", () => {
                currentOrderSide = "buy";
                updateSideUI();
            });

            sellBtn.addEventListener("click", () => {
                currentOrderSide = "sell";
                updateSideUI();
            });
        }

        // Order Type Selection
        document.querySelectorAll(".tx-order-type-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".tx-order-type-btn").forEach(b => {
                    b.classList.remove("active", "bg-cyan-500/20", "text-cyan-300", "border", "border-cyan-400/30");
                    b.classList.add("text-slate-400");
                });
                btn.classList.add("active", "bg-cyan-500/20", "text-cyan-300", "border", "border-cyan-400/30");
                btn.classList.remove("text-slate-400");

                currentOrderType = btn.getAttribute("data-order-type");
                const priceInput = document.getElementById("txOrderPrice");

                if (currentOrderType === "market") {
                    if (priceInput) {
                        priceInput.value = currentPair.price.toFixed(currentPair.precision);
                        priceInput.setAttribute("disabled", "disabled");
                        priceInput.classList.add("opacity-60");
                    }
                } else {
                    if (priceInput) {
                        priceInput.removeAttribute("disabled");
                        priceInput.classList.remove("opacity-60");
                    }
                }
                recalcOrderTotal();
            });
        });

        // Price & Amount Input Events
        const priceInput = document.getElementById("txOrderPrice");
        const amountInput = document.getElementById("txOrderAmount");

        if (priceInput) {
            priceInput.value = currentPair.price.toFixed(currentPair.precision);
            priceInput.addEventListener("input", recalcOrderTotal);
        }
        if (amountInput) {
            amountInput.addEventListener("input", recalcOrderTotal);
        }

        // Percentage Range Slider & Chips
        const pctSlider = document.getElementById("txOrderPctSlider");
        const pctSliderVal = document.getElementById("txPctSliderVal");

        function applyPercentage(pct) {
            const price = parseFloat(priceInput ? priceInput.value : currentPair.price) || currentPair.price;
            if (currentOrderSide === "buy") {
                const availableUsdt = userHoldings.USDT || 0;
                const usdtToSpend = availableUsdt * pct;
                const calculatedAmount = usdtToSpend / price;
                if (amountInput) amountInput.value = calculatedAmount > 0 ? calculatedAmount.toFixed(4) : "";
            } else {
                const availableCoin = userHoldings[currentPair.base] || 0;
                const coinToSell = availableCoin * pct;
                if (amountInput) amountInput.value = coinToSell > 0 ? coinToSell.toFixed(4) : "";
            }
            if (pctSlider) pctSlider.value = Math.round(pct * 100);
            if (pctSliderVal) pctSliderVal.innerText = `${Math.round(pct * 100)}%`;
            recalcOrderTotal();
        }

        if (pctSlider) {
            pctSlider.addEventListener("input", (e) => {
                const pct = parseInt(e.target.value, 10) / 100;
                applyPercentage(pct);
            });
        }

        document.querySelectorAll(".tx-pct-chip").forEach(chip => {
            chip.addEventListener("click", () => {
                const pct = parseInt(chip.getAttribute("data-pct"), 10) / 100;
                applyPercentage(pct);
            });
        });

        // Best Bid / Best Ask buttons
        const bestBidBtn = document.getElementById("txBestBidBtn");
        const bestAskBtn = document.getElementById("txBestAskBtn");
        if (bestBidBtn) {
            bestBidBtn.addEventListener("click", () => {
                if (priceInput) {
                    priceInput.value = (currentPair.price * 0.9998).toFixed(currentPair.precision);
                    recalcOrderTotal();
                }
            });
        }
        if (bestAskBtn) {
            bestAskBtn.addEventListener("click", () => {
                if (priceInput) {
                    priceInput.value = (currentPair.price * 1.0002).toFixed(currentPair.precision);
                    recalcOrderTotal();
                }
            });
        }

        // Order Execution Button Click
        if (executeBtn) {
            executeBtn.addEventListener("click", handleOrderExecution);
        }

        initInstantConvert();
    }

    function recalcOrderTotal() {
        const priceInput = document.getElementById("txOrderPrice");
        const amountInput = document.getElementById("txOrderAmount");
        const totalValEl = document.getElementById("txOrderTotalVal");
        const feeValEl = document.getElementById("txOrderFeeVal");

        const price = parseFloat(priceInput ? priceInput.value : 0) || 0;
        const amount = parseFloat(amountInput ? amountInput.value : 0) || 0;
        const total = price * amount;
        const fee = total * 0.0005; // 0.05% fee

        if (totalValEl) totalValEl.innerText = `${formatCurrency(total, 2)} USDT`;
        if (feeValEl) feeValEl.innerText = `${formatCurrency(fee, 3)} USDT`;
    }

    function updateBalanceDisplays() {
        const topUsdtEl = document.getElementById("txUserUsdtBalance");
        const formBalEl = document.getElementById("txFormAvailableBalance");
        const convertFromBalEl = document.getElementById("txConvertFromBal");

        const usdtBal = userHoldings.USDT !== undefined ? userHoldings.USDT : 10000.00;
        const coinBal = userHoldings[currentPair.base] !== undefined ? userHoldings[currentPair.base] : 0;

        if (topUsdtEl) topUsdtEl.innerText = `${formatCurrency(usdtBal, 2)} USDT`;

        if (formBalEl) {
            if (currentOrderSide === "buy") {
                formBalEl.innerText = `${formatCurrency(usdtBal, 2)} USDT`;
            } else {
                formBalEl.innerText = `${formatNumber(coinBal, 4)} ${currentPair.base}`;
            }
        }

        if (convertFromBalEl) {
            const fromAsset = document.getElementById("txConvertFromAsset")?.value || "USDT";
            const bal = userHoldings[fromAsset] || 0;
            convertFromBalEl.innerText = `${formatNumber(bal, 4)} ${fromAsset}`;
        }

        renderMyAssetsTable();
    }

    // Execute Spot Order
    function handleOrderExecution() {
        const priceInput = document.getElementById("txOrderPrice");
        const amountInput = document.getElementById("txOrderAmount");

        const price = parseFloat(priceInput ? priceInput.value : 0);
        const amount = parseFloat(amountInput ? amountInput.value : 0);

        if (!price || price <= 0) {
            showToast("Invalid Price", "Please specify a valid order price.", "error");
            return;
        }
        if (!amount || amount <= 0) {
            showToast("Invalid Amount", "Please enter a valid amount to trade.", "error");
            return;
        }

        const totalUsdt = price * amount;
        const fee = totalUsdt * 0.0005;

        // Balance check
        if (currentOrderSide === "buy") {
            const availableUsdt = userHoldings.USDT || 0;
            if (totalUsdt + fee > availableUsdt) {
                showToast("Insufficient Funds", `You need ${formatCurrency(totalUsdt + fee, 2)} USDT, but have ${formatCurrency(availableUsdt, 2)} USDT.`, "error");
                return;
            }
            userHoldings.USDT -= (totalUsdt + fee);
        } else {
            const availableCoin = userHoldings[currentPair.base] || 0;
            if (amount > availableCoin) {
                showToast("Insufficient Balance", `You need ${formatNumber(amount, 4)} ${currentPair.base}, but have ${formatNumber(availableCoin, 4)}.`, "error");
                return;
            }
            userHoldings[currentPair.base] -= amount;
        }

        const now = new Date();
        const orderId = "TX-" + Math.floor(100000 + Math.random() * 900000);
        const dateStr = now.toLocaleDateString() + " " + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const isMarket = currentOrderType === "market";
        const canExecuteNow = isMarket || (currentOrderSide === "buy" && price >= currentPair.price) || (currentOrderSide === "sell" && price <= currentPair.price);

        if (canExecuteNow) {
            if (currentOrderSide === "buy") {
                userHoldings[currentPair.base] = (userHoldings[currentPair.base] || 0) + amount;
            } else {
                userHoldings.USDT = (userHoldings.USDT || 0) + (totalUsdt - fee);
            }

            const record = {
                id: orderId,
                pair: `${currentPair.base}/USDT`,
                side: currentOrderSide,
                type: currentOrderType.toUpperCase(),
                price: price,
                executedPrice: currentPair.price,
                amount: amount,
                total: totalUsdt,
                fee: fee,
                time: dateStr,
                status: "FILLED"
            };

            orderHistory.unshift(record);
            tradeHistory.unshift(record);

            showToast("Order Executed!", `Successfully ${currentOrderSide === "buy" ? "bought" : "sold"} ${formatNumber(amount, 4)} ${currentPair.base} at $${formatCurrency(currentPair.price, currentPair.precision)}`, "success");
            playAudioTone("success");
        } else {
            const openOrder = {
                id: orderId,
                pair: `${currentPair.base}/USDT`,
                side: currentOrderSide,
                type: currentOrderType.toUpperCase(),
                price: price,
                amount: amount,
                filled: 0,
                total: totalUsdt,
                fee: fee,
                time: dateStr,
                status: "OPEN"
            };

            openOrders.unshift(openOrder);
            showToast("Order Placed", `Limit ${currentOrderSide.toUpperCase()} placed for ${formatNumber(amount, 4)} ${currentPair.base} @ $${formatCurrency(price, currentPair.precision)}`, "info");
            playAudioTone("success");
        }

        saveLocalState();
        updateBalanceDisplays();
        renderTables();

        if (amountInput) amountInput.value = "";
        recalcOrderTotal();
    }

    // Check & auto-execute open limit orders if current price triggers them
    function checkLimitOrderExecution(marketPrice) {
        let changed = false;

        for (let i = openOrders.length - 1; i >= 0; i--) {
            const o = openOrders[i];
            const shouldFill = (o.side === "buy" && marketPrice <= o.price) || (o.side === "sell" && marketPrice >= o.price);

            if (shouldFill) {
                const pairBase = o.pair.split("/")[0];
                if (o.side === "buy") {
                    userHoldings[pairBase] = (userHoldings[pairBase] || 0) + o.amount;
                } else {
                    userHoldings.USDT = (userHoldings.USDT || 0) + (o.total - o.fee);
                }

                o.status = "FILLED";
                o.executedPrice = marketPrice;

                openOrders.splice(i, 1);
                orderHistory.unshift(o);
                tradeHistory.unshift(o);

                showToast("Limit Order Filled! 🎯", `${o.side.toUpperCase()} ${formatNumber(o.amount, 4)} ${pairBase} executed at $${formatCurrency(marketPrice, 2)}`, "success");
                playAudioTone("success");
                changed = true;
            }
        }

        if (changed) {
            saveLocalState();
            updateBalanceDisplays();
            renderTables();
        }
    }

    // Cancel Order
    window.txCancelOrder = function(orderId) {
        const idx = openOrders.findIndex(o => o.id === orderId);
        if (idx === -1) return;

        const o = openOrders[idx];
        const pairBase = o.pair.split("/")[0];

        if (o.side === "buy") {
            userHoldings.USDT = (userHoldings.USDT || 0) + (o.total + o.fee);
        } else {
            userHoldings[pairBase] = (userHoldings[pairBase] || 0) + o.amount;
        }

        o.status = "CANCELLED";
        openOrders.splice(idx, 1);
        orderHistory.unshift(o);

        saveLocalState();
        updateBalanceDisplays();
        renderTables();

        showToast("Order Cancelled", `Order #${orderId} was cancelled and funds refunded.`, "info");
        playAudioTone("cancel");
    };

    // Instant Convert Engine
    function initInstantConvert() {
        const fromInput = document.getElementById("txConvertFromAmount");
        const toInput = document.getElementById("txConvertToAmount");
        const fromSelect = document.getElementById("txConvertFromAsset");
        const toSelect = document.getElementById("txConvertToAsset");
        const maxBtn = document.getElementById("txConvertMaxBtn");
        const flipBtn = document.getElementById("txConvertFlipBtn");
        const executeConvertBtn = document.getElementById("txExecuteConvertBtn");

        if (fromInput) fromInput.addEventListener("input", updateConvertPreview);
        if (fromSelect) fromSelect.addEventListener("change", () => {
            updateBalanceDisplays();
            updateConvertPreview();
        });
        if (toSelect) toSelect.addEventListener("change", updateConvertPreview);

        if (maxBtn) {
            maxBtn.addEventListener("click", () => {
                const asset = fromSelect.value;
                const bal = userHoldings[asset] || 0;
                if (fromInput) {
                    fromInput.value = bal > 0 ? bal : "0";
                    updateConvertPreview();
                }
            });
        }

        if (flipBtn) {
            flipBtn.addEventListener("click", () => {
                const temp = fromSelect.value;
                fromSelect.value = toSelect.value;
                toSelect.value = temp;
                updateBalanceDisplays();
                updateConvertPreview();
            });
        }

        if (executeConvertBtn) {
            executeConvertBtn.addEventListener("click", executeInstantConversion);
        }
    }

    function getAssetPriceInUsdt(asset) {
        if (asset === "USDT") return 1;
        if (asset === "INR") return 1 / 88.50;
        const pair = PAIRS.find(p => p.base === asset);
        return pair ? pair.price : 1;
    }

    function updateConvertRateText() {
        const fromSelect = document.getElementById("txConvertFromAsset");
        const toSelect = document.getElementById("txConvertToAsset");
        const rateTextEl = document.getElementById("txConvertRateText");
        if (!fromSelect || !toSelect || !rateTextEl) return;

        const fromAsset = fromSelect.value;
        const toAsset = toSelect.value;

        const fromUsd = getAssetPriceInUsdt(fromAsset);
        const toUsd = getAssetPriceInUsdt(toAsset);

        const rate = fromUsd / toUsd;
        rateTextEl.innerText = `1 ${fromAsset} ≈ ${formatCurrency(rate, rate > 10 ? 2 : 4)} ${toAsset}`;
    }

    function updateConvertPreview() {
        const fromInput = document.getElementById("txConvertFromAmount");
        const toInput = document.getElementById("txConvertToAmount");
        const fromSelect = document.getElementById("txConvertFromAsset");
        const toSelect = document.getElementById("txConvertToAsset");
        if (!fromInput || !toInput || !fromSelect || !toSelect) return;

        const fromAmount = parseFloat(fromInput.value) || 0;
        if (fromAmount <= 0) {
            toInput.value = "";
            return;
        }

        const fromAsset = fromSelect.value;
        const toAsset = toSelect.value;

        const fromUsd = getAssetPriceInUsdt(fromAsset);
        const toUsd = getAssetPriceInUsdt(toAsset);

        const toAmount = (fromAmount * fromUsd) / toUsd;
        toInput.value = formatNumber(toAmount, toAmount > 10 ? 2 : 5);
        updateConvertRateText();
    }

    function startConvertTimer() {
        if (convertTimerInterval) clearInterval(convertTimerInterval);
        convertCountdown = 5;
        const timerEl = document.getElementById("txConvertTimer");

        convertTimerInterval = setInterval(() => {
            convertCountdown--;
            if (convertCountdown <= 0) {
                convertCountdown = 5;
                updateConvertPreview();
            }
            if (timerEl) timerEl.innerText = `${convertCountdown}s`;
        }, 1000);
    }

    function executeInstantConversion() {
        const fromInput = document.getElementById("txConvertFromAmount");
        const toInput = document.getElementById("txConvertToAmount");
        const fromSelect = document.getElementById("txConvertFromAsset");
        const toSelect = document.getElementById("txConvertToAsset");

        const fromAmount = parseFloat(fromInput.value) || 0;
        const toAmount = parseFloat(toInput.value) || 0;
        const fromAsset = fromSelect.value;
        const toAsset = toSelect.value;

        if (fromAsset === toAsset) {
            showToast("Identical Assets", "Please choose different assets to convert.", "error");
            return;
        }

        if (fromAmount <= 0 || toAmount <= 0) {
            showToast("Enter Amount", "Please enter the amount you wish to convert.", "error");
            return;
        }

        const availableFrom = userHoldings[fromAsset] || 0;
        if (fromAmount > availableFrom) {
            showToast("Insufficient Balance", `You only have ${formatNumber(availableFrom, 4)} ${fromAsset}.`, "error");
            return;
        }

        // Execute Swap
        userHoldings[fromAsset] -= fromAmount;
        userHoldings[toAsset] = (userHoldings[toAsset] || 0) + toAmount;

        const now = new Date();
        const dateStr = now.toLocaleDateString() + " " + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const tradeRecord = {
            id: "SWAP-" + Math.floor(100000 + Math.random() * 900000),
            pair: `${fromAsset} → ${toAsset}`,
            side: "SWAP",
            type: "CONVERT (0 FEE)",
            price: (fromAmount / toAmount),
            executedPrice: (fromAmount / toAmount),
            amount: toAmount,
            total: fromAmount * getAssetPriceInUsdt(fromAsset),
            fee: 0,
            time: dateStr,
            status: "FILLED"
        };

        orderHistory.unshift(tradeRecord);
        tradeHistory.unshift(tradeRecord);

        saveLocalState();
        updateBalanceDisplays();
        renderTables();

        showToast("Instant Swap Successful! 🚀", `Converted ${formatNumber(fromAmount, 4)} ${fromAsset} into ${formatNumber(toAmount, 4)} ${toAsset} at zero fee.`, "success");
        playAudioTone("success");

        fromInput.value = "";
        toInput.value = "";
    }

    // Render Lower Table Tabs & Content
    function initLowerTabs() {
        document.querySelectorAll(".tx-tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".tx-tab-btn").forEach(b => {
                    b.classList.remove("active", "bg-cyan-500/20", "text-cyan-300", "border-cyan-400/30");
                    b.classList.add("text-slate-400");
                });
                btn.classList.add("active", "bg-cyan-500/20", "text-cyan-300", "border-cyan-400/30");
                btn.classList.remove("text-slate-400");

                const targetTab = btn.getAttribute("data-table-tab");
                document.querySelectorAll(".tx-tab-content").forEach(tc => tc.classList.add("hidden"));

                if (targetTab === "open-orders") document.getElementById("txTabOpenOrders")?.classList.remove("hidden");
                if (targetTab === "order-history") document.getElementById("txTabOrderHistory")?.classList.remove("hidden");
                if (targetTab === "trade-history") document.getElementById("txTabTradeHistory")?.classList.remove("hidden");
                if (targetTab === "my-assets") document.getElementById("txTabMyAssets")?.classList.remove("hidden");
            });
        });

        // Cancel All Orders Button
        const cancelAllBtn = document.getElementById("txCancelAllOrdersBtn");
        if (cancelAllBtn) {
            cancelAllBtn.addEventListener("click", () => {
                if (openOrders.length === 0) return;
                while (openOrders.length > 0) {
                    window.txCancelOrder(openOrders[0].id);
                }
            });
        }
    }

    function renderTables() {
        renderOpenOrdersTable();
        renderOrderHistoryTable();
        renderTradeHistoryTable();
        renderMyAssetsTable();
    }

    function renderOpenOrdersTable() {
        const tbody = document.getElementById("txOpenOrdersTableBody");
        const countEl = document.getElementById("txOpenOrdersCount");
        const cancelAllBtn = document.getElementById("txCancelAllOrdersBtn");
        if (!tbody) return;

        if (countEl) countEl.innerText = openOrders.length;
        if (cancelAllBtn) {
            cancelAllBtn.classList.toggle("hidden", openOrders.length === 0);
        }

        if (openOrders.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="py-8 text-center text-slate-500 font-semibold">
                        No open orders currently. Place an order to see it live!
                    </td>
                </tr>
            `;
            return;
        }

        let html = "";
        openOrders.forEach(o => {
            const isBuy = o.side === "buy";
            html += `
                <tr class="hover:bg-slate-800/40 transition">
                    <td class="py-2.5 px-2 text-slate-400 text-[11px]">${o.time}</td>
                    <td class="py-2.5 px-2 font-black text-white">${o.pair}</td>
                    <td class="py-2.5 px-2 text-cyan-400 font-bold">${o.type}</td>
                    <td class="py-2.5 px-2 font-black ${isBuy ? "text-emerald-400" : "text-rose-400"} uppercase">${o.side}</td>
                    <td class="py-2.5 px-2 font-mono font-bold text-white">$${formatCurrency(o.price, 2)}</td>
                    <td class="py-2.5 px-2 font-mono text-slate-200">${formatNumber(o.amount, 4)}</td>
                    <td class="py-2.5 px-2 text-slate-400 font-bold">0%</td>
                    <td class="py-2.5 px-2 font-mono text-slate-200">$${formatCurrency(o.total, 2)}</td>
                    <td class="py-2.5 px-2 text-right">
                        <button type="button" onclick="window.txCancelOrder('${o.id}')" class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500 hover:text-white transition cursor-pointer">
                            Cancel
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }

    function renderOrderHistoryTable() {
        const tbody = document.getElementById("txOrderHistoryTableBody");
        if (!tbody) return;

        if (orderHistory.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="py-8 text-center text-slate-500 font-semibold">
                        No past order history.
                    </td>
                </tr>
            `;
            return;
        }

        let html = "";
        orderHistory.forEach(o => {
            const isBuy = o.side === "buy" || o.side === "SWAP";
            const isFilled = o.status === "FILLED";
            html += `
                <tr class="hover:bg-slate-800/40 transition">
                    <td class="py-2.5 px-2 text-slate-400 text-[11px]">${o.time}</td>
                    <td class="py-2.5 px-2 font-black text-white">${o.pair}</td>
                    <td class="py-2.5 px-2 text-cyan-400 font-bold">${o.type}</td>
                    <td class="py-2.5 px-2 font-black ${isBuy ? "text-emerald-400" : "text-rose-400"} uppercase">${o.side}</td>
                    <td class="py-2.5 px-2 font-mono font-bold text-white">$${formatCurrency(o.price, 2)}</td>
                    <td class="py-2.5 px-2 font-mono font-bold text-slate-300">$${formatCurrency(o.executedPrice || o.price, 2)}</td>
                    <td class="py-2.5 px-2 font-mono text-slate-200">${formatNumber(o.amount, 4)}</td>
                    <td class="py-2.5 px-2 font-mono text-slate-200">$${formatCurrency(o.total, 2)}</td>
                    <td class="py-2.5 px-2 text-right">
                        <span class="px-2 py-0.5 text-[10px] font-black rounded-md ${isFilled ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"}">
                            ${o.status}
                        </span>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }

    function renderTradeHistoryTable() {
        const tbody = document.getElementById("txTradeHistoryTableBody");
        if (!tbody) return;

        if (tradeHistory.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="py-8 text-center text-slate-500 font-semibold">
                        No trade executions recorded yet.
                    </td>
                </tr>
            `;
            return;
        }

        let html = "";
        tradeHistory.forEach(t => {
            const isBuy = t.side === "buy" || t.side === "SWAP";
            html += `
                <tr class="hover:bg-slate-800/40 transition">
                    <td class="py-2.5 px-2 text-slate-400 text-[11px]">${t.time}</td>
                    <td class="py-2.5 px-2 font-black text-white">${t.pair}</td>
                    <td class="py-2.5 px-2 font-black ${isBuy ? "text-emerald-400" : "text-rose-400"} uppercase">${t.side}</td>
                    <td class="py-2.5 px-2 font-mono font-bold text-white">$${formatCurrency(t.executedPrice || t.price, 2)}</td>
                    <td class="py-2.5 px-2 font-mono text-slate-200">${formatNumber(t.amount, 4)}</td>
                    <td class="py-2.5 px-2 font-mono text-cyan-400">$${formatCurrency(t.fee || 0, 3)}</td>
                    <td class="py-2.5 px-2 font-mono font-bold text-white text-right">$${formatCurrency(t.total, 2)}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }

    function renderMyAssetsTable() {
        const tbody = document.getElementById("txMyAssetsTableBody");
        if (!tbody) return;

        const assetKeys = ["USDT", "BTC", "ETH", "SOL", "INR", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK"];
        let html = "";

        assetKeys.forEach(asset => {
            const totalBal = userHoldings[asset] || 0;
            const priceUsd = getAssetPriceInUsdt(asset);
            const usdVal = totalBal * priceUsd;

            html += `
                <tr class="hover:bg-slate-800/40 transition">
                    <td class="py-2.5 px-2 font-black text-white flex items-center gap-2">
                        <span class="flex h-5 w-5 items-center justify-center rounded bg-cyan-500/20 text-cyan-300 font-bold text-[10px]">
                            ${asset === "USDT" ? "$" : asset === "BTC" ? "₿" : asset.substring(0, 1)}
                        </span>
                        ${asset}
                    </td>
                    <td class="py-2.5 px-2 font-mono font-bold text-slate-200">${formatNumber(totalBal, 4)} ${asset}</td>
                    <td class="py-2.5 px-2 font-mono text-emerald-400 font-bold">${formatNumber(totalBal, 4)}</td>
                    <td class="py-2.5 px-2 font-mono text-slate-400">0.00</td>
                    <td class="py-2.5 px-2 font-mono font-bold text-white">$${formatCurrency(usdVal, 2)}</td>
                    <td class="py-2.5 px-2 text-right">
                        <a href="wallet.html" class="px-2 py-1 text-[11px] font-bold rounded-lg bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/30 transition">
                            Deposit
                        </a>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    // Fetch All Real-Time 24hr Tickers from Binance REST API on Load
    async function fetchAllBinanceTickers() {
        try {
            const res = await fetch("https://api.binance.com/api/v3/ticker/24hr");
            if (!res.ok) return;
            const tickers = await res.json();
            const tickerMap = new Map();
            tickers.forEach(t => tickerMap.set(t.symbol, t));

            PAIRS.forEach(p => {
                const t = tickerMap.get(p.symbol);
                if (t) {
                    p.price = parseFloat(t.lastPrice) || p.price;
                    p.high = parseFloat(t.highPrice) || p.high;
                    p.low = parseFloat(t.lowPrice) || p.low;
                    p.volBase = parseFloat(t.volume) || p.volBase;
                    p.volQuote = parseFloat(t.quoteVolume) || p.volQuote;
                    p.change = parseFloat(t.priceChangePercent) || p.change;
                }
            });

            // Update active pair stats & order price immediately
            const activeTicker = tickerMap.get(currentPair.symbol);
            if (activeTicker) {
                currentPair.price = parseFloat(activeTicker.lastPrice) || currentPair.price;
                currentPair.high = parseFloat(activeTicker.highPrice) || currentPair.high;
                currentPair.low = parseFloat(activeTicker.lowPrice) || currentPair.low;
                currentPair.volBase = parseFloat(activeTicker.volume) || currentPair.volBase;
                currentPair.volQuote = parseFloat(activeTicker.quoteVolume) || currentPair.volQuote;
                currentPair.change = parseFloat(activeTicker.priceChangePercent) || currentPair.change;

                updateHeaderStats(currentPair.price);

                if (!userHasManuallyEditedPrice) {
                    const priceInput = document.getElementById("txOrderPrice");
                    if (priceInput) {
                        priceInput.value = currentPair.price.toFixed(currentPair.precision);
                        recalcOrderTotal();
                    }
                }
            }
        } catch (e) {
            console.warn("[TraidiumX] Ticker fetch fallback:", e);
        }
    }

    // Initialize Page
    document.addEventListener("DOMContentLoaded", () => {
        loadLocalState();
        initPairDropdown();
        initTradePanel();
        initOrderBookControls();
        initLowerTabs();
        fetchAllBinanceTickers();

        // Check if symbol passed in URL query e.g. ?symbol=ETHUSDT
        const urlParams = new URLSearchParams(window.location.search);
        const sym = urlParams.get("symbol");
        if (sym) {
            const found = PAIRS.find(p => p.symbol.toUpperCase() === sym.toUpperCase());
            if (found) selectPair(found);
            else selectPair(PAIRS[0]);
        } else {
            selectPair(PAIRS[0]);
        }

        updateBalanceDisplays();
        renderTables();
        syncRealWalletBalance();
    });

    async function syncRealWalletBalance() {
        if (typeof isLoggedIn === "function" && isLoggedIn() && typeof apiRequest === "function") {
            try {
                const response = await apiRequest("/wallet/balance");
                const walletData = response?.data?.wallet || response?.data || null;
                if (walletData) {
                    if (walletData.usdt_balance !== undefined) userHoldings.USDT = parseFloat(walletData.usdt_balance) || 0;
                    if (walletData.btc_balance !== undefined) userHoldings.BTC = parseFloat(walletData.btc_balance) || 0;
                    if (walletData.eth_balance !== undefined) userHoldings.ETH = parseFloat(walletData.eth_balance) || 0;
                    if (walletData.sol_balance !== undefined) userHoldings.SOL = parseFloat(walletData.sol_balance) || 0;
                    if (walletData.inr_balance !== undefined) userHoldings.INR = parseFloat(walletData.inr_balance) || 0;
                    
                    saveLocalState();
                    updateBalanceDisplays();
                    renderTables();
                }
            } catch (err) {
                console.warn("[TraidiumX Trade] Main wallet sync error:", err);
            }
        }
    }

})();

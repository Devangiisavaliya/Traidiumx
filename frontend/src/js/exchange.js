"use strict";

/* =========================================================
   TraidiumX Buy & Exchange Controller
   - Instant Crypto Swaps & Conversion
   - Real-time Price Feeds & Quotations
   - Integrated with Multi-Currency Wallets & Sub-accounts
========================================================= */

(function () {
    // Supported Assets Registry
    const ASSETS_LIST = [
        { symbol: "BTC", name: "Bitcoin", category: "crypto", decimals: 8 },
        { symbol: "ETH", name: "Ethereum", category: "crypto", decimals: 6 },
        { symbol: "USDT", name: "Tether USD", category: "stable", decimals: 2 },
        { symbol: "USDC", name: "USD Coin", category: "stable", decimals: 2 },
        { symbol: "SOL", name: "Solana", category: "crypto", decimals: 4 },
        { symbol: "XRP", name: "Ripple", category: "crypto", decimals: 4 },
        { symbol: "BNB", name: "BNB", category: "crypto", decimals: 4 },
        { symbol: "DOGE", name: "Dogecoin", category: "crypto", decimals: 2 },
        { symbol: "ADA", name: "Cardano", category: "crypto", decimals: 4 },
        { symbol: "TRX", name: "TRON", category: "crypto", decimals: 2 },
        { symbol: "LTC", name: "Litecoin", category: "crypto", decimals: 4 },
        { symbol: "LINK", name: "Chainlink", category: "crypto", decimals: 4 },
        { symbol: "NEAR", name: "NEAR Protocol", category: "crypto", decimals: 4 },
        { symbol: "TON", name: "Toncoin", category: "crypto", decimals: 4 },
        { symbol: "PEPE", name: "Pepe", category: "crypto", decimals: 0 },
        { symbol: "SHIB", name: "Shiba Inu", category: "crypto", decimals: 0 },
        { symbol: "SUI", name: "Sui", category: "crypto", decimals: 4 },
        { symbol: "INR", name: "Indian Rupee", category: "fiat", decimals: 2 }
    ];

    // State
    const STATE = {
        fromAsset: "BTC",
        toAsset: "USDT",
        fromAmount: 0,
        toAmount: 0,
        rate: 0,
        balances: {},
        prices: {
            BTC: 64500,
            ETH: 3450,
            USDT: 1.0,
            USDC: 1.0,
            SOL: 145,
            XRP: 0.58,
            BNB: 580,
            DOGE: 0.12,
            ADA: 0.38,
            TRX: 0.15,
            LTC: 68,
            LINK: 11.5,
            NEAR: 4.2,
            TON: 5.6,
            PEPE: 0.000008,
            SHIB: 0.000018,
            SUI: 1.15,
            INR: 0.0113 // ~88.5 INR/USDT
        },
        usdtInrRate: 88.50,
        activePickerTarget: "from", // 'from' | 'to'
        activeCategoryFilter: "all",
        lastEditedField: "from", // 'from' | 'to'
        isQuoting: false,
        isSubmitting: false,
        quoteTimeout: null
    };

    // DOM Elements
    let elFromBtn, elToBtn, elFromIcon, elToIcon, elFromSymbol, elToSymbol;
    let elFromInput, elToOutput, elFromBalance, elToBalance, elFromMaxBtn;
    let elFromUsdEst, elToUsdEst, elRateText, elAlertBox, elAlertMsg;
    let elSubmitBtn, elSubmitBtnText, elSwapToggleBtn, elBackBtn, elHistoryBtn, elFaqBtn;
    let elPickerModal, elPickerList, elPickerSearch, elPickerCloseBtn, elPickerTitle;
    let elHistoryModal, elHistoryList, elHistoryCloseBtn;
    let elFaqModal, elFaqCloseBtn;
    let elSuccessModal, elSuccessDoneBtn;

    // SVG Coin Icon Resolver
    function getCoinSvg(symbol) {
        if (typeof window.txGetCoinLogoSvg === "function") {
            return window.txGetCoinLogoSvg(symbol);
        }

        const fallbackColors = {
            BTC: "#f7931a",
            ETH: "#627eea",
            USDT: "#26a17b",
            USDC: "#2775ca",
            SOL: "#9945ff",
            XRP: "#23292f",
            BNB: "#f3ba2f",
            DOGE: "#c2a633",
            ADA: "#0033ad",
            INR: "#059669"
        };

        const color = fallbackColors[symbol] || "#0284c7";
        return `<svg viewBox="0 0 32 32" class="w-6 h-6 rounded-full shadow-sm"><circle cx="16" cy="16" r="16" fill="${color}"/><text x="16" y="21" font-family="system-ui, sans-serif" font-size="12" font-weight="900" fill="#ffffff" text-anchor="middle">${symbol.slice(0, 3)}</text></svg>`;
    }

    // Helper: Format Number Cleanly
    function formatCryptoNum(val, decimals = 8) {
        if (val === undefined || val === null || isNaN(val)) return "0";
        const n = parseFloat(val);
        if (n === 0) return "0";
        if (decimals === 0) return Math.floor(n).toLocaleString();
        if (n < 0.000001) return n.toFixed(8).replace(/\.?0+$/, "");
        if (n < 1) return n.toFixed(6).replace(/\.?0+$/, "");
        return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals });
    }

    // Helper: Format Clean Decimal without scientific notation (e.g. 5.9e-7 -> 0.00000059)
    function formatDecimalString(val, toDecimals = 8) {
        if (val === undefined || val === null || isNaN(val)) return "";
        const n = typeof val === "number" ? val : parseFloat(val);
        if (n === 0) return "0";
        const maxDec = n < 0.001 ? 8 : Math.max(toDecimals || 4, 2);
        let str = n.toFixed(maxDec);
        if (str.includes(".")) {
            str = str.replace(/\.?0+$/, "");
        }
        return str || "0";
    }

    // Cache key for active user & sub-account
    function getWalletCacheKey() {
        const user = typeof getAuthUser === "function" ? getAuthUser() : null;
        const userId = user?.id || user?._id || user?.user_id || "default";
        const subId = localStorage.getItem("traidiumx_active_user_id") || "main";
        return `traidiumx_cached_wallet_${userId}_${subId}`;
    }

    function loadCachedWalletData() {
        try {
            const raw = localStorage.getItem(getWalletCacheKey());
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") {
                    extractWalletBalances(parsed);
                }
            }
        } catch (e) {
            console.warn("Unable to load cached wallet for exchange:", e);
        }
    }

    function extractWalletBalances(w) {
        if (!w || typeof w !== "object") return;
        const walletObj = w.wallet || w;
        const balances = {};

        ASSETS_LIST.forEach(coin => {
            const sym = coin.symbol;
            const key = sym === "INR" ? "main_wallet_inr" : sym === "USDT" ? "main_wallet_usdt" : `main_wallet_${sym.toLowerCase()}`;
            const bucket = walletObj[key] || walletObj[`main_wallet_${sym.toLowerCase()}`] || {};
            const avail = parseFloat(bucket.available_balance ?? bucket.total_balance ?? 0) || 0;
            balances[sym] = avail;
        });

        // Fallback for USDT if stored under main_wallet
        if (!balances["USDT"] && walletObj.main_wallet) {
            balances["USDT"] = parseFloat(walletObj.main_wallet.available_balance ?? walletObj.main_wallet.total_balance ?? 0) || 0;
        }

        STATE.balances = balances;
        updateBalancesDisplay();
        updateAlertState();
        updateSubmitButtonState();
    }

    // Initialize Page
    document.addEventListener("DOMContentLoaded", function () {
        cacheDomElements();
        parseUrlParameters();
        bindEvents();
        loadCachedWalletData();
        loadWalletBalances();
        loadLiveMarketPrices();
        updateUiDisplay();

        // Real-time live rate streaming polling every 3 seconds
        setInterval(() => {
            if (document.visibilityState === "visible") {
                loadLiveMarketPrices();
            }
        }, 3000);
    });

    function cacheDomElements() {
        elFromBtn = document.getElementById("txFromCoinBtn");
        elToBtn = document.getElementById("txToCoinBtn");
        elFromIcon = document.getElementById("txFromCoinIcon");
        elToIcon = document.getElementById("txToCoinIcon");
        elFromSymbol = document.getElementById("txFromCoinSymbol");
        elToSymbol = document.getElementById("txToCoinSymbol");

        elFromInput = document.getElementById("txFromAmountInput");
        elToOutput = document.getElementById("txToAmountOutput");
        elFromBalance = document.getElementById("txFromBalanceVal");
        elToBalance = document.getElementById("txToBalanceVal");
        elFromMaxBtn = document.getElementById("txFromMaxBtn");

        elFromUsdEst = document.getElementById("txFromUsdEstimate");
        elToUsdEst = document.getElementById("txToUsdEstimate");
        elRateText = document.getElementById("txExchangeRateText");
        elAlertBox = document.getElementById("txExchangeAlertBox");
        elAlertMsg = document.getElementById("txExchangeAlertMsg");

        elSubmitBtn = document.getElementById("txSubmitExchangeBtn");
        elSubmitBtnText = document.getElementById("txSubmitBtnText");
        elSwapToggleBtn = document.getElementById("txSwapToggleBtn");
        elBackBtn = document.getElementById("txExchangeBackBtn");
        elHistoryBtn = document.getElementById("txExchangeHistoryBtn");
        elFaqBtn = document.getElementById("txFaqLinkBtn");

        elPickerModal = document.getElementById("txCoinPickerModal");
        elPickerList = document.getElementById("txCoinsListContainer");
        elPickerSearch = document.getElementById("txCoinSearchInput");
        elPickerCloseBtn = document.getElementById("txCloseCoinPickerBtn");
        elPickerTitle = document.getElementById("txCoinPickerTitle");

        elHistoryModal = document.getElementById("txExchangeHistoryModal");
        elHistoryList = document.getElementById("txExchangeHistoryList");
        elHistoryCloseBtn = document.getElementById("txCloseHistoryModalBtn");

        elFaqModal = document.getElementById("txFaqModal");
        elFaqCloseBtn = document.getElementById("txCloseFaqModalBtn");

        elSuccessModal = document.getElementById("txExchangeSuccessModal");
        elSuccessDoneBtn = document.getElementById("txSuccessDoneBtn");
    }

    function parseUrlParameters() {
        const params = new URLSearchParams(window.location.search);
        let fromParam = (params.get("from") || params.get("asset") || params.get("currency") || "").toUpperCase();
        let toParam = (params.get("to") || "").toUpperCase();

        if (fromParam === "USD") fromParam = "USDT";
        if (toParam === "USD") toParam = "USDT";

        if (fromParam && ASSETS_LIST.some(a => a.symbol === fromParam)) {
            STATE.fromAsset = fromParam;
        }
        if (toParam && ASSETS_LIST.some(a => a.symbol === toParam)) {
            STATE.toAsset = toParam;
        }
        if (STATE.fromAsset === STATE.toAsset) {
            STATE.toAsset = STATE.fromAsset === "USDT" ? "BTC" : "USDT";
        }
    }

    function bindEvents() {
        // Back Button
        elBackBtn?.addEventListener("click", () => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = "./wallet.html";
            }
        });

        // History Modal
        elHistoryBtn?.addEventListener("click", openHistoryModal);
        elHistoryCloseBtn?.addEventListener("click", closeHistoryModal);

        // FAQ Modal
        elFaqBtn?.addEventListener("click", () => elFaqModal?.classList.add("is-open"));
        elFaqCloseBtn?.addEventListener("click", () => elFaqModal?.classList.remove("is-open"));

        // Coin Pickers
        elFromBtn?.addEventListener("click", () => openCoinPicker("from"));
        elToBtn?.addEventListener("click", () => openCoinPicker("to"));
        elPickerCloseBtn?.addEventListener("click", closeCoinPicker);
        elPickerSearch?.addEventListener("input", renderCoinPickerList);

        // Filter tabs inside picker
        document.querySelectorAll(".tx-coin-filter-pill").forEach(pill => {
            pill.addEventListener("click", (e) => {
                document.querySelectorAll(".tx-coin-filter-pill").forEach(p => {
                    p.className = "tx-coin-filter-pill px-3.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 transition cursor-pointer";
                });
                pill.className = "tx-coin-filter-pill px-3.5 py-1.5 rounded-xl bg-cyan-400 text-slate-950 font-black shadow-sm transition cursor-pointer";
                STATE.activeCategoryFilter = pill.getAttribute("data-category") || "all";
                renderCoinPickerList();
            });
        });

        // Swap Direction Switch
        elSwapToggleBtn?.addEventListener("click", () => {
            const temp = STATE.fromAsset;
            STATE.fromAsset = STATE.toAsset;
            STATE.toAsset = temp;

            // Swap amounts if entered
            const prevFrom = STATE.fromAmount;
            const prevTo = STATE.toAmount;
            if (prevTo > 0) {
                STATE.fromAmount = prevTo;
                STATE.lastEditedField = "from";
                if (elFromInput) elFromInput.value = STATE.fromAmount > 0 ? STATE.fromAmount : "";
                if (elToOutput) elToOutput.value = "";
            } else if (prevFrom > 0) {
                STATE.fromAmount = prevFrom;
                STATE.lastEditedField = "from";
                if (elFromInput) elFromInput.value = STATE.fromAmount > 0 ? STATE.fromAmount : "";
                if (elToOutput) elToOutput.value = "";
            } else {
                STATE.fromAmount = 0;
                STATE.toAmount = 0;
                if (elFromInput) elFromInput.value = "";
                if (elToOutput) elToOutput.value = "";
            }

            updateUiDisplay();
            scheduleQuoteCalculation();
        });

        // Input Amount Changed (From)
        elFromInput?.addEventListener("input", (e) => {
            STATE.lastEditedField = "from";
            const val = parseFloat(e.target.value);
            STATE.fromAmount = isNaN(val) || val < 0 ? 0 : val;
            updateUsdEstimates();
            scheduleQuoteCalculation();
        });

        // Input Amount Changed (To / Receive)
        elToOutput?.addEventListener("input", (e) => {
            STATE.lastEditedField = "to";
            const val = parseFloat(e.target.value);
            STATE.toAmount = isNaN(val) || val < 0 ? 0 : val;
            updateUsdEstimates();
            scheduleReverseQuoteCalculation();
        });

        // Max Button
        elFromMaxBtn?.addEventListener("click", () => {
            STATE.lastEditedField = "from";
            const avail = STATE.balances[STATE.fromAsset] || 0;
            if (avail > 0) {
                STATE.fromAmount = avail;
                if (elFromInput) elFromInput.value = avail;
                updateUsdEstimates();
                scheduleQuoteCalculation();
            }
        });

        // Submit Exchange
        elSubmitBtn?.addEventListener("click", executeExchange);

        // Success Done Button
        elSuccessDoneBtn?.addEventListener("click", () => {
            elSuccessModal?.classList.remove("is-open");
            if (elFromInput) elFromInput.value = "";
            if (elToOutput) elToOutput.value = "";
            STATE.fromAmount = 0;
            updateUiDisplay();
        });

        // Close modals on background click or Esc
        window.addEventListener("click", (e) => {
            if (e.target === elPickerModal) closeCoinPicker();
            if (e.target === elHistoryModal) closeHistoryModal();
            if (e.target === elFaqModal) elFaqModal?.classList.remove("is-open");
            if (e.target === elSuccessModal) elSuccessModal?.classList.remove("is-open");
        });

        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                closeCoinPicker();
                closeHistoryModal();
                elFaqModal?.classList.remove("is-open");
                elSuccessModal?.classList.remove("is-open");
            }
        });
    }

    // Load Wallet Balances from API
    async function loadWalletBalances() {
        try {
            if (typeof apiRequest !== "function") return;
            const activeSubId = localStorage.getItem("traidiumx_active_user_id");
            const balanceUrl = (activeSubId && activeSubId !== "main")
                ? `/wallet/balance?sub_account_id=${encodeURIComponent(activeSubId)}`
                : "/wallet/balance";

            const res = await apiRequest(balanceUrl);
            const w = res?.data?.wallet || res?.data || null;
            if (w) {
                extractWalletBalances(w);
            }
        } catch (e) {
            console.warn("Wallet balance fetch warning:", e);
        }
    }

    // Load Live Market Prices
    async function loadLiveMarketPrices() {
        try {
            // 1. Fetch USDT-INR rate
            if (typeof apiRequest === "function") {
                const rateRes = await apiRequest("/wallet/usdt-rate");
                if (rateRes && rateRes.success && rateRes.data?.usdt_rate) {
                    STATE.usdtInrRate = parseFloat(rateRes.data.usdt_rate);
                    STATE.prices["INR"] = 1.0 / STATE.usdtInrRate;
                }
            }

            // 2. Fetch market tickers via Binance or system market tickers
            const binanceSymbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "TRXUSDT", "LTCUSDT", "LINKUSDT", "NEARUSDT", "TONUSDT", "PEPEUSDT", "SHIBUSDT", "SUIUSDT"];
            fetch("https://api.binance.com/api/v3/ticker/price")
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        data.forEach(item => {
                            if (binanceSymbols.includes(item.symbol)) {
                                const base = item.symbol.replace("USDT", "");
                                STATE.prices[base] = parseFloat(item.price);
                            }
                        });
                        calculateRate();
                        updateUiDisplay();
                    }
                })
                .catch(() => {
                    calculateRate();
                    updateUiDisplay();
                });
        } catch (e) {
            calculateRate();
            updateUiDisplay();
        }
    }

    // Calculate Rate between From and To
    function calculateRate() {
        const fromPrice = STATE.prices[STATE.fromAsset] || 1.0;
        const toPrice = STATE.prices[STATE.toAsset] || 1.0;

        if (toPrice > 0) {
            STATE.rate = fromPrice / toPrice;
        } else {
            STATE.rate = 1.0;
        }
    }

    // Schedule debounced quote calculation (From -> To)
    function scheduleQuoteCalculation() {
        clearTimeout(STATE.quoteTimeout);
        calculateLocalQuote();
        STATE.quoteTimeout = setTimeout(requestQuote, 350);
    }

    // Schedule debounced reverse quote calculation (To -> From)
    function scheduleReverseQuoteCalculation() {
        clearTimeout(STATE.quoteTimeout);
        calculateLocalReverseQuote();
        STATE.quoteTimeout = setTimeout(requestQuote, 350);
    }

    function calculateLocalQuote() {
        calculateRate();
        const toDecimals = ASSETS_LIST.find(a => a.symbol === STATE.toAsset)?.decimals ?? 8;

        if (STATE.fromAmount > 0 && STATE.rate > 0) {
            STATE.toAmount = STATE.fromAmount * STATE.rate;
            if (elToOutput && document.activeElement !== elToOutput) {
                elToOutput.value = formatDecimalString(STATE.toAmount, toDecimals);
            }
        } else if (STATE.fromAmount === 0 && STATE.lastEditedField === "from") {
            STATE.toAmount = 0;
            if (elToOutput && document.activeElement !== elToOutput) elToOutput.value = "";
        }

        updateRateText();
        updateUsdEstimates();
        updateAlertState();
        updateSubmitButtonState();
    }

    function calculateLocalReverseQuote() {
        calculateRate();
        const fromDecimals = ASSETS_LIST.find(a => a.symbol === STATE.fromAsset)?.decimals ?? 8;

        if (STATE.toAmount > 0 && STATE.rate > 0) {
            STATE.fromAmount = STATE.toAmount / STATE.rate;
            if (elFromInput && document.activeElement !== elFromInput) {
                elFromInput.value = formatDecimalString(STATE.fromAmount, fromDecimals);
            }
        } else if (STATE.toAmount === 0 && STATE.lastEditedField === "to") {
            STATE.fromAmount = 0;
            if (elFromInput && document.activeElement !== elFromInput) elFromInput.value = "";
        }

        updateRateText();
        updateUsdEstimates();
        updateAlertState();
        updateSubmitButtonState();
    }

    // Server-side Quote request
    async function requestQuote() {
        if (STATE.lastEditedField === "to") {
            if (!STATE.toAmount || STATE.toAmount <= 0) {
                calculateLocalReverseQuote();
                return;
            }
        } else {
            if (!STATE.fromAmount || STATE.fromAmount <= 0) {
                calculateLocalQuote();
                return;
            }
        }

        try {
            STATE.isQuoting = true;
            if (typeof apiRequest !== "function") return;

            const res = await apiRequest("/wallet/exchange", {
                method: "POST",
                body: JSON.stringify({
                    from_asset: STATE.fromAsset,
                    to_asset: STATE.toAsset,
                    amount: STATE.fromAmount,
                    execute: false
                })
            });

            if (res && res.success && res.data) {
                if (res.data.rate) STATE.rate = parseFloat(res.data.rate);
                if (res.data.receive_amount !== undefined) {
                    if (STATE.lastEditedField === "from") {
                        STATE.toAmount = parseFloat(res.data.receive_amount);
                        if (elToOutput && document.activeElement !== elToOutput) {
                            const toDecimals = ASSETS_LIST.find(a => a.symbol === STATE.toAsset)?.decimals ?? 8;
                            elToOutput.value = formatDecimalString(STATE.toAmount, toDecimals);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("Server quote fallback to local:", e);
        } finally {
            STATE.isQuoting = false;
            updateRateText();
            updateUsdEstimates();
            updateAlertState();
            updateSubmitButtonState();
        }
    }

    // Update UI Elements
    function updateUiDisplay() {
        calculateRate();

        // From Pill
        if (elFromIcon) elFromIcon.innerHTML = getCoinSvg(STATE.fromAsset);
        if (elFromSymbol) elFromSymbol.textContent = STATE.fromAsset;

        // To Pill
        if (elToIcon) elToIcon.innerHTML = getCoinSvg(STATE.toAsset);
        if (elToSymbol) elToSymbol.textContent = STATE.toAsset;

        updateBalancesDisplay();
        updateRateText();
        updateUsdEstimates();
        updateAlertState();
        updateSubmitButtonState();
    }

    function updateBalancesDisplay() {
        const fromBal = STATE.balances[STATE.fromAsset] || 0;
        const toBal = STATE.balances[STATE.toAsset] || 0;

        if (elFromBalance) elFromBalance.textContent = formatCryptoNum(fromBal, 6);
        if (elToBalance) elToBalance.textContent = formatCryptoNum(toBal, 6);
    }

    function updateRateText() {
        if (!elRateText) return;
        const toDecimals = ASSETS_LIST.find(a => a.symbol === STATE.toAsset)?.decimals ?? 4;
        const rateFormatted = STATE.rate < 0.0001
            ? STATE.rate.toFixed(8)
            : STATE.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: toDecimals > 4 ? 6 : toDecimals });

        elRateText.textContent = `1 ${STATE.fromAsset} ≈ ${rateFormatted} ${STATE.toAsset}`;
    }

    function updateUsdEstimates() {
        const fromPrice = STATE.prices[STATE.fromAsset] || 1.0;
        const toPrice = STATE.prices[STATE.toAsset] || 1.0;

        const fromUsd = (STATE.fromAmount || 0) * fromPrice;
        const toUsd = (STATE.toAmount || 0) * toPrice;

        if (elFromUsdEst) elFromUsdEst.textContent = `≈ $${fromUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
        if (elToUsdEst) elToUsdEst.textContent = `≈ $${toUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    }

    function updateAlertState() {
        const fromBal = STATE.balances[STATE.fromAsset] || 0;
        const hasNoBalance = fromBal <= 0;
        const isInsufficient = STATE.fromAmount > fromBal;

        if (hasNoBalance) {
            if (elAlertBox) elAlertBox.classList.remove("hidden");
            if (elAlertMsg) {
                elAlertMsg.innerHTML = `No ${STATE.fromAsset} in your wallet. <a href="./wallet.html?tab=deposit&type=crypto" class="font-bold underline text-cyan-300 hover:text-cyan-200">Deposit</a> to start exchanging.`;
            }
        } else if (isInsufficient) {
            if (elAlertBox) elAlertBox.classList.remove("hidden");
            if (elAlertMsg) {
                elAlertMsg.innerHTML = `Insufficient ${STATE.fromAsset} balance (${formatCryptoNum(fromBal, 4)} available). <a href="./wallet.html?tab=deposit&type=crypto" class="font-bold underline text-cyan-300 hover:text-cyan-200">Deposit more</a>.`;
            }
        } else {
            if (elAlertBox) elAlertBox.classList.add("hidden");
        }
    }

    function updateSubmitButtonState() {
        if (!elSubmitBtn || !elSubmitBtnText) return;

        const fromBal = STATE.balances[STATE.fromAsset] || 0;

        if (STATE.isSubmitting) {
            elSubmitBtn.disabled = true;
            elSubmitBtnText.textContent = "Exchanging Assets...";
            return;
        }

        if (fromBal <= 0) {
            elSubmitBtn.disabled = true;
            elSubmitBtnText.textContent = `No ${STATE.fromAsset} in Wallet`;
            return;
        }

        if (!STATE.fromAmount || STATE.fromAmount <= 0) {
            elSubmitBtn.disabled = true;
            elSubmitBtnText.textContent = "Enter an Amount";
            return;
        }

        if (STATE.fromAmount > fromBal) {
            elSubmitBtn.disabled = true;
            elSubmitBtnText.textContent = `Insufficient ${STATE.fromAsset} Balance`;
            return;
        }

        elSubmitBtn.disabled = false;
        elSubmitBtnText.textContent = `Swap ${STATE.fromAsset} to ${STATE.toAsset}`;
    }

    // Execute Exchange API
    async function executeExchange() {
        if (STATE.isSubmitting) return;

        const fromBal = STATE.balances[STATE.fromAsset] || 0;
        if (!STATE.fromAmount || STATE.fromAmount <= 0 || STATE.fromAmount > fromBal) {
            return;
        }

        try {
            STATE.isSubmitting = true;
            updateSubmitButtonState();

            if (typeof apiRequest !== "function") {
                alert("API service not initialized.");
                return;
            }

            const response = await apiRequest("/wallet/exchange", {
                method: "POST",
                body: JSON.stringify({
                    from_asset: STATE.fromAsset,
                    to_asset: STATE.toAsset,
                    amount: STATE.fromAmount,
                    execute: true
                })
            });

            if (response && response.success) {
                try {
                    const audio = new Audio("../../assets/sounds/trade_place.mp3");
                    audio.play().catch(() => {});
                } catch (_) {}

                // Populate Success Modal
                const data = response.data || {};
                const spentAmount = data.amount || STATE.fromAmount;
                const recvAmount = data.receive_amount || STATE.toAmount;

                const elSuccessSpent = document.getElementById("txSuccessSpentVal");
                const elSuccessRecv = document.getElementById("txSuccessReceivedVal");
                const elSuccessRate = document.getElementById("txSuccessRateVal");
                const elSuccessMsg = document.getElementById("txSuccessModalMsg");

                if (elSuccessSpent) elSuccessSpent.textContent = `${formatCryptoNum(spentAmount, 6)} ${STATE.fromAsset}`;
                if (elSuccessRecv) elSuccessRecv.textContent = `${formatCryptoNum(recvAmount, 6)} ${STATE.toAsset}`;
                if (elSuccessRate) elSuccessRate.textContent = `1 ${STATE.fromAsset} = ${formatCryptoNum(STATE.rate, 6)} ${STATE.toAsset}`;
                if (elSuccessMsg) elSuccessMsg.textContent = response.message || `Swapped ${spentAmount} ${STATE.fromAsset} to ${recvAmount} ${STATE.toAsset}.`;

                elSuccessModal?.classList.add("is-open");

                // Refresh balances
                await loadWalletBalances();
            } else {
                alert(response?.message || "Exchange failed. Please try again.");
            }
        } catch (err) {
            console.error("Exchange execution error:", err);
            alert(err.message || "An unexpected error occurred during exchange.");
        } finally {
            STATE.isSubmitting = false;
            updateSubmitButtonState();
        }
    }

    // Coin Picker Modal Handlers
    function openCoinPicker(target) {
        STATE.activePickerTarget = target;
        if (elPickerTitle) {
            elPickerTitle.textContent = target === "from" ? "Select Currency to Send" : "Select Currency to Receive";
        }
        if (elPickerSearch) elPickerSearch.value = "";
        renderCoinPickerList();
        elPickerModal?.classList.add("is-open");
        setTimeout(() => elPickerSearch?.focus(), 100);
    }

    function closeCoinPicker() {
        elPickerModal?.classList.remove("is-open");
    }

    function renderCoinPickerList() {
        if (!elPickerList) return;

        const query = (elPickerSearch?.value || "").trim().toLowerCase();
        const activeCategory = STATE.activeCategoryFilter || "all";
        const currentSelected = STATE.activePickerTarget === "from" ? STATE.fromAsset : STATE.toAsset;

        let filtered = ASSETS_LIST.filter(coin => {
            if (activeCategory !== "all" && coin.category !== activeCategory) {
                return false;
            }
            if (query) {
                return coin.symbol.toLowerCase().includes(query) || coin.name.toLowerCase().includes(query);
            }
            return true;
        });

        if (filtered.length === 0) {
            elPickerList.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs">No currencies found matching "${query}".</div>`;
            return;
        }

        let html = "";
        filtered.forEach(coin => {
            const isSelected = coin.symbol === currentSelected;
            const bal = STATE.balances[coin.symbol] || 0;
            const price = STATE.prices[coin.symbol] || 1.0;
            const usdVal = bal * price;

            html += `
                <div class="tx-coin-picker-row flex items-center justify-between p-3 sm:p-3.5 rounded-2xl hover:bg-white/[0.08] transition cursor-pointer ${isSelected ? 'bg-cyan-500/15 border border-cyan-400/40 shadow-sm shadow-cyan-950/20' : 'border border-transparent'}" data-symbol="${coin.symbol}">
                    <div class="flex items-center gap-3.5 min-w-0">
                        <div class="w-9 h-9 flex-shrink-0 flex items-center justify-center">${getCoinSvg(coin.symbol)}</div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="font-black text-sm text-white tracking-wide">${coin.symbol}</span>
                                ${isSelected ? '<span class="text-[9px] px-1.5 py-0.5 rounded-md bg-cyan-400 text-slate-950 font-black">SELECTED</span>' : ''}
                            </div>
                            <div class="text-xs text-slate-400 truncate mt-0.5">${coin.name}</div>
                        </div>
                    </div>
                    <div class="text-right font-mono flex-shrink-0 ml-3">
                        <div class="text-xs sm:text-sm font-black text-white">${formatCryptoNum(bal, 4)}</div>
                        <div class="text-[11px] text-slate-400 mt-0.5">≈ $${usdVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                </div>
            `;
        });

        elPickerList.innerHTML = html;

        elPickerList.querySelectorAll(".tx-coin-picker-row").forEach(row => {
            row.addEventListener("click", () => {
                const symbol = row.getAttribute("data-symbol");
                if (symbol) {
                    selectCoin(symbol);
                }
            });
        });
    }

    function selectCoin(symbol) {
        if (STATE.activePickerTarget === "from") {
            if (symbol === STATE.toAsset) {
                STATE.toAsset = STATE.fromAsset;
            }
            STATE.fromAsset = symbol;
        } else {
            if (symbol === STATE.fromAsset) {
                STATE.fromAsset = STATE.toAsset;
            }
            STATE.toAsset = symbol;
        }

        closeCoinPicker();
        updateUiDisplay();
        if (STATE.lastEditedField === "to") {
            scheduleReverseQuoteCalculation();
        } else {
            scheduleQuoteCalculation();
        }
    }

    // Exchange History Modal Handlers
    async function openHistoryModal() {
        elHistoryModal?.classList.add("is-open");
        if (elHistoryList) {
            elHistoryList.innerHTML = `<div class="text-center py-10 text-slate-400 text-sm animate-pulse">Loading exchange history...</div>`;
        }

        try {
            if (typeof apiRequest !== "function") return;
            const res = await apiRequest("/wallet/ledger");
            if (res && res.success && Array.isArray(res.data)) {
                const history = res.data.filter(tx => 
                    tx.transaction_type === "exchange_debit" || 
                    tx.transaction_type === "exchange_credit" || 
                    String(tx.description || "").toLowerCase().includes("exchanged")
                );

                renderHistoryList(history);
            } else {
                if (elHistoryList) elHistoryList.innerHTML = `<div class="text-center py-10 text-slate-400 text-sm">No exchange transactions recorded yet.</div>`;
            }
        } catch (e) {
            if (elHistoryList) elHistoryList.innerHTML = `<div class="text-center py-10 text-red-400 text-sm">Failed to load history.</div>`;
        }
    }

    function closeHistoryModal() {
        elHistoryModal?.classList.remove("is-open");
    }

    function renderHistoryList(items) {
        if (!elHistoryList) return;
        if (!items || items.length === 0) {
            elHistoryList.innerHTML = `
                <div class="text-center py-12 text-slate-500">
                    <div class="text-3xl mb-2">📜</div>
                    <p class="text-sm font-semibold text-slate-400">No exchange history yet</p>
                    <p class="text-xs text-slate-500 mt-1">Your instant swap transactions will appear here.</p>
                </div>
            `;
            return;
        }

        let html = "";
        items.forEach(tx => {
            const isDebit = tx.direction === "debit" || tx.transaction_type === "exchange_debit";
            const dateStr = tx.created_at ? new Date(tx.created_at).toLocaleString() : "Recent";
            const desc = tx.description || "Exchange conversion";

            html += `
                <div class="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl ${isDebit ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'} flex items-center justify-center font-bold text-base flex-shrink-0">
                            ${isDebit ? '↗' : '↙'}
                        </div>
                        <div>
                            <div class="text-xs sm:text-sm font-bold text-white leading-snug">${desc}</div>
                            <div class="text-[11px] text-slate-500 font-mono mt-0.5">${dateStr}</div>
                        </div>
                    </div>
                    <div class="text-right font-mono flex-shrink-0">
                        <div class="text-xs sm:text-sm font-black ${isDebit ? 'text-rose-400' : 'text-emerald-400'}">
                            ${isDebit ? '-' : '+'}${formatCryptoNum(tx.amount, 6)} ${tx.currency || ''}
                        </div>
                        <span class="inline-block mt-0.5 text-[9px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            COMPLETED
                        </span>
                    </div>
                </div>
            `;
        });

        elHistoryList.innerHTML = html;
    }

})();

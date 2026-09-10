/**
 * TraidiumX Academy / Learn Page Controller (learn.js)
 * Provides interactive features:
 * - Category Tabs & Live Search Filtering
 * - Interactive Futures Leverage & P&L Calculator
 * - Candlestick Pattern Inspector
 * - A-Z Trading Glossary Search
 * - FAQ Accordion
 */

(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        initCategoryFilter();
        initLiveSearch();
        initFuturesCalculator();
        initCandlestickInspector();
        initGlossarySearch();
        initFaqAccordion();
    });

    /* ==========================================================================
       1. Category Filtering
       ========================================================================== */
    function initCategoryFilter() {
        const filterBtns = document.querySelectorAll(".tx-learn-tab-btn");
        const moduleCards = document.querySelectorAll(".tx-learn-card");

        filterBtns.forEach((btn) => {
            btn.addEventListener("click", () => {
                const category = btn.getAttribute("data-category");

                filterBtns.forEach((b) => {
                    b.classList.remove("active", "bg-cyan-400", "text-slate-950", "shadow-lg", "shadow-cyan-400/20");
                    b.classList.add("bg-[#0f172a]", "text-slate-300", "border-white/10");
                });

                btn.classList.add("active", "bg-cyan-400", "text-slate-950", "shadow-lg", "shadow-cyan-400/20");
                btn.classList.remove("bg-[#0f172a]", "text-slate-300", "border-white/10");

                let visibleCount = 0;
                moduleCards.forEach((card) => {
                    const cardCat = card.getAttribute("data-category") || "";
                    if (category === "all" || cardCat === category || cardCat.includes(category)) {
                        card.style.display = "";
                        visibleCount++;
                    } else {
                        card.style.display = "none";
                    }
                });

                const noResults = document.getElementById("learnNoResults");
                if (noResults) {
                    noResults.classList.toggle("hidden", visibleCount > 0);
                }
            });
        });
    }

    /* ==========================================================================
       2. Global Search Filtering
       ========================================================================== */
    function initLiveSearch() {
        const searchInput = document.getElementById("learnSearchInput");
        const moduleCards = document.querySelectorAll(".tx-learn-card");
        const noResults = document.getElementById("learnNoResults");

        if (!searchInput) return;

        searchInput.addEventListener("input", (e) => {
            const query = (e.target.value || "").trim().toLowerCase();
            let visibleCount = 0;

            moduleCards.forEach((card) => {
                const title = (card.querySelector(".tx-learn-title")?.textContent || "").toLowerCase();
                const desc = (card.querySelector(".tx-learn-desc")?.textContent || "").toLowerCase();
                const tags = (card.getAttribute("data-tags") || "").toLowerCase();

                if (!query || title.includes(query) || desc.includes(query) || tags.includes(query)) {
                    card.style.display = "";
                    visibleCount++;
                } else {
                    card.style.display = "none";
                }
            });

            if (noResults) {
                noResults.classList.toggle("hidden", visibleCount > 0);
            }
        });
    }

    /* ==========================================================================
       3. Interactive Futures Leverage & P&L Calculator
       ========================================================================== */
    function initFuturesCalculator() {
        const directionBtns = document.querySelectorAll(".tx-calc-dir-btn");
        const marginInput = document.getElementById("calcMarginAmount");
        const leverageSlider = document.getElementById("calcLeverageSlider");
        const leverageValText = document.getElementById("calcLeverageValText");
        const entryPriceInput = document.getElementById("calcEntryPrice");
        const exitPriceInput = document.getElementById("calcExitPrice");

        const resultPnl = document.getElementById("calcResultPnl");
        const resultRoe = document.getElementById("calcResultRoe");
        const resultPosSize = document.getElementById("calcResultPosSize");
        const resultLiqPrice = document.getElementById("calcResultLiqPrice");

        let activeDirection = "LONG";

        const riskBadge = document.getElementById("calcRiskBadge");

        directionBtns.forEach((btn) => {
            btn.addEventListener("click", () => {
                directionBtns.forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                activeDirection = btn.getAttribute("data-dir") || "LONG";
                calculatePnl();
            });
        });

        if (leverageSlider && leverageValText) {
            leverageSlider.addEventListener("input", () => {
                const val = parseInt(leverageSlider.value, 10) || 1;
                leverageValText.textContent = `${val}x`;

                if (riskBadge) {
                    if (val <= 5) {
                        riskBadge.textContent = "Low Risk";
                        riskBadge.className = "px-2.5 py-1 rounded-full text-xs font-black border bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
                    } else if (val <= 25) {
                        riskBadge.textContent = "Moderate Risk";
                        riskBadge.className = "px-2.5 py-1 rounded-full text-xs font-black border bg-amber-500/15 text-amber-400 border-amber-500/30";
                    } else {
                        riskBadge.textContent = "High Risk";
                        riskBadge.className = "px-2.5 py-1 rounded-full text-xs font-black border bg-rose-500/15 text-rose-400 border-rose-500/30";
                    }
                }

                calculatePnl();
            });
        }

        const inputs = [marginInput, entryPriceInput, exitPriceInput];
        inputs.forEach((input) => {
            if (input) {
                input.addEventListener("input", calculatePnl);
            }
        });

        function calculatePnl() {
            const margin = parseFloat(marginInput?.value) || 0;
            const leverage = parseInt(leverageSlider?.value, 10) || 10;
            const entryPrice = parseFloat(entryPriceInput?.value) || 0;
            const exitPrice = parseFloat(exitPriceInput?.value) || 0;

            if (margin <= 0 || entryPrice <= 0 || exitPrice <= 0) {
                if (resultPnl) resultPnl.textContent = "$0.00";
                if (resultRoe) resultRoe.textContent = "0.00%";
                if (resultPosSize) resultPosSize.textContent = "$0.00";
                if (resultLiqPrice) resultLiqPrice.textContent = "$0.00";
                return;
            }

            const positionSize = margin * leverage;
            const coinAmount = positionSize / entryPrice;

            let pnl = 0;
            if (activeDirection === "LONG") {
                pnl = (exitPrice - entryPrice) * coinAmount;
            } else {
                pnl = (entryPrice - exitPrice) * coinAmount;
            }

            const roe = (pnl / margin) * 100;

            // Estimated liquidation price
            const maintenanceMarginRate = 0.005; // 0.5%
            let liqPrice = 0;
            if (activeDirection === "LONG") {
                liqPrice = entryPrice * (1 - (1 / leverage) + maintenanceMarginRate);
                liqPrice = Math.max(0, liqPrice);
            } else {
                liqPrice = entryPrice * (1 + (1 / leverage) - maintenanceMarginRate);
            }

            if (resultPosSize) {
                resultPosSize.textContent = `$${positionSize.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }

            if (resultLiqPrice) {
                resultLiqPrice.textContent = `$${liqPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }

            if (resultPnl) {
                const prefix = pnl >= 0 ? "+$" : "-$";
                resultPnl.textContent = `${prefix}${Math.abs(pnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                resultPnl.className = pnl >= 0 ? "text-lg sm:text-xl font-black text-emerald-400 font-mono tracking-tight" : "text-lg sm:text-xl font-black text-rose-400 font-mono tracking-tight";
            }

            if (resultRoe) {
                const prefix = roe >= 0 ? "+" : "";
                resultRoe.textContent = `${prefix}${roe.toFixed(2)}%`;
                resultRoe.className = roe >= 0 ? "text-lg sm:text-xl font-black text-emerald-400 font-mono tracking-tight" : "text-lg sm:text-xl font-black text-rose-400 font-mono tracking-tight";
            }
        }

        calculatePnl();
    }

    /* ==========================================================================
       4. Candlestick Pattern Inspector
       ========================================================================== */
    const CANDLE_DATA = {
        hammer: {
            title: "Hammer Pattern (Bullish Reversal)",
            signal: "Bullish Reversal",
            badgeBg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
            desc: "Formed at the bottom of a downtrend. The long lower shadow shows that sellers aggressively pushed the price down, but strong buyers stepped in and drove the price back up near the open.",
            howToTrade: "Wait for the following candle to confirm bullish momentum. Enter a Long (Buy) position and place your Stop-Loss just below the low of the Hammer.",
            winRate: "72% Historical Accuracy",
            icon: `<svg viewBox="0 0 280 120" class="w-full h-28 max-w-[280px]" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="10" y1="20" x2="270" y2="20" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="10" y1="60" x2="270" y2="60" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="10" y1="100" x2="270" y2="100" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="140" y1="18" x2="140" y2="26" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" />
  <rect x="122" y="26" width="36" height="24" rx="3" fill="#10b981" />
  <line x1="140" y1="50" x2="140" y2="104" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" />
  <text x="70" y="31" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="end">High / Open</text>
  <line x1="75" y1="28" x2="116" y2="28" stroke="#334155" stroke-width="1" />
  <text x="70" y="52" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="end">Close</text>
  <line x1="75" y1="49" x2="116" y2="49" stroke="#334155" stroke-width="1" />
  <text x="205" y="76" fill="#34d399" font-size="10" font-weight="700">Long Lower Shadow</text>
  <text x="205" y="90" fill="#64748b" font-size="9">(2x-3x Rejection Wick)</text>
  <path d="M200 78 L146 78" stroke="#10b981" stroke-width="1" stroke-dasharray="2 2" />
</svg>`
        },
        engulfing: {
            title: "Bullish Engulfing Pattern",
            signal: "Strong Bullish Signal",
            badgeBg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
            desc: "A small red candle is followed immediately by a large green candle that completely engulfs the previous candle's body, indicating that buyers have seized total market control.",
            howToTrade: "Enter Long immediately after the green candle closes. Set your Stop-Loss just below the low of the large engulfing green candle.",
            winRate: "78% Historical Accuracy",
            icon: `<svg viewBox="0 0 280 120" class="w-full h-28 max-w-[280px]" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="10" y1="20" x2="270" y2="20" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="10" y1="60" x2="270" y2="60" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="10" y1="100" x2="270" y2="100" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="100" y1="40" x2="100" y2="48" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" />
  <rect x="88" y="48" width="24" height="30" rx="3" fill="#f43f5e" />
  <line x1="100" y1="78" x2="100" y2="86" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" />
  <text x="100" y="103" fill="#fb7185" font-size="9" font-weight="700" text-anchor="middle">1. Bearish</text>
  <line x1="160" y1="16" x2="160" y2="26" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" />
  <rect x="144" y="26" width="32" height="66" rx="3" fill="#10b981" />
  <line x1="160" y1="92" x2="160" y2="104" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" />
  <text x="160" y="115" fill="#34d399" font-size="9" font-weight="700" text-anchor="middle">2. Engulfing Bull</text>
  <path d="M184 28 H192 V90 H184" stroke="#34d399" stroke-width="1.5" fill="none" />
  <text x="198" y="58" fill="#34d399" font-size="10" font-weight="700">Total Body</text>
  <text x="198" y="71" fill="#64748b" font-size="9">Engulfs #1</text>
</svg>`
        },
        bearish_engulfing: {
            title: "Bearish Engulfing Pattern",
            signal: "Strong Bearish Signal",
            badgeBg: "bg-rose-500/15 text-rose-400 border-rose-500/30",
            desc: "A small green candle is completely engulfed by a large red candle, indicating aggressive selling pressure that reverses the previous uptrend.",
            howToTrade: "Enter Short (Sell) immediately upon candle close. Place your Stop-Loss just above the high of the engulfing red candle.",
            winRate: "79% Historical Accuracy",
            icon: `<svg viewBox="0 0 280 120" class="w-full h-28 max-w-[280px]" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="10" y1="20" x2="270" y2="20" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="10" y1="60" x2="270" y2="60" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="10" y1="100" x2="270" y2="100" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="100" y1="40" x2="100" y2="48" stroke="#10b981" stroke-width="2" stroke-linecap="round" />
  <rect x="88" y="48" width="24" height="30" rx="3" fill="#10b981" />
  <line x1="100" y1="78" x2="100" y2="86" stroke="#10b981" stroke-width="2" stroke-linecap="round" />
  <text x="100" y="103" fill="#34d399" font-size="9" font-weight="700" text-anchor="middle">1. Bullish</text>
  <line x1="160" y1="16" x2="160" y2="26" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" />
  <rect x="144" y="26" width="32" height="66" rx="3" fill="#f43f5e" />
  <line x1="160" y1="92" x2="160" y2="104" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" />
  <text x="160" y="115" fill="#fb7185" font-size="9" font-weight="700" text-anchor="middle">2. Bearish Engulf</text>
  <path d="M184 28 H192 V90 H184" stroke="#fb7185" stroke-width="1.5" fill="none" />
  <text x="198" y="58" fill="#fb7185" font-size="10" font-weight="700">Total Body</text>
  <text x="198" y="71" fill="#64748b" font-size="9">Engulfs #1</text>
</svg>`
        },
        doji: {
            title: "Doji Reversal Candlestick",
            signal: "Bullish Reversal Signal",
            badgeBg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
            desc: "Opening and closing prices are virtually equal with balanced wicks. Following a downtrend, it signals that sellers are exhausted and buyers are preparing a bullish reversal.",
            howToTrade: "Wait for the following green candle to confirm upside momentum, then enter Long with a Stop-Loss placed below the Doji wick low.",
            winRate: "70% Historical Accuracy",
            icon: `<svg viewBox="0 0 280 120" class="w-full h-28 max-w-[280px]" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="10" y1="20" x2="270" y2="20" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="10" y1="60" x2="270" y2="60" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="10" y1="100" x2="270" y2="100" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="140" y1="18" x2="140" y2="58" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" />
  <rect x="120" y="58" width="40" height="4" rx="2" fill="#10b981" />
  <line x1="140" y1="62" x2="140" y2="102" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" />
  <text x="75" y="24" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="end">Session High</text>
  <line x1="80" y1="21" x2="135" y2="21" stroke="#334155" stroke-width="1" />
  <text x="205" y="58" fill="#34d399" font-size="10" font-weight="700">Open = Close</text>
  <text x="205" y="70" fill="#64748b" font-size="9">Reversal Cross</text>
  <path d="M200 60 L164 60" stroke="#10b981" stroke-width="1" stroke-dasharray="2 2" />
  <text x="75" y="100" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="end">Session Low</text>
  <line x1="80" y1="97" x2="135" y2="97" stroke="#334155" stroke-width="1" />
</svg>`
        },
        shooting_star: {
            title: "Shooting Star (Bearish Reversal)",
            signal: "Bearish Reversal",
            badgeBg: "bg-rose-500/15 text-rose-400 border-rose-500/30",
            desc: "Formed at the top of an uptrend with a long upper shadow and a small lower body. It indicates buyers attempted to push higher but were overwhelmed by heavy selling pressure.",
            howToTrade: "Confirm with the next red candle, enter a Short (Sell) position, and place your Stop-Loss above the high of the shooting star's upper shadow.",
            winRate: "74% Historical Accuracy",
            icon: `<svg viewBox="0 0 280 120" class="w-full h-28 max-w-[280px]" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="10" y1="20" x2="270" y2="20" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="10" y1="60" x2="270" y2="60" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="10" y1="100" x2="270" y2="100" stroke="#1e293b" stroke-dasharray="3 3" stroke-width="1" />
  <line x1="140" y1="16" x2="140" y2="68" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" />
  <rect x="122" y="68" width="36" height="24" rx="3" fill="#f43f5e" />
  <line x1="140" y1="92" x2="140" y2="100" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" />
  <text x="205" y="40" fill="#fb7185" font-size="10" font-weight="700">Long Upper Shadow</text>
  <text x="205" y="53" fill="#64748b" font-size="9">(Heavy Selling Pressure)</text>
  <path d="M200 42 L146 42" stroke="#f43f5e" stroke-width="1" stroke-dasharray="2 2" />
  <text x="70" y="73" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="end">Open</text>
  <line x1="75" y1="70" x2="116" y2="70" stroke="#334155" stroke-width="1" />
  <text x="70" y="93" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="end">Close / Low</text>
  <line x1="75" y1="90" x2="116" y2="90" stroke="#334155" stroke-width="1" />
</svg>`
        }
    };

    function initCandlestickInspector() {
        const patternButtons = document.querySelectorAll(".tx-pattern-select-btn");
        const titleEl = document.getElementById("candlePatternTitle");
        const signalEl = document.getElementById("candlePatternSignal");
        const descEl = document.getElementById("candlePatternDesc");
        const tradeEl = document.getElementById("candlePatternTrade");
        const winEl = document.getElementById("candlePatternWinRate");
        const iconContainer = document.getElementById("candlePatternGraphic");

        patternButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                const key = btn.getAttribute("data-pattern") || "hammer";
                const data = CANDLE_DATA[key];
                if (!data) return;

                patternButtons.forEach((b) => {
                    b.classList.remove("active", "border-cyan-400", "bg-cyan-500/10");
                    b.classList.add("border-white/10", "bg-[#091122]");
                });

                btn.classList.add("active", "border-cyan-400", "bg-cyan-500/10");
                btn.classList.remove("border-white/10", "bg-[#091122]");

                if (titleEl) titleEl.textContent = data.title;
                if (signalEl) {
                    signalEl.textContent = data.signal;
                    signalEl.className = `shrink-0 px-3 py-1 rounded-full text-[11px] font-black border whitespace-nowrap ${data.badgeBg}`;
                }
                if (descEl) descEl.textContent = data.desc;
                if (tradeEl) tradeEl.textContent = data.howToTrade;
                if (winEl) winEl.textContent = data.winRate;
                if (iconContainer) iconContainer.innerHTML = data.icon;
            });
        });
    }

    /* ==========================================================================
       5. Glossary Instant Search
       ========================================================================== */
    function initGlossarySearch() {
        const glossaryInput = document.getElementById("glossarySearchInput");
        const glossaryItems = document.querySelectorAll(".tx-glossary-card");

        if (!glossaryInput) return;

        glossaryInput.addEventListener("input", (e) => {
            const query = (e.target.value || "").trim().toLowerCase();

            glossaryItems.forEach((item) => {
                const term = (item.querySelector(".tx-glossary-term")?.textContent || "").toLowerCase();
                const def = (item.querySelector(".tx-glossary-def")?.textContent || "").toLowerCase();

                if (!query || term.includes(query) || def.includes(query)) {
                    item.style.display = "";
                } else {
                    item.style.display = "none";
                }
            });
        });
    }

    /* ==========================================================================
       6. FAQ Accordion Expand / Collapse with Smooth Animation
       ========================================================================== */
    class FaqAccordion {
        constructor(el) {
            this.el = el;
            this.summary = el.querySelector(".tx-faq-summary");
            this.content = el.querySelector(".tx-faq-answer");
            this.animation = null;
            this.isClosing = false;
            this.isExpanding = false;

            if (this.summary) {
                this.summary.addEventListener("click", (e) => this.onClick(e));
            }
        }

        onClick(e) {
            e.preventDefault();
            this.el.style.overflow = "hidden";

            if (this.isClosing || !this.el.open) {
                this.open();
            } else if (this.isExpanding || this.el.open) {
                this.shrink();
            }
        }

        shrink() {
            this.isClosing = true;
            const startHeight = `${this.el.offsetHeight}px`;
            const endHeight = `${this.summary.offsetHeight}px`;

            if (this.animation) {
                this.animation.cancel();
            }

            this.animation = this.el.animate({
                height: [startHeight, endHeight]
            }, {
                duration: 260,
                easing: "cubic-bezier(0.4, 0, 0.2, 1)"
            });

            if (this.content) {
                this.content.animate({
                    opacity: [1, 0],
                    transform: ["translateY(0)", "translateY(-6px)"]
                }, {
                    duration: 180,
                    easing: "ease-out"
                });
            }

            this.animation.onfinish = () => this.onAnimationFinish(false);
            this.animation.oncancel = () => { this.isClosing = false; };
        }

        open() {
            // Smoothly close any sibling accordions
            const allAccordions = document.querySelectorAll(".tx-faq-note");
            allAccordions.forEach((other) => {
                if (other !== this.el && other.open && other._faqAccordion) {
                    other._faqAccordion.shrink();
                }
            });

            this.el.style.height = `${this.el.offsetHeight}px`;
            this.el.open = true;
            window.requestAnimationFrame(() => this.expand());
        }

        expand() {
            this.isExpanding = true;
            const startHeight = `${this.el.offsetHeight}px`;
            const endHeight = `${this.summary.offsetHeight + (this.content ? this.content.offsetHeight : 0)}px`;

            if (this.animation) {
                this.animation.cancel();
            }

            this.animation = this.el.animate({
                height: [startHeight, endHeight]
            }, {
                duration: 290,
                easing: "cubic-bezier(0.4, 0, 0.2, 1)"
            });

            if (this.content) {
                this.content.animate({
                    opacity: [0, 1],
                    transform: ["translateY(-6px)", "translateY(0)"]
                }, {
                    duration: 270,
                    easing: "ease-out"
                });
            }

            this.animation.onfinish = () => this.onAnimationFinish(true);
            this.animation.oncancel = () => { this.isExpanding = false; };
        }

        onAnimationFinish(isOpen) {
            this.el.open = isOpen;
            this.animation = null;
            this.isClosing = false;
            this.isExpanding = false;
            this.el.style.height = "";
            this.el.style.overflow = "";
        }
    }

    function initFaqAccordion() {
        const detailsList = document.querySelectorAll(".tx-faq-note");
        detailsList.forEach((detail) => {
            detail._faqAccordion = new FaqAccordion(detail);
        });
    }
})();

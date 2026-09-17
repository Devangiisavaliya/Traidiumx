"use strict";

(function () {
    if (window.__txTradingOnboardingLoaded) return;
    window.__txTradingOnboardingLoaded = true;

    const state = {
        data: null,
        selectedPlatform: "traidiumx",
        selectedPlan: "basic",
        accountMode: "real",
        loading: false,
        onboardingCompleted: false,
    };

    function esc(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function money(value) {
        return Number(value || 0).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    function injectStyles() {
        if (document.getElementById("txTradingOnboardingStyles")) return;
        const style = document.createElement("style");
        style.id = "txTradingOnboardingStyles";
        style.textContent = `
            .tx-ob-overlay {
                position: fixed !important;
                inset: 0 !important;
                z-index: 100005 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 16px !important;
                background-color: rgba(2, 6, 23, 0.90) !important;
                backdrop-filter: blur(14px) !important;
                -webkit-backdrop-filter: blur(14px) !important;
            }
            .tx-ob-overlay.hidden { display: none !important; }
            .tx-ob-card {
                width: 100% !important;
                max-width: 860px !important;
                max-height: 90vh !important;
                background-color: #0c1220 !important;
                border: 1px solid rgba(255, 255, 255, 0.12) !important;
                border-radius: 24px !important;
                box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(34, 211, 238, 0.1) !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
                color: #f1f5f9 !important;
                animation: txObPop 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
            }
            @keyframes txObPop {
                from { opacity: 0; transform: scale(0.96) translateY(10px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
            }
            .tx-ob-header {
                background-color: #080d1a !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
                padding: 16px 24px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                flex-shrink: 0 !important;
            }
            .tx-ob-body {
                background-color: #0c1220 !important;
                flex: 1 1 auto !important;
                overflow-y: auto !important;
                padding: 24px !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 20px !important;
                scrollbar-width: none !important;
                -ms-overflow-style: none !important;
            }
            .tx-ob-body::-webkit-scrollbar {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
            }
            .tx-ob-footer {
                background-color: #080d1a !important;
                border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
                padding: 16px 24px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                flex-shrink: 0 !important;
                flex-wrap: wrap !important;
                gap: 12px !important;
            }
            .tx-ob-plan-card {
                border-radius: 16px !important;
                padding: 16px !important;
                cursor: pointer !important;
                transition: all 0.2s ease !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
                user-select: none !important;
            }
            .tx-ob-plan-active {
                background-color: #08172c !important;
                border: 2px solid #22d3ee !important;
                box-shadow: 0 0 24px rgba(34, 211, 238, 0.15) !important;
            }
            .tx-ob-plan-inactive {
                background-color: #090e1a !important;
                border: 1px solid rgba(255, 255, 255, 0.08) !important;
            }
            .tx-ob-plan-inactive:hover {
                border-color: rgba(255, 255, 255, 0.18) !important;
            }
            .tx-ob-card-table {
                background-color: #050914 !important;
                border: 1px solid rgba(255, 255, 255, 0.06) !important;
                border-radius: 12px !important;
                padding: 10px !important;
                margin-top: 12px !important;
                font-size: 10px !important;
            }
            .tx-ob-input {
                width: 100% !important;
                background-color: #070c18 !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                border-radius: 12px !important;
                padding: 10px 14px !important;
                font-size: 13px !important;
                font-weight: 600 !important;
                color: #ffffff !important;
                outline: none !important;
                transition: border-color 0.15s ease !important;
            }
            .tx-ob-input:focus {
                border-color: #22d3ee !important;
                box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.15) !important;
            }
        `;
        document.head.appendChild(style);
    }

    function root() {
        let el = document.getElementById("txTradingOnboardingRoot");
        if (!el) {
            el = document.createElement("div");
            el.id = "txTradingOnboardingRoot";
            document.body.appendChild(el);
        }
        return el;
    }

    function setUserCache(profile) {
        if (!profile || typeof getAuthUser !== "function") return;
        const current = getAuthUser() || {};
        const updated = {
            ...current,
            selected_platform: profile.selected_platform || "",
            selected_platform_name: profile.selected_platform_name || "",
            preferred_plan: profile.preferred_plan || "",
            active_plan: profile.active_plan || "",
            active_spread_pips: profile.active_spread_pips || 0,
            active_spread_type: profile.active_spread_type || "fixed",
            active_spread_value: profile.active_spread_value || 0,
            plan_funding_required: !!profile.funding_required,
            onboarding_complete: true,
        };
        localStorage.setItem(USER_KEY, JSON.stringify(updated));
    }

    function hide() {
        const el = root();
        el.innerHTML = "";
    }

    function renderModal() {
        injectStyles();
        const data = state.data || {};
        const plans = data.plans || [];
        const isDemo = state.accountMode === "demo";
        const isMT5 = state.selectedPlatform === "mt5";

        // Extract plan live values
        const basicObj = plans.find(p => p.key === "basic") || { minimum_balance: 0, spread_value: 18 };
        const stdObj = plans.find(p => p.key === "standard") || { minimum_balance: 2000, spread_value: 12 };
        const advObj = plans.find(p => p.key === "advanced") || { minimum_balance: 5000, spread_value: 5 };

        root().innerHTML = `
            <div class="tx-ob-overlay" role="dialog" aria-modal="true" aria-label="Create trading account">
                <div class="tx-ob-card">
                    
                    <!-- Header -->
                    <div class="tx-ob-header">
                        <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-400/25 flex items-center justify-center text-cyan-400 shrink-0">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                            </div>
                            <div>
                                <h3 class="text-base sm:text-lg font-bold text-white tracking-tight">Create new account</h3>
                                <p class="text-xs text-slate-400">Set up your trading account in just a few steps.</p>
                            </div>
                        </div>
                        <button type="button" id="txObClose" class="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0 border border-slate-700/60" title="Close">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="tx-ob-body custom-scrollbar">
                        
                        <!-- 1. Real / Demo Selector -->
                        <div>
                            <div class="flex items-center gap-1.5 text-xs font-bold text-slate-300 mb-2">
                                <span>1. Select a trading platform</span>
                                <span class="text-slate-500 hover:text-slate-300 cursor-help text-xs" title="Real accounts trade with actual funds. Demo accounts provide $10,000 USD virtual balance.">ⓘ</span>
                            </div>
                            <div class="inline-flex p-1 rounded-xl bg-[#060a14] border border-slate-800">
                                <button type="button" id="txObModeReal" class="px-7 py-2 rounded-lg text-xs font-black transition cursor-pointer ${!isDemo ? 'bg-gradient-to-r from-cyan-400 to-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20' : 'text-slate-400 hover:text-white'}">
                                    Real
                                </button>
                                <button type="button" id="txObModeDemo" class="px-7 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${isDemo ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 font-black' : 'text-slate-400 hover:text-white'}">
                                    Demo
                                </button>
                            </div>
                        </div>

                        <!-- 2. Platform Selector (Real Mode) -->
                        <div id="txObPlatformSection" class="${isDemo ? 'hidden' : ''}">
                            <div class="text-xs font-bold text-slate-300 mb-2">
                                2. Select platform
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <!-- TraidiumX 2.0 Card -->
                                <div id="txObPlatPx" class="relative rounded-2xl p-4 transition cursor-pointer flex items-center justify-between ${!isMT5 ? 'border-2 border-cyan-400 bg-[#081526] shadow-[0_0_20px_rgba(34,211,238,0.12)]' : 'border border-slate-800 bg-[#090e1a] opacity-80 hover:opacity-100'}">
                                    <div class="flex items-center gap-3.5 min-w-0 pr-2">
                                        <div class="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-400 shrink-0">
                                            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                                        </div>
                                        <div class="min-w-0">
                                            <div class="flex items-center gap-2">
                                                <span class="font-black text-white text-sm">TraidiumX 2.0</span>
                                                <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Active</span>
                                            </div>
                                            <p class="text-[11px] text-slate-400 mt-0.5 leading-snug">Trade crypto futures and options with advanced tools, low fees and high performance.</p>
                                        </div>
                                    </div>
                                    <div class="w-5 h-5 rounded-full ${!isMT5 ? 'border-2 border-cyan-400 bg-cyan-400 flex items-center justify-center text-slate-950' : 'border border-slate-600 bg-transparent'} shrink-0">
                                        ${!isMT5 ? '<svg class="w-3 h-3 text-slate-950" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>' : ''}
                                    </div>
                                </div>

                                <!-- MetaTrader 5 Card -->
                                <div id="txObPlatMt5" class="relative rounded-2xl p-4 transition cursor-pointer flex items-center justify-between ${isMT5 ? 'border-2 border-cyan-400 bg-[#081526] shadow-[0_0_20px_rgba(34,211,238,0.12)]' : 'border border-slate-800 bg-[#090e1a] opacity-80 hover:opacity-100'}">
                                    <div class="flex items-center gap-3.5 min-w-0 pr-2">
                                        <div class="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400 shrink-0">
                                            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="3"></circle><circle cx="6" cy="17" r="3"></circle><circle cx="18" cy="17" r="3"></circle><path d="M10 9l-2.5 5.5M14 9l2.5 5.5M9 17h6"></path></svg>
                                        </div>
                                        <div class="min-w-0">
                                            <div class="flex items-center gap-2">
                                                <span class="font-bold text-slate-300 text-sm">MetaTrader 5</span>
                                                <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700">MT5</span>
                                            </div>
                                            <p class="text-[11px] text-slate-400 mt-0.5 leading-snug">Trade CFDs and Forex on MetaTrader 5</p>
                                        </div>
                                    </div>
                                    <div class="w-5 h-5 rounded-full ${isMT5 ? 'border-2 border-cyan-400 bg-cyan-400 flex items-center justify-center text-slate-950' : 'border border-slate-600 bg-transparent'} shrink-0">
                                        ${isMT5 ? '<svg class="w-3 h-3 text-slate-950" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>' : ''}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Account Name -->
                        <div>
                            <label class="block text-xs font-bold text-slate-300 mb-1.5">Account Name</label>
                            <input id="txObAccountNameInput" type="text" value="${isDemo ? 'Demo Account' : 'Main Trading Account'}" placeholder="Account Name (e.g. Scalping Strategy, Trading Sub 1)" class="tx-ob-input" />
                        </div>

                        <!-- 3. Plan Selection (Real Mode) -->
                        <div id="txObRealPlanSection" class="${isDemo ? 'hidden' : ''} space-y-2.5">
                            <div class="text-xs font-bold text-slate-300 mb-2">
                                3. Select account type
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                                
                                <!-- Basic Plan -->
                                <div data-ob-plan="basic" class="tx-ob-plan-card ${state.selectedPlan === 'basic' ? 'tx-ob-plan-active' : 'tx-ob-plan-inactive'}">
                                    <div class="space-y-3">
                                        <div class="flex items-start justify-between gap-2">
                                            <div class="flex items-center gap-2.5 min-w-0">
                                                <div class="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                                                </div>
                                                <h4 class="text-sm font-black text-white">Basic</h4>
                                            </div>
                                            <div class="w-4 h-4 rounded-full ${state.selectedPlan === 'basic' ? 'border-2 border-cyan-400 bg-cyan-400 flex items-center justify-center p-0.5' : 'border border-slate-600 bg-transparent'} shrink-0">
                                                ${state.selectedPlan === 'basic' ? '<div class="w-1.5 h-1.5 rounded-full bg-slate-950"></div>' : ''}
                                            </div>
                                        </div>
                                        <p class="text-[11px] leading-tight text-slate-400">Standard trading conditions ideal for beginners and casual traders.</p>
                                        
                                        <!-- Key Metrics Box (Real Live Data) -->
                                        <div class="rounded-xl bg-[#050914] border border-slate-800/80 p-2.5 space-y-1.5 text-[11px]">
                                            <div class="flex items-center justify-between text-slate-300">
                                                <span class="text-slate-400 font-medium">Crypto Spread</span>
                                                <span class="font-bold text-emerald-400">${basicObj.spread_type === 'percentage' ? `${basicObj.spread_value}% Spread` : `Fixed ${basicObj.spread_value || 18} USDT`}</span>
                                            </div>
                                            <div class="flex items-center justify-between text-slate-300 pt-1.5 border-t border-slate-800/60">
                                                <span class="text-slate-400 font-medium">Max Leverage</span>
                                                <span class="font-bold text-white">Up to 1:1000</span>
                                            </div>
                                        </div>

                                        <!-- Features list -->
                                        <div class="space-y-1 text-[10.5px] text-slate-300 pt-1">
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-emerald-400 font-bold">✔</span> Cross &amp; Isolated margin</div>
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-emerald-400 font-bold">✔</span> Customizable leverage</div>
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-emerald-400 font-bold">✔</span> Trailing &amp; Stop Loss orders</div>
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-emerald-400 font-bold">✔</span> 24/7 Market access</div>
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-emerald-400 font-bold">✔</span> Standard support</div>
                                        </div>
                                    </div>

                                    <div class="mt-4 pt-3 border-t border-white/5">
                                        <div class="w-full py-1.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-black text-center tracking-wide">
                                            ${Number(basicObj.minimum_balance || 0) === 0 ? 'MIN $0.00' : `MIN $${money(basicObj.minimum_balance)}`}
                                        </div>
                                    </div>
                                </div>

                                <!-- Standard Plan -->
                                <div data-ob-plan="standard" class="tx-ob-plan-card ${state.selectedPlan === 'standard' ? 'tx-ob-plan-active' : 'tx-ob-plan-inactive'}">
                                    <div class="space-y-3">
                                        <div class="flex items-start justify-between gap-2">
                                            <div class="flex items-center gap-2.5 min-w-0">
                                                <div class="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 3h12l4 6-10 12L2 9l4-6z"/></svg>
                                                </div>
                                                <div class="min-w-0">
                                                    <div class="flex items-center gap-1.5">
                                                        <h4 class="text-sm font-black text-white">Standard</h4>
                                                        <span class="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">Popular</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="w-4 h-4 rounded-full ${state.selectedPlan === 'standard' ? 'border-2 border-cyan-400 bg-cyan-400 flex items-center justify-center p-0.5' : 'border border-slate-600 bg-transparent'} shrink-0">
                                                ${state.selectedPlan === 'standard' ? '<div class="w-1.5 h-1.5 rounded-full bg-slate-950"></div>' : ''}
                                            </div>
                                        </div>
                                        <p class="text-[11px] leading-tight text-slate-400">Optimized tighter spreads and enhanced execution for active traders.</p>
                                        
                                        <!-- Key Metrics Box (Real Live Data) -->
                                        <div class="rounded-xl bg-[#050914] border border-slate-800/80 p-2.5 space-y-1.5 text-[11px]">
                                            <div class="flex items-center justify-between text-slate-300">
                                                <span class="text-slate-400 font-medium">Crypto Spread</span>
                                                <span class="font-bold text-blue-400">${stdObj.spread_type === 'percentage' ? `${stdObj.spread_value}% Spread` : `Fixed ${stdObj.spread_value || 12} USDT`}</span>
                                            </div>
                                            <div class="flex items-center justify-between text-slate-300 pt-1.5 border-t border-slate-800/60">
                                                <span class="text-slate-400 font-medium">Max Leverage</span>
                                                <span class="font-bold text-white">Up to 1:1000</span>
                                            </div>
                                        </div>

                                        <!-- Features list -->
                                        <div class="space-y-1 text-[10.5px] text-slate-300 pt-1">
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-blue-400 font-bold">✔</span> Cross &amp; Isolated margin</div>
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-blue-400 font-bold">✔</span> Tighter spreads for lower cost</div>
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-blue-400 font-bold">✔</span> Trailing &amp; Stop Loss orders</div>
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-blue-400 font-bold">✔</span> Advanced TradingView charts</div>
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-blue-400 font-bold">✔</span> Priority order execution</div>
                                        </div>
                                    </div>

                                    <div class="mt-4 pt-3 border-t border-white/5">
                                        <div class="w-full py-1.5 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/40 text-xs font-black text-center tracking-wide">
                                            MIN $${money(stdObj.minimum_balance || 2000)}
                                        </div>
                                    </div>
                                </div>

                                <!-- Advanced Plan -->
                                <div data-ob-plan="advanced" class="tx-ob-plan-card ${state.selectedPlan === 'advanced' ? 'tx-ob-plan-active' : 'tx-ob-plan-inactive'}">
                                    <div class="space-y-3">
                                        <div class="flex items-start justify-between gap-2">
                                            <div class="flex items-center gap-2.5 min-w-0">
                                                <div class="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 18h18M4 14l3-8 5 5 5-5 3 8H4z"/></svg>
                                                </div>
                                                <div class="min-w-0">
                                                    <div class="flex items-center gap-1.5">
                                                        <h4 class="text-sm font-black text-white">Advanced</h4>
                                                        <span class="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">VIP Pro</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="w-4 h-4 rounded-full ${state.selectedPlan === 'advanced' ? 'border-2 border-cyan-400 bg-cyan-400 flex items-center justify-center p-0.5' : 'border border-slate-600 bg-transparent'} shrink-0">
                                                ${state.selectedPlan === 'advanced' ? '<div class="w-1.5 h-1.5 rounded-full bg-slate-950"></div>' : ''}
                                            </div>
                                        </div>
                                        <p class="text-[11px] leading-tight text-slate-400">Institutional VIP conditions with lowest spreads for high-volume traders.</p>
                                        
                                        <!-- Key Metrics Box (Real Live Data) -->
                                        <div class="rounded-xl bg-[#050914] border border-slate-800/80 p-2.5 space-y-1.5 text-[11px]">
                                            <div class="flex items-center justify-between text-slate-300">
                                                <span class="text-slate-400 font-medium">Crypto Spread</span>
                                                <span class="font-bold text-purple-400">${advObj.spread_type === 'percentage' ? `${advObj.spread_value}% Spread` : `Fixed ${advObj.spread_value || 5} USDT`}</span>
                                            </div>
                                            <div class="flex items-center justify-between text-slate-300 pt-1.5 border-t border-slate-800/60">
                                                <span class="text-slate-400 font-medium">Max Leverage</span>
                                                <span class="font-bold text-white">Up to 1:1000</span>
                                            </div>
                                        </div>

                                        <!-- Features list -->
                                        <div class="space-y-1 text-[10.5px] text-slate-300 pt-1">
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-purple-400 font-bold">✔</span> Cross &amp; Isolated margin</div>
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-purple-400 font-bold">✔</span> Lowest VIP institutional spreads</div>
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-purple-400 font-bold">✔</span> Trailing &amp; Stop Loss orders</div>
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-purple-400 font-bold">✔</span> Dedicated VIP account manager</div>
                                            <div class="flex items-center gap-1.5 text-slate-300"><span class="text-purple-400 font-bold">✔</span> 24/7 Priority VIP support</div>
                                        </div>
                                    </div>

                                    <div class="mt-4 pt-3 border-t border-white/5">
                                        <div class="w-full py-1.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs font-black text-center tracking-wide">
                                            MIN $${money(advObj.minimum_balance || 5000)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Demo Mode Details (when Demo is selected) -->
                        <div id="txObDemoSection" class="${isDemo ? '' : 'hidden'} space-y-3">
                            <div class="rounded-2xl border border-amber-500/30 bg-[#090e1a] p-5 space-y-2">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                                        <h4 class="text-sm font-bold text-white">TraidiumX 2.0 Demo</h4>
                                    </div>
                                    <span class="px-2.5 py-0.5 rounded text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">$10,000 USD</span>
                                </div>
                                <p class="text-xs text-slate-300 leading-relaxed">
                                    Practice risk-free with <strong>$10,000 USDT virtual funds</strong>. Access real-time price feeds, order books, and full charting features with zero financial risk.
                                </p>
                            </div>
                        </div>

                        <!-- Feedback Message -->
                        <div id="txObMessage" class="hidden text-xs font-bold p-3 rounded-xl border"></div>

                    </div>

                    <!-- Footer -->
                    <div class="tx-ob-footer">
                        <div class="flex items-center gap-2 text-xs text-slate-400 text-center sm:text-left">
                            <svg class="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                            <span>For detailed trading fees and conditions, please refer to our <a href="./fee-structure.html" class="text-cyan-400 hover:underline">Fee Schedule</a>.</span>
                        </div>
                        <div class="flex items-center gap-3 w-full sm:w-auto justify-end">
                            <button id="txObBottomClose" type="button" class="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer">Close</button>
                            <button id="txObSubmitBtn" type="button" class="flex-1 sm:flex-initial px-7 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-300 hover:to-cyan-400 text-xs sm:text-sm font-black text-slate-950 transition cursor-pointer shadow-lg shadow-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5">
                                <span>Create account</span>
                                <span>›</span>
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        `;

        bindEvents();
    }

    function bindEvents() {
        // Close buttons
        document.getElementById("txObClose")?.addEventListener("click", hide);
        document.getElementById("txObBottomClose")?.addEventListener("click", hide);

        // Real / Demo Toggles
        document.getElementById("txObModeReal")?.addEventListener("click", () => {
            state.accountMode = "real";
            renderModal();
        });
        document.getElementById("txObModeDemo")?.addEventListener("click", () => {
            state.accountMode = "demo";
            renderModal();
        });

        // Platform Cards
        document.getElementById("txObPlatPx")?.addEventListener("click", () => {
            state.selectedPlatform = "traidiumx";
            renderModal();
        });
        document.getElementById("txObPlatMt5")?.addEventListener("click", () => {
            state.selectedPlatform = "mt5";
            renderModal();
        });

        // Plan Cards
        document.querySelectorAll("[data-ob-plan]").forEach(card => {
            card.addEventListener("click", () => {
                state.selectedPlan = card.getAttribute("data-ob-plan") || "basic";
                renderModal();
            });
        });

        // Submit Button
        const submitBtn = document.getElementById("txObSubmitBtn");
        submitBtn?.addEventListener("click", async () => {
            const isDemo = state.accountMode === "demo";
            const nameInput = document.getElementById("txObAccountNameInput");
            const nameVal = (nameInput?.value || "").trim() || (isDemo ? "Demo Account" : "Main Trading Account");
            const msgEl = document.getElementById("txObMessage");

            if (msgEl) {
                msgEl.className = "text-xs font-bold p-3 rounded-xl border text-slate-300 border-slate-800 bg-slate-900/60 block";
                msgEl.textContent = "Setting up your account...";
            }
            if (submitBtn) submitBtn.disabled = true;

            try {
                if (isDemo) {
                    // Complete onboarding plan with default basic in background
                    await apiRequest("/onboarding/plan", { method: "POST", body: JSON.stringify({ plan: "basic" }) }).catch(() => {});
                    
                    // Create Demo Sub-Account pre-funded with 10,000 USDT
                    const demoResp = await apiRequest("/user/sub-accounts", {
                        method: "POST",
                        body: JSON.stringify({
                            name: nameVal,
                            account_mode: "demo",
                            plan: "demo",
                            platform: state.selectedPlatform,
                            is_demo: true
                        })
                    });
                    
                    if (demoResp.data && demoResp.data.id) {
                        localStorage.setItem("traidiumx_active_user_id", demoResp.data.id);
                        localStorage.setItem("traidiumx_active_user_name", demoResp.data.name || "Demo Account");
                    }
                    hide();
                    window.location.href = resolveAppPath("src/pages/futures.html");
                    return;
                }

                // Real Account Onboarding
                await apiRequest("/onboarding/platform", { method: "POST", body: JSON.stringify({ platform: state.selectedPlatform }) });
                const planResp = await apiRequest("/onboarding/plan", { method: "POST", body: JSON.stringify({ plan: state.selectedPlan }) });
                
                // Create sub-account record
                await apiRequest("/user/sub-accounts", {
                    method: "POST",
                    body: JSON.stringify({
                        name: nameVal,
                        account_mode: "real",
                        plan: state.selectedPlan,
                        platform: state.selectedPlatform,
                        is_demo: false
                    })
                }).catch(() => {});

                state.data = planResp.data || state.data;
                setUserCache(state.data);
                window.dispatchEvent(new CustomEvent("traidiumx:notifications-sync"));

                if (state.selectedPlatform === "mt5") {
                    root().innerHTML = `
                        <div class="tx-ob-overlay" role="dialog" aria-modal="true" aria-label="Trading account setup">
                            <div class="tx-ob-card" style="max-width: 500px; text-align: center; padding: 32px; border: 1px solid rgba(34,211,238,0.2); background: #0f172a; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                                <div style="display: inline-flex; height: 64px; width: 64px; align-items: center; justify-content: center; border-radius: 9999px; background: rgba(34,211,238,0.1); color: #22d3ee; margin-bottom: 24px;">
                                    <svg style="height: 32px; width: 32px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                </div>
                                <h2 class="text-xl font-black text-white mb-3 text-center">MetaTrader 5 account requested</h2>
                                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 20px; text-align: left; margin-bottom: 24px;">
                                    <p style="color: #cbd5e1; font-size: 13px; line-height: 1.6; margin-bottom: 10px;">
                                        Your <strong style="color: #fff;">MetaTrader 5 ID</strong> and <strong style="color: #fff;">password</strong> will be sent to your registered email.
                                    </p>
                                    <p style="color: #94a3b8; font-size: 12px; line-height: 1.6; margin-bottom: 0;">
                                        Use that ID and password to log in to MetaTrader 5 and start trading.
                                    </p>
                                </div>
                                <button type="button" class="w-full py-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-sm transition cursor-pointer" id="txObGotIt">Got it</button>
                            </div>
                        </div>`;
                    
                    document.getElementById("txObGotIt")?.addEventListener("click", () => {
                        hide();
                        window.location.href = resolveAppPath("src/pages/trading-account.html");
                    });
                } else {
                    hide();
                    window.location.href = resolveAppPath("src/pages/futures.html");
                }
            } catch (err) {
                if (msgEl) {
                    msgEl.className = "text-xs font-bold p-3 rounded-xl border text-red-300 border-red-500/30 bg-red-500/10 block";
                    msgEl.textContent = err?.message || "Failed to complete account setup.";
                }
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    async function loadStatus(forceOpen = false) {
        if (typeof isLoggedIn !== "function" || !isLoggedIn() || typeof apiRequest !== "function") return;
        try {
            const response = await apiRequest("/onboarding/status");
            state.data = response.data || {};
            state.selectedPlatform = state.data.selected_platform || "traidiumx";
            state.selectedPlan = state.data.preferred_plan || "basic";

            if (forceOpen || !state.data.onboarding_complete) {
                // Fetch dynamic live plans from backend
                const configResp = await apiRequest("/onboarding/config").catch(() => null);
                if (configResp?.data?.settings?.plans) {
                    const pObj = configResp.data.settings.plans;
                    state.data.plans = [
                        pObj.basic || { key: "basic", name: "Basic", minimum_balance: 0, spread_value: 18 },
                        pObj.standard || { key: "standard", name: "Standard", minimum_balance: 2000, spread_value: 12 },
                        pObj.advanced || { key: "advanced", name: "Advanced", minimum_balance: 5000, spread_value: 5 },
                    ];
                }
                renderModal();
            } else {
                hide();
            }
        } catch (error) {
            console.warn("Trading onboarding status unavailable:", error);
        }
    }

    window.openTradingAccountSetup = (startFromBeginning = false) => loadStatus(true);

    function start() {
        if (typeof isLoggedIn === "function" && isLoggedIn()) loadStatus(false);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
})();

"use strict";

(function () {
    if (window.__txTradingOnboardingLoaded) return;
    window.__txTradingOnboardingLoaded = true;

    const state = {
        data: null,
        selectedPlatform: "",
        selectedPlan: "",
        loading: false,
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
            .tx-ob-overlay{position:fixed;inset:0;z-index:999998;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(2,6,23,.82);backdrop-filter:blur(16px)}
            .tx-ob-overlay.hidden{display:none!important}
            .tx-ob-card{width:min(760px,100%);max-height:min(90vh,820px);overflow:auto;border:1px solid rgba(34,211,238,.24);border-radius:28px;background:radial-gradient(circle at 90% 0,rgba(124,58,237,.2),transparent 33%),linear-gradient(160deg,#111827,#060b16 58%,#020617);box-shadow:0 34px 110px rgba(0,0,0,.68);color:#e5e7eb;padding:26px;scrollbar-width:none}
            .tx-ob-card::-webkit-scrollbar{display:none}
            .tx-ob-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:22px}
            .tx-ob-kicker{color:#67e8f9;font-size:10px;font-weight:950;letter-spacing:.2em;text-transform:uppercase}
            .tx-ob-title{margin:7px 0 0;color:#fff;font-size:clamp(24px,4vw,36px);font-weight:950;line-height:1.08;letter-spacing:-.04em}
            .tx-ob-sub{margin:10px 0 0;max-width:620px;color:#94a3b8;font-size:13px;font-weight:700;line-height:1.6}
            .tx-ob-progress{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 20px}
            .tx-ob-step{border:1px solid rgba(71,85,105,.55);border-radius:14px;background:rgba(15,23,42,.62);padding:10px 11px;color:#64748b;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}
            .tx-ob-step.active{border-color:rgba(34,211,238,.48);background:rgba(8,47,73,.58);color:#a5f3fc}.tx-ob-step.done{border-color:rgba(52,211,153,.4);background:rgba(6,78,59,.35);color:#86efac}
            .tx-ob-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}
            .tx-ob-choice{position:relative;display:block;width:100%;min-height:132px;border:1px solid rgba(71,85,105,.7);border-radius:20px;background:rgba(15,23,42,.72);padding:18px;text-align:left;color:#e5e7eb;cursor:pointer;transition:.16s ease}
            .tx-ob-choice:hover{transform:translateY(-2px);border-color:rgba(34,211,238,.48)}
            .tx-ob-choice.selected{border-color:#8b5cf6;background:linear-gradient(145deg,rgba(76,29,149,.48),rgba(15,23,42,.9));box-shadow:0 18px 46px rgba(76,29,149,.22)}
            .tx-ob-choice:disabled{opacity:.42;cursor:not-allowed;transform:none}
            .tx-ob-choice-icon{display:inline-flex;width:42px;height:42px;align-items:center;justify-content:center;border-radius:14px;background:rgba(34,211,238,.1);color:#67e8f9;font-size:18px;font-weight:950}
            .tx-ob-choice h3{margin:13px 0 5px;color:#fff;font-size:17px;font-weight:950}.tx-ob-choice p{margin:0;color:#94a3b8;font-size:12px;font-weight:700;line-height:1.5}
            .tx-ob-plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
            .tx-ob-plan{border:1px solid rgba(71,85,105,.65);border-radius:20px;background:rgba(15,23,42,.72);padding:17px;cursor:pointer;text-align:left;color:#e5e7eb;transition:.16s ease}
            .tx-ob-plan:hover{transform:translateY(-2px);border-color:rgba(34,211,238,.46)}.tx-ob-plan.selected{border-color:#22d3ee;background:rgba(8,47,73,.5);box-shadow:0 16px 42px rgba(34,211,238,.13)}
            .tx-ob-plan-name{font-size:17px;font-weight:950;color:#fff}.tx-ob-plan-pips{margin-top:9px;color:#67e8f9;font-size:25px;font-weight:950}.tx-ob-plan-min{margin-top:8px;color:#94a3b8;font-size:11px;font-weight:800;line-height:1.45}
            .tx-ob-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tx-ob-box{border:1px solid rgba(71,85,105,.58);border-radius:18px;background:rgba(15,23,42,.62);padding:15px}.tx-ob-box span{display:block;color:#64748b;font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.1em}.tx-ob-box strong{display:block;margin-top:7px;color:#fff;font-size:16px;font-weight:950}
            .tx-ob-notice{margin-top:15px;border:1px solid rgba(251,191,36,.26);border-radius:17px;background:rgba(120,53,15,.18);padding:13px 14px;color:#fde68a;font-size:12px;font-weight:800;line-height:1.55}.tx-ob-notice.success{border-color:rgba(52,211,153,.28);background:rgba(6,78,59,.25);color:#bbf7d0}.tx-ob-notice.error{border-color:rgba(248,113,113,.28);background:rgba(127,29,29,.22);color:#fecaca}
            .tx-ob-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}.tx-ob-btn{border:1px solid rgba(71,85,105,.75);border-radius:15px;background:rgba(15,23,42,.85);color:#cbd5e1;padding:12px 18px;font-size:12px;font-weight:950;cursor:pointer}.tx-ob-btn.primary{border:0;background:linear-gradient(135deg,#22d3ee,#8b5cf6);color:#020617}.tx-ob-btn.success{border:0;background:linear-gradient(135deg,#34d399,#22d3ee);color:#020617}.tx-ob-btn:disabled{opacity:.5;cursor:not-allowed}
            .tx-ob-form{display:grid;gap:12px;margin-top:14px}.tx-ob-form input{width:100%;border:1px solid rgba(71,85,105,.7);border-radius:14px;background:#020617;color:#fff;padding:12px 13px;font-size:13px;font-weight:750;outline:none}.tx-ob-form input:focus{border-color:#22d3ee;box-shadow:0 0 0 3px rgba(34,211,238,.1)}
            @media(max-width:680px){.tx-ob-card{padding:20px;border-radius:22px}.tx-ob-grid,.tx-ob-plans,.tx-ob-summary{grid-template-columns:1fr}.tx-ob-progress{grid-template-columns:1fr}.tx-ob-actions{flex-direction:column-reverse}.tx-ob-btn{width:100%}}
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
        };
        localStorage.setItem(USER_KEY, JSON.stringify(updated));
    }

    function formatSpread(value, type) {
        const val = Number(value || 0);
        const formatted = val.toFixed(val % 1 ? 2 : 0);
        return type === "percentage" ? `${formatted}%` : `${formatted} USDT`;
    }

    async function acknowledgeWarning() {
        if (state.loading) return;
        state.loading = true;
        try {
            const response = await apiRequest("/onboarding/warning/acknowledge", { method: "POST", body: "{}" });
            state.data = response.data || {};
            setUserCache(state.data);
            hide();
            loadStatus(false);
        } catch (error) {
            console.error("Failed to acknowledge warning:", error);
            hide();
        } finally {
            state.loading = false;
        }
    }

    function renderDowngradeWarning() {
        injectStyles();
        const el = root();
        const data = state.data || {};
        const warningsCount = data.downgrade_warnings || 0;
        const remaining = 3 - warningsCount;
        
        el.innerHTML = `
            <div class="tx-ob-overlay">
                <div class="tx-ob-card" style="max-width:540px;border-color:rgba(239, 68, 68, 0.35);background:radial-gradient(circle at 90% 0,rgba(239,68,68,.12),transparent 33%),linear-gradient(160deg,#111827,#060b16 58%,#020617);box-shadow:0 34px 100px rgba(0,0,0,0.6);">
                    <div class="tx-ob-head" style="margin-bottom:12px">
                        <div>
                            <span class="tx-ob-kicker" style="color:#f87171">Balance Warning</span>
                            <h2 class="tx-ob-title" style="font-size:24px;line-height:1.2">Low Balance Violation</h2>
                        </div>
                    </div>
                    <p style="margin:10px 0;color:#cbd5e1;font-size:14px;line-height:1.6">
                        Your trading balance of <strong style="color:#f87171">${money(data.trading_balance)} USDT</strong> is below the minimum required for the <strong style="color:#fff">${esc(data.preferred_plan_name || "Preferred Plan")}</strong> plan (<strong style="color:#67e8f9">${money(data.preferred_minimum_balance || data.minimum_balance)} USDT</strong>).
                    </p>
                    <p style="margin:10px 0;color:#94a3b8;font-size:12px;line-height:1.5">
                        Please deposit or transfer funds to maintain your plan level. If you dismiss this warning <strong>3 times</strong>, your account will be automatically downgraded to the highest eligible lower plan.
                    </p>
                    
                    <div style="margin:16px 0;padding:12px 14px;border-radius:14px;border:1px solid rgba(251, 191, 36, 0.25);background:rgba(251, 191, 36, 0.08);color:#fbbf24;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:0.06em;display:flex;justify-content:space-between;align-items:center;">
                        <span>Warnings remaining:</span>
                        <span style="font-size:15px;color:#fff">${remaining} of 3</span>
                    </div>
                    
                    <div class="tx-ob-actions" style="margin-top:20px;gap:8px">
                        <button type="button" class="tx-ob-btn" id="txObAcknowledgeWarning" style="border-color:rgba(148,163,184,0.3);background:rgba(148,163,184,0.06);color:#e2e8f0">Dismiss Warning</button>
                        <a href="./wallet.html#deposit" class="tx-ob-btn primary" id="txObDepositNow" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;font-weight:950">Deposit Now</a>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById("txObAcknowledgeWarning")?.addEventListener("click", acknowledgeWarning);
        document.getElementById("txObDepositNow")?.addEventListener("click", (event) => {
            apiRequest("/onboarding/warning/acknowledge", { method: "POST", body: "{}" })
                .catch(() => {});
            
            if (window.location.pathname.includes("wallet.html") && typeof openWalletActionModal === "function") {
                event.preventDefault();
                hide();
                openWalletActionModal("deposit");
            }
        });
    }

    async function loadStatus(forceOpen = false) {
        if (typeof isLoggedIn !== "function" || !isLoggedIn() || typeof apiRequest !== "function") return;
        try {
            const response = await apiRequest("/onboarding/status");
            state.data = response.data || {};
            state.selectedPlatform = state.data.selected_platform || "";
            state.selectedPlan = state.data.preferred_plan || "";
            setUserCache(state.data);
            if (forceOpen || !state.data.onboarding_complete) render();
            else if (state.data.show_downgrade_warning) renderDowngradeWarning();
            else hide();
        } catch (error) {
            console.warn("Trading onboarding status unavailable:", error);
        }
    }

    function hide() {
        const el = root();
        el.innerHTML = "";
    }

    function stepNumber() {
        if (!state.selectedPlatform) return 1;
        if (!state.selectedPlan) return 2;
        return 3;
    }

    function progress(step) {
        return `
            <div class="tx-ob-progress">
                <div class="tx-ob-step ${step === 1 ? "active" : "done"}">1. Choose platform</div>
                <div class="tx-ob-step ${step === 2 ? "active" : step > 2 ? "done" : ""}">2. Choose plan</div>
                <div class="tx-ob-step ${step === 3 ? "active" : ""}">3. Fund & activate</div>
            </div>`;
    }

    function render() {
        injectStyles();
        const step = stepNumber();
        const data = state.data || {};
        root().innerHTML = `
            <div class="tx-ob-overlay" role="dialog" aria-modal="true" aria-label="Trading account setup">
                <div class="tx-ob-card">
                    <div class="tx-ob-head">
                        <div>
                            <div class="tx-ob-kicker">Trading account setup</div>
                            <h2 class="tx-ob-title">${step === 1 ? "Choose your platform" : step === 2 ? "Choose your account plan" : "Activate your trading account"}</h2>
                            <p class="tx-ob-sub">Deposit and trading do not require KYC. KYC is checked only when you submit a withdrawal request.</p>
                        </div>
                    </div>
                    ${progress(step)}
                    <div id="txObBody">${step === 1 ? platformHtml(data) : step === 2 ? plansHtml(data) : activationHtml(data)}</div>
                    <div id="txObMessage"></div>
                    ${actionsHtml(step)}
                </div>
            </div>`;
        bind(step);
    }

    function platformHtml(data) {
        const platforms = data.platforms || {};
        const tx = platforms.traidiumx || { enabled: true };
        const mt5 = platforms.mt5 || { enabled: true };
        return `<div class="tx-ob-grid">
            <button type="button" class="tx-ob-choice ${state.selectedPlatform === "traidiumx" ? "selected" : ""}" data-platform="traidiumx" ${tx.enabled === false ? "disabled" : ""}>
                <span class="tx-ob-choice-icon">TX</span><h3>TraidiumX</h3><p>Use the current TraidiumX Futures and Options platform with internal wallet settlement.</p>
            </button>
            <button type="button" class="tx-ob-choice ${state.selectedPlatform === "mt5" ? "selected" : ""}" data-platform="mt5" ${mt5.enabled === false ? "disabled" : ""}>
                <span class="tx-ob-choice-icon">5</span><h3>MetaTrader 5</h3><p>Create or connect an MT5 broker account. New Login ID creation requires broker/white-label API access.</p>
            </button>
        </div>`;
    }

    function plansHtml(data) {
        const plans = Array.isArray(data.plans) ? data.plans : [];
        return `<div class="tx-ob-plans">${plans.map((plan) => `
            <button type="button" class="tx-ob-plan ${state.selectedPlan === plan.key ? "selected" : ""}" data-plan="${esc(plan.key)}">
                <div class="tx-ob-plan-name">${esc(plan.name)}</div>
                <div class="tx-ob-plan-pips">${formatSpread(plan.spread_value, plan.spread_type)}</div>
                <div class="tx-ob-plan-min">Minimum trading balance<br><strong>${money(plan.minimum_balance)} USDT</strong></div>
            </button>`).join("")}</div>`;
    }

    function activationHtml(data) {
        const mt5 = data.mt5 || {};
        const account = mt5.account || null;
        const caps = mt5.capabilities || {};
        const funding = !!data.funding_required;
        const preferredEligible = data.provisioning_balance_eligible !== false;
        const selectedName = data.selected_platform_name || (state.selectedPlatform === "mt5" ? "MetaTrader 5" : "TraidiumX");
        let mt5Section = "";
        if (state.selectedPlatform === "mt5") {
            mt5Section = `
                <div class="tx-ob-notice ${account?.status === "active" ? "success" : ""}">
                    ${account ? `<strong>MT5 status: ${esc(account.status)}</strong><br>${esc(account.provisioning_note || "Account setup status loaded.")}` : `No MT5 account exists yet. ${caps.auto_provisioning_configured ? "Your broker API is ready for account creation." : "Admin must configure the MT5 broker/white-label provisioning API."}`}
                </div>
                <div class="tx-ob-actions" style="justify-content:flex-start;margin-top:14px">
                    <button type="button" class="tx-ob-btn" id="txObExistingToggle">Connect Existing MT5</button>
                    <button type="button" class="tx-ob-btn success" id="txObProvision" ${!preferredEligible ? "disabled" : ""}>${account ? "Refresh MT5 Setup" : "Create MT5 Account"}</button>
                </div>
                <form id="txObExistingForm" class="tx-ob-form" style="display:none">
                    <input name="broker_name" placeholder="Broker name" required>
                    <input name="server" placeholder="MT5 broker server" required>
                    <input name="login_id" placeholder="MT5 Login ID" required>
                    <input name="password" type="password" placeholder="MT5 trading password (sent securely to MetaApi; never stored)" required>
                    <button class="tx-ob-btn primary" type="submit">Submit Secure Connection Request</button>
                </form>`;
        }
        return `
            <div class="tx-ob-summary">
                <div class="tx-ob-box"><span>Platform</span><strong>${esc(selectedName)}</strong></div>
                <div class="tx-ob-box"><span>Preferred plan</span><strong>${esc(data.preferred_plan_name || state.selectedPlan)}</strong></div>
                <div class="tx-ob-box"><span>Active plan</span><strong>${esc(data.active_plan_name || "Basic")} · ${formatSpread(data.active_spread_value, data.active_spread_type)}</strong></div>
                <div class="tx-ob-box"><span>${state.selectedPlatform === "mt5" ? "MT5 balance" : "Trading balance"}</span><strong>${money(data.trading_balance)} USDT</strong></div>
                ${state.selectedPlatform === "mt5" ? `<div class="tx-ob-box"><span>TraidiumX Trading Wallet</span><strong>${money(data.source_trading_wallet_balance)} USDT</strong></div>` : ""}
            </div>
            <div class="tx-ob-notice ${funding ? "" : preferredEligible ? "success" : ""}">
                ${funding
                    ? `Funding required. Deposit and transfer enough funds to meet the Basic plan minimum of ${money(data.active_minimum_balance)} USDT.`
                    : preferredEligible
                        ? "Your preferred plan is active. KYC is not required for deposit or trading."
                        : `Your preferred ${esc(data.preferred_plan_name || state.selectedPlan)} plan needs ${money(data.preferred_minimum_balance || data.minimum_balance)} USDT. You can trade now on the automatically selected ${esc(data.active_plan_name || "Basic")} plan.`}
            </div>
            ${mt5Section}`;
    }

    function actionsHtml(step) {
        if (step === 1) return `<div class="tx-ob-actions"><button class="tx-ob-btn primary" id="txObNext" ${state.selectedPlatform ? "" : "disabled"}>Continue</button></div>`;
        if (step === 2) return `<div class="tx-ob-actions"><button class="tx-ob-btn" id="txObBack">Back</button><button class="tx-ob-btn primary" id="txObNext" ${state.selectedPlan ? "" : "disabled"}>Continue</button></div>`;
        const data = state.data || {};
        const needsFunding = !!data.funding_required || (state.selectedPlatform === "mt5" && data.provisioning_balance_eligible === false);
        return `<div class="tx-ob-actions"><button class="tx-ob-btn" id="txObBack">Change plan</button>${needsFunding ? `<a class="tx-ob-btn primary" href="/src/pages/wallet.html?action=deposit">Deposit / Transfer Funds</a>` : `<button class="tx-ob-btn primary" id="txObFinish">Open ${state.selectedPlatform === "mt5" ? "Trading Account" : "Futures"}</button>`}</div>`;
    }

    function message(text, type = "") {
        const el = document.getElementById("txObMessage");
        if (!el) return;
        el.innerHTML = text ? `<div class="tx-ob-notice ${type}">${esc(text)}</div>` : "";
    }

    function setLoading(loading) {
        state.loading = loading;
        document.querySelectorAll("#txTradingOnboardingRoot button").forEach((button) => {
            if (loading) {
                button.dataset.txWasDisabled = button.disabled ? "1" : "0";
                button.disabled = true;
            } else {
                button.disabled = button.dataset.txWasDisabled === "1";
                delete button.dataset.txWasDisabled;
            }
        });
    }

    function bind(step) {
        document.querySelectorAll("[data-platform]").forEach((button) => button.addEventListener("click", () => {
            state.selectedPlatform = button.dataset.platform || "";
            document.querySelectorAll("[data-platform]").forEach((item) => item.classList.toggle("selected", item === button));
            const next = document.getElementById("txObNext"); if (next) next.disabled = false;
        }));
        document.querySelectorAll("[data-plan]").forEach((button) => button.addEventListener("click", () => {
            state.selectedPlan = button.dataset.plan || "";
            document.querySelectorAll("[data-plan]").forEach((item) => item.classList.toggle("selected", item === button));
            const next = document.getElementById("txObNext"); if (next) next.disabled = false;
        }));
        document.getElementById("txObBack")?.addEventListener("click", () => {
            if (step === 2) state.selectedPlatform = "";
            if (step === 3) state.selectedPlan = "";
            render();
        });
        document.getElementById("txObNext")?.addEventListener("click", async () => {
            try {
                setLoading(true); message("");
                const endpoint = step === 1 ? "/onboarding/platform" : "/onboarding/plan";
                const body = step === 1 ? { platform: state.selectedPlatform } : { plan: state.selectedPlan };
                const response = await apiRequest(endpoint, { method: "POST", body: JSON.stringify(body) });
                state.data = response.data || state.data;
                setUserCache(state.data);
                
                if (step === 2 && state.selectedPlatform === "mt5") {
                    const plans = Array.isArray(state.data.plans) ? state.data.plans : [];
                    const selectedPlanObj = plans.find(p => p.key === state.selectedPlan) || { name: state.selectedPlan.toUpperCase() };
                    const planName = selectedPlanObj.name;
                    
                    root().innerHTML = `
                        <div class="tx-ob-overlay" role="dialog" aria-modal="true" aria-label="Trading account setup">
                            <div class="tx-ob-card" style="max-width: 500px; text-align: center; padding: 32px; border: 1px solid rgba(34,211,238,0.2); background: #0f172a; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                                <div style="display: inline-flex; height: 64px; width: 64px; align-items: center; justify-content: center; border-radius: 9999px; background: rgba(34,211,238,0.1); color: #22d3ee; margin-bottom: 24px;">
                                    <svg style="height: 32px; width: 32px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                </div>
                                <h2 class="tx-ob-title" style="font-size: 24px; font-weight: 900; color: #fff; margin-bottom: 12px; text-align: center;">MetaTrader 5 account requested</h2>
                                
                                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 20px; text-align: left; margin-bottom: 24px;">
                                    <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin-bottom: 12px;">
                                        You selected <strong style="color: #22d3ee;">${esc(planName)}</strong> (USD, Swap-free).
                                    </p>
                                    <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin-bottom: 12px;">
                                        Your <strong style="color: #fff;">MetaTrader 5 ID</strong> and <strong style="color: #fff;">password</strong> will be sent to your registered email.
                                    </p>
                                    <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin-bottom: 0;">
                                        Use that ID and password to log in to MetaTrader 5 and start trading.
                                    </p>
                                </div>
                                
                                <button type="button" class="tx-ob-btn primary" id="txObGotIt" style="width: 100%; padding: 14px; background: #22d3ee; color: #020617; border: none; border-radius: 12px; font-weight: 900; cursor: pointer; transition: 0.2s;">Got it</button>
                            </div>
                        </div>`;
                    
                    document.getElementById("txObGotIt")?.addEventListener("click", () => {
                        hide();
                        window.location.reload();
                    });
                } else {
                    render();
                }
            } catch (error) {
                message(error?.message || "Unable to save selection.", "error");
            } finally { setLoading(false); }
        });
        document.getElementById("txObFinish")?.addEventListener("click", () => {
            window.location.href = state.selectedPlatform === "mt5" ? "/src/pages/trading-account.html" : "/src/pages/futures.html";
        });
        document.getElementById("txObExistingToggle")?.addEventListener("click", () => {
            const form = document.getElementById("txObExistingForm");
            if (form) form.style.display = form.style.display === "none" ? "grid" : "none";
        });
        document.getElementById("txObProvision")?.addEventListener("click", async () => {
            try {
                setLoading(true); message("");
                const response = await apiRequest("/onboarding/mt5/provision", { method: "POST", body: "{}" });
                state.data = { ...state.data, mt5: response.data || {} };
                message(response.message || "MT5 setup updated.", response.status === 202 ? "" : "success");
                await loadStatus(true);
            } catch (error) { message(error?.message || "MT5 provisioning failed.", "error"); }
            finally { setLoading(false); }
        });
        document.getElementById("txObExistingForm")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const payload = Object.fromEntries(formData.entries());
            try {
                setLoading(true); message("");
                const response = await apiRequest("/onboarding/mt5/connect-existing", { method: "POST", body: JSON.stringify(payload) });
                event.currentTarget.reset();
                message(response.message || "MT5 connection request saved.", "success");
                await loadStatus(true);
            } catch (error) { message(error?.message || "Unable to connect MT5 account.", "error"); }
            finally { setLoading(false); }
        });
    }

    window.openTradingAccountSetup = () => loadStatus(true);

    function start() {
        if (typeof isLoggedIn === "function" && isLoggedIn()) loadStatus(false);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
})();

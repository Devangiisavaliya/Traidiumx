"use strict";

const ta = {
    data: null,
    platform: document.getElementById("taPlatform"),
    preferred: document.getElementById("taPreferredPlan"),
    active: document.getElementById("taActivePlan"),
    balance: document.getElementById("taBalance"),
    balanceLabel: document.getElementById("taBalanceLabel"),
    sourceCard: document.getElementById("taSourceCard"),
    sourceBalanceLabel: document.getElementById("taSourceBalanceLabel"),
    sourceBalance: document.getElementById("taSourceBalance"),
    plans: document.getElementById("taPlans"),
    mt5Section: document.getElementById("taMt5Section"),
    mt5Status: document.getElementById("taMt5Status"),
    mt5Login: document.getElementById("taMt5Login"),
    mt5Server: document.getElementById("taMt5Server"),
    mt5Group: document.getElementById("taMt5Group"),
    mt5Balance: document.getElementById("taMt5Balance"),
    mt5Note: document.getElementById("taMt5Note"),
    mt5FundingNote: document.getElementById("taMt5FundingNote"),
    message: document.getElementById("tradingAccountMessage"),
};

function taEsc(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char])); }
function taMoney(value) { return Number(value || 0).toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2}); }
function taShowMessage(text, type="info") { if (!ta.message) return; ta.message.className=`ta-message ${type} mb-5`; ta.message.textContent=text; ta.message.classList.toggle("hidden", !text); }
function formatSpread(value, type) {
    const val = Number(value || 0);
    const formatted = val.toFixed(val % 1 ? 2 : 0);
    return type === "percentage" ? `${formatted}%` : `${formatted} USDT`;
}

async function loadTradingAccount() {
    if (!isLoggedIn()) {
        const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
        window.location.href = `./login.html?next=${next}`;
        return;
    }
    try {
        const response = await apiRequest("/onboarding/status");
        ta.data = response.data || {};
        renderTradingAccount();
    } catch (error) { taShowMessage(error?.message || "Unable to load trading account.", "error"); }
}

function renderTradingAccount() {
    const data = ta.data || {};
    ta.platform.textContent = data.selected_platform_name || "Not selected";
    ta.preferred.textContent = data.preferred_plan_name || "Not selected";
    ta.active.textContent = data.active_plan_name ? `${data.active_plan_name} · ${formatSpread(data.active_spread_value, data.active_spread_type)}` : "Not active";
    
    const isMt5 = data.selected_platform === "mt5";
    const account = data.mt5?.account || null;
    const caps = data.mt5?.capabilities || {};

    if (ta.balanceLabel) {
        ta.balanceLabel.textContent = isMt5 ? "MT5 Account Balance" : "TraidiumX Trading Balance";
    }
    if (ta.sourceCard) {
        // When MT5 is selected, hide TraidiumX source card completely for a 100% clean MT5 view
        ta.sourceCard.classList.toggle("hidden", isMt5);
    }
    if (ta.sourceBalanceLabel) {
        ta.sourceBalanceLabel.textContent = "TraidiumX Main Deposit Wallet";
    }
    
    if (isMt5) {
        const mt5Bal = account?.balance ?? data.mt5_balance ?? 0;
        const mt5Curr = account?.account_currency || "USD";
        ta.balance.textContent = `${taMoney(mt5Bal)} ${mt5Curr}`;
    } else {
        ta.balance.textContent = `${taMoney(data.trading_balance)} USDT`;
    }
    ta.sourceBalance.textContent = `${taMoney(data.main_wallet_usdt_balance)} USDT | ₹${taMoney(data.main_wallet_inr_balance)} INR`;
    document.querySelectorAll("[data-ta-platform]").forEach((button) => button.classList.toggle("active", button.dataset.taPlatform === data.selected_platform));
    ta.plans.innerHTML = (data.plans || []).map((plan) => `<button type="button" class="ta-plan ${data.preferred_plan === plan.key ? "active" : ""}" data-ta-plan="${taEsc(plan.key)}"><strong>${taEsc(plan.name)}</strong><p class="mt-2 text-2xl font-black text-cyan-300">${formatSpread(plan.spread_value, plan.spread_type)}</p><p class="mt-2 text-xs font-semibold text-slate-400">Minimum ${taMoney(plan.minimum_balance)} USDT</p></button>`).join("");
    document.querySelectorAll("[data-ta-plan]").forEach((button) => button.addEventListener("click", () => savePlan(button.dataset.taPlan)));
    ta.mt5Section.classList.toggle("hidden", data.selected_platform !== "mt5");
    ta.mt5Status.textContent = account?.status || "Not created";
    ta.mt5Login.textContent = account?.masked_login_id || "--";
    ta.mt5Server.textContent = account?.server || caps.server_name || "--";
    ta.mt5Group.textContent = account?.group || "--";
    ta.mt5Balance.textContent = `${taMoney(account?.balance ?? data.mt5_balance ?? 0)} ${account?.account_currency || "USD"}`;
    ta.mt5Note.textContent = account?.provisioning_note || caps.note || "MT5 account setup has not started.";
    document.getElementById("taProvisionMt5").disabled = false;
    const activeAccount = !!account?.login_id && ["active", "connected"].includes(String(account?.status || "").toLowerCase());
    const fundingConfigured = !!caps.funding_configured;
    const fundButton = document.getElementById("taMt5FundButton");
    if (fundButton) fundButton.disabled = !activeAccount || !fundingConfigured;
    if (ta.mt5FundingNote) {
        ta.mt5FundingNote.textContent = "";
    }
}

async function savePlatform(platform) {
    try { const response=await apiRequest("/onboarding/platform",{method:"POST",body:JSON.stringify({platform})}); ta.data={...(ta.data||{}),...(response.data||{})}; renderTradingAccount(); taShowMessage(response.message,"success"); }
    catch(error){taShowMessage(error?.message||"Platform change failed.","error");}
}
async function savePlan(plan) {
    try { const response=await apiRequest("/onboarding/plan",{method:"POST",body:JSON.stringify({plan})}); ta.data={...(ta.data||{}),...(response.data||{})}; renderTradingAccount(); taShowMessage(response.message,"success"); }
    catch(error){taShowMessage(error?.message||"Plan change failed.","error");}
}

document.querySelectorAll("[data-ta-platform]").forEach((button)=>button.addEventListener("click",()=>savePlatform(button.dataset.taPlatform)));
document.getElementById("taOpenSetup")?.addEventListener("click",()=>window.openTradingAccountSetup?.());
function taCheckKycRedirect(error, fallback_message, action = "trading") {
    const errors = error?.errors || {};
    const message = `${error?.message || ""} ${Object.values(errors).join(" ")}`.toLowerCase();
    if (errors.kyc_required || errors.kyc || message.includes("kyc") || message.includes("identity verification")) {
        taShowMessage("KYC verification is required. Redirecting to KYC...", "error");
        const next = encodeURIComponent("./trading-account.html");
        window.setTimeout(() => {
            window.location.href = `./kyc.html?next=${next}&reason=${action}`;
        }, 1200);
        return true;
    }
    taShowMessage(error?.message || fallback_message, "error");
    return false;
}

document.getElementById("taProvisionMt5")?.addEventListener("click",async()=>{try{const response=await apiRequest("/onboarding/mt5/provision",{method:"POST",body:"{}"});taShowMessage(response.message,response.status===202?"info":"success");await loadTradingAccount();}catch(error){taCheckKycRedirect(error,"MT5 setup failed.");}});
document.getElementById("taExistingMt5Form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
        const response = await apiRequest("/onboarding/mt5/connect-existing", {
            method: "POST",
            body: JSON.stringify(payload),
        });
        form?.reset?.();
        taShowMessage(response.message, "success");
        await loadTradingAccount();
    } catch (error) {
        taCheckKycRedirect(error, "MT5 connection failed.");
    }
});

document.getElementById("taMt5FundingForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const amount = Number(document.getElementById("taMt5FundingAmount")?.value || 0);
    if (!(amount > 0)) {
        taShowMessage("Enter a valid MT5 funding amount.", "error");
        return;
    }
    try {
        const response = await apiRequest("/onboarding/mt5/fund", {
            method: "POST",
            body: JSON.stringify({ amount }),
        });
        form?.reset?.();
        taShowMessage(response.message || "MT5 account funded successfully.", "success");
        await loadTradingAccount();
    } catch (error) {
        taCheckKycRedirect(error, "MT5 funding failed.");
    }
});

const setupToken = new URLSearchParams(window.location.search).get("mt5_setup") || "";
if (setupToken) {
    document.getElementById("taMt5SetupToken").value = setupToken;
    document.getElementById("taMt5PasswordForm").classList.remove("hidden");
}
document.getElementById("taMt5PasswordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
        const response = await apiRequest("/onboarding/mt5/password/setup", {
            method: "POST",
            body: JSON.stringify({
                token: document.getElementById("taMt5SetupToken").value,
                password: document.getElementById("taMt5Password").value,
                confirm_password: document.getElementById("taMt5ConfirmPassword").value,
            }),
        });
        taShowMessage(response.message, "success");
        form?.reset?.();
        form?.classList.add("hidden");
        window.history.replaceState({}, "", window.location.pathname);
        await loadTradingAccount();
    } catch (error) {
        taShowMessage(error?.message || "Password setup failed.", "error");
    }
});

document.addEventListener("DOMContentLoaded", loadTradingAccount);

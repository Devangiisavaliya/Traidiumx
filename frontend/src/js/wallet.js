"use strict";


/* =========================================================
   WALLET INITIAL DATA-READY INTRO
   - Covers only the first wallet-page load.
   - Hides after wallet data/render completes.
   - Safety timeout prevents a blocked page if an API stalls.
========================================================= */
const TX_WALLET_INTRO_MIN_VISIBLE_MS = 0;
const TX_WALLET_INTRO_SAFETY_MS = 2000;
const txWalletIntroStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
let txWalletIntroSafetyTimer = null;
let txWalletIntroHidePromise = null;

function txWalletIntroNow() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function scheduleWalletIntroSafety() {
    window.clearTimeout(txWalletIntroSafetyTimer);
    txWalletIntroSafetyTimer = window.setTimeout(() => {
        hideWalletPageIntro({ immediate: true });
    }, TX_WALLET_INTRO_SAFETY_MS);
}

function hideWalletPageIntro(options = {}) {
    if (txWalletIntroHidePromise) {
        return txWalletIntroHidePromise;
    }

    const intro = document.getElementById("txWalletPageIntro");
    if (!intro) {
        document.body?.classList.remove("tx-wallet-intro-active");
        return Promise.resolve();
    }

    const immediate = Boolean(options.immediate);
    const elapsed = txWalletIntroNow() - txWalletIntroStartedAt;
    const waitMs = immediate ? 0 : Math.max(0, TX_WALLET_INTRO_MIN_VISIBLE_MS - elapsed);

    txWalletIntroHidePromise = new Promise((resolve) => {
        window.setTimeout(() => {
            window.clearTimeout(txWalletIntroSafetyTimer);
            intro.classList.add("is-leaving");
            document.body.classList.remove("tx-wallet-intro-active");

            window.setTimeout(() => {
                intro.remove();
                resolve();
            }, immediate ? 40 : 150);
        }, waitMs);
    });

    return txWalletIntroHidePromise;
}

/* =========================================================
   WALLET LOCAL STORAGE CACHE (Avoids 0.00 Flash on Load)
========================================================= */
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
            if (parsed && typeof parsed === "object" && (parsed.main_wallet_usdt || parsed.main_wallet_inr || parsed.available_balance !== undefined)) {
                WALLET_STATE.wallet = parsed;
                return true;
            }
        }
    } catch (e) {
        console.warn("Unable to load cached wallet:", e);
    }
    return false;
}

function saveCachedWalletData(wallet) {
    if (!wallet || typeof wallet !== "object") return;
    try {
        localStorage.setItem(getWalletCacheKey(), JSON.stringify(wallet));
    } catch (e) {
        console.warn("Unable to save cached wallet:", e);
    }
}

/* Global SVG Coin Logo Provider */
window.txGetCoinLogoSvg = function(pairOrCode) {
    const rawPair = String(pairOrCode || "").replace(" Options", "").trim();
    let symbolKey = rawPair.split("-")[0].toUpperCase();

    if (symbolKey.endsWith("USDT") && symbolKey.length > 4) {
        symbolKey = symbolKey.slice(0, -4);
    } else if (symbolKey.endsWith("USD") && symbolKey.length > 3 && symbolKey !== "XAUUSD" && symbolKey !== "USD") {
        symbolKey = symbolKey.slice(0, -3);
    }

    const cleanBaseKey = symbolKey.replace(/^1000/, "");

    const pepeLogo = `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#0f2b1d"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#22c55e" stroke-width="1"/><path fill="#22c55e" d="M9 14c0-3 3-5 7-5s7 2 7 5c0 1.5-.5 3-1.5 4.2C20.5 19.5 18.5 21 16 21s-4.5-1.5-5.5-2.8C9.5 17 9 15.5 9 14z"/><circle cx="12.5" cy="13" r="2.2" fill="#fff"/><circle cx="19.5" cy="13" r="2.2" fill="#fff"/><circle cx="13" cy="13" r="1" fill="#0f2b1d"/><circle cx="20" cy="13" r="1" fill="#0f2b1d"/><path stroke="#0f2b1d" stroke-width="1.2" stroke-linecap="round" d="M12 17.5c2 1.2 6 1.2 8 0"/></svg>`;
    const shibLogo = `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#2b1509"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="#f97316" stroke-width="1"/><path fill="#f97316" d="M8 10l4 4-2 6 6 3 6-3-2-6 4-4-5 1-3-4-3 4z"/><polygon fill="#fff" points="13,15 11,19 15,18"/><polygon fill="#fff" points="19,15 21,19 17,18"/><polygon fill="#000" points="15,20 17,20 16,21.5"/></svg>`;

    const logos = {
        "INR": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#059669"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/><text x="16" y="21.5" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="900" fill="#ffffff" text-anchor="middle">₹</text></svg>`,
        "USD": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#10b981"/><circle cx="16" cy="16" r="14.5" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/><text x="16" y="21.5" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="900" fill="#ffffff" text-anchor="middle">$</text></svg>`,
        "USDT": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#26a17b"/><path fill="#fff" d="M17.92 16.38c-.14.01-.84.05-1.92.05-1.01 0-1.74-.04-1.93-.05-3.66-.17-6.39-.81-6.39-1.58s2.73-1.41 6.39-1.58v-2.31h7.86v2.31c3.66.17 6.39.81 6.39 1.58s-2.73 1.41-6.4 1.58v6.23h-4v-6.23zM16 11.23c-3.15 0-5.83.47-6.09 1.07.26.6 2.94 1.07 6.09 1.07 3.15 0 5.83-.47 6.09-1.07-.26-.6-2.94-1.07-6.09-1.07z"/></svg>`,
        "USDC": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#2775ca"/><path fill="#fff" d="M16 4C9.4 4 4 9.4 4 16s5.4 12 12 12 12-5.4 12-12S22.6 4 16 4zm.6 18.5v1.8h-1.5v-1.8c-2.4-.2-4.1-1.6-4.3-3.7h2.2c.2 1.1 1.2 1.8 2.6 1.8 1.4 0 2.4-.6 2.4-1.6 0-.8-.5-1.3-2.1-1.7l-1.5-.4c-2.3-.6-3.4-1.7-3.4-3.4 0-1.9 1.6-3.3 3.9-3.6v-1.8h1.5v1.8c2 .2 3.5 1.5 3.8 3.3h-2.1c-.2-.9-1-1.5-2.2-1.5-1.3 0-2.1.6-2.1 1.4 0 .7.5 1.2 2 1.6l1.3.3c2.4.6 3.6 1.8 3.6 3.6 0 2-1.6 3.4-4.1 3.7z"/></svg>`,
        "TON": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#0088cc"/><path fill="#fff" d="M16 6l9 7.5-3.5 10.5h-11L7 13.5 16 6zm-4.5 9l4.5 6 4.5-6H11.5z"/></svg>`,
        "BTC": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#f7931a"/><path fill="#fff" d="M23.18 13.84c.34-2.28-1.4-3.5-3.78-4.31l.77-3.1-1.89-.47-.75 3c-.5 0-1-.13-1.5-.24l.76-3.05-1.89-.47-.77 3.09c-.41-.09-.82-.19-1.22-.29l-2.61-.65-.5 2.02s1.4.32 1.37.34c.77.19.9.7.88 1.1l-.88 3.53c.05.01.12.04.2.08l-.2-.05-1.23 4.94c-.09.23-.33.58-.87.45.02.03-1.37-.34-1.37-.34l-.94 2.18 2.47.62c.46.12.91.24 1.36.36l-.78 3.14 1.89.47.77-3.1c.52.14 1.02.27 1.52.39l-.77 3.09 1.89.47.78-3.13c3.22.61 5.64.36 6.66-2.55.82-2.34-.04-3.69-1.74-4.57 1.24-.29 2.17-1.1 2.42-2.77zm-4.33 6.05c-.58 2.35-4.53 1.08-5.8.76l1.04-4.16c1.28.32 5.37.95 4.76 3.4zm.59-6.08c-.53 2.14-3.83.99-4.89.73l.94-3.77c1.06.27 4.49.77 3.95 3.04z"/></svg>`,
        "BCH": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#8dc351"/><path fill="#fff" d="M22.5 13.5c.3-2.1-1.3-3.2-3.5-4l.7-2.9-1.7-.4-.7 2.8c-.5-.1-.9-.2-1.4-.3l.7-2.8-1.7-.4-.7 2.8c-.4-.1-.8-.2-1.1-.3l-2.4-.6-.5 1.9s1.3.3 1.3.3c.7.2.8.6.8 1l-.8 3.3c.1 0 .1 0 .2.1l-.2 0-1.1 4.6c-.1.2-.3.5-.8.4 0 0-1.3-.3-1.3-.3l-.9 2 2.3.6c.4.1.8.2 1.3.3l-.7 2.9 1.7.4.7-2.9c.5.1.9.2 1.4.3l-.7 2.9 1.7.4.7-2.9c3 .6 5.2.3 6.2-2.3.8-2.1 0-3.4-1.6-4.2 1.1-.3 2-1 2.2-2.5zm-4 5.6c-.5 2.1-4.1 1-5.3.7l.9-3.8c1.2.3 4.9.9 4.4 3.1zm.5-5.6c-.5 1.9-3.5.9-4.4.7l.8-3.4c.9.2 4.1.7 3.6 2.7z"/></svg>`,
        "ETH": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#627eea"/><path fill="#fff" fill-opacity=".6" d="M16 4v8.87l7.5 3.35z"/><path fill="#fff" d="M16 4L8.5 16.22l7.5-3.35z"/><path fill="#fff" fill-opacity=".6" d="M16 21.97v6.03l7.5-10.46z"/><path fill="#fff" d="M16 28v-6.03L8.5 17.54z"/><path fill="#fff" fill-opacity=".2" d="M16 20.57l7.5-4.35L16 12.87z"/><path fill="#fff" fill-opacity=".6" d="M8.5 16.22l7.5 4.35v-7.7z"/></svg>`,
        "BNB": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#f3ba2f"/><path fill="#fff" d="M12.12 13.84L16 9.96l3.88 3.88 2.2-2.2L16 5.56l-6.08 6.08zm-6.56 2.16l2.2-2.2L11.64 16l-3.88 3.88-2.2-2.2L7.68 16zm12.32 0l3.88-3.88 2.2 2.2L24.32 16l3.88 3.88-2.2 2.2zm-5.76 2.16L16 22.04l-3.88-3.88-2.2 2.2L16 26.44l6.08-6.08zm0-4.32L16 12.12l1.72 1.72L16 15.56l-1.72-1.72zm0 4.32L16 16.44l1.72 1.72L16 19.88l-1.72-1.72z"/></svg>`,
        "SOL": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#12141d"/><defs><linearGradient id="solGrad_${symbolKey}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00ffa3"/><stop offset="100%" stop-color="#dc1fff"/></linearGradient></defs><path fill="url(#solGrad_${symbolKey})" d="M8 20.7l2.1-2.1h13.9l-2.1 2.1H8zm5.9-6.3l-2.1 2.1h13.9l2.1-2.1H13.9zM8 9.3l2.1-2.1h13.9l-2.1 2.1H8z"/></svg>`,
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
        "ATOM": `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#2e3148"/><circle cx="16" cy="3" r="3" fill="#fff"/><ellipse cx="16" cy="16" rx="10" ry="4" fill="none" stroke="#fff" stroke-width="1.5" transform="rotate(30 16 16)"/><ellipse cx="16" cy="16" rx="10" ry="4" fill="none" stroke="#fff" stroke-width="1.5" transform="rotate(-30 16 16)"/></svg>`,
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

    if (logos[symbolKey]) return logos[symbolKey];
    if (logos[cleanBaseKey]) return logos[cleanBaseKey];

    // Dynamic fallback SVG
    let hash = 0;
    const str = String(symbolKey || "COIN").toUpperCase();
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    const label = str.length > 5 ? str.slice(0, 4) : str;
    const fontSize = label.length > 3 ? "8.5" : "10.5";

    return `<svg viewBox="0 0 32 32" class="coin-logo-svg w-8 h-8 rounded-full shadow-md">
        <defs>
            <linearGradient id="coinGrad_${str}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="hsl(${hue}, 80%, 45%)"/>
                <stop offset="100%" stop-color="hsl(${(hue + 45) % 360}, 90%, 25%)"/>
            </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="16" fill="url(#coinGrad_${str})"/>
        <circle cx="16" cy="16" r="14.5" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
        <text x="16" y="20.5" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="-0.3">${label}</text>
    </svg>`;
};
window.getCoinLogoSvg = window.txGetCoinLogoSvg;



/*
|--------------------------------------------------------------------------
| TraidiumX Crypto Wallet Page
|--------------------------------------------------------------------------
| Company-safe crypto-only wallet flow:
| - No UPI / no Indian bank / no INR payment rails in user wallet UI.
| - Deposit: user sends USDT to backend-configured address and submits TXID.
| - Withdrawal: user requests USDT payout to external crypto address.
| - Wallet balance changes only through backend ledger.
| - Dev-complete helpers are visible only when backend APP_ENV=development.
|--------------------------------------------------------------------------
*/

const WALLET_STATE = {
    wallet: null,
    ledger: [],
    deposits: [],
    withdrawals: [],
    pnlSummary: null,
    positionSummary: null,
    overviewStats: null,
    selectedSubAccountId: null,
    cryptoDeposit: {
        networks: [],
        selectedNetwork: "TRC20",
        minAmount: 10,
        maxAmount: 1000000
    },
    environment: "unknown",
    loading: false,
    walletLoadRequestSeq: 0,
    autoRefreshTimer: null,
    balanceRefreshTimer: null,
    walletSyncEventsBound: false,
    statusSnapshotLoaded: false,
    accountStatus: { account_status: "active", is_active: true },
    withdrawalFeeEstimate: null,
    withdrawalFeeLoading: false,
    activeAction: "",
    exchangeIntervalId: null,
    currentExchangeRate: null,
    currentExchangeFromAsset: null,
    currentExchangeToAsset: null,
    history: {
        ledger: { search: "", status: "all", currency: "all", page: 1, pageSize: 5 },
        deposits: { search: "", status: "all", page: 1, pageSize: 5 },
        withdrawals: { search: "", status: "all", page: 1, pageSize: 5 }
    }
};

// Pre-load cached wallet data safely after WALLET_STATE is initialized
loadCachedWalletData();

const walletElements = {
    get alert() { return document.getElementById("walletAlert"); },
    get loginRequired() { return document.getElementById("walletLoginRequired"); },
    get restrictedNotice() { return document.getElementById("walletRestrictedNotice"); },
    get ledgerAccountFilter() { return document.getElementById("ledgerAccountFilter"); },
    get balanceCards() { return document.getElementById("walletBalanceCards"); },
    get statsGrid() { return document.getElementById("walletStatsGrid"); },
    get depositPanel() { return document.getElementById("walletDepositPanel"); },
    get ledgerPanel() { return document.getElementById("walletLedgerPanel"); },
    get depositHistoryPanel() { return document.getElementById("walletDepositHistoryPanel"); },
    get statusText() { return document.getElementById("walletStatusText"); },
    get environmentText() { return document.getElementById("walletEnvironmentText"); },
    get availableBalance() { return document.getElementById("walletAvailableBalance"); },
    get lockedBalance() { return document.getElementById("walletLockedBalance"); },
    get totalBalance() { return document.getElementById("walletTotalBalance"); },
    get openMargin() { return document.getElementById("walletOpenMargin"); },
    get unrealizedPnl() { return document.getElementById("walletUnrealizedPnl"); },
    get ledgerCount() { return document.getElementById("walletLedgerCount"); },
    get badgeText() { return document.getElementById("walletBadgeText"); },
    get mainTitle() { return document.getElementById("walletMainTitle"); },
    get mainSubtitle() { return document.getElementById("walletMainSubtitle"); },
    get lockedBalanceLabel() { return document.getElementById("walletLockedBalanceLabel"); },
    get lockedBalanceNote() { return document.getElementById("walletLockedBalanceNote"); },
    get openMarginLabel() { return document.getElementById("walletOpenMarginLabel"); },
    get openMarginNote() { return document.getElementById("walletOpenMarginNote"); },
    get ledgerBody() { return document.getElementById("ledgerTableBody"); },
    get depositBody() { return document.getElementById("depositTableBody"); },
    get withdrawalBody() { return document.getElementById("withdrawalTableBody"); },
    get ledgerEmpty() { return document.getElementById("ledgerEmptyState"); },
    get depositEmpty() { return document.getElementById("depositEmptyState"); },
    get withdrawalEmpty() { return document.getElementById("withdrawalEmptyState"); },
    get refreshBtn() { return document.getElementById("refreshWalletBtn"); },
    get depositForm() { return document.getElementById("depositForm"); },
    get cryptoNetwork() { return document.getElementById("cryptoNetwork"); },
    get cryptoAsset() { return document.getElementById("cryptoAsset"); },
    get cryptoDepositAddress() { return document.getElementById("cryptoDepositAddress"); },
    get cryptoAddressStatus() { return document.getElementById("cryptoAddressStatus"); },
    get copyCryptoAddressBtn() { return document.getElementById("copyCryptoAddressBtn"); },
    get createDepositBtn() { return document.getElementById("createDepositBtn"); },
    get payWithMetaMaskBtn() { return document.getElementById("payWithMetaMaskBtn"); },
    get ledgerSearchInput() { return document.getElementById("ledgerSearchInput"); },
    get ledgerCurrencyFilter() { return document.getElementById("ledgerCurrencyFilter"); },
    get ledgerTypeFilter() { return document.getElementById("ledgerTypeFilter"); },
    get ledgerPageSize() { return document.getElementById("ledgerPageSize"); },
    get ledgerPagination() { return document.getElementById("ledgerPagination"); },
    get depositSearchInput() { return document.getElementById("depositSearchInput"); },
    get depositCurrencyFilter() { return document.getElementById("depositCurrencyFilter"); },
    get depositStatusFilter() { return document.getElementById("depositStatusFilter"); },
    get depositPageSize() { return document.getElementById("depositPageSize"); },
    get depositPagination() { return document.getElementById("depositPagination"); },
    get withdrawalSearchInput() { return document.getElementById("withdrawalSearchInput"); },
    get withdrawalCurrencyFilter() { return document.getElementById("withdrawalCurrencyFilter"); },
    get withdrawalStatusFilter() { return document.getElementById("withdrawalStatusFilter"); },
    get withdrawalPageSize() { return document.getElementById("withdrawalPageSize"); },
    get withdrawalPagination() { return document.getElementById("withdrawalPagination"); },
    payWithMetaMaskBtn: document.getElementById("payWithMetaMaskBtn"),
    get withdrawalForm() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawalForm" : "mainWithdrawalForm"); },
    get withdrawNetwork() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawNetwork" : "mainWithdrawNetwork"); },
    get withdrawAsset() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawAsset" : "mainWithdrawAsset"); },
    get withdrawalAddress() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawalAddress" : "mainWithdrawalAddress"); },
    get withdrawAmount() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawAmount" : "mainWithdrawAmount"); },
    get withdrawFeePreview() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawFeePreview" : "mainWithdrawFeePreview"); },
    get withdrawPreviewAmount() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawPreviewAmount" : "mainWithdrawPreviewAmount"); },
    get withdrawPreviewCompanyFee() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawPreviewCompanyFee" : "mainWithdrawPreviewCompanyFee"); },
    get withdrawPreviewNetworkFee() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawPreviewNetworkFee" : "mainWithdrawPreviewNetworkFee"); },
    get withdrawPreviewTotalFee() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawPreviewTotalFee" : "mainWithdrawPreviewTotalFee"); },
    get withdrawPreviewTotalDebit() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawPreviewTotalDebit" : "mainWithdrawPreviewTotalDebit"); },
    get withdrawPreviewReceive() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawPreviewReceive" : "mainWithdrawPreviewReceive"); },
    get withdrawPreviewNote() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawPreviewNote" : "mainWithdrawPreviewNote"); },
    depositAmount: document.getElementById("depositAmount"),
    depositTxHash: document.getElementById("depositTxHash"),
    demoCreditPanel: document.getElementById("demoWalletCreditPanel"),
    demoDepositForm: document.getElementById("demoDepositForm"),
    demoDepositAmount: document.getElementById("demoDepositAmount"),
    demoDepositNetwork: document.getElementById("demoDepositNetwork"),
    demoDepositBtn: document.getElementById("demoDepositBtn"),
    demoWithdrawForm: document.getElementById("demoWithdrawForm"),
    demoWithdrawAmount: document.getElementById("demoWithdrawAmount"),
    demoWithdrawNetwork: document.getElementById("demoWithdrawNetwork"),
    demoWithdrawFeePreview: document.getElementById("demoWithdrawFeePreview"),
    demoWithdrawPreviewAmount: document.getElementById("demoWithdrawPreviewAmount"),
    demoWithdrawPreviewCompanyFee: document.getElementById("demoWithdrawPreviewCompanyFee"),
    demoWithdrawPreviewNetworkFee: document.getElementById("demoWithdrawPreviewNetworkFee"),
    demoWithdrawPreviewTotalFee: document.getElementById("demoWithdrawPreviewTotalFee"),
    demoWithdrawPreviewTotalDebit: document.getElementById("demoWithdrawPreviewTotalDebit"),
    demoWithdrawPreviewReceive: document.getElementById("demoWithdrawPreviewReceive"),
    demoWithdrawPreviewNote: document.getElementById("demoWithdrawPreviewNote"),
    demoWithdrawBtn: document.getElementById("demoWithdrawBtn"),
    demoCreditForm: document.getElementById("demoCreditForm"),
    demoCreditAmount: document.getElementById("demoCreditAmount"),
    demoCreditBtn: document.getElementById("demoCreditBtn"),
    transferPanel: document.getElementById("walletTransferPanel"),
    mainToTradingForm: document.getElementById("mainToTradingForm"),
    tradingToMainForm: document.getElementById("tradingToMainForm"),
    mainToTradingAmount: document.getElementById("mainToTradingAmount"),
    tradingToMainAmount: document.getElementById("tradingToMainAmount"),
    mainToTradingBtn: document.getElementById("mainToTradingBtn"),
    tradingToMainBtn: document.getElementById("tradingToMainBtn"),
    actionPanel: document.getElementById("walletActionPanel"),
    openTransferBtn: document.getElementById("walletOpenTransferBtn"),
    openDepositBtn: document.getElementById("walletOpenDepositBtn"),
    openWithdrawBtn: document.getElementById("walletOpenWithdrawBtn"),
    actionModal: document.getElementById("walletActionModal"),
    actionBackdrop: document.getElementById("walletActionBackdrop"),
    actionModalClose: document.getElementById("walletActionModalClose"),
    actionModalTitle: document.getElementById("walletActionModalTitle"),
    internalTransferForm: document.getElementById("walletInternalTransferForm"),
    internalTransferAsset: document.getElementById("walletInternalTransferAsset"),
    internalTransferRecipient: document.getElementById("walletInternalTransferRecipient"),
    internalTransferAmount: document.getElementById("walletInternalTransferAmount"),
    internalTransferMyBalance: document.getElementById("walletInternalTransferMyBalance"),
    internalTransferSubmitBtn: document.getElementById("walletInternalTransferSubmitBtn"),
    quickInternalTransferBtn: document.getElementById("quickInternalTransferBtn"),
    actionModalSubtitle: document.getElementById("walletActionModalSubtitle"),
    actionModalMessage: document.getElementById("walletActionModalMessage"),
    actionPanels: Array.from(document.querySelectorAll("[data-wallet-action-panel]")),
    modalTradingBalance: document.getElementById("walletModalTradingBalance"),
    modalMainBalance: document.getElementById("walletModalMainBalance"),
    modalPnl: document.getElementById("walletModalPnl"),
    unifiedTransferForm: document.getElementById("walletTransferForm"),
    unifiedTransferDirection: document.getElementById("walletTransferDirection"),
    unifiedTransferAmount: document.getElementById("walletTransferAmount"),
    unifiedTransferBtn: document.getElementById("walletTransferSubmitBtn"),
    depositAddressConfirmation: document.getElementById("depositAddressConfirmation"),
    ledgerSearchInput: document.getElementById("ledgerSearchInput"),
    ledgerCurrencyFilter: document.getElementById("ledgerCurrencyFilter"),
    ledgerTypeFilter: document.getElementById("ledgerTypeFilter"),
    ledgerPageSize: document.getElementById("ledgerPageSize"),
    ledgerPagination: document.getElementById("ledgerPagination"),
    depositSearchInput: document.getElementById("depositSearchInput"),
    depositCurrencyFilter: document.getElementById("depositCurrencyFilter"),
    depositStatusFilter: document.getElementById("depositStatusFilter"),
    depositPageSize: document.getElementById("depositPageSize"),
    depositPagination: document.getElementById("depositPagination"),
    withdrawalSearchInput: document.getElementById("withdrawalSearchInput"),
    withdrawalCurrencyFilter: document.getElementById("withdrawalCurrencyFilter"),
    withdrawalStatusFilter: document.getElementById("withdrawalStatusFilter"),
    withdrawalPageSize: document.getElementById("withdrawalPageSize"),
    withdrawalPagination: document.getElementById("withdrawalPagination")
};

function walletEscape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function walletNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function getWalletCurrency() {
    return WALLET_STATE.wallet?.currency || "USDT";
}

function getItemCurrency(item) {
    if (!item) return getWalletCurrency();
    const cur = String(item.currency || "").toUpperCase();
    if (cur === "INR" || cur === "USDT") {
        return cur;
    }
    const type = String(item.transaction_type || item.type || "").toLowerCase();
    const desc = String(item.description || "").toLowerCase();

    if (type.includes("inr") || desc.includes("inr") || desc.includes("₹")) {
        return "INR";
    }
    if (type.includes("crypto") || type.includes("usdt") || desc.includes("usdt") || desc.includes("verified usdt") || desc.includes("$")) {
        return "USDT";
    }
    return getWalletCurrency();
}

function getMainWalletData() {
    const wallet = WALLET_STATE.wallet || {};
    const selectedCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
    if (selectedCurrency === "INR") {
        return wallet.main_wallet_inr || {
            available_balance: 0,
            locked_balance: 0,
            total_balance: 0,
            currency: "INR"
        };
    } else {
        return wallet.main_wallet_usdt || {
            available_balance: 0,
            locked_balance: 0,
            total_balance: 0,
            currency: "USDT"
        };
    }
}

function txSyncNavbarBalanceFromWalletState() {
    const balEl = document.getElementById("txNavbarWalletBalanceText");
    const wallet = WALLET_STATE.wallet || {};
    const inrWallet = wallet.main_wallet_inr || {};
    const usdtWallet = wallet.main_wallet_usdt || {};
    const inrAvail = walletNumber(inrWallet.available_balance, 0);
    const usdtAvail = walletNumber(usdtWallet.available_balance, 0);
    const formattedInr = `₹${inrAvail.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formattedUsdt = `${usdtAvail.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;

    try {
        localStorage.setItem("tx_cached_navbar_balance_INR", formattedInr);
        localStorage.setItem("tx_cached_navbar_balance_USDT", formattedUsdt);
    } catch (_) {}

    const activeCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const formatted = activeCurrency === "INR" ? formattedInr : formattedUsdt;
    if (balEl) {
        balEl.textContent = formatted;
    }
    try {
        localStorage.setItem("tx_cached_navbar_balance", formatted);
    } catch (_) {}
}
window.txSyncNavbarBalanceFromWalletState = txSyncNavbarBalanceFromWalletState;

function getActiveWalletData() {
    const activeSubId = localStorage.getItem("traidiumx_active_user_id");
    if (!activeSubId || activeSubId === "main") {
        return WALLET_STATE.wallet || {};
    }
    const cache = (typeof txSubAccountsLocalCache !== "undefined" ? txSubAccountsLocalCache : []) || [];
    if (cache.length > 0) {
        const sub = cache.find(s => s.id === activeSubId);
        if (sub && sub.wallet) return sub.wallet;
    }
    return WALLET_STATE.wallet || {};
}

function getTradingWalletData() {
    const wallet = getActiveWalletData();
    const activeCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const bucketKey = activeCurrency === "INR" ? "trading_wallet_inr" : "trading_wallet_usdt";
    const fallbackCurrency = activeCurrency === "INR" ? "INR" : "USDT";
    return wallet[bucketKey] || wallet.trading_wallet || {
        available_balance: wallet.available_balance || 0,
        locked_balance: wallet.locked_balance || 0,
        total_balance: wallet.total_balance || 0,
        currency: fallbackCurrency
    };
}

function isBalanceHidden() {
    return localStorage.getItem("tx_balance_hidden") === "1";
}

function formatWalletMoney(value, currency = getWalletCurrency(), decimals = 2) {
    const amount = walletNumber(value, 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    const cur = String(currency || "").toUpperCase();
    if (cur === "INR" || cur === "₹") {
        return `₹${amount}`;
    }
    return `$${amount}`;
}

function formatWalletMoneyPrivate(value, currency = getWalletCurrency(), decimals = 2) {
    if (isBalanceHidden()) {
        return "********";
    }
    return formatWalletMoney(value, currency, decimals);
}

function formatWalletDate(value) {
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
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function prettyType(value) {
    const normalized = String(value || "--")
        .replace(/trading_fee_debit/gi, "Trading Fee Debit")
        .replace(/platform_fee_debit/gi, "Platform Fee Debit");

    let result = normalized
        .replaceAll("_", " ")
        .replaceAll("-", " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());

    // Fix currency casing
    result = result
        .replace(/\bInr\b/g, "INR")
        .replace(/\bUsdt\b/g, "USDT")
        .replace(/\bUpi\b/g, "UPI");

    return result;
}

function directionClass(direction) {
    const value = String(direction || "").toLowerCase();
    if (["credit", "in"].includes(value)) return "text-emerald-400";
    if (["finalized", "settled", "status"].includes(value)) return "text-cyan-300";
    return "text-red-400";
}

function isWithdrawalFinalizedLedger(item) {
    if (!item) return false;
    const type = String(item.transaction_type || item.type || "").toLowerCase();
    const dir = String(item.direction || "").toLowerCase();
    const desc = String(item.description || "").toLowerCase();

    return (
        ["withdrawal_completed", "inr_withdrawal_completed", "crypto_withdrawal_completed"].includes(type) ||
        dir === "finalized" ||
        desc.includes("no extra debit") ||
        desc.includes("locked amount finalized") ||
        desc.includes("locked main wallet amount")
    );
}

function withdrawalFinalizedDescription(description) {
    const text = String(description || "").trim();
    const note = "Locked withdrawal amount finalized. No extra debit was taken from available balance.";
    if (!text) return note;
    return /no extra debit|already locked|finalized/i.test(text) ? text : `${text}. ${note}`;
}


function isWithdrawalLockLedger(item) {
    const type = String(item?.transaction_type || item?.type || "").toLowerCase();
    return [
        "demo_withdrawal_request_lock",
        "demo_inr_withdrawal_request_lock",
        "crypto_withdrawal_request",
        "inr_withdrawal_request",
        "withdrawal_request_lock",
        "withdrawal_request_locked"
    ].includes(type);
}

function withdrawalLedgerReference(item) {
    return String(item?.reference_id || item?.withdrawal_id || "").trim();
}

function getDisplayLedgerRows(rows) {
    const sourceRows = Array.isArray(rows) ? rows : [];

    // Filter out all secondary "Finalized / Withdrawal Completed / No Extra Debit" entries
    // so that each withdrawal is represented by exactly one clean Debit entry.
    const displayRows = sourceRows.filter((item) => {
        if (!item) return false;
        if (isWithdrawalFinalizedLedger(item)) {
            return false;
        }
        return true;
    });

    return displayRows.sort((a, b) => {
        const dateA = new Date(a?.created_at || 0).getTime();
        const dateB = new Date(b?.created_at || 0).getTime();
        return dateB - dateA;
    });
}

function statusClass(status, tone = "") {
    const normalizedTone = String(tone || "").toLowerCase();
    const value = String(status || "").toLowerCase();

    if (normalizedTone === "success" || ["completed", "filled", "closed", "approved"].includes(value)) {
        return "bg-emerald-400/10 text-emerald-400";
    }
    if (normalizedTone === "danger" || ["failed", "rejected"].includes(value)) {
        return "bg-red-400/10 text-red-400";
    }
    if (normalizedTone === "neutral" || ["cancelled", "canceled"].includes(value)) {
        return "bg-slate-400/10 text-slate-300";
    }
    if (["pending_admin_approval", "pending_payout", "pending", "queued"].includes(value)) {
        return "bg-cyan-400/10 text-cyan-300";
    }
    return "bg-orange-400/10 text-orange-300";
}

function getWithdrawalStatusMeta(item = {}) {
    const rawStatus = String(item.status || "pending_admin_approval").toLowerCase();
    const backendLabel = String(item.status_label || "").trim();
    const backendMessage = String(item.status_message || "").trim();

    const fallback = {
        pending: { label: "Pending Admin Approval", tone: "warning", message: "Amount is locked. Waiting for admin approval.", canCancel: true },
        pending_admin_approval: { label: "Pending Admin Approval", tone: "warning", message: "Amount is locked. Waiting for admin approval.", canCancel: true },
        pending_payout: { label: "Pending Admin Approval", tone: "warning", message: "Amount is locked. Waiting for admin approval.", canCancel: true },
        queued: { label: "Queued for Review", tone: "warning", message: "Withdrawal is queued for admin review.", canCancel: true },
        approved: { label: "Approved by Admin", tone: "success", message: "Admin approved this request. Locked balance has been finally withdrawn.", canCancel: false },
        completed: { label: "Completed", tone: "success", message: "Withdrawal completed successfully.", canCancel: false },
        rejected: { label: "Rejected by Admin", tone: "danger", message: "Admin rejected this request. Locked balance has been released back to available balance.", canCancel: false },
        cancelled: { label: "Cancelled by User", tone: "neutral", message: "You cancelled this request. Locked balance has been released back to available balance.", canCancel: false },
        failed: { label: "Failed", tone: "danger", message: "Withdrawal failed. Contact support if balance was not released.", canCancel: false }
    }[rawStatus] || {
        label: prettyType(rawStatus),
        tone: "warning",
        message: "Withdrawal status is being processed.",
        canCancel: false
    };

    let message = backendMessage || fallback.message;
    if (rawStatus === "rejected" && item.reject_reason) {
        message = `Rejected reason: ${item.reject_reason}`;
    }

    return {
        status: rawStatus,
        label: backendLabel || fallback.label,
        tone: String(item.status_tone || fallback.tone || "warning").toLowerCase(),
        message,
        canCancel: typeof item.can_cancel === "boolean" ? item.can_cancel : fallback.canCancel,
        decisionAt: item.decision_at || item.approved_at || item.rejected_at || item.completed_at || item.cancelled_at || ""
    };
}

function getWalletStatusCacheKey() {
    const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    const userId = user?.id || user?._id || "default";
    return `traidiumx_wallet_withdrawal_status_${userId}`;
}

function readWithdrawalStatusSnapshot() {
    try {
        return JSON.parse(localStorage.getItem(getWalletStatusCacheKey()) || "{}");
    } catch (error) {
        return {};
    }
}

function writeWithdrawalStatusSnapshot(withdrawals = []) {
    const snapshot = {};
    withdrawals.forEach((item) => {
        if (item?.id) {
            snapshot[item.id] = String(item.status || "").toLowerCase();
        }
    });

    try {
        localStorage.setItem(getWalletStatusCacheKey(), JSON.stringify(snapshot));
    } catch (error) {
        console.warn("Unable to save withdrawal status snapshot.", error);
    }
}

function notifyWithdrawalStatusChanges(withdrawals = []) {
    const previous = readWithdrawalStatusSnapshot();
    const finalMessages = [];

    withdrawals.forEach((item) => {
        const id = item?.id;
        if (!id || !previous[id]) return;

        const oldStatus = String(previous[id] || "").toLowerCase();
        const newStatus = String(item.status || "").toLowerCase();
        if (oldStatus === newStatus) return;

        const meta = getWithdrawalStatusMeta(item);
        if (["approved", "completed", "rejected", "cancelled", "failed"].includes(newStatus)) {
            finalMessages.push(`${item.withdrawal_reference || "Withdrawal"}: ${meta.label}`);
        }
    });

    writeWithdrawalStatusSnapshot(withdrawals);

    if (!WALLET_STATE.statusSnapshotLoaded) {
        WALLET_STATE.statusSnapshotLoaded = true;
        return;
    }

    if (finalMessages.length > 0) {
        showWalletAlert(finalMessages.slice(0, 2).join(" • "), "info");
    }
}

function showWalletAlert(message, type = "success") {
    if (!walletElements.alert) {
        return;
    }

    const successClass = "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
    const errorClass = "border-red-400/30 bg-red-400/10 text-red-300";
    const infoClass = "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";

    walletElements.alert.textContent = message;
    walletElements.alert.className = `mb-6 rounded-3xl border px-5 py-4 text-sm font-bold ${
        type === "error" ? errorClass : type === "info" ? infoClass : successClass
    }`;
    walletElements.alert.classList.remove("hidden");
}

function clearWalletAlert() {
    walletElements.alert?.classList.add("hidden");
}

function injectWalletConfirmStyles() {
    if (document.getElementById("txWalletConfirmStyles")) return;

    const style = document.createElement("style");
    style.id = "txWalletConfirmStyles";
    style.textContent = `
        .tx-wallet-confirm-backdrop {
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

        .tx-wallet-confirm-card {
            width: min(480px, 100%);
            border-radius: 26px;
            border: 1px solid rgba(148, 163, 184, 0.24);
            background: linear-gradient(180deg, #101827, #060a14);
            box-shadow: 0 28px 90px rgba(0, 0, 0, 0.62);
            padding: 26px;
            color: #e5e7eb;
            animation: txWalletConfirmIn 0.18s ease-out;
        }

        .tx-wallet-confirm-top {
            display: flex;
            align-items: flex-start;
            gap: 16px;
        }

        .tx-wallet-confirm-icon {
            width: 54px;
            height: 54px;
            flex: 0 0 54px;
            border-radius: 18px;
            display: grid;
            place-items: center;
            font-size: 24px;
            font-weight: 900;
            color: #67e8f9;
            background: rgba(34, 211, 238, 0.12);
            border: 1px solid rgba(34, 211, 238, 0.25);
        }

        .tx-wallet-confirm-icon.danger {
            color: #fca5a5;
            background: rgba(239, 68, 68, 0.12);
            border-color: rgba(239, 68, 68, 0.30);
        }

        .tx-wallet-confirm-title {
            margin: 0;
            font-size: 22px;
            line-height: 1.15;
            font-weight: 900;
            letter-spacing: -0.03em;
            color: #ffffff;
        }

        .tx-wallet-confirm-message {
            margin: 9px 0 0;
            color: #94a3b8;
            line-height: 1.55;
            font-size: 14px;
        }

        .tx-wallet-confirm-details {
            margin-top: 18px;
            display: grid;
            gap: 10px;
            border: 1px solid rgba(34, 211, 238, 0.16);
            background: rgba(15, 23, 42, 0.70);
            border-radius: 18px;
            padding: 14px;
        }

        .tx-wallet-confirm-detail-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            color: #94a3b8;
            font-size: 13px;
            line-height: 1.35;
        }

        .tx-wallet-confirm-detail-row strong {
            color: #f8fafc;
            font-weight: 900;
            text-align: right;
            white-space: nowrap;
        }

        .tx-wallet-confirm-detail-row.receive strong {
            color: #34d399;
        }

        .tx-wallet-confirm-detail-row.fee strong {
            color: #fbbf24;
        }

        .tx-wallet-confirm-detail-row.debit strong {
            color: #f87171;
        }

        .tx-wallet-confirm-note {
            margin-top: 12px;
            border-radius: 14px;
            border: 1px solid rgba(251, 191, 36, 0.22);
            background: rgba(251, 191, 36, 0.08);
            color: #fde68a;
            padding: 11px 12px;
            font-size: 12px;
            line-height: 1.5;
        }

        .tx-wallet-confirm-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 24px;
        }

        .tx-wallet-confirm-btn {
            border: 0;
            border-radius: 15px;
            padding: 12px 18px;
            font-size: 13px;
            font-weight: 900;
            cursor: pointer;
            transition: transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
        }

        .tx-wallet-confirm-btn:hover {
            transform: translateY(-1px);
        }

        .tx-wallet-confirm-btn.cancel {
            color: #cbd5e1;
            background: rgba(148, 163, 184, 0.12);
            border: 1px solid rgba(148, 163, 184, 0.20);
        }

        .tx-wallet-confirm-btn.confirm {
            color: #020617;
            background: linear-gradient(135deg, #22d3ee, #818cf8);
            box-shadow: 0 16px 34px rgba(34, 211, 238, 0.18);
        }

        .tx-wallet-confirm-btn.confirm.danger {
            color: #ffffff;
            background: linear-gradient(135deg, #fb7185, #f97316);
            box-shadow: 0 16px 34px rgba(251, 113, 133, 0.20);
        }

        @keyframes txWalletConfirmIn {
            from {
                opacity: 0;
                transform: translateY(12px) scale(0.96);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        @media (max-width: 520px) {
            .tx-wallet-confirm-card {
                padding: 22px;
                border-radius: 22px;
            }

            .tx-wallet-confirm-top {
                gap: 12px;
            }

            .tx-wallet-confirm-actions {
                flex-direction: column-reverse;
            }

            .tx-wallet-confirm-btn {
                width: 100%;
            }
        }
    `;

    document.head.appendChild(style);
}

function showWalletConfirm({
    title = "Confirm Action",
    message = "Are you sure?",
    details = [],
    note = "",
    confirmText = "Confirm",
    cancelText = "Cancel",
    danger = false
}) {
    injectWalletConfirmStyles();

    return new Promise((resolve) => {
        const oldModal = document.getElementById("txWalletConfirmModal");
        if (oldModal) oldModal.remove();

        const modal = document.createElement("div");
        modal.id = "txWalletConfirmModal";

        const detailsHtml = Array.isArray(details) && details.length > 0
            ? `<div class="tx-wallet-confirm-details">${details.map((item) => `
                <div class="tx-wallet-confirm-detail-row ${walletEscape(item.tone || "")}">
                    <span>${walletEscape(item.label || "")}</span>
                    <strong>${walletEscape(item.value || "--")}</strong>
                </div>
            `).join("")}</div>`
            : "";

        const noteHtml = note
            ? `<div class="tx-wallet-confirm-note">${walletEscape(note)}</div>`
            : "";

        modal.innerHTML = `
            <div class="tx-wallet-confirm-backdrop">
                <div class="tx-wallet-confirm-card" role="dialog" aria-modal="true">
                    <div class="tx-wallet-confirm-top">
                        <div class="tx-wallet-confirm-icon ${danger ? "danger" : ""}">
                            ${danger ? "!" : "✓"}
                        </div>

                        <div>
                            <h3 class="tx-wallet-confirm-title">${walletEscape(title)}</h3>
                            <p class="tx-wallet-confirm-message">${walletEscape(message)}</p>
                        </div>
                    </div>

                    ${detailsHtml}
                    ${noteHtml}

                    <div class="tx-wallet-confirm-actions">
                        <button type="button" class="tx-wallet-confirm-btn cancel" id="txWalletConfirmCancel">
                            ${walletEscape(cancelText)}
                        </button>
                        <button type="button" class="tx-wallet-confirm-btn confirm ${danger ? "danger" : ""}" id="txWalletConfirmOk">
                            ${walletEscape(confirmText)}
                        </button>
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
            if (event.key === "Escape") {
                close(false);
            }
        }

        document.addEventListener("keydown", escHandler);

        modal.querySelector("#txWalletConfirmCancel")?.addEventListener("click", () => close(false));
        modal.querySelector("#txWalletConfirmOk")?.addEventListener("click", () => close(true));

        modal.querySelector(".tx-wallet-confirm-backdrop")?.addEventListener("click", (event) => {
            if (event.target.classList.contains("tx-wallet-confirm-backdrop")) {
                close(false);
            }
        });
    });
}

function injectWalletPageStyles() {
    if (document.getElementById("txWalletPageStyles")) return;

    const style = document.createElement("style");
    style.id = "txWalletPageStyles";
    style.textContent = `
        #walletActionModal {
            align-items: center !important;
            justify-content: center !important;
            padding: 24px !important;
        }
        #walletActionModal .tx-wallet-action-card {
            width: min(640px, calc(100vw - 32px)) !important;
            max-width: 640px !important;
            max-height: min(92vh, 820px) !important;
            margin: auto !important;
            border-radius: 32px !important;
        }
        #walletActionModal .tx-wallet-action-card form {
            max-width: 100% !important;
        }
        @media (min-width: 1024px) {
            #walletActionModal .tx-wallet-action-card {
                width: 620px !important;
            }
        }
        @media (max-width: 640px) {
            #walletActionModal {
                padding: 14px !important;
            }
            #walletActionModal .tx-wallet-action-card {
                width: calc(100vw - 20px) !important;
                border-radius: 26px !important;
            }
        }
        .tx-wallet-action-btn {
            width: 100%;
            min-height: 108px;
            border-radius: 28px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            padding: 22px;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: center;
            gap: 7px;
            text-align: left;
            font-weight: 950;
            color: #fff;
            transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease, background .18s ease;
        }
        .tx-wallet-action-btn:hover { transform: translateY(-2px); }
        .tx-wallet-action-btn span { font-size: 22px; line-height: 1; }
        .tx-wallet-action-btn small { color: rgba(226, 232, 240, .74); font-size: 12px; font-weight: 800; }
        .tx-wallet-action-btn.transfer { background: linear-gradient(135deg, rgba(245, 158, 11, .23), rgba(15, 23, 42, .82)); border-color: rgba(245, 158, 11, .36); box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
        .tx-wallet-action-btn.deposit { background: linear-gradient(135deg, rgba(34, 211, 238, .24), rgba(15, 23, 42, .82)); border-color: rgba(34, 211, 238, .38); box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
        .tx-wallet-action-btn.withdraw { background: linear-gradient(135deg, rgba(239, 68, 68, .20), rgba(15, 23, 42, .86)); border-color: rgba(248, 113, 113, .28); box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
        .tx-form-label { display: block; margin-bottom: 8px; color: #94a3b8; font-size: 12px; font-weight: 950; text-transform: uppercase; letter-spacing: .12em; }
        .tx-form-input { width: 100%; border-radius: 18px; border: 1px solid rgba(255,255,255,.10); background: rgba(2,6,23,.88); padding: 14px 16px; color: #fff; outline: none; font-size: 14px; font-weight: 850; transition: border-color .15s ease, box-shadow .15s ease; }
        .tx-form-input:focus { border-color: rgba(34,211,238,.72); box-shadow: 0 0 0 3px rgba(34,211,238,.10); }
        .tx-submit-btn { width: 100%; border: 0; border-radius: 20px; padding: 16px 20px; font-size: 14px; font-weight: 950; color: #020617; transition: transform .15s ease, opacity .15s ease; cursor: pointer; }
        .tx-submit-btn:hover { transform: translateY(-1px); }
        .tx-submit-btn.transfer { background: linear-gradient(135deg, #facc15, #f59e0b); }
        .tx-submit-btn.deposit { background: linear-gradient(135deg, #67e8f9, #22d3ee); }
        .tx-submit-btn.withdraw { color: #fff; background: linear-gradient(135deg, #ef4444, #991b1b); box-shadow: 0 16px 36px rgba(127, 29, 29, .30); }
        .tx-submit-btn.exchange { background: linear-gradient(135deg, #22d3ee, #06b6d4); box-shadow: 0 8px 24px rgba(34, 211, 238, 0.25); }
        .tx-submit-btn.internal_transfer { background: linear-gradient(135deg, #67e8f9, #22d3ee); box-shadow: 0 8px 24px rgba(34, 211, 238, 0.25); }
        .tx-wallet-modal-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(34, 211, 238, 0.3) rgba(2, 6, 23, 0.4);
        }
        .tx-wallet-modal-scroll::-webkit-scrollbar {
            width: 6px;
        }
        .tx-wallet-modal-scroll::-webkit-scrollbar-track {
            background: rgba(2, 6, 23, 0.4);
            border-radius: 10px;
        }
        .tx-wallet-modal-scroll::-webkit-scrollbar-thumb {
            background: rgba(34, 211, 238, 0.3);
            border-radius: 10px;
        }
        .tx-wallet-modal-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(34, 211, 238, 0.6);
        }
        .tx-wallet-action-message { margin-bottom: 18px; border-radius: 18px; border: 1px solid; padding: 13px 15px; font-size: 13px; font-weight: 900; line-height: 1.45; }
        .tx-wallet-action-message.success { border-color: rgba(52,211,153,.34); background: rgba(16,185,129,.12); color: #bbf7d0; }
        .tx-wallet-action-message.error { border-color: rgba(248,113,113,.36); background: rgba(239,68,68,.12); color: #fecaca; }
        .tx-wallet-action-message.info { border-color: rgba(34,211,238,.34); background: rgba(34,211,238,.12); color: #cffafe; }
        .tx-history-card { border-radius: 32px; border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.05); padding: 22px; backdrop-filter: blur(18px); }
        .tx-history-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
        .tx-history-head h3 { margin: 0; font-size: 24px; line-height: 1.1; font-weight: 950; color: #fff; }
        .tx-history-head p { margin-top: 6px; font-size: 13px; color: #94a3b8; }
        .tx-history-controls { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
        .tx-history-controls input, .tx-history-controls select { border-radius: 999px; border: 1px solid rgba(255,255,255,.10); background: rgba(2,6,23,.72); color: #e5e7eb; padding: 11px 14px; font-size: 12px; font-weight: 850; outline: none; }
        .tx-history-controls input { min-width: 210px; }
        .tx-history-table-wrap { overflow-x: auto; scrollbar-width: none; }
        .tx-history-table-wrap::-webkit-scrollbar { display: none; }
        .tx-history-table-wrap table { width: 100%; min-width: 880px; border-collapse: collapse; }
        .tx-history-table-wrap th { border-bottom: 1px solid rgba(255,255,255,.10); padding: 13px 12px; text-align: left; color: #94a3b8; font-size: 11px; font-weight: 950; text-transform: uppercase; letter-spacing: .14em; }
        .tx-history-table-wrap td { border-bottom: 1px solid rgba(255,255,255,.06); padding: 14px 12px; vertical-align: top; }
        .tx-history-empty { margin-top: 14px; border-radius: 20px; background: rgba(2,6,23,.50); padding: 20px; text-align: center; color: #94a3b8; font-size: 14px; }
        .tx-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
        .tx-pagination button { border-radius: 999px; border: 1px solid rgba(255,255,255,.12); background: rgba(15,23,42,.72); color: #cbd5e1; padding: 8px 12px; font-size: 12px; font-weight: 900; }
        .tx-pagination button.active { background: #22d3ee; color: #020617; border-color: #22d3ee; }
        .tx-pagination button:disabled { opacity: .45; cursor: not-allowed; }
        .tx-pagination span { color: #94a3b8; font-size: 12px; font-weight: 800; }
        @media (max-width: 900px) {
            .tx-history-head { flex-direction: column; }
            .tx-history-controls { justify-content: stretch; width: 100%; }
            .tx-history-controls input, .tx-history-controls select { width: 100%; }
        }
    `;
    document.head.appendChild(style);
}

function isWalletActionModalOpen() {
    return Boolean(walletElements.actionModal && !walletElements.actionModal.classList.contains("hidden"));
}

function clearWalletActionMessage() {
    if (!walletElements.actionModalMessage) return;
    walletElements.actionModalMessage.textContent = "";
    walletElements.actionModalMessage.className = "hidden";
}

function showWalletActionMessage(message = "", type = "success") {
    const clean = String(message || "").trim();
    if (!clean) {
        clearWalletActionMessage();
        return;
    }

    if (!walletElements.actionModalMessage || !isWalletActionModalOpen()) {
        showWalletAlert(clean, type === "error" ? "error" : type === "info" ? "info" : "success");
        return;
    }

    const tone = type === "error" ? "error" : type === "info" ? "info" : "success";
    walletElements.actionModalMessage.textContent = clean;
    walletElements.actionModalMessage.className = `tx-wallet-action-message ${tone}`;
}

function updateWalletActionModalBalances() {
    const wallet = getActiveWalletData();
    const tradingWallet = getTradingWalletData();
    const tradingCurrency = tradingWallet.currency || "USDT";
    
    const activePanel = document.querySelector("[data-wallet-action-panel]:not(.hidden)");
    const action = activePanel?.getAttribute("data-wallet-action-panel");

    const tradingLabel = document.querySelector("#walletModalTradingCol p");
    const mainLabel = document.querySelector("#walletModalMainCol p");
    if (tradingLabel) tradingLabel.textContent = "Trading";
    if (mainLabel) mainLabel.textContent = "Main";

    const modalStatsGrid = document.getElementById("walletModalStatsGrid");
    const tradingCol = document.getElementById("walletModalTradingCol");
    const mainCol = document.getElementById("walletModalMainCol");
    const pnlCol = document.getElementById("walletModalPnlCol");

    if (["transfer", "internal_transfer"].includes(action)) {
        if (action === "internal_transfer") {
            updateInternalTransferBalance();
        }
        if (modalStatsGrid) modalStatsGrid.classList.add("hidden");
        return;
    }

    if (action === "deposit" || action === "withdraw") {
        if (modalStatsGrid) modalStatsGrid.classList.add("hidden");
    }

    if (action === "exchange") {
        const fromAsset = (document.getElementById("walletExchangeFromAsset")?.value || "USDT").toUpperCase();
        const toAsset = (document.getElementById("walletExchangeToAsset")?.value || "USDT").toUpperCase();
        
        const fromKey = `main_wallet_${fromAsset.toLowerCase()}`;
        const toKey = `main_wallet_${toAsset.toLowerCase()}`;
        
        const fromWallet = wallet[fromKey] || { available_balance: 0 };
        const toWallet = wallet[toKey] || { available_balance: 0 };

        if (tradingLabel) tradingLabel.textContent = `${fromAsset} Balance`;
        if (mainLabel) mainLabel.textContent = `${toAsset} Balance`;

        if (walletElements.modalTradingBalance) {
            if (["INR", "USDT"].includes(fromAsset)) {
                walletElements.modalTradingBalance.textContent = formatWalletMoney(walletNumber(fromWallet.available_balance, 0), fromAsset);
            } else {
                walletElements.modalTradingBalance.textContent = `${walletNumber(fromWallet.available_balance, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${fromAsset}`;
            }
        }
        if (walletElements.modalMainBalance) {
            if (["INR", "USDT"].includes(toAsset)) {
                walletElements.modalMainBalance.textContent = formatWalletMoney(walletNumber(toWallet.available_balance, 0), toAsset);
            } else {
                walletElements.modalMainBalance.textContent = `${walletNumber(toWallet.available_balance, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${toAsset}`;
            }
        }

        if (tradingCol) tradingCol.classList.remove("hidden");
        if (mainCol) mainCol.classList.remove("hidden");
        if (pnlCol) pnlCol.classList.add("hidden");

        if (modalStatsGrid) {
            modalStatsGrid.className = "mb-5 grid grid-cols-2 gap-3 rounded-2xl border border-white/20 bg-slate-900/70 p-4 text-center";
        }
        return;
    }

    let mainCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
    if (action === "deposit") {
        mainCurrency = WALLET_STATE.activeDepositCurrency || mainCurrency;
    } else if (action === "withdraw") {
        mainCurrency = WALLET_STATE.activeWithdrawalCurrency || mainCurrency;
    }
    
    let mainWallet = {};
    const key = `main_wallet_${mainCurrency.toLowerCase()}`;
    if (wallet[key]) {
        mainWallet = wallet[key];
    } else if (mainCurrency === "INR") {
        mainWallet = wallet.main_wallet_inr || { available_balance: 0, locked_balance: 0, total_balance: 0, currency: "INR" };
    } else if (mainCurrency === "USDT") {
        mainWallet = wallet.main_wallet_usdt || { available_balance: 0, locked_balance: 0, total_balance: 0, currency: "USDT" };
    } else {
        mainWallet = { available_balance: 0, locked_balance: 0, total_balance: 0, currency: mainCurrency };
    }

    if (walletElements.modalTradingBalance) {
        walletElements.modalTradingBalance.textContent = formatWalletMoney(walletNumber(tradingWallet.available_balance, 0), tradingCurrency);
    }
    if (walletElements.modalMainBalance) {
        if (["INR", "USDT"].includes(mainCurrency)) {
            walletElements.modalMainBalance.textContent = formatWalletMoney(walletNumber(mainWallet.available_balance, 0), mainCurrency);
        } else {
            walletElements.modalMainBalance.textContent = `${walletNumber(mainWallet.available_balance, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${mainCurrency}`;
        }
    }
    if (walletElements.modalPnl) {
        const unrealizedPnl = walletNumber(WALLET_STATE.pnlSummary?.total_unrealized_pnl ?? WALLET_STATE.positionSummary?.total_unrealized_pnl, 0);
        walletElements.modalPnl.textContent = `${unrealizedPnl >= 0 ? "+" : ""}${formatWalletMoney(unrealizedPnl, tradingCurrency)}`;
        walletElements.modalPnl.className = unrealizedPnl >= 0 ? "text-xs font-extrabold text-cyan-300 truncate" : "text-xs font-extrabold text-rose-400 truncate";
    }

    const depAvailable = document.getElementById("txDepAvailableBal");
    if (depAvailable) {
        if (["INR", "USDT"].includes(mainCurrency)) {
            depAvailable.textContent = formatWalletMoney(walletNumber(mainWallet.available_balance, 0), mainCurrency);
        } else {
            depAvailable.textContent = `${walletNumber(mainWallet.available_balance, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${mainCurrency}`;
        }
    }

    // Hide Trading/P&L stats and center Main Wallet stats for specific crypto coins
    const isCryptoSpecific = !["USDT", "INR"].includes(mainCurrency);

    if (tradingCol) tradingCol.classList.toggle("hidden", isCryptoSpecific);
    if (pnlCol) pnlCol.classList.toggle("hidden", isCryptoSpecific);

    if (modalStatsGrid) {
        if (["deposit", "withdraw", "transfer", "internal_transfer"].includes(action)) {
            modalStatsGrid.classList.add("hidden");
        } else if (isCryptoSpecific) {
            modalStatsGrid.className = "mb-5 grid grid-cols-1 rounded-2xl border border-white/20 bg-slate-900/70 p-4 text-center";
        } else {
            modalStatsGrid.className = "mb-5 grid grid-cols-3 gap-3 rounded-2xl border border-white/20 bg-slate-900/70 p-4";
        }
    }
}

function resetWalletActionModalDOM() {
    // Reset forms
    walletElements.depositForm?.reset();
    walletElements.withdrawalForm?.reset();
    walletElements.unifiedTransferForm?.reset();
    walletElements.internalTransferForm?.reset();
    const recDetails = document.getElementById("walletInternalTransferRecipientDetails");
    if (recDetails) recDetails.classList.add("hidden");

    const headerIcon = document.getElementById("txModalHeaderIcon");
    if (headerIcon) {
        headerIcon.classList.add("hidden");
        headerIcon.classList.remove("flex");
    }

    // Reset internal transfer tabs to default (Receive)
    const btnReceive = document.getElementById("txItTabBtnReceive");
    const btnSend = document.getElementById("txItTabBtnSend");
    const contentReceive = document.getElementById("txItTabContentReceive");
    const contentSend = document.getElementById("txItTabContentSend");
    if (btnReceive && btnSend && contentReceive && contentSend) {
        contentReceive.classList.remove("hidden");
        contentSend.classList.add("hidden");
        btnReceive.className = "flex-1 rounded-xl py-2.5 text-xs font-black transition-all bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
        btnSend.className = "flex-1 rounded-xl py-2.5 text-xs font-black transition-all text-slate-400 hover:text-slate-200";
    }

    // Stop camera scanner if running
    if (typeof stopCameraScanner === "function") {
        stopCameraScanner();
    }

    // Clear balances display
    if (walletElements.modalTradingBalance) walletElements.modalTradingBalance.textContent = "--";
    if (walletElements.modalMainBalance) walletElements.modalMainBalance.textContent = "--";
    if (walletElements.modalPnl) {
        walletElements.modalPnl.textContent = "--";
        walletElements.modalPnl.className = "mt-1 text-sm font-black text-slate-300";
    }

    // Reset stats card grid styling
    const tradingCol = document.getElementById("walletModalTradingCol");
    const pnlCol = document.getElementById("walletModalPnlCol");
    const modalStatsGrid = document.getElementById("walletModalStatsGrid");
    if (tradingCol) tradingCol.classList.remove("hidden");
    if (pnlCol) pnlCol.classList.remove("hidden");
    if (modalStatsGrid) {
        modalStatsGrid.className = "hidden mb-5 grid grid-cols-3 gap-3 rounded-2xl border border-white/20 bg-slate-900/70 p-4";
        modalStatsGrid.classList.add("hidden");
    }

    // Clear deposit inputs & addresses
    if (walletElements.cryptoDepositAddress) walletElements.cryptoDepositAddress.textContent = "--";
    if (walletElements.cryptoAddressStatus) walletElements.cryptoAddressStatus.textContent = "Loading address...";
    if (walletElements.depositAmount) {
        walletElements.depositAmount.value = "";
        walletElements.depositAmount.placeholder = "Loading...";
    }
    const boxLabel = document.getElementById("cryptoAddressBoxLabel");
    if (boxLabel) boxLabel.textContent = "Loading...";

    const pretitle = document.getElementById("txModalHeaderPretitle");
    if (pretitle) pretitle.classList.remove("hidden");

    const modalContainer = document.getElementById("walletActionModalCard");
    if (modalContainer) {
        modalContainer.classList.remove("max-w-[430px]", "max-w-[500px]");
        modalContainer.classList.add("max-w-[640px]");
    }

    clearWalletActionMessage();
}

const TX_SVG_WALLET = `<svg class="w-5 h-5 text-[#818cf8]" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"></path><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>`;
const TX_SVG_TRADING = `<svg class="w-5 h-5 text-[#34d399]" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"></path><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>`;

function txCloseAllTransferDropdowns() {
    document.querySelectorAll("#walletTransferForm .tx-custom-dropdown-menu").forEach(menu => {
        menu.classList.remove("is-open");
    });
    document.querySelectorAll("#walletTransferForm .tx-dropdown-chevron-icon").forEach(chev => {
        chev.classList.remove("is-active");
    });
}

function txPopulateAssetDropdown() {
    const assetSelect = document.getElementById("walletTransferAsset");
    const menu = document.getElementById("txCustomAssetDropdownMenu");
    const badge = document.getElementById("txTransferAssetIconBadge");
    const textEl = document.getElementById("txTransferAssetSelectedText");

    if (!assetSelect || !menu) return;

    const val = assetSelect.value || "USD";
    const assets = [
        { id: "USD", name: "USD - USD Fiat", symbol: "$", bg: "bg-[#10b981]", text: "text-slate-950" },
        { id: "USDT", name: "USDT - Tether USD", symbol: "₮", bg: "bg-[#22d3ee]", text: "text-slate-950" },
        { id: "INR", name: "INR - Indian Rupee", symbol: "₹", bg: "bg-[#f59e0b]", text: "text-slate-950" }
    ];

    const currentAsset = assets.find(a => a.id === val) || assets[0];

    if (badge) {
        badge.textContent = currentAsset.symbol;
        badge.className = `h-7 w-7 shrink-0 rounded-full ${currentAsset.bg} ${currentAsset.text} font-black text-xs flex items-center justify-center shadow-sm transition-all`;
    }
    if (textEl) {
        textEl.textContent = currentAsset.name;
    }

    let menuHTML = "";
    assets.forEach(a => {
        const isSel = a.id === val;
        menuHTML += `
            <div class="tx-custom-dropdown-item ${isSel ? "is-selected" : ""}" data-asset-id="${a.id}">
                <div class="flex items-center gap-2.5">
                    <div class="h-5 w-5 rounded-full ${a.bg} ${a.text} font-black text-[10px] flex items-center justify-center shadow-sm">
                        ${a.symbol}
                    </div>
                    <span>${a.name}</span>
                </div>
                <svg class="tx-custom-dropdown-item-check w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
            </div>
        `;
    });
    menu.innerHTML = menuHTML;

    menu.querySelectorAll(".tx-custom-dropdown-item").forEach(item => {
        item.onclick = function(e) {
            e.stopPropagation();
            const assetId = this.getAttribute("data-asset-id");
            if (assetSelect) {
                assetSelect.value = assetId;
                assetSelect.dispatchEvent(new Event("change"));
            }
            txCloseAllTransferDropdowns();
        };
    });
}

async function txRefreshTransferSubAccounts() {
    if (typeof isLoggedIn === "function" && !isLoggedIn()) return;
    try {
        const response = await apiRequest("/user/sub-accounts");
        if (response && response.data) {
            txSubAccountsLocalCache = response.data;
            if (typeof window !== "undefined") {
                window.txSubAccountsLocalCache = response.data;
            }
            txPopulateTradingAccountSelect();
            txUpdateTransferModalUI();
        }
    } catch (e) {
        console.warn("Failed to refresh transfer sub-accounts:", e);
    }
}

function txPopulateTradingAccountSelect(preSelectedAccId = null) {
    const select = document.getElementById("txTransferTradingAccountSelect");
    const cache = (typeof txSubAccountsLocalCache !== "undefined" && txSubAccountsLocalCache && txSubAccountsLocalCache.length > 0)
        ? txSubAccountsLocalCache
        : ((typeof window !== "undefined" && window.txSubAccountsLocalCache && window.txSubAccountsLocalCache.length > 0) ? window.txSubAccountsLocalCache : []);
    const activeSubId = preSelectedAccId || localStorage.getItem("traidiumx_active_user_id");

    let options = [{ id: "main", name: "Main Trading Account" }];
    if (Array.isArray(cache) && cache.length > 0) {
        cache.forEach(sub => {
            if (!sub.is_parent) {
                const subId = String(sub.id || sub._id || "");
                if (subId && !options.some(o => o.id === subId)) {
                    const isDemo = sub.is_demo || sub.account_mode === "demo" || sub.plan === "demo";
                    const planText = isDemo ? " (Demo)" : (sub.plan_name ? ` (${sub.plan_name})` : " (Real)");
                    options.push({ id: subId, name: `${sub.name || 'Trading Account'}${planText}`, rawName: sub.name || 'Trading Account' });
                }
            }
        });
    }

    if (select) {
        let html = ``;
        options.forEach(opt => {
            html += `<option value="${opt.id}">${opt.name}</option>`;
        });
        select.innerHTML = html;
        if (activeSubId && options.some(o => o.id === String(activeSubId))) {
            select.value = activeSubId;
        } else {
            select.value = "main";
        }
    }

    const selectedVal = select ? select.value : (activeSubId || "main");
    const activeName = (options.find(o => o.id === String(selectedVal)) || options[0]).name;

    const dirInput = document.getElementById("walletTransferDirection");
    const dir = dirInput ? dirInput.value : "main_to_trading";

    const fSub = document.getElementById("txTransferFromSubtitle");
    const tSub = document.getElementById("txTransferToSubtitle");

    if (dir === "main_to_trading") {
        if (fSub) fSub.innerHTML = `<span class="text-xs text-slate-400 font-medium">Main Balance</span>`;
        if (tSub) tSub.innerHTML = `<span class="text-xs text-cyan-300 font-semibold truncate max-w-[170px] inline-block align-bottom">${activeName}</span>`;
    } else {
        if (fSub) fSub.innerHTML = `<span class="text-xs text-cyan-300 font-semibold truncate max-w-[170px] inline-block align-bottom">${activeName}</span>`;
        if (tSub) tSub.innerHTML = `<span class="text-xs text-slate-400 font-medium">Main Balance</span>`;
    }

    const activeMenuId = dir === "main_to_trading" ? "txToTradingAccountDropdownMenu" : "txFromTradingAccountDropdownMenu";
    const activeMenu = document.getElementById(activeMenuId);
    
    const inactiveMenuId = dir === "main_to_trading" ? "txFromTradingAccountDropdownMenu" : "txToTradingAccountDropdownMenu";
    const inactiveMenu = document.getElementById(inactiveMenuId);
    if (inactiveMenu) inactiveMenu.innerHTML = "";

    if (activeMenu) {
        let menuHTML = "";
        options.forEach(opt => {
            const isSel = opt.id === String(selectedVal);
            menuHTML += `
                <div class="tx-custom-dropdown-item ${isSel ? "is-selected" : ""}" data-account-id="${opt.id}">
                    <div class="flex items-center gap-2 min-w-0">
                        <svg class="w-4 h-4 shrink-0 ${isSel ? "text-cyan-400" : "text-slate-400"}" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"></path><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>
                        <span class="truncate">${opt.name}</span>
                    </div>
                    <svg class="tx-custom-dropdown-item-check w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
                </div>
            `;
        });
        activeMenu.innerHTML = menuHTML;

        activeMenu.querySelectorAll(".tx-custom-dropdown-item").forEach(item => {
            item.onclick = function(e) {
                e.stopPropagation();
                const accId = this.getAttribute("data-account-id");
                if (accId === "main") {
                    localStorage.removeItem("traidiumx_active_user_id");
                } else {
                    localStorage.setItem("traidiumx_active_user_id", accId);
                }

                if (select) select.value = accId;

                const mainSelector = document.getElementById("tradingAccountSelector");
                if (mainSelector) mainSelector.value = accId;

                const overviewSelector = document.getElementById("txWalletAccountSelector");
                if (overviewSelector) overviewSelector.value = accId;

                txCloseAllTransferDropdowns();
                txPopulateTradingAccountSelect();
                txUpdateTransferModalUI();
            };
        });
    }
}

function txUpdateTransferModalUI() {
    const modalStatsGrid = document.getElementById("walletModalStatsGrid");
    if (modalStatsGrid) modalStatsGrid.classList.add("hidden");

    const dirInput = document.getElementById("walletTransferDirection");
    const dir = dirInput ? dirInput.value : "main_to_trading";

    const assetSelect = document.getElementById("walletTransferAsset");
    const asset = (assetSelect ? assetSelect.value : (localStorage.getItem("tx_navbar_currency") || "USDT")).toUpperCase();
    const isModalInr = (asset === "INR");

    const currencyLabel = document.getElementById("txTransferCurrencyLabel");
    if (currencyLabel) currencyLabel.textContent = asset;

    const activeSubId = localStorage.getItem("traidiumx_active_user_id");

    const wallet = WALLET_STATE.wallet || {};
    const mainAvail = isModalInr
        ? walletNumber(wallet.main_wallet_inr?.available_balance, 0)
        : walletNumber(wallet.main_wallet_usdt?.available_balance ?? wallet.main_wallet?.available_balance, 0);

    const cache = (typeof txSubAccountsLocalCache !== "undefined" ? txSubAccountsLocalCache : []) || [];
    const activeAccountEntry = !activeSubId 
        ? cache.find(s => s.is_parent) 
        : cache.find(s => s.id === activeSubId);

    let tradingAvail = 0;
    if (isModalInr) {
        const tradingWalletInr = wallet.trading_wallet_inr || {};
        if (!activeSubId || activeSubId === "main") {
            tradingAvail = walletNumber(tradingWalletInr.available_balance, 0);
        } else {
            tradingAvail = activeAccountEntry && activeAccountEntry.wallet && activeAccountEntry.wallet.trading_wallet_inr
                ? walletNumber(activeAccountEntry.wallet.trading_wallet_inr.available_balance, 0)
                : 0;
        }
    } else {
        const tradingWalletUsdt = wallet.trading_wallet_usdt || wallet.trading_wallet || {};
        if (!activeSubId || activeSubId === "main") {
            tradingAvail = walletNumber(tradingWalletUsdt.available_balance ?? wallet.available_balance, 0);
        } else {
            tradingAvail = activeAccountEntry && activeAccountEntry.wallet && (activeAccountEntry.wallet.trading_wallet_usdt || activeAccountEntry.wallet)
                ? walletNumber(activeAccountEntry.wallet.trading_wallet_usdt?.available_balance ?? activeAccountEntry.wallet.available_balance, 0)
                : 0;
        }
    }

    let fromAvailVal = 0;
    let toAvailVal = 0;

    const fCard = document.getElementById("txTransferFromCard");
    const fTitle = document.getElementById("txTransferFromTitle");
    const fSub = document.getElementById("txTransferFromSubtitle");
    const fIcon = document.getElementById("txTransferFromIcon");
    const fChevron = document.getElementById("txTransferFromChevron");

    const tCard = document.getElementById("txTransferToCard");
    const tTitle = document.getElementById("txTransferToTitle");
    const tSub = document.getElementById("txTransferToSubtitle");
    const tIcon = document.getElementById("txTransferToIcon");
    const tChevron = document.getElementById("txTransferToChevron");

    if (dir === "main_to_trading") {
        fromAvailVal = mainAvail;
        toAvailVal = tradingAvail;

        if (fTitle) fTitle.textContent = "Funding Wallet";
        if (fIcon) {
            fIcon.innerHTML = TX_SVG_WALLET;
            fIcon.className = "h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-br from-[#6366f1]/20 to-[#4f46e5]/40 border border-[#6366f1]/40 flex items-center justify-center shadow-sm";
        }
        if (fChevron) fChevron.classList.add("hidden");
        if (fCard) fCard.classList.remove("cursor-pointer", "hover:border-cyan-400/60");

        if (tTitle) tTitle.textContent = "Trading Account";
        if (tIcon) {
            tIcon.innerHTML = TX_SVG_TRADING;
            tIcon.className = "h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-br from-[#10b981]/20 to-[#059669]/40 border border-[#10b981]/40 flex items-center justify-center shadow-sm";
        }
        if (tChevron) tChevron.classList.remove("hidden");
        if (tCard) tCard.classList.add("cursor-pointer", "hover:border-cyan-400/60");
    } else {
        fromAvailVal = tradingAvail;
        toAvailVal = mainAvail;

        if (fTitle) fTitle.textContent = "Trading Account";
        if (fIcon) {
            fIcon.innerHTML = TX_SVG_TRADING;
            fIcon.className = "h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-br from-[#10b981]/20 to-[#059669]/40 border border-[#10b981]/40 flex items-center justify-center shadow-sm";
        }
        if (fChevron) fChevron.classList.remove("hidden");
        if (fCard) fCard.classList.add("cursor-pointer", "hover:border-cyan-400/60");

        if (tTitle) tTitle.textContent = "Funding Wallet";
        if (tIcon) {
            tIcon.innerHTML = TX_SVG_WALLET;
            tIcon.className = "h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-br from-[#6366f1]/20 to-[#4f46e5]/40 border border-[#6366f1]/40 flex items-center justify-center shadow-sm";
        }
        if (tChevron) tChevron.classList.add("hidden");
        if (tCard) tCard.classList.remove("cursor-pointer", "hover:border-cyan-400/60");
    }

    const sym = asset === "INR" ? "₹" : "$";
    const fromAvailEl = document.getElementById("txTransferFromAvailable");
    if (fromAvailEl) fromAvailEl.textContent = `${sym}${fromAvailVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const toAvailEl = document.getElementById("txTransferToAvailable");
    if (toAvailEl) toAvailEl.textContent = `${sym}${toAvailVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const maxTextEl = document.getElementById("txTransferMaxText");
    if (maxTextEl) maxTextEl.textContent = `${sym}${fromAvailVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const rateValEl = document.getElementById("txTransferRateVal");
    if (rateValEl) {
        if (asset === "INR") {
            rateValEl.textContent = `1 USDT = ₹${rate.toFixed(2)} INR`;
        } else {
            rateValEl.textContent = `1 ${asset} = 1 ${asset}`;
        }
    }

    window.txCurrentTransferMaxAvail = fromAvailVal;
    txPopulateTradingAccountSelect();
    txPopulateAssetDropdown();
    txUpdateTransferAmountPreview();
}

function txUpdateTransferAmountPreview() {
    const amountInput = document.getElementById("walletTransferAmount");
    const amountVal = parseFloat(amountInput ? amountInput.value : 0) || 0;
    const assetSelect = document.getElementById("walletTransferAsset");
    const asset = assetSelect ? assetSelect.value : "USD";
    const previewEl = document.getElementById("transferConversionPreview");
    
    if (!previewEl) return;
    if (amountVal <= 0) {
        previewEl.textContent = `≈ ${asset === "INR" ? "₹0.00 INR" : "$0.00 USD"}`;
        return;
    }

    const wallet = WALLET_STATE.wallet || {};
    const rate = walletNumber(wallet.usdt_inr_rate || localStorage.getItem("tx_usdt_inr_rate") || 88.50, 88.50);

    if (asset === "INR") {
        const usdVal = amountVal / rate;
        previewEl.textContent = `≈ ₹${amountVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR (${usdVal.toFixed(2)} USD)`;
    } else {
        previewEl.textContent = `≈ $${amountVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    }
}

function txInitTransferModalListeners() {
    const swapBtn = document.getElementById("txTransferSwapDirBtn");
    if (swapBtn) {
        swapBtn.onclick = function() {
            txCloseAllTransferDropdowns();
            const dirInput = document.getElementById("walletTransferDirection");
            if (dirInput) {
                dirInput.value = dirInput.value === "main_to_trading" ? "trading_to_main" : "main_to_trading";
                txUpdateTransferModalUI();
            }
        };
    }

    const fromCard = document.getElementById("txTransferFromCard");
    const toCard = document.getElementById("txTransferToCard");

    if (fromCard) {
        fromCard.onclick = function(e) {
            const dirInput = document.getElementById("walletTransferDirection");
            const dir = dirInput ? dirInput.value : "main_to_trading";
            if (dir === "trading_to_main") {
                e.stopPropagation();
                const menu = document.getElementById("txFromTradingAccountDropdownMenu");
                const chev = document.getElementById("txTransferFromChevron");
                const isOpen = menu ? menu.classList.contains("is-open") : false;
                txCloseAllTransferDropdowns();
                if (!isOpen && menu) {
                    menu.classList.add("is-open");
                    if (chev) chev.classList.add("is-active");
                }
            }
        };
    }

    if (toCard) {
        toCard.onclick = function(e) {
            const dirInput = document.getElementById("walletTransferDirection");
            const dir = dirInput ? dirInput.value : "main_to_trading";
            if (dir === "main_to_trading") {
                e.stopPropagation();
                const menu = document.getElementById("txToTradingAccountDropdownMenu");
                const chev = document.getElementById("txTransferToChevron");
                const isOpen = menu ? menu.classList.contains("is-open") : false;
                txCloseAllTransferDropdowns();
                if (!isOpen && menu) {
                    menu.classList.add("is-open");
                    if (chev) chev.classList.add("is-active");
                }
            }
        };
    }

    const assetBox = document.getElementById("txTransferAssetBox");
    if (assetBox) {
        assetBox.onclick = function(e) {
            e.stopPropagation();
            const menu = document.getElementById("txCustomAssetDropdownMenu");
            const chev = document.getElementById("txTransferAssetChevron");
            const isOpen = menu ? menu.classList.contains("is-open") : false;
            txCloseAllTransferDropdowns();
            if (!isOpen && menu) {
                menu.classList.add("is-open");
                if (chev) chev.classList.add("is-active");
            }
        };
    }

    if (!window.txTransferClickOutsideBound) {
        window.txTransferClickOutsideBound = true;
        document.addEventListener("click", function(e) {
            if (!e.target.closest("#walletTransferForm")) {
                txCloseAllTransferDropdowns();
            } else if (!e.target.closest(".tx-transfer-box")) {
                txCloseAllTransferDropdowns();
            }
        });
    }

    const assetSelect = document.getElementById("walletTransferAsset");
    if (assetSelect) {
        assetSelect.onchange = function() {
            txUpdateTransferModalUI();
        };
    }

    const maxBtn = document.getElementById("txTransferMaxBtn");
    if (maxBtn) {
        maxBtn.onclick = function() {
            const amountInput = document.getElementById("walletTransferAmount");
            if (amountInput && typeof window.txCurrentTransferMaxAvail !== "undefined") {
                amountInput.value = window.txCurrentTransferMaxAvail;
                txUpdateTransferAmountPreview();
            }
        };
    }

    const pctBtns = document.querySelectorAll(".tx-pct-btn");
    pctBtns.forEach(btn => {
        btn.onclick = function() {
            const pct = parseFloat(btn.getAttribute("data-tx-pct")) || 0;
            const amountInput = document.getElementById("walletTransferAmount");
            if (amountInput && typeof window.txCurrentTransferMaxAvail !== "undefined") {
                const calculated = (window.txCurrentTransferMaxAvail * pct / 100);
                amountInput.value = calculated > 0 ? (calculated < 1 ? calculated.toFixed(4) : calculated.toFixed(2)) : "";
                txUpdateTransferAmountPreview();
            }
        };
    });

    const amountInput = document.getElementById("walletTransferAmount");
    if (amountInput) {
        amountInput.oninput = function() {
            txUpdateTransferAmountPreview();
        };
    }
}

function openWalletActionModal(action = "deposit", selectedAsset = null, preSelectedAccId = null) {
    if (String(action).toLowerCase() === "deposit") {
        if (typeof window.txOpenDepositChoiceModal === "function") {
            window.txOpenDepositChoiceModal();
            return;
        }
        if (typeof window.txActivateDepositTab === "function") {
            window.txActivateDepositTab("crypto");
            return;
        }
        if (typeof txSwitchNexusSubTab === "function") {
            txSwitchNexusSubTab("deposit");
            return;
        }
        return;
    }

    if (String(action).toLowerCase() === "withdraw") {
        if (typeof txActivateWithdrawTab === "function") {
            txActivateWithdrawTab("crypto");
            return;
        }
    }

    if (!walletElements.actionModal) return;

    resetWalletActionModalDOM();

    if (!isLoggedIn()) {
        showWalletAlert("Please login first.", "error");
        return;
    }

    const target = ["transfer", "deposit", "withdraw", "exchange", "internal_transfer"].includes(String(action).toLowerCase())
        ? String(action).toLowerCase()
        : "deposit";

    WALLET_STATE.activeAction = target;
    const titleMap = {
        transfer: "Transfer",
        deposit: "Deposit to Main Wallet",
        withdraw: "Withdraw from Main Wallet",
        exchange: "Exchange Main Wallet Crypto",
        internal_transfer: "Internal Money Transfer"
    };
    const subtitleMap = {
        transfer: "Move funds between your Funding Wallet and Trading Account.",
        deposit: "Send USDT to your wallet address. Make sure to use the correct network and copy the address exactly.",
        withdraw: "Submit your external wallet address. Admin approval completes payout.",
        exchange: "Exchange crypto coins in your Main Wallet at live market rates.",
        internal_transfer: "Send money instantly to another TraidiumX user off-chain."
    };

    if (walletElements.actionModalTitle) walletElements.actionModalTitle.textContent = titleMap[target];
    if (walletElements.actionModalSubtitle) walletElements.actionModalSubtitle.textContent = subtitleMap[target];

    walletElements.actionPanels.forEach((panel) => {
        panel.classList.toggle("hidden", panel.getAttribute("data-wallet-action-panel") !== target);
    });

    clearWalletActionMessage();
    updateWalletActionModalBalances();
    const modalEl = walletElements.actionModal || document.getElementById("walletActionModal");
    if (modalEl) {
        modalEl.classList.remove("hidden");
        modalEl.classList.add("flex");
        modalEl.style.removeProperty("display");
        modalEl.setAttribute("aria-hidden", "false");
    }

    if (target === "transfer") {
        const pretitle = document.getElementById("txModalHeaderPretitle");
        if (pretitle) pretitle.classList.add("hidden");

        const modalContainer = document.getElementById("walletActionModalCard");
        if (modalContainer) {
            modalContainer.style.maxWidth = "440px";
        }

        const headerIcon = document.getElementById("txModalHeaderIcon");
        if (headerIcon) {
            headerIcon.textContent = "⇆";
            headerIcon.classList.remove("hidden");
            headerIcon.classList.add("flex");
            headerIcon.className = "tx-transfer-header-icon h-10 w-10 shrink-0 rounded-2xl bg-cyan-400 text-slate-950 flex items-center justify-center font-bold text-lg select-none shadow-lg shadow-cyan-400/25";
        }
        
        const statsGrid = document.getElementById("walletModalStatsGrid");
        if (statsGrid) statsGrid.classList.add("hidden");

        const assetSelect = document.getElementById("walletTransferAsset");
        if (assetSelect) {
            if (selectedAsset) {
                assetSelect.value = selectedAsset.toUpperCase();
            } else {
                const activeCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
                assetSelect.value = (activeCurrency === "INR" ? "INR" : "USD");
            }
        }
        if (typeof txPopulateAssetDropdown === "function") {
            txPopulateAssetDropdown();
        }

        txPopulateTradingAccountSelect(preSelectedAccId);
        txUpdateTransferModalUI();
        txInitTransferModalListeners();
        if (typeof txRefreshTransferSubAccounts === "function") {
            txRefreshTransferSubAccounts();
        }
    }

    if (target === "deposit") {
        const modalContainer = document.getElementById("walletActionModalCard");
        if (modalContainer) {
            modalContainer.style.maxWidth = "640px";
        }

        const pretitle = document.getElementById("txModalHeaderPretitle");
        if (pretitle) {
            pretitle.textContent = "WALLET";
            pretitle.className = "mb-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#2fe8b7]";
            pretitle.classList.remove("hidden");
        }

        const headerIcon = document.getElementById("txModalHeaderIcon");
        if (headerIcon) {
            headerIcon.innerHTML = `<svg class="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5zm0 0h-4a2 2 0 00-2 2v0a2 2 0 002 2h4"/></svg>`;
            headerIcon.classList.remove("hidden");
            headerIcon.classList.add("flex");
            headerIcon.className = "h-11 w-11 shrink-0 rounded-2xl bg-[#0e2736] border border-[#144654] text-cyan-400 flex items-center justify-center font-bold select-none shadow-lg shadow-[#0e2736]/50";
        }

        const statsGrid = document.getElementById("walletModalStatsGrid");
        if (statsGrid) statsGrid.classList.add("hidden");

        const cur = String(selectedAsset || WALLET_STATE.activeDepositCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
        WALLET_STATE.activeDepositCurrency = cur;
        updateDepositModalUIByCurrency(cur);
        loadCryptoDepositAddresses();
    }
    if (target === "withdraw") {
        const modalContainer = document.getElementById("walletActionModalCard");
        const cur = String(selectedAsset || WALLET_STATE.activeWithdrawalCurrency || localStorage.getItem("tx_navbar_currency") || "INR").toUpperCase();
        WALLET_STATE.activeWithdrawalCurrency = cur;

        if (modalContainer) {
            if (cur === "INR") {
                modalContainer.classList.add("tx-inr-modal-mode");
                modalContainer.style.setProperty("max-width", "860px", "important");
                modalContainer.style.setProperty("width", "95vw", "important");
            } else {
                modalContainer.classList.remove("tx-inr-modal-mode");
                modalContainer.style.setProperty("max-width", "520px", "important");
            }
            modalContainer.scrollTop = 0;
            setTimeout(() => { modalContainer.scrollTop = 0; }, 30);
        }

        const pretitle = document.getElementById("txModalHeaderPretitle");
        if (pretitle) {
            if (cur === "INR") {
                pretitle.classList.add("hidden");
            } else {
                pretitle.textContent = "WALLET QUICK ACTION";
                pretitle.className = "mb-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#2fe8b7]";
                pretitle.classList.remove("hidden");
            }
        }

        const statsGrid = document.getElementById("walletModalStatsGrid");
        if (statsGrid) statsGrid.classList.add("hidden");

        txFetchFeeStructure().then(() => {
            updateWithdrawalModalUIByCurrency(cur, true);
            const m = document.getElementById("walletActionModalCard");
            if (m) {
                m.scrollTop = 0;
                setTimeout(() => { m.scrollTop = 0; }, 30);
            }
        });
        updateWithdrawalModalUIByCurrency(cur, true);
        txInitUsdWithdrawModalInteractive();
        txInitInrWithdrawModalInteractive();
        if (modalContainer) {
            modalContainer.scrollTop = 0;
            setTimeout(() => { modalContainer.scrollTop = 0; }, 50);
        }
    }
    if (target === "exchange") {
        const modalContainer = document.getElementById("walletActionModalCard");
        if (modalContainer) {
            modalContainer.style.maxWidth = "440px";
        }
        const statsGrid = document.getElementById("walletModalStatsGrid");
        if (statsGrid) statsGrid.classList.add("hidden");

        if (selectedAsset) {
            const fromSelect = document.getElementById("walletExchangeFromAsset");
            if (fromSelect) {
                fromSelect.value = selectedAsset;
            }
            // Auto select a different asset for To Select if they match
            const toSelect = document.getElementById("walletExchangeToAsset");
            if (toSelect && toSelect.value === selectedAsset) {
                toSelect.value = selectedAsset === "USDT" ? "ETH" : "USDT";
            }
        }
        updateExchangePreview();
        updateWalletActionModalBalances();

        if (WALLET_STATE.exchangeIntervalId) {
            clearInterval(WALLET_STATE.exchangeIntervalId);
        }
        WALLET_STATE.exchangeIntervalId = setInterval(() => {
            if (WALLET_STATE.activeAction === "exchange") {
                updateExchangePreview(true);
            } else {
                if (WALLET_STATE.exchangeIntervalId) {
                    clearInterval(WALLET_STATE.exchangeIntervalId);
                    WALLET_STATE.exchangeIntervalId = null;
                }
            }
        }, 5000);
    }
    if (target === "internal_transfer") {
        const asset = selectedAsset || "USDT";
        const assetSelect = document.getElementById("walletInternalTransferAsset");
        if (assetSelect) {
            assetSelect.value = asset;
        }

        // Set dynamic header title, subtitle, and icon circle
        if (walletElements.actionModalTitle) {
            walletElements.actionModalTitle.textContent = `Internal Transfer — ${asset}`;
        }
        if (walletElements.actionModalSubtitle) {
            walletElements.actionModalSubtitle.textContent = `User to User (${asset}) • 0% Fee`;
        }
        const headerIcon = document.getElementById("txModalHeaderIcon");
        if (headerIcon) {
            headerIcon.textContent = asset.charAt(0);
            headerIcon.classList.remove("hidden");
            headerIcon.classList.add("flex");
        }

        updateInternalTransferBalance();
        updateWalletActionModalBalances();
    }
}

function closeWalletActionModal() {
    const modalEl = walletElements.actionModal || document.getElementById("walletActionModal");
    if (modalEl) {
        modalEl.classList.add("hidden");
        modalEl.classList.remove("flex");
        modalEl.style.setProperty("display", "none", "important");
        modalEl.setAttribute("aria-hidden", "true");
    }
    WALLET_STATE.activeAction = "";
    clearWalletActionMessage();

    if (WALLET_STATE.exchangeIntervalId) {
        clearInterval(WALLET_STATE.exchangeIntervalId);
        WALLET_STATE.exchangeIntervalId = null;
    }
}

function walletSetButtonLoading(button, loading, text = "Processing...") {
    if (!button) return;
    if (loading) {
        if (!button.dataset.originalHtml) {
            button.dataset.originalHtml = button.innerHTML;
        }
        button.innerHTML = `<span>${text}</span>`;
        button.setAttribute("disabled", "disabled");
        button.classList.add("opacity-60", "cursor-not-allowed");
        return;
    }
    if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
    } else {
        button.innerHTML = `<span>Confirm Transfer</span>`;
    }
    button.removeAttribute("disabled");
    button.classList.remove("opacity-60", "cursor-not-allowed");
}

function getHistoryState(type) {
    return WALLET_STATE.history[type] || { search: "", status: "all", page: 1, pageSize: 5 };
}

function historyText(value) {
    return String(value ?? "").toLowerCase();
}

function rowContainsSearch(row, search, fields) {
    const clean = historyText(search).trim();
    if (!clean) return true;
    return fields.some((field) => historyText(row?.[field]).includes(clean));
}


function extractReferenceFromText(text, prefix) {
    const safePrefix = String(prefix || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${safePrefix}-[A-Z0-9]+`, "i");
    const match = String(text || "").match(pattern);
    return match ? match[0].toUpperCase() : "";
}

function getExplorerLink(url, label = "Explorer") {
    const cleanUrl = String(url || "").trim();
    const cleanLabel = walletEscape(label || "Explorer");

    if (!cleanUrl) {
        return "--";
    }

    const isSafeExplorerUrl = /^https?:\/\//i.test(cleanUrl);
    if (!isSafeExplorerUrl) {
        return walletEscape(cleanUrl);
    }

    return `<a href="${walletEscape(cleanUrl)}" target="_blank" rel="noopener noreferrer" class="font-black text-cyan-300 hover:text-cyan-200">${cleanLabel}</a>`;
}

function recordKeyParts(item = {}, kind = "") {
    const keys = [];
    const push = (value) => {
        const clean = String(value || "").trim().toLowerCase();
        if (clean && !keys.includes(clean)) keys.push(clean);
    };

    push(item.id);
    push(item.reference_id);

    if (kind === "deposits") {
        push(item.deposit_reference);
        push(item.tx_hash);
        push(item.gateway_payment_id);
    }

    if (kind === "withdrawals") {
        push(item.withdrawal_reference);
        push(item.tx_hash);
        push(item.payout_reference);
    }

    return keys;
}

function mergeHistoryRows(primaryRows = [], fallbackRows = [], kind = "") {
    const merged = [];
    const seen = new Set();

    const addRow = (row) => {
        if (!row) return;
        const keys = recordKeyParts(row, kind);
        if (keys.some((key) => seen.has(key))) return;

        keys.forEach((key) => seen.add(key));
        merged.push(row);
    };

    (Array.isArray(primaryRows) ? primaryRows : []).forEach(addRow);
    (Array.isArray(fallbackRows) ? fallbackRows : []).forEach(addRow);

    return merged.sort((a, b) => {
        const dateA = new Date(a?.created_at || 0).getTime();
        const dateB = new Date(b?.created_at || 0).getTime();
        return dateB - dateA;
    });
}

function ledgerLooksLikeDeposit(item = {}) {
    const type = historyText(item.transaction_type || item.type);
    const description = historyText(item.description);
    return type.includes("deposit") || description.includes("deposit credited") || description.includes("deposit");
}

function ledgerLooksLikeWithdrawal(item = {}) {
    const type = historyText(item.transaction_type || item.type);
    const description = historyText(item.description);
    return type.includes("withdrawal") || description.includes("withdrawal");
}

function buildDepositFallbacksFromLedger() {
    return (WALLET_STATE.ledger || [])
        .filter((item) => ledgerLooksLikeDeposit(item))
        .map((item) => {
            const description = String(item.description || "").trim();
            const depositReference = extractReferenceFromText(description, "TXD") || item.reference_id || "Ledger Deposit";
            return {
                id: item.reference_id || item.id || depositReference,
                reference_id: item.reference_id || item.id || "",
                deposit_reference: depositReference,
                amount: walletNumber(item.amount, 0),
                currency: getWalletCurrency(),
                crypto_asset: "USDT",
                crypto_network: item.crypto_network || item.network || "--",
                deposit_address: item.deposit_address || "",
                tx_hash: item.tx_hash || "",
                explorer_url: item.explorer_url || "",
                status: String(item.status || "completed").toLowerCase() === "failed" ? "failed" : "completed",
                verification_status: "verified",
                verification_message: description || "Deposit credited in wallet ledger.",
                remark: description || "Deposit credited in wallet ledger.",
                confirmations: item.confirmations || 0,
                required_confirmations: item.required_confirmations || 0,
                created_at: item.created_at,
                updated_at: item.updated_at || item.created_at,
                __fromLedger: true
            };
        });
}

function getWithdrawalStatusFromLedgerGroup(rows = []) {
    const typeText = rows.map((item) => historyText(item.transaction_type || item.type)).join(" ");
    const descriptionText = rows.map((item) => historyText(item.description)).join(" ");
    const joined = `${typeText} ${descriptionText}`;

    if (joined.includes("reject") || joined.includes("release")) return "rejected";
    if (joined.includes("cancel")) return "cancelled";
    if (joined.includes("completed") || joined.includes("finalized") || joined.includes("approved")) return "approved";
    return "pending_admin_approval";
}

function buildWithdrawalFallbacksFromLedger() {
    const groups = new Map();

    (WALLET_STATE.ledger || [])
        .filter((item) => ledgerLooksLikeWithdrawal(item))
        .forEach((item) => {
            const description = String(item.description || "").trim();
            const withdrawalReference = extractReferenceFromText(description, "TXW") || item.reference_id || "Ledger Withdrawal";
            const key = String(item.reference_id || withdrawalReference || item.id || "").trim();
            if (!key) return;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        });

    return Array.from(groups.entries()).map(([key, rows]) => {
        const ordered = rows.slice().sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());
        const requestRow = ordered.find((item) => historyText(item.transaction_type || item.type).includes("request")) || ordered[ordered.length - 1] || ordered[0];
        const latestRow = ordered[0] || requestRow;
        const description = String(latestRow?.description || requestRow?.description || "").trim();
        const withdrawalReference = extractReferenceFromText(description, "TXW")
            || extractReferenceFromText(String(requestRow?.description || ""), "TXW")
            || key;
        const status = getWithdrawalStatusFromLedgerGroup(rows);
        const lockedAmount = walletNumber(requestRow?.amount ?? latestRow?.amount, 0);

        return {
            id: key,
            reference_id: key,
            withdrawal_reference: withdrawalReference,
            amount: lockedAmount,
            currency: getWalletCurrency(),
            crypto_asset: "USDT",
            crypto_network: requestRow?.crypto_network || latestRow?.crypto_network || "--",
            withdrawal_address: requestRow?.withdrawal_address || latestRow?.withdrawal_address || "--",
            destination_tag: "",
            network_fee: 0,
            withdrawal_fee: 0,
            total_fee: 0,
            final_amount: lockedAmount,
            locked_amount: lockedAmount,
            status,
            processing_mode: "admin_approval",
            remark: description || "Withdrawal recorded in wallet ledger.",
            tx_hash: latestRow?.tx_hash || "",
            explorer_url: latestRow?.explorer_url || "",
            decision_at: status === "pending_admin_approval" ? "" : latestRow?.created_at,
            created_at: requestRow?.created_at || latestRow?.created_at,
            updated_at: latestRow?.updated_at || latestRow?.created_at,
            __fromLedger: true
        };
    });
}

function syncHistoryFromLedgerFallbacks() {
    WALLET_STATE.deposits = mergeHistoryRows(
        WALLET_STATE.deposits || [],
        buildDepositFallbacksFromLedger(),
        "deposits"
    );

    WALLET_STATE.withdrawals = mergeHistoryRows(
        WALLET_STATE.withdrawals || [],
        buildWithdrawalFallbacksFromLedger(),
        "withdrawals"
    );
}

function paginateRows(rows, type) {
    const state = getHistoryState(type);
    const pageSize = Math.max(1, Number(state.pageSize || 5));
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(Math.max(1, Number(state.page || 1)), totalPages);
    state.page = page;
    const start = (page - 1) * pageSize;
    return { rows: rows.slice(start, start + pageSize), totalRows: rows.length, page, totalPages, pageSize };
}


function setWalletStatus(status, type = "loading") {
    if (!walletElements.statusText) {
        return;
    }

    walletElements.statusText.textContent = status;
    walletElements.statusText.className = type === "live"
        ? "mt-2 text-3xl font-black text-emerald-400"
        : type === "error"
            ? "mt-2 text-3xl font-black text-red-400"
            : "mt-2 text-3xl font-black text-orange-300";
}

function isWithdrawalKycRequired(error) {
    const errors = error?.errors || {};
    const message = `${error?.message || ""} ${Object.values(errors).join(" ")}`.toLowerCase();
    return Boolean(
        errors.kyc_required ||
        errors.kyc ||
        message.includes("kyc") ||
        message.includes("identity verification")
    );
}

function checkKycRedirect(error, fallback_message, action = "withdrawal") {
    if (isWithdrawalKycRequired(error)) {
        showWalletActionMessage(`KYC verification is required by admin. <a href="./kyc.html" class="underline font-black text-cyan-300">Click here to complete KYC</a>`, "error");
        return true;
    }
    showWalletActionMessage(getErrorMessage(error, fallback_message), "error");
    return false;
}

function getErrorMessage(error, fallback = "Something went wrong.") {
    if (error?.errors) {
        const firstKey = Object.keys(error.errors)[0];
        const firstValue = firstKey ? error.errors[firstKey] : null;

        if (Array.isArray(firstValue)) {
            return firstValue[0] || fallback;
        }

        if (typeof firstValue === "string") {
            return firstValue;
        }
    }

    if (typeof showApiError === "function") {
        return showApiError(error, fallback);
    }

    return error?.message || fallback;
}

async function getOptionalApi(endpoint, fallbackData = {}) {
    try {
        return await apiRequest(endpoint);
    } catch (error) {
        console.warn(`Optional wallet API failed: ${endpoint}`, error);
        return {
            success: false,
            data: fallbackData,
            message: getErrorMessage(error)
        };
    }
}

function normalizeWalletAccountStatus(value) {
    return String(value || "active").trim().toLowerCase();
}

function isWalletRestrictedMode() {
    const status = normalizeWalletAccountStatus(WALLET_STATE.accountStatus?.account_status);
    return WALLET_STATE.accountStatus?.is_active === false || [
        "blocked",
        "suspended",
        "disabled",
        "deactivated",
        "banned"
    ].includes(status);
}

async function loadWalletAccountStatus() {
    const response = await getOptionalApi("/user/account-status", {
        account_status: "active",
        is_active: true
    });

    WALLET_STATE.accountStatus = response.data || {
        account_status: "active",
        is_active: true
    };

    return WALLET_STATE.accountStatus;
}

function applyRestrictedWalletVisibility() {
    const restricted = isWalletRestrictedMode();

    walletElements.restrictedNotice?.classList.toggle("hidden", !restricted);
    walletElements.balanceCards?.classList.toggle("hidden", restricted);
    walletElements.statsGrid?.classList.toggle("hidden", restricted);
    walletElements.depositPanel?.classList.toggle("hidden", restricted);
    walletElements.transferPanel?.classList.toggle("hidden", restricted);
    walletElements.actionPanel?.classList.toggle("hidden", false);
    walletElements.openTransferBtn?.classList.toggle("hidden", restricted);
    walletElements.openDepositBtn?.classList.toggle("hidden", restricted);
    walletElements.openWithdrawBtn?.classList.toggle("hidden", false);
    walletElements.ledgerPanel?.classList.toggle("hidden", restricted);
    walletElements.depositHistoryPanel?.classList.toggle("hidden", restricted);

    if (restricted) {
        walletElements.demoCreditPanel?.classList.add("hidden");

        if (walletElements.availableBalance) walletElements.availableBalance.textContent = "Hidden";
        if (walletElements.lockedBalance) walletElements.lockedBalance.textContent = "Hidden";
        if (walletElements.totalBalance) walletElements.totalBalance.textContent = "Hidden";
        if (walletElements.openMargin) walletElements.openMargin.textContent = "Hidden";
        if (walletElements.unrealizedPnl) {
            walletElements.unrealizedPnl.textContent = "Hidden";
            walletElements.unrealizedPnl.className = "mt-3 text-3xl font-black text-slate-400";
        }
        if (walletElements.ledgerCount) walletElements.ledgerCount.textContent = "Hidden";
    }
}

async function loadRestrictedWithdrawalOnly() {
    WALLET_STATE.wallet = null;
    WALLET_STATE.ledger = [];
    WALLET_STATE.deposits = [];
    WALLET_STATE.pnlSummary = null;
    WALLET_STATE.positionSummary = null;

    try {
        const [withdrawalResponse, boardRes] = await Promise.all([
            apiRequest("/withdrawal/history"),
            apiRequest("/market/board").catch(() => ({ success: false, data: { board: [] } }))
        ]);
        WALLET_STATE.withdrawals = withdrawalResponse.data?.withdrawals || [];
        WALLET_STATE.board = boardRes.data?.board || [];
    } catch (err) {
        console.error("Failed to load restricted withdrawal details:", err);
    }
    
    notifyWithdrawalStatusChanges(WALLET_STATE.withdrawals);

    renderWalletPage();
    setWalletStatus("Restricted", "error");
    showWalletAlert(
        "Account is restricted, so total wallet amount is hidden. Withdrawal request and withdrawal history are still available.",
        "info"
    );
}

async function refreshWithdrawalHistoryOnly() {
    if (document.hidden || typeof apiRequest !== "function" || typeof isLoggedIn !== "function" || !isLoggedIn()) {
        return;
    }

    try {
        await loadWalletAccountStatus();

        if (!isWalletRestrictedMode()) {
            return;
        }

        const [response, boardRes] = await Promise.all([
            apiRequest("/withdrawal/history"),
            apiRequest("/market/board").catch(() => ({ success: false, data: { board: [] } }))
        ]);
        WALLET_STATE.withdrawals = response.data?.withdrawals || [];
        WALLET_STATE.board = boardRes.data?.board || [];
        notifyWithdrawalStatusChanges(WALLET_STATE.withdrawals);
        applyRestrictedWalletVisibility();
        renderWithdrawalTable();
        setWalletStatus("Restricted", "error");
    } catch (error) {
        console.warn("Restricted withdrawal history sync failed:", error);
    }
}

async function loadWalletEnvironment() {
    const healthResponse = await getOptionalApi("/health", {});
    const healthData = healthResponse.data || {};
    WALLET_STATE.environment = healthData.environment || "unknown";

    const isDevelopment = WALLET_STATE.environment === "development";

    if (walletElements.environmentText) {
        walletElements.environmentText.textContent = isDevelopment
            ? "Development mode: use Transfer / Deposit / Withdraw popups. Deposit uses company-address confirmation; withdrawal still needs admin approval."
            : "Production mode: use Transfer / Deposit / Withdraw popups. Deposits wait for company-wallet/blockchain verification and withdrawals need admin approval.";
    }

    walletElements.demoCreditPanel?.classList.toggle("hidden", !isDevelopment || isWalletRestrictedMode());
}

async function loadCryptoDepositAddresses() {
    const activeSubId = localStorage.getItem("traidiumx_active_user_id");
    const addrUrl = (activeSubId && activeSubId !== "main")
        ? `/deposit/crypto-addresses?sub_account_id=${encodeURIComponent(activeSubId)}`
        : "/deposit/crypto-addresses";

    const response = await getOptionalApi(addrUrl, {
        networks: [],
        min_amount: 10,
        max_amount: 1000000
    });

    WALLET_STATE.cryptoDeposit.networks = response.data?.networks || [];
    WALLET_STATE.cryptoDeposit.btcContractAddress = response.data?.btc_contract_address || "";
    WALLET_STATE.cryptoDeposit.minAmount = Number(response.data?.min_amount || 10);
    WALLET_STATE.cryptoDeposit.maxAmount = Number(response.data?.max_amount || 1000000);
    if (walletElements.depositAmount) {
        const activeCurrency = (WALLET_STATE.activeDepositCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
        if (activeCurrency === "INR") {
            walletElements.depositAmount.min = "100";
            walletElements.depositAmount.placeholder = "Enter deposit amount (Min ₹100)";
        } else {
            walletElements.depositAmount.min = String(WALLET_STATE.cryptoDeposit.minAmount || 10);
            walletElements.depositAmount.placeholder = `Enter amount (Min ${WALLET_STATE.cryptoDeposit.minAmount || 10} ${activeCurrency})`;
        }
        walletElements.depositAmount.max = String(WALLET_STATE.cryptoDeposit.maxAmount || 1000000);
    }
    updateCryptoDepositAddressUI();
}

function getSelectedCryptoNetwork() {
    const activeCurrency = String(WALLET_STATE.activeDepositCurrency || "USDT").toUpperCase();
    if (["USDT", "BTC", "SOL", "XRP", "ADA", "BNB", "TRX", "DOT", "LTC", "AVAX", "ETC", "XLM", "TON", "BCH"].includes(activeCurrency)) {
        return String(walletElements.cryptoNetwork?.value || WALLET_STATE.cryptoDeposit.selectedNetwork || (activeCurrency === "BTC" ? "BITCOIN" : (activeCurrency === "TRX" ? "TRC20" : "ERC20"))).toUpperCase();
    }
    const nativeNetworks = {
        "ETH": "ERC20",
        "USDC": "ERC20",
        "SHIB": "ERC20",
        "LINK": "ERC20",
        "UNI": "ERC20",
        "TRX": "TRC20",
        "DOT": "POLKADOT",
        "LTC": "LITECOIN",
        "AVAX": "AVAX",
        "ETC": "ETC",
        "XLM": "STELLAR",
        "TON": "TON",
        "BCH": "BITCOINCASH"
    };
    return nativeNetworks[activeCurrency] || "ERC20";
}

function getSelectedWithdrawalCryptoNetwork() {
    const isModal = isWalletActionModalOpen();
    const activeCurrency = String(WALLET_STATE.activeWithdrawalCurrency || (isModal ? WALLET_STATE.activeWithdrawalCurrency : localStorage.getItem("tx_navbar_currency")) || "USDT").toUpperCase();
    if (["USDT", "BTC", "SOL", "XRP", "ADA", "BNB", "TRX", "DOT", "LTC", "AVAX", "ETC", "XLM", "TON", "BCH"].includes(activeCurrency)) {
        const prefix = isModal ? "modal" : "main";
        return String(document.getElementById(`${prefix}WithdrawNetwork`)?.value || (activeCurrency === "BTC" ? "BITCOIN" : (activeCurrency === "TRX" ? "TRC20" : "ERC20"))).toUpperCase();
    }
    const nativeNetworks = {
        "ETH": "ERC20",
        "USDC": "ERC20",
        "SHIB": "ERC20",
        "LINK": "ERC20",
        "UNI": "ERC20",
        "TRX": "TRC20",
        "DOT": "POLKADOT",
        "LTC": "LITECOIN",
        "AVAX": "AVAX",
        "ETC": "ETC",
        "XLM": "STELLAR",
        "TON": "TON",
        "BCH": "BITCOINCASH"
    };
    return nativeNetworks[activeCurrency] || "ERC20";
}

function getSelectedCryptoAddressInfo() {
    const selectedNetwork = getSelectedCryptoNetwork();
    const activeCurrency = String(WALLET_STATE.activeDepositCurrency || "USDT").toUpperCase();

    // 1. Find exact match for selected network and selected currency (from database)
    const found = (WALLET_STATE.cryptoDeposit.networks || []).find((item) => {
        return String(item.network || "").toUpperCase() === selectedNetwork && String(item.asset || "").toUpperCase() === activeCurrency;
    });
    if (found) return found;

    // 2. Find coin-specific override address from the loaded map if they select the coin's native network
    const nativeNetworks = {
        "BTC": "BITCOIN",
        "SOL": "SOLANA",
        "XRP": "RIPPLE",
        "ADA": "CARDANO",
        "ETH": "ERC20",
        "USDC": "ERC20",
        "BNB": "BEP20",
        "TRX": "TRC20",
        "DOT": "POLKADOT",
        "LTC": "LITECOIN",
        "AVAX": "AVAX",
        "SHIB": "ERC20",
        "LINK": "ERC20",
        "UNI": "ERC20",
        "ETC": "ETC",
        "XLM": "STELLAR",
        "TON": "TON",
        "BCH": "BITCOINCASH"
    };
    if (selectedNetwork === nativeNetworks[activeCurrency]) {
        const coinOverride = (WALLET_STATE.cryptoDeposit.networks || []).find((item) => {
            return String(item.network || "").toUpperCase() === activeCurrency;
        });
        if (coinOverride && coinOverride.address) return coinOverride;
    }

    // 3. Find generic match for the network (TRC20 / ERC20 / BEP20 etc.)
    const generic = (WALLET_STATE.cryptoDeposit.networks || []).find((item) => {
        return String(item.network || "").toUpperCase() === selectedNetwork;
    });
    if (generic) return generic;

    // 4. Mock fallback addresses
    const mockAddresses = {
        "TRC20": { address: "TQp9K7vY3Wm2N8rF4cL6Xh5A1BzDgE2sRZ", is_configured: true, label: "TRC20 (Tron)" },
        "ERC20": { address: "0x8A4b2C5D7e9F0a1B3c4D6E8F901234567890AbCd", is_configured: true, label: "ERC20 (Ethereum)" },
        "BEP20": { address: "0xB2C7e9F1A4d6E8b0C3f5A7D9e1B234567890cDEF", is_configured: true, label: "BEP20 (Binance Smart Chain)" },
        "BITCOIN": { address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", is_configured: true, label: "BTC Mainnet" },
        "SOLANA": { address: "HN7cAB2133LQV7t3W3x2fGfY1c5f3c5f3c5f3c5f3c5f", is_configured: true, label: "Solana Mainnet" },
        "RIPPLE": { address: "rEb8QCgNs9rkec2QCQKsE2wo9T3p45WstX", is_configured: true, label: "Ripple Mainnet" },
        "CARDANO": { address: "Ae2tdPwUPEYx5g5P7w5UaXfGfM4vXfP5p3d", is_configured: true, label: "Cardano Mainnet" }
    };
    return mockAddresses[selectedNetwork] || mockAddresses[activeCurrency] || null;
}

function updateCryptoDepositAddressUI() {
    const activeCurrency = String(WALLET_STATE.activeDepositCurrency || "USDT").toUpperCase();

    const cryptoNetworkContainer = document.getElementById("cryptoNetworkContainer");
    const cryptoNetworkSelect = document.getElementById("cryptoNetwork");
    const isUSDTOrBTC = ["USDT", "BTC", "BNB", "SOL", "XRP", "ADA"].includes(activeCurrency);

    if (cryptoNetworkContainer) {
        cryptoNetworkContainer.classList.toggle("hidden", !isUSDTOrBTC);
    }

    if (cryptoNetworkSelect) {
        const currentVal = cryptoNetworkSelect.value;
        cryptoNetworkSelect.innerHTML = "";
        
        if (activeCurrency === "USDT") {
            cryptoNetworkSelect.innerHTML = `
                <option value="ERC20">ERC20 (Ethereum)</option>
                <option value="TRC20">TRC20 (Tron)</option>
                <option value="BEP20">BEP20 (Binance)</option>
            `;
            if (["TRC20", "ERC20", "BEP20"].includes(currentVal)) {
                cryptoNetworkSelect.value = currentVal;
            } else if (["TRC20", "ERC20", "BEP20"].includes(WALLET_STATE.cryptoDeposit.selectedNetwork)) {
                cryptoNetworkSelect.value = WALLET_STATE.cryptoDeposit.selectedNetwork;
            } else {
                cryptoNetworkSelect.value = "TRC20";
            }
        } else if (activeCurrency === "BTC") {
            cryptoNetworkSelect.innerHTML = `
                <option value="BITCOIN">BTC Mainnet (Bitcoin)</option>
                <option value="ERC20">BTC ERC20 / Sepolia Token (MetaMask)</option>
            `;
            if (["BITCOIN", "ERC20"].includes(currentVal)) {
                cryptoNetworkSelect.value = currentVal;
            } else if (["BITCOIN", "ERC20"].includes(WALLET_STATE.cryptoDeposit.selectedNetwork)) {
                cryptoNetworkSelect.value = WALLET_STATE.cryptoDeposit.selectedNetwork;
            } else {
                cryptoNetworkSelect.value = "BITCOIN";
            }
        } else if (["SOL", "XRP", "ADA", "BNB"].includes(activeCurrency)) {
            const labelMap = {
                "SOL": { native: "SOLANA", nativeLabel: "SOL Mainnet (Solana)", erc20Label: "SOL ERC20 / Sepolia Token (MetaMask)" },
                "XRP": { native: "RIPPLE", nativeLabel: "XRP Mainnet (Ripple)", erc20Label: "XRP ERC20 / Sepolia Token (MetaMask)" },
                "ADA": { native: "CARDANO", nativeLabel: "ADA Mainnet (Cardano)", erc20Label: "ADA ERC20 / Sepolia Token (MetaMask)" },
                "BNB": { native: "BEP20", nativeLabel: "BNB Mainnet (Binance Smart Chain)", erc20Label: "BNB ERC20 / Sepolia Token (MetaMask)" }
            };
            const coinConfig = labelMap[activeCurrency];
            cryptoNetworkSelect.innerHTML = `
                <option value="${coinConfig.native}">${coinConfig.nativeLabel}</option>
                <option value="ERC20">${coinConfig.erc20Label}</option>
            `;
            if ([coinConfig.native, "ERC20"].includes(currentVal)) {
                cryptoNetworkSelect.value = currentVal;
            } else if ([coinConfig.native, "ERC20"].includes(WALLET_STATE.cryptoDeposit.selectedNetwork)) {
                cryptoNetworkSelect.value = WALLET_STATE.cryptoDeposit.selectedNetwork;
            } else {
                cryptoNetworkSelect.value = coinConfig.native;
            }
        } else {
            const nativeNetworks = {
                "ETH": { value: "ERC20", label: "Ethereum Mainnet (MetaMask)" },
                "USDC": { value: "ERC20", label: "ERC20 / Sepolia Token (MetaMask)" }
            };
            const config = nativeNetworks[activeCurrency] || { value: "ERC20", label: "ERC20 network" };
            cryptoNetworkSelect.innerHTML = `<option value="${config.value}">${activeCurrency} ${config.label}</option>`;
            cryptoNetworkSelect.value = config.value;
        }
    }

    const selectedNetwork = getSelectedCryptoNetwork();
    const addressInfo = getSelectedCryptoAddressInfo();
    const address = String(addressInfo?.address || "").trim();
    const isConfigured = Boolean(addressInfo?.is_configured && address);

    const tabsContainer = document.getElementById("txNetworkTabs");
    if (tabsContainer) {
        tabsContainer.querySelectorAll(".tx-net-tab").forEach((btn) => {
            const netVal = btn.getAttribute("data-network-tab");
            btn.classList.toggle("active", netVal === selectedNetwork);
        });
    }

    const boxLabel = document.getElementById("cryptoAddressBoxLabel");
    if (boxLabel) {
        boxLabel.textContent = `${activeCurrency} • ${selectedNetwork}`;
    }

    const boxBadge = document.getElementById("cryptoAddressBoxBadge");
    if (boxBadge) {
        boxBadge.textContent = selectedNetwork;
    }

    const boxIcon = document.getElementById("cryptoAddressBoxIcon");
    if (boxIcon) {
        const assetIconMap = {
            "USDT": "₮", "BTC": "₿", "ETH": "Ξ", "SOL": "◎", "BNB": "🟡", "XRP": "✕", "ADA": "₳", "INR": "₹"
        };
        boxIcon.textContent = assetIconMap[activeCurrency] || "₮";
    }

    const secAsset = document.getElementById("txDepositSecurityAsset");
    if (secAsset) {
        secAsset.textContent = activeCurrency;
    }

    const secNetwork = document.getElementById("txDepositSecurityNetwork");
    if (secNetwork) {
        secNetwork.textContent = `(${selectedNetwork})`;
    }

    const netIcon = document.getElementById("txDepNetworkIcon");
    if (netIcon) {
        const netIconMap = {
            "ERC20": "Ξ",
            "TRC20": "🆃",
            "BEP20": "🟨",
            "BITCOIN": "₿",
            "SOLANA": "◎",
            "RIPPLE": "✕",
            "CARDANO": "₳"
        };
        netIcon.textContent = netIconMap[selectedNetwork] || "🌐";
    }

    if (walletElements.cryptoDepositAddress) {
        walletElements.cryptoDepositAddress.textContent = address || `${activeCurrency} ${selectedNetwork} company address is not configured.`;
        walletElements.cryptoDepositAddress.className = isConfigured
            ? "font-mono text-xs sm:text-sm font-bold text-white truncate min-w-0"
            : "font-mono text-xs sm:text-sm font-bold text-orange-200 truncate min-w-0";
    }

    if (walletElements.cryptoAddressStatus) {
        walletElements.cryptoAddressStatus.textContent = isConfigured
            ? `This is your ${activeCurrency} (${selectedNetwork}) deposit address.`
            : `Configure ${activeCurrency} ${selectedNetwork} company address.`;

        walletElements.cryptoAddressStatus.className = isConfigured
            ? "mt-2 text-xs font-bold text-emerald-400"
            : "mt-2 text-xs font-bold text-orange-300";
    }

    if (walletElements.depositAddressConfirmation) {
        walletElements.depositAddressConfirmation.value = address;
    }

    if (walletElements.copyCryptoAddressBtn) {
        walletElements.copyCryptoAddressBtn.disabled = !isConfigured;
        walletElements.copyCryptoAddressBtn.classList.toggle("opacity-50", !isConfigured);
        walletElements.copyCryptoAddressBtn.classList.toggle("cursor-not-allowed", !isConfigured);
    }

    if (walletElements.payWithMetaMaskBtn) {
        const showMetaMask = isConfigured && ["ERC20", "BEP20"].includes(selectedNetwork);
        walletElements.payWithMetaMaskBtn.classList.toggle("hidden", !showMetaMask);
    }

    const qrImg = document.getElementById("cryptoDepositQrImg");
    const qrPlaceholder = document.getElementById("cryptoDepositQrPlaceholder");
    const qrContainer = document.getElementById("cryptoDepositQrContainer");

    if (qrContainer) {
        if (isConfigured && address) {
            qrContainer.classList.remove("hidden");
            if (qrImg) {
                qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(address)}`;
                qrImg.classList.remove("hidden");
            }
            if (qrPlaceholder) {
                qrPlaceholder.classList.add("hidden");
            }
        } else {
            if (qrImg) {
                qrImg.src = "";
                qrImg.classList.add("hidden");
            }
            if (qrPlaceholder) {
                qrPlaceholder.textContent = "Address not configured";
                qrPlaceholder.classList.remove("hidden");
            }
        }
    }
}

async function copyCryptoDepositAddress() {
    const addressInfo = getSelectedCryptoAddressInfo();
    const address = String(addressInfo?.address || "").trim();

    if (!address || !addressInfo?.is_configured) {
        showWalletActionMessage("Company deposit address is not configured for this network.", "error");
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
        showWalletActionMessage("Company deposit address copied. Paste the same address in confirmation field.", "success");
    } catch (error) {
        showWalletActionMessage("Unable to copy address. Please copy it manually.", "error");
    }
}

async function loadWalletData(options = {}) {
    const silent = Boolean(options?.silent);

    if (WALLET_STATE.loading) {
        return;
    }

    const requestSeq = ++WALLET_STATE.walletLoadRequestSeq;

    if (typeof apiRequest !== "function" || typeof isLoggedIn !== "function") {
        setWalletStatus("API Error", "error");
        showWalletAlert("api-config.js is not loaded before wallet.js.", "error");
        return;
    }

    if (!isLoggedIn()) {
        setWalletStatus("Locked", "error");
        walletElements.loginRequired?.classList.remove("hidden");
        walletElements.restrictedNotice?.classList.add("hidden");
        return;
    }

    walletElements.loginRequired?.classList.add("hidden");

    try {
        WALLET_STATE.loading = true;

        if (!silent) {
            setWalletStatus("Loading", "loading");
            clearWalletAlert();
        }

        // Parallelize initial API queries to avoid serial network roundtrip overhead
        const accountStatusPromise = WALLET_STATE.accountStatus ? Promise.resolve() : loadWalletAccountStatus();
        const environmentPromise = WALLET_STATE.environment ? Promise.resolve() : loadWalletEnvironment();

        const activeSubId = localStorage.getItem("traidiumx_active_user_id");
        const balanceUrl = (activeSubId && activeSubId !== "main")
            ? `/wallet/balance?sub_account_id=${encodeURIComponent(activeSubId)}`
            : "/wallet/balance";

        const [_, __, balanceRes, boardRes, mt5Res] = await Promise.all([
            accountStatusPromise,
            environmentPromise,
            apiRequest(balanceUrl).catch(err => {
                console.error("Failed to load wallet balance:", err);
                return null;
            }),
            apiRequest("/market/board").catch(err => {
                console.error("Failed to load market board:", err);
                return { success: false, data: { board: [] } };
            }),
            getOptionalApi("/onboarding/mt5/status", {})
        ]);

        if (mt5Res && mt5Res.data) {
            WALLET_STATE.mt5 = mt5Res.data;
        } else if (balanceRes?.data?.mt5) {
            WALLET_STATE.mt5 = balanceRes.data.mt5;
        }

        if (isWalletRestrictedMode()) {
            if (silent) {
                await refreshWithdrawalHistoryOnly();
            } else {
                await loadRestrictedWithdrawalOnly();
            }
            return;
        }

        // Fetch crypto deposit addresses only on the first load
        let depositAddressesPromise = Promise.resolve();
        if (!WALLET_STATE.cryptoDeposit.networks || WALLET_STATE.cryptoDeposit.networks.length === 0) {
            depositAddressesPromise = loadCryptoDepositAddresses().catch(err => {
                console.error("Failed to load crypto deposit addresses:", err);
            });
        }

        if (balanceRes) {
            WALLET_STATE.wallet = balanceRes.data.wallet || balanceRes.data || null;
            if (WALLET_STATE.wallet) {
                saveCachedWalletData(WALLET_STATE.wallet);
            }
            WALLET_STATE.board = boardRes.data?.board || [];
            if (balanceRes.data?.mt5) {
                WALLET_STATE.mt5 = balanceRes.data.mt5;
            }
            renderWalletPage();
            setWalletStatus("Active", "live");
            hideWalletPageIntro({ immediate: true });
        }

        // 2. Fetch other history and optional APIs in the background
        const targetSubId = (WALLET_STATE.selectedSubAccountId !== undefined && WALLET_STATE.selectedSubAccountId !== null)
            ? WALLET_STATE.selectedSubAccountId
            : ((activeSubId && activeSubId !== "main") ? activeSubId : "main");

        let ledgerUrl = `/wallet/ledger?sub_account_id=${encodeURIComponent(targetSubId)}`;
        let depositUrl = `/deposit/history?sub_account_id=${encodeURIComponent(targetSubId)}`;
        let withdrawalUrl = `/withdrawal/history?sub_account_id=${encodeURIComponent(targetSubId)}`;
        let statsUrl = `/wallet/overview-stats?sub_account_id=${encodeURIComponent(targetSubId)}`;

        // Throttle transaction history requests to every 30 seconds during background updates
        const nowTime = Date.now();
        const shouldFetchHistory = !silent || !WALLET_STATE.lastHistoryFetchAt || (nowTime - WALLET_STATE.lastHistoryFetchAt > 30000);

        const historyPromises = [
            shouldFetchHistory ? apiRequest(ledgerUrl) : Promise.resolve(null),
            shouldFetchHistory ? apiRequest(depositUrl) : Promise.resolve(null),
            shouldFetchHistory ? apiRequest(withdrawalUrl) : Promise.resolve(null),
            getOptionalApi("/trading/pnl-summary", {}),
            getOptionalApi("/trading/positions", {}),
            getOptionalApi("/onboarding/mt5/status", {}),
            getOptionalApi(statsUrl, {})
        ];

        Promise.allSettled(historyPromises).then((results) => {
            const [ledgerResult, depositResult, withdrawalResult, pnlResult, positionsResult, mt5Result, statsResult] = results;

            if (shouldFetchHistory) {
                WALLET_STATE.lastHistoryFetchAt = nowTime;
                if (ledgerResult.status === "fulfilled" && ledgerResult.value) {
                    const lVal = ledgerResult.value;
                    const lData = lVal.data;
                    WALLET_STATE.ledger = Array.isArray(lData?.ledger) ? lData.ledger : (Array.isArray(lData) ? lData : (Array.isArray(lVal.ledger) ? lVal.ledger : []));
                }
                if (depositResult.status === "fulfilled" && depositResult.value) {
                    const dVal = depositResult.value;
                    const dData = dVal.data;
                    WALLET_STATE.deposits = Array.isArray(dData?.deposits) ? dData.deposits : (Array.isArray(dData) ? dData : (Array.isArray(dVal.deposits) ? dVal.deposits : []));
                }
                if (withdrawalResult.status === "fulfilled" && withdrawalResult.value) {
                    const wVal = withdrawalResult.value;
                    const wData = wVal.data;
                    WALLET_STATE.withdrawals = Array.isArray(wData?.withdrawals) ? wData.withdrawals : (Array.isArray(wData) ? wData : (Array.isArray(wVal.withdrawals) ? wVal.withdrawals : []));
                    notifyWithdrawalStatusChanges(WALLET_STATE.withdrawals);
                }
                syncHistoryFromLedgerFallbacks();
            }

            if (pnlResult.status === "fulfilled") {
                WALLET_STATE.pnlSummary = pnlResult.value.data || null;
            }
            if (positionsResult.status === "fulfilled") {
                WALLET_STATE.positionSummary = positionsResult.value.data?.summary || null;
            }
            if (mt5Result.status === "fulfilled") {
                WALLET_STATE.mt5 = mt5Result.value.data || null;
            }
            if (statsResult?.status === "fulfilled" && statsResult.value?.data) {
                WALLET_STATE.overviewStats = statsResult.value.data;
            }

            // Re-render to populate history tables
            renderWalletPage();
        }).catch((err) => {
            console.error("Background data load failed:", err);
        });
    } catch (error) {
        console.error("Wallet load failed:", error);

        if (!silent) {
            setWalletStatus("Error", "error");
            showWalletAlert(getErrorMessage(error, "Unable to load wallet data."), "error");
        }
    } finally {
        WALLET_STATE.loading = false;
    }
}

function renderWalletPage() {
    applyRestrictedWalletVisibility();

    if (isWalletRestrictedMode()) {
        renderWithdrawalTable();
        return;
    }

    const wallet = WALLET_STATE.wallet || {};
    const mainWallet = getMainWalletData();
    const tradingWallet = getTradingWalletData();
    const mainCurrency = mainWallet.currency || "USDT";
    const tradingCurrency = "USDT";
    const mainAvailable = walletNumber(mainWallet.available_balance, 0);
    const mainLocked = walletNumber(mainWallet.locked_balance, 0);
    const mainTotal = walletNumber(mainWallet.total_balance, mainAvailable + mainLocked);

    const user = typeof getAuthUser === "function" ? getAuthUser() : null;
    const isMt5 = user && user.selected_platform === "mt5";

    let tradingAvailable = walletNumber(tradingWallet.available_balance, 0);
    let totalMargin = walletNumber(WALLET_STATE.pnlSummary?.total_margin ?? WALLET_STATE.positionSummary?.total_margin, mainLocked);
    let unrealizedPnl = walletNumber(WALLET_STATE.pnlSummary?.total_unrealized_pnl ?? WALLET_STATE.positionSummary?.total_unrealized_pnl, 0);

    if (isMt5) {
        const mt5Account = WALLET_STATE.mt5?.account || {};
        const mt5Curr = mt5Account.account_currency || "USD";
        const mt5Bal = walletNumber(mt5Account.balance, 0);
        const mt5Eq = walletNumber(mt5Account.equity, mt5Bal);

        tradingAvailable = mt5Bal;
        totalMargin = mt5Eq;
        unrealizedPnl = Math.round((mt5Eq - mt5Bal) * 100000000) / 100000000;

        if (walletElements.badgeText) walletElements.badgeText.textContent = "Main wallet + MetaTrader 5";
        if (walletElements.mainTitle) walletElements.mainTitle.textContent = "Wallet flow built for MetaTrader 5 trading.";
        if (walletElements.mainSubtitle) walletElements.mainSubtitle.textContent = "Deposits credit Main Wallet through the company deposit address. MetaTrader 5 uses its own separate trading account. Withdrawals are processed from your Main Wallet.";

        if (walletElements.lockedBalanceLabel) walletElements.lockedBalanceLabel.textContent = "MT5 Account Balance";
        if (walletElements.lockedBalanceNote) walletElements.lockedBalanceNote.textContent = "MetaTrader 5 server balance";

        if (walletElements.openMarginLabel) walletElements.openMarginLabel.textContent = "MT5 Account Equity";
        if (walletElements.openMarginNote) walletElements.openMarginNote.textContent = "MetaTrader 5 server equity";

        if (walletElements.lockedBalance) walletElements.lockedBalance.textContent = formatWalletMoneyPrivate(tradingAvailable, mt5Curr);
        if (walletElements.openMargin) walletElements.openMargin.textContent = formatWalletMoneyPrivate(totalMargin, mt5Curr);

        if (walletElements.unrealizedPnl) {
            walletElements.unrealizedPnl.textContent = `${unrealizedPnl >= 0 ? "+" : ""}${formatWalletMoneyPrivate(unrealizedPnl, mt5Curr)}`;
            walletElements.unrealizedPnl.className = unrealizedPnl >= 0
                ? "mt-3 text-3xl font-black text-emerald-400"
                : "mt-3 text-3xl font-black text-red-400";
        }
    } else {
        if (walletElements.badgeText) walletElements.badgeText.textContent = "Main wallet + Trading wallet";
        if (walletElements.mainTitle) walletElements.mainTitle.textContent = "Wallet flow built for crypto trading.";
        if (walletElements.mainSubtitle) walletElements.mainSubtitle.textContent = "Deposits credit Main Wallet through the company deposit address. Trades use Trading Wallet only. Withdrawals use your external wallet address and complete after admin approval.";

        if (walletElements.lockedBalanceLabel) walletElements.lockedBalanceLabel.textContent = "Trading Wallet";
        if (walletElements.lockedBalanceNote) walletElements.lockedBalanceNote.textContent = "Trades use this balance";

        if (walletElements.openMarginLabel) walletElements.openMarginLabel.textContent = "Trading Locked Margin";
        if (walletElements.openMarginNote) walletElements.openMarginNote.textContent = "Open position margin";

        if (walletElements.lockedBalance) walletElements.lockedBalance.textContent = formatWalletMoneyPrivate(tradingAvailable, tradingCurrency);
        if (walletElements.openMargin) walletElements.openMargin.textContent = formatWalletMoneyPrivate(totalMargin, tradingCurrency);

        if (walletElements.unrealizedPnl) {
            walletElements.unrealizedPnl.textContent = `${unrealizedPnl >= 0 ? "+" : ""}${formatWalletMoneyPrivate(unrealizedPnl, tradingCurrency)}`;
            walletElements.unrealizedPnl.className = unrealizedPnl >= 0
                ? "mt-3 text-3xl font-black text-emerald-400"
                : "mt-3 text-3xl font-black text-red-400";
        }
    }

    if (isMt5) {
        const mt5Account = WALLET_STATE.mt5?.account || {};
        const mt5Curr = mt5Account.account_currency || "USD";
        const mt5Bal = walletNumber(mt5Account.balance, 0);
        if (walletElements.availableBalance) walletElements.availableBalance.textContent = formatWalletMoneyPrivate(mt5Bal, mt5Curr);
        if (walletElements.totalBalance) walletElements.totalBalance.textContent = formatWalletMoneyPrivate(mt5Bal, mt5Curr);
    } else {
        if (walletElements.availableBalance) walletElements.availableBalance.textContent = formatWalletMoneyPrivate(mainAvailable, mainCurrency);
        if (walletElements.totalBalance) walletElements.totalBalance.textContent = formatWalletMoneyPrivate(mainTotal, mainCurrency);
    }

    if (walletElements.ledgerCount) walletElements.ledgerCount.textContent = String(getDisplayLedgerRows(WALLET_STATE.ledger).length);

    renderLedgerTable();
    renderDepositTable();
    renderWithdrawalTable();
    if (typeof txRenderAssetLists === "function") {
        txRenderAssetLists();
    }
    if (typeof txRenderTradingAccounts === "function") {
        txRenderTradingAccounts();
    }
    if (typeof txRenderOverviewStats === "function") {
        txRenderOverviewStats(WALLET_STATE.overviewStats);
    }
    updateMainWithdrawalPageBalanceDisplay();
    updateWalletActionModalBalances();
    txSyncNavbarBalanceFromWalletState();
}

function renderWalletBalanceCardsOnly() {
    applyRestrictedWalletVisibility();

    if (isWalletRestrictedMode()) {
        setWalletStatus("Restricted", "error");
        return;
    }

    const wallet = WALLET_STATE.wallet || {};
    const mainWallet = getMainWalletData();
    const tradingWallet = getTradingWalletData();
    const mainCurrency = mainWallet.currency || "USDT";
    const tradingCurrency = "USDT";

    const mainAvailable = walletNumber(mainWallet.available_balance, 0);
    let tradingAvailable = walletNumber(tradingWallet.available_balance, 0);
    const mainTotal = walletNumber(mainWallet.total_balance, mainAvailable + walletNumber(mainWallet.locked_balance, 0));

    const user = typeof getAuthUser === "function" ? getAuthUser() : null;
    const isMt5 = user && user.selected_platform === "mt5";

    if (isMt5) {
        const mt5Account = WALLET_STATE.mt5?.account || {};
        const mt5Curr = mt5Account.account_currency || "USD";
        tradingAvailable = walletNumber(mt5Account.balance, 0);

        if (walletElements.lockedBalanceLabel) walletElements.lockedBalanceLabel.textContent = "MT5 Account Balance";
        if (walletElements.lockedBalanceNote) walletElements.lockedBalanceNote.textContent = "MetaTrader 5 server balance";
        if (walletElements.lockedBalance) walletElements.lockedBalance.textContent = formatWalletMoney(tradingAvailable, mt5Curr);
        if (walletElements.availableBalance) walletElements.availableBalance.textContent = formatWalletMoney(tradingAvailable, mt5Curr);
        if (walletElements.totalBalance) walletElements.totalBalance.textContent = formatWalletMoney(tradingAvailable, mt5Curr);
    } else {
        if (walletElements.lockedBalanceLabel) walletElements.lockedBalanceLabel.textContent = "Trading Wallet";
        if (walletElements.lockedBalanceNote) walletElements.lockedBalanceNote.textContent = "Trades use this balance";
        if (walletElements.lockedBalance) walletElements.lockedBalance.textContent = formatWalletMoney(tradingAvailable, tradingCurrency);
        if (walletElements.availableBalance) walletElements.availableBalance.textContent = formatWalletMoney(mainAvailable, mainCurrency);
        if (walletElements.totalBalance) walletElements.totalBalance.textContent = formatWalletMoney(mainTotal, mainCurrency);
    }

    setWalletStatus("Active", "live");
    if (typeof txRenderAssetLists === "function") {
        txRenderAssetLists();
    }
    updateMainWithdrawalPageBalanceDisplay();
    updateWalletActionModalBalances();
    txSyncNavbarBalanceFromWalletState();
}

async function refreshWalletBalanceOnly() {
    if (
        document.hidden ||
        typeof apiRequest !== "function" ||
        typeof isLoggedIn !== "function" ||
        !isLoggedIn()
    ) {
        return;
    }

    if (isWalletRestrictedMode()) {
        await refreshWithdrawalHistoryOnly();
        return;
    }

    try {
        await loadWalletAccountStatus();

        if (isWalletRestrictedMode()) {
            await refreshWithdrawalHistoryOnly();
            return;
        }

        const activeSubId = localStorage.getItem("traidiumx_active_user_id");
        const balanceUrl = (activeSubId && activeSubId !== "main")
            ? `/wallet/balance?sub_account_id=${encodeURIComponent(activeSubId)}`
            : "/wallet/balance";

        const response = await apiRequest(balanceUrl);
        const walletData = response?.data?.wallet || response?.data || null;

        if (!walletData) {
            return;
        }

        WALLET_STATE.wallet = walletData;
        saveCachedWalletData(WALLET_STATE.wallet);
        renderWalletBalanceCardsOnly();
    } catch (error) {
        console.warn("Wallet balance auto sync failed:", error);
    }
}

async function forceWalletSync(options = {}) {
    const silent = options?.silent !== false;

    await refreshWalletBalanceOnly();

    if (!WALLET_STATE.loading) {
        await loadWalletData({ silent });
    }
}

function getFilteredLedgerRows() {
    const state = getHistoryState("ledger");
    const status = String(state.status || "all").toLowerCase();
    const currencyFilter = String(state.currency || "all").toUpperCase();
    return getDisplayLedgerRows(WALLET_STATE.ledger || []).filter((item) => {
        const type = historyText(item.transaction_type || item.type);
        const direction = historyText(item.direction);
        const description = historyText(item.description);
        const itemCurrency = getItemCurrency(item);

        const statusMatch = status === "all"
            || direction === status
            || type.includes(status)
            || description.includes(status);
        const currencyMatch = currencyFilter === "ALL" || itemCurrency === currencyFilter;
        const searchMatch = rowContainsSearch(item, state.search, ["transaction_type", "type", "direction", "description", "reference_id", "withdrawal_id", "currency"])
            || historyText(formatWalletMoney(item.amount, itemCurrency)).includes(historyText(state.search));
        return statusMatch && currencyMatch && searchMatch;
    });
}

function renderHistoryPagination(type, meta) {
    const paginationElementMap = {
        ledger: walletElements.ledgerPagination,
        deposits: walletElements.depositPagination,
        withdrawals: walletElements.withdrawalPagination
    };
    const container = paginationElementMap[type];
    if (!container) return;

    if (!meta || meta.totalRows <= meta.pageSize) {
        container.innerHTML = meta?.totalRows ? `<span>${meta.totalRows} result${meta.totalRows === 1 ? "" : "s"}</span>` : "";
        return;
    }

    const buttons = [];
    buttons.push(`<button type="button" data-history-page="${type}" data-page="${meta.page - 1}" ${meta.page <= 1 ? "disabled" : ""}>Prev</button>`);
    for (let number = 1; number <= meta.totalPages; number += 1) {
        if (number === 1 || number === meta.totalPages || Math.abs(number - meta.page) <= 1) {
            buttons.push(`<button type="button" data-history-page="${type}" data-page="${number}" class="${number === meta.page ? "active" : ""}">${number}</button>`);
        } else if (buttons[buttons.length - 1] !== "<span>...</span>") {
            buttons.push("<span>...</span>");
        }
    }
    buttons.push(`<button type="button" data-history-page="${type}" data-page="${meta.page + 1}" ${meta.page >= meta.totalPages ? "disabled" : ""}>Next</button>`);
    buttons.push(`<span>${meta.totalRows} results</span>`);
    container.innerHTML = buttons.join("");
}

function resetHistoryPage(type) {
    const state = getHistoryState(type);
    state.page = 1;
}

function bindHistoryFilters() {
    const config = [
        ["ledger", walletElements.ledgerSearchInput, walletElements.ledgerTypeFilter, walletElements.ledgerPageSize, renderLedgerTable],
        ["deposits", walletElements.depositSearchInput, walletElements.depositStatusFilter, walletElements.depositPageSize, renderDepositTable],
        ["withdrawals", walletElements.withdrawalSearchInput, walletElements.withdrawalStatusFilter, walletElements.withdrawalPageSize, renderWithdrawalTable]
    ];

    if (walletElements.ledgerCurrencyFilter && walletElements.ledgerCurrencyFilter.dataset.bound !== "1") {
        walletElements.ledgerCurrencyFilter.dataset.bound = "1";
        walletElements.ledgerCurrencyFilter.addEventListener("change", () => {
            getHistoryState("ledger").currency = walletElements.ledgerCurrencyFilter.value || "all";
            resetHistoryPage("ledger");
            renderLedgerTable();
        });
    }

    if (walletElements.depositCurrencyFilter && walletElements.depositCurrencyFilter.dataset.bound !== "1") {
        walletElements.depositCurrencyFilter.dataset.bound = "1";
        walletElements.depositCurrencyFilter.addEventListener("change", () => {
            getHistoryState("deposits").currency = walletElements.depositCurrencyFilter.value || "all";
            resetHistoryPage("deposits");
            renderDepositTable();
        });
    }

    if (walletElements.withdrawalCurrencyFilter && walletElements.withdrawalCurrencyFilter.dataset.bound !== "1") {
        walletElements.withdrawalCurrencyFilter.dataset.bound = "1";
        walletElements.withdrawalCurrencyFilter.addEventListener("change", () => {
            getHistoryState("withdrawals").currency = walletElements.withdrawalCurrencyFilter.value || "all";
            resetHistoryPage("withdrawals");
            renderWithdrawalTable();
        });
    }

    config.forEach(([type, searchInput, statusSelect, pageSizeSelect, render]) => {
        if (searchInput && searchInput.dataset.bound !== "1") {
            searchInput.dataset.bound = "1";
            searchInput.addEventListener("input", () => {
                getHistoryState(type).search = searchInput.value || "";
                resetHistoryPage(type);
                render();
            });
        }

        if (statusSelect && statusSelect.dataset.bound !== "1") {
            statusSelect.dataset.bound = "1";
            statusSelect.addEventListener("change", () => {
                getHistoryState(type).status = statusSelect.value || "all";
                resetHistoryPage(type);
                render();
            });
        }

        if (pageSizeSelect && pageSizeSelect.dataset.bound !== "1") {
            pageSizeSelect.dataset.bound = "1";
            pageSizeSelect.addEventListener("change", () => {
                getHistoryState(type).pageSize = Number(pageSizeSelect.value || 5);
                resetHistoryPage(type);
                render();
            });
        }
    });

    document.querySelectorAll("[data-history-page]").forEach((button) => {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";
        button.addEventListener("click", () => {
            const type = button.getAttribute("data-history-page");
            const page = Number(button.getAttribute("data-page") || 1);
            if (!type || button.disabled) return;
            getHistoryState(type).page = page;
            if (type === "ledger") renderLedgerTable();
            if (type === "deposits") renderDepositTable();
            if (type === "withdrawals") renderWithdrawalTable();
        });
    });
}

function renderLedgerTable() {
    if (!walletElements.ledgerBody) return;

    const filtered = getFilteredLedgerRows();
    const meta = paginateRows(filtered, "ledger");
    const ledger = meta.rows;

    walletElements.ledgerBody.innerHTML = ledger.map((item) => {
        const finalizedWithdrawal = isWithdrawalFinalizedLedger(item) && !item.__singleWithdrawalDebit;
        const rawDirection = String(item.direction || "").toLowerCase();
        const direction = finalizedWithdrawal ? "finalized" : rawDirection;
        const sign = direction === "credit" ? "+" : "-";
        const amountClass = directionClass(direction);
        const description = finalizedWithdrawal ? withdrawalFinalizedDescription(item.description) : (item.description || "");
        const itemCurrency = getItemCurrency(item);
        const amountCell = finalizedWithdrawal
            ? `<span class="text-cyan-300">No extra debit</span><p class="mt-1 text-xs font-normal text-slate-500">Locked ${walletEscape(formatWalletMoney(item.amount, itemCurrency))}</p>`
            : `${sign}${walletEscape(formatWalletMoney(item.amount, itemCurrency))}`;

        return `
            <tr class="transition hover:bg-cyan-400/[0.04]">
                <td class="tx-desktop-only text-sm text-slate-300">${walletEscape(formatWalletDate(item.created_at))}</td>
                <td class="tx-desktop-only text-sm font-bold text-white">
                    ${walletEscape(prettyType(item.transaction_type))}
                    <p class="mt-1 max-w-[420px] truncate text-xs font-normal text-slate-500" title="${walletEscape(description)}">${walletEscape(description)}</p>
                </td>
                <td class="tx-desktop-only text-sm font-black ${amountClass}">${walletEscape(prettyType(direction))}</td>
                <td class="tx-desktop-only text-sm font-black ${amountClass}">${amountCell}</td>
                <td class="tx-desktop-only text-sm text-slate-300">${walletEscape(formatWalletMoney(item.balance_after, itemCurrency))}</td>

                <td class="rt-mobile-only tx-mobile-only rt-mobile-card-cell" colspan="5">
                    <div class="rt-mobile-position-card w-full box-border overflow-hidden py-0.5">
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-1.5 min-w-0 truncate">
                                <span class="text-xs font-black text-white truncate">${walletEscape(prettyType(item.transaction_type))}</span>
                                <span class="text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${amountClass}">${walletEscape(prettyType(direction))}</span>
                            </div>
                            <span class="text-xs font-black ${amountClass} shrink-0">${amountCell}</span>
                        </div>
                        <div class="flex items-center justify-between gap-2 text-[10px] text-slate-400 mt-1">
                            <span class="truncate">Bal: <strong class="text-slate-200 font-mono">${walletEscape(formatWalletMoney(item.balance_after, itemCurrency))}</strong> ${description ? `<span class="text-slate-600">•</span> ${walletEscape(description)}` : ''}</span>
                            <span class="text-slate-500 font-mono text-[9.5px] shrink-0">${walletEscape(formatWalletDate(item.created_at))}</span>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    walletElements.ledgerEmpty?.classList.toggle("hidden", filtered.length > 0);
    renderHistoryPagination("ledger", meta);
    bindHistoryFilters();
}

function getFilteredDepositRows() {
    const state = getHistoryState("deposits");
    const status = String(state.status || "all").toLowerCase();
    const currencyFilter = String(state.currency || "all").toUpperCase();
    return (WALLET_STATE.deposits || []).filter((item) => {
        const itemStatus = historyText(item.status);
        const verification = historyText(item.verification_status);
        const itemCurrency = getItemCurrency(item);
        const pendingLike = ["pending", "processing", "pending_blockchain_verification", "pending_manual_verification", "pending_verification", "processing_direct_credit"].some((value) => itemStatus.includes(value) || verification.includes(value));
        const statusMatch = status === "all"
            || itemStatus.includes(status)
            || verification.includes(status)
            || (status === "pending" && pendingLike);
        const currencyMatch = currencyFilter === "ALL" || itemCurrency === currencyFilter;
        const searchMatch = rowContainsSearch(item, state.search, ["deposit_reference", "crypto_asset", "crypto_network", "tx_hash", "status", "verification_status", "verification_message", "remark", "deposit_address"])
            || historyText(formatWalletMoney(item.amount, itemCurrency)).includes(historyText(state.search));
        return statusMatch && currencyMatch && searchMatch;
    });
}

function renderDepositTable() {
    if (!walletElements.depositBody) return;

    const filtered = getFilteredDepositRows();
    const meta = paginateRows(filtered, "deposits");
    const deposits = meta.rows;

    walletElements.depositBody.innerHTML = deposits.map((item) => {
        const status = String(item.status || "").toLowerCase();
        const verificationStatus = String(item.verification_status || "").toLowerCase();

        const canVerify = ["pending", "pending_verification", "failed"].includes(status) ||
            ["not_checked", "pending_on_chain", "provider_error", "provider_not_configured", "manual_company_wallet_check_required"].includes(verificationStatus);

        const action = canVerify
            ? `<button type="button" data-verify-deposit="${walletEscape(item.id)}" class="rounded-full bg-emerald-400 px-2.5 py-1 text-[10px] font-black text-slate-950 hover:bg-emerald-300">Verify</button>`
            : `<span class="text-xs text-slate-500">--</span>`;

        const verificationText = item.verification_message || item.remark || "--";
        const confirmations = Number(item.required_confirmations || 0) > 0
            ? `${walletEscape(item.confirmations || 0)}/${walletEscape(item.required_confirmations || 0)}`
            : walletEscape(item.confirmations || 0);

        const itemCurrency = getItemCurrency(item);

        return `
            <tr class="transition hover:bg-cyan-400/[0.04]">
                <td class="tx-desktop-only text-sm text-slate-300">${walletEscape(formatWalletDate(item.created_at))}</td>
                <td class="tx-desktop-only text-sm font-bold text-white">
                    ${walletEscape(item.deposit_reference || "--")}
                    <p class="mt-1 text-xs font-normal text-slate-500">${getExplorerLink(item.explorer_url, "Explorer")}</p>
                </td>
                <td class="tx-desktop-only text-sm text-slate-300">${walletEscape(item.crypto_asset || "USDT")} / ${walletEscape(item.crypto_network || "--")}</td>
                <td class="tx-desktop-only text-sm font-black text-white">${walletEscape(formatWalletMoney(item.amount, itemCurrency))}</td>
                <td class="tx-desktop-only"><span class="rounded-full px-3 py-1 text-xs font-black ${statusClass(item.status)}">${walletEscape(prettyType(item.status))}</span></td>
                <td class="tx-desktop-only max-w-[360px] text-sm text-slate-400">
                    <span class="font-bold text-slate-300">${walletEscape(prettyType(item.verification_status || "pending"))}</span>
                    <p class="mt-1 text-xs text-slate-500">Confirmations: ${confirmations}</p>
                    <p class="mt-1 line-clamp-2 text-xs text-slate-500">${walletEscape(verificationText)}</p>
                </td>
                <td class="tx-desktop-only text-right">${action}</td>

                <td class="rt-mobile-only tx-mobile-only rt-mobile-card-cell" colspan="7">
                    <div class="rt-mobile-position-card w-full box-border overflow-hidden py-0.5">
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-1.5 min-w-0 truncate">
                                <span class="text-xs font-black text-white truncate">${walletEscape(item.deposit_reference || "Deposit")}</span>
                                <span class="rounded-full px-2 py-0.5 text-[9px] font-black shrink-0 ${statusClass(item.status)}">${walletEscape(prettyType(item.status))}</span>
                            </div>
                            <span class="text-xs font-black text-emerald-400 shrink-0">+${walletEscape(formatWalletMoney(item.amount, itemCurrency))}</span>
                        </div>
                        <div class="flex items-center justify-between gap-2 text-[10px] text-slate-400 mt-1">
                            <span class="truncate text-slate-400">${walletEscape(item.crypto_asset || "USDT")} (${walletEscape(item.crypto_network || "--")}) <span class="text-slate-600">•</span> Conf: ${confirmations}</span>
                            <div class="flex items-center gap-2 shrink-0">
                                <span class="text-slate-500 font-mono text-[9.5px]">${walletEscape(formatWalletDate(item.created_at))}</span>
                                ${canVerify ? `<span class="ml-1">${action}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    walletElements.depositEmpty?.classList.toggle("hidden", filtered.length > 0);
    renderHistoryPagination("deposits", meta);
    bindHistoryFilters();
}

function getFilteredWithdrawalRows() {
    const state = getHistoryState("withdrawals");
    const status = String(state.status || "all").toLowerCase();
    const currencyFilter = String(state.currency || "all").toUpperCase();
    return (WALLET_STATE.withdrawals || []).filter((item) => {
        const itemStatus = historyText(item.status);
        const meta = getWithdrawalStatusMeta(item);
        const label = historyText(meta.label);
        const itemCurrency = getItemCurrency(item);
        const pendingLike = ["pending", "queued", "pending_admin_approval", "pending_payout"].some((value) => itemStatus.includes(value) || label.includes(value));
        const statusMatch = status === "all"
            || itemStatus.includes(status)
            || label.includes(status)
            || (status === "pending" && pendingLike);
        const currencyMatch = currencyFilter === "ALL" || itemCurrency === currencyFilter;
        const searchMatch = rowContainsSearch(item, state.search, ["withdrawal_reference", "crypto_asset", "crypto_network", "withdrawal_address", "status", "remark", "reject_reason", "processing_mode", "tx_hash"])
            || historyText(formatWalletMoney(item.amount, itemCurrency)).includes(historyText(state.search));
        return statusMatch && currencyMatch && searchMatch;
    });
}

function renderWithdrawalTable() {
    if (!walletElements.withdrawalBody) return;

    const filtered = getFilteredWithdrawalRows();
    const metaPage = paginateRows(filtered, "withdrawals");
    const withdrawals = metaPage.rows;

    walletElements.withdrawalBody.innerHTML = withdrawals.map((item) => {
        const meta = getWithdrawalStatusMeta(item);
        const action = meta.canCancel
            ? `<button type="button" data-cancel-withdrawal="${walletEscape(item.id)}" class="rounded-full bg-orange-400 px-2.5 py-1 text-[10px] font-black text-slate-950 hover:bg-orange-300">Cancel</button>`
            : `<span class="text-xs text-slate-500">--</span>`;
        const explorer = item.explorer_url ? getExplorerLink(item.explorer_url, "Explorer") : "--";
        const decisionText = meta.decisionAt ? `Decision: ${formatWalletDate(meta.decisionAt)}` : "";
        const adminText = item.approved_admin_email || item.rejected_admin_email || "";
        const lockedAmount = walletNumber(item.locked_amount, item.amount || 0);
        const itemCurrency = getItemCurrency(item);

        return `
            <tr class="transition hover:bg-cyan-400/[0.04]">
                <td class="tx-desktop-only text-sm text-slate-300">${walletEscape(formatWalletDate(item.created_at))}</td>
                <td class="tx-desktop-only text-sm font-bold text-white">
                    ${walletEscape(item.withdrawal_reference || "--")}
                    <p class="mt-1 text-xs font-normal text-slate-500">${explorer}</p>
                </td>
                <td class="tx-desktop-only text-sm text-slate-300">${walletEscape(item.crypto_asset || "USDT")} / ${walletEscape(item.crypto_network || "--")}</td>
                <td class="tx-desktop-only max-w-[240px] truncate text-sm text-slate-300" title="${walletEscape(item.withdrawal_address || "")}">${walletEscape(item.withdrawal_address || "--")}</td>
                <td class="tx-desktop-only text-sm font-black text-white">
                    ${walletEscape(formatWalletMoney(item.amount, itemCurrency))}
                    <p class="mt-1 text-xs font-normal text-slate-500">Receive: ${walletEscape(formatWalletMoney(item.final_amount ?? item.amount, itemCurrency))}</p>
                    <p class="mt-1 text-xs font-normal text-slate-500">Wallet debit: ${walletEscape(formatWalletMoney(lockedAmount, itemCurrency))}</p>
                </td>
                <td class="tx-desktop-only">
                    <span class="rounded-full px-3 py-1 text-xs font-black ${statusClass(item.status, meta.tone)}">${walletEscape(meta.label)}</span>
                    ${decisionText ? `<p class="mt-2 text-xs text-slate-500">${walletEscape(decisionText)}</p>` : ""}
                </td>
                <td class="tx-desktop-only max-w-[320px] text-sm text-slate-400">
                    <span class="font-bold text-slate-300">${walletEscape(prettyType(item.processing_mode || "admin_approval"))}</span>
                    <p class="mt-1 line-clamp-2 text-xs text-slate-500">${walletEscape(meta.message || item.remark || "--")}</p>
                    ${adminText ? `<p class="mt-1 text-xs text-slate-600">Admin: ${walletEscape(adminText)}</p>` : ""}
                </td>
                <td class="tx-desktop-only text-right">${action}</td>

                <td class="rt-mobile-only tx-mobile-only rt-mobile-card-cell" colspan="8">
                    <div class="rt-mobile-position-card w-full box-border overflow-hidden py-0.5">
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-1.5 min-w-0 truncate">
                                <span class="text-xs font-black text-white truncate">${walletEscape(item.withdrawal_reference || "Withdrawal")}</span>
                                <span class="rounded-full px-2 py-0.5 text-[9px] font-black shrink-0 ${statusClass(item.status, meta.tone)}">${walletEscape(meta.label)}</span>
                            </div>
                            <span class="text-xs font-black text-rose-400 shrink-0">-${walletEscape(formatWalletMoney(item.amount, itemCurrency))}</span>
                        </div>
                        <div class="flex items-center justify-between gap-2 text-[10px] text-slate-400 mt-1">
                            <span class="truncate text-slate-400">${walletEscape(item.crypto_asset || "USDT")} (${walletEscape(item.crypto_network || "--")}) <span class="text-slate-600">•</span> Recv: <strong class="text-slate-200 font-mono">${walletEscape(formatWalletMoney(item.final_amount ?? item.amount, itemCurrency))}</strong></span>
                            <div class="flex items-center gap-2 shrink-0">
                                <span class="text-slate-500 font-mono text-[9.5px]">${walletEscape(formatWalletDate(item.created_at))}</span>
                                ${meta.canCancel ? `<span class="ml-1">${action}</span>` : ''}
                            </div>
                        </div>
                        ${item.withdrawal_address ? `<div class="text-[9.5px] text-slate-500 font-mono truncate mt-0.5">To: ${walletEscape(item.withdrawal_address)}</div>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    walletElements.withdrawalEmpty?.classList.toggle("hidden", filtered.length > 0);
    renderHistoryPagination("withdrawals", metaPage);
    bindWalletRowActions();
    bindHistoryFilters();
}


function bindWalletRowActions() {
    document.querySelectorAll("[data-verify-deposit]").forEach((button) => {
        if (button.dataset.bound === "true") return;

        button.dataset.bound = "true";
        button.addEventListener("click", async () => {
            await verifyDepositOnChain(button.getAttribute("data-verify-deposit"));
        });
    });

    document.querySelectorAll("[data-cancel-withdrawal]").forEach((button) => {
        if (button.dataset.bound === "true") return;

        button.dataset.bound = "true";
        button.addEventListener("click", async () => {
            await cancelWithdrawalRequest(button.getAttribute("data-cancel-withdrawal"));
        });
    });
}

function sanitizePositiveAmountInput(input, decimalLimit = 6) {
    if (!input) return;

    input.addEventListener("input", () => {
        const val = input.value;
        if (!val) return;

        if (parseFloat(val) < 0) {
            input.value = Math.abs(parseFloat(val));
            return;
        }

        if (val.includes(".")) {
            const parts = val.split(".");
            if (parts[1] && parts[1].length > decimalLimit) {
                input.value = `${parts[0]}.${parts[1].slice(0, decimalLimit)}`;
            }
        }
    });
}

function validateDepositForm(formData, isINR = false) {
    const amount = walletNumber(formData.get("amount"), 0);
    if (isINR) {
        if (amount < 10) return "Minimum INR deposit amount is ₹10.";
        return "";
    }

    const network = getSelectedCryptoNetwork();
    const addressInfo = getSelectedCryptoAddressInfo();
    const companyAddress = String(addressInfo?.address || "").trim();
    const txHash = String(formData.get("tx_hash") || "").trim();
    const activeCurrency = String(WALLET_STATE.activeDepositCurrency || "USDT").toUpperCase();

    const minAmount = Number(WALLET_STATE.cryptoDeposit.minAmount || 0);
    const maxAmount = Number(WALLET_STATE.cryptoDeposit.maxAmount || 1000000);
    if (amount < minAmount) return `Minimum crypto deposit amount is ${minAmount} ${activeCurrency}.`;
    if (amount > maxAmount) return `Maximum crypto deposit amount is ${maxAmount} ${activeCurrency}.`;
    if (!["TRC20", "ERC20", "BEP20", "BITCOIN", "SOLANA", "RIPPLE", "CARDANO"].includes(network)) return "Please select a valid crypto network.";
    if (!addressInfo?.is_configured || !companyAddress) return `${activeCurrency} ${network} company deposit address is not configured from Admin Settings.`;

    return "";
}


async function handleMetaMaskPayment() {
    if (typeof window.ethereum === "undefined") {
        showWalletActionMessage("MetaMask is not installed. Please install the extension first.", "error");
        return;
    }

    const usdAmount = parseFloat(walletElements.depositAmount?.value);
    if (isNaN(usdAmount) || usdAmount <= 0) {
        showWalletActionMessage("Please enter a valid deposit amount first.", "error");
        return;
    }

    const selectedNetwork = getSelectedCryptoNetwork();
    const companyAddress = walletElements.cryptoDepositAddress?.textContent?.trim();

    if (!companyAddress || companyAddress === "--" || companyAddress.includes("not configured")) {
        showWalletActionMessage("Company deposit address is not configured properly.", "error");
        return;
    }

    const chainIdMap = {
        "ERC20": "0xaa36a7", // Sepolia Testnet
        "BEP20": "0x61"      // BSC Testnet
    };
    const chainId = chainIdMap[selectedNetwork];
    if (!chainId) {
        showWalletActionMessage("Selected network is not supported for MetaMask deposits.", "error");
        return;
    }

    try {
        walletSetButtonLoading(walletElements.payWithMetaMaskBtn, true);
        showWalletActionMessage("Requesting MetaMask connection...", "info");

        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        const userAddress = accounts[0];

        showWalletActionMessage(`Switching MetaMask network to ${selectedNetwork === "ERC20" ? "Sepolia Testnet" : "BSC Testnet"}...`, "info");
        try {
            await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: chainId }]
            });
        } catch (switchError) {
            if (switchError.code === 4902) {
                const networkDetails = {
                    "0xaa36a7": {
                        chainId: "0xaa36a7",
                        chainName: "Sepolia Test Network",
                        nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
                        rpcUrls: ["https://rpc.sepolia.org"],
                        blockExplorerUrls: ["https://sepolia.etherscan.io"]
                    },
                    "0x61": {
                        chainId: "0x61",
                        chainName: "BSC Testnet",
                        nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
                        rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
                        blockExplorerUrls: ["https://testnet.bscscan.com"]
                    }
                };
                await window.ethereum.request({
                    method: "wallet_addEthereumChain",
                    params: [networkDetails[chainId]]
                });
            } else {
                throw switchError;
            }
        }

        const activeCurrency = String(WALLET_STATE.activeDepositCurrency || "USDT").toUpperCase();
        
        const tokenContracts = {
            "BTC": WALLET_STATE.cryptoDeposit.btcContractAddress || "",
            "BNB": "0x365030F77e91dcBb341174d454871BE07d47a083",
            "SOL": "0x0D0b687E55FA6e16F3645038e018D7654D7CD99B",
            "XRP": "0x4c9c3851e6dc08bEF4377F9147d84B8419D242B2",
            "ADA": "0xC3678002F75eEA63D75B543fC12625f609aE9959"
        };
        const activeContract = tokenContracts[activeCurrency];
        
        let txParams;
        if (["BTC", "BNB", "SOL", "XRP", "ADA"].includes(activeCurrency) && activeContract) {
            // ERC20 Token transfer (custom token)
            // Method ID for transfer(address,uint256) is 0xa9059cbb
            const cleanToAddress = companyAddress.replace("0x", "").toLowerCase().padStart(64, "0");
            const decimals = 18; 
            const tokenAmountWei = BigInt(Math.floor(usdAmount * Math.pow(10, decimals)));
            const cleanAmount = tokenAmountWei.toString(16).padStart(64, "0");
            const txData = "0xa9059cbb" + cleanToAddress + cleanAmount;

            txParams = {
                from: userAddress,
                to: activeContract,
                value: "0x0",
                data: txData,
                gas: "0x186a0" // 100,000 gas limit is standard and safe for ERC20
            };
            showWalletActionMessage(`Preparing ERC20 ${activeCurrency} token transfer to ${companyAddress}...`, "info");
        } else {
            // Native ETH/BNB transfer
            const testAmount = usdAmount * 0.0001;
            const weiValue = "0x" + Math.floor(testAmount * 1e18).toString(16);
            txParams = {
                from: userAddress,
                to: companyAddress,
                value: weiValue,
                gas: "0x5208"
            };
            showWalletActionMessage("Preparing payment transaction...", "info");
        }

        showWalletActionMessage("Confirm transaction in MetaMask popup...", "info");
        const txHash = await window.ethereum.request({
            method: "eth_sendTransaction",
            params: [txParams]
        });

        if (walletElements.depositTxHash) {
            walletElements.depositTxHash.value = txHash;
        }
        if (walletElements.depositAddressConfirmation) {
            walletElements.depositAddressConfirmation.value = companyAddress;
        }

        const depositForm = document.getElementById("walletDepositForm") || document.querySelector("#modalDepositFormForm");
        if (depositForm) {
            showWalletActionMessage("MetaMask payment complete! Auto-verifying deposit...", "info");
            setTimeout(() => {
                try {
                    depositForm.requestSubmit();
                } catch (e) {
                    const submitEvent = new Event("submit", { cancelable: true });
                    depositForm.dispatchEvent(submitEvent);
                }
            }, 300);
        } else {
            showWalletActionMessage("MetaMask payment complete! TXID has been filled automatically. Please click 'Deposit' below to credit.", "success");
        }
    } catch (err) {
        console.error("MetaMask Payment Error:", err);
        showWalletActionMessage(err.message || "MetaMask payment failed.", "error");
    } finally {
        walletSetButtonLoading(walletElements.payWithMetaMaskBtn, false);
    }
}


async function handleDepositSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form) {
        showWalletActionMessage("Wallet deposit form is not ready. Please refresh and try again.", "error");
        return;
    }

    if (!isLoggedIn()) {
        showWalletActionMessage("Please login first.", "error");
        return;
    }

    if (isWalletRestrictedMode()) {
        showWalletActionMessage("Deposit is disabled while account is restricted.", "error");
        return;
    }

    const activeCurrency = (WALLET_STATE.activeDepositCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const isINR = activeCurrency === "INR";

    const formData = new FormData(form);
    const validationError = validateDepositForm(formData, isINR);

    if (validationError) {
        showWalletActionMessage(validationError, "error");
        return;
    }

    if (isINR) {
        try {
            walletSetButtonLoading(walletElements.createDepositBtn, true);
            const amount = walletNumber(formData.get("amount"), 0);
            
            // 1. Create Razorpay order on backend
            const orderResponse = await apiRequest("/deposit/razorpay/create-order", {
                method: "POST",
                body: JSON.stringify({ amount })
            });

            if (!orderResponse || !orderResponse.success || !orderResponse.data) {
                throw new Error(orderResponse?.message || "Failed to create order on server.");
            }

            const orderData = orderResponse.data;
            
            // Check if backend used sandbox test mode (meaning keys are not configured yet)
            if (orderData.is_sandbox_fallback) {
                // For sandbox fallback, we can simulate the successful payment directly to make testing easier
                const confirmed = await showWalletConfirm({
                    title: "Razorpay Sandbox Simulation",
                    message: `Razorpay API Keys are not set in the backend .env. Would you like to simulate a successful payment of ₹${amount}?`,
                    confirmText: "Simulate Success",
                    cancelText: "Simulate Failure",
                    danger: false
                });

                if (confirmed) {
                    const verifyResponse = await apiRequest("/deposit/razorpay/verify-payment", {
                        method: "POST",
                        body: JSON.stringify({
                            razorpay_order_id: orderData.razorpay_order_id,
                            razorpay_payment_id: "pay_sandbox_simulated_" + Math.random().toString(36).substring(7)
                        })
                    });
                    
                    form.reset();
                    await loadWalletData({ silent: true });
                    await refreshWalletBalanceOnly();
                    closeWalletActionModal();
                    showWalletAlert(verifyResponse.message || "Simulated payment successfully verified!", "success");
                } else {
                    showWalletActionMessage("Simulated payment failed or cancelled.", "error");
                }
                return;
            }

            // 2. Launch real Razorpay Checkout
            if (typeof Razorpay === "undefined") {
                showWalletActionMessage("Razorpay SDK is not loaded. Please refresh the page.", "error");
                return;
            }

            const user = getAuthUser() || {};
            const options = {
                key: orderData.key_id,
                amount: orderData.amount_paise,
                currency: "INR",
                name: "TraidiumX",
                description: `Wallet Deposit - Ref: ${orderData.deposit_reference}`,
                order_id: orderData.razorpay_order_id,
                handler: async function (response) {
                    try {
                        walletSetButtonLoading(walletElements.createDepositBtn, true);
                        showWalletActionMessage("Verifying payment...", "info");
                        
                        const verifyResponse = await apiRequest("/deposit/razorpay/verify-payment", {
                            method: "POST",
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature
                            })
                        });

                        form.reset();
                        await loadWalletData({ silent: true });
                        await refreshWalletBalanceOnly();
                        closeWalletActionModal();
                        showWalletAlert(verifyResponse.message || "Payment verified successfully!", "success");
                    } catch (verifyError) {
                        showWalletActionMessage(verifyError.message || "Payment verification failed. Please contact support.", "error");
                    } finally {
                        walletSetButtonLoading(walletElements.createDepositBtn, false);
                    }
                },
                prefill: {
                    name: user.name || "",
                    email: user.email || "",
                    contact: user.phone || user.contact || ""
                },
                theme: {
                    color: "#10b981" // matches TraidiumX emerald colors
                },
                modal: {
                    ondismiss: function () {
                        showWalletActionMessage("Payment cancelled by user.", "error");
                    }
                }
            };

            const rzp = new Razorpay(options);
            rzp.open();
        } catch (error) {
            showWalletActionMessage(error.message || "Unable to initiate payment.", "error");
        } finally {
            walletSetButtonLoading(walletElements.createDepositBtn, false);
        }
    } else {
        // Crypto USDT Deposit flow
        try {
            walletSetButtonLoading(walletElements.createDepositBtn, true);
            const activeSubId = localStorage.getItem("traidiumx_active_user_id");
            const payload = {
                amount: walletNumber(formData.get("amount"), 0),
                payment_method: "crypto_deposit",
                crypto_asset: String(formData.get("crypto_asset") || "USDT").trim().toUpperCase(),
                crypto_network: getSelectedCryptoNetwork(),
                tx_hash: String(formData.get("tx_hash") || "").trim(),
                deposit_address_confirmation: String(formData.get("deposit_address_confirmation") || "").trim(),
                sub_account_id: (activeSubId && activeSubId !== "main") ? activeSubId : null
            };

            const response = await apiRequest("/deposit/create", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            form.reset();

            if (walletElements.cryptoNetwork) {
                walletElements.cryptoNetwork.value = "TRC20";
            }

            const isCompleted = response?.data?.deposit?.status === "completed";
            if (isCompleted) {
                closeWalletActionModal();
                showWalletAlert(response.message || "Deposit credited successfully.", "success");
            } else {
                showWalletActionMessage(response.message || "Deposit submitted successfully.", "info");
            }

            // Reset loading button immediately
            walletSetButtonLoading(walletElements.createDepositBtn, false);

            // Fetch wallet data in background asynchronously
            loadWalletData({ silent: true }).then(() => {
                updateCryptoDepositAddressUI();
                updateWalletActionModalBalances();
            });
        } catch (error) {
            checkKycRedirect(error, "Unable to create deposit.", "deposit");
            walletSetButtonLoading(walletElements.createDepositBtn, false);
        }
    }
}


function getWithdrawalFormAmountAndNetwork() {
    const isINR = (WALLET_STATE.activeWithdrawalCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase() === "INR";
    return {
        amount: walletNumber(walletElements.withdrawAmount?.value, 0),
        network: isINR ? "UPI/BANK" : String(walletElements.withdrawNetwork?.value || "TRC20").trim().toUpperCase()
    };
}

function getDemoWithdrawalAmountAndNetwork() {
    return {
        amount: walletNumber(walletElements.demoWithdrawAmount?.value, 0),
        network: String(walletElements.demoWithdrawNetwork?.value || "TRC20").trim().toUpperCase()
    };
}

function getWithdrawalFeeNumbers(estimate = null, fallbackAmount = 0) {
    const isINR = (WALLET_STATE.activeWithdrawalCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase() === "INR";
    const currency = isINR ? "INR" : (estimate?.currency || "USDT");
    const amount = walletNumber(estimate?.amount_usdt, fallbackAmount);
    const companyFee = walletNumber(estimate?.withdrawal_fee_usdt, 0);
    const networkFee = walletNumber(estimate?.network_fee_usdt, 0);
    const totalFee = walletNumber(estimate?.total_fee_usdt, companyFee + networkFee);
    const totalDebit = walletNumber(estimate?.total_wallet_debit_usdt, amount);
    const receiveAmount = walletNumber(estimate?.payout_amount_usdt, Math.max(amount - totalFee, 0));

    return { currency, amount, companyFee, networkFee, totalFee, totalDebit, receiveAmount };
}

function setFeePreview(elements = {}, estimate = null, message = "Enter amount and select network to calculate fees.", fallbackAmount = 0) {
    const activeCurrency = String(WALLET_STATE.activeWithdrawalCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const values = getWithdrawalFeeNumbers(estimate, fallbackAmount);
    const inputVal = walletNumber(walletElements.withdrawAmount?.value, fallbackAmount);

    const amt = values.amount > 0 ? values.amount : inputVal;

    if (elements.amount) elements.amount.textContent = amt > 0 ? formatWalletMoney(amt, activeCurrency) : "--";
    if (elements.receive) {
        const rVal = estimate ? values.receiveAmount : amt;
        elements.receive.textContent = rVal > 0 ? formatWalletMoney(rVal, activeCurrency) : "--";
    }
    if (elements.companyFee) {
        const cVal = estimate ? values.companyFee : 0;
        elements.companyFee.textContent = formatWalletMoney(cVal, activeCurrency);
    }
    if (elements.networkFee) {
        const nVal = estimate ? values.networkFee : 0;
        elements.networkFee.textContent = formatWalletMoney(nVal, activeCurrency);
    }
    if (elements.totalFee) {
        const tVal = estimate ? values.totalFee : 0;
        elements.totalFee.textContent = formatWalletMoney(tVal, activeCurrency);
    }
    if (elements.totalDebit) {
        const dVal = estimate ? values.totalDebit : amt;
        elements.totalDebit.textContent = dVal > 0 ? formatWalletMoney(dVal, activeCurrency) : "--";
    }
    if (elements.note) elements.note.textContent = message;

    // Synchronize Image 2 Modal Elements
    const modalFeeText = document.getElementById("txWithdrawModalFeeText");
    if (modalFeeText) {
        const feeVal = estimate ? values.totalFee : 0;
        if (activeCurrency === "INR") {
            modalFeeText.textContent = feeVal > 0 ? `₹${feeVal.toFixed(2)}` : "₹0.00 (Free)";
        } else if (activeCurrency === "USDT") {
            modalFeeText.textContent = feeVal > 0 ? `$${feeVal.toFixed(2)} (≈ ${feeVal.toFixed(2)} USDT)` : "$0.00 (≈ 0.00 USDT)";
        } else {
            modalFeeText.textContent = feeVal > 0 ? `${feeVal.toFixed(4)} ${activeCurrency}` : `0.00 ${activeCurrency}`;
        }
    }
    const modalReceiveApprox = document.getElementById("txWithdrawModalReceiveApprox");
    if (modalReceiveApprox && estimate) {
        modalReceiveApprox.textContent = `${values.receiveAmount.toFixed(2)} ${activeCurrency}`;
    }
}

function setWithdrawalFeePreview(estimate = null, message = "Enter amount and select network to calculate fees.") {
    setFeePreview({
        amount: walletElements.withdrawPreviewAmount,
        receive: walletElements.withdrawPreviewReceive,
        companyFee: walletElements.withdrawPreviewCompanyFee,
        networkFee: walletElements.withdrawPreviewNetworkFee,
        totalFee: walletElements.withdrawPreviewTotalFee,
        totalDebit: walletElements.withdrawPreviewTotalDebit,
        note: walletElements.withdrawPreviewNote
    }, estimate, message, walletNumber(walletElements.withdrawAmount?.value, 0));
}

function setDemoWithdrawalFeePreview(estimate = null, message = "Enter demo amount and select network to calculate fees.") {
    setFeePreview({
        amount: walletElements.demoWithdrawPreviewAmount,
        receive: walletElements.demoWithdrawPreviewReceive,
        companyFee: walletElements.demoWithdrawPreviewCompanyFee,
        networkFee: walletElements.demoWithdrawPreviewNetworkFee,
        totalFee: walletElements.demoWithdrawPreviewTotalFee,
        totalDebit: walletElements.demoWithdrawPreviewTotalDebit,
        note: walletElements.demoWithdrawPreviewNote
    }, estimate, message, walletNumber(walletElements.demoWithdrawAmount?.value, 0));
}

async function requestWithdrawalFeeEstimate(amount, network, showError = false, previewSetter = null) {
    if (typeof apiRequest !== "function") {
        return null;
    }

    if (!amount || amount <= 0) {
        if (typeof previewSetter === "function") previewSetter(null);
        return null;
    }

    try {
        WALLET_STATE.withdrawalFeeLoading = true;
        const response = await apiRequest("/fees/estimate", {
            method: "POST",
            body: JSON.stringify({
                product: "withdrawal",
                amount,
                crypto_network: network
            })
        });

        const estimate = response.data || response;
        const values = getWithdrawalFeeNumbers(estimate, amount);
        const message = `Fees are deducted from your withdraw amount. You will receive ${formatWalletMoney(values.receiveAmount, values.currency)} after admin approval.`;
        if (typeof previewSetter === "function") previewSetter(estimate, message);
        return estimate;
    } catch (error) {
        console.warn("Withdrawal fee estimate failed:", error);
        if (typeof previewSetter === "function") {
            previewSetter(null, "Unable to calculate fee right now. Backend will still validate fee before request is created.");
        }
        if (showError) {
            showWalletAlert(getErrorMessage(error, "Unable to calculate withdrawal fee."), "error");
        }
        return null;
    } finally {
        WALLET_STATE.withdrawalFeeLoading = false;
    }
}

async function estimateWithdrawalFee(showError = false) {
    const { amount, network } = getWithdrawalFormAmountAndNetwork();
    if (!amount || amount <= 0) {
        WALLET_STATE.withdrawalFeeEstimate = null;
        setWithdrawalFeePreview(null);
        return null;
    }

    const estimate = await requestWithdrawalFeeEstimate(amount, network, showError, setWithdrawalFeePreview);
    WALLET_STATE.withdrawalFeeEstimate = estimate;
    return estimate;
}

async function estimateDemoWithdrawalFee(showError = false) {
    const { amount, network } = getDemoWithdrawalAmountAndNetwork();
    if (!amount || amount <= 0) {
        setDemoWithdrawalFeePreview(null);
        return null;
    }

    return requestWithdrawalFeeEstimate(amount, network, showError, setDemoWithdrawalFeePreview);
}

function scheduleWithdrawalFeeEstimate() {
    window.clearTimeout(WALLET_STATE.withdrawalFeeTimer);
    WALLET_STATE.withdrawalFeeTimer = window.setTimeout(() => {
        estimateWithdrawalFee(false);
    }, 320);
}

function scheduleDemoWithdrawalFeeEstimate() {
    window.clearTimeout(WALLET_STATE.demoWithdrawalFeeTimer);
    WALLET_STATE.demoWithdrawalFeeTimer = window.setTimeout(() => {
        estimateDemoWithdrawalFee(false);
    }, 320);
}

function validateWithdrawalForm(formData) {
    const isModal = isWalletActionModalOpen();
    const prefix = isModal ? "modal" : "main";
    const activeCurrency = String(WALLET_STATE.activeWithdrawalCurrency || (isModal ? WALLET_STATE.activeWithdrawalCurrency : localStorage.getItem("tx_navbar_currency")) || "USDT").toUpperCase();
    const isINR = activeCurrency === "INR";
    
    let rawAmount = formData.get("amount");
    if (isINR && isModal) {
        const inrAmtInput = document.getElementById("modalWithdrawInrAmount");
        if (inrAmtInput && inrAmtInput.value) {
            rawAmount = inrAmtInput.value;
        }
    }
    const amount = walletNumber(rawAmount, 0);
    const address = String(formData.get("withdrawal_address") || "").trim();

    if (isINR) {
        if (amount < 100) return "Minimum INR withdrawal amount is ₹100.00.";
        
        const holder = document.getElementById(`${prefix}WithdrawHolderName`)?.value.trim() || "";
        const bank = document.getElementById(`${prefix}WithdrawBankName`)?.value.trim() || "";
        const accNum = document.getElementById(`${prefix}WithdrawAccountNumber`)?.value.trim() || "";
        const ifsc = document.getElementById(`${prefix}WithdrawIfscCode`)?.value.trim() || "";
        
        if (!holder) return "Please enter Account Holder Name.";
        if (!bank) return "Please enter Bank Name.";
        if (!accNum) return "Please enter Account Number.";
        if (!ifsc) return "Please enter IFSC Code.";
        return null;
    }

    const network = getSelectedWithdrawalCryptoNetwork();

    if (activeCurrency === "USDT") {
        if (amount < 10) return "Minimum crypto withdrawal amount is 10 USDT.";
        if (amount > 1000000) return "Maximum crypto withdrawal amount is 1000000 USDT.";
        if (!["TRC20", "ERC20", "BEP20"].includes(network)) return "Please select a valid withdrawal network.";

        if (network === "TRC20" && !/^[Tt][a-zA-Z0-9]{20,50}$/.test(address)) {
            return "Please enter a valid TRC20 wallet address starting with T.";
        }

        if (["ERC20", "BEP20"].includes(network) && !/^0[xX][a-fA-F0-9]{40}$/.test(address)) {
            return `Please enter a valid ${network} wallet address starting with 0x.`;
        }
    } else {
        if (amount <= 0) return "Please enter a valid withdrawal amount.";
        if (!address) return "Please enter a withdrawal wallet address.";

        if (["ERC20", "BEP20"].includes(network)) {
            if (!/^0[xX][a-fA-F0-9]{40}$/.test(address)) {
                return `Please enter a valid ${network} wallet address starting with 0x.`;
            }
        } else {
            if (activeCurrency === "BTC") {
                const btcRegex = /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{39,59}|0[xX][a-fA-F0-9]{40})$/;
                if (!btcRegex.test(address)) return "Please enter a valid Bitcoin or EVM wallet address (starts with 1, 3, bc1, or 0x).";
            } else if (activeCurrency === "SOL") {
                const solRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
                if (!solRegex.test(address)) return "Please enter a valid Solana address.";
            } else if (activeCurrency === "XRP") {
                const xrpRegex = /^r[0-9a-zA-Z]{24,34}$/;
                if (!xrpRegex.test(address)) return "Please enter a valid Ripple address starting with r.";
            } else if (activeCurrency === "ADA") {
                const adaRegex = /^(addr1[a-z0-9]+|Ae2[a-km-zA-HJ-NP-Z1-9]+|Ddz[a-km-zA-HJ-NP-Z1-9]+)$/;
                if (!adaRegex.test(address)) return "Please enter a valid Cardano address.";
            } else if (["ETH", "USDC", "BNB"].includes(activeCurrency)) {
                if (!/^0[xX][a-fA-F0-9]{40}$/.test(address)) return `Please enter a valid ${activeCurrency} address starting with 0x.`;
            }
        }
    }

    return "";
}

function validateDemoAmount(amount, actionLabel) {
    const parsedAmount = walletNumber(amount, 0);

    if (parsedAmount < 10) return `Minimum demo ${actionLabel} amount is 10 USDT.`;
    if (parsedAmount > 1000000) return `Maximum demo ${actionLabel} amount is 1000000 USDT.`;

    return "";
}

function getDemoNetwork(formData, fallback = "TRC20") {
    const network = String(formData.get("crypto_network") || fallback || "TRC20").trim().toUpperCase();
    return ["TRC20", "ERC20", "BEP20"].includes(network) ? network : "TRC20";
}

function setDemoButtonLoading(button, isLoading) {
    if (!button) return;

    if (isLoading) {
        button.setAttribute("disabled", "disabled");
        button.classList.add("opacity-60", "cursor-not-allowed");
        return;
    }

    button.removeAttribute("disabled");
    button.classList.remove("opacity-60", "cursor-not-allowed");
}

async function handleDemoDepositSubmit(event) {
    event.preventDefault();

    if (!isLoggedIn()) {
        showWalletAlert("Please login first.", "error");
        return;
    }

    if (WALLET_STATE.environment !== "development") {
        showWalletAlert("Demo deposit can be added only in development mode.", "error");
        return;
    }

    const formData = new FormData(form);
    const amount = walletNumber(formData.get("amount"), 0);
    const cryptoNetwork = getDemoNetwork(formData);
    const validationError = validateDemoAmount(amount, "deposit");

    if (validationError) {
        showWalletAlert(validationError, "error");
        return;
    }

    const confirmed = await showWalletConfirm({
        title: "Create Demo Deposit?",
        message: `Create demo deposit of ${formatWalletMoney(amount, "USDT")} on ${cryptoNetwork}. This will save deposit history and wallet ledger entries in database.`,
        confirmText: "Create Deposit",
        cancelText: "Cancel",
        danger: false
    });

    if (!confirmed) {
        return;
    }

    try {
        setDemoButtonLoading(walletElements.demoDepositBtn || walletElements.demoCreditBtn, true);

        const response = await apiRequest("/wallet/demo-deposit", {
            method: "POST",
            body: JSON.stringify({ amount, crypto_network: cryptoNetwork })
        });

        closeWalletActionModal();
        showWalletAlert(response.message || "Demo deposit added successfully.", "success");
        await loadWalletData();
        if (!isWalletRestrictedMode()) {
            await refreshWalletBalanceOnly();
        }
    } catch (error) {
        showWalletAlert(getErrorMessage(error, "Unable to add demo deposit."), "error");
    } finally {
        setDemoButtonLoading(walletElements.demoDepositBtn || walletElements.demoCreditBtn, false);
    }
}


function buildWithdrawalConfirmPayload({ amount, network, estimate, title = "Confirm Withdrawal Request" }) {
    const values = getWithdrawalFeeNumbers(estimate, amount);
    return {
        title,
        message: `Please review the withdrawal fee breakdown before creating this ${network} request.`,
        details: [
            { label: "Wallet debit / locked amount", value: formatWalletMoney(values.totalDebit, values.currency), tone: "debit" },
            { label: "You will receive", value: formatWalletMoney(values.receiveAmount, values.currency), tone: "receive" },
            { label: "Withdrawal fee", value: formatWalletMoney(values.companyFee, values.currency), tone: "fee" }
        ],
        note: "Fees are deducted from the amount you enter. After admin approval, only the net payout is sent to your wallet address. If admin rejects/cancels, the locked amount is released back to available balance.",
        confirmText: "Confirm Withdrawal",
        cancelText: "Cancel",
        danger: true
    };
}

async function handleDemoWithdrawSubmit(event) {
    event.preventDefault();

    if (!isLoggedIn()) {
        showWalletAlert("Please login first.", "error");
        return;
    }

    if (WALLET_STATE.environment !== "development") {
        showWalletAlert("Demo withdrawal can be created only in development mode.", "error");
        return;
    }

    if (isWalletRestrictedMode()) {
        showWalletAlert("Use the real crypto withdrawal form when your account is restricted.", "error");
        return;
    }

    const formData = new FormData(form);
    const amount = walletNumber(formData.get("amount"), 0);
    const cryptoNetwork = getDemoNetwork(formData);
    const validationError = validateDemoAmount(amount, "withdrawal");

    if (validationError) {
        showWalletAlert(validationError, "error");
        return;
    }

    const availableBalance = walletNumber(WALLET_STATE.wallet?.available_balance, 0);

    if (availableBalance < amount) {
        showWalletAlert("Insufficient available balance for demo withdrawal.", "error");
        return;
    }

    const estimate = await requestWithdrawalFeeEstimate(amount, cryptoNetwork, true, setDemoWithdrawalFeePreview);
    const confirmed = await showWalletConfirm(buildWithdrawalConfirmPayload({
        amount,
        network: cryptoNetwork,
        estimate,
        title: "Confirm Demo Withdrawal"
    }));

    if (!confirmed) {
        return;
    }

    try {
        setDemoButtonLoading(walletElements.demoWithdrawBtn, true);

        const response = await apiRequest("/wallet/demo-withdraw", {
            method: "POST",
            body: JSON.stringify({ amount, crypto_network: cryptoNetwork })
        });

        showWalletAlert(response.message || "Withdrawal request created. Requested amount is locked; fees are deducted from that amount and only the net payout is sent after admin approval.", "success");
        await loadWalletData();
        if (!isWalletRestrictedMode()) {
            await refreshWalletBalanceOnly();
        }
    } catch (error) {
        showWalletAlert(getErrorMessage(error, "Unable to create withdrawal request."), "error");
    } finally {
        setDemoButtonLoading(walletElements.demoWithdrawBtn, false);
    }
}

async function handleDemoCreditSubmit(event) {
    return handleDemoDepositSubmit(event);
}


async function handleWithdrawalSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form) {
        showWalletActionMessage("Wallet withdrawal form is not ready. Please refresh and try again.", "error");
        return;
    }

    if (!isLoggedIn()) {
        showWalletActionMessage("Please login first.", "error");
        return;
    }

    await loadWalletAccountStatus();
    applyRestrictedWalletVisibility();
    const wasRestrictedMode = isWalletRestrictedMode();

    const formData = new FormData(form);
    const validationError = validateWithdrawalForm(formData);

    if (validationError) {
        showWalletActionMessage(validationError, "error");
        return;
    }

    const isModal = isWalletActionModalOpen();
    const prefix = isModal ? "modal" : "main";
    const activeCurrency = String(WALLET_STATE.activeWithdrawalCurrency || (isModal ? WALLET_STATE.activeWithdrawalCurrency : localStorage.getItem("tx_navbar_currency")) || "USDT").toUpperCase();
    const isINR = activeCurrency === "INR";

    let rawAmount = formData.get("amount");
    if (isINR && isModal) {
        const inrAmtInput = document.getElementById("modalWithdrawInrAmount");
        if (inrAmtInput && inrAmtInput.value) {
            rawAmount = inrAmtInput.value;
        }
    }
    const amount = walletNumber(rawAmount, 0);

    if (!isINR) {
        await estimateWithdrawalFee(true);
    }

    let withdrawalAddress = "";
    if (isINR) {
        const holder = document.getElementById(`${prefix}WithdrawHolderName`)?.value.trim() || "";
        const bank = document.getElementById(`${prefix}WithdrawBankName`)?.value.trim() || "";
        const accNum = document.getElementById(`${prefix}WithdrawAccountNumber`)?.value.trim() || "";
        const ifsc = document.getElementById(`${prefix}WithdrawIfscCode`)?.value.trim().toUpperCase() || "";
        const upi = document.getElementById(`${prefix}WithdrawUpiId`)?.value.trim() || "";

        if (!holder || !bank || !accNum || !ifsc) {
            showWalletAlert("Please fill in all bank details (Holder Name, Bank Name, Account Number, IFSC).", "error");
            return;
        }

        withdrawalAddress = `Holder: ${holder} | Bank: ${bank} | A/C: ${accNum} | IFSC: ${ifsc}`;
        if (upi) {
            withdrawalAddress += ` | UPI: ${upi}`;
        }
    } else {
        withdrawalAddress = String(formData.get("withdrawal_address") || "").trim();
    }

    try {
        const submitBtn = form.querySelector('button[type="submit"]');
        walletSetButtonLoading(submitBtn, true);
        const response = await apiRequest("/withdrawal/request", {
            method: "POST",
            body: JSON.stringify({
                amount: amount,
                withdrawal_method: isINR ? "inr_withdrawal" : "crypto_withdrawal",
                crypto_asset: isINR ? "INR" : String(formData.get("crypto_asset") || "USDT").trim().toUpperCase(),
                crypto_network: isINR ? "UPI/BANK" : getSelectedWithdrawalCryptoNetwork(),
                withdrawal_address: withdrawalAddress,
                destination_tag: String(formData.get("destination_tag") || "").trim()
            })
        });

        form.reset();
        
        // Clear bank inputs
        const holderInput = document.getElementById(`${prefix}WithdrawHolderName`);
        const bankNameInput = document.getElementById(`${prefix}WithdrawBankName`);
        const accNumInput = document.getElementById(`${prefix}WithdrawAccountNumber`);
        const ifscInput = document.getElementById(`${prefix}WithdrawIfscCode`);
        const upiInput = document.getElementById(`${prefix}WithdrawUpiId`);

        if (holderInput) holderInput.value = "";
        if (bankNameInput) bankNameInput.value = "";
        if (accNumInput) accNumInput.value = "";
        if (ifscInput) ifscInput.value = "";
        if (upiInput) upiInput.value = "";

        if (walletElements.withdrawNetwork) {
            walletElements.withdrawNetwork.value = "TRC20";
        }
        WALLET_STATE.withdrawalFeeEstimate = null;
        setWithdrawalFeePreview(null);

        const successMessage = response.message || "Withdrawal request created. Requested amount is locked; fees are deducted from that amount and only the net payout is sent after admin approval.";
        showWalletAlert(successMessage, "success");
        closeWalletActionModal();
        
        // Reset loading immediately
        walletSetButtonLoading(submitBtn, false);
        
        // Refresh wallet data asynchronously in background
        loadWalletData({ silent: true }).then(() => {
            if (!wasRestrictedMode && !isWalletRestrictedMode()) {
                refreshWalletBalanceOnly();
            }
        });
    } catch (error) {
        checkKycRedirect(error, "Unable to create crypto withdrawal request.", "withdrawal");
        walletSetButtonLoading(form.querySelector('button[type="submit"]'), false);
    }
}

async function verifyDepositOnChain(depositId) {
    if (!depositId) return;

    try {
        const response = await apiRequest(`/deposit/verify/${encodeURIComponent(depositId)}`, {
            method: "POST"
        });

        showWalletAlert(response.message || "Deposit verification completed.", "success");
        await loadWalletData();
        if (!isWalletRestrictedMode()) {
            await refreshWalletBalanceOnly();
        }
    } catch (error) {
        showWalletAlert(getErrorMessage(error, "Deposit is not verified yet. Try again after blockchain confirmations."), "error");
        await loadWalletData();
        if (!isWalletRestrictedMode()) {
            await refreshWalletBalanceOnly();
        }
    }
}

async function cancelWithdrawalRequest(withdrawalId) {
    if (!withdrawalId) return;

    const wasRestrictedMode = isWalletRestrictedMode();

    try {
        const response = await apiRequest(`/withdrawal/cancel/${encodeURIComponent(withdrawalId)}`, {
            method: "POST"
        });

        const successMessage = response.message || "Withdrawal cancelled successfully.";
        showWalletAlert(successMessage, "success");
        await loadWalletData();
        if (wasRestrictedMode || isWalletRestrictedMode()) {
            showWalletAlert(successMessage, "success");
        } else {
            await refreshWalletBalanceOnly();
        }
    } catch (error) {
        showWalletAlert(getErrorMessage(error, "Unable to cancel withdrawal request."), "error");
    }
}

function startWalletAutoRefresh() {
    if (WALLET_STATE.autoRefreshTimer) {
        clearInterval(WALLET_STATE.autoRefreshTimer);
    }

    if (WALLET_STATE.balanceRefreshTimer) {
        clearInterval(WALLET_STATE.balanceRefreshTimer);
    }

    WALLET_STATE.balanceRefreshTimer = setInterval(() => {
        if (document.hidden || WALLET_STATE.loading) {
            return;
        }

        refreshWalletBalanceOnly();
    }, 3000);

    WALLET_STATE.autoRefreshTimer = setInterval(() => {
        if (document.hidden || WALLET_STATE.loading || !isLoggedIn()) {
            return;
        }

        loadWalletData({ silent: true });
    }, 1000);

    if (!WALLET_STATE.walletSyncEventsBound) {
        WALLET_STATE.walletSyncEventsBound = true;

        window.addEventListener("focus", () => {
            forceWalletSync({ silent: true });
        });

        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                forceWalletSync({ silent: true });
            }
        });

        window.addEventListener("traidiumx:wallet-sync", () => {
            forceWalletSync({ silent: true });
        });
    }
}

async function handleUnifiedWalletTransferSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form) {
        showWalletActionMessage("Wallet transfer form is not ready. Please refresh and try again.", "error");
        return;
    }

    if (!isLoggedIn()) {
        showWalletActionMessage("Please login first.", "error");
        return;
    }

    if (isWalletRestrictedMode()) {
        showWalletActionMessage("Wallet transfer is disabled while account is restricted.", "error");
        return;
    }

    const formData = new FormData(form);
    const direction = String(formData.get("direction") || "main_to_trading").trim();
    const amount = walletNumber(formData.get("amount"), 0);

    if (!amount || amount <= 0) {
        showWalletActionMessage("Please enter a valid transfer amount.", "error");
        return;
    }

    if (!["main_to_trading", "trading_to_main"].includes(direction)) {
        showWalletActionMessage("Please select a valid transfer direction.", "error");
        return;
    }

    try {
        walletSetButtonLoading(walletElements.unifiedTransferBtn, true);
        const assetSelect = document.getElementById("walletTransferAsset");
        const currency = (assetSelect ? assetSelect.value : (localStorage.getItem("tx_navbar_currency") || "USDT")).toUpperCase();
        const tradingSelect = document.getElementById("txTransferTradingAccountSelect");
        const targetSubId = (tradingSelect && tradingSelect.value && tradingSelect.value !== "main") 
            ? tradingSelect.value 
            : localStorage.getItem("traidiumx_active_user_id");
        const activeSubId = (targetSubId && targetSubId !== "main") ? targetSubId : null;
        let response;
        if (activeSubId) {
            const mappedDirection = direction === "main_to_trading" ? "main_to_sub" : "sub_to_main";
            response = await apiRequest("/wallet/transfer-sub", {
                method: "POST",
                body: JSON.stringify({
                    amount: amount,
                    direction: mappedDirection,
                    sub_user_id: activeSubId,
                    currency: currency
                })
            });
        } else {
            response = await apiRequest("/wallet/transfer", {
                method: "POST",
                body: JSON.stringify({ amount, direction, currency })
            });
        }

        form.reset();
        closeWalletActionModal();
        if (response && response.data && response.data.wallet) {
            WALLET_STATE.wallet = response.data.wallet;
            if (Array.isArray(txSubAccountsLocalCache)) {
                const p = txSubAccountsLocalCache.find(s => s.is_parent);
                if (p) {
                    p.wallet = response.data.wallet;
                }
                try {
                    localStorage.setItem("tx_cached_sub_accounts", JSON.stringify(txSubAccountsLocalCache));
                } catch (_) {}
            }
        } else {
            WALLET_STATE.wallet = response.data?.wallet || WALLET_STATE.wallet;
        }

        if (typeof txSyncNavbarBalanceFromWalletState === "function") {
            txSyncNavbarBalanceFromWalletState();
        }

        showWalletAlert(response.message || "Wallet transfer completed successfully.", "success");
        if (typeof txRenderAssetLists === "function") txRenderAssetLists();
        if (typeof txRenderTradingAccounts === "function") txRenderTradingAccounts();
        if (typeof txInitSubAccountsAndSelector === "function") txInitSubAccountsAndSelector();
        if (typeof loadNavbarWalletBalance === "function") loadNavbarWalletBalance();
        window.dispatchEvent(new CustomEvent("traidiumx:wallet-sync"));
        Promise.all([loadWalletData({ silent: true }), refreshWalletBalanceOnly()]).catch(() => {});
    } catch (error) {
        const errMsg = getErrorMessage(error, "Wallet transfer failed.");
        showWalletActionMessage(errMsg, "error");
        showWalletAlert(errMsg, "error");
    } finally {
        walletSetButtonLoading(walletElements.unifiedTransferBtn, false);
    }
}

async function handleWalletTransferSubmit(event, direction) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form) {
        showWalletAlert("Wallet transfer form is not ready. Please refresh and try again.", "error");
        return;
    }

    if (!isLoggedIn()) {
        showWalletAlert("Please login first.", "error");
        return;
    }

    if (isWalletRestrictedMode()) {
        showWalletAlert("Wallet transfer is disabled while account is restricted.", "error");
        return;
    }

    const formData = new FormData(form);
    const amount = walletNumber(formData.get("amount"), 0);
    if (!amount || amount <= 0) {
        showWalletAlert("Please enter a valid transfer amount.", "error");
        return;
    }

    const isMainToTrading = direction === "main_to_trading";
    const confirmed = await showWalletConfirm({
        title: isMainToTrading ? "Transfer to Trading Wallet" : "Transfer to Main Wallet",
        message: isMainToTrading
            ? "This moves funds from Main Wallet into Trading Wallet. Trades use Trading Wallet only."
            : "This moves free funds from Trading Wallet back to Main Wallet for withdrawal.",
        details: [
            { label: "Amount", value: formatWalletMoney(amount, "USDT") },
            { label: "Direction", value: isMainToTrading ? "Main → Trading" : "Trading → Main" }
        ],
        confirmText: "Confirm Transfer"
    });

    if (!confirmed) return;

    const button = isMainToTrading ? walletElements.mainToTradingBtn : walletElements.tradingToMainBtn;
    try {
        setDemoButtonLoading(button, true);
        const currency = localStorage.getItem("tx_navbar_currency") || "USDT";
        const activeSubId = localStorage.getItem("traidiumx_active_user_id");
        let response;
        if (activeSubId) {
            const mappedDirection = direction === "main_to_trading" ? "main_to_sub" : "sub_to_main";
            response = await apiRequest("/wallet/transfer-sub", {
                method: "POST",
                body: JSON.stringify({
                    amount: amount,
                    direction: mappedDirection,
                    sub_user_id: activeSubId,
                    currency: currency
                })
            });
        } else {
            response = await apiRequest("/wallet/transfer", {
                method: "POST",
                body: JSON.stringify({ amount, direction, currency })
            });
        }

        form.reset();
        WALLET_STATE.wallet = response.data?.wallet || WALLET_STATE.wallet;
        showWalletAlert(response.message || "Wallet transfer completed successfully.", "success");
        await loadWalletData({ silent: true });
    } catch (error) {
        showWalletAlert(getErrorMessage(error, "Wallet transfer failed."), "error");
    } finally {
        setDemoButtonLoading(button, false);
    }
}

async function updateLiveUsdtRate() {
    try {
        const response = await getOptionalApi("/wallet/usdt-rate", { usdt_rate: 88.50 });
        if (response && response.data && response.data.usdt_rate) {
            WALLET_STATE.usdtRate = Number(response.data.usdt_rate);
        } else {
            WALLET_STATE.usdtRate = 88.50;
        }
    } catch (err) {
        WALLET_STATE.usdtRate = 88.50;
    }
    const rateText = `1 USD = ₹${WALLET_STATE.usdtRate || 88.50} INR`;
    const depBadge = document.getElementById("txDepositUsdtRateText");
    if (depBadge) depBadge.textContent = rateText;
    const withBadge = document.getElementById("txWithdrawUsdtRateText");
    if (withBadge) withBadge.textContent = rateText;
    const trfBadge = document.getElementById("txTransferUsdtRateText");
    if (trfBadge) trfBadge.textContent = rateText;
}

function bindRealtimeConversionCalculator() {
    const depInput = document.getElementById("depositAmount");
    const youDepEl = document.getElementById("depCalcYouDeposit");
    const walletCreditEl = document.getElementById("depCalcWalletCredit");
    const rateNoteEl = document.getElementById("depCalcRateNote");

    if (depInput) {
        const updateDep = () => {
            const val = parseFloat(depInput.value || 0);
            const rate = WALLET_STATE.usdtRate || 88.50;
            const activeCurrency = (WALLET_STATE.activeDepositCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
            const isINR = activeCurrency === "INR";

            if (isINR) {
                if (youDepEl) youDepEl.textContent = val > 0 ? `₹${val.toLocaleString()}` : "₹0.00";
                if (walletCreditEl) {
                    if (val > 0) {
                        const usdtEq = (val / rate).toFixed(4);
                        walletCreditEl.innerHTML = `₹${val.toLocaleString()} INR <span class="text-xs font-normal text-slate-400">(≈ ${usdtEq} USD)</span>`;
                    } else {
                        walletCreditEl.textContent = "₹0.00 INR";
                    }
                }
                if (rateNoteEl) rateNoteEl.textContent = `Min ₹100 · $1 = ₹${rate.toFixed(2)}`;
            } else if (activeCurrency === "USDT") {
                if (youDepEl) youDepEl.textContent = val > 0 ? `$${val.toFixed(2)}` : "$0.00";
                if (walletCreditEl) walletCreditEl.textContent = val > 0 ? `$${val.toFixed(2)} USD` : "$0.00 USD";
                const minUsdt = WALLET_STATE.cryptoDeposit.minAmount || 10;
                const minInr = (minUsdt * rate).toFixed(0);
                if (rateNoteEl) rateNoteEl.textContent = `Min $${minUsdt} / ₹${minInr} · $1 = ₹${rate.toFixed(2)}`;
            } else {
                const getAssetPrice = (code) => {
                    if (code === "USDT" || code === "USDC") return 1.0;
                    if (code === "INR") return 1.0 / rate;
                    const board = WALLET_STATE.board || [];
                    const symbol = `${code}USDT`;
                    const item = board.find(b => b.symbol === symbol || b.ui_symbol === symbol);
                    return item ? parseFloat(item.price || item.last_price || 0) : 0.0;
                };

                const assetPrice = getAssetPrice(activeCurrency);
                if (youDepEl) {
                    if (val > 0 && assetPrice > 0) {
                        const usdEq = (val * assetPrice).toFixed(2);
                        youDepEl.innerHTML = `${val.toFixed(4)} ${activeCurrency} <span class="text-xs font-normal text-slate-400">(≈ $${usdEq} USD)</span>`;
                    } else if (val > 0) {
                        youDepEl.textContent = `${val.toFixed(4)} ${activeCurrency}`;
                    } else {
                        youDepEl.textContent = `0.0000 ${activeCurrency}`;
                    }
                }
                if (walletCreditEl) {
                    if (val > 0 && assetPrice > 0) {
                        const usdEq = (val * assetPrice).toFixed(2);
                        walletCreditEl.innerHTML = `${val.toFixed(4)} ${activeCurrency} <span class="text-xs font-normal text-slate-400">(≈ $${usdEq} USD)</span>`;
                    } else {
                        walletCreditEl.textContent = `${val > 0 ? val.toFixed(4) : "0.0000"} ${activeCurrency}`;
                    }
                }
                const minUsdt = WALLET_STATE.cryptoDeposit.minAmount || 10;
                const minCoin = assetPrice > 0 ? (minUsdt / assetPrice).toFixed(4) : "0.00";
                if (rateNoteEl) {
                    if (assetPrice > 0) {
                        rateNoteEl.textContent = `Min $${minUsdt} value (≈ ${minCoin} ${activeCurrency}) · 1 ${activeCurrency} ≈ $${assetPrice.toFixed(2)}`;
                    } else {
                        rateNoteEl.textContent = `Min $${minUsdt} value`;
                    }
                }
            }
        };
        depInput.addEventListener("input", updateDep);
        depInput.addEventListener("keyup", updateDep);
        updateDep();
    }

    const withInput = document.getElementById("withdrawAmount");
    const withPrev = document.getElementById("withdrawConversionPreview");
    if (withInput && withPrev) {
        const updateWith = () => {
            const val = parseFloat(withInput.value || 0);
            const rate = WALLET_STATE.usdtRate || 88.50;
            const activeCurrency = WALLET_STATE.activeWithdrawalCurrency || localStorage.getItem("tx_navbar_currency") || "USDT";
            const isINR = String(activeCurrency).toUpperCase() === "INR";
            if (val > 0) {
                if (isINR) {
                    withPrev.innerHTML = `₹${val.toLocaleString()} INR → net payout ≈ <span class="text-white font-extrabold text-sm">₹${val.toLocaleString()} INR</span>`;
                } else {
                    withPrev.innerHTML = `$${val} USD → net payout <span class="text-white font-extrabold text-sm">$${val} USD</span>`;
                }
            } else {
                withPrev.innerHTML = `Enter withdrawal amount to see live calculation`;
            }
        };
        withInput.addEventListener("input", updateWith);
        withInput.addEventListener("keyup", updateWith);
        updateWith();
    }

    const trfInput = document.getElementById("walletTransferAmount");
    const trfDir = document.getElementById("walletTransferDirection");
    const trfPrev = document.getElementById("transferConversionPreview");
    const trfLabel = document.getElementById("walletTransferAmountLabel");

    if (trfInput && trfPrev) {
        const updateTrf = () => {
            const val = parseFloat(trfInput.value || 0);
            const rate = WALLET_STATE.usdtRate || 88.50;
            const dir = trfDir?.value || "main_to_trading";
            const selectedCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
            const isINR = selectedCurrency === "INR";

            if (trfLabel) {
                trfLabel.textContent = (dir === "main_to_trading" && isINR) ? "Amount (INR / ₹)" : "Amount (USD / $)";
            }
            if (val > 0) {
                if (dir === "main_to_trading") {
                    if (isINR) {
                        const usdtEq = (val / rate).toFixed(4);
                        trfPrev.innerHTML = `₹${val.toLocaleString()} INR Main Wallet → <span class="text-white font-extrabold text-sm">${usdtEq} USD</span> Trading Wallet`;
                    } else {
                        trfPrev.innerHTML = `$${val} USD Main Wallet → <span class="text-white font-extrabold text-sm">$${val} USD</span> Trading Wallet`;
                    }
                } else {
                    if (isINR) {
                        const inrEq = (val * rate).toFixed(2);
                        trfPrev.innerHTML = `${val} USD Trading Wallet → <span class="text-white font-extrabold text-sm">₹${Number(inrEq).toLocaleString()} INR</span> Main Wallet`;
                    } else {
                        trfPrev.innerHTML = `$${val} USD Trading Wallet → <span class="text-white font-extrabold text-sm">$${val} USD</span> Main Wallet`;
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
    }
}

async function loadInrDepositDetails() {
    try {
        const response = await getOptionalApi("/deposit/inr-details", {});
        if (response && response.data) {
            const d = response.data;
            const upiEl = document.getElementById("inrUpiId");
            const accEl = document.getElementById("inrAccountName");
            const bankEl = document.getElementById("inrBankDetails");
            const ifscEl = document.getElementById("inrIfscCode");
            if (upiEl) upiEl.textContent = d.upi_id || "traidiumx@upi";
            if (accEl) accEl.textContent = d.account_name || "TraidiumX Trading Services Ltd";
            if (bankEl) bankEl.textContent = `${d.bank_name || 'HDFC Bank'} • ${d.account_number || '50100498765432'}`;
            if (ifscEl) ifscEl.textContent = d.ifsc_code || "HDFC0000128";
        }
    } catch (e) {
        console.warn("INR deposit details load failed:", e);
    }
}

function copyInrUpiIdToClipboard() {
    const upiElement = document.getElementById("inrUpiId");
    const upiText = upiElement ? upiElement.textContent.trim() : "traidiumx@upi";
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(upiText).then(() => {
            showWalletAlert(`UPI ID (${upiText}) copied to clipboard!`, "success");
        }).catch(() => {
            fallbackCopy(upiText);
        });
    } else {
        fallbackCopy(upiText);
    }
}

function fallbackCopy(text) {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    try {
        document.execCommand("copy");
        showWalletAlert(`UPI ID (${text}) copied to clipboard!`, "success");
    } catch (e) {
        showWalletAlert("Copy failed. Please copy manually.", "error");
    }
    document.body.removeChild(el);
}

function updateDepositModalUIByCurrency(currency) {
    const activeCurrency = String(currency || WALLET_STATE.activeDepositCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    WALLET_STATE.activeDepositCurrency = activeCurrency;
    const isINR = activeCurrency === "INR";
    const isLocked = !["USDT", "INR"].includes(activeCurrency);

    const depAssetIcon = document.getElementById("txDepAssetIcon");
    if (depAssetIcon) {
        const assetIconMap = {
            "USDT": "₮", "BTC": "₿", "ETH": "Ξ", "SOL": "◎", "BNB": "🟡", "XRP": "✕", "ADA": "₳", "INR": "₹"
        };
        depAssetIcon.textContent = assetIconMap[activeCurrency] || "₮";
    }

    const inrBox = document.getElementById("inrDepositBox");
    const cryptoBox = document.getElementById("cryptoDepositBox");
    const amountLabel = document.getElementById("depositAmountLabel");
    const depositAmountInput = document.getElementById("depositAmount");
    const depositAmountSymbol = document.getElementById("depositAmountSymbol");
    const depositMinNoteText = document.getElementById("depositMinNoteText");
    const txDepositSubtitle = document.getElementById("txDepositSubtitle");
    const toggleBar = document.getElementById("txDepositCurrencyToggleBar");
    const btnInr = document.getElementById("txSelectInrBtn");
    const btnUsdt = document.getElementById("txSelectUsdtBtn");
    const submitBtn = document.getElementById("createDepositBtn");
    const footerSubtext = document.getElementById("txDepositFooterSubtext");
    const cryptoAssetInput = document.getElementById("cryptoAsset");

    if (inrBox) inrBox.classList.toggle("hidden", !isINR);
    if (cryptoBox) cryptoBox.classList.toggle("hidden", isINR);
    if (cryptoAssetInput) cryptoAssetInput.value = activeCurrency;

    const inrQuickRow = document.getElementById("inrQuickAmountRow");
    if (inrQuickRow) inrQuickRow.classList.toggle("hidden", !isINR);

    if (amountLabel) amountLabel.textContent = isINR ? "Amount (INR)" : `Amount (${activeCurrency})`;
    if (depositAmountSymbol) depositAmountSymbol.textContent = isINR ? "₹ INR" : activeCurrency;

    if (depositAmountInput) {
        depositAmountInput.min = isINR ? "100" : String(WALLET_STATE.cryptoDeposit.minAmount || 10);
        depositAmountInput.placeholder = isINR ? "Minimum ₹100" : "Enter amount";
    }

    if (depositMinNoteText) {
        depositMinNoteText.textContent = isINR ? "₹100.00 INR" : `${WALLET_STATE.cryptoDeposit.minAmount || 10.00} ${activeCurrency}`;
    }

    const depAvailable = document.getElementById("txDepAvailableBal");
    if (depAvailable) {
        const wallet = WALLET_STATE.wallet || {};
        const key = activeCurrency === "INR" ? "main_wallet_inr" : activeCurrency === "USDT" ? "main_wallet_usdt" : `main_wallet_${activeCurrency.toLowerCase()}`;
        const coinWallet = wallet[key] || wallet[`main_wallet_${activeCurrency.toLowerCase()}`] || { available_balance: 0 };
        const avail = walletNumber(coinWallet.available_balance, 0);

        if (activeCurrency === "INR") {
            depAvailable.textContent = formatWalletMoney(avail, "INR");
        } else if (activeCurrency === "USDT") {
            depAvailable.textContent = formatWalletMoney(avail, "USDT");
        } else {
            depAvailable.textContent = `${avail.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${activeCurrency}`;
        }
    }

    if (walletElements.actionModalSubtitle) {
        walletElements.actionModalSubtitle.textContent = isINR
            ? "Deposit INR directly into your Main Wallet via Razorpay Payment Gateway."
            : `Send ${activeCurrency} to your wallet address. Make sure to use the correct network and copy the address exactly.`;
    }

    if (txDepositSubtitle) {
        txDepositSubtitle.textContent = isINR
            ? "Pay instantly via UPI, GPay, PhonePe, Cards, Netbanking or Wallet using Razorpay Gateway. Your wallet credits automatically."
            : `Copy the ${activeCurrency} address, send from your wallet, then enter the amount and submit. Funds credit to Main Wallet.`;
    }

    const secNote = document.getElementById("txDepositSecurityNote");
    const secIcon = document.getElementById("txDepositSecurityIcon");
    if (secNote) {
        secNote.innerHTML = isINR
            ? `🔒 <span class="font-bold text-cyan-300">Razorpay Secured Payment:</span> Instant automated credit to your Main Wallet.`
            : `Send only <span id="txDepositSecurityAsset" class="font-bold text-cyan-300">${activeCurrency}</span> on the selected network <span id="txDepositSecurityNetwork" class="font-bold text-cyan-300">(${WALLET_STATE.cryptoDeposit.network || "TRC20"})</span>.`;
    }
    if (secIcon) {
        secIcon.textContent = isINR ? "⚡" : "🛡️";
    }

    if (submitBtn) {
        submitBtn.innerHTML = isINR
            ? `<svg class="w-4 h-4 text-slate-950" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Proceed to Pay via Razorpay`
            : `<svg class="w-4 h-4 text-slate-950 transform rotate-45 fill-current" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg> Submit Deposit`;
    }

    if (footerSubtext) {
        footerSubtext.textContent = isINR
            ? "Wallet credits automatically after payment completion."
            : `Send ${activeCurrency} to the address above. Balance credits on submit.`;
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

    updateCryptoDepositAddressUI();

    const depInput = document.getElementById("depositAmount");
    if (depInput) depInput.dispatchEvent(new Event("input"));
    updateWalletActionModalBalances();
}

async function checkAndShowCurrencyLockModal() {
    if (!WALLET_STATE.wallet) return;
    const selectedCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
    updateDepositModalUIByCurrency(WALLET_STATE.activeDepositCurrency || selectedCurrency);
}

function updateWithdrawalModalUIByCurrency(currency, isModal = false) {
    const prefix = isModal ? "modal" : "main";
    const activeCurrency = String(currency || (isModal ? WALLET_STATE.activeWithdrawalCurrency : localStorage.getItem("tx_navbar_currency")) || "USDT").toUpperCase();
    
    if (isModal) {
        WALLET_STATE.activeWithdrawalCurrency = activeCurrency;
    } else {
        updateMainWithdrawalPageBalanceDisplay(activeCurrency);
    }

    const isINR = activeCurrency === "INR";
    const isUSDT = activeCurrency === "USDT";
    const requiresTag = activeCurrency === "XRP";
    const isCryptoSpecific = !["USDT", "INR"].includes(activeCurrency);

    // Modal containers (Image 2 isolation & INR full width view)
    const cryptoContainer = document.getElementById("modalWithdrawCryptoContainer");
    const inrContainer = document.getElementById("modalWithdrawInrContainer");
    if (cryptoContainer && inrContainer && isModal) {
        cryptoContainer.classList.toggle("hidden", isINR);
        inrContainer.classList.toggle("hidden", !isINR);
    }

    const netBox = document.getElementById(`${prefix}WithdrawNetworkBox`);
    const tagBox = document.getElementById(`${prefix}WithdrawTagBox`);
    const toggleBar = document.getElementById(`${prefix}WithdrawCurrencyToggleBar`);

    const subTitle = document.getElementById(`${prefix}WithdrawSubtitle`);
    const amountLabel = document.getElementById(`${prefix}WithdrawAmountLabel`);
    const addressLabel = document.getElementById(`${prefix}WithdrawalAddressLabel`);
    const addressInput = document.getElementById(`${prefix}WithdrawalAddress`);
    const methodInput = document.getElementById(`${prefix}WithdrawMethodInput`);
    const assetInput = document.getElementById(`${prefix}WithdrawAsset`);
    const btnInr = document.getElementById(`${prefix}SelectWithdrawInrBtn`);
    const btnUsdt = document.getElementById(`${prefix}SelectWithdrawUsdtBtn`);

    const cryptoBox = document.getElementById(isModal ? "txWithdrawCryptoAddressBox" : "txWithdrawCryptoAddressBox") ? (isModal ? document.querySelector("#modalWithdrawalForm #txWithdrawCryptoAddressBox") : document.getElementById("mainWithdrawCryptoAddressBox")) : document.getElementById(`${prefix}WithdrawCryptoAddressBox`);
    const bankBox = document.getElementById(isModal ? "txWithdrawInrBankBox" : "txWithdrawInrBankBox") ? (isModal ? document.querySelector("#modalWithdrawalForm #txWithdrawInrBankBox") : document.getElementById("mainWithdrawInrBankBox")) : document.getElementById(`${prefix}WithdrawInrBankBox`);

    if (cryptoBox) cryptoBox.classList.toggle("hidden", isINR);
    if (bankBox) bankBox.classList.toggle("hidden", !isINR);

    if (addressInput) {
        addressInput.required = !isINR;
    }

    const holderInput = document.getElementById(`${prefix}WithdrawHolderName`);
    const bankNameInput = document.getElementById(`${prefix}WithdrawBankName`);
    const accNumInput = document.getElementById(`${prefix}WithdrawAccountNumber`);
    const ifscInput = document.getElementById(`${prefix}WithdrawIfscCode`);

    if (holderInput) holderInput.required = isINR;
    if (bankNameInput) bankNameInput.required = isINR;
    if (accNumInput) accNumInput.required = isINR;
    if (ifscInput) ifscInput.required = isINR;

    if (netBox) netBox.classList.toggle("hidden", !["USDT", "BTC", "BNB", "SOL", "XRP", "ADA"].includes(activeCurrency));
    
    const netSelect = document.getElementById(`${prefix}WithdrawNetwork`);
    if (netSelect) {
        const currentVal = netSelect.value;
        netSelect.innerHTML = "";
        if (activeCurrency === "USDT") {
            netSelect.innerHTML = `
                <option value="ERC20">Ethereum (ERC20)</option>
                <option value="TRC20">TRON (TRC20)</option>
                <option value="BEP20">BNB Smart Chain (BEP20)</option>
            `;
            if (["TRC20", "BEP20", "ERC20"].includes(currentVal)) {
                netSelect.value = currentVal;
            } else {
                netSelect.value = "ERC20";
            }
        } else if (activeCurrency === "BTC") {
            netSelect.innerHTML = `
                <option value="BITCOIN">BTC Mainnet (Bitcoin)</option>
                <option value="ERC20">BTC ERC20 / Sepolia Token (MetaMask)</option>
            `;
            if (["BITCOIN", "ERC20"].includes(currentVal)) {
                netSelect.value = currentVal;
            } else {
                netSelect.value = "BITCOIN";
            }
        } else if (["SOL", "XRP", "ADA", "BNB"].includes(activeCurrency)) {
            const labelMap = {
                "SOL": { native: "SOLANA", nativeLabel: "Solana Network", erc20Label: "SOL ERC20 / Sepolia Token (MetaMask)" },
                "XRP": { native: "RIPPLE", nativeLabel: "Ripple Network", erc20Label: "XRP ERC20 / Sepolia Token (MetaMask)" },
                "ADA": { native: "CARDANO", nativeLabel: "Cardano Network", erc20Label: "ADA ERC20 / Sepolia Token (MetaMask)" },
                "BNB": { native: "BEP20", nativeLabel: "Binance Smart Chain", erc20Label: "BNB ERC20 / Sepolia Token (MetaMask)" }
            };
            const coinConfig = labelMap[activeCurrency];
            netSelect.innerHTML = `
                <option value="${coinConfig.native}">${coinConfig.nativeLabel}</option>
                <option value="ERC20">${coinConfig.erc20Label}</option>
            `;
            if ([coinConfig.native, "ERC20"].includes(currentVal)) {
                netSelect.value = currentVal;
            } else {
                netSelect.value = coinConfig.native;
            }
        } else {
            const nativeNetworks = {
                "ETH": { value: "ERC20", label: "Ethereum Network" },
                "USDC": { value: "ERC20", label: "Ethereum Network" }
            };
            const config = nativeNetworks[activeCurrency] || { value: "ERC20", label: "Ethereum Network" };
            netSelect.innerHTML = `<option value="${config.value}">${config.label}</option>`;
            netSelect.value = config.value;
        }
    }

    if (tagBox) tagBox.classList.toggle("hidden", !requiresTag);
    if (toggleBar) toggleBar.classList.toggle("hidden", isCryptoSpecific);

    if (methodInput) methodInput.value = isINR ? "inr_withdrawal" : "crypto_withdrawal";
    if (assetInput) assetInput.value = activeCurrency;

    if (subTitle) {
        subTitle.textContent = isINR
            ? "Submit your bank details for INR withdrawal. Admin approval completes payout."
            : `Submit your external crypto wallet address for ${activeCurrency} payout after Admin approval.`;
    }

    if (amountLabel) amountLabel.textContent = isINR ? "Amount (INR)" : `Amount (${activeCurrency})`;

    const selectedNetVal = netSelect?.value || "ERC20";
    if (addressInput && !isINR) {
        addressInput.placeholder = `Enter ${activeCurrency} wallet address (${selectedNetVal})`;
    }

    // Tab buttons styling
    if (btnInr && btnUsdt) {
        if (isINR) {
            btnInr.classList.add("is-active", "active");
            btnUsdt.classList.remove("is-active", "active");
        } else {
            btnUsdt.classList.add("is-active", "active");
            btnInr.classList.remove("is-active", "active");
        }
    }

    // Modal Header & Sizing styling for INR vs Crypto
    if (isModal) {
        const modalContainer = document.getElementById("walletActionModalCard");
        const modalTitle = document.getElementById("walletActionModalTitle");
        const pretitle = document.getElementById("txModalHeaderPretitle");
        const headerIcon = document.getElementById("txModalHeaderIcon");

        const actionSubtitle = document.getElementById("walletActionModalSubtitle");
        if (isINR) {
            if (modalContainer) {
                modalContainer.classList.add("tx-inr-modal-mode");
                modalContainer.style.setProperty("max-width", "860px", "important");
                modalContainer.style.setProperty("width", "95vw", "important");
                modalContainer.scrollTop = 0;
            }
            if (pretitle) pretitle.classList.add("hidden");
            if (modalTitle) modalTitle.innerHTML = 'Withdraw <span class="text-[#34d399]">INR</span> to Bank Account';
            if (actionSubtitle) actionSubtitle.textContent = "Submit your bank details for INR withdrawal. Admin approval completes payout.";
            if (headerIcon) {
                headerIcon.className = "h-11 w-11 shrink-0 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold select-none shadow-lg shadow-emerald-500/10";
                headerIcon.innerHTML = `<svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V10M5 21V10M9 21V10M13 21V10M3 10h18M12 3L2 10h20L12 3z"/></svg>`;
            }
        } else {
            if (modalContainer) {
                modalContainer.classList.remove("tx-inr-modal-mode");
                modalContainer.style.setProperty("max-width", "520px", "important");
                modalContainer.scrollTop = 0;
            }
            if (pretitle) {
                pretitle.textContent = "WALLET QUICK ACTION";
                pretitle.className = "mb-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#2fe8b7]";
                pretitle.classList.remove("hidden");
            }
            if (modalTitle) modalTitle.textContent = "Withdraw from Main Wallet";
            if (actionSubtitle) actionSubtitle.textContent = `Submit your external crypto wallet address for ${activeCurrency} payout after Admin approval.`;
            if (headerIcon) {
                headerIcon.className = "h-11 w-11 shrink-0 rounded-2xl bg-[#0e2736] border border-[#144654] text-cyan-400 flex items-center justify-center font-bold select-none shadow-lg shadow-[#0e2736]/50";
                headerIcon.innerHTML = `<svg class="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5zm0 0h-4a2 2 0 00-2 2v0a2 2 0 002 2h4"/></svg>`;
            }
        }
    }

    const amountSymbol = document.getElementById(`${prefix}WithdrawAmountSymbol`);
    if (amountSymbol) {
        amountSymbol.textContent = isINR ? "INR" : activeCurrency;
    }

    // Modal Dynamic Balance & Limits Card
    const wallet = WALLET_STATE.wallet || {};
    const key = activeCurrency === "INR" ? "main_wallet_inr" : activeCurrency === "USDT" ? "main_wallet_usdt" : `main_wallet_${activeCurrency.toLowerCase()}`;
    const coinWallet = wallet[key] || wallet[`main_wallet_${activeCurrency.toLowerCase()}`] || { available_balance: 0 };
    const avail = walletNumber(coinWallet.available_balance, 0);

    const inrWallet = wallet["main_wallet_inr"] || { available_balance: 0 };
    const inrAvail = walletNumber(inrWallet.available_balance, 0);

    const inrAvailText = document.getElementById("txInrAvailText");
    const inrCardBal = document.getElementById("txWithdrawInrCardBalance");
    if (inrAvailText) inrAvailText.textContent = `₹ ${inrAvail.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (inrCardBal) inrCardBal.textContent = `₹ ${inrAvail.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const modalAvailMain = document.getElementById("txWithdrawModalAvailMain");
    const modalAvailSub = document.getElementById("txWithdrawModalAvailSub");
    const modalMinAmount = document.getElementById("txWithdrawModalMinAmount");
    const modalFeeText = document.getElementById("txWithdrawModalFeeText");
    const currencyTag = document.getElementById("txWithdrawCurrencySymbolTag");

    if (currencyTag) {
        currencyTag.textContent = activeCurrency;
    }

    if (modalAvailMain && modalAvailSub) {
        if (activeCurrency === "INR") {
            modalAvailMain.textContent = `₹${avail.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            modalAvailSub.textContent = `≈ ₹${avail.toLocaleString(undefined, { minimumFractionDigits: 2 })} INR`;
        } else if (activeCurrency === "USDT") {
            modalAvailMain.textContent = `$${avail.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            modalAvailSub.textContent = `≈ ${avail.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDT`;
        } else {
            modalAvailMain.textContent = `${avail.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${activeCurrency}`;
            modalAvailSub.textContent = `≈ ${avail.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${activeCurrency}`;
        }
    }

    if (modalMinAmount) {
        modalMinAmount.textContent = activeCurrency === "INR" ? "₹100.00" : "$10.00";
    }

    // Dynamic Project Withdrawal Fee (Uses backend settings or live structure)
    txUpdateWithdrawalFeeDisplay(0, selectedNetVal);

    const minNoteText = document.getElementById(`${prefix}WithdrawMinNoteText`);
    if (minNoteText) {
        minNoteText.textContent = isINR ? "₹100" : `10.00 ${activeCurrency}`;
    }

    const wAvailable = document.getElementById("txWithdrawAvailableBal");
    if (wAvailable) {
        if (["INR", "USDT"].includes(activeCurrency)) {
            wAvailable.textContent = formatWalletMoney(avail, activeCurrency);
        } else {
            wAvailable.textContent = `${avail.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${activeCurrency}`;
        }
    }

    const withInput = document.getElementById(`${prefix}WithdrawAmount`);
    if (withInput) {
        if (isINR || activeCurrency === "USDT") {
            withInput.setAttribute("min", "10");
        } else {
            withInput.setAttribute("min", "0.00000001");
        }
        withInput.dispatchEvent(new Event("input"));
    }

    if (isINR && isModal) {
        txInitInrWithdrawModalInteractive();
        const inrInput = document.getElementById("modalWithdrawInrAmount");
        if (inrInput) inrInput.dispatchEvent(new Event("input"));
    }

    updateWalletActionModalBalances();

    // Dynamically update the FAQ items for the active currency
    updateWalletFaqUI(activeCurrency);
}

async function txFetchFeeStructure(force = false) {
    if (!force && WALLET_STATE.feeStructure) return WALLET_STATE.feeStructure;
    try {
        if (typeof apiRequest === "function") {
            const res = await apiRequest("/fees/structure", { method: "GET" });
            if (res && (res.data || res.runtime_settings)) {
                WALLET_STATE.feeStructure = res.data || res;
            }
        }
    } catch (e) {
        console.warn("Failed to fetch fee structure:", e);
    }
    return WALLET_STATE.feeStructure || null;
}

function txGetConfiguredWithdrawalFee(amount = 0, network = "TRC20") {
    const feeSettings = WALLET_STATE.feeStructure?.runtime_settings?.withdrawal_fee || {};
    const enabled = feeSettings.enabled ?? false;
    const feeType = feeSettings.type || "fixed";
    const feeValue = Number(feeSettings.value || 0);
    const minFee = Number(feeSettings.min_fee_usdt || 0);
    const maxFee = Number(feeSettings.max_fee_usdt || 0);

    const netFees = feeSettings.network_fees || {};
    const netFee = Number(netFees[network] || 0);

    if (!enabled && feeValue <= 0 && netFee <= 0) {
        return 0.0;
    }

    let calculated = 0;
    if (feeType === "percentage") {
        calculated = amount > 0 ? (amount * (feeValue / 100)) : 0;
    } else {
        calculated = feeValue;
    }

    if (netFee > 0) {
        calculated += netFee;
    }

    if (minFee > 0 && calculated < minFee && amount > 0) {
        calculated = minFee;
    }
    if (maxFee > 0 && calculated > maxFee) {
        calculated = maxFee;
    }

    return calculated;
}

function txUpdateWithdrawalFeeDisplay(amount = 0, network = "TRC20") {
    const activeCurrency = String(WALLET_STATE.activeWithdrawalCurrency || "USDT").toUpperCase();
    const feeVal = txGetConfiguredWithdrawalFee(amount, network);
    const feeLabel = document.getElementById("txWithdrawModalFeeLabel");
    if (feeLabel) feeLabel.textContent = "Withdrawal Fee";

    const feeText = document.getElementById("txWithdrawModalFeeText");
    if (feeText) {
        if (activeCurrency === "INR") {
            feeText.textContent = feeVal > 0 ? `₹${feeVal.toFixed(2)}` : "₹0.00 (Free)";
        } else if (activeCurrency === "USDT") {
            feeText.textContent = feeVal > 0 ? `$${feeVal.toFixed(2)} (≈ ${feeVal.toFixed(2)} USDT)` : "$0.00 (≈ 0.00 USDT)";
        } else {
            feeText.textContent = feeVal > 0 ? `${feeVal.toFixed(4)} ${activeCurrency}` : `0.00 ${activeCurrency}`;
        }
    }

    const withPreviewFee = document.getElementById("modalWithdrawPreviewCompanyFee");
    if (withPreviewFee) {
        if (activeCurrency === "INR") {
            withPreviewFee.textContent = `₹${feeVal.toFixed(2)}`;
        } else if (activeCurrency === "USDT") {
            withPreviewFee.textContent = `$${feeVal.toFixed(2)}`;
        } else {
            withPreviewFee.textContent = `${feeVal.toFixed(4)} ${activeCurrency}`;
        }
    }
}

function txInitUsdWithdrawModalInteractive() {
    const assetBtn = document.getElementById("txWithdrawAssetBtn");
    const assetMenu = document.getElementById("txWithdrawAssetMenu");
    const networkBtn = document.getElementById("txWithdrawNetworkBtn");
    const networkMenu = document.getElementById("txWithdrawNetworkMenu");
    const amountInput = document.getElementById("modalWithdrawAmount");
    const maxBtn = document.getElementById("txWithdrawUseMaxBtn");
    const pasteBtn = document.getElementById("txWithdrawPasteAddressBtn");
    const addressInput = document.getElementById("modalWithdrawalAddress");

    // Toggle Asset Dropdown
    if (assetBtn && assetMenu) {
        assetBtn.onclick = (e) => {
            e.stopPropagation();
            assetMenu.classList.toggle("hidden");
            if (networkMenu) networkMenu.classList.add("hidden");
        };
    }

    // Toggle Network Dropdown
    if (networkBtn && networkMenu) {
        networkBtn.onclick = (e) => {
            e.stopPropagation();
            networkMenu.classList.toggle("hidden");
            if (assetMenu) assetMenu.classList.add("hidden");
        };
    }

    // Close Dropdowns on Click Outside
    document.addEventListener("click", (e) => {
        if (assetMenu && !assetMenu.contains(e.target) && !assetBtn?.contains(e.target)) {
            assetMenu.classList.add("hidden");
        }
        if (networkMenu && !networkMenu.contains(e.target) && !networkBtn?.contains(e.target)) {
            networkMenu.classList.add("hidden");
        }
    });

    // Asset Selection Options
    document.querySelectorAll(".tx-w-asset-opt").forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const asset = btn.getAttribute("data-withdraw-asset") || "USDT";
            const assetTitle = document.getElementById("txWithdrawAssetTitle");
            const assetIcon = document.getElementById("txWithdrawAssetIcon");
            const assetHiddenInput = document.getElementById("modalWithdrawAsset");

            if (assetTitle) assetTitle.textContent = asset;
            if (assetHiddenInput) assetHiddenInput.value = asset;
            
            const iconMap = {
                "USDT": `<span id="txWithdrawAssetIcon" class="h-6 w-6 shrink-0 rounded-full bg-[#26a17b] text-white flex items-center justify-center text-xs font-black">₮</span>`,
                "BTC": `<span id="txWithdrawAssetIcon" class="h-6 w-6 shrink-0 rounded-full bg-[#f7931a] text-white flex items-center justify-center text-xs font-black">₿</span>`,
                "ETH": `<span id="txWithdrawAssetIcon" class="h-6 w-6 shrink-0 rounded-full bg-[#627eea] text-white flex items-center justify-center text-xs font-black">Ξ</span>`,
                "SOL": `<span id="txWithdrawAssetIcon" class="h-6 w-6 shrink-0 rounded-full bg-[#14f195] text-slate-950 flex items-center justify-center text-xs font-black">◎</span>`,
                "BNB": `<span id="txWithdrawAssetIcon" class="h-6 w-6 shrink-0 rounded-full bg-[#f3ba2f] text-slate-950 flex items-center justify-center text-xs font-black">🟡</span>`,
                "XRP": `<span id="txWithdrawAssetIcon" class="h-6 w-6 shrink-0 rounded-full bg-[#23292f] text-white flex items-center justify-center text-xs font-black">✕</span>`
            };
            if (assetIcon && iconMap[asset]) {
                assetIcon.outerHTML = iconMap[asset];
            }

            // Update network options based on selected asset
            txPopulateWithdrawNetworkOptions(asset);

            WALLET_STATE.activeWithdrawalCurrency = asset;
            updateWithdrawalModalUIByCurrency(asset, true);

            if (assetMenu) assetMenu.classList.add("hidden");
        };
    });

    // Network Selection Options Click handler
    txBindWithdrawNetworkMenuOptions();

    // Paste Address from Clipboard
    if (pasteBtn && addressInput) {
        pasteBtn.onclick = async (e) => {
            e.preventDefault();
            try {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                        addressInput.value = text.trim();
                        addressInput.dispatchEvent(new Event("input"));
                        showWalletAlert("Wallet address pasted from clipboard!", "success");
                    }
                } else {
                    showWalletAlert("Please paste address manually (Ctrl+V).", "info");
                }
            } catch (err) {
                showWalletAlert("Please paste address manually (Ctrl+V).", "info");
            }
        };
    }

    // Use Max Button
    if (maxBtn && amountInput) {
        maxBtn.onclick = (e) => {
            e.preventDefault();
            const activeCurrency = String(WALLET_STATE.activeWithdrawalCurrency || "USDT").toUpperCase();
            const wallet = WALLET_STATE.wallet || {};
            const key = activeCurrency === "INR" ? "main_wallet_inr" : activeCurrency === "USDT" ? "main_wallet_usdt" : `main_wallet_${activeCurrency.toLowerCase()}`;
            const coinWallet = wallet[key] || wallet[`main_wallet_${activeCurrency.toLowerCase()}`] || { available_balance: 0 };
            const avail = walletNumber(coinWallet.available_balance, 0);
            
            amountInput.value = avail > 0 ? (avail < 1 ? avail.toFixed(6) : avail.toFixed(2)) : "0.00";
            amountInput.dispatchEvent(new Event("input"));
        };
    }

    // Live Receive & Fee calculation on input
    if (amountInput) {
        const calculateReceive = () => {
            const amt = parseFloat(amountInput.value) || 0;
            const netSelect = document.getElementById("modalWithdrawNetwork");
            const selectedNet = netSelect?.value || "ERC20";
            const activeCurrency = String(WALLET_STATE.activeWithdrawalCurrency || "USDT").toUpperCase();

            const fee = txGetConfiguredWithdrawalFee(amt, selectedNet);
            const receive = Math.max(0, amt - fee);

            const receiveApproxEl = document.getElementById("txWithdrawModalReceiveApprox");
            if (receiveApproxEl) {
                receiveApproxEl.textContent = amt > 0 ? `${receive.toFixed(2)} ${activeCurrency}` : `0.00 ${activeCurrency}`;
            }

            const pAmt = document.getElementById("modalWithdrawPreviewAmount");
            const pRec = document.getElementById("modalWithdrawPreviewReceive");
            const pFee = document.getElementById("modalWithdrawPreviewCompanyFee");
            const pDeb = document.getElementById("modalWithdrawPreviewTotalDebit");
            const pNote = document.getElementById("modalWithdrawPreviewNote");

            if (pAmt) pAmt.textContent = amt > 0 ? (activeCurrency === "INR" ? `₹${amt.toFixed(2)}` : `$${amt.toFixed(2)}`) : "--";
            if (pRec) pRec.textContent = amt > 0 ? (activeCurrency === "INR" ? `₹${receive.toFixed(2)}` : `$${receive.toFixed(2)}`) : "--";
            if (pFee) pFee.textContent = activeCurrency === "INR" ? `₹${fee.toFixed(2)}` : `$${fee.toFixed(2)}`;
            if (pDeb) pDeb.textContent = amt > 0 ? (activeCurrency === "INR" ? `₹${amt.toFixed(2)}` : `$${amt.toFixed(2)}`) : "--";
            if (pNote) {
                pNote.textContent = amt > 0 
                    ? (fee > 0 ? `Withdrawal fee of ${activeCurrency === "INR" ? "₹" : "$"}${fee.toFixed(2)} will be deducted automatically from payout.` : `No withdrawal fee applicable (Free).`)
                    : `Enter amount to calculate fees and receive amount.`;
            }

            // Also debounce query to backend fee estimate
            scheduleWithdrawalFeeEstimate();
        };

        amountInput.oninput = calculateReceive;
        amountInput.onkeyup = calculateReceive;
        calculateReceive();
    }
}

async function txPromptOrAutofillSavedBank(force = false) {
    const isModal = isWalletActionModalOpen();
    const prefix = isModal ? "modal" : "main";
    try {
        let accounts = [];
        if (typeof window.txGetPrimaryBankAccount === "function") {
            const primary = await window.txGetPrimaryBankAccount();
            if (primary) accounts = [primary];
        }
        if (!accounts.length) {
            const resp = await apiRequest("/user/bank-accounts");
            accounts = resp.data?.bank_accounts || [];
        }

        if (!accounts.length) {
            if (force) {
                showWalletAlert("No saved bank accounts found. Please enter your bank details manually.", "info");
            }
            return;
        }

        const populateAccount = (acc) => {
            const holderInput = document.getElementById(`${prefix}WithdrawHolderName`);
            const bankNameInput = document.getElementById(`${prefix}WithdrawBankName`);
            const accNumInput = document.getElementById(`${prefix}WithdrawAccountNumber`);
            const ifscInput = document.getElementById(`${prefix}WithdrawIfscCode`);
            const upiInput = document.getElementById(`${prefix}WithdrawUpiId`);

            if (holderInput) holderInput.value = acc.account_holder_name || "";
            if (bankNameInput) bankNameInput.value = acc.bank_name || "";
            if (accNumInput) accNumInput.value = acc.account_number || "";
            if (ifscInput) ifscInput.value = (acc.ifsc_code || "").toUpperCase();
            if (upiInput) upiInput.value = acc.upi_id || "";

            if (force) {
                showWalletAlert(`Autofilled bank details for ${acc.account_holder_name || acc.bank_name || "Saved Account"}!`, "success");
            }
        };

        const primaryAcc = accounts.find(a => a.is_primary) || accounts[0];
        populateAccount(primaryAcc);
    } catch (err) {
        if (force) {
            showWalletAlert("Unable to load saved bank accounts. Please enter details manually.", "error");
        }
    }
}

function txInitInrWithdrawModalInteractive() {
    const inrAmountInput = document.getElementById("modalWithdrawInrAmount");
    const maxBtn = document.getElementById("txWithdrawInrMaxBtn");
    const refreshBtn = document.getElementById("txWithdrawInrRefreshBtn");
    const useSavedBtn = document.getElementById("txUseSavedBankBtn");

    const updateInrSummary = () => {
        const amt = parseFloat(inrAmountInput?.value) || 0;
        const fee = txGetConfiguredWithdrawalFee(amt, "UPI/BANK");
        const receive = Math.max(0, amt - fee);

        const summaryAmt = document.getElementById("modalWithdrawSummaryAmount");
        const summaryFee = document.getElementById("modalWithdrawSummaryFee");
        const summaryRec = document.getElementById("modalWithdrawSummaryReceive");

        if (summaryAmt) summaryAmt.textContent = `₹ ${amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (summaryFee) summaryFee.textContent = `₹ ${fee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (summaryRec) summaryRec.textContent = `₹ ${receive.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    if (inrAmountInput) {
        inrAmountInput.oninput = updateInrSummary;
        inrAmountInput.onkeyup = updateInrSummary;
    }

    if (maxBtn && inrAmountInput) {
        maxBtn.onclick = (e) => {
            e.preventDefault();
            const wallet = WALLET_STATE.wallet || {};
            const inrWallet = wallet["main_wallet_inr"] || { available_balance: 0 };
            const avail = walletNumber(inrWallet.available_balance, 0);
            inrAmountInput.value = avail > 0 ? avail.toFixed(2) : "0.00";
            updateInrSummary();
        };
    }

    if (refreshBtn) {
        refreshBtn.onclick = async (e) => {
            e.preventDefault();
            const svgIcon = refreshBtn.querySelector("svg");
            if (svgIcon) svgIcon.classList.add("animate-spin");
            try {
                await loadWalletData({ silent: true });
                const wallet = WALLET_STATE.wallet || {};
                const inrWallet = wallet["main_wallet_inr"] || { available_balance: 0 };
                const avail = walletNumber(inrWallet.available_balance, 0);
                const inrAvailText = document.getElementById("txInrAvailText");
                const inrCardBal = document.getElementById("txWithdrawInrCardBalance");
                if (inrAvailText) inrAvailText.textContent = `₹ ${avail.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                if (inrCardBal) inrCardBal.textContent = `₹ ${avail.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                showWalletAlert("Wallet balance refreshed!", "success");
            } catch (err) {
                console.warn(err);
            } finally {
                if (svgIcon) setTimeout(() => svgIcon.classList.remove("animate-spin"), 500);
            }
        };
    }

    if (useSavedBtn) {
        useSavedBtn.onclick = async (e) => {
            e.preventDefault();
            await txPromptOrAutofillSavedBank(true);
        };
    }

    const clearBankBtn = document.getElementById("txClearBankDetailsBtn");
    if (clearBankBtn) {
        clearBankBtn.onclick = (e) => {
            e.preventDefault();
            const holderInput = document.getElementById("modalWithdrawHolderName");
            const bankNameInput = document.getElementById("modalWithdrawBankName");
            const accNumInput = document.getElementById("modalWithdrawAccountNumber");
            const ifscInput = document.getElementById("modalWithdrawIfscCode");
            const upiInput = document.getElementById("modalWithdrawUpiId");

            if (holderInput) holderInput.value = "";
            if (bankNameInput) bankNameInput.value = "";
            if (accNumInput) accNumInput.value = "";
            if (ifscInput) ifscInput.value = "";
            if (upiInput) upiInput.value = "";

            showWalletAlert("Bank details cleared. You can enter new details.", "info");
        };
    }
}

function txPopulateWithdrawNetworkOptions(asset = "USDT") {
    const netMenu = document.getElementById("txWithdrawNetworkMenu");
    const netSelect = document.getElementById("modalWithdrawNetwork");
    if (!netMenu || !netSelect) return;

    if (asset === "USDT") {
        netMenu.innerHTML = `
            <button type="button" data-withdraw-network="ERC20" class="tx-w-net-opt w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-white hover:bg-cyan-500/20 hover:text-cyan-300 transition cursor-pointer">
                <span class="h-5 w-5 rounded-full bg-[#627eea]/20 text-[#627eea] flex items-center justify-center text-[10px] font-black border border-[#627eea]/40">⬨</span>
                <span>ERC20 (Ethereum)</span>
            </button>
            <button type="button" data-withdraw-network="TRC20" class="tx-w-net-opt w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-white hover:bg-cyan-500/20 hover:text-cyan-300 transition cursor-pointer">
                <span class="h-5 w-5 rounded-full bg-[#ef0027]/20 text-[#ef0027] flex items-center justify-center text-[10px] font-black border border-[#ef0027]/40">₮</span>
                <span>TRC20 (TRON)</span>
            </button>
            <button type="button" data-withdraw-network="BEP20" class="tx-w-net-opt w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-white hover:bg-cyan-500/20 hover:text-cyan-300 transition cursor-pointer">
                <span class="h-5 w-5 rounded-full bg-[#f3ba2f]/20 text-[#f3ba2f] flex items-center justify-center text-[10px] font-black border border-[#f3ba2f]/40">🟡</span>
                <span>BEP20 (BNB Smart Chain)</span>
            </button>
        `;
        netSelect.value = "ERC20";
        txSetWithdrawNetworkDisplay("ERC20", "ERC20 (Ethereum)", "⬨", "#627eea");
    } else if (asset === "BTC") {
        netMenu.innerHTML = `
            <button type="button" data-withdraw-network="BITCOIN" class="tx-w-net-opt w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-white hover:bg-cyan-500/20 hover:text-cyan-300 transition cursor-pointer">
                <span class="h-5 w-5 rounded-full bg-[#f7931a]/20 text-[#f7931a] flex items-center justify-center text-[10px] font-black border border-[#f7931a]/40">₿</span>
                <span>Bitcoin Mainnet</span>
            </button>
            <button type="button" data-withdraw-network="ERC20" class="tx-w-net-opt w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-white hover:bg-cyan-500/20 hover:text-cyan-300 transition cursor-pointer">
                <span class="h-5 w-5 rounded-full bg-[#627eea]/20 text-[#627eea] flex items-center justify-center text-[10px] font-black border border-[#627eea]/40">⬨</span>
                <span>ERC20 (Sepolia/MetaMask)</span>
            </button>
        `;
        netSelect.value = "BITCOIN";
        txSetWithdrawNetworkDisplay("BITCOIN", "Bitcoin Mainnet", "₿", "#f7931a");
    } else if (asset === "ETH") {
        netMenu.innerHTML = `
            <button type="button" data-withdraw-network="ERC20" class="tx-w-net-opt w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-white hover:bg-cyan-500/20 hover:text-cyan-300 transition cursor-pointer">
                <span class="h-5 w-5 rounded-full bg-[#627eea]/20 text-[#627eea] flex items-center justify-center text-[10px] font-black border border-[#627eea]/40">⬨</span>
                <span>Ethereum Mainnet (ERC20)</span>
            </button>
        `;
        netSelect.value = "ERC20";
        txSetWithdrawNetworkDisplay("ERC20", "Ethereum Mainnet (ERC20)", "⬨", "#627eea");
    } else if (asset === "SOL") {
        netMenu.innerHTML = `
            <button type="button" data-withdraw-network="SOLANA" class="tx-w-net-opt w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-white hover:bg-cyan-500/20 hover:text-cyan-300 transition cursor-pointer">
                <span class="h-5 w-5 rounded-full bg-[#14f195]/20 text-[#14f195] flex items-center justify-center text-[10px] font-black border border-[#14f195]/40">◎</span>
                <span>Solana Network</span>
            </button>
        `;
        netSelect.value = "SOLANA";
        txSetWithdrawNetworkDisplay("SOLANA", "Solana Network", "◎", "#14f195");
    } else if (asset === "BNB") {
        netMenu.innerHTML = `
            <button type="button" data-withdraw-network="BEP20" class="tx-w-net-opt w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-white hover:bg-cyan-500/20 hover:text-cyan-300 transition cursor-pointer">
                <span class="h-5 w-5 rounded-full bg-[#f3ba2f]/20 text-[#f3ba2f] flex items-center justify-center text-[10px] font-black border border-[#f3ba2f]/40">🟡</span>
                <span>BNB Smart Chain (BEP20)</span>
            </button>
        `;
        netSelect.value = "BEP20";
        txSetWithdrawNetworkDisplay("BEP20", "BNB Smart Chain (BEP20)", "🟡", "#f3ba2f");
    }

    txBindWithdrawNetworkMenuOptions();
}

function txSetWithdrawNetworkDisplay(netVal, netTitle, iconChar, colorHex) {
    const netTitleEl = document.getElementById("txWithdrawNetworkTitle");
    const netIconEl = document.getElementById("txWithdrawNetworkIcon");
    const netSelect = document.getElementById("modalWithdrawNetwork");

    if (netTitleEl) netTitleEl.textContent = netTitle;
    if (netIconEl) {
        netIconEl.outerHTML = `<span id="txWithdrawNetworkIcon" class="h-6 w-6 shrink-0 rounded-full bg-[${colorHex}]/20 text-[${colorHex}] flex items-center justify-center text-xs font-black border border-[${colorHex}]/40">${iconChar}</span>`;
    }
    if (netSelect) netSelect.value = netVal;

    const activeCurrency = String(WALLET_STATE.activeWithdrawalCurrency || "USDT").toUpperCase();
    const addressInput = document.getElementById("modalWithdrawalAddress");
    if (addressInput) {
        addressInput.placeholder = `Enter ${activeCurrency} wallet address (${netVal})`;
    }

    const amountInput = document.getElementById("modalWithdrawAmount");
    const amt = parseFloat(amountInput?.value) || 0;
    txUpdateWithdrawalFeeDisplay(amt, netVal);

    if (amountInput) amountInput.dispatchEvent(new Event("input"));
}

function txBindWithdrawNetworkMenuOptions() {
    const netMenu = document.getElementById("txWithdrawNetworkMenu");
    document.querySelectorAll(".tx-w-net-opt").forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const netVal = btn.getAttribute("data-withdraw-network") || "ERC20";
            const labelText = btn.querySelector("span:last-child")?.textContent || netVal;
            const iconChar = netVal === "TRC20" ? "₮" : netVal === "BEP20" ? "🟡" : netVal === "BITCOIN" ? "₿" : netVal === "SOLANA" ? "◎" : "⬨";
            const colorHex = netVal === "TRC20" ? "#ef0027" : netVal === "BEP20" ? "#f3ba2f" : netVal === "BITCOIN" ? "#f7931a" : netVal === "SOLANA" ? "#14f195" : "#627eea";

            txSetWithdrawNetworkDisplay(netVal, labelText, iconChar, colorHex);

            if (netMenu) netMenu.classList.add("hidden");
        };
    });
}

function updateMainWithdrawalPageBalanceDisplay(currencyParam = null) {
    const wallet = WALLET_STATE.wallet || {};
    const currency = String(currencyParam || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const balanceEl = document.getElementById("mainWithdrawalPageBalance");
    if (balanceEl) {
        let balance = 0;
        const key = `main_wallet_${currency.toLowerCase()}`;
        if (wallet[key]) {
            balance = wallet[key].available_balance ?? 0;
        } else if (currency === "INR") {
            balance = wallet.main_wallet_inr?.available_balance ?? 0;
        } else if (currency === "USDT") {
            balance = wallet.main_wallet_usdt?.available_balance ?? 0;
        } else {
            balance = 0;
        }

        if (["INR", "USDT"].includes(currency)) {
            if (currency === "INR") {
                balanceEl.textContent = `₹${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            } else {
                balanceEl.textContent = `$${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            }
        } else {
            balanceEl.textContent = `${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currency}`;
        }
    }
}

function updateWalletFaqUI(currency) {
    const activeCurrency = String(currency || WALLET_STATE.activeWithdrawalCurrency || "USDT").toUpperCase();
    const isINR = activeCurrency === "INR";
    
    const faqs = isINR ? [
        {
            q: "How to withdraw INR?",
            a: "Go to the Wallet tab, select Withdraw, choose the ₹ INR tab, enter the amount you want to withdraw, provide your Bank Account details (Holder name, Bank name, Account number, IFSC code) or UPI ID, and click Submit. Your request will be processed immediately after Admin approval."
        },
        {
            q: "How long does it take to withdraw INR?",
            a: "INR withdrawals are processed via standard IMPS or NEFT bank transfers. Payouts are usually settled within 10 to 30 minutes after approval by the TraidiumX security team."
        },
        {
            q: "What are INR withdrawal limits?",
            a: "The minimum withdrawal limit for INR is ₹500 INR per transaction. The maximum daily limit is ₹5,00,000 INR for fully verified accounts."
        },
        {
            q: "What are INR withdrawal fees?",
            a: "INR withdrawals via bank transfer and UPI are 100% free. TraidiumX does not charge any service fees for fiat withdrawals."
        }
    ] : [
        {
            q: "How to withdraw Crypto?",
            a: "Go to the Wallet tab, select Withdraw, choose the $ USD / Crypto tab, enter the amount in USD, choose the withdrawal network (TRC20, BEP20, or ERC20), enter your external wallet address, and click Submit. Make sure the network matches your destination address."
        },
        {
            q: "How long does it take to withdraw Crypto?",
            a: "Crypto withdrawals are automated. Once approved by our team, transaction processing takes 1 to 5 minutes depending on blockchain confirmation times and network congestion."
        },
        {
            q: "What are Crypto withdrawal limits?",
            a: "The minimum withdrawal limit is $10 USD. There is no maximum withdrawal limit for users who have completed KYC verification."
        },
        {
            q: "What are Crypto withdrawal fees?",
            a: "Withdrawal fees depend on the chosen network: TRC20 is $1.00 USD, BEP20 is $0.80 USD, and ERC20 is $5.00 USD. These fees cover blockchain network gas costs."
        }
    ];

    const accordion = document.getElementById("txFaqAccordion");
    if (!accordion) return;

    accordion.innerHTML = faqs.map((faq, idx) => `
        <div class="border-b border-white/5 pb-2.5 last:border-0 last:pb-0">
            <button type="button" class="w-full flex items-center justify-between text-left hover:text-white cursor-pointer transition font-bold py-1.5 focus:outline-none" onclick="toggleWalletFaqAnswer(${idx})">
                <span>${faq.q}</span>
                <span id="faqArrow_${idx}" class="text-slate-500 text-xs transition-transform duration-200">›</span>
            </button>
            <div id="faqAns_${idx}" class="max-h-0 overflow-hidden transition-all duration-300 ease-out text-slate-400 font-semibold text-[11px] leading-relaxed mt-1">
                <p class="pb-1">${faq.a}</p>
            </div>
        </div>
    `).join("");
}

window.toggleWalletFaqAnswer = function(idx) {
    const ans = document.getElementById(`faqAns_${idx}`);
    const arrow = document.getElementById(`faqArrow_${idx}`);
    if (!ans || !arrow) return;

    const isOpen = ans.style.maxHeight && ans.style.maxHeight !== "0px";
    
    // Close all other answers (accordion effect)
    for (let i = 0; i < 4; i++) {
        const otherAns = document.getElementById(`faqAns_${i}`);
        const otherArrow = document.getElementById(`faqArrow_${i}`);
        if (otherAns && otherAns !== ans) {
            otherAns.style.maxHeight = "0px";
        }
        if (otherArrow && otherArrow !== arrow) {
            otherArrow.style.transform = "rotate(0deg)";
        }
    }

    if (isOpen) {
        ans.style.maxHeight = "0px";
        arrow.style.transform = "rotate(0deg)";
    } else {
        ans.style.maxHeight = ans.scrollHeight + "px";
        arrow.style.transform = "rotate(90deg)";
    }
};

function initWalletEvents() {
    injectWalletPageStyles();

    window.addEventListener("traidiumx:currency-change", (event) => {
        renderWalletPage();
        updateWithdrawalModalUIByCurrency();
        bindRealtimeConversionCalculator();
    });

    walletElements.refreshBtn?.addEventListener("click", (event) => {
        event.preventDefault();
        loadWalletData();
    });

    // Automatically poll and sync live MT5 and wallet balances in real-time
    setInterval(() => {
        if (document.visibilityState === "visible" && typeof isLoggedIn === "function" && isLoggedIn()) {
            loadWalletData({ silent: true });
        }
    }, 4000);

    document.getElementById("copyInrUpiBtn")?.addEventListener("click", copyInrUpiIdToClipboard);

    document.getElementById("txTransferMaxBtn")?.addEventListener("click", () => {
        const dir = document.getElementById("walletTransferDirection")?.value || "main_to_trading";
        const mainWallet = getMainWalletData();
        const tradingWallet = getTradingWalletData();
        const amountInput = document.getElementById("walletTransferAmount");

        if (amountInput) {
            if (dir === "main_to_trading") {
                amountInput.value = walletNumber(mainWallet.available_balance, 0);
            } else {
                amountInput.value = walletNumber(tradingWallet.available_balance, 0);
            }
            amountInput.dispatchEvent(new Event("input"));
        }
    });

    document.getElementById("txSelectInrBtn")?.addEventListener("click", () => {
        updateDepositModalUIByCurrency("INR");
    });
    document.getElementById("txSelectUsdtBtn")?.addEventListener("click", () => {
        updateDepositModalUIByCurrency("USDT");
    });

    // Main page withdrawal toggles
    document.getElementById("mainSelectWithdrawInrBtn")?.addEventListener("click", () => {
        updateWithdrawalModalUIByCurrency("INR", false);
        txAutofillWithdrawBankDetails(false);
    });
    document.getElementById("mainSelectWithdrawUsdtBtn")?.addEventListener("click", () => {
        updateWithdrawalModalUIByCurrency("USDT", false);
    });

    // Modal page withdrawal toggles
    document.getElementById("modalSelectWithdrawInrBtn")?.addEventListener("click", () => {
        updateWithdrawalModalUIByCurrency("INR", true);
        txAutofillWithdrawBankDetails(true);
    });
    document.getElementById("modalSelectWithdrawUsdtBtn")?.addEventListener("click", () => {
        updateWithdrawalModalUIByCurrency("USDT", true);
    });

    walletElements.openTransferBtn?.addEventListener("click", () => {
        checkAndShowCurrencyLockModal();
        openWalletActionModal("transfer");
    });
    walletElements.openDepositBtn?.addEventListener("click", () => {
        WALLET_STATE.activeDepositCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
        checkAndShowCurrencyLockModal();
        loadInrDepositDetails();
        openWalletActionModal("deposit");
    });

    walletElements.openWithdrawBtn?.addEventListener("click", () => {
        WALLET_STATE.activeWithdrawalCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
        checkAndShowCurrencyLockModal();
        updateWithdrawalModalUIByCurrency(WALLET_STATE.activeWithdrawalCurrency, true);
        openWalletActionModal("withdraw");
        // Autofill saved primary bank account from profile
        txAutofillWithdrawBankDetails(true);
    });
    walletElements.actionModalClose?.addEventListener("click", closeWalletActionModal);
    walletElements.actionBackdrop?.addEventListener("click", closeWalletActionModal);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isWalletActionModalOpen()) {
            closeWalletActionModal();
        }
    });

    walletElements.unifiedTransferForm?.addEventListener("submit", handleUnifiedWalletTransferSubmit);

    walletElements.internalTransferForm?.addEventListener("submit", handleInternalTransferSubmit);
    walletElements.internalTransferAsset?.addEventListener("change", updateInternalTransferBalance);
    document.getElementById("txInternalTransferMaxBtn")?.addEventListener("click", () => {
        const wallet = WALLET_STATE.wallet || {};
        const asset = walletElements.internalTransferAsset?.value || "USDT";
        const assetWallet = wallet[`main_wallet_${asset.toLowerCase()}`] || { available_balance: 0 };
        if (walletElements.internalTransferAmount) {
            walletElements.internalTransferAmount.value = walletNumber(assetWallet.available_balance, 0);
        }
    });

    // Exchange Form event bindings
    const exchangeForm = document.getElementById("walletExchangeForm");
    exchangeForm?.addEventListener("submit", handleExchangeSubmit);

    document.getElementById("walletExchangeFromAsset")?.addEventListener("change", () => {
        updateExchangePreview();
        updateWalletActionModalBalances();
    });
    document.getElementById("walletExchangeToAsset")?.addEventListener("change", () => {
        updateExchangePreview();
        updateWalletActionModalBalances();
    });
    document.getElementById("walletExchangeAmount")?.addEventListener("input", updateExchangePreview);
    document.getElementById("txExchangeMaxBtn")?.addEventListener("click", () => {
        const fromAsset = document.getElementById("walletExchangeFromAsset")?.value;
        if (!fromAsset) return;
        const wallet = WALLET_STATE.wallet || {};
        const fromBucket = wallet[`main_wallet_${fromAsset.toLowerCase()}`];
        const avail = walletNumber(fromBucket?.available_balance, 0);
        const amountInput = document.getElementById("walletExchangeAmount");
        if (amountInput) {
            amountInput.value = avail;
            updateExchangePreview();
        }
    });
    walletElements.demoDepositForm?.addEventListener("submit", handleDemoDepositSubmit);
    walletElements.demoWithdrawForm?.addEventListener("submit", handleDemoWithdrawSubmit);
    walletElements.mainToTradingForm?.addEventListener("submit", (event) => handleWalletTransferSubmit(event, "main_to_trading"));
    walletElements.tradingToMainForm?.addEventListener("submit", (event) => handleWalletTransferSubmit(event, "trading_to_main"));
    walletElements.demoCreditForm?.addEventListener("submit", handleDemoCreditSubmit);
    walletElements.depositForm?.addEventListener("submit", handleDepositSubmit);
    document.getElementById("mainWithdrawalForm")?.addEventListener("submit", handleWithdrawalSubmit);
    document.getElementById("modalWithdrawalForm")?.addEventListener("submit", handleWithdrawalSubmit);
    walletElements.cryptoNetwork?.addEventListener("change", () => {
        WALLET_STATE.cryptoDeposit.selectedNetwork = getSelectedCryptoNetwork();
        updateCryptoDepositAddressUI();
    });

    document.querySelectorAll(".inr-quick-chip").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const val = parseInt(btn.getAttribute("data-inr-quick") || "0", 10);
            if (!val) return;
            const inp = document.getElementById("depositAmount");
            if (inp) {
                inp.value = val;
                inp.dispatchEvent(new Event("input"));
            }
        });
    });

    document.querySelectorAll(".tx-inr-method-card").forEach((card) => {
        card.addEventListener("click", (e) => {
            e.preventDefault();
            const method = card.getAttribute("data-inr-method");
            document.querySelectorAll(".tx-inr-method-card").forEach((c) => c.classList.remove("active"));
            card.classList.add("active");

            const infoText = document.getElementById("txInrMethodInfoText");
            const submitBtn = document.getElementById("createDepositBtn");

            if (method === "bank") {
                if (infoText) infoText.textContent = "🏦 Direct Bank Transfer via IMPS / NEFT / RTGS or Instant Bank Gateway.";
                if (submitBtn) submitBtn.innerHTML = `<svg class="w-4 h-4 text-slate-950" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V10M5 21V10M9 21V10M13 21V10M3 10h18M12 3L2 10h20L12 3z"/></svg> Proceed with Bank Transfer`;
            } else if (method === "card") {
                if (infoText) infoText.textContent = "💳 Secure Debit & Credit Card deposit (Visa, MasterCard, RuPay).";
                if (submitBtn) submitBtn.innerHTML = `<svg class="w-4 h-4 text-slate-950" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Proceed with Card Payment`;
            } else {
                if (infoText) infoText.textContent = "⚡ Instant UPI deposit via Google Pay, PhonePe, Paytm or BHIM.";
                if (submitBtn) submitBtn.innerHTML = `<svg class="w-4 h-4 text-slate-950" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Proceed with UPI Payment`;
            }
        });
    });

    document.getElementById("txNetworkTabs")?.querySelectorAll(".tx-net-tab").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const netVal = btn.getAttribute("data-network-tab");
            WALLET_STATE.cryptoDeposit.selectedNetwork = netVal;
            if (walletElements.cryptoNetwork) {
                walletElements.cryptoNetwork.value = netVal;
            }
            updateCryptoDepositAddressUI();
        });
    });

    walletElements.copyCryptoAddressBtn?.addEventListener("click", copyCryptoDepositAddress);
    walletElements.payWithMetaMaskBtn?.addEventListener("click", handleMetaMaskPayment);

    sanitizePositiveAmountInput(walletElements.demoDepositAmount || walletElements.demoCreditAmount, 6);
    sanitizePositiveAmountInput(walletElements.demoWithdrawAmount, 6);
    sanitizePositiveAmountInput(walletElements.mainToTradingAmount, 6);
    sanitizePositiveAmountInput(walletElements.tradingToMainAmount, 6);
    sanitizePositiveAmountInput(walletElements.unifiedTransferAmount, 6);
    sanitizePositiveAmountInput(walletElements.depositAmount, 6);

    const mainWithdrawAmount = document.getElementById("mainWithdrawAmount");
    const modalWithdrawAmount = document.getElementById("modalWithdrawAmount");
    if (mainWithdrawAmount) sanitizePositiveAmountInput(mainWithdrawAmount, 6);
    if (modalWithdrawAmount) sanitizePositiveAmountInput(modalWithdrawAmount, 6);

    mainWithdrawAmount?.addEventListener("input", scheduleWithdrawalFeeEstimate);
    modalWithdrawAmount?.addEventListener("input", scheduleWithdrawalFeeEstimate);

    document.getElementById("mainWithdrawNetwork")?.addEventListener("change", () => estimateWithdrawalFee(false));
    document.getElementById("modalWithdrawNetwork")?.addEventListener("change", () => estimateWithdrawalFee(false));

    setWithdrawalFeePreview(null);

    if (walletElements.depositAddressConfirmation) {
        walletElements.depositAddressConfirmation.addEventListener("input", () => {
            walletElements.depositAddressConfirmation.value = walletElements.depositAddressConfirmation.value.replace(/\s/g, "").slice(0, 140);
        });
    }

    const mainWithdrawalAddress = document.getElementById("mainWithdrawalAddress");
    const modalWithdrawalAddress = document.getElementById("modalWithdrawalAddress");
    if (mainWithdrawalAddress) {
        mainWithdrawalAddress.addEventListener("input", () => {
            mainWithdrawalAddress.value = mainWithdrawalAddress.value.replace(/\s/g, "").slice(0, 128);
        });
    }
    if (modalWithdrawalAddress) {
        modalWithdrawalAddress.addEventListener("input", () => {
            modalWithdrawalAddress.value = modalWithdrawalAddress.value.replace(/\s/g, "").slice(0, 128);
        });
    }

    bindHistoryFilters();
    updateCryptoDepositAddressUI();
    bindRealtimeConversionCalculator();
    // Initialize ledger sub-account dropdown if parent account
    txInitLedgerSubAccountDropdown();
    initRecipientLookup();

    // Total Balance Breakdown Tooltip (Mobile Click & Desktop Hover Support)
    const infoBtn = document.getElementById("txInfoBalanceBtn");
    const infoTooltip = document.getElementById("txBalanceBreakdownTooltip");
    if (infoBtn && infoTooltip) {
        infoBtn.addEventListener("mouseenter", () => {
            if (window.innerWidth >= 640) infoTooltip.classList.remove("hidden");
        });
        infoBtn.addEventListener("mouseleave", () => {
            if (window.innerWidth >= 640) infoTooltip.classList.add("hidden");
        });
        infoTooltip.addEventListener("mouseenter", () => {
            if (window.innerWidth >= 640) infoTooltip.classList.remove("hidden");
        });
        infoTooltip.addEventListener("mouseleave", () => {
            if (window.innerWidth >= 640) infoTooltip.classList.add("hidden");
        });

        infoBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            infoTooltip.classList.toggle("hidden");
        });

        document.addEventListener("click", (e) => {
            if (infoTooltip && !infoTooltip.classList.contains("hidden") && !e.target.closest("#txInfoBalanceBtn") && !e.target.closest("#txBalanceBreakdownTooltip")) {
                infoTooltip.classList.add("hidden");
            }
        });
    }
}


function focusWalletSectionFromNavigation() {
    let target = String(window.location.hash || "").replace("#", "").toLowerCase();

    try {
        const savedTarget = sessionStorage.getItem("traidiumx_wallet_focus_action");
        if (savedTarget) {
            target = String(savedTarget).toLowerCase();
            sessionStorage.removeItem("traidiumx_wallet_focus_action");
        }
    } catch (error) {
        console.warn("Unable to read wallet focus action.", error);
    }

    if (target === "trading" || target === "trading-accounts" || target === "trading_accounts") {
        const mainTabTrading = document.getElementById("mainTabTradingAccounts");
        if (mainTabTrading) mainTabTrading.click();
        return;
    }

    if (target === "deposit") {
        if (typeof window.txActivateDepositTab === "function") {
            window.txActivateDepositTab("crypto");
        }
        return;
    }

    if (target === "withdraw" || target === "withdrawal") {
        if (typeof window.txActivateWithdrawTab === "function") {
            window.txActivateWithdrawTab("crypto");
        }
        return;
    }

    if (target === "transfer") {
        window.setTimeout(() => {
            openWalletActionModal("transfer");
        }, 200);
        return;
    }

    if (target === "history") {
        if (typeof window.txActivateHistoryTab === "function") {
            window.txActivateHistoryTab();
        }
        return;
    }

    if (target === "overview" || !target) {
        const tabOverview = document.getElementById("mainTabOverview");
        if (tabOverview) tabOverview.click();
        return;
    }
}
window.focusWalletSectionFromNavigation = focusWalletSectionFromNavigation;
window.openWalletActionModal = openWalletActionModal;

function updateBalancePrivacyUI() {
    const hidden = isBalanceHidden();
    const eyeOpen = document.getElementById("txEyeOpenIcon");
    const eyeClosed = document.getElementById("txEyeClosedIcon");

    if (eyeOpen && eyeClosed) {
        eyeOpen.classList.toggle("hidden", hidden);
        eyeClosed.classList.toggle("hidden", !hidden);
    }

    const primeEyeOpen = document.getElementById("txPrimeEyeOpenIcon");
    const primeEyeClosed = document.getElementById("txPrimeEyeClosedIcon");
    if (primeEyeOpen && primeEyeClosed) {
        primeEyeOpen.classList.toggle("hidden", hidden);
        primeEyeClosed.classList.toggle("hidden", !hidden);
    }

    renderWalletPage();
}

function initBalancePrivacyToggle() {
    const toggleBtn = document.getElementById("txToggleBalancePrivacy");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const currentlyHidden = isBalanceHidden();
            localStorage.setItem("tx_balance_hidden", currentlyHidden ? "0" : "1");
            updateBalancePrivacyUI();
        });
    }

    const primeToggleBtn = document.getElementById("txPrimeTogglePrivacyBtn");
    if (primeToggleBtn) {
        primeToggleBtn.addEventListener("click", () => {
            const currentlyHidden = isBalanceHidden();
            localStorage.setItem("tx_balance_hidden", currentlyHidden ? "0" : "1");
            updateBalancePrivacyUI();
        });
    }

    const hidden = isBalanceHidden();
    const eyeOpen = document.getElementById("txEyeOpenIcon");
    const eyeClosed = document.getElementById("txEyeClosedIcon");
    if (eyeOpen && eyeClosed) {
        eyeOpen.classList.toggle("hidden", hidden);
        eyeClosed.classList.toggle("hidden", !hidden);
    }
    const primeEyeOpen = document.getElementById("txPrimeEyeOpenIcon");
    const primeEyeClosed = document.getElementById("txPrimeEyeClosedIcon");
    if (primeEyeOpen && primeEyeClosed) {
        primeEyeOpen.classList.toggle("hidden", hidden);
        primeEyeClosed.classList.toggle("hidden", !hidden);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    initBalancePrivacyToggle();
    loadCachedWalletData();

    // Skip loading overlay animation if switching sub-accounts
    if (localStorage.getItem("tx_skip_wallet_intro") === "1") {
        localStorage.removeItem("tx_skip_wallet_intro");
        const intro = document.getElementById("txWalletPageIntro");
        if (intro) {
            intro.style.display = "none";
            intro.remove();
        }
        document.body?.classList.remove("tx-wallet-intro-active");
    }

    initWalletEvents();
    startWalletAutoRefresh();
    scheduleWalletIntroSafety();
    updateLiveUsdtRate();

    // If cached wallet data is present, render it immediately and hide intro
    if (WALLET_STATE.wallet) {
        renderWalletPage();
        hideWalletPageIntro({ immediate: true });
    }

    // Initialize custom tab and sub-tab navigation
    if (typeof txInitTabs === "function") {
        txInitTabs();
    }
    if (typeof txInitSubTabs === "function") {
        txInitSubTabs();
    }
    if (typeof txInitPrimeOverview === "function") {
        txInitPrimeOverview();
    }

    document.getElementById("quickDepositBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        if (typeof window.txOpenDepositChoiceModal === "function") {
            window.txOpenDepositChoiceModal();
        } else {
            openWalletActionModal("deposit");
        }
    });
    document.getElementById("quickWithdrawBtn")?.addEventListener("click", () => {
        // Switch main tab to Wallet
        const tabWallet = document.getElementById("mainTabWallet");
        if (tabWallet) {
            tabWallet.click();
            // Switch sub-tab to Withdraw
            const tabWithdraw = document.getElementById("subTabWithdraw");
            if (tabWithdraw) tabWithdraw.click();
        }
    });
    document.getElementById("quickTransferBtn")?.addEventListener("click", () => {
        openWalletActionModal("transfer");
    });
    document.getElementById("quickExchangeBtn")?.addEventListener("click", () => {
        window.location.href = "./exchange.html";
    });
    document.getElementById("quickInternalTransferBtn")?.addEventListener("click", () => {
        openWalletActionModal("internal_transfer");
    });
    document.getElementById("tradingAccountTransferBtn")?.addEventListener("click", () => {
        openWalletActionModal("transfer");
    });

    // Parse query parameters for QR code direct actions
    const urlParams = new URLSearchParams(window.location.search);
    const recipient = urlParams.get("recipient");
    const asset = urlParams.get("asset");
    if (recipient && asset) {
        sessionStorage.setItem("tx_pending_internal_transfer", JSON.stringify({ recipient, asset }));
        // Clean URL to keep address bar clean
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }

    document.getElementById("assetSearchInput")?.addEventListener("input", txRenderAssetLists);
    document.getElementById("hideEmptyBalancesCheck")?.addEventListener("change", txRenderAssetLists);

    try {
        await Promise.all([
            txInitSubAccountsAndSelector(),
            loadWalletData()
        ]);
        
        // Handle pending internal transfer if any
        const pending = sessionStorage.getItem("tx_pending_internal_transfer");
        if (pending && isLoggedIn()) {
            try {
                const { recipient, asset } = JSON.parse(pending);
                sessionStorage.removeItem("tx_pending_internal_transfer");
                setTimeout(() => {
                    openWalletActionModal("internal_transfer", asset);
                    // Select Send tab
                    const btnSend = document.getElementById("txItTabBtnSend");
                    if (btnSend) btnSend.click();
                    
                    // Populate recipient
                    const recipientInput = document.getElementById("walletInternalTransferRecipient");
                    if (recipientInput) {
                        recipientInput.value = recipient;
                        recipientInput.dispatchEvent(new Event("input"));
                    }
                }, 800);
            } catch (e) {
                console.error("Error parsing pending internal transfer", e);
            }
        }
    } finally {
        await hideWalletPageIntro();
        focusWalletSectionFromNavigation();
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// Bank Account Autofill in Withdrawal Popup
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch the user's primary bank account (via profile.js global helper or direct API)
 * and pre-fill the withdrawal address input when INR mode is active.
 */
async function txAutofillWithdrawBankDetails(isModalParam = null) {
    const isModal = isModalParam !== null ? isModalParam : isWalletActionModalOpen();
    const prefix = isModal ? "modal" : "main";
    // Only autofill for INR withdrawals
    const activeCurrency = String(
        (isModal ? WALLET_STATE.activeWithdrawalCurrency : localStorage.getItem("tx_navbar_currency")) ||
        "USDT"
    ).toUpperCase();

    if (activeCurrency !== "INR") {
        return;
    }

    try {
        let primaryAccount = null;

        // Use profile.js exposed helper if available (same-page case)
        if (typeof window.txGetPrimaryBankAccount === "function") {
            primaryAccount = await window.txGetPrimaryBankAccount();
        } else {
            // Fallback: call API directly
            const resp = await apiRequest("/user/bank-accounts");
            const accounts = resp.data?.bank_accounts || [];
            primaryAccount = accounts.find(a => a.is_primary) || accounts[0] || null;
        }

        if (!primaryAccount) return;

        // Populate elements
        const holderInput = document.getElementById(`${prefix}WithdrawHolderName`);
        const bankNameInput = document.getElementById(`${prefix}WithdrawBankName`);
        const accNumInput = document.getElementById(`${prefix}WithdrawAccountNumber`);
        const ifscInput = document.getElementById(`${prefix}WithdrawIfscCode`);
        const upiInput = document.getElementById(`${prefix}WithdrawUpiId`);

        // Don't overwrite if user already typed something in account number
        if (accNumInput && accNumInput.value && accNumInput.value.trim().length > 2) return;

        if (holderInput) holderInput.value = primaryAccount.account_holder_name || "";
        if (bankNameInput) bankNameInput.value = primaryAccount.bank_name || "";
        if (accNumInput) accNumInput.value = primaryAccount.account_number || "";
        if (ifscInput) ifscInput.value = primaryAccount.ifsc_code || "";
        if (upiInput) upiInput.value = primaryAccount.upi_id || "";

        // Show a subtle autofill hint below the box
        const bankBox = document.getElementById("txWithdrawInrBankBox");
        if (bankBox) {
            let hintEl = document.getElementById("txWithdrawAutofillHint");
            if (!hintEl) {
                hintEl = document.createElement("div");
                hintEl.id = "txWithdrawAutofillHint";
                hintEl.className = "sm:col-span-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3.5 py-2.5 flex items-center justify-between text-xs text-cyan-200 mt-1";
                bankBox.appendChild(hintEl);
            }
            const name = primaryAccount.account_holder_name || primaryAccount.bank_name || "Saved Account";
            hintEl.innerHTML = `
                <div class="flex items-center gap-1.5 font-semibold">
                    <span class="text-amber-400">⭐</span>
                    <span>Autofilled from primary bank: <strong class="text-white font-bold">${name}</strong></span>
                </div>
                <button type="button" id="txClearAutofillBtn" class="text-rose-400 hover:text-rose-300 font-extrabold text-[11px] hover:underline cursor-pointer">Clear</button>
            `;

            document.getElementById("txClearAutofillBtn")?.addEventListener("click", () => {
                if (holderInput) holderInput.value = "";
                if (bankNameInput) bankNameInput.value = "";
                if (accNumInput) accNumInput.value = "";
                if (ifscInput) ifscInput.value = "";
                if (upiInput) upiInput.value = "";
                hintEl.remove();
            });
        }

    } catch (err) {
        // Silently fail
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// Sub-account Ledger Selector for Parent Account
// ══════════════════════════════════════════════════════════════════════════════

async function txInitLedgerSubAccountDropdown() {
    const dropdown = document.getElementById("ledgerAccountFilter");
    if (!dropdown) return;

    if (typeof getAuthUser !== "function" || typeof apiRequest !== "function") {
        return;
    }

    const user = getAuthUser();
    if (!user) return;

    const currentUserId = user._id || user.id;
    const isSubAccount = user.parent_user_id || user.role === "sub_account";

    try {
        const resp = await apiRequest("/user/sub-accounts");
        const subAccounts = resp.data || [];

        if (subAccounts.length === 0) {
            // Keep hidden if no sub-accounts exist
            dropdown.classList.add("hidden");
            return;
        }

        dropdown.innerHTML = "";

        // If main account, include the option to select Main Account
        if (!isSubAccount) {
            dropdown.innerHTML = `<option value="main">Main Account</option>`;
        }

        subAccounts.forEach(sub => {
            const isDemo = sub.is_demo || sub.account_mode === "demo" || sub.plan === "demo";
            const opt = document.createElement("option");
            opt.value = sub.id;
            opt.textContent = `${sub.name || `Sub Account (${sub.client_id})`} (${isDemo ? 'Demo' : 'Real'})`;
            
            // If the logged in user is this sub-account, mark it as selected by default
            if (isSubAccount && sub.id === currentUserId) {
                opt.selected = true;
            }
            dropdown.appendChild(opt);
        });

        dropdown.classList.remove("hidden");

        if (dropdown.dataset.bound !== "1") {
            dropdown.dataset.bound = "1";
            dropdown.addEventListener("change", () => {
                const val = dropdown.value;
                WALLET_STATE.selectedSubAccountId = val === "main" ? "main" : val;
                WALLET_STATE.lastHistoryFetchAt = 0;
                loadWalletData();
            });
        }
    } catch (err) {
        console.error("Failed to load sub-accounts for ledger filter:", err);
        dropdown.classList.add("hidden");
    }
}

// Global cache for sub-accounts list with localStorage persistence
let txSubAccountsLocalCache = [];
try {
    const cachedSubs = localStorage.getItem("tx_cached_sub_accounts");
    if (cachedSubs) {
        const parsed = JSON.parse(cachedSubs);
        if (Array.isArray(parsed) && parsed.length > 0) {
            txSubAccountsLocalCache = parsed;
        }
    }
} catch (_) {}

function txUpdateWalletActiveAccountBanner() {
    const banner = document.getElementById("txWalletActiveAccountBanner");
    const titleEl = document.getElementById("txWalletActiveAccountTitle");
    const badgeEl = document.getElementById("txWalletActivePlanBadge");
    const selector = document.getElementById("txWalletAccountSelector");
    
    const activeSubId = localStorage.getItem("traidiumx_active_user_id");
    const isMain = !activeSubId || activeSubId === "main";

    if (selector) {
        selector.value = isMain ? "main" : activeSubId;
    }
    const ledgerFilter = document.getElementById("ledgerAccountFilter");
    if (ledgerFilter) {
        ledgerFilter.value = isMain ? "main" : activeSubId;
    }

    if (isMain) {
        if (titleEl) titleEl.textContent = "Main Trading Account";
        if (badgeEl) {
            badgeEl.textContent = "Basic";
            badgeEl.className = "text-[9px] font-black uppercase px-2 py-0.5 rounded-md border border-cyan-500/30 bg-cyan-500/20 text-cyan-300 font-mono";
        }
    } else {
        const sub = (txSubAccountsLocalCache || []).find(s => s.id === activeSubId);
        if (sub) {
            if (titleEl) titleEl.textContent = sub.name;
            const planName = sub.plan_name || "Basic";
            const planColor = sub.plan_color || "cyan";
            const badgeColorClasses = {
                "cyan": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
                "emerald": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                "purple": "bg-purple-500/20 text-purple-300 border-purple-500/30",
                "amber": "bg-amber-500/20 text-amber-300 border-amber-500/30"
            }[planColor] || "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";

            if (badgeEl) {
                badgeEl.textContent = planName;
                badgeEl.className = `text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${badgeColorClasses} font-mono`;
            }
        }
    }
}

async function txInitSubAccountsAndSelector() {
    if (!isLoggedIn()) return;
    try {
        const response = await apiRequest("/user/sub-accounts");
        const subAccounts = response.data || [];
        if (Array.isArray(subAccounts) && subAccounts.length > 0) {
            txSubAccountsLocalCache = subAccounts;
            try {
                localStorage.setItem("tx_cached_sub_accounts", JSON.stringify(subAccounts));
            } catch (_) {}
        }

        if (typeof txRenderTradingAccounts === "function") {
            txRenderTradingAccounts();
        }

        // 1. Overview Page Selector & Banner
        const overviewSelector = document.getElementById("txWalletAccountSelector");
        if (overviewSelector) {
            overviewSelector.innerHTML = `<option value="main">Main Trading Account (Real)</option>`;
            subAccounts.filter(s => !s.is_parent).forEach(sub => {
                const isDemo = sub.is_demo || sub.account_mode === "demo" || sub.plan === "demo";
                const opt = document.createElement("option");
                opt.value = sub.id;
                const planText = isDemo ? " (Demo)" : (sub.plan_name ? ` (${sub.plan_name})` : " (Real)");
                opt.textContent = `${sub.name}${planText}`;
                overviewSelector.appendChild(opt);
            });

            if (overviewSelector.dataset.bound !== "1") {
                overviewSelector.dataset.bound = "1";
                overviewSelector.addEventListener("change", (e) => {
                    window.txSetActiveTradingAccount(e.target.value);
                });
            }
        }

        txUpdateWalletActiveAccountBanner();
        if (typeof txPopulateTradingAccountSelect === "function") {
            txPopulateTradingAccountSelect();
        }

        // 2. Navigation Header Selector if present
        const selector = document.getElementById("tradingAccountSelector");
        if (!selector) return;

        const user = typeof getAuthUser === "function" ? getAuthUser() : null;
        if (user && user.selected_platform === "mt5") {
            selector.classList.add("hidden");
            return;
        }
        
        selector.innerHTML = `<option value="main">Main Trading Account</option>`;
        subAccounts.filter(s => !s.is_parent).forEach(sub => {
            const opt = document.createElement("option");
            opt.value = sub.id;
            opt.textContent = sub.name;
            selector.appendChild(opt);
        });
        
        const activeSubId = localStorage.getItem("traidiumx_active_user_id");
        if (activeSubId) {
            selector.value = activeSubId;
        } else {
            selector.value = "main";
        }

        if (selector.dataset.bound !== "1") {
            selector.dataset.bound = "1";
            selector.addEventListener("change", (e) => {
                window.txSetActiveTradingAccount(e.target.value);
            });
        }
    } catch (e) {
        console.error("Failed to load sub accounts:", e);
    }
}

window.txSetActiveTradingAccount = async function(subId) {
    if (subId === "main" || !subId) {
        localStorage.removeItem("traidiumx_active_user_id");
        localStorage.setItem("traidiumx_active_user_name", "Main Trading Account");
        WALLET_STATE.selectedSubAccountId = null;
    } else {
        const selectedSub = txSubAccountsLocalCache.find(s => s.id === subId);
        const selectedName = selectedSub ? selectedSub.name : "Sub Account";
        localStorage.setItem("traidiumx_active_user_id", subId);
        localStorage.setItem("traidiumx_active_user_name", selectedName);
        WALLET_STATE.selectedSubAccountId = subId;
    }
    
    // Force fresh history fetch for newly selected account
    WALLET_STATE.lastHistoryFetchAt = 0;

    // 1. Immediately toggle active badges & banners in the UI
    txUpdateWalletActiveAccountBanner();
    txRenderAssetLists();
    txRenderTradingAccounts();
    updateWalletActionModalBalances();

    // 2. Refresh crypto deposit addresses for active account
    WALLET_STATE.cryptoDeposit.networks = [];
    loadCryptoDepositAddresses();

    // 3. Fetch and render new account data dynamically without full page reload
    try {
        await loadWalletData();
        if (typeof window.loadNavbarWalletBalance === "function") {
            window.loadNavbarWalletBalance();
        }
    } catch (err) {
        console.error("Failed to dynamically switch sub-account data:", err);
    }
};

window.addEventListener("traidiumx:currency-change", (event) => {
    if (typeof renderWalletPage === "function") {
        renderWalletPage();
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOM WALLET REDESIGN & PRIMEXBT OVERVIEW UI HELPERS
// ══════════════════════════════════════════════════════════════════════════════

const TX_PRIME_MARKETS = [
    { symbol: "BTC/USD", rawSymbol: "BTCUSDT", name: "Bitcoin", category: "crypto", bid: 67420.50, ask: 67421.20, spread: "0.70", change: 2.84, points: [64200, 64800, 65100, 66300, 65900, 66800, 67200, 67420] },
    { symbol: "ETH/USD", rawSymbol: "ETHUSDT", name: "Ethereum", category: "crypto", bid: 3520.10, ask: 3520.60, spread: "0.50", change: 3.42, points: [3380, 3410, 3450, 3430, 3480, 3500, 3510, 3520] },
    { symbol: "SOL/USD", rawSymbol: "SOLUSDT", name: "Solana", category: "crypto", bid: 154.25, ask: 154.32, spread: "0.07", change: -1.15, points: [159, 158, 156, 157, 155, 154.8, 154.5, 154.25] },
    { symbol: "XRP/USD", rawSymbol: "XRPUSDT", name: "Ripple", category: "crypto", bid: 0.5840, ask: 0.5842, spread: "0.0002", change: 1.62, points: [0.572, 0.575, 0.578, 0.581, 0.580, 0.583, 0.584] },
    { symbol: "BNB/USD", rawSymbol: "BNBUSDT", name: "BNB", category: "crypto", bid: 592.40, ask: 592.70, spread: "0.30", change: 0.88, points: [584, 587, 589, 590, 591, 592.4] },
    { symbol: "DOGE/USD", rawSymbol: "DOGEUSDT", name: "Dogecoin", category: "crypto", bid: 0.12450, ask: 0.12455, spread: "0.00005", change: -0.92, points: [0.128, 0.127, 0.126, 0.125, 0.1245] },
    { symbol: "XAU/USD", rawSymbol: "XAUUSDT", name: "Gold Spot", category: "commodities", bid: 2584.60, ask: 2584.95, spread: "0.35", change: 0.95, points: [2560, 2568, 2572, 2579, 2582, 2584.6] },
    { symbol: "BRENT", rawSymbol: "BRENT", name: "Crude Oil", category: "commodities", bid: 74.80, ask: 74.84, spread: "0.04", change: -0.62, points: [76.2, 75.8, 75.4, 75.1, 74.9, 74.8] },
    { symbol: "EUR/USD", rawSymbol: "EURUSD", name: "Euro / US Dollar", category: "forex", bid: 1.08452, ask: 1.08460, spread: "0.00008", change: 0.18, points: [1.0820, 1.0828, 1.0835, 1.0840, 1.08452] },
    { symbol: "GBP/USD", rawSymbol: "GBPUSD", name: "British Pound", category: "forex", bid: 1.29820, ask: 1.29832, spread: "0.00012", change: -0.24, points: [1.3020, 1.3010, 1.2995, 1.2988, 1.29820] },
    { symbol: "US100", rawSymbol: "US100", name: "Nasdaq 100", category: "forex", bid: 19850.40, ask: 19851.80, spread: "1.40", change: 1.45, points: [19600, 19680, 19740, 19810, 19850.4] }
];

let txPrimeActiveCategory = "all";
let txPrimeMarketSocket = null;
let txPrimeForexInterval = null;

function txGenerateSparklineSvg(points, isPositive) {
    if (!points || points.length < 2) points = isPositive ? [10, 20, 30] : [30, 20, 10];
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const width = 90;
    const height = 26;
    const padding = 2;
    
    const coords = points.map((p, i) => {
        const x = padding + (i / (points.length - 1)) * (width - 2 * padding);
        const y = height - padding - ((p - min) / range) * (height - 2 * padding);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

    const strokeColor = isPositive ? "#34d399" : "#f87171";
    return `<svg class="w-24 h-6 inline-block" viewBox="0 0 ${width} ${height}"><polyline fill="none" stroke="${strokeColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" points="${coords}" /></svg>`;
}

function txFormatMarketPrice(val) {
    if (typeof val !== "number" || isNaN(val)) return "--";
    if (val >= 1000) {
        return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (val >= 1) {
        return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    } else {
        return val.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 5 });
    }
}

function txRenderPrimePopularMarkets() {
    const tbody = document.getElementById("txPrimePopularMarketsBody");
    if (!tbody) return;

    const filtered = txPrimeActiveCategory === "all"
        ? TX_PRIME_MARKETS
        : TX_PRIME_MARKETS.filter(m => m.category === txPrimeActiveCategory);

    tbody.innerHTML = filtered.map(m => {
        const isPos = m.change >= 0;
        const changeClass = isPos ? "text-emerald-400" : "text-red-400";
        const changeSign = isPos ? "+" : "";
        const sparkline = txGenerateSparklineSvg(m.points, isPos);

        return `
            <tr class="border-b border-white/5 hover:bg-white/[0.03] transition-colors" data-prime-symbol="${m.symbol}">
                <td class="py-4">
                    <div class="font-black text-white text-sm sm:text-base">${m.symbol}</div>
                    <div class="text-xs text-slate-400 font-semibold">${m.name}</div>
                </td>
                <td class="py-4 font-mono text-white text-xs sm:text-sm font-bold" id="txBid_${m.symbol.replace('/', '_')}">${txFormatMarketPrice(m.bid)}</td>
                <td class="py-4 font-mono text-slate-300 text-xs sm:text-sm" id="txAsk_${m.symbol.replace('/', '_')}">${txFormatMarketPrice(m.ask)}</td>
                <td class="py-4 font-mono text-slate-400 text-xs">${m.spread}</td>
                <td class="py-4 font-bold ${changeClass} text-xs sm:text-sm font-mono" id="txChange_${m.symbol.replace('/', '_')}">${changeSign}${m.change.toFixed(2)}%</td>
                <td class="py-4 text-center" id="txTrend_${m.symbol.replace('/', '_')}">${sparkline}</td>
                <td class="py-4 text-right">
                    <a href="/src/pages/futures.html" class="inline-flex items-center justify-center px-4 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 hover:text-cyan-200 border border-cyan-500/35 text-xs sm:text-sm font-black transition hover:scale-105 active:scale-95 shadow-sm">
                        Trade
                    </a>
                </td>
            </tr>
        `;
    }).join("");
}

async function txInitPrimeMarketStreams() {
    // 1. Initial REST fetch for Crypto 24hr tickers via backend market API
    try {
        const res = typeof apiRequest === "function" ? await apiRequest("/market/board") : null;
        if (res && res.data && Array.isArray(res.data.categories)) {
            const allItems = res.data.categories.flatMap(c => c.symbols || []);
            const dataMap = new Map();
            allItems.forEach(item => {
                if (item.symbol) {
                    dataMap.set(item.symbol.toUpperCase().replace("-", ""), item);
                    dataMap.set(item.symbol.toUpperCase(), item);
                }
            });

            TX_PRIME_MARKETS.forEach(m => {
                const symKey = (m.rawSymbol || m.symbol || "").toUpperCase().replace("-", "");
                if (dataMap.has(symKey)) {
                    const tick = dataMap.get(symKey);
                    const lastPrice = parseFloat(tick.last_price || tick.price) || m.bid;
                    const changePct = parseFloat(tick.change_24h || tick.change_percent) || m.change;
                    const spreadVal = (lastPrice * 0.00015).toFixed(lastPrice < 1 ? 5 : (lastPrice < 100 ? 4 : 2));
                    
                    m.bid = lastPrice;
                    m.ask = lastPrice + parseFloat(spreadVal);
                    m.spread = spreadVal;
                    m.change = changePct;
                    m.points.push(lastPrice);
                    if (m.points.length > 12) m.points.shift();
                }
            });
            txRenderPrimePopularMarkets();
        }
    } catch (e) {
        // Silent fallback to default market state
    }

    // 2. Open Live WebSocket stream for real-time tick-by-tick updates
    try {
        if (txPrimeMarketSocket) {
            txPrimeMarketSocket.close();
            txPrimeMarketSocket = null;
        }

        const streams = "btcusdt@ticker/ethusdt@ticker/solusdt@ticker/xrpusdt@ticker/bnbusdt@ticker/dogeusdt@ticker";
        txPrimeMarketSocket = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);

        txPrimeMarketSocket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg && msg.data) {
                    const streamSymbol = msg.data.s; // e.g. BTCUSDT
                    const livePrice = parseFloat(msg.data.c);
                    const changePct = parseFloat(msg.data.P);

                    const target = TX_PRIME_MARKETS.find(m => m.rawSymbol === streamSymbol);
                    if (target && !isNaN(livePrice)) {
                        const spreadVal = (livePrice * 0.00015).toFixed(livePrice < 1 ? 5 : (livePrice < 100 ? 4 : 2));
                        target.bid = livePrice;
                        target.ask = livePrice + parseFloat(spreadVal);
                        target.spread = spreadVal;
                        target.change = changePct;
                        target.points.push(livePrice);
                        if (target.points.length > 12) target.points.shift();

                        // Update DOM directly for smooth 60fps rendering without full table redraw
                        const key = target.symbol.replace('/', '_');
                        const bidEl = document.getElementById(`txBid_${key}`);
                        const askEl = document.getElementById(`txAsk_${key}`);
                        const changeEl = document.getElementById(`txChange_${key}`);
                        const trendEl = document.getElementById(`txTrend_${key}`);

                        if (bidEl) bidEl.textContent = txFormatMarketPrice(target.bid);
                        if (askEl) askEl.textContent = txFormatMarketPrice(target.ask);
                        if (changeEl) {
                            const isPos = target.change >= 0;
                            changeEl.textContent = `${isPos ? "+" : ""}${target.change.toFixed(2)}%`;
                            changeEl.className = `py-4 font-bold ${isPos ? "text-emerald-400" : "text-red-400"} text-xs sm:text-sm font-mono`;
                        }
                        if (trendEl) {
                            trendEl.innerHTML = txGenerateSparklineSvg(target.points, target.change >= 0);
                        }
                    }
                }
            } catch (err) {
                console.error("Live ticker parse error:", err);
            }
        };

        txPrimeMarketSocket.onerror = () => {};
        txPrimeMarketSocket.onclose = () => {
            // Reconnect after 5 seconds if Overview tab is active
            setTimeout(() => {
                const overviewTab = document.getElementById("contentOverview");
                if (overviewTab && !overviewTab.classList.contains("hidden")) {
                    txInitPrimeMarketStreams();
                }
            }, 5000);
        };
    } catch (wsErr) {
        console.warn("WebSocket connection failed:", wsErr);
    }

    // 3. Live micro-fluctuations for Forex & Commodities
    if (!txPrimeForexInterval) {
        txPrimeForexInterval = setInterval(() => {
            const forexMarkets = TX_PRIME_MARKETS.filter(m => m.category === "forex" || m.category === "commodities");
            forexMarkets.forEach(m => {
                const delta = (Math.random() - 0.49) * (m.bid * 0.0002);
                m.bid = Math.max(0.0001, m.bid + delta);
                const spreadNum = parseFloat(m.spread) || 0.01;
                m.ask = m.bid + spreadNum;
                m.points.push(m.bid);
                if (m.points.length > 12) m.points.shift();

                const key = m.symbol.replace('/', '_');
                const bidEl = document.getElementById(`txBid_${key}`);
                const askEl = document.getElementById(`txAsk_${key}`);
                const trendEl = document.getElementById(`txTrend_${key}`);

                if (bidEl) bidEl.textContent = txFormatMarketPrice(m.bid);
                if (askEl) askEl.textContent = txFormatMarketPrice(m.ask);
                if (trendEl) trendEl.innerHTML = txGenerateSparklineSvg(m.points, m.change >= 0);
            });
        }, 2000);
    }
}

function txInitPrimeOverview() {
    // 1. Spotlight toggle
    const spotlightBtn = document.getElementById("txPrimeHideSpotlightBtn");
    const spotlightCards = document.getElementById("txPrimeSpotlightCards");
    const toggleText = document.getElementById("txPrimeSpotlightToggleText");
    const toggleIcon = document.getElementById("txPrimeSpotlightToggleIcon");

    if (spotlightBtn && spotlightCards) {
        if (localStorage.getItem("tx_prime_hide_spotlight") === "1") {
            spotlightCards.classList.add("hidden");
            if (toggleText) toggleText.textContent = "Show Spotlight";
            if (toggleIcon) toggleIcon.textContent = "+";
        }

        spotlightBtn.addEventListener("click", () => {
            const isHidden = spotlightCards.classList.contains("hidden");
            if (isHidden) {
                spotlightCards.classList.remove("hidden");
                if (toggleText) toggleText.textContent = "Hide Spotlight";
                if (toggleIcon) toggleIcon.textContent = "✕";
                localStorage.setItem("tx_prime_hide_spotlight", "0");
            } else {
                spotlightCards.classList.add("hidden");
                if (toggleText) toggleText.textContent = "Show Spotlight";
                if (toggleIcon) toggleIcon.textContent = "+";
                localStorage.setItem("tx_prime_hide_spotlight", "1");
            }
        });
    }

    // 2. Action buttons
    document.getElementById("txPrimeDepositBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.txOpenDepositChoiceModal === "function") {
            window.txOpenDepositChoiceModal();
        } else if (typeof window.txActivateDepositTab === "function") {
            window.txActivateDepositTab("crypto");
        } else if (typeof txSwitchNexusSubTab === "function") {
            txSwitchNexusSubTab("deposit");
        }
    });
    document.getElementById("txPrimeWithdrawBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof txActivateWithdrawTab === "function") {
            txActivateWithdrawTab("crypto");
        }
    });
    document.getElementById("txPrimeTransferBtn")?.addEventListener("click", () => {
        openWalletActionModal("transfer");
    });

    // 3. More dropdown menu
    const moreBtn = document.getElementById("txPrimeMoreMenuBtn");
    const moreDropdown = document.getElementById("txPrimeMoreMenuDropdown");
    if (moreBtn && moreDropdown) {
        moreBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            moreDropdown.classList.toggle("hidden");
        });
        document.addEventListener("click", () => {
            moreDropdown.classList.add("hidden");
        });
    }
    document.getElementById("txPrimeMenuExchange")?.addEventListener("click", () => {
        moreDropdown?.classList.add("hidden");
        window.location.href = "./exchange.html";
    });
    document.getElementById("txPrimeMenuInternal")?.addEventListener("click", () => {
        moreDropdown?.classList.add("hidden");
        openWalletActionModal("internal_transfer");
    });


    // 5. Popular Market tabs
    const marketTabs = document.querySelectorAll(".tx-prime-market-tab");
    marketTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            marketTabs.forEach(t => {
                t.classList.remove("bg-cyan-400", "text-slate-950", "shadow-sm");
                t.classList.add("bg-slate-800/80", "text-slate-400");
            });
            tab.classList.remove("bg-slate-800/80", "text-slate-400");
            tab.classList.add("bg-cyan-400", "text-slate-950", "shadow-sm");
            txPrimeActiveCategory = tab.getAttribute("data-category") || "all";
            txRenderPrimePopularMarkets();
        });
    });

    txRenderPrimePopularMarkets();
    txInitPrimeMarketStreams();
}

function txActivateDepositTab(mode = "crypto") {
    const contentDeposit = document.getElementById("contentDeposit");
    const contentOverview = document.getElementById("contentOverview");
    const contentTrading = document.getElementById("contentTradingAccounts");
    const contentWallet = document.getElementById("contentWallet");
    const topTabsBar = document.getElementById("txWalletTopTabsBar");

    [
        document.getElementById("mainTabOverview"),
        document.getElementById("mainTabTradingAccounts"),
        document.getElementById("mainTabWallet")
    ].forEach(t => {
        if (t) {
            t.classList.remove("border-cyan-400", "text-cyan-300");
            t.classList.add("border-transparent", "text-slate-400");
        }
    });

    [contentOverview, contentTrading, contentWallet].forEach(c => {
        if (c) {
            c.classList.add("hidden");
            c.classList.remove("block");
            c.style.display = "none";
        }
    });

    if (contentDeposit) {
        contentDeposit.classList.remove("hidden");
        contentDeposit.style.display = "block";
    }

    if (topTabsBar) {
        topTabsBar.classList.add("hidden");
    }

    if (typeof txSwitchNexusSubTab === "function") {
        txSwitchNexusSubTab("deposit");
    }
    if (typeof txSwitchDepositMode === "function") {
        txSwitchDepositMode(mode);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
}
window.txActivateDepositTab = txActivateDepositTab;

function txActivateWithdrawTab(mode = "crypto") {
    const contentDeposit = document.getElementById("contentDeposit");
    const contentOverview = document.getElementById("contentOverview");
    const contentTrading = document.getElementById("contentTradingAccounts");
    const contentWallet = document.getElementById("contentWallet");
    const topTabsBar = document.getElementById("txWalletTopTabsBar");

    [
        document.getElementById("mainTabOverview"),
        document.getElementById("mainTabTradingAccounts"),
        document.getElementById("mainTabWallet")
    ].forEach(t => {
        if (t) {
            t.classList.remove("border-cyan-400", "text-cyan-300");
            t.classList.add("border-transparent", "text-slate-400");
        }
    });

    [contentOverview, contentTrading, contentWallet].forEach(c => {
        if (c) {
            c.classList.add("hidden");
            c.classList.remove("block");
            c.style.display = "none";
        }
    });

    if (contentDeposit) {
        contentDeposit.classList.remove("hidden");
        contentDeposit.style.display = "block";
    }

    if (topTabsBar) {
        topTabsBar.classList.add("hidden");
    }

    if (typeof txSwitchNexusSubTab === "function") {
        txSwitchNexusSubTab("withdraw");
    }
    if (typeof txSwitchWithdrawMode === "function") {
        txSwitchWithdrawMode(mode);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
}
window.txActivateWithdrawTab = txActivateWithdrawTab;

function txActivateHistoryTab() {
    const contentDeposit = document.getElementById("contentDeposit");
    const contentOverview = document.getElementById("contentOverview");
    const contentTrading = document.getElementById("contentTradingAccounts");
    const contentWallet = document.getElementById("contentWallet");
    const topTabsBar = document.getElementById("txWalletTopTabsBar");

    [
        document.getElementById("mainTabOverview"),
        document.getElementById("mainTabTradingAccounts"),
        document.getElementById("mainTabWallet")
    ].forEach(t => {
        if (t) {
            t.classList.remove("border-cyan-400", "text-cyan-300");
            t.classList.add("border-transparent", "text-slate-400");
        }
    });

    [contentOverview, contentTrading, contentWallet].forEach(c => {
        if (c) {
            c.classList.add("hidden");
            c.classList.remove("block");
            c.style.display = "none";
        }
    });

    if (contentDeposit) {
        contentDeposit.classList.remove("hidden");
        contentDeposit.style.display = "block";
    }

    if (topTabsBar) {
        topTabsBar.classList.add("hidden");
    }

    if (typeof txSwitchNexusSubTab === "function") {
        txSwitchNexusSubTab("history");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
}
window.txActivateHistoryTab = txActivateHistoryTab;

function txBackToWalletOverview() {
    sessionStorage.removeItem("tx_wallet_sub_tab");
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    const tabOverview = document.getElementById("mainTabOverview");
    const contentOverview = document.getElementById("contentOverview");
    const topTabsBar = document.getElementById("txWalletTopTabsBar");
    if (topTabsBar) topTabsBar.classList.remove("hidden");
    if (tabOverview && contentOverview) {
        tabOverview.click();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
}
window.txBackToWalletOverview = txBackToWalletOverview;

function txInitTabs() {
    const tabOverview = document.getElementById("mainTabOverview");
    const tabTrading = document.getElementById("mainTabTradingAccounts");
    const tabWallet = document.getElementById("mainTabWallet");
    const tabDeposit = document.getElementById("mainTabDeposit");

    const contentOverview = document.getElementById("contentOverview");
    const contentTrading = document.getElementById("contentTradingAccounts");
    const contentWallet = document.getElementById("contentWallet");
    const contentDeposit = document.getElementById("contentDeposit");

    if (!tabOverview || !tabTrading || !tabWallet) return;

    const tabs = [tabOverview, tabTrading, tabWallet];
    const contents = [contentOverview, contentTrading, contentWallet];

    if (tabDeposit && contentDeposit) {
        tabs.push(tabDeposit);
        contents.push(contentDeposit);
    }

    function selectTab(activeTab, activeContent) {
        tabs.forEach(t => {
            if (t) {
                t.classList.remove("border-cyan-400", "text-cyan-300");
                t.classList.add("border-transparent", "text-slate-400");
            }
        });
        if (activeTab) {
            activeTab.classList.remove("border-transparent", "text-slate-400");
            activeTab.classList.add("border-cyan-400", "text-cyan-300");
        }

        const allContents = [contentOverview, contentTrading, contentWallet, contentDeposit];
        allContents.forEach(c => {
            if (c) {
                c.classList.add("hidden");
                c.classList.remove("block");
                c.style.display = "none";
            }
        });

        if (activeContent) {
            activeContent.classList.remove("hidden");
            activeContent.style.display = "block";
        }

        const topTabsBar = document.getElementById("txWalletTopTabsBar");
        if (topTabsBar) {
            if (activeTab === tabDeposit || activeContent === contentDeposit) {
                topTabsBar.classList.add("hidden");
            } else {
                topTabsBar.classList.remove("hidden");
            }
        }

        // Save active main tab in localStorage and clear subtab session
        if (activeTab && activeTab.id) {
            localStorage.setItem("tx_active_main_tab", activeTab.id);
        }
        if (activeTab !== tabDeposit && activeContent !== contentDeposit) {
            sessionStorage.removeItem("tx_wallet_sub_tab");
            if (window.history && window.history.replaceState) {
                const h = activeTab === tabOverview ? "" : (activeTab === tabTrading ? "#trading" : "#wallet");
                window.history.replaceState(null, "", window.location.pathname + window.location.search + h);
            }
        }
    }

    tabOverview.addEventListener("click", () => {
        selectTab(tabOverview, contentOverview);
        txRenderAssetLists();
        if (typeof txInitPrimeMarketStreams === "function") {
            txInitPrimeMarketStreams();
        }
    });
    tabTrading.addEventListener("click", () => {
        selectTab(tabTrading, contentTrading);
        txRenderTradingAccounts();
        if (typeof txInitSubAccountsAndSelector === "function") {
            txInitSubAccountsAndSelector();
        }
    });
    tabWallet.addEventListener("click", () => {
        selectTab(tabWallet, contentWallet);
        if (typeof txToggleWalletHistoryView === "function") {
            txToggleWalletHistoryView(false);
        }
        txRenderAssetLists();
    });

    if (tabDeposit && contentDeposit) {
        tabDeposit.addEventListener("click", () => {
            selectTab(tabDeposit, contentDeposit);
            if (typeof txInitDepositView === "function") {
                txInitDepositView();
            }
        });
    }

    if (typeof txInitTradingAccountsInteractions === "function") {
        txInitTradingAccountsInteractions();
    }
    if (typeof txInitWalletTabInteractions === "function") {
        txInitWalletTabInteractions();
    }

    // Check URL parameters, session storage and hash for direct tab routing (Overview / Trading / Wallet / Deposit / Withdraw / Transfer / History)
    function txHandleRouteTab() {
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = (urlParams.get("tab") || "").toLowerCase();
        const typeParam = (urlParams.get("type") || "").toLowerCase();
        const hashParam = (window.location.hash || "").toLowerCase();
        const sessionSub = sessionStorage.getItem("tx_wallet_sub_tab");

        if (tabParam === "sub-accounts" || tabParam === "new-account" || hashParam.includes("sub-account") || hashParam.includes("new-account")) {
            if (tabTrading) tabTrading.click();
            setTimeout(() => {
                if (typeof window.txOpenSubAccountCreationModal === "function") {
                    window.txOpenSubAccountCreationModal(typeParam === "demo" ? "demo" : "real");
                }
            }, 80);
            return true;
        } else if (tabParam === "trading" || tabParam === "trading-accounts" || tabParam === "trading_accounts" || hashParam.includes("trading")) {
            if (tabTrading) {
                tabTrading.click();
                return true;
            }
        } else if (tabParam === "wallet" || hashParam.includes("wallet") || hashParam.includes("wallets")) {
            if (tabWallet) {
                tabWallet.click();
                return true;
            }
        } else if (tabParam === "deposit" || hashParam.includes("deposit") || (!hashParam && sessionSub === "deposit")) {
            if (typeof window.txActivateDepositTab === "function") {
                window.txActivateDepositTab(typeParam === "money" || hashParam.includes("money") ? "money" : "crypto");
                return true;
            }
        } else if (tabParam === "withdraw" || hashParam.includes("withdraw") || (!hashParam && sessionSub === "withdraw")) {
            if (typeof window.txActivateWithdrawTab === "function") {
                window.txActivateWithdrawTab(typeParam === "money" || hashParam.includes("money") ? "money" : "crypto");
                return true;
            }
        } else if (tabParam === "history" || hashParam.includes("history") || hashParam.includes("transfer-history") || (!hashParam && sessionSub === "history")) {
            if (typeof window.txActivateHistoryTab === "function") {
                window.txActivateHistoryTab();
                return true;
            }
        } else if (tabParam === "transfer" || hashParam.includes("transfer")) {
            if (tabOverview) tabOverview.click();
            if (typeof openWalletActionModal === "function") {
                openWalletActionModal("transfer");
            }
            return true;
        } else if (tabParam === "overview" || hashParam.includes("overview")) {
            if (tabOverview) {
                tabOverview.click();
                return true;
            }
        }
        return false;
    }

    window.txHandleRouteTab = txHandleRouteTab;

    const routed = txHandleRouteTab();
    if (!routed) {
        // Restore active tab on load ONLY if we reloaded or came from the wallet page itself
        const isFromWallet = document.referrer && document.referrer.includes("wallet.html");
        const isReload = window.performance && window.performance.navigation && window.performance.navigation.type === 1;

        if (isFromWallet || isReload) {
            const savedTabId = localStorage.getItem("tx_active_main_tab");
            if (savedTabId) {
                const savedTab = document.getElementById(savedTabId);
                if (savedTab) {
                    savedTab.click();
                }
            }
        } else {
            localStorage.removeItem("tx_active_main_tab");
            if (tabOverview) {
                tabOverview.click();
            }
        }
    }

    // React immediately to hash changes while user stays on the wallet page
    window.addEventListener("hashchange", () => {
        txHandleRouteTab();
    });
}

function txRenderAssetLists() {
    const searchVal = document.getElementById("assetSearchInput")?.value.toLowerCase() || "";
    const hideEmpty = document.getElementById("hideEmptyBalancesCheck")?.checked || false;

    // If wallet data is not yet loaded for logged-in user, do not overwrite with zeroes
    if (!WALLET_STATE.wallet && typeof isLoggedIn === "function" && isLoggedIn() && WALLET_STATE.loading) {
        return;
    }

    const wallet = WALLET_STATE.wallet || {};
    const rate = walletNumber(wallet.usdt_inr_rate || localStorage.getItem("tx_usdt_inr_rate") || 88.50, 88.50);

    const user = typeof getAuthUser === "function" ? getAuthUser() : null;
    const isMt5 = user && user.selected_platform === "mt5";
    const mt5Account = WALLET_STATE.mt5?.account || {};
    const mt5Bal = walletNumber(mt5Account.balance, 0);

    // Retrieve live backend balances (Isolated for MT5 vs TraidiumX)
    const inrBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_inr?.available_balance, 0);
    const inrLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_inr?.locked_balance, 0);
    const usdtBalance = isMt5 ? mt5Bal : walletNumber(wallet.main_wallet_usdt?.available_balance, 0);
    const usdtLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_usdt?.locked_balance, 0);
    const btcBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_btc?.available_balance, 0);
    const btcLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_btc?.locked_balance, 0);
    const ethBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_eth?.available_balance, 0);
    const ethLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_eth?.locked_balance, 0);
    const usdcBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_usdc?.available_balance, 0);
    const usdcLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_usdc?.locked_balance, 0);
    const solBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_sol?.available_balance, 0);
    const solLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_sol?.locked_balance, 0);
    const bnbBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_bnb?.available_balance, 0);
    const bnbLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_bnb?.locked_balance, 0);
    const xrpBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_xrp?.available_balance, 0);
    const xrpLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_xrp?.locked_balance, 0);
    const adaBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_ada?.available_balance, 0);
    const adaLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_ada?.locked_balance, 0);

    const trxBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_trx?.available_balance, 0);
    const trxLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_trx?.locked_balance, 0);
    const dotBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_dot?.available_balance, 0);
    const dotLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_dot?.locked_balance, 0);
    const ltcBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_ltc?.available_balance, 0);
    const ltcLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_ltc?.locked_balance, 0);
    const avaxBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_avax?.available_balance, 0);
    const avaxLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_avax?.locked_balance, 0);
    const shibBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_shib?.available_balance, 0);
    const shibLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_shib?.locked_balance, 0);
    const linkBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_link?.available_balance, 0);
    const linkLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_link?.locked_balance, 0);
    const uniBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_uni?.available_balance, 0);
    const uniLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_uni?.locked_balance, 0);
    const etcBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_etc?.available_balance, 0);
    const etcLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_etc?.locked_balance, 0);
    const xlmBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_xlm?.available_balance, 0);
    const xlmLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_xlm?.locked_balance, 0);
    const tonBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_ton?.available_balance, 0);
    const tonLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_ton?.locked_balance, 0);
    const bchBalance = isMt5 ? 0 : walletNumber(wallet.main_wallet_bch?.available_balance, 0);
    const bchLocked = isMt5 ? 0 : walletNumber(wallet.main_wallet_bch?.locked_balance, 0);

    const board = WALLET_STATE.board || [];
    function getAssetPrice(code) {
        if (code === "USDT" || code === "USDC") return 1.0;
        if (code === "INR") return 1.0 / rate;
        const symbol = `${code}USDT`;
        const item = board.find(b => b.symbol === symbol || b.ui_symbol === symbol || b.symbol === `${code}USD`);
        return item ? walletNumber(item.price || item.last_price, 0) : 0.0;
    }

    // Money Listing Items
    const moneyAssets = isMt5 ? [
        {
            code: "MT5",
            displayCode: "USD",
            name: "MetaTrader 5 Balance",
            symbol: "$",
            balance: mt5Bal,
            pending: 0,
            iconClass: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
        }
    ] : [
        {
            code: "INR",
            displayCode: "INR",
            name: "Indian Rupee",
            symbol: "₹",
            balance: inrBalance,
            pending: inrLocked,
            iconClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        },
        {
            code: "USDT",
            displayCode: "USD",
            name: "US Dollar",
            symbol: "$",
            balance: usdtBalance,
            pending: usdtLocked,
            iconClass: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
        }
    ];

    // Crypto Listing Items
    const cryptoAssets = [
        { code: "BTC", name: "Bitcoin", symbol: "₿", balance: btcBalance, pending: btcLocked, iconClass: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
        { code: "ETH", name: "Ethereum", symbol: "Ξ", balance: ethBalance, pending: ethLocked, iconClass: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
        { code: "USDC", name: "USD Coin", symbol: "C", balance: usdcBalance, pending: usdcLocked, iconClass: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
        { code: "SOL", name: "Solana", symbol: "S", balance: solBalance, pending: solLocked, iconClass: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20" },
        { code: "BNB", name: "BNB", symbol: "B", balance: bnbBalance, pending: bnbLocked, iconClass: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
        { code: "XRP", name: "Ripple", symbol: "X", balance: xrpBalance, pending: xrpLocked, iconClass: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
        { code: "ADA", name: "Cardano", symbol: "A", balance: adaBalance, pending: adaLocked, iconClass: "bg-indigo-600/10 text-indigo-500 border-indigo-600/20" },
        { code: "TRX", name: "TRON", symbol: "T", balance: trxBalance, pending: trxLocked, iconClass: "bg-red-500/10 text-red-400 border-red-500/20" },
        { code: "DOT", name: "Polkadot", symbol: "D", balance: dotBalance, pending: dotLocked, iconClass: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
        { code: "LTC", name: "Litecoin", symbol: "Ł", balance: ltcBalance, pending: ltcLocked, iconClass: "bg-slate-400/10 text-slate-300 border-slate-400/20" },
        { code: "AVAX", name: "Avalanche", symbol: "A", balance: avaxBalance, pending: avaxLocked, iconClass: "bg-red-600/10 text-red-500 border-red-600/20" },
        { code: "SHIB", name: "Shiba Inu", symbol: "S", balance: shibBalance, pending: shibLocked, iconClass: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
        { code: "LINK", name: "Chainlink", symbol: "L", balance: linkBalance, pending: linkLocked, iconClass: "bg-blue-600/10 text-blue-500 border-blue-600/20" },
        { code: "UNI", name: "Uniswap", symbol: "U", balance: uniBalance, pending: uniLocked, iconClass: "bg-pink-600/10 text-pink-500 border-pink-600/20" },
        { code: "ETC", name: "Ethereum Classic", symbol: "E", balance: etcBalance, pending: etcLocked, iconClass: "bg-emerald-600/10 text-emerald-500 border-emerald-600/20" },
        { code: "XLM", name: "Stellar", symbol: "X", balance: xlmBalance, pending: xlmLocked, iconClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
        { code: "TON", name: "Toncoin", symbol: "T", balance: tonBalance, pending: tonLocked, iconClass: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
        { code: "BCH", name: "Bitcoin Cash", symbol: "B", balance: bchBalance, pending: bchLocked, iconClass: "bg-green-500/10 text-green-400 border-green-500/20" }
    ];

    // Calculate Crypto sum
    let cryptoSumUsd = 0;
    let cryptoLockedUsd = 0;
    cryptoAssets.forEach(asset => {
        const price = getAssetPrice(asset.code);
        cryptoSumUsd += (walletNumber(asset.balance, 0)) * price;
        cryptoLockedUsd += (walletNumber(asset.pending, 0)) * price;
    });

    // Calculate Trading Wallet & Subaccounts sum
    const activeWallet = getActiveWalletData();
    const tradingWalletData = getTradingWalletData();
    const tradingUsdtAvail = walletNumber(activeWallet?.trading_wallet_usdt?.available_balance ?? activeWallet?.trading_wallet?.available_balance ?? tradingWalletData.available_balance, 0);
    const tradingUsdtLocked = walletNumber(activeWallet?.trading_wallet_usdt?.locked_balance ?? activeWallet?.trading_wallet?.locked_balance ?? tradingWalletData.locked_balance, 0);
    const tradingInrAvail = walletNumber(activeWallet?.trading_wallet_inr?.available_balance, 0);
    const tradingInrLocked = walletNumber(activeWallet?.trading_wallet_inr?.locked_balance, 0);
    const tradingMargin = walletNumber(WALLET_STATE.pnlSummary?.total_margin, 0);
    const unrealizedPnl = walletNumber(WALLET_STATE.pnlSummary?.total_unrealized_pnl, 0);

    const tradingTotalUsd = isMt5 ? 0 : (tradingUsdtAvail + tradingUsdtLocked + (tradingInrAvail + tradingInrLocked) / rate + tradingMargin + unrealizedPnl);
    const mainTotalUsd = isMt5 ? mt5Bal : (usdtBalance + usdtLocked + (inrBalance + inrLocked) / rate);
    const cryptoTotalUsd = isMt5 ? 0 : (cryptoSumUsd + cryptoLockedUsd);

    const totalBalUsd = isMt5 ? mt5Bal : (mainTotalUsd + cryptoTotalUsd + tradingTotalUsd);
    const totalBalInr = totalBalUsd * rate;

    const activeSubId = localStorage.getItem("traidiumx_active_user_id");
    const isSubActive = Boolean(activeSubId && activeSubId !== "main");
    const activeSub = isSubActive ? (txSubAccountsLocalCache || []).find(s => s.id === activeSubId) : null;
    const isDemo = activeSub ? Boolean(activeSub.is_demo || activeSub.account_mode === "demo" || activeSub.plan === "demo" || activeSub.plan_name?.toLowerCase().includes("demo")) : false;

    // Active Account specific balance (Show Main Balance of selected account):
    const activeSubMainUsdtAvail = isMt5 ? mt5Bal : (isSubActive 
        ? walletNumber(activeWallet?.main_wallet_usdt?.available_balance ?? activeWallet?.main_wallet?.available_balance, 0)
        : usdtBalance);
    const activeSubMainUsdtLocked = isMt5 ? 0 : (isSubActive
        ? walletNumber(activeWallet?.main_wallet_usdt?.locked_balance ?? activeWallet?.main_wallet?.locked_balance, 0)
        : usdtLocked);
    const activeSubMainInrAvail = isMt5 ? 0 : (isSubActive
        ? walletNumber(activeWallet?.main_wallet_inr?.available_balance, 0)
        : inrBalance);
    const activeSubMainInrLocked = isMt5 ? 0 : (isSubActive
        ? walletNumber(activeWallet?.main_wallet_inr?.locked_balance, 0)
        : inrLocked);

    let displayTotalUsd = isMt5 ? mt5Bal : activeSubMainUsdtAvail;
    let displayAvailUsd = isMt5 ? mt5Bal : activeSubMainUsdtAvail;
    let displayLockedUsd = isMt5 ? 0 : activeSubMainUsdtLocked;

    const displayTotalInr = activeSubMainInrAvail;

    const activeCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const totalEl = document.getElementById("portfolioTotalBalance");
    if (totalEl) {
        if (isBalanceHidden()) {
            totalEl.textContent = `≈ ******** ${activeCurrency}`;
        } else if (isMt5) {
            totalEl.textContent = `≈ ${mt5Bal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
        } else if (activeCurrency === "INR") {
            totalEl.textContent = `≈ ₹${displayTotalInr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`;
        } else {
            totalEl.textContent = `≈ ${displayTotalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
        }
    }

    // Populate PrimeXBT-style Overview Elements
    const primeTotalFundsVal = document.getElementById("txPrimeTotalFundsVal");
    const primeTotalFundsInr = document.getElementById("txPrimeTotalFundsInr");
    const primeUserName = document.getElementById("txPrimeUserName");
    const primeKycBadge = document.getElementById("txPrimeKycBadge");
    const primeAccountBadge = document.getElementById("txPrimeActiveAccountBadge");
    const primeTotalFundsLabel = document.getElementById("txPrimeTotalFundsLabel");

    if (primeAccountBadge) {
        if (isSubActive) {
            const accName = activeSub ? activeSub.name : "Sub Account";
            if (isDemo) {
                primeAccountBadge.textContent = `${accName} (DEMO)`;
                primeAccountBadge.className = "text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30";
            } else {
                primeAccountBadge.textContent = `${accName} (REAL)`;
                primeAccountBadge.className = "text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
            }
            if (primeTotalFundsLabel) {
                primeTotalFundsLabel.textContent = isDemo ? "Demo Balance" : "Main Balance";
            }
        } else {
            primeAccountBadge.textContent = "Main Account (Real)";
            primeAccountBadge.className = "text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
            if (primeTotalFundsLabel) {
                primeTotalFundsLabel.textContent = "Main Balance";
            }
        }
    }

    if (primeUserName && user) {
        primeUserName.textContent = user.first_name || user.username || "Trader";
    }
    if (primeKycBadge && user) {
        if (user.kyc_status === "approved" || user.is_verified) {
            primeKycBadge.innerHTML = "✓ Verified Account";
            primeKycBadge.className = "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
        } else if (user.kyc_status === "pending") {
            primeKycBadge.innerHTML = "⏳ KYC Pending";
            primeKycBadge.className = "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30";
        } else {
            primeKycBadge.innerHTML = "Unverified";
            primeKycBadge.className = "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-slate-700/50 text-slate-300 border border-slate-600";
        }
    }

    if (primeTotalFundsVal) {
        if (isBalanceHidden()) {
            primeTotalFundsVal.textContent = "$ ********";
        } else {
            primeTotalFundsVal.textContent = `$ ${displayTotalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
    }
    if (primeTotalFundsInr) {
        if (isBalanceHidden()) {
            primeTotalFundsInr.textContent = "≈ ₹ ******** INR";
        } else {
            primeTotalFundsInr.textContent = `≈ ₹${displayTotalInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`;
        }
    }

    if (typeof txRenderPrimePopularMarkets === "function") {
        txRenderPrimePopularMarkets();
    }

    if (typeof txRenderOverviewStats === "function" && WALLET_STATE.overviewStats) {
        txRenderOverviewStats(WALLET_STATE.overviewStats);
    }

function txRenderOverviewStats(stats) {
    if (!stats) return;
    const vol = stats.volume_30d || {};
    const rew = stats.rewards || {};
    const ref = stats.referrals || {};

    const volValEl = document.getElementById("txPrimeVolumeVal");
    const volTierEl = document.getElementById("txPrimeVolumeTier");
    const volBarEl = document.getElementById("txPrimeVolumeBar");
    const savedFeesEl = document.getElementById("txPrimeSavedFees");
    const tierNameEl = document.getElementById("txPrimeTierName");

    if (volValEl) volValEl.textContent = `$ ${(vol.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (volTierEl) volTierEl.textContent = `${vol.current_tier || 'VIP 0'} → ${vol.next_tier || 'VIP 1'}`;
    if (volBarEl) volBarEl.style.width = `${Math.min(100, Math.max(0, vol.progress_pct || 0))}%`;
    if (savedFeesEl) savedFeesEl.textContent = `Saved fees: $${(vol.saved_fees || 0).toFixed(2)}`;
    if (tierNameEl) tierNameEl.textContent = `Tier: ${vol.tier_name || 'Basic'}`;

    const rewValEl = document.getElementById("txPrimeRewardsVal");
    const rewRatioEl = document.getElementById("txPrimeTasksRatio");
    const rewBarEl = document.getElementById("txPrimeRewardsBar");
    const activeBonusEl = document.getElementById("txPrimeActiveBonus");

    if (rewValEl) rewValEl.textContent = `$ ${(rew.total_rewards || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (rewRatioEl) rewRatioEl.textContent = `${rew.completed_tasks || 0} / ${rew.total_tasks || 5} Tasks`;
    if (rewBarEl) rewBarEl.style.width = `${Math.min(100, Math.max(0, rew.progress_pct || 0))}%`;
    if (activeBonusEl) activeBonusEl.textContent = `Active bonus: Up to $${rew.max_bonus || 500}`;

    const refValEl = document.getElementById("txPrimeReferralVal");
    const rebateEl = document.getElementById("txPrimeRebateBadge");
    const refBarEl = document.getElementById("txPrimeReferralBar");
    const invitedCountEl = document.getElementById("txPrimeInvitedCount");

    if (refValEl) refValEl.textContent = `$ ${(ref.earnings || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (rebateEl) rebateEl.textContent = `${ref.rebate_pct || 20}% Rebate`;
    if (refBarEl) refBarEl.style.width = `${Math.min(100, Math.max(0, ref.progress_pct || 0))}%`;
    if (invitedCountEl) invitedCountEl.textContent = `${ref.total_invited || 0} Users Invited`;

    const copyRefBtn = document.getElementById("txPrimeCopyReferralBtn");
    if (copyRefBtn && copyRefBtn.dataset.bound !== "1") {
        copyRefBtn.dataset.bound = "1";
        copyRefBtn.addEventListener("click", () => {
            const code = ref.referral_code || "";
            const link = code ? `${window.location.origin}/src/pages/register.html?ref=${encodeURIComponent(code)}` : `${window.location.origin}/src/pages/register.html`;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(link).then(() => {
                    if (typeof showWalletAlert === "function") {
                        showWalletAlert(`Referral link copied! (Code: ${code})`, "success");
                    }
                }).catch(() => {
                    if (typeof showWalletAlert === "function") {
                        showWalletAlert(`Referral code: ${code}`, "info");
                    }
                });
            } else if (typeof showWalletAlert === "function") {
                showWalletAlert(`Referral code: ${code}`, "info");
            }
        });
    }
}

    // Dynamic Balance Breakdown Tooltip Population
    const availEl = document.getElementById("txBreakdownAvail");
    const lockedEl = document.getElementById("txBreakdownLocked");
    const pnlEl = document.getElementById("txBreakdownPnl");
    if (availEl && lockedEl && pnlEl) {
        const isHidden = isBalanceHidden();
        const isINR = activeCurrency === "INR";
        const sym = isINR ? "₹" : "$";
        
        const pnlUsd = isMt5 ? 0 : unrealizedPnl;

        const availVal = isINR ? activeSubMainInrAvail : displayAvailUsd;
        const lockedVal = isINR ? activeSubMainInrLocked : displayLockedUsd;
        const pnlVal = isINR ? (pnlUsd * rate) : pnlUsd;

        availEl.textContent = isHidden ? "********" : `${sym}${availVal.toLocaleString(isINR ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        lockedEl.textContent = isHidden ? "*****" : `${sym}${lockedVal.toLocaleString(isINR ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        pnlEl.textContent = isHidden ? "*****" : `${pnlVal >= 0 ? "+" : ""}${sym}${pnlVal.toLocaleString(isINR ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (pnlVal > 0) {
            pnlEl.className = "font-black font-mono text-emerald-400";
        } else if (pnlVal < 0) {
            pnlEl.className = "font-black font-mono text-red-400";
        } else {
            pnlEl.className = "font-black font-mono text-slate-300";
        }
    }

    // Filtering logic
    const filteredMoney = moneyAssets.filter(asset => {
        const matchesSearch = asset.code.toLowerCase().includes(searchVal) || asset.name.toLowerCase().includes(searchVal);
        const matchesHide = !hideEmpty || asset.balance > 0;
        return matchesSearch && matchesHide;
    });

    const filteredCrypto = cryptoAssets.filter(asset => {
        const matchesSearch = asset.code.toLowerCase().includes(searchVal) || asset.name.toLowerCase().includes(searchVal);
        const matchesHide = !hideEmpty || asset.balance > 0;
        return matchesSearch && matchesHide;
    });

    // Update Section Summaries
    const moneySub = document.getElementById("moneySubVal");
    if (moneySub) {
        if (isBalanceHidden()) {
            moneySub.textContent = `≈ ******** ${activeCurrency}`;
        } else if (activeCurrency === "INR") {
            moneySub.textContent = `≈ ₹${activeSubMainInrAvail.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`;
        } else {
            moneySub.textContent = `≈ ${displayTotalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
        }
    }

    const cryptoSub = document.getElementById("cryptoAssetsTotalSub");
    if (cryptoSub) {
        if (isBalanceHidden()) {
            cryptoSub.textContent = `≈ ******** ${activeCurrency}`;
        } else if (activeCurrency === "INR") {
            const cryptoInr = cryptoSumUsd * rate;
            cryptoSub.textContent = `≈ ₹${cryptoInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`;
        } else {
            cryptoSub.textContent = `≈ ${cryptoSumUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
        }
    }

    // Render Money Table
    const moneyBody = document.getElementById("moneyAssetsBody");
    if (moneyBody) {
        moneyBody.innerHTML = filteredMoney.map(asset => {
            const svgLogo = (typeof window.txGetCoinLogoSvg === "function") ? window.txGetCoinLogoSvg(asset.code) : null;
            const logoHtml = svgLogo || `<div class="flex h-8 w-8 items-center justify-center rounded-full border ${asset.iconClass} font-bold text-sm">${asset.symbol}</div>`;
            const pendingStr = isBalanceHidden() ? "*****" : (asset.pending > 0 ? `${asset.pending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—");

            return `
            <tr class="border-b border-white/5 hover:bg-white/[0.02] transition">
                <td class="py-4 flex items-center gap-3">
                    ${logoHtml}
                    <div>
                        <div class="font-bold text-white text-xs sm:text-sm">${asset.displayCode || asset.code}</div>
                        <div class="text-[10px] text-slate-500 font-semibold">${asset.name}</div>
                    </div>
                </td>
                <td class="py-4 font-bold text-white text-xs sm:text-sm">${isBalanceHidden() ? "********" : `${asset.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
                <td class="py-4 text-slate-400 text-xs sm:text-sm">${pendingStr}</td>
                <td class="py-4 text-right">
                    <div class="flex items-center justify-end gap-3 sm:gap-4 text-xs font-bold">
                        <button onclick="txTriggerRowAction('${asset.code}', 'deposit')" class="text-slate-300 hover:text-cyan-400 transition cursor-pointer">Deposit</button>
                        <button onclick="txTriggerRowAction('${asset.code}', 'withdraw')" class="text-slate-300 hover:text-cyan-400 transition cursor-pointer">Withdraw</button>
                        <button onclick="txTriggerRowAction('${asset.code}', 'transfer')" class="text-slate-300 hover:text-cyan-400 transition cursor-pointer">Transfer</button>
                        ${asset.code === "USDT" ? `<button onclick="txTriggerRowAction('${asset.code}', 'exchange')" class="text-slate-300 hover:text-cyan-400 transition cursor-pointer">Exchange</button>` : ''}
                        <button onclick="txTriggerRowAction('${asset.code}', 'internal_transfer')" class="text-slate-300 hover:text-cyan-400 transition cursor-pointer">Internal Transfer</button>
                    </div>
                </td>
            </tr>
            `;
        }).join("");
    }

    // Render Crypto Table
    const cryptoBody = document.getElementById("cryptoAssetsBody");
    if (cryptoBody) {
        cryptoBody.innerHTML = filteredCrypto.map(asset => {
            const price = getAssetPrice(asset.code);
            const priceStr = price > 0 ? ` · $${price < 0.01 ? price.toFixed(4) : (price < 1 ? price.toFixed(4) : price.toFixed(price > 100 ? 2 : 4))}` : "";
            const svgLogo = (typeof window.txGetCoinLogoSvg === "function") ? window.txGetCoinLogoSvg(asset.code) : null;
            const logoHtml = svgLogo || `<div class="flex h-8 w-8 items-center justify-center rounded-full border ${asset.iconClass} font-bold text-sm">${asset.symbol}</div>`;
            const pendingStr = isBalanceHidden() ? "*****" : (asset.pending > 0 ? `${asset.pending.toFixed(4)}` : "—");

            return `
            <tr class="border-b border-white/5 hover:bg-white/[0.02] transition">
                <td class="py-4 flex items-center gap-3">
                    ${logoHtml}
                    <div>
                        <div class="font-bold text-white text-xs sm:text-sm">${asset.code}</div>
                        <div class="text-[10px] text-slate-500 font-semibold">${asset.name}${priceStr}</div>
                    </div>
                </td>
                <td class="py-4 font-bold text-white text-xs sm:text-sm">${isBalanceHidden() ? "********" : `${asset.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}</td>
                <td class="py-4 text-slate-400 text-xs sm:text-sm">${pendingStr}</td>
                <td class="py-4 text-right">
                    <div class="flex items-center justify-end gap-3 sm:gap-4 text-xs font-bold">
                        <button onclick="txTriggerRowAction('${asset.code}', 'deposit')" class="text-slate-300 hover:text-cyan-400 transition cursor-pointer">Deposit</button>
                        <button onclick="txTriggerRowAction('${asset.code}', 'withdraw')" class="text-slate-300 hover:text-cyan-400 transition cursor-pointer">Withdraw</button>
                        <button onclick="txTriggerRowAction('${asset.code}', 'transfer')" class="text-slate-300 hover:text-cyan-400 transition cursor-pointer">Transfer</button>
                        <button onclick="txTriggerRowAction('${asset.code}', 'exchange')" class="text-slate-300 hover:text-cyan-400 transition cursor-pointer">Exchange</button>
                        <button onclick="txTriggerRowAction('${asset.code}', 'internal_transfer')" class="text-slate-300 hover:text-cyan-400 transition cursor-pointer">Internal Transfer</button>
                    </div>
                </td>
            </tr>
            `;
        }).join("");
    }
}

window.txToggleWalletHistoryView = function(showHistory = true) {
    if (showHistory && typeof window.txActivateHistoryTab === "function") {
        window.txActivateHistoryTab();
        return;
    }
    const assetsView = document.getElementById("txWalletAssetsView");
    if (assetsView) assetsView.classList.remove("hidden");
};

function txInitWalletTabInteractions() {
    // 1. Eye Privacy Toggle
    document.getElementById("txWalletTogglePrivacyBtn")?.addEventListener("click", () => {
        const isHidden = isBalanceHidden();
        localStorage.setItem("tx_balance_hidden", isHidden ? "0" : "1");
        
        const openIcon = document.getElementById("txWalletEyeOpenIcon");
        const closedIcon = document.getElementById("txWalletEyeClosedIcon");
        if (openIcon && closedIcon) {
            openIcon.classList.toggle("hidden", !isHidden);
            closedIcon.classList.toggle("hidden", isHidden);
        }

        renderWalletPage();
    });

    // 2. Search Input
    document.getElementById("assetSearchInput")?.addEventListener("input", () => {
        txRenderAssetLists();
    });

    // 3. Hide Empty Balances Checkbox
    document.getElementById("hideEmptyBalancesCheck")?.addEventListener("change", () => {
        txRenderAssetLists();
    });

    // 4. Currency Change Event Listener
    window.addEventListener("traidiumx:currency-change", () => {
        txRenderAssetLists();
    });

    // 5. Transfer History Link
    document.getElementById("txWalletTransferHistoryLink")?.addEventListener("click", (e) => {
        e.preventDefault();
        if (typeof window.txActivateHistoryTab === "function") {
            window.txActivateHistoryTab();
        }
    });
}

window.txTriggerRowAction = function(asset, action) {
    if (action === "deposit") {
        WALLET_STATE.activeDepositCurrency = asset;
        checkAndShowCurrencyLockModal();
        if (asset === "INR") {
            loadInrDepositDetails();
        }
        updateDepositModalUIByCurrency(asset);
        openWalletActionModal("deposit", asset);
    } else if (action === "withdraw") {
        WALLET_STATE.activeWithdrawalCurrency = asset;
        checkAndShowCurrencyLockModal();
        
        updateWithdrawalModalUIByCurrency(asset, true);
        if (asset === "INR") {
            txAutofillWithdrawBankDetails(true);
        }
        openWalletActionModal("withdraw", asset);
    } else if (action === "exchange") {
        window.location.href = `./exchange.html?from=${encodeURIComponent(asset)}`;
    } else if (action === "transfer") {
        openWalletActionModal("transfer");
    } else if (action === "internal_transfer") {
        openWalletActionModal("internal_transfer", asset);
    }
};

function txInitSubTabs() {
    const tabWithdraw = document.getElementById("subTabWithdraw");
    const tabHistory = document.getElementById("subTabHistory");

    const contentWithdraw = document.getElementById("walletSubContentWithdraw");
    const contentHistory = document.getElementById("walletSubContentHistory");

    if (!tabWithdraw || !tabHistory) return;

    const tabs = [tabWithdraw, tabHistory];
    const contents = [contentWithdraw, contentHistory];

    function selectSubTab(activeTab, activeContent) {
        tabs.forEach(t => {
            t.classList.remove("border-cyan-400", "text-cyan-300");
            t.classList.add("border-transparent", "text-slate-400");
        });
        activeTab.classList.remove("border-transparent", "text-slate-400");
        activeTab.classList.add("border-cyan-400", "text-cyan-300");

        contents.forEach(c => c.classList.add("hidden"));
        activeContent.classList.remove("hidden");
    }

    tabWithdraw.addEventListener("click", () => {
        selectSubTab(tabWithdraw, contentWithdraw);
        WALLET_STATE.activeWithdrawalCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
        checkAndShowCurrencyLockModal();
        updateWithdrawalModalUIByCurrency(WALLET_STATE.activeWithdrawalCurrency);
        txAutofillWithdrawBankDetails();
    });

    tabHistory.addEventListener("click", () => {
        selectSubTab(tabHistory, contentHistory);
        renderLedgerTable();
        renderDepositTable();
        renderWithdrawalTable();
    });
}

let txTaFilterMode = "real"; // "real" | "demo"
let txTaHideEmpty = false;
let txTaModalSubMode = "real";
let txTaWs = null;
let txTaPollingInterval = null;
window.txTaAccountsCache = [];
window.txWalletLivePrices = window.txWalletLivePrices || {};

window.txCalcSinglePositionLivePnl = function(position) {
    if (!position) return 0;
    const entry = Number(position.entry_price ?? position.entryPrice ?? 0);
    const mark = Number(position.mark_price ?? position.current_price ?? 0);
    const rawSym = String(position.symbol || "").toUpperCase();
    const sym = rawSym.replace(/[^A-Z0-9]/g, "");
    const current = Number(window.txWalletLivePrices?.[sym] ?? window.txWalletLivePrices?.[rawSym] ?? window.txWalletLivePrices?.[sym.toLowerCase()] ?? mark ?? entry);
    const qty = Number(position.quantity ?? position.qty ?? 0);
    const side = String(position.position_side ?? position.side ?? "").toLowerCase();

    if (!entry || !qty || !current) {
        return Number(position.unrealized_pnl ?? 0);
    }

    if (side === "long" || side === "buy") {
        return (current - entry) * qty;
    }
    if (side === "short" || side === "sell") {
        return (entry - current) * qty;
    }
    return Number(position.unrealized_pnl ?? 0);
};

window.txCalculateAccountLivePnl = function(acc) {
    if (!acc) return 0;
    const positions = acc.positions || [];
    if (positions.length > 0) {
        return positions.reduce((sum, pos) => sum + window.txCalcSinglePositionLivePnl(pos), 0);
    }
    return Number(acc.unrealized_pnl ?? acc.pnlUsd ?? 0);
};

window.txUpdateLiveTradingAccountsPnL = function() {
    const hidden = typeof isBalanceHidden === "function" ? isBalanceHidden() : false;
    const accounts = window.txTaAccountsCache || [];

    accounts.forEach(acc => {
        const livePnl = window.txCalculateAccountLivePnl(acc);
        acc.livePnlUsd = livePnl;

        const pnlEl = document.getElementById(`txTaCardPnl_${acc.id}`);
        if (pnlEl) {
            const pnlPrefix = livePnl > 0 ? "+" : "";
            const pnlStr = hidden ? "*****" : `${pnlPrefix}${livePnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
            const pnlClass = livePnl > 0 ? "text-emerald-400" : (livePnl < 0 ? "text-red-400" : "text-white");
            pnlEl.textContent = pnlStr;
            pnlEl.className = `text-xl sm:text-2xl font-black ${pnlClass} font-mono block mt-1 transition-colors duration-150`;
        }
    });
};

window.txStartTaLivePnlStreaming = function() {
    const accounts = window.txTaAccountsCache || [];
    const symbolSet = new Set(["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT"]);

    accounts.forEach(acc => {
        (acc.positions || []).forEach(pos => {
            if (pos.symbol) {
                const s = String(pos.symbol).replace(/[^A-Z0-9]/g, "").toUpperCase();
                if (s) symbolSet.add(s);
            }
        });
    });

    // 1. Initial Fast Fetch for live Mark Prices & Ticker Prices via backend
    if (typeof apiRequest === "function") {
        apiRequest("/market/board")
            .then(res => {
                if (res && res.data && Array.isArray(res.data.categories)) {
                    const allSymbols = res.data.categories.flatMap(c => c.symbols || []);
                    allSymbols.forEach(item => {
                        const mark = parseFloat(item.last_price || item.price);
                        if (mark && !isNaN(mark) && item.symbol) {
                            const rawSym = item.symbol.toUpperCase().replace("-", "");
                            window.txWalletLivePrices[rawSym] = mark;
                            window.txWalletLivePrices[rawSym.toLowerCase()] = mark;
                        }
                    });
                    if (typeof window.txUpdateLiveTradingAccountsPnL === "function") {
                        window.txUpdateLiveTradingAccountsPnL();
                    }
                }
            })
            .catch(() => {});
    }

    // 2. Open / reconnect Binance WebSocket for real-time tick-by-tick Mark Price updates
    const markStreams = Array.from(symbolSet).map(s => `${s.toLowerCase()}@markPrice`).join("/");
    const tickerStreams = Array.from(symbolSet).map(s => `${s.toLowerCase()}@ticker`).join("/");
    const streamList = `${markStreams}/${tickerStreams}`;
    if (txTaWs) {
        try { txTaWs.close(); } catch (_) {}
        txTaWs = null;
    }

    try {
        txTaWs = new WebSocket(`wss://fstream.binance.com/stream?streams=${streamList}`);
        txTaWs.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                const data = msg.data || msg;
                if (!data) return;

                const sym = data.s;
                const eventType = data.e || "";
                const stream = String(msg.stream || "").toLowerCase();
                let price = 0;

                if (eventType === "markPriceUpdate" || stream.includes("@markprice")) {
                    price = parseFloat(data.p);
                } else if (eventType === "24hrTicker" || stream.includes("@ticker") || stream.includes("@miniticker")) {
                    price = parseFloat(data.c);
                } else if (data.c && !isNaN(parseFloat(data.c))) {
                    price = parseFloat(data.c);
                } else if (data.p && !isNaN(parseFloat(data.p)) && parseFloat(data.p) > 10) {
                    price = parseFloat(data.p);
                }

                if (sym && Number.isFinite(price) && price > 0) {
                    const cleanSym = String(sym).replace(/[^A-Z0-9]/g, "").toUpperCase();
                    window.txWalletLivePrices[cleanSym] = price;
                    window.txWalletLivePrices[cleanSym.toLowerCase()] = price;
                    window.txUpdateLiveTradingAccountsPnL();
                }
            } catch (_) {}
        };
        txTaWs.onerror = () => {};
        txTaWs.onclose = () => {
            setTimeout(() => {
                const tradingTab = document.getElementById("contentTradingAccounts");
                if (tradingTab && !tradingTab.classList.contains("hidden")) {
                    window.txStartTaLivePnlStreaming();
                }
            }, 3000);
        };
    } catch (_) {}

    // 3. Periodic fast sync of positions from backend
    if (!txTaPollingInterval) {
        txTaPollingInterval = setInterval(async () => {
            const tradingTab = document.getElementById("contentTradingAccounts");
            if (tradingTab && !tradingTab.classList.contains("hidden") && document.visibilityState === "visible") {
                try {
                    const res = await apiRequest("/user/sub-accounts");
                    if (res && res.data) {
                        txSubAccountsLocalCache = res.data;
                        const parentEntry = res.data.find(s => s.is_parent);
                        const subAccountsOnly = res.data.filter(s => !s.is_parent);
                        const activeSubId = localStorage.getItem("traidiumx_active_user_id");
                        const isMainActive = !activeSubId || activeSubId === "main";
                        const activeCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
                        const isINR = activeCurrency === "INR";
                        const updatedAllAccounts = [];
                        const mainTradingBal = isINR
                            ? walletNumber(WALLET_STATE.wallet?.trading_wallet_inr?.available_balance ?? parentEntry?.wallet?.trading_wallet_inr?.available_balance, 0)
                            : walletNumber(WALLET_STATE.wallet?.trading_wallet_usdt?.available_balance ?? WALLET_STATE.wallet?.trading_wallet?.available_balance ?? WALLET_STATE.wallet?.available_balance ?? parentEntry?.wallet?.trading_wallet_usdt?.available_balance, 0);
                        
                        let mainPos = parentEntry?.positions || [];
                        if (!mainPos.length) {
                            try {
                                const token = localStorage.getItem("traidiumx_auth_token") || "guest";
                                const cached = localStorage.getItem("tx_cached_positions_" + token.substring(0, 15) + "_master")
                                    || localStorage.getItem("tx_cached_positions_" + token.substring(0, 15) + "_main");
                                if (cached) {
                                    const parsed = JSON.parse(cached);
                                    if (Array.isArray(parsed) && parsed.length > 0) mainPos = parsed;
                                }
                            } catch (_) {}
                        }
                        const mainPnlVal = mainPos.length ? mainPos.reduce((sum, pos) => sum + window.txCalcSinglePositionLivePnl(pos), 0) : Number(parentEntry?.unrealized_pnl || 0);

                        updatedAllAccounts.push({
                            id: "main",
                            name: "Main Trading Account",
                            clientId: parentEntry?.client_id || (parentEntry?.id ? parentEntry.id.slice(0, 8) : "L1723926"),
                            isDemo: false,
                            isParent: true,
                            isActive: isMainActive,
                            balanceUsd: mainTradingBal,
                            pnlUsd: mainPnlVal,
                            positions: mainPos,
                            planName: "Extended swap-free",
                            planColor: "emerald"
                        });

                        subAccountsOnly.forEach(sub => {
                            const isDemo = Boolean(sub.is_demo || sub.account_mode === "demo" || sub.plan === "demo" || sub.plan_name?.toLowerCase().includes("demo"));
                            const balUsd = isINR
                                ? walletNumber(sub.wallet?.trading_wallet_inr?.available_balance, 0)
                                : walletNumber(sub.wallet?.trading_wallet_usdt?.available_balance ?? sub.wallet?.available_balance, 0);
                            let subPos = sub.positions || [];
                            if (!subPos.length) {
                                try {
                                    const token = localStorage.getItem("traidiumx_auth_token") || "guest";
                                    const cached = localStorage.getItem("tx_cached_positions_" + token.substring(0, 15) + "_" + sub.id);
                                    if (cached) {
                                        const parsed = JSON.parse(cached);
                                        if (Array.isArray(parsed) && parsed.length > 0) subPos = parsed;
                                    }
                                } catch (_) {}
                            }
                            const subPnlVal = subPos.length ? subPos.reduce((sum, pos) => sum + window.txCalcSinglePositionLivePnl(pos), 0) : Number(sub.unrealized_pnl || 0);

                            updatedAllAccounts.push({
                                id: sub.id,
                                name: sub.name,
                                clientId: sub.client_id || (sub.id ? sub.id.slice(0, 8) : "SUB"),
                                isDemo: isDemo,
                                isParent: false,
                                isActive: activeSubId === sub.id,
                                balanceUsd: balUsd,
                                pnlUsd: subPnlVal,
                                positions: subPos,
                                planName: sub.plan_name || (isDemo ? "Demo" : "Extended swap-free"),
                                planColor: isDemo ? "amber" : (sub.plan_color || "emerald")
                            });
                        });

                        window.txTaAccountsCache = updatedAllAccounts;
                        window.txUpdateLiveTradingAccountsPnL();
                    }
                } catch (_) {}
            }
        }, 4000);
    }
};

function txRenderTradingAccounts() {
    const listContainer = document.getElementById("txTaAccountsList") || document.getElementById("tradingAccountsList");
    if (!listContainer) return;

    const cache = txSubAccountsLocalCache || [];
    const parentEntry = cache.find(sub => sub.is_parent);
    const subAccountsOnly = cache.filter(sub => !sub.is_parent);

    const activeCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const isINR = activeCurrency === "INR";
    const currLabel = isINR ? "INR" : "USD";
    const activeSubId = localStorage.getItem("traidiumx_active_user_id");
    const isMainActive = !activeSubId || activeSubId === "main";

    const wallet = WALLET_STATE.wallet || {};
    const rate = walletNumber(wallet.usdt_inr_rate || localStorage.getItem("tx_usdt_inr_rate") || 88.50, 88.50);
    const hidden = isBalanceHidden();

    // 1. Calculate Main Account Balance & PnL
    const mainTradingBal = isINR
        ? walletNumber(wallet.trading_wallet_inr?.available_balance ?? parentEntry?.wallet?.trading_wallet_inr?.available_balance, 0)
        : walletNumber(wallet.trading_wallet_usdt?.available_balance ?? wallet.trading_wallet?.available_balance ?? wallet.available_balance ?? parentEntry?.wallet?.trading_wallet_usdt?.available_balance, 0);
    let mainPositions = parentEntry?.positions || [];
    if (!mainPositions.length) {
        try {
            const token = localStorage.getItem("traidiumx_auth_token") || "guest";
            const cached = localStorage.getItem("tx_cached_positions_" + token.substring(0, 15) + "_master")
                || localStorage.getItem("tx_cached_positions_" + token.substring(0, 15) + "_main");
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) mainPositions = parsed;
            }
        } catch (_) {}
    }
    const mainPnl = mainPositions.length 
        ? mainPositions.reduce((sum, pos) => sum + window.txCalcSinglePositionLivePnl(pos), 0)
        : (parentEntry?.unrealized_pnl !== undefined ? Number(parentEntry.unrealized_pnl) : (isMainActive ? walletNumber(WALLET_STATE.pnlSummary?.total_unrealized_pnl, 0) : 0));

    // Build unified accounts list
    const allAccounts = [];
    
    // Main Real Account
    allAccounts.push({
        id: "main",
        name: "Main Trading Account",
        clientId: parentEntry?.client_id || (parentEntry?.id ? parentEntry.id.slice(0, 8) : ((typeof getAuthUser === "function" ? getAuthUser()?.client_id : "") || "554523")),
        isDemo: false,
        isParent: true,
        isActive: isMainActive,
        balanceUsd: mainTradingBal,
        pnlUsd: mainPnl,
        positions: mainPositions,
        planName: "Extended swap-free",
        planColor: "emerald"
    });

    // Sub accounts
    subAccountsOnly.forEach(sub => {
        const isDemo = Boolean(sub.is_demo || sub.account_mode === "demo" || sub.plan === "demo" || sub.plan_name?.toLowerCase().includes("demo"));
        const balUsd = isINR
            ? walletNumber(sub.wallet?.trading_wallet_inr?.available_balance, 0)
            : walletNumber(sub.wallet?.trading_wallet_usdt?.available_balance ?? sub.wallet?.available_balance, 0);
        let subPositions = sub.positions || [];
        if (!subPositions.length) {
            try {
                const token = localStorage.getItem("traidiumx_auth_token") || "guest";
                const cached = localStorage.getItem("tx_cached_positions_" + token.substring(0, 15) + "_" + sub.id);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (Array.isArray(parsed) && parsed.length > 0) subPositions = parsed;
                }
            } catch (_) {}
        }
        const pnl = subPositions.length
            ? subPositions.reduce((sum, pos) => sum + window.txCalcSinglePositionLivePnl(pos), 0)
            : (sub.unrealized_pnl !== undefined ? Number(sub.unrealized_pnl) : (activeSubId === sub.id ? walletNumber(WALLET_STATE.pnlSummary?.total_unrealized_pnl, 0) : 0));

        allAccounts.push({
            id: sub.id,
            name: sub.name,
            clientId: sub.client_id || (sub.id ? sub.id.slice(0, 8) : "SUB"),
            isDemo: isDemo,
            isParent: false,
            isActive: activeSubId === sub.id,
            balanceUsd: balUsd,
            pnlUsd: pnl,
            positions: subPositions,
            planName: sub.plan_name || (isDemo ? "Demo" : "Extended swap-free"),
            planColor: isDemo ? "amber" : (sub.plan_color || "emerald")
        });
    });

    window.txTaAccountsCache = allAccounts;

    // Filter accounts by Real / Demo and Hide Empty
    const filteredAccounts = allAccounts.filter(acc => {
        const matchType = (txTaFilterMode === "demo") ? acc.isDemo : !acc.isDemo;
        const matchEmpty = !txTaHideEmpty || acc.balanceUsd > 0;
        return matchType && matchEmpty;
    });

    // Calculate active account Balance
    const activeAccount = allAccounts.find(a => a.isActive) || allAccounts[0];
    const activeAccountBalUsd = activeAccount ? activeAccount.balanceUsd : 0;

    // Update Top Hero Card in Trading Accounts Tab with Active Account's Balance
    const taTotalEl = document.getElementById("txTaTotalFundsVal");
    if (taTotalEl) {
        if (hidden) {
            taTotalEl.textContent = `≈ ******** ${currLabel}`;
        } else {
            taTotalEl.textContent = `≈ ${activeAccountBalUsd.toLocaleString(isINR ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currLabel}`;
        }
    }

    const groupTotalEl = document.getElementById("txTaGroupTotal");
    if (groupTotalEl) {
        if (hidden) {
            groupTotalEl.textContent = `≈ ******** ${currLabel}`;
        } else {
            groupTotalEl.textContent = `≈ ${activeAccountBalUsd.toLocaleString(isINR ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currLabel}`;
        }
    }

    // Render Cards in PrimeXBT Style
    if (filteredAccounts.length === 0) {
        listContainer.innerHTML = `
            <div class="rounded-3xl border border-white/5 bg-[#07111f]/60 p-8 text-center backdrop-blur-xl">
                <p class="text-sm font-bold text-slate-400">No ${txTaFilterMode === "demo" ? "Demo" : "Real"} trading accounts found.</p>
                <button onclick="txOpenSubAccountCreationModal('${txTaFilterMode}')" class="mt-4 px-5 py-2.5 rounded-xl bg-cyan-400 text-slate-950 font-black text-xs transition hover:scale-105 active:scale-95 cursor-pointer">
                    + Create ${txTaFilterMode === "demo" ? "Demo" : "Real"} Account
                </button>
            </div>
        `;
    } else {
        window.txExpandedTaCards = window.txExpandedTaCards || new Set();
        listContainer.innerHTML = filteredAccounts.map(acc => {
            const isSelected = acc.isActive;
            const isExpanded = window.txExpandedTaCards.has(String(acc.id));
            const balStr = hidden ? "********" : `${acc.balanceUsd.toLocaleString(isINR ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currLabel}`;
            const pnlPrefix = acc.pnlUsd > 0 ? "+" : "";
            const pnlStr = hidden ? "*****" : `${pnlPrefix}${acc.pnlUsd.toLocaleString(isINR ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currLabel}`;
            const pnlClass = acc.pnlUsd > 0 ? "text-emerald-400" : (acc.pnlUsd < 0 ? "text-red-400" : "text-white");
            const badgeClass = acc.isDemo 
                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
            const detailsWrapperClass = isExpanded ? "expanded" : "";
            const toggleText = isExpanded ? "Show less" : "Show more";
            const toggleIconClass = isExpanded ? "rotate-180" : "";

            return `
                <div class="rounded-3xl border ${isSelected ? 'border-cyan-500/50 bg-[#07111f]/90 shadow-lg shadow-cyan-950/30' : 'border-white/10 bg-[#07111f]/70 hover:border-white/20'} p-5 sm:p-6 backdrop-blur-xl transition duration-200">
                    <!-- Top Line: Account ID + Badges -->
                    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="font-mono text-xs sm:text-sm font-black text-slate-400">#${escapeHtml(String(acc.clientId))}</span>
                            <span class="font-black text-xs sm:text-sm text-white">${escapeHtml(acc.name)}</span>
                            <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${badgeClass} font-mono">
                                ${escapeHtml(acc.planName || (acc.isDemo ? "Demo" : "Extended swap-free"))}
                            </span>
                            ${isSelected ? '<span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">Active</span>' : ''}
                        </div>

                        <!-- 3 Action Buttons -->
                        <div class="flex items-center gap-2.5 ml-auto">
                            <button onclick="txHandleAccountAction('${acc.id}', 'deposit')" type="button" class="px-4 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white font-bold text-xs border border-white/10 transition hover:scale-105 active:scale-95 cursor-pointer">
                                Deposit
                            </button>
                            <button onclick="txHandleAccountAction('${acc.id}', 'transfer')" type="button" class="px-4 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white font-bold text-xs border border-white/10 transition hover:scale-105 active:scale-95 cursor-pointer">
                                Transfer
                            </button>
                            <button onclick="txHandleAccountAction('${acc.id}', 'trade')" type="button" class="px-5 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs shadow-md shadow-cyan-400/20 transition hover:scale-105 active:scale-95 cursor-pointer">
                                Trade
                            </button>
                        </div>
                    </div>

                    <!-- Middle Line: Your funds & P/L -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                        <div>
                            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Your funds</span>
                            <strong class="text-xl sm:text-2xl font-black text-white font-mono block mt-1">${balStr}</strong>
                        </div>

                        <div>
                            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">P/L</span>
                            <strong id="txTaCardPnl_${acc.id}" data-ta-acc-id="${acc.id}" class="text-xl sm:text-2xl font-black ${pnlClass} font-mono block mt-1 transition-colors duration-150">${pnlStr}</strong>
                        </div>

                        <div class="sm:col-span-2 lg:col-span-1 flex items-end justify-end">
                            <button onclick="txToggleTaCardDetails('${acc.id}')" type="button" class="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-cyan-300 transition p-1 cursor-pointer">
                                <span id="txTaToggleText_${acc.id}">${toggleText}</span>
                                <svg id="txTaToggleIcon_${acc.id}" class="w-3.5 h-3.5 transition-transform duration-300 ${toggleIconClass}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
                            </button>
                        </div>
                    </div>

                    <!-- Collapsible Details Section with Smooth Dropdown Animation -->
                    <div id="txTaDetails_${acc.id}" class="tx-ta-details-wrapper ${detailsWrapperClass}">
                        <div class="tx-ta-details-inner">
                            <div class="pt-4 border-t border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                                <div>
                                    <span class="text-slate-500 font-semibold block">Leverage</span>
                                    <strong class="text-white font-mono font-bold mt-0.5 block">100x</strong>
                                </div>
                                <div>
                                    <span class="text-slate-500 font-semibold block">Margin Mode</span>
                                    <strong class="text-white font-mono font-bold mt-0.5 block">Cross / Isolated</strong>
                                </div>
                                <div>
                                    <span class="text-slate-500 font-semibold block">Currency</span>
                                    <strong class="text-white font-mono font-bold mt-0.5 block">${acc.isDemo ? "USDT (Demo)" : "USDT / USD"}</strong>
                                </div>
                                <div class="flex items-center justify-end">
                                    ${!isSelected ? `
                                        <button onclick="txSetActiveTradingAccount('${acc.id}')" class="px-3.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-xs border border-cyan-500/30 transition cursor-pointer">
                                             Set as Active
                                        </button>
                                    ` : `
                                        <span class="text-emerald-400 font-bold text-xs flex items-center gap-1">✓ Current Active Account</span>
                                    `}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join("");
    }

    // Start live tick-by-tick streaming for the cards
    window.txStartTaLivePnlStreaming();

    // MT5 Accounts Section
    const mt5Section = document.getElementById("txTaMt5GroupSection");
    const mt5List = document.getElementById("txTaMt5AccountsList");
    const user = typeof getAuthUser === "function" ? getAuthUser() : null;
    const isMt5User = user && user.selected_platform === "mt5";
    const mt5Account = WALLET_STATE.mt5?.account;

    if (mt5Section && mt5List) {
        if (isMt5User && mt5Account && txTaFilterMode !== "demo") {
            mt5Section.classList.remove("hidden");
            const mt5Bal = walletNumber(mt5Account.balance, 0);
            const mt5BalStr = hidden ? "********" : `${mt5Bal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
            const mt5GroupTotal = document.getElementById("txTaMt5GroupTotal");
            if (mt5GroupTotal) mt5GroupTotal.textContent = `≈ ${mt5BalStr}`;

            mt5List.innerHTML = `
                <div class="rounded-3xl border border-white/10 bg-[#07111f]/70 p-5 sm:p-6 backdrop-blur-xl">
                    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-xs sm:text-sm font-black text-slate-400">#${escapeHtml(String(mt5Account.login || 'CENT1341004'))}</span>
                            <span class="font-black text-xs sm:text-sm text-white">MetaTrader 5 Account</span>
                            <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-md border bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-mono">Cent Extended swap-free</span>
                        </div>
                        <div class="flex items-center gap-2.5 ml-auto">
                            <button onclick="openWalletActionModal('deposit')" type="button" class="px-4 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white font-bold text-xs border border-white/10 transition">Deposit</button>
                            <button onclick="openWalletActionModal('transfer')" type="button" class="px-4 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white font-bold text-xs border border-white/10 transition">Transfer</button>
                            <a href="/src/pages/futures.html" class="px-5 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs shadow-md shadow-cyan-400/20 transition">Trade</a>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                        <div>
                            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Your funds</span>
                            <strong class="text-xl sm:text-2xl font-black text-white font-mono block mt-1">${mt5BalStr}</strong>
                        </div>
                        <div>
                            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">P/L</span>
                            <strong class="text-xl sm:text-2xl font-black text-white font-mono block mt-1">0.00 USD</strong>
                        </div>
                    </div>
                </div>
            `;
        } else {
            mt5Section.classList.add("hidden");
        }
    }
}

window.txHandleAccountAction = function(accId, action) {
    if (action === "deposit") {
        if (accId && typeof TX_DEPOSIT_STATE !== "undefined") {
            TX_DEPOSIT_STATE.selectedAccount = accId;
        }
        if (typeof window.txOpenDepositChoiceModal === "function") {
            window.txOpenDepositChoiceModal();
        } else if (typeof window.txActivateDepositTab === "function") {
            window.txActivateDepositTab("crypto");
        } else {
            openWalletActionModal("deposit", null, accId);
        }
    } else if (action === "transfer") {
        openWalletActionModal("transfer", null, accId);
    } else if (action === "trade") {
        if (typeof txSetActiveTradingAccount === "function") {
            txSetActiveTradingAccount(accId);
        }
        window.location.href = "/src/pages/futures.html";
    }
};

window.txExpandedTaCards = window.txExpandedTaCards || new Set();
window.txToggleTaCardDetails = function(accId) {
    const wrapper = document.getElementById(`txTaDetails_${accId}`);
    const text = document.getElementById(`txTaToggleText_${accId}`);
    const icon = document.getElementById(`txTaToggleIcon_${accId}`);
    if (!wrapper) return;

    window.txExpandedTaCards = window.txExpandedTaCards || new Set();
    const isExpanded = wrapper.classList.contains("expanded");
    if (!isExpanded) {
        wrapper.classList.add("expanded");
        window.txExpandedTaCards.add(String(accId));
        if (text) text.textContent = "Show less";
        if (icon) icon.classList.add("rotate-180");
    } else {
        wrapper.classList.remove("expanded");
        window.txExpandedTaCards.delete(String(accId));
        if (text) text.textContent = "Show more";
        if (icon) icon.classList.remove("rotate-180");
    }
};

window.txLoadDynamicPlanSettings = async function() {
    try {
        const resp = await apiRequest("/onboarding/config");
        const settings = resp?.data?.settings;
        const plans = settings?.plans;
        if (!plans) return;

        // Basic
        if (plans.basic) {
            const basicMin = Number(plans.basic.minimum_balance || 0);
            const basicMinEl = document.getElementById("subPlanBasicMinPill");
            if (basicMinEl) {
                basicMinEl.textContent = basicMin === 0 ? "MIN $0.00" : `MIN $${basicMin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
            const basicSpreadEl = document.getElementById("subPlanBasicSpread");
            if (basicSpreadEl) {
                const spreadVal = plans.basic.spread_value !== undefined ? plans.basic.spread_value : 18;
                basicSpreadEl.textContent = plans.basic.spread_type === "percentage" ? `${spreadVal}% Spread` : `Fixed ${spreadVal} USDT`;
            }
        }

        // Standard
        if (plans.standard) {
            const standardMin = Number(plans.standard.minimum_balance || 2000);
            const standardMinEl = document.getElementById("subPlanStandardMinPill");
            if (standardMinEl) {
                standardMinEl.textContent = `MIN $${standardMin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
            const standardSpreadEl = document.getElementById("subPlanStandardSpread");
            if (standardSpreadEl) {
                const spreadVal = plans.standard.spread_value !== undefined ? plans.standard.spread_value : 12;
                standardSpreadEl.textContent = plans.standard.spread_type === "percentage" ? `${spreadVal}% Spread` : `Fixed ${spreadVal} USDT`;
            }
        }

        // Advanced
        if (plans.advanced) {
            const advMin = Number(plans.advanced.minimum_balance || 5000);
            const advMinEl = document.getElementById("subPlanAdvancedMinPill");
            if (advMinEl) {
                advMinEl.textContent = `MIN $${advMin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
            const advSpreadEl = document.getElementById("subPlanAdvancedSpread");
            if (advSpreadEl) {
                const spreadVal = plans.advanced.spread_value !== undefined ? plans.advanced.spread_value : 5;
                advSpreadEl.textContent = plans.advanced.spread_type === "percentage" ? `${spreadVal}% Spread` : `Fixed ${spreadVal} USDT`;
            }
        }
    } catch (err) {
        // Fallback gracefully to default template values
    }
};

window.txOpenSubAccountCreationModal = function(defaultMode = "real") {
    const modal = document.getElementById("subAccountModal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    txSetSubModalMode(defaultMode);
    txRenderSubAccountsList();
    if (typeof window.txLoadDynamicPlanSettings === "function") {
        window.txLoadDynamicPlanSettings();
    }
    const scrollBody = document.getElementById("subAccountModalScrollBody") || modal.querySelector(".overflow-y-auto");
    if (scrollBody) scrollBody.scrollTop = 0;
};

let txTaSelectedPlan = "basic";
let txTaSelectedPlatform = "pxtrader";

function txSetSubModalMode(mode = "real") {
    txTaModalSubMode = mode;
    const realBtn = document.getElementById("subModalModeRealBtn");
    const demoBtn = document.getElementById("subModalModeDemoBtn");
    const platformSection = document.getElementById("subModalPlatformSection");
    const realPlanSection = document.getElementById("subModalRealPlanSection");
    const demoExistingNotice = document.getElementById("subModalDemoExistingNotice");
    const demoNewSection = document.getElementById("subModalDemoNewSection");
    const submitBtn = document.getElementById("subAccountSubmitBtn");

    const hasExistingDemo = (txSubAccountsLocalCache || []).some(s => s.is_demo || s.account_mode === "demo" || s.plan === "demo");

    if (mode === "demo") {
        demoBtn?.setAttribute("class", "px-5 sm:px-6 py-2 rounded-lg text-xs font-black transition cursor-pointer bg-amber-400 text-slate-950 shadow-sm");
        realBtn?.setAttribute("class", "px-5 sm:px-6 py-2 rounded-lg text-xs font-semibold transition cursor-pointer text-slate-400 hover:text-white");
        
        platformSection?.classList.add("hidden");
        realPlanSection?.classList.add("hidden");

        if (hasExistingDemo) {
            demoExistingNotice?.classList.remove("hidden");
            demoNewSection?.classList.add("hidden");
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.className = "flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-slate-800 text-slate-500 text-xs font-black cursor-not-allowed opacity-60";
                submitBtn.textContent = "Account Limit Reached";
            }
        } else {
            demoExistingNotice?.classList.add("hidden");
            demoNewSection?.classList.remove("hidden");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.className = "flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-xs font-black text-slate-950 transition cursor-pointer shadow-lg shadow-amber-500/20";
                submitBtn.textContent = "Create demo account";
            }
        }
    } else {
        realBtn?.setAttribute("class", "px-5 sm:px-6 py-2 rounded-lg text-xs font-black transition cursor-pointer bg-white/10 text-white border border-white/20 shadow-sm");
        demoBtn?.setAttribute("class", "px-5 sm:px-6 py-2 rounded-lg text-xs font-semibold transition cursor-pointer text-slate-400 hover:text-white");

        platformSection?.classList.remove("hidden");
        realPlanSection?.classList.remove("hidden");
        demoExistingNotice?.classList.add("hidden");
        demoNewSection?.classList.add("hidden");

        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.className = "flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-xs font-black text-slate-950 transition cursor-pointer shadow-lg shadow-cyan-500/20";
            submitBtn.textContent = "Create account";
        }
    }
}

async function txRenderSubAccountsList() {
    const container = document.getElementById("subAccountsContainer");
    const countBadge = document.getElementById("subExistingCountBadge");
    if (!container) return;

    try {
        const response = await apiRequest("/user/sub-accounts");
        const subAccounts = response.data || [];
        txSubAccountsLocalCache = subAccounts;

        const subAccountsOnly = subAccounts.filter(s => !s.is_parent);
        if (countBadge) countBadge.textContent = subAccountsOnly.length;

        if (subAccountsOnly.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-500 font-semibold py-2">No sub accounts created yet.</p>`;
            return;
        }

        const activeSubId = localStorage.getItem("traidiumx_active_user_id");

        container.innerHTML = subAccountsOnly.map(sub => {
            const isSelected = activeSubId === sub.id;
            const isDemo = sub.is_demo || sub.account_mode === "demo" || sub.plan === "demo";
            return `
                <div class="flex items-center justify-between p-2.5 rounded-xl border ${isSelected ? 'border-cyan-500/50 bg-cyan-950/20' : 'border-slate-800 bg-slate-900/60'} text-xs">
                    <div class="min-w-0 flex-1 mr-2">
                        <div class="flex items-center gap-1.5">
                            <strong class="text-white truncate">${escapeHtml(sub.name)}</strong>
                            <span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${isDemo ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'}">${isDemo ? 'DEMO' : 'REAL'}</span>
                            ${isSelected ? '<span class="text-[9px] font-bold text-emerald-400">● Active</span>' : ''}
                        </div>
                        <span class="text-[10px] text-slate-500 mt-0.5 block">ID: ${escapeHtml(sub.client_id || sub.id.slice(0,8))} · ${sub.plan_name || 'Basic'}</span>
                    </div>
                    <button onclick="txSetActiveTradingAccount('${sub.id}')" type="button" class="shrink-0 px-2.5 py-1 rounded-lg ${isSelected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 hover:bg-cyan-400 hover:text-slate-950 text-slate-300'} font-bold text-[11px] transition">
                        ${isSelected ? 'Active' : 'Switch'}
                    </button>
                </div>
            `;
        }).join("");
    } catch (e) {
        console.error("Failed to render sub accounts list in modal:", e);
    }
}

function txInitTradingAccountsInteractions() {
    if (typeof window.txLoadDynamicPlanSettings === "function") {
        window.txLoadDynamicPlanSettings();
    }

    // 1. Header Hero Actions
    document.getElementById("txTaNewAccountBtn")?.addEventListener("click", () => {
        txOpenSubAccountCreationModal(txTaFilterMode);
    });
    document.getElementById("txTaBottomCreateBtn")?.addEventListener("click", () => {
        txOpenSubAccountCreationModal(txTaFilterMode);
    });

    document.getElementById("txTaTogglePrivacyBtn")?.addEventListener("click", () => {
        const isHidden = isBalanceHidden();
        localStorage.setItem("tx_balance_hidden", isHidden ? "0" : "1");
        
        const openIcon = document.getElementById("txTaEyeOpenIcon");
        const closedIcon = document.getElementById("txTaEyeClosedIcon");
        if (openIcon && closedIcon) {
            openIcon.classList.toggle("hidden", !isHidden);
            closedIcon.classList.toggle("hidden", isHidden);
        }

        renderWalletPage();
    });

    document.getElementById("txTaDepositBtn")?.addEventListener("click", () => {
        if (typeof window.txOpenDepositChoiceModal === "function") {
            window.txOpenDepositChoiceModal();
        } else if (typeof window.txActivateDepositTab === "function") {
            window.txActivateDepositTab("crypto");
        } else {
            openWalletActionModal("deposit");
        }
    });
    document.getElementById("txTaWithdrawBtn")?.addEventListener("click", () => {
        if (typeof window.txActivateWithdrawTab === "function") {
            window.txActivateWithdrawTab("crypto");
        } else if (typeof openWalletActionModal === "function") {
            openWalletActionModal("withdraw");
        }
    });
    document.getElementById("txTaTransferBtn")?.addEventListener("click", () => {
        openWalletActionModal("transfer");
    });

    // 2. Real / Demo Filter Tabs
    const realBtn = document.getElementById("txTaFilterRealBtn");
    const demoBtn = document.getElementById("txTaFilterDemoBtn");
    if (realBtn && demoBtn) {
        realBtn.addEventListener("click", () => {
            txTaFilterMode = "real";
            realBtn.className = "px-5 py-2 rounded-lg text-xs font-black transition bg-cyan-400 text-slate-950 shadow-sm cursor-pointer";
            demoBtn.className = "px-5 py-2 rounded-lg text-xs font-black transition text-slate-400 hover:text-white cursor-pointer";
            txRenderTradingAccounts();
        });
        demoBtn.addEventListener("click", () => {
            txTaFilterMode = "demo";
            demoBtn.className = "px-5 py-2 rounded-lg text-xs font-black transition bg-amber-400 text-slate-950 shadow-sm cursor-pointer";
            realBtn.className = "px-5 py-2 rounded-lg text-xs font-black transition text-slate-400 hover:text-white cursor-pointer";
            txRenderTradingAccounts();
        });
    }

    // 3. Hide Empty Accounts Checkbox
    const hideEmptyCheck = document.getElementById("txTaHideEmptyCheck");
    if (hideEmptyCheck) {
        hideEmptyCheck.addEventListener("change", (e) => {
            txTaHideEmpty = Boolean(e.target.checked);
            txRenderTradingAccounts();
        });
    }

    // 4. Transfer History Link
    document.getElementById("txTaHistoryLinkBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        if (typeof window.txActivateHistoryTab === "function") {
            window.txActivateHistoryTab();
        }
    });

    // 5. Sub-Account Modal Handlers
    const subModal = document.getElementById("subAccountModal");
    const subCloseBtn = document.getElementById("subAccountModalClose");
    const subBottomCloseBtn = document.getElementById("subAccountModalBottomClose");

    const txCloseSubModal = () => {
        if (subModal) {
            subModal.classList.add("hidden");
            subModal.classList.remove("flex");
        }
    };

    if (subCloseBtn) subCloseBtn.addEventListener("click", txCloseSubModal);
    if (subBottomCloseBtn) subBottomCloseBtn.addEventListener("click", txCloseSubModal);
    if (subModal) {
        subModal.addEventListener("click", (e) => {
            if (e.target === subModal) txCloseSubModal();
        });
    }

    // Collapsible Existing Accounts Drawer
    const existingToggleBtn = document.getElementById("subExistingToggleBtn");
    const existingDrawer = document.getElementById("subExistingDrawer");
    const existingArrow = document.getElementById("subExistingArrow");
    if (existingToggleBtn && existingDrawer) {
        existingToggleBtn.addEventListener("click", () => {
            const isHidden = existingDrawer.classList.contains("hidden");
            existingDrawer.classList.toggle("hidden", !isHidden);
            if (existingArrow) {
                existingArrow.textContent = isHidden ? "▲" : "▼";
            }
            if (isHidden) {
                setTimeout(() => {
                    existingDrawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }, 50);
            }
        });
    }

    // Platform selection
    const platPx = document.getElementById("subPlatformPxTrader");
    const platMt5 = document.getElementById("subPlatformMT5");
    const platPxRadio = document.getElementById("subPlatformPxRadio");
    const platMt5Radio = document.getElementById("subPlatformMt5Radio");

    const updatePlatformCards = (plat) => {
        txTaSelectedPlatform = plat;
        if (plat === "pxtrader") {
            platPx?.setAttribute("class", "relative rounded-2xl border-2 border-cyan-400 bg-[#081526]/90 p-4 transition cursor-pointer shadow-[0_0_20px_rgba(34,211,238,0.12)] flex items-center justify-between");
            platMt5?.setAttribute("class", "relative rounded-2xl border border-slate-800 bg-[#090e1a]/60 p-4 transition cursor-pointer hover:border-slate-700 flex items-center justify-between opacity-80 hover:opacity-100");
            if (platPxRadio) {
                platPxRadio.className = "w-5 h-5 rounded-full bg-cyan-400 flex items-center justify-center shrink-0";
                platPxRadio.innerHTML = '<svg class="w-3 h-3 text-slate-950" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
            }
            if (platMt5Radio) {
                platMt5Radio.className = "w-5 h-5 rounded-full border border-slate-600 bg-transparent shrink-0";
                platMt5Radio.innerHTML = '';
            }
        } else {
            platMt5?.setAttribute("class", "relative rounded-2xl border-2 border-cyan-400 bg-[#081526]/90 p-4 transition cursor-pointer shadow-[0_0_20px_rgba(34,211,238,0.12)] flex items-center justify-between");
            platPx?.setAttribute("class", "relative rounded-2xl border border-slate-800 bg-[#090e1a]/60 p-4 transition cursor-pointer hover:border-slate-700 flex items-center justify-between opacity-80 hover:opacity-100");
            if (platMt5Radio) {
                platMt5Radio.className = "w-5 h-5 rounded-full bg-cyan-400 flex items-center justify-center shrink-0";
                platMt5Radio.innerHTML = '<svg class="w-3 h-3 text-slate-950" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
            }
            if (platPxRadio) {
                platPxRadio.className = "w-5 h-5 rounded-full border border-slate-600 bg-transparent shrink-0";
                platPxRadio.innerHTML = '';
            }
        }
    };
    platPx?.addEventListener("click", () => updatePlatformCards("pxtrader"));
    platMt5?.addEventListener("click", () => updatePlatformCards("mt5"));

    // Plan selection
    const planCards = document.querySelectorAll(".tx-sub-plan-card");
    const planSelect = document.getElementById("newSubPlanSelect");

    const updatePlanCards = (plan) => {
        txTaSelectedPlan = plan;
        if (planSelect) planSelect.value = plan;

        planCards.forEach(card => {
            const cardPlan = card.getAttribute("data-plan");
            const radioContainer = card.querySelector(".tx-plan-radio");
            const radio = card.querySelector(".tx-plan-radio div");
            if (cardPlan === plan) {
                card.className = "tx-sub-plan-card relative flex flex-col justify-between rounded-2xl border-2 border-cyan-400 bg-[#081526]/90 p-4 transition cursor-pointer shadow-[0_0_20px_rgba(34,211,238,0.12)]";
                if (radioContainer) radioContainer.className = "tx-plan-radio w-4 h-4 rounded-full border-2 border-cyan-400 bg-cyan-400 flex items-center justify-center p-0.5 shrink-0";
                if (radio) radio.className = "w-1.5 h-1.5 rounded-full bg-slate-950";
            } else {
                card.className = "tx-sub-plan-card relative flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#090e1a]/60 p-4 transition cursor-pointer hover:border-slate-700";
                if (radioContainer) radioContainer.className = "tx-plan-radio w-4 h-4 rounded-full border border-slate-600 bg-transparent flex items-center justify-center p-0.5 shrink-0";
                if (radio) radio.className = "w-1.5 h-1.5 rounded-full bg-transparent";
            }
        });
    };

    planCards.forEach(card => {
        card.addEventListener("click", () => {
            const p = card.getAttribute("data-plan");
            if (p) updatePlanCards(p);
        });
    });

    document.getElementById("subModalModeRealBtn")?.addEventListener("click", () => txSetSubModalMode("real"));
    document.getElementById("subModalModeDemoBtn")?.addEventListener("click", () => txSetSubModalMode("demo"));

    const submitBtn = document.getElementById("subAccountSubmitBtn");
    if (submitBtn && submitBtn.dataset.bound !== "1") {
        submitBtn.dataset.bound = "1";
        submitBtn.addEventListener("click", async () => {
            const isDemo = txTaModalSubMode === "demo";
            const nameInput = isDemo ? document.getElementById("newSubDemoNameInput") : document.getElementById("newSubNameInput");
            const msg = document.getElementById("createSubMessage");

            let nameVal = nameInput ? nameInput.value.trim() : "";
            if (!nameVal) {
                nameVal = isDemo ? "Demo Account" : `Trading Account ${(txSubAccountsLocalCache || []).length + 1}`;
            }

            if (msg) {
                msg.classList.remove("hidden", "text-red-400", "text-emerald-400", "border-red-500/30", "border-emerald-500/30", "bg-red-500/10", "bg-emerald-500/10");
                msg.classList.add("text-slate-300", "border-slate-800", "bg-slate-900/60");
                msg.textContent = "Creating account...";
            }

            submitBtn.disabled = true;

            try {
                const res = await apiRequest("/user/sub-accounts", {
                    method: "POST",
                    body: JSON.stringify({
                        name: nameVal,
                        account_mode: isDemo ? "demo" : "real",
                        plan: isDemo ? "demo" : txTaSelectedPlan,
                        platform: txTaSelectedPlatform,
                        is_demo: isDemo
                    })
                });

                if (nameInput && !isDemo) nameInput.value = "";
                
                if (msg) {
                    msg.classList.remove("text-slate-300", "border-slate-800", "bg-slate-900/60");
                    msg.classList.add("text-emerald-300", "border-emerald-500/30", "bg-emerald-500/10");
                    msg.textContent = isDemo ? "Demo account created successfully!" : "Trading account created successfully!";
                }

                if (isDemo && res.data && res.data.id) {
                    localStorage.setItem("traidiumx_active_user_id", res.data.id);
                    localStorage.setItem("traidiumx_active_user_name", res.data.name || "Demo Account");
                }

                await txRenderSubAccountsList();
                if (typeof txInitSubAccountsAndSelector === "function") {
                    await txInitSubAccountsAndSelector();
                }
                if (typeof txPopulateTradingAccountSelect === "function") {
                    txPopulateTradingAccountSelect();
                }
                txRenderTradingAccounts();

                setTimeout(() => {
                    if (msg) msg.classList.add("hidden");
                    txCloseSubModal();
                }, 1000);
            } catch (err) {
                if (msg) {
                    msg.classList.remove("text-slate-300", "border-slate-800", "bg-slate-900/60");
                    msg.classList.add("text-red-300", "border-red-500/30", "bg-red-500/10");
                    msg.textContent = err.message || "Failed to create account.";
                }
            } finally {
                submitBtn.disabled = false;
            }
        });
    }
}


function txCalculateExchangeRate(fromAsset, toAsset) {
    const from = String(fromAsset || "").toUpperCase();
    const to = String(toAsset || "").toUpperCase();

    if (!from || !to || from === to) return null;

    const board = WALLET_STATE.board || [];
    const inrRate = 83.35;

    const defaultPriceMap = {
        "USDT": 1.0, "USDC": 1.0, "USD": 1.0, "INR": 1.0 / inrRate,
        "BTC": 64200, "ETH": 3550, "BNB": 590, "SOL": 145, "XRP": 0.62, "ADA": 0.45,
        "TRX": 0.3357, "DOT": 1.0710, "LTC": 55.20, "AVAX": 8.055, "SHIB": 0.0000185,
        "LINK": 12.649, "UNI": 7.027, "ETC": 7.970, "XLM": 0.1903, "TON": 1.600, "BCH": 258.40
    };

    function getPrice(code) {
        if (code === "USDT" || code === "USDC" || code === "USD") return 1.0;
        if (code === "INR") return 1.0 / inrRate;
        const symbol = `${code}USDT`;
        const altSymbol = code === "SHIB" ? "1000SHIBUSDT" : (code === "PEPE" ? "1000PEPEUSDT" : `${code}USD`);
        const item = board.find(b => b.symbol === symbol || b.ui_symbol === symbol || b.symbol === altSymbol);
        if (item) {
            let p = Number(item.price || item.last_price || 0);
            if (p > 0) {
                if (code === "SHIB" && item.symbol === "1000SHIBUSDT") p = p / 1000;
                return p;
            }
        }
        return defaultPriceMap[code] || 0.0;
    }

    const priceFrom = getPrice(from);
    const priceTo = getPrice(to);

    if (priceFrom > 0 && priceTo > 0) {
        return priceFrom / priceTo;
    }

    return null;
}

async function updateExchangePreview(forceFetch = false) {
    const fromAsset = document.getElementById("walletExchangeFromAsset")?.value;
    const toAsset = document.getElementById("walletExchangeToAsset")?.value;
    const amountInput = document.getElementById("walletExchangeAmount");
    const amountVal = parseFloat(amountInput?.value) || 0;
    
    const rateText = document.getElementById("txExchangeRateText");
    const previewDiv = document.getElementById("exchangeConversionPreview");
    
    if (!fromAsset || !toAsset) return;
    
    if (fromAsset === toAsset) {
        WALLET_STATE.currentExchangeRate = null;
        if (rateText) rateText.textContent = "Assets cannot be the same";
        if (previewDiv) previewDiv.textContent = "Please select different assets.";
        return;
    }

    const needsFetch = (forceFetch === true) || 
                       !WALLET_STATE.currentExchangeRate || 
                       WALLET_STATE.currentExchangeFromAsset !== fromAsset || 
                       WALLET_STATE.currentExchangeToAsset !== toAsset;

    if (needsFetch) {
        try {
            WALLET_STATE.currentExchangeFromAsset = fromAsset;
            WALLET_STATE.currentExchangeToAsset = toAsset;

            const res = await apiRequest("/wallet/exchange", {
                method: "POST",
                body: JSON.stringify({
                    from_asset: fromAsset,
                    to_asset: toAsset,
                    amount: 1.0,
                    execute: false
                })
            });
            
            if (res.success && res.data && res.data.rate) {
                WALLET_STATE.currentExchangeRate = parseFloat(res.data.rate) || txCalculateExchangeRate(fromAsset, toAsset);
            } else {
                WALLET_STATE.currentExchangeRate = txCalculateExchangeRate(fromAsset, toAsset);
            }
        } catch (err) {
            WALLET_STATE.currentExchangeRate = txCalculateExchangeRate(fromAsset, toAsset);
        }
    }

    if (!WALLET_STATE.currentExchangeRate || WALLET_STATE.currentExchangeRate <= 0) {
        WALLET_STATE.currentExchangeRate = txCalculateExchangeRate(fromAsset, toAsset);
    }

    const rate = WALLET_STATE.currentExchangeRate;
    if (rate !== null && rate > 0) {
        if (rateText) {
            rateText.textContent = `1 ${fromAsset} = ${walletNumber(rate, 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${toAsset}`;
        }
        if (previewDiv) {
            if (amountVal > 0) {
                const receive_amount = amountVal * rate;
                previewDiv.textContent = `You will receive: ${walletNumber(receive_amount, 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${toAsset}`;
                previewDiv.className = "rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs font-black text-emerald-300";
            } else {
                previewDiv.textContent = "Enter amount to see live conversion";
                previewDiv.className = "rounded-xl border border-white/10 bg-slate-950/30 p-3 text-xs font-bold text-slate-400";
            }
        }
    } else {
        if (rateText) rateText.textContent = "Exchange rate unavailable";
        if (previewDiv) previewDiv.textContent = "Exchange rate could not be calculated.";
    }
}

async function handleExchangeSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form) return;

    if (!isLoggedIn()) {
        showWalletActionMessage("Please login first.", "error");
        return;
    }

    const fromAsset = document.getElementById("walletExchangeFromAsset")?.value;
    const toAsset = document.getElementById("walletExchangeToAsset")?.value;
    const amount = parseFloat(document.getElementById("walletExchangeAmount")?.value) || 0;

    if (amount <= 0) {
        showWalletActionMessage("Please enter a valid amount.", "error");
        return;
    }

    if (fromAsset === toAsset) {
        showWalletActionMessage("Cannot exchange same currencies.", "error");
        return;
    }

    try {
        const submitBtn = document.getElementById("walletExchangeSubmitBtn");
        walletSetButtonLoading(submitBtn, true, "Exchanging...");
        
        const res = await apiRequest("/wallet/exchange", {
            method: "POST",
            body: JSON.stringify({
                from_asset: fromAsset,
                to_asset: toAsset,
                amount: amount,
                execute: true
            })
        });

        if (res.success) {
            form.reset();
            await loadWalletData({ silent: true });
            closeWalletActionModal();
            showWalletAlert(res.message || "Exchange completed successfully!", "success");
        } else {
            showWalletActionMessage(res.message || "Exchange failed.", "error");
        }
    } catch (err) {
        showWalletActionMessage(err.message || "Failed to complete exchange.", "error");
    } finally {
        const submitBtn = document.getElementById("walletExchangeSubmitBtn");
        walletSetButtonLoading(submitBtn, false);
    }
}


function updateInternalTransferBalance() {
    const wallet = WALLET_STATE.wallet || {};
    const assetSelect = walletElements.internalTransferAsset;
    const balanceEl = walletElements.internalTransferMyBalance;
    if (!assetSelect || !balanceEl) return;
    
    const asset = assetSelect.value.toUpperCase();
    const assetWallet = wallet[`main_wallet_${asset.toLowerCase()}`] || { available_balance: 0 };
    
    const avail = walletNumber(assetWallet.available_balance, 0);
    if (["INR", "USDT"].includes(asset)) {
        balanceEl.textContent = formatWalletMoney(avail, asset);
    } else {
        balanceEl.textContent = `${avail.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${asset}`;
    }

    // Set up Receive details
    const addressTextEl = document.getElementById("txItReceiveAddressText");
    const qrImageEl = document.getElementById("txItReceiveQrImage");
    const netSelectContainer = document.getElementById("txItReceiveNetworkSelectContainer");
    const netSelect = document.getElementById("txItReceiveNetworkSelect");

    if (addressTextEl && qrImageEl) {
        if (asset === "INR") {
            if (netSelectContainer) netSelectContainer.classList.add("hidden");
        } else {
            if (netSelectContainer) netSelectContainer.classList.remove("hidden");
        }

        const addresses = assetWallet.addresses || {};
        
        const primaryNetworkMapping = {
            "USDT": "TRC20",
            "USDC": "ERC20",
            "BTC": "BITCOIN",
            "ETH": "ERC20",
            "SOL": "SOLANA",
            "BNB": "BEP20",
            "XRP": "RIPPLE",
            "ADA": "CARDANO",
            "TRX": "TRC20",
            "DOT": "POLKADOT",
            "LTC": "LITECOIN",
            "AVAX": "AVAX",
            "SHIB": "ERC20",
            "LINK": "ERC20",
            "UNI": "ERC20",
            "ETC": "ETC",
            "XLM": "STELLAR",
            "TON": "TON",
            "BCH": "BITCOINCASH",
            "INR": "INTERNAL"
        };

        const primaryNet = primaryNetworkMapping[asset] || "ERC20";
        let addr = addresses[primaryNet];

        if (!addr) {
            const addressInfo = getSelectedCryptoAddressInfo();
            if (addressInfo && addressInfo.address && addressInfo.is_configured && String(addressInfo.asset || "").toUpperCase() === asset) {
                addr = addressInfo.address;
            } else {
                const user = typeof getUser === "function" ? getUser() : null;
                const userId = String(user?.id || user?.user_id || user?.email || "guest").toLowerCase();
                const raw = `traidiumx_blockchain_${asset}_${userId}_v4`;
                let h1 = 0x811c9dc5, h2 = 0x5bd1e995;
                for (let i = 0; i < raw.length; i++) {
                    const c = raw.charCodeAt(i);
                    h1 = Math.imul(h1 ^ c, 16777619);
                    h2 = Math.imul(h2 ^ c, 1540483477);
                }
                const hex1 = (h1 >>> 0).toString(16).padStart(8, "0");
                const hex2 = (h2 >>> 0).toString(16).padStart(8, "0");
                const hex3 = ((h1 ^ h2) >>> 0).toString(16).padStart(8, "0");
                const hex4 = ((h1 + h2) >>> 0).toString(16).padStart(8, "0");
                const hex5 = ((h1 * 31 + h2) >>> 0).toString(16).padStart(8, "0");
                const fullHex = `${hex1}${hex2}${hex3}${hex4}${hex5}`;

                const coin = String(asset).toUpperCase();
                if (coin === "TRX" || coin === "TRC20") {
                    addr = `T${fullHex.slice(0, 33)}`;
                } else if (coin === "BTC") {
                    addr = `1${fullHex.slice(0, 33)}`;
                } else if (coin === "LTC") {
                    addr = `L${fullHex.slice(0, 33)}`;
                } else if (coin === "SOL") {
                    addr = `${fullHex.slice(0, 32)}sol1`;
                } else if (coin === "XRP") {
                    addr = `r${fullHex.slice(0, 33)}`;
                } else if (coin === "DOT") {
                    addr = `1${fullHex.slice(0, 33)}`;
                } else if (coin === "TON") {
                    addr = `UQ${fullHex.slice(0, 32)}`;
                } else if (coin === "BCH") {
                    addr = `q${fullHex.slice(0, 33)}`;
                } else {
                    addr = `0x${fullHex.slice(0, 40)}`;
                }
            }
        }

        if (addr) {
            addressTextEl.textContent = addr;
            const siteUrl = `${window.location.origin}${window.location.pathname}`;
            const qrUrl = `${siteUrl}?recipient=${encodeURIComponent(addr)}&asset=${encodeURIComponent(asset)}`;
            qrImageEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrUrl)}`;
            qrImageEl.style.display = "block";
            qrImageEl.classList.remove("hidden");
        } else {
            addressTextEl.textContent = "No address generated";
            qrImageEl.src = "";
            qrImageEl.style.display = "none";
        }
    }
}


async function handleInternalTransferSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form) return;

    if (!isLoggedIn()) {
        showWalletActionMessage("Please login first.", "error");
        return;
    }

    const asset = walletElements.internalTransferAsset?.value;
    const recipient = walletElements.internalTransferRecipient?.value;
    const amount = parseFloat(walletElements.internalTransferAmount?.value) || 0;

    if (!recipient) {
        showWalletActionMessage("Please enter recipient Email, Client ID or Address.", "error");
        return;
    }

    if (amount <= 0) {
        showWalletActionMessage("Please enter a valid amount.", "error");
        return;
    }

    try {
        const submitBtn = walletElements.internalTransferSubmitBtn;
        walletSetButtonLoading(submitBtn, true, "Transferring...");
        
        const res = await apiRequest("/wallet/internal-transfer", {
            method: "POST",
            body: JSON.stringify({
                asset: asset,
                recipient_info: recipient,
                amount: amount
            })
        });

        if (res.success) {
            form.reset();
            await loadWalletData({ silent: true });
            closeWalletActionModal();
            showWalletAlert(res.message || "Internal transfer completed successfully!", "success");
        } else {
            showWalletActionMessage(res.message || "Transfer failed.", "error");
        }
    } catch (err) {
        showWalletActionMessage(err.message || "Failed to complete internal transfer.", "error");
    } finally {
        const submitBtn = walletElements.internalTransferSubmitBtn;
        walletSetButtonLoading(submitBtn, false);
    }
}


var recipientLookupTimeout = null;

function initRecipientLookup() {
    const input = document.getElementById("walletInternalTransferRecipient");
    const container = document.getElementById("walletInternalTransferRecipientDetails");
    const nameEl = document.getElementById("txItRecipientName");
    const emailEl = document.getElementById("txItRecipientEmail");
    const clientIdEl = document.getElementById("txItRecipientClientId");
    const errorEl = document.getElementById("walletInternalTransferRecipientError");
    const submitBtn = document.getElementById("walletInternalTransferSubmitBtn");
    
    if (input) {
        input.addEventListener("input", () => {
            const val = input.value.trim();
            
            // Clear previous timeout
            if (recipientLookupTimeout) {
                clearTimeout(recipientLookupTimeout);
            }
            
            if (!val) {
                if (container) container.classList.add("hidden");
                if (errorEl) {
                    errorEl.textContent = "";
                    errorEl.classList.add("hidden");
                }
                if (submitBtn) submitBtn.disabled = false;
                return;
            }
            
            // Debounce for 350ms
            recipientLookupTimeout = setTimeout(async () => {
                try {
                    const activeAsset = (document.getElementById("walletInternalTransferAsset")?.value || "USDT").toUpperCase();
                    const res = await apiRequest(`/wallet/lookup-recipient?query=${encodeURIComponent(val)}&asset=${activeAsset}`);
                    
                    if (res.success && res.data) {
                        if (res.data.found) {
                            if (nameEl) nameEl.textContent = res.data.name;
                            if (emailEl) emailEl.textContent = res.data.email;
                            if (clientIdEl) clientIdEl.textContent = res.data.client_id;
                            if (container) container.classList.remove("hidden");
                            
                            if (errorEl) {
                                errorEl.textContent = "";
                                errorEl.classList.add("hidden");
                            }
                            if (submitBtn) submitBtn.disabled = false;
                        } else {
                            if (container) container.classList.add("hidden");
                            
                            if (errorEl) {
                                if (res.data.matched_different_asset) {
                                    errorEl.textContent = `This is a ${res.data.matched_different_asset} address. Please select ${res.data.matched_different_asset} modal or enter a valid ${activeAsset} address.`;
                                } else {
                                    errorEl.textContent = `Recipient not found. Please verify the Email, Client ID, or Address.`;
                                }
                                errorEl.classList.remove("hidden");
                            }
                            if (submitBtn) submitBtn.disabled = true;
                        }
                    }
                } catch (err) {
                    console.error("Recipient lookup failed:", err);
                    if (container) container.classList.add("hidden");
                }
            }, 350);
        });
    }

    // Tab buttons & contents
    const btnReceive = document.getElementById("txItTabBtnReceive");
    const btnSend = document.getElementById("txItTabBtnSend");
    const contentReceive = document.getElementById("txItTabContentReceive");
    const contentSend = document.getElementById("txItTabContentSend");

    if (btnReceive && btnSend && contentReceive && contentSend) {
        btnReceive.addEventListener("click", () => {
            contentReceive.classList.remove("hidden");
            contentSend.classList.add("hidden");
            btnReceive.className = "flex-1 rounded-xl py-2.5 text-xs font-black transition-all bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
            btnSend.className = "flex-1 rounded-xl py-2.5 text-xs font-black transition-all text-slate-400 hover:text-slate-200";
        });

        btnSend.addEventListener("click", () => {
            contentReceive.classList.add("hidden");
            contentSend.classList.remove("hidden");
            btnSend.className = "flex-1 rounded-xl py-2.5 text-xs font-black transition-all bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
            btnReceive.className = "flex-1 rounded-xl py-2.5 text-xs font-black transition-all text-slate-400 hover:text-slate-200";
        });
    }

    // Copy Address Button
    document.getElementById("txItReceiveCopyBtn")?.addEventListener("click", () => {
        const address = document.getElementById("txItReceiveAddressText")?.textContent;
        if (address && address !== "--" && address !== "No address generated") {
            navigator.clipboard.writeText(address).then(() => {
                showWalletAlert("Address copied to clipboard!", "success");
            }).catch(() => {
                showWalletAlert("Failed to copy address.", "error");
            });
        }
    });

    // Share Button
    document.getElementById("txItReceiveShareBtn")?.addEventListener("click", () => {
        const address = document.getElementById("txItReceiveAddressText")?.textContent;
        if (address && address !== "--" && address !== "No address generated") {
            if (navigator.share) {
                navigator.share({
                    title: 'My Permanent Crypto Address',
                    text: address
                }).catch(err => {
                    console.log("Share cancelled or failed:", err);
                });
            } else {
                navigator.clipboard.writeText(address).then(() => {
                    showWalletAlert("Address copied to clipboard! (Share API unsupported)", "success");
                });
            }
        }
    });

    // Scan QR Button (Camera Scanner)
    document.getElementById("txItScanQrBtn")?.addEventListener("click", () => {
        if (txHtml5QrCode) {
            stopCameraScanner();
        } else {
            startCameraScanner();
        }
    });
}


var txHtml5QrCode = null;

function loadHtml5QrcodeScript() {
    return new Promise((resolve) => {
        if (window.Html5Qrcode) {
            resolve();
            return;
        }
        const script = document.createElement("script");
        script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

async function startCameraScanner() {
    try {
        await loadHtml5QrcodeScript();
        const viewfinder = document.getElementById("txItCameraScannerViewfinder");
        if (!viewfinder) return;
        
        viewfinder.classList.remove("hidden");
        const scanBtn = document.getElementById("txItScanQrBtn");
        if (scanBtn) scanBtn.textContent = "Stop Scan";

        txHtml5QrCode = new Html5Qrcode("txItCameraScannerViewfinder");
        
        const extractRecipientFromDecodedText = (textVal) => {
            const trimmed = textVal.trim();
            if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                try {
                    const url = new URL(trimmed);
                    const rec = url.searchParams.get("recipient");
                    if (rec) return rec;
                } catch (e) {
                    console.error("Failed to parse scanned URL:", e);
                }
            }
            return trimmed;
        };

        const qrCodeSuccessCallback = (decodedText) => {
            const recipientInput = document.getElementById("walletInternalTransferRecipient");
            if (recipientInput) {
                recipientInput.value = extractRecipientFromDecodedText(decodedText);
                recipientInput.dispatchEvent(new Event("input"));
            }
            stopCameraScanner();
            showWalletAlert("QR code scanned successfully!", "success");
        };
        
        const config = { fps: 15, qrbox: { width: 200, height: 200 } };
        
        await txHtml5QrCode.start(
            { facingMode: "environment" },
            config,
            qrCodeSuccessCallback,
            (errorMessage) => {}
        );
    } catch (err) {
        console.error("Camera access failed:", err);
        // Fallback to clipboard paste
        try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) {
                const recipientInput = document.getElementById("walletInternalTransferRecipient");
                if (recipientInput) {
                    recipientInput.value = extractRecipientFromDecodedText(text);
                    recipientInput.dispatchEvent(new Event("input"));
                    showWalletAlert("Clipboard fallback pasted!", "success");
                }
            } else {
                showWalletAlert("Camera error: Please ensure you are on HTTPS and camera permissions are allowed.", "error");
            }
        } catch (clipErr) {
            showWalletAlert("Camera error: Please ensure you are on HTTPS and camera permissions are allowed.", "error");
        }
        stopCameraScanner();
    }
}

function stopCameraScanner() {
    const viewfinder = document.getElementById("txItCameraScannerViewfinder");
    if (viewfinder) viewfinder.classList.add("hidden");
    
    const scanBtn = document.getElementById("txItScanQrBtn");
    if (scanBtn) scanBtn.textContent = "Scan QR";

    if (txHtml5QrCode) {
        txHtml5QrCode.stop().then(() => {
            txHtml5QrCode.clear();
            txHtml5QrCode = null;
        }).catch(err => {
            console.error("Error stopping qr scanner:", err);
            txHtml5QrCode = null;
        });
    }
}

/* ==========================================================================
   TRAIDIUMX / NEXUS DEDICATED DEPOSIT CONTROLLER (PIXEL-PERFECT FROM DESIGN)
   ========================================================================== */

let TX_DEPOSIT_STATE = {
    mode: "crypto", // "crypto" or "money"
    currentStep: 1,
    moneyStep: 1,
    moneyMethod: null,
    moneyAccount: null,
    selectedCoin: null,
    selectedAccount: null,
    selectedAccountName: null,
    selectedNetwork: null,
    cryptoAddresses: {},
    inrDetails: null,
    initialized: false,
    coins: [
        { symbol: "USDT", name: "Tether USD", icon: "₮", color: "emerald", networks: ["TRC20", "BEP20", "ERC20", "SOLANA"], min: "5 USDT" },
        { symbol: "BTC", name: "Bitcoin", icon: "₿", color: "amber", networks: ["BITCOIN", "BEP20"], min: "0.0002 BTC" },
        { symbol: "ETH", name: "Ethereum", icon: "Ξ", color: "cyan", networks: ["ERC20", "ARBITRUM", "BEP20"], min: "0.005 ETH" },
        { symbol: "SOL", name: "Solana", icon: "◎", color: "purple", networks: ["SOLANA"], min: "0.05 SOL" },
        { symbol: "BNB", name: "BNB", icon: "⬡", color: "yellow", networks: ["BEP20"], min: "0.01 BNB" },
        { symbol: "USDC", name: "USD Coin", icon: "$", color: "blue", networks: ["ERC20", "BEP20", "TRC20", "SOLANA"], min: "5 USDC" },
        { symbol: "TRX", name: "TRON", icon: "⯛", color: "red", networks: ["TRC20"], min: "20 TRX" },
        { symbol: "XRP", name: "Ripple", icon: "✕", color: "sky", networks: ["RIPPLE"], min: "10 XRP" },
        { symbol: "DOGE", name: "Dogecoin", icon: "Ð", color: "orange", networks: ["DOGECOIN", "BEP20"], min: "15 DOGE" }
    ]
};

function txSetDepositStep(step) {
    if (step > 1 && !TX_DEPOSIT_STATE.selectedCoin) {
        return; // Guard: Cannot open Step 2 or 3 if currency is not selected!
    }
    if (step > 2 && !TX_DEPOSIT_STATE.selectedAccount) {
        return; // Guard: Cannot open Step 3 if account is not selected!
    }
    TX_DEPOSIT_STATE.currentStep = step;

    const dot1 = document.getElementById("txDepositStep1Dot");
    const dot2 = document.getElementById("txDepositStep2Dot");
    const dot3 = document.getElementById("txDepositStep3Dot");

    const body1 = document.getElementById("txDepositStep1Body");
    const body2 = document.getElementById("txDepositStep2Body");
    const body3 = document.getElementById("txDepositStep3Body");

    const title1 = document.querySelector("#txDepositStep1Header label");
    const title2 = document.querySelector("#txDepositStep2Header label");
    const title3 = document.getElementById("txDepositStep3Title");

    if (step === 1) {
        if (dot1) {
            dot1.className = TX_DEPOSIT_STATE.selectedCoin ? "tx-nexus-step-dot completed" : "tx-nexus-step-dot active";
            dot1.textContent = TX_DEPOSIT_STATE.selectedCoin ? "✓" : "1";
        }
        if (body1) body1.classList.remove("hidden");
        if (title1) title1.className = "block text-sm font-bold text-white cursor-pointer";

        if (dot2) {
            dot2.className = TX_DEPOSIT_STATE.selectedAccount ? "tx-nexus-step-dot completed" : "tx-nexus-step-dot inactive";
            dot2.textContent = TX_DEPOSIT_STATE.selectedAccount ? "✓" : "2";
        }
        if (body2) body2.classList.add("hidden");
        if (title2) title2.className = TX_DEPOSIT_STATE.selectedCoin ? "text-sm font-bold text-slate-400 flex items-center gap-1.5 cursor-pointer" : "text-sm font-bold text-slate-500 flex items-center gap-1.5 cursor-not-allowed opacity-60";

        if (dot3) {
            dot3.className = "tx-nexus-step-dot inactive";
            dot3.textContent = "3";
        }
        if (body3) body3.classList.add("hidden");
        if (title3) {
            title3.textContent = "Deposit details";
            title3.className = "text-sm font-bold text-slate-500 flex items-center gap-1.5 cursor-not-allowed opacity-60";
        }
    } else if (step === 2) {
        if (dot1) {
            dot1.className = "tx-nexus-step-dot completed";
            dot1.textContent = "✓";
        }
        if (body1) body1.classList.remove("hidden");
        if (title1) title1.className = "block text-sm font-bold text-white cursor-pointer";

        if (dot2) {
            dot2.className = TX_DEPOSIT_STATE.selectedAccount ? "tx-nexus-step-dot completed" : "tx-nexus-step-dot active";
            dot2.textContent = TX_DEPOSIT_STATE.selectedAccount ? "✓" : "2";
        }
        if (body2) body2.classList.remove("hidden");
        if (title2) title2.className = "text-sm font-bold text-white flex items-center gap-1.5 cursor-pointer";

        if (dot3) {
            dot3.className = "tx-nexus-step-dot inactive";
            dot3.textContent = "3";
        }
        if (body3) body3.classList.add("hidden");
        if (title3) {
            title3.textContent = "Deposit details";
            title3.className = TX_DEPOSIT_STATE.selectedAccount ? "text-sm font-bold text-slate-400 flex items-center gap-1.5 cursor-pointer" : "text-sm font-bold text-slate-500 flex items-center gap-1.5 cursor-not-allowed opacity-60";
        }
    } else if (step >= 3) {
        if (dot1) {
            dot1.className = "tx-nexus-step-dot completed";
            dot1.textContent = "✓";
        }
        if (body1) body1.classList.remove("hidden");
        if (title1) title1.className = "block text-sm font-bold text-white cursor-pointer";

        if (dot2) {
            dot2.className = "tx-nexus-step-dot completed";
            dot2.textContent = "✓";
        }
        if (body2) body2.classList.remove("hidden");
        if (title2) title2.className = "text-sm font-bold text-white flex items-center gap-1.5 cursor-pointer";

        if (dot3) {
            dot3.className = "tx-nexus-step-dot active";
            dot3.textContent = "3";
        }
        if (body3) body3.classList.remove("hidden");
        if (title3) {
            title3.textContent = `Deposit to ${TX_DEPOSIT_STATE.selectedCoin || "USDT"}`;
            title3.className = "text-sm font-bold text-white flex items-center gap-1.5 cursor-pointer";
        }

        const activeContent = document.getElementById("txDepositActiveContent");
        if (activeContent) activeContent.classList.remove("hidden");
        const kycNotice = document.getElementById("txDepositKycNoticeCard");
        if (kycNotice) kycNotice.classList.add("hidden");

        txUpdateDepositAddressDisplay();
    }
}

function txSetMoneyDepositStep(step) {
    if (step > 1 && !TX_DEPOSIT_STATE.moneyAccount) {
        return; // Guard: Cannot jump to Step 2/3 without selecting account!
    }
    if (step > 2 && !TX_DEPOSIT_STATE.moneyMethod) {
        return; // Guard: Cannot jump to Step 3 without selecting payment method!
    }
    TX_DEPOSIT_STATE.moneyStep = step;

    const dot1 = document.getElementById("txMoneyStep1Dot");
    const dot2 = document.getElementById("txMoneyStep2Dot");
    const dot3 = document.getElementById("txMoneyStep3Dot");

    const label1 = document.getElementById("txMoneyStep1Label");
    const label2 = document.getElementById("txMoneyStep2Label");
    const label3 = document.getElementById("txMoneyStep3Label");

    const body1 = document.getElementById("txMoneyStep1Body");
    const body2 = document.getElementById("txMoneyStep2Body");
    const body3 = document.getElementById("txMoneyStep3Body");

    if (step === 1) {
        if (dot1) {
            dot1.className = TX_DEPOSIT_STATE.moneyAccount ? "tx-nexus-step-dot completed" : "tx-nexus-step-dot active";
            dot1.textContent = TX_DEPOSIT_STATE.moneyAccount ? "✓" : "1";
        }
        if (dot2) {
            dot2.className = "tx-nexus-step-dot inactive";
            dot2.textContent = "2";
        }
        if (dot3) {
            dot3.className = "tx-nexus-step-dot inactive";
            dot3.textContent = "3";
        }
        if (label1) label1.className = "text-sm font-bold text-white flex items-center gap-1.5 cursor-pointer";
        if (label2) label2.className = TX_DEPOSIT_STATE.moneyAccount ? "text-sm font-bold text-slate-400 block cursor-pointer" : "text-sm font-bold text-slate-500 block cursor-not-allowed opacity-60";
        if (label3) label3.className = "text-sm font-bold text-slate-500 flex items-center gap-1.5 cursor-not-allowed opacity-60";

        if (body1) body1.classList.remove("hidden");
        if (body2) body2.classList.add("hidden");
        if (body3) body3.classList.add("hidden");
    } else if (step === 2) {
        if (dot1) {
            dot1.className = "tx-nexus-step-dot completed";
            dot1.textContent = "✓";
        }
        if (dot2) {
            dot2.className = TX_DEPOSIT_STATE.moneyMethod ? "tx-nexus-step-dot completed" : "tx-nexus-step-dot active";
            dot2.textContent = TX_DEPOSIT_STATE.moneyMethod ? "✓" : "2";
        }
        if (dot3) {
            dot3.className = "tx-nexus-step-dot inactive";
            dot3.textContent = "3";
        }
        if (label1) label1.className = "text-sm font-bold text-white flex items-center gap-1.5 cursor-pointer";
        if (label2) label2.className = "text-sm font-bold text-white block cursor-pointer";
        if (label3) label3.className = TX_DEPOSIT_STATE.moneyMethod ? "text-sm font-bold text-slate-400 flex items-center gap-1.5 cursor-pointer" : "text-sm font-bold text-slate-500 flex items-center gap-1.5 cursor-not-allowed opacity-60";

        if (body1) body1.classList.remove("hidden");
        if (body2) body2.classList.remove("hidden");
        if (body3) body3.classList.add("hidden");
    } else if (step >= 3) {
        if (dot1) {
            dot1.className = "tx-nexus-step-dot completed";
            dot1.textContent = "✓";
        }
        if (dot2) {
            dot2.className = "tx-nexus-step-dot completed";
            dot2.textContent = "✓";
        }
        if (dot3) {
            dot3.className = "tx-nexus-step-dot active";
            dot3.textContent = "3";
        }
        if (label1) label1.className = "text-sm font-bold text-white flex items-center gap-1.5 cursor-pointer";
        if (label2) label2.className = "text-sm font-bold text-white block cursor-pointer";
        if (label3) label3.className = "text-sm font-bold text-white flex items-center gap-1.5 cursor-pointer";

        if (body1) body1.classList.remove("hidden");
        if (body2) body2.classList.remove("hidden");
        if (body3) body3.classList.remove("hidden");

        const amountInput = document.getElementById("txMoneyDepositAmountInput");
        if (amountInput) {
            setTimeout(() => {
                amountInput.focus();
            }, 100);
        }
    }
}

function txInitDepositView() {
    if (TX_DEPOSIT_STATE.initialized) {
        txRefreshDepositUI();
        return;
    }
    TX_DEPOSIT_STATE.initialized = true;

    // Toggle Buttons (Crypto / Money)
    const toggleCrypto = document.getElementById("txDepositToggleCrypto");
    const toggleMoney = document.getElementById("txDepositToggleMoney");

    if (toggleCrypto) {
        toggleCrypto.onclick = () => txSwitchDepositMode("crypto");
    }
    if (toggleMoney) {
        toggleMoney.onclick = () => txSwitchDepositMode("money");
    }

    // Crypto Currency Dropdown
    const dropdownBtn = document.getElementById("txDepositCurrencyDropdownBtn");
    const dropdownMenu = document.getElementById("txDepositCurrencyDropdownMenu");
    const searchInput = document.getElementById("txDepositCurrencySearchInput");
    const chevron = document.getElementById("txDepositCurrencyChevron");

    if (dropdownBtn && dropdownMenu) {
        dropdownBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = dropdownMenu.classList.contains("hidden");
            dropdownMenu.classList.toggle("hidden", !isHidden);
            if (chevron) chevron.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
            if (isHidden && searchInput) {
                setTimeout(() => searchInput.focus(), 50);
            }
        };

        document.addEventListener("click", (e) => {
            if (!dropdownMenu.contains(e.target) && !dropdownBtn.contains(e.target)) {
                dropdownMenu.classList.add("hidden");
                if (chevron) chevron.style.transform = "rotate(0deg)";
            }
        });
    }

    if (searchInput) {
        searchInput.oninput = () => {
            txRenderDepositCurrencyList(searchInput.value.trim());
        };
    }

    // Crypto Step 2 Account Selector Dropdown
    const accBtn = document.getElementById("txDepositAccountSelectBtn");
    const accMenu = document.getElementById("txDepositAccountDropdownMenu");
    const accChevron = document.getElementById("txDepositAccountChevron");

    if (accBtn && accMenu) {
        accBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = accMenu.classList.contains("hidden");
            accMenu.classList.toggle("hidden", !isHidden);
            if (accChevron) accChevron.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
        };

        document.addEventListener("click", (e) => {
            if (!accMenu.contains(e.target) && !accBtn.contains(e.target)) {
                accMenu.classList.add("hidden");
                if (accChevron) accChevron.style.transform = "rotate(0deg)";
            }
        });
    }

    // Money Step 1 Account Selector Dropdown
    const moneyAccBtn = document.getElementById("txMoneyAccountSelectBtn");
    const moneyAccMenu = document.getElementById("txMoneyAccountDropdownMenu");
    const moneyAccChevron = document.getElementById("txMoneyAccountChevron");

    if (moneyAccBtn && moneyAccMenu) {
        moneyAccBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = moneyAccMenu.classList.contains("hidden");
            moneyAccMenu.classList.toggle("hidden", !isHidden);
            if (moneyAccChevron) moneyAccChevron.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
        };

        document.addEventListener("click", (e) => {
            if (!moneyAccMenu.contains(e.target) && !moneyAccBtn.contains(e.target)) {
                moneyAccMenu.classList.add("hidden");
                if (moneyAccChevron) moneyAccChevron.style.transform = "rotate(0deg)";
            }
        });
    }

    // Money Step 2 Payment Method Selector Dropdown
    const moneyMethodBtn = document.getElementById("txMoneyMethodSelectBtn");
    const moneyMethodMenu = document.getElementById("txMoneyMethodDropdownMenu");
    const moneyMethodChevron = document.getElementById("txMoneyMethodChevron");

    if (moneyMethodBtn && moneyMethodMenu) {
        moneyMethodBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = moneyMethodMenu.classList.contains("hidden");
            moneyMethodMenu.classList.toggle("hidden", !isHidden);
            if (moneyMethodChevron) moneyMethodChevron.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
        };

        document.addEventListener("click", (e) => {
            if (!moneyMethodMenu.contains(e.target) && !moneyMethodBtn.contains(e.target)) {
                moneyMethodMenu.classList.add("hidden");
                if (moneyMethodChevron) moneyMethodChevron.style.transform = "rotate(0deg)";
            }
        });
    }

    // Copy Address Button
    const copyAddressBtn = document.getElementById("txDepositCopyAddressBtn");
    if (copyAddressBtn) {
        copyAddressBtn.onclick = () => {
            const addr = document.getElementById("txDepositAddressText")?.textContent || "";
            if (addr && !addr.includes("Loading")) {
                navigator.clipboard.writeText(addr).then(() => {
                    const originalText = copyAddressBtn.textContent;
                    copyAddressBtn.textContent = "Copied! ✓";
                    copyAddressBtn.classList.add("bg-emerald-400", "text-slate-950");
                    setTimeout(() => {
                        copyAddressBtn.textContent = originalText;
                        copyAddressBtn.classList.remove("bg-emerald-400");
                    }, 2000);
                });
            }
        };
    }

    // Crypto Deposit Form Submit
    const depositForm = document.getElementById("txDepositForm");
    if (depositForm) {
        depositForm.onsubmit = txHandleDepositFormSubmit;
    }

    // Money Deposit Form Submit
    const moneyDepositForm = document.getElementById("txMoneyDepositForm");
    if (moneyDepositForm) {
        moneyDepositForm.onsubmit = txHandleMoneyDepositFormSubmit;
    }

    // Initial load
    txRenderDepositCurrencyList();
    txRenderDepositAccountOptions();
    txRenderMoneyAccountOptions();
    txFetchSubAccountsForDeposit();
    txFetchCryptoAddresses();
    txFetchInrDetails();
    txSelectDepositCoin(null, false);
    txSetDepositStep(1);
    txSetMoneyDepositStep(1);
}

function txSwitchDepositMode(mode = "crypto") {
    TX_DEPOSIT_STATE.mode = mode;

    const titleEl = document.getElementById("txDepositCardTitle");
    const toggleCrypto = document.getElementById("txDepositToggleCrypto");
    const toggleMoney = document.getElementById("txDepositToggleMoney");
    const cryptoStepper = document.getElementById("txDepositCryptoStepper");
    const moneyStepper = document.getElementById("txDepositMoneyStepper");

    if (mode === "money") {
        if (titleEl) titleEl.textContent = "Deposit money";
        if (toggleMoney) {
            toggleMoney.className = "active";
        }
        if (toggleCrypto) {
            toggleCrypto.className = "";
        }
        if (cryptoStepper) cryptoStepper.classList.add("hidden");
        if (moneyStepper) moneyStepper.classList.remove("hidden");

        txRenderMoneyAccountOptions();
        txCheckUserKycForDeposit();
        txSetMoneyDepositStep(2);
    } else {
        if (titleEl) titleEl.textContent = "Deposit crypto";
        if (toggleCrypto) {
            toggleCrypto.className = "active";
        }
        if (toggleMoney) {
            toggleMoney.className = "";
        }
        if (cryptoStepper) cryptoStepper.classList.remove("hidden");
        if (moneyStepper) moneyStepper.classList.add("hidden");

        txRefreshDepositUI();
    }
}

function txRenderDepositCurrencyList(filterText = "") {
    const listContainer = document.getElementById("txDepositCurrencyList");
    if (!listContainer) return;

    const query = filterText.toLowerCase();
    const filtered = TX_DEPOSIT_STATE.coins.filter(c => {
        return c.symbol.toLowerCase().includes(query) || c.name.toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div class="p-3 text-center text-xs text-slate-500 font-medium">No currencies found</div>`;
        return;
    }

    listContainer.innerHTML = filtered.map(c => `
        <button type="button" onclick="txSelectDepositCoin('${c.symbol}', true)" class="tx-nexus-coin-row ${c.symbol === TX_DEPOSIT_STATE.selectedCoin ? 'selected' : ''}">
            <div class="flex items-center gap-3">
                <span class="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shrink-0" style="background: rgba(34, 211, 238, 0.15); color: #22d3ee; border: 1px solid rgba(34, 211, 238, 0.3);">${c.icon}</span>
                <div>
                    <span class="text-xs font-bold text-white block leading-tight">${c.symbol}</span>
                    <span class="text-[11px] text-slate-400 block leading-tight mt-0.5">${c.name}</span>
                </div>
            </div>
            ${c.symbol === TX_DEPOSIT_STATE.selectedCoin ? '<span class="text-cyan-400 text-xs font-black">✓</span>' : ''}
        </button>
    `).join("");
}

function txSelectDepositCoin(symbol, advanceStep = true) {
    if (!symbol) {
        TX_DEPOSIT_STATE.selectedCoin = null;
        TX_DEPOSIT_STATE.selectedNetwork = null;
        const logoEl = document.getElementById("txDepositSelectedCoinLogo");
        const nameEl = document.getElementById("txDepositSelectedCoinName");
        const menuEl = document.getElementById("txDepositCurrencyDropdownMenu");
        const chevronEl = document.getElementById("txDepositCurrencyChevron");

        if (logoEl) logoEl.classList.add("hidden");
        if (nameEl) nameEl.innerHTML = `<span class="text-sm text-slate-400 font-normal">Select currency</span>`;
        if (menuEl) menuEl.classList.add("hidden");
        if (chevronEl) chevronEl.style.transform = "rotate(0deg)";

        txSetDepositStep(1);
        txRenderDepositCurrencyList();
        return;
    }

    const coin = TX_DEPOSIT_STATE.coins.find(c => c.symbol === symbol) || TX_DEPOSIT_STATE.coins[0];
    TX_DEPOSIT_STATE.selectedCoin = coin.symbol;
    TX_DEPOSIT_STATE.selectedNetwork = coin.networks[0] || "TRC20";

    const logoEl = document.getElementById("txDepositSelectedCoinLogo");
    const nameEl = document.getElementById("txDepositSelectedCoinName");
    const menuEl = document.getElementById("txDepositCurrencyDropdownMenu");
    const chevronEl = document.getElementById("txDepositCurrencyChevron");

    if (logoEl) {
        logoEl.classList.remove("hidden");
        logoEl.textContent = coin.icon;
        logoEl.className = `w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shrink-0`;
        logoEl.style.background = "rgba(34, 211, 238, 0.15)";
        logoEl.style.color = "#22d3ee";
        logoEl.style.border = "1px solid rgba(34, 211, 238, 0.3)";
    }
    if (nameEl) {
        nameEl.innerHTML = `<span class="text-sm font-bold text-white">${coin.symbol}</span> <span class="text-slate-400 font-normal text-xs ml-1">${coin.name}</span>`;
    }
    if (menuEl) menuEl.classList.add("hidden");
    if (chevronEl) chevronEl.style.transform = "rotate(0deg)";

    const currencyLabel = document.getElementById("txDepositAmountCurrencyLabel");
    if (currencyLabel) currencyLabel.textContent = coin.symbol;

    const minLimitEl = document.getElementById("txDepositMinLimit");
    const amountInput = document.getElementById("txDepositAmountInput");
    const minVal = (coin.symbol === "USDT" || coin.symbol === "USDC")
        ? (TX_DEPOSIT_STATE.minAmount || 10)
        : (coin.min ? parseFloat(coin.min) : 5);

    if (minLimitEl) minLimitEl.textContent = `${minVal} ${coin.symbol}`;
    if (amountInput) {
        amountInput.min = String(minVal);
        amountInput.placeholder = `Min ${minVal}`;
    }

    txCheckUserKycForDeposit();
    txRenderNetworkPills(coin.networks);
    txRenderDepositAccountOptions();
    txUpdateDepositAddressDisplay();
    txRenderDepositCurrencyList();

    if (advanceStep) {
        if (TX_DEPOSIT_STATE.selectedAccount) {
            txSetDepositStep(3);
        } else {
            txSetDepositStep(2);
        }
    }
}

function txCheckUserKycForDeposit() {
    const kycNotice = document.getElementById("txDepositKycNoticeCard");
    const activeContent = document.getElementById("txDepositActiveContent");
    const step3Title = document.getElementById("txDepositStep3Title");

    const moneyVerifyCard = document.getElementById("txMoneyVerifyCard");
    const moneyVerifiedContent = document.getElementById("txMoneyVerifiedContent");

    if (kycNotice) kycNotice.classList.add("hidden");
    if (activeContent) activeContent.classList.remove("hidden");
    if (step3Title) step3Title.textContent = `Deposit to ${TX_DEPOSIT_STATE.selectedCoin || "USDT"}`;

    if (moneyVerifyCard) moneyVerifyCard.classList.add("hidden");
    if (moneyVerifiedContent) moneyVerifiedContent.classList.remove("hidden");
}

async function txFetchSubAccountsForDeposit() {
    try {
        if (typeof apiRequest !== "function") return;
        const resp = await apiRequest("/user/sub-accounts");
        if (resp && (resp.data || Array.isArray(resp))) {
            const list = Array.isArray(resp) ? resp : (resp.data || []);
            TX_DEPOSIT_STATE.subAccounts = list;
            if (WALLET_STATE) {
                WALLET_STATE.sub_accounts = list;
            }
            txRenderDepositAccountOptions();
            txRenderMoneyAccountOptions();
        }
    } catch (e) {
        console.warn("Could not fetch sub accounts for deposit:", e);
    }
}

function txRenderDepositAccountOptions() {
    const listContainer = document.getElementById("txDepositAccountOptionsList");
    const destBalEl = document.getElementById("txDepositDestBalance");
    const selectedAccNameEl = document.getElementById("txDepositSelectedAccountName");

    const currentCoin = TX_DEPOSIT_STATE.selectedCoin || "USDT";
    const wallet = WALLET_STATE?.wallet || {};

    let mainCoinBal = 0;
    if (currentCoin === "USDT") {
        const rawUsdt = wallet.main_wallet_usdt?.available_balance ?? wallet.main_wallet?.available_balance ?? wallet.main_wallet_usdt ?? wallet.available_balance ?? wallet.total_balance ?? 0;
        mainCoinBal = typeof rawUsdt === "number" ? rawUsdt : (parseFloat(String(rawUsdt).replace(/[^0-9.-]/g, "")) || 0);
    } else {
        const coinKey = "main_wallet_" + currentCoin.toLowerCase();
        const rawCoin = wallet[coinKey]?.available_balance ?? wallet[coinKey] ?? (WALLET_STATE?.crypto_balances?.find(c => c.currency === currentCoin || c.symbol === currentCoin)?.balance) ?? 0;
        mainCoinBal = typeof rawCoin === "number" ? rawCoin : (parseFloat(String(rawCoin).replace(/[^0-9.-]/g, "")) || 0);
    }

    const decimals = (currentCoin === "USDT" || currentCoin === "USDC") ? 2 : 4;
    const formattedBal = `${mainCoinBal.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${currentCoin}`;

    let activeAccountName = "Select destination account";
    let isSelected = false;
    const subList = TX_DEPOSIT_STATE.subAccounts || WALLET_STATE?.sub_accounts || [];
    const authUser = typeof getAuthUser === "function" ? getAuthUser() : null;

    const filteredSubs = subList.filter(sub => {
        const isDemo = sub.is_demo || sub.account_mode === "demo" || sub.plan === "demo" || 
                       String(sub.name || "").toLowerCase().includes("demo") || 
                       String(sub.account_name || "").toLowerCase().includes("demo");
        if (isDemo) return false;

        if (authUser) {
            const userName = (authUser.full_name || authUser.name || "").trim().toLowerCase();
            const sName = (sub.name || sub.account_name || "").trim().toLowerCase();
            if (userName && sName === userName && (sub.role === "parent" || sub.role === "user" || sub.is_parent)) {
                return false;
            }
        }
        return true;
    });

    if (!TX_DEPOSIT_STATE.selectedAccount) {
        activeAccountName = "Select destination account";
        isSelected = false;
    } else if (TX_DEPOSIT_STATE.selectedAccount === "main") {
        activeAccountName = "Wallet";
        isSelected = true;
    } else {
        const foundSub = filteredSubs.find(s => (s.id || s.user_id || s._id) === TX_DEPOSIT_STATE.selectedAccount);
        if (foundSub) {
            activeAccountName = foundSub.name || foundSub.account_name || "Trading Account";
            isSelected = true;
        } else {
            activeAccountName = "Wallet";
            TX_DEPOSIT_STATE.selectedAccount = "main";
            TX_DEPOSIT_STATE.selectedAccountName = "Wallet";
            isSelected = true;
        }
    }

    if (destBalEl) destBalEl.textContent = "";
    if (selectedAccNameEl) {
        selectedAccNameEl.textContent = activeAccountName;
        selectedAccNameEl.className = isSelected ? "text-sm font-bold text-white" : "text-sm text-slate-400 font-normal";
    }

    if (!listContainer) return;

    let html = "";
    const isMainSel = TX_DEPOSIT_STATE.selectedAccount === "main";
    html += `
        <button type="button" onclick="txSelectDepositDestination('main', 'Wallet')" class="tx-nexus-coin-row ${isMainSel ? 'selected' : ''}">
            <div class="space-y-0.5 text-left">
                <span class="text-xs font-bold text-white block">Wallet</span>
                <span class="text-[11px] text-slate-400 block">Main funding wallet (${formattedBal})</span>
            </div>
            <div class="shrink-0">
                ${isMainSel ? '<span class="w-4 h-4 rounded-full border-2 border-cyan-400 flex items-center justify-center"><span class="w-2 h-2 rounded-full bg-cyan-400"></span></span>' : '<span class="w-4 h-4 rounded-full border border-slate-600 block"></span>'}
            </div>
        </button>
    `;

    if (filteredSubs.length > 0) {
        filteredSubs.forEach((sub) => {
            const subId = sub.id || sub.user_id || sub._id;
            const subName = sub.name || sub.account_name || `Trading Account (${sub.client_id || subId})`;
            const isSel = TX_DEPOSIT_STATE.selectedAccount === subId;
            const rawSubBal = sub.wallet?.trading_wallet_usdt?.available_balance ?? sub.wallet?.available_balance ?? sub.balance ?? sub.balance_usd ?? 0;
            const subBal = typeof rawSubBal === "number" ? rawSubBal : (parseFloat(String(rawSubBal).replace(/[^0-9.-]/g, "")) || 0);

            html += `
                <button type="button" onclick="txSelectDepositDestination('${subId}', '${subName}')" class="tx-nexus-coin-row ${isSel ? 'selected' : ''}">
                    <div class="space-y-0.5 text-left">
                        <span class="text-xs font-bold text-white block">${subName}</span>
                        <span class="text-[11px] text-slate-400 block">Futures margin account (${subBal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT)</span>
                    </div>
                    <div class="shrink-0">
                        ${isSel ? '<span class="w-4 h-4 rounded-full border-2 border-cyan-400 flex items-center justify-center"><span class="w-2 h-2 rounded-full bg-cyan-400"></span></span>' : '<span class="w-4 h-4 rounded-full border border-slate-600 block"></span>'}
                    </div>
                </button>
            `;
        });
    }

    listContainer.innerHTML = html;
}

function txSelectDepositDestination(accountId, accountName) {
    TX_DEPOSIT_STATE.selectedAccount = accountId;
    TX_DEPOSIT_STATE.selectedAccountName = accountName;

    const nameEl = document.getElementById("txDepositSelectedAccountName");
    if (nameEl) {
        nameEl.textContent = accountName;
        nameEl.className = "text-sm font-bold text-white";
    }

    const menuEl = document.getElementById("txDepositAccountDropdownMenu");
    const chevronEl = document.getElementById("txDepositAccountChevron");
    if (menuEl) menuEl.classList.add("hidden");
    if (chevronEl) chevronEl.style.transform = "rotate(0deg)";

    txRenderDepositAccountOptions();
    txSetDepositStep(3); // CRITICAL: Advance directly to Step 3!
}

function txRenderMoneyAccountOptions() {
    const listContainer = document.getElementById("txMoneyAccountOptionsList");
    const destBalEl = document.getElementById("txMoneyDestBalance");
    const selectedAccNameEl = document.getElementById("txMoneySelectedAccountName");

    const wallet = WALLET_STATE?.wallet || {};
    const rawMainInr = wallet.main_wallet_inr?.available_balance ?? wallet.main_wallet_inr ?? 0;
    const mainInrBal = typeof rawMainInr === "number" ? rawMainInr : (parseFloat(String(rawMainInr).replace(/[^0-9.-]/g, "")) || 0);
    const formattedInrBal = `₹${mainInrBal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`;

    const subList = TX_DEPOSIT_STATE.subAccounts || WALLET_STATE?.sub_accounts || [];
    const authUser = typeof getAuthUser === "function" ? getAuthUser() : null;

    const filteredSubs = subList.filter(sub => {
        const isDemo = sub.is_demo || sub.account_mode === "demo" || sub.plan === "demo" || 
                       String(sub.name || "").toLowerCase().includes("demo") || 
                       String(sub.account_name || "").toLowerCase().includes("demo");
        if (isDemo) return false;

        if (authUser) {
            const userName = (authUser.full_name || authUser.name || "").trim().toLowerCase();
            const sName = (sub.name || sub.account_name || "").trim().toLowerCase();
            if (userName && sName === userName && (sub.role === "parent" || sub.role === "user" || sub.is_parent)) {
                return false;
            }
        }
        return true;
    });

    let displayAccountName = "Wallet";

    if (TX_DEPOSIT_STATE.moneyAccount === "main" || !TX_DEPOSIT_STATE.moneyAccount) {
        displayAccountName = "Wallet";
    } else {
        const foundSub = filteredSubs.find(s => (s.id || s.user_id || s._id) === TX_DEPOSIT_STATE.moneyAccount);
        if (foundSub) {
            displayAccountName = foundSub.name || foundSub.account_name || "Trading Account";
        } else {
            displayAccountName = "Wallet";
            TX_DEPOSIT_STATE.moneyAccount = "main";
            TX_DEPOSIT_STATE.moneyAccountName = "Wallet";
        }
    }

    if (selectedAccNameEl) selectedAccNameEl.textContent = displayAccountName;
    if (destBalEl) destBalEl.textContent = "";

    if (!listContainer) return;

    const isMainSel = !TX_DEPOSIT_STATE.moneyAccount || TX_DEPOSIT_STATE.moneyAccount === "main";
    let html = `
        <button type="button" onclick="txSelectMoneyAccount('main', 'Wallet')" class="tx-nexus-coin-row ${isMainSel ? 'selected' : ''}">
            <div class="space-y-0.5 text-left">
                <span class="text-xs font-bold text-white block">Wallet</span>
                <span class="text-[11px] text-slate-400 block">Main funding wallet (${formattedInrBal})</span>
            </div>
            <div class="shrink-0">
                ${isMainSel ? '<span class="w-4 h-4 rounded-full border-2 border-cyan-400 flex items-center justify-center"><span class="w-2 h-2 rounded-full bg-cyan-400"></span></span>' : '<span class="w-4 h-4 rounded-full border border-slate-600 block"></span>'}
            </div>
        </button>
    `;

    filteredSubs.forEach((sub) => {
        const subId = sub.id || sub.user_id || sub._id;
        const subName = sub.name || sub.account_name || "Trading Account";
        const isSel = TX_DEPOSIT_STATE.moneyAccount === subId;
        const rawSubInr = sub.wallet?.trading_wallet_inr?.available_balance ?? 0;
        const subInr = typeof rawSubInr === "number" ? rawSubInr : (parseFloat(String(rawSubInr).replace(/[^0-9.-]/g, "")) || 0);

        html += `
            <button type="button" onclick="txSelectMoneyAccount('${subId}', '${subName}')" class="tx-nexus-coin-row ${isSel ? 'selected' : ''}">
                <div class="space-y-0.5 text-left">
                    <span class="text-xs font-bold text-white block">${subName}</span>
                    <span class="text-[11px] text-slate-400 block">Futures margin account (₹${subInr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                </div>
                <div class="shrink-0">
                    ${isSel ? '<span class="w-4 h-4 rounded-full border-2 border-cyan-400 flex items-center justify-center"><span class="w-2 h-2 rounded-full bg-cyan-400"></span></span>' : '<span class="w-4 h-4 rounded-full border border-slate-600 block"></span>'}
                </div>
            </button>
        `;
    });

    listContainer.innerHTML = html;
}

function txSelectMoneyAccount(accountId, accountName) {
    TX_DEPOSIT_STATE.moneyAccount = accountId;
    TX_DEPOSIT_STATE.moneyAccountName = accountName;

    const menuEl = document.getElementById("txMoneyAccountDropdownMenu");
    const chevronEl = document.getElementById("txMoneyAccountChevron");
    if (menuEl) menuEl.classList.add("hidden");
    if (chevronEl) chevronEl.style.transform = "rotate(0deg)";

    txRenderMoneyAccountOptions();
    txSetMoneyDepositStep(2);
}

function txSelectMoneyPaymentMethod(key = "razorpay", name = "Razorpay (Instant UPI, Cards & Netbanking)") {
    TX_DEPOSIT_STATE.moneyMethod = key;

    const displayContainer = document.getElementById("txMoneySelectedMethodDisplay");
    const titleEl = document.getElementById("txMoneySelectedMethodTitle");
    const menuEl = document.getElementById("txMoneyMethodDropdownMenu");
    const chevronEl = document.getElementById("txMoneyMethodChevron");
    const rzpNotice = document.getElementById("txMoneyRazorpayNotice");
    const manualBox = document.getElementById("txMoneyManualDetailsBox");
    const utrContainer = document.getElementById("txMoneyUtrContainer");
    const utrInput = document.getElementById("txMoneyDepositUtrInput");
    const submitBtnText = document.getElementById("txMoneySubmitBtnText");

    let iconHtml = `<div class="w-6 h-6 rounded-full bg-[#0c2340] border border-blue-400/30 flex items-center justify-center font-bold text-xs text-blue-400 shrink-0 shadow-sm">⚡</div>`;
    if (key === "phonepe") {
        iconHtml = `<div class="w-6 h-6 rounded-full bg-[#5f259f] flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-sm">પે</div>`;
    } else if (key === "gpay") {
        iconHtml = `<div class="w-6 h-6 rounded-full bg-white flex items-center justify-center font-bold text-xs text-slate-900 shrink-0 shadow-sm">G</div>`;
    } else if (key === "upi") {
        iconHtml = `<div class="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-400/30 flex items-center justify-center font-bold text-xs shrink-0">UPI</div>`;
    } else if (key === "bank") {
        iconHtml = `<div class="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 flex items-center justify-center font-bold text-xs shrink-0">🏦</div>`;
    }

    if (displayContainer) {
        displayContainer.innerHTML = `
            ${iconHtml}
            <span id="txMoneySelectedMethodName" class="text-sm font-bold text-white">${name}</span>
        `;
    }
    if (titleEl) {
        titleEl.textContent = `${name} Payment Details`;
    }

    // Toggle Razorpay automated vs Manual UTR input
    if (key === "razorpay") {
        if (rzpNotice) rzpNotice.classList.remove("hidden");
        if (manualBox) manualBox.classList.add("hidden");
        if (utrContainer) utrContainer.classList.add("hidden");
        if (utrInput) utrInput.removeAttribute("required");
        if (submitBtnText) submitBtnText.textContent = "Proceed to Pay with Razorpay ⚡";
    } else {
        if (rzpNotice) rzpNotice.classList.add("hidden");
        if (manualBox) manualBox.classList.remove("hidden");
        if (utrContainer) utrContainer.classList.remove("hidden");
        if (utrInput) utrInput.setAttribute("required", "required");
        if (submitBtnText) submitBtnText.textContent = "Submit Deposit Verification";
    }

    if (menuEl) {
        menuEl.classList.add("hidden");
        // Update selected state in menu items
        menuEl.querySelectorAll(".tx-nexus-coin-row").forEach(row => {
            row.classList.remove("selected");
            const check = row.querySelector(".text-cyan-400");
            if (check) check.remove();
        });
        const activeBtn = menuEl.querySelector(`button[onclick*="'${key}'"]`);
        if (activeBtn) {
            activeBtn.classList.add("selected");
            const checkSpan = document.createElement("span");
            checkSpan.className = "text-cyan-400 text-xs font-black";
            checkSpan.textContent = "✓";
            activeBtn.appendChild(checkSpan);
        }
    }
    if (chevronEl) chevronEl.style.transform = "rotate(0deg)";
    txSetMoneyDepositStep(3);
}

function txCopyMoneyUpi() {
    const upiId = document.getElementById("txMoneyUpiIdDisplay")?.textContent || "traidiumx@upi";
    navigator.clipboard.writeText(upiId).then(() => {
        if (typeof showToast === "function") showToast("UPI ID Copied to clipboard!", "success");
    });
}

function txRenderNetworkPills(networks = []) {
    const pillsContainer = document.getElementById("txDepositNetworkPills");
    if (!pillsContainer) return;

    pillsContainer.innerHTML = networks.map(net => `
        <button type="button" data-network="${net}" onclick="txSelectDepositNetwork('${net}')" class="tx-dep-net-pill ${net === TX_DEPOSIT_STATE.selectedNetwork ? 'active px-3.5 py-1.5 rounded-xl text-xs font-bold border border-cyan-400 bg-cyan-400/10 text-cyan-300' : 'px-3.5 py-1.5 rounded-xl text-xs font-bold border border-white/10 bg-[#181e2b] text-slate-300 hover:border-white/20 hover:text-white transition cursor-pointer'}">
            ${net}
        </button>
    `).join("");
}

function txSelectDepositNetwork(network) {
    TX_DEPOSIT_STATE.selectedNetwork = network;
    const coin = TX_DEPOSIT_STATE.coins.find(c => c.symbol === TX_DEPOSIT_STATE.selectedCoin);
    if (coin) {
        txRenderNetworkPills(coin.networks);
    }
    txUpdateDepositAddressDisplay();
}

async function txFetchCryptoAddresses() {
    try {
        if (typeof apiRequest === "function") {
            const resp = await apiRequest("/deposit/crypto-addresses");
            if (resp && resp.data) {
                const addrs = {};
                if (Array.isArray(resp.data.networks)) {
                    resp.data.networks.forEach(n => {
                        if (n.network && n.address) {
                            addrs[n.network] = n.address;
                            addrs[`${n.asset}_${n.network}`] = n.address;
                            addrs[`USDT_${n.network}`] = n.address;
                        }
                    });
                }
                if (resp.data.addresses) {
                    Object.assign(addrs, resp.data.addresses);
                }
                TX_DEPOSIT_STATE.cryptoAddresses = addrs;
                if (resp.data.min_amount !== undefined) {
                    TX_DEPOSIT_STATE.minAmount = Number(resp.data.min_amount);
                }
                if (resp.data.max_amount !== undefined) {
                    TX_DEPOSIT_STATE.maxAmount = Number(resp.data.max_amount);
                }

                const currentCoin = TX_DEPOSIT_STATE.selectedCoin || "USDT";
                const minLimitEl = document.getElementById("txDepositMinLimit");
                const amountInput = document.getElementById("txDepositAmountInput");
                const minVal = (currentCoin === "USDT" || currentCoin === "USDC") ? (TX_DEPOSIT_STATE.minAmount || 10) : 5;
                if (minLimitEl) {
                    minLimitEl.textContent = `${minVal} ${currentCoin}`;
                }
                if (amountInput) {
                    amountInput.min = String(minVal);
                    amountInput.placeholder = `Min ${minVal}`;
                }

                txUpdateDepositAddressDisplay();
            }
        }
    } catch (e) {
        console.warn("Could not fetch backend crypto deposit addresses:", e);
    }
}

async function txFetchInrDetails() {
    try {
        if (typeof apiRequest === "function") {
            const resp = await apiRequest("/deposit/inr-details");
            if (resp && resp.data) {
                TX_DEPOSIT_STATE.inrDetails = resp.data;
                const d = resp.data;
                if (d.upi_id) {
                    const upiDisplay = document.getElementById("txMoneyUpiIdDisplay");
                    if (upiDisplay) upiDisplay.textContent = d.upi_id;
                }
                if (d.upi_qr_url) {
                    const qrImg = document.getElementById("txMoneyUpiQrImg");
                    if (qrImg) qrImg.src = d.upi_qr_url;
                }
                const minInr = Number(d.min_deposit_inr || 100);
                const moneyAmountInput = document.getElementById("txMoneyDepositAmountInput");
                if (moneyAmountInput) {
                    moneyAmountInput.min = String(minInr);
                    moneyAmountInput.placeholder = `Min ₹${minInr}`;
                }
            }
        }
    } catch (e) {
        console.warn("Could not fetch INR deposit details:", e);
    }
}

function txUpdateDepositAddressDisplay() {
    const coin = TX_DEPOSIT_STATE.selectedCoin || "USDT";
    const net = TX_DEPOSIT_STATE.selectedNetwork || "TRC20";

    const addresses = TX_DEPOSIT_STATE.cryptoAddresses || {};
    let resolvedAddress = addresses[`${coin}_${net}`] || addresses[net] || addresses[`USDT_${net}`] || addresses[coin] || "";

    if (!resolvedAddress && addresses) {
        resolvedAddress = addresses[net] || addresses.BEP20 || addresses.TRC20 || "";
    }

    const addressTextEl = document.getElementById("txDepositAddressText");
    const qrImgEl = document.getElementById("txDepositQrCodeImg");

    if (addressTextEl) {
        addressTextEl.textContent = resolvedAddress;
    }
    if (qrImgEl && resolvedAddress) {
        qrImgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(resolvedAddress)}`;
    }

    // Dedicated TronLink 1-Click Pay toggle (Active ONLY for USDT & TRC20)
    const tronLinkSection = document.getElementById("txTronLinkDepositSection");
    if (tronLinkSection) {
        if (coin === "USDT" && net === "TRC20") {
            tronLinkSection.classList.remove("hidden");
            txCheckTronLinkStatus();
        } else {
            tronLinkSection.classList.add("hidden");
        }
    }
}

function txRefreshDepositUI() {
    txSelectDepositCoin(TX_DEPOSIT_STATE.selectedCoin);
}

/* =========================================================
   TRONLINK WALLET INTEGRATION (USDT TRC-20)
   ========================================================= */

function txGetTronWebInstance() {
    if (window.tronLink && window.tronLink.tronWeb) {
        return window.tronLink.tronWeb;
    }
    if (window.tronWeb) {
        return window.tronWeb;
    }
    return null;
}

function txGetTronUsdtContract(tronWeb) {
    const tw = tronWeb || txGetTronWebInstance();
    const host = tw?.fullNode?.host || "";
    // If connected to Nile testnet, use official Nile USDT contract (TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf)
    if (host.includes("nile")) {
        return "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
    }
    // Mainnet USDT TRC-20 contract
    return "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
}

async function txCheckTronLinkStatus() {
    const statusText = document.getElementById("txTronLinkStatusText");
    const statusDot = document.getElementById("txTronLinkStatusDot");
    const payBtnText = document.getElementById("txTronLinkPayBtnText");
    if (!statusText || !statusDot) return false;

    const tronWeb = txGetTronWebInstance();

    if (!tronWeb && !window.tronLink) {
        statusDot.className = "w-2 h-2 rounded-full bg-slate-500";
        statusText.textContent = "Extension Not Found";
        if (payBtnText) payBtnText.textContent = "Install / Enable TronLink";
        return false;
    }

    const currentAddress = tronWeb?.defaultAddress?.base58;
    if (currentAddress) {
        statusDot.className = "w-2 h-2 rounded-full bg-emerald-400 animate-pulse";
        statusText.textContent = `${currentAddress.slice(0, 6)}...${currentAddress.slice(-4)}`;
        if (payBtnText) payBtnText.textContent = "Pay with TronLink";
        return true;
    } else {
        statusDot.className = "w-2 h-2 rounded-full bg-amber-400";
        statusText.textContent = "Unlock / Connect";
        if (payBtnText) payBtnText.textContent = "Connect TronLink";
        return false;
    }
}

// Global window event listener for TronLink status changes
if (typeof window !== "undefined") {
    window.addEventListener("message", function (e) {
        if (e.data && e.data.message && e.data.message.action) {
            const act = e.data.message.action;
            if (act === "setAccount" || act === "setNode" || act === "accountsChanged" || act === "connect") {
                txCheckTronLinkStatus();
            }
        }
    });

    // Auto-check on interval for initial injection
    let txTronCheckCount = 0;
    const txTronTimer = setInterval(() => {
        txTronCheckCount++;
        const connected = txCheckTronLinkStatus();
        if (connected || txTronCheckCount > 10) {
            clearInterval(txTronTimer);
        }
    }, 600);
}

window.txHandleTronLinkConnectOnly = async function() {
    let tronWeb = txGetTronWebInstance();
    const payBtn = document.getElementById("txTronLinkPayBtn");
    const payBtnText = document.getElementById("txTronLinkPayBtnText");
    const alertEl = document.getElementById("txTronLinkAlert");

    if (!window.tronLink && !tronWeb) {
        if (alertEl) {
            alertEl.classList.remove("hidden");
            alertEl.className = "text-xs font-bold rounded-xl p-3 bg-rose-500/15 text-rose-300 border border-rose-500/30";
            alertEl.textContent = "TronLink extension is not detected. Make sure it is enabled in chrome://extensions and reload.";
        }
        return;
    }

    try {
        if (window.tronLink?.request) {
            await window.tronLink.request({ method: "tron_requestAccounts" });
        }
        txCheckTronLinkStatus();
    } catch (e) {
        console.warn("Connect wallet request:", e);
    }
};

window.txHandleTronLinkPay = async function() {
    const alertEl = document.getElementById("txTronLinkAlert");
    const amountInput = document.getElementById("txTronLinkAmountInput");
    const payBtn = document.getElementById("txTronLinkPayBtn");
    const payBtnText = document.getElementById("txTronLinkPayBtnText");

    const showAlert = (msg, type = "error") => {
        if (!alertEl) return;
        alertEl.classList.remove("hidden");
        if (type === "error") {
            alertEl.className = "text-xs font-bold rounded-xl p-3 bg-rose-500/15 text-rose-300 border border-rose-500/30";
        } else if (type === "info") {
            alertEl.className = "text-xs font-bold rounded-xl p-3 bg-cyan-500/15 text-cyan-300 border border-cyan-500/30";
        } else {
            alertEl.className = "text-xs font-bold rounded-xl p-3 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
        }
        alertEl.innerHTML = msg;
    };

    const hideAlert = () => {
        if (alertEl) alertEl.classList.add("hidden");
    };

    hideAlert();

    // 1. Check TronLink presence
    let tronWeb = txGetTronWebInstance();
    if (!window.tronLink && !tronWeb) {
        showAlert('TronLink extension is not detected. Please ensure the extension is turned ON in Chrome and refresh the page.', "error");
        return;
    }

    // 2. Connect / Request Account if not ready
    let userAddress = tronWeb?.defaultAddress?.base58;
    if (!userAddress && window.tronLink?.request) {
        try {
            if (payBtn) payBtn.disabled = true;
            if (payBtnText) payBtnText.innerHTML = `<span class="animate-spin inline-block mr-1">◌</span> Connecting...`;
            const res = await window.tronLink.request({ method: "tron_requestAccounts" });
            if (res && (res.code === 200 || res.code === 0)) {
                tronWeb = txGetTronWebInstance();
                userAddress = tronWeb?.defaultAddress?.base58;
            }
        } catch (connErr) {
            showAlert("Could not connect to TronLink: " + (connErr?.message || connErr), "error");
            if (payBtn) payBtn.disabled = false;
            txCheckTronLinkStatus();
            return;
        }
    }

    if (!userAddress) {
        showAlert("Please unlock your TronLink wallet and approve the connection request.", "error");
        if (payBtn) payBtn.disabled = false;
        txCheckTronLinkStatus();
        return;
    }

    txCheckTronLinkStatus();

    // 3. Amount Validation
    const amountVal = parseFloat(amountInput?.value);
    if (isNaN(amountVal) || amountVal <= 0) {
        showAlert("Please enter a valid USDT amount (e.g. 10, 50, 100 USDT).", "error");
        if (amountInput) amountInput.focus();
        if (payBtn) payBtn.disabled = false;
        return;
    }

    // 4. Resolve Platform Destination Deposit Address
    const addresses = TX_DEPOSIT_STATE.cryptoAddresses || {};
    const destAddress = addresses.USDT_TRC20 || addresses.TRC20 || document.getElementById("txDepositAddressText")?.textContent?.trim() || "TPDQ3DTMQWSg4iJ7dhKXsSAKT83jfD49GP";

    if (!destAddress || !destAddress.startsWith("T") || destAddress.length < 30) {
        showAlert("Platform TRC20 deposit address not found. Please contact support.", "error");
        if (payBtn) payBtn.disabled = false;
        return;
    }

    // 5. Execute Smart Contract Transfer
    const activeTronWeb = txGetTronWebInstance() || window.tronWeb;
    const contractAddress = txGetTronUsdtContract(activeTronWeb);
    const amountInSun = activeTronWeb.toBigNumber(amountVal).times(1e6).toFixed(0);

    try {
        if (payBtn) payBtn.disabled = true;
        if (payBtnText) payBtnText.innerHTML = `<span class="animate-spin inline-block mr-1">◌</span> Confirm in TronLink...`;
        showAlert("Please confirm the USDT transaction in your TronLink pop-up window...", "info");

        const TRC20_ABI = [
            {
                "inputs": [
                    { "name": "_to", "type": "address" },
                    { "name": "_value", "type": "uint256" }
                ],
                "name": "transfer",
                "outputs": [{ "name": "", "type": "bool" }],
                "stateMutability": "nonpayable",
                "type": "function"
            }
        ];

        let txid = null;
        try {
            const contract = await activeTronWeb.contract(TRC20_ABI, contractAddress);
            const result = await contract.transfer(destAddress, amountInSun).send({
                feeLimit: 100_000_000
            });
            txid = typeof result === "string" ? result : (result?.txid || result?.transaction?.txID || result);
        } catch (contractErr) {
            // Alternative triggerSmartContract method
            const trigger = await activeTronWeb.transactionBuilder.triggerSmartContract(
                contractAddress,
                "transfer(address,uint256)",
                { feeLimit: 100_000_000 },
                [
                    { type: "address", value: destAddress },
                    { type: "uint256", value: amountInSun }
                ],
                userAddress
            );
            const signed = await activeTronWeb.trx.sign(trigger.transaction);
            const broadcast = await activeTronWeb.trx.sendRawTransaction(signed);
            txid = broadcast?.txid || broadcast?.transaction?.txID || (typeof broadcast === "string" ? broadcast : trigger.transaction?.txID);
        }

        if (!txid || typeof txid !== "string") {
            throw new Error("Transaction was not confirmed or was rejected.");
        }

        // Auto-fill manual form inputs
        const manualAmountInput = document.getElementById("txDepositAmountInput");
        const manualTxInput = document.getElementById("txDepositTxHashInput");
        if (manualAmountInput) manualAmountInput.value = amountVal;
        if (manualTxInput) manualTxInput.value = txid;

        showAlert(`✓ Transaction Broadcasted! TXID: <span class="font-mono">${txid.slice(0, 10)}...${txid.slice(-8)}</span>. Verifying with server...`, "info");

        // Submit to Backend API
        const payload = {
            currency: "USDT",
            crypto_asset: "USDT",
            amount: amountVal,
            tx_hash: txid,
            network: "TRC20",
            crypto_network: "TRC20",
            payment_method: "crypto_deposit",
            sub_account_id: TX_DEPOSIT_STATE.selectedAccount !== "main" ? TX_DEPOSIT_STATE.selectedAccount : null
        };

        if (typeof apiRequest === "function") {
            const resp = await apiRequest("/deposit/create", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            const isNile = (activeTronWeb?.fullNode?.host || "").includes("nile");
            const explorerUrl = isNile ? `https://nile.tronscan.org/#/transaction/${txid}` : `https://tronscan.org/#/transaction/${txid}`;

            if (resp && (resp.success || resp.status === "success" || resp.data)) {
                const dep = resp.data?.deposit || resp.data;
                if (amountInput) amountInput.value = "";

                if (dep && dep.status === "completed") {
                    showAlert(`✓ <b>Deposit Verified & Credited Instantly!</b> ${amountVal} USDT added to your balance. <a href="${explorerUrl}" target="_blank" class="underline text-cyan-300 font-bold ml-1">View on TronScan ↗</a>`, "success");
                    if (typeof loadWalletData === "function") loadWalletData();
                    if (typeof loadNavbarWalletBalance === "function") loadNavbarWalletBalance();
                    if (typeof txInitNexusHistoryView === "function") txInitNexusHistoryView();
                } else {
                    showAlert(`⚡ Transaction broadcasted! Verifying on TRON blockchain... <a href="${explorerUrl}" target="_blank" class="underline text-cyan-300 font-bold ml-1">View on TronScan ↗</a>`, "info");
                    
                    // Fast automatic background verification poller (every 2s, up to 12 times)
                    const depId = dep?.id || dep?._id || "";
                    let pollAttempts = 0;
                    const pollInterval = setInterval(async () => {
                        pollAttempts++;
                        try {
                            let checkResp = null;
                            if (depId) {
                                checkResp = await apiRequest(`/deposit/verify/${depId}`, { method: "POST" });
                            } else {
                                checkResp = await apiRequest("/deposit/history");
                            }

                            const checkDep = checkResp?.data?.deposit;
                            const isCompleted = checkDep ? checkDep.status === "completed" : (Array.isArray(checkResp?.data?.deposits) && checkResp.data.deposits.some(d => (d.tx_hash === txid || d.gateway_payment_id === txid) && d.status === "completed"));

                            if (isCompleted) {
                                clearInterval(pollInterval);
                                showAlert(`✓ <b>Deposit Verified & Credited Instantly!</b> ${amountVal} USDT added to your balance. <a href="${explorerUrl}" target="_blank" class="underline text-cyan-300 font-bold ml-1">View on TronScan ↗</a>`, "success");
                                if (typeof loadWalletData === "function") loadWalletData();
                                if (typeof loadNavbarWalletBalance === "function") loadNavbarWalletBalance();
                                if (typeof txInitNexusHistoryView === "function") txInitNexusHistoryView();
                            } else if (pollAttempts >= 12) {
                                clearInterval(pollInterval);
                                showAlert(`✓ Deposit request registered (${txid.slice(0, 8)}...). Blockchain confirmation will update your balance automatically. <a href="${explorerUrl}" target="_blank" class="underline text-cyan-300 font-bold ml-1">View on TronScan ↗</a>`, "info");
                                if (typeof loadWalletData === "function") loadWalletData();
                                if (typeof loadNavbarWalletBalance === "function") loadNavbarWalletBalance();
                            }
                        } catch (pErr) {
                            if (pollAttempts >= 12) clearInterval(pollInterval);
                        }
                    }, 2000);
                }
            } else {
                showAlert(`✓ Transaction sent (${txid.slice(0, 10)}...). Verification pending blockchain confirmation. <a href="${explorerUrl}" target="_blank" class="underline text-cyan-300 font-bold ml-1">View on TronScan ↗</a>`, "info");
            }
        }
    } catch (err) {
        console.error("TronLink deposit error:", err);
        const errStr = err?.message || String(err);
        if (errStr.includes("declined") || errStr.includes("reject") || errStr.includes("cancelled") || errStr.includes("denied")) {
            showAlert("Transaction was cancelled in TronLink wallet.", "error");
        } else {
            showAlert(`Payment error: ${errStr}`, "error");
        }
    } finally {
        if (payBtn) payBtn.disabled = false;
        txCheckTronLinkStatus();
    }
};

async function txHandleDepositFormSubmit(e) {
    e.preventDefault();

    const amountInput = document.getElementById("txDepositAmountInput");
    const txHashInput = document.getElementById("txDepositTxHashInput");
    const alertBox = document.getElementById("txDepositAlertMessage");
    const submitBtn = document.getElementById("txDepositSubmitBtn");

    if (!amountInput || !txHashInput || !alertBox || !submitBtn) return;

    const amount = parseFloat(amountInput.value);
    const txHash = (txHashInput.value || "").trim();
    const coinSymbol = TX_DEPOSIT_STATE.selectedCoin || "USDT";
    const minLimit = (coinSymbol === "USDT" || coinSymbol === "USDC")
        ? (TX_DEPOSIT_STATE.minAmount || 1)
        : 0.0001;
    const maxLimit = TX_DEPOSIT_STATE.maxAmount || 1000000;

    if (isNaN(amount) || amount <= 0) {
        alertBox.textContent = "Please enter a valid deposit amount greater than 0.";
        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
        alertBox.classList.remove("hidden");
        return;
    }

    if (amount < minLimit) {
        alertBox.textContent = `Minimum deposit amount is ${minLimit} ${coinSymbol}.`;
        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
        alertBox.classList.remove("hidden");
        return;
    }

    if (amount > maxLimit) {
        alertBox.textContent = `Maximum deposit amount is ${maxLimit} ${coinSymbol}.`;
        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
        alertBox.classList.remove("hidden");
        return;
    }

    if (!txHash || txHash.length < 6) {
        alertBox.textContent = "Please paste a valid transaction hash (TXID).";
        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
        alertBox.classList.remove("hidden");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="animate-spin inline-block mr-2">◌</span> Submitting...`;

    try {
        const payload = {
            currency: TX_DEPOSIT_STATE.selectedCoin,
            amount: amount,
            tx_hash: txHash,
            network: TX_DEPOSIT_STATE.selectedNetwork,
            payment_method: "crypto_deposit",
            sub_account_id: TX_DEPOSIT_STATE.selectedAccount !== "main" ? TX_DEPOSIT_STATE.selectedAccount : null
        };

        const resp = await apiRequest("/deposit/create", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (resp && (resp.success || resp.status === "success" || resp.data)) {
            const dep = resp.data?.deposit || resp.data;
            if (dep && dep.status === "completed") {
                alertBox.textContent = `✓ Deposit of ${dep.amount} ${coinSymbol} verified on blockchain and credited to your wallet instantly!`;
                alertBox.className = "rounded-xl p-3 text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
                amountInput.value = "";
                txHashInput.value = "";
                if (typeof loadWalletData === "function") loadWalletData();
                if (typeof loadNavbarWalletBalance === "function") loadNavbarWalletBalance();
                if (typeof txInitNexusHistoryView === "function") txInitNexusHistoryView();
            } else if (dep && dep.status === "rejected") {
                alertBox.textContent = `❌ Verification Failed: ${dep.verification_message || "Transaction could not be verified."}`;
                alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
            } else {
                const isPending = dep?.status === "pending_blockchain_verification" || dep?.verification_status?.includes("mismatch") || dep?.status === "pending_verification";
                alertBox.textContent = isPending
                    ? `⚡ ${dep?.verification_message || resp.message || "Deposit submitted. Verifying on blockchain..."}`
                    : `✓ ${resp.message || "Deposit request submitted."}`;
                alertBox.className = isPending
                    ? "rounded-xl p-3 text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    : "rounded-xl p-3 text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";

                // Fast background verification poller
                const depId = dep?.id || dep?._id || "";
                let pollAttempts = 0;
                const pollInterval = setInterval(async () => {
                    pollAttempts++;
                    try {
                        let checkResp = null;
                        if (depId) {
                            checkResp = await apiRequest(`/deposit/verify/${depId}`, { method: "POST" });
                        } else {
                            checkResp = await apiRequest("/deposit/history");
                        }

                        const checkDep = checkResp?.data?.deposit;
                        const isCompleted = checkDep ? checkDep.status === "completed" : (Array.isArray(checkResp?.data?.deposits) && checkResp.data.deposits.some(d => (d.tx_hash === txHash || d.gateway_payment_id === txHash) && d.status === "completed"));

                        if (isCompleted) {
                            clearInterval(pollInterval);
                            alertBox.textContent = `✓ Deposit of ${amount} ${coinSymbol} verified on blockchain and credited to your wallet instantly!`;
                            alertBox.className = "rounded-xl p-3 text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
                            amountInput.value = "";
                            txHashInput.value = "";
                            if (typeof loadWalletData === "function") loadWalletData();
                            if (typeof loadNavbarWalletBalance === "function") loadNavbarWalletBalance();
                            if (typeof txInitNexusHistoryView === "function") txInitNexusHistoryView();
                        } else if (pollAttempts >= 12) {
                            clearInterval(pollInterval);
                        }
                    } catch (pErr) {
                        if (pollAttempts >= 12) clearInterval(pollInterval);
                    }
                }, 2000);
            }
            alertBox.classList.remove("hidden");

            if (typeof loadWalletData === "function") loadWalletData();
            if (typeof loadNavbarWalletBalance === "function") loadNavbarWalletBalance();
        } else {
            alertBox.textContent = resp?.message || "Deposit request failed. Please check your details and try again.";
            alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
            alertBox.classList.remove("hidden");
        }
    } catch (err) {
        alertBox.textContent = err?.message || "An error occurred while submitting your deposit request.";
        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
        alertBox.classList.remove("hidden");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Submit Deposit Verification</span>`;
    }
}

async function txHandleMoneyDepositFormSubmit(e) {
    e.preventDefault();

    const amountInput = document.getElementById("txMoneyDepositAmountInput");
    const utrInput = document.getElementById("txMoneyDepositUtrInput");
    const alertBox = document.getElementById("txMoneyAlertMessage");
    const submitBtn = document.getElementById("txMoneySubmitBtn");
    const submitBtnText = document.getElementById("txMoneySubmitBtnText");

    if (!amountInput || !alertBox || !submitBtn) return;

    const amount = parseFloat(amountInput.value);
    const minInr = Number(TX_DEPOSIT_STATE.inrDetails?.min_deposit_inr || 100);
    const maxInr = Number(TX_DEPOSIT_STATE.inrDetails?.max_deposit_inr || 500000);

    if (isNaN(amount) || amount < minInr) {
        alertBox.textContent = `Minimum deposit amount is ₹${minInr} INR.`;
        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
        alertBox.classList.remove("hidden");
        return;
    }

    if (amount > maxInr) {
        alertBox.textContent = `Maximum deposit amount is ₹${maxInr} INR.`;
        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
        alertBox.classList.remove("hidden");
        return;
    }

    // 1. RAZORPAY INSTANT GATEWAY FLOW
    if (TX_DEPOSIT_STATE.moneyMethod === "razorpay") {
        submitBtn.disabled = true;
        if (submitBtnText) submitBtnText.innerHTML = `<span class="animate-spin inline-block mr-2">◌</span> Launching Razorpay...`;

        try {
            const subAccId = TX_DEPOSIT_STATE.moneyAccount !== "main" ? TX_DEPOSIT_STATE.moneyAccount : null;
            const orderResponse = await apiRequest("/deposit/razorpay/create-order", {
                method: "POST",
                body: JSON.stringify({
                    amount: amount,
                    sub_account_id: subAccId
                })
            });

            if (!orderResponse || !orderResponse.success || !orderResponse.data) {
                throw new Error(orderResponse?.message || "Failed to initiate Razorpay order.");
            }

            const orderData = orderResponse.data;

            // Sandbox Fallback Simulation Mode
            if (orderData.is_sandbox_fallback) {
                const confirmed = confirm(`[Razorpay Sandbox Simulation]\n\nRazorpay keys are currently in Test mode. Would you like to simulate successful instant payment of ₹${amount}?`);
                if (confirmed) {
                    const verifyResponse = await apiRequest("/deposit/razorpay/verify-payment", {
                        method: "POST",
                        body: JSON.stringify({
                            razorpay_order_id: orderData.razorpay_order_id,
                            razorpay_payment_id: "pay_simulated_" + Math.random().toString(36).substring(7),
                            sub_account_id: subAccId
                        })
                    });

                    alertBox.textContent = "✓ Razorpay payment simulated & verified successfully! Your account balance is updated.";
                    alertBox.className = "rounded-xl p-3 text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
                    alertBox.classList.remove("hidden");
                    amountInput.value = "";

                    if (typeof loadWalletData === "function") loadWalletData();
                    if (typeof loadNavbarWalletBalance === "function") loadNavbarWalletBalance();
                }
                return;
            }

            // Launch Razorpay Checkout Popup
            if (typeof Razorpay === "undefined") {
                alertBox.textContent = "Razorpay Checkout SDK is loading. Please refresh the page.";
                alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
                alertBox.classList.remove("hidden");
                return;
            }

            const user = (typeof getAuthUser === "function" ? getAuthUser() : null) || {};
            const options = {
                key: orderData.key_id,
                amount: orderData.amount_paise,
                currency: "INR",
                name: "TraidiumX",
                description: `Deposit ${amount} INR to ${TX_DEPOSIT_STATE.moneyAccountName || 'Wallet'}`,
                order_id: orderData.razorpay_order_id,
                handler: async function(response) {
                    try {
                        alertBox.textContent = "Verifying payment with bank...";
                        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30";
                        alertBox.classList.remove("hidden");

                        const verifyResponse = await apiRequest("/deposit/razorpay/verify-payment", {
                            method: "POST",
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                sub_account_id: subAccId
                            })
                        });

                        alertBox.textContent = "✓ Razorpay payment verified! Funds have been credited to your account.";
                        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
                        alertBox.classList.remove("hidden");
                        amountInput.value = "";

                        if (typeof loadWalletData === "function") loadWalletData();
                        if (typeof loadNavbarWalletBalance === "function") loadNavbarWalletBalance();
                    } catch (vErr) {
                        alertBox.textContent = vErr?.message || "Payment verification failed. Please contact support.";
                        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
                        alertBox.classList.remove("hidden");
                    }
                },
                prefill: {
                    name: user.name || user.full_name || "",
                    email: user.email || "",
                    contact: user.phone || ""
                },
                theme: {
                    color: "#22d3ee"
                }
            };

            const rzp = new Razorpay(options);
            rzp.open();
        } catch (err) {
            alertBox.textContent = err?.message || "Unable to initiate Razorpay checkout.";
            alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
            alertBox.classList.remove("hidden");
        } finally {
            submitBtn.disabled = false;
            if (submitBtnText) submitBtnText.textContent = "Proceed to Pay with Razorpay ⚡";
        }
        return;
    }

    // 2. MANUAL UPI / BANK TRANSFER FLOW
    const utr = utrInput ? utrInput.value.trim() : "";
    if (!utr || utr.length < 6) {
        alertBox.textContent = "Please enter a valid 12-digit UTR or Reference ID.";
        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
        alertBox.classList.remove("hidden");
        return;
    }

    submitBtn.disabled = true;
    if (submitBtnText) submitBtnText.innerHTML = `<span class="animate-spin inline-block mr-2">◌</span> Submitting...`;

    try {
        const payload = {
            currency: "INR",
            amount: amount,
            tx_hash: utr,
            network: "UPI",
            payment_method: TX_DEPOSIT_STATE.moneyMethod || "phonepe",
            sub_account_id: TX_DEPOSIT_STATE.moneyAccount !== "main" ? TX_DEPOSIT_STATE.moneyAccount : null
        };

        const resp = await apiRequest("/deposit/create", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (resp && (resp.success || resp.status === "success" || resp.data)) {
            alertBox.textContent = "✓ Deposit request submitted successfully! Your funds will be credited once verified.";
            alertBox.className = "rounded-xl p-3 text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
            alertBox.classList.remove("hidden");

            amountInput.value = "";
            if (utrInput) utrInput.value = "";

            if (typeof loadWalletData === "function") loadWalletData();
            if (typeof loadNavbarWalletBalance === "function") loadNavbarWalletBalance();
        } else {
            alertBox.textContent = resp?.message || "Deposit request failed. Please check your UTR number and try again.";
            alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
            alertBox.classList.remove("hidden");
        }
    } catch (err) {
        alertBox.textContent = err?.message || "An error occurred while submitting your deposit request.";
        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
        alertBox.classList.remove("hidden");
    } finally {
        submitBtn.disabled = false;
        if (submitBtnText) submitBtnText.textContent = "Submit Deposit Verification";
    }
}

function txToggleNexusFaq(idx) {
    const answer = document.getElementById(`txFaqA${idx}`);
    const icon = document.getElementById(`txFaqIcon${idx}`);
    if (!answer) return;

    const isCurrentlyOpen = !answer.classList.contains("hidden");

    // Close all FAQs first
    for (let i = 1; i <= 4; i++) {
        const a = document.getElementById(`txFaqA${i}`);
        const ic = document.getElementById(`txFaqIcon${i}`);
        if (a) a.classList.add("hidden");
        if (ic) ic.style.transform = "rotate(0deg)";
    }

    // Toggle clicked FAQ
    if (!isCurrentlyOpen) {
        answer.classList.remove("hidden");
        if (icon) icon.style.transform = "rotate(90deg)";
    }
}
window.txToggleNexusFaq = txToggleNexusFaq;

function txInitDepositFaqAccordion() {
    // Setup fallback event listeners for any .tx-faq-btn
    document.querySelectorAll(".tx-faq-btn").forEach((btn, index) => {
        btn.onclick = () => txToggleNexusFaq(index + 1);
    });
}



/* ==========================================================================
   PRIMEXBT / NEXUS SUB-TAB SWITCHER (Deposit / Withdraw / Transfer History)
   ========================================================================== */
function txSwitchNexusSubTab(tab = "deposit") {
    const btnDeposit = document.getElementById("nexusSubTabDeposit");
    const btnWithdraw = document.getElementById("nexusSubTabWithdraw");
    const btnHistory = document.getElementById("nexusSubTabHistory");

    const grid = document.getElementById("txNexusGrid");
    const panelDeposit = document.getElementById("txDepositMainPanel");
    const panelWithdraw = document.getElementById("txWithdrawMainPanel");
    const panelHistory = document.getElementById("txNexusHistoryMainPanel");

    // Save subtab in session storage and update URL hash without reloading page
    sessionStorage.setItem("tx_wallet_sub_tab", tab);
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search + `#${tab}`);
    }

    const wrap = document.querySelector(".tx-nexus-deposit-wrap");

    if (tab === "history") {
        if (wrap) wrap.classList.add("is-history-view");
        if (btnHistory) btnHistory.className = "tx-nexus-subtab-btn active";
        if (btnDeposit) btnDeposit.className = "tx-nexus-subtab-btn";
        if (btnWithdraw) btnWithdraw.className = "tx-nexus-subtab-btn";

        if (grid) {
            grid.classList.add("hidden");
            grid.style.setProperty("display", "none", "important");
        }
        if (panelHistory) {
            panelHistory.classList.remove("hidden");
            panelHistory.style.setProperty("display", "block", "important");
        }

        txInitNexusHistoryView();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
    }

    if (wrap) wrap.classList.remove("is-history-view");

    if (grid) {
        grid.classList.remove("hidden");
        grid.style.removeProperty("display");
    }
    if (panelHistory) {
        panelHistory.classList.add("hidden");
        panelHistory.style.setProperty("display", "none", "important");
    }

    if (tab === "withdraw") {
        if (btnWithdraw) btnWithdraw.className = "tx-nexus-subtab-btn active";
        if (btnDeposit) btnDeposit.className = "tx-nexus-subtab-btn";
        if (btnHistory) btnHistory.className = "tx-nexus-subtab-btn";

        if (panelDeposit) panelDeposit.classList.add("hidden");
        if (panelWithdraw) panelWithdraw.classList.remove("hidden");

        txInitWithdrawView();
        txUpdateNexusFaq("withdraw");
        window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
        if (btnDeposit) btnDeposit.className = "tx-nexus-subtab-btn active";
        if (btnWithdraw) btnWithdraw.className = "tx-nexus-subtab-btn";
        if (btnHistory) btnHistory.className = "tx-nexus-subtab-btn";

        if (panelDeposit) panelDeposit.classList.remove("hidden");
        if (panelWithdraw) panelWithdraw.classList.add("hidden");

        txInitDepositView();
        txUpdateNexusFaq("deposit");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
}

/* ==========================================================================
   NEXUS INLINE TRANSFER & ACTIVITY HISTORY LOGIC
   ========================================================================== */
/* ==========================================================================
   NEXUS INLINE TRANSFER & ACTIVITY HISTORY LOGIC (PrimeXBT Reports Style)
   ========================================================================== */
const NEXUS_TX_HISTORY_STATE = {
    loading: false,
    rawLedger: [],
    rawDeposits: [],
    rawWithdrawals: [],
    subAccountsList: [],
    selectedAccount: "main",
    activeCategory: "all",
    datePreset: "all",
    search: "",
    currency: "all",
    direction: "all",
    page: 1,
    pageSize: 10,
    initialized: false
};

function txNexusFormatMoney(value, currency = "USDT") {
    const num = Number(value || 0);
    const curr = String(currency || "USDT").toUpperCase();
    if (curr === "INR") {
        return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function txNexusFormatDate(value) {
    if (!value) return { date: "--", time: "--" };
    let parseable = value;
    if (typeof value === "string") {
        const valTrim = value.trim();
        if (valTrim && !valTrim.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(valTrim)) {
            parseable = valTrim.replace(" ", "T") + "Z";
        }
    }
    const d = new Date(parseable);
    if (Number.isNaN(d.getTime())) return { date: "--", time: "--" };
    const dateStr = d.toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
    const timeStr = d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });
    return { date: dateStr, time: timeStr };
}

function txNexusCategorizeItem(item) {
    const type = String(item.transaction_type || item.type || "").toLowerCase();
    const desc = String(item.description || "").toLowerCase();

    if (type.includes("referral") || type.includes("reward") || type.includes("commission") || desc.includes("referral") || desc.includes("refer and earn")) {
        return "referral";
    }
    if (type.includes("transfer") || desc.includes("transfer") || desc.includes("main wallet ->") || desc.includes("trading wallet ->")) {
        return "transfers";
    }
    if (type.includes("deposit") || desc.includes("deposit")) {
        return "deposits";
    }
    if (type.includes("withdrawal") || desc.includes("withdrawal") || desc.includes("payout")) {
        return "withdrawals";
    }
    if (type.includes("fee") || type.includes("margin") || type.includes("settlement") || type.includes("order") || type.includes("position") || desc.includes("trading fee") || desc.includes("margin locked")) {
        return "trading";
    }
    return "other";
}

function txNexusGetCategoryBadge(category) {
    const map = {
        transfers: '<span class="px-2.5 py-1 rounded-lg text-[11.5px] font-bold bg-cyan-400/10 text-cyan-300 border border-cyan-400/25 inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"></span>Transfer</span>',
        deposits: '<span class="px-2.5 py-1 rounded-lg text-[11.5px] font-bold bg-emerald-400/10 text-emerald-400 border border-emerald-400/25 inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>Deposit</span>',
        withdrawals: '<span class="px-2.5 py-1 rounded-lg text-[11.5px] font-bold bg-rose-400/10 text-rose-400 border border-rose-400/25 inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0"></span>Withdrawal</span>',
        referral: '<span class="px-2.5 py-1 rounded-lg text-[11.5px] font-bold bg-amber-400/10 text-amber-300 border border-amber-400/25 inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>Reward</span>',
        trading: '<span class="px-2.5 py-1 rounded-lg text-[11.5px] font-bold bg-indigo-400/10 text-indigo-300 border border-indigo-400/25 inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0"></span>Trading</span>',
        other: '<span class="px-2.5 py-1 rounded-lg text-[11.5px] font-bold bg-slate-800 text-slate-300 border border-slate-700 inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></span>System</span>'
    };
    return map[category] || map.other;
}

function txNexusGetDirectionBadge(direction) {
    const dir = String(direction || "").toLowerCase();
    if (dir === "credit" || dir === "in") {
        return '<span class="text-[12px] font-bold text-emerald-400 inline-flex items-center gap-1"><svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg> Credit (+)</span>';
    }
    if (dir === "debit" || dir === "out") {
        return '<span class="text-[12px] font-bold text-rose-400 inline-flex items-center gap-1"><svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg> Debit (-)</span>';
    }
    return '<span class="text-[12px] font-bold text-cyan-300 inline-flex items-center gap-1"><svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg> Transfer (↔)</span>';
}

function txNexusGetStatusBadge(item) {
    const desc = String(item.description || "").toLowerCase();
    const type = String(item.transaction_type || "").toLowerCase();
    const status = String(item.status || "").toLowerCase();

    if (status.includes("reject") || status.includes("fail") || desc.includes("reject") || desc.includes("failed") || type.includes("reject")) {
        return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>Rejected</span>';
    }
    if (status.includes("pending") || status.includes("process") || desc.includes("pending") || desc.includes("processing")) {
        return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>Pending</span>';
    }
    return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Completed</span>';
}

function txNexusGetFilteredRows() {
    const all = NEXUS_TX_HISTORY_STATE.rawLedger || [];
    const search = String(NEXUS_TX_HISTORY_STATE.search || "").trim().toLowerCase();
    const curr = String(NEXUS_TX_HISTORY_STATE.currency || "all").toUpperCase();
    const dir = String(NEXUS_TX_HISTORY_STATE.direction || "all").toLowerCase();
    const cat = String(NEXUS_TX_HISTORY_STATE.activeCategory || "all").toLowerCase();
    const datePreset = String(NEXUS_TX_HISTORY_STATE.datePreset || "all").toLowerCase();

    const now = new Date();

    return all.filter((item) => {
        // Date preset filter
        if (datePreset !== "all" && item.created_at) {
            const itemDate = new Date(item.created_at);
            if (!Number.isNaN(itemDate.getTime())) {
                const diffHours = (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60);
                if (datePreset === "today" && diffHours > 24) return false;
                if (datePreset === "7d" && diffHours > 24 * 7) return false;
                if (datePreset === "30d" && diffHours > 24 * 30) return false;
                if (datePreset === "90d" && diffHours > 24 * 90) return false;
            }
        }

        const itemCat = txNexusCategorizeItem(item);
        if (cat !== "all" && itemCat !== cat) {
            return false;
        }

        const itemCurr = String(item.currency || "USDT").toUpperCase();
        if (curr !== "ALL" && itemCurr !== curr) {
            return false;
        }

        const itemDir = String(item.direction || "").toLowerCase();
        if (dir !== "all" && itemDir !== dir) {
            return false;
        }

        if (search) {
            const type = String(item.transaction_type || "").toLowerCase();
            const desc = String(item.description || "").toLowerCase();
            const ref = String(item.reference_id || item.id || "").toLowerCase();
            const amt = String(item.amount || "");
            const acc = String(item._accountLabel || "").toLowerCase();
            if (!type.includes(search) && !desc.includes(search) && !ref.includes(search) && !amt.includes(search) && !acc.includes(search)) {
                return false;
            }
        }

        return true;
    });
}

function txCopyReferenceId(text, btn) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        if (btn) {
            const original = btn.innerHTML;
            btn.innerHTML = '<span class="text-emerald-400 font-bold">Copied!</span>';
            setTimeout(() => {
                btn.innerHTML = original;
            }, 1200);
        }
    }).catch(() => {});
}
window.txCopyReferenceId = txCopyReferenceId;

function txResetNexusHistoryFilters() {
    NEXUS_TX_HISTORY_STATE.activeCategory = "all";
    NEXUS_TX_HISTORY_STATE.search = "";
    NEXUS_TX_HISTORY_STATE.currency = "all";
    NEXUS_TX_HISTORY_STATE.direction = "all";
    NEXUS_TX_HISTORY_STATE.datePreset = "all";
    NEXUS_TX_HISTORY_STATE.page = 1;

    // Reset UI inputs
    const sInput = document.getElementById("nexusHistorySearchInput");
    if (sInput) sInput.value = "";
    const cSelect = document.getElementById("nexusCurrencyFilter");
    if (cSelect) cSelect.value = "all";
    const dSelect = document.getElementById("nexusDirectionFilter");
    if (dSelect) dSelect.value = "all";
    const dpSelect = document.getElementById("nexusDatePresetFilter");
    if (dpSelect) dpSelect.value = "all";

    document.querySelectorAll("[data-nexus-category]").forEach(btn => {
        if (btn.getAttribute("data-nexus-category") === "all") {
            btn.className = "tx-prime-tab active px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap bg-cyan-400 text-slate-950 shadow-sm";
        } else {
            btn.className = "tx-prime-tab px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800/60";
        }
    });

    txNexusRenderHistoryTable();
}
window.txResetNexusHistoryFilters = txResetNexusHistoryFilters;

function txNexusRenderHistoryTable() {
    const tbody = document.getElementById("nexusHistoryTableBody");
    const emptyState = document.getElementById("nexusHistoryEmptyState");
    const paginationInfo = document.getElementById("nexusPaginationInfo");
    const paginationControls = document.getElementById("nexusPaginationControls");

    if (!tbody) return;

    const filtered = txNexusGetFilteredRows();
    const total = filtered.length;
    const pageSize = Math.max(1, Number(NEXUS_TX_HISTORY_STATE.pageSize || 10));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, Number(NEXUS_TX_HISTORY_STATE.page || 1)), totalPages);
    NEXUS_TX_HISTORY_STATE.page = page;

    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    const rows = filtered.slice(start, end);

    if (total === 0) {
        tbody.innerHTML = "";
        emptyState?.classList.remove("hidden");
        if (paginationInfo) paginationInfo.textContent = "Showing 0 of 0 entries";
        if (paginationControls) paginationControls.innerHTML = "";
        return;
    }

    emptyState?.classList.add("hidden");

    tbody.innerHTML = rows.map((item) => {
        const cat = txNexusCategorizeItem(item);
        const catBadge = txNexusGetCategoryBadge(cat);
        const dirBadge = txNexusGetDirectionBadge(item.direction);
        const statusBadge = txNexusGetStatusBadge(item);
        const curr = item.currency || "USDT";
        const sign = String(item.direction || "").toLowerCase() === "credit" ? "+" : (String(item.direction || "").toLowerCase() === "debit" ? "-" : "");
        const colorClass = String(item.direction || "").toLowerCase() === "credit" ? "text-emerald-400" : (String(item.direction || "").toLowerCase() === "debit" ? "text-rose-400" : "text-cyan-300");

        const prettyTitle = String(item.transaction_type || "Transaction")
            .replaceAll("_", " ")
            .replace(/\b\w/g, c => c.toUpperCase());

        const desc = item.description || "";
        const refId = item.reference_id || item.id || "";
        const shortRef = refId.length > 14 ? `${refId.slice(0, 6)}...${refId.slice(-4)}` : refId;
        const formattedDate = txNexusFormatDate(item.created_at);
        const accLabel = item._accountLabel || "Main Account";
        const isDemoAcc = accLabel.toLowerCase().includes("demo");

        const itemKey = refId || item.id || "";

        return `
            <tr ondblclick="txOpenTxDetailModal('${encodeURIComponent(itemKey)}')"
                title="Double-click to view complete transaction details"
                class="hover:bg-slate-900/80 transition duration-150 border-b border-white/[0.04] cursor-pointer select-none group">
                <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="font-bold text-slate-100 text-[13px] tracking-tight group-hover:text-cyan-300 transition">${formattedDate.date}</div>
                    <div class="text-[11px] text-slate-400 font-mono mt-0.5">${formattedDate.time}</div>
                </td>
                <td class="py-3.5 px-4">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-white text-[13px] tracking-tight group-hover:text-cyan-200 transition">${prettyTitle}</span>
                        <span class="inline-block px-2 py-0.5 rounded-md ${isDemoAcc ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-slate-800/90 text-cyan-300 border-slate-700'} text-[10.5px] font-bold border">
                            ${accLabel}
                        </span>
                    </div>
                    ${desc ? `<p class="text-[12px] text-slate-400 mt-1 max-w-[280px] truncate leading-relaxed" title="${desc}">${desc}</p>` : ""}
                </td>
                <td class="py-3.5 px-4 whitespace-nowrap">
                    ${catBadge}
                </td>
                <td class="py-3.5 px-4 whitespace-nowrap">
                    ${dirBadge}
                </td>
                <td class="py-3.5 px-4 text-right font-mono font-bold ${colorClass} whitespace-nowrap text-[13.5px]">
                    ${sign}${txNexusFormatMoney(item.amount, curr)}
                </td>
                <td class="py-3.5 px-4 text-right font-mono text-slate-300 font-semibold whitespace-nowrap text-[13px]">
                    ${item.balance_after !== undefined && item.balance_after !== null ? txNexusFormatMoney(item.balance_after, curr) : "--"}
                </td>
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    ${statusBadge}
                </td>
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    ${refId ? `
                        <button type="button" onclick="event.stopPropagation(); txCopyReferenceId('${refId}', this)" class="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80 hover:border-cyan-400/60 text-slate-300 hover:text-cyan-300 transition text-[11.5px] font-mono cursor-pointer shadow-sm" title="Click to copy ID: ${refId}">
                            <span>${shortRef}</span>
                            <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                        </button>
                    ` : '<span class="text-slate-600">--</span>'}
                </td>
            </tr>
        `;
    }).join("");

    if (paginationInfo) {
        paginationInfo.textContent = `Showing ${start + 1}–${end} of ${total} entries`;
    }

    if (paginationControls) {
        const buttons = [];
        buttons.push(`
            <button type="button" data-action="prev" ${page <= 1 ? "disabled" : ""} class="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer">‹ Prev</button>
        `);
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
                buttons.push(`
                    <button type="button" data-page="${i}" class="px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${i === page ? 'border-cyan-400 bg-cyan-400 text-slate-950 font-black shadow-sm' : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800'}">${i}</button>
                `);
            } else if (buttons[buttons.length - 1] !== '<span class="px-1 text-slate-600">...</span>') {
                buttons.push('<span class="px-1 text-slate-600">...</span>');
            }
        }
        buttons.push(`
            <button type="button" data-action="next" ${page >= totalPages ? "disabled" : ""} class="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer">Next ›</button>
        `);
        paginationControls.innerHTML = buttons.join("");
    }
}

let CURRENT_NEXUS_DETAIL_MODAL_ITEM = null;

function txOpenTxDetailModal(refIdOrId) {
    if (!refIdOrId) return;
    const decodedId = decodeURIComponent(refIdOrId);
    const all = NEXUS_TX_HISTORY_STATE.rawLedger || [];
    const item = all.find(x => String(x.reference_id || "") === decodedId) ||
                 all.find(x => String(x.id || "") === decodedId) ||
                 all.find(x => String(x.reference_id || x.id || "").toLowerCase() === decodedId.toLowerCase());

    if (!item) return;
    CURRENT_NEXUS_DETAIL_MODAL_ITEM = item;

    const modal = document.getElementById("txNexusDetailModal");
    if (!modal) return;

    const cat = txNexusCategorizeItem(item);
    const curr = item.currency || "USDT";
    const dir = String(item.direction || "").toLowerCase();
    const sign = dir === "credit" ? "+" : (dir === "debit" ? "-" : "");
    const colorClass = dir === "credit" ? "text-emerald-400" : (dir === "debit" ? "text-rose-400" : "text-cyan-300");

    const prettyTitle = String(item.transaction_type || "Transaction")
        .replaceAll("_", " ")
        .replace(/\b\w/g, c => c.toUpperCase());

    const dt = txNexusFormatDate(item.created_at);
    const refId = item.reference_id || item.id || "--";
    const accLabel = item._accountLabel || "Main Account";

    const titleEl = document.getElementById("txDetailModalTitle");
    if (titleEl) titleEl.textContent = prettyTitle;

    const amountEl = document.getElementById("txDetailModalAmount");
    if (amountEl) {
        amountEl.textContent = `${sign}${txNexusFormatMoney(item.amount, curr)}`;
        amountEl.className = `text-2xl sm:text-3xl font-black font-mono tracking-tight ${colorClass}`;
    }

    const statusBadgeEl = document.getElementById("txDetailModalStatusBadge");
    if (statusBadgeEl) statusBadgeEl.innerHTML = txNexusGetStatusBadge(item);

    const typeEl = document.getElementById("txDetailModalType");
    if (typeEl) typeEl.textContent = prettyTitle;

    const accEl = document.getElementById("txDetailModalAccount");
    if (accEl) accEl.textContent = accLabel;

    const catEl = document.getElementById("txDetailModalCategory");
    if (catEl) catEl.innerHTML = txNexusGetCategoryBadge(cat);

    const dirEl = document.getElementById("txDetailModalDirection");
    if (dirEl) dirEl.innerHTML = txNexusGetDirectionBadge(item.direction);

    const timeEl = document.getElementById("txDetailModalTimestamp");
    if (timeEl) timeEl.textContent = `${dt.date} • ${dt.time}`;

    const balEl = document.getElementById("txDetailModalBalanceAfter");
    if (balEl) {
        balEl.textContent = (item.balance_after !== undefined && item.balance_after !== null) ? txNexusFormatMoney(item.balance_after, curr) : "--";
    }

    const refEl = document.getElementById("txDetailModalRefId");
    if (refEl) refEl.textContent = refId;

    const descEl = document.getElementById("txDetailModalDescription");
    if (descEl) descEl.textContent = item.description || "No additional description provided for this transaction.";

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    document.body.style.overflow = "hidden";
}
window.txOpenTxDetailModal = txOpenTxDetailModal;

function txCloseTxDetailModal() {
    const modal = document.getElementById("txNexusDetailModal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
    document.body.style.overflow = "";
    CURRENT_NEXUS_DETAIL_MODAL_ITEM = null;
}
window.txCloseTxDetailModal = txCloseTxDetailModal;

function txCopyModalRefId() {
    if (!CURRENT_NEXUS_DETAIL_MODAL_ITEM) return;
    const refId = CURRENT_NEXUS_DETAIL_MODAL_ITEM.reference_id || CURRENT_NEXUS_DETAIL_MODAL_ITEM.id || "";
    if (!refId) return;
    const btn = document.getElementById("txDetailModalCopyBtn");
    txCopyReferenceId(refId, btn);
}
window.txCopyModalRefId = txCopyModalRefId;

document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") {
        txCloseTxDetailModal();
    }
});

function txNexusUpdateSummaryMetrics() {
    const all = NEXUS_TX_HISTORY_STATE.rawLedger || [];
    const totalCountEl = document.getElementById("nexusStatTotalCount");
    const depCountEl = document.getElementById("nexusStatDepositCount");
    const withCountEl = document.getElementById("nexusStatWithdrawCount");
    const trfCountEl = document.getElementById("nexusStatTransferCount");

    if (totalCountEl) totalCountEl.textContent = all.length.toLocaleString();

    const deposits = all.filter(item => txNexusCategorizeItem(item) === "deposits");
    if (depCountEl) depCountEl.textContent = deposits.length.toLocaleString();

    const withdrawals = all.filter(item => txNexusCategorizeItem(item) === "withdrawals");
    if (withCountEl) withCountEl.textContent = withdrawals.length.toLocaleString();

    const transfers = all.filter(item => txNexusCategorizeItem(item) === "transfers");
    if (trfCountEl) trfCountEl.textContent = transfers.length.toLocaleString();
}

function txSetupCustomNexusPillDropdown({ wrapId, triggerId, menuId, onChange }) {
    const wrap = document.getElementById(wrapId);
    const trigger = document.getElementById(triggerId);
    const menu = document.getElementById(menuId);
    if (!wrap || !trigger || !menu) return;

    trigger.onclick = (e) => {
        e.stopPropagation();
        const isOpen = wrap.classList.contains("is-open");
        document.querySelectorAll(".tx-pill-dropdown-wrap.is-open").forEach(w => {
            if (w !== wrap) {
                w.classList.remove("is-open");
                const tr = w.querySelector(".tx-pill-dropdown-btn");
                if (tr) tr.setAttribute("aria-expanded", "false");
            }
        });
        if (isOpen) {
            wrap.classList.remove("is-open");
            trigger.setAttribute("aria-expanded", "false");
        } else {
            wrap.classList.add("is-open");
            trigger.setAttribute("aria-expanded", "true");
        }
    };

    menu.onclick = (e) => {
        const item = e.target.closest(".tx-pill-dropdown-item");
        if (!item) return;
        e.stopPropagation();

        const value = item.getAttribute("data-value");
        const labelText = item.querySelector("span")?.textContent || item.textContent.trim();

        menu.querySelectorAll(".tx-pill-dropdown-item").forEach(it => it.classList.remove("is-selected"));
        item.classList.add("is-selected");

        const triggerLabel = trigger.querySelector(".tx-dropdown-label");
        if (triggerLabel) triggerLabel.textContent = labelText;

        wrap.classList.remove("is-open");
        trigger.setAttribute("aria-expanded", "false");

        if (typeof onChange === "function") {
            onChange(value, item);
        }
    };
}

function txRenderNexusAccountFilterOptions() {
    const menu = document.getElementById("nexusAccountFilterMenu");
    const trigger = document.getElementById("nexusAccountFilterTrigger");
    if (!menu) return;

    const activeId = localStorage.getItem("traidiumx_active_user_id") || "main";
    let html = `
        <div class="tx-pill-dropdown-item ${activeId === "main" ? "is-selected" : ""}" data-value="main">
            <span>Main Trading Account</span>
            <svg class="tx-pill-dropdown-item-check" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
        </div>
    `;

    let activeLabel = "Main Trading Account";

    (NEXUS_TX_HISTORY_STATE.subAccountsList || []).forEach(sub => {
        if (sub.is_parent) return;
        const subId = String(sub.id || sub._id);
        const isSelected = activeId === subId;
        const isDemo = sub.is_demo || sub.account_mode === "demo" || sub.plan === "demo";
        const name = `${sub.name || "Sub Account"} (${isDemo ? 'Demo' : 'Real'})`;
        if (isSelected) activeLabel = name;
        html += `
            <div class="tx-pill-dropdown-item ${isSelected ? "is-selected" : ""}" data-value="${subId}">
                <span>${name}</span>
                <svg class="tx-pill-dropdown-item-check" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
            </div>
        `;
    });

    html += `
        <div class="tx-pill-dropdown-item ${activeId === "all" ? "is-selected" : ""}" data-value="all">
            <span>All Accounts (Combined)</span>
            <svg class="tx-pill-dropdown-item-check" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
        </div>
    `;

    menu.innerHTML = html;

    if (trigger) {
        const triggerLabel = trigger.querySelector(".tx-dropdown-label");
        if (triggerLabel) triggerLabel.textContent = activeLabel;
    }

    NEXUS_TX_HISTORY_STATE.selectedAccount = activeId;
}

async function txLoadNexusSubAccountsList() {
    try {
        if (typeof apiRequest !== "function" || !isLoggedIn()) return;
        const res = await apiRequest("/user/sub-accounts").catch(() => null);
        const subList = res?.data || [];
        NEXUS_TX_HISTORY_STATE.subAccountsList = Array.isArray(subList) ? subList : [];
        txRenderNexusAccountFilterOptions();
    } catch (e) {
        console.warn("Failed to load sub accounts for history filter:", e);
    }
}

async function txReloadNexusHistoryData() {
    if (NEXUS_TX_HISTORY_STATE.loading) return;
    NEXUS_TX_HISTORY_STATE.loading = true;

    const spinner = document.getElementById("nexusRefreshSpinner");
    if (spinner) spinner.classList.add("animate-spin");

    try {
        if (typeof apiRequest !== "function" || !isLoggedIn()) {
            return;
        }

        const selectedAcc = NEXUS_TX_HISTORY_STATE.selectedAccount || "main";
        const subAccounts = NEXUS_TX_HISTORY_STATE.subAccountsList || [];

        if (selectedAcc === "all") {
            const targets = ["main", ...subAccounts.map(s => String(s.id || s._id)).filter(Boolean)];
            
            const promises = targets.map(tId => 
                Promise.all([
                    apiRequest(`/wallet/ledger?sub_account_id=${tId}`).catch(() => null),
                    apiRequest(`/deposit/history?sub_account_id=${tId}`).catch(() => null),
                    apiRequest(`/withdrawal/history?sub_account_id=${tId}`).catch(() => null)
                ])
            );

            const allResults = await Promise.all(promises);
            let combinedLedger = [];
            let combinedDeposits = [];
            let combinedWithdrawals = [];

            allResults.forEach(([ledgerRes, depositRes, withdrawRes], idx) => {
                const targetId = targets[idx];
                const accObj = subAccounts.find(s => String(s.id || s._id) === targetId);
                const accLabel = targetId === "main" ? "Main Account" : (accObj?.name || "Sub Account");

                if (ledgerRes && ledgerRes.data) {
                    const raw = ledgerRes.data.ledger || ledgerRes.data || [];
                    if (Array.isArray(raw)) {
                        raw.forEach(item => {
                            item._accountLabel = accLabel;
                            item._accountId = targetId;
                        });
                        combinedLedger.push(...raw);
                    }
                }
                if (depositRes && depositRes.data) {
                    const deps = depositRes.data.deposits || [];
                    if (Array.isArray(deps)) combinedDeposits.push(...deps);
                }
                if (withdrawRes && withdrawRes.data) {
                    const wds = withdrawRes.data.withdrawals || [];
                    if (Array.isArray(wds)) combinedWithdrawals.push(...wds);
                }
            });

            // Deduplicate and sort by created_at descending
            const seen = new Set();
            combinedLedger = combinedLedger.filter(item => {
                const id = String(item.id || item._id || `${item.created_at}_${item.reference_id}_${item._accountId}`);
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            });
            combinedLedger.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            NEXUS_TX_HISTORY_STATE.rawLedger = combinedLedger;
            NEXUS_TX_HISTORY_STATE.rawDeposits = combinedDeposits;
            NEXUS_TX_HISTORY_STATE.rawWithdrawals = combinedWithdrawals;
        } else {
            const [ledgerRes, depositRes, withdrawRes] = await Promise.all([
                apiRequest(`/wallet/ledger?sub_account_id=${selectedAcc}`).catch(() => null),
                apiRequest(`/deposit/history?sub_account_id=${selectedAcc}`).catch(() => null),
                apiRequest(`/withdrawal/history?sub_account_id=${selectedAcc}`).catch(() => null)
            ]);

            const accObj = subAccounts.find(s => String(s.id || s._id) === selectedAcc);
            const accLabel = selectedAcc === "main" ? "Main Account" : (accObj?.name || "Sub Account");

            if (ledgerRes && ledgerRes.data) {
                const raw = ledgerRes.data.ledger || ledgerRes.data || [];
                const arr = Array.isArray(raw) ? raw : [];
                arr.forEach(item => {
                    item._accountLabel = accLabel;
                    item._accountId = selectedAcc;
                });
                NEXUS_TX_HISTORY_STATE.rawLedger = arr;
            } else {
                NEXUS_TX_HISTORY_STATE.rawLedger = [];
            }

            if (depositRes && depositRes.data) {
                NEXUS_TX_HISTORY_STATE.rawDeposits = depositRes.data.deposits || [];
            } else {
                NEXUS_TX_HISTORY_STATE.rawDeposits = [];
            }

            if (withdrawRes && withdrawRes.data) {
                NEXUS_TX_HISTORY_STATE.rawWithdrawals = withdrawRes.data.withdrawals || [];
            } else {
                NEXUS_TX_HISTORY_STATE.rawWithdrawals = [];
            }
        }

        txNexusUpdateSummaryMetrics();
        txNexusRenderHistoryTable();
    } catch (err) {
        console.error("Failed to load nexus transfer history:", err);
    } finally {
        NEXUS_TX_HISTORY_STATE.loading = false;
        if (spinner) spinner.classList.remove("animate-spin");
    }
}

window.txReloadNexusHistoryData = txReloadNexusHistoryData;

function txExportNexusHistoryCsv() {
    const filtered = txNexusGetFilteredRows();
    if (!filtered || filtered.length === 0) {
        alert("No records to export.");
        return;
    }

    const headers = ["Date", "Account", "Type", "Category", "Direction", "Amount", "Currency", "Balance After", "Description", "Reference ID"];
    const rows = filtered.map(item => [
        `"${txNexusFormatDate(item.created_at).date} ${txNexusFormatDate(item.created_at).time}"`,
        `"${item._accountLabel || 'Main Account'}"`,
        `"${item.transaction_type || ''}"`,
        `"${txNexusCategorizeItem(item)}"`,
        `"${item.direction || ''}"`,
        item.amount || 0,
        `"${item.currency || 'USDT'}"`,
        item.balance_after || 0,
        `"${(item.description || '').replace(/"/g, '""')}"`,
        `"${item.reference_id || ''}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `TraidiumX_Activity_History_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.txExportNexusHistoryCsv = txExportNexusHistoryCsv;

function txResetNexusHistoryFilters() {
    NEXUS_TX_HISTORY_STATE.search = "";
    NEXUS_TX_HISTORY_STATE.datePreset = "all";
    NEXUS_TX_HISTORY_STATE.selectedAccount = "main";
    NEXUS_TX_HISTORY_STATE.direction = "all";
    NEXUS_TX_HISTORY_STATE.currency = "all";
    NEXUS_TX_HISTORY_STATE.pageSize = 10;
    NEXUS_TX_HISTORY_STATE.page = 1;
    NEXUS_TX_HISTORY_STATE.activeCategory = "all";

    const searchInput = document.getElementById("nexusHistorySearchInput");
    if (searchInput) searchInput.value = "";

    document.querySelectorAll("[data-nexus-category]").forEach(b => {
        const cat = b.getAttribute("data-nexus-category");
        if (cat === "all") {
            b.className = "tx-prime-tab active px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap bg-cyan-400 text-slate-950 shadow-sm";
        } else {
            b.className = "tx-prime-tab px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800/60";
        }
    });

    const resetDropdown = (triggerId, menuId, defaultVal, defaultLabel) => {
        const trigger = document.getElementById(triggerId);
        const menu = document.getElementById(menuId);
        if (trigger) {
            const lbl = trigger.querySelector(".tx-dropdown-label");
            if (lbl) lbl.textContent = defaultLabel;
        }
        if (menu) {
            menu.querySelectorAll(".tx-pill-dropdown-item").forEach(it => {
                if (it.getAttribute("data-value") === String(defaultVal)) {
                    it.classList.add("is-selected");
                } else {
                    it.classList.remove("is-selected");
                }
            });
        }
    };

    resetDropdown("nexusDatePresetTrigger", "nexusDatePresetMenu", "all", "All Time");
    resetDropdown("nexusAccountFilterTrigger", "nexusAccountFilterMenu", "main", "Main Trading Account");
    resetDropdown("nexusDirectionFilterTrigger", "nexusDirectionFilterMenu", "all", "All Directions");
    resetDropdown("nexusCurrencyFilterTrigger", "nexusCurrencyFilterMenu", "all", "All Assets");
    resetDropdown("nexusPageSizeTrigger", "nexusPageSizeMenu", "10", "10 / page");

    txReloadNexusHistoryData();
}

window.txResetNexusHistoryFilters = txResetNexusHistoryFilters;

function txInitNexusHistoryView() {
    if (!NEXUS_TX_HISTORY_STATE.initialized) {
        NEXUS_TX_HISTORY_STATE.initialized = true;

        document.querySelectorAll("[data-nexus-category]").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("[data-nexus-category]").forEach(b => {
                    b.className = "tx-prime-tab px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800/60";
                });
                btn.className = "tx-prime-tab active px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap bg-cyan-400 text-slate-950 shadow-sm";
                NEXUS_TX_HISTORY_STATE.activeCategory = btn.getAttribute("data-nexus-category") || "all";
                NEXUS_TX_HISTORY_STATE.page = 1;
                txNexusRenderHistoryTable();
            });
        });

        document.getElementById("nexusHistorySearchInput")?.addEventListener("input", (e) => {
            NEXUS_TX_HISTORY_STATE.search = e.target.value || "";
            NEXUS_TX_HISTORY_STATE.page = 1;
            txNexusRenderHistoryTable();
        });

        // Setup Custom Animated Dropdowns
        txSetupCustomNexusPillDropdown({
            wrapId: "nexusDatePresetDropdown",
            triggerId: "nexusDatePresetTrigger",
            menuId: "nexusDatePresetMenu",
            onChange: (val) => {
                NEXUS_TX_HISTORY_STATE.datePreset = val || "all";
                NEXUS_TX_HISTORY_STATE.page = 1;
                txNexusRenderHistoryTable();
            }
        });

        txSetupCustomNexusPillDropdown({
            wrapId: "nexusAccountFilterDropdown",
            triggerId: "nexusAccountFilterTrigger",
            menuId: "nexusAccountFilterMenu",
            onChange: (val) => {
                NEXUS_TX_HISTORY_STATE.selectedAccount = val || "main";
                NEXUS_TX_HISTORY_STATE.page = 1;
                txReloadNexusHistoryData();
            }
        });

        txSetupCustomNexusPillDropdown({
            wrapId: "nexusDirectionFilterDropdown",
            triggerId: "nexusDirectionFilterTrigger",
            menuId: "nexusDirectionFilterMenu",
            onChange: (val) => {
                NEXUS_TX_HISTORY_STATE.direction = val || "all";
                NEXUS_TX_HISTORY_STATE.page = 1;
                txNexusRenderHistoryTable();
            }
        });

        txSetupCustomNexusPillDropdown({
            wrapId: "nexusCurrencyFilterDropdown",
            triggerId: "nexusCurrencyFilterTrigger",
            menuId: "nexusCurrencyFilterMenu",
            onChange: (val) => {
                NEXUS_TX_HISTORY_STATE.currency = val || "all";
                NEXUS_TX_HISTORY_STATE.page = 1;
                txNexusRenderHistoryTable();
            }
        });

        txSetupCustomNexusPillDropdown({
            wrapId: "nexusPageSizeDropdown",
            triggerId: "nexusPageSizeTrigger",
            menuId: "nexusPageSizeMenu",
            onChange: (val) => {
                NEXUS_TX_HISTORY_STATE.pageSize = Number(val || 10);
                NEXUS_TX_HISTORY_STATE.page = 1;
                txNexusRenderHistoryTable();
            }
        });

        // Global click-outside & Escape to close dropdowns
        document.addEventListener("click", (e) => {
            if (!e.target.closest(".tx-pill-dropdown-wrap")) {
                document.querySelectorAll(".tx-pill-dropdown-wrap.is-open").forEach(w => {
                    w.classList.remove("is-open");
                    const tr = w.querySelector(".tx-pill-dropdown-btn");
                    if (tr) tr.setAttribute("aria-expanded", "false");
                });
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                document.querySelectorAll(".tx-pill-dropdown-wrap.is-open").forEach(w => {
                    w.classList.remove("is-open");
                    const tr = w.querySelector(".tx-pill-dropdown-btn");
                    if (tr) tr.setAttribute("aria-expanded", "false");
                });
            }
        });

        document.getElementById("nexusPaginationControls")?.addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            if (!btn || btn.disabled) return;
            const action = btn.getAttribute("data-action");
            const pageNum = Number(btn.getAttribute("data-page"));

            if (action === "prev") {
                NEXUS_TX_HISTORY_STATE.page = Math.max(1, NEXUS_TX_HISTORY_STATE.page - 1);
            } else if (action === "next") {
                NEXUS_TX_HISTORY_STATE.page += 1;
            } else if (pageNum) {
                NEXUS_TX_HISTORY_STATE.page = pageNum;
            }
            txNexusRenderHistoryTable();
        });

        // Listen to navbar sub-account switch
        window.addEventListener("storage", (e) => {
            if (e.key === "traidiumx_active_user_id") {
                const newSubId = e.newValue || "main";
                NEXUS_TX_HISTORY_STATE.selectedAccount = newSubId;
                txRenderNexusAccountFilterOptions();
                NEXUS_TX_HISTORY_STATE.page = 1;
                txReloadNexusHistoryData();
            }
        });
    }

    txLoadNexusSubAccountsList().then(() => {
        txReloadNexusHistoryData();
    });
}

window.txInitNexusHistoryView = txInitNexusHistoryView;
window.txSwitchNexusSubTab = txSwitchNexusSubTab;

function txUpdateNexusFaq(type = "deposit") {
    const q1 = document.getElementById("txFaqQ1");
    const q2 = document.getElementById("txFaqQ2");
    const q3 = document.getElementById("txFaqQ3");
    const q4 = document.getElementById("txFaqQ4");
    const a1 = document.getElementById("txFaqA1");
    const a2 = document.getElementById("txFaqA2");
    const a3 = document.getElementById("txFaqA3");
    const a4 = document.getElementById("txFaqA4");

    // Close all open FAQs on switch
    for (let i = 1; i <= 4; i++) {
        const a = document.getElementById(`txFaqA${i}`);
        const ic = document.getElementById(`txFaqIcon${i}`);
        if (a) a.classList.add("hidden");
        if (ic) ic.style.transform = "rotate(0deg)";
    }

    if (type === "withdraw") {
        if (q1) q1.textContent = "How to withdraw money / crypto?";
        if (a1) a1.textContent = "Select your payout method (Bank Account, UPI, or Crypto wallet), specify the amount, enter the destination account or wallet address, and click request withdrawal.";
        if (q2) q2.textContent = "How long does it take to withdraw?";
        if (a2) a2.textContent = "92% of withdrawal requests are processed automatically within minutes. Bank IMPS and UPI payouts are credited within 5-15 minutes after approval.";
        if (q3) q3.textContent = "What are withdrawal limits?";
        if (a3) a3.textContent = "Minimum crypto withdrawal is 10 USDT. Minimum bank/UPI withdrawal is ₹500 INR. High volume limits are automatically unlocked upon KYC verification.";
        if (q4) q4.textContent = "What are withdrawal fees?";
        if (a4) a4.textContent = "TraidiumX charges 0% platform fee on all standard withdrawals. Only nominal blockchain gas network fees (e.g. 1 USDT on TRC20) or zero bank fees apply.";
    } else {
        if (q1) q1.textContent = "How to deposit crypto or money?";
        if (a1) a1.textContent = "Choose Crypto to deposit USDT, BTC, ETH directly to your deposit address, or choose Money to deposit INR via Instant Bank Transfer (IMPS) or UPI.";
        if (q2) q2.textContent = "How long does it take for a deposit to arrive?";
        if (a2) a2.textContent = "Crypto deposits are credited automatically after standard blockchain network confirmations (usually 1-3 minutes). Money deposits via UPI/IMPS are verified and credited within 5-15 minutes.";
        if (q3) q3.textContent = "What is the minimum deposit?";
        if (a3) a3.textContent = "Minimum crypto deposit is 5 USDT (or crypto equivalent). Minimum money deposit is ₹500 INR. There is no maximum limit for verified accounts.";
        if (q4) q4.textContent = "Are there any deposit fees?";
        if (a4) a4.textContent = "TraidiumX charges 0% fees on all deposits. You only pay standard blockchain gas fees or your bank's transfer fees.";
    }
}

/* ==========================================================================
   PRIMEXBT / NEXUS WITHDRAW VIEW STATE & LOGIC
   ========================================================================== */
const TX_WITHDRAW_STATE = {
    initialized: false,
    mode: "money", // "crypto" or "money"
    moneyStep: 2,
    cryptoStep: 2,
    selectedCoin: null,
    selectedNetwork: null,
    selectedMoneyCurrency: null,
    selectedMoneyMethod: null,
    coins: [
        { symbol: "USDT", name: "Tether USD", icon: "₮", min: "10 USDT", networks: ["TRC20", "ERC20", "BEP20", "SOLANA"], networkFees: { "TRC20": 1, "ERC20": 4, "BEP20": 0.5, "SOLANA": 0.8 } },
        { symbol: "BTC", name: "Bitcoin", icon: "₿", min: "0.001 BTC", networks: ["BITCOIN", "BEP20"], networkFees: { "BITCOIN": 0.0002, "BEP20": 0.00005 } },
        { symbol: "ETH", name: "Ethereum", icon: "Ξ", min: "0.01 ETH", networks: ["ERC20", "BEP20", "ARBITRUM"], networkFees: { "ERC20": 0.002, "BEP20": 0.0005, "ARBITRUM": 0.0003 } },
        { symbol: "SOL", name: "Solana", icon: "◎", min: "0.1 SOL", networks: ["SOLANA"], networkFees: { "SOLANA": 0.01 } },
        { symbol: "BNB", name: "BNB Smart Chain", icon: "❖", min: "0.02 BNB", networks: ["BEP20"], networkFees: { "BEP20": 0.001 } },
        { symbol: "TRX", name: "TRON", icon: "⚡", min: "50 TRX", networks: ["TRC20"], networkFees: { "TRC20": 5 } },
        { symbol: "XRP", name: "Ripple", icon: "✕", min: "20 XRP", networks: ["RIPPLE"], networkFees: { "RIPPLE": 0.25 } },
        { symbol: "USDC", name: "USD Coin", icon: "$", min: "10 USDC", networks: ["ERC20", "BEP20", "SOLANA", "TRC20"], networkFees: { "ERC20": 4, "BEP20": 0.5, "SOLANA": 0.8, "TRC20": 1 } }
    ]
};

function txInitWithdrawView() {
    if (TX_WITHDRAW_STATE.initialized) {
        txRefreshWithdrawUI();
        return;
    }
    TX_WITHDRAW_STATE.initialized = true;

    // Crypto Currency dropdown toggle
    const cryptoCurBtn = document.getElementById("txWithCryptoCurrencyDropdownBtn");
    const cryptoCurMenu = document.getElementById("txWithCryptoCurrencyDropdownMenu");
    const cryptoCurChevron = document.getElementById("txWithCryptoCurrencyChevron");
    const cryptoCurSearch = document.getElementById("txWithCryptoCurrencySearchInput");

    if (cryptoCurBtn && cryptoCurMenu) {
        cryptoCurBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = cryptoCurMenu.classList.contains("hidden");
            cryptoCurMenu.classList.toggle("hidden", !isHidden);
            if (cryptoCurChevron) cryptoCurChevron.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
            if (isHidden && cryptoCurSearch) {
                setTimeout(() => cryptoCurSearch.focus(), 50);
            }
        };

        document.addEventListener("click", (e) => {
            if (!cryptoCurMenu.contains(e.target) && !cryptoCurBtn.contains(e.target)) {
                cryptoCurMenu.classList.add("hidden");
                if (cryptoCurChevron) cryptoCurChevron.style.transform = "rotate(0deg)";
            }
        });
    }

    if (cryptoCurSearch) {
        cryptoCurSearch.oninput = () => {
            txRenderWithdrawCryptoCurrencyList(cryptoCurSearch.value.trim());
        };
    }

    // Money Currency dropdown toggle
    const moneyCurBtn = document.getElementById("txWithMoneyCurrencyBtn");
    const moneyCurMenu = document.getElementById("txWithMoneyCurrencyDropdownMenu");
    const moneyCurChevron = document.getElementById("txWithMoneyCurrencyChevron");

    if (moneyCurBtn && moneyCurMenu) {
        moneyCurBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = moneyCurMenu.classList.contains("hidden");
            moneyCurMenu.classList.toggle("hidden", !isHidden);
            if (moneyCurChevron) moneyCurChevron.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
        };

        document.addEventListener("click", (e) => {
            if (!moneyCurMenu.contains(e.target) && !moneyCurBtn.contains(e.target)) {
                moneyCurMenu.classList.add("hidden");
                if (moneyCurChevron) moneyCurChevron.style.transform = "rotate(0deg)";
            }
        });
    }

    // Money Method dropdown toggle
    const moneyMethodBtn = document.getElementById("txWithMoneyMethodBtn");
    const moneyMethodMenu = document.getElementById("txWithMoneyMethodDropdownMenu");
    const moneyMethodChevron = document.getElementById("txWithMoneyMethodChevron");

    if (moneyMethodBtn && moneyMethodMenu) {
        moneyMethodBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = moneyMethodMenu.classList.contains("hidden");
            moneyMethodMenu.classList.toggle("hidden", !isHidden);
            if (moneyMethodChevron) moneyMethodChevron.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
        };

        document.addEventListener("click", (e) => {
            if (!moneyMethodMenu.contains(e.target) && !moneyMethodBtn.contains(e.target)) {
                moneyMethodMenu.classList.add("hidden");
                if (moneyMethodChevron) moneyMethodChevron.style.transform = "rotate(0deg)";
            }
        });
    }

    // Amount input live fee calculate listeners
    const cryptoAmountInput = document.getElementById("txWithCryptoAmountInput");
    if (cryptoAmountInput) {
        cryptoAmountInput.oninput = txCalculateCryptoWithdrawalFee;
    }

    const moneyAmountInput = document.getElementById("txWithMoneyAmountInput");
    if (moneyAmountInput) {
        moneyAmountInput.oninput = txCalculateMoneyWithdrawalFee;
    }

    txFetchFeeStructure(true).then(() => {
        txCalculateMoneyWithdrawalFee();
        txCalculateCryptoWithdrawalFee();
    });

    txRefreshWithdrawUI();
}

function txRefreshWithdrawUI() {
    txCheckUserKycForWithdraw();
    txRenderWithdrawCryptoCurrencyList();
    txSelectWithdrawCoin(TX_WITHDRAW_STATE.selectedCoin, false);
    txUpdateWithdrawAvailableBalances();

    if (TX_WITHDRAW_STATE.mode === "crypto") {
        txSwitchWithdrawMode("crypto");
    } else {
        txSwitchWithdrawMode("money");
    }
}

function txSwitchWithdrawMode(mode = "money") {
    TX_WITHDRAW_STATE.mode = mode;

    const titleEl = document.getElementById("txWithdrawCardTitle");
    const toggleCrypto = document.getElementById("txWithdrawToggleCrypto");
    const toggleMoney = document.getElementById("txWithdrawToggleMoney");
    const cryptoStepper = document.getElementById("txWithdrawCryptoStepper");
    const moneyStepper = document.getElementById("txWithdrawMoneyStepper");

    if (mode === "crypto") {
        if (titleEl) titleEl.textContent = "Withdraw crypto";
        if (toggleCrypto) toggleCrypto.className = "active";
        if (toggleMoney) toggleMoney.className = "";
        if (cryptoStepper) cryptoStepper.classList.remove("hidden");
        if (moneyStepper) moneyStepper.classList.add("hidden");
        txSetWithdrawCryptoStep(TX_WITHDRAW_STATE.selectedCoin ? (TX_WITHDRAW_STATE.selectedNetwork ? 4 : 3) : 2);
        txCalculateCryptoWithdrawalFee();
    } else {
        if (titleEl) titleEl.textContent = "Withdraw money";
        if (toggleMoney) toggleMoney.className = "active";
        if (toggleCrypto) toggleCrypto.className = "";
        if (cryptoStepper) cryptoStepper.classList.add("hidden");
        if (moneyStepper) moneyStepper.classList.remove("hidden");
        txSetWithdrawMoneyStep(TX_WITHDRAW_STATE.selectedMoneyCurrency ? (TX_WITHDRAW_STATE.selectedMoneyMethod ? 4 : 3) : 2);
        txCalculateMoneyWithdrawalFee();
    }
    txUpdateWithdrawAvailableBalances();
}

function txCheckUserKycForWithdraw() {
    const moneyVerifyCard = document.getElementById("txWithMoneyVerifyCard");
    const moneyVerifiedInputs = document.getElementById("txWithMoneyVerifiedInputs");
    const cryptoVerifyCard = document.getElementById("txWithCryptoVerifyCard");
    const cryptoVerifiedContent = document.getElementById("txWithCryptoVerifiedContent");

    if (moneyVerifyCard) moneyVerifyCard.classList.add("hidden");
    if (moneyVerifiedInputs) moneyVerifiedInputs.classList.remove("hidden");
    if (cryptoVerifyCard) cryptoVerifyCard.classList.add("hidden");
    if (cryptoVerifiedContent) cryptoVerifiedContent.classList.remove("hidden");
}

function txUpdateWithdrawAvailableBalances() {
    const usdtWallet = WALLET_STATE?.wallet?.main_wallet_usdt || WALLET_STATE?.wallet?.main_wallet || {};
    const rawBalUSDT = typeof usdtWallet === "number" ? usdtWallet : (usdtWallet.available_balance ?? WALLET_STATE?.wallet?.available_balance ?? 0);
    const mainBalUSDT = typeof rawBalUSDT === "number" ? rawBalUSDT : (parseFloat(String(rawBalUSDT).replace(/[^0-9.-]/g, "")) || 0);

    const inrWallet = WALLET_STATE?.wallet?.main_wallet_inr || {};
    const rawBalINR = typeof inrWallet === "number" ? inrWallet : (inrWallet.available_balance ?? (mainBalUSDT * 90));
    const mainBalINR = typeof rawBalINR === "number" ? rawBalINR : (parseFloat(String(rawBalINR).replace(/[^0-9.-]/g, "")) || 0);

    const moneyBalEl = document.getElementById("txWithMoneyAvailableBal");
    if (moneyBalEl) {
        const curr = TX_WITHDRAW_STATE.selectedMoneyCurrency || "INR";
        if (curr === "INR") {
            moneyBalEl.textContent = `₹${mainBalINR.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else {
            moneyBalEl.textContent = `$${mainBalUSDT.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
    }

    const cryptoBalEl = document.getElementById("txWithCryptoAvailableBal");
    if (cryptoBalEl) {
        const coin = TX_WITHDRAW_STATE.selectedCoin || "USDT";
        if (coin === "USDT") {
            cryptoBalEl.textContent = `${mainBalUSDT.toFixed(2)} USDT`;
        } else {
            const row = WALLET_STATE?.crypto_balances?.find(c => c.currency === coin || c.symbol === coin);
            const cBal = row ? (typeof row.balance === "number" ? row.balance : (parseFloat(String(row.balance || 0).replace(/[^0-9.-]/g, "")) || 0)) : 0;
            cryptoBalEl.textContent = `${cBal.toFixed(4)} ${coin}`;
        }
    }
}

/* ==========================================================================
   WITHDRAW CRYPTO STEPPER CONTROLS
   ========================================================================== */
function txSetWithdrawCryptoStep(step) {
    if (step > 2 && !TX_WITHDRAW_STATE.selectedCoin) {
        return; // Guard: Cannot jump to step 3/4 without selecting currency
    }
    TX_WITHDRAW_STATE.cryptoStep = step;

    const dot2 = document.getElementById("txWithCryptoStep2Dot");
    const dot3 = document.getElementById("txWithCryptoStep3Dot");
    const dot4 = document.getElementById("txWithCryptoStep4Dot");

    const label2 = document.getElementById("txWithCryptoStep2Label");
    const label3 = document.getElementById("txWithCryptoStep3Label");
    const label4 = document.getElementById("txWithCryptoStep4Label");

    const body2 = document.getElementById("txWithCryptoStep2Body");
    const body3 = document.getElementById("txWithCryptoStep3Body");
    const body4 = document.getElementById("txWithCryptoStep4Body");

    if (step === 2) {
        if (dot2) {
            dot2.className = TX_WITHDRAW_STATE.selectedCoin ? "tx-nexus-step-dot completed" : "tx-nexus-step-dot active";
            dot2.textContent = TX_WITHDRAW_STATE.selectedCoin ? "✓" : "2";
        }
        if (dot3) { dot3.className = "tx-nexus-step-dot inactive"; dot3.textContent = "3"; }
        if (dot4) { dot4.className = "tx-nexus-step-dot inactive"; dot4.textContent = "4"; }

        if (label2) label2.className = "text-sm font-bold text-white block cursor-pointer";
        if (label3) label3.className = TX_WITHDRAW_STATE.selectedCoin ? "text-sm font-bold text-slate-400 flex items-center gap-1.5 cursor-pointer" : "text-sm font-bold text-slate-500 flex items-center gap-1.5 cursor-not-allowed opacity-60";
        if (label4) label4.className = "text-sm font-bold text-slate-500 block cursor-not-allowed opacity-60";

        if (body2) body2.classList.remove("hidden");
        if (body3) body3.classList.add("hidden");
        if (body4) body4.classList.add("hidden");
    } else if (step === 3) {
        if (dot2) { dot2.className = "tx-nexus-step-dot completed"; dot2.textContent = "✓"; }
        if (dot3) {
            dot3.className = TX_WITHDRAW_STATE.selectedNetwork ? "tx-nexus-step-dot completed" : "tx-nexus-step-dot active";
            dot3.textContent = TX_WITHDRAW_STATE.selectedNetwork ? "✓" : "3";
        }
        if (dot4) { dot4.className = "tx-nexus-step-dot inactive"; dot4.textContent = "4"; }

        if (label2) label2.className = "text-sm font-bold text-white block cursor-pointer";
        if (label3) label3.className = "text-sm font-bold text-white flex items-center gap-1.5 cursor-pointer";
        if (label4) label4.className = TX_WITHDRAW_STATE.selectedNetwork ? "text-sm font-bold text-slate-400 block cursor-pointer" : "text-sm font-bold text-slate-500 block cursor-not-allowed opacity-60";

        if (body2) body2.classList.remove("hidden");
        if (body3) body3.classList.remove("hidden");
        if (body4) body4.classList.add("hidden");
    } else if (step >= 4) {
        if (dot2) { dot2.className = "tx-nexus-step-dot completed"; dot2.textContent = "✓"; }
        if (dot3) { dot3.className = "tx-nexus-step-dot completed"; dot3.textContent = "✓"; }
        if (dot4) { dot4.className = "tx-nexus-step-dot active"; dot4.textContent = "4"; }

        if (label2) label2.className = "text-sm font-bold text-white block cursor-pointer";
        if (label3) label3.className = "text-sm font-bold text-white flex items-center gap-1.5 cursor-pointer";
        if (label4) label4.className = "text-sm font-bold text-white block cursor-pointer";

        if (body2) body2.classList.remove("hidden");
        if (body3) body3.classList.remove("hidden");
        if (body4) body4.classList.remove("hidden");

        const verifyCard = document.getElementById("txWithCryptoVerifyCard");
        const verifiedContent = document.getElementById("txWithCryptoVerifiedContent");
        if (verifyCard) verifyCard.classList.add("hidden");
        if (verifiedContent) verifiedContent.classList.remove("hidden");

        const amountInput = document.getElementById("txWithCryptoAmountInput");
        if (amountInput) {
            setTimeout(() => {
                amountInput.focus();
            }, 100);
        }
    }
}

function txRenderWithdrawCryptoCurrencyList(filterText = "") {
    const listContainer = document.getElementById("txWithCryptoCurrencyList");
    if (!listContainer) return;

    const query = filterText.toLowerCase();
    const filtered = TX_WITHDRAW_STATE.coins.filter(c => {
        return c.symbol.toLowerCase().includes(query) || c.name.toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div class="p-3 text-center text-xs text-slate-500 font-medium">No currencies found</div>`;
        return;
    }

    listContainer.innerHTML = filtered.map(c => `
        <button type="button" onclick="txSelectWithdrawCoin('${c.symbol}', true)" class="tx-nexus-coin-row ${c.symbol === TX_WITHDRAW_STATE.selectedCoin ? 'selected' : ''}">
            <div class="flex items-center gap-3">
                <span class="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shrink-0" style="background: rgba(34, 211, 238, 0.15); color: #22d3ee; border: 1px solid rgba(34, 211, 238, 0.3);">${c.icon}</span>
                <div>
                    <span class="text-xs font-bold text-white block leading-tight">${c.symbol}</span>
                    <span class="text-[11px] text-slate-400 block leading-tight mt-0.5">${c.name}</span>
                </div>
            </div>
            ${c.symbol === TX_WITHDRAW_STATE.selectedCoin ? '<span class="text-cyan-400 text-xs font-black">✓</span>' : ''}
        </button>
    `).join("");
}

function txSelectWithdrawCoin(symbol, advanceStep = true) {
    if (!symbol) {
        TX_WITHDRAW_STATE.selectedCoin = null;
        TX_WITHDRAW_STATE.selectedNetwork = null;
        const logoEl = document.getElementById("txWithCryptoSelectedCoinLogo");
        const nameEl = document.getElementById("txWithCryptoSelectedCoinName");
        const menuEl = document.getElementById("txWithCryptoCurrencyDropdownMenu");
        const chevronEl = document.getElementById("txWithCryptoCurrencyChevron");

        if (logoEl) logoEl.classList.add("hidden");
        if (nameEl) nameEl.innerHTML = `<span class="text-sm text-slate-400 font-normal">Select currency</span>`;
        if (menuEl) menuEl.classList.add("hidden");
        if (chevronEl) chevronEl.style.transform = "rotate(0deg)";

        txSetWithdrawCryptoStep(2);
        txRenderWithdrawCryptoCurrencyList();
        return;
    }

    const coin = TX_WITHDRAW_STATE.coins.find(c => c.symbol === symbol) || TX_WITHDRAW_STATE.coins[0];
    TX_WITHDRAW_STATE.selectedCoin = coin.symbol;
    TX_WITHDRAW_STATE.selectedNetwork = coin.networks[0] || "TRC20";

    const logoEl = document.getElementById("txWithCryptoSelectedCoinLogo");
    const nameEl = document.getElementById("txWithCryptoSelectedCoinName");
    const menuEl = document.getElementById("txWithCryptoCurrencyDropdownMenu");
    const chevronEl = document.getElementById("txWithCryptoCurrencyChevron");
    const amountSymEl = document.getElementById("txWithCryptoAmountSymbol");

    if (logoEl) {
        logoEl.classList.remove("hidden");
        logoEl.textContent = coin.icon;
    }
    if (nameEl) {
        nameEl.innerHTML = `<span class="text-sm font-bold text-white">${coin.symbol}</span> <span class="text-slate-400 font-normal text-xs ml-1">${coin.name}</span>`;
    }
    if (amountSymEl) amountSymEl.textContent = coin.symbol;

    if (menuEl) menuEl.classList.add("hidden");
    if (chevronEl) chevronEl.style.transform = "rotate(0deg)";

    txRenderWithdrawCryptoNetworks(coin.networks);
    txUpdateWithdrawAvailableBalances();
    txCalculateCryptoWithdrawalFee();
    txRenderWithdrawCryptoCurrencyList();

    if (advanceStep) {
        txSetWithdrawCryptoStep(3);
    }
}

function txRenderWithdrawCryptoNetworks(networks = []) {
    const pillsContainer = document.getElementById("txWithCryptoNetworkPills");
    const netLabel = document.getElementById("txWithCryptoSelectedNetworkLabel");
    if (!pillsContainer) return;

    if (netLabel) netLabel.textContent = TX_WITHDRAW_STATE.selectedNetwork;

    pillsContainer.innerHTML = networks.map(net => `
        <button type="button" data-network="${net}" onclick="txSelectWithdrawNetwork('${net}')" class="tx-with-net-pill ${net === TX_WITHDRAW_STATE.selectedNetwork ? 'active px-3.5 py-1.5 rounded-xl text-xs font-bold border border-cyan-400 bg-cyan-400/10 text-cyan-300' : 'px-3.5 py-1.5 rounded-xl text-xs font-bold border border-white/10 bg-[#181e2b] text-slate-300 hover:border-white/20 hover:text-white transition cursor-pointer'}">
            ${net}
        </button>
    `).join("");
}

function txSelectWithdrawNetwork(network) {
    TX_WITHDRAW_STATE.selectedNetwork = network;
    const coin = TX_WITHDRAW_STATE.coins.find(c => c.symbol === TX_WITHDRAW_STATE.selectedCoin);
    if (coin) {
        txRenderWithdrawCryptoNetworks(coin.networks);
    }
    const netLabel = document.getElementById("txWithCryptoSelectedNetworkLabel");
    if (netLabel) netLabel.textContent = network;
    txCalculateCryptoWithdrawalFee();
    txSetWithdrawCryptoStep(4);
}

function txCalculateCryptoWithdrawalFee() {
    const coin = TX_WITHDRAW_STATE.coins.find(c => c.symbol === TX_WITHDRAW_STATE.selectedCoin) || TX_WITHDRAW_STATE.coins[0];
    const net = (TX_WITHDRAW_STATE.selectedNetwork || "TRC20").toUpperCase();

    const feeSettings = WALLET_STATE.feeStructure?.runtime_settings?.withdrawal_fee || {};
    const enabled = feeSettings.enabled ?? false;
    const feeType = feeSettings.type || "fixed";
    const feeValue = Number(feeSettings.value || 0);
    const minFee = Number(feeSettings.min_fee_usdt || 0);
    const maxFee = Number(feeSettings.max_fee_usdt || 0);

    const netFees = feeSettings.network_fees || {};
    const configuredNetFee = netFees[net] !== undefined ? Number(netFees[net]) : null;
    const netFeeVal = (configuredNetFee !== null && !isNaN(configuredNetFee))
        ? configuredNetFee
        : (coin.networkFees ? (coin.networkFees[net] || 1) : 1);

    const amountInput = document.getElementById("txWithCryptoAmountInput");
    const sumAmountEl = document.getElementById("txWithCryptoSumAmount");
    const sumFeeEl = document.getElementById("txWithCryptoSumFee");
    const sumCompanyFeeEl = document.getElementById("txWithCryptoSumCompanyFee");
    const sumReceiveEl = document.getElementById("txWithCryptoSumReceive");

    const entered = parseFloat(amountInput?.value || 0);
    const networkFee = parseFloat(netFeeVal);

    let companyFee = 0;
    let companyFeeText = "0% (Free)";

    if (enabled && feeValue > 0) {
        if (feeType === "percentage") {
            companyFee = entered > 0 ? (entered * (feeValue / 100)) : 0;
            if (minFee > 0 && companyFee < minFee && entered > 0) companyFee = minFee;
            if (maxFee > 0 && companyFee > maxFee) companyFee = maxFee;
            companyFeeText = `${feeValue}% (${companyFee.toFixed(2)} ${coin.symbol})`;
        } else {
            companyFee = feeValue;
            if (minFee > 0 && companyFee < minFee && entered > 0) companyFee = minFee;
            if (maxFee > 0 && companyFee > maxFee) companyFee = maxFee;
            companyFeeText = `${companyFee.toFixed(2)} ${coin.symbol}`;
        }
    }

    const totalFee = networkFee + companyFee;
    const netReceive = Math.max(0, entered - totalFee);

    if (sumAmountEl) sumAmountEl.textContent = `${entered > 0 ? entered.toFixed(4) : "0.00"} ${coin.symbol}`;
    if (sumFeeEl) sumFeeEl.textContent = `${networkFee.toFixed(2)} ${coin.symbol}`;
    if (sumCompanyFeeEl) sumCompanyFeeEl.textContent = companyFeeText;
    if (sumReceiveEl) sumReceiveEl.textContent = `${entered > totalFee ? netReceive.toFixed(4) : "0.00"} ${coin.symbol}`;
}

function txWithCryptoSetMaxAmount() {
    const usdtWallet = WALLET_STATE?.wallet?.main_wallet_usdt || WALLET_STATE?.wallet?.main_wallet || {};
    const rawBalUSDT = typeof usdtWallet === "number" ? usdtWallet : (usdtWallet.available_balance ?? WALLET_STATE?.wallet?.available_balance ?? 0);
    const mainBalUSDT = typeof rawBalUSDT === "number" ? rawBalUSDT : (parseFloat(String(rawBalUSDT).replace(/[^0-9.-]/g, "")) || 0);
    const coin = TX_WITHDRAW_STATE.selectedCoin || "USDT";
    let max = 0;
    if (coin === "USDT") {
        max = mainBalUSDT;
    } else {
        const row = WALLET_STATE?.crypto_balances?.find(c => c.currency === coin || c.symbol === coin);
        max = row ? (typeof row.balance === "number" ? row.balance : (parseFloat(String(row.balance || 0).replace(/[^0-9.-]/g, "")) || 0)) : 0;
    }
    const amountInput = document.getElementById("txWithCryptoAmountInput");
    if (amountInput) {
        amountInput.value = max > 0 ? max : "";
        txCalculateCryptoWithdrawalFee();
    }
}

async function txSubmitCryptoWithdrawal() {
    const addressInput = document.getElementById("txWithCryptoAddressInput");
    const amountInput = document.getElementById("txWithCryptoAmountInput");
    const alertBox = document.getElementById("txWithCryptoAlertMessage");
    const submitBtn = document.getElementById("txWithCryptoSubmitBtn");

    if (!addressInput || !amountInput || !alertBox || !submitBtn) return;

    const address = addressInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const coin = TX_WITHDRAW_STATE.selectedCoin || "USDT";
    const net = TX_WITHDRAW_STATE.selectedNetwork || "TRC20";

    if (!address || address.length < 10) {
        alertBox.textContent = "Please enter a valid destination wallet address.";
        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
        alertBox.classList.remove("hidden");
        return;
    }

    if (isNaN(amount) || amount <= 0) {
        alertBox.textContent = `Please enter a valid withdrawal amount for ${coin}.`;
        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
        alertBox.classList.remove("hidden");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="animate-spin inline-block mr-2">◌</span> Processing Withdrawal...`;

    try {
        const payload = {
            currency: coin,
            crypto_asset: coin,
            network: net,
            crypto_network: net,
            amount: amount,
            withdrawal_address: address,
            crypto_address: address,
            address: address,
            withdrawal_method: "crypto_withdrawal",
            type: "crypto"
        };

        const resp = await apiRequest("/withdrawal/request", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (resp && (resp.success || resp.status === "success" || resp.data)) {
            alertBox.textContent = "✓ Crypto withdrawal request submitted! It is now queued for verification and automated blockchain transfer.";
            alertBox.className = "rounded-xl p-3 text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
            alertBox.classList.remove("hidden");

            addressInput.value = "";
            amountInput.value = "";
            txCalculateCryptoWithdrawalFee();

            if (typeof loadWalletData === "function") loadWalletData();
            if (typeof loadNavbarWalletBalance === "function") loadNavbarWalletBalance();
        } else {
            const errorMsg = (resp?.errors && (resp.errors.amount || resp.errors.wallet || resp.errors.crypto_network || resp.errors.withdrawal_address || resp.errors.kyc || resp.errors.withdrawal)) || resp?.message || "Withdrawal request failed. Please check your balance and try again.";
            alertBox.textContent = errorMsg;
            alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
            alertBox.classList.remove("hidden");
        }
    } catch (err) {
        alertBox.textContent = err?.message || "An error occurred while submitting your withdrawal request.";
        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
        alertBox.classList.remove("hidden");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Request Crypto Withdrawal</span>`;
    }
}

/* ==========================================================================
   WITHDRAW MONEY STEPPER CONTROLS (Fiat / INR / USD)
   ========================================================================== */
function txSetWithdrawMoneyStep(step) {
    if (step > 2 && !TX_WITHDRAW_STATE.selectedMoneyCurrency) {
        return; // Guard: Cannot jump to step 3/4 without selecting currency
    }
    TX_WITHDRAW_STATE.moneyStep = step;

    const dot2 = document.getElementById("txWithMoneyStep2Dot");
    const dot3 = document.getElementById("txWithMoneyStep3Dot");
    const dot4 = document.getElementById("txWithMoneyStep4Dot");

    const label2 = document.getElementById("txWithMoneyStep2Label");
    const label3 = document.getElementById("txWithMoneyStep3Label");
    const label4 = document.getElementById("txWithMoneyStep4Label");

    const body2 = document.getElementById("txWithMoneyStep2Body");
    const body3 = document.getElementById("txWithMoneyStep3Body");
    const body4 = document.getElementById("txWithMoneyStep4Body");

    if (step === 2) {
        if (dot2) {
            dot2.className = TX_WITHDRAW_STATE.selectedMoneyCurrency ? "tx-nexus-step-dot completed" : "tx-nexus-step-dot active";
            dot2.textContent = TX_WITHDRAW_STATE.selectedMoneyCurrency ? "✓" : "2";
        }
        if (dot3) { dot3.className = "tx-nexus-step-dot inactive"; dot3.textContent = "3"; }
        if (dot4) { dot4.className = "tx-nexus-step-dot inactive"; dot4.textContent = "4"; }

        if (label2) label2.className = "text-sm font-bold text-white block cursor-pointer";
        if (label3) label3.className = TX_WITHDRAW_STATE.selectedMoneyCurrency ? "text-sm font-bold text-slate-400 block cursor-pointer" : "text-sm font-bold text-slate-500 block cursor-not-allowed opacity-60";
        if (label4) label4.className = "text-sm font-bold text-slate-500 block cursor-not-allowed opacity-60";

        if (body2) body2.classList.remove("hidden");
        if (body3) body3.classList.add("hidden");
        if (body4) body4.classList.add("hidden");
    } else if (step === 3) {
        if (dot2) { dot2.className = "tx-nexus-step-dot completed"; dot2.textContent = "✓"; }
        if (dot3) {
            dot3.className = TX_WITHDRAW_STATE.selectedMoneyMethod ? "tx-nexus-step-dot completed" : "tx-nexus-step-dot active";
            dot3.textContent = TX_WITHDRAW_STATE.selectedMoneyMethod ? "✓" : "3";
        }
        if (dot4) { dot4.className = "tx-nexus-step-dot inactive"; dot4.textContent = "4"; }

        if (label2) label2.className = "text-sm font-bold text-white block cursor-pointer";
        if (label3) label3.className = "text-sm font-bold text-white block cursor-pointer";
        if (label4) label4.className = TX_WITHDRAW_STATE.selectedMoneyMethod ? "text-sm font-bold text-slate-400 block cursor-pointer" : "text-sm font-bold text-slate-500 block cursor-not-allowed opacity-60";

        if (body2) body2.classList.remove("hidden");
        if (body3) body3.classList.remove("hidden");
        if (body4) body4.classList.add("hidden");

        const verifyCard = document.getElementById("txWithMoneyVerifyCard");
        const verifiedInputs = document.getElementById("txWithMoneyVerifiedInputs");
        if (verifyCard) verifyCard.classList.add("hidden");
        if (verifiedInputs) verifiedInputs.classList.remove("hidden");
    } else if (step >= 4) {
        if (dot2) { dot2.className = "tx-nexus-step-dot completed"; dot2.textContent = "✓"; }
        if (dot3) { dot3.className = "tx-nexus-step-dot completed"; dot3.textContent = "✓"; }
        if (dot4) { dot4.className = "tx-nexus-step-dot active"; dot4.textContent = "4"; }

        if (label2) label2.className = "text-sm font-bold text-white block cursor-pointer";
        if (label3) label3.className = "text-sm font-bold text-white block cursor-pointer";
        if (label4) label4.className = "text-sm font-bold text-white block cursor-pointer";

        if (body2) body2.classList.remove("hidden");
        if (body3) body3.classList.remove("hidden");
        if (body4) body4.classList.remove("hidden");

        const verifyCard = document.getElementById("txWithMoneyVerifyCard");
        const verifiedInputs = document.getElementById("txWithMoneyVerifiedInputs");
        if (verifyCard) verifyCard.classList.add("hidden");
        if (verifiedInputs) verifiedInputs.classList.remove("hidden");

        const amountInput = document.getElementById("txWithMoneyAmountInput");
        if (amountInput) {
            setTimeout(() => {
                amountInput.focus();
            }, 100);
        }
    }
}

function txSelectWithdrawMoneyCurrency(currency = "INR", name = "INR (Indian Rupee)", advanceStep = true) {
    if (!currency) {
        TX_WITHDRAW_STATE.selectedMoneyCurrency = null;
        const nameEl = document.getElementById("txWithMoneySelectedCurrencyName");
        const menuEl = document.getElementById("txWithMoneyCurrencyDropdownMenu");
        const chevronEl = document.getElementById("txWithMoneyCurrencyChevron");

        if (nameEl) nameEl.innerHTML = `<span class="text-sm text-slate-400 font-normal">Select currency</span>`;
        if (menuEl) menuEl.classList.add("hidden");
        if (chevronEl) chevronEl.style.transform = "rotate(0deg)";

        txSetWithdrawMoneyStep(2);
        return;
    }

    TX_WITHDRAW_STATE.selectedMoneyCurrency = currency;

    const nameEl = document.getElementById("txWithMoneySelectedCurrencyName");
    const menuEl = document.getElementById("txWithMoneyCurrencyDropdownMenu");
    const chevronEl = document.getElementById("txWithMoneyCurrencyChevron");

    if (nameEl) nameEl.innerHTML = `<span class="text-sm font-bold text-white">${name}</span>`;
    if (menuEl) menuEl.classList.add("hidden");
    if (chevronEl) chevronEl.style.transform = "rotate(0deg)";

    txUpdateWithdrawAvailableBalances();

    if (advanceStep) {
        txSetWithdrawMoneyStep(3);
    }
}

function txSelectWithdrawMoneyMethod(method = "imps", name = "IMPS (Instant Bank Transfer)") {
    TX_WITHDRAW_STATE.selectedMoneyMethod = method;

    const displayContainer = document.getElementById("txWithMoneySelectedMethodDisplay");
    const menuEl = document.getElementById("txWithMoneyMethodDropdownMenu");
    const chevronEl = document.getElementById("txWithMoneyMethodChevron");

    const bankFields = document.getElementById("txWithMoneyBankFields");
    const upiField = document.getElementById("txWithMoneyUpiField");

    let iconHtml = `<div class="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-400/30 flex items-center justify-center font-bold text-xs shrink-0">IMPS</div>`;
    if (method === "upi") {
        iconHtml = `<div class="w-6 h-6 rounded-full bg-[#5f259f] flex items-center justify-center font-black text-xs text-white shrink-0">UPI</div>`;
        if (bankFields) bankFields.classList.add("hidden");
        if (upiField) upiField.classList.remove("hidden");
    } else {
        if (method === "neft") {
            iconHtml = `<div class="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 flex items-center justify-center font-bold text-xs shrink-0">🏦</div>`;
        }
        if (bankFields) bankFields.classList.remove("hidden");
        if (upiField) upiField.classList.add("hidden");
    }

    if (displayContainer) {
        displayContainer.innerHTML = `
            ${iconHtml}
            <span id="txWithMoneySelectedMethodName" class="text-sm font-bold text-white">${name}</span>
        `;
    }

    if (menuEl) menuEl.classList.add("hidden");
    if (chevronEl) chevronEl.style.transform = "rotate(0deg)";

    txSetWithdrawMoneyStep(4);
}

function txCalculateMoneyWithdrawalFee() {
    const feeSettings = WALLET_STATE.feeStructure?.runtime_settings?.withdrawal_fee || {};
    const enabled = feeSettings.enabled ?? false;
    const feeType = feeSettings.type || "fixed";
    const feeValue = Number(feeSettings.value || 0);
    const curr = TX_WITHDRAW_STATE.selectedMoneyCurrency || "INR";
    const sym = curr === "INR" ? "₹" : "$";

    const amountInput = document.getElementById("txWithMoneyAmountInput");
    const feeDisplayEl = document.getElementById("txWithMoneyFeeDisplay");
    const receiveDisplayEl = document.getElementById("txWithMoneyReceiveDisplay");

    const entered = parseFloat(amountInput?.value || 0);

    let feeAmount = 0;
    let feeLabelText = "0% (Free)";

    if (enabled && feeValue > 0) {
        if (feeType === "percentage") {
            feeAmount = entered > 0 ? (entered * (feeValue / 100)) : 0;
            feeLabelText = `${feeValue}% (${sym}${feeAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
        } else {
            feeAmount = feeValue;
            feeLabelText = `${sym}${feeValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
    }

    const netReceive = Math.max(0, entered - feeAmount);

    if (feeDisplayEl) {
        feeDisplayEl.textContent = feeLabelText;
    }
    if (receiveDisplayEl) {
        receiveDisplayEl.textContent = `${sym}${netReceive.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

function txWithMoneySetMaxAmount() {
    const usdtWallet = WALLET_STATE?.wallet?.main_wallet_usdt || WALLET_STATE?.wallet?.main_wallet || {};
    const rawBalUSDT = typeof usdtWallet === "number" ? usdtWallet : (usdtWallet.available_balance ?? WALLET_STATE?.wallet?.available_balance ?? 0);
    const mainBalUSDT = typeof rawBalUSDT === "number" ? rawBalUSDT : (parseFloat(String(rawBalUSDT).replace(/[^0-9.-]/g, "")) || 0);
    const inrWallet = WALLET_STATE?.wallet?.main_wallet_inr || {};
    const rawBalINR = typeof inrWallet === "number" ? inrWallet : (inrWallet.available_balance ?? (mainBalUSDT * 90));
    const mainBalINR = typeof rawBalINR === "number" ? rawBalINR : (parseFloat(String(rawBalINR).replace(/[^0-9.-]/g, "")) || 0);

    const curr = TX_WITHDRAW_STATE.selectedMoneyCurrency || "INR";
    const max = curr === "INR" ? mainBalINR : mainBalUSDT;

    const amountInput = document.getElementById("txWithMoneyAmountInput");
    if (amountInput) {
        amountInput.value = max > 0 ? max : "";
        txCalculateMoneyWithdrawalFee();
    }
}

async function txSubmitMoneyWithdrawal() {
    const holderNameInput = document.getElementById("txWithMoneyHolderName");
    const accountNoInput = document.getElementById("txWithMoneyAccountNo");
    const ifscInput = document.getElementById("txWithMoneyIfsc");
    const upiIdInput = document.getElementById("txWithMoneyUpiId");
    const amountInput = document.getElementById("txWithMoneyAmountInput");
    const alertBox = document.getElementById("txWithMoneyAlertMessage");
    const submitBtn = document.getElementById("txWithMoneySubmitBtn");

    if (!amountInput || !alertBox || !submitBtn) return;

    const amount = parseFloat(amountInput.value);
    const method = TX_WITHDRAW_STATE.selectedMoneyMethod || "imps";
    const currency = TX_WITHDRAW_STATE.selectedMoneyCurrency || "INR";

    if (isNaN(amount) || amount < 500) {
        alertBox.textContent = "Minimum withdrawal amount is ₹500 INR.";
        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
        alertBox.classList.remove("hidden");
        return;
    }

    const holderName = holderNameInput ? holderNameInput.value.trim() : "";
    const accountNo = accountNoInput ? accountNoInput.value.trim() : "";
    const ifsc = ifscInput ? ifscInput.value.trim().toUpperCase() : "";
    const upiId = upiIdInput ? upiIdInput.value.trim() : "";

    if (method === "upi") {
        if (!upiId || !upiId.includes("@")) {
            alertBox.textContent = "Please enter a valid UPI ID (e.g., yourname@okhdfcbank).";
            alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
            alertBox.classList.remove("hidden");
            return;
        }
    } else {
        if (!accountNo || accountNo.length < 8) {
            alertBox.textContent = "Please enter a valid bank account number.";
            alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
            alertBox.classList.remove("hidden");
            return;
        }
        if (!ifsc || ifsc.length < 8) {
            alertBox.textContent = "Please enter a valid 11-character IFSC code.";
            alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
            alertBox.classList.remove("hidden");
            return;
        }
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="animate-spin inline-block mr-2">◌</span> Processing Withdrawal...`;

    try {
        const payload = {
            currency: currency,
            amount: amount,
            payment_method: method,
            account_holder_name: holderName,
            account_number: accountNo,
            ifsc_code: ifsc,
            upi_id: upiId,
            withdrawal_address: method === "upi" ? upiId : `${accountNo} (${ifsc})`,
            type: "fiat"
        };

        const resp = await apiRequest("/withdrawal/request", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (resp && (resp.success || resp.status === "success" || resp.data)) {
            alertBox.textContent = "✓ Bank withdrawal request submitted successfully! Funds will be transferred via IMPS/UPI upon approval.";
            alertBox.className = "rounded-xl p-3 text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
            alertBox.classList.remove("hidden");

            amountInput.value = "";
            if (holderNameInput) holderNameInput.value = "";
            if (accountNoInput) accountNoInput.value = "";
            if (ifscInput) ifscInput.value = "";
            if (upiIdInput) upiIdInput.value = "";
            txCalculateMoneyWithdrawalFee();

            if (typeof loadWalletData === "function") loadWalletData();
            if (typeof loadNavbarWalletBalance === "function") loadNavbarWalletBalance();
        } else {
            alertBox.textContent = resp?.message || "Withdrawal request failed. Please check your balance and try again.";
            alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
            alertBox.classList.remove("hidden");
        }
    } catch (err) {
        alertBox.textContent = err?.message || "An error occurred while submitting your withdrawal request.";
        alertBox.className = "rounded-xl p-3 text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30";
        alertBox.classList.remove("hidden");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Request Money Withdrawal</span>`;
    }
}

// Global Exports
window.txSwitchNexusSubTab = txSwitchNexusSubTab;
window.txInitWithdrawView = txInitWithdrawView;
window.txSwitchWithdrawMode = txSwitchWithdrawMode;
window.txSetWithdrawCryptoStep = txSetWithdrawCryptoStep;
window.txSetWithdrawMoneyStep = txSetWithdrawMoneyStep;
window.txSelectWithdrawCoin = txSelectWithdrawCoin;
window.txSelectWithdrawNetwork = txSelectWithdrawNetwork;
window.txSelectWithdrawMoneyCurrency = txSelectWithdrawMoneyCurrency;
window.txSelectWithdrawMoneyMethod = txSelectWithdrawMoneyMethod;
window.txWithCryptoSetMaxAmount = txWithCryptoSetMaxAmount;
window.txWithMoneySetMaxAmount = txWithMoneySetMaxAmount;
window.txCalculateCryptoWithdrawalFee = txCalculateCryptoWithdrawalFee;
window.txCalculateMoneyWithdrawalFee = txCalculateMoneyWithdrawalFee;
window.txSubmitCryptoWithdrawal = txSubmitCryptoWithdrawal;
window.txSubmitMoneyWithdrawal = txSubmitMoneyWithdrawal;
window.txCheckUserKycForWithdraw = txCheckUserKycForWithdraw;

// Deposit exports
window.txInitDepositView = txInitDepositView;
window.txSwitchDepositMode = txSwitchDepositMode;
window.txSelectDepositCoin = txSelectDepositCoin;
window.txSelectDepositNetwork = txSelectDepositNetwork;
window.txSelectDepositDestination = txSelectDepositDestination;
window.txRenderDepositAccountOptions = txRenderDepositAccountOptions;
window.txCheckUserKycForDeposit = txCheckUserKycForDeposit;
window.txSetDepositStep = txSetDepositStep;
window.txSetMoneyDepositStep = txSetMoneyDepositStep;
window.txSelectMoneyAccount = txSelectMoneyAccount;
window.txSelectMoneyPaymentMethod = txSelectMoneyPaymentMethod;
window.txCopyMoneyUpi = txCopyMoneyUpi;
window.txToggleNexusFaq = txToggleNexusFaq;
window.txUpdateNexusFaq = txUpdateNexusFaq;

"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Options Terminal - Backend Connected
|--------------------------------------------------------------------------
| UI stays the same. Orders, positions, fills, wallet checks, cancel and
| close actions use Flask + MongoDB APIs. Browser localStorage demo order
| storage is intentionally not used for trading state.
*/

const TX_OPTIONS_API_BASE = "/options";
const TX_OPTIONS_PRICE_POLL_MS = 1000;
const TX_OPTIONS_WALLET_POLL_MS = 15000;
const TX_OPTIONS_SHORT_MARGIN_MULTIPLIER = 2;
const TX_OPTIONS_WS_BASE = "wss://stream.binance.com:9443/stream?streams=";
const TX_OPTIONS_INDEX_WS_BASE = "wss://fstream.binance.com/stream?streams=";
const TX_OPTIONS_BINANCE_REST_BASE = "https://api.binance.com";
const TX_OPTIONS_UI_THROTTLE_MS = 100;
const TX_OPTIONS_TICKER_RENDER_MS = 250;

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
        "SOL": `<svg viewBox="0 0 32 32" class="coin-logo-svg ${sizeClass} rounded-full shadow-md"><circle cx="16" cy="16" r="16" fill="#12141d"/><defs><linearGradient id="solGrad_opt_${sizeClass.replace(/[^a-zA-Z0-9]/g, '_')}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00ffa3"/><stop offset="100%" stop-color="#dc1fff"/></linearGradient></defs><path fill="url(#solGrad_opt_${sizeClass.replace(/[^a-zA-Z0-9]/g, '_')})" d="M8 20.7l2.1-2.1h13.9l-2.1 2.1H8zm5.9-6.3l-2.1 2.1h13.9l2.1-2.1H13.9zM8 9.3l2.1-2.1h13.9l-2.1 2.1H8z"/></svg>`,
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

    // Dynamic fallback SVG
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
            <linearGradient id="coinGrad_opt_${safeStr}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="hsl(${hue}, 80%, 45%)"/>
                <stop offset="100%" stop-color="hsl(${(hue + 45) % 360}, 90%, 25%)"/>
            </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="16" fill="url(#coinGrad_opt_${safeStr})"/>
        <circle cx="16" cy="16" r="14.5" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
        <text x="16" y="20.5" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="-0.3">${label}</text>
    </svg>`;
}
window.getCoinLogoSvg = getCoinLogoSvg;

const underlyings = {
    BTC: {
        code: "BTC",
        title: "BTC-USDT Options",
        symbol: "BTCUSDT",
        icon: "₿",
        badgeBg: "rgba(245, 158, 11, 0.15)",
        badgeBorder: "rgba(245, 158, 11, 0.5)",
        badgeColor: "#f59e0b",
        step: 500,
        contractSize: "0.001 BTC",
        fallbackPrice: 64200,
        baseIv: 61,
        minPremium: 18,
        priceDecimals: 3
    },
    ETH: {
        code: "ETH",
        title: "ETH-USDT Options",
        symbol: "ETHUSDT",
        icon: "Ξ",
        badgeBg: "rgba(99, 102, 241, 0.15)",
        badgeBorder: "rgba(99, 102, 241, 0.5)",
        badgeColor: "#818cf8",
        step: 100,
        contractSize: "0.01 ETH",
        fallbackPrice: 3550,
        baseIv: 54,
        minPremium: 4,
        priceDecimals: 3
    },
    SOL: {
        code: "SOL",
        title: "SOL-USDT Options",
        symbol: "SOLUSDT",
        icon: "S",
        badgeBg: "rgba(168, 85, 247, 0.15)",
        badgeBorder: "rgba(168, 85, 247, 0.5)",
        badgeColor: "#c084fc",
        step: 5,
        contractSize: "0.1 SOL",
        fallbackPrice: 145,
        baseIv: 68,
        minPremium: 0.5,
        priceDecimals: 3
    }
};

const tickerItems = [
    { symbol: "BTCUSDT", label: "BTC-USDT", icon: "₿" },
    { symbol: "ETHUSDT", label: "ETH-USDT", icon: "Ξ" },
    { symbol: "SOLUSDT", label: "SOL-USDT", icon: "S" },
    { symbol: "BNBUSDT", label: "BNB-USDT", icon: "B" },
    { symbol: "DOGEUSDT", label: "DOGE-USDT", icon: "Ð" },
    { symbol: "XRPUSDT", label: "XRP-USDT", icon: "✕" },
    { symbol: "ADAUSDT", label: "ADA-USDT", icon: "₳" },
    { symbol: "AVAXUSDT", label: "AVAX-USDT", icon: "A" }
];

const tickerFallback = {
    BTCUSDT: 64200,
    ETHUSDT: 3550,
    SOLUSDT: 145,
    BNBUSDT: 580,
    DOGEUSDT: 0.12,
    XRPUSDT: 0.58,
    ADAUSDT: 0.45,
    AVAXUSDT: 28
};

const state = {
    activeUnderlying: "BTC",
    activeSide: "CALL",
    activeAction: "BUY",
    activeOrderType: "MARKET",
    expiryDays: 1,
    underlyingPrice: underlyings.BTC.fallbackPrice,
    change24h: 0,
    volume24h: 0,
    selectedStrike: null,
    selectedOption: null,
    chain: [],
    bookView: "both",
    bottomTab: "positions",
    orderHistoryPage: 1,
    fillsPage: 1,
    chainViewMode: "prices",
    mobileActiveSide: "CALL",
    trades: [],
    liveTickers: {},
    liveIndexPrices: {},
    lastPriceRenderAt: 0,
    lastTickerRenderAt: 0,
    terminalCache: {
        positions: [],
        openOrders: [],
        conditionalOrders: [],
        fills: [],
        orderHistory: []
    },
    wallet: {
        loaded: false,
        loading: false,
        availableBalance: 0,
        lockedBalance: 0,
        totalBalance: 0,
        currency: "USDT",
        error: null
    },
    timers: {
        countdown: null,
        pricePoll: null,
        walletPoll: null,
        tickerPoll: null,
        priceSocket: null,
        reconnectSocket: null,
        trades: null
    }
};

const el = {
    tickerStrip: document.getElementById("optionsTickerStrip"),
    coinBadge: document.getElementById("optionsCoinBadge"),
    underlyingSelect: document.getElementById("optionsUnderlyingSelect"),
    selectedTitle: document.getElementById("selectedOptionsTitle"),
    backendBadge: document.getElementById("optionsBackendModeBadge"),
    chainSubText: document.getElementById("chainSubText"),
    underlyingPrice: document.getElementById("underlyingPrice"),
    optionsChange: document.getElementById("optionsChange"),
    optionsVolume: document.getElementById("optionsVolume"),
    atmStrike: document.getElementById("atmStrike"),
    expiryCountdown: document.getElementById("expiryCountdown"),
    ivRank: document.getElementById("ivRank"),
    totalOpenInterest: document.getElementById("totalOpenInterest"),
    expiryTabs: document.getElementById("expiryTabs"),
    strikeSearch: document.getElementById("strikeSearchInput"),
    resetChainBtn: document.getElementById("resetChainBtn"),
    chainBody: document.getElementById("optionsChainBody"),
    mobileTableBody: document.getElementById("optionsMobileTableBody"),
    selectedContract: document.getElementById("selectedOptionContract"),
    selectedPremium: document.getElementById("selectedOptionPremium"),
    greeksBadge: document.getElementById("greeksTypeBadge"),
    delta: document.getElementById("deltaValue"),
    gamma: document.getElementById("gammaValue"),
    theta: document.getElementById("thetaValue"),
    vega: document.getElementById("vegaValue"),
    bookTab: document.getElementById("orderBookTabBtn"),
    tradesTab: document.getElementById("tradesTabBtn"),
    bookPanel: document.getElementById("optionsOrderBookPanel"),
    tradesPanel: document.getElementById("optionsTradesPanel"),
    asks: document.getElementById("optionsOrderBookAsks"),
    bids: document.getElementById("optionsOrderBookBids"),
    mid: document.getElementById("optionsOrderBookMid"),
    bookSizeLabel: document.getElementById("optionBookSizeLabel"),
    tradesList: document.getElementById("optionsTradesList"),
    contractSizeText: document.getElementById("contractSizeText"),
    sideBuy: document.getElementById("optionSideBuy"),
    sideSell: document.getElementById("optionSideSell"),
    limitPrice: document.getElementById("optionLimitPrice"),
    stopWrap: document.getElementById("optionStopWrap"),
    stopPrice: document.getElementById("optionStopPrice"),
    quantity: document.getElementById("optionsQuantity"),
    bracketCheck: document.getElementById("bracketOrderCheck"),
    bracketFields: document.getElementById("bracketFields"),
    takeProfit: document.getElementById("takeProfitPrice"),
    stopLoss: document.getElementById("stopLossPrice"),
    premiumPreview: document.getElementById("premiumPreview"),
    costPreview: document.getElementById("costPreview"),
    fundsRequired: document.getElementById("fundsRequired"),
    placeOrderBtn: document.getElementById("optionPlaceOrderBtn"),
    terminalTable: document.getElementById("optionsTerminalTable")
};

function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value, decimals = 2) {
    return number(value, 0).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatCompact(value) {
    const parsed = number(value, 0);

    if (Math.abs(parsed) >= 1000000) {
        return `${formatNumber(parsed / 1000000, 2)}M`;
    }

    if (Math.abs(parsed) >= 1000) {
        return `${formatNumber(parsed / 1000, 2)}K`;
    }

    return formatNumber(parsed, 2);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function pseudo(seed) {
    const text = String(seed);
    let hash = 0;

    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    }

    const x = Math.sin(hash) * 10000;
    return x - Math.floor(x);
}

function getConfig() {
    return underlyings[state.activeUnderlying] || underlyings.BTC;
}

function isBackendReady() {
    return typeof apiRequest === "function";
}

function isBackendLoggedIn() {
    return typeof isLoggedIn === "function" && isLoggedIn();
}

function backendError(error, fallback = "Options backend request failed.") {
    if (typeof showApiError === "function") {
        return showApiError(error, fallback);
    }

    return error?.message || fallback;
}

function statusLabel(status) {
    return String(status || "").replace(/_/g, " ").toUpperCase();
}

function showMessage(message, type = "success") {
    let box = document.getElementById("optionsMiniMessage");

    if (!box) {
        box = document.createElement("div");
        box.id = "optionsMiniMessage";
        document.body.appendChild(box);
    }

    box.className = type === "error" ? "os-toast error" : "os-toast success";
    if (message.includes("<a") || message.includes("</")) {
        box.innerHTML = message;
    } else {
        box.textContent = message;
    }
    box.style.opacity = "1";
    box.style.transform = "translateY(0)";

    window.clearTimeout(showMessage._timer);
    showMessage._timer = window.setTimeout(() => {
        box.style.opacity = "0";
        box.style.transform = "translateY(14px)";
    }, type === "error" ? 6000 : 2600);
}

function isOptionsKycRequired(error) {
    const errors = error?.errors || {};
    const message = `${error?.message || ""} ${Object.values(errors).join(" ")}`.toLowerCase();
    return Boolean(errors.kyc_required || errors.kyc || message.includes("kyc") || message.includes("identity verification"));
}


/* =========================
   INSTANT OPTIONS EXECUTION UX
   - Optimistic table update on click
   - Success side message after backend confirms
   - Close sound after successful close
========================= */
function bindOptionTerminalActions() {
    if (!el.terminalTable) {
        return;
    }

    el.terminalTable.querySelectorAll("[data-cancel-option-order]").forEach((button) => {
        button.addEventListener("click", () => cancelOptionOrder(button.getAttribute("data-cancel-option-order")));
    });

    el.terminalTable.querySelectorAll("[data-close-option-position]").forEach((button) => {
        button.addEventListener("click", () => closeOptionPosition(
            button.getAttribute("data-close-option-position"),
            number(button.getAttribute("data-close-option-mark"), 0)
        ));
    });

    el.terminalTable.querySelectorAll("[data-close-all-option-positions]").forEach((button) => {
        button.addEventListener("click", closeAllOptionPositions);
    });
}

function renderCachedTerminalNow() {
    if (!el.terminalTable || !isBackendLoggedIn()) {
        return;
    }

    if (state.bottomTab === "positions") {
        el.terminalTable.innerHTML = renderBackendPositionsTable(state.terminalCache.positions || []);
        bindOptionTerminalActions();
        return;
    }

    if (state.bottomTab === "openOrders") {
        el.terminalTable.innerHTML = renderBackendOrdersTable(state.terminalCache.openOrders || [], "No backend open option orders.");
        bindOptionTerminalActions();
        return;
    }
}

function optimisticOptionPosition(payload) {
    const entryPrice = number(payload.price, getBestOptionPrice());
    const qty = number(payload.quantity, getQty());
    const margin = getRequiredFunds();

    return {
        id: `optimistic-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
        position_reference: "OPENING...",
        entry_order_reference: "INSTANT",
        contract: payload.contract,
        underlying: payload.underlying,
        action: payload.action,
        option_side: payload.option_side,
        strike: payload.strike,
        expiry_code: payload.expiry_code,
        quantity: qty,
        entry_price: entryPrice,
        margin_amount: margin,
        wallet_locked_amount: margin,
        status: "open",
        opened_at: new Date().toISOString(),
        _optimistic: true
    };
}

function optimisticOptionOrder(payload) {
    return {
        id: `optimistic-order-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
        order_reference: "OPENING...",
        contract: payload.contract,
        action: payload.action,
        option_side: payload.option_side,
        order_type: payload.order_type,
        price: payload.price,
        quantity: payload.quantity,
        status: "open",
        created_at: new Date().toISOString(),
        _optimistic: true
    };
}

function playOptionCloseSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            return;
        }

        const ctx = playOptionCloseSound._ctx || new AudioContext();
        playOptionCloseSound._ctx = ctx;

        if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;
        const gain = ctx.createGain();
        const first = ctx.createOscillator();
        const second = ctx.createOscillator();

        first.type = "sine";
        second.type = "sine";
        first.frequency.setValueAtTime(740, now);
        second.frequency.setValueAtTime(980, now + 0.055);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.18, now + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        first.connect(gain);
        second.connect(gain);
        gain.connect(ctx.destination);

        first.start(now);
        first.stop(now + 0.12);
        second.start(now + 0.055);
        second.stop(now + 0.22);
    } catch (error) {
        console.warn("Close sound unavailable:", error);
    }
}

function refreshOptionsStateInBackground() {
    loadWalletBalance(true).catch(() => {});

    if (state.bottomTab === "positions") {
        backendGet("/positions")
            .then((data) => {
                state.terminalCache.positions = data.positions || [];
                renderCachedTerminalNow();
            })
            .catch(() => {});
    }
}


function showLoginExpiredNoticeIfNeeded() {
    const params = new URLSearchParams(window.location.search);

    if (params.get("expired") === "1") {
        showMessage("Session expired. Please log in again to continue trading.", "error");
    }
}

function activateGroup(buttons, activeButton) {
    buttons.forEach((button) => button.classList.remove("active"));
    activeButton.classList.add("active");
}

function getExpiryDate(days = state.expiryDays) {
    const date = new Date();
    date.setDate(date.getDate() + Number(days || 1));
    date.setHours(17, 30, 0, 0);
    return date;
}

function formatExpiryCode() {
    const date = getExpiryDate();
    const day = String(date.getDate()).padStart(2, "0");
    const month = date.toLocaleString("en-US", { month: "short" }).toUpperCase();
    return `${day}${month}`;
}

function getAtmStrike(price = state.underlyingPrice) {
    const step = getConfig().step;
    return Math.round(number(price, getConfig().fallbackPrice) / step) * step;
}

function getAvailableMarginNode() {
    const marginBox = document.querySelector(".os-margin-box");
    const rows = marginBox ? marginBox.querySelectorAll("div") : [];
    return rows[0]?.querySelector("strong") || null;
}

function formatMoney(value, currency = state.wallet.currency || "USDT") {
    return `$${formatNumber(value, 2)}`;
}

function normalizeProviderSymbol(symbol) {
    const value = String(symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (value === "BTC") return "BTCUSDT";
    if (value === "ETH") return "ETHUSDT";
    if (value === "SOL") return "SOLUSDT";
    return value;
}

function underlyingCodeFromSymbol(symbol) {
    const normalized = normalizeProviderSymbol(symbol);
    if (normalized.includes("SOL")) return "SOL";
    if (normalized.includes("ETH")) return "ETH";
    return "BTC";
}

function getTickerCache(symbol) {
    const key = normalizeProviderSymbol(symbol);
    return state.liveTickers[key] || null;
}

function getUnderlyingPriceForCode(code) {
    const config = underlyings[code] || underlyings.BTC;
    const cached = getTickerCache(config.symbol);
    return number(cached?.price, config.fallbackPrice);
}

function decimalsForPrice(price) {
    const config = getConfig();
    if (config && config.priceDecimals) return config.priceDecimals;
    return number(price, 0) < 1 ? 4 : 3;
}

function getSelectedOption() {
    const row = state.chain.find((item) => Number(item.strike) === Number(state.selectedStrike)) || state.chain[0];
    return state.activeSide === "CALL" ? row?.call : row?.put;
}

function getBestOptionPrice() {
    const selected = getSelectedOption();

    if (!selected) {
        return 0;
    }

    return state.activeAction === "BUY" ? selected.ask : selected.bid;
}

function getInputPrice() {
    if (state.activeOrderType === "MARKET") {
        return getBestOptionPrice();
    }

    return number(el.limitPrice?.value, 0);
}

function setLimitPriceToExecutable(force = false) {
    if (!el.limitPrice || state.activeOrderType === "MARKET") {
        return;
    }

    const selected = getSelectedOption();
    if (!selected) {
        return;
    }

    const executablePrice = getBestOptionPrice();
    const current = number(el.limitPrice.value, 0);
    const focused = document.activeElement === el.limitPrice;

    if (force || current <= 0 || !focused) {
        el.limitPrice.value = formatNumber(executablePrice, 2).replace(/,/g, "");
    }
}

function activateBottomTab(tabName = "positions") {
    state.bottomTab = tabName;
    document.querySelectorAll("[data-bottom-tab]").forEach((button) => {
        button.classList.toggle("active", button.getAttribute("data-bottom-tab") === tabName);
    });
}

function getQty() {
    return Math.max(1, Math.floor(number(el.quantity?.value, 1)));
}

function getRequiredFunds() {
    const notional = Math.max(0, getInputPrice() * getQty());

    if (state.activeAction === "SELL") {
        return Math.max(notional * TX_OPTIONS_SHORT_MARGIN_MULTIPLIER, notional);
    }

    return notional;
}

function getOptionNotional() {
    return Math.max(0, getInputPrice() * getQty());
}

function updateBackendBadge() {
    if (!el.backendBadge) {
        return;
    }

    if (!isBackendReady()) {
        el.backendBadge.textContent = "Backend API config missing";
        el.backendBadge.className = "mt-2 inline-flex rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-[11px] font-black text-red-300";
        return;
    }

    if (isBackendLoggedIn()) {
        el.backendBadge.textContent = "Backend + MongoDB connected";
        el.backendBadge.className = "mt-2 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-black text-emerald-300";
        return;
    }

    el.backendBadge.textContent = "Login required for backend orders";
    el.backendBadge.className = "mt-2 inline-flex rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[11px] font-black text-orange-300";
}

function applyWallet(wallet) {
    if (!wallet || typeof wallet !== "object") {
        return false;
    }

    const selectedCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
    const mainWallet = selectedCurrency === "INR" ? (wallet.main_wallet_inr || {}) : (wallet.main_wallet_usdt || {});

    state.wallet.rawWallet = wallet;
    state.wallet.primaryCurrency = selectedCurrency;
    state.wallet.availableBalance = number(wallet.trading_wallet?.available_balance ?? wallet.available_balance, 0);
    state.wallet.lockedBalance = number(wallet.trading_wallet?.locked_balance ?? wallet.locked_balance, 0);
    state.wallet.totalBalance = number(wallet.trading_wallet?.total_balance ?? wallet.total_balance, state.wallet.availableBalance + state.wallet.lockedBalance);
    state.wallet.currency = wallet.currency === "INR" ? "USDT" : (wallet.currency || "USDT");
    state.wallet.loaded = true;
    state.wallet.loading = false;
    state.wallet.error = null;

    // Update the header Trading Wallet card elements
    const totalBalNode = document.getElementById("optionsTotalBalance");
    const estBalNode = document.getElementById("optionsEstimatedBalance");
    
    if (totalBalNode) {
        const tradingBal = wallet.trading_wallet ? number(wallet.trading_wallet.available_balance, 0) : state.wallet.availableBalance;
        totalBalNode.textContent = "$" + formatNumber(tradingBal, 2);
    }
    if (estBalNode) {
        const mainBal = number(mainWallet.available_balance, 0);
        const symbol = selectedCurrency === "INR" ? "₹" : "$";
        estBalNode.textContent = symbol + formatNumber(mainBal, 2);
    }

    const mobTradBal = document.getElementById("optionsMobileTradingBalance");
    const mobMainBal = document.getElementById("optionsMobileMainBalance");
    if (mobTradBal && totalBalNode) mobTradBal.textContent = totalBalNode.textContent;
    if (mobMainBal && estBalNode) mobMainBal.textContent = estBalNode.textContent;

    renderWalletBox();
    updateOptionsWalletModalBalances();
    return true;
}

function applyWalletFromResponse(response) {
    const data = response?.data || response || {};
    return applyWallet(data.wallet || data.wallet_balance_after || null);
}

function renderWalletBox() {
    const availableNode = getAvailableMarginNode();
    const requiredNode = el.fundsRequired;
    const required = getRequiredFunds();
    const available = number(state.wallet.availableBalance, 0);
    const hasEnough = !state.wallet.loaded || available >= required;

    if (availableNode) {
        if (!isBackendLoggedIn()) {
            availableNode.textContent = "Login required";
            availableNode.className = "text-orange-300";
        } else if (state.wallet.loading && !state.wallet.loaded) {
            availableNode.textContent = "Loading...";
            availableNode.className = "";
        } else if (state.wallet.loaded) {
            availableNode.textContent = formatMoney(available);
            availableNode.className = hasEnough ? "" : "text-red-400";
        } else {
            availableNode.textContent = "Wallet unavailable";
            availableNode.className = "text-orange-300";
        }
    }

    if (requiredNode) {
        requiredNode.textContent = formatMoney(required);
        requiredNode.className = hasEnough ? "" : "text-red-400";
    }

    const estMarginNode = document.getElementById("walletEstMargin");
    if (estMarginNode) {
        estMarginNode.textContent = `${formatNumber(required, 2)} USD`;
    }
}

async function loadWalletBalance(silent = true) {
    if (!isBackendReady() || !isBackendLoggedIn()) {
        state.wallet.loaded = false;
        state.wallet.loading = false;
        state.wallet.error = null;
        renderWalletBox();
        return null;
    }

    try {
        state.wallet.loading = true;
        renderWalletBox();
        const activeSubId = localStorage.getItem("traidiumx_active_user_id");
        const subParam = (activeSubId && activeSubId !== "main") ? `&sub_account_id=${encodeURIComponent(activeSubId)}` : "";
        const response = await apiRequest(`/wallet/balance?_=${Date.now()}${subParam}`);
        const wallet = response?.data?.wallet || response?.data || {};
        applyWallet(wallet);
        return wallet;
    } catch (error) {
        console.warn("Options wallet balance load failed:", error);
        state.wallet.loaded = false;
        state.wallet.loading = false;
        state.wallet.error = backendError(error, "Wallet balance unavailable.");
        renderWalletBox();

        if (!silent) {
            showMessage(state.wallet.error, "error");
        }

        return null;
    } finally {
        state.wallet.loading = false;
    }
}

function validateWallet() {
    if (!isBackendLoggedIn()) {
        return true;
    }

    const required = getRequiredFunds();
    const available = number(state.wallet.availableBalance, 0);

    if (!state.wallet.loaded) {
        showMessage("Wallet balance is not loaded. Please refresh and try again.", "error");
        loadWalletBalance(true);
        return false;
    }

    if (required > available) {
        showMessage(`Insufficient balance. Required ${formatMoney(required)}, available ${formatMoney(available)}.`, "error");
        renderWalletBox();
        return false;
    }

    return true;
}

async function backendGet(endpoint) {
    const response = await apiRequest(`${TX_OPTIONS_API_BASE}${endpoint}`);
    return response?.data || {};
}

async function backendPost(endpoint, payload = {}) {
    const response = await apiRequest(`${TX_OPTIONS_API_BASE}${endpoint}`, {
        method: "POST",
        body: JSON.stringify(payload || {})
    });
    return response?.data || {};
}

function tickerValueFromPayload(response) {
    let data = response?.data || response || {};

    if (data?.ticker) data = data.ticker;
    if (data?.data) data = data.data;

    // Prioritize c (lastPrice), last_price, mark_price before p (which can be 24h priceChange in 24hr ticker REST payload)
    const rawPrice = data.last_price ?? data.lastPrice ?? data.c ?? data.mark_price ?? data.markPrice ?? data.price ?? (data.e === "aggTrade" ? data.p : null);
    const price = number(rawPrice, 0);
    const change = number(data.price_change_percent ?? data.priceChangePercent ?? data.change_percent ?? data.P, 0);
    const volume = number(data.quote_volume ?? data.quoteVolume ?? data.volume ?? data.q, 0);

    return { price, change, volume };
}

async function fetchDirectBinanceTicker(symbol) {
    const normalizedSymbol = normalizeProviderSymbol(symbol);

    if (!normalizedSymbol) {
        return null;
    }

    try {
        const response = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${encodeURIComponent(normalizedSymbol)}&_=${Date.now()}`, {
            method: "GET",
            cache: "no-store"
        });

        if (response.ok) {
            const data = await response.json();
            const indexPrice = number(data.indexPrice ?? data.markPrice, 0);

            if (Number.isFinite(indexPrice) && indexPrice > 0) {
                return { price: indexPrice, isIndex: true, change: 0, volume: 0 };
            }
        }
    } catch (error) {
        console.warn(`Direct Binance premium index fetch failed for ${normalizedSymbol}:`, error);
    }

    try {
        const response = await fetch(`${TX_OPTIONS_BINANCE_REST_BASE}/api/v3/ticker/24hr?symbol=${encodeURIComponent(normalizedSymbol)}&_=${Date.now()}`, {
            method: "GET",
            cache: "no-store"
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        const ticker = tickerValueFromPayload(data);

        if (!Number.isFinite(ticker.price) || ticker.price <= 0) {
            return null;
        }

        return ticker;
    } catch (error) {
        console.warn(`Direct Binance ticker failed for ${normalizedSymbol}:`, error);
        return null;
    }
}

function cacheTicker(symbol, ticker = {}) {
    const key = normalizeProviderSymbol(symbol || ticker.s || ticker.symbol || ticker.provider_symbol);
    if (!key) return null;

    const existing = state.liveTickers[key] || {};
    const fallback = tickerFallback[key] || underlyings[underlyingCodeFromSymbol(key)]?.fallbackPrice || 0;
    
    const isAggTrade = ticker.e === "aggTrade" || Boolean(ticker.a || ticker.f);
    const rawPrice = ticker.c ?? ticker.last_price ?? ticker.lastPrice ?? ticker.mark_price ?? ticker.markPrice ?? ticker.price ?? (isAggTrade ? ticker.p : null);
    
    let price = number(rawPrice, 0);
    // Sanity check: spot price must be positive.
    if (!Number.isFinite(price) || price <= 0) {
        price = existing.price && existing.price > 0 ? existing.price : fallback;
    }

    const change = number(ticker.change ?? ticker.price_change_percent ?? ticker.priceChangePercent ?? ticker.change_percent ?? ticker.P, existing.change || 0);
    const volume = number(ticker.volume ?? ticker.quote_volume ?? ticker.quoteVolume ?? ticker.q, existing.volume || 0);

    state.liveTickers[key] = {
        symbol: key,
        price,
        change,
        volume,
        updatedAt: Date.now()
    };

    return state.liveTickers[key];
}

function primeTickerFallbacks() {
    tickerItems.forEach((item) => {
        if (!getTickerCache(item.symbol)) {
            cacheTicker(item.symbol, {
                price: tickerFallback[item.symbol] || 0,
                change: 0,
                volume: 0
            });
        }
    });

    Object.values(underlyings).forEach((config) => {
        if (!getTickerCache(config.symbol)) {
            cacheTicker(config.symbol, {
                price: config.fallbackPrice,
                change: 0,
                volume: 0
            });
        }
    });
}

function applyUnderlyingTicker(symbol, ticker, forceRender = false) {
    const cached = cacheTicker(symbol, ticker);
    if (!cached || !cached.price || cached.price <= 0) return false;

    const config = getConfig();
    const activeSymbol = normalizeProviderSymbol(config.symbol);

    if (normalizeProviderSymbol(cached.symbol) !== activeSymbol) {
        return false;
    }

    if (ticker.isIndex || Boolean(ticker.indexPrice)) {
        state.liveIndexPrices[activeSymbol] = cached.price;
    }

    const indexPrice = state.liveIndexPrices[activeSymbol];
    const targetPrice = indexPrice && indexPrice > 0 ? indexPrice : cached.price;
    const previous = number(state.underlyingPrice, config.fallbackPrice);

    state.underlyingPrice = targetPrice;
    state.change24h = cached.change || state.change24h;
    state.volume24h = cached.volume || state.volume24h;

    const now = Date.now();
    const minMove = 0.001;
    const moved = Math.abs(previous - targetPrice) >= minMove;
    const allowedByThrottle = now - state.lastPriceRenderAt >= TX_OPTIONS_UI_THROTTLE_MS;

    if (forceRender || (moved && allowedByThrottle)) {
        state.lastPriceRenderAt = now;
        refreshFromPriceFast();
    }

    return true;
}

async function loadTickerSnapshot() {
    await Promise.all(tickerItems.map(async (item) => {
        let applied = false;

        if (isBackendReady()) {
            try {
                const response = await apiRequest(`/market/ticker/${encodeURIComponent(item.symbol)}?_=${Date.now()}`);
                const ticker = tickerValueFromPayload(response);

                if (Number.isFinite(ticker.price) && ticker.price > 0) {
                    cacheTicker(item.symbol, ticker);
                    applied = true;
                }
            } catch (error) {
                console.warn(`Backend ticker unavailable for ${item.symbol}. Direct live fallback will be used.`, error);
            }
        }

        if (!applied) {
            const directTicker = await fetchDirectBinanceTicker(item.symbol);
            if (directTicker) {
                cacheTicker(item.symbol, directTicker);
                applied = true;
            }
        }

        if (!applied) {
            cacheTicker(item.symbol, {
                price: tickerFallback[item.symbol] || 0,
                change: 0,
                volume: 0
            });
        }
    }));

    renderTickerStrip();
}


async function loadUnderlyingPrice(forceRender = false) {
    const config = getConfig();
    let applied = false;

    // Prioritize direct Binance Options Index Price (indexPrice) for 100% matching with binance.com/en/eoptions
    const directIndexTicker = await fetchDirectBinanceTicker(config.symbol);
    if (directIndexTicker && Number.isFinite(directIndexTicker.price) && directIndexTicker.price > 0) {
        applyUnderlyingTicker(config.symbol, directIndexTicker, forceRender);
        applied = true;
    }

    if (!applied && isBackendReady()) {
        try {
            const response = await apiRequest(`/market/ticker/${encodeURIComponent(config.symbol)}?_=${Date.now()}`);
            const ticker = tickerValueFromPayload(response);

            if (Number.isFinite(ticker.price) && ticker.price > 0) {
                applyUnderlyingTicker(config.symbol, ticker, forceRender);
                applied = true;
            }
        } catch (error) {
            console.warn("Options backend underlying ticker unavailable:", error);
        }
    }

    return applied;
}


function getTickerDecimals(symbol, price) {
    const s = String(symbol || "").toUpperCase();
    if (s.includes("BTC") || s.includes("ETH") || s.includes("BNB") || s.includes("SOL") || s.includes("LTC") || s.includes("AVAX")) return 2;
    if (s.includes("XRP") || s.includes("ADA") || s.includes("DOGE") || s.includes("TRX") || s.includes("MATIC") || s.includes("NEAR")) return 4;
    if (s.includes("PEPE") || s.includes("SHIB") || s.includes("BONK") || s.includes("FLOKI")) return 6;
    if (price >= 50) return 2;
    if (price >= 1) return 3;
    return 4;
}

let cachedTickerNodes = null;

function renderTickerStrip() {
    if (!el.tickerStrip) {
        return;
    }

    primeTickerFallbacks();

    let track = el.tickerStrip.querySelector(".os-ticker-track");

    if (!track) {
        cachedTickerNodes = null;
        const rows = tickerItems.map((item) => {
            const cached = getTickerCache(item.symbol) || {};
            const price = number(cached.price, tickerFallback[item.symbol] || 0);
            const change = number(cached.change, 0);
            const positive = change >= 0;
            const decimals = getTickerDecimals(item.symbol, price);
            const logo = (typeof getCoinLogoSvg === "function") ? getCoinLogoSvg(item.symbol, "w-4 h-4") : (window.getCoinLogoSvg ? window.getCoinLogoSvg(item.symbol, "w-4 h-4") : `<span class="os-ticker-icon">${item.icon}</span>`);

            return `
                <div class="os-ticker-item" role="button" tabindex="0" data-options-ticker-symbol="${item.symbol}">
                    <span class="os-ticker-icon">${logo}</span>
                    <span>${item.label}</span>
                    <strong class="os-ticker-price" data-symbol="${item.symbol}">$${formatNumber(price, decimals)}</strong>
                    <em class="os-ticker-change ${positive ? "up" : "down"}" data-symbol="${item.symbol}">${positive ? "+" : ""}${formatNumber(change, 2)}%</em>
                </div>
            `;
        });

        const tickerHtml = rows.join("");

        el.tickerStrip.innerHTML = `
            <div class="os-ticker-marquee">
                <div class="os-ticker-track">
                    ${tickerHtml}
                    ${tickerHtml}
                </div>
            </div>
        `;

        el.tickerStrip.querySelectorAll("[data-options-ticker-symbol]").forEach((item) => {
            const openSymbol = () => {
                const code = underlyingCodeFromSymbol(item.getAttribute("data-options-ticker-symbol"));
                setUnderlying(code);
            };
            item.addEventListener("click", openSymbol);
            item.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openSymbol();
                }
            });
        });
        return;
    }

    if (!cachedTickerNodes) {
        cachedTickerNodes = {};
        tickerItems.forEach((item) => {
            cachedTickerNodes[item.symbol] = {
                prices: Array.from(track.querySelectorAll(`.os-ticker-price[data-symbol="${item.symbol}"]`)),
                changes: Array.from(track.querySelectorAll(`.os-ticker-change[data-symbol="${item.symbol}"]`))
            };
        });
    }

    tickerItems.forEach((item) => {
        const cached = getTickerCache(item.symbol) || {};
        const price = number(cached.price, tickerFallback[item.symbol] || 0);
        const change = number(cached.change, 0);
        const positive = change >= 0;
        const decimals = getTickerDecimals(item.symbol, price);

        const formattedPrice = `$${formatNumber(price, decimals)}`;
        const formattedChange = `${positive ? "+" : ""}${formatNumber(change, 2)}%`;
        const nodes = cachedTickerNodes[item.symbol];

        if (nodes) {
            nodes.prices.forEach((node) => {
                if (node.textContent !== formattedPrice) {
                    node.textContent = formattedPrice;
                }
            });
            nodes.changes.forEach((node) => {
                if (node.textContent !== formattedChange) {
                    node.textContent = formattedChange;
                    node.className = `os-ticker-change ${positive ? "up" : "down"}`;
                }
            });
        }
    });
}

function renderTickerStripThrottled(force = false) {
    const now = Date.now();
    if (!force && now - state.lastTickerRenderAt < TX_OPTIONS_TICKER_RENDER_MS) {
        return;
    }
    state.lastTickerRenderAt = now;
    renderTickerStrip();
}

function generateOptionForConfig(config, side, strike, underlyingPrice, expiryDays = state.expiryDays) {
    const price = number(underlyingPrice, config.fallbackPrice);
    const distance = Math.abs(strike - price) / Math.max(price, 1);
    const isCall = side === "CALL";
    const intrinsic = isCall ? Math.max(0, price - strike) : Math.max(0, strike - price);
    const timeValue = Math.max(config.minPremium, price * (0.004 + expiryDays * 0.00075) * Math.exp(-distance * 11));
    const mark = Math.max(0.01, intrinsic + timeValue);
    const spread = Math.max(0.01, mark * (0.018 + distance * 0.12));
    const iv = clamp(config.baseIv + distance * 180 + pseudo(`${config.code}-${side}-${strike}-${expiryDays}`) * 8, 32, 125);
    const deltaBase = clamp(0.5 - distance * 1.7, 0.08, 0.92);

    return {
        side,
        strike,
        mark,
        bid: Math.max(0.01, mark - spread / 2),
        ask: mark + spread / 2,
        bidQty: 0.4 + pseudo(`bid-${config.code}-${side}-${strike}`) * 6,
        askQty: 0.4 + pseudo(`ask-${config.code}-${side}-${strike}`) * 6,
        iv,
        oi: Math.round(500 + pseudo(`oi-${config.code}-${side}-${strike}`) * 9800),
        volume: Math.round(50 + pseudo(`vol-${config.code}-${side}-${strike}`) * 1200),
        delta: isCall ? deltaBase : -deltaBase,
        gamma: 0.012 + distance * 0.08,
        theta: -(0.01 + distance * 0.19),
        vega: 0.08 + distance * 0.35
    };
}

function generateOption(side, strike, underlyingPrice) {
    return generateOptionForConfig(getConfig(), side, strike, underlyingPrice, state.expiryDays);
}

async function loadLiveOptionsChain() {
    const config = getConfig();
    try {
        const resp = await apiRequest(`/options/chain?symbol=${encodeURIComponent(config.code)}&_=${Date.now()}`);
        if (resp && resp.success && resp.data && Array.isArray(resp.data.chain) && resp.data.chain.length > 0) {
            if (Number.isFinite(resp.data.underlyingPrice) && resp.data.underlyingPrice > 0) {
                state.underlyingPrice = resp.data.underlyingPrice;
            }

            const rows = resp.data.chain.map((item) => {
                const strike = Number(item.strike);

                const processSide = (opt, side) => {
                    const fallbackOpt = generateOption(side, strike, state.underlyingPrice);
                    if (!opt) return fallbackOpt;

                    const mark = Number(opt.mark || opt.lastPrice || fallbackOpt.mark);
                    const bid = Number(opt.bid || Math.max(0.01, mark * 0.95));
                    const ask = Number(opt.ask || mark * 1.05);
                    const iv = Number(opt.iv !== undefined && opt.iv > 0 ? opt.iv : fallbackOpt.iv);
                    const delta = Number(opt.delta !== undefined ? opt.delta : fallbackOpt.delta);
                    const gamma = Number(opt.gamma !== undefined ? opt.gamma : fallbackOpt.gamma);
                    const theta = Number(opt.theta !== undefined ? opt.theta : fallbackOpt.theta);
                    const vega = Number(opt.vega !== undefined ? opt.vega : fallbackOpt.vega);

                    return {
                        ...fallbackOpt,
                        symbol: opt.symbol || fallbackOpt.symbol,
                        side: side,
                        strike: strike,
                        mark: mark,
                        bid: bid,
                        ask: ask,
                        iv: iv,
                        delta: delta,
                        gamma: gamma,
                        theta: theta,
                        vega: vega,
                        volume: Number(opt.volume || fallbackOpt.volume)
                    };
                };

                return {
                    strike: strike,
                    call: processSide(item.call, "CALL"),
                    put: processSide(item.put, "PUT")
                };
            });

            state.chain = rows;
            return true;
        }
    } catch (err) {
        console.warn("Binance options chain API unavailable, using fallback generator:", err);
    }
    return false;
}

function generateChain() {
    const config = getConfig();
    const price = state.underlyingPrice || config.fallbackPrice;
    const atm = getAtmStrike(price);
    const rows = [];

    for (let index = -4; index <= 4; index += 1) {
        const strike = atm + index * config.step;
        rows.push({
            strike,
            call: generateOption("CALL", strike, price),
            put: generateOption("PUT", strike, price)
        });
    }

    state.chain = rows;

    if (!state.selectedStrike || !rows.some((row) => Number(row.strike) === Number(state.selectedStrike))) {
        state.selectedStrike = atm;
        const row = rows.find((item) => item.strike === atm) || rows[Math.floor(rows.length / 2)];
        state.activeSide = state.activeSide || "CALL";
        state.selectedOption = state.activeSide === "CALL" ? row.call : row.put;
    } else {
        const row = rows.find((item) => Number(item.strike) === Number(state.selectedStrike));
        state.selectedOption = state.activeSide === "CALL" ? row.call : row.put;
    }
}

function filteredChain() {
    const query = String(el.strikeSearch?.value || "").trim();

    if (!query) {
        return state.chain;
    }

    return state.chain.filter((row) => String(row.strike).includes(query));
}

function renderPriceWithIv(price, iv, colorClass) {
    return `<strong class="${colorClass}">${formatNumber(price, 2)}</strong><small>${formatNumber(iv, 1)}%</small>`;
}

function chainValue(row, side, cell) {
    const option = side === "CALL" ? row.call : row.put;

    if (state.chainViewMode === "greeks") {
        if (cell === "oi") return `Γ ${option.gamma.toFixed(3)}`;
        if (cell === "delta") return `Δ ${option.delta.toFixed(2)}`;
        if (cell === "bidQty") return `Θ ${option.theta.toFixed(3)}`;
        if (cell === "bid") return renderPriceWithIv(option.mark, option.iv, side === "CALL" ? "text-emerald-400" : "text-red-400");
        if (cell === "ask") return `V ${option.vega.toFixed(3)}`;
        if (cell === "askQty") return `${option.iv.toFixed(1)}%`;
    }

    if (state.chainViewMode === "data") {
        if (cell === "oi") return formatCompact(option.oi);
        if (cell === "delta") return `Vol ${formatCompact(option.volume)}`;
        if (cell === "bidQty") return option.bidQty.toFixed(3);
        if (cell === "bid") return renderPriceWithIv(option.bid, option.iv, "text-emerald-400");
        if (cell === "ask") return renderPriceWithIv(option.ask, option.iv, "text-red-400");
        if (cell === "askQty") return option.askQty.toFixed(3);
    }

    if (cell === "oi") return `<span class="os-oi-bar ${side === "PUT" ? "put" : ""}" style="--w:${Math.min(96, option.oi / 1000)}%"></span>${formatCompact(option.oi)}`;
    if (cell === "delta") return option.delta.toFixed(2);
    if (cell === "bidQty") return option.bidQty.toFixed(3);
    if (cell === "bid") return renderPriceWithIv(option.bid, option.iv, "text-emerald-400");
    if (cell === "ask") return renderPriceWithIv(option.ask, option.iv, "text-red-400");
    if (cell === "askQty") return option.askQty.toFixed(3);

    return "--";
}

function formatOptionPrice(val) {
    const v = Number(val);
    if (v === 0) return "0";
    if (v >= 100) return formatNumber(v, 0);
    if (v >= 1) return formatNumber(v, 2);
    return formatNumber(v, 3);
}

function renderChainHeader() {
    const headRow = document.querySelector(".os-chain-table thead tr");
    if (!headRow) return;

    if (state.chainViewMode === "greeks") {
        headRow.innerHTML = `
            <th class="text-cyan-400 font-black">Delta (Δ)</th>
            <th class="text-emerald-400 font-black">Gamma (Γ)</th>
            <th class="text-red-400 font-black">Theta (Θ)</th>
            <th class="text-amber-400 font-black">Vega (ν)</th>
            <th class="os-strike-head">Strike</th>
            <th class="text-amber-400 font-black">Vega (ν)</th>
            <th class="text-red-400 font-black">Theta (Θ)</th>
            <th class="text-emerald-400 font-black">Gamma (Γ)</th>
            <th class="text-cyan-400 font-black">Delta (Δ)</th>
        `;
    } else {
        headRow.innerHTML = `
            <th>Bids ($)</th>
            <th>Asks ($)</th>
            <th>Mark ($)</th>
            <th>IV%</th>
            <th class="os-strike-head">Strike</th>
            <th>IV%</th>
            <th>Mark ($)</th>
            <th>Asks ($)</th>
            <th>Bids ($)</th>
        `;
    }
}

function renderChainRow(row) {
    const selected = Number(row.strike) === Number(state.selectedStrike);
    const atm = Number(row.strike) === Number(getAtmStrike());
    
    const config = getConfig();
    const price = state.underlyingPrice || config.fallbackPrice;
    const distPercent = (Math.abs(row.strike - price) / price * 100).toFixed(2) + "%";

    const isCallSelected = selected && state.activeSide === "CALL";
    const isPutSelected = selected && state.activeSide === "PUT";

    if (state.chainViewMode === "greeks") {
        return `
            <tr class="${selected ? "selected" : ""} ${atm ? "atm" : ""}" data-row-strike="${row.strike}">
                <!-- CALL GREEKS -->
                <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-cyan-400 font-bold text-xs ${isCallSelected ? 'bg-cyan-500/15' : ''}" data-chain-side="CALL" data-chain-action="BUY" data-chain-strike="${row.strike}">
                    ${row.call.delta.toFixed(2)}
                </td>
                <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-emerald-400 font-bold text-xs ${isCallSelected ? 'bg-cyan-500/15' : ''}" data-chain-side="CALL" data-chain-action="BUY" data-chain-strike="${row.strike}">
                    ${row.call.gamma.toFixed(3)}
                </td>
                <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-red-400 font-bold text-xs ${isCallSelected ? 'bg-cyan-500/15' : ''}" data-chain-side="CALL" data-chain-action="BUY" data-chain-strike="${row.strike}">
                    ${row.call.theta.toFixed(3)}
                </td>
                <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-amber-400 font-bold text-xs ${isCallSelected ? 'bg-cyan-500/15' : ''}" data-chain-side="CALL" data-chain-action="BUY" data-chain-strike="${row.strike}">
                    ${row.call.vega.toFixed(3)}
                </td>
                
                <!-- STRIKE -->
                <td class="os-strike-cell cursor-pointer" data-select-strike="${row.strike}">
                    <div class="flex flex-col items-center justify-center">
                        <span class="font-black text-white text-sm">${formatNumber(row.strike, 0)}</span>
                        <span class="text-[10px] text-slate-500 font-bold mt-0.5">${distPercent}</span>
                    </div>
                </td>
                
                <!-- PUT GREEKS -->
                <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-amber-400 font-bold text-xs ${isPutSelected ? 'bg-cyan-500/15' : ''}" data-chain-side="PUT" data-chain-action="BUY" data-chain-strike="${row.strike}">
                    ${row.put.vega.toFixed(3)}
                </td>
                <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-red-400 font-bold text-xs ${isPutSelected ? 'bg-cyan-500/15' : ''}" data-chain-side="PUT" data-chain-action="BUY" data-chain-strike="${row.strike}">
                    ${row.put.theta.toFixed(3)}
                </td>
                <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-emerald-400 font-bold text-xs ${isPutSelected ? 'bg-cyan-500/15' : ''}" data-chain-side="PUT" data-chain-action="BUY" data-chain-strike="${row.strike}">
                    ${row.put.gamma.toFixed(3)}
                </td>
                <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-cyan-400 font-bold text-xs ${isPutSelected ? 'bg-cyan-500/15' : ''}" data-chain-side="PUT" data-chain-action="BUY" data-chain-strike="${row.strike}">
                    ${row.put.delta.toFixed(2)}
                </td>
            </tr>
        `;
    }

    return `
        <tr class="${selected ? "selected" : ""} ${atm ? "atm" : ""}" data-row-strike="${row.strike}">
            <!-- CALLS -->
            <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-emerald-400 font-bold ${isCallSelected ? 'bg-emerald-500/15' : ''}" data-chain-side="CALL" data-chain-action="SELL" data-chain-strike="${row.strike}">
                ${formatOptionPrice(row.call.bid)}
            </td>
            <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-red-400 font-bold ${isCallSelected ? 'bg-emerald-500/15' : ''}" data-chain-side="CALL" data-chain-action="BUY" data-chain-strike="${row.strike}">
                ${formatOptionPrice(row.call.ask)}
            </td>
            <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-slate-100 font-semibold ${isCallSelected ? 'bg-emerald-500/15' : ''}" data-chain-side="CALL" data-chain-action="BUY" data-chain-strike="${row.strike}">
                ${formatOptionPrice(row.call.mark)}
            </td>
            <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-slate-400 text-xs ${isCallSelected ? 'bg-emerald-500/15' : ''}" data-chain-side="CALL" data-chain-action="BUY" data-chain-strike="${row.strike}">
                ${row.call.iv.toFixed(2)}%
            </td>
            
            <!-- STRIKE -->
            <td class="os-strike-cell cursor-pointer" data-select-strike="${row.strike}">
                <div class="flex flex-col items-center justify-center">
                    <span class="font-black text-white text-sm">${formatNumber(row.strike, 0)}</span>
                    <span class="text-[10px] text-slate-500 font-bold mt-0.5">${distPercent}</span>
                </div>
            </td>
            
            <!-- PUTS -->
            <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-slate-400 text-xs ${isPutSelected ? 'bg-red-500/15' : ''}" data-chain-side="PUT" data-chain-action="BUY" data-chain-strike="${row.strike}">
                ${row.put.iv.toFixed(2)}%
            </td>
            <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-slate-100 font-semibold ${isPutSelected ? 'bg-red-500/15' : ''}" data-chain-side="PUT" data-chain-action="BUY" data-chain-strike="${row.strike}">
                ${formatOptionPrice(row.put.mark)}
            </td>
            <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-red-400 font-bold ${isPutSelected ? 'bg-red-500/15' : ''}" data-chain-side="PUT" data-chain-action="BUY" data-chain-strike="${row.strike}">
                ${formatOptionPrice(row.put.ask)}
            </td>
            <td class="cursor-pointer hover:bg-cyan-400/5 transition-colors text-emerald-400 font-bold ${isPutSelected ? 'bg-red-500/15' : ''}" data-chain-side="PUT" data-chain-action="SELL" data-chain-strike="${row.strike}">
                ${formatOptionPrice(row.put.bid)}
            </td>
        </tr>
    `;
}

function renderMobileCard(row) {
    const atm = Number(row.strike) === Number(getAtmStrike());

    return `
        <article class="os-mobile-option-card ${atm ? "atm" : ""}">
            <div class="flex items-center justify-between">
                <h3 class="text-sm font-black text-white">Strike ${formatNumber(row.strike, 0)}</h3>
                ${atm ? `<span class="rounded-full bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-black text-cyan-400">ATM</span>` : ""}
            </div>
            <div class="grid grid-cols-2 gap-3 mt-3">
                <button type="button" class="os-mobile-contract call text-left w-full cursor-pointer transition-all hover:bg-slate-900 border border-white/5 active:scale-95" data-chain-side="CALL" data-chain-action="BUY" data-chain-strike="${row.strike}">
                    <span class="block text-xs text-slate-400">CALL Ask</span>
                    <strong class="block text-sm font-black mt-1 text-emerald-400">${formatNumber(row.call.ask, 2)}</strong>
                </button>
                <button type="button" class="os-mobile-contract put text-left w-full cursor-pointer transition-all hover:bg-slate-900 border border-white/5 active:scale-95" data-chain-side="PUT" data-chain-action="BUY" data-chain-strike="${row.strike}">
                    <span class="block text-xs text-slate-400">PUT Ask</span>
                    <strong class="block text-sm font-black mt-1 text-red-400">${formatNumber(row.put.ask, 2)}</strong>
                </button>
            </div>
        </article>
    `;
}

function bindChainActions() {
    document.querySelectorAll("[data-chain-side][data-chain-action][data-chain-strike]").forEach((button) => {
        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectContract(
                button.getAttribute("data-chain-side"),
                number(button.getAttribute("data-chain-strike"), 0),
                button.getAttribute("data-chain-action")
            );
        });
    });

    document.querySelectorAll("[data-select-strike]").forEach((button) => {
        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectContract(state.activeSide, number(button.getAttribute("data-select-strike"), 0), state.activeAction);
        });
    });
}

function renderChain() {
    renderChainHeader();
    const rows = filteredChain();

    if (el.chainBody) {
        const config = getConfig();
        const price = state.underlyingPrice || config.fallbackPrice;
        
        let htmlContent = "";
        let lineRendered = false;

        for (let i = 0; i < rows.length; i++) {
            const currentRow = rows[i];
            
            if (!lineRendered && i < rows.length - 1) {
                const nextRow = rows[i + 1];
                if (price >= currentRow.strike && price <= nextRow.strike) {
                    htmlContent += renderChainRow(currentRow);
                    
                    htmlContent += `
                        <tr class="os-underlying-line-row">
                            <td colspan="9">
                                <div class="os-underlying-line-container">
                                    <div class="os-underlying-line"></div>
                                    <div class="os-underlying-pill">$${formatNumber(price, 2)}</div>
                                </div>
                            </td>
                        </tr>
                    `;
                    lineRendered = true;
                    continue;
                }
            }
            
            if (!lineRendered && i === 0 && price < currentRow.strike) {
                htmlContent += `
                    <tr class="os-underlying-line-row">
                        <td colspan="9">
                            <div class="os-underlying-line-container">
                                <div class="os-underlying-line"></div>
                                <div class="os-underlying-pill">$${formatNumber(price, 2)}</div>
                            </div>
                        </td>
                    </tr>
                `;
                lineRendered = true;
            }

            htmlContent += renderChainRow(currentRow);
        }

        if (!lineRendered) {
            htmlContent += `
                <tr class="os-underlying-line-row">
                    <td colspan="9">
                        <div class="os-underlying-line-container">
                            <div class="os-underlying-line"></div>
                            <div class="os-underlying-pill">$${formatNumber(price, 2)}</div>
                        </div>
                    </td>
                </tr>
            `;
        }

        el.chainBody.innerHTML = htmlContent;
    }

    if (el.mobileTableBody) {
        const side = state.mobileActiveSide || "CALL";
        const config = getConfig();
        const price = state.underlyingPrice || config.fallbackPrice;
        
        el.mobileTableBody.innerHTML = rows.map((row) => {
            const option = side === "CALL" ? row.call : row.put;
            const selected = Number(row.strike) === Number(state.selectedStrike);
            const atm = Number(row.strike) === Number(getAtmStrike());
            const isCall = side === "CALL";
            const textColor = isCall ? "text-emerald-400" : "text-red-400";
            
            const isItm = isCall ? Number(row.strike) < price : Number(row.strike) > price;
            let badgeHtml = "";
            if (atm) {
                badgeHtml = `<span class="inline-block rounded bg-cyan-400/10 px-1 py-0.5 text-[8px] font-black text-cyan-400 ml-1.5">ATM</span>`;
            } else if (isItm) {
                badgeHtml = `<span class="inline-block rounded bg-emerald-400/10 px-1 py-0.5 text-[8px] font-black text-emerald-400 ml-1.5">ITM</span>`;
            }
            
            return `
                <tr class="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${selected ? "bg-cyan-400/5" : ""}">
                    <td class="py-3 px-2 font-black text-white text-xs" data-mobile-strike="${row.strike}" data-mobile-side="${side}" data-mobile-action="BUY">
                        <div class="flex items-center">
                            <span>${formatNumber(row.strike, 0)}</span>
                            ${badgeHtml}
                        </div>
                    </td>
                    <td class="py-3 px-2 text-right font-bold ${textColor} text-xs" data-mobile-strike="${row.strike}" data-mobile-side="${side}" data-mobile-action="SELL">${formatOptionPrice(option.bid)}</td>
                    <td class="py-3 px-2 text-right font-bold ${textColor} text-xs" data-mobile-strike="${row.strike}" data-mobile-side="${side}" data-mobile-action="BUY">${formatOptionPrice(option.ask)}</td>
                    <td class="py-3 px-2 text-right text-slate-400 text-xs" data-mobile-strike="${row.strike}" data-mobile-side="${side}" data-mobile-action="BUY">${option.iv.toFixed(1)}%</td>
                    <td class="py-3 px-2 text-right text-slate-400 text-xs" data-mobile-strike="${row.strike}" data-mobile-side="${side}" data-mobile-action="BUY">${option.delta.toFixed(2)}</td>
                </tr>
            `;
        }).join("");
        
        el.mobileTableBody.querySelectorAll("[data-mobile-strike]").forEach((cellEl) => {
            cellEl.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const strike = number(cellEl.getAttribute("data-mobile-strike"), 0);
                const side = cellEl.getAttribute("data-mobile-side");
                const action = cellEl.getAttribute("data-mobile-action");
                selectContract(side, strike, action);
            });
        });
    }

    bindChainActions();
}

function updateDocumentTitle() {
    const config = getConfig();
    if (!config || !state.underlyingPrice) return;
    const decimals = decimalsForPrice(state.underlyingPrice);
    const formattedPrice = formatNumber(state.underlyingPrice, decimals);
    document.title = `${formattedPrice} | ${config.code} Options | TraidiumX`;
}

function renderSummary() {
    const config = getConfig();
    const avgIv = state.chain.length
        ? state.chain.reduce((sum, row) => sum + row.call.iv + row.put.iv, 0) / (state.chain.length * 2)
        : config.baseIv;
    const totalOi = state.chain.reduce((sum, row) => sum + row.call.oi + row.put.oi, 0);
    const change = number(state.change24h, 0);
    const sign = change >= 0 ? "+" : "";

    updateDocumentTitle();

    if (el.coinBadge) {
        el.coinBadge.textContent = config.icon;
        el.coinBadge.style.background = config.badgeBg || "rgba(245, 158, 11, 0.15)";
        el.coinBadge.style.border = `2px solid ${config.badgeBorder || "rgba(245, 158, 11, 0.5)"}`;
        el.coinBadge.style.color = config.badgeColor || "#f59e0b";
    }
    if (el.selectedTitle) {
        el.selectedTitle.innerHTML = `${config.title} <svg style="display:inline-block; width:1.25rem; height:1.25rem; margin-left:0.35rem; color:#94a3b8; vertical-align:middle;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>`;
    }

    const pickerDropdown = document.getElementById("optionsAssetPickerDropdown");
    if (pickerDropdown) {
        pickerDropdown.querySelectorAll("button[data-asset]").forEach(btn => {
            const isCurrent = btn.getAttribute("data-asset") === config.code;
            btn.dataset.active = isCurrent ? "true" : "false";
            const cfg = underlyings[btn.getAttribute("data-asset")];
            if (cfg) {
                btn.style.background = isCurrent ? (cfg.badgeBg || "rgba(245, 158, 11, 0.15)") : "transparent";
                btn.style.borderColor = isCurrent ? (cfg.badgeBorder || "rgba(245, 158, 11, 0.4)") : "transparent";
            }
        });
    }
    if (el.underlyingSelect) el.underlyingSelect.value = config.code;
    if (el.chainSubText) el.chainSubText.textContent = `${config.title} · ${formatExpiryCode()} `;
    if (el.underlyingPrice) el.underlyingPrice.textContent = `$${formatNumber(state.underlyingPrice, decimalsForPrice(state.underlyingPrice))}`;
    if (el.optionsChange) {
        el.optionsChange.textContent = `${sign}${formatNumber(change, 3)}%`;
        el.optionsChange.className = change >= 0 ? "text-emerald-400" : "text-red-400";
    }
    if (el.optionsVolume) el.optionsVolume.textContent = formatCompact(state.volume24h);
    if (el.atmStrike) el.atmStrike.textContent = `ATM ${formatNumber(getAtmStrike(), 0)}`;
    if (el.ivRank) el.ivRank.textContent = `${formatNumber(avgIv, 1)}%`;
    if (el.totalOpenInterest) el.totalOpenInterest.textContent = formatCompact(totalOi);
    if (el.bookSizeLabel) el.bookSizeLabel.textContent = `Size (${config.code})`;
    if (el.contractSizeText) el.contractSizeText.textContent = config.contractSize;
}

function contractCodeFor(side = state.activeSide, strike = state.selectedStrike) {
    const sideCode = side === "CALL" ? "CE" : "PE";
    return `${getConfig().code}-${formatNumber(strike, 0).replace(/,/g, "")}-${formatExpiryCode()}-${sideCode}`;
}

function renderSelectedContract() {
    const selected = getSelectedOption();

    if (!selected) {
        return;
    }

    const bestPrice = getBestOptionPrice();
    const inputPrice = getInputPrice();
    const displayPrice = inputPrice > 0 ? inputPrice : bestPrice;
    const qty = getQty();
    const cost = displayPrice * qty;

    if (state.activeOrderType !== "MARKET") {
        setLimitPriceToExecutable(false);
    }

    if (el.selectedContract) el.selectedContract.textContent = contractCodeFor();
    if (el.selectedPremium) el.selectedPremium.textContent = `Premium: $${formatNumber(bestPrice, 2)}`;
    if (el.premiumPreview) el.premiumPreview.textContent = formatNumber(displayPrice, 2);
    if (el.costPreview) {
        const required = getRequiredFunds();
        el.costPreview.textContent = `$${formatNumber(required, 2)}`;
        const estMarginNode = document.getElementById("walletEstMargin");
        if (estMarginNode) {
            estMarginNode.textContent = `${formatNumber(required, 2)} USD`;
        }
    }
    if (el.greeksBadge) {
        el.greeksBadge.textContent = state.activeSide;
        el.greeksBadge.className = state.activeSide === "CALL" ? "os-side-badge call" : "os-side-badge put";
    }
    if (el.delta) el.delta.textContent = selected.delta.toFixed(2);
    if (el.gamma) el.gamma.textContent = selected.gamma.toFixed(3);
    if (el.theta) el.theta.textContent = selected.theta.toFixed(3);
    if (el.vega) el.vega.textContent = selected.vega.toFixed(3);

    renderWalletBox();
    refreshOrderButton();
    if (typeof updateGreeksModalLiveValues === "function") {
        updateGreeksModalLiveValues();
    }
}

function generateBookRows() {
    const selected = getSelectedOption();
    const mark = selected ? selected.mark : 100;
    const rows = { asks: [], bids: [] };

    for (let index = 5; index >= 1; index -= 1) {
        rows.asks.push({
            price: mark + index * Math.max(0.1, mark * 0.006),
            qty: 0.2 + pseudo(`ask-${state.activeUnderlying}-${state.selectedStrike}-${index}`) * 5
        });
    }

    for (let index = 1; index <= 5; index += 1) {
        rows.bids.push({
            price: Math.max(0.01, mark - index * Math.max(0.1, mark * 0.006)),
            qty: 0.2 + pseudo(`bid-${state.activeUnderlying}-${state.selectedStrike}-${index}`) * 5
        });
    }

    return rows;
}

function renderOrderBook() {
    const selected = getSelectedOption();
    const rows = generateBookRows();

    if (el.asks) {
        el.asks.classList.toggle("hidden", state.bookView === "bids");
        el.asks.innerHTML = rows.asks.map((row) => `
            <div class="os-book-row ask">
                <span>${formatNumber(row.price, 2)}</span>
                <span>${row.qty.toFixed(3)}</span>
            </div>
        `).join("");
    }

    if (el.bids) {
        el.bids.classList.toggle("hidden", state.bookView === "asks");
        el.bids.innerHTML = rows.bids.map((row) => `
            <div class="os-book-row bid">
                <span>${formatNumber(row.price, 2)}</span>
                <span>${row.qty.toFixed(3)}</span>
            </div>
        `).join("");
    }

    if (el.mid) {
        el.mid.textContent = selected ? `$${formatNumber(selected.mark, 2)}` : "--";
    }
}

function generateTrades() {
    const selected = getSelectedOption();
    const mark = selected ? selected.mark : 100;
    const now = Date.now();
    const trades = [];

    for (let index = 0; index < 14; index += 1) {
        const side = pseudo(`${state.activeUnderlying}-${state.selectedStrike}-trade-side-${index}`) > 0.48 ? "BUY" : "SELL";
        const move = (pseudo(`${state.selectedStrike}-trade-${index}`) - 0.5) * mark * 0.04;

        trades.push({
            side,
            price: Math.max(0.01, mark + move),
            qty: 0.02 + pseudo(`qty-${index}-${state.selectedStrike}`) * 2.5,
            time: now - index * 21000
        });
    }

    state.trades = trades;
}

function renderTrades() {
    if (!state.trades.length) {
        generateTrades();
    }

    if (!el.tradesList) {
        return;
    }

    el.tradesList.innerHTML = state.trades.map((trade) => `
        <div class="os-trade-row ${trade.side === "BUY" ? "buy" : "sell"}">
            <span>${formatNumber(trade.price, 2)}</span>
            <span>${trade.qty.toFixed(3)}</span>
            <span>${new Date(trade.time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
    `).join("");
}

function startTradeTicker() {
    if (state.timers.trades) {
        window.clearInterval(state.timers.trades);
    }

    state.timers.trades = window.setInterval(() => {
        const selected = getSelectedOption();
        if (!selected) return;

        state.trades.unshift({
            side: Math.random() > 0.5 ? "BUY" : "SELL",
            price: Math.max(0.01, selected.mark + (Math.random() - 0.5) * selected.mark * 0.03),
            qty: 0.04 + Math.random() * 2.2,
            time: Date.now()
        });
        state.trades = state.trades.slice(0, 14 );
        renderTrades();
    }, 1800);
}

function updateOrderSideButtons() {
    if (el.sideBuy) el.sideBuy.classList.toggle("active-buy", state.activeAction === "BUY");
    if (el.sideSell) el.sideSell.classList.toggle("active-sell", state.activeAction === "SELL");
}

function applyOrderTypeUI() {
    const isMarket = state.activeOrderType === "MARKET";
    const isStopLimit = state.activeOrderType === "STOP_LIMIT";
    const limitWrap = el.limitPrice?.closest(".os-input-wrap") || null;
    const limitLabel = limitWrap?.previousElementSibling?.classList?.contains("os-input-label")
        ? limitWrap.previousElementSibling
        : null;

    if (limitWrap) {
        limitWrap.classList.toggle("hidden", isMarket);
        limitWrap.style.display = isMarket ? "none" : "";
    }

    if (limitLabel) {
        limitLabel.classList.toggle("hidden", isMarket);
        limitLabel.style.display = isMarket ? "none" : "";
    }

    if (el.limitPrice) {
        el.limitPrice.disabled = isMarket;
    }

    if (el.stopWrap) {
        el.stopWrap.classList.toggle("hidden", !isStopLimit);
    }

    renderSelectedContract();
}

function refreshFromPriceFast() {
    generateChain();
    renderSummary();
    renderChain();
    renderSelectedContract();
    renderOrderBook();
}

async function refreshFromPrice(resetSelection = false) {
    const oldStrike = state.selectedStrike;
    const loadedLive = await loadLiveOptionsChain();
    if (!loadedLive) {
        generateChain();
    }

    if (!resetSelection && oldStrike && state.chain.some((row) => Number(row.strike) === Number(oldStrike))) {
        state.selectedStrike = oldStrike;
        const row = state.chain.find((item) => Number(item.strike) === Number(oldStrike));
        state.selectedOption = state.activeSide === "CALL" ? row.call : row.put;
    } else if (state.chain.length > 0) {
        const atm = getAtmStrike();
        const row = state.chain.find((item) => Number(item.strike) === Number(atm)) || state.chain[Math.floor(state.chain.length / 2)];
        state.selectedStrike = row.strike;
        state.selectedOption = state.activeSide === "CALL" ? row.call : row.put;
    }

    renderSummary();
    renderChain();
    renderSelectedContract();
    renderOrderBook();
    generateTrades();
    renderTrades();
    renderCachedTerminalIfVisible();
}

async function setUnderlying(code) {
    if (!underlyings[code]) {
        return;
    }

    state.activeUnderlying = code;
    state.activeSide = "CALL";
    state.activeAction = "BUY";
    state.selectedStrike = null;
    state.selectedOption = null;
    state.underlyingPrice = getUnderlyingPriceForCode(code);

    await loadUnderlyingPrice(true);
    refreshFromPrice(true);
    showMessage(`${underlyings[code].title} loaded.`, "success");
}

function selectContract(side, strike, action = state.activeAction) {
    const row = state.chain.find((item) => Number(item.strike) === Number(strike));

    if (!row) {
        return;
    }

    state.activeSide = side;
    state.activeAction = action;
    state.selectedStrike = strike;
    state.selectedOption = side === "CALL" ? row.call : row.put;

    setLimitPriceToExecutable(true);
    updateOrderSideButtons();
    renderChain();
    renderSelectedContract();
    renderOrderBook();
    generateTrades();
    renderTrades();
    renderBottomTable();
    showMessage(`${action} ${state.activeUnderlying} ${formatNumber(strike, 0)} ${side === "CALL" ? "CE" : "PE"} selected.`, action === "BUY" ? "success" : "error");
}

function validateOrder() {
    const selected = getSelectedOption();
    const price = getInputPrice();
    const qty = getQty();

    if (!selected) {
        showMessage("Select option contract first.", "error");
        return false;
    }

    if (!price || price <= 0) {
        showMessage("Valid option price required.", "error");
        return false;
    }

    if (!qty || qty <= 0) {
        showMessage("Valid quantity required.", "error");
        return false;
    }

    if (state.activeOrderType === "STOP_LIMIT" && number(el.stopPrice?.value, 0) <= 0) {
        showMessage("Stop price required for Stop Limit order.", "error");
        return false;
    }

    if (el.bracketCheck?.checked) {
        const tp = number(el.takeProfit?.value, 0);
        const sl = number(el.stopLoss?.value, 0);

        if (!tp || !sl) {
            showMessage("Take Profit and Stop Loss both required for bracket order.", "error");
            return false;
        }
    }

    return validateWallet();
}

function buildBackendOptionPayload() {
    setLimitPriceToExecutable(false);
    const selected = getSelectedOption();
    const bestPrice = getBestOptionPrice();
    const rawPrice = getInputPrice();
    const price = rawPrice > 0 ? rawPrice : bestPrice;

    return {
        contract: contractCodeFor(),
        underlying: state.activeUnderlying,
        action: state.activeAction,
        option_side: state.activeSide,
        order_type: state.activeOrderType,
        strike: state.selectedStrike,
        expiry_code: formatExpiryCode(),
        price,
        quantity: getQty(),
        best_bid: selected ? selected.bid : price,
        best_ask: selected ? selected.ask : price,
        mark_price: selected ? selected.mark : price,
        stop_price: number(el.stopPrice?.value, 0),
        take_profit: el.bracketCheck?.checked ? number(el.takeProfit?.value, 0) : 0,
        stop_loss: el.bracketCheck?.checked ? number(el.stopLoss?.value, 0) : 0,
        source: "traidiumx_options_terminal_company_ready"
    };
}

async function placeBackendOptionOrder(event) {
    if (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    if (!isBackendLoggedIn()) {
        showMessage("Login required to place options order.", "error");
        return;
    }

    if (!state.wallet.loaded) {
        await loadWalletBalance(true).catch(() => {});
    }

    const required = getRequiredFunds();
    if (state.wallet.loaded && state.wallet.availableBalance < required) {
        showMessage("Insufficient wallet balance for options order.", "error");
        return;
    }

    if (!validateOrder()) {
        return;
    }

    const payload = buildBackendOptionPayload();
    const optimisticPosition = payload.order_type === "STOP_LIMIT" ? null : optimisticOptionPosition(payload);
    const optimisticOrder = payload.order_type === "STOP_LIMIT" ? optimisticOptionOrder(payload) : null;
    const previousPositions = [...(state.terminalCache.positions || [])];
    const previousOpenOrders = [...(state.terminalCache.openOrders || [])];

    if (optimisticPosition) {
        state.terminalCache.positions = [optimisticPosition, ...previousPositions];
        activateBottomTab("positions");
        document.querySelectorAll("[data-bottom-tab]").forEach((button) => {
            button.classList.toggle("active", button.getAttribute("data-bottom-tab") === "positions");
        });
        renderCachedTerminalNow();
    } else if (optimisticOrder) {
        state.terminalCache.openOrders = [optimisticOrder, ...previousOpenOrders];
        activateBottomTab("orderHistory");
        document.querySelectorAll("[data-bottom-tab]").forEach((button) => {
            button.classList.toggle("active", button.getAttribute("data-bottom-tab") === "orderHistory");
        });
        renderBottomTable();
    }

    if (el.quantity) {
        el.quantity.value = "";
    }

    refreshOrderButton();

    try {
        if (el.placeOrderBtn) {
            el.placeOrderBtn.disabled = true;
        }

        const response = await apiRequest(`${TX_OPTIONS_API_BASE}/order`, {
            method: "POST",
            body: JSON.stringify(payload)
        });

        const data = response?.data || {};
        const status = data?.order?.status || "placed";
        applyWalletFromResponse(response);

        if (optimisticPosition && data.position) {
            state.terminalCache.positions = (state.terminalCache.positions || []).map((position) => {
                return position.id === optimisticPosition.id ? data.position : position;
            });
            renderCachedTerminalNow();
        }

        if (optimisticOrder && data.order) {
            state.terminalCache.openOrders = (state.terminalCache.openOrders || []).map((order) => {
                return order.id === optimisticOrder.id ? data.order : order;
            });
            renderCachedTerminalNow();
        }

        if (String(status).toLowerCase() === "filled" || data.position || optimisticPosition) {
            showMessage("Option order completed successfully.", "success");
        } else {
            showMessage(`Option order ${statusLabel(status)}. Check Open Orders.`, "success");
        }

        refreshOptionsStateInBackground();
    } catch (error) {
        state.terminalCache.positions = previousPositions;
        state.terminalCache.openOrders = previousOpenOrders;
        renderCachedTerminalNow();
        
        const errors = error?.errors || {};
        const message = `${error?.message || ""} ${Object.values(errors).join(" ")}`.toLowerCase();
        if (errors.kyc_required || errors.kyc || message.includes("kyc") || message.includes("identity verification")) {
            showMessage("KYC verification is required. Redirecting to KYC...", "error");
            window.setTimeout(() => {
                window.location.href = `./kyc.html?next=${encodeURIComponent("./options.html")}&reason=trading`;
            }, 1200);
            return;
        }

        showMessage(backendError(error), "error");
    } finally {
        if (el.placeOrderBtn) {
            el.placeOrderBtn.disabled = false;
            refreshOrderButton();
        }
    }
}

async function cancelOptionOrder(orderId) {
    if (!isBackendLoggedIn()) {
        showMessage("Login required.", "error");
        return;
    }

    try {
        const response = await backendPost(`/cancel/${encodeURIComponent(orderId)}`);
        applyWallet(response.wallet || response.wallet_balance_after || null);
        showMessage("Option order cancelled and locked margin released.", "success");
        await loadWalletBalance(true);
        renderBottomTable();
    } catch (error) {
        showMessage(backendError(error), "error");
    }
}

async function closeOptionPosition(positionId, closePrice = 0) {
    if (!isBackendLoggedIn()) {
        showMessage("Login required.", "error");
        return;
    }

    const previousPositions = [...(state.terminalCache.positions || [])];
    const cachedPosition = previousPositions.find((position) => String(position.id) === String(positionId));

    if (cachedPosition) {
        state.terminalCache.positions = previousPositions.filter((position) => String(position.id) !== String(positionId));
        renderCachedTerminalNow();
    }

    try {
        const computedMark = closePrice || (cachedPosition ? optionMarkForPosition(cachedPosition) : 0);
        const response = await backendPost(`/close-position/${encodeURIComponent(positionId)}`, {
            mark_price: computedMark
        });
        applyWallet(response.wallet || response.wallet_balance_after || null);
        showMessage("Option position closed successfully.", "success");
        playOptionCloseSound();
        refreshOptionsStateInBackground();
    } catch (error) {
        state.terminalCache.positions = previousPositions;
        renderCachedTerminalNow();
        showMessage(backendError(error), "error");
    }
}

async function closeAllOptionPositions() {
    if (!isBackendLoggedIn()) {
        showMessage("Login required.", "error");
        return;
    }

    const positions = state.terminalCache.positions || [];

    if (!positions.length) {
        showMessage("No open option positions to close.", "error");
        return;
    }

    const previousPositions = [...positions];
    const marks = {};
    positions.forEach((position) => {
        if (position?.id && !String(position.id).startsWith("optimistic-")) {
            marks[position.id] = optionMarkForPosition(position);
        }
    });

    state.terminalCache.positions = [];
    renderCachedTerminalNow();

    try {
        const response = await backendPost("/close-all-positions", { marks });
        applyWallet(response.wallet || response.wallet_balance_after || null);
        const closedCount = number(response.closed_count, previousPositions.length);
        showMessage(`${closedCount} option position(s) closed successfully.`, "success");
        playOptionCloseSound();
        refreshOptionsStateInBackground();
    } catch (error) {
        state.terminalCache.positions = previousPositions;
        renderCachedTerminalNow();
        showMessage(backendError(error), "error");
    }
}

function tableShell(headers, rowsHtml, emptyText, extraClass = "") {
    if (!rowsHtml) {
        return `<div class="os-empty-table">${emptyText}</div>`;
    }

    return `
        <div class="os-table-scroll">
            <table class="os-demo-table ${extraClass}">
                <thead><tr>${headers.map((head) => `<th class="rt-desktop-only">${head}</th>`).join("")}</tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
}

function formatOrderTime(dateStr) {
    if (!dateStr) return "--";
    const date = new Date(dateStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = date.getDate();
    const month = months[date.getMonth()];
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedHours = String(hours).padStart(2, '0');
    return `${day} ${month}, ${formattedHours}:${minutes}:${seconds} ${ampm}`;
}

function optionMarkForPosition(position) {
    const strike = number(position.strike, 0);
    const side = String(position.option_side || position.side || "CALL").toUpperCase();
    const underlyingCode = String(position.underlying || state.activeUnderlying || "BTC").toUpperCase();
    const config = underlyings[underlyingCode] || getConfig();
    const price = underlyingCode === state.activeUnderlying
        ? number(state.underlyingPrice, config.fallbackPrice)
        : getUnderlyingPriceForCode(underlyingCode);

    const option = generateOptionForConfig(config, side === "PUT" ? "PUT" : "CALL", strike, price, state.expiryDays);
    return option ? number(option.mark, position.entry_price) : number(position.entry_price, 0);
}

function pnlClass(value) {
    return number(value, 0) >= 0 ? "text-emerald-400 os-pnl-profit" : "text-red-400 os-pnl-loss";
}

function pnlStyle(value) {
    return number(value, 0) >= 0
        ? "color:#22c55e !important;font-weight:900;"
        : "color:#ef4444 !important;font-weight:900;";
}

function renderLoginRequiredTable() {
    return `
        <div class="os-empty-table">
            <a href="./login.html">Log In</a>
            <span> or </span>
            <a href="./register.html">Register Now</a>
            <span> to save and trade options through backend.</span>
        </div>
    `;
}

function renderBackendPositionsTable(positions = []) {
    let totalPnl = 0;
    const rows = positions.map((position) => {
        const mark = optionMarkForPosition(position);
        const entry = number(position.entry_price, 0);
        const qty = number(position.quantity, 0);
        const direction = position.action === "SELL" ? -1 : 1;
        const pnl = (mark - entry) * qty * direction;
        totalPnl += pnl;
        const margin = number(position.margin_amount || position.wallet_locked_amount, entry * qty);

        const lotRef = position.position_reference || position.entry_order_reference || position.id || "--";
        const opened = position.opened_at || position.created_at;
        const openedText = opened ? new Date(opened).toLocaleTimeString("en-IN") : "Separate trade";

        const pnlPercent = margin > 0 ? (pnl / margin) * 100 : 0;
        const sign = pnl >= 0 ? "+" : "";
        const pnlPercentText = (pnlPercent >= 0 ? "+" : "") + formatNumber(pnlPercent, 2) + "%";

        return `
            <tr>
                <td class="rt-desktop-only">
                    <span class="block font-bold text-white">${String(lotRef).slice(0, 14)}</span>
                    <span class="block text-[11px] text-slate-400 mt-0.5">${openedText}</span>
                </td>
                <td class="rt-desktop-only">
                    <span class="block font-bold text-white">${position.contract || "--"}</span>
                    <span class="block text-[11px] text-slate-400 mt-0.5">${position.underlying || ""} ${position.option_side || ""}</span>
                </td>
                <td class="rt-desktop-only"><span class="${position.action === "SELL" ? "text-red-400" : "text-emerald-400"} font-semibold">${position.action || "--"}</span></td>
                <td class="rt-desktop-only">${qty}</td>
                <td class="rt-desktop-only">${formatNumber(entry, 2)}</td>
                <td class="rt-desktop-only">${formatNumber(mark, 2)}</td>
                <td class="rt-desktop-only">${formatNumber(margin, 2)}</td>
                <td class="rt-desktop-only ${pnlClass(pnl)}" style="${pnlStyle(pnl)}">${sign}${formatNumber(pnl, Math.abs(pnl) < 1 ? 4 : 2)}</td>
                <td class="rt-desktop-only"><button type="button" class="os-table-btn danger" data-close-option-position="${position.id}" data-close-option-mark="${mark}">Close</button></td>
                
                <td class="rt-mobile-only rt-mobile-card-cell" colspan="9">
                    <div class="rt-mobile-position-card py-1">
                        <!-- Line 1: Contract, Action Badge, PnL & ✕ Close Icon -->
                        <div class="flex justify-between items-center mb-1.5">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="text-xs font-black text-white">${position.contract || "--"}</span>
                                <span class="text-[9.5px] font-black px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800/80 ${position.action === "SELL" ? "text-red-400" : "text-emerald-400"}">${position.action || "--"}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-xs font-black animate-pulse ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}">${sign}${formatNumber(pnl, 2)} (${pnlPercentText})</span>
                                <button class="rt-mobile-close-btn" type="button" data-close-option-position="${position.id}" data-close-option-mark="${mark}" title="Close Position">
                                    ✕
                                </button>
                            </div>
                        </div>

                        <!-- Line 2: 3-Col Grid for QTY | AVG | LTP -->
                        <div class="grid grid-cols-3 gap-1 text-[10.5px] font-semibold text-slate-400 mb-1 bg-slate-950/40 px-2 py-1 rounded-md border border-slate-800/40">
                            <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">QTY</span><span class="font-mono font-black ${position.action === "SELL" ? "text-red-400" : "text-emerald-400"}">${qty}</span></div>
                            <div class="text-center"><span class="text-slate-500 text-[8.5px] font-bold mr-1">AVG</span><span class="font-mono text-white font-bold">${formatNumber(entry, 2)}</span></div>
                            <div class="text-right"><span class="text-slate-500 text-[8.5px] font-bold mr-1">LTP</span><span class="font-mono text-white font-bold">${formatNumber(mark, 2)}</span></div>
                        </div>

                        <!-- Line 3: Dedicated TP/SL Bar -->
                        <div class="flex items-center justify-between text-[10px] font-bold text-slate-400 bg-slate-950/20 px-2 py-0.5 rounded border border-slate-800/30">
                            <span class="text-slate-500 text-[8.5px] uppercase tracking-wider">TP / SL</span>
                            <div class="font-mono truncate ml-2">
                                <span class="text-emerald-400 font-bold">-</span>
                                <span class="text-slate-600 mx-1">/</span>
                                <span class="text-red-400 font-bold">-</span>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    const pnlNode = document.getElementById("optionsTradingPnl");
    if (pnlNode) {
        pnlNode.textContent = (totalPnl >= 0 ? "+" : "") + formatNumber(totalPnl, 2) + " USDT";
        pnlNode.className = totalPnl >= 0 ? "text-emerald-400" : "text-red-400";
    }

    if (!rows) {
        return `<div class="os-empty-table">No backend option positions.</div>`;
    }

    return `
        <div class="os-positions-toolbar rt-desktop-only" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
            <strong style="font-size:13px;color:#e2e8f0;">${positions.length} open option position(s)</strong>
            <button type="button" class="os-table-btn danger" data-close-all-option-positions>Close All Positions</button>
        </div>
        ${tableShell(["Trade", "Contract", "Side", "Qty", "Entry", "Mark", "Margin", "P&L", "Action"], rows, "No backend option positions.", "os-mobile-positions")}
    `;
}

function renderBackendOrdersTable(orders = [], emptyText = "No backend option orders.") {
    const rows = orders.map((order) => {
        const orderRef = order.order_reference || order.id || "--";
        const created = order.created_at || order.updated_at;
        const timeText = formatOrderTime(created);
        const margin = number(order.margin_amount || order.price * order.quantity, 0);
        const statusText = statusLabel(order.status);
        
        let statusColorClass = "text-slate-400";
        if (order.status === "filled") {
            statusColorClass = "text-emerald-400";
        } else if (order.status === "cancelled" || order.status === "rejected") {
            statusColorClass = "text-red-400";
        } else if (order.status === "open" || order.status === "pending_trigger") {
            statusColorClass = "text-cyan-400";
        }

        const showCancel = order.status === "open" || order.status === "pending_trigger";

        return `
            <tr>
                <td class="rt-desktop-only">${orderRef}</td>
                <td class="rt-desktop-only">${order.contract || "--"}</td>
                <td class="rt-desktop-only">${order.action || "--"}</td>
                <td class="rt-desktop-only">${order.order_type || "--"}</td>
                <td class="rt-desktop-only">${formatNumber(order.price, 2)}</td>
                <td class="rt-desktop-only">${order.quantity || 0}</td>
                <td class="rt-desktop-only">${statusLabel(order.status)}</td>
                <td class="rt-desktop-only">${showCancel ? `<button type="button" class="os-table-btn danger" data-cancel-option-order="${order.id}">Cancel</button>` : "--"}</td>
                
                <td class="rt-mobile-only rt-mobile-card-cell" colspan="8">
                    <div class="rt-mobile-position-card py-0.5">
                        <!-- Line 1: Contract, Action/Type Badge, Status & ✕ Cancel Button -->
                        <div class="flex justify-between items-center mb-1">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="text-xs font-black text-white">${order.contract || "--"}</span>
                                <span class="text-[9.5px] font-black px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800/80 ${order.action === 'SELL' ? 'text-red-400' : 'text-emerald-400'}">${order.action || "--"} · ${order.order_type || "LIMIT"}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-[11px] font-black ${statusColorClass}">${statusText}</span>
                                ${showCancel ? `<button class="rt-mobile-close-btn" type="button" data-cancel-option-order="${order.id}" title="Cancel Order">✕</button>` : ""}
                            </div>
                        </div>

                        <!-- Line 2: Dense 1-Line Stats (QTY, PRICE, MARGIN, Ref) -->
                        <div class="flex items-center justify-between text-[10px] font-semibold text-slate-400 bg-slate-950/40 px-2 py-1 rounded-md border border-slate-800/40">
                            <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">QTY</span><span class="font-mono text-white font-bold">${formatNumber(order.quantity || 0, 0)}</span></div>
                            <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">PRICE</span><span class="font-mono text-white font-bold">${formatNumber(order.price, 2)}</span></div>
                            <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">MARGIN</span><span class="font-mono text-white font-bold">${formatNumber(margin, 2)}</span></div>
                            <div class="text-[8.5px] text-slate-500 font-mono border-l border-slate-800 pl-1.5">#${String(orderRef).substring(0, 6)}</div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    return tableShell(["Order ID", "Contract", "Action", "Type", "Price", "Qty", "Status", "Action"], rows, emptyText, "os-mobile-orders");
}

function renderBackendConditionalTable(orders = []) {
    const rows = orders.map((order) => {
        const orderRef = order.order_reference || order.id || "--";
        const created = order.created_at || order.updated_at;
        const timeText = formatOrderTime(created);
        const margin = number(order.margin_amount || order.price * order.quantity, 0);
        const statusText = statusLabel(order.status);
        
        let statusColorClass = "text-slate-400";
        if (order.status === "filled") {
            statusColorClass = "text-emerald-400";
        } else if (order.status === "cancelled" || order.status === "rejected") {
            statusColorClass = "text-red-400";
        } else if (order.status === "open" || order.status === "pending_trigger") {
            statusColorClass = "text-cyan-400";
        }

        const showCancel = order.status === "open" || order.status === "pending_trigger";

        return `
            <tr>
                <td class="rt-desktop-only">${order.contract || "--"}</td>
                <td class="rt-desktop-only">${order.order_type || "--"}</td>
                <td class="rt-desktop-only">${order.stop_price ? formatNumber(order.stop_price, 2) : "--"}</td>
                <td class="rt-desktop-only">${order.take_profit ? formatNumber(order.take_profit, 2) : "--"}</td>
                <td class="rt-desktop-only">${order.stop_loss ? formatNumber(order.stop_loss, 2) : "--"}</td>
                <td class="rt-desktop-only">${statusLabel(order.status)}</td>
                
                <td class="rt-mobile-only rt-mobile-card-cell" colspan="6">
                    <div class="rt-mobile-position-card py-0.5">
                        <!-- Line 1: Contract, Status & ✕ Cancel Button -->
                        <div class="flex justify-between items-center mb-1">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="text-xs font-black text-white">${order.contract || "--"}</span>
                                <span class="text-[9.5px] font-black px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800/80 text-cyan-400">${order.order_type || "CONDITIONAL"}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-[11px] font-black ${statusColorClass}">${statusText}</span>
                                ${showCancel ? `<button class="rt-mobile-close-btn" type="button" data-cancel-option-order="${order.id}" title="Cancel Order">✕</button>` : ""}
                            </div>
                        </div>

                        <!-- Line 2: Dense 1-Line Stats (STOP, TP, SL) -->
                        <div class="flex items-center justify-between text-[10px] font-semibold text-slate-400 bg-slate-950/40 px-2 py-1 rounded-md border border-slate-800/40">
                            <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">STOP</span><span class="font-mono text-white font-bold">${order.stop_price ? formatNumber(order.stop_price, 2) : "--"}</span></div>
                            <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">TP</span><span class="font-mono text-emerald-400 font-bold">${order.take_profit ? formatNumber(order.take_profit, 2) : "--"}</span></div>
                            <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">SL</span><span class="font-mono text-red-400 font-bold">${order.stop_loss ? formatNumber(order.stop_loss, 2) : "--"}</span></div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    return tableShell(["Contract", "Type", "Stop", "TP", "SL", "Status"], rows, "No backend conditional/bracket orders.", "os-mobile-orders");
}

function renderBackendFillsTable(fills = []) {
    const rows = fills.map((fill) => {
        const fillRef = fill.fill_reference || fill.id || "--";
        const created = fill.created_at;
        const timeText = formatOrderTime(created);
        const fee = number(fill.fee || 0, 0);

        return `
            <tr>
                <td class="rt-desktop-only">${fillRef}</td>
                <td class="rt-desktop-only">${fill.contract || "--"}</td>
                <td class="rt-desktop-only">${fill.action || "--"}</td>
                <td class="rt-desktop-only">${fill.option_side || "--"}</td>
                <td class="rt-desktop-only">${formatNumber(fill.price, 2)}</td>
                <td class="rt-desktop-only">${fill.quantity || 0}</td>
                <td class="rt-desktop-only">${formatNumber(fill.fee || 0, 4)}</td>
                <td class="rt-desktop-only">${fill.created_at ? new Date(fill.created_at).toLocaleTimeString("en-IN") : "--"}</td>
                
                <td class="rt-mobile-only rt-mobile-card-cell" colspan="8">
                    <div class="rt-mobile-position-card py-0.5">
                        <!-- Line 1: Contract, Action Badge & Status -->
                        <div class="flex justify-between items-center mb-1">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="text-xs font-black text-white">${fill.contract || "--"}</span>
                                <span class="text-[9.5px] font-black px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800/80 ${fill.action === 'SELL' ? 'text-red-400' : 'text-emerald-400'}">${fill.action || "--"} · ${fill.option_side || "CALL"}</span>
                            </div>
                            <span class="text-xs font-black text-emerald-400">FILLED</span>
                        </div>

                        <!-- Line 2: Dense 1-Line Stats (QTY, PRICE, FEE, Ref) -->
                        <div class="flex items-center justify-between text-[10px] font-semibold text-slate-400 bg-slate-950/40 px-2 py-1 rounded-md border border-slate-800/40">
                            <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">QTY</span><span class="font-mono text-white font-bold">${formatNumber(fill.quantity || 0, 0)}</span></div>
                            <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">PRICE</span><span class="font-mono text-white font-bold">${formatNumber(fill.price, 2)}</span></div>
                            <div><span class="text-slate-500 text-[8.5px] font-bold mr-1">FEE</span><span class="font-mono text-slate-300 font-bold">${formatNumber(fee, 4)}</span></div>
                            <div class="text-[8.5px] text-slate-500 font-mono border-l border-slate-800 pl-1.5">#${String(fillRef).substring(0, 6)}</div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    return tableShell(["Fill ID", "Contract", "Action", "Type", "Price", "Qty", "Fee", "Time"], rows, "No backend fills yet.", "os-mobile-fills");
}

function renderCachedTerminalIfVisible() {
    renderCachedTerminalNow();
}

function txOptionsPaginationControls(container, totalItems, itemsPerPage, currentPage, onPageChange) {
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

async function renderBottomTable() {
    if (!el.terminalTable) {
        return;
    }

    updateBackendBadge();

    if (!isBackendLoggedIn()) {
        el.terminalTable.innerHTML = renderLoginRequiredTable();
        refreshOrderButton();
        return;
    }

    if (state.bottomTab === "positions" && (state.terminalCache.positions || []).length) {
        renderCachedTerminalNow();
    } else {
        el.terminalTable.innerHTML = `<div class="os-empty-table">Loading backend options data...</div>`;
    }

    try {
        if (state.bottomTab === "positions") {
            const data = await backendGet("/positions");
            state.terminalCache.positions = data.positions || [];
            el.terminalTable.innerHTML = renderBackendPositionsTable(state.terminalCache.positions);
        } else if (state.bottomTab === "openOrders") {
            const data = await backendGet("/open-orders");
            state.terminalCache.openOrders = data.orders || [];
            el.terminalTable.innerHTML = renderBackendOrdersTable(state.terminalCache.openOrders, "No backend open option orders.");
        } else if (state.bottomTab === "conditionalOrders") {
            const data = await backendGet("/conditional-orders");
            state.terminalCache.conditionalOrders = data.orders || [];
            el.terminalTable.innerHTML = renderBackendConditionalTable(state.terminalCache.conditionalOrders);
        } else if (state.bottomTab === "fills") {
            const data = await backendGet("/fills");
            state.terminalCache.fills = data.fills || [];
            
            const fills = state.terminalCache.fills;
            const itemsPerPage = window.innerWidth <= 1024 ? 1000 : 10;
            const totalItems = fills.length;
            const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
            
            if (state.fillsPage === undefined) state.fillsPage = 1;
            if (state.fillsPage > totalPages) state.fillsPage = totalPages;
            if (state.fillsPage < 1) state.fillsPage = 1;

            const startIndex = (state.fillsPage - 1) * itemsPerPage;
            const paginatedFills = fills.slice(startIndex, startIndex + itemsPerPage);

            el.terminalTable.innerHTML = renderBackendFillsTable(paginatedFills);
            
            txOptionsPaginationControls(el.terminalTable, totalItems, itemsPerPage, state.fillsPage, (newPage) => {
                state.fillsPage = newPage;
                renderBottomTable();
            });
        } else if (state.bottomTab === "orderHistory") {
            const data = await backendGet("/orders");
            state.terminalCache.orderHistory = data.orders || [];
            
            const orders = state.terminalCache.orderHistory;
            const itemsPerPage = window.innerWidth <= 1024 ? 1000 : 10;
            const totalItems = orders.length;
            const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
            
            if (state.orderHistoryPage === undefined) state.orderHistoryPage = 1;
            if (state.orderHistoryPage > totalPages) state.orderHistoryPage = totalPages;
            if (state.orderHistoryPage < 1) state.orderHistoryPage = 1;

            const startIndex = (state.orderHistoryPage - 1) * itemsPerPage;
            const paginatedOrders = orders.slice(startIndex, startIndex + itemsPerPage);

            el.terminalTable.innerHTML = renderBackendOrdersTable(paginatedOrders, "No backend order history.");
            
            txOptionsPaginationControls(el.terminalTable, totalItems, itemsPerPage, state.orderHistoryPage, (newPage) => {
                state.orderHistoryPage = newPage;
                renderBottomTable();
            });
        }

        bindOptionTerminalActions();
    } catch (error) {
        el.terminalTable.innerHTML = `<div class="os-empty-table">${backendError(error)}</div>`;
    }

    refreshOrderButton();
}

function refreshOrderButton() {
    if (!el.placeOrderBtn) {
        return;
    }

    updateBackendBadge();

    const registerBtn = document.querySelector(".os-register-btn");

    if (!isBackendLoggedIn()) {
        el.placeOrderBtn.textContent = "Log In to Trade";
        el.placeOrderBtn.disabled = false;
        if (registerBtn) {
            registerBtn.style.display = "";
            registerBtn.classList.remove("hidden");
        }
        return;
    }

    if (registerBtn) {
        registerBtn.style.display = "none";
        registerBtn.classList.add("hidden");
    }

    const required = getRequiredFunds();
    el.placeOrderBtn.textContent = `${state.activeAction} ${state.activeSide}`;
    el.placeOrderBtn.setAttribute("data-action-side", state.activeAction || "BUY");
    el.placeOrderBtn.disabled = false;
}

function updateCountdown() {
    const expiry = getExpiryDate().getTime();
    const diff = Math.max(0, expiry - Date.now());
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    if (el.expiryCountdown) {
        el.expiryCountdown.textContent = `${days}d:${String(hours).padStart(2, "0")}h:${String(mins).padStart(2, "0")}m:${String(secs).padStart(2, "0")}s`;
    }
}

function initEvents() {
    if (el.underlyingSelect) {
        el.underlyingSelect.addEventListener("change", () => setUnderlying(el.underlyingSelect.value));
    }

    if (el.expiryTabs) {
        el.expiryTabs.querySelectorAll("button").forEach((button) => {
            button.addEventListener("click", () => {
                activateGroup(Array.from(el.expiryTabs.querySelectorAll("button")), button);
                state.expiryDays = number(button.getAttribute("data-expiry-days"), 1);
                state.selectedStrike = null;
                refreshFromPrice(true);
                updateCountdown();
            });
        });
    }

    document.querySelectorAll(".os-view-tab").forEach((button) => {
        button.addEventListener("click", () => {
            activateGroup(Array.from(document.querySelectorAll(".os-view-tab")), button);
            state.chainViewMode = button.getAttribute("data-view-tab") || "prices";
            renderChain();
            showMessage(`${button.textContent.trim()} view applied.`, "success");
        });
    });

    if (el.strikeSearch) {
        el.strikeSearch.addEventListener("input", renderChain);
    }

    if (el.resetChainBtn) {
        el.resetChainBtn.addEventListener("click", () => {
            if (el.strikeSearch) el.strikeSearch.value = "";
            state.selectedStrike = getAtmStrike();
            refreshFromPrice(true);
        });
    }

    if (el.sideBuy) {
        el.sideBuy.addEventListener("click", () => {
            state.activeAction = "BUY";
            updateOrderSideButtons();
            renderSelectedContract();
            showMessage("Buy / Long selected.", "success");
        });
    }

    if (el.sideSell) {
        el.sideSell.addEventListener("click", () => {
            state.activeAction = "SELL";
            updateOrderSideButtons();
            renderSelectedContract();
            showMessage("Sell / Short selected.", "error");
        });
    }

    document.querySelectorAll("[data-option-order-type]").forEach((button) => {
        button.addEventListener("click", () => {
            activateGroup(Array.from(document.querySelectorAll("[data-option-order-type]")), button);
            state.activeOrderType = button.getAttribute("data-option-order-type") || "MARKET";
            applyOrderTypeUI();
            showMessage(`${state.activeOrderType.replace("_", " ")} order selected.`, "success");
        });
    });

    document.querySelectorAll("[data-book-view]").forEach((button) => {
        button.addEventListener("click", () => {
            activateGroup(Array.from(document.querySelectorAll("[data-book-view]")), button);
            state.bookView = button.getAttribute("data-book-view") || "both";
            renderOrderBook();
        });
    });

    if (el.bookTab && el.tradesTab && el.bookPanel && el.tradesPanel) {
        el.bookTab.addEventListener("click", () => {
            el.bookTab.classList.add("active");
            el.tradesTab.classList.remove("active");
            el.bookPanel.classList.remove("hidden");
            el.tradesPanel.classList.add("hidden");
        });

        el.tradesTab.addEventListener("click", () => {
            el.tradesTab.classList.add("active");
            el.bookTab.classList.remove("active");
            el.tradesPanel.classList.remove("hidden");
            el.bookPanel.classList.add("hidden");
            renderTrades();
        });
    }

    if (el.quantity) {
        el.quantity.addEventListener("input", renderSelectedContract);
    }

    document.querySelectorAll("[data-qty-percent]").forEach((button) => {
        button.addEventListener("click", () => {
            const percent = number(button.getAttribute("data-qty-percent"), 10);
            const price = Math.max(getInputPrice(), getBestOptionPrice(), 0.01);
            const maxAffordable = state.wallet.loaded ? Math.floor(state.wallet.availableBalance / price) : Math.floor(percent / 10);
            const qty = Math.max(1, Math.floor(maxAffordable * (percent / 100)) || Math.floor(percent / 10));
            if (el.quantity) el.quantity.value = qty;
            renderSelectedContract();
        });
    });

    if (el.bracketCheck && el.bracketFields) {
        el.bracketCheck.addEventListener("change", () => {
            el.bracketFields.classList.toggle("hidden", !el.bracketCheck.checked);
        });
    }

    [el.limitPrice, el.stopPrice, el.takeProfit, el.stopLoss].forEach((input) => {
        if (input) {
            input.addEventListener("input", renderSelectedContract);
        }
    });

    document.querySelectorAll("[data-bottom-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            activateGroup(Array.from(document.querySelectorAll("[data-bottom-tab]")), button);
            state.bottomTab = button.getAttribute("data-bottom-tab") || "positions";
            renderBottomTable();
        });
    });

    if (el.placeOrderBtn) {
        el.placeOrderBtn.addEventListener("click", placeBackendOptionOrder);
    }

    initMobileOptionsSubNav();
    initOptionsMobileWalletBar();
    initOptionsMobileMainToggle();
initMobileOptionsDrawer();
}

function initMobileToggleEvents() {
    const callsBtn = document.getElementById("mobileToggleCallsBtn");
    const putsBtn = document.getElementById("mobileTogglePutsBtn");
    
    if (callsBtn && putsBtn) {
        callsBtn.addEventListener("click", () => {
            state.mobileActiveSide = "CALL";
            
            // Style switch (green highlight for calls)
            callsBtn.className = "flex-1 py-2 text-center text-sm font-black rounded-xl transition-all cursor-pointer bg-emerald-400 text-slate-950";
            putsBtn.className = "flex-1 py-2 text-center text-sm font-black rounded-xl transition-all cursor-pointer text-slate-400";
            
            renderChain();
        });
        
        putsBtn.addEventListener("click", () => {
            state.mobileActiveSide = "PUT";
            
            // Style switch (red highlight for puts)
            callsBtn.className = "flex-1 py-2 text-center text-sm font-black rounded-xl transition-all cursor-pointer text-slate-400";
            putsBtn.className = "flex-1 py-2 text-center text-sm font-black rounded-xl transition-all cursor-pointer bg-red-400 text-slate-950";
            
            renderChain();
        });
    }
}

function initMobileOptionsSubNav() {
    const subNavBtns = document.querySelectorAll("#optionsMobileSubNav [data-mobile-tab]");
    const chainCard = document.querySelector(".os-chain-card");
    const bottomCard = document.querySelector(".os-bottom-card");

    if (!subNavBtns.length || !chainCard || !bottomCard) return;

    function switchOptionsMobileTab(tabKey) {
        subNavBtns.forEach((btn) => {
            const isActive = btn.getAttribute("data-mobile-tab") === tabKey;
            btn.classList.toggle("active", isActive);
            btn.classList.toggle("text-white", isActive);
            btn.classList.toggle("text-slate-400", !isActive);
            const indicator = btn.querySelector(".tab-indicator");
            if (indicator) {
                indicator.classList.toggle("hidden", !isActive);
            }
        });

        if (window.innerWidth <= 1024) {
            chainCard.style.display = "flex";
            bottomCard.style.display = "block";

            const targetTabBtn = document.querySelector(`.os-bottom-card [data-bottom-tab="${tabKey}"]`) ||
                document.querySelector(`.os-bottom-card button[data-tab="${tabKey}"]`);
            if (targetTabBtn) {
                targetTabBtn.click();
            }
        }
    }

    subNavBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const tabKey = btn.getAttribute("data-mobile-tab");
            switchOptionsMobileTab(tabKey);
        });
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 1024) {
            chainCard.style.display = "";
            bottomCard.style.display = "";
        }
    });
}


function initOptionsCurrencyToggles() {
    const syncActiveCurrencyUI = () => {
        const activeCurr = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
        document.querySelectorAll("#optionsHeaderCurrencyToggle [data-currency-switch]").forEach((btn) => {
            const btnCurr = (btn.getAttribute("data-currency-switch") || "").toUpperCase();
            const isActive = btnCurr === activeCurr;
            if (isActive) {
                btn.className = "px-2.5 py-0.5 rounded-full text-[11px] font-black transition cursor-pointer bg-cyan-400 text-slate-950 shadow-sm";
            } else {
                btn.className = "px-2.5 py-0.5 rounded-full text-[11px] font-bold transition cursor-pointer text-slate-400 hover:text-white";
            }
        });
        document.querySelectorAll("#optionsMobileCurrencyToggle [data-currency-switch]").forEach((btn) => {
            const btnCurr = (btn.getAttribute("data-currency-switch") || "").toUpperCase();
            const isActive = btnCurr === activeCurr;
            btn.classList.toggle("text-cyan-300", isActive);
            btn.classList.toggle("bg-cyan-500/20", isActive);
            btn.classList.toggle("border", isActive);
            btn.classList.toggle("border-cyan-400/40", isActive);
            btn.classList.toggle("text-slate-400", !isActive);
        });
    };

    document.querySelectorAll("[data-currency-switch]").forEach((btn) => {
        if (btn.__txCurrencyBound) return;
        btn.__txCurrencyBound = true;
        btn.addEventListener("click", () => {
            const targetCurr = (btn.getAttribute("data-currency-switch") || "USDT").toUpperCase();
            localStorage.setItem("tx_navbar_currency", targetCurr);
            syncActiveCurrencyUI();
            window.dispatchEvent(new CustomEvent("traidiumx:currency-change", { detail: { currency: targetCurr } }));
            if (state.wallet.rawWallet) {
                applyWallet(state.wallet.rawWallet);
            } else if (typeof loadOptionsWalletState === "function") {
                loadOptionsWalletState();
            }
        });
    });

    syncActiveCurrencyUI();
    window.addEventListener("traidiumx:currency-change", syncActiveCurrencyUI);
}

function initOptionsMobileWalletBar() {
    const mobTrans = document.getElementById("mobileOptionsTransferBtn");
    const mobDep = document.getElementById("mobileOptionsDepositBtn");
    const mobWith = document.getElementById("mobileOptionsWithdrawBtn");
    const mobCurrToggle = document.getElementById("optionsMobileCurrencyToggle");

    mobTrans?.addEventListener("click", () => openOptionsWalletModal("transfer"));
    mobDep?.addEventListener("click", () => openOptionsWalletModal("deposit"));
    mobWith?.addEventListener("click", () => openOptionsWalletModal("withdraw"));

    if (mobCurrToggle) {
        const currBtns = mobCurrToggle.querySelectorAll("[data-currency-switch]");
        const syncActiveCurrencyUI = () => {
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
                syncActiveCurrencyUI();
                window.dispatchEvent(new CustomEvent("traidiumx:currency-change", { detail: { currency: targetCurr } }));
                if (typeof renderOptionsWalletBalances === "function") {
                    renderOptionsWalletBalances();
                }
            });
        });

        syncActiveCurrencyUI();
        window.addEventListener("traidiumx:currency-change", syncActiveCurrencyUI);
    }
}


function initOptionsMobileMainToggle() {
    const chainBtn = document.getElementById("optionsTitleChainBtn");
    const bookBtn = document.getElementById("optionsTitleBookBtn");
    const subText = document.getElementById("chainSubText");
    const osChainCard = document.querySelector(".os-chain-card");
    const orderBookCard = document.querySelector(".os-book-card");
    const sideMarketCard = document.querySelector(".os-side-market-card");

    if (!chainBtn || !bookBtn || !osChainCard || !orderBookCard || !sideMarketCard) return;

    function resetDesktopLayout() {
        if (orderBookCard.parentElement !== sideMarketCard) {
            sideMarketCard.appendChild(orderBookCard);
        }
        orderBookCard.style.display = "";
        orderBookCard.style.marginTop = "";

        Array.from(osChainCard.children).forEach(child => {
            if (child !== orderBookCard) {
                child.style.display = "";
            }
        });

        if (chainBtn) chainBtn.className = "text-xl sm:text-2xl font-black text-white cursor-pointer transition border-b-2 border-cyan-400 pb-0.5";
        if (bookBtn) bookBtn.className = "text-xl sm:text-2xl font-black text-slate-500 hover:text-white cursor-pointer transition border-b-2 border-transparent pb-0.5 lg:hidden";
        if (subText) {
            const sym = state.activeUnderlying || "BTC";
            subText.textContent = `${sym} live options chain · select strike to trade`;
        }
    }

    function showChainView() {
        if (window.innerWidth > 1024) {
            resetDesktopLayout();
            return;
        }
        chainBtn.className = "text-xl sm:text-2xl font-black text-white cursor-pointer transition border-b-2 border-cyan-400 pb-0.5";
        bookBtn.className = "text-xl sm:text-2xl font-black text-slate-500 hover:text-white cursor-pointer transition border-b-2 border-transparent pb-0.5 lg:hidden";
        
        if (subText) {
            const sym = state.activeUnderlying || "BTC";
            subText.textContent = `${sym} live options chain · select strike to trade`;
        }

        if (orderBookCard.parentElement !== sideMarketCard) {
            sideMarketCard.appendChild(orderBookCard);
        }
        orderBookCard.style.setProperty("display", "none", "important");
        orderBookCard.style.marginTop = "";

        Array.from(osChainCard.children).forEach(child => {
            if (child !== orderBookCard) {
                child.style.display = "";
            }
        });
    }

    function showBookView() {
        if (window.innerWidth > 1024) {
            resetDesktopLayout();
            return;
        }
        bookBtn.className = "text-xl sm:text-2xl font-black text-cyan-300 cursor-pointer transition border-b-2 border-cyan-400 pb-0.5 lg:hidden";
        chainBtn.className = "text-xl sm:text-2xl font-black text-slate-500 hover:text-white cursor-pointer transition border-b-2 border-transparent pb-0.5";
        
        if (subText) {
            const sym = state.activeUnderlying || "BTC";
            subText.textContent = `${sym} live order book · bids & asks depth`;
        }

        if (orderBookCard.parentElement !== osChainCard) {
            osChainCard.appendChild(orderBookCard);
        }

        Array.from(osChainCard.children).forEach(child => {
            if (child.classList.contains("os-chain-header")) {
                child.style.display = "";
            } else if (child === orderBookCard) {
                child.style.setProperty("display", "block", "important");
                child.style.marginTop = "16px";
            } else {
                child.style.display = "none";
            }
        });

        orderBookCard.style.setProperty("display", "block", "important");
        orderBookCard.style.marginTop = "16px";
    }

    chainBtn.addEventListener("click", showChainView);
    bookBtn.addEventListener("click", showBookView);

    if (window.innerWidth > 1024) {
        resetDesktopLayout();
    } else {
        showChainView();
    }

    window.addEventListener("resize", () => {
        if (window.innerWidth > 1024) {
            resetDesktopLayout();
        } else {
            const isBookActive = bookBtn.classList.contains("text-cyan-300");
            if (isBookActive) {
                showBookView();
            } else {
                showChainView();
            }
        }
    });
}

function initMobileOptionsDrawer() {
    const mobileBuyBtn = document.getElementById("optionsMobileBuyBtn");
    const mobileSellBtn = document.getElementById("optionsMobileSellBtn");
    const mobileTradeBtn = document.getElementById("optionsMobileTradeBtn");
    const mobileDrawer = document.getElementById("optionsMobileOrderDrawer");
    const mobileDrawerClose = document.getElementById("optionsMobileDrawerClose");
    const drawerTitle = document.getElementById("optionsMobileDrawerTitle");
    const drawerSlot = document.getElementById("optionsMobileOrderFormSlot");
    const orderCard = document.querySelector(".os-order-card");

    if (!mobileDrawer || !drawerSlot || !orderCard) return;

    function openOptionsMobileDrawer(side) {
        if (orderCard.parentElement !== drawerSlot) {
            drawerSlot.appendChild(orderCard);
            orderCard.style.display = "block";
        }

        if (side) {
            state.activeAction = side;
            const buyTabBtn = document.querySelector('.os-buy-sell-tabs button[data-action="BUY"]');
            const sellTabBtn = document.querySelector('.os-buy-sell-tabs button[data-action="SELL"]');
            if (side === "BUY" && buyTabBtn) buyTabBtn.click();
            if (side === "SELL" && sellTabBtn) sellTabBtn.click();
        }

        if (drawerTitle) {
            const sym = state.activeUnderlying || "BTC";
            drawerTitle.textContent = side ? `${side === "SELL" ? "Sell" : "Buy"} ${sym} Option` : `Trade ${sym} Options`;
        }

        mobileDrawer.classList.remove("hidden");
        mobileDrawer.classList.add("flex");
        document.body.style.overflow = "hidden";
    }

    function closeOptionsMobileDrawer() {
        mobileDrawer.classList.add("hidden");
        mobileDrawer.classList.remove("flex");
        document.body.style.overflow = "";
    }

    mobileBuyBtn?.addEventListener("click", () => openOptionsMobileDrawer("BUY"));
    mobileSellBtn?.addEventListener("click", () => openOptionsMobileDrawer("SELL"));
    mobileTradeBtn?.addEventListener("click", () => openOptionsMobileDrawer("BUY"));
    mobileDrawerClose?.addEventListener("click", closeOptionsMobileDrawer);

    mobileDrawer.addEventListener("click", (e) => {
        if (e.target === mobileDrawer) {
            closeOptionsMobileDrawer();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 1024) {
            const grid = document.querySelector(".os-terminal-grid");
            if (grid && orderCard.parentElement !== grid) {
                grid.appendChild(orderCard);
                orderCard.style.display = "";
            }
            closeOptionsMobileDrawer();
        }
    });
}

function startOptionsPriceSocket() {
    if (state.timers.priceSocket) {
        try { state.timers.priceSocket.close(); } catch (error) { /* ignore */ }
        state.timers.priceSocket = null;
    }
    if (state.timers.indexSocket) {
        try { state.timers.indexSocket.close(); } catch (error) { /* ignore */ }
        state.timers.indexSocket = null;
    }

    const tradeStreams = tickerItems.map((item) => `${item.symbol.toLowerCase()}@aggTrade`);
    const tickerStreams = tickerItems.map((item) => `${item.symbol.toLowerCase()}@ticker`);
    const streams = Array.from(new Set([...tradeStreams, ...tickerStreams])).join("/");

    try {
        const socket = new WebSocket(`${TX_OPTIONS_WS_BASE}${streams}`);
        state.timers.priceSocket = socket;

        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data || "{}");
                const ticker = message.data || message || {};
                const symbol = normalizeProviderSymbol(ticker.s || ticker.symbol);

                if (!symbol) return;

                cacheTicker(symbol, ticker);
                renderTickerStripThrottled(false);
                applyUnderlyingTicker(symbol, ticker, false);
            } catch (error) {
                console.warn("Options live price parse failed:", error);
            }
        };

        socket.onerror = () => {
            console.warn("Options live price socket error. REST fallback remains active.");
        };

        socket.onclose = () => {
            state.timers.priceSocket = null;
            window.clearTimeout(state.timers.reconnectSocket);
            state.timers.reconnectSocket = window.setTimeout(() => {
                if (!document.hidden) {
                    startOptionsPriceSocket();
                }
            }, 3000);
        };
    } catch (error) {
        console.warn("Options live price socket unavailable:", error);
    }
}

function startTimers() {
    updateCountdown();
    state.timers.countdown = window.setInterval(updateCountdown, 1000);

    startOptionsPriceSocket();

    if (state.timers.pricePoll) window.clearInterval(state.timers.pricePoll);
    state.timers.pricePoll = window.setInterval(() => loadUnderlyingPrice(false), TX_OPTIONS_PRICE_POLL_MS);

    if (state.timers.walletPoll) window.clearInterval(state.timers.walletPoll);
    state.timers.walletPoll = window.setInterval(() => {
        if (isBackendLoggedIn()) loadWalletBalance(true);
    }, TX_OPTIONS_WALLET_POLL_MS);

    if (state.timers.tickerPoll) window.clearInterval(state.timers.tickerPoll);
    state.timers.tickerPoll = window.setInterval(() => {
        loadTickerSnapshot();
    }, 7000);

    startTradeTicker();
}

function updateGreeksModalLiveValues() {
    const selected = getSelectedOption();
    const contractCodeNode = document.getElementById("greeksModalContractCode");
    const deltaNode = document.getElementById("greeksModalDelta");
    const gammaNode = document.getElementById("greeksModalGamma");
    const thetaNode = document.getElementById("greeksModalTheta");
    const vegaNode = document.getElementById("greeksModalVega");

    if (contractCodeNode && typeof contractCodeFor === "function") {
        contractCodeNode.textContent = contractCodeFor();
    }
    if (selected) {
        if (deltaNode) deltaNode.textContent = selected.delta !== undefined ? selected.delta.toFixed(2) : "0.50";
        if (gammaNode) gammaNode.textContent = selected.gamma !== undefined ? selected.gamma.toFixed(3) : "0.012";
        if (thetaNode) thetaNode.textContent = selected.theta !== undefined ? selected.theta.toFixed(3) : "-0.010";
        if (vegaNode) vegaNode.textContent = selected.vega !== undefined ? selected.vega.toFixed(3) : "0.080";
    }
}

function initOptionsGuideAndGreeksModals() {
    const btnGuide = document.getElementById("btnOptionsGuide");
    const btnGreeks = document.getElementById("btnOptionsGreeks");
    const guideModal = document.getElementById("optionsGuideModal");
    const greeksModal = document.getElementById("optionsGreeksModal");
    const closeGuideBtn = document.getElementById("closeGuideModalBtn");
    const closeGreeksBtn = document.getElementById("closeGreeksModalBtn");
    const gotItGuideBtn = document.getElementById("btnGotItGuide");
    const gotItGreeksBtn = document.getElementById("btnGotItGreeks");

    const hideGuide = () => {
        if (guideModal) {
            guideModal.style.display = "none";
            document.body.style.overflow = "";
        }
    };

    const hideGreeks = () => {
        if (greeksModal) {
            greeksModal.style.display = "none";
            document.body.style.overflow = "";
        }
    };

    if (btnGuide && guideModal) {
        btnGuide.addEventListener("click", () => {
            guideModal.style.display = "flex";
            document.body.style.overflow = "hidden";
        });
    }

    if (closeGuideBtn) closeGuideBtn.addEventListener("click", hideGuide);
    if (gotItGuideBtn) gotItGuideBtn.addEventListener("click", hideGuide);

    if (guideModal) {
        guideModal.addEventListener("click", (e) => {
            if (e.target === guideModal) hideGuide();
        });
    }

    if (btnGreeks) {
        btnGreeks.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Toggle Greeks view mode in Options Chain table!
            state.chainViewMode = state.chainViewMode === "greeks" ? "prices" : "greeks";
            
            const isGreeksActive = state.chainViewMode === "greeks";
            if (isGreeksActive) {
                btnGreeks.style.backgroundColor = "#22d3ee";
                btnGreeks.style.color = "#020617";
                btnGreeks.style.borderColor = "#22d3ee";
                btnGreeks.style.fontWeight = "900";
                btnGreeks.style.boxShadow = "0 0 14px rgba(34, 211, 238, 0.55)";
            } else {
                btnGreeks.style.backgroundColor = "";
                btnGreeks.style.color = "";
                btnGreeks.style.borderColor = "";
                btnGreeks.style.fontWeight = "";
                btnGreeks.style.boxShadow = "";
            }
            
            renderChain();
        });
    }

    if (closeGreeksBtn) closeGreeksBtn.addEventListener("click", hideGreeks);
    if (gotItGreeksBtn) gotItGreeksBtn.addEventListener("click", hideGreeks);

    if (greeksModal) {
        greeksModal.addEventListener("click", (e) => {
            if (e.target === greeksModal) hideGreeks();
        });
    }
}

function initOptionsAssetPicker() {
    const triggerBtn = document.getElementById("optionsTitleDropdownBtn");
    const dropdown = document.getElementById("optionsAssetPickerDropdown");
    const selectEl = document.getElementById("optionsUnderlyingSelect");

    if (!triggerBtn || !dropdown) return;

    const toggleDropdown = (show) => {
        const isVisible = show !== undefined ? show : dropdown.style.display === "none" || dropdown.style.display === "";
        dropdown.style.display = isVisible ? "block" : "none";
    };

    triggerBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleDropdown();
    });

    document.addEventListener("click", (e) => {
        if (!dropdown.contains(e.target) && !triggerBtn.contains(e.target)) {
            toggleDropdown(false);
        }
    });

    dropdown.querySelectorAll("button[data-asset]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const asset = btn.getAttribute("data-asset");
            if (asset) {
                if (selectEl) {
                    selectEl.value = asset;
                }
                setUnderlying(asset);
                toggleDropdown(false);
            }
        });
    });
}

async function initOptionsTerminal() {
    initOptionsWalletQuickActions();
    showLoginExpiredNoticeIfNeeded();
    initOptionsAssetPicker();
    const params = new URLSearchParams(window.location.search);
    const pathSymbol = String(window.location.pathname.split("/").filter(Boolean).pop() || "").toUpperCase();
    const symbolParam = String(params.get("symbol") || pathSymbol || "").toUpperCase();

    if (symbolParam.includes("SOL")) {
        state.activeUnderlying = "SOL";
        state.underlyingPrice = underlyings.SOL.fallbackPrice;
    } else if (symbolParam.includes("ETH")) {
        state.activeUnderlying = "ETH";
        state.underlyingPrice = underlyings.ETH.fallbackPrice;
    } else if (symbolParam.includes("BTC")) {
        state.activeUnderlying = "BTC";
        state.underlyingPrice = underlyings.BTC.fallbackPrice;
    }

    primeTickerFallbacks();
    state.underlyingPrice = getUnderlyingPriceForCode(state.activeUnderlying);
    
    // Render immediate fallbacks so UI is interactive instantly
    generateChain();
    refreshFromPrice(true);
    initEvents();
    initMobileToggleEvents();
    initOptionsGuideAndGreeksModals();
    applyOrderTypeUI();
    updateOrderSideButtons();
    updateBackendBadge();
    renderTickerStripThrottled(true);
    renderBottomTable();
    startTimers();

    // Load actual dynamic data in background
    loadTickerSnapshot().then(() => {
        renderTickerStripThrottled(true);
    }).catch(err => console.warn("Failed to load ticker snapshot:", err));

    loadUnderlyingPrice(true).then(() => {
        state.underlyingPrice = getUnderlyingPriceForCode(state.activeUnderlying);
        generateChain();
        refreshFromPrice(true);
    }).catch(err => console.warn("Failed to load underlying price:", err));

    if (isBackendLoggedIn()) {
        loadWalletBalance(true).catch(err => console.warn("Failed to load wallet balance:", err));
    }
}

const optionsWalletAddressState = {
    networks: [],
    loaded: false,
    loading: false,
    error: "",
    minAmount: 10,
    maxAmount: 1000000
};

function getOptionsWalletModalNodes() {
    return {
        modal: document.getElementById("optionsWalletModal"),
        closeBtn: document.getElementById("optionsWalletModalClose"),
        title: document.getElementById("optionsWalletModalTitle"),
        panels: Array.from(document.querySelectorAll("[data-options-wallet-panel]")),
        message: document.getElementById("optionsWalletModalMessage"),
        tradingBalance: document.getElementById("optionsModalTradingBalance"),
        mainBalance: document.getElementById("optionsModalMainBalance"),
        tradingPnl: document.getElementById("optionsModalTradingPnl"),
        transferForm: document.getElementById("optionsTransferForm"),
        depositForm: document.getElementById("optionsDepositForm"),
        withdrawForm: document.getElementById("optionsWithdrawForm"),
        depositNetworkSelect: document.querySelector('#optionsDepositForm [name="crypto_network"]'),
        withdrawNetworkSelect: document.querySelector('#optionsWithdrawForm [name="crypto_network"]'),
        depositAddress: document.getElementById("optionsDepositAddress"),
        depositAddressStatus: document.getElementById("optionsDepositAddressStatus"),
        copyDepositAddressBtn: document.getElementById("optionsCopyDepositAddressBtn"),
        transferMessage: document.getElementById("optionsTransferMessage"),
        depositMessage: document.getElementById("optionsDepositMessage"),
        withdrawMessage: document.getElementById("optionsWithdrawMessage")
    };
}

function getActiveOptionsWalletAction() {
    const nodes = getOptionsWalletModalNodes();
    const action = String(nodes.modal?.dataset.walletAction || "transfer").toLowerCase();
    return ["transfer", "deposit", "withdraw"].includes(action) ? action : "transfer";
}

// Stacking context z-index fix
function setModalZIndex() {
    const nodes = getOptionsWalletModalNodes();
    if (nodes.modal) {
        nodes.modal.style.zIndex = "99999";
    }
}

function getOptionsWalletMessageNodes() {
    const nodes = getOptionsWalletModalNodes();
    return {
        transfer: nodes.transferMessage,
        deposit: nodes.depositMessage,
        withdraw: nodes.withdrawMessage,
        legacy: nodes.message
    };
}

function clearOptionsWalletModalMessages() {
    const messageNodes = getOptionsWalletMessageNodes();
    Object.values(messageNodes).forEach((node) => {
        if (!node) return;
        node.className = node.id === "optionsWalletModalMessage" ? "hidden" : "options-wallet-panel-message hidden";
        node.textContent = "";
    });
}

function setOptionsWalletModalMessage(message = "", type = "success") {
    const messageNodes = getOptionsWalletMessageNodes();
    const clean = String(message || "").trim();

    if (!clean) {
        clearOptionsWalletModalMessages();
        return;
    }

    const action = getActiveOptionsWalletAction();
    const target = messageNodes[action] || messageNodes.legacy;
    if (!target) return;

    const tone = type === "error" ? "error" : type === "info" ? "info" : "success";
    target.textContent = clean;
    target.className = messageNodes.legacy === target
        ? (tone === "error"
            ? "mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-200"
            : tone === "info"
                ? "mt-4 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-black text-cyan-100"
                : "mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-200")
        : `options-wallet-panel-message ${tone}`;
}

let OPTIONS_USDT_RATE = 88.50;

async function fetchOptionsUsdtRate() {
    try {
        const response = await apiRequest("/wallet/usdt-rate");
        if (response && response.data && response.data.usdt_rate) {
            OPTIONS_USDT_RATE = Number(response.data.usdt_rate) || 88.50;
        }
    } catch (e) {
        console.warn("USDT rate fetch skipped:", e);
    }
    const rateText = `1 USDT = ₹${OPTIONS_USDT_RATE.toFixed(2)} INR`;
    const badge = document.getElementById("optionsTransferUsdtRateText");
    if (badge) badge.textContent = rateText;

    if (typeof txUpdateSubTransferPreview === "function") {
        txUpdateSubTransferPreview(OPTIONS_USDT_RATE);
    }

    const depInput = document.getElementById("optionsDepositAmount");
    if (depInput) depInput.dispatchEvent(new Event("input"));
    const withInput = document.getElementById("optionsWithdrawAmount");
    if (withInput) withInput.dispatchEvent(new Event("input"));
    const trfInput = document.getElementById("optionsTransferAmount");
    if (trfInput) trfInput.dispatchEvent(new Event("input"));
}

function openOptionsWalletModal(action = "transfer") {
    const nodes = getOptionsWalletModalNodes();

    // Update active sub-account labels in the modal
    const activeSelector = document.getElementById("tradingAccountSelector");
    const activeText = activeSelector && activeSelector.value !== "main" 
        ? activeSelector.options[activeSelector.selectedIndex]?.text 
        : "Trading";

    const modalTradingLabel = document.getElementById("optionsModalTradingLabel");
    if (modalTradingLabel) {
        modalTradingLabel.textContent = activeText;
    }

    const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const isINR = primaryCurrency === "INR";
    const rateBadge = document.getElementById("optionsTransferUsdtRateBadge");
    if (rateBadge) {
        rateBadge.style.display = isINR ? "flex" : "none";
    }

    const transferDirSelect = document.getElementById("optionsTransferDirection");
    if (transferDirSelect) {
        if (isINR) {
            transferDirSelect.options[0].textContent = `Main Wallet (INR) → ${activeText} (USD)`;
            transferDirSelect.options[1].textContent = `${activeText} (USD) → Main Wallet (INR)`;
        } else {
            transferDirSelect.options[0].textContent = `Main Wallet (USD) → ${activeText} (USD)`;
            transferDirSelect.options[1].textContent = `${activeText} (USD) → Main Wallet (USD)`;
        }
    }

    if (!nodes.modal) return;
    if (nodes.depositForm) {
        const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
        nodes.depositForm.dataset.activeCurrency = primaryCurrency;
    }
    if (nodes.withdrawForm) {
        const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
        nodes.withdrawForm.dataset.activeCurrency = primaryCurrency;
    }
    fetchOptionsUsdtRate();
    updateOptionsDepositModalUIByCurrency();
    updateOptionsWithdrawalModalUIByCurrency();
    updateOptionsWalletModalBalances();
    setOptionsWalletModalTab(action);
    setModalZIndex();
    nodes.modal.style.display = "flex";
    nodes.modal.classList.remove("hidden");
}

function closeOptionsWalletModal() {
    const nodes = getOptionsWalletModalNodes();
    if (!nodes.modal) return;
    nodes.modal.style.display = "none";
    nodes.modal.classList.add("hidden");
    setOptionsWalletModalMessage("");
}

function setOptionsWalletModalTab(action = "transfer") {
    const nodes = getOptionsWalletModalNodes();
    const target = ["transfer", "deposit", "withdraw"].includes(String(action).toLowerCase()) ? String(action).toLowerCase() : "transfer";
    const titleMap = {
        transfer: "Transfer Funds",
        deposit: "Deposit to Main Wallet",
        withdraw: "Withdraw from Main Wallet"
    };

    if (nodes.modal) nodes.modal.dataset.walletAction = target;
    if (nodes.title) nodes.title.textContent = titleMap[target] || "Wallet Quick Action";

    nodes.panels.forEach((panel) => {
        panel.classList.toggle("hidden", panel.getAttribute("data-options-wallet-panel") !== target);
    });

    if (target === "deposit") {
        updateOptionsDepositAddressUI();
        loadOptionsDepositAddresses(true);
    }

    updateOptionsWalletModalBalances();
    setOptionsWalletModalMessage("");
}

function updateOptionsWalletModalBalances() {
    try {
        const nodes = getOptionsWalletModalNodes();
        if (!nodes.modal) return;

        const wallet = state.wallet.rawWallet || {};
        let mainCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";

        const activePanel = nodes.modal.querySelector("[data-options-wallet-panel]:not(.hidden)");
        const action = activePanel?.getAttribute("data-options-wallet-panel");
        if (action === "deposit") {
            mainCurrency = nodes.depositForm?.dataset.activeCurrency || mainCurrency;
        } else if (action === "withdraw") {
            mainCurrency = nodes.withdrawForm?.dataset.activeCurrency || mainCurrency;
        }

        const mainWallet = mainCurrency === "INR" ? (wallet.main_wallet_inr || {}) : (wallet.main_wallet_usdt || {});
        const tradingBal = state.wallet.availableBalance || 0;
        const mainBal = Number(mainWallet.available_balance ?? 0);

        if (nodes.tradingBalance) nodes.tradingBalance.textContent = formatMoney(tradingBal, 2, "USDT");
        if (nodes.mainBalance) {
            nodes.mainBalance.textContent = mainCurrency === "INR" ? `₹${mainBal.toFixed(2)}` : `$${mainBal.toFixed(2)}`;
        }

        const pnlText = nodes.summaryPnl?.textContent || "+0.00";
        if (nodes.tradingPnl) {
            nodes.tradingPnl.textContent = `${pnlText} USD`;
            nodes.tradingPnl.className = pnlText.includes("-") ? "mt-1 block text-red-300" : "mt-1 block text-emerald-300";
        }
    } catch (err) {
        console.error("Error in updateOptionsWalletModalBalances:", err);
    }
}

function syncOptionsWalletModalCurrencyUI(nodes, primaryCurrency) {
    if (!nodes) return;
    const activeCurrency = nodes.depositForm?.dataset.activeCurrency;
    updateOptionsDepositModalUIByCurrency(activeCurrency || primaryCurrency);
    updateOptionsWithdrawalModalUIByCurrency();
    updateOptionsDepositAddressUI();
}

function updateOptionsDepositModalUIByCurrency(currency) {
    const nodes = getOptionsWalletModalNodes();
    const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const activeCurrency = primaryCurrency; // Force matching navbar currency
    if (nodes.depositForm) nodes.depositForm.dataset.activeCurrency = activeCurrency;

    const isINR = activeCurrency === "INR";
    const isLocked = true; // Hide toggle bar

    const inrBox = document.getElementById("optionsInrDepositBox");
    const cryptoBox = document.getElementById("optionsCryptoDepositBox");
    const amountLabel = document.getElementById("optionsDepositAmountLabel");
    const depositAmountInput = document.getElementById("optionsDepositAmount");
    const subtitle = document.getElementById("optionsDepositSubtitle");
    const toggleBar = document.getElementById("optionsDepositCurrencyToggleBar");
    const btnInr = document.getElementById("optionsSelectInrBtn");
    const btnUsdt = document.getElementById("optionsSelectUsdtBtn");
    const submitBtn = document.getElementById("optionsCreateDepositBtn");
    const footerSubtext = document.getElementById("optionsDepositFooterSubtext");
    const cryptoAssetInput = document.getElementById("optionsCryptoAsset");

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
    updateOptionsWalletModalBalances();
}

function updateOptionsWithdrawalModalUIByCurrency(currency) {
    const nodes = getOptionsWalletModalNodes();
    const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const activeCurrency = primaryCurrency; // Force matching navbar currency
    if (nodes.withdrawForm) nodes.withdrawForm.dataset.activeCurrency = activeCurrency;

    const isINR = activeCurrency === "INR";
    const netBox = document.getElementById("optionsWithdrawNetworkBox");
    const tagBox = document.getElementById("optionsWithdrawTagBox");
    const subTitle = document.getElementById("optionsWithdrawSubtitle");
    const amountLabel = document.getElementById("optionsWithdrawAmountLabel");
    const addressLabel = document.getElementById("optionsWithdrawalAddressLabel");
    const addressInput = document.getElementById("optionsWithdrawalAddress");
    const methodInput = document.getElementById("optionsWithdrawMethodInput");
    const assetInput = document.getElementById("optionsWithdrawAsset");
    const btnInr = document.getElementById("txOptionsSelectWithdrawInrBtn");
    const btnUsdt = document.getElementById("txOptionsSelectWithdrawUsdtBtn");

    const toggleBar = document.getElementById("txOptionsWithdrawCurrencyToggleBar");
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

    const withInput = document.getElementById("optionsWithdrawAmount");
    if (withInput) withInput.dispatchEvent(new Event("input"));
    updateOptionsWalletModalBalances();
}

async function updateOptionsWithdrawalFeePreview() {
    const withInput = document.getElementById("optionsWithdrawAmount");
    const netSelect = document.getElementById("optionsWithdrawNetwork");

    const amountEl = document.getElementById("optionsWithdrawPreviewAmount");
    const receiveEl = document.getElementById("optionsWithdrawPreviewReceive");
    const feeEl = document.getElementById("optionsWithdrawPreviewCompanyFee");
    const debitEl = document.getElementById("optionsWithdrawPreviewTotalDebit");
    const noteEl = document.getElementById("optionsWithdrawPreviewNote");

    if (!withInput) return;

    const val = parseFloat(withInput.value || 0);
    const primaryCurrency = (state.wallet.primaryCurrency || "INR").toUpperCase();
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
        const response = await apiRequest("/fees/estimate", {
            method: "POST",
            body: JSON.stringify({
                product: "withdrawal",
                amount: val,
                crypto_network: network
            })
        });

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

function bindOptionsRealtimeConversionCalculator() {
    const depInput = document.getElementById("optionsDepositAmount");
    const youDepEl = document.getElementById("optionsDepCalcYouDeposit");
    const walletCreditEl = document.getElementById("optionsDepCalcWalletCredit");
    const rateNoteEl = document.getElementById("optionsDepCalcRateNote");

    if (depInput) {
        const updateDep = () => {
            const val = parseFloat(depInput.value || 0);
            const rate = OPTIONS_USDT_RATE || 88.50;
            const primaryCurrency = (state.wallet.primaryCurrency || "INR").toUpperCase();
            const activeForm = document.getElementById("optionsDepositForm");
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
                const minUsdt = optionsWalletAddressState.minAmount || 10;
                const minInr = (minUsdt * rate).toFixed(0);
                if (rateNoteEl) rateNoteEl.textContent = `Min $${minUsdt} / ₹${minInr} · $1 = ₹${rate.toFixed(2)}`;
            }
        };
        depInput.addEventListener("input", updateDep);
        depInput.addEventListener("keyup", updateDep);
        updateDep();
    }

    const withInput = document.getElementById("optionsWithdrawAmount");
    const withPrev = document.getElementById("optionsWithdrawConversionPreview");
    const netSelect = document.getElementById("optionsWithdrawNetwork");

    if (withInput) {
        const updateWith = () => {
            const val = parseFloat(withInput.value || 0);
            const rate = OPTIONS_USDT_RATE || 88.50;
            const isINR = (state.wallet.primaryCurrency || "INR").toUpperCase() === "INR";
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
            updateOptionsWithdrawalFeePreview();
        };
        withInput.addEventListener("input", updateWith);
        withInput.addEventListener("keyup", updateWith);
        netSelect?.addEventListener("change", updateWith);
        updateWith();
    }

    const trfInput = document.getElementById("optionsTransferAmount");
    const trfDir = document.getElementById("optionsTransferDirection");
    const trfPrev = document.getElementById("optionsTransferConversionPreview");
    const trfLabel = document.getElementById("optionsTransferAmountLabel");
    const trfMaxBtn = document.getElementById("optionsTransferMaxBtn");

    if (trfInput && trfPrev) {
        const updateTrf = () => {
            const val = parseFloat(trfInput.value || 0);
            const rate = OPTIONS_USDT_RATE || 88.50;
            const dir = trfDir?.value || "main_to_trading";
            const primaryCurrency = (state.wallet.primaryCurrency || "INR").toUpperCase();
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
                const mainWallet = state.wallet.rawWallet?.main_wallet || {};
                const tradingWallet = state.wallet.rawWallet?.trading_wallet || {};
                if (dir === "main_to_trading") {
                    trfInput.value = number(mainWallet.available_balance, 0);
                } else {
                    trfInput.value = number(tradingWallet.available_balance, 0);
                }
                trfInput.dispatchEvent(new Event("input"));
            });
        }
    }
}

async function refreshOptionsWalletAfterAction() {
    await loadWalletBalance(true);
    updateOptionsWalletModalBalances();
}

function getSelectedOptionsDepositNetwork() {
    const netEl = document.getElementById("optionsCryptoNetwork");
    const selected = String(netEl?.value || "TRC20").trim().toUpperCase();
    return ["TRC20", "ERC20", "BEP20"].includes(selected) ? selected : "TRC20";
}

function getSelectedOptionsDepositAddressInfo() {
    const network = getSelectedOptionsDepositNetwork();
    return (optionsWalletAddressState.networks || []).find((item) => {
        return String(item.network || "").trim().toUpperCase() === network;
    }) || null;
}

function updateOptionsDepositAddressUI() {
    const addressInfo = getSelectedOptionsDepositAddressInfo();
    const address = String(addressInfo?.address || "").trim();
    const isConfigured = Boolean(addressInfo?.is_configured && address);
    const network = getSelectedOptionsDepositNetwork();

    const boxLabel = document.getElementById("optionsCryptoAddressBoxLabel");
    if (boxLabel) boxLabel.textContent = `USDT ${network}`;

    const addrEl = document.getElementById("optionsDepositAddress");
    const statusEl = document.getElementById("optionsDepositAddressStatus");
    const confirmEl = document.getElementById("optionsDepositAddressConfirmation");

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
}

async function loadOptionsDepositAddresses(silent = true) {
    if (optionsWalletAddressState.loading || !isBackendLoggedIn()) {
        updateOptionsDepositAddressUI();
        return;
    }

    optionsWalletAddressState.loading = true;
    optionsWalletAddressState.error = "";
    updateOptionsDepositAddressUI();

    try {
        const response = await apiRequest("/deposit/crypto-addresses");
        optionsWalletAddressState.networks = response?.data?.networks || [];
        optionsWalletAddressState.minAmount = Number(response?.data?.min_amount || 10);
        optionsWalletAddressState.maxAmount = Number(response?.data?.max_amount || 1000000);
        
        const amountInput = document.getElementById("optionsDepositAmount");
        if (amountInput) {
            amountInput.min = String(optionsWalletAddressState.minAmount || 0);
            amountInput.max = String(optionsWalletAddressState.maxAmount || 1000000);
        }
        optionsWalletAddressState.loaded = true;
    } catch (error) {
        optionsWalletAddressState.error = backendError(error, "Unable to load company deposit address.");
        if (!silent) {
            setOptionsWalletModalMessage(optionsWalletAddressState.error, "error");
        }
    } finally {
        optionsWalletAddressState.loading = false;
        updateOptionsDepositAddressUI();
    }
}

async function copyOptionsDepositAddress() {
    const addressInfo = getSelectedOptionsDepositAddressInfo();
    const address = String(addressInfo?.address || "").trim();

    if (!address || !addressInfo?.is_configured) {
        setOptionsWalletModalMessage("Company deposit address is not configured for this network.", "error");
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
        showMessage("Deposit address copied to clipboard.", "success");
    } catch (err) {
        setOptionsWalletModalMessage("Clipboard copy failed.", "error");
    }
}

function copyOptionsInrUpiId() {
    const upiElement = document.getElementById("optionsInrUpiId");
    const upiText = upiElement ? upiElement.textContent.trim() : "traidiumx@upi";
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(upiText).then(() => {
            setOptionsWalletModalMessage(`UPI ID (${upiText}) copied to clipboard!`, "success");
        });
    } else {
        setOptionsWalletModalMessage(`UPI ID (${upiText}) copied!`, "success");
    }
}

async function handleOptionsTransferSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form?.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const direction = String(formData.get("direction") || "main_to_trading");
    const amount = number(formData.get("amount"), 0);

    if (!amount || amount <= 0) {
        setOptionsWalletModalMessage("Please enter valid transfer amount.", "error");
        return;
    }

    try {
        if (button) button.disabled = true;
        const activeSubId = localStorage.getItem("traidiumx_active_user_id");
        let response;
        if (activeSubId) {
            const mappedDirection = direction === "main_to_trading" ? "main_to_sub" : "sub_to_main";
            const currency = localStorage.getItem("tx_navbar_currency") || "USDT";
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
            const currency = localStorage.getItem("tx_navbar_currency") || "USDT";
            response = await apiRequest("/wallet/transfer", {
                method: "POST",
                body: JSON.stringify({ amount, direction, currency })
            });
        }

        form.reset();
        await refreshOptionsWalletAfterAction();
        closeOptionsWalletModal();
        showMessage(response.message || "Wallet transfer completed successfully.", "success");
    } catch (error) {
        setOptionsWalletModalMessage(backendError(error, "Wallet transfer failed."), "error");
    } finally {
        if (button) button.disabled = false;
    }
}

async function handleOptionsDepositSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form?.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const activeCurrency = String(form.dataset.activeCurrency || state.wallet.primaryCurrency || "INR").toUpperCase();
    const isINR = activeCurrency === "INR";
    const amount = number(formData.get("amount"), 0);

    if (!amount || amount <= 0) {
        setOptionsWalletModalMessage("Please enter valid deposit amount.", "error");
        return;
    }

    if (isINR) {
        const utr = String(formData.get("inr_utr_number") || "").trim();
        if (amount < 10) {
            setOptionsWalletModalMessage("Minimum deposit amount is ₹10 INR.", "error");
            return;
        }
        if (!utr) {
            setOptionsWalletModalMessage("Please enter 12-digit UTR or Transaction Ref ID.", "error");
            return;
        }
        try {
            if (button) button.disabled = true;
            const response = await apiRequest("/deposit/create", {
                method: "POST",
                body: JSON.stringify({
                    amount,
                    payment_method: "inr_deposit",
                    crypto_asset: "INR",
                    crypto_network: "UPI/BANK",
                    inr_utr_number: utr
                })
            });

            form.reset();
            await refreshOptionsWalletAfterAction();
            closeOptionsWalletModal();
            showMessage(response.message || "INR Deposit submitted. Main Wallet will be credited after verification.", "success");
        } catch (error) {
            if (isOptionsKycRequired(error)) {
                clearOptionsWalletModalMessages();
                closeOptionsWalletModal();
                showMessage(`KYC is compulsory at deposit time. Please complete KYC first. <a href="./kyc.html" class="underline font-black text-cyan-300">Click here to complete KYC</a>`, "error");
            } else {
                setOptionsWalletModalMessage(backendError(error, "Unable to create deposit."), "error");
            }
        } finally {
            if (button) button.disabled = false;
        }
        return;
    }

    // USDT Deposit Flow
    const cryptoNetwork = String(formData.get("crypto_network") || "TRC20").trim().toUpperCase();
    const depositAddressConfirmation = String(document.getElementById("optionsDepositAddress")?.textContent || "").trim();

    if (amount < Number(optionsWalletAddressState.minAmount || 10)) {
        setOptionsWalletModalMessage(`Minimum deposit amount is ${optionsWalletAddressState.minAmount || 10} USDT.`, "error");
        return;
    }

    try {
        if (button) button.disabled = true;
        const response = await apiRequest("/deposit/create", {
            method: "POST",
            body: JSON.stringify({
                amount,
                payment_method: "crypto_deposit",
                crypto_asset: "USDT",
                crypto_network: cryptoNetwork,
                deposit_address_confirmation: depositAddressConfirmation
            })
        });

        form.reset();
        await refreshOptionsWalletAfterAction();
        const depositStatus = String(response?.data?.deposit?.status || "").toLowerCase();
        const message = response.message || "Deposit submitted. Main Wallet will be credited only after company wallet/blockchain verification.";
        const tone = depositStatus === "completed" ? "success" : "info";
        closeOptionsWalletModal();
        showMessage(message, tone);
    } catch (error) {
        if (isOptionsKycRequired(error)) {
            clearOptionsWalletModalMessages();
            closeOptionsWalletModal();
            showMessage(`KYC is compulsory at deposit time. Please complete KYC first. <a href="./kyc.html" class="underline font-black text-cyan-300">Click here to complete KYC</a>`, "error");
        } else {
            setOptionsWalletModalMessage(backendError(error, "Unable to create deposit."), "error");
        }
    } finally {
        if (button) button.disabled = false;
    }
}

async function handleOptionsWithdrawSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form?.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const isINR = (state.wallet.primaryCurrency || "INR").toUpperCase() === "INR";
    const amount = number(formData.get("amount"), 0);
    const cryptoNetwork = String(formData.get("crypto_network") || "TRC20").trim().toUpperCase();
    const withdrawalAddress = String(formData.get("withdrawal_address") || "").trim();
    const destinationTag = String(formData.get("destination_tag") || "").trim();

    if (!amount || amount <= 0) {
        setOptionsWalletModalMessage("Please enter valid withdrawal amount.", "error");
        return;
    }

    if (!withdrawalAddress) {
        setOptionsWalletModalMessage(isINR ? "Please enter Bank Account or UPI ID for withdrawal." : "Please enter withdrawal address.", "error");
        return;
    }

    try {
        if (button) button.disabled = true;
        const response = await apiRequest("/withdrawal/request", {
            method: "POST",
            body: JSON.stringify({
                amount,
                withdrawal_method: isINR ? "inr_withdrawal" : "crypto_withdrawal",
                crypto_asset: isINR ? "INR" : "USDT",
                crypto_network: isINR ? "UPI/BANK" : cryptoNetwork,
                withdrawal_address: withdrawalAddress,
                destination_tag: isINR ? "" : destinationTag
            })
        });

        form.reset();
        await refreshOptionsWalletAfterAction();
        const message = response.message || (isINR ? "INR Withdrawal request created. Admin approval is required." : "Withdrawal request created. Admin approval and TX hash are required.");
        closeOptionsWalletModal();
        showMessage(message, "success");
    } catch (error) {
        setOptionsWalletModalMessage(backendError(error, "Unable to create withdrawal request."), "error");
    } finally {
        if (button) button.disabled = false;
    }
}

function initOptionsWalletQuickActions() {
    try {
        const nodes = getOptionsWalletModalNodes();
        if (!nodes.modal) {
            setTimeout(initOptionsWalletQuickActions, 100);
            return;
        }
        if (nodes.modal.dataset.bound === "1") {
            return;
        }

        nodes.modal.dataset.bound = "1";
        nodes.closeBtn?.addEventListener("click", closeOptionsWalletModal);
        nodes.modal.addEventListener("click", (event) => {
            if (event.target === nodes.modal) closeOptionsWalletModal();
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && nodes.modal.style.display === "flex") {
                closeOptionsWalletModal();
            }
        });

        const btnUsdt = document.getElementById("optionsSelectUsdtBtn");
        const btnInr = document.getElementById("optionsSelectInrBtn");
        btnUsdt?.addEventListener("click", () => updateOptionsDepositModalUIByCurrency("USDT"));
        btnInr?.addEventListener("click", () => updateOptionsDepositModalUIByCurrency("INR"));

        const btnWithdrawUsdt = document.getElementById("txOptionsSelectWithdrawUsdtBtn");
        const btnWithdrawInr = document.getElementById("txOptionsSelectWithdrawInrBtn");
        btnWithdrawUsdt?.addEventListener("click", () => updateOptionsWithdrawalModalUIByCurrency("USDT"));
        btnWithdrawInr?.addEventListener("click", () => updateOptionsWithdrawalModalUIByCurrency("INR"));

        const copyInrBtn = document.getElementById("optionsCopyInrUpiBtn");
        copyInrBtn?.addEventListener("click", copyOptionsInrUpiId);

        const copyCryptoBtn = document.getElementById("optionsCopyCryptoAddressBtn");
        copyCryptoBtn?.addEventListener("click", copyOptionsDepositAddress);

        const cryptoNetSelect = document.getElementById("optionsCryptoNetwork");
        cryptoNetSelect?.addEventListener("change", updateOptionsDepositAddressUI);

        bindOptionsRealtimeConversionCalculator();

        nodes.transferForm?.addEventListener("submit", handleOptionsTransferSubmit);
        nodes.depositForm?.addEventListener("submit", handleOptionsDepositSubmit);
        nodes.withdrawForm?.addEventListener("submit", handleOptionsWithdrawSubmit);

        // Bind header buttons using delegated click listener to handle cached HTML anchors/buttons too!
        document.addEventListener("click", (event) => {
            const target = event?.target;
            if (!target) return;

            const transferBtn = target.closest(".rt-pair-funds-btn.transfer") || target.closest("#optionsHeaderTransferBtn");
            const depositBtn = target.closest(".rt-pair-funds-btn.deposit") || target.closest("#optionsHeaderDepositBtn");
            const withdrawBtn = target.closest(".rt-pair-funds-btn.withdraw") || target.closest("#optionsHeaderWithdrawBtn");
            const closeBtn = target.closest("#optionsWalletModalClose");

            if (transferBtn) {
                event.preventDefault();
                event.stopPropagation();
                openOptionsWalletModal("transfer");
            } else if (depositBtn) {
                event.preventDefault();
                event.stopPropagation();
                openOptionsWalletModal("deposit");
            } else if (withdrawBtn) {
                event.preventDefault();
                event.stopPropagation();
                openOptionsWalletModal("withdraw");
            } else if (closeBtn) {
                event.preventDefault();
                event.stopPropagation();
                closeOptionsWalletModal();
            }
        });
    } catch (err) {
        console.error("Error in initOptionsWalletQuickActions:", err);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        initOptionsTerminal();
        initOptionsCurrencyToggles();
        txInitSubAccountsAndSelector();
        txBindSubAccountEvents();
    });
} else {
    initOptionsTerminal();
        initOptionsCurrencyToggles();
    txInitSubAccountsAndSelector();
    txBindSubAccountEvents();
}

let txSubAccountsLocalCache = [];


let txCustomAccountDropdownInitialized = false;
let txCustomAccountCloseTimer = null;

function txOpenCustomAccountDropdown() {
    if (txCustomAccountCloseTimer) {
        clearTimeout(txCustomAccountCloseTimer);
        txCustomAccountCloseTimer = null;
    }
    const trigger = document.getElementById("txCustomAccountTrigger");
    const menu = document.getElementById("txCustomAccountMenu");
    if (trigger) trigger.classList.add("open");
    if (menu) menu.classList.add("open");
}

function txCloseCustomAccountDropdown(immediate = false) {
    if (txCustomAccountCloseTimer) {
        clearTimeout(txCustomAccountCloseTimer);
        txCustomAccountCloseTimer = null;
    }
    const doClose = () => {
        const trigger = document.getElementById("txCustomAccountTrigger");
        const menu = document.getElementById("txCustomAccountMenu");
        if (trigger) trigger.classList.remove("open");
        if (menu) menu.classList.remove("open");
    };
    if (immediate) {
        doClose();
    } else {
        txCustomAccountCloseTimer = setTimeout(doClose, 200);
    }
}

function txRenderCustomAccountDropdown(subAccounts = [], activeSubId = "main") {
    const labelEl = document.getElementById("txCustomAccountLabel");
    const listEl = document.getElementById("txCustomAccountList");
    if (!labelEl || !listEl) return;

    activeSubId = activeSubId || "main";
    const allAccounts = [
        { id: "main", name: "Main Trading Account", is_demo: false, plan_name: "Real", plan_color: "emerald" },
        ...subAccounts.map(s => ({
            id: s.id,
            name: s.name,
            is_demo: s.is_demo || s.account_mode === "demo" || s.plan === "demo",
            account_mode: s.account_mode || (s.plan === "demo" ? "demo" : "real"),
            plan_name: s.plan_name || (s.is_demo || s.plan === "demo" ? "Demo" : "Basic"),
            plan_color: s.plan_color || (s.is_demo || s.plan === "demo" ? "amber" : "cyan")
        }))
    ];

    const currentAcc = allAccounts.find(a => String(a.id) === String(activeSubId)) || allAccounts[0];
    const isCurrentDemo = !!currentAcc.is_demo;

    const dotEl = document.getElementById("txCustomAccountDot");
    const triggerEl = document.getElementById("txCustomAccountTrigger");
    const chevronEl = document.getElementById("txCustomAccountChevron");

    if (dotEl) {
        dotEl.className = `w-2 h-2 rounded-full shrink-0 ${isCurrentDemo ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]' : 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]'}`;
    }
    if (triggerEl) {
        if (isCurrentDemo) {
            triggerEl.style.borderColor = "rgba(245, 158, 11, 0.45)";
        } else {
            triggerEl.style.borderColor = "rgba(148, 163, 184, 0.25)";
        }
    }
    if (chevronEl) {
        chevronEl.style.color = isCurrentDemo ? "#f59e0b" : "#94a3b8";
    }

    labelEl.innerHTML = `
        <span class="font-bold whitespace-nowrap ${isCurrentDemo ? 'text-amber-300' : 'text-cyan-300'}">${escapeHtml(currentAcc.name)}</span>
        ${isCurrentDemo ? '<span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 tracking-wide bg-amber-500/20 text-amber-300 border border-amber-500/30">DEMO</span>' : ''}
    `;

    listEl.innerHTML = allAccounts.map(acc => {
        const isSelected = String(acc.id) === String(activeSubId);
        const isDemo = !!acc.is_demo;
        return `
            <button type="button" data-acc-id="${escapeHtml(String(acc.id))}" class="tx-custom-acc-item ${isSelected ? 'active' : ''} flex items-center justify-between w-full p-2 rounded-lg text-left transition hover:bg-slate-800/60">
                <div class="flex items-center gap-2 truncate min-w-0">
                    <span class="w-1.5 h-1.5 rounded-full shrink-0 ${isDemo ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]' : (isSelected ? 'bg-cyan-400 shadow-[0_0_6px_#22d3ee]' : 'bg-slate-500')}"></span>
                    <span class="truncate ${isSelected ? 'text-cyan-300 font-extrabold' : 'text-slate-200'} text-xs">${escapeHtml(acc.name)}</span>
                    ${isDemo ? '<span class="text-[8px] font-black uppercase px-1 py-0.5 rounded border shrink-0 bg-amber-500/20 text-amber-300 border-amber-500/30">DEMO</span>' : ''}
                </div>
                ${isSelected ? '<svg class="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-2" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>' : ''}
            </button>
        `;
    }).join("");

    listEl.querySelectorAll(".tx-custom-acc-item").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const accId = btn.getAttribute("data-acc-id");
            txCloseCustomAccountDropdown(true);

            const selector = document.getElementById("tradingAccountSelector");
            if (selector) {
                selector.value = accId;
                selector.dispatchEvent(new Event("change"));
            }
        });
    });
}

function txInitCustomAccountDropdown() {
    if (txCustomAccountDropdownInitialized) return;
    txCustomAccountDropdownInitialized = true;

    const trigger = document.getElementById("txCustomAccountTrigger");
    const menu = document.getElementById("txCustomAccountMenu");
    const createBtn = document.getElementById("txCustomAccountCreateBtn");
    const dropdownRoot = document.getElementById("txCustomAccountDropdown");

    if (!trigger || !menu) return;

    if (dropdownRoot && !dropdownRoot.__txHoverBound) {
        dropdownRoot.__txHoverBound = true;
        dropdownRoot.addEventListener("mouseenter", () => {
            txOpenCustomAccountDropdown();
        });
        dropdownRoot.addEventListener("mouseleave", () => {
            txCloseCustomAccountDropdown(false);
        });
    }

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.contains("open");
        if (isOpen) {
            txCloseCustomAccountDropdown(true);
        } else {
            txOpenCustomAccountDropdown();
        }
    });

    if (createBtn) {
        createBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            txCloseCustomAccountDropdown(true);
            if (typeof window.txOpenSubAccountModal === "function") {
                window.txOpenSubAccountModal("real");
            } else {
                const subModal = document.getElementById("subAccountModal");
                if (subModal) {
                    subModal.style.display = "flex";
                    subModal.classList.remove("hidden");
                    subModal.classList.add("flex");
                    txRenderSubAccountsList();
                    const sb = document.getElementById("subAccountModalScrollBody") || subModal.querySelector(".overflow-y-auto");
                    if (sb) sb.scrollTop = 0;
                }
            }
        });
    }

    document.addEventListener("click", (e) => {
        if (!menu.contains(e.target) && !trigger.contains(e.target) && !e.target.closest("#txCustomAccountDropdown")) {
            txCloseCustomAccountDropdown(true);
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && menu.classList.contains("open")) {
            txCloseCustomAccountDropdown(true);
        }
    });
}

async function txInitSubAccountsAndSelector() {
    if (!isLoggedIn()) return;
    txInitCustomAccountDropdown();
    // Fetch live USDT rate on init
    fetchOptionsUsdtRate();
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
        createOpt.value = "create_new";
        createOpt.textContent = "+ Create Sub Account";
        selector.appendChild(createOpt);
        
        let activeSubId = localStorage.getItem("traidiumx_active_user_id") || "main";
        let isCurrentDemo = false;
        if (activeSubId && subAccounts.some(s => s.id === activeSubId)) {
            selector.value = activeSubId;
            const sub = subAccounts.find(s => s.id === activeSubId);
            if (sub && (sub.is_demo || sub.account_mode === "demo" || sub.plan === "demo")) {
                isCurrentDemo = true;
            }
        } else {
            selector.value = "main";
            activeSubId = "main";
        }
        
        txRenderCustomAccountDropdown(subAccounts, activeSubId);

        const fundsGrid = document.querySelector(".rt-pair-funds-grid");
        const mainWalletItem = document.querySelector(".rt-pair-funds-item.estimate");
        if (fundsGrid) {
            if (isCurrentDemo) fundsGrid.classList.add("demo-mode");
            else fundsGrid.classList.remove("demo-mode");
        }
        if (mainWalletItem) {
            if (isCurrentDemo) {
                mainWalletItem.classList.add("hidden");
                mainWalletItem.style.display = "none";
            } else {
                mainWalletItem.classList.remove("hidden");
                mainWalletItem.style.display = "";
            }
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
            const isDemo = sub.is_demo || sub.account_mode === "demo" || sub.plan === "demo";
            const planName = isDemo ? "Demo" : (sub.plan_name || "Basic");
            const planColor = isDemo ? "amber" : (sub.plan_color || "cyan");
            const badgeColorClasses = {
                "cyan": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
                "emerald": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                "purple": "bg-purple-500/20 text-purple-300 border-purple-500/30",
                "amber": "bg-amber-500/20 text-amber-300 border-amber-500/30"
            }[planColor] || "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";

            html += `
                <div class="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-900/40 text-xs gap-2 min-w-0">
                    <div class="min-w-0 flex-1 pr-1">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <strong class="text-white font-black truncate">${escapeHtml(sub.name)}</strong>
                            <span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md border ${badgeColorClasses}">${escapeHtml(planName)}</span>
                        </div>
                        <p class="text-[10px] text-slate-500 mt-0.5 truncate">ID: ${sub.id}</p>
                    </div>
                    <div class="text-right shrink-0 flex items-center gap-2">
                        <div>
                            <strong class="${isDemo ? 'text-amber-300' : 'text-cyan-300'} font-black">${bal.toFixed(2)} USDT</strong>
                            <p class="text-[10px] text-slate-500 mt-0.5">${isDemo ? 'Demo Balance' : 'Trading Balance'}</p>
                        </div>
                        ${isDemo ? `
                            <button type="button" data-demo-deposit-id="${escapeHtml(sub.id)}" class="tx-options-demo-deposit-btn px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-extrabold rounded-lg text-[10px] border border-amber-500/30 transition cursor-pointer" title="Add +$10,000 Demo Funds">
                                +10k
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;

        container.querySelectorAll(".tx-options-demo-deposit-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const subId = btn.getAttribute("data-demo-deposit-id");
                if (!subId) return;
                btn.disabled = true;
                btn.textContent = "...";
                try {
                    await apiRequest(`/user/sub-accounts/${subId}/demo-deposit`, {
                        method: "POST",
                        body: JSON.stringify({ amount: 10000 })
                    });
                    if (typeof showOrderMessage === "function") showOrderMessage("+$10,000 Demo USDT added successfully!", "success");
                    await txRenderSubAccountsList();
                    await txInitSubAccountsAndSelector();
                } catch (err) {
                    if (typeof showOrderMessage === "function") showOrderMessage(err.message || "Failed to add demo funds.", "error");
                    btn.disabled = false;
                    btn.textContent = "+10k";
                }
            });
        });
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
        const onPreviewChange = () => txUpdateSubTransferPreview(OPTIONS_USDT_RATE);
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
                const mainWallet = state.wallet.rawWallet?.main_wallet || {};
                const available = Number(mainWallet.available_balance ?? 0);
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
    const selector = document.getElementById("tradingAccountSelector");
    if (selector) {
        selector.addEventListener("change", (e) => {
            const val = e.target.value;
            if (val === "create_new" || val === "manage") {
                openSubModal("real");
                const activeUser = localStorage.getItem("traidiumx_active_user_id") || "main";
                e.target.value = activeUser;
                return;
            }
            if (val === "main") {
                localStorage.removeItem("traidiumx_active_user_id");
                localStorage.setItem("traidiumx_active_user_name", "Main Trading Account");
            } else {
                const selectedSub = txSubAccountsLocalCache.find(s => s.id === val);
                const selectedName = selectedSub ? selectedSub.name : "Sub Account";
                localStorage.setItem("traidiumx_active_user_id", val);
                localStorage.setItem("traidiumx_active_user_name", selectedName);
            }
            window.location.reload();
        });
    }

    const subModal = document.getElementById("subAccountModal");
    const subOpenBtn = document.getElementById("subAccountSettingsBtn");
    const subCloseBtn = document.getElementById("subAccountModalClose");
    const subBottomCloseBtn = document.getElementById("subAccountModalBottomClose");

    const hideSubModal = () => {
        if (subModal) {
            subModal.style.display = "none";
            subModal.classList.add("hidden");
            subModal.classList.remove("flex");
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
            // Graceful fallback
        }
    };

    window.txOpenSubAccountModal = function(mode = "real") {
        openSubModal(mode);
    };
    const openSubModal = (mode = "real") => {
        if (subModal) {
            subModal.style.display = "flex";
            subModal.classList.remove("hidden");
            subModal.classList.add("flex");
            setModalMode(mode);
            txRenderSubAccountsList();
            if (typeof window.txLoadDynamicPlanSettings === "function") {
                window.txLoadDynamicPlanSettings();
            }
            const scrollBody = document.getElementById("subAccountModalScrollBody") || subModal.querySelector(".overflow-y-auto");
            if (scrollBody) scrollBody.scrollTop = 0;
        }
    };

    if (subOpenBtn) subOpenBtn.addEventListener("click", () => openSubModal("real"));
    if (subCloseBtn) subCloseBtn.addEventListener("click", hideSubModal);
    if (subBottomCloseBtn) subBottomCloseBtn.addEventListener("click", hideSubModal);
    if (subModal) {
        subModal.addEventListener("click", (e) => {
            if (e.target === subModal) hideSubModal();
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

    let modalSubMode = "real";
    let selectedPlan = "basic";
    let selectedPlatform = "pxtrader";

    // Platform selection
    const platPx = document.getElementById("subPlatformPxTrader");
    const platMt5 = document.getElementById("subPlatformMT5");
    const platPxRadio = document.getElementById("subPlatformPxRadio");
    const platMt5Radio = document.getElementById("subPlatformMt5Radio");

    const updatePlatformCards = (plat) => {
        selectedPlatform = plat;
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
        selectedPlan = plan;
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

    const modalRealBtn = document.getElementById("subModalModeRealBtn");
    const modalDemoBtn = document.getElementById("subModalModeDemoBtn");
    const platformSection = document.getElementById("subModalPlatformSection");
    const realPlanSection = document.getElementById("subModalRealPlanSection");
    const demoExistingNotice = document.getElementById("subModalDemoExistingNotice");
    const demoNewSection = document.getElementById("subModalDemoNewSection");
    const submitBtn = document.getElementById("subAccountSubmitBtn");

    const setModalMode = (mode) => {
        modalSubMode = mode;
        const hasExistingDemo = (txSubAccountsLocalCache || []).some(s => s.is_demo || s.account_mode === "demo" || s.plan === "demo");

        if (mode === "demo") {
            modalDemoBtn?.setAttribute("class", "px-5 sm:px-6 py-2 rounded-lg text-xs font-black transition cursor-pointer bg-amber-400 text-slate-950 shadow-sm");
            modalRealBtn?.setAttribute("class", "px-5 sm:px-6 py-2 rounded-lg text-xs font-semibold transition cursor-pointer text-slate-400 hover:text-white");
            
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
            modalRealBtn?.setAttribute("class", "px-5 sm:px-6 py-2 rounded-lg text-xs font-black transition cursor-pointer bg-white/10 text-white border border-white/20 shadow-sm");
            modalDemoBtn?.setAttribute("class", "px-5 sm:px-6 py-2 rounded-lg text-xs font-semibold transition cursor-pointer text-slate-400 hover:text-white");

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
    };

    modalRealBtn?.addEventListener("click", () => setModalMode("real"));
    modalDemoBtn?.addEventListener("click", () => setModalMode("demo"));

    // Submit Handler
    if (submitBtn && submitBtn.dataset.bound !== "1") {
        submitBtn.dataset.bound = "1";
        submitBtn.addEventListener("click", async () => {
            const isDemo = modalSubMode === "demo";
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
                        plan: isDemo ? "demo" : selectedPlan,
                        platform: selectedPlatform,
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
                    setTimeout(() => window.location.reload(), 800);
                    return;
                }

                await txRenderSubAccountsList();
                await txInitSubAccountsAndSelector();

                setTimeout(() => {
                    if (msg) msg.classList.add("hidden");
                    hideSubModal();
                }, 1200);

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

window.addEventListener("traidiumx:currency-change", (event) => {
    window.location.reload();
});

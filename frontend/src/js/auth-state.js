(function protectPrivatePages() {
    const protectedPages = [
        "/futures.html",
        "/options.html",
        "/wallet.html",
        "/refer-earn.html",
        "/profile.html",
        "/dashboard.html",
        "/orders.html",
        "/portfolio.html",
        "/portfolio",
        "/exchange.html",
        "/exchange"
    ];
    const currentPath = window.location.pathname.toLowerCase();
    const isProtected = protectedPages.some(page => currentPath.endsWith(page));
    if (isProtected) {
        const token = localStorage.getItem("traidiumx_auth_token");
        if (!token) {
            const nextParam = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
            window.location.href = `/src/pages/login.html?next=${nextParam}`;
        }
    }
})();

document.addEventListener("DOMContentLoaded", function () {
    waitForNavbarAndApplyAuthState();
    syncUserProfile();
    loadTradingOnboardingModule();
    applyRegisterStepLinkAuthState();
});

function loadTradingOnboardingModule() {
    if (typeof isLoggedIn !== "function" || !isLoggedIn()) return;
    if (document.querySelector('script[data-tx-trading-onboarding]')) return;
    const script = document.createElement("script");
    script.src = "/src/js/trading-onboarding.js?v=" + new Date().getTime();
    script.defer = true;
    script.dataset.txTradingOnboarding = "true";
    document.head.appendChild(script);
}

async function syncUserProfile() {
    if (typeof isLoggedIn === "function" && isLoggedIn()) {
        try {
            const response = await apiRequest("/user/profile");
            if (response && response.success && response.data && response.data.user) {
                localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
                if (typeof applyNavbarAuthState === "function") {
                    applyNavbarAuthState();
                }
            }
        } catch (error) {
            console.error("Failed to sync user profile:", error);
        }
    }
}



function waitForNavbarAndApplyAuthState() {
    let attempts = 0;

    const interval = setInterval(function () {
        attempts++;

        const desktopAuthArea = document.getElementById("desktopAuthArea");
        const mobileAuthArea = document.getElementById("mobileAuthArea");

        if (desktopAuthArea || mobileAuthArea) {
            clearInterval(interval);
            applyNavbarAuthState();
        }

        if (attempts > 40) {
            clearInterval(interval);
        }
    }, 100);
}


function getUserDisplayName(user) {
    if (!user) return "User";
    if (user.kyc_status === "approved" && (user.name || user.full_name)) {
        return (user.name || user.full_name).trim();
    }
    const regName = user.register_name || user.registration_name || user.initial_name || user.email_name;
    if (regName) return regName.trim();
    const email = user.email || "";
    if (email.includes("@")) {
        const prefix = email.split("@")[0];
        return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
    return email || "User";
}

function getUserInitial(user) {
    const name = getUserDisplayName(user);
    return name.charAt(0).toUpperCase() || "S";
}

function applyNavbarAuthState() {
    const desktopAuthArea = document.getElementById("desktopAuthArea");
    const mobileAuthArea = document.getElementById("mobileAuthArea");
    const mobileHeaderNoticeRoot = document.getElementById("mobileHeaderNotificationRoot");
    const mobileProfileArea = document.getElementById("mobileProfileArea");
    const dropdownContainer = document.getElementById("txProfileDropdownContainer");

    const loggedIn = isLoggedIn();
    const user = getAuthUser();

    if (mobileHeaderNoticeRoot) {
        if (loggedIn) {
            mobileHeaderNoticeRoot.classList.remove("hidden");
            mobileHeaderNoticeRoot.style.display = "flex";
        } else {
            mobileHeaderNoticeRoot.classList.add("hidden");
            mobileHeaderNoticeRoot.style.display = "none";
        }
    }

    if (mobileProfileArea) {
        if (loggedIn && user) {
            const firstLetter = getUserInitial(user);
            mobileProfileArea.classList.remove("hidden");
            mobileProfileArea.style.display = "flex";
            const mobileBtn = mobileProfileArea.querySelector("#mobileNavbarProfileBtn");
            if (mobileBtn) mobileBtn.textContent = firstLetter;
        } else {
            mobileProfileArea.classList.add("hidden");
            mobileProfileArea.style.display = "none";
        }
    }

    if (loggedIn && user) {
        renderLoggedInDesktop(desktopAuthArea, user);
        renderLoggedInMobile(mobileAuthArea, user);
        renderProfileDropdown(dropdownContainer || desktopAuthArea, user);
        initNavbarCurrencyToggle();
        bindNavbarDropdown(user);
    } else {
        if (dropdownContainer) dropdownContainer.innerHTML = "";
        renderLoggedOutDesktop(desktopAuthArea);
        renderLoggedOutMobile(mobileAuthArea);
    }

    bindNavbarLogoutButtons();
    updateMobileThemeToggleUI();
    if (typeof applyRegisterStepLinkAuthState === "function") {
        applyRegisterStepLinkAuthState();
    }
}


function renderLoggedOutDesktop(container) {
    if (!container) {
        return;
    }

    const resolveRoute = (r) => typeof resolveAppPath === "function" ? resolveAppPath(r) : "./" + r;

    container.innerHTML = `
        <a
            href="${resolveRoute('src/pages/login.html')}"
            data-route="src/pages/login.html"
            class="inline-flex items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/[0.06] px-5 py-3 text-sm font-black text-cyan-200 transition hover:bg-cyan-400/15 hover:text-cyan-100"
        >
            Login
        </a>

        <a href="${resolveRoute('src/pages/register.html')}" data-route="src/pages/register.html" class="tx-pill-trade-btn">
            <span>TRADE NOW</span>
            <span class="tx-pill-arrow">→</span>
        </a>
    `;
}


function renderLoggedOutMobile(container) {
    if (!container) {
        return;
    }

    const resolveRoute = (r) => typeof resolveAppPath === "function" ? resolveAppPath(r) : "./" + r;
    const curTheme = localStorage.getItem("traidiumx_theme") || "dark";
    const isDark = curTheme !== "light";
    const darkBtnClass = isDark
        ? "flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[68px] cursor-pointer bg-cyan-400 text-slate-950 font-black shadow-sm"
        : "flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[68px] cursor-pointer bg-transparent text-slate-400 hover:text-slate-200";
    const lightBtnClass = !isDark
        ? "flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[68px] cursor-pointer bg-cyan-400 text-slate-950 font-black shadow-sm"
        : "flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[68px] cursor-pointer bg-transparent text-slate-400 hover:text-slate-200";

    container.innerHTML = `
        <div class="flex justify-between items-center my-3 px-1">
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Theme Mode</span>
            <div class="tx-theme-toggle-wrapper flex items-center justify-center p-1 bg-slate-950/80 border border-slate-800 rounded-xl select-none shadow-inner shadow-black/40">
                <button type="button" id="txMobileThemeDarkBtn" class="${darkBtnClass}" onclick="applyMobileTheme('dark')">
                    🌙 Dark
                </button>
                <button type="button" id="txMobileThemeLightBtn" class="${lightBtnClass}" onclick="applyMobileTheme('light')">
                    ☀️ Light
                </button>
            </div>
        </div>

        <a
            href="${resolveRoute('src/pages/login.html')}"
            data-route="src/pages/login.html"
            class="flex w-full items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/[0.06] px-5 py-3 text-sm font-black text-cyan-200 transition hover:bg-cyan-400/15 hover:text-cyan-100 mb-2"
        >
            Login
        </a>

        <a href="${resolveRoute('src/pages/register.html')}" data-route="src/pages/register.html" class="tx-pill-mobile-trade">
            TRADE NOW →
        </a>
    `;
}

window.applyMobileTheme = function(theme) {
    localStorage.setItem("traidiumx_theme", theme);
    if (typeof applySiteTheme === "function") {
        applySiteTheme(theme);
    }
    updateMobileThemeToggleUI();
    if (typeof updateThemeToggleUI === "function") {
        updateThemeToggleUI(theme);
    }
};

window.updateMobileThemeToggleUI = function() {
    const theme = localStorage.getItem("traidiumx_theme") || "dark";
    const darkBtn = document.getElementById("txMobileThemeDarkBtn");
    const lightBtn = document.getElementById("txMobileThemeLightBtn");

    if (!darkBtn || !lightBtn) return;

    const activeClasses = "flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[68px] cursor-pointer bg-cyan-400 text-slate-950 font-black shadow-sm";
    const inactiveClasses = "flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[68px] cursor-pointer bg-transparent text-slate-400 hover:text-slate-200";

    if (theme === "light") {
        lightBtn.className = activeClasses;
        darkBtn.className = inactiveClasses;
    } else {
        darkBtn.className = activeClasses;
        lightBtn.className = inactiveClasses;
    }
};


function renderLoggedInDesktop(container, user) {
    if (!container) {
        return;
    }

    const fullName = escapeHtml(getUserDisplayName(user));
    const userInitial = getUserInitial(user);

    const currentPath = window.location.pathname.toLowerCase();
    const isIndexOrMarkets = currentPath.endsWith("/index.html") 
        || currentPath.endsWith("/markets.html") 
        || currentPath.endsWith("/") 
        || currentPath.endsWith("/markets") 
        || currentPath.includes("markets.html") 
        || currentPath === "";
    const shouldHideToggle = isIndexOrMarkets || currentPath.includes("futures") || currentPath.includes("wallet") || currentPath.includes("options");

    const resolveRoute = (route) => {
        if (typeof resolveAppPath === "function") {
            return resolveAppPath(route);
        }
        const isPages = window.location.pathname.replace(/\\/g, "/").includes("/src/pages/");
        return (isPages ? "../../" : "./") + route;
    };

    const activeCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const cachedNavBal = localStorage.getItem("tx_cached_navbar_balance_" + activeCurrency)
        || (activeCurrency === "INR" ? "₹0.00" : (localStorage.getItem("tx_cached_navbar_balance") || "0.00 USD"));

    if (isIndexOrMarkets) {
        container.innerHTML = `
            <div class="flex items-center gap-2.5 relative z-10">
                <!-- Notifications -->
                <div class="relative" data-notification-root>
                    <button data-notification-toggle type="button" class="w-10 h-10 flex items-center justify-center border border-slate-800 rounded-xl bg-slate-950/60 text-slate-400 hover:text-white transition cursor-pointer" title="Notifications">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        <span class="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-cyan-400 text-slate-950 font-black text-[9px] flex items-center justify-center rounded-full px-1 shadow-sm hidden animate-pulse" data-notification-badge>0</span>
                    </button>
                </div>

                <!-- Profile Avatar wrapper -->
                <div id="txDesktopProfileWrapper" class="relative ml-1">
                    <button id="txNavbarProfileBtn" type="button" class="w-10 h-10 rounded-full bg-[#22d3ee] text-[#0f172a] flex items-center justify-center font-extrabold text-base cursor-pointer hover:opacity-90 transition select-none shadow-md shadow-cyan-950/25">
                        ${userInitial}
                    </button>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="flex items-center gap-2.5 relative z-10">
            <!-- PrimeXBT Style Deposit Button -->
            <button type="button" id="txNavbarDepositBtn" class="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 active:scale-95 text-slate-950 font-black text-xs transition cursor-pointer shadow-md shadow-cyan-400/20 flex items-center justify-center">
                Deposit
            </button>

            <!-- PrimeXBT Style Wallet Balance Dropdown Trigger -->
            <div class="relative" id="txNavbarWalletRoot">
                <button type="button" id="txNavbarWalletTrigger" class="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-700/80 text-white font-extrabold text-xs transition cursor-pointer select-none">
                    <svg class="w-3.5 h-3.5 text-slate-300 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2.5"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><circle cx="16" cy="14" r="1"/></svg>
                    <span id="txNavbarWalletBalanceText">${cachedNavBal}</span>
                    <svg id="txNavbarWalletChevron" class="w-3 h-3 text-slate-400 shrink-0 transition-transform duration-200" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
                </button>

                <!-- PrimeXBT Style Wallet Dropdown Menu -->
                <div id="txNavbarWalletMenu" class="hidden absolute right-0 top-full mt-2 w-64 bg-[#0a0f1d]/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-2.5 shadow-2xl z-[99999] text-slate-200">
                    <!-- Accounts Section -->
                    <div class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-3 pt-1 pb-1.5">Accounts</div>
                    <div class="space-y-0.5">
                        <a href="${resolveRoute('src/pages/wallet.html#overview')}" data-route="src/pages/wallet.html#overview" class="group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer">
                            <svg class="w-4 h-4 text-slate-400 group-hover:text-cyan-400 shrink-0 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/><path stroke-linecap="round" stroke-linejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/></svg>
                            <span>Overview</span>
                        </a>
                        <a href="${resolveRoute('src/pages/wallet.html#trading')}" data-route="src/pages/wallet.html#trading" class="group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer">
                            <svg class="w-4 h-4 text-slate-400 group-hover:text-cyan-400 shrink-0 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
                            <span>Trading accounts</span>
                        </a>
                        <a href="${resolveRoute('src/pages/wallet.html#wallet')}" data-route="src/pages/wallet.html#wallet" class="group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer">
                            <svg class="w-4 h-4 text-slate-400 group-hover:text-cyan-400 shrink-0 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"/></svg>
                            <span>Wallet</span>
                        </a>
                        <a href="${resolveRoute('src/pages/wallet.html#sub-accounts')}" id="txNavbarSubAccCreateLink" data-route="src/pages/wallet.html#sub-accounts" class="group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-all cursor-pointer">
                            <svg class="w-4 h-4 text-cyan-400 group-hover:text-cyan-300 shrink-0 transition-colors" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                            <span>Create new account</span>
                        </a>
                    </div>

                    <div class="my-1.5 border-t border-white/[0.08]"></div>

                    <!-- Transactions Section -->
                    <div class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-3 pt-1 pb-1.5">Transactions</div>
                    <div class="space-y-0.5">
                        <a href="javascript:void(0)" id="txWalletMenuDepositBtn" class="group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer">
                            <svg class="w-4 h-4 text-slate-400 group-hover:text-cyan-400 shrink-0 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"/></svg>
                            <span>Deposit</span>
                        </a>
                        <a href="${resolveRoute('src/pages/wallet.html#withdraw')}" data-route="src/pages/wallet.html#withdraw" class="group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer">
                            <svg class="w-4 h-4 text-slate-400 group-hover:text-cyan-400 shrink-0 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"/></svg>
                            <span>Withdraw</span>
                        </a>
                        <a href="${resolveRoute('src/pages/wallet.html#transfer')}" data-route="src/pages/wallet.html#transfer" class="group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer">
                            <svg class="w-4 h-4 text-slate-400 group-hover:text-cyan-400 shrink-0 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"/></svg>
                            <span>Transfer</span>
                        </a>
                        <a href="${resolveRoute('src/pages/exchange.html')}" data-route="src/pages/exchange.html" class="group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer">
                            <svg class="w-4 h-4 text-slate-400 group-hover:text-cyan-400 shrink-0 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>
                            <span>Exchange</span>
                        </a>
                        <a href="${resolveRoute('src/pages/wallet.html#history')}" data-route="src/pages/wallet.html#history" onclick="if(window.location.pathname.includes('wallet.html') && typeof window.txActivateHistoryTab === 'function'){ window.txActivateHistoryTab(); const d=document.getElementById('txProfileDropdown'); if(d) d.classList.add('hidden'); return false; }" class="group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer">
                            <svg class="w-4 h-4 text-slate-400 group-hover:text-cyan-400 shrink-0 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            <span>Transfer history</span>
                        </a>
                    </div>
                </div>
            </div>

            <!-- Currency Switcher -->
            <div class="tx-currency-toggle-wrapper flex items-center justify-center p-1 bg-slate-950/80 border border-slate-800 rounded-xl select-none shadow-inner shadow-black/40 mr-1" ${shouldHideToggle ? 'style="display: none !important;"' : ''}>
                <button type="button" class="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[62px] cursor-pointer" data-currency="INR">
                    ₹ INR
                </button>
                <button type="button" class="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[62px] cursor-pointer" data-currency="USDT">
                    $ USD
                </button>
            </div>

            <!-- Notifications -->
            <div class="relative" data-notification-root>
                <button data-notification-toggle type="button" class="w-10 h-10 flex items-center justify-center border border-slate-800 rounded-xl bg-slate-950/60 text-slate-400 hover:text-white transition cursor-pointer" title="Notifications">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span class="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-cyan-400 text-slate-950 font-black text-[9px] flex items-center justify-center rounded-full px-1 shadow-sm hidden animate-pulse" data-notification-badge>0</span>
                </button>
            </div>

            <!-- Profile Avatar wrapper -->
            <div id="txDesktopProfileWrapper" class="relative ml-1">
                <button id="txNavbarProfileBtn" type="button" class="w-10 h-10 rounded-full bg-[#22d3ee] text-[#0f172a] flex items-center justify-center font-extrabold text-base cursor-pointer hover:opacity-90 transition select-none shadow-md shadow-cyan-950/25">
                    ${userInitial}
                </button>
            </div>
        </div>
    `;

    if (typeof initPrimeXbtNavbarControls === "function") {
        initPrimeXbtNavbarControls();
    }
}

function renderProfileDropdown(container, user) {
    if (!container) {
        return;
    }

    const fullName = escapeHtml(getUserDisplayName(user));
    const userInitial = getUserInitial(user);

    const resolveRoute = (route) => {
        if (typeof resolveAppPath === "function") {
            return resolveAppPath(route);
        }
        const isPages = window.location.pathname.replace(/\\/g, "/").includes("/src/pages/");
        return (isPages ? "../../" : "./") + route;
    };

    const curThemeMode = localStorage.getItem("traidiumx_theme_mode") || (localStorage.getItem("traidiumx_theme") === "light" ? "light" : "dark");
    const autoClass = curThemeMode === "auto" ? "bg-white text-slate-950 font-black shadow-sm" : "text-slate-400 hover:text-white hover:bg-slate-800/60";
    const lightClass = curThemeMode === "light" ? "bg-white text-slate-950 font-black shadow-sm" : "text-slate-400 hover:text-white hover:bg-slate-800/60";
    const darkClass = (curThemeMode === "dark" || (!curThemeMode && curTheme !== "light")) ? "bg-white text-slate-950 font-black shadow-sm" : "text-slate-400 hover:text-white hover:bg-slate-800/60";

    container.innerHTML = `
        <div id="txProfileDropdown" class="hidden absolute left-1/2 -translate-x-1/2 top-full mt-3.5 w-80 max-w-[calc(100vw-32px)] bg-[#0c101d] border border-slate-800/80 rounded-3xl p-5 shadow-2xl z-[99999] text-slate-200">
                    <!-- Header -->
                    <div class="flex items-center gap-3.5 pb-4 border-b border-slate-800/60">
                        <div class="tx-profile-avatar w-12 h-12 rounded-full bg-[#22d3ee] text-[#0f172a] flex items-center justify-center font-extrabold text-lg select-none shadow-sm shadow-cyan-900/30">
                            ${userInitial}
                        </div>
                        <div class="min-w-0 flex-1">
                            <h4 class="font-extrabold text-sm text-white truncate leading-snug">${fullName}</h4>
                            <div class="flex items-center gap-1.5 mt-1">
                                <span class="text-xs font-semibold text-slate-400">ID:${user.client_id || "383939"}</span>
                                <button type="button" id="txCopyIdBtn" class="text-slate-400 hover:text-white transition focus:outline-none cursor-pointer" title="Copy Client ID">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                    </svg>
                                </button>
                                <span id="txCopyFeedback" class="text-[10px] text-emerald-400 hidden">Copied!</span>
                            </div>
                        </div>
                    </div>

                    <!-- Badges -->
                    <div class="flex items-center gap-2 mt-4.5 mb-4">
                        <span class="text-[10px] font-black text-slate-400 border border-slate-700/60 rounded-lg px-2.5 py-1 uppercase tracking-wider bg-slate-900/30">
                            Regular User
                        </span>
                        ${user.kyc_status === 'approved' ? `
                        <a href="${resolveRoute('src/pages/profile.html#kyc')}" data-route="src/pages/profile.html#kyc" class="flex items-center gap-1 text-[10px] font-black text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 rounded-lg px-2.5 py-1 uppercase tracking-wider hover:bg-emerald-500/20 transition cursor-pointer">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                <path d="m9 11 2 2 4-4"></path>
                            </svg>
                            <span>Verified</span>
                            <span class="ml-0.5 text-emerald-400/80">›</span>
                        </a>
                        ` : user.kyc_status === 'rejected' ? `
                        <a href="${resolveRoute('src/pages/profile.html#kyc')}" data-route="src/pages/profile.html#kyc" class="flex items-center gap-1 text-[10px] font-black text-red-400 border border-red-500/20 bg-red-500/10 rounded-lg px-2.5 py-1 uppercase tracking-wider hover:bg-red-500/20 transition cursor-pointer">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10"></circle>
                                <path d="m15 9-6 6M9 9l6 6"></path>
                            </svg>
                            <span>Rejected</span>
                            <span class="ml-0.5 text-red-400/80">›</span>
                        </a>
                        ` : `
                        <a href="${resolveRoute('src/pages/profile.html#kyc')}" data-route="src/pages/profile.html#kyc" class="flex items-center gap-1 text-[10px] font-black text-amber-400 border border-amber-500/20 bg-amber-500/10 rounded-lg px-2.5 py-1 uppercase tracking-wider hover:bg-amber-500/20 transition cursor-pointer">
                            <span>Unverified</span>
                            <span class="ml-0.5 text-amber-400/80">›</span>
                        </a>
                        `}
                    </div>

                    <!-- Create Account Link -->
                    <div class="mb-4">
                        <a href="${resolveRoute('src/pages/wallet.html#sub-accounts')}" id="txNavbarCreateSubAccountLink" data-route="src/pages/wallet.html#sub-accounts" onclick="if(window.location.pathname.includes('wallet.html') && typeof window.txOpenSubAccountCreationModal === 'function'){ window.txOpenSubAccountCreationModal('real'); const d=document.getElementById('txProfileDropdown'); if(d) d.classList.add('hidden'); return false; }" class="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#10b981] hover:text-[#059669] transition cursor-pointer">
                            <span class="text-sm font-black">+</span>
                            <span>Create an Account</span>
                        </a>
                    </div>

                    <!-- Options -->
                    <div class="space-y-1">
                        <!-- Invite & Earn -->
                        <a href="${resolveRoute('src/pages/refer-earn.html')}" data-route="src/pages/refer-earn.html" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                            <svg class="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            <span class="whitespace-nowrap">Invite &amp; Earn <span class="text-emerald-400 font-black ml-1">$</span></span>
                        </a>

                        <!-- Support 24/7 -->
                        <a href="${resolveRoute('src/pages/contact.html')}" data-route="src/pages/contact.html" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                            <svg class="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
                            <span class="whitespace-nowrap">Support 24/7</span>
                        </a>

                        <!-- Divider -->
                        <div class="my-1.5 border-t border-slate-800/80"></div>

                        <!-- History -->
                        <a href="${resolveRoute('src/pages/orders.html')}" data-route="src/pages/orders.html" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                            <svg class="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                            <span class="whitespace-nowrap">History</span>
                        </a>

                        <!-- Account Details -->
                        <a href="${resolveRoute('src/pages/profile.html')}" data-route="src/pages/profile.html" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                            <svg class="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            <span class="whitespace-nowrap">Account Details</span>
                        </a>

                        <!-- Settings -->
                        <a href="${resolveRoute('src/pages/settings.html')}" data-route="src/pages/settings.html" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                            <svg class="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06-.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                            <span class="whitespace-nowrap">Settings</span>
                        </a>

                        <!-- Theme Toggle (3-way: Auto, Light, Dark) -->
                        <div class="flex items-center justify-between px-3 py-2 rounded-xl text-slate-300 text-xs font-bold">
                            <div class="flex items-center gap-3">
                                <svg class="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                                <span class="whitespace-nowrap">Theme</span>
                            </div>
                            <div class="inline-flex items-center bg-[#070b14] border border-slate-800 rounded-xl p-0.5 gap-0.5" id="txDropdownThemeGroup">
                                <button type="button" data-theme-mode="auto" title="System / Auto" class="tx-theme-mode-btn p-1 px-1.5 rounded-lg ${autoClass} transition cursor-pointer">
                                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>
                                </button>
                                <button type="button" data-theme-mode="light" title="Light Mode" class="tx-theme-mode-btn p-1 px-1.5 rounded-lg ${lightClass} transition cursor-pointer">
                                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
                                </button>
                                <button type="button" data-theme-mode="dark" title="Dark Mode" class="tx-theme-mode-btn p-1 px-1.5 rounded-lg ${darkClass} transition cursor-pointer">
                                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                                </button>
                            </div>
                        </div>

                        <!-- Divider -->
                        <div class="my-1.5 border-t border-slate-800/80"></div>

                        <!-- Logout -->
                        <button type="button" data-navbar-logout="true" class="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-red-500/10 text-red-400 hover:text-red-300 transition text-xs font-bold cursor-pointer">
                            <svg class="w-4 h-4 shrink-0 text-red-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                            <span class="whitespace-nowrap">Logout</span>
                        </button>
                    </div>
        </div>
    `;
}


function renderLoggedInMobile(container, user) {
    if (!container) {
        return;
    }

    let displayName = "";
    if (user.kyc_status === "approved") {
        const nameParts = (user.name || "").trim().split(/\s+/);
        displayName = nameParts[0] || "User";
    } else {
        const email = user.email || "";
        if (email.includes("@")) {
            const prefix = email.split("@")[0];
            displayName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
        } else {
            displayName = email || "User";
        }
    }
    const userName = escapeHtml(displayName);

    const currentPath = window.location.pathname.toLowerCase();
    const shouldHideToggle = currentPath.endsWith("/index.html") || currentPath.endsWith("/markets.html") || currentPath.endsWith("/") || currentPath.includes("futures") || currentPath.includes("wallet") || currentPath.includes("options");

    const resolveRoute = (r) => typeof resolveAppPath === "function" ? resolveAppPath(r) : "./" + r;
    const curTheme = localStorage.getItem("traidiumx_theme") || "dark";
    const isDark = curTheme !== "light";
    const darkBtnClass = isDark
        ? "flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[68px] cursor-pointer bg-cyan-400 text-slate-950 font-black shadow-sm"
        : "flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[68px] cursor-pointer bg-transparent text-slate-400 hover:text-slate-200";
    const lightBtnClass = !isDark
        ? "flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[68px] cursor-pointer bg-cyan-400 text-slate-950 font-black shadow-sm"
        : "flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[68px] cursor-pointer bg-transparent text-slate-400 hover:text-slate-200";

    container.innerHTML = `
        <a href="${resolveRoute('src/pages/profile.html')}" data-route="src/pages/profile.html" class="tx-mobile-auth-profile" title="Open account details">
            <span class="min-w-0">
                <strong>${userName}</strong>
                <span>View account details</span>
            </span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6l6 6-6 6"></path>
            </svg>
        </a>

        <div class="flex justify-between items-center my-3 px-1" ${shouldHideToggle ? 'style="display: none !important;"' : ''}>
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Display Currency</span>
            <div class="tx-currency-toggle-wrapper flex items-center justify-center p-1 bg-slate-950/80 border border-slate-800 rounded-xl select-none shadow-inner shadow-black/40">
                <button type="button" class="flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[68px]" data-currency="INR">
                    ₹ INR
                </button>
                <button type="button" class="flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[68px]" data-currency="USDT">
                    $ USD
                </button>
            </div>
        </div>

        <div class="flex justify-between items-center my-3 px-1">
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Theme Mode</span>
            <div class="tx-theme-toggle-wrapper flex items-center justify-center p-1 bg-slate-950/80 border border-slate-800 rounded-xl select-none shadow-inner shadow-black/40">
                <button type="button" id="txMobileThemeDarkBtn" class="${darkBtnClass}" onclick="applyMobileTheme('dark')">
                    🌙 Dark
                </button>
                <button type="button" id="txMobileThemeLightBtn" class="${lightBtnClass}" onclick="applyMobileTheme('light')">
                    ☀️ Light
                </button>
            </div>
        </div>

        <div class="tx-mobile-auth-actions" style="grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; display: grid;">
            <a href="${resolveRoute('src/pages/settings.html')}" data-route="src/pages/settings.html" class="tx-mobile-logout-btn flex items-center justify-center gap-1.5 border border-slate-700 bg-slate-900 text-slate-200" style="text-decoration: none; font-weight: 850; letter-spacing: .04em; text-transform: uppercase;">
                <svg viewBox="0 0 24 24" aria-hidden="true" class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06-.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                <span>Settings</span>
            </a>
            <a href="${resolveRoute('src/pages/contact.html')}" data-route="src/pages/contact.html" class="tx-mobile-logout-btn flex items-center justify-center gap-1.5 border border-slate-700 bg-slate-900 text-slate-200" style="text-decoration: none; font-weight: 850; letter-spacing: .04em; text-transform: uppercase;">
                <svg viewBox="0 0 24 24" aria-hidden="true" class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="9"/>
                    <circle cx="12" cy="12" r="4"/>
                    <path d="M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24"/>
                </svg>
                <span>Support</span>
            </a>
            <button type="button" data-navbar-logout="true" class="tx-mobile-logout-btn" aria-label="Logout from TraidiumX">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 5H6.8A1.8 1.8 0 0 0 5 6.8v10.4A1.8 1.8 0 0 0 6.8 19H10"></path>
                    <path d="M13 8l4 4-4 4M17 12H9"></path>
                </svg>
                <span>Logout</span>
            </button>
        </div>
    `;
}

function bindNavbarLogoutButtons() {
    const logoutButtons = document.querySelectorAll("[data-navbar-logout='true']");

    logoutButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            clearAuthData();
            window.location.href = "/";
        });
    });
}


function initPrimeXbtNavbarControls() {
    const resolveRoute = (route) => {
        if (typeof resolveAppPath === "function") {
            return resolveAppPath(route);
        }
        const isPages = window.location.pathname.replace(/\\/g, "/").includes("/src/pages/");
        return (isPages ? "../../" : "./") + route;
    };

    // Ensure #txDepositChoiceModal exists in document body
    let depositModal = document.getElementById("txDepositChoiceModal");
    if (!depositModal) {
        depositModal = document.createElement("div");
        depositModal.id = "txDepositChoiceModal";
        depositModal.className = "fixed inset-0 z-[100005] hidden items-center justify-center bg-black/85 backdrop-blur-md p-4 transition-all";
        depositModal.style.setProperty("display", "none", "important");
        depositModal.innerHTML = `
            <div class="tx-deposit-choice-card relative w-full max-w-[420px] rounded-[24px] border border-slate-800/90 bg-[#131722] p-6 sm:p-7 shadow-2xl shadow-black/80 text-slate-200 select-none">
                <!-- Header -->
                <div class="flex items-center justify-between pb-1">
                    <h3 class="text-lg sm:text-[19px] font-black text-white tracking-tight">How would you like to add funds?</h3>
                    <button type="button" id="txDepositChoiceModalClose" class="w-8 h-8 rounded-full bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer text-sm font-bold ml-2">✕</button>
                </div>

                <!-- Section: Deposit options -->
                <div class="mt-5">
                    <p class="text-xs font-bold text-slate-400 mb-2.5 px-0.5">Deposit options</p>
                    <div class="space-y-2.5">
                        <!-- Money deposit -->
                        <a href="${resolveRoute('src/pages/wallet.html?tab=deposit&type=money')}" data-deposit-type="money" class="tx-deposit-choice-item flex items-center justify-between p-4 rounded-2xl bg-[#1a1f2c] hover:bg-[#222838] border border-slate-800/80 hover:border-slate-700 transition cursor-pointer group">
                            <div class="flex items-center gap-3.5 min-w-0 pr-2">
                                <div class="w-8 h-8 flex items-center justify-center text-white shrink-0">
                                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                                        <rect x="2" y="6" width="20" height="12" rx="2.5"></rect>
                                        <circle cx="12" cy="12" r="2.5"></circle>
                                        <path d="M6 12h.01M18 12h.01"></path>
                                    </svg>
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-[13.5px] font-black text-white group-hover:text-cyan-300 transition">Money deposit</h4>
                                    <p class="text-[11px] text-slate-400 mt-0.5 leading-snug">Visa, Mastercard, bank transfers, e-wallets, online payments</p>
                                </div>
                            </div>
                            <svg class="w-4 h-4 text-slate-500 group-hover:text-white shrink-0 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                        </a>

                        <!-- Crypto deposit -->
                        <a href="${resolveRoute('src/pages/wallet.html?tab=deposit&type=crypto')}" data-deposit-type="crypto" class="tx-deposit-choice-item flex items-center justify-between p-4 rounded-2xl bg-[#1a1f2c] hover:bg-[#222838] border border-slate-800/80 hover:border-slate-700 transition cursor-pointer group">
                            <div class="flex items-center gap-3.5 min-w-0 pr-2">
                                <div class="w-8 h-8 flex items-center justify-center text-white shrink-0">
                                    <svg class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                                        <path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.894m-1.215 6.894-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727"/>
                                    </svg>
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-[13.5px] font-black text-white group-hover:text-cyan-300 transition">Crypto deposit</h4>
                                    <p class="text-[11px] text-slate-400 mt-0.5 leading-snug">Bitcoin, USDT, Ethereum and more</p>
                                </div>
                            </div>
                            <svg class="w-4 h-4 text-slate-500 group-hover:text-white shrink-0 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                        </a>
                    </div>
                </div>

                <!-- Section: Want to buy crypto? -->
                <div class="mt-5">
                    <p class="text-xs font-bold text-slate-400 mb-2.5 px-0.5">Want to buy crypto?</p>
                    <a href="${resolveRoute('src/pages/exchange.html')}" data-deposit-type="buy" class="tx-deposit-choice-item flex items-center justify-between p-4 rounded-2xl bg-[#1a1f2c] hover:bg-[#222838] border border-slate-800/80 hover:border-slate-700 transition cursor-pointer group">
                        <div class="flex items-center gap-3.5 min-w-0 pr-2">
                            <div class="w-8 h-8 flex items-center justify-center text-white shrink-0">
                                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </div>
                            <div class="min-w-0">
                                <h4 class="text-[13.5px] font-black text-white group-hover:text-cyan-300 transition">Buy crypto</h4>
                            </div>
                        </div>
                        <svg class="w-4 h-4 text-slate-500 group-hover:text-white shrink-0 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                    </a>
                </div>

                <!-- Footer Security note -->
                <div class="mt-6 flex items-center gap-2.5 text-slate-400 text-xs px-0.5">
                    <svg class="w-5 h-5 text-slate-400 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                    </svg>
                    <span class="text-[11.5px] text-slate-400 leading-snug">Your funds are stored securely, and your payment data is protected.</span>
                </div>
            </div>
        `;
        document.body.appendChild(depositModal);
    }

    const depositCloseBtn = document.getElementById("txDepositChoiceModalClose");
    if (depositCloseBtn && depositModal) {
        depositCloseBtn.onclick = () => {
            depositModal.style.setProperty("display", "none", "important");
            depositModal.classList.add("hidden");
            depositModal.classList.remove("flex");
        };
        depositModal.onclick = (e) => {
            if (e.target === depositModal) {
                depositModal.style.setProperty("display", "none", "important");
                depositModal.classList.add("hidden");
                depositModal.classList.remove("flex");
            }
        };
    }

    // Handle clicks inside deposit modal choice items
    depositModal.querySelectorAll(".tx-deposit-choice-item").forEach(item => {
        item.addEventListener("click", (e) => {
            const depositType = item.getAttribute("data-deposit-type");
            depositModal.style.setProperty("display", "none", "important");
            depositModal.classList.add("hidden");
            depositModal.classList.remove("flex");

            if (depositType === "buy") {
                e.preventDefault();
                window.location.href = resolveRoute("src/pages/exchange.html");
                return;
            }

            if (window.location.pathname.includes("wallet")) {
                e.preventDefault();
                if (typeof txActivateDepositTab === "function") {
                    txActivateDepositTab(depositType === "money" ? "money" : "crypto");
                } else {
                    window.location.href = resolveRoute(`src/pages/wallet.html?tab=deposit&type=${depositType === 'money' ? 'money' : 'crypto'}`);
                }
                return;
            }

            e.preventDefault();
            window.location.href = resolveRoute(`src/pages/wallet.html?tab=deposit&type=${depositType === 'money' ? 'money' : 'crypto'}`);
        });
    });

    // Load live wallet balance into navbar
    loadNavbarWalletBalance();

    // Bind mouse hover for wallet balance dropdown
    bindNavbarWalletHover();

    // Bind mouse hover for profile avatar dropdown
    bindNavbarProfileHover();
}

let txNavbarWalletCloseTimer = null;

function openNavbarWalletMenu() {
    if (txNavbarWalletCloseTimer) {
        clearTimeout(txNavbarWalletCloseTimer);
        txNavbarWalletCloseTimer = null;
    }
    const walletMenu = document.getElementById("txNavbarWalletMenu");
    const walletChevron = document.getElementById("txNavbarWalletChevron");
    const profileMenu = document.getElementById("txProfileDropdown");
    if (profileMenu) profileMenu.classList.add("hidden");

    if (walletMenu) {
        walletMenu.classList.remove("hidden");
    }
    if (walletChevron) {
        walletChevron.style.transform = "rotate(180deg)";
    }
}

function closeNavbarWalletMenu(immediate = false) {
    if (txNavbarWalletCloseTimer) {
        clearTimeout(txNavbarWalletCloseTimer);
        txNavbarWalletCloseTimer = null;
    }
    const doClose = () => {
        const walletMenu = document.getElementById("txNavbarWalletMenu");
        const walletChevron = document.getElementById("txNavbarWalletChevron");
        if (walletMenu) {
            walletMenu.classList.add("hidden");
        }
        if (walletChevron) {
            walletChevron.style.transform = "rotate(0deg)";
        }
    };
    if (immediate) {
        doClose();
    } else {
        txNavbarWalletCloseTimer = setTimeout(doClose, 200);
    }
}

function bindNavbarWalletHover() {
    const walletRoot = document.getElementById("txNavbarWalletRoot");
    if (!walletRoot || walletRoot.__txHoverBound) return;
    walletRoot.__txHoverBound = true;

    walletRoot.addEventListener("mouseenter", function () {
        openNavbarWalletMenu();
    });

    walletRoot.addEventListener("mouseleave", function () {
        closeNavbarWalletMenu(false);
    });
}

let txNavbarProfileCloseTimer = null;

function openNavbarProfileMenu() {
    if (txNavbarProfileCloseTimer) {
        clearTimeout(txNavbarProfileCloseTimer);
        txNavbarProfileCloseTimer = null;
    }
    const dropdown = document.getElementById("txProfileDropdown");
    const walletMenu = document.getElementById("txNavbarWalletMenu");
    const walletChevron = document.getElementById("txNavbarWalletChevron");
    if (walletMenu) walletMenu.classList.add("hidden");
    if (walletChevron) walletChevron.style.transform = "rotate(0deg)";

    if (dropdown) {
        const desktopWrapper = document.getElementById("txDesktopProfileWrapper");
        if (desktopWrapper && dropdown.parentElement !== desktopWrapper && dropdown.parentElement !== document.body) {
            desktopWrapper.appendChild(dropdown);
        }
        dropdown.classList.remove("hidden");
    }
}

function closeNavbarProfileMenu(immediate = false) {
    if (txNavbarProfileCloseTimer) {
        clearTimeout(txNavbarProfileCloseTimer);
        txNavbarProfileCloseTimer = null;
    }
    const doClose = () => {
        const dropdown = document.getElementById("txProfileDropdown");
        if (dropdown) {
            dropdown.classList.add("hidden");
        }
    };
    if (immediate) {
        doClose();
    } else {
        txNavbarProfileCloseTimer = setTimeout(doClose, 200);
    }
}

function bindNavbarProfileHover() {
    const profileWrapper = document.getElementById("txDesktopProfileWrapper");
    const profileBtn = document.getElementById("txNavbarProfileBtn");
    const dropdown = document.getElementById("txProfileDropdown");

    const attachHover = (el) => {
        if (!el || el.__txHoverBound) return;
        el.__txHoverBound = true;
        el.addEventListener("mouseenter", function () {
            openNavbarProfileMenu();
        });
        el.addEventListener("mouseleave", function () {
            closeNavbarProfileMenu(false);
        });
    };

    attachHover(profileWrapper);
    attachHover(profileBtn);
    attachHover(dropdown);
}

window.txOpenDepositChoiceModal = function() {
    let depositModal = document.getElementById("txDepositChoiceModal");
    if (!depositModal && typeof initPrimeXbtNavbarControls === "function") {
        initPrimeXbtNavbarControls();
        depositModal = document.getElementById("txDepositChoiceModal");
    }
    if (depositModal) {
        depositModal.style.setProperty("display", "flex", "important");
        depositModal.classList.remove("hidden");
        depositModal.classList.add("flex");
    }
};

// Global click delegation for PrimeXBT navbar deposit and wallet dropdown
document.addEventListener("click", function(e) {
    const depositBtn = e.target.closest("#txNavbarDepositBtn, #txWalletMenuDepositBtn, #txPrimeDepositBtn, #txTaDepositBtn, #quickDepositBtn, button[onclick*=\"openWalletActionModal('deposit')\"], [data-action='deposit']");
    const walletTrigger = e.target.closest("#txNavbarWalletTrigger");
    const walletMenu = document.getElementById("txNavbarWalletMenu");
    const walletChevron = document.getElementById("txNavbarWalletChevron");

    if (depositBtn) {
        e.preventDefault();
        e.stopPropagation();
        closeNavbarWalletMenu(true);

        if (typeof window.txOpenDepositChoiceModal === "function") {
            window.txOpenDepositChoiceModal();
        }
        return;
    }

    if (walletTrigger) {
        e.preventDefault();
        e.stopPropagation();
        const profileMenu = document.getElementById("txProfileDropdown");
        if (profileMenu) profileMenu.classList.add("hidden");

        if (walletMenu) {
            const isHidden = walletMenu.classList.contains("hidden");
            if (isHidden) {
                openNavbarWalletMenu();
            } else {
                closeNavbarWalletMenu(true);
            }
        }
        return;
    }

    const walletMenuLink = e.target.closest("#txNavbarWalletMenu a, #txNavbarWalletMenu button");
    if (walletMenuLink) {
        closeNavbarWalletMenu(true);
        const href = walletMenuLink.getAttribute("href") || "";
        if (window.location.pathname.includes("wallet.html") && href.includes("#")) {
            const hash = href.split("#")[1];
            if (hash) {
                window.location.hash = hash;
                if (typeof window.txHandleRouteTab === "function") {
                    window.txHandleRouteTab();
                }
            }
        }
        return;
    }

    if (walletMenu && !walletMenu.contains(e.target) && !e.target.closest("#txNavbarWalletRoot")) {
        closeNavbarWalletMenu(true);
    }
});

async function loadNavbarWalletBalance() {
    const balEl = document.getElementById("txNavbarWalletBalanceText");
    if (!balEl) return;
    const activeSubId = localStorage.getItem("traidiumx_active_user_id") || "main";
    const activeCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();

    // 0ms instant display from local active account cache
    let renderedInstant = false;
    try {
        const cachedSubs = JSON.parse(localStorage.getItem("tx_cached_sub_accounts") || "[]");
        let activeSub = null;
        if (activeSubId === "main") {
            activeSub = cachedSubs.find(s => s.is_parent);
        } else {
            activeSub = cachedSubs.find(s => String(s.id) === String(activeSubId));
        }
        if (activeSub && activeSub.wallet) {
            const w = activeSub.wallet;
            let inrVal = Number(w.main_wallet_inr?.available_balance ?? (w.main_wallet?.currency === "INR" ? w.main_wallet.available_balance : 0) ?? 0);
            let usdtVal = Number(w.main_wallet_usdt?.available_balance ?? (w.main_wallet?.currency !== "INR" ? w.main_wallet?.available_balance : 0) ?? w.available_balance ?? 0);
            const instantFormatted = activeCurrency === "INR"
                ? `₹${inrVal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `${usdtVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
            balEl.textContent = instantFormatted;
            renderedInstant = true;
        }
    } catch (_) {}

    if (!renderedInstant) {
        const cachedNavBal = localStorage.getItem(`tx_cached_navbar_balance_${activeSubId}_` + activeCurrency)
            || localStorage.getItem("tx_cached_navbar_balance_" + activeCurrency)
            || (activeCurrency === "INR" ? "₹0.00" : (localStorage.getItem("tx_cached_navbar_balance") || "0.00 USDT"));
        if (cachedNavBal && (!balEl.textContent || balEl.textContent.trim() === "0.00 USD" || balEl.textContent.trim() === "₹0.00" || balEl.textContent.trim() === "0.00 USDT")) {
            balEl.textContent = cachedNavBal;
        }
    }

    try {
        if (typeof apiRequest !== "function") return;
        const res = await apiRequest("/wallet/balance");
        if (res && res.data) {
            const w = res.data.wallet || res.data;
            const curActiveCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
            
            let inrAvail = 0;
            let usdtAvail = 0;

            if (w) {
                // Compute INR Available
                if (w.main_wallet_inr && (typeof w.main_wallet_inr.available_balance === "number" || w.main_wallet_inr.available_balance !== undefined)) {
                    inrAvail = Number(w.main_wallet_inr.available_balance);
                } else if (w.main_wallet && w.main_wallet.currency === "INR" && (typeof w.main_wallet.available_balance === "number" || w.main_wallet.available_balance !== undefined)) {
                    inrAvail = Number(w.main_wallet.available_balance);
                }

                // Compute USDT / USD Available
                if (w.main_wallet_usdt && (typeof w.main_wallet_usdt.available_balance === "number" || w.main_wallet_usdt.available_balance !== undefined)) {
                    usdtAvail = Number(w.main_wallet_usdt.available_balance);
                } else if (w.main_wallet && (w.main_wallet.currency === "USDT" || w.main_wallet.currency === "USD" || !w.main_wallet.currency) && (typeof w.main_wallet.available_balance === "number" || w.main_wallet.available_balance !== undefined)) {
                    usdtAvail = Number(w.main_wallet.available_balance);
                } else {
                    usdtAvail = Number(w.available_balance || 0);
                }
            }
            if (isNaN(inrAvail)) inrAvail = 0;
            if (isNaN(usdtAvail)) usdtAvail = 0;

            const formattedInr = `₹${inrAvail.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const formattedUsdt = `${usdtAvail.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;

            try {
                localStorage.setItem(`tx_cached_navbar_balance_${activeSubId}_INR`, formattedInr);
                localStorage.setItem(`tx_cached_navbar_balance_${activeSubId}_USDT`, formattedUsdt);
                localStorage.setItem("tx_cached_navbar_balance_INR", formattedInr);
                localStorage.setItem("tx_cached_navbar_balance_USDT", formattedUsdt);
                localStorage.setItem("tx_cached_navbar_balance", curActiveCurrency === "INR" ? formattedInr : formattedUsdt);
            } catch (_) {}

            const activeFormatted = curActiveCurrency === "INR" ? formattedInr : formattedUsdt;
            balEl.textContent = activeFormatted;
            
            const trigger = document.getElementById("txNavbarWalletTrigger");
            const activeAccName = localStorage.getItem("traidiumx_active_user_name") || "Main Trading Account";
            if (trigger) {
                const activeVal = curActiveCurrency === "INR" ? inrAvail : usdtAvail;
                trigger.setAttribute("title", `Main Wallet: ${curActiveCurrency === "INR" ? "₹" : ""}${activeVal.toFixed(2)} ${curActiveCurrency} (${activeAccName})`);
            }
        }
    } catch (err) {
        // silent fallback
    }
}
window.loadNavbarWalletBalance = loadNavbarWalletBalance;

window.addEventListener("traidiumx:currency-change", (e) => {
    const cur = (e.detail?.currency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    if (typeof updateNavbarToggleUI === "function") {
        updateNavbarToggleUI(cur);
    }
    loadNavbarWalletBalance();
});
window.addEventListener("traidiumx:wallet-sync", () => {
    loadNavbarWalletBalance();
});


function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
(function () {
    const STATUS_POLL_MS = 15000;
    let statusTimer = null;
    let countdownTimer = null;
    let latestStatusData = null;

    document.addEventListener("DOMContentLoaded", function () {
        startAccountStatusWatcher();
    });

    function startAccountStatusWatcher() {
        if (!isLoggedIn()) {
            removeAccountStatusBanner();
            return;
        }

        loadAccountStatusNotice();
        window.clearInterval(statusTimer);
        statusTimer = window.setInterval(loadAccountStatusNotice, STATUS_POLL_MS);
    }

    async function loadAccountStatusNotice() {
        if (!isLoggedIn()) {
            removeAccountStatusBanner();
            return;
        }

        try {
            const response = await apiRequest("/user/account-status");
            latestStatusData = response.data || {};
            renderAccountStatusBanner(latestStatusData);
            loadNavbarWalletBalance();
        } catch (error) {
            // Do not interrupt page functionality for a status-banner fetch failure.
            if (error && error.status === 401) return;
        }
    }

    function renderAccountStatusBanner(data) {
        const pending = data && data.pending_action;
        const status = String(data?.account_status || "active").toLowerCase();

        if (!pending && status === "active") {
            removeAccountStatusBanner();
            return;
        }

        const banner = ensureAccountStatusBanner();
        const reason = escapeStatusHtml(data?.reason || pending?.reason || "Admin account notice.");
        const action = String(pending?.action || status || "restricted").toLowerCase();
        const title = pending
            ? action === "blocked"
                ? "Account Block Warning"
                : "Account Suspend Warning"
            : status === "blocked"
                ? "Account Blocked"
                : status === "suspended"
                    ? "Account Suspended"
                    : "Account Restricted";

        const message = pending
            ? pending.message || `Your account will be ${action}. Please complete any trade action before the timer ends.`
            : data?.message || "Your account is restricted. Please contact support.";

        const timerHtml = pending
            ? `<div class="tx-account-status-timer" data-account-status-countdown>${formatStatusDuration(pending.remaining_seconds || 0)}</div>`
            : status === "suspended" && data?.suspended_remaining_seconds
                ? `<div class="tx-account-status-timer" data-account-status-countdown>${formatStatusDuration(data.suspended_remaining_seconds || 0)}</div>`
                : "";

        banner.innerHTML = `
            <div class="tx-account-status-card">
                <div class="tx-account-status-glow"></div>
                <div class="tx-account-status-main">
                    <div>
                        <div class="tx-account-status-eyebrow">TraidiumX Account Notice</div>
                        <h3>${escapeStatusHtml(title)}</h3>
                        <p>${escapeStatusHtml(message)}</p>
                        <div class="tx-account-status-reason"><b>Reason:</b> ${reason}</div>
                    </div>
                    <div class="tx-account-status-side">
                        ${timerHtml}
                        <span class="tx-account-status-pill">${pending ? "Grace Time" : escapeStatusHtml(status)}</span>
                    </div>
                </div>
                ${pending ? `<p class="tx-account-status-help">You can buy, sell, or close trades until this timer ends. After that the restriction will apply automatically.</p>` : ""}
            </div>
        `;

        startStatusCountdown(data);
    }

    function ensureAccountStatusBanner() {
        let banner = document.getElementById("txAccountStatusBanner");
        if (banner) return banner;

        injectAccountStatusStyles();
        banner = document.createElement("div");
        banner.id = "txAccountStatusBanner";
        banner.className = "tx-account-status-banner";
        document.body.appendChild(banner);
        return banner;
    }

    function removeAccountStatusBanner() {
        window.clearInterval(countdownTimer);
        countdownTimer = null;
        latestStatusData = null;
        const banner = document.getElementById("txAccountStatusBanner");
        if (banner) banner.remove();
    }

    function startStatusCountdown(data) {
        window.clearInterval(countdownTimer);
        const pending = data && data.pending_action;
        let remaining = Number(pending?.remaining_seconds || data?.suspended_remaining_seconds || 0);
        const countdownEl = document.querySelector("[data-account-status-countdown]");

        if (!countdownEl || !Number.isFinite(remaining) || remaining <= 0) return;

        countdownTimer = window.setInterval(function () {
            remaining -= 1;
            countdownEl.textContent = formatStatusDuration(Math.max(0, remaining));

            if (remaining <= 0) {
                window.clearInterval(countdownTimer);
                countdownTimer = null;
                loadAccountStatusNotice();
            }
        }, 1000);
    }

    function formatStatusDuration(seconds) {
        seconds = Math.max(0, Number(seconds || 0));
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h`;
        if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
        return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    function escapeStatusHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function injectAccountStatusStyles() {
        if (document.getElementById("txAccountStatusStyles")) return;
        const style = document.createElement("style");
        style.id = "txAccountStatusStyles";
        style.textContent = `
            .tx-account-status-banner{position:fixed;left:50%;top:86px;z-index:9999;width:min(920px,calc(100vw - 28px));transform:translateX(-50%);pointer-events:none;}
            .tx-account-status-card{position:relative;overflow:hidden;border:1px solid rgba(251,191,36,.32);border-radius:24px;background:linear-gradient(135deg,rgba(15,23,42,.98),rgba(30,41,59,.96));box-shadow:0 24px 70px rgba(0,0,0,.38);padding:18px;pointer-events:auto;color:#fff;backdrop-filter:blur(18px);}
            .tx-account-status-glow{position:absolute;inset:-60px auto auto -60px;width:180px;height:180px;border-radius:999px;background:rgba(251,191,36,.22);filter:blur(34px);}
            .tx-account-status-main{position:relative;display:flex;align-items:center;justify-content:space-between;gap:18px;}
            .tx-account-status-eyebrow{font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#fde68a;}
            .tx-account-status-card h3{margin:4px 0 0;font-size:18px;line-height:1.15;font-weight:900;color:#fff;}
            .tx-account-status-card p{margin:6px 0 0;font-size:13px;line-height:1.55;font-weight:700;color:#cbd5e1;}
            .tx-account-status-reason{margin-top:10px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);padding:10px 12px;font-size:13px;font-weight:700;color:#f8fafc;}
            .tx-account-status-side{display:grid;gap:8px;justify-items:end;min-width:148px;}
            .tx-account-status-timer{border-radius:20px;border:1px solid rgba(251,191,36,.42);background:rgba(251,191,36,.12);padding:10px 14px;font-size:26px;line-height:1;font-weight:950;color:#fef3c7;font-variant-numeric:tabular-nums;}
            .tx-account-status-pill{border-radius:999px;background:rgba(14,165,233,.12);border:1px solid rgba(103,232,249,.28);padding:7px 11px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#a5f3fc;}
            .tx-account-status-help{position:relative;margin-top:12px!important;color:#fcd34d!important;font-size:12px!important;font-weight:800!important;}
            @media(max-width:640px){.tx-account-status-banner{top:72px;width:calc(100vw - 18px)}.tx-account-status-main{align-items:flex-start;flex-direction:column}.tx-account-status-side{width:100%;justify-items:start}.tx-account-status-timer{font-size:22px}}
        `;
        document.head.appendChild(style);
    }
})();

(function () {
    const NOTIFICATION_POLL_MS = 15000;
    let notificationTimer = null;
    let latestNotifications = [];
    let notificationCenterReady = false;
    let lastNotificationTrigger = null;

    document.addEventListener("DOMContentLoaded", function () {
        initUserNotificationCenter();
    });

    document.addEventListener("componentsLoaded", function () {
        initUserNotificationCenter();
    });

    document.addEventListener("click", function (event) {
        const toggleButton = event.target.closest("[data-notification-toggle]");
        if (toggleButton) {
            event.preventDefault();
            event.stopPropagation();
            lastNotificationTrigger = toggleButton;
            openNotificationModal();
            return;
        }

        const markButton = event.target.closest("[data-notification-mark-read]");
        if (markButton) {
            event.preventDefault();
            event.stopPropagation();
            markVisibleNotificationsRead();
            return;
        }

        const closeButton = event.target.closest("[data-notification-close]");
        if (closeButton || event.target.classList?.contains("tx-notification-modal-backdrop")) {
            event.preventDefault();
            closeNotificationModal();
        }
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeNotificationModal();
        }
    });

    function initUserNotificationCenter() {
        if (!isLoggedIn()) {
            latestNotifications = [];
            window.clearInterval(notificationTimer);
            updateNotificationCenterUi();
            closeNotificationModal();
            return;
        }

        injectUserNotificationStyles();
        ensureNotificationModal();
        updateNotificationCenterUi();

        if (!notificationCenterReady) {
            notificationCenterReady = true;
            loadUserNotifications({ showToasts: false });
            window.clearInterval(notificationTimer);
            notificationTimer = window.setInterval(function () {
                loadUserNotifications({ showToasts: false });
            }, NOTIFICATION_POLL_MS);

            // Listen for custom sync events to reload notifications instantly
            window.addEventListener("traidiumx:notifications-sync", function () {
                loadUserNotifications({ showToasts: false });
            });
        } else {
            loadUserNotifications({ showToasts: false });
        }
    }

    async function loadUserNotifications(options = {}) {
        if (!isLoggedIn()) return;

        try {
            const response = await apiRequest("/user/notifications?limit=50");
            latestNotifications = Array.isArray(response?.data?.notifications) ? response.data.notifications : [];
            updateNotificationCenterUi();

        } catch (error) {
            // Notification polling must never break trading/user pages.
            if (error && error.status === 401) return;
        }
    }

    function showToastsForNewUnreadNotifications() {
        // User-side notifications are intentionally shown only inside the bell modal.
        // This prevents auto side popups from covering wallet/trading screens.
    }

    function getNotificationFocusReturnTarget() {
        if (lastNotificationTrigger && lastNotificationTrigger.isConnected && !lastNotificationTrigger.disabled) {
            return lastNotificationTrigger;
        }

        return Array.from(document.querySelectorAll("[data-notification-toggle]")).find(function (button) {
            return !button.disabled && button.getClientRects().length > 0;
        }) || null;
    }

    function openNotificationModal() {
        if (!isLoggedIn()) return;

        const modal = ensureNotificationModal();
        if (!modal) return;

        // Remove inert before the dialog becomes visible/focusable.
        modal.inert = false;
        modal.classList.remove("hidden");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("tx-notification-modal-open");
        document.querySelectorAll("[data-notification-toggle]").forEach(function (button) {
            button.setAttribute("aria-expanded", "true");
        });

        renderNotificationModalList(latestNotifications);

        window.requestAnimationFrame(function () {
            modal.querySelector("[data-notification-close]")?.focus({ preventScroll: true });
        });

        loadUserNotifications({ showToasts: false }).then(function () {
            renderNotificationModalList(latestNotifications);
            window.setTimeout(markVisibleNotificationsRead, 700);
        });
    }

    function closeNotificationModal() {
        const modal = document.getElementById("txNotificationModal");
        const modalWasOpen = Boolean(modal && !modal.classList.contains("hidden"));

        if (modal && modalWasOpen && modal.contains(document.activeElement)) {
            const focusTarget = getNotificationFocusReturnTarget();

            if (focusTarget) {
                focusTarget.focus({ preventScroll: true });
            } else if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
        }

        if (modal) {
            // Focus is moved outside first; only then hide the modal from assistive technology.
            modal.inert = true;
            modal.classList.add("hidden");
            modal.setAttribute("aria-hidden", "true");
        }

        document.body.classList.remove("tx-notification-modal-open");
        document.querySelectorAll("[data-notification-toggle]").forEach(function (button) {
            button.setAttribute("aria-expanded", "false");
        });
    }

    async function markVisibleNotificationsRead() {
        if (!isLoggedIn() || !latestNotifications.length) return;

        const unreadIds = latestNotifications
            .filter(function (notice) {
                return notice && !notice.read_at && notice.id;
            })
            .map(function (notice) {
                return String(notice.id);
            });

        if (!unreadIds.length) return;

        latestNotifications = latestNotifications.map(function (notice) {
            if (notice && unreadIds.includes(String(notice.id))) {
                return { ...notice, read_at: new Date().toISOString() };
            }
            return notice;
        });
        updateNotificationCenterUi();

        try {
            await apiRequest("/user/notifications/read", {
                method: "PATCH",
                body: JSON.stringify({ notification_ids: unreadIds }),
            });
        } catch (error) {
            // If marking read fails, the next poll will restore server state.
            if (error && error.status === 401) return;
        }
    }

    function updateNotificationCenterUi() {
        const roots = document.querySelectorAll("[data-notification-root]");
        const unreadCount = latestNotifications.filter(function (notice) {
            return notice && !notice.read_at;
        }).length;

        roots.forEach(function (root) {
            updateBadge(root, unreadCount);
        });

        renderNotificationModalList(latestNotifications);
    }

    function updateBadge(root, unreadCount) {
        const badge = root.querySelector("[data-notification-badge]");
        if (!badge) return;

        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
            badge.classList.remove("hidden");
        } else {
            badge.textContent = "0";
            badge.classList.add("hidden");
        }
    }

    function ensureNotificationModal() {
        injectUserNotificationStyles();
        let modal = document.getElementById("txNotificationModal");
        if (modal) return modal;

        modal = document.createElement("div");
        modal.id = "txNotificationModal";
        modal.className = "tx-notification-modal hidden";
        modal.setAttribute("aria-hidden", "true");
        modal.inert = true;
        modal.innerHTML = `
            <div class="tx-notification-modal-backdrop"></div>
            <section class="tx-notification-modal-shell" role="dialog" aria-modal="true" aria-labelledby="txNotificationModalTitle">
                <div class="tx-notification-modal-topbar"></div>
                <div class="tx-notification-modal-head">
                    <div>
                        <p>TraidiumX Notification Center</p>
                        <h3 id="txNotificationModalTitle">Notifications</h3>
                        <span>Admin updates, account status and maintenance notices appear here.</span>
                    </div>
                    <button type="button" class="tx-notification-modal-close" data-notification-close aria-label="Close notifications">×</button>
                </div>
                <div class="tx-notification-modal-actions">
                    <button type="button" class="tx-notification-refresh" data-notification-refresh>Refresh</button>
                    <button type="button" class="tx-notification-read" data-notification-mark-read>Mark all read</button>
                </div>
                <div class="tx-navbar-notification-list" data-notification-modal-list>
                    <div class="tx-navbar-notification-empty">Loading notifications...</div>
                </div>
            </section>
        `;

        modal.querySelector("[data-notification-refresh]")?.addEventListener("click", function (event) {
            event.preventDefault();
            loadUserNotifications({ showToasts: false });
        });

        document.body.appendChild(modal);
        return modal;
    }

    function renderNotificationModalList(notifications = []) {
        const modal = document.getElementById("txNotificationModal");
        const list = modal?.querySelector("[data-notification-modal-list]");
        if (!list) return;

        if (!isLoggedIn()) {
            list.innerHTML = `<div class="tx-navbar-notification-empty">Login required.</div>`;
            return;
        }

        if (!notifications.length) {
            list.innerHTML = `<div class="tx-navbar-notification-empty">No notifications yet.</div>`;
            return;
        }

        list.innerHTML = notifications.map(renderNotificationItem).join("");
    }

    function renderNotificationItem(notice) {
        const unread = !notice.read_at;
        const severity = normalizeNoticeSeverity(notice.severity || "info");
        const title = escapeNotificationHtml(notice.title || "TraidiumX Notice");
        const message = escapeNotificationHtml(notice.message || "");
        const type = escapeNotificationHtml(formatNoticeType(notice.type || "notice"));
        const severityLabel = escapeNotificationHtml(formatNoticeSeverity(severity));
        const time = escapeNotificationHtml(formatNoticeTime(notice.created_at));

        return `
            <article class="tx-navbar-notification-item ${severity} ${unread ? "is-unread" : ""}">
                <div class="tx-navbar-notification-dot"></div>
                <div>
                    <div class="tx-navbar-notification-meta">
                        <span class="tx-navbar-notification-severity-badge">${severityLabel}</span>
                        <span class="tx-navbar-notification-type">${type}</span>
                        <span>${time}</span>
                    </div>
                    <h4>${title}</h4>
                    <p>${message}</p>
                </div>
            </article>
        `;
    }

    function normalizeNoticeSeverity(value) {
        const severity = String(value || "info").toLowerCase().trim();
        if (["danger", "error", "red"].includes(severity)) return "alert";
        if (["warn", "yellow"].includes(severity)) return "warning";
        if (["green", "done"].includes(severity)) return "success";
        if (["blue", "information"].includes(severity)) return "info";
        return ["info", "success", "warning", "alert"].includes(severity) ? severity : "info";
    }

    function formatNoticeSeverity(value) {
        const severity = normalizeNoticeSeverity(value);
        if (severity === "success") return "Success";
        if (severity === "warning") return "Warning";
        if (severity === "alert") return "Alert";
        return "Information";
    }

    function formatNoticeType(value) {
        return String(value || "notice")
            .replaceAll("_", " ")
            .replace(/\b\w/g, function (letter) {
                return letter.toUpperCase();
            });
    }

    function parseNotificationDate(value) {
        if (!value) return null;

        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : value;
        }

        let raw = String(value).trim();
        if (!raw) return null;

        // Backend stores notification dates in UTC. Older Mongo records may come
        // back as timezone-less ISO strings, so force those to UTC before parsing.
        const looksIsoDate = /^\d{4}-\d{2}-\d{2}T/.test(raw);
        const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
        if (looksIsoDate && !hasTimezone) {
            raw += "Z";
        }

        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function formatNoticeTime(value) {
        const created = parseNotificationDate(value);
        if (!created) return "Just now";

        const diffMs = Date.now() - created.getTime();
        const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
        if (diffSeconds < 60) return "Just now";

        const diffMinutes = Math.floor(diffSeconds / 60);
        if (diffMinutes < 60) return `${diffMinutes}m ago`;

        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours}h ago`;

        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays}d ago`;

        return created.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
    }

    function ensureNotificationHost() {
        return null;
    }

    function showUserNotificationToast() {
        // Disabled by requirement: bell icon modal is the only user-side notification view.
    }

    function injectUserNotificationStyles() {
        if (document.getElementById("txUserNotificationStyles")) return;

        const style = document.createElement("style");
        style.id = "txUserNotificationStyles";
        style.textContent = `
            .tx-navbar-notification-root{position:relative;display:inline-flex;align-items:center;justify-content:center;}
            .tx-navbar-notification-root-mobile{display:block;width:100%;}
            .tx-navbar-notification-btn{position:relative;display:inline-grid;place-items:center;width:46px;height:46px;border-radius:999px;border:1px solid rgba(34,211,238,.34);background:radial-gradient(circle at 35% 24%,rgba(103,232,249,.18),transparent 34%),linear-gradient(135deg,rgba(15,23,42,.98),rgba(8,47,73,.72));color:#e0faff;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 12px 28px rgba(0,0,0,.24),0 0 0 1px rgba(34,211,238,.05);transition:all .18s ease;cursor:pointer;}
            .tx-navbar-notification-btn:hover,.tx-navbar-notification-btn[aria-expanded="true"]{border-color:rgba(103,232,249,.72);background:radial-gradient(circle at 35% 24%,rgba(103,232,249,.26),transparent 35%),linear-gradient(135deg,rgba(8,47,73,.92),rgba(15,23,42,.98));transform:translateY(-1px);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 16px 32px rgba(0,0,0,.30),0 0 24px rgba(34,211,238,.16);}
            .tx-navbar-notification-btn-mobile{display:flex;width:100%;height:auto;min-height:52px;justify-content:center;gap:10px;border-radius:18px;padding:13px 16px;font-size:13px;font-weight:950;text-transform:uppercase;letter-spacing:.08em;}
            .tx-navbar-notification-icon-wrap{display:grid;place-items:center;width:21px;height:21px;border-radius:999px;}
            .tx-navbar-notification-icon{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 9px rgba(103,232,249,.38));}
            .tx-navbar-notification-label{color:#cffafe;}
            .tx-navbar-notification-badge{position:absolute;right:-5px;top:-7px;display:grid;min-width:20px;height:20px;place-items:center;border-radius:999px;border:2px solid #030712;background:#ef4444;color:#fff;padding:0 5px;font-size:10px;font-weight:950;line-height:1;box-shadow:0 8px 18px rgba(239,68,68,.34);}
            .tx-navbar-notification-badge.hidden{display:none!important;}
            .tx-notification-modal-open{overflow:hidden;}
            .tx-notification-modal{position:fixed;inset:0;z-index:1000020;display:flex;align-items:stretch;justify-content:flex-end;padding:0;color:#e5e7eb;}
            .tx-notification-modal.hidden{display:none!important;}
            .tx-notification-modal-backdrop{position:absolute;inset:0;background:rgba(2,6,23,.66);backdrop-filter:blur(10px);}
            .tx-notification-modal-shell{position:relative;width:420px;max-width:100vw;height:100vh;max-height:100vh;display:flex;flex-direction:column;overflow:hidden;border:none;border-left:1px solid rgba(34,211,238,.24);background:linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.99));box-shadow:-10px 0 50px rgba(0,0,0,.5),inset 1px 0 0 rgba(255,255,255,.08);animation:txNotificationModalIn .22s cubic-bezier(0.16, 1, 0.3, 1);}
            .tx-notification-modal-topbar{height:4px;background:linear-gradient(90deg,#22d3ee,#34d399,#fbbf24,#ef4444);opacity:.88;}
            .tx-notification-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:1px solid rgba(148,163,184,.14);padding:20px 20px 16px;background:radial-gradient(circle at top left,rgba(34,211,238,.17),transparent 42%);}
            .tx-notification-modal-head p{margin:0;color:#67e8f9;font-size:10px;font-weight:950;letter-spacing:.18em;text-transform:uppercase;}
            .tx-notification-modal-head h3{margin:4px 0 0;color:#fff;font-size:24px;font-weight:950;line-height:1.1;}
            .tx-notification-modal-head span{display:block;margin-top:7px;color:#94a3b8;font-size:12px;font-weight:750;line-height:1.45;}
            .tx-notification-modal-close{display:grid;place-items:center;width:38px;height:38px;border-radius:14px;border:1px solid rgba(148,163,184,.20);background:rgba(148,163,184,.08);color:#e2e8f0;font-size:24px;font-weight:900;line-height:1;cursor:pointer;transition:all .16s ease;flex:0 0 auto;}
            .tx-notification-modal-close:hover{border-color:rgba(248,113,113,.45);background:rgba(248,113,113,.14);color:#fecaca;}
            .tx-notification-modal-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;border-bottom:1px solid rgba(148,163,184,.11);padding:12px 16px;background:rgba(15,23,42,.72);}
            .tx-notification-modal-actions button{border:1px solid rgba(103,232,249,.24);border-radius:999px;background:rgba(34,211,238,.08);padding:9px 12px;color:#a5f3fc;font-size:11px;font-weight:950;cursor:pointer;transition:all .16s ease;white-space:nowrap;text-transform:uppercase;letter-spacing:.06em;}
            .tx-notification-modal-actions button:hover{background:rgba(34,211,238,.16);border-color:rgba(103,232,249,.55);color:#ecfeff;}
            .tx-notification-read{background:rgba(16,185,129,.10)!important;border-color:rgba(52,211,153,.28)!important;color:#bbf7d0!important;}
            .tx-navbar-notification-list{flex:1 1 auto;overflow-y:auto;padding:10px;scrollbar-width:thin;scrollbar-color:rgba(103,232,249,.28) transparent;}
            .tx-navbar-notification-list::-webkit-scrollbar{width:6px;}
            .tx-navbar-notification-list::-webkit-scrollbar-thumb{border-radius:999px;background:rgba(103,232,249,.28);}
            .tx-navbar-notification-item{--notice-color:#38bdf8;--notice-soft:rgba(56,189,248,.12);--notice-border:rgba(56,189,248,.35);--notice-text:#38bdf8;position:relative;display:grid;grid-template-columns:12px 1fr;gap:12px;border-radius:18px;border:1px solid rgba(255,255,255,.06)!important;padding:12px 14px;transition:background .16s ease,border-color .16s ease,opacity .16s ease;opacity:.95;}
            .tx-navbar-notification-item.info{--notice-color:#38bdf8;--notice-soft:rgba(56,189,248,.14);--notice-border:rgba(56,189,248,.45);--notice-text:#38bdf8;}
            .tx-navbar-notification-item.success{--notice-color:#34d399;--notice-soft:rgba(52,211,153,.14);--notice-border:rgba(52,211,153,.45);--notice-text:#34d399;}
            .tx-navbar-notification-item.warning{--notice-color:#fbbf24;--notice-soft:rgba(251,191,36,.14);--notice-border:rgba(251,191,36,.45);--notice-text:#fbbf24;}
            .tx-navbar-notification-item.alert,.tx-navbar-notification-item.danger,.tx-navbar-notification-item.error{--notice-color:#f43f5e;--notice-soft:rgba(244,63,94,.14);--notice-border:rgba(244,63,94,.45);--notice-text:#f43f5e;}
            .tx-navbar-notification-item:hover{border-color:var(--notice-border)!important;background:var(--notice-soft);opacity:1;}
            .tx-navbar-notification-item.is-unread{opacity:1;border-color:var(--notice-border)!important;background:linear-gradient(135deg,var(--notice-soft),rgba(255,255,255,.03));}
            .tx-navbar-notification-item.is-unread:hover{opacity:1;}
            .tx-navbar-notification-dot{margin-top:5px;width:9px;height:9px;border-radius:999px;background:var(--notice-color)!important;box-shadow:0 0 14px var(--notice-color)!important;opacity:1!important;transition:all .16s ease;}
            .tx-navbar-notification-item.is-unread .tx-navbar-notification-dot{box-shadow:0 0 18px var(--notice-color)!important;}
            .tx-navbar-notification-meta{display:flex;align-items:center;gap:8px;color:#94a3b8;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;flex-wrap:wrap;}
            .tx-navbar-notification-meta span:last-child{margin-left:auto;}
            .tx-navbar-notification-severity-badge{display:inline-flex;align-items:center;border:1px solid var(--notice-border);background:var(--notice-soft);color:var(--notice-text);border-radius:999px;padding:3.5px 9px;font-size:9.5px;font-weight:950;letter-spacing:.08em;line-height:1;text-transform:uppercase;}
            .tx-navbar-notification-type{color:#94a3b8;}
            .tx-navbar-notification-item h4{margin:7px 0 0;color:#fff;font-size:13px;font-weight:950;line-height:1.25;}
            .tx-navbar-notification-item p{margin:5px 0 0;color:#cbd5e1;font-size:12px;font-weight:700;line-height:1.5;}
            .tx-navbar-notification-empty{padding:30px 18px;text-align:center;color:#94a3b8;font-size:13px;font-weight:800;}
            .tx-user-notification-host{display:none!important;}
            .tx-user-notification-toast{position:relative;overflow:hidden;border-radius:22px;border:1px solid rgba(34,211,238,.24);background:linear-gradient(135deg,rgba(15,23,42,.98),rgba(2,6,23,.96));box-shadow:0 22px 60px rgba(0,0,0,.42);padding:16px 48px 16px 16px;color:#e5e7eb;pointer-events:auto;animation:txUserNotificationIn .18s ease-out;backdrop-filter:blur(16px);}
            .tx-user-notification-toast.success{border-color:rgba(52,211,153,.32);}
            .tx-user-notification-toast.warning{border-color:rgba(251,191,36,.34);}
            .tx-user-notification-toast.danger,.tx-user-notification-toast.error{border-color:rgba(248,113,113,.36);}
            .tx-user-notification-glow{position:absolute;inset:-55px auto auto -55px;width:150px;height:150px;border-radius:999px;background:rgba(34,211,238,.16);filter:blur(30px);}
            .tx-user-notification-toast.success .tx-user-notification-glow{background:rgba(52,211,153,.18);}
            .tx-user-notification-toast.warning .tx-user-notification-glow{background:rgba(251,191,36,.18);}
            .tx-user-notification-toast.danger .tx-user-notification-glow,.tx-user-notification-toast.error .tx-user-notification-glow{background:rgba(248,113,113,.18);}
            .tx-user-notification-content{position:relative;}
            .tx-user-notification-kicker{font-size:10px;font-weight:950;letter-spacing:.16em;text-transform:uppercase;color:#67e8f9;}
            .tx-user-notification-toast.success .tx-user-notification-kicker{color:#6ee7b7;}
            .tx-user-notification-toast.warning .tx-user-notification-kicker{color:#fde68a;}
            .tx-user-notification-toast.danger .tx-user-notification-kicker,.tx-user-notification-toast.error .tx-user-notification-kicker{color:#fecaca;}
            .tx-user-notification-toast h4{margin:5px 0 0;color:#fff;font-size:15px;line-height:1.25;font-weight:950;}
            .tx-user-notification-toast p{margin:7px 0 0;color:#cbd5e1;font-size:12px;line-height:1.55;font-weight:750;}
            .tx-user-notification-close{position:absolute;right:12px;top:12px;display:grid;place-items:center;width:28px;height:28px;border-radius:10px;border:1px solid rgba(148,163,184,.20);background:rgba(148,163,184,.10);color:#e2e8f0;cursor:pointer;font-size:18px;font-weight:900;line-height:1;}
            .tx-user-notification-toast.is-leaving{opacity:0;transform:translateX(12px);transition:opacity .16s ease,transform .16s ease;}
            @keyframes txUserNotificationIn{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
            @keyframes txNotificationModalIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
            @media(max-width:1023px){.tx-navbar-notification-list{max-height:calc(100vh - 260px);}}
            @media(max-width:640px){.tx-notification-modal-shell{width:100vw;max-width:100vw;}.tx-notification-modal-head{padding:17px 16px 14px}.tx-notification-modal-head h3{font-size:21px}.tx-notification-modal-actions{justify-content:space-between}.tx-notification-modal-actions button{padding:8px 10px;font-size:10px}.tx-user-notification-host{left:14px;right:14px;top:76px;width:auto}.tx-user-notification-toast{border-radius:20px}}
        `;
        document.head.appendChild(style);
    }

    function escapeNotificationHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }
})();

function applyRegisterStepLinkAuthState() {
    const regLink = document.getElementById("registerNowStepLink");
    if (!regLink) return;

    if (typeof isLoggedIn === "function" && isLoggedIn()) {
        regLink.classList.add("disabled");
        regLink.setAttribute("disabled", "true");
        regLink.title = "You are already logged in";
        regLink.addEventListener("click", preventStepLinkClick);
    } else {
        regLink.classList.remove("disabled");
        regLink.removeAttribute("disabled");
        regLink.removeAttribute("title");
        regLink.removeEventListener("click", preventStepLinkClick);
    }
}

function preventStepLinkClick(e) {
    e.preventDefault();
}


function initNavbarCurrencyToggle() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlCurrency = urlParams.get("currency") || urlParams.get("quote");
    if (urlCurrency && ["INR", "USDT"].includes(urlCurrency.toUpperCase())) {
        localStorage.setItem("tx_navbar_currency", urlCurrency.toUpperCase());
    }
    const activeCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
    localStorage.setItem("tx_navbar_currency", activeCurrency);
    updateNavbarToggleUI(activeCurrency);

    document.querySelectorAll("[data-currency]").forEach((btn) => {
        const newBtn = btn.cloneNode(true);
        if (btn.parentNode) {
            btn.parentNode.replaceChild(newBtn, btn);
        }
    });

    document.querySelectorAll("[data-currency]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const selected = btn.getAttribute("data-currency");
            localStorage.setItem("tx_navbar_currency", selected);
            updateNavbarToggleUI(selected);
            
            // Dispatch event so other pages can react
            window.dispatchEvent(new CustomEvent("traidiumx:currency-change", { detail: { currency: selected } }));
            window.dispatchEvent(new CustomEvent("traidiumx:wallet-sync"));
        });
    });
}

function updateNavbarToggleUI(currency) {
    const buttons = document.querySelectorAll("[data-currency]");
    buttons.forEach((btn) => {
        const btnCurrency = btn.getAttribute("data-currency");
        if (btnCurrency === currency) {
            btn.className = "flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 bg-[#22d3ee] text-[#0f172a] shadow-[0_2px_10px_rgba(34,211,238,0.3)] min-w-[68px]";
        } else {
            btn.className = "flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 bg-transparent text-slate-300 hover:text-slate-100 hover:bg-slate-800/40 min-w-[68px]";
        }
    });
}

function bindNavbarDropdown(user) {
    if (typeof bindNavbarProfileHover === "function") {
        bindNavbarProfileHover();
    }
    const profileBtn = document.getElementById("txNavbarProfileBtn");
    const dropdown = document.getElementById("txProfileDropdown");
    const themeBtn = document.getElementById("txThemeToggleBtn");
    const copyBtn = document.getElementById("txCopyIdBtn");
    const copyFeedback = document.getElementById("txCopyFeedback");
    const createSubLink = document.getElementById("txNavbarCreateSubAccountLink");

    // Sub Accounts button — always redirect to profile sub-accounts tab
    const subAccountsBtn = document.getElementById("txNavbarSubAccountsBtn");
    if (subAccountsBtn) {
        subAccountsBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (dropdown) dropdown.classList.add("hidden");
            navigateToProfileRoute("src/pages/profile.html#sub-accounts");
        });
    }

    // Mobile profile avatar button click handler
    const mobileBtn = document.getElementById("mobileNavbarProfileBtn");
    if (mobileBtn && dropdown) {
        mobileBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            const isHidden = dropdown.classList.contains("hidden");
            if (dropdown.parentElement !== document.body) {
                document.body.appendChild(dropdown);
            }
            const baseClass = "fixed top-[76px] right-[12px] w-[calc(100vw-24px)] max-w-[340px] max-h-[calc(100vh-90px)] overflow-y-auto bg-[#0c101d] border border-cyan-400/20 rounded-3xl p-5 shadow-2xl z-[9999999] text-slate-200";
            dropdown.className = isHidden ? baseClass : baseClass + " hidden";

            const mobileMenu = document.getElementById("mobileMenu");
            if (isHidden && mobileMenu && !mobileMenu.classList.contains("hidden")) {
                mobileMenu.classList.add("hidden");
                document.documentElement.classList.remove("tx-mobile-menu-open");
                document.body.classList.remove("tx-mobile-menu-open");
            }
        };
    }

    // Unified global event delegation for avatar button toggles, option navigation, and outside clicks
    if (!window.__txProfileGlobalDelegationBound) {
        window.__txProfileGlobalDelegationBound = true;
        document.addEventListener("click", function (e) {
            const desktopBtn = e.target.closest("#txNavbarProfileBtn");
            const mobBtn = e.target.closest("#mobileNavbarProfileBtn");
            const dropdown = document.getElementById("txProfileDropdown");
            const mobileMenu = document.getElementById("mobileMenu");

            if (desktopBtn) {
                e.preventDefault();
                e.stopPropagation();
                if (!dropdown) return;

                const isHidden = dropdown.classList.contains("hidden");
                const desktopWrapper = document.getElementById("txDesktopProfileWrapper");
                if (desktopWrapper && dropdown.parentElement !== desktopWrapper) {
                    desktopWrapper.appendChild(dropdown);
                }
                const baseClass = "absolute left-1/2 -translate-x-1/2 top-full mt-3.5 w-80 max-w-[calc(100vw-32px)] bg-[#0c101d] border border-slate-800/80 rounded-3xl p-5 shadow-2xl z-[9999] text-slate-200";
                dropdown.className = isHidden ? baseClass : baseClass + " hidden";
                return;
            }

            if (mobBtn) {
                e.preventDefault();
                e.stopPropagation();
                if (!dropdown) return;

                const isHidden = dropdown.classList.contains("hidden");
                if (dropdown.parentElement !== document.body) {
                    document.body.appendChild(dropdown);
                }
                const baseClass = "fixed top-[76px] right-[12px] w-[calc(100vw-24px)] max-w-[340px] max-h-[calc(100vh-90px)] overflow-y-auto bg-[#0c101d] border border-cyan-400/20 rounded-3xl p-5 shadow-2xl z-[9999999] text-slate-200";
                dropdown.className = isHidden ? baseClass : baseClass + " hidden";

                if (isHidden && mobileMenu && !mobileMenu.classList.contains("hidden")) {
                    mobileMenu.classList.add("hidden");
                    document.documentElement.classList.remove("tx-mobile-menu-open");
                    document.body.classList.remove("tx-mobile-menu-open");
                }
                return;
            }

            if (dropdown && !dropdown.classList.contains("hidden")) {
                const copyBtn = e.target.closest("#txCopyIdBtn");

                if (copyBtn) {
                    return;
                }

                if (dropdown.contains(e.target)) {
                    const itemLink = e.target.closest("a, button, [data-route], [data-navbar-logout]");
                    if (itemLink) {
                        dropdown.classList.add("hidden");

                        if (itemLink.hasAttribute("data-navbar-logout")) {
                            return;
                        }

                        const route = itemLink.getAttribute("data-route") || itemLink.getAttribute("href");
                        if (route && route !== "#") {
                            e.preventDefault();
                            e.stopPropagation();
                            navigateToProfileRoute(route);
                        }
                    }
                } else {
                    dropdown.classList.add("hidden");
                }
            }
        });
    }

    if (copyBtn && user.client_id) {
        copyBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            navigator.clipboard.writeText(user.client_id).then(() => {
                if (copyFeedback) {
                    copyFeedback.classList.remove("hidden");
                    setTimeout(() => {
                        copyFeedback.classList.add("hidden");
                    }, 2000);
                }
            }).catch(err => {
                console.error("Failed to copy ID: ", err);
            });
        });
    }

    if (createSubLink) {
        createSubLink.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (dropdown) dropdown.classList.add("hidden");
            if (window.location.pathname.includes("wallet.html") && typeof window.txOpenSubAccountCreationModal === "function") {
                window.txOpenSubAccountCreationModal("real");
            } else if (typeof window.txOpenSubAccountCreationModal === "function") {
                window.txOpenSubAccountCreationModal("real");
            } else {
                window.navigateToProfileRoute("src/pages/wallet.html#sub-accounts");
            }
        });
    }
}

window.navigateToProfileRoute = function (route) {
    if (!route || route === "#") return;
    
    let path = route;
    let hash = "";
    if (route.includes("#")) {
        const parts = route.split("#");
        path = parts[0];
        hash = "#" + parts[1];
    }

    const currentPath = window.location.pathname.replace(/\\/g, "/");
    const isPages = currentPath.includes("/src/pages/");
    const isWallet = currentPath.includes("wallet");

    if (isWallet && hash) {
        window.location.hash = hash.substring(1);
        if (typeof window.txHandleRouteTab === "function") {
            window.txHandleRouteTab();
        }
        return;
    }
    
    let targetUrl = "";
    if (path.startsWith("http://") || path.startsWith("https://")) {
        targetUrl = route;
    } else {
        const cleanRoute = path.startsWith("/") ? path.substring(1) : path;
        const pageFileName = cleanRoute.substring(cleanRoute.lastIndexOf("/") + 1);
        
        if (typeof resolveAppPath === "function") {
            targetUrl = resolveAppPath(cleanRoute) + hash;
        } else if (isPages) {
            targetUrl = "./" + pageFileName + hash;
        } else {
            targetUrl = "./" + cleanRoute + hash;
        }
    }
    
    window.location.href = targetUrl;
};
function navigateToProfileRoute(route) {
    return window.navigateToProfileRoute(route);
}

window.openNavbarCreateSubModal = function () {
    if (window.location.pathname.includes("wallet.html") && typeof window.txOpenSubAccountCreationModal === "function") {
        window.txOpenSubAccountCreationModal("real");
        return;
    }
    if (typeof window.txOpenSubAccountCreationModal === "function") {
        window.txOpenSubAccountCreationModal("real");
        return;
    }
    window.navigateToProfileRoute("src/pages/wallet.html#sub-accounts");
};
function openNavbarCreateSubModal() {
    return window.openNavbarCreateSubModal();
}

window.toggleSiteTheme = function() {
    const currentTheme = localStorage.getItem("traidiumx_theme") === "light" ? "light" : "dark";
    const newTheme = currentTheme === "light" ? "dark" : "light";
    localStorage.setItem("traidiumx_theme", newTheme);
    window.applySiteTheme(newTheme);
};

window.applySiteTheme = function(theme) {
    const activeTheme = theme || localStorage.getItem("traidiumx_theme") || "dark";
    if (activeTheme === "light") {
        document.documentElement.classList.add("light");
        document.documentElement.classList.remove("dark");
    } else {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
    }
    if (typeof updateMobileThemeToggleUI === "function") {
        updateMobileThemeToggleUI();
    }
    if (typeof updateThemeToggleUI === "function") {
        updateThemeToggleUI(activeTheme);
    }
    window.updateDesktopThemeToggleIcon(activeTheme);
    if (typeof window.updateDropdownThemeUI === "function") {
        window.updateDropdownThemeUI();
    }
    if (typeof window.loadTradingViewChart === "function") {
        try {
            window.loadTradingViewChart();
        } catch (err) {}
    }
    const themeSelector = document.getElementById("themeSelector");
    if (themeSelector) {
        themeSelector.value = activeTheme.charAt(0).toUpperCase() + activeTheme.slice(1);
    }
};

window.updateDesktopThemeToggleIcon = function(theme) {
    const themeBtn = document.getElementById("txThemeToggleBtn");
    if (!themeBtn) return;
    const isLight = (theme || localStorage.getItem("traidiumx_theme")) === "light";
    if (isLight) {
        themeBtn.innerHTML = `
            <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
        `;
        themeBtn.title = "Switch to Dark Mode";
    } else {
        themeBtn.innerHTML = `
            <svg class="w-5 h-5 text-cyan-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
        `;
        themeBtn.title = "Switch to Light Mode";
    }
};

window.setThemeMode = function(mode) {
    localStorage.setItem("traidiumx_theme_mode", mode);
    let resolvedTheme = "dark";
    if (mode === "auto") {
        resolvedTheme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    } else {
        resolvedTheme = mode;
    }
    localStorage.setItem("traidiumx_theme", resolvedTheme);
    window.applySiteTheme(resolvedTheme);
    if (typeof window.updateDropdownThemeUI === "function") {
        window.updateDropdownThemeUI(mode);
    }
};

window.updateDropdownThemeUI = function(mode) {
    const currentMode = mode || localStorage.getItem("traidiumx_theme_mode") || (localStorage.getItem("traidiumx_theme") === "light" ? "light" : "dark");
    document.querySelectorAll("#txDropdownThemeGroup [data-theme-mode]").forEach(btn => {
        const btnMode = btn.getAttribute("data-theme-mode");
        if (btnMode === currentMode) {
            btn.className = "tx-theme-mode-btn p-1 px-1.5 rounded-lg bg-white text-slate-950 font-black shadow-sm transition cursor-pointer";
        } else {
            btn.className = "tx-theme-mode-btn p-1 px-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer";
        }
    });
};

// Global Delegation for Dropdown 3-Mode Theme Button clicks
document.addEventListener("click", function(e) {
    const modeBtn = e.target.closest("[data-theme-mode]");
    if (modeBtn) {
        e.preventDefault();
        e.stopPropagation();
        const mode = modeBtn.getAttribute("data-theme-mode");
        if (typeof window.setThemeMode === "function") {
            window.setThemeMode(mode);
        }
    }
});

// Global Delegation for Desktop Theme Toggle Button click
document.addEventListener("click", function(e) {
    const themeBtn = e.target.closest("#txThemeToggleBtn");
    if (themeBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.toggleSiteTheme === "function") {
            window.toggleSiteTheme();
        }
    }
});

// Apply theme instantly on script parse to prevent flash of light/dark mode
window.applySiteTheme(localStorage.getItem("traidiumx_theme") || "dark");

// Google Translate Integration
function initGlobalTranslation() {
    const savedLang = localStorage.getItem("tx_language") || "English";
    let langCode = "en";
    if (savedLang === "Gujarati") langCode = "gu";
    else if (savedLang === "Hindi") langCode = "hi";

    setGoogleTranslateCookie(langCode);

    if (langCode !== "en") {
        // Apply class and style immediately to prevent untranslated content flicker (FOUTC)
        document.documentElement.classList.add("tx-translating");
        if (!document.getElementById("tx-translation-flicker-prevention")) {
            const style = document.createElement("style");
            style.id = "tx-translation-flicker-prevention";
            style.textContent = `
                html.tx-translating body {
                    opacity: 0 !important;
                    visibility: hidden !important;
                }
                html.translated-ltr body, html.translated-rtl body {
                    opacity: 1 !important;
                    visibility: visible !important;
                    transition: opacity 0.15s ease;
                }
            `;
            document.head.appendChild(style);
        }

        // Fallback: Show body after 850ms in case translation fails or delays
        setTimeout(() => {
            document.documentElement.classList.remove("tx-translating");
        }, 850);

        // Load the translation elements on DOM ready
        const setupTranslateElement = () => {
            let gtDiv = document.getElementById("google_translate_element");
            if (!gtDiv) {
                gtDiv = document.createElement("div");
                gtDiv.id = "google_translate_element";
                gtDiv.style.display = "none";
                document.body.appendChild(gtDiv);
            }

            if (!document.getElementById("google-translate-script")) {
                const script = document.createElement("script");
                script.id = "google-translate-script";
                script.type = "text/javascript";
                script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
                document.body.appendChild(script);

                window.googleTranslateElementInit = function () {
                    new google.translate.TranslateElement({
                        pageLanguage: 'en',
                        includedLanguages: 'en,gu,hi',
                        autoDisplay: true
                    }, 'google_translate_element');
                };
            }
        };

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", setupTranslateElement);
        } else {
            setupTranslateElement();
        }
    }
}

function setGoogleTranslateCookie(langCode) {
    const domain = window.location.hostname;
    if (langCode === "en") {
        document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        if (domain !== "localhost" && domain !== "127.0.0.1") {
            document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=." + domain + ";";
            document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=" + domain + ";";
        }
    } else {
        document.cookie = `googtrans=/en/${langCode}; path=/;`;
        if (domain !== "localhost" && domain !== "127.0.0.1") {
            document.cookie = `googtrans=/en/${langCode}; path=/; domain=.${domain};`;
            document.cookie = `googtrans=/en/${langCode}; path=/; domain=${domain};`;
        }
    }
}

// Run translation check on load (runs immediately on script parse for early style injection)
initGlobalTranslation();


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
        "/portfolio"
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
    script.src = "/src/js/trading-onboarding.js?v=1";
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
        <button id="txThemeToggleBtn" type="button" class="w-10 h-10 flex items-center justify-center border border-slate-800 rounded-xl bg-slate-950/60 text-slate-400 hover:text-white transition cursor-pointer mr-1" title="Toggle Theme">
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
        </button>

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
    const shouldHideToggle = currentPath.endsWith("/index.html") || currentPath.endsWith("/markets.html") || currentPath.endsWith("/");

    container.innerHTML = `
        <div class="flex items-center gap-3 relative z-10">
            <!-- Currency Switcher -->
            <div class="tx-currency-toggle-wrapper flex items-center justify-center p-1 bg-slate-950/80 border border-slate-800 rounded-xl select-none shadow-inner shadow-black/40 mr-1" ${shouldHideToggle ? 'style="display: none !important;"' : ''}>
                <button type="button" class="flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[68px] cursor-pointer" data-currency="INR">
                    ₹ INR
                </button>
                <button type="button" class="flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 min-w-[68px] cursor-pointer" data-currency="USDT">
                    $ USD
                </button>
            </div>

            <!-- Theme Toggle -->
            <button id="txThemeToggleBtn" type="button" class="w-10 h-10 flex items-center justify-center border border-slate-800 rounded-xl bg-slate-950/60 text-slate-400 hover:text-white transition cursor-pointer" title="Toggle Theme">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
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
            </button>

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

    container.innerHTML = `
        <div id="txProfileDropdown" class="hidden absolute left-1/2 -translate-x-1/2 top-full mt-3.5 w-80 max-w-[calc(100vw-32px)] bg-[#0c101d] border border-slate-800/80 rounded-3xl p-5 shadow-2xl z-[9999] text-slate-200">
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
                        <a href="${resolveRoute('src/pages/profile.html#sub-accounts')}" id="txNavbarCreateSubAccountLink" data-route="src/pages/profile.html#sub-accounts" class="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#10b981] hover:text-[#059669] transition cursor-pointer">
                            <span class="text-sm font-black">+</span>
                            <span>Create an Account</span>
                        </a>
                    </div>

                    <!-- Options -->
                    <div class="space-y-1">
                        <!-- Assets Accordion -->
                        <div>
                            <button type="button" id="txAssetsToggle" class="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold focus:outline-none cursor-pointer">
                                <div class="flex items-center gap-3">
                                    <svg class="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2.5"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                                    <span class="whitespace-nowrap">Assets</span>
                                </div>
                                <svg id="txAssetsArrow" class="w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform duration-200" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
                            </button>
                            <div id="txAssetsSubMenu" class="tx-assets-submenu">
                                <div class="tx-assets-submenu-inner space-y-0.5 pl-4 pr-1">
                                    <a href="${resolveRoute('src/pages/wallet.html#overview')}" data-route="src/pages/wallet.html#overview" class="group flex items-center gap-3 px-2.5 py-1.5 rounded-lg hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                                        <svg class="w-4 h-4 shrink-0 text-slate-400 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>
                                        <span class="whitespace-nowrap">Overview</span>
                                    </a>
                                    <a href="${resolveRoute('src/pages/wallet.html#deposit')}" data-route="src/pages/wallet.html#deposit" class="group flex items-center gap-3 px-2.5 py-1.5 rounded-lg hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                                        <svg class="w-4 h-4 shrink-0 text-slate-400 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 4v12m0 0l-4-4m4 4l4-4"/></svg>
                                        <span class="whitespace-nowrap">Deposit</span>
                                    </a>
                                    <a href="${resolveRoute('src/pages/wallet.html#withdraw')}" data-route="src/pages/wallet.html#withdraw" class="group flex items-center gap-3 px-2.5 py-1.5 rounded-lg hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                                        <svg class="w-4 h-4 shrink-0 text-slate-400 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20V8m0 0l-4 4m4-4l4 4"/></svg>
                                        <span class="whitespace-nowrap">Withdraw</span>
                                    </a>
                                    <a href="${resolveRoute('src/pages/wallet.html#transfer')}" data-route="src/pages/wallet.html#transfer" class="group flex items-center gap-3 px-2.5 py-1.5 rounded-lg hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                                        <svg class="w-4 h-4 shrink-0 text-slate-400 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M7 17L17 7M17 7H9M17 7V15"/></svg>
                                        <span class="whitespace-nowrap">Transfer</span>
                                    </a>
                                    <a href="${resolveRoute('src/pages/wallet.html#exchange')}" data-route="src/pages/wallet.html#exchange" class="group flex items-center gap-3 px-2.5 py-1.5 rounded-lg hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                                        <svg class="w-4 h-4 shrink-0 text-slate-400 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 17h16M16 13l4 4-4 4M20 7H4M8 11L4 7l4-4"/></svg>
                                        <span class="whitespace-nowrap">Exchange</span>
                                    </a>
                                    <a href="${resolveRoute('src/pages/wallet.html#history')}" data-route="src/pages/wallet.html#history" class="group flex items-center gap-3 px-2.5 py-1.5 rounded-lg hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                                        <svg class="w-4 h-4 shrink-0 text-slate-400 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
                                        <span class="whitespace-nowrap">History</span>
                                    </a>
                                </div>
                            </div>
                        </div>

                        <a href="${resolveRoute('src/pages/orders.html')}" data-route="src/pages/orders.html" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                            <svg class="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1.5"/></svg>
                            <span class="whitespace-nowrap">Orders & History</span>
                        </a>

                        <a href="${resolveRoute('src/pages/profile.html')}" data-route="src/pages/profile.html" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                            <svg class="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            <span class="whitespace-nowrap">Account Details</span>
                        </a>

                        <a href="${resolveRoute('src/pages/settings.html')}" data-route="src/pages/settings.html" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                            <svg class="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06-.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                            <span class="whitespace-nowrap">Settings</span>
                        </a>

                        <a href="${resolveRoute('src/pages/contact.html')}" data-route="src/pages/contact.html" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-900/60 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer">
                            <svg class="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="9"/>
                                <circle cx="12" cy="12" r="4"/>
                                <path d="M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24"/>
                            </svg>
                            <span class="whitespace-nowrap">Support</span>
                        </a>

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
    const shouldHideToggle = currentPath.endsWith("/index.html") || currentPath.endsWith("/markets.html") || currentPath.endsWith("/");

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
    const profileBtn = document.getElementById("txNavbarProfileBtn");
    const dropdown = document.getElementById("txProfileDropdown");
    const themeBtn = document.getElementById("txThemeToggleBtn");
    const copyBtn = document.getElementById("txCopyIdBtn");
    const copyFeedback = document.getElementById("txCopyFeedback");
    const createSubLink = document.getElementById("txNavbarCreateSubAccountLink");

    // Assets toggle & sub-menu click handlers
    const assetsToggle = document.getElementById("txAssetsToggle");
    const assetsSubMenu = document.getElementById("txAssetsSubMenu");
    const assetsArrow = document.getElementById("txAssetsArrow");
    if (assetsToggle && assetsSubMenu) {
        assetsToggle.addEventListener("click", function (e) {
            e.stopPropagation();
            const isOpen = assetsSubMenu.classList.contains("is-open");
            if (isOpen) {
                assetsSubMenu.classList.remove("is-open");
                if (assetsArrow) {
                    assetsArrow.style.transform = "rotate(0deg)";
                }
            } else {
                assetsSubMenu.classList.add("is-open");
                if (assetsArrow) {
                    assetsArrow.style.transform = "rotate(180deg)";
                }
            }
        });

        assetsSubMenu.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (dropdown) dropdown.classList.add("hidden");
                
                const href = this.getAttribute("href") || "";
                const hashIndex = href.indexOf("#");
                const action = hashIndex !== -1 ? href.substring(hashIndex + 1).toLowerCase() : "overview";

                try {
                    sessionStorage.setItem("traidiumx_wallet_focus_action", action);
                } catch (err) {}

                const currentPath = window.location.pathname.toLowerCase();
                const isWalletPage = currentPath.includes("wallet") || (typeof window.focusWalletSectionFromNavigation === "function") || (typeof window.openWalletActionModal === "function");

                if (isWalletPage) {
                    if (window.location.hash !== "#" + action) {
                        try {
                            history.pushState(null, "", href);
                        } catch (err) {
                            window.location.hash = "#" + action;
                        }
                    }
                    if (typeof window.focusWalletSectionFromNavigation === "function") {
                        window.focusWalletSectionFromNavigation();
                    } else if (typeof window.openWalletActionModal === "function") {
                        if (["deposit", "withdraw", "transfer", "exchange"].includes(action)) {
                            window.openWalletActionModal(action);
                        }
                    }
                } else {
                    window.location.href = href;
                }
            });
        });
    }

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
                const assetsToggle = e.target.closest("#txAssetsToggle");
                const copyBtn = e.target.closest("#txCopyIdBtn");

                if (assetsToggle || copyBtn) {
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

function navigateToProfileRoute(route) {
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
    
    let targetUrl = "";
    if (path.startsWith("http://") || path.startsWith("https://")) {
        targetUrl = route;
    } else {
        const cleanRoute = path.startsWith("/") ? path.substring(1) : path;
        const pageFileName = cleanRoute.substring(cleanRoute.lastIndexOf("/") + 1);
        
        if (isPages) {
            targetUrl = "./" + pageFileName + hash;
        } else {
            targetUrl = "./" + cleanRoute + hash;
        }
    }
    
    window.location.href = targetUrl;
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
            openNavbarCreateSubModal();
        });
    }
}

function openNavbarCreateSubModal() {
    let container = document.getElementById("txNavbarModalContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "txNavbarModalContainer";
        document.body.appendChild(container);
    }

    container.innerHTML = `
        <div class="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md" id="txCreateSubBackdrop" style="animation: txModalFade 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
            <div class="bg-[#0f172a] border border-slate-800/80 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl" onclick="event.stopPropagation()">
                <!-- Header -->
                <div class="flex items-center justify-between border-b border-slate-800/60 p-4">
                    <h3 class="font-extrabold text-sm text-white">Create a Sub Account</h3>
                    <button type="button" class="text-slate-400 hover:text-white font-bold text-lg cursor-pointer focus:outline-none" id="txCreateSubCloseBtn">✕</button>
                </div>
                <!-- Body -->
                <form id="txCreateSubForm" class="space-y-4 p-5">
                    <div>
                        <label class="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Account Name</label>
                        <input type="text" id="txNewSubNameInput" placeholder="e.g. Trading Account 2" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400" required />
                        <p id="txCreateSubMessage" class="text-[11px] font-bold mt-2 text-slate-400 hidden"></p>
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button type="button" class="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer" id="txCreateSubCancelBtn">Cancel</button>
                        <button type="submit" class="flex-1 bg-[#10b981] hover:bg-[#059669] text-slate-950 font-black py-2.5 rounded-xl text-xs transition cursor-pointer">Create</button>
                    </div>
                </form>
            </div>
        </div>
        <style>
            @keyframes txModalFade {
                from { opacity: 0; transform: scale(0.96); }
                to { opacity: 1; transform: scale(1); }
            }
        </style>
    `;

    const closeBtn = document.getElementById("txCreateSubCloseBtn");
    const cancelBtn = document.getElementById("txCreateSubCancelBtn");
    const backdrop = document.getElementById("txCreateSubBackdrop");
    const form = document.getElementById("txCreateSubForm");

    const close = () => {
        container.innerHTML = "";
    };

    closeBtn?.addEventListener("click", close);
    cancelBtn?.addEventListener("click", close);
    backdrop?.addEventListener("click", close);

    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("txNewSubNameInput");
        const msg = document.getElementById("txCreateSubMessage");
        if (!input || !msg) return;

        msg.classList.remove("hidden", "text-red-400", "text-emerald-400");
        msg.className = "text-[11px] font-bold mt-2 text-slate-400";
        msg.textContent = "Creating sub account...";

        try {
            if (typeof apiRequest !== "function") {
                throw new Error("API module not loaded.");
            }
            await apiRequest("/user/sub-accounts", {
                method: "POST",
                body: JSON.stringify({ name: input.value.trim() })
            });
            msg.className = "text-[11px] font-bold mt-2 text-emerald-400";
            msg.textContent = "Sub account created successfully!";
            
            setTimeout(() => {
                close();
                window.location.reload();
            }, 1000);
        } catch (err) {
            msg.className = "text-[11px] font-bold mt-2 text-red-400";
            msg.textContent = err.message || "Failed to create sub account.";
        }
    });
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


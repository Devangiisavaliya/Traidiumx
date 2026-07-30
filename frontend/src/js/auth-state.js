(function protectPrivatePages() {
    const protectedPages = [
        "/futures.html",
        "/options.html",
        "/wallet.html",
        "/refer-earn.html",
        "/profile.html",
        "/dashboard.html",
        "/orders.html"
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


function applyNavbarAuthState() {
    const desktopAuthArea = document.getElementById("desktopAuthArea");
    const mobileAuthArea = document.getElementById("mobileAuthArea");
    const mobileHeaderNoticeRoot = document.getElementById("mobileHeaderNotificationRoot");

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

    if (loggedIn && user) {
        renderLoggedInDesktop(desktopAuthArea, user);
        renderLoggedInMobile(mobileAuthArea, user);
        initNavbarCurrencyToggle();
    } else {
        renderLoggedOutDesktop(desktopAuthArea);
        renderLoggedOutMobile(mobileAuthArea);
    }

    bindNavbarLogoutButtons();
    if (typeof applyRegisterStepLinkAuthState === "function") {
        applyRegisterStepLinkAuthState();
    }
}


function renderLoggedOutDesktop(container) {
    if (!container) {
        return;
    }

    container.innerHTML = `
        <a
            href="/src/pages/login.html"
            class="inline-flex items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/[0.06] px-5 py-3 text-sm font-black text-cyan-200 transition hover:bg-cyan-400/15 hover:text-cyan-100"
        >
            Login
        </a>

        <a href="/src/pages/register.html" class="tx-pill-trade-btn">
            <span>TRADE NOW</span>
            <span class="tx-pill-arrow">→</span>
        </a>
    `;
}


function renderLoggedOutMobile(container) {
    if (!container) {
        return;
    }

    container.innerHTML = `
        <a
            href="/src/pages/login.html"
            class="flex w-full items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/[0.06] px-5 py-3 text-sm font-black text-cyan-200 transition hover:bg-cyan-400/15 hover:text-cyan-100"
        >
            Login
        </a>

        <a href="/src/pages/register.html" class="tx-pill-mobile-trade">
            TRADE NOW →
        </a>
    `;
}


function renderLoggedInDesktop(container, user) {
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

    container.innerHTML = `
        <a
            href="/src/pages/profile.html"
            title="Open account details"
            class="hidden items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-4 py-2 text-sm font-black text-cyan-200 transition hover:border-cyan-300/60 hover:bg-cyan-400/15 hover:text-cyan-100 xl:flex"
        >
            <span class="h-2 w-2 rounded-full bg-emerald-400"></span>
            <span>${userName}</span>
        </a>

        <div class="tx-currency-toggle-wrapper flex items-center justify-center p-1 bg-slate-950/80 border border-slate-800 rounded-xl select-none mr-3 shadow-inner shadow-black/40">
            <button type="button" class="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-bold transition-all duration-300 min-w-[72px]" data-currency="INR">
                <span class="text-[10px]">₹</span> INR
            </button>
            <button type="button" class="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-bold transition-all duration-300 min-w-[72px]" data-currency="USDT">
                <span class="text-[10px]">$</span> USD
            </button>
        </div>

        <div class="tx-navbar-notification-root" data-notification-root>
            <button
                type="button"
                class="tx-navbar-notification-btn"
                data-notification-toggle
                aria-label="Open notifications"
                aria-expanded="false"
            >
                <span class="tx-navbar-notification-icon-wrap" aria-hidden="true">
                    <svg class="tx-navbar-notification-icon" viewBox="0 0 24 24" focusable="false">
                        <path d="M12 3.6a5.4 5.4 0 0 0-5.4 5.4v2.55c0 .92-.31 1.8-.88 2.52l-.72.9a1.05 1.05 0 0 0 .82 1.7h12.36a1.05 1.05 0 0 0 .82-1.7l-.72-.9a4.02 4.02 0 0 1-.88-2.52V9A5.4 5.4 0 0 0 12 3.6Z" />
                        <path d="M9.65 18.25a2.55 2.55 0 0 0 4.7 0" />
                    </svg>
                </span>
                <span class="tx-navbar-notification-badge hidden" data-notification-badge>0</span>
            </button>
        </div>

        <button
            type="button"
            data-navbar-logout="true"
            class="rounded-full border border-red-400/30 bg-red-500/10 px-5 py-3 text-sm font-black text-red-300 transition hover:bg-red-500/20"
        >
            Logout
        </button>
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

    container.innerHTML = `
        <a href="/src/pages/profile.html" class="tx-mobile-auth-profile" title="Open account details">
            <span class="min-w-0">
                <strong>${userName}</strong>
                <span>View account details</span>
            </span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6l6 6-6 6"></path>
            </svg>
        </a>

        <div class="flex justify-between items-center my-3 px-1">
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Display Currency</span>
            <div class="tx-currency-toggle-wrapper flex items-center justify-center p-1 bg-slate-950/80 border border-slate-800 rounded-xl select-none shadow-inner shadow-black/40">
                <button type="button" class="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-bold transition-all duration-300 min-w-[72px]" data-currency="INR">
                    <span class="text-[10px]">₹</span> INR
                </button>
                <button type="button" class="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-bold transition-all duration-300 min-w-[72px]" data-currency="USDT">
                    <span class="text-[10px]">$</span> USD
                </button>
            </div>
        </div>

        <div class="tx-mobile-auth-actions">
            <div class="tx-navbar-notification-root tx-navbar-notification-root-mobile" data-notification-root>
                <button
                    type="button"
                    class="tx-navbar-notification-btn tx-navbar-notification-btn-mobile"
                    data-notification-toggle
                    aria-label="Open notifications"
                    aria-expanded="false"
                >
                    <span class="tx-navbar-notification-icon-wrap" aria-hidden="true">
                        <svg class="tx-navbar-notification-icon" viewBox="0 0 24 24" focusable="false">
                            <path d="M12 3.6a5.4 5.4 0 0 0-5.4 5.4v2.55c0 .92-.31 1.8-.88 2.52l-.72.9a1.05 1.05 0 0 0 .82 1.7h12.36a1.05 1.05 0 0 0 .82-1.7l-.72-.9a4.02 4.02 0 0 1-.88-2.52V9A5.4 5.4 0 0 0 12 3.6Z" />
                            <path d="M9.65 18.25a2.55 2.55 0 0 0 4.7 0" />
                        </svg>
                    </span>
                    <span class="tx-navbar-notification-label">Notifications</span>
                    <span class="tx-navbar-notification-badge hidden" data-notification-badge>0</span>
                </button>
            </div>

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
            .tx-navbar-notification-item{--notice-color:#22d3ee;--notice-soft:rgba(34,211,238,.07);--notice-border:rgba(34,211,238,.22);--notice-text:#a5f3fc;position:relative;display:grid;grid-template-columns:10px 1fr;gap:10px;border-radius:18px;border:1px solid transparent;border-left:3px solid var(--notice-border);padding:12px 11px;transition:background .16s ease,border-color .16s ease;}
            .tx-navbar-notification-item.info{--notice-color:#22d3ee;--notice-soft:rgba(34,211,238,.07);--notice-border:rgba(34,211,238,.24);--notice-text:#a5f3fc;}
            .tx-navbar-notification-item.success{--notice-color:#34d399;--notice-soft:rgba(52,211,153,.08);--notice-border:rgba(52,211,153,.28);--notice-text:#bbf7d0;}
            .tx-navbar-notification-item.warning{--notice-color:#fbbf24;--notice-soft:rgba(251,191,36,.08);--notice-border:rgba(251,191,36,.30);--notice-text:#fef3c7;}
            .tx-navbar-notification-item.alert,.tx-navbar-notification-item.danger,.tx-navbar-notification-item.error{--notice-color:#fb7185;--notice-soft:rgba(251,113,133,.08);--notice-border:rgba(251,113,133,.32);--notice-text:#ffe4e6;}
            .tx-navbar-notification-item:hover{border-color:var(--notice-border);background:var(--notice-soft);}
            .tx-navbar-notification-item.is-unread{border-color:var(--notice-border);background:linear-gradient(135deg,var(--notice-soft),rgba(255,255,255,.025));}
            .tx-navbar-notification-dot{margin-top:6px;width:8px;height:8px;border-radius:999px;background:var(--notice-color);box-shadow:0 0 16px color-mix(in srgb,var(--notice-color) 55%,transparent);opacity:.72;}
            .tx-navbar-notification-item.is-unread .tx-navbar-notification-dot{opacity:1;box-shadow:0 0 18px color-mix(in srgb,var(--notice-color) 66%,transparent);}
            .tx-navbar-notification-meta{display:flex;align-items:center;gap:8px;color:#94a3b8;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;flex-wrap:wrap;}
            .tx-navbar-notification-meta span:last-child{margin-left:auto;}
            .tx-navbar-notification-severity-badge{display:inline-flex;align-items:center;border:1px solid var(--notice-border);background:var(--notice-soft);color:var(--notice-text);border-radius:999px;padding:4px 8px;font-size:9px;font-weight:950;letter-spacing:.10em;line-height:1;}
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
            @media(max-width:1023px){.tx-navbar-notification-list{max-height:calc(100vh - 260px);}.tx-navbar-notification-badge{right:calc(50% - 75px);top:7px;}}
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
            btn.className = "flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-black transition-all duration-300 bg-emerald-500 text-slate-950 shadow-[0_4px_15px_rgba(16,185,129,0.3)] scale-[1.03] min-w-[72px]";
        } else {
            btn.className = "flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-bold transition-all duration-300 bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 min-w-[72px]";
        }
    });
}

"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Component Loader
|--------------------------------------------------------------------------
| Loads navbar/footer components.
| Fixes routes automatically for index.html and src/pages/*.html.
| Highlights current page in desktop + mobile navbar.
|--------------------------------------------------------------------------
*/

function isInsidePagesFolder() {
    return window.location.pathname.replace(/\\/g, "/").includes("/src/pages/");
}

function getBasePath() {
    return isInsidePagesFolder() ? "../../" : "./";
}

function resolveAppPath(route) {
    return getBasePath() + route;
}

async function loadComponent(target) {
    const componentName = target.getAttribute("data-component");

    if (!componentName) {
        return;
    }

    const componentUrl = resolveAppPath(`src/components/${componentName}.html?v=` + new Date().getTime());

    try {
        const response = await fetch(componentUrl);

        if (!response.ok) {
            throw new Error(`Failed to load ${componentUrl}. Status: ${response.status}`);
        }

        const html = await response.text();
        target.innerHTML = html;

        // Execute any script tags nested in the loaded component html
        const scripts = target.querySelectorAll("script");
        scripts.forEach((oldScript) => {
            const newScript = document.createElement("script");
            Array.from(oldScript.attributes).forEach((attr) => {
                newScript.setAttribute(attr.name, attr.value);
            });
            newScript.appendChild(document.createTextNode(oldScript.innerHTML));
            oldScript.parentNode.replaceChild(newScript, oldScript);
        });
    } catch (error) {
        console.error(error);

        target.innerHTML = `
            <div style="padding:16px;background:#991b1b;color:white;font-family:Arial;">
                Failed to load ${componentName} component.<br>
                Check path: ${componentUrl}<br>
                Run using Live Server / http://localhost:5500
            </div>
        `;
    }
}

function applyDynamicRoutes() {
    const links = document.querySelectorAll("[data-route]");

    links.forEach((link) => {
        const route = link.getAttribute("data-route");

        if (!route) {
            return;
        }

        link.setAttribute("href", resolveAppPath(route));
    });
}

function setActiveNavLink() {
    const currentPage = document.body.getAttribute("data-page");

    if (!currentPage) {
        return;
    }

    const activeLinks = document.querySelectorAll(`[data-page-link="${currentPage}"]`);

    activeLinks.forEach((link) => {
        link.classList.add("active");

        if (link.classList.contains("tx-mobile-link")) {
            link.classList.add("active");
        }
    });
}

function initMobileMenu() {
    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const mobileMenuIcon = document.getElementById("mobileMenuIcon");
    const mobileMenu = document.getElementById("mobileMenu");
    const mobileNavbar = document.querySelector(".tx-pill-navbar");

    if (!mobileMenuBtn || !mobileMenu) {
        return;
    }

    function syncMobileMenuPosition() {
        if (!mobileNavbar) return;
        const rect = mobileNavbar.getBoundingClientRect();
        mobileMenu.style.setProperty("--tx-mobile-menu-top", `${Math.ceil(rect.bottom + 8)}px`);
    }

    function setMenuOpen(open) {
        mobileMenu.classList.toggle("hidden", !open);
        mobileMenuBtn.setAttribute("aria-expanded", String(open));
        mobileMenuBtn.setAttribute("aria-label", open ? "Close mobile menu" : "Open mobile menu");

        if (mobileMenuIcon) {
            mobileMenuIcon.textContent = open ? "×" : "☰";
        }

        document.documentElement.classList.toggle("tx-mobile-menu-open", open);
        document.body.classList.toggle("tx-mobile-menu-open", open);

        if (open) {
            syncMobileMenuPosition();
            mobileMenu.scrollTop = 0;
        }
    }

    mobileMenuBtn.addEventListener("click", () => {
        const dropdown = document.getElementById("txProfileDropdown");
        if (dropdown) dropdown.classList.add("hidden");
        setMenuOpen(mobileMenu.classList.contains("hidden"));
    });

    mobileMenu.addEventListener("click", (event) => {
        if (event.target.closest("a")) {
            setMenuOpen(false);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !mobileMenu.classList.contains("hidden")) {
            setMenuOpen(false);
            mobileMenuBtn.focus();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth >= 1024) {
            setMenuOpen(false);
            return;
        }

        if (!mobileMenu.classList.contains("hidden")) {
            syncMobileMenuPosition();
        }
    }, { passive: true });

    window.visualViewport?.addEventListener("resize", () => {
        if (!mobileMenu.classList.contains("hidden")) {
            syncMobileMenuPosition();
        }
    }, { passive: true });
}

async function initComponents() {
    const componentTargets = document.querySelectorAll("[data-component]");

    for (const target of componentTargets) {
        await loadComponent(target);
    }

    applyDynamicRoutes();
    setActiveNavLink();
    initMobileMenu();

    window.__txComponentsLoaded = true;
    document.dispatchEvent(new CustomEvent("componentsLoaded"));
}

function runWhenDocumentReady(callback) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", callback, { once: true });
        return;
    }

    callback();
}

runWhenDocumentReady(initComponents);
/*
|--------------------------------------------------------------------------
| User Side Maintenance Popup Guard
|--------------------------------------------------------------------------
| When admin turns maintenance mode ON, every user-side page access shows a
| professional popup. If user closes it with the cross sign, the next click or
| submit attempt opens it again. Admin pages are not affected.
|--------------------------------------------------------------------------
*/
(function () {
    const DEFAULT_MESSAGE = "TraidiumX is under maintenance. Please try again later.";
    const CHECK_INTERVAL_MS = 20000;
    let maintenanceState = {
        active: false,
        message: DEFAULT_MESSAGE,
        loaded: false,
    };
    let checkTimer = null;

    function getApiBaseUrl() {
        const { protocol, hostname, port, origin } = window.location;
        const isLocalHost = hostname === "127.0.0.1" || hostname === "localhost";

        if (isLocalHost && port && port !== "5000") {
            return `${protocol}//${hostname}:5000/api`;
        }

        return `${origin}/api`;
    }

    function escapeMaintenanceHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function injectMaintenanceStyles() {
        if (document.getElementById("txMaintenancePopupStyles")) return;

        const style = document.createElement("style");
        style.id = "txMaintenancePopupStyles";
        style.textContent = `
            .tx-maintenance-overlay {
                position: fixed;
                inset: 0;
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 18px;
                background: rgba(2, 6, 23, 0.76);
                backdrop-filter: blur(14px);
            }

            .tx-maintenance-card {
                position: relative;
                width: min(560px, 100%);
                overflow: hidden;
                border-radius: 30px;
                border: 1px solid rgba(34, 211, 238, 0.24);
                background:
                    radial-gradient(circle at top left, rgba(34, 211, 238, 0.16), transparent 38%),
                    linear-gradient(145deg, #111827, #050816 62%, #020617);
                box-shadow: 0 34px 100px rgba(0, 0, 0, 0.64);
                padding: 28px;
                color: #e5e7eb;
                animation: txMaintenancePop 0.18s ease-out;
            }

            .tx-maintenance-card::after {
                content: "";
                position: absolute;
                left: 24px;
                right: 24px;
                top: 0;
                height: 1px;
                background: linear-gradient(90deg, transparent, rgba(103, 232, 249, 0.65), transparent);
            }

            .tx-maintenance-head {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 18px;
            }

            .tx-maintenance-kicker {
                margin: 0;
                color: #67e8f9;
                font-size: 11px;
                font-weight: 900;
                letter-spacing: 0.22em;
                text-transform: uppercase;
            }

            .tx-maintenance-title {
                margin: 8px 0 0;
                color: #ffffff;
                font-size: clamp(24px, 4vw, 34px);
                line-height: 1.05;
                font-weight: 900;
                letter-spacing: -0.04em;
            }

            .tx-maintenance-close {
                display: grid;
                place-items: center;
                width: 44px;
                height: 44px;
                flex: 0 0 auto;
                border-radius: 16px;
                border: 1px solid rgba(148, 163, 184, 0.22);
                background: rgba(148, 163, 184, 0.10);
                color: #e2e8f0;
                cursor: pointer;
                font-size: 24px;
                font-weight: 900;
                line-height: 1;
                transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
            }

            .tx-maintenance-close:hover {
                transform: translateY(-1px);
                border-color: rgba(103, 232, 249, 0.42);
                background: rgba(34, 211, 238, 0.12);
            }

            .tx-maintenance-message {
                margin: 18px 0 0;
                color: #cbd5e1;
                font-size: 15px;
                font-weight: 700;
                line-height: 1.75;
            }

            .tx-maintenance-footer {
                margin-top: 22px;
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                align-items: center;
                justify-content: space-between;
                border-radius: 22px;
                border: 1px solid rgba(251, 191, 36, 0.18);
                background: rgba(251, 191, 36, 0.09);
                padding: 14px 16px;
                color: #fde68a;
                font-size: 12px;
                font-weight: 900;
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }

            .tx-maintenance-dot {
                width: 9px;
                height: 9px;
                border-radius: 999px;
                background: #fbbf24;
                box-shadow: 0 0 18px rgba(251, 191, 36, 0.7);
            }

            @keyframes txMaintenancePop {
                from { opacity: 0; transform: translateY(12px) scale(0.96); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }

            @media (max-width: 560px) {
                .tx-maintenance-card { padding: 22px; border-radius: 24px; }
                .tx-maintenance-close { width: 40px; height: 40px; }
            }
        `;

        document.head.appendChild(style);
    }

    function closeMaintenancePopup() {
        document.getElementById("txMaintenancePopup")?.remove();
    }

    function showMaintenancePopup() {
        if (!maintenanceState.active) return;

        injectMaintenanceStyles();

        let modal = document.getElementById("txMaintenancePopup");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "txMaintenancePopup";
            document.body.appendChild(modal);
        }

        const message = maintenanceState.message || DEFAULT_MESSAGE;
        modal.innerHTML = `
            <div class="tx-maintenance-overlay" role="presentation">
                <div class="tx-maintenance-card" role="dialog" aria-modal="true" aria-labelledby="txMaintenanceTitle">
                    <div class="tx-maintenance-head">
                        <div>
                            <p class="tx-maintenance-kicker">TraidiumX Account Notice</p>
                            <h2 id="txMaintenanceTitle" class="tx-maintenance-title">Maintenance Mode</h2>
                        </div>
                        <button type="button" class="tx-maintenance-close" aria-label="Close maintenance notice">×</button>
                    </div>
                    <p class="tx-maintenance-message">${escapeMaintenanceHtml(message)}</p>
                    <div class="tx-maintenance-footer">
                        <span class="tx-maintenance-dot"></span>
                        <span>Please try again after maintenance is completed.</span>
                    </div>
                </div>
            </div>
        `;

        modal.querySelector(".tx-maintenance-close")?.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            closeMaintenancePopup();
        });
    }

    async function requestMaintenanceJson(url) {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Cache-Control": "no-cache",
            },
            cache: "no-store",
            credentials: "include",
        });

        const text = await response.text();
        let payload = {};

        try {
            payload = text ? JSON.parse(text) : {};
        } catch (error) {
            throw new Error(`Maintenance API did not return JSON from ${url}`);
        }

        if (!response.ok || payload?.success === false) {
            throw new Error(payload?.message || `Maintenance API failed from ${url}`);
        }

        return payload;
    }

    function normalizeMaintenanceData(payload) {
        const data = payload?.data || payload || {};
        const platformStatus = String(data.platform_status || "").trim().toLowerCase();
        const active = Boolean(data.maintenance_active)
            || platformStatus === "maintenance_mode"
            || platformStatus === "maintenance mode"
            || platformStatus === "maintenance";

        return {
            active,
            message: data.maintenance_message || DEFAULT_MESSAGE,
            loaded: true,
        };
    }

    async function refreshMaintenanceState(showOnAccess = false) {
        const wasActive = Boolean(maintenanceState.active);
        const apiBaseUrl = getApiBaseUrl();
        const urls = [
            `${apiBaseUrl}/system/maintenance`,
            `${apiBaseUrl}/admin/settings`,
        ];

        let lastError = null;

        for (const url of urls) {
            try {
                const payload = await requestMaintenanceJson(url);
                maintenanceState = normalizeMaintenanceData(payload);
                break;
            } catch (error) {
                lastError = error;
            }
        }

        if (lastError && !maintenanceState.loaded) {
            // Maintenance check should never break normal frontend rendering.
            maintenanceState.loaded = true;
            console.warn("Maintenance check failed:", lastError);
            return;
        }

        if (!maintenanceState.active) {
            closeMaintenancePopup();
            return;
        }

        if (showOnAccess) {
            showMaintenancePopup();
        }
    }

    function shouldIgnoreMaintenanceClick(target) {
        return Boolean(target.closest("#txMaintenancePopup"));
    }

    function getActionLabel(element) {
        if (!element) return "";

        return [
            element.id,
            element.name,
            element.getAttribute("aria-label"),
            element.getAttribute("title"),
            element.getAttribute("data-action"),
            element.getAttribute("data-maintenance-action"),
            element.textContent,
        ].filter(Boolean).join(" ").toLowerCase();
    }

    function isMaintenanceRestrictedAction(target) {
        if (!target || shouldIgnoreMaintenanceClick(target)) {
            return false;
        }

        const link = target.closest("a[href]");

        // Maintenance mode should not block normal viewing/navigation. User can
        // open pages and click view links. Popup is only for real actions.
        if (link && !link.matches("[data-maintenance-action], [data-action='submit'], [data-action='trade'], [data-action='deposit'], [data-action='withdraw']")) {
            return false;
        }

        const control = target.closest("button, input[type='button'], input[type='submit'], [role='button'], [data-maintenance-action]");

        if (!control) {
            return false;
        }

        if (control.matches("[data-maintenance-ignore], .tx-maintenance-ignore")) {
            return false;
        }

        const label = getActionLabel(control);
        const restrictedWords = [
            "buy",
            "sell",
            "trade",
            "order",
            "place",
            "deposit",
            "withdraw",
            "transfer",
            "submit",
            "send",
            "verify",
            "confirm",
            "save",
            "update",
            "upload",
            "login",
            "log in",
            "signup",
            "sign up",
            "register",
            "reset",
            "password",
            "kyc",
        ];

        if (control.matches("[type='submit'], [data-maintenance-action]")) {
            return true;
        }

        return restrictedWords.some((word) => label.includes(word));
    }

    document.addEventListener("click", function (event) {
        if (!maintenanceState.active) return;
        if (!isMaintenanceRestrictedAction(event.target)) return;

        event.preventDefault();
        event.stopPropagation();
        showMaintenancePopup();
    }, true);

    document.addEventListener("submit", function (event) {
        if (!maintenanceState.active) return;

        event.preventDefault();
        event.stopPropagation();
        showMaintenancePopup();
    }, true);

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeMaintenancePopup();
        }
    });

    function initMaintenanceGuard() {
        // Do not show popup just by opening/viewing a page.
        // Popup appears only when user tries a restricted action during maintenance.
        refreshMaintenanceState(false);

        window.clearInterval(checkTimer);
        checkTimer = window.setInterval(function () {
            refreshMaintenanceState(false);
        }, CHECK_INTERVAL_MS);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initMaintenanceGuard, { once: true });
    } else {
        initMaintenanceGuard();
    }

    window.hidePageLoader = function() {
        const loader = document.getElementById("txPageLoader");
        if (loader) {
            loader.classList.add("opacity-0", "pointer-events-none");
            setTimeout(() => {
                try { loader.remove(); } catch (e) {}
            }, 550);
        }
    };

    setTimeout(() => {
        window.hidePageLoader();
    }, 3800);

    window.TXMaintenanceGuard = {
        refresh: () => refreshMaintenanceState(false),
        show: showMaintenancePopup,
    };
})();


(function loadTradingOnboardingModule() {
    if (document.querySelector('script[data-tx-trading-onboarding]')) return;
    const script = document.createElement("script");
    script.src = resolveAppPath("src/js/trading-onboarding.js?v=" + new Date().getTime());
    script.defer = true;
    script.dataset.txTradingOnboarding = "true";
    document.head.appendChild(script);
})();

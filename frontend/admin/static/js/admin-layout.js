"use strict";

(function () {
    const cfg = window.TX_ADMIN_CONFIG || {};
    const api = () => window.TXAdminApi;
    const navGroups = [
        { label: "Overview", items: [
            { id: "dashboard", title: "Dashboard", icon: "✦", href: "/admin/dashboard" }
        ]},
        { label: "Operations", items: [
            { id: "users", title: "Users", icon: "👥", href: "/admin/users" },
            { id: "kyc", title: "KYC Review", icon: "🪪", href: "/admin/kyc" },
            { id: "support", title: "Support Tickets", icon: "🎫", href: "/admin/support" },
            { id: "reminders", title: "User Reminders", icon: "🔔", href: "/admin/users/reminders" },
            { id: "deposits", title: "Deposits", icon: "↥", href: "/admin/wallet/deposits" },
            { id: "withdrawals", title: "Withdrawals", icon: "↧", href: "/admin/wallet/withdrawals" },
            { id: "ledger", title: "Wallet Ledger", icon: "≋", href: "/admin/wallet/ledger" }
        ]},
        { label: "Trading", items: [
            { id: "orders", title: "Orders", icon: "⇄", href: "/admin/trading/orders" },
            { id: "positions", title: "Positions", icon: "▣", href: "/admin/trading/positions" }
        ]},
        { label: "Control", items: [
            { id: "audit", title: "Audit Logs", icon: "◎", href: "/admin/logs/audit" },
            { id: "notifications", title: "Notifications", icon: "✉", href: "/admin/notifications" },
            { id: "maintenance", title: "Maintenance", icon: "⚒", href: "/admin/maintenance" },
            { id: "settings", title: "Settings", icon: "⚙", href: "/admin/settings" }
        ]}
    ];

    function statusClass(status) {
        return `status-pill status-${String(status || "unknown").toLowerCase().replace(/_/g, "-")}`;
    }

    function money(value, currency = "$ ") {
        const num = Number(value || 0);
        return currency + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function compact(value) {
        const num = Number(value || 0);
        if (Math.abs(num) >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
        if (Math.abs(num) >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
        if (Math.abs(num) >= 1_000) return (num / 1_000).toFixed(1) + "K";
        return String(num);
    }

    function initials(name) {
        return String(name || "TX").split(" ").map(x => x[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "TX";
    }

    const ADMIN_THEME_KEY = "traidiumx_admin_theme";

    function getAdminTheme() {
        try {
            return localStorage.getItem(ADMIN_THEME_KEY) === "light" ? "light" : "dark";
        } catch (error) {
            return "dark";
        }
    }

    function applyAdminTheme(theme = getAdminTheme()) {
        const normalizedTheme = theme === "light" ? "light" : "dark";
        document.documentElement.dataset.adminTheme = normalizedTheme;
        if (document.body) {
            document.body.dataset.adminTheme = normalizedTheme;
            document.body.classList.toggle("admin-light-mode", normalizedTheme === "light");
        }
        updateThemeButtons(normalizedTheme);
    }

    function setAdminTheme(theme) {
        const normalizedTheme = theme === "light" ? "light" : "dark";
        try {
            localStorage.setItem(ADMIN_THEME_KEY, normalizedTheme);
        } catch (error) {
            console.warn("Unable to save admin theme.", error);
        }
        applyAdminTheme(normalizedTheme);
    }

    function toggleAdminTheme() {
        setAdminTheme(getAdminTheme() === "light" ? "dark" : "light");
    }

    function updateThemeButtons(theme = getAdminTheme()) {
        const isLight = theme === "light";
        document.querySelectorAll("[data-admin-theme-toggle]").forEach((button) => {
            button.setAttribute("aria-label", isLight ? "Switch to dark mode" : "Switch to light mode");
            button.innerHTML = `<span class="admin-theme-toggle-icon">${isLight ? "☀" : "☾"}</span><span class="admin-theme-toggle-text">${isLight ? "Light" : "Dark"}</span>`;
        });
    }

    applyAdminTheme(getAdminTheme());

    function renderSidebar() {
        const sidebar = document.getElementById("adminSidebar");
        if (!sidebar) return;
        const active = document.body.dataset.adminPage;
        const groupsHtml = navGroups.map(group => `
            <div class="admin-nav-label">${group.label}</div>
            ${group.items.map(item => `
                <a class="admin-nav-link ${active === item.id ? "active" : ""}" href="${item.href}">
                    <span class="admin-nav-icon">${item.icon}</span>
                    <span>${item.title}</span>
                </a>
            `).join("")}
        `).join("");
        sidebar.innerHTML = `
            <div class="admin-sidebar-inner">
                <div class="admin-brand">
                    <div class="admin-brand-logo">TX</div>
                    <div>
                        <div class="text-base font-black tracking-tight text-white">${cfg.brandName || "TraidiumX"}</div>
                        <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">Admin Panel</div>
                    </div>
                </div>
                <nav class="admin-nav">${groupsHtml}</nav>
                <div class="border-t border-white/10 p-4">
                    <button id="adminLogoutBtn" class="admin-btn admin-btn-ghost w-full justify-start">↩ Logout</button>
                </div>
            </div>
        `;
    }

    function renderTopbar() {
        const topbar = document.getElementById("adminTopbar");
        if (!topbar) return;
        const title = document.body.dataset.pageTitle || "Admin";
        const subtitle = document.body.dataset.pageSubtitle || "TraidiumX operations control center";
        const admin = api()?.getAdmin?.() || {};
        const name = admin.name || "Admin";
        const role = String(admin.role || "admin").replace(/_/g, " ");
        topbar.innerHTML = `
            <div class="flex min-w-0 items-center gap-3">
                <button id="sidebarToggle" class="admin-btn px-3 lg:hidden" aria-label="Open menu">☰</button>
                <button type="button" class="admin-theme-toggle md:hidden" data-admin-theme-toggle aria-label="Toggle theme"></button>
                <div class="min-w-0">
                    <h1 class="truncate text-xl font-black tracking-tight text-white sm:text-2xl">${title}</h1>
                    <p class="mt-1 truncate text-xs font-semibold text-slate-400 sm:text-sm">${subtitle}</p>
                </div>
            </div>
            <div class="hidden items-center gap-3 md:flex">
                <button type="button" class="admin-theme-toggle" data-admin-theme-toggle aria-label="Toggle theme"></button>
                <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-right">
                    <div class="text-xs font-bold text-slate-400">System</div>
                    <div class="text-sm font-black text-emerald-300">Online</div>
                </div>
                <div class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                    <div class="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300 to-blue-400 text-sm font-black text-slate-950">${initials(name)}</div>
                    <div>
                        <div class="text-sm font-black text-white">${name}</div>
                        <div class="text-xs font-bold capitalize text-slate-400">${role}</div>
                    </div>
                </div>
            </div>
        `;
    }

    function bindLayoutActions() {
        const sidebar = document.getElementById("adminSidebar");
        const backdrop = document.getElementById("adminBackdrop");
        const toggle = document.getElementById("sidebarToggle");
        if (toggle && sidebar) {
            toggle.addEventListener("click", () => {
                sidebar.classList.add("open");
                backdrop?.classList.add("open");
            });
        }
        backdrop?.addEventListener("click", () => {
            sidebar?.classList.remove("open");
            backdrop.classList.remove("open");
        });
        document.querySelectorAll("[data-admin-theme-toggle]").forEach((button) => {
            if (button.dataset.bound === "true") return;
            button.dataset.bound = "true";
            button.addEventListener("click", toggleAdminTheme);
        });

        updateThemeButtons(getAdminTheme());

        document.getElementById("adminLogoutBtn")?.addEventListener("click", () => {
            api()?.logout?.();
        });
    }

    function toast(title, message, type = "info") {
        let host = document.querySelector(".toast-host");
        if (!host) {
            host = document.createElement("div");
            host.className = "toast-host";
            document.body.appendChild(host);
        }
        const accent = type === "success" ? "text-emerald-300" : type === "danger" ? "text-rose-300" : type === "warning" ? "text-amber-300" : "text-cyan-300";
        const el = document.createElement("div");
        el.className = "toast-card";
        el.innerHTML = `<div class="text-sm font-black ${accent}">${title}</div><div class="mt-1 text-xs font-semibold text-slate-300">${message}</div>`;
        host.appendChild(el);
        setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateX(16px)"; }, 2600);
        setTimeout(() => el.remove(), 3100);
    }

    function setupModal() {
        document.addEventListener("click", (e) => {
            const close = e.target.closest("[data-modal-close]");
            if (close) close.closest(".admin-modal")?.classList.remove("open");
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        applyAdminTheme(getAdminTheme());
        if (!api()?.requireAuth?.()) return;
        renderSidebar();
        renderTopbar();
        bindLayoutActions();
        setupModal();
        document.querySelectorAll(".tx-auto-year").forEach(el => el.textContent = new Date().getFullYear());
    });

    window.TXAdmin = { statusClass, money, compact, initials, toast, applyAdminTheme, setAdminTheme, toggleAdminTheme, getAdminTheme };
})();

"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const ui = window.TXAdmin;
    const api = window.TXAdminApi;
    if (!ui || !api || !api.requireAuth()) return;

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function safeNumber(value) {
        const number = Number(value || 0);
        return Number.isFinite(number) ? number : 0;
    }

    function titleCase(value) {
        return String(value || "unknown")
            .replaceAll("_", " ")
            .replaceAll("-", " ")
            .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function accentFor(index) {
        return ["cyan", "emerald", "amber", "rose", "blue", "violet", "teal", "orange"][index % 8];
    }

    function miniCard({ label, value, note, accent = "cyan", icon = "◆" }) {
        return `
            <div class="tx-mini-card" data-accent="${accent}">
                <div class="tx-mini-card-top"><span>${api.escapeHtml(icon)}</span><em>${api.escapeHtml(label)}</em></div>
                <b>${api.escapeHtml(String(value ?? "0"))}</b>
                <small>${api.escapeHtml(note || "")}</small>
            </div>
        `;
    }

    function rowCard({ title, subtitle, value, badge, accent = "cyan", icon = "◆", href = "" }) {
        const action = href ? `<a class="admin-btn py-2" href="${href}">Open</a>` : "";
        return `
            <div class="tx-row-card" data-accent="${accent}">
                <div class="tx-row-card-icon">${api.escapeHtml(icon)}</div>
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <div class="min-w-0">
                            <h3 title="${api.escapeHtml(title)}">${api.escapeHtml(title)}</h3>
                            <p title="${api.escapeHtml(subtitle || "")}">${api.escapeHtml(subtitle || "")}</p>
                        </div>
                        <span class="tx-row-value">${api.escapeHtml(String(value ?? ""))}</span>
                    </div>
                    <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span class="status-pill status-${api.escapeHtml(String(badge || "review").toLowerCase().replace(/_/g, "-"))}">${api.escapeHtml(titleCase(badge || "review"))}</span>
                        ${action}
                    </div>
                </div>
            </div>
        `;
    }

    function emptyCard(message) {
        return `<div class="tx-empty-card">${api.escapeHtml(message)}</div>`;
    }

    function renderMarketStrip() {
        const strip = document.getElementById("marketStripTrack");
        const ticks = window.TX_ADMIN_DATA?.marketTicks || [];
        if (!strip || !ticks.length) return;
        strip.innerHTML = [...ticks, ...ticks].map(t => `
            <div class="market-chip">
                <span class="font-black text-white">${api.escapeHtml(t.symbol)}</span>
                <span class="text-slate-300">${Number(t.price).toLocaleString()}</span>
                <span class="${t.change >= 0 ? "text-emerald-300" : "text-rose-300"} font-black">${t.change >= 0 ? "+" : ""}${t.change}%</span>
            </div>
        `).join("");
    }

    function normalizeWithdrawal(item) {
        const id = api.getId(item);
        return {
            id,
            reference: item.withdrawal_reference || id,
            user: api.userLabel(item),
            email: api.userEmail(item),
            asset: item.currency || item.crypto_asset || item.asset || "USDT",
            amount: api.number(item.locked_amount || item.amount),
            status: item.status || "pending"
        };
    }

    function normalizePosition(item) {
        return {
            id: api.getId(item),
            userId: item.user_id || item.user?.id || item.user?._id || "",
            user: api.userLabel(item),
            email: api.userEmail(item),
            symbol: item.symbol || "-",
            side: item.position_side || item.side || "-",
            leverage: item.leverage ? `${item.leverage}x` : "-",
            pnl: api.number(item.unrealized_pnl || item.pnl),
            risk: item.risk_level || item.risk || "low"
        };
    }

    function renderStatusCards(containerId, rows, totalLabel = "records") {
        const box = document.getElementById(containerId);
        if (!box) return;
        if (!rows.length) {
            box.innerHTML = emptyCard("No status data found.");
            return;
        }
        const total = rows.reduce((sum, item) => sum + safeNumber(item.count), 0) || 1;
        box.innerHTML = rows.slice(0, 8).map((item, index) => {
            const count = safeNumber(item.count);
            const pct = Math.round((count / total) * 100);
            return miniCard({
                label: titleCase(item.status || item.label || "Status"),
                value: count.toLocaleString(),
                note: `${pct}% of ${totalLabel}`,
                accent: accentFor(index),
                icon: index === 0 ? "●" : index === 1 ? "◆" : index === 2 ? "◇" : "✦"
            });
        }).join("");
    }

    function renderFinanceCards(data) {
        const box = document.getElementById("dashboardFinanceCards");
        if (!box) return;
        const depositRows = data.deposits_volume || [];
        const withdrawalRows = data.withdrawals_volume || [];
        const deposits = depositRows.reduce((sum, item) => sum + safeNumber(item.amount), 0);
        const withdrawals = withdrawalRows.reduce((sum, item) => sum + safeNumber(item.amount), 0);
        const net = deposits - withdrawals;
        setText("depositsVolume", ui.money(deposits));
        setText("withdrawalsVolume", ui.money(withdrawals));
        setText("netFlow", ui.money(net));
        box.innerHTML = [
            miniCard({ label: "Approved Deposits", value: ui.money(deposits), note: "Total deposit volume in selected range", accent: "emerald", icon: "↥" }),
            miniCard({ label: "Withdrawals", value: ui.money(withdrawals), note: "Total withdrawal volume in selected range", accent: "rose", icon: "↧" }),
            miniCard({ label: "Net Flow", value: ui.money(net), note: net >= 0 ? "Positive platform inflow" : "More withdrawals than deposits", accent: net >= 0 ? "cyan" : "orange", icon: "⇄" }),
            miniCard({ label: "Finance Days", value: `${data.range?.days || 14}D`, note: "Analytics range from backend", accent: "violet", icon: "◈" })
        ].join("");
    }

    function renderTradingCards(data) {
        const box = document.getElementById("dashboardTradingCards");
        if (!box) return;
        const orderRows = data.orders_by_status || [];
        const positionRows = data.positions_by_status || [];
        const orderTotal = orderRows.reduce((sum, item) => sum + safeNumber(item.count), 0);
        const positionTotal = positionRows.reduce((sum, item) => sum + safeNumber(item.count), 0);
        const openPositions = positionRows.find(item => String(item.status || "").toLowerCase() === "open")?.count || 0;
        const completedOrders = orderRows.find(item => ["filled", "completed", "closed"].includes(String(item.status || "").toLowerCase()))?.count || 0;
        box.innerHTML = [
            miniCard({ label: "Orders", value: orderTotal.toLocaleString(), note: "All order status records", accent: "blue", icon: "⇄" }),
            miniCard({ label: "Completed Orders", value: safeNumber(completedOrders).toLocaleString(), note: "Filled/completed order records", accent: "emerald", icon: "✓" }),
            miniCard({ label: "Positions", value: positionTotal.toLocaleString(), note: "All position status records", accent: "violet", icon: "▣" }),
            miniCard({ label: "Open Positions", value: safeNumber(openPositions).toLocaleString(), note: "Current open risk exposure", accent: "amber", icon: "⚡" })
        ].join("");
    }

    function renderGrowthCards(data) {
        const userRows = data.users_growth || [];
        const newUsers = userRows.reduce((sum, item) => sum + safeNumber(item.count), 0);
        setText("usersGrowth14", newUsers.toLocaleString());
        setText("analyticsRange", `${data.range?.days || 14}D`);
    }

    function renderAnalytics(data) {
        renderFinanceCards(data);
        renderTradingCards(data);
        renderGrowthCards(data);
        renderStatusCards("withdrawalStatusList", data.withdrawals_by_status || [], "withdrawal records");
    }

    function renderWithdrawals(rows) {
        const box = document.getElementById("dashboardWithdrawalsCards");
        if (!box) return;
        if (!rows.length) {
            box.innerHTML = emptyCard("No pending withdrawals found.");
            return;
        }
        box.innerHTML = rows.map((raw, index) => {
            const w = normalizeWithdrawal(raw);
            return rowCard({
                title: w.reference,
                subtitle: `${w.user} • ${w.email || "No email"}`,
                value: `${w.asset} ${w.amount.toLocaleString()}`,
                badge: w.status,
                accent: accentFor(index + 3),
                icon: "↧",
                href: `/admin/wallet/withdrawal-detail?id=${encodeURIComponent(w.id)}`
            });
        }).join("");
    }

    function renderPositions(rows) {
        const box = document.getElementById("riskPositionsCards");
        if (!box) return;
        if (!rows.length) {
            box.innerHTML = emptyCard("No open positions found.");
            return;
        }
        box.innerHTML = rows.slice(0, 8).map((raw, index) => {
            const p = normalizePosition(raw);
            const side = String(p.side || "").toLowerCase();
            const risk = String(p.risk || "low").toLowerCase();
            return rowCard({
                title: `${p.symbol} • ${String(p.side || "-").toUpperCase()}`,
                subtitle: `${p.user} • ${p.leverage}`,
                value: ui.money(p.pnl),
                badge: risk,
                accent: side === "long" || side === "buy" ? "emerald" : index % 2 ? "rose" : "orange",
                icon: "▣",
                href: p.userId ? `/admin/users/detail?id=${encodeURIComponent(p.userId)}` : "/admin/trading/positions"
            });
        }).join("");
    }

    function renderFallbackCards() {
        const financeBox = document.getElementById("dashboardFinanceCards");
        const tradingBox = document.getElementById("dashboardTradingCards");
        const statusBox = document.getElementById("withdrawalStatusList");
        if (financeBox) financeBox.innerHTML = emptyCard("Finance analytics failed to load.");
        if (tradingBox) tradingBox.innerHTML = emptyCard("Trading analytics failed to load.");
        if (statusBox) statusBox.innerHTML = emptyCard("Withdrawal status failed to load.");
    }

    renderMarketStrip();
    document.getElementById("dashboardWithdrawalsCards") && (document.getElementById("dashboardWithdrawalsCards").innerHTML = emptyCard("Loading pending withdrawals..."));
    document.getElementById("riskPositionsCards") && (document.getElementById("riskPositionsCards").innerHTML = emptyCard("Loading open positions..."));
    document.getElementById("dashboardFinanceCards") && (document.getElementById("dashboardFinanceCards").innerHTML = emptyCard("Loading finance cards..."));
    document.getElementById("dashboardTradingCards") && (document.getElementById("dashboardTradingCards").innerHTML = emptyCard("Loading trading cards..."));
    document.getElementById("withdrawalStatusList") && (document.getElementById("withdrawalStatusList").innerHTML = emptyCard("Loading withdrawal status..."));

    async function refreshDashboard() {
        try {
            const summary = await api.request("/dashboard/summary");
            setText("totalUsers", ui.compact(summary.users?.total || 0));
            setText("activeUsers", ui.compact(summary.users?.active || 0));
            setText("growthActiveUsers", ui.compact(summary.users?.active || 0));
            setText("pendingKyc", summary.kyc?.pending || 0);
            setText("growthPendingKyc", summary.kyc?.pending || 0);
            setText("pendingWithdrawals", summary.withdrawals?.pending || 0);
            setText("openPositions", summary.trading?.open_positions || 0);
            setText("totalWallet", ui.money(summary.wallet?.total_balance || summary.wallet?.available_balance || 0));
            setText("dailyVolume", ui.money(summary.trading?.daily_volume || 0));
            setText("riskAlerts", summary.trading?.risk_alerts || 0);
            setText("growthRiskAlerts", summary.trading?.risk_alerts || 0);
        } catch (error) {
            api.showError(error, "Dashboard summary failed.");
        }

        try {
            const analytics = await api.request("/dashboard/analytics");
            renderAnalytics(analytics);
        } catch (error) {
            renderFallbackCards();
        }

        try {
            const data = await api.request("/withdrawals", { params: { status: "pending", limit: 4 } });
            renderWithdrawals(data.withdrawals || []);
        } catch (error) {
            renderWithdrawals([]);
        }

        try {
            const data = await api.request("/trading/positions", { params: { status: "open", limit: 8 } });
            renderPositions(data.positions || []);
        } catch (error) {
            renderPositions([]);
        }
    }

    await refreshDashboard();

    // Auto-refresh dashboard metrics every 10 seconds
    setInterval(() => {
        if (document.visibilityState === "visible") {
            refreshDashboard();
        }
    }, 10000);
});

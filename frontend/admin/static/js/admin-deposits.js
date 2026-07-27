"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const ui = window.TXAdmin;
    const api = window.TXAdminApi;
    if (!ui || !api || !api.requireAuth()) return;

    let depositsState = { page: 1, limit: 25, total: 0, rows: [] };
    let searchTimer = null;

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function money(value) {
        return ui.money(api.number(value), "");
    }

    function depositId(item) {
        return api.getId(item) || item.deposit_id || item.reference_id || "";
    }

    function statusLabel(value) {
        return String(value || "pending_verification").replace(/_/g, " ");
    }

    function statusClass(status) {
        const normalized = String(status || "").toLowerCase().replace(/_/g, "-");
        if (["pending", "pending-verification", "not-checked", "queued"].includes(normalized)) return "status-pill status-pending";
        if (["completed", "approved", "confirmed", "verified"].includes(normalized)) return "status-pill status-completed";
        if (["rejected", "failed", "cancelled", "declined"].includes(normalized)) return "status-pill status-rejected";
        return `status-pill status-${normalized}`;
    }

    function normalizeDeposit(item) {
        const id = depositId(item);
        const user = item.user || {};
        return {
            id,
            reference: item.deposit_reference || item.gateway_order_id || id,
            userId: item.user_id || user.id || user._id || "",
            user: api.userLabel(item),
            email: api.userEmail(item),
            phone: item.phone || user.phone || "",
            amount: api.number(item.amount || item.deposit_amount || item.usdt_amount),
            asset: item.currency || item.crypto_asset || item.asset || "USDT",
            network: item.crypto_network || item.network || "-",
            address: item.deposit_address || item.to_address || "-",
            txHash: item.tx_hash || item.gateway_payment_id || "",
            explorerUrl: item.explorer_url || "",
            status: item.status || "pending_verification",
            verificationStatus: item.verification_status || "not_checked",
            verificationMessage: item.verification_message || item.remark || "",
            confirmations: api.number(item.confirmations, 0),
            requiredConfirmations: api.number(item.required_confirmations, 0),
            verifiedAmount: api.number(item.verified_amount, 0),
            requestedAt: api.fmtDate(item.created_at),
            creditedAt: api.fmtDate(item.credited_at || item.approved_at),
            remark: item.admin_note || item.remark || item.reject_reason || ""
        };
    }

    function currentDepositParams() {
        return {
            page: depositsState.page,
            limit: depositsState.limit,
            search: document.getElementById("depositSearch")?.value.trim() || "",
            currency: document.getElementById("depositCurrencyFilter")?.value || "all",
            status: document.getElementById("depositStatusFilter")?.value || "all",
            network: document.getElementById("depositNetworkFilter")?.value || ""
        };
    }

    function paginationMeta(meta, state) {
        const total = Number(meta?.total || 0);
        const page = Number(meta?.page || state.page || 1);
        const limit = Number(meta?.limit || state.limit || 25);
        const totalPages = Number(meta?.total_pages || meta?.pages || Math.max(Math.ceil(total / limit), 1));
        return { total, page, limit, totalPages };
    }

    function renderPagination(containerId, meta, onPage, onLimit) {
        const box = document.getElementById(containerId);
        if (!box) return;
        const { total, page, limit, totalPages } = meta;
        if (!total) {
            box.innerHTML = "";
            return;
        }
        const start = (page - 1) * limit + 1;
        const end = Math.min(page * limit, total);
        const pages = [];
        const from = Math.max(1, page - 2);
        const to = Math.min(totalPages, page + 2);
        if (from > 1) pages.push(1);
        if (from > 2) pages.push("...");
        for (let i = from; i <= to; i += 1) pages.push(i);
        if (to < totalPages - 1) pages.push("...");
        if (to < totalPages) pages.push(totalPages);

        box.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p class="text-xs font-bold text-slate-400">Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${total.toLocaleString()}</p>
                <div class="flex flex-wrap items-center gap-2">
                    <select class="admin-input !w-auto !py-2" data-page-limit>
                        ${[10, 25, 50, 100].map(size => `<option value="${size}" ${size === limit ? "selected" : ""}>${size}/page</option>`).join("")}
                    </select>
                    <button class="admin-btn !py-2" data-page-prev ${page <= 1 ? "disabled" : ""}>Prev</button>
                    ${pages.map(item => item === "..." ? `<span class="px-2 text-slate-500">...</span>` : `<button class="admin-btn !py-2 ${item === page ? "admin-btn-primary" : ""}" data-page="${item}">${item}</button>`).join("")}
                    <button class="admin-btn !py-2" data-page-next ${page >= totalPages ? "disabled" : ""}>Next</button>
                </div>
            </div>
        `;
        box.querySelector("[data-page-prev]")?.addEventListener("click", () => onPage(Math.max(1, page - 1)));
        box.querySelector("[data-page-next]")?.addEventListener("click", () => onPage(Math.min(totalPages, page + 1)));
        box.querySelectorAll("[data-page]").forEach(btn => btn.addEventListener("click", () => onPage(Number(btn.dataset.page))));
        box.querySelector("[data-page-limit]")?.addEventListener("change", (event) => onLimit(Number(event.target.value)));
    }

    function renderDeposits(rows) {
        const body = document.getElementById("depositsTableBody");
        if (!body) return;
        if (!rows.length) {
            body.innerHTML = api.emptyRow(7, "No deposit records found.");
            return;
        }
        body.innerHTML = rows.map(raw => {
            const d = normalizeDeposit(raw);
            const txText = d.txHash ? d.txHash : "No TXID";
            return `
                <tr>
                    <td>
                        <div class="max-w-[220px] truncate font-black text-white" title="${api.escapeHtml(d.reference)}">${api.escapeHtml(d.reference)}</div>
                        <div class="mt-1 text-xs font-bold text-slate-500">${api.escapeHtml(d.requestedAt)}</div>
                    </td>
                    <td>
                        <div class="font-black text-slate-100">${api.escapeHtml(d.user)}</div>
                        <div class="text-xs text-slate-500">${api.escapeHtml(d.email || d.userId)}</div>
                    </td>
                    <td>
                        <div class="font-black text-cyan-300">${api.escapeHtml(d.network)}</div>
                        <button class="mt-1 max-w-[260px] truncate text-left text-xs text-slate-400 hover:text-cyan-200" data-copy="${api.escapeHtml(d.address)}" title="${api.escapeHtml(d.address)}">${api.escapeHtml(d.address)}</button>
                    </td>
                    <td>
                        <div class="text-lg font-black text-white">${money(d.amount)}</div>
                        <div class="text-xs font-bold text-slate-500">${api.escapeHtml(d.asset)}</div>
                    </td>
                    <td>
                        <div class="font-bold text-slate-200">${api.escapeHtml(statusLabel(d.verificationStatus))}</div>
                        <div class="text-xs text-slate-500">${api.escapeHtml(d.confirmations)}/${api.escapeHtml(d.requiredConfirmations)} confirmations</div>
                        <button class="mt-1 max-w-[240px] truncate text-left text-xs text-cyan-300" data-copy="${api.escapeHtml(d.txHash)}" title="${api.escapeHtml(txText)}">${api.escapeHtml(txText)}</button>
                    </td>
                    <td><span class="${statusClass(d.status)}">${api.escapeHtml(statusLabel(d.status))}</span></td>
                    <td class="text-right">
                        ${d.explorerUrl ? `<a class="admin-btn !py-2" href="${api.escapeHtml(d.explorerUrl)}" target="_blank" rel="noopener">Explorer</a>` : `<span class="text-xs font-bold text-slate-500">History only</span>`}
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function loadSummary() {
        try {
            const summary = await api.request("/wallet/deposits/summary");
            const deposits = summary.deposits || {};
            setText("depositPendingCount", ui.compact(deposits.pending || 0));
            setText("depositPendingAmount", `${ui.money(deposits.pending_amount || 0)} waiting verification`);
            setText("depositCompletedToday", ui.compact(deposits.completed_today || 0));
            setText("depositRejectedToday", ui.compact(deposits.rejected_today || 0));
            setText("depositCompletedAmount", ui.money(deposits.completed_amount || 0));
            setText("depositSubmittedToday", `${ui.compact(deposits.submitted_today || 0)} submitted today • ${ui.money(deposits.submitted_today_amount || 0)}`);
        } catch (error) {
            api.showError(error, "Deposit summary failed.");
        }
    }

    async function loadDeposits() {
        const body = document.getElementById("depositsTableBody");
        if (!body) return;
        api.setLoading(body, 7);
        try {
            const data = await api.request("/wallet/deposits", { params: currentDepositParams() });
            const meta = paginationMeta(data.pagination, depositsState);
            depositsState = { ...depositsState, ...meta, rows: data.deposits || [] };
            renderDeposits(depositsState.rows);
            renderPagination("depositsPagination", meta, (page) => { depositsState.page = page; loadDeposits(); }, (limit) => { depositsState.limit = limit; depositsState.page = 1; loadDeposits(); });
        } catch (error) {
            api.showError(error, "Deposits failed.");
            depositsState.rows = [];
            renderDeposits([]);
        }
    }

    function bindFilters() {
        ["depositSearch", "depositCurrencyFilter", "depositStatusFilter", "depositNetworkFilter"].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener(id === "depositSearch" ? "input" : "change", () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => { depositsState.page = 1; loadDeposits(); }, 300);
            });
        });
        document.getElementById("depositResetBtn")?.addEventListener("click", (event) => {
            event.preventDefault();
            ["depositSearch"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
            const currency = document.getElementById("depositCurrencyFilter");
            const status = document.getElementById("depositStatusFilter");
            const network = document.getElementById("depositNetworkFilter");
            if (currency) currency.value = "all";
            if (status) status.value = "all";
            if (network) network.value = "";
            depositsState.page = 1;
            loadDeposits();
        });
    }

    document.addEventListener("click", async (event) => {
        const copyButton = event.target.closest("[data-copy]");
        if (copyButton) {
            await navigator.clipboard?.writeText(copyButton.dataset.copy || "");
            ui.toast("Copied", "Deposit value copied to clipboard.", "success");
            return;
        }

    });


    bindFilters();
    await loadSummary();
    await loadDeposits();
});

"use strict";

(function () {
    const api = window.TXAdminApi;
    if (!api) return;

    let state = {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
        search: "",
        type: "",
        searchTimer: null
    };

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatDate(isoStr) {
        if (!isoStr) return "N/A";
        try {
            const date = new Date(isoStr);
            if (isNaN(date.getTime())) return isoStr;
            return date.toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
            });
        } catch (_) {
            return isoStr;
        }
    }

    async function loadDeletedAccounts() {
        const tbody = document.getElementById("deletedTableBody");
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="py-12 text-center text-slate-500 font-bold">
                    <div class="inline-flex items-center gap-2">
                        <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent"></span>
                        Loading deleted account logs...
                    </div>
                </td>
            </tr>
        `;

        try {
            const params = {
                page: state.page,
                limit: state.limit
            };
            if (state.search) params.search = state.search;
            if (state.type) params.type = state.type;

            const res = await api.request("/users/deleted-accounts", { params });
            const data = (res && (Array.isArray(res.records) || res.stats)) ? res : (res?.data || res || {});
            const records = Array.isArray(data.records) ? data.records : (Array.isArray(res?.records) ? res.records : []);
            const stats = data.stats || res?.stats || {};

            state.total = (typeof data.total === "number") ? data.total : (Number(stats.total_deleted) || records.length);
            state.totalPages = data.pages || Math.max(1, Math.ceil(state.total / state.limit));

            // Update Statistics Cards
            const totalEl = document.getElementById("statTotalDeleted");
            const mainEl = document.getElementById("statMainDeleted");
            const subEl = document.getElementById("statSubDeleted");
            const todayEl = document.getElementById("statTodayDeleted");

            if (totalEl) totalEl.textContent = Number(stats.total_deleted || 0).toLocaleString();
            if (mainEl) mainEl.textContent = Number(stats.main_deleted || 0).toLocaleString();
            if (subEl) subEl.textContent = Number(stats.sub_deleted || 0).toLocaleString();
            if (todayEl) todayEl.textContent = Number(stats.today_deleted || 0).toLocaleString();

            // Render Table
            if (records.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="py-12 text-center text-slate-400 font-bold">
                            No deleted account records found.
                        </td>
                    </tr>
                `;
            } else {
                tbody.innerHTML = records.map(item => {
                    const isMain = item.account_type === "main";
                    const typeBadge = isMain
                        ? `<span class="text-xs font-black tracking-wide text-rose-500">Main Account</span>`
                        : `<span class="text-xs font-black tracking-wide text-amber-500">Sub-Account</span>`;

                    const parentDisplay = isMain
                        ? `<span class="text-xs font-semibold text-slate-500 italic">— Master Primary Account —</span>`
                        : (item.parent_name
                            ? `<div class="text-xs">
                                 <strong class="font-bold text-white block">${escapeHtml(item.parent_name)}</strong>
                                 <span class="font-mono text-cyan-400 font-semibold text-[11px]">#${escapeHtml(item.parent_client_id || (item.parent_user_id ? String(item.parent_user_id).slice(0, 8) : 'N/A'))}</span>
                               </div>`
                            : `<span class="text-xs text-slate-500">Unlinked</span>`);

                    const refundDisplay = item.refund_summary
                        ? `<span class="text-xs font-semibold text-slate-300 block">${escapeHtml(item.refund_summary)}</span>`
                        : `<span class="text-xs text-slate-500">Zero Balance</span>`;

                    const accountIcon = isMain
                        ? `<div class="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 shadow-sm" title="Main Account">
                             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                               <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                             </svg>
                           </div>`
                        : `<div class="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 shadow-sm" title="Sub-Account">
                             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                               <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                             </svg>
                           </div>`;

                    return `
                        <tr class="hover:bg-white/[0.02] transition border-b border-white/5">
                            <td class="py-4">
                                <div class="flex items-center gap-3">
                                    ${accountIcon}
                                    <div class="min-w-0">
                                        <div class="flex items-center gap-2">
                                            <strong class="font-black text-white text-sm truncate">${escapeHtml(item.name)}</strong>
                                            <span class="font-mono text-[11px] font-bold text-slate-400 bg-white/5 px-2 py-0.5 rounded-md">#${escapeHtml(item.client_id)}</span>
                                        </div>
                                        <div class="text-xs text-slate-400 truncate mt-0.5 font-medium">${escapeHtml(item.email || item.mobile || "No Contact")}</div>
                                    </div>
                                </div>
                            </td>
                            <td>${typeBadge}</td>
                            <td>${parentDisplay}</td>
                            <td>${refundDisplay}</td>
                            <td>
                                <span class="text-xs font-bold text-slate-300 block">${escapeHtml(item.deleted_by_name || "User (Self)")}</span>
                                <span class="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mt-0.5">Self Action</span>
                            </td>
                            <td class="text-right">
                                <span class="font-mono text-xs font-bold text-slate-300 block">${formatDate(item.deleted_at)}</span>
                            </td>
                        </tr>
                    `;
                }).join("");
            }

            // Update Pagination
            updatePagination();

        } catch (err) {
            console.error("Failed to load deleted accounts:", err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-10 text-center text-rose-400 font-bold">
                        Failed to load deleted account logs. Please try again.
                    </td>
                </tr>
            `;
        }
    }

    function updatePagination() {
        const pageInfo = document.getElementById("pageInfo");
        const prevBtn = document.getElementById("prevBtn");
        const nextBtn = document.getElementById("nextBtn");

        const start = state.total === 0 ? 0 : (state.page - 1) * state.limit + 1;
        const end = Math.min(state.page * state.limit, state.total);

        if (pageInfo) {
            pageInfo.textContent = `Showing ${start} to ${end} of ${state.total} logs (Page ${state.page} of ${state.totalPages})`;
        }

        if (prevBtn) prevBtn.disabled = state.page <= 1;
        if (nextBtn) nextBtn.disabled = state.page >= state.totalPages;
    }

    function initListeners() {
        const searchInput = document.getElementById("deletedSearch");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                clearTimeout(state.searchTimer);
                state.searchTimer = setTimeout(() => {
                    state.search = e.target.value.trim();
                    state.page = 1;
                    loadDeletedAccounts();
                }, 300);
            });
        }

        const typeFilter = document.getElementById("deletedTypeFilter");
        if (typeFilter) {
            typeFilter.addEventListener("change", (e) => {
                state.type = e.target.value;
                state.page = 1;
                loadDeletedAccounts();
            });
        }

        const refreshBtn = document.getElementById("refreshBtn");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", () => {
                loadDeletedAccounts();
            });
        }

        const prevBtn = document.getElementById("prevBtn");
        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                if (state.page > 1) {
                    state.page--;
                    loadDeletedAccounts();
                }
            });
        }

        const nextBtn = document.getElementById("nextBtn");
        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                if (state.page < state.totalPages) {
                    state.page++;
                    loadDeletedAccounts();
                }
            });
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        initListeners();
        loadDeletedAccounts();
    });
})();

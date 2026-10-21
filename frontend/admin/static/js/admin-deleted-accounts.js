"use strict";

(function () {
    const api = window.TXAdminApi;
    const ui = window.TXAdmin;
    if (!api) return;

    let activeTab = "requests"; // "requests" | "history"

    // State for Deletion Requests tab
    let reqState = {
        page: 1,
        limit: 15,
        total: 0,
        totalPages: 1,
        search: "",
        status: "pending",
        searchTimer: null,
        activeRequestId: null,
        activeRequestUser: null
    };

    // State for Deletion History (Archive) tab
    let histState = {
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

    function formatCurrency(val, symbol = "₹") {
        const num = Number(val || 0);
        return symbol + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    /* ----------------------------------------------------
       Tab Switching Logic
    ---------------------------------------------------- */
    function switchTab(tab) {
        activeTab = tab;
        const tabBtnRequests = document.getElementById("tabBtnRequests");
        const tabBtnHistory = document.getElementById("tabBtnHistory");
        const sectionRequests = document.getElementById("sectionRequests");
        const sectionHistory = document.getElementById("sectionHistory");

        if (tab === "requests") {
            tabBtnRequests.className = "relative flex items-center gap-2 px-5 py-3 text-sm font-black transition rounded-2xl bg-white/10 text-white shadow-sm";
            tabBtnHistory.className = "relative flex items-center gap-2 px-5 py-3 text-sm font-black transition rounded-2xl text-slate-400 hover:text-white hover:bg-white/5";
            sectionRequests?.classList.remove("hidden");
            sectionHistory?.classList.add("hidden");
            loadDeletionRequests();
        } else {
            tabBtnHistory.className = "relative flex items-center gap-2 px-5 py-3 text-sm font-black transition rounded-2xl bg-white/10 text-white shadow-sm";
            tabBtnRequests.className = "relative flex items-center gap-2 px-5 py-3 text-sm font-black transition rounded-2xl text-slate-400 hover:text-white hover:bg-white/5";
            sectionHistory?.classList.remove("hidden");
            sectionRequests?.classList.add("hidden");
            loadDeletedHistory();
        }
    }

    /* ----------------------------------------------------
       Tab 1: Load Deletion Requests
    ---------------------------------------------------- */
    async function loadDeletionRequests() {
        const tbody = document.getElementById("requestsTableBody");
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="py-12 text-center text-slate-500 font-bold">
                    <div class="inline-flex items-center gap-2">
                        <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent"></span>
                        Loading deletion requests...
                    </div>
                </td>
            </tr>
        `;

        try {
            const params = {
                page: reqState.page,
                limit: reqState.limit
            };
            if (reqState.search) params.search = reqState.search;
            if (reqState.status) params.status = reqState.status;

            const res = await api.request("/users/deletion-requests", { params });
            const data = res?.data || res || {};
            const requests = Array.isArray(data.requests) ? data.requests : [];
            const stats = data.stats || {};

            reqState.total = typeof data.total === "number" ? data.total : requests.length;
            reqState.totalPages = data.pages || Math.max(1, Math.ceil(reqState.total / reqState.limit));

            // Update stats cards
            const pendingEl = document.getElementById("statPendingRequests");
            const approvedEl = document.getElementById("statApprovedRequests");
            const rejectedEl = document.getElementById("statRejectedRequests");
            const pendingBadge = document.getElementById("pendingBadge");

            const pendingCount = Number(stats.pending ?? 0);
            if (pendingEl) pendingEl.textContent = pendingCount.toLocaleString();
            if (approvedEl) approvedEl.textContent = Number(stats.approved ?? 0).toLocaleString();
            if (rejectedEl) rejectedEl.textContent = Number(stats.rejected ?? 0).toLocaleString();

            if (pendingBadge) {
                if (pendingCount > 0) {
                    pendingBadge.textContent = pendingCount;
                    pendingBadge.classList.remove("hidden");
                } else {
                    pendingBadge.classList.add("hidden");
                }
            }

            // Render table
            if (requests.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="py-12 text-center text-slate-400 font-bold">
                            No deletion requests found for this filter.
                        </td>
                    </tr>
                `;
            } else {
                tbody.innerHTML = requests.map(req => {
                    const status = String(req.status || "pending").toLowerCase();

                    let statusBadge = "";
                    if (status === "pending") {
                        statusBadge = `<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-xs font-black text-amber-400">
                            <span class="h-1.5 w-1.5 rounded-full bg-amber-400"></span> Pending
                        </span>`;
                    } else if (status === "approved") {
                        statusBadge = `<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs font-black text-emerald-400">
                            <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span> Approved
                        </span>`;
                    } else if (status === "rejected") {
                        statusBadge = `<span class="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 text-xs font-black text-rose-400">
                            <span class="h-1.5 w-1.5 rounded-full bg-rose-400"></span> Rejected
                        </span>`;
                    } else {
                        statusBadge = `<span class="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 border border-slate-500/20 px-2.5 py-1 text-xs font-black text-slate-400">
                            ${escapeHtml(status)}
                        </span>`;
                    }

                    // Balances
                    const inrBal = req.wallet_balances?.inr_balance ?? 0;
                    const usdtBal = req.wallet_balances?.usdt_balance ?? 0;
                    const balanceDisplay = `
                        <div class="text-xs space-y-0.5">
                            <div class="font-mono font-bold text-emerald-400">${formatCurrency(inrBal, "₹")}</div>
                            <div class="font-mono text-cyan-400 text-[11px]">${formatCurrency(usdtBal, "$")} USDT</div>
                        </div>
                    `;

                    // Actions
                    let actionHtml = "";
                    const viewDataBtn = req.user_id ? `
                        <a href="/admin/users/detail?id=${encodeURIComponent(req.user_id)}" target="_blank" class="admin-btn py-1.5 px-2.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/10 border-white/20 inline-flex items-center gap-1" title="View Full Data in User Profile">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                            <span>View Data</span>
                        </a>` : '';

                    if (status === "pending") {
                        actionHtml = `
                            <div class="flex items-center justify-end gap-2">
                                ${viewDataBtn}
                                <button type="button" class="admin-btn py-1.5 px-3 text-xs font-black bg-rose-600/90 hover:bg-rose-500 text-white border-rose-500/40"
                                    data-action="approve" data-id="${escapeHtml(req.id)}" data-name="${escapeHtml(req.name)}" data-client="${escapeHtml(req.client_id)}" data-reason="${escapeHtml(req.reason)}" data-inr="${inrBal}" data-usdt="${usdtBal}">
                                    Approve & Close
                                </button>
                                <button type="button" class="admin-btn py-1.5 px-3 text-xs font-bold text-amber-300 hover:text-white hover:bg-amber-500/10 border-amber-500/30"
                                    data-action="reject" data-id="${escapeHtml(req.id)}" data-name="${escapeHtml(req.name)}" data-client="${escapeHtml(req.client_id)}" data-reason="${escapeHtml(req.reason)}">
                                    Reject
                                </button>
                            </div>
                        `;
                    } else if (status === "approved") {
                        actionHtml = `
                            <div class="flex items-center justify-end gap-2">
                                <div class="text-right text-[11px] text-slate-400 mr-1">
                                    <span class="font-bold text-emerald-400 block">Closed</span>
                                    <span class="text-slate-500 font-mono text-[10px]">${formatDate(req.processed_at)}</span>
                                </div>
                                ${viewDataBtn}
                            </div>
                        `;
                    } else if (status === "restored") {
                        actionHtml = `
                            <div class="text-right text-[11px] text-slate-400">
                                <span class="font-bold text-cyan-400 block">Restored</span>
                                <span class="text-slate-500 font-mono text-[10px]">${formatDate(req.processed_at)}</span>
                            </div>
                        `;
                    } else if (status === "rejected") {
                        actionHtml = `
                            <div class="text-right text-[11px] text-slate-400">
                                <span class="font-bold text-rose-400 block truncate max-w-[140px]" title="${escapeHtml(req.reject_reason)}">
                                    ${escapeHtml(req.reject_reason || "Rejected")}
                                </span>
                                <span class="text-slate-500 font-mono text-[10px]">${formatDate(req.processed_at)}</span>
                            </div>
                        `;
                    } else {
                        actionHtml = `<span class="text-xs text-slate-500 italic">User Cancelled</span>`;
                    }

                    return `
                        <tr class="hover:bg-white/[0.02] transition border-b border-white/5">
                            <td class="py-4">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-xl bg-slate-800 border border-white/10 text-cyan-400 flex items-center justify-center shrink-0 font-black text-sm">
                                        ${escapeHtml(req.name ? req.name.charAt(0).toUpperCase() : "U")}
                                    </div>
                                    <div class="min-w-0">
                                        <div class="flex items-center gap-2">
                                            <strong class="font-black text-white text-sm truncate">${escapeHtml(req.name)}</strong>
                                            <span class="font-mono text-[11px] font-bold text-slate-400 bg-white/5 px-2 py-0.5 rounded-md">#${escapeHtml(req.client_id)}</span>
                                        </div>
                                        <div class="text-xs text-slate-400 truncate mt-0.5 font-medium">${escapeHtml(req.email || req.mobile || "No Contact")}</div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <div class="text-xs">
                                    <span class="font-bold text-white block">${escapeHtml(req.reason)}</span>
                                    ${req.feedback ? `<span class="text-slate-400 text-[11px] italic mt-0.5 block truncate max-w-xs" title="${escapeHtml(req.feedback)}">"${escapeHtml(req.feedback)}"</span>` : ""}
                                </div>
                            </td>
                            <td>${balanceDisplay}</td>
                            <td>
                                <span class="font-mono text-xs font-semibold text-slate-300 block">${formatDate(req.created_at)}</span>
                            </td>
                            <td>${statusBadge}</td>
                            <td class="text-right">${actionHtml}</td>
                        </tr>
                    `;
                }).join("");
            }

            updateRequestsPagination();

        } catch (err) {
            console.error("Failed to load deletion requests:", err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-10 text-center text-rose-400 font-bold">
                        Failed to load requests: ${escapeHtml(err.message || "Unknown error")}
                    </td>
                </tr>
            `;
        }
    }

    function updateRequestsPagination() {
        const pageInfo = document.getElementById("requestsPageInfo");
        const prevBtn = document.getElementById("requestsPrevBtn");
        const nextBtn = document.getElementById("requestsNextBtn");

        const start = reqState.total === 0 ? 0 : (reqState.page - 1) * reqState.limit + 1;
        const end = Math.min(reqState.page * reqState.limit, reqState.total);

        if (pageInfo) {
            pageInfo.textContent = `Showing ${start} to ${end} of ${reqState.total} requests (Page ${reqState.page} of ${reqState.totalPages})`;
        }

        if (prevBtn) prevBtn.disabled = reqState.page <= 1;
        if (nextBtn) nextBtn.disabled = reqState.page >= reqState.totalPages;
    }

    /* ----------------------------------------------------
       Tab 2: Load Deleted Accounts History (Archive)
    ---------------------------------------------------- */
    async function loadDeletedHistory() {
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
                page: histState.page,
                limit: histState.limit
            };
            if (histState.search) params.search = histState.search;
            if (histState.type) params.type = histState.type;

            const res = await api.request("/users/deleted-accounts", { params });
            const data = (res && (Array.isArray(res.records) || res.stats)) ? res : (res?.data || res || {});
            const records = Array.isArray(data.records) ? data.records : [];
            const stats = data.stats || res?.stats || {};

            histState.total = (typeof data.total === "number") ? data.total : (Number(stats.total_deleted) || records.length);
            histState.totalPages = data.pages || Math.max(1, Math.ceil(histState.total / histState.limit));

            // Update stats
            const totalEl = document.getElementById("statTotalDeleted");
            if (totalEl) totalEl.textContent = Number(stats.total_deleted || 0).toLocaleString();

            // Render Table
            if (records.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="py-12 text-center text-slate-400 font-bold">
                            No deleted account records found in archive.
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
                                <span class="text-xs font-bold text-slate-300 block">${escapeHtml(item.deleted_by_name || "Admin / User")}</span>
                                <span class="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider block mt-0.5">Archived (Safe)</span>
                            </td>
                            <td class="text-right">
                                <span class="font-mono text-xs font-bold text-slate-300 block">${formatDate(item.deleted_at)}</span>
                                <div class="flex items-center justify-end gap-1.5 mt-1.5">
                                    ${item.account_id ? `
                                        <a href="/admin/users/detail?id=${encodeURIComponent(item.account_type === 'sub' && item.parent_user_id ? item.parent_user_id : item.account_id)}" target="_blank" class="admin-btn py-1 px-3 text-xs font-bold text-cyan-300 hover:text-white hover:bg-cyan-500/10 border-cyan-500/30 inline-flex items-center gap-1.5" title="View Full Data in User Profile">
                                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                                            <span>View Data</span>
                                        </a>
                                    ` : ''}
                                </div>
                            </td>
                        </tr>
                    `;
                }).join("");
            }

            updateHistoryPagination();

        } catch (err) {
            console.error("Failed to load deleted history:", err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-10 text-center text-rose-400 font-bold">
                        Failed to load archive logs. Please try again.
                    </td>
                </tr>
            `;
        }
    }

    function updateHistoryPagination() {
        const pageInfo = document.getElementById("pageInfo");
        const prevBtn = document.getElementById("prevBtn");
        const nextBtn = document.getElementById("nextBtn");

        const start = histState.total === 0 ? 0 : (histState.page - 1) * histState.limit + 1;
        const end = Math.min(histState.page * histState.limit, histState.total);

        if (pageInfo) {
            pageInfo.textContent = `Showing ${start} to ${end} of ${histState.total} logs (Page ${histState.page} of ${histState.totalPages})`;
        }

        if (prevBtn) prevBtn.disabled = histState.page <= 1;
        if (nextBtn) nextBtn.disabled = histState.page >= histState.totalPages;
    }

    /* ----------------------------------------------------
       Modals: Approve & Reject Handlers
    ---------------------------------------------------- */
    function openApproveModal(id, name, clientId, reason, inr, usdt) {
        reqState.activeRequestId = id;
        reqState.activeRequestUser = name;

        const targetEl = document.getElementById("approveModalTargetUser");
        const reasonEl = document.getElementById("approveModalReason");
        const walletEl = document.getElementById("approveModalWallet");

        if (targetEl) targetEl.textContent = `${name} (#${clientId})`;
        if (reasonEl) reasonEl.textContent = reason || "Not specified";
        if (walletEl) walletEl.textContent = `${formatCurrency(inr, "₹")} | ${formatCurrency(usdt, "$")} USDT`;

        const modal = document.getElementById("approveModal");
        if (modal) {
            modal.classList.add("open");
            modal.setAttribute("aria-hidden", "false");
        }
    }

    function openRejectModal(id, name, clientId, reason) {
        reqState.activeRequestId = id;
        reqState.activeRequestUser = name;

        const targetEl = document.getElementById("rejectModalTargetUser");
        const reasonEl = document.getElementById("rejectModalReason");
        const inputEl = document.getElementById("rejectReasonInput");

        if (targetEl) targetEl.textContent = `${name} (#${clientId})`;
        if (reasonEl) reasonEl.textContent = reason || "Not specified";
        if (inputEl) inputEl.value = "";

        const modal = document.getElementById("rejectModal");
        if (modal) {
            modal.classList.add("open");
            modal.setAttribute("aria-hidden", "false");
            setTimeout(() => inputEl?.focus(), 80);
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove("open");
            modal.setAttribute("aria-hidden", "true");
        }
        reqState.activeRequestId = null;
        reqState.activeRequestUser = null;
    }

    async function handleConfirmApprove() {
        if (!reqState.activeRequestId) return;
        const confirmBtn = document.getElementById("confirmApproveBtn");

        try {
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.textContent = "Deleting Account...";
            }

            const res = await api.post(`/users/deletion-requests/${reqState.activeRequestId}/approve`);
            closeModal("approveModal");

            if (ui?.toast) {
                ui.toast("Account Deleted", res?.message || "Account permanently wiped.", "success");
            } else {
                alert(res?.message || "Account permanently wiped.");
            }

            loadDeletionRequests();
        } catch (err) {
            console.error("Approve deletion failed:", err);
            if (ui?.toast) {
                ui.toast("Action Failed", err.message || "Failed to approve deletion.", "danger");
            } else {
                alert(err.message || "Failed to approve deletion.");
            }
        } finally {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = "Confirm & Permanently Delete";
            }
        }
    }

    async function handleConfirmReject() {
        if (!reqState.activeRequestId) return;
        const inputEl = document.getElementById("rejectReasonInput");
        const confirmBtn = document.getElementById("confirmRejectBtn");
        const rejectReason = (inputEl?.value || "").trim();

        if (!rejectReason) {
            alert("Please provide a reason for rejecting this request.");
            inputEl?.focus();
            return;
        }

        try {
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.textContent = "Rejecting Request...";
            }

            const res = await api.post(`/users/deletion-requests/${reqState.activeRequestId}/reject`, {
                reason: rejectReason
            });
            closeModal("rejectModal");

            if (ui?.toast) {
                ui.toast("Request Rejected", res?.message || "User account restored to active.", "warning");
            } else {
                alert(res?.message || "User account restored to active.");
            }

            loadDeletionRequests();
        } catch (err) {
            console.error("Reject deletion failed:", err);
            if (ui?.toast) {
                ui.toast("Action Failed", err.message || "Failed to reject deletion.", "danger");
            } else {
                alert(err.message || "Failed to reject deletion.");
            }
        } finally {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = "Confirm & Reject Request";
            }
        }
    }


    async function handleRestoreRequest(requestId, name) {
        try {
            const res = await api.post(`/users/deletion-requests/${requestId}/restore`);
            if (ui?.toast) {
                ui.toast("Account Restored", res?.message || `Account ${name} has been reactivated.`, "success");
            } else {
                alert(res?.message || `Account ${name} has been reactivated.`);
            }
            loadDeletionRequests();
        } catch (err) {
            console.error("Failed to restore account:", err);
            if (ui?.toast) {
                ui.toast("Action Failed", err.message || "Failed to restore account.", "danger");
            } else {
                alert(err.message || "Failed to restore account.");
            }
        }
    }

    async function handleRestoreUser(userId, name) {
        try {
            const res = await api.post(`/users/${userId}/restore-account`);
            if (ui?.toast) {
                ui.toast("Account Restored", res?.message || `Account ${name} has been reactivated.`, "success");
            } else {
                alert(res?.message || `Account ${name} has been reactivated.`);
            }
            loadDeletedHistory();
        } catch (err) {
            console.error("Failed to restore user:", err);
            if (ui?.toast) {
                ui.toast("Action Failed", err.message || "Failed to restore account.", "danger");
            } else {
                alert(err.message || "Failed to restore account.");
            }
        }
    }

    /* ----------------------------------------------------
       Event Listeners Initialization
    ---------------------------------------------------- */
    function initListeners() {
        // Tab switching
        document.getElementById("tabBtnRequests")?.addEventListener("click", () => switchTab("requests"));
        document.getElementById("tabBtnHistory")?.addEventListener("click", () => switchTab("history"));

        // Requests Search & Filter
        const reqSearch = document.getElementById("requestSearch");
        if (reqSearch) {
            reqSearch.addEventListener("input", (e) => {
                clearTimeout(reqState.searchTimer);
                reqState.searchTimer = setTimeout(() => {
                    reqState.search = e.target.value.trim();
                    reqState.page = 1;
                    loadDeletionRequests();
                }, 300);
            });
        }

        const reqStatusFilter = document.getElementById("requestStatusFilter");
        if (reqStatusFilter) {
            reqStatusFilter.addEventListener("change", (e) => {
                reqState.status = e.target.value;
                reqState.page = 1;
                loadDeletionRequests();
            });
        }

        document.getElementById("refreshRequestsBtn")?.addEventListener("click", loadDeletionRequests);

        document.getElementById("requestsPrevBtn")?.addEventListener("click", () => {
            if (reqState.page > 1) {
                reqState.page--;
                loadDeletionRequests();
            }
        });

        document.getElementById("requestsNextBtn")?.addEventListener("click", () => {
            if (reqState.page < reqState.totalPages) {
                reqState.page++;
                loadDeletionRequests();
            }
        });

        // Table Action Buttons (Approve / Reject) Delegation
        document.getElementById("requestsTableBody")?.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-action]");
            if (!btn) return;

            const action = btn.dataset.action;
            const id = btn.dataset.id;
            const name = btn.dataset.name;
            const client = btn.dataset.client;
            const reason = btn.dataset.reason;
            const inr = btn.dataset.inr;
            const usdt = btn.dataset.usdt;

            if (action === "approve") {
                openApproveModal(id, name, client, reason, inr, usdt);
            } else if (action === "reject") {
                openRejectModal(id, name, client, reason);
            } else if (action === "restore-request") {
                if (confirm(`Are you sure you want to restore the account for "${name}"? It will be reactivated immediately.`)) {
                    handleRestoreRequest(id, name);
                }
            }
        });

        // History Table Delegation
        document.getElementById("deletedTableBody")?.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-action]");
            if (!btn) return;

            const action = btn.dataset.action;
            const uid = btn.dataset.uid;
            const name = btn.dataset.name;

            if (action === "restore-user") {
                if (confirm(`Are you sure you want to restore account "${name}"? It will be reactivated immediately.`)) {
                    handleRestoreUser(uid, name);
                }
            }
        });

        // Modal Action Confirmation
        document.getElementById("confirmApproveBtn")?.addEventListener("click", handleConfirmApprove);
        document.getElementById("confirmRejectBtn")?.addEventListener("click", handleConfirmReject);

        // History Search & Filter
        const histSearch = document.getElementById("deletedSearch");
        if (histSearch) {
            histSearch.addEventListener("input", (e) => {
                clearTimeout(histState.searchTimer);
                histState.searchTimer = setTimeout(() => {
                    histState.search = e.target.value.trim();
                    histState.page = 1;
                    loadDeletedHistory();
                }, 300);
            });
        }

        const typeFilter = document.getElementById("deletedTypeFilter");
        if (typeFilter) {
            typeFilter.addEventListener("change", (e) => {
                histState.type = e.target.value;
                histState.page = 1;
                loadDeletedHistory();
            });
        }

        document.getElementById("refreshHistoryBtn")?.addEventListener("click", loadDeletedHistory);

        document.getElementById("prevBtn")?.addEventListener("click", () => {
            if (histState.page > 1) {
                histState.page--;
                loadDeletedHistory();
            }
        });

        document.getElementById("nextBtn")?.addEventListener("click", () => {
            if (histState.page < histState.totalPages) {
                histState.page++;
                loadDeletedHistory();
            }
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        initListeners();
        loadDeletionRequests();
        // Also fetch history stats for the top card
        api.request("/users/deleted-accounts", { params: { page: 1, limit: 1 } })
            .then(res => {
                const stats = res?.stats || res?.data?.stats || {};
                const totalEl = document.getElementById("statTotalDeleted");
                if (totalEl) totalEl.textContent = Number(stats.total_deleted || 0).toLocaleString();
            })
            .catch(() => {});
    });
})();

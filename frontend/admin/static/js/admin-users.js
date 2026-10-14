"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const ui = window.TXAdmin;
    const api = window.TXAdminApi;
    if (!ui || !api || !api.requireAuth()) return;

    const body = document.getElementById("usersTableBody");
    const detail = document.getElementById("userDetailCard");
    let actionModal = document.getElementById("userActionModal");
    let actionTitle = document.getElementById("userActionTitle");
    let actionSubtitle = document.getElementById("userActionSubtitle");
    let actionReason = document.getElementById("userActionReason");
    let actionGraceWrap = document.getElementById("userActionGraceWrap");
    let actionGraceMinutes = document.getElementById("userActionGraceMinutes");
    let actionSuspendDurationWrap = document.getElementById("userActionSuspendDurationWrap");
    let actionSuspendHours = document.getElementById("userActionSuspendHours");
    let actionSuspendNote = document.getElementById("userActionSuspendNote");
    let confirmActionBtn = document.getElementById("confirmUserActionBtn");

    const state = {
        page: 1,
        limit: 10,
        pagination: null,
        users: [],
        pendingAction: null,
        currentUserId: null,
        currentUserName: "",
        detailFinanceRows: []
    };

    const withdrawalPendingStatuses = ["pending", "pending_payout", "pending_admin_approval", "queued"];

    let searchTimer = null;

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function value(id) {
        return document.getElementById(id)?.value?.trim() || "";
    }

    function normalizeUser(item) {
        const id = api.getId(item);
        const wallet = item.wallet || {};
        const main_bal = api.number(item.main_balance ?? wallet.main_wallet?.total_balance ?? 0);
        const trading_bal = api.number(item.trading_balance ?? wallet.trading_wallet?.total_balance ?? wallet.total_balance ?? wallet.balance ?? 0);
        return {
            id,
            client_id: item.client_id || "",
            name: item.name || item.full_name || item.username || "Unknown User",
            email: item.email || "-",
            mobile: item.mobile || item.phone || "",
            country: item.country || item.country_code || "-",
            kyc: item.kyc_status || item.kyc || "pending",
            status: item.account_status || item.status || "active",
            main_balance: main_bal,
            trading_balance: trading_bal,
            total: api.number(item.total_balance ?? (main_bal + trading_bal)),
            joined: api.fmtDate(item.created_at || item.joined_at),
            lastLogin: api.fmtDate(item.last_login_at || item.last_login)
        };
    }

    function normalizeAmount(item) {
        return api.number(item.amount || item.locked_amount || item.withdrawal_amount || item.deposit_amount || item.usdt_amount || item.total || item.notional_value || item.notional);
    }

    function detailSideLabel(row) {
        const raw = String(row.display_side || row.position_side || row.side || "").trim().toLowerCase();
        if (["long", "buy"].includes(raw)) return "BUY";
        if (["short", "sell"].includes(raw)) return "SELL";
        return raw ? raw.toUpperCase() : "-";
    }

    function detailSideClass(row) {
        const side = detailSideLabel(row);
        return side === "BUY" ? "text-emerald-300" : side === "SELL" ? "text-rose-300" : "text-slate-300";
    }

    function detailPnl(row) {
        return api.number(
            row.display_pnl ??
            row.live_unrealized_pnl ??
            row.unrealized_pnl ??
            row.realized_pnl ??
            row.closed_pnl ??
            row.pnl ??
            0
        );
    }

    function detailShortDate(value) {
        if (!value) return "-";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return api.fmtDate(value);
        return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
    }

    function detailStatusLabel(status) {
        const raw = String(status || "-").trim();
        const key = raw.toLowerCase().replace(/[-\s]+/g, "_");
        const labels = {
            active: "Active",
            suspended: "Suspended",
            blocked: "Blocked",
            pending: "Pending",
            approved: "Approved",
            completed: "Completed",
            confirmed: "Completed",
            rejected: "Rejected",
            failed: "Failed",
            cancelled: "Cancelled",
            canceled: "Cancelled",
            open: "Open",
            closed: "Closed",
            queued: "Queued",
            processing: "Processing",
            pending_admin_approval: "Pending Approval",
            pending_payout: "Pending Payout",
            pending_trigger: "Pending Trigger",
            pending_verification: "Pending Verify",
            pending_on_chain: "Pending Chain",
            provider_error: "Provider Error",
            provider_not_configured: "Provider Missing",
            not_checked: "Not Checked",
            under_review: "Under Review",
            review: "Review",
            not_submitted: "Not Submitted"
        };
        return labels[key] || raw.replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
    }

    function detailStatusPill(status) {
        const raw = String(status || "unknown").trim();
        return `<span class="${ui.statusClass(raw)} admin-detail-status" title="${api.escapeHtml(raw)}">${api.escapeHtml(detailStatusLabel(raw))}</span>`;
    }

    function paramsFromFilters() {
        return {
            page: state.page,
            limit: 10,
            search: value("userSearch"),
            status: value("userStatusFilter"),
            kyc_status: value("userKycFilter")
        };
    }

    function renderSummary(data) {
        setText("usersTotal", ui.compact(data.total || 0));
        setText("usersActive", ui.compact(data.active || 0));
        setText("usersSuspended", ui.compact(data.suspended || 0));
        setText("usersBlocked", ui.compact(data.blocked || 0));
        setText("usersNewToday", ui.compact(data.new_today || 0));
        setText("usersWalletTotal", ui.money(data.wallet?.total_balance || 0));
    }

    function renderPagination(pagination) {
        state.pagination = pagination || { page: 1, pages: 1, total: 0, limit: state.limit };
        const page = state.pagination.page || 1;
        const pages = state.pagination.pages || 1;
        const total = state.pagination.total || 0;
        setText("usersPaginationText", `${total.toLocaleString()} users • Page ${page} of ${pages || 1}`);

        const prev = document.getElementById("usersPrevBtn");
        const next = document.getElementById("usersNextBtn");
        if (prev) prev.disabled = !state.pagination.has_prev;
        if (next) next.disabled = !state.pagination.has_next;
    }

    function renderUsers(rows) {
        if (!body) return;
        state.users = rows || [];
        if (!rows.length) {
            body.innerHTML = api.emptyRow(9, "No users found.");
            return;
        }
        body.innerHTML = rows.map(raw => {
            const u = normalizeUser(raw);
            const status = String(u.status || "active").toLowerCase();
            return `
                <tr>
                    <td>
                        <div class="flex items-center gap-3">
                            <div class="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-400/15 font-black text-cyan-200">${ui.initials(u.name)}</div>
                            <div>
                                <div class="font-black text-white">${api.escapeHtml(u.name)}</div>
                                <div class="max-w-[180px] truncate text-xs text-slate-500" title="User ID: ${api.escapeHtml(u.id)}">${api.escapeHtml(u.client_id ? 'ID: ' + u.client_id : u.id)}</div>
                            </div>
                        </div>
                    </td>
                    <td>${api.escapeHtml(u.email)}<div class="text-xs text-slate-500">${api.escapeHtml(u.mobile || "No phone")}</div></td>
                    <td>${detailStatusPill(u.kyc)}</td>
                    <td>${detailStatusPill(status)}</td>
                    <td>${ui.money(u.main_balance)}</td>
                    <td>${ui.money(u.trading_balance)}</td>
                    <td class="font-black text-white">${ui.money(u.total)}</td>
                    <td>${api.escapeHtml(u.joined)}</td>
                    <td class="text-right admin-users-action-cell">
                        <div class="admin-users-actions">
                            <a class="admin-btn py-2" href="/admin/users/detail?id=${encodeURIComponent(u.id)}">View</a>
                            ${status === "active"
                                ? `<button type="button" class="admin-btn py-2" data-inline-action="suspended" data-user-id="${api.escapeHtml(u.id)}">Suspend</button>`
                                : `<button type="button" class="admin-btn admin-btn-success py-2" data-inline-action="active" data-user-id="${api.escapeHtml(u.id)}">Activate</button>`
                            }
                            ${status === "blocked"
                                ? `<button type="button" class="admin-btn py-2" data-inline-action="suspended" data-user-id="${api.escapeHtml(u.id)}">Suspend</button>`
                                : `<button type="button" class="admin-btn admin-btn-danger py-2" data-inline-action="blocked" data-user-id="${api.escapeHtml(u.id)}">Block</button>`
                            }
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function loadSummary() {
        if (!document.getElementById("usersTotal")) return;
        try {
            const data = await api.request("/users/summary");
            renderSummary(data);
        } catch (error) {
            api.showError(error, "Users summary failed.");
        }
    }

    async function loadUsers() {
        if (!body) return;
        api.setLoading(body, 9);
        try {
            const params = paramsFromFilters();
            state.limit = 10;
            const data = await api.request("/users", { params });
            renderUsers(data.users || []);
            renderPagination(data.pagination || {});
        } catch (error) {
            api.showError(error, "Users failed.");
            renderUsers([]);
            renderPagination({ page: 1, pages: 1, total: 0 });
        }
    }

    function ensureUserActionModal() {
        const graceBlockHtml = `
            <div id="userActionGraceWrap" class="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-4">
                <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <label for="userActionGraceMinutes" class="block text-xs font-black uppercase tracking-wide text-amber-200">Warning Time / Grace Time</label>
                        <p class="mt-1 text-xs font-bold leading-5 text-slate-300">Set how many minutes user gets before final Block/Suspend applies.</p>
                    </div>
                    <span class="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100">Required</span>
                </div>
                <div class="grid gap-3 md:grid-cols-[1fr_1.1fr] md:items-center">
                    <div class="relative">
                        <input id="userActionGraceMinutes" type="number" min="1" max="43200" step="1" value="10" class="admin-input pr-20" placeholder="Example: 10" />
                        <span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black uppercase text-slate-500">minutes</span>
                    </div>
                    <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-bold leading-5 text-slate-300">
                        User side will show your reason + countdown. User can buy/sell/close trades before timer ends.
                    </div>
                </div>
                <div id="userActionSuspendDurationWrap" class="mt-4 hidden rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.07] p-4">
                    <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <label for="userActionSuspendHours" class="block text-xs font-black uppercase tracking-wide text-cyan-200">Suspend Duration</label>
                            <p class="mt-1 text-xs font-bold leading-5 text-slate-300">Set how many hours account stays suspended after warning time ends.</p>
                        </div>
                        <span class="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">Default 24h</span>
                    </div>
                    <div class="grid gap-3 md:grid-cols-[1fr_1.1fr] md:items-center">
                        <div class="relative">
                            <input id="userActionSuspendHours" type="number" min="1" max="720" step="1" value="24" class="admin-input pr-16" placeholder="Example: 24" />
                            <span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black uppercase text-slate-500">hours</span>
                        </div>
                        <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-bold leading-5 text-slate-300">
                            Example: 48 hours means user auto-activates after 48 hours.
                        </div>
                    </div>
                </div>
                <p id="userActionSuspendNote" class="mt-3 text-xs font-bold text-amber-100"></p>
            </div>
        `;

        if (!actionModal) {
            const modal = document.createElement("div");
            modal.id = "userActionModal";
            modal.className = "admin-modal";
            modal.setAttribute("aria-hidden", "true");
            modal.innerHTML = `
                <div class="admin-modal-panel p-6">
                    <div class="mb-5 flex items-start justify-between gap-4">
                        <div>
                            <h3 id="userActionTitle" class="text-xl font-black text-white">User Action</h3>
                            <p id="userActionSubtitle" class="mt-1 text-sm text-slate-400">This action will update account access and be saved in audit logs.</p>
                        </div>
                        <button type="button" class="admin-btn" data-user-modal-close>×</button>
                    </div>
                    <label for="userActionReason" class="mb-2 block text-xs font-black uppercase tracking-wide text-slate-400">Reason</label>
                    <textarea id="userActionReason" class="admin-textarea min-h-[120px]" placeholder="Write reason for user warning and audit log..."></textarea>
                    ${graceBlockHtml}
                    <div class="mt-5 flex justify-end gap-3">
                        <button type="button" class="admin-btn" data-user-modal-close>Cancel</button>
                        <button type="button" id="confirmUserActionBtn" class="admin-btn admin-btn-primary">Confirm</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        actionModal = document.getElementById("userActionModal");
        actionTitle = document.getElementById("userActionTitle");
        actionSubtitle = document.getElementById("userActionSubtitle");
        actionReason = document.getElementById("userActionReason");

        // Some pages already contain an older modal in HTML. Upgrade it without deleting the existing modal.
        if (actionModal && !document.getElementById("userActionGraceWrap")) {
            const reasonBox = document.getElementById("userActionReason");
            if (reasonBox) {
                reasonBox.insertAdjacentHTML("afterend", graceBlockHtml);
            }
        }
        if (actionReason && !actionReason.getAttribute("placeholder")) {
            actionReason.setAttribute("placeholder", "Write reason for user warning and audit log...");
        }

        // Upgrade older modals that already have grace minutes but not suspend duration.
        if (document.getElementById("userActionGraceWrap") && !document.getElementById("userActionSuspendDurationWrap")) {
            const suspendNote = document.getElementById("userActionSuspendNote");
            if (suspendNote) {
                suspendNote.insertAdjacentHTML("beforebegin", `
                    <div id="userActionSuspendDurationWrap" class="mt-4 hidden rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.07] p-4">
                        <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <label for="userActionSuspendHours" class="block text-xs font-black uppercase tracking-wide text-cyan-200">Suspend Duration</label>
                                <p class="mt-1 text-xs font-bold leading-5 text-slate-300">Set how many hours account stays suspended after warning time ends.</p>
                            </div>
                            <span class="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">Default 24h</span>
                        </div>
                        <div class="grid gap-3 md:grid-cols-[1fr_1.1fr] md:items-center">
                            <div class="relative">
                                <input id="userActionSuspendHours" type="number" min="1" max="720" step="1" value="24" class="admin-input pr-16" placeholder="Example: 24" />
                                <span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black uppercase text-slate-500">hours</span>
                            </div>
                            <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-bold leading-5 text-slate-300">
                                Example: 48 hours means user auto-activates after 48 hours.
                            </div>
                        </div>
                    </div>
                `);
            }
        }

        actionGraceWrap = document.getElementById("userActionGraceWrap");
        actionGraceMinutes = document.getElementById("userActionGraceMinutes");
        actionSuspendDurationWrap = document.getElementById("userActionSuspendDurationWrap");
        actionSuspendHours = document.getElementById("userActionSuspendHours");
        actionSuspendNote = document.getElementById("userActionSuspendNote");
        confirmActionBtn = document.getElementById("confirmUserActionBtn");
        return Boolean(actionModal && actionTitle && actionSubtitle && actionReason && confirmActionBtn);
    }

    function actionLabel(action) {
        const labels = {
            active: "Activate",
            suspended: "Suspend",
            blocked: "Block",
            force_logout: "Force Logout",
            reset_2fa: "Reset 2FA"
        };
        return labels[action] || String(action || "User Action").replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
    }

    function actionToastLabel(status) {
        const labels = {
            active: "active",
            suspended: "suspended",
            blocked: "blocked"
        };
        return labels[status] || String(status || "updated").replace(/_/g, " ");
    }

    function isRestrictionAction(action) {
        return ["blocked", "suspended"].includes(String(action || "").toLowerCase());
    }

    function getGraceSeconds() {
        const minutes = Number(actionGraceMinutes?.value || 0);
        if (!Number.isFinite(minutes) || minutes <= 0) return 0;
        return Math.round(minutes * 60);
    }

    function getSuspendHours() {
        const hours = Number(actionSuspendHours?.value || 24);
        if (!Number.isFinite(hours) || hours <= 0) return 24;
        return Math.max(1, Math.min(720, Math.round(hours)));
    }

    function formatHours(hours) {
        const value = Number(hours || 0);
        if (!Number.isFinite(value) || value <= 0) return "24h";
        if (value < 24) return `${Math.round(value)}h`;
        const days = Math.floor(value / 24);
        const rest = Math.round(value % 24);
        return rest ? `${days}d ${rest}h` : `${days}d`;
    }

    function formatGrace(minutes) {
        const value = Number(minutes || 0);
        if (!Number.isFinite(value) || value <= 0) return "now";
        if (value < 60) return `${Math.round(value)} min`;
        const hours = Math.floor(value / 60);
        const mins = Math.round(value % 60);
        return mins ? `${hours}h ${mins}m` : `${hours}h`;
    }

    function openActionModal(action, userId, defaultReason = "") {
        if (!ensureUserActionModal()) {
            api.showError(new Error("User action modal is not available."), "User action failed.");
            return;
        }
        const label = actionLabel(action);
        const restriction = isRestrictionAction(action);
        state.pendingAction = { action, userId };
        if (actionTitle) actionTitle.textContent = `${label} User`;
        if (actionSubtitle) {
            if (action === "blocked") {
                actionSubtitle.textContent = "Set reason and grace time. User will see warning countdown, then account will be blocked.";
            } else if (action === "suspended") {
                actionSubtitle.textContent = "Set reason, warning time and suspend duration. User will see countdown, then account will be suspended for selected hours.";
            } else {
                actionSubtitle.textContent = "This will update user status/security and create an audit log.";
            }
        }
        if (actionReason) actionReason.value = defaultReason || `${label} user from TraidiumX Admin Panel.`;
        if (actionGraceWrap) actionGraceWrap.classList.toggle("hidden", !restriction);
        if (actionSuspendDurationWrap) actionSuspendDurationWrap.classList.toggle("hidden", action !== "suspended");
        if (actionGraceMinutes) actionGraceMinutes.value = restriction ? (actionGraceMinutes.value || "10") : "0";
        if (actionSuspendHours) actionSuspendHours.value = action === "suspended" ? (actionSuspendHours.value || "24") : "24";
        if (actionSuspendNote) {
            const hours = action === "suspended" ? getSuspendHours() : 24;
            actionSuspendNote.textContent = action === "suspended"
                ? `After warning time ends, user will be suspended for ${formatHours(hours)} and then auto-active.`
                : action === "blocked"
                    ? "After warning time ends, user will be blocked until admin activates the account."
                    : "";
        }
        actionModal.classList.add("open");
        actionModal.setAttribute("aria-hidden", "false");
        setTimeout(() => actionReason?.focus(), 80);
    }

    function closeActionModal() {
        actionModal?.classList.remove("open");
        actionModal?.setAttribute("aria-hidden", "true");
        state.pendingAction = null;
    }

    async function updateUserStatus(userId, status, reason, triggerButton = null, options = {}) {
        const statusLabel = actionToastLabel(status);
        const restriction = isRestrictionAction(status);
        const graceSeconds = Number(options.grace_seconds || 0);
        const suspendHours = Number(options.suspend_hours || 24);
        const graceMinutes = Math.round(graceSeconds / 60);
        try {
            if (triggerButton) {
                triggerButton.disabled = true;
                triggerButton.dataset.originalText = triggerButton.textContent;
                triggerButton.textContent = "Updating...";
            }
            ui.toast(
                restriction && graceSeconds > 0 ? "Scheduling User Restriction" : "Updating User",
                restriction && graceSeconds > 0
                    ? status === "suspended"
                        ? `User will be ${statusLabel} after ${formatGrace(graceMinutes)} for ${formatHours(suspendHours)}.`
                        : `User will be ${statusLabel} after ${formatGrace(graceMinutes)}.`
                    : `Changing user status to ${statusLabel}.`,
                "info"
            );
            await api.request(`/users/${encodeURIComponent(userId)}/status`, {
                method: "PATCH",
                body: {
                    status,
                    reason: reason || `User ${statusLabel} from TraidiumX Admin Panel.`,
                    grace_seconds: restriction ? graceSeconds : 0,
                    suspend_hours: status === "suspended" ? suspendHours : null
                }
            });
            ui.toast(
                restriction && graceSeconds > 0 ? "Restriction Scheduled" : "User Updated",
                restriction && graceSeconds > 0
                    ? `User can trade/close for ${formatGrace(graceMinutes)}, then account will be ${statusLabel}.`
                    : `User is now ${statusLabel}.`,
                "success"
            );
            await Promise.all([loadSummary(), loadUsers()]);
            if (detail) await loadUserDetail(userId);
        } catch (error) {
            api.showError(error, "User status update failed.");
        } finally {
            if (triggerButton) {
                triggerButton.disabled = false;
                triggerButton.textContent = triggerButton.dataset.originalText || triggerButton.textContent;
            }
        }
    }

    async function runSecurityAction(userId, action, reason) {
        const endpoint = action === "force_logout" ? "force-logout" : "reset-2fa";
        const title = action === "force_logout" ? "Force Logout" : "Reset 2FA";
        try {
            ui.toast(title, "Processing security action...", "info");
            await api.request(`/users/${encodeURIComponent(userId)}/${endpoint}`, {
                method: "POST",
                body: { reason: reason || title }
            });
            ui.toast(title, "Action completed and logged.", "success");
            if (detail) await loadUserDetail(userId);
        } catch (error) {
            api.showError(error, `${title} failed.`);
        }
    }

    function detailRow(label, value) {
        return `<div class="flex justify-between gap-4 rounded-2xl bg-white/[0.04] p-4"><span class="text-slate-400">${api.escapeHtml(label)}</span><b class="text-right text-white">${api.escapeHtml(value || "-")}</b></div>`;
    }

    function renderTableRows(tbodyId, rows, columns, emptyMessage) {
        const target = document.getElementById(tbodyId);
        if (!target) return;
        if (!rows.length) {
            target.innerHTML = api.emptyRow(columns.length, emptyMessage);
            return;
        }
        target.innerHTML = rows.map(row => `
            <tr>${columns.map(fn => `<td>${fn(row)}</td>`).join("")}</tr>
        `).join("");
    }

    function renderAudit(rows) {
        const target = document.getElementById("detailAuditList");
        if (!target) return;
        if (!rows.length) {
            target.innerHTML = `<div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-slate-400">No audit logs found for this user.</div>`;
            return;
        }
        target.innerHTML = rows.map(log => `
            <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <b class="text-white">${api.escapeHtml(log.action || "audit")}</b>
                    <span class="text-xs font-bold text-slate-500">${api.escapeHtml(api.fmtDate(log.created_at))}</span>
                </div>
                <p class="mt-2 text-sm text-slate-400">${api.escapeHtml(log.message || "-")}</p>
                <p class="mt-1 text-xs font-bold text-cyan-300">${api.escapeHtml(log.admin_email || "system")}</p>
            </div>
        `).join("");
    }

    function financeHistoryDate(row) {
        return row.approved_at || row.completed_at || row.rejected_at || row.cancelled_at || row.updated_at || row.created_at || "";
    }

    function financeHistoryTime(row) {
        const value = financeHistoryDate(row);
        const time = new Date(value || 0).getTime();
        return Number.isFinite(time) ? time : 0;
    }


    function financeRecordId(row) {
        return api.getId(row) || row.withdrawal_id || row.withdrawal_reference || row.reference || "";
    }

    function isPendingWithdrawal(row) {
        if (String(row?.tx_type || "").toLowerCase() !== "withdrawal") return false;
        const status = String(row?.status || "").trim().toLowerCase();
        return withdrawalPendingStatuses.includes(status);
    }

    function financeWithdrawalSummary(id) {
        const row = (state.detailFinanceRows || []).find(item => String(financeRecordId(item)) === String(id));
        if (!row) return null;
        return {
            id: financeRecordId(row),
            reference: row.withdrawal_reference || row.reference || financeRecordId(row),
            user: row.user_name || row.name || row.full_name || row.email || "Selected user",
            email: row.email || "",
            amount: normalizeAmount(row),
            asset: row.currency || row.crypto_asset || row.asset || "USDT",
            network: row.crypto_network || row.network || "-",
            account: row.withdrawal_address || row.account || row.destination || row.bank_account || row.upi_id || "-",
            status: row.status || "pending",
            remark: row.remark || row.admin_note || row.reject_reason || "",
            txHash: row.tx_hash || row.payout_reference || ""
        };
    }

    function financeActionCell(row) {
        if (!isPendingWithdrawal(row)) return `<span class="text-xs font-black text-slate-500">—</span>`;
        const id = financeRecordId(row);
        if (!id) return `<span class="text-xs font-black text-slate-500">—</span>`;
        return `
            <div class="admin-detail-finance-actions">
                <button type="button" class="admin-btn admin-btn-success" data-user-withdraw-action="approve" data-withdrawal-id="${api.escapeHtml(id)}">Approve</button>
                <button type="button" class="admin-btn admin-btn-danger" data-user-withdraw-action="reject" data-withdrawal-id="${api.escapeHtml(id)}">Reject</button>
            </div>
        `;
    }

    function injectUserWithdrawalDecisionStyles() {
        if (document.getElementById("txUserWithdrawalDecisionStyles")) return;
        const style = document.createElement("style");
        style.id = "txUserWithdrawalDecisionStyles";
        style.textContent = `
            .tx-user-withdrawal-backdrop {
                position: fixed;
                inset: 0;
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 18px;
                background: rgba(2, 6, 23, 0.78);
                backdrop-filter: blur(12px);
            }
            .tx-user-withdrawal-modal {
                width: min(560px, 100%);
                border-radius: 28px;
                border: 1px solid rgba(148, 163, 184, 0.24);
                background: linear-gradient(180deg, #101827, #060a14);
                box-shadow: 0 28px 90px rgba(0, 0, 0, 0.62);
                padding: 26px;
                color: #e5e7eb;
            }
            .tx-user-withdrawal-head { display: flex; gap: 16px; align-items: flex-start; }
            .tx-user-withdrawal-icon {
                width: 54px;
                height: 54px;
                flex: 0 0 54px;
                border-radius: 18px;
                display: grid;
                place-items: center;
                font-size: 24px;
                font-weight: 900;
                color: #67e8f9;
                background: rgba(34, 211, 238, 0.12);
                border: 1px solid rgba(34, 211, 238, 0.25);
            }
            .tx-user-withdrawal-icon.approve { color: #86efac; background: rgba(34, 197, 94, 0.12); border-color: rgba(34, 197, 94, 0.28); }
            .tx-user-withdrawal-icon.reject { color: #fca5a5; background: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.30); }
            .tx-user-withdrawal-title { margin: 0; font-size: 22px; line-height: 1.15; font-weight: 900; letter-spacing: -0.03em; color: #fff; }
            .tx-user-withdrawal-message { margin: 8px 0 0; color: #94a3b8; line-height: 1.55; font-size: 14px; }
            .tx-user-withdrawal-summary { margin-top: 18px; display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
            .tx-user-withdrawal-box { border-radius: 18px; border: 1px solid rgba(148, 163, 184, 0.14); background: rgba(255,255,255,0.04); padding: 12px; }
            .tx-user-withdrawal-box span { display:block; color:#64748b; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.12em; }
            .tx-user-withdrawal-box strong { display:block; margin-top:5px; color:#f8fafc; font-size:13px; font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .tx-user-withdrawal-address { margin-top:14px; border-radius:20px; border:1px solid rgba(34,211,238,.24); background:linear-gradient(135deg,rgba(8,47,73,.52),rgba(15,23,42,.72)); padding:13px; }
            .tx-user-withdrawal-address-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:9px; }
            .tx-user-withdrawal-address-head span { color:#67e8f9; font-size:11px; font-weight:900; letter-spacing:.12em; text-transform:uppercase; }
            .tx-user-withdrawal-copy { border:1px solid rgba(103,232,249,.35); border-radius:999px; background:rgba(8,145,178,.12); color:#e0f2fe; padding:8px 12px; font-size:12px; font-weight:900; cursor:pointer; }
            .tx-user-withdrawal-copy.copied { border-color:rgba(52,211,153,.45); background:rgba(16,185,129,.16); color:#bbf7d0; }
            .tx-user-withdrawal-copy-status { display:none; margin-top:8px; border-radius:12px; border:1px solid rgba(52,211,153,.28); background:rgba(6,78,59,.22); color:#bbf7d0; padding:8px 10px; font-size:12px; font-weight:900; }
            .tx-user-withdrawal-address-value { width:100%; min-height:44px; border-radius:15px; border:1px solid rgba(148,163,184,.20); background:rgba(2,6,23,.56); color:#fff; padding:12px 13px; font-size:13px; font-weight:900; line-height:1.45; word-break:break-all; text-align:left; }
            .tx-user-withdrawal-address-note { margin-top:8px; color:#cbd5e1; font-size:12px; font-weight:700; line-height:1.5; }
            .tx-user-withdrawal-field { margin-top: 14px; }
            .tx-user-withdrawal-label { display:block; margin-bottom:7px; color:#94a3b8; font-size:12px; font-weight:900; }
            .tx-user-withdrawal-input, .tx-user-withdrawal-textarea {
                width: 100%;
                border-radius: 16px;
                border: 1px solid rgba(148, 163, 184, 0.18);
                background: rgba(15, 23, 42, 0.72);
                color: #fff;
                outline: none;
                padding: 13px 14px;
                font-size: 14px;
                font-weight: 700;
            }
            .tx-user-withdrawal-textarea { min-height: 105px; resize: vertical; }
            .tx-user-withdrawal-error { display:none; margin-top:10px; border-radius:14px; border:1px solid rgba(244,63,94,.26); background:rgba(244,63,94,.12); color:#fecdd3; padding:10px 12px; font-size:12px; font-weight:800; }
            .tx-user-withdrawal-actions { display:flex; justify-content:flex-end; gap:12px; margin-top:22px; }
            .tx-user-withdrawal-btn { border:0; border-radius:15px; padding:12px 18px; font-size:13px; font-weight:900; cursor:pointer; }
            .tx-user-withdrawal-btn.cancel { color:#cbd5e1; background:rgba(148,163,184,.12); border:1px solid rgba(148,163,184,.20); }
            .tx-user-withdrawal-btn.approve { color:#052e16; background:linear-gradient(135deg,#86efac,#22c55e); }
            .tx-user-withdrawal-btn.reject { color:#fff; background:linear-gradient(135deg,#fb7185,#f97316); }
            @media (max-width: 620px) {
                .tx-user-withdrawal-modal { padding: 22px; border-radius: 22px; }
                .tx-user-withdrawal-summary { grid-template-columns: 1fr; }
                .tx-user-withdrawal-actions { flex-direction: column-reverse; }
                .tx-user-withdrawal-btn { width: 100%; }
            }
            body.admin-light-mode .tx-user-withdrawal-modal {
                background: #ffffff;
                border-color: #cbd5e1;
                color: #0f172a;
                box-shadow: 0 28px 90px rgba(0, 0, 0, 0.11);
            }
            body.admin-light-mode .tx-user-withdrawal-title {
                color: #0f172a;
            }
            body.admin-light-mode .tx-user-withdrawal-message {
                color: #475569;
            }
            body.admin-light-mode .tx-user-withdrawal-box {
                border-color: #cbd5e1;
                background: #f8fafc;
            }
            body.admin-light-mode .tx-user-withdrawal-box span {
                color: #64748b;
            }
            body.admin-light-mode .tx-user-withdrawal-box strong {
                color: #0f172a;
            }
            body.admin-light-mode .tx-user-withdrawal-address {
                border-color: #cbd5e1;
                background: linear-gradient(135deg, #f0f9ff, #f8fafc);
            }
            body.admin-light-mode .tx-user-withdrawal-address-head span {
                color: #0891b2;
            }
            body.admin-light-mode .tx-user-withdrawal-copy {
                border-color: #cbd5e1;
                background: #f1f5f9;
                color: #0f172a;
            }
            body.admin-light-mode .tx-user-withdrawal-copy:hover {
                background: #e2e8f0;
            }
            body.admin-light-mode .tx-user-withdrawal-copy.copied {
                border-color: #86efac;
                background: #f0fdf4;
                color: #166534;
            }
            body.admin-light-mode .tx-user-withdrawal-copy-status {
                border-color: #86efac;
                background: #f0fdf4;
                color: #166534;
            }
            body.admin-light-mode .tx-user-withdrawal-address-value {
                border-color: #cbd5e1;
                background: #ffffff;
                color: #0f172a;
            }
            body.admin-light-mode .tx-user-withdrawal-address-note {
                color: #475569;
            }
            body.admin-light-mode .tx-user-withdrawal-label {
                color: #475569;
            }
            body.admin-light-mode .tx-user-withdrawal-input,
            body.admin-light-mode .tx-user-withdrawal-textarea {
                border-color: #cbd5e1;
                background: #ffffff;
                color: #0f172a;
            }
            body.admin-light-mode .tx-user-withdrawal-btn.cancel {
                color: #0f172a;
                background: #f1f5f9;
                border-color: #cbd5e1;
            }
            body.admin-light-mode .tx-user-withdrawal-btn.cancel:hover {
                background: #e2e8f0;
            }
        `;
        document.head.appendChild(style);
    }

    function openUserWithdrawalDecisionModal({ action, withdrawal }) {
        injectUserWithdrawalDecisionStyles();
        return new Promise(resolve => {
            const existing = document.getElementById("txUserWithdrawalDecisionModal");
            if (existing) existing.remove();

            const isApprove = action === "approve";
            const withdrawalAddress = String(withdrawal?.account || withdrawal?.withdrawal_address || withdrawal?.destination || "").trim();
            const withdrawalAddressLabel = withdrawalAddress || "-";
            const modal = document.createElement("div");
            modal.id = "txUserWithdrawalDecisionModal";
            modal.innerHTML = `
                <div class="tx-user-withdrawal-backdrop">
                    <div class="tx-user-withdrawal-modal" role="dialog" aria-modal="true">
                        <div class="tx-user-withdrawal-head">
                            <div class="tx-user-withdrawal-icon ${isApprove ? "approve" : "reject"}">${isApprove ? "✓" : "!"}</div>
                            <div>
                                <h3 class="tx-user-withdrawal-title">${isApprove ? "Approve Withdrawal?" : "Reject Withdrawal?"}</h3>
                                <p class="tx-user-withdrawal-message">${isApprove ? "This will approve from the user detail page and final-debit the already locked withdrawal amount." : "This will reject from the user detail page and release the locked amount back to the user's wallet."}</p>
                            </div>
                        </div>
                        <div class="tx-user-withdrawal-summary">
                            <div class="tx-user-withdrawal-box"><span>Reference</span><strong title="${api.escapeHtml(withdrawal?.reference || withdrawal?.id || "-")}">${api.escapeHtml(withdrawal?.reference || withdrawal?.id || "-")}</strong></div>
                            <div class="tx-user-withdrawal-box"><span>Amount</span><strong>${api.escapeHtml(withdrawal?.asset || "USDT")} ${api.number(withdrawal?.amount || 0).toLocaleString()}</strong></div>
                            <div class="tx-user-withdrawal-box"><span>Network</span><strong>${api.escapeHtml(withdrawal?.network || "-")}</strong></div>
                        </div>
                        ${isApprove ? `
                            <div class="tx-user-withdrawal-address">
                                <div class="tx-user-withdrawal-address-head">
                                    <span>User Withdrawal Address</span>
                                    <button type="button" class="tx-user-withdrawal-copy" data-copy="${api.escapeHtml(withdrawalAddressLabel)}">Copy Address</button>
                                </div>
                                <div class="tx-user-withdrawal-address-value" title="${api.escapeHtml(withdrawalAddressLabel)}">${api.escapeHtml(withdrawalAddressLabel)}</div>
                                <div id="txUserWithdrawalCopyStatus" class="tx-user-withdrawal-copy-status">Address copied successfully.</div>
                                <div class="tx-user-withdrawal-address-note">Send payout only to this user address on ${api.escapeHtml(withdrawal?.network || "selected")} network. After sending, paste payout TX hash below.</div>
                            </div>
                            <div class="tx-user-withdrawal-field">
                                <label class="tx-user-withdrawal-label">Payout reference / TX hash optional</label>
                                <input id="txUserWithdrawalPayoutInput" class="tx-user-withdrawal-input" value="${api.escapeHtml(withdrawal?.txHash || "")}" placeholder="Paste TX hash or payout reference after payout" />
                            </div>
                        ` : ""}
                        <div class="tx-user-withdrawal-field">
                            <label class="tx-user-withdrawal-label">${isApprove ? "Approval note" : "Reject reason"}</label>
                            <textarea id="txUserWithdrawalReasonInput" class="tx-user-withdrawal-textarea" placeholder="${isApprove ? "Approved by admin from user detail." : "Enter reason for rejecting this withdrawal"}">${api.escapeHtml(isApprove ? (withdrawal?.remark || "Approved by admin from user detail.") : (withdrawal?.remark || ""))}</textarea>
                            <div id="txUserWithdrawalModalError" class="tx-user-withdrawal-error">Reject reason is required.</div>
                        </div>
                        <div class="tx-user-withdrawal-actions">
                            <button type="button" class="tx-user-withdrawal-btn cancel" id="txUserWithdrawalCancelBtn">Cancel</button>
                            <button type="button" class="tx-user-withdrawal-btn ${isApprove ? "approve" : "reject"}" id="txUserWithdrawalConfirmBtn">${isApprove ? "Yes, Approve" : "Yes, Reject"}</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            function close(value) {
                modal.remove();
                document.removeEventListener("keydown", escHandler);
                resolve(value);
            }
            function escHandler(event) {
                if (event.key === "Escape") close(null);
            }
            document.addEventListener("keydown", escHandler);

            modal.querySelector("#txUserWithdrawalCancelBtn")?.addEventListener("click", () => close(null));
            modal.querySelector(".tx-user-withdrawal-backdrop")?.addEventListener("click", event => {
                if (event.target.classList.contains("tx-user-withdrawal-backdrop")) close(null);
            });

            async function copyUserWithdrawalAddress(button) {
                const text = String(button?.dataset.copy || "").trim();
                if (!text || text === "-") return;
                try {
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(text);
                    } else {
                        const temp = document.createElement("textarea");
                        temp.value = text;
                        temp.setAttribute("readonly", "");
                        temp.style.position = "fixed";
                        temp.style.left = "-9999px";
                        document.body.appendChild(temp);
                        temp.select();
                        document.execCommand("copy");
                        temp.remove();
                    }
                    const status = modal.querySelector("#txUserWithdrawalCopyStatus");
                    const original = button.dataset.originalText || button.textContent || "Copy Address";
                    button.dataset.originalText = original;
                    button.textContent = "Copied ✓";
                    button.classList.add("copied");
                    if (status) {
                        status.textContent = "Address copied successfully.";
                        status.style.display = "block";
                    }
                    setTimeout(() => {
                        if (!document.body.contains(modal)) return;
                        button.textContent = button.dataset.originalText || "Copy Address";
                        button.classList.remove("copied");
                    }, 1600);
                } catch (error) {
                    const status = modal.querySelector("#txUserWithdrawalCopyStatus");
                    if (status) {
                        status.textContent = "Copy failed. Please select and copy address manually.";
                        status.style.display = "block";
                    }
                }
            }

            modal.querySelector(".tx-user-withdrawal-copy")?.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                copyUserWithdrawalAddress(event.currentTarget);
            });

            modal.querySelector("#txUserWithdrawalConfirmBtn")?.addEventListener("click", () => {
                const reasonInput = modal.querySelector("#txUserWithdrawalReasonInput");
                const payoutInput = modal.querySelector("#txUserWithdrawalPayoutInput");
                const reason = String(reasonInput?.value || "").trim();
                const payoutReference = String(payoutInput?.value || "").trim();
                const errorBox = modal.querySelector("#txUserWithdrawalModalError");

                if (!isApprove && !reason) {
                    if (errorBox) errorBox.style.display = "block";
                    reasonInput?.focus();
                    return;
                }

                close({
                    reason: reason || (isApprove ? "Approved by admin from user detail." : "Rejected by admin from user detail."),
                    payoutReference
                });
            });
            setTimeout(() => modal.querySelector("#txUserWithdrawalReasonInput")?.focus(), 50);
        });
    }

    function setFinanceDecisionBusy(id, action, busy) {
        document.querySelectorAll(`[data-user-withdraw-action][data-withdrawal-id="${CSS.escape(String(id))}"]`).forEach(button => {
            button.disabled = busy;
            button.classList.toggle("opacity-60", busy);
            button.classList.toggle("cursor-not-allowed", busy);
            if (button.dataset.userWithdrawAction === action) {
                if (busy) {
                    button.dataset.originalText = button.textContent;
                    button.textContent = action === "approve" ? "Approving..." : "Rejecting...";
                } else if (button.dataset.originalText) {
                    button.textContent = button.dataset.originalText;
                    delete button.dataset.originalText;
                }
            }
        });
    }

    async function decideFinanceWithdrawal(id, action) {
        const withdrawal = financeWithdrawalSummary(id);
        const modalResult = await openUserWithdrawalDecisionModal({ action, withdrawal });
        if (!modalResult) return;

        const reason = modalResult.reason || (action === "approve" ? "Approved by admin from user detail." : "Rejected by admin from user detail.");
        const payoutReference = modalResult.payoutReference || "";
        ui.toast(action === "approve" ? "Approving Withdrawal" : "Rejecting Withdrawal", `Request ${id} is being processed...`, "info");
        setFinanceDecisionBusy(id, action, true);
        try {
            const body = action === "approve"
                ? { remark: reason, payout_reference: payoutReference, tx_hash: payoutReference }
                : { reason };
            const response = await api.request(`/withdrawals/${encodeURIComponent(id)}/${action}`, { method: "POST", body });
            const doneMessage = response?.withdrawal?.user_status_message || (action === "approve"
                ? "Withdrawal approved and locked amount final-debited."
                : "Withdrawal rejected and locked amount released.");
            ui.toast(action === "approve" ? "Withdrawal Approved" : "Withdrawal Rejected", doneMessage, action === "approve" ? "success" : "danger");
            if (state.currentUserId) await loadUserDetail(state.currentUserId);
        } catch (error) {
            api.showError(error, `Withdrawal ${action} failed.`);
        } finally {
            setFinanceDecisionBusy(id, action, false);
        }
    }

    async function loadUserDetail(userId) {
        if (!detail) return;
        state.currentUserId = userId;
        detail.innerHTML = `<div class="py-10 text-center text-sm font-bold text-slate-400">Loading user detail...</div>`;
        ["detailWalletCard", "detailSecurityCard"].forEach(id => setText(id, ""));
        const mt5CredsCard = document.getElementById("detailMt5CredentialsCard");
        if (mt5CredsCard) {
            mt5CredsCard.classList.add("hidden");
            mt5CredsCard.innerHTML = "";
        }
        try {
            const data = await api.request(`/users/${encodeURIComponent(userId)}`);
            const u = normalizeUser(data.user || {});
            const summary = data.summary || {};
            const wallet = data.wallet || {};
            const mt5Account = data.mt5_account || {};
            const status = String(u.status || "active").toLowerCase();
            state.currentUserName = u.name || data.user?.email || userId;
            const pnl = api.number(summary.futures_pnl || 0);

            setText("detailWalletTotal", ui.money(summary.wallet_total || u.total));
            setText("detailTotalDeposit", ui.money(summary.total_deposit || 0));
            setText("detailTotalWithdrawal", ui.money(summary.total_withdrawal || 0));
            setText("detailFuturesPnl", `${pnl >= 0 ? "+" : ""}${ui.money(pnl)}`);
            const pnlEl = document.getElementById("detailFuturesPnl");
            if (pnlEl) pnlEl.className = `mt-3 text-2xl font-black ${pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`;

            detail.innerHTML = `
                <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div class="flex items-center gap-4">
                        <div class="grid h-20 w-20 shrink-0 place-items-center rounded-[1.6rem] bg-gradient-to-br from-cyan-300 to-blue-500 text-2xl font-black text-slate-950">${ui.initials(u.name)}</div>
                        <div>
                            <h2 class="text-2xl font-black text-white">${api.escapeHtml(u.name)}</h2>
                            <p class="mt-1 text-sm font-semibold text-slate-400">${api.escapeHtml(u.email)}${u.client_id ? ' • ID: ' + api.escapeHtml(u.client_id) : ''}</p>
                            <p class="mt-1 text-sm font-semibold text-slate-500">${api.escapeHtml(u.mobile || "No phone")} • ${api.escapeHtml(u.country)}</p>
                            ${data.parent_user ? `
                            <p class="mt-1.5 text-xs font-bold text-cyan-400">
                                🔗 Sub-Account of 
                                <button type="button" class="underline hover:text-cyan-300" id="parentUserJumpBtn" data-parent-id="${data.parent_user.id}">
                                    ${api.escapeHtml(data.parent_user.name)} (ID: ${api.escapeHtml(data.parent_user.client_id)})
                                </button>
                            </p>
                            ` : ''}
                            <div class="mt-3 flex flex-wrap gap-2">${detailStatusPill(status)}<span class="${ui.statusClass(u.kyc)} admin-detail-status" title="KYC ${api.escapeHtml(u.kyc)}">KYC ${api.escapeHtml(detailStatusLabel(u.kyc))}</span></div>
                        </div>
                    </div>
                    <div class="grid gap-3 sm:grid-cols-3">
                        <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p class="text-xs text-slate-400">Open Orders</p><h3 class="text-xl font-black text-white">${api.number(summary.open_orders || 0)}</h3></div>
                        <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p class="text-xs text-slate-400">Open Positions</p><h3 class="text-xl font-black text-white">${api.number(summary.open_positions || 0)}</h3></div>
                        <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p class="text-xs text-slate-400">Joined</p><h3 class="text-sm font-black text-white">${api.escapeHtml(u.joined)}</h3></div>
                    </div>
                </div>
            `;

            // Bind parent jump button click handler
            const parentBtn = document.getElementById("parentUserJumpBtn");
            if (parentBtn) {
                parentBtn.addEventListener("click", () => {
                    const parentId = parentBtn.dataset.parentId;
                    loadUserDetail(parentId);
                });
            }

            // Render sub-accounts table
            const subAccountsCard = document.getElementById("detailSubAccountsCard");
            const subAccountsBody = document.getElementById("detailSubAccountsBody");
            
            if (subAccountsCard && subAccountsBody) {
                const subs = data.sub_accounts || [];
                if (subs.length > 0) {
                    subAccountsCard.classList.remove("hidden");
                    let html = "";
                    subs.forEach(sub => {
                        const w = sub.wallet || { available_balance: 0, locked_balance: 0, total_balance: 0 };
                        html += `
                            <tr class="hover:bg-white/[0.02] cursor-pointer" data-sub-id="${api.escapeHtml(sub.id)}" title="Double click to view details">
                                <td class="py-3 font-semibold text-white">${api.escapeHtml(sub.name)}</td>
                                <td class="py-3 font-mono text-slate-300">${api.escapeHtml(sub.client_id)}</td>
                                <td class="py-3 text-cyan-300 font-bold">${ui.money(w.available_balance)}</td>
                                <td class="py-3 text-slate-400 font-bold">${ui.money(w.locked_balance)}</td>
                                <td class="py-3 text-white font-black">${ui.money(w.total_balance)}</td>
                            </tr>
                        `;
                    });
                    subAccountsBody.innerHTML = html;
                    
                    // Bind double click handler
                    subAccountsBody.querySelectorAll("tr").forEach(tr => {
                        tr.addEventListener("dblclick", () => {
                            const subId = tr.dataset.subId;
                            loadUserDetail(subId);
                        });
                    });
                } else {
                    subAccountsCard.classList.add("hidden");
                    subAccountsBody.innerHTML = "";
                }
            }

            const topActions = document.getElementById("userDetailTopActions");
            if (topActions) {
                topActions.innerHTML = `
                    <button class="admin-btn admin-btn-success" data-detail-action="active" data-user-id="${api.escapeHtml(u.id)}">Mark Active</button>
                    <button class="admin-btn" data-detail-action="suspended" data-user-id="${api.escapeHtml(u.id)}">Suspend</button>
                    <button class="admin-btn admin-btn-danger" data-detail-action="blocked" data-user-id="${api.escapeHtml(u.id)}">Block</button>
                    <button class="admin-btn" data-detail-action="force_logout" data-user-id="${api.escapeHtml(u.id)}">Force Logout</button>
                    <button class="admin-btn" data-detail-action="reset_2fa" data-user-id="${api.escapeHtml(u.id)}">Reset 2FA</button>
                    <div class="admin-detail-export-group" aria-label="User export actions">
                        <button class="admin-btn admin-detail-export-btn admin-detail-export-excel" data-user-detail-export="xlsx">Excel</button>
                        <button class="admin-btn admin-detail-export-btn admin-detail-export-pdf" data-user-detail-export="pdf">PDF</button>
                    </div>
                `;
            }

            const walletCard = document.getElementById("detailWalletCard");
            if (walletCard) {
                const mainWallet = wallet.main_wallet || {};
                const tradingWallet = wallet.trading_wallet || {};
                
                const mainAvail = api.number(mainWallet.available_balance ?? 0);
                const mainLocked = api.number(mainWallet.locked_balance ?? 0);
                const mainTotal = api.number(mainWallet.total_balance ?? (mainAvail + mainLocked));

                const tradingAvail = api.number(tradingWallet.available_balance ?? wallet.available_balance ?? 0);
                const tradingLocked = api.number(tradingWallet.locked_balance ?? wallet.locked_balance ?? 0);
                const tradingTotal = api.number(tradingWallet.total_balance ?? (tradingAvail + tradingLocked));

                walletCard.innerHTML = `
                    <h3 class="text-xl font-black text-white">Wallet Summary</h3>
                    <div class="mt-5 space-y-3">
                        <div class="border-b border-white/5 pb-2 mb-2">
                            <span class="text-xs font-bold uppercase tracking-wider text-emerald-400">Main Wallet</span>
                            ${detailRow("Main Available", ui.money(mainAvail))}
                            ${detailRow("Main Locked", ui.money(mainLocked))}
                            ${detailRow("Main Total", ui.money(mainTotal))}
                        </div>
                        <div class="border-b border-white/5 pb-2 mb-2">
                            <span class="text-xs font-bold uppercase tracking-wider text-cyan-400">Trading Wallet</span>
                            ${detailRow("Trading Available", ui.money(tradingAvail))}
                            ${detailRow("Trading Locked", ui.money(tradingLocked))}
                            ${detailRow("Trading Total", ui.money(tradingTotal))}
                        </div>
                        <div>
                            <span class="text-xs font-bold uppercase tracking-wider text-purple-400">Combined Total</span>
                            ${detailRow("Combined Total Assets", ui.money(mainTotal + tradingTotal))}
                        </div>
                        ${detailRow("Wallet Updated", api.fmtDate(wallet.updated_at))}
                    </div>
                `;
            }

            const securityCard = document.getElementById("detailSecurityCard");
            if (securityCard) {
                securityCard.innerHTML = `
                    <h3 class="text-xl font-black text-white">Security & Account</h3>
                    <div class="mt-5 space-y-3">
                        ${detailRow("Account Status", detailStatusLabel(status))}
                        ${detailRow("KYC Status", detailStatusLabel(u.kyc))}
                        ${detailRow("Trading Platform", data.user?.selected_platform_name || (data.user?.selected_platform === "mt5" ? "MetaTrader 5" : data.user?.selected_platform === "traidiumx" ? "TraidiumX" : "Not selected"))}
                        ${detailRow("Preferred Plan", data.user?.preferred_plan_name || detailStatusLabel(data.user?.preferred_plan || "Not selected"))}
                        ${detailRow("Active Plan", data.user?.active_plan_name || detailStatusLabel(data.user?.active_plan || "Not active"))}
                        ${detailRow("Active Spread", `${api.number(data.user?.active_spread_pips || 0)} pips`)}
                        ${data.user?.selected_platform === "mt5" ? detailRow("MT5 Status", detailStatusLabel(mt5Account.status || mt5Account.connection_status || "Not created")) : ""}
                        ${data.user?.selected_platform === "mt5" ? detailRow("MT5 Login", mt5Account.login_id_masked || (mt5Account.login_id ? `******${String(mt5Account.login_id).slice(-4)}` : "-")) : ""}
                        ${data.user?.selected_platform === "mt5" ? detailRow("MT5 Server", mt5Account.server || "-") : ""}
                        ${detailRow("Last Login", u.lastLogin)}
                        ${detailRow("Status Reason", data.user?.account_status_reason || data.user?.suspend_reason || data.user?.blocked_reason || "-")}
                        ${data.user?.pending_account_action ? detailRow("Scheduled Action", `${detailStatusLabel(data.user.pending_account_action.action)} after ${api.fmtDate(data.user.pending_account_action.grace_until)}${data.user.pending_account_action.action === "suspended" ? ` • ${data.user.pending_account_action.suspend_hours || 24}h suspend` : ""}`) : ""}
                    </div>
                `;
            }

            if (data.user?.selected_platform === "mt5" && mt5CredsCard) {
                mt5CredsCard.classList.remove("hidden");
                mt5CredsCard.innerHTML = `
                    <div class="flex items-start gap-4">
                        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                            <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                        </div>
                        <div>
                            <h3 class="text-xl font-black text-white">MetaTrader 5 credentials</h3>
                            <p class="mt-1 text-sm font-semibold text-slate-400">Assign MT5 login & password — user receives them by email automatically.</p>
                        </div>
                    </div>
                    <div class="mt-5 grid gap-4 sm:grid-cols-3">
                        <div class="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                            <p class="text-xs text-slate-400">Requested plan</p>
                            <h4 class="mt-1 font-black text-white">${api.escapeHtml(data.user?.preferred_plan_name || "Basic")}</h4>
                        </div>
                        <div class="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                            <p class="text-xs text-slate-400">Currency</p>
                            <h4 class="mt-1 font-black text-white">${api.escapeHtml(mt5Account.account_currency || "USD")}</h4>
                        </div>
                        <div class="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                            <p class="text-xs text-slate-400">Status</p>
                            <h4 class="mt-1 font-black ${mt5Account.status === 'credentials_sent' ? 'text-emerald-400' : 'text-amber-400'}">${mt5Account.status === 'credentials_sent' ? 'Credentials sent' : 'Pending'}</h4>
                        </div>
                    </div>
                    <form id="adminMt5Form" class="mt-5 space-y-4">
                        <div class="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label class="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">MT5 Login ID / Account ID</label>
                                <input type="text" id="adminMt5Login" class="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-400" value="${api.escapeHtml(mt5Account.login_id || '')}" placeholder="MT5 Login ID" required />
                            </div>
                            <div>
                                <label class="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Server Name</label>
                                <input type="text" id="adminMt5Server" class="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-400" value="${api.escapeHtml(mt5Account.server || 'TraidiumX-Live')}" placeholder="Server Name" required />
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Password</label>
                            <input type="text" id="adminMt5Password" class="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-400" placeholder="Enter Password and Send Email. (Admin Side)" required />
                        </div>
                        <button type="submit" id="adminMt5AssignBtn" class="w-full rounded-xl bg-cyan-400 px-5 py-4 text-sm font-black text-slate-950 hover:bg-cyan-300 transition">Assign & email credentials</button>
                        <p id="adminMt5Msg" class="text-xs text-center mt-2"></p>
                    </form>
                `;
            }

            renderTableRows("detailOrdersBody", data.recent_orders || [], [
                row => `<span class="font-black text-white">${api.escapeHtml(row.symbol || "-")}</span>`,
                row => `<span class="font-black ${detailSideClass(row)}">${api.escapeHtml(detailSideLabel(row))}</span>`,
                row => detailStatusPill(row.status),
                row => ui.money(normalizeAmount(row)),
                row => api.escapeHtml(detailShortDate(row.created_at))
            ], "No recent orders found.");

            renderTableRows("detailPositionsBody", data.recent_positions || [], [
                row => `<span class="font-black text-white">${api.escapeHtml(row.symbol || "-")}</span>`,
                row => `<span class="font-black ${detailSideClass(row)}">${api.escapeHtml(detailSideLabel(row))}</span>`,
                row => {
                    const pnlValue = detailPnl(row);
                    return `<span class="font-black ${pnlValue >= 0 ? "text-emerald-300" : "text-rose-300"}">${pnlValue >= 0 ? "+" : ""}${ui.money(pnlValue)}</span>`;
                },
                row => detailStatusPill(row.status),
                row => api.escapeHtml(detailShortDate(row.created_at))
            ], "No recent positions found.");

            const financeRows = [
                ...(data.recent_deposits || []).map(item => ({ ...item, tx_type: "Deposit" })),
                ...(data.recent_withdrawals || []).map(item => ({ ...item, tx_type: "Withdrawal" }))
            ].sort((a, b) => financeHistoryTime(b) - financeHistoryTime(a)).slice(0, 12);

            state.detailFinanceRows = financeRows;
            renderTableRows("detailFinanceBody", financeRows, [
                row => api.escapeHtml(row.tx_type),
                row => ui.money(normalizeAmount(row)),
                row => detailStatusPill(row.status),
                row => api.escapeHtml(api.fmtDate(financeHistoryDate(row))),
                row => financeActionCell(row)
            ], "No deposit/withdrawal records found.");

            renderTableRows("detailLedgerBody", data.recent_ledger || [], [
                row => api.escapeHtml(row.type || row.transaction_type || row.action || "ledger"),
                row => {
                    const amt = normalizeAmount(row);
                    const cur = String(row.currency || data.user?.primary_currency || "USDT").toUpperCase();
                    if (cur === "INR" || cur === "₹") {
                        return `₹ ${api.number(amt).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                    }
                    return `$ ${api.number(amt).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                },
                row => detailStatusPill(row.status || "completed"),
                row => api.escapeHtml(api.fmtDate(row.created_at))
            ], "No ledger entries found.");

            renderAudit(data.audit_logs || []);
        } catch (error) {
            api.showError(error, "User detail failed.");
            detail.innerHTML = `<div class="py-10 text-center text-sm font-bold text-rose-300">User detail failed.</div>`;
        }
    }

    function exportFileNameFromHeader(response, fallback) {
        const header = response.headers.get("Content-Disposition") || response.headers.get("content-disposition") || "";
        const match = header.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
        const name = decodeURIComponent(match?.[1] || match?.[2] || "").trim();
        return name || fallback;
    }

    function downloadBlob(blob, filename) {
        const link = document.createElement("a");
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 500);
    }

    function safeExportName(value) {
        return String(value || "user").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "user";
    }

    async function exportUserDetail(format) {
        const userId = state.currentUserId;
        if (!userId) {
            ui.toast("User Not Loaded", "Open a user detail before export.", "warning");
            return;
        }
        const normalizedFormat = String(format || "csv").toLowerCase();
        const label = normalizedFormat === "xlsx" ? "Excel" : normalizedFormat.toUpperCase();
        try {
            ui.toast("Export Started", `Preparing user ${label} file.`, "info");
            const cfg = window.TX_ADMIN_CONFIG || {};
            const apiBase = (cfg.apiBaseUrl || "/api/admin").replace(/\/$/, "");
            const url = new URL(`${apiBase}/users/${encodeURIComponent(userId)}/export`, window.location.origin);
            url.searchParams.set("format", normalizedFormat);
            const response = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${api.getToken()}` }
            });
            if (!response.ok) {
                let message = `Export failed with status ${response.status}`;
                try {
                    const payload = await response.json();
                    message = payload.message || message;
                } catch (_error) {}
                throw new Error(message);
            }
            const blob = await response.blob();
            const extension = normalizedFormat === "xlsx" ? "xlsx" : normalizedFormat;
            const fallback = `traidiumx-user-${safeExportName(state.currentUserName || userId)}.${extension}`;
            downloadBlob(blob, exportFileNameFromHeader(response, fallback));
            ui.toast("Export Ready", `User ${label} downloaded.`, "success");
        } catch (error) {
            api.showError(error, "User detail export failed.");
        }
    }

    async function exportUsersCsv() {
        try {
            ui.toast("Export Started", "Preparing users CSV.", "info");
            const cfg = window.TX_ADMIN_CONFIG || {};
            const apiBase = (cfg.apiBaseUrl || "/api/admin").replace(/\/$/, "");
            const url = new URL(apiBase + "/users/export", window.location.origin);
            Object.entries(paramsFromFilters()).forEach(([key, val]) => {
                if (!["page", "limit"].includes(key) && val !== undefined && val !== null && val !== "") url.searchParams.set(key, val);
            });
            const response = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${api.getToken()}` }
            });
            if (!response.ok) throw new Error(`Export failed with status ${response.status}`);
            const blob = await response.blob();
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "traidiumx-users.csv";
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(link.href);
            ui.toast("Export Ready", "Users CSV downloaded.", "success");
        } catch (error) {
            api.showError(error, "Users export failed.");
        }
    }

    document.getElementById("userSearch")?.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { state.page = 1; loadUsers(); }, 350);
    });

    ["userStatusFilter", "userKycFilter"].forEach(id => {
        document.getElementById(id)?.addEventListener("change", () => { state.page = 1; loadUsers(); });
    });

    document.getElementById("userResetBtn")?.addEventListener("click", (event) => {
        event.preventDefault();
        ["userSearch", "userStatusFilter", "userKycFilter"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
        state.page = 1;
        loadUsers();
    });

    document.getElementById("usersPrevBtn")?.addEventListener("click", () => {
        if (!state.pagination?.has_prev) return;
        state.page -= 1;
        loadUsers();
    });

    document.getElementById("usersNextBtn")?.addEventListener("click", () => {
        if (!state.pagination?.has_next) return;
        state.page += 1;
        loadUsers();
    });

    document.getElementById("exportUsersBtn")?.addEventListener("click", exportUsersCsv);

    document.addEventListener("click", (event) => {
        if (event.target.closest("[data-user-modal-close]")) {
            closeActionModal();
            return;
        }

        if (event.target.id === "userActionModal") {
            closeActionModal();
            return;
        }

        const exportBtn = event.target.closest("[data-user-detail-export]");
        if (exportBtn) {
            exportUserDetail(exportBtn.dataset.userDetailExport);
            return;
        }

        const inlineBtn = event.target.closest("[data-inline-action][data-user-id]");
        if (inlineBtn) {
            openActionModal(inlineBtn.dataset.inlineAction, inlineBtn.dataset.userId);
            return;
        }

        const withdrawalBtn = event.target.closest("[data-user-withdraw-action][data-withdrawal-id]");
        if (withdrawalBtn) {
            decideFinanceWithdrawal(withdrawalBtn.dataset.withdrawalId, withdrawalBtn.dataset.userWithdrawAction);
            return;
        }

        const detailBtn = event.target.closest("[data-detail-action][data-user-id]");
        if (detailBtn) {
            const action = detailBtn.dataset.detailAction;
            const userId = detailBtn.dataset.userId;
            const reason = action === "force_logout" ? "Force logout from TraidiumX Admin Panel." : action === "reset_2fa" ? "2FA reset from TraidiumX Admin Panel." : "";
            openActionModal(action, userId, reason);
        }
    });


    document.addEventListener("input", (event) => {
        if (!event.target.closest("#userActionSuspendHours")) return;
        if (actionSuspendNote && state.pendingAction?.action === "suspended") {
            actionSuspendNote.textContent = `After warning time ends, user will be suspended for ${formatHours(getSuspendHours())} and then auto-active.`;
        }
    });

    document.addEventListener("click", async (event) => {
        const btn = event.target.closest("#confirmUserActionBtn");
        if (!btn) return;

        const pending = state.pendingAction;
        if (!pending) return;

        const reason = actionReason?.value?.trim() || "Admin action from TraidiumX Admin Panel.";
        btn.disabled = true;
        btn.dataset.originalText = btn.textContent;
        btn.textContent = "Processing...";

        try {
            closeActionModal();
            if (["active", "blocked", "suspended"].includes(pending.action)) {
                const restriction = isRestrictionAction(pending.action);
                const graceSeconds = restriction ? getGraceSeconds() : 0;
                if (restriction && graceSeconds <= 0) {
                    ui.toast("Grace Time Required", "Please enter at least 1 minute grace time for block/suspend.", "warning");
                    openActionModal(pending.action, pending.userId, reason);
                    return;
                }
                const suspendHours = pending.action === "suspended" ? getSuspendHours() : null;
                if (pending.action === "suspended" && suspendHours <= 0) {
                    ui.toast("Suspend Duration Required", "Please enter at least 1 hour suspend duration.", "warning");
                    openActionModal(pending.action, pending.userId, reason);
                    return;
                }
                await updateUserStatus(pending.userId, pending.action, reason, null, { grace_seconds: graceSeconds, suspend_hours: suspendHours });
            } else {
                await runSecurityAction(pending.userId, pending.action, reason);
            }
        } finally {
            btn.disabled = false;
            btn.textContent = btn.dataset.originalText || "Confirm";
        }
    });

    if (body) {
        await Promise.all([loadSummary(), loadUsers()]);
    }

    if (detail) {
        const userId = new URLSearchParams(window.location.search).get("id");
        if (userId) await loadUserDetail(userId);
        else detail.innerHTML = `<div class="py-10 text-center text-sm font-bold text-slate-400">No user selected.</div>`;
    }

    document.addEventListener("submit", async (event) => {
        if (event.target.id === "adminMt5Form") {
            event.preventDefault();
            const loginId = document.getElementById("adminMt5Login").value.trim();
            const server = document.getElementById("adminMt5Server").value.trim();
            const password = document.getElementById("adminMt5Password").value.trim();
            const btn = document.getElementById("adminMt5AssignBtn");
            const msg = document.getElementById("adminMt5Msg");
            
            if (!loginId || !server || !password) {
                msg.className = "text-rose-400 text-xs text-center mt-2";
                msg.textContent = "Please fill in all fields.";
                return;
            }
            
            btn.disabled = true;
            btn.textContent = "Sending Email & Assigning...";
            msg.textContent = "";
            try {
                const response = await api.request(`/users/${encodeURIComponent(state.currentUserId)}/mt5-credentials`, {
                    method: "POST",
                    body: { login_id: loginId, password: password, server: server }
                });
                msg.className = "text-emerald-400 text-xs text-center mt-2";
                msg.textContent = response.message || "Credentials assigned and email sent successfully.";
                btn.disabled = false;
                btn.textContent = "Assign & email credentials";
                await loadUserDetail(state.currentUserId);
            } catch (error) {
                msg.className = "text-rose-400 text-xs text-center mt-2";
                msg.textContent = error.message || "Failed to assign credentials.";
                btn.disabled = false;
                btn.textContent = "Assign & email credentials";
            }
        }
    });
});

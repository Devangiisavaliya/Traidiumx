"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const ui = window.TXAdmin;
    const api = window.TXAdminApi;

    if (!api || !api.requireAuth()) return;

    const state = {
        page: 1,
        limit: 25,
        totalPages: 1,
        totalRecords: 0,
        rows: [],
        filters: {
            search: "",
            action: "all",
            status: "all",
            from: "",
            to: ""
        }
    };

    const body = document.getElementById("auditTableBody");

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function val(id) {
        return String(document.getElementById(id)?.value || "").trim();
    }

    function normalizeResponse(response) {
        return response?.data || response || {};
    }

    function statusBadge(status) {
        const value = String(status || "success").toLowerCase();

        if (["failed", "failure", "error"].includes(value)) {
            return `<span class="status-pill status-rejected">Failed</span>`;
        }

        if (["warning", "pending"].includes(value)) {
            return `<span class="status-pill status-pending">Warning</span>`;
        }

        return `<span class="status-pill status-approved">Success</span>`;
    }

    function renderTable() {
        if (!body) return;

        if (!state.rows.length) {
            body.innerHTML = api.emptyRow(12, "No audit logs found.");
            setText("auditMeta", "0 records");
            setText("auditPageLabel", "Page 1 / 1");
            setText("auditShowingLabel", "Showing 0 logs");
            return;
        }

        body.innerHTML = state.rows.map((log) => {
            const id = api.getId(log);
            const browser = log.browser || log.device || log.user_agent || "-";

            return `
                <tr>
                    <td class="font-black text-white">${api.escapeHtml(id)}</td>
                    <td>${api.escapeHtml(log.admin_name || log.admin_email || log.admin_id || "-")}</td>
                    <td>${api.escapeHtml(log.admin_email || "-")}</td>
                    <td><span class="status-pill status-review">${api.escapeHtml(log.action || "-")}</span></td>
                    <td>${api.escapeHtml(log.resource_type || log.resource || "-")}</td>
                    <td>${api.escapeHtml(log.resource_id || log.target || "-")}</td>
                    <td>${statusBadge(log.status)}</td>
                    <td>${api.escapeHtml(log.ip_address || "-")}</td>
                    <td class="max-w-xs truncate">${api.escapeHtml(browser)}</td>
                    <td class="max-w-xs truncate">${api.escapeHtml(log.message || log.description || "-")}</td>
                    <td>${api.escapeHtml(api.fmtDate(log.created_at || log.date))}</td>
                    <td class="text-right">
                        <button class="admin-btn py-2" data-view-log="${api.escapeHtml(id)}">View</button>
                    </td>
                </tr>
            `;
        }).join("");

        const start = ((state.page - 1) * state.limit) + 1;
        const end = Math.min(state.page * state.limit, state.totalRecords);

        setText("auditMeta", `${state.totalRecords} records`);
        setText("auditPageLabel", `Page ${state.page} / ${state.totalPages || 1}`);
        setText("auditShowingLabel", `Showing ${start}-${end} of ${state.totalRecords}`);
    }

    function renderSummary(summary = {}) {
        setText("auditTotalLogs", summary.total || summary.total_logs || state.totalRecords || 0);
        setText("auditTodayLogs", summary.today || summary.today_logs || 0);
        setText("auditFailedLogs", summary.failed || summary.failed_logs || 0);
        setText("auditAdmins", summary.admins || summary.active_admins || 0);
        setText("auditSecurity", summary.security || summary.security_alerts || 0);
        setText("auditCritical", summary.critical || summary.critical_events || 0);
    }

    function fillActions(actions = []) {
        const select = document.getElementById("auditAction");
        if (!select || select.dataset.loaded === "true") return;

        select.innerHTML = `<option value="all">All</option>` + actions.map((action) => {
            return `<option value="${api.escapeHtml(action)}">${api.escapeHtml(action)}</option>`;
        }).join("");

        select.dataset.loaded = "true";
    }

    async function loadLogs() {
        if (!body) return;

        api.setLoading(body, 12);

        try {
            const response = await api.request("/audit/logs", {
                params: {
                    page: state.page,
                    limit: state.limit,
                    search: state.filters.search,
                    action: state.filters.action,
                    status: state.filters.status,
                    from: state.filters.from,
                    to: state.filters.to
                }
            });

            console.log("AUDIT RESPONSE:", response);

            const payload = normalizeResponse(response);
            const pagination = payload.pagination || {};

            state.rows = payload.logs || [];
            state.totalRecords = Number(pagination.total || state.rows.length || 0);
            state.totalPages = Number(pagination.pages || pagination.total_pages || 1);

            renderSummary(payload.summary || {});
            fillActions(payload.filters?.actions || []);
            renderTable();

        } catch (error) {
            console.error("AUDIT ERROR:", error);
            api.showError(error, "Audit logs failed.");
            body.innerHTML = api.emptyRow(12, "Audit logs failed.");
        }
    }

    function applyFilters() {
        state.filters.search = val("auditSearch");
        state.filters.action = val("auditAction") || "all";
        state.filters.status = val("auditStatus") || "all";
        state.filters.from = val("auditFrom");
        state.filters.to = val("auditTo");
        state.page = 1;
        loadLogs();
    }

    document.getElementById("auditFilterForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        applyFilters();
    });

    document.getElementById("auditResetBtn")?.addEventListener("click", (event) => {
        event.preventDefault();
        document.getElementById("auditFilterForm")?.reset();

        state.filters = {
            search: "",
            action: "all",
            status: "all",
            from: "",
            to: ""
        };

        state.page = 1;
        loadLogs();
    });

    document.getElementById("auditLimit")?.addEventListener("change", (event) => {
        state.limit = Number(event.target.value || 25);
        state.page = 1;
        loadLogs();
    });

    document.getElementById("auditPrevBtn")?.addEventListener("click", () => {
        if (state.page <= 1) return;
        state.page -= 1;
        loadLogs();
    });

    document.getElementById("auditNextBtn")?.addEventListener("click", () => {
        if (state.page >= state.totalPages) return;
        state.page += 1;
        loadLogs();
    });

    document.getElementById("auditRefreshBtn")?.addEventListener("click", (event) => {
        event.preventDefault();
        loadLogs();
    });

    document.getElementById("auditExportBtn")?.addEventListener("click", () => {
        const rows = state.rows || [];

        if (!rows.length) {
            ui?.toast?.("Export skipped", "No audit logs loaded.", "info");
            return;
        }

        const headers = [
            "ID",
            "Admin",
            "Email",
            "Action",
            "Resource",
            "Resource ID",
            "Status",
            "IP",
            "Date"
        ];

        const lines = rows.map((log) => {
            return [
                api.getId(log),
                log.admin_name || log.admin_id || "",
                log.admin_email || "",
                log.action || "",
                log.resource_type || log.resource || "",
                log.resource_id || "",
                log.status || "success",
                log.ip_address || "",
                api.fmtDate(log.created_at || log.date)
            ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",");
        });

        const blob = new Blob([[headers.join(","), ...lines].join("\n")], {
            type: "text/csv;charset=utf-8"
        });

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `traidiumx-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    });

    body?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-view-log]");
        if (!button) return;

        const id = button.dataset.viewLog;
        const log = state.rows.find((item) => api.getId(item) === id);

        if (!log) return;

        const title = document.getElementById("auditViewTitle");
        const info = document.getElementById("auditGeneralInfo");
        const metadata = document.getElementById("auditMetadata");
        const modal = document.getElementById("auditViewModal");

        if (title) title.textContent = `Audit ${id}`;

        if (info) {
            info.innerHTML = `
                <div>
                    <p class="text-xs text-slate-400">Admin</p>
                    <p class="font-bold text-white">${api.escapeHtml(log.admin_name || log.admin_email || "-")}</p>
                </div>
                <div>
                    <p class="text-xs text-slate-400">Action</p>
                    <p class="font-bold text-white">${api.escapeHtml(log.action || "-")}</p>
                </div>
                <div>
                    <p class="text-xs text-slate-400">Resource</p>
                    <p class="font-bold text-white">${api.escapeHtml(log.resource_type || log.resource || "-")}</p>
                </div>
                <div>
                    <p class="text-xs text-slate-400">IP</p>
                    <p class="font-bold text-white">${api.escapeHtml(log.ip_address || "-")}</p>
                </div>
                <div class="md:col-span-2">
                    <p class="text-xs text-slate-400">Message</p>
                    <p class="font-bold text-white">${api.escapeHtml(log.message || "-")}</p>
                </div>
            `;
        }

        if (metadata) {
            metadata.textContent = JSON.stringify(log.metadata || log, null, 2);
        }

        modal?.classList.remove("hidden");
        modal?.classList.add("flex");
    });

    document.getElementById("auditCloseBtn")?.addEventListener("click", () => {
        const modal = document.getElementById("auditViewModal");
        modal?.classList.add("hidden");
        modal?.classList.remove("flex");
    });

    document.getElementById("auditViewModal")?.addEventListener("click", (event) => {
        if (event.target.id !== "auditViewModal") return;
        event.target.classList.add("hidden");
        event.target.classList.remove("flex");
    });

    await loadLogs();
});
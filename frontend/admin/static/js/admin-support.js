"use strict";

(function () {
    const api = window.TXAdminApi;
    if (!api || !api.requireAuth()) return;

    let allTickets = [];
    let selectedTicketId = null;

    const tableBody = document.getElementById("adminSupportTableBody");
    const statusFilter = document.getElementById("ticketStatusFilter");
    const refreshBtn = document.getElementById("supportRefreshBtn");
    
    const detailModal = document.getElementById("ticketDetailModal");
    const modalTicketId = document.getElementById("modalTicketId");
    const modalTicketPriority = document.getElementById("modalTicketPriority");
    const modalTicketUser = document.getElementById("modalTicketUser");
    const modalTicketEmail = document.getElementById("modalTicketEmail");
    const modalTicketMobile = document.getElementById("modalTicketMobile");
    const modalTicketIssue = document.getElementById("modalTicketIssue");
    const modalTicketDate = document.getElementById("modalTicketDate");
    const modalTicketSubject = document.getElementById("modalTicketSubject");
    const modalTicketMessage = document.getElementById("modalTicketMessage");
    const modalTicketStatusSelect = document.getElementById("modalTicketStatusSelect");
    const saveTicketStatusBtn = document.getElementById("saveTicketStatusBtn");

    async function loadTickets() {
        api.setLoading(tableBody, 6, "Loading support tickets...");
        try {
            const res = await api.request("/support/tickets");
            if (res && res.tickets) {
                allTickets = res.tickets;
                renderTickets();
                updateStats();
            } else {
                tableBody.innerHTML = api.emptyRow(6, "Failed to load tickets.");
            }
        } catch (error) {
            console.error("Load tickets failed", error);
            tableBody.innerHTML = api.emptyRow(6, "Network error loading tickets.");
        }
    }

    function renderTickets() {
        if (!tableBody) return;

        const filter = statusFilter.value;
        const filtered = allTickets.filter(t => filter === "all" || t.status === filter);

        if (filtered.length === 0) {
            tableBody.innerHTML = api.emptyRow(6, "No support tickets match this filter.");
            return;
        }

        tableBody.innerHTML = filtered.map(t => {
            let priorityClass = "status-pill status-normal";
            if (t.priority === "High") priorityClass = "status-pill status-rejected";
            else if (t.priority === "Medium") priorityClass = "status-pill status-review";

            let statusClass = "status-pill status-normal";
            if (t.status === "Open") statusClass = "status-pill status-kyc-pending";
            else if (t.status === "In Progress") statusClass = "status-pill status-review";
            else if (t.status === "Resolved") statusClass = "status-pill status-approved";

            const dateStr = api.fmtDate(t.created_at);

            return `
                <tr class="cursor-pointer hover:bg-white/[0.02] transition" onclick="window.openTicketDetail('${t.ticket_id}')">
                    <td class="font-mono font-bold text-xs text-white">${t.ticket_id}</td>
                    <td>
                        <div class="font-bold text-white">${api.escapeHtml(t.name)}</div>
                        <div class="text-xs text-slate-500">${api.escapeHtml(t.email)}</div>
                    </td>
                    <td class="text-xs font-bold text-slate-300">${t.issue_type}</td>
                    <td class="text-xs font-semibold text-slate-300 truncate max-w-[200px]" title="${api.escapeHtml(t.subject)}">${api.escapeHtml(t.subject)}</td>
                    <td><span class="${priorityClass}">${t.priority}</span></td>
                    <td><span class="${statusClass}">${t.status}</span></td>
                </tr>
            `;
        }).join("");
    }

    function updateStats() {
        const total = allTickets.length;
        const open = allTickets.filter(t => t.status === "Open").length;
        const progress = allTickets.filter(t => t.status === "In Progress").length;
        const resolved = allTickets.filter(t => t.status === "Resolved").length;

        const totalEl = document.getElementById("totalTicketsCount");
        const openEl = document.getElementById("openTicketsCount");
        const progressEl = document.getElementById("progressTicketsCount");
        const resolvedEl = document.getElementById("resolvedTicketsCount");

        if (totalEl) totalEl.textContent = total;
        if (openEl) openEl.textContent = open;
        if (progressEl) progressEl.textContent = progress;
        if (resolvedEl) resolvedEl.textContent = resolved;
    }

    window.openTicketDetail = function (ticketId) {
        const t = allTickets.find(x => x.ticket_id === ticketId);
        if (!t) return;

        selectedTicketId = ticketId;
        modalTicketId.textContent = t.ticket_id;
        modalTicketPriority.textContent = t.priority;
        
        let priorityClass = "rounded-full bg-slate-800 px-3 py-1 text-xs font-black text-slate-400";
        if (t.priority === "High") priorityClass = "rounded-full bg-red-400/10 px-3 py-1 text-xs font-black text-red-300";
        else if (t.priority === "Medium") priorityClass = "rounded-full bg-orange-400/10 px-3 py-1 text-xs font-black text-orange-300";
        modalTicketPriority.className = priorityClass;

        modalTicketUser.textContent = t.name;
        modalTicketEmail.textContent = t.email;
        modalTicketMobile.textContent = t.mobile ? `Mobile: ${t.mobile}` : "Mobile: -";
        modalTicketIssue.textContent = t.issue_type;
        modalTicketDate.textContent = `Submitted: ${api.fmtDate(t.created_at)}`;
        modalTicketSubject.textContent = t.subject;
        modalTicketMessage.textContent = t.message;
        modalTicketStatusSelect.value = t.status;

        detailModal.classList.add("open");
    };

    window.closeTicketModal = function () {
        detailModal.classList.remove("open");
        selectedTicketId = null;
    };

    async function saveTicketStatus() {
        if (!selectedTicketId) return;
        const newStatus = modalTicketStatusSelect.value;
        
        saveTicketStatusBtn.disabled = true;
        saveTicketStatusBtn.textContent = "Saving...";

        try {
            const res = await api.request(`/support/ticket/${selectedTicketId}/status`, {
                method: "POST",
                body: { status: newStatus }
            });

            if (res && res.ticket_id) {
                const ticket = allTickets.find(x => x.ticket_id === selectedTicketId);
                if (ticket) ticket.status = newStatus;
                
                renderTickets();
                updateStats();
                window.closeTicketModal();

                if (window.TXAdmin && typeof window.TXAdmin.toast === "function") {
                    window.TXAdmin.toast("Status Updated", `Ticket is now marked as ${newStatus}.`, "success");
                }
            } else {
                if (window.TXAdmin && typeof window.TXAdmin.toast === "function") {
                    window.TXAdmin.toast("Update Failed", res?.message || "Failed to update ticket status.", "error");
                }
            }
        } catch (error) {
            console.error("Update status failed", error);
            if (window.TXAdmin && typeof window.TXAdmin.toast === "function") {
                window.TXAdmin.toast("Network Error", "Network error updating ticket status.", "error");
            }
        } finally {
            saveTicketStatusBtn.disabled = false;
            saveTicketStatusBtn.textContent = "Save Changes";
        }
    }

    if (refreshBtn) {
        refreshBtn.addEventListener("click", loadTickets);
    }
    if (statusFilter) {
        statusFilter.addEventListener("change", renderTickets);
    }
    if (saveTicketStatusBtn) {
        saveTicketStatusBtn.addEventListener("click", saveTicketStatus);
    }
    if (detailModal) {
        detailModal.onclick = (e) => { if (e.target === detailModal) window.closeTicketModal(); };
    }

    loadTickets();
})();

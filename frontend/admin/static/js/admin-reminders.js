"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const ui = window.TXAdmin;
    const api = window.TXAdminApi;
    if (!ui || !api || !api.requireAuth()) return;

    const body = document.getElementById("remindersTableBody");
    if (!body) return;

    const state = {
        reminders: [],
        category: "all",
        search: ""
    };

    const els = {
        categoryFilter: document.getElementById("categoryFilter"),
        searchInput: document.getElementById("searchInput"),
        refreshBtn: document.getElementById("refreshBtn"),
        totalFollowups: document.getElementById("totalFollowups"),
        kycPendingCount: document.getElementById("kycPendingCount"),
        depositPendingCount: document.getElementById("depositPendingCount"),
        customEmailModal: document.getElementById("customEmailModal"),
        customEmailForm: document.getElementById("customEmailForm"),
        customEmailUserId: document.getElementById("customEmailUserId"),
        customEmailUserName: document.getElementById("customEmailUserName"),
        customEmailSubject: document.getElementById("customEmailSubject"),
        customEmailMessage: document.getElementById("customEmailMessage"),
        customEmailSubmitBtn: document.getElementById("customEmailSubmitBtn")
    };

    async function loadReminders() {
        try {
            body.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-500 font-bold">Loading users list...</td></tr>`;
            const response = await api.request("/users/reminders-list");
            state.reminders = response?.reminders || [];
            updateStats();
            renderTable();
        } catch (err) {
            console.error("Failed to load reminders:", err);
            body.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-rose-500 font-bold">Failed to load follow-up users. ${err.message || err}</td></tr>`;
        }
    }

    function updateStats() {
        if (!els.totalFollowups) return;
        
        const total = state.reminders.length;
        const kycCount = state.reminders.filter(r => r.category === "kyc_pending").length;
        const depositCount = state.reminders.filter(r => r.category === "deposit_pending").length;

        els.totalFollowups.textContent = total;
        els.kycPendingCount.textContent = kycCount;
        els.depositPendingCount.textContent = depositCount;
    }

    function renderTable() {
        const query = els.searchInput?.value.trim().toLowerCase() || "";
        const category = els.categoryFilter?.value || "all";

        const filtered = state.reminders.filter(item => {
            if (category !== "all" && item.category !== category) return false;
            if (query) {
                const name = String(item.name || "").toLowerCase();
                const email = String(item.email || "").toLowerCase();
                const mobile = String(item.mobile || "").toLowerCase();
                if (!name.includes(query) && !email.includes(query) && !mobile.includes(query)) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            body.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-500 font-bold">No follow-up users match the filters.</td></tr>`;
            return;
        }

        body.innerHTML = filtered.map(item => {
            const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString() : "--";
            
            // Category badges
            let catBadge = "";
            if (item.category === "kyc_pending") {
                catBadge = `<span class="inline-block rounded-lg border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-xs font-black text-amber-200">${item.reason}</span>`;
            } else {
                catBadge = `<span class="inline-block rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs font-black text-cyan-200">${item.reason}</span>`;
            }

            // Quick reminder buttons
            let reminderButton = "";
            if (item.category === "kyc_pending") {
                reminderButton = `<button class="admin-btn admin-btn-ghost text-xs text-amber-300 border-amber-500/20 hover:bg-amber-500/10 px-3 py-1.5" onclick="window.sendReminder('${item.id}', 'kyc_reminder')">✉ KYC Reminder</button>`;
            } else {
                reminderButton = `<button class="admin-btn admin-btn-ghost text-xs text-cyan-300 border-cyan-500/20 hover:bg-cyan-500/10 px-3 py-1.5" onclick="window.sendReminder('${item.id}', 'deposit_reminder')">💰 Deposit Reminder</button>`;
            }

            return `
                <tr>
                    <td class="font-black text-white truncate">
                        <div class="font-black text-sm">${item.name}</div>
                        <div class="text-[10px] text-slate-500 font-mono">${item.id}</div>
                    </td>
                    <td class="font-semibold text-slate-300">
                        <div class="text-sm">${item.email || "--"}</div>
                        <div class="text-xs text-slate-400">${item.mobile || "--"}</div>
                    </td>
                    <td class="text-sm font-semibold text-slate-400">${dateStr}</td>
                    <td>${catBadge}</td>
                    <td class="text-right">
                        <div class="flex justify-end items-center gap-2">
                            ${reminderButton}
                            <button class="admin-btn admin-btn-ghost text-xs border-slate-500/20 px-3 py-1.5" onclick="window.openCustomEmailModal('${item.id}', '${item.name.replace(/'/g, "\\'")}')">✉ Custom</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    // Global Functions for inline bindings
    window.sendReminder = async (userId, type) => {
        try {
            ui.toast("Sending", "Preparing and sending email reminder...", "info");
            const response = await api.request(`/users/${userId}/send-reminder`, {
                method: "POST",
                body: { type }
            });
            if (response && response.email_sent === false) {
                ui.toast("Warning", "Reminder recorded and notification sent, but email sending failed.", "warning");
            } else {
                ui.toast("Success", "Reminder email and notification sent successfully!", "success");
            }
        } catch (err) {
            console.error("Failed to send reminder:", err);
            ui.toast("Error", err.message || "Failed to send reminder.", "danger");
        }
    };

    window.openCustomEmailModal = (userId, userName) => {
        if (!els.customEmailModal) return;
        els.customEmailUserId.value = userId;
        els.customEmailUserName.value = userName;
        els.customEmailSubject.value = "";
        els.customEmailMessage.value = "";
        els.customEmailModal.classList.add("open");
    };

    // Bind custom email form submission
    els.customEmailForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const userId = els.customEmailUserId.value;
        const subject = els.customEmailSubject.value.trim();
        const message = els.customEmailMessage.value.trim();
        
        if (!userId || !subject || !message) return;

        try {
            if (els.customEmailSubmitBtn) {
                els.customEmailSubmitBtn.disabled = true;
                els.customEmailSubmitBtn.textContent = "Sending...";
            }

            ui.toast("Sending", "Sending custom email...", "info");
            const response = await api.request(`/users/${userId}/send-reminder`, {
                method: "POST",
                body: {
                    type: "custom_email",
                    subject,
                    message
                }
            });

            if (response && response.email_sent === false) {
                ui.toast("Warning", "Email recorded and notification sent, but email sending failed.", "warning");
                els.customEmailModal.classList.remove("open");
            } else {
                ui.toast("Success", "Custom email sent successfully!", "success");
                els.customEmailModal.classList.remove("open");
            }
        } catch (err) {
            console.error("Failed to send custom email:", err);
            ui.toast("Error", err.message || "Failed to send custom email.", "danger");
        } finally {
            if (els.customEmailSubmitBtn) {
                els.customEmailSubmitBtn.disabled = false;
                els.customEmailSubmitBtn.textContent = "Send Email";
            }
        }
    });

    // Control Bindings
    els.categoryFilter?.addEventListener("change", renderTable);
    els.searchInput?.addEventListener("input", renderTable);
    els.refreshBtn?.addEventListener("click", loadReminders);

    // Initial Load
    await loadReminders();
});

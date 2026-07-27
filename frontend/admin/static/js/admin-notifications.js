"use strict";

(function () {
    const api = () => window.TXAdminApi;
    const ui = () => window.TXAdmin;
    let summary = { total_users: 0, active_users: 0, users_with_email: 0 };
    let pendingPayload = null;
    let isSending = false;

    const severityMap = {
        info: { label: "Information", short: "INFO", status: "info" },
        success: { label: "Success", short: "SUCCESS", status: "success" },
        warning: { label: "Warning", short: "WARNING", status: "warning" },
        alert: { label: "Alert", short: "ALERT", status: "alert" },
        danger: { label: "Alert", short: "ALERT", status: "alert" },
        error: { label: "Alert", short: "ALERT", status: "alert" },
    };

    const els = {
        form: document.getElementById("notificationForm"),
        title: document.getElementById("notificationTitle"),
        message: document.getElementById("notificationMessage"),
        counter: document.getElementById("messageCounter"),
        target: document.getElementById("notificationTarget"),
        severity: document.getElementById("notificationSeverity"),
        inApp: document.getElementById("sendInApp"),
        email: document.getElementById("sendEmail"),
        sendBtn: document.getElementById("notificationSendBtn"),
        resetBtn: document.getElementById("notificationResetBtn"),
        refreshBtn: document.getElementById("notificationRefreshBtn"),
        previewCard: document.getElementById("notificationPreviewCard"),
        mailPreviewCard: document.getElementById("mailPreviewCard"),
        previewTitle: document.getElementById("previewTitle"),
        previewMessage: document.getElementById("previewMessage"),
        previewSeverityLabel: document.getElementById("previewSeverityLabel"),
        mailPreviewTitle: document.getElementById("mailPreviewTitle"),
        mailPreviewMessage: document.getElementById("mailPreviewMessage"),
        mailPreviewSeverityLabel: document.getElementById("mailPreviewSeverityLabel"),
        totalUsers: document.getElementById("summaryTotalUsers"),
        activeUsers: document.getElementById("summaryActiveUsers"),
        emailUsers: document.getElementById("summaryEmailUsers"),
        history: document.getElementById("broadcastHistory"),
        lastPill: document.getElementById("lastStatusPill"),
        lastNotificationCount: document.getElementById("lastNotificationCount"),
        lastEmailCount: document.getElementById("lastEmailCount"),
        lastNote: document.getElementById("lastDeliveryNote"),
        modal: document.getElementById("notificationConfirmModal"),
        confirmText: document.getElementById("confirmText"),
        confirmSend: document.getElementById("confirmSendBtn"),
        confirmCancel: document.getElementById("confirmCancelBtn"),
    };

    function escapeHtml(value) {
        return api()?.escapeHtml?.(value) || String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function number(value) {
        return Number(value || 0).toLocaleString();
    }

    function fmtDate(value) {
        return api()?.fmtDate?.(value) || String(value || "-");
    }

    function normalizeSeverity(value) {
        const key = String(value || "info").toLowerCase().trim();
        return severityMap[key]?.status || "info";
    }

    function severityInfo(value) {
        return severityMap[normalizeSeverity(value)] || severityMap.info;
    }

    function getChannel() {
        const inApp = Boolean(els.inApp?.checked);
        const email = Boolean(els.email?.checked);
        if (inApp && email) return "both";
        if (inApp) return "notification";
        if (email) return "email";
        return "";
    }

    function targetCount() {
        return (els.target?.value || "all") === "active" ? Number(summary.active_users || 0) : Number(summary.total_users || 0);
    }

    function setBusy(button, text, busy) {
        if (!button) return;
        button.disabled = Boolean(busy);
        button.dataset.originalText = button.dataset.originalText || button.textContent;
        button.textContent = busy ? text : button.dataset.originalText;
    }

    function buildPayload() {
        return {
            title: (els.title?.value || "").trim(),
            message: (els.message?.value || "").trim(),
            target: els.target?.value || "all",
            severity: normalizeSeverity(els.severity?.value || "info"),
            channel: getChannel(),
        };
    }

    function validatePayload(payload) {
        if (!payload.title) return "Notification title is required.";
        if (!payload.message) return "Notification message is required.";
        if (!payload.channel) return "Select at least one delivery option: notification bell or email.";
        return "";
    }

    function updatePreview() {
        const title = (els.title?.value || "").trim() || "Notification title preview";
        const message = (els.message?.value || "").trim() || "Your user message preview will appear here.";
        const severity = normalizeSeverity(els.severity?.value || "info");
        const info = severityInfo(severity);

        if (els.previewCard) els.previewCard.dataset.severity = severity;
        if (els.mailPreviewCard) els.mailPreviewCard.dataset.severity = severity;
        if (els.previewSeverityLabel) els.previewSeverityLabel.textContent = info.label;
        if (els.mailPreviewSeverityLabel) els.mailPreviewSeverityLabel.textContent = info.label;
        if (els.previewTitle) els.previewTitle.textContent = title;
        if (els.previewMessage) els.previewMessage.textContent = message;
        if (els.mailPreviewTitle) els.mailPreviewTitle.textContent = `TraidiumX • ${info.short} • ${title}`;
        if (els.mailPreviewMessage) els.mailPreviewMessage.textContent = message;
        if (els.counter) els.counter.textContent = `${(els.message?.value || "").length} / 2000`;
    }

    function showConfirm(payload) {
        pendingPayload = payload;
        const count = targetCount();
        const channelLabel = payload.channel === "both" ? "notification bell + email" : payload.channel === "email" ? "email" : "notification bell";
        const info = severityInfo(payload.severity);
        if (els.confirmText) {
            els.confirmText.textContent = `This will send a ${info.label.toLowerCase()} ${channelLabel} message to ${number(count)} ${payload.target === "active" ? "active" : "total"} user(s).`;
        }
        els.modal?.classList.add("open");
        els.modal?.setAttribute("aria-hidden", "false");
    }

    function hideConfirm() {
        pendingPayload = null;
        els.modal?.classList.remove("open");
        els.modal?.setAttribute("aria-hidden", "true");
    }

    function renderSummary(data) {
        summary = data || summary;
        if (els.totalUsers) els.totalUsers.textContent = number(summary.total_users);
        if (els.activeUsers) els.activeUsers.textContent = number(summary.active_users);
        if (els.emailUsers) els.emailUsers.textContent = number(summary.users_with_email);
    }

    function renderHistory(items = []) {
        if (!els.history) return;
        if (!items.length) {
            els.history.innerHTML = `<div class="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center text-sm font-bold text-slate-400">No broadcast sent yet.</div>`;
            return;
        }

        els.history.innerHTML = items.map(item => {
            const channel = item.channel === "both" ? "Bell + Email" : item.channel === "email" ? "Email" : "Bell";
            const severity = normalizeSeverity(item.severity || "info");
            const info = severityInfo(severity);
            const emailStatus = item.email_status === "queued" || item.email_status === "sending"
                ? ` / ${Number(item.email_queued_count || item.email_attempted_count || 0).toLocaleString()} queued`
                : "";
            const status = `${Number(item.notification_created_count || 0).toLocaleString()} bell / ${Number(item.email_sent_count || 0).toLocaleString()} email${emailStatus}`;
            return `
                <article class="broadcast-row" data-severity="${escapeHtml(severity)}">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <h4 class="truncate text-sm font-black text-white">${escapeHtml(item.title || "Notification")}</h4>
                            <span class="status-pill status-${escapeHtml(severity)}">${escapeHtml(info.label)}</span>
                            <span class="status-pill status-info">${escapeHtml(channel)}</span>
                        </div>
                        <p class="broadcast-message mt-2 text-sm font-semibold leading-6 text-slate-400">${escapeHtml(item.message || "")}</p>
                        <p class="mt-2 text-xs font-bold text-slate-500">${escapeHtml(fmtDate(item.created_at))} • ${escapeHtml(item.created_by_admin_email || "admin")}</p>
                    </div>
                    <div class="text-right text-xs font-black uppercase tracking-[.10em] text-cyan-300">${escapeHtml(status)}</div>
                </article>
            `;
        }).join("");
    }

    async function loadData() {
        try {
            setBusy(els.refreshBtn, "Refreshing...", true);
            const data = await api().request("/notifications/summary");
            renderSummary(data);
            renderHistory(data.recent_broadcasts || []);
        } catch (error) {
            api()?.showError?.(error, "Failed to load notifications summary.");
        } finally {
            setBusy(els.refreshBtn, "Refresh", false);
        }
    }

    async function sendPending() {
        if (!pendingPayload || isSending) return;
        isSending = true;
        try {
            setBusy(els.confirmSend, "Sending...", true);
            setBusy(els.sendBtn, "Sending...", true);
            const result = await api().request("/notifications/broadcast", {
                method: "POST",
                body: pendingPayload,
            });

            const delivery = result.delivery || {};
            const queued = Number(delivery.email_queued_count || 0);
            const sent = Number(delivery.email_sent_count || 0);
            const failed = Number(delivery.email_failed_count || 0);

            if (els.lastPill) {
                els.lastPill.className = queued ? "status-pill status-queued" : "status-pill status-success";
                els.lastPill.textContent = queued ? "Queued" : "Sent";
            }
            if (els.lastNotificationCount) els.lastNotificationCount.textContent = number(delivery.notification_created_count || 0);
            if (els.lastEmailCount) els.lastEmailCount.textContent = queued ? `${number(queued)} queued` : number(sent);
            if (els.lastNote) {
                if (queued) {
                    els.lastNote.textContent = "Notification saved immediately. Emails are sending in the background, so the page will not wait for SMTP.";
                } else if (failed) {
                    els.lastNote.textContent = `Sent with ${failed} email failure(s). ${delivery.last_email_reason || "Check SMTP configuration if needed."}`;
                } else {
                    els.lastNote.textContent = "Broadcast processed successfully. Users can check the notification bell and email according to selected delivery.";
                }
            }

            ui()?.toast?.("Message Queued", "Notification saved. Email delivery will continue in background.", "success");
            hideConfirm();
            els.form?.reset();
            if (els.inApp) els.inApp.checked = true;
            if (els.email) els.email.checked = true;
            updatePreview();
            await loadData();
        } catch (error) {
            api()?.showError?.(error, "Failed to send notification broadcast.");
        } finally {
            isSending = false;
            setBusy(els.confirmSend, "Yes, Send", false);
            setBusy(els.sendBtn, "Send Message", false);
        }
    }

    function handleSubmit(event) {
        event?.preventDefault?.();
        const payload = buildPayload();
        const error = validatePayload(payload);
        if (error) {
            ui()?.toast?.("Validation Required", error, "warning");
            return;
        }
        showConfirm(payload);
    }

    els.title?.addEventListener("input", updatePreview);
    els.message?.addEventListener("input", updatePreview);
    els.severity?.addEventListener("change", updatePreview);
    els.form?.addEventListener("submit", handleSubmit);
    els.sendBtn?.addEventListener("click", handleSubmit);
    els.resetBtn?.addEventListener("click", () => {
        els.form?.reset();
        if (els.inApp) els.inApp.checked = true;
        if (els.email) els.email.checked = true;
        updatePreview();
    });
    els.refreshBtn?.addEventListener("click", loadData);
    els.confirmCancel?.addEventListener("click", hideConfirm);
    els.confirmSend?.addEventListener("click", sendPending);
    els.modal?.addEventListener("click", (event) => {
        if (event.target === els.modal) hideConfirm();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && els.modal?.classList.contains("open")) hideConfirm();
    });

    updatePreview();
    document.addEventListener("DOMContentLoaded", loadData);
})();

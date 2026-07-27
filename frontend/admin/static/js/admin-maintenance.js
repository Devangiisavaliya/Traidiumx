"use strict";

(function () {
    const api = () => window.TXAdminApi;
    const ui = () => window.TXAdmin;
    const DEFAULT_MESSAGE = "TraidiumX is under maintenance. Please try again later.";

    let currentSettings = null;
    let isSaving = false;

    const els = {
        statusText: document.getElementById("maintenanceStatusText"),
        statusPill: document.getElementById("maintenanceStatusPill"),
        toggle: document.getElementById("maintenanceToggle"),
        message: document.getElementById("maintenanceMessage"),
        previewText: document.getElementById("maintenancePreviewText"),
        saveBtn: document.getElementById("maintenanceSaveBtn"),
        refreshBtn: document.getElementById("maintenanceRefreshBtn"),
        onBtn: document.getElementById("maintenanceOnBtn"),
        offBtn: document.getElementById("maintenanceOffBtn"),
        previewBtn: document.getElementById("maintenancePreviewBtn"),
    };

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function setBusy(button, text, busy) {
        if (!button) return;
        if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
        button.disabled = Boolean(busy);
        button.textContent = busy ? text : button.dataset.defaultText;
    }

    function normalizedSettings(data) {
        return {
            ...(data || {}),
            platform_status: data?.platform_status || "trading_enabled",
            maintenance_message: data?.maintenance_message || DEFAULT_MESSAGE,
        };
    }

    function updatePreview() {
        const message = (els.message?.value || "").trim() || DEFAULT_MESSAGE;
        if (els.previewText) els.previewText.textContent = message;
    }

    function paintStatus() {
        const active = Boolean(els.toggle?.checked);
        if (els.statusText) {
            els.statusText.textContent = active ? "Maintenance ON" : "Maintenance OFF";
            els.statusText.className = `mt-3 text-3xl font-black ${active ? "text-amber-300" : "text-emerald-300"}`;
        }
        if (els.statusPill) {
            els.statusPill.className = `status-pill ${active ? "status-pending" : "status-completed"}`;
            els.statusPill.textContent = active ? "User Popup Active" : "User Side Normal";
        }
    }

    function fillForm(settings) {
        currentSettings = normalizedSettings(settings);
        if (els.toggle) els.toggle.checked = currentSettings.platform_status === "maintenance_mode";
        if (els.message) els.message.value = currentSettings.maintenance_message || DEFAULT_MESSAGE;
        updatePreview();
        paintStatus();
    }

    async function loadMaintenanceSettings() {
        try {
            setBusy(els.refreshBtn, "Refreshing...", true);
            const settings = await api().request("/settings");
            fillForm(settings);
        } catch (error) {
            api()?.showError?.(error, "Failed to load maintenance settings.");
        } finally {
            setBusy(els.refreshBtn, "Refresh", false);
        }
    }

    async function saveMaintenanceSettings() {
        if (isSaving) return;
        isSaving = true;

        try {
            setBusy(els.saveBtn, "Saving...", true);
            const base = currentSettings || await api().request("/settings");
            const payload = {
                ...base,
                platform_status: els.toggle?.checked ? "maintenance_mode" : "trading_enabled",
                maintenance_message: (els.message?.value || "").trim() || DEFAULT_MESSAGE,
            };

            const saved = await api().request("/settings", {
                method: "PUT",
                body: payload,
            });

            fillForm(saved);
            ui()?.toast?.("Maintenance Saved", els.toggle?.checked ? "User-side maintenance popup is active." : "User side is back to normal.", "success");
        } catch (error) {
            api()?.showError?.(error, "Failed to save maintenance settings.");
        } finally {
            isSaving = false;
            setBusy(els.saveBtn, "Save Maintenance", false);
        }
    }

    function injectPreviewStyles() {
        if (document.getElementById("txMaintenancePreviewStyles")) return;
        const style = document.createElement("style");
        style.id = "txMaintenancePreviewStyles";
        style.textContent = `
            .tx-maint-preview-wrap{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:rgba(2,6,23,.72);backdrop-filter:blur(12px);padding:18px}
            .tx-maint-preview-card{width:min(520px,100%);border:1px solid rgba(34,211,238,.25);border-radius:28px;background:linear-gradient(145deg,#111827,#050816);box-shadow:0 32px 90px rgba(0,0,0,.58);padding:26px;color:#e5e7eb}
            .tx-maint-preview-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
            .tx-maint-preview-kicker{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.2em;color:#67e8f9}
            .tx-maint-preview-card h3{margin:8px 0 0;font-size:24px;font-weight:900;color:#fff}
            .tx-maint-preview-card p{margin:12px 0 0;color:#cbd5e1;font-weight:700;line-height:1.7;font-size:14px}
            .tx-maint-preview-close{display:grid;place-items:center;width:42px;height:42px;border-radius:16px;border:1px solid rgba(148,163,184,.22);background:rgba(148,163,184,.10);color:#e2e8f0;font-size:22px;font-weight:900;cursor:pointer}
        `;
        document.head.appendChild(style);
    }

    function showPreviewPopup() {
        injectPreviewStyles();
        document.getElementById("txMaintenancePreview")?.remove();
        const message = (els.message?.value || "").trim() || DEFAULT_MESSAGE;
        const modal = document.createElement("div");
        modal.id = "txMaintenancePreview";
        modal.innerHTML = `
            <div class="tx-maint-preview-wrap">
                <div class="tx-maint-preview-card" role="dialog" aria-modal="true">
                    <div class="tx-maint-preview-top">
                        <div>
                            <div class="tx-maint-preview-kicker">TraidiumX Notice</div>
                            <h3>Maintenance Mode</h3>
                        </div>
                        <button type="button" class="tx-maint-preview-close" aria-label="Close">×</button>
                    </div>
                    <p>${escapeHtml(message)}</p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector(".tx-maint-preview-close")?.addEventListener("click", () => modal.remove());
        modal.querySelector(".tx-maint-preview-wrap")?.addEventListener("click", (event) => {
            if (event.target.classList.contains("tx-maint-preview-wrap")) modal.remove();
        });
    }

    els.toggle?.addEventListener("change", paintStatus);
    els.message?.addEventListener("input", updatePreview);
    els.saveBtn?.addEventListener("click", saveMaintenanceSettings);
    els.refreshBtn?.addEventListener("click", loadMaintenanceSettings);
    els.onBtn?.addEventListener("click", () => {
        if (els.toggle) els.toggle.checked = true;
        paintStatus();
    });
    els.offBtn?.addEventListener("click", () => {
        if (els.toggle) els.toggle.checked = false;
        paintStatus();
    });
    els.previewBtn?.addEventListener("click", showPreviewPopup);

    document.addEventListener("DOMContentLoaded", loadMaintenanceSettings);
})();

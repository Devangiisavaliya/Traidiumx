"use strict";

document.addEventListener("DOMContentLoaded", function () {
    initSettings();
});

function initSettings() {
    const user = getAuthUser();
    if (!user) {
        window.location.href = "/src/pages/login.html";
        return;
    }

    // Populate user profile info
    updateProfileDisplay(user);

    // Bind event listeners
    bindButtonListeners(user);
    initToggles();
}

function updateProfileDisplay(user) {
    const nameDisplay = user.name || "User";
    const emailDisplay = user.email || "user@email.com";
    const firstLetter = nameDisplay.charAt(0).toUpperCase();

    const avatarCircle = document.getElementById("avatarCircle");
    const avatarCircle2 = document.getElementById("avatarCircle2");
    const nicknameDisplay = document.getElementById("nicknameDisplay");
    const emailDisplayEl = document.getElementById("emailDisplay");

    if (avatarCircle) avatarCircle.textContent = firstLetter;
    if (avatarCircle2) avatarCircle2.textContent = firstLetter;
    if (nicknameDisplay) nicknameDisplay.textContent = nameDisplay;
    if (emailDisplayEl) emailDisplayEl.textContent = emailDisplay;
}

function bindButtonListeners(user) {
    // Nickname Edit
    document.getElementById("editNicknameBtn")?.addEventListener("click", () => {
        showModal("Edit Nickname", `
            <form id="txNicknameForm" class="space-y-4 p-5">
                <div>
                    <label class="block text-xs font-bold text-slate-400 mb-1.5 uppercase">New Nickname</label>
                    <input type="text" id="newNicknameInput" value="${escapeSettingsHtml(user.name || "")}" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400" required />
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="button" class="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition" onclick="closeSettingsModal()">Cancel</button>
                    <button type="submit" class="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-2.5 rounded-xl text-xs transition">Save Changes</button>
                </div>
            </form>
        `, (modalEl) => {
            modalEl.querySelector("form").addEventListener("submit", (e) => {
                e.preventDefault();
                const newName = document.getElementById("newNicknameInput").value.trim();
                if (newName) {
                    user.name = newName;
                    saveAuthData(getAuthToken(), user);
                    updateProfileDisplay(user);
                    closeSettingsModal();
                }
            });
        });
    });

    // Profile Info View / Edit
    document.getElementById("editProfileBtn")?.addEventListener("click", () => {
        showModal("Account Profile", `
            <div class="space-y-4 p-5 text-sm">
                <div class="flex justify-between border-b border-slate-800 pb-2.5">
                    <span class="text-slate-400">Email Address</span>
                    <span class="font-bold text-white">${escapeSettingsHtml(user.email || "")}</span>
                </div>
                <div class="flex justify-between border-b border-slate-800 pb-2.5">
                    <span class="text-slate-400">KYC Status</span>
                    <span class="font-bold text-emerald-400 capitalize">${escapeSettingsHtml(user.kyc_status || "Not Verified")}</span>
                </div>
                <div class="flex justify-between border-b border-slate-800 pb-2.5">
                    <span class="text-slate-400">Client ID</span>
                    <span class="font-bold text-white">${escapeSettingsHtml(user.client_id || "383939")}</span>
                </div>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2" onclick="closeSettingsModal()">Close</button>
            </div>
        `);
    });

    // Language Edit
    document.getElementById("editLanguageBtn")?.addEventListener("click", () => {
        showModal("Select Language", `
            <div class="space-y-2 p-5 text-sm">
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center" onclick="setLanguage('English')">
                    <span>English</span>
                    <span class="text-emerald-400 font-bold">✓</span>
                </button>
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center" onclick="setLanguage('Gujarati')">
                    <span>ગુજરાતી (Gujarati)</span>
                </button>
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center" onclick="setLanguage('Hindi')">
                    <span>हिन्दी (Hindi)</span>
                </button>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2" onclick="closeSettingsModal()">Cancel</button>
            </div>
        `);
    });

    // Manage Notif Preferences
    document.getElementById("manageNotifPrefBtn")?.addEventListener("click", () => {
        const notifPref = localStorage.getItem("tx_notif_pref") === "ON";
        localStorage.setItem("tx_notif_pref", notifPref ? "OFF" : "ON");
        updateNotifPrefUI();
    });

    // Manage Price Alert
    document.getElementById("managePriceAlertBtn")?.addEventListener("click", () => {
        showModal("Price Alert Settings", `
            <form id="txPriceAlertForm" class="space-y-4 p-5">
                <div class="flex justify-between items-center">
                    <span class="text-sm font-bold text-white">Receive Price Alerts</span>
                    <label class="tx-switch">
                        <input type="checkbox" id="priceAlertToggle" checked />
                        <span class="tx-slider"></span>
                    </label>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-sm font-bold text-white">Alert Sound</span>
                    <label class="tx-switch">
                        <input type="checkbox" id="alertSoundToggle" checked />
                        <span class="tx-slider"></span>
                    </label>
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="button" class="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition" onclick="closeSettingsModal()">Cancel</button>
                    <button type="submit" class="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-2.5 rounded-xl text-xs transition">Save</button>
                </div>
            </form>
        `, (modalEl) => {
            modalEl.querySelector("form").addEventListener("submit", (e) => {
                e.preventDefault();
                const alertsEnabled = document.getElementById("priceAlertToggle").checked;
                const soundEnabled = document.getElementById("alertSoundToggle").checked;
                const statusStr = `Notification ${alertsEnabled ? 'On' : 'Off'}, Sound ${soundEnabled ? 'On' : 'Off'}`;
                document.getElementById("priceAlertDisplay").textContent = statusStr;
                closeSettingsModal();
            });
        });
    });

    // Color Preference Edit
    document.getElementById("editColorPrefBtn")?.addEventListener("click", () => {
        showModal("Color Preference", `
            <div class="space-y-2 p-5 text-sm">
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center" onclick="setColorPref('Green Up / Red Down')">
                    <span class="text-emerald-400 font-bold">Green Up / Red Down</span>
                    <span class="text-emerald-400">✓</span>
                </button>
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center" onclick="setColorPref('Red Up / Green Down')">
                    <span class="text-red-400 font-bold">Red Up / Green Down</span>
                </button>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2" onclick="closeSettingsModal()">Cancel</button>
            </div>
        `);
    });

    // Style Settings Edit
    document.getElementById("editStyleBtn")?.addEventListener("click", () => {
        showModal("UI Accent Accent", `
            <div class="space-y-2 p-5 text-sm">
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center" onclick="setStylePref('Fresh')">
                    <span>Fresh</span>
                    <span class="text-emerald-400 font-bold">✓</span>
                </button>
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center" onclick="setStylePref('Classic')">
                    <span>Classic</span>
                </button>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2" onclick="closeSettingsModal()">Cancel</button>
            </div>
        `);
    });

    // UTC Timezone Edit
    document.getElementById("editTimezoneBtn")?.addEventListener("click", () => {
        showModal("Time Zone Settings", `
            <div class="space-y-2 p-5 text-sm">
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center" onclick="setTimezone('Last 24 hours')">
                    <span>Last 24 hours (UTC)</span>
                    <span class="text-emerald-400 font-bold">✓</span>
                </button>
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center" onclick="setTimezone('Local Time')">
                    <span>Local Device Time</span>
                </button>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2" onclick="closeSettingsModal()">Cancel</button>
            </div>
        `);
    });

    // Theme Edit
    document.getElementById("editThemeBtn")?.addEventListener("click", () => {
        toggleSiteTheme();
        const cur = localStorage.getItem("traidiumx_theme") === "light" ? "Light" : "Dark";
        document.getElementById("themeValDisplay").textContent = cur;
    });

    // Password Edit Form
    document.getElementById("editPasswordBtn")?.addEventListener("click", () => {
        showModal("Change Password", `
            <form id="txChangePasswordForm" class="space-y-4 p-5">
                <div>
                    <label class="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Current Password</label>
                    <input type="password" id="curPass" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400" required />
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-400 mb-1.5 uppercase">New Password</label>
                    <input type="password" id="newPass" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400" required />
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Confirm New Password</label>
                    <input type="password" id="confirmNewPass" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400" required />
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="button" class="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition" onclick="closeSettingsModal()">Cancel</button>
                    <button type="submit" class="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-2.5 rounded-xl text-xs transition">Change</button>
                </div>
            </form>
        `, (modalEl) => {
            modalEl.querySelector("form").addEventListener("submit", (e) => {
                e.preventDefault();
                alert("Password changed successfully (Mocked)!");
                closeSettingsModal();
            });
        });
    });

    // Two Factor Authentication
    document.getElementById("manage2faBtn")?.addEventListener("click", () => {
        showModal("Two-Factor Authentication", `
            <div class="space-y-4 p-5 text-sm text-center">
                <p class="text-slate-400">Two-Factor Authentication adds an extra layer of security. Please configure the Authenticator App below.</p>
                <div class="bg-white p-3 rounded-xl inline-block">
                    <div class="w-32 h-32 bg-slate-200 flex items-center justify-center text-slate-900 font-bold">QR CODE</div>
                </div>
                <p class="text-slate-300 font-bold">Secret Key: MOCKKEY123456</p>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2" onclick="closeSettingsModal()">Close</button>
            </div>
        `);
    });

    // Whitelist toggle
    document.getElementById("enableWhitelistBtn")?.addEventListener("click", () => {
        const active = localStorage.getItem("tx_whitelist") === "ON";
        localStorage.setItem("tx_whitelist", active ? "OFF" : "ON");
        updateWhitelistUI();
    });

    // Onestep toggle
    document.getElementById("enableOnestepBtn")?.addEventListener("click", () => {
        const active = localStorage.getItem("tx_onestep") === "ON";
        localStorage.setItem("tx_onestep", active ? "OFF" : "ON");
        updateOnestepUI();
    });

    // Link X Account
    document.getElementById("linkXBtn")?.addEventListener("click", () => {
        showModal("Link X (Twitter) Account", `
            <div class="space-y-4 p-5 text-center text-sm">
                <p class="text-slate-400">Link your X (Twitter) account to receive live system notices and updates.</p>
                <button type="button" class="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-2.5 rounded-xl text-xs transition" onclick="completeLinkX()">Authorize on X</button>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition" onclick="closeSettingsModal()">Cancel</button>
            </div>
        `);
    });

    // Download Data
    document.getElementById("downloadDataBtn")?.addEventListener("click", () => {
        alert("Personal data bundle download initiated!");
    });

    // Export Records
    document.getElementById("exportRecordsBtn")?.addEventListener("click", () => {
        alert("Accounting statements statement export initiated!");
    });

    // Delete/Close Account
    document.getElementById("closeAccountBtn")?.addEventListener("click", () => {
        showModal("Delete Account", `
            <div class="space-y-4 p-5 text-sm text-center">
                <p class="text-red-400 font-bold">Warning: This action is permanent and cannot be undone.</p>
                <p class="text-slate-400">Your trading assets, order history, and account profile will be permanently deleted.</p>
                <button type="button" class="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl text-xs transition" onclick="confirmDeleteAccount()">Permanently Delete Account</button>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition" onclick="closeSettingsModal()">Cancel</button>
            </div>
        `);
    });
}

function initToggles() {
    updateNotifPrefUI();
    updateWhitelistUI();
    updateOnestepUI();

    // Theme label init
    const curTheme = localStorage.getItem("traidiumx_theme") === "light" ? "Light" : "Dark";
    const themeValDisplay = document.getElementById("themeValDisplay");
    if (themeValDisplay) themeValDisplay.textContent = curTheme;

    // Shortcuts toggle
    const shortcutsToggle = document.getElementById("shortcutsToggle");
    if (shortcutsToggle) {
        const active = localStorage.getItem("traidiumx_shortcuts") !== "false";
        shortcutsToggle.checked = active;
        shortcutsToggle.addEventListener("change", function () {
            localStorage.setItem("traidiumx_shortcuts", String(this.checked));
        });
    }
}

function updateNotifPrefUI() {
    const notifPref = localStorage.getItem("tx_notif_pref") === "ON";
    const icon = document.getElementById("notifPrefIcon");
    const text = document.getElementById("notifPrefDisplay");
    const btn = document.getElementById("manageNotifPrefBtn");

    if (icon && text && btn) {
        if (notifPref) {
            icon.className = "tx-status-icon-on";
            icon.textContent = "✓";
            text.textContent = "ON";
            btn.textContent = "Manage";
        } else {
            icon.className = "tx-status-icon-off";
            icon.textContent = "✕";
            text.textContent = "OFF";
            btn.textContent = "Manage";
        }
    }
}

function updateWhitelistUI() {
    const active = localStorage.getItem("tx_whitelist") === "ON";
    const icon = document.getElementById("whitelistIcon");
    const text = document.getElementById("whitelistDisplay");
    const btn = document.getElementById("enableWhitelistBtn");

    if (icon && text && btn) {
        if (active) {
            icon.className = "tx-status-icon-on";
            icon.textContent = "✓";
            text.textContent = "ON";
            btn.textContent = "Disable";
        } else {
            icon.className = "tx-status-icon-off";
            icon.textContent = "✕";
            text.textContent = "OFF";
            btn.textContent = "Enable";
        }
    }
}

function updateOnestepUI() {
    const active = localStorage.getItem("tx_onestep") === "ON";
    const icon = document.getElementById("onestepIcon");
    const text = document.getElementById("onestepDisplay");
    const btn = document.getElementById("enableOnestepBtn");

    if (icon && text && btn) {
        if (active) {
            icon.className = "tx-status-icon-on";
            icon.textContent = "✓";
            text.textContent = "ON";
            btn.textContent = "Disable";
        } else {
            icon.className = "tx-status-icon-off";
            icon.textContent = "✕";
            text.textContent = "OFF";
            btn.textContent = "Enable";
        }
    }
}

// Global modal helpers
function showModal(title, bodyHtml, callback = null) {
    const container = document.getElementById("txSettingsModalContainer");
    if (!container) return;

    container.innerHTML = `
        <div class="tx-settings-modal" onclick="closeSettingsModal()">
            <div class="tx-settings-modal-card" onclick="event.stopPropagation()">
                <div class="flex items-center justify-between border-b border-slate-800 p-4">
                    <h3 class="font-extrabold text-sm text-white">${escapeSettingsHtml(title)}</h3>
                    <button type="button" class="text-slate-400 hover:text-white font-bold text-lg focus:outline-none cursor-pointer" onclick="closeSettingsModal()">✕</button>
                </div>
                <div class="modal-body">
                    ${bodyHtml}
                </div>
            </div>
        </div>
    `;
    container.classList.remove("hidden");

    if (callback) {
        callback(container);
    }
}

window.closeSettingsModal = function () {
    const container = document.getElementById("txSettingsModalContainer");
    if (container) {
        container.classList.add("hidden");
        container.innerHTML = "";
    }
};

window.setLanguage = function (lang) {
    document.getElementById("languageDisplay").textContent = lang;
    closeSettingsModal();
};

window.setColorPref = function (val) {
    document.getElementById("colorPrefDisplay").textContent = val;
    closeSettingsModal();
};

window.setStylePref = function (val) {
    document.getElementById("stylePrefDisplay").textContent = val;
    closeSettingsModal();
};

window.setTimezone = function (val) {
    document.getElementById("timezoneDisplay").textContent = val;
    closeSettingsModal();
};

window.completeLinkX = function () {
    document.getElementById("linkXDisplay").className = "tx-settings-value text-emerald-400";
    document.getElementById("linkXDisplay").textContent = "Linked (@traidiumx_user)";
    document.getElementById("linkXBtn").textContent = "Unlink";
    closeSettingsModal();
};

window.confirmDeleteAccount = function () {
    alert("Account deletion request submitted!");
    closeSettingsModal();
    // Trigger logout
    clearAuthData();
    window.location.href = "/";
};

function escapeSettingsHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

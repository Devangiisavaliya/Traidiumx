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

    // Populate preferences from localStorage
    const savedLang = localStorage.getItem("tx_language") || "English";
    const langDisplay = document.getElementById("languageDisplay");
    if (langDisplay) langDisplay.textContent = savedLang;

    const savedColor = localStorage.getItem("tx_color_pref") || "Green Up / Red Down";
    const colorDisplay = document.getElementById("colorPrefDisplay");
    if (colorDisplay) colorDisplay.textContent = savedColor;

    const savedStyle = localStorage.getItem("tx_style_pref") || "Fresh";
    const styleDisplay = document.getElementById("stylePrefDisplay");
    if (styleDisplay) styleDisplay.textContent = savedStyle;

    const savedTimezone = localStorage.getItem("tx_timezone") || "Last 24 hours (UTC)";
    const timezoneDisplay = document.getElementById("timezoneDisplay");
    if (timezoneDisplay) timezoneDisplay.textContent = savedTimezone;

    const alertsEnabled = localStorage.getItem("tx_price_alerts") !== "OFF";
    const soundEnabled = localStorage.getItem("tx_price_alerts_sound") !== "OFF";
    const priceAlertDisplay = document.getElementById("priceAlertDisplay");
    if (priceAlertDisplay) {
        priceAlertDisplay.textContent = `Notification ${alertsEnabled ? 'On' : 'Off'}, Sound ${soundEnabled ? 'On' : 'Off'}`;
    }

    const savedWithdraw = localStorage.getItem("tx_withdraw_setting") || "Off-Chain Withdrawal";
    const withdrawDisplay = document.getElementById("withdrawSettingDisplay");
    if (withdrawDisplay) withdrawDisplay.textContent = savedWithdraw;

    const savedConfirm = localStorage.getItem("tx_confirm_reminders") || "Market, Limit, Stop-Limit";
    const confirmDisplay = document.getElementById("orderConfirmDisplay");
    if (confirmDisplay) confirmDisplay.textContent = savedConfirm;

    const savedCloseSound = localStorage.getItem("tx_close_sound") || "Default";
    const closeSoundDisplay = document.getElementById("closeSoundDisplay");
    if (closeSoundDisplay) closeSoundDisplay.textContent = savedCloseSound;

    const savedFeeDeduction = localStorage.getItem("tx_fee_deduction") || "Spot Fees";
    const feeDeductionDisplay = document.getElementById("feeDeductionDisplay");
    if (feeDeductionDisplay) feeDeductionDisplay.textContent = savedFeeDeduction;

    // Bind event listeners
    bindButtonListeners(user);
    initToggles(user);
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
            modalEl.querySelector("form").addEventListener("submit", async (e) => {
                e.preventDefault();
                const newName = document.getElementById("newNicknameInput").value.trim();
                if (newName) {
                    try {
                        const response = await apiRequest("/user/profile", {
                            method: "PATCH",
                            body: JSON.stringify({ name: newName })
                        });
                        if (response && response.success) {
                            user.name = newName;
                            saveAuthData(getAuthToken(), user);
                            updateProfileDisplay(user);
                            closeSettingsModal();
                            showToast("Nickname updated successfully!", "success");
                        } else {
                            showToast(response.message || "Failed to update profile name.", "error");
                        }
                    } catch (err) {
                        showToast(err.message || "An error occurred.", "error");
                    }
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
        const currentLang = localStorage.getItem("tx_language") || "English";
        showModal("Select Language", `
            <div class="space-y-2 p-5 text-sm">
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setLanguage('English')">
                    <span>English <span class="notranslate">(English)</span></span>
                    ${currentLang === 'English' ? '<span class="text-emerald-400 font-bold notranslate">✓</span>' : ''}
                </button>
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setLanguage('Gujarati')">
                    <span>ગુજરાતી <span class="notranslate">(Gujarati)</span></span>
                    ${currentLang === 'Gujarati' ? '<span class="text-emerald-400 font-bold notranslate">✓</span>' : ''}
                </button>
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setLanguage('Hindi')">
                    <span>हिन्दी <span class="notranslate">(Hindi)</span></span>
                    ${currentLang === 'Hindi' ? '<span class="text-emerald-400 font-bold notranslate">✓</span>' : ''}
                </button>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2 cursor-pointer" onclick="closeSettingsModal()">Cancel</button>
            </div>
        `);
    });

    // Manage Notif Preferences
    document.getElementById("manageNotifPrefBtn")?.addEventListener("click", () => {
        const email = localStorage.getItem("tx_notif_email") !== "OFF";
        const push = localStorage.getItem("tx_notif_push") !== "OFF";
        const inapp = localStorage.getItem("tx_notif_inapp") !== "OFF";

        showModal("Notification Preferences", `
            <form id="txNotifPrefForm" class="space-y-4 p-5">
                <div class="flex justify-between items-center">
                    <div class="flex flex-col">
                        <span class="text-sm font-bold text-white leading-none">Email Notifications</span>
                        <span class="text-[10px] text-slate-400 mt-1">Receive system alerts, security codes, and statements.</span>
                    </div>
                    <label class="tx-switch">
                        <input type="checkbox" id="notifEmailToggle" ${email ? 'checked' : ''} />
                        <span class="tx-slider"></span>
                    </label>
                </div>
                <div class="flex justify-between items-center border-t border-slate-800/40 pt-3">
                    <div class="flex flex-col">
                        <span class="text-sm font-bold text-white leading-none">Push Notifications</span>
                        <span class="text-[10px] text-slate-400 mt-1">Get real-time browser alerts on order executions.</span>
                    </div>
                    <label class="tx-switch">
                        <input type="checkbox" id="notifPushToggle" ${push ? 'checked' : ''} />
                        <span class="tx-slider"></span>
                    </label>
                </div>
                <div class="flex justify-between items-center border-t border-slate-800/40 pt-3">
                    <div class="flex flex-col">
                        <span class="text-sm font-bold text-white leading-none">In-App Inbox</span>
                        <span class="text-[10px] text-slate-400 mt-1">Receive announcement messages in your exchange inbox.</span>
                    </div>
                    <label class="tx-switch">
                        <input type="checkbox" id="notifInappToggle" ${inapp ? 'checked' : ''} />
                        <span class="tx-slider"></span>
                    </label>
                </div>
                <div class="flex gap-3 pt-2 border-t border-slate-800/40">
                    <button type="button" class="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer" onclick="closeSettingsModal()">Cancel</button>
                    <button type="submit" class="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-2.5 rounded-xl text-xs transition cursor-pointer">Save Preferences</button>
                </div>
            </form>
        `, (modalEl) => {
            modalEl.querySelector("form").addEventListener("submit", (e) => {
                e.preventDefault();
                const nextEmail = document.getElementById("notifEmailToggle").checked;
                const nextPush = document.getElementById("notifPushToggle").checked;
                const nextInapp = document.getElementById("notifInappToggle").checked;

                localStorage.setItem("tx_notif_email", nextEmail ? "ON" : "OFF");
                localStorage.setItem("tx_notif_push", nextPush ? "ON" : "OFF");
                localStorage.setItem("tx_notif_inapp", nextInapp ? "ON" : "OFF");

                updateNotifPrefUI();
                closeSettingsModal();
            });
        });
    });

    // Manage Price Alert
    document.getElementById("managePriceAlertBtn")?.addEventListener("click", () => {
        const alertsEnabled = localStorage.getItem("tx_price_alerts") !== "OFF";
        const soundEnabled = localStorage.getItem("tx_price_alerts_sound") !== "OFF";

        showModal("Price Alert Settings", `
            <form id="txPriceAlertForm" class="space-y-4 p-5">
                <div class="flex justify-between items-center">
                    <span class="text-sm font-bold text-white">Receive Price Alerts</span>
                    <label class="tx-switch">
                        <input type="checkbox" id="priceAlertToggle" ${alertsEnabled ? 'checked' : ''} />
                        <span class="tx-slider"></span>
                    </label>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-sm font-bold text-white">Alert Sound</span>
                    <label class="tx-switch">
                        <input type="checkbox" id="alertSoundToggle" ${soundEnabled ? 'checked' : ''} />
                        <span class="tx-slider"></span>
                    </label>
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="button" class="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer" onclick="closeSettingsModal()">Cancel</button>
                    <button type="submit" class="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-2.5 rounded-xl text-xs transition cursor-pointer">Save</button>
                </div>
            </form>
        `, (modalEl) => {
            modalEl.querySelector("form").addEventListener("submit", (e) => {
                e.preventDefault();
                const nextAlerts = document.getElementById("priceAlertToggle").checked;
                const nextSound = document.getElementById("alertSoundToggle").checked;
                localStorage.setItem("tx_price_alerts", nextAlerts ? "ON" : "OFF");
                localStorage.setItem("tx_price_alerts_sound", nextSound ? "ON" : "OFF");

                const statusStr = `Notification ${nextAlerts ? 'On' : 'Off'}, Sound ${nextSound ? 'On' : 'Off'}`;
                const displayEl = document.getElementById("priceAlertDisplay");
                if (displayEl) displayEl.textContent = statusStr;
                closeSettingsModal();
            });
        });
    });

    // Color Preference Edit
    document.getElementById("editColorPrefBtn")?.addEventListener("click", () => {
        const currentColor = localStorage.getItem("tx_color_pref") || "Green Up / Red Down";
        showModal("Color Preference", `
            <div class="space-y-2 p-5 text-sm">
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setColorPref('Green Up / Red Down')">
                    <span class="text-emerald-400 font-bold">Green Up / Red Down</span>
                    ${currentColor === 'Green Up / Red Down' ? '<span class="text-emerald-400 font-bold">✓</span>' : ''}
                </button>
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setColorPref('Red Up / Green Down')">
                    <span class="text-red-400 font-bold">Red Up / Green Down</span>
                    ${currentColor === 'Red Up / Green Down' ? '<span class="text-emerald-400 font-bold">✓</span>' : ''}
                </button>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2 cursor-pointer" onclick="closeSettingsModal()">Cancel</button>
            </div>
        `);
    });

    // Style Settings Edit
    document.getElementById("editStyleBtn")?.addEventListener("click", () => {
        const currentStyle = localStorage.getItem("tx_style_pref") || "Fresh";
        showModal("UI Accent Accent", `
            <div class="space-y-2 p-5 text-sm">
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setStylePref('Fresh')">
                    <span>Fresh</span>
                    ${currentStyle === 'Fresh' ? '<span class="text-emerald-400 font-bold">✓</span>' : ''}
                </button>
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setStylePref('Classic')">
                    <span>Classic</span>
                    ${currentStyle === 'Classic' ? '<span class="text-emerald-400 font-bold">✓</span>' : ''}
                </button>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2 cursor-pointer" onclick="closeSettingsModal()">Cancel</button>
            </div>
        `);
    });

    // UTC Timezone Edit
    document.getElementById("editTimezoneBtn")?.addEventListener("click", () => {
        const currentTimezone = localStorage.getItem("tx_timezone") || "Last 24 hours (UTC)";
        showModal("Time Zone Settings", `
            <div class="space-y-2 p-5 text-sm">
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setTimezone('Last 24 hours (UTC)')">
                    <span>Last 24 hours (UTC)</span>
                    ${currentTimezone === 'Last 24 hours (UTC)' ? '<span class="text-emerald-400 font-bold">✓</span>' : ''}
                </button>
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setTimezone('Local Time')">
                    <span>Local Device Time</span>
                    ${currentTimezone === 'Local Time' ? '<span class="text-emerald-400 font-bold">✓</span>' : ''}
                </button>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2 cursor-pointer" onclick="closeSettingsModal()">Cancel</button>
            </div>
        `);
    });

    // Theme Toggle Switch Event
    document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
        toggleSiteTheme();
        const nextTheme = localStorage.getItem("traidiumx_theme") || "dark";
        updateThemeToggleUI(nextTheme);
    });

    // Shortcuts Edit Modal
    document.getElementById("editShortcutsBtn")?.addEventListener("click", () => {
        showModal("Keyboard Shortcuts", `
            <div class="space-y-4 p-5 text-sm">
                <p class="text-xs text-slate-400 mb-3">Quickly execute trading actions using keyboard hotkeys. Ensure shortcuts are toggled ON to use these.</p>
                <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
                    <div class="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/40">
                        <span class="text-slate-300 font-bold">Focus Buy/Long Input</span>
                        <kbd class="px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-black text-cyan-400">Alt + B</kbd>
                    </div>
                    <div class="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/40">
                        <span class="text-slate-300 font-bold">Focus Sell/Short Input</span>
                        <kbd class="px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-black text-cyan-400">Alt + S</kbd>
                    </div>
                    <div class="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/40">
                        <span class="text-slate-300 font-bold">Cancel Last Open Order</span>
                        <kbd class="px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-black text-cyan-400">Alt + C</kbd>
                    </div>
                    <div class="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/40">
                        <span class="text-slate-300 font-bold">Toggle Order Type (Limit/Market)</span>
                        <kbd class="px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-black text-cyan-400">Alt + M</kbd>
                    </div>
                    <div class="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/40">
                        <span class="text-slate-300 font-bold">Close Active Modal</span>
                        <kbd class="px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-black text-cyan-400">Esc</kbd>
                    </div>
                </div>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2 cursor-pointer" onclick="closeSettingsModal()">Close</button>
            </div>
        `);
    });

    // Password Edit Form
    document.getElementById("editPasswordBtn")?.addEventListener("click", () => {
        showModal("Change Password", `
            <form id="txChangePasswordForm" class="space-y-4 p-5">
                <div>
                    <div class="flex justify-between items-center mb-1.5">
                        <label class="block text-xs font-bold text-slate-400 uppercase">Current Password</label>
                        <a href="/src/pages/forgot-password.html" class="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 transition hover:underline">Forgot Password?</a>
                    </div>
                    <div class="relative">
                        <input type="password" id="curPass" class="w-full bg-slate-900 border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400" required />
                        <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer focus:outline-none" onclick="togglePasswordVisibility('curPass', this)">
                            <svg class="w-4 h-4 show-pass" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                            <svg class="w-4 h-4 hide-pass hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                        </button>
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-400 mb-1.5 uppercase">New Password</label>
                    <div class="relative">
                        <input type="password" id="newPass" class="w-full bg-slate-900 border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400" required />
                        <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer focus:outline-none" onclick="togglePasswordVisibility('newPass', this)">
                            <svg class="w-4 h-4 show-pass" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                            <svg class="w-4 h-4 hide-pass hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                        </button>
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Confirm New Password</label>
                    <div class="relative">
                        <input type="password" id="confirmNewPass" class="w-full bg-slate-900 border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400" required />
                        <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer focus:outline-none" onclick="togglePasswordVisibility('confirmNewPass', this)">
                            <svg class="w-4 h-4 show-pass" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                            <svg class="w-4 h-4 hide-pass hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                        </button>
                    </div>
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="button" class="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer" onclick="closeSettingsModal()">Cancel</button>
                    <button type="submit" class="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-2.5 rounded-xl text-xs transition cursor-pointer">Change</button>
                </div>
            </form>
        `, (modalEl) => {
            modalEl.querySelector("form").addEventListener("submit", async (e) => {
                e.preventDefault();
                const currentPassword = document.getElementById("curPass").value;
                const newPassword = document.getElementById("newPass").value;
                const confirmPassword = document.getElementById("confirmNewPass").value;

                if (newPassword !== confirmPassword) {
                    showToast("New passwords do not match!", "error");
                    return;
                }

                try {
                    const response = await apiRequest("/user/change-password", {
                        method: "PATCH",
                        body: JSON.stringify({
                            current_password: currentPassword,
                            new_password: newPassword,
                            confirm_password: confirmPassword
                        })
                    });

                    if (response && response.success) {
                        showToast(response.message || "Password changed successfully!", "success");
                        closeSettingsModal();
                    } else {
                        showToast(response.message || "Failed to change password.", "error");
                    }
                } catch (err) {
                    showToast(err.message || "An error occurred while changing password.", "error");
                }
            });
        });
    });
    // Two Factor Enable/Disable Toggle via Email Verification
    document.getElementById("enableTwoFactorBtn")?.addEventListener("click", () => {
        const active = user.two_factor_enabled === true;
        const action = active ? "disable" : "enable";
        const actionLabel = active ? "Disable" : "Enable";

        // Open modal instantly with spinner loader
        showModal(`Confirm ${actionLabel} 2FA`, `
            <div id="modal2faLoadingContainer" class="p-6 text-center space-y-4">
                <div class="inline-block w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-xs text-slate-400 font-bold uppercase tracking-wider">Requesting Verification Code...</p>
            </div>
            
            <form id="tx2faToggleForm" class="space-y-4 p-5 text-sm text-center hidden">
                <p class="text-slate-400 text-xs leading-relaxed">
                    We have sent a 6-digit confirmation code to your email <span class="font-bold text-white" id="modal2faMaskedEmail"></span>.
                    Enter it below to authorize this action.
                </p>

                <!-- Modal error message -->
                <div id="modal2faToggleMessage" class="hidden rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-2.5 text-xs font-bold text-red-400"></div>

                <div>
                    <input
                        type="text"
                        id="modal2faToggleCode"
                        placeholder="000000"
                        maxlength="6"
                        class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-center text-xl tracking-[0.4em] font-black focus:outline-none focus:border-cyan-400"
                        required
                    />
                </div>

                <div class="flex gap-3 pt-2">
                    <button type="button" class="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer" onclick="closeSettingsModal()">Cancel</button>
                    <button type="submit" id="modal2faToggleSubmitBtn" class="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-2.5 rounded-xl text-xs transition cursor-pointer">Confirm</button>
                </div>
            </form>
        `, async (modalEl) => {
            const loadingContainer = document.getElementById("modal2faLoadingContainer");
            const form = document.getElementById("tx2faToggleForm");
            const maskedEmailSpan = document.getElementById("modal2faMaskedEmail");
            const codeInput = document.getElementById("modal2faToggleCode");

            try {
                const response = await apiRequest("/user/two-factor/request", {
                    method: "POST",
                    body: JSON.stringify({ action: action })
                });

                if (response && response.success) {
                    const data = response.data;
                    if (maskedEmailSpan) maskedEmailSpan.textContent = data.masked_email;

                    // Show form and hide loading spinner
                    loadingContainer?.classList.add("hidden");
                    form?.classList.remove("hidden");
                    codeInput?.focus();

                    // Format input to numbers only
                    codeInput?.addEventListener("input", function () {
                        codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
                    });

                    // Submit form verify handler
                    form.addEventListener("submit", async (e) => {
                        e.preventDefault();
                        const code = codeInput?.value.trim() || "";
                        const errorMsg = document.getElementById("modal2faToggleMessage");
                        const submitBtn = document.getElementById("modal2faToggleSubmitBtn");

                        if (errorMsg) {
                            errorMsg.textContent = "";
                            errorMsg.classList.add("hidden");
                        }

                        if (!code || code.length !== 6) {
                            if (errorMsg) {
                                errorMsg.textContent = "Please enter a valid 6-digit code.";
                                errorMsg.classList.remove("hidden");
                            }
                            return;
                        }

                        try {
                            setButtonLoading(submitBtn, true, "Verifying...");

                            const verifyResponse = await apiRequest("/user/two-factor/verify", {
                                method: "POST",
                                body: JSON.stringify({
                                    code: code,
                                    pending_id: data.pending_id,
                                    action: action
                                })
                            });

                            if (verifyResponse && verifyResponse.success) {
                                const nextState = (action === "enable");
                                user.two_factor_enabled = nextState;
                                saveAuthData(getAuthToken(), user);
                                updateTwoFactorUI(user);
                                closeSettingsModal();
                                showToast(`Two-Factor Authentication ${nextState ? "enabled" : "disabled"} successfully!`, "success");
                            } else {
                                if (errorMsg) {
                                    errorMsg.textContent = verifyResponse.message || "Verification failed.";
                                    errorMsg.classList.remove("hidden");
                                }
                            }
                        } catch (err) {
                            const errMsg = showApiError(err, "Incorrect verification code or expired session.");
                            if (errorMsg) {
                                errorMsg.textContent = errMsg;
                                errorMsg.classList.remove("hidden");
                            }
                        } finally {
                            setButtonLoading(submitBtn, false);
                        }
                    });
                } else {
                    closeSettingsModal();
                    showToast(response.message || "Failed to initiate Two-Factor Authentication request.", "error");
                }
            } catch (err) {
                closeSettingsModal();
                showToast(err.message || "An error occurred while initiating Two-Factor Authentication.", "error");
            }
        });
    });

    // (Manage button for QR/Key authentication removed per user request)

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


    // Download Data
    document.getElementById("downloadDataBtn")?.addEventListener("click", async () => {
        showToast("Personal data PDF download initiated!", "success");
        try {
            const [profileRes, walletRes] = await Promise.all([
                apiRequest("/user/profile"),
                apiRequest("/wallet/balance")
            ]);
            
            const userProfile = (profileRes && profileRes.success && profileRes.data && profileRes.data.user) || user;
            const walletData = (walletRes && walletRes.success && walletRes.data && walletRes.data.wallet) || {};

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4"
            });

            // Colors
            const primaryColor = [16, 185, 129]; // Emerald Green
            const textColor = [30, 41, 59]; // Dark Slate

            // Title Header
            doc.setFont("helvetica", "bold");
            doc.setFontSize(22);
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.text("TRAIDIUMX EXCHANGE", 20, 25);

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 116, 139); // Muted slate
            doc.text("PERSONAL PROFILE & PREFERENCES STATEMENT", 20, 31);
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 36);

            // Draw line
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.5);
            doc.line(20, 42, 190, 42);

            // Section 1: Profile Information
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.setTextColor(textColor[0], textColor[1], textColor[textColor.length - 1]);
            doc.text("1. User Profile Details", 20, 54);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            doc.setTextColor(71, 85, 105);

            doc.text(`Full Name:`, 25, 64);
            doc.setFont("helvetica", "bold");
            doc.text(`${userProfile.name || "User"}`, 75, 64);

            doc.setFont("helvetica", "normal");
            doc.text(`Email Address:`, 25, 71);
            doc.setFont("helvetica", "bold");
            doc.text(`${userProfile.email || "user@email.com"}`, 75, 71);

            doc.setFont("helvetica", "normal");
            doc.text(`Mobile Number:`, 25, 78);
            doc.setFont("helvetica", "bold");
            doc.text(`${userProfile.mobile || "Not Linked"}`, 75, 78);

            doc.setFont("helvetica", "normal");
            doc.text(`KYC Status:`, 25, 85);
            doc.setFont("helvetica", "bold");
            doc.text(`${(userProfile.kyc_status || "Verified").toUpperCase()}`, 75, 85);

            doc.setFont("helvetica", "normal");
            doc.text(`Client ID:`, 25, 92);
            doc.setFont("helvetica", "bold");
            doc.text(`${userProfile.client_id || "N/A"}`, 75, 92);

            doc.setFont("helvetica", "normal");
            doc.text(`Auth Provider:`, 25, 99);
            doc.setFont("helvetica", "bold");
            doc.text(`${(userProfile.auth_provider || "password").toUpperCase()}`, 75, 99);

            doc.setFont("helvetica", "normal");
            doc.text(`Two-Factor Auth:`, 25, 106);
            doc.setFont("helvetica", "bold");
            doc.text(`${userProfile.two_factor_enabled ? "ENABLED" : "DISABLED"}`, 75, 106);

            doc.setFont("helvetica", "normal");
            doc.text(`Date Registered:`, 25, 113);
            doc.setFont("helvetica", "bold");
            doc.text(`${userProfile.created_at ? new Date(userProfile.created_at).toLocaleDateString() : "N/A"}`, 75, 113);

            // Section 2: Preferences
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.setTextColor(textColor[0], textColor[1], textColor[textColor.length - 1]);
            doc.text("2. Settings & Preferences", 20, 129);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            doc.setTextColor(71, 85, 105);

            const language = localStorage.getItem("tx_language") || "English";
            const colorPreference = localStorage.getItem("tx_color_pref") || "Green Up / Red Down";
            const stylePreference = localStorage.getItem("tx_style_pref") || "Fresh";
            const timezone = localStorage.getItem("tx_timezone") || "Last 24 hours (UTC)";
            const withdrawSetting = localStorage.getItem("tx_withdraw_setting") || "Off-Chain Withdrawal";

            doc.text(`Default Language:`, 25, 139);
            doc.setFont("helvetica", "bold");
            doc.text(`${language}`, 75, 139);

            doc.setFont("helvetica", "normal");
            doc.text(`Color Scheme:`, 25, 146);
            doc.setFont("helvetica", "bold");
            doc.text(`${colorPreference}`, 75, 146);

            doc.setFont("helvetica", "normal");
            doc.text(`Style Theme:`, 25, 153);
            doc.setFont("helvetica", "bold");
            doc.text(`${stylePreference}`, 75, 153);

            doc.setFont("helvetica", "normal");
            doc.text(`Default Timezone:`, 25, 160);
            doc.setFont("helvetica", "bold");
            doc.text(`${timezone}`, 75, 160);

            doc.setFont("helvetica", "normal");
            doc.text(`Withdrawal Mode:`, 25, 167);
            doc.setFont("helvetica", "bold");
            doc.text(`${withdrawSetting}`, 75, 167);

            // Section 3: Wallet Addresses
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.setTextColor(textColor[0], textColor[1], textColor[textColor.length - 1]);
            doc.text("3. Wallet Deposit Addresses", 20, 183);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.setTextColor(71, 85, 105);

            const getAddr = (coin, net) => {
                const bucket = walletData[`main_wallet_${coin.toLowerCase()}`];
                return (bucket && bucket.addresses && bucket.addresses[net]) || "None generated";
            };

            doc.text(`INR Address:`, 25, 193);
            doc.setFont("helvetica", "bold");
            doc.text(`${userProfile.client_id || "None generated"}`, 75, 193);

            doc.setFont("helvetica", "normal");
            doc.text(`USDT (TRC20) Address:`, 25, 200);
            doc.setFont("helvetica", "bold");
            doc.text(`${getAddr("USDT", "TRC20")}`, 75, 200);

            doc.setFont("helvetica", "normal");
            doc.text(`BTC (BITCOIN) Address:`, 25, 207);
            doc.setFont("helvetica", "bold");
            doc.text(`${getAddr("BTC", "BITCOIN")}`, 75, 207);

            doc.setFont("helvetica", "normal");
            doc.text(`ETH (ERC20) Address:`, 25, 214);
            doc.setFont("helvetica", "bold");
            doc.text(`${getAddr("ETH", "ERC20")}`, 75, 214);

            doc.setFont("helvetica", "normal");
            doc.text(`SOL (SOLANA) Address:`, 25, 221);
            doc.setFont("helvetica", "bold");
            doc.text(`${getAddr("SOL", "SOLANA")}`, 75, 221);

            // Footer
            doc.setDrawColor(226, 232, 240);
            doc.line(20, 260, 190, 260);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184);
            doc.text("TraidiumX Exchange — Secure Digital Assets Workspace Statement.", 20, 268);
            doc.text("Page 1 of 1", 170, 268);

            doc.save("traidiumx_personal_data.pdf");
        } catch (err) {
            console.error("PDF Download failed", err);
            showToast("Failed to generate PDF.", "error");
        }
    });

    // Export Records
    document.getElementById("exportRecordsBtn")?.addEventListener("click", async () => {
        showToast("Accounting statement export initiated!", "success");
        try {
            const [ledgerRes, depositRes, withdrawalRes] = await Promise.allSettled([
                apiRequest("/wallet/ledger"),
                apiRequest("/deposit/history"),
                apiRequest("/withdrawal/history")
            ]);

            const ledgerData = (ledgerRes.status === "fulfilled" && ledgerRes.value?.success && ledgerRes.value?.data?.ledger) || [];
            const depositsData = (depositRes.status === "fulfilled" && depositRes.value?.success && (depositRes.value?.data?.deposits || depositRes.value?.data)) || [];
            const withdrawalsData = (withdrawalRes.status === "fulfilled" && withdrawalRes.value?.success && (withdrawalRes.value?.data?.withdrawals || withdrawalRes.value?.data)) || [];

            const typeLabels = {
                "DEPOSIT": "Deposit",
                "WITHDRAWAL": "Withdrawal",
                "INTERNAL_TRANSFER_CREDIT": "Internal Transfer (In)",
                "INTERNAL_TRANSFER_DEBIT": "Internal Transfer (Out)",
                "TRADING_CREDIT": "Trading Income",
                "TRADING_DEBIT": "Trading Expense",
                "PLAN_FILL": "Trading Margin Fill",
                "PLAN_CLOSE_PROFIT": "Trading Profit Realized",
                "PLATFORM_FEE": "Platform Maintenance Fee"
            };

            function formatTxType(type) {
                if (!type) return "Transaction";
                const upper = String(type).toUpperCase();
                if (typeLabels[upper]) return typeLabels[upper];
                return upper.split("_").map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(" ");
            }

            function formatDateStr(val) {
                if (!val) return "--";
                return String(val).replace("T", " ").substring(0, 19);
            }

            // 1. Format Deposits Rows
            const depositRows = (Array.isArray(depositsData) ? depositsData : []).map(d => {
                const date = formatDateStr(d.created_at);
                const ref = d.deposit_reference || d.reference_id || d.id || "--";
                const assetNet = `${d.crypto_asset || d.currency || "USDT"}${d.crypto_network ? " / " + d.crypto_network : ""}`;
                const cur = String(d.crypto_asset || d.currency || "USDT").toUpperCase();
                const sign = cur === "INR" || cur === "₹" ? "₹" : (cur === "USDT" || cur === "$" ? "$" : "");
                const amt = `+${sign}${Number(d.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
                const st = String(d.status || d.verification_status || "completed").toUpperCase().replaceAll("_", " ");
                return [date, ref, assetNet, amt, st];
            });
            depositRows.sort((a, b) => new Date(b[0] || 0) - new Date(a[0] || 0));

            // 2. Format Withdrawals Rows
            const withdrawalRows = (Array.isArray(withdrawalsData) ? withdrawalsData : []).map(w => {
                const date = formatDateStr(w.created_at);
                const ref = w.withdrawal_reference || w.reference_id || w.id || "--";
                const assetNet = `${w.crypto_asset || w.currency || "USDT"}${w.crypto_network ? " / " + w.crypto_network : ""}`;
                const dest = w.withdrawal_address ? (w.withdrawal_address.length > 25 ? w.withdrawal_address.substring(0, 22) + "..." : w.withdrawal_address) : (w.bank_name ? `${w.bank_name} (${w.account_number || ""})` : "--");
                const cur = String(w.crypto_asset || w.currency || "USDT").toUpperCase();
                const sign = cur === "INR" || cur === "₹" ? "₹" : (cur === "USDT" || cur === "$" ? "$" : "");
                const amt = `-${sign}${Number(w.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
                const st = String(w.status_label || w.status || "completed").toUpperCase().replaceAll("_", " ");
                return [date, ref, assetNet, dest, amt, st];
            });
            withdrawalRows.sort((a, b) => new Date(b[0] || 0) - new Date(a[0] || 0));

            // 3. Format Ledger Rows
            const ledgerRows = (Array.isArray(ledgerData) ? ledgerData : []).map(t => {
                const date = formatDateStr(t.created_at);
                const type = formatTxType(t.transaction_type);
                const desc = t.description || "--";
                const cur = String(t.currency || "USDT").toUpperCase();
                const sign = t.direction === "debit" ? "-" : "+";
                const amt = `${sign}${Number(t.amount || 0).toFixed(2)}`;
                const st = String(t.status || "completed").toUpperCase();
                return [date, type, desc, cur, amt, st];
            });
            ledgerRows.sort((a, b) => new Date(b[0] || 0) - new Date(a[0] || 0));

            if (depositRows.length === 0) {
                depositRows.push(["--", "No deposit history found", "--", "--", "--"]);
            }
            if (withdrawalRows.length === 0) {
                withdrawalRows.push(["--", "No withdrawal history found", "--", "--", "--", "--"]);
            }
            if (ledgerRows.length === 0) {
                ledgerRows.push(["--", "No ledger history found", "--", "--", "--", "--"]);
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4"
            });

            // Title Header
            doc.setFont("helvetica", "bold");
            doc.setFontSize(22);
            doc.setTextColor(15, 23, 42); // Black / Dark Slate
            doc.text("TRAIDIUMX EXCHANGE", 14, 18);

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 116, 139); // Muted slate
            doc.text("ACCOUNTING & TRANSACTION STATEMENT", 14, 24);
            
            // User info summary
            doc.setFontSize(9.5);
            doc.setTextColor(71, 85, 105);
            doc.text(`Client Name: ${user.name || "User"}`, 14, 32);
            doc.text(`Client Email: ${user.email || "user@email.com"}`, 14, 37);
            doc.text(`Statement Period: All-Time Complete History`, 14, 42);
            doc.text(`Issued On: ${new Date().toLocaleString()}`, 14, 47);

            // Divider line
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.4);
            doc.line(14, 51, 196, 51);

            let currentY = 58;

            const drawPageFooter = function (data) {
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text("TraidiumX Exchange — Official Transaction & Balance Statement.", 14, 285);
                doc.text(`Page ${data.pageNumber}`, 180, 285);
            };

            function ensureSpace(heightNeeded = 25) {
                if (currentY + heightNeeded > 270) {
                    doc.addPage();
                    currentY = 20;
                }
            }

            // ==========================================
            // SECTION 1: DEPOSITS HISTORY
            // ==========================================
            ensureSpace(25);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.setTextColor(15, 23, 42); // Black / Dark Slate
            doc.text("1. DEPOSIT TRANSACTIONS HISTORY", 14, currentY);
            currentY += 4;

            doc.autoTable({
                head: [["Date", "Reference", "Asset / Network", "Amount", "Status"]],
                body: depositRows,
                startY: currentY,
                theme: "striped",
                headStyles: {
                    fillColor: [15, 23, 42], // Black / Dark Slate
                    textColor: [255, 255, 255],
                    fontStyle: "bold",
                    fontSize: 9
                },
                bodyStyles: {
                    textColor: [51, 65, 85],
                    fontSize: 8.5
                },
                columnStyles: {
                    0: { cellWidth: 38 }, // Date
                    1: { cellWidth: 46 }, // Ref
                    2: { cellWidth: 36 }, // Asset/Net
                    3: { cellWidth: 34 }, // Amount
                    4: { cellWidth: 28 }  // Status
                },
                margin: { left: 14, right: 14 },
                didDrawPage: drawPageFooter
            });

            currentY = doc.lastAutoTable.finalY + 10;

            // ==========================================
            // SECTION 2: WITHDRAWALS HISTORY
            // ==========================================
            ensureSpace(25);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.setTextColor(15, 23, 42); // Black / Dark Slate
            doc.text("2. WITHDRAWAL TRANSACTIONS HISTORY", 14, currentY);
            currentY += 4;

            doc.autoTable({
                head: [["Date", "Reference", "Asset / Network", "Destination", "Amount", "Status"]],
                body: withdrawalRows,
                startY: currentY,
                theme: "striped",
                headStyles: {
                    fillColor: [15, 23, 42], // Black / Dark Slate
                    textColor: [255, 255, 255],
                    fontStyle: "bold",
                    fontSize: 9
                },
                bodyStyles: {
                    textColor: [51, 65, 85],
                    fontSize: 8.5
                },
                columnStyles: {
                    0: { cellWidth: 34 }, // Date
                    1: { cellWidth: 40 }, // Ref
                    2: { cellWidth: 30 }, // Asset/Net
                    3: { cellWidth: 36 }, // Dest
                    4: { cellWidth: 22 }, // Amount
                    5: { cellWidth: 20 }  // Status
                },
                margin: { left: 14, right: 14 },
                didDrawPage: drawPageFooter
            });

            currentY = doc.lastAutoTable.finalY + 10;

            // ==========================================
            // SECTION 3: GENERAL LEDGER & TRADING HISTORY
            // ==========================================
            ensureSpace(25);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.setTextColor(15, 23, 42); // Black / Dark Slate
            doc.text("3. ACCOUNT LEDGER & TRADING HISTORY", 14, currentY);
            currentY += 4;

            doc.autoTable({
                head: [["Date", "Type", "Description", "Currency", "Amount", "Status"]],
                body: ledgerRows,
                startY: currentY,
                theme: "striped",
                headStyles: {
                    fillColor: [15, 23, 42], // Slate 900
                    textColor: [255, 255, 255],
                    fontStyle: "bold",
                    fontSize: 9
                },
                bodyStyles: {
                    textColor: [51, 65, 85],
                    fontSize: 8.5
                },
                columnStyles: {
                    0: { cellWidth: 35 }, // Date
                    1: { cellWidth: 35 }, // Type
                    2: { cellWidth: 50 }, // Description
                    3: { cellWidth: 18 }, // Currency
                    4: { cellWidth: 24 }, // Amount
                    5: { cellWidth: 20 }  // Status
                },
                margin: { left: 14, right: 14 },
                didDrawPage: drawPageFooter
            });

            doc.save("traidiumx_transaction_statement.pdf");
        } catch (err) {
            console.error("Export failed", err);
            showToast("Failed to fetch live history records.", "error");
        }
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

    // Privacy Portal Modal
    document.getElementById("enterPrivacyPortalBtn")?.addEventListener("click", () => {
        const perf = localStorage.getItem("tx_cookie_performance") !== "OFF";
        const mark = localStorage.getItem("tx_cookie_marketing") !== "OFF";
        const share = localStorage.getItem("tx_cookie_sharing") === "ON";

        showModal("Privacy Portal", `
            <form id="txPrivacyPortalForm" class="space-y-4 p-5">
                <p class="text-slate-400 text-xs mb-2">Manage your data permissions, cookie settings, and tracking preferences below.</p>
                <div class="flex justify-between items-center">
                    <div>
                        <span class="text-sm font-bold text-white block">Performance Cookies</span>
                        <span class="text-[10px] text-slate-400 block">Help us analyze platform usage.</span>
                    </div>
                    <label class="tx-switch font-normal">
                        <input type="checkbox" id="cookiePerfToggle" ${perf ? 'checked' : ''} />
                        <span class="tx-slider"></span>
                    </label>
                </div>
                <div class="flex justify-between items-center border-t border-slate-800/40 pt-3">
                    <div>
                        <span class="text-sm font-bold text-white block">Marketing Cookies</span>
                        <span class="text-[10px] text-slate-400 block">Provide personalized exchange alerts.</span>
                    </div>
                    <label class="tx-switch font-normal">
                        <input type="checkbox" id="cookieMarkToggle" ${mark ? 'checked' : ''} />
                        <span class="tx-slider"></span>
                    </label>
                </div>
                <div class="flex justify-between items-center border-t border-slate-800/40 pt-3">
                    <div>
                        <span class="text-sm font-bold text-white block">Third Party Sharing</span>
                        <span class="text-[10px] text-slate-400 block">Share stats with analytics providers.</span>
                    </div>
                    <label class="tx-switch font-normal">
                        <input type="checkbox" id="cookieShareToggle" ${share ? 'checked' : ''} />
                        <span class="tx-slider"></span>
                    </label>
                </div>
                <div class="flex gap-3 pt-2 border-t border-slate-800/40">
                    <button type="button" class="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer" onclick="closeSettingsModal()">Cancel</button>
                    <button type="submit" class="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-2.5 rounded-xl text-xs transition cursor-pointer">Save Preferences</button>
                </div>
            </form>
        `, (modalEl) => {
            modalEl.querySelector("form").addEventListener("submit", (e) => {
                e.preventDefault();
                const p = document.getElementById("cookiePerfToggle").checked;
                const m = document.getElementById("cookieMarkToggle").checked;
                const s = document.getElementById("cookieShareToggle").checked;

                localStorage.setItem("tx_cookie_performance", p ? "ON" : "OFF");
                localStorage.setItem("tx_cookie_marketing", m ? "ON" : "OFF");
                localStorage.setItem("tx_cookie_sharing", s ? "ON" : "OFF");

                closeSettingsModal();
                showToast("Privacy preferences updated successfully!", "success");
            });
        });
    });

    // Withdraw Setting Edit
    document.getElementById("editWithdrawSettingBtn")?.addEventListener("click", () => {
        const currentWithdraw = localStorage.getItem("tx_withdraw_setting") || "Off-Chain Withdrawal";
        showModal("Withdrawal Setting", `
            <div class="space-y-2 p-5 text-sm">
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setWithdrawSetting('On-Chain Withdrawal')">
                    <span>On-Chain Withdrawal</span>
                    ${currentWithdraw === 'On-Chain Withdrawal' ? '<span class="text-emerald-400 font-bold">✓</span>' : ''}
                </button>
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setWithdrawSetting('Off-Chain Withdrawal')">
                    <span>Bank / Off-Chain Withdrawal</span>
                    ${currentWithdraw === 'Off-Chain Withdrawal' ? '<span class="text-emerald-400 font-bold">✓</span>' : ''}
                </button>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2 cursor-pointer" onclick="closeSettingsModal()">Cancel</button>
            </div>
        `);
    });

    // Address Management Modal
    document.getElementById("addressManageLink")?.addEventListener("click", (e) => {
        e.preventDefault();
        openAddressManagementModal();
    });

    // Order Confirmation Reminders Modal
    document.getElementById("manageOrderConfirmBtn")?.addEventListener("click", () => {
        const saved = localStorage.getItem("tx_confirm_reminders") || "Market, Limit, Stop-Limit";
        const items = saved.split(",").map(s => s.trim());
        const hasMarket = items.includes("Market");
        const hasLimit = items.includes("Limit");
        const hasStopLimit = items.includes("Stop-Limit");

        showModal("Order Confirm Reminders", `
            <form id="txOrderConfirmForm" class="space-y-4 p-5">
                <div class="flex justify-between items-center">
                    <span class="text-sm font-bold text-white">Market Orders</span>
                    <label class="tx-switch">
                        <input type="checkbox" id="confirmMarketToggle" ${hasMarket ? 'checked' : ''} />
                        <span class="tx-slider"></span>
                    </label>
                </div>
                <div class="flex justify-between items-center border-t border-slate-800/40 pt-3">
                    <span class="text-sm font-bold text-white">Limit Orders</span>
                    <label class="tx-switch">
                        <input type="checkbox" id="confirmLimitToggle" ${hasLimit ? 'checked' : ''} />
                        <span class="tx-slider"></span>
                    </label>
                </div>
                <div class="flex justify-between items-center border-t border-slate-800/40 pt-3">
                    <span class="text-sm font-bold text-white">Stop-Limit Orders</span>
                    <label class="tx-switch">
                        <input type="checkbox" id="confirmStopLimitToggle" ${hasStopLimit ? 'checked' : ''} />
                        <span class="tx-slider"></span>
                    </label>
                </div>
                <div class="flex gap-3 pt-2 border-t border-slate-800/40">
                    <button type="button" class="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer" onclick="closeSettingsModal()">Cancel</button>
                    <button type="submit" class="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-2.5 rounded-xl text-xs transition cursor-pointer">Save</button>
                </div>
            </form>
        `, (modalEl) => {
            modalEl.querySelector("form").addEventListener("submit", (e) => {
                e.preventDefault();
                const market = document.getElementById("confirmMarketToggle").checked;
                const limit = document.getElementById("confirmLimitToggle").checked;
                const stopLimit = document.getElementById("confirmStopLimitToggle").checked;

                const selected = [];
                if (market) selected.push("Market");
                if (limit) selected.push("Limit");
                if (stopLimit) selected.push("Stop-Limit");

                const val = selected.length > 0 ? selected.join(", ") : "None";
                localStorage.setItem("tx_confirm_reminders", val);
                
                const el = document.getElementById("orderConfirmDisplay");
                if (el) el.textContent = val;
                closeSettingsModal();
                showToast("Order confirm settings saved!", "success");
            });
        });
    });

    // Close All Sound Modal
    document.getElementById("manageCloseSoundBtn")?.addEventListener("click", () => {
        const currentSound = localStorage.getItem("tx_close_sound") || "Default";
        showModal("Close All Sound", `
            <div class="space-y-2 p-5 text-sm">
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setCloseSound('Default')">
                    <span>Default Sound (Chime)</span>
                    ${currentSound === 'Default' ? '<span class="text-emerald-400 font-bold">✓</span>' : ''}
                </button>
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setCloseSound('Mute')">
                    <span>Mute (No Sound)</span>
                    ${currentSound === 'Mute' ? '<span class="text-emerald-400 font-bold">✓</span>' : ''}
                </button>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2 cursor-pointer" onclick="closeSettingsModal()">Cancel</button>
            </div>
        `);
    });

    // Fee Deduction Modal
    document.getElementById("manageFeeDeductionBtn")?.addEventListener("click", () => {
        const currentDeduction = localStorage.getItem("tx_fee_deduction") || "Spot Fees";
        showModal("Fee Deduction", `
            <div class="space-y-2 p-5 text-sm">
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setFeeDeduction('Spot Fees')">
                    <span>Spot Fees (Standard)</span>
                    ${currentDeduction === 'Spot Fees' ? '<span class="text-emerald-400 font-bold">✓</span>' : ''}
                </button>
                <button class="w-full text-left bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 hover:border-cyan-400 transition flex justify-between items-center cursor-pointer" onclick="setFeeDeduction('TX Token')">
                    <span>Pay in TX Token (25% Discount)</span>
                    ${currentDeduction === 'TX Token' ? '<span class="text-emerald-400 font-bold">✓</span>' : ''}
                </button>
                <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2 cursor-pointer" onclick="closeSettingsModal()">Cancel</button>
            </div>
        `);
    });
}

function initToggles(user) {
    updateNotifPrefUI();
    updateWhitelistUI();
    updateOnestepUI();
    updateTwoFactorUI(user);

    // Theme toggle switcher init
    const curTheme = localStorage.getItem("traidiumx_theme") || "dark";
    updateThemeToggleUI(curTheme);

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
    const email = localStorage.getItem("tx_notif_email") !== "OFF";
    const push = localStorage.getItem("tx_notif_push") !== "OFF";
    const inapp = localStorage.getItem("tx_notif_inapp") !== "OFF";
    const icon = document.getElementById("notifPrefIcon");
    const text = document.getElementById("notifPrefDisplay");

    if (icon && text) {
        const enabledCount = (email ? 1 : 0) + (push ? 1 : 0) + (inapp ? 1 : 0);
        if (enabledCount === 3) {
            icon.className = "tx-status-icon-on";
            icon.textContent = "✓";
            text.textContent = "All Enabled";
        } else if (enabledCount === 0) {
            icon.className = "tx-status-icon-off";
            icon.textContent = "✕";
            text.textContent = "Disabled";
        } else {
            icon.className = "tx-status-icon-on";
            icon.textContent = "✓";
            const parts = [];
            if (email) parts.push("Email");
            if (push) parts.push("Push");
            if (inapp) parts.push("In-App");
            text.textContent = parts.join(", ");
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

function updateTwoFactorUI(user) {
    if (!user) return;
    const active = user.two_factor_enabled === true;
    const icon = document.getElementById("twoFactorIcon");
    const text = document.getElementById("twoFactorDisplay");
    const btn = document.getElementById("enableTwoFactorBtn");

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
    localStorage.setItem("tx_language", lang);
    const el = document.getElementById("languageDisplay");
    if (el) el.textContent = lang;
    closeSettingsModal();
    window.location.reload();
};

window.setColorPref = function (val) {
    localStorage.setItem("tx_color_pref", val);
    const el = document.getElementById("colorPrefDisplay");
    if (el) el.textContent = val;
    closeSettingsModal();
};

window.setStylePref = function (val) {
    localStorage.setItem("tx_style_pref", val);
    const el = document.getElementById("stylePrefDisplay");
    if (el) el.textContent = val;
    closeSettingsModal();
};

window.setTimezone = function (val) {
    localStorage.setItem("tx_timezone", val);
    const el = document.getElementById("timezoneDisplay");
    if (el) el.textContent = val;
    closeSettingsModal();
};

window.setWithdrawSetting = function (val) {
    localStorage.setItem("tx_withdraw_setting", val);
    const el = document.getElementById("withdrawSettingDisplay");
    if (el) el.textContent = val;
    closeSettingsModal();
};

window.setCloseSound = function (val) {
    localStorage.setItem("tx_close_sound", val);
    const el = document.getElementById("closeSoundDisplay");
    if (el) el.textContent = val;
    closeSettingsModal();
};

window.setFeeDeduction = function (val) {
    localStorage.setItem("tx_fee_deduction", val);
    const el = document.getElementById("feeDeductionDisplay");
    if (el) el.textContent = val;
    closeSettingsModal();
};


window.confirmDeleteAccount = function () {
    showToast("Account deletion request submitted!", "success");
    closeSettingsModal();
    setTimeout(() => {
        clearAuthData();
        window.location.href = "/";
    }, 1500);
};

function escapeSettingsHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

window.togglePasswordVisibility = function (inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const showIcon = btn.querySelector(".show-pass");
    const hideIcon = btn.querySelector(".hide-pass");

    if (input.type === "password") {
        input.type = "text";
        showIcon.classList.add("hidden");
        hideIcon.classList.remove("hidden");
    } else {
        input.type = "password";
        showIcon.classList.remove("hidden");
        hideIcon.classList.add("hidden");
    }
};

window.showToast = function (message, type = "success") {
    let container = document.getElementById("txToastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "txToastContainer";
        container.className = "fixed top-6 right-6 z-[10000] flex flex-col gap-3 pointer-events-none";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    const borderClass = type === "success" ? "border-emerald-500/30" : "border-red-500/30";
    const bgClass = "bg-slate-900/95";
    const textClass = type === "success" ? "text-emerald-400" : "text-red-400";
    const icon = type === "success" ? "✓" : "✕";

    toast.className = `flex items-center gap-3 max-w-sm rounded-2xl border ${borderClass} ${bgClass} px-5 py-4 text-xs font-bold ${textClass} shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-y-4 opacity-0 pointer-events-auto`;
    toast.innerHTML = `
        <span class="flex items-center justify-center w-5 h-5 rounded-full ${type === 'success' ? 'bg-emerald-500/10' : 'bg-red-500/10'} text-xs">${icon}</span>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove("translate-y-4", "opacity-0");
        toast.classList.add("translate-y-0", "opacity-100");
    }, 10);

    setTimeout(() => {
        toast.classList.remove("translate-y-0", "opacity-100");
        toast.classList.add("translate-y-4", "opacity-0");
        setTimeout(() => {
            toast.remove();
            if (container.children.length === 0) {
                container.remove();
            }
        }, 300);
    }, 3500);
};

function openAddressManagementModal() {
    let addresses = [];
    try {
        const stored = localStorage.getItem("tx_whitelisted_addresses");
        if (stored) {
            addresses = JSON.parse(stored);
        } else {
            addresses = [
                { coin: "BTC", label: "Binance BTC Wallet", address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa" },
                { coin: "USDT", label: "Metamask ERC20", address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" }
            ];
            localStorage.setItem("tx_whitelisted_addresses", JSON.stringify(addresses));
        }
    } catch (err) {
        addresses = [];
    }

    const renderList = () => {
        if (addresses.length === 0) {
            return `<p class="text-xs text-slate-400 text-center py-4">No whitelisted addresses found.</p>`;
        }
        return `
            <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
                ${addresses.map((item, idx) => `
                    <div class="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/40 text-xs">
                        <div class="flex flex-col min-w-0 flex-1 pr-3">
                            <div class="flex items-center gap-1.5 mb-1">
                                <span class="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 font-extrabold rounded text-[10px]">${item.coin}</span>
                                <span class="text-white font-bold truncate">${escapeSettingsHtml(item.label)}</span>
                            </div>
                            <span class="text-[10px] text-slate-400 font-mono truncate">${escapeSettingsHtml(item.address)}</span>
                        </div>
                        <button type="button" class="text-red-400 hover:text-red-300 font-black cursor-pointer px-2 py-1 focus:outline-none" onclick="deleteWhitelistedAddress(${idx})">✕</button>
                    </div>
                `).join("")}
            </div>
        `;
    };

    showModal("Address Management", `
        <div class="p-5 space-y-4">
            <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Whitelisted Addresses</h4>
            <div id="txAddressListContainer">
                ${renderList()}
            </div>

            <div class="border-t border-slate-800/60 pt-4">
                <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Add New Address</h4>
                <form id="txAddAddressForm" class="space-y-3">
                    <div class="grid grid-cols-3 gap-2">
                        <div class="col-span-1">
                            <label class="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Coin</label>
                            <select id="txNewAddrCoin" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-white text-xs focus:outline-none focus:border-cyan-400">
                                <option value="BTC">BTC</option>
                                <option value="ETH">ETH</option>
                                <option value="USDT">USDT</option>
                                <option value="SOL">SOL</option>
                            </select>
                        </div>
                        <div class="col-span-2">
                            <label class="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Label</label>
                            <input type="text" id="txNewAddrLabel" placeholder="e.g. My Ledger" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400" required />
                        </div>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Wallet Address</label>
                        <input type="text" id="txNewAddrVal" placeholder="Paste wallet address here" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-cyan-400" required />
                    </div>
                    <button type="submit" class="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-2 rounded-xl text-xs transition cursor-pointer mt-2">Add Address</button>
                </form>
            </div>

            <button type="button" class="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition mt-2 cursor-pointer" onclick="closeSettingsModal()">Close</button>
        </div>
    `, (modalEl) => {
        // Form submit handler
        modalEl.querySelector("#txAddAddressForm").addEventListener("submit", (e) => {
            e.preventDefault();
            const coin = document.getElementById("txNewAddrCoin").value;
            const label = document.getElementById("txNewAddrLabel").value.trim();
            const address = document.getElementById("txNewAddrVal").value.trim();

            if (label && address) {
                addresses.push({ coin, label, address });
                localStorage.setItem("tx_whitelisted_addresses", JSON.stringify(addresses));
                showToast("Address whitelisted successfully!", "success");
                
                // Re-render the list inside container
                const container = document.getElementById("txAddressListContainer");
                if (container) {
                    container.innerHTML = renderList();
                }
                
                // Reset form
                document.getElementById("txNewAddrLabel").value = "";
                document.getElementById("txNewAddrVal").value = "";
            }
        });
    });

    // Make deletion globally callable inside the modal context
    window.deleteWhitelistedAddress = function (index) {
        addresses.splice(index, 1);
        localStorage.setItem("tx_whitelisted_addresses", JSON.stringify(addresses));
        showToast("Address deleted from whitelist.", "success");
        
        const container = document.getElementById("txAddressListContainer");
        if (container) {
            container.innerHTML = renderList();
        }
    };
}

function updateThemeToggleUI(theme) {
    const themeToggleBtn = document.getElementById("themeToggleBtn");
    const themeToggleThumb = document.getElementById("themeToggleThumb");
    const themeStatusText = document.getElementById("themeStatusText");
    const sunIcon = document.getElementById("themeToggleSun");
    const moonIcon = document.getElementById("themeToggleMoon");

    if (!themeToggleBtn || !themeToggleThumb || !themeStatusText || !sunIcon || !moonIcon) return;

    if (theme === "light") {
        themeToggleBtn.style.backgroundColor = "#22d3ee"; // cyan-400
        themeToggleThumb.style.transform = "translateX(22px)";
        themeToggleThumb.style.backgroundColor = "#ffffff";
        themeToggleThumb.style.color = "#0f172a";
        
        sunIcon.classList.remove("hidden");
        moonIcon.classList.add("hidden");

        themeStatusText.textContent = "Light";
        themeToggleBtn.setAttribute("aria-checked", "true");
    } else {
        themeToggleBtn.style.backgroundColor = "#1e293b"; // slate-800
        themeToggleThumb.style.transform = "translateX(0px)";
        themeToggleThumb.style.backgroundColor = "#64748b"; // slate-500
        themeToggleThumb.style.color = "#0f172a";
        
        sunIcon.classList.add("hidden");
        moonIcon.classList.remove("hidden");

        themeStatusText.textContent = "Dark";
        themeToggleBtn.setAttribute("aria-checked", "false");
    }
}

function setButtonLoading(button, isLoading, loadingText = "Please wait...") {
    if (!button) return;

    if (isLoading) {
        button.dataset.originalText = button.textContent.trim();
        button.textContent = loadingText;
        button.disabled = true;
        button.classList.add("opacity-80", "cursor-not-allowed");
    } else {
        button.textContent = button.dataset.originalText || button.textContent;
        button.disabled = false;
        button.classList.remove("opacity-80", "cursor-not-allowed");
    }
}


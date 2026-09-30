"use strict";

const PROFILE_DEPOSIT_HISTORY_PAGE_SIZE = 12;
const PROFILE_WITHDRAWAL_HISTORY_PAGE_SIZE = 10;

const profileState = {
    user: null,
    kyc: null,
    deposits: [],
    withdrawals: [],
    depositPage: 1,
    withdrawalPage: 1
};

const profileEl = {
    message: document.getElementById("profileMessage"),
    accountStatus: document.getElementById("profileAccountStatus"),
    kycStatus: document.getElementById("profileKycStatus"),
    sessionStatus: document.getElementById("profileSessionStatus"),
    heroName: document.getElementById("profileHeroName"),
    heroEmail: document.getElementById("profileHeroEmail"),
    heroClientID: document.getElementById("profileHeroClientID"),
    avatarInitials: document.getElementById("profileAvatarInitials"),
    editBtn: document.getElementById("profileEditBtn"),
    editModal: document.getElementById("profileEditModal"),
    editModalPanel: document.querySelector("#profileEditModal .tx-profile-modal-panel"),
    editCloseBtn: document.getElementById("profileEditCloseBtn"),
    editCancelBtn: document.getElementById("profileEditCancelBtn"),
    nameText: document.getElementById("profileNameText"),
    emailText: document.getElementById("profileEmailText"),
    phoneText: document.getElementById("profilePhoneText"),
    createdText: document.getElementById("profileCreatedText"),
    form: document.getElementById("profileUpdateForm"),
    platformText: document.getElementById("profilePlatformText"),
    preferredPlanText: document.getElementById("profilePreferredPlanText"),
    mt5ConnectionSection: document.getElementById("profileMt5ConnectionSection"),
    mt5Form: document.getElementById("profileMt5Form"),
    nameInput: document.getElementById("profileName"),
    saveBtn: document.getElementById("profileSaveBtn"),
    nameError: document.getElementById("profileNameError"),
    passwordForm: document.getElementById("passwordChangeForm"),
    currentPassword: document.getElementById("currentPassword"),
    newPassword: document.getElementById("newPassword"),
    confirmNewPassword: document.getElementById("confirmNewPassword"),
    passwordBtn: document.getElementById("passwordChangeBtn"),
    currentPasswordError: document.getElementById("currentPasswordError"),
    newPasswordError: document.getElementById("newPasswordError"),
    confirmNewPasswordError: document.getElementById("confirmNewPasswordError"),
    historyRefreshBtn: document.getElementById("historyRefreshBtn"),
    depositCountText: document.getElementById("depositCountText"),
    withdrawalCountText: document.getElementById("withdrawalCountText"),
    latestActivityText: document.getElementById("latestActivityText"),
    depositHistoryList: document.getElementById("depositHistoryList"),
    withdrawalHistoryList: document.getElementById("withdrawalHistoryList"),
    depositHistoryEmpty: document.getElementById("depositHistoryEmpty"),
    withdrawalHistoryEmpty: document.getElementById("withdrawalHistoryEmpty"),
    depositHistoryPagination: document.getElementById("depositHistoryPagination"),
    withdrawalHistoryPagination: document.getElementById("withdrawalHistoryPagination"),
    tabButtons: Array.from(document.querySelectorAll("[data-profile-tab]")),
    tabPanels: Array.from(document.querySelectorAll("[data-profile-panel]")),
    kycNotice: document.getElementById("profileKycNotice"),
    kycNoticeTitle: document.getElementById("profileKycNoticeTitle"),
    kycNoticeText: document.getElementById("profileKycNoticeText"),
    kycNoticeBtn: document.getElementById("profileKycNoticeBtn"),
    kycTabBadge: document.getElementById("profileKycTabBadge"),
    kycMergedStatusText: document.getElementById("kycStatusText")
};

function showProfileMessage(message, type = "success") {
    if (!profileEl.message) {
        return;
    }

    const isError = type === "error";
    profileEl.message.textContent = message;
    profileEl.message.className = isError
        ? "mb-6 rounded-2xl border border-red-400/30 bg-red-400/10 px-5 py-4 text-sm font-black text-red-300"
        : "mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-sm font-black text-emerald-300";
}

function clearProfileErrors() {
    if (profileEl.nameError) profileEl.nameError.textContent = "";
}

function clearPasswordErrors() {
    if (profileEl.currentPasswordError) profileEl.currentPasswordError.textContent = "";
    if (profileEl.newPasswordError) profileEl.newPasswordError.textContent = "";
    if (profileEl.confirmNewPasswordError) profileEl.confirmNewPasswordError.textContent = "";
}

function escapeProfileText(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatStatus(value) {
    const text = String(value || "pending").replaceAll("_", " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDateTime(value) {
    if (!value) {
        return "--";
    }

    let parseable = value;
    if (typeof value === "string") {
        const valTrim = value.trim();
        if (valTrim && !valTrim.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(valTrim)) {
            parseable = valTrim.replace(" ", "T") + "Z";
        }
    }

    const date = new Date(parseable);

    if (Number.isNaN(date.getTime())) {
        return "--";
    }

    return date.toLocaleString("en-IN", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatAmount(value, currency = "USDT") {
    const amount = Number(value || 0);
    const dispCurrency = (currency === "USDT") ? "USD" : currency;
    return `${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 8 })} ${dispCurrency || "USD"}`;
}

function shortText(value, start = 10, end = 6) {
    const text = String(value || "");

    if (!text) {
        return "--";
    }

    if (text.length <= start + end + 3) {
        return text;
    }

    return `${text.slice(0, start)}...${text.slice(-end)}`;
}


function getHistoryTimestamp(item, historyType) {
    const value = historyType === "deposit"
        ? (item?.created_at || item?.credited_at || item?.updated_at)
        : (item?.decision_at || item?.updated_at || item?.created_at);
    const timestamp = new Date(value || 0).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortHistoryNewestFirst(items, historyType) {
    return [...(items || [])].sort((first, second) => (
        getHistoryTimestamp(second, historyType) - getHistoryTimestamp(first, historyType)
    ));
}

function getPaginationItems(currentPage, totalPages) {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const items = [1];
    const rangeStart = Math.max(2, currentPage - 1);
    const rangeEnd = Math.min(totalPages - 1, currentPage + 1);

    if (rangeStart > 2) {
        items.push("ellipsis-start");
    }

    for (let page = rangeStart; page <= rangeEnd; page += 1) {
        items.push(page);
    }

    if (rangeEnd < totalPages - 1) {
        items.push("ellipsis-end");
    }

    items.push(totalPages);
    return items;
}

function getHistoryPageSize(historyType) {
    return historyType === "deposit"
        ? PROFILE_DEPOSIT_HISTORY_PAGE_SIZE
        : PROFILE_WITHDRAWAL_HISTORY_PAGE_SIZE;
}

function renderHistoryPagination(container, currentPage, totalItems, historyType) {
    if (!container) {
        return;
    }

    const pageSize = getHistoryPageSize(historyType);
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    if (totalItems <= pageSize) {
        container.innerHTML = "";
        container.classList.add("hidden");
        container.classList.remove("flex");
        return;
    }

    container.classList.remove("hidden");
    container.classList.add("flex");

    const previousDisabled = currentPage <= 1;
    const nextDisabled = currentPage >= totalPages;
    const pageItems = getPaginationItems(currentPage, totalPages);

    const pageButtons = pageItems.map((item) => {
        if (typeof item !== "number") {
            return '<span class="px-1 text-sm font-bold text-slate-500" aria-hidden="true">...</span>';
        }

        const isActive = item === currentPage;
        const activeClass = isActive
            ? "border-cyan-400 bg-cyan-400 text-slate-950"
            : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200";

        return `
            <button
                type="button"
                data-history-type="${historyType}"
                data-history-page="${item}"
                class="h-9 w-9 rounded-xl border px-3 text-xs font-black transition ${activeClass}"
                ${isActive ? 'aria-current="page"' : ""}
            >${item}</button>
        `;
    }).join("");

    container.innerHTML = `
        <button
            type="button"
            data-history-type="${historyType}"
            data-history-page="previous"
            class="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
            ${previousDisabled ? "disabled" : ""}
        >Previous</button>
        ${pageButtons}
        <button
            type="button"
            data-history-type="${historyType}"
            data-history-page="next"
            class="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
            ${nextDisabled ? "disabled" : ""}
        >Next</button>
    `;
}

function handleHistoryPaginationClick(event) {
    const button = event.target.closest("button[data-history-page]");

    if (!button || button.disabled) {
        return;
    }

    const historyType = button.dataset.historyType;
    const requestedPage = button.dataset.historyPage;
    const isDeposit = historyType === "deposit";
    const totalItems = isDeposit ? profileState.deposits.length : profileState.withdrawals.length;
    const pageSize = getHistoryPageSize(historyType);
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = isDeposit ? profileState.depositPage : profileState.withdrawalPage;
    let nextPage = currentPage;

    if (requestedPage === "previous") {
        nextPage = currentPage - 1;
    } else if (requestedPage === "next") {
        nextPage = currentPage + 1;
    } else {
        nextPage = Number(requestedPage);
    }

    nextPage = Math.min(totalPages, Math.max(1, Number.isFinite(nextPage) ? nextPage : 1));

    if (isDeposit) {
        profileState.depositPage = nextPage;
        renderDepositHistory(sortHistoryNewestFirst(profileState.deposits, "deposit"));
    } else {
        profileState.withdrawalPage = nextPage;
        renderWithdrawalHistory(sortHistoryNewestFirst(profileState.withdrawals, "withdrawal"));
    }
}

function getProfileDisplayName(user = {}) {
    const name = String(user.name || "").trim();
    if (name) return name;

    const emailName = String(user.email || "").split("@")[0].trim();
    return emailName || "User";
}


function normalizeProfileTab(value) {
    const tab = String(value || "overview").replace(/^#/, "").trim().toLowerCase();
    return ["overview", "security", "kyc", "wallet-history", "sub-accounts", "bank-accounts"].includes(tab) ? tab : "overview";
}

function activateProfileTab(tabName, options = {}) {
    const activeTab = normalizeProfileTab(tabName);

    profileEl.tabButtons.forEach((button) => {
        const isActive = button.dataset.profileTab === activeTab;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", String(isActive));
        button.tabIndex = isActive ? 0 : -1;
    });

    profileEl.tabPanels.forEach((panel) => {
        const isActive = panel.dataset.profilePanel === activeTab;
        panel.classList.toggle("hidden", !isActive);
        panel.hidden = !isActive;
    });

    if (activeTab === "sub-accounts") {
        txInitProfileSubAccounts();
    }

    if (activeTab === "bank-accounts") {
        txInitProfileBankAccounts();
    }

    if (options.updateHash !== false) {
        const nextHash = activeTab === "overview" ? "" : `#${activeTab}`;
        const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
        window.history.replaceState(null, "", nextUrl);
    }

    if (options.scroll === true) {
        document.querySelector(".tx-profile-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function renderProfileKycNotice(statusValue) {
    const status = String(statusValue || "not_submitted").toLowerCase().replaceAll(" ", "_");
    const approved = ["approved", "verified", "completed"].includes(status);
    const rejected = ["rejected", "failed"].includes(status);
    const state = approved ? "approved" : rejected ? "rejected" : "pending";

    if (profileEl.kycNotice) {
        profileEl.kycNotice.dataset.kycState = state;
        profileEl.kycNotice.hidden = approved;
        profileEl.kycNotice.classList.toggle("hidden", approved);
    }
    if (profileEl.kycTabBadge) {
        profileEl.kycTabBadge.dataset.state = state;
        profileEl.kycTabBadge.textContent = approved ? "Verified" : rejected ? "Rejected" : "Required";
    }

    if (approved) {
        if (profileEl.kycNoticeTitle) profileEl.kycNoticeTitle.textContent = "KYC verification complete";
        if (profileEl.kycNoticeText) profileEl.kycNoticeText.textContent = "Your Aadhaar OCR KYC is approved. Deposits, transfers, trading, and withdrawals are fully enabled.";
        if (profileEl.kycNoticeBtn) profileEl.kycNoticeBtn.textContent = "View KYC Details";
        return;
    }

    if (rejected) {
        if (profileEl.kycNoticeTitle) profileEl.kycNoticeTitle.textContent = "KYC verification needs attention";
        if (profileEl.kycNoticeText) profileEl.kycNoticeText.textContent = "Review the result and continue from the remaining Aadhaar KYC step shown in your profile.";
        if (profileEl.kycNoticeBtn) profileEl.kycNoticeBtn.textContent = "Re-submit KYC";
        return;
    }

    if (profileEl.kycNoticeTitle) profileEl.kycNoticeTitle.textContent = "Complete KYC Verification";
    if (profileEl.kycNoticeText) profileEl.kycNoticeText.textContent = "Verify mobile OTP, Aadhaar number and matching front/back Aadhaar photos to enable deposits, transfers, trading, and withdrawals.";
    if (profileEl.kycNoticeBtn) profileEl.kycNoticeBtn.textContent = "Complete KYC";
}

function syncProfileKycFromMergedPanel() {
    const text = String(profileEl.kycMergedStatusText?.textContent || "").trim();
    if (!text || text.toLowerCase() === "checking") return;

    const status = text.toLowerCase().replace(/\s+/g, "_");
    profileState.kyc = { ...(profileState.kyc || {}), kyc_status: status };

    if (profileEl.kycStatus) {
        profileEl.kycStatus.textContent = formatStatus(status);
        setStatusStyle(profileEl.kycStatus, status);
    }
    renderProfileKycNotice(status);
}

function bindProfileTabs() {
    profileEl.tabButtons.forEach((button) => {
        button.addEventListener("click", () => activateProfileTab(button.dataset.profileTab, { updateHash: true }));
    });

    document.querySelectorAll("[data-profile-open-kyc]").forEach((button) => {
        button.addEventListener("click", () => activateProfileTab("kyc", { updateHash: true, scroll: true }));
    });

    window.addEventListener("hashchange", () => activateProfileTab(window.location.hash, { updateHash: false }));
    activateProfileTab(window.location.hash, { updateHash: false });

    if (profileEl.kycMergedStatusText && typeof MutationObserver === "function") {
        const observer = new MutationObserver(syncProfileKycFromMergedPanel);
        observer.observe(profileEl.kycMergedStatusText, { childList: true, characterData: true, subtree: true });
    }
}

function openProfileEditModal() {
    if (!profileEl.editModal) return;

    if (profileEl.nameInput) {
        profileEl.nameInput.value = profileState.user?.name || "";
    }

    clearProfileErrors();
    profileEl.editModal.classList.remove("hidden");
    profileEl.editModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("tx-profile-modal-open");

    window.setTimeout(() => {
        if (profileEl.nameInput) {
            profileEl.nameInput.focus();
            profileEl.nameInput.select();
        } else if (profileEl.editModalPanel) {
            profileEl.editModalPanel.focus();
        }
    }, 0);
}

function closeProfileEditModal() {
    if (!profileEl.editModal) return;

    profileEl.editModal.classList.add("hidden");
    profileEl.editModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("tx-profile-modal-open");
    clearProfileErrors();

    if (profileEl.editBtn) {
        profileEl.editBtn.focus();
    }
}

function setStatusStyle(node, status) {
    if (!node) return;

    const value = String(status || "").toLowerCase();

    if (["active", "approved", "verified", "completed", "success", "true"].includes(value)) {
        node.className = "mt-2 text-3xl font-black text-emerald-400";
        return;
    }

    if (["rejected", "blocked", "suspended", "inactive", "failed", "false"].includes(value)) {
        node.className = "mt-2 text-3xl font-black text-red-400";
        return;
    }

    node.className = "mt-2 text-3xl font-black text-orange-300";
}

function getStatusBadgeClass(status) {
    const value = String(status || "").toLowerCase();

    if (["completed", "approved", "verified", "credited"].includes(value)) {
        return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
    }

    if (["rejected", "failed", "cancelled", "canceled"].includes(value)) {
        return "border-red-400/25 bg-red-400/10 text-red-300";
    }

    return "border-orange-400/25 bg-orange-400/10 text-orange-300";
}


function getProfileInitials(nameValue) {
    const parts = String(nameValue || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "TX";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function renderProfile() {
    const user = profileState.user || {};
    const kycStatus = profileState.kyc?.kyc_status || user.kyc_status || "pending";
    const accountStatus = user.account_status || "active";

    const displayName = getProfileDisplayName(user);

    if (profileEl.heroName) profileEl.heroName.textContent = displayName;
    if (profileEl.heroEmail) profileEl.heroEmail.textContent = user.email || "Manage your TraidiumX account";
    if (profileEl.heroClientID) {
        profileEl.heroClientID.textContent = `Client ID: ${user.client_id || "--"}`;
        const copyBtn = document.getElementById("copyClientIDBtn");
        if (copyBtn) {
            copyBtn.classList.toggle("hidden", !user.client_id);
        }
    }
    if (profileEl.avatarInitials) profileEl.avatarInitials.textContent = getProfileInitials(displayName);
    if (profileEl.nameText) profileEl.nameText.textContent = displayName;
    if (profileEl.emailText) profileEl.emailText.textContent = user.email || "--";
    if (profileEl.phoneText) profileEl.phoneText.textContent = user.phone || user.phone_number || user.mobile || "Not added";
    if (profileEl.createdText) profileEl.createdText.textContent = formatDateTime(user.created_at);

    const onboarding = profileState.onboarding || {};
    const platformName = onboarding.selected_platform_name || (onboarding.selected_platform === "mt5" ? "MetaTrader 5" : onboarding.selected_platform === "traidiumx" ? "TraidiumX" : "Not selected");
    const prefPlan = onboarding.preferred_plan_name || (onboarding.preferred_plan ? onboarding.preferred_plan.toUpperCase() : "Not selected");
    const activePlan = onboarding.active_plan_name || (onboarding.active_plan ? onboarding.active_plan.toUpperCase() : "");
    
    let planDisplayName = prefPlan;
    if (activePlan && prefPlan && activePlan.toLowerCase() !== prefPlan.toLowerCase()) {
        planDisplayName = `${prefPlan} (Active: ${activePlan})`;
    }
    
    if (profileEl.platformText) profileEl.platformText.textContent = platformName;
    if (profileEl.preferredPlanText) profileEl.preferredPlanText.textContent = planDisplayName;

    renderPrimaryCurrencyCard();

    // 2FA status
    const twoFaText = document.getElementById("profile2faStatusText");
    const twoFaDot  = document.getElementById("profile2faStatusDot");
    if (twoFaText && twoFaDot) {
        const is2faOn = user.two_factor_enabled === true;
        twoFaText.textContent = is2faOn ? "Enabled" : "Disabled";
        twoFaText.style.color = is2faOn ? "#34d399" : "#94a3b8";
        twoFaDot.style.background  = is2faOn ? "rgba(52,211,153,0.12)" : "";
        twoFaDot.style.color = is2faOn ? "#34d399" : "";
    }

    // Toggle MT5 connection section
    const mt5Section = profileEl.mt5ConnectionSection;
    if (mt5Section) {
        const mt5 = onboarding.mt5?.account || {};
        if (onboarding.selected_platform === "mt5") {
            if (mt5.status === "connected" || mt5.status === "active") {
                mt5Section.classList.remove("hidden");
                const form = document.getElementById("profileMt5Form");
                if (form) form.style.display = "none";
                const msg = document.getElementById("profileMt5Msg");
                if (msg) {
                    msg.className = "mt-3 text-sm font-semibold text-emerald-400";
                    msg.style.color = "#34d399";
                    msg.textContent = `Your MetaTrader 5 account is connected successfully. ID: ${mt5.login_id || ""}`;
                }
            } else {
                mt5Section.classList.remove("hidden");
                const form = document.getElementById("profileMt5Form");
                if (form) form.style.display = "grid";
                const msg = document.getElementById("profileMt5Msg");
                if (msg) {
                    if (mt5.status === "credentials_sent") {
                        msg.className = "mt-3 text-sm font-semibold text-amber-400";
                        msg.style.color = "#fbbf24";
                        msg.textContent = "Credentials sent by admin. Enter them below to connect your account.";
                    } else {
                        msg.className = "mt-3 text-sm font-semibold text-slate-400";
                        msg.style.color = "#94a3b8";
                        msg.textContent = "Your MetaTrader 5 credentials will be sent by email once assigned by admin.";
                    }
                }
            }
        } else {
            mt5Section.classList.add("hidden");
        }
    }

    if (profileEl.accountStatus) {
        profileEl.accountStatus.textContent = formatStatus(accountStatus);
        setStatusStyle(profileEl.accountStatus, accountStatus);
    }

    if (profileEl.kycStatus) {
        profileEl.kycStatus.textContent = formatStatus(kycStatus);
        setStatusStyle(profileEl.kycStatus, kycStatus);
    }

    if (profileEl.sessionStatus) {
        profileEl.sessionStatus.textContent = isLoggedIn() ? "Active" : "Guest";
        setStatusStyle(profileEl.sessionStatus, isLoggedIn() ? "active" : "pending");
    }

    if (profileEl.nameInput) profileEl.nameInput.value = user.name || "";
    renderProfileKycNotice(kycStatus);
}

function renderPrimaryCurrencyCard() {
    const primaryCurrency = (localStorage.getItem("tx_navbar_currency") || profileState.wallet?.primary_currency || profileState.user?.primary_currency || "INR").toUpperCase();
    const primaryCurrencyText = primaryCurrency === "INR" ? "INR (₹)" : "USD ($)";
    const textEl = document.getElementById("profilePrimaryCurrencyText");
    if (textEl) textEl.textContent = primaryCurrencyText;
}

async function loadProfile() {
    if (!isLoggedIn()) {
        window.location.href = "./login.html";
        return;
    }

    try {
        const [profileResponse, kycResponse, onboardingResponse, walletResponse] = await Promise.all([
            apiRequest("/user/profile"),
            apiRequest("/kyc/status").catch(() => ({ data: { kyc_status: "not_submitted", kyc: null } })),
            apiRequest("/onboarding/status").catch(() => ({ data: {} })),
            apiRequest("/wallet/balance").catch(() => ({ data: null }))
        ]);

        profileState.user = profileResponse?.data?.user || getAuthUser();
        profileState.kyc = kycResponse?.data || null;
        profileState.onboarding = onboardingResponse?.data || null;
        profileState.wallet = walletResponse?.data?.wallet || null;
        profileState.switchRequest = null;

        if (profileState.user) {
            saveAuthData(getAuthToken(), profileState.user);
        }

        renderProfile();
        if (typeof txUpdateProfileSubTransferPreview === "function") {
            txUpdateProfileSubTransferPreview();
        }
    } catch (error) {
        showProfileMessage(showApiError(error, "Unable to load profile."), "error");
    }
}

async function loadWalletHistories() {
    if (!isLoggedIn()) {
        return;
    }

    if (profileEl.historyRefreshBtn) {
        profileEl.historyRefreshBtn.disabled = true;
        profileEl.historyRefreshBtn.textContent = "Refreshing...";
    }

    const [depositResult, withdrawalResult] = await Promise.allSettled([
        apiRequest("/deposit/history"),
        apiRequest("/withdrawal/history")
    ]);

    if (depositResult.status === "fulfilled") {
        profileState.deposits = depositResult.value?.data?.deposits || [];
    } else {
        profileState.deposits = [];
    }

    if (withdrawalResult.status === "fulfilled") {
        profileState.withdrawals = withdrawalResult.value?.data?.withdrawals || [];
    } else {
        profileState.withdrawals = [];
    }

    renderWalletHistories();

    if (profileEl.historyRefreshBtn) {
        profileEl.historyRefreshBtn.disabled = false;
        profileEl.historyRefreshBtn.textContent = "Refresh History";
    }
}

function renderWalletHistories() {
    const deposits = sortHistoryNewestFirst(profileState.deposits, "deposit");
    const withdrawals = sortHistoryNewestFirst(profileState.withdrawals, "withdrawal");

    if (profileEl.depositCountText) profileEl.depositCountText.textContent = String(deposits.length);
    if (profileEl.withdrawalCountText) profileEl.withdrawalCountText.textContent = String(withdrawals.length);

    const allDates = [...deposits, ...withdrawals]
        .map((item) => item.updated_at || item.created_at || item.decision_at || item.credited_at)
        .filter(Boolean)
        .map((value) => new Date(value))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((a, b) => b.getTime() - a.getTime());

    if (profileEl.latestActivityText) {
        profileEl.latestActivityText.textContent = allDates.length ? formatDateTime(allDates[0].toISOString()) : "--";
    }

    renderDepositHistory(deposits);
    renderWithdrawalHistory(withdrawals);
}

function renderDepositHistory(deposits) {
    if (!profileEl.depositHistoryList || !profileEl.depositHistoryEmpty) {
        return;
    }

    if (!deposits.length) {
        profileState.depositPage = 1;
        profileEl.depositHistoryList.innerHTML = "";
        profileEl.depositHistoryEmpty.classList.remove("hidden");
        renderHistoryPagination(profileEl.depositHistoryPagination, 1, 0, "deposit");
        return;
    }

    const totalPages = Math.max(1, Math.ceil(deposits.length / PROFILE_DEPOSIT_HISTORY_PAGE_SIZE));
    profileState.depositPage = Math.min(totalPages, Math.max(1, profileState.depositPage));
    const pageStart = (profileState.depositPage - 1) * PROFILE_DEPOSIT_HISTORY_PAGE_SIZE;
    const pageDeposits = deposits.slice(pageStart, pageStart + PROFILE_DEPOSIT_HISTORY_PAGE_SIZE);

    profileEl.depositHistoryEmpty.classList.add("hidden");
    profileEl.depositHistoryList.innerHTML = pageDeposits.map((deposit) => {
        const status = deposit.status || deposit.verification_status || "pending";
        const badgeClass = getStatusBadgeClass(status);
        const reference = escapeProfileText(deposit.deposit_reference || deposit.gateway_order_id || deposit.id || "--");
        const txHash = escapeProfileText(shortText(deposit.tx_hash || deposit.gateway_payment_id || "", 12, 7));
        const network = escapeProfileText(`${deposit.crypto_asset || "USDT"} / ${deposit.crypto_network || "--"}`);

        return `
            <article class="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p class="text-xs font-black uppercase tracking-[0.16em] text-slate-500">${formatDateTime(deposit.created_at)}</p>
                        <h4 class="mt-2 break-words text-sm font-black text-white">${reference}</h4>
                    </div>
                    <span class="w-fit rounded-full border px-3 py-1 text-xs font-black ${badgeClass}">${escapeProfileText(formatStatus(status))}</span>
                </div>
                <div class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <p class="text-slate-400"><span class="font-black text-slate-200">Amount:</span> ${escapeProfileText(formatAmount(deposit.amount, deposit.currency))}</p>
                    <p class="text-slate-400"><span class="font-black text-slate-200">Asset:</span> ${network}</p>
                    <p class="break-words text-slate-400 sm:col-span-2"><span class="font-black text-slate-200">TXID:</span> ${txHash}</p>
                </div>
            </article>
        `;
    }).join("");

    renderHistoryPagination(
        profileEl.depositHistoryPagination,
        profileState.depositPage,
        deposits.length,
        "deposit"
    );
}

function renderWithdrawalHistory(withdrawals) {
    if (!profileEl.withdrawalHistoryList || !profileEl.withdrawalHistoryEmpty) {
        return;
    }

    if (!withdrawals.length) {
        profileState.withdrawalPage = 1;
        profileEl.withdrawalHistoryList.innerHTML = "";
        profileEl.withdrawalHistoryEmpty.classList.remove("hidden");
        renderHistoryPagination(profileEl.withdrawalHistoryPagination, 1, 0, "withdrawal");
        return;
    }

    const totalPages = Math.max(1, Math.ceil(withdrawals.length / PROFILE_WITHDRAWAL_HISTORY_PAGE_SIZE));
    profileState.withdrawalPage = Math.min(totalPages, Math.max(1, profileState.withdrawalPage));
    const pageStart = (profileState.withdrawalPage - 1) * PROFILE_WITHDRAWAL_HISTORY_PAGE_SIZE;
    const pageWithdrawals = withdrawals.slice(pageStart, pageStart + PROFILE_WITHDRAWAL_HISTORY_PAGE_SIZE);

    profileEl.withdrawalHistoryEmpty.classList.add("hidden");
    profileEl.withdrawalHistoryList.innerHTML = pageWithdrawals.map((withdrawal) => {
        const status = withdrawal.status || "pending_admin_approval";
        const label = withdrawal.status_label || formatStatus(status);
        const badgeClass = getStatusBadgeClass(status);
        const reference = escapeProfileText(withdrawal.withdrawal_reference || withdrawal.id || "--");
        const address = escapeProfileText(shortText(withdrawal.withdrawal_address || "", 12, 7));
        const network = escapeProfileText(`${withdrawal.crypto_asset || "USDT"} / ${withdrawal.crypto_network || "--"}`);
        const decisionDate = withdrawal.decision_at || withdrawal.updated_at || withdrawal.created_at;

        return `
            <article class="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p class="text-xs font-black uppercase tracking-[0.16em] text-slate-500">${formatDateTime(decisionDate)}</p>
                        <h4 class="mt-2 break-words text-sm font-black text-white">${reference}</h4>
                    </div>
                    <span class="w-fit rounded-full border px-3 py-1 text-xs font-black ${badgeClass}">${escapeProfileText(label)}</span>
                </div>
                <div class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <p class="text-slate-400"><span class="font-black text-slate-200">Amount:</span> ${escapeProfileText(formatAmount(withdrawal.amount, withdrawal.currency))}</p>
                    <p class="text-slate-400"><span class="font-black text-slate-200">Asset:</span> ${network}</p>
                    <p class="break-words text-slate-400"><span class="font-black text-slate-200">Address:</span> ${address}</p>
                    <p class="text-slate-400"><span class="font-black text-slate-200">Fee:</span> ${escapeProfileText(formatAmount(withdrawal.network_fee, withdrawal.currency))}</p>
                    <p class="break-words text-slate-400 sm:col-span-2"><span class="font-black text-slate-200">Admin remark:</span> ${escapeProfileText(withdrawal.admin_note || withdrawal.reject_reason || withdrawal.remark || "--")}</p>
                </div>
            </article>
        `;
    }).join("");

    renderHistoryPagination(
        profileEl.withdrawalHistoryPagination,
        profileState.withdrawalPage,
        withdrawals.length,
        "withdrawal"
    );
}

function validateProfileForm() {
    clearProfileErrors();

    const name = profileEl.nameInput ? profileEl.nameInput.value.trim() : "";
    let valid = true;

    if (name.length < 2 || name.length > 60 || !/^[A-Za-z ]+$/.test(name)) {
        if (profileEl.nameError) profileEl.nameError.textContent = "Name must be 2-60 characters and contain only letters/spaces.";
        valid = false;
    }

    return valid;
}

function validatePasswordForm() {
    clearPasswordErrors();

    const currentPassword = profileEl.currentPassword ? profileEl.currentPassword.value : "";
    const newPassword = profileEl.newPassword ? profileEl.newPassword.value : "";
    const confirmPassword = profileEl.confirmNewPassword ? profileEl.confirmNewPassword.value : "";
    let valid = true;

    if (!currentPassword && profileState.user?.auth_provider !== "google") {
        if (profileEl.currentPasswordError) profileEl.currentPasswordError.textContent = "Current password is required.";
        valid = false;
    }

    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[@$!%*?&]/.test(newPassword)) {
        if (profileEl.newPasswordError) profileEl.newPasswordError.textContent = "Use 8+ chars with uppercase, lowercase, number and @$!%*?&.";
        valid = false;
    }

    if (newPassword !== confirmPassword) {
        if (profileEl.confirmNewPasswordError) profileEl.confirmNewPasswordError.textContent = "Confirm password does not match.";
        valid = false;
    }

    return valid;
}

async function handleProfileSubmit(event) {
    event.preventDefault();

    if (!validateProfileForm()) {
        return;
    }

    try {
        if (profileEl.saveBtn) {
            profileEl.saveBtn.disabled = true;
            profileEl.saveBtn.textContent = "Saving...";
        }

        const response = await apiRequest("/user/profile", {
            method: "PATCH",
            body: JSON.stringify({
                name: profileEl.nameInput.value.trim()
            })
        });

        profileState.user = response?.data?.user || profileState.user;
        saveAuthData(getAuthToken(), profileState.user);
        renderProfile();
        closeProfileEditModal();
        showProfileMessage("Profile updated successfully.", "success");
        if (typeof applyNavbarAuthState === "function") {
            applyNavbarAuthState();
        }
    } catch (error) {
        showProfileMessage(showApiError(error, "Profile update failed."), "error");
    } finally {
        if (profileEl.saveBtn) {
            profileEl.saveBtn.disabled = false;
            profileEl.saveBtn.textContent = "Save Changes";
        }
    }
}

async function handlePasswordSubmit(event) {
    event.preventDefault();

    if (!validatePasswordForm()) {
        return;
    }

    try {
        if (profileEl.passwordBtn) {
            profileEl.passwordBtn.disabled = true;
            profileEl.passwordBtn.textContent = "Changing...";
        }

        const response = await apiRequest("/user/change-password", {
            method: "PATCH",
            body: JSON.stringify({
                current_password: profileEl.currentPassword.value,
                new_password: profileEl.newPassword.value,
                confirm_password: profileEl.confirmNewPassword.value
            })
        });

        profileState.user = response?.data?.user || profileState.user;
        saveAuthData(getAuthToken(), profileState.user);
        renderProfile();

        if (profileEl.passwordForm) {
            profileEl.passwordForm.reset();
        }

        clearPasswordErrors();
        showProfileMessage("Password changed successfully.", "success");
    } catch (error) {
        const errors = error?.errors || {};
        if (profileEl.currentPasswordError) profileEl.currentPasswordError.textContent = errors.current_password || "";
        if (profileEl.newPasswordError) profileEl.newPasswordError.textContent = errors.new_password || "";
        if (profileEl.confirmNewPasswordError) profileEl.confirmNewPasswordError.textContent = errors.confirm_password || "";
        showProfileMessage(showApiError(error, "Password change failed."), "error");
    } finally {
        if (profileEl.passwordBtn) {
            profileEl.passwordBtn.disabled = false;
            profileEl.passwordBtn.textContent = "Change Password";
        }
    }
}

function initProfilePage() {
    bindProfileTabs();
    txBindProfileSubAccountEvents();
    txBindProfileBankAccountEvents();

    if (profileEl.editBtn) {
        profileEl.editBtn.addEventListener("click", openProfileEditModal);
    }

    if (profileEl.editCloseBtn) {
        profileEl.editCloseBtn.addEventListener("click", closeProfileEditModal);
    }

    if (profileEl.editCancelBtn) {
        profileEl.editCancelBtn.addEventListener("click", closeProfileEditModal);
    }

    if (profileEl.editModal) {
        profileEl.editModal.addEventListener("click", (event) => {
            if (event.target?.hasAttribute("data-profile-modal-close")) {
                closeProfileEditModal();
            }
        });
    }

    document.getElementById("copyClientIDBtn")?.addEventListener("click", () => {
        const clientID = profileState.user?.client_id;
        if (clientID) {
            navigator.clipboard.writeText(clientID).then(() => {
                const successMsg = document.getElementById("copyIDSuccessMsg");
                if (successMsg) {
                    successMsg.classList.remove("hidden");
                    setTimeout(() => {
                        successMsg.classList.add("hidden");
                    }, 2000);
                }
            }).catch(err => {
                console.error("Failed to copy Client ID:", err);
            });
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            if (profileEl.editModal && !profileEl.editModal.classList.contains("hidden")) {
                closeProfileEditModal();
            }
        }
    });

    const cachedUser = typeof getAuthUser === "function" ? getAuthUser() : null;
    if (cachedUser) {
        profileState.user = cachedUser;
        renderProfile();
    }

    if (profileEl.form) {
        profileEl.form.addEventListener("submit", handleProfileSubmit);
    }

    if (profileEl.passwordForm) {
        profileEl.passwordForm.addEventListener("submit", handlePasswordSubmit);
    }

    if (profileEl.historyRefreshBtn) {
        profileEl.historyRefreshBtn.addEventListener("click", loadWalletHistories);
    }

    if (profileEl.depositHistoryPagination) {
        profileEl.depositHistoryPagination.addEventListener("click", handleHistoryPaginationClick);
    }

    if (profileEl.withdrawalHistoryPagination) {
        profileEl.withdrawalHistoryPagination.addEventListener("click", handleHistoryPaginationClick);
    }

    if (profileEl.mt5Form) {
        profileEl.mt5Form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const loginId = document.getElementById("profileMt5Login").value.trim();
            const server = document.getElementById("profileMt5Server").value.trim();
            const password = document.getElementById("profileMt5Password").value.trim();
            const btn = document.getElementById("profileMt5ConnectBtn");
            const msg = document.getElementById("profileMt5Msg");
            
            if (!loginId || !server || !password) {
                if (msg) {
                    msg.className = "mt-3 text-sm font-semibold text-rose-400";
                    msg.style.color = "#f87171";
                    msg.textContent = "Please fill in all fields.";
                }
                return;
            }
            
            if (btn) {
                btn.disabled = true;
                btn.textContent = "Connecting to MetaTrader 5...";
            }
            if (msg) {
                msg.className = "mt-3 text-sm font-semibold text-cyan-400";
                msg.style.color = "#22d3ee";
                msg.textContent = "Verifying credentials and deploying connection...";
            }
            
            try {
                const response = await apiRequest("/onboarding/mt5/connect-existing", {
                    method: "POST",
                    body: JSON.stringify({
                        login_id: loginId,
                        password: password,
                        server: server,
                        broker_name: "MT5 Broker"
                    })
                });
                
                if (msg) {
                    msg.className = "mt-3 text-sm font-semibold text-emerald-400";
                    msg.style.color = "#34d399";
                    msg.textContent = response.message || "MetaTrader 5 connected successfully!";
                }
                
                setTimeout(() => {
                    loadProfile();
                }, 2000);
            } catch (error) {
                if (msg) {
                    msg.className = "mt-3 text-sm font-semibold text-rose-400";
                    msg.style.color = "#f87171";
                    msg.textContent = showApiError(error, "Failed to connect to MetaTrader 5.");
                }
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = "Connect MT5 Account";
                }
            }
        });
    }

    window.addEventListener("traidiumx:currency-change", () => {
        renderPrimaryCurrencyCard();
        const cached = getCachedSubAccounts();
        if (cached && cached.length > 0) {
            renderSubAccountsDOM(cached);
        }
        if (typeof txUpdateProfileSubTransferPreview === "function") {
            txUpdateProfileSubTransferPreview();
        }
    });
    loadProfile();
    loadWalletHistories();
}

document.addEventListener("DOMContentLoaded", initProfilePage);

let cachedSubAccountsList = null;

function getCachedSubAccounts() {
    if (cachedSubAccountsList && cachedSubAccountsList.length > 0) {
        return cachedSubAccountsList;
    }
    try {
        const cached = localStorage.getItem("tx_cached_sub_accounts");
        if (cached) {
            cachedSubAccountsList = JSON.parse(cached);
            return cachedSubAccountsList;
        }
    } catch (e) {}
    return [];
}

function renderSubAccountsDOM(subAccounts) {
    if (!Array.isArray(subAccounts)) return;
    window.txSubAccountsLocalCache = subAccounts;

    const activeCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const isINR = activeCurrency === "INR";
    const rate = Number(profileState.wallet?.usdt_inr_rate || 95.00);

    // Populate Target Account Selector
    const transferSelect = document.getElementById("profileSubTransferAccount");
    if (transferSelect) {
        const currentVal = transferSelect.value;
        transferSelect.innerHTML = `<option value="main">Main Trading Account (${isINR ? "INR" : "USDT"})</option>`;
        subAccounts.forEach(sub => {
            const opt = document.createElement("option");
            opt.value = sub.id;
            opt.textContent = `${sub.name} (USDT)`;
            transferSelect.appendChild(opt);
        });
        if (currentVal) transferSelect.value = currentVal;
    }
    
    // Render Existing Sub Accounts List
    const listContainer = document.getElementById("profileSubAccountsList");
    if (listContainer) {
        if (subAccounts.length === 0) {
            listContainer.innerHTML = `<p class="text-xs text-slate-500 font-semibold py-2">No sub accounts created yet.</p>`;
            return;
        }
        
        let html = "";
        subAccounts.forEach(sub => {
            const w = sub.wallet || { available_balance: 0, locked_balance: 0, total_balance: 0 };
            const availUsd = Number(w.available_balance || 0);
            const lockedUsd = Number(w.locked_balance || 0);
            const totalUsd = Number(w.total_balance || 0);

            let availFormatted = `${availUsd.toFixed(2)} USD`;
            let lockedFormatted = `${lockedUsd.toFixed(2)} USD`;
            let totalFormatted = `${totalUsd.toFixed(2)} USD`;

            if (isINR) {
                const availInr = availUsd * rate;
                const lockedInr = lockedUsd * rate;
                const totalInr = totalUsd * rate;
                availFormatted = `₹${availInr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`;
                lockedFormatted = `₹${lockedInr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`;
                totalFormatted = `₹${totalInr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`;
            }

            const isDemo = sub.is_demo || sub.account_mode === "demo" || sub.plan === "demo";
            const planName = isDemo ? "Demo" : (sub.plan_name || "Basic");
            const planColor = isDemo ? "amber" : (sub.plan_color || "cyan");
            const badgeColorClasses = {
                "cyan": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
                "emerald": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                "purple": "bg-purple-500/20 text-purple-300 border-purple-500/30",
                "amber": "bg-amber-500/20 text-amber-300 border-amber-500/30"
            }[planColor] || "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";

            html += `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition gap-3 text-xs" style="min-width:0;overflow:hidden;">
                    <div style="min-width:0;flex:1;overflow:hidden;">
                        <div class="flex items-center gap-2 flex-wrap">
                            <strong class="text-white text-sm font-black truncate">${escapeHtml(sub.name)}</strong>
                            <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${badgeColorClasses}">${escapeHtml(planName)}</span>
                        </div>
                        <p class="text-[10px] text-slate-500 mt-1" style="word-break:break-all;white-space:normal;">ID: ${sub.id} · Client ID: ${sub.client_id}</p>
                    </div>
                    <div class="flex gap-4 text-right items-center" style="flex-shrink:0;">
                        <div>
                            <span class="text-[10px] text-slate-500 block mb-0.5 uppercase tracking-wider font-bold">Available</span>
                            <strong class="${isDemo ? 'text-amber-300' : 'text-cyan-300'} font-black text-sm">${availFormatted}</strong>
                        </div>
                        <div>
                            <span class="text-[10px] text-slate-500 block mb-0.5 uppercase tracking-wider font-bold">Locked</span>
                            <strong class="text-slate-400 font-black text-sm">${lockedFormatted}</strong>
                        </div>
                        <div>
                            <span class="text-[10px] text-slate-500 block mb-0.5 uppercase tracking-wider font-bold">Total</span>
                            <strong class="text-white font-black text-sm">${totalFormatted}</strong>
                        </div>
                        ${isDemo ? `
                            <button type="button" data-demo-topup-id="${escapeHtml(sub.id)}" class="tx-profile-demo-topup-btn px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-extrabold rounded-xl text-xs border border-amber-500/30 transition cursor-pointer">
                                +10k Demo
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        listContainer.innerHTML = html;

        listContainer.querySelectorAll(".tx-profile-demo-topup-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const subId = btn.getAttribute("data-demo-topup-id");
                if (!subId) return;
                btn.disabled = true;
                btn.textContent = "...";
                try {
                    await apiRequest(`/user/sub-accounts/${subId}/demo-deposit`, {
                        method: "POST",
                        body: JSON.stringify({ amount: 10000 })
                    });
                    await txInitProfileSubAccounts();
                } catch (err) {
                    btn.disabled = false;
                    btn.textContent = "+10k Demo";
                }
            });
        });
    }
}

async function txInitProfileSubAccounts(forceCacheOnly = false) {
    const cached = getCachedSubAccounts();
    if (cached && cached.length > 0) {
        renderSubAccountsDOM(cached);
    }

    if (forceCacheOnly) return;

    try {
        const response = await apiRequest("/user/sub-accounts");
        const subAccounts = response.data || [];
        cachedSubAccountsList = subAccounts;
        try {
            localStorage.setItem("tx_cached_sub_accounts", JSON.stringify(subAccounts));
        } catch (e) {}
        renderSubAccountsDOM(subAccounts);
    } catch (e) {
        console.error("Failed to load sub accounts:", e);
    }
}

function txBindProfileSubAccountEvents() {
    // Bind transfer preview update listeners
    const previewAmtInput = document.getElementById("profileSubTransferAmount");
    const previewDirSelect = document.getElementById("profileSubTransferDirection");
    if (previewAmtInput && previewDirSelect) {
        const onPreviewChange = () => txUpdateProfileSubTransferPreview();
        previewAmtInput.addEventListener("input", onPreviewChange);
        previewDirSelect.addEventListener("change", onPreviewChange);
        // Run initially
        onPreviewChange();
    }

    let profileSubMode = "real";
    const realBtn = document.getElementById("profileSubModeRealBtn");
    const demoBtn = document.getElementById("profileSubModeDemoBtn");
    const planWrap = document.getElementById("profileSubPlanWrapper");
    const demoWrap = document.getElementById("profileSubDemoInfoWrapper");
    const nameInput = document.getElementById("profileNewSubNameInput");

    const updateProfileDemoBtnState = () => {
        const hasExistingDemo = (cachedSubAccountsList || []).some(s => s.is_demo || s.account_mode === "demo" || s.plan === "demo");
        if (hasExistingDemo && demoBtn) {
            demoBtn.disabled = true;
            demoBtn.className = "py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800/60 text-slate-500 cursor-not-allowed flex items-center justify-center gap-1.5 opacity-60";
            demoBtn.title = "You can only create 1 Demo account (Already created)";
            demoBtn.innerHTML = `<span>🟡 Demo (Limit 1)</span>`;
            if (profileSubMode === "demo") {
                setProfileMode("real");
            }
        }
    };

    const setProfileMode = (mode) => {
        if (mode === "demo" && demoBtn && demoBtn.disabled) return;
        profileSubMode = mode;
        if (mode === "demo") {
            demoBtn?.setAttribute("class", "py-2 px-3 rounded-lg text-xs font-extrabold bg-amber-400 text-slate-950 shadow-md transition cursor-pointer flex items-center justify-center gap-1.5");
            realBtn?.setAttribute("class", "py-2 px-3 rounded-lg text-xs font-extrabold bg-transparent text-slate-400 hover:text-white transition cursor-pointer flex items-center justify-center gap-1.5");
            planWrap?.classList.add("hidden");
            demoWrap?.classList.remove("hidden");
            if (nameInput && (!nameInput.value || nameInput.value.startsWith("Trading Sub"))) {
                nameInput.value = "Demo Account";
            }
        } else {
            realBtn?.setAttribute("class", "py-2 px-3 rounded-lg text-xs font-extrabold bg-cyan-400 text-slate-950 shadow-md transition cursor-pointer flex items-center justify-center gap-1.5");
            demoBtn?.setAttribute("class", "py-2 px-3 rounded-lg text-xs font-extrabold bg-transparent text-slate-400 hover:text-white transition cursor-pointer flex items-center justify-center gap-1.5");
            planWrap?.classList.remove("hidden");
            demoWrap?.classList.add("hidden");
            if (nameInput && nameInput.value === "Demo Account") {
                nameInput.value = "";
            }
        }
    };

    realBtn?.addEventListener("click", () => setProfileMode("real"));
    demoBtn?.addEventListener("click", () => {
        if (!demoBtn.disabled) setProfileMode("demo");
    });
    updateProfileDemoBtnState();

    const createForm = document.getElementById("profileCreateSubForm");
    if (createForm) {
        createForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const input = document.getElementById("profileNewSubNameInput");
            const planSelect = document.getElementById("profileNewSubPlanSelect");
            const msg = document.getElementById("profileCreateSubMessage");
            if (!input || !msg) return;
            
            msg.classList.remove("hidden", "text-red-400", "text-emerald-400");
            msg.className = "text-xs font-bold mt-2 text-slate-400";
            msg.textContent = "Creating sub account...";

            const isDemo = profileSubMode === "demo";
            
            try {
                await apiRequest("/user/sub-accounts", {
                    method: "POST",
                    body: JSON.stringify({
                        name: input.value.trim(),
                        account_mode: isDemo ? "demo" : "real",
                        plan: isDemo ? "demo" : (planSelect ? planSelect.value : "basic"),
                        is_demo: isDemo
                    })
                });
                input.value = "";
                msg.className = "text-xs font-bold mt-2 text-emerald-400";
                msg.textContent = "Sub account created successfully!";
                txInitProfileSubAccounts();
            } catch (err) {
                msg.className = "text-xs font-bold mt-2 text-red-400";
                msg.textContent = err.message || "Failed to create sub account.";
            }
        });
    }

    const transferForm = document.getElementById("profileSubTransferForm");
    if (transferForm) {
        transferForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const targetAcc = document.getElementById("profileSubTransferAccount").value;
            const dir = document.getElementById("profileSubTransferDirection").value;
            const amount = document.getElementById("profileSubTransferAmount").value;
            const msg = document.getElementById("profileSubTransferMessage");
            if (!msg) return;
            
            msg.classList.remove("hidden", "bg-red-400/20", "text-red-300", "bg-emerald-400/20", "text-emerald-300");
            msg.className = "text-xs font-bold p-3 rounded-xl bg-slate-800/40 text-slate-300 mt-3";
            msg.textContent = "Processing transfer...";
            
            try {
                await apiRequest("/wallet/transfer-sub", {
                    method: "POST",
                    body: JSON.stringify({
                        amount: amount,
                        direction: dir,
                        sub_user_id: targetAcc
                    })
                });
                document.getElementById("profileSubTransferAmount").value = "";
                msg.className = "text-xs font-bold p-3 rounded-xl bg-emerald-400/20 text-emerald-300 mt-3";
                msg.textContent = "Transfer completed successfully!";
                txInitProfileSubAccounts();
            } catch (err) {
                msg.className = "text-xs font-bold p-3 rounded-xl bg-red-400/20 text-red-300 mt-3";
                msg.textContent = err.message || "Failed to execute transfer.";
            }
        });
    }
}

function escapeHtml(text) {
    return (text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function txUpdateProfileSubTransferPreview() {
    const amountInput = document.getElementById("profileSubTransferAmount");
    const directionSelect = document.getElementById("profileSubTransferDirection");
    const previewEl = document.getElementById("profileSubTransferPreview");
    if (!amountInput || !directionSelect || !previewEl) return;

    const rate = Number(profileState.wallet?.usdt_inr_rate || 88.50);
    const amount = parseFloat(amountInput.value || 0);
    const dir = directionSelect.value;

    if (amount <= 0) {
        previewEl.textContent = `Rate: 1 USDT = ₹${rate.toFixed(2)} INR. Enter amount to see preview.`;
        return;
    }

    if (dir === "main_to_sub") {
        const usdtEq = (amount / rate).toFixed(4);
        previewEl.innerHTML = `Rate: 1 USDT = ₹${rate.toFixed(2)} INR<br/>Transferring <strong>₹${amount.toLocaleString()} INR</strong> will credit ≈ <strong>${usdtEq} USDT</strong> to target account.`;
    } else {
        const inrEq = (amount * rate).toFixed(2);
        previewEl.innerHTML = `Rate: 1 USDT = ₹${rate.toFixed(2)} INR<br/>Transferring <strong>${amount.toFixed(4)} USDT</strong> will credit ≈ <strong>₹${parseFloat(inrEq).toLocaleString()} INR</strong> to Main Wallet.`;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Bank Account Management
// ══════════════════════════════════════════════════════════════════════════════

function showBankFormMsg(msg, isError = false) {
    const el = document.getElementById("profileBankFormMsg");
    if (!el) return;
    el.textContent = msg;
    el.className = isError
        ? "text-sm font-bold px-4 py-3 rounded-xl border border-red-400/30 bg-red-400/10 text-red-300"
        : "text-sm font-bold px-4 py-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 4000);
}

function renderBankAccountCard(acc) {
    const isPrimary = acc.is_primary;
    const hasUpi = acc.upi_id;
    const hasBank = acc.account_number;

    let detailLines = [];
    if (acc.account_holder_name) detailLines.push(`<span class="text-slate-400">Name:</span> <strong class="text-white">${acc.account_holder_name}</strong>`);
    if (acc.bank_name) detailLines.push(`<span class="text-slate-400">Bank:</span> <strong class="text-white">${acc.bank_name}</strong>`);
    if (hasBank) detailLines.push(`<span class="text-slate-400">Account No:</span> <strong class="font-mono text-white">${acc.account_number}</strong>`);
    if (acc.ifsc_code) detailLines.push(`<span class="text-slate-400">IFSC:</span> <strong class="font-mono text-white">${acc.ifsc_code}</strong>`);
    if (hasUpi) detailLines.push(`<span class="text-slate-400">UPI ID:</span> <strong class="text-cyan-300">${acc.upi_id}</strong>`);
    if (acc.account_type) detailLines.push(`<span class="text-slate-400">Type:</span> <strong class="text-white capitalize">${acc.account_type}</strong>`);

    return `
    <div class="tx-bank-card rounded-2xl border ${isPrimary ? "border-cyan-400/40 bg-cyan-400/5" : "border-white/5 bg-white/[0.02]"} p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 transition hover:bg-white/[0.04]" data-bank-id="${acc.id}">
        <div class="flex-1">
            <div class="flex items-center gap-2 mb-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${isPrimary ? "#22d3ee" : "#94a3b8"}" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="15" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                ${isPrimary ? `<span class="text-[10px] font-black uppercase tracking-wider text-cyan-300 bg-cyan-400/15 border border-cyan-400/25 px-2 py-0.5 rounded-full">⭐ Primary</span>` : ""}
                ${hasUpi && !hasBank ? `<span class="text-[10px] font-black uppercase tracking-wider text-violet-300 bg-violet-400/15 border border-violet-400/20 px-2 py-0.5 rounded-full">UPI</span>` : ""}
                ${hasBank ? `<span class="text-[10px] font-black uppercase tracking-wider text-emerald-300 bg-emerald-400/15 border border-emerald-400/20 px-2 py-0.5 rounded-full">Bank</span>` : ""}
            </div>
            <div class="space-y-1 text-xs leading-relaxed">
                ${detailLines.map(l => `<p>${l}</p>`).join("")}
            </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0 mt-1">
            ${!isPrimary ? `<button type="button" class="bank-set-primary-btn text-[11px] font-black text-cyan-400 hover:text-cyan-300 bg-cyan-400/10 hover:bg-cyan-400/20 border border-cyan-400/25 px-3 py-1.5 rounded-xl transition" data-bank-id="${acc.id}">Set Primary</button>` : ""}
            <button type="button" class="bank-delete-btn text-[11px] font-black text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 border border-red-400/25 px-3 py-1.5 rounded-xl transition" data-bank-id="${acc.id}">Remove</button>
        </div>
    </div>`;
}

async function txInitProfileBankAccounts() {
    const listEl = document.getElementById("profileBankAccountsList");
    const badge = document.getElementById("profileBankCountBadge");
    if (!listEl) return;

    listEl.innerHTML = `<div class="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm font-semibold">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="7" width="20" height="15" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
        Loading...</div>`;

    try {
        const resp = await apiRequest("/user/bank-accounts");
        const accounts = (resp.data?.bank_accounts) || [];

        if (badge) badge.textContent = `${accounts.length} / 5`;

        if (accounts.length === 0) {
            listEl.innerHTML = `<div class="flex flex-col items-center gap-3 py-10 text-slate-500">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"><rect x="2" y="7" width="20" height="15" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
                <p class="text-sm font-semibold">No bank accounts saved yet</p>
                <p class="text-xs">Add a bank account above to autofill in withdrawal popup.</p>
            </div>`;
            return;
        }

        // Sort: primary first
        accounts.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
        listEl.innerHTML = accounts.map(renderBankAccountCard).join("");

        // Bind delete buttons
        listEl.querySelectorAll(".bank-delete-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const bankId = btn.dataset.bankId;
                btn.disabled = true;
                btn.textContent = "Removing...";
                try {
                    await apiRequest(`/user/bank-accounts/${bankId}`, { method: "DELETE" });
                    txInitProfileBankAccounts();
                    showBankFormMsg("Bank account removed.", false);
                } catch (err) {
                    btn.disabled = false;
                    btn.textContent = "Remove";
                    showBankFormMsg(showApiError(err, "Failed to remove bank account."), true);
                }
            });
        });

        // Bind set-primary buttons
        listEl.querySelectorAll(".bank-set-primary-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const bankId = btn.dataset.bankId;
                btn.disabled = true;
                btn.textContent = "Setting...";
                try {
                    await apiRequest(`/user/bank-accounts/${bankId}/set-primary`, { method: "PATCH" });
                    txInitProfileBankAccounts();
                    showBankFormMsg("Primary bank account updated!", false);
                } catch (err) {
                    btn.disabled = false;
                    btn.textContent = "Set Primary";
                    showBankFormMsg(showApiError(err, "Failed to set primary account."), true);
                }
            });
        });

    } catch (err) {
        listEl.innerHTML = `<p class="text-xs text-red-400 font-semibold py-4">${showApiError(err, "Failed to load bank accounts.")}</p>`;
    }
}

function txBindProfileBankAccountEvents() {
    const form = document.getElementById("profileAddBankForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("profileAddBankBtn");
        const msgEl = document.getElementById("profileBankFormMsg");

        const payload = {
            account_holder_name: document.getElementById("bankHolderName")?.value.trim() || "",
            bank_name: document.getElementById("bankName")?.value.trim() || "",
            account_number: document.getElementById("bankAccountNumber")?.value.trim() || "",
            ifsc_code: document.getElementById("bankIfscCode")?.value.trim().toUpperCase() || "",
            upi_id: document.getElementById("bankUpiId")?.value.trim() || "",
            account_type: document.getElementById("bankAccountType")?.value || "savings",
            is_primary: document.getElementById("bankIsPrimary")?.checked || false
        };

        if (!payload.upi_id && !payload.account_number) {
            showBankFormMsg("Please enter a UPI ID or Bank Account Number.", true);
            return;
        }

        if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }
        try {
            await apiRequest("/user/bank-accounts", {
                method: "POST",
                body: JSON.stringify(payload)
            });
            form.reset();
            showBankFormMsg("Bank account saved successfully! ✓", false);
            txInitProfileBankAccounts();
        } catch (err) {
            showBankFormMsg(showApiError(err, "Failed to save bank account."), true);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = "Save Bank Account"; }
        }
    });
}

// ──────────────────────────────────────────────────────────────────────────────
// Expose primary bank account for wallet.js autofill
// ──────────────────────────────────────────────────────────────────────────────
window.txGetPrimaryBankAccount = async function () {
    try {
        const resp = await apiRequest("/user/bank-accounts");
        const accounts = resp.data?.bank_accounts || [];
        return accounts.find(a => a.is_primary) || accounts[0] || null;
    } catch {
        return null;
    }
};

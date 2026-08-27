"use strict";


/* =========================================================
   WALLET INITIAL DATA-READY INTRO
   - Covers only the first wallet-page load.
   - Hides after wallet data/render completes.
   - Safety timeout prevents a blocked page if an API stalls.
========================================================= */
const TX_WALLET_INTRO_MIN_VISIBLE_MS = 1050;
const TX_WALLET_INTRO_SAFETY_MS = 12000;
const txWalletIntroStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
let txWalletIntroSafetyTimer = null;
let txWalletIntroHidePromise = null;

function txWalletIntroNow() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function scheduleWalletIntroSafety() {
    window.clearTimeout(txWalletIntroSafetyTimer);
    txWalletIntroSafetyTimer = window.setTimeout(() => {
        hideWalletPageIntro({ immediate: true });
    }, TX_WALLET_INTRO_SAFETY_MS);
}

function hideWalletPageIntro(options = {}) {
    if (txWalletIntroHidePromise) {
        return txWalletIntroHidePromise;
    }

    const intro = document.getElementById("txWalletPageIntro");
    if (!intro) {
        document.body?.classList.remove("tx-wallet-intro-active");
        return Promise.resolve();
    }

    const immediate = Boolean(options.immediate);
    const elapsed = txWalletIntroNow() - txWalletIntroStartedAt;
    const waitMs = immediate ? 0 : Math.max(0, TX_WALLET_INTRO_MIN_VISIBLE_MS - elapsed);

    txWalletIntroHidePromise = new Promise((resolve) => {
        window.setTimeout(() => {
            window.clearTimeout(txWalletIntroSafetyTimer);
            intro.classList.add("is-leaving");
            document.body.classList.remove("tx-wallet-intro-active");

            window.setTimeout(() => {
                intro.remove();
                resolve();
            }, 540);
        }, waitMs);
    });

    return txWalletIntroHidePromise;
}



/*
|--------------------------------------------------------------------------
| TraidiumX Crypto Wallet Page
|--------------------------------------------------------------------------
| Company-safe crypto-only wallet flow:
| - No UPI / no Indian bank / no INR payment rails in user wallet UI.
| - Deposit: user sends USDT to backend-configured address and submits TXID.
| - Withdrawal: user requests USDT payout to external crypto address.
| - Wallet balance changes only through backend ledger.
| - Dev-complete helpers are visible only when backend APP_ENV=development.
|--------------------------------------------------------------------------
*/

const WALLET_STATE = {
    wallet: null,
    ledger: [],
    deposits: [],
    withdrawals: [],
    pnlSummary: null,
    positionSummary: null,
    selectedSubAccountId: null,
    cryptoDeposit: {
        networks: [],
        selectedNetwork: "TRC20",
        minAmount: 10,
        maxAmount: 1000000
    },
    environment: "unknown",
    loading: false,
    walletLoadRequestSeq: 0,
    autoRefreshTimer: null,
    balanceRefreshTimer: null,
    walletSyncEventsBound: false,
    statusSnapshotLoaded: false,
    accountStatus: { account_status: "active", is_active: true },
    withdrawalFeeEstimate: null,
    withdrawalFeeLoading: false,
    activeAction: "",
    exchangeIntervalId: null,
    currentExchangeRate: null,
    currentExchangeFromAsset: null,
    currentExchangeToAsset: null,
    history: {
        ledger: { search: "", status: "all", currency: "all", page: 1, pageSize: 5 },
        deposits: { search: "", status: "all", page: 1, pageSize: 5 },
        withdrawals: { search: "", status: "all", page: 1, pageSize: 5 }
    }
};

const walletElements = {
    alert: document.getElementById("walletAlert"),
    loginRequired: document.getElementById("walletLoginRequired"),
    restrictedNotice: document.getElementById("walletRestrictedNotice"),
    ledgerAccountFilter: document.getElementById("ledgerAccountFilter"),
    balanceCards: document.getElementById("walletBalanceCards"),
    statsGrid: document.getElementById("walletStatsGrid"),
    depositPanel: document.getElementById("walletDepositPanel"),
    ledgerPanel: document.getElementById("walletLedgerPanel"),
    depositHistoryPanel: document.getElementById("walletDepositHistoryPanel"),
    statusText: document.getElementById("walletStatusText"),
    environmentText: document.getElementById("walletEnvironmentText"),
    availableBalance: document.getElementById("walletAvailableBalance"),
    lockedBalance: document.getElementById("walletLockedBalance"),
    totalBalance: document.getElementById("walletTotalBalance"),
    openMargin: document.getElementById("walletOpenMargin"),
    unrealizedPnl: document.getElementById("walletUnrealizedPnl"),
    ledgerCount: document.getElementById("walletLedgerCount"),
    badgeText: document.getElementById("walletBadgeText"),
    mainTitle: document.getElementById("walletMainTitle"),
    mainSubtitle: document.getElementById("walletMainSubtitle"),
    lockedBalanceLabel: document.getElementById("walletLockedBalanceLabel"),
    lockedBalanceNote: document.getElementById("walletLockedBalanceNote"),
    openMarginLabel: document.getElementById("walletOpenMarginLabel"),
    openMarginNote: document.getElementById("walletOpenMarginNote"),
    ledgerBody: document.getElementById("ledgerTableBody"),
    depositBody: document.getElementById("depositTableBody"),
    withdrawalBody: document.getElementById("withdrawalTableBody"),
    ledgerEmpty: document.getElementById("ledgerEmptyState"),
    depositEmpty: document.getElementById("depositEmptyState"),
    withdrawalEmpty: document.getElementById("withdrawalEmptyState"),
    refreshBtn: document.getElementById("refreshWalletBtn"),
    depositForm: document.getElementById("depositForm"),
    cryptoNetwork: document.getElementById("cryptoNetwork"),
    cryptoAsset: document.getElementById("cryptoAsset"),
    cryptoDepositAddress: document.getElementById("cryptoDepositAddress"),
    cryptoAddressStatus: document.getElementById("cryptoAddressStatus"),
    copyCryptoAddressBtn: document.getElementById("copyCryptoAddressBtn"),
    createDepositBtn: document.getElementById("createDepositBtn"),
    payWithMetaMaskBtn: document.getElementById("payWithMetaMaskBtn"),
    get withdrawalForm() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawalForm" : "mainWithdrawalForm"); },
    get withdrawNetwork() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawNetwork" : "mainWithdrawNetwork"); },
    get withdrawAsset() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawAsset" : "mainWithdrawAsset"); },
    get withdrawalAddress() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawalAddress" : "mainWithdrawalAddress"); },
    get withdrawAmount() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawAmount" : "mainWithdrawAmount"); },
    get withdrawFeePreview() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawFeePreview" : "mainWithdrawFeePreview"); },
    get withdrawPreviewAmount() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawPreviewAmount" : "mainWithdrawPreviewAmount"); },
    get withdrawPreviewCompanyFee() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawPreviewCompanyFee" : "mainWithdrawPreviewCompanyFee"); },
    get withdrawPreviewNetworkFee() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawPreviewNetworkFee" : "mainWithdrawPreviewNetworkFee"); },
    get withdrawPreviewTotalFee() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawPreviewTotalFee" : "mainWithdrawPreviewTotalFee"); },
    get withdrawPreviewTotalDebit() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawPreviewTotalDebit" : "mainWithdrawPreviewTotalDebit"); },
    get withdrawPreviewReceive() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawPreviewReceive" : "mainWithdrawPreviewReceive"); },
    get withdrawPreviewNote() { return document.getElementById(isWalletActionModalOpen() ? "modalWithdrawPreviewNote" : "mainWithdrawPreviewNote"); },
    depositAmount: document.getElementById("depositAmount"),
    depositTxHash: document.getElementById("depositTxHash"),
    demoCreditPanel: document.getElementById("demoWalletCreditPanel"),
    demoDepositForm: document.getElementById("demoDepositForm"),
    demoDepositAmount: document.getElementById("demoDepositAmount"),
    demoDepositNetwork: document.getElementById("demoDepositNetwork"),
    demoDepositBtn: document.getElementById("demoDepositBtn"),
    demoWithdrawForm: document.getElementById("demoWithdrawForm"),
    demoWithdrawAmount: document.getElementById("demoWithdrawAmount"),
    demoWithdrawNetwork: document.getElementById("demoWithdrawNetwork"),
    demoWithdrawFeePreview: document.getElementById("demoWithdrawFeePreview"),
    demoWithdrawPreviewAmount: document.getElementById("demoWithdrawPreviewAmount"),
    demoWithdrawPreviewCompanyFee: document.getElementById("demoWithdrawPreviewCompanyFee"),
    demoWithdrawPreviewNetworkFee: document.getElementById("demoWithdrawPreviewNetworkFee"),
    demoWithdrawPreviewTotalFee: document.getElementById("demoWithdrawPreviewTotalFee"),
    demoWithdrawPreviewTotalDebit: document.getElementById("demoWithdrawPreviewTotalDebit"),
    demoWithdrawPreviewReceive: document.getElementById("demoWithdrawPreviewReceive"),
    demoWithdrawPreviewNote: document.getElementById("demoWithdrawPreviewNote"),
    demoWithdrawBtn: document.getElementById("demoWithdrawBtn"),
    demoCreditForm: document.getElementById("demoCreditForm"),
    demoCreditAmount: document.getElementById("demoCreditAmount"),
    demoCreditBtn: document.getElementById("demoCreditBtn"),
    transferPanel: document.getElementById("walletTransferPanel"),
    mainToTradingForm: document.getElementById("mainToTradingForm"),
    tradingToMainForm: document.getElementById("tradingToMainForm"),
    mainToTradingAmount: document.getElementById("mainToTradingAmount"),
    tradingToMainAmount: document.getElementById("tradingToMainAmount"),
    mainToTradingBtn: document.getElementById("mainToTradingBtn"),
    tradingToMainBtn: document.getElementById("tradingToMainBtn"),
    actionPanel: document.getElementById("walletActionPanel"),
    openTransferBtn: document.getElementById("walletOpenTransferBtn"),
    openDepositBtn: document.getElementById("walletOpenDepositBtn"),
    openWithdrawBtn: document.getElementById("walletOpenWithdrawBtn"),
    actionModal: document.getElementById("walletActionModal"),
    actionBackdrop: document.getElementById("walletActionBackdrop"),
    actionModalClose: document.getElementById("walletActionModalClose"),
    actionModalTitle: document.getElementById("walletActionModalTitle"),
    internalTransferForm: document.getElementById("walletInternalTransferForm"),
    internalTransferAsset: document.getElementById("walletInternalTransferAsset"),
    internalTransferRecipient: document.getElementById("walletInternalTransferRecipient"),
    internalTransferAmount: document.getElementById("walletInternalTransferAmount"),
    internalTransferMyBalance: document.getElementById("walletInternalTransferMyBalance"),
    internalTransferSubmitBtn: document.getElementById("walletInternalTransferSubmitBtn"),
    quickInternalTransferBtn: document.getElementById("quickInternalTransferBtn"),
    actionModalSubtitle: document.getElementById("walletActionModalSubtitle"),
    actionModalMessage: document.getElementById("walletActionModalMessage"),
    actionPanels: Array.from(document.querySelectorAll("[data-wallet-action-panel]")),
    modalTradingBalance: document.getElementById("walletModalTradingBalance"),
    modalMainBalance: document.getElementById("walletModalMainBalance"),
    modalPnl: document.getElementById("walletModalPnl"),
    unifiedTransferForm: document.getElementById("walletTransferForm"),
    unifiedTransferDirection: document.getElementById("walletTransferDirection"),
    unifiedTransferAmount: document.getElementById("walletTransferAmount"),
    unifiedTransferBtn: document.getElementById("walletTransferSubmitBtn"),
    depositAddressConfirmation: document.getElementById("depositAddressConfirmation"),
    ledgerSearchInput: document.getElementById("ledgerSearchInput"),
    ledgerCurrencyFilter: document.getElementById("ledgerCurrencyFilter"),
    ledgerTypeFilter: document.getElementById("ledgerTypeFilter"),
    ledgerPageSize: document.getElementById("ledgerPageSize"),
    ledgerPagination: document.getElementById("ledgerPagination"),
    depositSearchInput: document.getElementById("depositSearchInput"),
    depositCurrencyFilter: document.getElementById("depositCurrencyFilter"),
    depositStatusFilter: document.getElementById("depositStatusFilter"),
    depositPageSize: document.getElementById("depositPageSize"),
    depositPagination: document.getElementById("depositPagination"),
    withdrawalSearchInput: document.getElementById("withdrawalSearchInput"),
    withdrawalCurrencyFilter: document.getElementById("withdrawalCurrencyFilter"),
    withdrawalStatusFilter: document.getElementById("withdrawalStatusFilter"),
    withdrawalPageSize: document.getElementById("withdrawalPageSize"),
    withdrawalPagination: document.getElementById("withdrawalPagination")
};

function walletEscape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function walletNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function getWalletCurrency() {
    return WALLET_STATE.wallet?.currency || "USDT";
}

function getItemCurrency(item) {
    if (!item) return getWalletCurrency();
    const cur = String(item.currency || "").toUpperCase();
    if (cur === "INR" || cur === "USDT") {
        return cur;
    }
    const type = String(item.transaction_type || item.type || "").toLowerCase();
    const desc = String(item.description || "").toLowerCase();

    if (type.includes("inr") || desc.includes("inr") || desc.includes("₹")) {
        return "INR";
    }
    if (type.includes("crypto") || type.includes("usdt") || desc.includes("usdt") || desc.includes("verified usdt") || desc.includes("$")) {
        return "USDT";
    }
    return getWalletCurrency();
}

function getMainWalletData() {
    const wallet = WALLET_STATE.wallet || {};
    const selectedCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
    if (selectedCurrency === "INR") {
        return wallet.main_wallet_inr || {
            available_balance: 0,
            locked_balance: 0,
            total_balance: 0,
            currency: "INR"
        };
    } else {
        return wallet.main_wallet_usdt || {
            available_balance: 0,
            locked_balance: 0,
            total_balance: 0,
            currency: "USDT"
        };
    }
}

function getActiveWalletData() {
    const activeSubId = localStorage.getItem("traidiumx_active_user_id");
    const cache = (typeof txSubAccountsLocalCache !== "undefined" ? txSubAccountsLocalCache : []) || [];
    if (activeSubId && cache.length > 0) {
        const sub = cache.find(s => s.id === activeSubId);
        if (sub && sub.wallet) return sub.wallet;
    }
    const parentEntry = cache.find(s => s.is_parent);
    if (!activeSubId && parentEntry && parentEntry.wallet) {
        return parentEntry.wallet;
    }
    return WALLET_STATE.wallet || {};
}

function getTradingWalletData() {
    const wallet = getActiveWalletData();
    const activeCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const bucketKey = activeCurrency === "INR" ? "trading_wallet_inr" : "trading_wallet_usdt";
    const fallbackCurrency = activeCurrency === "INR" ? "INR" : "USDT";
    return wallet[bucketKey] || wallet.trading_wallet || {
        available_balance: wallet.available_balance || 0,
        locked_balance: wallet.locked_balance || 0,
        total_balance: wallet.total_balance || 0,
        currency: fallbackCurrency
    };
}

function isBalanceHidden() {
    return localStorage.getItem("tx_balance_hidden") === "1";
}

function formatWalletMoney(value, currency = getWalletCurrency(), decimals = 2) {
    const amount = walletNumber(value, 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    const cur = String(currency || "").toUpperCase();
    if (cur === "INR" || cur === "₹") {
        return `₹${amount}`;
    }
    return `$${amount}`;
}

function formatWalletMoneyPrivate(value, currency = getWalletCurrency(), decimals = 2) {
    if (isBalanceHidden()) {
        return "••••••••";
    }
    return formatWalletMoney(value, currency, decimals);
}

function formatWalletDate(value) {
    if (!value) {
        return "--";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "--";
    }

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function prettyType(value) {
    const normalized = String(value || "--")
        .replace(/trading_fee_debit/gi, "Trading Fee Debit")
        .replace(/platform_fee_debit/gi, "Platform Fee Debit");

    let result = normalized
        .replaceAll("_", " ")
        .replaceAll("-", " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());

    // Fix currency casing
    result = result
        .replace(/\bInr\b/g, "INR")
        .replace(/\bUsdt\b/g, "USDT")
        .replace(/\bUpi\b/g, "UPI");

    return result;
}

function directionClass(direction) {
    const value = String(direction || "").toLowerCase();
    if (["credit", "in"].includes(value)) return "text-emerald-400";
    if (["finalized", "settled", "status"].includes(value)) return "text-cyan-300";
    return "text-red-400";
}

function isWithdrawalFinalizedLedger(item) {
    if (!item) return false;
    const type = String(item.transaction_type || item.type || "").toLowerCase();
    const dir = String(item.direction || "").toLowerCase();
    const desc = String(item.description || "").toLowerCase();

    return (
        ["withdrawal_completed", "inr_withdrawal_completed", "crypto_withdrawal_completed"].includes(type) ||
        dir === "finalized" ||
        desc.includes("no extra debit") ||
        desc.includes("locked amount finalized") ||
        desc.includes("locked main wallet amount")
    );
}

function withdrawalFinalizedDescription(description) {
    const text = String(description || "").trim();
    const note = "Locked withdrawal amount finalized. No extra debit was taken from available balance.";
    if (!text) return note;
    return /no extra debit|already locked|finalized/i.test(text) ? text : `${text}. ${note}`;
}


function isWithdrawalLockLedger(item) {
    const type = String(item?.transaction_type || item?.type || "").toLowerCase();
    return [
        "demo_withdrawal_request_lock",
        "demo_inr_withdrawal_request_lock",
        "crypto_withdrawal_request",
        "inr_withdrawal_request",
        "withdrawal_request_lock",
        "withdrawal_request_locked"
    ].includes(type);
}

function withdrawalLedgerReference(item) {
    return String(item?.reference_id || item?.withdrawal_id || "").trim();
}

function getDisplayLedgerRows(rows) {
    const sourceRows = Array.isArray(rows) ? rows : [];

    // Filter out all secondary "Finalized / Withdrawal Completed / No Extra Debit" entries
    // so that each withdrawal is represented by exactly one clean Debit entry.
    const displayRows = sourceRows.filter((item) => {
        if (!item) return false;
        if (isWithdrawalFinalizedLedger(item)) {
            return false;
        }
        return true;
    });

    return displayRows.sort((a, b) => {
        const dateA = new Date(a?.created_at || 0).getTime();
        const dateB = new Date(b?.created_at || 0).getTime();
        return dateB - dateA;
    });
}

function statusClass(status, tone = "") {
    const normalizedTone = String(tone || "").toLowerCase();
    const value = String(status || "").toLowerCase();

    if (normalizedTone === "success" || ["completed", "filled", "closed", "approved"].includes(value)) {
        return "bg-emerald-400/10 text-emerald-400";
    }
    if (normalizedTone === "danger" || ["failed", "rejected"].includes(value)) {
        return "bg-red-400/10 text-red-400";
    }
    if (normalizedTone === "neutral" || ["cancelled", "canceled"].includes(value)) {
        return "bg-slate-400/10 text-slate-300";
    }
    if (["pending_admin_approval", "pending_payout", "pending", "queued"].includes(value)) {
        return "bg-cyan-400/10 text-cyan-300";
    }
    return "bg-orange-400/10 text-orange-300";
}

function getWithdrawalStatusMeta(item = {}) {
    const rawStatus = String(item.status || "pending_admin_approval").toLowerCase();
    const backendLabel = String(item.status_label || "").trim();
    const backendMessage = String(item.status_message || "").trim();

    const fallback = {
        pending: { label: "Pending Admin Approval", tone: "warning", message: "Amount is locked. Waiting for admin approval.", canCancel: true },
        pending_admin_approval: { label: "Pending Admin Approval", tone: "warning", message: "Amount is locked. Waiting for admin approval.", canCancel: true },
        pending_payout: { label: "Pending Admin Approval", tone: "warning", message: "Amount is locked. Waiting for admin approval.", canCancel: true },
        queued: { label: "Queued for Review", tone: "warning", message: "Withdrawal is queued for admin review.", canCancel: true },
        approved: { label: "Approved by Admin", tone: "success", message: "Admin approved this request. Locked balance has been finally withdrawn.", canCancel: false },
        completed: { label: "Completed", tone: "success", message: "Withdrawal completed successfully.", canCancel: false },
        rejected: { label: "Rejected by Admin", tone: "danger", message: "Admin rejected this request. Locked balance has been released back to available balance.", canCancel: false },
        cancelled: { label: "Cancelled by User", tone: "neutral", message: "You cancelled this request. Locked balance has been released back to available balance.", canCancel: false },
        failed: { label: "Failed", tone: "danger", message: "Withdrawal failed. Contact support if balance was not released.", canCancel: false }
    }[rawStatus] || {
        label: prettyType(rawStatus),
        tone: "warning",
        message: "Withdrawal status is being processed.",
        canCancel: false
    };

    let message = backendMessage || fallback.message;
    if (rawStatus === "rejected" && item.reject_reason) {
        message = `Rejected reason: ${item.reject_reason}`;
    }

    return {
        status: rawStatus,
        label: backendLabel || fallback.label,
        tone: String(item.status_tone || fallback.tone || "warning").toLowerCase(),
        message,
        canCancel: typeof item.can_cancel === "boolean" ? item.can_cancel : fallback.canCancel,
        decisionAt: item.decision_at || item.approved_at || item.rejected_at || item.completed_at || item.cancelled_at || ""
    };
}

function getWalletStatusCacheKey() {
    const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    const userId = user?.id || user?._id || "default";
    return `traidiumx_wallet_withdrawal_status_${userId}`;
}

function readWithdrawalStatusSnapshot() {
    try {
        return JSON.parse(localStorage.getItem(getWalletStatusCacheKey()) || "{}");
    } catch (error) {
        return {};
    }
}

function writeWithdrawalStatusSnapshot(withdrawals = []) {
    const snapshot = {};
    withdrawals.forEach((item) => {
        if (item?.id) {
            snapshot[item.id] = String(item.status || "").toLowerCase();
        }
    });

    try {
        localStorage.setItem(getWalletStatusCacheKey(), JSON.stringify(snapshot));
    } catch (error) {
        console.warn("Unable to save withdrawal status snapshot.", error);
    }
}

function notifyWithdrawalStatusChanges(withdrawals = []) {
    const previous = readWithdrawalStatusSnapshot();
    const finalMessages = [];

    withdrawals.forEach((item) => {
        const id = item?.id;
        if (!id || !previous[id]) return;

        const oldStatus = String(previous[id] || "").toLowerCase();
        const newStatus = String(item.status || "").toLowerCase();
        if (oldStatus === newStatus) return;

        const meta = getWithdrawalStatusMeta(item);
        if (["approved", "completed", "rejected", "cancelled", "failed"].includes(newStatus)) {
            finalMessages.push(`${item.withdrawal_reference || "Withdrawal"}: ${meta.label}`);
        }
    });

    writeWithdrawalStatusSnapshot(withdrawals);

    if (!WALLET_STATE.statusSnapshotLoaded) {
        WALLET_STATE.statusSnapshotLoaded = true;
        return;
    }

    if (finalMessages.length > 0) {
        showWalletAlert(finalMessages.slice(0, 2).join(" • "), "info");
    }
}

function showWalletAlert(message, type = "success") {
    if (!walletElements.alert) {
        return;
    }

    const successClass = "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
    const errorClass = "border-red-400/30 bg-red-400/10 text-red-300";
    const infoClass = "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";

    walletElements.alert.textContent = message;
    walletElements.alert.className = `mb-6 rounded-3xl border px-5 py-4 text-sm font-bold ${
        type === "error" ? errorClass : type === "info" ? infoClass : successClass
    }`;
    walletElements.alert.classList.remove("hidden");
}

function clearWalletAlert() {
    walletElements.alert?.classList.add("hidden");
}

function injectWalletConfirmStyles() {
    if (document.getElementById("txWalletConfirmStyles")) return;

    const style = document.createElement("style");
    style.id = "txWalletConfirmStyles";
    style.textContent = `
        .tx-wallet-confirm-backdrop {
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

        .tx-wallet-confirm-card {
            width: min(480px, 100%);
            border-radius: 26px;
            border: 1px solid rgba(148, 163, 184, 0.24);
            background: linear-gradient(180deg, #101827, #060a14);
            box-shadow: 0 28px 90px rgba(0, 0, 0, 0.62);
            padding: 26px;
            color: #e5e7eb;
            animation: txWalletConfirmIn 0.18s ease-out;
        }

        .tx-wallet-confirm-top {
            display: flex;
            align-items: flex-start;
            gap: 16px;
        }

        .tx-wallet-confirm-icon {
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

        .tx-wallet-confirm-icon.danger {
            color: #fca5a5;
            background: rgba(239, 68, 68, 0.12);
            border-color: rgba(239, 68, 68, 0.30);
        }

        .tx-wallet-confirm-title {
            margin: 0;
            font-size: 22px;
            line-height: 1.15;
            font-weight: 900;
            letter-spacing: -0.03em;
            color: #ffffff;
        }

        .tx-wallet-confirm-message {
            margin: 9px 0 0;
            color: #94a3b8;
            line-height: 1.55;
            font-size: 14px;
        }

        .tx-wallet-confirm-details {
            margin-top: 18px;
            display: grid;
            gap: 10px;
            border: 1px solid rgba(34, 211, 238, 0.16);
            background: rgba(15, 23, 42, 0.70);
            border-radius: 18px;
            padding: 14px;
        }

        .tx-wallet-confirm-detail-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            color: #94a3b8;
            font-size: 13px;
            line-height: 1.35;
        }

        .tx-wallet-confirm-detail-row strong {
            color: #f8fafc;
            font-weight: 900;
            text-align: right;
            white-space: nowrap;
        }

        .tx-wallet-confirm-detail-row.receive strong {
            color: #34d399;
        }

        .tx-wallet-confirm-detail-row.fee strong {
            color: #fbbf24;
        }

        .tx-wallet-confirm-detail-row.debit strong {
            color: #f87171;
        }

        .tx-wallet-confirm-note {
            margin-top: 12px;
            border-radius: 14px;
            border: 1px solid rgba(251, 191, 36, 0.22);
            background: rgba(251, 191, 36, 0.08);
            color: #fde68a;
            padding: 11px 12px;
            font-size: 12px;
            line-height: 1.5;
        }

        .tx-wallet-confirm-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 24px;
        }

        .tx-wallet-confirm-btn {
            border: 0;
            border-radius: 15px;
            padding: 12px 18px;
            font-size: 13px;
            font-weight: 900;
            cursor: pointer;
            transition: transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
        }

        .tx-wallet-confirm-btn:hover {
            transform: translateY(-1px);
        }

        .tx-wallet-confirm-btn.cancel {
            color: #cbd5e1;
            background: rgba(148, 163, 184, 0.12);
            border: 1px solid rgba(148, 163, 184, 0.20);
        }

        .tx-wallet-confirm-btn.confirm {
            color: #020617;
            background: linear-gradient(135deg, #22d3ee, #818cf8);
            box-shadow: 0 16px 34px rgba(34, 211, 238, 0.18);
        }

        .tx-wallet-confirm-btn.confirm.danger {
            color: #ffffff;
            background: linear-gradient(135deg, #fb7185, #f97316);
            box-shadow: 0 16px 34px rgba(251, 113, 133, 0.20);
        }

        @keyframes txWalletConfirmIn {
            from {
                opacity: 0;
                transform: translateY(12px) scale(0.96);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        @media (max-width: 520px) {
            .tx-wallet-confirm-card {
                padding: 22px;
                border-radius: 22px;
            }

            .tx-wallet-confirm-top {
                gap: 12px;
            }

            .tx-wallet-confirm-actions {
                flex-direction: column-reverse;
            }

            .tx-wallet-confirm-btn {
                width: 100%;
            }
        }
    `;

    document.head.appendChild(style);
}

function showWalletConfirm({
    title = "Confirm Action",
    message = "Are you sure?",
    details = [],
    note = "",
    confirmText = "Confirm",
    cancelText = "Cancel",
    danger = false
}) {
    injectWalletConfirmStyles();

    return new Promise((resolve) => {
        const oldModal = document.getElementById("txWalletConfirmModal");
        if (oldModal) oldModal.remove();

        const modal = document.createElement("div");
        modal.id = "txWalletConfirmModal";

        const detailsHtml = Array.isArray(details) && details.length > 0
            ? `<div class="tx-wallet-confirm-details">${details.map((item) => `
                <div class="tx-wallet-confirm-detail-row ${walletEscape(item.tone || "")}">
                    <span>${walletEscape(item.label || "")}</span>
                    <strong>${walletEscape(item.value || "--")}</strong>
                </div>
            `).join("")}</div>`
            : "";

        const noteHtml = note
            ? `<div class="tx-wallet-confirm-note">${walletEscape(note)}</div>`
            : "";

        modal.innerHTML = `
            <div class="tx-wallet-confirm-backdrop">
                <div class="tx-wallet-confirm-card" role="dialog" aria-modal="true">
                    <div class="tx-wallet-confirm-top">
                        <div class="tx-wallet-confirm-icon ${danger ? "danger" : ""}">
                            ${danger ? "!" : "✓"}
                        </div>

                        <div>
                            <h3 class="tx-wallet-confirm-title">${walletEscape(title)}</h3>
                            <p class="tx-wallet-confirm-message">${walletEscape(message)}</p>
                        </div>
                    </div>

                    ${detailsHtml}
                    ${noteHtml}

                    <div class="tx-wallet-confirm-actions">
                        <button type="button" class="tx-wallet-confirm-btn cancel" id="txWalletConfirmCancel">
                            ${walletEscape(cancelText)}
                        </button>
                        <button type="button" class="tx-wallet-confirm-btn confirm ${danger ? "danger" : ""}" id="txWalletConfirmOk">
                            ${walletEscape(confirmText)}
                        </button>
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
            if (event.key === "Escape") {
                close(false);
            }
        }

        document.addEventListener("keydown", escHandler);

        modal.querySelector("#txWalletConfirmCancel")?.addEventListener("click", () => close(false));
        modal.querySelector("#txWalletConfirmOk")?.addEventListener("click", () => close(true));

        modal.querySelector(".tx-wallet-confirm-backdrop")?.addEventListener("click", (event) => {
            if (event.target.classList.contains("tx-wallet-confirm-backdrop")) {
                close(false);
            }
        });
    });
}

function injectWalletPageStyles() {
    if (document.getElementById("txWalletPageStyles")) return;

    const style = document.createElement("style");
    style.id = "txWalletPageStyles";
    style.textContent = `
        #walletActionModal {
            align-items: center !important;
            justify-content: center !important;
            padding: 24px !important;
        }
        #walletActionModal .tx-wallet-action-card {
            width: min(640px, calc(100vw - 32px)) !important;
            max-width: 640px !important;
            max-height: min(92vh, 820px) !important;
            margin: auto !important;
            border-radius: 32px !important;
        }
        #walletActionModal .tx-wallet-action-card form {
            max-width: 100% !important;
        }
        @media (min-width: 1024px) {
            #walletActionModal .tx-wallet-action-card {
                width: 620px !important;
            }
        }
        @media (max-width: 640px) {
            #walletActionModal {
                padding: 14px !important;
            }
            #walletActionModal .tx-wallet-action-card {
                width: calc(100vw - 20px) !important;
                border-radius: 26px !important;
            }
        }
        .tx-wallet-action-btn {
            width: 100%;
            min-height: 108px;
            border-radius: 28px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            padding: 22px;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: center;
            gap: 7px;
            text-align: left;
            font-weight: 950;
            color: #fff;
            transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease, background .18s ease;
        }
        .tx-wallet-action-btn:hover { transform: translateY(-2px); }
        .tx-wallet-action-btn span { font-size: 22px; line-height: 1; }
        .tx-wallet-action-btn small { color: rgba(226, 232, 240, .74); font-size: 12px; font-weight: 800; }
        .tx-wallet-action-btn.transfer { background: linear-gradient(135deg, rgba(245, 158, 11, .23), rgba(15, 23, 42, .82)); border-color: rgba(245, 158, 11, .36); box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
        .tx-wallet-action-btn.deposit { background: linear-gradient(135deg, rgba(34, 211, 238, .24), rgba(15, 23, 42, .82)); border-color: rgba(34, 211, 238, .38); box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
        .tx-wallet-action-btn.withdraw { background: linear-gradient(135deg, rgba(239, 68, 68, .20), rgba(15, 23, 42, .86)); border-color: rgba(248, 113, 113, .28); box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
        .tx-form-label { display: block; margin-bottom: 8px; color: #94a3b8; font-size: 12px; font-weight: 950; text-transform: uppercase; letter-spacing: .12em; }
        .tx-form-input { width: 100%; border-radius: 18px; border: 1px solid rgba(255,255,255,.10); background: rgba(2,6,23,.88); padding: 14px 16px; color: #fff; outline: none; font-size: 14px; font-weight: 850; transition: border-color .15s ease, box-shadow .15s ease; }
        .tx-form-input:focus { border-color: rgba(34,211,238,.72); box-shadow: 0 0 0 3px rgba(34,211,238,.10); }
        .tx-submit-btn { width: 100%; border: 0; border-radius: 20px; padding: 16px 20px; font-size: 14px; font-weight: 950; color: #020617; transition: transform .15s ease, opacity .15s ease; cursor: pointer; }
        .tx-submit-btn:hover { transform: translateY(-1px); }
        .tx-submit-btn.transfer { background: linear-gradient(135deg, #facc15, #f59e0b); }
        .tx-submit-btn.deposit { background: linear-gradient(135deg, #67e8f9, #22d3ee); }
        .tx-submit-btn.withdraw { color: #fff; background: linear-gradient(135deg, #ef4444, #991b1b); box-shadow: 0 16px 36px rgba(127, 29, 29, .30); }
        .tx-submit-btn.exchange { background: linear-gradient(135deg, #22d3ee, #06b6d4); box-shadow: 0 8px 24px rgba(34, 211, 238, 0.25); }
        .tx-submit-btn.internal_transfer { background: linear-gradient(135deg, #67e8f9, #22d3ee); box-shadow: 0 8px 24px rgba(34, 211, 238, 0.25); }
        .tx-wallet-modal-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(34, 211, 238, 0.3) rgba(2, 6, 23, 0.4);
        }
        .tx-wallet-modal-scroll::-webkit-scrollbar {
            width: 6px;
        }
        .tx-wallet-modal-scroll::-webkit-scrollbar-track {
            background: rgba(2, 6, 23, 0.4);
            border-radius: 10px;
        }
        .tx-wallet-modal-scroll::-webkit-scrollbar-thumb {
            background: rgba(34, 211, 238, 0.3);
            border-radius: 10px;
        }
        .tx-wallet-modal-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(34, 211, 238, 0.6);
        }
        .tx-wallet-action-message { margin-bottom: 18px; border-radius: 18px; border: 1px solid; padding: 13px 15px; font-size: 13px; font-weight: 900; line-height: 1.45; }
        .tx-wallet-action-message.success { border-color: rgba(52,211,153,.34); background: rgba(16,185,129,.12); color: #bbf7d0; }
        .tx-wallet-action-message.error { border-color: rgba(248,113,113,.36); background: rgba(239,68,68,.12); color: #fecaca; }
        .tx-wallet-action-message.info { border-color: rgba(34,211,238,.34); background: rgba(34,211,238,.12); color: #cffafe; }
        .tx-history-card { border-radius: 32px; border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.05); padding: 22px; backdrop-filter: blur(18px); }
        .tx-history-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
        .tx-history-head h3 { margin: 0; font-size: 24px; line-height: 1.1; font-weight: 950; color: #fff; }
        .tx-history-head p { margin-top: 6px; font-size: 13px; color: #94a3b8; }
        .tx-history-controls { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
        .tx-history-controls input, .tx-history-controls select { border-radius: 999px; border: 1px solid rgba(255,255,255,.10); background: rgba(2,6,23,.72); color: #e5e7eb; padding: 11px 14px; font-size: 12px; font-weight: 850; outline: none; }
        .tx-history-controls input { min-width: 210px; }
        .tx-history-table-wrap { overflow-x: auto; scrollbar-width: none; }
        .tx-history-table-wrap::-webkit-scrollbar { display: none; }
        .tx-history-table-wrap table { width: 100%; min-width: 880px; border-collapse: collapse; }
        .tx-history-table-wrap th { border-bottom: 1px solid rgba(255,255,255,.10); padding: 13px 12px; text-align: left; color: #94a3b8; font-size: 11px; font-weight: 950; text-transform: uppercase; letter-spacing: .14em; }
        .tx-history-table-wrap td { border-bottom: 1px solid rgba(255,255,255,.06); padding: 14px 12px; vertical-align: top; }
        .tx-history-empty { margin-top: 14px; border-radius: 20px; background: rgba(2,6,23,.50); padding: 20px; text-align: center; color: #94a3b8; font-size: 14px; }
        .tx-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
        .tx-pagination button { border-radius: 999px; border: 1px solid rgba(255,255,255,.12); background: rgba(15,23,42,.72); color: #cbd5e1; padding: 8px 12px; font-size: 12px; font-weight: 900; }
        .tx-pagination button.active { background: #22d3ee; color: #020617; border-color: #22d3ee; }
        .tx-pagination button:disabled { opacity: .45; cursor: not-allowed; }
        .tx-pagination span { color: #94a3b8; font-size: 12px; font-weight: 800; }
        @media (max-width: 900px) {
            .tx-history-head { flex-direction: column; }
            .tx-history-controls { justify-content: stretch; width: 100%; }
            .tx-history-controls input, .tx-history-controls select { width: 100%; }
        }
    `;
    document.head.appendChild(style);
}

function isWalletActionModalOpen() {
    return Boolean(walletElements.actionModal && !walletElements.actionModal.classList.contains("hidden"));
}

function clearWalletActionMessage() {
    if (!walletElements.actionModalMessage) return;
    walletElements.actionModalMessage.textContent = "";
    walletElements.actionModalMessage.className = "hidden";
}

function showWalletActionMessage(message = "", type = "success") {
    const clean = String(message || "").trim();
    if (!clean) {
        clearWalletActionMessage();
        return;
    }

    if (!walletElements.actionModalMessage || !isWalletActionModalOpen()) {
        showWalletAlert(clean, type === "error" ? "error" : type === "info" ? "info" : "success");
        return;
    }

    const tone = type === "error" ? "error" : type === "info" ? "info" : "success";
    walletElements.actionModalMessage.textContent = clean;
    walletElements.actionModalMessage.className = `tx-wallet-action-message ${tone}`;
}

function updateWalletActionModalBalances() {
    const wallet = getActiveWalletData();
    const tradingWallet = getTradingWalletData();
    const tradingCurrency = tradingWallet.currency || "USDT";
    
    const activePanel = document.querySelector("[data-wallet-action-panel]:not(.hidden)");
    const action = activePanel?.getAttribute("data-wallet-action-panel");

    const tradingLabel = document.querySelector("#walletModalTradingCol p");
    const mainLabel = document.querySelector("#walletModalMainCol p");
    if (tradingLabel) tradingLabel.textContent = "Trading";
    if (mainLabel) mainLabel.textContent = "Main";

    const modalStatsGrid = document.getElementById("walletModalStatsGrid");
    const tradingCol = document.getElementById("walletModalTradingCol");
    const mainCol = document.getElementById("walletModalMainCol");
    const pnlCol = document.getElementById("walletModalPnlCol");

    if (action === "internal_transfer") {
        updateInternalTransferBalance();
        if (modalStatsGrid) modalStatsGrid.classList.add("hidden");
        return;
    }

    if (action === "exchange") {
        const fromAsset = (document.getElementById("walletExchangeFromAsset")?.value || "USDT").toUpperCase();
        const toAsset = (document.getElementById("walletExchangeToAsset")?.value || "USDT").toUpperCase();
        
        const fromKey = `main_wallet_${fromAsset.toLowerCase()}`;
        const toKey = `main_wallet_${toAsset.toLowerCase()}`;
        
        const fromWallet = wallet[fromKey] || { available_balance: 0 };
        const toWallet = wallet[toKey] || { available_balance: 0 };

        if (tradingLabel) tradingLabel.textContent = `${fromAsset} Balance`;
        if (mainLabel) mainLabel.textContent = `${toAsset} Balance`;

        if (walletElements.modalTradingBalance) {
            if (["INR", "USDT"].includes(fromAsset)) {
                walletElements.modalTradingBalance.textContent = formatWalletMoney(walletNumber(fromWallet.available_balance, 0), fromAsset);
            } else {
                walletElements.modalTradingBalance.textContent = `${walletNumber(fromWallet.available_balance, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${fromAsset}`;
            }
        }
        if (walletElements.modalMainBalance) {
            if (["INR", "USDT"].includes(toAsset)) {
                walletElements.modalMainBalance.textContent = formatWalletMoney(walletNumber(toWallet.available_balance, 0), toAsset);
            } else {
                walletElements.modalMainBalance.textContent = `${walletNumber(toWallet.available_balance, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${toAsset}`;
            }
        }

        if (tradingCol) tradingCol.classList.remove("hidden");
        if (mainCol) mainCol.classList.remove("hidden");
        if (pnlCol) pnlCol.classList.add("hidden");

        if (modalStatsGrid) {
            modalStatsGrid.className = "mb-5 grid grid-cols-2 gap-3 rounded-2xl border border-white/20 bg-slate-900/70 p-4 text-center";
        }
        return;
    }

    let mainCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
    if (action === "deposit") {
        mainCurrency = WALLET_STATE.activeDepositCurrency || mainCurrency;
    } else if (action === "withdraw") {
        mainCurrency = WALLET_STATE.activeWithdrawalCurrency || mainCurrency;
    }
    
    let mainWallet = {};
    const key = `main_wallet_${mainCurrency.toLowerCase()}`;
    if (wallet[key]) {
        mainWallet = wallet[key];
    } else if (mainCurrency === "INR") {
        mainWallet = wallet.main_wallet_inr || { available_balance: 0, locked_balance: 0, total_balance: 0, currency: "INR" };
    } else {
        mainWallet = wallet.main_wallet_usdt || { available_balance: 0, locked_balance: 0, total_balance: 0, currency: "USDT" };
    }

    if (walletElements.modalTradingBalance) {
        walletElements.modalTradingBalance.textContent = formatWalletMoney(walletNumber(tradingWallet.available_balance, 0), tradingCurrency);
    }
    if (walletElements.modalMainBalance) {
        if (["INR", "USDT"].includes(mainCurrency)) {
            walletElements.modalMainBalance.textContent = formatWalletMoney(walletNumber(mainWallet.available_balance, 0), mainCurrency);
        } else {
            walletElements.modalMainBalance.textContent = `${walletNumber(mainWallet.available_balance, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${mainCurrency}`;
        }
    }
    if (walletElements.modalPnl) {
        const unrealizedPnl = walletNumber(WALLET_STATE.pnlSummary?.total_unrealized_pnl ?? WALLET_STATE.positionSummary?.total_unrealized_pnl, 0);
        walletElements.modalPnl.textContent = `${unrealizedPnl >= 0 ? "+" : ""}${formatWalletMoney(unrealizedPnl, tradingCurrency)}`;
        walletElements.modalPnl.className = unrealizedPnl >= 0 ? "mt-1 text-sm font-black text-emerald-300" : "mt-1 text-sm font-black text-red-300";
    }

    // Hide Trading/P&L stats and center Main Wallet stats for specific crypto coins
    const isCryptoSpecific = !["USDT", "INR"].includes(mainCurrency);

    if (tradingCol) tradingCol.classList.toggle("hidden", isCryptoSpecific);
    if (pnlCol) pnlCol.classList.toggle("hidden", isCryptoSpecific);

    if (modalStatsGrid) {
        if (isCryptoSpecific) {
            modalStatsGrid.className = "mb-5 grid grid-cols-1 rounded-2xl border border-white/20 bg-slate-900/70 p-4 text-center";
        } else {
            modalStatsGrid.className = "mb-5 grid grid-cols-3 gap-3 rounded-2xl border border-white/20 bg-slate-900/70 p-4";
        }
    }
}

function resetWalletActionModalDOM() {
    // Reset forms
    walletElements.depositForm?.reset();
    walletElements.withdrawalForm?.reset();
    walletElements.unifiedTransferForm?.reset();
    walletElements.internalTransferForm?.reset();
    const recDetails = document.getElementById("walletInternalTransferRecipientDetails");
    if (recDetails) recDetails.classList.add("hidden");

    const headerIcon = document.getElementById("txModalHeaderIcon");
    if (headerIcon) {
        headerIcon.classList.add("hidden");
        headerIcon.classList.remove("flex");
    }

    // Reset internal transfer tabs to default (Receive)
    const btnReceive = document.getElementById("txItTabBtnReceive");
    const btnSend = document.getElementById("txItTabBtnSend");
    const contentReceive = document.getElementById("txItTabContentReceive");
    const contentSend = document.getElementById("txItTabContentSend");
    if (btnReceive && btnSend && contentReceive && contentSend) {
        contentReceive.classList.remove("hidden");
        contentSend.classList.add("hidden");
        btnReceive.className = "flex-1 rounded-xl py-2.5 text-xs font-black transition-all bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
        btnSend.className = "flex-1 rounded-xl py-2.5 text-xs font-black transition-all text-slate-400 hover:text-slate-200";
    }

    // Stop camera scanner if running
    if (typeof stopCameraScanner === "function") {
        stopCameraScanner();
    }

    // Clear balances display
    if (walletElements.modalTradingBalance) walletElements.modalTradingBalance.textContent = "--";
    if (walletElements.modalMainBalance) walletElements.modalMainBalance.textContent = "--";
    if (walletElements.modalPnl) {
        walletElements.modalPnl.textContent = "--";
        walletElements.modalPnl.className = "mt-1 text-sm font-black text-slate-300";
    }

    // Reset stats card grid styling
    const tradingCol = document.getElementById("walletModalTradingCol");
    const pnlCol = document.getElementById("walletModalPnlCol");
    const modalStatsGrid = document.getElementById("walletModalStatsGrid");
    if (tradingCol) tradingCol.classList.remove("hidden");
    if (pnlCol) pnlCol.classList.remove("hidden");
    if (modalStatsGrid) {
        modalStatsGrid.className = "mb-5 grid grid-cols-3 gap-3 rounded-2xl border border-white/20 bg-slate-900/70 p-4";
    }

    // Clear deposit inputs & addresses
    if (walletElements.cryptoDepositAddress) walletElements.cryptoDepositAddress.textContent = "--";
    if (walletElements.cryptoAddressStatus) walletElements.cryptoAddressStatus.textContent = "Loading address...";
    if (walletElements.depositAmount) {
        walletElements.depositAmount.value = "";
        walletElements.depositAmount.placeholder = "Loading...";
    }
    const boxLabel = document.getElementById("cryptoAddressBoxLabel");
    if (boxLabel) boxLabel.textContent = "Loading...";

    clearWalletActionMessage();
}

function openWalletActionModal(action = "deposit", selectedAsset = null) {
    if (!walletElements.actionModal) return;

    resetWalletActionModalDOM();

    if (!isLoggedIn()) {
        showWalletAlert("Please login first.", "error");
        return;
    }

    const target = ["transfer", "deposit", "withdraw", "exchange", "internal_transfer"].includes(String(action).toLowerCase())
        ? String(action).toLowerCase()
        : "deposit";

    WALLET_STATE.activeAction = target;
    const titleMap = {
        transfer: "Transfer Funds",
        deposit: "Deposit to Main Wallet",
        withdraw: "Withdraw from Main Wallet",
        exchange: "Exchange Main Wallet Crypto",
        internal_transfer: "Internal Money Transfer"
    };
    const subtitleMap = {
        transfer: "Move balance between Main Wallet and Trading Wallet.",
        deposit: "Copy the company address and confirm the exact same address before demo credit.",
        withdraw: "Submit your external wallet address. Admin approval completes payout.",
        exchange: "Exchange crypto coins in your Main Wallet at live market rates.",
        internal_transfer: "Send money instantly to another TraidiumX user off-chain."
    };

    if (walletElements.actionModalTitle) walletElements.actionModalTitle.textContent = titleMap[target];
    if (walletElements.actionModalSubtitle) walletElements.actionModalSubtitle.textContent = subtitleMap[target];

    // Update Transfer direction labels depending on active sub-account and active currency
    const activeSubId = localStorage.getItem("traidiumx_active_user_id");
    let activeSubName = "Trading Wallet";
    if (activeSubId && typeof txSubAccountsLocalCache !== "undefined" && Array.isArray(txSubAccountsLocalCache)) {
        const sub = txSubAccountsLocalCache.find(s => s.id === activeSubId);
        if (sub) {
            activeSubName = sub.name;
        }
    }
    
    const activeCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const isINR = activeCurrency === "INR";
    const rateBadge = document.getElementById("txTransferUsdtRateBadge");
    if (rateBadge) {
        rateBadge.style.display = isINR ? "flex" : "none";
    }

    const dirSelect = document.getElementById("walletTransferDirection");
    if (dirSelect) {
        const inrOption1 = dirSelect.options[0];
        const inrOption2 = dirSelect.options[1];
        if (inrOption1) {
            inrOption1.textContent = isINR 
                ? `Main Wallet (INR) → ${activeSubName} (USDT)`
                : `Main Wallet (USDT) → ${activeSubName} (USDT)`;
        }
        if (inrOption2) {
            inrOption2.textContent = isINR
                ? `${activeSubName} (USDT) → Main Wallet (INR)`
                : `${activeSubName} (USDT) → Main Wallet (USDT)`;
        }
    }
    if (walletElements.actionModalSubtitle && target === "transfer") {
        walletElements.actionModalSubtitle.textContent = `Move balance between Main Wallet and ${activeSubName}.`;
    }

    walletElements.actionPanels.forEach((panel) => {
        panel.classList.toggle("hidden", panel.getAttribute("data-wallet-action-panel") !== target);
    });

    clearWalletActionMessage();
    updateWalletActionModalBalances();
    walletElements.actionModal.classList.remove("hidden");
    walletElements.actionModal.classList.add("flex");
    walletElements.actionModal.setAttribute("aria-hidden", "false");

    if (target === "deposit") {
        const cur = String(selectedAsset || WALLET_STATE.activeDepositCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
        WALLET_STATE.activeDepositCurrency = cur;
        updateDepositModalUIByCurrency(cur);
        loadCryptoDepositAddresses();
    }
    if (target === "withdraw") {
        const cur = String(selectedAsset || WALLET_STATE.activeWithdrawalCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
        WALLET_STATE.activeWithdrawalCurrency = cur;
        updateWithdrawalModalUIByCurrency(cur, true);
        estimateWithdrawalFee(false);
    }
    if (target === "exchange") {
        if (selectedAsset) {
            const fromSelect = document.getElementById("walletExchangeFromAsset");
            if (fromSelect) {
                fromSelect.value = selectedAsset;
            }
            // Auto select a different asset for To Select if they match
            const toSelect = document.getElementById("walletExchangeToAsset");
            if (toSelect && toSelect.value === selectedAsset) {
                toSelect.value = selectedAsset === "USDT" ? "ETH" : "USDT";
            }
        }
        updateExchangePreview();
        updateWalletActionModalBalances();

        if (WALLET_STATE.exchangeIntervalId) {
            clearInterval(WALLET_STATE.exchangeIntervalId);
        }
        WALLET_STATE.exchangeIntervalId = setInterval(() => {
            if (WALLET_STATE.activeAction === "exchange") {
                updateExchangePreview(true);
            } else {
                if (WALLET_STATE.exchangeIntervalId) {
                    clearInterval(WALLET_STATE.exchangeIntervalId);
                    WALLET_STATE.exchangeIntervalId = null;
                }
            }
        }, 5000);
    }
    if (target === "internal_transfer") {
        const asset = selectedAsset || "USDT";
        const assetSelect = document.getElementById("walletInternalTransferAsset");
        if (assetSelect) {
            assetSelect.value = asset;
        }

        // Set dynamic header title, subtitle, and icon circle
        if (walletElements.actionModalTitle) {
            walletElements.actionModalTitle.textContent = `Internal Transfer — ${asset}`;
        }
        if (walletElements.actionModalSubtitle) {
            walletElements.actionModalSubtitle.textContent = `User to User (${asset}) • 0% Fee`;
        }
        const headerIcon = document.getElementById("txModalHeaderIcon");
        if (headerIcon) {
            headerIcon.textContent = asset.charAt(0);
            headerIcon.classList.remove("hidden");
            headerIcon.classList.add("flex");
        }

        updateInternalTransferBalance();
        updateWalletActionModalBalances();
    }
}

function closeWalletActionModal() {
    if (!walletElements.actionModal) return;
    walletElements.actionModal.classList.add("hidden");
    walletElements.actionModal.classList.remove("flex");
    walletElements.actionModal.setAttribute("aria-hidden", "true");
    WALLET_STATE.activeAction = "";
    clearWalletActionMessage();

    if (WALLET_STATE.exchangeIntervalId) {
        clearInterval(WALLET_STATE.exchangeIntervalId);
        WALLET_STATE.exchangeIntervalId = null;
    }
}

function walletSetButtonLoading(button, loading, text = "Processing...") {
    if (!button) return;
    if (loading) {
        button.dataset.originalText = button.textContent || "Submit";
        button.textContent = text;
        button.setAttribute("disabled", "disabled");
        button.classList.add("opacity-60", "cursor-not-allowed");
        return;
    }
    button.textContent = button.dataset.originalText || button.textContent || "Submit";
    button.removeAttribute("disabled");
    button.classList.remove("opacity-60", "cursor-not-allowed");
}

function getHistoryState(type) {
    return WALLET_STATE.history[type] || { search: "", status: "all", page: 1, pageSize: 5 };
}

function historyText(value) {
    return String(value ?? "").toLowerCase();
}

function rowContainsSearch(row, search, fields) {
    const clean = historyText(search).trim();
    if (!clean) return true;
    return fields.some((field) => historyText(row?.[field]).includes(clean));
}


function extractReferenceFromText(text, prefix) {
    const safePrefix = String(prefix || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${safePrefix}-[A-Z0-9]+`, "i");
    const match = String(text || "").match(pattern);
    return match ? match[0].toUpperCase() : "";
}

function getExplorerLink(url, label = "Explorer") {
    const cleanUrl = String(url || "").trim();
    const cleanLabel = walletEscape(label || "Explorer");

    if (!cleanUrl) {
        return "--";
    }

    const isSafeExplorerUrl = /^https?:\/\//i.test(cleanUrl);
    if (!isSafeExplorerUrl) {
        return walletEscape(cleanUrl);
    }

    return `<a href="${walletEscape(cleanUrl)}" target="_blank" rel="noopener noreferrer" class="font-black text-cyan-300 hover:text-cyan-200">${cleanLabel}</a>`;
}

function recordKeyParts(item = {}, kind = "") {
    const keys = [];
    const push = (value) => {
        const clean = String(value || "").trim().toLowerCase();
        if (clean && !keys.includes(clean)) keys.push(clean);
    };

    push(item.id);
    push(item.reference_id);

    if (kind === "deposits") {
        push(item.deposit_reference);
        push(item.tx_hash);
        push(item.gateway_payment_id);
    }

    if (kind === "withdrawals") {
        push(item.withdrawal_reference);
        push(item.tx_hash);
        push(item.payout_reference);
    }

    return keys;
}

function mergeHistoryRows(primaryRows = [], fallbackRows = [], kind = "") {
    const merged = [];
    const seen = new Set();

    const addRow = (row) => {
        if (!row) return;
        const keys = recordKeyParts(row, kind);
        if (keys.some((key) => seen.has(key))) return;

        keys.forEach((key) => seen.add(key));
        merged.push(row);
    };

    (Array.isArray(primaryRows) ? primaryRows : []).forEach(addRow);
    (Array.isArray(fallbackRows) ? fallbackRows : []).forEach(addRow);

    return merged.sort((a, b) => {
        const dateA = new Date(a?.created_at || 0).getTime();
        const dateB = new Date(b?.created_at || 0).getTime();
        return dateB - dateA;
    });
}

function ledgerLooksLikeDeposit(item = {}) {
    const type = historyText(item.transaction_type || item.type);
    const description = historyText(item.description);
    return type.includes("deposit") || description.includes("deposit credited") || description.includes("deposit");
}

function ledgerLooksLikeWithdrawal(item = {}) {
    const type = historyText(item.transaction_type || item.type);
    const description = historyText(item.description);
    return type.includes("withdrawal") || description.includes("withdrawal");
}

function buildDepositFallbacksFromLedger() {
    return (WALLET_STATE.ledger || [])
        .filter((item) => ledgerLooksLikeDeposit(item))
        .map((item) => {
            const description = String(item.description || "").trim();
            const depositReference = extractReferenceFromText(description, "TXD") || item.reference_id || "Ledger Deposit";
            return {
                id: item.reference_id || item.id || depositReference,
                reference_id: item.reference_id || item.id || "",
                deposit_reference: depositReference,
                amount: walletNumber(item.amount, 0),
                currency: getWalletCurrency(),
                crypto_asset: "USDT",
                crypto_network: item.crypto_network || item.network || "--",
                deposit_address: item.deposit_address || "",
                tx_hash: item.tx_hash || "",
                explorer_url: item.explorer_url || "",
                status: String(item.status || "completed").toLowerCase() === "failed" ? "failed" : "completed",
                verification_status: "verified",
                verification_message: description || "Deposit credited in wallet ledger.",
                remark: description || "Deposit credited in wallet ledger.",
                confirmations: item.confirmations || 0,
                required_confirmations: item.required_confirmations || 0,
                created_at: item.created_at,
                updated_at: item.updated_at || item.created_at,
                __fromLedger: true
            };
        });
}

function getWithdrawalStatusFromLedgerGroup(rows = []) {
    const typeText = rows.map((item) => historyText(item.transaction_type || item.type)).join(" ");
    const descriptionText = rows.map((item) => historyText(item.description)).join(" ");
    const joined = `${typeText} ${descriptionText}`;

    if (joined.includes("reject") || joined.includes("release")) return "rejected";
    if (joined.includes("cancel")) return "cancelled";
    if (joined.includes("completed") || joined.includes("finalized") || joined.includes("approved")) return "approved";
    return "pending_admin_approval";
}

function buildWithdrawalFallbacksFromLedger() {
    const groups = new Map();

    (WALLET_STATE.ledger || [])
        .filter((item) => ledgerLooksLikeWithdrawal(item))
        .forEach((item) => {
            const description = String(item.description || "").trim();
            const withdrawalReference = extractReferenceFromText(description, "TXW") || item.reference_id || "Ledger Withdrawal";
            const key = String(item.reference_id || withdrawalReference || item.id || "").trim();
            if (!key) return;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        });

    return Array.from(groups.entries()).map(([key, rows]) => {
        const ordered = rows.slice().sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());
        const requestRow = ordered.find((item) => historyText(item.transaction_type || item.type).includes("request")) || ordered[ordered.length - 1] || ordered[0];
        const latestRow = ordered[0] || requestRow;
        const description = String(latestRow?.description || requestRow?.description || "").trim();
        const withdrawalReference = extractReferenceFromText(description, "TXW")
            || extractReferenceFromText(String(requestRow?.description || ""), "TXW")
            || key;
        const status = getWithdrawalStatusFromLedgerGroup(rows);
        const lockedAmount = walletNumber(requestRow?.amount ?? latestRow?.amount, 0);

        return {
            id: key,
            reference_id: key,
            withdrawal_reference: withdrawalReference,
            amount: lockedAmount,
            currency: getWalletCurrency(),
            crypto_asset: "USDT",
            crypto_network: requestRow?.crypto_network || latestRow?.crypto_network || "--",
            withdrawal_address: requestRow?.withdrawal_address || latestRow?.withdrawal_address || "--",
            destination_tag: "",
            network_fee: 0,
            withdrawal_fee: 0,
            total_fee: 0,
            final_amount: lockedAmount,
            locked_amount: lockedAmount,
            status,
            processing_mode: "admin_approval",
            remark: description || "Withdrawal recorded in wallet ledger.",
            tx_hash: latestRow?.tx_hash || "",
            explorer_url: latestRow?.explorer_url || "",
            decision_at: status === "pending_admin_approval" ? "" : latestRow?.created_at,
            created_at: requestRow?.created_at || latestRow?.created_at,
            updated_at: latestRow?.updated_at || latestRow?.created_at,
            __fromLedger: true
        };
    });
}

function syncHistoryFromLedgerFallbacks() {
    WALLET_STATE.deposits = mergeHistoryRows(
        WALLET_STATE.deposits || [],
        buildDepositFallbacksFromLedger(),
        "deposits"
    );

    WALLET_STATE.withdrawals = mergeHistoryRows(
        WALLET_STATE.withdrawals || [],
        buildWithdrawalFallbacksFromLedger(),
        "withdrawals"
    );
}

function paginateRows(rows, type) {
    const state = getHistoryState(type);
    const pageSize = Math.max(1, Number(state.pageSize || 5));
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(Math.max(1, Number(state.page || 1)), totalPages);
    state.page = page;
    const start = (page - 1) * pageSize;
    return { rows: rows.slice(start, start + pageSize), totalRows: rows.length, page, totalPages, pageSize };
}

function renderHistoryPagination(type, meta) {
    const paginationElementMap = {
        ledger: walletElements.ledgerPagination,
        deposits: walletElements.depositPagination,
        withdrawals: walletElements.withdrawalPagination
    };
    const container = paginationElementMap[type];
    if (!container) return;

    if (!meta || meta.totalRows <= meta.pageSize) {
        container.innerHTML = meta?.totalRows ? `<span>${meta.totalRows} result${meta.totalRows === 1 ? "" : "s"}</span>` : "";
        return;
    }

    const buttons = [];
    buttons.push(`<button type="button" data-history-page="${type}" data-page="${meta.page - 1}" ${meta.page <= 1 ? "disabled" : ""}>Prev</button>`);
    for (let number = 1; number <= meta.totalPages; number += 1) {
        if (number === 1 || number === meta.totalPages || Math.abs(number - meta.page) <= 1) {
            buttons.push(`<button type="button" data-history-page="${type}" data-page="${number}" class="${number === meta.page ? "active" : ""}">${number}</button>`);
        } else if (buttons[buttons.length - 1] !== "<span>...</span>") {
            buttons.push("<span>...</span>");
        }
    }
    buttons.push(`<button type="button" data-history-page="${type}" data-page="${meta.page + 1}" ${meta.page >= meta.totalPages ? "disabled" : ""}>Next</button>`);
    buttons.push(`<span>${meta.totalRows} results</span>`);
    container.innerHTML = buttons.join("");
}

function resetHistoryPage(type) {
    const state = getHistoryState(type);
    state.page = 1;
}

function bindHistoryFilters() {
    const config = [
        ["ledger", walletElements.ledgerSearchInput, walletElements.ledgerTypeFilter, walletElements.ledgerPageSize, renderLedgerTable],
        ["deposits", walletElements.depositSearchInput, walletElements.depositStatusFilter, walletElements.depositPageSize, renderDepositTable],
        ["withdrawals", walletElements.withdrawalSearchInput, walletElements.withdrawalStatusFilter, walletElements.withdrawalPageSize, renderWithdrawalTable]
    ];

    if (walletElements.ledgerCurrencyFilter && walletElements.ledgerCurrencyFilter.dataset.bound !== "1") {
        walletElements.ledgerCurrencyFilter.dataset.bound = "1";
        walletElements.ledgerCurrencyFilter.addEventListener("change", () => {
            getHistoryState("ledger").currency = walletElements.ledgerCurrencyFilter.value || "all";
            resetHistoryPage("ledger");
            renderLedgerTable();
        });
    }

    if (walletElements.depositCurrencyFilter && walletElements.depositCurrencyFilter.dataset.bound !== "1") {
        walletElements.depositCurrencyFilter.dataset.bound = "1";
        walletElements.depositCurrencyFilter.addEventListener("change", () => {
            getHistoryState("deposits").currency = walletElements.depositCurrencyFilter.value || "all";
            resetHistoryPage("deposits");
            renderDepositTable();
        });
    }

    if (walletElements.withdrawalCurrencyFilter && walletElements.withdrawalCurrencyFilter.dataset.bound !== "1") {
        walletElements.withdrawalCurrencyFilter.dataset.bound = "1";
        walletElements.withdrawalCurrencyFilter.addEventListener("change", () => {
            getHistoryState("withdrawals").currency = walletElements.withdrawalCurrencyFilter.value || "all";
            resetHistoryPage("withdrawals");
            renderWithdrawalTable();
        });
    }

    config.forEach(([type, searchInput, statusSelect, pageSizeSelect, render]) => {
        const state = getHistoryState(type);
        if (searchInput && searchInput.dataset.bound !== "1") {
            searchInput.dataset.bound = "1";
            searchInput.addEventListener("input", () => {
                state.search = searchInput.value || "";
                resetHistoryPage(type);
                render();
            });
        }
        if (statusSelect && statusSelect.dataset.bound !== "1") {
            statusSelect.dataset.bound = "1";
            statusSelect.addEventListener("change", () => {
                state.status = statusSelect.value || "all";
                resetHistoryPage(type);
                render();
            });
        }
        if (pageSizeSelect && pageSizeSelect.dataset.bound !== "1") {
            pageSizeSelect.dataset.bound = "1";
            pageSizeSelect.addEventListener("change", () => {
                state.pageSize = Number(pageSizeSelect.value || 5);
                resetHistoryPage(type);
                render();
            });
        }
    });

    document.querySelectorAll("[data-history-page]").forEach((button) => {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";
        button.addEventListener("click", () => {
            const type = button.getAttribute("data-history-page");
            const page = Number(button.getAttribute("data-page") || 1);
            if (!type || button.disabled) return;
            getHistoryState(type).page = page;
            if (type === "ledger") renderLedgerTable();
            if (type === "deposits") renderDepositTable();
            if (type === "withdrawals") renderWithdrawalTable();
        });
    });
}

function setWalletStatus(status, type = "loading") {
    if (!walletElements.statusText) {
        return;
    }

    walletElements.statusText.textContent = status;
    walletElements.statusText.className = type === "live"
        ? "mt-2 text-3xl font-black text-emerald-400"
        : type === "error"
            ? "mt-2 text-3xl font-black text-red-400"
            : "mt-2 text-3xl font-black text-orange-300";
}

function isWithdrawalKycRequired(error) {
    const errors = error?.errors || {};
    const message = `${error?.message || ""} ${Object.values(errors).join(" ")}`.toLowerCase();
    return Boolean(
        errors.kyc_required ||
        errors.kyc ||
        message.includes("kyc") ||
        message.includes("identity verification")
    );
}

function checkKycRedirect(error, fallback_message, action = "withdrawal") {
    if (isWithdrawalKycRequired(error)) {
        showWalletActionMessage(`KYC verification is required by admin. <a href="./kyc.html" class="underline font-black text-cyan-300">Click here to complete KYC</a>`, "error");
        return true;
    }
    showWalletActionMessage(getErrorMessage(error, fallback_message), "error");
    return false;
}

function getErrorMessage(error, fallback = "Something went wrong.") {
    if (error?.errors) {
        const firstKey = Object.keys(error.errors)[0];
        const firstValue = firstKey ? error.errors[firstKey] : null;

        if (Array.isArray(firstValue)) {
            return firstValue[0] || fallback;
        }

        if (typeof firstValue === "string") {
            return firstValue;
        }
    }

    if (typeof showApiError === "function") {
        return showApiError(error, fallback);
    }

    return error?.message || fallback;
}

async function getOptionalApi(endpoint, fallbackData = {}) {
    try {
        return await apiRequest(endpoint);
    } catch (error) {
        console.warn(`Optional wallet API failed: ${endpoint}`, error);
        return {
            success: false,
            data: fallbackData,
            message: getErrorMessage(error)
        };
    }
}

function normalizeWalletAccountStatus(value) {
    return String(value || "active").trim().toLowerCase();
}

function isWalletRestrictedMode() {
    const status = normalizeWalletAccountStatus(WALLET_STATE.accountStatus?.account_status);
    return WALLET_STATE.accountStatus?.is_active === false || [
        "blocked",
        "suspended",
        "disabled",
        "deactivated",
        "banned"
    ].includes(status);
}

async function loadWalletAccountStatus() {
    const response = await getOptionalApi("/user/account-status", {
        account_status: "active",
        is_active: true
    });

    WALLET_STATE.accountStatus = response.data || {
        account_status: "active",
        is_active: true
    };

    return WALLET_STATE.accountStatus;
}

function applyRestrictedWalletVisibility() {
    const restricted = isWalletRestrictedMode();

    walletElements.restrictedNotice?.classList.toggle("hidden", !restricted);
    walletElements.balanceCards?.classList.toggle("hidden", restricted);
    walletElements.statsGrid?.classList.toggle("hidden", restricted);
    walletElements.depositPanel?.classList.toggle("hidden", restricted);
    walletElements.transferPanel?.classList.toggle("hidden", restricted);
    walletElements.actionPanel?.classList.toggle("hidden", false);
    walletElements.openTransferBtn?.classList.toggle("hidden", restricted);
    walletElements.openDepositBtn?.classList.toggle("hidden", restricted);
    walletElements.openWithdrawBtn?.classList.toggle("hidden", false);
    walletElements.ledgerPanel?.classList.toggle("hidden", restricted);
    walletElements.depositHistoryPanel?.classList.toggle("hidden", restricted);

    if (restricted) {
        walletElements.demoCreditPanel?.classList.add("hidden");

        if (walletElements.availableBalance) walletElements.availableBalance.textContent = "Hidden";
        if (walletElements.lockedBalance) walletElements.lockedBalance.textContent = "Hidden";
        if (walletElements.totalBalance) walletElements.totalBalance.textContent = "Hidden";
        if (walletElements.openMargin) walletElements.openMargin.textContent = "Hidden";
        if (walletElements.unrealizedPnl) {
            walletElements.unrealizedPnl.textContent = "Hidden";
            walletElements.unrealizedPnl.className = "mt-3 text-3xl font-black text-slate-400";
        }
        if (walletElements.ledgerCount) walletElements.ledgerCount.textContent = "Hidden";
    }
}

async function loadRestrictedWithdrawalOnly() {
    WALLET_STATE.wallet = null;
    WALLET_STATE.ledger = [];
    WALLET_STATE.deposits = [];
    WALLET_STATE.pnlSummary = null;
    WALLET_STATE.positionSummary = null;

    try {
        const [withdrawalResponse, boardRes] = await Promise.all([
            apiRequest("/withdrawal/history"),
            apiRequest("/market/board").catch(() => ({ success: false, data: { board: [] } }))
        ]);
        WALLET_STATE.withdrawals = withdrawalResponse.data?.withdrawals || [];
        WALLET_STATE.board = boardRes.data?.board || [];
    } catch (err) {
        console.error("Failed to load restricted withdrawal details:", err);
    }
    
    notifyWithdrawalStatusChanges(WALLET_STATE.withdrawals);

    renderWalletPage();
    setWalletStatus("Restricted", "error");
    showWalletAlert(
        "Account is restricted, so total wallet amount is hidden. Withdrawal request and withdrawal history are still available.",
        "info"
    );
}

async function refreshWithdrawalHistoryOnly() {
    if (document.hidden || typeof apiRequest !== "function" || typeof isLoggedIn !== "function" || !isLoggedIn()) {
        return;
    }

    try {
        await loadWalletAccountStatus();

        if (!isWalletRestrictedMode()) {
            return;
        }

        const [response, boardRes] = await Promise.all([
            apiRequest("/withdrawal/history"),
            apiRequest("/market/board").catch(() => ({ success: false, data: { board: [] } }))
        ]);
        WALLET_STATE.withdrawals = response.data?.withdrawals || [];
        WALLET_STATE.board = boardRes.data?.board || [];
        notifyWithdrawalStatusChanges(WALLET_STATE.withdrawals);
        applyRestrictedWalletVisibility();
        renderWithdrawalTable();
        setWalletStatus("Restricted", "error");
    } catch (error) {
        console.warn("Restricted withdrawal history sync failed:", error);
    }
}

async function loadWalletEnvironment() {
    const healthResponse = await getOptionalApi("/health", {});
    const healthData = healthResponse.data || {};
    WALLET_STATE.environment = healthData.environment || "unknown";

    const isDevelopment = WALLET_STATE.environment === "development";

    if (walletElements.environmentText) {
        walletElements.environmentText.textContent = isDevelopment
            ? "Development mode: use Transfer / Deposit / Withdraw popups. Deposit uses company-address confirmation; withdrawal still needs admin approval."
            : "Production mode: use Transfer / Deposit / Withdraw popups. Deposits wait for company-wallet/blockchain verification and withdrawals need admin approval.";
    }

    walletElements.demoCreditPanel?.classList.toggle("hidden", !isDevelopment || isWalletRestrictedMode());
}

async function loadCryptoDepositAddresses() {
    const response = await getOptionalApi("/deposit/crypto-addresses", {
        networks: [],
        min_amount: 10,
        max_amount: 1000000
    });

    WALLET_STATE.cryptoDeposit.networks = response.data?.networks || [];
    WALLET_STATE.cryptoDeposit.btcContractAddress = response.data?.btc_contract_address || "";
    WALLET_STATE.cryptoDeposit.minAmount = Number(response.data?.min_amount || 10);
    WALLET_STATE.cryptoDeposit.maxAmount = Number(response.data?.max_amount || 1000000);
    if (walletElements.depositAmount) {
        const activeCurrency = (WALLET_STATE.activeDepositCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
        if (activeCurrency === "INR") {
            walletElements.depositAmount.min = "10";
            walletElements.depositAmount.placeholder = "Minimum ₹10";
        } else {
            walletElements.depositAmount.min = String(WALLET_STATE.cryptoDeposit.minAmount || 10);
            walletElements.depositAmount.placeholder = `Minimum ${WALLET_STATE.cryptoDeposit.minAmount || 10} ${activeCurrency}`;
        }
        walletElements.depositAmount.max = String(WALLET_STATE.cryptoDeposit.maxAmount || 1000000);
    }
    updateCryptoDepositAddressUI();
}

function getSelectedCryptoNetwork() {
    const activeCurrency = String(WALLET_STATE.activeDepositCurrency || "USDT").toUpperCase();
    if (["USDT", "BTC", "SOL", "XRP", "ADA", "BNB"].includes(activeCurrency)) {
        return String(walletElements.cryptoNetwork?.value || WALLET_STATE.cryptoDeposit.selectedNetwork || (activeCurrency === "BTC" ? "BITCOIN" : "TRC20")).toUpperCase();
    }
    const nativeNetworks = {
        "ETH": "ERC20",
        "USDC": "ERC20"
    };
    return nativeNetworks[activeCurrency] || "ERC20";
}

function getSelectedWithdrawalCryptoNetwork() {
    const isModal = isWalletActionModalOpen();
    const activeCurrency = String(WALLET_STATE.activeWithdrawalCurrency || (isModal ? WALLET_STATE.activeWithdrawalCurrency : localStorage.getItem("tx_navbar_currency")) || "USDT").toUpperCase();
    if (["USDT", "BTC", "SOL", "XRP", "ADA", "BNB"].includes(activeCurrency)) {
        const prefix = isModal ? "modal" : "main";
        return String(document.getElementById(`${prefix}WithdrawNetwork`)?.value || (activeCurrency === "BTC" ? "BITCOIN" : "TRC20")).toUpperCase();
    }
    const nativeNetworks = {
        "ETH": "ERC20",
        "USDC": "ERC20"
    };
    return nativeNetworks[activeCurrency] || "ERC20";
}

function getSelectedCryptoAddressInfo() {
    const selectedNetwork = getSelectedCryptoNetwork();
    const activeCurrency = String(WALLET_STATE.activeDepositCurrency || "USDT").toUpperCase();

    // 1. Find exact match for selected network and selected currency (from database)
    const found = (WALLET_STATE.cryptoDeposit.networks || []).find((item) => {
        return String(item.network || "").toUpperCase() === selectedNetwork && String(item.asset || "").toUpperCase() === activeCurrency;
    });
    if (found) return found;

    // 2. Find coin-specific override address from the loaded map if they select the coin's native network
    const nativeNetworks = {
        "BTC": "BITCOIN",
        "SOL": "SOLANA",
        "XRP": "RIPPLE",
        "ADA": "CARDANO",
        "ETH": "ERC20",
        "USDC": "ERC20",
        "BNB": "BEP20"
    };
    if (selectedNetwork === nativeNetworks[activeCurrency]) {
        const coinOverride = (WALLET_STATE.cryptoDeposit.networks || []).find((item) => {
            return String(item.network || "").toUpperCase() === activeCurrency;
        });
        if (coinOverride && coinOverride.address) return coinOverride;
    }

    // 3. Find generic match for the network (TRC20 / ERC20 / BEP20 etc.)
    const generic = (WALLET_STATE.cryptoDeposit.networks || []).find((item) => {
        return String(item.network || "").toUpperCase() === selectedNetwork;
    });
    if (generic) return generic;

    // 4. Mock fallback addresses
    const mockAddresses = {
        "TRC20": { address: "TQp9K7vY3Wm2N8rF4cL6Xh5A1BzDgE2sRZ", is_configured: true, label: "TRC20 (Tron)" },
        "ERC20": { address: "0x8A4b2C5D7e9F0a1B3c4D6E8F901234567890AbCd", is_configured: true, label: "ERC20 (Ethereum)" },
        "BEP20": { address: "0xB2C7e9F1A4d6E8b0C3f5A7D9e1B234567890cDEF", is_configured: true, label: "BEP20 (Binance Smart Chain)" },
        "BITCOIN": { address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", is_configured: true, label: "BTC Mainnet" },
        "SOLANA": { address: "HN7cAB2133LQV7t3W3x2fGfY1c5f3c5f3c5f3c5f3c5f", is_configured: true, label: "Solana Mainnet" },
        "RIPPLE": { address: "rEb8QCgNs9rkec2QCQKsE2wo9T3p45WstX", is_configured: true, label: "Ripple Mainnet" },
        "CARDANO": { address: "Ae2tdPwUPEYx5g5P7w5UaXfGfM4vXfP5p3d", is_configured: true, label: "Cardano Mainnet" }
    };
    return mockAddresses[selectedNetwork] || mockAddresses[activeCurrency] || null;
}

function updateCryptoDepositAddressUI() {
    const activeCurrency = String(WALLET_STATE.activeDepositCurrency || "USDT").toUpperCase();

    const cryptoNetworkContainer = document.getElementById("cryptoNetworkContainer");
    const cryptoNetworkSelect = document.getElementById("cryptoNetwork");
    const isUSDTOrBTC = ["USDT", "BTC", "BNB", "SOL", "XRP", "ADA"].includes(activeCurrency);

    if (cryptoNetworkContainer) {
        cryptoNetworkContainer.classList.toggle("hidden", !isUSDTOrBTC);
    }

    if (cryptoNetworkSelect) {
        const currentVal = cryptoNetworkSelect.value;
        cryptoNetworkSelect.innerHTML = "";
        
        if (activeCurrency === "USDT") {
            cryptoNetworkSelect.innerHTML = `
                <option value="TRC20">USDT TRC20 (Tron)</option>
                <option value="BEP20">USDT BEP20 (Binance Smart Chain)</option>
                <option value="ERC20">USDT ERC20 (Ethereum)</option>
            `;
            if (["TRC20", "ERC20", "BEP20"].includes(currentVal)) {
                cryptoNetworkSelect.value = currentVal;
            } else if (["TRC20", "ERC20", "BEP20"].includes(WALLET_STATE.cryptoDeposit.selectedNetwork)) {
                cryptoNetworkSelect.value = WALLET_STATE.cryptoDeposit.selectedNetwork;
            } else {
                cryptoNetworkSelect.value = "TRC20";
            }
        } else if (activeCurrency === "BTC") {
            cryptoNetworkSelect.innerHTML = `
                <option value="BITCOIN">BTC Mainnet (Bitcoin)</option>
                <option value="ERC20">BTC ERC20 / Sepolia Token (MetaMask)</option>
            `;
            if (["BITCOIN", "ERC20"].includes(currentVal)) {
                cryptoNetworkSelect.value = currentVal;
            } else if (["BITCOIN", "ERC20"].includes(WALLET_STATE.cryptoDeposit.selectedNetwork)) {
                cryptoNetworkSelect.value = WALLET_STATE.cryptoDeposit.selectedNetwork;
            } else {
                cryptoNetworkSelect.value = "BITCOIN";
            }
        } else if (["SOL", "XRP", "ADA", "BNB"].includes(activeCurrency)) {
            const labelMap = {
                "SOL": { native: "SOLANA", nativeLabel: "SOL Mainnet (Solana)", erc20Label: "SOL ERC20 / Sepolia Token (MetaMask)" },
                "XRP": { native: "RIPPLE", nativeLabel: "XRP Mainnet (Ripple)", erc20Label: "XRP ERC20 / Sepolia Token (MetaMask)" },
                "ADA": { native: "CARDANO", nativeLabel: "ADA Mainnet (Cardano)", erc20Label: "ADA ERC20 / Sepolia Token (MetaMask)" },
                "BNB": { native: "BEP20", nativeLabel: "BNB Mainnet (Binance Smart Chain)", erc20Label: "BNB ERC20 / Sepolia Token (MetaMask)" }
            };
            const coinConfig = labelMap[activeCurrency];
            cryptoNetworkSelect.innerHTML = `
                <option value="${coinConfig.native}">${coinConfig.nativeLabel}</option>
                <option value="ERC20">${coinConfig.erc20Label}</option>
            `;
            if ([coinConfig.native, "ERC20"].includes(currentVal)) {
                cryptoNetworkSelect.value = currentVal;
            } else if ([coinConfig.native, "ERC20"].includes(WALLET_STATE.cryptoDeposit.selectedNetwork)) {
                cryptoNetworkSelect.value = WALLET_STATE.cryptoDeposit.selectedNetwork;
            } else {
                cryptoNetworkSelect.value = coinConfig.native;
            }
        } else {
            const nativeNetworks = {
                "ETH": { value: "ERC20", label: "Ethereum Mainnet (MetaMask)" },
                "USDC": { value: "ERC20", label: "ERC20 / Sepolia Token (MetaMask)" }
            };
            const config = nativeNetworks[activeCurrency] || { value: "ERC20", label: "ERC20 network" };
            cryptoNetworkSelect.innerHTML = `<option value="${config.value}">${activeCurrency} ${config.label}</option>`;
            cryptoNetworkSelect.value = config.value;
        }
    }

    const selectedNetwork = getSelectedCryptoNetwork();
    const addressInfo = getSelectedCryptoAddressInfo();
    const address = String(addressInfo?.address || "").trim();
    const isConfigured = Boolean(addressInfo?.is_configured && address);

    const boxLabel = document.getElementById("cryptoAddressBoxLabel");
    if (boxLabel) {
        boxLabel.textContent = `${activeCurrency} ${selectedNetwork}`;
    }

    if (walletElements.cryptoDepositAddress) {
        walletElements.cryptoDepositAddress.textContent = address || `${activeCurrency} ${selectedNetwork} company address is not configured.`;
        walletElements.cryptoDepositAddress.className = isConfigured
            ? "mt-2 block break-all font-mono text-sm font-bold text-white"
            : "mt-2 block break-all font-mono text-sm font-bold text-orange-200";
    }

    if (walletElements.cryptoAddressStatus) {
        walletElements.cryptoAddressStatus.textContent = isConfigured
            ? `${addressInfo.label || selectedNetwork} company address loaded.`
            : `Configure ${activeCurrency} ${selectedNetwork} company address.`;

        walletElements.cryptoAddressStatus.className = isConfigured
            ? "mt-1 text-xs font-semibold text-emerald-400"
            : "mt-1 text-xs font-semibold text-orange-300";
    }

    if (walletElements.depositAddressConfirmation) {
        walletElements.depositAddressConfirmation.value = address;
    }

    if (walletElements.copyCryptoAddressBtn) {
        walletElements.copyCryptoAddressBtn.disabled = !isConfigured;
        walletElements.copyCryptoAddressBtn.classList.toggle("opacity-50", !isConfigured);
        walletElements.copyCryptoAddressBtn.classList.toggle("cursor-not-allowed", !isConfigured);
    }

    if (walletElements.payWithMetaMaskBtn) {
        const showMetaMask = isConfigured && ["ERC20", "BEP20"].includes(selectedNetwork);
        walletElements.payWithMetaMaskBtn.classList.toggle("hidden", !showMetaMask);
    }

    const qrImg = document.getElementById("cryptoDepositQrImg");
    const qrPlaceholder = document.getElementById("cryptoDepositQrPlaceholder");
    const qrContainer = document.getElementById("cryptoDepositQrContainer");

    if (qrContainer) {
        if (isConfigured && address) {
            qrContainer.classList.remove("hidden");
            if (qrImg) {
                qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(address)}`;
                qrImg.classList.remove("hidden");
            }
            if (qrPlaceholder) {
                qrPlaceholder.classList.add("hidden");
            }
        } else {
            if (qrImg) {
                qrImg.src = "";
                qrImg.classList.add("hidden");
            }
            if (qrPlaceholder) {
                qrPlaceholder.textContent = "Address not configured";
                qrPlaceholder.classList.remove("hidden");
            }
        }
    }
}

async function copyCryptoDepositAddress() {
    const addressInfo = getSelectedCryptoAddressInfo();
    const address = String(addressInfo?.address || "").trim();

    if (!address || !addressInfo?.is_configured) {
        showWalletActionMessage("Company deposit address is not configured for this network.", "error");
        return;
    }

    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(address);
        } else {
            const temp = document.createElement("textarea");
            temp.value = address;
            temp.setAttribute("readonly", "readonly");
            temp.style.position = "fixed";
            temp.style.left = "-9999px";
            document.body.appendChild(temp);
            temp.select();
            document.execCommand("copy");
            document.body.removeChild(temp);
        }
        showWalletActionMessage("Company deposit address copied. Paste the same address in confirmation field.", "success");
    } catch (error) {
        showWalletActionMessage("Unable to copy address. Please copy it manually.", "error");
    }
}

async function loadWalletData(options = {}) {
    const silent = Boolean(options?.silent);
    const requestSeq = ++WALLET_STATE.walletLoadRequestSeq;

    if (WALLET_STATE.loading) {
        return;
    }

    if (typeof apiRequest !== "function" || typeof isLoggedIn !== "function") {
        setWalletStatus("API Error", "error");
        showWalletAlert("api-config.js is not loaded before wallet.js.", "error");
        return;
    }

    if (!isLoggedIn()) {
        setWalletStatus("Locked", "error");
        walletElements.loginRequired?.classList.remove("hidden");
        walletElements.restrictedNotice?.classList.add("hidden");
        return;
    }

    walletElements.loginRequired?.classList.add("hidden");

    try {
        WALLET_STATE.loading = true;

        if (!silent) {
            setWalletStatus("Loading", "loading");
            clearWalletAlert();
        }

        // Parallelize initial API queries to avoid serial network roundtrip overhead
        const accountStatusPromise = WALLET_STATE.accountStatus ? Promise.resolve() : loadWalletAccountStatus();
        const environmentPromise = WALLET_STATE.environment ? Promise.resolve() : loadWalletEnvironment();

        const [_, __, balanceRes, boardRes] = await Promise.all([
            accountStatusPromise,
            environmentPromise,
            apiRequest("/wallet/balance").catch(err => {
                console.error("Failed to load wallet balance:", err);
                return null;
            }),
            apiRequest("/market/board").catch(err => {
                console.error("Failed to load market board:", err);
                return { success: false, data: { board: [] } };
            })
        ]);

        if (isWalletRestrictedMode()) {
            if (silent) {
                await refreshWithdrawalHistoryOnly();
            } else {
                await loadRestrictedWithdrawalOnly();
            }
            return;
        }

        // Fetch crypto deposit addresses only on the first load
        let depositAddressesPromise = Promise.resolve();
        if (!WALLET_STATE.cryptoDeposit.networks || WALLET_STATE.cryptoDeposit.networks.length === 0) {
            depositAddressesPromise = loadCryptoDepositAddresses().catch(err => {
                console.error("Failed to load crypto deposit addresses:", err);
            });
        }

        if (balanceRes && requestSeq === WALLET_STATE.walletLoadRequestSeq) {
            WALLET_STATE.wallet = balanceRes.data.wallet || balanceRes.data || null;
            WALLET_STATE.board = boardRes.data?.board || [];
            renderWalletPage();
            setWalletStatus("Active", "live");
        }

        await depositAddressesPromise;

        // 2. Fetch other history and optional APIs in the background
        let ledgerUrl = "/wallet/ledger";
        if (WALLET_STATE.selectedSubAccountId) {
            ledgerUrl += `?sub_account_id=${WALLET_STATE.selectedSubAccountId}`;
        }

        // Throttle transaction history requests to every 30 seconds during background updates
        const nowTime = Date.now();
        const shouldFetchHistory = !silent || !WALLET_STATE.lastHistoryFetchAt || (nowTime - WALLET_STATE.lastHistoryFetchAt > 30000);

        const historyPromises = [
            shouldFetchHistory ? apiRequest(ledgerUrl) : Promise.resolve(null),
            shouldFetchHistory ? apiRequest("/deposit/history") : Promise.resolve(null),
            shouldFetchHistory ? apiRequest("/withdrawal/history") : Promise.resolve(null),
            getOptionalApi("/trading/pnl-summary", {}),
            getOptionalApi("/trading/positions", {}),
            getOptionalApi("/onboarding/mt5/status", {})
        ];

        Promise.allSettled(historyPromises).then((results) => {
            if (requestSeq !== WALLET_STATE.walletLoadRequestSeq) {
                return;
            }

            const [ledgerResult, depositResult, withdrawalResult, pnlResult, positionsResult, mt5Result] = results;

            if (shouldFetchHistory) {
                WALLET_STATE.lastHistoryFetchAt = nowTime;
                if (ledgerResult.status === "fulfilled" && ledgerResult.value) {
                    WALLET_STATE.ledger = ledgerResult.value.data.ledger || [];
                }
                if (depositResult.status === "fulfilled" && depositResult.value) {
                    WALLET_STATE.deposits = depositResult.value.data.deposits || [];
                }
                if (withdrawalResult.status === "fulfilled" && withdrawalResult.value) {
                    WALLET_STATE.withdrawals = withdrawalResult.value.data.withdrawals || [];
                    notifyWithdrawalStatusChanges(WALLET_STATE.withdrawals);
                }
                syncHistoryFromLedgerFallbacks();
            }

            if (pnlResult.status === "fulfilled") {
                WALLET_STATE.pnlSummary = pnlResult.value.data || null;
            }
            if (positionsResult.status === "fulfilled") {
                WALLET_STATE.positionSummary = positionsResult.value.data?.summary || null;
            }
            if (mt5Result.status === "fulfilled") {
                WALLET_STATE.mt5 = mt5Result.value.data || null;
            }

            // Re-render to populate history tables
            renderWalletPage();
        }).catch((err) => {
            console.error("Background data load failed:", err);
        });
    } catch (error) {
        console.error("Wallet load failed:", error);

        if (!silent) {
            setWalletStatus("Error", "error");
            showWalletAlert(getErrorMessage(error, "Unable to load wallet data."), "error");
        }
    } finally {
        if (requestSeq === WALLET_STATE.walletLoadRequestSeq) {
            WALLET_STATE.loading = false;
        }
    }
}

function renderWalletPage() {
    applyRestrictedWalletVisibility();

    if (isWalletRestrictedMode()) {
        renderWithdrawalTable();
        return;
    }

    const wallet = WALLET_STATE.wallet || {};
    const mainWallet = getMainWalletData();
    const tradingWallet = getTradingWalletData();
    const mainCurrency = mainWallet.currency || "USDT";
    const tradingCurrency = "USDT";
    const mainAvailable = walletNumber(mainWallet.available_balance, 0);
    const mainLocked = walletNumber(mainWallet.locked_balance, 0);
    const mainTotal = walletNumber(mainWallet.total_balance, mainAvailable + mainLocked);

    const user = typeof getAuthUser === "function" ? getAuthUser() : null;
    const isMt5 = user && user.selected_platform === "mt5";

    let tradingAvailable = walletNumber(tradingWallet.available_balance, 0);
    let totalMargin = walletNumber(WALLET_STATE.pnlSummary?.total_margin ?? WALLET_STATE.positionSummary?.total_margin, mainLocked);
    let unrealizedPnl = walletNumber(WALLET_STATE.pnlSummary?.total_unrealized_pnl ?? WALLET_STATE.positionSummary?.total_unrealized_pnl, 0);

    if (isMt5) {
        const mt5Account = WALLET_STATE.mt5?.account || {};
        const mt5Curr = mt5Account.account_currency || "USD";
        const mt5Bal = walletNumber(mt5Account.balance, 0);
        const mt5Eq = walletNumber(mt5Account.equity, mt5Bal);

        tradingAvailable = mt5Bal;
        totalMargin = mt5Eq;
        unrealizedPnl = Math.round((mt5Eq - mt5Bal) * 100000000) / 100000000;

        if (walletElements.badgeText) walletElements.badgeText.textContent = "Main wallet + MetaTrader 5";
        if (walletElements.mainTitle) walletElements.mainTitle.textContent = "Wallet flow built for MetaTrader 5 trading.";
        if (walletElements.mainSubtitle) walletElements.mainSubtitle.textContent = "Deposits credit Main Wallet through the company deposit address. MetaTrader 5 uses its own separate trading account. Withdrawals are processed from your Main Wallet.";

        if (walletElements.lockedBalanceLabel) walletElements.lockedBalanceLabel.textContent = "MT5 Account Balance";
        if (walletElements.lockedBalanceNote) walletElements.lockedBalanceNote.textContent = "MetaTrader 5 server balance";

        if (walletElements.openMarginLabel) walletElements.openMarginLabel.textContent = "MT5 Account Equity";
        if (walletElements.openMarginNote) walletElements.openMarginNote.textContent = "MetaTrader 5 server equity";

        if (walletElements.lockedBalance) walletElements.lockedBalance.textContent = formatWalletMoneyPrivate(tradingAvailable, mt5Curr);
        if (walletElements.openMargin) walletElements.openMargin.textContent = formatWalletMoneyPrivate(totalMargin, mt5Curr);

        if (walletElements.unrealizedPnl) {
            walletElements.unrealizedPnl.textContent = `${unrealizedPnl >= 0 ? "+" : ""}${formatWalletMoneyPrivate(unrealizedPnl, mt5Curr)}`;
            walletElements.unrealizedPnl.className = unrealizedPnl >= 0
                ? "mt-3 text-3xl font-black text-emerald-400"
                : "mt-3 text-3xl font-black text-red-400";
        }
    } else {
        if (walletElements.badgeText) walletElements.badgeText.textContent = "Main wallet + Trading wallet";
        if (walletElements.mainTitle) walletElements.mainTitle.textContent = "Wallet flow built for crypto trading.";
        if (walletElements.mainSubtitle) walletElements.mainSubtitle.textContent = "Deposits credit Main Wallet through the company deposit address. Trades use Trading Wallet only. Withdrawals use your external wallet address and complete after admin approval.";

        if (walletElements.lockedBalanceLabel) walletElements.lockedBalanceLabel.textContent = "Trading Wallet";
        if (walletElements.lockedBalanceNote) walletElements.lockedBalanceNote.textContent = "Trades use this balance";

        if (walletElements.openMarginLabel) walletElements.openMarginLabel.textContent = "Trading Locked Margin";
        if (walletElements.openMarginNote) walletElements.openMarginNote.textContent = "Open position margin";

        if (walletElements.lockedBalance) walletElements.lockedBalance.textContent = formatWalletMoneyPrivate(tradingAvailable, tradingCurrency);
        if (walletElements.openMargin) walletElements.openMargin.textContent = formatWalletMoneyPrivate(totalMargin, tradingCurrency);

        if (walletElements.unrealizedPnl) {
            walletElements.unrealizedPnl.textContent = `${unrealizedPnl >= 0 ? "+" : ""}${formatWalletMoneyPrivate(unrealizedPnl, tradingCurrency)}`;
            walletElements.unrealizedPnl.className = unrealizedPnl >= 0
                ? "mt-3 text-3xl font-black text-emerald-400"
                : "mt-3 text-3xl font-black text-red-400";
        }
    }

    if (walletElements.availableBalance) walletElements.availableBalance.textContent = formatWalletMoneyPrivate(mainAvailable, mainCurrency);
    if (walletElements.totalBalance) walletElements.totalBalance.textContent = formatWalletMoneyPrivate(mainTotal, mainCurrency);

    if (walletElements.ledgerCount) walletElements.ledgerCount.textContent = String(getDisplayLedgerRows(WALLET_STATE.ledger).length);

    renderLedgerTable();
    renderDepositTable();
    renderWithdrawalTable();
    if (typeof txRenderAssetLists === "function") {
        txRenderAssetLists();
    }
    if (typeof txRenderTradingAccounts === "function") {
        txRenderTradingAccounts();
    }
    updateMainWithdrawalPageBalanceDisplay();
    updateWalletActionModalBalances();
}

function renderWalletBalanceCardsOnly() {
    applyRestrictedWalletVisibility();

    if (isWalletRestrictedMode()) {
        setWalletStatus("Restricted", "error");
        return;
    }

    const wallet = WALLET_STATE.wallet || {};
    const mainWallet = getMainWalletData();
    const tradingWallet = getTradingWalletData();
    const mainCurrency = mainWallet.currency || "USDT";
    const tradingCurrency = "USDT";

    const mainAvailable = walletNumber(mainWallet.available_balance, 0);
    let tradingAvailable = walletNumber(tradingWallet.available_balance, 0);
    const mainTotal = walletNumber(mainWallet.total_balance, mainAvailable + walletNumber(mainWallet.locked_balance, 0));

    const user = typeof getAuthUser === "function" ? getAuthUser() : null;
    const isMt5 = user && user.selected_platform === "mt5";

    if (isMt5) {
        const mt5Account = WALLET_STATE.mt5?.account || {};
        const mt5Curr = mt5Account.account_currency || "USD";
        tradingAvailable = walletNumber(mt5Account.balance, 0);

        if (walletElements.lockedBalanceLabel) walletElements.lockedBalanceLabel.textContent = "MT5 Account Balance";
        if (walletElements.lockedBalanceNote) walletElements.lockedBalanceNote.textContent = "MetaTrader 5 server balance";
        if (walletElements.lockedBalance) walletElements.lockedBalance.textContent = formatWalletMoney(tradingAvailable, mt5Curr);
    } else {
        if (walletElements.lockedBalanceLabel) walletElements.lockedBalanceLabel.textContent = "Trading Wallet";
        if (walletElements.lockedBalanceNote) walletElements.lockedBalanceNote.textContent = "Trades use this balance";
        if (walletElements.lockedBalance) walletElements.lockedBalance.textContent = formatWalletMoney(tradingAvailable, tradingCurrency);
    }

    if (walletElements.availableBalance) {
        walletElements.availableBalance.textContent = formatWalletMoney(mainAvailable, mainCurrency);
    }

    if (walletElements.totalBalance) {
        walletElements.totalBalance.textContent = formatWalletMoney(mainTotal, mainCurrency);
    }

    setWalletStatus("Active", "live");
    if (typeof txRenderAssetLists === "function") {
        txRenderAssetLists();
    }
    updateMainWithdrawalPageBalanceDisplay();
    updateWalletActionModalBalances();
}

async function refreshWalletBalanceOnly() {
    if (
        document.hidden ||
        typeof apiRequest !== "function" ||
        typeof isLoggedIn !== "function" ||
        !isLoggedIn()
    ) {
        return;
    }

    if (isWalletRestrictedMode()) {
        await refreshWithdrawalHistoryOnly();
        return;
    }

    try {
        await loadWalletAccountStatus();

        if (isWalletRestrictedMode()) {
            await refreshWithdrawalHistoryOnly();
            return;
        }

        const response = await apiRequest("/wallet/balance");
        const walletData = response?.data?.wallet || response?.data || null;

        if (!walletData) {
            return;
        }

        WALLET_STATE.wallet = walletData;
        renderWalletBalanceCardsOnly();
    } catch (error) {
        console.warn("Wallet balance auto sync failed:", error);
    }
}

async function forceWalletSync(options = {}) {
    const silent = options?.silent !== false;

    await refreshWalletBalanceOnly();

    if (!WALLET_STATE.loading) {
        await loadWalletData({ silent });
    }
}

function getFilteredLedgerRows() {
    const state = getHistoryState("ledger");
    const status = String(state.status || "all").toLowerCase();
    const currencyFilter = String(state.currency || "all").toUpperCase();
    return getDisplayLedgerRows(WALLET_STATE.ledger || []).filter((item) => {
        const type = historyText(item.transaction_type || item.type);
        const direction = historyText(item.direction);
        const description = historyText(item.description);
        const itemCurrency = getItemCurrency(item);

        const statusMatch = status === "all"
            || direction === status
            || type.includes(status)
            || description.includes(status);
        const currencyMatch = currencyFilter === "ALL" || itemCurrency === currencyFilter;
        const searchMatch = rowContainsSearch(item, state.search, ["transaction_type", "type", "direction", "description", "reference_id", "withdrawal_id", "currency"])
            || historyText(formatWalletMoney(item.amount, itemCurrency)).includes(historyText(state.search));
        return statusMatch && currencyMatch && searchMatch;
    });
}

function renderLedgerTable() {
    if (!walletElements.ledgerBody) return;

    const filtered = getFilteredLedgerRows();
    const meta = paginateRows(filtered, "ledger");
    const ledger = meta.rows;

    walletElements.ledgerBody.innerHTML = ledger.map((item) => {
        const finalizedWithdrawal = isWithdrawalFinalizedLedger(item) && !item.__singleWithdrawalDebit;
        const rawDirection = String(item.direction || "").toLowerCase();
        const direction = finalizedWithdrawal ? "finalized" : rawDirection;
        const sign = direction === "credit" ? "+" : "-";
        const amountClass = directionClass(direction);
        const description = finalizedWithdrawal ? withdrawalFinalizedDescription(item.description) : (item.description || "");
        const itemCurrency = getItemCurrency(item);
        const amountCell = finalizedWithdrawal
            ? `<span class="text-cyan-300">No extra debit</span><p class="mt-1 text-xs font-normal text-slate-500">Locked ${walletEscape(formatWalletMoney(item.amount, itemCurrency))}</p>`
            : `${sign}${walletEscape(formatWalletMoney(item.amount, itemCurrency))}`;

        return `
            <tr class="transition hover:bg-cyan-400/[0.04]">
                <td class="tx-desktop-only text-sm text-slate-300">${walletEscape(formatWalletDate(item.created_at))}</td>
                <td class="tx-desktop-only text-sm font-bold text-white">
                    ${walletEscape(prettyType(item.transaction_type))}
                    <p class="mt-1 max-w-[420px] truncate text-xs font-normal text-slate-500" title="${walletEscape(description)}">${walletEscape(description)}</p>
                </td>
                <td class="tx-desktop-only text-sm font-black ${amountClass}">${walletEscape(prettyType(direction))}</td>
                <td class="tx-desktop-only text-sm font-black ${amountClass}">${amountCell}</td>
                <td class="tx-desktop-only text-sm text-slate-300">${walletEscape(formatWalletMoney(item.balance_after, itemCurrency))}</td>

                <td class="rt-mobile-only tx-mobile-only rt-mobile-card-cell" colspan="5">
                    <div class="rt-mobile-position-card w-full box-border overflow-hidden">
                        <div class="flex items-center justify-between gap-2 mb-1">
                            <span class="text-xs sm:text-sm font-black text-white truncate max-w-[65%]">${walletEscape(prettyType(item.transaction_type))}</span>
                            <span class="text-xs sm:text-sm font-black ${amountClass} shrink-0">${amountCell}</span>
                        </div>
                        <div class="text-[10px] font-bold uppercase mb-2 tracking-wide ${amountClass}">
                            ${walletEscape(prettyType(direction))}
                        </div>
                        <div class="text-xs text-slate-300 mb-2 border-t border-b border-slate-800/60 py-2 grid gap-1.5">
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-slate-500 font-bold text-[9px] uppercase tracking-wider shrink-0">Balance After</span>
                                <strong class="text-white font-bold shrink-0">${walletEscape(formatWalletMoney(item.balance_after, itemCurrency))}</strong>
                            </div>
                            <div class="flex flex-col gap-0.5">
                                <span class="text-slate-500 font-bold text-[9px] uppercase tracking-wider">Description</span>
                                <span class="text-slate-300 text-xs font-medium leading-relaxed break-words" title="${walletEscape(description)}">${walletEscape(description || "--")}</span>
                            </div>
                        </div>
                        <div class="text-right text-[10px] text-slate-500 font-bold">
                            ${walletEscape(formatWalletDate(item.created_at))}
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    walletElements.ledgerEmpty?.classList.toggle("hidden", filtered.length > 0);
    renderHistoryPagination("ledger", meta);
    bindHistoryFilters();
}

function getFilteredDepositRows() {
    const state = getHistoryState("deposits");
    const status = String(state.status || "all").toLowerCase();
    const currencyFilter = String(state.currency || "all").toUpperCase();
    return (WALLET_STATE.deposits || []).filter((item) => {
        const itemStatus = historyText(item.status);
        const verification = historyText(item.verification_status);
        const itemCurrency = getItemCurrency(item);
        const pendingLike = ["pending", "processing", "pending_blockchain_verification", "pending_manual_verification", "pending_verification", "processing_direct_credit"].some((value) => itemStatus.includes(value) || verification.includes(value));
        const statusMatch = status === "all"
            || itemStatus.includes(status)
            || verification.includes(status)
            || (status === "pending" && pendingLike);
        const currencyMatch = currencyFilter === "ALL" || itemCurrency === currencyFilter;
        const searchMatch = rowContainsSearch(item, state.search, ["deposit_reference", "crypto_asset", "crypto_network", "tx_hash", "status", "verification_status", "verification_message", "remark", "deposit_address"])
            || historyText(formatWalletMoney(item.amount, itemCurrency)).includes(historyText(state.search));
        return statusMatch && currencyMatch && searchMatch;
    });
}

function renderDepositTable() {
    if (!walletElements.depositBody) return;

    const filtered = getFilteredDepositRows();
    const meta = paginateRows(filtered, "deposits");
    const deposits = meta.rows;

    walletElements.depositBody.innerHTML = deposits.map((item) => {
        const status = String(item.status || "").toLowerCase();
        const verificationStatus = String(item.verification_status || "").toLowerCase();

        const canVerify = ["pending", "pending_verification", "failed"].includes(status) ||
            ["not_checked", "pending_on_chain", "provider_error", "provider_not_configured", "manual_company_wallet_check_required"].includes(verificationStatus);

        const action = canVerify
            ? `<button type="button" data-verify-deposit="${walletEscape(item.id)}" class="rounded-full bg-emerald-400 px-3 py-2 text-xs font-black text-slate-950 hover:bg-emerald-300">Verify</button>`
            : `<span class="text-xs text-slate-500">--</span>`;

        const verificationText = item.verification_message || item.remark || "--";
        const confirmations = Number(item.required_confirmations || 0) > 0
            ? `${walletEscape(item.confirmations || 0)}/${walletEscape(item.required_confirmations || 0)}`
            : walletEscape(item.confirmations || 0);

        const itemCurrency = getItemCurrency(item);

        return `
            <tr class="transition hover:bg-cyan-400/[0.04]">
                <td class="tx-desktop-only text-sm text-slate-300">${walletEscape(formatWalletDate(item.created_at))}</td>
                <td class="tx-desktop-only text-sm font-bold text-white">
                    ${walletEscape(item.deposit_reference || "--")}
                    <p class="mt-1 text-xs font-normal text-slate-500">${getExplorerLink(item.explorer_url, "Explorer")}</p>
                </td>
                <td class="tx-desktop-only text-sm text-slate-300">${walletEscape(item.crypto_asset || "USDT")} / ${walletEscape(item.crypto_network || "--")}</td>
                <td class="tx-desktop-only text-sm font-black text-white">${walletEscape(formatWalletMoney(item.amount, itemCurrency))}</td>
                <td class="tx-desktop-only"><span class="rounded-full px-3 py-1 text-xs font-black ${statusClass(item.status)}">${walletEscape(prettyType(item.status))}</span></td>
                <td class="tx-desktop-only max-w-[360px] text-sm text-slate-400">
                    <span class="font-bold text-slate-300">${walletEscape(prettyType(item.verification_status || "pending"))}</span>
                    <p class="mt-1 text-xs text-slate-500">Confirmations: ${confirmations}</p>
                    <p class="mt-1 line-clamp-2 text-xs text-slate-500">${walletEscape(verificationText)}</p>
                </td>
                <td class="tx-desktop-only text-right">${action}</td>

                <td class="rt-mobile-only tx-mobile-only rt-mobile-card-cell" colspan="7">
                    <div class="rt-mobile-position-card w-full box-border overflow-hidden">
                        <div class="flex items-center justify-between gap-2 mb-1.5">
                            <span class="text-xs sm:text-sm font-black text-white truncate max-w-[65%]">${walletEscape(item.deposit_reference || "Deposit")}</span>
                            <span class="rounded-full px-2.5 py-0.5 text-[10px] font-black shrink-0 ${statusClass(item.status)}">${walletEscape(prettyType(item.status))}</span>
                        </div>
                        <div class="flex items-center justify-between gap-2 text-xs font-extrabold text-cyan-300 mb-2">
                            <span>${walletEscape(item.crypto_asset || "USDT")} (${walletEscape(item.crypto_network || "--")})</span>
                            <span class="text-sm font-black text-emerald-400 shrink-0">${walletEscape(formatWalletMoney(item.amount, itemCurrency))}</span>
                        </div>
                        <div class="text-xs text-slate-300 mb-2 border-t border-b border-slate-800/60 py-2 grid gap-1">
                            <div class="flex items-center justify-between text-[11px]">
                                <span class="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Verification</span>
                                <span class="font-bold text-slate-300">${walletEscape(prettyType(item.verification_status || "pending"))}</span>
                            </div>
                            ${item.explorer_url ? `<div class="flex items-center justify-between text-[11px]"><span class="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Tx Hash</span><span>${getExplorerLink(item.explorer_url, "Explorer")}</span></div>` : ''}
                        </div>
                        <div class="flex items-center justify-between text-[10px] text-slate-500 font-bold">
                            <span>Confirmations: ${confirmations}</span>
                            <span>${walletEscape(formatWalletDate(item.created_at))}</span>
                        </div>
                        ${canVerify ? `<div class="mt-2.5 pt-2 border-t border-slate-800/60 text-right">${action}</div>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    walletElements.depositEmpty?.classList.toggle("hidden", filtered.length > 0);
    renderHistoryPagination("deposits", meta);
    bindWalletRowActions();
    bindHistoryFilters();
}

function getFilteredWithdrawalRows() {
    const state = getHistoryState("withdrawals");
    const status = String(state.status || "all").toLowerCase();
    const currencyFilter = String(state.currency || "all").toUpperCase();
    return (WALLET_STATE.withdrawals || []).filter((item) => {
        const itemStatus = historyText(item.status);
        const meta = getWithdrawalStatusMeta(item);
        const label = historyText(meta.label);
        const itemCurrency = getItemCurrency(item);
        const pendingLike = ["pending", "queued", "pending_admin_approval", "pending_payout"].some((value) => itemStatus.includes(value) || label.includes(value));
        const statusMatch = status === "all"
            || itemStatus.includes(status)
            || label.includes(status)
            || (status === "pending" && pendingLike);
        const currencyMatch = currencyFilter === "ALL" || itemCurrency === currencyFilter;
        const searchMatch = rowContainsSearch(item, state.search, ["withdrawal_reference", "crypto_asset", "crypto_network", "withdrawal_address", "status", "remark", "reject_reason", "processing_mode", "tx_hash"])
            || historyText(formatWalletMoney(item.amount, itemCurrency)).includes(historyText(state.search));
        return statusMatch && currencyMatch && searchMatch;
    });
}

function renderWithdrawalTable() {
    if (!walletElements.withdrawalBody) return;

    const filtered = getFilteredWithdrawalRows();
    const metaPage = paginateRows(filtered, "withdrawals");
    const withdrawals = metaPage.rows;

    walletElements.withdrawalBody.innerHTML = withdrawals.map((item) => {
        const meta = getWithdrawalStatusMeta(item);
        const action = meta.canCancel
            ? `<button type="button" data-cancel-withdrawal="${walletEscape(item.id)}" class="rounded-full bg-orange-400 px-3 py-2 text-xs font-black text-slate-950 hover:bg-orange-300">Cancel</button>`
            : `<span class="text-xs text-slate-500">--</span>`;
        const explorer = item.explorer_url ? getExplorerLink(item.explorer_url, "Explorer") : "--";
        const decisionText = meta.decisionAt ? `Decision: ${formatWalletDate(meta.decisionAt)}` : "";
        const adminText = item.approved_admin_email || item.rejected_admin_email || "";
        const lockedAmount = walletNumber(item.locked_amount, item.amount || 0);
        const itemCurrency = getItemCurrency(item);

        return `
            <tr class="transition hover:bg-cyan-400/[0.04]">
                <td class="tx-desktop-only text-sm text-slate-300">${walletEscape(formatWalletDate(item.created_at))}</td>
                <td class="tx-desktop-only text-sm font-bold text-white">
                    ${walletEscape(item.withdrawal_reference || "--")}
                    <p class="mt-1 text-xs font-normal text-slate-500">${explorer}</p>
                </td>
                <td class="tx-desktop-only text-sm text-slate-300">${walletEscape(item.crypto_asset || "USDT")} / ${walletEscape(item.crypto_network || "--")}</td>
                <td class="tx-desktop-only max-w-[240px] truncate text-sm text-slate-300" title="${walletEscape(item.withdrawal_address || "")}">${walletEscape(item.withdrawal_address || "--")}</td>
                <td class="tx-desktop-only text-sm font-black text-white">
                    ${walletEscape(formatWalletMoney(item.amount, itemCurrency))}
                    <p class="mt-1 text-xs font-normal text-slate-500">Receive: ${walletEscape(formatWalletMoney(item.final_amount ?? item.amount, itemCurrency))}</p>
                    <p class="mt-1 text-xs font-normal text-slate-500">Wallet debit: ${walletEscape(formatWalletMoney(lockedAmount, itemCurrency))}</p>
                </td>
                <td class="tx-desktop-only">
                    <span class="rounded-full px-3 py-1 text-xs font-black ${statusClass(item.status, meta.tone)}">${walletEscape(meta.label)}</span>
                    ${decisionText ? `<p class="mt-2 text-xs text-slate-500">${walletEscape(decisionText)}</p>` : ""}
                </td>
                <td class="tx-desktop-only max-w-[320px] text-sm text-slate-400">
                    <span class="font-bold text-slate-300">${walletEscape(prettyType(item.processing_mode || "admin_approval"))}</span>
                    <p class="mt-1 line-clamp-2 text-xs text-slate-500">${walletEscape(meta.message || item.remark || "--")}</p>
                    ${adminText ? `<p class="mt-1 text-xs text-slate-600">Admin: ${walletEscape(adminText)}</p>` : ""}
                </td>
                <td class="tx-desktop-only text-right">${action}</td>

                <td class="rt-mobile-only tx-mobile-only rt-mobile-card-cell" colspan="8">
                    <div class="rt-mobile-position-card w-full box-border overflow-hidden">
                        <div class="flex items-center justify-between gap-2 mb-1.5">
                            <span class="text-xs sm:text-sm font-black text-white truncate max-w-[60%]">${walletEscape(item.withdrawal_reference || "Withdrawal")}</span>
                            <span class="rounded-full px-2.5 py-0.5 text-[10px] font-black shrink-0 ${statusClass(item.status, meta.tone)}">${walletEscape(meta.label)}</span>
                        </div>
                        <div class="flex items-center justify-between gap-2 text-xs font-extrabold text-cyan-300 mb-2">
                            <span>${walletEscape(item.crypto_asset || "USDT")} (${walletEscape(item.crypto_network || "--")})</span>
                            <span class="text-sm font-black text-rose-400 shrink-0">-${walletEscape(formatWalletMoney(item.amount, itemCurrency))}</span>
                        </div>
                        <div class="text-xs text-slate-300 mb-2 border-t border-b border-slate-800/60 py-2 grid gap-1.5">
                            <div class="flex flex-col gap-0.5">
                                <span class="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Payout Address / Bank</span>
                                <span class="text-slate-300 text-xs font-mono font-medium leading-relaxed break-all" title="${walletEscape(item.withdrawal_address || "")}">${walletEscape(item.withdrawal_address || "--")}</span>
                            </div>
                            ${meta.message || item.remark ? `<div class="flex flex-col gap-0.5"><span class="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Remark</span><span class="text-slate-400 text-xs leading-relaxed break-words">${walletEscape(meta.message || item.remark)}</span></div>` : ''}
                        </div>
                        <div class="flex items-center justify-between text-[10px] text-slate-500 font-bold">
                            <span>Receive: ${walletEscape(formatWalletMoney(item.final_amount ?? item.amount, itemCurrency))}</span>
                            <span>${walletEscape(formatWalletDate(item.created_at))}</span>
                        </div>
                        ${meta.canCancel ? `<div class="mt-2.5 pt-2 border-t border-slate-800/60 text-right">${action}</div>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    walletElements.withdrawalEmpty?.classList.toggle("hidden", filtered.length > 0);
    renderHistoryPagination("withdrawals", metaPage);
    bindWalletRowActions();
    bindHistoryFilters();
}


function bindWalletRowActions() {
    document.querySelectorAll("[data-verify-deposit]").forEach((button) => {
        if (button.dataset.bound === "true") return;

        button.dataset.bound = "true";
        button.addEventListener("click", async () => {
            await verifyDepositOnChain(button.getAttribute("data-verify-deposit"));
        });
    });

    document.querySelectorAll("[data-cancel-withdrawal]").forEach((button) => {
        if (button.dataset.bound === "true") return;

        button.dataset.bound = "true";
        button.addEventListener("click", async () => {
            await cancelWithdrawalRequest(button.getAttribute("data-cancel-withdrawal"));
        });
    });
}

function sanitizePositiveAmountInput(input, decimalLimit = 6) {
    if (!input) return;

    input.addEventListener("input", () => {
        const val = input.value;
        if (!val) return;

        if (parseFloat(val) < 0) {
            input.value = Math.abs(parseFloat(val));
            return;
        }

        if (val.includes(".")) {
            const parts = val.split(".");
            if (parts[1] && parts[1].length > decimalLimit) {
                input.value = `${parts[0]}.${parts[1].slice(0, decimalLimit)}`;
            }
        }
    });
}

function validateDepositForm(formData, isINR = false) {
    const amount = walletNumber(formData.get("amount"), 0);
    if (isINR) {
        if (amount < 10) return "Minimum INR deposit amount is ₹10.";
        return "";
    }

    const network = getSelectedCryptoNetwork();
    const addressInfo = getSelectedCryptoAddressInfo();
    const companyAddress = String(addressInfo?.address || "").trim();
    const txHash = String(formData.get("tx_hash") || "").trim();
    const activeCurrency = String(WALLET_STATE.activeDepositCurrency || "USDT").toUpperCase();

    const minAmount = Number(WALLET_STATE.cryptoDeposit.minAmount || 0);
    const maxAmount = Number(WALLET_STATE.cryptoDeposit.maxAmount || 1000000);
    if (amount < minAmount) return `Minimum crypto deposit amount is ${minAmount} ${activeCurrency}.`;
    if (amount > maxAmount) return `Maximum crypto deposit amount is ${maxAmount} ${activeCurrency}.`;
    if (!["TRC20", "ERC20", "BEP20", "BITCOIN", "SOLANA", "RIPPLE", "CARDANO"].includes(network)) return "Please select a valid crypto network.";
    if (!addressInfo?.is_configured || !companyAddress) return `${activeCurrency} ${network} company deposit address is not configured from Admin Settings.`;
    if (!txHash) return `Transaction ID (TXID / Hash) is required after sending ${activeCurrency} deposit.`;

    return "";
}


async function handleMetaMaskPayment() {
    if (typeof window.ethereum === "undefined") {
        showWalletActionMessage("MetaMask is not installed. Please install the extension first.", "error");
        return;
    }

    const usdAmount = parseFloat(walletElements.depositAmount?.value);
    if (isNaN(usdAmount) || usdAmount <= 0) {
        showWalletActionMessage("Please enter a valid deposit amount first.", "error");
        return;
    }

    const selectedNetwork = getSelectedCryptoNetwork();
    const companyAddress = walletElements.cryptoDepositAddress?.textContent?.trim();

    if (!companyAddress || companyAddress === "--" || companyAddress.includes("not configured")) {
        showWalletActionMessage("Company deposit address is not configured properly.", "error");
        return;
    }

    const chainIdMap = {
        "ERC20": "0xaa36a7", // Sepolia Testnet
        "BEP20": "0x61"      // BSC Testnet
    };
    const chainId = chainIdMap[selectedNetwork];
    if (!chainId) {
        showWalletActionMessage("Selected network is not supported for MetaMask deposits.", "error");
        return;
    }

    try {
        walletSetButtonLoading(walletElements.payWithMetaMaskBtn, true);
        showWalletActionMessage("Requesting MetaMask connection...", "info");

        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        const userAddress = accounts[0];

        showWalletActionMessage(`Switching MetaMask network to ${selectedNetwork === "ERC20" ? "Sepolia Testnet" : "BSC Testnet"}...`, "info");
        try {
            await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: chainId }]
            });
        } catch (switchError) {
            if (switchError.code === 4902) {
                const networkDetails = {
                    "0xaa36a7": {
                        chainId: "0xaa36a7",
                        chainName: "Sepolia Test Network",
                        nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
                        rpcUrls: ["https://rpc.sepolia.org"],
                        blockExplorerUrls: ["https://sepolia.etherscan.io"]
                    },
                    "0x61": {
                        chainId: "0x61",
                        chainName: "BSC Testnet",
                        nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
                        rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
                        blockExplorerUrls: ["https://testnet.bscscan.com"]
                    }
                };
                await window.ethereum.request({
                    method: "wallet_addEthereumChain",
                    params: [networkDetails[chainId]]
                });
            } else {
                throw switchError;
            }
        }

        const activeCurrency = String(WALLET_STATE.activeDepositCurrency || "USDT").toUpperCase();
        
        const tokenContracts = {
            "BTC": WALLET_STATE.cryptoDeposit.btcContractAddress || "",
            "BNB": "0x365030F77e91dcBb341174d454871BE07d47a083",
            "SOL": "0x0D0b687E55FA6e16F3645038e018D7654D7CD99B",
            "XRP": "0x4c9c3851e6dc08bEF4377F9147d84B8419D242B2",
            "ADA": "0xC3678002F75eEA63D75B543fC12625f609aE9959"
        };
        const activeContract = tokenContracts[activeCurrency];
        
        let txParams;
        if (["BTC", "BNB", "SOL", "XRP", "ADA"].includes(activeCurrency) && activeContract) {
            // ERC20 Token transfer (custom token)
            // Method ID for transfer(address,uint256) is 0xa9059cbb
            const cleanToAddress = companyAddress.replace("0x", "").toLowerCase().padStart(64, "0");
            const decimals = 18; 
            const tokenAmountWei = BigInt(Math.floor(usdAmount * Math.pow(10, decimals)));
            const cleanAmount = tokenAmountWei.toString(16).padStart(64, "0");
            const txData = "0xa9059cbb" + cleanToAddress + cleanAmount;

            txParams = {
                from: userAddress,
                to: activeContract,
                value: "0x0",
                data: txData,
                gas: "0x186a0" // 100,000 gas limit is standard and safe for ERC20
            };
            showWalletActionMessage(`Preparing ERC20 ${activeCurrency} token transfer to ${companyAddress}...`, "info");
        } else {
            // Native ETH/BNB transfer
            const testAmount = usdAmount * 0.0001;
            const weiValue = "0x" + Math.floor(testAmount * 1e18).toString(16);
            txParams = {
                from: userAddress,
                to: companyAddress,
                value: weiValue,
                gas: "0x5208"
            };
            showWalletActionMessage("Preparing payment transaction...", "info");
        }

        showWalletActionMessage("Confirm transaction in MetaMask popup...", "info");
        const txHash = await window.ethereum.request({
            method: "eth_sendTransaction",
            params: [txParams]
        });

        if (walletElements.depositTxHash) {
            walletElements.depositTxHash.value = txHash;
        }
        if (walletElements.depositAddressConfirmation) {
            walletElements.depositAddressConfirmation.value = companyAddress;
        }

        const depositForm = document.getElementById("walletDepositForm") || document.querySelector("#modalDepositFormForm");
        if (depositForm) {
            showWalletActionMessage("MetaMask payment complete! Auto-verifying deposit...", "info");
            setTimeout(() => {
                try {
                    depositForm.requestSubmit();
                } catch (e) {
                    const submitEvent = new Event("submit", { cancelable: true });
                    depositForm.dispatchEvent(submitEvent);
                }
            }, 300);
        } else {
            showWalletActionMessage("MetaMask payment complete! TXID has been filled automatically. Please click 'Deposit' below to credit.", "success");
        }
    } catch (err) {
        console.error("MetaMask Payment Error:", err);
        showWalletActionMessage(err.message || "MetaMask payment failed.", "error");
    } finally {
        walletSetButtonLoading(walletElements.payWithMetaMaskBtn, false);
    }
}


async function handleDepositSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form) {
        showWalletActionMessage("Wallet deposit form is not ready. Please refresh and try again.", "error");
        return;
    }

    if (!isLoggedIn()) {
        showWalletActionMessage("Please login first.", "error");
        return;
    }

    if (isWalletRestrictedMode()) {
        showWalletActionMessage("Deposit is disabled while account is restricted.", "error");
        return;
    }

    const activeCurrency = (WALLET_STATE.activeDepositCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const isINR = activeCurrency === "INR";

    const formData = new FormData(form);
    const validationError = validateDepositForm(formData, isINR);

    if (validationError) {
        showWalletActionMessage(validationError, "error");
        return;
    }

    if (isINR) {
        try {
            walletSetButtonLoading(walletElements.createDepositBtn, true);
            const amount = walletNumber(formData.get("amount"), 0);
            
            // 1. Create Razorpay order on backend
            const orderResponse = await apiRequest("/deposit/razorpay/create-order", {
                method: "POST",
                body: JSON.stringify({ amount })
            });

            if (!orderResponse || !orderResponse.success || !orderResponse.data) {
                throw new Error(orderResponse?.message || "Failed to create order on server.");
            }

            const orderData = orderResponse.data;
            
            // Check if backend used sandbox test mode (meaning keys are not configured yet)
            if (orderData.is_sandbox_fallback) {
                // For sandbox fallback, we can simulate the successful payment directly to make testing easier
                const confirmed = await showWalletConfirm({
                    title: "Razorpay Sandbox Simulation",
                    message: `Razorpay API Keys are not set in the backend .env. Would you like to simulate a successful payment of ₹${amount}?`,
                    confirmText: "Simulate Success",
                    cancelText: "Simulate Failure",
                    danger: false
                });

                if (confirmed) {
                    const verifyResponse = await apiRequest("/deposit/razorpay/verify-payment", {
                        method: "POST",
                        body: JSON.stringify({
                            razorpay_order_id: orderData.razorpay_order_id,
                            razorpay_payment_id: "pay_sandbox_simulated_" + Math.random().toString(36).substring(7)
                        })
                    });
                    
                    form.reset();
                    await loadWalletData({ silent: true });
                    await refreshWalletBalanceOnly();
                    closeWalletActionModal();
                    showWalletAlert(verifyResponse.message || "Simulated payment successfully verified!", "success");
                } else {
                    showWalletActionMessage("Simulated payment failed or cancelled.", "error");
                }
                return;
            }

            // 2. Launch real Razorpay Checkout
            if (typeof Razorpay === "undefined") {
                showWalletActionMessage("Razorpay SDK is not loaded. Please refresh the page.", "error");
                return;
            }

            const user = getAuthUser() || {};
            const options = {
                key: orderData.key_id,
                amount: orderData.amount_paise,
                currency: "INR",
                name: "TraidiumX",
                description: `Wallet Deposit - Ref: ${orderData.deposit_reference}`,
                order_id: orderData.razorpay_order_id,
                handler: async function (response) {
                    try {
                        walletSetButtonLoading(walletElements.createDepositBtn, true);
                        showWalletActionMessage("Verifying payment...", "info");
                        
                        const verifyResponse = await apiRequest("/deposit/razorpay/verify-payment", {
                            method: "POST",
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature
                            })
                        });

                        form.reset();
                        await loadWalletData({ silent: true });
                        await refreshWalletBalanceOnly();
                        closeWalletActionModal();
                        showWalletAlert(verifyResponse.message || "Payment verified successfully!", "success");
                    } catch (verifyError) {
                        showWalletActionMessage(verifyError.message || "Payment verification failed. Please contact support.", "error");
                    } finally {
                        walletSetButtonLoading(walletElements.createDepositBtn, false);
                    }
                },
                prefill: {
                    name: user.name || "",
                    email: user.email || "",
                    contact: user.phone || user.contact || ""
                },
                theme: {
                    color: "#10b981" // matches TraidiumX emerald colors
                },
                modal: {
                    ondismiss: function () {
                        showWalletActionMessage("Payment cancelled by user.", "error");
                    }
                }
            };

            const rzp = new Razorpay(options);
            rzp.open();
        } catch (error) {
            showWalletActionMessage(error.message || "Unable to initiate payment.", "error");
        } finally {
            walletSetButtonLoading(walletElements.createDepositBtn, false);
        }
    } else {
        // Crypto USDT Deposit flow
        try {
            walletSetButtonLoading(walletElements.createDepositBtn, true);
            const payload = {
                amount: walletNumber(formData.get("amount"), 0),
                payment_method: "crypto_deposit",
                crypto_asset: String(formData.get("crypto_asset") || "USDT").trim().toUpperCase(),
                crypto_network: getSelectedCryptoNetwork(),
                tx_hash: String(formData.get("tx_hash") || "").trim(),
                deposit_address_confirmation: String(formData.get("deposit_address_confirmation") || "").trim()
            };

            const response = await apiRequest("/deposit/create", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            form.reset();

            if (walletElements.cryptoNetwork) {
                walletElements.cryptoNetwork.value = "TRC20";
            }

            const isCompleted = response?.data?.deposit?.status === "completed";
            if (isCompleted) {
                closeWalletActionModal();
                showWalletAlert(response.message || "Deposit credited successfully.", "success");
            } else {
                showWalletActionMessage(response.message || "Deposit submitted successfully.", "info");
            }

            // Reset loading button immediately
            walletSetButtonLoading(walletElements.createDepositBtn, false);

            // Fetch wallet data in background asynchronously
            loadWalletData({ silent: true }).then(() => {
                updateCryptoDepositAddressUI();
                updateWalletActionModalBalances();
            });
        } catch (error) {
            checkKycRedirect(error, "Unable to create deposit.", "deposit");
            walletSetButtonLoading(walletElements.createDepositBtn, false);
        }
    }
}


function getWithdrawalFormAmountAndNetwork() {
    const isINR = (WALLET_STATE.activeWithdrawalCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase() === "INR";
    return {
        amount: walletNumber(walletElements.withdrawAmount?.value, 0),
        network: isINR ? "UPI/BANK" : String(walletElements.withdrawNetwork?.value || "TRC20").trim().toUpperCase()
    };
}

function getDemoWithdrawalAmountAndNetwork() {
    return {
        amount: walletNumber(walletElements.demoWithdrawAmount?.value, 0),
        network: String(walletElements.demoWithdrawNetwork?.value || "TRC20").trim().toUpperCase()
    };
}

function getWithdrawalFeeNumbers(estimate = null, fallbackAmount = 0) {
    const isINR = (WALLET_STATE.activeWithdrawalCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase() === "INR";
    const currency = isINR ? "INR" : (estimate?.currency || "USDT");
    const amount = walletNumber(estimate?.amount_usdt, fallbackAmount);
    const companyFee = walletNumber(estimate?.withdrawal_fee_usdt, 0);
    const networkFee = walletNumber(estimate?.network_fee_usdt, 0);
    const totalFee = walletNumber(estimate?.total_fee_usdt, companyFee + networkFee);
    const totalDebit = walletNumber(estimate?.total_wallet_debit_usdt, amount);
    const receiveAmount = walletNumber(estimate?.payout_amount_usdt, Math.max(amount - totalFee, 0));

    return { currency, amount, companyFee, networkFee, totalFee, totalDebit, receiveAmount };
}

function setFeePreview(elements = {}, estimate = null, message = "Enter amount and select network to calculate fees.", fallbackAmount = 0) {
    const values = getWithdrawalFeeNumbers(estimate, fallbackAmount);

    if (elements.amount) elements.amount.textContent = values.amount > 0 ? formatWalletMoney(values.amount, values.currency) : "--";
    if (elements.receive) elements.receive.textContent = estimate ? formatWalletMoney(values.receiveAmount, values.currency) : "--";
    if (elements.companyFee) elements.companyFee.textContent = estimate ? formatWalletMoney(values.companyFee, values.currency) : "--";
    if (elements.networkFee) elements.networkFee.textContent = estimate ? formatWalletMoney(values.networkFee, values.currency) : "--";
    if (elements.totalFee) elements.totalFee.textContent = estimate ? formatWalletMoney(values.totalFee, values.currency) : "--";
    if (elements.totalDebit) elements.totalDebit.textContent = estimate ? formatWalletMoney(values.totalDebit, values.currency) : "--";
    if (elements.note) elements.note.textContent = message;
}

function setWithdrawalFeePreview(estimate = null, message = "Enter amount and select network to calculate fees.") {
    setFeePreview({
        amount: walletElements.withdrawPreviewAmount,
        receive: walletElements.withdrawPreviewReceive,
        companyFee: walletElements.withdrawPreviewCompanyFee,
        networkFee: walletElements.withdrawPreviewNetworkFee,
        totalFee: walletElements.withdrawPreviewTotalFee,
        totalDebit: walletElements.withdrawPreviewTotalDebit,
        note: walletElements.withdrawPreviewNote
    }, estimate, message, walletNumber(walletElements.withdrawAmount?.value, 0));
}

function setDemoWithdrawalFeePreview(estimate = null, message = "Enter demo amount and select network to calculate fees.") {
    setFeePreview({
        amount: walletElements.demoWithdrawPreviewAmount,
        receive: walletElements.demoWithdrawPreviewReceive,
        companyFee: walletElements.demoWithdrawPreviewCompanyFee,
        networkFee: walletElements.demoWithdrawPreviewNetworkFee,
        totalFee: walletElements.demoWithdrawPreviewTotalFee,
        totalDebit: walletElements.demoWithdrawPreviewTotalDebit,
        note: walletElements.demoWithdrawPreviewNote
    }, estimate, message, walletNumber(walletElements.demoWithdrawAmount?.value, 0));
}

async function requestWithdrawalFeeEstimate(amount, network, showError = false, previewSetter = null) {
    if (typeof apiRequest !== "function") {
        return null;
    }

    if (!amount || amount <= 0) {
        if (typeof previewSetter === "function") previewSetter(null);
        return null;
    }

    try {
        WALLET_STATE.withdrawalFeeLoading = true;
        const response = await apiRequest("/fees/estimate", {
            method: "POST",
            body: JSON.stringify({
                product: "withdrawal",
                amount,
                crypto_network: network
            })
        });

        const estimate = response.data || response;
        const values = getWithdrawalFeeNumbers(estimate, amount);
        const message = `Fees are deducted from your withdraw amount. You will receive ${formatWalletMoney(values.receiveAmount, values.currency)} after admin approval.`;
        if (typeof previewSetter === "function") previewSetter(estimate, message);
        return estimate;
    } catch (error) {
        console.warn("Withdrawal fee estimate failed:", error);
        if (typeof previewSetter === "function") {
            previewSetter(null, "Unable to calculate fee right now. Backend will still validate fee before request is created.");
        }
        if (showError) {
            showWalletAlert(getErrorMessage(error, "Unable to calculate withdrawal fee."), "error");
        }
        return null;
    } finally {
        WALLET_STATE.withdrawalFeeLoading = false;
    }
}

async function estimateWithdrawalFee(showError = false) {
    const { amount, network } = getWithdrawalFormAmountAndNetwork();
    if (!amount || amount <= 0) {
        WALLET_STATE.withdrawalFeeEstimate = null;
        setWithdrawalFeePreview(null);
        return null;
    }

    const estimate = await requestWithdrawalFeeEstimate(amount, network, showError, setWithdrawalFeePreview);
    WALLET_STATE.withdrawalFeeEstimate = estimate;
    return estimate;
}

async function estimateDemoWithdrawalFee(showError = false) {
    const { amount, network } = getDemoWithdrawalAmountAndNetwork();
    if (!amount || amount <= 0) {
        setDemoWithdrawalFeePreview(null);
        return null;
    }

    return requestWithdrawalFeeEstimate(amount, network, showError, setDemoWithdrawalFeePreview);
}

function scheduleWithdrawalFeeEstimate() {
    window.clearTimeout(WALLET_STATE.withdrawalFeeTimer);
    WALLET_STATE.withdrawalFeeTimer = window.setTimeout(() => {
        estimateWithdrawalFee(false);
    }, 320);
}

function scheduleDemoWithdrawalFeeEstimate() {
    window.clearTimeout(WALLET_STATE.demoWithdrawalFeeTimer);
    WALLET_STATE.demoWithdrawalFeeTimer = window.setTimeout(() => {
        estimateDemoWithdrawalFee(false);
    }, 320);
}

function validateWithdrawalForm(formData) {
    const isModal = isWalletActionModalOpen();
    const prefix = isModal ? "modal" : "main";
    const isINR = (WALLET_STATE.activeWithdrawalCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase() === "INR";
    const amount = walletNumber(formData.get("amount"), 0);
    const address = String(formData.get("withdrawal_address") || "").trim();

    if (isINR) {
        if (amount < 10) return "Minimum INR withdrawal amount is ₹10.";
        
        const holder = document.getElementById(`${prefix}WithdrawHolderName`)?.value.trim() || "";
        const bank = document.getElementById(`${prefix}WithdrawBankName`)?.value.trim() || "";
        const accNum = document.getElementById(`${prefix}WithdrawAccountNumber`)?.value.trim() || "";
        const ifsc = document.getElementById(`${prefix}WithdrawIfscCode`)?.value.trim() || "";
        
        if (!holder) return "Please enter Account Holder Name.";
        if (!bank) return "Please enter Bank Name.";
        if (!accNum) return "Please enter Account Number.";
        if (!ifsc) return "Please enter IFSC Code.";
        return null;
    }

    const network = getSelectedWithdrawalCryptoNetwork();
    const activeCurrency = String(WALLET_STATE.activeWithdrawalCurrency || (isModal ? WALLET_STATE.activeWithdrawalCurrency : localStorage.getItem("tx_navbar_currency")) || "USDT").toUpperCase();

    if (activeCurrency === "USDT") {
        if (amount < 10) return "Minimum crypto withdrawal amount is 10 USDT.";
        if (amount > 1000000) return "Maximum crypto withdrawal amount is 1000000 USDT.";
        if (!["TRC20", "ERC20", "BEP20"].includes(network)) return "Please select a valid withdrawal network.";

        if (network === "TRC20" && !/^[Tt][a-zA-Z0-9]{20,50}$/.test(address)) {
            return "Please enter a valid TRC20 wallet address starting with T.";
        }

        if (["ERC20", "BEP20"].includes(network) && !/^0[xX][a-fA-F0-9]{40}$/.test(address)) {
            return `Please enter a valid ${network} wallet address starting with 0x.`;
        }
    } else {
        if (amount <= 0) return "Please enter a valid withdrawal amount.";
        if (!address) return "Please enter a withdrawal wallet address.";

        if (["ERC20", "BEP20"].includes(network)) {
            if (!/^0[xX][a-fA-F0-9]{40}$/.test(address)) {
                return `Please enter a valid ${network} wallet address starting with 0x.`;
            }
        } else {
            if (activeCurrency === "BTC") {
                const btcRegex = /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{39,59}|0[xX][a-fA-F0-9]{40})$/;
                if (!btcRegex.test(address)) return "Please enter a valid Bitcoin or EVM wallet address (starts with 1, 3, bc1, or 0x).";
            } else if (activeCurrency === "SOL") {
                const solRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
                if (!solRegex.test(address)) return "Please enter a valid Solana address.";
            } else if (activeCurrency === "XRP") {
                const xrpRegex = /^r[0-9a-zA-Z]{24,34}$/;
                if (!xrpRegex.test(address)) return "Please enter a valid Ripple address starting with r.";
            } else if (activeCurrency === "ADA") {
                const adaRegex = /^(addr1[a-z0-9]+|Ae2[a-km-zA-HJ-NP-Z1-9]+|Ddz[a-km-zA-HJ-NP-Z1-9]+)$/;
                if (!adaRegex.test(address)) return "Please enter a valid Cardano address.";
            } else if (["ETH", "USDC", "BNB"].includes(activeCurrency)) {
                if (!/^0[xX][a-fA-F0-9]{40}$/.test(address)) return `Please enter a valid ${activeCurrency} address starting with 0x.`;
            }
        }
    }

    return "";
}

function validateDemoAmount(amount, actionLabel) {
    const parsedAmount = walletNumber(amount, 0);

    if (parsedAmount < 10) return `Minimum demo ${actionLabel} amount is 10 USDT.`;
    if (parsedAmount > 1000000) return `Maximum demo ${actionLabel} amount is 1000000 USDT.`;

    return "";
}

function getDemoNetwork(formData, fallback = "TRC20") {
    const network = String(formData.get("crypto_network") || fallback || "TRC20").trim().toUpperCase();
    return ["TRC20", "ERC20", "BEP20"].includes(network) ? network : "TRC20";
}

function setDemoButtonLoading(button, isLoading) {
    if (!button) return;

    if (isLoading) {
        button.setAttribute("disabled", "disabled");
        button.classList.add("opacity-60", "cursor-not-allowed");
        return;
    }

    button.removeAttribute("disabled");
    button.classList.remove("opacity-60", "cursor-not-allowed");
}

async function handleDemoDepositSubmit(event) {
    event.preventDefault();

    if (!isLoggedIn()) {
        showWalletAlert("Please login first.", "error");
        return;
    }

    if (WALLET_STATE.environment !== "development") {
        showWalletAlert("Demo deposit can be added only in development mode.", "error");
        return;
    }

    const formData = new FormData(form);
    const amount = walletNumber(formData.get("amount"), 0);
    const cryptoNetwork = getDemoNetwork(formData);
    const validationError = validateDemoAmount(amount, "deposit");

    if (validationError) {
        showWalletAlert(validationError, "error");
        return;
    }

    const confirmed = await showWalletConfirm({
        title: "Create Demo Deposit?",
        message: `Create demo deposit of ${formatWalletMoney(amount, "USDT")} on ${cryptoNetwork}. This will save deposit history and wallet ledger entries in database.`,
        confirmText: "Create Deposit",
        cancelText: "Cancel",
        danger: false
    });

    if (!confirmed) {
        return;
    }

    try {
        setDemoButtonLoading(walletElements.demoDepositBtn || walletElements.demoCreditBtn, true);

        const response = await apiRequest("/wallet/demo-deposit", {
            method: "POST",
            body: JSON.stringify({ amount, crypto_network: cryptoNetwork })
        });

        closeWalletActionModal();
        showWalletAlert(response.message || "Demo deposit added successfully.", "success");
        await loadWalletData();
        if (!isWalletRestrictedMode()) {
            await refreshWalletBalanceOnly();
        }
    } catch (error) {
        showWalletAlert(getErrorMessage(error, "Unable to add demo deposit."), "error");
    } finally {
        setDemoButtonLoading(walletElements.demoDepositBtn || walletElements.demoCreditBtn, false);
    }
}


function buildWithdrawalConfirmPayload({ amount, network, estimate, title = "Confirm Withdrawal Request" }) {
    const values = getWithdrawalFeeNumbers(estimate, amount);
    return {
        title,
        message: `Please review the withdrawal fee breakdown before creating this ${network} request.`,
        details: [
            { label: "Wallet debit / locked amount", value: formatWalletMoney(values.totalDebit, values.currency), tone: "debit" },
            { label: "You will receive", value: formatWalletMoney(values.receiveAmount, values.currency), tone: "receive" },
            { label: "Withdrawal fee", value: formatWalletMoney(values.companyFee, values.currency), tone: "fee" }
        ],
        note: "Fees are deducted from the amount you enter. After admin approval, only the net payout is sent to your wallet address. If admin rejects/cancels, the locked amount is released back to available balance.",
        confirmText: "Confirm Withdrawal",
        cancelText: "Cancel",
        danger: true
    };
}

async function handleDemoWithdrawSubmit(event) {
    event.preventDefault();

    if (!isLoggedIn()) {
        showWalletAlert("Please login first.", "error");
        return;
    }

    if (WALLET_STATE.environment !== "development") {
        showWalletAlert("Demo withdrawal can be created only in development mode.", "error");
        return;
    }

    if (isWalletRestrictedMode()) {
        showWalletAlert("Use the real crypto withdrawal form when your account is restricted.", "error");
        return;
    }

    const formData = new FormData(form);
    const amount = walletNumber(formData.get("amount"), 0);
    const cryptoNetwork = getDemoNetwork(formData);
    const validationError = validateDemoAmount(amount, "withdrawal");

    if (validationError) {
        showWalletAlert(validationError, "error");
        return;
    }

    const availableBalance = walletNumber(WALLET_STATE.wallet?.available_balance, 0);

    if (availableBalance < amount) {
        showWalletAlert("Insufficient available balance for demo withdrawal.", "error");
        return;
    }

    const estimate = await requestWithdrawalFeeEstimate(amount, cryptoNetwork, true, setDemoWithdrawalFeePreview);
    const confirmed = await showWalletConfirm(buildWithdrawalConfirmPayload({
        amount,
        network: cryptoNetwork,
        estimate,
        title: "Confirm Demo Withdrawal"
    }));

    if (!confirmed) {
        return;
    }

    try {
        setDemoButtonLoading(walletElements.demoWithdrawBtn, true);

        const response = await apiRequest("/wallet/demo-withdraw", {
            method: "POST",
            body: JSON.stringify({ amount, crypto_network: cryptoNetwork })
        });

        showWalletAlert(response.message || "Withdrawal request created. Requested amount is locked; fees are deducted from that amount and only the net payout is sent after admin approval.", "success");
        await loadWalletData();
        if (!isWalletRestrictedMode()) {
            await refreshWalletBalanceOnly();
        }
    } catch (error) {
        showWalletAlert(getErrorMessage(error, "Unable to create withdrawal request."), "error");
    } finally {
        setDemoButtonLoading(walletElements.demoWithdrawBtn, false);
    }
}

async function handleDemoCreditSubmit(event) {
    return handleDemoDepositSubmit(event);
}


async function handleWithdrawalSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form) {
        showWalletActionMessage("Wallet withdrawal form is not ready. Please refresh and try again.", "error");
        return;
    }

    if (!isLoggedIn()) {
        showWalletActionMessage("Please login first.", "error");
        return;
    }

    await loadWalletAccountStatus();
    applyRestrictedWalletVisibility();
    const wasRestrictedMode = isWalletRestrictedMode();

    const formData = new FormData(form);
    const validationError = validateWithdrawalForm(formData);

    if (validationError) {
        showWalletActionMessage(validationError, "error");
        return;
    }

    const amount = walletNumber(formData.get("amount"), 0);
    const isINR = (WALLET_STATE.activeWithdrawalCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase() === "INR";
    if (!isINR) {
        await estimateWithdrawalFee(true);
    }

    const isModal = isWalletActionModalOpen();
    const prefix = isModal ? "modal" : "main";

    let withdrawalAddress = "";
    if (isINR) {
        const holder = document.getElementById(`${prefix}WithdrawHolderName`)?.value.trim() || "";
        const bank = document.getElementById(`${prefix}WithdrawBankName`)?.value.trim() || "";
        const accNum = document.getElementById(`${prefix}WithdrawAccountNumber`)?.value.trim() || "";
        const ifsc = document.getElementById(`${prefix}WithdrawIfscCode`)?.value.trim().toUpperCase() || "";
        const upi = document.getElementById(`${prefix}WithdrawUpiId`)?.value.trim() || "";

        if (!holder || !bank || !accNum || !ifsc) {
            showWalletAlert("Please fill in all bank details (Holder Name, Bank Name, Account Number, IFSC).", "error");
            return;
        }

        withdrawalAddress = `Holder: ${holder} | Bank: ${bank} | A/C: ${accNum} | IFSC: ${ifsc}`;
        if (upi) {
            withdrawalAddress += ` | UPI: ${upi}`;
        }
    } else {
        withdrawalAddress = String(formData.get("withdrawal_address") || "").trim();
    }

    try {
        const submitBtn = form.querySelector('button[type="submit"]');
        walletSetButtonLoading(submitBtn, true);
        const response = await apiRequest("/withdrawal/request", {
            method: "POST",
            body: JSON.stringify({
                amount: amount,
                withdrawal_method: isINR ? "inr_withdrawal" : "crypto_withdrawal",
                crypto_asset: isINR ? "INR" : String(formData.get("crypto_asset") || "USDT").trim().toUpperCase(),
                crypto_network: isINR ? "UPI/BANK" : getSelectedWithdrawalCryptoNetwork(),
                withdrawal_address: withdrawalAddress,
                destination_tag: String(formData.get("destination_tag") || "").trim()
            })
        });

        form.reset();
        
        // Clear bank inputs
        const holderInput = document.getElementById(`${prefix}WithdrawHolderName`);
        const bankNameInput = document.getElementById(`${prefix}WithdrawBankName`);
        const accNumInput = document.getElementById(`${prefix}WithdrawAccountNumber`);
        const ifscInput = document.getElementById(`${prefix}WithdrawIfscCode`);
        const upiInput = document.getElementById(`${prefix}WithdrawUpiId`);

        if (holderInput) holderInput.value = "";
        if (bankNameInput) bankNameInput.value = "";
        if (accNumInput) accNumInput.value = "";
        if (ifscInput) ifscInput.value = "";
        if (upiInput) upiInput.value = "";

        if (walletElements.withdrawNetwork) {
            walletElements.withdrawNetwork.value = "TRC20";
        }
        WALLET_STATE.withdrawalFeeEstimate = null;
        setWithdrawalFeePreview(null);

        const successMessage = response.message || "Withdrawal request created. Requested amount is locked; fees are deducted from that amount and only the net payout is sent after admin approval.";
        showWalletAlert(successMessage, "success");
        closeWalletActionModal();
        
        // Reset loading immediately
        walletSetButtonLoading(submitBtn, false);
        
        // Refresh wallet data asynchronously in background
        loadWalletData({ silent: true }).then(() => {
            if (!wasRestrictedMode && !isWalletRestrictedMode()) {
                refreshWalletBalanceOnly();
            }
        });
    } catch (error) {
        checkKycRedirect(error, "Unable to create crypto withdrawal request.", "withdrawal");
        walletSetButtonLoading(form.querySelector('button[type="submit"]'), false);
    }
}

async function verifyDepositOnChain(depositId) {
    if (!depositId) return;

    try {
        const response = await apiRequest(`/deposit/verify/${encodeURIComponent(depositId)}`, {
            method: "POST"
        });

        showWalletAlert(response.message || "Deposit verification completed.", "success");
        await loadWalletData();
        if (!isWalletRestrictedMode()) {
            await refreshWalletBalanceOnly();
        }
    } catch (error) {
        showWalletAlert(getErrorMessage(error, "Deposit is not verified yet. Try again after blockchain confirmations."), "error");
        await loadWalletData();
        if (!isWalletRestrictedMode()) {
            await refreshWalletBalanceOnly();
        }
    }
}

async function cancelWithdrawalRequest(withdrawalId) {
    if (!withdrawalId) return;

    const wasRestrictedMode = isWalletRestrictedMode();

    try {
        const response = await apiRequest(`/withdrawal/cancel/${encodeURIComponent(withdrawalId)}`, {
            method: "POST"
        });

        const successMessage = response.message || "Withdrawal cancelled successfully.";
        showWalletAlert(successMessage, "success");
        await loadWalletData();
        if (wasRestrictedMode || isWalletRestrictedMode()) {
            showWalletAlert(successMessage, "success");
        } else {
            await refreshWalletBalanceOnly();
        }
    } catch (error) {
        showWalletAlert(getErrorMessage(error, "Unable to cancel withdrawal request."), "error");
    }
}

function startWalletAutoRefresh() {
    if (WALLET_STATE.autoRefreshTimer) {
        clearInterval(WALLET_STATE.autoRefreshTimer);
    }

    if (WALLET_STATE.balanceRefreshTimer) {
        clearInterval(WALLET_STATE.balanceRefreshTimer);
    }

    WALLET_STATE.balanceRefreshTimer = setInterval(() => {
        if (document.hidden || WALLET_STATE.loading) {
            return;
        }

        refreshWalletBalanceOnly();
    }, 3000);

    WALLET_STATE.autoRefreshTimer = setInterval(() => {
        if (document.hidden || WALLET_STATE.loading || !isLoggedIn()) {
            return;
        }

        loadWalletData({ silent: true });
    }, 1000);

    if (!WALLET_STATE.walletSyncEventsBound) {
        WALLET_STATE.walletSyncEventsBound = true;

        window.addEventListener("focus", () => {
            forceWalletSync({ silent: true });
        });

        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                forceWalletSync({ silent: true });
            }
        });

        window.addEventListener("traidiumx:wallet-sync", () => {
            forceWalletSync({ silent: true });
        });
    }
}

async function handleUnifiedWalletTransferSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form) {
        showWalletActionMessage("Wallet transfer form is not ready. Please refresh and try again.", "error");
        return;
    }

    if (!isLoggedIn()) {
        showWalletActionMessage("Please login first.", "error");
        return;
    }

    if (isWalletRestrictedMode()) {
        showWalletActionMessage("Wallet transfer is disabled while account is restricted.", "error");
        return;
    }

    const formData = new FormData(form);
    const direction = String(formData.get("direction") || "main_to_trading").trim();
    const amount = walletNumber(formData.get("amount"), 0);

    if (!amount || amount <= 0) {
        showWalletActionMessage("Please enter a valid transfer amount.", "error");
        return;
    }

    if (!["main_to_trading", "trading_to_main"].includes(direction)) {
        showWalletActionMessage("Please select a valid transfer direction.", "error");
        return;
    }

    try {
        walletSetButtonLoading(walletElements.unifiedTransferBtn, true);
        const currency = localStorage.getItem("tx_navbar_currency") || "USDT";
        const activeSubId = localStorage.getItem("traidiumx_active_user_id");
        let response;
        if (activeSubId) {
            const mappedDirection = direction === "main_to_trading" ? "main_to_sub" : "sub_to_main";
            response = await apiRequest("/wallet/transfer-sub", {
                method: "POST",
                body: JSON.stringify({
                    amount: amount,
                    direction: mappedDirection,
                    sub_user_id: activeSubId,
                    currency: currency
                })
            });
        } else {
            response = await apiRequest("/wallet/transfer", {
                method: "POST",
                body: JSON.stringify({ amount, direction, currency })
            });
        }

        form.reset();
        WALLET_STATE.wallet = response.data?.wallet || WALLET_STATE.wallet;
        await loadWalletData({ silent: true });
        await refreshWalletBalanceOnly();
        showWalletAlert(response.message || "Wallet transfer completed successfully.", "success");
        closeWalletActionModal();
    } catch (error) {
        showWalletActionMessage(getErrorMessage(error, "Wallet transfer failed."), "error");
    } finally {
        walletSetButtonLoading(walletElements.unifiedTransferBtn, false);
    }
}

async function handleWalletTransferSubmit(event, direction) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form) {
        showWalletAlert("Wallet transfer form is not ready. Please refresh and try again.", "error");
        return;
    }

    if (!isLoggedIn()) {
        showWalletAlert("Please login first.", "error");
        return;
    }

    if (isWalletRestrictedMode()) {
        showWalletAlert("Wallet transfer is disabled while account is restricted.", "error");
        return;
    }

    const formData = new FormData(form);
    const amount = walletNumber(formData.get("amount"), 0);
    if (!amount || amount <= 0) {
        showWalletAlert("Please enter a valid transfer amount.", "error");
        return;
    }

    const isMainToTrading = direction === "main_to_trading";
    const confirmed = await showWalletConfirm({
        title: isMainToTrading ? "Transfer to Trading Wallet" : "Transfer to Main Wallet",
        message: isMainToTrading
            ? "This moves funds from Main Wallet into Trading Wallet. Trades use Trading Wallet only."
            : "This moves free funds from Trading Wallet back to Main Wallet for withdrawal.",
        details: [
            { label: "Amount", value: formatWalletMoney(amount, "USDT") },
            { label: "Direction", value: isMainToTrading ? "Main → Trading" : "Trading → Main" }
        ],
        confirmText: "Confirm Transfer"
    });

    if (!confirmed) return;

    const button = isMainToTrading ? walletElements.mainToTradingBtn : walletElements.tradingToMainBtn;
    try {
        setDemoButtonLoading(button, true);
        const currency = localStorage.getItem("tx_navbar_currency") || "USDT";
        const activeSubId = localStorage.getItem("traidiumx_active_user_id");
        let response;
        if (activeSubId) {
            const mappedDirection = direction === "main_to_trading" ? "main_to_sub" : "sub_to_main";
            response = await apiRequest("/wallet/transfer-sub", {
                method: "POST",
                body: JSON.stringify({
                    amount: amount,
                    direction: mappedDirection,
                    sub_user_id: activeSubId,
                    currency: currency
                })
            });
        } else {
            response = await apiRequest("/wallet/transfer", {
                method: "POST",
                body: JSON.stringify({ amount, direction, currency })
            });
        }

        form.reset();
        WALLET_STATE.wallet = response.data?.wallet || WALLET_STATE.wallet;
        showWalletAlert(response.message || "Wallet transfer completed successfully.", "success");
        await loadWalletData({ silent: true });
    } catch (error) {
        showWalletAlert(getErrorMessage(error, "Wallet transfer failed."), "error");
    } finally {
        setDemoButtonLoading(button, false);
    }
}

async function updateLiveUsdtRate() {
    try {
        const response = await getOptionalApi("/wallet/usdt-rate", { usdt_rate: 88.50 });
        if (response && response.data && response.data.usdt_rate) {
            WALLET_STATE.usdtRate = Number(response.data.usdt_rate);
        } else {
            WALLET_STATE.usdtRate = 88.50;
        }
    } catch (err) {
        WALLET_STATE.usdtRate = 88.50;
    }
    const rateText = `1 USD = ₹${WALLET_STATE.usdtRate || 88.50} INR`;
    const depBadge = document.getElementById("txDepositUsdtRateText");
    if (depBadge) depBadge.textContent = rateText;
    const withBadge = document.getElementById("txWithdrawUsdtRateText");
    if (withBadge) withBadge.textContent = rateText;
    const trfBadge = document.getElementById("txTransferUsdtRateText");
    if (trfBadge) trfBadge.textContent = rateText;
}

function bindRealtimeConversionCalculator() {
    const depInput = document.getElementById("depositAmount");
    const youDepEl = document.getElementById("depCalcYouDeposit");
    const walletCreditEl = document.getElementById("depCalcWalletCredit");
    const rateNoteEl = document.getElementById("depCalcRateNote");

    if (depInput) {
        const updateDep = () => {
            const val = parseFloat(depInput.value || 0);
            const rate = WALLET_STATE.usdtRate || 88.50;
            const activeCurrency = (WALLET_STATE.activeDepositCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
            const isINR = activeCurrency === "INR";

            if (isINR) {
                if (youDepEl) youDepEl.textContent = val > 0 ? `₹${val.toLocaleString()}` : "₹0.00";
                if (walletCreditEl) {
                    if (val > 0) {
                        const usdtEq = (val / rate).toFixed(4);
                        walletCreditEl.innerHTML = `₹${val.toLocaleString()} INR <span class="text-xs font-normal text-slate-400">(≈ ${usdtEq} USD)</span>`;
                    } else {
                        walletCreditEl.textContent = "₹0.00 INR";
                    }
                }
                if (rateNoteEl) rateNoteEl.textContent = `Min ₹100 · $1 = ₹${rate.toFixed(2)}`;
            } else if (activeCurrency === "USDT") {
                if (youDepEl) youDepEl.textContent = val > 0 ? `$${val.toFixed(2)}` : "$0.00";
                if (walletCreditEl) walletCreditEl.textContent = val > 0 ? `$${val.toFixed(2)} USD` : "$0.00 USD";
                const minUsdt = WALLET_STATE.cryptoDeposit.minAmount || 10;
                const minInr = (minUsdt * rate).toFixed(0);
                if (rateNoteEl) rateNoteEl.textContent = `Min $${minUsdt} / ₹${minInr} · $1 = ₹${rate.toFixed(2)}`;
            } else {
                const getAssetPrice = (code) => {
                    if (code === "USDT" || code === "USDC") return 1.0;
                    if (code === "INR") return 1.0 / rate;
                    const board = WALLET_STATE.board || [];
                    const symbol = `${code}USDT`;
                    const item = board.find(b => b.symbol === symbol || b.ui_symbol === symbol);
                    return item ? parseFloat(item.price || item.last_price || 0) : 0.0;
                };

                const assetPrice = getAssetPrice(activeCurrency);
                if (youDepEl) {
                    if (val > 0 && assetPrice > 0) {
                        const usdEq = (val * assetPrice).toFixed(2);
                        youDepEl.innerHTML = `${val.toFixed(4)} ${activeCurrency} <span class="text-xs font-normal text-slate-400">(≈ $${usdEq} USD)</span>`;
                    } else if (val > 0) {
                        youDepEl.textContent = `${val.toFixed(4)} ${activeCurrency}`;
                    } else {
                        youDepEl.textContent = `0.0000 ${activeCurrency}`;
                    }
                }
                if (walletCreditEl) {
                    if (val > 0 && assetPrice > 0) {
                        const usdEq = (val * assetPrice).toFixed(2);
                        walletCreditEl.innerHTML = `${val.toFixed(4)} ${activeCurrency} <span class="text-xs font-normal text-slate-400">(≈ $${usdEq} USD)</span>`;
                    } else {
                        walletCreditEl.textContent = `${val > 0 ? val.toFixed(4) : "0.0000"} ${activeCurrency}`;
                    }
                }
                const minUsdt = WALLET_STATE.cryptoDeposit.minAmount || 10;
                const minCoin = assetPrice > 0 ? (minUsdt / assetPrice).toFixed(4) : "0.00";
                if (rateNoteEl) {
                    if (assetPrice > 0) {
                        rateNoteEl.textContent = `Min $${minUsdt} value (≈ ${minCoin} ${activeCurrency}) · 1 ${activeCurrency} ≈ $${assetPrice.toFixed(2)}`;
                    } else {
                        rateNoteEl.textContent = `Min $${minUsdt} value`;
                    }
                }
            }
        };
        depInput.addEventListener("input", updateDep);
        depInput.addEventListener("keyup", updateDep);
        updateDep();
    }

    const withInput = document.getElementById("withdrawAmount");
    const withPrev = document.getElementById("withdrawConversionPreview");
    if (withInput && withPrev) {
        const updateWith = () => {
            const val = parseFloat(withInput.value || 0);
            const rate = WALLET_STATE.usdtRate || 88.50;
            const activeCurrency = WALLET_STATE.activeWithdrawalCurrency || localStorage.getItem("tx_navbar_currency") || "USDT";
            const isINR = String(activeCurrency).toUpperCase() === "INR";
            if (val > 0) {
                if (isINR) {
                    withPrev.innerHTML = `₹${val.toLocaleString()} INR → net payout ≈ <span class="text-white font-extrabold text-sm">₹${val.toLocaleString()} INR</span>`;
                } else {
                    withPrev.innerHTML = `$${val} USD → net payout <span class="text-white font-extrabold text-sm">$${val} USD</span>`;
                }
            } else {
                withPrev.innerHTML = `Enter withdrawal amount to see live calculation`;
            }
        };
        withInput.addEventListener("input", updateWith);
        withInput.addEventListener("keyup", updateWith);
        updateWith();
    }

    const trfInput = document.getElementById("walletTransferAmount");
    const trfDir = document.getElementById("walletTransferDirection");
    const trfPrev = document.getElementById("transferConversionPreview");
    const trfLabel = document.getElementById("walletTransferAmountLabel");

    if (trfInput && trfPrev) {
        const updateTrf = () => {
            const val = parseFloat(trfInput.value || 0);
            const rate = WALLET_STATE.usdtRate || 88.50;
            const dir = trfDir?.value || "main_to_trading";
            const selectedCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
            const isINR = selectedCurrency === "INR";

            if (trfLabel) {
                trfLabel.textContent = (dir === "main_to_trading" && isINR) ? "Amount (INR / ₹)" : "Amount (USD / $)";
            }
            if (val > 0) {
                if (dir === "main_to_trading") {
                    if (isINR) {
                        const usdtEq = (val / rate).toFixed(4);
                        trfPrev.innerHTML = `₹${val.toLocaleString()} INR Main Wallet → <span class="text-white font-extrabold text-sm">${usdtEq} USD</span> Trading Wallet`;
                    } else {
                        trfPrev.innerHTML = `$${val} USD Main Wallet → <span class="text-white font-extrabold text-sm">$${val} USD</span> Trading Wallet`;
                    }
                } else {
                    if (isINR) {
                        const inrEq = (val * rate).toFixed(2);
                        trfPrev.innerHTML = `${val} USD Trading Wallet → <span class="text-white font-extrabold text-sm">₹${Number(inrEq).toLocaleString()} INR</span> Main Wallet`;
                    } else {
                        trfPrev.innerHTML = `$${val} USD Trading Wallet → <span class="text-white font-extrabold text-sm">$${val} USD</span> Main Wallet`;
                    }
                }
            } else {
                trfPrev.innerHTML = `Enter amount to see live conversion`;
            }
        };
        trfInput.addEventListener("input", updateTrf);
        trfInput.addEventListener("keyup", updateTrf);
        trfDir?.addEventListener("change", updateTrf);
        updateTrf();
    }
}

async function loadInrDepositDetails() {
    try {
        const response = await getOptionalApi("/deposit/inr-details", {});
        if (response && response.data) {
            const d = response.data;
            const upiEl = document.getElementById("inrUpiId");
            const accEl = document.getElementById("inrAccountName");
            const bankEl = document.getElementById("inrBankDetails");
            const ifscEl = document.getElementById("inrIfscCode");
            if (upiEl) upiEl.textContent = d.upi_id || "traidiumx@upi";
            if (accEl) accEl.textContent = d.account_name || "TraidiumX Trading Services Ltd";
            if (bankEl) bankEl.textContent = `${d.bank_name || 'HDFC Bank'} • ${d.account_number || '50100498765432'}`;
            if (ifscEl) ifscEl.textContent = d.ifsc_code || "HDFC0000128";
        }
    } catch (e) {
        console.warn("INR deposit details load failed:", e);
    }
}

function copyInrUpiIdToClipboard() {
    const upiElement = document.getElementById("inrUpiId");
    const upiText = upiElement ? upiElement.textContent.trim() : "traidiumx@upi";
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(upiText).then(() => {
            showWalletAlert(`UPI ID (${upiText}) copied to clipboard!`, "success");
        }).catch(() => {
            fallbackCopy(upiText);
        });
    } else {
        fallbackCopy(upiText);
    }
}

function fallbackCopy(text) {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    try {
        document.execCommand("copy");
        showWalletAlert(`UPI ID (${text}) copied to clipboard!`, "success");
    } catch (e) {
        showWalletAlert("Copy failed. Please copy manually.", "error");
    }
    document.body.removeChild(el);
}

function updateDepositModalUIByCurrency(currency) {
    const activeCurrency = String(currency || WALLET_STATE.activeDepositCurrency || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    WALLET_STATE.activeDepositCurrency = activeCurrency;
    const isINR = activeCurrency === "INR";
    const isLocked = !["USDT", "INR"].includes(activeCurrency);

    const inrBox = document.getElementById("inrDepositBox");
    const cryptoBox = document.getElementById("cryptoDepositBox");
    const amountLabel = document.getElementById("depositAmountLabel");
    const depositAmountInput = document.getElementById("depositAmount");
    const txDepositSubtitle = document.getElementById("txDepositSubtitle");
    const toggleBar = document.getElementById("txDepositCurrencyToggleBar");
    const btnInr = document.getElementById("txSelectInrBtn");
    const btnUsdt = document.getElementById("txSelectUsdtBtn");
    const submitBtn = document.getElementById("createDepositBtn");
    const footerSubtext = document.getElementById("txDepositFooterSubtext");
    const cryptoAssetInput = document.getElementById("cryptoAsset");

    if (inrBox) inrBox.classList.toggle("hidden", !isINR);
    if (cryptoBox) cryptoBox.classList.toggle("hidden", isINR);
    if (cryptoAssetInput) cryptoAssetInput.value = activeCurrency;

    if (amountLabel) amountLabel.textContent = isINR ? "Amount (INR)" : `Amount (${activeCurrency})`;
    if (depositAmountInput) {
        if (isINR) {
            depositAmountInput.min = "10";
            depositAmountInput.placeholder = "Minimum ₹10";
        } else {
            depositAmountInput.min = String(WALLET_STATE.cryptoDeposit.minAmount || 10);
            depositAmountInput.placeholder = `Minimum ${WALLET_STATE.cryptoDeposit.minAmount || 10} ${activeCurrency}`;
        }
    }

    if (txDepositSubtitle) {
        txDepositSubtitle.textContent = isINR
            ? "Pay instantly via UPI, GPay, PhonePe, Cards, Netbanking or Wallet using Razorpay Payment Gateway. Your wallet credits automatically."
            : `Copy the ${activeCurrency} address, send from your wallet, then enter the amount and submit. Funds credit to Main Wallet.`;
    }

    if (submitBtn) {
        submitBtn.textContent = isINR ? "Deposit INR" : `Deposit ${activeCurrency}`;
    }

    if (footerSubtext) {
        footerSubtext.textContent = isINR
            ? "Wallet credits automatically after payment completion."
            : `Send ${activeCurrency} to the address above. Balance credits on submit.`;
    }

    if (toggleBar) toggleBar.classList.toggle("hidden", isLocked);

    const activeTabClass = "flex items-center justify-center rounded-xl py-2.5 text-xs font-black transition bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20";
    const inactiveTabClass = "flex items-center justify-center rounded-xl py-2.5 text-xs font-black transition bg-transparent text-slate-400 hover:text-white";

    if (btnInr && btnUsdt) {
        if (isINR) {
            btnInr.className = activeTabClass;
            btnUsdt.className = inactiveTabClass;
        } else {
            btnUsdt.className = activeTabClass;
            btnInr.className = inactiveTabClass;
        }
    }

    const depInput = document.getElementById("depositAmount");
    if (depInput) depInput.dispatchEvent(new Event("input"));
    updateWalletActionModalBalances();
}

async function checkAndShowCurrencyLockModal() {
    if (!WALLET_STATE.wallet) return;
    const selectedCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
    updateDepositModalUIByCurrency(WALLET_STATE.activeDepositCurrency || selectedCurrency);
}

function updateWithdrawalModalUIByCurrency(currency, isModal = false) {
    const prefix = isModal ? "modal" : "main";
    const activeCurrency = String(currency || (isModal ? WALLET_STATE.activeWithdrawalCurrency : localStorage.getItem("tx_navbar_currency")) || "USDT").toUpperCase();
    
    if (isModal) {
        WALLET_STATE.activeWithdrawalCurrency = activeCurrency;
    } else {
        updateMainWithdrawalPageBalanceDisplay(activeCurrency);
    }

    const isINR = activeCurrency === "INR";
    const isUSDT = activeCurrency === "USDT";
    const requiresTag = activeCurrency === "XRP";
    const isCryptoSpecific = !["USDT", "INR"].includes(activeCurrency);

    const netBox = document.getElementById(`${prefix}WithdrawNetworkBox`);
    const tagBox = document.getElementById(`${prefix}WithdrawTagBox`);
    const toggleBar = document.getElementById(`${prefix}WithdrawCurrencyToggleBar`);

    const subTitle = document.getElementById(`${prefix}WithdrawSubtitle`);
    const amountLabel = document.getElementById(`${prefix}WithdrawAmountLabel`);
    const addressLabel = document.getElementById(`${prefix}WithdrawalAddressLabel`);
    const addressInput = document.getElementById(`${prefix}WithdrawalAddress`);
    const methodInput = document.getElementById(`${prefix}WithdrawMethodInput`);
    const assetInput = document.getElementById(`${prefix}WithdrawAsset`);
    const btnInr = document.getElementById(`${prefix}SelectWithdrawInrBtn`);
    const btnUsdt = document.getElementById(`${prefix}SelectWithdrawUsdtBtn`);

    const cryptoBox = document.getElementById(isModal ? "txWithdrawCryptoAddressBox" : "txWithdrawCryptoAddressBox") ? (isModal ? document.querySelector("#modalWithdrawalForm #txWithdrawCryptoAddressBox") : document.getElementById("mainWithdrawCryptoAddressBox")) : document.getElementById(`${prefix}WithdrawCryptoAddressBox`);
    const bankBox = document.getElementById(isModal ? "txWithdrawInrBankBox" : "txWithdrawInrBankBox") ? (isModal ? document.querySelector("#modalWithdrawalForm #txWithdrawInrBankBox") : document.getElementById("mainWithdrawInrBankBox")) : document.getElementById(`${prefix}WithdrawInrBankBox`);

    if (cryptoBox) cryptoBox.classList.toggle("hidden", isINR);
    if (bankBox) bankBox.classList.toggle("hidden", !isINR);

    if (addressInput) {
        addressInput.required = !isINR;
    }

    const holderInput = document.getElementById(`${prefix}WithdrawHolderName`);
    const bankNameInput = document.getElementById(`${prefix}WithdrawBankName`);
    const accNumInput = document.getElementById(`${prefix}WithdrawAccountNumber`);
    const ifscInput = document.getElementById(`${prefix}WithdrawIfscCode`);

    if (holderInput) holderInput.required = isINR;
    if (bankNameInput) bankNameInput.required = isINR;
    if (accNumInput) accNumInput.required = isINR;
    if (ifscInput) ifscInput.required = isINR;

    if (netBox) netBox.classList.toggle("hidden", !["USDT", "BTC", "BNB", "SOL", "XRP", "ADA"].includes(activeCurrency));
    
    const netSelect = document.getElementById(`${prefix}WithdrawNetwork`);
    if (netSelect) {
        const currentVal = netSelect.value;
        netSelect.innerHTML = "";
        if (activeCurrency === "USDT") {
            netSelect.innerHTML = `
                <option value="TRC20">TRON (TRC20)</option>
                <option value="BEP20">BNB Smart Chain (BEP20)</option>
                <option value="ERC20">Ethereum (ERC20)</option>
            `;
            if (["TRC20", "BEP20", "ERC20"].includes(currentVal)) {
                netSelect.value = currentVal;
            } else {
                netSelect.value = "TRC20";
            }
        } else if (activeCurrency === "BTC") {
            netSelect.innerHTML = `
                <option value="BITCOIN">BTC Mainnet (Bitcoin)</option>
                <option value="ERC20">BTC ERC20 / Sepolia Token (MetaMask)</option>
            `;
            if (["BITCOIN", "ERC20"].includes(currentVal)) {
                netSelect.value = currentVal;
            } else {
                netSelect.value = "BITCOIN";
            }
        } else if (["SOL", "XRP", "ADA", "BNB"].includes(activeCurrency)) {
            const labelMap = {
                "SOL": { native: "SOLANA", nativeLabel: "Solana Network", erc20Label: "SOL ERC20 / Sepolia Token (MetaMask)" },
                "XRP": { native: "RIPPLE", nativeLabel: "Ripple Network", erc20Label: "XRP ERC20 / Sepolia Token (MetaMask)" },
                "ADA": { native: "CARDANO", nativeLabel: "Cardano Network", erc20Label: "ADA ERC20 / Sepolia Token (MetaMask)" },
                "BNB": { native: "BEP20", nativeLabel: "Binance Smart Chain", erc20Label: "BNB ERC20 / Sepolia Token (MetaMask)" }
            };
            const coinConfig = labelMap[activeCurrency];
            netSelect.innerHTML = `
                <option value="${coinConfig.native}">${coinConfig.nativeLabel}</option>
                <option value="ERC20">${coinConfig.erc20Label}</option>
            `;
            if ([coinConfig.native, "ERC20"].includes(currentVal)) {
                netSelect.value = currentVal;
            } else {
                netSelect.value = coinConfig.native;
            }
        } else {
            const nativeNetworks = {
                "ETH": { value: "ERC20", label: "Ethereum Network" },
                "USDC": { value: "ERC20", label: "Ethereum Network" }
            };
            const config = nativeNetworks[activeCurrency] || { value: "ERC20", label: "Ethereum Network" };
            netSelect.innerHTML = `<option value="${config.value}">${config.label}</option>`;
            netSelect.value = config.value;
        }
    }

    if (tagBox) tagBox.classList.toggle("hidden", !requiresTag);
    if (toggleBar) toggleBar.classList.toggle("hidden", isCryptoSpecific);

    if (methodInput) methodInput.value = isINR ? "inr_withdrawal" : "crypto_withdrawal";
    if (assetInput) assetInput.value = activeCurrency;

    if (subTitle) {
        subTitle.textContent = isINR
            ? "Submit your Bank Details for INR withdrawal payout after Admin approval."
            : `Submit your external crypto wallet address for ${activeCurrency} payout after Admin approval.`;
    }

    if (amountLabel) amountLabel.textContent = isINR ? "Amount (INR)" : `Amount (${activeCurrency})`;

    if (addressInput && !isINR) {
        addressInput.placeholder = `${activeCurrency} wallet address (must be correct network)`;
    }

    const activeTabClass = "flex items-center justify-center rounded-xl py-2.5 text-xs font-black transition bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20";
    const inactiveTabClass = "flex items-center justify-center rounded-xl py-2.5 text-xs font-black transition bg-transparent text-slate-400 hover:text-white";

    if (btnInr && btnUsdt) {
        if (isINR) {
            btnInr.className = activeTabClass;
            btnUsdt.className = inactiveTabClass;
        } else {
            btnUsdt.className = activeTabClass;
            btnInr.className = inactiveTabClass;
        }
    }

    const withInput = document.getElementById(`${prefix}WithdrawAmount`);
    if (withInput) {
        if (isINR || activeCurrency === "USDT") {
            withInput.setAttribute("min", "10");
        } else {
            withInput.setAttribute("min", "0.00000001");
        }
        withInput.dispatchEvent(new Event("input"));
    }
    updateWalletActionModalBalances();

    // Dynamically update the FAQ items for the active currency
    updateWalletFaqUI(activeCurrency);
}

function updateMainWithdrawalPageBalanceDisplay(currencyParam = null) {
    const wallet = WALLET_STATE.wallet || {};
    const currency = String(currencyParam || localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const balanceEl = document.getElementById("mainWithdrawalPageBalance");
    if (balanceEl) {
        let balance = 0;
        const key = `main_wallet_${currency.toLowerCase()}`;
        if (wallet[key]) {
            balance = wallet[key].available_balance ?? 0;
        } else if (currency === "INR") {
            balance = wallet.main_wallet_inr?.available_balance ?? 0;
        } else {
            balance = wallet.main_wallet_usdt?.available_balance ?? 0;
        }

        if (["INR", "USDT"].includes(currency)) {
            if (currency === "INR") {
                balanceEl.textContent = `₹${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            } else {
                balanceEl.textContent = `$${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            }
        } else {
            balanceEl.textContent = `${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currency}`;
        }
    }
}

function updateWalletFaqUI(currency) {
    const activeCurrency = String(currency || WALLET_STATE.activeWithdrawalCurrency || "USDT").toUpperCase();
    const isINR = activeCurrency === "INR";
    
    const faqs = isINR ? [
        {
            q: "How to withdraw INR?",
            a: "Go to the Wallet tab, select Withdraw, choose the ₹ INR tab, enter the amount you want to withdraw, provide your Bank Account details (Holder name, Bank name, Account number, IFSC code) or UPI ID, and click Submit. Your request will be processed immediately after Admin approval."
        },
        {
            q: "How long does it take to withdraw INR?",
            a: "INR withdrawals are processed via standard IMPS or NEFT bank transfers. Payouts are usually settled within 10 to 30 minutes after approval by the TraidiumX security team."
        },
        {
            q: "What are INR withdrawal limits?",
            a: "The minimum withdrawal limit for INR is ₹500 INR per transaction. The maximum daily limit is ₹5,00,000 INR for fully verified accounts."
        },
        {
            q: "What are INR withdrawal fees?",
            a: "INR withdrawals via bank transfer and UPI are 100% free. TraidiumX does not charge any service fees for fiat withdrawals."
        }
    ] : [
        {
            q: "How to withdraw Crypto?",
            a: "Go to the Wallet tab, select Withdraw, choose the $ USD / Crypto tab, enter the amount in USD, choose the withdrawal network (TRC20, BEP20, or ERC20), enter your external wallet address, and click Submit. Make sure the network matches your destination address."
        },
        {
            q: "How long does it take to withdraw Crypto?",
            a: "Crypto withdrawals are automated. Once approved by our team, transaction processing takes 1 to 5 minutes depending on blockchain confirmation times and network congestion."
        },
        {
            q: "What are Crypto withdrawal limits?",
            a: "The minimum withdrawal limit is $10 USD. There is no maximum withdrawal limit for users who have completed KYC verification."
        },
        {
            q: "What are Crypto withdrawal fees?",
            a: "Withdrawal fees depend on the chosen network: TRC20 is $1.00 USD, BEP20 is $0.80 USD, and ERC20 is $5.00 USD. These fees cover blockchain network gas costs."
        }
    ];

    const accordion = document.getElementById("txFaqAccordion");
    if (!accordion) return;

    accordion.innerHTML = faqs.map((faq, idx) => `
        <div class="border-b border-white/5 pb-2.5 last:border-0 last:pb-0">
            <button type="button" class="w-full flex items-center justify-between text-left hover:text-white cursor-pointer transition font-bold py-1.5 focus:outline-none" onclick="toggleWalletFaqAnswer(${idx})">
                <span>${faq.q}</span>
                <span id="faqArrow_${idx}" class="text-slate-500 text-xs transition-transform duration-200">›</span>
            </button>
            <div id="faqAns_${idx}" class="max-h-0 overflow-hidden transition-all duration-300 ease-out text-slate-400 font-semibold text-[11px] leading-relaxed mt-1">
                <p class="pb-1">${faq.a}</p>
            </div>
        </div>
    `).join("");
}

window.toggleWalletFaqAnswer = function(idx) {
    const ans = document.getElementById(`faqAns_${idx}`);
    const arrow = document.getElementById(`faqArrow_${idx}`);
    if (!ans || !arrow) return;

    const isOpen = ans.style.maxHeight && ans.style.maxHeight !== "0px";
    
    // Close all other answers (accordion effect)
    for (let i = 0; i < 4; i++) {
        const otherAns = document.getElementById(`faqAns_${i}`);
        const otherArrow = document.getElementById(`faqArrow_${i}`);
        if (otherAns && otherAns !== ans) {
            otherAns.style.maxHeight = "0px";
        }
        if (otherArrow && otherArrow !== arrow) {
            otherArrow.style.transform = "rotate(0deg)";
        }
    }

    if (isOpen) {
        ans.style.maxHeight = "0px";
        arrow.style.transform = "rotate(0deg)";
    } else {
        ans.style.maxHeight = ans.scrollHeight + "px";
        arrow.style.transform = "rotate(90deg)";
    }
};

function initWalletEvents() {
    injectWalletPageStyles();

    window.addEventListener("traidiumx:currency-change", (event) => {
        renderWalletPage();
        updateWithdrawalModalUIByCurrency();
        bindRealtimeConversionCalculator();
    });

    walletElements.refreshBtn?.addEventListener("click", (event) => {
        event.preventDefault();
        loadWalletData();
    });

    document.getElementById("copyInrUpiBtn")?.addEventListener("click", copyInrUpiIdToClipboard);

    document.getElementById("txTransferMaxBtn")?.addEventListener("click", () => {
        const dir = document.getElementById("walletTransferDirection")?.value || "main_to_trading";
        const mainWallet = getMainWalletData();
        const tradingWallet = getTradingWalletData();
        const amountInput = document.getElementById("walletTransferAmount");

        if (amountInput) {
            if (dir === "main_to_trading") {
                amountInput.value = walletNumber(mainWallet.available_balance, 0);
            } else {
                amountInput.value = walletNumber(tradingWallet.available_balance, 0);
            }
            amountInput.dispatchEvent(new Event("input"));
        }
    });

    document.getElementById("txSelectInrBtn")?.addEventListener("click", () => {
        updateDepositModalUIByCurrency("INR");
    });
    document.getElementById("txSelectUsdtBtn")?.addEventListener("click", () => {
        updateDepositModalUIByCurrency("USDT");
    });

    // Main page withdrawal toggles
    document.getElementById("mainSelectWithdrawInrBtn")?.addEventListener("click", () => {
        updateWithdrawalModalUIByCurrency("INR", false);
        txAutofillWithdrawBankDetails(false);
    });
    document.getElementById("mainSelectWithdrawUsdtBtn")?.addEventListener("click", () => {
        updateWithdrawalModalUIByCurrency("USDT", false);
    });

    // Modal page withdrawal toggles
    document.getElementById("modalSelectWithdrawInrBtn")?.addEventListener("click", () => {
        updateWithdrawalModalUIByCurrency("INR", true);
        txAutofillWithdrawBankDetails(true);
    });
    document.getElementById("modalSelectWithdrawUsdtBtn")?.addEventListener("click", () => {
        updateWithdrawalModalUIByCurrency("USDT", true);
    });

    walletElements.openTransferBtn?.addEventListener("click", () => {
        checkAndShowCurrencyLockModal();
        openWalletActionModal("transfer");
    });
    walletElements.openDepositBtn?.addEventListener("click", () => {
        WALLET_STATE.activeDepositCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
        checkAndShowCurrencyLockModal();
        loadInrDepositDetails();
        openWalletActionModal("deposit");
    });

    walletElements.openWithdrawBtn?.addEventListener("click", () => {
        WALLET_STATE.activeWithdrawalCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
        checkAndShowCurrencyLockModal();
        updateWithdrawalModalUIByCurrency(WALLET_STATE.activeWithdrawalCurrency, true);
        openWalletActionModal("withdraw");
        // Autofill saved primary bank account from profile
        txAutofillWithdrawBankDetails(true);
    });
    walletElements.actionModalClose?.addEventListener("click", closeWalletActionModal);
    walletElements.actionBackdrop?.addEventListener("click", closeWalletActionModal);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isWalletActionModalOpen()) {
            closeWalletActionModal();
        }
    });

    walletElements.unifiedTransferForm?.addEventListener("submit", handleUnifiedWalletTransferSubmit);

    walletElements.internalTransferForm?.addEventListener("submit", handleInternalTransferSubmit);
    walletElements.internalTransferAsset?.addEventListener("change", updateInternalTransferBalance);
    document.getElementById("txInternalTransferMaxBtn")?.addEventListener("click", () => {
        const wallet = WALLET_STATE.wallet || {};
        const asset = walletElements.internalTransferAsset?.value || "USDT";
        const assetWallet = wallet[`main_wallet_${asset.toLowerCase()}`] || { available_balance: 0 };
        if (walletElements.internalTransferAmount) {
            walletElements.internalTransferAmount.value = walletNumber(assetWallet.available_balance, 0);
        }
    });

    // Exchange Form event bindings
    const exchangeForm = document.getElementById("walletExchangeForm");
    exchangeForm?.addEventListener("submit", handleExchangeSubmit);

    document.getElementById("walletExchangeFromAsset")?.addEventListener("change", () => {
        updateExchangePreview();
        updateWalletActionModalBalances();
    });
    document.getElementById("walletExchangeToAsset")?.addEventListener("change", () => {
        updateExchangePreview();
        updateWalletActionModalBalances();
    });
    document.getElementById("walletExchangeAmount")?.addEventListener("input", updateExchangePreview);
    document.getElementById("txExchangeMaxBtn")?.addEventListener("click", () => {
        const fromAsset = document.getElementById("walletExchangeFromAsset")?.value;
        if (!fromAsset) return;
        const wallet = WALLET_STATE.wallet || {};
        const fromBucket = wallet[`main_wallet_${fromAsset.toLowerCase()}`];
        const avail = walletNumber(fromBucket?.available_balance, 0);
        const amountInput = document.getElementById("walletExchangeAmount");
        if (amountInput) {
            amountInput.value = avail;
            updateExchangePreview();
        }
    });
    walletElements.demoDepositForm?.addEventListener("submit", handleDemoDepositSubmit);
    walletElements.demoWithdrawForm?.addEventListener("submit", handleDemoWithdrawSubmit);
    walletElements.mainToTradingForm?.addEventListener("submit", (event) => handleWalletTransferSubmit(event, "main_to_trading"));
    walletElements.tradingToMainForm?.addEventListener("submit", (event) => handleWalletTransferSubmit(event, "trading_to_main"));
    walletElements.demoCreditForm?.addEventListener("submit", handleDemoCreditSubmit);
    walletElements.depositForm?.addEventListener("submit", handleDepositSubmit);
    document.getElementById("mainWithdrawalForm")?.addEventListener("submit", handleWithdrawalSubmit);
    document.getElementById("modalWithdrawalForm")?.addEventListener("submit", handleWithdrawalSubmit);

    walletElements.cryptoNetwork?.addEventListener("change", () => {
        WALLET_STATE.cryptoDeposit.selectedNetwork = getSelectedCryptoNetwork();
        updateCryptoDepositAddressUI();
    });

    walletElements.copyCryptoAddressBtn?.addEventListener("click", copyCryptoDepositAddress);
    walletElements.payWithMetaMaskBtn?.addEventListener("click", handleMetaMaskPayment);

    sanitizePositiveAmountInput(walletElements.demoDepositAmount || walletElements.demoCreditAmount, 6);
    sanitizePositiveAmountInput(walletElements.demoWithdrawAmount, 6);
    sanitizePositiveAmountInput(walletElements.mainToTradingAmount, 6);
    sanitizePositiveAmountInput(walletElements.tradingToMainAmount, 6);
    sanitizePositiveAmountInput(walletElements.unifiedTransferAmount, 6);
    sanitizePositiveAmountInput(walletElements.depositAmount, 6);

    const mainWithdrawAmount = document.getElementById("mainWithdrawAmount");
    const modalWithdrawAmount = document.getElementById("modalWithdrawAmount");
    if (mainWithdrawAmount) sanitizePositiveAmountInput(mainWithdrawAmount, 6);
    if (modalWithdrawAmount) sanitizePositiveAmountInput(modalWithdrawAmount, 6);

    mainWithdrawAmount?.addEventListener("input", scheduleWithdrawalFeeEstimate);
    modalWithdrawAmount?.addEventListener("input", scheduleWithdrawalFeeEstimate);

    document.getElementById("mainWithdrawNetwork")?.addEventListener("change", () => estimateWithdrawalFee(false));
    document.getElementById("modalWithdrawNetwork")?.addEventListener("change", () => estimateWithdrawalFee(false));

    setWithdrawalFeePreview(null);

    if (walletElements.depositAddressConfirmation) {
        walletElements.depositAddressConfirmation.addEventListener("input", () => {
            walletElements.depositAddressConfirmation.value = walletElements.depositAddressConfirmation.value.replace(/\s/g, "").slice(0, 140);
        });
    }

    const mainWithdrawalAddress = document.getElementById("mainWithdrawalAddress");
    const modalWithdrawalAddress = document.getElementById("modalWithdrawalAddress");
    if (mainWithdrawalAddress) {
        mainWithdrawalAddress.addEventListener("input", () => {
            mainWithdrawalAddress.value = mainWithdrawalAddress.value.replace(/\s/g, "").slice(0, 128);
        });
    }
    if (modalWithdrawalAddress) {
        modalWithdrawalAddress.addEventListener("input", () => {
            modalWithdrawalAddress.value = modalWithdrawalAddress.value.replace(/\s/g, "").slice(0, 128);
        });
    }

    bindHistoryFilters();
    updateCryptoDepositAddressUI();
    bindRealtimeConversionCalculator();
    // Initialize ledger sub-account dropdown if parent account
    txInitLedgerSubAccountDropdown();
    initRecipientLookup();
}


function focusWalletSectionFromNavigation() {
    let target = String(window.location.hash || "").replace("#", "").toLowerCase();

    try {
        const savedTarget = sessionStorage.getItem("traidiumx_wallet_focus_action");
        if (savedTarget) {
            target = String(savedTarget).toLowerCase();
            sessionStorage.removeItem("traidiumx_wallet_focus_action");
        }
    } catch (error) {
        console.warn("Unable to read wallet focus action.", error);
    }

    if (["deposit", "withdraw", "withdrawal", "transfer", "trading", "exchange"].includes(target)) {
        window.setTimeout(() => {
            if (target === "withdrawal") {
                openWalletActionModal("withdraw");
            } else if (target === "trading") {
                openWalletActionModal("transfer");
            } else {
                openWalletActionModal(target);
            }
        }, 200);
        return;
    }

    if (target === "history") {
        closeWalletActionModal();
        const mainTabWallet = document.getElementById("mainTabWallet");
        if (mainTabWallet) mainTabWallet.click();

        const tabHistory = document.getElementById("subTabHistory");
        if (tabHistory) tabHistory.click();

        const historyEl = document.getElementById("walletSubContentHistory") || document.getElementById("walletLedgerPanel");
        if (historyEl) {
            historyEl.classList.remove("hidden");
            window.setTimeout(() => {
                historyEl.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 200);
        }
        return;
    }

    if (target === "overview" || !target) {
        closeWalletActionModal();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
    }

    const targetElement = walletElements.actionPanel;
    if (targetElement && typeof targetElement.scrollIntoView === "function") {
        window.setTimeout(() => {
            targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 200);
    }
}
window.focusWalletSectionFromNavigation = focusWalletSectionFromNavigation;
window.openWalletActionModal = openWalletActionModal;

function updateBalancePrivacyUI() {
    const hidden = isBalanceHidden();
    const eyeOpen = document.getElementById("txEyeOpenIcon");
    const eyeClosed = document.getElementById("txEyeClosedIcon");

    if (eyeOpen && eyeClosed) {
        eyeOpen.classList.toggle("hidden", hidden);
        eyeClosed.classList.toggle("hidden", !hidden);
    }

    renderWalletPage();
}

function initBalancePrivacyToggle() {
    const toggleBtn = document.getElementById("txToggleBalancePrivacy");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const currentlyHidden = isBalanceHidden();
            localStorage.setItem("tx_balance_hidden", currentlyHidden ? "0" : "1");
            updateBalancePrivacyUI();
        });
    }
    const hidden = isBalanceHidden();
    const eyeOpen = document.getElementById("txEyeOpenIcon");
    const eyeClosed = document.getElementById("txEyeClosedIcon");
    if (eyeOpen && eyeClosed) {
        eyeOpen.classList.toggle("hidden", hidden);
        eyeClosed.classList.toggle("hidden", !hidden);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    initBalancePrivacyToggle();
    // Skip loading overlay animation if switching sub-accounts
    if (localStorage.getItem("tx_skip_wallet_intro") === "1") {
        localStorage.removeItem("tx_skip_wallet_intro");
        const intro = document.getElementById("txWalletPageIntro");
        if (intro) {
            intro.style.display = "none";
            intro.remove();
        }
        document.body?.classList.remove("tx-wallet-intro-active");
    }

    initWalletEvents();
    startWalletAutoRefresh();
    scheduleWalletIntroSafety();
    updateLiveUsdtRate();
    txInitSubAccountsAndSelector();

    // Initialize custom tab and sub-tab navigation
    if (typeof txInitTabs === "function") {
        txInitTabs();
    }
    if (typeof txInitSubTabs === "function") {
        txInitSubTabs();
    }

    document.getElementById("quickDepositBtn")?.addEventListener("click", () => {
        // Open Deposit popup modal
        openWalletActionModal("deposit");
    });
    document.getElementById("quickWithdrawBtn")?.addEventListener("click", () => {
        // Switch main tab to Wallet
        const tabWallet = document.getElementById("mainTabWallet");
        if (tabWallet) {
            tabWallet.click();
            // Switch sub-tab to Withdraw
            const tabWithdraw = document.getElementById("subTabWithdraw");
            if (tabWithdraw) tabWithdraw.click();
        }
    });
    document.getElementById("quickTransferBtn")?.addEventListener("click", () => {
        openWalletActionModal("transfer");
    });
    document.getElementById("quickExchangeBtn")?.addEventListener("click", () => {
        openWalletActionModal("transfer");
    });
    document.getElementById("quickInternalTransferBtn")?.addEventListener("click", () => {
        openWalletActionModal("internal_transfer");
    });
    document.getElementById("tradingAccountTransferBtn")?.addEventListener("click", () => {
        openWalletActionModal("transfer");
    });

    // Parse query parameters for QR code direct actions
    const urlParams = new URLSearchParams(window.location.search);
    const recipient = urlParams.get("recipient");
    const asset = urlParams.get("asset");
    if (recipient && asset) {
        sessionStorage.setItem("tx_pending_internal_transfer", JSON.stringify({ recipient, asset }));
        // Clean URL to keep address bar clean
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }

    document.getElementById("assetSearchInput")?.addEventListener("input", txRenderAssetLists);
    document.getElementById("hideEmptyBalancesCheck")?.addEventListener("change", txRenderAssetLists);

    try {
        await loadWalletData();
        
        // Handle pending internal transfer if any
        const pending = sessionStorage.getItem("tx_pending_internal_transfer");
        if (pending && isLoggedIn()) {
            try {
                const { recipient, asset } = JSON.parse(pending);
                sessionStorage.removeItem("tx_pending_internal_transfer");
                setTimeout(() => {
                    openWalletActionModal("internal_transfer", asset);
                    // Select Send tab
                    const btnSend = document.getElementById("txItTabBtnSend");
                    if (btnSend) btnSend.click();
                    
                    // Populate recipient
                    const recipientInput = document.getElementById("walletInternalTransferRecipient");
                    if (recipientInput) {
                        recipientInput.value = recipient;
                        recipientInput.dispatchEvent(new Event("input"));
                    }
                }, 800);
            } catch (e) {
                console.error("Error parsing pending internal transfer", e);
            }
        }
    } finally {
        await hideWalletPageIntro();
        focusWalletSectionFromNavigation();
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// Bank Account Autofill in Withdrawal Popup
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch the user's primary bank account (via profile.js global helper or direct API)
 * and pre-fill the withdrawal address input when INR mode is active.
 */
async function txAutofillWithdrawBankDetails(isModalParam = null) {
    const isModal = isModalParam !== null ? isModalParam : isWalletActionModalOpen();
    const prefix = isModal ? "modal" : "main";
    // Only autofill for INR withdrawals
    const activeCurrency = String(
        (isModal ? WALLET_STATE.activeWithdrawalCurrency : localStorage.getItem("tx_navbar_currency")) ||
        "USDT"
    ).toUpperCase();

    if (activeCurrency !== "INR") {
        return;
    }

    try {
        let primaryAccount = null;

        // Use profile.js exposed helper if available (same-page case)
        if (typeof window.txGetPrimaryBankAccount === "function") {
            primaryAccount = await window.txGetPrimaryBankAccount();
        } else {
            // Fallback: call API directly
            const resp = await apiRequest("/user/bank-accounts");
            const accounts = resp.data?.bank_accounts || [];
            primaryAccount = accounts.find(a => a.is_primary) || accounts[0] || null;
        }

        if (!primaryAccount) return;

        // Populate elements
        const holderInput = document.getElementById(`${prefix}WithdrawHolderName`);
        const bankNameInput = document.getElementById(`${prefix}WithdrawBankName`);
        const accNumInput = document.getElementById(`${prefix}WithdrawAccountNumber`);
        const ifscInput = document.getElementById(`${prefix}WithdrawIfscCode`);
        const upiInput = document.getElementById(`${prefix}WithdrawUpiId`);

        // Don't overwrite if user already typed something in account number
        if (accNumInput && accNumInput.value && accNumInput.value.trim().length > 2) return;

        if (holderInput) holderInput.value = primaryAccount.account_holder_name || "";
        if (bankNameInput) bankNameInput.value = primaryAccount.bank_name || "";
        if (accNumInput) accNumInput.value = primaryAccount.account_number || "";
        if (ifscInput) ifscInput.value = primaryAccount.ifsc_code || "";
        if (upiInput) upiInput.value = primaryAccount.upi_id || "";

        // Show a subtle autofill hint below the box
        const bankBox = document.getElementById("txWithdrawInrBankBox");
        if (bankBox) {
            let hintEl = document.getElementById("txWithdrawAutofillHint");
            if (!hintEl) {
                hintEl = document.createElement("p");
                hintEl.id = "txWithdrawAutofillHint";
                hintEl.style.cssText = "font-size:0.7rem;font-weight:700;color:#22d3ee;margin-top:12px;grid-column:span 2;";
                bankBox.appendChild(hintEl);
            }
            const name = primaryAccount.account_holder_name || primaryAccount.bank_name || "Saved Account";
            hintEl.innerHTML = `<span style="opacity:0.6">⭐</span> Autofilled from saved primary account: <strong>${name}</strong> &nbsp;·&nbsp; <button type="button" id="txClearAutofillBtn" style="color:#f87171;background:none;border:none;cursor:pointer;font-weight:900;font-size:0.68rem;padding:0;text-decoration:underline;">Clear</button>`;

            document.getElementById("txClearAutofillBtn")?.addEventListener("click", () => {
                if (holderInput) holderInput.value = "";
                if (bankNameInput) bankNameInput.value = "";
                if (accNumInput) accNumInput.value = "";
                if (ifscInput) ifscInput.value = "";
                if (upiInput) upiInput.value = "";
                hintEl.remove();
            });
        }

    } catch (err) {
        // Silently fail
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// Sub-account Ledger Selector for Parent Account
// ══════════════════════════════════════════════════════════════════════════════

async function txInitLedgerSubAccountDropdown() {
    const dropdown = document.getElementById("ledgerAccountFilter");
    if (!dropdown) return;

    if (typeof getAuthUser !== "function" || typeof apiRequest !== "function") {
        return;
    }

    const user = getAuthUser();
    if (!user) return;

    const currentUserId = user._id || user.id;
    const isSubAccount = user.parent_user_id || user.role === "sub_account";

    try {
        const resp = await apiRequest("/user/sub-accounts");
        const subAccounts = resp.data || [];

        if (subAccounts.length === 0) {
            // Keep hidden if no sub-accounts exist
            dropdown.classList.add("hidden");
            return;
        }

        dropdown.innerHTML = "";

        // If main account, include the option to select Main Account
        if (!isSubAccount) {
            dropdown.innerHTML = `<option value="main">Main Account</option>`;
        }

        subAccounts.forEach(sub => {
            const opt = document.createElement("option");
            opt.value = sub.id;
            opt.textContent = sub.name || `Sub Account (${sub.client_id})`;
            
            // If the logged in user is this sub-account, mark it as selected by default
            if (isSubAccount && sub.id === currentUserId) {
                opt.selected = true;
            }
            dropdown.appendChild(opt);
        });

        dropdown.classList.remove("hidden");

        if (dropdown.dataset.bound !== "1") {
            dropdown.dataset.bound = "1";
            dropdown.addEventListener("change", () => {
                const val = dropdown.value;
                WALLET_STATE.selectedSubAccountId = val === "main" ? null : val;
                loadWalletData({ silent: true });
            });
        }
    } catch (err) {
        console.error("Failed to load sub-accounts for ledger filter:", err);
        dropdown.classList.add("hidden");
    }
}

// Global cache for sub-accounts list
let txSubAccountsLocalCache = [];

async function txInitSubAccountsAndSelector() {
    if (!isLoggedIn()) return;
    try {
        const response = await apiRequest("/user/sub-accounts");
        const subAccounts = response.data || [];
        txSubAccountsLocalCache = subAccounts;

        if (typeof txRenderTradingAccounts === "function") {
            txRenderTradingAccounts();
        }

        const selector = document.getElementById("tradingAccountSelector");
        if (!selector) return;

        const user = typeof getAuthUser === "function" ? getAuthUser() : null;
        if (user && user.selected_platform === "mt5") {
            selector.classList.add("hidden");
            return;
        }
        
        selector.innerHTML = `<option value="main">Main Trading Account</option>`;
        subAccounts.forEach(sub => {
            const opt = document.createElement("option");
            opt.value = sub.id;
            opt.textContent = sub.name;
            selector.appendChild(opt);
        });
        
        let activeSubId = localStorage.getItem("traidiumx_active_user_id");
        if (activeSubId) {
            selector.value = activeSubId;
        } else {
            selector.value = "main";
        }

        if (selector.dataset.bound !== "1") {
            selector.dataset.bound = "1";
            selector.addEventListener("change", (e) => {
                const val = e.target.value;
                if (val === "main") {
                    localStorage.removeItem("traidiumx_active_user_id");
                } else {
                    localStorage.setItem("traidiumx_active_user_id", val);
                }
                window.location.reload();
            });
        }
    } catch (e) {
        console.error("Failed to load sub accounts:", e);
    }
}

window.txSetActiveTradingAccount = async function(subId) {
    if (subId === "main") {
        localStorage.removeItem("traidiumx_active_user_id");
    } else {
        localStorage.setItem("traidiumx_active_user_id", subId);
    }
    
    // 1. Immediately toggle active badges in the UI
    txRenderTradingAccounts();
    updateWalletActionModalBalances();

    // 2. Fetch and render new account data dynamically without full page reload
    try {
        await loadWalletData();
    } catch (err) {
        console.error("Failed to dynamically switch sub-account data:", err);
    }
};

window.addEventListener("traidiumx:currency-change", (event) => {
    if (typeof renderWalletPage === "function") {
        renderWalletPage();
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOM WALLET REDESIGN UI HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function txInitTabs() {
    const tabOverview = document.getElementById("mainTabOverview");
    const tabTrading = document.getElementById("mainTabTradingAccounts");
    const tabWallet = document.getElementById("mainTabWallet");

    const contentOverview = document.getElementById("contentOverview");
    const contentTrading = document.getElementById("contentTradingAccounts");
    const contentWallet = document.getElementById("contentWallet");

    if (!tabOverview || !tabTrading || !tabWallet) return;

    const tabs = [tabOverview, tabTrading, tabWallet];
    const contents = [contentOverview, contentTrading, contentWallet];

    function selectTab(activeTab, activeContent) {
        tabs.forEach(t => {
            t.classList.remove("border-cyan-400", "text-cyan-300");
            t.classList.add("border-transparent", "text-slate-400");
        });
        activeTab.classList.remove("border-transparent", "text-slate-400");
        activeTab.classList.add("border-cyan-400", "text-cyan-300");

        contents.forEach(c => c.classList.add("hidden"));
        activeContent.classList.remove("hidden");

        // Save active main tab in localStorage
        localStorage.setItem("tx_active_main_tab", activeTab.id);
    }

    tabOverview.addEventListener("click", () => {
        selectTab(tabOverview, contentOverview);
        txRenderAssetLists();
    });
    tabTrading.addEventListener("click", () => {
        selectTab(tabTrading, contentTrading);
        txRenderTradingAccounts();
    });
    tabWallet.addEventListener("click", () => {
        selectTab(tabWallet, contentWallet);
        // Default to Withdraw sub-tab when parent Wallet tab is clicked
        const tabWithdraw = document.getElementById("subTabWithdraw");
        if (tabWithdraw) tabWithdraw.click();
    });

    // Restore active tab on load ONLY if we reloaded or came from the wallet page itself
    const isFromWallet = document.referrer && document.referrer.includes("wallet.html");
    const isReload = window.performance && window.performance.navigation && window.performance.navigation.type === 1;

    if (isFromWallet || isReload) {
        const savedTabId = localStorage.getItem("tx_active_main_tab");
        if (savedTabId) {
            const savedTab = document.getElementById(savedTabId);
            if (savedTab) {
                savedTab.click();
            }
        }
    } else {
        localStorage.removeItem("tx_active_main_tab");
        const tabOverview = document.getElementById("mainTabOverview");
        if (tabOverview) {
            tabOverview.click();
        }
    }
}

function txRenderAssetLists() {
    const searchVal = document.getElementById("assetSearchInput")?.value.toLowerCase() || "";
    const hideEmpty = document.getElementById("hideEmptyBalancesCheck")?.checked || false;

    const wallet = WALLET_STATE.wallet || {};
    const rate = walletNumber(wallet.usdt_inr_rate || localStorage.getItem("tx_usdt_inr_rate") || 88.50, 88.50);

    // Retrieve live backend balances
    const inrBalance = walletNumber(wallet.main_wallet_inr?.available_balance, 0);
    const inrLocked = walletNumber(wallet.main_wallet_inr?.locked_balance, 0);
    const usdtBalance = walletNumber(wallet.main_wallet_usdt?.available_balance, 0);
    const usdtLocked = walletNumber(wallet.main_wallet_usdt?.locked_balance, 0);
    const btcBalance = walletNumber(wallet.main_wallet_btc?.available_balance, 0);
    const btcLocked = walletNumber(wallet.main_wallet_btc?.locked_balance, 0);
    const ethBalance = walletNumber(wallet.main_wallet_eth?.available_balance, 0);
    const ethLocked = walletNumber(wallet.main_wallet_eth?.locked_balance, 0);
    const usdcBalance = walletNumber(wallet.main_wallet_usdc?.available_balance, 0);
    const usdcLocked = walletNumber(wallet.main_wallet_usdc?.locked_balance, 0);
    const solBalance = walletNumber(wallet.main_wallet_sol?.available_balance, 0);
    const solLocked = walletNumber(wallet.main_wallet_sol?.locked_balance, 0);
    const bnbBalance = walletNumber(wallet.main_wallet_bnb?.available_balance, 0);
    const bnbLocked = walletNumber(wallet.main_wallet_bnb?.locked_balance, 0);
    const xrpBalance = walletNumber(wallet.main_wallet_xrp?.available_balance, 0);
    const xrpLocked = walletNumber(wallet.main_wallet_xrp?.locked_balance, 0);
    const adaBalance = walletNumber(wallet.main_wallet_ada?.available_balance, 0);
    const adaLocked = walletNumber(wallet.main_wallet_ada?.locked_balance, 0);

    const board = WALLET_STATE.board || [];
    function getAssetPrice(code) {
        if (code === "USDT" || code === "USDC") return 1.0;
        if (code === "INR") return 1.0 / rate;
        const symbol = `${code}USDT`;
        const item = board.find(b => b.symbol === symbol || b.ui_symbol === symbol);
        return item ? walletNumber(item.price || item.last_price, 0) : 0.0;
    }

    // Money Listing Items
    const moneyAssets = [
        {
            code: "INR",
            displayCode: "INR",
            name: "Indian Rupee",
            symbol: "₹",
            balance: inrBalance,
            pending: inrLocked,
            iconClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        },
        {
            code: "USDT",
            displayCode: "USD",
            name: "US Dollar",
            symbol: "$",
            balance: usdtBalance,
            pending: usdtLocked,
            iconClass: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
        }
    ];

    // Crypto Listing Items
    const cryptoAssets = [
        { code: "BTC", name: "Bitcoin", symbol: "₿", balance: btcBalance, pending: btcLocked, iconClass: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
        { code: "ETH", name: "Ethereum", symbol: "Ξ", balance: ethBalance, pending: ethLocked, iconClass: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
        { code: "USDC", name: "USD Coin", symbol: "C", balance: usdcBalance, pending: usdcLocked, iconClass: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
        { code: "SOL", name: "Solana", symbol: "S", balance: solBalance, pending: solLocked, iconClass: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20" },
        { code: "BNB", name: "BNB", symbol: "B", balance: bnbBalance, pending: bnbLocked, iconClass: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
        { code: "XRP", name: "Ripple", symbol: "X", balance: xrpBalance, pending: xrpLocked, iconClass: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
        { code: "ADA", name: "Cardano", symbol: "A", balance: adaBalance, pending: adaLocked, iconClass: "bg-indigo-600/10 text-indigo-500 border-indigo-600/20" }
    ];

    const activeCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const totalEl = document.getElementById("portfolioTotalBalance");
    if (totalEl) {
        if (isBalanceHidden()) {
            totalEl.textContent = `≈ •••••••• ${activeCurrency}`;
        } else if (activeCurrency === "INR") {
            totalEl.textContent = `≈ ₹${inrBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`;
        } else {
            totalEl.textContent = `≈ $${usdtBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
        }
    }

    // Filtering logic
    const filteredMoney = moneyAssets.filter(asset => {
        const matchesSearch = asset.code.toLowerCase().includes(searchVal) || asset.name.toLowerCase().includes(searchVal);
        const matchesHide = !hideEmpty || asset.balance > 0;
        return matchesSearch && matchesHide;
    });

    const filteredCrypto = cryptoAssets.filter(asset => {
        const matchesSearch = asset.code.toLowerCase().includes(searchVal) || asset.name.toLowerCase().includes(searchVal);
        const matchesHide = !hideEmpty || asset.balance > 0;
        return matchesSearch && matchesHide;
    });

    // Update Section Summaries
    const moneySub = document.getElementById("moneySubVal");
    if (moneySub) {
        let moneyTotalUsd = 0;
        filteredMoney.forEach(a => {
            if (a.code === "INR") {
                moneyTotalUsd += a.balance / rate;
            } else {
                moneyTotalUsd += a.balance; // USDT
            }
        });
        if (isBalanceHidden()) {
            moneySub.textContent = `| ≈ •••••••• ${activeCurrency}`;
        } else if (activeCurrency === "INR") {
            const moneyInr = moneyTotalUsd * rate;
            moneySub.textContent = `| ≈ ₹${moneyInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`;
        } else {
            moneySub.textContent = `| ≈ $${moneyTotalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
        }
    }

    const cryptoSub = document.getElementById("cryptoSubVal");
    if (cryptoSub) {
        let cryptoSumUsd = 0;
        filteredCrypto.forEach(asset => {
            cryptoSumUsd += asset.balance * getAssetPrice(asset.code);
        });
        if (isBalanceHidden()) {
            cryptoSub.textContent = `| ≈ •••••••• ${activeCurrency}`;
        } else if (activeCurrency === "INR") {
            const cryptoInr = cryptoSumUsd * rate;
            cryptoSub.textContent = `| $${cryptoSumUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT (≈ ₹${cryptoInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR)`;
        } else {
            cryptoSub.textContent = `| ≈ $${cryptoSumUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
        }
    }

    // Render Money Table
    const moneyBody = document.getElementById("moneyAssetsBody");
    if (moneyBody) {
        moneyBody.innerHTML = filteredMoney.map(asset => `
            <tr class="border-b border-white/5 hover:bg-white/[0.02] transition">
                <td class="py-4 flex items-center gap-3">
                    <div class="flex h-8 w-8 items-center justify-center rounded-full border ${asset.iconClass} font-bold text-sm">
                        ${asset.symbol}
                    </div>
                    <div>
                        <div class="font-bold text-white">${asset.displayCode || asset.code}</div>
                        <div class="text-[10px] text-slate-500 font-semibold">${asset.name}</div>
                    </div>
                </td>
                <td class="py-4 font-bold text-white">${isBalanceHidden() ? "••••••••" : `${asset.symbol}${asset.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
                <td class="py-4 text-slate-500">${isBalanceHidden() ? "••••" : `${asset.symbol}${asset.pending.toFixed(2)}`}</td>
                <td class="py-4 text-right">
                    <div class="wallet-action-grid flex justify-end gap-3 text-xs">
                        <button onclick="txTriggerRowAction('${asset.code}', 'deposit')" class="text-cyan-400 hover:text-cyan-300 font-black">Deposit</button>
                        <button onclick="txTriggerRowAction('${asset.code}', 'withdraw')" class="text-cyan-400 hover:text-cyan-300 font-black">Withdraw</button>
                        <button onclick="txTriggerRowAction('${asset.code}', 'transfer')" class="text-cyan-400 hover:text-cyan-300 font-black">Transfer</button>
                        <button onclick="txTriggerRowAction('${asset.code}', 'internal_transfer')" class="text-cyan-400 hover:text-cyan-300 font-black">Internal</button>
                        <button onclick="txTriggerRowAction('${asset.code}', 'exchange')" class="text-cyan-400 hover:text-cyan-300 font-black font-semibold">Exchange</button>
                    </div>
                </td>
            </tr>
        `).join("");
    }

    // Render Crypto Table
    const cryptoBody = document.getElementById("cryptoAssetsBody");
    if (cryptoBody) {
        cryptoBody.innerHTML = filteredCrypto.map(asset => `
            <tr class="border-b border-white/5 hover:bg-white/[0.02] transition">
                <td class="py-4 flex items-center gap-3">
                    <div class="flex h-8 w-8 items-center justify-center rounded-full border ${asset.iconClass} font-bold text-sm">
                        ${asset.symbol}
                    </div>
                    <div>
                        <div class="font-bold text-white">${asset.code}</div>
                        <div class="text-[10px] text-slate-500 font-semibold">${asset.name}</div>
                    </div>
                </td>
                <td class="py-4 font-bold text-white">${isBalanceHidden() ? "••••••••" : `${asset.code === "USDT" ? "$" : ""}${asset.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}</td>
                <td class="py-4 text-slate-500">${isBalanceHidden() ? "••••" : asset.pending.toFixed(2)}</td>
                <td class="py-4 text-right">
                    <div class="wallet-action-grid flex justify-end gap-3 text-xs">
                        <button onclick="txTriggerRowAction('${asset.code}', 'deposit')" class="text-cyan-400 hover:text-cyan-300 font-black">Deposit</button>
                        <button onclick="txTriggerRowAction('${asset.code}', 'withdraw')" class="text-cyan-400 hover:text-cyan-300 font-black">Withdraw</button>
                        <button onclick="txTriggerRowAction('${asset.code}', 'internal_transfer')" class="text-cyan-400 hover:text-cyan-300 font-black">Internal</button>
                        <button onclick="txTriggerRowAction('${asset.code}', 'exchange')" class="text-cyan-400 hover:text-cyan-300 font-black font-semibold">Exchange</button>
                    </div>
                </td>
            </tr>
        `).join("");
    }
}

window.txTriggerRowAction = function(asset, action) {
    if (action === "deposit") {
        WALLET_STATE.activeDepositCurrency = asset;
        checkAndShowCurrencyLockModal();
        if (asset === "INR") {
            loadInrDepositDetails();
        }
        updateDepositModalUIByCurrency(asset);
        openWalletActionModal("deposit", asset);
    } else if (action === "withdraw") {
        WALLET_STATE.activeWithdrawalCurrency = asset;
        checkAndShowCurrencyLockModal();
        
        updateWithdrawalModalUIByCurrency(asset, true);
        if (asset === "INR") {
            txAutofillWithdrawBankDetails(true);
        }
        openWalletActionModal("withdraw", asset);
    } else if (action === "exchange") {
        openWalletActionModal("exchange", asset);
    } else if (action === "transfer") {
        openWalletActionModal("transfer");
    } else if (action === "internal_transfer") {
        openWalletActionModal("internal_transfer", asset);
    }
};

function txInitSubTabs() {
    const tabWithdraw = document.getElementById("subTabWithdraw");
    const tabHistory = document.getElementById("subTabHistory");

    const contentWithdraw = document.getElementById("walletSubContentWithdraw");
    const contentHistory = document.getElementById("walletSubContentHistory");

    if (!tabWithdraw || !tabHistory) return;

    const tabs = [tabWithdraw, tabHistory];
    const contents = [contentWithdraw, contentHistory];

    function selectSubTab(activeTab, activeContent) {
        tabs.forEach(t => {
            t.classList.remove("border-cyan-400", "text-cyan-300");
            t.classList.add("border-transparent", "text-slate-400");
        });
        activeTab.classList.remove("border-transparent", "text-slate-400");
        activeTab.classList.add("border-cyan-400", "text-cyan-300");

        contents.forEach(c => c.classList.add("hidden"));
        activeContent.classList.remove("hidden");
    }

    tabWithdraw.addEventListener("click", () => {
        selectSubTab(tabWithdraw, contentWithdraw);
        WALLET_STATE.activeWithdrawalCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
        checkAndShowCurrencyLockModal();
        updateWithdrawalModalUIByCurrency(WALLET_STATE.activeWithdrawalCurrency);
        txAutofillWithdrawBankDetails();
    });

    tabHistory.addEventListener("click", () => {
        selectSubTab(tabHistory, contentHistory);
        renderLedgerTable();
        renderDepositTable();
        renderWithdrawalTable();
    });
}

function txRenderTradingAccounts() {
    const listContainer = document.getElementById("tradingAccountsList");
    if (!listContainer) return;

    const cache = txSubAccountsLocalCache || [];
    const parentEntry = cache.find(sub => sub.is_parent);
    const subAccountsOnly = cache.filter(sub => !sub.is_parent);

    const mainWallet = getMainWalletData();
    const activeCurrency = (localStorage.getItem("tx_navbar_currency") || "USDT").toUpperCase();
    const mainCurrency = mainWallet.currency || "USDT";

    const activeSubId = localStorage.getItem("traidiumx_active_user_id");
    const isMainActive = !activeSubId;

    let parentAvailableRaw = 0;
    let splitTradingVal = 0;

    const activeAccountEntry = isMainActive 
        ? parentEntry 
        : cache.find(sub => sub.id === activeSubId);

    if (activeCurrency === "INR") {
        const wallet = WALLET_STATE.wallet || {};
        const tradingWalletInr = wallet.trading_wallet_inr || {};
        const activeTradingInrAvailable = walletNumber(tradingWalletInr.available_balance, 0);

        parentAvailableRaw = parentEntry && parentEntry.wallet && parentEntry.wallet.trading_wallet_inr
            ? walletNumber(parentEntry.wallet.trading_wallet_inr.available_balance, 0)
            : (isMainActive ? activeTradingInrAvailable : 0);

        splitTradingVal = activeAccountEntry && activeAccountEntry.wallet && activeAccountEntry.wallet.trading_wallet_inr
            ? walletNumber(activeAccountEntry.wallet.trading_wallet_inr.available_balance, 0)
            : activeTradingInrAvailable;
    } else {
        const wallet = WALLET_STATE.wallet || {};
        const tradingWalletUsdt = wallet.trading_wallet_usdt || {};
        const activeTradingUsdtAvailable = walletNumber(tradingWalletUsdt.available_balance, 0);

        parentAvailableRaw = parentEntry && parentEntry.wallet && parentEntry.wallet.trading_wallet_usdt
            ? walletNumber(parentEntry.wallet.trading_wallet_usdt.available_balance, 0)
            : (isMainActive ? activeTradingUsdtAvailable : 0);

        splitTradingVal = activeAccountEntry && activeAccountEntry.wallet && activeAccountEntry.wallet.trading_wallet_usdt
            ? walletNumber(activeAccountEntry.wallet.trading_wallet_usdt.available_balance, 0)
            : activeTradingUsdtAvailable;
    }

    const parentFormatted = formatWalletMoney(parentAvailableRaw, activeCurrency);

    const mainAvailable = walletNumber(mainWallet.available_balance, 0);
    const splitMain = document.getElementById("splitMainVal");
    if (splitMain) splitMain.textContent = formatWalletMoney(mainAvailable, mainCurrency);
    
    const splitTrading = document.getElementById("splitTradingVal");
    if (splitTrading) splitTrading.textContent = formatWalletMoney(splitTradingVal, activeCurrency);

    let accountsHtml = "";

    // Main Trading Account Row (Trading Account 1)
    accountsHtml += `
        <div onclick="txSetActiveTradingAccount('main')" class="rounded-2xl border ${isMainActive ? 'border-cyan-500/50 bg-cyan-950/20' : 'border-white/5 bg-slate-950/40'} p-4 flex items-center justify-between transition hover:border-cyan-500/30 cursor-pointer">
            <div>
                <div class="flex items-center gap-2">
                    <span class="font-bold text-sm text-white">Trading Account 1</span>
                    <span class="rounded bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold text-cyan-400">Default</span>
                    ${isMainActive ? '<span class="rounded bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Active</span>' : ''}
                </div>
                <div class="text-[10px] text-slate-500 mt-1">Main Trading Account</div>
            </div>
            <div class="text-right">
                <span class="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">Balance</span>
                <strong class="text-sm font-black text-white">${parentFormatted}</strong>
            </div>
        </div>
    `;

    // Sub-accounts Rows
    subAccountsOnly.forEach((sub, index) => {
        const isActive = activeSubId === sub.id;
        let balRaw = 0;
        if (activeCurrency === "INR") {
            balRaw = walletNumber(sub.wallet?.trading_wallet_inr?.available_balance, 0);
        } else {
            balRaw = walletNumber(sub.wallet?.trading_wallet_usdt?.available_balance, 0);
        }
        const balFormatted = formatWalletMoney(balRaw, activeCurrency);
        
        accountsHtml += `
            <div onclick="txSetActiveTradingAccount('${sub.id}')" class="rounded-2xl border ${isActive ? 'border-cyan-500/50 bg-cyan-950/20' : 'border-white/5 bg-slate-950/40'} p-4 flex items-center justify-between transition hover:border-cyan-500/30 cursor-pointer">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-sm text-white">${sub.name}</span>
                        ${isActive ? '<span class="rounded bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Active</span>' : ''}
                    </div>
                    <div class="text-[10px] text-slate-500 mt-1">Sub Account (${sub.client_id || sub.id.slice(0,8)})</div>
                </div>
                <div class="text-right">
                    <span class="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">Balance</span>
                    <strong class="text-sm font-black text-white">${balFormatted}</strong>
                </div>
            </div>
        `;
    });

    listContainer.innerHTML = accountsHtml;

    const countText = document.getElementById("taCountText");
    if (countText) {
        countText.textContent = `${subAccountsOnly.length + 1} accounts`;
    }
}


async function updateExchangePreview(forceFetch = false) {
    const fromAsset = document.getElementById("walletExchangeFromAsset")?.value;
    const toAsset = document.getElementById("walletExchangeToAsset")?.value;
    const amountInput = document.getElementById("walletExchangeAmount");
    const amountVal = parseFloat(amountInput?.value) || 0;
    
    const rateText = document.getElementById("txExchangeRateText");
    const previewDiv = document.getElementById("exchangeConversionPreview");
    
    if (!fromAsset || !toAsset) return;
    
    if (fromAsset === toAsset) {
        WALLET_STATE.currentExchangeRate = null;
        if (rateText) rateText.textContent = "Assets cannot be the same";
        if (previewDiv) previewDiv.textContent = "Please select different assets.";
        return;
    }

    const needsFetch = (forceFetch === true) || 
                       !WALLET_STATE.currentExchangeRate || 
                       WALLET_STATE.currentExchangeFromAsset !== fromAsset || 
                       WALLET_STATE.currentExchangeToAsset !== toAsset;

    if (needsFetch) {
        try {
            WALLET_STATE.currentExchangeFromAsset = fromAsset;
            WALLET_STATE.currentExchangeToAsset = toAsset;

            const res = await apiRequest("/wallet/exchange", {
                method: "POST",
                body: JSON.stringify({
                    from_asset: fromAsset,
                    to_asset: toAsset,
                    amount: 1.0,
                    execute: false
                })
            });
            
            if (res.success && res.data) {
                WALLET_STATE.currentExchangeRate = parseFloat(res.data.rate) || null;
            } else {
                WALLET_STATE.currentExchangeRate = null;
            }
        } catch (err) {
            console.error("Failed to update exchange rate preview:", err);
            WALLET_STATE.currentExchangeRate = null;
        }
    }

    const rate = WALLET_STATE.currentExchangeRate;
    if (rate !== null && rate > 0) {
        if (rateText) {
            rateText.textContent = `1 ${fromAsset} = ${walletNumber(rate, 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${toAsset}`;
        }
        if (previewDiv) {
            if (amountVal > 0) {
                const receive_amount = amountVal * rate;
                previewDiv.textContent = `You will receive: ${walletNumber(receive_amount, 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${toAsset}`;
                previewDiv.className = "rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs font-black text-emerald-300";
            } else {
                previewDiv.textContent = "Enter amount to see live conversion";
                previewDiv.className = "rounded-xl border border-white/10 bg-slate-950/30 p-3 text-xs font-bold text-slate-400";
            }
        }
    } else {
        if (rateText) rateText.textContent = "Exchange rate unavailable";
        if (previewDiv) previewDiv.textContent = "Exchange rate could not be calculated.";
    }
}

async function handleExchangeSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form) return;

    if (!isLoggedIn()) {
        showWalletActionMessage("Please login first.", "error");
        return;
    }

    const fromAsset = document.getElementById("walletExchangeFromAsset")?.value;
    const toAsset = document.getElementById("walletExchangeToAsset")?.value;
    const amount = parseFloat(document.getElementById("walletExchangeAmount")?.value) || 0;

    if (amount <= 0) {
        showWalletActionMessage("Please enter a valid amount.", "error");
        return;
    }

    if (fromAsset === toAsset) {
        showWalletActionMessage("Cannot exchange same currencies.", "error");
        return;
    }

    try {
        const submitBtn = document.getElementById("walletExchangeSubmitBtn");
        walletSetButtonLoading(submitBtn, true, "Exchanging...");
        
        const res = await apiRequest("/wallet/exchange", {
            method: "POST",
            body: JSON.stringify({
                from_asset: fromAsset,
                to_asset: toAsset,
                amount: amount,
                execute: true
            })
        });

        if (res.success) {
            form.reset();
            await loadWalletData({ silent: true });
            closeWalletActionModal();
            showWalletAlert(res.message || "Exchange completed successfully!", "success");
        } else {
            showWalletActionMessage(res.message || "Exchange failed.", "error");
        }
    } catch (err) {
        showWalletActionMessage(err.message || "Failed to complete exchange.", "error");
    } finally {
        const submitBtn = document.getElementById("walletExchangeSubmitBtn");
        walletSetButtonLoading(submitBtn, false);
    }
}


function updateInternalTransferBalance() {
    const wallet = WALLET_STATE.wallet || {};
    const assetSelect = walletElements.internalTransferAsset;
    const balanceEl = walletElements.internalTransferMyBalance;
    if (!assetSelect || !balanceEl) return;
    
    const asset = assetSelect.value.toUpperCase();
    const assetWallet = wallet[`main_wallet_${asset.toLowerCase()}`] || { available_balance: 0 };
    
    const avail = walletNumber(assetWallet.available_balance, 0);
    if (["INR", "USDT"].includes(asset)) {
        balanceEl.textContent = formatWalletMoney(avail, asset);
    } else {
        balanceEl.textContent = `${avail.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${asset}`;
    }

    // Set up Receive details
    const addressTextEl = document.getElementById("txItReceiveAddressText");
    const qrImageEl = document.getElementById("txItReceiveQrImage");
    const netSelectContainer = document.getElementById("txItReceiveNetworkSelectContainer");
    const netSelect = document.getElementById("txItReceiveNetworkSelect");

    if (addressTextEl && qrImageEl) {
        if (asset === "INR") {
            if (netSelectContainer) netSelectContainer.classList.add("hidden");
        } else {
            if (netSelectContainer) netSelectContainer.classList.remove("hidden");
        }

        const addresses = assetWallet.addresses || {};
        
        const primaryNetworkMapping = {
            "USDT": "TRC20",
            "USDC": "ERC20",
            "BTC": "BITCOIN",
            "ETH": "ERC20",
            "SOL": "SOLANA",
            "BNB": "BEP20",
            "XRP": "RIPPLE",
            "ADA": "CARDANO",
            "INR": "INTERNAL"
        };

        const primaryNet = primaryNetworkMapping[asset];
        const addr = addresses[primaryNet];

        if (addr) {
            addressTextEl.textContent = addr;
            const siteUrl = `${window.location.origin}${window.location.pathname}`;
            const qrUrl = `${siteUrl}?recipient=${encodeURIComponent(addr)}&asset=${encodeURIComponent(asset)}`;
            qrImageEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrUrl)}`;
        } else {
            addressTextEl.textContent = "No address generated";
            qrImageEl.src = "";
        }
    }
}


async function handleInternalTransferSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form) return;

    if (!isLoggedIn()) {
        showWalletActionMessage("Please login first.", "error");
        return;
    }

    const asset = walletElements.internalTransferAsset?.value;
    const recipient = walletElements.internalTransferRecipient?.value;
    const amount = parseFloat(walletElements.internalTransferAmount?.value) || 0;

    if (!recipient) {
        showWalletActionMessage("Please enter recipient Email, Client ID or Address.", "error");
        return;
    }

    if (amount <= 0) {
        showWalletActionMessage("Please enter a valid amount.", "error");
        return;
    }

    try {
        const submitBtn = walletElements.internalTransferSubmitBtn;
        walletSetButtonLoading(submitBtn, true, "Transferring...");
        
        const res = await apiRequest("/wallet/internal-transfer", {
            method: "POST",
            body: JSON.stringify({
                asset: asset,
                recipient_info: recipient,
                amount: amount
            })
        });

        if (res.success) {
            form.reset();
            await loadWalletData({ silent: true });
            closeWalletActionModal();
            showWalletAlert(res.message || "Internal transfer completed successfully!", "success");
        } else {
            showWalletActionMessage(res.message || "Transfer failed.", "error");
        }
    } catch (err) {
        showWalletActionMessage(err.message || "Failed to complete internal transfer.", "error");
    } finally {
        const submitBtn = walletElements.internalTransferSubmitBtn;
        walletSetButtonLoading(submitBtn, false);
    }
}


var recipientLookupTimeout = null;

function initRecipientLookup() {
    const input = document.getElementById("walletInternalTransferRecipient");
    const container = document.getElementById("walletInternalTransferRecipientDetails");
    const nameEl = document.getElementById("txItRecipientName");
    const emailEl = document.getElementById("txItRecipientEmail");
    const clientIdEl = document.getElementById("txItRecipientClientId");
    const errorEl = document.getElementById("walletInternalTransferRecipientError");
    const submitBtn = document.getElementById("walletInternalTransferSubmitBtn");
    
    if (input) {
        input.addEventListener("input", () => {
            const val = input.value.trim();
            
            // Clear previous timeout
            if (recipientLookupTimeout) {
                clearTimeout(recipientLookupTimeout);
            }
            
            if (!val) {
                if (container) container.classList.add("hidden");
                if (errorEl) {
                    errorEl.textContent = "";
                    errorEl.classList.add("hidden");
                }
                if (submitBtn) submitBtn.disabled = false;
                return;
            }
            
            // Debounce for 350ms
            recipientLookupTimeout = setTimeout(async () => {
                try {
                    const activeAsset = (document.getElementById("walletInternalTransferAsset")?.value || "USDT").toUpperCase();
                    const res = await apiRequest(`/wallet/lookup-recipient?query=${encodeURIComponent(val)}&asset=${activeAsset}`);
                    
                    if (res.success && res.data) {
                        if (res.data.found) {
                            if (nameEl) nameEl.textContent = res.data.name;
                            if (emailEl) emailEl.textContent = res.data.email;
                            if (clientIdEl) clientIdEl.textContent = res.data.client_id;
                            if (container) container.classList.remove("hidden");
                            
                            if (errorEl) {
                                errorEl.textContent = "";
                                errorEl.classList.add("hidden");
                            }
                            if (submitBtn) submitBtn.disabled = false;
                        } else {
                            if (container) container.classList.add("hidden");
                            
                            if (errorEl) {
                                if (res.data.matched_different_asset) {
                                    errorEl.textContent = `This is a ${res.data.matched_different_asset} address. Please select ${res.data.matched_different_asset} modal or enter a valid ${activeAsset} address.`;
                                } else {
                                    errorEl.textContent = `Recipient not found. Please verify the Email, Client ID, or Address.`;
                                }
                                errorEl.classList.remove("hidden");
                            }
                            if (submitBtn) submitBtn.disabled = true;
                        }
                    }
                } catch (err) {
                    console.error("Recipient lookup failed:", err);
                    if (container) container.classList.add("hidden");
                }
            }, 350);
        });
    }

    // Tab buttons & contents
    const btnReceive = document.getElementById("txItTabBtnReceive");
    const btnSend = document.getElementById("txItTabBtnSend");
    const contentReceive = document.getElementById("txItTabContentReceive");
    const contentSend = document.getElementById("txItTabContentSend");

    if (btnReceive && btnSend && contentReceive && contentSend) {
        btnReceive.addEventListener("click", () => {
            contentReceive.classList.remove("hidden");
            contentSend.classList.add("hidden");
            btnReceive.className = "flex-1 rounded-xl py-2.5 text-xs font-black transition-all bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
            btnSend.className = "flex-1 rounded-xl py-2.5 text-xs font-black transition-all text-slate-400 hover:text-slate-200";
        });

        btnSend.addEventListener("click", () => {
            contentReceive.classList.add("hidden");
            contentSend.classList.remove("hidden");
            btnSend.className = "flex-1 rounded-xl py-2.5 text-xs font-black transition-all bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
            btnReceive.className = "flex-1 rounded-xl py-2.5 text-xs font-black transition-all text-slate-400 hover:text-slate-200";
        });
    }

    // Copy Address Button
    document.getElementById("txItReceiveCopyBtn")?.addEventListener("click", () => {
        const address = document.getElementById("txItReceiveAddressText")?.textContent;
        if (address && address !== "--" && address !== "No address generated") {
            navigator.clipboard.writeText(address).then(() => {
                showWalletAlert("Address copied to clipboard!", "success");
            }).catch(() => {
                showWalletAlert("Failed to copy address.", "error");
            });
        }
    });

    // Share Button
    document.getElementById("txItReceiveShareBtn")?.addEventListener("click", () => {
        const address = document.getElementById("txItReceiveAddressText")?.textContent;
        if (address && address !== "--" && address !== "No address generated") {
            if (navigator.share) {
                navigator.share({
                    title: 'My Permanent Crypto Address',
                    text: address
                }).catch(err => {
                    console.log("Share cancelled or failed:", err);
                });
            } else {
                navigator.clipboard.writeText(address).then(() => {
                    showWalletAlert("Address copied to clipboard! (Share API unsupported)", "success");
                });
            }
        }
    });

    // Scan QR Button (Camera Scanner)
    document.getElementById("txItScanQrBtn")?.addEventListener("click", () => {
        if (txHtml5QrCode) {
            stopCameraScanner();
        } else {
            startCameraScanner();
        }
    });
}


var txHtml5QrCode = null;

function loadHtml5QrcodeScript() {
    return new Promise((resolve) => {
        if (window.Html5Qrcode) {
            resolve();
            return;
        }
        const script = document.createElement("script");
        script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

async function startCameraScanner() {
    try {
        await loadHtml5QrcodeScript();
        const viewfinder = document.getElementById("txItCameraScannerViewfinder");
        if (!viewfinder) return;
        
        viewfinder.classList.remove("hidden");
        const scanBtn = document.getElementById("txItScanQrBtn");
        if (scanBtn) scanBtn.textContent = "Stop Scan";

        txHtml5QrCode = new Html5Qrcode("txItCameraScannerViewfinder");
        
        const extractRecipientFromDecodedText = (textVal) => {
            const trimmed = textVal.trim();
            if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                try {
                    const url = new URL(trimmed);
                    const rec = url.searchParams.get("recipient");
                    if (rec) return rec;
                } catch (e) {
                    console.error("Failed to parse scanned URL:", e);
                }
            }
            return trimmed;
        };

        const qrCodeSuccessCallback = (decodedText) => {
            const recipientInput = document.getElementById("walletInternalTransferRecipient");
            if (recipientInput) {
                recipientInput.value = extractRecipientFromDecodedText(decodedText);
                recipientInput.dispatchEvent(new Event("input"));
            }
            stopCameraScanner();
            showWalletAlert("QR code scanned successfully!", "success");
        };
        
        const config = { fps: 15, qrbox: { width: 200, height: 200 } };
        
        await txHtml5QrCode.start(
            { facingMode: "environment" },
            config,
            qrCodeSuccessCallback,
            (errorMessage) => {}
        );
    } catch (err) {
        console.error("Camera access failed:", err);
        // Fallback to clipboard paste
        try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) {
                const recipientInput = document.getElementById("walletInternalTransferRecipient");
                if (recipientInput) {
                    recipientInput.value = extractRecipientFromDecodedText(text);
                    recipientInput.dispatchEvent(new Event("input"));
                    showWalletAlert("Clipboard fallback pasted!", "success");
                }
            } else {
                showWalletAlert("Camera error: Please ensure you are on HTTPS and camera permissions are allowed.", "error");
            }
        } catch (clipErr) {
            showWalletAlert("Camera error: Please ensure you are on HTTPS and camera permissions are allowed.", "error");
        }
        stopCameraScanner();
    }
}

function stopCameraScanner() {
    const viewfinder = document.getElementById("txItCameraScannerViewfinder");
    if (viewfinder) viewfinder.classList.add("hidden");
    
    const scanBtn = document.getElementById("txItScanQrBtn");
    if (scanBtn) scanBtn.textContent = "Scan QR";

    if (txHtml5QrCode) {
        txHtml5QrCode.stop().then(() => {
            txHtml5QrCode.clear();
            txHtml5QrCode = null;
        }).catch(err => {
            console.error("Error stopping qr scanner:", err);
            txHtml5QrCode = null;
        });
    }
}



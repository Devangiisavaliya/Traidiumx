"use strict";

const TX_HISTORY_STATE = {
    loading: false,
    rawLedger: [],
    rawDeposits: [],
    rawWithdrawals: [],
    subAccountsList: [],
    selectedAccount: "main",
    activeCategory: "all",
    search: "",
    currency: "all",
    direction: "all",
    datePreset: "all",
    page: 1,
    pageSize: 10
};

function formatMoney(value, currency = "USDT") {
    const num = Number(value || 0);
    const curr = String(currency || "USDT").toUpperCase();
    if (curr === "INR") {
        return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function formatDate(value) {
    if (!value) return { date: "--", time: "--" };
    let parseable = value;
    if (typeof value === "string") {
        const valTrim = value.trim();
        if (valTrim && !valTrim.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(valTrim)) {
            parseable = valTrim.replace(" ", "T") + "Z";
        }
    }
    const d = new Date(parseable);
    if (Number.isNaN(d.getTime())) return { date: "--", time: "--" };
    const date = d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
    const time = d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });
    return { date, time };
}

function categorizeItem(item) {
    const type = String(item.transaction_type || item.type || "").toLowerCase();
    const desc = String(item.description || "").toLowerCase();

    if (type.includes("referral") || type.includes("reward") || type.includes("commission") || desc.includes("referral") || desc.includes("refer and earn")) {
        return "referral";
    }
    if (type.includes("transfer") || desc.includes("transfer") || desc.includes("main wallet ->") || desc.includes("trading wallet ->")) {
        return "transfers";
    }
    if (type.includes("deposit") || desc.includes("deposit")) {
        return "deposits";
    }
    if (type.includes("withdrawal") || desc.includes("withdrawal") || desc.includes("payout")) {
        return "withdrawals";
    }
    if (type.includes("fee") || type.includes("margin") || type.includes("settlement") || type.includes("order") || type.includes("position") || desc.includes("trading fee") || desc.includes("margin locked")) {
        return "trading";
    }
    return "other";
}

function getCategoryBadge(category) {
    const map = {
        transfers: '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-400/10 text-cyan-300 border border-cyan-400/20">Transfer</span>',
        deposits: '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">Deposit</span>',
        withdrawals: '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-400/10 text-rose-400 border border-rose-400/20">Withdrawal</span>',
        referral: '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/10 text-amber-300 border border-amber-400/20">Referral</span>',
        trading: '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-400/10 text-indigo-300 border border-indigo-400/20">Trading</span>',
        other: '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-400/10 text-slate-300 border border-slate-400/20">System</span>'
    };
    return map[category] || map.other;
}

function getDirectionBadge(direction) {
    const dir = String(direction || "").toLowerCase();
    if (dir === "credit" || dir === "in") {
        return '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Credit (+)</span>';
    }
    if (dir === "debit" || dir === "out") {
        return '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400"><span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>Debit (-)</span>';
    }
    if (dir === "finalized") {
        return '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400"><span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>Payout (✓)</span>';
    }
    return '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300"><span class="w-1.5 h-1.5 rounded-full bg-cyan-300"></span>Transfer (↔)</span>';
}

function getStatusBadge(item) {
    const status = String(item.status || "").toLowerCase();
    const type = String(item.transaction_type || "").toLowerCase();
    const desc = String(item.description || "").toLowerCase();

    if (status.includes("reject") || status.includes("fail") || status.includes("cancel") ||
        type.includes("reject") || type.includes("fail") || desc.includes("reject") || desc.includes("fail")) {
        return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>Rejected</span>';
    }
    if (status.includes("pend") || status.includes("process") || type.includes("pend") || desc.includes("pending")) {
        return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>Pending</span>';
    }
    return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Completed</span>';
}

function copyReferenceId(text, btn) {
    if (!text || text === "--") return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (btn) {
                const orig = btn.innerHTML;
                btn.innerHTML = '<span class="text-emerald-400 font-bold">Copied!</span>';
                setTimeout(() => { btn.innerHTML = orig; }, 1500);
            }
        }).catch(() => {});
    }
}
window.copyReferenceId = copyReferenceId;
window.txCopyReferenceId = copyReferenceId;

function resetHistoryFilters() {
    TX_HISTORY_STATE.search = "";
    TX_HISTORY_STATE.activeCategory = "all";
    TX_HISTORY_STATE.direction = "all";
    TX_HISTORY_STATE.currency = "all";
    TX_HISTORY_STATE.datePreset = "all";
    TX_HISTORY_STATE.page = 1;

    const searchInput = document.getElementById("searchInput");
    if (searchInput) searchInput.value = "";
    const dirFilter = document.getElementById("directionFilter");
    if (dirFilter) dirFilter.value = "all";
    const currFilter = document.getElementById("currencyFilter");
    if (currFilter) currFilter.value = "all";
    const dateFilter = document.getElementById("datePresetFilter");
    if (dateFilter) dateFilter.value = "all";

    document.querySelectorAll("#categoryPillsContainer button").forEach(btn => {
        if (btn.getAttribute("data-category") === "all") {
            btn.className = "tx-prime-tab active px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap bg-cyan-400 text-slate-950 shadow-sm";
        } else {
            btn.className = "tx-prime-tab px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800/60";
        }
    });

    renderTable();
}
window.txResetHistoryFilters = resetHistoryFilters;

function getFilteredRows() {
    const all = TX_HISTORY_STATE.rawLedger || [];
    const search = String(TX_HISTORY_STATE.search || "").trim().toLowerCase();
    const curr = String(TX_HISTORY_STATE.currency || "all").toUpperCase();
    const dir = String(TX_HISTORY_STATE.direction || "all").toLowerCase();
    const cat = String(TX_HISTORY_STATE.activeCategory || "all").toLowerCase();
    const preset = String(TX_HISTORY_STATE.datePreset || "all").toLowerCase();
    const now = Date.now();

    return all.filter((item) => {
        // Category filter
        const itemCat = categorizeItem(item);
        if (cat !== "all" && itemCat !== cat) {
            return false;
        }

        // Currency filter
        const itemCurr = String(item.currency || "USDT").toUpperCase();
        if (curr !== "ALL" && itemCurr !== curr) {
            return false;
        }

        // Direction filter
        const itemDir = String(item.direction || "").toLowerCase();
        if (dir !== "all" && itemDir !== dir) {
            return false;
        }

        // Date Preset filter
        if (preset !== "all" && item.created_at) {
            const itemTime = new Date(item.created_at).getTime();
            if (!Number.isNaN(itemTime)) {
                const diffHours = (now - itemTime) / (1000 * 60 * 60);
                if (preset === "today" && diffHours > 24) return false;
                if (preset === "7d" && diffHours > 168) return false;
                if (preset === "30d" && diffHours > 720) return false;
                if (preset === "90d" && diffHours > 2160) return false;
            }
        }

        // Text Search
        if (search) {
            const type = String(item.transaction_type || "").toLowerCase();
            const desc = String(item.description || "").toLowerCase();
            const ref = String(item.reference_id || item.id || "").toLowerCase();
            const amt = String(item.amount || "");
            const acc = String(item._accountLabel || "").toLowerCase();
            if (!type.includes(search) && !desc.includes(search) && !ref.includes(search) && !amt.includes(search) && !acc.includes(search)) {
                return false;
            }
        }

        return true;
    });
}

function renderTable() {
    const tbody = document.getElementById("historyTableBody");
    const emptyState = document.getElementById("historyEmptyState");
    const paginationInfo = document.getElementById("paginationInfo");
    const paginationControls = document.getElementById("paginationControls");

    if (!tbody) return;

    const filtered = getFilteredRows();
    const total = filtered.length;
    const pageSize = Math.max(1, Number(TX_HISTORY_STATE.pageSize || 10));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, Number(TX_HISTORY_STATE.page || 1)), totalPages);
    TX_HISTORY_STATE.page = page;

    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    const rows = filtered.slice(start, end);

    if (total === 0) {
        tbody.innerHTML = "";
        emptyState?.classList.remove("hidden");
        if (paginationInfo) paginationInfo.textContent = "Showing 0 of 0 entries";
        if (paginationControls) paginationControls.innerHTML = "";
        return;
    }

    emptyState?.classList.add("hidden");

    tbody.innerHTML = rows.map((item) => {
        const cat = categorizeItem(item);
        const catBadge = getCategoryBadge(cat);
        const dirBadge = getDirectionBadge(item.direction);
        const statusBadge = getStatusBadge(item);
        const curr = item.currency || "USDT";
        const sign = String(item.direction || "").toLowerCase() === "credit" ? "+" : (String(item.direction || "").toLowerCase() === "debit" ? "-" : "");
        const colorClass = String(item.direction || "").toLowerCase() === "credit" ? "text-emerald-400" : (String(item.direction || "").toLowerCase() === "debit" ? "text-rose-400" : "text-cyan-300");

        const prettyTitle = String(item.transaction_type || "Transaction")
            .replaceAll("_", " ")
            .replace(/\b\w/g, c => c.toUpperCase());

        const desc = item.description || "";
        const refId = String(item.reference_id || item.id || "--");
        const shortRef = refId.length > 14 ? refId.slice(0, 6) + "..." + refId.slice(-4) : refId;
        const accBadge = item._accountLabel ? `<span class="inline-block px-2 py-0.5 rounded-md bg-slate-800/90 text-cyan-300 text-[10.5px] font-bold border border-slate-700">${item._accountLabel}</span>` : "";

        const dt = formatDate(item.created_at);

        const itemKey = refId !== "--" ? refId : (item.id || "");

        return `
            <tr ondblclick="txOpenTxDetailModal('${encodeURIComponent(itemKey)}')"
                title="Double-click to view complete transaction details"
                class="hover:bg-slate-900/80 transition duration-150 border-b border-white/[0.04] cursor-pointer select-none group">
                <td class="py-3.5 px-4 whitespace-nowrap">
                    <div class="font-bold text-slate-100 text-[13px] tracking-tight group-hover:text-cyan-300 transition">${dt.date}</div>
                    <div class="text-[11px] text-slate-400 font-mono mt-0.5">${dt.time}</div>
                </td>
                <td class="py-3.5 px-4">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-white text-[13px] tracking-tight group-hover:text-cyan-200 transition">${prettyTitle}</span>
                        ${accBadge}
                    </div>
                    ${desc ? `<p class="text-[12px] text-slate-400 mt-1 max-w-[280px] truncate leading-relaxed" title="${desc}">${desc}</p>` : ""}
                </td>
                <td class="py-3.5 px-4 whitespace-nowrap">
                    ${catBadge}
                </td>
                <td class="py-3.5 px-4 whitespace-nowrap">
                    ${dirBadge}
                </td>
                <td class="py-3.5 px-4 text-right font-mono font-bold ${colorClass} whitespace-nowrap text-[13.5px]">
                    ${sign}${formatMoney(item.amount, curr)}
                </td>
                <td class="py-3.5 px-4 text-right font-mono text-slate-300 font-semibold whitespace-nowrap text-[13px]">
                    ${item.balance_after !== undefined && item.balance_after !== null ? formatMoney(item.balance_after, curr) : "--"}
                </td>
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    ${statusBadge}
                </td>
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    ${refId !== "--" ? `
                        <button type="button" onclick="event.stopPropagation(); txCopyReferenceId('${refId}', this)" class="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80 hover:border-cyan-400/60 text-slate-300 hover:text-cyan-300 transition text-[11.5px] font-mono cursor-pointer shadow-sm" title="Click to copy full ID: ${refId}">
                            <span>${shortRef}</span>
                            <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                        </button>
                    ` : '<span class="text-slate-600">--</span>'}
                </td>
            </tr>
        `;
    }).join("");

    if (paginationInfo) {
        paginationInfo.textContent = `Showing ${start + 1}–${end} of ${total} entries`;
    }

    if (paginationControls) {
        const buttons = [];
        buttons.push(`
            <button type="button" data-action="prev" ${page <= 1 ? "disabled" : ""} class="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer">‹ Prev</button>
        `);
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
                buttons.push(`
                    <button type="button" data-page="${i}" class="px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${i === page ? 'border-cyan-400 bg-cyan-400 text-slate-950 font-black shadow-sm' : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800'}">${i}</button>
                `);
            } else if (buttons[buttons.length - 1] !== '<span class="px-1 text-slate-600">...</span>') {
                buttons.push('<span class="px-1 text-slate-600">...</span>');
            }
        }
        buttons.push(`
            <button type="button" data-action="next" ${page >= totalPages ? "disabled" : ""} class="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer">Next ›</button>
        `);
        paginationControls.innerHTML = buttons.join("");
    }
}

let CURRENT_DETAIL_MODAL_ITEM = null;

function txOpenTxDetailModal(refIdOrId) {
    if (!refIdOrId) return;
    const decodedId = decodeURIComponent(refIdOrId);
    const all = TX_HISTORY_STATE.rawLedger || [];
    const item = all.find(x => String(x.reference_id || "") === decodedId) ||
                 all.find(x => String(x.id || "") === decodedId) ||
                 all.find(x => String(x.reference_id || x.id || "").toLowerCase() === decodedId.toLowerCase());

    if (!item) return;
    CURRENT_DETAIL_MODAL_ITEM = item;

    const modal = document.getElementById("txDetailModal");
    if (!modal) return;

    const cat = categorizeItem(item);
    const curr = item.currency || "USDT";
    const dir = String(item.direction || "").toLowerCase();
    const sign = dir === "credit" ? "+" : (dir === "debit" ? "-" : "");
    const colorClass = dir === "credit" ? "text-emerald-400" : (dir === "debit" ? "text-rose-400" : "text-cyan-300");

    const prettyTitle = String(item.transaction_type || "Transaction")
        .replaceAll("_", " ")
        .replace(/\b\w/g, c => c.toUpperCase());

    const dt = formatDate(item.created_at);
    const refId = item.reference_id || item.id || "--";
    const accLabel = item._accountLabel || "Main Account";

    const titleEl = document.getElementById("txDetailModalTitle");
    if (titleEl) titleEl.textContent = prettyTitle;

    const amountEl = document.getElementById("txDetailModalAmount");
    if (amountEl) {
        amountEl.textContent = `${sign}${formatMoney(item.amount, curr)}`;
        amountEl.className = `text-2xl sm:text-3xl font-black font-mono tracking-tight ${colorClass}`;
    }

    const statusBadgeEl = document.getElementById("txDetailModalStatusBadge");
    if (statusBadgeEl) statusBadgeEl.innerHTML = getStatusBadge(item);

    const typeEl = document.getElementById("txDetailModalType");
    if (typeEl) typeEl.textContent = prettyTitle;

    const accEl = document.getElementById("txDetailModalAccount");
    if (accEl) accEl.textContent = accLabel;

    const catEl = document.getElementById("txDetailModalCategory");
    if (catEl) catEl.innerHTML = getCategoryBadge(cat);

    const dirEl = document.getElementById("txDetailModalDirection");
    if (dirEl) dirEl.innerHTML = getDirectionBadge(item.direction);

    const timeEl = document.getElementById("txDetailModalTimestamp");
    if (timeEl) timeEl.textContent = `${dt.date} • ${dt.time}`;

    const balEl = document.getElementById("txDetailModalBalanceAfter");
    if (balEl) {
        balEl.textContent = (item.balance_after !== undefined && item.balance_after !== null) ? formatMoney(item.balance_after, curr) : "--";
    }

    const refEl = document.getElementById("txDetailModalRefId");
    if (refEl) refEl.textContent = refId;

    const descEl = document.getElementById("txDetailModalDescription");
    if (descEl) descEl.textContent = item.description || "No additional description provided for this transaction.";

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    document.body.style.overflow = "hidden";
}
window.txOpenTxDetailModal = txOpenTxDetailModal;

function txCloseTxDetailModal() {
    const modal = document.getElementById("txDetailModal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
    document.body.style.overflow = "";
    CURRENT_DETAIL_MODAL_ITEM = null;
}
window.txCloseTxDetailModal = txCloseTxDetailModal;

function txCopyModalRefId() {
    if (!CURRENT_DETAIL_MODAL_ITEM) return;
    const refId = CURRENT_DETAIL_MODAL_ITEM.reference_id || CURRENT_DETAIL_MODAL_ITEM.id || "";
    if (!refId) return;
    const btn = document.getElementById("txDetailModalCopyBtn");
    txCopyReferenceId(refId, btn);
}
window.txCopyModalRefId = txCopyModalRefId;

document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") {
        txCloseTxDetailModal();
    }
});

function updateSummaryMetrics() {
    const all = TX_HISTORY_STATE.rawLedger || [];
    const statTotal = document.getElementById("statTotalCount");
    if (statTotal) statTotal.textContent = all.length.toLocaleString();

    const deposits = all.filter(item => categorizeItem(item) === "deposits");
    const statDep = document.getElementById("statDepositCount");
    if (statDep) statDep.textContent = deposits.length.toLocaleString();

    const withdrawals = all.filter(item => categorizeItem(item) === "withdrawals");
    const statWd = document.getElementById("statWithdrawCount");
    if (statWd) statWd.textContent = withdrawals.length.toLocaleString();

    const transfers = all.filter(item => categorizeItem(item) === "transfers");
    const statTx = document.getElementById("statTransferCount");
    if (statTx) statTx.textContent = transfers.length.toLocaleString();
}

async function loadSubAccountsList() {
    try {
        if (typeof apiRequest !== "function" || !isLoggedIn()) return;
        const res = await apiRequest("/user/sub-accounts").catch(() => null);
        const subList = res?.data || [];
        TX_HISTORY_STATE.subAccountsList = Array.isArray(subList) ? subList : [];

        renderAccountFilterOptions();
    } catch (e) {
        console.warn("Failed to load sub accounts for history filter:", e);
    }
}

function renderAccountFilterOptions() {
    const menu = document.getElementById("accountFilterMenu");
    const trigger = document.getElementById("accountFilterTrigger");
    if (!menu) return;

    const activeId = localStorage.getItem("traidiumx_active_user_id") || TX_HISTORY_STATE.selectedAccount || "main";
    let activeLabel = "Main Trading Account";

    let html = `
        <div class="tx-pill-dropdown-item ${activeId === "main" ? "is-selected" : ""}" data-value="main">
            <span>Main Trading Account</span>
            <svg class="tx-pill-dropdown-item-check" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
        </div>
    `;

    TX_HISTORY_STATE.subAccountsList.forEach(sub => {
        if (sub.is_parent) return; // Skip parent account duplicate
        const subId = String(sub.id || sub._id);
        const isDemo = sub.is_demo || sub.account_mode === "demo";
        const isSelected = activeId === subId;
        const displayName = `${sub.name || "Sub Account"} ${isDemo ? "(Demo)" : "(Real)"}`;
        if (isSelected) {
            activeLabel = displayName;
        }
        html += `
            <div class="tx-pill-dropdown-item ${isSelected ? "is-selected" : ""}" data-value="${subId}">
                <span>${displayName}</span>
                <svg class="tx-pill-dropdown-item-check" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
            </div>
        `;
    });

    const isAllSelected = activeId === "all";
    if (isAllSelected) activeLabel = "All Accounts (Combined)";

    html += `
        <div class="tx-pill-dropdown-item ${isAllSelected ? "is-selected" : ""}" data-value="all">
            <span>All Accounts (Combined)</span>
            <svg class="tx-pill-dropdown-item-check" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
        </div>
    `;

    menu.innerHTML = html;

    if (trigger) {
        const labelSpan = trigger.querySelector(".tx-dropdown-label");
        if (labelSpan) labelSpan.textContent = activeLabel;
    }

    TX_HISTORY_STATE.selectedAccount = activeId;

    // Attach click events to dynamically rendered options
    menu.querySelectorAll(".tx-pill-dropdown-item").forEach(item => {
        item.addEventListener("click", () => {
            const val = item.getAttribute("data-value");
            menu.querySelectorAll(".tx-pill-dropdown-item").forEach(i => i.classList.remove("is-selected"));
            item.classList.add("is-selected");

            const labelText = item.querySelector("span:not([class*='px-'])")?.textContent || item.innerText.trim();
            if (trigger) {
                const labelSpan = trigger.querySelector(".tx-dropdown-label");
                if (labelSpan) labelSpan.textContent = labelText;
            }

            const wrap = document.getElementById("accountFilterDropdown");
            if (wrap) wrap.classList.remove("is-open");

            TX_HISTORY_STATE.selectedAccount = val || "main";
            TX_HISTORY_STATE.page = 1;
            loadHistoryData();
        });
    });
}

async function loadHistoryData() {
    if (TX_HISTORY_STATE.loading) return;
    TX_HISTORY_STATE.loading = true;

    const spinner = document.getElementById("refreshSpinner");
    if (spinner) spinner.classList.add("animate-spin");

    try {
        if (typeof apiRequest !== "function" || !isLoggedIn()) {
            window.location.href = "./login.html";
            return;
        }

        const selectedAcc = TX_HISTORY_STATE.selectedAccount || "main";
        const subAccounts = TX_HISTORY_STATE.subAccountsList || [];

        if (selectedAcc === "all") {
            const targets = ["main", ...subAccounts.map(s => String(s.id || s._id)).filter(Boolean)];
            
            const promises = targets.map(tId => 
                Promise.all([
                    apiRequest(`/wallet/ledger?sub_account_id=${tId}`).catch(() => null),
                    apiRequest(`/deposit/history?sub_account_id=${tId}`).catch(() => null),
                    apiRequest(`/withdrawal/history?sub_account_id=${tId}`).catch(() => null)
                ])
            );

            const allResults = await Promise.all(promises);
            let combinedLedger = [];
            let combinedDeposits = [];
            let combinedWithdrawals = [];

            allResults.forEach(([ledgerRes, depositRes, withdrawRes], idx) => {
                const targetId = targets[idx];
                const accObj = subAccounts.find(s => String(s.id || s._id) === targetId);
                const accLabel = targetId === "main" ? "Main Account" : (accObj?.name || "Sub Account");

                if (ledgerRes && ledgerRes.data) {
                    const raw = ledgerRes.data.ledger || ledgerRes.data || [];
                    if (Array.isArray(raw)) {
                        raw.forEach(item => {
                            item._accountLabel = accLabel;
                            item._accountId = targetId;
                        });
                        combinedLedger.push(...raw);
                    }
                }
                if (depositRes && depositRes.data) {
                    const deps = depositRes.data.deposits || [];
                    if (Array.isArray(deps)) combinedDeposits.push(...deps);
                }
                if (withdrawRes && withdrawRes.data) {
                    const wds = withdrawRes.data.withdrawals || [];
                    if (Array.isArray(wds)) combinedWithdrawals.push(...wds);
                }
            });

            // Deduplicate and sort by created_at descending
            const seen = new Set();
            combinedLedger = combinedLedger.filter(item => {
                const id = String(item.id || item._id || `${item.created_at}_${item.reference_id}_${item._accountId}`);
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            });
            combinedLedger.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            TX_HISTORY_STATE.rawLedger = combinedLedger;
            TX_HISTORY_STATE.rawDeposits = combinedDeposits;
            TX_HISTORY_STATE.rawWithdrawals = combinedWithdrawals;
        } else {
            const [ledgerRes, depositRes, withdrawRes] = await Promise.all([
                apiRequest(`/wallet/ledger?sub_account_id=${selectedAcc}`).catch(() => null),
                apiRequest(`/deposit/history?sub_account_id=${selectedAcc}`).catch(() => null),
                apiRequest(`/withdrawal/history?sub_account_id=${selectedAcc}`).catch(() => null)
            ]);

            const accObj = subAccounts.find(s => String(s.id || s._id) === selectedAcc);
            const accLabel = selectedAcc === "main" ? "Main Account" : (accObj?.name || "Sub Account");

            if (ledgerRes && ledgerRes.data) {
                const raw = ledgerRes.data.ledger || ledgerRes.data || [];
                const arr = Array.isArray(raw) ? raw : [];
                arr.forEach(item => {
                    item._accountLabel = accLabel;
                    item._accountId = selectedAcc;
                });
                TX_HISTORY_STATE.rawLedger = arr;
            } else {
                TX_HISTORY_STATE.rawLedger = [];
            }

            if (depositRes && depositRes.data) {
                TX_HISTORY_STATE.rawDeposits = depositRes.data.deposits || [];
            } else {
                TX_HISTORY_STATE.rawDeposits = [];
            }

            if (withdrawRes && withdrawRes.data) {
                TX_HISTORY_STATE.rawWithdrawals = withdrawRes.data.withdrawals || [];
            } else {
                TX_HISTORY_STATE.rawWithdrawals = [];
            }
        }

        updateSummaryMetrics();
        renderTable();
    } catch (err) {
        console.error("Failed to load transfer history:", err);
    } finally {
        TX_HISTORY_STATE.loading = false;
        if (spinner) spinner.classList.remove("animate-spin");
    }
}

function exportCsv() {
    const filtered = getFilteredRows();
    if (!filtered || filtered.length === 0) {
        alert("No records to export.");
        return;
    }

    const headers = ["Date", "Account", "Type", "Category", "Direction", "Amount", "Currency", "Balance After", "Status", "Reference ID", "Description"];
    const rows = filtered.map(item => {
        const dt = formatDate(item.created_at);
        return [
            `"${dt.date} ${dt.time}"`,
            `"${item._accountLabel || 'Main Account'}"`,
            `"${item.transaction_type || ''}"`,
            `"${categorizeItem(item)}"`,
            `"${item.direction || ''}"`,
            item.amount || 0,
            `"${item.currency || 'USDT'}"`,
            item.balance_after || 0,
            `"${item.status || 'completed'}"`,
            `"${item.reference_id || item.id || ''}"`,
            `"${(item.description || '').replace(/"/g, '""')}"`
        ];
    });

    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `TraidiumX_Activity_History_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function setupCustomPillDropdown({ wrapId, triggerId, menuId, onChange }) {
    const wrap = document.getElementById(wrapId);
    const trigger = document.getElementById(triggerId);
    const menu = document.getElementById(menuId);
    if (!wrap || !trigger || !menu) return;

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = wrap.classList.contains("is-open");
        document.querySelectorAll(".tx-pill-dropdown-wrap.is-open").forEach(w => {
            if (w !== wrap) w.classList.remove("is-open");
        });
        wrap.classList.toggle("is-open", !isOpen);
    });

    menu.querySelectorAll(".tx-pill-dropdown-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            const val = item.getAttribute("data-value");
            menu.querySelectorAll(".tx-pill-dropdown-item").forEach(i => i.classList.remove("is-selected"));
            item.classList.add("is-selected");

            const labelSpan = trigger.querySelector(".tx-dropdown-label");
            const itemLabel = item.querySelector("span:not([class*='px-'])")?.textContent || item.innerText.trim();
            if (labelSpan) {
                labelSpan.textContent = itemLabel;
            }

            wrap.classList.remove("is-open");
            if (typeof onChange === "function") {
                onChange(val, item);
            }
        });
    });
}

function initEventHandlers() {
    // Category Tabs
    document.querySelectorAll("[data-category]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("[data-category]").forEach(b => {
                b.classList.remove("active");
                b.className = "tx-prime-tab px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800/60";
            });
            btn.classList.add("active");
            btn.className = "tx-prime-tab active px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap bg-cyan-400 text-slate-950 shadow-sm";
            TX_HISTORY_STATE.activeCategory = btn.getAttribute("data-category") || "all";
            TX_HISTORY_STATE.page = 1;
            renderTable();
        });
    });

    // Search Input
    document.getElementById("searchInput")?.addEventListener("input", (e) => {
        TX_HISTORY_STATE.search = e.target.value || "";
        TX_HISTORY_STATE.page = 1;
        renderTable();
    });

    // Date Preset Filter Dropdown
    setupCustomPillDropdown({
        wrapId: "datePresetDropdown",
        triggerId: "datePresetTrigger",
        menuId: "datePresetMenu",
        onChange: (val) => {
            TX_HISTORY_STATE.datePreset = val || "all";
            TX_HISTORY_STATE.page = 1;
            renderTable();
        }
    });

    // Account Filter Trigger Toggle
    const accWrap = document.getElementById("accountFilterDropdown");
    const accTrigger = document.getElementById("accountFilterTrigger");
    accTrigger?.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = accWrap?.classList.contains("is-open");
        document.querySelectorAll(".tx-pill-dropdown-wrap.is-open").forEach(w => {
            if (w !== accWrap) w.classList.remove("is-open");
        });
        accWrap?.classList.toggle("is-open", !isOpen);
    });

    // Direction Filter Dropdown
    setupCustomPillDropdown({
        wrapId: "directionFilterDropdown",
        triggerId: "directionFilterTrigger",
        menuId: "directionFilterMenu",
        onChange: (val) => {
            TX_HISTORY_STATE.direction = val || "all";
            TX_HISTORY_STATE.page = 1;
            renderTable();
        }
    });

    // Currency / Asset Filter Dropdown
    setupCustomPillDropdown({
        wrapId: "currencyFilterDropdown",
        triggerId: "currencyFilterTrigger",
        menuId: "currencyFilterMenu",
        onChange: (val) => {
            TX_HISTORY_STATE.currency = val || "all";
            TX_HISTORY_STATE.page = 1;
            renderTable();
        }
    });

    // Page Size Filter Dropdown
    setupCustomPillDropdown({
        wrapId: "pageSizeDropdown",
        triggerId: "pageSizeTrigger",
        menuId: "pageSizeMenu",
        onChange: (val) => {
            TX_HISTORY_STATE.pageSize = Number(val || 10);
            TX_HISTORY_STATE.page = 1;
            renderTable();
        }
    });

    // Global Click Outside & Escape Key Listener to Close Dropdowns
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".tx-pill-dropdown-wrap")) {
            document.querySelectorAll(".tx-pill-dropdown-wrap.is-open").forEach(w => w.classList.remove("is-open"));
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            document.querySelectorAll(".tx-pill-dropdown-wrap.is-open").forEach(w => w.classList.remove("is-open"));
        }
    });

    document.getElementById("refreshHistoryBtn")?.addEventListener("click", () => {
        loadHistoryData();
    });

    document.getElementById("exportCsvBtn")?.addEventListener("click", exportCsv);

    document.getElementById("paginationControls")?.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn || btn.disabled) return;
        const action = btn.getAttribute("data-action");
        const pageNum = Number(btn.getAttribute("data-page"));

        if (action === "prev") {
            TX_HISTORY_STATE.page = Math.max(1, TX_HISTORY_STATE.page - 1);
        } else if (action === "next") {
            TX_HISTORY_STATE.page += 1;
        } else if (pageNum) {
            TX_HISTORY_STATE.page = pageNum;
        }
        renderTable();
    });

    window.addEventListener("storage", (e) => {
        if (e.key === "traidiumx_active_user_id") {
            const newSubId = e.newValue || "main";
            TX_HISTORY_STATE.selectedAccount = newSubId;
            TX_HISTORY_STATE.page = 1;
            renderAccountFilterOptions();
            loadHistoryData();
        }
    });
}

window.txResetHistoryFilters = function() {
    TX_HISTORY_STATE.activeCategory = "all";
    TX_HISTORY_STATE.search = "";
    TX_HISTORY_STATE.datePreset = "all";
    TX_HISTORY_STATE.currency = "all";
    TX_HISTORY_STATE.direction = "all";
    TX_HISTORY_STATE.page = 1;

    const searchInp = document.getElementById("searchInput");
    if (searchInp) searchInp.value = "";

    document.querySelectorAll("[data-category]").forEach(b => {
        const cat = b.getAttribute("data-category");
        if (cat === "all") {
            b.classList.add("active");
            b.className = "tx-prime-tab active px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap bg-cyan-400 text-slate-950 shadow-sm";
        } else {
            b.classList.remove("active");
            b.className = "tx-prime-tab px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800/60";
        }
    });

    const dateTrigger = document.querySelector("#datePresetTrigger .tx-dropdown-label");
    if (dateTrigger) dateTrigger.textContent = "All Time";
    document.querySelectorAll("#datePresetMenu .tx-pill-dropdown-item").forEach(i => {
        i.classList.toggle("is-selected", i.getAttribute("data-value") === "all");
    });

    const dirTrigger = document.querySelector("#directionFilterTrigger .tx-dropdown-label");
    if (dirTrigger) dirTrigger.textContent = "All Directions";
    document.querySelectorAll("#directionFilterMenu .tx-pill-dropdown-item").forEach(i => {
        i.classList.toggle("is-selected", i.getAttribute("data-value") === "all");
    });

    const currTrigger = document.querySelector("#currencyFilterTrigger .tx-dropdown-label");
    if (currTrigger) currTrigger.textContent = "All Assets";
    document.querySelectorAll("#currencyFilterMenu .tx-pill-dropdown-item").forEach(i => {
        i.classList.toggle("is-selected", i.getAttribute("data-value") === "all");
    });

    renderTable();
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        initEventHandlers();
        loadSubAccountsList().then(() => {
            loadHistoryData();
        });
    });
} else {
    initEventHandlers();
    loadSubAccountsList().then(() => {
        loadHistoryData();
    });
}


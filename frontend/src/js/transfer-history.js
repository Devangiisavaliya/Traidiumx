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
    if (!value) return "--";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "--";
    return d.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
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
        transfers: '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-400/10 text-cyan-300 border border-cyan-400/20">Transfer</span>',
        deposits: '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">Deposit</span>',
        withdrawals: '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-400/10 text-rose-400 border border-rose-400/20">Withdrawal</span>',
        referral: '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400/10 text-amber-300 border border-amber-400/20">Referral Reward</span>',
        trading: '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-400/10 text-indigo-300 border border-indigo-400/20">Trading</span>',
        other: '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-400/10 text-slate-300 border border-slate-400/20">System</span>'
    };
    return map[category] || map.other;
}

function getDirectionBadge(direction) {
    const dir = String(direction || "").toLowerCase();
    if (dir === "credit" || dir === "in") {
        return '<span class="text-xs font-black text-emerald-400 uppercase">Credit (+)</span>';
    }
    if (dir === "debit" || dir === "out") {
        return '<span class="text-xs font-black text-rose-400 uppercase">Debit (-)</span>';
    }
    if (dir === "finalized") {
        return '<span class="text-xs font-black text-cyan-400 uppercase">Payout (✓)</span>';
    }
    return '<span class="text-xs font-black text-cyan-300 uppercase">Transfer (↔)</span>';
}

function getFilteredRows() {
    const all = TX_HISTORY_STATE.rawLedger || [];
    const search = String(TX_HISTORY_STATE.search || "").trim().toLowerCase();
    const curr = String(TX_HISTORY_STATE.currency || "all").toUpperCase();
    const dir = String(TX_HISTORY_STATE.direction || "all").toLowerCase();
    const cat = String(TX_HISTORY_STATE.activeCategory || "all").toLowerCase();

    return all.filter((item) => {
        const itemCat = categorizeItem(item);
        if (cat !== "all" && itemCat !== cat) {
            return false;
        }

        const itemCurr = String(item.currency || "USDT").toUpperCase();
        if (curr !== "ALL" && itemCurr !== curr) {
            return false;
        }

        const itemDir = String(item.direction || "").toLowerCase();
        if (dir !== "all" && itemDir !== dir) {
            return false;
        }

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
        const curr = item.currency || "USDT";
        const sign = String(item.direction || "").toLowerCase() === "credit" ? "+" : (String(item.direction || "").toLowerCase() === "debit" ? "-" : "");
        const colorClass = String(item.direction || "").toLowerCase() === "credit" ? "text-emerald-400" : (String(item.direction || "").toLowerCase() === "debit" ? "text-rose-400" : "text-cyan-300");

        const prettyTitle = String(item.transaction_type || "Transaction")
            .replaceAll("_", " ")
            .replace(/\b\w/g, c => c.toUpperCase());

        const desc = item.description || "";
        const ref = item.reference_id ? `<span class="font-mono text-[10px] text-slate-500 block mt-0.5">Ref: ${item.reference_id}</span>` : "";
        const accBadge = item._accountLabel ? `<span class="inline-block px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 text-[10px] font-bold border border-indigo-500/25 mt-0.5">🏷️ ${item._accountLabel}</span>` : "";

        return `
            <tr class="hover:bg-slate-900/60 transition duration-150">
                <td class="tx-table-cell text-slate-300 font-mono text-[12px] whitespace-nowrap">
                    ${formatDate(item.created_at)}
                </td>
                <td class="tx-table-cell max-w-sm">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="font-bold text-white">${prettyTitle}</span>
                        ${accBadge}
                    </div>
                    ${desc ? `<p class="text-[11px] text-slate-400 mt-0.5 line-clamp-2" title="${desc}">${desc}</p>` : ""}
                    ${ref}
                </td>
                <td class="tx-table-cell whitespace-nowrap">
                    ${catBadge}
                </td>
                <td class="tx-table-cell whitespace-nowrap">
                    ${dirBadge}
                </td>
                <td class="tx-table-cell font-mono font-bold ${colorClass} whitespace-nowrap text-sm">
                    ${sign}${formatMoney(item.amount, curr)}
                </td>
                <td class="tx-table-cell font-mono text-slate-300 whitespace-nowrap text-sm">
                    ${item.balance_after !== undefined && item.balance_after !== null ? formatMoney(item.balance_after, curr) : "--"}
                </td>
                <td class="tx-table-cell whitespace-nowrap">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        ✓ Completed
                    </span>
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
            <button type="button" data-action="prev" ${page <= 1 ? "disabled" : ""} class="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed">‹ Prev</button>
        `);
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
                buttons.push(`
                    <button type="button" data-page="${i}" class="px-2.5 py-1 rounded-lg border ${i === page ? 'border-cyan-400 bg-cyan-400/20 text-cyan-300 font-black' : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'}">${i}</button>
                `);
            } else if (buttons[buttons.length - 1] !== '<span class="px-1 text-slate-600">...</span>') {
                buttons.push('<span class="px-1 text-slate-600">...</span>');
            }
        }
        buttons.push(`
            <button type="button" data-action="next" ${page >= totalPages ? "disabled" : ""} class="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed">Next ›</button>
        `);
        paginationControls.innerHTML = buttons.join("");
    }
}

function updateSummaryMetrics() {
    const all = TX_HISTORY_STATE.rawLedger || [];
    document.getElementById("statTotalCount").textContent = all.length.toLocaleString();

    const deposits = all.filter(item => categorizeItem(item) === "deposits");
    document.getElementById("statDepositCount").textContent = deposits.length.toLocaleString();

    const withdrawals = all.filter(item => categorizeItem(item) === "withdrawals");
    document.getElementById("statWithdrawCount").textContent = withdrawals.length.toLocaleString();

    const transfers = all.filter(item => categorizeItem(item) === "transfers");
    document.getElementById("statTransferCount").textContent = transfers.length.toLocaleString();
}

async function loadSubAccountsList() {
    try {
        if (typeof apiRequest !== "function" || !isLoggedIn()) return;
        const res = await apiRequest("/user/sub-accounts").catch(() => null);
        const subList = res?.data || [];
        TX_HISTORY_STATE.subAccountsList = Array.isArray(subList) ? subList : [];

        const select = document.getElementById("accountFilter");
        if (select) {
            const activeId = localStorage.getItem("traidiumx_active_user_id") || "main";
            let html = `
                <option value="main" ${activeId === "main" ? "selected" : ""}>💼 Main Trading Account</option>
            `;

            TX_HISTORY_STATE.subAccountsList.forEach(sub => {
                const subId = String(sub.id || sub._id);
                const isSelected = activeId === subId;
                const modeIcon = (sub.is_demo || sub.account_mode === "demo") ? "🟡" : "📈";
                html += `<option value="${subId}" ${isSelected ? "selected" : ""}>${modeIcon} ${sub.name || "Sub Account"}</option>`;
            });

            html += `<option value="all">🌟 All Accounts (Combined)</option>`;
            select.innerHTML = html;

            TX_HISTORY_STATE.selectedAccount = select.value || "main";
        }
    } catch (e) {
        console.warn("Failed to load sub accounts for history filter:", e);
    }
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

    const headers = ["Date", "Account", "Type", "Category", "Direction", "Amount", "Currency", "Balance After", "Description", "Reference ID"];
    const rows = filtered.map(item => [
        `"${formatDate(item.created_at)}"`,
        `"${item._accountLabel || 'Main Account'}"`,
        `"${item.transaction_type || ''}"`,
        `"${categorizeItem(item)}"`,
        `"${item.direction || ''}"`,
        item.amount || 0,
        `"${item.currency || 'USDT'}"`,
        item.balance_after || 0,
        `"${(item.description || '').replace(/"/g, '""')}"`,
        `"${item.reference_id || ''}"`
    ]);

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

function initEventHandlers() {
    document.querySelectorAll("[data-category]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("[data-category]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            TX_HISTORY_STATE.activeCategory = btn.getAttribute("data-category") || "all";
            TX_HISTORY_STATE.page = 1;
            renderTable();
        });
    });

    document.getElementById("searchInput")?.addEventListener("input", (e) => {
        TX_HISTORY_STATE.search = e.target.value || "";
        TX_HISTORY_STATE.page = 1;
        renderTable();
    });

    document.getElementById("accountFilter")?.addEventListener("change", (e) => {
        TX_HISTORY_STATE.selectedAccount = e.target.value || "main";
        TX_HISTORY_STATE.page = 1;
        loadHistoryData();
    });

    document.getElementById("currencyFilter")?.addEventListener("change", (e) => {
        TX_HISTORY_STATE.currency = e.target.value || "all";
        TX_HISTORY_STATE.page = 1;
        renderTable();
    });

    document.getElementById("directionFilter")?.addEventListener("change", (e) => {
        TX_HISTORY_STATE.direction = e.target.value || "all";
        TX_HISTORY_STATE.page = 1;
        renderTable();
    });

    document.getElementById("pageSizeSelect")?.addEventListener("change", (e) => {
        TX_HISTORY_STATE.pageSize = Number(e.target.value || 10);
        TX_HISTORY_STATE.page = 1;
        renderTable();
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
            const select = document.getElementById("accountFilter");
            if (select) select.value = newSubId;
            TX_HISTORY_STATE.selectedAccount = newSubId;
            TX_HISTORY_STATE.page = 1;
            loadHistoryData();
        }
    });
}

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

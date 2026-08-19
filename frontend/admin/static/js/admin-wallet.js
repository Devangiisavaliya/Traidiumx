

"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const ui = window.TXAdmin;
    const api = window.TXAdminApi;
    if (!ui || !api || !api.requireAuth()) return;

    const pendingStatuses = ["pending", "pending_payout", "pending_admin_approval", "queued"];
    let withdrawalsState = { page: 1, limit: 25, total: 0, rows: [] };
    let ledgerState = { page: 1, limit: 25, total: 0, rows: [] };
    let searchTimer = null;
    let withdrawalRefreshTimer = null;
    let withdrawalRequestSeq = 0;

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }


    function relabelTradingFeeText(value) {
        return String(value || "")
            .replace(/trading_fee_debit/gi, "Trading Fee Debit")
            .replace(/platform_fee_debit/gi, "Platform Fee Debit")
            .replace(/account_platform_fee/gi, "Platform Fee");
    }

    function normalizeWithdrawal(item) {
        const id = api.getId(item);
        const user = item.user || {};
        return {
            id,
            reference: item.withdrawal_reference || id,
            userId: item.user_id || user.id || user._id || "",
            user: api.userLabel(item),
            email: api.userEmail(item),
            phone: item.phone || user.phone || "",
            method: item.withdrawal_method || item.method || "crypto_withdrawal",
            network: item.crypto_network || item.network || "-",
            amount: api.number(item.amount || item.final_amount || item.locked_amount),
            networkFee: api.number(item.network_fee || item.fee),
            companyFee: api.number(item.withdrawal_fee),
            totalFee: api.number(item.total_fee || (api.number(item.network_fee || item.fee) + api.number(item.withdrawal_fee))),
            lockedAmount: api.number(item.locked_amount || item.amount || item.final_amount),
            fee: api.number(item.total_fee || (api.number(item.network_fee || item.fee) + api.number(item.withdrawal_fee))),
            finalAmount: api.number(item.final_amount || item.amount || item.locked_amount),
            asset: item.currency || item.crypto_asset || item.asset || "USDT",
            status: item.status || "pending",
            requestedAt: api.fmtDate(item.created_at || item.requested_at),
            approvedAt: api.fmtDate(item.approved_at || item.completed_at),
            rejectedAt: api.fmtDate(item.rejected_at),
            risk: item.risk_level || item.risk || "low",
            account: item.withdrawal_address || item.bank_account || item.upi_id || item.destination || "-",
            txHash: item.tx_hash || "",
            explorerUrl: item.explorer_url || "",
            payoutReference: item.payout_reference || "",
            remark: item.remark || item.admin_note || item.reject_reason || ""
        };
    }

    function getAdminItemCurrency(item) {
        if (!item) return "USDT";
        const cur = String(item.currency || "").toUpperCase();
        if (cur === "INR" || cur === "USDT") {
            return cur;
        }
        const type = String(item.transaction_type || item.type || "").toLowerCase();
        const desc = String(item.description || item.note || "").toLowerCase();

        if (type.includes("inr") || desc.includes("inr") || desc.includes("₹")) {
            return "INR";
        }
        if (type.includes("crypto") || type.includes("usdt") || desc.includes("usdt") || desc.includes("verified usdt") || desc.includes("$")) {
            return "USDT";
        }
        return "USDT";
    }

    function normalizeLedger(item) {
        return {
            id: api.getId(item),
            user: api.userLabel(item) || item.user_id || "-",
            email: api.userEmail(item),
            type: relabelTradingFeeText(item.transaction_type || item.type || "wallet_entry"),
            direction: item.direction || (api.number(item.amount) >= 0 ? "credit" : "debit"),
            amount: api.number(item.amount),
            currency: getAdminItemCurrency(item),
            balance: api.number(item.balance_after || item.balance || item.available_balance_after),
            ref: item.reference_id || item.reference || item.ref || "-",
            description: relabelTradingFeeText(item.description || item.note || ""),
            date: api.fmtDate(item.created_at || item.date)
        };
    }

    function fmtLedgerMoney(value, currency) {
        const num = api.number(value);
        const cur = String(currency || "USDT").toUpperCase();
        if (cur === "INR" || cur === "₹") {
            return `₹ ${num.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        }
        return `$ ${num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }

    function isWithdrawalFinalizedLedger(item) {
        return String(item?.transaction_type || item?.type || "").toLowerCase() === "withdrawal_completed";
    }

    function withdrawalFinalizedDescription(description) {
        const text = String(description || "").trim();
        const note = "Locked withdrawal amount finalized. No extra debit was taken from available balance.";
        if (!text) return note;
        return /no extra debit|already locked|finalized/i.test(text) ? text : `${text}. ${note}`;
    }

    function currentWithdrawalParams() {
        return {
            page: withdrawalsState.page,
            limit: withdrawalsState.limit,
            search: document.getElementById("withdrawalSearch")?.value.trim() || "",
            currency: document.getElementById("withdrawalCurrencyFilter")?.value || "all",
            status: document.getElementById("withdrawalStatusFilter")?.value || "all"
        };
    }

    function currentLedgerParams() {
        return {
            page: ledgerState.page,
            limit: ledgerState.limit,
            search: document.getElementById("ledgerSearch")?.value.trim() || "",
            currency: document.getElementById("ledgerCurrencyFilter")?.value || "all",
            transaction_type: document.getElementById("ledgerTypeFilter")?.value || "all",
            direction: document.getElementById("ledgerDirectionFilter")?.value || "all"
        };
    }

    function paginationMeta(meta, state) {
        const total = Number(meta?.total || 0);
        const page = Number(meta?.page || state.page || 1);
        const limit = Number(meta?.limit || state.limit || 25);
        const totalPages = Number(meta?.total_pages || meta?.pages || Math.max(Math.ceil(total / limit), 1));
        return { total, page, limit, totalPages };
    }

    function renderPagination(containerId, meta, onPage, onLimit) {
        const box = document.getElementById(containerId);
        if (!box) return;
        const { total, page, limit, totalPages } = meta;
        if (!total) {
            box.innerHTML = "";
            return;
        }
        const start = (page - 1) * limit + 1;
        const end = Math.min(page * limit, total);
        const pages = [];
        const from = Math.max(1, page - 2);
        const to = Math.min(totalPages, page + 2);
        if (from > 1) pages.push(1);
        if (from > 2) pages.push("...");
        for (let i = from; i <= to; i += 1) pages.push(i);
        if (to < totalPages - 1) pages.push("...");
        if (to < totalPages) pages.push(totalPages);

        box.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p class="text-xs font-bold text-slate-400">Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${total.toLocaleString()}</p>
                <div class="flex flex-wrap items-center gap-2">
                    <button class="admin-btn py-2" data-page-action="prev" ${page <= 1 ? "disabled" : ""}>Prev</button>
                    ${pages.map(item => item === "..." ? `<span class="px-2 text-slate-500">...</span>` : `<button class="admin-btn py-2 ${item === page ? "admin-btn-primary" : ""}" data-page="${item}">${item}</button>`).join("")}
                    <button class="admin-btn py-2" data-page-action="next" ${page >= totalPages ? "disabled" : ""}>Next</button>
                    <select class="admin-input !w-24" data-page-limit>
                        ${[10, 25, 50, 100].map(size => `<option value="${size}" ${size === limit ? "selected" : ""}>${size}</option>`).join("")}
                    </select>
                </div>
            </div>
        `;

        box.querySelectorAll("[data-page]").forEach(btn => btn.addEventListener("click", () => onPage(Number(btn.dataset.page))));
        box.querySelector("[data-page-action='prev']")?.addEventListener("click", () => onPage(Math.max(page - 1, 1)));
        box.querySelector("[data-page-action='next']")?.addEventListener("click", () => onPage(Math.min(page + 1, totalPages)));
        box.querySelector("[data-page-limit]")?.addEventListener("change", (e) => onLimit(Number(e.target.value)));
    }


    function money(value) {
        return ui.money(api.number(value));
    }

    function statusLabel(value) {
        const text = String(value || "unknown").toLowerCase();
        const labels = {
            pending: "Pending",
            pending_payout: "Pending Payout",
            pending_admin_approval: "Pending Approval",
            queued: "Queued",
            approved: "Approved",
            completed: "Completed",
            rejected: "Rejected",
            cancelled: "Cancelled",
            canceled: "Cancelled",
            failed: "Failed"
        };
        return labels[text] || text.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
    }

    function riskLabel(value) {
        return String(value || "low").toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
    }

    function getCurrentWithdrawal(id) {
        const listMatch = (withdrawalsState.rows || []).find((item) => String(api.getId(item)) === String(id));
        if (listMatch) return normalizeWithdrawal(listMatch);

        const detailRef = document.getElementById("withdrawalDetailCard")?.dataset.currentWithdrawal;
        if (detailRef) {
            try {
                const parsed = JSON.parse(detailRef);
                if (String(parsed.id) === String(id)) return parsed;
            } catch (error) {
                return null;
            }
        }
        return null;
    }

    function injectDecisionModalStyles() {
        if (document.getElementById("txWithdrawalDecisionStyles")) return;

        const style = document.createElement("style");
        style.id = "txWithdrawalDecisionStyles";
        style.textContent = `
            .tx-withdrawal-modal-backdrop {
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
            .tx-withdrawal-modal-card {
                width: min(560px, 100%);
                border-radius: 28px;
                border: 1px solid rgba(148, 163, 184, 0.24);
                background: linear-gradient(180deg, #101827, #060a14);
                box-shadow: 0 28px 90px rgba(0, 0, 0, 0.62);
                padding: 26px;
                color: #e5e7eb;
                animation: txWithdrawalIn 0.18s ease-out;
            }
            .tx-withdrawal-modal-top {
                display: flex;
                gap: 16px;
                align-items: flex-start;
            }
            .tx-withdrawal-modal-icon {
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
            .tx-withdrawal-modal-icon.approve {
                color: #86efac;
                background: rgba(34, 197, 94, 0.12);
                border-color: rgba(34, 197, 94, 0.28);
            }
            .tx-withdrawal-modal-icon.reject {
                color: #fca5a5;
                background: rgba(239, 68, 68, 0.12);
                border-color: rgba(239, 68, 68, 0.30);
            }
            .tx-withdrawal-modal-title {
                margin: 0;
                font-size: 22px;
                line-height: 1.15;
                font-weight: 900;
                letter-spacing: -0.03em;
                color: #ffffff;
            }
            .tx-withdrawal-modal-message {
                margin: 8px 0 0;
                color: #94a3b8;
                line-height: 1.55;
                font-size: 14px;
            }
            .tx-withdrawal-modal-summary {
                margin-top: 18px;
                display: grid;
                gap: 10px;
                grid-template-columns: repeat(3, minmax(0, 1fr));
            }
            .tx-withdrawal-modal-box {
                border-radius: 18px;
                border: 1px solid rgba(148, 163, 184, 0.14);
                background: rgba(255, 255, 255, 0.04);
                padding: 12px;
            }
            .tx-withdrawal-modal-box span {
                display: block;
                color: #64748b;
                font-size: 11px;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 0.12em;
            }
            .tx-withdrawal-modal-box strong {
                display: block;
                margin-top: 5px;
                color: #f8fafc;
                font-size: 13px;
                font-weight: 900;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .tx-withdrawal-modal-address {
                margin-top: 14px;
                border-radius: 20px;
                border: 1px solid rgba(34, 211, 238, 0.24);
                background: linear-gradient(135deg, rgba(8, 47, 73, 0.52), rgba(15, 23, 42, 0.72));
                padding: 13px;
            }
            .tx-withdrawal-modal-address-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin-bottom: 9px;
            }
            .tx-withdrawal-modal-address-head span {
                color: #67e8f9;
                font-size: 11px;
                font-weight: 900;
                letter-spacing: 0.12em;
                text-transform: uppercase;
            }
            .tx-withdrawal-modal-copy {
                border: 1px solid rgba(103, 232, 249, 0.35);
                border-radius: 999px;
                background: rgba(8, 145, 178, 0.12);
                color: #e0f2fe;
                padding: 8px 12px;
                font-size: 12px;
                font-weight: 900;
                cursor: pointer;
            }
            .tx-withdrawal-modal-copy.copied {
                border-color: rgba(52, 211, 153, 0.45);
                background: rgba(16, 185, 129, 0.16);
                color: #bbf7d0;
            }
            .tx-withdrawal-copy-status {
                display: none;
                margin-top: 8px;
                border-radius: 12px;
                border: 1px solid rgba(52, 211, 153, 0.28);
                background: rgba(6, 78, 59, 0.22);
                color: #bbf7d0;
                padding: 8px 10px;
                font-size: 12px;
                font-weight: 900;
            }
            .tx-withdrawal-modal-address-value {
                width: 100%;
                min-height: 44px;
                border-radius: 15px;
                border: 1px solid rgba(148, 163, 184, 0.20);
                background: rgba(2, 6, 23, 0.56);
                color: #ffffff;
                padding: 12px 13px;
                font-size: 13px;
                font-weight: 900;
                line-height: 1.45;
                word-break: break-all;
                text-align: left;
            }
            .tx-withdrawal-modal-address-note {
                margin-top: 8px;
                color: #cbd5e1;
                font-size: 12px;
                font-weight: 700;
                line-height: 1.5;
            }
            .tx-withdrawal-modal-field {
                margin-top: 14px;
            }
            .tx-withdrawal-modal-label {
                display: block;
                margin-bottom: 7px;
                color: #94a3b8;
                font-size: 12px;
                font-weight: 900;
            }
            .tx-withdrawal-modal-input,
            .tx-withdrawal-modal-textarea {
                width: 100%;
                border-radius: 16px;
                border: 1px solid rgba(148, 163, 184, 0.18);
                background: rgba(15, 23, 42, 0.72);
                color: #ffffff;
                outline: none;
                padding: 13px 14px;
                font-size: 14px;
                font-weight: 700;
            }
            .tx-withdrawal-modal-textarea {
                min-height: 105px;
                resize: vertical;
            }
            .tx-withdrawal-modal-error {
                display: none;
                margin-top: 10px;
                border-radius: 14px;
                border: 1px solid rgba(244, 63, 94, 0.26);
                background: rgba(244, 63, 94, 0.12);
                color: #fecdd3;
                padding: 10px 12px;
                font-size: 12px;
                font-weight: 800;
            }
            .tx-withdrawal-modal-actions {
                display: flex;
                justify-content: flex-end;
                gap: 12px;
                margin-top: 22px;
            }
            .tx-withdrawal-modal-btn {
                border: 0;
                border-radius: 15px;
                padding: 12px 18px;
                font-size: 13px;
                font-weight: 900;
                cursor: pointer;
                transition: transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
            }
            .tx-withdrawal-modal-btn:hover { transform: translateY(-1px); }
            .tx-withdrawal-modal-btn.cancel {
                color: #cbd5e1;
                background: rgba(148, 163, 184, 0.12);
                border: 1px solid rgba(148, 163, 184, 0.20);
            }
            .tx-withdrawal-modal-btn.approve {
                color: #052e16;
                background: linear-gradient(135deg, #86efac, #22c55e);
                box-shadow: 0 16px 34px rgba(34, 197, 94, 0.18);
            }
            .tx-withdrawal-modal-btn.reject {
                color: #ffffff;
                background: linear-gradient(135deg, #fb7185, #f97316);
                box-shadow: 0 16px 34px rgba(251, 113, 133, 0.20);
            }
            @keyframes txWithdrawalIn {
                from { opacity: 0; transform: translateY(12px) scale(0.96); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            @media (max-width: 620px) {
                .tx-withdrawal-modal-card { padding: 22px; border-radius: 22px; }
                .tx-withdrawal-modal-summary { grid-template-columns: 1fr; }
                .tx-withdrawal-modal-actions { flex-direction: column-reverse; }
                .tx-withdrawal-modal-btn { width: 100%; }
            }
            body.admin-light-mode .tx-withdrawal-modal-card {
                background: #ffffff;
                border-color: #cbd5e1;
                color: #0f172a;
                box-shadow: 0 28px 90px rgba(0, 0, 0, 0.11);
            }
            body.admin-light-mode .tx-withdrawal-modal-title {
                color: #0f172a;
            }
            body.admin-light-mode .tx-withdrawal-modal-message {
                color: #475569;
            }
            body.admin-light-mode .tx-withdrawal-modal-box {
                border-color: #cbd5e1;
                background: #f8fafc;
            }
            body.admin-light-mode .tx-withdrawal-modal-box span {
                color: #64748b;
            }
            body.admin-light-mode .tx-withdrawal-modal-box strong {
                color: #0f172a;
            }
            body.admin-light-mode .tx-withdrawal-modal-address {
                border-color: #cbd5e1;
                background: linear-gradient(135deg, #f0f9ff, #f8fafc);
            }
            body.admin-light-mode .tx-withdrawal-modal-address-head span {
                color: #0891b2;
            }
            body.admin-light-mode .tx-withdrawal-modal-copy {
                border-color: #cbd5e1;
                background: #f1f5f9;
                color: #0f172a;
            }
            body.admin-light-mode .tx-withdrawal-modal-copy:hover {
                background: #e2e8f0;
            }
            body.admin-light-mode .tx-withdrawal-modal-copy.copied {
                border-color: #86efac;
                background: #f0fdf4;
                color: #166534;
            }
            body.admin-light-mode .tx-withdrawal-copy-status {
                border-color: #86efac;
                background: #f0fdf4;
                color: #166534;
            }
            body.admin-light-mode .tx-withdrawal-modal-address-value {
                border-color: #cbd5e1;
                background: #ffffff;
                color: #0f172a;
            }
            body.admin-light-mode .tx-withdrawal-modal-address-note {
                color: #475569;
            }
            body.admin-light-mode .tx-withdrawal-modal-label {
                color: #475569;
            }
            body.admin-light-mode .tx-withdrawal-modal-input,
            body.admin-light-mode .tx-withdrawal-modal-textarea {
                border-color: #cbd5e1;
                background: #ffffff;
                color: #0f172a;
            }
            body.admin-light-mode .tx-withdrawal-modal-btn.cancel {
                color: #0f172a;
                background: #f1f5f9;
                border-color: #cbd5e1;
            }
            body.admin-light-mode .tx-withdrawal-modal-btn.cancel:hover {
                background: #e2e8f0;
            }
        `;
        document.head.appendChild(style);
    }

    function openDecisionModal({ id, action, withdrawal, defaultReason = "", defaultPayoutReference = "" }) {
        injectDecisionModalStyles();

        function validateAddress(address, network) {
            const addr = String(address || "").trim();
            const net = String(network || "").toUpperCase();
            if (net === "TRC20") {
                return /^T[a-zA-Z0-9]{33}$/.test(addr);
            }
            if (net === "ERC20" || net === "BEP20") {
                return /^0x[a-fA-F0-9]{40}$/.test(addr);
            }
            return true;
        }

        return new Promise((resolve) => {
            const oldModal = document.getElementById("txWithdrawalDecisionModal");
            if (oldModal) oldModal.remove();

            const isApprove = action === "approve";
            const withdrawalAddress = String(withdrawal?.account || withdrawal?.withdrawal_address || withdrawal?.destination || "").trim();
            const withdrawalAddressLabel = withdrawalAddress || "-";
            const isValidAddress = isApprove ? validateAddress(withdrawalAddress, withdrawal?.network) : true;
            const displayPayoutReference = defaultPayoutReference || (isApprove && isValidAddress ? withdrawalAddress : "");
            
            const modal = document.createElement("div");
            modal.id = "txWithdrawalDecisionModal";
            modal.innerHTML = `
                <div class="tx-withdrawal-modal-backdrop">
                    <div class="tx-withdrawal-modal-card" role="dialog" aria-modal="true">
                        <div class="tx-withdrawal-modal-top">
                            <div class="tx-withdrawal-modal-icon ${isApprove ? "approve" : "reject"}">${isApprove ? "✓" : "!"}</div>
                            <div>
                                <h3 class="tx-withdrawal-modal-title">${isApprove ? "Approve Withdrawal?" : "Reject Withdrawal?"}</h3>
                                <p class="tx-withdrawal-modal-message">
                                    ${isApprove
                                        ? "This will finally debit the locked withdrawal amount from the user's wallet."
                                        : "This will release the locked amount back to the user's available wallet balance."}
                                </p>
                            </div>
                        </div>

                        <div class="tx-withdrawal-modal-summary">
                            <div class="tx-withdrawal-modal-box"><span>User</span><strong title="${api.escapeHtml(withdrawal?.email || withdrawal?.user || "-")}">${api.escapeHtml(withdrawal?.user || "Unknown")}</strong></div>
                            <div class="tx-withdrawal-modal-box"><span>Amount</span><strong>${api.escapeHtml(withdrawal?.asset || "USDT")} ${api.number(withdrawal?.amount || 0).toLocaleString()}</strong></div>
                            <div class="tx-withdrawal-modal-box"><span>Network</span><strong>${api.escapeHtml(withdrawal?.network || "-")}</strong></div>
                        </div>

                        ${isApprove ? `
                            <div class="tx-withdrawal-modal-address">
                                <div class="tx-withdrawal-modal-address-head">
                                    <span>User Withdrawal Address</span>
                                    <button type="button" class="tx-withdrawal-modal-copy" data-copy="${api.escapeHtml(withdrawalAddressLabel)}">Copy Address</button>
                                </div>
                                <div class="tx-withdrawal-modal-address-value" title="${api.escapeHtml(withdrawalAddressLabel)}">${api.escapeHtml(withdrawalAddressLabel)}</div>
                                <div id="txWithdrawalCopyStatus" class="tx-withdrawal-copy-status">Address copied successfully.</div>
                                <div class="tx-withdrawal-modal-address-note">Send payout only to this user address on ${api.escapeHtml(withdrawal?.network || "selected")} network. After sending, paste payout TX hash below.</div>
                                ${!isValidAddress ? `
                                <div id="txWithdrawalAddressWarning" style="color: #b91c1c; background: rgba(220, 38, 38, 0.08); border: 1px solid rgba(220, 38, 38, 0.2); border-radius: 8px; padding: 10px 12px; font-size: 12px; font-weight: bold; margin-top: 8px; display: block; text-align: left; line-height: 1.5;">
                                    ⚠️ Warning: Invalid ${api.escapeHtml(withdrawal?.network || "selected")} address format!
                                </div>` : ""}
                            </div>
                            <div class="tx-withdrawal-modal-field">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                                    <label class="tx-withdrawal-modal-label" style="margin-bottom: 0;">Payout TX hash required</label>
                                    <button type="button" id="txWithdrawalMetaMaskBtn" class="tx-withdrawal-modal-copy" style="background: #eab308; color: #000; border-color: #eab308; display: none; font-size: 11px; padding: 4px 8px;">Payout via MetaMask</button>
                                </div>
                                <input id="txWithdrawalPayoutInput" class="tx-withdrawal-modal-input" value="${api.escapeHtml(displayPayoutReference)}" placeholder="Paste payout transaction hash / TXID after payout" />
                                <div id="txWithdrawalMetaMaskStatus" style="display: none; font-size: 11px; font-weight: bold; color: #10b981; margin-top: 4px; line-height: 1.3;"></div>
                            </div>
                        ` : ""}

                        <div class="tx-withdrawal-modal-field">
                            <label class="tx-withdrawal-modal-label">${isApprove ? "Approval note" : "Reject reason"}</label>
                            <textarea id="txWithdrawalReasonInput" class="tx-withdrawal-modal-textarea" placeholder="${isApprove ? "Approved by admin." : "Enter reason for rejecting this withdrawal"}">${api.escapeHtml(defaultReason)}</textarea>
                            <div id="txWithdrawalModalError" class="tx-withdrawal-modal-error">Required field is missing.</div>
                        </div>

                        <div class="tx-withdrawal-modal-actions">
                            <button type="button" class="tx-withdrawal-modal-btn cancel" id="txWithdrawalCancelBtn">Cancel</button>
                            <button type="button" class="tx-withdrawal-modal-btn ${isApprove ? "approve" : "reject"}" id="txWithdrawalConfirmBtn">
                                ${isApprove ? "Yes, Approve" : "Yes, Reject"}
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
                if (event.key === "Escape") close(null);
            }

            document.addEventListener("keydown", escHandler);

            modal.querySelector("#txWithdrawalCancelBtn")?.addEventListener("click", () => close(null));
            modal.querySelector(".tx-withdrawal-modal-backdrop")?.addEventListener("click", (event) => {
                if (event.target.classList.contains("tx-withdrawal-modal-backdrop")) close(null);
            });

            async function copyWithdrawalAddress(button) {
                const text = String(button?.dataset.copy || "").trim();
                if (!text || text === "-") return;
                try {
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(text);
                    } else {
                        const temp = document.createElement("textarea");
                        temp.value = text;
                        temp.setAttribute("readonly", "");
                        temp.style.position = "fixed";
                        temp.style.left = "-9999px";
                        document.body.appendChild(temp);
                        temp.select();
                        document.execCommand("copy");
                        temp.remove();
                    }
                    const status = modal.querySelector("#txWithdrawalCopyStatus");
                    const original = button.dataset.originalText || button.textContent || "Copy Address";
                    button.dataset.originalText = original;
                    button.textContent = "Copied ✓";
                    button.classList.add("copied");
                    if (status) {
                        status.textContent = "Address copied successfully.";
                        status.style.display = "block";
                    }
                    setTimeout(() => {
                        if (!document.body.contains(modal)) return;
                        button.textContent = button.dataset.originalText || "Copy Address";
                        button.classList.remove("copied");
                    }, 1600);
                } catch (error) {
                    const status = modal.querySelector("#txWithdrawalCopyStatus");
                    if (status) {
                        status.textContent = "Copy failed. Please select and copy address manually.";
                        status.style.display = "block";
                    }
                }
            }

            modal.querySelectorAll(".tx-withdrawal-modal-copy").forEach(btn => {
                if (btn.id === "txWithdrawalMetaMaskBtn") return; // separate listener
                btn.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    copyWithdrawalAddress(event.currentTarget);
                });
            });

            // Show MetaMask Button if applicable
            const showMetaMaskBtn = isApprove && ["ERC20", "BEP20"].includes(String(withdrawal?.network || "").toUpperCase());
            if (showMetaMaskBtn && typeof window.ethereum !== "undefined") {
                const metamaskBtn = modal.querySelector("#txWithdrawalMetaMaskBtn");
                if (metamaskBtn) {
                    metamaskBtn.style.display = "inline-block";
                }
            }

            modal.querySelector("#txWithdrawalMetaMaskBtn")?.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();

                const btn = event.currentTarget;
                const statusDiv = modal.querySelector("#txWithdrawalMetaMaskStatus");
                const payoutInput = modal.querySelector("#txWithdrawalPayoutInput");
                const originalText = btn.textContent;

                const setStatus = (msg, isError = false) => {
                    if (statusDiv) {
                        statusDiv.textContent = msg;
                        statusDiv.style.color = isError ? "#f43f5e" : "#10b981";
                        statusDiv.style.display = "block";
                    }
                };

                try {
                    btn.disabled = true;
                    btn.textContent = "Connecting...";
                    setStatus("Please check MetaMask popup...", false);

                    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
                    const adminAddress = accounts[0];

                    btn.textContent = "Switching Chain...";

                    // Switch chain to Sepolia (0xaa36a7) or BSC Testnet (0x61) depending on network
                    const isBep20 = String(withdrawal?.network || "").toUpperCase() === "BEP20";
                    const chainId = isBep20 ? "0x61" : "0xaa36a7";

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

                    btn.textContent = "Processing...";
                    setStatus("Confirm payout in MetaMask...", false);

                    let txParams;
                    const asset = String(withdrawal?.asset || "ETH").toUpperCase();
                    const amount = parseFloat(withdrawal?.amount || 0);

                    if (asset === "BTC") {
                        // ERC20 Token transfer (custom BTC token on Sepolia)
                        btn.textContent = "Loading configuration...";
                        const settingsResponse = await api.request("/settings");
                        const btcContract = settingsResponse?.crypto_deposit_btc_contract_address || "";
                        if (!btcContract) {
                            throw new Error("BTC ERC20 Contract Address is not configured on settings.");
                        }

                        const cleanToAddress = withdrawalAddress.replace("0x", "").toLowerCase().padStart(64, "0");
                        const decimals = 18; 
                        const tokenAmountWei = BigInt(Math.floor(amount * Math.pow(10, decimals)));
                        const cleanAmount = tokenAmountWei.toString(16).padStart(64, "0");
                        const txData = "0xa9059cbb" + cleanToAddress + cleanAmount;

                        txParams = {
                            from: adminAddress,
                            to: btcContract,
                            value: "0x0",
                            data: txData,
                            gas: "0x186a0" // 100,000 gas limit for ERC20
                        };
                    } else {
                        // Native transfer (ETH/tBNB)
                        const weiValue = "0x" + BigInt(Math.floor(amount * 1e18)).toString(16);
                        txParams = {
                            from: adminAddress,
                            to: withdrawalAddress,
                            value: weiValue,
                            gas: "0x5208" // 21,000 gas
                        };
                    }

                    btn.textContent = "Sending...";
                    const txHash = await window.ethereum.request({
                        method: "eth_sendTransaction",
                        params: [txParams]
                    });

                    if (payoutInput) {
                        payoutInput.value = txHash;
                    }

                    btn.textContent = "Payout Sent ✓";
                    setStatus("MetaMask payment complete! TX Hash populated.", false);
                } catch (err) {
                    console.error("MetaMask Payout Error:", err);
                    btn.textContent = "Failed";
                    setStatus(err.message || "MetaMask payment failed.", true);
                } finally {
                    btn.disabled = false;
                    setTimeout(() => {
                        if (btn.textContent === "Payout Sent ✓" || btn.textContent === "Failed") {
                            btn.textContent = originalText;
                        }
                    }, 3000);
                }
            });

            modal.querySelector("#txWithdrawalConfirmBtn")?.addEventListener("click", () => {
                const reasonInput = modal.querySelector("#txWithdrawalReasonInput");
                const payoutInput = modal.querySelector("#txWithdrawalPayoutInput");
                const reason = String(reasonInput?.value || "").trim();
                const payoutReference = String(payoutInput?.value || "").trim();
                const errorBox = modal.querySelector("#txWithdrawalModalError");

                if (isApprove && !payoutReference) {
                    if (errorBox) {
                        errorBox.textContent = "Payout transaction hash / TXID is required for approval.";
                        errorBox.style.display = "block";
                    }
                    payoutInput?.focus();
                    return;
                }

                if (!isApprove && !reason) {
                    if (errorBox) {
                        errorBox.textContent = "Reject reason is required.";
                        errorBox.style.display = "block";
                    }
                    reasonInput?.focus();
                    return;
                }

                close({
                    reason: reason || (isApprove ? "Approved by admin." : "Rejected by admin."),
                    payoutReference
                });
            });

            setTimeout(() => modal.querySelector("#txWithdrawalReasonInput")?.focus(), 50);
        });
    }

    function renderWithdrawals(rows = withdrawalsState.rows) {
        const body = document.getElementById("withdrawalsTableBody");
        if (!body) return;
        if (!rows.length) {
            body.innerHTML = api.emptyRow(7, "No withdrawals found.");
            return;
        }
        body.innerHTML = rows.map(raw => {
            const w = normalizeWithdrawal(raw);
            const status = String(w.status).toLowerCase();
            const isPending = pendingStatuses.includes(status);
            const risk = String(w.risk).toLowerCase();
            const cur = String(w.asset || w.currency || "USDT").toUpperCase();
            const fmtMoney = (val) => {
                const num = api.number(val);
                if (cur === "INR" || cur === "₹") {
                    return `₹ ${num.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                }
                return `$ ${num.toFixed(2)}`;
            };

            return `
                <tr data-withdrawal-id="${api.escapeHtml(w.id)}">
                    <td>
                        <div class="max-w-[150px] truncate font-black text-white" title="${api.escapeHtml(w.reference)}">${api.escapeHtml(w.reference)}</div>
                        <div class="text-xs text-slate-500">${api.escapeHtml(w.requestedAt)}</div>
                    </td>
                    <td>
                        <div class="max-w-[150px] truncate font-black text-white" title="${api.escapeHtml(w.user)}">${api.escapeHtml(w.user)}</div>
                        <div class="max-w-[180px] truncate text-xs text-slate-500" title="${api.escapeHtml(w.email || w.userId)}">${api.escapeHtml(w.email || w.userId)}</div>
                    </td>
                    <td>
                        <div class="font-bold text-slate-200">${api.escapeHtml(w.network)}</div>
                        <button class="mt-1 max-w-[190px] truncate text-left text-xs font-bold text-cyan-300" data-copy="${api.escapeHtml(w.account)}" title="${api.escapeHtml(w.account)}">${api.escapeHtml(w.account)}</button>
                    </td>
                    <td>
                        <div class="font-black text-white">${fmtMoney(w.lockedAmount || w.amount)} <span class="text-xs font-bold text-slate-500">wallet debit</span></div>
                        <div class="text-xs text-cyan-300">User receives ${fmtMoney(w.finalAmount || Math.max((w.amount || 0) - (w.totalFee || 0), 0))}</div>
                        <div class="text-xs text-emerald-300">Company fee profit ${fmtMoney(w.companyFee)}</div>
                        <div class="text-xs text-slate-500">Total fees ${fmtMoney(w.companyFee)}</div>
                    </td>
                    <td><span class="${ui.statusClass(w.status)} whitespace-nowrap">${api.escapeHtml(statusLabel(w.status))}</span></td>
                    <td><span class="${risk === "low" ? "status-pill status-approved" : risk === "medium" ? "status-pill status-pending" : "status-pill status-rejected"}">${api.escapeHtml(riskLabel(risk))}</span></td>
                    <td class="text-right">
                        <div class="flex flex-nowrap justify-end gap-2">
                            <a class="admin-btn py-2" href="/admin/wallet/withdrawal-detail?id=${encodeURIComponent(w.id)}">View</a>
                            ${isPending ? `<button class="admin-btn admin-btn-success py-2" data-action="approve" data-id="${api.escapeHtml(w.id)}">Approve</button><button class="admin-btn admin-btn-danger py-2" data-action="reject" data-id="${api.escapeHtml(w.id)}">Reject</button>` : ""}
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }


    function renderLedger(rows) {
        const body = document.getElementById("ledgerTableBody");
        if (!body) return;
        if (!rows.length) {
            body.innerHTML = api.emptyRow(7, "No wallet ledger entries found.");
            return;
        }
        body.innerHTML = rows.map(raw => {
            const l = normalizeLedger(raw);
            const finalizedWithdrawal = isWithdrawalFinalizedLedger(raw);
            const direction = finalizedWithdrawal ? "finalized" : String(l.direction || "").toLowerCase();
            const isDebit = direction.includes("debit");
            const isCredit = direction.includes("credit");
            const directionClass = finalizedWithdrawal ? "status-pill status-review" : (isDebit ? "status-pill status-rejected" : "status-pill status-approved");
            const amountClass = finalizedWithdrawal ? "text-cyan-300" : (isDebit ? "text-rose-300" : "text-emerald-300");
            const amountText = finalizedWithdrawal
                ? `No extra debit <span class="block text-xs font-normal text-slate-500">Locked ${fmtLedgerMoney(Math.abs(l.amount), l.currency)}</span>`
                : `${isDebit ? "-" : "+"}${fmtLedgerMoney(Math.abs(l.amount), l.currency)}`;
            const description = finalizedWithdrawal ? withdrawalFinalizedDescription(l.description) : l.description;
            return `
                <tr>
                    <td>${api.escapeHtml(l.user)}<div class="text-xs text-slate-500">${api.escapeHtml(l.email)}</div></td>
                    <td><span class="status-pill status-review">${api.escapeHtml(l.type)}</span></td>
                    <td><span class="${directionClass}">${api.escapeHtml(finalizedWithdrawal ? "Finalized" : l.direction)}</span></td>
                    <td class="font-black ${amountClass}">${amountText}</td>
                    <td>${fmtLedgerMoney(l.balance, l.currency)}</td>
                    <td><div class="font-bold text-slate-200">${api.escapeHtml(l.ref)}</div><div class="text-xs text-slate-500 max-w-[280px] truncate">${api.escapeHtml(description)}</div></td>
                    <td>${api.escapeHtml(l.date)}</td>
                </tr>
            `;
        }).join("");
    }

    async function loadWalletSummary() {
        try {
            const summary = await api.request("/wallet/summary");
            setText("ledgerTotalBalance", ui.money(summary.total_balance || 0));
            setText("ledgerAvailableBalance", ui.money(summary.available_balance || 0));
            setText("ledgerLockedBalance", ui.money(summary.locked_balance || 0));
            setText("ledgerTodayDebit", ui.money(summary.today_debit_amount || 0));
        } catch (error) {
            api.showError(error, "Wallet summary failed.");
        }

        try {
            const summary = await api.request("/withdrawals/summary");
            setText("walletPendingCount", ui.compact(summary.withdrawals?.pending || 0));
            setText("walletPendingAmount", `${ui.money(summary.withdrawals?.pending_locked_amount || summary.withdrawals?.pending_amount || 0)} locked`);
            setText("walletApprovedToday", ui.compact(summary.withdrawals?.approved_today || 0));
            setText("walletRejectedToday", ui.compact(summary.withdrawals?.rejected_today || 0));
            setText("walletTotalBalance", ui.money(summary.wallet?.total_balance || 0));
            setText("walletSplitBalance", `Available ${ui.money(summary.wallet?.available_balance || 0)} • Locked ${ui.money(summary.wallet?.locked_balance || 0)}`);

            const revenue = summary.revenue || {};
            const usdtRev = revenue.usdt || {};
            const inrRev = revenue.inr || {};

            setText("feeProfitToday", fmtLedgerMoney(revenue.company_profit_today || 0, "USDT"));
            const tradingFeeToday = revenue.trading_fee_today || 0;
            const tradingFeeTotal = revenue.trading_fee_total || 0;
            const platformFeeToday = revenue.platform_fee_today || 0;
            const platformFeeTotal = revenue.platform_fee_total || 0;
            setText("feeProfitTodaySplit", `Trading ${ui.money(tradingFeeToday)} • Platform ${ui.money(platformFeeToday)} • Withdraw ${ui.money(revenue.withdrawal_fee_today || 0)}`);
            
            setText("feeProfitTotal", fmtLedgerMoney(usdtRev.total_revenue || 0, "USDT"));
            setText("feeProfitTotalUsdt", fmtLedgerMoney(usdtRev.total_revenue || 0, "USDT"));
            setText("feeProfitTotalInr", fmtLedgerMoney(inrRev.total_revenue || 0, "INR"));
            setText("feeProfitTotalSplit", `USDT ${fmtLedgerMoney(usdtRev.total_revenue || 0, "USDT")} • INR ${fmtLedgerMoney(inrRev.total_revenue || 0, "INR")}`);
            setText("networkFeeRecovered", ui.money(revenue.network_fee_total || 0));
            setText("networkFeeRecoveredToday", `Today ${ui.money(revenue.network_fee_today || 0)} recovered`);
            setText("approvedDebitToday", ui.money(summary.withdrawals?.approved_today_locked_amount || 0));
            setText("approvedDebitTodaySplit", `Payout ${ui.money(summary.withdrawals?.approved_today_amount || 0)} • Fees ${ui.money(summary.withdrawals?.approved_today_total_fee || 0)}`);
        } catch (error) {
            if (document.getElementById("walletPendingCount")) api.showError(error, "Withdrawal summary failed.");
        }
    }

    async function loadWithdrawals(options = {}) {
        const silent = Boolean(options.silent);
        const body = document.getElementById("withdrawalsTableBody");
        if (!body) return;

        const requestId = ++withdrawalRequestSeq;

        if (!silent) {
            api.setLoading(body, 7);
        }

        try {
            const data = await api.request("/withdrawals", { params: currentWithdrawalParams() });

            if (requestId !== withdrawalRequestSeq) return;

            const meta = paginationMeta(data.pagination, withdrawalsState);
            withdrawalsState = { ...withdrawalsState, ...meta, rows: data.withdrawals || [] };
            renderWithdrawals(withdrawalsState.rows);
            renderPagination("withdrawalsPagination", meta, (page) => { withdrawalsState.page = page; loadWithdrawals(); }, (limit) => { withdrawalsState.limit = limit; withdrawalsState.page = 1; loadWithdrawals(); });
        } catch (error) {
            if (!silent) {
                api.showError(error, "Withdrawals failed.");
                withdrawalsState.rows = [];
                renderWithdrawals([]);
            } else {
                console.warn("Withdrawals silent refresh failed:", error);
            }
        }
    }

    async function loadLedger() {
        const body = document.getElementById("ledgerTableBody");
        if (!body) return;
        api.setLoading(body, 7);
        try {
            const data = await api.request("/wallet/ledger", { params: currentLedgerParams() });
            const meta = paginationMeta(data.pagination, ledgerState);
            ledgerState = { ...ledgerState, ...meta, rows: data.ledger || [] };
            renderLedger(ledgerState.rows);
            renderPagination("ledgerPagination", meta, (page) => { ledgerState.page = page; loadLedger(); }, (limit) => { ledgerState.limit = limit; ledgerState.page = 1; loadLedger(); });
        } catch (error) {
            api.showError(error, "Wallet ledger failed.");
            ledgerState.rows = [];
            renderLedger([]);
        }
    }

    function renderMiniLedger(rows) {
        const body = document.getElementById("withdrawalLedgerBody");
        if (!body) return;
        if (!rows.length) {
            body.innerHTML = api.emptyRow(4, "No linked ledger entries found.");
            return;
        }
        body.innerHTML = rows.map(raw => {
            const l = normalizeLedger(raw);
            const finalizedWithdrawal = isWithdrawalFinalizedLedger(raw);
            const isDebit = String(l.direction || "").toLowerCase().includes("debit");
            const amountClass = finalizedWithdrawal ? "text-cyan-300" : (isDebit ? "text-rose-300" : "text-emerald-300");
            const amountText = finalizedWithdrawal ? "No extra debit" : `${isDebit ? "-" : "+"}${ui.money(Math.abs(l.amount))}`;
            return `<tr><td>${api.escapeHtml(l.type)}</td><td class="font-black ${amountClass}">${amountText}</td><td>${ui.money(l.balance)}</td><td>${api.escapeHtml(l.date)}</td></tr>`;
        }).join("");
    }

    function renderAuditTrail(rows) {
        const box = document.getElementById("withdrawalAuditTrail");
        if (!box) return;
        if (!rows.length) {
            box.innerHTML = `<div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-slate-400">No admin audit entries found.</div>`;
            return;
        }
        box.innerHTML = rows.map(item => `
            <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div class="flex items-start justify-between gap-3"><b class="text-white">${api.escapeHtml(item.action || "audit")}</b><span class="text-xs text-slate-500">${api.escapeHtml(api.fmtDate(item.created_at))}</span></div>
                <p class="mt-2 text-sm text-slate-300">${api.escapeHtml(item.message || "-")}</p>
                <p class="mt-2 text-xs text-slate-500">${api.escapeHtml(item.admin_email || item.admin_id || "system")}</p>
            </div>
        `).join("");
    }

    async function loadWithdrawalDetail() {
        const detail = document.getElementById("withdrawalDetailCard");
        if (!detail) return;
        const id = new URLSearchParams(window.location.search).get("id");
        if (!id) {
            detail.innerHTML = `<div class="py-10 text-center text-sm font-bold text-slate-400">No withdrawal selected.</div>`;
            return;
        }
        detail.innerHTML = `<div class="py-10 text-center text-sm font-bold text-slate-400">Loading withdrawal detail...</div>`;
        try {
            const data = await api.request(`/withdrawals/${encodeURIComponent(id)}`);
            const merged = { ...(data.withdrawal || {}), user: data.user || {} };
            const w = normalizeWithdrawal(merged);
            const wallet = data.wallet || {};
            const status = String(w.status).toLowerCase();
            const isPending = pendingStatuses.includes(status);
            detail.dataset.currentWithdrawal = JSON.stringify(w);
            detail.innerHTML = `
                <div class="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                    <div>
                        <div class="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p class="text-sm font-bold uppercase tracking-[.18em] text-cyan-300">Withdrawal Request</p>
                                <h2 class="mt-2 max-w-[620px] truncate text-3xl font-black text-white" title="${api.escapeHtml(w.reference)}">${api.escapeHtml(w.reference)}</h2>
                            </div>
                            <span class="${ui.statusClass(w.status)} whitespace-nowrap">${api.escapeHtml(statusLabel(w.status))}</span>
                        </div>
                        <div class="mt-6 grid gap-4 md:grid-cols-2">
                            <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p class="text-xs font-bold text-slate-400">User</p><h3 class="mt-1 font-black text-white">${api.escapeHtml(w.user)}</h3><p class="text-xs text-slate-500">${api.escapeHtml(w.email || w.userId)}</p></div>
                            <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p class="text-xs font-bold text-slate-400">Wallet Balance</p><h3 class="mt-1 font-black text-white">${ui.money((wallet.main_wallet || wallet).available_balance || 0)}</h3><p class="text-xs text-slate-500">Main locked ${ui.money((wallet.main_wallet || {}).locked_balance || 0)} • Trading ${ui.money((wallet.trading_wallet || wallet).available_balance || 0)}</p></div>
                            <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p class="text-xs font-bold text-slate-400">Destination</p><h3 class="mt-1 font-black text-white">${api.escapeHtml(w.network)}</h3><button class="text-left text-xs text-cyan-300 break-all" data-copy="${api.escapeHtml(w.account)}">${api.escapeHtml(w.account)}</button></div>
                            <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p class="text-xs font-bold text-slate-400">Withdrawal Amount</p><h3 class="mt-1 text-xl font-black text-white">${money(w.amount)}</h3><p class="text-xs text-emerald-300">Company fee profit ${money(w.companyFee)}</p><p class="text-xs text-slate-500">Total debit ${money(w.lockedAmount)}</p></div>
                        </div>
                    </div>
                    <div class="rounded-[1.5rem] border border-cyan-400/20 bg-cyan-400/[0.06] p-5">
                        <h3 class="text-lg font-black text-white">Admin Decision</h3>
                        <p class="mt-2 text-sm leading-6 text-slate-300">Approve final-debits locked balance. Reject releases locked amount back to available balance.</p>
                        <textarea id="decisionReason" class="admin-textarea mt-5 min-h-28" placeholder="Approval note or rejection reason">${api.escapeHtml(w.remark || "")}</textarea>
                        <input id="payoutReference" class="admin-input mt-3" placeholder="Payout transaction hash / TXID required" value="${api.escapeHtml(w.txHash || w.payoutReference || "")}" />
                        <div class="mt-4 grid gap-3 sm:grid-cols-2">
                            <button class="admin-btn admin-btn-success" data-action="approve" data-id="${api.escapeHtml(w.id)}" ${!isPending ? "disabled" : ""}>Approve</button>
                            <button class="admin-btn admin-btn-danger" data-action="reject" data-id="${api.escapeHtml(w.id)}" ${!isPending ? "disabled" : ""}>Reject</button>
                        </div>
                        ${w.explorerUrl ? `<a class="admin-btn mt-3 w-full" href="${api.escapeHtml(w.explorerUrl)}" target="_blank" rel="noopener">Open Explorer</a>` : ""}
                    </div>
                </div>
            `;
            renderMiniLedger(data.ledger || []);
            renderAuditTrail(data.audit_logs || []);
        } catch (error) {
            api.showError(error, "Withdrawal detail failed.");
            detail.innerHTML = `<div class="py-10 text-center text-sm font-bold text-rose-300">Withdrawal detail failed.</div>`;
        }
    }


    function setDecisionBusy(id, action, busy) {
        document.querySelectorAll("[data-action][data-id]").forEach((button) => {
            if (button.dataset.id === id) {
                button.disabled = busy;
                button.classList.toggle("opacity-60", busy);
                button.classList.toggle("cursor-not-allowed", busy);
                if (button.dataset.action === action) {
                    if (busy) {
                        button.dataset.originalText = button.textContent;
                        button.textContent = action === "approve" ? "Approving..." : "Rejecting...";
                    } else if (button.dataset.originalText) {
                        button.textContent = button.dataset.originalText;
                        delete button.dataset.originalText;
                    }
                }
            }
        });
    }

    async function decideWithdrawal(id, action) {
        const typedReason = document.getElementById("decisionReason")?.value.trim() || "";
        const payoutReferenceInput = document.getElementById("payoutReference")?.value.trim() || "";
        const withdrawal = getCurrentWithdrawal(id);

        const modalResult = await openDecisionModal({
            id,
            action,
            withdrawal,
            defaultReason: typedReason,
            defaultPayoutReference: payoutReferenceInput
        });

        if (!modalResult) return;

        const reason = modalResult.reason || (action === "approve" ? "Approved by admin." : "Rejected by admin.");
        const payoutReference = modalResult.payoutReference || "";

        ui.toast(action === "approve" ? "Approving Withdrawal" : "Rejecting Withdrawal", `Request ${id} is being processed...`, "info");
        setDecisionBusy(id, action, true);
        try {
            const body = action === "approve"
                ? { remark: reason, payout_reference: payoutReference, tx_hash: payoutReference }
                : { reason };
            const response = await api.request(`/withdrawals/${encodeURIComponent(id)}/${action}`, { method: "POST", body });
            const doneMessage = response?.withdrawal?.user_status_message || (action === "approve"
                ? "Locked balance has been finally withdrawn from user wallet."
                : "Locked amount has been released back to user wallet.");
            ui.toast(
                action === "approve" ? "Withdrawal Approved" : "Withdrawal Rejected",
                doneMessage,
                action === "approve" ? "success" : "danger"
            );
            await loadWalletSummary();

            const statusFilter = document.getElementById("withdrawalStatusFilter");
            if (action === "approve" && statusFilter && statusFilter.value === "pending") {
                statusFilter.value = "all";
            }

            await loadWithdrawals();
            await loadWithdrawalDetail();
        } catch (error) {
            api.showError(error, `Withdrawal ${action} failed.`);
        } finally {
            setDecisionBusy(id, action, false);
        }
    }


    function bindFilters() {
        ["withdrawalSearch", "withdrawalCurrencyFilter", "withdrawalStatusFilter"].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener(id === "withdrawalSearch" ? "input" : "change", () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => { withdrawalsState.page = 1; loadWithdrawals(); }, 300);
            });
        });
        document.getElementById("withdrawalResetBtn")?.addEventListener("click", (e) => {
            e.preventDefault();
            const search = document.getElementById("withdrawalSearch");
            if (search) search.value = "";
            const currency = document.getElementById("withdrawalCurrencyFilter");
            if (currency) currency.value = "all";
            const status = document.getElementById("withdrawalStatusFilter");
            if (status) status.value = "all";
            withdrawalsState.page = 1;
            loadWithdrawals();
        });

        ["ledgerSearch", "ledgerCurrencyFilter", "ledgerTypeFilter", "ledgerDirectionFilter"].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener(id === "ledgerSearch" ? "input" : "change", () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => { ledgerState.page = 1; loadLedger(); }, 300);
            });
        });
        document.getElementById("ledgerResetBtn")?.addEventListener("click", (e) => {
            e.preventDefault();
            ["ledgerSearch"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
            const currency = document.getElementById("ledgerCurrencyFilter");
            const type = document.getElementById("ledgerTypeFilter");
            const direction = document.getElementById("ledgerDirectionFilter");
            if (currency) currency.value = "all";
            if (type) type.value = "all";
            if (direction) direction.value = "all";
            ledgerState.page = 1;
            loadLedger();
        });
        document.getElementById("ledgerExportBtn")?.addEventListener("click", () => exportLedgerCsv());
    }

    function startWithdrawalAutoRefresh() {
        if (!document.getElementById("withdrawalsTableBody")) return;

        if (withdrawalRefreshTimer) {
            clearInterval(withdrawalRefreshTimer);
        }

        withdrawalRefreshTimer = setInterval(() => {
            if (document.hidden) return;
            loadWalletSummary();
            loadWithdrawals({ silent: true });
        }, 15000);
    }

    function exportLedgerCsv() {
        if (!ledgerState.rows.length) {
            ui.toast("Export skipped", "No ledger rows are loaded.", "info");
            return;
        }
        const headers = ["User", "Email", "Type", "Direction", "Amount", "Balance", "Reference", "Date"];
        const lines = ledgerState.rows.map(row => {
            const l = normalizeLedger(row);
            const finalizedWithdrawal = isWithdrawalFinalizedLedger(row);
            const exportDirection = finalizedWithdrawal ? "Finalized" : l.direction;
            const exportAmount = finalizedWithdrawal ? `No extra debit (locked ${l.amount})` : l.amount;
            return [l.user, l.email, l.type, exportDirection, exportAmount, l.balance, l.ref, l.date].map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",");
        });
        const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `wallet-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        ui.toast("Ledger exported", "Current ledger page exported as CSV.", "success");
    }

    document.addEventListener("click", async (e) => {
        const copyButton = e.target.closest("[data-copy]");
        if (copyButton) {
            await navigator.clipboard?.writeText(copyButton.dataset.copy || "");
            ui.toast("Copied", "Address/reference copied to clipboard.", "success");
            return;
        }
        const btn = e.target.closest("[data-action][data-id]");
        if (!btn) return;
        decideWithdrawal(btn.dataset.id, btn.dataset.action);
    });

    // Admin Wallet Modal Logic
    const adminWalletModal = document.getElementById("adminWalletModal");
    const closeAdminWalletModal = document.getElementById("closeAdminWalletModal");
    const btnAdminWalletToday = document.getElementById("btnAdminWalletToday");
    const btnAdminWalletTotal = document.getElementById("btnAdminWalletTotal");
    
    let adminAvailableProfit = 0; // Keep track of maximum available amount
    let adminProfitWalletCurrency = "USDT";
    let adminSummaryCache = null;

    const tabUsdt = document.getElementById("btnAdminProfitTabUsdt");
    const tabInr = document.getElementById("btnAdminProfitTabInr");

    if (tabUsdt) {
        tabUsdt.addEventListener("click", () => {
            adminProfitWalletCurrency = "USDT";
            updateAdminProfitTabUi();
        });
    }
    if (tabInr) {
        tabInr.addEventListener("click", () => {
            adminProfitWalletCurrency = "INR";
            updateAdminProfitTabUi();
        });
    }

    function updateAdminProfitTabUi() {
        if (tabUsdt) {
            tabUsdt.className = adminProfitWalletCurrency === "USDT"
                ? "px-3 py-1.5 rounded-xl text-xs font-black transition-all bg-cyan-400 text-slate-950 shadow-md"
                : "px-3 py-1.5 rounded-xl text-xs font-black transition-all text-slate-400 hover:text-white";
        }
        if (tabInr) {
            tabInr.className = adminProfitWalletCurrency === "INR"
                ? "px-3 py-1.5 rounded-xl text-xs font-black transition-all bg-emerald-400 text-slate-950 shadow-md"
                : "px-3 py-1.5 rounded-xl text-xs font-black transition-all text-slate-400 hover:text-white";
        }

        const badge = document.getElementById("adminProfitWalletBadge");
        if (badge) {
            badge.textContent = adminProfitWalletCurrency === "INR" ? "INR Wallet (₹)" : "USDT Wallet ($)";
            badge.className = adminProfitWalletCurrency === "INR"
                ? "text-xs bg-emerald-400/10 text-emerald-300 border border-emerald-400/20 px-2.5 py-0.5 rounded-full font-black"
                : "text-xs bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 px-2.5 py-0.5 rounded-full font-black";
        }

        const networkSelect = document.getElementById("adminWithdrawNetwork");
        if (networkSelect) {
            if (adminProfitWalletCurrency === "INR") {
                networkSelect.innerHTML = `
                    <option value="UPI">UPI / VPA</option>
                    <option value="BANK">Bank Transfer (IMPS / NEFT)</option>
                `;
            } else {
                networkSelect.innerHTML = `
                    <option value="TRC20">USDT - TRC20</option>
                    <option value="ERC20">USDT - ERC20</option>
                    <option value="BEP20">USDT - BEP20</option>
                `;
            }
        }

        const addressInput = document.getElementById("adminWithdrawAddress");
        if (addressInput) {
            addressInput.placeholder = adminProfitWalletCurrency === "INR"
                ? "Enter recipient UPI ID (e.g. admin@upi) or Bank Details..."
                : "Enter recipient USDT wallet address...";
        }

        renderAdminWalletFields();
        if (typeof updateTransferFormDirection === "function") updateTransferFormDirection();
        autofillAdminWithdrawAddress();
    }

    function renderAdminWalletFields() {
        if (!adminSummaryCache) return;
        const walletData = adminProfitWalletCurrency === "INR"
            ? (adminSummaryCache.inr || {})
            : (adminSummaryCache.usdt || adminSummaryCache);

        const available = walletData.available_balance || 0;
        adminAvailableProfit = available;

        setText("adminTotalRevenue", fmtLedgerMoney(walletData.total_revenue || 0, adminProfitWalletCurrency));
        setText("adminTotalWithdrawn", fmtLedgerMoney(walletData.total_withdrawn || 0, adminProfitWalletCurrency));
        setText("adminAvailableBalance", fmtLedgerMoney(available, adminProfitWalletCurrency));

        const historyList = document.getElementById("adminWithdrawalHistoryList");
        const historyEmpty = document.getElementById("adminWithdrawalHistoryEmpty");

        if (historyList) {
            historyList.innerHTML = "";
            const items = walletData.withdrawals || [];

            if (items.length === 0) {
                if (historyEmpty) historyEmpty.classList.remove("hidden");
            } else {
                if (historyEmpty) historyEmpty.classList.add("hidden");
                items.forEach(w => {
                    const dateStr = api.fmtDate(w.created_at);
                    const row = document.createElement("tr");
                    row.className = "border-b border-white/5 hover:bg-white/[0.01]";
                    row.innerHTML = `
                        <td class="py-3.5">${dateStr}</td>
                        <td class="py-3.5"><span class="bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider">${api.escapeHtml(w.network || "NETWORK")}</span></td>
                        <td class="py-3.5 font-mono text-slate-400 select-all truncate max-w-[140px]" title="${api.escapeHtml(w.address || "")}">${api.escapeHtml(w.address || "-")}</td>
                        <td class="py-3.5 text-right font-black text-emerald-400">${fmtLedgerMoney(w.amount, adminProfitWalletCurrency)}</td>
                    `;
                    historyList.appendChild(row);
                });
            }
        }
    }

    function autofillAdminWithdrawAddress() {
        const addressInput = document.getElementById("adminWithdrawAddress");
        const networkSelect = document.getElementById("adminWithdrawNetwork");
        const addressLabel = document.getElementById("adminWithdrawAddressLabel");
        if (!addressInput || !networkSelect) return;

        if (adminProfitWalletCurrency === "INR") {
            const inrSettings = adminSummaryCache?.inr_settings || {};
            if (networkSelect.value === "UPI") {
                if (addressLabel) addressLabel.textContent = "UPI ID / VPA";
                addressInput.value = inrSettings.upi_id || "traidiumx@upi";
            } else if (networkSelect.value === "BANK") {
                if (addressLabel) addressLabel.textContent = "Bank Account Details";
                const bankName = inrSettings.bank_name || "HDFC Bank";
                const accNum = inrSettings.account_number || "50100498765432";
                const ifsc = inrSettings.ifsc_code || "HDFC0000128";
                const accName = inrSettings.account_name || "TraidiumX Trading Services Ltd";
                addressInput.value = `Bank: ${bankName}, A/C: ${accNum}, IFSC: ${ifsc}, Name: ${accName}`;
            }
        } else {
            if (addressLabel) addressLabel.textContent = "Wallet Address";
            addressInput.value = "";
        }
    }

    // Open Modal function
    async function openAdminWallet() {
        if (!adminWalletModal) return;
        
        // Show modal with animation
        adminWalletModal.classList.remove("hidden");
        // Trigger animation classes
        setTimeout(() => {
            adminWalletModal.classList.remove("opacity-0");
            const modalContent = adminWalletModal.querySelector(".scale-95");
            if (modalContent) {
                modalContent.classList.remove("scale-95");
                modalContent.classList.add("scale-100");
            }
        }, 50);
        
        // Load data
        await loadAdminWalletData();
    }
    
    // Close Modal function
    function closeAdminWallet() {
        if (!adminWalletModal) return;
        
        adminWalletModal.classList.add("opacity-0");
        const modalContent = adminWalletModal.querySelector(".scale-100");
        if (modalContent) {
            modalContent.classList.remove("scale-100");
            modalContent.classList.add("scale-95");
        }
        
        setTimeout(() => {
            adminWalletModal.classList.add("hidden");
        }, 300);
    }
    
    // Bind click events to open/close
    if (btnAdminWalletToday) btnAdminWalletToday.addEventListener("click", openAdminWallet);
    if (btnAdminWalletTotal) btnAdminWalletTotal.addEventListener("click", openAdminWallet);
    if (closeAdminWalletModal) closeAdminWalletModal.addEventListener("click", closeAdminWallet);
    
    // Load Admin Wallet Data (Summary + History)
    async function loadAdminWalletData() {
        try {
            const data = await api.request("/wallet/admin-summary");
            if (data) {
                adminSummaryCache = data;
                updateAdminProfitTabUi();
            }
        } catch (err) {
            ui.toast("Error", "Failed to fetch admin wallet details.", "error");
        }
    }
    
    const networkSelectEl = document.getElementById("adminWithdrawNetwork");
    if (networkSelectEl) {
        networkSelectEl.addEventListener("change", () => {
            autofillAdminWithdrawAddress();
        });
    }

    // Withdraw Form Logic: Use Max Button
    const btnAdminWithdrawMax = document.getElementById("btnAdminWithdrawMax");
    if (btnAdminWithdrawMax) {
        btnAdminWithdrawMax.addEventListener("click", () => {
            const amountInput = document.getElementById("adminWithdrawAmount");
            if (amountInput) {
                amountInput.value = adminAvailableProfit > 0 ? adminAvailableProfit.toFixed(2) : "0.00";
            }
        });
    }
    
    // Submit Withdrawal Request
    const btnAdminWithdrawSubmit = document.getElementById("btnAdminWithdrawSubmit");
    if (btnAdminWithdrawSubmit) {
        btnAdminWithdrawSubmit.addEventListener("click", async () => {
            const network = document.getElementById("adminWithdrawNetwork")?.value;
            const address = document.getElementById("adminWithdrawAddress")?.value?.trim();
            const amountVal = document.getElementById("adminWithdrawAmount")?.value;
            const amount = parseFloat(amountVal);
            
            if (!network) {
                ui.toast("Validation Error", "Please select a network or payment method.", "warning");
                return;
            }
            if (!address || address.length < 3) {
                ui.toast("Validation Error", "Please enter a valid wallet address or account details.", "warning");
                return;
            }
            if (isNaN(amount) || amount <= 0) {
                ui.toast("Validation Error", "Please enter a withdrawal amount greater than zero.", "warning");
                return;
            }
            if (amount > adminAvailableProfit) {
                ui.toast("Validation Error", `Insufficient balance. Maximum available is ${fmtLedgerMoney(adminAvailableProfit, adminProfitWalletCurrency)}`, "warning");
                return;
            }
            
            btnAdminWithdrawSubmit.disabled = true;
            btnAdminWithdrawSubmit.textContent = "Processing...";
            
            try {
                await api.request("/wallet/admin-withdraw", {
                    method: "POST",
                    body: {
                        currency: adminProfitWalletCurrency,
                        network,
                        address,
                        amount
                    }
                });
                
                ui.toast("Success", `Admin ${adminProfitWalletCurrency} revenue profit withdrawn successfully.`, "success");
                const addressInput = document.getElementById("adminWithdrawAddress");
                const amountInput = document.getElementById("adminWithdrawAmount");
                if (addressInput) addressInput.value = "";
                if (amountInput) amountInput.value = "";
                
                await loadAdminWalletData();
                await loadWalletSummary();
            } catch (err) {
                ui.toast("Error", err.message || "Server error processing withdrawal.", "error");
            } finally {
                btnAdminWithdrawSubmit.disabled = false;
                btnAdminWithdrawSubmit.textContent = "Withdraw Revenue";
            }
        });
    }

    async function loadCurrencySwitchRequests() {
        const body = document.getElementById("currencySwitchTableBody");
        if (!body) return;

        try {
            const response = await api.request("/wallet/currency-switch-requests");
            const requests = response.requests || response.data?.requests || [];
            renderCurrencySwitchRequests(requests);
        } catch (error) {
            body.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-rose-400 font-bold">Failed to load currency switch requests.</td></tr>`;
        }
    }

    function renderCurrencySwitchRequests(rows = []) {
        const body = document.getElementById("currencySwitchTableBody");
        const pendingBadge = document.getElementById("currencySwitchPendingCount");
        if (!body) return;

        const pendingCount = rows.filter(r => r.status === "pending").length;
        if (pendingBadge) {
            if (pendingCount > 0) {
                pendingBadge.textContent = `${pendingCount} Pending`;
                pendingBadge.classList.remove("hidden");
            } else {
                pendingBadge.classList.add("hidden");
            }
        }

        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-slate-500 font-bold">No currency switch requests found.</td></tr>`;
            return;
        }

        body.innerHTML = rows.map(r => {
            const isPending = r.status === "pending";
            const curBalStr = r.current_currency === "INR" ? `₹${r.current_main_balance}` : `$${r.current_main_balance}`;
            const estBalStr = r.target_currency === "USDT" ? `$${r.estimated_converted_balance}` : `₹${r.estimated_converted_balance}`;

            return `
                <tr>
                    <td>
                        <div class="font-black text-white">${api.escapeHtml(r.user_name || "User")}</div>
                        <div class="text-xs text-slate-500">${api.escapeHtml(r.user_email || r.user_id)}</div>
                    </td>
                    <td class="font-bold text-slate-300">${api.escapeHtml(r.current_currency)}</td>
                    <td class="font-black text-cyan-300">${api.escapeHtml(r.target_currency)}</td>
                    <td class="font-bold text-white">${curBalStr}</td>
                    <td class="font-bold text-amber-300">1 USDT = ₹${r.usdt_rate}</td>
                    <td class="font-black text-emerald-400">${estBalStr}</td>
                    <td><span class="${ui.statusClass(r.status)} whitespace-nowrap">${api.escapeHtml(r.status)}</span></td>
                    <td class="text-right">
                        ${isPending ? `
                            <div class="flex justify-end gap-2">
                                <button class="admin-btn admin-btn-success py-1.5 px-3 text-xs" data-switch-action="approve" data-id="${r.id}">Approve</button>
                                <button class="admin-btn admin-btn-danger py-1.5 px-3 text-xs" data-switch-action="reject" data-id="${r.id}">Reject</button>
                            </div>
                        ` : `<span class="text-xs text-slate-500 font-bold">${api.escapeHtml(r.status)}</span>`}
                    </td>
                </tr>
            `;
        }).join("");
    }

    document.getElementById("currencySwitchTableBody")?.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-switch-action]");
        if (!btn) return;
        const action = btn.dataset.switchAction;
        const id = btn.dataset.id;

        if (action === "approve") {
            btn.disabled = true;
            const origText = btn.textContent;
            btn.textContent = "Approving...";
            try {
                const res = await api.request(`/wallet/currency-switch-requests/${id}/approve`, { method: "POST" });
                ui.toast("Success", res.message || "Currency switch approved!", "success");
                loadCurrencySwitchRequests();
            } catch (err) {
                ui.toast("Error", err.message || "Approval failed", "error");
                btn.disabled = false;
                btn.textContent = origText;
            }
        } else if (action === "reject") {
            btn.disabled = true;
            const origText = btn.textContent;
            btn.textContent = "Rejecting...";
            try {
                const res = await api.request(`/wallet/currency-switch-requests/${id}/reject`, { method: "POST", body: { reason: "Admin rejected request" } });
                ui.toast("Success", res.message || "Currency switch request rejected.", "info");
                loadCurrencySwitchRequests();
            } catch (err) {
                ui.toast("Error", err.message || "Rejection failed", "error");
                btn.disabled = false;
                btn.textContent = origText;
            }
        }
    });

    document.getElementById("refreshCurrencySwitchBtn")?.addEventListener("click", loadCurrencySwitchRequests);

    // Admin Action Tab (Withdrawal vs. Transfer) Logic
    const btnActionTabWithdraw = document.getElementById("btnAdminActionTabWithdraw");
    const btnActionTabTransfer = document.getElementById("btnAdminActionTabTransfer");
    const containerWithdraw = document.getElementById("adminWithdrawalFormContainer");
    const containerTransfer = document.getElementById("adminTransferFormContainer");

    if (btnActionTabWithdraw && btnActionTabTransfer) {
        btnActionTabWithdraw.addEventListener("click", () => {
            btnActionTabWithdraw.className = "flex-1 py-1.5 text-xs font-black rounded-lg bg-white/5 border border-white/10 text-cyan-300";
            btnActionTabTransfer.className = "flex-1 py-1.5 text-xs font-black rounded-lg text-slate-400 hover:text-white transition";
            if (containerWithdraw) containerWithdraw.classList.remove("hidden");
            if (containerTransfer) containerTransfer.classList.add("hidden");
        });

        btnActionTabTransfer.addEventListener("click", () => {
            btnActionTabTransfer.className = "flex-1 py-1.5 text-xs font-black rounded-lg bg-white/5 border border-white/10 text-emerald-400";
            btnActionTabWithdraw.className = "flex-1 py-1.5 text-xs font-black rounded-lg text-slate-400 hover:text-white transition";
            if (containerWithdraw) containerWithdraw.classList.add("hidden");
            if (containerTransfer) containerTransfer.classList.remove("hidden");
            updateTransferFormDirection();
        });
    }

    function updateTransferFormDirection() {
        const rate = adminSummaryCache?.usdt_inr_rate || 88.50;
        const fromLabel = document.getElementById("adminTransferFromLabel");
        const toLabel = document.getElementById("adminTransferToLabel");
        const rateText = document.getElementById("adminTransferRateText");

        if (adminProfitWalletCurrency === "INR") {
            if (fromLabel) {
                fromLabel.textContent = "INR Wallet";
                fromLabel.className = "font-bold text-emerald-300";
            }
            if (toLabel) {
                toLabel.textContent = "USDT Wallet";
                toLabel.className = "font-bold text-cyan-300";
            }
            if (rateText) rateText.textContent = `1 USDT = ₹${rate.toFixed(2)} INR (Inverse: $${(1.0 / rate).toFixed(4)})`;
        } else {
            if (fromLabel) {
                fromLabel.textContent = "USDT Wallet";
                fromLabel.className = "font-bold text-cyan-300";
            }
            if (toLabel) {
                toLabel.textContent = "INR Wallet";
                toLabel.className = "font-bold text-emerald-300";
            }
            if (rateText) rateText.textContent = `1 USDT = ₹${rate.toFixed(2)} INR`;
        }

        updateTransferEstimate();
    }

    const transferInput = document.getElementById("adminTransferAmount");
    if (transferInput) {
        transferInput.addEventListener("input", updateTransferEstimate);
    }

    function updateTransferEstimate() {
        const amountVal = parseFloat(document.getElementById("adminTransferAmount")?.value || 0);
        const rate = adminSummaryCache?.usdt_inr_rate || 88.50;
        const previewEl = document.getElementById("adminTransferPreviewText");

        if (isNaN(amountVal) || amountVal <= 0) {
            if (previewEl) previewEl.textContent = adminProfitWalletCurrency === "INR" ? "$0.00 USDT" : "₹0.00 INR";
            return;
        }

        if (adminProfitWalletCurrency === "INR") {
            const converted = amountVal / rate;
            if (previewEl) previewEl.textContent = `$${converted.toFixed(4)} USDT`;
        } else {
            const converted = amountVal * rate;
            if (previewEl) previewEl.textContent = `₹${converted.toFixed(2)} INR`;
        }
    }

    const btnAdminTransferMax = document.getElementById("btnAdminTransferMax");
    if (btnAdminTransferMax) {
        btnAdminTransferMax.addEventListener("click", () => {
            const amountInput = document.getElementById("adminTransferAmount");
            if (amountInput) {
                amountInput.value = adminAvailableProfit > 0 ? adminAvailableProfit.toFixed(4) : "0.00";
                updateTransferEstimate();
            }
        });
    }

    const btnAdminTransferSubmit = document.getElementById("btnAdminTransferSubmit");
    if (btnAdminTransferSubmit) {
        btnAdminTransferSubmit.addEventListener("click", async () => {
            const amountVal = document.getElementById("adminTransferAmount")?.value;
            const amount = parseFloat(amountVal);
            
            if (isNaN(amount) || amount <= 0) {
                ui.toast("Validation Error", "Please enter a transfer amount greater than zero.", "warning");
                return;
            }
            if (amount > adminAvailableProfit) {
                ui.toast("Validation Error", `Insufficient balance. Maximum available is ${fmtLedgerMoney(adminAvailableProfit, adminProfitWalletCurrency)}`, "warning");
                return;
            }
            
            btnAdminTransferSubmit.disabled = true;
            btnAdminTransferSubmit.textContent = "Processing...";
            
            try {
                const targetCurrency = adminProfitWalletCurrency === "USDT" ? "INR" : "USDT";
                await api.request("/wallet/admin-transfer-profit", {
                    method: "POST",
                    body: {
                        from_currency: adminProfitWalletCurrency,
                        to_currency: targetCurrency,
                        amount
                    }
                });
                
                ui.toast("Success", `Transferred ${amount} ${adminProfitWalletCurrency} to ${targetCurrency} successfully.`, "success");
                const amountInput = document.getElementById("adminTransferAmount");
                if (amountInput) amountInput.value = "";
                
                // Return to withdraw tab automatically
                if (btnActionTabWithdraw) btnActionTabWithdraw.click();
                
                await loadAdminWalletData();
                await loadWalletSummary();
            } catch (err) {
                ui.toast("Error", err.message || "Server error processing transfer.", "error");
            } finally {
                btnAdminTransferSubmit.disabled = false;
                btnAdminTransferSubmit.textContent = "Confirm Transfer";
            }
        });
    }

    window.updateTransferFormDirection = updateTransferFormDirection;

    loadCurrencySwitchRequests();

    bindFilters();
    startWithdrawalAutoRefresh();
    await loadWalletSummary();
    await loadWithdrawals();
    await loadLedger();
    await loadWithdrawalDetail();
});

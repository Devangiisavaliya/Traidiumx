"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Trade Crypto For Free Campaign
|--------------------------------------------------------------------------
| Frontend-only campaign interactions:
| - Month-wise rebate report
| - Refund eligibility calculator
| - CSV download
| - Trader ranks
|--------------------------------------------------------------------------
*/

const rebateReportBody = document.getElementById("rebateReportBody");
const downloadReportBtn = document.getElementById("downloadReportBtn");

const realisedPnlInput = document.getElementById("realisedPnlInput");
const tradingChargesInput = document.getElementById("tradingChargesInput");
const refundCapInput = document.getElementById("refundCapInput");

const estimatedRefundAmount = document.getElementById("estimatedRefundAmount");
const refundBreakdown = document.getElementById("refundBreakdown");
const eligibilityStatus = document.getElementById("eligibilityStatus");
const netAfterRefund = document.getElementById("netAfterRefund");
const capUsedPreview = document.getElementById("capUsedPreview");
const eligibilityBox = document.getElementById("eligibilityBox");

const traderRanksGrid = document.getElementById("traderRanksGrid");

const monthlyReports = [
    {
        month: "January 2026",
        profitable: "34%",
        fullRefund: "85%",
        feeGreaterPnl: "32%",
        refunded: "₹83.66L",
        status: "Paid"
    },
    {
        month: "February 2026",
        profitable: "27%",
        fullRefund: "97%",
        feeGreaterPnl: "30%",
        refunded: "₹96.26L",
        status: "Paid"
    },
    {
        month: "March 2026",
        profitable: "29%",
        fullRefund: "95%",
        feeGreaterPnl: "32%",
        refunded: "₹1.29Cr",
        status: "Paid"
    },
    {
        month: "April 2026",
        profitable: "31%",
        fullRefund: "96%",
        feeGreaterPnl: "36%",
        refunded: "₹1.82Cr",
        status: "Paid"
    },
    {
        month: "May 2026",
        profitable: "32%",
        fullRefund: "95%",
        feeGreaterPnl: "42%",
        refunded: "₹2.27Cr",
        status: "Paid"
    }
];

const traderRanks = [
    { rank: 1, name: "Spark", label: "The Beginning", months: "1 month qualified" },
    { rank: 2, name: "Riser", label: "Gaining Momentum", months: "2 months qualified" },
    { rank: 3, name: "Hattrick", label: "3 In A Row", months: "3 months qualified" },
    { rank: 4, name: "Edge", label: "Sharp Trader", months: "4 months qualified" },
    { rank: 5, name: "Prime", label: "Top Performer", months: "5 months qualified" },
    { rank: 6, name: "Double Hattrick", label: "6x Consistent", months: "6 months qualified" },
    { rank: 7, name: "Elite", label: "Inner Circle", months: "7 months qualified" },
    { rank: 8, name: "Alpha", label: "Market Leader", months: "8 months qualified" },
    { rank: 9, name: "Triple Hattrick", label: "9x Unstoppable", months: "9 months qualified" },
    { rank: 10, name: "Legend", label: "Ultimate Trader", months: "10 months qualified" }
];

function showMiniMessage(message, type = "success") {
    let messageBox = document.getElementById("rebateMiniMessage");

    if (!messageBox) {
        messageBox = document.createElement("div");
        messageBox.id = "rebateMiniMessage";
        document.body.appendChild(messageBox);
    }

    if (type === "error") {
        messageBox.className = "fixed bottom-6 right-6 z-[9999] max-w-sm rounded-2xl border border-red-400/30 bg-red-400/15 px-5 py-4 text-sm font-black text-red-300 shadow-2xl transition";
    } else {
        messageBox.className = "fixed bottom-6 right-6 z-[9999] max-w-sm rounded-2xl border border-emerald-400/30 bg-emerald-400/15 px-5 py-4 text-sm font-black text-emerald-300 shadow-2xl transition";
    }

    messageBox.textContent = message;
    messageBox.style.opacity = "1";
    messageBox.style.transform = "translateY(0)";

    window.setTimeout(() => {
        messageBox.style.opacity = "0";
        messageBox.style.transform = "translateY(12px)";
    }, 2500);
}

function formatRupees(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    }).format(amount);
}

function renderMonthlyReport() {
    if (!rebateReportBody) {
        return;
    }

    rebateReportBody.innerHTML = monthlyReports
        .map((row) => {
            return `
                <tr class="transition hover:bg-cyan-400/[0.04]">
                    <td class="px-5 py-5 font-black text-white">${row.month}</td>
                    <td class="px-5 py-5 text-slate-300">${row.profitable}</td>
                    <td class="px-5 py-5 font-black text-emerald-400">${row.fullRefund}</td>
                    <td class="px-5 py-5 text-slate-300">${row.feeGreaterPnl}</td>
                    <td class="px-5 py-5 font-black text-cyan-400">${row.refunded}</td>
                    <td class="px-5 py-5">
                        <span class="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-400">
                            ${row.status}
                        </span>
                    </td>
                </tr>
            `;
        })
        .join("");
}

function calculateRefund() {
    const pnl = Number(realisedPnlInput ? realisedPnlInput.value : 0);
    const charges = Math.max(0, Number(tradingChargesInput ? tradingChargesInput.value : 0));
    const cap = Math.max(0, Number(refundCapInput ? refundCapInput.value : 0));

    const isQualified = pnl > 0;
    const refund = isQualified ? Math.min(charges, cap) : 0;
    const net = pnl + refund;
    const capUsed = cap > 0 ? (refund / cap) * 100 : 0;

    if (estimatedRefundAmount) {
        estimatedRefundAmount.textContent = formatRupees(refund);
    }

    if (refundBreakdown) {
        refundBreakdown.textContent = isQualified
            ? `Eligible: profitable month. Refund = ${formatRupees(refund)} within ${formatRupees(cap)} cap.`
            : "Not eligible: realised P&L must be net profitable.";
    }

    if (eligibilityStatus) {
        eligibilityStatus.textContent = isQualified ? "Qualified" : "Not Qualified";
        eligibilityStatus.className = isQualified
            ? "mt-1 text-xl font-black text-emerald-400"
            : "mt-1 text-xl font-black text-red-400";
    }

    if (netAfterRefund) {
        netAfterRefund.textContent = formatRupees(net);
    }

    if (capUsedPreview) {
        capUsedPreview.textContent = `${capUsed.toFixed(1)}%`;
    }

    if (eligibilityBox) {
        eligibilityBox.className = isQualified
            ? "mt-6 rounded-[2rem] bg-cyan-400 p-6 text-slate-950"
            : "mt-6 rounded-[2rem] bg-red-400 p-6 text-slate-950";
    }
}

function renderTraderRanks() {
    if (!traderRanksGrid) {
        return;
    }

    traderRanksGrid.innerHTML = traderRanks
        .map((rank) => {
            return `
                <article class="rebate-rank-card">
                    <div class="flex items-center justify-between">
                        <span class="rebate-rank-number">#${rank.rank}</span>
                        <span class="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-400">
                            Badge
                        </span>
                    </div>

                    <h3 class="mt-6 text-2xl font-black text-white">${rank.name}</h3>
                    <p class="mt-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-400">${rank.label}</p>
                    <p class="mt-4 leading-7 text-slate-400">${rank.months}</p>
                </article>
            `;
        })
        .join("");
}

function downloadReportCsv() {
    const rows = [
        ["Month", "Profitable Traders", "100% Fee Refund", "Fee Rebate > Net PnL", "Total Refunded", "Status"],
        ...monthlyReports.map((row) => [
            row.month,
            row.profitable,
            row.fullRefund,
            row.feeGreaterPnl,
            row.refunded,
            row.status
        ])
    ];

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "traidiumx-rebate-report.csv";
    link.click();

    URL.revokeObjectURL(url);

    showMiniMessage("Rebate report CSV downloaded.", "success");
}

function initEvents() {
    [realisedPnlInput, tradingChargesInput, refundCapInput].forEach((input) => {
        if (input) {
            input.addEventListener("input", calculateRefund);
        }
    });

    if (downloadReportBtn) {
        downloadReportBtn.addEventListener("click", downloadReportCsv);
    }

    document.querySelectorAll(".rebate-rank-card").forEach((card) => {
        card.addEventListener("click", () => {
            const rankName = card.querySelector("h3")?.textContent || "Rank";
            showMiniMessage(`${rankName} badge preview selected.`, "success");
        });
    });
}

function initCampaignPage() {
    renderMonthlyReport();
    renderTraderRanks();
    calculateRefund();
    initEvents();
}

document.addEventListener("DOMContentLoaded", initCampaignPage);
"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Fee Structure Page
|--------------------------------------------------------------------------
| Company-level behavior:
| - Loads public fee configuration from Flask backend API.
| - Uses USDT-only fee wording; no INR / UPI / bank rail.
| - Keeps fee calculation based on backend-provided rates.
|--------------------------------------------------------------------------
*/

const feeTableTitle = document.getElementById("feeTableTitle");
const feeTableSubtitle = document.getElementById("feeTableSubtitle");
const feeTableHead = document.getElementById("feeTableHead");
const feeTableBody = document.getElementById("feeTableBody");
const feeTabs = document.getElementById("feeTabs");
const vipTierCards = document.getElementById("vipTierCards");
const downloadFeesCsvBtn = document.getElementById("downloadFeesCsvBtn");
const feeErrorBox = document.getElementById("feeErrorBox");
const feePolicyNotes = document.getElementById("feePolicyNotes");

const calculatorProduct = document.getElementById("calculatorProduct");
const calculatorOrderType = document.getElementById("calculatorOrderType");
const calculatorTier = document.getElementById("calculatorTier");
const orderValueInput = document.getElementById("orderValueInput");

const selectedTierLabel = document.getElementById("selectedTierLabel");
const selectedProductLabel = document.getElementById("selectedProductLabel");
const estimatedFeeAmount = document.getElementById("estimatedFeeAmount");
const feeBreakdown = document.getElementById("feeBreakdown");
const feeRatePreview = document.getElementById("feeRatePreview");
const orderValuePreview = document.getElementById("orderValuePreview");
const netAfterFeePreview = document.getElementById("netAfterFeePreview");

const heroTakerFee = document.getElementById("heroTakerFee");
const heroMakerFee = document.getElementById("heroMakerFee");
const heroOptionsFee = document.getElementById("heroOptionsFee");
const heroDepositFee = document.getElementById("heroDepositFee");
const heroVipTiers = document.getElementById("heroVipTiers");
const feeSourceBadge = document.getElementById("feeSourceBadge");
const feeUpdatedAt = document.getElementById("feeUpdatedAt");

let feeStructure = null;
let activeFeeTab = "futures";
let activeTier = 0;

function showMiniMessage(message, type = "success") {
    let messageBox = document.getElementById("feeMiniMessage");

    if (!messageBox) {
        messageBox = document.createElement("div");
        messageBox.id = "feeMiniMessage";
        document.body.appendChild(messageBox);
    }

    const isError = type === "error";
    messageBox.className = isError
        ? "fixed bottom-6 right-6 z-[9999] max-w-sm rounded-2xl border border-red-400/30 bg-red-400/15 px-5 py-4 text-sm font-black text-red-300 shadow-2xl transition"
        : "fixed bottom-6 right-6 z-[9999] max-w-sm rounded-2xl border border-emerald-400/30 bg-emerald-400/15 px-5 py-4 text-sm font-black text-emerald-300 shadow-2xl transition";

    messageBox.textContent = message;
    messageBox.style.opacity = "1";
    messageBox.style.transform = "translateY(0)";

    window.setTimeout(() => {
        messageBox.style.opacity = "0";
        messageBox.style.transform = "translateY(12px)";
    }, 2800);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatUSDT(amount, maximumFractionDigits = 6) {
    const numericValue = Number(amount || 0);

    return `${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits
    }).format(numericValue)} USDT`;
}

function formatFeeRate(rate) {
    const numericRate = Number(rate);

    if (!Number.isFinite(numericRate)) {
        return escapeHtml(rate || "--");
    }

    return `${numericRate.toFixed(3)}%`;
}

function getSections() {
    return Array.isArray(feeStructure?.sections) ? feeStructure.sections : [];
}

function getActiveSection() {
    return getSections().find((section) => section.key === activeFeeTab) || getSections()[0] || null;
}

function getTradingRows(section) {
    return Array.isArray(section?.rows) ? section.rows : [];
}

function showError(message) {
    if (!feeErrorBox) {
        return;
    }

    feeErrorBox.classList.remove("hidden");
    feeErrorBox.textContent = message;
}

function clearError() {
    if (!feeErrorBox) {
        return;
    }

    feeErrorBox.classList.add("hidden");
    feeErrorBox.textContent = "";
}

async function fetchFeeStructure() {
    if (typeof apiRequest !== "function") {
        throw new Error("API config is not loaded. Please include api-config.js before fee-structure.js.");
    }

    const response = await apiRequest("/fees/structure");

    if (!response.success || !response.data) {
        throw new Error(response.message || "Fee structure API returned an invalid response.");
    }

    return response.data;
}

function renderHeroSummary() {
    const summary = feeStructure?.summary || {};

    if (heroTakerFee) heroTakerFee.textContent = formatFeeRate(summary.default_futures_taker_fee_percent);
    if (heroMakerFee) heroMakerFee.textContent = formatFeeRate(summary.default_futures_maker_fee_percent);
    if (heroOptionsFee) heroOptionsFee.textContent = formatFeeRate(summary.default_options_taker_fee_percent);
    if (heroDepositFee) heroDepositFee.textContent = summary.deposit_fee_label || "Free";
    if (heroVipTiers) heroVipTiers.textContent = `${summary.vip_tier_count || 0} Levels`;

    if (feeSourceBadge) {
        feeSourceBadge.textContent = feeStructure?.source === "backend_fee_config" ? "Backend" : "Config";
    }

    if (feeUpdatedAt) {
        const updatedAt = feeStructure?.updated_at || feeStructure?.server_time;
        const formattedDate = updatedAt ? new Date(updatedAt).toLocaleString() : "just now";
        feeUpdatedAt.textContent = `Updated from backend fee configuration · ${formattedDate}`;
    }
}

function renderTabs() {
    if (!feeTabs) {
        return;
    }

    const sections = getSections();

    feeTabs.innerHTML = sections
        .map((section) => {
            const isActive = section.key === activeFeeTab;

            return `
                <button type="button" data-fee-tab="${escapeHtml(section.key)}" class="fee-tab ${isActive ? "active-fee-tab" : ""}">
                    <span>${escapeHtml(section.label)}</span>
                    <span>${escapeHtml(section.badge || "Policy")}</span>
                </button>
            `;
        })
        .join("");

    feeTabs.querySelectorAll("[data-fee-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            setActiveFeeTab(button.getAttribute("data-fee-tab"));
        });
    });
}

function renderFeeTable() {
    const section = getActiveSection();

    if (!section) {
        return;
    }

    if (feeTableTitle) feeTableTitle.textContent = section.title || "Fee Structure";
    if (feeTableSubtitle) feeTableSubtitle.textContent = section.subtitle || "Backend fee policy.";

    if (feeTableHead) {
        feeTableHead.innerHTML = (section.headers || [])
            .map((heading) => `<th class="px-5 py-4">${escapeHtml(heading)}</th>`)
            .join("");
    }

    if (!feeTableBody) {
        return;
    }

    const rows = getTradingRows(section);

    if (!rows.length) {
        feeTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-5 py-8 text-center text-slate-400">
                    No fee rows available from backend.
                </td>
            </tr>
        `;
        return;
    }

    feeTableBody.innerHTML = rows
        .map((row, index) => {
            const isActiveTier = section.type !== "wallet_fee" && Number(row.level) === activeTier;

            if (section.type === "wallet_fee") {
                return `
                    <tr class="hover:bg-cyan-400/[0.03] transition">
                        <td class="px-5 py-5 font-black text-white">${escapeHtml(row.asset)}</td>
                        <td class="px-5 py-5 text-cyan-300">${escapeHtml(row.network)}</td>
                        <td class="px-5 py-5 font-black text-emerald-400">${escapeHtml(row.deposit_fee)}</td>
                        <td class="px-5 py-5 font-black text-cyan-400">${escapeHtml(row.withdrawal_fee)}</td>
                        <td class="px-5 py-5 text-slate-300">${escapeHtml(row.minimum_deposit)} / ${escapeHtml(row.minimum_withdrawal)}</td>
                        <td class="px-5 py-5 text-slate-300">${escapeHtml(row.processing)}</td>
                    </tr>
                `;
            }

            return `
                <tr class="${isActiveTier ? "bg-cyan-400/[0.07]" : "hover:bg-cyan-400/[0.03]"} transition">
                    <td class="px-5 py-5 font-black text-white">${escapeHtml(row.tier)}</td>
                    <td class="px-5 py-5 text-slate-300">${escapeHtml(row.volume_label)}</td>
                    <td class="px-5 py-5 font-black text-emerald-400">${formatFeeRate(row.maker_fee_percent)}</td>
                    <td class="px-5 py-5 font-black text-cyan-400">${formatFeeRate(row.taker_fee_percent)}</td>
                    <td class="px-5 py-5 text-slate-300">${section.type === "options_fee" ? formatFeeRate(row.exercise_fee_percent) : escapeHtml(row.support)}</td>
                    <td class="px-5 py-5">
                        <span class="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-400">
                            ${section.type === "options_fee" ? escapeHtml(row.support) : escapeHtml(row.status)}
                        </span>
                    </td>
                </tr>
            `;
        })
        .join("");
}

function renderVipCards() {
    if (!vipTierCards) {
        return;
    }

    const tiers = Array.isArray(feeStructure?.vip_tiers) ? feeStructure.vip_tiers : [];

    if (!tiers.length) {
        vipTierCards.innerHTML = `
            <div class="rounded-3xl border border-white/10 bg-white/[0.05] p-5 text-slate-400">
                VIP tier configuration is not available.
            </div>
        `;
        return;
    }

    vipTierCards.innerHTML = tiers
        .map((row) => {
            const level = Number(row.level || 0);
            const isActive = level === activeTier;

            return `
                <button type="button" data-tier="${level}" class="vip-tier-card ${isActive ? "active-vip-tier" : ""}">
                    <span class="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-400">
                        ${escapeHtml(row.tier)}
                    </span>

                    <h3 class="mt-5 text-3xl font-black text-white">${formatFeeRate(row.taker_fee_percent)}</h3>
                    <p class="mt-1 text-sm text-slate-500">Taker Fee</p>

                    <div class="mt-5 space-y-2 text-left text-sm text-slate-400">
                        <p>Maker: <span class="font-black text-emerald-400">${formatFeeRate(row.maker_fee_percent)}</span></p>
                        <p>Volume: <span class="font-black text-white">${escapeHtml(row.volume_label)}</span></p>
                        <p>Support: <span class="font-black text-cyan-400">${escapeHtml(row.support)}</span></p>
                    </div>
                </button>
            `;
        })
        .join("");

    vipTierCards.querySelectorAll("[data-tier]").forEach((button) => {
        button.addEventListener("click", () => {
            activeTier = Number(button.getAttribute("data-tier") || 0);

            if (calculatorTier) {
                calculatorTier.value = String(activeTier);
            }

            renderVipCards();
            renderFeeTable();
            calculateFee();
        });
    });
}

function renderPolicyNotes() {
    if (!feePolicyNotes) {
        return;
    }

    const notes = Array.isArray(feeStructure?.policy_notes) ? feeStructure.policy_notes : [];

    feePolicyNotes.innerHTML = notes
        .map((note) => {
            const safeNote = escapeHtml(note);
            const title = safeNote.split(".")[0] || "Policy note";

            return `
                <details class="fee-policy-note rounded-2xl border border-white/10 bg-white/[0.05]">
                    <summary class="fee-policy-summary">
                        <span>${title}</span>
                        <span class="fee-policy-arrow" aria-hidden="true">
                            <svg viewBox="0 0 20 20" fill="none" focusable="false">
                                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                            </svg>
                        </span>
                    </summary>
                    <p class="fee-policy-answer">${safeNote}</p>
                </details>
            `;
        })
        .join("");

    const policyItems = Array.from(feePolicyNotes.querySelectorAll(".fee-policy-note"));

    policyItems.forEach((item) => {
        item.addEventListener("toggle", () => {
            if (!item.open) {
                return;
            }

            policyItems.forEach((otherItem) => {
                if (otherItem !== item) {
                    otherItem.removeAttribute("open");
                }
            });
        });
    });
}

function initCalculatorOptions() {
    const calculator = feeStructure?.calculator || {};
    const products = Array.isArray(calculator.products) ? calculator.products : [];
    const orderTypes = Array.isArray(calculator.order_types) ? calculator.order_types : [];
    const tiers = Array.isArray(feeStructure?.vip_tiers) ? feeStructure.vip_tiers : [];

    if (calculatorProduct) {
        calculatorProduct.innerHTML = products
            .map((product) => `<option value="${escapeHtml(product.key)}">${escapeHtml(product.label)}</option>`)
            .join("");
    }

    if (calculatorOrderType) {
        calculatorOrderType.innerHTML = orderTypes
            .map((orderType) => `<option value="${escapeHtml(orderType.key)}">${escapeHtml(orderType.label)}</option>`)
            .join("");
    }

    if (calculatorTier) {
        calculatorTier.innerHTML = tiers
            .map((tier) => `<option value="${Number(tier.level || 0)}">${escapeHtml(tier.tier)}</option>`)
            .join("");
    }

    if (orderValueInput && calculator.default_order_value_usdt) {
        orderValueInput.value = String(calculator.default_order_value_usdt);
    }
}

function getProductSection(product) {
    return getSections().find((section) => section.key === product) || null;
}

function calculateFee() {
    if (!feeStructure) {
        return;
    }

    const product = calculatorProduct ? calculatorProduct.value : "futures";
    const orderType = calculatorOrderType ? calculatorOrderType.value : "taker";
    const tier = calculatorTier ? Number(calculatorTier.value || 0) : activeTier;
    const orderValue = orderValueInput ? Math.max(0, Number(orderValueInput.value || 0)) : 0;

    activeTier = tier;

    const section = getProductSection(product);
    const row = getTradingRows(section).find((item) => Number(item.level) === tier) || getTradingRows(section)[0];

    if (!section || !row) {
        return;
    }

    const rate = orderType === "maker" ? Number(row.maker_fee_percent || 0) : Number(row.taker_fee_percent || 0);
    const fee = orderValue * (rate / 100);
    const netAfterFee = Math.max(0, orderValue - fee);

    if (selectedTierLabel) selectedTierLabel.textContent = row.tier || `VIP ${tier}`;
    if (selectedProductLabel) selectedProductLabel.textContent = section.label || "Futures";
    if (estimatedFeeAmount) estimatedFeeAmount.textContent = formatUSDT(fee);

    if (feeBreakdown) {
        feeBreakdown.textContent = `${formatUSDT(orderValue, 2)} × ${rate.toFixed(3)}% ${orderType} fee · Backend loaded rate`;
    }

    if (feeRatePreview) feeRatePreview.textContent = `${rate.toFixed(3)}%`;
    if (orderValuePreview) orderValuePreview.textContent = formatUSDT(orderValue, 2);
    if (netAfterFeePreview) netAfterFeePreview.textContent = formatUSDT(netAfterFee);

    renderVipCards();
    renderFeeTable();
}

function setActiveFeeTab(tabKey) {
    if (!tabKey || !getSections().some((section) => section.key === tabKey)) {
        return;
    }

    activeFeeTab = tabKey;
    renderTabs();
    renderFeeTable();
}

function downloadFeesCsv() {
    const section = getActiveSection();

    if (!section) {
        return;
    }

    const csvRows = [];
    csvRows.push((section.headers || []).join(","));

    getTradingRows(section).forEach((row) => {
        if (section.type === "wallet_fee") {
            csvRows.push([
                row.asset,
                row.network,
                row.deposit_fee,
                row.withdrawal_fee,
                `${row.minimum_deposit} / ${row.minimum_withdrawal}`,
                row.processing
            ].map((value) => `"${String(value || "").replaceAll('"', '""')}"`).join(","));
            return;
        }

        csvRows.push([
            row.tier,
            row.volume_label,
            formatFeeRate(row.maker_fee_percent),
            formatFeeRate(row.taker_fee_percent),
            section.type === "options_fee" ? formatFeeRate(row.exercise_fee_percent) : row.support,
            section.type === "options_fee" ? row.support : row.status
        ].map((value) => `"${String(value || "").replaceAll('"', '""')}"`).join(","));
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `traidiumx-${activeFeeTab}-fees.csv`;
    link.click();

    URL.revokeObjectURL(url);

    showMiniMessage("Fee CSV downloaded successfully.", "success");
}

function initEvents() {
    [calculatorProduct, calculatorOrderType, calculatorTier, orderValueInput].forEach((input) => {
        if (input) {
            input.addEventListener("input", calculateFee);
            input.addEventListener("change", calculateFee);
        }
    });

    if (downloadFeesCsvBtn) {
        downloadFeesCsvBtn.addEventListener("click", downloadFeesCsv);
    }
}

function renderAll() {
    clearError();
    renderHeroSummary();
    renderTabs();
    renderFeeTable();
    renderVipCards();
    renderPolicyNotes();
    initCalculatorOptions();
    calculateFee();
}

async function initFeePage() {
    try {
        feeStructure = await fetchFeeStructure();

        if (!getSections().some((section) => section.key === activeFeeTab)) {
            activeFeeTab = getSections()[0]?.key || "futures";
        }

        renderAll();
        initEvents();
    } catch (error) {
        const message = error?.message || (typeof showApiError === "function" ? showApiError(error, "Unable to load fee structure from backend.") : "Unable to load fee structure from backend.");
        showError(message);
        showMiniMessage(message, "error");

        if (feeUpdatedAt) {
            feeUpdatedAt.textContent = "Fee structure API unavailable. Please start Flask backend and refresh.";
        }
    }
}

document.addEventListener("DOMContentLoaded", initFeePage);

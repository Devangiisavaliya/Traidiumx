"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Risk Disclosure Page
|--------------------------------------------------------------------------
| Frontend-only interactions:
| - Render risk disclosure sections with structured sub-clauses
| - Search risk content
| - Print disclosure
| - Download PDF
| - Save risk acknowledgement in localStorage
|--------------------------------------------------------------------------
*/

const RISK_ACK_KEY = "traidiumx_risk_acknowledged_v1";

const riskNavList = document.getElementById("riskNavList");
const riskContentList = document.getElementById("riskContentList");
const riskSearchInput = document.getElementById("riskSearchInput");
const riskEmptyState = document.getElementById("riskEmptyState");

const printRiskBtn = document.getElementById("printRiskBtn");
const downloadRiskBtn = document.getElementById("downloadRiskBtn");

const riskSectionCount = document.getElementById("riskSectionCount");
const riskAcknowledgedBadge = document.getElementById("riskAcknowledgedBadge");

const riskAcknowledgeCheckbox = document.getElementById("riskAcknowledgeCheckbox");
const saveRiskAcknowledgementBtn = document.getElementById("saveRiskAcknowledgementBtn");
const riskAcknowledgementMessage = document.getElementById("riskAcknowledgementMessage");

function escapeHtml(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

const riskSections = [
    {
        id: "general-warning",
        title: "1. General Digital Asset & Derivative Risk Warning",
        summary: "Crypto assets and high-leverage derivatives involve substantial risk of capital loss.",
        content: [
            "Extreme Price Volatility: Virtual Digital Assets (VDAs) and crypto derivatives traded on TraidiumX are subject to rapid and unpredictable market swings driven by macro factors, on-chain dynamics, and sentiment.",
            "Potential Total Loss of Principal: Trading leveraged perpetual futures or options contracts can result in the partial or total loss of deposited margin funds within seconds during turbulent market conditions."
        ]
    },
    {
        id: "unregulated-products",
        title: "2. Regulatory, Tax & Jurisdictional Legal Risks",
        summary: "Shifting regulatory frameworks, FATF sanctions, and Indian 1% TDS tax liabilities.",
        content: [
            "Evolving Regulatory Framework: Crypto assets and derivative contracts are subject to shifting legislative and regulatory scrutiny across different jurisdictions, which may affect asset tradability or deposit limits.",
            "Statutory 1% TDS & Tax Liability: Transactions involving crypto asset sales or transfers may be subject to mandatory 1% TDS withholding under Section 194S of the Indian Income Tax Act, alongside flat 30% capital gains tax obligations without loss offset.",
            "Jurisdictional Availability: Access to specific high-leverage products or fiat banking channels may be restricted in non-compliant or sanctioned territories under FATF guidelines."
        ]
    },
    {
        id: "market-volatility",
        title: "3. Market Volatility & Price Slippage Risk",
        summary: "Flash volatility, liquidity gaps, stop-loss slippage, and spread widening.",
        content: [
            "Rapid Price Dislocation: Cryptocurrency spot and futures pairs can experience sharp liquidity vacuums during high-impact economic news releases, resulting in substantial slippage on market orders.",
            "Stop-Loss Execution Gaps: Stop-loss trigger orders become market orders upon price threshold activation; in fast-moving markets, the actual execution price may differ unfavorably from the set trigger price.",
            "No Past Performance Guarantee: Historical profitability, algorithmic backtests, and technical chart indicators do not predict or guarantee future price movements."
        ]
    },
    {
        id: "leverage-risk",
        title: "4. Leverage, Margin Modes & Borrowed Capital Risk",
        summary: "50x leverage risks, Isolated vs Cross Margin mechanics, and Maintenance Margin requirements.",
        content: [
            "High Leverage Multiplier (Up to 50x): TraidiumX permits leverage up to 50x on select perpetual contracts. While leverage magnifies returns, it proportionally amplifies adverse price movements against your initial margin.",
            "Isolated vs Cross Margin Mechanics: In Isolated Margin mode, maximum loss is restricted to the position's assigned margin. In Cross Margin mode, losses in one position can deplete the entire available USDT wallet balance.",
            "Maintenance Margin Requirements: Traders are required to maintain collateral above the dynamic Maintenance Margin Rate (MMR). Falling below MMR triggers automatic liquidation intervention.",
            "Leverage Reduction Under Volatility: During sudden liquidity squeezes or extreme token volatility, TraidiumX may dynamically calibrate maximum allowable leverage tiers to safeguard systemic market solvency."
        ]
    },
    {
        id: "liquidation-risk",
        title: "5. Liquidation Engine & Fair Mark Price Mechanics",
        summary: "Automated liquidation triggers, multi-exchange Mark Price protection, Insurance Fund, and ADL.",
        content: [
            "Automated Liquidation Trigger: When an open contract's margin ratio reaches 100% of MMR, the TraidiumX risk engine immediately cancels open orders for that symbol and liquidates the position at the prevailing market price.",
            "Multi-Exchange Fair Mark Price Index: To protect traders from malicious spot book manipulation and wick cascades, liquidations on TraidiumX are evaluated against a composite Fair Mark Price Index rather than the local last traded price.",
            "Liquidation Clearance Deficits: If a liquidated position cannot be closed at or above the bankruptcy price due to severe market gaps, the TraidiumX Insurance Fund absorbs the deficit.",
            "Auto-Deleveraging (ADL) Protocol: In extreme scenarios where the platform Insurance Fund is exhausted, opposing profitable positions with the highest leverage rank may undergo automatic deleveraging (ADL)."
        ]
    },
    {
        id: "options-risk",
        title: "6. Crypto Options Chain & Greek Sensitivity Risks",
        summary: "Option buyer premium loss, Theta time decay, Delta risk, and Implied Volatility collapse.",
        content: [
            "Options Premium Risk: Buyers of Call or Put options face the complete forfeiture of paid upfront premiums if the contract expires Out-of-the-Money (OTM).",
            "Theta Time Decay: Crypto options experience accelerating Theta decay as expiration approaches, eroding contract value non-linearly even if underlying asset prices remain stagnant.",
            "Implied Volatility (IV) Crush: Sudden contractions in market volatility can drastically reduce option premiums despite favorable spot price direction.",
            "Short Option Exposure: Selling unhedged Call or Put options involves theoretically unlimited loss exposure and requires intensive dynamic margin management."
        ]
    },
    {
        id: "funding-risk",
        title: "7. 8-Hour Funding Rate & Perpetual Contract Costs",
        summary: "Periodic funding payment cycles, Long/Short premium divergence, and margin balance decay.",
        content: [
            "Continuous 8-Hour Funding Cycle: TraidiumX Perpetual contracts exchange peer-to-peer funding payments between Long and Short position holders every 8 hours based on the premium index.",
            "Funding Rate Margin Deduction: In prolonged bull or bear momentum phases, carrying high-leverage positions over multiple funding cycles can steadily deplete free collateral through accumulated funding payments.",
            "Variable Funding Rates: Funding rates fluctuate dynamically according to open interest imbalance and spot-perp spread differentials."
        ]
    },
    {
        id: "liquidity-risk",
        title: "8. Order Execution, Matching Engine & Liquidity Risk",
        summary: "High-throughput matching engine priority, partial fills, Post-Only, and Reduce-Only execution.",
        content: [
            "Price-Time Matching Queue: All Limit, Market, and Trigger orders are processed by the high-throughput TraidiumX matching engine in strict order of price and arrival timestamp.",
            "Partial Order Fills: Limit orders placed outside active spread depths may remain unfilled or execute in partial fragments as opposing counterparties appear.",
            "Post-Only & Reduce-Only Features: Traders must utilize advanced order flags (Post-Only to guarantee Maker fee tier, Reduce-Only to prevent accidental position inversion) to control execution risk."
        ]
    },
    {
        id: "wallet-risk",
        title: "9. Wallet Security, Memo/Tag Accuracy & Network Gas Risks",
        summary: "USDT TRC20/BEP20 network precision, UPI/IMPS name matching, and 24-hour security locks.",
        content: [
            "Blockchain Network Selection: Sending crypto assets via an incorrect blockchain network (e.g., sending BEP20 USDT to an ERC20 address) or omitting mandatory Memo/Tag identifiers will lead to permanent loss of assets.",
            "Dynamic Gas & Miner Fees: On-chain withdrawal fees reflect live blockchain network congestion and gas costs on TRC20, BEP20, and ERC20 networks.",
            "24-Hour Security Cool-off: Resetting passwords, updating 2FA, or altering security settings activates an automated 24-hour withdrawal lock on all wallet assets.",
            "Bank Verification (UPI/IMPS): Fiat INR deposits and withdrawals must match the verified legal name on the user's KYC profile; third-party deposits will be declined."
        ]
    },
    {
        id: "platform-risk",
        title: "10. Platform Availability, Maintenance & Operational Risks",
        summary: "Clustered microservices, latency fluctuations, scheduled maintenance, and stop-loss hygiene.",
        content: [
            "Clustered Microservices Uptime: While TraidiumX maintains high-availability servers, unforeseen cloud outages, DDoS attacks, or upstream internet provider disruptions may cause temporary latency.",
            "Scheduled System Upgrades: Engine upgrades and infrastructure maintenance are announced in advance. During maintenance windows, order submission or cancellation may be temporarily restricted.",
            "Mandatory Stop-Loss Hygiene: Users must maintain active Take-Profit and Stop-Loss safety orders to insulate positions against network drops or client-side connection failures."
        ]
    },
    {
        id: "cybersecurity-risk",
        title: "11. Cybersecurity, Phishing & API Secret Key Risks",
        summary: "Account credentials safeguarding, API key permission boundaries, and phishing precautions.",
        content: [
            "Phishing and Social Engineering: TraidiumX will never ask for your passwords, SMS OTPs, or Authenticator seed codes. Always verify the official domain name before entering credentials.",
            "API Key Secret Management: Users creating automated trading bots via API keys must restrict IP addresses and avoid granting withdrawal permissions to third-party scripts.",
            "Device Security & Malware: Users are responsible for safeguarding their devices against keyloggers, malicious browser extensions, and unauthorized remote access tools."
        ]
    },
    {
        id: "fee-tax-risk",
        title: "12. Maker/Taker Fees & Statutory Deductions Risk",
        summary: "Trading fees (Spot 0.10%, Futures 0.02%/0.05%), VIP volume tiers, and 1% TDS deductions.",
        content: [
            "Tiered Fee Impact: Frequent scalping and high-turnover trading without accounting for Maker (0.02%) and Taker (0.05%) fee schedules can significantly erode net trading yields.",
            "Statutory Tax Compliance: Capital gains and 1% TDS deducted at source are non-negotiable legal requirements under national digital asset tax regulations.",
            "Dynamic Fee Schedule: TraidiumX may revise fee tiers and VIP thresholds based on platform volume metrics and liquidity incentive programs."
        ]
    },
    {
        id: "no-advice",
        title: "13. Independent Financial Responsibility & No Advice Disclaimer",
        summary: "Execution-only trading technology platform with no personalized financial advice.",
        content: [
            "Execution-Only Platform: TraidiumX does not provide investment, financial, legal, or tax advisory services. All charts, blogs, and market indicators are strictly educational.",
            "Independent Risk Evaluation: Users must assess their own financial capacity, trading expertise, and risk tolerance before committing capital to crypto derivatives."
        ]
    },
    {
        id: "user-responsibility",
        title: "14. Binding User Acknowledgement & Capital Risk Acceptance",
        summary: "Voluntary capital risk assumption and user responsibility for leverage decisions.",
        content: [
            "Voluntary Risk Assumption: By trading on TraidiumX, you acknowledge that you are entering into high-risk financial derivative contracts at your sole discretion and risk.",
            "Waiver of Liability: You agree that TraidiumX shall not be held liable for trading losses, market volatility drawdowns, or user-initiated operational mistakes."
        ]
    }
];

function showMiniMessage(message, type = "success") {
    let messageBox = document.getElementById("riskMiniMessage");

    if (!messageBox) {
        messageBox = document.createElement("div");
        messageBox.id = "riskMiniMessage";
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

function getFilteredRiskSections() {
    const searchValue = riskSearchInput ? riskSearchInput.value.trim().toLowerCase() : "";

    if (!searchValue) {
        return riskSections;
    }

    return riskSections.filter((section) => {
        const text = [
            section.title,
            section.summary,
            ...section.content
        ].join(" ").toLowerCase();

        return text.includes(searchValue);
    });
}

function renderRiskNav(sections) {
    if (!riskNavList) {
        return;
    }

    riskNavList.innerHTML = sections
        .map((section) => {
            return `
                <button type="button" data-target="${section.id}" class="risk-nav-btn">
                    <span>${escapeHtml(section.title.replace(/^\d+\.\s?/, ""))}</span>
                    <small>Open</small>
                </button>
            `;
        })
        .join("");

    riskNavList.querySelectorAll("[data-target]").forEach((button) => {
        button.addEventListener("click", () => {
            const targetId = button.getAttribute("data-target");
            const target = document.getElementById(targetId);

            if (target) {
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

                // Auto expand when clicked from navigation
                const body = target.querySelector(".risk-card-body");
                const chevron = target.querySelector(".risk-chevron");
                const isOpen = target.classList.contains("bg-white/[0.08]");
                if (body && !isOpen) {
                    body.style.maxHeight = body.scrollHeight + "px";
                    target.classList.add("border-cyan-400/30");
                    target.classList.add("bg-white/[0.08]");
                    if (chevron) {
                        chevron.classList.add("text-cyan-400");
                        chevron.style.transform = "rotate(180deg)";
                    }
                }
            }
        });
    });
}

function renderRiskContent(sections) {
    if (!riskContentList) {
        return;
    }

    riskContentList.innerHTML = sections
        .map((section) => {
            return `
                <article id="${section.id}" class="risk-section-card cursor-pointer scroll-mt-32 transition-all duration-300">
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <h3 class="text-xl font-black text-white">${escapeHtml(section.title)}</h3>
                            <p class="mt-2 text-sm leading-6 text-slate-400">${escapeHtml(section.summary)}</p>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                            <span class="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-300">
                                Risk
                            </span>
                            <span class="risk-chevron text-slate-500 font-bold transition-transform duration-300">▼</span>
                        </div>
                    </div>

                    <div class="risk-card-body overflow-hidden max-h-0 transition-all duration-300 ease-in-out">
                        <div class="border-t border-white/5 pt-4 mt-5 space-y-3">
                            ${section.content.map((paragraph) => {
                                if (paragraph.includes(": ")) {
                                    const parts = paragraph.split(": ");
                                    const prefix = escapeHtml(parts[0]);
                                    const bodyText = escapeHtml(parts.slice(1).join(": "));
                                    return `
                                        <div class="rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition hover:border-cyan-400/20 hover:bg-white/[0.04]">
                                            <h5 class="text-sm font-black text-cyan-400 mb-1.5">${prefix}</h5>
                                            <p class="text-slate-300 text-xs sm:text-sm leading-relaxed">${bodyText}</p>
                                        </div>
                                    `;
                                }
                                return `<p class="leading-7 text-slate-300 text-sm">${escapeHtml(paragraph)}</p>`;
                            }).join("")}
                        </div>
                    </div>
                </article>
            `;
        })
        .join("");

    riskContentList.querySelectorAll(".risk-section-card").forEach((card) => {
        card.addEventListener("click", () => {
            const body = card.querySelector(".risk-card-body");
            const chevron = card.querySelector(".risk-chevron");
            if (body) {
                const isOpen = card.classList.contains("bg-white/[0.08]");
                if (!isOpen) {
                    body.style.maxHeight = body.scrollHeight + "px";
                    card.classList.add("border-cyan-400/30");
                    card.classList.add("bg-white/[0.08]");
                    if (chevron) {
                        chevron.classList.add("text-cyan-400");
                        chevron.style.transform = "rotate(180deg)";
                    }
                } else {
                    body.style.maxHeight = "0px";
                    card.classList.remove("border-cyan-400/30");
                    card.classList.remove("bg-white/[0.08]");
                    if (chevron) {
                        chevron.classList.remove("text-cyan-400");
                        chevron.style.transform = "rotate(0deg)";
                    }
                }
            }
        });
    });

    if (riskEmptyState) {
        riskEmptyState.classList.toggle("hidden", sections.length > 0);
    }
}

function renderRiskDisclosure() {
    const sections = getFilteredRiskSections();

    renderRiskNav(sections);
    renderRiskContent(sections);

    if (riskSectionCount) {
        riskSectionCount.textContent = String(riskSections.length);
    }
}

function getAllRiskText() {
    return riskSections
        .map((section) => {
            return [
                section.title,
                section.summary,
                ...section.content
            ].join("\n");
        })
        .join("\n\n");
}

function downloadRiskPdf() {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "0";
    container.style.width = "794px";
    container.style.height = "0";
    container.style.overflow = "hidden";
    document.body.appendChild(container);

    const element = document.createElement("div");
    element.style.width = "794px";
    element.style.padding = "40px";
    element.style.color = "#020617";
    element.style.backgroundColor = "#ffffff";
    element.style.fontFamily = "sans-serif";

    element.innerHTML = `
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="font-size: 28px; font-weight: 800; color: #020617; margin: 0;">TraidiumX Risk Disclosure</h1>
            <p style="font-size: 13px; color: #64748b; margin: 8px 0 0 0;">Version: 1.0 | Last Updated: 22 Jun 2026</p>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 30px;" />
        ${riskSections.map(section => `
            <div style="margin-bottom: 25px; page-break-inside: avoid;">
                <h2 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0;">${section.title}</h2>
                <p style="font-size: 11px; font-weight: 600; color: #64748b; font-style: italic; margin: 0 0 10px 0;">${section.summary}</p>
                ${section.content.map(p => {
                    if (p.includes(": ")) {
                        const parts = p.split(": ");
                        return `<p style="font-size: 11px; line-height: 1.6; color: #334155; margin: 0 0 8px 0; text-align: justify;"><strong style="color: #0f172a;">${parts[0]}:</strong> ${parts.slice(1).join(": ")}</p>`;
                    }
                    return `<p style="font-size: 11px; line-height: 1.6; color: #334155; margin: 0 0 8px 0; text-align: justify;">${p}</p>`;
                }).join("")}
            </div>
        `).join("")}
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 35px; margin-bottom: 15px;" />
        <div style="text-align: center; font-size: 10px; color: #94a3b8;">
            TraidiumX Compliance & Risk Management Team.
        </div>
    `;
    container.appendChild(element);

    const opt = {
        margin:       15,
        filename:     'traidiumx-risk-disclosure.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, scrollX: 0, scrollY: 0 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    if (typeof html2pdf !== "undefined") {
        html2pdf()
            .from(element)
            .set(opt)
            .save()
            .then(() => {
                container.remove();
            });
        showMiniMessage("Risk disclosure PDF downloaded successfully.", "success");
    } else {
        container.remove();
        window.print();
    }
}

function printRisk() {
    window.print();
}

function updateAcknowledgedStatus() {
    const acknowledged = localStorage.getItem(RISK_ACK_KEY) === "true";

    if (riskAcknowledgeCheckbox) {
        riskAcknowledgeCheckbox.checked = acknowledged;
    }

    if (riskAcknowledgedBadge) {
        if (acknowledged) {
            riskAcknowledgedBadge.textContent = "Acknowledged";
            riskAcknowledgedBadge.className = "rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-400";
        } else {
            riskAcknowledgedBadge.textContent = "Not Acknowledged";
            riskAcknowledgedBadge.className = "rounded-full bg-orange-400/10 px-3 py-1 text-xs font-black text-orange-300";
        }
    }
}

function saveRiskAcknowledgement() {
    if (!riskAcknowledgeCheckbox || !riskAcknowledgeCheckbox.checked) {
        showMiniMessage("Please tick the checkbox before saving.", "error");
        return;
    }

    localStorage.setItem(RISK_ACK_KEY, "true");

    updateAcknowledgedStatus();

    if (riskAcknowledgementMessage) {
        riskAcknowledgementMessage.classList.remove("hidden");
        riskAcknowledgementMessage.textContent = "Risk acknowledged successfully.";
    }

    showMiniMessage("Risk acknowledgement saved successfully.", "success");

    window.setTimeout(() => {
        if (riskAcknowledgementMessage) {
            riskAcknowledgementMessage.classList.add("hidden");
        }
    }, 3000);
}

function initEvents() {
    if (riskSearchInput) {
        riskSearchInput.addEventListener("input", renderRiskDisclosure);
    }

    if (downloadRiskBtn) {
        downloadRiskBtn.addEventListener("click", downloadRiskPdf);
    }

    if (printRiskBtn) {
        printRiskBtn.addEventListener("click", printRisk);
    }

    if (saveRiskAcknowledgementBtn) {
        saveRiskAcknowledgementBtn.addEventListener("click", saveRiskAcknowledgement);
    }
}

function initRiskDisclosurePage() {
    renderRiskDisclosure();
    updateAcknowledgedStatus();
    initEvents();
}

document.addEventListener("DOMContentLoaded", initRiskDisclosurePage);
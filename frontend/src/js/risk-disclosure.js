"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Risk Disclosure Page
|--------------------------------------------------------------------------
| Frontend-only interactions:
| - Render risk disclosure sections
| - Search risk content
| - Print disclosure
| - Download TXT
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

const riskSections = [
    {
        id: "general-warning",
        title: "1. General Risk Warning",
        summary: "Crypto assets and crypto derivatives are high-risk products.",
        content: [
            "Crypto assets, virtual digital assets, futures, options, margin products and leveraged trading products are highly risky and may not be suitable for all users.",
            "The value of crypto assets and derivative contracts may rise or fall rapidly due to market demand, liquidity, news, technology events, regulatory changes and global market conditions.",
            "You should trade only if you understand the product, risk, margin requirement, fee structure, liquidation process and possible financial loss."
        ]
    },
    {
        id: "unregulated-products",
        title: "2. Regulatory And Legal Risk",
        summary: "Crypto products may be subject to uncertain or changing regulation.",
        content: [
            "Crypto assets and related products may be unregulated, partially regulated or subject to changing legal treatment depending on jurisdiction.",
            "There may be limited or no regulatory recourse for losses arising from crypto asset transactions, derivative contracts, wallet activity or third-party service failures.",
            "Users are responsible for understanding and complying with applicable laws, restrictions, reporting requirements and tax obligations."
        ]
    },
    {
        id: "market-volatility",
        title: "3. Market Volatility Risk",
        summary: "Crypto markets can move sharply within seconds.",
        content: [
            "Crypto prices may be extremely volatile and may move significantly within short time periods.",
            "Sudden market movement may cause stop-loss slippage, liquidation, failed orders, partial execution or large mark-to-market losses.",
            "Past performance, historical price movement or previous market behavior does not guarantee future performance."
        ]
    },
    {
        id: "leverage-risk",
        title: "4. Leverage And Margin Risk",
        summary: "Leverage magnifies gains and losses.",
        content: [
            "Leverage allows users to open larger positions using smaller margin, but it also increases loss exposure.",
            "A small adverse market movement may lead to margin loss, forced reduction of position or liquidation.",
            "Users should not use leverage without understanding initial margin, maintenance margin, margin mode, risk limit, mark price and liquidation price."
        ]
    },
    {
        id: "liquidation-risk",
        title: "5. Liquidation Risk",
        summary: "Positions may be force-closed when margin is insufficient.",
        content: [
            "If account margin falls below required maintenance margin, open positions may be liquidated automatically.",
            "Liquidation may occur quickly during volatile market conditions and may result in substantial or complete loss of margin balance.",
            "Risk tools, alerts, stop-loss orders or margin indicators may reduce but cannot eliminate liquidation risk."
        ]
    },
    {
        id: "options-risk",
        title: "6. Options Trading Risk",
        summary: "Options are complex and may lose value due to time, volatility and price movement.",
        content: [
            "Options contracts involve premium, strike price, expiry, implied volatility, delta, theta, gamma and liquidity risk.",
            "Options buyers may lose the full premium paid if the contract expires worthless or moves unfavorably.",
            "Options sellers or advanced strategy users may face higher and more complex risk depending on contract type and margin model."
        ]
    },
    {
        id: "liquidity-risk",
        title: "7. Liquidity And Execution Risk",
        summary: "Orders may not execute at expected price or quantity.",
        content: [
            "Low liquidity, thin order books, market gaps and high volatility may prevent orders from executing at expected price.",
            "Market orders may suffer slippage. Limit orders may remain unfilled or partially filled.",
            "Execution may be affected by matching engine load, network latency, API delays, maintenance or third-party service issues."
        ]
    },
    {
        id: "platform-risk",
        title: "8. Platform Availability And Operational Risk",
        summary: "Trading access may be interrupted by technical problems.",
        content: [
            "The platform may face downtime, maintenance, server errors, transaction delays, delayed price updates, API failure or charting errors.",
            "Operational disruptions may prevent users from placing, modifying or cancelling orders during critical market conditions.",
            "Users should not rely only on frontend display values and should maintain independent risk awareness."
        ]
    },
    {
        id: "wallet-risk",
        title: "9. Wallet, Deposit And Withdrawal Risk",
        summary: "Wallet operations may involve delays, errors or security checks.",
        content: [
            "Deposits and withdrawals may be delayed, rejected or reviewed due to incorrect details, network congestion, compliance checks, risk review or technical issues.",
            "Users are responsible for verifying bank details, wallet addresses, network selection and transaction references before submitting requests.",
            "Incorrect wallet network or destination details may result in permanent loss of funds."
        ]
    },
    {
        id: "fee-tax-risk",
        title: "10. Fee And Tax Risk",
        summary: "Fees and tax obligations can affect trading returns.",
        content: [
            "Trading fees, funding fees, withdrawal fees, GST, tax deduction, tax collection or other statutory charges may reduce net returns.",
            "Tax rules may change and may differ based on user location, transaction type, income category and applicable law.",
            "Users are solely responsible for understanding, reporting and paying taxes arising from trading, wallet transfers, profits or other platform activity."
        ]
    },
    {
        id: "cybersecurity-risk",
        title: "11. Cybersecurity Risk",
        summary: "Accounts, wallets and systems may be targeted by attackers.",
        content: [
            "Crypto platforms, user accounts, devices, wallets, APIs and email accounts may be exposed to hacking, phishing, malware, credential theft and unauthorized access.",
            "Users should use strong passwords, secure devices, trusted networks and additional security features whenever available.",
            "A cybersecurity event may cause financial loss, data exposure, account restriction or delayed access to funds."
        ]
    },
    {
        id: "third-party-risk",
        title: "12. Third-Party And Blockchain Network Risk",
        summary: "External services and blockchain networks may fail or behave unexpectedly.",
        content: [
            "The platform may depend on third-party services such as banks, KYC providers, cloud providers, analytics tools, blockchain networks, wallet services and price feeds.",
            "Third-party failures, forks, network congestion, outages, data errors or service restrictions may impact trading, wallet operations and user access.",
            "TraidiumX may not control third-party systems and cannot guarantee their uninterrupted performance."
        ]
    },
    {
        id: "no-advice",
        title: "13. No Financial Advice",
        summary: "Platform content is not investment, financial, tax or legal advice.",
        content: [
            "Educational content, blogs, calculators, charts, indicators, market summaries, fee previews and campaign pages are for information only.",
            "TraidiumX does not guarantee profit and does not provide personalized financial, investment, tax or legal advice.",
            "Users should consult independent advisors and make decisions based on their own financial situation, experience, objectives and risk tolerance."
        ]
    },
    {
        id: "user-responsibility",
        title: "14. User Responsibility",
        summary: "Users are responsible for their own trades, risk and losses.",
        content: [
            "Users are solely responsible for order placement, leverage selection, position sizing, trading strategy, wallet activity, security practices and tax compliance.",
            "Before trading, users should understand product rules, risk limits, fees, margin requirements, liquidation process and account restrictions.",
            "If you are uncomfortable with these risks, you should not use futures, options, leverage, margin or other high-risk products."
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
        messageBox.className = "fixed bottom-6 right-6 z-[9999] max-w-sm rounded-2xl border border-cyan-400/30 bg-cyan-400/15 px-5 py-4 text-sm font-black text-cyan-300 shadow-2xl transition";
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
                    <span>${section.title.replace(/^\d+\.\s?/, "")}</span>
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
                            <h3 class="text-xl font-black text-white">${section.title}</h3>
                            <p class="mt-2 text-sm leading-6 text-slate-400">${section.summary}</p>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                            <span class="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-300">
                                Risk
                            </span>
                            <span class="risk-chevron text-slate-500 font-bold transition-transform duration-300">▼</span>
                        </div>
                    </div>

                    <div class="risk-card-body overflow-hidden max-h-0 transition-all duration-300 ease-in-out">
                        <div class="border-t border-white/5 pt-4 mt-5 space-y-4">
                            ${section.content.map((paragraph) => {
                                return `<p class="leading-8 text-slate-300 text-sm">${paragraph}</p>`;
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
                ${section.content.map(p => `
                    <p style="font-size: 11px; line-height: 1.6; color: #334155; margin: 0 0 8px 0; text-align: justify;">${p}</p>
                `).join("")}
            </div>
        `).join("")}
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 35px; margin-bottom: 15px;" />
        <div style="text-align: center; font-size: 10px; color: #94a3b8;">
            TraidiumX Compliance & Legal Operations Team.
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

    html2pdf()
        .from(element)
        .set(opt)
        .save()
        .then(() => {
            container.remove();
        });
    showMiniMessage("Risk disclosure PDF downloaded successfully.", "success");
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

    showMiniMessage("Risk acknowledgement saved successfully.", "success");
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
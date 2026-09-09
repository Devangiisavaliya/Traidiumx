"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Terms & Conditions Page
|--------------------------------------------------------------------------
| Frontend-only interactions:
| - Render terms sections with structured sub-clauses
| - Search terms
| - Print
| - Download PDF
| - Accept terms in localStorage
|--------------------------------------------------------------------------
*/

const TERMS_ACCEPTED_KEY = "traidiumx_terms_accepted_v1";

const termsNavList = document.getElementById("termsNavList");
const termsContentList = document.getElementById("termsContentList");
const termsSearchInput = document.getElementById("termsSearchInput");
const termsEmptyState = document.getElementById("termsEmptyState");

const printTermsBtn = document.getElementById("printTermsBtn");
const downloadTermsBtn = document.getElementById("downloadTermsBtn");

const acceptTermsCheckbox = document.getElementById("acceptTermsCheckbox");
const saveTermsAcceptanceBtn = document.getElementById("saveTermsAcceptanceBtn");
const termsAcceptanceMessage = document.getElementById("termsAcceptanceMessage");
const termsAcceptedBadge = document.getElementById("termsAcceptedBadge");
const termsSectionCount = document.getElementById("termsSectionCount");

function escapeHtml(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

const termsSections = [
    {
        id: "agreement",
        title: "1. Agreement To Terms & Scope of Platform",
        summary: "Legally binding agreement governing user access to TraidiumX spot, perpetual futures and options trading infrastructure.",
        content: [
            "Binding Legal Contract: By accessing, creating an account, depositing assets, or executing orders on TraidiumX, you enter into a legally binding agreement governed by these Terms & Conditions, the KYC-AML Framework, and our Risk Disclosure Policy.",
            "Continuous Acceptance: TraidiumX reserves the right to amend or enhance platform rules, trading parameters, and fee schedules to comply with regulatory updates or architectural enhancements. Continued use constitutes explicit assent to the revised terms."
        ]
    },
    {
        id: "eligibility",
        title: "2. User Eligibility & Jurisdictional Compliance",
        summary: "Age verification, jurisdictional restrictions, sanctions compliance, and one-account policy.",
        content: [
            "Age and Legal Capacity: You must be at least 18 years of age (or the legal age of majority in your jurisdiction) and possess full legal capacity to enter into high-risk financial derivative agreements.",
            "Restricted Jurisdictions & Sanctions: Access is strictly prohibited to persons or entities residing in FATF blacklisted countries, OFAC sanctioned territories, or jurisdictions where crypto derivatives and digital asset trading are explicitly banned by local law.",
            "Single Verified Identity: Each user is permitted exactly one primary verified trading account. Creating multiple synthetic accounts to exploit promo vouchers, bypass trading limits, or circumvent margin restrictions is strictly prohibited."
        ]
    },
    {
        id: "account",
        title: "3. Account Registration, Security & 2FA Responsibility",
        summary: "Account credentials, API security keys, and user responsibility for multi-factor authentication.",
        content: [
            "Credential Safeguarding: You are solely responsible for maintaining the confidentiality of your login credentials, API secret keys, email authentication tokens, and Time-based One-Time Password (TOTP) two-factor authentication.",
            "Authorized Activity Assumption: Any order placed, withdrawal requested, or API instruction executed using your authenticated credentials will be treated as authorized by you. TraidiumX is not liable for losses resulting from credential phishing, device theft, or session compromise.",
            "Immediate Breach Notification: If you detect or suspect unauthorized access, abnormal API calls, or security anomalies on your account, you must immediately freeze your API keys and alert TraidiumX Security Support."
        ]
    },
    {
        id: "kyc",
        title: "4. Mandatory KYC, DigiLocker Verification & AML Controls",
        summary: "Identity verification requirements, PMLA compliance, DigiLocker Aadhaar e-KYC, and transaction screening.",
        content: [
            "Mandatory Verification for Fiat & Withdrawals: All users must complete Level 1 KYC verification (PAN validation and DigiLocker Aadhaar e-KYC) prior to initiating INR deposits, executing fiat withdrawals, or accessing high-tier crypto withdrawal channels.",
            "Anti-Money Laundering (PMLA/FATF) Screening: TraidiumX enforces automated transaction screening and blacklisted wallet checks. High-risk deposits linked to mixers, darknet entities, or sanctioned smart contracts will be quarantined pending Enhanced Due Diligence (EDD).",
            "Accuracy and Document Authenticity: Providing forged, expired, modified, or third-party identity documents is a material breach resulting in immediate account termination, asset freezing, and escalation to regulatory authorities.",
            "Periodic Re-Verification: TraidiumX reserves the right to trigger periodic identity re-verification or request proof of source of funds for high-turnover accounts exceeding institutional volume thresholds."
        ]
    },
    {
        id: "trading-risk",
        title: "5. Derivatives, Perpetual Futures & Options Trading Rules",
        summary: "Leverage limits up to 50x, 8-hour funding rates, options chains, Greeks pricing, and mark price indexation.",
        content: [
            "Perpetual Futures Leverage: TraidiumX provides leveraged perpetual contracts up to 50x. Leverage multiplies both prospective gains and potential losses. Users must manage position sizing and margin modes (Isolated vs Cross Margin) diligently.",
            "8-Hour Funding Rate Mechanism: Perpetual contracts utilize an automated 8-hour funding rate mechanism to anchor contract prices to spot index benchmarks. Depending on premium or discount rates, long or short position holders will pay or receive continuous funding payments directly from their margin balance.",
            "Options Matrix & Greeks Risk: TraidiumX crypto options chains (Calls and Puts) are settled against strike prices. Option buyers face loss of premium, while naked option sellers incur substantial downside risk from adverse Delta, Gamma, and Theta decay movements.",
            "Mark Price Indexing: Position valuations, unrealized PnL, and liquidation triggers are calculated using the multi-exchange Fair Mark Price Index rather than the last traded price on the local order book, preventing predatory flash-crash liquidations.",
            "High Volatility & Margin Buffer: In moments of extreme market volatility, network congestion, or rapid index shifts, users are required to maintain an additional maintenance margin buffer above minimum baseline thresholds."
        ]
    },
    {
        id: "orders",
        title: "6. Order Matching, Execution & Auto-Liquidation Engine",
        summary: "Matching engine priority, auto-liquidation thresholds, insurance fund mechanics, and Auto-Deleveraging (ADL).",
        content: [
            "Order Execution Priority: The TraidiumX high-throughput matching engine executes Limit, Market, and Stop-Trigger orders based on strict Price-Time priority. Slippage may occur on market orders during high-velocity price movements.",
            "Automated Liquidation Trigger: When a position's margin ratio drops below the mandatory Maintenance Margin Rate (MMR), the risk engine will automatically take over the position and liquidate it at the prevailing bankruptcy price.",
            "Insurance Fund & Auto-Deleveraging (ADL): Deficits from liquidation positions that cannot be cleared at the bankruptcy price are covered by the TraidiumX Insurance Fund. If the insurance fund is depleted during catastrophic market collapses, top-ranking profitable positions may undergo automated deleveraging (ADL).",
            "Order Cancellation & Rejection: TraidiumX reserves the right to reject or cancel open limit orders that violate price banding thresholds, exceed fat-finger safety limits, or breach platform-wide risk ceiling constraints."
        ]
    },
    {
        id: "fees",
        title: "7. Fee Schedule, Maker/Taker Tiers & Tax Compliance (TDS)",
        summary: "Trading fees, VIP tiers, statutory 1% TDS deduction on VDAs, and dynamic blockchain network gas costs.",
        content: [
            "Tiered Maker/Taker Structure: TraidiumX charges transparent maker (liquidity provider) and taker (liquidity consumer) transaction fees. Fee tiers are dynamically recalculated based on 30-day trailing trading volume and asset tiers.",
            "Standard Spot & Derivatives Fees: Spot trades incur standard Maker (0.10%) and Taker (0.10%) rates. Derivatives futures trades carry competitive Maker (0.02%) and Taker (0.05%) fee schedules, automatically deducted in USDT from trade margins.",
            "Statutory Tax & TDS Withholding: Where mandated by applicable law (including Indian Income Tax Act Sec 194S / 1% TDS on VDA transactions), TraidiumX deducts statutory taxes at source during crypto asset transfers or sales and remits them to tax authorities.",
            "Network & Blockchain Gas Fees: Crypto withdrawal fees are variable and dynamically calibrated to live blockchain network congestion, gas costs, and mining difficulty for TRC20, BEP20, and ERC20 networks."
        ]
    },
    {
        id: "wallet",
        title: "8. Wallet Operations, Fiat INR & Crypto Deposits/Withdrawals",
        summary: "Deposit memo accuracy, bank account name matching for UPI/IMPS, 24-hour security locks, and manual review triggers.",
        content: [
            "Network & Address Accuracy: Users must ensure correct network selection (e.g., USDT TRC20 vs USDT BEP20) and deposit memo/tag details. TraidiumX is not responsible for funds sent to incompatible smart contracts or wrong blockchain addresses.",
            "Fiat Banking (UPI / IMPS): INR deposits and withdrawals must strictly originate from and be remitted to a verified bank account registered in the exact legal name matching the user's approved KYC profile. Third-party deposits will be automatically rejected and reversed.",
            "Withdrawal Security Cool-off: Following critical security events—such as password resets, 2FA modifications, or email updates—TraidiumX imposes an automated 24-hour withdrawal lock on all wallet assets to prevent fraudulent exfiltration.",
            "Risk Review Holds: Large or anomalous withdrawal requests exceeding standard risk heuristics may be placed on temporary administrative hold for manual multi-signature compliance review."
        ]
    },
    {
        id: "prohibited-use",
        title: "9. Market Integrity & Prohibited Trading Practices",
        summary: "Prohibition of wash trading, spoofing, latency arbitrage, bot spamming, illicit funds, and account enforcement actions.",
        content: [
            "Prohibition of Market Manipulation: Wash trading, self-dealing, spoofing, layering, pump-and-dump coordination, and artificial volume inflation are strictly prohibited on all TraidiumX spot and derivative books.",
            "Latency Arbitrage & System Exploits: Utilizing toxic low-latency routing tricks, automated software bugs, or front-running stale pricing feeds across matching queues constitutes a severe breach of platform integrity.",
            "Anti-Bot Abuse & Rate Limiting: High-frequency API users must adhere to platform rate limits (REST and WebSocket). Abusive flooding of the order book with rapid cancels designed to degrade engine performance will result in API key revocation.",
            "Sanctioned and Illicit Funds: Depositing funds associated with ransomware, illicit darknet marketplaces, stolen protocols, or sanctioned addresses is grounds for immediate asset seizure and law enforcement notification.",
            "Account Enforcement Action: Accounts found violating market integrity will face immediate cancellation of pending orders, forfeiture of ill-gotten trading profits, permanent ban, and referral to regulatory agencies."
        ]
    },
    {
        id: "availability",
        title: "10. Service Availability, Scheduled Maintenance & API Limits",
        summary: "System availability, network latency, scheduled maintenance windows, and user stop-loss precautions.",
        content: [
            "No Uptime Guarantee: While TraidiumX operates high-availability clustered microservices, we do not warrant 100% uninterrupted platform access. High internet latency, telecom disruptions, cloud provider outages, or network partitions may affect connectivity.",
            "Scheduled Maintenance Protocol: Routine system upgrades and matching engine updates will be communicated in advance via platform banners and status channels. During maintenance windows, new order submissions may be temporarily paused.",
            "Client-Side Risk Management: Users are strongly urged to place Stop-Loss and Take-Profit orders to protect open positions against unexpected network interruptions, volatility spikes, or ISP failures."
        ]
    },
    {
        id: "liability",
        title: "11. Disclaimers, Risk Allocation & Limitation of Liability",
        summary: "Execution-only platform status, total risk assumption by user, and liability boundaries under law.",
        content: [
            "No Financial or Investment Advice: TraidiumX is an execution-only trading technology platform. All market commentary, algorithmic indicators, blog tutorials, and educational content are provided for informational purposes only and do not constitute financial or investment recommendations.",
            "Assumption of Volatility Losses: You explicitly acknowledge that trading cryptocurrency spot, perpetual futures, and options involves extreme financial risk and could result in the total loss of all committed capital. You agree that TraidiumX holds no liability for such losses.",
            "Maximum Liability Cap: To the fullest extent permitted by applicable law, TraidiumX and its affiliates shall not be liable for indirect, punitive, special, or consequential damages, lost profits, or data loss arising out of the use or inability to use the platform."
        ]
    },
    {
        id: "changes",
        title: "12. Governing Law, Amendments & Binding Dispute Resolution",
        summary: "Arbitration clauses, governing legal frameworks, severability, and platform terms amendment procedure.",
        content: [
            "Regulatory Jurisdiction & Arbitration: These Terms shall be interpreted and governed in accordance with the laws of the jurisdiction of incorporation. Any dispute, controversy, or claim arising out of these Terms shall be resolved exclusively through final and binding institutional arbitration.",
            "Severability & Entire Agreement: If any provision of these Terms is found to be unenforceable or invalid by an arbitration panel or court of competent jurisdiction, the remaining provisions shall remain in full force and effect."
        ]
    }
];

function showMiniMessage(message, type = "success") {
    let messageBox = document.getElementById("termsMiniMessage");

    if (!messageBox) {
        messageBox = document.createElement("div");
        messageBox.id = "termsMiniMessage";
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

function getFilteredSections() {
    const searchValue = termsSearchInput ? termsSearchInput.value.trim().toLowerCase() : "";

    if (!searchValue) {
        return termsSections;
    }

    return termsSections.filter((section) => {
        const text = [
            section.title,
            section.summary,
            ...section.content
        ].join(" ").toLowerCase();

        return text.includes(searchValue);
    });
}

function renderTermsNav(sections) {
    if (!termsNavList) {
        return;
    }

    termsNavList.innerHTML = sections
        .map((section) => {
            return `
                <button type="button" data-target="${section.id}" class="terms-nav-btn">
                    <span>${escapeHtml(section.title.replace(/^\d+\.\s?/, ""))}</span>
                    <small>Open</small>
                </button>
            `;
        })
        .join("");

    termsNavList.querySelectorAll("[data-target]").forEach((button) => {
        button.addEventListener("click", () => {
            const targetId = button.getAttribute("data-target");
            const target = document.getElementById(targetId);

            if (target) {
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

                // Auto expand when clicked from navigation
                const body = target.querySelector(".terms-card-body");
                const chevron = target.querySelector(".terms-chevron");
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

function renderTermsContent(sections) {
    if (!termsContentList) {
        return;
    }

    termsContentList.innerHTML = sections
        .map((section) => {
            return `
                <article id="${section.id}" class="terms-section-card cursor-pointer scroll-mt-32 transition-all duration-300">
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <h3 class="text-xl font-black text-white">${escapeHtml(section.title)}</h3>
                            <p class="mt-2 text-sm leading-6 text-slate-400">${escapeHtml(section.summary)}</p>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                            <span class="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-400">
                                Terms
                            </span>
                            <span class="terms-chevron text-slate-500 font-bold transition-transform duration-300">▼</span>
                        </div>
                    </div>

                    <div class="terms-card-body overflow-hidden max-h-0 transition-all duration-300 ease-in-out">
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

    termsContentList.querySelectorAll(".terms-section-card").forEach((card) => {
        card.addEventListener("click", () => {
            const body = card.querySelector(".terms-card-body");
            const chevron = card.querySelector(".terms-chevron");
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

    if (termsEmptyState) {
        termsEmptyState.classList.toggle("hidden", sections.length > 0);
    }
}

function renderTerms() {
    const sections = getFilteredSections();

    renderTermsNav(sections);
    renderTermsContent(sections);

    if (termsSectionCount) {
        termsSectionCount.textContent = String(termsSections.length);
    }
}

function getAllTermsText() {
    return termsSections
        .map((section) => {
            return [
                section.title,
                section.summary,
                ...section.content
            ].join("\n");
        })
        .join("\n\n");
}

function downloadTermsPdf() {
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
            <h1 style="font-size: 28px; font-weight: 800; color: #020617; margin: 0;">TraidiumX Terms & Conditions</h1>
            <p style="font-size: 13px; color: #64748b; margin: 8px 0 0 0;">Version: 1.0 | Last Updated: 22 Jun 2026</p>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 30px;" />
        ${termsSections.map(section => `
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
            TraidiumX Compliance & Legal Operations Team.
        </div>
    `;
    container.appendChild(element);

    const opt = {
        margin:       15,
        filename:     'traidiumx-terms-and-conditions.pdf',
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
        showMiniMessage("Terms PDF downloaded successfully.", "success");
    } else {
        container.remove();
        window.print();
    }
}

function printTerms() {
    window.print();
}

function updateAcceptedStatus() {
    const accepted = localStorage.getItem(TERMS_ACCEPTED_KEY) === "true";

    if (acceptTermsCheckbox) {
        acceptTermsCheckbox.checked = accepted;
    }

    if (termsAcceptedBadge) {
        if (accepted) {
            termsAcceptedBadge.textContent = "Accepted";
            termsAcceptedBadge.className = "rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-400";
        } else {
            termsAcceptedBadge.textContent = "Not Accepted";
            termsAcceptedBadge.className = "rounded-full bg-orange-400/10 px-3 py-1 text-xs font-black text-orange-300";
        }
    }
}

function saveAcceptance() {
    if (!acceptTermsCheckbox || !acceptTermsCheckbox.checked) {
        showMiniMessage("Please tick the checkbox before saving.", "error");
        return;
    }

    localStorage.setItem(TERMS_ACCEPTED_KEY, "true");
    updateAcceptedStatus();

    if (termsAcceptanceMessage) {
        termsAcceptanceMessage.classList.remove("hidden");
        termsAcceptanceMessage.textContent = "Terms accepted successfully.";
    }

    showMiniMessage("Terms accepted successfully.", "success");

    window.setTimeout(() => {
        if (termsAcceptanceMessage) {
            termsAcceptanceMessage.classList.add("hidden");
        }
    }, 3000);
}

function initEvents() {
    if (termsSearchInput) {
        termsSearchInput.addEventListener("input", renderTerms);
    }

    if (downloadTermsBtn) {
        downloadTermsBtn.addEventListener("click", downloadTermsPdf);
    }

    if (printTermsBtn) {
        printTermsBtn.addEventListener("click", printTerms);
    }

    if (saveTermsAcceptanceBtn) {
        saveTermsAcceptanceBtn.addEventListener("click", saveAcceptance);
    }
}

function initTermsPage() {
    renderTerms();
    updateAcceptedStatus();
    initEvents();
}

document.addEventListener("DOMContentLoaded", initTermsPage);
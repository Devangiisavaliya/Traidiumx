"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Terms & Conditions Page
|--------------------------------------------------------------------------
| Frontend-only interactions:
| - Render terms sections
| - Search terms
| - Print
| - Download TXT
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

const termsSections = [
    {
        id: "agreement",
        title: "1. Agreement To Terms",
        summary: "By accessing TraidiumX, users agree to follow platform rules and policies.",
        content: [
            "By accessing, browsing, registering or using TraidiumX, you agree to be bound by these Terms & Conditions, Privacy Policy, Risk Disclosure, KYC-AML Policy and any additional rules published on the platform.",
            "If you do not agree with these terms, you should not create an account, deposit funds, trade, use wallet services or participate in any campaign.",
            "TraidiumX reserves the right to modify these Terms at any time without prior notice. Continued use of the platform constitutes agreement to the updated terms."
        ]
    },
    {
        id: "eligibility",
        title: "2. User Eligibility",
        summary: "Users must meet age, location and verification requirements.",
        content: [
            "Users must be legally eligible to use trading services in their jurisdiction and must not be restricted by applicable laws, sanctions or compliance rules.",
            "The current TraidiumX product flow requires completed and approved KYC for deposits, wallet transfers, trading, and withdrawals, subject to any additional legal or risk controls.",
            "TraidiumX may refuse service, suspend access or request additional documents if eligibility or compliance requirements are not satisfied."
        ]
    },
    {
        id: "account",
        title: "3. Account Registration & Security",
        summary: "Users are responsible for account accuracy, passwords and account activity.",
        content: [
            "Users must provide accurate, complete and updated information during registration and KYC verification.",
            "Users are responsible for maintaining the confidentiality of passwords, devices, email accounts, authentication methods and login credentials.",
            "Any activity performed from a user account may be treated as authorized activity. Users should immediately contact support if they suspect unauthorized access."
        ]
    },
    {
        id: "kyc",
        title: "4. KYC, AML & Compliance",
        summary: "Identity checks and transaction monitoring may be required.",
        content: [
            "TraidiumX requires approved KYC before deposits, trading, or withdrawals. Approved KYC is mandatory under the current product flow, while AML, sanctions, fraud and risk monitoring may still apply to all activity.",
            "Users agree to provide valid documents and information when requested for verification, compliance review, suspicious activity checks or regulatory requirements.",
            "Accounts may be restricted, reviewed or suspended if documents appear invalid, inconsistent, expired, altered or linked to suspicious activity."
        ]
    },
    {
        id: "trading-risk",
        title: "5. Trading Risk Disclosure",
        summary: "Crypto futures and options trading can cause significant financial loss.",
        content: [
            "Crypto assets are volatile. Futures, options, margin and leveraged products involve high risk and may result in partial or total loss of funds.",
            "Users are fully responsible for their own trading decisions, order placement, leverage selection, position sizing, stop-loss planning and risk management.",
            "TraidiumX does not provide financial, investment, tax or legal advice. Educational content, blog posts, charts and demo calculations should not be treated as trading recommendations."
        ]
    },
    {
        id: "orders",
        title: "6. Orders, Execution & Liquidation",
        summary: "Order execution depends on market conditions and available liquidity.",
        content: [
            "Orders may be executed, rejected, partially filled, delayed or cancelled depending on market conditions, liquidity, platform availability, risk checks and backend validation.",
            "Liquidation may occur when margin becomes insufficient according to product rules. Users should understand mark price, index price, leverage, margin mode and funding before trading.",
            "All orders placed on the platform are verified against available balances, risk parameters, margin requirements, and active leverage limits before execution."
        ]
    },
    {
        id: "fees",
        title: "7. Fees, Charges & Campaigns",
        summary: "Fees, rebates and campaigns may change based on platform rules.",
        content: [
            "Maker fees, taker fees, withdrawal fees, campaign rebates, referral rewards and VIP tier benefits may vary by product, user tier, market, volume or campaign period.",
            "Fee calculations, rebates, and campaign parameters are determined based on active platform rules, transaction logs, and user tiers as recorded in our secure systems.",
            "TraidiumX may update, pause, cancel or modify campaigns, referral programs and rebate rules when required for compliance, abuse prevention or business reasons."
        ]
    },
    {
        id: "wallet",
        title: "8. Wallet, Deposits & Withdrawals",
        summary: "Wallet features require secure backend verification.",
        content: [
            "Deposits, trading, and withdrawals require approved KYC, and may also require wallet verification, risk checks, transaction review and compliance monitoring.",
            "Withdrawal requests may be delayed, rejected or manually reviewed if suspicious activity, incorrect details, security alerts or compliance concerns are detected.",
            "Users are responsible for verifying wallet details, network selection, bank details and withdrawal information before submission."
        ]
    },
    {
        id: "prohibited-use",
        title: "9. Prohibited Use",
        summary: "Misuse, fraud, manipulation and illegal activity are not allowed.",
        content: [
            "Users must not use TraidiumX for fraud, money laundering, terrorist financing, market manipulation, wash trading, reverse trading, unauthorized access or illegal activity.",
            "Users must not exploit bugs, bypass security systems, manipulate referrals, abuse campaigns or attempt to overload platform infrastructure.",
            "TraidiumX may restrict, suspend or terminate accounts involved in prohibited activity and may report suspicious activity where required."
        ]
    },
    {
        id: "availability",
        title: "10. Platform Availability",
        summary: "Trading services may be interrupted by maintenance or technical issues.",
        content: [
            "TraidiumX may experience downtime, latency, delayed updates, maintenance windows, API failures, network errors or third-party service interruptions.",
            "The platform does not guarantee uninterrupted access, exact price availability, error-free charts or continuous trading availability.",
            "Users should maintain independent risk controls and should not rely only on frontend display values for financial decisions."
        ]
    },
    {
        id: "liability",
        title: "11. Limitation Of Liability",
        summary: "Platform liability is limited to the extent permitted by applicable law.",
        content: [
            "To the maximum extent permitted by applicable law, TraidiumX is not liable for losses arising from market movement, trading decisions, user error, account compromise, downtime, data delay or third-party failures.",
            "Users acknowledge that leveraged and derivative trading involves risk and that losses may occur even when platform systems operate normally.",
            "Users acknowledge that they have read and understood the risk disclosure policies and agree to hold TraidiumX harmless from trading losses under all circumstances."
        ]
    },
    {
        id: "changes",
        title: "12. Changes To Terms",
        summary: "Terms may be updated as the platform evolves.",
        content: [
            "TraidiumX may update these Terms & Conditions from time to time to reflect product changes, compliance requirements, security updates or business rules.",
            "Updated terms may be published on this page with a revised date. Continued use after updates may be treated as acceptance of the updated terms.",
            "Accepted terms versions, timestamps, and account status logs are securely logged for compliance and account verification purposes."
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
                    <span>${section.title.replace(/^\d+\.\s?/, "")}</span>
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
                            <h3 class="text-xl font-black text-white">${section.title}</h3>
                            <p class="mt-2 text-sm leading-6 text-slate-400">${section.summary}</p>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                            <span class="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-400">
                                Terms
                            </span>
                            <span class="terms-chevron text-slate-500 font-bold transition-transform duration-300">▼</span>
                        </div>
                    </div>

                    <div class="terms-card-body overflow-hidden max-h-0 transition-all duration-300 ease-in-out">
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
        filename:     'traidiumx-terms-and-conditions.pdf',
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
    showMiniMessage("Terms PDF downloaded successfully.", "success");
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
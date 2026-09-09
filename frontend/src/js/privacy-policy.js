"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Privacy Policy Page
|--------------------------------------------------------------------------
| Frontend-only interactions:
| - Render privacy sections with structured sub-clauses
| - Search privacy policy
| - Print policy
| - Download PDF
| - Save privacy preferences in localStorage
|--------------------------------------------------------------------------
*/

const PRIVACY_PREF_KEY = "traidiumx_privacy_preferences_v1";

const privacyNavList = document.getElementById("privacyNavList");
const privacyContentList = document.getElementById("privacyContentList");
const privacySearchInput = document.getElementById("privacySearchInput");
const privacyEmptyState = document.getElementById("privacyEmptyState");

const printPrivacyBtn = document.getElementById("printPrivacyBtn");
const downloadPrivacyBtn = document.getElementById("downloadPrivacyBtn");

const privacySectionCount = document.getElementById("privacySectionCount");
const privacyPreferenceBadge = document.getElementById("privacyPreferenceBadge");

const analyticsCookiesToggle = document.getElementById("analyticsCookiesToggle");
const marketingToggle = document.getElementById("marketingToggle");
const savePrivacyPreferencesBtn = document.getElementById("savePrivacyPreferencesBtn");
const privacyPreferenceMessage = document.getElementById("privacyPreferenceMessage");

function escapeHtml(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

const privacySections = [
    {
        id: "introduction",
        title: "1. Introduction & Scope of Privacy Framework",
        summary: "Platform data stewardship, confidentiality, and compliance with data protection standards.",
        content: [
            "Commitment to User Data Privacy: TraidiumX is dedicated to protecting the privacy, confidentiality, and integrity of personal, financial, and transactional data collected across our spot trading, perpetual futures, options chains, and digital wallet services.",
            "Applicability & Legal Harmony: This Privacy Policy operates in conjunction with our Terms of Service, KYC-AML Framework, and the Digital Personal Data Protection (DPDP) standards applicable to virtual digital asset service providers."
        ]
    },
    {
        id: "information-collected",
        title: "2. Information We Collect & Verification Sources",
        summary: "DigiLocker KYC documents, PAN details, bank accounts, and trading telemetry logs.",
        content: [
            "User Identity & DigiLocker e-KYC Data: Full legal name, government identification details (PAN card validation and DigiLocker XML Aadhaar e-KYC records), date of birth, residential address, and facial liveness verification.",
            "Financial & Bank Account Information: Verified bank account numbers, IFSC codes, UPI Virtual Payment Addresses (VPAs) for INR settlements, and whitelisted public blockchain wallet addresses (USDT TRC20, BEP20).",
            "Trading, Margin & Execution Logs: Order submissions, trade executions, leveraged position sizing, margin utilization, liquidation event timestamps, realized PnL, and fee payment histories.",
            "Technical Device & Telemetry Data: IP addresses, browser fingerprint, operating system, geolocation heuristics, session tokens, API key access logs, and 2FA authentication timestamps."
        ]
    },
    {
        id: "information-use",
        title: "3. How We Use and Process Your Information",
        summary: "Order execution, perpetual margin calculations, AML monitoring, and 1% TDS statutory deductions.",
        content: [
            "Order Matching & Settlement Operations: Processing limit/market orders, calculating perpetual futures funding rates, computing options Greeks, and settling fiat INR deposits and withdrawals.",
            "Mandatory Regulatory & AML Compliance: Performing automated transaction monitoring, PMLA suspicious transaction screening, and sanctions list verification.",
            "Account Security & Anomaly Detection: Safeguarding accounts against unauthorized session hijacking, brute-force credential stuffing, and enforcing 24-hour withdrawal holds upon security resets.",
            "Statutory Tax Compliance (1% TDS): Computing and withholding mandatory 1% TDS on Virtual Digital Asset (VDA) transactions in compliance with Section 194S of the Indian Income Tax Act."
        ]
    },
    {
        id: "sharing-disclosure",
        title: "4. Information Sharing, Disclosure & Third-Party Partners",
        summary: "DigiLocker partners, payment processors, regulatory compliance, and strict no-sale policy.",
        content: [
            "Authorized Service Infrastructure: Trusted partners including DigiLocker KYC validation APIs, banking payment gateways (IMPS/UPI rails), cloud hosting clusters, and automated transactional email/SMS gateways.",
            "Statutory & Law Enforcement Disclosures: Compliance with lawful requests from financial regulatory authorities, FIU-IND, tax departments, or judicial summons under applicable legal mandates.",
            "Strict No-Sale Policy: TraidiumX strictly does not sell, rent, or monetize personal user data or trading histories to third-party advertisers or external data brokers."
        ]
    },
    {
        id: "cookies-tracking",
        title: "5. Cookies, Telemetry & Session Management",
        summary: "Essential session authentication, WebSocket stream cookies, and customizable analytics preferences.",
        content: [
            "Essential Session Cookies: Strictly required for JWT token authentication, secure session state persistence, 2FA validation, and real-time WebSocket price stream connectivity.",
            "Performance & Analytics Cookies: Anonymized tracking of page loading latencies, order placement response times, and matching engine UI responsiveness.",
            "User Preference Controls: Traders can toggle optional analytics and promotional telemetry directly via the Privacy Preferences dashboard."
        ]
    },
    {
        id: "data-protection",
        title: "6. Enterprise Data Security & Encryption Standards",
        summary: "AES-256 database encryption, TLS 1.3 transit security, role-based access control, and audit logs.",
        content: [
            "End-to-End Cryptographic Protection: AES-256 encryption at rest for sensitive KYC records and TLS 1.3 encryption in transit across all web, mobile, and API endpoints.",
            "Access Control & Segregation: Strict role-based access control (RBAC), multi-signature admin authorization for sensitive database access, and zero-trust internal network policies.",
            "Immutable Audit Logging: Critical security and compliance events (such as password changes, KYC reviews, and large payouts) are recorded with tamper-resistant audit logs."
        ]
    },
    {
        id: "data-retention",
        title: "7. Data Retention & Archival Policies",
        summary: "Active lifecycle retention, statutory 5-year PMLA compliance storage, and secure data deletion.",
        content: [
            "Active Account Retention: Personal, financial, and trading records are retained throughout the active lifecycle of your verified TraidiumX account.",
            "Statutory 5-Year Compliance Archival: Under PMLA and FIU regulatory directives, identity verification documents, audit logs, and financial transaction records are securely archived for a minimum period of 5 years following account termination.",
            "Secure Erasure: Upon expiration of mandatory retention periods, non-regulatory analytical data is permanently deleted using cryptographic wiping standards."
        ]
    },
    {
        id: "user-rights",
        title: "8. User Privacy Rights & Access Controls",
        summary: "Right of access, trade ledger exports, document correction, and account deactivation procedures.",
        content: [
            "Right to Access & Portability: Users may request a consolidated export of their trading history, wallet transaction ledgers, and registered profile information via support channels.",
            "Correction & Document Updates: Users may request corrections to personal details or submit updated identity documents in case of name changes or renewed government IDs.",
            "Consent Withdrawal & Account Deactivation: Users can request account deactivation; however, regulatory transaction history must be retained in accordance with statutory compliance laws."
        ]
    },
    {
        id: "third-party-links",
        title: "9. Third-Party Integrations & External Links",
        summary: "External blockchain explorers (TronScan, BscScan) and independent third-party boundaries.",
        content: [
            "External Infrastructure Links: TraidiumX may interface with external blockchain explorers (e.g., TronScan, BscScan) and DigiLocker portals. We recommend reviewing their respective privacy protocols.",
            "Independent Privacy Boundaries: TraidiumX is not liable for data handling policies of independent third-party services or external blockchain networks."
        ]
    },
    {
        id: "grievance",
        title: "10. Grievance Redressal & Data Protection Officer",
        summary: "Dedicated Data Privacy Officer, contact channels, and strict 15-day resolution timelines.",
        content: [
            "Dedicated Grievance Desk: For privacy concerns, data rectification, or compliance inquiries, users can reach our specialized Data Privacy & Grievance Officer at compliance@traidiumx.com.",
            "Resolution Timelines: All privacy inquiries and data rectification requests are acknowledged within 24 hours and addressed within 15 business days."
        ]
    },
    {
        id: "updates-law",
        title: "11. Policy Amendments & Governing Legal Framework",
        summary: "Notification of policy enhancements, architectural upgrades, and governing legal alignment.",
        content: [
            "Periodic Policy Updates: TraidiumX may amend this Privacy Policy to reflect architectural upgrades, regulatory enactments, or product expansions. Material updates will be highlighted via platform notifications.",
            "Governing Law: This Privacy Policy is constructed and interpreted in strict alignment with the laws and digital data protection standards of the jurisdiction of operation."
        ]
    }
];

function showMiniMessage(message, type = "success") {
    let messageBox = document.getElementById("privacyMiniMessage");

    if (!messageBox) {
        messageBox = document.createElement("div");
        messageBox.id = "privacyMiniMessage";
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
    const searchValue = privacySearchInput ? privacySearchInput.value.trim().toLowerCase() : "";

    if (!searchValue) {
        return privacySections;
    }

    return privacySections.filter((section) => {
        const text = [
            section.title,
            section.summary,
            ...section.content
        ].join(" ").toLowerCase();

        return text.includes(searchValue);
    });
}

function renderPrivacyNav(sections) {
    if (!privacyNavList) {
        return;
    }

    privacyNavList.innerHTML = sections
        .map((section) => {
            return `
                <button type="button" data-target="${section.id}" class="privacy-nav-btn">
                    <span>${escapeHtml(section.title.replace(/^\d+\.\s?/, ""))}</span>
                    <small>Open</small>
                </button>
            `;
        })
        .join("");

    privacyNavList.querySelectorAll("[data-target]").forEach((button) => {
        button.addEventListener("click", () => {
            const targetId = button.getAttribute("data-target");
            const target = document.getElementById(targetId);

            if (target) {
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

                // Auto expand when clicked from navigation
                const body = target.querySelector(".privacy-card-body");
                const chevron = target.querySelector(".privacy-chevron");
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

function renderPrivacyContent(sections) {
    if (!privacyContentList) {
        return;
    }

    privacyContentList.innerHTML = sections
        .map((section) => {
            return `
                <article id="${section.id}" class="privacy-section-card cursor-pointer scroll-mt-32 transition-all duration-300">
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <h3 class="text-xl font-black text-white">${escapeHtml(section.title)}</h3>
                            <p class="mt-2 text-sm leading-6 text-slate-400">${escapeHtml(section.summary)}</p>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                            <span class="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-400">
                                Privacy
                            </span>
                            <span class="privacy-chevron text-slate-500 font-bold transition-transform duration-300">▼</span>
                        </div>
                    </div>

                    <div class="privacy-card-body overflow-hidden max-h-0 transition-all duration-300 ease-in-out">
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

    privacyContentList.querySelectorAll(".privacy-section-card").forEach((card) => {
        card.addEventListener("click", () => {
            const body = card.querySelector(".privacy-card-body");
            const chevron = card.querySelector(".privacy-chevron");
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

    if (privacyEmptyState) {
        privacyEmptyState.classList.toggle("hidden", sections.length > 0);
    }
}

function renderPrivacyPolicy() {
    const sections = getFilteredSections();

    renderPrivacyNav(sections);
    renderPrivacyContent(sections);

    if (privacySectionCount) {
        privacySectionCount.textContent = String(privacySections.length);
    }
}

function getAllPrivacyText() {
    return privacySections
        .map((section) => {
            return [
                section.title,
                section.summary,
                ...section.content
            ].join("\n");
        })
        .join("\n\n");
}

function downloadPrivacyPdf() {
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
            <h1 style="font-size: 28px; font-weight: 800; color: #020617; margin: 0;">TraidiumX Privacy Policy</h1>
            <p style="font-size: 13px; color: #64748b; margin: 8px 0 0 0;">Version: 1.0 | Last Updated: 22 Jun 2026</p>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 30px;" />
        ${privacySections.map(section => `
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
        filename:     'traidiumx-privacy-policy.pdf',
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
        showMiniMessage("Privacy policy PDF downloaded successfully.", "success");
    } else {
        container.remove();
        window.print();
    }
}

function printPrivacy() {
    window.print();
}

function loadPreferences() {
    try {
        const saved = localStorage.getItem(PRIVACY_PREF_KEY);
        return saved ? JSON.parse(saved) : null;
    } catch (error) {
        console.error(error);
        return null;
    }
}

function updatePreferenceBadge(saved) {
    if (!privacyPreferenceBadge) {
        return;
    }

    if (saved) {
        privacyPreferenceBadge.textContent = "Preferences Saved";
        privacyPreferenceBadge.className = "rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-400";
    } else {
        privacyPreferenceBadge.textContent = "Preferences Not Saved";
        privacyPreferenceBadge.className = "rounded-full bg-orange-400/10 px-3 py-1 text-xs font-black text-orange-300";
    }
}

function applySavedPreferences() {
    const saved = loadPreferences();

    if (saved) {
        if (analyticsCookiesToggle) {
            analyticsCookiesToggle.checked = Boolean(saved.analytics);
        }

        if (marketingToggle) {
            marketingToggle.checked = Boolean(saved.marketing);
        }

        updatePreferenceBadge(true);
    } else {
        updatePreferenceBadge(false);
    }
}

function savePrivacyPreferences() {
    const preferences = {
        essential: true,
        analytics: analyticsCookiesToggle ? analyticsCookiesToggle.checked : false,
        marketing: marketingToggle ? marketingToggle.checked : false,
        savedAt: new Date().toISOString(),
        version: "1.0"
    };

    localStorage.setItem(PRIVACY_PREF_KEY, JSON.stringify(preferences));

    updatePreferenceBadge(true);

    if (privacyPreferenceMessage) {
        privacyPreferenceMessage.classList.remove("hidden");
        privacyPreferenceMessage.textContent = "Privacy preferences saved successfully.";
    }

    showMiniMessage("Privacy preferences saved successfully.", "success");

    window.setTimeout(() => {
        if (privacyPreferenceMessage) {
            privacyPreferenceMessage.classList.add("hidden");
        }
    }, 3000);
}

function initEvents() {
    if (privacySearchInput) {
        privacySearchInput.addEventListener("input", renderPrivacyPolicy);
    }

    if (downloadPrivacyBtn) {
        downloadPrivacyBtn.addEventListener("click", downloadPrivacyPdf);
    }

    if (printPrivacyBtn) {
        printPrivacyBtn.addEventListener("click", printPrivacy);
    }

    if (savePrivacyPreferencesBtn) {
        savePrivacyPreferencesBtn.addEventListener("click", savePrivacyPreferences);
    }
}

function initPrivacyPolicyPage() {
    renderPrivacyPolicy();
    applySavedPreferences();
    initEvents();
}

document.addEventListener("DOMContentLoaded", initPrivacyPolicyPage);
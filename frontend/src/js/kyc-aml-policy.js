"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX KYC-AML Policy Page
|--------------------------------------------------------------------------
| Frontend-only interactions:
| - Render KYC levels
| - Render document checklist
| - Render KYC-AML policy sections
| - Search policy
| - Print policy
| - Download TXT
| - Save acknowledgement to backend when user is logged in
| - Show backend KYC status on policy page
|--------------------------------------------------------------------------
*/

const KYC_ACK_KEY = "traidiumx_kyc_aml_acknowledged_v1";
const KYC_STATUS_REFRESH_MS = 10000;

const kycLevelsGrid = document.getElementById("kycLevelsGrid");
const kycDocumentsGrid = document.getElementById("kycDocumentsGrid");

const kycNavList = document.getElementById("kycNavList");
const kycContentList = document.getElementById("kycContentList");
const kycSearchInput = document.getElementById("kycSearchInput");
const kycEmptyState = document.getElementById("kycEmptyState");

const printKycBtn = document.getElementById("printKycBtn");
const downloadKycBtn = document.getElementById("downloadKycBtn");

const kycSectionCount = document.getElementById("kycSectionCount");
const kycAcknowledgedBadge = document.getElementById("kycAcknowledgedBadge");
const kycVerificationText = document.getElementById("kycVerificationText");
const kycWithdrawalAccessText = document.getElementById("kycWithdrawalAccessText");
const kycVerificationMessage = document.getElementById("kycVerificationMessage");
const kycVerificationStatusBadge = document.getElementById("kycVerificationStatusBadge");
const kycVerificationActionLink = document.getElementById("kycVerificationActionLink");

const kycAcknowledgeCheckbox = document.getElementById("kycAcknowledgeCheckbox");
const saveKycAcknowledgementBtn = document.getElementById("saveKycAcknowledgementBtn");
const kycAcknowledgementMessage = document.getElementById("kycAcknowledgementMessage");

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

const kycLevels = [
    {
        level: "Level 0",
        title: "Basic Account",
        access: "Market exploration & chart viewing",
        limit: "Withdrawals Locked (KYC Required)",
        status: "Unverified"
    },
    {
        level: "Level 1",
        title: "KYC Verified Trader",
        access: "Full Spot, Futures & Options Access",
        limit: "Full Wallet Deposits & Withdrawals Enabled",
        status: "KYC Verified"
    },
    {
        level: "Level 2",
        title: "Institutional & VIP Desk",
        access: "High-Volume Trading & Priority Execution",
        limit: "Custom High-Volume Admin Approval",
        status: "EDD Cleared"
    }
];

const kycDocuments = [
    {
        icon: `<div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.15)] text-cyan-400">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 10h6m-6 3h6"></path>
            </svg>
        </div>`,
        title: "Mobile & Email 2FA OTP",
        description: "Cryptographic two-factor authentication binding your verified phone number and primary email to your exchange profile."
    },
    {
        icon: `<div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 shadow-[0_0_20px_rgba(52,211,153,0.15)] text-emerald-400">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
            </svg>
        </div>`,
        title: "Aadhaar e-KYC / DigiLocker",
        description: "Direct UIDAI DigiLocker integration providing SHA-256 cryptographically verified national identity validation within seconds."
    },
    {
        icon: `<div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.15)] text-purple-400">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5a2 2 0 100-4 2 2 0 000 4zm0 0h12"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9h1m-1 3h2m-2 3h4"></path>
            </svg>
        </div>`,
        title: "PAN Card Tax Registry Check",
        description: "Real-time Income Tax Department & NSDL database matching ensuring full compliance with statutory TDS and financial mandates."
    }
];

const kycSections = [
    {
        id: "purpose",
        title: "1. Purpose and Regulatory Framework",
        summary: "Comprehensive compliance framework ensuring full alignment with PMLA (2002), FIU-IND directives, and international FATF anti-money laundering standards.",
        content: [
            "Statutory Compliance & PMLA Mandate: TraidiumX Exchange operates in strict compliance with the Prevention of Money Laundering Act (PMLA 2002), the Prevention of Money-Laundering (Maintenance of Records) Rules, and guidelines issued by the Financial Intelligence Unit - India (FIU-IND) and global Financial Action Task Force (FATF).",
            "Anti-Money Laundering & Market Protection: Our AML framework is designed to detect and prevent illicit capital flow, tax evasion, ransomware financing, and fraudulent transactions across all spot and derivative crypto markets on TraidiumX."
        ]
    },
    {
        id: "scope",
        title: "2. Scope and Service Applicability",
        summary: "Mandatory applicability across all individual retail accounts, corporate entities, algorithmic market makers, and derivative trading modules.",
        content: [
            "Covered Trading Products: This policy applies directly to all TraidiumX core services, including Spot Markets, Perpetual Futures (with leverage), Crypto Options Chains, Collateral Margin transfers, and Referral commission rewards.",
            "Banking & Payment Channels: Applicable to all fiat INR deposit and withdrawal gateways (UPI, IMPS, NEFT) as well as on-chain cryptocurrency transactions (USDT, BTC, ETH, SOL) across supported blockchain networks.",
            "Universal User Base: Enforceable across all individual retail traders, corporate accounts, high-frequency API market makers, and institutional liquidity desks."
        ]
    },
    {
        id: "customer-identification",
        title: "3. Customer Identification Program (CIP) & Verification Flow",
        summary: "Multi-tier digital onboarding incorporating DigiLocker, UIDAI Offline e-KYC, PAN registry validation, and AI biometric liveness verification.",
        content: [
            "Step 1 - Mobile & Email OTP Binding: Users must verify their active mobile number and email address via real-time Time-Based One-Time Passcodes (OTP) before initiating any account verification.",
            "Step 2 - Aadhaar e-KYC via DigiLocker: Seamless digital verification using UIDAI-authorized DigiLocker integration or password-protected Aadhaar Paperless Offline e-KYC XML (with verifiable SHA-256 digital signature).",
            "Step 3 - PAN Card Online Validation: Mandatory Permanent Account Number (PAN) submission verified directly against the NSDL / Income Tax Department database to comply with Section 194S TDS requirements.",
            "Step 4 - AI Biometric Facial Liveness: Real-time 3D facial liveness check that dynamically matches the user's live selfie against official photo archives to prevent photo spoofing and synthetic identity fraud.",
            "Step 5 - Admin Approval & Verification SLA: Automated DigiLocker checks verify in under 2 minutes. Any manual review or OCR exception is processed by our Compliance Team within 24 business hours."
        ]
    },
    {
        id: "beneficial-ownership",
        title: "4. Beneficial Ownership and Corporate Due Diligence",
        summary: "Strict prohibition against proxy trading and mandatory identification of Ultimate Beneficial Owners (UBOs) holding ≥10% equity.",
        content: [
            "Strict Account Exclusivity: Every TraidiumX account must be registered and operated strictly by the beneficial owner. Account sharing, proxy trading, renting credentials, and pooled third-party trading are strictly prohibited.",
            "Corporate Entity Documentation: Institutional accounts must submit Certificate of Incorporation, Memorandum & Articles of Association (MOA/AOA), Board Resolution authorizing crypto trading, and authorized signatory lists.",
            "Ultimate Beneficial Ownership (UBO): Corporate applicants must identify all natural persons owning or controlling 10% or more of voting rights or equity capital."
        ]
    },
    {
        id: "risk-profiling",
        title: "5. Risk Categorization and Enhanced Due Diligence (EDD)",
        summary: "Dynamic risk rating matrix (Low, Medium, High) triggering in-depth Source of Wealth and financial audit checks for high-volume accounts.",
        content: [
            "Three-Tier Risk Rating: Accounts are dynamically scored as Low, Medium, or High Risk based on geographic residency, deposit methods, trading instruments utilized, and blockchain transaction velocity.",
            "EDD Triggers: Enhanced Due Diligence is automatically triggered upon: (1) High-frequency deposit/withdrawal velocity; (2) Large OTC transaction requests; (3) Repeated device/IP anomalies; or (4) Counterpart address alerts.",
            "Supplementary Document Checklist: Users undergoing EDD must furnish Proof of Address (utility bill/bank statement <90 days old), verified Income Proof (ITR acknowledgement or payslips), and a signed Source of Wealth declaration.",
            "Periodic KYC Refresh: High-risk accounts undergo mandatory annual KYC refresh cycles, while standard accounts are re-verified every two years."
        ]
    },
    {
        id: "transaction-monitoring",
        title: "6. Real-Time Transaction Monitoring & Blockchain Analytics",
        summary: "Continuous heuristic surveillance, structuring filters, and on-chain cluster analytics across all deposit and withdrawal flows.",
        content: [
            "On-Chain Address Screening: All inbound cryptocurrency deposits and outbound withdrawal addresses are scanned against global blacklists, darknet markets, ransomware clusters, and sanctioned wallet addresses.",
            "Structuring & Velocity Filters: Automated matching engine heuristics detect 'smurfing' or structuring — intentionally splitting large sums into smaller amounts to bypass monitoring limits.",
            "Mixing Service Quarantine: Any deposits originating from anonymizing mixing protocols (e.g., Tornado Cash) or high-risk peer-to-peer liquidity tumblers are immediately quarantined.",
            "Continuous Wallet Heuristics: Continuous post-transaction surveillance flags rapid deposit-trade-withdrawal cycles that lack genuine trading or investment purpose."
        ]
    },
    {
        id: "restricted-activities",
        title: "7. Prohibited and Restricted Activities on TraidiumX",
        summary: "Strict prohibition against market manipulation, wash trading, darknet financing, mixer usage, and multi-accounting exploitation.",
        content: [
            "Market Manipulation Prohibitions: Wash trading, spoofing, layering, circular order matching between linked accounts, quote stuffing, and matched-order manipulation are strictly forbidden.",
            "Illicit & Stolen Funds: Depositing funds originating from extortion, phishing, exchange hacks, malware operations, or narcotics trafficking is strictly illegal.",
            "Jurisdictional & Proxy Evasion: Using unauthorized VPN proxy farms, fake geolocation tools, or forged credentials to bypass sovereign sanctions is prohibited.",
            "Incentive & Referral Abuse: Creating Sybil multi-accounts to farm trading fee rebates, referral rewards, or challenge prizes results in immediate balance cancellation.",
            "Reverse-Trading Exploitation: Executing coordinated opposing positions across multiple accounts to illicitly transfer funds or exploit bonus credit balances is strictly banned."
        ]
    },
    {
        id: "sanctions-screening",
        title: "8. Global Sanctions and Watchlist Screening",
        summary: "Continuous automated screening against UN, OFAC, EU, INTERPOL, and national PEP & terrorist exclusion databases.",
        content: [
            "International Sanction Regimes: Continuous real-time screening against OFAC (US Treasury), UN Security Council (UNSC), European Union (EU), and INTERPOL Red Notices.",
            "Politically Exposed Persons (PEP) Monitoring: Senior government officials, military leaders, political figures, and their immediate family members (RCA) are flagged for enhanced senior compliance approval.",
            "Asset Freezing on Positive Match: Any confirmed match against active international sanctions lists triggers immediate account blocking and statutory reporting."
        ]
    },
    {
        id: "record-keeping",
        title: "9. Record Retention and Cryptographic Security Standards",
        summary: "Statutory 5-year encrypted retention of identity records, trade logs, and blockchain transactions in compliance with Section 12 of PMLA.",
        content: [
            "Statutory 5-Year Data Retention: Under Section 12 of PMLA (2002), all KYC identity documents, DigiLocker logs, trade executions, order histories, and withdrawal records are retained for a minimum of 5 years following account closure.",
            "Enterprise Encryption & HSM Vaults: All personal identity records and biometric tokens are encrypted in transit using TLS 1.3 and stored at rest with AES-256 encryption in isolated SOC2-compliant Hardware Security Modules."
        ]
    },
    {
        id: "reporting-escalation",
        title: "10. Suspicious Activity Reporting (SAR / STR)",
        summary: "Statutory reporting of suspicious patterns to FIU-IND with strict statutory anti-tipping-off confidentiality.",
        content: [
            "Statutory Reporting to FIU-IND: Where transactions exhibit suspicious patterns or lack clear commercial justification, TraidiumX files a Suspicious Transaction Report (STR) with FIU-IND.",
            "Anti-Tipping-Off Mandate: In strict compliance with statutory PMLA rules, platform personnel are prohibited by law from disclosing to the customer that an investigation or STR has been filed.",
            "Law Enforcement Cooperation: TraidiumX actively cooperates with cybercrime cells, police departments, and judicial bodies by furnishing verified audit trails upon receipt of valid legal notices."
        ]
    },
    {
        id: "account-restrictions",
        title: "11. Account Restrictions, Freezing & Termination",
        summary: "Clear protocols for temporary restrictions, manual reviews, asset holds, and permanent account termination.",
        content: [
            "Administrative Hold Triggers: TraidiumX reserves the right to freeze trading, deposits, or withdrawals in cases of: (1) Forged or expired KYC documents; (2) Chargeback disputes; (3) Unresolved AML alerts; or (4) Law enforcement directives.",
            "Notification & 14-Day Cure Period: Affected users receive formal email notification detailing necessary remedial documents, with a standard 14-day window to furnish valid clarification.",
            "Uncontested Fund Return: Upon verified account closure without legal encumbrance, uncontested principal funds are returned to the user's verified originating bank account.",
            "Permanent Blacklisting: Users involved in confirmed fraudulent or malicious activity are permanently blacklisted across the TraidiumX platform."
        ]
    },
    {
        id: "user-obligations",
        title: "12. User Obligations and Declarations",
        summary: "User duties regarding accuracy of declarations, timely updates of personal data, and lawful source of funds.",
        content: [
            "Accuracy & Honesty of Declarations: Users legally warrant that all submitted identification, bank account information, and tax declarations are genuine, accurate, and up to date.",
            "30-Day Material Change Notification: Users must notify TraidiumX within 30 days of any change in residential address, nationality, tax residency, or legal name.",
            "Lawful Source of Capital: Users certify that all deposited fiat and digital assets represent legally acquired property with verifiable tax compliance."
        ]
    },
    {
        id: "policy-updates",
        title: "13. Policy Revisions and Governance",
        summary: "Structured biannual policy reviews, version control, and legally binding digital acknowledgement tracking.",
        content: [
            "Semi-Annual Compliance Review: This policy is reviewed biannually by the TraidiumX Legal & Compliance Board to incorporate regulatory amendments, court rulings, and market developments.",
            "Binding Digital Acceptance: Policy updates are published with incremented version stamps. Continued platform use constitutes binding electronic consent to the updated terms."
        ]
    }
];

function showMiniMessage(message, type = "success") {
    let messageBox = document.getElementById("kycMiniMessage");

    if (!messageBox) {
        messageBox = document.createElement("div");
        messageBox.id = "kycMiniMessage";
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


function isUserLoggedInForKycPolicy() {
    return typeof isLoggedIn === "function" && isLoggedIn();
}

function getApiErrorText(error, fallback = "Something went wrong.") {
    if (typeof showApiError === "function") {
        return showApiError(error, fallback);
    }

    if (error?.errors) {
        const firstKey = Object.keys(error.errors)[0];
        const firstValue = firstKey ? error.errors[firstKey] : "";

        if (Array.isArray(firstValue)) {
            return firstValue[0] || fallback;
        }

        if (typeof firstValue === "string") {
            return firstValue;
        }
    }

    return error?.message || fallback;
}

function normalizeKycStatus(value) {
    const status = String(value || "not_submitted")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");

    if (["verified", "complete", "completed"].includes(status)) return "approved";
    if (["submitted", "pending_review", "pending_admin_review", "pending_admin_approval"].includes(status)) return "pending";
    if (["under_review", "review"].includes(status)) return "under_review";
    if (["declined", "failed"].includes(status)) return "rejected";
    if (!status || ["none", "null"].includes(status)) return "not_submitted";
    return status;
}

function kycStatusLabel(status) {
    const value = normalizeKycStatus(status);

    const labels = {
        approved: "Approved",
        pending: "Pending Review",
        under_review: "Under Review",
        rejected: "Rejected",
        not_submitted: "Not Submitted",
    };

    return labels[value] || value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function kycBadgeClasses(status) {
    const value = normalizeKycStatus(status);

    if (value === "approved") {
        return "shrink-0 rounded-full bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-400";
    }

    if (value === "rejected") {
        return "shrink-0 rounded-full bg-red-400/10 px-4 py-2 text-xs font-black text-red-300";
    }

    if (value === "pending" || value === "under_review") {
        return "shrink-0 rounded-full bg-orange-400/10 px-4 py-2 text-xs font-black text-orange-300";
    }

    return "shrink-0 rounded-full bg-slate-400/10 px-4 py-2 text-xs font-black text-slate-300";
}

function setVerificationStatusUI(status, message = "", canSubmit = true) {
    const normalized = normalizeKycStatus(status);
    const label = kycStatusLabel(normalized);
    const approved = normalized === "approved";
    const rejected = normalized === "rejected";
    const pending = normalized === "pending" || normalized === "under_review";

    if (kycVerificationText) {
        kycVerificationText.textContent = label;
        kycVerificationText.className = approved
            ? "mt-2 text-xl font-black text-emerald-400"
            : rejected
                ? "mt-2 text-xl font-black text-red-300"
                : pending
                    ? "mt-2 text-xl font-black text-orange-300"
                    : "mt-2 text-xl font-black text-slate-300";
    }

    if (kycWithdrawalAccessText) {
        kycWithdrawalAccessText.textContent = approved ? "Enabled" : "Blocked";
        kycWithdrawalAccessText.className = approved
            ? "mt-2 text-xl font-black text-emerald-400"
            : "mt-2 text-xl font-black text-red-300";
    }

    if (kycVerificationStatusBadge) {
        kycVerificationStatusBadge.textContent = label;
        kycVerificationStatusBadge.className = kycBadgeClasses(normalized);
    }

    if (kycVerificationMessage) {
        if (!isUserLoggedInForKycPolicy()) {
            kycVerificationMessage.textContent = "Login to view your live backend KYC verification status.";
        } else if (message) {
            kycVerificationMessage.textContent = message;
        } else if (approved) {
            kycVerificationMessage.textContent = "Your KYC is approved. Deposit, transfer, trading, and withdrawal access are fully enabled.";
        } else if (rejected) {
            kycVerificationMessage.textContent = "Your KYC was rejected. Please open KYC Verification and submit corrected documents.";
        } else if (pending) {
            kycVerificationMessage.textContent = "Your Aadhaar document verification is processing.";
        } else {
            kycVerificationMessage.textContent = "Please submit your KYC documents to unlock deposits, transfers, trading, and withdrawals.";
        }
    }

    if (kycVerificationActionLink) {
        const shouldShowAction = isUserLoggedInForKycPolicy() && !approved && (canSubmit || rejected || normalized === "not_submitted");
        kycVerificationActionLink.classList.toggle("hidden", !shouldShowAction);
        kycVerificationActionLink.classList.toggle("flex", shouldShowAction);
        kycVerificationActionLink.textContent = rejected ? "Resubmit KYC Verification" : "Complete KYC Verification";
    }
}

function formatPolicyDate(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function setAcknowledgementUI({ acknowledged = false, acknowledged_at = "", policy_version = "KYC-AML-v1.0" } = {}) {
    if (kycAcknowledgeCheckbox) {
        kycAcknowledgeCheckbox.checked = Boolean(acknowledged);
    }

    if (kycAcknowledgedBadge) {
        if (acknowledged) {
            kycAcknowledgedBadge.textContent = "Acknowledged";
            kycAcknowledgedBadge.className = "rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-400";
        } else {
            kycAcknowledgedBadge.textContent = "Not Acknowledged";
            kycAcknowledgedBadge.className = "rounded-full bg-orange-400/10 px-3 py-1 text-xs font-black text-orange-300";
        }
    }
}

async function loadBackendKycStatus() {
    if (!isUserLoggedInForKycPolicy() || typeof apiRequest !== "function") {
        setVerificationStatusUI("not_submitted", "Login to view your live KYC approval status.", true);
        updateAcknowledgedStatus();
        return;
    }

    try {
        const response = await apiRequest("/kyc/status");
        const data = response?.data || {};

        setVerificationStatusUI(
            data.kyc_status || "not_submitted",
            data.kyc_status_message || "",
            Boolean(data.can_submit)
        );
    } catch (error) {
        console.warn("KYC status load failed:", error);
        setVerificationStatusUI("not_submitted", getApiErrorText(error, "Unable to load KYC status."), true);
    }
}

async function loadPolicyAcknowledgementStatus() {
    if (!isUserLoggedInForKycPolicy() || typeof apiRequest !== "function") {
        updateAcknowledgedStatus();
        return;
    }

    try {
        const response = await apiRequest("/kyc/policy/status");
        const data = response?.data || {};

        if (data.acknowledged) {
            localStorage.setItem(KYC_ACK_KEY, "true");
        }

        setAcknowledgementUI(data);
    } catch (error) {
        console.warn("KYC policy acknowledgement load failed:", error);
        updateAcknowledgedStatus();
    }
}

async function refreshBackendKycPolicyState(showToast = false) {
    await Promise.allSettled([
        loadBackendKycStatus(),
        loadPolicyAcknowledgementStatus()
    ]);

    if (showToast) {
        showMiniMessage("KYC status refreshed.", "success");
    }
}

function renderKycLevels() {
    if (!kycLevelsGrid) {
        return;
    }

    kycLevelsGrid.innerHTML = kycLevels
        .map((level) => {
            return `
                <article class="kyc-level-card">
                    <span class="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-400">
                        ${level.level}
                    </span>

                    <h3 class="mt-5 text-2xl font-black text-white">${level.title}</h3>
                    <p class="mt-3 text-sm text-slate-400">${level.access}</p>

                    <div class="mt-5 rounded-2xl bg-slate-950/70 p-4">
                        <p class="text-xs text-slate-500">Limit</p>
                        <h4 class="mt-1 font-black text-cyan-400">${level.limit}</h4>
                    </div>

                    <p class="mt-4 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                        ${level.status}
                    </p>
                </article>
            `;
        })
        .join("");
}

function renderKycDocuments() {
    if (!kycDocumentsGrid) {
        return;
    }

    kycDocumentsGrid.innerHTML = kycDocuments
        .map((documentItem) => {
            return `
                <article class="kyc-document-card">
                    <div>${documentItem.icon}</div>
                    <h3 class="mt-5 text-2xl font-black text-white">${documentItem.title}</h3>
                    <p class="mt-3 leading-7 text-slate-400">${documentItem.description}</p>
                </article>
            `;
        })
        .join("");
}

function getFilteredKycSections() {
    const searchValue = kycSearchInput ? kycSearchInput.value.trim().toLowerCase() : "";

    if (!searchValue) {
        return kycSections;
    }

    return kycSections.filter((section) => {
        const text = [
            section.title,
            section.summary,
            ...section.content
        ].join(" ").toLowerCase();

        return text.includes(searchValue);
    });
}

function renderKycNav(sections) {
    if (!kycNavList) {
        return;
    }

    kycNavList.innerHTML = sections
        .map((section) => {
            return `
                <button type="button" data-target="${section.id}" class="kyc-nav-btn">
                    <span>${section.title.replace(/^\d+\.\s?/, "")}</span>
                    <small>Open</small>
                </button>
            `;
        })
        .join("");

    kycNavList.querySelectorAll("[data-target]").forEach((button) => {
        button.addEventListener("click", () => {
            const targetId = button.getAttribute("data-target");
            const target = document.getElementById(targetId);

            if (target) {
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

                // Auto expand when clicked from navigation
                const body = target.querySelector(".kyc-card-body");
                const chevron = target.querySelector(".kyc-chevron");
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

function renderKycContent(sections) {
    if (!kycContentList) {
        return;
    }

    kycContentList.innerHTML = sections
        .map((section) => {
            return `
                <article id="${section.id}" class="kyc-section-card cursor-pointer scroll-mt-32 transition-all duration-300">
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <h3 class="text-xl font-black text-white">${section.title}</h3>
                            <p class="mt-2 text-sm leading-6 text-slate-400">${section.summary}</p>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                            <span class="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-400">
                                KYC-AML
                            </span>
                            <span class="kyc-chevron text-slate-500 font-bold transition-transform duration-300">▼</span>
                        </div>
                    </div>

                    <div class="kyc-card-body overflow-hidden max-h-0 transition-all duration-300 ease-in-out">
                        <div class="border-t border-white/5 pt-5 mt-5 space-y-3">
                            ${section.content.map((paragraph) => {
                                const escaped = escapeHtml(paragraph);
                                if (escaped.includes(": ")) {
                                    const colonIndex = escaped.indexOf(": ");
                                    const prefix = escaped.substring(0, colonIndex);
                                    const bodyText = escaped.substring(colonIndex + 2);
                                    if (prefix.length < 65) {
                                        return `
                                            <div class="rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition hover:border-cyan-400/20 hover:bg-white/[0.04]">
                                                <h5 class="text-sm font-black text-cyan-400 mb-1.5">${prefix}</h5>
                                                <p class="text-slate-300 text-xs sm:text-sm leading-relaxed">${bodyText}</p>
                                            </div>
                                        `;
                                    }
                                }
                                return `<p class="leading-relaxed text-slate-300 text-xs sm:text-sm">${escaped}</p>`;
                            }).join("")}
                        </div>
                    </div>
                </article>
            `;
        })
        .join("");

    kycContentList.querySelectorAll(".kyc-section-card").forEach((card) => {
        card.addEventListener("click", () => {
            const body = card.querySelector(".kyc-card-body");
            const chevron = card.querySelector(".kyc-chevron");
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

    if (kycEmptyState) {
        kycEmptyState.classList.toggle("hidden", sections.length > 0);
    }
}

function renderKycPolicy() {
    const sections = getFilteredKycSections();

    renderKycNav(sections);
    renderKycContent(sections);

    if (kycSectionCount) {
        kycSectionCount.textContent = String(kycSections.length);
    }
}

function getAllKycText() {
    return kycSections
        .map((section) => {
            return [
                section.title,
                section.summary,
                ...section.content
            ].join("\n");
        })
        .join("\n\n");
}

function downloadKycPdf() {
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
            <h1 style="font-size: 28px; font-weight: 800; color: #020617; margin: 0;">TraidiumX KYC-AML Policy</h1>
            <p style="font-size: 13px; color: #64748b; margin: 8px 0 0 0;">Version: 1.0 | Last Updated: 22 Jun 2026</p>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 30px;" />
        ${kycSections.map(section => `
            <div style="margin-bottom: 25px; page-break-inside: avoid;">
                <h2 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0;">${section.title}</h2>
                <p style="font-size: 11px; font-weight: 600; color: #64748b; font-style: italic; margin: 0 0 10px 0;">${section.summary}</p>
                ${section.content.map(p => {
                    if (p.includes(": ")) {
                        const colonIndex = p.indexOf(": ");
                        const prefix = p.substring(0, colonIndex);
                        const body = p.substring(colonIndex + 2);
                        return `<p style="font-size: 11px; line-height: 1.6; color: #334155; margin: 0 0 8px 0; text-align: justify;"><strong>${prefix}:</strong> ${body}</p>`;
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
        filename:     'traidiumx-kyc-aml-policy.pdf',
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
    showMiniMessage("KYC-AML PDF downloaded successfully.", "success");
}

function printKyc() {
    window.print();
}

function updateAcknowledgedStatus() {
    const acknowledged = localStorage.getItem(KYC_ACK_KEY) === "true";
    setAcknowledgementUI({ acknowledged, policy_version: "KYC-AML-v1.0" });
}

async function saveKycAcknowledgement() {
    if (!kycAcknowledgeCheckbox || !kycAcknowledgeCheckbox.checked) {
        showMiniMessage("Please tick the checkbox before saving.", "error");
        return;
    }

    if (!isUserLoggedInForKycPolicy() || typeof apiRequest !== "function") {
        localStorage.setItem(KYC_ACK_KEY, "true");
        updateAcknowledgedStatus();
        showMiniMessage("KYC-AML acknowledgement saved successfully.", "success");
        return;
    }

    try {
        if (saveKycAcknowledgementBtn) {
            saveKycAcknowledgementBtn.disabled = true;
            saveKycAcknowledgementBtn.textContent = "Saving...";
        }

        const response = await apiRequest("/kyc/policy/acknowledge", {
            method: "POST",
            body: JSON.stringify({ acknowledged: true, policy_version: "KYC-AML-v1.0" })
        });

        const data = response?.data || {};
        localStorage.setItem(KYC_ACK_KEY, "true");
        setAcknowledgementUI(data);

        showMiniMessage(response?.message || "KYC-AML acknowledgement saved successfully.", "success");
    } catch (error) {
        showMiniMessage(getApiErrorText(error, "Unable to save acknowledgement."), "error");
    } finally {
        if (saveKycAcknowledgementBtn) {
            saveKycAcknowledgementBtn.disabled = false;
            saveKycAcknowledgementBtn.textContent = "Save KYC-AML Acknowledgement";
        }
    }
}

function initEvents() {
    if (kycSearchInput) {
        kycSearchInput.addEventListener("input", renderKycPolicy);
    }

    if (downloadKycBtn) {
        downloadKycBtn.addEventListener("click", downloadKycPdf);
    }

    if (printKycBtn) {
        printKycBtn.addEventListener("click", printKyc);
    }

    if (saveKycAcknowledgementBtn) {
        saveKycAcknowledgementBtn.addEventListener("click", saveKycAcknowledgement);
    }
}

async function initKycAmlPolicyPage() {
    renderKycLevels();
    renderKycDocuments();
    renderKycPolicy();
    updateAcknowledgedStatus();
    initEvents();
    await refreshBackendKycPolicyState(false);

    window.setInterval(() => {
        if (!document.hidden) {
            refreshBackendKycPolicyState(false);
        }
    }, KYC_STATUS_REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", initKycAmlPolicyPage);
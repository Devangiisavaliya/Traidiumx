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

const kycLevels = [
    {
        level: "Level 0",
        title: "Basic Account",
        access: "View markets only",
        limit: "No deposit / withdrawal",
        status: "Unverified"
    },
    {
        level: "Level 1",
        title: "Verified User",
        access: "Trading access",
        limit: "Standard wallet limits",
        status: "KYC Verified"
    },
    {
        level: "Level 2",
        title: "Enhanced Review",
        access: "Higher limits",
        limit: "Manual compliance review",
        status: "EDD Required"
    }
];

const kycDocuments = [
    {
        icon: "🪪",
        title: "Identity Proof",
        description: "PAN, Aadhaar, Passport, Driving License or other valid identity document."
    },
    {
        icon: "🏠",
        title: "Address Proof",
        description: "Utility bill, bank statement, Aadhaar, passport or accepted address document."
    },
    {
        icon: "🏦",
        title: "Bank Verification",
        description: "Bank account details, account holder name and deposit/withdrawal verification."
    },
    {
        icon: "📱",
        title: "Mobile OTP",
        description: "Mobile ownership verification before Aadhaar front/back document checks."
    }
];

const kycSections = [
    {
        id: "purpose",
        title: "1. Purpose Of KYC-AML Policy",
        summary: "The policy helps prevent money laundering, terrorism financing, fraud and illegal use.",
        content: [
            "The purpose of this KYC-AML Policy is to define the framework TraidiumX may use to identify users, verify customer information, monitor transactions and detect suspicious activity.",
            "The policy is intended to prevent misuse of the platform for money laundering, terrorism financing, proliferation financing, fraud, identity misuse, sanctions evasion or transactions connected with proceeds of crime.",
            "This frontend document is a demo policy for company handover. The final production policy must be reviewed by legal and compliance professionals."
        ]
    },
    {
        id: "scope",
        title: "2. Scope And Applicability",
        summary: "This policy applies to all users, accounts, wallet activity, trading and support interactions.",
        content: [
            "This policy applies to all users who access TraidiumX, create an account, complete KYC, deposit funds, withdraw funds, trade futures or options, participate in campaigns or contact support.",
            "It applies to all account-related data, identity documents, wallet activity, trading activity, referral activity, campaign rewards, support tickets and compliance records.",
            "TraidiumX may apply different levels of verification, review and restrictions based on product access, user profile, transaction behavior, risk score and applicable rules."
        ]
    },
    {
        id: "customer-identification",
        title: "3. Customer Identification Program",
        summary: "Users may be required to submit identity, address, bank and contact details.",
        content: [
            "TraidiumX may require users to provide accurate identity information including name, date of birth, email, mobile number, address, PAN, identity documents and bank account details when required for withdrawal review.",
            "The platform may verify submitted information using internal checks, third-party verification providers, document validation, mobile OTP, bank verification and manual compliance review when required.",
            "Users must not submit fake, forged, altered, expired, mismatched or third-party documents. Such activity may result in account restriction or rejection."
        ]
    },
    {
        id: "beneficial-ownership",
        title: "4. Beneficial Ownership And User Control",
        summary: "Users must act for themselves unless authorized and verified.",
        content: [
            "Users should operate accounts only for themselves unless authorized business or institutional account structures are formally supported and verified.",
            "If an account is suspected to be operated on behalf of another person, company or undisclosed beneficial owner, TraidiumX may request additional information and documents.",
            "Accounts may be restricted if ownership, control, source of funds or transaction purpose cannot be reasonably verified."
        ]
    },
    {
        id: "risk-profiling",
        title: "5. Risk Profiling And Enhanced Due Diligence",
        summary: "Users may be classified by risk level and reviewed accordingly.",
        content: [
            "TraidiumX may assign user risk levels based on KYC information, location, device behavior, transaction pattern, trading activity, wallet behavior, support history and compliance alerts.",
            "Higher-risk users may be subject to enhanced due diligence, additional documents, source of funds checks, manual approval, lower limits or temporary restrictions.",
            "Enhanced review may be applied to unusual trading, high-value withdrawals, frequent account changes, suspicious referrals, multiple accounts or inconsistent KYC details."
        ]
    },
    {
        id: "transaction-monitoring",
        title: "6. Transaction Monitoring",
        summary: "Deposits, withdrawals, trading and wallet behavior may be monitored.",
        content: [
            "TraidiumX may monitor wallet transactions, deposit patterns, withdrawal frequency, trading volume, fee rebate activity, referral rewards and account behavior to detect suspicious activity.",
            "Monitoring rules may include velocity checks, unusual volume detection, repeated failed verification, multiple linked accounts, mismatched bank accounts and unusual device or IP patterns.",
            "Suspicious transactions may be paused, reviewed, rejected, reported or escalated according to internal compliance procedures and applicable requirements."
        ]
    },
    {
        id: "restricted-activities",
        title: "7. Restricted And Prohibited Activities",
        summary: "Illegal, manipulative, abusive and suspicious activities are prohibited.",
        content: [
            "Users must not use TraidiumX for money laundering, terrorism financing, fraud, sanctions evasion, market manipulation, wash trading, reverse trading, identity misuse or illegal activity.",
            "Users must not create fake accounts, use another person’s documents, abuse referral rewards, manipulate campaigns, bypass KYC checks or attempt unauthorized access.",
            "Accounts involved in prohibited activity may be suspended, restricted, terminated or reported where required."
        ]
    },
    {
        id: "sanctions-screening",
        title: "8. Sanctions And Watchlist Screening",
        summary: "Users may be screened against sanctions, watchlists and high-risk indicators.",
        content: [
            "TraidiumX may screen users, counterparties, wallet addresses or transaction activity against sanctions lists, adverse media, politically exposed person indicators and other risk databases.",
            "If a match or potential match is detected, the platform may request additional information, restrict activity or escalate the case for compliance review.",
            "Users must not use the platform if they are prohibited under applicable sanctions or legal restrictions."
        ]
    },
    {
        id: "record-keeping",
        title: "9. Record Keeping",
        summary: "KYC and AML records may be retained for legal, audit and compliance purposes.",
        content: [
            "TraidiumX may retain KYC records, transaction logs, wallet records, audit logs, support records, device logs and compliance review notes for the period required by law or internal policy.",
            "Records may be retained even after account closure where needed for legal compliance, dispute resolution, audit, fraud prevention or regulatory reporting.",
            "Production backend should securely store record timestamps, user ID, admin actions, status changes and document version history."
        ]
    },
    {
        id: "reporting-escalation",
        title: "10. Reporting And Escalation",
        summary: "Suspicious activity may be escalated or reported where required.",
        content: [
            "Where suspicious activity is detected, TraidiumX may escalate the matter internally to compliance, legal or management teams for review.",
            "The platform may report suspicious transactions or provide information to competent authorities when required by applicable law or valid legal process.",
            "Users may not be notified of certain compliance reviews or reports if disclosure is restricted by law or internal security procedures."
        ]
    },
    {
        id: "account-restrictions",
        title: "11. Account Restrictions And Rejection",
        summary: "Accounts may be restricted, rejected or closed due to compliance concerns.",
        content: [
            "TraidiumX may reject onboarding, delay verification, restrict trading, pause withdrawals, freeze activity or close accounts if KYC or AML concerns arise.",
            "Reasons may include invalid documents, incomplete information, suspicious transactions, sanctions concerns, duplicate accounts, false declarations or failure to provide requested information.",
            "Account restrictions may remain until compliance review is completed or the platform determines that the risk cannot be accepted."
        ]
    },
    {
        id: "user-obligations",
        title: "12. User Obligations",
        summary: "Users must provide correct information and cooperate with compliance requests.",
        content: [
            "Users must provide accurate, complete and updated information during registration, KYC verification, wallet setup and compliance review.",
            "Users must immediately update information if identity, address, bank details, contact information or beneficial ownership changes.",
            "Users must cooperate with document requests, source of funds checks, transaction clarification requests and other compliance procedures."
        ]
    },
    {
        id: "policy-updates",
        title: "13. Policy Updates",
        summary: "The KYC-AML Policy may be updated as laws, risks and products change.",
        content: [
            "TraidiumX may update this KYC-AML Policy to reflect changes in products, compliance requirements, laws, risk controls, verification providers or internal procedures.",
            "Updated versions may be published on this page with a revised date. Continued use of the platform may be treated as acceptance of updated policy requirements.",
            "Production backend should track policy version, user acknowledgement, verification status and compliance review history."
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
            kycVerificationMessage.textContent = "Your KYC is approved. Withdrawal access is enabled; deposit, transfer and trading do not require KYC.";
        } else if (rejected) {
            kycVerificationMessage.textContent = "Your KYC was rejected. Please open KYC Verification and submit corrected documents.";
        } else if (pending) {
            kycVerificationMessage.textContent = "Your Aadhaar document verification is processing.";
        } else {
            kycVerificationMessage.textContent = "Submit KYC documents before your first withdrawal. Deposit, transfer and trading remain available.";
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

    if (kycAcknowledgementMessage && acknowledged) {
        const dateText = formatPolicyDate(acknowledged_at);
        kycAcknowledgementMessage.classList.remove("hidden");
        kycAcknowledgementMessage.textContent = dateText
            ? `KYC-AML ${policy_version} acknowledged on ${dateText}.`
            : `KYC-AML ${policy_version} acknowledged successfully.`;
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
                    <div class="text-5xl">${documentItem.icon}</div>
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
                <article id="${section.id}" class="kyc-section-card scroll-mt-32">
                    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h3 class="text-2xl font-black text-white">${section.title}</h3>
                            <p class="mt-2 text-sm leading-6 text-slate-400">${section.summary}</p>
                        </div>

                        <span class="shrink-0 rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-400">
                            KYC-AML
                        </span>
                    </div>

                    <div class="space-y-4">
                        ${section.content.map((paragraph) => {
                            return `<p class="leading-8 text-slate-300">${paragraph}</p>`;
                        }).join("")}
                    </div>
                </article>
            `;
        })
        .join("");

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

function downloadKycTxt() {
    const text = [
        "TRAIDIUMX KYC-AML POLICY",
        "Version: 1.0",
        "Last Updated: 22 Jun 2026",
        "",
        getAllKycText(),
        "",
        "Note: Demo frontend legal content. Review by legal and compliance professionals before production use."
    ].join("\n");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "traidiumx-kyc-aml-policy.txt";
    link.click();

    URL.revokeObjectURL(url);

    showMiniMessage("KYC-AML policy downloaded successfully.", "success");
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
        showMiniMessage("KYC-AML acknowledgement saved locally. Login to save it to backend.", "success");
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
        downloadKycBtn.addEventListener("click", downloadKycTxt);
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
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
        icon: `<div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.15)] text-cyan-400">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 10h6m-6 3h6"></path>
            </svg>
        </div>`,
        title: "Mobile Verification",
        description: "One-Time Passcode (OTP) verification on your mobile number to initialize the KYC process."
    },
    {
        icon: `<div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 shadow-[0_0_20px_rgba(52,211,153,0.15)] text-emerald-400">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
            </svg>
        </div>`,
        title: "Aadhaar Card",
        description: "Secure DigiLocker integration to fetch and verify Aadhaar identity details instantly."
    },
    {
        icon: `<div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.15)] text-purple-400">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5a2 2 0 100-4 2 2 0 000 4zm0 0h12"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9h1m-1 3h2m-2 3h4"></path>
            </svg>
        </div>`,
        title: "PAN Card Record",
        description: "Automated retrieval of your PAN verification record through DigiLocker compliance checks."
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
            "TraidiumX operates under a strict compliance framework designed to maintain platform integrity, user trust, and adherence to international regulatory standards."
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
            "All stored user details, document submissions, transaction histories, and verification logs are kept in encrypted storage with strict access controls."
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
            "The platform maintains an automated version tracking system to record compliance updates, user consents, and policy modifications."
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
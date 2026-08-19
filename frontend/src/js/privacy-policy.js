"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Privacy Policy Page
|--------------------------------------------------------------------------
| Frontend-only interactions:
| - Render privacy sections
| - Search privacy policy
| - Print policy
| - Download TXT
| - Save demo privacy preferences in localStorage
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

const privacySections = [
    {
        id: "introduction",
        title: "1. Introduction",
        summary: "This policy explains how TraidiumX handles user information.",
        content: [
            "This Privacy Policy explains how TraidiumX may collect, receive, store, process, disclose, transfer and protect personal information when users access the platform, create an account, complete KYC, trade, use wallet services or contact support.",
            "By accessing or using TraidiumX, users acknowledge that they have read and understood this Privacy Policy along with the Terms & Conditions, Risk Disclosure, KYC-AML Policy and Trading Policy.",
            "TraidiumX is committed to protecting your privacy. We regularly update our policy to ensure compliance with changing regulations."
        ]
    },
    {
        id: "information-collected",
        title: "2. What Information We Collect",
        summary: "We may collect account, identity, device, trading and support information.",
        content: [
            "Account information may include name, email address, mobile number, password-related security data, referral code, profile details and communication preferences.",
            "KYC information may include identity documents, PAN, address proof, date of birth, selfie verification, bank details, source of funds and other compliance documents required under applicable rules.",
            "Trading and wallet information may include orders, positions, realised P&L, fees, deposits, withdrawals, transaction references, IP address, device logs and risk-control records.",
            "Support information may include ticket details, messages, issue type, uploaded documents, complaint records and communication history."
        ]
    },
    {
        id: "information-use",
        title: "3. How We Use Information",
        summary: "Information is used to provide services, security, compliance and support.",
        content: [
            "We may use user information to create and manage accounts, verify identity, process KYC, enable wallet services, execute trades, show balances, calculate fees and provide platform support.",
            "Information may be used for fraud prevention, anti-money laundering checks, risk monitoring, account security, transaction review, audit logs and legal compliance.",
            "We may also use limited information to improve platform performance, personalize user experience, send service updates and provide campaign or referral-related communications where permitted."
        ]
    },
    {
        id: "sharing-disclosure",
        title: "4. Disclosure And Sharing",
        summary: "Information may be shared with affiliates, service providers and authorities where required.",
        content: [
            "We may share information with trusted service providers such as KYC vendors, payment/banking partners, cloud infrastructure providers, analytics tools, email/SMS providers and customer support systems.",
            "Information may be disclosed to regulators, law enforcement agencies, tax authorities, courts, auditors or other competent authorities when required under applicable law or valid legal process.",
            "We do not sell user personal information. Contact information should not be shared with another platform user without consent, except where legally required or necessary for platform operations."
        ]
    },
    {
        id: "cookies-tracking",
        title: "5. Cookies And Tracking",
        summary: "Cookies may be used for security, login, analytics and user preferences.",
        content: [
            "Essential cookies may be required for login sessions, security checks, device recognition, preference storage and platform functionality.",
            "Analytics cookies may help understand page performance, feature usage, traffic patterns and errors so that the platform can be improved.",
            "Users may disable certain cookies from browser settings, but disabling essential cookies may affect login, trading, wallet and other platform features."
        ]
    },
    {
        id: "data-protection",
        title: "6. How We Protect Information",
        summary: "Security safeguards should protect data from unauthorized access.",
        content: [
            "Production systems should use encryption, HTTPS, access controls, secure password hashing, database permissions, firewalls, audit logs and monitoring to protect personal information.",
            "Access to personal information should be limited to authorized employees, admins, vendors or service providers who need the information to deliver services or comply with legal obligations.",
            "No system can be guaranteed completely secure. Users should protect their own devices, passwords, email accounts and authentication methods."
        ]
    },
    {
        id: "data-retention",
        title: "7. Data Retention",
        summary: "Data may be retained for service, legal, tax and compliance purposes.",
        content: [
            "We may retain personal information while a user account is active and for a reasonable period after account closure where required for legal, tax, audit, fraud prevention, dispute resolution or compliance purposes.",
            "Trading, wallet, KYC and transaction records may need to be retained for longer periods according to applicable laws and internal compliance policies.",
            "Where data is no longer required, it should be deleted, anonymized or securely archived according to company retention policies."
        ]
    },
    {
        id: "user-rights",
        title: "8. User Choices And Rights",
        summary: "Users may request access, correction, withdrawal of consent or account closure.",
        content: [
            "Users may request access to personal information processed by the platform, subject to identity verification and applicable legal limitations.",
            "Users may request correction of inaccurate or incomplete information. KYC-related changes may require additional document verification.",
            "Users may withdraw certain consents or request account closure. However, withdrawal or closure may limit or stop access to platform services, and some records may still be retained where legally required."
        ]
    },
    {
        id: "third-party-links",
        title: "9. Third-Party Services",
        summary: "External services have their own privacy practices.",
        content: [
            "The platform may contain links, integrations, charts, analytics, KYC tools, payment gateways or other third-party services.",
            "Third-party services may collect or process information according to their own privacy policies. Users should review such policies before using those services.",
            "TraidiumX is not responsible for privacy practices of third-party websites or services not controlled by TraidiumX."
        ]
    },
    {
        id: "grievance",
        title: "10. Grievance And Contact",
        summary: "Users can contact support for privacy complaints or requests.",
        content: [
            "For privacy-related questions, correction requests, account closure requests or complaints, users may contact the TraidiumX support or grievance desk.",
            "Production version should display official grievance officer name, email, company address and complaint resolution timeline after legal confirmation.",
            "Users should provide relevant account details, ticket ID, documents and clear explanation when submitting a privacy request."
        ]
    },
    {
        id: "updates-law",
        title: "11. Updates And Governing Law",
        summary: "Policy may be updated as the platform and law change.",
        content: [
            "TraidiumX may update this Privacy Policy to reflect product changes, legal requirements, security improvements, vendor changes or compliance needs.",
            "Updated versions may be published on this page with a new last updated date. Continued use of the platform may be treated as acceptance of the updated policy.",
            "TraidiumX operates in accordance with applicable Indian laws and regulatory standards for data protection and financial compliance."
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
                    <span>${section.title.replace(/^\d+\.\s?/, "")}</span>
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
                            <h3 class="text-xl font-black text-white">${section.title}</h3>
                            <p class="mt-2 text-sm leading-6 text-slate-400">${section.summary}</p>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                            <span class="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-400">
                                Privacy
                            </span>
                            <span class="privacy-chevron text-slate-500 font-bold transition-transform duration-300">▼</span>
                        </div>
                    </div>

                    <div class="privacy-card-body overflow-hidden max-h-0 transition-all duration-300 ease-in-out">
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
        filename:     'traidiumx-privacy-policy.pdf',
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
    showMiniMessage("Privacy policy PDF downloaded successfully.", "success");
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
"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Contact Page
|--------------------------------------------------------------------------
| Frontend-only interactions:
| - Contact form validation
| - Ticket ID generation
| - Priority preview
| - Message character counter
| - Copy ticket ID
| - Support channel actions
|--------------------------------------------------------------------------
*/

const contactSupportForm = document.getElementById("contactSupportForm");

const contactName = document.getElementById("contactName");
const contactEmail = document.getElementById("contactEmail");
const contactMobile = document.getElementById("contactMobile");
const contactIssueType = document.getElementById("contactIssueType");
const contactSubject = document.getElementById("contactSubject");
const contactMessage = document.getElementById("contactMessage");
const contactAgree = document.getElementById("contactAgree");

const contactNameError = document.getElementById("contactNameError");
const contactEmailError = document.getElementById("contactEmailError");
const contactMobileError = document.getElementById("contactMobileError");
const contactIssueTypeError = document.getElementById("contactIssueTypeError");
const contactSubjectError = document.getElementById("contactSubjectError");
const contactMessageError = document.getElementById("contactMessageError");
const contactAgreeError = document.getElementById("contactAgreeError");

const priorityPreview = document.getElementById("priorityPreview");
const messageCounter = document.getElementById("messageCounter");

const ticketSuccessBox = document.getElementById("ticketSuccessBox");
const generatedTicketId = document.getElementById("generatedTicketId");
const copyTicketBtn = document.getElementById("copyTicketBtn");

const currentTicketBadge = document.getElementById("currentTicketBadge");
const currentTicketId = document.getElementById("currentTicketId");
const currentTicketNote = document.getElementById("currentTicketNote");

let lastTicketId = "";

function showMiniMessage(message, type = "success") {
    let messageBox = document.getElementById("contactMiniMessage");

    if (!messageBox) {
        messageBox = document.createElement("div");
        messageBox.id = "contactMiniMessage";
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

function setError(element, message) {
    if (element) {
        element.textContent = message;
    }
}

function clearErrors() {
    [
        contactNameError,
        contactEmailError,
        contactMobileError,
        contactIssueTypeError,
        contactSubjectError,
        contactMessageError,
        contactAgreeError
    ].forEach((element) => {
        if (element) {
            element.textContent = "";
        }
    });
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateMobile(mobile) {
    return /^[6-9]\d{9}$/.test(mobile);
}

function generateTicketId() {
    const date = new Date();
    const year = String(date.getFullYear()).slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const random = Math.floor(1000 + Math.random() * 9000);

    return `TX-${year}${month}-${random}`;
}

function getPriorityByIssue(issueType) {
    const highPriorityIssues = ["Wallet", "Futures Trading", "Options Trading", "Technical Bug"];
    const mediumPriorityIssues = ["KYC", "Fee Campaign"];

    if (highPriorityIssues.includes(issueType)) {
        return {
            label: "Priority: High",
            className: "rounded-full bg-red-400/10 px-3 py-1 text-xs font-black text-red-300"
        };
    }

    if (mediumPriorityIssues.includes(issueType)) {
        return {
            label: "Priority: Medium",
            className: "rounded-full bg-orange-400/10 px-3 py-1 text-xs font-black text-orange-300"
        };
    }

    return {
        label: "Priority: Normal",
        className: "rounded-full bg-slate-800 px-3 py-1 text-xs font-black text-slate-400"
    };
}

function updatePriorityPreview() {
    if (!priorityPreview || !contactIssueType) {
        return;
    }

    const priority = getPriorityByIssue(contactIssueType.value);

    priorityPreview.textContent = priority.label;
    priorityPreview.className = priority.className;
}

function updateMessageCounter() {
    if (!messageCounter || !contactMessage) {
        return;
    }

    const length = contactMessage.value.length;
    messageCounter.textContent = `${length} / 500`;

    if (length >= 450) {
        messageCounter.className = "text-xs font-black text-orange-300";
    } else {
        messageCounter.className = "text-xs font-black text-slate-500";
    }
}

function validateForm() {
    clearErrors();

    const name = contactName ? contactName.value.trim() : "";
    const email = contactEmail ? contactEmail.value.trim() : "";
    const mobile = contactMobile ? contactMobile.value.trim() : "";
    const issueType = contactIssueType ? contactIssueType.value.trim() : "";
    const subject = contactSubject ? contactSubject.value.trim() : "";
    const message = contactMessage ? contactMessage.value.trim() : "";
    const agreed = contactAgree ? contactAgree.checked : false;

    let isValid = true;

    if (name.length < 2) {
        setError(contactNameError, "Please enter valid full name.");
        isValid = false;
    }

    if (!validateEmail(email)) {
        setError(contactEmailError, "Please enter valid email address.");
        isValid = false;
    }

    if (!validateMobile(mobile)) {
        setError(contactMobileError, "Please enter valid 10 digit mobile number.");
        isValid = false;
    }

    if (!issueType) {
        setError(contactIssueTypeError, "Please select issue type.");
        isValid = false;
    }

    if (subject.length < 5) {
        setError(contactSubjectError, "Subject must be at least 5 characters.");
        isValid = false;
    }

    if (message.length < 20) {
        setError(contactMessageError, "Message must be at least 20 characters.");
        isValid = false;
    }

    if (!agreed) {
        setError(contactAgreeError, "Please accept the support note.");
        isValid = false;
    }

    return isValid;
}

function updateTicketPreview(ticketId, issueType, status = "Created") {
    if (currentTicketBadge) {
        currentTicketBadge.textContent = status;
        if (status === "Resolved") {
            currentTicketBadge.className = "rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-400";
        } else if (status === "In Progress") {
            currentTicketBadge.className = "rounded-full bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-400";
        } else if (status === "Open") {
            currentTicketBadge.className = "rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-400";
        } else {
            currentTicketBadge.className = "rounded-full bg-slate-800 px-3 py-1 text-xs font-black text-slate-400";
        }
    }

    if (currentTicketId) {
        currentTicketId.textContent = ticketId;
    }

    if (currentTicketNote) {
        currentTicketNote.textContent = `${issueType} ticket tracked in live database. Status is ${status.toLowerCase()}.`;
    }
}

async function handleSubmit(event) {
    event.preventDefault();

    if (!validateForm()) {
        showMiniMessage("Please fix form errors.", "error");
        return;
    }

    const name = contactName.value.trim();
    const email = contactEmail.value.trim();
    const mobile = contactMobile.value.trim();
    const issueType = contactIssueType.value;
    const subject = contactSubject.value.trim();
    const message = contactMessage.value.trim();
    const ticketId = generateTicketId();

    try {
        const response = await apiRequest("/support/ticket", {
            method: "POST",
            body: JSON.stringify({
                name,
                email,
                mobile,
                issue_type: issueType,
                subject,
                message,
                ticket_id: ticketId
            })
        });

        if (response && response.success) {
            lastTicketId = ticketId;

            if (generatedTicketId) {
                generatedTicketId.textContent = ticketId;
            }

            if (ticketSuccessBox) {
                ticketSuccessBox.classList.remove("hidden");
            }

            if (typeof window.showToast === "function") {
                window.showToast(`Support ticket ${ticketId} created!`, "success");
            } else {
                showMiniMessage(`Support ticket ${ticketId} created successfully.`, "success");
            }

            updateTicketPreview(ticketId, issueType, "Open");

            contactSupportForm.reset();
            updatePriorityPreview();
            updateMessageCounter();

            window.setTimeout(() => {
                ticketSuccessBox?.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }, 100);

            await loadUserTickets();
        } else {
            showMiniMessage(response?.message || "Failed to submit ticket.", "error");
        }
    } catch (err) {
        console.error("Submit failed", err);
        showMiniMessage("Network error. Please try again.", "error");
    }
}

async function copyTicketId() {
    if (!lastTicketId) {
        showMiniMessage("No ticket ID available.", "error");
        return;
    }

    try {
        await navigator.clipboard.writeText(lastTicketId);
        showMiniMessage("Ticket ID copied successfully.", "success");
    } catch (error) {
        console.error(error);
        showMiniMessage("Copy failed. Please copy manually.", "error");
    }
}

function handleSupportChannel(channel) {
    if (channel === "Email Support") {
        window.location.href = "mailto:support@traidiumx.com?subject=TraidiumX Support Request";
        return;
    }

    if (channel === "Live Chat") {
        showMiniMessage("Live chat starting... Our team will connect with you shortly.", "success");
        return;
    }

    if (channel === "Compliance Desk") {
        showMiniMessage("Compliance desk selected. Please create KYC/AML ticket.", "success");
        return;
    }

    if (channel === "Technical Help") {
        showMiniMessage("Technical help selected. Please create bug ticket.", "success");
        return;
    }

    showMiniMessage(`${channel} selected.`, "success");
}

async function loadUserTickets() {
    const tableBody = document.getElementById("ticketsTableBody");
    if (!tableBody) return;

    try {
        const response = await apiRequest("/support/tickets");
        if (response && response.success && response.data && response.data.tickets) {
            const tickets = response.data.tickets;
            if (tickets.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="py-8 text-center text-xs font-bold text-slate-500">
                            You have not submitted any support tickets yet.
                        </td>
                    </tr>
                `;
                return;
            }

            // Populate preview card with the latest ticket
            const latest = tickets[0];
            updateTicketPreview(latest.ticket_id, latest.issue_type, latest.status);

            tableBody.innerHTML = tickets.map(t => {
                let priorityClass = "text-slate-400 bg-slate-800";
                if (t.priority === "High") priorityClass = "text-red-300 bg-red-400/10";
                else if (t.priority === "Medium") priorityClass = "text-orange-300 bg-orange-400/10";

                let statusClass = "text-slate-400 bg-slate-800";
                if (t.status === "Open") statusClass = "text-cyan-400 bg-cyan-400/10";
                else if (t.status === "In Progress") statusClass = "text-amber-400 bg-amber-400/10";
                else if (t.status === "Resolved") statusClass = "text-emerald-400 bg-emerald-400/10";

                const dateStr = t.created_at.includes("T") ? t.created_at.replace("T", " ").substring(0, 16) : t.created_at;

                return `
                    <tr class="hover:bg-white/[0.02] transition-colors">
                        <td class="py-4 pr-4 font-mono font-bold text-xs text-white">${t.ticket_id}</td>
                        <td class="py-4 pr-4 text-xs font-bold text-slate-300">${t.issue_type}</td>
                        <td class="py-4 pr-4 text-xs font-semibold text-slate-300 truncate max-w-[150px]" title="${escapeHtml(t.subject)}">${escapeHtml(t.subject)}</td>
                        <td class="py-4 pr-4">
                            <span class="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${priorityClass}">
                                ${t.priority}
                            </span>
                        </td>
                        <td class="py-4 pr-4">
                            <span class="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusClass}">
                                ${t.status}
                            </span>
                        </td>
                        <td class="py-4 text-xs font-semibold text-slate-400">${dateStr}</td>
                    </tr>
                `;
            }).join("");
        } else {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-8 text-center text-xs font-bold text-red-400">
                        Failed to load support tickets. Please log in.
                    </td>
                </tr>
            `;
        }
    } catch (err) {
        console.error("Load tickets failed", err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="py-8 text-center text-xs font-bold text-red-400">
                    Network error. Failed to load support tickets.
                </td>
            </tr>
        `;
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function initMobileInputRestriction() {
    if (!contactMobile) {
        return;
    }

    contactMobile.addEventListener("input", () => {
        contactMobile.value = contactMobile.value.replace(/\D/g, "").slice(0, 10);
    });
}

function initChannelButtons() {
    document.querySelectorAll("[data-channel]").forEach((button) => {
        button.addEventListener("click", () => {
            const channel = button.getAttribute("data-channel") || "Support";
            handleSupportChannel(channel);
        });
    });
}

function initEvents() {
    if (contactSupportForm) {
        contactSupportForm.addEventListener("submit", handleSubmit);
    }

    if (contactIssueType) {
        contactIssueType.addEventListener("change", updatePriorityPreview);
    }

    if (contactMessage) {
        contactMessage.addEventListener("input", updateMessageCounter);
    }

    if (copyTicketBtn) {
        copyTicketBtn.addEventListener("click", copyTicketId);
    }

    const refreshTicketsBtn = document.getElementById("refreshTicketsBtn");
    if (refreshTicketsBtn) {
        refreshTicketsBtn.addEventListener("click", async () => {
            refreshTicketsBtn.disabled = true;
            refreshTicketsBtn.textContent = "Refreshing...";
            await loadUserTickets();
            refreshTicketsBtn.textContent = "Refresh List";
            refreshTicketsBtn.disabled = false;
        });
    }

    initMobileInputRestriction();
    initChannelButtons();
}

function initFaqAccordion() {
    const details = document.querySelectorAll("section details");
    details.forEach((item) => {
        item.addEventListener("toggle", () => {
            if (item.open) {
                details.forEach((otherItem) => {
                    if (otherItem !== item) {
                        otherItem.removeAttribute("open");
                    }
                });
            }
        });
    });
}

function initContactPage() {
    updatePriorityPreview();
    updateMessageCounter();
    initEvents();
    initFaqAccordion();
    loadUserTickets();
}

document.addEventListener("DOMContentLoaded", initContactPage);
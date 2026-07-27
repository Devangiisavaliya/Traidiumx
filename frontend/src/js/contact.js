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
        setError(contactAgreeError, "Please accept demo support note.");
        isValid = false;
    }

    return isValid;
}

function updateTicketPreview(ticketId, issueType) {
    if (currentTicketBadge) {
        currentTicketBadge.textContent = "Created";
        currentTicketBadge.className = "rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-400";
    }

    if (currentTicketId) {
        currentTicketId.textContent = ticketId;
    }

    if (currentTicketNote) {
        currentTicketNote.textContent = `${issueType} ticket created successfully. Backend tracking will be connected later.`;
    }
}

function handleSubmit(event) {
    event.preventDefault();

    if (!validateForm()) {
        showMiniMessage("Please fix form errors.", "error");
        return;
    }

    const issueType = contactIssueType.value;
    const ticketId = generateTicketId();

    lastTicketId = ticketId;

    if (generatedTicketId) {
        generatedTicketId.textContent = ticketId;
    }

    if (ticketSuccessBox) {
        ticketSuccessBox.classList.remove("hidden");
    }

    updateTicketPreview(ticketId, issueType);

    showMiniMessage(`Support ticket ${ticketId} created successfully.`, "success");

    contactSupportForm.reset();
    updatePriorityPreview();
    updateMessageCounter();

    window.setTimeout(() => {
        ticketSuccessBox?.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }, 100);
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
        window.location.href = "mailto:support@traidiumx.demo?subject=TraidiumX Support Request";
        return;
    }

    if (channel === "Live Chat") {
        showMiniMessage("Live chat demo opened. Real chat will be connected later.", "success");
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

    initMobileInputRestriction();
    initChannelButtons();
}

function initContactPage() {
    updatePriorityPreview();
    updateMessageCounter();
    initEvents();
}

document.addEventListener("DOMContentLoaded", initContactPage);
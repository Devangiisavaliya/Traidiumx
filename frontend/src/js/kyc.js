"use strict";

const kycState = {
    status: "not_submitted",
    locked: false,
    currentStep: 1,
    mobileVerified: false,
    aadhaarSaved: false,
    documentsVerified: false,
    mobileNumber: "",
    otpTimer: null,
    draftScan: null,
    digioPollInterval: null,
};

function getKycReturnPath() {
    const raw = new URLSearchParams(window.location.search).get("next") || "";
    let value = raw;
    try { value = decodeURIComponent(raw); } catch (error) { value = raw; }
    value = String(value || "").trim();
    if (!value || value.startsWith("//") || value.includes("://")) return "";
    if (value.startsWith("./") || value.startsWith("../") || value.startsWith("/src/pages/")) return value;
    return "";
}

function returnAfterWithdrawalKyc() {
    const target = getKycReturnPath();
    if (!target || window.__txKycReturning) return;
    window.__txKycReturning = true;
    window.setTimeout(() => {
        window.location.href = target;
    }, 1200);
}

const kycEl = {
    message: document.getElementById("kycMessage"),
    statusText: document.getElementById("kycStatusText"),
    remarkText: document.getElementById("kycRemarkText"),

    mobilePanel: document.getElementById("kycMobilePanel"),
    mobileNumber: document.getElementById("kycMobileNumber"),
    mobileNumberError: document.getElementById("kycMobileNumberError"),
    sendOtpBtn: document.getElementById("kycSendOtpBtn"),
    mobileOtpBox: document.getElementById("kycMobileOtpBox"),
    mobileOtp: document.getElementById("kycMobileOtp"),
    verifyOtpBtn: document.getElementById("kycVerifyOtpBtn"),
    mobileOtpTimer: document.getElementById("kycMobileOtpTimer"),
    mobileOtpError: document.getElementById("kycMobileOtpError"),
    mobileDevOtp: document.getElementById("kycMobileDevOtp"),

    form: document.getElementById("kycForm"),
    docType: document.getElementById("kycDocumentType"),
    docTypeAadhaar: document.getElementById("kycDocTypeAadhaar"),
    docTypePan: document.getElementById("kycDocTypePan"),
    step2Title: document.getElementById("kycStep2Title"),
    step2Desc: document.getElementById("kycStep2Desc"),
    aadhaarNumberLabel: document.getElementById("kycAadhaarNumberLabel"),
    
    stepNumberPanel: document.getElementById("kycStepNumberPanel"),
    aadhaarNumber: document.getElementById("kycAadhaarNumber"),
    aadhaarNumberError: document.getElementById("kycAadhaarNumberError"),
    numberNextBtn: document.getElementById("kycNumberNextBtn"),
    numberBackBtn: document.getElementById("kycNumberBackBtn"),

    stepPhotosPanel: document.getElementById("kycStepPhotosPanel"),
    step3Title: document.getElementById("kycStep3Title"),
    step3Desc: document.getElementById("kycStep3Desc"),
    documentFrontLabel: document.getElementById("kycDocumentFrontLabel"),
    documentFront: document.getElementById("kycDocumentFront"),
    documentFrontError: document.getElementById("kycDocumentFrontError"),
    documentBackWrapper: document.getElementById("kycDocumentBackWrapper"),
    documentBack: document.getElementById("kycDocumentBack"),
    documentBackError: document.getElementById("kycDocumentBackError"),
    photosNextBtn: document.getElementById("kycPhotosNextBtn"),
    photosBackBtn: document.getElementById("kycPhotosBackBtn"),

    stepSelfiePanel: document.getElementById("kycStepSelfiePanel"),
    selfie: document.getElementById("kycSelfie"),
    selfieError: document.getElementById("kycSelfieError"),
    selfieBackBtn: document.getElementById("kycSelfieBackBtn"),
    consent: document.getElementById("kycConsent"),
    consentError: document.getElementById("kycConsentError"),
    submitBtn: document.getElementById("kycSubmitBtn"),

    scanTitle: document.getElementById("kycScanTitle"),
    scanText: document.getElementById("kycScanText"),
    scanDetails: document.getElementById("kycScanDetails"),
    formBadge: document.getElementById("kycFormBadge"),

    submittedName: document.getElementById("kycSubmittedName"),
    submittedNumber: document.getElementById("kycSubmittedNumber"),
    submittedDoc: document.getElementById("kycSubmittedDoc"),
    approvedMessagePanel: document.getElementById("kycApprovedMessagePanel"),
    pendingMessagePanel: document.getElementById("kycPendingMessagePanel"),
    selfiePanel: document.getElementById("kycSelfiePanel"),

    badgeText: document.getElementById("kycBadgeText"),
    mainTitle: document.getElementById("kycMainTitle"),
    mainDesc: document.getElementById("kycMainDesc"),
    step2CardLabel: document.getElementById("kycStep2CardLabel"),
    submitTitle: document.getElementById("kycSubmitTitle"),
    submitDesc: document.getElementById("kycSubmitDesc"),
    consentText: document.getElementById("kycConsentText"),
    submittedNumberLabel: document.getElementById("kycSubmittedNumberLabel"),
    submittedDetailsDesc: document.getElementById("kycSubmittedDetailsDesc"),
    approvedMessageText: document.getElementById("kycApprovedMessageText"),
    pendingMessageText: document.getElementById("kycPendingMessageText"),
};

function showKycMessage(message, type = "success") {
    if (!kycEl.message) return;
    const isError = type === "error";
    kycEl.message.textContent = message;
    kycEl.message.className = isError
        ? "mb-6 rounded-2xl border border-red-400/30 bg-red-400/10 px-5 py-4 text-sm font-black text-red-300"
        : "mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-sm font-black text-emerald-300";
}

function hideKycMessage() {
    if (!kycEl.message) return;
    kycEl.message.textContent = "";
    kycEl.message.className = "mb-6 hidden rounded-2xl border px-5 py-4 text-sm font-black";
}

function formatKycStatus(value) {
    const status = String(value || "not_submitted").replaceAll("_", " ");
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function getDefaultRemark(status) {
    if (status === "approved") return "Your Aadhaar KYC is approved. Deposits, trading, and withdrawal access are fully enabled.";
    if (["pending", "under_review", "review"].includes(status)) return "Your KYC submission is under verification.";
    if (status === "rejected") return "Your KYC verification was rejected by admin. Please complete the verification again from Step 1.";
    return "Complete the current KYC step. Finished steps remain saved and will not reopen.";
}

function setKycStatus(status, remark = "") {
    const value = String(status || "not_submitted").toLowerCase();
    kycState.status = value;

    if (kycEl.statusText) {
        kycEl.statusText.textContent = formatKycStatus(value);
        kycEl.statusText.className = value === "approved"
            ? "mt-4 text-4xl font-black text-emerald-400"
            : value === "rejected"
                ? "mt-4 text-4xl font-black text-red-400"
                : "mt-4 text-4xl font-black text-orange-300";
    }
    if (kycEl.remarkText) kycEl.remarkText.textContent = remark || getDefaultRemark(value);
}

function clearKycErrors() {
    [
        kycEl.mobileNumberError,
        kycEl.mobileOtpError,
        kycEl.aadhaarNumberError,
        kycEl.documentFrontError,
        kycEl.documentBackError,
        kycEl.selfieError,
        kycEl.consentError,
    ].forEach((node) => {
        if (node) node.textContent = "";
    });
}

function applyApiErrors(errors = {}) {
    if (errors.mobile && kycEl.mobileNumberError) kycEl.mobileNumberError.textContent = errors.mobile;
    if (errors.otp && kycEl.mobileOtpError) kycEl.mobileOtpError.textContent = errors.otp;
    if (errors.aadhaar_number && kycEl.aadhaarNumberError) kycEl.aadhaarNumberError.textContent = errors.aadhaar_number;
    if (errors.document_front && kycEl.documentFrontError) kycEl.documentFrontError.textContent = errors.document_front;
    if (errors.document_back && kycEl.documentBackError) kycEl.documentBackError.textContent = errors.document_back;
    if (errors.selfie && kycEl.selfieError) kycEl.selfieError.textContent = errors.selfie;
    if (errors.consent && kycEl.consentError) kycEl.consentError.textContent = errors.consent;
}

function stepCardClass(state) {
    const base = "rounded-2xl border p-4 transition";
    if (state === "verified") return `${base} border-emerald-400/30 bg-emerald-400/10`;
    if (state === "current") return `${base} border-cyan-400/40 bg-cyan-400/10 shadow-lg shadow-cyan-500/5`;
    return `${base} border-white/10 bg-slate-950/60 opacity-60`;
}

function renderStepProgress(stepStates = {}) {
    for (let step = 1; step <= 3; step += 1) {
        const state = stepStates[String(step)] || (step < kycState.currentStep ? "verified" : step === kycState.currentStep ? "current" : "locked");
        const card = document.querySelector(`[data-kyc-step-card="${step}"]`);
        const status = document.querySelector(`[data-kyc-step-status="${step}"]`);
        if (card) card.className = stepCardClass(state);
        if (status) {
            status.textContent = state === "verified" ? "Verified" : state === "current" ? "Continue" : "Locked";
            status.className = state === "verified"
                ? "mt-2 text-[11px] font-black uppercase tracking-wider text-emerald-300"
                : state === "current"
                    ? "mt-2 text-[11px] font-black uppercase tracking-wider text-cyan-300"
                    : "mt-2 text-[11px] font-black uppercase tracking-wider text-slate-600";
        }
    }
}

let selfiePollInterval = null;
let selfieTimerInterval = null;
let webcamStream = null;
let selfieCapturedFile = null;

function switchSelfieTab(activeTab) {
    const deviceTabBtn = document.getElementById("selfieTabDeviceBtn");
    const mobileTabBtn = document.getElementById("selfieTabMobileBtn");
    
    const deviceView = document.getElementById("selfieDeviceView");
    const mobileView = document.getElementById("selfieMobileView");

    // Reset captured snap when switching tabs
    selfieCapturedFile = null;
    const submitBtn = document.getElementById("kycSubmitVerificationBtn");
    if (submitBtn) submitBtn.disabled = true;

    if (activeTab === "device") {
        if (deviceTabBtn) {
            deviceTabBtn.className = "flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-black bg-blue-600 text-white shadow-lg transition";
        }
        if (mobileTabBtn) {
            mobileTabBtn.className = "flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-black text-slate-400 hover:text-white transition";
        }
        
        if (deviceView) deviceView.classList.remove("hidden");
        if (mobileView) mobileView.classList.add("hidden");

        stopSelfiePolling();
        stopSelfieTimer();
        startWebcamStream();
    } else {
        if (mobileTabBtn) {
            mobileTabBtn.className = "flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-black bg-blue-600 text-white shadow-lg transition";
        }
        if (deviceTabBtn) {
            deviceTabBtn.className = "flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-black text-slate-400 hover:text-white transition";
        }

        if (mobileView) mobileView.classList.remove("hidden");
        if (deviceView) deviceView.classList.add("hidden");

        stopWebcamStream();
        startMobileSelfieFlow();
    }
}

function startSelfieTimer() {
    stopSelfieTimer();
    let timeLeft = 300; // 5 minutes
    const timerSpan = document.getElementById("kycTimer");
    
    selfieTimerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            stopSelfieTimer();
            initSelfieStep();
            return;
        }
        const mins = String(Math.floor(timeLeft / 60)).padStart(2, "0");
        const secs = String(timeLeft % 60).padStart(2, "0");
        if (timerSpan) timerSpan.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopSelfieTimer() {
    if (selfieTimerInterval) {
        clearInterval(selfieTimerInterval);
        selfieTimerInterval = null;
    }
}

async function startWebcamStream() {
    stopWebcamStream();
    const video = document.getElementById("kycWebcamStream");
    const preview = document.getElementById("kycWebcamPreview");
    const captureBtn = document.getElementById("kycCaptureSnapBtn");
    const retakeBtn = document.getElementById("kycRetakeSnapBtn");

    if (video) video.style.display = "block";
    if (preview) preview.classList.add("hidden");
    if (captureBtn) captureBtn.classList.remove("hidden");
    if (retakeBtn) retakeBtn.classList.add("hidden");

    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: 640, height: 480 },
            audio: false
        });
        if (video) video.srcObject = webcamStream;
    } catch (err) {
        console.error("Failed to access webcam:", err);
        showKycMessage("Camera access blocked or not available. Please choose a file instead.", "error");
    }
}

function stopWebcamStream() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
}

function captureWebcamSnap() {
    const video = document.getElementById("kycWebcamStream");
    const preview = document.getElementById("kycWebcamPreview");
    const captureBtn = document.getElementById("kycCaptureSnapBtn");
    const retakeBtn = document.getElementById("kycRetakeSnapBtn");

    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
        if (blob) {
            selfieCapturedFile = new File([blob], "selfie.jpg", { type: "image/jpeg" });
            if (preview) {
                preview.src = URL.createObjectURL(blob);
                preview.classList.remove("hidden");
            }
            if (video) video.style.display = "none";
            
            if (captureBtn) captureBtn.classList.add("hidden");
            if (retakeBtn) retakeBtn.classList.remove("hidden");

            const submitBtn = document.getElementById("kycSubmitVerificationBtn");
            if (submitBtn) submitBtn.disabled = false;
        }
    }, "image/jpeg", 0.90);
}

function retakeWebcamSnap() {
    selfieCapturedFile = null;
    const submitBtn = document.getElementById("kycSubmitVerificationBtn");
    if (submitBtn) submitBtn.disabled = true;
    startWebcamStream();
}

async function startMobileSelfieFlow() {
    const qrContainer = document.getElementById("kycMobileQrContainer");
    if (qrContainer) {
        qrContainer.innerHTML = `<div class="text-xs text-slate-400 animate-pulse">Generating secure QR code...</div>`;
        try {
            const statusResponse = await apiRequest("/kyc/status");
            const localIp = statusResponse?.data?.local_ip || window.location.hostname;
            const port = statusResponse?.data?.server_port || "5000";
            
            const shortCodeResponse = await apiRequest("/kyc/short-code", { method: "POST" });
            const shortCode = shortCodeResponse?.data?.code;
            if (!shortCode) throw new Error("Could not generate short code.");
            
            const mobileUrl = `http://${localIp}:${port}/src/pages/mobile-selfie.html?code=${encodeURIComponent(shortCode)}`;
            
            qrContainer.innerHTML = "";
            new QRCode(qrContainer, {
                text: mobileUrl,
                width: 156,
                height: 156,
                colorDark: "#020617",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });
            
            const qrImgElement = qrContainer.querySelector("img");
            if (qrImgElement) {
                qrImgElement.className = "w-full h-full object-contain";
            }
            
            startSelfieTimer();
        } catch (err) {
            console.error("Failed to render QR Code with local IP:", err);
            qrContainer.innerHTML = `
                <div class="text-center p-2 text-slate-700">
                    <p class="text-[10px] font-bold leading-relaxed text-red-500">Connection Error</p>
                    <button type="button" onclick="startMobileSelfieFlow()" class="mt-2 rounded-lg bg-slate-900 border border-white/10 px-3 py-1 text-[10px] font-black text-slate-300 hover:text-white transition">Retry</button>
                </div>
            `;
        }
    }

    stopSelfiePolling();
    selfiePollInterval = setInterval(async () => {
        try {
            const response = await apiRequest("/kyc/status");
            const data = response?.data || {};
            const status = String(data.kyc_status || "not_submitted").toLowerCase();
            if (status === "pending" || status === "approved") {
                stopSelfiePolling();
                stopSelfieTimer();
                showKycMessage("Selfie verification completed successfully!", "success");
                await loadKycStatus();
            }
        } catch (err) {
            console.error("Selfie polling error:", err);
        }
    }, 3000);
}

async function initSelfieStep() {
    // Bind Tab Switching Buttons
    const deviceTabBtn = document.getElementById("selfieTabDeviceBtn");
    if (deviceTabBtn && !deviceTabBtn.dataset.bound) {
        deviceTabBtn.dataset.bound = "true";
        deviceTabBtn.addEventListener("click", () => switchSelfieTab("device"));
    }

    const mobileTabBtn = document.getElementById("selfieTabMobileBtn");
    if (mobileTabBtn && !mobileTabBtn.dataset.bound) {
        mobileTabBtn.dataset.bound = "true";
        mobileTabBtn.addEventListener("click", () => switchSelfieTab("mobile"));
    }

    // Bind Webcam View Buttons
    const captureSnapBtn = document.getElementById("kycCaptureSnapBtn");
    if (captureSnapBtn && !captureSnapBtn.dataset.bound) {
        captureSnapBtn.dataset.bound = "true";
        captureSnapBtn.addEventListener("click", captureWebcamSnap);
    }

    const retakeSnapBtn = document.getElementById("kycRetakeSnapBtn");
    if (retakeSnapBtn && !retakeSnapBtn.dataset.bound) {
        retakeSnapBtn.dataset.bound = "true";
        retakeSnapBtn.addEventListener("click", retakeWebcamSnap);
    }

    // Bind File Input fallback
    const fileInput = document.getElementById("kycSelfie");
    const fileNameText = document.getElementById("kycSelfieFileName");
    if (fileInput && !fileInput.dataset.bound) {
        fileInput.dataset.bound = "true";
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                if (fileNameText) fileNameText.textContent = file.name;
                selfieCapturedFile = file;
                const submitBtn = document.getElementById("kycSubmitVerificationBtn");
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    // Bind Unified Submit Request Button
    const submitBtn = document.getElementById("kycSubmitVerificationBtn");
    if (submitBtn && !submitBtn.dataset.bound) {
        submitBtn.dataset.bound = "true";
        submitBtn.addEventListener("click", submitKycVerificationRequest);
    }

    // Default to Mobile Scan QR tab
    switchSelfieTab("mobile");
}

function stopSelfiePolling() {
    if (selfiePollInterval) {
        clearInterval(selfiePollInterval);
        selfiePollInterval = null;
    }
}

async function submitKycVerificationRequest() {
    const submitBtn = document.getElementById("kycSubmitVerificationBtn");
    if (submitBtn) submitBtn.disabled = true;

    try {
        if (!selfieCapturedFile) {
            showKycMessage("Please capture a selfie or choose a file first.", "error");
            if (submitBtn) submitBtn.disabled = false;
            return;
        }

        showKycMessage("Submitting selfie verification request...", "success");

        const formData = new FormData();
        formData.append("selfie", selfieCapturedFile);

        await apiRequest("/kyc/submit", {
            method: "POST",
            body: formData
        });

        showKycMessage("KYC verification request submitted successfully!", "success");
        stopWebcamStream();
        await loadKycStatus();
    } catch (err) {
        console.error("KYC submission failed:", err);
        showKycMessage(err.message || "Selfie submission failed.", "error");
        if (submitBtn) submitBtn.disabled = false;
    }
}

function setWizardStep(step, stepStates = null) {
    const safeStep = Math.max(1, Math.min(Number(step) || 1, 3));
    kycState.currentStep = safeStep;

    const mobilePanel = document.getElementById("kycMobilePanel");
    const formPanel = document.getElementById("kycForm");
    const selfiePanel = document.getElementById("kycSelfiePanel");

    if (mobilePanel) mobilePanel.classList.toggle("hidden", safeStep !== 1);
    if (formPanel) formPanel.classList.toggle("hidden", safeStep !== 2);
    if (selfiePanel) selfiePanel.classList.toggle("hidden", safeStep !== 3);

    if (safeStep === 3) {
        initSelfieStep();
    } else {
        stopSelfiePolling();
    }

    renderStepProgress(stepStates || {});
    updateFormBadge();
}

function updateFormBadge() {
    if (!kycEl.formBadge) return;
    if (kycState.status === "approved") {
        kycEl.formBadge.textContent = "KYC Approved";
        kycEl.formBadge.className = "rounded-full border border-emerald-400/40 bg-emerald-400/15 px-4 py-2 text-xs font-black text-emerald-300";
        return;
    }
    if (["pending", "under_review", "review"].includes(kycState.status)) {
        kycEl.formBadge.textContent = "All Steps Complete";
        kycEl.formBadge.className = "rounded-full border border-amber-400/40 bg-amber-400/15 px-4 py-2 text-xs font-black text-amber-200";
        return;
    }
    const labels = {
        1: "Mobile Verification Required",
        2: "Step 1 Verified",
        3: "Step 2 Verified"
    };
    kycEl.formBadge.textContent = labels[kycState.currentStep] || "Verification Required";
    kycEl.formBadge.className = kycState.currentStep > 1
        ? "rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-300"
        : "rounded-full border border-orange-400/30 bg-orange-400/10 px-4 py-2 text-xs font-black text-orange-300";
}

function updateKycDocType(docType) {
    if (!kycEl.docType) return;
    kycEl.docType.value = docType;

    const isPan = docType === "pan_card";
    const docLabel = isPan ? "PAN" : "Aadhaar";

    // Style the selection buttons
    if (kycEl.docTypeAadhaar && kycEl.docTypePan) {
        if (isPan) {
            kycEl.docTypePan.className = "flex-1 rounded-2xl border border-cyan-400 bg-cyan-400/10 px-5 py-4 text-sm font-black text-cyan-300 transition hover:bg-cyan-400/20 focus:outline-none";
            kycEl.docTypeAadhaar.className = "flex-1 rounded-2xl border border-white/10 bg-slate-950 px-5 py-4 text-sm font-black text-slate-400 transition hover:border-white/20 hover:text-white focus:outline-none";
        } else {
            kycEl.docTypeAadhaar.className = "flex-1 rounded-2xl border border-cyan-400 bg-cyan-400/10 px-5 py-4 text-sm font-black text-cyan-300 transition hover:bg-cyan-400/20 focus:outline-none";
            kycEl.docTypePan.className = "flex-1 rounded-2xl border border-white/10 bg-slate-950 px-5 py-4 text-sm font-black text-slate-400 transition hover:border-white/20 hover:text-white focus:outline-none";
        }
    }

    // Dynamic Main Instruction Panels
    if (kycEl.badgeText) {
        kycEl.badgeText.textContent = `${docLabel} OCR Verification`;
    }
    if (kycEl.mainTitle) {
        kycEl.mainTitle.textContent = `Complete KYC with ${docLabel} Card OCR.`;
    }
    if (kycEl.mainDesc) {
        kycEl.mainDesc.textContent = isPan
            ? "Verify your mobile number with OTP, enter your 10-character PAN Card Number, and upload front photo of your PAN card. The system scans the document automatically to verify your identity."
            : "Verify your mobile number with OTP, enter your 12-digit Aadhaar Card Number, and upload front & back photos of your Aadhaar card. The system scans the document automatically to verify your identity.";
    }
    if (kycEl.step2CardLabel) {
        kycEl.step2CardLabel.textContent = `${docLabel} No`;
    }
    if (kycEl.submitTitle) {
        kycEl.submitTitle.textContent = `Submit ${docLabel} Details`;
    }
    if (kycEl.submitDesc) {
        kycEl.submitDesc.textContent = isPan
            ? "Complete mobile verification and upload front side of your PAN card."
            : "Complete mobile verification and upload front/back sides of your Aadhaar card.";
    }
    if (kycEl.consentText) {
        kycEl.consentText.textContent = `I confirm that this ${docLabel} card belongs to me and that the submitted information is accurate. I understand that false information may restrict account access.`;
    }
    if (kycEl.submittedNumberLabel) {
        kycEl.submittedNumberLabel.textContent = `${docLabel} Card Number`;
    }
    if (kycEl.submittedDetailsDesc) {
        kycEl.submittedDetailsDesc.textContent = `Latest ${docLabel} card verification result.`;
    }
    if (kycEl.approvedMessageText) {
        kycEl.approvedMessageText.textContent = `Your ${docLabel} Card KYC has been verified and approved. Withdrawal access is now enabled.`;
    }
    if (kycEl.pendingMessageText) {
        kycEl.pendingMessageText.textContent = `Your ${docLabel} document verification is processing. The status will update when the OCR verification finishes.`;
    }

    // Update labels and inputs for Step 2
    if (kycEl.step2Title) {
        kycEl.step2Title.textContent = `Step 2: ${docLabel} Card Number`;
    }
    if (kycEl.step2Desc) {
        kycEl.step2Desc.textContent = isPan 
            ? "Please enter your 10-character alphanumeric PAN Card number to proceed." 
            : "Please enter your 12-digit Aadhaar Card number to proceed.";
    }
    if (kycEl.aadhaarNumberLabel) {
        kycEl.aadhaarNumberLabel.textContent = `${docLabel} Card Number`;
    }
    if (kycEl.aadhaarNumber) {
        kycEl.aadhaarNumber.placeholder = isPan ? "ABCDE1234F" : "0000 0000 0000";
        kycEl.aadhaarNumber.maxLength = isPan ? 10 : 14;
    }

    // Update labels and inputs for Step 3
    if (kycEl.step3Title) {
        kycEl.step3Title.textContent = isPan ? "Step 3: Upload PAN Card Photo" : "Step 3: Upload Aadhaar Card Photos";
    }
    if (kycEl.step3Desc) {
        kycEl.step3Desc.textContent = isPan 
            ? "Upload clear front photo of your PAN card. OCR will compare it with the PAN number saved in Step 2 before Step 4 opens." 
            : "Upload clear front and back photos. OCR will compare them with the Aadhaar number saved in Step 2 before Step 4 opens.";
    }
    if (kycEl.documentFrontLabel) {
        kycEl.documentFrontLabel.textContent = `${docLabel} Card Front Side Photo`;
    }
    if (kycEl.documentBackWrapper) {
        if (isPan) {
            kycEl.documentBackWrapper.classList.add("hidden");
        } else {
            kycEl.documentBackWrapper.classList.remove("hidden");
        }
    }
}

function formatAadhaarString(val) {
    if (!val || val === "--") return "--";
    const clean = String(val).replace(/\D/g, "");
    if (clean.length !== 12) return val;
    let formatted = "";
    for (let i = 0; i < clean.length; i++) {
        if (i > 0 && i % 4 === 0) formatted += " ";
        formatted += clean[i];
    }
    return formatted;
}

function setVerificationResult(scan, passed, mode = "documents") {
    const docType = scan?.document_type || kycEl.docType?.value || "aadhaar_card";
    const isPan = docType === "pan_card";
    const docLabel = isPan ? "PAN" : "Aadhaar";

    const numberVal = scan?.document_number || "--";
    const formattedNum = isPan ? String(numberVal).toUpperCase() : formatAadhaarString(numberVal);
    const nameValue = scan?.full_name || (isPan ? "PAN Holder" : "Aadhaar Holder");

    if (kycEl.scanTitle) {
        kycEl.scanTitle.textContent = passed
            ? mode === "selfie" ? "Selfie accepted" : `${docLabel} photo verified`
            : mode === "selfie" ? "Selfie validation failed" : `${docLabel} photo verification failed`;
    }
    if (kycEl.scanText) {
        kycEl.scanText.textContent = passed
            ? mode === "selfie"
                ? "One clear face was detected and all KYC steps were submitted."
                : `The saved ${docLabel} number matched the OCR result and the card photo was verified.`
            : mode === "selfie"
                ? "Upload a clear front-facing selfie containing only one person."
                : `The entered number or front card photo did not match.`;
    }
    if (kycEl.scanDetails && scan) {
        kycEl.scanDetails.classList.remove("hidden");
        kycEl.scanDetails.innerHTML = `
            <div class="grid gap-3 sm:grid-cols-3">
                <div><span class="text-slate-500">Step 3</span><br><strong class="text-white">${passed ? "Verified" : "Failed"}</strong></div>
                <div><span class="text-slate-500">${docLabel} Number</span><br><strong class="text-white">${formattedNum}</strong></div>
                <div><span class="text-slate-500">Extracted Name</span><br><strong class="text-white">${nameValue}</strong></div>
            </div>`;
    }
}

function renderSubmittedKyc(kyc, progress = {}) {
    const isPendingOrApproved = ["approved", "pending", "under_review", "review"].includes(kycState.status);
    const docType = kyc?.document_type || progress?.document_type || kycEl.docType?.value || "aadhaar_card";
    const isPan = docType === "pan_card";
    const docLabel = isPan ? "PAN" : "Aadhaar";

    const fullName = isPendingOrApproved ? (kyc?.full_name || progress?.draft_full_name || "--") : "--";
    
    const numberRaw = kyc?.document_number || kyc?.aadhaar_number || progress?.aadhaar_number || "--";
    const formattedNum = isPan ? String(numberRaw).toUpperCase() : formatAadhaarString(numberRaw);

    if (kycEl.submittedName) kycEl.submittedName.textContent = fullName;
    if (kycEl.submittedNumber) kycEl.submittedNumber.textContent = isPendingOrApproved ? formattedNum : "--";
    if (kycEl.submittedDoc) {
        kycEl.submittedDoc.textContent = isPendingOrApproved 
            ? (kyc?.verification_method === "digilocker" ? "DigiLocker" : `${docLabel} Card OCR`) 
            : "--";
    }

    const scan = isPendingOrApproved ? (kyc?.ocr_result || progress?.draft_scan) : null;
    if (scan && Object.keys(scan).length) {
        kycState.draftScan = scan;
        setVerificationResult(scan, true, "documents");
    } else {
        if (kycEl.scanTitle) kycEl.scanTitle.textContent = "Verification required before submit";
        if (kycEl.scanText) kycEl.scanText.textContent = "Please upload a clear selfie to complete your KYC submission.";
        if (kycEl.scanDetails) {
            kycEl.scanDetails.classList.add("hidden");
            kycEl.scanDetails.innerHTML = "";
        }
    }
}

function setFinalPanels(status) {
    const approved = status === "approved";
    const pending = ["pending", "under_review", "review"].includes(status);
    if (kycEl.approvedMessagePanel) kycEl.approvedMessagePanel.classList.toggle("hidden", !approved);
    if (kycEl.pendingMessagePanel) kycEl.pendingMessagePanel.classList.toggle("hidden", !pending);
    if (approved || pending) {
        if (kycEl.mobilePanel) kycEl.mobilePanel.classList.add("hidden");
        if (kycEl.form) kycEl.form.classList.add("hidden");
        if (kycEl.selfiePanel) kycEl.selfiePanel.classList.add("hidden");
    }
}

function setFormLocked(locked) {
    kycState.locked = Boolean(locked);
    [
        kycEl.aadhaarNumber,
        kycEl.documentFront,
        kycEl.documentBack,
        kycEl.selfie,
        kycEl.consent,
        kycEl.submitBtn,
        kycEl.numberNextBtn,
        kycEl.photosNextBtn,
        kycEl.docTypeAadhaar,
        kycEl.docTypePan,
    ].forEach((node) => {
        if (node) {
            node.disabled = Boolean(locked);
            if (node === kycEl.docTypeAadhaar || node === kycEl.docTypePan) {
                node.style.opacity = locked ? "0.5" : "1";
                node.style.cursor = locked ? "not-allowed" : "pointer";
            }
        }
    });
}

function startOtpCountdown(secondsLeft) {
    if (kycState.otpTimer) clearInterval(kycState.otpTimer);

    function renderTimer() {
        if (secondsLeft <= 0) {
            if (kycEl.mobileOtpTimer) {
                kycEl.mobileOtpTimer.textContent = "Expired";
                kycEl.mobileOtpTimer.className = "rounded-full border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-black text-red-200";
            }
            if (kycEl.verifyOtpBtn) kycEl.verifyOtpBtn.disabled = true;
            if (kycEl.sendOtpBtn) {
                kycEl.sendOtpBtn.disabled = false;
                kycEl.sendOtpBtn.textContent = "Resend OTP";
            }
            clearInterval(kycState.otpTimer);
            return;
        }
        const minutes = Math.floor(secondsLeft / 60);
        const seconds = secondsLeft % 60;
        if (kycEl.mobileOtpTimer) {
            kycEl.mobileOtpTimer.textContent = `Valid ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
            kycEl.mobileOtpTimer.className = "rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-amber-200";
        }
        secondsLeft -= 1;
    }

    if (kycEl.verifyOtpBtn) kycEl.verifyOtpBtn.disabled = false;
    renderTimer();
    kycState.otpTimer = setInterval(renderTimer, 1000);
}

async function handleSendOtp() {
    const mobile = kycEl.mobileNumber?.value.trim() || "";
    if (kycEl.mobileNumberError) kycEl.mobileNumberError.textContent = "";
    if (kycEl.mobileOtpError) kycEl.mobileOtpError.textContent = "";
    if (!/^[6-9]\d{9}$/.test(mobile)) {
        if (kycEl.mobileNumberError) kycEl.mobileNumberError.textContent = "Please enter a valid 10-digit mobile number.";
        return;
    }

    try {
        if (kycEl.mobileDevOtp) kycEl.mobileDevOtp.classList.add("hidden");
        if (kycEl.sendOtpBtn) {
            kycEl.sendOtpBtn.disabled = true;
            kycEl.sendOtpBtn.textContent = "Sending...";
        }
        const response = await apiRequest("/kyc/send-otp", {
            method: "POST",
            body: JSON.stringify({ mobile }),
        });
        kycState.mobileNumber = mobile;
        showKycMessage(response?.message || "OTP sent successfully.", "success");
        if (kycEl.mobileOtpBox) kycEl.mobileOtpBox.classList.remove("hidden");
        if (kycEl.mobileDevOtp && response?.data?.dev_code) {
            kycEl.mobileDevOtp.classList.remove("hidden");
            kycEl.mobileDevOtp.textContent = `Local verification code: ${response.data.dev_code}`;
        }
        startOtpCountdown(response?.data?.expires_seconds || 300);
    } catch (error) {
        showKycMessage(showApiError(error, "Failed to send OTP."), "error");
        if (kycEl.sendOtpBtn) {
            kycEl.sendOtpBtn.disabled = false;
            kycEl.sendOtpBtn.textContent = "Send OTP";
        }
    }
}

async function handleVerifyOtp() {
    const mobile = kycEl.mobileNumber?.value.trim() || kycState.mobileNumber;
    const otp = kycEl.mobileOtp?.value.trim() || "";
    if (kycEl.mobileOtpError) kycEl.mobileOtpError.textContent = "";
    if (!/^\d{6}$/.test(otp)) {
        if (kycEl.mobileOtpError) kycEl.mobileOtpError.textContent = "Please enter a valid 6-digit OTP.";
        return;
    }

    try {
        if (kycEl.verifyOtpBtn) {
            kycEl.verifyOtpBtn.disabled = true;
            kycEl.verifyOtpBtn.textContent = "Verifying...";
        }
        const response = await apiRequest("/kyc/verify-otp", {
            method: "POST",
            body: JSON.stringify({ mobile, otp }),
        });
        if (kycState.otpTimer) clearInterval(kycState.otpTimer);
        kycState.mobileVerified = true;
        kycState.mobileNumber = mobile;
        const nextStep = response?.data?.current_step || 2;
        showKycMessage(response?.message || "Mobile number verified successfully.", "success");
        setWizardStep(nextStep, response?.data?.step_states || null);
    } catch (error) {
        applyApiErrors(error?.errors || {});
        showKycMessage(showApiError(error, "Incorrect OTP. Please try again."), "error");
        if (kycEl.verifyOtpBtn) {
            kycEl.verifyOtpBtn.disabled = false;
            kycEl.verifyOtpBtn.textContent = "Verify";
        }
    }
}

const verhoeffD = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

const verhoeffP = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

function validateVerhoeff(numStr) {
    const clean = numStr.replace(/\D/g, "");
    if (clean.length !== 12) return false;
    if (clean[0] === "0" || clean[0] === "1") return false;
    
    let c = 0;
    const reversed = clean.split("").reverse();
    for (let i = 0; i < reversed.length; i++) {
        c = verhoeffD[c][verhoeffP[i % 8][parseInt(reversed[i], 10)]];
    }
    return c === 0;
}

function validateAadhaarNumber() {
    const docType = kycEl.docType?.value || "aadhaar_card";
    const rawVal = kycEl.aadhaarNumber?.value || "";
    if (kycEl.aadhaarNumberError) kycEl.aadhaarNumberError.textContent = "";

    if (docType === "pan_card") {
        const clean = rawVal.toUpperCase().replace(/\s+/g, "");
        if (clean.length !== 10) {
            if (kycEl.aadhaarNumberError) kycEl.aadhaarNumberError.textContent = "PAN Card number must be exactly 10 characters.";
            return null;
        }
        if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(clean)) {
            if (kycEl.aadhaarNumberError) kycEl.aadhaarNumberError.textContent = "PAN number must be in a valid format. Example: ABCDE1234F.";
            return null;
        }
        return clean;
    } else {
        const clean = rawVal.replace(/\D/g, "");
        if (clean.length !== 12) {
            if (kycEl.aadhaarNumberError) kycEl.aadhaarNumberError.textContent = "Aadhaar Card number must be exactly 12 digits.";
            return null;
        }
        if (clean[0] === "0" || clean[0] === "1") {
            if (kycEl.aadhaarNumberError) kycEl.aadhaarNumberError.textContent = "Aadhaar number cannot start with 0 or 1.";
            return null;
        }
        if (!validateVerhoeff(clean)) {
            if (kycEl.aadhaarNumberError) kycEl.aadhaarNumberError.textContent = "Invalid Aadhaar number. Please enter a valid mathematically verified card number.";
            return null;
        }
        return clean;
    }
}

async function handleSaveAadhaarNumber() {
    const aadhaar = validateAadhaarNumber();
    if (!aadhaar) return;

    const docType = kycEl.docType?.value || "aadhaar_card";
    const docLabel = docType === "pan_card" ? "PAN" : "Aadhaar";

    try {
        if (kycEl.numberNextBtn) {
            kycEl.numberNextBtn.disabled = true;
            kycEl.numberNextBtn.textContent = "Saving...";
        }
        const response = await apiRequest("/kyc/save-aadhaar-number", {
            method: "POST",
            body: JSON.stringify({ 
                aadhaar_number: aadhaar,
                document_type: docType
            }),
        });
        kycState.aadhaarSaved = true;
        showKycMessage(response?.message || `${docLabel} number saved.`, "success");
        setWizardStep(response?.data?.current_step || 3, response?.data?.step_states || null);
        renderSubmittedKyc(null, response?.data || {});
    } catch (error) {
        applyApiErrors(error?.errors || {});
        showKycMessage(showApiError(error, `Unable to save ${docLabel} number.`), "error");
    } finally {
        if (kycEl.numberNextBtn && !kycState.locked) {
            kycEl.numberNextBtn.disabled = false;
            kycEl.numberNextBtn.textContent = "Save & Continue";
        }
    }
}

function validateDocumentFiles() {
    let valid = true;
    const frontFile = kycEl.documentFront?.files?.[0];
    const backFile = kycEl.documentBack?.files?.[0];
    if (kycEl.documentFrontError) kycEl.documentFrontError.textContent = "";
    if (kycEl.documentBackError) kycEl.documentBackError.textContent = "";

    const docType = kycEl.docType?.value || "aadhaar_card";
    const docLabel = docType === "pan_card" ? "PAN Card" : "Aadhaar Card";

    if (!frontFile) {
        if (kycEl.documentFrontError) kycEl.documentFrontError.textContent = `Front side ${docLabel} image is required.`;
        valid = false;
    }
    if (docType === "aadhaar_card" && !backFile) {
        if (kycEl.documentBackError) kycEl.documentBackError.textContent = `Back side ${docLabel} image is required.`;
        valid = false;
    }
    return valid ? { frontFile, backFile } : null;
}

async function handleVerifyDocuments() {
    const documentFiles = validateDocumentFiles();
    if (!documentFiles) return;
    hideKycMessage();

    const docType = kycEl.docType?.value || "aadhaar_card";
    const docLabel = docType === "pan_card" ? "PAN" : "Aadhaar";

    const formData = new FormData();
    formData.append("document_front", documentFiles.frontFile);
    if (docType === "aadhaar_card" && documentFiles.backFile) {
        formData.append("document_back", documentFiles.backFile);
    }

    try {
        if (kycEl.photosNextBtn) {
            kycEl.photosNextBtn.disabled = true;
            kycEl.photosNextBtn.textContent = "Comparing with OCR...";
        }
        const response = await apiRequest("/kyc/verify-documents", {
            method: "POST",
            body: formData,
        });
        const scan = response?.data?.scan || response?.data?.draft_scan || {};
        kycState.documentsVerified = true;
        kycState.draftScan = scan;
        setVerificationResult(scan, true, "documents");
        renderSubmittedKyc(null, response?.data || {});
        
        // Progress to Step 4: Selfie panel
        setWizardStep(response?.data?.current_step || 4, response?.data?.step_states || null);
        showKycMessage(response?.message || `${docLabel} photo verified. Proceed to Selfie.`, "success");
        if (typeof syncUserProfile === "function") await syncUserProfile();
    } catch (error) {
        applyApiErrors(error?.errors || {});
        setVerificationResult(null, false, "documents");
        showKycMessage(showApiError(error, `${docLabel} photo verification failed.`), "error");

        // A number mismatch is the only case where the user may reopen Step 2 for correction.
        if (error?.errors?.aadhaar_number && kycEl.photosBackBtn) {
            kycEl.photosBackBtn.classList.remove("hidden");
            kycEl.photosBackBtn.textContent = "← Correct Aadhaar Number";
        }
    } finally {
        if (kycEl.photosNextBtn && !kycState.locked) {
            kycEl.photosNextBtn.disabled = false;
            kycEl.photosNextBtn.textContent = "Verify Photos & Continue";
        }
    }
}

function validateSelfieStep() {
    if (kycEl.selfieError) kycEl.selfieError.textContent = "";
    if (kycEl.consentError) kycEl.consentError.textContent = "";
    const selfieFile = kycEl.selfie?.files?.[0];
    if (!selfieFile) {
        if (kycEl.selfieError) kycEl.selfieError.textContent = "A selfie photo is required.";
        return null;
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const extension = String(selfieFile.name || "").split(".").pop().toLowerCase();
    if (!allowedTypes.includes(selfieFile.type) || !["jpg", "jpeg", "png", "webp"].includes(extension)) {
        if (kycEl.selfieError) kycEl.selfieError.textContent = "Only JPG, JPEG, PNG or WEBP selfie images are allowed.";
        return null;
    }
    if (selfieFile.size > 10 * 1024 * 1024) {
        if (kycEl.selfieError) kycEl.selfieError.textContent = "Selfie size must be 10 MB or less.";
        return null;
    }
    if (!kycEl.consent?.checked) {
        if (kycEl.consentError) kycEl.consentError.textContent = "Please confirm the declaration before submitting.";
        return null;
    }
    return selfieFile;
}

async function handleKycSubmit(event) {
    event.preventDefault();
    hideKycMessage();
    const selfieFile = validateSelfieStep();
    if (!selfieFile) return;

    const formData = new FormData();
    formData.append("selfie", selfieFile);

    try {
        if (kycEl.submitBtn) {
            kycEl.submitBtn.disabled = true;
            kycEl.submitBtn.textContent = "Checking Selfie...";
        }
        if (kycEl.scanTitle) kycEl.scanTitle.textContent = "Checking for one clear face";
        if (kycEl.scanText) kycEl.scanText.textContent = "Document, scenery, object and group photos will be rejected.";

        const response = await apiRequest("/kyc/submit", {
            method: "POST",
            body: formData,
        });
        const kyc = response?.data?.kyc || null;
        const scan = response?.data?.scan || kyc?.ocr_result || kycState.draftScan || {};
        const status = String(kyc?.status || "pending").toLowerCase();

        setKycStatus(status, kyc?.remark || response?.message || "");
        setVerificationResult(scan, true, "selfie");
        renderSubmittedKyc(kyc, {});
        setFormLocked(true);
        renderStepProgress({ "1": "verified", "2": "verified", "3": "verified", "4": "verified" });
        setFinalPanels(status);
        updateFormBadge();
        showKycMessage(response?.message || "KYC submitted successfully.", "success");

        if (typeof syncUserProfile === "function") await syncUserProfile();
    } catch (error) {
        applyApiErrors(error?.errors || {});
        setVerificationResult(kycState.draftScan, false, "selfie");
        showKycMessage(showApiError(error, "Selfie validation failed."), "error");
        if (kycEl.submitBtn && !kycState.locked) {
            kycEl.submitBtn.disabled = false;
            kycEl.submitBtn.textContent = "Submit Verification";
        }
    }
}

async function loadKycStatus() {
    if (!isLoggedIn()) {
        window.location.href = "./login.html";
        return;
    }

    try {
        const response = await apiRequest("/kyc/status");
        const data = response?.data || {};
        const status = String(data.kyc_status || "not_submitted").toLowerCase();
        const kyc = data.kyc || null;

        kycState.mobileVerified = data.mobile_verified === true;
        kycState.mobileNumber = data.mobile_number || "";
        kycState.aadhaarSaved = data.aadhaar_number_saved === true;

        const floatingBar = document.getElementById("kycFloatingContinueBar");
        if (floatingBar) {
            floatingBar.classList.add("hidden");
            floatingBar.style.display = "none";
        }
        kycState.documentsVerified = data.documents_verified === true;
        kycState.draftScan = data.draft_scan || null;

        if (kycEl.mobileNumber) kycEl.mobileNumber.value = data.mobile_number || "";
        const docType = data.document_type || "aadhaar_card";
        updateKycDocType(docType);

        if (kycEl.aadhaarNumber) {
            if (docType === "pan_card") {
                kycEl.aadhaarNumber.value = String(data.aadhaar_number || "").toUpperCase().replace(/\s+/g, "");
            } else {
                const rawNumber = String(data.aadhaar_number || "").replace(/\D/g, "");
                let formatted = "";
                for (let i = 0; i < rawNumber.length; i++) {
                    if (i > 0 && i % 4 === 0) formatted += " ";
                    formatted += rawNumber[i];
                }
                kycEl.aadhaarNumber.value = formatted;
            }
        }

        setKycStatus(status, kyc?.reject_reason || kyc?.remark || data.kyc_status_message || "");
        renderSubmittedKyc(kyc, data);

        const finalStatus = status === "approved" || ["pending", "under_review", "review"].includes(status);
        setFormLocked(finalStatus);
        setFinalPanels(status);

        if (!finalStatus) {
            if (status === "rejected" && !kycState.mobileVerified) {
                setWizardStep(1, { "1": "current", "2": "locked", "3": "locked", "4": "locked" });
            } else {
                setWizardStep(data.current_step || (kycState.mobileVerified ? 2 : 1), data.step_states || null);
                if (kycState.documentsVerified && kycState.draftScan) setVerificationResult(kycState.draftScan, true, "documents");
            }
        } else {
            renderStepProgress(data.step_states || { "1": "verified", "2": "verified", "3": "verified", "4": "verified" });
            updateFormBadge();
            if (status === "approved") returnAfterWithdrawalKyc();
        }
    } catch (error) {
        showKycMessage(showApiError(error, "Unable to load KYC status."), "error");
    }
}

let activeStream = null;

async function openSelfieCamera() {
    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Camera requires localhost or HTTPS and browser camera permission.");
        }
        try {
            activeStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
                audio: false,
            });
        } catch (_error) {
            activeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        const video = document.getElementById("kycCameraVideo");
        if (video) {
            video.srcObject = activeStream;
            await video.play();
        }
        document.getElementById("kycCameraModal")?.classList.remove("hidden");
    } catch (error) {
        showKycMessage(`Unable to access camera. ${error.message} You can use Choose File instead.`, "error");
    }
}

function closeSelfieCamera() {
    if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
        activeStream = null;
    }
    document.getElementById("kycCameraModal")?.classList.add("hidden");
}

function captureSelfie() {
    const video = document.getElementById("kycCameraVideo");
    const canvas = document.getElementById("kycCameraCanvas");
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
        showKycMessage("Camera is not ready yet. Please try capture again.", "error");
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
        if (!blob) {
            showKycMessage("Unable to capture selfie. Please try again.", "error");
            return;
        }
        const file = new File([blob], "live_selfie.jpg", { type: "image/jpeg" });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        if (kycEl.selfie) {
            kycEl.selfie.files = transfer.files;
            kycEl.selfie.dispatchEvent(new Event("change", { bubbles: true }));
        }
        closeSelfieCamera();
        showKycMessage("Live selfie captured. Submit it for face validation.", "success");
    }, "image/jpeg", 0.92);
}

function loadDigioScript(environment) {
    return new Promise((resolve, reject) => {
        const scriptId = "digio-sdk-script";
        if (document.getElementById(scriptId)) {
            resolve();
            return;
        }
        const script = document.createElement("script");
        script.id = scriptId;
        script.type = "text/javascript";
        script.src = environment.toLowerCase() === "production"
            ? "https://app.digio.in/sdk/v11/digio.js"
            : "https://ext.digio.in/sdk/v11/digio.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Digio SDK script."));
        document.head.appendChild(script);
    });
}

async function handleOpenDigioKyc() {
    const openBtn = document.getElementById("kycOpenDigioBtn");
    if (openBtn) {
        openBtn.disabled = true;
        openBtn.textContent = "Initiating...";
    }
    try {
        const response = await apiRequest("/kyc/start-digio", {
            method: "POST"
        });
        const data = response?.data || {};
        const kid = data.kid;
        const accessToken = data.access_token;
        const environment = data.environment || "sandbox";
        const customerIdentifier = data.customer_identifier || kycState.mobileNumber || "user@traidiumx.com";
        
        await loadDigioScript(environment);
        


        if (openBtn) {
            openBtn.textContent = "Connecting to DigiLocker...";
        }
        
        const options = {
            environment: environment,
            is_iframe: true,
            callback: async function(res) {
                if (kycState.digioPollInterval) {
                    clearInterval(kycState.digioPollInterval);
                    kycState.digioPollInterval = null;
                }
                // Close and remove the Digio iframe popup overlay
                document.querySelectorAll("iframe").forEach(iframe => {
                    if (iframe.src.includes("digio.in")) {
                        const parent = iframe.parentElement;
                        if (parent && parent !== document.body) {
                            parent.remove();
                        } else {
                            iframe.remove();
                        }
                    }
                });

                const floatingBar = document.getElementById("kycFloatingContinueBar");
                if (floatingBar) {
                    floatingBar.classList.add("hidden");
                    floatingBar.style.display = "none";
                }
                if (res.hasOwnProperty("error_code")) {
                    if (openBtn) {
                        openBtn.textContent = "Checking completed steps...";
                    }
                    try {
                        await apiRequest("/kyc/complete-digio", {
                            method: "POST"
                        });
                        showKycMessage("KYC verification completed successfully!", "success");
                        await loadKycStatus();
                        return;
                    } catch (err) {
                        showKycMessage(showApiError(err, "Failed to complete DigiLocker authentication"), "error");
                        if (openBtn) {
                            openBtn.disabled = false;
                            openBtn.textContent = "Open DigiLocker ›";
                        }
                        return;
                    }
                }
                
                if (openBtn) {
                    openBtn.textContent = "Verifying details...";
                }
                
                try {
                    const completeRes = await apiRequest("/kyc/complete-digio", {
                        method: "POST"
                    });
                    showKycMessage("KYC verification completed successfully!", "success");
                    await loadKycStatus();
                } catch (err) {
                    showKycMessage(showApiError(err, "Failed to complete KYC verification on backend."), "error");
                    if (openBtn) {
                        openBtn.disabled = false;
                        openBtn.textContent = "Open DigiLocker ›";
                    }
                }
            },
            logo: "/assets/images/logo.png",
            theme: {
                primaryColor: "#f59e0b",
                secondaryColor: "#020617"
            }
        };
        
        const digioObj = new Digio(options);
        digioObj.init();
        digioObj.submit(kid, customerIdentifier, accessToken);

        // Silent background polling to detect completion when callback is stuck or delayed in Sandbox
        if (kycState.digioPollInterval) clearInterval(kycState.digioPollInterval);
        let checkCount = 0;
        kycState.digioPollInterval = setInterval(async () => {
            checkCount++;
            if (checkCount > 60) { // 3 minutes max polling
                clearInterval(kycState.digioPollInterval);
                kycState.digioPollInterval = null;
                return;
            }

            // Check if Digio iframe is still in DOM
            let hasIframe = false;
            document.querySelectorAll("iframe").forEach(iframe => {
                if (iframe.src.includes("digio.in")) {
                    hasIframe = true;
                }
            });
            if (!hasIframe) {
                clearInterval(kycState.digioPollInterval);
                kycState.digioPollInterval = null;
                return;
            }

            try {
                const response = await apiRequest("/kyc/complete-digio", {
                    method: "POST"
                });
                if (response && (response.success === true || response.message?.includes("successfully"))) {
                    clearInterval(kycState.digioPollInterval);
                    kycState.digioPollInterval = null;

                    document.querySelectorAll("iframe").forEach(iframe => {
                        if (iframe.src.includes("digio.in")) {
                            const parent = iframe.parentElement;
                            if (parent && parent !== document.body) {
                                parent.remove();
                            } else {
                                iframe.remove();
                            }
                        }
                    });

                    showKycMessage("KYC verification completed successfully!", "success");
                    await loadKycStatus();
                }
            } catch (err) {
                // Ignore silent API check errors while processing is incomplete
            }
        }, 3000);
    } catch (error) {
        showKycMessage(showApiError(error, "Failed to initiate DigiLocker session."), "error");
        if (openBtn) {
            openBtn.disabled = false;
            openBtn.textContent = "Open DigiLocker ›";
        }
    }
}

function initKycPage() {
    if (!kycEl.statusText && !kycEl.form) return;

    kycEl.sendOtpBtn?.addEventListener("click", handleSendOtp);
    kycEl.verifyOtpBtn?.addEventListener("click", handleVerifyOtp);
    document.getElementById("kycOpenDigioBtn")?.addEventListener("click", handleOpenDigioKyc);
    kycEl.mobileNumber?.addEventListener("input", () => {
        kycEl.mobileNumber.value = kycEl.mobileNumber.value.replace(/\D/g, "").slice(0, 10);
        if (kycEl.mobileNumberError) kycEl.mobileNumberError.textContent = "";
    });

    clearKycErrors();
    loadKycStatus();
}

document.addEventListener("DOMContentLoaded", initKycPage);

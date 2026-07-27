document.addEventListener("DOMContentLoaded", function () {
    initPasswordToggles();
    initRememberedLoginEmail();
    showAuthExpiredNoticeIfNeeded();

    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const forgotRequestForm = document.getElementById("forgotPasswordRequestForm");
    const forgotCodeForm = document.getElementById("forgotPasswordCodeForm");
    const resetPasswordForm = document.getElementById("resetPasswordForm");
    const verifyRegisterCodeBtn = document.getElementById("registerVerifyCodeBtn");
    const resendRegisterCodeBtn = document.getElementById("registerResendCodeBtn");
    const registerVerificationCode = document.getElementById("registerVerificationCode");
    const forgotResetCode = document.getElementById("forgotResetCode");
    const forgotChangeEmailBtn = document.getElementById("forgotChangeEmailBtn");

    initForgotPasswordPage();

    if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
    }

    if (registerForm) {
        prefillReferralFromUrl();
        registerForm.addEventListener("submit", handleRegister);
        initGoogleSignup();
    }

    if (verifyRegisterCodeBtn) {
        verifyRegisterCodeBtn.addEventListener("click", handleRegisterCodeVerify);
    }

    if (resendRegisterCodeBtn) {
        resendRegisterCodeBtn.addEventListener("click", handleRegister);
    }

    if (registerVerificationCode) {
        registerVerificationCode.addEventListener("input", function () {
            registerVerificationCode.value = registerVerificationCode.value.replace(/\D/g, "").slice(0, 6);
        });

        registerVerificationCode.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                handleRegisterCodeVerify();
            }
        });
    }

    if (forgotRequestForm) {
        forgotRequestForm.addEventListener("submit", handleForgotPasswordRequest);
    }

    if (forgotCodeForm) {
        forgotCodeForm.addEventListener("submit", handleForgotPasswordCodeVerify);
    }

    if (forgotResetCode) {
        forgotResetCode.addEventListener("input", function () {
            forgotResetCode.value = forgotResetCode.value.replace(/\D/g, "").slice(0, 6);
        });
    }

    if (forgotChangeEmailBtn) {
        forgotChangeEmailBtn.addEventListener("click", function () {
            showForgotPasswordStep("request");
            showAuthMessage("Enter your email again to receive a new reset code.", "success", 5000);
        });
    }

    if (resetPasswordForm) {
        resetPasswordForm.addEventListener("submit", handlePasswordReset);
    }
});


let pendingEmailRegistration = {
    pendingId: "",
    email: "",
    maskedEmail: "",
    expiresSeconds: 120,
    expiresAt: 0,
    resendRemaining: null,
    resendLimit: 3,
    resendLimitMinutes: 30,
    resendLockedUntil: 0
};

let registerVerificationTimerInterval = null;
let registerResendLimitTimerInterval = null;

function formatRegisterCountdown(seconds) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function stopRegisterVerificationCountdown() {
    if (registerVerificationTimerInterval) {
        clearInterval(registerVerificationTimerInterval);
        registerVerificationTimerInterval = null;
    }
}

function startRegisterVerificationCountdown() {
    const timer = document.getElementById("registerVerificationTimer");
    const verifyButton = document.getElementById("registerVerifyCodeBtn");

    stopRegisterVerificationCountdown();

    function renderCountdown() {
        if (!timer || !pendingEmailRegistration.expiresAt) {
            return;
        }

        const secondsLeft = Math.max(0, Math.ceil((pendingEmailRegistration.expiresAt - Date.now()) / 1000));

        if (secondsLeft <= 0) {
            timer.textContent = "Expired";
            timer.classList.remove("text-amber-200");
            timer.classList.add("text-red-200", "border-red-400/30", "bg-red-400/10");

            if (verifyButton) {
                verifyButton.disabled = true;
                verifyButton.classList.add("opacity-60", "cursor-not-allowed");
            }

            stopRegisterVerificationCountdown();
            return;
        }

        timer.textContent = `Valid ${formatRegisterCountdown(secondsLeft)}`;
        timer.classList.remove("text-red-200", "border-red-400/30", "bg-red-400/10");
        timer.classList.add("text-amber-200");

        if (verifyButton) {
            verifyButton.disabled = false;
            verifyButton.classList.remove("opacity-60", "cursor-not-allowed");
        }
    }

    renderCountdown();
    registerVerificationTimerInterval = setInterval(renderCountdown, 1000);
}


function parseRegisterBackendTime(value) {
    const timestamp = Date.parse(value || "");
    return Number.isFinite(timestamp) ? timestamp : 0;
}


function stopRegisterResendLimitCountdown() {
    if (registerResendLimitTimerInterval) {
        clearInterval(registerResendLimitTimerInterval);
        registerResendLimitTimerInterval = null;
    }
}


function getRegisterResendButtons() {
    return [
        document.getElementById("registerResendCodeBtn"),
        document.getElementById("registerSubmitBtn")
    ].filter(Boolean);
}


function setRegisterResendButtonsDisabled(isDisabled) {
    getRegisterResendButtons().forEach(function (button) {
        if (isDisabled) {
            button.disabled = true;
            button.classList.add("opacity-60", "cursor-not-allowed");
        } else {
            button.disabled = false;
            button.classList.remove("opacity-60", "cursor-not-allowed");
        }
    });
}


function renderRegisterResendLimitState() {
    const resendButton = document.getElementById("registerResendCodeBtn");
    const submitButton = document.getElementById("registerSubmitBtn");
    const remaining = Number(pendingEmailRegistration.resendRemaining);
    const lockedUntil = Number(pendingEmailRegistration.resendLockedUntil || 0);
    const secondsLeft = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
    const isLocked = remaining <= 0 && lockedUntil && secondsLeft > 0;

    if (isLocked) {
        const waitText = `Wait ${formatRegisterCountdown(secondsLeft)}`;

        setRegisterResendButtonsDisabled(true);

        if (resendButton) {
            resendButton.textContent = waitText;
        }

        if (submitButton && pendingEmailRegistration.pendingId) {
            submitButton.textContent = "Resend locked";
        }

        setFieldError(
            "registerVerificationError",
            `You used all ${pendingEmailRegistration.resendLimit || 3} code sends. Please try again after ${formatRegisterCountdown(secondsLeft)}.`
        );
        return true;
    }

    stopRegisterResendLimitCountdown();
    setRegisterResendButtonsDisabled(false);

    if (resendButton) {
        if (Number.isFinite(remaining) && remaining >= 0) {
            resendButton.textContent = `Resend (${remaining} left)`;
        } else {
            resendButton.textContent = "Resend";
        }
    }

    if (submitButton && pendingEmailRegistration.pendingId) {
        submitButton.textContent = "Resend Verification Code";
    }

    return false;
}


function startRegisterResendLimitCountdown() {
    stopRegisterResendLimitCountdown();

    if (renderRegisterResendLimitState()) {
        registerResendLimitTimerInterval = setInterval(renderRegisterResendLimitState, 1000);
    }
}


function registerResendBlockedForCurrentEmail(email) {
    if (!pendingEmailRegistration.pendingId || pendingEmailRegistration.email !== email) {
        return "";
    }

    const remaining = Number(pendingEmailRegistration.resendRemaining);
    const lockedUntil = Number(pendingEmailRegistration.resendLockedUntil || 0);
    const secondsLeft = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));

    if (remaining <= 0 && lockedUntil && secondsLeft > 0) {
        return `You used all ${pendingEmailRegistration.resendLimit || 3} code sends. Please try again after ${formatRegisterCountdown(secondsLeft)}.`;
    }

    return "";
}


function applyRegisterRateLimitFromError(error) {
    const retryAfterSeconds = Number(error?.errors?.retry_after_seconds || 0);

    if (!retryAfterSeconds) {
        return;
    }

    pendingEmailRegistration.resendRemaining = 0;
    pendingEmailRegistration.resendLimitMinutes = Number(error?.errors?.resend_limit_minutes || pendingEmailRegistration.resendLimitMinutes || 30);
    pendingEmailRegistration.resendLockedUntil = Date.now() + (retryAfterSeconds * 1000);
    startRegisterResendLimitCountdown();
}


function prefillReferralFromUrl() {
    const referralInput = document.getElementById("registerReferral");

    if (!referralInput) {
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("ref") || params.get("referral") || "";

    if (code) {
        referralInput.value = normalizeReferralCode(code);
    }
}


function initPasswordToggles() {
    const buttons = document.querySelectorAll("[data-toggle-password]");

    buttons.forEach(function (button) {
        if (button.dataset.boundToggle === "true") {
            return;
        }

        button.dataset.boundToggle = "true";

        button.addEventListener("click", function () {
            const inputId = button.getAttribute("data-toggle-password");
            const input = document.getElementById(inputId);

            if (!input) {
                return;
            }

            const showPassword = input.type === "password";
            input.type = showPassword ? "text" : "password";
            button.textContent = showPassword ? "Hide" : "Show";
        });
    });
}


function initRememberedLoginEmail() {
    const emailInput = document.getElementById("loginEmail");
    const rememberInput = document.getElementById("rememberMe");

    if (!emailInput || !rememberInput) {
        return;
    }

    const rememberedEmail = localStorage.getItem("traidiumx_remembered_email") || "";

    if (rememberedEmail) {
        emailInput.value = rememberedEmail;
        rememberInput.checked = true;
    }
}


function showAuthExpiredNoticeIfNeeded() {
    const params = new URLSearchParams(window.location.search);

    if (params.get("expired") === "1") {
        showAuthMessage("Your session expired. Please login again to continue.", "error", 6000);
    }
}


function showAuthMessage(message, type = "error", timeout = 3500) {
    const messageBox = document.getElementById("authMessage");

    if (!messageBox) {
        console[type === "success" ? "log" : "error"](message);
        return;
    }

    const isSuccess = type === "success";

    messageBox.textContent = message;
    messageBox.className = [
        "rounded-2xl",
        "border",
        "px-4",
        "py-3",
        "text-sm",
        "font-bold",
        isSuccess ? "border-emerald-400/30" : "border-red-400/30",
        isSuccess ? "bg-emerald-400/10" : "bg-red-400/10",
        isSuccess ? "text-emerald-300" : "text-red-300"
    ].join(" ");

    window.clearTimeout(messageBox.dataset.hideTimer);
    messageBox.dataset.hideTimer = window.setTimeout(function () {
        messageBox.classList.add("hidden");
    }, timeout);
}


function setButtonLoading(button, isLoading, loadingText = "Please wait...") {
    if (!button) {
        return;
    }

    if (isLoading) {
        button.dataset.originalText = button.textContent.trim();
        button.textContent = loadingText;
        button.disabled = true;
        button.classList.add("opacity-80", "cursor-not-allowed");
    } else {
        button.textContent = button.dataset.originalText || button.textContent;
        button.disabled = false;
        button.classList.remove("opacity-80", "cursor-not-allowed");
    }
}


function setFieldError(id, message = "") {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = message;
    }
}


function clearLoginErrors() {
    setFieldError("loginEmailError", "");
    setFieldError("loginPasswordError", "");
}


function clearRegisterErrors() {
    [
        "registerMobileError",
        "registerEmailError",
        "registerPasswordError",
        "registerConfirmPasswordError",
        "registerAgreeError",
        "registerVerificationError"
    ].forEach(function (id) {
        setFieldError(id, "");
    });
}


function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}


function normalizeReferralCode(code) {
    return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}


function getSafePostLoginRedirect() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || "";

    if (!next) {
        return "/";
    }

    if (next.startsWith("http://") || next.startsWith("https://") || next.startsWith("//")) {
        return "/";
    }

    if (next.includes("login.html")) {
        return "/";
    }

    return next.startsWith("/") ? next : `/${next}`;
}


async function handleLogin(event) {
    event.preventDefault();
    clearLoginErrors();

    const form = event.target;
    const submitButton = form.querySelector("button[type='submit']");

    const email = document.getElementById("loginEmail")?.value.trim().toLowerCase();
    const password = document.getElementById("loginPassword")?.value || "";
    const rememberMe = document.getElementById("rememberMe")?.checked || false;

    let hasError = false;
    const isClientID = /^\d{6}$/.test(email);

    if (!email) {
        setFieldError("loginEmailError", "Email address or Client ID is required.");
        hasError = true;
    } else if (!isClientID && !isValidEmail(email)) {
        setFieldError("loginEmailError", "Enter a valid email address or 6-digit Client ID.");
        hasError = true;
    }

    if (!password) {
        setFieldError("loginPasswordError", "Password is required.");
        hasError = true;
    }

    if (hasError) {
        showAuthMessage("Please correct the highlighted fields.");
        return;
    }

    try {
        setButtonLoading(submitButton, true, "Logging in...");

        const response = await apiRequest("/auth/login", {
            method: "POST",
            body: JSON.stringify({
                email: email,
                password: password
            })
        });

        const token = response?.data?.token;
        const user = response?.data?.user;

        if (!token || !user) {
            throw {
                message: "Login response is missing token or user data."
            };
        }

        saveAuthData(token, user);

        if (rememberMe) {
            localStorage.setItem("traidiumx_remembered_email", email);
        } else {
            localStorage.removeItem("traidiumx_remembered_email");
        }

        showAuthMessage("Login successful. Redirecting...", "success");

        setTimeout(function () {
            window.location.href = getSafePostLoginRedirect();
        }, 650);

    } catch (error) {
        const errorMessage = showApiError(error, "Login failed. Please check your email and password.");
        showAuthMessage(errorMessage);
    } finally {
        setButtonLoading(submitButton, false);
    }
}


function getRegistrationFormPayload() {
    return {
        name: "",
        email: document.getElementById("registerEmail")?.value.trim().toLowerCase() || "",
        mobile: document.getElementById("registerMobile")?.value.trim() || "",
        password: document.getElementById("registerPassword")?.value || "",
        confirmPassword: document.getElementById("registerConfirmPassword")?.value || "",
        referralCode: normalizeReferralCode(document.getElementById("registerReferral")?.value || ""),
        agree: document.getElementById("registerAgree")?.checked || false
    };
}


function validateRegistrationPayload(payload) {
    clearRegisterErrors();

    let hasError = false;

    if (!payload.email) {
        setFieldError("registerEmailError", "Email address is required.");
        hasError = true;
    } else if (!isValidEmail(payload.email)) {
        setFieldError("registerEmailError", "Enter a valid email address.");
        hasError = true;
    }

    if (!/^[0-9]{10}$/.test(payload.mobile || "")) {
        setFieldError("registerMobileError", "Mobile number must be exactly 10 digits.");
        hasError = true;
    }

    if (!payload.password) {
        setFieldError("registerPasswordError", "Password is required.");
        hasError = true;
    }

    if (!payload.confirmPassword) {
        setFieldError("registerConfirmPasswordError", "Confirm password is required.");
        hasError = true;
    } else if (payload.password !== payload.confirmPassword) {
        setFieldError("registerConfirmPasswordError", "Password and confirm password do not match.");
        hasError = true;
    }

    if (!payload.agree) {
        setFieldError("registerAgreeError", "Please accept the Terms and Risk Disclosure.");
        hasError = true;
    }

    if (hasError) {
        showAuthMessage("Please correct the highlighted fields.");
        return false;
    }

    return true;
}


function showRegisterVerificationBox(responseData = {}) {
    const verificationBox = document.getElementById("registerVerificationBox");
    const info = document.getElementById("registerVerificationInfo");
    const timer = document.getElementById("registerVerificationTimer");
    const codeInput = document.getElementById("registerVerificationCode");
    const devCode = document.getElementById("registerDevCode");
    const submitButton = document.getElementById("registerSubmitBtn");

    const expiresSeconds = Number(responseData.expires_seconds || 120) || 120;

    pendingEmailRegistration = {
        pendingId: responseData.pending_id || "",
        email: responseData.email || "",
        maskedEmail: responseData.masked_email || responseData.email || "your email",
        expiresSeconds: expiresSeconds,
        expiresAt: Date.now() + (expiresSeconds * 1000),
        resendRemaining: Number(responseData.resend_remaining),
        resendLimit: Number(responseData.resend_limit || 3),
        resendLimitMinutes: Number(responseData.resend_limit_minutes || 30),
        resendLockedUntil: parseRegisterBackendTime(responseData.resend_locked_until)
    };

    if (verificationBox) {
        verificationBox.classList.remove("hidden");
    }

    if (info) {
        info.textContent = `We sent a 6 digit verification code to ${pendingEmailRegistration.maskedEmail}. Enter it below to create your account.`;
    }

    if (timer) {
        timer.textContent = `Valid ${formatRegisterCountdown(pendingEmailRegistration.expiresSeconds)}`;
    }

    startRegisterVerificationCountdown();

    if (codeInput) {
        codeInput.value = "";
        codeInput.focus();
    }

    if (submitButton) {
        submitButton.textContent = "Resend Verification Code";
    }

    startRegisterResendLimitCountdown();

    if (devCode) {
        if (responseData.dev_code) {
            devCode.classList.remove("hidden");
            devCode.textContent = `Local development code: ${responseData.dev_code}`;
        } else {
            devCode.classList.add("hidden");
            devCode.textContent = "";
        }
    }
}


async function handleRegister(event) {
    if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
    }

    const form = document.getElementById("registerForm");
    const submitButton = document.getElementById("registerSubmitBtn") || form?.querySelector("button[type='submit']");
    const payload = getRegistrationFormPayload();

    if (!validateRegistrationPayload(payload)) {
        return;
    }

    const blockedMessage = registerResendBlockedForCurrentEmail(payload.email);
    if (blockedMessage) {
        setFieldError("registerVerificationError", blockedMessage);
        showAuthMessage(blockedMessage, "error", 9000);
        startRegisterResendLimitCountdown();
        return;
    }

    try {
        setButtonLoading(submitButton, true, pendingEmailRegistration.pendingId ? "Resending code..." : "Sending code...");

        const response = await apiRequest("/auth/register/request-code", {
            method: "POST",
            body: JSON.stringify({
                name: payload.name,
                email: payload.email,
                mobile: payload.mobile,
                password: payload.password,
                confirm_password: payload.confirmPassword,
                referral_code: payload.referralCode
            })
        });

        const responseData = response?.data || {};
        showRegisterVerificationBox(responseData);

        if (responseData.email_sent === true) {
            showAuthMessage("Verification code sent. Please check Inbox, Spam or Promotions folder.", "success", 9000);
        } else if (responseData.dev_code) {
            showAuthMessage("Email SMTP is not configured. Use the local development code shown below.", "success", 9000);
        } else {
            showAuthMessage(responseData.email_delivery_note || "Verification code prepared. Check SMTP email settings.", "success", 9000);
        }

    } catch (error) {
        applyRegisterRateLimitFromError(error);
        showAuthMessage(showApiError(error, "Could not send verification code."), "error", 9000);
    } finally {
        setButtonLoading(submitButton, false);

        if (pendingEmailRegistration.pendingId && submitButton) {
            submitButton.textContent = "Resend Verification Code";
        }

        if (pendingEmailRegistration.pendingId) {
            renderRegisterResendLimitState();
        }
    }
}


async function handleRegisterCodeVerify() {
    clearRegisterErrors();

    const verifyButton = document.getElementById("registerVerifyCodeBtn");
    const codeInput = document.getElementById("registerVerificationCode");
    const code = codeInput?.value.trim() || "";

    if (!pendingEmailRegistration.pendingId || !pendingEmailRegistration.email) {
        setFieldError("registerVerificationError", "Please request a verification code first.");
        showAuthMessage("Please request a verification code first.");
        return;
    }

    if (pendingEmailRegistration.expiresAt && Date.now() > pendingEmailRegistration.expiresAt) {
        setFieldError("registerVerificationError", "Verification code expired. Please resend a new code.");
        showAuthMessage("Verification code expired. Please resend a new code.");
        return;
    }

    if (!/^\d{6}$/.test(code)) {
        setFieldError("registerVerificationError", "Enter the 6 digit code sent to your email.");
        showAuthMessage("Enter valid 6 digit verification code.");
        return;
    }

    try {
        setButtonLoading(verifyButton, true, "Verifying...");

        const response = await apiRequest("/auth/register/verify", {
            method: "POST",
            body: JSON.stringify({
                pending_id: pendingEmailRegistration.pendingId,
                email: pendingEmailRegistration.email,
                code: code
            })
        });

        stopRegisterVerificationCountdown();
        handleSuccessfulAuth(response, "Email verified. Account created successfully. Redirecting...");

    } catch (error) {
        const message = showApiError(error, "Verification failed.");
        setFieldError("registerVerificationError", message);
        showAuthMessage(message);
    } finally {
        setButtonLoading(verifyButton, false);
    }
}


function handleSuccessfulAuth(response, message) {
    const token = response?.data?.token;
    const user = response?.data?.user;

    if (!token || !user) {
        throw {
            message: "Authentication response is missing token or user data."
        };
    }

    saveAuthData(token, user);
    showAuthMessage(message, "success");

    setTimeout(function () {
        window.location.href = "/";
    }, 850);
}


async function initGoogleSignup() {
    const buttonContainer = document.getElementById("googleSignupButton");
    const statusElement = document.getElementById("googleSignupStatus");

    if (!buttonContainer) {
        return;
    }

    try {
        showGoogleSignupStatus(statusElement, "Loading Google sign-up...");

        const response = await apiRequest("/auth/google/config");
        const config = response?.data || {};

        if (!config.enabled || !config.client_id) {
            buttonContainer.classList.add("hidden");
            showGoogleSignupStatus(statusElement, "Google sign-up is not configured yet. Use email sign-up.");
            return;
        }

        waitForGoogleIdentity(function () {
            window.google.accounts.id.initialize({
                client_id: config.client_id,
                callback: handleGoogleCredentialResponse,
                auto_select: false,
                cancel_on_tap_outside: true,
                use_fedcm_for_prompt: true
            });

            renderGoogleSignupButton(buttonContainer, statusElement);
        });

    } catch (error) {
        buttonContainer.classList.add("hidden");
        showGoogleSignupStatus(statusElement, "Google sign-up configuration could not be loaded. Use email sign-up.");
    }
}


function renderGoogleSignupButton(buttonContainer, statusElement) {
    buttonContainer.className = "w-full";
    buttonContainer.innerHTML = `
        <div id="googleOfficialButton" class="flex min-h-[44px] w-full items-center justify-center"></div>
        <button id="googleManualButton" type="button" class="hidden min-h-[44px] w-full items-center justify-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 shadow-lg shadow-cyan-500/10 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-cyan-400/20">
            <span class="grid h-6 w-6 place-items-center rounded-full bg-white text-base font-black text-blue-600">G</span>
            <span>Continue with Google</span>
        </button>
    `;

    const officialButton = document.getElementById("googleOfficialButton");
    const manualButton = document.getElementById("googleManualButton");

    if (officialButton) {
        try {
            window.google.accounts.id.renderButton(officialButton, {
                type: "standard",
                theme: "outline",
                size: "large",
                text: "continue_with",
                shape: "pill",
                logo_alignment: "left",
                width: Math.min(buttonContainer.clientWidth || 380, 420)
            });
        } catch (error) {
            showManualGoogleSignupButton(manualButton, officialButton, statusElement, "Google button could not render. Use the fallback button below.");
            return;
        }
    }

    window.setTimeout(function () {
        const rendered = officialButton && officialButton.querySelector("iframe");

        if (rendered) {
            hideGoogleSignupStatus(statusElement);
            buttonContainer.classList.remove("hidden");
            return;
        }

        showManualGoogleSignupButton(manualButton, officialButton, statusElement, "Google button was blocked by the browser. Use the fallback button below.");
    }, 900);
}


function showManualGoogleSignupButton(manualButton, officialButton, statusElement, message) {
    if (officialButton) {
        officialButton.classList.add("hidden");
    }

    if (!manualButton) {
        showGoogleSignupStatus(statusElement, message || "Google sign-up could not be displayed. Use email sign-up.");
        return;
    }

    manualButton.classList.remove("hidden");
    manualButton.classList.add("flex");

    if (manualButton.dataset.googleFallbackBound !== "true") {
        manualButton.dataset.googleFallbackBound = "true";
        manualButton.addEventListener("click", function () {
            openGoogleSignupPrompt(manualButton, statusElement);
        });
    }

    showGoogleSignupStatus(statusElement, message || "Continue with Google is ready.");
}


function openGoogleSignupPrompt(button, statusElement) {
    clearRegisterErrors();

    const agree = document.getElementById("registerAgree")?.checked || false;

    if (!agree) {
        setFieldError("registerAgreeError", "Please accept the Terms and Risk Disclosure before using Google sign-up.");
        showAuthMessage("Please accept the Terms and Risk Disclosure.");
        return;
    }

    if (!window.google?.accounts?.id) {
        showGoogleSignupStatus(statusElement, "Google sign-up script is not loaded. Refresh the page and try again.");
        return;
    }

    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span>Opening Google...</span>`;
    showGoogleSignupStatus(statusElement, "Opening Google account chooser...");

    try {
        window.google.accounts.id.prompt(function (notification) {
            button.disabled = false;
            button.innerHTML = originalText;

            if (!notification) {
                return;
            }

            if (notification.isNotDisplayed && notification.isNotDisplayed()) {
                showGoogleSignupStatus(statusElement, "Google prompt was not displayed. Check the OAuth Client ID origin and browser pop-up/privacy settings.");
            } else if (notification.isSkippedMoment && notification.isSkippedMoment()) {
                showGoogleSignupStatus(statusElement, "Google prompt was skipped. Try again or use email sign-up.");
            } else {
                hideGoogleSignupStatus(statusElement);
            }
        });
    } catch (error) {
        button.disabled = false;
        button.innerHTML = originalText;
        showGoogleSignupStatus(statusElement, "Google sign-up could not be opened. Use email sign-up or refresh the page.");
    }
}


function showGoogleSignupStatus(statusElement, message) {
    if (!statusElement) {
        return;
    }

    statusElement.textContent = message || "";
    statusElement.classList.toggle("hidden", !message);
}


function hideGoogleSignupStatus(statusElement) {
    showGoogleSignupStatus(statusElement, "");
}


function waitForGoogleIdentity(callback, attempt = 0) {
    if (window.google?.accounts?.id) {
        callback();
        return;
    }

    if (attempt > 40) {
        const statusElement = document.getElementById("googleSignupStatus");
        const buttonContainer = document.getElementById("googleSignupButton");

        if (buttonContainer) {
            buttonContainer.classList.add("hidden");
        }

        showGoogleSignupStatus(statusElement, "Google sign-up script could not be loaded. Check internet access or use email sign-up.");
        return;
    }

    window.setTimeout(function () {
        waitForGoogleIdentity(callback, attempt + 1);
    }, 150);
}


async function handleGoogleCredentialResponse(googleResponse) {
    clearRegisterErrors();

    const agree = document.getElementById("registerAgree")?.checked || false;

    if (!agree) {
        setFieldError("registerAgreeError", "Please accept the Terms and Risk Disclosure before using Google sign-up.");
        showAuthMessage("Please accept the Terms and Risk Disclosure.");
        return;
    }

    const referralCode = normalizeReferralCode(document.getElementById("registerReferral")?.value || "");
    const credential = googleResponse?.credential || "";

    if (!credential) {
        showAuthMessage("Google did not return a valid credential. Please try again.");
        return;
    }

    try {
        showAuthMessage("Verifying Google account...", "success", 1200);

        const response = await apiRequest("/auth/google", {
            method: "POST",
            body: JSON.stringify({
                credential: credential,
                referral_code: referralCode
            })
        });

        handleSuccessfulAuth(response, "Google sign-up successful. Redirecting...");

    } catch (error) {
        showAuthMessage(showApiError(error, "Google sign-up failed."));
    }
}


let pendingForgotPasswordReset = {
    email: "",
    code: "",
    codeVerified: false
};


function showForgotPasswordStep(step) {
    const requestForm = document.getElementById("forgotPasswordRequestForm");
    const codeForm = document.getElementById("forgotPasswordCodeForm");
    const resetForm = document.getElementById("resetPasswordForm");
    const introText = document.getElementById("forgotIntroText");

    if (requestForm) {
        requestForm.classList.toggle("hidden", step !== "request");
    }
    if (codeForm) {
        codeForm.classList.toggle("hidden", step !== "code");
    }
    if (resetForm) {
        resetForm.classList.toggle("hidden", step !== "reset");
    }

    if (!introText) {
        return;
    }

    if (step === "code") {
        introText.textContent = "Enter the 6 digit code from your email. After verification, the new password fields will open.";
    } else if (step === "reset") {
        introText.textContent = "Code verified. Create a new strong password for your TraidiumX account.";
    } else {
        introText.textContent = "Enter your registered email. We will send a secure reset code to your email account.";
    }
}


function initForgotPasswordPage() {
    const requestForm = document.getElementById("forgotPasswordRequestForm");
    const codeForm = document.getElementById("forgotPasswordCodeForm");
    const resetForm = document.getElementById("resetPasswordForm");

    if (!requestForm && !codeForm && !resetForm) {
        return;
    }

    pendingForgotPasswordReset = {
        email: "",
        code: "",
        codeVerified: false
    };

    showForgotPasswordStep("request");
}


function clearForgotPasswordErrors() {
    [
        "forgotEmailError",
        "forgotResetCodeError",
        "resetPasswordError",
        "resetConfirmPasswordError"
    ].forEach(function (id) {
        setFieldError(id, "");
    });
}


function updateForgotSuccessBox(responseData = {}) {
    const successBox = document.getElementById("forgotSuccessBox");
    const devResetBox = document.getElementById("devResetBox");
    const devResetCode = document.getElementById("devResetCode");

    if (successBox) {
        const sent = responseData.email_sent === true;
        const note = responseData.email_delivery_note || "";
        const firstText = successBox.querySelector("p");

        if (firstText) {
            firstText.textContent = sent
                ? "Password reset code sent successfully. Please check your Inbox, Spam or Promotions folder."
                : "If this email exists in TraidiumX, a reset code has been prepared. Check your inbox or contact support if you do not receive it.";
        }

        const oldDiagnostic = successBox.querySelector("[data-email-diagnostic]");
        if (oldDiagnostic) {
            oldDiagnostic.remove();
        }

        if (!sent && note && !responseData.dev_reset_code) {
            const diagnostics = document.createElement("p");
            diagnostics.className = "mt-3 text-xs leading-6 text-amber-200";
            diagnostics.textContent = `Development email status: ${note}`;
            diagnostics.setAttribute("data-email-diagnostic", "true");
            successBox.appendChild(diagnostics);
        }

        successBox.classList.remove("hidden");
    }

    if (responseData.dev_reset_code && devResetBox && devResetCode) {
        devResetCode.textContent = responseData.dev_reset_code;
        devResetBox.classList.remove("hidden");
    } else if (devResetBox) {
        devResetBox.classList.add("hidden");
    }
}


async function handleForgotPasswordRequest(event) {
    event.preventDefault();
    event.stopPropagation();
    clearForgotPasswordErrors();

    const form = event.target;
    const submitButton = form.querySelector("button[type='submit']");
    const email = document.getElementById("forgotEmail")?.value.trim().toLowerCase() || "";

    if (!email) {
        setFieldError("forgotEmailError", "Email address is required.");
        showAuthMessage("Please enter your registered email address.");
        return;
    }

    if (!isValidEmail(email)) {
        setFieldError("forgotEmailError", "Enter a valid email address.");
        showAuthMessage("Please enter a valid email address.");
        return;
    }

    try {
        setButtonLoading(submitButton, true, "Sending reset code...");

        const response = await apiRequest("/auth/forgot-password/request", {
            method: "POST",
            body: JSON.stringify({ email: email })
        });

        const data = response?.data || {};
        updateForgotSuccessBox(data);

        pendingForgotPasswordReset.email = email;
        pendingForgotPasswordReset.code = "";
        pendingForgotPasswordReset.codeVerified = false;

        const forgotCodeEmail = document.getElementById("forgotCodeEmail");
        if (forgotCodeEmail) {
            forgotCodeEmail.value = email;
        }

        const resetCodeInput = document.getElementById("forgotResetCode");
        if (resetCodeInput) {
            resetCodeInput.value = "";
        }

        showForgotPasswordStep("code");

        if (data.email_sent === true) {
            showAuthMessage("Password reset code sent successfully. Enter the email code to continue.", "success", 9000);
        } else if (data.dev_reset_code) {
            showAuthMessage("Reset code prepared for local development. Use the development code shown below.", "success", 9000);
        } else {
            showAuthMessage("Reset request accepted. If the email exists, you will receive a reset code shortly.", "success", 9000);
        }
    } catch (error) {
        const errorMessage = showApiError(error, "Could not send reset code. Please try again.");
        showAuthMessage(errorMessage);
    } finally {
        setButtonLoading(submitButton, false);
    }
}


async function handleForgotPasswordCodeVerify(event) {
    event.preventDefault();
    event.stopPropagation();
    clearForgotPasswordErrors();

    const form = event.target;
    const submitButton = form.querySelector("button[type='submit']");
    const email = pendingForgotPasswordReset.email || document.getElementById("forgotCodeEmail")?.value.trim().toLowerCase() || "";
    const code = document.getElementById("forgotResetCode")?.value.replace(/\D/g, "").slice(0, 6) || "";

    if (!email || !isValidEmail(email)) {
        showAuthMessage("Please request a password reset code again.");
        showForgotPasswordStep("request");
        return;
    }

    if (code.length !== 6) {
        setFieldError("forgotResetCodeError", "Enter the 6 digit reset code.");
        showAuthMessage("Please enter the 6 digit code from your email.");
        return;
    }

    try {
        setButtonLoading(submitButton, true, "Verifying code...");

        await apiRequest("/auth/forgot-password/verify-code", {
            method: "POST",
            body: JSON.stringify({
                email: email,
                code: code
            })
        });

        pendingForgotPasswordReset.email = email;
        pendingForgotPasswordReset.code = code;
        pendingForgotPasswordReset.codeVerified = true;

        const resetEmail = document.getElementById("resetEmail");
        const resetCode = document.getElementById("resetCode");

        if (resetEmail) {
            resetEmail.value = email;
        }
        if (resetCode) {
            resetCode.value = code;
        }

        showForgotPasswordStep("reset");
        showAuthMessage("Code verified. Enter your new password below.", "success", 9000);
    } catch (error) {
        const errorMessage = showApiError(error, "Reset code is invalid or expired.");
        setFieldError("forgotResetCodeError", errorMessage);
        showAuthMessage(errorMessage);
    } finally {
        setButtonLoading(submitButton, false);
    }
}


async function handlePasswordReset(event) {
    event.preventDefault();
    event.stopPropagation();
    clearForgotPasswordErrors();

    const form = event.target;
    const submitButton = form.querySelector("button[type='submit']");
    const email = pendingForgotPasswordReset.email || document.getElementById("resetEmail")?.value.trim().toLowerCase() || "";
    const code = pendingForgotPasswordReset.code || document.getElementById("resetCode")?.value.replace(/\D/g, "").slice(0, 6) || "";
    const password = document.getElementById("resetPassword")?.value || "";
    const confirmPassword = document.getElementById("resetConfirmPassword")?.value || "";

    let hasError = false;

    if (!email || !isValidEmail(email) || code.length !== 6) {
        showAuthMessage("Reset code verification is required. Please request a new code.");
        showForgotPasswordStep("request");
        hasError = true;
    }

    if (!password) {
        setFieldError("resetPasswordError", "New password is required.");
        hasError = true;
    } else if (password.length < 8) {
        setFieldError("resetPasswordError", "Password must be at least 8 characters.");
        hasError = true;
    }

    if (!confirmPassword) {
        setFieldError("resetConfirmPasswordError", "Confirm password is required.");
        hasError = true;
    } else if (password !== confirmPassword) {
        setFieldError("resetConfirmPasswordError", "Password and confirm password do not match.");
        hasError = true;
    }

    if (hasError) {
        return;
    }

    try {
        setButtonLoading(submitButton, true, "Resetting password...");

        await apiRequest("/auth/forgot-password/reset", {
            method: "POST",
            body: JSON.stringify({
                email: email,
                code: code,
                password: password,
                confirm_password: confirmPassword
            })
        });

        showAuthMessage("Password reset successfully. Redirecting to login...", "success", 9000);
        form.reset();
        pendingForgotPasswordReset = {
            email: "",
            code: "",
            codeVerified: false
        };

        setTimeout(function () {
            window.location.href = "./login.html";
        }, 1600);
    } catch (error) {
        const errorMessage = showApiError(error, "Password reset failed. Please request a new code.");
        showAuthMessage(errorMessage);
    } finally {
        setButtonLoading(submitButton, false);
    }
}

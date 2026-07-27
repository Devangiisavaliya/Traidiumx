"use strict";

(function () {
    function byId(id) {
        return document.getElementById(id);
    }

    function setMessage(element, message, type = "danger") {
        if (!element) return;
        const colorClass = type === "success"
            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
            : type === "info"
                ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-100"
                : "border-rose-400/25 bg-rose-400/10 text-rose-200";

        element.className = `rounded-2xl border p-3 text-sm font-bold ${colorClass}`;
        element.textContent = message;
        element.classList.remove("hidden");
    }

    function hideMessage(element) {
        if (!element) return;
        element.classList.add("hidden");
        element.textContent = "";
    }

    function setButtonLoading(button, isLoading, loadingText, normalText) {
        if (!button) return;
        button.disabled = Boolean(isLoading);
        button.textContent = isLoading ? loadingText : normalText;
    }

    function pickErrorMessage(error, fallback) {
        const payloadErrors = error?.payload?.errors || {};
        const firstError = Object.values(payloadErrors).find(Boolean);
        return firstError || error?.message || fallback;
    }


    function preventAdminLoginAutofill(form, emailInput, passwordInput) {
        if (!form) return;
        form.setAttribute("autocomplete", "off");

        const clearLoginFields = () => {
            const active = document.activeElement;
            const userIsTyping = active === emailInput || active === passwordInput;
            if (userIsTyping) return;
            if (emailInput) emailInput.value = "";
            if (passwordInput) passwordInput.value = "";
        };

        clearLoginFields();
        window.setTimeout(clearLoginFields, 80);
        window.setTimeout(clearLoginFields, 450);
    }

    function initAdminLogin(api) {
        const form = byId("adminLoginForm");
        if (!form || !api) return;

        if (api.getToken()) {
            window.location.href = api.dashboardUrl;
            return;
        }

        const emailInput = byId("email");
        const passwordInput = byId("password");
        const errorBox = byId("loginError");

        preventAdminLoginAutofill(form, emailInput, passwordInput);


        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const email = emailInput?.value.trim();
            const password = passwordInput?.value.trim();
            const button = form.querySelector("button[type='submit']");

            if (!email || !password) {
                setMessage(errorBox, "Email and password are required.");
                return;
            }

            if (password.length < 6) {
                setMessage(errorBox, "Password must be at least 6 characters.");
                return;
            }

            hideMessage(errorBox);
            setButtonLoading(button, true, "Verifying...", "Open Admin Panel →");

            try {
                await api.login(email, password);
                window.location.href = api.dashboardUrl;
            } catch (error) {
                setMessage(errorBox, pickErrorMessage(error, "Admin login failed."));
            } finally {
                setButtonLoading(button, false, "Verifying...", "Open Admin Panel →");
            }
        });
    }

    function initAdminRegister(api) {
        const form = byId("adminRegisterForm");
        const verifyForm = byId("adminRegisterVerifyForm");
        if (!form || !verifyForm || !api) return;

        const messageBox = byId("registerMessage");
        const sendButton = byId("sendRegisterCodeBtn") || form.querySelector("button[type='submit']");
        const verifyButton = byId("verifyRegisterCodeBtn") || verifyForm.querySelector("button[type='submit']");
        const resendButton = byId("resendRegisterCodeBtn");
        const codeInput = byId("registerVerificationCode");
        const codeHelp = byId("registerCodeHelp");
        const mobileInput = byId("registerMobile");
        let pendingPayload = null;
        let verifiedEmail = "";

        if (mobileInput) {
            mobileInput.addEventListener("input", () => {
                mobileInput.value = mobileInput.value.replace(/\D/g, "").slice(0, 10);
            });
        }

        const codeTimer = byId("registerCodeTimer");
        const resendStatus = byId("registerResendStatus");
        let validityTimerId = null;
        let cooldownTimerId = null;
        let codeExpiresAt = 0;
        let resendUnlockAt = 0;
        let lastRemainingSends = 3;

        if (codeInput) {
            codeInput.addEventListener("input", () => {
                codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
            });
        }

        function formatDuration(totalSeconds) {
            const seconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
            const minutes = Math.floor(seconds / 60);
            const rest = seconds % 60;
            return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
        }

        function stopTimer(timerId) {
            if (timerId) window.clearInterval(timerId);
        }

        function updateResendStatus() {
            if (!resendStatus) return;
            if (resendUnlockAt > Date.now()) {
                const left = Math.ceil((resendUnlockAt - Date.now()) / 1000);
                resendStatus.textContent = `Limit reached. Try again in ${formatDuration(left)}.`;
                return;
            }
            resendStatus.textContent = `${Math.max(0, lastRemainingSends)} send${lastRemainingSends === 1 ? "" : "s"} remaining`;
        }

        function startCodeValidityTimer(seconds) {
            stopTimer(validityTimerId);
            codeExpiresAt = Date.now() + Math.max(1, Number(seconds) || 120) * 1000;
            const tick = () => {
                const left = Math.ceil((codeExpiresAt - Date.now()) / 1000);
                if (codeTimer) codeTimer.textContent = formatDuration(left);
                if (left <= 0) {
                    stopTimer(validityTimerId);
                    validityTimerId = null;
                    if (codeTimer) codeTimer.textContent = "00:00";
                    if (verifyButton) verifyButton.disabled = true;
                    setMessage(messageBox, "Verification code expired. Please resend a new code.", "info");
                }
            };
            tick();
            validityTimerId = window.setInterval(tick, 1000);
            if (verifyButton) verifyButton.disabled = false;
        }

        function startResendCooldown(seconds) {
            stopTimer(cooldownTimerId);
            resendUnlockAt = Date.now() + Math.max(1, Number(seconds) || 1800) * 1000;
            if (resendButton) resendButton.disabled = true;
            const tick = () => {
                const left = Math.ceil((resendUnlockAt - Date.now()) / 1000);
                updateResendStatus();
                if (left <= 0) {
                    stopTimer(cooldownTimerId);
                    cooldownTimerId = null;
                    resendUnlockAt = 0;
                    lastRemainingSends = 3;
                    if (resendButton) resendButton.disabled = false;
                    updateResendStatus();
                }
            };
            tick();
            cooldownTimerId = window.setInterval(tick, 1000);
        }

        function collectPayload() {
            return {
                name: byId("registerName")?.value.trim(),
                email: byId("registerEmail")?.value.trim(),
                mobile: (byId("registerMobile")?.value || "").replace(/\D/g, "").slice(0, 10),
                password: byId("registerPassword")?.value || "",
                confirm_password: byId("registerConfirmPassword")?.value || ""
            };
        }

        function validatePayload(payload) {
            if (!payload.name || !payload.email || !payload.mobile || !payload.password || !payload.confirm_password) {
                return "Name, email, mobile number, password and confirm password are required.";
            }

            if (!/^\d{10}$/.test(payload.mobile)) {
                return "Mobile number must be exactly 10 digits.";
            }

            if (payload.password !== payload.confirm_password) {
                return "Password and confirm password do not match.";
            }

            return "";
        }

        function lockRegisterFields(isLocked) {
            [
                "registerName",
                "registerEmail",
                "registerMobile",
                "registerPassword",
                "registerConfirmPassword"
            ].forEach((id) => {
                const input = byId(id);
                if (input) input.disabled = Boolean(isLocked);
            });
        }

        async function sendVerificationCode(isResend = false) {
            const payload = pendingPayload || collectPayload();
            const validationMessage = validatePayload(payload);
            if (validationMessage) {
                setMessage(messageBox, validationMessage);
                return;
            }

            hideMessage(messageBox);
            setButtonLoading(isResend ? resendButton : sendButton, true, isResend ? "Resending..." : "Sending code...", isResend ? "Resend Code" : "Send Verification Code →");

            try {
                const data = await api.registerAdmin(payload);
                pendingPayload = payload;
                verifiedEmail = payload.email;
                verifyForm.classList.remove("hidden");
                lockRegisterFields(true);
                if (codeHelp) {
                    codeHelp.textContent = `Enter the 6 digit code sent to ${payload.email}. Code is valid for 120 seconds.`;
                }
                codeInput?.focus();
                const validFor = Number(data?.expires_in_seconds || 120);
                const remaining = Number(data?.remaining_sends);
                lastRemainingSends = Number.isFinite(remaining) ? remaining : lastRemainingSends;
                updateResendStatus();
                startCodeValidityTimer(validFor);
                const retryAfterSeconds = Number(data?.retry_after_seconds || 0);
                if (lastRemainingSends <= 0 && retryAfterSeconds > 0) {
                    startResendCooldown(retryAfterSeconds);
                } else if (resendButton) {
                    resendButton.disabled = false;
                }
                setMessage(messageBox, `Verification code sent to admin email. Code is valid for ${validFor} seconds. Remaining sends: ${Math.max(0, lastRemainingSends)}.`, "success");
            } catch (error) {
                const errors = error?.payload?.errors || {};
                const retryAfterSeconds = Number(errors.retry_after_seconds || errors.retry_after || 0);
                if (error?.status === 429 && retryAfterSeconds > 0) {
                    lastRemainingSends = 0;
                    startResendCooldown(retryAfterSeconds);
                }
                setMessage(messageBox, pickErrorMessage(error, "Admin verification code send failed."));
            } finally {
                setButtonLoading(isResend ? resendButton : sendButton, false, isResend ? "Resending..." : "Sending code...", isResend ? "Resend Code" : "Send Verification Code →");
                if (resendButton && resendUnlockAt > Date.now()) resendButton.disabled = true;
            }
        }

        updateResendStatus();

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            pendingPayload = collectPayload();
            await sendVerificationCode(false);
        });

        resendButton?.addEventListener("click", async () => {
            if (!pendingPayload) pendingPayload = collectPayload();
            await sendVerificationCode(true);
        });

        verifyForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const code = codeInput?.value.trim() || "";

            if (!verifiedEmail || !pendingPayload) {
                setMessage(messageBox, "Send the admin verification code first.");
                return;
            }

            if (!/^\d{6}$/.test(code)) {
                setMessage(messageBox, "Enter the 6 digit admin verification code.");
                return;
            }

            if (codeExpiresAt && Date.now() > codeExpiresAt) {
                setMessage(messageBox, "Verification code expired. Please resend a new code.", "info");
                return;
            }

            hideMessage(messageBox);
            setButtonLoading(verifyButton, true, "Creating admin...", "Verify & Create Admin →");

            try {
                await api.verifyAdminRegistrationCode({ email: verifiedEmail, code });
                stopTimer(validityTimerId);
                stopTimer(cooldownTimerId);
                if (api.clearSession) api.clearSession();
                setMessage(messageBox, "Admin email verified and account created. Redirecting to login...", "success");
                setTimeout(() => {
                    window.location.href = api.loginUrl;
                }, 900);
            } catch (error) {
                setMessage(messageBox, pickErrorMessage(error, "Admin verification failed."));
            } finally {
                setButtonLoading(verifyButton, false, "Creating admin...", "Verify & Create Admin →");
            }
        });
    }

    function initAdminForgotPassword(api) {
        const requestForm = byId("adminForgotRequestForm");
        const verifyForm = byId("adminForgotVerifyForm");
        const resetForm = byId("adminForgotResetForm");
        if (!requestForm || !verifyForm || !resetForm || !api) return;

        const messageBox = byId("forgotMessage");
        const emailInput = byId("forgotEmail");
        const codeInput = byId("forgotCode");
        const newPasswordInput = byId("forgotNewPassword");
        const confirmPasswordInput = byId("forgotConfirmPassword");
        let verifiedEmail = "";
        let verifiedCode = "";

        requestForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const button = requestForm.querySelector("button[type='submit']");
            const email = emailInput?.value.trim();

            if (!email) {
                setMessage(messageBox, "Admin email is required.");
                return;
            }

            hideMessage(messageBox);
            setButtonLoading(button, true, "Sending code...", "Send Reset Code →");

            try {
                const data = await api.requestAdminPasswordReset(email);
                verifiedEmail = email;
                verifyForm.classList.remove("hidden");
                codeInput?.focus();
                const devCode = data?.dev_reset_code ? ` Dev code: ${data.dev_reset_code}` : "";
                setMessage(messageBox, `If this admin email exists, a reset code has been sent.${devCode}`, "success");
            } catch (error) {
                setMessage(messageBox, pickErrorMessage(error, "Could not send admin reset code."));
            } finally {
                setButtonLoading(button, false, "Sending code...", "Send Reset Code →");
            }
        });

        verifyForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const button = verifyForm.querySelector("button[type='submit']");
            const email = verifiedEmail || emailInput?.value.trim();
            const code = codeInput?.value.trim();

            if (!email || !code || code.length !== 6) {
                setMessage(messageBox, "Enter the 6 digit admin reset code.");
                return;
            }

            hideMessage(messageBox);
            setButtonLoading(button, true, "Verifying...", "Verify Code");

            try {
                await api.verifyAdminPasswordResetCode(email, code);
                verifiedEmail = email;
                verifiedCode = code;
                resetForm.classList.remove("hidden");
                newPasswordInput?.focus();
                setMessage(messageBox, "Code verified. Enter your new admin password.", "success");
            } catch (error) {
                setMessage(messageBox, pickErrorMessage(error, "Admin reset code verification failed."));
            } finally {
                setButtonLoading(button, false, "Verifying...", "Verify Code");
            }
        });

        resetForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const button = resetForm.querySelector("button[type='submit']");
            const password = newPasswordInput?.value || "";
            const confirmPassword = confirmPasswordInput?.value || "";

            if (!verifiedEmail || !verifiedCode) {
                setMessage(messageBox, "Verify the admin reset code first.");
                return;
            }

            if (!password || !confirmPassword) {
                setMessage(messageBox, "New password and confirm password are required.");
                return;
            }

            if (password !== confirmPassword) {
                setMessage(messageBox, "Password and confirm password do not match.");
                return;
            }

            hideMessage(messageBox);
            setButtonLoading(button, true, "Resetting...", "Reset Admin Password →");

            try {
                await api.resetAdminPassword({
                    email: verifiedEmail,
                    code: verifiedCode,
                    password,
                    confirm_password: confirmPassword
                });
                setMessage(messageBox, "Admin password reset successfully. Redirecting to login...", "success");
                setTimeout(() => {
                    window.location.href = api.loginUrl;
                }, 900);
            } catch (error) {
                setMessage(messageBox, pickErrorMessage(error, "Admin password reset failed."));
            } finally {
                setButtonLoading(button, false, "Resetting...", "Reset Admin Password →");
            }
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        const api = window.TXAdminApi;
        initAdminLogin(api);
        initAdminRegister(api);
        initAdminForgotPassword(api);
    });
})();

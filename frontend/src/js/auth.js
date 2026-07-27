"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Auth Pages
|--------------------------------------------------------------------------
| Frontend-only demo auth:
| - Register validation
| - Login validation
| - Forgot password reset ID
| - Password strength
| - Show / hide password
| - LocalStorage demo user/session
| - Clerk Google Login frontend support
|--------------------------------------------------------------------------
*/

const DEMO_USER_KEY = "traidiumx_demo_user";
const DEMO_SESSION_KEY = "traidiumx_demo_session";

let lastResetId = "";

function showMiniMessage(message, type = "success") {
    let messageBox = document.getElementById("authMiniMessage");

    if (!messageBox) {
        messageBox = document.createElement("div");
        messageBox.id = "authMiniMessage";
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

function getElement(id) {
    return document.getElementById(id);
}

function setError(id, message) {
    const element = getElement(id);

    if (element) {
        element.textContent = message;
    }
}

function clearErrors(ids) {
    ids.forEach((id) => setError(id, ""));
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateMobile(mobile) {
    return /^[6-9]\d{9}$/.test(mobile);
}

function getPasswordScore(password) {
    let score = 0;

    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    return score;
}

function isStrongPassword(password) {
    return getPasswordScore(password) >= 4;
}

function saveDemoUser(user) {
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
}

function getDemoUser() {
    try {
        const saved = localStorage.getItem(DEMO_USER_KEY);
        return saved ? JSON.parse(saved) : null;
    } catch (error) {
        console.error(error);
        return null;
    }
}

function saveDemoSession(user) {
    const session = {
        email: user.email,
        name: user.name,
        provider: user.provider || "demo",
        clerkUserId: user.clerkUserId || "",
        loggedInAt: new Date().toISOString()
    };

    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
}

function generateResetId() {
    const date = new Date();
    const year = String(date.getFullYear()).slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const random = Math.floor(1000 + Math.random() * 9000);

    return `TX-RESET-${year}${month}-${random}`;
}

function initPasswordToggles() {
    document.querySelectorAll("[data-toggle-password]").forEach((button) => {
        button.addEventListener("click", () => {
            const inputId = button.getAttribute("data-toggle-password");
            const input = getElement(inputId);

            if (!input) {
                return;
            }

            const isPassword = input.type === "password";
            input.type = isPassword ? "text" : "password";
            button.textContent = isPassword ? "Hide" : "Show";
        });
    });
}

function initMobileRestrictions() {
    const mobileInputs = [
        getElement("registerMobile")
    ];

    mobileInputs.forEach((input) => {
        if (!input) {
            return;
        }

        input.addEventListener("input", () => {
            input.value = input.value.replace(/\D/g, "").slice(0, 10);
        });
    });
}

function updatePasswordStrength() {
    const passwordInput = getElement("registerPassword");
    const strengthBar = getElement("passwordStrengthBar");
    const strengthLabel = getElement("passwordStrengthLabel");

    if (!passwordInput || !strengthBar || !strengthLabel) {
        return;
    }

    const password = passwordInput.value;
    const score = getPasswordScore(password);

    const config = [
        { width: "12%", label: "Weak", className: "h-full w-[12%] rounded-full bg-red-400 transition-all" },
        { width: "28%", label: "Weak", className: "h-full rounded-full bg-red-400 transition-all" },
        { width: "48%", label: "Medium", className: "h-full rounded-full bg-orange-400 transition-all" },
        { width: "68%", label: "Good", className: "h-full rounded-full bg-yellow-400 transition-all" },
        { width: "84%", label: "Strong", className: "h-full rounded-full bg-emerald-400 transition-all" },
        { width: "100%", label: "Very Strong", className: "h-full rounded-full bg-cyan-400 transition-all" }
    ];

    const selected = config[score] || config[0];

    strengthBar.className = selected.className;
    strengthBar.style.width = selected.width;
    strengthLabel.textContent = selected.label;

    if (score <= 1) {
        strengthLabel.className = "text-xs font-black text-red-300";
    } else if (score <= 3) {
        strengthLabel.className = "text-xs font-black text-orange-300";
    } else {
        strengthLabel.className = "text-xs font-black text-emerald-300";
    }
}

function initPasswordStrength() {
    const passwordInput = getElement("registerPassword");

    if (!passwordInput) {
        return;
    }

    passwordInput.addEventListener("input", updatePasswordStrength);
    updatePasswordStrength();
}

function initReferralFromUrl() {
    const referralInput = getElement("registerReferral");

    if (!referralInput) {
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");

    if (ref) {
        referralInput.value = ref.toUpperCase();
    }
}

function handleRegister(event) {
    event.preventDefault();

    clearErrors([
        "registerMobileError",
        "registerEmailError",
        "registerPasswordError",
        "registerConfirmPasswordError",
        "registerAgreeError"
    ]);

    const mobile = getElement("registerMobile")?.value.trim() || "";
    const email = getElement("registerEmail")?.value.trim().toLowerCase() || "";
    const password = getElement("registerPassword")?.value || "";
    const confirmPassword = getElement("registerConfirmPassword")?.value || "";
    const referral = getElement("registerReferral")?.value.trim().toUpperCase() || "";
    const agreed = getElement("registerAgree")?.checked || false;

    // Auto-generate name from email for demo session
    let name = "Trader";
    if (email) {
        const username = email.split("@")[0];
        const cleaned = username.replace(/[^A-Za-z]/g, "");
        name = cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Trader";
    }

    let isValid = true;

    if (!validateMobile(mobile)) {
        setError("registerMobileError", "Please enter valid 10 digit Indian mobile number.");
        isValid = false;
    }

    if (!validateEmail(email)) {
        setError("registerEmailError", "Please enter valid email address.");
        isValid = false;
    }

    if (!isStrongPassword(password)) {
        setError("registerPasswordError", "Password must include uppercase, lowercase, number and special character.");
        isValid = false;
    }

    if (password !== confirmPassword) {
        setError("registerConfirmPasswordError", "Confirm password does not match.");
        isValid = false;
    }

    if (!agreed) {
        setError("registerAgreeError", "Please accept terms, privacy policy and risk disclosure.");
        isValid = false;
    }

    if (!isValid) {
        showMiniMessage("Please fix registration errors.", "error");
        return;
    }

    const user = {
        name,
        mobile,
        email,
        password,
        referral,
        provider: "demo",
        kycStatus: "Pending",
        createdAt: new Date().toISOString()
    };

    saveDemoUser(user);
    saveDemoSession(user);

    const successMessage = getElement("registerSuccessMessage");

    if (successMessage) {
        successMessage.classList.remove("hidden");
        successMessage.textContent = "Demo account created successfully. You can now login.";
    }

    showMiniMessage("Demo account created successfully.", "success");

    window.setTimeout(() => {
        window.location.href = "./login.html";
    }, 1200);
}

function handleLogin(event) {
    event.preventDefault();

    clearErrors([
        "loginEmailError",
        "loginPasswordError"
    ]);

    const email = getElement("loginEmail")?.value.trim().toLowerCase() || "";
    const password = getElement("loginPassword")?.value || "";

    let isValid = true;

    const isClientID = /^\d{6}$/.test(email);
    if (!isClientID && !validateEmail(email)) {
        setError("loginEmailError", "Please enter valid email address or 6-digit Client ID.");
        isValid = false;
    }

    if (password.length < 6) {
        setError("loginPasswordError", "Please enter valid password.");
        isValid = false;
    }

    if (!isValid) {
        showMiniMessage("Please fix login errors.", "error");
        return;
    }

    const savedUser = getDemoUser();

    const defaultDemoUser = {
        name: "Demo Trader",
        email: "demo@traidiumx.com",
        password: "Demo@123",
        provider: "demo"
    };

    const validSavedUser = savedUser && savedUser.email === email && savedUser.password === password;
    const validDefaultUser = defaultDemoUser.email === email && defaultDemoUser.password === password;

    if (!validSavedUser && !validDefaultUser) {
        setError("loginPasswordError", "Invalid demo login credentials.");
        showMiniMessage("Invalid demo login credentials.", "error");
        return;
    }

    const loggedInUser = validSavedUser ? savedUser : defaultDemoUser;

    saveDemoSession(loggedInUser);

    const successMessage = getElement("loginSuccessMessage");

    if (successMessage) {
        successMessage.classList.remove("hidden");
        successMessage.textContent = `Welcome ${loggedInUser.name}. Login successful.`;
    }

    showMiniMessage("Login successful.", "success");

    window.setTimeout(() => {
        window.location.href = "./futures.html";
    }, 1200);
}

function handleForgotPassword(event) {
    event.preventDefault();

    clearErrors(["forgotEmailError"]);

    const email = getElement("forgotEmail")?.value.trim().toLowerCase() || "";

    if (!validateEmail(email)) {
        setError("forgotEmailError", "Please enter valid registered email address.");
        showMiniMessage("Please enter valid email.", "error");
        return;
    }

    lastResetId = generateResetId();

    const resetRequestId = getElement("resetRequestId");
    const forgotSuccessBox = getElement("forgotSuccessBox");

    if (resetRequestId) {
        resetRequestId.textContent = lastResetId;
    }

    if (forgotSuccessBox) {
        forgotSuccessBox.classList.remove("hidden");
    }

    showMiniMessage("Reset request generated successfully.", "success");
}

async function copyResetId() {
    if (!lastResetId) {
        showMiniMessage("No reset ID available.", "error");
        return;
    }

    try {
        await navigator.clipboard.writeText(lastResetId);
        showMiniMessage("Reset ID copied successfully.", "success");
    } catch (error) {
        console.error(error);
        showMiniMessage("Copy failed. Please copy manually.", "error");
    }
}

/* =====================================================
   CLERK GOOGLE LOGIN
===================================================== */

function getClerkConfig() {
    return window.TRAIDIUMX_CLERK || {
        publishableKey: "",
        frontendApiUrl: ""
    };
}

function isClerkConfigReady() {
    const config = getClerkConfig();

    return Boolean(
        config.publishableKey &&
        config.frontendApiUrl &&
        !config.publishableKey.includes("YOUR_") &&
        !config.frontendApiUrl.includes("YOUR_")
    );
}

function updateGoogleButtonState(text, disabled = false) {
    const googleBtn = getElement("clerkGoogleLoginBtn");
    const googleText = getElement("clerkGoogleBtnText");

    if (!googleBtn) {
        return;
    }

    googleBtn.disabled = disabled;

    if (googleText && text) {
        googleText.textContent = text;
    }
}

function setGoogleError(message) {
    const errorBox = getElement("clerkGoogleError");

    if (errorBox) {
        errorBox.textContent = message || "";
    }
}

function waitForClerkReady() {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        const timer = window.setInterval(async () => {
            attempts += 1;

            if (window.Clerk) {
                try {
                    if (typeof window.Clerk.load === "function" && !window.Clerk.loaded) {
                        await window.Clerk.load();
                    }

                    window.clearInterval(timer);
                    resolve(window.Clerk);
                } catch (error) {
                    window.clearInterval(timer);
                    reject(error);
                }
            }

            if (attempts > 80) {
                window.clearInterval(timer);
                reject(new Error("Clerk failed to load."));
            }
        }, 250);
    });
}

function getClerkUserData(clerk) {
    const user = clerk.user;

    if (!user) {
        return null;
    }

    const email =
        user.primaryEmailAddress?.emailAddress ||
        user.emailAddresses?.[0]?.emailAddress ||
        "";

    const name =
        user.fullName ||
        user.firstName ||
        email.split("@")[0] ||
        "Google User";

    return {
        name,
        email,
        mobile: "",
        password: "",
        referral: "",
        provider: "google",
        clerkUserId: user.id,
        kycStatus: "Pending",
        createdAt: new Date().toISOString()
    };
}

function saveClerkDemoSession(clerk) {
    const googleUser = getClerkUserData(clerk);

    if (!googleUser || !googleUser.email) {
        return false;
    }

    saveDemoUser(googleUser);
    saveDemoSession(googleUser);

    return true;
}

function watchClerkLoginSuccess(clerk) {
    let attempts = 0;

    const timer = window.setInterval(() => {
        attempts += 1;

        if (clerk.isSignedIn && clerk.user) {
            const saved = saveClerkDemoSession(clerk);

            if (saved) {
                window.clearInterval(timer);
                showMiniMessage("Google login successful.", "success");

                window.setTimeout(() => {
                    window.location.href = "./futures.html";
                }, 900);
            }
        }

        if (attempts > 180) {
            window.clearInterval(timer);
            updateGoogleButtonState("Continue with Google", false);
        }
    }, 1000);
}

async function handleClerkGoogleLogin() {
    setGoogleError("");

    if (!isClerkConfigReady()) {
        setGoogleError("Clerk Publishable Key / Frontend API URL is not set.");
        showMiniMessage("Please set Clerk keys first.", "error");
        return;
    }

    try {
        updateGoogleButtonState("Opening Google...", true);

        const clerk = await waitForClerkReady();

        if (clerk.isSignedIn && clerk.user) {
            const saved = saveClerkDemoSession(clerk);

            if (saved) {
                showMiniMessage("Already logged in with Google.", "success");
                window.location.href = "./futures.html";
                return;
            }
        }

        if (typeof clerk.openSignIn !== "function") {
            throw new Error("Clerk openSignIn is not available.");
        }

        await clerk.openSignIn({
            redirectUrl: window.location.href,
            afterSignInUrl: "./futures.html",
            afterSignUpUrl: "./futures.html"
        });

        watchClerkLoginSuccess(clerk);
    } catch (error) {
        console.error(error);

        updateGoogleButtonState("Continue with Google", false);
        setGoogleError("Google login failed. Check Clerk setup and allowed origin.");
        showMiniMessage("Google login failed. Check Clerk setup.", "error");
    }
}

function initClerkGoogleLogin() {
    const googleBtn = getElement("clerkGoogleLoginBtn");

    if (!googleBtn) {
        return;
    }

    if (!isClerkConfigReady()) {
        updateGoogleButtonState("Continue with Google", false);
        setGoogleError("Add Clerk key and Frontend API URL to enable Google login.");
    }

    googleBtn.addEventListener("click", handleClerkGoogleLogin);

    waitForClerkReady()
        .then((clerk) => {
            if (clerk.isSignedIn && clerk.user) {
                saveClerkDemoSession(clerk);
                updateGoogleButtonState("Continue as Google User", false);
                setGoogleError("");
            }
        })
        .catch(() => {
            updateGoogleButtonState("Continue with Google", false);
        });
}

/* =====================================================
   INIT
===================================================== */

function initForms() {
    const registerForm = getElement("registerForm");
    const loginForm = getElement("loginForm");
    const forgotPasswordForm = getElement("forgotPasswordForm");
    const copyResetIdBtn = getElement("copyResetIdBtn");

    if (registerForm) {
        registerForm.addEventListener("submit", handleRegister);
    }

    if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
    }

    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener("submit", handleForgotPassword);
    }

    if (copyResetIdBtn) {
        copyResetIdBtn.addEventListener("click", copyResetId);
    }
}

function initAuthPages() {
    initPasswordToggles();
    initMobileRestrictions();
    initPasswordStrength();
    initReferralFromUrl();
    initForms();
    initClerkGoogleLogin();
}

document.addEventListener("DOMContentLoaded", initAuthPages);
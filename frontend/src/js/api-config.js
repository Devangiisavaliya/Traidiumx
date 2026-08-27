const API_BASE_URL = `${window.location.origin}/api`;

const TOKEN_KEY = "traidiumx_auth_token";
const USER_KEY = "traidiumx_user";

function saveAuthData(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function getAuthToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function getAuthUser() {
    const user = localStorage.getItem(USER_KEY);

    if (!user) {
        return null;
    }

    try {
        return JSON.parse(user);
    } catch (error) {
        return null;
    }
}

function isLoggedIn() {
    return !!getAuthToken();
}

function logoutUser() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = "/";
}

function isAuthExpiredResponse(response, payload) {
    if (!response || response.status !== 401) {
        return false;
    }

    const message = String(payload?.message || "").toLowerCase();
    const tokenError = String(payload?.errors?.token || "").toLowerCase();

    return message.includes("token") || tokenError.includes("token") || tokenError.includes("expired") || message.includes("unauthorized");
}

function handleAuthExpired(payload = {}) {
    clearAuthData();

    const currentPath = `${window.location.pathname}${window.location.search || ""}`;
    const loginPath = window.location.pathname.includes("/src/pages/") ? "./login.html" : "/src/pages/login.html";
    const redirectUrl = `${loginPath}?expired=1&next=${encodeURIComponent(currentPath)}`;

    if (!window.__traidiumx_auth_redirecting) {
        window.__traidiumx_auth_redirecting = true;
        window.setTimeout(() => {
            window.location.href = redirectUrl;
        }, 600);
    }

    return payload;
}

async function apiRequest(endpoint, options = {}) {
    const token = getAuthToken();
    const isFormData = options.body instanceof FormData;

    const headers = {
        ...(options.headers || {})
    };

    const activeCurrency = localStorage.getItem("tx_navbar_currency") || "USDT";
    headers["X-Navbar-Currency"] = activeCurrency;

    if (!isFormData && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const normalizedEndpoint = String(endpoint || "").startsWith("/") ? endpoint : `/${endpoint}`;

    const activeUserId = localStorage.getItem("traidiumx_active_user_id");
    const isTradingOrWalletApi = normalizedEndpoint.startsWith("/wallet/balance") ||
                                 normalizedEndpoint.startsWith("/wallet/ledger") ||
                                 normalizedEndpoint.startsWith("/trading/") ||
                                 normalizedEndpoint.startsWith("/options/");
    if (token && activeUserId && isTradingOrWalletApi) {
        headers["X-Active-User-Id"] = activeUserId;
    }

    const method = (options.method || "GET").toUpperCase();
    let requestUrl = `${API_BASE_URL}${normalizedEndpoint}`;
    if (method === "GET") {
        const separator = requestUrl.includes("?") ? "&" : "?";
        requestUrl = `${requestUrl}${separator}_t=${Date.now()}`;
    }

    const response = await fetch(requestUrl, {
        method,
        headers,
        body: options.body || null,
        credentials: options.credentials || "same-origin"
    });

    const contentType = response.headers.get("content-type") || "";
    let data = null;

    if (contentType.includes("application/json")) {
        try {
            data = await response.json();
        } catch (error) {
            data = {
                success: false,
                message: "Invalid JSON response from server.",
                errors: {
                    response: "Server returned JSON content-type but body could not be parsed.",
                    endpoint: normalizedEndpoint,
                    status: response.status
                }
            };
        }
    } else {
        const rawText = await response.text().catch(() => "");
        data = {
            success: false,
            message: "Server returned non-JSON response.",
            errors: {
                response: "Server did not return valid JSON.",
                endpoint: normalizedEndpoint,
                status: response.status,
                preview: rawText.slice(0, 180)
            }
        };
    }

    if (!response.ok || !contentType.includes("application/json")) {
        if (isAuthExpiredResponse(response, data)) {
            handleAuthExpired(data);
        }

        throw data;
    }

    return data || {};
}

function requireLogin() {
    if (!isLoggedIn()) {
        window.location.href = "/";
        return false;
    }

    return true;
}

function showApiError(error, fallbackMessage = "Something went wrong.") {
    if (error && error.errors) {
        const firstErrorKey = Object.keys(error.errors)[0];

        if (firstErrorKey) {
            const errVal = error.errors[firstErrorKey];
            if (firstErrorKey === "timeout" || errVal === true) {
                return error.message || "Request timed out. Please check your connection.";
            }
            return errVal;
        }
    }

    if (error && error.message) {
        return error.message;
    }

    return fallbackMessage;
}

function clearAuthData() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

function getAuthHeaders() {
    const token = getAuthToken();

    if (!token) {
        return {};
    }

    return {
        Authorization: `Bearer ${token}`
    };
}

function isCurrentPagePublic() {
    const pathname = window.location.pathname.toLowerCase();
    const publicPages = [
        "index.html",
        "login.html",
        "register.html",
        "forgot-password.html",
        "about.html",
        "contact.html",
        "terms.html",
        "privacy-policy.html",
        "risk-disclosure.html",
        "fee-structure.html",
        "blog.html",
        "blog-details.html",
        "kyc-aml-policy.html"
    ];

    if (pathname === "/" || pathname === "" || pathname.endsWith("/")) {
        return true;
    }

    return publicPages.some(page => pathname.includes(page));
}

function checkBrowserCloseSession() {
    if (isLoggedIn()) {
        const lastActive = localStorage.getItem("last_active_time");
        const sessionActive = sessionStorage.getItem("session_tab_active");

        if (!sessionActive && lastActive) {
            const diff = Date.now() - parseInt(lastActive, 10);
            const ONE_HOUR = 60 * 60 * 1000;
            if (diff > ONE_HOUR) {
                clearAuthData();

                if (!isCurrentPagePublic()) {
                    const loginPath = window.location.pathname.includes("/src/pages/") ? "./login.html" : "/src/pages/login.html";
                    window.location.href = `${loginPath}?expired=1`;
                    return;
                }
            }
        }

        sessionStorage.setItem("session_tab_active", "true");
        localStorage.setItem("last_active_time", Date.now().toString());

        setInterval(() => {
            if (isLoggedIn()) {
                localStorage.setItem("last_active_time", Date.now().toString());
            }
        }, 10000);

        window.addEventListener("beforeunload", () => {
            if (isLoggedIn()) {
                localStorage.setItem("last_active_time", Date.now().toString());
            }
        });
    }
}

try {
    checkBrowserCloseSession();
} catch (e) {
    console.error("Session check error:", e);
}


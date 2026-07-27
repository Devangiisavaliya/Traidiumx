"use strict";

(function () {
    const cfg = window.TX_ADMIN_CONFIG || {};
    const apiBaseUrl = (cfg.apiBaseUrl || "/api/admin").replace(/\/$/, "");
    const tokenKey = cfg.tokenKey || "traidiumx_admin_token";
    const adminKey = cfg.adminKey || "traidiumx_admin_profile";
    const loginUrl = cfg.loginUrl || "/admin/login";
    const dashboardUrl = cfg.dashboardUrl || "/admin/dashboard";

    function getToken() {
        return localStorage.getItem(tokenKey) || "";
    }

    function setSession(token, admin) {
        localStorage.setItem(tokenKey, token || "");
        localStorage.setItem(adminKey, JSON.stringify(admin || {}));
    }

    function clearSession() {
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(adminKey);
    }

    function getAdmin() {
        try {
            return JSON.parse(localStorage.getItem(adminKey) || "{}");
        } catch (error) {
            return {};
        }
    }

    function isLoginPage() {
        const path = window.location.pathname;
        return path === loginUrl
            || path === "/admin/register"
            || path === "/admin/forgot-password"
            || path.endsWith("/auth/login.html")
            || path.endsWith("/auth/register.html")
            || path.endsWith("/auth/forgot-password.html");
    }

    function requireAuth() {
        if (!isLoginPage() && !getToken()) {
            window.location.href = loginUrl;
            return false;
        }
        return true;
    }

    function buildUrl(endpoint, params) {
        let path = String(endpoint || "");
        if (!path.startsWith("/")) path = "/" + path;
        const url = new URL(apiBaseUrl + path, window.location.origin);
        Object.entries(params || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
                url.searchParams.set(key, value);
            }
        });
        return url.toString();
    }

    async function request(endpoint, options = {}) {
        const headers = {
            "Accept": "application/json",
            ...(options.headers || {})
        };
        const method = options.method || "GET";

        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        const token = getToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(buildUrl(endpoint, options.params), {
            method,
            headers,
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = { success: false, message: "Invalid JSON response from server." };
        }

        if (response.status === 401 && !isLoginPage()) {
            clearSession();
            window.location.href = loginUrl;
            return Promise.reject(new Error("Admin session expired. Please login again."));
        }

        if (!response.ok || payload.success === false) {
            const message = payload.message || `Request failed with status ${response.status}.`;
            const err = new Error(message);
            err.payload = payload;
            err.status = response.status;
            throw err;
        }

        return payload.data || {};
    }

    function getId(item) {
        return item?.id || item?._id || item?.withdrawal_id || item?.order_id || item?.position_id || item?.kyc_id || "";
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function fmtDate(value) {
        if (!value) return "-";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleString();
    }

    function number(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function emptyRow(colspan, message) {
        return `<tr><td colspan="${colspan}" class="py-8 text-center text-sm font-bold text-slate-400">${escapeHtml(message)}</td></tr>`;
    }

    function setLoading(tbody, colspan, message = "Loading...") {
        if (tbody) tbody.innerHTML = emptyRow(colspan, message);
    }

    function showError(error, fallback = "Something went wrong.") {
        const message = error?.message || fallback;
        if (window.TXAdmin?.toast) {
            window.TXAdmin.toast("Admin API Error", message, "danger");
        } else {
            alert(message);
        }
        console.error(error);
    }

    function userLabel(item) {
        const user = item?.user || {};
        return item?.user_name || item?.full_name || item?.name || user.name || user.full_name || item?.email || user.email || item?.user_id || "Unknown User";
    }

    function userEmail(item) {
        const user = item?.user || {};
        return item?.email || user.email || "";
    }

    async function login(email, password) {
        const data = await request("/auth/login", {
            method: "POST",
            body: { email, password }
        });
        setSession(data.token, data.admin);
        return data;
    }

    async function registerAdmin(payload) {
        const data = await request("/auth/register", {
            method: "POST",
            body: payload
        });
        // Admin registration mirrors user-side signup: email code first, account create after verify.
        return data;
    }

    async function verifyAdminRegistrationCode(payload) {
        return request("/auth/register/verify-code", {
            method: "POST",
            body: payload
        });
    }

    async function requestAdminPasswordReset(email) {
        return request("/auth/forgot-password/request", {
            method: "POST",
            body: { email }
        });
    }

    async function verifyAdminPasswordResetCode(email, code) {
        return request("/auth/forgot-password/verify-code", {
            method: "POST",
            body: { email, code }
        });
    }

    async function resetAdminPassword(payload) {
        return request("/auth/forgot-password/reset", {
            method: "POST",
            body: payload
        });
    }

    async function logout() {
        try {
            if (getToken()) await request("/auth/logout", { method: "POST" });
        } catch (error) {
            console.warn("Logout API failed:", error);
        } finally {
            clearSession();
            window.location.href = loginUrl;
        }
    }

    window.TXAdminApi = {
        request,
        login,
        registerAdmin,
        verifyAdminRegistrationCode,
        requestAdminPasswordReset,
        verifyAdminPasswordResetCode,
        resetAdminPassword,
        logout,
        getToken,
        getAdmin,
        setSession,
        clearSession,
        requireAuth,
        getId,
        escapeHtml,
        fmtDate,
        number,
        emptyRow,
        setLoading,
        showError,
        userLabel,
        userEmail,
        loginUrl,
        dashboardUrl
    };
})();

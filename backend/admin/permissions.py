from functools import wraps

from flask import g

from utils.response import error_response


ROLE_PERMISSIONS = {
    "super_admin": ["*"],
    "admin": [
        "dashboard.view",
        "users.view",
        "users.update_status",
        "kyc.view",
        "kyc.review",
        "wallet.view",
        "deposits.view",
        "deposits.verify",
        "deposits.reject",
        "withdrawals.view",
        "withdrawals.approve",
        "withdrawals.reject",
        "trading.view",
        "markets.view",
        "markets.manage",
        "audit.view",
        "notifications.view",
        "notifications.send",
    ],
    "finance": [
        "dashboard.view",
        "wallet.view",
        "deposits.view",
        "deposits.verify",
        "deposits.reject",
        "withdrawals.view",
        "withdrawals.approve",
        "withdrawals.reject",
        "audit.view",
    ],
    "support": [
        "dashboard.view",
        "users.view",
        "kyc.view",
        "wallet.view",
        "deposits.view",
        "withdrawals.view",
        "trading.view",
        "notifications.view",
        "notifications.send",
    ],
    "risk": [
        "dashboard.view",
        "users.view",
        "trading.view",
        "markets.view",
        "wallet.view",
        "deposits.view",
    ],
}


def admin_has_permission(admin, permission):
    if not admin:
        return False

    role = admin.get("role", "")
    permissions = set(admin.get("permissions") or [])
    role_permissions = set(ROLE_PERMISSIONS.get(role, []))

    return "*" in permissions or "*" in role_permissions or permission in permissions or permission in role_permissions


def permission_required(permission):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            admin = getattr(g, "current_admin", None)

            if not admin_has_permission(admin, permission):
                return error_response(
                    message="You do not have permission to perform this admin action.",
                    errors={"permission": permission},
                    status_code=403,
                )

            return fn(*args, **kwargs)

        return wrapper

    return decorator

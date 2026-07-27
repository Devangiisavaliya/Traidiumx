from flask import Blueprint

from admin.settings_routes import get_final_settings
from utils.response import success_response


system_api = Blueprint("system_api", __name__, url_prefix="/api/system")


@system_api.get("/maintenance")
def get_maintenance_status():
    """Public user-side maintenance status.

    This endpoint is intentionally read-only and public so frontend pages can
    show the professional maintenance popup before allowing user actions.
    Admin pages continue to use /api/admin/settings.
    """
    settings = get_final_settings()
    platform_status = str(settings.get("platform_status") or "trading_enabled").strip()
    maintenance_active = platform_status == "maintenance_mode"
    message = str(settings.get("maintenance_message") or "TraidiumX is under maintenance. Please try again later.").strip()

    response, status_code = success_response(
        message="Maintenance status fetched successfully.",
        data={
            "maintenance_active": maintenance_active,
            "platform_status": platform_status,
            "maintenance_message": message,
        },
    )
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response, status_code

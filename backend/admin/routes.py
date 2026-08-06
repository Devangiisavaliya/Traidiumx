from flask import Blueprint

from .auth_routes import admin_auth_api
from .audit_routes import admin_audit_api
from .dashboard_routes import admin_dashboard_api
from .kyc_routes import admin_kyc_api
from .market_routes import admin_market_api
from .trading_routes import admin_trading_api
from .user_routes import admin_user_api
from .wallet_routes import admin_wallet_api
from .withdrawal_routes import admin_withdrawal_api
from .settings_routes import admin_settings_api
from .notification_routes import admin_notification_api
from .support_routes import admin_support_api

admin_api = Blueprint("admin_api", __name__, url_prefix="/api/admin")

admin_api.register_blueprint(admin_auth_api)
admin_api.register_blueprint(admin_dashboard_api)
admin_api.register_blueprint(admin_user_api)
admin_api.register_blueprint(admin_kyc_api)
admin_api.register_blueprint(admin_wallet_api)
admin_api.register_blueprint(admin_withdrawal_api)
admin_api.register_blueprint(admin_trading_api)
admin_api.register_blueprint(admin_market_api)
admin_api.register_blueprint(admin_audit_api)
admin_api.register_blueprint(admin_settings_api)
admin_api.register_blueprint(admin_notification_api)
admin_api.register_blueprint(admin_support_api)


@admin_api.get("/ping")
def admin_ping():
    from utils.response import success_response

    return success_response(
        message="TraidiumX admin backend is running.",
        data={"module": "admin", "status": "healthy"},
    )

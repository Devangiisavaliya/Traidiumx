import os
from flask import Flask, redirect, send_from_directory, request
from flask_cors import CORS

from api.auth_api import auth_api

from api.user_api import user_api
from api.wallet_api import wallet_api
from api.kyc_api import kyc_api
from api.deposit_api import deposit_api
from api.withdrawal_api import withdrawal_api
from api.market_api import market_api
from api.trading_api import trading_api
from api.options_api import options_api
from api.blog_api import blog_api
from api.system_api import system_api
from api.onboarding_api import onboarding_api

from admin.routes import admin_api

try:
    from api.referral_api import referral_api
except ImportError:
    referral_api = None

try:
    from api.fee_api import fee_api
except ImportError:
    fee_api = None

from config.settings import settings
from config.database import ping_database
from services.database_setup_service import create_required_collections
from services.futures_engine_service import start_futures_engine
from utils.response import success_response, error_response


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))
ADMIN_FRONTEND_DIR = os.path.join(FRONTEND_DIR, "admin")


def create_app():
    app = Flask(__name__)

    app.config["MAX_CONTENT_LENGTH"] = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": [
                    settings.FRONTEND_URL,
                    "http://127.0.0.1:5000",
                    "http://localhost:5000",
                    "http://127.0.0.1:5500",
                    "http://localhost:5500"
                ],
                "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization"],
            }
        },
        supports_credentials=True,
    )

    # API Blueprints
    app.register_blueprint(auth_api)
    app.register_blueprint(user_api)
    app.register_blueprint(wallet_api)
    app.register_blueprint(kyc_api)
    app.register_blueprint(deposit_api)
    app.register_blueprint(withdrawal_api)
    app.register_blueprint(market_api)
    app.register_blueprint(trading_api)
    app.register_blueprint(options_api)
    app.register_blueprint(blog_api)
    app.register_blueprint(system_api)
    app.register_blueprint(onboarding_api)

    if admin_api is not None:
        app.register_blueprint(admin_api)

    if referral_api is not None:
        app.register_blueprint(referral_api)

    if fee_api is not None:
        app.register_blueprint(fee_api)


    # Admin Frontend Routes
    def serve_admin_page(relative_path):
        return send_from_directory(ADMIN_FRONTEND_DIR, relative_path)

    @app.get("/admin")
    @app.get("/admin/")
    def admin_index():
        return redirect("/admin/login")

    @app.get("/admin/static/<path:filename>")
    def admin_static_files(filename):
        return send_from_directory(os.path.join(ADMIN_FRONTEND_DIR, "static"), filename)

    @app.get("/admin/login")
    def admin_login_page():
        return serve_admin_page("auth/login.html")

    @app.get("/admin/register")
    def admin_register_page():
        return serve_admin_page("auth/register.html")

    @app.get("/admin/forgot-password")
    def admin_forgot_password_page():
        return serve_admin_page("auth/forgot-password.html")

    @app.get("/admin/dashboard")
    def admin_dashboard_page():
        return serve_admin_page("dashboard/dashboard.html")

    @app.get("/admin/users")
    def admin_users_page():
        return serve_admin_page("users/users.html")

    @app.get("/admin/users/detail")
    def admin_user_detail_page():
        return serve_admin_page("users/user-detail.html")

    @app.get("/admin/kyc")
    def admin_kyc_page():
        return serve_admin_page("kyc/kyc-list.html")

    @app.get("/admin/wallet/deposits")
    def admin_deposits_page():
        return serve_admin_page("wallet/deposits.html")

    @app.get("/admin/wallet/withdrawals")
    def admin_withdrawals_page():
        return serve_admin_page("wallet/withdrawals.html")

    @app.get("/admin/wallet/withdrawal-detail")
    def admin_withdrawal_detail_page():
        return serve_admin_page("wallet/withdrawal-detail.html")

    @app.get("/admin/wallet/ledger")
    def admin_wallet_ledger_page():
        return serve_admin_page("wallet/ledger.html")

    @app.get("/admin/trading/orders")
    def admin_orders_page():
        return serve_admin_page("trading/orders.html")

    @app.get("/admin/trading/positions")
    def admin_positions_page():
        return serve_admin_page("trading/positions.html")

    @app.get("/admin/markets")
    def admin_markets_page():
        from flask import redirect
        return redirect("/admin/dashboard")

    @app.get("/admin/logs/audit")
    def admin_audit_logs_page():
        return serve_admin_page("logs/audit-logs.html")

    @app.get("/admin/settings")
    def admin_settings_page():
        return serve_admin_page("settings/system-settings.html")

    @app.get("/admin/maintenance")
    def admin_maintenance_page():
        return serve_admin_page("settings/maintenance.html")

    @app.get("/admin/notifications")
    def admin_notifications_page():
        return serve_admin_page("notifications/notifications.html")

    # Frontend Home
    @app.get("/")
    def frontend_home():
        return send_from_directory(FRONTEND_DIR, "index.html")

    # Backend Health API
    @app.get("/api/health")
    def health_check():
        return success_response(
            message="TraidiumX backend is running successfully.",
            data={
                "app": settings.APP_NAME,
                "environment": settings.APP_ENV,
                "backend": "Flask",
                "database": "MongoDB Atlas connected",
                "status": "healthy"
            }
        )

    # MongoDB Atlas Test API
    @app.get("/api/db-test")
    def database_test():
        result = ping_database()

        if result["connected"]:
            return success_response(
                message="MongoDB Atlas connection test successful.",
                data=result
            )

        return error_response(
            message="MongoDB Atlas connection test failed.",
            errors=result,
            status_code=500
        )

    # MongoDB Collections Init API
    @app.get("/api/db-init")
    def database_initialize():
        if settings.APP_ENV != "development":
            return error_response(
                message="Database initialization is allowed only in development mode.",
                errors={
                    "environment": settings.APP_ENV
                },
                status_code=403
            )

        result = create_required_collections()

        return success_response(
            message="MongoDB Atlas collections initialized successfully.",
            data=result
        )

    # API Routes List
    @app.get("/api/routes")
    def list_routes():
        routes = []

        for rule in app.url_map.iter_rules():
            routes.append({
                "endpoint": rule.endpoint,
                "methods": sorted(list(rule.methods - {"HEAD", "OPTIONS"})),
                "url": str(rule)
            })

        return success_response(
            message="Available API routes fetched successfully.",
            data={
                "routes": routes
            }
        )

    # Frontend Static Files + Page Routing
    @app.get("/<path:requested_path>")
    def serve_frontend_files(requested_path):
        if requested_path.startswith("api/"):
            return error_response(
                message="API endpoint not found.",
                errors={
                    "hint": "Please check the API URL."
                },
                status_code=404
            )

        requested_file = os.path.join(FRONTEND_DIR, requested_path)

        if os.path.isfile(requested_file):
            return send_from_directory(FRONTEND_DIR, requested_path)

        if os.path.isfile(requested_file + ".html"):
            return send_from_directory(FRONTEND_DIR, requested_path + ".html")

        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.errorhandler(404)
    def not_found(error):
        return error_response(
            message="API endpoint not found.",
            errors={
                "hint": "Please check the URL."
            },
            status_code=404
        )

    @app.errorhandler(500)
    def internal_error(error):
        return error_response(
            message="Internal server error.",
            errors={
                "hint": "Please check terminal logs for details."
            },
            status_code=500
        )

    @app.after_request
    def add_header(response):
        if request.path.startswith("/src/") or request.path.startswith("/admin/static/") or request.path.endswith(".js") or request.path.endswith(".css") or request.path.endswith(".html"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

    # Pending orders, TP/SL and liquidations continue even when every browser
    # tab is closed. The service internally prevents duplicate worker threads.
    start_futures_engine()

    # Start periodic plan monitor background thread
    try:
        from services.plan_monitor_service import start_plan_monitor
        start_plan_monitor()
    except Exception as error:
        print(f"Warning: Failed to start plan monitor: {error}")

    return app


app = create_app()


if __name__ == "__main__":
    print("========================================")
    print(" TraidiumX Backend Starting...")
    print(f" App Name: {settings.APP_NAME}")
    print(f" Environment: {settings.APP_ENV}")
    print(f" URL: http://{settings.APP_HOST}:{settings.APP_PORT}")
    print(" Frontend: /")
    print(" Admin Panel: /admin/login")
    print(" Health API: /api/health")
    print(" DB Test API: /api/db-test")
    print(" DB Init API: /api/db-init")
    print(" Routes API: /api/routes")
    print(" Admin API: /api/admin/ping")
    print("========================================")

    app.run(
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        debug=settings.APP_DEBUG,
        use_reloader=False,
        threaded=True
    )

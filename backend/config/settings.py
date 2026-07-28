import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    APP_NAME = os.getenv("APP_NAME", "TraidiumX")
    APP_ENV = os.getenv("APP_ENV", "development")
    APP_DEBUG = os.getenv("APP_DEBUG", "True").lower() == "true"
    APP_HOST = os.getenv("APP_HOST", "127.0.0.1")
    APP_PORT = int(os.getenv("APP_PORT", 5000))

    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5500")
    # Public URL used in password reset emails.
    # Local PC browser can use 127.0.0.1, but mobile phones cannot open 127.0.0.1 from email links.
    # For phone testing set PASSWORD_RESET_PUBLIC_URL=http://YOUR_PC_WIFI_IP:5000
    PASSWORD_RESET_PUBLIC_URL = os.getenv("PASSWORD_RESET_PUBLIC_URL", "").strip()
    APP_PUBLIC_URL = os.getenv("APP_PUBLIC_URL", "").strip()

    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change_this_secret_before_production")
    JWT_EXPIRES_IN_HOURS = int(os.getenv("JWT_EXPIRES_IN_HOURS", 24))

    MONGO_URI = os.getenv("MONGO_URI", "")
    MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "traidiumx")

    # Google Identity Services / OAuth sign-up configuration.
    # GOOGLE_CLIENT_ID is public-safe for frontend use, but keep it in backend .env so pages do not hard-code app IDs.
    GOOGLE_AUTH_ENABLED = os.getenv("GOOGLE_AUTH_ENABLED", "false").lower() == "true"
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_TOKENINFO_URL = os.getenv("GOOGLE_TOKENINFO_URL", "https://oauth2.googleapis.com/tokeninfo")
    GOOGLE_TOKEN_VERIFY_TIMEOUT = int(os.getenv("GOOGLE_TOKEN_VERIFY_TIMEOUT", 8))


    # Password reset / email delivery configuration.
    PASSWORD_RESET_TOKEN_MINUTES = int(os.getenv("PASSWORD_RESET_TOKEN_MINUTES", 30))
    PASSWORD_RESET_MAX_REQUESTS_PER_HOUR = int(os.getenv("PASSWORD_RESET_MAX_REQUESTS_PER_HOUR", 5))
    PASSWORD_RESET_DEV_LINK_ENABLED = os.getenv("PASSWORD_RESET_DEV_LINK_ENABLED", "true").lower() == "true"

    # Email sign-up verification code configuration.
    # New email registrations must verify the code before user/wallet creation.
    # User requirement: verification code is valid for 120 seconds, with a visible countdown.
    REGISTER_EMAIL_CODE_SECONDS = int(os.getenv("REGISTER_EMAIL_CODE_SECONDS", 120))
    REGISTER_EMAIL_CODE_MINUTES = max(1, (REGISTER_EMAIL_CODE_SECONDS + 59) // 60)
    # User sign-up code resend rule: allow only 3 code sends in a 30 minute window.
    REGISTER_EMAIL_CODE_MAX_REQUESTS = int(os.getenv("REGISTER_EMAIL_CODE_MAX_REQUESTS", 3))
    REGISTER_EMAIL_CODE_LIMIT_MINUTES = int(os.getenv("REGISTER_EMAIL_CODE_LIMIT_MINUTES", 30))
    # Backward-compatible old setting name. New code uses the 30 minute rule above.
    REGISTER_EMAIL_CODE_MAX_REQUESTS_PER_HOUR = int(os.getenv("REGISTER_EMAIL_CODE_MAX_REQUESTS_PER_HOUR", REGISTER_EMAIL_CODE_MAX_REQUESTS))
    REGISTER_EMAIL_DEV_CODE_ENABLED = os.getenv("REGISTER_EMAIL_DEV_CODE_ENABLED", "true").lower() == "true"

    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
    SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", os.getenv("SMTP_USERNAME", ""))
    SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
    SMTP_TIMEOUT_SECONDS = int(os.getenv("SMTP_TIMEOUT_SECONDS", 10))

    # Admin authentication pages configuration.
    # Keep registration enabled for local setup/demo. In production, set ADMIN_REGISTRATION_CODE.
    ADMIN_REGISTER_ENABLED = os.getenv("ADMIN_REGISTER_ENABLED", "true").lower() == "true"
    ADMIN_REGISTRATION_CODE = os.getenv("ADMIN_REGISTRATION_CODE", "").strip()
    ADMIN_PASSWORD_RESET_MAX_REQUESTS_PER_HOUR = int(os.getenv("ADMIN_PASSWORD_RESET_MAX_REQUESTS_PER_HOUR", PASSWORD_RESET_MAX_REQUESTS_PER_HOUR))


    KYC_UPLOAD_FOLDER = os.getenv("KYC_UPLOAD_FOLDER", "uploads/kyc")
    MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", 5))

    BINANCE_FUTURES_BASE_URL = os.getenv("BINANCE_FUTURES_BASE_URL", "https://fapi.binance.com")
    MARKET_REQUEST_TIMEOUT = int(os.getenv("MARKET_REQUEST_TIMEOUT", 10))

    # MetaTrader 5 / broker provisioning integration.
    # METAAPI_TOKEN can be used to connect/import an existing MT5 account.
    # Automatic new MT5 Login ID creation requires a broker/white-label Manager API.
    METAAPI_ENABLED = os.getenv("METAAPI_ENABLED", "false").lower() == "true"
    METAAPI_TOKEN = os.getenv("METAAPI_TOKEN", "").strip()
    METAAPI_REGION = os.getenv("METAAPI_REGION", "new-york").strip()
    METAAPI_PROVISIONING_URL = os.getenv(
        "METAAPI_PROVISIONING_URL",
        "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts",
    ).strip()
    METAAPI_MAGIC = int(os.getenv("METAAPI_MAGIC", 20260716))
    METAAPI_ACCOUNT_MODE = os.getenv("METAAPI_ACCOUNT_MODE", "manager").strip()
    METAAPI_MANAGER_BASE_URL = os.getenv("METAAPI_MANAGER_BASE_URL", "https://mt-manager-api-v1.new-york.agiliumtrade.ai").strip()
    METAAPI_PROVISIONING_BASE_URL = os.getenv("METAAPI_PROVISIONING_BASE_URL", "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai").strip()
    METAAPI_PROVISIONING_PROFILE_ID = os.getenv("METAAPI_PROVISIONING_PROFILE_ID", "").strip()
    METAAPI_MT5_SERVER_NAME = os.getenv("METAAPI_MT5_SERVER_NAME", "").strip()
    METAAPI_MT5_ACCOUNT_TYPE = os.getenv("METAAPI_MT5_ACCOUNT_TYPE", "").strip()
    METAAPI_MT5_BASIC_GROUP = os.getenv("METAAPI_MT5_BASIC_GROUP", "").strip()
    METAAPI_MT5_STANDARD_GROUP = os.getenv("METAAPI_MT5_STANDARD_GROUP", "").strip()
    METAAPI_MT5_ADVANCED_GROUP = os.getenv("METAAPI_MT5_ADVANCED_GROUP", "").strip()
    METAAPI_MT5_LEVERAGE = int(os.getenv("METAAPI_MT5_LEVERAGE", 100))
    METAAPI_MT5_BROKER_KEYWORDS = os.getenv("METAAPI_MT5_BROKER_KEYWORDS", "TraidiumX").strip()
    METAAPI_DEFAULT_COUNTRY = os.getenv("METAAPI_DEFAULT_COUNTRY", "India").strip()
    METAAPI_DEFAULT_STATE = os.getenv("METAAPI_DEFAULT_STATE", "Gujarat").strip()
    METAAPI_DEFAULT_CITY = os.getenv("METAAPI_DEFAULT_CITY", "Ahmedabad").strip()
    METAAPI_DEFAULT_ZIP = os.getenv("METAAPI_DEFAULT_ZIP", "000000").strip()
    METAAPI_DEFAULT_ADDRESS = os.getenv("METAAPI_DEFAULT_ADDRESS", "Not provided").strip()
    METAAPI_REQUEST_TIMEOUT = int(os.getenv("METAAPI_REQUEST_TIMEOUT", 20))
    METAAPI_CREDENTIAL_LINK_HOURS = int(os.getenv("METAAPI_CREDENTIAL_LINK_HOURS", 24))
    METAAPI_CREDENTIAL_ENCRYPTION_KEY = os.getenv("METAAPI_CREDENTIAL_ENCRYPTION_KEY", "").strip()

    PLAN_MONITOR_ENABLED = os.getenv("PLAN_MONITOR_ENABLED", "true").lower() == "true"
    PLAN_MONITOR_INTERVAL_SECONDS = int(os.getenv("PLAN_MONITOR_INTERVAL_SECONDS", 60))

    MT5_PROVISIONING_API_URL = os.getenv("MT5_PROVISIONING_API_URL", "").strip()
    MT5_PROVISIONING_API_KEY = os.getenv("MT5_PROVISIONING_API_KEY", "").strip()
    MT5_PASSWORD_API_URL = os.getenv("MT5_PASSWORD_API_URL", "").strip()
    MT5_GROUP_API_URL = os.getenv("MT5_GROUP_API_URL", "").strip()
    MT5_FUNDING_API_URL = os.getenv("MT5_FUNDING_API_URL", "").strip()
    MT5_BROKER_NAME = os.getenv("MT5_BROKER_NAME", "TraidiumX Broker").strip()
    MT5_SERVER_NAME = os.getenv("MT5_SERVER_NAME", "TraidiumX-Live").strip()
    MT5_ACCOUNT_CURRENCY = os.getenv("MT5_ACCOUNT_CURRENCY", "USD").strip()
    MT5_API_TIMEOUT_SECONDS = int(os.getenv("MT5_API_TIMEOUT_SECONDS", 15))

    # Central server-side Futures engine. Browser JavaScript never executes
    # pending orders, TP/SL, or liquidation decisions.
    FUTURES_ENGINE_ENABLED = os.getenv("FUTURES_ENGINE_ENABLED", "true").lower() == "true"
    FUTURES_ENGINE_INTERVAL_SECONDS = float(os.getenv("FUTURES_ENGINE_INTERVAL_SECONDS", 0.75))

    GOLD_PRICE_PROVIDER = os.getenv("GOLD_PRICE_PROVIDER", "goldapi")
    GOLD_API_KEY = os.getenv("GOLD_API_KEY", "")
    GOLD_API_BASE_URL = os.getenv("GOLD_API_BASE_URL", "https://www.goldapi.io/api")
    GOLD_API_METAL = os.getenv("GOLD_API_METAL", "XAU")
    GOLD_API_CURRENCY = os.getenv("GOLD_API_CURRENCY", "USD")
    GOLD_PRICE_CACHE_SECONDS = int(os.getenv("GOLD_PRICE_CACHE_SECONDS", 2))
    GOLD_ENABLE_YAHOO_FALLBACK = os.getenv("GOLD_ENABLE_YAHOO_FALLBACK", "true")
    
    MAX_OPEN_POSITIONS = int(os.getenv("MAX_OPEN_POSITIONS", 10))
    MAX_ORDER_NOTIONAL = float(os.getenv("MAX_ORDER_NOTIONAL", 100000))
    MAX_MARGIN_PER_ORDER_PERCENT = float(os.getenv("MAX_MARGIN_PER_ORDER_PERCENT", 80))
    MAX_TOTAL_MARGIN_USAGE_PERCENT = float(os.getenv("MAX_TOTAL_MARGIN_USAGE_PERCENT", 90))
    WALLET_SAFETY_BUFFER = float(os.getenv("WALLET_SAFETY_BUFFER", 10))
    MAINTENANCE_MARGIN_RATE = float(os.getenv("MAINTENANCE_MARGIN_RATE", 0.005))

    # Crypto deposit address configuration. Keep real addresses only in backend/.env.
    # These addresses are displayed from backend to authenticated users; never hard-code secrets in frontend.
    CRYPTO_DEPOSIT_USDT_TRC20_ADDRESS = os.getenv("CRYPTO_DEPOSIT_USDT_TRC20_ADDRESS", "")
    CRYPTO_DEPOSIT_USDT_ERC20_ADDRESS = os.getenv("CRYPTO_DEPOSIT_USDT_ERC20_ADDRESS", "")
    CRYPTO_DEPOSIT_USDT_BEP20_ADDRESS = os.getenv("CRYPTO_DEPOSIT_USDT_BEP20_ADDRESS", "")
    CRYPTO_DEPOSIT_MIN_USDT = float(os.getenv("CRYPTO_DEPOSIT_MIN_USDT", 10))
    CRYPTO_DEPOSIT_MAX_USDT = float(os.getenv("CRYPTO_DEPOSIT_MAX_USDT", 1000000))
    CRYPTO_WITHDRAWAL_MIN_USDT = float(os.getenv("CRYPTO_WITHDRAWAL_MIN_USDT", 10))
    CRYPTO_WITHDRAWAL_MAX_USDT = float(os.getenv("CRYPTO_WITHDRAWAL_MAX_USDT", 1000000))
    CRYPTO_WITHDRAWAL_NETWORK_FEE_USDT = float(os.getenv("CRYPTO_WITHDRAWAL_NETWORK_FEE_USDT", 0))
    
    # Company-level crypto wallet automation configuration.
    # Keep real provider keys/RPC URLs only in backend/.env.
    CRYPTO_DEPOSIT_AUTO_VERIFY = os.getenv("CRYPTO_DEPOSIT_AUTO_VERIFY", "true").lower() == "true"
    CRYPTO_WITHDRAWAL_PROCESSING_MODE = os.getenv("CRYPTO_WITHDRAWAL_PROCESSING_MODE", "backend_operations")
    CRYPTO_TRC20_REQUIRED_CONFIRMATIONS = int(os.getenv("CRYPTO_TRC20_REQUIRED_CONFIRMATIONS", 20))
    CRYPTO_ERC20_REQUIRED_CONFIRMATIONS = int(os.getenv("CRYPTO_ERC20_REQUIRED_CONFIRMATIONS", 12))
    CRYPTO_BEP20_REQUIRED_CONFIRMATIONS = int(os.getenv("CRYPTO_BEP20_REQUIRED_CONFIRMATIONS", 15))

    TRONGRID_BASE_URL = os.getenv("TRONGRID_BASE_URL", "https://api.trongrid.io")
    TRONGRID_API_KEY = os.getenv("TRONGRID_API_KEY", "")
    CRYPTO_ERC20_RPC_URL = os.getenv("CRYPTO_ERC20_RPC_URL", "")
    CRYPTO_BEP20_RPC_URL = os.getenv("CRYPTO_BEP20_RPC_URL", "")

    DIGIO_CLIENT_ID = os.getenv("DIGIO_CLIENT_ID", "").strip()
    DIGIO_CLIENT_SECRET = os.getenv("DIGIO_CLIENT_SECRET", "").strip()
    DIGIO_TEMPLATE_NAME = os.getenv("DIGIO_TEMPLATE_NAME", "DEFAULT_DIGILOCKER_TEMPLATE").strip()
    DIGIO_ENVIRONMENT = os.getenv("DIGIO_ENVIRONMENT", "sandbox").strip()

    RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
    RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()

    @property
    def DIGIO_BASE_URL(self):
        if self.DIGIO_ENVIRONMENT.lower() == "production":
            return "https://api.digio.in"
        return "https://ext.digio.in:444"


settings = Settings()
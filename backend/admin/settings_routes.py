from datetime import datetime, timezone

from flask import Blueprint, g, request

from config.database import get_database
from config.settings import settings as app_settings
from utils.response import success_response, error_response
from services.notification_service import create_bulk_user_notifications
from services.email_service import send_maintenance_notice_email


admin_settings_api = Blueprint(
    "admin_settings_api",
    __name__,
    url_prefix="/settings"
)

SETTINGS_KEY = "main"


DEFAULT_SETTINGS = {
    "settings_key": SETTINGS_KEY,

    "platform_status": "trading_enabled",
    "maintenance_message": "System running normally.",

    "allow_new_registrations": True,
    "require_email_verification": True,

    # User trading onboarding / platform selection.
    "platform_selection_enabled": True,
    "traidiumx_platform_enabled": True,
    "mt5_platform_enabled": True,
    "auto_restore_preferred_plan": True,

    "basic_plan_spread_type": "fixed",
    "basic_plan_spread_value": 18.0,
    "basic_plan_minimum_balance": 0,
    "standard_plan_spread_type": "fixed",
    "standard_plan_spread_value": 12.0,
    "standard_plan_minimum_balance": 2000,
    "advanced_plan_spread_type": "fixed",
    "advanced_plan_spread_value": 5.0,
    "advanced_plan_minimum_balance": 5000,

    "default_max_leverage": 20,
    "min_order_notional": 10,
    "max_order_notional": 10000,

    "enable_futures_trading": True,
    "enable_options_trading": True,
    "enable_auto_liquidation": True,

    "withdrawal_review_limit": 10000,
    "daily_withdrawal_limit": 50000,
    "kyc_manual_review_score": 70,

    "require_kyc_for_withdrawals": True,
    "auto_approve_low_risk_kyc": False,
    "pause_withdrawals": False,

    "enable_platform_charge": False,
    "platform_charge_type": "percentage",
    "platform_charge_value": 0,
    "platform_charge_min": 0,
    "platform_charge_max": 0,
    "platform_charge_apply_futures": True,
    "platform_charge_apply_options": True,

    # Separate account/platform usage fee. Trading fee above remains unchanged.
    "enable_account_platform_fee": False,
    "account_platform_fee_type": "fixed",
    "account_platform_fee_value": 0,
    "account_platform_fee_min": 0,
    "account_platform_fee_max": 0,
    "account_platform_fee_cycle": "one_time",

    "enable_withdrawal_fee": False,
    "withdrawal_fee_type": "fixed",
    "withdrawal_fee_value": 0,
    "withdrawal_fee_min": 0,
    "withdrawal_fee_max": 0,
    "withdrawal_fee_trc20": 0,
    "withdrawal_fee_bep20": 0,
    "withdrawal_fee_erc20": 0,

    "crypto_deposit_usdt_trc20_address": getattr(app_settings, "CRYPTO_DEPOSIT_USDT_TRC20_ADDRESS", "") or "TQp9K7vY3Wm2N8rF4cL6Xh5A1BzDgE2sRZ",
    "crypto_deposit_usdt_erc20_address": getattr(app_settings, "CRYPTO_DEPOSIT_USDT_ERC20_ADDRESS", "") or "0x8A4b2C5D7e9F0a1B3c4D6E8F901234567890AbCd",
    "crypto_deposit_usdt_bep20_address": getattr(app_settings, "CRYPTO_DEPOSIT_USDT_BEP20_ADDRESS", "") or "0xB2C7e9F1A4d6E8b0C3f5A7D9e1B234567890cDEF",
    "crypto_deposit_min_usdt": getattr(app_settings, "CRYPTO_DEPOSIT_MIN_USDT", 10),
    "crypto_deposit_max_usdt": getattr(app_settings, "CRYPTO_DEPOSIT_MAX_USDT", 1000000),
    "min_main_wallet_balance": 0.0,
    "usdt_inr_rate": 88.50,
    "inr_deposit_upi_id": "traidiumx@upi",
    "inr_deposit_account_name": "TraidiumX Trading Services Ltd",
    "inr_deposit_bank_name": "HDFC Bank",
    "inr_deposit_account_number": "50100498765432",
    "inr_deposit_ifsc_code": "HDFC0000128",



    "admin_session_timeout": 30,
    "max_failed_login_attempts": 5,
    "admin_ip_allowlist": "",

    "require_admin_2fa": True,
    "enable_audit_logging": True,

    "binance_api_key": "",
    "binance_secret_key": "",
    "binance_is_testnet": True,
}




def _maintenance_is_active(settings_doc):
    return str((settings_doc or {}).get("platform_status") or "").strip().lower() == "maintenance_mode"


def _broadcast_maintenance_notice(settings_doc, admin_id=None, admin_email=None):
    """Best-effort email + in-app notification broadcast when maintenance is enabled."""
    db = get_database()
    message = str((settings_doc or {}).get("maintenance_message") or "TraidiumX is under maintenance. Please try again later.").strip()
    users = list(db.users.find({}, {"_id": 1, "email": 1, "name": 1, "full_name": 1, "username": 1}))

    resolved_admin_id = admin_id if admin_id is not None else getattr(g, "current_admin_id", "")
    resolved_admin_email = admin_email if admin_email is not None else getattr(g, "current_admin_email", "")

    notification_result = create_bulk_user_notifications(
        users=users,
        title="Maintenance Mode Active",
        message=message,
        notice_type="maintenance",
        severity="warning",
        metadata={
            "platform_status": "maintenance_mode",
            "maintenance_message": message,
        },
        admin_id=resolved_admin_id,
        admin_email=resolved_admin_email,
    )

    attempted = 0
    sent = 0
    failed = 0
    last_reason = ""

    for user in users:
        email = str(user.get("email") or "").strip()
        if not email:
            continue
        attempted += 1
        result = send_maintenance_notice_email(
            to_email=email,
            user_name=user.get("name") or user.get("full_name") or user.get("username") or "",
            maintenance_message=message,
        )
        if result.get("sent"):
            sent += 1
        else:
            failed += 1
            last_reason = result.get("reason") or last_reason

    return {
        "notification_created_count": notification_result.get("inserted_count", 0),
        "email_attempted_count": attempted,
        "email_sent_count": sent,
        "email_failed_count": failed,
        "last_email_reason": last_reason,
    }

def get_settings_collection():
    return get_database().system_settings


def clean_mongo_document(doc):
    if not doc:
        return {}

    doc.pop("_id", None)

    if isinstance(doc.get("updated_at"), datetime):
        doc["updated_at"] = doc["updated_at"].isoformat()

    return doc


def to_bool(value, default=False):
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        value = value.strip().lower()

        if value in ["true", "1", "yes", "on"]:
            return True

        if value in ["false", "0", "no", "off"]:
            return False

    return default


def to_number(value, default=0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_fee_type(value, default="percentage"):
    value = str(value or "").strip().lower()
    return value if value in {"percentage", "fixed"} else default




def normalize_account_platform_fee_type(value, default="fixed"):
    # Real-company platform fee is a fixed USDT account/platform usage charge.
    # Keep accepting old percentage payloads safely, but always store it as fixed
    # so admin saving does not fail and users are not charged a balance percent.
    return "fixed"

def normalize_platform_fee_cycle(value, default="one_time"):
    value = str(value or "").strip().lower().replace("-", "_")
    aliases = {
        "one-time": "one_time",
        "one time": "one_time",
        "one_time": "one_time",
        "daily": "daily",
        "monthly": "monthly",
    }
    return aliases.get(value, default)


def normalize_platform_status(value):
    value = str(value or "").strip()

    status_map = {
        "Trading Enabled": "trading_enabled",
        "Maintenance Mode": "maintenance_mode",
        "Withdrawals Paused": "withdrawals_paused",
        "Trading Paused": "trading_paused",

        "trading_enabled": "trading_enabled",
        "maintenance_mode": "maintenance_mode",
        "withdrawals_paused": "withdrawals_paused",
        "trading_paused": "trading_paused",
    }

    return status_map.get(value, "trading_enabled")


def clean_address_value(value):
    return str(value or "").strip().replace(" ", "")


def normalize_min_deposit(value):
    number = to_number(value, DEFAULT_SETTINGS["crypto_deposit_min_usdt"])
    return max(number, 0)


def normalize_max_deposit(value, minimum_value=None):
    number = to_number(value, DEFAULT_SETTINGS["crypto_deposit_max_usdt"])
    minimum = normalize_min_deposit(minimum_value)
    return max(number, minimum)


def clean_settings_payload(data):
    return {
        "settings_key": SETTINGS_KEY,

        "platform_status": normalize_platform_status(data.get("platform_status")),
        "maintenance_message": str(data.get("maintenance_message") or ""),

        "allow_new_registrations": to_bool(
            data.get("allow_new_registrations"),
            DEFAULT_SETTINGS["allow_new_registrations"]
        ),
        "require_email_verification": to_bool(
            data.get("require_email_verification"),
            DEFAULT_SETTINGS["require_email_verification"]
        ),

        "platform_selection_enabled": to_bool(
            data.get("platform_selection_enabled"),
            DEFAULT_SETTINGS["platform_selection_enabled"]
        ),
        "traidiumx_platform_enabled": to_bool(
            data.get("traidiumx_platform_enabled"),
            DEFAULT_SETTINGS["traidiumx_platform_enabled"]
        ),
        "mt5_platform_enabled": to_bool(
            data.get("mt5_platform_enabled"),
            DEFAULT_SETTINGS["mt5_platform_enabled"]
        ),
        "auto_restore_preferred_plan": to_bool(
            data.get("auto_restore_preferred_plan"),
            DEFAULT_SETTINGS["auto_restore_preferred_plan"]
        ),
        "basic_plan_spread_type": str(data.get("basic_plan_spread_type") or "fixed").strip().lower() if str(data.get("basic_plan_spread_type") or "").strip().lower() in ["fixed", "percentage"] else "fixed",
        "basic_plan_spread_value": max(0.0, to_number(data.get("basic_plan_spread_value"), DEFAULT_SETTINGS["basic_plan_spread_value"])),
        "basic_plan_minimum_balance": max(0, to_number(data.get("basic_plan_minimum_balance"), DEFAULT_SETTINGS["basic_plan_minimum_balance"])),
        "standard_plan_spread_type": str(data.get("standard_plan_spread_type") or "fixed").strip().lower() if str(data.get("standard_plan_spread_type") or "").strip().lower() in ["fixed", "percentage"] else "fixed",
        "standard_plan_spread_value": max(0.0, to_number(data.get("standard_plan_spread_value"), DEFAULT_SETTINGS["standard_plan_spread_value"])),
        "standard_plan_minimum_balance": max(0, to_number(data.get("standard_plan_minimum_balance"), DEFAULT_SETTINGS["standard_plan_minimum_balance"])),
        "advanced_plan_spread_type": str(data.get("advanced_plan_spread_type") or "fixed").strip().lower() if str(data.get("advanced_plan_spread_type") or "").strip().lower() in ["fixed", "percentage"] else "fixed",
        "advanced_plan_spread_value": max(0.0, to_number(data.get("advanced_plan_spread_value"), DEFAULT_SETTINGS["advanced_plan_spread_value"])),
        "advanced_plan_minimum_balance": max(0, to_number(data.get("advanced_plan_minimum_balance"), DEFAULT_SETTINGS["advanced_plan_minimum_balance"])),

        "default_max_leverage": to_number(
            data.get("default_max_leverage"),
            DEFAULT_SETTINGS["default_max_leverage"]
        ),
        "min_order_notional": to_number(
            data.get("min_order_notional"),
            DEFAULT_SETTINGS["min_order_notional"]
        ),
        "max_order_notional": to_number(
            data.get("max_order_notional"),
            DEFAULT_SETTINGS["max_order_notional"]
        ),

        "enable_futures_trading": to_bool(
            data.get("enable_futures_trading"),
            DEFAULT_SETTINGS["enable_futures_trading"]
        ),
        "enable_options_trading": to_bool(
            data.get("enable_options_trading"),
            DEFAULT_SETTINGS["enable_options_trading"]
        ),
        "enable_auto_liquidation": to_bool(
            data.get("enable_auto_liquidation"),
            DEFAULT_SETTINGS["enable_auto_liquidation"]
        ),

        "withdrawal_review_limit": to_number(
            data.get("withdrawal_review_limit"),
            DEFAULT_SETTINGS["withdrawal_review_limit"]
        ),
        "daily_withdrawal_limit": to_number(
            data.get("daily_withdrawal_limit"),
            DEFAULT_SETTINGS["daily_withdrawal_limit"]
        ),
        "kyc_manual_review_score": to_number(
            data.get("kyc_manual_review_score"),
            DEFAULT_SETTINGS["kyc_manual_review_score"]
        ),

        # Product rule: KYC is mandatory only at withdrawal.
        "require_kyc_for_withdrawals": True,
        "auto_approve_low_risk_kyc": to_bool(
            data.get("auto_approve_low_risk_kyc"),
            DEFAULT_SETTINGS["auto_approve_low_risk_kyc"]
        ),
        "pause_withdrawals": to_bool(
            data.get("pause_withdrawals"),
            DEFAULT_SETTINGS["pause_withdrawals"]
        ),

        "enable_platform_charge": to_bool(
            data.get("enable_platform_charge"),
            DEFAULT_SETTINGS["enable_platform_charge"]
        ),
        "platform_charge_type": normalize_fee_type(
            data.get("platform_charge_type"),
            DEFAULT_SETTINGS["platform_charge_type"]
        ),
        "platform_charge_value": to_number(
            data.get("platform_charge_value"),
            DEFAULT_SETTINGS["platform_charge_value"]
        ),
        "platform_charge_min": to_number(
            data.get("platform_charge_min"),
            DEFAULT_SETTINGS["platform_charge_min"]
        ),
        "platform_charge_max": to_number(
            data.get("platform_charge_max"),
            DEFAULT_SETTINGS["platform_charge_max"]
        ),
        "platform_charge_apply_futures": to_bool(
            data.get("platform_charge_apply_futures"),
            DEFAULT_SETTINGS["platform_charge_apply_futures"]
        ),
        "platform_charge_apply_options": to_bool(
            data.get("platform_charge_apply_options"),
            DEFAULT_SETTINGS["platform_charge_apply_options"]
        ),

        "enable_account_platform_fee": to_bool(
            data.get("enable_account_platform_fee"),
            DEFAULT_SETTINGS["enable_account_platform_fee"]
        ),
        "account_platform_fee_type": normalize_account_platform_fee_type(
            data.get("account_platform_fee_type"),
            DEFAULT_SETTINGS["account_platform_fee_type"]
        ),
        "account_platform_fee_value": to_number(
            data.get("account_platform_fee_value"),
            DEFAULT_SETTINGS["account_platform_fee_value"]
        ),
        "account_platform_fee_min": to_number(
            data.get("account_platform_fee_min"),
            DEFAULT_SETTINGS["account_platform_fee_min"]
        ),
        "account_platform_fee_max": to_number(
            data.get("account_platform_fee_max"),
            DEFAULT_SETTINGS["account_platform_fee_max"]
        ),
        "account_platform_fee_cycle": normalize_platform_fee_cycle(
            data.get("account_platform_fee_cycle"),
            DEFAULT_SETTINGS["account_platform_fee_cycle"]
        ),

        "enable_withdrawal_fee": to_bool(
            data.get("enable_withdrawal_fee"),
            DEFAULT_SETTINGS["enable_withdrawal_fee"]
        ),
        "withdrawal_fee_type": normalize_fee_type(
            data.get("withdrawal_fee_type"),
            DEFAULT_SETTINGS["withdrawal_fee_type"]
        ),
        "withdrawal_fee_value": to_number(
            data.get("withdrawal_fee_value"),
            DEFAULT_SETTINGS["withdrawal_fee_value"]
        ),
        "withdrawal_fee_min": to_number(
            data.get("withdrawal_fee_min"),
            DEFAULT_SETTINGS["withdrawal_fee_min"]
        ),
        "withdrawal_fee_max": to_number(
            data.get("withdrawal_fee_max"),
            DEFAULT_SETTINGS["withdrawal_fee_max"]
        ),
        "withdrawal_fee_trc20": to_number(
            data.get("withdrawal_fee_trc20"),
            DEFAULT_SETTINGS["withdrawal_fee_trc20"]
        ),
        "withdrawal_fee_bep20": to_number(
            data.get("withdrawal_fee_bep20"),
            DEFAULT_SETTINGS["withdrawal_fee_bep20"]
        ),
        "withdrawal_fee_erc20": to_number(
            data.get("withdrawal_fee_erc20"),
            DEFAULT_SETTINGS["withdrawal_fee_erc20"]
        ),

        "crypto_deposit_usdt_trc20_address": clean_address_value(
            data.get("crypto_deposit_usdt_trc20_address")
            or DEFAULT_SETTINGS["crypto_deposit_usdt_trc20_address"]
        ),
        "crypto_deposit_usdt_erc20_address": clean_address_value(
            data.get("crypto_deposit_usdt_erc20_address")
            or DEFAULT_SETTINGS["crypto_deposit_usdt_erc20_address"]
        ),
        "crypto_deposit_usdt_bep20_address": clean_address_value(
            data.get("crypto_deposit_usdt_bep20_address")
            or DEFAULT_SETTINGS["crypto_deposit_usdt_bep20_address"]
        ),
        "crypto_deposit_min_usdt": normalize_min_deposit(
            data.get("crypto_deposit_min_usdt")
        ),
        "crypto_deposit_max_usdt": normalize_max_deposit(
            data.get("crypto_deposit_max_usdt"),
            data.get("crypto_deposit_min_usdt")
        ),
        "min_main_wallet_balance": to_number(
            data.get("min_main_wallet_balance"),
            DEFAULT_SETTINGS["min_main_wallet_balance"]
        ),
        "usdt_inr_rate": max(0.01, to_number(data.get("usdt_inr_rate"), DEFAULT_SETTINGS.get("usdt_inr_rate", 88.50))),
        "inr_deposit_upi_id": str(data.get("inr_deposit_upi_id") or "traidiumx@upi").strip(),
        "inr_deposit_account_name": str(data.get("inr_deposit_account_name") or "TraidiumX Trading Services Ltd").strip(),
        "inr_deposit_bank_name": str(data.get("inr_deposit_bank_name") or "HDFC Bank").strip(),
        "inr_deposit_account_number": str(data.get("inr_deposit_account_number") or "50100498765432").strip(),
        "inr_deposit_ifsc_code": str(data.get("inr_deposit_ifsc_code") or "HDFC0000128").strip(),



        "admin_session_timeout": to_number(
            data.get("admin_session_timeout"),
            DEFAULT_SETTINGS["admin_session_timeout"]
        ),
        "max_failed_login_attempts": to_number(
            data.get("max_failed_login_attempts"),
            DEFAULT_SETTINGS["max_failed_login_attempts"]
        ),
        "admin_ip_allowlist": str(data.get("admin_ip_allowlist") or ""),

        "require_admin_2fa": to_bool(
            data.get("require_admin_2fa"),
            DEFAULT_SETTINGS["require_admin_2fa"]
        ),
        "enable_audit_logging": to_bool(
            data.get("enable_audit_logging"),
            DEFAULT_SETTINGS["enable_audit_logging"]
        ),

        "binance_api_key": str(data.get("binance_api_key") or "").strip(),
        "binance_secret_key": str(data.get("binance_secret_key") or "").strip(),
        "binance_is_testnet": to_bool(
            data.get("binance_is_testnet"),
            DEFAULT_SETTINGS["binance_is_testnet"]
        ),

        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def get_final_settings():
    collection = get_settings_collection()

    saved = clean_mongo_document(
        collection.find_one({"settings_key": SETTINGS_KEY})
    )

    final_settings = {
        **DEFAULT_SETTINGS,
        **saved,
        "settings_key": SETTINGS_KEY,
    }

    return final_settings


@admin_settings_api.get("")
@admin_settings_api.get("/")
def get_settings():
    collection = get_settings_collection()

    settings = get_final_settings()

    collection.update_one(
        {"settings_key": SETTINGS_KEY},
        {"$set": settings},
        upsert=True
    )

    return success_response(
        message="Settings fetched successfully.",
        data=settings
    )


@admin_settings_api.put("")
@admin_settings_api.put("/")
def update_settings():
    data = request.get_json(silent=True) or {}

    if not isinstance(data, dict):
        return error_response(
            message="Invalid settings payload.",
            errors={"settings": "JSON object required."},
            status_code=400
        )

    trc20 = str(data.get("crypto_deposit_usdt_trc20_address") or "").strip().replace(" ", "")
    erc20 = str(data.get("crypto_deposit_usdt_erc20_address") or "").strip().replace(" ", "")
    bep20 = str(data.get("crypto_deposit_usdt_bep20_address") or "").strip().replace(" ", "")

    if not trc20 or len(trc20) != 34 or not trc20.startswith("T"):
        return error_response(
            message="TRC20 USDT Address must be exactly 34 characters and start with 'T'.",
            status_code=400
        )
    if not erc20 or len(erc20) != 42 or not (erc20.startswith("0x") or erc20.startswith("0X")):
        return error_response(
            message="ERC20 USDT Address must be exactly 42 characters and start with '0x'.",
            status_code=400
        )
    if not bep20 or len(bep20) != 42 or not (bep20.startswith("0x") or bep20.startswith("0X")):
        return error_response(
            message="BEP20 USDT Address must be exactly 42 characters and start with '0x'.",
            status_code=400
        )

    if not to_bool(data.get("traidiumx_platform_enabled"), True) and not to_bool(data.get("mt5_platform_enabled"), True):
        return error_response(
            message="At least one trading platform must remain enabled.",
            errors={"platforms": "Enable TraidiumX or MetaTrader 5."},
            status_code=422,
        )

    basic_min = to_number(data.get("basic_plan_minimum_balance"), DEFAULT_SETTINGS["basic_plan_minimum_balance"])
    standard_min = to_number(data.get("standard_plan_minimum_balance"), DEFAULT_SETTINGS["standard_plan_minimum_balance"])
    advanced_min = to_number(data.get("advanced_plan_minimum_balance"), DEFAULT_SETTINGS["advanced_plan_minimum_balance"])
    if not (0 <= basic_min <= standard_min <= advanced_min):
        return error_response(
            message="Plan minimum balances must be ordered Basic <= Standard <= Advanced.",
            errors={"plans": "Check the three plan minimum balance values."},
            status_code=422,
        )

    previous_settings = get_final_settings()
    settings = clean_settings_payload(data)

    collection = get_settings_collection()

    collection.update_one(
        {"settings_key": SETTINGS_KEY},
        {"$set": settings},
        upsert=True
    )

    final_settings = get_final_settings()

    notice_delivery = None
    if (not _maintenance_is_active(previous_settings)) and _maintenance_is_active(final_settings):
        import threading
        admin_id = getattr(g, "current_admin_id", "")
        admin_email = getattr(g, "current_admin_email", "")
        
        # Run in a background thread to prevent blocking the HTTP response thread
        thread = threading.Thread(
            target=_broadcast_maintenance_notice,
            args=(final_settings, admin_id, admin_email)
        )
        thread.daemon = True
        thread.start()
        
        notice_delivery = {
            "status": "processing_in_background",
            "message": "Bulk email and notifications started in background."
        }
        final_settings["maintenance_notice_delivery"] = notice_delivery

    print("ADMIN SETTINGS UPDATED:", final_settings)

    return success_response(
        message=("Settings updated successfully. Maintenance email and user notifications queued in the background." if notice_delivery else "Settings updated successfully."),
        data=final_settings
    )


@admin_settings_api.post("/reset")
def reset_settings():
    collection = get_settings_collection()

    settings = {
        **DEFAULT_SETTINGS,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    collection.update_one(
        {"settings_key": SETTINGS_KEY},
        {"$set": settings},
        upsert=True
    )

    final_settings = get_final_settings()

    print("ADMIN SETTINGS RESET:", final_settings)

    return success_response(
        message="Settings reset successfully.",
        data=final_settings
    )
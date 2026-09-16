from flask import Blueprint, g, request

from config.database import get_database
from middleware.auth_middleware import auth_required, auth_required_allow_restricted
from services.user_status_service import is_user_active
from services.withdrawal_service import (
    cancel_withdrawal_request,
    complete_withdrawal_for_development,
    create_withdrawal_request,
    get_withdrawal_history,
)
from utils.response import error_response, success_response


withdrawal_api = Blueprint("withdrawal_api", __name__, url_prefix="/api/withdrawal")


def get_system_settings():
    db = get_database()

    default_settings = {
        "pause_withdrawals": False,
        "withdrawal_review_limit": 10000,
        "daily_withdrawal_limit": 50000,
        "require_kyc_for_withdrawals": True,
    }

    settings = (
        db.system_settings
        .find_one({"settings_key": "main"})
        or db.system_settings.find_one(sort=[("updated_at", -1)])
        or {}
    )

    print("WITHDRAW SETTINGS:", settings)
    print("WITHDRAW REVIEW LIMIT:", settings.get("withdrawal_review_limit"))
    print("DAILY WITHDRAW LIMIT:", settings.get("daily_withdrawal_limit"))

    return {
        **default_settings,
        **settings,
    }


def to_float(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def get_withdrawal_amount(data):
    return to_float(
        data.get("amount")
        or data.get("withdraw_amount")
        or data.get("withdrawal_amount")
        or data.get("value")
        or 0
    )


def hide_wallet_payload_for_restricted_user(result):
    """Do not expose total wallet balances in restricted account responses."""

    if result.get("success") and getattr(g, "current_user", None) and not is_user_active(g.current_user):
        data = result.get("data") or {}
        data.pop("wallet", None)
        data["wallet_balance_hidden"] = True
        result["data"] = data

    return result


def validate_withdrawal_settings(data):
    settings = get_system_settings()

    amount = get_withdrawal_amount(data)

    if amount <= 0:
        return {
            "success": False,
            "message": "Withdrawal amount is required.",
            "errors": {
                "amount": "Invalid withdrawal amount."
            },
            "status_code": 422,
        }

    if settings.get("pause_withdrawals") is True:
        return {
            "success": False,
            "message": "Withdrawals are currently paused by admin.",
            "errors": {
                "withdrawal": "Withdrawals paused."
            },
            "status_code": 403,
        }

    withdrawal_limit = to_float(settings.get("withdrawal_review_limit"), 0)

    if withdrawal_limit > 0 and amount > withdrawal_limit:
        return {
            "success": False,
            "message": f"Withdrawal amount exceeds limit of {withdrawal_limit}.",
            "errors": {
                "amount": f"Maximum withdrawal limit is {withdrawal_limit}."
            },
            "status_code": 403,
        }

    daily_limit = to_float(settings.get("daily_withdrawal_limit"), 0)

    if daily_limit > 0 and amount > daily_limit:
        return {
            "success": False,
            "message": f"Withdrawal amount exceeds daily limit of {daily_limit}.",
            "errors": {
                "amount": f"Daily withdrawal limit is {daily_limit}."
            },
            "status_code": 403,
        }

    return {
        "success": True,
        "amount": amount,
        "settings": settings,
    }


@withdrawal_api.post("/request")
@auth_required_allow_restricted
def request_withdrawal():
    data = request.get_json(silent=True) or {}

    settings_check = validate_withdrawal_settings(data)

    if not settings_check["success"]:
        return error_response(
            message=settings_check["message"],
            errors=settings_check["errors"],
            status_code=settings_check["status_code"],
        )

    result = create_withdrawal_request(g.current_user_id, data)
    result = hide_wallet_payload_for_restricted_user(result)

    if result["success"]:
        return success_response(message=result["message"], data=result["data"], status_code=result["status_code"])

    return error_response(message=result["message"], errors=result["errors"], status_code=result["status_code"])


@withdrawal_api.post("/cancel/<withdrawal_id>")
@auth_required_allow_restricted
def cancel(withdrawal_id):
    result = cancel_withdrawal_request(g.current_user_id, withdrawal_id)
    result = hide_wallet_payload_for_restricted_user(result)

    if result["success"]:
        return success_response(message=result["message"], data=result["data"], status_code=result["status_code"])

    return error_response(message=result["message"], errors=result["errors"], status_code=result["status_code"])


@withdrawal_api.get("/history")
@auth_required_allow_restricted
def history():
    parent_id = getattr(g, "token_user_id", None) or str(g.current_user_id)
    target_user_id = str(g.current_user_id)
    sub_account_id = request.args.get("sub_account_id") or request.args.get("sub_user_id")

    if sub_account_id == "main":
        target_user_id = parent_id
    elif sub_account_id and sub_account_id != target_user_id:
        from bson import ObjectId
        from config.database import get_database
        if ObjectId.is_valid(str(sub_account_id)):
            db = get_database()
            sub_user = db.users.find_one({
                "_id": ObjectId(str(sub_account_id)),
                "parent_user_id": parent_id
            })
            if sub_user:
                target_user_id = str(sub_user["_id"])

    result = get_withdrawal_history(target_user_id)
    return success_response(message=result["message"], data=result["data"], status_code=result["status_code"])


@withdrawal_api.post("/dev-complete/<withdrawal_id>")
@auth_required
def dev_complete(withdrawal_id):
    result = complete_withdrawal_for_development(g.current_user_id, withdrawal_id)

    if result["success"]:
        return success_response(message=result["message"], data=result["data"], status_code=result["status_code"])

    return error_response(message=result["message"], errors=result["errors"], status_code=result["status_code"])
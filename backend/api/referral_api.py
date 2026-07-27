from flask import Blueprint, g, request

from middleware.auth_middleware import auth_required
from services.referral_service import (
    get_referral_dashboard,
    submit_affiliate_application,
    validate_referral_code,
)
from utils.response import success_response, error_response


referral_api = Blueprint("referral_api", __name__, url_prefix="/api/referral")


@referral_api.get("/me")
@auth_required
def my_referral_dashboard():
    result = get_referral_dashboard(g.current_user)

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"],
        )

    return error_response(
        message=result["message"],
        errors=result["errors"],
        status_code=result["status_code"],
    )


@referral_api.get("/validate/<referral_code>")
def validate_referral(referral_code):
    result = validate_referral_code(referral_code)

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"],
        )

    return error_response(
        message=result["message"],
        errors=result["errors"],
        status_code=result["status_code"],
    )


@referral_api.post("/affiliate/apply")
@auth_required
def apply_affiliate_program():
    data = request.get_json(silent=True) or {}
    result = submit_affiliate_application(g.current_user, data)

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"],
        )

    return error_response(
        message=result["message"],
        errors=result["errors"],
        status_code=result["status_code"],
    )

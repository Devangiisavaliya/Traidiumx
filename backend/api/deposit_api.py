from flask import Blueprint, g, request

from middleware.auth_middleware import auth_required, auth_required_allow_restricted
from services.deposit_service import (
    complete_deposit_for_development,
    create_deposit_request,
    get_crypto_deposit_addresses,
    get_deposit_history,
    verify_deposit_request,
)
from utils.response import error_response, success_response


deposit_api = Blueprint("deposit_api", __name__, url_prefix="/api/deposit")


@deposit_api.get("/crypto-addresses")
@auth_required
def crypto_addresses():
    result = get_crypto_deposit_addresses(g.current_user_id)
    return success_response(message=result["message"], data=result["data"], status_code=result["status_code"])


@deposit_api.get("/inr-details")
@auth_required
def inr_details():
    from services.system_settings_service import get_inr_deposit_details
    details = get_inr_deposit_details()
    return success_response(message="INR deposit details fetched successfully.", data=details)



@deposit_api.post("/create")
@auth_required
def create():
    try:
        data = request.get_json(silent=True) or {}
        result = create_deposit_request(g.current_user_id, data)

        if result.get("success"):
            return success_response(message=result.get("message", "Deposit created successfully."), data=result.get("data", {}), status_code=result.get("status_code", 200))

        return error_response(message=result.get("message", "Deposit request failed."), errors=result.get("errors", {}), status_code=result.get("status_code", 400))
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error_response(message=f"Deposit processing error: {str(e)}", errors={"system": str(e)}, status_code=500)



@deposit_api.post("/verify/<deposit_id>")
@auth_required
def verify(deposit_id):
    result = verify_deposit_request(g.current_user_id, deposit_id)

    if result["success"]:
        return success_response(message=result["message"], data=result["data"], status_code=result["status_code"])

    return error_response(message=result["message"], errors=result.get("errors", {}), status_code=result["status_code"])


@deposit_api.get("/history")
@auth_required_allow_restricted
def history():
    result = get_deposit_history(g.current_user_id)
    return success_response(message=result["message"], data=result["data"], status_code=result["status_code"])


@deposit_api.post("/dev-complete/<deposit_id>")
@auth_required
def dev_complete(deposit_id):
    result = complete_deposit_for_development(g.current_user_id, deposit_id)

    if result["success"]:
        return success_response(message=result["message"], data=result["data"], status_code=result["status_code"])

    return error_response(message=result["message"], errors=result["errors"], status_code=result["status_code"])

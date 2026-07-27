from flask import Blueprint, request

from services.fee_service import estimate_fee, get_fee_structure
from utils.response import success_response, error_response


fee_api = Blueprint("fee_api", __name__, url_prefix="/api/fees")


@fee_api.get("/structure")
def structure():
    result = get_fee_structure()

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"]
    )


@fee_api.post("/estimate")
def estimate():
    payload = request.get_json(silent=True) or {}
    result = estimate_fee(payload)

    if result["success"]:
        return success_response(
            message=result["message"],
            data=result["data"],
            status_code=result["status_code"]
        )

    return error_response(
        message=result["message"],
        errors=result.get("errors", {}),
        status_code=result["status_code"]
    )

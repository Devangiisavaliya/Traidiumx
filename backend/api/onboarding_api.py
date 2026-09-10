from flask import Blueprint, g, request

from middleware.auth_middleware import auth_required
from models.user_model import find_user_by_id
from services.mt5_service import connect_existing_mt5_account, fund_mt5_account, get_user_mt5_status, provision_mt5_account, setup_mt5_password
from services.trading_plan_service import (
    build_user_trading_profile,
    get_onboarding_settings,
    reconcile_user_plan,
    select_user_plan,
    select_user_platform,
)
from utils.response import error_response, success_response

onboarding_api = Blueprint("onboarding_api", __name__, url_prefix="/api/onboarding")


def _respond(result):
    if result.get("success"):
        data = dict(result.get("data") or {})
        if "mt5" not in data and getattr(g, "current_user_id", None):
            try:
                data["mt5"] = get_user_mt5_status(g.current_user_id).get("data", {})
            except Exception:
                pass
        return success_response(message=result.get("message", "Success."), data=data, status_code=result.get("status_code", 200))
    return error_response(message=result.get("message", "Request failed."), errors=result.get("errors", {}), status_code=result.get("status_code", 400))


@onboarding_api.get("/status")
@auth_required
def status():
    result = reconcile_user_plan(g.current_user_id)
    if not result.get("success"):
        return _respond(result)
    mt5 = get_user_mt5_status(g.current_user_id).get("data", {})
    data = result.get("data", {})
    data["mt5"] = mt5
    return success_response(message="Trading onboarding status loaded.", data=data)


@onboarding_api.get("/config")
@auth_required
def config():
    user = find_user_by_id(g.current_user_id)
    return success_response(message="Trading onboarding configuration loaded.", data={
        "settings": get_onboarding_settings(),
        "profile": build_user_trading_profile(user or {}),
        "mt5": get_user_mt5_status(g.current_user_id).get("data", {}),
    })


@onboarding_api.post("/platform")
@auth_required
def platform():
    data = request.get_json(silent=True) or {}
    return _respond(select_user_platform(g.current_user_id, data.get("platform")))


@onboarding_api.post("/plan")
@auth_required
def plan():
    data = request.get_json(silent=True) or {}
    return _respond(select_user_plan(g.current_user_id, data.get("plan")))


@onboarding_api.post("/reconcile")
@auth_required
def reconcile():
    return _respond(reconcile_user_plan(g.current_user_id, send_notice=True))


@onboarding_api.get("/mt5/status")
@auth_required
def mt5_status():
    return _respond(get_user_mt5_status(g.current_user_id))


@onboarding_api.post("/mt5/provision")
@auth_required
def mt5_provision():
    return _respond(provision_mt5_account(g.current_user_id))


@onboarding_api.post("/mt5/fund")
@auth_required
def mt5_fund():
    data = request.get_json(silent=True) or {}
    return _respond(fund_mt5_account(g.current_user_id, data))


@onboarding_api.post("/mt5/connect-existing")
@auth_required
def mt5_connect_existing():
    data = request.get_json(silent=True) or {}
    return _respond(connect_existing_mt5_account(g.current_user_id, data))


@onboarding_api.post("/mt5/password/setup")
@auth_required
def mt5_password_setup():
    data = request.get_json(silent=True) or {}
    return _respond(setup_mt5_password(g.current_user_id, data))


@onboarding_api.post("/warning/acknowledge")
@auth_required
def warning_acknowledge():
    from config.database import get_database
    from services.trading_plan_service import reconcile_user_plan
    from utils.date_helper import now_utc
    from bson import ObjectId
    
    db = get_database()
    oid = ObjectId(g.current_user_id)
    user = db.users.find_one({"_id": oid})
    if not user:
        return error_response("User not found.", status_code=404)
        
    warnings = int(user.get("downgrade_warnings") or 0)
    new_warnings = warnings + 1
    
    db.users.update_one(
        {"_id": oid},
        {"$set": {"downgrade_warnings": new_warnings, "updated_at": now_utc()}}
    )
    
    result = reconcile_user_plan(g.current_user_id)
    return success_response(
        message=f"Warning acknowledged. Warnings count: {new_warnings}",
        data=result.get("data")
    )

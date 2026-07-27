from flask import Blueprint, request

from utils.response import success_response
from .audit_service import list_admin_audit_logs, get_admin_audit_summary
from .middleware import admin_required
from .permissions import permission_required


admin_audit_api = Blueprint("admin_audit_api", __name__, url_prefix="/audit")


@admin_audit_api.get("/logs")
@admin_required
@permission_required("audit.view")
def audit_logs():
    result = list_admin_audit_logs(
        page=request.args.get("page"),
        limit=request.args.get("limit"),
        action=str(request.args.get("action") or "").strip(),
        admin_email=str(request.args.get("admin_email") or "").strip(),
        resource_type=str(request.args.get("resource_type") or "").strip(),
        status=str(request.args.get("status") or "").strip(),
        search=str(request.args.get("search") or "").strip(),
        date_from=str(request.args.get("from") or request.args.get("date_from") or "").strip(),
        date_to=str(request.args.get("to") or request.args.get("date_to") or "").strip(),
    )

    return success_response(
        message="Admin audit logs fetched successfully.",
        data=result,
    )


@admin_audit_api.get("/logs/summary")
@admin_required
@permission_required("audit.view")
def audit_logs_summary():
    summary = get_admin_audit_summary()

    return success_response(
        message="Admin audit summary fetched successfully.",
        data={"summary": summary},
    )
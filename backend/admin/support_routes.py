from datetime import datetime
from flask import Blueprint, g, request
from config.database import get_database
from utils.response import success_response, error_response
from .middleware import admin_required

admin_support_api = Blueprint("admin_support_api", __name__, url_prefix="/support")

@admin_support_api.get("/tickets")
@admin_required
def get_all_tickets():
    db = get_database()
    tickets_cursor = db.support_tickets.find({}).sort("created_at", -1)
    
    tickets_list = []
    for t in tickets_cursor:
        tickets_list.append({
            "ticket_id": t["ticket_id"],
            "user_id": str(t.get("user_id")),
            "name": t.get("name"),
            "email": t.get("email"),
            "mobile": t.get("mobile"),
            "issue_type": t.get("issue_type"),
            "subject": t.get("subject"),
            "message": t.get("message"),
            "priority": t.get("priority"),
            "status": t.get("status"),
            "created_at": t["created_at"].isoformat() if isinstance(t.get("created_at"), datetime) else str(t.get("created_at", ""))
        })

    return success_response(
        message="All support tickets retrieved successfully.",
        data={"tickets": tickets_list},
        status_code=200
    )

@admin_support_api.post("/ticket/<ticket_id>/status")
@admin_required
def update_ticket_status(ticket_id):
    db = get_database()
    data = request.get_json(silent=True) or {}
    status = (data.get("status") or "").strip()

    if status not in ["Open", "In Progress", "Resolved"]:
        return error_response(
            message="Invalid ticket status.",
            errors={"status": "Status must be 'Open', 'In Progress', or 'Resolved'."},
            status_code=400
        )

    result = db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        {"$set": {"status": status}}
    )

    if result.matched_count == 0:
        return error_response(
            message="Ticket not found.",
            errors={"ticket_id": "No matching ticket ID."},
            status_code=404
        )

    from .audit_service import create_admin_audit_log
    create_admin_audit_log(
        admin_id=str(g.current_admin["_id"]),
        admin_email=g.current_admin.get("email", ""),
        action="UPDATE_SUPPORT_TICKET_STATUS",
        resource_id=ticket_id,
        resource_type="support_ticket",
        status="success",
        message=f"Updated support ticket {ticket_id} status to {status}.",
        metadata={"status": status}
    )

    return success_response(
        message=f"Ticket status updated to {status}.",
        data={"ticket_id": ticket_id, "status": status},
        status_code=200
    )

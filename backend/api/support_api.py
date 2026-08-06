from datetime import datetime
from flask import Blueprint, g, request
from config.database import get_database
from middleware.auth_middleware import auth_required
from utils.response import success_response, error_response

support_api = Blueprint("support_api", __name__, url_prefix="/api/support")

def get_priority_by_issue(issue_type):
    high_priority_issues = ["Wallet", "Futures Trading", "Options Trading", "Technical Bug"]
    medium_priority_issues = ["KYC", "Fee Campaign"]
    if issue_type in high_priority_issues:
        return "High"
    if issue_type in medium_priority_issues:
        return "Medium"
    return "Normal"

@support_api.post("/ticket")
@auth_required
def create_ticket():
    db = get_database()
    data = request.get_json(silent=True) or {}
    
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    mobile = (data.get("mobile") or "").strip()
    issue_type = (data.get("issue_type") or "").strip()
    subject = (data.get("subject") or "").strip()
    message = (data.get("message") or "").strip()
    ticket_id = (data.get("ticket_id") or "").strip()

    if not all([name, email, mobile, issue_type, subject, message, ticket_id]):
        return error_response(
            message="All fields are required.",
            errors={"form": "Missing fields."},
            status_code=400
        )

    # Check unique ticket_id
    existing = db.support_tickets.find_one({"ticket_id": ticket_id})
    if existing:
        return error_response(
            message="Ticket ID already exists.",
            errors={"ticket_id": "Duplicate ticket ID."},
            status_code=400
        )

    ticket_doc = {
        "user_id": g.current_user_id,
        "ticket_id": ticket_id,
        "name": name,
        "email": email,
        "mobile": mobile,
        "issue_type": issue_type,
        "subject": subject,
        "message": message,
        "priority": get_priority_by_issue(issue_type),
        "status": "Open",
        "created_at": datetime.utcnow()
    }

    db.support_tickets.insert_one(ticket_doc)

    return success_response(
        message="Support ticket created successfully.",
        data={"ticket_id": ticket_id},
        status_code=201
    )

@support_api.get("/tickets")
@auth_required
def get_tickets():
    db = get_database()
    tickets_cursor = db.support_tickets.find({"user_id": g.current_user_id}).sort("created_at", -1)
    
    tickets_list = []
    for t in tickets_cursor:
        tickets_list.append({
            "ticket_id": t["ticket_id"],
            "issue_type": t["issue_type"],
            "subject": t["subject"],
            "message": t["message"],
            "priority": t["priority"],
            "status": t["status"],
            "created_at": t["created_at"].isoformat() if isinstance(t.get("created_at"), datetime) else str(t.get("created_at", ""))
        })

    return success_response(
        message="Support tickets retrieved successfully.",
        data={"tickets": tickets_list},
        status_code=200
    )

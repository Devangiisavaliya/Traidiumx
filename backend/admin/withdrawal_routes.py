from datetime import datetime, time, timezone
import re

from bson import ObjectId
from flask import Blueprint, g, request

from config.database import get_database
from config.settings import settings
from models.withdrawal_model import find_withdrawal_by_id, format_withdrawal, update_withdrawal_status
from services.blockchain_service import build_explorer_url
from services.wallet_service import complete_main_locked_withdrawal, release_main_locked_amount, credit_admin_profit_wallet
from services.user_status_service import refresh_user_scheduled_status
from utils.date_helper import now_utc
from utils.response import error_response, success_response
from utils.validators import clean_string
from .audit_service import create_admin_audit_log
from .middleware import admin_required
from .permissions import permission_required
from .utils import build_pagination, parse_int, serialize_document, serialize_documents


admin_withdrawal_api = Blueprint("admin_withdrawal_api", __name__, url_prefix="/withdrawals")


PENDING_WITHDRAWAL_STATUSES = ["pending", "pending_payout", "pending_admin_approval", "queued"]
APPROVED_WITHDRAWAL_STATUSES = ["approved", "completed"]
REJECTED_WITHDRAWAL_STATUSES = ["rejected", "cancelled", "failed"]
FINAL_WITHDRAWAL_STATUSES = APPROVED_WITHDRAWAL_STATUSES + REJECTED_WITHDRAWAL_STATUSES
RESTRICTED_USER_STATUSES = {"blocked", "suspended", "disabled", "deactivated", "banned"}


def _to_number(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _regex(value):
    return re.compile(re.escape(str(value or "").strip()), re.IGNORECASE)


def _parse_date(value, end_of_day=False):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        if len(text) == 10:
            day = datetime.fromisoformat(text).date()
            return datetime.combine(day, time.max if end_of_day else time.min, tzinfo=timezone.utc)
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except Exception:
        return None


def _as_object_id(value):
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def _user_lookup_terms(user_id):
    terms = []
    text = str(user_id or "").strip()
    if text:
        terms.extend([{"_id": oid} for oid in [_as_object_id(text)] if oid])
        terms.extend([{ "id": text }, { "user_id": text }])
    return terms


def _find_user_for_wallet_action(db, user_id):
    terms = _user_lookup_terms(user_id)
    if not terms:
        return None
    return db.users.find_one({"$or": terms}, {"password_hash": 0, "password": 0})


def _account_status(user):
    return str((user or {}).get("account_status") or (user or {}).get("status") or "active").strip().lower()


def _status_filter(value):
    status = str(value or "").strip().lower()
    if not status or status == "all":
        return None
    if status == "pending":
        return {"$in": PENDING_WITHDRAWAL_STATUSES}
    if status == "approved":
        return {"$in": APPROVED_WITHDRAWAL_STATUSES}
    if status == "rejected":
        return {"$in": REJECTED_WITHDRAWAL_STATUSES}
    return {"$in": [status, status.upper()]}


def _find_matching_user_ids(db, search_text):
    text = str(search_text or "").strip()
    if not text:
        return []
    rx = _regex(text)
    users = db.users.find(
        {
            "$or": [
                {"name": rx},
                {"full_name": rx},
                {"username": rx},
                {"email": rx},
                {"phone": rx},
                {"mobile": rx},
            ]
        },
        {"_id": 1, "id": 1, "user_id": 1},
    ).limit(100)

    ids = []
    for user in users:
        ids.append(str(user.get("_id")))
        if user.get("id"):
            ids.append(str(user.get("id")))
        if user.get("user_id"):
            ids.append(str(user.get("user_id")))
    return list(dict.fromkeys(ids))


def _load_user_map(db, docs):
    ids = []
    for item in docs:
        value = item.get("user_id")
        if value is not None:
            ids.append(str(value))

    object_ids = [oid for oid in (_as_object_id(value) for value in ids) if oid]
    query = []
    if object_ids:
        query.append({"_id": {"$in": object_ids}})
    if ids:
        query.append({"id": {"$in": ids}})
        query.append({"user_id": {"$in": ids}})

    if not query:
        return {}

    user_map = {}
    for user in db.users.find({"$or": query}, {"password_hash": 0, "password": 0}):
        payload = {
            "id": str(user.get("_id")),
            "name": user.get("name") or user.get("full_name") or user.get("username") or "Unknown User",
            "email": user.get("email") or "",
            "phone": user.get("phone") or user.get("mobile") or "",
            "account_status": user.get("account_status") or user.get("status") or "active",
            "kyc_status": user.get("kyc_status") or "pending",
        }
        user_map[str(user.get("_id"))] = payload
        if user.get("id"):
            user_map[str(user.get("id"))] = payload
        if user.get("user_id"):
            user_map[str(user.get("user_id"))] = payload
    return user_map


def _enrich_withdrawals(db, withdrawals):
    user_map = _load_user_map(db, withdrawals)
    enriched = []
    for withdrawal in withdrawals:
        item = dict(withdrawal)
        user = user_map.get(str(item.get("user_id"))) or {}
        item["user"] = user
        item["user_name"] = user.get("name") or item.get("user_name") or item.get("full_name")
        item["email"] = user.get("email") or item.get("email")
        item["phone"] = user.get("phone") or item.get("phone")
        item["amount"] = _to_number(item.get("amount"))
        item["locked_amount"] = _to_number(item.get("locked_amount") or item.get("amount"))
        item["network_fee"] = _to_number(item.get("network_fee") or item.get("fee"))
        item["withdrawal_fee"] = _to_number(item.get("withdrawal_fee"))
        item["total_fee"] = _to_number(item.get("total_fee"), item["network_fee"] + item["withdrawal_fee"])
        item["final_amount"] = _to_number(item.get("final_amount"), item["amount"])
        enriched.append(item)
    return enriched


def _build_withdrawal_query(db):
    status = _status_filter(request.args.get("status"))
    user_id = str(request.args.get("user_id") or "").strip()
    search = str(request.args.get("search") or "").strip()
    asset = str(request.args.get("currency") or request.args.get("asset") or request.args.get("coin") or "").strip().upper()
    if asset == "ALL":
        asset = ""
    network = str(request.args.get("network") or "").strip()
    min_amount = _to_number(request.args.get("min_amount"), None)
    max_amount = _to_number(request.args.get("max_amount"), None)
    date_from = _parse_date(request.args.get("date_from"), end_of_day=False)
    date_to = _parse_date(request.args.get("date_to"), end_of_day=True)

    query = {}

    if status:
        query["status"] = status
    if user_id:
        query["user_id"] = user_id
    if asset:
        if asset == "USDT":
            query["$or"] = [
                {"currency": "USDT"},
                {"crypto_asset": "USDT"},
                {"asset": "USDT"},
                {"currency": {"$exists": False}}
            ]
        elif asset == "INR":
            query["$or"] = [
                {"currency": "INR"},
                {"crypto_asset": "INR"},
                {"asset": "INR"},
                {"withdrawal_method": "inr_withdrawal"},
                {"payment_method": "inr_withdrawal"}
            ]
        else:
            query["$or"] = [
                {"currency": asset},
                {"crypto_asset": asset},
                {"asset": asset}
            ]
    if network:
        query["crypto_network"] = {"$regex": re.escape(network), "$options": "i"}

    amount_range = {}
    if min_amount is not None:
        amount_range["$gte"] = min_amount
    if max_amount is not None:
        amount_range["$lte"] = max_amount
    if amount_range:
        query["amount"] = amount_range

    date_range = {}
    if date_from:
        date_range["$gte"] = date_from
    if date_to:
        date_range["$lte"] = date_to
    if date_range:
        query["created_at"] = date_range

    if search:
        rx = _regex(search)
        user_ids = _find_matching_user_ids(db, search)
        search_or = [
            {"withdrawal_reference": rx},
            {"withdrawal_address": rx},
            {"tx_hash": rx},
            {"payout_reference": rx},
            {"user_id": rx},
            {"currency": rx},
            {"crypto_asset": rx},
            {"crypto_network": rx},
        ]
        if user_ids:
            search_or.append({"user_id": {"$in": user_ids}})
        if "$or" in query:
            query = {"$and": [query, {"$or": search_or}]}
        else:
            query["$or"] = search_or

    return query


def _withdrawal_money_summary(db, query):
    rows = list(db.withdrawals.aggregate([
        {"$match": query},
        {
            "$group": {
                "_id": "$currency",
                "amount": {"$sum": {"$ifNull": ["$amount", 0]}},
                "locked": {"$sum": {"$ifNull": ["$locked_amount", 0]}},
                "withdrawal_fee": {"$sum": {"$ifNull": ["$withdrawal_fee", 0]}},
                "network_fee": {"$sum": {"$ifNull": ["$network_fee", {"$ifNull": ["$fee", 0]}]}},
                "total_fee": {
                    "$sum": {
                        "$ifNull": [
                            "$total_fee",
                            {
                                "$add": [
                                    {"$ifNull": ["$withdrawal_fee", 0]},
                                    {"$ifNull": ["$network_fee", {"$ifNull": ["$fee", 0]}]},
                                ]
                            },
                        ]
                    }
                },
            }
        },
    ]))
    if not rows:
        return {"amount": 0, "locked": 0, "withdrawal_fee": 0, "network_fee": 0, "total_fee": 0}

    system_settings = (
        db.system_settings.find_one({"settings_key": "main"})
        or db.system_settings.find_one(sort=[("updated_at", -1)])
        or {}
    )
    usdt_rate = float(system_settings.get("usdt_inr_rate", 88.50) or 88.50)

    summary = {"amount": 0.0, "locked": 0.0, "withdrawal_fee": 0.0, "network_fee": 0.0, "total_fee": 0.0}
    for row in rows:
        curr = str(row.get("_id") or "USDT").upper()
        rate = usdt_rate if curr == "INR" else 1.0

        summary["amount"] += _to_number(row.get("amount")) / rate
        summary["locked"] += _to_number(row.get("locked")) / rate
        summary["withdrawal_fee"] += _to_number(row.get("withdrawal_fee")) / rate
        summary["network_fee"] += _to_number(row.get("network_fee")) / rate
        summary["total_fee"] += _to_number(row.get("total_fee")) / rate

    return {
        "amount": round(summary["amount"], 8),
        "locked": round(summary["locked"], 8),
        "withdrawal_fee": round(summary["withdrawal_fee"], 8),
        "network_fee": round(summary["network_fee"], 8),
        "total_fee": round(summary["total_fee"], 8),
    }


def _amount_sum(db, query):
    summary = _withdrawal_money_summary(db, query)
    return {"amount": summary.get("amount", 0), "locked": summary.get("locked", 0)}


def _ledger_amount_sum(db, query):
    rows = list(db.wallet_ledger.aggregate([
        {"$match": query},
        {"$group": {
            "_id": "$currency",
            "amount": {"$sum": {"$abs": {"$ifNull": ["$amount", 0]}}}
        }},
    ]))
    if not rows:
        return 0

    system_settings = (
        db.system_settings.find_one({"settings_key": "main"})
        or db.system_settings.find_one(sort=[("updated_at", -1)])
        or {}
    )
    usdt_rate = float(system_settings.get("usdt_inr_rate", 88.50) or 88.50)

    total_usdt = 0.0
    for row in rows:
        curr = str(row.get("_id") or "USDT").upper()
        amt = float(row.get("amount") or 0.0)
        if curr == "INR":
            total_usdt += amt / usdt_rate
        else:
            total_usdt += amt

    return round(total_usdt, 8)


def _ledger_fee_query(transaction_types, date_filter=None):
    if isinstance(transaction_types, str):
        transaction_types = [transaction_types]
    query = {"transaction_type": {"$in": list(transaction_types)}}
    if date_filter:
        query["created_at"] = date_filter
    return query


def _trading_fee_ledger_query(date_filter=None):
    return _ledger_fee_query(["trading_fee_debit"], date_filter)


def _platform_fee_ledger_query(date_filter=None):
    query = _ledger_fee_query(["platform_fee_debit"], date_filter)
    # New separate Platform Fee entries use PF-* references. This prevents old
    # historical trading-fee records from being counted as account platform revenue.
    query["reference_id"] = {"$regex": "^PF-"}
    return query


@admin_withdrawal_api.get("")
@admin_required
@permission_required("withdrawals.view")
def list_withdrawals():
    db = get_database()
    page = parse_int(request.args.get("page"), default=1, minimum=1, maximum=100000)
    limit = parse_int(request.args.get("limit"), default=25, minimum=1, maximum=100)
    query = _build_withdrawal_query(db)

    total = db.withdrawals.count_documents(query)
    withdrawals = list(
        db.withdrawals.find(query)
        .sort("created_at", -1)
        .skip((page - 1) * limit)
        .limit(limit)
    )

    return success_response(
        message="Withdrawals fetched successfully.",
        data={
            "withdrawals": serialize_documents(_enrich_withdrawals(db, withdrawals)),
            "pagination": build_pagination(page, limit, total),
        },
    )


@admin_withdrawal_api.get("/summary")
@admin_required
@permission_required("withdrawals.view")
def withdrawals_summary():
    db = get_database()
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    pending_query = {"status": {"$in": PENDING_WITHDRAWAL_STATUSES}}
    approved_today_query = {"status": {"$in": APPROVED_WITHDRAWAL_STATUSES}, "approved_at": {"$gte": today_start}}
    rejected_today_query = {"status": {"$in": REJECTED_WITHDRAWAL_STATUSES}, "rejected_at": {"$gte": today_start}}
    today_requested_query = {"created_at": {"$gte": today_start}}

    wallet_totals = list(db.wallets.aggregate([
        {
            "$group": {
                "_id": None,
                "available_balance": {"$sum": {"$ifNull": ["$available_balance", 0]}},
                "locked_balance": {"$sum": {"$ifNull": ["$locked_balance", 0]}},
            }
        }
    ]))
    wallet = wallet_totals[0] if wallet_totals else {"available_balance": 0, "locked_balance": 0}
    available = _to_number(wallet.get("available_balance"))
    locked = _to_number(wallet.get("locked_balance"))

    pending_amount = _withdrawal_money_summary(db, pending_query)
    requested_today_amount = _withdrawal_money_summary(db, today_requested_query)
    approved_today_amount = _withdrawal_money_summary(db, approved_today_query)
    approved_total_query = {"status": {"$in": APPROVED_WITHDRAWAL_STATUSES}}
    approved_total_amount = _withdrawal_money_summary(db, approved_total_query)

    trading_fee_today = _ledger_amount_sum(db, _trading_fee_ledger_query({"$gte": today_start}))
    trading_fee_total = _ledger_amount_sum(db, _trading_fee_ledger_query())
    platform_fee_today = _ledger_amount_sum(db, _platform_fee_ledger_query({"$gte": today_start}))
    platform_fee_total = _ledger_amount_sum(db, _platform_fee_ledger_query())

    withdrawal_fee_today = approved_today_amount.get("withdrawal_fee", 0)
    withdrawal_fee_total = approved_total_amount.get("withdrawal_fee", 0)
    network_fee_today = approved_today_amount.get("network_fee", 0)
    network_fee_total = approved_total_amount.get("network_fee", 0)
    company_profit_today = round(trading_fee_today + platform_fee_today + withdrawal_fee_today, 8)
    
    admin_withdrawn_rows = list(db.admin_withdrawals.aggregate([
        {"$group": {"_id": "$currency", "amount": {"$sum": {"$ifNull": ["$amount", 0]}}}}
    ]))

    system_settings = (
        db.system_settings.find_one({"settings_key": "main"})
        or db.system_settings.find_one(sort=[("updated_at", -1)])
        or {}
    )
    usdt_rate = float(system_settings.get("usdt_inr_rate", 88.50) or 88.50)

    admin_withdrawn_total = 0.0
    for row in admin_withdrawn_rows:
        curr = str(row.get("_id") or "USDT").upper()
        amt = float(row.get("amount") or 0.0)
        if curr == "INR":
            admin_withdrawn_total += amt / usdt_rate
        else:
            admin_withdrawn_total += amt

    company_profit_total_all_time = round(trading_fee_total + platform_fee_total + withdrawal_fee_total, 8)
    company_profit_total = round(max(0.0, company_profit_total_all_time - admin_withdrawn_total), 8)

    from .wallet_routes import get_admin_profit_by_currency
    usdt_profit = get_admin_profit_by_currency(db, "USDT")
    inr_profit = get_admin_profit_by_currency(db, "INR")

    return success_response(
        message="Withdrawal summary fetched successfully.",
        data={
            "wallet": {
                "available_balance": round(available, 8),
                "locked_balance": round(locked, 8),
                "total_balance": round(available + locked, 8),
            },
            "withdrawals": {
                "pending": db.withdrawals.count_documents(pending_query),
                "approved_today": db.withdrawals.count_documents(approved_today_query),
                "rejected_today": db.withdrawals.count_documents(rejected_today_query),
                "requested_today": db.withdrawals.count_documents(today_requested_query),
                "pending_amount": pending_amount.get("amount", 0),
                "pending_locked_amount": pending_amount.get("locked", 0),
                "pending_company_fee": pending_amount.get("withdrawal_fee", 0),
                "pending_network_fee": pending_amount.get("network_fee", 0),
                "pending_total_fee": pending_amount.get("total_fee", 0),
                "requested_today_amount": requested_today_amount.get("amount", 0),
                "approved_today_amount": approved_today_amount.get("amount", 0),
                "approved_today_locked_amount": approved_today_amount.get("locked", 0),
                "approved_today_company_fee": withdrawal_fee_today,
                "approved_today_network_fee": network_fee_today,
                "approved_today_total_fee": approved_today_amount.get("total_fee", 0),
            },
            "revenue": {
                "company_profit_today": company_profit_today,
                "company_profit_total": company_profit_total,
                "trading_fee_today": trading_fee_today,
                "trading_fee_total": trading_fee_total,
                "platform_fee_today": platform_fee_today,
                "platform_fee_total": platform_fee_total,
                "withdrawal_fee_today": withdrawal_fee_today,
                "withdrawal_fee_total": withdrawal_fee_total,
                "network_fee_today": network_fee_today,
                "network_fee_total": network_fee_total,
                "usdt": usdt_profit,
                "inr": inr_profit,
                "network_fee_note": "Network fee is shown separately as recovery/cost, not company profit unless your company keeps it.",
            },
        },
    )


@admin_withdrawal_api.get("/<withdrawal_id>")
@admin_required
@permission_required("withdrawals.view")
def withdrawal_detail(withdrawal_id):
    db = get_database()
    withdrawal = find_withdrawal_by_id(withdrawal_id)

    if not withdrawal:
        return error_response(
            message="Withdrawal not found.",
            errors={"withdrawal_id": "Invalid withdrawal ID."},
            status_code=404,
        )

    user = None
    try:
        user = db.users.find_one({"_id": ObjectId(withdrawal.get("user_id"))}, {"password_hash": 0, "password": 0})
    except Exception:
        user = db.users.find_one({"$or": [{"id": withdrawal.get("user_id")}, {"user_id": withdrawal.get("user_id")}]}, {"password_hash": 0, "password": 0})

    wallet = db.wallets.find_one({"user_id": withdrawal.get("user_id")})
    ledger = list(db.wallet_ledger.find({"reference_id": str(withdrawal_id)}).sort("created_at", -1).limit(20))
    audit_logs = list(db.admin_audit_logs.find({"resource_type": "withdrawal", "resource_id": str(withdrawal_id)}).sort("created_at", -1).limit(20))

    enriched = _enrich_withdrawals(db, [withdrawal])[0]

    return success_response(
        message="Withdrawal detail fetched successfully.",
        data={
            "withdrawal": serialize_document(enriched),
            "user": serialize_document(user),
            "wallet": serialize_document(wallet),
            "ledger": serialize_documents(ledger),
            "audit_logs": serialize_documents(audit_logs),
        },
    )


@admin_withdrawal_api.post("/<withdrawal_id>/approve")
@admin_required
@permission_required("withdrawals.approve")
def approve_withdrawal(withdrawal_id):
    db = get_database()
    data = request.get_json(silent=True) or {}
    tx_hash = str(data.get("tx_hash") or "").strip()
    payout_reference = str(data.get("payout_reference") or "").strip()
    remark = str(data.get("remark") or "Withdrawal approved by admin.").strip()

    withdrawal = find_withdrawal_by_id(withdrawal_id)
    if not withdrawal:
        return error_response(
            message="Withdrawal not found.",
            errors={"withdrawal_id": "Invalid withdrawal ID."},
            status_code=404,
        )

    # If tx_hash is not provided manually, check if automated on-chain broadcast is enabled
    auto_payout_enabled = getattr(settings, "WITHDRAW_ONCHAIN_ENABLED", False) or data.get("auto_payout") is True
    req_currency = str(withdrawal.get("currency") or "INR").upper()
    req_network = str(withdrawal.get("network") or withdrawal.get("crypto_network") or "TRC20").upper()

    if not tx_hash:
        if req_currency == "USDT" and req_network in ("TRC20", "BEP20") and (auto_payout_enabled or getattr(settings, "WITHDRAW_PRIVATE_KEY", "") or getattr(settings, "WITHDRAW_BEP20_PRIVATE_KEY", "")):
            payout_addr = clean_string(withdrawal.get("payout_address") or withdrawal.get("crypto_address") or withdrawal.get("address") or withdrawal.get("destination_address") or withdrawal.get("withdrawal_address"))
            payout_amount = float(withdrawal.get("final_amount") or withdrawal.get("net_amount") or withdrawal.get("amount") or 0.0)
            from services.blockchain_service import send_crypto_payout
            payout_res = send_crypto_payout(req_network, req_currency, payout_addr, payout_amount)
            if not payout_res.get("success"):
                return error_response(
                    message=f"Automated On-Chain Payout Failed: {payout_res.get('message')}",
                    errors={"payout": payout_res.get("message")},
                    status_code=400,
                )
            tx_hash = payout_res.get("tx_hash")
            payout_reference = tx_hash
            remark = f"Automated on-chain payout broadcasted on {req_network}. Explorer: {payout_res.get('explorer_url', '')}"
        else:
            return error_response(
                message="Transaction hash is required before approving withdrawal.",
                errors={"tx_hash": "Please enter payout transaction hash / TXID or configure on-chain Hot Wallet private key."},
                status_code=422,
            )

    current_status = withdrawal.get("status")
    if current_status in FINAL_WITHDRAWAL_STATUSES:
        return error_response(
            message="Withdrawal is already finalized.",
            errors={"status": current_status},
            status_code=409,
        )

    if current_status not in PENDING_WITHDRAWAL_STATUSES:
        return error_response(
            message="Only pending withdrawals can be approved.",
            errors={"status": current_status},
            status_code=422,
        )

    user_id = str(withdrawal.get("user_id") or "")
    withdrawal_user = _find_user_for_wallet_action(db, user_id)
    # Apply any expired grace timer before admin approval. This keeps the exact
    # flow: the user can create a withdrawal while the grace timer is active;
    # if the timer ends before an admin is available, approval must still
    # finalize the already-locked withdrawal and keep it in user history.
    if withdrawal_user:
        withdrawal_user = refresh_user_scheduled_status(withdrawal_user)

    user_account_status = _account_status(withdrawal_user)
    approved_while_restricted = user_account_status in RESTRICTED_USER_STATUSES
    locked_amount = float(withdrawal.get("locked_amount", withdrawal.get("amount", 0.0)) or 0.0)

    # Admin approval is intentionally allowed even if the user is blocked/suspended.
    # The amount was already locked when the request was created during the active
    # or grace period, so approval must not be blocked by the final restriction.
    req_currency = str(withdrawal.get("currency") or "INR").upper()
    unit_sym = "₹" if req_currency == "INR" else "$"
    target_wallet_user_id = str(withdrawal.get("sub_account_id") or withdrawal.get("source_user_id") or user_id)
    wallet_result = complete_main_locked_withdrawal(
        user_id=target_wallet_user_id,
        amount=locked_amount,
        reference_id=withdrawal_id,
        description=f"Admin approved withdrawal {withdrawal.get('withdrawal_reference')}. Locked amount {unit_sym}{locked_amount:g} {req_currency} finalized; no extra debit.",
        currency=req_currency,
    )

    if not wallet_result.get("success"):
        create_admin_audit_log(
            admin_id=g.current_admin_id,
            admin_email=g.current_admin_email,
            action="withdrawal.approve.failed",
            resource_type="withdrawal",
            resource_id=withdrawal_id,
            status="failed",
            message=wallet_result.get("message", "Wallet debit failed."),
            metadata={"user_id": user_id, "locked_amount": locked_amount, "user_account_status": user_account_status},
        )
        return error_response(
            message=wallet_result.get("message", "Wallet debit failed."),
            errors={"wallet": wallet_result.get("message")},
            status_code=422,
        )

    withdrawal_fee_profit = _to_number(withdrawal.get("withdrawal_fee"), 0.0)
    if withdrawal_fee_profit > 0:
        credit_admin_profit_wallet(
            amount=withdrawal_fee_profit,
            transaction_type="withdrawal_fee_profit",
            reference_id=withdrawal_id,
            description=f"Admin profit from approved withdrawal {withdrawal.get('withdrawal_reference')}.",
            currency=withdrawal.get("currency")
        )

    update_data = {
        "approved_by": g.current_admin_id,
        "approved_admin_email": g.current_admin_email,
        "approved_at": now_utc(),
        "remark": remark,
        "admin_note": remark,
        "user_status_message": "Admin approved this withdrawal. Locked balance has been finally withdrawn from your wallet.",
        "user_account_status_at_approval": user_account_status,
        "approved_while_user_restricted": approved_while_restricted,
        "history_visibility": "admin_and_user",
        "wallet_after_approval": serialize_document(wallet_result.get("wallet")),
    }

    if payout_reference:
        update_data["payout_reference"] = payout_reference

    if tx_hash:
        update_data["tx_hash"] = tx_hash
        update_data["explorer_url"] = build_explorer_url(withdrawal.get("crypto_network"), tx_hash)
        update_data["completed_at"] = now_utc()

    updated = update_withdrawal_status(withdrawal_id, "approved", update_data)

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="withdrawal.approved",
        resource_type="withdrawal",
        resource_id=withdrawal_id,
        message="Withdrawal approved and locked balance debited by admin.",
        metadata={
            "user_id": user_id,
            "locked_amount": locked_amount,
            "tx_hash": tx_hash,
            "payout_reference": payout_reference,
            "user_account_status": user_account_status,
            "approved_while_user_restricted": approved_while_restricted,
        },
    )

    return success_response(
        message=(
            "Withdrawal approved successfully. Locked balance has now been finally withdrawn from wallet."
            + (" User is restricted, but this withdrawal remains visible in admin/user history." if approved_while_restricted else "")
        ),
        data={
            "withdrawal": format_withdrawal(updated),
            "wallet": serialize_document(wallet_result.get("wallet")),
        },
    )


@admin_withdrawal_api.post("/<withdrawal_id>/reject")
@admin_required
@permission_required("withdrawals.reject")
def reject_withdrawal(withdrawal_id):
    data = request.get_json(silent=True) or {}
    reason = str(data.get("reason") or data.get("reject_reason") or "").strip()

    if not reason:
        return error_response(
            message="Reject reason is required.",
            errors={"reason": "Please enter reject reason."},
            status_code=422,
        )

    withdrawal = find_withdrawal_by_id(withdrawal_id)
    if not withdrawal:
        return error_response(
            message="Withdrawal not found.",
            errors={"withdrawal_id": "Invalid withdrawal ID."},
            status_code=404,
        )

    current_status = withdrawal.get("status")
    if current_status in FINAL_WITHDRAWAL_STATUSES:
        return error_response(
            message="Withdrawal is already finalized.",
            errors={"status": current_status},
            status_code=409,
        )

    if current_status not in PENDING_WITHDRAWAL_STATUSES:
        return error_response(
            message="Only pending withdrawals can be rejected.",
            errors={"status": current_status},
            status_code=422,
        )

    user_id = withdrawal.get("user_id")
    locked_amount = float(withdrawal.get("locked_amount", withdrawal.get("amount", 0.0)) or 0.0)

    req_currency = str(withdrawal.get("currency") or "INR").upper()
    unit_sym = "₹" if req_currency == "INR" else "$"
    target_wallet_user_id = str(withdrawal.get("sub_account_id") or withdrawal.get("source_user_id") or user_id)
    release_result = release_main_locked_amount(
        user_id=target_wallet_user_id,
        amount=locked_amount,
        transaction_type="inr_withdrawal_reject_refund" if req_currency == "INR" else "crypto_withdrawal_reject_refund",
        reference_id=withdrawal_id,
        description=f"Admin rejected withdrawal {withdrawal.get('withdrawal_reference')}. Locked amount {unit_sym}{locked_amount:g} {req_currency} released.",
        currency=req_currency,
    )

    if not release_result.get("success"):
        create_admin_audit_log(
            admin_id=g.current_admin_id,
            admin_email=g.current_admin_email,
            action="withdrawal.reject.failed",
            resource_type="withdrawal",
            resource_id=withdrawal_id,
            status="failed",
            message=release_result.get("message", "Wallet release failed."),
            metadata={"user_id": user_id, "locked_amount": locked_amount},
        )
        return error_response(
            message=release_result.get("message", "Wallet release failed."),
            errors={"wallet": release_result.get("message")},
            status_code=422,
        )

    updated = update_withdrawal_status(
        withdrawal_id,
        "rejected",
        {
            "rejected_by": g.current_admin_id,
            "rejected_admin_email": g.current_admin_email,
            "rejected_at": now_utc(),
            "reject_reason": reason,
            "remark": reason,
            "admin_note": reason,
            "user_status_message": "Admin rejected this withdrawal. Locked balance has been released back to your available wallet balance.",
            "wallet_after_rejection": serialize_document(release_result.get("wallet")),
        },
    )

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="withdrawal.rejected",
        resource_type="withdrawal",
        resource_id=withdrawal_id,
        message="Withdrawal rejected and locked balance released by admin.",
        metadata={"user_id": user_id, "locked_amount": locked_amount, "reason": reason},
    )

    return success_response(
        message="Withdrawal rejected successfully. Locked balance has been released to user wallet.",
        data={
            "withdrawal": format_withdrawal(updated),
            "wallet": serialize_document(release_result.get("wallet")),
        },
    )

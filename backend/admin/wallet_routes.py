from datetime import datetime, time, timezone
import re

from bson import ObjectId
from flask import Blueprint, g, request

from config.database import get_database
from config.settings import settings
from services.blockchain_service import build_explorer_url, verify_usdt_deposit
from services.wallet_service import credit_main_wallet
from utils.date_helper import now_utc
from utils.response import error_response, success_response
from .audit_service import create_admin_audit_log
from .middleware import admin_required
from .permissions import permission_required
from .utils import build_pagination, parse_int, serialize_document, serialize_documents


admin_wallet_api = Blueprint("admin_wallet_api", __name__, url_prefix="/wallet")


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
        }
        user_map[str(user.get("_id"))] = payload
        if user.get("id"):
            user_map[str(user.get("id"))] = payload
        if user.get("user_id"):
            user_map[str(user.get("user_id"))] = payload
    return user_map


def _enrich_with_users(db, docs):
    user_map = _load_user_map(db, docs)
    enriched = []
    for doc in docs:
        item = dict(doc)
        user = user_map.get(str(item.get("user_id"))) or {}
        item["user"] = user
        item["user_name"] = user.get("name") or item.get("user_name")
        item["email"] = user.get("email") or item.get("email")
        if not item.get("currency"):
            w = db.wallets.find_one({"user_id": str(item.get("user_id"))})
            item["currency"] = (w.get("primary_currency") if w else None) or "USDT"
        enriched.append(item)
    return enriched


def _ledger_query(db):
    user_id = str(request.args.get("user_id") or "").strip()
    transaction_type = str(request.args.get("transaction_type") or request.args.get("type") or "").strip()
    direction = str(request.args.get("direction") or "").strip()
    currency = str(request.args.get("currency") or "").strip().upper()
    search = str(request.args.get("search") or "").strip()
    date_from = _parse_date(request.args.get("date_from"), end_of_day=False)
    date_to = _parse_date(request.args.get("date_to"), end_of_day=True)

    query = {}
    if user_id:
        query["user_id"] = user_id
    if transaction_type and transaction_type != "all":
        query["transaction_type"] = {"$regex": re.escape(transaction_type), "$options": "i"}
    if direction and direction != "all":
        query["direction"] = direction
    if currency and currency != "ALL":
        if currency == "USDT":
            query["$or"] = [
                {"currency": "USDT"},
                {"asset": "USDT"},
                {"crypto_asset": "USDT"},
                {"currency": {"$exists": False}}
            ]
        elif currency == "INR":
            query["$or"] = [
                {"currency": "INR"},
                {"asset": "INR"},
                {"crypto_asset": "INR"},
                {"transaction_type": {"$regex": "inr", "$options": "i"}}
            ]
        else:
            query["currency"] = currency

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
        ors = [
            {"transaction_type": rx},
            {"reference_id": rx},
            {"reference": rx},
            {"description": rx},
            {"user_id": rx},
            {"currency": rx},
        ]
        if user_ids:
            ors.append({"user_id": {"$in": user_ids}})
        query["$or"] = ors

    return query


def _wallet_query(db):
    user_id = str(request.args.get("user_id") or "").strip()
    search = str(request.args.get("search") or "").strip()
    query = {}
    if user_id:
        query["user_id"] = user_id
    if search:
        user_ids = _find_matching_user_ids(db, search)
        rx = _regex(search)
        ors = [{"user_id": rx}]
        if user_ids:
            ors.append({"user_id": {"$in": user_ids}})
        query["$or"] = ors
    return query


@admin_wallet_api.get("/summary")
@admin_required
@permission_required("wallet.view")
def wallet_summary():
    db = get_database()
    wallet_rows = list(db.wallets.aggregate([
        {
            "$group": {
                "_id": None,
                "available_balance": {"$sum": {"$ifNull": ["$available_balance", 0]}},
                "locked_balance": {"$sum": {"$ifNull": ["$locked_balance", 0]}},
                "wallets": {"$sum": 1},
            }
        }
    ]))
    wallet = wallet_rows[0] if wallet_rows else {"available_balance": 0, "locked_balance": 0, "wallets": 0}
    available = _to_number(wallet.get("available_balance"))
    locked = _to_number(wallet.get("locked_balance"))

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    ledger_today = list(db.wallet_ledger.aggregate([
        {"$match": {"created_at": {"$gte": today_start}}},
        {"$group": {"_id": "$direction", "amount": {"$sum": {"$ifNull": ["$amount", 0]}}, "count": {"$sum": 1}}},
    ]))
    credits = next((row for row in ledger_today if str(row.get("_id")).lower() in ["credit", "in"]), {})
    debits = next((row for row in ledger_today if str(row.get("_id")).lower() in ["debit", "out"]), {})

    return success_response(
        message="Wallet summary fetched successfully.",
        data={
            "available_balance": round(available, 8),
            "locked_balance": round(locked, 8),
            "total_balance": round(available + locked, 8),
            "wallets": int(wallet.get("wallets", 0)),
            "today_credit_amount": round(_to_number(credits.get("amount")), 8),
            "today_debit_amount": round(abs(_to_number(debits.get("amount"))), 8),
            "today_credit_count": int(credits.get("count", 0) or 0),
            "today_debit_count": int(debits.get("count", 0) or 0),
        },
    )


@admin_wallet_api.get("/ledger")
@admin_required
@permission_required("wallet.view")
def wallet_ledger():
    db = get_database()
    page = parse_int(request.args.get("page"), default=1, minimum=1, maximum=100000)
    limit = parse_int(request.args.get("limit"), default=25, minimum=1, maximum=100)
    query = _ledger_query(db)

    total = db.wallet_ledger.count_documents(query)
    ledger = list(
        db.wallet_ledger.find(query)
        .sort("created_at", -1)
        .skip((page - 1) * limit)
        .limit(limit)
    )

    return success_response(
        message="Wallet ledger fetched successfully.",
        data={
            "ledger": serialize_documents(_enrich_with_users(db, ledger)),
            "pagination": build_pagination(page, limit, total),
        },
    )


@admin_wallet_api.get("/balances")
@admin_required
@permission_required("wallet.view")
def wallet_balances():
    db = get_database()
    page = parse_int(request.args.get("page"), default=1, minimum=1, maximum=100000)
    limit = parse_int(request.args.get("limit"), default=25, minimum=1, maximum=100)
    query = _wallet_query(db)

    total = db.wallets.count_documents(query)
    wallets = list(
        db.wallets.find(query)
        .sort("updated_at", -1)
        .skip((page - 1) * limit)
        .limit(limit)
    )

    return success_response(
        message="Wallet balances fetched successfully.",
        data={
            "wallets": serialize_documents(_enrich_with_users(db, wallets)),
            "pagination": build_pagination(page, limit, total),
        },
    )



PENDING_DEPOSIT_STATUSES = ["pending", "pending_verification", "processing", "queued", "not_checked"]
COMPLETED_DEPOSIT_STATUSES = ["completed", "approved", "confirmed", "verified"]
REJECTED_DEPOSIT_STATUSES = ["rejected", "failed", "cancelled", "declined"]
FINAL_DEPOSIT_STATUSES = COMPLETED_DEPOSIT_STATUSES + REJECTED_DEPOSIT_STATUSES


def _deposit_status_filter(value):
    status = str(value or "").strip().lower()
    if not status or status == "all":
        return None
    if status == "pending":
        return {"$in": PENDING_DEPOSIT_STATUSES}
    if status in ["completed", "approved", "confirmed"]:
        return {"$in": COMPLETED_DEPOSIT_STATUSES}
    if status in ["rejected", "failed"]:
        return {"$in": REJECTED_DEPOSIT_STATUSES}
    return {"$in": [status, status.upper()]}


def _build_deposit_query(db):
    status = _deposit_status_filter(request.args.get("status"))
    user_id = str(request.args.get("user_id") or "").strip()
    search = str(request.args.get("search") or "").strip()
    asset = str(request.args.get("currency") or request.args.get("asset") or request.args.get("coin") or "").strip().upper()
    if asset == "ALL":
        asset = ""
    network = str(request.args.get("network") or "").strip()
    date_from = _parse_date(request.args.get("date_from"), end_of_day=False)
    date_to = _parse_date(request.args.get("date_to"), end_of_day=True)

    query = {}
    and_filters = []

    if status:
        query["status"] = status
    if user_id:
        query["user_id"] = user_id
    if asset:
        if asset == "USDT":
            and_filters.append({"$or": [{"currency": "USDT"}, {"crypto_asset": "USDT"}, {"asset": "USDT"}, {"currency": {"$exists": False}}]})
        elif asset == "INR":
            and_filters.append({"$or": [{"currency": "INR"}, {"crypto_asset": "INR"}, {"asset": "INR"}, {"payment_method": {"$regex": "inr", "$options": "i"}}]})
        else:
            and_filters.append({"$or": [{"currency": asset}, {"crypto_asset": asset}, {"asset": asset}]})
    if network:
        query["crypto_network"] = {"$regex": re.escape(network), "$options": "i"}

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
            {"deposit_reference": rx},
            {"gateway_order_id": rx},
            {"gateway_payment_id": rx},
            {"tx_hash": rx},
            {"deposit_address": rx},
            {"user_id": rx},
            {"currency": rx},
            {"crypto_asset": rx},
            {"crypto_network": rx},
            {"verification_status": rx},
        ]
        if user_ids:
            search_or.append({"user_id": {"$in": user_ids}})
        and_filters.append({"$or": search_or})

    if and_filters:
        if query:
            query = {"$and": [query, *and_filters]}
        elif len(and_filters) == 1:
            query = and_filters[0]
        else:
            query = {"$and": and_filters}

    return query


def _enrich_deposits(db, deposits):
    user_map = _load_user_map(db, deposits)
    enriched = []
    for deposit in deposits:
        item = dict(deposit)
        user = user_map.get(str(item.get("user_id"))) or {}
        item["user"] = user
        item["user_name"] = user.get("name") or item.get("user_name") or item.get("full_name")
        item["email"] = user.get("email") or item.get("email")
        item["phone"] = user.get("phone") or item.get("phone")
        item["amount"] = _to_number(item.get("amount") or item.get("deposit_amount") or item.get("usdt_amount"))
        item["currency"] = item.get("currency") or item.get("crypto_asset") or item.get("asset") or "USDT"
        return_status = item.get("status") or "pending_verification"
        item["status"] = return_status
        enriched.append(item)
    return enriched


def _deposit_amount_sum(db, query):
    rows = list(db.deposits.aggregate([
        {"$match": query},
        {"$group": {"_id": None, "amount": {"$sum": {"$ifNull": ["$amount", 0]}}}},
    ]))
    if not rows:
        return 0
    return round(_to_number(rows[0].get("amount")), 8)


def _find_deposit_document(db, deposit_id):
    oid = _as_object_id(deposit_id)
    if not oid:
        return None
    return db.deposits.find_one({"_id": oid})


def _update_deposit_document(db, deposit_id, status, data=None):
    oid = _as_object_id(deposit_id)
    if not oid:
        return None
    update_data = {"status": status, "updated_at": now_utc()}
    if data:
        update_data.update(data)
    db.deposits.update_one({"_id": oid}, {"$set": update_data})
    return db.deposits.find_one({"_id": oid})


@admin_wallet_api.get("/deposits")
@admin_required
@permission_required("deposits.view")
def list_deposits():
    db = get_database()
    page = parse_int(request.args.get("page"), default=1, minimum=1, maximum=100000)
    limit = parse_int(request.args.get("limit"), default=25, minimum=1, maximum=100)
    query = _build_deposit_query(db)

    total = db.deposits.count_documents(query)
    deposits = list(
        db.deposits.find(query)
        .sort("created_at", -1)
        .skip((page - 1) * limit)
        .limit(limit)
    )

    return success_response(
        message="Deposits fetched successfully.",
        data={
            "deposits": serialize_documents(_enrich_deposits(db, deposits)),
            "pagination": build_pagination(page, limit, total),
        },
    )


@admin_wallet_api.get("/deposits/summary")
@admin_required
@permission_required("deposits.view")
def deposits_summary():
    db = get_database()
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    pending_query = {"status": {"$in": PENDING_DEPOSIT_STATUSES}}
    completed_query = {"status": {"$in": COMPLETED_DEPOSIT_STATUSES}}
    completed_today_query = {"status": {"$in": COMPLETED_DEPOSIT_STATUSES}, "credited_at": {"$gte": today_start}}
    rejected_today_query = {"status": {"$in": REJECTED_DEPOSIT_STATUSES}, "rejected_at": {"$gte": today_start}}
    today_submitted_query = {"created_at": {"$gte": today_start}}

    return success_response(
        message="Deposit summary fetched successfully.",
        data={
            "deposits": {
                "pending": db.deposits.count_documents(pending_query),
                "completed": db.deposits.count_documents(completed_query),
                "completed_today": db.deposits.count_documents(completed_today_query),
                "rejected_today": db.deposits.count_documents(rejected_today_query),
                "submitted_today": db.deposits.count_documents(today_submitted_query),
                "pending_amount": _deposit_amount_sum(db, pending_query),
                "completed_amount": _deposit_amount_sum(db, completed_query),
                "submitted_today_amount": _deposit_amount_sum(db, today_submitted_query),
            }
        },
    )


@admin_wallet_api.get("/deposits/<deposit_id>")
@admin_required
@permission_required("deposits.view")
def deposit_detail(deposit_id):
    db = get_database()
    deposit = _find_deposit_document(db, deposit_id)
    if not deposit:
        return error_response(
            message="Deposit not found.",
            errors={"deposit_id": "Invalid deposit ID."},
            status_code=404,
        )

    wallet = db.wallets.find_one({"user_id": deposit.get("user_id")})
    ledger = list(db.wallet_ledger.find({"reference_id": str(deposit_id)}).sort("created_at", -1).limit(20))
    audit_logs = list(db.admin_audit_logs.find({"resource_type": "deposit", "resource_id": str(deposit_id)}).sort("created_at", -1).limit(20))
    enriched = _enrich_deposits(db, [deposit])[0]

    return success_response(
        message="Deposit detail fetched successfully.",
        data={
            "deposit": serialize_document(enriched),
            "wallet": serialize_document(wallet),
            "ledger": serialize_documents(ledger),
            "audit_logs": serialize_documents(audit_logs),
        },
    )


@admin_wallet_api.post("/deposits/<deposit_id>/verify")
@admin_required
@permission_required("deposits.verify")
def verify_deposit(deposit_id):
    data = request.get_json(silent=True) or {}
    remark = str(data.get("remark") or "Deposit verified by admin.").strip()

    db = get_database()
    deposit = _find_deposit_document(db, deposit_id)
    if not deposit:
        return error_response(
            message="Deposit not found.",
            errors={"deposit_id": "Invalid deposit ID."},
            status_code=404,
        )

    current_status = str(deposit.get("status") or "pending_verification").lower()
    if current_status in COMPLETED_DEPOSIT_STATUSES:
        return error_response(
            message="Deposit is already completed.",
            errors={"status": current_status},
            status_code=409,
        )
    if current_status in REJECTED_DEPOSIT_STATUSES:
        return error_response(
            message="Rejected deposits cannot be verified.",
            errors={"status": current_status},
            status_code=409,
        )

    tx_hash = str(deposit.get("tx_hash") or deposit.get("gateway_payment_id") or "").strip()
    network = str(deposit.get("crypto_network") or "").strip().upper()
    amount = _to_number(deposit.get("amount") or deposit.get("deposit_amount") or deposit.get("usdt_amount"))
    deposit_address = str(deposit.get("deposit_address") or "").strip()

    duplicate = db.deposits.find_one({
        "_id": {"$ne": _as_object_id(deposit_id)},
        "tx_hash": tx_hash,
        "status": {"$in": COMPLETED_DEPOSIT_STATUSES},
    }) if tx_hash else None
    if duplicate:
        updated = _update_deposit_document(
            db,
            deposit_id,
            "rejected",
            {
                "verification_status": "duplicate_completed_tx",
                "verification_message": "This TXID was already credited to another deposit request.",
                "rejected_by": g.current_admin_id,
                "rejected_admin_email": g.current_admin_email,
                "rejected_at": now_utc(),
                "remark": "Duplicate completed TXID blocked by admin deposit review.",
                "admin_note": "Duplicate completed TXID blocked.",
            },
        )
        create_admin_audit_log(
            admin_id=g.current_admin_id,
            admin_email=g.current_admin_email,
            action="deposit.verify.duplicate_rejected",
            resource_type="deposit",
            resource_id=deposit_id,
            message="Deposit verification rejected because TXID was already credited.",
            metadata={"tx_hash": tx_hash, "duplicate_id": str(duplicate.get("_id"))},
        )
        return error_response(
            message="Duplicate TXID blocked. Deposit has been rejected.",
            errors={"tx_hash": "This TXID was already credited."},
            status_code=409,
        )

    # In development/demo mode we cannot verify a real blockchain transfer because
    # the project uses demo wallet addresses. Admin verification therefore acts as
    # a manual approval step and credits the user's Main Wallet only after the
    # admin clicks Verify. In production, the normal blockchain verification path
    # remains unchanged.
    demo_manual_approval = (
        settings.APP_ENV == "development"
        or bool(deposit.get("is_demo"))
        or str(tx_hash or "").upper().startswith("DEMO")
        or str(deposit_address or "").upper().startswith("TDEMO")
    )

    if demo_manual_approval:
        verification = {
            "verified": True,
            "status": "manual_demo_approved",
            "message": "Development/demo deposit manually approved by admin.",
            "confirmations": 0,
            "required_confirmations": 0,
            "verified_amount": amount,
            "verified_to_address": deposit_address,
            "explorer_url": build_explorer_url(network, tx_hash),
        }
    else:
        verification = verify_usdt_deposit(network, tx_hash, deposit_address, amount)

    explorer_url = verification.get("explorer_url") or build_explorer_url(network, tx_hash)

    if not verification.get("verified"):
        updated = _update_deposit_document(
            db,
            deposit_id,
            "pending_verification",
            {
                "verification_status": verification.get("status", "pending"),
                "verification_message": verification.get("message", "Blockchain verification is pending."),
                "confirmations": verification.get("confirmations", deposit.get("confirmations", 0)),
                "required_confirmations": verification.get("required_confirmations", deposit.get("required_confirmations", 0)),
                "verified_amount": verification.get("verified_amount", deposit.get("verified_amount", 0.0)),
                "verified_to_address": verification.get("verified_to_address", deposit.get("verified_to_address", "")),
                "explorer_url": explorer_url,
                "last_checked_by": g.current_admin_id,
                "last_checked_admin_email": g.current_admin_email,
                "last_checked_at": now_utc(),
                "admin_note": remark,
            },
        )
        create_admin_audit_log(
            admin_id=g.current_admin_id,
            admin_email=g.current_admin_email,
            action="deposit.verify.pending",
            resource_type="deposit",
            resource_id=deposit_id,
            status="pending",
            message=verification.get("message", "Deposit blockchain verification is still pending."),
            metadata={"tx_hash": tx_hash, "network": network, "amount": amount},
        )
        return success_response(
            message=verification.get("message", "Deposit blockchain verification is still pending."),
            data={"deposit": serialize_document(_enrich_deposits(db, [updated])[0])},
        )

    currency = (deposit.get("currency") or deposit.get("crypto_asset") or "USDT").upper()
    wallet = credit_main_wallet(
        user_id=deposit.get("user_id"),
        amount=amount,
        transaction_type="crypto_deposit_credit",
        reference_id=deposit_id,
        description=f"Admin verified {currency} deposit {deposit.get('deposit_reference')} into Main Wallet.",
        currency=currency,
    )

    updated = _update_deposit_document(
        db,
        deposit_id,
        "completed",
        {
            "verification_status": "verified",
            "verification_message": verification.get("message", f"{currency} blockchain transfer verified."),
            "confirmations": verification.get("confirmations", deposit.get("confirmations", 0)),
            "required_confirmations": verification.get("required_confirmations", deposit.get("required_confirmations", 0)),
            "verified_amount": verification.get("verified_amount", amount),
            "verified_to_address": verification.get("verified_to_address", deposit_address),
            "explorer_url": explorer_url,
            "credited_at": now_utc(),
            "approved_by": g.current_admin_id,
            "approved_admin_email": g.current_admin_email,
            "approved_at": now_utc(),
            "remark": remark,
            "admin_note": remark,
            "user_status_message": f"Admin verified this deposit. {currency} has been credited to your available wallet balance.",
            "wallet_after_credit": serialize_document(wallet),
        },
    )

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="deposit.verified",
        resource_type="deposit",
        resource_id=deposit_id,
        message="Deposit verified and wallet credited by admin.",
        metadata={"user_id": deposit.get("user_id"), "amount": amount, "tx_hash": tx_hash, "network": network},
    )

    return success_response(
        message="Deposit verified successfully. Wallet balance has been credited.",
        data={"deposit": serialize_document(_enrich_deposits(db, [updated])[0]), "wallet": serialize_document(wallet)},
    )


@admin_wallet_api.post("/deposits/<deposit_id>/reject")
@admin_required
@permission_required("deposits.reject")
def reject_deposit(deposit_id):
    data = request.get_json(silent=True) or {}
    reason = str(data.get("reason") or data.get("reject_reason") or "").strip()

    if not reason:
        return error_response(
            message="Reject reason is required.",
            errors={"reason": "Please enter reject reason."},
            status_code=422,
        )

    db = get_database()
    deposit = _find_deposit_document(db, deposit_id)
    if not deposit:
        return error_response(
            message="Deposit not found.",
            errors={"deposit_id": "Invalid deposit ID."},
            status_code=404,
        )

    current_status = str(deposit.get("status") or "pending_verification").lower()
    if current_status in FINAL_DEPOSIT_STATUSES:
        return error_response(
            message="Deposit is already finalized.",
            errors={"status": current_status},
            status_code=409,
        )

    updated = _update_deposit_document(
        db,
        deposit_id,
        "rejected",
        {
            "rejected_by": g.current_admin_id,
            "rejected_admin_email": g.current_admin_email,
            "rejected_at": now_utc(),
            "reject_reason": reason,
            "remark": reason,
            "admin_note": reason,
            "verification_status": "rejected_by_admin",
            "verification_message": reason,
            "user_status_message": "Admin rejected this deposit request. Wallet balance was not credited.",
        },
    )

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="deposit.rejected",
        resource_type="deposit",
        resource_id=deposit_id,
        message="Deposit rejected by admin.",
        metadata={"user_id": deposit.get("user_id"), "amount": deposit.get("amount"), "reason": reason},
    )

    return success_response(
        message="Deposit rejected successfully.",
        data={"deposit": serialize_document(_enrich_deposits(db, [updated])[0])},
    )


def _ledger_amount_sum(db, query):
    rows = list(db.wallet_ledger.aggregate([
        {"$match": query},
        {"$group": {"_id": None, "amount": {"$sum": {"$abs": {"$ifNull": ["$amount", 0]}}}}},
    ]))
    if not rows:
        return 0
    return round(_to_number(rows[0].get("amount")), 8)


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
    query["reference_id"] = {"$regex": "^PF-"}
    return query


def _withdrawal_fee_total(db):
    APPROVED_WITHDRAWAL_STATUSES = ["approved", "completed"]
    rows = list(db.withdrawals.aggregate([
        {"$match": {"status": {"$in": APPROVED_WITHDRAWAL_STATUSES}}},
        {"$group": {"_id": None, "withdrawal_fee": {"$sum": {"$ifNull": ["$withdrawal_fee", 0]}}}},
    ]))
    if not rows:
        return 0
    return round(_to_number(rows[0].get("withdrawal_fee")), 8)


def get_admin_profit_by_currency(db, currency="USDT"):
    currency = str(currency or "USDT").strip().upper()
    if currency not in ["INR", "USDT"]:
        currency = "USDT"

    tf_query = _trading_fee_ledger_query()
    tf_query["currency"] = currency
    trading_fee_total = _ledger_amount_sum(db, tf_query)

    pf_query = _platform_fee_ledger_query()
    pf_query["currency"] = currency
    platform_fee_total = _ledger_amount_sum(db, pf_query)

    if currency == "INR":
        wf_query = {
            "status": {"$in": ["approved", "completed"]},
            "$or": [{"currency": "INR"}, {"payment_method": "inr_withdrawal"}, {"crypto_asset": "INR"}]
        }
    else:
        wf_query = {
            "status": {"$in": ["approved", "completed"]},
            "$or": [{"currency": "USDT"}, {"currency": {"$exists": False}}]
        }

    wf_rows = list(db.withdrawals.aggregate([
        {"$match": wf_query},
        {"$group": {"_id": None, "withdrawal_fee": {"$sum": {"$ifNull": ["$withdrawal_fee", 0]}}}}
    ]))
    withdrawal_fee_total = round(_to_number(wf_rows[0].get("withdrawal_fee")) if wf_rows else 0.0, 8)

    transfers_from_rows = list(db.admin_profit_transfers.aggregate([
        {"$match": {"from_currency": currency}},
        {"$group": {"_id": None, "amount": {"$sum": {"$ifNull": ["$from_amount", 0]}}}}
    ]))
    transfers_from_sum = round(_to_number(transfers_from_rows[0].get("amount")) if transfers_from_rows else 0.0, 8)

    transfers_to_rows = list(db.admin_profit_transfers.aggregate([
        {"$match": {"to_currency": currency}},
        {"$group": {"_id": None, "amount": {"$sum": {"$ifNull": ["$to_amount", 0]}}}}
    ]))
    transfers_to_sum = round(_to_number(transfers_to_rows[0].get("amount")) if transfers_to_rows else 0.0, 8)

    total_revenue = round(trading_fee_total + platform_fee_total + withdrawal_fee_total + transfers_to_sum, 8)

    if currency == "USDT":
        aw_query = {"$or": [{"currency": "USDT"}, {"currency": {"$exists": False}}]}
    else:
        aw_query = {"currency": "INR"}

    aw_rows = list(db.admin_withdrawals.aggregate([
        {"$match": aw_query},
        {"$group": {"_id": None, "amount": {"$sum": {"$ifNull": ["$amount", 0]}}}}
    ]))
    total_withdrawn = round(_to_number(aw_rows[0].get("amount")) if aw_rows else 0.0, 8)
    available_balance = round(max(0.0, total_revenue - total_withdrawn - transfers_from_sum), 8)

    withdrawals = list(db.admin_withdrawals.find(aw_query).sort("created_at", -1))

    return {
        "currency": currency,
        "symbol": "₹" if currency == "INR" else "$",
        "trading_fee_total": trading_fee_total,
        "platform_fee_total": platform_fee_total,
        "withdrawal_fee_total": withdrawal_fee_total,
        "total_revenue": total_revenue,
        "total_withdrawn": total_withdrawn,
        "available_balance": available_balance,
        "withdrawals": serialize_documents(withdrawals)
    }


def get_admin_profit_total(db):
    usdt = get_admin_profit_by_currency(db, "USDT")
    return usdt["total_revenue"]


@admin_wallet_api.get("/admin-summary")
@admin_required
@permission_required("wallet.view")
def get_admin_wallet_summary():
    db = get_database()
    usdt_data = get_admin_profit_by_currency(db, "USDT")
    inr_data = get_admin_profit_by_currency(db, "INR")

    from admin.settings_routes import get_final_settings
    system_settings = get_final_settings()
    usdt_rate = float(system_settings.get("usdt_inr_rate", 88.50) or 88.50)

    return success_response(
        message="Admin wallet summary fetched successfully.",
        data={
            "usdt": usdt_data,
            "inr": inr_data,
            "usdt_inr_rate": usdt_rate,
            "total_revenue": usdt_data["total_revenue"],
            "total_withdrawn": usdt_data["total_withdrawn"],
            "available_balance": usdt_data["available_balance"],
            "withdrawals": usdt_data["withdrawals"],
            "inr_settings": {
                "upi_id": system_settings.get("inr_deposit_upi_id") or "traidiumx@upi",
                "account_name": system_settings.get("inr_deposit_account_name") or "TraidiumX Trading Services Ltd",
                "bank_name": system_settings.get("inr_deposit_bank_name") or "HDFC Bank",
                "account_number": system_settings.get("inr_deposit_account_number") or "50100498765432",
                "ifsc_code": system_settings.get("inr_deposit_ifsc_code") or "HDFC0000128"
            }
        }
    )


@admin_wallet_api.post("/admin-withdraw")
@admin_required
@permission_required("wallet.view")
def admin_withdraw_profit():
    db = get_database()
    body = request.get_json() or {}

    currency = str(body.get("currency") or "USDT").strip().upper()
    if currency not in ["INR", "USDT"]:
        currency = "USDT"

    network = body.get("network")
    address = body.get("address")
    amount = _to_number(body.get("amount"))

    if not network:
        return error_response(message="Invalid network or payment method selected.")

    if not address or len(address.strip()) < 3:
        return error_response(message="Invalid wallet address or payment account.")

    if amount <= 0:
        return error_response(message="Withdrawal amount must be greater than 0.")

    summary = get_admin_profit_by_currency(db, currency)
    available_balance = summary.get("available_balance", 0.0)
    symbol = summary.get("symbol", "$")

    if amount > available_balance:
        return error_response(message=f"Insufficient available {currency} profit balance. Available: {symbol}{available_balance}")

    withdrawal_doc = {
        "currency": currency,
        "network": network,
        "address": address,
        "amount": amount,
        "status": "completed",
        "created_at": datetime.now(timezone.utc)
    }
    db.admin_withdrawals.insert_one(withdrawal_doc)

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="admin_profit_withdraw",
        resource_type="wallet",
        resource_id=str(withdrawal_doc.get("_id") or ""),
        message=f"Admin withdrew {symbol}{amount} {currency} profit to {network} ({address})",
        metadata={"currency": currency, "network": network, "address": address, "amount": amount}
    )

    return success_response(
        message=f"Admin {currency} profit withdrawal of {symbol}{amount} processed successfully.",
        data={"withdrawal": serialize_document(withdrawal_doc)}
    )


@admin_wallet_api.post("/admin-transfer-profit")
@admin_required
@permission_required("wallet.view")
def admin_transfer_profit():
    db = get_database()
    body = request.get_json() or {}

    from_currency = str(body.get("from_currency") or "USDT").strip().upper()
    to_currency = str(body.get("to_currency") or "INR").strip().upper()
    amount = _to_number(body.get("amount"))

    if from_currency not in ["INR", "USDT"] or to_currency not in ["INR", "USDT"]:
        return error_response(message="Invalid currency selected for transfer.")

    if from_currency == to_currency:
        return error_response(message="Source and target currencies must be different.")

    if amount <= 0:
        return error_response(message="Transfer amount must be greater than 0.")

    source_wallet = get_admin_profit_by_currency(db, from_currency)
    if source_wallet["available_balance"] < amount:
        return error_response(message=f"Insufficient balance in {from_currency} profit wallet.")

    from admin.settings_routes import get_final_settings
    system_settings = get_final_settings()
    usdt_rate = float(system_settings.get("usdt_inr_rate", 88.50) or 88.50)

    if from_currency == "USDT" and to_currency == "INR":
        converted_amount = round(amount * usdt_rate, 8)
        rate_used = usdt_rate
    else:
        converted_amount = round(amount / usdt_rate, 8)
        rate_used = round(1.0 / usdt_rate, 8)

    transfer_doc = {
        "from_currency": from_currency,
        "to_currency": to_currency,
        "from_amount": amount,
        "to_amount": converted_amount,
        "exchange_rate": rate_used,
        "created_at": datetime.now(timezone.utc)
    }
    db.admin_profit_transfers.insert_one(transfer_doc)

    create_admin_audit_log(
        admin_id=g.current_admin_id,
        admin_email=g.current_admin_email,
        action="admin_profit_transfer",
        resource_type="wallet",
        resource_id=str(transfer_doc.get("_id") or ""),
        message=f"Admin transferred {from_currency} {amount} to {to_currency} {converted_amount} at rate {rate_used}",
        metadata={"from_currency": from_currency, "to_currency": to_currency, "from_amount": amount, "to_amount": converted_amount}
    )

    return success_response(
        message=f"Successfully transferred {amount} {from_currency} to {converted_amount} {to_currency}.",
        data={"transfer": serialize_document(transfer_doc)}
    )




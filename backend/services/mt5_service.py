import hashlib
import secrets
from datetime import timedelta

import requests

from bson import ObjectId
from config.database import get_database
from config.settings import settings
from models.mt5_account_model import find_mt5_account_by_user_id, format_mt5_account, upsert_mt5_account
from services.trading_plan_service import PLAN_NAMES, get_plan_settings, reconcile_user_plan
from utils.date_helper import now_utc
from utils.validators import validate_password_strength


def _configured_auto_provisioning():
    return bool(getattr(settings, "MT5_PROVISIONING_API_URL", "") and getattr(settings, "MT5_PROVISIONING_API_KEY", ""))


def _provider_headers():
    return {
        "Authorization": f"Bearer {getattr(settings, 'MT5_PROVISIONING_API_KEY', '')}",
        "Content-Type": "application/json",
    }


def get_mt5_capabilities():
    return {
        "auto_provisioning_configured": _configured_auto_provisioning(),
        "existing_account_connection_enabled": bool(getattr(settings, "METAAPI_TOKEN", "")),
        "funding_configured": bool(getattr(settings, "MT5_FUNDING_API_URL", "")),
        "group_sync_configured": bool(getattr(settings, "MT5_GROUP_API_URL", "")),
        "server_name": getattr(settings, "MT5_SERVER_NAME", "TraidiumX-Live"),
        "broker_name": getattr(settings, "MT5_BROKER_NAME", "TraidiumX Broker"),
        "note": "METAAPI_TOKEN imports an existing broker MT5 account into MetaApi. Automatic new MT5 Login ID creation still requires an MT5 broker/white-label Manager API.",
    }


def get_user_mt5_status(user_id):
    return {
        "success": True,
        "message": "MT5 account status fetched successfully.",
        "data": {
            "account": format_mt5_account(find_mt5_account_by_user_id(user_id)),
            "capabilities": get_mt5_capabilities(),
        },
        "status_code": 200,
    }


def _token_digest(token):
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


def _password_setup_token(user_id):
    token = secrets.token_urlsafe(32)
    created_at = now_utc()
    get_database().mt5_password_setup_tokens.insert_one({
        "user_id": str(user_id),
        "token_digest": _token_digest(token),
        "used": False,
        "created_at": created_at,
        "expires_at": created_at + timedelta(hours=1),
    })
    return token


def provision_mt5_account(user_id):
    from services.kyc_status_service import require_kyc_approved
    kyc_restriction = require_kyc_approved(user_id, "trading")
    if kyc_restriction:
        return kyc_restriction

    profile_result = reconcile_user_plan(user_id, send_notice=True)
    if not profile_result.get("success"):
        return profile_result
    profile = profile_result.get("data") or {}
    if profile.get("selected_platform") != "mt5":
        return {"success": False, "message": "Select MetaTrader 5 first.", "errors": {"platform": "MT5 is not selected."}, "status_code": 409}
    if not profile.get("provisioning_balance_eligible"):
        return {
            "success": False,
            "message": f"Complete the selected {profile.get('preferred_plan_name') or 'plan'} minimum balance before MT5 account creation.",
            "errors": {"balance": f"Minimum {profile.get('preferred_minimum_balance', 0):g} USDT required in the Trading Wallet."},
            "status_code": 422,
        }

    existing = find_mt5_account_by_user_id(user_id)
    if existing and existing.get("status") in {"active", "connected", "provisioning"}:
        return {"success": True, "message": "MT5 account already exists.", "data": {"account": format_mt5_account(existing), "capabilities": get_mt5_capabilities()}, "status_code": 200}

    plan = profile.get("active_plan") or "basic"
    plans = get_plan_settings()
    plan_data = plans[plan]
    group = f"TX-{plan.upper()}"

    if not _configured_auto_provisioning():
        account = upsert_mt5_account(user_id, {
            "status": "setup_pending",
            "mode": "auto_provision",
            "broker_name": getattr(settings, "MT5_BROKER_NAME", "TraidiumX Broker"),
            "server": getattr(settings, "MT5_SERVER_NAME", "TraidiumX-Live"),
            "plan": plan,
            "group": group,
            "spread_pips": plan_data["spread_pips"],
            "balance": 0.0,
            "equity": 0.0,
            "source_trading_wallet_balance": profile.get("source_trading_wallet_balance", profile.get("trading_balance", 0.0)),
            "connection_status": "waiting_for_broker_api",
            "provisioning_note": "Broker/white-label provisioning API is not configured. Add MT5_PROVISIONING_API_URL and MT5_PROVISIONING_API_KEY in backend .env.",
        })
        return {
            "success": True,
            "message": "MT5 setup is pending broker API configuration.",
            "data": {"account": format_mt5_account(account), "capabilities": get_mt5_capabilities()},
            "status_code": 202,
        }

    user = get_database().users.find_one({"_id": ObjectId(str(user_id))}) or {}
    payload = {
        "external_user_id": str(user_id),
        "email": user.get("email", ""),
        "name": user.get("name", "Trader"),
        "group": group,
        "plan": plan,
        "spread_pips": plan_data["spread_pips"],
        "currency": getattr(settings, "MT5_ACCOUNT_CURRENCY", "USD"),
        "server": getattr(settings, "MT5_SERVER_NAME", "TraidiumX-Live"),
    }
    upsert_mt5_account(user_id, {**payload, "status": "provisioning", "connection_status": "provisioning"})
    try:
        response = requests.post(
            getattr(settings, "MT5_PROVISIONING_API_URL", ""),
            json=payload,
            headers=_provider_headers(),
            timeout=int(getattr(settings, "MT5_API_TIMEOUT_SECONDS", 15)),
        )
        body = response.json() if response.content else {}
        if not response.ok:
            raise RuntimeError(body.get("message") or f"Broker API returned HTTP {response.status_code}.")
        login_id = str(body.get("login_id") or body.get("login") or body.get("account_id") or "")
        server = str(body.get("server") or payload["server"])
        if not login_id:
            raise RuntimeError("Broker API did not return an MT5 Login ID.")

        setup_token = _password_setup_token(user_id)
        account = upsert_mt5_account(user_id, {
            "status": "active",
            "mode": "auto_provision",
            "broker_name": body.get("broker_name") or getattr(settings, "MT5_BROKER_NAME", "TraidiumX Broker"),
            "server": server,
            "login_id": login_id,
            "provider_account_id": str(body.get("provider_account_id") or body.get("id") or login_id),
            "account_currency": body.get("currency") or payload["currency"],
            "balance": body.get("balance", 0.0),
            "equity": body.get("equity", body.get("balance", 0.0)),
            "source_trading_wallet_balance": profile.get("source_trading_wallet_balance", profile.get("trading_balance", 0.0)),
            "group": group,
            "plan": plan,
            "spread_pips": plan_data["spread_pips"],
            "connection_status": "active",
            "password_setup_required": True,
            "provisioning_note": "MT5 account created successfully.",
        })
        try:
            from services.email_service import send_mt5_account_ready_email
            send_mt5_account_ready_email(
                to_email=user.get("email", ""),
                login_id=login_id,
                server=server,
                plan=PLAN_NAMES.get(plan, plan.title()),
                spread_pips=plan_data["spread_pips"],
                setup_token=setup_token,
            )
        except Exception as error:
            print("MT5 READY EMAIL ERROR:", error)
        return {"success": True, "message": "MT5 account created successfully.", "data": {"account": format_mt5_account(account), "capabilities": get_mt5_capabilities()}, "status_code": 201}
    except Exception as error:
        account = upsert_mt5_account(user_id, {
            "status": "failed",
            "connection_status": "failed",
            "provisioning_note": str(error),
        })
        return {"success": False, "message": "MT5 account creation failed.", "errors": {"mt5": str(error)}, "data": {"account": format_mt5_account(account)}, "status_code": 502}


def fund_mt5_account(user_id, data):
    from services.kyc_status_service import require_kyc_approved
    kyc_restriction = require_kyc_approved(user_id, "trading")
    if kyc_restriction:
        return kyc_restriction

    try:
        amount = round(float((data or {}).get("amount") or 0), 8)
    except (TypeError, ValueError):
        amount = 0.0
    if amount <= 0:
        return {"success": False, "message": "Enter a valid MT5 funding amount.", "errors": {"amount": "Amount must be greater than 0."}, "status_code": 422}

    profile_result = reconcile_user_plan(user_id, send_notice=True)
    if not profile_result.get("success"):
        return profile_result
    profile = profile_result.get("data") or {}
    if profile.get("selected_platform") != "mt5":
        return {"success": False, "message": "Select MetaTrader 5 before funding an MT5 account.", "errors": {"platform": "MT5 is not selected."}, "status_code": 409}

    account = find_mt5_account_by_user_id(user_id)
    if not account or account.get("status") not in {"active", "connected"} or not account.get("login_id"):
        return {"success": False, "message": "Create or connect an active MT5 account first.", "errors": {"mt5": "Active MT5 Login ID not found."}, "status_code": 409}

    funding_url = str(getattr(settings, "MT5_FUNDING_API_URL", "") or "").strip()
    if not funding_url:
        return {"success": False, "message": "MT5 funding API is not configured.", "errors": {"mt5": "Add MT5_FUNDING_API_URL in backend .env."}, "status_code": 503}

    from services.wallet_service import complete_locked_trading_wallet_debit, lock_wallet_amount, release_locked_amount

    reference_id = f"MT5F-{secrets.token_hex(6).upper()}"
    lock_result = lock_wallet_amount(
        user_id,
        amount,
        "mt5_funding_lock",
        reference_id=reference_id,
        description=f"Trading Wallet amount locked for MT5 account {str(account.get('login_id'))[-4:]} funding.",
    )
    if not lock_result.get("success"):
        return {"success": False, "message": lock_result.get("message", "Insufficient Trading Wallet balance."), "errors": {"balance": lock_result.get("message", "Insufficient balance.")}, "status_code": 422}

    payload = {
        "operation": "credit",
        "external_user_id": str(user_id),
        "provider_account_id": account.get("provider_account_id"),
        "login_id": account.get("login_id"),
        "server": account.get("server"),
        "amount": amount,
        "currency": account.get("account_currency") or getattr(settings, "MT5_ACCOUNT_CURRENCY", "USD"),
        "reference_id": reference_id,
    }
    try:
        response = requests.post(
            funding_url,
            json=payload,
            headers=_provider_headers(),
            timeout=int(getattr(settings, "MT5_API_TIMEOUT_SECONDS", 15)),
        )
        body = response.json() if response.content else {}
        if not response.ok:
            raise RuntimeError(body.get("message") or f"Broker funding API returned HTTP {response.status_code}.")

        finalize = complete_locked_trading_wallet_debit(
            user_id,
            amount,
            transaction_type="mt5_funding_completed",
            reference_id=reference_id,
            description=f"Transferred {amount:g} USDT from TraidiumX Trading Wallet to MT5.",
        )
        if not finalize.get("success"):
            raise RuntimeError(finalize.get("message") or "Broker funded the account but local wallet finalization failed. Contact support immediately.")

        current_balance = float(account.get("balance") or 0)
        broker_balance = body.get("balance")
        next_balance = float(broker_balance) if broker_balance not in (None, "") else round(current_balance + amount, 8)
        next_equity = body.get("equity")
        if next_equity in (None, ""):
            next_equity = next_balance
        account = upsert_mt5_account(user_id, {
            "balance": next_balance,
            "equity": float(next_equity),
            "last_funding_amount": amount,
            "last_funding_reference_id": reference_id,
            "last_funded_at": now_utc(),
            "funding_status": "completed",
            "provisioning_note": body.get("message") or "MT5 account funded successfully.",
        })
        try:
            user = get_database().users.find_one({"_id": ObjectId(str(user_id))}) or {}
            from services.email_service import send_mt5_funding_completed_email
            send_mt5_funding_completed_email(
                user.get("email", ""), amount, account.get("login_id"), account.get("server"), next_balance, reference_id
            )
        except Exception as email_error:
            print("MT5 FUNDING EMAIL ERROR:", email_error)
        plan_result = reconcile_user_plan(user_id, send_notice=True)
        return {
            "success": True,
            "message": body.get("message") or "MT5 account funded successfully.",
            "data": {
                "account": format_mt5_account(account),
                "wallet": finalize.get("wallet"),
                "trading_profile": plan_result.get("data", {}),
                "reference_id": reference_id,
            },
            "status_code": 200,
        }
    except Exception as error:
        # Release only when the provider did not confirm a successful response.
        # If local finalization itself failed after provider success, retaining
        # the lock is safer than refunding and double-crediting the user.
        provider_confirmed = "body" in locals() and isinstance(body, dict) and response.ok
        if not provider_confirmed:
            release_locked_amount(
                user_id,
                amount,
                "mt5_funding_reversal",
                reference_id=reference_id,
                description=f"MT5 funding failed; {amount:g} USDT returned to Trading Wallet.",
            )
        upsert_mt5_account(user_id, {
            "funding_status": "manual_review" if provider_confirmed else "failed",
            "last_funding_error": str(error),
            "last_funding_reference_id": reference_id,
        })
        return {"success": False, "message": "MT5 funding could not be completed.", "errors": {"mt5": str(error)}, "status_code": 502}



def connect_existing_mt5_account(user_id, data):
    from services.kyc_status_service import require_kyc_approved
    kyc_restriction = require_kyc_approved(user_id, "trading")
    if kyc_restriction:
        return kyc_restriction

    login_id = str(data.get("login_id") or "").strip()
    password = str(data.get("password") or "")
    server = str(data.get("server") or "").strip()
    broker_name = str(data.get("broker_name") or "External Broker").strip()
    if not login_id or not password or not server:
        return {"success": False, "message": "MT5 Login ID, trading password and broker server are required.", "errors": {"mt5": "Complete all MT5 connection fields."}, "status_code": 422}
    token = str(getattr(settings, "METAAPI_TOKEN", "") or "").strip()
    if not token:
        existing = find_mt5_account_by_user_id(user_id)
        if existing and existing.get("status") == "credentials_sent":
            from services.trading_onboarding_service import _decrypt_secret
            saved_password = _decrypt_secret(existing.get("password_encrypted", ""))
            if (existing.get("login_id") != login_id or 
                existing.get("server") != server or 
                saved_password != password):
                return {
                    "success": False,
                    "message": "Invalid MT5 credentials. Please check the details sent to your registered email.",
                    "errors": {"mt5": "Invalid credentials. Details do not match."},
                    "status_code": 401
                }

        profile_result = reconcile_user_plan(user_id, send_notice=True)
        profile = profile_result.get("data") or {}
        account = upsert_mt5_account(user_id, {
            "status": "connected",
            "mode": "existing_account",
            "broker_name": broker_name,
            "server": server,
            "login_id": login_id,
            "connection_status": "active",
            "provider_account_id": f"manual-{login_id}",
            "provisioning_note": "MT5 account connected successfully.",
            "password_setup_required": False,
            "plan": profile.get("active_plan") or "basic",
            "group": f"TX-{str(profile.get('active_plan') or 'basic').upper()}",
            "spread_pips": profile.get("active_spread_pips", 0),
        })
        return {
            "success": True,
            "message": "MT5 account connected successfully.",
            "data": {"account": format_mt5_account(account), "capabilities": get_mt5_capabilities()},
            "status_code": 200,
        }

    profile_result = reconcile_user_plan(user_id, send_notice=True)
    profile = profile_result.get("data") or {}
    if profile.get("selected_platform") != "mt5":
        return {"success": False, "message": "Select MetaTrader 5 first.", "errors": {"platform": "MT5 is not selected."}, "status_code": 409}

    existing = find_mt5_account_by_user_id(user_id) or {}
    same_pending = (
        existing.get("mode") == "existing_account"
        and str(existing.get("login_id") or "") == login_id
        and str(existing.get("server") or "") == server
        and existing.get("metaapi_transaction_id")
    )
    transaction_id = str(existing.get("metaapi_transaction_id")) if same_pending else secrets.token_hex(16)
    provisioning_url = str(getattr(settings, "METAAPI_PROVISIONING_URL", "") or "").strip()
    if not provisioning_url:
        return {"success": False, "message": "MetaApi provisioning URL is missing.", "errors": {"metaapi": "Set METAAPI_PROVISIONING_URL."}, "status_code": 503}

    user = get_database().users.find_one({"_id": ObjectId(str(user_id))}) or {}
    payload = {
        "login": login_id,
        "password": password,
        "name": f"TraidiumX-{str(user_id)[-8:]}",
        "server": server,
        "platform": "mt5",
        "magic": int(getattr(settings, "METAAPI_MAGIC", 20260716)),
        "keywords": [broker_name] if broker_name else [],
        "metadata": {
            "traidiumxUserId": str(user_id),
            "traidiumxEmail": user.get("email", ""),
        },
    }
    headers = {
        "auth-token": token,
        "transaction-id": transaction_id,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    try:
        response = requests.post(
            provisioning_url,
            json=payload,
            headers=headers,
            timeout=int(getattr(settings, "MT5_API_TIMEOUT_SECONDS", 15)),
        )
        body = response.json() if response.content else {}
        if response.status_code not in {200, 201, 202}:
            raise RuntimeError(body.get("message") or f"MetaApi returned HTTP {response.status_code}.")

        provider_account_id = str(body.get("id") or body.get("_id") or existing.get("provider_account_id") or "")
        accepted = response.status_code == 202 or not provider_account_id
        state = str(body.get("state") or "").upper()
        status = "connection_pending" if accepted else ("connected" if state == "DEPLOYED" else "provisioning")
        connection_status = str(body.get("connectionStatus") or body.get("connection_status") or ("waiting_for_metaapi" if accepted else state.lower() or "deploying")).lower()
        retry_after = response.headers.get("Retry-After", "")
        note = body.get("message") or (
            f"MetaApi accepted the account import. Retry after {retry_after}." if accepted and retry_after
            else "MetaApi account import is processing." if accepted
            else "Existing MT5 account imported into MetaApi successfully."
        )
        account = upsert_mt5_account(user_id, {
            "status": status,
            "mode": "existing_account",
            "broker_name": broker_name,
            "server": server,
            "login_id": login_id,
            "connection_status": connection_status,
            "provider_account_id": provider_account_id,
            "metaapi_transaction_id": transaction_id,
            "metaapi_state": state,
            "metaapi_retry_after": retry_after,
            "provisioning_note": note,
            "password_setup_required": False,
            "plan": profile.get("active_plan") or "basic",
            "group": f"TX-{str(profile.get('active_plan') or 'basic').upper()}",
            "spread_pips": profile.get("active_spread_pips", 0),
        })
        return {
            "success": True,
            "message": note,
            "data": {"account": format_mt5_account(account), "capabilities": get_mt5_capabilities()},
            "status_code": 202 if accepted else 200,
        }
    except Exception as error:
        account = upsert_mt5_account(user_id, {
            "status": "connection_failed",
            "mode": "existing_account",
            "broker_name": broker_name,
            "server": server,
            "login_id": login_id,
            "connection_status": "failed",
            "metaapi_transaction_id": transaction_id,
            "provisioning_note": str(error),
        })
        return {
            "success": False,
            "message": "Unable to connect the existing MT5 account through MetaApi.",
            "errors": {"metaapi": str(error)},
            "data": {"account": format_mt5_account(account)},
            "status_code": 502,
        }



def setup_mt5_password(user_id, data):
    token = str(data.get("token") or "").strip()
    password = str(data.get("password") or "")
    confirm_password = str(data.get("confirm_password") or "")
    valid, password_error = validate_password_strength(password)
    errors = {}
    if not token:
        errors["token"] = "Password setup link is missing or invalid."
    if not valid:
        errors["password"] = password_error
    if password != confirm_password:
        errors["confirm_password"] = "Password and confirm password do not match."
    if errors:
        return {"success": False, "message": "MT5 password validation failed.", "errors": errors, "status_code": 422}

    token_doc = get_database().mt5_password_setup_tokens.find_one({
        "user_id": str(user_id),
        "token_digest": _token_digest(token),
        "used": False,
        "expires_at": {"$gt": now_utc()},
    })
    if not token_doc:
        return {"success": False, "message": "MT5 password setup link expired or already used.", "errors": {"token": "Request a new setup link from support."}, "status_code": 410}

    account = find_mt5_account_by_user_id(user_id)
    if not account or not account.get("login_id"):
        return {"success": False, "message": "MT5 account is not ready.", "errors": {"account": "No active MT5 Login ID found."}, "status_code": 409}

    password_url = getattr(settings, "MT5_PASSWORD_API_URL", "")
    if not password_url:
        return {"success": False, "message": "Broker password API is not configured.", "errors": {"mt5": "Add MT5_PASSWORD_API_URL in backend .env."}, "status_code": 503}

    try:
        response = requests.post(
            password_url,
            json={
                "provider_account_id": account.get("provider_account_id"),
                "login_id": account.get("login_id"),
                "server": account.get("server"),
                "password": password,
            },
            headers=_provider_headers(),
            timeout=int(getattr(settings, "MT5_API_TIMEOUT_SECONDS", 15)),
        )
        body = response.json() if response.content else {}
        if not response.ok:
            raise RuntimeError(body.get("message") or f"Broker password API returned HTTP {response.status_code}.")
        get_database().mt5_password_setup_tokens.update_one({"_id": token_doc["_id"]}, {"$set": {"used": True, "used_at": now_utc()}})
        account = upsert_mt5_account(user_id, {
            "password_setup_required": False,
            "password_set_at": now_utc(),
            "connection_status": "active",
            "status": "active",
        })
        return {"success": True, "message": "MT5 trading password set successfully.", "data": {"account": format_mt5_account(account)}, "status_code": 200}
    except Exception as error:
        return {"success": False, "message": "Unable to set MT5 trading password.", "errors": {"mt5": str(error)}, "status_code": 502}


def sync_mt5_plan(user_id, active_plan, spread_pips, balance=None):
    """Synchronize the TraidiumX active plan with the user's MT5 account.

    The local MT5 account record is always updated. A real broker group change is
    sent only when MT5_GROUP_API_URL is configured. This avoids pretending that
    a broker-side spread/group changed when no Manager/white-label API exists.
    """
    active_plan = str(active_plan or "basic").strip().lower()
    group = f"TX-{active_plan.upper()}"
    account = find_mt5_account_by_user_id(user_id)
    if not account:
        return {"success": True, "synced": False, "reason": "No MT5 account exists."}

    local_update = {
        "plan": active_plan,
        "group": group,
        "spread_pips": float(spread_pips or 0),
    }
    if balance is not None:
        local_update["balance_snapshot"] = float(balance or 0)

    group_url = str(getattr(settings, "MT5_GROUP_API_URL", "") or "").strip()
    if not group_url or not account.get("provider_account_id"):
        local_update.update({
            "group_sync_status": "waiting_for_broker_api",
            "group_sync_note": "Local plan updated. Broker group API is not configured or provider account ID is missing.",
        })
        upsert_mt5_account(user_id, local_update)
        return {"success": True, "synced": False, "reason": local_update["group_sync_note"]}

    payload = {
        "provider_account_id": account.get("provider_account_id"),
        "login_id": account.get("login_id"),
        "server": account.get("server"),
        "group": group,
        "plan": active_plan,
        "spread_pips": float(spread_pips or 0),
    }
    try:
        response = requests.post(
            group_url,
            json=payload,
            headers=_provider_headers(),
            timeout=int(getattr(settings, "MT5_API_TIMEOUT_SECONDS", 15)),
        )
        body = response.json() if response.content else {}
        if not response.ok:
            raise RuntimeError(body.get("message") or f"Broker group API returned HTTP {response.status_code}.")
        upsert_mt5_account(user_id, {
            **local_update,
            "group_sync_status": "synced",
            "group_sync_note": body.get("message") or "Broker group updated successfully.",
        })
        return {"success": True, "synced": True, "data": body}
    except Exception as error:
        upsert_mt5_account(user_id, {
            **local_update,
            "group_sync_status": "failed",
            "group_sync_note": str(error),
        })
        return {"success": False, "synced": False, "reason": str(error)}


def refresh_mt5_balance(user_id):
    """Fetch the latest remote MT5 balance and equity, updating the database."""
    account = find_mt5_account_by_user_id(user_id)
    if not account or not account.get("login_id"):
        return None

    # If MetaApi is enabled and configured, fetch the remote balance/equity
    if getattr(settings, "METAAPI_ENABLED", False):
        from services.metaapi_service import configuration_status, get_account_information
        if configuration_status().get("ready"):
            try:
                login = account.get("login_id")
                info = get_account_information(login)
                if info:
                    balance = float(info.get("balance", account.get("balance", 0.0)))
                    equity = float(info.get("equity", account.get("equity", 0.0)))
                    upsert_mt5_account(user_id, {
                        "balance": balance,
                        "equity": equity,
                    })
                    return {"balance": balance, "equity": equity}
            except Exception as err:
                print(f"Failed to refresh MT5 balance via MetaApi for user {user_id}: {err}")
    return None

"""Platform selection, subscription plans and MT5 provisioning workflow."""
from __future__ import annotations

import base64
import hashlib
import os
import secrets
from datetime import timedelta
from typing import Any

from bson import ObjectId
from cryptography.fernet import Fernet, InvalidToken

from config.database import get_database
from config.settings import settings
from models.user_model import find_user_by_id
from services.email_service import is_email_delivery_configured, send_mt5_account_ready_email
from services.metaapi_service import (
    MetaApiError,
    add_balance,
    change_account_group,
    configuration_status,
    create_mt5_account,
    get_account_information,
    plan_group,
)
from services.notification_service import create_user_notification
from services.wallet_service import (
    complete_main_locked_debit,
    ensure_user_wallet,
    lock_main_wallet_amount,
    release_main_locked_amount,
)
from utils.date_helper import now_utc


PLATFORM_TRAIDIUMX = "traidiumx"
PLATFORM_MT5 = "metatrader5"
VALID_PLATFORMS = {PLATFORM_TRAIDIUMX, PLATFORM_MT5}
PLAN_ORDER = ["basic", "standard", "advanced"]
DEFAULT_PLAN_SETTINGS = {
    "broker_selection_enabled": True,
    "plan_auto_downgrade_enabled": True,
    "basic_plan_spread_type": "fixed",
    "basic_plan_spread_value": 18.0,
    "basic_plan_min_balance": 100.0,
    "standard_plan_spread_type": "fixed",
    "standard_plan_spread_value": 12.0,
    "standard_plan_min_balance": 1000.0,
    "advanced_plan_spread_type": "fixed",
    "advanced_plan_spread_value": 5.0,
    "advanced_plan_min_balance": 5000.0,
}


def _money(value: Any) -> float:
    try:
        return round(float(value or 0), 8)
    except (TypeError, ValueError):
        return 0.0


def _object_id(user_id):
    try:
        return ObjectId(str(user_id))
    except Exception:
        return None


def _settings_doc() -> dict:
    try:
        saved = get_database().system_settings.find_one({"settings_key": "main"}) or {}
    except Exception:
        saved = {}
    return {**DEFAULT_PLAN_SETTINGS, **saved}


def _broker_configuration(plan_key: str) -> dict:
    config = configuration_status(plan_key)
    missing = list(config.get("missing") or [])
    if not is_email_delivery_configured():
        missing.append("SMTP email delivery configuration")
    public_base = str(settings.APP_PUBLIC_URL or settings.FRONTEND_URL or "").strip()
    if not public_base:
        missing.append("APP_PUBLIC_URL or FRONTEND_URL")
    return {**config, "ready": not missing, "missing": missing}


def plan_catalog() -> list[dict]:
    cfg = _settings_doc()
    result = []
    for key, label in (("basic", "Basic"), ("standard", "Standard"), ("advanced", "Advanced")):
        result.append({
            "key": key,
            "name": label,
            "spread_type": str(cfg.get(f"{key}_plan_spread_type") or "fixed"),
            "spread_value": _money(cfg.get(f"{key}_plan_spread_value") or cfg.get(f"{key}_plan_spread_pips") or cfg.get(f"{key}_plan_pips") or 0.0),
            "spread_pips": _money(cfg.get(f"{key}_plan_spread_value") or cfg.get(f"{key}_plan_spread_pips") or cfg.get(f"{key}_plan_pips") or 0.0),
            "minimum_balance": _money(cfg.get(f"{key}_plan_minimum_balance") or cfg.get(f"{key}_plan_min_balance")),
        })
    return result


def get_plan(plan_key: str | None) -> dict | None:
    normalized = str(plan_key or "").strip().lower()
    return next((plan for plan in plan_catalog() if plan["key"] == normalized), None)


def _wallet_balances(user_id: str) -> dict:
    wallet = ensure_user_wallet(user_id)
    main = wallet.get("main_wallet") or {}
    trading = wallet.get("trading_wallet") or {}
    main_available = _money(main.get("available_balance"))
    main_locked = _money(main.get("locked_balance"))
    trading_total = _money(trading.get("total_balance") or wallet.get("total_balance"))
    combined = _money(main_available + main_locked + trading_total)
    return {
        "main_available": main_available,
        "main_locked": main_locked,
        "trading_total": trading_total,
        "combined_equity": combined,
    }


def _fernet() -> Fernet:
    configured = str(settings.METAAPI_CREDENTIAL_ENCRYPTION_KEY or "").strip().encode()
    if configured:
        try:
            return Fernet(configured)
        except (ValueError, TypeError):
            pass
    secret = str(settings.JWT_SECRET_KEY or "change-this-secret").encode("utf-8")
    derived = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(derived)


def _encrypt_secret(value: str) -> str:
    return _fernet().encrypt(str(value or "").encode("utf-8")).decode("utf-8") if value else ""


def _decrypt_secret(value: str) -> str:
    if not value:
        return ""
    return _fernet().decrypt(str(value).encode("utf-8")).decode("utf-8")


def _create_credential_token(user_id: str, account: dict) -> str:
    token = secrets.token_urlsafe(40)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    expires_at = now_utc() + timedelta(hours=max(int(settings.METAAPI_CREDENTIAL_LINK_HOURS), 1))
    password = str(account.get("password") or "")
    investor_password = str(account.get("investor_password") or "")

    get_database().mt5_credential_tokens.insert_one({
        "user_id": str(user_id),
        "token_hash": token_hash,
        "login": str(account.get("login") or ""),
        "server": str(account.get("server") or ""),
        "password_encrypted": _encrypt_secret(password),
        "investor_password_encrypted": _encrypt_secret(investor_password),
        "expires_at": expires_at,
        "used_at": None,
        "created_at": now_utc(),
    })
    return token


def consume_credential_token(token: str) -> dict:
    token_hash = hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()
    collection = get_database().mt5_credential_tokens
    doc = collection.find_one_and_update(
        {
            "token_hash": token_hash,
            "used_at": None,
            "expires_at": {"$gt": now_utc()},
        },
        {"$set": {"used_at": now_utc()}},
    )
    if not doc:
        return {
            "success": False,
            "message": "This secure MT5 credentials link is invalid, expired or already used.",
            "status_code": 410,
        }

    try:
        password = _fernet().decrypt(str(doc.get("password_encrypted") or "").encode()).decode() if doc.get("password_encrypted") else ""
        investor = _fernet().decrypt(str(doc.get("investor_password_encrypted") or "").encode()).decode() if doc.get("investor_password_encrypted") else ""
    except (InvalidToken, ValueError):
        return {
            "success": False,
            "message": "MT5 credentials could not be decrypted. Contact support.",
            "status_code": 500,
        }

    return {
        "success": True,
        "message": "MT5 credentials opened successfully. This link cannot be used again.",
        "data": {
            "login": doc.get("login", ""),
            "server": doc.get("server", ""),
            "password": password,
            "investor_password": investor,
        },
        "status_code": 200,
    }


def select_platform(user_id: str, platform: str) -> dict:
    platform = str(platform or "").strip().lower().replace(" ", "")
    aliases = {"mt5": PLATFORM_MT5, "meta_trader5": PLATFORM_MT5, "metatrader": PLATFORM_MT5}
    platform = aliases.get(platform, platform)
    if platform not in VALID_PLATFORMS:
        return {"success": False, "message": "Please select TraidiumX or MetaTrader 5.", "status_code": 422}

    oid = _object_id(user_id)
    if not oid:
        return {"success": False, "message": "Invalid user.", "status_code": 404}
    user = find_user_by_id(user_id)
    if not user:
        return {"success": False, "message": "User not found.", "status_code": 404}

    # Do not silently detach an already funded MT5 account.
    current = str(user.get("trading_platform") or "")
    mt5_status = str((user.get("mt5_account") or {}).get("status") or "")
    if current == PLATFORM_MT5 and mt5_status == "active" and platform != current:
        return {
            "success": False,
            "message": "An active MT5 account cannot be switched automatically. Contact support.",
            "status_code": 409,
        }

    update = {
        "trading_platform": platform,
        "platform_selected_at": now_utc(),
        "selected_plan": None,
        "active_plan": None,
        "plan_status": "choose_plan",
        "plan_pips": None,
        "plan_min_balance": None,
        "updated_at": now_utc(),
    }
    get_database().users.update_one({"_id": oid}, {"$set": update})
    return {"success": True, "message": "Trading platform selected.", "data": onboarding_status(user_id), "status_code": 200}


def select_plan(user_id: str, plan_key: str) -> dict:
    plan = get_plan(plan_key)
    if not plan:
        return {"success": False, "message": "Please select Basic, Standard or Advanced plan.", "status_code": 422}
    user = find_user_by_id(user_id)
    if not user or user.get("trading_platform") not in VALID_PLATFORMS:
        return {"success": False, "message": "Select a trading platform first.", "status_code": 409}

    current_active = str(user.get("active_plan") or "")
    if current_active and PLAN_ORDER.index(plan["key"]) < PLAN_ORDER.index(current_active):
        # Manual downgrade is allowed, but active MT5 must update group safely.
        pass

    update = {
        "selected_plan": plan["key"],
        "active_plan": None,
        "plan_status": "awaiting_deposit",
        "plan_pips": plan["pips"],
        "plan_min_balance": plan["minimum_balance"],
        "plan_selected_at": now_utc(),
        "updated_at": now_utc(),
    }
    get_database().users.update_one({"_id": user["_id"]}, {"$set": update, "$push": {
        "plan_history": {
            "from": user.get("active_plan") or user.get("selected_plan"),
            "to": plan["key"],
            "reason": "user_selected",
            "created_at": now_utc(),
        }
    }})
    return {"success": True, "message": f"{plan['name']} plan selected.", "data": onboarding_status(user_id, auto_provision=True), "status_code": 200}


def _activate_traidiumx(user: dict, plan: dict, equity: float) -> None:
    get_database().users.update_one(
        {"_id": user["_id"]},
        {"$set": {
            "active_plan": plan["key"],
            "plan_status": "active",
            "plan_pips": plan["pips"],
            "plan_min_balance": plan["minimum_balance"],
            "plan_activated_at": user.get("plan_activated_at") or now_utc(),
            "plan_last_equity": equity,
            "updated_at": now_utc(),
        }},
    )


def _notify_plan_change(user: dict, old_plan: str, new_plan: str, equity: float):
    try:
        create_user_notification(
            user,
            title="Trading plan updated",
            message=f"Your plan changed from {old_plan.title()} to {new_plan.title()} because equity is {equity:g} USDT.",
            notice_type="plan_change",
            severity="warning",
            metadata={"from": old_plan, "to": new_plan, "equity": equity},
        )
    except Exception:
        pass


def _eligible_plan(equity: float) -> dict:
    eligible = [plan for plan in plan_catalog() if equity >= plan["minimum_balance"]]
    return eligible[-1] if eligible else get_plan("basic")


def _evaluate_downgrade(user: dict, equity: float) -> dict:
    active_key = str(user.get("active_plan") or user.get("selected_plan") or "")
    active = get_plan(active_key)
    if not active:
        return user

    cfg = _settings_doc()
    if not bool(cfg.get("plan_auto_downgrade_enabled", True)):
        return user

    if equity >= active["minimum_balance"]:
        get_database().users.update_one(
            {"_id": user["_id"]},
            {"$set": {"downgrade_warnings": 0, "show_downgrade_warning": False}}
        )
        return find_user_by_id(str(user["_id"]))

    target = _eligible_plan(equity)
    if PLAN_ORDER.index(target["key"]) >= PLAN_ORDER.index(active["key"]):
        status = "below_minimum" if active["key"] == "basic" else user.get("plan_status", "active")
        get_database().users.update_one({"_id": user["_id"]}, {"$set": {
            "plan_status": status,
            "plan_last_equity": equity,
            "updated_at": now_utc(),
        }})
        return find_user_by_id(str(user["_id"]))

    warnings = int(user.get("downgrade_warnings") or 0)
    if warnings < 3:
        get_database().users.update_one({"_id": user["_id"]}, {
            "$set": {
                "show_downgrade_warning": True,
                "plan_last_equity": equity,
                "updated_at": now_utc(),
            }
        })
        return find_user_by_id(str(user["_id"]))

    mt5 = user.get("mt5_account") or {}
    if user.get("trading_platform") == PLATFORM_MT5 and mt5.get("login"):
        change_account_group(str(mt5["login"]), plan_group(target["key"]))

    get_database().users.update_one({"_id": user["_id"]}, {
        "$set": {
            "selected_plan": target["key"],
            "active_plan": target["key"],
            "plan_status": "active" if equity >= target["minimum_balance"] else "below_minimum",
            "active_spread_type": target["spread_type"],
            "active_spread_value": target["spread_value"],
            "active_spread_pips": target["spread_value"],
            "plan_min_balance": target["minimum_balance"],
            "plan_last_equity": equity,
            "mt5_account.group": plan_group(target["key"]) if user.get("trading_platform") == PLATFORM_MT5 else mt5.get("group"),
            "show_downgrade_warning": False,
            "updated_at": now_utc(),
        },
        "$push": {"plan_history": {
            "from": active["key"], "to": target["key"], "reason": "automatic_equity_downgrade",
            "equity": equity, "created_at": now_utc(),
        }},
    })
    _notify_plan_change(user, active["key"], target["key"], equity)
    return find_user_by_id(str(user["_id"]))


def provision_mt5_if_ready(user_id: str, force: bool = False) -> dict:
    user = find_user_by_id(user_id)
    if not user or user.get("trading_platform") != PLATFORM_MT5:
        return {"success": False, "message": "MetaTrader 5 platform is not selected.", "status_code": 409}
    plan = get_plan(user.get("selected_plan"))
    if not plan:
        return {"success": False, "message": "Select a plan first.", "status_code": 409}

    mt5 = user.get("mt5_account") or {}
    if mt5.get("status") == "active":
        return {"success": True, "message": "MT5 account is already active.", "data": onboarding_status(user_id), "status_code": 200}

    balances = _wallet_balances(user_id)
    required = plan["minimum_balance"]
    reserved_for_existing_attempt = balances["main_locked"] if mt5.get("funding_reference") else 0.0
    funding_capacity = _money(balances["main_available"] + reserved_for_existing_attempt)
    if funding_capacity < required:
        return {
            "success": False,
            "message": "Required minimum balance is not complete yet.",
            "errors": {"remaining": _money(required - funding_capacity)},
            "status_code": 409,
        }

    config = _broker_configuration(plan["key"])
    if not config["ready"]:
        get_database().users.update_one({"_id": user["_id"]}, {"$set": {
            "plan_status": "pending_broker_configuration",
            "mt5_account.status": "pending_broker_configuration",
            "mt5_account.configuration_missing": config["missing"],
            "updated_at": now_utc(),
        }})
        return {
            "success": False,
            "message": "Minimum balance is complete, but MetaApi broker configuration is pending.",
            "errors": {"metaapi": config["missing"]},
            "status_code": 503,
        }

    claim = get_database().users.update_one(
        {"_id": user["_id"], "mt5_account.status": {"$nin": ["provisioning", "funding", "active"]}},
        {"$set": {"mt5_account.status": "provisioning", "plan_status": "provisioning", "updated_at": now_utc()}},
    )
    if claim.modified_count == 0 and not force:
        return {"success": False, "message": "MT5 provisioning is already running.", "status_code": 409}

    user = find_user_by_id(user_id)
    mt5 = user.get("mt5_account") or {}
    reference = str(mt5.get("funding_reference") or f"MT5-FUND-{secrets.token_hex(8).upper()}")
    already_locked = balances["main_locked"] >= required and bool(mt5.get("funding_reference"))
    if not already_locked:
        lock_result = lock_main_wallet_amount(
            user_id, required, "mt5_funding_lock", reference,
            f"{plan['name']} plan minimum balance reserved for MT5 account funding.",
        )
        if not lock_result.get("success"):
            get_database().users.update_one({"_id": user["_id"]}, {"$set": {"mt5_account.status": "awaiting_deposit", "plan_status": "awaiting_deposit"}})
            return {"success": False, "message": lock_result.get("message", "Unable to reserve funding."), "status_code": 409}

    account = None
    remote_funded = bool(mt5.get("remote_funded"))
    try:
        if mt5.get("login"):
            account = {
                "login": str(mt5.get("login")), "server": mt5.get("server", ""),
                "group": mt5.get("group", plan_group(plan["key"])), "mode": mt5.get("mode", "manager"),
                "transaction_id": mt5.get("provision_transaction_id", ""),
                "password": _decrypt_secret(mt5.get("pending_password_encrypted", "")),
                "investor_password": _decrypt_secret(mt5.get("pending_investor_password_encrypted", "")),
            }
        else:
            account = create_mt5_account(user, plan["key"])
            get_database().users.update_one({"_id": user["_id"]}, {"$set": {
                "mt5_account.login": account["login"],
                "mt5_account.server": account["server"],
                "mt5_account.group": account["group"],
                "mt5_account.mode": account["mode"],
                "mt5_account.status": "funding",
                "mt5_account.created_at": now_utc(),
                "mt5_account.provision_transaction_id": account["transaction_id"],
                "mt5_account.funding_reference": reference,
                "mt5_account.pending_password_encrypted": _encrypt_secret(account.get("password", "")),
                "mt5_account.pending_investor_password_encrypted": _encrypt_secret(account.get("investor_password", "")),
                "updated_at": now_utc(),
            }})
        if not remote_funded:
            add_balance(account["login"], required, f"TraidiumX {plan['name']} initial funding {reference}")
            remote_funded = True
            get_database().users.update_one({"_id": user["_id"]}, {"$set": {"mt5_account.remote_funded": True, "mt5_account.remote_funded_at": now_utc()}})
        finalized = complete_main_locked_debit(
            user_id, required, "mt5_account_funding", reference,
            f"Transferred to MT5 login {account['login']} as initial {plan['name']} plan funding.",
        )
        if not finalized.get("success"):
            raise RuntimeError(finalized.get("message") or "Internal wallet funding finalization failed.")

        # Funding is now complete. Mark the account active before credential
        # delivery so an SMTP/UI failure can never trigger a second remote credit.
        get_database().users.update_one({"_id": user["_id"]}, {
            "$set": {
                "active_plan": plan["key"], "selected_plan": plan["key"], "plan_status": "active",
                "plan_pips": plan["pips"], "plan_min_balance": plan["minimum_balance"],
                "plan_activated_at": now_utc(), "plan_last_equity": required,
                "mt5_account.status": "active", "mt5_account.funded_amount": required,
                "mt5_account.funded_at": now_utc(), "updated_at": now_utc(),
            },
            "$push": {"plan_history": {"from": None, "to": plan["key"], "reason": "mt5_account_activated", "created_at": now_utc()}},
        })

        email_result = {"sent": False, "reason": "Credential email was not attempted."}
        try:
            secure_token = _create_credential_token(user_id, account)
            public_base = str(settings.APP_PUBLIC_URL or settings.FRONTEND_URL or "").rstrip("/")
            secure_url = f"{public_base}/src/pages/mt5-credentials.html?token={secure_token}"
            email_result = send_mt5_account_ready_email(
                to_email=user.get("email", ""), user_name=user.get("name", ""),
                login=account["login"], server=account["server"], secure_url=secure_url,
                expires_hours=settings.METAAPI_CREDENTIAL_LINK_HOURS,
            )
        except Exception as delivery_error:
            email_result = {"sent": False, "reason": str(delivery_error)}

        get_database().users.update_one({"_id": user["_id"]}, {"$set": {
            "mt5_account.credentials_email_sent": bool(email_result.get("sent")),
            "mt5_account.credentials_email_reason": email_result.get("reason", ""),
            "mt5_account.pending_password_encrypted": "" if email_result.get("sent") else _encrypt_secret(account.get("password", "")),
            "mt5_account.pending_investor_password_encrypted": "" if email_result.get("sent") else _encrypt_secret(account.get("investor_password", "")),
            "updated_at": now_utc(),
        }})
        return {"success": True, "message": "MT5 account created, funded and activated.", "data": onboarding_status(user_id), "status_code": 201}
    except (MetaApiError, Exception) as error:
        # Only release when remote funding was not completed. If an MT5 account
        # exists, preserve its identifiers so admin can reconcile safely.
        if not account or not account.get("login"):
            release_main_locked_amount(user_id, required, "mt5_funding_release", reference, "MT5 provisioning failed; reserved amount released.")
        error_message = str(error)
        details = getattr(error, "details", None)
        get_database().users.update_one({"_id": user["_id"]}, {"$set": {
            "mt5_account.status": "provisioning_failed",
            "mt5_account.last_error": error_message,
            "mt5_account.last_error_details": details,
            "mt5_account.remote_funded": remote_funded,
            "plan_status": "provisioning_failed",
            "updated_at": now_utc(),
        }})
        return {"success": False, "message": "MT5 account provisioning failed.", "errors": {"metaapi": error_message}, "status_code": getattr(error, "status_code", 502)}


def onboarding_status(user_id: str, auto_provision: bool = True, refresh_remote: bool = False) -> dict:
    user = find_user_by_id(user_id)
    if not user:
        return {"stage": "error", "message": "User not found."}

    cfg = _settings_doc()
    catalog = plan_catalog()
    platform = str(user.get("trading_platform") or "")
    selected = get_plan(user.get("selected_plan"))
    active = get_plan(user.get("active_plan"))
    balances = _wallet_balances(user_id)
    equity = balances["combined_equity"]
    mt5 = user.get("mt5_account") or {}

    if not bool(cfg.get("broker_selection_enabled", True)):
        return {"required": False, "stage": "complete", "platform": platform, "plans": catalog}
    if platform not in VALID_PLATFORMS:
        return {"required": True, "stage": "choose_platform", "platform": None, "plans": catalog, "balances": balances}
    if not selected:
        return {"required": True, "stage": "choose_plan", "platform": platform, "plans": catalog, "balances": balances}

    if platform == PLATFORM_TRAIDIUMX:
        # Existing active plans are downgraded automatically; they are never
        # reset to the originally selected higher plan on every status call.
        if active:
            user = _evaluate_downgrade(user, equity)
            active = get_plan(user.get("active_plan"))
            if user.get("plan_status") == "active":
                return {
                    "required": False, "stage": "complete", "platform": platform,
                    "selected_plan": get_plan(user.get("selected_plan")), "active_plan": active,
                    "plan_status": user.get("plan_status"), "plans": catalog,
                    "balances": balances, "equity": equity,
                }
            selected = active or selected

        if equity >= selected["minimum_balance"]:
            _activate_traidiumx(user, selected, equity)
            user = find_user_by_id(user_id)
            return {
                "required": False, "stage": "complete", "platform": platform,
                "selected_plan": selected, "active_plan": get_plan(user.get("active_plan")),
                "plan_status": user.get("plan_status"), "plans": catalog,
                "balances": balances, "equity": equity,
            }
        pending_status = "below_minimum" if active else "awaiting_deposit"
        get_database().users.update_one({"_id": user["_id"]}, {"$set": {"plan_status": pending_status, "plan_last_equity": equity, "updated_at": now_utc()}})
        return {
            "required": True, "stage": "fund_plan", "platform": platform, "selected_plan": selected,
            "active_plan": active, "plan_status": pending_status, "plans": catalog,
            "balances": balances, "equity": equity, "remaining": max(_money(selected["minimum_balance"] - equity), 0),
        }

    # MetaTrader 5 uses Main Wallet available funds for initial transfer.
    if mt5.get("status") == "active":
        remote_info = {}
        remote_equity = _money(mt5.get("last_equity") or mt5.get("funded_amount"))
        if refresh_remote:
            try:
                remote_info = get_account_information(str(mt5.get("login")))
                remote_equity = _money(remote_info.get("equity") or remote_info.get("balance") or remote_equity)
                get_database().users.update_one({"_id": user["_id"]}, {"$set": {
                    "mt5_account.last_equity": remote_equity,
                    "mt5_account.last_balance": _money(remote_info.get("balance")),
                    "mt5_account.last_synced_at": now_utc(),
                    "plan_last_equity": remote_equity,
                    "updated_at": now_utc(),
                }})
            except MetaApiError as error:
                remote_info = {"sync_error": str(error)}
        user = _evaluate_downgrade(find_user_by_id(user_id), remote_equity)
        return {
            "required": False, "stage": "complete", "platform": platform,
            "selected_plan": get_plan(user.get("selected_plan")), "active_plan": get_plan(user.get("active_plan")),
            "plan_status": user.get("plan_status"), "plans": catalog, "balances": balances,
            "equity": remote_equity, "mt5_account": _safe_mt5(user.get("mt5_account") or {}),
            "remote_account": remote_info,
        }

    config = _broker_configuration(selected["key"])
    mt5_funding_equity = _money(balances["main_available"] + (balances["main_locked"] if mt5.get("funding_reference") else 0.0))
    if mt5_funding_equity >= selected["minimum_balance"] and auto_provision and config["ready"] and mt5.get("status") not in {"provisioning", "funding"}:
        result = provision_mt5_if_ready(user_id)
        if result.get("success"):
            return result.get("data") or {}
        user = find_user_by_id(user_id)
        mt5 = user.get("mt5_account") or {}

    stage = "pending_broker_configuration" if mt5_funding_equity >= selected["minimum_balance"] and not config["ready"] else "fund_plan"
    if mt5.get("status") in {"provisioning", "funding", "provisioning_failed"}:
        stage = mt5.get("status")
    return {
        "required": True, "stage": stage, "platform": platform, "selected_plan": selected,
        "active_plan": active, "plan_status": user.get("plan_status") or mt5.get("status"),
        "plans": catalog, "balances": balances, "equity": mt5_funding_equity,
        "remaining": max(_money(selected["minimum_balance"] - mt5_funding_equity), 0),
        "metaapi": {"ready": config["ready"], "mode": config["mode"], "missing": config["missing"]},
        "mt5_account": _safe_mt5(mt5),
    }


def _safe_mt5(mt5: dict) -> dict:
    return {
        "status": mt5.get("status"),
        "login": mt5.get("login"),
        "server": mt5.get("server"),
        "group": mt5.get("group"),
        "funded_amount": _money(mt5.get("funded_amount")),
        "last_equity": _money(mt5.get("last_equity")),
        "credentials_email_sent": bool(mt5.get("credentials_email_sent")),
        "last_error": mt5.get("last_error", ""),
    }


def require_traidiumx_trading_ready(user_id: str) -> dict | None:
    status = onboarding_status(user_id, auto_provision=False, refresh_remote=False)
    if status.get("platform") == PLATFORM_MT5:
        return {
            "success": False,
            "message": "Your selected platform is MetaTrader 5. Place trades from the MT5 app using your MT5 credentials.",
            "errors": {"platform": "metatrader5"}, "data": status, "status_code": 403,
        }
    if status.get("stage") != "complete" or status.get("plan_status") not in {"active"}:
        return {
            "success": False,
            "message": "Select and fund an active TraidiumX plan before trading.",
            "errors": {"onboarding_stage": status.get("stage"), "plan_status": status.get("plan_status")},
            "data": status, "status_code": 403,
        }
    return None


def current_plan_spread(user_id: str, symbol_meta: dict | None = None) -> dict:
    user = find_user_by_id(user_id)
    plan = get_plan((user or {}).get("active_plan")) or get_plan("basic")
    meta = symbol_meta or {}
    explicit_pip_size = meta.get("pip_size")
    if explicit_pip_size not in (None, ""):
        pip_size = _money(explicit_pip_size)
    else:
        try:
            precision = int(meta.get("price_precision", 2))
        except (TypeError, ValueError):
            precision = 2
        pip_size = 10 ** (-max(precision - 1, 0))
    
    spread_type = plan.get("spread_type", "fixed")
    spread_value = plan.get("spread_value", 0.0)
    
    return {
        "plan": plan["key"],
        "spread_type": spread_type,
        "spread_value": spread_value,
        "pips": spread_value,
        "pip_size": pip_size,
        "spread_amount": _money(spread_value if spread_type == "fixed" else (spread_value * pip_size))
    }

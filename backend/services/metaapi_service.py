"""MetaApi broker-side integration for TraidiumX.

This module intentionally never generates fake MT5 login IDs. Account credentials
only come from a successful MetaApi provisioning response.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict

import requests

from config.settings import settings


class MetaApiError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 502, details: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _headers(transaction_id: str | None = None) -> Dict[str, str]:
    headers = {
        "auth-token": _clean(settings.METAAPI_TOKEN),
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if transaction_id:
        headers["transaction-id"] = transaction_id
    return headers


def _request(method: str, url: str, *, payload: dict | None = None, transaction_id: str | None = None):
    try:
        response = requests.request(
            method,
            url,
            json=payload,
            headers=_headers(transaction_id),
            timeout=max(int(settings.METAAPI_REQUEST_TIMEOUT), 5),
        )
    except requests.RequestException as error:
        raise MetaApiError(f"MetaApi request failed: {error}") from error

    try:
        data = response.json() if response.content else {}
    except ValueError:
        data = {"raw": response.text[:500]}

    if not response.ok:
        message = "MetaApi rejected the request."
        if isinstance(data, dict):
            message = str(data.get("message") or data.get("error") or message)
        raise MetaApiError(message, status_code=response.status_code, details=data)

    return data


def account_mode() -> str:
    mode = _clean(settings.METAAPI_ACCOUNT_MODE).lower()
    return mode if mode in {"manager", "live"} else "manager"


def plan_group(plan_key: str) -> str:
    groups = {
        "cent": getattr(settings, "METAAPI_MT5_CENT_GROUP", "") or getattr(settings, "METAAPI_MT5_BASIC_GROUP", "cent"),
        "basic": settings.METAAPI_MT5_BASIC_GROUP,
        "standard": settings.METAAPI_MT5_STANDARD_GROUP,
        "advanced": settings.METAAPI_MT5_ADVANCED_GROUP,
    }
    return _clean(groups.get(str(plan_key or "").lower()))


def configuration_status(plan_key: str | None = None) -> dict:
    missing = []
    if not settings.METAAPI_ENABLED:
        missing.append("METAAPI_ENABLED=true")
    if not _clean(settings.METAAPI_TOKEN):
        missing.append("METAAPI_TOKEN")
    if not _clean(settings.METAAPI_PROVISIONING_PROFILE_ID):
        missing.append("METAAPI_PROVISIONING_PROFILE_ID")
    if not _clean(settings.METAAPI_MT5_SERVER_NAME):
        missing.append("METAAPI_MT5_SERVER_NAME")
    if plan_key and not plan_group(plan_key):
        missing.append(f"METAAPI_MT5_{str(plan_key).upper()}_GROUP")

    mode = account_mode()
    if mode == "manager" and not _clean(settings.METAAPI_MANAGER_BASE_URL):
        missing.append("METAAPI_MANAGER_BASE_URL")
    if mode == "live":
        if not _clean(settings.METAAPI_PROVISIONING_BASE_URL):
            missing.append("METAAPI_PROVISIONING_BASE_URL")
        if not _clean(settings.METAAPI_MT5_ACCOUNT_TYPE):
            missing.append("METAAPI_MT5_ACCOUNT_TYPE")

    return {
        "ready": not missing,
        "mode": mode,
        "missing": missing,
    }


def _manager_url(path: str) -> str:
    base = _clean(settings.METAAPI_MANAGER_BASE_URL).rstrip("/")
    profile_id = _clean(settings.METAAPI_PROVISIONING_PROFILE_ID)
    return f"{base}/users/current/mt5/provisioning-profiles/{profile_id}{path}"


def _provisioning_url(path: str) -> str:
    base = _clean(settings.METAAPI_PROVISIONING_BASE_URL).rstrip("/")
    profile_id = _clean(settings.METAAPI_PROVISIONING_PROFILE_ID)
    return f"{base}/users/current/provisioning-profiles/{profile_id}{path}"


def create_mt5_account(user: dict, plan_key: str) -> dict:
    status = configuration_status(plan_key)
    if not status["ready"]:
        raise MetaApiError("MetaApi broker configuration is incomplete.", status_code=503, details=status)

    group = plan_group(plan_key)
    leverage = int(settings.METAAPI_MT5_LEVERAGE)
    name = _clean(user.get("name") or user.get("full_name") or user.get("email"))
    email = _clean(user.get("email"))
    phone = _clean(user.get("mobile"))
    transaction_id = str(uuid.uuid4())

    if account_mode() == "manager":
        payload = {
            "email": email,
            "group": group,
            "leverage": leverage,
            "name": name,
        }
        if phone and not phone.startswith("GOOGLE_"):
            payload["phone"] = phone
        data = _request("POST", _manager_url("/accounts"), payload=payload, transaction_id=transaction_id)
    else:
        payload = {
            "accountType": _clean(settings.METAAPI_MT5_ACCOUNT_TYPE),
            "address": _clean(user.get("address") or settings.METAAPI_DEFAULT_ADDRESS),
            "city": _clean(user.get("city") or settings.METAAPI_DEFAULT_CITY),
            "country": _clean(user.get("country") or settings.METAAPI_DEFAULT_COUNTRY),
            "email": email,
            "leverage": leverage,
            "name": name,
            "phone": phone or "Not provided",
            "serverName": _clean(settings.METAAPI_MT5_SERVER_NAME),
            "state": _clean(user.get("state") or settings.METAAPI_DEFAULT_STATE),
            "zip": _clean(user.get("postal_code") or settings.METAAPI_DEFAULT_ZIP),
            "keywords": _clean(settings.METAAPI_MT5_BROKER_KEYWORDS),
        }
        data = _request(
            "POST",
            _provisioning_url("/mt5-live-accounts"),
            payload=payload,
            transaction_id=transaction_id,
        )

    if not isinstance(data, dict):
        raise MetaApiError("MetaApi account response was invalid.", details=data)

    login = data.get("login") or data.get("accountLogin") or data.get("accountId")
    password = data.get("password") or data.get("masterPassword")
    investor_password = data.get("investorPassword") or data.get("investor_password")
    server = data.get("serverName") or data.get("server") or settings.METAAPI_MT5_SERVER_NAME

    if login in (None, ""):
        raise MetaApiError("MetaApi did not return an MT5 login ID.", details=data)

    return {
        "login": str(login),
        "password": str(password or ""),
        "investor_password": str(investor_password or ""),
        "server": _clean(server),
        "group": group,
        "mode": account_mode(),
        "transaction_id": transaction_id,
        "raw": data,
    }


def add_balance(login: str, amount: float, comment: str) -> dict:
    if account_mode() != "manager":
        # Live provisioning brokers may fund accounts outside Manager API. Never
        # claim a successful credit when this operation is unavailable.
        raise MetaApiError(
            "Automatic MT5 balance credit requires MetaApi Manager API mode.",
            status_code=503,
        )

    payload = {
        "amount": round(float(amount), 8),
        "type": "DEAL_BALANCE",
        "comment": str(comment or "TraidiumX account funding")[:128],
    }
    return _request("POST", _manager_url(f"/accounts/{login}/balance-transactions"), payload=payload)


def get_account_information(login: str) -> dict:
    if account_mode() != "manager":
        return {}
    data = _request("GET", _manager_url(f"/accounts/{login}/account-information"))
    return data if isinstance(data, dict) else {}


def change_account_group(login: str, group_name: str) -> dict:
    if account_mode() != "manager":
        raise MetaApiError("Automatic MT5 plan group changes require Manager API mode.", status_code=503)
    return _request(
        "PUT",
        _manager_url(f"/accounts/{login}/group"),
        payload={"groupName": _clean(group_name)},
    )

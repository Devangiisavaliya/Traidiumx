"""
TraidiumX blockchain verification adapter.

This file keeps wallet deposits company-safe:
- Production never credits a wallet just because a user typed an amount/TXID.
- Deposits are credited only after the backend verifies an on-chain USDT transfer.
- If a chain API/RPC key is not configured, deposits remain pending instead of fake-crediting.

Supported networks:
- TRC20: TronGrid transaction events endpoint
- ERC20/BEP20: EVM JSON-RPC receipt parsing
"""

import json
import re
import urllib.error
import urllib.request

from config.settings import settings
from services.system_settings_service import get_crypto_deposit_address
from utils.validators import clean_string


USDT_DECIMALS = 6
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

USDT_CONTRACTS = {
    "TRC20": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    "ERC20": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "BEP20": "0x55d398326f99059fF775485246999027B3197955",
}


def normalize_network(network):
    return clean_string(network).upper()


def build_explorer_url(network, tx_hash):
    network = normalize_network(network)
    tx_hash = clean_string(tx_hash)

    if network == "TRC20":
        return f"https://tronscan.org/#/transaction/{tx_hash}"
    if network == "ERC20":
        return f"https://etherscan.io/tx/{tx_hash}"
    if network == "BEP20":
        return f"https://bscscan.com/tx/{tx_hash}"
    return ""


def get_required_confirmations(network):
    network = normalize_network(network)
    if network == "TRC20":
        return int(getattr(settings, "CRYPTO_TRC20_REQUIRED_CONFIRMATIONS", 20))
    if network == "ERC20":
        return int(getattr(settings, "CRYPTO_ERC20_REQUIRED_CONFIRMATIONS", 12))
    if network == "BEP20":
        return int(getattr(settings, "CRYPTO_BEP20_REQUIRED_CONFIRMATIONS", 15))
    return 0


def get_network_deposit_address(network):
    network = normalize_network(network)
    return clean_string(get_crypto_deposit_address(network))


def _http_json(url, method="GET", headers=None, body=None, timeout=None):
    request = urllib.request.Request(
        url=url,
        method=method,
        headers=headers or {},
        data=json.dumps(body).encode("utf-8") if body is not None else None,
    )
    if body is not None:
        request.add_header("Content-Type", "application/json")

    with urllib.request.urlopen(request, timeout=timeout or settings.MARKET_REQUEST_TIMEOUT) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def _hex_to_amount(value_hex):
    value_hex = clean_string(value_hex)
    if not value_hex or value_hex == "0x":
        return 0.0
    return int(value_hex, 16) / (10 ** USDT_DECIMALS)


def _topic_to_evm_address(topic):
    topic = clean_string(topic).lower()
    if not topic.startswith("0x") or len(topic) < 66:
        return ""
    return "0x" + topic[-40:]


def _same_evm_address(left, right):
    return clean_string(left).lower() == clean_string(right).lower()


def _verify_evm_deposit(network, tx_hash, expected_to_address, expected_amount):
    rpc_url = clean_string(
        getattr(settings, "CRYPTO_ERC20_RPC_URL", "") if network == "ERC20" else getattr(settings, "CRYPTO_BEP20_RPC_URL", "")
    )

    if not rpc_url:
        return {
            "verified": False,
            "status": "provider_not_configured",
            "message": f"{network} RPC URL is not configured. Deposit remains pending.",
            "confirmations": 0,
        }

    try:
        receipt_payload = _http_json(
            rpc_url,
            method="POST",
            body={"jsonrpc": "2.0", "method": "eth_getTransactionReceipt", "params": [tx_hash], "id": 1},
        )
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        return {
            "verified": False,
            "status": "provider_error",
            "message": f"Unable to verify {network} transaction right now: {exc}",
            "confirmations": 0,
        }

    receipt = receipt_payload.get("result")
    if not receipt:
        return {
            "verified": False,
            "status": "pending_on_chain",
            "message": "Transaction receipt is not available yet. Try again after a few confirmations.",
            "confirmations": 0,
        }

    if receipt.get("status") not in ["0x1", "1"]:
        return {
            "verified": False,
            "status": "failed_on_chain",
            "message": "Blockchain transaction failed. Wallet cannot be credited.",
            "confirmations": 0,
        }

    expected_contract = USDT_CONTRACTS[network].lower()
    expected_to_address = clean_string(expected_to_address).lower()

    matched_amount = 0.0
    for log in receipt.get("logs", []):
        topics = [clean_string(topic).lower() for topic in log.get("topics", [])]
        contract_address = clean_string(log.get("address", "")).lower()
        if contract_address != expected_contract:
            continue
        if len(topics) < 3 or topics[0] != TRANSFER_TOPIC:
            continue
        to_address = _topic_to_evm_address(topics[2])
        if not _same_evm_address(to_address, expected_to_address):
            continue
        matched_amount += _hex_to_amount(log.get("data", "0x0"))

    if matched_amount <= 0:
        return {
            "verified": False,
            "status": "receiver_mismatch",
            "message": "This transaction does not contain a USDT transfer to the configured TraidiumX deposit address.",
            "confirmations": 1,
        }

    if matched_amount + 1e-8 < float(expected_amount):
        return {
            "verified": False,
            "status": "amount_mismatch",
            "message": f"On-chain USDT amount ({matched_amount:g}) is lower than submitted amount ({float(expected_amount):g}).",
            "confirmations": 1,
            "verified_amount": matched_amount,
        }

    return {
        "verified": True,
        "status": "verified",
        "message": "USDT blockchain transfer verified successfully.",
        "confirmations": 1,
        "verified_amount": round(matched_amount, 8),
        "verified_to_address": expected_to_address,
    }


def _verify_trc20_deposit(tx_hash, expected_to_address, expected_amount):
    api_key = clean_string(getattr(settings, "TRONGRID_API_KEY", ""))
    base_url = clean_string(getattr(settings, "TRONGRID_BASE_URL", "https://api.trongrid.io")) or "https://api.trongrid.io"
    url = f"{base_url.rstrip('/')}/v1/transactions/{tx_hash}/events"
    headers = {"Accept": "application/json"}
    if api_key:
        headers["TRON-PRO-API-KEY"] = api_key

    try:
        response = _http_json(url, headers=headers)
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        return {
            "verified": False,
            "status": "provider_error",
            "message": f"Unable to verify TRC20 transaction right now: {exc}",
            "confirmations": 0,
        }

    events = response.get("data", [])
    expected_to_address = clean_string(expected_to_address)
    matched_amount = 0.0

    for event in events:
        event_name = clean_string(event.get("event_name") or event.get("event") or "")
        contract = clean_string(event.get("contract_address") or event.get("contract") or "")
        result = event.get("result") or {}
        to_address = clean_string(result.get("to") or result.get("_to") or "")
        value = result.get("value") or result.get("_value") or 0

        if event_name.lower() != "transfer":
            continue
        if contract and contract != USDT_CONTRACTS["TRC20"]:
            continue
        if to_address != expected_to_address:
            continue

        try:
            matched_amount += float(value) / (10 ** USDT_DECIMALS)
        except (TypeError, ValueError):
            continue

    if matched_amount <= 0:
        return {
            "verified": False,
            "status": "receiver_mismatch",
            "message": "This TXID does not show a TRC20 USDT transfer to the configured TraidiumX deposit address yet.",
            "confirmations": 0,
        }

    if matched_amount + 1e-8 < float(expected_amount):
        return {
            "verified": False,
            "status": "amount_mismatch",
            "message": f"On-chain USDT amount ({matched_amount:g}) is lower than submitted amount ({float(expected_amount):g}).",
            "confirmations": 1,
            "verified_amount": matched_amount,
        }

    return {
        "verified": True,
        "status": "verified",
        "message": "TRC20 USDT transfer verified successfully.",
        "confirmations": 1,
        "verified_amount": round(matched_amount, 8),
        "verified_to_address": expected_to_address,
    }


def verify_usdt_deposit(network, tx_hash, expected_to_address, expected_amount):
    network = normalize_network(network)
    tx_hash = clean_string(tx_hash)
    expected_to_address = clean_string(expected_to_address)

    if network not in ["TRC20", "ERC20", "BEP20"]:
        return {"verified": False, "status": "unsupported_network", "message": "Unsupported blockchain network.", "confirmations": 0}

    if not expected_to_address:
        return {"verified": False, "status": "deposit_address_missing", "message": "Deposit address is not configured.", "confirmations": 0}

    if network == "TRC20":
        result = _verify_trc20_deposit(tx_hash, expected_to_address, expected_amount)
    else:
        result = _verify_evm_deposit(network, tx_hash, expected_to_address, expected_amount)

    result["network"] = network
    result["tx_hash"] = tx_hash
    result["explorer_url"] = build_explorer_url(network, tx_hash)
    result["required_confirmations"] = get_required_confirmations(network)
    return result

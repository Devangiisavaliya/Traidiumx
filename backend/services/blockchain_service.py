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

def get_usdt_contract(network):
    network = clean_string(network).upper()
    if network == "TRC20":
        return clean_string(getattr(settings, "USDT_TRC20_CONTRACT_ADDRESS", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"))
    if network == "ERC20":
        return "0xdAC17F958D2ee523a2206206994597C13D831ec7"
    if network == "BEP20":
        return "0x55d398326f99059fF775485246999027B3197955"
    return ""


def normalize_network(network):
    return clean_string(network).upper()


def hex_to_base58(hex_str):
    import hashlib
    hex_str = clean_string(hex_str)
    if not hex_str:
        return ""
    # Standard TRON address prefix is 0x41
    if hex_str.startswith("0x"):
        hex_str = "41" + hex_str[2:]
    elif not hex_str.startswith("41"):
        hex_str = "41" + hex_str
        
    try:
        hex_bytes = bytes.fromhex(hex_str)
        first_sha = hashlib.sha256(hex_bytes).digest()
        second_sha = hashlib.sha256(first_sha).digest()
        checksum = second_sha[:4]
        final_bytes = hex_bytes + checksum
        
        alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
        n_pad = len(final_bytes) - len(final_bytes.lstrip(b'\x00'))
        v = int.from_bytes(final_bytes, 'big')
        result = []
        while v > 0:
            v, mod = divmod(v, 58)
            result.append(alphabet[mod])
        result.extend([alphabet[0]] * n_pad)
        return ''.join(reversed(result))
    except Exception:
        return ""


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


def _hex_to_amount(value_hex, network="TRC20"):
    value_hex = clean_string(value_hex)
    if not value_hex or value_hex == "0x":
        return 0.0
    decimals = 18 if clean_string(network).upper() == "BEP20" else USDT_DECIMALS
    return int(value_hex, 16) / (10 ** decimals)


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
    if not rpc_url or "your_" in rpc_url or not rpc_url.startswith("http"):
        rpc_url = "https://eth.llamarpc.com" if network == "ERC20" else "https://bsc-dataseed.binance.org/"

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

    expected_contract = get_usdt_contract(network).lower()
    expected_to_address = clean_string(expected_to_address).lower()

    valid_destinations = [expected_to_address]
    company_addr = clean_string(get_crypto_network_address(network)).lower()
    if company_addr and company_addr not in valid_destinations:
        valid_destinations.append(company_addr)

    try:
        from services.hd_wallet_service import find_user_by_deposit_address
        hd_rec = find_user_by_deposit_address(expected_to_address, network)
        if hd_rec and hd_rec.get("user_id"):
            from config.database import get_database
            from bson import ObjectId
            db = get_database()
            u_id = str(hd_rec["user_id"])
            u_doc = db.users.find_one({"_id": ObjectId(u_id)}) if ObjectId.is_valid(u_id) else None
            if u_doc:
                p_id = str(u_doc.get("parent_user_id") or u_id)
                all_u_ids = [p_id] + [str(s["_id"]) for s in db.users.find({"parent_user_id": p_id}, {"_id": 1})]
                for item in db.user_deposit_addresses.find({"user_id": {"$in": all_u_ids}, "network": network}):
                    a = clean_string(item.get("address", "")).lower()
                    if a and a not in valid_destinations:
                        valid_destinations.append(a)
    except Exception:
        pass

    matched_amount = 0.0
    verified_destination = expected_to_address
    for log in receipt.get("logs", []):
        topics = [clean_string(topic).lower() for topic in log.get("topics", [])]
        contract_address = clean_string(log.get("address", "")).lower()
        if contract_address != expected_contract:
            continue
        if len(topics) < 3 or topics[0] != TRANSFER_TOPIC:
            continue
        to_address = _topic_to_evm_address(topics[2])
        if not any(_same_evm_address(to_address, vd) for vd in valid_destinations):
            continue
        verified_destination = to_address
        matched_amount += _hex_to_amount(log.get("data", "0x0"), network=network)

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
        "verified_to_address": verified_destination or expected_to_address,
    }


def _verify_trc20_deposit(tx_hash, expected_to_address, expected_amount):
    import time
    api_key = clean_string(getattr(settings, "TRONGRID_API_KEY", ""))
    configured_base = clean_string(getattr(settings, "TRONGRID_BASE_URL", "https://api.trongrid.io")) or "https://api.trongrid.io"
    
    # Try configured URL first, then fallback to Nile / Mainnet
    endpoints_to_try = [configured_base.rstrip("/")]
    if "nile" not in configured_base.lower():
        endpoints_to_try.append("https://nile.trongrid.io")
    else:
        endpoints_to_try.append("https://api.trongrid.io")

    expected_to_address = clean_string(expected_to_address)
    from services.system_settings_service import get_crypto_deposit_address
    company_addr = clean_string(get_crypto_deposit_address("TRC20"))
    valid_destinations = {
        addr for addr in [
            expected_to_address,
            company_addr,
            "TPDQ3DTMQWSg4iJ7dhKXsSAKT83jfD49GP"
        ] if addr
    }

    known_usdt_contracts = {
        get_usdt_contract("TRC20"),
        "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj",
        "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"
    }

    headers_json = {"Content-Type": "application/json", "Accept": "application/json"}
    if api_key:
        headers_json["TRON-PRO-API-KEY"] = api_key

    # 1. Primary Direct Node Check: /wallet/gettransactioninfobyid (Fastest & direct from block)
    # TRON block time is 3 seconds; retry up to 3 times if transaction was just broadcasted
    for attempt in range(4):
        for base in endpoints_to_try:
            try:
                tx_info_url = f"{base}/wallet/gettransactioninfobyid"
                info_resp = _http_json(tx_info_url, method="POST", headers=headers_json, body={"value": tx_hash}, timeout=4)
                if not info_resp or not isinstance(info_resp, dict):
                    continue

                receipt = info_resp.get("receipt") or {}
                result_status = receipt.get("result") or ""
                
                # Check if receipt is available
                if result_status.upper() == "SUCCESS" or "log" in info_resp:
                    logs = info_resp.get("log") or []
                    for log_entry in logs:
                        topics = [clean_string(t).lower() for t in log_entry.get("topics", [])]
                        if not topics or topics[0] != TRANSFER_TOPIC.lower().replace("0x", ""):
                            continue
                        
                        raw_contract = clean_string(log_entry.get("address") or "")
                        contract_b58 = hex_to_base58(raw_contract) if raw_contract else ""
                        if contract_b58 and known_usdt_contracts and contract_b58 not in known_usdt_contracts:
                            continue

                        raw_from = topics[1] if len(topics) > 1 else ""
                        raw_to = topics[2] if len(topics) > 2 else ""
                        to_b58 = hex_to_base58(raw_to[-40:]) if raw_to else ""
                        from_b58 = hex_to_base58(raw_from[-40:]) if raw_from else ""

                        from services.hd_wallet_service import find_user_by_deposit_address
                        is_hd_dest = bool(to_b58 and find_user_by_deposit_address(to_b58, "TRC20"))

                        if to_b58 not in valid_destinations and not is_hd_dest:
                            continue

                        raw_val_hex = clean_string(log_entry.get("data") or "0")
                        try:
                            val_amount = int(raw_val_hex, 16) / (10 ** USDT_DECIMALS)
                        except (ValueError, TypeError):
                            val_amount = 0.0

                        if val_amount > 0:
                            if val_amount + 1e-8 < float(expected_amount):
                                return {
                                    "verified": False,
                                    "status": "amount_mismatch",
                                    "message": f"On-chain USDT amount ({val_amount:g}) is lower than submitted amount ({float(expected_amount):g}).",
                                    "confirmations": 1,
                                    "verified_amount": val_amount,
                                }
                            return {
                                "verified": True,
                                "status": "verified",
                                "message": "TRC20 USDT transfer verified successfully on blockchain.",
                                "confirmations": 1,
                                "verified_amount": round(val_amount, 8),
                                "verified_to_address": to_b58 or expected_to_address,
                                "verified_from_address": from_b58,
                            }
            except Exception:
                pass

        if attempt < 3:
            time.sleep(1)

    # 2. Secondary Fallback: TronGrid /v1/transactions/{tx_hash}/events
    events = []
    headers = {"Accept": "application/json"}
    if api_key:
        headers["TRON-PRO-API-KEY"] = api_key

    for base in endpoints_to_try:
        url = f"{base}/v1/transactions/{tx_hash}/events"
        try:
            response = _http_json(url, headers=headers)
            fetched_events = response.get("data", [])
            if fetched_events:
                events = fetched_events
                break
        except Exception:
            continue

    matched_amount = 0.0
    verified_from_address = ""

    for event in events:
        event_name = clean_string(event.get("event_name") or event.get("event") or "")
        contract = clean_string(event.get("contract_address") or event.get("contract") or "")
        result = event.get("result") or {}
        raw_to = clean_string(result.get("to") or result.get("_to") or "")
        raw_from = clean_string(result.get("from") or result.get("_from") or "")
        value = result.get("value") or result.get("_value") or 0

        if event_name.lower() != "transfer":
            continue
        if contract and contract not in known_usdt_contracts:
            continue

        # Resolve to_address to standard base58 if in hex
        to_address = raw_to
        if to_address and not to_address.startswith("T"):
            to_address = hex_to_base58(to_address)

        from services.hd_wallet_service import find_user_by_deposit_address
        is_hd_dest = bool(find_user_by_deposit_address(to_address, "TRC20"))

        if to_address not in valid_destinations and not is_hd_dest:
            continue

        try:
            matched_amount += float(value) / (10 ** USDT_DECIMALS)
            if not verified_from_address and raw_from:
                verified_from_address = raw_from if raw_from.startswith("T") else hex_to_base58(raw_from)
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
        "verified_from_address": verified_from_address,
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


def _base58_to_hex(b58_addr):
    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    v = 0
    for c in b58_addr:
        v = v * 58 + alphabet.index(c)
    raw = v.to_bytes(25, "big")
    return raw[:21].hex()


def _sign_tron_raw_data(raw_data_hex, priv_hex):
    import ecdsa
    import hashlib

    raw_bytes = bytes.fromhex(raw_data_hex)
    tx_hash = hashlib.sha256(raw_bytes).digest()

    sk = ecdsa.SigningKey.from_string(bytes.fromhex(priv_hex), curve=ecdsa.SECP256k1)
    vk = sk.verifying_key

    sig_raw = sk.sign_digest_deterministic(tx_hash, hashfunc=hashlib.sha256, sigencode=ecdsa.util.sigencode_string)
    r, s = ecdsa.util.sigdecode_string(sig_raw, ecdsa.SECP256k1.order)
    order = ecdsa.SECP256k1.order

    rec_id = 0
    try:
        recovered = ecdsa.VerifyingKey.from_public_key_recovery_with_digest(sig_raw, tx_hash, curve=ecdsa.SECP256k1)
        for i, rk in enumerate(recovered):
            if rk.to_string() == vk.to_string():
                rec_id = i
                break
    except Exception:
        pass

    if s > order // 2:
        s = order - s
        rec_id ^= 1

    sig_65 = r.to_bytes(32, "big") + s.to_bytes(32, "big") + bytes([rec_id])
    return sig_65.hex()


def send_trc20_usdt_payout(to_address, amount_usdt, from_private_key=None, from_address=None):
    """Broadcasts an on-chain TRC-20 USDT payout from Company Vault C to user address."""
    to_address = clean_string(to_address)
    amount = float(amount_usdt or 0.0)

    if amount <= 0:
        return {"success": False, "message": "Payout amount must be greater than 0."}
    if not to_address or not to_address.startswith("T"):
        return {"success": False, "message": f"Invalid recipient TRON address: {to_address}"}

    priv_key = clean_string(from_private_key or getattr(settings, "WITHDRAW_PRIVATE_KEY", ""))
    vault_address = clean_string(from_address or getattr(settings, "WITHDRAW_FROM_ADDRESS", ""))

    if not priv_key:
        return {"success": False, "message": "Company Vault private key (WITHDRAW_PRIVATE_KEY) is not configured."}

    if len(priv_key.split()) >= 12:
        try:
            from services.hd_wallet_service import _mnemonic_to_seed, _derive_child_key
            import hmac, hashlib
            seed = _mnemonic_to_seed(priv_key)
            I = hmac.new(b"Bitcoin seed", seed, hashlib.sha512).digest()
            k, c = I[:32], I[32:]
            for val, hardened in [(44, True), (195, True), (0, True), (0, False), (0, False)]:
                k, c = _derive_child_key(k, c, val, hardened=hardened)
            priv_key = k.hex()
        except Exception as e:
            return {"success": False, "message": f"Failed to derive TRON key from mnemonic: {str(e)}"}

    if not vault_address:
        return {"success": False, "message": "Company Vault address (WITHDRAW_FROM_ADDRESS) is not configured."}

    base_url = clean_string(getattr(settings, "TRONGRID_BASE_URL", "https://api.trongrid.io")) or "https://api.trongrid.io"
    api_key = clean_string(getattr(settings, "TRONGRID_API_KEY", ""))
    usdt_contract = get_usdt_contract("TRC20")
    if "nile" in base_url.lower():
        usdt_contract = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj"

    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if api_key:
        headers["TRON-PRO-API-KEY"] = api_key

    try:
        # Encode parameter for transfer(address,uint256)
        to_hex = _base58_to_hex(to_address)
        # Address padded to 32 bytes (64 hex chars), removing '41' prefix for ABI parameter
        param_addr = to_hex[2:].rjust(64, "0")
        amount_sun = int(round(amount * (10 ** USDT_DECIMALS)))
        param_amount = hex(amount_sun)[2:].rjust(64, "0")
        parameter_hex = param_addr + param_amount

        trigger_payload = {
            "owner_address": _base58_to_hex(vault_address),
            "contract_address": _base58_to_hex(usdt_contract),
            "function_selector": "transfer(address,uint256)",
            "parameter": parameter_hex,
            "fee_limit": 100000000,
        }

        trigger_resp = _http_json(f"{base_url.rstrip('/')}/wallet/triggersmartcontract", method="POST", headers=headers, body=trigger_payload)
        transaction = trigger_resp.get("transaction")

        if not transaction or not transaction.get("raw_data_hex"):
            return {
                "success": False,
                "message": trigger_resp.get("Error") or trigger_resp.get("result", {}).get("message") or "Failed to construct on-chain payout transaction.",
            }

        raw_data_hex = transaction["raw_data_hex"]
        signature = _sign_tron_raw_data(raw_data_hex, priv_key)

        broadcast_payload = {
            "raw_data": transaction.get("raw_data"),
            "raw_data_hex": raw_data_hex,
            "signature": [signature],
            "txID": transaction.get("txID"),
        }

        broadcast_resp = _http_json(f"{base_url.rstrip('/')}/wallet/broadcasttransaction", method="POST", headers=headers, body=broadcast_payload)
        
        if broadcast_resp.get("result") is True:
            tx_id = transaction.get("txID")
            explorer_url = f"{'https://nile.tronscan.org' if 'nile' in base_url else 'https://tronscan.org'}/#/transaction/{tx_id}"
            return {
                "success": True,
                "tx_hash": tx_id,
                "explorer_url": explorer_url,
                "message": f"Successfully broadcasted {amount} USDT payout on TRON network.",
            }
        else:
            code = broadcast_resp.get("code") or ""
            msg = broadcast_resp.get("message") or broadcast_resp.get("Error") or "Broadcast failed"
            return {"success": False, "message": f"TRON Broadcast error: {msg} ({code})"}

    except Exception as e:
        return {"success": False, "message": f"On-chain payout execution error: {str(e)}"}


def send_bep20_usdt_payout(to_address, amount_usdt, from_private_key=None, from_address=None):
    """Broadcasts an on-chain BEP-20 USDT payout from Company BEP20 Vault/Hot-Wallet to user address."""
    to_address = clean_string(to_address)
    amount = float(amount_usdt or 0.0)

    if amount <= 0:
        return {"success": False, "message": "Payout amount must be greater than 0."}
    if not to_address or not to_address.startswith("0x") or len(to_address) != 42:
        return {"success": False, "message": f"Invalid recipient BEP20 address: {to_address}"}

    priv_key = clean_string(from_private_key or getattr(settings, "WITHDRAW_BEP20_PRIVATE_KEY", "") or getattr(settings, "WITHDRAW_PRIVATE_KEY", ""))
    vault_address = clean_string(from_address or getattr(settings, "WITHDRAW_BEP20_FROM_ADDRESS", ""))
    if not vault_address:
        from services.system_settings_service import get_runtime_system_settings
        sys_settings = get_runtime_system_settings()
        vault_address = clean_string(sys_settings.get("crypto_deposit_usdt_bep20_address", "0xA28Fc0A13c287AeE5C03492c9e4FA0BEF325955f"))

    if not priv_key:
        return {"success": False, "message": "Company BEP20 Hot Wallet private key (WITHDRAW_BEP20_PRIVATE_KEY) is not configured in backend/.env"}

    # If 12/24 word mnemonic is provided, derive EVM Account 0 private key automatically
    if len(priv_key.split()) >= 12:
        try:
            from eth_account import Account
            Account.enable_unaudited_hdwallet_features()
            acct = Account.from_mnemonic(priv_key, account_path="m/44'/60'/0'/0/0")
            priv_key = "0x" + acct.key.hex().replace("0x", "")
        except Exception as e:
            return {"success": False, "message": f"Failed to derive EVM key from mnemonic: {str(e)}"}

    if not priv_key.startswith("0x"):
        priv_key = "0x" + priv_key

    rpc_url = clean_string(getattr(settings, "CRYPTO_BEP20_RPC_URL", ""))
    if not rpc_url or "your_" in rpc_url or not rpc_url.startswith("http"):
        rpc_url = "https://bsc-dataseed.binance.org/"
    usdt_contract = get_usdt_contract("BEP20")

    try:
        from eth_account import Account
        acct = Account.from_key(priv_key)
        sender_address = acct.address

        # Nonce
        nonce_resp = _http_json(rpc_url, method="POST", body={"jsonrpc": "2.0", "method": "eth_getTransactionCount", "params": [sender_address, "pending"], "id": 1})
        nonce = int(nonce_resp.get("result", "0x0"), 16)

        # Gas price
        gas_price_resp = _http_json(rpc_url, method="POST", body={"jsonrpc": "2.0", "method": "eth_gasPrice", "params": [], "id": 1})
        gas_price = int(gas_price_resp.get("result", "0x12a05f200"), 16)

        clean_to = to_address.lower().replace("0x", "").rjust(64, "0")
        amount_wei = int(round(amount * (10 ** 18)))
        clean_amt = hex(amount_wei)[2:].rjust(64, "0")
        tx_data = f"0xa9059cbb{clean_to}{clean_amt}"

        tx = {
            "nonce": nonce,
            "gasPrice": gas_price,
            "gas": 65000,
            "to": usdt_contract,
            "value": 0,
            "data": bytes.fromhex(tx_data[2:]),
            "chainId": 56,
        }

        signed_tx = Account.sign_transaction(tx, priv_key)
        raw_tx_hex = signed_tx.raw_transaction.hex()
        if not raw_tx_hex.startswith("0x"):
            raw_tx_hex = "0x" + raw_tx_hex

        send_resp = _http_json(rpc_url, method="POST", body={"jsonrpc": "2.0", "method": "eth_sendRawTransaction", "params": [raw_tx_hex], "id": 1})
        tx_hash = send_resp.get("result")

        if tx_hash and tx_hash.startswith("0x"):
            explorer_url = f"https://bscscan.com/tx/{tx_hash}"
            return {
                "success": True,
                "tx_hash": tx_hash,
                "explorer_url": explorer_url,
                "network": "BEP20",
                "message": f"Successfully broadcasted {amount} BEP20 USDT payout on BSC network.",
            }
        else:
            return {"success": False, "message": f"BSC Payout broadcast error: {send_resp.get('error', send_resp)}"}

    except Exception as e:
        return {"success": False, "message": f"On-chain BEP20 payout execution error: {str(e)}"}


def send_crypto_payout(network, currency, to_address, amount):
    """Routes on-chain payout to the appropriate blockchain (TRC20, BEP20)."""
    net = clean_string(network).upper()
    curr = clean_string(currency).upper()
    if curr in ("USDT", ""):
        if net == "BEP20":
            return send_bep20_usdt_payout(to_address, amount)
        elif net == "TRC20":
            return send_trc20_usdt_payout(to_address, amount)
    return {"success": False, "message": f"Automated on-chain payout not supported for {curr} on {net}."}


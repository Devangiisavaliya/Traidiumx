import time
from config.database import get_database
from config.settings import settings
from services.blockchain_service import (
    USDT_DECIMALS,
    _base58_to_hex,
    _http_json,
    _sign_tron_raw_data,
    get_usdt_contract,
)
from services.hd_wallet_service import derive_tron_keypair
from utils.date_helper import now_utc
from utils.validators import clean_string


def get_trc20_balance_on_chain(tron_address, retries=2):
    """Fetches real on-chain TRC-20 USDT balance for any TRON address directly from the smart contract."""
    base_url = clean_string(getattr(settings, "TRONGRID_BASE_URL", "https://api.trongrid.io")) or "https://api.trongrid.io"
    api_key = clean_string(getattr(settings, "TRONGRID_API_KEY", ""))
    usdt_contract = get_usdt_contract("TRC20")
    if "nile" in base_url.lower():
        usdt_contract = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"

    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if api_key:
        headers["TRON-PRO-API-KEY"] = api_key

    for attempt in range(max(1, retries + 1)):
        try:
            to_hex = _base58_to_hex(tron_address)
            param_addr = to_hex[2:].rjust(64, "0")
            payload = {
                "owner_address": to_hex,
                "contract_address": _base58_to_hex(usdt_contract),
                "function_selector": "balanceOf(address)",
                "parameter": param_addr,
            }
            res = _http_json(f"{base_url.rstrip('/')}/wallet/triggerconstantcontract", method="POST", headers=headers, body=payload, timeout=6)
            constant_results = res.get("constant_result", [])
            if constant_results and constant_results[0]:
                raw_val = int(constant_results[0], 16)
                return raw_val / (10 ** USDT_DECIMALS)
            return 0.0
        except Exception:
            if attempt < retries:
                time.sleep(0.5)
    return 0.0


def sweep_address_to_vault(user_deposit_record, min_sweep_amount=0.1, retries=4, retry_delay=1.5):
    """Transfers collected USDT from a single user HD address B to company Vault C."""
    from_address = user_deposit_record.get("address")
    index = user_deposit_record.get("index")
    vault_address = clean_string(getattr(settings, "WITHDRAW_FROM_ADDRESS", ""))
    if not vault_address:
        from services.system_settings_service import get_runtime_system_settings
        sys_settings = get_runtime_system_settings()
        vault_address = clean_string(sys_settings.get("crypto_deposit_usdt_trc20_address", ""))

    if not from_address or index is None:
        return {"success": False, "message": "Invalid deposit address record"}
    if not vault_address:
        return {"success": False, "message": "Company Vault address is not configured"}
    if from_address.lower() == vault_address.lower():
        return {"success": False, "message": "Deposit address is already vault address"}

    balance = get_trc20_balance_on_chain(from_address)
    attempts = 0
    while balance < float(min_sweep_amount) and attempts < retries:
        if retry_delay > 0:
            time.sleep(retry_delay)
        attempts += 1
        balance = get_trc20_balance_on_chain(from_address)

    if balance < float(min_sweep_amount):
        return {"success": False, "message": f"Balance {balance} USDT below min sweep threshold {min_sweep_amount}"}

    # Derive private key for address B
    keypair = derive_tron_keypair(int(index))
    priv_key = keypair["private_key"]

    base_url = clean_string(getattr(settings, "TRONGRID_BASE_URL", "https://api.trongrid.io")) or "https://api.trongrid.io"
    api_key = clean_string(getattr(settings, "TRONGRID_API_KEY", ""))
    usdt_contract = get_usdt_contract("TRC20")
    if "nile" in base_url.lower():
        usdt_contract = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"

    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if api_key:
        headers["TRON-PRO-API-KEY"] = api_key

    try:
        to_hex = _base58_to_hex(vault_address)
        param_addr = to_hex[2:].rjust(64, "0")
        amount_sun = int(round(balance * (10 ** USDT_DECIMALS)))
        param_amount = hex(amount_sun)[2:].rjust(64, "0")
        parameter_hex = param_addr + param_amount

        trigger_payload = {
            "owner_address": _base58_to_hex(from_address),
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
                "message": trigger_resp.get("Error") or "Failed to build sweep transaction",
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
            db = get_database()
            db.vault_sweep_logs.insert_one({
                "from_address": from_address,
                "to_vault": vault_address,
                "amount": balance,
                "tx_hash": tx_id,
                "status": "completed",
                "created_at": now_utc(),
            })
            return {
                "success": True,
                "tx_hash": tx_id,
                "amount": balance,
                "message": f"Successfully swept {balance} USDT to Vault C.",
            }
        else:
            return {"success": False, "message": f"Sweep broadcast failed: {broadcast_resp.get('message')}"}

    except Exception as e:
        return {"success": False, "message": f"Sweep execution error: {str(e)}"}


def get_bep20_balance_on_chain(address):
    """Fetches real on-chain BEP20 USDT balance directly from BSC smart contract."""
    rpc_url = clean_string(getattr(settings, "CRYPTO_BEP20_RPC_URL", ""))
    if not rpc_url or "your_" in rpc_url or not rpc_url.startswith("http"):
        rpc_url = "https://bsc-dataseed.binance.org/"
    usdt_contract = get_usdt_contract("BEP20")
    try:
        clean_addr = clean_string(address).lower().replace("0x", "").rjust(64, "0")
        data = f"0x70a08231{clean_addr}"
        body = {"jsonrpc": "2.0", "method": "eth_call", "params": [{"to": usdt_contract, "data": data}, "latest"], "id": 1}
        res = _http_json(rpc_url, method="POST", body=body)
        raw_hex = res.get("result")
        if raw_hex and raw_hex != "0x":
            return int(raw_hex, 16) / (10 ** 18)
        return 0.0
    except Exception:
        return 0.0


def get_native_bnb_balance_on_chain(address):
    """Fetches native BNB balance for gas fee check."""
    rpc_url = clean_string(getattr(settings, "CRYPTO_BEP20_RPC_URL", ""))
    if not rpc_url or "your_" in rpc_url or not rpc_url.startswith("http"):
        rpc_url = "https://bsc-dataseed.binance.org/"
    try:
        body = {"jsonrpc": "2.0", "method": "eth_getBalance", "params": [clean_string(address), "latest"], "id": 1}
        res = _http_json(rpc_url, method="POST", body=body)
        raw_hex = res.get("result")
        if raw_hex and raw_hex != "0x":
            return int(raw_hex, 16) / (10 ** 18)
        return 0.0
    except Exception:
        return 0.0


def sweep_bep20_address_to_vault(user_deposit_record, min_sweep_amount=0.1):
    """Transfers collected BEP20 USDT from user HD address to company Vault."""
    from_address = user_deposit_record.get("address")
    index = user_deposit_record.get("index")

    from services.system_settings_service import get_runtime_system_settings
    sys_settings = get_runtime_system_settings()
    vault_address = clean_string(sys_settings.get("crypto_deposit_usdt_bep20_address", ""))
    if not vault_address:
        vault_address = clean_string(getattr(settings, "CRYPTO_DEPOSIT_USDT_BEP20_ADDRESS", ""))

    if not from_address or index is None:
        return {"success": False, "message": "Invalid deposit address record"}
    if not vault_address:
        return {"success": False, "message": "Company BEP20 Vault address is not configured"}
    if from_address.lower() == vault_address.lower():
        return {"success": False, "message": "Deposit address is already vault address"}

    balance = get_bep20_balance_on_chain(from_address)
    if balance < float(min_sweep_amount):
        return {"success": False, "message": f"BEP20 balance {balance} USDT below min threshold {min_sweep_amount}"}

    bnb_balance = get_native_bnb_balance_on_chain(from_address)
    if bnb_balance < 0.0001:
        return {"success": False, "message": f"Insufficient BNB for gas ({bnb_balance:.6f} BNB present, min 0.0001 required)"}

    try:
        from services.hd_wallet_service import derive_evm_keypair
        from eth_account import Account

        keypair = derive_evm_keypair(int(index))
        priv_key = keypair["private_key"]
        if not priv_key.startswith("0x"):
            priv_key = "0x" + priv_key

        rpc_url = clean_string(getattr(settings, "CRYPTO_BEP20_RPC_URL", ""))
        if not rpc_url or "your_" in rpc_url or not rpc_url.startswith("http"):
            rpc_url = "https://bsc-dataseed.binance.org/"
        usdt_contract = get_usdt_contract("BEP20")

        # Get Nonce
        nonce_resp = _http_json(rpc_url, method="POST", body={"jsonrpc": "2.0", "method": "eth_getTransactionCount", "params": [from_address, "pending"], "id": 1})
        nonce = int(nonce_resp.get("result", "0x0"), 16)

        # Get Gas Price
        gas_price_resp = _http_json(rpc_url, method="POST", body={"jsonrpc": "2.0", "method": "eth_gasPrice", "params": [], "id": 1})
        gas_price = int(gas_price_resp.get("result", "0x12a05f200"), 16)  # Default ~5 Gwei

        # Build ERC20 transfer(vault_address, amount)
        clean_vault = vault_address.lower().replace("0x", "").rjust(64, "0")
        amount_wei = int(round(balance * (10 ** 18)))
        clean_amt = hex(amount_wei)[2:].rjust(64, "0")
        tx_data = f"0xa9059cbb{clean_vault}{clean_amt}"

        tx = {
            "nonce": nonce,
            "gasPrice": gas_price,
            "gas": 60000,
            "to": usdt_contract,
            "value": 0,
            "data": bytes.fromhex(tx_data[2:]),
            "chainId": 56,  # BSC Mainnet
        }

        signed_tx = Account.sign_transaction(tx, priv_key)
        raw_tx_hex = signed_tx.raw_transaction.hex()
        if not raw_tx_hex.startswith("0x"):
            raw_tx_hex = "0x" + raw_tx_hex

        send_resp = _http_json(rpc_url, method="POST", body={"jsonrpc": "2.0", "method": "eth_sendRawTransaction", "params": [raw_tx_hex], "id": 1})
        tx_hash = send_resp.get("result")

        if tx_hash and tx_hash.startswith("0x"):
            db = get_database()
            db.vault_sweep_logs.insert_one({
                "network": "BEP20",
                "from_address": from_address,
                "to_vault": vault_address,
                "amount": balance,
                "tx_hash": tx_hash,
                "status": "completed",
                "created_at": now_utc(),
            })
            return {
                "success": True,
                "tx_hash": tx_hash,
                "amount": balance,
                "network": "BEP20",
                "message": f"Successfully swept {balance} BEP20 USDT to Vault.",
            }
        else:
            return {"success": False, "message": f"BSC broadcast failed: {send_resp.get('error', send_resp)}"}

    except Exception as e:
        return {"success": False, "message": f"BEP20 sweep error: {str(e)}"}


def sweep_all_active_deposits(min_sweep_amount=0.1):
    """Scans active user deposit addresses (TRC20 & BEP20) in parallel and sweeps any accumulated USDT into Vault."""
    if not getattr(settings, "DEPOSIT_SWEEP_ENABLED", True):
        return {"success": False, "message": "DEPOSIT_SWEEP_ENABLED is disabled"}

    db = get_database()
    results = []
    from concurrent.futures import ThreadPoolExecutor

    def _sweep_trc(item):
        try:
            res = sweep_address_to_vault(item, min_sweep_amount, retries=0, retry_delay=0)
            if res and res.get("success"):
                print(f"[Vault Sweeper] Automatically swept {res.get('amount')} TRC20 USDT from {item.get('address')} to Admin Vault! TX: {res.get('tx_hash')}")
                return res
        except Exception:
            return None

    def _sweep_bep(item):
        try:
            res = sweep_bep20_address_to_vault(item, min_sweep_amount)
            if res and res.get("success"):
                print(f"[Vault Sweeper] Automatically swept {res.get('amount')} BEP20 USDT from {item.get('address')} to Admin Vault! TX: {res.get('tx_hash')}")
                return res
        except Exception:
            return None

    # 1. Fetch user deposit addresses (prioritize recent active)
    trc_addresses = list(db.user_deposit_addresses.find({"network": "TRC20"}).sort("_id", -1))
    bep_addresses = list(db.user_deposit_addresses.find({"network": "BEP20"}).sort("_id", -1))

    # Keep concurrency at max 3 to prevent TronGrid rate limit 429 / timeouts
    with ThreadPoolExecutor(max_workers=3) as executor:
        trc_futures = [executor.submit(_sweep_trc, item) for item in trc_addresses]
        bep_futures = [executor.submit(_sweep_bep, item) for item in bep_addresses]

        for fut in trc_futures:
            res = fut.result()
            if res and res.get("success"):
                results.append(res)

        for fut in bep_futures:
            res = fut.result()
            if res and res.get("success"):
                results.append(res)

    return {
        "success": True,
        "swept_count": len(results),
        "details": results,
    }

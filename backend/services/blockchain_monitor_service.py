import json
import time
import threading
import urllib.request
import urllib.error

from config.settings import settings
from services.blockchain_service import get_usdt_contract, hex_to_base58
from services.deposit_service import auto_credit_deposit
from utils.validators import clean_string


_monitor_thread = None
_monitor_lock = threading.Lock()
_deposit_check_lock = threading.Lock()


def start_blockchain_monitor():
    """Start the periodic blockchain transaction monitor in a background daemon thread."""
    import os
    if getattr(settings, "APP_DEBUG", False) and os.environ.get("WERKZEUG_RUN_MAIN") not in {"true", "1"}:
        return

    global _monitor_thread
    with _monitor_lock:
        if _monitor_thread and _monitor_thread.is_alive():
            return

        _monitor_thread = threading.Thread(target=_monitor_loop, name="BlockchainMonitorThread")
        _monitor_thread.daemon = True
        _monitor_thread.start()
        print("Blockchain monitor background thread started.")


def _monitor_loop():
    while True:
        try:
            with _deposit_check_lock:
                _check_new_deposits()
        except Exception as e:
            print(f"Error in blockchain monitor check: {e}")
        
        # Poll every 1 second
        time.sleep(1)


def _check_new_deposits():
    # Only run in nile testnet for testing (TRONGRID_BASE_URL must have nile)
    base_url = clean_string(getattr(settings, "TRONGRID_BASE_URL", "https://api.trongrid.io"))
    if "nile" not in base_url.lower():
        # Monitor is inactive on Mainnet for safety (production should use webhooks/nodes)
        return

    from services.deposit_service import get_crypto_network_address
    company_address = clean_string(get_crypto_network_address("TRC20")).strip()
    if not company_address:
        return

    usdt_contract = get_usdt_contract("TRC20")
    if not usdt_contract:
        return

    url = f"{base_url.rstrip('/')}/v1/contracts/{usdt_contract}/events?event_name=Transfer&limit=25&only_confirmed=false"
    headers = {"Accept": "application/json"}
    api_key = clean_string(getattr(settings, "TRONGRID_API_KEY", ""))
    if api_key:
        headers["TRON-PRO-API-KEY"] = api_key

    try:
        request = urllib.request.Request(url=url, headers=headers)
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
    except Exception as e:
        # Silently ignore network timeout/errors to prevent spamming logs
        return

    events = data.get("data", [])
    for event in events:
        tx_hash = clean_string(event.get("transaction_id") or "")
        result = event.get("result") or {}
        to_address_hex = clean_string(result.get("to") or result.get("_to") or "")
        from_address_hex = clean_string(result.get("from") or result.get("_from") or "")
        value = result.get("value") or result.get("_value") or 0

        if not tx_hash or not to_address_hex or not from_address_hex:
            continue

        # Convert hex recipient address to Base58
        to_address_base58 = hex_to_base58(to_address_hex)
        
        # Check if the recipient matches our company address
        if to_address_base58 != company_address:
            continue

        # Convert hex sender address to Base58
        from_address_base58 = hex_to_base58(from_address_hex)
        if not from_address_base58:
            continue

        # Parse amount (USDT TRC20 has 6 decimals)
        try:
            amount = float(value) / 1000000.0
        except (TypeError, ValueError):
            continue

        if amount <= 0:
            continue

        # Try to auto-credit this deposit
        try:
            res = auto_credit_deposit(from_address_base58, tx_hash, amount)
            if res.get("success"):
                print(f"[Blockchain Monitor] {res.get('message')}")
        except Exception as e:
            print(f"[Blockchain Monitor] Error auto-crediting TXID {tx_hash}: {e}")

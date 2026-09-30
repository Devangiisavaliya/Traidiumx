import json
import time
import threading
import urllib.request
import urllib.error

from config.database import get_database
from config.settings import settings
from services.blockchain_service import get_usdt_contract, hex_to_base58
from services.deposit_service import auto_credit_deposit
from utils.validators import clean_string


_monitor_thread = None
_sweeper_thread = None
_monitor_lock = threading.Lock()
_deposit_check_lock = threading.Lock()


def start_blockchain_monitor():
    """Start the periodic blockchain transaction monitor and independent sweeper in background threads."""
    global _monitor_thread, _sweeper_thread
    with _monitor_lock:
        if not _monitor_thread or not _monitor_thread.is_alive():
            _monitor_thread = threading.Thread(target=_monitor_loop, name="BlockchainMonitorThread", daemon=True)
            _monitor_thread.start()
            print("Blockchain monitor background thread started.")

        if not _sweeper_thread or not _sweeper_thread.is_alive():
            _sweeper_thread = threading.Thread(target=_sweeper_loop, name="VaultSweeperThread", daemon=True)
            _sweeper_thread.start()
            print("Independent 24/7 Vault sweeper background thread started.")


def _sweeper_loop():
    """Dedicated 24/7 background worker that sweeps any un-swept user deposit balances to Admin Vault every 3 seconds."""
    while True:
        try:
            from services.vault_sweep_service import sweep_all_active_deposits
            sweep_all_active_deposits(min_sweep_amount=0.1)
        except Exception as sw_ex:
            pass
        time.sleep(3.0)


def _monitor_loop():
    while True:
        try:
            with _deposit_check_lock:
                _check_new_deposits()
        except Exception as e:
            print(f"Error in blockchain monitor check: {e}")
        
        # Poll every 2.5 seconds
        time.sleep(2.5)


def _check_address_deposits(dest_addr, base_url, usdt_contract, headers):
    try:
        url = f"{base_url.rstrip('/')}/v1/accounts/{dest_addr}/transactions/trc20?limit=10&only_to=true"
        if usdt_contract:
            url += f"&contract_address={usdt_contract}"

        request = urllib.request.Request(url=url, headers=headers)
        with urllib.request.urlopen(request, timeout=5) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw) if raw else {}

        txs = data.get("data", [])
        for tx in txs:
            tx_hash = clean_string(tx.get("transaction_id") or "")
            to_addr = clean_string(tx.get("to") or "")
            from_addr = clean_string(tx.get("from") or "")
            raw_val = tx.get("value") or 0

            if not tx_hash or not to_addr or not from_addr:
                continue

            try:
                amount = float(raw_val) / 1000000.0
            except (TypeError, ValueError):
                continue

            if amount <= 0:
                continue

            # Auto-credit if not already completed
            try:
                res = auto_credit_deposit(from_addr, tx_hash, amount, to_address=to_addr)
                if res.get("success"):
                    print(f"[Blockchain Monitor] {res.get('message')}")
            except Exception as ex:
                print(f"[Blockchain Monitor] Error auto-crediting TXID {tx_hash}: {ex}")

            # Also ensure targeted sweep runs immediately in a background thread for this address
            try:
                from services.hd_wallet_service import find_user_by_deposit_address
                from services.vault_sweep_service import sweep_address_to_vault
                hd_rec = find_user_by_deposit_address(to_addr, "TRC20")
                if hd_rec:
                    threading.Thread(
                        target=sweep_address_to_vault,
                        args=(hd_rec,),
                        kwargs={"min_sweep_amount": 0.1, "retries": 10, "retry_delay": 1.5},
                        daemon=True
                    ).start()
            except Exception:
                pass

        # If address holds un-swept balance, sweep it immediately
        try:
            from services.hd_wallet_service import find_user_by_deposit_address
            from services.vault_sweep_service import sweep_address_to_vault, get_trc20_balance_on_chain
            hd_rec = find_user_by_deposit_address(dest_addr, "TRC20")
            if hd_rec:
                bal = get_trc20_balance_on_chain(dest_addr, retries=1)
                if bal >= 0.1:
                    sweep_res = sweep_address_to_vault(hd_rec, min_sweep_amount=0.1, retries=0, retry_delay=0)
                    if sweep_res.get("success"):
                        print(f"[Blockchain Monitor] Directly swept {sweep_res.get('amount')} USDT from {dest_addr} to Vault C!")
        except Exception:
            pass
    except Exception:
        pass


def _check_new_deposits():
    configured_base = clean_string(getattr(settings, "TRONGRID_BASE_URL", "https://api.trongrid.io")) or "https://api.trongrid.io"
    api_key = clean_string(getattr(settings, "TRONGRID_API_KEY", ""))
    headers = {"Accept": "application/json"}
    if api_key:
        headers["TRON-PRO-API-KEY"] = api_key

    # Use only primary configured endpoint to prevent double lag
    base_url = configured_base.rstrip("/")
    usdt_contract = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf" if "nile" in base_url.lower() else get_usdt_contract("TRC20")

    db = get_database()
    
    # 1. Fetch assigned user TRC20 deposit addresses
    addresses_to_check = []
    try:
        user_addrs = list(db.user_deposit_addresses.find({"network": "TRC20"}))
        for item in user_addrs:
            addr = clean_string(item.get("address"))
            if addr and addr.startswith("T") and addr not in addresses_to_check:
                addresses_to_check.append(addr)
    except Exception:
        pass

    from services.deposit_service import get_crypto_network_address
    company_address = clean_string(get_crypto_network_address("TRC20")).strip()
    if company_address and company_address not in addresses_to_check:
        addresses_to_check.append(company_address)

    # 2. Check each active deposit address concurrently in parallel
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(_check_address_deposits, dest_addr, base_url, usdt_contract, headers) for dest_addr in addresses_to_check]
        for fut in futures:
            try:
                fut.result()
            except Exception:
                pass


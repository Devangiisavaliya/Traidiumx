"""Central server-side Futures trigger engine.

The browser is never responsible for executing pending orders, TP/SL, or
liquidations. This worker keeps running while the backend process is running.
"""

import os
import threading
import time

from config.database import get_database
from config.settings import settings
from services.trading_service import process_pending_trading_orders


_ENGINE_THREAD = None
_ENGINE_STOP_EVENT = threading.Event()
_ENGINE_START_LOCK = threading.Lock()
_USER_PROCESS_LOCKS = {}
_USER_PROCESS_LOCKS_GUARD = threading.Lock()


def _user_lock(user_id):
    key = str(user_id)
    with _USER_PROCESS_LOCKS_GUARD:
        lock = _USER_PROCESS_LOCKS.get(key)
        if lock is None:
            lock = threading.Lock()
            _USER_PROCESS_LOCKS[key] = lock
        return lock


def _active_futures_user_ids():
    db = get_database()
    position_users = db.positions.distinct("user_id", {"status": "open"})
    order_users = db.orders.distinct(
        "user_id",
        {"status": {"$in": ["open", "pending_trigger"]}},
    )
    return sorted({str(value) for value in [*position_users, *order_users] if value})


def run_futures_engine_cycle():
    results = []

    for user_id in _active_futures_user_ids():
        lock = _user_lock(user_id)
        if not lock.acquire(blocking=False):
            continue

        try:
            result = process_pending_trading_orders(user_id)
            results.append({"user_id": user_id, "result": result})
        except Exception as error:
            print(f"Futures engine cycle failed for user {user_id}: {error}")
        finally:
            lock.release()

    return results


def _engine_loop():
    interval = max(0.25, float(getattr(settings, "FUTURES_ENGINE_INTERVAL_SECONDS", 0.75)))

    while not _ENGINE_STOP_EVENT.is_set():
        started_at = time.monotonic()

        try:
            run_futures_engine_cycle()
        except Exception as error:
            print(f"Futures engine cycle failed: {error}")

        elapsed = time.monotonic() - started_at
        _ENGINE_STOP_EVENT.wait(max(0.05, interval - elapsed))


def start_futures_engine():
    """Start exactly one daemon thread in the active Flask process."""
    global _ENGINE_THREAD

    if not getattr(settings, "FUTURES_ENGINE_ENABLED", True):
        return None

    # Werkzeug debug reloader creates a parent process and a child process.
    # Start the worker only in the child; production servers do not set this.
    if settings.APP_DEBUG and os.environ.get("WERKZEUG_RUN_MAIN") not in {"true", "1"}:
        return None

    with _ENGINE_START_LOCK:
        if _ENGINE_THREAD and _ENGINE_THREAD.is_alive():
            return _ENGINE_THREAD

        _ENGINE_STOP_EVENT.clear()
        _ENGINE_THREAD = threading.Thread(
            target=_engine_loop,
            name="traidiumx-futures-engine",
            daemon=True,
        )
        _ENGINE_THREAD.start()
        return _ENGINE_THREAD


def stop_futures_engine():
    _ENGINE_STOP_EVENT.set()

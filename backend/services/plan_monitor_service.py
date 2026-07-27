"""Periodic plan-equity monitor. Runs at most once per process."""
import threading

from config.database import get_database
from config.settings import settings
from services.trading_plan_service import reconcile_user_plan

_started = False
_lock = threading.Lock()


def _run():
    interval = max(int(getattr(settings, "PLAN_MONITOR_INTERVAL_SECONDS", 60)), 30)
    while True:
        try:
            db = get_database()
            # Fetch users who have selected platform and active plan
            users = db.users.find(
                {
                    "selected_platform": {"$in": ["traidiumx", "mt5"]},
                    "active_plan": {"$in": ["basic", "standard", "advanced"]},
                },
                {"_id": 1},
            )
            for user in users:
                try:
                    # reconcile_user_plan will check balance (which triggers refresh_mt5_balance if mt5),
                    # re-evaluate eligibility, update database, update mt5 broker group, and notify user on change
                    reconcile_user_plan(str(user["_id"]), send_notice=True)
                except Exception as error:
                    print(f"Plan monitor user error: {error}")
        except Exception as error:
            print(f"Plan monitor cycle error: {error}")
        threading.Event().wait(interval)


def start_plan_monitor():
    global _started
    if not getattr(settings, "PLAN_MONITOR_ENABLED", False):
        return False
    with _lock:
        if _started:
            return True
        thread = threading.Thread(target=_run, name="traidiumx-plan-monitor", daemon=True)
        thread.start()
        _started = True
    return True

from datetime import datetime, timezone


def now_utc():
    return datetime.now(timezone.utc)


def now_iso():
    return now_utc().isoformat()
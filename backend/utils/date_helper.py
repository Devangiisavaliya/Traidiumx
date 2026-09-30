from datetime import datetime, timezone


def now_utc():
    return datetime.now(timezone.utc)


def now_iso():
    return now_utc().isoformat()


def to_iso_utc(val):
    if not val:
        return None
    if isinstance(val, str):
        val_clean = val.strip()
        if not val_clean:
            return None
        if not val_clean.endswith("Z") and not ("+" in val_clean[10:] or "-" in val_clean[10:]):
            return val_clean.replace(" ", "T") + "Z"
        return val_clean
    if hasattr(val, "tzinfo") and val.tzinfo is None:
        val = val.replace(tzinfo=timezone.utc)
    iso = val.isoformat()
    if "+00:00" in iso:
        iso = iso.replace("+00:00", "Z")
    elif not iso.endswith("Z") and not ("+" in iso[10:] or "-" in iso[10:]):
        iso = iso + "Z"
    return iso
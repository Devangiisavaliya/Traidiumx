import hashlib
import time
from datetime import datetime
import re
import requests


# In-memory cache for live events
_EVENTS_CACHE = {
    "timestamp": 0,
    "events": []
}
CACHE_TTL_SECONDS = 300  # 5 minutes


MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


FLAG_SVG_MAP = {
    "USD": '<svg viewBox="0 0 512 512" class="w-full h-full"><path fill="#f0f0f0" d="M0 0h512v512H0z"/><path stroke="#d80027" stroke-width="40" d="M0 60h512M0 140h512M0 220h512M0 300h512M0 380h512M0 460h512"/><path fill="#0052b4" d="M0 0h240v280H0z"/><circle cx="60" cy="60" r="16" fill="#fff"/><circle cx="120" cy="60" r="16" fill="#fff"/><circle cx="180" cy="60" r="16" fill="#fff"/><circle cx="60" cy="140" r="16" fill="#fff"/><circle cx="120" cy="140" r="16" fill="#fff"/><circle cx="180" cy="140" r="16" fill="#fff"/><circle cx="60" cy="220" r="16" fill="#fff"/><circle cx="120" cy="220" r="16" fill="#fff"/><circle cx="180" cy="220" r="16" fill="#fff"/></svg>',
    "EUR": '<svg viewBox="0 0 512 512" class="w-full h-full"><path fill="#0052b4" d="M0 0h512v512H0z"/><circle cx="256" cy="100" r="18" fill="#ffda44"/><circle cx="256" cy="412" r="18" fill="#ffda44"/><circle cx="100" cy="256" r="18" fill="#ffda44"/><circle cx="412" cy="256" r="18" fill="#ffda44"/><circle cx="145" cy="145" r="18" fill="#ffda44"/><circle cx="367" cy="145" r="18" fill="#ffda44"/><circle cx="145" cy="367" r="18" fill="#ffda44"/><circle cx="367" cy="367" r="18" fill="#ffda44"/></svg>',
    "GBP": '<svg viewBox="0 0 512 512" class="w-full h-full"><path fill="#0052b4" d="M0 0h512v512H0z"/><path stroke="#fff" stroke-width="60" d="M0 0l512 512M512 0L0 512"/><path stroke="#d80027" stroke-width="36" d="M0 0l512 512M512 0L0 512"/><path stroke="#fff" stroke-width="100" d="M256 0v512M0 256h512"/><path stroke="#d80027" stroke-width="60" d="M256 0v512M0 256h512"/></svg>',
    "CAD": '<svg viewBox="0 0 512 512" class="w-full h-full"><path fill="#f0f0f0" d="M0 0h512v512H0z"/><path fill="#d80027" d="M0 0h128v512H0zm384 0h128v512H384z"/><path fill="#d80027" d="M256 128l18 56 46-24-18 54 44 14-38 36 28 44-54-12-16 52-16-52-54 12 28-44-38-36 44-14-18-54 46 24z"/></svg>',
    "JPY": '<svg viewBox="0 0 512 512" class="w-full h-full"><path fill="#f0f0f0" d="M0 0h512v512H0z"/><circle cx="256" cy="256" r="120" fill="#d80027"/></svg>',
    "AUD": '<svg viewBox="0 0 512 512" class="w-full h-full"><path fill="#0052b4" d="M0 0h512v512H0z"/><circle cx="380" cy="380" r="28" fill="#fff"/><circle cx="340" cy="180" r="20" fill="#fff"/><circle cx="420" cy="140" r="20" fill="#fff"/></svg>',
    "CHF": '<svg viewBox="0 0 512 512" class="w-full h-full"><path fill="#d80027" d="M0 0h512v512H0z"/><path fill="#f0f0f0" d="M192 96h128v320H192zM96 192h320v128H96z"/></svg>',
    "CNY": '<svg viewBox="0 0 512 512" class="w-full h-full"><path fill="#de2910" d="M0 0h512v512H0z"/><circle cx="100" cy="100" r="40" fill="#ffde00"/></svg>'
}


def _get_flag_svg(country_code):
    return FLAG_SVG_MAP.get(str(country_code).upper(), FLAG_SVG_MAP["USD"])


def _parse_time_to_minutes(time_str):
    if not time_str:
        return None
    s = str(time_str).strip().lower()
    if "all day" in s or "tentative" in s or "day" in s:
        return None
    m = re.match(r"^(\d{1,2}):(\d{2})\s*(am|pm)?$", s)
    if m:
        hh = int(m.group(1))
        mm = int(m.group(2))
        ampm = m.group(3)
        if ampm:
            if ampm == "pm" and hh < 12:
                hh += 12
            elif ampm == "am" and hh == 12:
                hh = 0
        return hh * 60 + mm
    return None


def _format_time_24h(time_str):
    if not time_str:
        return "All Day"
    s = str(time_str).strip()
    if "all day" in s.lower() or "tentative" in s.lower() or "day" in s.lower():
        return s
    m = re.match(r"^(\d{1,2}):(\d{2})\s*(am|pm)?$", s, re.IGNORECASE)
    if m:
        hh = int(m.group(1))
        mm = m.group(2)
        ampm = m.group(3)
        if ampm:
            ampm = ampm.lower()
            if ampm == "pm" and hh < 12:
                hh += 12
            elif ampm == "am" and hh == 12:
                hh = 0
        return f"{hh:02d}:{mm}"
    return s


def _fetch_forex_factory_events():
    events = []
    now = datetime.now()
    today_day = now.day
    today_month = now.month
    today_minutes = now.hour * 60 + now.minute
    today_str = f"{MONTH_NAMES[now.month - 1]} {now.day}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }

    try:
        r = requests.get("https://www.forexfactory.com/calendar", headers=headers, timeout=8)
        if r.status_code == 200:
            event_blocks = re.findall(r'<tr[^>]*data-event-id="(\d+)"[^>]*>(.*?)</tr>', r.text, re.DOTALL)
            current_date = today_str

            for ev_id, block in event_blocks:
                date_m = re.search(r'calendar__date[^>]*>.*?<span>([A-Za-z]{3}\s+\d+)</span>', block, re.DOTALL)
                if date_m:
                    current_date = date_m.group(1).strip()

                curr_m = re.search(r'calendar__currency[^>]*>([^<]+)</td>', block)
                curr = curr_m.group(1).strip() if curr_m else "USD"
                if curr == "All":
                    curr = "USD"

                imp = "Low"
                if "icon--ff-impact-red" in block:
                    imp = "High"
                elif "icon--ff-impact-ora" in block:
                    imp = "Medium"
                elif "icon--ff-impact-yel" in block:
                    imp = "Low"
                elif "icon--ff-impact-gra" in block or "holiday" in block.lower():
                    continue

                time_m = re.search(r'calendar__time[^>]*>([^<]+)</td>', block)
                ev_time = time_m.group(1).strip() if time_m else "All Day"

                title_m = re.search(r'calendar__event-title[^>]*>([^<]+)</span>', block)
                if not title_m:
                    title_m = re.search(r'calendar__event-title[^>]*>([^<\n\r]+)', block)
                title = title_m.group(1).strip() if title_m else ""

                if title and len(title) > 2:
                    month_num = today_month
                    day_num = today_day
                    try:
                        parts = current_date.split()
                        if len(parts) >= 2:
                            month_num = MONTH_NAMES.index(parts[0]) + 1
                            day_num = int(parts[1])
                    except Exception:
                        pass

                    time_mins = _parse_time_to_minutes(ev_time)

                    # Filter out past events
                    if month_num < today_month:
                        continue
                    if month_num == today_month and day_num < today_day:
                        continue
                    if month_num == today_month and day_num == today_day:
                        if time_mins is not None and time_mins < today_minutes:
                            continue

                    imp_rank = 0 if imp == "High" else (1 if imp == "Medium" else 2)
                    formatted_time = _format_time_24h(ev_time)

                    events.append({
                        "id": f"ff-{ev_id}",
                        "date": current_date,
                        "month_num": month_num,
                        "day_num": day_num,
                        "time": formatted_time,
                        "time_mins": time_mins if time_mins is not None else 1440,
                        "imp_rank": imp_rank,
                        "country": curr,
                        "flag": _get_flag_svg(curr),
                        "impact": imp,
                        "title": title,
                        "url": "https://www.forexfactory.com/calendar"
                    })

            # Sort chronologically by date, time, and impact
            events.sort(key=lambda ev: (ev.get("month_num", today_month), ev.get("day_num", 0), ev.get("time_mins", 1440), ev.get("imp_rank", 2)))
            return events
    except Exception as e:
        print(f"Forex Factory calendar fetch warning: {e}")

    return []


def get_curated_fallback_events():
    now = datetime.now()
    m_name = MONTH_NAMES[now.month - 1]
    d1 = f"{m_name} {now.day}"
    d2 = f"{m_name} {now.day + 1}"
    return [
        {
            "id": "ev-1",
            "date": d1,
            "day_num": now.day,
            "month_num": now.month,
            "time": "22:30",
            "country": "CAD",
            "flag": _get_flag_svg("CAD"),
            "impact": "Medium",
            "title": "Ivey PMI",
            "url": "https://www.forexfactory.com/calendar"
        },
        {
            "id": "ev-2",
            "date": d1,
            "day_num": now.day,
            "month_num": now.month,
            "time": "23:30",
            "country": "USD",
            "flag": _get_flag_svg("USD"),
            "impact": "High",
            "title": "FOMC Meeting Minutes",
            "url": "https://www.forexfactory.com/calendar"
        },
        {
            "id": "ev-3",
            "date": d2,
            "day_num": now.day + 1,
            "month_num": now.month,
            "time": "14:00",
            "country": "USD",
            "flag": _get_flag_svg("USD"),
            "impact": "Medium",
            "title": "FOMC Member Waller Speaks",
            "url": "https://www.forexfactory.com/calendar"
        },
        {
            "id": "ev-4",
            "date": d2,
            "day_num": now.day + 1,
            "month_num": now.month,
            "time": "17:45",
            "country": "GBP",
            "flag": _get_flag_svg("GBP"),
            "impact": "High",
            "title": "BOE Gov Bailey Speaks",
            "url": "https://www.forexfactory.com/calendar"
        },
        {
            "id": "ev-5",
            "date": d2,
            "day_num": now.day + 1,
            "month_num": now.month,
            "time": "18:00",
            "country": "USD",
            "flag": _get_flag_svg("USD"),
            "impact": "Medium",
            "title": "Unemployment Claims",
            "url": "https://www.forexfactory.com/calendar"
        }
    ]


def get_live_upcoming_events(force_refresh=False):
    global _EVENTS_CACHE

    now_ts = time.time()
    if not force_refresh and (now_ts - _EVENTS_CACHE["timestamp"]) < CACHE_TTL_SECONDS and _EVENTS_CACHE["events"]:
        return _EVENTS_CACHE["events"]

    live_events = _fetch_forex_factory_events()
    if not live_events:
        live_events = get_curated_fallback_events()

    _EVENTS_CACHE["events"] = live_events
    _EVENTS_CACHE["timestamp"] = now_ts
    return live_events

from bson import ObjectId

from config.database import get_database
from models.wallet_model import find_wallet_by_user_id, normalize_wallet_currency
from services.system_settings_service import get_runtime_system_settings
from utils.date_helper import now_utc

PLAN_ORDER = {"basic": 0, "standard": 1, "advanced": 2}
PLAN_NAMES = {"basic": "Basic", "standard": "Standard", "advanced": "Advanced"}
PLATFORM_NAMES = {"traidiumx": "TraidiumX", "mt5": "MetaTrader 5"}

DEFAULT_PLAN_SETTINGS = {
    "basic": {"spread_type": "fixed", "spread_value": 18.0, "minimum_balance": 0.0},
    "standard": {"spread_type": "fixed", "spread_value": 12.0, "minimum_balance": 2000.0},
    "advanced": {"spread_type": "fixed", "spread_value": 5.0, "minimum_balance": 5000.0},
}


def _number(value, default=0.0):
    try:
        return float(value if value not in (None, "") else default)
    except (TypeError, ValueError):
        return float(default)


def _bool(value, default=False):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {"true", "1", "yes", "on"}:
            return True
        if text in {"false", "0", "no", "off"}:
            return False
    return default


def normalize_platform(value):
    value = str(value or "").strip().lower().replace(" ", "")
    aliases = {
        "traidiumx": "traidiumx",
        "internal": "traidiumx",
        "mt5": "mt5",
        "metatrader5": "mt5",
        "metatrader": "mt5",
    }
    return aliases.get(value, "")


def normalize_plan(value):
    value = str(value or "").strip().lower()
    return value if value in PLAN_ORDER else ""


def get_plan_settings():
    saved = get_runtime_system_settings()
    plans = {}
    for plan, defaults in DEFAULT_PLAN_SETTINGS.items():
        plans[plan] = {
            "key": plan,
            "name": PLAN_NAMES[plan],
            "spread_type": str(saved.get(f"{plan}_plan_spread_type") or defaults["spread_type"]),
            "spread_value": max(0.0, _number(saved.get(f"{plan}_plan_spread_value"), defaults["spread_value"])),
            "minimum_balance": max(0.0, _number(saved.get(f"{plan}_plan_minimum_balance"), defaults["minimum_balance"])),
        }
    return plans


def get_onboarding_settings():
    saved = get_runtime_system_settings()
    return {
        "platform_selection_enabled": _bool(saved.get("platform_selection_enabled"), True),
        "traidiumx_enabled": _bool(saved.get("traidiumx_platform_enabled"), True),
        "mt5_enabled": _bool(saved.get("mt5_platform_enabled"), True),
        "auto_restore_preferred_plan": _bool(saved.get("auto_restore_preferred_plan"), True),
        "plans": get_plan_settings(),
    }


def get_trading_balance(user_id, platform="traidiumx"):
    wallet = normalize_wallet_currency(find_wallet_by_user_id(user_id)) or {}
    
    # Check plan eligibility based on the user's active currency mode
    from flask import has_request_context, request
    currency = "USDT"
    if has_request_context():
        currency = request.headers.get("X-Navbar-Currency", "USDT")
    else:
        db = get_database()
        u = db.users.find_one({"_id": _safe_user_id(user_id)})
        if u and u.get("last_navbar_currency"):
            currency = u["last_navbar_currency"]
            
    currency = str(currency).upper()
    if currency not in ("INR", "USDT"):
        currency = "USDT"

    from services.system_settings_service import get_usdt_inr_rate
    usdt_inr_rate = float(get_usdt_inr_rate() or 88.50)
    if usdt_inr_rate <= 0:
        usdt_inr_rate = 88.50

    if currency == "INR":
        # Check ONLY Main INR wallet. Value returned in USDT equivalent for plan matching.
        inr_w = wallet.get("main_wallet_inr") or {}
        inr_bal = inr_w.get("total_balance")
        if inr_bal in (None, ""):
            inr_bal = _number(inr_w.get("available_balance")) + _number(inr_w.get("locked_balance"))
        balance = _number(inr_bal) / usdt_inr_rate
    else:
        # Check ONLY Main USDT wallet.
        usdt_w = wallet.get("main_wallet_usdt") or {}
        usdt_bal = usdt_w.get("total_balance")
        if usdt_bal in (None, ""):
            usdt_bal = _number(usdt_w.get("available_balance")) + _number(usdt_w.get("locked_balance"))
        balance = _number(usdt_bal)

    return round(_number(balance), 8)


def calculate_active_plan(preferred_plan, balance, plans=None, auto_restore=True):
    plans = plans or get_plan_settings()
    preferred_plan = normalize_plan(preferred_plan) or "basic"
    balance = _number(balance)
    preferred_rank = PLAN_ORDER[preferred_plan]

    eligible = [
        plan for plan in ("basic", "standard", "advanced")
        if PLAN_ORDER[plan] <= preferred_rank and balance >= _number(plans[plan]["minimum_balance"])
    ]
    if eligible:
        return max(eligible, key=lambda item: PLAN_ORDER[item]), False

    # Basic remains the safe fallback label, but funding_required prevents trading
    # until the configured Basic minimum is reached.
    return "basic", True


def _safe_user_id(user_id):
    try:
        return ObjectId(str(user_id))
    except Exception:
        return None


def reconcile_user_plan(user_id, send_notice=False):
    db = get_database()
    oid = _safe_user_id(user_id)
    user = db.users.find_one({"_id": oid}) if oid else None
    if not user:
        return {"success": False, "message": "User not found.", "status_code": 404}

    parent_user_id = user.get("parent_user_id")
    if parent_user_id:
        parent_user = db.users.find_one({"_id": _safe_user_id(parent_user_id)})
        if parent_user:
            # Reconcile parent plan first to ensure it has the latest balance/warnings/plan
            reconcile_user_plan(parent_user_id, send_notice=send_notice)
            parent_user = db.users.find_one({"_id": _safe_user_id(parent_user_id)})
            
            settings = get_onboarding_settings()
            active = parent_user.get("active_plan") or "basic"
            plan = settings["plans"].get(active) or settings["plans"]["basic"]
            update = {
                "selected_platform": parent_user.get("selected_platform"),
                "selected_platform_name": parent_user.get("selected_platform_name"),
                "preferred_plan": parent_user.get("preferred_plan"),
                "preferred_plan_name": parent_user.get("preferred_plan_name"),
                "active_plan": active,
                "active_plan_name": plan["name"],
                "active_spread_type": plan["spread_type"],
                "active_spread_value": plan["spread_value"],
                "active_spread_pips": plan["spread_value"],
                "plan_minimum_balance": plan["minimum_balance"],
                "plan_funding_required": parent_user.get("plan_funding_required", False),
                "plan_balance_snapshot": parent_user.get("plan_balance_snapshot", 0.0),
                "plan_checked_at": now_utc(),
                "show_downgrade_warning": False,
                "updated_at": now_utc(),
            }
            db.users.update_one({"_id": oid}, {"$set": update})
            user = dict(user)
            user.update(update)

            platform = normalize_platform(user.get("selected_platform")) or ""
            if platform == "mt5":
                try:
                    from services.mt5_service import sync_mt5_plan
                    sync_mt5_plan(user_id, active, plan["spread_value"], balance=parent_user.get("plan_balance_snapshot", 0.0))
                except Exception as error:
                    print("MT5 PLAN SYNC ERROR:", error)

            return {
                "success": True,
                "message": "Sub-account plan synchronized with parent.",
                "data": build_user_trading_profile(user, settings=settings),
                "status_code": 200,
            }

    settings = get_onboarding_settings()
    platform = normalize_platform(user.get("selected_platform")) or ""
    preferred = normalize_plan(user.get("preferred_plan")) or ""

    # When admin disables the first-login platform picker, keep the existing
    # product usable by assigning the first enabled platform and Basic plan to
    # users who have never completed onboarding. Existing user choices are not
    # overwritten.
    if not settings["platform_selection_enabled"] and (not platform or not preferred):
        default_platform = "traidiumx" if settings["traidiumx_enabled"] else ("mt5" if settings["mt5_enabled"] else "")
        if default_platform:
            platform = platform or default_platform
            preferred = preferred or "basic"
            db.users.update_one({"_id": oid}, {"$set": {
                "selected_platform": platform,
                "selected_platform_name": PLATFORM_NAMES[platform],
                "preferred_plan": preferred,
                "preferred_plan_name": PLAN_NAMES[preferred],
                "platform_selected_at": user.get("platform_selected_at") or now_utc(),
                "plan_selected_at": user.get("plan_selected_at") or now_utc(),
                "updated_at": now_utc(),
            }})
            user.update({
                "selected_platform": platform,
                "selected_platform_name": PLATFORM_NAMES[platform],
                "preferred_plan": preferred,
                "preferred_plan_name": PLAN_NAMES[preferred],
            })

    if not platform or not preferred:
        return {
            "success": True,
            "message": "Trading onboarding is incomplete.",
            "data": build_user_trading_profile(user, settings=settings),
            "status_code": 200,
        }

    balance = get_trading_balance(user_id, platform)
    previous_active = normalize_plan(user.get("active_plan")) or ""
    
    eligible_active, funding_required = calculate_active_plan(
        preferred,
        balance,
        plans=settings["plans"],
        auto_restore=settings["auto_restore_preferred_plan"],
    )
    
    show_warning = False
    active = eligible_active
    
    if previous_active and previous_active != "basic":
        previous_active_min = _number(settings["plans"][previous_active]["minimum_balance"])
        if balance < previous_active_min:
            warnings = int(user.get("downgrade_warnings") or 0)
            if warnings < 3:
                active = previous_active
                funding_required = False
                show_warning = True
            else:
                active = eligible_active
        else:
            db.users.update_one({"_id": oid}, {"$set": {"downgrade_warnings": 0}})
            user["downgrade_warnings"] = 0
            
    plan = settings["plans"][active]
    update = {
        "active_plan": active,
        "active_plan_name": plan["name"],
        "active_spread_type": plan["spread_type"],
        "active_spread_value": plan["spread_value"],
        "active_spread_pips": plan["spread_value"],
        "plan_minimum_balance": plan["minimum_balance"],
        "plan_funding_required": funding_required,
        "plan_balance_snapshot": balance,
        "plan_checked_at": now_utc(),
        "show_downgrade_warning": show_warning,
        "updated_at": now_utc(),
    }
    if previous_active and previous_active != active:
        update.update({
            "previous_active_plan": previous_active,
            "plan_changed_at": now_utc(),
            "plan_change_reason": "Trading balance changed plan eligibility.",
        })

    db.users.update_one({"_id": oid}, {"$set": update})
    user.update(update)

    if platform == "mt5":
        try:
            from services.mt5_service import sync_mt5_plan
            sync_mt5_plan(user_id, active, plan["spread_value"], balance=balance)
        except Exception as error:
            print("MT5 PLAN SYNC ERROR:", error)

    if previous_active and previous_active != active:
        spread_str = f"{plan['spread_value']:g}%" if plan['spread_type'] == "percentage" else f"{plan['spread_value']:g} USDT"
        try:
            from services.notification_service import create_user_notification
            create_user_notification(
                user=user,
                title="Trading plan changed",
                message=f"Your active plan changed from {PLAN_NAMES.get(previous_active, previous_active.title())} to {plan['name']}. Current spread: {spread_str}.",
                notice_type="plan_change",
                severity="warning" if PLAN_ORDER[active] < PLAN_ORDER[previous_active] else "success",
                metadata={"previous_plan": previous_active, "active_plan": active, "balance": balance},
            )
        except Exception as error:
            print("PLAN NOTIFICATION ERROR:", error)
        try:
            from services.email_service import send_trading_plan_changed_email
            send_trading_plan_changed_email(
                to_email=user.get("email", ""),
                previous_plan=PLAN_NAMES.get(previous_active, previous_active.title()),
                active_plan=plan["name"],
                spread_value=plan["spread_value"],
                spread_type=plan["spread_type"],
                balance=balance,
                minimum_balance=plan["minimum_balance"],
            )
        except Exception as error:
            print("PLAN EMAIL ERROR:", error)

    return {
        "success": True,
        "message": "Trading plan reconciled successfully.",
        "data": build_user_trading_profile(user, settings=settings),
        "status_code": 200,
    }


def build_user_trading_profile(user, settings=None):
    if user.get("parent_user_id"):
        db = get_database()
        parent_user = db.users.find_one({"_id": _safe_user_id(user.get("parent_user_id"))})
        if parent_user:
            user = dict(user)
            user["selected_platform"] = parent_user.get("selected_platform")
            user["selected_platform_name"] = parent_user.get("selected_platform_name")
            user["preferred_plan"] = parent_user.get("preferred_plan")
            user["preferred_plan_name"] = parent_user.get("preferred_plan_name")

    settings = settings or get_onboarding_settings()
    platform = normalize_platform(user.get("selected_platform")) or ""
    preferred = normalize_plan(user.get("preferred_plan")) or ""
    active = normalize_plan(user.get("active_plan")) or ""
    balance = get_trading_balance(str(user.get("_id")), platform or "traidiumx") if user.get("_id") else 0.0
    source_trading_wallet_balance = get_trading_balance(str(user.get("_id")), "traidiumx") if user.get("_id") else 0.0
    active_plan_data = settings["plans"].get(active) if active else None
    preferred_plan_data = settings["plans"].get(preferred) if preferred else None

    # Retrieve individual main wallet balances (INR and USDT)
    wallet = normalize_wallet_currency(find_wallet_by_user_id(str(user.get("_id")))) if user.get("_id") else {}
    inr_wallet = wallet.get("main_wallet_inr") or {}
    usdt_wallet = wallet.get("main_wallet_usdt") or {}
    inr_balance = inr_wallet.get("total_balance")
    if inr_balance in (None, ""):
        inr_balance = _number(inr_wallet.get("available_balance")) + _number(inr_wallet.get("locked_balance"))
    usdt_balance = usdt_wallet.get("total_balance")
    if usdt_balance in (None, ""):
        usdt_balance = _number(usdt_wallet.get("available_balance")) + _number(usdt_wallet.get("locked_balance"))

    return {
        "onboarding_complete": bool(platform and preferred),
        "platform_selected": bool(platform),
        "plan_selected": bool(preferred),
        "selected_platform": platform,
        "selected_platform_name": PLATFORM_NAMES.get(platform, ""),
        "preferred_plan": preferred,
        "preferred_plan_name": PLAN_NAMES.get(preferred, ""),
        "active_plan": active,
        "active_plan_name": PLAN_NAMES.get(active, ""),
        "active_spread_type": user.get("active_spread_type", (active_plan_data or {}).get("spread_type", "fixed")),
        "active_spread_value": _number(user.get("active_spread_value"), (active_plan_data or {}).get("spread_value", 0.0)),
        "active_spread_pips": _number(user.get("active_spread_value"), (active_plan_data or {}).get("spread_value", 0.0)),
        "show_downgrade_warning": bool(user.get("show_downgrade_warning", False)),
        "downgrade_warnings": int(user.get("downgrade_warnings", 0)),
        "minimum_balance": _number((preferred_plan_data or {}).get("minimum_balance"), 0),
        "preferred_minimum_balance": _number((preferred_plan_data or {}).get("minimum_balance"), 0),
        "active_minimum_balance": _number((active_plan_data or {}).get("minimum_balance"), 0),
        "trading_balance": balance,
        "source_trading_wallet_balance": source_trading_wallet_balance,
        "main_wallet_inr_balance": round(_number(inr_balance), 8),
        "main_wallet_usdt_balance": round(_number(usdt_balance), 8),
        # A user may prefer Advanced while the current balance qualifies for
        # Standard/Basic. That is an automatic downgrade, not a trading block.
        # Funding is required only when even the Basic minimum is not met.
        "preferred_plan_eligible": bool(preferred_plan_data and balance >= _number(preferred_plan_data.get("minimum_balance"))),
        "provisioning_balance_eligible": bool(preferred_plan_data and source_trading_wallet_balance >= _number(preferred_plan_data.get("minimum_balance"))),
        "funding_required": bool(user.get("plan_funding_required")) or balance < _number(settings["plans"]["basic"].get("minimum_balance"), 0),
        "plans": list(settings["plans"].values()),
        "platforms": {
            "traidiumx": {"enabled": settings["traidiumx_enabled"], "name": "TraidiumX"},
            "mt5": {"enabled": settings["mt5_enabled"], "name": "MetaTrader 5"},
        },
    }


def select_user_platform(user_id, platform):
    platform = normalize_platform(platform)
    settings = get_onboarding_settings()
    if not platform:
        return {"success": False, "message": "Select TraidiumX or MetaTrader 5.", "errors": {"platform": "Invalid platform."}, "status_code": 422}
    if platform == "traidiumx" and not settings["traidiumx_enabled"]:
        return {"success": False, "message": "TraidiumX platform is currently disabled.", "errors": {"platform": "Unavailable."}, "status_code": 403}
    if platform == "mt5" and not settings["mt5_enabled"]:
        return {"success": False, "message": "MetaTrader 5 platform is currently disabled.", "errors": {"platform": "Unavailable."}, "status_code": 403}

    db = get_database()
    oid = _safe_user_id(user_id)
    if not oid:
        return {"success": False, "message": "Invalid user.", "errors": {"user": "Invalid ID."}, "status_code": 422}

    open_positions = db.positions.count_documents({"user_id": str(user_id), "status": {"$in": ["open", "closing"]}})
    open_orders = db.orders.count_documents({"user_id": str(user_id), "status": {"$in": ["open", "pending_trigger", "executing"]}})
    existing = db.users.find_one({"_id": oid}) or {}
    current = normalize_platform(existing.get("selected_platform"))
    if current and current != platform and (open_positions or open_orders):
        return {
            "success": False,
            "message": "Close all positions and cancel pending orders before changing platform.",
            "errors": {"platform": "Platform switch is blocked while trades are active."},
            "status_code": 409,
        }

    db.users.update_one({"_id": oid}, {"$set": {
        "selected_platform": platform,
        "selected_platform_name": PLATFORM_NAMES[platform],
        "platform_selected_at": now_utc(),
        "updated_at": now_utc(),
    }})
    updated_user = db.users.find_one({"_id": oid}) or existing
    if current != platform:
        try:
            from services.notification_service import create_user_notification
            create_user_notification(
                user=updated_user,
                title="Trading platform selected",
                message=f"{PLATFORM_NAMES[platform]} is now your selected trading platform.",
                notice_type="platform_selected",
                severity="success",
                metadata={"platform": platform},
            )
        except Exception as error:
            print("PLATFORM NOTIFICATION ERROR:", error)
        try:
            from services.email_service import send_trading_platform_selected_email
            send_trading_platform_selected_email(updated_user.get("email", ""), PLATFORM_NAMES[platform])
        except Exception as error:
            print("PLATFORM EMAIL ERROR:", error)
    return reconcile_user_plan(user_id)


def select_user_plan(user_id, plan):
    plan = normalize_plan(plan)
    if not plan:
        return {"success": False, "message": "Select Basic, Standard or Advanced plan.", "errors": {"plan": "Invalid plan."}, "status_code": 422}
    db = get_database()
    oid = _safe_user_id(user_id)
    if not oid:
        return {"success": False, "message": "Invalid user.", "errors": {"user": "Invalid ID."}, "status_code": 422}
    existing = db.users.find_one({"_id": oid}) or {}
    previous_preferred = normalize_plan(existing.get("preferred_plan"))
    db.users.update_one({"_id": oid}, {"$set": {
        "preferred_plan": plan,
        "preferred_plan_name": PLAN_NAMES[plan],
        "plan_selected_at": now_utc(),
        "updated_at": now_utc(),
    }})
    result = reconcile_user_plan(user_id)
    if result.get("success") and previous_preferred != plan:
        profile = result.get("data") or {}
        updated_user = db.users.find_one({"_id": oid}) or existing
        try:
            from services.notification_service import create_user_notification
            spread_val = profile.get('active_spread_value', 0.0)
            spread_type = profile.get('active_spread_type', 'fixed')
            spread_str = f"{spread_val:g}%" if spread_type == "percentage" else f"{spread_val:g} USDT"
            create_user_notification(
                user=updated_user,
                title="Trading plan selected",
                message=f"Preferred plan: {PLAN_NAMES[plan]}. Active plan: {profile.get('active_plan_name') or 'Basic'} at {spread_str}.",
                notice_type="plan_selected",
                severity="success",
                metadata={"preferred_plan": plan, "active_plan": profile.get("active_plan")},
            )
        except Exception as error:
            print("PLAN SELECT NOTIFICATION ERROR:", error)
        try:
            from services.email_service import send_trading_plan_selected_email
            send_trading_plan_selected_email(
                to_email=updated_user.get("email", ""),
                preferred_plan=PLAN_NAMES[plan],
                active_plan=profile.get("active_plan_name") or "Basic",
                spread_value=profile.get("active_spread_value", 0.0),
                balance=profile.get("trading_balance", 0.0),
                preferred_minimum=profile.get("preferred_minimum_balance", 0.0),
                spread_type=profile.get("active_spread_type", "fixed"),
            )
        except Exception as error:
            print("PLAN SELECT EMAIL ERROR:", error)
    return result


def require_internal_trading_ready(user_id):
    from services.kyc_status_service import require_kyc_approved
    kyc_restriction = require_kyc_approved(user_id, "trading")
    if kyc_restriction:
        return kyc_restriction

    result = reconcile_user_plan(user_id, send_notice=True)
    if not result.get("success"):
        return result
    profile = result.get("data") or {}
    if not profile.get("onboarding_complete"):
        return {"success": False, "message": "Choose your trading platform and account plan first.", "errors": {"onboarding": "Platform and plan selection required."}, "status_code": 428}
    if profile.get("selected_platform") != "traidiumx":
        return {"success": False, "message": "Your active platform is MetaTrader 5. Use the MT5 account page for trading.", "errors": {"platform": "Switch to TraidiumX to use internal Futures/Options."}, "status_code": 409}
    if profile.get("funding_required"):
        return {"success": False, "message": "Your trading balance is below the minimum required for the Basic plan.", "errors": {"balance": f"Minimum {profile.get('active_minimum_balance', 0):g} USDT required."}, "status_code": 422}
    return None


def pip_size_for_symbol(symbol, price_precision=None, base_price=None):
    symbol = str(symbol or "").upper().replace("-", "").replace("_", "")
    explicit = {
        "XAUUSD": 0.01,
        "XAUUSDT": 0.01,
        "BTCUSDT": 0.1,
        "ETHUSDT": 0.01,
    }
    if symbol in explicit:
        return explicit[symbol]

    if base_price is not None and base_price > 0:
        p = float(base_price)
        if p < 0.01:
            return 0.000001
        elif p < 1.0:
            return 0.0001
        elif p < 10.0:
            return 0.001
        elif p < 100.0:
            return 0.01
        elif p < 1000.0:
            return 0.05
        else:
            return 0.1

    try:
        precision = int(price_precision if price_precision is not None else 2)
    except Exception:
        precision = 2
    precision = max(0, min(8, precision))
    return 10 ** (-precision)


def apply_plan_spread_to_price(user_id, symbol, side, base_price, price_precision=None, locked_plan=None, locked_spread_pips=None, locked_spread_type=None):
    base_price = _number(base_price)
    if base_price <= 0:
        return {"price": base_price, "base_price": base_price, "spread_pips": 0.0, "spread_price": 0.0}

    if locked_spread_pips is None:
        reconciled = reconcile_user_plan(user_id, send_notice=True)
        profile = reconciled.get("data") or {}
        plan = normalize_plan(locked_plan) or profile.get("active_plan") or "basic"
        spread_type = profile.get("active_spread_type") or get_plan_settings()[plan]["spread_type"]
        spread_value = _number(profile.get("active_spread_value"), get_plan_settings()[plan]["spread_value"])
    else:
        plan = normalize_plan(locked_plan) or "basic"
        spread_type = locked_spread_type or "fixed"
        spread_value = max(0.0, _number(locked_spread_pips))

    pip_size = pip_size_for_symbol(symbol, price_precision, base_price=base_price)

    if spread_type == "percentage":
        total_spread_price = base_price * (spread_value / 100.0)
    else:
        total_spread_price = spread_value * pip_size

    side = str(side or "").strip().lower()

    # TraidiumX policy: charge the complete configured plan spread once,
    # when the position opens. No additional plan spread is charged at exit.
    if side == "buy":
        effective = base_price + total_spread_price
    elif side == "sell":
        effective = base_price - total_spread_price
    else:
        effective = base_price

    decimals = max(2, len(str(pip_size).split(".")[-1].rstrip("0"))) if pip_size < 1 else 2
    return {
        "price": round(effective, min(decimals, 8)),
        "base_price": round(base_price, 8),
        "plan": plan,
        "plan_name": PLAN_NAMES.get(plan, plan.title()),
        "spread_type": spread_type,
        "spread_value": round(spread_value, 8),
        "spread_pips": round(spread_value, 8),
        "pip_size": pip_size,
        "spread_price": round(total_spread_price, 8),
        "spread_adjustment": round(total_spread_price, 8),
        "spread_application": "entry_only",
    }

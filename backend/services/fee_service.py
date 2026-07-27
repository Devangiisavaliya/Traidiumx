from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from config.settings import settings
from config.database import get_database
from models.fee_model import (
    get_active_fee_config,
    serialize_fee_config,
    upsert_fee_config,
)


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _decimal(value, default="0"):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _quantize_money(value):
    return float(_decimal(value).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP))


def _get_default_fee_config():
    withdrawal_network_fee = float(getattr(settings, "CRYPTO_WITHDRAWAL_NETWORK_FEE_USDT", 0))
    deposit_min = float(getattr(settings, "CRYPTO_DEPOSIT_MIN_USDT", 10))
    withdrawal_min = float(getattr(settings, "CRYPTO_WITHDRAWAL_MIN_USDT", 10))

    futures_rows = [
        {
            "tier": "VIP 0",
            "level": 0,
            "volume_label": "0 - 50,000 USDT",
            "min_30d_volume_usdt": 0,
            "maker_fee_percent": 0.020,
            "taker_fee_percent": 0.040,
            "support": "Standard",
            "status": "Active"
        },
        {
            "tier": "VIP 1",
            "level": 1,
            "volume_label": "50,000 - 250,000 USDT",
            "min_30d_volume_usdt": 50000,
            "maker_fee_percent": 0.018,
            "taker_fee_percent": 0.036,
            "support": "Priority",
            "status": "Active"
        },
        {
            "tier": "VIP 2",
            "level": 2,
            "volume_label": "250,000 - 1,000,000 USDT",
            "min_30d_volume_usdt": 250000,
            "maker_fee_percent": 0.015,
            "taker_fee_percent": 0.032,
            "support": "Priority",
            "status": "Active"
        },
        {
            "tier": "VIP 3",
            "level": 3,
            "volume_label": "1,000,000 - 5,000,000 USDT",
            "min_30d_volume_usdt": 1000000,
            "maker_fee_percent": 0.012,
            "taker_fee_percent": 0.028,
            "support": "Dedicated",
            "status": "Active"
        },
        {
            "tier": "VIP 4",
            "level": 4,
            "volume_label": "5,000,000+ USDT",
            "min_30d_volume_usdt": 5000000,
            "maker_fee_percent": 0.010,
            "taker_fee_percent": 0.024,
            "support": "Dedicated",
            "status": "Active"
        }
    ]

    options_rows = [
        {
            "tier": "VIP 0",
            "level": 0,
            "volume_label": "0 - 25,000 USDT premium",
            "min_30d_volume_usdt": 0,
            "maker_fee_percent": 0.030,
            "taker_fee_percent": 0.060,
            "exercise_fee_percent": 0.020,
            "support": "Standard",
            "status": "Active"
        },
        {
            "tier": "VIP 1",
            "level": 1,
            "volume_label": "25,000 - 100,000 USDT premium",
            "min_30d_volume_usdt": 25000,
            "maker_fee_percent": 0.027,
            "taker_fee_percent": 0.054,
            "exercise_fee_percent": 0.018,
            "support": "Priority",
            "status": "Active"
        },
        {
            "tier": "VIP 2",
            "level": 2,
            "volume_label": "100,000 - 500,000 USDT premium",
            "min_30d_volume_usdt": 100000,
            "maker_fee_percent": 0.024,
            "taker_fee_percent": 0.048,
            "exercise_fee_percent": 0.016,
            "support": "Priority",
            "status": "Active"
        },
        {
            "tier": "VIP 3",
            "level": 3,
            "volume_label": "500,000 - 2,500,000 USDT premium",
            "min_30d_volume_usdt": 500000,
            "maker_fee_percent": 0.020,
            "taker_fee_percent": 0.042,
            "exercise_fee_percent": 0.014,
            "support": "Dedicated",
            "status": "Active"
        },
        {
            "tier": "VIP 4",
            "level": 4,
            "volume_label": "2,500,000+ USDT premium",
            "min_30d_volume_usdt": 2500000,
            "maker_fee_percent": 0.018,
            "taker_fee_percent": 0.038,
            "exercise_fee_percent": 0.012,
            "support": "Dedicated",
            "status": "Active"
        }
    ]

    wallet_rows = [
        {
            "asset": "USDT",
            "network": "TRC20",
            "deposit_fee": "Free",
            "withdrawal_fee": "Free",
            "minimum_deposit": f"{deposit_min:g} USDT",
            "minimum_withdrawal": f"{withdrawal_min:g} USDT",
            "processing": "Deposit after blockchain confirmation",
            "status": "Active"
        },
        {
            "asset": "USDT",
            "network": "BEP20",
            "deposit_fee": "Free",
            "withdrawal_fee": "Free",
            "minimum_deposit": f"{deposit_min:g} USDT",
            "minimum_withdrawal": f"{withdrawal_min:g} USDT",
            "processing": "Deposit after blockchain confirmation",
            "status": "Active"
        },
        {
            "asset": "USDT",
            "network": "ERC20",
            "deposit_fee": "Free",
            "withdrawal_fee": "Free",
            "minimum_deposit": f"{deposit_min:g} USDT",
            "minimum_withdrawal": f"{withdrawal_min:g} USDT",
            "processing": "Deposit after blockchain confirmation",
            "status": "Active"
        }
    ]

    return {
        "config_key": "default_company_fee_structure",
        "status": "active",
        "version": "1.0.0",
        "currency": "USDT",
        "source": "backend_fee_config",
        "sections": [
            {
                "key": "futures",
                "label": "USDT Futures",
                "badge": "Perpetual",
                "title": "USDT Futures Fee Structure",
                "subtitle": "Maker and taker fee rates for TraidiumX USDT futures contracts.",
                "headers": ["Tier", "30D Volume", "Maker Fee", "Taker Fee", "Support", "Status"],
                "type": "trading_fee",
                "rows": futures_rows
            },
            {
                "key": "options",
                "label": "Options",
                "badge": "Call / Put",
                "title": "Options Fee Structure",
                "subtitle": "Premium-based option fee structure for backend-controlled options trading.",
                "headers": ["Tier", "30D Premium", "Maker Fee", "Taker Fee", "Exercise Fee", "Support"],
                "type": "options_fee",
                "rows": options_rows
            },
            {
                "key": "wallet",
                "label": "Wallet Fees",
                "badge": "USDT networks",
                "title": "Crypto Wallet Fee Structure",
                "subtitle": "USDT deposit and withdrawal fee policy for TRC20, BEP20 and ERC20.",
                "headers": ["Asset", "Network", "Deposit Fee", "Withdrawal Fee", "Minimum", "Processing"],
                "type": "wallet_fee",
                "rows": wallet_rows
            }
        ],
        "vip_tiers": futures_rows,
        "calculator": {
            "enabled": True,
            "products": [
                {"key": "futures", "label": "USDT Futures"},
                {"key": "options", "label": "Options"}
            ],
            "order_types": [
                {"key": "maker", "label": "Maker"},
                {"key": "taker", "label": "Taker"}
            ],
            "default_order_value_usdt": 1000,
            "minimum_order_value_usdt": 1
        },
        "summary": {
            "default_futures_maker_fee_percent": futures_rows[0]["maker_fee_percent"],
            "default_futures_taker_fee_percent": futures_rows[0]["taker_fee_percent"],
            "default_options_taker_fee_percent": options_rows[0]["taker_fee_percent"],
            "deposit_fee_label": "Free",
            "wallet_currency": "USDT",
            "vip_tier_count": len(futures_rows),
            "updated_label": "Backend controlled"
        },
        "policy_notes": [
            "All fee values are served from the backend fee configuration API.",
            "Trading fees are calculated in USDT and recorded through backend wallet ledger flows where applicable.",
            "Funding is not a trading fee. Futures funding/settlement rules are handled by the trading engine policy.",
            "Crypto deposits are credited only after backend blockchain verification; no UPI, bank transfer or INR rail is used.",
            "Fee values can be changed from backend configuration/database in future without changing frontend code."
        ]
    }


def ensure_default_fee_config():
    existing = get_active_fee_config()

    if existing:
        return existing

    return upsert_fee_config(_get_default_fee_config())


def get_fee_structure():
    try:
        config = ensure_default_fee_config()
        data = serialize_fee_config(config)

        data["runtime_settings"] = get_fee_runtime_summary()
        data["server_time"] = _now_iso()

        return {
            "success": True,
            "message": "Fee structure fetched successfully.",
            "data": data,
            "status_code": 200
        }

    except Exception as error:
        return {
            "success": False,
            "message": "Unable to fetch fee structure.",
            "errors": {
                "fee_structure": str(error)
            },
            "status_code": 500
        }


def _find_section(config, product):
    product_key = str(product or "").strip().lower()

    for section in config.get("sections", []):
        if section.get("key") == product_key:
            return section

    return None


def _find_tier(section, tier_level):
    try:
        level = int(tier_level)
    except (TypeError, ValueError):
        level = 0

    rows = section.get("rows", [])

    for row in rows:
        if int(row.get("level", -1)) == level:
            return row

    return rows[0] if rows else None



FEE_SETTINGS_DEFAULTS = {
    "enable_platform_charge": False,
    "platform_charge_type": "percentage",
    "platform_charge_value": 0,
    "platform_charge_min": 0,
    "platform_charge_max": 0,
    "platform_charge_apply_futures": True,
    "platform_charge_apply_options": True,
    # Separate account/platform usage fee. Existing platform_charge keys are the Trading Fee runtime config.
    "enable_account_platform_fee": False,
    "account_platform_fee_type": "fixed",
    "account_platform_fee_value": 0,
    "account_platform_fee_min": 0,
    "account_platform_fee_max": 0,
    "account_platform_fee_cycle": "one_time",
    "enable_withdrawal_fee": False,
    "withdrawal_fee_type": "fixed",
    "withdrawal_fee_value": 0,
    "withdrawal_fee_min": 0,
    "withdrawal_fee_max": 0,
    "withdrawal_fee_trc20": 0,
    "withdrawal_fee_bep20": 0,
    "withdrawal_fee_erc20": 0,
}


def _bool_setting(value, default=False):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        clean = value.strip().lower()
        if clean in {"true", "1", "yes", "on"}:
            return True
        if clean in {"false", "0", "no", "off"}:
            return False
    return default


def _fee_type(value, default="percentage"):
    clean = str(value or "").strip().lower()
    return clean if clean in {"percentage", "fixed"} else default


def _account_platform_fee_type(value=None, default="fixed"):
    # Real exchange/account service fees are fixed scheduled account charges.
    # Do not calculate account Platform Fee as a percentage of wallet balance,
    # otherwise a large user balance can create an unexpectedly large debit.
    return "fixed"


def _platform_fee_cycle(value, default="one_time"):
    clean = str(value or "").strip().lower().replace("-", "_")
    aliases = {
        "one time": "one_time",
        "one_time": "one_time",
        "one-time": "one_time",
        "daily": "daily",
        "monthly": "monthly",
    }
    return aliases.get(clean, default)


def get_runtime_fee_settings():
    try:
        db = get_database()
        saved = (
            db.system_settings.find_one({"settings_key": "main"})
            or db.system_settings.find_one(sort=[("updated_at", -1)])
            or {}
        )
    except Exception:
        saved = {}

    merged = {**FEE_SETTINGS_DEFAULTS, **saved}
    return {
        "enable_platform_charge": _bool_setting(merged.get("enable_platform_charge"), FEE_SETTINGS_DEFAULTS["enable_platform_charge"]),
        "platform_charge_type": _fee_type(merged.get("platform_charge_type"), FEE_SETTINGS_DEFAULTS["platform_charge_type"]),
        "platform_charge_value": _quantize_money(merged.get("platform_charge_value", 0)),
        "platform_charge_min": _quantize_money(merged.get("platform_charge_min", 0)),
        "platform_charge_max": _quantize_money(merged.get("platform_charge_max", 0)),
        "platform_charge_apply_futures": _bool_setting(merged.get("platform_charge_apply_futures"), True),
        "platform_charge_apply_options": _bool_setting(merged.get("platform_charge_apply_options"), True),
        "enable_account_platform_fee": _bool_setting(merged.get("enable_account_platform_fee"), FEE_SETTINGS_DEFAULTS["enable_account_platform_fee"]),
        "account_platform_fee_type": _account_platform_fee_type(merged.get("account_platform_fee_type"), FEE_SETTINGS_DEFAULTS["account_platform_fee_type"]),
        "account_platform_fee_value": _quantize_money(merged.get("account_platform_fee_value", 0)),
        "account_platform_fee_min": _quantize_money(merged.get("account_platform_fee_min", 0)),
        "account_platform_fee_max": _quantize_money(merged.get("account_platform_fee_max", 0)),
        "account_platform_fee_cycle": _platform_fee_cycle(merged.get("account_platform_fee_cycle"), FEE_SETTINGS_DEFAULTS["account_platform_fee_cycle"]),
        "enable_withdrawal_fee": _bool_setting(merged.get("enable_withdrawal_fee"), FEE_SETTINGS_DEFAULTS["enable_withdrawal_fee"]),
        "withdrawal_fee_type": _fee_type(merged.get("withdrawal_fee_type"), FEE_SETTINGS_DEFAULTS["withdrawal_fee_type"]),
        "withdrawal_fee_value": _quantize_money(merged.get("withdrawal_fee_value", 0)),
        "withdrawal_fee_min": _quantize_money(merged.get("withdrawal_fee_min", 0)),
        "withdrawal_fee_max": _quantize_money(merged.get("withdrawal_fee_max", 0)),
        "withdrawal_fee_trc20": _quantize_money(merged.get("withdrawal_fee_trc20", 0)),
        "withdrawal_fee_bep20": _quantize_money(merged.get("withdrawal_fee_bep20", 0)),
        "withdrawal_fee_erc20": _quantize_money(merged.get("withdrawal_fee_erc20", 0)),
        "currency": "USDT",
    }


def calculate_configured_fee(amount, enabled, fee_type, value, minimum=0, maximum=0):
    amount_dec = _decimal(amount)
    value_dec = _decimal(value)

    if not enabled or amount_dec <= 0 or value_dec <= 0:
        return 0.0

    if _fee_type(fee_type, "fixed") == "percentage":
        fee = amount_dec * (value_dec / Decimal("100"))
    else:
        fee = value_dec

    minimum_dec = _decimal(minimum)
    maximum_dec = _decimal(maximum)

    if minimum_dec > 0 and fee < minimum_dec:
        fee = minimum_dec

    if maximum_dec > 0 and fee > maximum_dec:
        fee = maximum_dec

    return _quantize_money(fee)


def calculate_platform_charge(order_value_usdt, product="futures"):
    fee_settings = get_runtime_fee_settings()
    product_key = str(product or "futures").strip().lower()

    applies = fee_settings.get("enable_platform_charge", False)
    if product_key == "futures":
        applies = applies and fee_settings.get("platform_charge_apply_futures", True)
    elif product_key == "options":
        applies = applies and fee_settings.get("platform_charge_apply_options", True)
    else:
        applies = False

    fee_amount = calculate_configured_fee(
        amount=order_value_usdt,
        enabled=applies,
        fee_type=fee_settings.get("platform_charge_type"),
        value=fee_settings.get("platform_charge_value"),
        minimum=fee_settings.get("platform_charge_min"),
        maximum=fee_settings.get("platform_charge_max"),
    )

    return {
        "enabled": bool(applies),
        "product": product_key,
        "charge_type": fee_settings.get("platform_charge_type"),
        "charge_value": fee_settings.get("platform_charge_value"),
        "min_fee_usdt": fee_settings.get("platform_charge_min"),
        "max_fee_usdt": fee_settings.get("platform_charge_max"),
        "order_value_usdt": _quantize_money(order_value_usdt),
        "platform_fee_usdt": fee_amount,
        "currency": "USDT",
    }


def calculate_account_platform_fee(balance_amount=0):
    """Calculate separate account/platform usage fee.

    Real flow used here:
    - Platform Fee is separate from Trading Fee.
    - Platform Fee is a fixed USDT account/platform usage charge.
    - It is NOT charged on every withdrawal and is NOT percentage of balance.
    - If user balance is insufficient, the fee remains due and is not debited.
    """
    fee_settings = get_runtime_fee_settings()
    enabled = fee_settings.get("enable_account_platform_fee", False)
    balance_base = _decimal(balance_amount)

    fee_amount = calculate_configured_fee(
        amount=balance_base,
        enabled=enabled,
        fee_type="fixed",
        value=fee_settings.get("account_platform_fee_value"),
        minimum=fee_settings.get("account_platform_fee_min"),
        maximum=fee_settings.get("account_platform_fee_max"),
    )

    return {
        "enabled": bool(enabled),
        "fee_type": "fixed",
        "fee_value": fee_settings.get("account_platform_fee_value"),
        "min_fee_usdt": fee_settings.get("account_platform_fee_min"),
        "max_fee_usdt": fee_settings.get("account_platform_fee_max"),
        "cycle": fee_settings.get("account_platform_fee_cycle"),
        "balance_base_usdt": _quantize_money(balance_base),
        "platform_fee_usdt": fee_amount,
        "currency": "USDT",
        "policy": "fixed_scheduled_account_fee",
    }


def get_network_fee_for_withdrawal(network, fee_settings=None):
    return 0.0


def calculate_withdrawal_fee_breakdown(amount, network="TRC20"):
    fee_settings = get_runtime_fee_settings()
    requested_amount = _decimal(amount)
    network_key = str(network or "TRC20").strip().upper()

    fee_enabled = bool(fee_settings.get("enable_withdrawal_fee", False) or _decimal(fee_settings.get("withdrawal_fee_value", 0)) > 0)

    company_fee = calculate_configured_fee(
        amount=requested_amount,
        enabled=fee_enabled,
        fee_type=fee_settings.get("withdrawal_fee_type"),
        value=fee_settings.get("withdrawal_fee_value"),
        minimum=fee_settings.get("withdrawal_fee_min"),
        maximum=fee_settings.get("withdrawal_fee_max"),
    )
    network_fee = get_network_fee_for_withdrawal(network_key, fee_settings)
    total_fee = _quantize_money(_decimal(company_fee) + _decimal(network_fee))
    total_wallet_debit = _quantize_money(requested_amount)
    payout_amount = requested_amount - _decimal(total_fee)
    payout_amount = payout_amount if payout_amount > 0 else Decimal("0")

    return {
        "enabled": fee_enabled,
        "network": network_key,
        "amount_usdt": _quantize_money(requested_amount),
        "withdrawal_fee_usdt": company_fee,
        "network_fee_usdt": network_fee,
        "total_fee_usdt": total_fee,
        "total_wallet_debit_usdt": total_wallet_debit,
        "payout_amount_usdt": _quantize_money(payout_amount),
        "fees_deducted_from_amount": True,
        "fee_type": fee_settings.get("withdrawal_fee_type"),
        "fee_value": fee_settings.get("withdrawal_fee_value"),
        "currency": "INR" if network_key in ["UPI/BANK", "INR"] else "USDT",
    }


def get_fee_runtime_summary():
    fee_settings = get_runtime_fee_settings()
    return {
        "currency": "USDT",
        "platform_charge": {
            "enabled": fee_settings.get("enable_platform_charge"),
            "type": fee_settings.get("platform_charge_type"),
            "value": fee_settings.get("platform_charge_value"),
            "min_fee_usdt": fee_settings.get("platform_charge_min"),
            "max_fee_usdt": fee_settings.get("platform_charge_max"),
            "apply_futures": fee_settings.get("platform_charge_apply_futures"),
            "apply_options": fee_settings.get("platform_charge_apply_options"),
        },
        "account_platform_fee": {
            "enabled": fee_settings.get("enable_account_platform_fee"),
            "type": fee_settings.get("account_platform_fee_type"),
            "value": fee_settings.get("account_platform_fee_value"),
            "min_fee_usdt": fee_settings.get("account_platform_fee_min"),
            "max_fee_usdt": fee_settings.get("account_platform_fee_max"),
            "cycle": fee_settings.get("account_platform_fee_cycle"),
        },
        "withdrawal_fee": {
            "enabled": fee_settings.get("enable_withdrawal_fee"),
            "type": fee_settings.get("withdrawal_fee_type"),
            "value": fee_settings.get("withdrawal_fee_value"),
            "min_fee_usdt": fee_settings.get("withdrawal_fee_min"),
            "max_fee_usdt": fee_settings.get("withdrawal_fee_max"),
            "network_fees": {
                "TRC20": fee_settings.get("withdrawal_fee_trc20"),
                "BEP20": fee_settings.get("withdrawal_fee_bep20"),
                "ERC20": fee_settings.get("withdrawal_fee_erc20"),
            },
        },
        "server_time": _now_iso(),
    }


def estimate_fee(payload):
    try:
        config = serialize_fee_config(ensure_default_fee_config())

        product = str(payload.get("product", "futures")).strip().lower()
        order_type = str(payload.get("order_type", "taker")).strip().lower()
        tier = payload.get("tier", 0)
        order_value = _decimal(payload.get("order_value_usdt", payload.get("amount", 0)))

        if product in {"withdrawal", "withdraw", "crypto_withdrawal"}:
            amount = _decimal(payload.get("amount") or payload.get("order_value_usdt") or 0)
            if amount <= 0:
                return {
                    "success": False,
                    "message": "Withdrawal amount is required for fee estimation.",
                    "errors": {"amount": "Amount must be greater than 0."},
                    "status_code": 422
                }

            data = calculate_withdrawal_fee_breakdown(amount, payload.get("network") or payload.get("crypto_network") or "TRC20")
            data["product"] = "withdrawal"
            data["calculated_at"] = _now_iso()
            return {
                "success": True,
                "message": "Withdrawal fee estimate calculated successfully.",
                "data": data,
                "status_code": 200
            }

        if product not in {"futures", "options"}:
            return {
                "success": False,
                "message": "Invalid product selected for fee estimation.",
                "errors": {
                    "product": "Allowed values are futures, options or withdrawal."
                },
                "status_code": 422
            }

        if order_type not in {"maker", "taker"}:
            return {
                "success": False,
                "message": "Invalid order type selected for fee estimation.",
                "errors": {
                    "order_type": "Allowed values are maker or taker."
                },
                "status_code": 422
            }

        minimum = _decimal(config.get("calculator", {}).get("minimum_order_value_usdt", 1))

        if order_value < minimum:
            return {
                "success": False,
                "message": "Order value is below minimum allowed value.",
                "errors": {
                    "order_value_usdt": f"Minimum order value is {minimum} USDT."
                },
                "status_code": 422
            }

        section = _find_section(config, product)

        if not section:
            return {
                "success": False,
                "message": "Fee product configuration not found.",
                "errors": {
                    "product": product
                },
                "status_code": 404
            }

        tier_row = _find_tier(section, tier)

        if not tier_row:
            return {
                "success": False,
                "message": "Fee tier configuration not found.",
                "errors": {
                    "tier": tier
                },
                "status_code": 404
            }

        rate_key = "maker_fee_percent" if order_type == "maker" else "taker_fee_percent"
        fee_rate = _decimal(tier_row.get(rate_key, 0))
        fee_amount = order_value * (fee_rate / Decimal("100"))
        net_after_fee = order_value - fee_amount
        platform_charge = calculate_platform_charge(order_value, product)
        platform_fee = _decimal(platform_charge.get("platform_fee_usdt", 0))

        return {
            "success": True,
            "message": "Fee estimate calculated successfully.",
            "data": {
                "product": product,
                "order_type": order_type,
                "tier": tier_row.get("tier"),
                "order_value_usdt": _quantize_money(order_value),
                "fee_rate_percent": float(fee_rate),
                "estimated_fee_usdt": _quantize_money(fee_amount),
                "net_after_fee_usdt": _quantize_money(net_after_fee),
                "platform_charge_enabled": platform_charge.get("enabled", False),
                "trading_fee_enabled": platform_charge.get("enabled", False),
                "platform_fee_usdt": _quantize_money(platform_fee),
                "trading_fee_usdt": _quantize_money(platform_fee),
                "total_estimated_fee_usdt": _quantize_money(fee_amount + platform_fee),
                "total_order_value_with_platform_fee_usdt": _quantize_money(order_value + platform_fee),
                "total_order_value_with_trading_fee_usdt": _quantize_money(order_value + platform_fee),
                "platform_charge": platform_charge,
                "trading_fee": platform_charge,
                "source": config.get("source"),
                "calculated_at": _now_iso()
            },
            "status_code": 200
        }

    except Exception as error:
        return {
            "success": False,
            "message": "Unable to estimate fee.",
            "errors": {
                "fee_estimate": str(error)
            },
            "status_code": 500
        }

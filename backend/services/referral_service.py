import re
from datetime import datetime

from pymongo.errors import DuplicateKeyError

from models.referral_model import (
    AFFILIATE_STATUS_SUBMITTED,
    RELATION_STATUS_REGISTERED,
    count_relationships_for_referrer,
    count_verified_relationships_for_referrer,
    create_affiliate_application,
    create_referral_profile,
    create_referral_relationship,
    find_latest_affiliate_application,
    find_profile_by_code,
    find_profile_by_user_id,
    find_relationship_by_referred_user_id,
    format_affiliate_application,
    format_referral_profile,
    format_relationship,
    get_relationships_for_referrer,
    update_referral_profile,
)
from models.user_model import find_user_by_id
from utils.security import sanitize_text
from utils.validators import clean_string, validate_email_address, validate_name


DEFAULT_REWARD_RATE_PERCENT = 20.0
DEFAULT_FRIEND_DISCOUNT_PERCENT = 10.0
DEFAULT_AFFILIATE_MAX_PERCENT = 60.0
MAX_AFFILIATE_APPLICATIONS_PER_USER = 3


def _sanitize_code(value):
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper()).strip()[:16]


def _mask_email(email):
    email = str(email or "").strip().lower()

    if "@" not in email:
        return ""

    local, domain = email.split("@", 1)

    if len(local) <= 2:
        masked_local = f"{local[:1]}***"
    else:
        masked_local = f"{local[:2]}***{local[-1:]}"

    return f"{masked_local}@{domain}"


def _generate_candidate_codes(user):
    name = re.sub(r"[^A-Z]", "", str(user.get("name") or "TX").upper())
    user_id = str(user.get("_id") or "")
    seed = user_id[-6:].upper() if user_id else datetime.utcnow().strftime("%H%M%S")
    prefix = name[:4] if len(name) >= 3 else "TX"

    return [
        f"TX{prefix}{seed}"[:12],
        f"TX{seed}"[:12],
        f"TX{prefix}{datetime.utcnow().strftime('%M%S')}"[:12],
    ]


def ensure_referral_profile(user):
    profile = find_profile_by_user_id(user.get("_id"))

    if profile:
        return profile

    for code in _generate_candidate_codes(user):
        clean_code = _sanitize_code(code)

        if len(clean_code) < 6:
            continue

        if find_profile_by_code(clean_code):
            continue

        try:
            create_referral_profile({
                "user_id": str(user.get("_id")),
                "referral_code": clean_code,
                "status": "active",
                "reward_rate_percent": DEFAULT_REWARD_RATE_PERCENT,
                "friend_discount_percent": DEFAULT_FRIEND_DISCOUNT_PERCENT,
                "affiliate_max_percent": DEFAULT_AFFILIATE_MAX_PERCENT,
                "total_invites": 0,
                "verified_referrals": 0,
                "reward_balance_usdt": 0.0,
                "total_rewards_usdt": 0.0,
            })
            return find_profile_by_user_id(user.get("_id"))
        except DuplicateKeyError:
            continue

    # Last fallback with timestamp suffix. This path should rarely run.
    fallback_code = _sanitize_code(f"TX{str(user.get('_id'))[-4:]}{datetime.utcnow().strftime('%S%f')}")[:12]
    create_referral_profile({
        "user_id": str(user.get("_id")),
        "referral_code": fallback_code,
        "status": "active",
        "reward_rate_percent": DEFAULT_REWARD_RATE_PERCENT,
        "friend_discount_percent": DEFAULT_FRIEND_DISCOUNT_PERCENT,
        "affiliate_max_percent": DEFAULT_AFFILIATE_MAX_PERCENT,
        "total_invites": 0,
        "verified_referrals": 0,
        "reward_balance_usdt": 0.0,
        "total_rewards_usdt": 0.0,
    })
    return find_profile_by_user_id(user.get("_id"))


def get_referral_dashboard(user):
    profile = ensure_referral_profile(user)
    user_id = str(user.get("_id"))

    total_invites = count_relationships_for_referrer(user_id)
    verified_referrals = count_verified_relationships_for_referrer(user_id)

    if int(profile.get("total_invites", 0)) != total_invites or int(profile.get("verified_referrals", 0)) != verified_referrals:
        update_referral_profile(
            profile["_id"],
            {
                "total_invites": total_invites,
                "verified_referrals": verified_referrals,
            }
        )
        profile = find_profile_by_user_id(user_id)

    recent_referrals = [
        format_relationship(item)
        for item in get_relationships_for_referrer(user_id, limit=10)
    ]

    latest_application = find_latest_affiliate_application(user_id)

    return {
        "success": True,
        "message": "Referral dashboard fetched successfully.",
        "data": {
            "profile": format_referral_profile(profile),
            "recent_referrals": recent_referrals,
            "latest_affiliate_application": format_affiliate_application(latest_application),
            "policy": {
                "currency": "USDT",
                "reward_source": "Eligible trading fees only",
                "payout_mode": "Ledger credit after company reward settlement rules",
                "kyc_required_for_rewards": True,
                "manual_admin_panel_required": False,
            }
        },
        "status_code": 200,
    }


def validate_referral_code(code):
    clean_code = _sanitize_code(code)

    if len(clean_code) < 6:
        return {
            "success": False,
            "message": "Invalid referral code.",
            "errors": {"referral_code": "Referral code must be at least 6 valid characters."},
            "status_code": 422,
        }

    profile = find_profile_by_code(clean_code)

    if not profile or profile.get("status") != "active":
        return {
            "success": False,
            "message": "Referral code not found or inactive.",
            "errors": {"referral_code": "Please check the referral code."},
            "status_code": 404,
        }

    referrer = find_user_by_id(profile.get("user_id"))

    return {
        "success": True,
        "message": "Referral code is valid.",
        "data": {
            "referral_code": clean_code,
            "referrer_name": referrer.get("name", "TraidiumX trader") if referrer else "TraidiumX trader",
            "friend_discount_percent": float(profile.get("friend_discount_percent", DEFAULT_FRIEND_DISCOUNT_PERCENT)),
        },
        "status_code": 200,
    }


def record_referral_registration(referral_code, referred_user_id):
    referred_user = find_user_by_id(referred_user_id)
    if not referred_user:
        return None
    return attach_referral_to_registered_user(referral_code, referred_user)


def attach_referral_to_registered_user(referral_code, referred_user):
    clean_code = _sanitize_code(referral_code)

    if not clean_code:
        return None

    profile = find_profile_by_code(clean_code)

    if not profile or profile.get("status") != "active":
        return None

    referrer_user_id = str(profile.get("user_id"))
    referred_user_id = str(referred_user.get("_id"))

    if referrer_user_id == referred_user_id:
        return None

    if find_relationship_by_referred_user_id(referred_user_id):
        return None

    try:
        create_referral_relationship({
            "referrer_user_id": referrer_user_id,
            "referred_user_id": referred_user_id,
            "referral_code": clean_code,
            "status": RELATION_STATUS_REGISTERED,
            "referred_user_name": sanitize_text(referred_user.get("name", "Trader")),
            "referred_user_email_masked": _mask_email(referred_user.get("email")),
            "reward_rate_percent": float(profile.get("reward_rate_percent", DEFAULT_REWARD_RATE_PERCENT)),
            "friend_discount_percent": float(profile.get("friend_discount_percent", DEFAULT_FRIEND_DISCOUNT_PERCENT)),
        })
    except DuplicateKeyError:
        return None

    # Keep profile counters in sync without awarding money at registration time.
    return get_referral_dashboard({"_id": referrer_user_id})


def submit_affiliate_application(user, data):
    name = sanitize_text(clean_string(data.get("name")))
    email = clean_string(data.get("email")).lower()
    audience = sanitize_text(clean_string(data.get("audience")))
    platform = sanitize_text(clean_string(data.get("platform")))

    errors = {}

    is_valid_name, name_error = validate_name(name)
    if not is_valid_name:
        errors["name"] = name_error

    is_valid_email, email_error = validate_email_address(email)
    if not is_valid_email:
        errors["email"] = email_error

    allowed_audiences = ["1K - 10K", "10K - 50K", "50K - 100K", "100K+"]
    if audience not in allowed_audiences:
        errors["audience"] = "Please select a valid community size."

    if len(platform) < 2 or len(platform) > 80:
        errors["platform"] = "Main platform must be between 2 and 80 characters."

    if errors:
        return {
            "success": False,
            "message": "Validation failed.",
            "errors": errors,
            "status_code": 422,
        }

    latest = find_latest_affiliate_application(user.get("_id"))
    if latest and latest.get("status") == AFFILIATE_STATUS_SUBMITTED:
        return {
            "success": False,
            "message": "Affiliate application already submitted.",
            "errors": {
                "application": "Your latest affiliate application is already pending review."
            },
            "status_code": 409,
        }

    profile = ensure_referral_profile(user)

    application_id = create_affiliate_application({
        "user_id": str(user.get("_id")),
        "referral_profile_id": str(profile.get("_id")),
        "name": name,
        "email": email,
        "audience": audience,
        "platform": platform,
        "requested_max_commission_percent": DEFAULT_AFFILIATE_MAX_PERCENT,
    })

    application = find_latest_affiliate_application(user.get("_id"))

    return {
        "success": True,
        "message": "Affiliate application submitted successfully.",
        "data": {
            "application_id": str(application_id),
            "application": format_affiliate_application(application),
        },
        "status_code": 201,
    }

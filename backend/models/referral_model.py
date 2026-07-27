from config.database import get_database
from utils.date_helper import now_utc


REFERRAL_STATUS_ACTIVE = "active"
AFFILIATE_STATUS_SUBMITTED = "submitted"
RELATION_STATUS_REGISTERED = "registered"


def get_referral_profiles_collection():
    return get_database().referral_profiles


def get_referral_relationships_collection():
    return get_database().referral_relationships


def get_affiliate_applications_collection():
    return get_database().affiliate_applications


def find_profile_by_user_id(user_id):
    return get_referral_profiles_collection().find_one({
        "user_id": str(user_id)
    })


def find_profile_by_code(code):
    return get_referral_profiles_collection().find_one({
        "referral_code": str(code or "").strip().upper()
    })


def create_referral_profile(profile_data):
    profile_data["created_at"] = now_utc()
    profile_data["updated_at"] = now_utc()

    result = get_referral_profiles_collection().insert_one(profile_data)
    return result.inserted_id


def update_referral_profile(profile_id, update_data):
    update_data["updated_at"] = now_utc()

    get_referral_profiles_collection().update_one(
        {"_id": profile_id},
        {"$set": update_data}
    )


def increment_referral_stats(user_id, invites_delta=0, verified_delta=0, rewards_delta=0.0):
    update = {
        "$inc": {
            "total_invites": int(invites_delta or 0),
            "verified_referrals": int(verified_delta or 0),
            "total_rewards_usdt": float(rewards_delta or 0.0),
            "reward_balance_usdt": float(rewards_delta or 0.0),
        },
        "$set": {
            "updated_at": now_utc()
        }
    }

    get_referral_profiles_collection().update_one({"user_id": str(user_id)}, update)


def create_referral_relationship(relationship_data):
    relationship_data["created_at"] = now_utc()
    relationship_data["updated_at"] = now_utc()

    result = get_referral_relationships_collection().insert_one(relationship_data)
    return result.inserted_id


def find_relationship_by_referred_user_id(user_id):
    return get_referral_relationships_collection().find_one({
        "referred_user_id": str(user_id)
    })


def get_relationships_for_referrer(user_id, limit=10):
    return list(
        get_referral_relationships_collection()
        .find({"referrer_user_id": str(user_id)})
        .sort("created_at", -1)
        .limit(int(limit or 10))
    )


def count_relationships_for_referrer(user_id):
    return get_referral_relationships_collection().count_documents({
        "referrer_user_id": str(user_id)
    })


def count_verified_relationships_for_referrer(user_id):
    return get_referral_relationships_collection().count_documents({
        "referrer_user_id": str(user_id),
        "status": {"$in": ["verified", "trading", "rewarded"]}
    })


def create_affiliate_application(application_data):
    application_data["status"] = AFFILIATE_STATUS_SUBMITTED
    application_data["created_at"] = now_utc()
    application_data["updated_at"] = now_utc()

    result = get_affiliate_applications_collection().insert_one(application_data)
    return result.inserted_id


def find_latest_affiliate_application(user_id):
    return get_affiliate_applications_collection().find_one(
        {"user_id": str(user_id)},
        sort=[("created_at", -1)]
    )


def format_referral_profile(profile):
    if not profile:
        return None

    return {
        "id": str(profile.get("_id")),
        "user_id": profile.get("user_id"),
        "referral_code": profile.get("referral_code"),
        "status": profile.get("status", REFERRAL_STATUS_ACTIVE),
        "reward_rate_percent": float(profile.get("reward_rate_percent", 20)),
        "friend_discount_percent": float(profile.get("friend_discount_percent", 10)),
        "affiliate_max_percent": float(profile.get("affiliate_max_percent", 60)),
        "total_invites": int(profile.get("total_invites", 0)),
        "verified_referrals": int(profile.get("verified_referrals", 0)),
        "reward_balance_usdt": float(profile.get("reward_balance_usdt", 0.0)),
        "total_rewards_usdt": float(profile.get("total_rewards_usdt", 0.0)),
        "created_at": profile.get("created_at").isoformat() if profile.get("created_at") else None,
        "updated_at": profile.get("updated_at").isoformat() if profile.get("updated_at") else None,
    }


def format_relationship(item):
    if not item:
        return None

    return {
        "id": str(item.get("_id")),
        "referral_code": item.get("referral_code"),
        "status": item.get("status", RELATION_STATUS_REGISTERED),
        "referred_user_name": item.get("referred_user_name", "Trader"),
        "referred_user_email_masked": item.get("referred_user_email_masked", ""),
        "created_at": item.get("created_at").isoformat() if item.get("created_at") else None,
    }


def format_affiliate_application(application):
    if not application:
        return None

    return {
        "id": str(application.get("_id")),
        "name": application.get("name", ""),
        "email": application.get("email", ""),
        "audience": application.get("audience", ""),
        "platform": application.get("platform", ""),
        "status": application.get("status", AFFILIATE_STATUS_SUBMITTED),
        "created_at": application.get("created_at").isoformat() if application.get("created_at") else None,
    }

import sys
import types
import unittest

# Stub models/modules to avoid MongoDB dependencies
pymongo = types.ModuleType("pymongo")
pymongo.errors = types.ModuleType("pymongo.errors")
class DuplicateKeyError(Exception):
    pass
pymongo.errors.DuplicateKeyError = DuplicateKeyError
sys.modules.setdefault("pymongo", pymongo)
sys.modules.setdefault("pymongo.errors", pymongo.errors)

config_db = types.ModuleType("config.database")
config_db.get_database = lambda: None
sys.modules.setdefault("config.database", config_db)

user_model = types.ModuleType("models.user_model")
USER_DB = {}
user_model.find_user_by_id = lambda uid: USER_DB.get(uid)
sys.modules.setdefault("models.user_model", user_model)

referral_model = types.ModuleType("models.referral_model")
PROFILES_BY_CODE = {}
PROFILES_BY_USER = {}
RELATIONSHIPS = []
APPLICATIONS = {}

referral_model.AFFILIATE_STATUS_SUBMITTED = "submitted"
referral_model.RELATION_STATUS_REGISTERED = "registered"

referral_model.find_profile_by_code = lambda code: PROFILES_BY_CODE.get(code)
referral_model.find_profile_by_user_id = lambda uid: PROFILES_BY_USER.get(uid)
referral_model.create_referral_profile = lambda data: PROFILES_BY_USER.update({data["user_id"]: data}) or PROFILES_BY_CODE.update({data["referral_code"]: data})
referral_model.create_referral_relationship = lambda data: RELATIONSHIPS.append(data)
referral_model.find_relationship_by_referred_user_id = lambda uid: next((r for r in RELATIONSHIPS if r["referred_user_id"] == uid), None)
referral_model.count_relationships_for_referrer = lambda uid: len([r for r in RELATIONSHIPS if r["referrer_user_id"] == uid])
referral_model.count_verified_relationships_for_referrer = lambda uid: len([r for r in RELATIONSHIPS if r["referrer_user_id"] == uid and r.get("status") == "verified"])
referral_model.get_relationships_for_referrer = lambda uid, limit=10: [r for r in RELATIONSHIPS if r["referrer_user_id"] == uid][:limit]
referral_model.find_latest_affiliate_application = lambda uid: APPLICATIONS.get(uid)
referral_model.format_referral_profile = lambda p: p
referral_model.format_relationship = lambda r: r
referral_model.format_affiliate_application = lambda a: a
referral_model.update_referral_profile = lambda pid, data: None
referral_model.create_affiliate_application = lambda data: None

sys.modules.setdefault("models.referral_model", referral_model)

from services.referral_service import record_referral_registration, validate_referral_code


class ReferralServiceTests(unittest.TestCase):
    def setUp(self):
        USER_DB.clear()
        PROFILES_BY_CODE.clear()
        PROFILES_BY_USER.clear()
        RELATIONSHIPS.clear()
        APPLICATIONS.clear()

    def test_record_referral_registration_success(self):
        # Setup referrer profile
        referrer = {"_id": "referrer123", "name": "Alice Cooper"}
        PROFILES_BY_CODE["ALICE123"] = {
            "_id": "profile123",
            "user_id": "referrer123",
            "referral_code": "ALICE123",
            "status": "active",
            "reward_rate_percent": 20.0,
            "friend_discount_percent": 10.0
        }
        PROFILES_BY_USER["referrer123"] = PROFILES_BY_CODE["ALICE123"]

        # Setup referred user
        referred = {"_id": "referred456", "name": "Bob Smith", "email": "bob@example.com"}
        USER_DB["referred456"] = referred

        # Record registration
        result = record_referral_registration("ALICE123", "referred456")
        self.assertIsNotNone(result)
        self.assertEqual(len(RELATIONSHIPS), 1)
        self.assertEqual(RELATIONSHIPS[0]["referrer_user_id"], "referrer123")
        self.assertEqual(RELATIONSHIPS[0]["referred_user_id"], "referred456")
        self.assertEqual(RELATIONSHIPS[0]["referral_code"], "ALICE123")

    def test_record_referral_registration_invalid_code(self):
        # Setup referred user
        referred = {"_id": "referred456", "name": "Bob Smith", "email": "bob@example.com"}
        USER_DB["referred456"] = referred

        result = record_referral_registration("INVALID_CODE", "referred456")
        self.assertIsNone(result)
        self.assertEqual(len(RELATIONSHIPS), 0)

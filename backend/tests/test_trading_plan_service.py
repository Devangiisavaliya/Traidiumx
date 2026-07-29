import sys
import types
import unittest
from datetime import datetime, timezone

# Pure unit-test stubs keep these plan calculations testable without requiring a
# live MongoDB/pymongo installation in the build container.
bson = types.ModuleType("bson")
bson.ObjectId = lambda value: value
sys.modules.setdefault("bson", bson)

database = types.ModuleType("config.database")
database.get_database = lambda: None
sys.modules.setdefault("config.database", database)

wallet_model = types.ModuleType("models.wallet_model")
wallet_model.find_wallet_by_user_id = lambda _user_id: {}
wallet_model.normalize_wallet_currency = lambda wallet: wallet or {}
sys.modules.setdefault("models.wallet_model", wallet_model)

system_settings = types.ModuleType("services.system_settings_service")
system_settings.get_runtime_system_settings = lambda: {}
sys.modules.setdefault("services.system_settings_service", system_settings)

date_helper = types.ModuleType("utils.date_helper")
date_helper.now_utc = lambda: datetime.now(timezone.utc)
sys.modules.setdefault("utils.date_helper", date_helper)

from services.trading_plan_service import apply_plan_spread_to_price, calculate_active_plan


PLANS = {
    "basic": {"minimum_balance": 0.0, "spread_type": "fixed", "spread_value": 18.0},
    "standard": {"minimum_balance": 2000.0, "spread_type": "fixed", "spread_value": 12.0},
    "advanced": {"minimum_balance": 5000.0, "spread_type": "fixed", "spread_value": 5.0},
}


class TradingPlanServiceTests(unittest.TestCase):
    def test_advanced_is_active_at_minimum(self):
        self.assertEqual(calculate_active_plan("advanced", 5000, PLANS), ("advanced", False))

    def test_advanced_auto_downgrades_to_standard(self):
        self.assertEqual(calculate_active_plan("advanced", 4999.99, PLANS), ("standard", False))

    def test_standard_auto_downgrades_to_basic(self):
        self.assertEqual(calculate_active_plan("standard", 1999.99, PLANS), ("basic", False))

    def test_basic_can_require_funding(self):
        plans = {**PLANS, "basic": {"minimum_balance": 500.0, "spread_type": "fixed", "spread_value": 18.0}}
        self.assertEqual(calculate_active_plan("advanced", 499.99, plans), ("basic", True))

    def test_xau_basic_spread_is_applied_in_full_at_entry(self):
        buy = apply_plan_spread_to_price("test", "XAUUSD", "buy", 2350, locked_plan="basic", locked_spread_pips=18)
        sell = apply_plan_spread_to_price("test", "XAUUSD", "sell", 2350, locked_plan="basic", locked_spread_pips=18)
        self.assertEqual(buy["price"], 2350.18)
        self.assertEqual(sell["price"], 2349.82)
        self.assertEqual(buy["spread_price"], 0.18)

    def test_xau_percentage_spread_applied_at_entry(self):
        buy = apply_plan_spread_to_price(
            "test", "XAUUSD", "buy", 2350, 
            locked_plan="standard", locked_spread_pips=0.5, locked_spread_type="percentage"
        )
        sell = apply_plan_spread_to_price(
            "test", "XAUUSD", "sell", 2350, 
            locked_plan="standard", locked_spread_pips=0.5, locked_spread_type="percentage"
        )
        self.assertEqual(buy["price"], 2361.75)
        self.assertEqual(sell["price"], 2338.25)
        self.assertEqual(buy["spread_price"], 11.75)

    def test_btc_percentage_spread_applied_at_entry(self):
        buy = apply_plan_spread_to_price(
            "test", "BTCUSDT", "buy", 60000, 
            locked_plan="standard", locked_spread_pips=0.5, locked_spread_type="percentage"
        )
        sell = apply_plan_spread_to_price(
            "test", "BTCUSDT", "sell", 60000, 
            locked_plan="standard", locked_spread_pips=0.5, locked_spread_type="percentage"
        )
        self.assertEqual(buy["price"], 60300.0)
        self.assertEqual(sell["price"], 59700.0)
        self.assertEqual(buy["spread_price"], 300.0)

    def test_admin_customized_plan_settings(self):
        import sys
        trading_plan_service = sys.modules.get("services.trading_plan_service")
        original = trading_plan_service.get_runtime_system_settings
        try:
            trading_plan_service.get_runtime_system_settings = lambda: {
                "standard_plan_spread_type": "percentage",
                "standard_plan_spread_value": 0.75,
                "standard_plan_minimum_balance": 1500.0
            }
            from services.trading_plan_service import get_plan_settings
            settings = get_plan_settings()
            self.assertEqual(settings["standard"]["spread_type"], "percentage")
            self.assertEqual(settings["standard"]["spread_value"], 0.75)
            self.assertEqual(settings["standard"]["minimum_balance"], 1500.0)
        finally:
            trading_plan_service.get_runtime_system_settings = original


if __name__ == "__main__":
    unittest.main()

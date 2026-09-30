import sys
import os

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from config.database import get_database
from bson import ObjectId

def reset_all_real_balances_to_zero():
    db = get_database()
    
    # 1. Identify Demo users to protect
    demo_users = set()
    for u in db.users.find({"$or": [{"is_demo": True}, {"name": {"$regex": "demo", "$options": "i"}}]}):
        demo_users.add(str(u["_id"]))
    
    print(f"Preserving Demo accounts: {demo_users}")
    
    # 2. Reset all non-demo wallets
    all_wallets = list(db.wallets.find())
    reset_count = 0
    
    for w in all_wallets:
        uid = str(w.get("user_id", ""))
        if uid in demo_users:
            continue
            
        update_fields = {
            "available_balance": 0.0,
            "locked_balance": 0.0,
            "total_balance": 0.0
        }
        
        # Reset all currency sub-wallets (main_wallet, trading_wallet, main_wallet_usdt, etc.)
        for k, v in w.items():
            if isinstance(v, dict) and ("available_balance" in v or "total_balance" in v):
                update_fields[f"{k}.available_balance"] = 0.0
                update_fields[f"{k}.locked_balance"] = 0.0
                update_fields[f"{k}.total_balance"] = 0.0
                
        db.wallets.update_one({"_id": w["_id"]}, {"$set": update_fields})
        reset_count += 1
        
    # 3. Also reset non-demo MT5 accounts balance to 0.0
    mt5_count = 0
    for mt in db.mt5_accounts.find():
        uid = str(mt.get("user_id", ""))
        if uid in demo_users:
            continue
        db.mt5_accounts.update_one({"_id": mt["_id"]}, {"$set": {"balance": 0.0, "equity": 0.0, "margin": 0.0, "free_margin": 0.0}})
        mt5_count += 1

    print(f"Done! Successfully reset {reset_count} wallets and {mt5_count} MT5 accounts to 0.00 balance.")

if __name__ == "__main__":
    reset_all_real_balances_to_zero()

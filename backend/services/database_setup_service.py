from config.database import get_database


REQUIRED_COLLECTIONS = [
    "users",
    "kyc_requests",
    "wallets",
    "wallet_ledger",
    "deposits",
    "withdrawals",
    "orders",
    "positions",
    "trades",
    "futures_recent_symbols",
    "market_symbols",
    "option_orders",
    "option_positions",
    "option_fills",
    "mt5_accounts",
    "mt5_password_setup_tokens",
    "support_tickets"
]


def create_required_collections():
    db = get_database()

    existing_collections = db.list_collection_names()
    created_collections = []

    for collection_name in REQUIRED_COLLECTIONS:
        if collection_name not in existing_collections:
            db.create_collection(collection_name)
            created_collections.append(collection_name)

    create_indexes(db)

    return {
        "database": db.name,
        "created_collections": created_collections,
        "existing_collections": db.list_collection_names(),
        "message": "Required MongoDB collections checked successfully."
    }


def create_indexes(db):
    # Users
    db.users.create_index("email", unique=True)
    db.users.create_index("mobile", unique=True)
    db.users.create_index("google_sub", unique=True, sparse=True)
    db.users.create_index("auth_provider")
    db.users.create_index("created_at")

    # KYC
    db.kyc_requests.create_index("user_id", unique=True)
    db.kyc_requests.create_index("status")

    # Wallet
    db.wallets.create_index("user_id", unique=True)
    db.wallet_ledger.create_index("user_id")
    db.wallet_ledger.create_index("reference_id")
    db.wallet_ledger.create_index("created_at")

    # Deposit / Withdrawal
    db.deposits.create_index("user_id")
    db.deposits.create_index("status")
    db.deposits.create_index("gateway_order_id", unique=True, sparse=True)

    db.withdrawals.create_index("user_id")
    db.withdrawals.create_index("status")

    # Orders / Trades / Positions
    db.orders.create_index("user_id")
    db.orders.create_index("symbol")
    db.orders.create_index("status")
    db.orders.create_index("created_at")
    db.orders.create_index([("user_id", 1), ("status", 1), ("created_at", -1)])

    db.positions.create_index("user_id")
    db.positions.create_index("symbol")
    db.positions.create_index("status")
    db.positions.create_index([("user_id", 1), ("status", 1), ("updated_at", -1)])

    db.trades.create_index("user_id")
    db.trades.create_index("order_id")
    db.trades.create_index("created_at")

    # MT5 account mapping / one-time setup tokens
    db.mt5_accounts.create_index("user_id", unique=True)
    db.mt5_accounts.create_index("login_id", sparse=True)
    db.mt5_accounts.create_index("status")
    db.mt5_password_setup_tokens.create_index("user_id")
    db.mt5_password_setup_tokens.create_index("used")
    db.mt5_password_setup_tokens.create_index("expires_at", expireAfterSeconds=0)

    # User-wise recently viewed Futures symbols. MongoDB TTL removes rows
    # seven days after the most recent view; the compound index prevents duplicates.
    db.futures_recent_symbols.create_index(
        [("user_id", 1), ("symbol", 1)],
        unique=True,
        name="user_symbol_unique",
    )
    db.futures_recent_symbols.create_index(
        "last_viewed_at",
        expireAfterSeconds=7 * 24 * 60 * 60,
        name="last_viewed_at_ttl",
    )
    db.futures_recent_symbols.create_index([("user_id", 1), ("last_viewed_at", -1)])

    # Market symbols
    db.market_symbols.create_index("symbol", unique=True)

    # Options orders / positions / fills
    db.option_orders.create_index("user_id")
    db.option_orders.create_index("contract")
    db.option_orders.create_index("underlying")
    db.option_orders.create_index("status")
    db.option_orders.create_index("created_at")
    db.option_orders.create_index("order_reference", unique=True, sparse=True)

    db.option_positions.create_index("user_id")
    db.option_positions.create_index("contract")
    db.option_positions.create_index("underlying")
    db.option_positions.create_index("status")
    db.option_positions.create_index("updated_at")

    db.option_fills.create_index("user_id")
    db.option_fills.create_index("order_id")
    db.option_fills.create_index("contract")
    db.option_fills.create_index("created_at")
    db.option_fills.create_index("fill_reference", unique=True, sparse=True)

    # Support Tickets
    db.support_tickets.create_index("user_id")
    db.support_tickets.create_index("ticket_id", unique=True)
    db.support_tickets.create_index("created_at")

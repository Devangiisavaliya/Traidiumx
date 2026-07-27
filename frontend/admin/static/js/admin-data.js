"use strict";

window.TX_ADMIN_DATA = {
    stats: {
        totalUsers: 12842,
        activeUsers: 9816,
        pendingKyc: 36,
        pendingWithdrawals: 18,
        openPositions: 417,
        totalWallet: 18420750.72,
        dailyVolume: 527809420.5,
        riskAlerts: 7
    },
    marketTicks: [
        { symbol: "BTCUSDT", price: 64280.42, change: 1.82 },
        { symbol: "ETHUSDT", price: 3562.11, change: -0.41 },
        { symbol: "SOLUSDT", price: 144.72, change: 3.28 },
        { symbol: "BNBUSDT", price: 591.88, change: 0.74 },
        { symbol: "XRPUSDT", price: 0.6184, change: -1.22 },
        { symbol: "DOGEUSDT", price: 0.1282, change: 4.16 }
    ],
    users: [
        { id: "USR-10021", name: "Aarav Shah", email: "aarav@example.com", kyc: "approved", status: "active", wallet: 15240.78, joined: "2026-06-18" },
        { id: "USR-10022", name: "Riya Patel", email: "riya@example.com", kyc: "pending", status: "active", wallet: 4270.00, joined: "2026-06-19" },
        { id: "USR-10023", name: "Kabir Mehta", email: "kabir@example.com", kyc: "review", status: "active", wallet: 92840.31, joined: "2026-06-20" },
        { id: "USR-10024", name: "Neha Desai", email: "neha@example.com", kyc: "rejected", status: "blocked", wallet: 0, joined: "2026-06-21" },
        { id: "USR-10025", name: "Vivaan Joshi", email: "vivaan@example.com", kyc: "approved", status: "active", wallet: 18890.10, joined: "2026-06-22" }
    ],
    withdrawals: [
        { id: "WD-78291", user: "Riya Patel", email: "riya@example.com", method: "Bank", amount: 5000, fee: 25, finalAmount: 4975, asset: "INR", status: "pending", requestedAt: "2026-06-26 10:16", risk: "low", account: "HDFC •••• 2180" },
        { id: "WD-78292", user: "Aarav Shah", email: "aarav@example.com", method: "USDT TRC20", amount: 220, fee: 1, finalAmount: 219, asset: "USDT", status: "pending", requestedAt: "2026-06-26 10:24", risk: "medium", account: "TQ9x...B8e2" },
        { id: "WD-78293", user: "Kabir Mehta", email: "kabir@example.com", method: "Bank", amount: 78000, fee: 100, finalAmount: 77900, asset: "INR", status: "processing", requestedAt: "2026-06-26 10:40", risk: "high", account: "ICICI •••• 7291" },
        { id: "WD-78294", user: "Vivaan Joshi", email: "vivaan@example.com", method: "UPI", amount: 1800, fee: 0, finalAmount: 1800, asset: "INR", status: "approved", requestedAt: "2026-06-25 19:11", risk: "low", account: "vivaan@upi" },
        { id: "WD-78295", user: "Neha Desai", email: "neha@example.com", method: "Bank", amount: 25000, fee: 50, finalAmount: 24950, asset: "INR", status: "rejected", requestedAt: "2026-06-25 17:58", risk: "high", account: "Axis •••• 1091" }
    ],
    ledger: [
        { id: "LG-9001", user: "Riya Patel", type: "withdrawal_lock", amount: -5000, balance: 4270, date: "2026-06-26 10:16", ref: "WD-78291" },
        { id: "LG-9002", user: "Aarav Shah", type: "withdrawal_lock", amount: -220, balance: 15240.78, date: "2026-06-26 10:24", ref: "WD-78292" },
        { id: "LG-9003", user: "Vivaan Joshi", type: "withdrawal_debit", amount: -1800, balance: 18890.10, date: "2026-06-25 19:25", ref: "WD-78294" },
        { id: "LG-9004", user: "Neha Desai", type: "withdrawal_reversal", amount: 25000, balance: 25000, date: "2026-06-25 18:30", ref: "WD-78295" }
    ],
    kyc: [
        { id: "KYC-441", user: "Riya Patel", type: "PAN + Aadhaar", status: "pending", submittedAt: "2026-06-26 09:42", score: 84 },
        { id: "KYC-442", user: "Kabir Mehta", type: "PAN + Bank", status: "review", submittedAt: "2026-06-26 09:56", score: 62 },
        { id: "KYC-443", user: "Aarav Shah", type: "PAN + Aadhaar", status: "approved", submittedAt: "2026-06-25 14:11", score: 96 },
        { id: "KYC-444", user: "Neha Desai", type: "PAN + Aadhaar", status: "rejected", submittedAt: "2026-06-25 11:30", score: 38 }
    ],
    orders: [
        { id: "ORD-8011", user: "Aarav Shah", symbol: "BTCUSDT", side: "buy", type: "market", qty: 0.02, price: 64210.5, status: "completed", date: "2026-06-26 10:20" },
        { id: "ORD-8012", user: "Kabir Mehta", symbol: "ETHUSDT", side: "sell", type: "limit", qty: 1.4, price: 3570.0, status: "pending", date: "2026-06-26 10:21" },
        { id: "ORD-8013", user: "Vivaan Joshi", symbol: "SOLUSDT", side: "buy", type: "stop_market", qty: 8, price: 145.2, status: "processing", date: "2026-06-26 10:28" }
    ],
    positions: [
        { id: "POS-501", user: "Aarav Shah", symbol: "BTCUSDT", side: "long", margin: 600, leverage: "20x", entry: 63880, mark: 64280, pnl: 125.22, risk: "low" },
        { id: "POS-502", user: "Kabir Mehta", symbol: "ETHUSDT", side: "short", margin: 1400, leverage: "25x", entry: 3589, mark: 3562, pnl: 263.4, risk: "medium" },
        { id: "POS-503", user: "Riya Patel", symbol: "SOLUSDT", side: "long", margin: 220, leverage: "15x", entry: 141.4, mark: 144.7, pnl: 77.9, risk: "low" }
    ],
    auditLogs: [
        { id: "AUD-991", admin: "Super Admin", action: "Withdrawal approved", target: "WD-78294", ip: "127.0.0.1", date: "2026-06-25 19:25" },
        { id: "AUD-992", admin: "Finance Admin", action: "KYC moved to review", target: "KYC-442", ip: "127.0.0.1", date: "2026-06-26 09:58" },
        { id: "AUD-993", admin: "Risk Admin", action: "User blocked", target: "USR-10024", ip: "127.0.0.1", date: "2026-06-25 18:29" }
    ]
};

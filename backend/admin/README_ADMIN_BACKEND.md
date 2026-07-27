# TraidiumX Admin Backend Phase 1

Copy this folder into your project:

```txt
backend/admin/
backend/app.py
```

## 1. Install/verify backend dependencies

From `D:\Project\traidiumx\backend`:

```powershell
pip install -r requirements.txt
```

## 2. Create first admin account

From `D:\Project\traidiumx\backend`:

```powershell
python -m admin.seed_admin
```

Default dev login:

```txt
Email: admin@traidiumx.com
Password: Admin@12345
```

For custom credentials, set env values before running seed:

```powershell
$env:ADMIN_SEED_EMAIL="admin@traidiumx.com"
$env:ADMIN_SEED_PASSWORD="Admin@12345"
$env:ADMIN_SEED_NAME="Super Admin"
python -m admin.seed_admin
```

## 3. Run backend

```powershell
python app.py
```

## 4. Test routes

```txt
GET  http://127.0.0.1:5000/api/admin/ping
POST http://127.0.0.1:5000/api/admin/auth/login
GET  http://127.0.0.1:5000/api/admin/auth/me
GET  http://127.0.0.1:5000/api/admin/dashboard/summary
GET  http://127.0.0.1:5000/api/admin/users
GET  http://127.0.0.1:5000/api/admin/kyc
GET  http://127.0.0.1:5000/api/admin/withdrawals?status=pending
POST http://127.0.0.1:5000/api/admin/withdrawals/<withdrawal_id>/approve
POST http://127.0.0.1:5000/api/admin/withdrawals/<withdrawal_id>/reject
GET  http://127.0.0.1:5000/api/admin/wallet/ledger
GET  http://127.0.0.1:5000/api/admin/trading/orders
GET  http://127.0.0.1:5000/api/admin/trading/positions
GET  http://127.0.0.1:5000/api/admin/audit/logs
```

## 5. Login request body

```json
{
  "email": "admin@traidiumx.com",
  "password": "Admin@12345"
}
```

Use returned token:

```txt
Authorization: Bearer <token>
```

## 6. Withdrawal approve body

```json
{
  "payout_reference": "MANUAL-PAYOUT-001",
  "tx_hash": "",
  "remark": "Approved by admin after manual review"
}
```

Approve flow:

- Only pending/pending_payout/queued withdrawal allowed.
- Locked wallet amount is debited from locked balance and total balance.
- Withdrawal status becomes `approved`.
- Admin audit log is saved.

## 7. Withdrawal reject body

```json
{
  "reason": "Invalid destination address"
}
```

Reject flow:

- Only pending/pending_payout/queued withdrawal allowed.
- Locked amount is released back to available balance.
- Withdrawal status becomes `rejected`.
- Admin audit log is saved.

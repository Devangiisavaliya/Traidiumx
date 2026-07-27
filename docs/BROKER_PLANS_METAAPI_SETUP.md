# TraidiumX Broker, Plans and MetaApi Setup

## Implemented user flow

1. User signs up, verifies email and logs in.
2. A mandatory platform popup opens until a platform is saved.
3. User selects **TraidiumX** or **MetaTrader 5**.
4. User selects **Basic**, **Standard** or **Advanced**.
5. The UI shows the selected plan's pip value, minimum balance, current balance and remaining funding.
6. Deposit is allowed without KYC.
7. Trading is allowed without KYC after the selected platform/plan is active.
8. Withdrawal remains blocked until KYC status is approved.

## Default plan configuration

| Plan | Default pip markup | Default minimum balance |
|---|---:|---:|
| Basic | 18 | 100 USDT |
| Standard | 12 | 1,000 USDT |
| Advanced | 5 | 5,000 USDT |

All six values and automatic downgrade can be changed from **Admin > Settings > Broker Platforms & Plans**.

Minimum balances must remain ordered as Basic <= Standard <= Advanced.

## Plan activation and downgrade

### TraidiumX

- Funding eligibility uses combined Main Wallet and Trading Wallet equity.
- The selected plan activates when its minimum is reached.
- A background monitor and wallet/trading hooks re-evaluate equity.
- Automatic upgrades are not performed.
- Advanced can downgrade to Standard, and Standard can downgrade to Basic.
- Existing TraidiumX positions retain the plan/spread stored when they were opened. New trades use the current active plan.

### MetaTrader 5

- Initial funding is reserved from Main Wallet.
- A real MT5 account is created through the configured MetaApi broker integration.
- The required amount is credited through MetaApi Manager API.
- Only after remote funding succeeds is the Main Wallet debit finalized.
- A real Login ID and broker-returned password are used. The application does not make fake MT5 IDs.
- The user receives Login ID, server and a one-time encrypted credentials link by email.
- The temporary password should be changed from the MetaTrader 5 application after first login when the broker server permits it.
- Automatic downgrade changes the MT5 account group through Manager API.

## Required MetaApi access

Automatic account creation, funding and group changes require:

- A MetaApi account token.
- A MetaApi MT Manager provisioning profile connected to the broker's MT5 server.
- Broker/partner Manager access to the MT5 server.
- Three valid MT5 group names for Basic, Standard and Advanced.
- The actual MT5 server name users will select in the MT5 application.

A normal trader MetaApi account that only connects an existing MT5 login cannot create new broker accounts or control their account groups.

## Environment setup

Use `backend/.env.metaapi.example` as the safe reference. Add the real values to `backend/.env`:

```env
APP_PUBLIC_URL=https://your-public-frontend-domain.example
METAAPI_ENABLED=false
METAAPI_TOKEN=YOUR_PRIVATE_TOKEN
METAAPI_ACCOUNT_MODE=manager
METAAPI_PROVISIONING_PROFILE_ID=YOUR_MANAGER_PROFILE_ID
METAAPI_MT5_SERVER_NAME=YOUR_MT5_SERVER
METAAPI_MT5_BASIC_GROUP=YOUR_BASIC_GROUP
METAAPI_MT5_STANDARD_GROUP=YOUR_STANDARD_GROUP
METAAPI_MT5_ADVANCED_GROUP=YOUR_ADVANCED_GROUP
METAAPI_CREDENTIAL_ENCRYPTION_KEY=YOUR_STABLE_FERNET_KEY
```

Generate the encryption key once:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Do not change this encryption key after accounts are being provisioned. Pending encrypted credentials depend on it.

Also configure working SMTP settings. The system deliberately treats email/public URL as part of broker readiness so it does not provision an account while it cannot securely deliver credentials.

Set `METAAPI_ENABLED=true` only after every required value is complete.

## Install and initialize

From the backend virtual environment:

```powershell
pip install -r requirements.txt
python app.py
```

Run the existing development database initialization endpoint once if this deployment has not initialized indexes yet. The new `mt5_credential_tokens` collection receives a unique token index and expiry TTL index.

## KYC policy now enforced

| Action | KYC requirement |
|---|---|
| Deposit | Not required |
| Main/Trading wallet transfer | Not required |
| TraidiumX futures/options trading | Not required |
| Plan selection/activation | Not required |
| MT5 account funding/trading | Not required by TraidiumX flow |
| Withdrawal | Approved KYC required on backend |

The withdrawal check remains server-side, so removing or bypassing a frontend button cannot bypass KYC.

## Operational safety

- Keep the MetaApi token only in backend `.env`; never place it in frontend JavaScript.
- Use HTTPS for `APP_PUBLIC_URL` in production.
- Do not email plain passwords. The implemented link is one-time, expires, and stores its token as a hash.
- MetaApi account provisioning is idempotency-aware: it stores a funding reference and avoids intentionally repeating a completed remote credit.
- Review any `provisioning_failed` account manually before retrying when remote account creation or funding may already have occurred.

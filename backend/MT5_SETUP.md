# TraidiumX MetaTrader 5 setup

The project includes mandatory first-login platform selection, Basic/Standard/Advanced plans, balance-based active-plan calculation, MT5 account state, secure password setup links, existing-account MetaApi import, broker funding hooks and broker group synchronization hooks.

## Important

MetaTrader 5 does not create a broker Login ID by itself. Automatic new-account creation requires an MT5 broker/white-label Manager API. Without that API, TraidiumX keeps the account in `setup_pending` and never generates fake credentials.

## Environment

Copy required values from `.env.mt5.example` into the private `backend/.env` file. Never include the private `.env` file in a shared ZIP.

## Existing MT5 account through MetaApi

Set:

```env
METAAPI_TOKEN=your_metaapi_token
METAAPI_PROVISIONING_URL=https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts
METAAPI_MAGIC=20260716
```

The user enters broker name, server, MT5 Login ID and trading password. TraidiumX sends the credentials directly to the MetaApi Provisioning API and stores only the returned provider account ID/status. The plain trading password is never stored in MongoDB.

MetaApi can return HTTP 202 while broker settings/account connectivity are being detected. TraidiumX saves the transaction ID and retry information rather than claiming the account is already connected.

## New MT5 account

Configure the broker/white-label endpoints:

```env
MT5_PROVISIONING_API_URL=https://broker.example.com/api/mt5/accounts
MT5_PROVISIONING_API_KEY=replace_me
MT5_PASSWORD_API_URL=https://broker.example.com/api/mt5/accounts/password
MT5_GROUP_API_URL=https://broker.example.com/api/mt5/accounts/group
MT5_FUNDING_API_URL=https://broker.example.com/api/mt5/accounts/funding
```

Expected provisioning response:

```json
{
  "login_id": "12345678",
  "server": "TraidiumX-Live",
  "broker_name": "TraidiumX Broker",
  "currency": "USD",
  "provider_account_id": "broker-account-id",
  "balance": 0
}
```

After successful creation, TraidiumX emails the signup address with the MT5 Login ID, server, plan and a one-time secure password-setup link. It does not email a permanent password.

## MT5 funding endpoint contract

`MT5_FUNDING_API_URL` receives:

```json
{
  "operation": "credit",
  "external_user_id": "traidiumx-user-id",
  "provider_account_id": "broker-account-id",
  "login_id": "12345678",
  "server": "TraidiumX-Live",
  "amount": 5000,
  "currency": "USD",
  "reference_id": "MT5F-..."
}
```

The provider should return HTTP 2xx and preferably the new `balance` and `equity`. TraidiumX locks the Trading Wallet amount before the provider call, returns it if the provider rejects the request, and permanently debits it only after a provider success response. KYC is not checked for MT5 funding; KYC remains mandatory only for withdrawal.

## Plan groups

- Basic → `TX-BASIC` → 18 pips by default
- Standard → `TX-STANDARD` → 12 pips by default
- Advanced → `TX-ADVANCED` → 5 pips by default

All spreads and minimum balances are admin configurable. When settled balance changes, TraidiumX updates the active plan. When `MT5_GROUP_API_URL` is configured, it also requests the real broker-side group change. Without that endpoint, the local record is marked `waiting_for_broker_api` rather than claiming the broker spread changed.

## KYC product rule

- Deposit: KYC not required
- Main/Trading Wallet transfer: KYC not required
- TraidiumX trading: KYC not required
- MT5 account creation/import/funding/trading: KYC not required by TraidiumX
- Withdrawal: approved KYC required

An external broker may impose additional compliance rules that TraidiumX cannot override.

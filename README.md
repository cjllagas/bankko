# Bankko - Digital Banking and Payments System (Backend)

ITEC 116 Final Project: Systems Integration Backend Prototype.

Bankko lets account holders open accounts, transfer funds and pay bills online without visiting a branch,
while administrators monitor transactions, freeze accounts and read an audit trail. This repository is the
backend (REST API) designed in Laboratory Activities 03 to 06, plus an optional demo web front end.

## Tech stack

| Component | Technology |
|---|---|
| Backend framework | NestJS 11 (TypeScript) |
| ORM | TypeORM 0.3 |
| Database | MySQL (also runs on MariaDB / XAMPP) |
| Authentication | JWT (HS256) with bcrypt password hashing |
| Validation | class-validator / class-transformer |
| API testing | Postman (collection in `postman/`) |
| Version control | Git and GitHub |

Optional front end: plain HTML/CSS/JavaScript in `public/` (customer page and admin page), served by the same server.

## Features

- **Authentication:** two-step login (password, then a 6-digit code emailed to the account); the JWT is issued only
  after the code is confirmed; every route except login and registration is protected; passwords are
  hashed with bcrypt; all input is validated; accounts lock for 15 minutes after 5 failed logins; logout
  invalidates the token immediately.
- **Email and password changes (verified):** a customer changes their email from the Profile page with their password
  plus a 6-digit code sent to the *new* address; they can also change their own password. An administrator can start a
  password reset (after confirming the customer's email) but never sets or sees the password: the customer receives a
  one-time reset code by email and chooses it themselves. Every change signs the customer out of all devices, is written
  to the audit log, creates an in-app notification and emails the old address.
- **Modules:** Users, Accounts, Billers, Payees, Transactions, Notifications, Audit log.
- **39 REST endpoints** using GET, POST, PUT, PATCH and DELETE with correct status codes (see the table below).
- **Safe money movement:** a transfer or bill payment runs in one database transaction (debit, credit, record,
  notify, audit). Accounts are row-locked, and an `Idempotency-Key` header makes retries safe (a repeated request
  returns the original result instead of paying twice).
- **Authorization:** role checks (Customer / Admin) plus ownership checks, deny by default.

## Run it locally

### 1. Requirements

- Node.js 20 or newer
- MySQL 8 **or** XAMPP (MariaDB). Start it (in XAMPP: start the *MySQL* module).

### 2. Install

```bash
git clone https://github.com/cjllagas/bankko.git
cd bankko
npm install
```

### 3. Configure

```bash
cp .env.example .env        # on Windows: copy .env.example .env
```

Open `.env` and set `DB_PASSWORD` (empty for a default XAMPP root user) and `JWT_SECRET`
(any random string of 32+ characters; generate one with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
The `.env` file is ignored by Git, so your secrets are never committed.

### 4. Create the database

Pick one:

- **Automatic (easiest):** do nothing. In development the app creates the `bankko` database and all tables
  from the TypeORM entities the first time it starts.
- **From the SQL export:** import `database/bankko.sql` (phpMyAdmin: *Import*, or
  `mysql -u root -p < database/bankko.sql`). It contains the schema and the demo data.

Always start from an **empty** database (drop any older `bankko` database first). Use one of the two ways above,
not both on top of each other.

### 5. To create your own administrator: `npm run create-admin`.

### 6. Start the server

```bash
npm run start:dev
```

- API: <http://localhost:3000/api/v1>
- Customer page: <http://localhost:3000/customer>
- Admin page: <http://localhost:3000/admin>

Other scripts: `npm run build`, `npm run start:prod`.

## Testing with Postman

1. Start the API.
2. In Postman choose *Import* and select `postman/Bankko.postman_collection.json`.
3. Run the collection (Collection Runner), or send the requests folder by folder.

The collection holds 65 requests with 84 assertions: login, protected-route rejection (401/403), validation
errors (400), conflicts (409), a full Create-Read-Update-Delete sequence for Billers and Payees, transfers,
idempotent retries, admin review, notifications, audit log and logout. Tokens and IDs are saved automatically
between requests.

## Architecture

```
Client (Postman / browser)
   -> Controller   receives the HTTP request, checks the JWT and role, validates the body (DTO)
   -> Service      business rules: ownership, balance checks, transactions, audit, notifications
   -> Repository   TypeORM repositories / entities
   -> MySQL
Response travels back: Repository -> Service -> Controller -> JSON
```

```
src/
  main.ts                 bootstrap: global prefix, validation pipe, error filter, security headers
  app.module.ts           root module
  config.ts               reads .env
  database/               TypeORM connection (MySQL/MariaDB detection) and column naming
  entities/               9 TypeORM entities (User, Admin, Account, Biller, Payee, Transaction,
                          Notification, Audit_Log, Token_Denylist)
  auth/                   login, logout, global JwtAuthGuard
  users/ accounts/ billers/ payees/ transactions/ notifications/ audit/
                          controller + service + DTOs per module
  common/                 error filter, validators, paging, JSON mappers
  core/                   AuditService, AccessService (ownership rules)
  scripts/                seed.ts, create-admin.ts
public/                   optional demo front end
database/bankko.sql       SQL export
postman/                  Postman collection
```

### Database design

| Table | Purpose | Relationships |
|---|---|---|
| User | customers (`Token_Version` signs out all devices) | 1 to many Account, 1 to many Notification, 1 to many Credential_Request |
| Admin | staff | 1 to many Transaction (reviewed) |
| Account | bank accounts and balances | many to 1 User |
| Biller | companies that can be paid | 1 to many Payee |
| Payee | a customer's saved biller | many to 1 Account, many to 1 Biller |
| Transaction | transfers and bill payments | many to 1 Account (source), optional Account (destination), optional Payee, optional Admin |
| Notification | SMS/email records | many to 1 User, optional Transaction |
| Audit_Log | append-only record of actions | - |
| Token_Denylist | logged-out JWTs | - |
| Login_Challenge | pending two-step logins (hashed code, expiry, attempts) | - |
| Credential_Request | pending email changes and admin-started password resets (hashed code/token, expiry, single use) | many to 1 User, optional Admin (who started a reset) |

## Endpoints

All paths start with `/api/v1`. Everything except the public routes (login, verify, resend, register) needs `Authorization: Bearer <token>`.

| # | Method and path | Who | Description |
|---|---|---|---|
| 1 | POST `/auth/sessions` | public | Step 1: email + password. Returns `challengeId` (code emailed) or, with `OTP_ENABLED=false`, the JWT |
| 2 | POST `/auth/sessions/verify` | public | Step 2: `challengeId` + 6-digit code, returns the JWT |
| 30 | POST `/auth/sessions/resend` | public | Send a new code for the pending login (60 s cooldown, max 3) |
| 29 | DELETE `/auth/sessions/current` | any | Log out |
| 3 | POST `/users` | public | Register a customer |
| 4 | GET `/users` | admin | List customers (paging, sort, filter) |
| 5 | GET `/users/:userId` | owner, admin | Read a profile |
| 6 | PATCH `/users/:userId` | owner, admin | Update a profile (name, mobile number; not email or password) |
| 34 | POST `/users/:userId/email-change` | owner | Change email, step 1: new Gmail address + current password; a code is sent to the new address |
| 35 | POST `/users/:userId/email-change/verify` | owner | Change email, step 2: `requestId` + 6-digit code; the email changes and all sessions end |
| 36 | PATCH `/users/:userId/password` | owner | Change own password (current + new); all sessions end |
| 37 | POST `/users/:userId/password-reset` | admin | Start a reset: confirm the customer's `email`; the customer receives a one-time token by email |
| 38 | POST `/auth/password-reset/confirm` | public | Customer sets a new password with the emailed token (single use, 30 minutes) |
| 11 | GET `/users/:userId/accounts` | owner, admin | List a user's accounts |
| 28 | GET `/users/:userId/notifications` | owner, admin | List notifications |
| 7 | POST `/accounts` | customer | Open an account |
| 8 | GET `/accounts` | admin | List accounts |
| 31 | GET `/accounts/lookup?accountNumber=` | customer | Find a transfer recipient (masked) |
| 9 | GET `/accounts/:accountId` | owner, admin | Read an account |
| 10 | PATCH `/accounts/:accountId` | admin | Freeze, reactivate or deactivate |
| 25 | GET `/accounts/:accountId/transactions` | owner, admin | Account history |
| 20 | GET `/accounts/:accountId/payees` | owner, admin | Saved payees |
| 12 | GET `/billers` | any | List billers |
| 13 | GET `/billers/:billerId` | any | Read a biller |
| 14 | POST `/billers` | admin | Create a biller |
| 15 | PUT `/billers/:billerId` | admin | Replace a biller |
| 33 | DELETE `/billers/:billerId` | admin | Delete an unused biller (409 if payees exist) |
| 16 | POST `/payees` | customer | Save a payee |
| 17 | GET `/payees/:payeeId` | owner, admin | Read a payee |
| 18 | PATCH `/payees/:payeeId` | customer | Rename a payee |
| 19 | DELETE `/payees/:payeeId` | customer | Remove a payee (soft delete) |
| 21 | POST `/transactions` | customer | Transfer or bill payment (needs `Idempotency-Key`) |
| 22 | GET `/transactions` | admin | List all transactions |
| 23 | GET `/transactions/:transactionId` | owner, receiver, admin | Read a transaction |
| 26 | GET `/transactions/:transactionId/receipt` | owner, receiver, admin | Receipt |
| 24 | PATCH `/transactions/:transactionId` | admin | Flag or clear for review |
| 27 | GET `/notifications/:notificationId` | owner, admin | Read a notification |
| 32 | GET `/audit-logs` | admin | Read the audit log |
| - | GET `/admin/summary` | admin | Dashboard counters |

Error body (all errors): `{ "success": false, "statusCode": 400, "message": "...", "errors": ["..."], "timestamp": "..." }`

### Example: log in (two steps), then call a protected route

```bash
# Step 1 - password. The server emails a 6-digit code (in development without SMTP it is printed in the server console).
curl -X POST http://localhost:3000/api/v1/auth/sessions \
  -H "Content-Type: application/json" \
  -d '{"email":"juan.delacruz@email.com","password":"<demo-password>"}'
# -> { "verificationRequired": true, "challengeId": "5f3c...", "role": "Customer", "sentTo": "j***@email.com", "expiresInSeconds": 300, "resendAfterSeconds": 60 }

# Step 2 - the code
curl -X POST http://localhost:3000/api/v1/auth/sessions/verify \
  -H "Content-Type: application/json" \
  -d '{"challengeId":"5f3c...","code":"123456"}'
# -> { "accessToken": "eyJ...", "tokenType": "Bearer", "expiresInSeconds": 1800, "userId": 1, "role": "Customer", ... }

curl http://localhost:3000/api/v1/users/1/accounts -H "Authorization: Bearer <accessToken>"
```

### Verification code settings (`.env`)

| Setting | Meaning |
|---|---|
| `OTP_ENABLED` | `true` (default) = two-step login. `false` = password only; use it only for automated Postman runs |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Optional. When set, the code is emailed (Gmail: `smtp.gmail.com`, 587, an App Password). When empty in development, the code is printed in the server console. In production, no SMTP means login fails with 503 |

**Demo mode:** set `DEMO_SHOW_CODE=true` in your local `.env` to also return the code as `demoCode` in the login and resend responses. The login pages then show it in a "DEMO MODE" box with a "Fill it in" button, and the Postman login requests fill `adminCode` / `customerCode` automatically. It is for demonstrations only: it is off by default, prints a warning at startup, and the server refuses to start with it when `NODE_ENV=production`.

A code is 6 digits, valid 5 minutes, usable once, and dies after 3 wrong tries (which also count toward the account lockout). Only a keyed hash of the code is stored.

## Security measures

- bcrypt password hashing (cost 10); passwords need 12+ characters and are never returned by the API.
- JWT signed with HS256, 30-minute expiry, issuer checked, other algorithms rejected; logout adds the token ID to a denylist.
- Global guard: all routes are protected unless explicitly marked public; role (403) and ownership checks in the services.
- Whitelisted DTO validation (unknown fields are dropped, so a client cannot set its own `userId` or `balance`).
- Parameterised queries through TypeORM; sort fields come from a whitelist.
- Two-step login: emailed one-time code (CSPRNG, hashed at rest, 5-minute expiry, single use, 3 attempts, resend cooldown).
- Registration and email changes accept only `@gmail.com` addresses (6-30 letters, digits or dots, no `+` aliases); login still accepts older addresses.
- Email change: password re-check, code sent to the new address (hashed, 10-minute expiry, single use, 3 attempts, 60 s cooldown), notice to the old address. Password reset: admin-started, 256-bit random token stored only as a SHA-256 hash, 30-minute expiry, single use; the admin never learns the password.
- Changing the email or password raises `user.Token_Version`, so every earlier JWT is rejected at once (no timing window). Wrong current-password guesses count toward the account lockout.
- Login rate limiting and account lockout; identical error for unknown email and wrong password.
- Strict security headers and Content-Security-Policy; secrets only in `.env` (ignored by Git).

## Changes from the Lab 05 design

- The one-time-code login (#2) is delivered by **email** instead of SMS, with a resend endpoint (#30). The large-transfer
  step-up from the lab design is not part of this build.
- Added `DELETE /billers/:billerId` (#33), `GET /admin/summary`, and `POST /auth/sessions/resend` (#30).
- Added verified email change (#34, #35), customer password change (#36) and the admin-started password reset (#37, #38) with the `credential_request` table. Existing databases: run `database/migrations/2026-11-26_email-change-password-reset.sql` (or just restart with `DB_SYNC=true`).

## Notes

- Table names are lowercase (`user`, `account`, `audit_log`, ...). Windows/XAMPP always lowercases table names, and
  TypeORM's schema sync fails if the entity names do not match, so the entities use lowercase names everywhere.
- `DB_SYNC=true` (the default in development) lets TypeORM keep tables in line with the entities. Set it to
  `false` in production and manage the schema with migrations.
- The SMS and payment-gateway calls are stubs (`callGateway` in `transactions.service.ts`; notifications are
  stored in the database).

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

- **Authentication:** login returns a JWT; every route except login and registration is protected; passwords are
  hashed with bcrypt; all input is validated; accounts lock for 15 minutes after 5 failed logins; logout
  invalidates the token immediately.
- **Modules:** Users, Accounts, Billers, Payees, Transactions, Notifications, Audit log.
- **32 REST endpoints** using GET, POST, PUT, PATCH and DELETE with correct status codes (see the table below).
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

### 5. Load demo data (skip if you imported the SQL file)

```bash
npm run seed
```

Demo logins (password for all: `Bankko#Demo2026` - local testing only):

| Role | Email |
|---|---|
| Admin | ana.reyes@bankko.example |
| Customer | juan.delacruz@email.com |
| Customer | maria.santos@email.com |
| Customer | pedro.garcia@email.com |

To create your own administrator: `npm run create-admin`.

### 6. Start the server

```bash
npm run start:dev
```

- API: <http://localhost:3000/api/v1>
- Customer page: <http://localhost:3000/customer>
- Admin page: <http://localhost:3000/admin>

Other scripts: `npm run build`, `npm run start:prod`.

## Testing with Postman

1. Start the API and load the demo data (`npm run seed`).
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
| User | customers | 1 to many Account, 1 to many Notification |
| Admin | staff | 1 to many Transaction (reviewed) |
| Account | bank accounts and balances | many to 1 User |
| Biller | companies that can be paid | 1 to many Payee |
| Payee | a customer's saved biller | many to 1 Account, many to 1 Biller |
| Transaction | transfers and bill payments | many to 1 Account (source), optional Account (destination), optional Payee, optional Admin |
| Notification | SMS/email records | many to 1 User, optional Transaction |
| Audit_Log | append-only record of actions | - |
| Token_Denylist | logged-out JWTs | - |

## Endpoints

All paths start with `/api/v1`. Everything except the two public routes needs `Authorization: Bearer <token>`.

| # | Method and path | Who | Description |
|---|---|---|---|
| 1 | POST `/auth/sessions` | public | Log in, returns the JWT |
| 29 | DELETE `/auth/sessions/current` | any | Log out |
| 3 | POST `/users` | public | Register a customer |
| 4 | GET `/users` | admin | List customers (paging, sort, filter) |
| 5 | GET `/users/:userId` | owner, admin | Read a profile |
| 6 | PATCH `/users/:userId` | owner, admin | Update a profile |
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

### Example: log in, then call a protected route

```bash
curl -X POST http://localhost:3000/api/v1/auth/sessions \
  -H "Content-Type: application/json" \
  -d '{"email":"juan.delacruz@email.com","password":"Bankko#Demo2026"}'
# -> { "accessToken": "eyJ...", "tokenType": "Bearer", "expiresInSeconds": 1800, "userId": 1, "role": "Customer", ... }

curl http://localhost:3000/api/v1/users/1/accounts -H "Authorization: Bearer <accessToken>"
```

## Security measures

- bcrypt password hashing (cost 10); passwords need 12+ characters and are never returned by the API.
- JWT signed with HS256, 30-minute expiry, issuer checked, other algorithms rejected; logout adds the token ID to a denylist.
- Global guard: all routes are protected unless explicitly marked public; role (403) and ownership checks in the services.
- Whitelisted DTO validation (unknown fields are dropped, so a client cannot set its own `userId` or `balance`).
- Parameterised queries through TypeORM; sort fields come from a whitelist.
- Login rate limiting and account lockout; identical error for unknown email and wrong password.
- Strict security headers and Content-Security-Policy; secrets only in `.env` (ignored by Git).

## Changes from the Lab 05 design

- Login is one step: email + password returns the JWT. The SMS one-time-code login (#2) and the large-transfer
  step-up (#30) from the lab design are not part of this build.
- Added `DELETE /billers/:billerId` (#33) and `GET /admin/summary`.

## Notes

- `DB_SYNC=true` (the default in development) lets TypeORM keep tables in line with the entities. Set it to
  `false` in production and manage the schema with migrations.
- The SMS and payment-gateway calls are stubs (`callGateway` in `transactions.service.ts`; notifications are
  stored in the database).

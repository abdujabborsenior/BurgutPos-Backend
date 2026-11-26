# BurgutPOS — API

Backend of the BurgutPOS restaurant point-of-sale system: tables and halls, orders
(table / takeaway / delivery / hall), payments with change, cash shifts, menu with
recipes, stock (on sale + warehouse) with a full movement ledger, dashboard,
nine reports with Excel export, roles & permissions, and realtime updates.

Frontend: `../BurgutPos-front`.

## Stack

NestJS 11 · TypeScript (strict) · PostgreSQL · TypeORM 0.3 (migrations) ·
Socket.IO · class-validator · JWT access tokens + httpOnly refresh cookie ·
decimal.js for money · sharp for images · exceljs for exports.

## Quick start

```bash
cp .env.example .env          # then set DB_* and JWT_ACCESS_SECRET
createdb burgutpos            # or create the database any other way
npm install
npm run start:dev             # migrations run automatically on start
npm run seed:demo             # optional: demo halls, tables, menu and staff
```

API: `http://localhost:3000/api` · Swagger (when `SWAGGER_ENABLED=true`): `/api/docs` ·
health check: `/api/health`.

### Superadmin

The owner account is **managed by `.env` only** (`SUPERADMIN_LOGIN`,
`SUPERADMIN_PASSWORD`, `SUPERADMIN_NAME`; default `BurgutPos` / `Burgut1998`).
On every start the account is created or synchronised with these values, and its
sessions are revoked when the password or login changes. It cannot be edited or
deleted through the API and is hidden from the staff list.

### Demo data

`npm run seed:demo` fills an **empty** database with a realistic restaurant:
3 halls / 28 tables, 16 categories / ~80 dishes with recipes, 20 ingredients,
weekly goods receipts, **30 days of history** (daily shifts, ~1 300 orders,
payments by every method, discounts, cancellations, cash operations) and an
open shift today with occupied tables. Everything is created through the real
services, so stock, cash and reports are consistent. The script refuses to run
when halls already exist.

Days later the demo data stops at the day it was seeded. `npm run
seed:demo:catch-up` brings it up to today without deleting anything: the guests
left at the tables pay and that shift is closed, every missing day gets its own
closed shift, and today opens with paid orders and occupied tables. Both seed
modes also fill the states a day of trading never reaches, once each: orders
brought back with «Восстановить» (storno + new payment) and a merged order,
kitchen comments, printer addresses (LAN / USB), an archived hall with its
tables, an archived role, ingredient and former employee, and a manager.
Today's shift is topped up so that «Сегодня» is never empty in any report:
cancelled lines and orders, «Зал» orders, a cash withdrawal and a reopened
order are added if today has none — rerun catch-up later in the day and only
what is still missing is added.

Staff password: `123456` — logins: `fayzullo` (administrator), `bobur`,
`sardor` (cashiers), `mohidil`, `karima`, `oydinoy`, `ozodbek`, `mansur`,
`shuhrat` (waiters).

## Architecture

```
src/
  config/        typed configuration + Joi validation of .env (fails fast at boot)
  database/      TypeORM options, migrations, BaseRepository, TransactionService
  common/        permissions catalog, guards, exception filter, DTO helpers, utils
  modules/<name>/
    <name>.controller.ts   HTTP layer: routing, validation, permissions
    <name>.service.ts      business rules — never touches the database API
    repo/                  repositories — the ONLY place that talks to the database
    entities/  dto/
```

* **Transactions** — `TransactionService.run()` opens a transaction and stores its
  `EntityManager` in `AsyncLocalStorage`; every repository picks it up
  automatically. Services compose freely (nested calls join the outer
  transaction); side effects (realtime pushes, session revocation) run only
  after commit (`afterCommit`).
* **Concurrency** — order rows are locked `FOR UPDATE`; stock changes are single
  atomic `UPDATE … RETURNING` statements in a fixed lock order (orders → dishes →
  ingredients, ascending ids); payments and order creation hold a `SHARE` lock on
  the open shift so a shift can never close underneath them. Partial unique
  indexes guarantee one open order per table and one open shift.
* **Money** — `numeric(14,2)` in PostgreSQL, arithmetic with decimal.js; order
  totals are computed in exactly one place (`orders/order-calculator.ts`).
* **History never changes** — order lines snapshot name/price/category/printer,
  waiter commission % is snapshotted at payment, stock has an append-only ledger.

## Business rules (short)

| Area | Rule |
| --- | --- |
| Shift | One restaurant-wide shift. Orders and payments need an open shift. A shift cannot close while open orders exist. Expected cash = opening cash + cash payments + cash in − cash out. |
| Order | One open order per table. Sent lines are never edited — they are cancelled (fully or partially, with a reason). Discount → service charge → delivery fee. |
| Payment | Split payments allowed. Change is given only from cash. |
| Stock | Tracked dishes have "on sale" and "warehouse" quantities; sales take from "on sale". Recipes deduct ingredients. `allowNegativeStock` controls overselling. |
| Permissions | Roles hold permissions; `*.manage` implies `*.view`; any order action implies POS access. |

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run start:dev` | development with watch |
| `npm run build` / `npm run start:prod` | production build / run |
| `npm run migration:generate -- src/database/migrations/Name` | new migration from entity changes |
| `npm run migration:run` / `migration:revert` | apply / roll back migrations |
| `npm run seed:demo` | demo data for an empty database |
| `npm run seed:demo:catch-up` | extend existing demo data up to today |
| `npm run lint` / `npm run format` | ESLint / Prettier |

## Production

Build both projects and serve them from one origin (the refresh cookie is
`SameSite=Strict`, websockets use the same host):

```nginx
server {
  listen 443 ssl http2;
  server_name pos.example.uz;

  root /var/www/burgutpos-front/dist;
  location / { try_files $uri /index.html; }

  location /api/      { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; client_max_body_size 6m; }
  location /uploads/  { proxy_pass http://127.0.0.1:3000; }
  location /socket.io/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Set `NODE_ENV=production`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`,
`CORS_ORIGINS=https://pos.example.uz`, a long random `JWT_ACCESS_SECRET` and
`SWAGGER_ENABLED=false`.

# ShipBridge

Next.js 15 + HeroUI app that gets carrier rates from the **ShipSaving Legacy API (v1)**, adds your
profit margin, and buys labels. An admin page lets you change the margin and see profit per label.

## How the money flows

```
Customer ──(sees marked-up price)──> ShipBridge ──(pays base price)──> ShipSaving
                                         │
                          you keep: price − ShipSaving cost
```

1. `POST /api/rates` calls ShipSaving `POST /api/rates/list`, adds your margin **on the server**, stores each
   quote (cost + price) and returns only the marked-up price to the browser.
2. `POST /api/buy` looks up the stored quote by `rate_id` (the browser can't change the price),
   calls ShipSaving `GET /api/rates/buy`, and records cost, charged amount and profit.
3. `/admin` lets you set **margin %** and an optional **flat fee per label**, with a live preview.

Customer price = `cost × (1 + margin%) + flat fee`, rounded **up** to the cent.

> **Important:** ShipSaving charges *your* ShipSaving balance the base price. ShipBridge records what
> you should charge, but it does **not** collect payment from customers yet. To actually keep the
> margin you need to charge customers (e.g. Stripe) — see "Opening purchases to customers".

## Setup

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

Open http://localhost:3000 for shipments and http://localhost:3000/admin for the admin page.

| Variable | Purpose |
| --- | --- |
| `SHIPSAVING_API_TOKEN` | Your ShipSaving API token (v1 sends it as `?api_token=`). |
| `SHIPSAVING_API_BASE` | Defaults to `https://api.shipsaving.com`. Set a sandbox URL here if ShipSaving gives you one. |
| `SHIPSAVING_CARRIER_TOKEN` | Optional. Quote only one carrier account (ShipSaving → Carrier Accounts → Token). |
| `SHIPSAVING_WAREHOUSE_NAME` | **Required.** A warehouse name from your ShipSaving account (Warehouses → Name). ShipSaving rejects rate requests without it. |
| `SHIPSAVING_LABEL_TYPE` | `pdf` (default) or `png`. |
| `ADMIN_PASSWORD` | Admin sign-in password. |
| `ADMIN_SESSION_SECRET` | Random 32+ char string (`openssl rand -hex 32`). Signs the session cookie. |
| `DEFAULT_MARGIN_PERCENT`, `DEFAULT_FLAT_FEE` | Used until you save a margin in /admin. |
| `MONGODB_URI` | MongoDB connection string. **Required on Vercel.** Leave empty locally to use the JSON file. |
| `MONGODB_DB` | Database name (default `shipbridge`). |
| `DATA_DIR` | Folder for the JSON data file (only used when `MONGODB_URI` is empty). |

## Who can do what

- **Anyone** can open `/` and get rates (with your margin applied).
- **Buying a label requires admin sign-in** (`/api/buy` is protected in `middleware.ts`), because
  every purchase spends your ShipSaving balance.
- `/admin` and `/api/admin/*` require sign-in.

## Opening purchases to customers

1. Add a payment step in `app/api/buy/route.ts` at the `TODO`: charge `quote.price`
   (e.g. create/confirm a Stripe PaymentIntent) and only call `buyLabel` after it succeeds.
   Refund if the ShipSaving purchase fails.
2. Remove `"/api/buy"` from the `matcher` in `middleware.ts` (or protect it with your own
   customer login instead).

## Storage

`lib/db.ts` stores settings, quotes and shipments in one of two places:

- **MongoDB** when `MONGODB_URI` is set. Use this on Vercel or any serverless host, where the
  filesystem is read-only. Collections: `settings`, `drafts` and `quotes` (both auto-deleted 24 h
  after they were last quoted, by TTL indexes), `shipments`, `login_attempts`. Indexes are created
  on first connect.

**Drafts:** every price check saves its form inputs as a draft, keyed by a hash of the addresses and
parcel, so quoting the same shipment again updates one draft and replaces its unbought quotes
instead of piling up duplicates. Signed-in admins see drafts and recent bookings in a **Recent**
panel on the shipment page and can refill the form from them.
- **`data/shipbridge.json`** otherwise. Fine for local development or a single VPS.

### MongoDB on Vercel

1. Create a free cluster at https://cloud.mongodb.com (or add **MongoDB Atlas** from the Vercel
   Marketplace, which sets `MONGODB_URI` for you).
2. In Atlas → **Network Access**, allow `0.0.0.0/0`. Vercel functions don't have fixed IPs.
3. In Atlas → **Database Access**, create a user; put its connection string in Vercel →
   Project → Settings → Environment Variables as `MONGODB_URI`.
4. Redeploy.

## Notes and limits

- US domestic parcels only (`custom_data` for international customs isn't implemented).
- Uses the v1 (Legacy) API because v2 isn't released yet. v1 only takes inches and pounds, so
  cm/oz from the form are converted before quoting.
- A quote's cost is the v1 `rate`. After purchase the recorded cost is `rate + service_fee +
  insurance_fee` from the label response, so profit in /admin reflects what ShipSaving charged.
- Quotes can be purchased for 1 hour after rates are fetched, and each quote only once.
- Insurance, signature options and predefined carrier packages can be added in `getRates`
  (`lib/shipsaving.ts`).

## Project structure

```
app/
  page.tsx                 New shipment (form + rates + buy)
  admin/page.tsx           Margin settings + shipments ledger
  admin/login/page.tsx     Admin sign in
  api/rates/route.ts       Get rates, apply margin, store quotes
  api/buy/route.ts         Buy label, record profit
  api/admin/*              Login, logout, settings, shipments
components/                HeroUI client components
lib/shipsaving.ts          ShipSaving v1 client (API token + endpoints)
lib/pricing.ts             Margin math
lib/db.ts                  Storage: MongoDB (MONGODB_URI) or local JSON file
lib/auth.ts                Signed admin session cookie
middleware.ts              Route protection
```

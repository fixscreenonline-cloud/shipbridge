# ShipBridge

Next.js 15 + HeroUI app that gets carrier rates from **[Shippo](https://docs.goshippo.com/)**, adds your
profit margin, and buys labels. An admin page lets you change the margin and see profit per label.

## How the money flows

```
Customer ──(sees marked-up price)──> ShipBridge ──(pays base price)──> Shippo
                                         │
                            you keep: price − Shippo cost
```

1. `POST /api/rates` creates a Shippo **shipment** (`POST /shipments`), adds your margin **on the
   server**, stores each quote (cost + price) and returns only the marked-up price to the browser.
2. `POST /api/buy` looks up the stored quote by rate id (the browser can't change the price), buys
   the label with a Shippo **transaction** (`POST /transactions`), and records cost, charged amount
   and profit.
3. `/admin` is the admin area: overview, new shipment, shipments, drafts, margin and carrier notes.

Customer price = `cost × (1 + margin%) + flat fee`, rounded **up** to the cent.

> **Important:** Shippo bills *your* Shippo account the base price. ShipBridge records what you
> should charge, but it does **not** collect payment from customers yet. To actually keep the
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
| `SHIPPO_API_TOKEN` | Shippo API key from https://portal.goshippo.com/api-config/api. Use a **test** key (`shippo_test_…`) first: rates are free and labels are samples. A live key (`shippo_live_…`) buys real labels. |
| `SHIPPO_LABEL_FILE_TYPE` | Label format: `PDF_4x6` (default), `PDF`, `PDF_4x8`, `PDF_A4`, `PDF_A6`, `PNG`, `ZPLII`, … |
| `ANTHROPIC_API_KEY` | Optional. Turns on **Scan / paste** (read an address from a photo or pasted text with Claude Opus 5.5, ~1-2¢ per scan). Empty = button hidden. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Admin sign-in (username defaults to `admin`). |
| `BOOKING_USERNAME`, `BOOKING_PASSWORD` | Starting booking login for the home screen; replaced once you save one in Admin → Security. |
| `ADMIN_SESSION_SECRET` | Random 32+ char string (`openssl rand -hex 32`). Signs the session cookie. |
| `DEFAULT_MARGIN_PERCENT`, `DEFAULT_FLAT_FEE` | Used until you save a margin in /admin. |
| `MONGODB_URI` | MongoDB connection string. **Required on Vercel.** Leave empty locally to use the JSON file. |
| `MONGODB_DB` | Database name (default `shipbridge`). |
| `DATA_DIR` | Folder for the JSON data file (only used when `MONGODB_URI` is empty). |

## Who can do what

The whole site is private. There are two sign-ins:

| | Booking login | Admin login |
| --- | --- | --- |
| Where | `/` (home screen) | `/admin/login` |
| Credentials | Set in **Admin → Security → Booking login** (stored as a scrypt hash). Until then: `BOOKING_USERNAME` / `BOOKING_PASSWORD` | `ADMIN_USERNAME` / `ADMIN_PASSWORD` (+ 2FA when on) |
| Can | Get rates and book labels | Everything: overview, shipments & profit, drafts, margin, carrier notes, security, booking |

Changing the booking login signs out everyone using the old one. Both sign-ins share the lockout
and rate limits; APIs check the session's role (`requireUser` / `requireAdmin` in `lib/session.ts`).

## Admin security

- **Two-factor sign-in (optional, recommended):** Admin → Security → *Set up two-factor*, scan the
  QR code with an authenticator app, confirm a code. The secret is stored encrypted (AES-256-GCM,
  key derived from `ADMIN_SESSION_SECRET`); each code works once. Lost phone: set
  `ADMIN_2FA_RESET=true`, sign in, set it up again, remove the variable.
- **Sessions:** 1 hour, stored server-side (`admin_sessions`), so Sign out ends a session
  everywhere; Admin → Security lists sessions and can sign out the others. Cookie is httpOnly,
  SameSite=Lax, and on HTTPS `Secure` with the `__Host-` prefix.
- **Lockout:** 3 wrong passwords or codes lock the device (cookie) and network (IP) for 1 h,
  doubling up to 24 h (`lib/login-guard.ts`). Admin → Security shows and clears lockouts.
- **Requests:** admin changes from other sites are refused (Origin check in `middleware.ts`);
  security headers (no framing, nosniff, HSTS on production, …) are set in `next.config.ts`.
- **Input limits:** JSON bodies are size-capped (`lib/request.ts`), every field has a max length,
  and only http(s) links from Shippo are stored or followed.
- **Rate limits (per network, `rate_limits` collection):** public price checks 60 / 10 min
  (signed-in admins exempt); sign-in requests 20 / 10 min on top of the lockout.
- **Purchases:** a rate is only freed for retry when Shippo clearly rejects it; after a timeout or
  server error it stays locked so a label can't be paid for twice.
- **Redirects:** the post-sign-in `next` link only allows same-site `/admin` paths (`lib/safe-redirect.ts`).
- **CSV export:** cells starting with `= + - @` are prefixed with `'` so spreadsheets don't run them.

### Known limits

- Client IPs come from `x-real-ip` / `x-forwarded-for`. Vercel sets these itself; on another host,
  make sure the proxy overwrites them, or per-network limits can be bypassed.
- The admin password lives in an environment variable; keep it long and turn on 2FA.
- There's no strict script Content-Security-Policy (Next.js inline scripts would need nonces);
  React escaping is the XSS defence.
- Customers aren't charged yet, so buying stays admin-only.

## Opening purchases to customers

1. Add a payment step in `app/api/buy/route.ts` at the `TODO`: charge `quote.price`
   (e.g. create/confirm a Stripe PaymentIntent) and only call `buyLabel` after it succeeds.
   Refund if the Shippo purchase fails.
2. Remove `"/api/buy"` from the `matcher` in `middleware.ts` (or protect it with your own
   customer login instead).

## Fast address entry

- **Scan / paste** (each address card): take or choose a photo of a label, envelope, card or note,
  or paste text. `app/api/scan-address` sends it to Claude (structured output, low effort) and
  tidies the result against our state/city/ZIP lists. Photos are shrunk in the browser first.
  Signed-in users only, 40 scans / 10 min per network.
- **ZIP first:** a 5-digit ZIP fills state and city (`public/us-zips/`, no API call).
- **Remembered sender:** the last "Ship from" that got rates is offered as **Use last sender** on that device (localStorage); it is never filled in without a tap.

## Storage

`lib/db.ts` stores settings, drafts, quotes, shipments and sign-in attempts in one of two places:

- **MongoDB** when `MONGODB_URI` is set. Use this on Vercel or any serverless host, where the
  filesystem is read-only. Collections: `settings`, `drafts` and `quotes` (both auto-deleted 24 h
  after they were last quoted, by TTL indexes), `shipments`, `login_attempts`. Indexes are created
  on first connect.
- **`data/shipbridge.json`** otherwise. Fine for local development or a single VPS.

**Drafts:** every price check saves its form inputs as a draft, keyed by a hash of the addresses and
parcel, so quoting the same shipment again updates one draft and replaces its unbought quotes
instead of piling up duplicates. Signed-in admins see drafts and recent bookings in a **Recent**
panel on the shipment page and can refill the form from them.

### MongoDB on Vercel

1. Create a free cluster at https://cloud.mongodb.com (or add **MongoDB Atlas** from the Vercel
   Marketplace, which sets `MONGODB_URI` for you).
2. In Atlas → **Network Access**, allow `0.0.0.0/0`. Vercel functions don't have fixed IPs.
3. In Atlas → **Database Access**, create a user; put its connection string in Vercel →
   Project → Settings → Environment Variables as `MONGODB_URI`.
4. Redeploy.

## Notes and limits

- US domestic parcels only (customs declarations for international shipments aren't implemented).
- Shippo validates US addresses automatically; carriers that can't quote are listed under the rates.
- A quote's cost is the Shippo rate `amount`; that's what Shippo bills when the label is bought.
- Quotes can be purchased for 1 hour after rates are fetched, and each quote only once.
- Shippo label links are signed and expire; **Open label** in /admin fetches a fresh link
  (`/api/admin/shipments/[id]/label`).
- Insurance, signature and other extras can be added to `createShipment` in `lib/shippo.ts`
  (Shippo's `extra` field).

## Project structure

```
app/
  page.tsx                 New shipment (form + rates + buy)
  admin/login/page.tsx     Admin sign in
  admin/(panel)/           Admin area (shared menu in layout.tsx):
    page.tsx               Overview: profit, latest bookings, drafts
    ship/page.tsx          New shipment (?draft=<id> or ?booking=<id> to prefill)
    shipments/page.tsx     All bookings, details, CSV, Ship again
    drafts/page.tsx        Price checks from the last 24 h
    margin/page.tsx        Margin % and flat fee
    carriers/page.tsx      Why some carriers didn't quote
  api/rates/route.ts       Get rates (Shippo shipment), apply margin, store draft + quotes
  api/buy/route.ts         Buy label (Shippo transaction), record profit
  api/admin/*              Login, logout, settings, shipments, drafts, recent, label link
components/                HeroUI client components
lib/shippo.ts              Shippo client (API key + shipments/transactions)
lib/pricing.ts             Margin math
lib/db.ts                  Storage: MongoDB (MONGODB_URI) or local JSON file
lib/auth.ts                Signed admin session cookie (1 h)
lib/login-guard.ts         Sign-in lockout
lib/session.ts             Server-side admin sessions
lib/totp.ts                Two-factor codes (TOTP) + secret encryption
middleware.ts              Route protection
```

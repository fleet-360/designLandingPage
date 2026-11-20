# Payment links

Moved here from `fleet-360/landingPage`, which used to serve them on www.pro-algo.com. Both pages are `noindex`
and stay out of the sitemap.

| URL | Source | What it does |
| --- | --- | --- |
| `/pay` (`/payment`, `/תשלום`) | `pay/payment.html` | Customer-facing, reachable **only through a generated link**. Standalone checkout: no site navbar, no outbound links. Collects the details and runs the Grow widget **in the page**. |
| `/pay-link` (`/payment-link`, `/create-payment-link`) | `pay/payment-link.html` | Internal admin. Sign in, create a link, see every link created and every payment received. |

`tools/build.py` (`build_payment`) writes the two pages to `dist/payment.html` and `dist/payment-link.html` and
copies `pay/assets/` to `dist/pay-assets/`. `/pay` and `/pay-link` are rewrites in `vercel.json` (and in
`_redirects` for the local servers). The other names come from Vercel's `cleanUrls`, which also sends
`/payment.html?d=...` (the form older links have) to `/payment?d=...`.

The files are under `/pay-assets/`, not `/assets/`: `/assets/` is cached as immutable, and `pay-config.js` changes
with the environment. `pay/assets/pay.css` holds only the rules these pages use, so they keep their own light look.

## How it fits together

```
/pay-link ──POST /api/pay/links──▶ pay.links (Postgres)        link id inside the ?d= token
/pay ───────POST createPaymentLink { ..., linkId }──▶ Toro ──▶ Grow (linkId as cField2)
Grow ──notifyProAlgorithm──▶ Toro: approve, Caspit invoice, then
Toro ──POST /api/pay/paid (from Toro's IP)──▶ pay.payments                   → "paid" on /pay-link
```

Grow is the source of truth for money and Caspit for invoices. The tables are the dashboard's record: if the site
is unreachable when Toro reports a payment, that payment is missing from the dashboard, never from Grow.

### API (`api/pay/*.js`, Vercel functions)

| Endpoint | Who | What |
| --- | --- | --- |
| `GET /api/pay/session` | admin page | 200 `{ user }`, 401 signed out, 503 not configured |
| `POST /api/pay/login` | admin page | the site admin sign-in (`api/auth/login.js`, shared with `/contracts`): checks `PAY_ADMIN_USER` / `PAY_ADMIN_PASSWORD`, sets an HttpOnly cookie for all of `/api` for 12 h. 10 failures from one IP in 15 minutes lock that IP out |
| `POST /api/pay/logout` | admin page | clears the cookie (`api/auth/logout.js`) |
| `GET /api/pay/links` | admin page | latest 500 links (with paid count and sum) and latest 500 payments |
| `POST /api/pay/links` | admin page | validates, stores the link and returns it with its `/pay?d=...` address |
| `POST /api/pay/paid` | Toro | records a payment; a repeated `transactionId` only fills what was missing (invoice number, link). Accepted only from Toro's IP (see below) |

### Database

One Postgres for every module of the site, each in its own schema (`pay` here; the signing module gets `sign`).
`db/migrations/*.sql` run in order after each Vercel build (`tools/migrate.mjs`), each once. Never edit an applied
migration; add the next number.

### Toro (fleet-360/cars-server)

- `POST /grow/proAlgorithm/createPaymentLink` takes an optional `linkId` (a UUID, anything else is dropped) and
  sends it to Grow as `cField2`.
- `POST /grow/payment/notifyProAlgorithm`, after `approveTransaction` and the invoice, calls
  `grow/services/proAlgoSiteService.js`, which posts to `https://www.pro-algo.com/api/pay/paid`. It never throws.
  A failed invoice is still reported, then raised as before. Development and staging (Grow sandbox) report only
  when `PRO_ALGO_PAY_WEBHOOK_URL` is set.

### Who may report a payment

`/api/pay/paid` accepts a report only when it comes from Toro's server, `213.165.85.39` (`api.fleet360.co.il`),
listed in `api/pay/paid.js`. On Vercel the caller's IP is set by Vercel and cannot be forged by the caller.
If Toro moves to another server, reports are refused (each refusal is logged in Vercel with the caller's IP)
until the new address is put in `PAY_WEBHOOK_IPS` (comma separated) or in the code. For a second check, set the
same random string as `PAY_WEBHOOK_SECRET` on Vercel and `PRO_ALGO_PAY_WEBHOOK_SECRET` in Toro's `back.env`.

`createPaymentLink` returns `authCode` only (Meshulam `createPaymentProcess`), valid for 4 minutes. The API only
accepts browser requests from origins in `cars-server/middlewares/cors.js` (pro-algo.com, www.pro-algo.com and
localhost:5173/5174 are there). The amount is the **total including VAT**.

## Embedded checkout

`payment.html` loads Grow's SDK (`https://cdn.meshulam.co.il/sdk/gs.min.js`) and calls
`growPayment.renderPaymentOptions(authCode)`, so the card form opens over the page. If the CDN is blocked or slow
the page waits 10 s and then tells the customer to refresh. `PAY_GROW_ENVIRONMENT` must match
`CREDIT_CARD_ENVIRONMENT` on cars-server.

## Configuration

Vercel → the project that serves www.pro-algo.com (`landing-page-build`) → Settings → Environment Variables, and a
local `.env` for development (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Set by the Neon integration (Storage tab). `POSTGRES_URL` also works |
| `PAY_ADMIN_USER`, `PAY_ADMIN_PASSWORD` | Sign-in for `/pay-link` |
| `PAY_LINK_SECRET` | Encrypts the link parameters. Changing it breaks every link already sent |
| `PAY_WEBHOOK_IPS` | Optional. Replaces the Toro IP that `/api/pay/paid` accepts |
| `PAY_WEBHOOK_SECRET` | Optional. If set, Toro must send the same value (`PRO_ALGO_PAY_WEBHOOK_SECRET`) |
| `PAY_SESSION_SECRET` | Optional, signs the session cookie |
| `PAY_ALLOW_PLAIN_PARAMS` | `1` to also accept readable params on `/pay` (default `0`) |
| `PAY_GROW_ENVIRONMENT` | `PRODUCTION` (default) or `DEV` |

`tools/pay_config.py` writes `dist/pay-assets/pay-config.js` for `/pay` (link secret, Grow environment). The admin
credentials stay on the server. Without the variables the site still builds; `/pay-link` says it is not configured
and `/pay` cannot open links. That is what the other domains built from this repo serve.

## Tokens

A link is `https://<host>/pay?d=<token>`: the parameters as JSON (`a` amount, `d` description, `k` link id,
`i` installments, `n`/`p`/`e`/`t` customer, `l` language, `f` editable amount, `x` expiry), AES-GCM encrypted with a
key derived (PBKDF2) from `PAY_LINK_SECRET`. The server makes them (`api/_lib/pay-token.js`), the customer's browser
reads them (`pay/assets/pay-crypto.js`); the two must stay in step. A token that was edited, truncated, made with
another secret, or has expired is refused, and so is a bare `/pay`.

The link secret ships with `/pay`, because the customer's browser decrypts the link. Someone who reads that
JavaScript can forge a link with another amount; the charge still needs the customer to pay it in the Grow widget.

## Local development

```bash
docker run -d --name proalgo-pg -e POSTGRES_PASSWORD=devpass -p 127.0.0.1:54329:5432 postgres:16-alpine
cp .env.example .env        # fill in
npm install
npm run migrate
python tools/build.py
npm run dev                 # site + /api on http://localhost:5173 (PORT=... to change)
```

To see a payment arrive without paying, POST `{ "transactionId": "T-1", "linkId": "<id from the list>", "sum": 100 }`
to `http://localhost:5173/api/pay/paid` (locally, requests from this machine are accepted).

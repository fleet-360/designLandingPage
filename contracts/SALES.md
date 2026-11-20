# Sales system: spec requests, deals, standing orders

Admin screens are under `www.pro-algo.com/contracts/sales/...` (the same sign-in as `/pay-link`).
Clients get personal links, with no sign-in (the token in the link is the key):

| Link | Page | What the client does |
|---|---|---|
| `/discovery/<token>` | `src/client/DiscoveryPage.jsx` | Reads the "ספרינט תכנון ומיפוי" page, pays (Grow widget, through Toro), picks a meeting time from the `developers@` calendar, adds participants |
| `/deal/<token>` | `src/client/DealPage.jsx` | 1. approves the work order and payment schedule (can correct company details) 2. reads and signs the agreement 3. saves a card for the standing order (can skip and come back) |
| `/card/<token>` | `src/client/CardPage.jsx` | Saves or replaces the card of a standing order |

`vercel.json` rewrites the three paths to `contracts/client.html` (a second Vite entry next to the admin
`index.html`); `tools/dev.mjs` does the same locally.

## Flows

**Spec request.** Sales enters the client and the price → link (email / WhatsApp / copy). The client pays in
the page through Toro's existing `grow/proAlgorithm/createPaymentLink`, with the request's id as the link
id. Toro's existing payment report (`/api/pay/paid`) marks it paid, and the existing Caspit invoice goes
out as for any payment. The amount comes from the browser, so a payment below the price (VAT included)
is not marked paid: the office gets a "תשלום חלקי" email and can mark it paid by hand. The page then offers free slots. These are the configured hours, minus busy
times in the `developers@` calendar (when connected) and booked meetings, at most two per day. Bookings are taken one at a time, so two clients cannot book
overlapping times. Booking
creates the event with a Meet link and invitations through Toro. When the calendar is not connected, the
confirmation email carries an `.ics` invite instead.

**Deal.** Sales enters the client, project, price, installments, monthly service and standing order, and
Appendix A. The client approves the order, which freezes the schedule from that day and emails the
payment details to their accounting. The client then signs. The PDF is generated and stored with a
SHA-256 of everything signed, a copy is emailed, and the standing order is created waiting for a card.
Saving the card is a separate last step, so the signed agreement is kept even if the client stops there.
"הפרויקט התחיל" in the admin sets the first charge (start of work + included months, on the billing day)
and emails the client.

**Standing orders.** Toro charges due orders every morning at 08:00 (Israel time): the token charge goes
through Grow, then the existing Caspit invoice is emailed to the client. A failed charge is retried after
2 days, three times, then the order stops as "failed" and the office is emailed. Charges fall on the
billing day: a start date moves forward to it, and after a pause or failed attempts the next charge is
the next billing day (missed months are not charged one after another). A charge Toro took but never
reported stays "בתהליך" and blocks the order; after 30 minutes the admin can mark it "נגבה" (after
checking Grow) or "לא נגבה" (charged again in the next run). The admin can pause,
resume, cancel, edit the amounts or dates, charge now, and send the card link.

## Toro (cars-server, `proAlgoSales/`, new code only)

The site asks Toro to act by id; Toro reads the details back from `https://www.pro-algo.com/api/...`.
The site trusts Toro's calls by its IP (`api/_lib/toro.js`), the same as `/api/pay/paid`.

| Toro endpoint | Does |
|---|---|
| `POST /proAlgoSales/mail { id }` | fetches `/api/outbox/item`, sends through Brevo, reports to `/api/outbox/result` |
| `POST /proAlgoSales/calendar/busy`, `GET /calendar/status` | free/busy of `developers@` |
| `POST /proAlgoSales/calendar/book { bookingId }` | creates the event (Meet link, invitations) |
| `POST /proAlgoSales/card/createProcess { subscriptionId }` | Grow page that saves a card without charging |
| `POST /proAlgoSales/grow/notifyCard` | Grow's callback → `/api/billing/card` |
| `POST /proAlgoSales/billing/run` | charges what `/api/billing/due` hands out, invoices, reports to `/api/billing/result` (also the 08:00 cron) |

## What has to be set up once

- **Calendar:** the service account Toro uses for Drive (`CLIENT_EMAIL_FOR_DRIVE`) needs Google Workspace
  domain-wide delegation for `https://www.googleapis.com/auth/calendar` (Admin console → Security → API
  controls → Domain-wide delegation). Until then booking works with `.ics` invites. The admin settings
  screen has a "בדיקת חיבור ליומן" button.
- **Grow card saving:** the Grow account must allow token payments (Get Token Only and charging a saved
  token). If Grow gives a separate page code for it, set `PRO_ALGO_GROW_TOKEN_PAGE_CODE` in Toro.
- **Settings screen:** bank account, the company signer's name and signature image, the accounting contact.

## Database

`db/migrations/004_sales.sql` (`sales.*`), `005_billing.sql` (`billing.*`) and `006_outbox_retry.sql`, run by
`tools/migrate.mjs` in the Vercel build. Files (signatures, signed PDFs, specs, invoices) are in `sign.files`.

## Tests

`npm test` (dates, business days, amounts); `node tests/e2e-sales.mjs http://localhost:5175` (the whole
flow against a local server and database); `node tests/e2e-sales-edge.mjs http://localhost:5175`
(underpayment, overlapping bookings, billing dates, a stuck charge); `tests/e2e-toro.mjs` (site + Toro module together).

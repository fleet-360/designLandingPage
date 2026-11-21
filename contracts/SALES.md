# Sales system: spec requests, deals, standing orders

Admin screens are under `www.pro-algo.com/contracts/sales/...` (the same sign-in as `/pay-link`).
Clients get personal links, with no sign-in (the token in the link is the key):

| Link | Page | What the client does |
|---|---|---|
| `/discovery/<token>` | `src/client/DiscoveryPage.jsx` | Reads the "ספרינט תכנון ומיפוי" page, picks a meeting time from the `developers@` calendar and adds participants, then pays (Grow widget, through Toro) |
| `/deal/<token>` | `src/client/DealPage.jsx` | 1. approves the work order and payment schedule (can correct company details) 2. reads and signs the agreement 3. saves a card for the standing order (can skip and come back) |
| `/card/<token>` | `src/client/CardPage.jsx` | Saves or replaces the card of a standing order |

`vercel.json` rewrites the three paths to `contracts/client.html` (a second Vite entry next to the admin
`index.html`); `tools/dev.mjs` does the same locally.

## Flows

**Spec request.** Sales enters the client, the price (with an optional price before discount, shown struck
through) and the responsible team lead, salesperson and office manager → link (email / WhatsApp / copy). The
client picks a meeting time first. The free times are the configured hours, minus busy times in the
`developers@` calendar (when connected) and times booked or held here, at most two per day. The picked time
is held for the client for 30 minutes (`api/_lib/discovery-book.js`), and no invite goes out yet. Then the
client pays in the page through Toro's existing `grow/proAlgorithm/createPaymentLink`, with the request's id
as the link id. Toro's existing payment report (`/api/pay/paid`) marks it paid, which books the held time:
the calendar event with a Meet link (Google sends the invitations) and our confirmation email, with the
team lead's call the day before, what to prepare, and the responsible people. A hold that ran out still
becomes a booking when nobody took the time; otherwise the client picks again from the same link. The
existing Caspit invoice goes out as for any payment. The amount comes from the browser, so a payment below
the price (VAT included) is not marked paid: the office gets a "תשלום חלקי" email and can mark it paid by
hand (which also books the held time). Holds and bookings are taken one at a time, so two clients cannot
take overlapping times. When the calendar is not connected, the confirmation email carries an `.ics` invite
instead. The calendar is reached directly from the site when `GOOGLE_CALENDAR_CREDENTIALS` is set in Vercel
(`api/_lib/calendar.js`), otherwise through Toro.

**Spec request arranged outside the page.** Two switches on the request (both on by default, also editable
later under "עדכון ידני"): whether the client books the meeting on the page, and whether they pay on it.
Booking off: sales types the date, time and length. No invite is sent. The time is shown on the client's
page and is not offered to other clients. Two typed-in meetings may share a time. A time the client
already booked on the page can't be switched to manual. Payment off: sales picks how the client pays
(transfer, Bit, card outside the page, check, cash, other), whether it was paid already (with the date),
and a note. Marking it paid works like "סימון כשולם": a held time is booked and the office gets the "שולם"
email, which says no invoice was issued automatically. A manual payment can be set back to unpaid; a Grow
payment can't. With booking on and payment off, the client's chosen time is booked at once (no hold). Moving
the payment off the page while the client holds a time books that time.

**Deal.** Sales enters the client, project, price, installments, monthly service and standing order, and
Appendix A. The client approves the order, which freezes the schedule from that day and emails the
payment details to their accounting. The client then signs. The PDF is generated and stored with a
SHA-256 of everything signed, a copy is emailed, and the standing order is created waiting for a card.
Saving the card is a separate last step, so the signed agreement is kept even if the client stops there.
"הפרויקט התחיל" in the admin sets the first charge (start of work + included months, on the billing day)
and emails the client.

**Deal signed outside the link.** On a new deal, switching off "הלקוח מאשר וחותם דרך הקישור" gives a shorter
form (no Appendix A): the signing date, the signed contract (PDF or photo, up to 3MB; it can also be uploaded
later), and at the end the order confirmation email ("אישור הזמנה", `dealOrderMail`) with the signed contract
attached or not. The deal is saved approved and signed (`sign_mode = 'manual'`). The schedule is frozen from the
signing date. The standing order is created waiting for a card, and the confirmation email carries the card link.
A deal already sent through the link can be closed the same way ("הלקוח חתם מחוץ לקישור"). If the client
already approved the order there, the approved schedule is kept. The deal screen can replace the contract
file and send the confirmation again. Every deal also has an internal note on how the client pays or paid.

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
| `POST /proAlgoSales/calendar/busy`, `GET /calendar/status` | free/busy of `developers@` (only while `GOOGLE_CALENDAR_CREDENTIALS` is not set) |
| `POST /proAlgoSales/calendar/book { bookingId }` | creates the event (the same, only without the key) |
| `POST /proAlgoSales/card/createProcess { subscriptionId }` | Grow page that saves a card without charging |
| `POST /proAlgoSales/grow/notifyCard` | Grow's callback → `/api/billing/card` |
| `POST /proAlgoSales/billing/run` | charges what `/api/billing/due` hands out, invoices, reports to `/api/billing/result` (Toro's own 08:00 cron) |

## What has to be set up once

- **Calendar (directly from the site):**
  1. In Google Cloud, in a project of Pro Algo's own account: enable the Google Calendar API, create a
     service account, and download its JSON key.
  2. In the pro-algo.com Google Workspace admin console (Security → API controls → Domain-wide
     delegation): add the service account's client id with the scope `https://www.googleapis.com/auth/calendar`.
  3. In Vercel (landing-page-build → Settings → Environment Variables): `GOOGLE_CALENDAR_CREDENTIALS` =
     the whole JSON file. Redeploy.

  The calendar is the one on the settings screen (`developers@pro-algo.com`), and its
  "בדיקת חיבור ליומן" button shows whether it works. Until then booking works with `.ics` invites.
- **Grow card saving:** the Grow account must allow token payments (Get Token Only and charging a saved
  token). If Grow gives a separate page code for it, set `PRO_ALGO_GROW_TOKEN_PAGE_CODE` in Toro.
- **Settings screen:** bank account, the company signer's name and signature image, the accounting contact.

## Database

`db/migrations/004_sales.sql` (`sales.*`), `005_billing.sql` (`billing.*`), `006`–`009`, run by
`tools/migrate.mjs` in the Vercel build. Files (signatures, signed PDFs, specs, invoices) are in `sign.files`.

## Tests

`npm test` (dates, business days, amounts); `node tests/e2e-sales.mjs http://localhost:5175` (the whole
flow against a local server and database); `node tests/e2e-sales-edge.mjs http://localhost:5175`
(underpayment, overlapping holds and bookings, billing dates, a stuck charge); `node tests/e2e-sales-manual.mjs http://localhost:5175`
(spec requests and deals entered by hand); `tests/e2e-toro.mjs` (site + Toro module together).

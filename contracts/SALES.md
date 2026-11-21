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
`developers@` calendar (when connected) and times booked or held here: two suggestions per day (from 10:00
and from 12:30), with every other free time under "שעות נוספות" and later days under "תאריכים נוספים". The picked time
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

**Key lines at the top of the spec request page.** On the request form sales types in a few words what the
client wants solved ("להוציא כתבי כמויות של ברזל") and presses "כתיבת משפטים". Claude (`api/_lib/ai-pitch.js`,
through `/api/sales/pitch`) returns three headline options and three supporting lines; sales picks a headline
and edits or removes lines before saving. They replace the page's two standard opening lines (`pitch` on the
request; what sales typed stays internal). Only the problem text is sent to the API, never the client's name or
details. Without `ANTHROPIC_API_KEY` the lines can still be typed by hand.

**The spec in the contract (Appendix B).** On the deal form sales attaches the Canva PDF and picks which of its
pages go into the contract (`contracts/src/pages/sales/SpecPagePicker.jsx`). The PDF is read in the browser:
thumbnails, plus each page's text, which Claude reads (`api/_lib/ai-spec-pages.js`, through
`/api/sales/spec-pages`) to preselect the proposal-summary page and the hours-estimate page. Without
`ANTHROPIC_API_KEY`, or when it fails, the first and last pages are preselected. Only the picked pages are
uploaded (`data.project.specPages` keeps their numbers in the original, `specPageCount` its length). On signing,
the signed PDF gets an Appendix B page that says the hours are an estimate and the price is fixed, then the
spec pages, each with a strip added under it saying the same (`api/_lib/spec-pdf.js`); the spec file's
SHA-256 goes on the verification page. The client's "לצפייה באפיון" link opens the same stamped pages.

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

**Deal.** Sales enters the client, project, price, every payment (exact date, amount before VAT and method:
transfer, check or card; the first is the deposit; a quick split fills the table and the form shows what is
missing or over the price), the day a courier collects the checks, monthly service and standing order, and
Appendix A. The client page shows each payment with its method, the bank details, and for checks how many to
prepare, for what amounts including VAT, and the pickup date. The signer may add an ID number (optional). Deals
made before this keep their deposit % and equal installments counted from the approval date. The client approves the order, which freezes the schedule from that day and emails the
payment details to their accounting. The client then signs. The PDF is generated and stored with a
SHA-256 of everything signed, a copy is emailed, and the standing order is created waiting for a card.
Saving the card is a separate last step, so the signed agreement is kept even if the client stops there.
"הפרויקט התחיל" in the admin sets the first charge (start of work + included months, on the billing day)
and emails the client.

**Demo film on the order page.** Part of the deal form ("סרטון דמו בעמוד ההזמנה", after the project), so the film is ready
when the deal is created: a new deal's film is a draft (`sales.film_drafts`, `?draft=`) that creating the deal moves
into it before the invite goes out, shown to the client from the start (drafts left behind are deleted after 14
days). It stays on the deal screen for later changes. Sales uploads the demo (one
HTML file, gzipped in the browser, up to 3.2MB gzipped) and the client's logo. "יצירת הסרטון" sends the demo's
source (embedded images and long data runs replaced by markers, up to 900k characters) to Claude, which writes
a script of 5 to 9 scenes: a caption each, and clicks, typing, drags, highlights and camera zooms by CSS
selector (`api/_lib/demo-film.js`, 25 to 45 seconds; a 550KB demo is about 175k input tokens, about $0.90 the first time and about $0.10 for a correction within 5 minutes, which reads the source from Claude's cache; the deal screen shows each request's tokens and cost). The film plays at 1.5x: the demo's own clock (timers, animation frames, CSS animations) runs faster inside the frame, so its animations and the script stay in step; "לנסות בעצמכם" sets it back to 1. The client page plays the real demo in a
frame with a driver script added when it is served (`/api/sales/deal-file?kind=demo`, sandboxed by its
`Content-Security-Policy: sandbox allow-scripts` header): a cursor moves and acts, the caption shows under it,
then the client can watch again or try the demo. Sales watches it on the deal screen first; actions that did
not play are listed, and "תיקון עם Claude" sends them back for a corrected script. Captions and the full script
are editable. A ready video (MP4/WebM/MOV, up to 60MB, uploaded and served in 2.5MB parts because Vercel takes
4.5MB per request) replaces the film when there is one. Nothing shows until "מוצג ללקוח" is on. Under it: the
client logos the site shows (`assets/img/clients`) and "הצטרפו ללקוחות שלנו / ובואו נהפוך את החלום למציאות".
The client's logo is part of the demo, not a sticker: Claude also picks where a logo sits in the demo (script
`brand`: the header or sidebar logo, or the product name it stands before), and the player puts the client's
logo there before the film starts, matched to the bar (a dark mark on a transparent background turns white on a
dark bar, a logo with a white background blends into a light one). A demo with no such place shows the logo with
the captions; an uploaded video opens with the logo, which fades once it plays.
Stored in `sales.deals.film`, outside the approved order and the signed snapshot.

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
- **Key lines and spec pages (Claude):** in Vercel (landing-page-build → Settings → Environment Variables):
  `ANTHROPIC_API_KEY` = a key from console.anthropic.com. Redeploy. Optional `ANTHROPIC_MODEL` replaces the
  default model (`claude-opus-5-5`).
- **Grow card saving:** the Grow account must allow token payments (Get Token Only and charging a saved
  token). If Grow gives a separate page code for it, set `PRO_ALGO_GROW_TOKEN_PAGE_CODE` in Toro.
- **Settings screen:** bank account, the company signer's name and signature image, the accounting contact.

## Agreement versions

The agreement text is `api/_lib/agreement-v1.js` (from the Word file), `agreement-v2.js`, which
`tools/sales/agreement_v2_from_v1.py` builds from v1 by exact replacements, and `agreement-v3.js` (current), which
`tools/sales/agreement_v3_from_v2.py` builds from v2 the same way, so each script is the full list of differences.
v3 (clauses 5.2–5.4, 9.2א) describes payments set one by one: each with its date, amount and method, checks
collected on the pickup day in the order. Deals made before that (deposit % and equal installments) keep v2. A deal shows the current version until it is signed; the signed text is frozen in its snapshot.
In v2, clause 6.2 names the first charge date that sales sets on the deal ("{{firstChargeDate}}").

## Database

`db/migrations/004_sales.sql` (`sales.*`), `005_billing.sql` (`billing.*`), `006`–`009`, run by
`tools/migrate.mjs` in the Vercel build. Files (signatures, signed PDFs, specs, invoices) are in `sign.files`.

## Tests

`npm test` (dates, business days, amounts); `node tests/e2e-sales.mjs http://localhost:5175` (the whole
flow against a local server and database); `node tests/e2e-sales-edge.mjs http://localhost:5175`
(underpayment, overlapping holds and bookings, billing dates, a stuck charge); `node tests/e2e-sales-manual.mjs http://localhost:5175`
(spec requests and deals entered by hand); `tests/e2e-toro.mjs` (site + Toro module together).

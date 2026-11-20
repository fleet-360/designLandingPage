# Payment pages

Moved here from `fleet-360/landingPage`, which used to serve them on www.pro-algo.com (this site then proxied
to it). Both pages are `noindex` and stay out of the sitemap.

| URL | Source | What it does |
| --- | --- | --- |
| `/pay` (`/payment`, `/תשלום`) | `pay/payment.html` | Customer-facing, reachable **only through a generated link**. Standalone checkout: no site navbar, no outbound links. Collects the details and runs the Grow widget **in the page**. |
| `/pay-link` (`/payment-link`, `/create-payment-link`) | `pay/payment-link.html` | Internal. Password protected. Generates the encrypted link to send to a customer. |

`tools/build.py` (`build_payment`) writes the two pages to `dist/payment.html` and `dist/payment-link.html` and
copies `pay/assets/` to `dist/pay-assets/`. `/pay` and `/pay-link` are rewrites in `vercel.json` (and in
`_redirects` for `tools/serve.py`). The other names come from Vercel's `cleanUrls`, which also sends
`/payment.html?d=...` (the form older links have) to `/payment?d=...`.

The files are under `/pay-assets/`, not `/assets/`: `/assets/` is cached as immutable, and `pay-config.js` changes
on every build.

`pay/assets/pay.css` holds only the rules these two pages use, taken from the previous site's stylesheet, so they
keep their own light look and do not load the site's CSS.

## Backend

Both pages call the endpoint on `cars-server`:

```
POST https://api.fleet360.co.il/grow/proAlgorithm/createPaymentLink
{ fullName, email, phone, sum, description, paymentNumber, businessTaxId }
-> { success: true, paymentUrl: { processId, processToken, authCode } }
```

It goes through Meshulam's `createPaymentProcess`, which returns **no hosted-page `url`**, only `authCode`, which
is what the embedded widget needs. The `authCode` is valid for 4 minutes.

After a successful payment the Grow webhook (`/grow/payment/notifyProAlgorithm`) issues the Caspit tax invoice and
emails it to the customer. The amount entered on the page is the **total including VAT**.

The API only accepts browser requests from origins in the server's CORS allowlist (`cars-server/middlewares/cors.js`).
`pro-algo.com` and `www.pro-algo.com` are there; localhost and Vercel preview addresses are not, so the
checkout itself can only be exercised on www.pro-algo.com.

## Embedded checkout

`payment.html` loads Grow's SDK (`https://cdn.meshulam.co.il/sdk/gs.min.js`) and calls
`growPayment.renderPaymentOptions(authCode)`, so the card form opens over the page. The SDK's `onSuccess` /
`onFailure` / `onError` / `onClose` events drive the page state. If the CDN is blocked or slow the page waits
10 s and then tells the customer to refresh.

`PAY_GROW_ENVIRONMENT` must match `CREDIT_CARD_ENVIRONMENT` on cars-server, otherwise the widget and the created
process are in different environments.

## Configuration

Set these in **Vercel → the project that serves www.pro-algo.com → Settings → Environment Variables**, and in a
local `.env` for development (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `PAY_ADMIN_USER` | Username for `/pay-link` |
| `PAY_ADMIN_PASSWORD` | Password for `/pay-link` |
| `PAY_LINK_SECRET` | Key used to encrypt the link parameters. Must be the same value the old project used, or every link already sent stops working |
| `PAY_ALLOW_PLAIN_PARAMS` | `1` to also accept readable params on `/pay` (default `0`) |
| `PAY_GROW_ENVIRONMENT` | `PRODUCTION` or `DEV` for the embedded widget (default `PRODUCTION`) |

`tools/pay_config.py` turns them into `dist/pay-assets/pay-config.js` during `python tools/build.py`. It is
generated into `dist/` only (gitignored), and `.env` is gitignored too: this repository is public.

Without the variables the build still succeeds and both pages are inert: `/pay-link` shows a "not configured"
message and `/pay` cannot decrypt any link. That is what the other domains built from this repo (and GitHub
Pages) serve.

## How a link is built

`/pay-link` packs the parameters into a JSON payload, encrypts it with AES-GCM (key = PBKDF2 of
`PAY_LINK_SECRET`) and puts the result in one query parameter: `https://www.pro-algo.com/pay?d=...`.

The payload carries the amount, the description, optional customer details, the number of installments, the page
language, whether the amount is editable, and an optional expiry. `payment.html` decrypts it on load; a token that
was edited, truncated, produced with another secret, or has expired is refused with a message instead of the form.
So is a bare `/pay`.

Changing `PAY_LINK_SECRET` invalidates every link already sent out. Changing the admin password or redeploying only
invalidates open `/pay-link` sessions.

### Scope of the protection

Everything runs in the browser, so:

- The **admin password** never ships, only a PBKDF2-SHA256 hash (210k iterations). Use a long passphrase: a short
  one can be brute-forced offline by anyone who reads `pay-config.js`.
- The **link secret** does ship, because the customer's browser has to decrypt the link. Someone who reads the
  JavaScript can forge a link. This stops a recipient from editing the amount in the URL; it is not a defence
  against a determined attacker. The charge itself still needs the customer to pay in the Grow widget.

Moving both checks server-side means adding two Vercel functions (login, decode) and keeping the secrets out of the
bundle entirely.

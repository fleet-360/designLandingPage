# Contracts (`/contracts`)

The contracts and signatures app, formerly SignEase on Base44 (fleet-360/Base44-SignEase), moved here as is:
React + Vite + Tailwind, the same pages and components. Data was not copied; it starts empty.

| Address | Who | What |
| --- | --- | --- |
| `/contracts/` | admin | Forms list, editor, sharing, signed submissions with PDF export |
| `/contracts/sign?id=<form id>` | anyone with the link | The customer fills in and signs a published form |
| `/contracts/login` | admin | Same username and password as `/pay-link` |

## What changed from Base44

- `src/api/base44Client.js` is a small stand-in for the Base44 SDK client: the pages still call
  `base44.entities.Form.get(...)`, `base44.functions.invoke("submitSignature", ...)` and so on, and it sends them
  to this site's API (`api/contracts/*.js`, `api/auth/*.js`). Only the calls the app makes exist.
- Login is the site admin (`PAY_ADMIN_USER` / `PAY_ADMIN_PASSWORD`). Sign-up, Google, password reset and
  two-step pages were removed (`src/lib/AuthContext.jsx`, `src/pages/Login.jsx`).
- The app is served under `/contracts/` (`vite.config.js` `base`, router `basename`, `signLink` in
  `src/lib/formUtils.js`).
- Data lives in Postgres, schema `sign` (`db/migrations/002_sign.sql`): forms, submissions, files (form images and
  signature images, as bytea) and an append-only audit log.
- A signature image is not uploaded on its own any more: the sign page sends it with the submission, so an
  anonymous visitor has no upload endpoint.
- Base44's server-side PDF (`getPdfUrl`, `pdfGenerator.ts`) was not carried over: the app never used it; the PDF
  is made in the browser (`src/lib/exportPdf.js`).
- A new signature emails sales@pro-algorithm.co.il through Toro (cars-server `contracts/routes/contractsController.js`):
  the site sends only the signature's guid, Toro reads the details from `/api/contracts/notice` (answers once,
  within 30 minutes) and sends the mail.

## API (`api/contracts/*.js`)

| Endpoint | Who | What |
| --- | --- | --- |
| `GET/POST/PATCH/DELETE /api/contracts/forms` | admin; `GET ?id=` of a published form is public | Base44 entity Form |
| `GET/DELETE /api/contracts/submissions` | admin | Base44 entity Submission |
| `POST /api/contracts/submit` | public | Base44 function submitSignature: form version check, 30 per form per 10 minutes, one transaction |
| `GET /api/contracts/signature-urls` | admin | Base44 function getSignatureUrl |
| `GET/POST /api/contracts/files` | GET public for form images, admin for signatures; POST admin | Uploaded images (PNG, JPEG, GIF, WebP, 3 MB) |
| `GET /api/contracts/notice` | Toro | The details of a new signature, once |

## Build and run

The site build runs `npm run build --prefix contracts` after `tools/build.py`, into `dist/contracts/`
(`vercel.json`). Any `/contracts/...` path that is not a file gets `index.html`.

```bash
npm install --prefix contracts
python tools/build.py && npm run build --prefix contracts
npm run dev                         # site + API on http://localhost:5173, then open /contracts/
```

For work on the app itself, `npm run dev --prefix contracts` runs Vite with `/api` proxied to the site server.

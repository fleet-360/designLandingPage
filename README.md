# buildalgo.co.il

Static rebuild of the Pro Algorithm site, live on Vercel at https://www.buildalgo.co.il, https://www.pro-algo.com and
https://www.pro-algorithm.co.il. Hebrew by default, English toggle.

## Layout

| Path | What |
| --- | --- |
| `src/home.html`, `src/products.html` | Hand-written page bodies (placeholders like `{{PRESS}}` are filled at build time) |
| `data/*.json` | Content pulled from the old site: blog posts, podcast episodes, team, clients, press |
| `data/site.json` | Hand-edited shared data used in more than one place: contact details, contact form API, sister sites, nav, products, stats |
| `data/posts_index.json` | Posts without the article bodies, rewritten by `fetch_content.py` |
| `assets/` | CSS, JS (`i18n.js` holds the English strings), images |
| `catalog/` | The flipbook catalog from the previous buildalgo site, copied as-is to `/catalog/` |
| `pay/` | Payment pages `/pay` (Grow checkout) and `/pay-link` (links admin). See `pay/README.md` |
| `contracts/` | Contracts and signatures app (formerly SignEase), served at `/contracts/`. See `contracts/README.md` |
| `contracts/src/collections/`, `api/_lib/collections*.js` | גבייה (collections) at `/contracts/collections`: customers, payment schedules, check pickups and history. A signed deal adds its schedule (`syncSignedDeal`); Kaspit's open invoices come in every two hours (`collections-kaspit.js`, `CASPIT_*` in `.env.example`), one payment per document number |
| `api/` | Vercel functions (Node): `api/auth/*` admin sign-in, `api/pay/*` payment links, `api/contracts/*` contracts. `api/_lib/` is shared code, not routes |
| `static/` | Copied as is to the site root: files other systems link to by a fixed address (`static/README.md`) |
| `db/migrations/` | Postgres schema, one schema per module (`pay`, `sign`), applied by `tools/migrate.mjs` after each Vercel build |
| `tools/pay_config.py` | Builds `/pay`'s browser config from the `PAY_*` environment variables (`.env.example`) |
| `tools/dev.mjs` | Local preview with the API (`npm run dev`); `tools/serve.py` serves the static site only |
| `tools/fetch_content.py` | Re-pulls posts and podcasts from the Base44 API and downloads images |
| `tools/optimize_images.py` | Converts images to WebP, trims logo margins, builds the OG card and favicons |
| `tools/build.py` | Generates `dist/`: all pages, 38 blog posts, sitemap, robots, redirect pages, `_redirects`, schema |
| `tools/serve.py` | Local preview that behaves like Netlify (`python tools/serve.py` → http://localhost:5173, or `PORT=...`) |

## Update content

```bash
python tools/fetch_content.py
python tools/optimize_images.py
python tools/build.py
```

## SEO

- Canonical host, sitemap and robots: `SITE_URL` (default `https://www.buildalgo.co.il`). Each domain is its own Vercel
  project on this repo with its own `SITE_URL`, e.g. `https://www.pro-algorithm.co.il`. Blog posts live at `/blog/<id>`.
- Addresses of the previous buildalgo site (`/blog/<slug>`, `/ai`, `/bim`, `/contact`, ...) get redirect pages
  (`LEGACY` in `tools/build.py`); GitHub Pages has no server-side redirects.
- `/BlogPostPage?slug=<slug>` (the Base44 address) falls back to a JS redirect to `/blog/<id>`.
- On Vercel (which ignores `_redirects`), `build.py` rewrites the `/BlogPostPage?slug=` 308s in `vercel.json`: commit it after a build.
  Lowercase routes (`/about`, `/home`, ...) are `LEGACY` redirect pages, since Vercel redirects match paths case-insensitively.
- Schema: Organization, ProfessionalService, WebSite, FAQPage, BlogPosting, BreadcrumbList, VideoObject, AboutPage, ContactPage.

## Tracking (same IDs as the previous buildalgo site)

GA4 `G-YKK2W4RD2V`, Meta Pixel `915447618249159`, Hotjar `6744736`.
Events: `generate_lead` + Pixel `Lead` on form submit, `contact_click` + Pixel `Contact` on phone/WhatsApp/email, `video_play`, `language_switch`.

## Contact form

Posts `{name, phone, email}` as JSON to `https://api.fleet360.co.il/contact/buildings` (fleet-360/cars-server, `landingContact`),
the same endpoint the previous buildalgo site used. The API rejects any other field.

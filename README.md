# buildalgo.co.il

Static rebuild of the Pro Algorithm site, live at https://www.buildalgo.co.il (GitHub Pages). Hebrew by default, English toggle.

## Layout

| Path | What |
| --- | --- |
| `src/home.html`, `src/products.html` | Hand-written page bodies (placeholders like `{{PRESS}}` are filled at build time) |
| `data/*.json` | Content pulled from the old site: blog posts, podcast episodes, team, clients, press |
| `data/site.json` | Hand-edited shared data used in more than one place: contact details, contact form API, sister sites, nav, products, stats |
| `data/posts_index.json` | Posts without the article bodies, rewritten by `fetch_content.py` |
| `assets/` | CSS, JS (`i18n.js` holds the English strings), images |
| `catalog/` | The flipbook catalog from the previous buildalgo site, copied as-is to `/catalog/` |
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

- Canonical host, sitemap and robots: `www.buildalgo.co.il`. Blog posts live at `/blog/<id>`.
- Addresses of the previous buildalgo site (`/blog/<slug>`, `/ai`, `/bim`, `/contact`, ...) get redirect pages
  (`LEGACY` in `tools/build.py`); GitHub Pages has no server-side redirects.
- `/BlogPostPage?slug=<slug>` (the Base44 address) falls back to a JS redirect to `/blog/<id>`.
- Schema: Organization, ProfessionalService, WebSite, FAQPage, BlogPosting, BreadcrumbList, VideoObject, AboutPage, ContactPage.

## Tracking (same IDs as the previous buildalgo site)

GA4 `G-YKK2W4RD2V`, Meta Pixel `915447618249159`, Hotjar `6744736`.
Events: `generate_lead` + Pixel `Lead` on form submit, `contact_click` + Pixel `Contact` on phone/WhatsApp/email, `video_play`, `language_switch`.

## Contact form

Posts `{name, phone, email}` as JSON to `https://api.fleet360.co.il/contact/buildings` (fleet-360/cars-server, `landingContact`),
the same endpoint the previous buildalgo site used. The API rejects any other field.

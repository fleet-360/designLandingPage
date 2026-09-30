# pro-algorithm.co.il

Static rebuild of the Pro Algorithm site. Hebrew by default, English toggle, every old URL preserved.

## Layout

| Path | What |
| --- | --- |
| `src/home.html`, `src/products.html` | Hand-written page bodies (placeholders like `{{PRESS}}` are filled at build time) |
| `data/*.json` | Content pulled from the old site: blog posts, podcast episodes, team, clients, press |
| `data/site.json` | Hand-edited shared data used in more than one place: contact details, sister sites, nav, products, stats |
| `data/posts_index.json` | Posts without the article bodies, rewritten by `fetch_content.py` |
| `assets/` | CSS, JS (`i18n.js` holds the English strings), images |
| `tools/fetch_content.py` | Re-pulls posts and podcasts from the Base44 API and downloads images |
| `tools/optimize_images.py` | Converts images to WebP, trims logo margins, builds the OG card and favicons |
| `tools/build.py` | Generates `dist/`: all pages, 38 blog posts, sitemap, robots, `_redirects`, schema |
| `tools/serve.py` | Local preview that behaves like Netlify (`python tools/serve.py` → http://localhost:5173) |

## Update content

```bash
python tools/fetch_content.py
python tools/optimize_images.py
python tools/build.py
```

## SEO continuity

- Same URLs as the Base44 site: `/About`, `/Blog`, `/Podcast`, `/Contact`, `/Expertise`, `/AccessibilityStatement`.
- Blog posts stay at `/BlogPostPage?slug=<slug>` through Netlify query rewrites in `dist/_redirects` (English slugs work too).
  If the site is hosted elsewhere, `/BlogPostPage` falls back to a JS redirect to `/blog/<id>`.
- `/LandingPage`, lowercase variants and `/home` 301 to their current pages.
- Titles, descriptions, keywords, OG/Twitter tags, geo tags and canonical host (`www.pro-algorithm.co.il`) match the old site.
- Schema: Organization, ProfessionalService, WebSite, FAQPage, BlogPosting, BreadcrumbList, VideoObject, AboutPage, ContactPage.

## Tracking (same IDs as the old site)

Google Tag Manager `GTM-M6R6J2RX`, GA4 `G-55V8GB74X0`, Google Ads `AW-17743261966`, Meta Pixel `2695574117489883`, Hotjar `6744701`.
Events: `generate_lead` + Pixel `Lead` on form submit, `contact_click` + Pixel `Contact` on phone/WhatsApp/email, `video_play`, `language_switch`.

## Contact form

Netlify Forms (`name="contact"`). Set the notification email in Netlify → Forms. Off Netlify the form falls back to `mailto:`.

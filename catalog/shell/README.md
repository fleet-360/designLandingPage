# Demo shell

Every interactive demo lives in `catalog/<slug>/` and is served at `https://www.buildalgo.co.il/catalog/<slug>/`.
`tools/build.py` copies `catalog/` to `dist/catalog/` as-is, injects the site's tracking where a page has
`<!--tracking-->`, lists every demo in `data/demos.json` whose `catalog/<slug>/index.html` exists on the
gallery page `/catalog/`, and adds it to the sitemap.

`catalog/facades/index.html` is the reference implementation. Copy its `<head>` and structure.

## Page skeleton

```html
<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>… | דמו אינטראקטיבי · Pro Algorithm</title>
<meta name="description" content="…">
<link rel="canonical" href="https://www.buildalgo.co.il/catalog/<slug>/">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/img/brand/icon-32.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Hebrew:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/catalog/shell/shell.css">
<!--tracking-->
<style>/* demo-only CSS */</style>
</head>
<body>
<script src="/catalog/shell/shell.js"></script>
<script>/* the demo (or <script src="demo.js">) */</script>
</body>
</html>
```

## `Demo(cfg)` → `D`

Config:

| key | meaning |
|---|---|
| `slug` | folder name; used in analytics and the CTA link |
| `plugin` | ribbon tab label, e.g. `PA_FACADE` (looks like an AutoCAD/Revit command group) |
| `tag`, `title`, `sub` | top bar texts (Hebrew) |
| `file` | file name shown in the stage bar, e.g. `SAMPLE_PLAN.dwg` (never a real client file name) |
| `viewBox` | `[x, y, w, h]` of the drawing; enables wheel/pinch zoom, pan and the zoom buttons |
| `flipY` | if the model is y-up, the stage bar shows `flipY - y` as Y |
| `kpis` | `[{id, label}]` small counters in the top bar; set with `D.kpi(id, value)` |
| `steps` | `[{t, d, cmd}]` ribbon steps: title, subtitle, command line text shown on entering the step |
| `onStep(n, D, prev)` | render everything for step `n` (canvas state + `D.side(html)`) |
| `zoom: false` | no pan/zoom (static canvas) |
| `panLeft: false` | left-drag does not pan (middle-drag / space+drag still do). Toggle at runtime with `D.panLeft(bool)` |
| `tall: true` | taller canvas |

Helpers:

- `D.svg` the stage `<svg>`; `D.el(tag, attrs, parent=D.svg)` creates SVG elements.
- Elements that the visitor clicks or drags must carry a `data-hit` attribute, so a left-drag on them doesn't pan.
- `D.pt(event)` converts screen coordinates to SVG coordinates; `D.zoomTo(x, y, w, h)`, `D.fit()`, `D.setView(box, asHome)`.
- `D.dragged` is true right after a pan/pinch (the shell already swallows the click that would follow).
- `D.side(html)` fills the side palette: `<div class="hd">` (title + one line that says what to do), `<div class="bd">` (controls first, long lists after), then `D.nav(back, next, disabled)`. The footer is pinned: on desktop the body scrolls inside the palette, on phones the footer is a bar at the bottom of the screen. The next button always reads "הבא: <next step's title>"; with `next = null` it links back to the gallery. `data-go` is wired automatically.
- `D.more(html, summary = "איך זה עובד")` wraps background a professional may want in a closed `<details>`; put explanations there instead of `.note` boxes, so a step's task stays short.
- `D.cta(title, text)` returns the end-of-demo call to action; put it on the last step.
- `D.legend([{color, label, mono}])`, `D.barMid(html)` (middle of the stage bar, e.g. current layer), `D.cmd(text)` (command line).
- `D.table(html)` swaps the canvas for a table view; `D.table(null)` brings the canvas back.
- `D.toast(msg)`, `D.hint(msg)` (centered hint over the canvas), `D.copy(text, okMsg)` (clipboard), `D.fmt(n, decimals)`, `D.money(n)`, `D.esc(s)`.
- `D.track(event, params)` sends a GA4 event with `demo: slug`. The shell already sends `demo_start`, `demo_step`, `demo_complete` and `demo_cta`. Use `D.track("demo_action", {action: "…"})` for the demo's key actions.
- Call `D.ready()` once everything is built; it opens step 1.

## Design rules

- Same palette as the site (`--ink*`, `--text`, `--muted`, `--redline` accent; status colours `--ok`, `--warn`, `--bad`, `--info`). CAD canvas background `#111519`.
- Hebrew UI, short plain sentences, no hype. Industry terms as Israeli contractors and engineers use them.
- Each step's intro starts with what the visitor should do ("בחרו…", "גררו…"), not with what "התוסף" does. The demos are examples of systems built for clients, not off-the-shelf products.
- Every step must let the visitor *do* something (click, drag, toggle, edit), not only watch. Numbers are computed live from the data.
- 4–6 steps. The last step summarizes or exports and shows `D.cta()`.
- Works at 1440px and at 375px (the side palette stacks under the canvas). Touch: tap works everywhere, pinch zooms.
- No frameworks, no backend, no external scripts. Only the Google Fonts above.
- Gallery thumbnail: `catalog/<slug>/thumb.svg`, 1200×675, dark, a recognizable view of the demo's drawing.

## Real drawings, anonymized

Demos use real drawings, but the repo and site are public, so data must be anonymized before it lands in `catalog/`:

- Remove title blocks, sheet frames, stamps, signatures, revision tables, logos, north arrows with project text.
- Remove every client, owner, architect, engineer, consultant or company name; project names; addresses; plot/גוש/חלקה numbers; phone numbers; e-mails; dates tied to the project; file names.
- Keep room names, dimensions, generic legend descriptions, layer names (unless they contain a name), quantities.
- Label projects generically ("דירת 4 חדרים בבניין מגורים", "בית פרטי", "קומת חניון").
- Only processed, filtered vector data goes into the repo. Never copy source PDFs, DWGs or raster images of client drawings.
- Extraction scripts live in `tools/demos/<slug>/` and read the sources from their original location.
- Before finishing, dump every text string in the demo's data and review it for names.
- Size budget: the whole `catalog/<slug>/` folder ≤ 1.5 MB (data rounded and simplified, irrelevant layers dropped). The kitchen app is the one exception.

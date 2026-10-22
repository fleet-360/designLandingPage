"""Gallery thumbnail for the electrical demo: catalog/electrical/thumb.svg (1200x675) from data.json."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
D = json.loads((ROOT / "catalog" / "electrical" / "data.json").read_text(encoding="utf-8"))
OUT = ROOT / "catalog" / "electrical" / "thumb.svg"

LIT = {"L28", "L26"}              # the rows that are "lit" in the picture: shutter motors and their switches
BOX = (36, 40, 790, 600)          # plan area x, y, w, h
# frame the house (rooms + 1.6 m), not the whole garden strip of the data
xs = [v for r in D["rooms"] for v in r["p"][0::2]]
ys = [v for r in D["rooms"] for v in r["p"][1::2]]
X0, Y0, X1, Y1 = min(xs) - 160, min(ys) - 160, max(xs) + 160, max(ys) + 160
W, H = X1 - X0, Y1 - Y0
s = min(BOX[2] / W, BOX[3] / H)
tx = BOX[0] + (BOX[2] - W * s) / 2 - X0 * s
ty = BOX[1] + (BOX[3] - H * s) / 2 - Y0 * s
LG = {l["c"]: l for l in D["legend"]}
counts: dict[str, int] = D["summary"]["counts"]


def esc(t: str) -> str:
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


parts = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">',
    '<defs><pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#161b20" stroke-width="1"/></pattern>'
    f'<clipPath id="pc"><rect x="{BOX[0]}" y="{BOX[1]}" width="{BOX[2]}" height="{BOX[3]}"/></clipPath></defs>',
    '<rect width="1200" height="675" fill="#0e1215"/><rect width="1200" height="675" fill="url(#g)"/>',
    f'<g clip-path="url(#pc)"><g transform="translate({tx:.1f} {ty:.1f}) scale({s:.5f})" fill="none" stroke-linejoin="round">',
    f'<path d="{D["base"]["wallfill"]}" fill="#1c232a" stroke="none"/>',
    f'<path d="{D["base"]["furn"]}" stroke="#2f383f" stroke-width="{0.8 / s:.2f}"/>',
    f'<path d="{D["base"]["doors"]}" stroke="#66717a" stroke-width="{0.9 / s:.2f}"/>',
    f'<path d="{D["base"]["glaz"]}" stroke="#4f7590" stroke-width="{0.9 / s:.2f}"/>',
    f'<path d="{D["base"]["walls"]}" stroke="#9aa5aa" stroke-width="{0.8 / s:.2f}"/>',
    f'<path d="{D["base"]["wallsH"]}" stroke="#d3dbde" stroke-width="{1.7 / s:.2f}"/>',
]
# every other symbol as a small dim mark, the lit row with halo + glyph
for i in D["inst"]:
    if i["c"] in LIT and not i["rv"]:
        continue
    col = "#ff6b81" if i["s"] == "E" else "#8fd6ff"
    if not (X0 <= i["x"] <= X1 and Y0 <= i["y"] <= Y1):
        continue
    parts.append(f'<circle cx="{i["x"]}" cy="{i["y"]}" r="{min(max(i["r"] * 0.55, 6), 12):.0f}" fill="{col}" fill-opacity=".35"/>')
for i in D["inst"]:
    if i["c"] not in LIT or i["rv"]:
        continue
    parts.append(f'<circle cx="{i["x"]}" cy="{i["y"]}" r="{max(i["r"] * 1.7, 26):.0f}" fill="#ff5b2e" fill-opacity=".22" stroke="#ff5b2e" stroke-width="{1.4 / s:.2f}"/>')
    parts.append(f'<path d="{i["d"]}" stroke="#ffffff" stroke-width="{1.1 / s:.2f}"/>')
parts.append("</g></g>")

# side card: a few legend rows with glyphs and counts
cx, cy, cw = 860, 64, 304
rows = ["L28", "L26", "L24", "L16", "L30"]
parts.append(f'<rect x="{cx}" y="{cy}" width="{cw}" height="{92 + 64 * len(rows)}" rx="12" fill="#101418" stroke="#232a31"/>')
parts.append(f'<text x="{cx + cw - 22}" y="{cy + 40}" text-anchor="end" font-family="IBM Plex Sans Hebrew, Arial, sans-serif" font-size="22" font-weight="600" fill="#edeef0">מקרא → בקרה</text>')
parts.append(f'<text x="{cx + 22}" y="{cy + 40}" font-family="IBM Plex Mono, Consolas, monospace" font-size="13" fill="#ff5b2e">PA_CHECK</text>')
for k, c in enumerate(rows):
    y = cy + 70 + 64 * k
    on = c in LIT
    l = LG[c]
    n = counts.get(c, 0)
    if on:
        parts.append(f'<rect x="{cx + 10}" y="{y - 4}" width="{cw - 20}" height="56" rx="8" fill="#ff5b2e" fill-opacity=".14" stroke="#ff5b2e"/>')
    col = "#ffffff" if on else ("#8fd6ff" if l["g"] in ("light", "switch") else "#ff6b81")
    gx = cx + cw - 64
    parts.append(f'<rect x="{gx}" y="{y + 2}" width="44" height="44" rx="6" fill="#111519"/>')
    parts.append(f'<g transform="translate({gx + 4} {y + 6}) scale(.36)" fill="none" stroke="{col}" stroke-width="3.2"><path d="{l["gl"]["l"]}"/><path d="{l["gl"]["f"]}" fill="{col}" stroke="none"/></g>')
    label = l["he"] if len(l["he"]) <= 18 else l["he"][:17] + "…"
    parts.append(f'<text x="{gx - 14}" y="{y + 31}" text-anchor="end" font-family="IBM Plex Sans Hebrew, Arial, sans-serif" font-size="18" fill="{"#ffffff" if on else "#c9d1d4"}">{esc(label)}</text>')
    parts.append(f'<text x="{cx + 26}" y="{y + 32}" font-family="IBM Plex Mono, Consolas, monospace" font-size="20" font-weight="600" fill="{"#ff5b2e" if on else "#a1a7b0"}">{n}</text>')
parts.append(f'<text x="{cx + cw - 22}" y="{cy + 92 + 64 * len(rows) + 40}" text-anchor="end" font-family="IBM Plex Sans Hebrew, Arial, sans-serif" font-size="17" fill="#a1a7b0">תגיות · בקרת תכנון · כתב כמויות</text>')
parts.append("</svg>")
OUT.write_text("\n".join(parts), encoding="utf-8")
print("wrote", OUT, OUT.stat().st_size // 1024, "KB")

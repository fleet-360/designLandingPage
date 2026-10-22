"""Write catalog/tenant-changes/thumb.svg (1200x675) from data.json: the tenant plan after review, with the
structural xref on (concrete the sales plan draws as partitions in yellow), changes coloured by decision
(approved green / purple / blue, rejected red, sent to a consultant amber), numbered markers.

    python tools/demos/tenant-changes/thumb.py
"""
from __future__ import annotations

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3] / "catalog" / "tenant-changes"
DATA = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))

DEC = {"01": "ok", "02": "no", "03": "no", "04": "ok", "05": "no", "06": "ok", "07": "ok", "08": "ok", "09": "ok", "10": "ok", "11": "esc", "12": "ok"}
COL = {"ok": "#3ecf8e", "no": "#ff5d6c", "esc": "#ffb547", "elec": "#b07cff", "water": "#5b9dff", "str": "#e6d84a"}
SYM = {
    "s": '<circle r="8.5" fill="#111519" stroke="currentColor" stroke-width="2"/><path d="M-3 -4.5V4.5M3 -4.5V4.5" stroke="currentColor" stroke-width="2"/>',
    "l": '<circle r="10.5" fill="#111519" stroke="currentColor" stroke-width="2"/><path d="M-7.4 -7.4L7.4 7.4M7.4 -7.4L-7.4 7.4" stroke="currentColor" stroke-width="1.8"/>',
    "w": '<circle r="4.5" fill="currentColor"/><path d="M3 -3L10 -10" stroke="currentColor" stroke-width="2"/>',
    "t": '<path d="M0 -10L10 8H-10Z" fill="#111519" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    "p": '<circle r="8.5" fill="#111519" stroke="currentColor" stroke-width="2"/><circle r="4" fill="currentColor"/>',
    "f": '<rect x="-9" y="-9" width="18" height="18" rx="2" fill="#111519" stroke="currentColor" stroke-width="2"/><path d="M-4.5 4L0 -4.5L4.5 4Z" fill="currentColor"/>',
    "b": '<rect x="-20" y="-7" width="40" height="14" fill="#111519" stroke="currentColor" stroke-width="2"/><path d="M-20 7L20 -7" stroke="currentColor" stroke-width="1.6"/>',
}


def colour(c):
    d = DEC[c["id"]]
    if d == "ok":
        return COL["elec"] if c["cat"] == "elec" else COL["water"] if c["cat"] == "plumb" else COL["ok"]
    return COL[d]


def main():
    W, H = DATA["meta"]["w"], DATA["meta"]["h"]
    s = 610 / (H + 40)
    ox = (1200 - W * s) / 2
    oy = (675 - H * s) / 2
    k = 1 / s  # model units per pixel
    L = DATA["layers"]
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">',
           '<defs><pattern id="g" patternUnits="userSpaceOnUse" width="40" height="40"><path d="M40 0H0V40" fill="none" stroke="#171d23" stroke-width="1"/></pattern>',
           '<pattern id="h" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(45)"><rect width="9" height="9" fill="#2a1a1f"/><line x1="0" y1="0" x2="0" y2="9" stroke="#e0566a" stroke-opacity=".7" stroke-width="2.4"/></pattern>']
    for key, body in SYM.items():
        out.append(f'<g id="s{key}">{body}</g>')
    out.append("</defs>")
    out.append('<rect width="1200" height="675" fill="#111519"/><rect width="1200" height="675" fill="url(#g)"/>')
    out.append(f'<g transform="translate({ox:.1f} {oy:.1f}) scale({s:.4f})" fill="none" stroke-linejoin="round" stroke-linecap="round">')
    out.append(f'<path d="{L["tile"]}" stroke="#222b33" stroke-width="{0.6 * k:.2f}"/>')
    out.append(f'<path d="{L["furn"]}" stroke="#48545d" stroke-width="{0.75 * k:.2f}"/>')
    out.append(f'<path d="{L["fix"]}" stroke="#7d95a3" stroke-width="{0.8 * k:.2f}"/>')
    out.append(f'<path d="{L["conc"]}" fill="url(#h)"/><path d="{L["col"]}" fill="#4b545d"/>')
    out.append(f'<path d="{L["wall"]}" stroke="#c9d1d4" stroke-width="{1.15 * k:.2f}"/>')
    X = DATA["xref"]
    out.append(f'<path d="{X["conc"]}" fill="#e6d84a" fill-opacity=".14" stroke="#e6d84a" stroke-opacity=".6" stroke-width="{0.8 * k:.2f}"/>')
    out.append(f'<path d="{X["thin"]}" fill="#e6d84a"/>')
    for p in DATA["points"]:
        c = "#6f9be0" if p["k"] == "p" else "#9b8ad6"
        out.append(f'<use href="#s{p["k"]}" x="{p["x"]}" y="{p["y"]}" color="{c}" opacity=".4"/>')
    for c in DATA["changes"]:
        if c.get("noise"):
            for key, d in c["b"].items():
                out.append(f'<path d="{d}" stroke="#48545d" stroke-width="{0.75 * k:.2f}"/>')
            continue
        cc, dec = colour(c), DEC[c["id"]]
        for key, d in c["a"].items():
            if dec == "no":
                out.append(f'<path d="{d}" fill="url(#h)"/>' if key == "conc" else f'<path d="{d}" stroke="#c9d1d4" stroke-width="{1.15 * k:.2f}"/>')
            else:
                out.append(f'<path d="{d}" stroke="{cc if dec != "ok" else "#59636b"}" stroke-width="{1.6 * k:.2f}" stroke-dasharray="{5 * k:.1f} {4 * k:.1f}"/>')
        for key, d in c["b"].items():
            out.append(f'<path d="{d}" stroke="{cc}" stroke-width="{2.4 * k:.2f}"' + (f' stroke-dasharray="{3 * k:.1f} {3 * k:.1f}" opacity=".5"' if dec == "no" else "") + "/>")
        for p in c["pb"]:
            out.append(f'<use href="#s{p["k"]}" x="{p["x"]}" y="{p["y"]}" color="{cc}"' + (' opacity=".55"' if dec == "no" else "") + "/>")
        for p in c.get("sug", []):
            out.append(f'<circle cx="{p["x"]}" cy="{p["y"]}" r="{30 if p["k"] == "b" else 17}" fill="none" stroke="#ffb547" stroke-width="{1.6 * k:.2f}" stroke-dasharray="{4 * k:.1f} {3 * k:.1f}"/>')
    for c in DATA["changes"]:
        if c.get("noise"):
            continue
        cc = colour(c)
        x, y = c["at"]
        out.append(f'<g transform="translate({x} {y}) scale({k:.3f})"><circle r="15" fill="{cc}" opacity=".18"/><circle r="11.5" fill="#111519" stroke="{cc}" stroke-width="2"/>'
                   f'<text y="4" font-family="IBM Plex Mono, Consolas, monospace" font-size="10.5" font-weight="600" fill="#edeef0" text-anchor="middle">{c["id"]}</text></g>')
        if c["id"] == "02":
            out.append(f'<g transform="translate({x} {y + 34 * k:.1f}) scale({k:.3f})"><rect x="-62" y="-12" width="124" height="24" rx="12" fill="#ff5d6c"/>'
                       f'<path d="M-44 6L-36 -7L-28 6Z" fill="none" stroke="#0a0c0f" stroke-width="1.8" stroke-linejoin="round"/>'
                       f'<rect x="-20" y="-2" width="62" height="4" rx="2" fill="#0a0c0f" opacity=".55"/></g>')
    out.append("</g></svg>")
    (ROOT / "thumb.svg").write_text("\n".join(out), encoding="utf-8")
    print("wrote", ROOT / "thumb.svg", (ROOT / "thumb.svg").stat().st_size, "bytes")


if __name__ == "__main__":
    main()

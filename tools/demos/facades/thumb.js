// Gallery thumbnail for /catalog/facades/: the catalogued elevation (one colour per type), one order area
// marked with the selection window, and the item card of the full-height cassette with its unfolded blank.
// The model is read from the page itself (between MODEL-START and MODEL-END), so the picture always matches the demo.
// usage: node tools/demos/facades/thumb.js
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../../..");
const PAGE = path.join(ROOT, "catalog/facades/index.html");
const OUT = path.join(ROOT, "catalog/facades/thumb.svg");

const src = fs.readFileSync(PAGE, "utf8");
const a = src.indexOf("/* MODEL-START"), b = src.indexOf("/* MODEL-END */");
if (a < 0 || b < 0) throw new Error("model markers not found in " + PAGE);
const M = new Function(src.slice(a, b) + "; return MODEL;")();
const types = M.finalize(M.groupBase(M.items));
const typeOf = {};
types.forEach((t) => t.ids.forEach((id) => (typeOf[id] = t)));

const W = 1200, H = 675, f1 = (v) => +v.toFixed(1);
const SANS = "IBM Plex Sans Hebrew, Arial, sans-serif", MONO = "IBM Plex Mono, Consolas, monospace";
let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#111519"/>\n`;
for (let x = 0; x <= W; x += 40) o += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#151a1f"/>`;
for (let y = 0; y <= H; y += 40) o += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#151a1f"/>`;
o += "\n";

// elevation
const s = Math.min(660 / M.W, 590 / M.H), ox = 52, oy = 42;
const X = (x) => f1(ox + x * s), Y = (z) => f1(oy + (M.H - z) * s);
M.bayX.concat(M.W).forEach((x) => (o += `<line x1="${X(x)}" y1="${Y(M.H) - 6}" x2="${X(x)}" y2="${Y(0) + 4}" stroke="#1e252c" stroke-dasharray="5 3"/>`));
M.AXES.forEach(([n, x]) => (o += `<circle cx="${X(x)}" cy="${Y(0) + 22}" r="8" fill="none" stroke="#8c979c"/><text x="${X(x)}" y="${Y(0) + 26}" font-family="${MONO}" font-size="10" fill="#c9d1d4" text-anchor="middle">${n}</text>`));
o += `<rect x="${X(0)}" y="${Y(M.PLINTH)}" width="${f1(M.W * s)}" height="${f1(M.PLINTH * s)}" fill="#20272d"/>`;
M.openings.forEach((p) => (o += `<rect x="${X(p.cx)}" y="${Y(p.cz + p.ch)}" width="${f1(p.cw * s)}" height="${f1(p.ch * s)}" fill="#1f2830" stroke="#7e8c95" stroke-width="0.8"/>`));
o += "\n";
const panels = M.items.filter((p) => p.mat !== "AL"), metal = M.items.filter((p) => p.mat === "AL");
panels.forEach((p) => (o += `<rect x="${X(p.x)}" y="${Y(p.z + p.h)}" width="${f1(p.w * s)}" height="${f1(p.h * s)}" fill="${typeOf[p.id].color}" fill-opacity=".9" stroke="#111519" stroke-width="0.7"/>`));
metal.forEach((p) => (o += `<rect x="${X(p.x)}" y="${Y(p.z + p.h)}" width="${f1(Math.max(p.w * s, 1.4))}" height="${f1(Math.max(p.h * s, 1.4))}" fill="${typeOf[p.id].color}"/>`));
o += `<line x1="${X(0) - 18}" y1="${Y(0)}" x2="${X(M.W) + 18}" y2="${Y(0)}" stroke="#c9d1d4" stroke-width="2"/>\n`;
// one order area: floor 2 selected with the window tool
const fl = M.floors[2];
o += `<rect x="${X(-120)}" y="${Y(fl.z + fl.h + 120)}" width="${f1((M.W + 240) * s)}" height="${f1((fl.h + 240) * s)}" fill="#ff5b2e" fill-opacity=".08" stroke="#ff5b2e" stroke-width="2" stroke-dasharray="8 5"/>\n`;

// item card of the full-height cassette
const t = types.find((x) => x.mat === "LB" && x.role === "field" && x.kind === "flat");
const pc = M.pieces(t)[0], e = M.E_LB, ps = t.ids.map(() => ({ ...pc, t }));
const nest = M.nest(ps, "LB", false), nestC = M.nest(ps, "LB", true);
const cx = 760, cy = 54, cw = 400, ch = 566;
o += `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="12" fill="#101418" stroke="#232a31"/>`;
o += `<text x="${cx + cw - 22}" y="${cy + 38}" text-anchor="end" font-family="${SANS}" font-size="21" font-weight="600" fill="#edeef0">כרטיס פריט</text>`;
o += `<text x="${cx + 22}" y="${cy + 38}" font-family="${MONO}" font-size="13" fill="#ff5b2e">PA_ITEMCARD</text>`;
o += `<text x="${cx + 22}" y="${cy + 74}" font-family="${MONO}" font-size="20" font-weight="600" fill="#edeef0">${t.code}</text>`;
o += `<text x="${cx + cw - 22}" y="${cy + 74}" text-anchor="end" font-family="${SANS}" font-size="15" fill="#a1a7b0">קסטה קומה מלאה · ${t.ids.length} יח׳</text>`;
// unfolded blank
const bh = 300, bs = bh / pc.b, bw = pc.a * bs, bx = cx + 70, by = cy + 104, E = e * bs;
const P = (x, y) => `${f1(bx + x * bs)},${f1(by + y * bs)}`;
const outline = [[e, 0], [pc.a - e, 0], [pc.a - e, e], [pc.a, e], [pc.a, pc.b - e], [pc.a - e, pc.b - e], [pc.a - e, pc.b], [e, pc.b], [e, pc.b - e], [0, pc.b - e], [0, e], [e, e]];
o += `<polygon points="${outline.map(([x, y]) => P(x, y)).join(" ")}" fill="#22333a" stroke="#6fd3c9" stroke-width="1.6"/>`;
o += `<g stroke="#e57bd8" stroke-width="1.1" stroke-dasharray="5 4"><line x1="${f1(bx + E)}" y1="${f1(by + E)}" x2="${f1(bx + E)}" y2="${f1(by + bh - E)}"/><line x1="${f1(bx + bw - E)}" y1="${f1(by + E)}" x2="${f1(bx + bw - E)}" y2="${f1(by + bh - E)}"/><line x1="${f1(bx + E)}" y1="${f1(by + E)}" x2="${f1(bx + bw - E)}" y2="${f1(by + E)}"/><line x1="${f1(bx + E)}" y1="${f1(by + bh - E)}" x2="${f1(bx + bw - E)}" y2="${f1(by + bh - E)}"/></g>`;
[1, 2, 3].forEach((k) => (o += `<line x1="${f1(bx + E + 6)}" y1="${f1(by + (bh * k) / 4)}" x2="${f1(bx + bw - E - 6)}" y2="${f1(by + (bh * k) / 4)}" stroke="#8c979c" stroke-dasharray="1.5 3"/>`));
for (let k = 0; k < 6; k++) { const y = by + E + 8 + (k * (bh - 2 * E - 16)) / 5; [bx + E / 2, bx + bw - E / 2].forEach((x) => (o += `<rect x="${f1(x - 1.6)}" y="${f1(y - 3)}" width="3.2" height="6" rx="1.6" fill="none" stroke="#ff9f43"/>`)); }
o += `<text x="${f1(bx + bw / 2)}" y="${by - 10}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="#c9d1d4">${f1(pc.a)}</text>`;
o += `<text x="${f1(bx + bw + 16)}" y="${f1(by + bh / 2)}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="#c9d1d4" transform="rotate(90 ${f1(bx + bw + 16)} ${f1(by + bh / 2)})">${f1(pc.b)}</text>`;
// rows: Hebrew label on the right, value on the left
const rows = [
  ["נטו (ר×ג)", `${t.w}×${t.h}`],
  ["פריסה", `${f1(pc.a)}×${f1(pc.b)}`],
  ["כנף / הורדה", `${M.MATS.LB.flange} / ${M.MATS.LB.bd.toFixed(1)}`],
  ["פלטה ממלאי", `${nest.sheets[0].w}×${nest.sheets[0].l} · ${Math.round(nest.y * 100)}%`],
  ["אורך לפי הזמנה", `${nestC.sheets[0].w}×${nestC.sheets[0].l} · ${Math.round(nestC.y * 100)}%`],
];
const rx0 = cx + 190, rx1 = cx + cw - 22;
rows.forEach(([k, v], i) => {
  const y = cy + 128 + i * 52;
  o += `<text x="${rx1}" y="${y}" text-anchor="end" font-family="${SANS}" font-size="13" fill="#a1a7b0">${k}</text>`;
  o += `<text x="${rx1}" y="${y + 22}" text-anchor="end" font-family="${MONO}" font-size="16" font-weight="600" fill="#edeef0">${v}</text>`;
  if (i < rows.length - 1) o += `<line x1="${rx0}" y1="${y + 34}" x2="${rx1}" y2="${y + 34}" stroke="#1f262d"/>`;
});
// legend of CNC layers
const lay = [["CUT", "#6fd3c9", ""], ["V90", "#e57bd8", "5 4"], ["SLOT", "#ff9f43", ""], ["STIFF", "#8c979c", "1.5 3"]];
lay.forEach(([n, c, d], i) => {
  const x = cx + 26 + i * 92, y = cy + ch - 30;
  o += `<line x1="${x}" y1="${y - 4}" x2="${x + 20}" y2="${y - 4}" stroke="${c}" stroke-width="2"${d ? ` stroke-dasharray="${d}"` : ""}/><text x="${x + 26}" y="${y}" font-family="${MONO}" font-size="11.5" fill="#c9d1d4">${n}</text>`;
});
o += "\n</svg>\n";
fs.writeFileSync(OUT, o);
console.log("wrote", path.relative(ROOT, OUT), (o.length / 1024).toFixed(1) + " KB");

// Gallery thumbnail for /catalog/akro/: the slab with the automatic placement (one grid per room),
// the primary beams on the heads, the slab beams, and one tower dragged off the module so its gaps show
// as red dimensions. Also prints the layout figures the demo starts from.
// usage: node tools/demos/akro/make_thumb.js
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../../..");
const AK = require(path.join(ROOT, "catalog/akro/demo.js"));
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "catalog/akro/data.json"), "utf8"));
const BAY = Object.fromEntries(DATA.zones.map((b) => [b.id, { ...b, geo: AK.geoOf(b.poly) }]));
const Rof = (b) => ({ gx: AK.SPACING[b.d][0], gy: AK.SPACING[b.d][1], eMax: 40 });

const towers = [];
let n = 0;
for (const b of Object.values(BAY)) AK.placeBay(b, Rof(b), ["T2", "T3", "T4", "T5", "T6"]).towers.forEach((t) => towers.push({ ...t, id: String(++n).padStart(2, "0") }));
const v0 = AK.validateAll(BAY, towers, Rof);
const byType = {};
towers.forEach((t) => (byType[t.type] = (byType[t.type] || 0) + 1));
console.log("towers", towers.length, byType, "issues at placement", v0.issues.length, v0.issues.map((i) => `${i.kind}:${i.a}${i.v != null ? "=" + i.v.toFixed(0) : ""}`).join(" "));
// a hand edit on site: one main tower in the long row of B slid off the module
const row = towers.filter((s) => s.bay === "B" && s.type === "T1").sort((a, b) => a.y - b.y || a.x - b.x);
const moved = row.filter((s) => Math.abs(s.y - row[8].y) < 0.5)[2];
moved.x += 23.6;
const v = AK.validateAll(BAY, towers, Rof);
const bm = AK.beamsFor(BAY, towers, v);

const W = 1200, H = 675, S = 0.4;
const ox = (W - DATA.size[0] * S) / 2, oy = (H - DATA.size[1] * S) / 2;
const X = (x) => +(ox + x * S).toFixed(1), Y = (y) => +(oy + y * S).toFixed(1);
const pts = (p) => p.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ");
const THK = { 20: "#5b9dff", 25: "#c08bff" };
let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#111519"/>\n`;
for (let gx = 0; gx <= W; gx += 40) o += `<line x1="${gx}" y1="0" x2="${gx}" y2="${H}" stroke="#161b20"/>`;
for (let gy = 0; gy <= H; gy += 40) o += `<line x1="0" y1="${gy}" x2="${W}" y2="${gy}" stroke="#161b20"/>`;
o += "\n";
DATA.zones.forEach((b) => (o += `<polygon points="${pts(b.poly)}" fill="${THK[b.d]}" fill-opacity="0.07"/>`));
DATA.walls.forEach((poly) => (o += `<path d="${poly.map((r) => "M" + r.map(([x, y]) => `${X(x)},${Y(y)}`).join("L") + "Z").join("")}" fill="#2b343b" stroke="#8c979c" stroke-width="1" fill-rule="evenodd"/>`));
DATA.windows.forEach(([x, y, w, h]) => (o += `<rect x="${X(x)}" y="${Y(y)}" width="${(w * S).toFixed(1)}" height="${(h * S).toFixed(1)}" fill="#111519" stroke="#7e8c95" stroke-width="0.7"/>`));
DATA.sbeams.forEach((b) => b.r.forEach((r) => (o += `<rect x="${X(r[0])}" y="${Y(r[1])}" width="${((r[2] - r[0]) * S).toFixed(1)}" height="${((r[3] - r[1]) * S).toFixed(1)}" fill="#b9a4ff" fill-opacity="0.12" stroke="#b9a4ff" stroke-width="1" stroke-dasharray="5 3"/>`)));
o += `<polygon points="${pts(DATA.slab)}" fill="none" stroke="#c9d1d4" stroke-width="1.6"/>\n`;
const bad = new Set();
v.issues.forEach((i) => { if (i.kind === "emax") return; bad.add(i.a); if (i.b) bad.add(i.b); });
for (const s of towers) {
  const t = AK.TT[s.type], c = bad.has(s.id) ? "#ff5d6c" : t.color;
  const cx = X(s.x), cy = Y(s.y), hx = (t.px / 2) * S, hy = (t.py / 2) * S;
  o += `<g stroke="${c}"><rect x="${(cx - (t.wx / 2) * S).toFixed(1)}" y="${(cy - (t.wy / 2) * S).toFixed(1)}" width="${(t.wx * S).toFixed(1)}" height="${(t.wy * S).toFixed(1)}" fill="${c}" fill-opacity="${bad.has(s.id) ? 0.22 : 0.1}" stroke-width="${bad.has(s.id) ? 2.2 : 1.3}"/>`;
  o += `<line x1="${(cx - hx).toFixed(1)}" y1="${(cy - hy).toFixed(1)}" x2="${(cx + hx).toFixed(1)}" y2="${(cy + hy).toFixed(1)}" stroke-width="0.6" opacity="0.5"/><line x1="${(cx + hx).toFixed(1)}" y1="${(cy - hy).toFixed(1)}" x2="${(cx - hx).toFixed(1)}" y2="${(cy + hy).toFixed(1)}" stroke-width="0.6" opacity="0.5"/>`;
  o += `<line x1="${(cx - hx).toFixed(1)}" y1="${(cy - hy).toFixed(1)}" x2="${(cx + hx).toFixed(1)}" y2="${(cy - hy).toFixed(1)}" stroke-width="2"/><line x1="${(cx - hx).toFixed(1)}" y1="${(cy + hy).toFixed(1)}" x2="${(cx + hx).toFixed(1)}" y2="${(cy + hy).toFixed(1)}" stroke-width="2"/></g>`;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) o += `<circle cx="${(cx + a * hx).toFixed(1)}" cy="${(cy + b * hy).toFixed(1)}" r="2.6" fill="#111519" stroke="#edeef0" stroke-width="1"/>`;
  o += "\n";
}
bm.beams.forEach((b) => (o += `<rect x="${X(b.x0)}" y="${Y(b.y - AK.BEAM_W / 2)}" width="${(b.len * S).toFixed(1)}" height="${(AK.BEAM_W * S).toFixed(1)}" fill="#e0b130" fill-opacity="0.85"/>`));
o += "\n";
// red dimensions of the broken gaps
const seen = new Set();
v.rels.filter((r) => !r.ok && r.kind === "gap" && r.axis === "x").forEach((r) => {
  const k = Math.round(r.y) + ":" + Math.round(r.x);
  if (seen.has(k)) return;
  seen.add(k);
  const sg = r.dir === "+x" ? 1 : -1, x1 = X(r.x), x2 = X(r.x + sg * r.v), y = Y(r.y);
  o += `<g stroke="#ff5d6c" stroke-width="1.6"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><line x1="${x1 - 4}" y1="${y + 4}" x2="${x1 + 4}" y2="${y - 4}" stroke-width="2"/><line x1="${x2 - 4}" y1="${y + 4}" x2="${x2 + 4}" y2="${y - 4}" stroke-width="2"/></g>`;
  o += `<text x="${((x1 + x2) / 2).toFixed(1)}" y="${y - 6}" font-family="IBM Plex Mono, Consolas, monospace" font-size="15" font-weight="600" fill="#ff5d6c" text-anchor="middle" paint-order="stroke" stroke="#111519" stroke-width="4">${r.v.toFixed(1)}</text>`;
});
o += "\n</svg>\n";
const out = path.join(ROOT, "catalog/akro/thumb.svg");
fs.writeFileSync(out, o);
console.log("wrote", out, o.length, "bytes; moved tower", moved.id, "issues after the edit", v.issues.length);

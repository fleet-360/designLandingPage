/* Akro demo: frame shoring towers ("מגדלי אקרו") under a roof slab.
   Placement and checks follow the plugin's validated rules (Akro: docs/shore-placement-rules.md,
   docs/beam-placement-rules.md, the inner-zone detector): a room is ONE zone with ONE continuous grid;
   every spacing is measured from the jack centre; the foot-to-foot gap between two towers stays on a
   5 cm module; the layout aims at the max spacing (fewest towers) with the slack split evenly between
   opposite walls; a base plate never touches a wall (2 cm floor); smaller secondary towers take the
   rows the main one cannot; each tower carries two primary beams (one per ladder face) that cover its
   two heads plus the neighbour's near head on alternating lanes, shortest catalogue length first, and
   nothing leaves the room. Where no layout keeps every rule the softest one is bent and flagged.
   Values the plugin does not hold (loads, tower capacity, frame heights, jack range, floor level) are
   demo assumptions and are labelled as such in the UI.
   The engine below is pure (no DOM) so tools/demos/akro/*.js can load it in Node. */
(() => {
  "use strict";

  /* =============================== engine =============================== */
  const AK = (() => {
    const MOD = 5, EPS = 1e-6, RIM = 10, BEAM_W = 12.6, SAFE = 2;
    const STACK = { ply: 2, sec: 14, pri: 16.5 };            // plywood, secondary joist 14, primary H16.5 (cm)
    const STACK_T = STACK.ply + STACK.sec + STACK.pri;        // 32.5
    const LOAD = { conc: 25, form: 0.5, live: 1.5 };          // kN/m³ fresh RC, kN/m² deck, kN/m² casting
    const CATALOG = [183, 320, 366, 427];                     // primary beam lengths (plugin catalogue)
    const FRAMES = [122, 91, 61];                             // frame heights: 1.22 from the plugin, 0.91/0.61 assumed
    const JACK = { min: 10, max: 35 };                        // assumed screw-jack range, base and head
    const TYPES = [
      { id: "T1", name: "122×165", px: 122, py: 165, wx: 143, wy: 193, open: 165, main: true, color: "#5b9dff" },
      { id: "T2", name: "125×122", px: 125, py: 122, wx: 146, wy: 150, open: 125, color: "#b39ce8" },
      { id: "T3", name: "122×125", px: 122, py: 125, wx: 143, wy: 153, open: 125, color: "#4dd0e1" },
      { id: "T4", name: "97×122", px: 97, py: 122, wx: 118, wy: 150, open: 97, color: "#e57bd8" },
      { id: "T5", name: "122×90", px: 122, py: 90, wx: 143, wy: 118, open: 90, color: "#7fd68b" },
      { id: "T6", name: "90×122", px: 90, py: 122, wx: 111, wy: 150, open: 90, color: "#d9b26f" },
    ];
    const TT = Object.fromEntries(TYPES.map((t) => [t.id, t]));
    // example engineer's table: max foot-to-foot gap [along the primary beams, between rows] per slab thickness
    const SPACING = { 15: [150, 150], 20: [150, 150], 25: [150, 150], 30: [150, 125], 35: [125, 125], 40: [125, 100] };
    const floor5 = (v) => Math.floor(v / MOD + 1e-7) * MOD;
    const ceil5 = (v) => Math.ceil(v / MOD - 1e-7) * MOD;
    const isMod = (g) => Math.abs(g - MOD * Math.round(g / MOD)) < 0.05;

    /* ---- loads (demo cross-check only: the plugin takes the spacing from the engineer) ---- */
    const qOf = (d) => (LOAD.conc * d) / 100 + LOAD.form + LOAD.live;
    const gridLoad = (d, gx, gy, t = TT.T1) => (qOf(d) * (t.px + gx) * (t.py + gy)) / 1e4;   // kN per tower

    /* ---- tower build-up for a clear height H (floor to underside of the primary beam), cm:
       fewest frames, then the least jack extension; base jack kept short, U-head takes the rest ---- */
    function compose(H) {
      let best = null;
      const rec = (left, from, used) => {
        const R = H - used.reduce((a, b) => a + b, 0);
        if (used.length && R >= 2 * JACK.min - EPS && R <= 2 * JACK.max + EPS) {
          const key = [used.length, R, new Set(used).size];
          if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] - EPS || (Math.abs(key[1] - best.key[1]) < EPS && key[2] < best.key[2])))) best = { key, frames: [...used], R };
        }
        if (left === 0) return;
        for (let i = from; i < FRAMES.length; i++) if (R - FRAMES[i] >= 2 * JACK.min - EPS) rec(left - 1, i, [...used, FRAMES[i]]);
      };
      rec(4, 0, []);
      if (!best) return { H, ok: false, frames: [], base: 0, head: 0 };
      const base = Math.max(JACK.min, best.R - JACK.max);
      return { H, ok: true, frames: best.frames, base, head: best.R - base };
    }

    /* ---- rectilinear room geometry ---- */
    function pip(poly, x, y) {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    }
    function geoOf(poly) {
      const H = [], V = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if (Math.abs(a[1] - b[1]) < EPS) H.push([Math.min(a[0], b[0]), Math.max(a[0], b[0]), a[1]]);
        else V.push([Math.min(a[1], b[1]), Math.max(a[1], b[1]), a[0]]);
      }
      // vertical strips between distinct vertex x, each with its inside y-intervals
      const xs = [...new Set(poly.map((p) => p[0]))].sort((a, b) => a - b);
      const S = [], IV = [];
      for (let k = 0; k < xs.length - 1; k++) {
        const xm = (xs[k] + xs[k + 1]) / 2;
        const ys = H.filter((h) => h[0] < xm && h[1] > xm).map((h) => h[2]).sort((a, b) => a - b);
        const iv = [];
        for (let j = 0; j + 1 < ys.length; j += 2) iv.push([ys[j], ys[j + 1]]);
        S.push({ x0: xs[k], x1: xs[k + 1], w: xs[k + 1] - xs[k], iv, base: IV.length });
        iv.forEach((I) => IV.push({ t: I[0], b: I[1], w: (xs[k + 1] - xs[k]) / 100 }));
      }
      const ysAll = poly.map((p) => p[1]);
      return { poly, H, V, S, IV, y0: Math.min(...ysAll), y1: Math.max(...ysAll), x0: xs[0], x1: xs[xs.length - 1] };
    }
    // rectangle inside the room with `clr` clearance to every wall (negative = tolerated overlap)
    function rectIn(geo, r, clr = 0) {
      const x0 = r[0] - clr, y0 = r[1] - clr, x1 = r[2] + clr, y1 = r[3] + clr;
      if (!pip(geo.poly, (x0 + x1) / 2, (y0 + y1) / 2)) return false;
      for (const [a, b, e] of geo.H) if (e > y0 + EPS && e < y1 - EPS && a < x1 - EPS && b > x0 + EPS) return false;
      for (const [a, b, e] of geo.V) if (e > x0 + EPS && e < x1 - EPS && a < y1 - EPS && b > y0 + EPS) return false;
      return true;
    }
    // distance along a ray to the first wall face of the room
    function rayWall(geo, x, y, d) {
      let best = Infinity;
      if (d === "+x" || d === "-x") {
        for (const [a, b, e] of geo.V) {
          if (y < a - EPS || y > b + EPS) continue;
          const dist = d === "+x" ? e - x : x - e;
          if (dist > -0.5 && dist < best) best = dist;
        }
      } else {
        for (const [a, b, e] of geo.H) {
          if (x < a - EPS || x > b + EPS) continue;
          const dist = d === "+y" ? e - y : y - e;
          if (dist > -0.5 && dist < best) best = dist;
        }
      }
      return Math.max(0, best);
    }

    /* ---- 1D layout of posts along one sub-row ----
       oh: binding inset from the wall to the first jack (plate overhang + 2 cm); the gap is floored to
       the 5 cm module and aimed at the max; the residual goes to the two walls, split evenly. */
    function layoutSeq(L, posts, oh, gMax, eMax, guard) {
      const n = posts.length, P = posts.reduce((a, b) => a + b, 0);
      if (n === 1) { const m = (L - P) / 2; return m >= oh - EPS ? { g: 0, m, ok: m <= eMax + 0.5 } : null; }
      const gHi = (L - 2 * oh - P) / (n - 1);
      const g = floor5(Math.min(gMax, gHi) + EPS);
      if (g < guard - EPS) return null;
      const m = (L - P - (n - 1) * g) / 2;
      return { g, m, ok: m <= eMax + 0.5 };
    }
    // fewest posts: n of one size, the last one possibly smaller
    function axisPlan(L, sizes, oh, gMax, eMax, guard) {
      const all = [...new Set(sizes)].sort((a, b) => b - a);
      let bent = null;
      for (let n = 1; n <= 40; n++) {
        let any = false;
        for (let i = 0; i < all.length; i++)
          for (let j = i; j < all.length; j++) {
            const seq = [...Array(n - 1).fill(all[i]), all[j]];
            const r = layoutSeq(L, seq, oh, gMax, eMax, guard);
            if (!r) continue;
            any = true;
            if (r.ok) return { seq, ...r };
            if (!bent || r.m < bent.m) bent = { seq, ...r };
          }
        if (!any && n > 1) break;
      }
      return bent;
    }

    /* ---- rows: one theoretical grid for the whole room ----
       Row lines run along the primary beams (x). A candidate row is a top jack line y on a 5 cm lattice
       and a family of tower types sharing the span across the beams (165 main; 125 / 90 / 122
       secondary). A row exists wherever its band (plate + 2 cm) fits inside the room, split into
       sub-rows by the walls. The rows are chosen together (dynamic programme over y) by the validated
       hierarchy: gaps between rows ≤ max first, every part of the room under a row, walls within the
       max distance, then the fewest towers, main type preferred. */
    const FAMS = [{ key: "165", types: ["T1"], main: true }, { key: "125", types: ["T3"] }, { key: "90", types: ["T5"] }, { key: "122", types: ["T2", "T4", "T6"] }];
    const WT = { E: 3, K: 15, U: 20, G: 20, S: 125, B: 6 };
    const PLANS = new Map();   // sub-row layouts repeat from one row height to the next
    function rowCand(geo, y, fam, R) {
      const S = geo.S, t0 = TT[fam.types[0]], py = t0.py, ohy = (t0.wy - t0.py) / 2 + SAFE;
      const b0 = y - ohy, b1 = y + py + ohy;
      const fit = S.map((s) => { for (let j = 0; j < s.iv.length; j++) if (s.iv[j][0] <= b0 + EPS && s.iv[j][1] >= b1 - EPS) return j; return -1; });
      const cov = new Uint8Array(geo.IV.length), plans = [];
      const sizes = fam.types.map((id) => TT[id].px), ohx = Math.max(...fam.types.map((id) => (TT[id].wx - TT[id].px) / 2));
      let towers = 0, bent = 0;
      for (let k = 0; k < S.length;) {
        if (fit[k] < 0) { k++; continue; }
        let k1 = k;
        while (k1 + 1 < S.length && fit[k1 + 1] >= 0) k1++;
        const x0 = S[k].x0, x1 = S[k1].x1;
        const key = (x1 - x0).toFixed(1) + "|" + fam.types.join() + "|" + R.gx + "|" + R.eMax;
        if (!PLANS.has(key)) { if (PLANS.size > 20000) PLANS.clear(); PLANS.set(key, axisPlan(x1 - x0, sizes, ohx + SAFE, R.gx, R.eMax, ceil5(2 * ohx))); }
        const pl = PLANS.get(key);
        if (pl) {
          towers += pl.seq.length;
          if (!pl.ok) bent += pl.m - R.eMax;
          plans.push({ x0, x1, pl });
          for (let q = k; q <= k1; q++) cov[S[q].base + fit[q]] = 1;
        }
        k = k1 + 1;
      }
      return { y, py, b0, b1, yb: y + py, fam, towers, bent, cov, plans };
    }
    function placeBay(bay, R, enabled) {
      const geo = bay.geo, IV = geo.IV, M = IV.length;
      const fams = FAMS.map((f) => ({ ...f, types: f.types.filter((id) => id === "T1" || enabled.includes(id)) })).filter((f) => f.types.length);
      const ov = (d, w) => (d > 0.5 ? (d + WT.K) * w * WT.E : 0);
      // interval sets as bit masks (NW 32-bit words), so a pair of rows costs a few bit operations
      const NW = Math.ceil(M / 32) || 1;
      const sumBits = (m, arr, base) => { let v = 0; for (let w = 0; w < NW; w++) { let x = m[w]; while (x) { const b = 31 - Math.clz32(x & -x); v += arr[base + w * 32 + b]; x &= x - 1; } } return v; };
      const holeW = new Float64Array(NW * 32), wid = new Float64Array(NW * 32);
      IV.forEach((I, n) => { holeW[n] = (I.b - I.t) * I.w * WT.U; wid[n] = I.w; });
      let best = null;
      for (let off = 0; off < MOD; off++) {
        const C = [];
        for (let y = geo.y0 + off; y <= geo.y1; y += MOD) for (const f of fams) { const c = rowCand(geo, y, f, R); if (c.towers > 0) C.push(c); }
        const N = C.length, cost = new Float64Array(N), prev = new Int32Array(N).fill(-1);
        // per row: covered set, intervals at/below it and not reached from above, intervals ending above its band bottom; edge costs per interval
        const cov = new Uint32Array(N * NW), below = new Uint32Array(N * NW), above = new Uint32Array(N * NW);
        const topC = new Float64Array(N * NW * 32), botC = new Float64Array(N * NW * 32), first = new Float64Array(N), last = new Float64Array(N), unary = new Float64Array(N);
        C.forEach((c, i) => {
          for (let n = 0; n < M; n++) {
            const I = IV[n], w = (n >> 5), bit = 1 << (n & 31);
            if (c.cov[n]) { cov[i * NW + w] |= bit; topC[i * NW * 32 + n] = ov(c.y - I.t - R.eMax, I.w); botC[i * NW * 32 + n] = ov(I.b - c.yb - R.eMax, I.w); first[i] += topC[i * NW * 32 + n]; last[i] += botC[i * NW * 32 + n]; }
            else { if (I.b < c.b1) first[i] += holeW[n]; if (c.b1 <= I.b + EPS && c.b0 < I.t) last[i] += holeW[n]; }
            if (c.b1 <= I.b + EPS && c.b0 < I.t) below[i * NW + w] |= bit;
            if (I.b < c.b1 - EPS) above[i * NW + w] |= bit;
          }
          unary[i] = c.towers * (c.fam.main ? 100 : WT.S) + c.bent * WT.B;
        });
        const m1 = new Uint32Array(NW), m2 = new Uint32Array(NW), m3 = new Uint32Array(NW), m4 = new Uint32Array(NW);
        // two consecutive rows further apart than this would leave an unsupported band anyway
        const CAP = R.gy + 2 * R.eMax + 250;
        for (let i = 0; i < N; i++) {
          const c = C[i];
          let bv = first[i], bp = -1;
          for (let p = i - 1; p >= 0; p--) {
            const q = C[p];
            if (q.y < c.y - CAP - 200) break;             // candidates are sorted by y
            if (c.y < q.yb + 30 - EPS || c.y - q.yb > CAP) continue;   // plates of two rows never touch (and the gap stays on the module)
            let v = cost[p];
            if (v >= bv) continue;
            if (NW === 1) {   // the usual case (≤ 32 intervals): inline bit loops
              const a = cov[p], b = cov[i], over = c.y - q.yb - R.gy;
              let x = a & b;
              if (over > 0) while (x) { v += over * WT.G * wid[31 - Math.clz32(x & -x)]; x &= x - 1; }
              x = a & ~b; const pb = p * 32; while (x) { v += botC[pb + 31 - Math.clz32(x & -x)]; x &= x - 1; }
              x = b & ~a; const ib = i * 32; while (x) { v += topC[ib + 31 - Math.clz32(x & -x)]; x &= x - 1; }
              x = ~a & ~b & below[p] & above[i]; while (x) { v += holeW[31 - Math.clz32(x & -x)]; x &= x - 1; }
              if (v < bv) { bv = v; bp = p; }
              continue;
            }
            for (let w = 0; w < NW; w++) {
              const a = cov[p * NW + w], b = cov[i * NW + w];
              m1[w] = a & b; m2[w] = a & ~b; m3[w] = b & ~a; m4[w] = ~a & ~b & below[p * NW + w] & above[i * NW + w];
            }
            const over = c.y - q.yb - R.gy;
            if (over > 0) v += over * WT.G * sumBits(m1, wid, 0);
            v += sumBits(m2, botC, p * NW * 32) + sumBits(m3, topC, i * NW * 32) + sumBits(m4, holeW, 0);   // nothing stands in m4
            if (v < bv) { bv = v; bp = p; }
          }
          cost[i] = bv + unary[i];
          prev[i] = bp;
        }
        for (let i = 0; i < N; i++) {
          const tot = cost[i] + last[i];
          if (!best || tot < best.tot - EPS) { const rows = []; for (let k = i; k >= 0; k = prev[k]) rows.unshift(C[k]); best = { tot, rows }; }
        }
      }
      const towers = [];
      if (!best) return { towers, rows: [] };
      best.rows.forEach((r, ri) => {
        for (const { x0, pl } of r.plans) {
          let x = x0 + pl.m;
          for (const px of pl.seq) {
            const t = r.fam.types.map((id) => TT[id]).find((q) => q.px === px);
            towers.push({ type: t.id, x: x + px / 2, y: r.y + t.py / 2, bay: bay.id, row: ri });
            x += px + pl.g;
          }
        }
      });
      return { towers, rows: best.rows.map((r) => ({ y: r.y, py: r.py, fam: r.fam.key, n: r.towers, bent: r.bent > 0 })) };
    }

    /* ---- tower geometry ---- */
    const plate = (s) => { const t = TT[s.type]; return [s.x - t.wx / 2, s.y - t.wy / 2, s.x + t.wx / 2, s.y + t.wy / 2]; };
    function jacksOn(s, d) {
      const t = TT[s.type], hx = t.px / 2, hy = t.py / 2;
      if (d === "+x") return [[s.x + hx, s.y - hy], [s.x + hx, s.y + hy]];
      if (d === "-x") return [[s.x - hx, s.y - hy], [s.x - hx, s.y + hy]];
      if (d === "+y") return [[s.x - hx, s.y + hy], [s.x + hx, s.y + hy]];
      return [[s.x - hx, s.y - hy], [s.x + hx, s.y - hy]];
    }
    // distance along the ray to another tower's plate; a plate behind the jack is never hit
    function rayToPlate(o, d, x, y) {
      const p = plate(o);
      if (d === "+x" || d === "-x") {
        if (y < p[1] - EPS || y > p[3] + EPS) return Infinity;
        if (d === "+x" ? p[2] <= x + EPS : p[0] >= x - EPS) return Infinity;
        return d === "+x" ? p[0] - x : x - p[2];
      }
      if (x < p[0] - EPS || x > p[2] + EPS) return Infinity;
      if (d === "+y" ? p[3] <= y + EPS : p[1] >= y - EPS) return Infinity;
      return d === "+y" ? p[1] - y : y - p[3];
    }

    /* ---- validation of one room ----
       along the rows (beam direction): each jack looks for the next tower's plate or a wall;
       across the rows: each jack looks for the next row's beam line or a wall. A sub-row's deck
       reaches past its end jacks up to the wall (at most the max distance), so a band that another
       row already serves is not reported twice. Relations carry the measured value so the UI can
       draw them as dimensions. */
    function validateBay(bay, towers, R) {
      const geo = bay.geo, issues = [], rels = [], seen = new Set(), N = towers.length;
      const gapCheck = (s, b, ax, d, g, x, y) => {
        const gMax = ax === "x" ? R.gx : R.gy;
        const rel = { kind: "gap", a: s.id, b, axis: ax, dir: d, v: g, x, y, ok: true };
        let k = null;
        if (g > 0.5 && !isMod(g)) k = { kind: "mod", hard: true };
        else if (g > gMax + 0.5) k = { kind: "gmax", hard: false, lim: gMax };
        if (k) { rel.ok = false; issues.push({ ...k, a: s.id, b, axis: ax, v: g, bay: bay.id, rel }); }
        rels.push(rel);
      };
      const edgeCheck = (s, ax, d, hits) => {
        if (!hits.length) return;
        const open = hits.filter((h) => !h.cov), far = (open.length ? open : hits).reduce((u, v) => (v.m > u.m ? v : u));
        const rel = { kind: "edge", a: s.id, axis: ax, dir: d, v: far.m, x: far.x, y: far.y, ok: true, cov: !open.length, reach: open.length ? far.m : Math.min(far.m, R.eMax) };
        if (open.length && far.m > R.eMax + 0.5) { rel.ok = false; issues.push({ kind: "emax", hard: false, a: s.id, axis: ax, v: far.m, lim: R.eMax, bay: bay.id, rel }); }
        rels.push(rel);
      };
      for (const s of towers) { s.out = !rectIn(geo, plate(s), SAFE - 0.05); if (s.out) issues.push({ kind: "wall", hard: true, a: s.id, bay: bay.id }); }
      const parent = towers.map((_, i) => i);
      const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      const xHits = [];
      for (let si = 0; si < N; si++) {
        const s = towers[si];
        if (s.out) continue;
        const t = TT[s.type];
        for (const d of ["+x", "-x"]) {
          const hits = [];
          for (const [jx, jy] of jacksOn(s, d)) {
            // measured on the jack line and 3 cm inside it, so a wall corner a hair off the line is not read as open floor
            let best = Math.min(rayWall(geo, jx, jy, d), rayWall(geo, jx, jy + (s.y > jy ? 3 : -3), d)), hi = -1;
            for (let oi = 0; oi < N; oi++) {
              if (oi === si || towers[oi].out) continue;
              const dist = rayToPlate(towers[oi], d, jx, jy);
              if (dist < best - EPS) { best = dist; hi = oi; }
            }
            if (hi >= 0) {
              const o = towers[hi], ot = TT[o.type];
              if (Math.abs(o.y - s.y) < 0.5 && ot.py === t.py) parent[find(si)] = find(hi);
              const key = (s.id < o.id ? s.id + "|" + o.id : o.id + "|" + s.id) + "x";
              if (seen.has(key)) continue;
              seen.add(key);
              const g = d === "+x" ? o.x - ot.px / 2 - (s.x + t.px / 2) : s.x - t.px / 2 - (o.x + ot.px / 2);
              gapCheck(s, o.id, "x", d, g, jx, jy);
            } else if (best < Infinity) hits.push({ m: best, x: jx, y: jy });
          }
          xHits.push([s, d, hits]);
        }
      }
      // rows: towers on one head line linked along x carry one continuous beam line per face; the
      // deck of that sub-row reaches from wall to wall when its end jacks are close enough
      const segs = new Map();
      towers.forEach((s, i) => {
        if (s.out) return;
        const r = find(i), t = TT[s.type];
        let g = segs.get(r);
        if (!g) { g = { id: bay.id + ":" + r, bay: bay.id, x0: Infinity, x1: -Infinity, cx0: Infinity, cx1: -Infinity, yT: s.y - t.py / 2, yB: s.y + t.py / 2, members: [] }; segs.set(r, g); }
        const jl = s.x - t.px / 2, jr = s.x + t.px / 2;
        g.x0 = Math.min(g.x0, jl - RIM);
        g.x1 = Math.max(g.x1, jr + RIM);
        g.cx0 = Math.min(g.cx0, jl - Math.min(R.eMax, rayWall(geo, jl, s.y, "-x")));
        g.cx1 = Math.max(g.cx1, jr + Math.min(R.eMax, rayWall(geo, jr, s.y, "+x")));
        g.members.push(s);
        s.seg = g.id;
      });
      const SG = [...segs.values()];
      // along a row, past the max distance from the end jack: is that stretch under another row's deck?
      const coveredX = (s, d, h) => {
        const a = d === "+x" ? h.x + R.eMax : h.x - h.m, b = d === "+x" ? h.x + h.m : h.x - R.eMax;
        return SG.some((g) => g.id !== s.seg && g.cx0 <= a + 1 && g.cx1 >= b - 1 && Math.min(Math.abs(g.yT - h.y), Math.abs(g.yB - h.y)) <= R.eMax + 0.5);
      };
      for (const [s, d, hits] of xHits) { hits.forEach((h) => (h.cov = h.m > R.eMax + 0.5 && coveredX(s, d, h))); edgeCheck(s, "x", d, hits); }
      for (const s of towers) {
        if (s.out) continue;
        for (const d of ["+y", "-y"]) {
          const hits = [];
          for (const [jx, jy] of jacksOn(s, d)) {
            let best = Math.min(rayWall(geo, jx, jy, d), rayWall(geo, jx + (s.x > jx ? 3 : -3), jy, d)), hs = null;
            for (const g of SG) {
              if (g.id === s.seg || jx < g.cx0 - EPS || jx > g.cx1 + EPS) continue;
              const dist = d === "+y" ? g.yT - jy : jy - g.yB;
              if (dist > -0.5 && dist < best - EPS) { best = dist; hs = g; }
            }
            if (hs) {
              const b = hs.members.reduce((u, v) => (Math.abs(v.x - jx) < Math.abs(u.x - jx) ? v : u));
              const key = (s.id < b.id ? s.id + "|" + b.id : b.id + "|" + s.id) + "y";
              if (seen.has(key)) continue;
              seen.add(key);
              gapCheck(s, b.id, "y", d, best, jx, jy);
            } else if (best < Infinity) hits.push({ m: best, x: jx, y: jy });
          }
          edgeCheck(s, "y", d, hits);
        }
      }
      // one issue per unsupported stretch of wall: towers facing the same wall face side by side merge
      const out = [], groups = new Map();
      for (const i of issues) {
        if (i.kind !== "emax") { out.push(i); continue; }
        const r = i.rel, w = r.dir === "+x" ? r.x + r.v : r.dir === "-x" ? r.x - r.v : r.dir === "+y" ? r.y + r.v : r.y - r.v;
        const k = r.dir + "|" + Math.round(w), along = r.axis === "x" ? r.y : r.x;
        const g = (groups.get(k) || []).find((q) => Math.abs(q.along - along) < R.gx + 200);
        if (g) { g.i.more.push(i.a); g.along = along; if (i.v > g.i.v) Object.assign(g.i, { v: i.v, rel: i.rel }); continue; }
        const ni = { ...i, more: [] };
        out.push(ni);
        groups.set(k, [...(groups.get(k) || []), { along, i: ni }]);
      }
      return { issues: out, rels, segs: SG };
    }
    // every room + the check that crosses rooms (two plates on top of each other)
    function validateAll(bays, towers, Rof) {
      const out = { issues: [], rels: [], segs: [] };
      for (const b of Object.values(bays)) {
        const v = validateBay(b, towers.filter((s) => s.bay === b.id), Rof(b));
        out.issues.push(...v.issues); out.rels.push(...v.rels); out.segs.push(...v.segs);
      }
      for (let i = 0; i < towers.length; i++)
        for (let j = i + 1; j < towers.length; j++) {
          const a = plate(towers[i]), b = plate(towers[j]);
          if (Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0.5 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0.5)
            out.issues.push({ kind: "overlap", hard: true, a: towers[i].id, b: towers[j].id, bay: towers[i].bay });
        }
      return out;
    }

    /* ---- primary beams: two per tower (one per ladder face), each on its own two heads + the next
       tower's near head, shortest catalogue length, alternating lanes, inside the room ---- */
    function beamsFor(bays, towers, v) {
      const beams = [], anomalies = [];
      const linked = new Set(v.rels.filter((r) => r.kind === "gap" && r.axis === "x").map((r) => (r.a < r.b ? r.a + "|" + r.b : r.b + "|" + r.a)));
      let wide = 0;
      for (const g of v.segs) {
        const m = [...g.members].sort((a, b) => a.x - b.x);
        const geo = bays[g.bay].geo;
        // a beam end may sit flush on a wall face (1 cm tolerance), never past it
        const fits = (x0, len, y) => rectIn(geo, [x0, y - BEAM_W / 2, x0 + len, y + BEAM_W / 2], -1);
        m.forEach((s, i) => {
          const t = TT[s.type], n = m[i + 1];
          const lane = (i % 2 ? 1 : -1) * BEAM_W / 2;
          const faces = [s.y - t.py / 2 + lane, s.y + t.py / 2 + lane];
          let span = null;
          if (n && linked.has(s.id < n.id ? s.id + "|" + n.id : n.id + "|" + s.id)) {
            const a = s.x - t.px / 2 - RIM, b = n.x - TT[n.type].px / 2 + RIM;
            const len = CATALOG.find((c) => c >= b - a - EPS);
            if (len) for (const x0 of [a, b - len]) if (faces.every((y) => fits(x0, len, y))) { span = { x0, len, link: n.id }; break; }
          }
          if (!span) {
            const a = s.x - t.px / 2 - RIM, b = s.x + t.px / 2 + RIM, len = CATALOG.find((c) => c >= b - a - EPS);
            for (const x0 of [b - len, a, (a + b) / 2 - len / 2]) if (faces.every((y) => fits(x0, len, y))) { span = { x0, len, link: null }; break; }
          }
          if (!span) { anomalies.push(s.id); return; }
          if (span.link) wide += 2;
          for (const y of faces) beams.push({ x0: span.x0, len: span.len, y, tid: s.id, link: span.link });
        });
      }
      return { beams, wide, anomalies };
    }

    /* ---- load on each tower: its share of the deck (half the gap to each neighbour, the whole
       distance to a wall) times q, plus the extra weight of a slab beam standing on that share ---- */
    function loadsFor(bays, towers, v, dOf, sbeams) {
      const opp = { "+x": "-x", "-x": "+x", "+y": "-y", "-y": "+y" };
      const reach = {};
      towers.forEach((s) => (reach[s.id] = { "+x": 0, "-x": 0, "+y": 0, "-y": 0 }));
      for (const r of v.rels) {
        if (!reach[r.a]) continue;
        const v0 = Math.max(0, r.v), part = r.kind === "gap" ? v0 / 2 : Math.max(0, r.reach != null ? r.reach : v0);
        reach[r.a][r.dir] = Math.max(reach[r.a][r.dir], part);
        if (r.kind === "gap" && reach[r.b]) reach[r.b][opp[r.dir]] = Math.max(reach[r.b][opp[r.dir]], part);
      }
      const out = {};
      for (const s of towers) {
        const t = TT[s.type], e = reach[s.id], d = dOf(s.bay);
        const tr = [s.x - t.px / 2 - e["-x"], s.y - t.py / 2 - e["-y"], s.x + t.px / 2 + e["+x"], s.y + t.py / 2 + e["+y"]];
        let kN = (qOf(d) * (tr[2] - tr[0]) * (tr[3] - tr[1])) / 1e4, beam = 0;
        for (const b of sbeams) for (const p of b.inside[s.bay] || []) {
          const w = Math.min(p[2], tr[2]) - Math.max(p[0], tr[0]), h = Math.min(p[3], tr[3]) - Math.max(p[1], tr[1]);
          if (w > 0 && h > 0) beam += (((LOAD.conc * (b.h - d)) / 100) * w * h) / 1e4;
        }
        kN += beam;
        out[s.id] = { kN, leg: kN / 4, beam, area: ((tr[2] - tr[0]) * (tr[3] - tr[1])) / 1e4 };
      }
      return out;
    }
    // the part of a slab beam that stands on a room's deck (what lies over a wall goes to the wall)
    function beamInside(geo, r) {
      const out = [];
      for (const s of geo.S) {
        const x0 = Math.max(r[0], s.x0), x1 = Math.min(r[2], s.x1);
        if (x1 - x0 < 0.5) continue;
        for (const [t, b] of s.iv) { const y0 = Math.max(r[1], t), y1 = Math.min(r[3], b); if (y1 - y0 > 0.5) out.push([x0, y0, x1, y1]); }
      }
      return out;
    }

    return { MOD, RIM, BEAM_W, SAFE, STACK, STACK_T, LOAD, CATALOG, FRAMES, JACK, TYPES, TT, SPACING, floor5, ceil5, isMod, qOf, gridLoad, compose, pip, geoOf, rectIn, rayWall, layoutSeq, axisPlan, placeBay, plate, jacksOn, validateBay, validateAll, beamsFor, loadsFor, beamInside };
  })();

  if (typeof document === "undefined") { if (typeof module !== "undefined") module.exports = AK; return; }

  /* ================================= UI ================================= */
  fetch("/catalog/akro/data.json")
    .then((r) => r.json())
    .then(init)
    .catch(() => { document.body.insertAdjacentHTML("beforeend", '<p style="padding:24px">הדמו לא נטען. רעננו את הדף.</p>'); });

  function init(DATA) {
    const TT = AK.TT;
    const W = DATA.size[0], H = DATA.size[1];
    const polyArea = (p) => Math.abs(p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;
    const BAYS = DATA.zones.map((b) => ({ ...b, area: polyArea(b.poly) / 1e4, geo: AK.geoOf(b.poly) }));
    const BAY = Object.fromEntries(BAYS.map((b) => [b.id, b]));
    const AREA = BAYS.reduce((a, b) => a + b.area, 0);
    const THK = Object.keys(AK.SPACING).map(Number);
    const THK_COLOR = { 15: "#6fcf97", 20: "#5b9dff", 25: "#c08bff", 30: "#ff9f5b", 35: "#ff7a8a", 40: "#ffd166" };
    const WIN = DATA.windows.map(([x, y, w, h]) => ({ r: [x, y, x + w, y + h], len: Math.max(w, h) }));
    const ovl = (a, b, tol = 0.5) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > tol && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > tol;
    // slab beams: bounding box, the rooms they touch, the openings under them, the part standing on each deck
    const SB = DATA.sbeams.map((b) => {
      const bb = [Math.min(...b.r.map((r) => r[0])), Math.min(...b.r.map((r) => r[1])), Math.max(...b.r.map((r) => r[2])), Math.max(...b.r.map((r) => r[3]))];
      const inside = {};
      BAYS.forEach((z) => { const p = b.r.flatMap((r) => AK.beamInside(z.geo, r)); if (p.length) inside[z.id] = p; });
      const touch = BAYS.filter((z) => b.r.some((r) => AK.beamInside(z.geo, [r[0] - 2, r[1] - 2, r[2] + 2, r[3] + 2]).length));
      const over = WIN.filter((w) => b.r.some((r) => ovl(r, w.r)));
      return { ...b, bb, len: Math.max(bb[2] - bb[0], bb[3] - bb[1]), inside, touch: touch.map((z) => z.id), over };
    });
    const PROPS = SB.flatMap((b) => b.over.map((w) => ({ beam: b.id, len: w.len, n: Math.ceil(w.len / 100) + 1 })));

    const S = {
      thick: {}, gap: {}, eMax: 40, swl: 20, floor: -7,
      sec: { T2: true, T3: true, T4: true, T5: true, T6: true },
      towers: [], base: {}, rows: {}, placedKey: "", animated: false, baseKeys: new Set(),
      v: { issues: [], rels: [], segs: [] }, bm: { beams: [], wide: 0, anomalies: [] }, loads: {},
      sel: null, bay: null, sb: null, moved: new Set(), snap: false,
      layers: { tw: true, bm: true, dim: true, pz: true, lb: false },
    };
    BAYS.forEach((b) => { S.thick[b.id] = b.d; S.gap[b.id] = AK.SPACING[b.d].slice(); });
    const Rof = (b) => ({ gx: S.gap[b.id][0], gy: S.gap[b.id][1], eMax: S.eMax });
    const enabled = () => Object.keys(S.sec).filter((k) => S.sec[k]);
    const ruleKey = () => JSON.stringify([S.gap, S.eMax, enabled()]);
    const soffit = (b) => BAY[b].top - S.thick[b];
    const towerH = (b) => soffit(b) - AK.STACK_T - S.floor;
    const comp = (b) => AK.compose(towerH(b));
    const lvl = (cm) => (cm > 0 ? "+" : cm < 0 ? "−" : "±") + (Math.abs(cm) / 100).toFixed(2);
    const m2 = (cm) => (Math.round(cm) / 100).toFixed(2);
    const compTxt = (c) => c.ok ? `מסגרות ${c.frames.map(m2).join("+")} · ג'ק ${r1(c.base)} · ראש U ${r1(c.head)}` : "אין הרכב בטווח הג'קים";

    const D = Demo({
      slug: "akro",
      plugin: "AKRO",
      tag: "AutoCAD plug-in · תמיכות זמניות",
      title: "מגדלי אקרו: הצבה ובקרת מרווחים",
      sub: "תקרת גג של בית פרטי בשני מפלסים, כולל ממ״ד. מגדלי תמיכה מוצבים לפי כללי המהנדס, וכל מרווח נבדק.",
      file: "ROOF_SLAB_DEMO.dwg",
      viewBox: [-170, -175, W + 340, H + 330],
      flipY: H,
      kpis: [{ id: "area", label: "שטח תבנית" }, { id: "tw", label: "מגדלים" }, { id: "bm", label: "קורות" }, { id: "iss", label: "חריגות" }],
      steps: [
        { t: "קריאת התקרה", d: "קירות, קורות, מפלסים", cmd: "OPEN ROOF_SLAB_DEMO.dwg" },
        { t: "כללי המהנדס", d: "מרווחים לפי עובי", cmd: "AKRO_PLACE  ›  Spacing" },
        { t: "הצבה אוטומטית", d: "מגדלים וקורות", cmd: "AKRO_PLACE  ›  Place by zone" },
        { t: "בקרת מרווחים", d: "גררו מגדל, ראו מידות", cmd: "AKRO_PLACE  ›  Check" },
        { t: "רשימת ציוד", d: "כמויות לאקסל", cmd: "AKRO_EXPORT" },
      ],
      onStep,
    });
    const svg = D.svg, el = D.el, fmt = D.fmt, esc = D.esc;
    const $ = (id) => document.getElementById(id);
    function r1(v) { return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1); }

    /* ------------------------------ static drawing ------------------------------ */
    el("rect", { x: -170, y: -175, width: W + 340, height: H + 330, fill: "#111519" });
    const gBay = el("g", {}), gWall = el("g", {}), gSB = el("g", {}), gEdge = el("g", {}), gPZ = el("g", { id: "gPZ" });
    const gTow = el("g", { id: "gTow" }), gBeam = el("g", { id: "gBeam" }), gChain = el("g", { id: "gChain" }), gLive = el("g", {}), gViol = el("g", { id: "gViol" }), gTag = el("g", {}), gDim0 = el("g", {});
    const bayEl = {}, sbEl = {}, winEl = [];
    BAYS.forEach((b) => { bayEl[b.id] = el("polygon", { class: "bay", points: b.poly.map((p) => p.join(",")).join(" "), "data-bay": b.id }, gBay); });
    DATA.walls.forEach((poly) => el("path", { class: "wall", d: poly.map((ring) => "M" + ring.map((p) => p.join(",")).join("L") + "Z").join("") }, gWall));
    WIN.forEach((w) => {
      const [x0, y0, x1, y1] = w.r, g = el("g", { class: "win" }, gWall);
      el("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, g);
      if (x1 - x0 >= y1 - y0) el("line", { x1: x0, y1: (y0 + y1) / 2, x2: x1, y2: (y0 + y1) / 2 }, g);
      else el("line", { x1: (x0 + x1) / 2, y1: y0, x2: (x0 + x1) / 2, y2: y1 }, g);
      winEl.push({ g, w });
    });
    DATA.hid.forEach(([a, b]) => el("line", { class: "hid", x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, gSB));
    SB.forEach((b) => {
      const g = el("g", { class: "sb", "data-sb": b.id }, gSB);
      b.r.forEach((r) => el("rect", { x: r[0], y: r[1], width: r[2] - r[0], height: r[3] - r[1] }, g));
      const vert = b.bb[3] - b.bb[1] > b.bb[2] - b.bb[0], cx = (b.bb[0] + b.bb[2]) / 2, cy = (b.bb[1] + b.bb[3]) / 2;
      const tx = vert ? b.bb[2] + 30 : cx, ty = vert ? cy : b.bb[3] + 34;
      const t = el("text", vert ? { x: tx, y: ty, transform: `rotate(-90 ${tx} ${ty})` } : { x: tx, y: ty }, g);
      t.textContent = `${b.id} ${b.w}/${b.h}`;
      sbEl[b.id] = g;
    });
    el("polygon", { class: "edge", points: DATA.slab.map((p) => p.join(",")).join(" ") }, gEdge);
    BAYS.forEach((b) => el("polygon", { class: "pz", points: b.poly.map((p) => p.join(",")).join(" ") }, gPZ));
    // bay tags: at the centre of the widest inside rectangle of each room
    const tagPos = {};
    BAYS.forEach((b) => {
      let best = null;
      for (const s of b.geo.S) for (const [t, bt] of s.iv) { const a = s.w * (bt - t); if (!best || a > best.a) best = { a, x: (s.x0 + s.x1) / 2, y: (t + bt) / 2 }; }
      tagPos[b.id] = b.id === "B" ? [1450, 760] : b.id === "A" ? [430, 980] : [best.x, best.y];
    });
    function drawTags(show) {
      gTag.innerHTML = "";
      if (!show) return;
      BAYS.forEach((b) => {
        const [x, y] = tagPos[b.id], g = el("g", { class: "tag" }, gTag);
        el("text", { class: "t1", x, y: y - 26 }, g).textContent = b.mamad ? `${b.id} · ממ״ד` : b.id;
        el("text", { class: "t2", x, y: y + 18 }, g).textContent = `d=${S.thick[b.id]} · ${lvl(b.top)}`;
        el("text", { class: "t2", x, y: y + 52 }, g).textContent = `${fmt(b.area, 1)} m²`;
      });
    }
    function dim(g, x1, y1, x2, y2, label, cls, ext) {
      const horiz = Math.abs(y2 - y1) < 0.01;
      const e = el("g", { class: "dim " + (cls || "") }, g);
      if (ext) ext.forEach(([a, b, c, d]) => el("line", { class: "ex", x1: a, y1: b, x2: c, y2: d }, e));
      el("line", { x1, y1, x2, y2 }, e);
      for (const [x, y] of [[x1, y1], [x2, y2]]) el("line", { class: "tk", x1: x - 7, y1: y + 7, x2: x + 7, y2: y - 7 }, e);
      const tx = (x1 + x2) / 2, ty = (y1 + y2) / 2;
      const t = el("text", horiz ? { x: tx, y: ty - 9 } : { x: tx - 9, y: ty, transform: `rotate(-90 ${tx - 9} ${ty})` }, e);
      t.textContent = label;
      return e;
    }
    function drawOverall(show) {
      gDim0.innerHTML = "";
      if (!show) return;
      dim(gDim0, 0, -95, W, -95, r1(W), "", [[0, -120, 0, -10], [W, -120, W, -10]]);
      dim(gDim0, -95, 0, -95, H, r1(H), "", [[-120, 0, -10, 0], [-120, H, -10, H]]);
    }

    /* ------------------------------ placement ------------------------------ */
    const issueKey = (i) => [i.kind, i.a, i.b || "", i.axis || "", i.rel ? i.rel.dir : ""].join("|");
    function place() {
      const towers = [];
      S.rows = {};
      let n = 0;
      for (const b of BAYS) {
        const res = AK.placeBay(b, Rof(b), enabled());
        S.rows[b.id] = res.rows;
        res.towers.forEach((t) => towers.push({ ...t, id: String(++n).padStart(2, "0") }));
      }
      S.towers = towers;
      S.base = Object.fromEntries(towers.map((s) => [s.id, { x: s.x, y: s.y, bay: s.bay }]));
      S.moved = new Set();
      S.sel = null;
      S.placedKey = ruleKey();
      S.animated = false;
      check();
      S.baseKeys = new Set(S.v.issues.map(issueKey));
    }
    function ensurePlaced() { if (S.placedKey !== ruleKey()) place(); }
    function check() {
      S.v = AK.validateAll(BAY, S.towers, Rof);
      S.bm = AK.beamsFor(BAY, S.towers, S.v);
      S.loads = AK.loadsFor(BAY, S.towers, S.v, (b) => S.thick[b], SB);
      updateKpi();
    }
    const byId = (id) => S.towers.find((s) => s.id === id);
    const bayAt = (x, y) => BAYS.find((b) => AK.pip(b.poly, x, y));

    /* ------------------------------ rendering ------------------------------ */
    const twEl = {};
    function drawTowers(mode) {
      gTow.innerHTML = "";
      for (const k in twEl) delete twEl[k];
      S.towers.forEach((s, i) => {
        const t = TT[s.type];
        const g = el("g", { class: "tw" + (mode === "ghost" ? " ghost" : ""), "data-hit": "", "data-id": s.id, transform: `translate(${s.x} ${s.y})`, style: `--c:${t.color}` }, gTow);
        const inner = el("g", { class: "in" }, g);
        el("rect", { class: "pl", x: -t.wx / 2, y: -t.wy / 2, width: t.wx, height: t.wy, rx: 3 }, inner);
        el("rect", { class: "fr", x: -t.px / 2, y: -t.py / 2, width: t.px, height: t.py }, inner);
        el("line", { class: "xb", x1: -t.px / 2, y1: -t.py / 2, x2: t.px / 2, y2: t.py / 2 }, inner);
        el("line", { class: "xb", x1: t.px / 2, y1: -t.py / 2, x2: -t.px / 2, y2: t.py / 2 }, inner);
        el("line", { class: "ld", x1: -t.px / 2, y1: -t.py / 2, x2: t.px / 2, y2: -t.py / 2 }, inner);
        el("line", { class: "ld", x1: -t.px / 2, y1: t.py / 2, x2: t.px / 2, y2: t.py / 2 }, inner);
        for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) el("circle", { class: "jk", cx: (x * t.px) / 2, cy: (y * t.py) / 2, r: 8 }, inner);
        el("text", { class: "lb", x: 0, y: 0 }, inner).textContent = s.id;
        if (mode === "anim") { inner.classList.add("pop"); inner.style.animationDelay = (0.05 + i * 0.035).toFixed(2) + "s"; }
        twEl[s.id] = g;
      });
      paintTowers();
    }
    function moveEl(s) { const g = twEl[s.id]; if (g) g.setAttribute("transform", `translate(${s.x} ${s.y})`); }
    function paintTowers() {
      const bad = new Set();
      S.v.issues.forEach((i) => { if (S.baseKeys.has(issueKey(i)) && !i.hard) return; bad.add(i.a); if (i.b) bad.add(i.b); });
      const nob = new Set(S.bm.anomalies);
      S.towers.forEach((s) => {
        const g = twEl[s.id];
        if (!g) return;
        g.classList.toggle("bad", D.step === 4 && bad.has(s.id));
        g.classList.toggle("sel", S.sel === s.id);
        g.classList.toggle("nobeam", nob.has(s.id));
      });
    }
    function drawBeams(anim) {
      gBeam.innerHTML = "";
      S.bm.beams.forEach((b, i) => {
        const r = el("rect", { class: "bm", x: b.x0, y: b.y - AK.BEAM_W / 2, width: b.len, height: AK.BEAM_W }, gBeam);
        if (anim) { r.classList.add("fade"); r.style.animationDelay = (0.25 + S.towers.length * 0.035 + i * 0.006).toFixed(2) + "s"; }
      });
    }
    // AKRO-DIMENSIONS: one chain per sub-row along the lower jack line, one chain per room down a column
    function drawChains(anim) {
      gChain.innerHTML = "";
      const delay = anim ? (0.6 + S.towers.length * 0.035 + S.bm.beams.length * 0.006).toFixed(2) + "s" : null;
      const put = (x1, y1, x2, y2, v) => { if (v < 1) return; const e = dim(gChain, x1, y1, x2, y2, r1(v), "chain"); if (delay) { e.classList.add("fade"); e.style.animationDelay = delay; } };
      for (const b of BAYS) {
        const ts = S.towers.filter((s) => s.bay === b.id && !s.out);
        if (!ts.length) continue;
        const rows = {};
        ts.forEach((s) => { const k = Math.round(s.y); (rows[k] = rows[k] || []).push(s); });
        Object.values(rows).forEach((row) => {
          row.sort((a, c) => a.x - c.x);
          const y = row[0].y + TT[row[0].type].py / 2 + 24, yj = row[0].y + TT[row[0].type].py / 2;
          row.forEach((s, i) => {
            const t = TT[s.type], L = s.x - t.px / 2, R = s.x + t.px / 2;
            const prev = row[i - 1], wl = AK.rayWall(b.geo, L, yj, "-x");
            if (!prev || L - wl > prev.x + TT[prev.type].px / 2 + 0.5) put(L - wl, y, L, y, wl);
            else put(prev.x + TT[prev.type].px / 2, y, L, y, L - (prev.x + TT[prev.type].px / 2));
            const nx = row[i + 1], wr = AK.rayWall(b.geo, R, yj, "+x");
            if (!nx || R + wr < nx.x - TT[nx.type].px / 2 - 0.5) put(R, y, R + wr, y, wr);
          });
        });
        // the column standing on the most towers (leftmost on ties)
        const cols = {};
        ts.forEach((s) => { const k = Math.round(s.x); (cols[k] = cols[k] || []).push(s); });
        const col = Object.values(cols).sort((a, c) => c.length - a.length || a[0].x - c[0].x)[0].sort((a, c) => a.y - c.y);
        const tc = TT[col[0].type], x = col[0].x - tc.px / 2 - 24, xj = col[0].x - tc.px / 2;
        col.forEach((s, i) => {
          const t = TT[s.type], T0 = s.y - t.py / 2, B0 = s.y + t.py / 2, prev = col[i - 1];
          if (!prev) { const w = AK.rayWall(b.geo, xj, T0, "-y"); put(x, T0 - w, x, T0, w); }
          else put(x, prev.y + TT[prev.type].py / 2, x, T0, T0 - (prev.y + TT[prev.type].py / 2));
          if (!col[i + 1]) { const w = AK.rayWall(b.geo, xj, B0, "+y"); put(x, B0, x, B0 + w, w); }
        });
      }
    }
    // live dimensions: every relation that breaks a rule, plus all of the selected tower's
    function relLine(r) {
      const s = { "+x": [1, 0], "-x": [-1, 0], "+y": [0, 1], "-y": [0, -1] }[r.dir];
      return [r.x, r.y, r.x + s[0] * r.v, r.y + s[1] * r.v];
    }
    function drawLive() {
      gLive.innerHTML = "";
      if (D.step !== 4) return;
      const shown = new Set(), sel = S.sel;
      const bentRel = new Set(S.v.issues.filter((i) => !i.hard && S.baseKeys.has(issueKey(i))).flatMap((i) => [i.a, ...(i.more || [])].map((a) => a + "|" + i.rel.dir)));
      S.v.rels.forEach((r) => {
        const mine = sel && (r.a === sel || r.b === sel);
        if (r.ok && !mine) return;
        const [x1, y1, x2, y2] = relLine(r);
        const key = [x1, y1, x2, y2].map((v) => Math.round(v)).join(",");
        if (shown.has(key) || Math.abs(r.v) < 0.5) return;
        shown.add(key);
        dim(gLive, x1, y1, x2, y2, r1(r.v), r.ok ? "ok" : r.kind === "edge" && bentRel.has(r.a + "|" + r.dir) ? "warn" : "bad");
      });
    }
    // AKRO-VIOLATIONS: numbered circles, red = never allowed, orange = a bent rule
    function issuePos(i) {
      if (i.rel) { const [x1, y1, x2, y2] = relLine(i.rel); return [(x1 + x2) / 2, (y1 + y2) / 2]; }
      const a = byId(i.a), b = i.b && byId(i.b);
      return b ? [(a.x + b.x) / 2, (a.y + b.y) / 2] : [a.x, a.y];
    }
    function drawViol(show) {
      gViol.innerHTML = "";
      if (!show) return;
      S.v.issues.forEach((i, k) => {
        const [x, y] = issuePos(i), g = el("g", { class: "vm " + (i.hard ? "hard" : "soft") }, gViol);
        el("circle", { cx: x, cy: y, r: 26 }, g);
        el("text", { x, y }, g).textContent = k + 1;
      });
    }
    function setLayers() {
      const c = D.canvas.classList;
      c.toggle("hide-tw", !S.layers.tw);
      c.toggle("hide-bm", !S.layers.bm);
      c.toggle("hide-dim", !S.layers.dim);
      c.toggle("hide-pz", !S.layers.pz);
      c.toggle("labels", S.layers.lb);
    }
    function paintBays(strong) {
      BAYS.forEach((b) => {
        const e = bayEl[b.id];
        e.setAttribute("fill", THK_COLOR[S.thick[b.id]]);
        e.setAttribute("fill-opacity", strong ? 0.12 : 0.05);
        e.classList.toggle("hl", S.bay === b.id);
      });
      SB.forEach((b) => sbEl[b.id].classList.toggle("hl", S.sb === b.id));
      const crit = new Set(SB.flatMap((b) => b.over));
      winEl.forEach(({ g, w }) => g.classList.toggle("crit", strong && crit.has(w)));
    }

    /* ------------------------------ counts ------------------------------ */
    function counts() {
      const byType = {}, byLen = {};
      S.towers.forEach((s) => (byType[s.type] = (byType[s.type] || 0) + 1));
      S.bm.beams.forEach((b) => (byLen[b.len] = (byLen[b.len] || 0) + 1));
      const hard = S.v.issues.filter((i) => i.hard).length;
      const bent = S.v.issues.filter((i) => !i.hard && S.baseKeys.has(issueKey(i))).length;
      const over = S.towers.filter((s) => S.loads[s.id] && S.loads[s.id].leg > S.swl + 0.05).length;
      return { byType, byLen, hard, soft: S.v.issues.length - hard, bent, over };
    }
    function updateKpi() {
      D.kpi("area", fmt(AREA, 0) + " מ״ר");
      const placed = D.step >= 3 && S.towers.length;
      D.kpi("tw", placed ? S.towers.length : "—");
      D.kpi("bm", placed ? S.bm.beams.length : "—");
      D.kpi("iss", placed ? S.v.issues.length : "—");
    }

    /* ------------------------------ issues & fixes ------------------------------ */
    const T = (id) => `<b class="mono">${esc(id)}</b>`;
    const AX = { x: "לאורך הקורות", y: "בין שורות" };
    function issueText(i) {
      const v = i.v != null ? `<span class="mono">${r1(i.v)}</span>` : "";
      switch (i.kind) {
        case "wall": return `בסיס מגדל ${T(i.a)} נוגע בקיר או קרוב אליו פחות מ־<span class="mono">${AK.SAFE}</span> ס״מ`;
        case "overlap": return `מגדלים ${T(i.a)} ו־${T(i.b)} עולים זה על זה`;
        case "mod": return `מרווח ${v} ס״מ ${AX[i.axis]} בין ${T(i.a)} ל־${T(i.b)}: לא בכפולה של 5`;
        case "gmax": return `מרווח ${v} ס״מ ${AX[i.axis]} בין ${T(i.a)} ל־${T(i.b)}: מעל <span class="mono">${i.lim}</span>`;
        case "emax": return `${i.more && i.more.length ? `ג'קים של ${[i.a, ...i.more].map(T).join(", ")}` : `ג'ק של ${T(i.a)}`} רחוק ${v} ס״מ מהקיר: מעל <span class="mono">${i.lim}</span>, רצועה לא נתמכת`;
      }
      return "";
    }
    const culprit = (i) => (i.b && S.moved.has(i.b) && !S.moved.has(i.a) ? i.b : i.a);
    function scoreFor(id) {
      const v = AK.validateAll(BAY, S.towers, Rof);
      let sc = 0;
      v.issues.forEach((i) => { if (i.a === id || i.b === id) sc += i.hard ? 1000 : 100; });
      return sc;
    }
    // nearest position where the tower breaks no rule: snap its row line, then its gaps
    function fixTower(id) {
      const s = byId(id), t = TT[s.type];
      const bay = bayAt(s.x, s.y) || BAY[S.base[id].bay];
      s.bay = bay.id;
      const R = Rof(bay), geo = bay.geo, start = { x: s.x, y: s.y };
      const mates = S.towers.filter((o) => o !== s && o.bay === bay.id);
      const ix = (t.wx - t.px) / 2 + AK.SAFE, iy = (t.wy - t.py) / 2 + AK.SAFE;
      const xs = new Set([s.x]), ys = new Set([s.y]);
      if (S.base[id].bay === bay.id) { xs.add(S.base[id].x); ys.add(S.base[id].y); }
      for (const [a, b, e] of geo.V) if (b > s.y - t.wy / 2 && a < s.y + t.wy / 2 && Math.abs(e - s.x) < 450)
        for (let m = ix; m <= R.eMax + 0.01; m += 1) { xs.add(e + m + t.px / 2); xs.add(e - m - t.px / 2); }
      for (const [a, b, e] of geo.H) if (b > s.x - t.wx / 2 && a < s.x + t.wx / 2 && Math.abs(e - s.y) < 450)
        for (let m = iy; m <= R.eMax + 0.01; m += 1) { ys.add(e + m + t.py / 2); ys.add(e - m - t.py / 2); }
      for (const o of mates) {
        const ot = TT[o.type];
        if (ot.py === t.py) ys.add(o.y);
        for (let g = AK.ceil5((t.wx - t.px) / 2 + (ot.wx - ot.px) / 2); g <= R.gx; g += 5) for (const sg of [-1, 1]) xs.add(o.x + sg * (ot.px / 2 + g + t.px / 2));
        for (let g = AK.ceil5((t.wy - t.py) / 2 + (ot.wy - ot.py) / 2); g <= R.gy; g += 5) for (const sg of [-1, 1]) ys.add(o.y + sg * (ot.py / 2 + g + t.py / 2));
      }
      const okPos = (x, y) => AK.rectIn(geo, [x - t.wx / 2, y - t.wy / 2, x + t.wx / 2, y + t.wy / 2], AK.SAFE - 0.01);
      const tryAxis = (axis, vals) => {
        let best = null;
        for (const v of vals) {
          const x = axis === "x" ? v : s.x, y = axis === "y" ? v : s.y;
          if (!okPos(x, y)) continue;
          const keep = [s.x, s.y];
          s.x = x; s.y = y;
          const sc = scoreFor(id) + 0.05 * Math.hypot(x - start.x, y - start.y);
          s.x = keep[0]; s.y = keep[1];
          if (!best || sc < best.sc) best = { sc, x, y };
        }
        if (best) { s.x = best.x; s.y = best.y; }
        return best;
      };
      const close = (vals, c, lim) => [...vals].filter((v) => Math.abs(v - c) <= lim);
      tryAxis("y", close(ys, s.y, 400));
      tryAxis("x", close(xs, s.x, 400));
      const fin = tryAxis("y", close(ys, s.y, 400));
      if (!fin || fin.sc >= 100) {
        const b = S.base[id], keep = [s.x, s.y, s.bay], cur = scoreFor(id);
        s.x = b.x; s.y = b.y; s.bay = b.bay;
        if (scoreFor(id) > cur) { s.x = keep[0]; s.y = keep[1]; s.bay = keep[2]; }
      }
      if (Math.hypot(s.x - S.base[id].x, s.y - S.base[id].y) < 0.01) S.moved.delete(id);
      return Math.hypot(s.x - start.x, s.y - start.y);
    }
    function fixIssue(idx) {
      const i = S.v.issues[idx];
      if (!i) return;
      const a = byId(i.a), dist = (t) => Math.hypot(t.x - a.x, t.y - a.y);
      const ends = [i.a, i.b].filter(Boolean);
      const movedNear = S.towers.filter((t) => S.moved.has(t.id) && t.bay === i.bay).sort((p, q) => dist(p) - dist(q)).map((t) => t.id);
      const ids = [...new Set([...ends.filter((id) => S.moved.has(id)), ...movedNear, ...ends])];
      const before = S.v.issues.length;
      let done = null;
      for (const id of ids) {
        const s = byId(id), keep = { x: s.x, y: s.y, bay: s.bay }, wasMoved = S.moved.has(id);
        fixTower(id);
        check();
        if (S.v.issues.length < before) { done = { s, from: [keep.x, keep.y] }; break; }
        Object.assign(s, keep);
        if (wasMoved) S.moved.add(id);
        check();
      }
      afterEdit();
      if (!done) { D.toast(S.baseKeys.has(issueKey(i)) ? "כלל שכופף בהצבה: אין מיקום שעומד בכל הכללים. המהנדס מאשר או מוסיף תמיכה." : "אין מיקום קרוב שעומד בכל הכללים. החריגה נשארת מסומנת להחלטת המהנדס."); return; }
      animMove(done.s, done.from);
      D.cmd(`AKRO_FIX ${done.s.id} → X ${Math.round(done.s.x)} Y ${Math.round(H - done.s.y)}`);
      D.track("demo_action", { action: "fix" });
    }
    function fixAll() {
      const before = S.v.issues.length, froms = Object.fromEntries(S.towers.map((s) => [s.id, [s.x, s.y]]));
      for (let pass = 0; pass < 3 && S.v.issues.length; pass++) {
        const open = S.v.issues.filter((i) => i.hard || !S.baseKeys.has(issueKey(i)));
        const ids = [...new Set([...S.moved, ...open.flatMap((i) => [i.a, i.b]).filter(Boolean)])];
        if (!ids.length) break;
        for (const id of ids) {
          const s = byId(id), keep = { x: s.x, y: s.y, bay: s.bay }, wasMoved = S.moved.has(id), n0 = S.v.issues.length;
          fixTower(id);
          check();
          if (S.v.issues.length > n0) { Object.assign(s, keep); if (wasMoved) S.moved.add(id); check(); }
          if (!S.v.issues.length) break;
        }
      }
      afterEdit();
      S.towers.forEach((s) => { const f = froms[s.id]; if (f[0] !== s.x || f[1] !== s.y) animMove(s, f); });
      D.cmd(`AKRO_FIX ALL  ${before} → ${S.v.issues.length}`);
      const left = S.v.issues.length, done = before - left, bent = counts().bent;
      D.toast(!left ? `כל ${before} החריגות תוקנו. כל המרווחים במודול ובטווח.`
        : left === bent ? `${done > 0 ? `תוקנו ${done} חריגות. ` : ""}נשארו ${left} כללים שכופפו בהצבה, לאישור המהנדס.`
        : done > 0 ? `תוקנו ${done} חריגות. ${left} נשארו מסומנות להחלטת המהנדס.` : `אין מיקום שעומד בכל הכללים. ${left} חריגות נשארות מסומנות.`);
      D.track("demo_action", { action: "fix_all" });
    }
    function animMove(s, from) {
      const to = [s.x, s.y], t0 = performance.now(), dur = 260;
      const stepA = (now) => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        const g = twEl[s.id];
        if (g) g.setAttribute("transform", `translate(${from[0] + (to[0] - from[0]) * e} ${from[1] + (to[1] - from[1]) * e})`);
        if (k < 1) requestAnimationFrame(stepA);
      };
      requestAnimationFrame(stepA);
    }
    function scramble() {
      const pool = S.towers.filter((s) => TT[s.type].main);
      const pick = [];
      while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      pick.forEach((s, k) => {
        const geo = BAY[s.bay].geo, t = TT[s.type];
        for (let tries = 0; tries < 20; tries++) {
          const mag = 12 + Math.random() * 30 + 0.3;
          const dx = k % 2 === 0 ? (Math.random() < 0.5 ? -1 : 1) * mag : 0, dy = k % 2 ? (Math.random() < 0.5 ? -1 : 1) * mag : 0;
          const x = s.x + dx, y = s.y + dy;
          if (AK.rectIn(geo, [x - t.wx / 2, y - t.wy / 2, x + t.wx / 2, y + t.wy / 2], 0)) { const from = [s.x, s.y]; s.x = x; s.y = y; S.moved.add(s.id); animMove(s, from); break; }
        }
      });
      afterEdit();
      D.cmd(`AKRO_MOVE ${pick.map((s) => s.id).join(",")}  (שינויים ידניים)`);
      D.toast("3 מגדלים הוזזו כמו בתיקון ידני בשטח. ראו את המידות האדומות.");
      D.track("demo_action", { action: "scramble" });
    }
    function resetEdits() {
      S.towers.forEach((s) => { const b = S.base[s.id], from = [s.x, s.y]; if (from[0] !== b.x || from[1] !== b.y) { s.x = b.x; s.y = b.y; s.bay = b.bay; animMove(s, from); } });
      S.moved = new Set();
      afterEdit();
      D.cmd("AKRO_RESET");
    }
    function afterEdit() {
      check();
      drawBeams(false);
      paintTowers();
      drawLive();
      drawViol(D.step === 4);
      renderSide();
    }

    /* ------------------------------ dragging (step 4) ------------------------------ */
    let drag = null, raf = 0;
    svg.addEventListener("pointerdown", (e) => {
      const g = e.target.closest && e.target.closest(".tw");
      if (!g || g.classList.contains("ghost")) return;
      if (D.step === 3) { select(g.dataset.id); return; }
      if (D.step !== 4 || e.button > 0) return;
      const s = byId(g.dataset.id);
      drag = { s, p0: D.pt(e), x0: s.x, y0: s.y, moved: false, pid: e.pointerId };
      try { svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      select(s.id, true);
      e.preventDefault();
    });
    svg.addEventListener("pointermove", (e) => {
      const g = e.target.closest && e.target.closest(".tw, .bm, .wall, .sb, .hid, .pz, .vm");
      D.barMid(`Layer: <b>${g ? (g.classList.contains("tw") ? "AKRO-SHORES" : g.classList.contains("bm") ? "AKRO-BEAMS" : g.classList.contains("vm") ? "AKRO-VIOLATIONS" : g.classList.contains("sb") || g.classList.contains("hid") ? "S-BEAM" : g.classList.contains("pz") ? "AKRO-ZONES" : "S-WALL") : "0"}</b>`);
      if (!drag || e.pointerId !== drag.pid) return;
      const p = D.pt(e);
      let dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      D.canvas.classList.add("dragging");
      if (S.snap) { dx = Math.round(dx / 5) * 5; dy = Math.round(dy / 5) * 5; }
      drag.s.x = drag.x0 + dx;
      drag.s.y = drag.y0 + dy;
      const z = bayAt(drag.s.x, drag.s.y);
      if (z) drag.s.bay = z.id;
      moveEl(drag.s);
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        S.v = AK.validateAll(BAY, S.towers, Rof);
        paintTowers();
        drawLive();
        drawViol(true);
        D.kpi("iss", S.v.issues.length);
        if (drag) D.coords(drag.s.x, H - drag.s.y);
      });
    });
    const endDrag = (e) => {
      if (!drag || (e && e.pointerId !== drag.pid)) return;
      const d = drag;
      drag = null;
      D.canvas.classList.remove("dragging");
      if (!d.moved) return;
      S.moved.add(d.s.id);
      afterEdit();
      const mine = S.v.issues.filter((i) => i.a === d.s.id || i.b === d.s.id);
      D.cmd(`AKRO_MOVE ${d.s.id}  ΔX ${r1(d.s.x - d.x0)}  ΔY ${r1(-(d.s.y - d.y0))}`);
      if (mine.length) D.hint(`${mine.length} חריגות סביב מגדל ${d.s.id}. לחצו "תקן" ברשימה.`, 2200);
      D.track("demo_action", { action: "drag" });
    };
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", endDrag);
    function select(id, quiet) {
      S.sel = S.sel === id && !quiet ? null : id;
      paintTowers();
      drawLive();
      renderSide();
    }

    /* ------------------------------ side palette ------------------------------ */
    const sw = (c) => `<span class="sw" style="background:${c}"></span>`;
    const legLoad = (d, gx, gy) => AK.gridLoad(d, gx, gy) / 4;
    function sbMeta(b) {
      const parts = [];
      const bays = b.touch.map((id) => BAY[id]);
      const same = bays.filter((z) => Math.abs(soffit(z.id) - b.bot) < 0.5).map((z) => z.id);
      const lower = bays.filter((z) => soffit(z.id) - b.bot > 0.5);
      if (same.length) parts.push(`תחתית = תחתית ${same.join(", ")}`);
      lower.forEach((z) => parts.push(`${r1(soffit(z.id) - b.bot)} ס״מ מתחת לתחתית ${z.id} (מדרגה)`));
      bays.forEach((z) => { if (b.top - z.top > 0.5) parts.push(`בולטת ${r1(b.top - z.top)} מעל ${z.id}`); });
      if (b.over.length) parts.push(`<b class="warn-t">מעל פתח ${b.over.map((w) => m2(w.len)).join(", ")} מ׳</b>`);
      return parts.join(" · ");
    }
    function renderSide() {
      const st = D.step;
      let h = "";
      if (st === 1) {
        const cA = comp("A"), cB = comp("B");
        h = `<div class="hd"><h2>קריאת התקרה</h2><p>מתוכנית התקרה נקראים הקצה, הקירות שמתחת, הקורות, והמפלס והעובי בכל אזור. כל חדר הוא אזור הצבה אחד.</p></div>
        <div class="bd">
          <div class="stats c3"><div><b>${fmt(AREA, 0)}</b><span>מ״ר תבנית נטו</span></div><div><b>${BAYS.length}</b><span>אזורי תקרה</span></div><div><b>${WIN.length}</b><span>פתחים בקירות</span></div></div>
          <div class="lbl">אזורי תקרה · לחצו לזום</div>
          <div class="bays">${BAYS.map((b) => `<button type="button" class="bayrow ${S.bay === b.id ? "on" : ""}" data-bay="${b.id}"><span class="id" style="background:${THK_COLOR[S.thick[b.id]]}">${b.id}</span>
            <span>${b.mamad ? "ממ״ד · " : ""}תקרה <span class="mono">${S.thick[b.id]}</span> ס״מ${b.mamad ? " (לפי תכנית הממ״ד)" : ""}<span class="meta">עליון <span class="mono ltr">${lvl(b.top)}</span> · תחתית <span class="mono ltr">${lvl(soffit(b.id))}</span> · מגדל <span class="mono">${m2(towerH(b.id))}</span> מ׳</span></span>
            <span class="mono">${fmt(b.area, 1)} מ״ר</span></button>`).join("")}</div>
          <div class="lbl">קורות בתקרה · לחצו לזום</div>
          <div class="bays">${SB.map((b) => `<button type="button" class="bayrow sbrow ${S.sb === b.id ? "on" : ""}" data-sb="${b.id}"><span class="id sbid">${b.id}</span>
            <span><span class="mono">${b.w}/${b.h}</span> · <span class="mono ltr">${lvl(b.top)} / ${lvl(b.bot)}</span><span class="meta">${sbMeta(b)}</span></span>
            <span class="mono">${m2(b.len)} מ׳</span></button>`).join("")}</div>
          <div class="pair"><span>מפלס פני הבטון שעליו עומדים המגדלים (מ׳)<span class="u">לא מופיע בתכנית התקרה. הנחה: ±0.00 גמר פחות 7 ס״מ ריצוף</span></span><input type="number" id="floor" value="${(S.floor / 100).toFixed(2)}" min="-0.5" max="0.5" step="0.01" aria-label="מפלס רצפה"></div>
          <div class="note">גובה מגדל = תחתית התקרה פחות <b>${r1(AK.STACK_T)} ס״מ</b> (לביד ${AK.STACK.ply}, קורה משנית ${AK.STACK.sec}, קורה ראשית H${AK.STACK.pri}) פחות מפלס הרצפה.
            A: <b class="mono">${m2(towerH("A"))}</b> מ׳ = <span class="mono">${compTxt(cA)}</span>. B ו־C: <b class="mono">${m2(towerH("B"))}</b> מ׳ = <span class="mono">${compTxt(cB)}</span>.
            <span class="dim-t">מסגרת 0.91 והוצאת ג'ק ${AK.JACK.min}–${AK.JACK.max} ס״מ הן הנחות; בפרויקט אמיתי לפי קטלוג הספק.</span></div>
          <div class="note">${SB.filter((b) => b.over.length).map((b) => `<b>${b.id}</b>`).join(" ו־")} עוברות מעל פתחים. אם הפתח מגיע עד תחתית הקורה אין לאורכו קיר מתחת, והתבנית נושאת את כל רוחב הקורה: בפתח עצמו נדרשים פרופים, לא מגדלים. אזורי הפרגולה מפלדה לא נכללים, אין שם תקרת בטון.</div>
          <div class="lbl">שכבות שזוהו</div>
          <div class="layers">
            <div><span><code>S-SLAB-EDGE</code> קצה תקרה</span><span class="mono">1</span></div>
            <div><span><code>S-WALL</code> קירות בטון</span><span class="mono">${DATA.walls.reduce((a, p) => a + p.length, 0)} קווי מתאר</span></div>
            <div><span><code>A-GLAZ</code> פתחים</span><span class="mono">${WIN.length}</span></div>
            <div><span><code>S-BEAM</code> קורות (מקווקו)</span><span class="mono">${SB.length}</span></div>
          </div>
        </div>${D.nav(null, 2)}`;
      } else if (st === 2) {
        const opts = (b) => THK.map((d) => `<option value="${d}" ${S.thick[b] === d ? "selected" : ""}>${d}</option>`).join("");
        const cnt = {};
        S.towers.forEach((s) => (cnt[s.bay] = (cnt[s.bay] || 0) + 1));
        const legCell = (v) => `<span class="${v > S.swl + 0.05 ? "bad-t" : ""}">${fmt(v, 1)}</span>`;
        h = `<div class="hd"><h2>כללי המהנדס</h2><p>הזינו את המרווחים המקסימליים שקבע המהנדס. ההצבה והבדיקה נעשות לפיהם; העומסים עצמם לא מחושבים כאן.</p></div>
        <div class="bd">
          <div class="rules">
            <div class="rule hd"><span></span><span>אזור</span><span>עובי</span><span>לאורך קורות</span><span>בין שורות</span></div>
            ${BAYS.map((b) => { const lg = legLoad(S.thick[b.id], S.gap[b.id][0], S.gap[b.id][1]); return `<div class="rule"><span class="id" style="background:${THK_COLOR[S.thick[b.id]]}">${b.id}</span>
              <span><span class="mono">${cnt[b.id] || 0}</span> מגדלים<span class="meta">≈${legCell(lg)} kN לרגל</span></span>
              <select data-thick="${b.id}" aria-label="עובי תקרה ${b.id}">${opts(b.id)}</select>
              <input type="number" data-gx="${b.id}" value="${S.gap[b.id][0]}" min="30" max="250" step="5" aria-label="מרווח מקסימלי לאורך הקורות ${b.id}">
              <input type="number" data-gy="${b.id}" value="${S.gap[b.id][1]}" min="30" max="250" step="5" aria-label="מרווח מקסימלי בין שורות ${b.id}"></div>`; }).join("")}
          </div>
          <div class="lbl">טבלת המהנדס · ערכי דוגמה</div>
          <table class="mini"><thead><tr><th>עובי</th><th class="num">לאורך</th><th class="num">בין שורות</th><th class="num">q kN/מ״ר</th><th class="num">kN לרגל</th></tr></thead>
            <tbody>${THK.map((d) => { const [gx, gy] = AK.SPACING[d]; return `<tr class="${Object.values(S.thick).includes(d) ? "on" : ""}"><td>${d} ס״מ</td><td class="num">${gx}</td><td class="num">${gy}</td><td class="num">${fmt(AK.qOf(d), 2)}</td><td class="num">${legCell(legLoad(d, gx, gy))}</td></tr>`; }).join("")}</tbody></table>
          <div class="note">עומס בזמן היציקה: בטון <b>${AK.LOAD.conc}</b> kN/מ״ק × עובי + תבנית <b>${AK.LOAD.form}</b> + עומס יציקה <b>${AK.LOAD.live}</b> kN/מ״ר (עובדים, כלים וערימת בטון). לרגל = q × (1.22 + מרווח) × (1.65 + מרווח) ÷ 4. זו בדיקת עזר בדמו; ליד קורות כבדות העומס גבוה יותר וזה מוצג בכרטיס המגדל.</div>
          <div class="pair"><span>עומס עבודה מותר לרגל (kN)<span class="u">הנחה. בפועל לפי טבלת היצרן, תלוי בגובה ובהוצאת הג'ק</span></span><input type="number" id="swl" value="${S.swl}" min="5" max="60" step="1" aria-label="עומס מותר לרגל"></div>
          <div class="pair"><span>מרכז ג'ק ← קיר, מקס׳ (ס״מ)<span class="u">מעבר לזה הרצועה ליד הקיר לא נתמכת</span></span><input type="number" id="eMax" value="${S.eMax}" min="10" max="120" step="1" aria-label="מרחק מקסימלי מהקיר"></div>
          <ul class="fixed"><li>כל מרחק נמדד ממרכז הג'ק</li><li>מרווח בין רגליים בכפולות של 5 ס״מ, בלי חריגים</li><li>בסיס המגדל לפחות ${AK.SAFE} ס״מ מכל קיר</li><li>אין מרווח מינימלי: מכוונים למקסימום, הכי מעט מגדלים</li><li>יתרה מתחלקת שווה בין שני הקירות</li><li>חדר אחד = גריד אחד רציף</li></ul>
          <div class="lbl">סוגי מגדלים · מסגרת 1.22 × מפתח הצלב</div>
          <div class="types">${AK.TYPES.map((t) => `<label>${t.main ? `<input type="checkbox" checked disabled>` : `<input type="checkbox" data-sec="${t.id}" ${S.sec[t.id] ? "checked" : ""}>`}${sw(t.color)}<span class="mono">${t.name}</span>${t.main ? " ראשי" : ""}</label>`).join("")}</div>
        </div>${D.nav(1, 3)}`;
      } else if (st === 3) {
        const c = counts(), main = c.byType.T1 || 0, sel = S.sel && byId(S.sel);
        const bent = BAYS.filter((b) => S.v.issues.some((i) => i.bay === b.id && !i.hard && S.baseKeys.has(issueKey(i))));
        h = `<div class="hd"><h2>הצבה אוטומטית</h2><p>כל חדר מקבל גריד אחד עם כמה שפחות מגדלים, במודול 5 ס״מ. מגדלים משניים נוספים רק איפה שהגריד הראשי לא נכנס.</p></div>
        <div class="bd">
          <div class="stats"><div><b>${S.towers.length}</b><span>מגדלים</span></div><div><b>${main}</b><span>ראשיים</span></div><div><b>${S.towers.length - main}</b><span>משניים</span></div><div><b>${S.bm.beams.length}</b><span>קורות ראשיות</span></div></div>
          <div class="list">${AK.TYPES.filter((t) => c.byType[t.id]).map((t) => `<div class="li" data-type="${t.id}">${sw(t.color)}<span class="meta"><span class="mono">${t.name}</span> · ${t.main ? "מגדל ראשי" : "מגדל משני"}</span><span class="mono">${c.byType[t.id]}</span></div>`).join("")}</div>
          <div><div class="lbl" style="margin-bottom:6px">קורות ראשיות H16.5 לפי אורך</div>
          <div class="beamlens">${AK.CATALOG.filter((L) => c.byLen[L]).map((L) => `<span><b>${c.byLen[L]}</b> × ${m2(L)} מ׳</span>`).join("")}</div></div>
          <div class="note">${fmt(AREA / Math.max(1, S.towers.length), 1)} מ״ר תבנית למגדל. בגריד פתוח מלא במרווח 150 היו ${fmt((AK.TT.T1.px + 150) * (AK.TT.T1.py + 150) / 1e4, 1)} מ״ר למגדל; ההפרש הוא הקירות, המדרגות בקווי החדרים והממ״ד.</div>
          ${sel ? towerCard(sel) : `<div class="note">לחצו על מגדל כדי לראות גובה, הרכב ועומס. כל מגדל נושא שתי קורות ראשיות, אחת על כל צד סולם, שמכסות את שני הראשים שלו ואת הראש הקרוב של השכן. הקורות המשניות והלביד מונחים מעליהן.</div>`}
          ${bent.length ? `<div class="note">ב־<b>${bent.map((b) => b.id).join(", ")}</b> צורת החדר לא מאפשרת לעמוד בכל הכללים. התוסף מכופף את הכלל הרך ביותר (מרחק מהקיר) ומסמן את המקום בכתום, ראו בבקרת מרווחים.</div>` : ""}
          ${c.over ? `<div class="note"><b>${c.over}</b> מגדלים מעל ${S.swl} kN לרגל בבדיקת העזר (בעיקר ליד הקורות הכבדות). זה למהנדס: לצופף שם או לחזק.</div>` : ""}
          ${S.bm.anomalies.length ? `<div class="note"><b>${S.bm.anomalies.length}</b> מגדלים בלי קורה (אין אורך מהקטלוג שנכנס בלי לצאת מהחדר). מסומנים בקו מקווקו.</div>` : ""}
          <div class="lbl">שכבות</div>
          <div class="layers">
            ${[["tw", "AKRO-SHORES", "מגדלים"], ["bm", "AKRO-BEAMS", "קורות ראשיות"], ["dim", "AKRO-DIMENSIONS", "שרשראות מידה"], ["pz", "AKRO-ZONES", "אזורי הצבה (חדרים)"], ["lb", "AKRO-LABELS", "מספרי מגדלים"]].map(([k, code, name]) => `<label><span><code>${code}</code> ${name}</span><input type="checkbox" data-layer="${k}" ${S.layers[k] ? "checked" : ""}></label>`).join("")}
          </div>
          <button class="btn" type="button" id="replace">הצב מחדש</button>
        </div>${D.nav(2, 4)}`;
      } else if (st === 4) {
        const c = counts(), n = S.v.issues.length;
        h = `<div class="hd"><h2>בקרת מרווחים</h2><p>גררו מגדל. המידות לשכנים ולקיר מתעדכנות תוך כדי, ומידה אדומה מסמנת מרווח שחורג מהכללים.</p></div>
        <div class="bd">
          <div class="stats c3"><div><b style="color:${c.hard ? "var(--bad)" : n ? "var(--warn)" : "var(--ok)"}">${n}</b><span>חריגות</span></div><div><b>${c.hard}</b><span>אסורות</span></div><div><b>${c.soft}</b><span>כללים רכים</span></div></div>
          <div class="row"><button class="btn sm" type="button" id="scramble">הזז 3 מגדלים באקראי</button><button class="btn sm" type="button" id="reset" ${S.moved.size ? "" : "disabled"}>אפס</button>
            <label class="toggle" style="margin-inline-start:auto"><span>הצמדה ל־5 ס״מ</span><input type="checkbox" id="snap" ${S.snap ? "checked" : ""}></label></div>
          <div class="list issues">${n ? S.v.issues.map((i, k) => { const base = !i.hard && S.baseKeys.has(issueKey(i)); return `<div class="iss ${S.sel && (i.a === S.sel || i.b === S.sel) ? "on" : ""}" data-iss="${k}"><span class="pill ${i.hard ? "bad" : "warn"}"><span class="mono">${k + 1}</span> ${i.hard ? "אסור" : base ? "כופף" : "חריגה"}</span><span class="tx">${issueText(i)}<small>אזור ${esc(i.bay)}${base ? " · מההצבה, לאישור המהנדס" : ""}</small></span>${base ? "<span></span>" : `<button class="btn sm" type="button" data-fix="${k}">תקן</button>`}</div>`; }).join("") : `<div class="empty">✓ כל המרווחים בטווח ובמודול</div>`}</div>
          <button class="btn pri" type="button" id="fixall" ${n > c.bent ? "" : "disabled"}>תקן הכל</button>
          <div class="note"><b>אסור (אדום):</b> מגדלים חופפים, בסיס על קיר או פחות מ־${AK.SAFE} ס״מ ממנו, מרווח בין רגליים שלא בכפולה של 5. <b>כלל רך (כתום):</b> מרווח מעל המקסימום, או ג'ק רחוק מהקיר יותר מהמותר. "כופף" הוא מקום שבו צורת החדר לא משאירה פתרון שעומד בכל הכללים: המהנדס מאשר או מוסיף פרופ.</div>
        </div>${D.nav(3, 5)}`;
      } else if (st === 5) {
        const c = counts(), rows = boqRows();
        const comps = rows.filter((r) => r.kind === "comp").reduce((a, r) => a + r.n, 0);
        h = `<div class="hd"><h2>רשימת ציוד</h2><p>רשימת הזמנה לספק: רכיבי מגדלים לפי סוג וגובה, קורות ראשיות לפי אורך, ראשים ובסיסים, והערכה לקורות משניות, לביד ופרופים.</p></div>
        <div class="bd">
          <div class="stats c3"><div><b>${S.towers.length}</b><span>מגדלים</span></div><div><b>${fmt(comps)}</b><span>רכיבי מגדלים</span></div><div><b>${fmt(S.bm.beams.reduce((a, b) => a + b.len, 0) / 100, 0)}</b><span>מ׳ קורות ראשיות</span></div></div>
          <button class="btn pri" type="button" id="copyXls">העתק טבלה לאקסל</button>
          <div class="note">בתוסף המלא הייצוא נשמר כקובץ <span class="mono">.xlsx</span> לפי הספירה בשכבות <span class="mono">AKRO-SHORES</span> ו־<span class="mono">AKRO-BEAMS</span>. שורות "הערכה" מחושבות כאן לפי שטח, לא מהשרטוט.</div>
          ${S.v.issues.length ? `<div class="note">${S.v.issues.length === c.bent ? `<b>${c.bent}</b> מקומות שבהם כלל כופף בהצבה ממתינים לאישור המהנדס. בטבלה נוספו להם פרופי השלמה כהערכה.` : `<b>${S.v.issues.length}</b> חריגות עדיין פתוחות בבקרת המרווחים${c.bent ? `, מתוכן ${c.bent} כללים שכופפו בהצבה` : ""}.`}</div>` : ""}
          ${D.cta()}
        </div>${D.nav(4, null)}`;
      }
      D.side(h);
      bindSide();
    }
    function towerCard(s) {
      const t = TT[s.type], b = s.bay, cmp = comp(b), ld = S.loads[s.id];
      const rels = S.v.rels.filter((r) => r.a === s.id || r.b === s.id);
      const gx = rels.filter((r) => r.axis === "x" && r.kind === "gap").map((r) => r1(r.v));
      const gy = rels.filter((r) => r.axis === "y" && r.kind === "gap").map((r) => r1(r.v));
      const beams = S.bm.beams.filter((q) => q.tid === s.id);
      return `<div class="card tcard"><div class="ch"><b class="mono">מגדל ${s.id}</b><span>${t.main ? "ראשי" : "משני"} · <span class="mono">${t.name}</span></span></div>
        <div class="kv">
          <div><span>אזור</span><b class="mono">${b} · d=${S.thick[b]}</b></div>
          <div><span>גובה</span><b class="mono">${m2(towerH(b))} מ׳</b></div>
          <div><span>לאורך הקורות</span><b class="mono">${gx.length ? [...new Set(gx)].join(" / ") : "—"}</b></div>
          <div><span>בין שורות</span><b class="mono">${gy.length ? [...new Set(gy)].join(" / ") : "—"}</b></div>
          <div><span>בסיס</span><b class="mono">${t.wx}×${t.wy}</b></div>
          <div><span>קורות</span><b class="mono">${beams.length ? "2 × " + m2(beams[0].len) + " מ׳" : "—"}</b></div>
          <div class="wide"><span>הרכב</span><b class="mono">${compTxt(cmp)}</b></div>
          <div class="wide"><span>עומס לרגל</span><b class="mono ${ld && ld.leg > S.swl + 0.05 ? "bad-t" : ""}">${ld ? `${fmt(ld.leg, 1)} kN מתוך ${S.swl}${ld.beam > 0.5 ? ` · כולל ${fmt(ld.beam, 0)} kN מקורה` : ""}` : "—"}</b></div>
        </div></div>`;
    }
    function bindSide() {
      const side = D.sideEl, st = D.step;
      if (st === 1) {
        side.querySelectorAll("[data-bay]").forEach((b) => (b.onclick = () => toggleBay(b.dataset.bay)));
        side.querySelectorAll("[data-sb]").forEach((b) => (b.onclick = () => toggleSB(b.dataset.sb)));
        const f = $("floor");
        if (f) f.onchange = () => { S.floor = Math.round(Math.max(-50, Math.min(50, (+f.value || 0) * 100))); D.cmd(`FLOOR ${lvl(S.floor)}  →  A ${m2(towerH("A"))} / B ${m2(towerH("B"))}`); renderSide(); };
      }
      if (st === 2) {
        side.querySelectorAll("[data-thick]").forEach((s) => (s.onchange = () => {
          const b = s.dataset.thick;
          S.thick[b] = +s.value;
          S.gap[b] = AK.SPACING[+s.value].slice();
          rulesChanged(`AKRO_SETTINGS ZONE=${b} SLAB=${s.value} GAP=${S.gap[b].join("/")}`);
        }));
        const gapIn = (attr, k) => side.querySelectorAll(`[data-${attr}]`).forEach((s) => (s.onchange = () => {
          const b = s.dataset[attr], v = AK.floor5(Math.max(30, Math.min(250, +s.value || 0)));
          S.gap[b][k] = v;
          rulesChanged(`AKRO_SETTINGS ZONE=${b} ${k ? "ROWS" : "IN_ROW"}_MAX=${v}`);
        }));
        gapIn("gx", 0);
        gapIn("gy", 1);
        const num = (id, f) => { const e = $(id); if (e) e.onchange = () => f(+e.value); };
        num("eMax", (v) => { S.eMax = Math.max(10, Math.min(120, v || 40)); rulesChanged(`AKRO_SETTINGS EDGE_MAX=${S.eMax}`); });
        num("swl", (v) => { S.swl = Math.max(5, Math.min(60, v || 20)); check(); renderSide(); D.cmd(`SWL ${S.swl} kN / LEG`); });
        side.querySelectorAll("[data-sec]").forEach((c) => (c.onchange = () => { S.sec[c.dataset.sec] = c.checked; rulesChanged(`AKRO_SETTINGS ${c.dataset.sec}=${c.checked ? "ON" : "OFF"}`); }));
      }
      if (st === 3) {
        side.querySelectorAll("[data-layer]").forEach((c) => (c.onchange = () => { S.layers[c.dataset.layer] = c.checked; setLayers(); }));
        side.querySelectorAll("[data-type]").forEach((li) => {
          li.onmouseenter = () => S.towers.forEach((s) => twEl[s.id] && (twEl[s.id].style.opacity = s.type === li.dataset.type ? 1 : 0.25));
          li.onmouseleave = () => S.towers.forEach((s) => twEl[s.id] && (twEl[s.id].style.opacity = ""));
        });
        const rp = $("replace");
        if (rp) rp.onclick = () => { place(); runPlacement(true); D.track("demo_action", { action: "replace" }); };
      }
      if (st === 4) {
        $("scramble").onclick = scramble;
        $("reset").onclick = resetEdits;
        $("snap").onchange = (e) => { S.snap = e.target.checked; };
        $("fixall").onclick = fixAll;
        side.querySelectorAll("[data-fix]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); fixIssue(+b.dataset.fix); }));
        side.querySelectorAll("[data-iss]").forEach((li) => (li.onclick = () => {
          const i = S.v.issues[+li.dataset.iss];
          if (!i) return;
          S.sel = culprit(i);
          const [x, y] = issuePos(i);
          D.zoomTo(x - 250, y - 250, 500, 500, 0.3);
          paintTowers(); drawLive(); renderSide();
        }));
      }
      if (st === 5) $("copyXls").onclick = () => { D.copy(tsv(), "הטבלה הועתקה. הדביקו בגיליון אקסל"); D.track("demo_export"); };
    }
    function zoomBox(xs, ys, pad = 0) { D.zoomTo(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad); }
    function toggleBay(id) {
      S.bay = S.bay === id ? null : id;
      S.sb = null;
      paintBays(true);
      if (S.bay) zoomBox(BAY[id].poly.map((p) => p[0]), BAY[id].poly.map((p) => p[1]));
      else D.fit();
      D.cmd(S.bay ? `AKRO_ZONE ${id}  d=${S.thick[id]}  TOP ${lvl(BAY[id].top)}  SOFFIT ${lvl(soffit(id))}` : "ZOOM EXTENTS");
      renderSide();
    }
    function toggleSB(id) {
      S.sb = S.sb === id ? null : id;
      S.bay = null;
      paintBays(true);
      const b = SB.find((q) => q.id === id);
      if (S.sb) zoomBox([b.bb[0], b.bb[2]], [b.bb[1], b.bb[3]], 220);
      else D.fit();
      D.cmd(S.sb ? `LIST ${id}  ${b.w}/${b.h}  o.k ${lvl(b.top)}  u.k ${lvl(b.bot)}` : "ZOOM EXTENTS");
      renderSide();
    }
    svg.addEventListener("click", (e) => {
      if (D.step !== 1) return;
      const sb = e.target.closest && e.target.closest(".sb");
      if (sb) { toggleSB(sb.dataset.sb); return; }
      const b = e.target.closest && e.target.closest(".bay");
      if (b) toggleBay(b.dataset.bay);
    });
    function rulesChanged(cmd) {
      place();
      drawTowers("ghost");
      paintBays(false);
      drawTags(false);
      D.cmd(cmd);
      renderSide();
    }

    /* ------------------------------ BOQ ------------------------------ */
    function boqRows() {
      const rows = [], N = S.towers.length;
      const add = (r) => rows.push(r);
      // the towers as drawn, by type and height
      const tw = {};
      S.towers.forEach((s) => {
        const h = towerH(s.bay), k = s.type + "|" + h;
        (tw[k] = tw[k] || { t: TT[s.type], h, bays: new Set(), n: 0, c: comp(s.bay) }).n++;
        tw[k].bays.add(s.bay);
      });
      const groups = Object.values(tw).sort((a, b) => (b.t.main - a.t.main) || a.t.id.localeCompare(b.t.id) || b.h - a.h);
      add({ grp: "מגדלים בשרטוט (לבדיקה מול השכבה AKRO-SHORES)" });
      groups.forEach((g) => add({ item: `מגדל ${g.t.name} ${g.t.main ? "(ראשי)" : "(משני)"}`, size: `גובה ${m2(g.h)} מ׳`, n: g.n, unit: "מגדל", note: `תקרה ${[...g.bays].sort().join(", ")}` }));
      // tower components: each lift = 2 frames (the ladder faces) + 2 cross braces (the open faces)
      const frames = {}, braces = {};
      groups.forEach((g) => g.c.frames.forEach((f) => {
        frames[f] = (frames[f] || 0) + 2 * g.n;
        const k = g.t.open + "|" + f;
        braces[k] = (braces[k] || { open: g.t.open, f, n: 0 });
        braces[k].n += 2 * g.n;
      }));
      add({ grp: "רכיבי מגדלים" });
      Object.keys(frames).map(Number).sort((a, b) => b - a).forEach((f) => add({ kind: "comp", item: "מסגרת (סולם) ברוחב 1.22", size: `גובה ${m2(f)} מ׳`, n: frames[f], unit: "יח׳", note: f === 122 ? "2 בכל קומת מגדל" : "מסגרת השלמה (הנחה)" }));
      Object.values(braces).sort((a, b) => b.open - a.open || b.f - a.f).forEach((b) => add({ kind: "comp", item: `צלב (מספריים) למפתח ${m2(b.open)}`, size: `לקומה ${m2(b.f)} מ׳ · ${m2(Math.hypot(b.open, b.f))} מ׳ קצה לקצה`, n: b.n, unit: "יח׳", note: "2 בכל קומת מגדל" }));
      const used = [...new Set(S.towers.map((s) => s.bay))].map((b) => comp(b)).filter((c) => c.ok);
      const range = (vs) => { const a = Math.min(...vs), b = Math.max(...vs); return vs.length ? (Math.abs(a - b) < 0.05 ? r1(a) : `${r1(a)}–${r1(b)}`) : "—"; };
      const hd = `גובה עבודה ${range(used.map((c) => c.head))} ס״מ`;
      add({ kind: "comp", item: "ג'ק תחתון עם פלטת בסיס", size: `גובה עבודה ${range(used.map((c) => c.base))} ס״מ`, n: N * 4, unit: "יח׳", note: "4 למגדל" });
      add({ kind: "comp", item: "ג'ק עליון עם ראש U 21 ס״מ", size: hd, n: N * 4 - S.bm.wide, unit: "יח׳", note: "קורה ראשית אחת על הראש" });
      add({ kind: "comp", item: "ג'ק עליון עם ראש U רחב 28 ס״מ", size: hd, n: S.bm.wide, unit: "יח׳", note: "שתי קורות ראשיות חופפות על הראש" });
      // primary beams from the drawing
      const bl = {};
      S.bm.beams.forEach((b) => (bl[b.len] = (bl[b.len] || 0) + 1));
      add({ grp: "קורות ראשיות" });
      AK.CATALOG.filter((L) => bl[L]).forEach((L) => add({ item: "קורת אלומיניום H16.5", size: `${m2(L)} מ׳`, n: bl[L], unit: "יח׳", note: `${fmt((bl[L] * L) / 100, 1)} מ׳ אורך` }));
      // estimates from area (not in the drawing)
      add({ grp: "הערכה לפי שטח (לא מהשרטוט)" });
      const jl = BAYS.reduce((a, b) => a + b.area / (S.thick[b.id] > 25 ? 0.4 : 0.5), 0);
      add({ item: "קורה משנית 14 ס״מ", size: "3.30 מ׳", n: Math.ceil((jl * 1.1) / 3.3), unit: "יח׳", note: `≈${fmt(jl, 0)} מ״א, כל 50 ס״מ (40 מעל 25 ס״מ עובי)` });
      add({ item: "לביד לטפסנות 18–21 מ״מ", size: "1.22×2.44", n: Math.ceil((AREA * 1.08) / (1.22 * 2.44)), unit: "לוח", note: `${fmt(AREA, 0)} מ״ר + 8% פחת` });
      PROPS.forEach((p) => add({ item: "פרופ טלסקופי", size: `בפתח מתחת ל־${p.beam}`, n: p.n, unit: "יח׳", note: `פתח ${m2(p.len)} מ׳, אם אין משקוף יצוק מתחת לקורה` }));
      const bent = counts().bent;
      if (bent) add({ item: "פרופ טלסקופי", size: "השלמה ליד קירות", n: bent * 2, unit: "יח׳", note: `2 לכל אחד מ־${bent} המקומות שכופפו בהצבה, לפי החלטת המהנדס` });
      return rows;
    }
    function tableHtml() {
      const rows = boqRows();
      let h = `<table><thead><tr><th>פריט</th><th>מידה</th><th class="num">כמות</th><th>יח׳</th><th>הערה</th></tr></thead><tbody>`;
      rows.forEach((r) => { h += r.grp ? `<tr class="grp"><td colspan="5">${esc(r.grp)}</td></tr>` : `<tr><td>${esc(r.item)}</td><td>${esc(r.size)}</td><td class="num">${fmt(r.n)}</td><td>${esc(r.unit)}</td><td>${esc(r.note)}</td></tr>`; });
      const c = counts();
      h += `<tr class="tot"><td colspan="2">${fmt(AREA, 0)} מ״ר תבנית · ${S.towers.length} מגדלים</td><td class="num">${fmt(AREA / Math.max(1, S.towers.length), 1)}</td><td>מ״ר/מגדל</td><td>${c.bent ? `${c.bent} מקומות לתמיכה משלימה לפי החלטת המהנדס` : ""}</td></tr></tbody></table>`;
      return h;
    }
    const tsv = () => {
      const lines = [["קבוצה", "פריט", "מידה", "כמות", "יח'", "הערה"].join("\t")];
      let grp = "";
      boqRows().forEach((r) => { if (r.grp) grp = r.grp; else lines.push([grp, r.item, r.size, r.n, r.unit, r.note].map((v) => String(v).replace(/״/g, '"').replace(/׳/g, "'")).join("\t")); });
      return lines.join("\n");
    };

    /* ------------------------------ steps ------------------------------ */
    function runPlacement(anim) {
      drawTowers(anim ? "anim" : "");
      drawBeams(anim);
      drawChains(anim);
      drawViol(true);
      S.animated = true;
      renderSide();
      if (anim) {
        D.toast(`הוצבו ${S.towers.length} מגדלים ב־${BAYS.length} חדרים, ${S.bm.beams.length} קורות ראשיות`);
        D.cmd(`AKRO_PLACE ZONES=${BAYS.length}  SHORES=${S.towers.length}  BEAMS=${S.bm.beams.length}`);
      }
    }
    function legendFor(n) {
      const bayLeg = [...new Set(BAYS.map((b) => S.thick[b.id]))].sort().map((d) => ({ color: THK_COLOR[d], label: `תקרה ${d} ס״מ` }));
      if (n === 1) return [...bayLeg, { color: "#8c979c", label: "S-WALL", mono: true }, { color: "#b9a4ff", label: "S-BEAM", mono: true }, { color: "#ff9f5b", label: "פתח מתחת לקורה" }];
      if (n === 2) return [...bayLeg, { color: "#8c979c", label: "AKRO-ZONES", mono: true }];
      const c = counts();
      const types = AK.TYPES.filter((t) => c.byType[t.id]).map((t) => ({ color: t.color, label: t.name, mono: true }));
      if (n === 3) return [...types, { color: "#e0b130", label: "H16.5", mono: true }, { color: "#d6c15c", label: "AKRO-DIMENSIONS", mono: true }];
      return [{ color: "#5b9dff", label: "מגדל תקין" }, { color: "#ff5d6c", label: "אסור / מידה אדומה" }, { color: "#ffb347", label: "כלל שכופף" }, { color: "#e0b130", label: "קורה ראשית" }];
    }
    function onStep(n) {
      D.svg.classList.toggle("step4", n === 4);
      D.svg.classList.toggle("step1", n === 1);
      D.table(n === 5 ? (ensurePlaced(), check(), tableHtml()) : null);
      drawOverall(n === 1);
      drawTags(n === 1);
      if (n !== 1) { S.bay = null; S.sb = null; }
      paintBays(n === 1);
      gSB.classList.toggle("faint", n !== 1);
      if (n === 1) {
        gTow.innerHTML = ""; gBeam.innerHTML = ""; gChain.innerHTML = ""; gLive.innerHTML = ""; gViol.innerHTML = "";
        S.layers.pz = false;
      } else if (n === 2) {
        D.fit();
        ensurePlaced();
        S.sel = null;
        drawTowers("ghost");
        gBeam.innerHTML = ""; gChain.innerHTML = ""; gLive.innerHTML = ""; gViol.innerHTML = "";
        S.layers.pz = true;
      } else if (n === 3) {
        ensurePlaced();
        check();
        S.layers.pz = true;
        S.layers.dim = true;
        runPlacement(!S.animated && S.moved.size === 0);
        gLive.innerHTML = "";
      } else if (n === 4) {
        ensurePlaced();
        check();
        drawTowers("");
        drawBeams(false);
        gChain.innerHTML = "";
        S.layers.pz = true;
        drawLive();
        drawViol(true);
        D.hint("גררו מגדל כלשהו. מידה אדומה = מרווח חורג", 2800);
      }
      if (n === 5) { ensurePlaced(); check(); }
      setLayers();
      D.legend(legendFor(n));
      updateKpi();
      if (n !== 3) renderSide();
    }

    D.ready();
  }
})();

// Live floor-plan model: opens as a CAD plan, rises into a BIM axonometric.
// One module drives the hero and the construction section (modes per capability).
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const C = {
  ink: 0x0a0c0f,
  floor: 0x0e1115,
  grid: 0x1a1f26,
  wall: 0xc9ced5,
  wallSide: 0x3a414b,
  edge: 0xe9ebee,
  faint: 0x5c6470,
  axis: 0x6f7680,
  red: 0xff5b2e,
  partition: 0x8d949e,
  furnFill: 0x1c2129,
  furnEdge: 0x6b737e,
  glass: 0x9fb6c8,
};

const H = 3.0; // storey height, m
const EXT = 0.3, INT = 0.12, CORE = 0.25;

// ---------------------------------------------------------------- plan (metres, x right, z down)

const AX = [0, 6, 12, 18, 24];
const AZ = [0, 8, 16];
const AX_L = ["A", "B", "C", "D", "E"];
const AZ_L = ["1", "2", "3"];

const W = (a, b, t, open = [], kind = "int") => ({ a, b, t, open, kind });
const win = (at, w = 1.8) => ({ at, w, type: "window" });
const door = (at, w = 0.9, flip = false, bad = false) => ({ at, w, type: "door", flip, bad });
const gap = (at, w = 1.0) => ({ at, w, type: "open" });   // lift doors, passages: head only, no leaf

// A typical office floor, 24 x 16 m on a 6 x 8 m structural grid, planned from the core out.
// Core 10 x 6 m (60 m², floor efficiency 84%): protected stair, two lifts on a lift lobby,
// two WCs, a floor shelter (ממ"ק) and a services riser. Core walls replace the grid column at C2.
// Areas are net: clear span minus half the wall thickness on each side.
const MW = 0.3; // shelter walls
const WALLS = [
  // envelope with a ribbon of windows
  W([0, 0], [24, 0], EXT, [win(1.2), win(4.2), win(7.2), win(13.2), win(16.2), win(20.2)], "ext"),
  W([24, 0], [24, 16], EXT, [win(1.2), win(5), win(9), win(13.4)], "ext"),
  W([24, 16], [0, 16], EXT, [win(1.2), win(4.2), win(7.2), win(10.2), win(13.2), win(18.8), win(21.2)], "ext"),
  W([0, 16], [0, 0], EXT, [door(7.3, 1.6), win(1.4), win(11.2)], "ext"),

  // core shell
  W([7, 5], [17, 5], CORE, [], "core"),
  W([17, 5], [17, 11], CORE, [], "core"),
  W([17, 11], [7, 11], CORE, [door(0.6, 0.8, true), gap(4.4, 1.2), door(8.5, 1.0)], "core"),
  W([7, 11], [7, 5], CORE, [], "core"),
  // protected stair
  W([9.8, 5], [9.8, 11], CORE, [], "core"),
  // lift shafts over the lift lobby
  W([12, 5], [12, 7.5], CORE, [], "core"),
  W([9.8, 7.5], [14.2, 7.5], INT, [gap(0.6, 1.0), gap(2.8, 1.0)], "core"),
  // lobby -> passage between the two WCs -> floor
  W([9.8, 9.5], [14.2, 9.5], INT, [gap(1.6, 1.2)], "core"),
  W([11.4, 9.5], [11.4, 11], INT, [door(0.35, 0.8)], "core"),
  W([12.6, 9.5], [12.6, 11], INT, [door(0.35, 0.8, true)], "core"),
  // floor shelter and services riser
  W([14.2, 5], [14.2, 11], MW, [], "core"),
  W([14.2, 6.7], [17, 6.7], MW, [], "core"),

  // accessible WC against the core (its door is drawn 0.70)
  W([17, 8.6], [19.2, 8.6], INT, [], "int"),
  W([19.2, 8.6], [19.2, 11], INT, [], "int"),
  W([19.2, 11], [17, 11], INT, [door(0.6, 0.7, false, true)], "int"),

  // boardroom, north-east corner
  W([18, 0], [18, 4], INT, [door(2.8, 0.9, true)], "int"),
  W([18, 4], [24, 4], INT, [], "int"),
  // executive office + two meeting rooms on the south facade, 1.5 m corridor to the core
  W([14, 12.5], [24, 12.5], INT, [door(1.2), door(4.6), door(7.4)], "int"),
  W([18, 12.5], [18, 16], INT, [], "int"),
  W([21, 12.5], [21, 16], INT, [], "int"),
  // three private offices, 3.0 x 3.5 m
  W([0, 12.5], [9, 12.5], INT, [door(1.0), door(4.0), door(7.0)], "int"),
  W([3, 12.5], [3, 16], INT, [], "int"),
  W([6, 12.5], [6, 16], INT, [], "int"),
  W([9, 12.5], [9, 16], INT, [], "int"),
];

// drafting symbols inside the core: stair treads, lift and riser crosses
const SYMBOLS = (() => {
  const l = [];
  const X = (x0, z0, x1, z1) => l.push(x0, 0.02, z0, x1, 0.02, z1, x1, 0.02, z0, x0, 0.02, z1);
  X(9.95, 5.15, 11.9, 7.4);
  X(12.1, 5.15, 14.05, 7.4);
  X(14.4, 5.15, 16.85, 6.55);
  l.push(8.4, 0.02, 5.7, 8.4, 0.02, 10.3);                      // stair well / handrail
  for (let z = 5.7; z <= 10.31; z += 0.3) l.push(7.15, 0.02, z, 8.3, 0.02, z, 8.5, 0.02, z, 9.65, 0.02, z);
  l.push(7.72, 0.02, 10.1, 7.72, 0.02, 6.0, 7.72, 0.02, 6.0, 7.55, 0.02, 6.35, 7.72, 0.02, 6.0, 7.89, 0.02, 6.35); // UP arrow
  return l;
})();

// furniture: [x0, z0, x1, z1, height] boxes, and chairs as [x, z] seats
const FURN = (() => {
  const boxes = [], chairs = [];
  const box = (x0, z0, x1, z1, h = 0.74) => boxes.push([x0, z0, x1, z1, h]);
  // back-to-back desk bench along x: n desks of 1.4 x 0.7, chairs on both sides
  const benchX = (x0, z0, n) => {
    box(x0, z0, x0 + 1.4 * n, z0 + 1.4);
    for (let i = 0; i < n; i++) chairs.push([x0 + 0.7 + i * 1.4, z0 - 0.4], [x0 + 0.7 + i * 1.4, z0 + 1.8]);
  };
  const benchZ = (x0, z0, n) => {
    box(x0, z0, x0 + 1.4, z0 + 1.4 * n);
    for (let i = 0; i < n; i++) chairs.push([x0 - 0.4, z0 + 0.7 + i * 1.4], [x0 + 1.8, z0 + 0.7 + i * 1.4]);
  };
  benchX(1.9, 4.7, 3);
  benchX(2.0, 7.7, 2);
  benchX(7.6, 1.3, 5);
  benchZ(20.6, 5.3, 2);
  // boardroom: 10 seats
  box(19.0, 1.45, 23.0, 2.75);
  for (let i = 0; i < 5; i++) chairs.push([19.4 + i * 0.8, 1.0], [19.4 + i * 0.8, 3.2]);
  // meeting rooms: 4 seats each
  for (const cx of [19.5, 22.5]) {
    box(cx - 0.8, 14.1, cx + 0.8, 15.0);
    chairs.push([cx - 0.4, 13.65], [cx + 0.4, 13.65], [cx - 0.4, 15.45], [cx + 0.4, 15.45]);
  }
  // executive: desk facing the door, two guest chairs
  box(15.2, 14.2, 16.8, 15.0);
  chairs.push([16, 15.4], [15.6, 13.75], [16.4, 13.75]);
  // private offices
  for (const x of [0, 3, 6]) { box(x + 0.8, 15.0, x + 2.2, 15.7); chairs.push([x + 1.5, 14.55]); }
  // WCs: pan + basin
  box(10.0, 9.7, 10.4, 10.3, 0.42); box(10.9, 9.65, 11.3, 9.95, 0.85);
  box(13.8, 9.7, 14.2, 10.3, 0.42); box(12.7, 9.65, 13.1, 9.95, 0.85);
  // accessible WC: pan on the side wall, basin, grab rail
  box(17.15, 8.85, 17.85, 9.25, 0.46); box(18.6, 8.75, 19.05, 9.25, 0.85);
  return { boxes, chairs };
})();
const TURNING = { c: [18.2, 10.05], r: 0.75 }; // 1.50 m wheelchair turning circle

// GNN output: two private offices carved out of the open space
const NEW_WALLS = [
  W([0, 3.6], [6.5, 3.6], INT, [door(0.9), door(4.1)], "new"),
  W([3.25, 0], [3.25, 3.6], INT, [], "new"),
  W([6.5, 0], [6.5, 3.6], INT, [], "new"),
];

// QA: shoring towers (acrow props) against the engineer's layout.
// Spec: 1.50 m centres, first row at most 0.30 m from the slab edge.
// Drawn: one bay at 1.90 m, first row 0.60 m from the inner face.
const PROP_X = [1.2, 2.7, 4.2, 6.1];
const PROP_Z = [0.75, 2.25, 3.75, 5.25, 6.75];
const QA_SPAN = { a: [4.2, 7.45], b: [6.1, 7.45] };      // below the last row
const QA_EDGE = { a: [6.1, 0.15], b: [6.1, 0.75] };      // last column, top row
const QA_SPAN_FLAG = [5.15, 10.1];
const QA_EDGE_FLAG = [12.6, 2.4];                        // clear floor north of the core

const ROOMS = [
  { key: "open", c: [4.6, 10.6], he: "חלל עבודה פתוח", en: "Open office", area: 216.1, areaNew: 192.7 },
  { key: "board", c: [21, 2.1], he: "חדר ישיבות", en: "Boardroom", area: 21.9 },
  { key: "exec", c: [16, 14.25], he: "הנהלה", en: "Executive", area: 12.8 },
  { key: "meet", c: [19.5, 14.25], he: "ישיבות", en: "Meeting", area: 9.5 },
  { key: "office", c: [4.5, 14.25], he: "משרד", en: "Office", area: 9.5 },
  { key: "stair", c: [8.4, 8.0], he: "מדרגות", en: "Stair", area: 14.7, small: true },
  { key: "lifts", c: [12.0, 8.5], he: "מבואת מעליות", en: "Lift lobby", area: 8.0, small: true },
  { key: "mamak", c: [15.6, 8.85], he: "ממ״ק", en: "Floor shelter", area: 10.2 },
  { key: "acc", c: [18.1, 9.8], he: "שירותי נכים", en: "Accessible WC", area: 4.6, small: true },
  { key: "new1", c: [1.62, 1.8], he: "משרד", en: "Office", area: 10.3, isNew: true },
  { key: "new2", c: [4.87, 1.8], he: "משרד", en: "Office", area: 10.6, isNew: true },
];

// regulation check: the accessible WC door is 0.70 m, SI 1918 asks for 0.80 m clear
const REG = { open: true, board: true, exec: true, meet: true, office: true, mamak: true, new1: true, new2: true };
const REG_DOOR = [18.25, 11];
const REG_FLAG = [20.4, 14.3];

// ---------------------------------------------------------------- helpers

const lerp = (a, b, t) => a + (b - a) * t;

function addBox(group, x0, z0, x1, z1, y0, y1, t, mat, edgeMat) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.01 || y1 - y0 < 0.01) return;
  const geo = new THREE.BoxGeometry(len, y1 - y0, t);
  const m = new THREE.Mesh(geo, mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.rotation.y = -Math.atan2(dz, dx);
  group.add(m);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
  e.position.copy(m.position);
  e.rotation.copy(m.rotation);
  group.add(e);
}

function buildWall(w, group, mats, floorLines, badLines = floorLines) {
  const [ax, az] = w.a, [bx, bz] = w.b;
  const len = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / len, uz = (bz - az) / len;
  const P = (s) => [ax + ux * s, az + uz * s];
  const ops = [...w.open].sort((p, q) => p.at - q.at);
  let s = 0;
  const solid = (s0, s1, y0 = 0, y1 = H) => {
    const [x0, z0] = P(s0), [x1, z1] = P(s1);
    addBox(group, x0, z0, x1, z1, y0, y1, w.t, mats.wall, mats.edge);
  };
  for (const o of ops) {
    solid(s, o.at);
    if (o.type === "window") {
      solid(o.at, o.at + o.w, 0, 0.9);
      solid(o.at, o.at + o.w, 2.4, H);
      // glazing
      const [x0, z0] = P(o.at), [x1, z1] = P(o.at + o.w);
      const g = new THREE.Mesh(new THREE.PlaneGeometry(o.w, 1.5), mats.glass);
      g.position.set((x0 + x1) / 2, 1.65, (z0 + z1) / 2);
      g.rotation.y = -Math.atan2(uz, ux);
      group.add(g);
      floorLines.push(x0, 0.02, z0, x1, 0.02, z1);
    } else if (o.type === "open") {
      solid(o.at, o.at + o.w, 2.1, H);
    } else {
      solid(o.at, o.at + o.w, 2.1, H);
      // door swing on the floor: leaf + quarter arc
      const n = [-uz, ux];
      const side = o.flip ? -1 : 1;
      const out = o.bad ? badLines : floorLines;
      const [hx, hz] = P(o.at);
      const r = o.w;
      const leafEnd = [hx + n[0] * r * side, hz + n[1] * r * side];
      out.push(hx, 0.02, hz, leafEnd[0], 0.02, leafEnd[1]);
      const steps = 12;
      for (let i = 0; i < steps; i++) {
        const a0 = (i / steps) * Math.PI / 2, a1 = ((i + 1) / steps) * Math.PI / 2;
        const p = (a) => [hx + (ux * Math.sin(a) + n[0] * side * Math.cos(a)) * r, hz + (uz * Math.sin(a) + n[1] * side * Math.cos(a)) * r];
        const [px0, pz0] = p(a0), [px1, pz1] = p(a1);
        out.push(px0, 0.02, pz0, px1, 0.02, pz1);
      }
    }
    s = o.at + o.w;
  }
  solid(s, len);
}

function strips(arr, mat, width = 0.07) {
  const g = new THREE.Group();
  for (let i = 0; i < arr.length; i += 6) {
    const [x0, y0, z0, x1, y1, z1] = arr.slice(i, i + 6);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, width), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
    m.position.set((x0 + x1) / 2, Math.max(y0, y1), (z0 + z1) / 2);
    g.add(m);
  }
  return g;
}

function lines(arr, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
  return new THREE.LineSegments(g, mat);
}

// ---------------------------------------------------------------- model

export function createModel(root, { mode = "plan", auto = false } = {}) {
  const canvas = root.querySelector("canvas");
  const labelLayer = root.querySelector(".model__labels");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("a11y-motion");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    root.classList.add("model--fallback");
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x20242b, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-8, 20, 12);
  scene.add(sun);

  const mats = {
    wall: new THREE.MeshLambertMaterial({ color: C.wall }),
    part: new THREE.MeshLambertMaterial({ color: C.partition }),
    partEdge: new THREE.LineBasicMaterial({ color: C.edge, transparent: true, opacity: 0.25 }),
    edge: new THREE.LineBasicMaterial({ color: C.edge, transparent: true, opacity: 0.55 }),
    glass: new THREE.MeshBasicMaterial({ color: C.glass, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
    faint: new THREE.LineBasicMaterial({ color: C.faint, transparent: true, opacity: 0.9 }),
    grid: new THREE.LineBasicMaterial({ color: C.grid }),
    axis: new THREE.LineDashedMaterial({ color: C.axis, dashSize: 0.6, gapSize: 0.25, transparent: true, opacity: 0.9 }),
    red: new THREE.MeshLambertMaterial({ color: C.red, transparent: true, opacity: 0.9 }),
    redEdge: new THREE.LineBasicMaterial({ color: C.red }),
    redLine: new THREE.LineBasicMaterial({ color: C.red, transparent: true, opacity: 1 }),
    redDash: new THREE.LineDashedMaterial({ color: C.red, dashSize: 0.25, gapSize: 0.15, transparent: true, opacity: 1 }),
  };

  // floor slab + 1m grid
  const slab = new THREE.Mesh(new THREE.BoxGeometry(24.6, 0.2, 16.6), new THREE.MeshLambertMaterial({ color: C.floor }));
  slab.position.set(12, -0.1, 8);
  scene.add(slab);
  // no drafting grid on the floor: real plans don't carry one

  // structural axes, bubbles and columns
  const axes = [];
  AX.forEach((x) => axes.push(x, 0.01, -3.2, x, 0.01, 19.2));
  AZ.forEach((z) => axes.push(-3.2, 0.01, z, 27.2, 0.01, z));
  const axisLines = lines(axes, mats.axis);
  axisLines.computeLineDistances();
  scene.add(axisLines);
  const ring = new THREE.RingGeometry(0.62, 0.7, 40);
  const ringMat = new THREE.MeshBasicMaterial({ color: C.axis, side: THREE.DoubleSide, transparent: true });
  const bubbles = [];
  AX.forEach((x, i) => { bubbles.push({ p: [x, -3.9], t: AX_L[i] }, { p: [x, 19.9], t: AX_L[i] }); });
  AZ.forEach((z, i) => { bubbles.push({ p: [-3.9, z], t: AZ_L[i] }, { p: [27.9, z], t: AZ_L[i] }); });
  bubbles.forEach((b) => {
    const r = new THREE.Mesh(ring, ringMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(b.p[0], 0.01, b.p[1]);
    scene.add(r);
  });

  // walls (the group scales up from plan thickness to full height)
  const walls = new THREE.Group();
  const floorLines = [], badDoor = [];
  const partMats = { ...mats, wall: mats.part, edge: mats.partEdge };
  WALLS.forEach((w) => buildWall(w, walls, w.kind === "int" ? partMats : mats, floorLines, badDoor));
  floorLines.push(...SYMBOLS);
  AX.forEach((x) => AZ.forEach((z) => {
    if (x > 7 && x < 17 && z > 5 && z < 11) return; // taken by the core walls
    const inset = (v, max) => (v === 0 ? 0.25 : v === max ? max - 0.25 : v);
    addBox(walls, inset(x, 24) - 0.25, inset(z, 16), inset(x, 24) + 0.25, inset(z, 16), 0, H, 0.5, mats.wall, mats.edge);
  }));
  scene.add(walls);
  scene.add(lines(floorLines, mats.faint));
  // the non-compliant door: neutral in the drawing, red in the regulation view
  const badMat = new THREE.LineBasicMaterial({ color: C.faint, transparent: true });
  scene.add(lines(badDoor, badMat));
  const regLeaderMat = new THREE.MeshBasicMaterial({ color: C.red, transparent: true, side: THREE.DoubleSide });
  const regLeader = strips([REG_DOOR[0], 0.08, REG_DOOR[1] + 0.15, REG_DOOR[0] + 0.5, 0.08, REG_FLAG[1] - 1.1], regLeaderMat);
  scene.add(regLeader);

  // furniture: one set of boxes reads as plan symbols from above and as objects in 3D
  const furniture = new THREE.Group();
  const furnMat = new THREE.MeshLambertMaterial({ color: C.furnFill });
  const furnEdge = new THREE.LineBasicMaterial({ color: C.furnEdge, transparent: true });
  FURN.boxes.forEach(([x0, z0, x1, z1, h]) => {
    const geo = new THREE.BoxGeometry(x1 - x0, h, z1 - z0);
    const m = new THREE.Mesh(geo, furnMat);
    m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    furniture.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), furnEdge);
    e.position.copy(m.position);
    furniture.add(e);
  });
  const seat = new THREE.CylinderGeometry(0.24, 0.24, 0.46, 20);
  const seatEdge = new THREE.EdgesGeometry(seat, 30);
  FURN.chairs.forEach(([x, z]) => {
    const m = new THREE.Mesh(seat, furnMat);
    m.position.set(x, 0.23, z);
    furniture.add(m);
    const e = new THREE.LineSegments(seatEdge, furnEdge);
    e.position.copy(m.position);
    furniture.add(e);
  });
  // wheelchair turning circle, dashed
  const tc = [];
  for (let i = 0; i < 48; i += 2) {
    const a0 = (i / 48) * Math.PI * 2, a1 = ((i + 1) / 48) * Math.PI * 2;
    tc.push(TURNING.c[0] + Math.cos(a0) * TURNING.r, 0.02, TURNING.c[1] + Math.sin(a0) * TURNING.r,
            TURNING.c[0] + Math.cos(a1) * TURNING.r, 0.02, TURNING.c[1] + Math.sin(a1) * TURNING.r);
  }
  furniture.add(lines(tc, furnEdge));
  scene.add(furniture);

  // proposed partitions (GNN)
  const fresh = new THREE.Group();
  const freshLines = [];
  NEW_WALLS.forEach((w) => buildWall(w, fresh, { ...mats, wall: mats.red, edge: mats.redEdge }, freshLines));
  fresh.add(lines(freshLines, mats.redLine));
  // the proposed offices come furnished (own materials: fresh fades its children)
  const freshFurn = new THREE.MeshLambertMaterial({ color: C.furnFill, transparent: true });
  const freshFurnEdge = new THREE.LineBasicMaterial({ color: C.furnEdge, transparent: true });
  [[0.5, 0.35, 1.9, 1.05], [3.75, 0.35, 5.15, 1.05]].forEach(([x0, z0, x1, z1]) => {
    const geo = new THREE.BoxGeometry(x1 - x0, 0.74, z1 - z0);
    const m = new THREE.Mesh(geo, freshFurn);
    m.position.set((x0 + x1) / 2, 0.37, (z0 + z1) / 2);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), freshFurnEdge);
    e.position.copy(m.position);
    const ch = new THREE.Mesh(seat, freshFurn);
    ch.position.set((x0 + x1) / 2, 0.23, z1 + 0.45);
    const che = new THREE.LineSegments(seatEdge, freshFurnEdge);
    che.position.copy(ch.position);
    fresh.add(m, e, ch, che);
  });
  scene.add(fresh);

  // GNN graph: rooms as nodes
  const graph = new THREE.Group();
  const nodeGeo = new THREE.SphereGeometry(0.28, 16, 12);
  const nodeMat = new THREE.MeshBasicMaterial({ color: C.edge });
  const nodeRed = new THREE.MeshBasicMaterial({ color: C.red });
  const nodes = { open: [4.6, 10.2], core: [12, 8.5], mamak: [15.6, 8.85], acc: [18.1, 9.8], board: [21, 2.1], exec: [16, 14.25], meet: [19.5, 14.25], office: [4.5, 14.25], new1: [1.62, 1.8], new2: [4.87, 1.8] };
  Object.entries(nodes).forEach(([k, [x, z]]) => {
    const n = new THREE.Mesh(nodeGeo, k.startsWith("new") ? nodeRed : nodeMat);
    n.position.set(x, 3.6, z);
    graph.add(n);
  });
  const edges = [["open", "core"], ["core", "mamak"], ["core", "acc"], ["open", "office"], ["open", "exec"], ["exec", "meet"], ["open", "board"], ["open", "new1"], ["open", "new2"], ["new1", "new2"]];
  const ge = [];
  edges.forEach(([a, b]) => { const [x0, z0] = nodes[a], [x1, z1] = nodes[b]; ge.push(x0, 3.6, z0, x1, 3.6, z1); });
  graph.add(lines(ge, new THREE.LineBasicMaterial({ color: C.edge, transparent: true, opacity: 0.5 })));
  scene.add(graph);

  // QA layer: shoring towers and the two dimensions that break the engineer's spec
  const qa = new THREE.Group();
  const propGeo = new THREE.BoxGeometry(0.22, 0.05, 0.22);
  const propMat = new THREE.MeshBasicMaterial({ color: C.edge, transparent: true });
  const propRing = new THREE.RingGeometry(0.2, 0.26, 24);
  PROP_X.forEach((x) => PROP_Z.forEach((z) => {
    const b = new THREE.Mesh(propGeo, propMat);
    b.position.set(x, 0.06, z);
    qa.add(b);
    const r = new THREE.Mesh(propRing, propMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.07, z);
    qa.add(r);
  }));
  // engineer's spacing, dashed, for every bay
  const spec = [];
  PROP_Z.forEach((z) => spec.push(PROP_X[0], 0.05, z, PROP_X[PROP_X.length - 1], 0.05, z));
  PROP_X.forEach((x) => spec.push(x, 0.05, PROP_Z[0], x, 0.05, PROP_Z[PROP_Z.length - 1]));
  const specLines = lines(spec, new THREE.LineDashedMaterial({ color: C.faint, dashSize: 0.15, gapSize: 0.12, transparent: true }));
  specLines.computeLineDistances();
  qa.add(specLines);
  // the two failing dimensions, drawn like real dimension lines
  const bad = [];
  const dimLine = ({ a, b }) => {
    bad.push(a[0], 0.08, a[1], b[0], 0.08, b[1]);
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
    for (const [x, z] of [a, b]) {
      bad.push(x - nx * 0.35, 0.08, z - nz * 0.35, x + nx * 0.35, 0.08, z + nz * 0.35);
      bad.push(x - 0.14, 0.08, z + 0.14, x + 0.14, 0.08, z - 0.14);
    }
  };
  dimLine(QA_SPAN);
  dimLine(QA_EDGE);
  // extension lines from the props down to the span dimension
  bad.push(4.2, 0.08, 6.75, 4.2, 0.08, 7.7, 6.1, 0.08, 6.75, 6.1, 0.08, 7.7);
  // leaders from each dimension to its flag
  bad.push(5.15, 0.08, 7.45, QA_SPAN_FLAG[0], 0.08, QA_SPAN_FLAG[1] - 1.4);
  bad.push(6.3, 0.08, 0.45, QA_EDGE_FLAG[0] - 4.6, 0.08, QA_EDGE_FLAG[1]);
  const redFill = new THREE.MeshBasicMaterial({ color: C.red, transparent: true, side: THREE.DoubleSide });
  qa.add(strips(bad, redFill));
  scene.add(qa);

  // dimension chains (mm), outside the envelope
  const dim = [];
  const tick = (x, z) => dim.push(x - 0.25, 0.02, z + 0.25, x + 0.25, 0.02, z - 0.25);
  dim.push(0, 0.02, -2.2, 24, 0.02, -2.2);
  AX.forEach((x) => { tick(x, -2.2); dim.push(x, 0.02, -2.6, x, 0.02, -0.4); });
  dim.push(-2.2, 0.02, 0, -2.2, 0.02, 16);
  AZ.forEach((z) => { tick(-2.2, z); dim.push(-2.6, 0.02, z, -0.4, 0.02, z); });
  const dimMat = new THREE.LineBasicMaterial({ color: C.faint, transparent: true });
  scene.add(lines(dim, dimMat));

  // ---------------------------------------------------------------- labels (HTML, never scaled or clipped)

  const labels = [];
  const lang = () => document.documentElement.lang === "en" ? "en" : "he";
  const addLabel = (cls, pos, text, prio = 1) => {
    const el = document.createElement("span");
    el.className = "ml " + cls;
    labelLayer.append(el);
    const l = { el, pos: new THREE.Vector3(...pos), text, prio, w: 0, h: 0 };
    labels.push(l);
    return l;
  };
  const fmtArea = (a) => `${a.toFixed(1)} ${lang() === "en" ? "m²" : "מ״ר"}`;

  AX.slice(0, -1).forEach((x, i) => addLabel("ml--dim", [(x + AX[i + 1]) / 2, 0, -2.2], () => "6000", 2));
  AZ.slice(0, -1).forEach((z, i) => addLabel("ml--dim ml--vert", [-2.2, 0, (z + AZ[i + 1]) / 2], () => "8000", 2));
  bubbles.forEach((b) => addLabel("ml--axis", [b.p[0], 0, b.p[1]], () => b.t, 5));
  let freshOn = false;
  const he = () => lang() === "he";
  ROOMS.forEach((r) => addLabel("ml--room" + (r.isNew ? " ml--new" : "") + (r.small ? " ml--small" : ""), [r.c[0], 0.05, r.c[1]],
    () => `<b>${r[lang()]}</b><i>${fmtArea(r.areaNew && freshOn ? r.areaNew : r.area)}</i>` +
      (r.key in REG ? `<em class="ok">${he() ? "תקין" : "Compliant"}</em>` : ""),
    r.small ? 1 : 3));
  const flag = (big, small) => `<b>${big}</b><span>${small}</span>`;
  const qaLabels = [
    addLabel("ml--flag ml--flag-2", [QA_SPAN_FLAG[0], 0.1, QA_SPAN_FLAG[1]], () => flag(he() ? "Δ 0.40 מ׳ · מפתח" : "Δ 0.40 m · spacing",
      he() ? "מהנדס 1.50 · בשרטוט 1.90" : "Engineer 1.50 · drawn 1.90"), 7),
    addLabel("ml--flag ml--flag-2", [QA_EDGE_FLAG[0], 0.1, QA_EDGE_FLAG[1]], () => flag(he() ? "Δ 0.30 מ׳ · מהקצה" : "Δ 0.30 m · edge",
      he() ? "מהנדס ≤0.30 · בשרטוט 0.60" : "Engineer ≤0.30 · drawn 0.60"), 7),
  ];
  const regLabel = addLabel("ml--flag ml--flag-2", [REG_FLAG[0], 0.1, REG_FLAG[1]], () => flag(he() ? "ת״י 1918 · נגישות" : "SI 1918 · accessibility",
    he() ? "דלת 0.70 מ׳ · נדרש 0.80" : "Door 0.70 m · required 0.80"), 8);
  const gnnLabel = addLabel("ml--flag", [3.25, 4.2, 1.8], () => (lang() === "en" ? "GNN · proposed partitions" : "GNN · מחיצות מוצעות"), 8);

  const renderLabels = () => labels.forEach((l) => { l.el.innerHTML = l.text(); l.w = 0; });
  renderLabels();
  document.addEventListener("langchange", renderLabels);

  // ---------------------------------------------------------------- state

  const MODES = {
    plan: { elev: 89.9, azim: 0, height: 0.035, fresh: 0, graph: 0, qa: 0, reg: 0, dims: 1 },
    bim: { elev: 32, azim: -36, height: 1, fresh: 0, graph: 0, qa: 0, reg: 0, dims: 0 },
    gnn: { elev: 40, azim: -32, height: 1, fresh: 1, graph: 1, qa: 0, reg: 0, dims: 0 },
    qa: { elev: 89.9, azim: 0, height: 0.035, fresh: 0, graph: 0, qa: 1, reg: 0, dims: 1 },
    reg: { elev: 89.9, azim: 0, height: 0.035, fresh: 1, graph: 0, qa: 0, reg: 1, dims: 1 },
  };
  const cur = { ...MODES[mode] };
  let target = MODES[mode];
  let orbit = 0, drift = 0;

  const setMode = (m) => {
    target = MODES[m] || MODES.bim;
    root.dataset.mode = m;
    freshOn = target.fresh > 0.5;
    renderLabels();
    if (reduce) Object.assign(cur, target);
    wake();
  };

  // ---------------------------------------------------------------- camera fit (everything stays inside the frame)

  const fitPts = [];
  const fitBox = (m) => {
    fitPts.length = 0;
    for (const x of [-m, 24 + m]) for (const z of [-m, 16 + m]) for (const y of [0, H + 0.4]) fitPts.push(new THREE.Vector3(x, y, z));
  };
  const center = new THREE.Vector3(12, 1.2, 8);
  const v = new THREE.Vector3();

  function placeCamera(w, h) {
    fitBox(lerp(0.6, 4.7, cur.dims));
    const el = THREE.MathUtils.degToRad(cur.elev);
    const az = THREE.MathUtils.degToRad(cur.azim + orbit + drift);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    cam.position.copy(center).addScaledVector(dir, 60);
    cam.up.set(0, 1, 0);
    cam.lookAt(center);
    cam.updateMatrixWorld();
    // bounds of the scene in camera space
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const inv = cam.matrixWorldInverse;
    for (const p of fitPts) {
      v.copy(p);
      v.y *= p.y > 0 ? cur.height : 1;
      v.applyMatrix4(inv);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const pad = 1.02;
    let bw = (maxX - minX) * pad, bh = (maxY - minY) * pad;
    const aspect = w / h;
    if (bw / bh > aspect) bh = bw / aspect; else bw = bh * aspect;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    cam.left = cx - bw / 2; cam.right = cx + bw / 2;
    cam.top = cy + bh / 2; cam.bottom = cy - bh / 2;
    cam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- loop

  let raf = 0, visible = true, last = performance.now(), idleUntil = 0;
  const wake = () => { idleUntil = performance.now() + 2600; if (!raf && visible) raf = requestAnimationFrame(frame); };

  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const k = reduce ? 1 : 1 - Math.exp(-dt * 3.2);
    for (const key of Object.keys(target)) cur[key] = lerp(cur[key], target[key], k);
    if (auto && !reduce && root.dataset.mode === "bim") drift = Math.sin(now / 4200) * 7;
    else drift = lerp(drift, 0, k);

    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);

    walls.scale.y = cur.height;
    furniture.scale.y = Math.max(cur.height, 0.035);
    furniture.visible = cur.qa < 0.98;
    furnEdge.opacity = 1 - cur.qa;
    fresh.scale.y = Math.max(cur.height, 0.035) * cur.fresh + 0.0001;
    fresh.visible = cur.fresh > 0.02;
    fresh.children.forEach((c) => { if (c.material) c.material.opacity = cur.fresh; });
    graph.visible = cur.graph > 0.02;
    graph.position.y = (1 - cur.graph) * -2;
    qa.visible = cur.qa > 0.02;
    mats.axis.opacity = 0.9 * cur.dims;
    ringMat.opacity = cur.dims;
    dimMat.opacity = cur.dims;
    axisLines.visible = cur.dims > 0.02;
    propMat.opacity = cur.qa;
    redFill.opacity = cur.qa;
    badMat.color.setHex(cur.reg > 0.5 ? C.red : C.faint);
    regLeader.visible = cur.reg > 0.02;
    regLeaderMat.opacity = cur.reg;
    placeCamera(w, h);
    renderer.render(scene, cam);

    // labels: project, keep inside the frame, then drop the weaker of any two that collide
    const planness = Math.min(1, Math.max(0, (cur.elev - 60) / 29.9));
    const placed = [];
    for (const l of labels) {
      v.copy(l.pos);
      if (l === gnnLabel) v.y = (H + 1.4) * cur.height;
      v.project(cam);
      let x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      let op = 1;
      const c = l.el.classList;
      if (c.contains("ml--dim")) op = cur.dims * planness;
      else if (c.contains("ml--axis")) op = cur.dims;
      else if (c.contains("ml--room")) op = planness * (c.contains("ml--new") ? cur.fresh : 1) * (1 - cur.qa);
      if (qaLabels.includes(l)) op = cur.qa * planness;
      if (l === regLabel) op = cur.reg * planness;
      if (l === gnnLabel) op = cur.graph * (1 - planness);
      if (!l.w) { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; }
      const hw = l.w / 2 + 4, hh = l.h / 2 + 4;
      const out = x < hw || x > w - hw || y < hh || y > h - hh;
      x = Math.min(Math.max(x, hw), w - hw);
      y = Math.min(Math.max(y, hh), h - hh);
      l.x = x; l.y = y; l.op = out && !c.contains("ml--flag") ? 0 : op;
      if (l.op > 0.02) placed.push(l);
    }
    placed.sort((a, b) => b.prio - a.prio);
    const kept = [];
    for (const l of placed) {
      const hit = kept.some((k) => Math.abs(k.x - l.x) * 2 < k.w + l.w + 6 && Math.abs(k.y - l.y) * 2 < k.h + l.h + 2);
      if (hit) l.op = 0; else kept.push(l);
    }
    for (const l of labels) {
      l.el.style.transform = `translate3d(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      l.el.style.opacity = l.op.toFixed(3);
      l.el.style.visibility = l.op < 0.02 ? "hidden" : "visible";
    }

    const settling = Object.keys(target).some((key) => Math.abs(cur[key] - target[key]) > 0.002);
    const idle = auto && root.dataset.mode === "bim" && !reduce;
    if (visible && (settling || idle || now < idleUntil)) raf = requestAnimationFrame(frame);
  }

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }).observe(root);
  new ResizeObserver(wake).observe(root);

  // drag to orbit (horizontal only, so vertical scrolling still works on touch)
  let dragX = null, base = 0;
  root.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; dragX = e.clientX; base = orbit; root.setPointerCapture(e.pointerId); root.classList.add("is-dragging"); });
  root.addEventListener("pointermove", (e) => {
    if (dragX == null) return;
    if (cur.elev > 80) return;
    orbit = Math.max(-70, Math.min(70, base + (e.clientX - dragX) * 0.25));
    wake();
  });
  const end = () => { dragX = null; root.classList.remove("is-dragging"); };
  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", end);

  // jump straight to the target state (reduced motion, tests, print)
  const snap = () => {
    Object.assign(cur, target);
    drift = 0;
    frame(performance.now());
  };

  root.classList.add("model--ready");
  setMode(mode);
  const api = { setMode, snap };
  root._model = api;
  return api;
}

// The places: big halls inside the labyrinth (see maze.ts placeAt). Each is
// built only when you're near, from simple shapes + canvas textures, and lit
// mostly by glowing materials. A fixed pool of 3 real lights goes to the
// nearest place (a changing light count would make three.js recompile).
//   the open        – no ceiling: a night sky, a moon, standing stones, fireflies, the BIGNORD NEWS tower
//   the theater     – seats, a stage with midnight-blue curtains, a spotlight, a mic
//   the mall        – strange shopfronts, a fountain, mannequins, benches
//   the museum      – exhibits floating under glass, photos in frames, labels
//   the supermarket – aisles of colourful products, checkouts, buzzing tubes
//   the dark room   – secret: a fake wall for a door, near-total dark, one cube
import * as THREE from "three";
import { CELL, PLACE, WALL_H, darkDoorSide, placeAt, placeOf, type PlaceKind } from "./maze";
import { relicMesh } from "./props";
import { zoneAt, zoneWallMaterial } from "./zones";
import { beam, shipSilhouette } from "./ship";
import { newsTower } from "./bignord";

export const PLACE_NAMES: Record<PlaceKind, string> = {
  open: "the open",
  theater: "the theater",
  mall: "the mall",
  museum: "the museum",
  market: "the supermarket",
  dark: "the dark room",
  ritual: "the hall of champions",
  bazaar: "the open market",
};

// ------------------------------------------------------------------ the market's stalls (fed by market.ts)
export type StallRow = { seller: string; items: { glyph: string; name: string; price: number }[] };
let stalls: StallRow[] = [];
const stallRedraws = new Set<() => void>();
export function setStalls(rows: StallRow[]) {
  stalls = rows;
  stallRedraws.forEach((f) => f());
}

// ------------------------------------------------------------------ champions (fed by champions.ts)
export type ChampionRow = { id: string; nick: string; best: number };
let champions: ChampionRow[] = [];
let myId = "";
const redraws = new Set<() => void>();
export function setChampions(list: ChampionRow[], me: string) {
  champions = list;
  myId = me;
  redraws.forEach((f) => f());
}

const L = PLACE * CELL; // 20 m
const REGION = 7;

// ------------------------------------------------------------------ helpers
const mat = (color: number, emissive = 0, ei = 1, rough = 0.7) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05, emissive, emissiveIntensity: emissive ? ei : 0 });

function box(g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  g.add(b);
  return b;
}

function textTexture(text: string, opts: { w?: number; h?: number; color?: string; bg?: string; font?: string; glow?: boolean } = {}) {
  const c = document.createElement("canvas");
  c.width = opts.w ?? 512;
  c.height = opts.h ?? 128;
  const g = c.getContext("2d")!;
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, c.width, c.height);
  }
  g.font = opts.font ?? "italic 56px 'Times New Roman', serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = opts.color ?? "#fff";
  if (opts.glow) {
    g.shadowColor = opts.color ?? "#fff";
    g.shadowBlur = 18;
  }
  g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sign(g: THREE.Group, text: string, w: number, h: number, x: number, y: number, z: number, ry: number, opts: Parameters<typeof textTexture>[1] = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTexture(text, opts), transparent: !opts.bg, toneMapped: false }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  g.add(m);
  return m;
}

/** each place has its own floor over the corridor floor */
function floorOf(g: THREE.Group, color: number, rough: number, metal: number, tile = 0) {
  let map: THREE.Texture | undefined;
  if (tile) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const t = c.getContext("2d")!;
    t.fillStyle = "#fff";
    t.fillRect(0, 0, 128, 128);
    t.strokeStyle = "rgba(0,0,0,0.25)";
    t.lineWidth = 3;
    t.strokeRect(0, 0, 128, 128);
    map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(tile, tile);
  }
  const f = new THREE.Mesh(new THREE.PlaneGeometry(L, L), new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, map }));
  f.rotation.x = -Math.PI / 2;
  f.position.set(L / 2, 0.02, L / 2);
  g.add(f);
}

function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.4, "rgba(255,255,255,0.45)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
const DOT = dotTexture();

function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

type Spot = { x: number; y: number; z: number; color: number; intensity: number };
type Built = { group: THREE.Group; kind: PlaceKind; I: number; J: number; spots: Spot[]; anim: ((t: number, dt: number) => void)[]; darkCube?: THREE.Object3D; cleanup?: () => void };

// ------------------------------------------------------------------ the places
function buildOpen(g: THREE.Group, b: Built, r: () => number) {
  // grass-dark ground
  const gc = document.createElement("canvas");
  gc.width = gc.height = 256;
  const gg = gc.getContext("2d")!;
  gg.fillStyle = "#1c2418";
  gg.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 3000; k++) {
    gg.fillStyle = `rgba(${60 + r() * 60},${90 + r() * 70},${50 + r() * 40},${0.3 + r() * 0.5})`;
    gg.fillRect(r() * 256, r() * 256, 1, 2 + r() * 5);
  }
  const gt = new THREE.CanvasTexture(gc);
  gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
  gt.repeat.set(5, 5);
  gt.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(L, L), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(L / 2, 0.02, L / 2);
  g.add(ground);
  // the sky: stars and a moon right above
  const n = 500, sp = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, e = 0.15 + r() * 1.3, d = 40;
    sp.set([L / 2 + Math.cos(a) * Math.cos(e) * d, 6 + Math.sin(e) * d, L / 2 + Math.sin(a) * Math.cos(e) * d], k * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  g.add(new THREE.Points(sg, new THREE.PointsMaterial({ map: DOT, size: 0.5, color: 0xffffff, transparent: true, depthWrite: false, fog: false })));
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: 0xf4f1e2, fog: false, depthWrite: false }));
  moon.scale.set(9, 9, 1);
  moon.position.set(L / 2 + 12, 30, L / 2 - 14);
  g.add(moon);
  // standing stones (match maze.ts SOLID)
  const stone = mat(0x55524c, 0, 0, 0.95);
  for (const [x, z] of [[5.5, 5.5], [14.5, 6.5], [10, 14.5]]) {
    const s = box(g, 1, 2.6 + r(), 1, x, 1.3, z, stone);
    s.rotation.set((r() - 0.5) * 0.12, r() * 3, (r() - 0.5) * 0.12);
  }
  // fireflies
  const flies: THREE.Sprite[] = [];
  for (let k = 0; k < 40; k++) {
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: 0xd8ff7a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    f.scale.setScalar(0.18);
    f.userData = { x: r() * L, z: r() * L, y: 0.4 + r() * 2, p: r() * 10 };
    flies.push(f);
    g.add(f);
  }
  b.anim.push((t) => {
    for (const f of flies) {
      const u = f.userData;
      f.position.set(u.x + Math.sin(t * 0.4 + u.p) * 1.5, u.y + Math.sin(t * 1.3 + u.p) * 0.3, u.z + Math.cos(t * 0.35 + u.p) * 1.5);
      (f.material as THREE.SpriteMaterial).opacity = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2 + u.p * 3));
    }
  });
  b.spots.push({ x: L / 2, y: 6, z: L / 2, color: 0xa8bcff, intensity: 4 });
  // the ship hangs in the sky over the open, and a beam comes down to the middle
  const ship = shipSilhouette();
  ship.position.set(L / 2, 70, L / 2);
  g.add(ship);
  const up = beam(70);
  up.position.set(L / 2, 0, L / 2);
  g.add(up);
  b.anim.push((t) => {
    up.userData.tick(t);
    ship.rotation.y = Math.sin(t * 0.03) * 0.3;
  });
  // BIGNORD NEWS towers over the north wall
  b.anim.push(newsTower(g, L));
}

function buildTheater(g: THREE.Group, b: Built, r: () => number) {
  floorOf(g, 0x161a3a, 0.95, 0); // navy carpet
  const wood = mat(0x2a1d14, 0, 0, 0.6);
  box(g, 14, 0.9, 3.5, 10, 0.45, 2.75, wood); // the stage (maze.ts: 3,1 → 17,4.5)
  // midnight-blue velvet curtains with folds, gold trim
  const cc = document.createElement("canvas");
  cc.width = 256;
  cc.height = 256;
  const cg = cc.getContext("2d")!;
  for (let x = 0; x < 256; x++) {
    const v = 20 + Math.round(18 * Math.sin(x / 9) ** 2);
    cg.fillStyle = `rgb(${v * 0.5},${v * 0.6},${v * 2})`;
    cg.fillRect(x, 0, 1, 256);
  }
  const ct = new THREE.CanvasTexture(cc);
  ct.colorSpace = THREE.SRGBColorSpace;
  const curtain = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.9, side: THREE.DoubleSide });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(14, WALL_H - 0.9), curtain);
  back.position.set(10, 0.9 + (WALL_H - 0.9) / 2, 1.1);
  g.add(back);
  for (const x of [4.6, 15.4]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(3.2, WALL_H - 0.9), curtain);
    side.position.set(x, 0.9 + (WALL_H - 0.9) / 2, 4.3);
    g.add(side);
  }
  const gold = mat(0xb08a3c, 0x5a4010, 0.6, 0.35);
  box(g, 0.4, WALL_H, 0.4, 3, WALL_H / 2, 4.5, gold);
  box(g, 0.4, WALL_H, 0.4, 17, WALL_H / 2, 4.5, gold);
  box(g, 14.4, 0.4, 0.4, 10, WALL_H - 0.2, 4.5, gold);
  sign(g, "tonight: you", 4, 0.8, 10, 2.6, 1.15, 0, { color: "#ffe6b8", glow: true });
  // the mic
  const steel = mat(0x888888, 0, 0, 0.3);
  box(g, 0.05, 1.5, 0.05, 10, 1.65, 3.4, steel);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), steel);
  head.position.set(10, 2.45, 3.4);
  g.add(head);
  // the spotlight beam
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(1.4, WALL_H - 0.9, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.set(10, 0.9 + (WALL_H - 0.9) / 2, 3.2);
  g.add(beam);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.35, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(10, 0.91, 3.2);
  g.add(pool);
  // rows of seats (maze.ts SOLID rows)
  const seatMat = mat(0x1a2050, 0, 0, 0.85);
  const seats: [number, number][] = [];
  for (const z of [8.4, 10.9, 13.4]) for (const [x0, x1] of [[4.2, 8.4], [11.7, 15.9]]) for (let x = x0; x <= x1; x += 0.6) seats.push([x, z]);
  const seatGeo = new THREE.BoxGeometry(0.5, 0.45, 0.5);
  const backGeo = new THREE.BoxGeometry(0.5, 0.6, 0.1);
  const im = new THREE.InstancedMesh(seatGeo, seatMat, seats.length);
  const ib = new THREE.InstancedMesh(backGeo, seatMat, seats.length);
  const m4 = new THREE.Matrix4();
  seats.forEach(([x, z], k) => {
    im.setMatrixAt(k, m4.makeTranslation(x, 0.225, z));
    ib.setMatrixAt(k, m4.makeTranslation(x, 0.65, z + 0.25));
  });
  g.add(im, ib);
  // somebody left a single seat folded down, glowing
  b.anim.push((t) => {
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(t * 0.7) * 0.03;
    void r;
  });
  b.spots.push({ x: 10, y: 3.2, z: 3.4, color: 0xffe6b8, intensity: 9 }, { x: 10, y: 3, z: 12, color: 0x6070ff, intensity: 2.5 });
}

const SHOPS = ["lost & found", "mirrors · 50% off", "teeth", "yesterday", "seeface1", "nothing", "returns only", "pets that left"];
const NEON = ["#ff3cf0", "#3cf2ff", "#a4ff3c", "#ffb13c", "#ffffff", "#c8a0ff", "#ff7a5a", "#7affd8"];

function buildMall(g: THREE.Group, b: Built, r: () => number) {
  floorOf(g, 0xe2ddd2, 0.12, 0.3, 10); // polished pale tiles
  // two shopfronts per side, leaving the middle doorway free (8–12 m)
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fc8d8, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.3 });
  let k = Math.floor(r() * SHOPS.length);
  const fronts: [number, number, number][] = []; // x, z, rotation
  for (const pos of [3.5, 16.5]) {
    fronts.push([pos, 0.4, 0], [pos, L - 0.4, Math.PI], [0.4, pos, Math.PI / 2], [L - 0.4, pos, -Math.PI / 2]);
  }
  for (const [x, z, ry] of fronts) {
    const shop = new THREE.Group();
    shop.position.set(x, 0, z);
    shop.rotation.y = ry;
    const c = NEON[k % NEON.length];
    // lit window box
    box(shop, 5, 2.4, 0.3, 0, 1.2, -0.2, mat(0x101014, new THREE.Color(c).getHex(), 0.75));
    box(shop, 5, 2.4, 0.05, 0, 1.2, 0.05, glass);
    sign(shop, SHOPS[k % SHOPS.length], 4, 0.6, 0, 2.85, 0.1, 0, { color: c, glow: true, bg: "#050505" });
    // a mannequin in some windows
    if (r() < 0.5) {
      const white = mat(0xe8e4dc, 0, 0, 0.4);
      box(shop, 0.35, 1.3, 0.25, (r() - 0.5) * 2.5, 0.85, -0.1, white);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), white);
      head.position.set(shop.children[shop.children.length - 1].position.x, 1.7, -0.1);
      shop.add(head);
    }
    g.add(shop);
    k++;
  }
  // the fountain (maze.ts SOLID: 8.3–11.7)
  const stone = mat(0xbab4a8, 0, 0, 0.6);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.8, 0.6, 32), stone);
  basin.position.set(10, 0.3, 10);
  g.add(basin);
  const waterTex = textTexture(" ", { w: 64, h: 64, bg: "#7fc8e8" });
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.55, 32), new THREE.MeshStandardMaterial({ color: 0x4aa8d8, roughness: 0.05, metalness: 0.4, map: waterTex, emissive: 0x0a3040, emissiveIntensity: 1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(10, 0.58, 10);
  g.add(water);
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, 1.6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.6, depthWrite: false }));
  jet.position.set(10, 1.4, 10);
  g.add(jet);
  // benches + planters
  const bench = mat(0x3a2a1e, 0, 0, 0.7);
  for (const [x, z] of [[6, 10], [14, 10], [10, 6], [10, 14]]) box(g, x === 10 ? 2 : 0.6, 0.45, x === 10 ? 0.6 : 2, x, 0.23, z, bench);
  const leaf = mat(0x2f6a3a, 0x0a2010, 0.4, 0.8);
  for (const [x, z] of [[6, 6], [14, 6], [6, 14], [14, 14]]) {
    box(g, 0.8, 0.6, 0.8, x, 0.3, z, stone);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), leaf);
    bush.position.set(x, 1, z);
    g.add(bush);
  }
  b.anim.push((t) => {
    jet.scale.y = 1 + Math.sin(t * 6) * 0.08;
    water.rotation.z = t * 0.1;
  });
  b.spots.push({ x: 10, y: 3.2, z: 10, color: 0xffe2b8, intensity: 22 }, { x: 4, y: 3, z: 16, color: 0xc8a0ff, intensity: 12 }, { x: 16, y: 3, z: 4, color: 0x9fe8ff, intensity: 12 });
}

const PLAQUES = ["exhibit 3: a door, closed (1994)", "exhibit 7: a cube that wanted out", "exhibit 12: the last thing you forgot", "exhibit 21: someone's light, still warm", "the first cube. do not spin."];

function buildMuseum(g: THREE.Group, b: Built, r: () => number) {
  // pale polished floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, L), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.15, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(L / 2, 0.02, L / 2);
  g.add(floor);
  const white = mat(0xf2efe8, 0, 0, 0.5);
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe8f0, transparent: true, opacity: 0.18, roughness: 0.02, metalness: 0.2 });
  const exhibits: THREE.Object3D[] = [];
  const peds: [number, number, number][] = [[5, 5, 0], [15, 5, 1], [5, 15, 2], [15, 15, 3], [10, 10, 4]];
  for (const [x, z, k] of peds) {
    const big = k === 4;
    box(g, big ? 2 : 1, 1.1, big ? 2 : 1, x, 0.55, z, white);
    box(g, big ? 1.9 : 0.9, 1.1, big ? 1.9 : 0.9, x, 1.65, z, glass);
    const thing = big
      ? new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.8, emissive: 0x101010 }))
      : relicMesh([0xff3cf0, 0x3cf2ff, 0xa4ff3c, 0xffb13c][k], k);
    thing.position.set(x, 1.65, z);
    g.add(thing);
    exhibits.push(thing);
    // the label on the pedestal
    sign(g, PLAQUES[k], big ? 2 : 1.3, 0.22, x, 0.8, z + (big ? 1.01 : 0.51), 0, { w: 1024, h: 96, font: "italic 44px 'Times New Roman', serif", color: "#2a2620", bg: "#e8e2d4" });
  }
  // photographs in gold frames on the inner walls (not across the doorways)
  const frame = mat(0x9a7a3a, 0x2a1a00, 0.4, 0.4);
  const loader = new THREE.TextureLoader();
  let n = 0;
  for (const pos of [4, 16]) {
    for (const [x, z, ry] of [[pos, 0.35, 0], [pos, L - 0.35, Math.PI], [0.35, pos, Math.PI / 2], [L - 0.35, pos, -Math.PI / 2]] as [number, number, number][]) {
      const f = new THREE.Group();
      f.position.set(x, 1.7, z);
      f.rotation.y = ry;
      box(f, 2.3, 1.7, 0.08, 0, 0, 0, frame);
      const tex = loader.load(`https://picsum.photos/seed/seeface1-museum-${n++ + Math.floor(r() * 50)}/400/300?grayscale`);
      tex.colorSpace = THREE.SRGBColorSpace;
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.45), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      pic.position.z = 0.05;
      f.add(pic);
      g.add(f);
    }
  }
  // velvet ropes (midnight blue) around the big exhibit
  const brass = mat(0xb08a3c, 0, 0, 0.3);
  const velvet = mat(0x141a4a, 0, 0, 0.9);
  const posts: [number, number][] = [[8.2, 8.2], [11.8, 8.2], [11.8, 11.8], [8.2, 11.8]];
  posts.forEach(([x, z], k) => {
    box(g, 0.08, 0.9, 0.08, x, 0.45, z, brass);
    const [x2, z2] = posts[(k + 1) % 4];
    const rope = box(g, Math.abs(x2 - x) || 0.04, 0.05, Math.abs(z2 - z) || 0.04, (x + x2) / 2, 0.8, (z + z2) / 2, velvet);
    void rope;
  });
  b.anim.push((t) => {
    exhibits.forEach((e, k) => {
      e.rotation.y = t * (k === 4 ? 0.2 : 0.6);
      e.position.y = 1.65 + Math.sin(t * 1.2 + k) * 0.06;
    });
  });
  b.spots.push({ x: 10, y: 3.2, z: 10, color: 0xffffff, intensity: 6 }, { x: 5, y: 3.2, z: 15, color: 0xfff0dc, intensity: 3 });
}

function buildMarket(g: THREE.Group, b: Built, r: () => number) {
  floorOf(g, 0xd8dcd4, 0.3, 0.1, 20); // supermarket linoleum
  const shelfMat = mat(0xd8d8d0, 0, 0, 0.5);
  const products: { x: number; y: number; z: number; c: number; s: number }[] = [];
  const COLS = [0xff3c3c, 0x3cff7a, 0x3c8cff, 0xffd23c, 0xff3cf0, 0xffffff, 0xff8a1e, 0x8a3cff, 0x1effe0];
  for (const x0 of [3, 7, 11, 15]) {
    // shelf body + 4 boards (maze.ts SOLID: 1 m wide, z 3–14)
    box(g, 1, 2.2, 11, x0 + 0.5, 1.1, 8.5, shelfMat);
    for (const y of [0.35, 0.85, 1.35, 1.85])
      for (const side of [-1, 1])
        for (let z = 3.3; z < 13.8; z += 0.32) if (r() < 0.85) products.push({ x: x0 + 0.5 + side * 0.62, y: y + 0.18, z, c: COLS[Math.floor(r() * COLS.length)], s: 0.7 + r() * 0.6 });
  }
  const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.32, 0.24), new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: 0x111111 }), products.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  products.forEach((p, k) => {
    m4.makeScale(1, p.s, 1).setPosition(p.x, p.y, p.z);
    pm.setMatrixAt(k, m4);
    pm.setColorAt(k, col.setHex(p.c));
  });
  g.add(pm);
  // checkouts (maze.ts SOLID) with a little glowing screen
  for (const x of [4.25, 9.25, 14.25]) {
    box(g, 2.5, 0.9, 1, x, 0.45, 17, mat(0x333338, 0, 0, 0.5));
    box(g, 0.4, 0.3, 0.05, x + 0.8, 1.25, 16.6, mat(0x000000, 0x3cff9a, 1.5));
  }
  // fluorescent tubes that buzz and flicker
  const tubeMat = mat(0xffffff, 0xeaffff, 1.6);
  const tubes: THREE.Mesh[] = [];
  for (const x of [5.5, 9.5, 13.5]) tubes.push(box(g, 0.15, 0.06, 10, x, WALL_H - 0.1, 8.5, tubeMat));
  sign(g, "OPEN 24/7 · NEVER CLOSED", 6, 0.7, 10, 2.9, 19.6, Math.PI, { color: "#3cff9a", glow: true, bg: "#050505", font: "bold 50px Arial, sans-serif" });
  sign(g, "everything 1 ◈", 3, 0.5, 2, 2.6, 10, Math.PI / 2, { color: "#ffd23c", glow: true });
  b.anim.push((t) => {
    tubeMat.emissiveIntensity = Math.sin(t * 37) > 0.97 ? 0.3 : 1.6;
  });
  b.spots.push({ x: 7.5, y: 3, z: 8.5, color: 0xeefff8, intensity: 6 }, { x: 13.5, y: 3, z: 8.5, color: 0xeefff8, intensity: 5 });
}

function buildDark(g: THREE.Group, b: Built) {
  // black inside: a box seen from the inside only (from outside it's invisible)
  const shell = new THREE.Mesh(new THREE.BoxGeometry(L - 0.4, WALL_H - 0.05, L - 0.4), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }));
  shell.position.set(L / 2, WALL_H / 2, L / 2);
  g.add(shell);
  // the door is a wall you can walk through: a panel with the corridor's wallpaper, outside face only
  const side = darkDoorSide(b.I, b.J);
  const wm = zoneWallMaterial(zoneAt(g.position.x, g.position.z), 0);
  const fake = new THREE.Mesh(new THREE.PlaneGeometry(CELL, WALL_H), wm);
  const mid = 2.5 * CELL;
  const spots: [number, number, number][] = [
    [L + 0.16, mid, Math.PI / 2], // east, facing out (+x)
    [-0.16, mid, -Math.PI / 2], // west
    [mid, L + 0.16, 0], // south
    [mid, -0.16, Math.PI], // north
  ];
  const [fx, fz, ry] = spots[side];
  fake.position.set(fx, WALL_H / 2, fz);
  fake.rotation.y = ry;
  g.add(fake);
  // the one thing in the dark: a black cube, barely glowing, 1994 on its face
  const cube = new THREE.Group();
  const face = textTexture("1994", { w: 256, h: 256, color: "#3a4a6a", glow: true, bg: "#000", font: "italic 90px 'Times New Roman', serif" });
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: face, toneMapped: false }));
  cube.add(m);
  cube.position.set(L / 2, 1.3, L / 2);
  g.add(cube);
  b.darkCube = cube;
  b.anim.push((t) => {
    cube.rotation.y = t * 0.25;
    cube.position.y = 1.3 + Math.sin(t * 0.8) * 0.08;
  });
}

function buildRitual(g: THREE.Group, b: Built) {
  // dark stone floor with a gold circle around the altar
  floorOf(g, 0x16141a, 0.6, 0.2);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.8, 64), new THREE.MeshBasicMaterial({ color: 0xc9a24a, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(10, 0.03, 10);
  g.add(ring);
  // the altar and its fire
  const stone = mat(0x2a2620, 0, 0, 0.8);
  box(g, 2, 0.9, 2, 10, 0.45, 10, stone);
  box(g, 2.2, 0.12, 2.2, 10, 0.96, 10, mat(0xc9a24a, 0x3a2a08, 0.6, 0.3));
  const flames: THREE.Sprite[] = [];
  for (let k = 0; k < 26; k++) {
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: k % 3 ? 0xff9a3c : 0xffe08a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    f.userData = { p: Math.random() * 10, r: Math.random() * 0.5 };
    flames.push(f);
    g.add(f);
  }
  // ten obelisks in a ring: each carries a champion; #1 is gold and tallest
  const obelisks: { plate: THREE.Mesh; tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D; top: THREE.Mesh }[] = [];
  for (let k = 0; k < 10; k++) {
    const a = ((9 + 36 * k) * Math.PI) / 180;
    const x = 10 + 6.5 * Math.cos(a), z = 10 + 6.5 * Math.sin(a);
    const h = k === 0 ? 3.4 : 2.6 - k * 0.08;
    const o = box(g, 0.6, h, 0.6, x, h / 2, z, k === 0 ? mat(0xc9a24a, 0x3a2a08, 0.5, 0.3) : mat(0x1c1a20, 0, 0, 0.5));
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 4), k === 0 ? mat(0xffe08a, 0xc98a20, 1.2, 0.3) : mat(0x3a3640, 0x1a1830, 0.5));
    top.position.set(x, h + 0.25, z);
    top.rotation.y = Math.PI / 4;
    g.add(top);
    void o;
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    plate.position.set(x, 1.5, z);
    plate.lookAt(10, 1.5, 10); // faces the altar
    plate.translateZ(0.32);
    g.add(plate);
    obelisks.push({ plate, tex, ctx, top });
  }
  // the billboard: a giant deco marquee rising above the walls, under the open sky
  const bc = document.createElement("canvas");
  bc.width = 1024;
  bc.height = 1024;
  const bctx = bc.getContext("2d")!;
  const btex = new THREE.CanvasTexture(bc);
  btex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: btex, toneMapped: false, fog: false }));
  board.position.set(10, 7.6, 1.2);
  g.add(board);
  box(g, 0.3, 12, 0.3, 5.3, 6, 1.1, mat(0x8a6a2a, 0, 0, 0.4));
  box(g, 0.3, 12, 0.3, 14.7, 6, 1.1, mat(0x8a6a2a, 0, 0, 0.4));
  const bulbs: THREE.Sprite[] = [];
  for (let k = 0; k < 40; k++) {
    const side = k % 4, f = Math.floor(k / 4) / 10;
    const bx = side < 2 ? 5.7 + f * 8.6 : side === 2 ? 5.6 : 14.4, by = side === 0 ? 12.05 : side === 1 ? 3.15 : 3.2 + f * 8.8;
    const bulb = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: 0xffe08a, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    bulb.scale.setScalar(0.35);
    bulb.position.set(bx, by, 1.25);
    bulbs.push(bulb);
    g.add(bulb);
  }

  const draw = () => {
    const c = bctx, W = 1024;
    c.fillStyle = "#0b1418";
    c.fillRect(0, 0, W, W);
    c.strokeStyle = "#c9a24a";
    c.lineWidth = 10;
    c.strokeRect(20, 20, W - 40, W - 40);
    c.lineWidth = 3;
    c.strokeRect(44, 44, W - 88, W - 88);
    // sunburst crown
    c.save();
    c.translate(W / 2, 170);
    for (let k = 0; k < 18; k++) {
      c.rotate(Math.PI / 18);
      c.fillStyle = "rgba(201,162,74,0.25)";
      c.fillRect(0, -4, 130, 8);
    }
    c.restore();
    c.textAlign = "center";
    c.fillStyle = "#f2c864";
    c.font = "bold 74px 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";
    c.fillText("HALL OF CHAMPIONS", W / 2, 150);
    c.fillStyle = "#c9a24a";
    c.font = "italic 34px 'Times New Roman', serif";
    c.fillText("the longest lives in the after life™", W / 2, 205);
    for (let k = 0; k < 10; k++) {
      const row = champions[k];
      const y = 290 + k * 68;
      c.fillStyle = k % 2 ? "rgba(255,255,255,0.03)" : "rgba(201,162,74,0.06)";
      c.fillRect(80, y - 46, W - 160, 62);
      const mine = row && row.id === myId;
      c.textAlign = "left";
      c.font = `${k === 0 ? "bold " : ""}44px 'Arial Narrow', Arial, sans-serif`;
      c.fillStyle = k === 0 ? "#f2c864" : mine ? "#7affd8" : "#f2e6c8";
      c.fillText(`${k + 1}.`, 100, y);
      c.font = `italic ${k === 0 ? 48 : 42}px 'Times New Roman', serif`;
      c.fillText(row ? row.nick + (mine ? "  ← you" : "") : "· · ·", 180, y, 520);
      c.textAlign = "right";
      c.font = "bold 40px 'Arial Narrow', Arial, sans-serif";
      c.fillText(row ? `${row.best.toLocaleString()} m` : "", W - 100, y);
    }
    c.textAlign = "center";
    c.font = "italic 28px 'Times New Roman', serif";
    c.fillStyle = "#8f897c";
    c.fillText("walk further than anyone, in one life, and your name goes up here", W / 2, W - 70, W - 140);
    btex.needsUpdate = true;
    // the obelisks
    obelisks.forEach((o, k) => {
      const row = champions[k];
      const x = o.ctx;
      x.clearRect(0, 0, 256, 128);
      x.fillStyle = "rgba(0,0,0,0.7)";
      x.fillRect(0, 0, 256, 128);
      x.strokeStyle = "#c9a24a";
      x.lineWidth = 3;
      x.strokeRect(4, 4, 248, 120);
      x.textAlign = "center";
      x.fillStyle = k === 0 ? "#f2c864" : "#f2e6c8";
      x.font = "bold 26px 'Arial Narrow', Arial, sans-serif";
      x.fillText(`#${k + 1}`, 128, 36);
      x.font = "italic 30px 'Times New Roman', serif";
      x.fillText(row ? row.nick : "· · ·", 128, 74, 236);
      x.font = "22px 'Arial Narrow', Arial, sans-serif";
      x.fillStyle = "#c9a24a";
      x.fillText(row ? `${row.best.toLocaleString()} m` : "", 128, 106);
      o.tex.needsUpdate = true;
    });
  };
  draw();
  redraws.add(draw);
  b.cleanup = () => redraws.delete(draw);

  b.anim.push((t) => {
    for (const f of flames) {
      const u = f.userData, k = (t * 0.9 + u.p) % 1;
      f.position.set(10 + Math.sin(u.p * 7) * u.r * (1 - k), 1.05 + k * 1.6, 10 + Math.cos(u.p * 5) * u.r * (1 - k));
      f.scale.setScalar(0.5 * (1 - k) + 0.1);
      (f.material as THREE.SpriteMaterial).opacity = 1 - k;
    }
    bulbs.forEach((bl, k) => ((bl.material as THREE.SpriteMaterial).opacity = Math.sin(t * 6 - k * 0.6) > -0.2 ? 1 : 0.25));
    obelisks[0].top.rotation.y = t * 0.6;
  });
  b.spots.push({ x: 10, y: 2.4, z: 10, color: 0xffa040, intensity: 10 }, { x: 10, y: 3.2, z: 3, color: 0xffe08a, intensity: 6 });
}

function buildBazaar(g: THREE.Group, b: Built) {
  // warm stone ground, an open night sky, strings of lights, 12 stalls in a ring
  floorOf(g, 0x2a2420, 0.7, 0.1, 8);
  const wood = mat(0x4a2e1c, 0, 0, 0.6);
  const AWN = ["#c9584a", "#d8a83c", "#3c8c7a", "#6a5ac8", "#c85aa0", "#3c78c8"];
  const signs: { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D }[] = [];
  const goods: THREE.Sprite[][] = [];
  for (let k = 0; k < 12; k++) {
    const a = ((15 + 30 * k) * Math.PI) / 180;
    const x = 10 + 7 * Math.cos(a), z = 10 + 7 * Math.sin(a);
    const stall = new THREE.Group();
    stall.position.set(x, 0, z);
    stall.lookAt(10, 0, 10); // facing the middle
    box(stall, 1.6, 0.9, 0.7, 0, 0.45, 0, wood);
    box(stall, 0.08, 2.4, 0.08, -0.75, 1.2, -0.3, wood);
    box(stall, 0.08, 2.4, 0.08, 0.75, 1.2, -0.3, wood);
    // a striped awning
    const stripes = document.createElement("canvas");
    stripes.width = 64;
    stripes.height = 8;
    const sg = stripes.getContext("2d")!;
    for (let x2 = 0; x2 < 64; x2 += 16) {
      sg.fillStyle = AWN[k % AWN.length];
      sg.fillRect(x2, 0, 8, 8);
      sg.fillStyle = "#f2ead8";
      sg.fillRect(x2 + 8, 0, 8, 8);
    }
    const awnTex = new THREE.CanvasTexture(stripes);
    awnTex.colorSpace = THREE.SRGBColorSpace;
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.1), new THREE.MeshStandardMaterial({ map: awnTex, side: THREE.DoubleSide, roughness: 0.8 }));
    awn.position.set(0, 2.35, 0.1);
    awn.rotation.x = -Math.PI / 2 + 0.35;
    stall.add(awn);
    // the sign: seller + what's for sale (redrawn when listings change)
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 200;
    const ctx = c.getContext("2d")!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.94), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }));
    sign.position.set(0, 1.55, -0.28);
    stall.add(sign);
    signs.push({ tex, ctx });
    // up to 3 goods floating on the counter
    const row = [0, 1, 2].map((n) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      sp.scale.setScalar(0.32);
      sp.position.set(-0.5 + n * 0.5, 1.08, 0.05);
      sp.visible = false;
      stall.add(sp);
      return sp;
    });
    goods.push(row);
    g.add(stall);
  }
  // the sign pillar in the middle
  box(g, 1.2, 3.2, 1.2, 10, 1.6, 10, mat(0x111114, 0, 0, 0.4));
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const m = sign(new THREE.Group(), "OPEN MARKET", 1.15, 0.45, 0, 0, 0, 0, { color: "#ffd27a", glow: true, bg: "#0b0b0b", font: "bold 54px 'Arial Narrow', Arial, sans-serif" });
    m.position.set(10 + Math.sin(ry) * 0.61, 2.7, 10 + Math.cos(ry) * 0.61);
    m.rotation.y = ry;
    g.add(m);
  }
  // strings of warm bulbs from the pillar to the stalls
  const bulbs: THREE.Sprite[] = [];
  for (let k = 0; k < 12; k++) {
    const a = ((15 + 30 * k) * Math.PI) / 180;
    for (let n = 1; n < 9; n++) {
      const f = n / 9;
      const bl = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: n % 3 ? 0xffd27a : 0xff9aa8, blending: THREE.AdditiveBlending, depthWrite: false }));
      bl.position.set(10 + Math.cos(a) * 7 * f, 3.3 - Math.sin(f * Math.PI) * 0.7, 10 + Math.sin(a) * 7 * f);
      bl.scale.setScalar(0.22);
      bulbs.push(bl);
      g.add(bl);
    }
  }
  const glyphTex = new Map<string, THREE.CanvasTexture>();
  const glyph = (ch: string) => {
    let t = glyphTex.get(ch);
    if (!t) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const x = c.getContext("2d")!;
      x.font = "44px serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillStyle = "#fff6e2";
      x.shadowColor = "#ffd27a";
      x.shadowBlur = 12;
      x.fillText(ch, 32, 34);
      t = new THREE.CanvasTexture(c);
      glyphTex.set(ch, t);
    }
    return t;
  };
  const draw = () => {
    signs.forEach((s2, k) => {
      const row = stalls[k];
      const x = s2.ctx;
      x.clearRect(0, 0, 320, 200);
      x.fillStyle = "rgba(10,8,6,0.85)";
      x.fillRect(0, 0, 320, 200);
      x.strokeStyle = "rgba(255,230,184,0.4)";
      x.lineWidth = 3;
      x.strokeRect(3, 3, 314, 194);
      x.textAlign = "center";
      x.fillStyle = row ? "#fff6e2" : "#6f6a5c";
      x.font = "italic 30px 'Times New Roman', serif";
      x.fillText(row ? `@${row.seller}` : "free stall", 160, 44, 300);
      x.font = "italic 22px 'Times New Roman', serif";
      (row?.items ?? []).slice(0, 3).forEach((it, n) => {
        x.fillStyle = "#cfc6b8";
        x.fillText(`${it.name} · ${it.price} ◈`, 160, 92 + n * 34, 300);
      });
      if (!row) {
        x.fillStyle = "#8f897c";
        x.fillText("sell here: open the market", 160, 110);
      }
      s2.tex.needsUpdate = true;
      goods[k].forEach((sp, n) => {
        const it = row?.items[n];
        sp.visible = !!it;
        if (it) {
          (sp.material as THREE.SpriteMaterial).map = glyph(it.glyph);
          (sp.material as THREE.SpriteMaterial).needsUpdate = true;
        }
      });
    });
  };
  draw();
  stallRedraws.add(draw);
  b.cleanup = () => stallRedraws.delete(draw);
  b.anim.push((t) => {
    bulbs.forEach((bl, k) => ((bl.material as THREE.SpriteMaterial).opacity = 0.65 + Math.sin(t * 2 + k * 0.7) * 0.35));
    goods.forEach((row) => row.forEach((sp, n) => (sp.position.y = 1.08 + Math.sin(t * 2 + n) * 0.04)));
  });
  b.spots.push({ x: 10, y: 3.2, z: 10, color: 0xffd8a0, intensity: 16 }, { x: 4, y: 3, z: 16, color: 0xffb0c0, intensity: 6 }, { x: 16, y: 3, z: 4, color: 0xffe0a0, intensity: 6 });
}

const BUILD: Record<PlaceKind, (g: THREE.Group, b: Built, r: () => number) => void> = {
  open: buildOpen,
  theater: buildTheater,
  mall: buildMall,
  museum: buildMuseum,
  market: buildMarket,
  dark: (g, b) => buildDark(g, b),
  ritual: (g, b) => buildRitual(g, b),
  bazaar: (g, b) => buildBazaar(g, b),
};

// ------------------------------------------------------------------ the layer
export type PlaceInfo = { kind: PlaceKind; I: number; J: number } | null;

export function createPlaces() {
  const group = new THREE.Group();
  const built = new Map<string, Built>();
  const lights = Array.from({ length: 3 }, () => {
    const l = new THREE.PointLight(0xffffff, 0, 18, 1.4);
    group.add(l);
    return l;
  });
  let lastCell = "";
  let inside: PlaceInfo = null;

  function refresh(px: number, pz: number) {
    const I0 = Math.floor(px / CELL / REGION), J0 = Math.floor(pz / CELL / REGION);
    const want = new Set<string>();
    for (let I = I0 - 1; I <= I0 + 1; I++)
      for (let J = J0 - 1; J <= J0 + 1; J++) {
        const kind = placeAt(I, J);
        if (!kind) continue;
        const key = `${I}:${J}`;
        want.add(key);
        if (built.has(key)) continue;
        const g = new THREE.Group();
        g.position.set((I * REGION + 1) * CELL, 0, (J * REGION + 1) * CELL);
        const b: Built = { group: g, kind, I, J, spots: [], anim: [] };
        BUILD[kind](g, b, rand(I * 92821 + J * 68917 + 7));
        group.add(g);
        built.set(key, b);
      }
    for (const [key, b] of built)
      if (!want.has(key)) {
        group.remove(b.group);
        b.cleanup?.();
        b.group.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
        });
        built.delete(key);
      }
  }

  return {
    group,
    update(px: number, pz: number, t: number, dt: number) {
      const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
      const cell = `${ci}:${cj}`;
      if (cell !== lastCell) {
        lastCell = cell;
        refresh(px, pz);
      }
      const p = placeOf(ci, cj);
      const now: PlaceInfo = p ? { kind: p.kind, I: p.I, J: p.J } : null;
      const entered = now && (!inside || inside.I !== now.I || inside.J !== now.J) ? now : null;
      inside = now;

      // animate what's near; give the 3 real lights to the nearest place
      let best: Built | null = null, bd = Infinity;
      for (const b of built.values()) {
        const cx = b.group.position.x + L / 2, cz = b.group.position.z + L / 2;
        const d = Math.hypot(cx - px, cz - pz);
        if (d < 45) b.anim.forEach((f) => f(t, dt));
        if (b.spots.length && d < bd) (bd = d), (best = b);
      }
      lights.forEach((l, k) => {
        const s = best && bd < 40 ? best.spots[k] : undefined;
        if (!s || !best) return (l.intensity = 0);
        l.position.set(best.group.position.x + s.x, s.y, best.group.position.z + s.z);
        l.color.setHex(s.color);
        l.intensity = s.intensity;
      });

      // the dark room's cube: within reach?
      let darkCubeNear = false;
      if (now?.kind === "dark") {
        const b = built.get(`${now.I}:${now.J}`);
        if (b?.darkCube) {
          const wp = b.darkCube.getWorldPosition(new THREE.Vector3());
          darkCubeNear = Math.hypot(wp.x - px, wp.z - pz) < 1.6;
        }
      }
      // the ritual: standing in the gold circle around the altar
      let atAltar = false;
      if (now?.kind === "ritual") {
        const cx = (now.I * REGION + 1) * CELL + 10, cz = (now.J * REGION + 1) * CELL + 10;
        const d = Math.hypot(cx - px, cz - pz);
        atAltar = d < 2.9;
      }
      return { inside: now, entered, darkCubeNear, atAltar };
    },
  };
}

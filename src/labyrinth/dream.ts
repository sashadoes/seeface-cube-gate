// The daily dream drop: each day the labyrinth dreams up a new set of strange
// glowing objects and one dream event (scripts/dream/drop.mjs writes
// public/dream/today.json once a day). Everything is built from the fixed
// menu in dream-menu.json, so the drop is only data: shapes, colours, motions
// and gifts. Nothing is ever written on screen; the names only reach
// snapshot cards.
//
// Shared without a server: object positions and event times come from the
// date + a hash, so everyone sees the same dream in the same places.
import * as THREE from "three";
import { CELL, free, inShip } from "./maze";
import type { Sound } from "./sound";
import { track } from "../analytics";
import menu from "./dream-menu.json";

type Shape = (typeof menu.shapes)[number];
export type DreamGift = "blood1" | "blood3" | "light" | "float" | "colours" | "nothing";
type DreamObject = { name: string; shape: Shape; colour: string; glow: string; size: number; motion: string; tone: string; gift: DreamGift };
export type DreamDrop = {
  date: string;
  title: string;
  objects: DreamObject[];
  event: { name: string; sky: string; fog: string; particles: string; particleColour: string; gravity: "normal" | "low" };
};

const CHUNK = 5 * CELL; // 20 m squares; ~30% hold one dream object
const CHANCE = 0.3;
const RADIUS = 40; // metres around the player that get built
const EVENT_EVERY = 90 * 60 * 1000; // a dream event in every 90-minute window
const EVENT_LENGTH = 45 * 1000;

function hash(...n: number[]) {
  let h = 0x811c9dc5;
  for (const v of n) {
    h = Math.imul(h ^ (v | 0), 16777619);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}

// ------------------------------------------------------------------ shapes (one geometry per shape, shared)
const GEO: Partial<Record<Shape, THREE.BufferGeometry>> = {};
function geometry(shape: Shape): THREE.BufferGeometry {
  if (GEO[shape]) return GEO[shape]!;
  let g: THREE.BufferGeometry;
  switch (shape) {
    case "knot": g = new THREE.TorusKnotGeometry(0.32, 0.1, 96, 12); break;
    case "crystal": g = new THREE.OctahedronGeometry(0.45).scale(1, 1.7, 1); break;
    case "ring": g = new THREE.TorusGeometry(0.45, 0.05, 12, 48); break;
    case "monolith": g = new THREE.BoxGeometry(0.32, 1.1, 0.1); break;
    case "tesseract": g = new THREE.BoxGeometry(0.7, 0.7, 0.7); break;
    case "spiral": {
      const pts = Array.from({ length: 60 }, (_, i) => new THREE.Vector3(Math.cos(i * 0.42) * 0.3, i / 60 - 0.5, Math.sin(i * 0.42) * 0.3));
      g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.045, 8);
      break;
    }
    case "lantern": g = new THREE.CylinderGeometry(0.22, 0.28, 0.6, 6, 1, true); break;
    case "jelly": g = new THREE.SphereGeometry(0.45, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); break;
    case "flower": g = new THREE.SphereGeometry(0.22, 12, 8).scale(1.6, 0.35, 0.8).translate(0.3, 0, 0); break;
    case "halo": g = new THREE.TorusGeometry(0.42, 0.025, 8, 48).rotateX(Math.PI / 2); break;
    case "cluster": g = new THREE.IcosahedronGeometry(0.16); break;
    default: g = new THREE.SphereGeometry(0.42, 32, 16);
  }
  GEO[shape] = g;
  return g;
}
const coreGeo = new THREE.SphereGeometry(0.12, 12, 8);

function build(o: DreamObject, mat: THREE.MeshStandardMaterial): THREE.Object3D {
  const g = new THREE.Group();
  const geo = geometry(o.shape);
  if (o.shape === "cluster") {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.cos(i) * 0.3, Math.sin(i * 2.1) * 0.25, Math.sin(i) * 0.3);
      g.add(m);
    }
  } else if (o.shape === "flower") {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.y = (i / 6) * Math.PI * 2;
      g.add(m);
    }
    g.add(new THREE.Mesh(coreGeo, mat));
  } else if (o.shape === "tesseract") {
    const lines = new THREE.LineBasicMaterial({ color: mat.emissive, transparent: true, opacity: 0.9 });
    const edges = new THREE.EdgesGeometry(geo);
    const outer = new THREE.LineSegments(edges, lines);
    const inner = new THREE.LineSegments(edges, lines);
    inner.scale.setScalar(0.5);
    g.add(outer, inner);
  } else {
    g.add(new THREE.Mesh(geo, mat));
    if (o.shape === "lantern" || o.shape === "halo") g.add(new THREE.Mesh(coreGeo, mat));
  }
  return g;
}

function glint() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.5)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ------------------------------------------------------------------ the dream
export function createDream(sound: Sound, overlay: HTMLElement) {
  const group = new THREE.Group();
  let drop: DreamDrop | null = null;
  let mats: THREE.MeshStandardMaterial[] = [];
  let daySeed = 0;
  const built = new Map<string, { obj: THREE.Object3D; o: DreamObject; x: number; y: number; z: number; ph: number }>();
  let lastScan = -1;

  // what you already touched today (per player, this browser)
  const takenKey = () => `seeface-dream-${drop?.date}`;
  let taken = new Set<string>();
  const readTaken = () => {
    try {
      taken = new Set(JSON.parse(localStorage.getItem(takenKey()) || "[]"));
    } catch {
      taken = new Set();
    }
  };
  const saveTaken = () => {
    try {
      localStorage.setItem(takenKey(), JSON.stringify([...taken]));
    } catch {}
  };

  function use(d: DreamDrop) {
    drop = d;
    daySeed = [...d.date].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 0x811c9dc5);
    mats.forEach((m) => m.dispose());
    mats = d.objects.map(
      (o) => new THREE.MeshStandardMaterial({ color: o.colour, emissive: o.glow, emissiveIntensity: 0.8, roughness: 0.25, metalness: 0.3, transparent: o.shape === "jelly", opacity: o.shape === "jelly" ? 0.75 : 1, side: THREE.DoubleSide }),
    );
    clear();
    readTaken();
    track("dream-loaded");
  }

  function clear() {
    for (const b of built.values()) group.remove(b.obj);
    built.clear();
    lastScan = -1;
  }

  // ?dream=<url> loads another drop (testing); otherwise today's
  const src = new URLSearchParams(location.search).get("dream") || `${import.meta.env.BASE_URL}dream/today.json`;
  fetch(src, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: DreamDrop | null) => d && Array.isArray(d.objects) && d.objects.length && d.event && use(d))
    .catch(() => {}); // no dream today: the labyrinth simply doesn't dream

  /** where (if anywhere) chunk (a, b) holds an object today */
  function spot(a: number, b: number) {
    if (!drop || hash(a, b, daySeed) > CHANCE) return null;
    const idx = Math.floor(hash(a, b, daySeed, 7) * drop.objects.length);
    for (let k = 0; k < 6; k++) {
      const ci = Math.floor(hash(a, b, daySeed, 11 + k) * 5), cj = Math.floor(hash(a, b, daySeed, 23 + k) * 5);
      const x = a * CHUNK + (ci + 0.5) * CELL, z = b * CHUNK + (cj + 0.5) * CELL;
      if (!inShip(x, z) && free(x, z, 0.8)) return { idx, x, z };
    }
    return null;
  }

  function scan(px: number, pz: number) {
    const a0 = Math.floor((px - RADIUS) / CHUNK), a1 = Math.floor((px + RADIUS) / CHUNK);
    const b0 = Math.floor((pz - RADIUS) / CHUNK), b1 = Math.floor((pz + RADIUS) / CHUNK);
    const keep = new Set<string>();
    for (let a = a0; a <= a1; a++)
      for (let b = b0; b <= b1; b++) {
        const key = `${a},${b}`;
        keep.add(key);
        if (built.has(key)) continue;
        const s = spot(a, b);
        if (!s) continue;
        const o = drop!.objects[s.idx];
        const obj = build(o, mats[s.idx]);
        obj.scale.setScalar(o.size);
        const y = 1.1 + o.size * 0.4;
        obj.position.set(s.x, y, s.z);
        group.add(obj);
        built.set(key, { obj, o, x: s.x, y, z: s.z, ph: hash(a, b) * 6.28 });
        if (taken.has(key)) obj.visible = false;
      }
    for (const [key, b] of built)
      if (!keep.has(key)) {
        group.remove(b.obj);
        built.delete(key);
      }
  }

  // a soft bell, pitched by the object's tone
  function bell(tone: string) {
    const ctx = sound.ctx;
    const f = tone === "low" ? 196 : tone === "high" ? 784 : 392;
    for (const [mul, vol] of [[1, 0.22], [2.01, 0.08], [3.98, 0.04]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f * mul;
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.4);
      o.connect(g).connect(sound.effectsOut);
      o.start();
      o.stop(ctx.currentTime + 2.5);
    }
  }

  // ---------------------------------------------------------------- the dream event (particles + tint)
  const N = 420, BOX = 14, TOP = 3.4;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(N * 3);
  const pVel = new Float32Array(N);
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.09, map: glint(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  points.visible = false;
  group.add(points);
  let eventOn: DreamDrop["event"] | null = null;

  function eventNow(now = Date.now()) {
    if (!drop) return null;
    if (new URLSearchParams(location.search).has("dreamevent")) return drop.event; // testing
    const slot = Math.floor(now / EVENT_EVERY);
    const start = slot * EVENT_EVERY + Math.floor(hash(slot, 1994) * (EVENT_EVERY - EVENT_LENGTH));
    return now >= start && now < start + EVENT_LENGTH ? drop.event : null;
  }

  function startEvent(e: DreamDrop["event"], px: number, pz: number) {
    pMat.color.set(e.particleColour);
    pMat.size = e.particles === "moths" || e.particles === "petals" ? 0.14 : e.particles === "stars" || e.particles === "glitter" ? 0.07 : 0.09;
    for (let i = 0; i < N; i++) {
      pPos[i * 3] = px + (Math.random() - 0.5) * BOX * 2;
      pPos[i * 3 + 1] = Math.random() * TOP;
      pPos[i * 3 + 2] = pz + (Math.random() - 0.5) * BOX * 2;
      pVel[i] = 0.3 + Math.random() * 0.7;
    }
    points.visible = true;
    overlay.style.background = `radial-gradient(ellipse at 50% 0%, ${e.sky}66, transparent 60%), radial-gradient(ellipse at 50% 100%, ${e.fog}55, transparent 70%)`;
    overlay.style.mixBlendMode = "screen";
    overlay.style.opacity = "1";
    sound.chime();
    track("dream-event");
  }
  function endEvent() {
    points.visible = false;
    overlay.style.opacity = "0";
  }

  function moveParticles(kind: string, px: number, pz: number, t: number, dt: number) {
    for (let i = 0; i < N; i++) {
      const v = pVel[i], k = i * 3;
      switch (kind) {
        case "embers":
        case "bubbles":
          pPos[k + 1] += v * dt * 0.8;
          pPos[k] += Math.sin(t * 1.3 + i) * dt * 0.2;
          break;
        case "moths":
          pPos[k] += Math.sin(t * 7 + i) * dt * 1.2;
          pPos[k + 1] += Math.cos(t * 5 + i * 1.7) * dt * 0.8;
          pPos[k + 2] += Math.cos(t * 6 + i) * dt * 1.2;
          break;
        case "stars":
        case "glitter":
          pPos[k + 1] += Math.sin(t + i) * dt * 0.05;
          break;
        default: // petals, ash, snow fall and sway
          pPos[k + 1] -= v * dt * (kind === "ash" ? 0.35 : 0.6);
          pPos[k] += Math.sin(t * 0.9 + i) * dt * 0.35;
      }
      if (pPos[k + 1] > TOP) pPos[k + 1] = 0;
      if (pPos[k + 1] < 0) pPos[k + 1] = TOP;
      // keep the cloud around the player
      if (pPos[k] - px > BOX) pPos[k] -= BOX * 2;
      if (px - pPos[k] > BOX) pPos[k] += BOX * 2;
      if (pPos[k + 2] - pz > BOX) pPos[k + 2] -= BOX * 2;
      if (pz - pPos[k + 2] > BOX) pPos[k + 2] += BOX * 2;
    }
    pGeo.attributes.position.needsUpdate = true;
    if (kind === "stars" || kind === "glitter") pMat.opacity = 0.6 + Math.sin(t * 6) * 0.4;
    else pMat.opacity = 1;
  }

  return {
    group,
    /** today's dream title, for snapshot cards */
    title: () => drop?.title ?? null,
    /** the dream event running now (same for everyone), or null */
    event: () => eventOn,
    /** busy = a regular world event is on (the dream waits for it) */
    update(px: number, pz: number, t: number, dt: number, busy: boolean) {
      if (!drop) return;
      if (t - lastScan > 0.5) {
        lastScan = t;
        scan(px, pz);
      }
      for (const [key, b] of built) {
        const { obj, o, ph } = b;
        const s = t + ph;
        obj.position.y = b.y;
        switch (o.motion) {
          case "spin": obj.rotation.y += dt * 1.2; break;
          case "bob": obj.position.y = b.y + Math.sin(s * 1.6) * 0.18; obj.rotation.y += dt * 0.3; break;
          case "pulse": obj.scale.setScalar(o.size * (1 + Math.sin(s * 3) * 0.12)); break;
          case "orbit": obj.position.x = b.x + Math.cos(s * 0.8) * 0.6; obj.position.z = b.z + Math.sin(s * 0.8) * 0.6; obj.rotation.y = -s * 0.8; break;
          case "drift": obj.position.x = b.x + Math.sin(s * 0.3) * 0.4; obj.position.y = b.y + Math.sin(s * 0.5) * 0.25; obj.rotation.z = Math.sin(s * 0.4) * 0.3; break;
          case "breathe": obj.scale.setScalar(o.size * (1 + Math.sin(s * 0.9) * 0.2)); obj.rotation.x += dt * 0.2; break;
          case "flicker": obj.visible = !taken.has(key) && Math.sin(s * 23) * Math.sin(s * 7) > -0.6; obj.rotation.y += dt * 0.5; break;
        }
      }
      const e = busy ? null : eventNow();
      if (e && !eventOn) startEvent(e, px, pz);
      if (!e && eventOn) endEvent();
      eventOn = e;
      if (eventOn) moveParticles(eventOn.particles, px, pz, t, dt);
    },
    /** touch the dream object you're standing at: its gift, once a day each */
    touch(px: number, pz: number): DreamGift | null {
      for (const [key, b] of built) {
        if (taken.has(key) || Math.hypot(b.x - px, b.z - pz) > 1.3) continue;
        taken.add(key);
        saveTaken();
        b.obj.visible = false;
        bell(b.o.tone);
        track(`dream-touch-${b.o.gift}`);
        return b.o.gift;
      }
      return null;
    },
  };
}

// Blood dollars (◈) and wishes. ◈ is earned only by playing (never bought).
// With 10 ◈ a player can wish an object into the labyrinth where they stand,
// or change the nearest room's art. Wishes are shared through the presence
// relay as retained messages, so everyone sees them and they stay.
import * as THREE from "three";
import { CELL, WALL_H } from "./maze";
import type { Presence } from "./net";
import { noteBlood } from "../progress";
import { noteBloodChange } from "../insight";
import { release } from "./gpu";

export const WISH_COST = 10;
const BLOOD_KEY = "seeface-blood";
const MAX_RENDER_DIST = CELL * 12;

export type WishKind = "monolith" | "phototree" | "bigcube" | "lantern" | "statue";
export const WISH_KINDS: { kind: WishKind | "room"; glyph: string; label: string }[] = [
  { kind: "lantern", glyph: "☀", label: "lantern post" },
  { kind: "monolith", glyph: "▮", label: "monolith" },
  { kind: "phototree", glyph: "❋", label: "photo tree" },
  { kind: "bigcube", glyph: "◼", label: "giant cube" },
  { kind: "statue", glyph: "☗", label: "pale statue" },
  { kind: "room", glyph: "↻", label: "change this room" },
];

type Wish = { id: string; kind: WishKind; x: number; z: number; seed: string; t: number; obj?: THREE.Object3D };

// ------------------------------------------------------------------ blood dollars

export function readBlood() {
  try {
    return Number(localStorage.getItem(BLOOD_KEY) || 0);
  } catch {
    return 0;
  }
}

/** change ◈ by n; `why` says what for (the play journal on /the-eye) */
export function addBlood(n: number, why = "other") {
  const was = readBlood();
  const v = Math.max(0, was + n);
  noteBloodChange(v - was, why);
  try {
    localStorage.setItem(BLOOD_KEY, String(v));
  } catch {
    // ignore
  }
  noteBlood();
  return v;
}

// ------------------------------------------------------------------ objects

function photoTex(seed: string) {
  const t = new THREE.TextureLoader().load(`https://picsum.photos/seed/${encodeURIComponent(seed)}/512`);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowSprite(color: number, size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.35, "rgba(255,255,255,0.45)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

function build(w: Wish): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(w.x, 0, w.z);
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.25, metalness: 0.6 });
  const photo = new THREE.MeshBasicMaterial({ map: photoTex(w.seed), side: THREE.DoubleSide, toneMapped: false });
  switch (w.kind) {
    case "lantern": {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 2.4, 10), dark);
      post.position.y = 1.2;
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.32), new THREE.MeshBasicMaterial({ color: 0xffe6b8 }));
      lamp.position.y = 2.5;
      const glow = glowSprite(0xffe2a8, 2.6);
      glow.position.y = 2.5;
      g.add(post, lamp, glow);
      break;
    }
    case "monolith": {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, WALL_H - 0.3, 0.3), [dark, dark, dark, dark, photo, photo]);
      m.position.y = (WALL_H - 0.3) / 2;
      m.rotation.y = (w.t % 628) / 100;
      g.add(m);
      break;
    }
    case "phototree": {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 2.8, 8), dark);
      trunk.position.y = 1.4;
      g.add(trunk);
      for (let i = 0; i < 10; i++) {
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.4), photo);
        const a = i * 2.4;
        leaf.position.set(Math.cos(a) * 0.6, 1.4 + (i % 5) * 0.28, Math.sin(a) * 0.6);
        leaf.rotation.set(0.2 * Math.sin(i), a, 0.3 * Math.cos(i));
        g.add(leaf);
      }
      g.userData.spin = 0.15;
      break;
    }
    case "bigcube": {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), photo);
      c.position.y = 1.5;
      c.rotation.set(0.6, 0.6, 0);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(c.geometry), new THREE.LineBasicMaterial({ color: 0x000000 }));
      c.add(edges);
      g.add(c);
      g.userData.spinChild = c;
      break;
    }
    case "statue": {
      const mat = new THREE.MeshStandardMaterial({ color: 0xd9d7d0, roughness: 0.9 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.7, 14), mat);
      body.position.y = 0.85;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat);
      head.position.y = 1.95;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.8), dark);
      plinth.position.y = 0.06;
      g.add(body, head, plinth);
      break;
    }
  }
  return g;
}

// ------------------------------------------------------------------ shared wishes

export type Wishes = {
  group: THREE.Group;
  make: (kind: WishKind, x: number, z: number) => void;
  changeRoom: (I: number, J: number) => void;
  roomSeed: (I: number, J: number) => string | null;
  /** extra light sources (wished lanterns) that recharge everyone */
  lanternNear: (x: number, z: number) => boolean;
  update: (px: number, pz: number, dt: number) => void;
  onRoomChange: (fn: (I: number, J: number) => void) => void;
  list: () => { kind: string; x: number; z: number }[];
};

const KINDS = new Set(["monolith", "phototree", "bigcube", "lantern", "statue"]);
const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e7;
const okSeed = (s: unknown) => typeof s === "string" && /^[\w-]{1,32}$/.test(s);

export function createWishes(presence: Presence): Wishes {
  const group = new THREE.Group();
  const wishes = new Map<string, Wish>();
  const roomSeeds = new Map<string, string>();
  const roomFns: ((I: number, J: number) => void)[] = [];
  const lanternLights = Array.from({ length: 3 }, () => {
    const l = new THREE.PointLight(0xffdca0, 0, 10, 1.4);
    group.add(l);
    return l;
  });

  presence.onWorld((path, d) => {
    const [kind, id] = path.split("/");
    if (kind === "wish" && id && /^[\w-]{1,40}$/.test(id) && KINDS.has(d.kind as string) && finite(d.x) && finite(d.z) && okSeed(d.seed) && finite(d.t)) {
      if (wishes.has(id)) return;
      wishes.set(id, { id, kind: d.kind as WishKind, x: d.x as number, z: d.z as number, seed: d.seed as string, t: d.t as number });
    }
    if (kind === "room" && id && /^-?\d+_-?\d+$/.test(id) && okSeed(d.seed)) {
      roomSeeds.set(id, d.seed as string);
      const [I, J] = id.split("_").map(Number);
      roomFns.forEach((f) => f(I, J));
    }
  });

  function make(kind: WishKind, x: number, z: number) {
    const id = `${presence.me}-${Date.now().toString(36)}`;
    const w = { kind, x: +x.toFixed(2), z: +z.toFixed(2), seed: `wish-${Math.random().toString(36).slice(2, 10)}`, t: Date.now() };
    wishes.set(id, { id, ...w });
    presence.publishWorld(`wish/${id}`, w);
  }

  function changeRoom(I: number, J: number) {
    const seed = `room-${Math.random().toString(36).slice(2, 10)}`;
    roomSeeds.set(`${I}_${J}`, seed);
    presence.publishWorld(`room/${I}_${J}`, { seed, t: Date.now() });
    roomFns.forEach((f) => f(I, J));
  }

  function lanternNear(x: number, z: number) {
    for (const w of wishes.values()) if (w.kind === "lantern" && Math.hypot(w.x - x, w.z - z) < 2.6) return true;
    return false;
  }

  function update(px: number, pz: number, dt: number) {
    const lanterns: Wish[] = [];
    for (const w of wishes.values()) {
      const d = Math.hypot(w.x - px, w.z - pz);
      if (d < MAX_RENDER_DIST) {
        if (!w.obj) {
          w.obj = build(w);
          group.add(w.obj);
        }
        if (w.obj.userData.spin) w.obj.rotation.y += w.obj.userData.spin * dt;
        const sc = w.obj.userData.spinChild as THREE.Object3D | undefined;
        if (sc) sc.rotation.y += 0.3 * dt;
        if (w.kind === "lantern") lanterns.push(w);
      } else if (w.obj) {
        release(w.obj);
        w.obj = undefined;
      }
    }
    lanterns.sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
    lanternLights.forEach((l, k) => {
      const w = lanterns[k];
      if (!w) return (l.intensity = 0);
      l.position.set(w.x, 2.5, w.z);
      l.intensity = 6;
    });
  }

  return {
    group,
    make,
    changeRoom,
    roomSeed: (I, J) => roomSeeds.get(`${I}_${J}`) ?? null,
    lanternNear,
    update,
    onRoomChange: (fn) => roomFns.push(fn),
    list: () => [...wishes.values()].map((w) => ({ kind: w.kind, x: w.x, z: w.z })),
  };
}

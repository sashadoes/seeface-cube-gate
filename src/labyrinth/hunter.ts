// The Hollow: a tall shadow with two pale eyes that lives in the dark
// corridors. It wanders; when your light runs low it hunts you along the real
// corridors (shortest path through the maze). It hesitates under working
// lights and never enters a cube room: rooms are safe.
import * as THREE from "three";
import { CELL, roomOf, wallEast, wallSouth } from "./maze";

export type Hunter = {
  object: THREE.Object3D;
  update: (dt: number, t: number, ctx: { px: number; pz: number; light: number; depth: number; isLit: (x: number, z: number) => boolean }) => { dist: number; hunting: boolean };
  reset: (px: number, pz: number) => void;
};

const SEARCH = 14; // cells

function silhouette() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 384;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 384);
  grad.addColorStop(0, "rgba(0,0,0,0.95)");
  grad.addColorStop(0.85, "rgba(0,0,0,0.9)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.filter = "blur(3px)";
  // head, long neck, narrow shoulders, long body tapering into smoke
  g.beginPath();
  g.ellipse(64, 44, 22, 30, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(52, 70);
  g.quadraticCurveTo(18, 100, 24, 200);
  g.quadraticCurveTo(30, 300, 50, 384);
  g.lineTo(78, 384);
  g.quadraticCurveTo(98, 300, 104, 200);
  g.quadraticCurveTo(110, 100, 76, 70);
  g.closePath();
  g.fill();
  g.filter = "none";
  // eyes
  for (const x of [54, 74]) {
    const eg = g.createRadialGradient(x, 42, 0, x, 42, 7);
    eg.addColorStop(0, "rgba(255,255,240,1)");
    eg.addColorStop(1, "rgba(255,255,240,0)");
    g.fillStyle = eg;
    g.fillRect(x - 8, 34, 16, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const key = (i: number, j: number) => `${i},${j}`;

function neighbours(i: number, j: number): [number, number][] {
  const out: [number, number][] = [];
  if (!wallEast(i, j)) out.push([i + 1, j]);
  if (!wallEast(i - 1, j)) out.push([i - 1, j]);
  if (!wallSouth(i, j)) out.push([i, j + 1]);
  if (!wallSouth(i, j - 1)) out.push([i, j - 1]);
  return out;
}

/** Next cell on the shortest corridor path from (si,sj) to (ti,tj), avoiding rooms. */
function nextStep(si: number, sj: number, ti: number, tj: number, blocked: (i: number, j: number) => boolean) {
  const prev = new Map<string, string | null>();
  prev.set(key(si, sj), null);
  const queue: [number, number][] = [[si, sj]];
  while (queue.length) {
    const [i, j] = queue.shift()!;
    if (i === ti && j === tj) {
      // walk back to the first step
      let cur = key(i, j);
      let p = prev.get(cur);
      while (p && p !== key(si, sj)) {
        cur = p;
        p = prev.get(cur);
      }
      const [a, b] = cur.split(",").map(Number);
      return { i: a, j: b, found: true };
    }
    for (const [ni, nj] of neighbours(i, j)) {
      if (Math.abs(ni - si) > SEARCH || Math.abs(nj - sj) > SEARCH) continue;
      const k = key(ni, nj);
      if (prev.has(k) || (blocked(ni, nj) && !(ni === ti && nj === tj))) continue;
      prev.set(k, key(i, j));
      queue.push([ni, nj]);
    }
  }
  return { i: si, j: sj, found: false };
}

export function createHunter(): Hunter {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: silhouette(), transparent: true, depthWrite: false }));
  sprite.scale.set(1.1, 3.0, 1);
  sprite.center.set(0.5, 0);
  const object = new THREE.Group();
  object.add(sprite);
  // a faint cold glow so you sometimes glimpse it before it reaches you
  const glow = new THREE.PointLight(0x9fb3ff, 0.6, 3.5, 2);
  glow.position.y = 2.6;
  object.add(glow);

  let target = { x: 0, z: 0 };
  let repath = 0;
  let wanderGoal: [number, number] | null = null;

  function reset(px: number, pz: number) {
    // appear somewhere in the dark, a fair distance away
    const a = Math.random() * Math.PI * 2;
    object.position.set(px + Math.cos(a) * CELL * 7, 0, pz + Math.sin(a) * CELL * 7);
    target = { x: object.position.x, z: object.position.z };
    wanderGoal = null;
  }

  function update(dt: number, t: number, ctx: { px: number; pz: number; light: number; depth: number; isLit: (x: number, z: number) => boolean }) {
    const { px, pz, light, depth, isLit } = ctx;
    const hx = object.position.x, hz = object.position.z;
    const dist = Math.hypot(px - hx, pz - hz);
    const hi = Math.floor(hx / CELL), hj = Math.floor(hz / CELL);
    const pi = Math.floor(px / CELL), pj = Math.floor(pz / CELL);
    const playerSafe = roomOf(pi, pj) !== null;

    // hunts when your light is low or you are close in the dark
    const hunting = !playerSafe && (light < 55 || (dist < CELL * 2.5 && !isLit(px, pz)));
    const blocked = (i: number, j: number) => roomOf(i, j) !== null || (light > 20 && isLit((i + 0.5) * CELL, (j + 0.5) * CELL));

    repath -= dt;
    if (repath <= 0) {
      repath = 0.35;
      if (hunting) {
        const step = nextStep(hi, hj, pi, pj, blocked);
        target = { x: (step.i + 0.5) * CELL, z: (step.j + 0.5) * CELL };
        // same cell: go straight for you
        if (step.i === pi && step.j === pj) target = { x: px, z: pz };
      } else {
        if (!wanderGoal || (hi === wanderGoal[0] && hj === wanderGoal[1])) {
          wanderGoal = [pi + Math.round((Math.random() - 0.5) * 16), pj + Math.round((Math.random() - 0.5) * 16)];
        }
        const step = nextStep(hi, hj, wanderGoal[0], wanderGoal[1], blocked);
        if (!step.found) wanderGoal = null;
        target = { x: (step.i + 0.5) * CELL, z: (step.j + 0.5) * CELL };
      }
    }

    // darker you = faster it; deeper levels = faster it
    const base = hunting ? 1.5 + (1 - light / 100) * 2.4 : 0.8;
    // players move twice as fast now, so the Hollow does too
    const speed = base * 1.9 * (1 + depth * 0.12);
    const dx = target.x - hx, dz = target.z - hz;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const step = Math.min(d, speed * dt);
      object.position.x += (dx / d) * step;
      object.position.z += (dz / d) * step;
    }

    // it never stands fully still: a slow sway and flicker
    sprite.position.x = Math.sin(t * 1.7) * 0.04;
    (sprite.material as THREE.SpriteMaterial).opacity = 0.85 + Math.sin(t * 13) * 0.08;
    glow.intensity = hunting ? 1.1 : 0.5;

    // far away and not hunting: occasionally relocate somewhere ahead in the dark
    if (!hunting && dist > CELL * 12) reset(px, pz);

    return { dist, hunting };
  }

  return { object, update, reset };
}

// Sasha (owner's drawing, 2026-10-08): lost somewhere in the corridors. A
// hand-drawn paper figure with his two orange diamonds circling him. He stands
// in a different corridor every 10 minutes, the same spot for everyone (the
// time slot seeds it), so players can tell each other where they saw him.
// Come close and he looks at you, chimes, and slips away to the next spot.
// He wears the ◇ mark like the other characters.
import * as THREE from "three";
import { textSprite } from "./ai";
import { CELL, free, placeOf, roomOf } from "./maze";

const SLOT = 10 * 60_000;
const ORANGE = "#eca050";

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** a plain corridor cell 25–70 m from the entrance, picked by the seed */
export function sashaSpot(seed: number) {
  const r = rand(seed * 2654435761);
  for (let k = 0; k < 400; k++) {
    const a = r() * Math.PI * 2, d = 25 + r() * 45;
    const i = Math.floor((Math.sin(a) * d) / CELL), j = Math.floor((Math.cos(a) * d) / CELL);
    const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL;
    if (free(x, z, 0.8) && !roomOf(i, j) && !placeOf(i, j)) return { x, z };
  }
  return { x: 30, z: 30 };
}

function diamondTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = ORANGE;
  g.shadowColor = ORANGE;
  g.shadowBlur = 14;
  g.beginPath();
  g.moveTo(32, 10);
  g.lineTo(52, 48);
  g.lineTo(32, 86);
  g.lineTo(12, 48);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type Sasha = ReturnType<typeof createSasha>;

export function createSasha(onFound?: () => void) {
  const group = new THREE.Group();
  const map = new THREE.TextureLoader().load("/sasha/sasha.webp");
  map.colorSpace = THREE.SRGBColorSpace;
  // a bust 1.8 m tall, his shoulders about chest height; the drawing fades out at the bottom
  // fog: false — the drawing glows through the dark so you can spot him from far away
  const body = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false }));
  body.scale.set(1.9, 1.8, 1);
  body.center.set(0.5, 0);
  body.position.y = 0.55;
  const dTex = diamondTexture();
  const diamonds = [0, 1].map(() => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(0.22, 0.33, 1);
    return s;
  });
  const glow = new THREE.PointLight(0xffa060, 1.6, 7, 1.6);
  glow.position.y = 1.6;
  const label = textSprite("◇ sasha", ORANGE, 28, 384);
  label.position.y = 2.55;
  const holder = new THREE.Group();
  holder.add(body, ...diamonds, glow, label);
  group.add(holder);

  let slot = -1;
  let fade = 0; // 0 hidden .. 1 there
  let leaving = 0; // seconds since he noticed you (0 = not yet)
  let away = 0; // after he slips away, the next spot waits a little
  let override: { x: number; z: number } | null = null;
  let found = 0;

  function place(x: number, z: number) {
    holder.position.set(x, 0, z);
    fade = 0;
    leaving = 0;
  }

  return {
    group,
    /** where he is now (for trailers / tests) */
    where: () => ({ x: holder.position.x, z: holder.position.z }),
    /** put him somewhere for a while (trailer recording, dev only) */
    pin(x: number | null, z = 0) {
      override = x == null ? null : { x, z };
      if (override) place(override.x, override.z);
      else slot = -1;
    },
    found: () => found,
    update(dt: number, px: number, pz: number) {
      const now = Date.now();
      const t = performance.now() / 1000;
      if (!override) {
        const s = Math.floor(now / SLOT) + found * 7919;
        if (s !== slot && away <= 0) {
          slot = s;
          const p = sashaSpot(s);
          place(p.x, p.z);
        }
      }
      away -= dt;
      const d = Math.hypot(holder.position.x - px, holder.position.z - pz);
      if (leaving === 0 && d < 3.2 && fade > 0.9) {
        leaving = 0.001;
        onFound?.();
      }
      if (leaving > 0) {
        leaving += dt;
        if (leaving > 2.4) {
          fade = Math.max(0, fade - dt * 1.5);
          if (fade === 0) {
            // gone: a few seconds later he's lost somewhere else
            leaving = 0;
            if (!override) {
              found++;
              away = 4;
              slot = -1;
            }
          }
        }
      } else if (away <= 0) fade = Math.min(1, fade + dt * 0.8);
      // he sways like paper in a draught, and flickers when he notices you
      const flick = leaving > 0 && leaving < 2.4 && Math.random() < 0.12 ? 0.35 : 1;
      const m = body.material as THREE.SpriteMaterial;
      m.opacity = fade * flick;
      m.rotation = Math.sin(t * 0.9) * 0.025;
      body.position.y = 0.55 + Math.sin(t * 1.1) * 0.05;
      const spin = leaving > 0 ? 4 : 1.1;
      diamonds.forEach((s, k) => {
        const a = t * spin + k * Math.PI;
        s.position.set(Math.cos(a) * 0.95, 1.75 + Math.sin(t * 1.7 + k) * 0.18, Math.sin(a) * 0.95);
        (s.material as THREE.SpriteMaterial).opacity = fade;
      });
      (label.material as THREE.SpriteMaterial).opacity = fade * (d < 14 ? 1 : 0);
      glow.intensity = 1.6 * fade * (0.85 + 0.15 * Math.sin(t * 7));
      holder.visible = fade > 0.01 && d < 60;
    },
  };
}

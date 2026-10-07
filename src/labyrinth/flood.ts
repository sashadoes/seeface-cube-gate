// The flood. About every 20 minutes (a different moment in each 20-minute
// window, the same moment for everyone) a siren wails for 20 s, then for 70 s
// waterfalls crash through the ceiling around every player. Each one is
// announced by a dripping ring on the floor ~2.5 s before it lands; whoever
// stands under it when it lands is gone. Rooms are safe (water never falls in
// a room). A lone surprise waterfall can also come as a twist.
import * as THREE from "three";
import { CELL, WALL_H, free, roomOf } from "./maze";

export const FLOOD_EVERY_MIN = 20;
const WARN_S = 20;
const FLOOD_S = 70;
const MARK_S = 2.5; // the ring on the floor before the water lands
const FALL_S = 3.2; // how long a waterfall pours
const KILL_R = 0.95;

function hash(n: number) {
  let h = Math.imul(n ^ 0x6b43a9b5, 2654435761);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

// Disasters: each 20-minute window holds one, picked from the clock: the flood,
// a tornado, a fire or the plague (hazards.ts has the last three).
// ?flood=1 or ?disaster=<kind> forces one a few seconds after the page loads.
export type DisasterKind = "flood" | "tornado" | "fire" | "plague";
const KINDS: DisasterKind[] = ["flood", "tornado", "fire", "plague"];
const q = new URLSearchParams(location.search);
const forcedKind = (q.get("disaster") as DisasterKind | null) ?? (q.has("flood") ? "flood" : null);
const forcedAt = forcedKind && KINDS.includes(forcedKind) ? Date.now() + 4000 : 0;

export type FloodPhase = "none" | "warn" | "flood";

/** which disaster this window holds (the same for everyone) */
export function disasterKind(now = Date.now()): DisasterKind {
  if (forcedAt) return forcedKind!;
  const k = Math.floor(now / (FLOOD_EVERY_MIN * 60_000));
  return KINDS[Math.floor(hash(k + 4242) * KINDS.length)];
}

export function floodPhase(now = Date.now()): { phase: FloodPhase; left: number } {
  const slot = FLOOD_EVERY_MIN * 60_000;
  const starts = forcedAt
    ? [forcedAt]
    : [Math.floor(now / slot) - 1, Math.floor(now / slot)].map((k) => k * slot + 60_000 + Math.floor(hash(k) * (slot - (WARN_S + FLOOD_S) * 1000 - 120_000)));
  for (const s of starts) {
    const t = (now - s) / 1000;
    if (t >= 0 && t < WARN_S) return { phase: "warn", left: WARN_S - t };
    if (t >= WARN_S && t < WARN_S + FLOOD_S) return { phase: "flood", left: WARN_S + FLOOD_S - t };
  }
  return { phase: "none", left: 0 };
}

function streakTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(170,210,240,0.35)";
  g.fillRect(0, 0, 64, 256);
  for (let k = 0; k < 260; k++) {
    g.fillStyle = `rgba(${225 + Math.random() * 30},${238 + Math.random() * 17},255,${0.3 + Math.random() * 0.65})`;
    g.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 3, 30 + Math.random() * 110);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.4, "rgba(255,255,255,0.5)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

type Fall = { group: THREE.Group; ring: THREE.Mesh; column: THREE.Mesh; foam: THREE.Mesh; drips: THREE.Points; x: number; z: number; t: number; live: boolean; crashed: boolean };

export function createFlood() {
  const group = new THREE.Group();
  const streaks = streakTexture();
  streaks.repeat.set(3, 1.2);
  const columnMat = new THREE.MeshBasicMaterial({ map: streaks, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide, color: 0xeef8ff });
  const inner = streakTexture();
  inner.repeat.set(2, 1.6);
  const innerMat = new THREE.MeshBasicMaterial({ map: inner, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xcfe8ff });
  const dot = dotTexture();
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
  const falls: Fall[] = Array.from({ length: 8 }, () => {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40), new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, WALL_H, 24, 1, true), columnMat);
    column.position.y = WALL_H / 2;
    column.visible = false;
    // a faster, brighter core inside the outer sheet
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, WALL_H, 18, 1, true), innerMat);
    column.add(core);
    const foam = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = 0.04;
    foam.visible = false;
    const dg = new THREE.BufferGeometry();
    const dp = new Float32Array(30 * 3);
    for (let k = 0; k < 30; k++) dp.set([(Math.random() - 0.5) * 1.4, Math.random() * WALL_H, (Math.random() - 0.5) * 1.4], k * 3);
    dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    const drips = new THREE.Points(dg, new THREE.PointsMaterial({ map: dot, color: 0xbfe8ff, size: 0.07, transparent: true, opacity: 0.9, depthWrite: false }));
    drips.visible = false;
    g.add(ring, column, foam, drips);
    g.visible = false;
    group.add(g);
    return { group: g, ring, column, foam, drips, x: 0, z: 0, t: 0, live: false, crashed: false };
  });
  const light = new THREE.PointLight(0x9fdcff, 0, 10, 1.5);
  light.position.y = 2.5;
  group.add(light);

  let spawnIn = 0;
  let last: FloodPhase = "none";

  function place(px: number, pz: number, vx: number, vz: number, near: boolean) {
    const f = falls.find((x) => !x.live);
    if (!f) return;
    // some land right where you're heading, the rest anywhere around you
    for (let k = 0; k < 20; k++) {
      const ahead = near ? 1 + Math.random() * 3 : 0;
      const a = Math.random() * Math.PI * 2, r = near ? Math.random() * 1.5 : 2 + Math.random() * 9;
      const x = px + vx * ahead + Math.cos(a) * r, z = pz + vz * ahead + Math.sin(a) * r;
      if (!free(x, z) || roomOf(Math.floor(x / CELL), Math.floor(z / CELL))) continue;
      Object.assign(f, { x, z, t: 0, live: true, crashed: false });
      f.group.position.set(x, 0, z);
      f.group.visible = true;
      f.column.visible = f.foam.visible = false;
      f.drips.visible = true;
      return;
    }
  }

  return {
    group,
    /** a lone waterfall right in your path (a twist) */
    surprise(px: number, pz: number, vx: number, vz: number) {
      place(px, pz, vx, vz, true);
    },
    update(dt: number, t: number, ctx: { px: number; pz: number; vx: number; vz: number; alive: boolean }) {
      const { phase, left } = floodPhase();
      const changed = phase !== last ? phase : null;
      last = phase;
      const inRoom = roomOf(Math.floor(ctx.px / CELL), Math.floor(ctx.pz / CELL)) !== null;
      const crashes: number[] = []; // distances of waterfalls that just landed
      let killed = false;

      const isFlood = disasterKind() === "flood";
      if (phase === "flood" && isFlood && ctx.alive) {
        spawnIn -= dt;
        if (spawnIn <= 0) {
          spawnIn = 0.7 + Math.random() * 0.9;
          place(ctx.px, ctx.pz, ctx.vx, ctx.vz, Math.random() < 0.35);
        }
      }

      streaks.offset.y += dt * 3.2;
      inner.offset.y += dt * 5.5;
      let nearest = Infinity;
      for (const f of falls) {
        if (!f.live) continue;
        f.t += dt;
        const d = Math.hypot(f.x - ctx.px, f.z - ctx.pz);
        nearest = Math.min(nearest, d);
        if (f.t < MARK_S) {
          // the warning ring pulses faster and brighter as it's about to land
          const k = f.t / MARK_S;
          const m = f.ring.material as THREE.MeshBasicMaterial;
          m.opacity = 0.35 + 0.6 * Math.abs(Math.sin(t * (4 + k * 14)));
          f.ring.scale.setScalar(1.15 - k * 0.15);
          const a = (f.drips.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
          for (let i = 1; i < a.length; i += 3) {
            a[i] -= dt * (3 + k * 6);
            if (a[i] < 0) a[i] = WALL_H;
          }
          f.drips.geometry.getAttribute("position").needsUpdate = true;
        } else if (f.t < MARK_S + FALL_S) {
          if (!f.crashed) {
            f.crashed = true;
            f.column.visible = f.foam.visible = true;
            f.drips.visible = false;
            (f.ring.material as THREE.MeshBasicMaterial).opacity = 0;
            crashes.push(d);
            if (d < KILL_R && ctx.alive && !inRoom) killed = true;
          }
          // still pouring: walking into it is deadly too
          if (d < KILL_R * 0.8 && ctx.alive && !inRoom) killed = true;
          const k = (f.t - MARK_S) / FALL_S;
          columnMat.opacity = 0.92;
          f.column.scale.set(1 + Math.sin(t * 20) * 0.03, 1, 1 + Math.cos(t * 17) * 0.03);
          f.foam.scale.setScalar(0.8 + k * 0.6 + Math.sin(t * 15) * 0.05);
          (f.foam.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k * 0.6);
          if (k > 0.85) f.column.scale.y = Math.max(0.05, (1 - k) / 0.15); // the last of it falls away
          f.column.position.y = (WALL_H * f.column.scale.y) / 2;
        } else {
          f.live = false;
          f.group.visible = false;
          f.column.scale.y = 1;
          f.column.position.y = WALL_H / 2;
        }
      }
      // a cold light from the nearest water
      const nf = falls.filter((f) => f.live).sort((a, b) => Math.hypot(a.x - ctx.px, a.z - ctx.pz) - Math.hypot(b.x - ctx.px, b.z - ctx.pz))[0];
      if (nf) light.position.set(nf.x, 2.4, nf.z);
      light.intensity = nf ? (nf.crashed ? 6 : 2) : 0;

      return { phase, left, changed, crashes, killed, nearest, kind: disasterKind() };
    },
  };
}

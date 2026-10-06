// Rifts: rare swirling tears in the air. On the surface they hide deep in the
// maze and drop you into a secret level; inside a secret level, rifts lead back
// up. Positions are deterministic, so everyone finds the same rifts.
import * as THREE from "three";
import { CELL, roomCentre, roomOf, rnd, spawn } from "./maze";
import { LEVELS, LEVEL_OFFSET, levelAtX } from "./zones";

const REGION = 8; // cells
const RADIUS = 2; // regions around the player that are checked

type Rift = { key: string; x: number; z: number; target: number; obj: THREE.Group };

function swirlTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  for (let k = 0; k < 9; k++) {
    g.strokeStyle = `rgba(255,255,255,${0.12 + k * 0.06})`;
    g.lineWidth = 6;
    g.beginPath();
    for (let a = 0; a < Math.PI * 4; a += 0.05) {
      const r = (a / (Math.PI * 4)) * 120;
      const x = 128 + Math.cos(a + k * 0.7) * r, y = 128 + Math.sin(a + k * 0.7) * r;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const swirl = swirlTexture();

// soft round dot for the sparks (without it, points render as hard squares)
const dot = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();

function buildRift(colour: number) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 12, 80), new THREE.MeshBasicMaterial({ color: colour }));
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.82, 48),
    new THREE.MeshBasicMaterial({ map: swirl, color: colour, transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }));
  const n = 120;
  const pos = new Float32Array(n * 3);
  const sparks = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)),
    new THREE.PointsMaterial({ color: colour, map: dot, size: 0.09, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  const face = new THREE.Group();
  face.add(disc, core, ring);
  face.position.y = 1.5;
  g.add(face, sparks);
  g.userData = { face, sparks, disc };
  return g;
}

export type Rifts = {
  group: THREE.Group;
  /** returns the level you were pulled into, or null */
  update: (px: number, pz: number, t: number, dt: number) => number | null;
  /** where you arrive in a level (0 = back at the surface entrance) */
  arrival: (level: number) => { x: number; z: number };
  /** the closest rift within a few regions, or null */
  nearest: (px: number, pz: number) => { x: number; z: number } | null;
};

export function createRifts(): Rifts {
  const group = new THREE.Group();
  const live = new Map<string, Rift>();
  const lights = Array.from({ length: 2 }, () => {
    const l = new THREE.PointLight(0xffffff, 0, 8, 1.6);
    group.add(l);
    return l;
  });
  let lastRegion = "";
  let cooldown = 0;

  function riftIn(I: number, J: number): { x: number; z: number; target: number } | null {
    const i = I * REGION + 1 + Math.floor(rnd(I, J, 92) * (REGION - 2));
    const j = J * REGION + 1 + Math.floor(rnd(I, J, 93) * (REGION - 2));
    if (roomOf(i, j)) return null;
    const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL;
    const level = levelAtX(x);
    if (level === 0) {
      // surface: rare, and never near the entrance
      if (rnd(I, J, 90) > 0.28 || Math.hypot(x, z) < 45) return null;
      return { x, z, target: 1 + Math.floor(rnd(I, J, 91) * (LEVELS.length - 1)) };
    }
    // inside a secret level: ways back up
    if (rnd(I, J, 94) > 0.35) return null;
    return { x, z, target: 0 };
  }

  function place(px: number, pz: number) {
    const I0 = Math.floor(px / CELL / REGION), J0 = Math.floor(pz / CELL / REGION);
    const keep = new Set<string>();
    for (let I = I0 - RADIUS; I <= I0 + RADIUS; I++)
      for (let J = J0 - RADIUS; J <= J0 + RADIUS; J++) {
        const key = `${I}:${J}`;
        const r = riftIn(I, J);
        if (!r) continue;
        keep.add(key);
        if (live.has(key)) continue;
        const obj = buildRift(LEVELS[r.target === 0 ? 0 : r.target].colour);
        obj.position.set(r.x, 0, r.z);
        group.add(obj);
        live.set(key, { key, ...r, obj });
      }
    for (const [key, r] of live)
      if (!keep.has(key)) {
        group.remove(r.obj);
        live.delete(key);
      }
  }

  function update(px: number, pz: number, t: number, dt: number) {
    const region = `${Math.floor(px / CELL / REGION)}:${Math.floor(pz / CELL / REGION)}`;
    if (region !== lastRegion) {
      lastRegion = region;
      place(px, pz);
    }
    cooldown = Math.max(0, cooldown - dt);
    let pulled: number | null = null;
    const near = [...live.values()].sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
    near.forEach((r, k) => {
      const { face, sparks, disc } = r.obj.userData as { face: THREE.Group; sparks: THREE.Points; disc: THREE.Mesh };
      face.lookAt(px, 1.5, pz); // always turned towards you
      disc.rotation.z = -t * 1.8;
      face.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
      const a = (sparks.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
      for (let s = 0; s < a.length / 3; s++) {
        const ang = t * 2 + s * 0.53;
        const rad = 0.9 + ((s * 37) % 50) / 100 + Math.sin(t + s) * 0.1;
        a[s * 3] = Math.cos(ang) * rad;
        a[s * 3 + 1] = 1.5 + Math.sin(ang * 1.3 + s) * 0.9;
        a[s * 3 + 2] = Math.sin(ang) * rad;
      }
      sparks.geometry.getAttribute("position").needsUpdate = true;
      if (k < lights.length) {
        lights[k].position.set(r.x, 1.5, r.z);
        lights[k].color.setHex(LEVELS[r.target].colour);
        lights[k].intensity = 5 + Math.sin(t * 4) * 1.5;
      }
      if (!cooldown && Math.hypot(r.x - px, r.z - pz) < 1.1) {
        pulled = r.target;
        cooldown = 4;
      }
    });
    for (let k = near.length; k < lights.length; k++) lights[k].intensity = 0;
    return pulled;
  }

  function arrival(level: number) {
    if (level === 0) {
      const s = spawn();
      return { x: s.x + 2.4, z: s.z + 2.4 };
    }
    const I = Math.round((level * LEVEL_OFFSET) / CELL / 7);
    const c = roomCentre(I, 0);
    return { x: c.x + 3.6, z: c.z + 3.6 }; // a few steps from the room's cube
  }

  function nearest(px: number, pz: number) {
    const I0 = Math.floor(px / CELL / REGION), J0 = Math.floor(pz / CELL / REGION);
    let best: { x: number; z: number } | null = null, bd = Infinity;
    for (let I = I0 - 3; I <= I0 + 3; I++)
      for (let J = J0 - 3; J <= J0 + 3; J++) {
        const r = riftIn(I, J);
        if (!r) continue;
        const d = Math.hypot(r.x - px, r.z - pz);
        if (d < bd) (bd = d), (best = { x: r.x, z: r.z });
      }
    return best;
  }

  return { group, update, arrival, nearest };
}

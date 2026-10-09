// The object library: small low-poly things a room can hold, built from
// primitives and coloured from the room's palette. To add one: write a builder
// here AND add its name to OBJECTS in server/architects/blueprint.mjs (that list
// is what SeeFace may use; a name missing here is skipped by the renderer).
import * as THREE from "three";

export type Kit = {
  base: THREE.Material; // palette.primary
  second: THREE.Material; // palette.secondary
  accent: THREE.Material; // palette.accent, glowing
  dark: THREE.Material;
  glass: THREE.Material;
  flame: THREE.Material;
  plant: THREE.Material;
  r: () => number;
};
export type Built = { obj: THREE.Object3D; radius: number; update?: (t: number) => void };

const g = {
  box: (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt: number, rb: number, h: number, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s),
  sph: (r: number, d = 1) => new THREE.IcosahedronGeometry(r, d),
  cone: (r: number, h: number, s = 7) => new THREE.ConeGeometry(r, h, s),
  tor: (r: number, t: number, rs = 6, ts = 24) => new THREE.TorusGeometry(r, t, rs, ts),
};
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
function group(...children: THREE.Object3D[]) {
  const o = new THREE.Group();
  children.forEach((c) => o.add(c));
  return o;
}

export const LIBRARY: Record<string, (k: Kit) => Built> = {
  pillar: (k) => ({ obj: group(mesh(g.cyl(0.35, 0.4, 4.2, 10), k.base, 0, 2.1), mesh(g.box(1, 0.25, 1), k.second, 0, 0.12), mesh(g.box(0.95, 0.22, 0.95), k.second, 0, 4.3)), radius: 0.6 }),
  plant: (k) => {
    const o = group(mesh(g.cyl(0.3, 0.22, 0.5), k.dark, 0, 0.25));
    for (let i = 0; i < 6; i++) {
      const leaf = mesh(g.cone(0.12, 0.9, 4), k.plant, 0, 0.9, 0);
      leaf.rotation.set((k.r() - 0.5) * 1.2, k.r() * 6, (k.r() - 0.5) * 1.2);
      o.add(leaf);
    }
    return { obj: o, radius: 0.4 };
  },
  screen: (k) => {
    const panel = mesh(g.box(1.6, 0.95, 0.06), k.accent, 0, 1.6);
    return { obj: group(panel, mesh(g.box(0.08, 1.2, 0.08), k.dark, 0, 0.6), mesh(g.box(0.6, 0.05, 0.4), k.dark, 0, 0.03)), radius: 0.8, update: (t) => ((panel.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 + Math.sin(t * 3 + panel.id) * 0.3) };
  },
  chair: (k) => ({ obj: group(mesh(g.box(0.5, 0.06, 0.5), k.second, 0, 0.45), mesh(g.box(0.5, 0.55, 0.06), k.second, 0, 0.75, -0.22), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => mesh(g.box(0.05, 0.45, 0.05), k.dark, sx * 0.21, 0.22, sz * 0.21)))), radius: 0.45 }),
  statue: (k) => ({ obj: group(mesh(g.box(0.8, 1, 0.8), k.second, 0, 0.5), mesh(g.cyl(0.18, 0.28, 1.1, 7), k.base, 0, 1.55), mesh(g.sph(0.24, 0), k.base, 0, 2.3)), radius: 0.6 }),
  crystal: (k) => {
    const c = mesh(g.sph(0.45, 0), k.accent, 0, 0.9);
    c.scale.y = 2;
    return { obj: group(c), radius: 0.5, update: (t) => (c.rotation.y = t * 0.4) };
  },
  speaker: (k) => ({ obj: group(mesh(g.box(0.7, 1.4, 0.6), k.dark, 0, 0.7), mesh(g.cyl(0.24, 0.24, 0.05, 16), k.second, 0, 0.95, 0.31).rotateX(Math.PI / 2), mesh(g.cyl(0.12, 0.12, 0.05, 12), k.second, 0, 0.4, 0.31).rotateX(Math.PI / 2)), radius: 0.5 }),
  candle: (k) => {
    const f = mesh(g.cone(0.05, 0.16, 6), k.flame, 0, 0.5);
    return { obj: group(mesh(g.cyl(0.06, 0.07, 0.4, 8), k.base, 0, 0.2), f), radius: 0.15, update: (t) => (f.scale.y = 1 + Math.sin(t * 13 + f.id) * 0.2) };
  },
  bench: (k) => ({ obj: group(mesh(g.box(2, 0.1, 0.5), k.second, 0, 0.45), mesh(g.box(0.1, 0.45, 0.45), k.dark, -0.85, 0.22), mesh(g.box(0.1, 0.45, 0.45), k.dark, 0.85, 0.22)), radius: 1 }),
  lamp: (k) => ({ obj: group(mesh(g.cyl(0.04, 0.04, 1.7), k.dark, 0, 0.85), mesh(g.cone(0.3, 0.35, 10), k.accent, 0, 1.75), mesh(g.cyl(0.25, 0.25, 0.04, 12), k.dark, 0, 0.02)), radius: 0.35 }),
  orb: (k) => {
    const o = mesh(g.sph(0.4, 2), k.accent, 0, 1.4);
    return { obj: group(o), radius: 0.4, update: (t) => (o.position.y = 1.4 + Math.sin(t + o.id) * 0.25) };
  },
  arch: (k) => {
    const a = mesh(g.tor(1.3, 0.15, 6, 20), k.base, 0, 1.6);
    (a.geometry as THREE.TorusGeometry).dispose();
    a.geometry = new THREE.TorusGeometry(1.3, 0.15, 6, 20, Math.PI);
    return { obj: group(a, mesh(g.box(0.3, 1.6, 0.3), k.base, -1.3, 0.8), mesh(g.box(0.3, 1.6, 0.3), k.base, 1.3, 0.8)), radius: 1.4 };
  },
  mirror: (k) => ({ obj: group(mesh(g.box(1.1, 2.2, 0.06), k.glass, 0, 1.2), mesh(g.box(1.25, 2.35, 0.04), k.dark, 0, 1.2, -0.04)), radius: 0.6 }),
  tree: (k) => {
    const o = group(mesh(g.cyl(0.12, 0.2, 2, 6), k.dark, 0, 1));
    for (let i = 0; i < 3; i++) o.add(mesh(g.sph(0.9 - i * 0.2, 0), k.plant, (k.r() - 0.5) * 0.6, 2.2 + i * 0.6, (k.r() - 0.5) * 0.6));
    return { obj: o, radius: 0.9 };
  },
  rock: (k) => {
    const m = mesh(g.sph(0.7, 0), k.second, 0, 0.35);
    m.scale.set(1 + k.r() * 0.6, 0.6 + k.r() * 0.4, 1 + k.r() * 0.5);
    m.rotation.y = k.r() * 6;
    return { obj: group(m), radius: 0.9 };
  },
  neon_ring: (k) => {
    const ring = mesh(g.tor(0.9, 0.05, 6, 32), k.accent, 0, 1.6);
    return { obj: group(ring), radius: 0.9, update: (t) => (ring.rotation.y = t * 0.6) };
  },
  table: (k) => ({ obj: group(mesh(g.cyl(0.6, 0.6, 0.06, 14), k.second, 0, 0.75), mesh(g.cyl(0.06, 0.1, 0.75, 8), k.dark, 0, 0.37)), radius: 0.6 }),
  vase: (k) => ({ obj: group(mesh(new THREE.LatheGeometry([0.05, 0.2, 0.28, 0.22, 0.1, 0.14].map((x, i) => new THREE.Vector2(x, i * 0.14)), 10), k.base, 0, 0)), radius: 0.3 }),
  kelp: (k) => {
    const o = new THREE.Group();
    const parts: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const p = mesh(g.box(0.12, 0.6, 0.03), k.plant, 0, 0.3 + i * 0.58);
      parts.push(p);
      o.add(p);
    }
    return { obj: o, radius: 0.2, update: (t) => parts.forEach((p, i) => (p.position.x = Math.sin(t * 0.8 + i * 0.5 + o.id) * 0.06 * i)) };
  },
  disco_ball: (k) => {
    const b = mesh(g.sph(0.45, 1), k.glass, 0, 3.2);
    return { obj: group(b, mesh(g.cyl(0.01, 0.01, 1.2), k.dark, 0, 4)), radius: 0.4, update: (t) => (b.rotation.y = t * 0.5) };
  },
  cage: (k) => {
    const o = group(mesh(g.cyl(0.7, 0.7, 0.06, 12), k.dark, 0, 0.03), mesh(g.cyl(0.7, 0.7, 0.06, 12), k.dark, 0, 2.2));
    for (let i = 0; i < 10; i++) o.add(mesh(g.cyl(0.02, 0.02, 2.2, 4), k.dark, Math.cos((i / 10) * 6.283) * 0.7, 1.1, Math.sin((i / 10) * 6.283) * 0.7));
    o.add(mesh(g.sph(0.25, 1), k.accent, 0, 1.1));
    return { obj: o, radius: 0.8 };
  },
  throne: (k) => ({ obj: group(mesh(g.box(1, 0.5, 0.9), k.second, 0, 0.25), mesh(g.box(1, 2.4, 0.15), k.second, 0, 1.2, -0.4), mesh(g.cone(0.12, 0.4, 4), k.accent, -0.4, 2.6, -0.4), mesh(g.cone(0.12, 0.4, 4), k.accent, 0.4, 2.6, -0.4)), radius: 0.8 }),
};

export function makeKit(palette: { primary: string; secondary: string; accent: string }, r: () => number, neon: boolean): Kit {
  const std = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, flatShading: true, ...extra });
  return {
    base: std(palette.primary),
    second: std(palette.secondary),
    accent: std(palette.accent, { emissive: palette.accent, emissiveIntensity: neon ? 1.4 : 0.8 }),
    dark: std("#141418", { roughness: 0.5 }),
    glass: std("#d8e4ee", { roughness: 0.05, metalness: 1 }),
    flame: new THREE.MeshBasicMaterial({ color: "#ffcf73" }),
    plant: std("#3f7a4a"),
    r,
  };
}

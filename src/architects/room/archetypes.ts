// The 8 archetypes: parametric room shells. Each one takes the wall and floor
// materials (from the blueprint's surfaces + palette) and the object kit, and
// returns its geometry plus the facts the renderer needs: where people can walk,
// 12 poster slots, light positions, where a visitor appears, and an orbit view.
// To add an archetype: add a builder here AND its name to ARCHETYPES in
// server/architects/blueprint.mjs (+ a one-line description in seeface.mjs).
import * as THREE from "three";
import { LIBRARY, type Kit } from "./objects";

export type Floor = { kind: "rect"; w: number; d: number } | { kind: "circle"; r: number };
// meshes with userData.ceiling hide in the orbit preview (you look in from above) and show when walking
export type Shell = {
  group: THREE.Group;
  floor: Floor;
  height: number;
  open: boolean; // the sky is visible
  posterSlots: { pos: THREE.Vector3; rotY: number; size: number }[];
  lights: THREE.Vector3[];
  spawn: { pos: THREE.Vector3; yaw: number };
  orbit: { radius: number; height: number; target: THREE.Vector3 };
  update?: (t: number) => void;
};
type Mats = { wall: THREE.MeshStandardMaterial; floor: THREE.MeshStandardMaterial };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function plane(w: number, h: number, mat: THREE.Material, repeat = 1) {
  const geo = new THREE.PlaneGeometry(w, h);
  scaleUv(geo, (w / 4) * repeat, (h / 4) * repeat);
  return new THREE.Mesh(geo, mat);
}
// surface textures repeat by world size, not per mesh
function scaleUv(geo: THREE.BufferGeometry, u: number, v: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
  uv.needsUpdate = true;
}
function floorRect(w: number, d: number, m: THREE.Material) {
  const f = plane(w, d, m);
  f.rotation.x = -Math.PI / 2;
  return f;
}
function floorDisc(r: number, m: THREE.Material) {
  const geo = new THREE.CircleGeometry(r, 48);
  scaleUv(geo, r / 2, r / 2);
  const f = new THREE.Mesh(geo, m);
  f.rotation.x = -Math.PI / 2;
  return f;
}
/** four inward-facing walls (+ optional ceiling) around a w×d box. Single-sided on purpose:
 *  from outside (the orbit preview) the near walls vanish and you look into the room. */
function box(g: THREE.Group, w: number, d: number, h: number, m: Mats, ceiling: THREE.Material | null) {
  const walls: [number, number, number, number][] = [
    [0, -d / 2, 0, w],
    [0, d / 2, Math.PI, w],
    [-w / 2, 0, Math.PI / 2, d],
    [w / 2, 0, -Math.PI / 2, d],
  ];
  for (const [x, z, ry, len] of walls) {
    const p = plane(len, h, m.wall);
    p.position.set(x, h / 2, z);
    p.rotation.y = ry;
    g.add(p);
  }
  if (ceiling) {
    const c = plane(w, d, ceiling);
    c.rotation.x = Math.PI / 2;
    c.position.y = h;
    c.userData.ceiling = true;
    g.add(c);
  }
}
/** slots along the two long walls of a box (x = ±w/2), facing in */
function sideSlots(w: number, d: number, y: number, perSide: number, size: number, inset = 0.08) {
  const out: Shell["posterSlots"] = [];
  for (let i = 0; i < perSide; i++) {
    const z = -d / 2 + ((i + 0.5) * d) / perSide;
    out.push({ pos: V(-w / 2 + inset, y, z), rotY: Math.PI / 2, size });
    out.push({ pos: V(w / 2 - inset, y, z), rotY: -Math.PI / 2, size });
  }
  return out;
}
/** slots on a circle, facing the centre */
function ringSlots(r: number, y: number, n: number, size: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { pos: V(Math.sin(a) * r, y, Math.cos(a) * r), rotY: a + Math.PI, size };
  });
}
function place(g: THREE.Group, kit: Kit, type: string, x: number, z: number, ry = 0) {
  const b = LIBRARY[type]?.(kit);
  if (!b) return null;
  b.obj.position.set(x, 0, z);
  b.obj.rotation.y = ry;
  g.add(b.obj);
  return b;
}

export const ARCHETYPES: Record<string, (kit: Kit, m: Mats) => Shell> = {
  cathedral(kit, m) {
    const g = new THREE.Group();
    const w = 14,
      d = 36,
      h = 13;
    g.add(floorRect(w, d, m.floor));
    box(g, w, d, h, m, null);
    // pitched vault: two planes laid flat (facing down), then tilted up toward the ridge
    const rise = 5;
    const tilt = Math.atan2(rise, w / 2);
    for (const s of [-1, 1]) {
      const roof = plane(Math.hypot(w / 2, rise), d, m.wall);
      roof.rotation.order = "ZXY";
      roof.rotation.x = Math.PI / 2;
      roof.rotation.z = -s * tilt;
      roof.position.set((s * w) / 4, h + rise / 2, 0);
      roof.userData.ceiling = true;
      g.add(roof);
    }
    // the gable ends, facing in (so the orbit view sees through the near one, like a dollhouse)
    for (const z of [-d / 2, d / 2]) {
      const pts = [V(-w / 2, h, z), V(w / 2, h, z), V(0, h + rise, z)];
      if (z > 0) pts.reverse();
      const tri = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(pts), m.wall);
      tri.geometry.computeVertexNormals();
      g.add(tri);
    }
    // two rows of pillars joined by arches
    for (let z = -14; z <= 14; z += 7) {
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 9, 10), kit.second);
        p.position.set(s * 4.4, 4.5, z);
        g.add(p);
      }
      const arch = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.3, 6, 18, Math.PI), kit.second);
      arch.position.set(0, 9, z);
      arch.userData.ceiling = true;
      g.add(arch);
    }
    // altar + rose window
    const altar = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 1.4), kit.base);
    altar.position.set(0, 0.55, -15.5);
    g.add(altar);
    const rose = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), kit.accent);
    rose.position.set(0, 9.5, -d / 2 + 0.05);
    g.add(rose);
    return {
      group: g,
      floor: { kind: "rect", w: 8, d: d - 2 },
      height: h,
      open: false,
      posterSlots: sideSlots(w, 30, 3.4, 6, 2.6),
      lights: [V(0, 6, -12), V(0, 6, 0), V(0, 6, 12), V(0, 3, -15)],
      spawn: { pos: V(0, 0, 16), yaw: 0 },
      orbit: { radius: 26, height: 11, target: V(0, 4, 0) },
    };
  },

  void(kit, m) {
    const g = new THREE.Group();
    const r = 12;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, 0.6, 48), m.floor);
    disc.position.y = -0.3;
    g.add(disc);
    const top = floorDisc(r, m.floor);
    top.position.y = 0.001;
    g.add(top);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 4, 96), kit.accent);
    edge.rotation.x = Math.PI / 2;
    g.add(edge);
    // floating frames for posters hang in the dark
    return {
      group: g,
      floor: { kind: "circle", r: r - 0.6 },
      height: 30,
      open: true,
      posterSlots: ringSlots(r + 1.5, 2.6, 12, 2.4),
      lights: [V(0, 5, 0), V(6, 3, 6), V(-6, 3, -6)],
      spawn: { pos: V(0, 0, 8), yaw: 0 },
      orbit: { radius: 26, height: 12, target: V(0, 1, 0) },
      update: (t) => (edge.rotation.z = t * 0.05),
    };
  },

  club(kit, m) {
    const g = new THREE.Group();
    const w = 18,
      d = 18,
      h = 4.5;
    g.add(floorRect(w, d, m.floor));
    box(g, w, d, h, m, kit.dark);
    // light grid in the ceiling
    const cells: THREE.Mesh[] = [];
    for (let x = -6; x <= 6; x += 2)
      for (let z = -6; z <= 6; z += 2) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 1.4), kit.accent.clone());
        c.position.set(x, h - 0.05, z);
        c.userData.ceiling = true;
        g.add(c);
        cells.push(c);
      }
    // booth
    const booth = new THREE.Mesh(new THREE.BoxGeometry(4, 1.1, 1.2), kit.dark);
    booth.position.set(0, 0.55, -7.5);
    g.add(booth);
    place(g, kit, "speaker", -3, -8);
    place(g, kit, "speaker", 3, -8);
    return {
      group: g,
      floor: { kind: "rect", w: w - 1.2, d: d - 1.2 },
      height: h,
      open: false,
      posterSlots: [...sideSlots(w, d, 2.1, 4, 1.8), ...[-5, 0, 5].map((x) => ({ pos: V(x, 2.1, d / 2 - 0.08), rotY: Math.PI, size: 1.8 })), { pos: V(-6.5, 2.4, -d / 2 + 0.08), rotY: 0, size: 1.8 }, { pos: V(6.5, 2.4, -d / 2 + 0.08), rotY: 0, size: 1.8 }].slice(0, 12),
      lights: [V(0, 3.5, -6), V(-5, 3.5, 3), V(5, 3.5, 3)],
      spawn: { pos: V(0, 0, 7.5), yaw: 0 },
      orbit: { radius: 16, height: 9, target: V(0, 1.2, 0) },
      update: (t) => cells.forEach((c, i) => ((c.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + Math.max(0, Math.sin(t * 2.2 + i * 0.7)) * 1.6)),
    };
  },

  garden(kit, m) {
    const g = new THREE.Group();
    const r = 16;
    g.add(floorDisc(r + 14, m.floor));
    // a ring of hedges with four gaps
    for (let i = 0; i < 28; i++) {
      if (i % 7 === 3) continue;
      const a = (i / 28) * Math.PI * 2;
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 1.1), m.wall);
      hedge.position.set(Math.sin(a) * r, 0.9, Math.cos(a) * r);
      hedge.rotation.y = a;
      g.add(hedge);
    }
    for (let i = 0; i < 7; i++) place(g, kit, "tree", Math.sin(i * 0.9) * (r + 5 + kit.r() * 6), Math.cos(i * 0.9) * (r + 5 + kit.r() * 6));
    return {
      group: g,
      floor: { kind: "circle", r: r - 1 },
      height: 40,
      open: true,
      posterSlots: ringSlots(r - 1.4, 1.9, 12, 1.8),
      lights: [V(0, 6, 0), V(7, 3, 0), V(-7, 3, 0)],
      spawn: { pos: V(0, 0, 11), yaw: 0 },
      orbit: { radius: 30, height: 14, target: V(0, 1, 0) },
    };
  },

  gallery_corridor(kit, m) {
    const g = new THREE.Group();
    const w = 6,
      d = 40,
      h = 5;
    g.add(floorRect(w, d, m.floor));
    box(g, w, d, h, m, kit.dark);
    // a track of ceiling lights
    for (let z = -18; z <= 18; z += 3) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 1.6), kit.accent);
      l.position.set(0, h - 0.04, z);
      l.userData.ceiling = true;
      g.add(l);
    }
    return {
      group: g,
      floor: { kind: "rect", w: w - 1.2, d: d - 1 },
      height: h,
      open: false,
      posterSlots: sideSlots(w, 36, 2.1, 6, 2.2, 0.12),
      lights: [V(0, 4, -14), V(0, 4, -4), V(0, 4, 6), V(0, 4, 16)],
      spawn: { pos: V(0, 0, 18.5), yaw: 0 },
      orbit: { radius: 24, height: 10, target: V(0, 1.5, 0) },
    };
  },

  cave(kit, m) {
    const g = new THREE.Group();
    const r = 13;
    const geo = new THREE.IcosahedronGeometry(r, 3);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const rnd = kit.r;
    const bumps = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const k = `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`;
      if (!bumps.has(k)) bumps.set(k, 0.82 + rnd() * 0.3);
      const s = bumps.get(k)!;
      const y = pos.getY(i);
      pos.setXYZ(i, pos.getX(i) * s, y < -2 ? -0.2 : y * s * 0.6, pos.getZ(i) * s);
    }
    geo.computeVertexNormals();
    const rock = new THREE.Mesh(geo, m.wall);
    m.wall.side = THREE.BackSide;
    m.wall.flatShading = true;
    g.add(rock);
    g.add(floorDisc(r, m.floor));
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2,
        d = 7 + rnd() * 4;
      const st = new THREE.Mesh(new THREE.ConeGeometry(0.3 + rnd() * 0.4, 1 + rnd() * 2.5, 5), kit.second);
      st.position.set(Math.sin(a) * d, 0.6, Math.cos(a) * d);
      g.add(st);
    }
    return {
      group: g,
      floor: { kind: "circle", r: 8.5 },
      height: 7,
      open: false,
      posterSlots: ringSlots(9.6, 2.2, 12, 1.7),
      lights: [V(0, 4, 0), V(5, 2, 4), V(-5, 2, -4)],
      spawn: { pos: V(0, 0, 6), yaw: 0 },
      orbit: { radius: 7.5, height: 5, target: V(0, 1.5, 0) },
    };
  },

  rooftop(kit, m) {
    const g = new THREE.Group();
    const w = 24;
    g.add(floorRect(w, w, m.floor));
    // parapet
    for (const [x, z, ry] of [
      [0, -w / 2, 0],
      [0, w / 2, 0],
      [-w / 2, 0, Math.PI / 2],
      [w / 2, 0, Math.PI / 2],
    ] as const) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, 0.35), m.wall);
      p.position.set(x, 0.55, z);
      p.rotation.y = ry;
      g.add(p);
    }
    // the city below and around (lit windows via emissive accents)
    const city = new THREE.Group();
    const win = kit.accent.clone() as THREE.MeshStandardMaterial;
    win.emissiveIntensity = 0.5;
    for (let i = 0; i < 70; i++) {
      // far enough that the orbit camera (26 m out) never sits inside a tower; tops stay near roof level
      const a = kit.r() * Math.PI * 2,
        d = 48 + kit.r() * 90,
        hh = 15 + kit.r() * 40;
      const b = new THREE.Mesh(new THREE.BoxGeometry(6 + kit.r() * 8, hh, 6 + kit.r() * 8), kit.dark);
      b.position.set(Math.sin(a) * d, hh / 2 - 48 + (d > 90 ? 14 : 0), Math.cos(a) * d);
      city.add(b);
      if (kit.r() < 0.6) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, hh * 0.7, 0.3), win);
        strip.position.set(b.position.x, b.position.y, b.position.z);
        city.add(strip);
      }
    }
    g.add(city);
    place(g, kit, "lamp", -9, -9);
    place(g, kit, "lamp", 9, 9);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 10), kit.second);
    tank.position.set(8.5, 2.6, -8.5);
    g.add(tank);
    return {
      group: g,
      floor: { kind: "rect", w: w - 1.4, d: w - 1.4 },
      height: 40,
      open: true,
      posterSlots: [...[-7, 0, 7].flatMap((x) => [
        { pos: V(x, 1.9, -w / 2 + 0.3), rotY: 0, size: 2 },
        { pos: V(x, 1.9, w / 2 - 0.3), rotY: Math.PI, size: 2 },
        { pos: V(-w / 2 + 0.3, 1.9, x), rotY: Math.PI / 2, size: 2 },
        { pos: V(w / 2 - 0.3, 1.9, x), rotY: -Math.PI / 2, size: 2 },
      ])],
      lights: [V(0, 4, 0), V(-8, 3, 8), V(8, 3, -8)],
      spawn: { pos: V(0, 0, 9), yaw: 0 },
      orbit: { radius: 26, height: 14, target: V(0, 1, 0) },
    };
  },

  ocean_floor(kit, m) {
    const g = new THREE.Group();
    const r = 18;
    const geo = new THREE.CircleGeometry(r + 20, 64, 0, Math.PI * 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 0.4) * Math.cos(pos.getY(i) * 0.3) * 0.25);
    geo.computeVertexNormals();
    scaleUv(geo, 10, 10);
    const sand = new THREE.Mesh(geo, m.floor);
    sand.rotation.x = -Math.PI / 2;
    g.add(sand);
    const kelp: ((t: number) => void)[] = [];
    for (let i = 0; i < 30; i++) {
      const a = kit.r() * Math.PI * 2,
        d = r - 2 + kit.r() * 12;
      const b = place(g, kit, "kelp", Math.sin(a) * d, Math.cos(a) * d);
      if (b?.update) kelp.push(b.update);
    }
    const rocks = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const b = place(g, kit, "rock", Math.sin(a) * (r - 3), Math.cos(a) * (r - 3), a);
      if (b) {
        b.obj.scale.setScalar(1.6);
        (b.obj.children[0] as THREE.Mesh).material = m.wall;
        rocks.push(b);
      }
    }
    // light shafts from far above
    const shaftMat = new THREE.MeshBasicMaterial({ color: "#bfe9ff", transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
    const shafts: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(2 + kit.r() * 2, 30, 12, 1, true), shaftMat);
      s.position.set((kit.r() - 0.5) * 24, 15, (kit.r() - 0.5) * 24);
      g.add(s);
      shafts.push(s);
    }
    return {
      group: g,
      floor: { kind: "circle", r: r - 4.5 },
      height: 30,
      open: true,
      posterSlots: ringSlots(r - 4.6, 2, 12, 1.8),
      lights: [V(0, 6, 0), V(6, 3, 6), V(-6, 3, -6)],
      spawn: { pos: V(0, 0, 9), yaw: 0 },
      orbit: { radius: 28, height: 12, target: V(0, 1, 0) },
      update: (t) => {
        kelp.forEach((u) => u(t));
        shafts.forEach((s, i) => ((s.material as THREE.MeshBasicMaterial).opacity = 0.04 + Math.sin(t * 0.5 + i) * 0.02));
      },
    };
  },
};

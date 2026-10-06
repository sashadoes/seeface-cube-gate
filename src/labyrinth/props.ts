// Props: colourful strange objects floating and turning in the corridors
// (orbs, knots, crystals, an eye, neon rings, a melting column, a tesseract),
// blood stains, money on the floor (pick it up: ◈), the rare knife, and, very
// rarely and deep in, a coffee table with white lines and a coca shrub.
// (No furniture: removed at the owner's request.)
//
// Unpredictable but shared: the layout re-rolls every hour, and everyone online
// in the same hour sees the same props in the same places.
import * as THREE from "three";
import { CELL, WALL_H, roomOf, rnd, wallEast, wallSouth, placeOf } from "./maze";

const RADIUS = 6; // cells around the player that get props
export type Pickup = { key: string; kind: "money" | "knife" | "relic"; x: number; z: number; obj: THREE.Object3D; colour?: number; shape?: number };

// ------------------------------------------------------------------ shared materials / textures

const M = {
  darkWood: new THREE.MeshStandardMaterial({ color: 0x1e1610, roughness: 0.7 }),
  blade: new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.12, metalness: 1, emissive: 0x202428 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4 }),
  mirror: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.04, metalness: 1 }),
  powder: new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 1, emissive: 0x303030 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f6b2a, roughness: 0.8, side: THREE.DoubleSide }),
};

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const bloodTex = canvasTex(256, 256, (g) => {
  const blob = (x: number, y: number, r: number, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(70,0,4,${a})`);
    grad.addColorStop(0.7, `rgba(95,4,8,${a * 0.85})`);
    grad.addColorStop(1, "rgba(95,4,8,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  blob(128, 128, 70, 0.92);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 70;
    blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 4 + Math.random() * 14, 0.85);
  }
});
const bloodMat = new THREE.MeshBasicMaterial({ map: bloodTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

const billTex = canvasTex(256, 112, (g) => {
  g.fillStyle = "#7d8a6a";
  g.fillRect(0, 0, 256, 112);
  g.strokeStyle = "#3d4a33";
  g.lineWidth = 6;
  g.strokeRect(8, 8, 240, 96);
  g.fillStyle = "#2f3a28";
  g.font = "bold 46px 'Times New Roman', serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("◈ 1", 128, 58);
  g.globalAlpha = 0.25;
  g.fillRect(30, 30, 40, 52);
  g.fillRect(186, 30, 40, 52);
});
const billMat = new THREE.MeshStandardMaterial({ map: billTex, roughness: 0.9, side: THREE.DoubleSide });

function glintTex() {
  return canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.2, "rgba(220,235,255,0.6)");
    r.addColorStop(1, "rgba(220,235,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
}
const glint = glintTex();

const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
};

// ------------------------------------------------------------------ strange objects

/** A vivid colour from a seed. */
const vivid = (seed: number, l = 0.55) => new THREE.Color().setHSL(seed % 1, 0.85, l);

/** iridescent-ish material: colour + strong emissive glow so it reads in the dark */
const glowMat = (seed: number, glow = 0.55) =>
  new THREE.MeshStandardMaterial({ color: vivid(seed), emissive: vivid(seed + 0.08, 0.45), emissiveIntensity: glow, roughness: 0.2, metalness: 0.35 });

function orbs(g: THREE.Group, seed: number) {
  for (let k = 0; k < 5; k++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16 + (k % 3) * 0.09, 24, 16), glowMat(seed + k * 0.13, 0.7));
    m.position.set(Math.cos(k * 1.3) * 0.7, 1.1 + k * 0.28, Math.sin(k * 1.3) * 0.7);
    g.add(m);
  }
  g.userData.anim = (o: THREE.Object3D, t: number) => {
    o.rotation.y = t * 0.4;
    o.children.forEach((c, k) => (c.position.y = 1.1 + k * 0.28 + Math.sin(t * 1.3 + k) * 0.18));
  };
}

function knot(g: THREE.Group, seed: number) {
  const m = new THREE.Mesh(new THREE.TorusKnotGeometry(0.42, 0.11, 140, 16, 2 + Math.floor(seed * 3), 3), glowMat(seed, 0.8));
  m.position.y = 1.6;
  g.add(m);
  g.userData.anim = (o: THREE.Object3D, t: number) => {
    o.children[0].rotation.set(t * 0.5, t * 0.8, 0);
    o.children[0].position.y = 1.6 + Math.sin(t) * 0.1;
  };
}

function candyStack(g: THREE.Group, seed: number) {
  for (let k = 0; k < 6; k++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.5 - k * 0.05, 0.38, 0.5 - k * 0.05), glowMat(seed + k * 0.17, 0.4));
    c.position.y = 0.19 + k * 0.38;
    c.rotation.y = k * 0.35;
    g.add(c);
  }
  g.userData.anim = (o: THREE.Object3D, t: number) => o.children.forEach((c, k) => (c.rotation.y = k * 0.35 + Math.sin(t * 0.7 + k) * 0.4));
}

function crystals(g: THREE.Group, seed: number) {
  for (let k = 0; k < 9; k++) {
    const h = 0.5 + Math.random() * 1.4;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.12 + Math.random() * 0.1, h, 5), glowMat(seed + k * 0.05, 0.9));
    c.position.set((Math.random() - 0.5) * 0.7, h / 2, (Math.random() - 0.5) * 0.7);
    c.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
    g.add(c);
  }
  g.userData.anim = (o: THREE.Object3D, t: number) =>
    o.children.forEach((c, k) => (((c as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + Math.sin(t * 2 + k) * 0.35));
}

function eye(g: THREE.Group, seed: number) {
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 24), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.3 }));
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.25, 32), new THREE.MeshBasicMaterial({ color: vivid(seed, 0.5) }));
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  iris.position.z = 0.55;
  pupil.position.z = 0.552;
  const front = new THREE.Group();
  front.add(iris, pupil);
  const ball = new THREE.Group();
  ball.add(white, front);
  ball.position.y = 1.7;
  g.add(ball);
  // the eye turns to watch whoever is near (set by update via userData.watch)
  g.userData.anim = (o: THREE.Object3D, t: number, px: number, pz: number) => {
    const b = o.children[0];
    b.lookAt(px, 1.6, pz);
    b.position.y = 1.7 + Math.sin(t * 0.9) * 0.08;
    front.scale.y = Math.sin(t * 0.5) > 0.985 ? 0.1 : 1; // a slow blink
  };
}

function rings(g: THREE.Group, seed: number) {
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.5 + k * 0.22, 0.03, 10, 64), new THREE.MeshBasicMaterial({ color: vivid(seed + k * 0.2, 0.6) }));
    r.position.y = 1.6;
    g.add(r);
  }
  g.userData.anim = (o: THREE.Object3D, t: number) =>
    o.children.forEach((r, k) => r.rotation.set(t * (0.6 + k * 0.3), t * (0.4 - k * 0.2), k));
}

function meltingColumn(g: THREE.Group, seed: number) {
  const geo = new THREE.CylinderGeometry(0.28, 0.45, 2.6, 24, 30);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const base = Float32Array.from(pos.array as Float32Array);
  const m = new THREE.Mesh(geo, glowMat(seed, 0.5));
  m.position.y = 1.3;
  g.add(m);
  g.userData.anim = (o: THREE.Object3D, t: number) => {
    // the column drips and sways like warm wax
    for (let i = 0; i < pos.count; i++) {
      const y = base[i * 3 + 1];
      const sag = Math.sin(t * 0.8 + y * 2.2) * 0.06 * (1.3 - y);
      pos.setXYZ(i, base[i * 3] * (1 + sag), y + Math.sin(t + base[i * 3] * 6) * 0.02, base[i * 3 + 2] * (1 + sag));
    }
    pos.needsUpdate = true;
  };
}

function tesseract(g: THREE.Group, seed: number) {
  const mat = new THREE.LineBasicMaterial({ color: vivid(seed, 0.65) });
  const outer = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), mat);
  const inner = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 0.5, 0.5)), mat);
  const h = new THREE.Group();
  h.add(outer, inner);
  h.position.y = 1.6;
  g.add(h);
  g.userData.anim = (o: THREE.Object3D, t: number) => {
    h.rotation.set(t * 0.3, t * 0.5, t * 0.2);
    const s = 0.5 + Math.sin(t * 1.2) * 0.25;
    inner.scale.setScalar(s / 0.5);
    inner.rotation.set(-t * 0.6, t * 0.2, 0);
  };
}

const STRANGE = [orbs, knot, candyStack, crystals, eye, rings, meltingColumn, tesseract];

// ------------------------------------------------------------------ rare + pickups

function cokeTable(g: THREE.Group) {
  g.add(box(1.1, 0.05, 0.6, M.darkWood, 0, 0.42, 0));
  for (const [x, z] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) g.add(box(0.05, 0.42, 0.05, M.darkWood, x, 0.21, z));
  g.add(box(0.5, 0.008, 0.36, M.mirror, -0.1, 0.45, 0));
  for (let k = 0; k < 3; k++) g.add(box(0.22, 0.006, 0.012, M.powder, -0.1, 0.457, -0.08 + k * 0.08));
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), billMat);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0.25, 0.46, 0.05);
  g.add(roll);
}

function cocaShrub(g: THREE.Group) {
  const stems = new THREE.Group();
  for (let s = 0; s < 7; s++) {
    const h = 0.9 + Math.random() * 0.6;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, h, 5), M.darkWood);
    const a = s * 0.9;
    stem.position.set(Math.cos(a) * 0.1, h / 2, Math.sin(a) * 0.1);
    stem.rotation.set(Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25);
    stems.add(stem);
  }
  g.add(stems);
  // small oval leaves, many of them
  const leafGeo = new THREE.CircleGeometry(0.06, 8);
  leafGeo.scale(1, 0.5, 1);
  const leaves = new THREE.InstancedMesh(leafGeo, M.leaf, 160);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 160; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.45, y = 0.3 + Math.random() * 1.15;
    m4.compose(
      new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3)),
      new THREE.Vector3(1, 1, 1)
    );
    leaves.setMatrixAt(i, m4);
  }
  g.add(leaves);
  g.add(box(0.5, 0.35, 0.5, M.darkWood, 0, 0.17, 0)); // planter
}

function moneyPile() {
  const g = new THREE.Group();
  for (let k = 0; k < 7; k++) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.13), billMat);
    b.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI);
    b.position.set((Math.random() - 0.5) * 0.5, 0.012 + k * 0.004, (Math.random() - 0.5) * 0.5);
    g.add(b);
  }
  return g;
}

function knife() {
  const g = new THREE.Group();
  const blade = box(0.26, 0.008, 0.035, M.blade, 0.07, 0.02, 0);
  const handle = box(0.12, 0.022, 0.03, M.black, -0.12, 0.02, 0);
  g.add(blade, handle);
  const sparkle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glint, color: 0xdfeaff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparkle.scale.setScalar(0.45);
  sparkle.position.set(0.12, 0.08, 0);
  g.add(sparkle);
  g.userData.sparkle = sparkle;
  g.rotation.y = Math.random() * Math.PI;
  return g;
}

/** Relic: a small glowing object you can pick up and carry. shape 0..3 */
export function relicMesh(colour: number, shape: number) {
  const geos = [
    () => new THREE.IcosahedronGeometry(0.13, 0),
    () => new THREE.TorusGeometry(0.11, 0.035, 10, 32),
    () => new THREE.OctahedronGeometry(0.14, 0),
    () => new THREE.BoxGeometry(0.17, 0.17, 0.17),
  ];
  const m = new THREE.Mesh(geos[shape % 4](), new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.3 }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glint, color: colour, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(0.7);
  const g = new THREE.Group();
  g.add(m, glow);
  g.userData.spinner = m;
  return g;
}

// ------------------------------------------------------------------ the layer

export type Props = {
  group: THREE.Group;
  update: (px: number, pz: number, t: number) => void;
  pickupsNear: (x: number, z: number, r: number) => Pickup[];
  take: (p: Pickup) => void;
  spawnMoney: (x: number, z: number) => void;
};

export function createProps(): Props {
  const group = new THREE.Group();
  const cells = new Map<string, { obj: THREE.Object3D; pickups: Pickup[] }>();
  const taken = new Set<string>();
  let lastCell = "";
  let hour = -1;

  function cellProps(i: number, j: number, h: number) {
    if (roomOf(i, j)) return null;
    const pl = placeOf(i, j);
    if (pl && (pl.kind === "dark" || pl.kind === "market" || pl.kind === "museum")) return null; // keep those places as they are
    const salt = 1000 + (h % 5000);
    const r = rnd(i, j, salt);
    const g = new THREE.Group();
    const pickups: Pickup[] = [];
    const cx = (i + 0.5) * CELL, cz = (j + 0.5) * CELL;
    // stand against an existing wall of the cell
    const walls: [boolean, number, number, number][] = [
      [wallSouth(i, j - 1), cx, j * CELL + 0.9, 0],
      [wallSouth(i, j), cx, (j + 1) * CELL - 0.9, Math.PI],
      [wallEast(i - 1, j), i * CELL + 0.9, cz, Math.PI / 2],
      [wallEast(i, j), (i + 1) * CELL - 0.9, cz, -Math.PI / 2],
    ];
    const wall = walls[Math.floor(rnd(i, j, salt + 1) * 4)];
    const deep = Math.hypot(cx, cz) > 60;

    if (r < 0.1) {
      const seed = rnd(i, j, salt + 2);
      STRANGE[Math.floor(seed * STRANGE.length)](g, rnd(i, j, salt + 12));
      g.position.set(cx + (rnd(i, j, salt + 13) - 0.5) * 1.6, 0, cz + (rnd(i, j, salt + 14) - 0.5) * 1.6);
    } else if (r < 0.155) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), bloodMat);
      s.rotation.set(-Math.PI / 2, 0, rnd(i, j, salt + 3) * 6);
      s.position.set(cx + (rnd(i, j, salt + 4) - 0.5) * 2, 0.012, cz + (rnd(i, j, salt + 5) - 0.5) * 2);
      s.scale.setScalar(0.6 + rnd(i, j, salt + 6));
      g.add(s);
    } else if (r < 0.19) {
      const key = `m:${h}:${i}:${j}`;
      if (!taken.has(key)) {
        const pile = moneyPile();
        pile.position.set(cx + (rnd(i, j, salt + 7) - 0.5) * 1.6, 0, cz + (rnd(i, j, salt + 8) - 0.5) * 1.6);
        g.add(pile);
        pickups.push({ key, kind: "money", x: pile.position.x, z: pile.position.z, obj: pile });
      }
    } else if (r < 0.196) {
      const key = `k:${h}:${i}:${j}`;
      if (!taken.has(key)) {
        const k = knife();
        k.position.set(cx + (rnd(i, j, salt + 9) - 0.5) * 1.4, 0, cz + (rnd(i, j, salt + 10) - 0.5) * 1.4);
        g.add(k);
        pickups.push({ key, kind: "knife", x: k.position.x, z: k.position.z, obj: k });
      }
    } else if (r < 0.235) {
      const key = `r:${h}:${i}:${j}`;
      if (!taken.has(key)) {
        const colour = new THREE.Color().setHSL(rnd(i, j, salt + 15), 0.9, 0.55).getHex();
        const shape = Math.floor(rnd(i, j, salt + 16) * 4);
        const rel = relicMesh(colour, shape);
        rel.position.set(cx + (rnd(i, j, salt + 17) - 0.5) * 1.6, 0.9, cz + (rnd(i, j, salt + 18) - 0.5) * 1.6);
        g.add(rel);
        pickups.push({ key, kind: "relic", x: rel.position.x, z: rel.position.z, obj: rel, colour, shape });
      }
    } else if (deep && r < 0.2375 && wall[0]) {
      (rnd(i, j, salt + 11) < 0.5 ? cokeTable : cocaShrub)(g);
      g.position.set(wall[1], 0, wall[2]);
      g.rotation.y = wall[3];
    } else {
      return null;
    }
    return { obj: g, pickups };
  }

  function rebuild(ci: number, cj: number, h: number) {
    const keep = new Set<string>();
    for (let i = ci - RADIUS; i <= ci + RADIUS; i++)
      for (let j = cj - RADIUS; j <= cj + RADIUS; j++) {
        const key = `${h}:${i}:${j}`;
        keep.add(key);
        if (cells.has(key)) continue;
        const p = cellProps(i, j, h);
        if (p) {
          group.add(p.obj);
          cells.set(key, p);
        }
      }
    for (const [key, p] of cells)
      if (!keep.has(key)) {
        group.remove(p.obj);
        cells.delete(key);
      }
  }

  function update(px: number, pz: number, t: number) {
    const h = Math.floor(Date.now() / 3600000);
    const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
    const key = `${h}:${ci}:${cj}`;
    if (key !== lastCell) {
      if (h !== hour) {
        // a new hour: the labyrinth rearranges itself
        for (const p of cells.values()) group.remove(p.obj);
        cells.clear();
        hour = h;
      }
      lastCell = key;
      rebuild(ci, cj, h);
    }
    for (const p of cells.values()) {
      const anim = p.obj.userData.anim as ((o: THREE.Object3D, t: number, px: number, pz: number) => void) | undefined;
      if (anim) anim(p.obj, t, px, pz);
    }
    for (const p of cells.values())
      for (const pk of p.pickups) {
        const sp = pk.obj.userData.spinner as THREE.Object3D | undefined;
        if (sp) {
          sp.rotation.set(t * 0.8, t * 1.3, 0);
          pk.obj.position.y = 0.9 + Math.sin(t * 2 + pk.x) * 0.1;
        }
        const s = pk.obj.userData.sparkle as THREE.Sprite | undefined;
        if (s) (s.material as THREE.SpriteMaterial).opacity = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + pk.x));
      }
  }

  function pickupsNear(x: number, z: number, r: number) {
    const out: Pickup[] = [];
    for (const p of cells.values()) for (const pk of p.pickups) if (Math.hypot(pk.x - x, pk.z - z) < r) out.push(pk);
    return out;
  }

  function take(pk: Pickup) {
    taken.add(pk.key);
    pk.obj.parent?.remove(pk.obj);
    for (const p of cells.values()) p.pickups = p.pickups.filter((x) => x !== pk);
  }

  /** gold hour: money appears around the player */
  let goldN = 0;
  function spawnMoney(x: number, z: number) {
    const pile = moneyPile();
    pile.position.set(x, 0, z);
    const holder = new THREE.Group();
    holder.add(pile);
    group.add(holder);
    const key = `gold:${goldN++}`;
    cells.set(key, { obj: holder, pickups: [{ key, kind: "money", x, z, obj: pile }] });
  }

  return { group, update, pickupsNear, take, spawnMoney };
}

export { WALL_H };

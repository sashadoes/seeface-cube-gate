// Props: the labyrinth looks lived-in, as if people stayed here and vanished.
// Furniture sets, an old TV breathing static, floor lamps, blood stains, money
// on the floor (pick it up: ◈), the rare knife, and, very rarely and deep in,
// a coffee table with white lines and a coca shrub.
//
// Unpredictable but shared: the layout re-rolls every hour, and everyone online
// in the same hour sees the same props in the same places.
import * as THREE from "three";
import { CELL, WALL_H, roomOf, rnd, wallEast, wallSouth } from "./maze";

const RADIUS = 6; // cells around the player that get props
export type Pickup = { key: string; kind: "money" | "knife"; x: number; z: number; obj: THREE.Object3D };

// ------------------------------------------------------------------ shared materials / textures

const M = {
  wood: new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.75 }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x1e1610, roughness: 0.7 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0x4a3f36, roughness: 0.95 }),
  fabricRed: new THREE.MeshStandardMaterial({ color: 0x4a1a18, roughness: 0.95 }),
  sheet: new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.25, metalness: 0.9 }),
  blade: new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.12, metalness: 1, emissive: 0x202428 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4 }),
  mirror: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.04, metalness: 1 }),
  powder: new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 1, emissive: 0x303030 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f6b2a, roughness: 0.8, side: THREE.DoubleSide }),
  shade: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
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

// the old TV: one shared static texture, refreshed a few times a second
const staticCanvas = document.createElement("canvas");
staticCanvas.width = 96;
staticCanvas.height = 72;
const staticTex = new THREE.CanvasTexture(staticCanvas);
staticTex.colorSpace = THREE.SRGBColorSpace;
const staticMat = new THREE.MeshBasicMaterial({ map: staticTex, toneMapped: false });
function refreshStatic() {
  const g = staticCanvas.getContext("2d")!;
  const img = g.createImageData(96, 72);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 200 + 30;
    img.data[i] = v * 0.92;
    img.data[i + 1] = v * 0.97;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  staticTex.needsUpdate = true;
}

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

// ------------------------------------------------------------------ furniture sets

function chairAndTable(g: THREE.Group) {
  g.add(box(1, 0.06, 0.7, M.wood, 0, 0.75, 0));
  for (const [x, z] of [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]]) g.add(box(0.05, 0.75, 0.05, M.darkWood, x, 0.375, z));
  const chair = new THREE.Group();
  chair.add(box(0.45, 0.05, 0.45, M.wood, 0, 0.45, 0), box(0.45, 0.5, 0.05, M.wood, 0, 0.72, -0.2));
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) chair.add(box(0.04, 0.45, 0.04, M.darkWood, x, 0.225, z));
  chair.position.set(0.2, 0, 0.75);
  chair.rotation.y = 2.6; // pushed back, as if someone just stood up
  g.add(chair);
}

function sofaAndLamp(g: THREE.Group) {
  g.add(box(1.9, 0.42, 0.85, M.fabricRed, 0, 0.21, 0), box(1.9, 0.5, 0.2, M.fabricRed, 0, 0.62, -0.33));
  g.add(box(0.2, 0.32, 0.85, M.fabricRed, -0.95, 0.5, 0), box(0.2, 0.32, 0.85, M.fabricRed, 0.95, 0.5, 0));
  const lamp = new THREE.Group();
  lamp.add(box(0.04, 1.5, 0.04, M.metal, 0, 0.75, 0));
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.28, 16, 1, true), M.shade);
  shade.position.y = 1.6;
  lamp.add(shade);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glint, color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(1.6);
  glow.position.y = 1.6;
  lamp.add(glow);
  lamp.position.set(1.25, 0, -0.1);
  g.add(lamp);
}

function bed(g: THREE.Group) {
  g.add(box(1.0, 0.35, 2.0, M.darkWood, 0, 0.17, 0), box(0.96, 0.18, 1.96, M.sheet, 0, 0.44, 0));
  g.add(box(0.6, 0.12, 0.35, M.sheet, 0, 0.58, -0.75), box(1.0, 0.8, 0.06, M.darkWood, 0, 0.4, -1.0));
  // a blanket thrown aside
  const b = box(0.9, 0.04, 0.9, M.fabric, 0.15, 0.55, 0.4);
  b.rotation.set(0.05, 0.4, 0.08);
  g.add(b);
}

function tvCorner(g: THREE.Group) {
  g.add(box(0.8, 0.5, 0.5, M.darkWood, 0, 0.25, 0)); // cabinet
  const tv = new THREE.Group();
  tv.add(box(0.62, 0.48, 0.45, M.black, 0, 0, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.36), staticMat);
  screen.position.set(0, 0.01, 0.226);
  tv.add(screen);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glint, color: 0xcfe0ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(1.5);
  glow.position.set(0, 0, 0.4);
  tv.add(glow);
  tv.position.y = 0.74;
  g.add(tv);
  const chair = new THREE.Group();
  chair.add(box(0.6, 0.38, 0.6, M.fabric, 0, 0.19, 0), box(0.6, 0.55, 0.14, M.fabric, 0, 0.6, -0.24));
  chair.position.set(0, 0, 1.4);
  chair.rotation.y = Math.PI;
  g.add(chair);
}

function shelf(g: THREE.Group) {
  g.add(box(1.2, 1.9, 0.32, M.darkWood, 0, 0.95, 0));
  for (let k = 0; k < 4; k++) {
    for (let b = 0; b < 6; b++) {
      if (Math.random() < 0.3) continue;
      const book = box(0.08 + Math.random() * 0.06, 0.22 + Math.random() * 0.08, 0.22, [M.fabricRed, M.fabric, M.wood][b % 3], -0.45 + b * 0.17, 0.25 + k * 0.45, 0.06);
      book.rotation.z = (Math.random() - 0.5) * 0.25;
      g.add(book);
    }
  }
}

const SETS = [chairAndTable, sofaAndLamp, bed, tvCorner, shelf];

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

// ------------------------------------------------------------------ the layer

export type Props = {
  group: THREE.Group;
  update: (px: number, pz: number, t: number) => void;
  pickupsNear: (x: number, z: number, r: number) => Pickup[];
  take: (p: Pickup) => void;
};

export function createProps(): Props {
  const group = new THREE.Group();
  const cells = new Map<string, { obj: THREE.Object3D; pickups: Pickup[] }>();
  const taken = new Set<string>();
  let lastCell = "";
  let hour = -1;
  let lastStatic = 0;

  function cellProps(i: number, j: number, h: number) {
    if (roomOf(i, j)) return null;
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

    if (r < 0.075 && wall[0]) {
      SETS[Math.floor(rnd(i, j, salt + 2) * SETS.length)](g);
      g.position.set(wall[1], 0, wall[2]);
      g.rotation.y = wall[3];
    } else if (r < 0.14) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), bloodMat);
      s.rotation.set(-Math.PI / 2, 0, rnd(i, j, salt + 3) * 6);
      s.position.set(cx + (rnd(i, j, salt + 4) - 0.5) * 2, 0.012, cz + (rnd(i, j, salt + 5) - 0.5) * 2);
      s.scale.setScalar(0.6 + rnd(i, j, salt + 6));
      g.add(s);
    } else if (r < 0.175) {
      const key = `m:${h}:${i}:${j}`;
      if (!taken.has(key)) {
        const pile = moneyPile();
        pile.position.set(cx + (rnd(i, j, salt + 7) - 0.5) * 1.6, 0, cz + (rnd(i, j, salt + 8) - 0.5) * 1.6);
        g.add(pile);
        pickups.push({ key, kind: "money", x: pile.position.x, z: pile.position.z, obj: pile });
      }
    } else if (r < 0.181) {
      const key = `k:${h}:${i}:${j}`;
      if (!taken.has(key)) {
        const k = knife();
        k.position.set(cx + (rnd(i, j, salt + 9) - 0.5) * 1.4, 0, cz + (rnd(i, j, salt + 10) - 0.5) * 1.4);
        g.add(k);
        pickups.push({ key, kind: "knife", x: k.position.x, z: k.position.z, obj: k });
      }
    } else if (deep && r < 0.1835 && wall[0]) {
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
    if (t - lastStatic > 0.09) {
      lastStatic = t;
      refreshStatic();
    }
    for (const p of cells.values())
      for (const pk of p.pickups) {
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

  return { group, update, pickupsNear, take };
}

export { WALL_H };

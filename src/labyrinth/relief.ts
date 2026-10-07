// Relief: the labyrinth stops looking flat while everyone still walks on one
// level. Inlaid patches of other floors (stone tiles, hex tiles, boards, iron
// grates, moss, cracked slabs, terrazzo), puddles, a rug in every room;
// skirting, benches and cornices of different heights along the walls; columns
// at some corners; and a ceiling that steps down in places (coffers, beams over
// open doorways). Nothing here collides, so the walkable map is unchanged.
// Deterministic per cell (rnd), so everyone sees the same corridors.
import * as THREE from "three";
import { CELL, WALL_H, hasPanel, inShip, placeOf, roomOf, rnd, wallEast, wallSouth } from "./maze";
import { zoneOfCell } from "./zones";

export type Relief = {
  rebuild: (ci: number, cj: number, view: number) => void;
  setWet: (w: number) => void;
  setCeiling: (on: boolean) => void;
};

// ------------------------------------------------------------------ textures (painted once, no network)
function seeded(n: number) {
  let a = n | 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(seed: number, draw: (g: CanvasRenderingContext2D, s: number, r: () => number) => void, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  draw(g, size, seeded(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const grey = (v: number, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

function grain(g: CanvasRenderingContext2D, s: number, r: () => number, n: number, spread: number) {
  for (let k = 0; k < n; k++) {
    g.fillStyle = grey(128 + (r() - 0.5) * spread * 2, 0.18);
    g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2);
  }
}

/** a dark rim, so a patch reads as set into the floor */
function rim(g: CanvasRenderingContext2D, s: number, w = 6) {
  g.strokeStyle = grey(25, 0.85);
  g.lineWidth = w;
  g.strokeRect(w / 2, w / 2, s - w, s - w);
}

const FLOOR_TEX = {
  tiles: () =>
    paint(11, (g, s, r) => {
      const n = 4, t = s / n;
      for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
        g.fillStyle = grey(150 + r() * 60);
        g.fillRect(x * t, y * t, t, t);
      }
      grain(g, s, r, 2500, 60);
      g.strokeStyle = grey(45);
      g.lineWidth = 3;
      for (let k = 0; k <= n; k++) {
        g.beginPath(), g.moveTo(k * t, 0), g.lineTo(k * t, s), g.stroke();
        g.beginPath(), g.moveTo(0, k * t), g.lineTo(s, k * t), g.stroke();
      }
      rim(g, s);
    }),
  hex: () =>
    paint(12, (g, s, r) => {
      g.fillStyle = grey(50);
      g.fillRect(0, 0, s, s);
      const R = 18, w = Math.sqrt(3) * R;
      for (let row = -1; row * R * 1.5 < s + R; row++)
        for (let col = -1; col * w < s + w; col++) {
          const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * R * 1.5;
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = Math.PI / 6 + (k * Math.PI) / 3;
            g.lineTo(cx + Math.cos(a) * (R - 1.5), cy + Math.sin(a) * (R - 1.5));
          }
          g.fillStyle = grey(r() < 0.12 ? 90 : 175 + r() * 50);
          g.fill();
        }
      grain(g, s, r, 1500, 40);
      rim(g, s);
    }),
  boards: () =>
    paint(13, (g, s, r) => {
      const n = 7, w = s / n;
      for (let k = 0; k < n; k++) {
        const base = 110 + r() * 60;
        g.fillStyle = grey(base);
        g.fillRect(k * w, 0, w, s);
        g.strokeStyle = grey(base - 35, 0.6);
        g.lineWidth = 1;
        for (let l = 0; l < 6; l++) {
          const x0 = k * w + 3 + r() * (w - 6), ph = r() * 6;
          g.beginPath();
          for (let y = 0; y <= s; y += 8) g.lineTo(x0 + Math.sin(y / 23 + ph) * 2, y);
          g.stroke();
        }
        const joint = r() * s;
        g.fillStyle = grey(30);
        g.fillRect(k * w, joint, w, 2);
        g.fillRect(k * w, 0, 2, s);
      }
      rim(g, s, 5);
    }),
  grate: () =>
    paint(14, (g, s, r) => {
      g.fillStyle = grey(14);
      g.fillRect(0, 0, s, s);
      const step = 16;
      for (let y = 0; y < s; y += step)
        for (let x = 0; x < s; x += step) {
          g.fillStyle = grey(95 + r() * 40);
          g.fillRect(x, y, step, 3);
          g.fillRect(x, y, 3, step);
        }
      // rust bloom
      for (let k = 0; k < 14; k++) {
        const x = r() * s, y = r() * s, rad = 10 + r() * 30;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, "rgba(70,55,45,0.55)");
        gr.addColorStop(1, "rgba(70,55,45,0)");
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      g.strokeStyle = grey(150);
      g.lineWidth = 8;
      g.strokeRect(4, 4, s - 8, s - 8);
    }),
  moss: () =>
    paint(15, (g, s, r) => {
      g.fillStyle = grey(120);
      g.fillRect(0, 0, s, s);
      for (let k = 0; k < 220; k++) {
        const x = r() * s, y = r() * s, rad = 4 + r() * 26;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        const v = r() < 0.5 ? 60 : 200;
        gr.addColorStop(0, grey(v, 0.35));
        gr.addColorStop(1, grey(v, 0));
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      grain(g, s, r, 4000, 90);
    }),
  cracked: () =>
    paint(16, (g, s, r) => {
      g.fillStyle = grey(165);
      g.fillRect(0, 0, s, s);
      grain(g, s, r, 5000, 70);
      // two slabs with a seam, then cracks wandering out
      g.fillStyle = grey(40);
      g.fillRect(s / 2 - 1, 0, 3, s);
      g.strokeStyle = grey(35, 0.9);
      for (let k = 0; k < 9; k++) {
        let x = r() * s, y = r() * s;
        g.lineWidth = 1 + r() * 2;
        g.beginPath();
        g.moveTo(x, y);
        let a = r() * Math.PI * 2;
        for (let l = 0; l < 14; l++) {
          a += (r() - 0.5) * 1.2;
          x += Math.cos(a) * 9;
          y += Math.sin(a) * 9;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      rim(g, s, 8);
    }),
  terrazzo: () =>
    paint(17, (g, s, r) => {
      g.fillStyle = grey(205);
      g.fillRect(0, 0, s, s);
      for (let k = 0; k < 900; k++) {
        const x = r() * s, y = r() * s, rad = 1 + r() * 5;
        g.fillStyle = grey(r() < 0.5 ? 40 + r() * 60 : 140 + r() * 80);
        g.beginPath();
        for (let v = 0; v < 5; v++) {
          const a = (v / 5) * Math.PI * 2 + r();
          g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad * (0.5 + r()));
        }
        g.fill();
      }
      rim(g, s, 10);
    }),
};
type FloorKind = keyof typeof FLOOR_TEX;
const FLOOR_KINDS = Object.keys(FLOOR_TEX) as FloorKind[];
// a little colour on top of each location's own floor tint
const FLOOR_HUE: Record<FloorKind, number> = {
  tiles: 0xffffff, hex: 0xf4f0ff, boards: 0xffe2c0, grate: 0xd8dde4, moss: 0xb8e0a0, cracked: 0xf0ece4, terrazzo: 0xffffff,
};

const rugTex = () =>
  paint(18, (g, s, r) => {
    g.fillStyle = grey(70);
    g.fillRect(0, 0, s, s);
    const band = (inset: number, w: number, v: number) => {
      g.strokeStyle = grey(v);
      g.lineWidth = w;
      g.strokeRect(inset, inset, s - inset * 2, s - inset * 2);
    };
    band(10, 8, 200), band(24, 4, 140), band(36, 10, 30);
    // a diamond lattice in the field
    g.save();
    g.beginPath();
    g.rect(44, 44, s - 88, s - 88);
    g.clip();
    g.strokeStyle = grey(160, 0.7);
    g.lineWidth = 2;
    for (let k = -s; k < s * 2; k += 28) {
      g.beginPath(), g.moveTo(k, 0), g.lineTo(k + s, s), g.stroke();
      g.beginPath(), g.moveTo(k, s), g.lineTo(k + s, 0), g.stroke();
    }
    g.restore();
    g.fillStyle = grey(220);
    g.beginPath();
    g.moveTo(s / 2, s / 2 - 34), g.lineTo(s / 2 + 22, s / 2), g.lineTo(s / 2, s / 2 + 34), g.lineTo(s / 2 - 22, s / 2);
    g.fill();
    grain(g, s, r, 3000, 50);
  });

const stoneTex = () =>
  paint(19, (g, s, r) => {
    const rows = 6, h = s / rows;
    for (let y = 0; y < rows; y++) {
      const off = y % 2 ? h : 0;
      for (let x = -1; x < 4; x++) {
        g.fillStyle = grey(120 + r() * 70);
        g.fillRect(x * h * 2 + off, y * h, h * 2, h);
      }
      g.fillStyle = grey(55);
      g.fillRect(0, y * h, s, 2);
      for (let x = -1; x < 4; x++) g.fillRect(x * h * 2 + off, y * h, 2, h);
    }
    grain(g, s, r, 3000, 60);
  });

const puddleAlpha = () =>
  paint(20, (g, s, r) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, s, s);
    // a few overlapping soft blobs make an irregular puddle
    for (let k = 0; k < 7; k++) {
      const x = s / 2 + (r() - 0.5) * s * 0.35, y = s / 2 + (r() - 0.5) * s * 0.35, rad = s * (0.16 + r() * 0.16);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.7, "rgba(255,255,255,0.9)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    }
  });

// ------------------------------------------------------------------ the relief
export function createRelief(scene: THREE.Scene): Relief {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0); // bottom at y = 0
  const MAX_CELLS = 32 * 32;

  const make = (geo: THREE.BufferGeometry, mat: THREE.Material, max: number) => {
    const m = new THREE.InstancedMesh(geo, mat, max);
    m.frustumCulled = false;
    m.count = 0;
    m.setColorAt(0, new THREE.Color()); // allocate per-instance colours
    scene.add(m);
    return m;
  };

  const floorMats = new Map<FloorKind, THREE.MeshStandardMaterial>();
  const floors = new Map<FloorKind, THREE.InstancedMesh>();
  for (const k of FLOOR_KINDS) {
    const mat = new THREE.MeshStandardMaterial({
      map: FLOOR_TEX[k](),
      roughness: k === "grate" ? 0.45 : k === "terrazzo" ? 0.3 : k === "moss" ? 0.95 : 0.7,
      metalness: k === "grate" ? 0.6 : 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    mat.userData.dry = { r: mat.roughness };
    floorMats.set(k, mat);
    floors.set(k, make(box, mat, MAX_CELLS));
  }
  const rugMat = new THREE.MeshStandardMaterial({ map: rugTex(), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const rugs = make(box, rugMat, 16);
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.03, metalness: 0.85, alphaMap: puddleAlpha(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const puddles = make(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), puddleMat, MAX_CELLS);
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.85, metalness: 0.02 });
  const trims = make(box, new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 }), MAX_CELLS * 6);
  const columns = make(box, stoneMat, MAX_CELLS * 3);
  const ceilMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const ceiling = make(box, ceilMat, MAX_CELLS * 3);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const tint = new THREE.Color();
  const n = new Map<THREE.InstancedMesh, number>();
  const put = (m: THREE.InstancedMesh, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY: number, c: THREE.Color) => {
    const k = n.get(m) ?? 0;
    if (k >= m.instanceMatrix.count) return;
    q.setFromAxisAngle(up, rotY);
    m.setMatrixAt(k, m4.compose(p.set(x, y, z), q, sc.set(sx, sy, sz)));
    m.setColorAt(k, c);
    n.set(m, k + 1);
  };
  // cells where relief is welcome: plain corridors and rooms, never places or the ship
  const plain = (i: number, j: number) => !placeOf(i, j) && !inShip((i + 0.5) * CELL, (j + 0.5) * CELL);
  const corridor = (i: number, j: number) => plain(i, j) && !roomOf(i, j);

  function rebuild(ci: number, cj: number, view: number) {
    n.clear();
    for (let i = ci - view; i <= ci + view; i++)
      for (let j = cj - view; j <= cj + view; j++) {
        if (!plain(i, j)) continue;
        const zone = zoneOfCell(i, j);
        const x0 = i * CELL, z0 = j * CELL, cx = x0 + CELL / 2, cz = z0 + CELL / 2;
        const room = roomOf(i, j);

        // ---- floor: inlays a few millimetres proud (blood and coins still sit on top)
        if (room) {
          if (i === room.i && j === room.j) {
            const w = 3 * CELL - 2.6 - rnd(i, j, 311) * 1.5, d = 3 * CELL - 2.6 - rnd(i, j, 312) * 3;
            const turn = rnd(i, j, 313) < 0.5 ? 0 : Math.PI / 2;
            put(rugs, room.i * CELL + 1.5 * CELL, 0, room.j * CELL + 1.5 * CELL, w, 0.009, d, turn, tint.setHex(zone.floor).lerp(col.setHex(0xb04a3a), 0.45).multiplyScalar(2.2));
          }
        } else if (rnd(i, j, 301) < 0.62) {
          const kind = FLOOR_KINDS[Math.floor(rnd(i, j, 302) * FLOOR_KINDS.length)];
          const w = CELL - 0.35 - rnd(i, j, 303) * 1.4, d = CELL - 0.35 - rnd(i, j, 304) * 1.4;
          const ox = (rnd(i, j, 305) - 0.5) * (CELL - 0.3 - w), oz = (rnd(i, j, 306) - 0.5) * (CELL - 0.3 - d);
          const h = 0.004 + rnd(i, j, 307) * 0.005;
          tint.setHex(zone.floor).multiplyScalar(1.5 + rnd(i, j, 308) * 0.9).multiply(col.setHex(FLOOR_HUE[kind]));
          put(floors.get(kind)!, cx + ox, 0, cz + oz, w, h, d, Math.floor(rnd(i, j, 309) * 4) * (Math.PI / 2), tint);
        }
        if (rnd(i, j, 320) < 0.14) {
          const r = 0.7 + rnd(i, j, 321) * 1.6;
          put(puddles, cx + (rnd(i, j, 322) - 0.5) * 1.6, 0.011, cz + (rnd(i, j, 323) - 0.5) * 1.6, r, 1, r * (0.5 + rnd(i, j, 324) * 0.6), rnd(i, j, 325) * Math.PI, col.setRGB(1, 1, 1));
        }

        // ---- walls: skirting, benches and cornices of different heights (both faces)
        const wallCol = tint.setHex(zone.wall).multiplyScalar(0.42);
        const faces: [boolean, number, number, number, number, number][] = [
          // [has wall, wall centre x, z, along-x?, neighbour i, neighbour j]
          [wallEast(i, j), x0 + CELL, cz, 0, i + 1, j],
          [wallSouth(i, j), cx, z0 + CELL, 1, i, j + 1],
        ];
        for (const [has, wx, wz, alongX, ni, nj] of faces) {
          if (!has) continue;
          for (const s of [-1, 1]) {
            // which cell this face looks into
            const fi = s < 0 ? i : ni, fj = s < 0 ? j : nj;
            if (!plain(fi, fj)) continue;
            const salt = 330 + (alongX ? 20 : 0) + (s > 0 ? 10 : 0);
            const at = (depth: number) => (alongX ? [wx, wz + s * (0.15 + depth / 2)] : [wx + s * (0.15 + depth / 2), wz]);
            const lay = (len: number, y: number, h: number, depth: number, shift = 0) => {
              const [x, z] = at(depth);
              put(trims, x + (alongX ? shift : 0), y, z + (alongX ? 0 : shift), alongX ? len : depth, h, alongX ? depth : len, 0, wallCol);
            };
            const r1 = rnd(i, j, salt);
            if (r1 < 0.55) lay(CELL, 0, 0.08 + rnd(i, j, salt + 1) * 0.3, 0.05); // skirting
            if (rnd(i, j, salt + 2) < 0.13) {
              // a low bench / plinth along the wall (inside the wall's own margin)
              const len = 1.2 + rnd(i, j, salt + 3) * 1.8;
              lay(len, 0, 0.35 + rnd(i, j, salt + 4) * 0.6, 0.2, (rnd(i, j, salt + 5) - 0.5) * (CELL - 0.8 - len));
            }
            if (rnd(i, j, salt + 6) < 0.45) {
              const h = 0.12 + rnd(i, j, salt + 7) * 0.4; // cornice: the ceiling line drops
              lay(CELL, WALL_H - h, h, 0.1 + rnd(i, j, salt + 8) * 0.18);
            }
          }
        }

        // ---- a column at this cell's north-west corner (where walls meet)
        const post = wallEast(i - 1, j) || wallEast(i - 1, j - 1) || wallSouth(i, j - 1) || wallSouth(i - 1, j - 1);
        if (post && rnd(i, j, 360) < 0.24 && plain(i - 1, j - 1) && plain(i - 1, j) && plain(i, j - 1)) {
          const w = 0.44 + rnd(i, j, 361) * 0.08;
          const stone = tint.setHex(zone.wall).multiplyScalar(0.55 + rnd(i, j, 362) * 0.25);
          put(columns, x0, 0, z0, w, WALL_H, w, 0, stone);
          put(columns, x0, 0, z0, 0.66, 0.22, 0.66, 0, stone); // base (stays inside the post's 0.5 m)
          put(columns, x0, WALL_H - 0.24, z0, 0.7, 0.24, 0.7, 0, stone); // capital
        }

        // ---- ceiling: coffers and beams bring it lower in places
        if (!room && !hasPanel(i, j) && rnd(i, j, 370) < 0.32) {
          const h = 0.25 + rnd(i, j, 371) * 0.55; // lowest at ~2.6 m, above any normal jump
          put(ceiling, cx, WALL_H - h, cz, CELL - 0.8, h, CELL - 0.8, 0, tint.setHex(zone.ceiling).multiplyScalar(0.7));
        }
        if (!wallEast(i, j) && corridor(i, j) && corridor(i + 1, j) && rnd(i, j, 380) < 0.2) {
          const h = 0.3 + rnd(i, j, 381) * 0.4;
          put(ceiling, x0 + CELL, WALL_H - h, cz, 0.32, h, CELL + 0.3, 0, tint.setHex(zone.wall).multiplyScalar(0.35));
        }
        if (!wallSouth(i, j) && corridor(i, j) && corridor(i, j + 1) && rnd(i, j, 382) < 0.2) {
          const h = 0.3 + rnd(i, j, 383) * 0.4;
          put(ceiling, cx, WALL_H - h, z0 + CELL, CELL + 0.3, h, 0.32, 0, tint.setHex(zone.wall).multiplyScalar(0.35));
        }
      }
    for (const m of [...floors.values(), rugs, puddles, trims, columns, ceiling]) {
      m.count = n.get(m) ?? 0;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  return {
    rebuild,
    setWet: (w) => {
      for (const mat of floorMats.values()) mat.roughness = mat.userData.dry.r + (0.06 - mat.userData.dry.r) * w;
    },
    setCeiling: (on) => {
      ceiling.visible = on;
    },
  };
}

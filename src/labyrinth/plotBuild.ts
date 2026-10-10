// What the architect builds: players' rooms (plots.ts) made from modular
// pieces. A room is 12 × 12 m (3×3 cells) with a doorway in the middle of each
// side and a cube floating in the middle (world.ts), so the pieces go in the
// 8 wall slots around it (two per side, either side of the door). Walls on a
// room's edge are random (maze.ts), so the style's wall panels only go where a
// real wall is; a piece in an open slot stands free like a half-wall.
// Door signs: every room on the land shows who owns it (or that it's free).
// Only the 4 nearest built rooms get their insides; signs for the 3×3 regions.
import * as THREE from "three";
import { CELL, WALL_H, roomOrigin, roomOf, wallEast, wallSouth } from "./maze";
import { PIECES, STYLES, districtOf, plotId, type Design, type PieceId, type Plot, type Plots } from "./plots";

const REGION = 7;
const HALF = CELL * 1.5; // 6 m
const IN = HALF - 0.17; // the inner face of the walls

// ------------------------------------------------------------------ helpers
type Ctx = { A: THREE.Color; B: THREE.Color; d: Design; pic: THREE.Texture | null; name: string; anim: ((t: number) => void)[] };

const std = (color: number | THREE.Color, rough = 0.6, metal = 0.1) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const glow = (color: THREE.Color | number, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });

function box(g: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  g.add(b);
  return b;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function neonText(text: string, color: string, w = 1024, h = 192, font = "italic 700 110px 'Times New Roman', serif") {
  return canvasTex(w, h, (g) => {
    g.font = font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    let size = parseInt(font.match(/(\d+)px/)?.[1] ?? "100");
    while (g.measureText(text).width > w - 60 && size > 20) {
      size -= 6;
      g.font = font.replace(/\d+px/, `${size}px`);
    }
    g.shadowColor = color;
    g.shadowBlur = 28;
    g.fillStyle = color;
    for (let k = 0; k < 3; k++) g.fillText(text, w / 2, h / 2);
    g.shadowBlur = 0;
    g.fillStyle = "#fff";
    g.globalAlpha = 0.55;
    g.fillText(text, w / 2, h / 2);
  });
}

function plane(g: THREE.Object3D, w: number, h: number, x: number, y: number, z: number, m: THREE.Material) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  p.position.set(x, y, z);
  g.add(p);
  return p;
}

const texMat = (t: THREE.Texture, transparent = true) => new THREE.MeshBasicMaterial({ map: t, transparent, toneMapped: false, depthWrite: !transparent });

// ------------------------------------------------------------------ the pieces
// Each builds in its slot's frame: the wall at z = 0, the room towards +z, x
// along the wall (−1.8 … 1.8). Returns how deep it stands (solid) or 0.
const PIECE: Record<PieceId, (g: THREE.Group, c: Ctx) => number> = {
  stage(g, c) {
    box(g, 3.6, 0.4, 1.7, 0, 0.2, 0.85, std(0x0c0c0c, 0.3, 0.4));
    box(g, 3.62, 0.05, 1.72, 0, 0.41, 0.85, glow(c.A, 1.2)).scale.y = 0.4;
    box(g, 0.03, 1.2, 0.03, 0.4, 1.0, 1.1, std(0x222222, 0.3, 0.8));
    const mic = box(g, 0.08, 0.14, 0.08, 0.4, 1.66, 1.1, glow(c.B));
    c.anim.push((t) => (mic.scale.y = 1 + Math.sin(t * 6) * 0.1));
    plane(g, 3.4, 2.2, 0, 1.75, 0.04, texMat(neonText(c.name, `#${c.A.getHexString()}`), true));
    return 1.7;
  },
  dj(g, c) {
    box(g, 2.2, 1.05, 0.8, 0, 0.525, 0.7, std(0x0a0a0a, 0.25, 0.5));
    box(g, 2.22, 0.06, 0.82, 0, 0.92, 0.7, glow(c.A));
    for (const x of [-0.5, 0.5]) {
      const deck = box(g, 0.5, 0.03, 0.5, x, 1.07, 0.7, glow(c.B, 0.8));
      c.anim.push((t) => (deck.rotation.y = t * 3 * Math.sign(x)));
    }
    for (const x of [-1.5, 1.5]) {
      box(g, 0.6, 1.6, 0.6, x, 0.8, 0.4, std(0x080808, 0.5));
      const cone = box(g, 0.4, 0.4, 0.02, x, 1.1, 0.71, glow(c.A, 0.6));
      c.anim.push((t) => cone.scale.setScalar(1 + Math.max(0, Math.sin(t * 8.2)) * 0.12));
    }
    return 1.1;
  },
  shelves(g, c) {
    const m = std(0x161616, 0.4, 0.6);
    box(g, 3.4, 2.4, 0.08, 0, 1.2, 0.05, m);
    const labels = c.d.products;
    for (let r = 0; r < 3; r++) {
      const y = 0.55 + r * 0.7;
      box(g, 3.4, 0.04, 0.5, 0, y, 0.3, m);
      box(g, 3.4, 0.02, 0.02, 0, y + 0.03, 0.55, glow(r % 2 ? c.B : c.A));
      for (let k = 0; k < 5; k++) box(g, 0.32, 0.3 + ((k * 7 + r) % 3) * 0.08, 0.3, -1.4 + k * 0.7, y + 0.2, 0.3, std(new THREE.Color().setHSL(((k + r * 2) * 0.13) % 1, 0.6, 0.45), 0.5));
      const p = labels[r];
      if (p) plane(g, 2.6, 0.22, 0, y - 0.13, 0.56, texMat(canvasTex(512, 44, (x) => {
        x.fillStyle = "rgba(0,0,0,0.75)";
        x.fillRect(0, 0, 512, 44);
        x.font = "italic 28px 'Times New Roman', serif";
        x.fillStyle = "#f4ead8";
        x.textBaseline = "middle";
        x.fillText(p.name, 14, 23, 380);
        x.textAlign = "right";
        x.fillStyle = "#ffd27a";
        x.fillText(p.price, 498, 23);
      }), false));
    }
    return 0.6;
  },
  screen(g, c) {
    box(g, 3.5, 2.0, 0.08, 0, 1.75, 0.05, std(0x050505, 0.2, 0.6));
    const tex = c.pic ?? neonText(c.name, `#${c.B.getHexString()}`, 1024, 576);
    const s = plane(g, 3.3, 1.86, 0, 1.75, 0.1, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    c.anim.push((t) => ((s.material as THREE.MeshBasicMaterial).color.setScalar(0.85 + Math.sin(t * 13) * 0.04 + (Math.sin(t * 0.7) > 0.97 ? -0.4 : 0))));
    return 0;
  },
  frames(g, c) {
    const pos = [[-1.15, 1.7, 0.9, 1.2], [0.15, 1.85, 1.1, 0.8], [1.25, 1.5, 0.7, 0.9]];
    pos.forEach(([x, y, w, h], k) => {
      box(g, w + 0.12, h + 0.12, 0.05, x, y, 0.04, std(k === 1 ? 0xb08a3a : 0x0b0b0b, 0.3, k === 1 ? 0.8 : 0.2));
      const art = c.pic && k === 0 ? c.pic : canvasTex(128, 128, (x2) => {
        const gr = x2.createLinearGradient(0, 0, 128, 128);
        gr.addColorStop(0, `#${c.A.getHexString()}`);
        gr.addColorStop(1, `#${c.B.getHexString()}`);
        x2.fillStyle = "#0a0a0a";
        x2.fillRect(0, 0, 128, 128);
        x2.fillStyle = gr;
        x2.globalAlpha = 0.8;
        if (k === 1) x2.fillRect(20, 20, 88, 88);
        else {
          x2.beginPath();
          x2.arc(64, 64, 40 - k * 6, 0, Math.PI * 2);
          x2.fill();
        }
      });
      plane(g, w, h, x, y, 0.075, new THREE.MeshBasicMaterial({ map: art, toneMapped: false }));
    });
    box(g, 3.4, 0.03, 0.03, 0, 2.75, 0.2, glow(c.A, 0.8));
    return 0;
  },
  counter(g, c) {
    box(g, 2.8, 1.05, 0.7, 0, 0.525, 0.9, std(0x101010, 0.3, 0.5));
    box(g, 2.84, 0.05, 0.74, 0, 1.07, 0.9, std(0xd8d0c0, 0.2, 0.3));
    box(g, 2.82, 0.04, 0.02, 0, 0.3, 1.26, glow(c.A));
    box(g, 0.4, 0.3, 0.3, 0.8, 1.25, 0.9, glow(c.B, 0.5));
    return 1.3;
  },
  bar(g, c) {
    box(g, 3.2, 1.1, 0.6, 0, 0.55, 1.0, std(0x0d0907, 0.3, 0.3));
    box(g, 3.24, 0.05, 0.64, 0, 1.12, 1.0, std(0x2a1f14, 0.15, 0.5));
    box(g, 3.2, 0.04, 0.02, 0, 0.08, 1.31, glow(c.A));
    box(g, 3.2, 0.04, 0.3, 0, 1.4, 0.15, std(0x111111, 0.4));
    for (let k = 0; k < 9; k++) {
      const b = box(g, 0.1, 0.32, 0.1, -1.4 + k * 0.35, 1.58, 0.15, glow(new THREE.Color().setHSL((k * 0.11) % 1, 0.8, 0.5), 0.7));
      c.anim.push((t) => ((b.material as THREE.MeshBasicMaterial).opacity = 1));
      void b;
    }
    return 1.35;
  },
  sofa(g, c) {
    const v = std(c.A.clone().multiplyScalar(0.35), 0.9, 0);
    box(g, 2.8, 0.45, 0.9, 0, 0.225, 0.55, v);
    box(g, 2.8, 0.7, 0.25, 0, 0.7, 0.15, v);
    box(g, 0.25, 0.65, 0.9, -1.4, 0.4, 0.55, v);
    box(g, 0.25, 0.65, 0.9, 1.4, 0.4, 0.55, v);
    box(g, 2.6, 0.02, 0.02, 0, 0.02, 1.05, glow(c.B, 0.8));
    return 1.05;
  },
  speakers(g, c) {
    for (const x of [-1.2, 1.2])
      for (let k = 0; k < 3; k++) {
        box(g, 1.0, 0.75, 0.7, x, 0.38 + k * 0.76, 0.4, std(0x0a0a0a, 0.6));
        const cone = box(g, 0.5, 0.5, 0.02, x, 0.38 + k * 0.76, 0.76, glow(k === 1 ? c.A : c.B, 0.5));
        c.anim.push((t) => cone.scale.setScalar(1 + Math.max(0, Math.sin(t * 8.2 + k)) * 0.1));
      }
    return 0.8;
  },
  arcade(g, c) {
    for (const x of [-1.0, 1.0]) {
      box(g, 0.8, 1.8, 0.75, x, 0.9, 0.45, std(0x0a0a14, 0.4, 0.3));
      const s = plane(g, 0.6, 0.5, x, 1.35, 0.83, glow(x < 0 ? c.A : c.B, 0.8));
      s.rotation.x = -0.25;
      c.anim.push((t) => (s.material as THREE.MeshBasicMaterial).color.copy(x < 0 ? c.A : c.B).multiplyScalar(0.6 + Math.abs(Math.sin(t * 3 + x)) * 0.5));
      box(g, 0.82, 0.12, 0.77, x, 1.83, 0.45, glow(x < 0 ? c.B : c.A, 0.9));
    }
    return 0.85;
  },
  plants(g, c) {
    for (const x of [-1.3, 1.3]) {
      box(g, 0.55, 0.6, 0.55, x, 0.3, 0.5, std(0x111111, 0.4, 0.4));
      box(g, 0.57, 0.04, 0.57, x, 0.6, 0.5, glow(c.A, 0.8));
      for (let k = 0; k < 6; k++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.1 + (k % 3) * 0.3, 4), std(0x0c2416, 0.8));
        leaf.position.set(x + Math.sin(k * 2.4) * 0.15, 1.2, 0.5 + Math.cos(k * 2.4) * 0.15);
        leaf.rotation.set(Math.sin(k) * 0.4, k, Math.cos(k * 1.7) * 0.4);
        g.add(leaf);
      }
    }
    return 0.8;
  },
  candles(g, c) {
    box(g, 2.4, 0.9, 0.7, 0, 0.45, 0.45, std(0x15100c, 0.8));
    for (let k = 0; k < 11; k++) {
      const x = -1.05 + (k % 6) * 0.42, z = 0.3 + Math.floor(k / 6) * 0.3, h = 0.15 + ((k * 5) % 4) * 0.08;
      box(g, 0.06, h, 0.06, x, 0.9 + h / 2, z, std(0xf2e8d5, 0.9));
      const f = box(g, 0.035, 0.07, 0.035, x, 0.95 + h, z, glow(0xffb14a, 1.4));
      c.anim.push((t) => (f.scale.y = 0.8 + Math.sin(t * 17 + k * 3) * 0.25));
    }
    box(g, 2.0, 0.03, 0.03, 0, 2.6, 0.06, glow(c.B, 0.6));
    return 0.85;
  },
  discoball() {
    return 0;
  },
  rug() {
    return 0;
  },
};

// ------------------------------------------------------------------ one room
type Slot = { side: 0 | 1 | 2 | 3; k: 0 | 2; wall: boolean };
// sides: 0 north (z−), 1 east (x+), 2 south (z+), 3 west (x−)
const SIDE_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

function slotsOf(I: number, J: number): Slot[] {
  const o = roomOrigin(I, J);
  const has = (side: number, k: number) =>
    side === 0 ? wallSouth(o.i + k, o.j - 1) : side === 2 ? wallSouth(o.i + k, o.j + 2) : side === 3 ? wallEast(o.i - 1, o.j + k) : wallEast(o.i + 2, o.j + k);
  const out: Slot[] = [];
  for (const side of [0, 2, 1, 3] as const) for (const k of [0, 2] as const) out.push({ side, k, wall: has(side, k) });
  // real walls first
  return out.sort((a, b) => Number(b.wall) - Number(a.wall));
}

/** a slot's frame: position on the wall line and rotation (local +z into the room) */
function slotFrame(s: Slot) {
  const a = (s.k - 1) * CELL; // −4 or +4 along the wall
  const p = [
    [s.side === 0 ? a : 0, -IN],
    [IN, a],
    [-a, IN],
    [-IN, -a],
  ][s.side];
  // north/south walls run along x, east/west along z
  const x = s.side === 0 ? a : s.side === 2 ? a : p[0];
  const z = s.side === 1 ? a : s.side === 3 ? a : p[1];
  return { x, z, ry: SIDE_ROT[s.side] };
}

/** where each wall piece goes for this design */
function layout(I: number, J: number, d: Design) {
  const slots = slotsOf(I, J);
  const wall = d.pieces.filter((p) => PIECES.find((x) => x.id === p)?.wall);
  // big furniture prefers the real walls of the north/south sides
  const order = ["stage", "dj", "bar", "counter", "shelves", "screen", "frames", "speakers", "arcade", "sofa", "candles", "plants"];
  wall.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return wall.map((piece, n) => ({ piece, slot: slots[n] })).filter((x) => x.slot);
}

/** solid boxes (world metres) of a built room: x0, z0, x1, z1 */
export function solidsOf(p: Plot) {
  if (!p.d) return [];
  const o = roomOrigin(p.I, p.J);
  const cx = (o.i + 1.5) * CELL, cz = (o.j + 1.5) * CELL;
  const out: [number, number, number, number][] = [];
  for (const { piece, slot } of layout(p.I, p.J, p.d)) {
    const depth = DEPTH[piece];
    if (!depth) continue;
    const f = slotFrame(slot);
    const hw = 1.8;
    // local box x∈[−hw,hw], z∈[0,depth] rotated by ry (multiples of 90°)
    const c = Math.round(Math.cos(f.ry)), s = Math.round(Math.sin(f.ry));
    const pts = [[-hw, 0], [hw, 0], [-hw, depth], [hw, depth]].map(([x, z]) => [f.x + x * c + z * s, f.z - x * s + z * c]);
    const xs = pts.map((q) => q[0]), zs = pts.map((q) => q[1]);
    out.push([cx + Math.min(...xs), cz + Math.min(...zs), cx + Math.max(...xs), cz + Math.max(...zs)]);
  }
  return out;
}
const DEPTH: Record<PieceId, number> = { stage: 1.7, dj: 1.1, shelves: 0.6, screen: 0, frames: 0, counter: 1.3, bar: 1.35, sofa: 1.05, speakers: 0.8, arcade: 0.85, plants: 0.8, candles: 0.85, discoball: 0, rug: 0 };

function buildRoom(p: Plot, pic: THREE.Texture | null) {
  const d = p.d!;
  const st = STYLES[d.style];
  const g = new THREE.Group();
  const anim: ((t: number) => void)[] = [];
  const c: Ctx = { A: new THREE.Color(d.colors[0]), B: new THREE.Color(d.colors[1]), d, pic, name: d.name, anim };

  // the shell: floor, ceiling, wall panels where real walls are, neon lines
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 - 0.3, HALF * 2 - 0.3), std(st.floor, st.rough, st.metal));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.025;
  g.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 - 0.3, HALF * 2 - 0.3), std(st.ceil, 0.9));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = WALL_H - 0.03;
  g.add(ceil);
  const wallMat = std(st.wall, Math.max(0.3, st.rough), st.metal * 0.5);
  // a soft glow in the style's light so the room reads even with one lamp
  wallMat.emissive.setHex(st.light);
  wallMat.emissiveIntensity = 0.05;
  const fm = floor.material as THREE.MeshStandardMaterial;
  fm.emissive.copy(c.A);
  fm.emissiveIntensity = 0.03;
  // a glowing ceiling frame in the first colour
  for (const [w, d, x, z] of [[HALF * 2 - 1, 0.06, 0, -HALF + 0.6], [HALF * 2 - 1, 0.06, 0, HALF - 0.6], [0.06, HALF * 2 - 1, -HALF + 0.6, 0], [0.06, HALF * 2 - 1, HALF - 0.6, 0]] as const)
    box(g, w, 0.04, d, x, WALL_H - 0.08, z, glow(c.A, 0.9));
  const lineA = glow(c.A, 1.1), lineB = glow(c.B, 0.9);
  for (const s of slotsOf(p.I, p.J)) {
    if (!s.wall) continue;
    const f = slotFrame(s);
    const w = new THREE.Group();
    w.position.set(f.x, 0, f.z);
    w.rotation.y = f.ry;
    plane(w, CELL, WALL_H - 0.05, 0, WALL_H / 2, 0.01, wallMat);
    box(w, CELL, 0.04, 0.04, 0, WALL_H - 0.12, 0.04, lineA);
    box(w, CELL, 0.03, 0.03, 0, 0.06, 0.04, lineB);
    g.add(w);
  }

  // the pieces
  for (const { piece, slot } of layout(p.I, p.J, d)) {
    const f = slotFrame(slot);
    const s = new THREE.Group();
    s.position.set(f.x, 0, f.z);
    s.rotation.y = f.ry;
    PIECE[piece](s, c);
    g.add(s);
  }
  if (d.pieces.includes("rug")) {
    const rug = new THREE.Mesh(new THREE.RingGeometry(1.4, 3.2, 48), glow(c.A, 0.35));
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.035;
    g.add(rug);
    const inner = new THREE.Mesh(new THREE.RingGeometry(3.1, 3.2, 48), glow(c.B, 1));
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.04;
    g.add(inner);
  }
  if (d.pieces.includes("discoball")) {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 1, flatShading: true }));
    ball.position.set(0, WALL_H - 0.75, 0);
    const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44, 1), new THREE.MeshBasicMaterial({ color: c.B, wireframe: true, transparent: true, opacity: 0.5, toneMapped: false }));
    ball.add(spark);
    g.add(ball);
    box(g, 0.02, 0.5, 0.02, 0, WALL_H - 0.28, 0, std(0x333333));
    anim.push((t) => (ball.rotation.y = t * 0.6));
  }
  // the name in neon above the north doorway, inside
  const nm = plane(g, 3.6, 0.68, 0, 2.95, -IN + 0.05, texMat(neonText(d.name, d.colors[0])));
  anim.push((t) => ((nm.material as THREE.MeshBasicMaterial).opacity = Math.sin(t * 0.9) > 0.985 ? 0.35 : 1));
  return { group: g, anim };
}

// ------------------------------------------------------------------ door signs
function doorTex(lines: [string, string, string], color: string) {
  return canvasTex(768, 160, (g) => {
    g.fillStyle = "rgba(6,6,8,0.92)";
    g.fillRect(0, 0, 768, 160);
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.strokeRect(5, 5, 758, 150);
    g.textAlign = "center";
    g.fillStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 14;
    g.font = "italic 700 58px 'Times New Roman', serif";
    g.fillText(lines[0], 384, 62, 730);
    g.shadowBlur = 0;
    g.fillStyle = "#e9e4da";
    g.font = "italic 30px 'Times New Roman', serif";
    g.fillText(lines[1], 384, 104, 730);
    g.fillStyle = "#a9a293";
    g.font = "24px ui-monospace, monospace";
    g.fillText(lines[2], 384, 140, 730);
  });
}

/** 4 outside door signs (one per doorway), each facing out of the room */
function doorSigns(tex: THREE.Texture) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const geo = new THREE.PlaneGeometry(3.2, 0.66);
  const at: [number, number, number][] = [[0, -HALF - 0.02, Math.PI], [HALF + 0.02, 0, Math.PI / 2], [0, HALF + 0.02, 0], [-HALF - 0.02, 0, -Math.PI / 2]];
  for (const [x, z, ry] of at) {
    const s = new THREE.Mesh(geo, m);
    s.position.set(x, WALL_H - 0.45, z);
    s.rotation.y = ry;
    g.add(s);
  }
  return g;
}

// ------------------------------------------------------------------ the layer
export function createPlotLayer(plots: Plots) {
  const group = new THREE.Group();
  const rooms = new Map<string, { key: string; group: THREE.Group; anim: ((t: number) => void)[] }>();
  const signs = new Map<string, { key: string; group: THREE.Group }>();
  const picCache = new Map<string, THREE.Texture>();
  let lastCell = "";
  let dirty = true;
  plots.onChange(() => (dirty = true));

  // collision for the furniture (cached per room version)
  const solidCache = new Map<string, { ver: number; boxes: [number, number, number, number][] }>();
  const solidAt = (x: number, z: number, r: number) => {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    const room = roomOf(i, j);
    if (!room) return false;
    const p = plots.at(room.I, room.J);
    if (!p?.d) return false;
    let s = solidCache.get(p.id);
    if (!s || s.ver !== p.ver) solidCache.set(p.id, (s = { ver: p.ver, boxes: solidsOf(p) }));
    for (const [x0, z0, x1, z1] of s.boxes) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return true;
    return false;
  };

  const pictureTex = (p: Plot) => {
    const img = plots.picture(p);
    if (!img) return null;
    let t = picCache.get(img.slice(-64));
    if (!t) {
      const im = new Image();
      const tex = new THREE.Texture(im);
      tex.colorSpace = THREE.SRGBColorSpace;
      im.onload = () => (tex.needsUpdate = true);
      im.src = img;
      picCache.set(img.slice(-64), (t = tex));
    }
    return t;
  };

  const dispose = (g: THREE.Object3D) =>
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.MeshBasicMaterial | undefined;
      if (mat) {
        if (mat.map && ![...picCache.values()].includes(mat.map)) mat.map.dispose();
        mat.dispose();
      }
    });

  function refresh(px: number, pz: number) {
    const I0 = Math.floor(px / CELL / REGION), J0 = Math.floor(pz / CELL / REGION);
    const near: { I: number; J: number; d: number }[] = [];
    const wantSigns = new Set<string>();
    for (let I = I0 - 1; I <= I0 + 1; I++)
      for (let J = J0 - 1; J <= J0 + 1; J++) {
        const dist = districtOf(I, J);
        if (!dist) continue;
        const id = plotId(I, J);
        const p = plots.get(id);
        const o = roomOrigin(I, J);
        const cx = (o.i + 1.5) * CELL, cz = (o.j + 1.5) * CELL;
        // the sign on the doors
        const lines: [string, string, string] = !p
          ? ["free room", "claim it · it's free", dist.name]
          : !p.d
            ? [`@${p.nick}`, "claimed · being built", dist.name]
            : [p.d.name, `by @${p.nick}${plots.instagram(p) ? ` · ig @${plots.instagram(p)}` : ""}`, `♥ ${plots.loves(id)} · ${plots.visits(id)} visits${p.opened ? "" : " · opening soon"}`];
        const color = p?.d ? p.d.colors[0] : p ? "#c8a0ff" : "#ffd27a";
        const skey = lines.join("|") + color;
        wantSigns.add(id);
        const old = signs.get(id);
        if (!old || old.key !== skey) {
          if (old) (group.remove(old.group), dispose(old.group));
          const sg = doorSigns(doorTex(lines, color));
          sg.position.set(cx, 0, cz);
          group.add(sg);
          signs.set(id, { key: skey, group: sg });
        }
        if (p?.d) near.push({ I, J, d: Math.hypot(cx - px, cz - pz) });
      }
    for (const [id, s] of signs) if (!wantSigns.has(id)) (group.remove(s.group), dispose(s.group), signs.delete(id));

    near.sort((a, b) => a.d - b.d);
    const want = new Set<string>();
    for (const { I, J } of near.slice(0, 4)) {
      const p = plots.at(I, J)!;
      const pic = pictureTex(p);
      const key = `${p.ver}:${pic ? 1 : 0}`;
      want.add(p.id);
      const old = rooms.get(p.id);
      if (old?.key === key) continue;
      if (old) (group.remove(old.group), dispose(old.group));
      const b = buildRoom(p, pic);
      const o = roomOrigin(I, J);
      b.group.position.set((o.i + 1.5) * CELL, 0, (o.j + 1.5) * CELL);
      group.add(b.group);
      rooms.set(p.id, { key, group: b.group, anim: b.anim });
    }
    for (const [id, r] of rooms) if (!want.has(id)) (group.remove(r.group), dispose(r.group), rooms.delete(id));
  }

  return {
    group,
    solidAt,
    /** the light colour of a built room (art.ts skips its installation) */
    builtLight(I: number, J: number) {
      const p = plots.at(I, J);
      return p?.d ? new THREE.Color(STYLES[p.d.style].light).lerp(new THREE.Color(p.d.colors[0]), 0.35).getHex() : null;
    },
    update(px: number, pz: number, t: number) {
      const cell = `${Math.floor(px / CELL)}:${Math.floor(pz / CELL)}`;
      if (dirty || cell !== lastCell) {
        dirty = false;
        lastCell = cell;
        refresh(px, pz);
      }
      for (const r of rooms.values()) {
        const d = Math.hypot(r.group.position.x - px, r.group.position.z - pz);
        if (d < 30) r.anim.forEach((f) => f(t));
      }
    },
  };
}

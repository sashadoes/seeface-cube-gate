// What other players look like: ghostly demonic creatures in different styles.
// Each player's demon is picked from their id, so everyone sees the same
// creature for the same person. Drawn on canvas: translucent, wispy at the
// bottom, with glowing eyes.
import * as THREE from "three";

export type DemonKind = "imp" | "wraith" | "goat" | "eyes" | "stag" | "slender" | "crown" | "moth";

export const DEMONS: Record<DemonKind, { name: string; body: string; eye: string; aura: number }> = {
  imp: { name: "the imp", body: "180,40,30", eye: "#ffd23c", aura: 0xff5a3c },
  wraith: { name: "the wraith", body: "150,170,200", eye: "#7cf2ff", aura: 0x7ccfff },
  goat: { name: "the goat", body: "90,70,60", eye: "#ff2a1a", aura: 0xff4a2a },
  eyes: { name: "the watcher", body: "110,40,140", eye: "#ffffff", aura: 0xc05cff },
  stag: { name: "the stag", body: "60,80,60", eye: "#b8ff3c", aura: 0x9cff5a },
  slender: { name: "the long one", body: "20,20,24", eye: "#ff1a1a", aura: 0xff2a2a },
  crown: { name: "the crowned", body: "210,200,180", eye: "#ff9a1a", aura: 0xffc06a },
  moth: { name: "the moth", body: "200,180,140", eye: "#3cf0ff", aura: 0xffe2a0 },
};

const KINDS = Object.keys(DEMONS) as DemonKind[];

export function demonOf(id: string): DemonKind {
  let h = 2166136261;
  for (let k = 0; k < id.length; k++) h = Math.imul(h ^ id.charCodeAt(k), 16777619);
  return KINDS[(h >>> 0) % KINDS.length];
}

const W = 128, H = 400;

function eyes(g: CanvasRenderingContext2D, colour: string, pts: [number, number, number][]) {
  g.save();
  g.filter = "none";
  g.fillStyle = colour;
  g.shadowColor = colour;
  g.shadowBlur = 14;
  for (const [x, y, r] of pts) {
    g.beginPath();
    g.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** A tapering wispy body from the shoulders down. */
function shroud(g: CanvasRenderingContext2D, top: number, wTop: number, wMid: number, body: string) {
  const grad = g.createLinearGradient(0, top, 0, H);
  grad.addColorStop(0, `rgba(${body},0.85)`);
  grad.addColorStop(0.6, `rgba(${body},0.5)`);
  grad.addColorStop(1, `rgba(${body},0)`);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(W / 2 - wTop, top);
  // swells, then thins into wisps that trail off and sway to one side
  g.bezierCurveTo(W / 2 - wMid * 1.1, 190, W / 2 - 6, 300, W / 2 - 14, H);
  for (let k = 0; k < 5; k++) {
    const x = W / 2 - 14 + k * 7;
    g.quadraticCurveTo(x + 3, H - 70 - (k % 2) * 40, x + 7, H - (k % 2 ? 0 : 25));
  }
  g.bezierCurveTo(W / 2 + 6, 300, W / 2 + wMid * 1.1, 190, W / 2 + wTop, top);
  g.closePath();
  g.fill();
}

function head(g: CanvasRenderingContext2D, y: number, rx: number, ry: number, body: string) {
  g.fillStyle = `rgba(${body},0.92)`;
  g.beginPath();
  g.ellipse(W / 2, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function horns(g: CanvasRenderingContext2D, y: number, spread: number, height: number, curl: number, body: string) {
  g.fillStyle = `rgba(${body},0.95)`;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(W / 2 + s * 8, y);
    g.quadraticCurveTo(W / 2 + s * spread, y - height * 0.4, W / 2 + s * (spread - curl), y - height);
    g.quadraticCurveTo(W / 2 + s * (spread * 0.6), y - height * 0.45, W / 2 + s * 16, y + 4);
    g.closePath();
    g.fill();
  }
}

const DRAW: Record<DemonKind, (g: CanvasRenderingContext2D) => void> = {
  imp(g) {
    const b = DEMONS.imp.body;
    shroud(g, 90, 26, 34, b);
    head(g, 74, 22, 24, b);
    horns(g, 62, 30, 42, -6, b);
    // grin
    g.strokeStyle = "rgba(255,210,60,0.8)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(W / 2, 80, 11, 0.2, Math.PI - 0.2);
    g.stroke();
    eyes(g, DEMONS.imp.eye, [[W / 2 - 9, 70, 4], [W / 2 + 9, 70, 4]]);
  },
  wraith(g) {
    const b = DEMONS.wraith.body;
    shroud(g, 60, 30, 46, b);
    // pointed hood, black inside
    g.fillStyle = `rgba(${b},0.9)`;
    g.beginPath();
    g.moveTo(W / 2, 10);
    g.quadraticCurveTo(W / 2 + 40, 50, W / 2 + 32, 110);
    g.lineTo(W / 2 - 32, 110);
    g.quadraticCurveTo(W / 2 - 40, 50, W / 2, 10);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.95)";
    g.beginPath();
    g.ellipse(W / 2, 74, 17, 26, 0, 0, Math.PI * 2);
    g.fill();
    eyes(g, DEMONS.wraith.eye, [[W / 2 - 7, 70, 3], [W / 2 + 7, 70, 3]]);
  },
  goat(g) {
    const b = DEMONS.goat.body;
    shroud(g, 100, 34, 40, b);
    // long goat skull
    g.fillStyle = `rgba(${b},0.95)`;
    g.beginPath();
    g.moveTo(W / 2 - 20, 56);
    g.quadraticCurveTo(W / 2, 40, W / 2 + 20, 56);
    g.lineTo(W / 2 + 9, 112);
    g.lineTo(W / 2 - 9, 112);
    g.closePath();
    g.fill();
    // big curled ram horns
    g.strokeStyle = `rgba(${b},1)`;
    g.lineWidth = 9;
    g.lineCap = "round";
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(W / 2 + s * 12, 52);
      g.bezierCurveTo(W / 2 + s * 56, 20, W / 2 + s * 62, 90, W / 2 + s * 34, 82);
      g.stroke();
    }
    eyes(g, DEMONS.goat.eye, [[W / 2 - 9, 68, 3.5], [W / 2 + 9, 68, 3.5]]);
  },
  eyes(g) {
    const b = DEMONS.eyes.body;
    shroud(g, 70, 36, 44, b);
    head(g, 64, 34, 40, b);
    // eyes everywhere, down the body too
    const pts: [number, number, number][] = [];
    for (let k = 0; k < 13; k++) pts.push([W / 2 + Math.sin(k * 2.4) * (12 + k * 1.5), 44 + k * 14, 2.5 + (k % 3)]);
    eyes(g, DEMONS.eyes.eye, pts);
  },
  stag(g) {
    const b = DEMONS.stag.body;
    shroud(g, 110, 22, 30, b);
    head(g, 92, 15, 26, b);
    // branching antlers
    g.strokeStyle = `rgba(${b},1)`;
    g.lineWidth = 4;
    g.lineCap = "round";
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(W / 2 + s * 8, 72);
      g.lineTo(W / 2 + s * 30, 30);
      g.lineTo(W / 2 + s * 40, 4);
      g.moveTo(W / 2 + s * 22, 46);
      g.lineTo(W / 2 + s * 50, 34);
      g.moveTo(W / 2 + s * 30, 30);
      g.lineTo(W / 2 + s * 20, 6);
      g.moveTo(W / 2 + s * 36, 16);
      g.lineTo(W / 2 + s * 58, 12);
      g.stroke();
    }
    eyes(g, DEMONS.stag.eye, [[W / 2 - 7, 88, 3], [W / 2 + 7, 88, 3]]);
  },
  slender(g) {
    const b = DEMONS.slender.body;
    // very tall and thin, long arms to the knees
    shroud(g, 70, 12, 16, b);
    head(g, 46, 12, 18, b);
    g.strokeStyle = `rgba(${b},0.9)`;
    g.lineWidth = 4;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(W / 2 + s * 10, 76);
      g.quadraticCurveTo(W / 2 + s * 34, 180, W / 2 + s * 30, 290);
      g.stroke();
      // claws
      for (let c = -1; c <= 1; c++) {
        g.beginPath();
        g.moveTo(W / 2 + s * 30, 290);
        g.lineTo(W / 2 + s * (30 + c * 6), 312);
        g.stroke();
      }
    }
    eyes(g, DEMONS.slender.eye, [[W / 2 - 5, 44, 2.5], [W / 2 + 5, 44, 2.5]]);
  },
  crown(g) {
    const b = DEMONS.crown.body;
    shroud(g, 92, 30, 38, b);
    // skull
    head(g, 76, 20, 23, b);
    g.fillStyle = "rgba(0,0,0,0.85)";
    g.fillRect(W / 2 - 3, 82, 6, 8);
    // jagged crown
    g.fillStyle = "rgba(255,190,80,0.95)";
    g.shadowColor = "rgba(255,180,60,0.9)";
    g.shadowBlur = 10;
    g.beginPath();
    g.moveTo(W / 2 - 24, 58);
    for (let k = 0; k <= 6; k++) g.lineTo(W / 2 - 24 + k * 8, k % 2 ? 58 : 30 + (k === 3 ? -8 : 0));
    g.lineTo(W / 2 + 24, 58);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    eyes(g, DEMONS.crown.eye, [[W / 2 - 8, 74, 4], [W / 2 + 8, 74, 4]]);
  },
  moth(g) {
    const b = DEMONS.moth.body;
    // big wings behind
    for (const s of [-1, 1]) {
      const wg = g.createRadialGradient(W / 2 + s * 30, 130, 4, W / 2 + s * 30, 130, 60);
      wg.addColorStop(0, `rgba(${b},0.7)`);
      wg.addColorStop(1, `rgba(${b},0.05)`);
      g.fillStyle = wg;
      g.beginPath();
      g.ellipse(W / 2 + s * 34, 120, 30, 70, s * 0.35, 0, Math.PI * 2);
      g.fill();
      // eye spots on the wings
      eyes(g, "rgba(60,240,255,0.7)", [[W / 2 + s * 38, 112, 7]]);
    }
    shroud(g, 96, 16, 22, b);
    head(g, 80, 14, 16, b);
    // feathered antennae
    g.strokeStyle = `rgba(${b},0.9)`;
    g.lineWidth = 2;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(W / 2 + s * 4, 66);
      g.quadraticCurveTo(W / 2 + s * 20, 30, W / 2 + s * 34, 28);
      g.stroke();
    }
    eyes(g, DEMONS.moth.eye, [[W / 2 - 6, 80, 4], [W / 2 + 6, 80, 4]]);
  },
};

const cache = new Map<DemonKind, THREE.CanvasTexture>();

export function demonTexture(kind: DemonKind) {
  let t = cache.get(kind);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  // the body is soft and ghostly; the eyes stay sharp (eyes() resets the blur)
  g.filter = "blur(1.5px)";
  DRAW[kind](g);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(kind, t);
  return t;
}

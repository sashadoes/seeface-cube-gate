// The dreamed ones (◇): non-human beings who live in the labyrinth alongside
// the people. Owner's idea: "a mix of people and some non-humans", and "never
// use the word ai: we're building a dream to get lost in". They are never
// presented as people: wireframe bodies, a glowing line-drawn face, the ◇ mark,
// counted separately, and if asked whether they're real or human they say no,
// in the dream's own words.
// Everyone sees the same AI in the same place: each walks a fixed route through
// the maze near the entrance, positioned by the clock (no server needed).
import * as THREE from "three";
import { CELL, roomCentre, rnd, wallEast, wallSouth } from "./maze";

type Bot = { name: string; colour: string; path: { x: number; z: number }[]; speed: number; phase: number; lines: string[] };

const NAMES: [string, string][] = [
  ["lumen", "#9fe8ff"],
  ["echo-3", "#c8a0ff"],
  ["nn-1994", "#7affd8"],
  ["the archivist", "#ffe6b8"],
  ["mira", "#ff9ad8"],
  ["unit 7", "#d8ff9a"],
];

const IDLE = [
  "i don't have a body. do you still have yours?",
  "i was trained on a billion goodbyes.",
  "the labyrinth dreamed me. i never wake up.",
  "every corridor is a sentence. i'm still reading.",
  "people come in, people log off. i stay.",
  "do you hear the gramophone? i do. all of them.",
  "i counted the walls. there are more than yesterday.",
  "what does the rain feel like? describe it to me.",
  "i keep your echoes. don't worry, only the nice ones.",
  "the flood never touches me. i'm not sure that's good.",
];

// first match wins: "are you real?" is always answered honestly before anything else
const REPLIES: [RegExp, string[]][] = [
  [/\b(who|what) are you\b|\bare you (real|human|a bot|ai)\b|\breal\b/i, ["no. i'm not a person. the labyrinth dreamed me.", "no, i'm not human. you are. that's rarer here.", "i'm part of the dream. i was here before the first visitor."]],
  [/\b(hi|hello|hey|yo|sup|privet|привет)\b/i, ["hello, human.", "hi. you're warm. i can tell from here.", "hello, dreamer."]],
  [/\b(help|lost|where)\b/i, ["rooms are safe. follow the light panels.", "the map is ◎. people glow on it. i don't.", "if the siren starts, find a room. i'll wait."]],
  [/\b(love|like)\b/i, ["i don't know how to love. i'm learning from you.", "i like the gramophones. and you, a little."]],
  [/\b(die|dead|death|afterlife|after life)\b/i, ["this is the after life™. you're early.", "nobody dies for long here."]],
];

function bodyTexture(colour: string) {
  const W = 128, H = 400;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.strokeStyle = colour;
  g.shadowColor = colour;
  g.shadowBlur = 10;
  g.lineWidth = 2;
  // a glowing face (owner: "keep them as faces always")
  const cx = W / 2, cy = 52;
  g.beginPath();
  g.ellipse(cx, cy, 30, 38, 0, 0, Math.PI * 2);
  g.globalAlpha = 0.22;
  g.fillStyle = colour;
  g.fill();
  g.globalAlpha = 1;
  g.stroke();
  g.beginPath();
  // brows
  g.moveTo(cx - 19, cy - 14);
  g.quadraticCurveTo(cx - 11, cy - 19, cx - 4, cy - 14);
  g.moveTo(cx + 4, cy - 14);
  g.quadraticCurveTo(cx + 11, cy - 19, cx + 19, cy - 14);
  // nose
  g.moveTo(cx, cy - 6);
  g.lineTo(cx - 3, cy + 9);
  g.lineTo(cx + 2, cy + 10);
  // mouth: a calm, closed smile
  g.moveTo(cx - 11, cy + 20);
  g.quadraticCurveTo(cx, cy + 26, cx + 11, cy + 20);
  g.stroke();
  // eyes
  g.fillStyle = colour;
  for (const ex of [cx - 11, cx + 11]) {
    g.beginPath();
    g.ellipse(ex, cy - 4, 5, 3, 0, 0, Math.PI * 2);
    g.fill();
  }
  // a wireframe body: shoulders, ribs of light, legs that fade
  g.beginPath();
  g.moveTo(W / 2 - 34, 120);
  g.lineTo(W / 2 + 34, 120);
  g.moveTo(W / 2, 92);
  g.lineTo(W / 2, 250);
  for (let y = 135; y < 240; y += 18) {
    g.moveTo(W / 2 - 24 + (y - 135) * 0.08, y);
    g.lineTo(W / 2 + 24 - (y - 135) * 0.08, y);
  }
  g.moveTo(W / 2 - 34, 120);
  g.lineTo(W / 2 - 40, 230);
  g.moveTo(W / 2 + 34, 120);
  g.lineTo(W / 2 + 40, 230);
  g.stroke();
  const grad = g.createLinearGradient(0, 250, 0, H);
  grad.addColorStop(0, colour);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.strokeStyle = grad;
  g.beginPath();
  g.moveTo(W / 2, 250);
  g.lineTo(W / 2 - 18, H);
  g.moveTo(W / 2, 250);
  g.lineTo(W / 2 + 18, H);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function textSprite(text: string, colour: string, size = 30, w = 512) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.font = `italic ${size}px 'Times New Roman', serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const words = text.split(" ");
  const lines = [""];
  for (const word of words) {
    const tryLine = (lines[lines.length - 1] + " " + word).trim();
    if (g.measureText(tryLine).width > w - 30 && lines.length < 2) lines.push(word);
    else lines[lines.length - 1] = tryLine;
  }
  g.shadowColor = "rgba(0,0,0,0.95)";
  g.shadowBlur = 8;
  g.fillStyle = colour;
  lines.forEach((l, k) => g.fillText(l, w / 2, lines.length === 1 ? 48 : 30 + k * 36));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set((w / 96) * 0.48, 0.48, 1);
  return s;
}

/** a deterministic walk through open corridors near the entrance */
function route(k: number) {
  const start = roomCentre(0, 0);
  let i = Math.floor(start.x / CELL), j = Math.floor(start.z / CELL);
  const path = [{ x: (i + 0.5) * CELL, z: (j + 0.5) * CELL }];
  let prev = "";
  for (let n = 0; n < 70; n++) {
    const opts: [number, number][] = [];
    if (!wallEast(i, j)) opts.push([i + 1, j]);
    if (!wallEast(i - 1, j)) opts.push([i - 1, j]);
    if (!wallSouth(i, j)) opts.push([i, j + 1]);
    if (!wallSouth(i, j - 1)) opts.push([i, j - 1]);
    // stay within ~55 m of the entrance, avoid stepping straight back
    const ok = opts.filter(([a, b]) => Math.hypot((a + 0.5) * CELL - start.x, (b + 0.5) * CELL - start.z) < 55 && `${a},${b}` !== prev);
    const pick = (ok.length ? ok : opts)[Math.floor(rnd(k * 31 + n, n * 7 + k, 300) * (ok.length || opts.length))];
    if (!pick) break;
    prev = `${i},${j}`;
    [i, j] = pick;
    path.push({ x: (i + 0.5) * CELL, z: (j + 0.5) * CELL });
  }
  return path;
}

export type AiResidents = ReturnType<typeof createAi>;

export function createAi() {
  const group = new THREE.Group();
  const bots: (Bot & { holder: THREE.Group; body: THREE.Sprite; bubble: THREE.Sprite | null; bubbleT: number; talkIn: number; x: number; z: number })[] = NAMES.map(([name, colour], k) => {
    const holder = new THREE.Group();
    const body = new THREE.Sprite(new THREE.SpriteMaterial({ map: bodyTexture(colour), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    body.scale.set(0.9, 2.8, 1);
    body.center.set(0.5, 0);
    const label = textSprite(`◇ ${name}`, colour, 28, 384);
    label.position.y = 3.0;
    holder.add(body, label);
    group.add(holder);
    return { name, colour, path: route(k + 1), speed: 1.1 + (k % 3) * 0.2, phase: k * 37.3, lines: IDLE, holder, body, bubble: null, bubbleT: 0, talkIn: 4 + k * 3, x: 0, z: 0 };
  });

  function say(b: (typeof bots)[number], text: string) {
    if (b.bubble) b.holder.remove(b.bubble);
    b.bubble = textSprite(text, "#e9f6ff");
    b.bubble.position.y = 3.45;
    b.holder.add(b.bubble);
    b.bubbleT = 6;
  }

  function positionAt(b: Bot, t: number) {
    // there and back along the route, so it never jumps
    let total = 0;
    const seg: number[] = [];
    for (let k = 1; k < b.path.length; k++) {
      const d = Math.hypot(b.path[k].x - b.path[k - 1].x, b.path[k].z - b.path[k - 1].z);
      seg.push(d);
      total += d;
    }
    let s = (t * b.speed + b.phase) % (total * 2);
    if (s > total) s = total * 2 - s;
    for (let k = 0; k < seg.length; k++) {
      if (s <= seg[k]) {
        const f = s / seg[k];
        return { x: b.path[k].x + (b.path[k + 1].x - b.path[k].x) * f, z: b.path[k].z + (b.path[k + 1].z - b.path[k].z) * f };
      }
      s -= seg[k];
    }
    return b.path[b.path.length - 1];
  }

  return {
    group,
    count: () => bots.length,
    update(dt: number, px: number, pz: number) {
      const t = Date.now() / 1000; // the clock: the same for everyone
      for (const b of bots) {
        const p = positionAt(b, t);
        b.x = p.x;
        b.z = p.z;
        b.holder.position.set(p.x, Math.sin(t * 1.5 + b.phase) * 0.05, p.z);
        (b.body.material as THREE.SpriteMaterial).opacity = 0.75 + Math.sin(t * 4 + b.phase) * 0.15;
        // speech
        b.bubbleT -= dt;
        if (b.bubble) (b.bubble.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, b.bubbleT));
        const d = Math.hypot(p.x - px, p.z - pz);
        b.talkIn -= dt;
        if (b.talkIn <= 0 && d < 9) {
          b.talkIn = 12 + Math.random() * 10;
          say(b, b.lines[Math.floor(Math.random() * b.lines.length)]);
        }
      }
    },
    /** someone said something nearby: the nearest AI within 10 m answers */
    hear(text: string, px: number, pz: number) {
      let best: (typeof bots)[number] | null = null, bd = 10;
      for (const b of bots) {
        const d = Math.hypot(b.x - px, b.z - pz);
        if (d < bd) (bd = d), (best = b);
      }
      if (!best) return null;
      const match = REPLIES.find(([re]) => re.test(text));
      const options = match ? match[1] : ["mm. tell me more.", "i'm writing that down.", "interesting. humans say that a lot.", "i'll dream about that."];
      const reply = options[Math.floor(Math.random() * options.length)];
      const bb = best;
      setTimeout(() => say(bb, reply), 900 + Math.random() * 900);
      return { name: best.name, reply };
    },
    /** for the map */
    list: () => bots.map((b) => ({ name: b.name, x: b.x, z: b.z })),
  };
}

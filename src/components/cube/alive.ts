// "Alive" layer: makes the cube behave like a creature and the room react to
// how the visitor plays. Runs one requestAnimationFrame loop that reads the
// cube's rotation engine (viewport) and the pointer, then drives:
//
//   cube  – breathing, floating, a heartbeat glow, leaning toward / away from
//           the pointer (curious or shy personality), twitches when ignored
//   walls – tunnel speed + direction follow the spin, colours follow the tilt,
//           everything dims and slows when the visitor goes idle, violent spins
//           sometimes swap in a newly generated image
//
// How input maps onto the room is randomised per visit, so it never feels the same twice.
import { randomIntFromInterval as rnd } from "../helper.js";
import { memory } from "./memory";
import { getRank, isComplete } from "./rewards";
import { getTrance, MAX_TRANCE } from "./trance";

// Cube colour per rank (rebirths): cyan → gold → blood → violet → white → venom, then cycles.
const RANK_COLORS: [number, number, number][] = [
  [140, 220, 255],
  [255, 214, 90],
  [255, 40, 40],
  [180, 90, 255],
  [255, 255, 255],
  [0, 255, 170],
];

type Viewport = {
  torqueX: number;
  torqueY: number;
  positionX: number;
  positionY: number;
  down: boolean;
};

const CHESS = "/imgs/seeface-chess-mixed.png";
const BASE_SCALE = 0.8; // .viewport's own scale in CubeStyle.scss
const BASE_CHESS = 160; // px, matches --chess-size
const FLOW = 0.7; // overall tunnel speed (owner: 30% slower)

const chance = (p: number) => Math.random() < p;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

let vp: Viewport;
let cube: HTMLElement | null;
let walls: HTMLElement[] = [];
let room: HTMLElement | null;
let fog: HTMLElement | null;

// state
let energy = 0; // 0..1 how hard the visitor is playing right now
let calm = 1; // 0..1 slow-moving average, used for mood
let lastActive = performance.now();
let pointerX = 0.5;
let pointerY = 0.5;
let wallOffset = 0;
let wallDir = 1;
let speedMul = 1; // set by mystery events
let lastTwitch = 0;
let swapping = false;
let t0 = performance.now();

// Per-visit personality: randomised once, sometimes flips.
const persona = {
  // lean toward the pointer, or shy away; it gets colder the more often you return
  curious: chance(memory.visits > 2 ? 0.25 : 0.5),
  hueAxis: chance(0.5) ? "x" : "y", // which rotation axis tints the room
  hueRange: rnd(40, 160), // how far colours can drift
  invertSpin: chance(0.3), // tunnel flows against the spin instead of with it
  breath: 2600 + rnd(0, 2200), // ms per breath
};

function seedImage() {
  return `https://picsum.photos/seed/${Math.random().toString(36).slice(2, 9)}/600`;
}

function setWallImage(url: string) {
  walls.forEach((w) => (w.style.backgroundImage = `url("${CHESS}"), url("${url}")`));
}

/** Preload a new generated image, then swap it in so the walls never flash blank. */
function swapGeneratedImage() {
  if (swapping) return;
  swapping = true;
  const url = seedImage();
  const img = new Image();
  img.onload = () => {
    setWallImage(url);
    swapping = false;
  };
  img.onerror = () => (swapping = false);
  img.src = url;
}

function onPointer(e: MouseEvent | TouchEvent) {
  const p = "touches" in e ? e.touches[0] : e;
  if (!p) return;
  pointerX = p.clientX / window.innerWidth;
  pointerY = p.clientY / window.innerHeight;
  lastActive = performance.now();
}

function frame(now: number) {
  const dt = Math.min(now - t0, 50) / 1000;
  t0 = now;

  // --- read how the visitor is playing
  const spin = Math.hypot(vp.torqueX, vp.torqueY);
  if (vp.down || spin > 2) lastActive = now;
  // trance keeps the room charged even between spins
  const target = Math.max(clamp(spin / 40, 0, 1), (getTrance() / MAX_TRANCE) * 0.6);
  energy = lerp(energy, target, target > energy ? 0.25 : 0.02);
  calm = lerp(calm, 1 - energy, 0.005);
  const idle = clamp((now - lastActive - 4000) / 8000, 0, 1); // 0 active → 1 ignored
  lastIdle = idle;

  // violent spin → sometimes the room changes its skin
  if (energy > 0.75 && chance(0.004)) swapGeneratedImage();

  // the personality can flip when the visitor gets rough
  if (energy > 0.8 && chance(0.002)) persona.curious = !persona.curious;

  // --- cube: breathe, float, lean, heartbeat
  if (cube) {
    const breath = Math.sin((now / persona.breath) * Math.PI * 2);
    const scale = BASE_SCALE * (1 + breath * 0.025 + energy * 0.04);
    const bob = Math.sin(now / 1700) * 6 * (1 - energy) + breath * 2;
    const lean = persona.curious ? 1 : -1;
    const lx = (pointerX - 0.5) * 26 * lean * (1 - idle * 0.6);
    const ly = (pointerY - 0.5) * 14 * lean * (1 - idle * 0.6);
    const tilt = (pointerX - 0.5) * 6 * lean;
    cube.style.transform = `translate(${lx.toFixed(1)}px, ${(ly + bob).toFixed(1)}px) rotate(${tilt.toFixed(2)}deg) scale(${scale.toFixed(4)})`;

    // heartbeat: double-thump, faster and redder when excited
    const bpm = 50 + energy * 110;
    const beatT = ((now / 60000) * bpm) % 1;
    const thump = Math.exp(-((beatT - 0.05) ** 2) / 0.002) + 0.6 * Math.exp(-((beatT - 0.22) ** 2) / 0.002);
    const glow = 6 + thump * (10 + energy * 22);
    // the full sigil set turns the cube's glow gold-white for good
    const done = isComplete();
    const [br, bg, bb] = RANK_COLORS[getRank() % RANK_COLORS.length];
    const r = done ? 255 : Math.round(lerp(br, 255, energy));
    const g = done ? 236 : Math.round(lerp(bg, 40, energy));
    const b = done ? 170 : Math.round(lerp(bb, 60, energy));
    const a = (0.25 + thump * 0.45) * (1 - idle * 0.7);
    cube.style.filter = `drop-shadow(0 0 ${glow.toFixed(1)}px rgba(${r},${g},${b},${a.toFixed(2)}))`;

    // ignored for a while → it fidgets on its own
    if (idle > 0.3 && now - lastTwitch > rnd(2500, 6000)) {
      lastTwitch = now;
      vp.torqueX += (chance(0.5) ? 1 : -1) * (1.3 + Math.random());
      vp.torqueY += (chance(0.5) ? 1 : -1) * Math.random();
    }
  }

  // --- room: tunnel flow follows the spin
  const flow = persona.invertSpin ? -1 : 1;
  if (Math.abs(vp.torqueX) > 1.5) wallDir = Math.sign(vp.torqueX) * flow;
  const speed = (18 + energy * 520) * (1 - idle * 0.85) * speedMul * FLOW; // px per second
  wallOffset = (wallOffset + wallDir * speed * dt) % (BASE_CHESS * 100);
  const size = BASE_CHESS * (1 + energy * 0.35);
  walls.forEach((w) => {
    w.style.backgroundPosition = `${wallOffset.toFixed(1)}px 0, ${wallOffset.toFixed(1)}px 0`;
    w.style.backgroundSize = `${size.toFixed(1)}px ${size.toFixed(1)}px, 40px 40px`;
  });

  // colours follow the tilt; idle drains them
  if (room) {
    const axis = persona.hueAxis === "x" ? vp.positionX : vp.positionY;
    const hue = Math.sin((axis / 360) * Math.PI * 2) * persona.hueRange;
    const sat = lerp(1, 1.9, energy) * (1 - idle * 0.7);
    const bri = lerp(1, 0.35, idle) * lerp(1, 1.15, energy);
    room.style.filter = `hue-rotate(${hue.toFixed(1)}deg) saturate(${sat.toFixed(2)}) brightness(${bri.toFixed(2)})`;
  }

  // fog thickens when ignored
  if (fog && !fog.classList.contains("mystery-fog")) fog.style.opacity = (0.75 + idle * 0.25 - energy * 0.4).toFixed(2);

  requestAnimationFrame(frame);
}

let lastIdle = 0;

/** Current mood, for the music: energy 0..1 (how hard they play), idle 0..1. */
export function getMood() {
  return { energy, idle: lastIdle };
}

// ---------------------------------------------------------------- api

export function initAlive(opts: { viewport: Viewport }) {
  vp = opts.viewport;
  cube = document.getElementById("cubeWrapper");
  room = document.getElementById("wallpaper");
  fog = document.querySelector(".fogwrapper");
  walls = ["wallUp", "wallDown"].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];

  // JS drives the tunnel now; switch off the CSS pan animation
  walls.forEach((w) => (w.style.animation = "none"));
  setWallImage(seedImage());

  window.addEventListener("mousemove", onPointer, { passive: true });
  window.addEventListener("touchmove", onPointer, { passive: true });
  window.addEventListener("touchstart", onPointer, { passive: true });
  requestAnimationFrame(frame);
}

/** Mystery events: change tunnel speed / direction. */
export function nudgeWalls(opts: { speed?: number; reverse?: boolean }) {
  if (opts.speed !== undefined) speedMul = opts.speed;
  if (opts.reverse) wallDir *= -1;
}

/** Mystery events: new generated image right now. */
export function newRoomSkin() {
  swapGeneratedImage();
}

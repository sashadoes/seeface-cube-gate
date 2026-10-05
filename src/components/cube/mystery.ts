// Mystery engine: after every spin it rolls the dice and may trigger one or more
// strange events. The deeper the player goes, the more often (and the stranger)
// things happen. Nothing is scripted, so no two sessions look the same.
//
// Events manipulate the existing cube DOM directly, in the same style as Cube.tsx.
import { Howl } from "howler";
import { randomIntFromInterval as rnd } from "../helper.js";
import { nudgeWalls, newRoomSkin } from "./alive";
import { greeting, previous, recordSpin } from "./memory";
import { track } from "../../analytics";
import "./Mystery.scss";

type Viewport = { torqueX: number; torqueY: number };

const NUMBERS = ["1", "2", "3", "4", "5", "6"];
const SYMBOLS = ["♠", "∑", "♖", "♘", "♕", "▲", "☽", "☾", "♔", "◐", "✶", "⌘", "?", "1"];

const WHISPERS = [
  "it sees you",
  "not this face",
  "count again",
  "who is the 1?",
  "closer",
  "you were here before",
  "wrong side",
  "6 is lying",
  "turn it back",
  "it remembers your hands",
  "keep spinning",
  "the gate is listening",
  "almost",
  "don't trust the moon",
  "behind you",
  "see / face",
  "it was always one",
  "the floor is moving",
  "you missed one",
  "again",
];

const IDLE_WHISPERS = ["still there?", "it is waiting", "spin", "don't leave", "we can see you"];

let viewport: Viewport | null = null;
let step = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let layer: HTMLDivElement;
let black: HTMLDivElement;

const sfx = {
  magic1: new Howl({ src: ["/sounds/MagicClick1.mp3"], volume: 0.35, preload: true }),
  magic2: new Howl({ src: ["/sounds/MagicClick2.mp3"], volume: 0.35, preload: true }),
  bell: new Howl({ src: ["/sounds/BellClick1.mp3"], volume: 0.4, preload: true }),
  switch1: new Howl({ src: ["/sounds/SwitchCube1.mp3"], volume: 0.4, preload: true }),
  switch2: new Howl({ src: ["/sounds/SwitchCube2.mp3"], volume: 0.4, preload: true }),
  shuffle: new Howl({ src: ["/sounds/ShuffleCube.mp3"], volume: 0.4, preload: true }),
  locked: new Howl({ src: ["/sounds/CubeLocked.mp3"], volume: 0.4, preload: true }),
};

const pick = <T,>(arr: T[]): T => arr[rnd(0, arr.length - 1)];
const chance = (p: number) => Math.random() < p;
const $ = (id: string) => document.getElementById(id);
const faces = () => Array.from(document.getElementsByClassName("cube-image")) as HTMLElement[];
const sides = () => Array.from(document.getElementsByClassName("cube-side")) as HTMLElement[];

function syncActiveDigit() {
  const active = document.querySelector(".cube-image.active");
  const out = $("cube-code-active");
  if (active && out) out.innerHTML = active.innerHTML;
}

// ---------------------------------------------------------------- events

/** A cryptic line fades in somewhere on screen. */
function whisper(text = pick(WHISPERS)) {
  const el = document.createElement("div");
  el.className = "mystery-whisper";
  el.textContent = text;
  el.style.left = rnd(8, 62) + "vw";
  el.style.top = rnd(10, 78) + "vh";
  el.style.transform = `rotate(${rnd(-12, 12)}deg)`;
  layer.appendChild(el);
  pick([sfx.magic1, sfx.magic2]).play();
  setTimeout(() => el.remove(), 4200);
}

/** A giant digit flashes over everything. */
function bigDigit() {
  const el = document.createElement("div");
  el.className = "mystery-digit";
  el.textContent = chance(0.7) ? pick(NUMBERS) : pick(SYMBOLS);
  layer.appendChild(el);
  sfx.bell.play();
  setTimeout(() => el.remove(), 1600);
}

/** The cube jolts. */
function shake() {
  const el = $("shakeCube");
  if (!el) return;
  el.classList.remove("mystery-shake");
  void el.offsetWidth; // restart the animation
  el.classList.add("mystery-shake");
  sfx.locked.play();
  buzz([30, 40, 30]);
  setTimeout(() => el.classList.remove("mystery-shake"), 700);
}

/** The cube spins by itself. */
function possessed() {
  if (!viewport) return;
  viewport.torqueX = (chance(0.5) ? 1 : -1) * rnd(25, 60);
  viewport.torqueY = (chance(0.5) ? 1 : -1) * rnd(10, 40);
  sfx.switch2.play();
}

/** Faces re-roll: digits move, symbols creep in. The code you were aiming for moves. */
function shuffleFaces() {
  const list = faces();
  const symbolOdds = Math.min(0.15 + step * 0.02, 0.45);
  let n = 0;
  sfx.shuffle.play();
  const timer = setInterval(() => {
    list.forEach((f) => (f.innerHTML = chance(0.5) ? pick(NUMBERS) : pick(SYMBOLS)));
    if (++n > 14) {
      clearInterval(timer);
      const pool = [...NUMBERS].sort(() => Math.random() - 0.5);
      list.forEach((f, i) => (f.innerHTML = chance(symbolOdds) ? pick(SYMBOLS) : pool[i]));
      syncActiveDigit();
    }
  }, 30);
}

/** The cube turns into a ghost, then comes back. */
function ghost() {
  const list = sides();
  list.forEach((s) => (s.style.opacity = "0.08"));
  sfx.switch1.play();
  setTimeout(() => list.forEach((s) => (s.style.opacity = "0.9")), rnd(900, 2200));
}

/** The digits at the bottom glitch. Sometimes one is stolen. */
function scrambleCode() {
  const code = $("cube-code");
  if (!code || !code.innerHTML) return;
  const original = code.innerHTML;
  const steal = chance(0.35);
  let n = 0;
  const timer = setInterval(() => {
    code.innerHTML = original
      .split("")
      .map(() => pick(chance(0.5) ? NUMBERS : SYMBOLS))
      .join("");
    if (++n > 12) {
      clearInterval(timer);
      code.innerHTML = steal ? original.slice(0, -1) : original;
      if (steal) whisper("you missed one");
    }
  }, 45);
}

/** The tunnel changes speed, sometimes runs backwards. */
function wallsSpeed() {
  nudgeWalls({ speed: pick([0.15, 0.4, 1, 2.5, 5]), reverse: chance(0.4) });
}

/** The room changes its skin: a newly generated image behind the logos. */
function newSkin() {
  newRoomSkin();
  sfx.switch2.play();
}

/** Black squares become white and white become black. */
function invertWalls() {
  $("wallpaper")?.classList.toggle("mystery-invert");
  sfx.switch1.play();
}

/** The lights go out (sometimes they flicker). */
function blackout() {
  const flicks = chance(0.5) ? rnd(2, 4) : 1;
  let t = 0;
  for (let i = 0; i < flicks; i++) {
    setTimeout(() => (black.style.opacity = "1"), t);
    t += flicks === 1 ? rnd(600, 1400) : rnd(60, 160);
    setTimeout(() => (black.style.opacity = "0"), t);
    t += rnd(60, 200);
  }
}

/** Colours break for a moment. */
function glitch() {
  document.body.classList.add("mystery-glitch");
  sfx.magic2.play();
  setTimeout(() => document.body.classList.remove("mystery-glitch"), rnd(250, 700));
}

/** Fog rolls in thick, then clears. */
function fogSurge() {
  const fog = document.querySelector(".fogwrapper") as HTMLElement | null;
  if (!fog) return;
  fog.classList.add("mystery-fog");
  setTimeout(() => fog.classList.remove("mystery-fog"), rnd(2500, 5000));
}

/** Phone vibration (Android; iOS ignores it). */
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not supported
  }
}

/** Very rare: the room turns into a red-curtained room for a few seconds. */
let redRoomSeen = false;
function redRoom() {
  if (redRoomSeen) return;
  redRoomSeen = true;
  track("red-room");
  const room = document.createElement("div");
  room.className = "mystery-redroom";
  room.innerHTML = '<div class="curtains"></div><div class="chevron"></div><div class="redroom-text">you are in the room now</div>';
  document.body.appendChild(room);
  sfx.bell.play();
  buzz([60, 80, 60, 80, 200]);
  setTimeout(() => room.classList.add("leaving"), 5200);
  setTimeout(() => room.remove(), 6400);
}

// Pools unlock as the player goes deeper.
const EARLY = [whisper, bigDigit, shake, wallsSpeed, fogSurge];
const MIDDLE = [shuffleFaces, ghost, scrambleCode, invertWalls, possessed, newSkin];
const DEEP = [blackout, glitch, shuffleFaces, possessed];

function poolForStep() {
  if (step < 4) return EARLY;
  if (step < 10) return [...EARLY, ...MIDDLE];
  return [...EARLY, ...MIDDLE, ...DEEP];
}

function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (chance(0.6)) whisper(pick(IDLE_WHISPERS));
    else possessed();
    scheduleIdle();
  }, rnd(14000, 26000));
}

// ---------------------------------------------------------------- api

export function initMystery(opts: { viewport: Viewport }) {
  viewport = opts.viewport;
  layer = document.createElement("div");
  layer.className = "mystery-layer";
  black = document.createElement("div");
  black.className = "mystery-black";
  document.body.append(layer, black);
  // Returning visitors start deeper in the mystery and are greeted.
  step = Math.min(previous.visits * 2, 8);
  const hello = greeting();
  if (hello) setTimeout(() => whisper(hello), 2500);
  scheduleIdle();
}

/** Call once per spin (each locked digit). */
export function mysteryStep() {
  step += 1;
  recordSpin(step);
  scheduleIdle();

  // ~1 in 40 spins once deep enough, at most once per visit
  if (step >= 6 && chance(1 / 40)) {
    redRoom();
    return;
  }

  // Odds grow with depth; occasionally nothing happens at all, which is creepier.
  const odds = Math.min(0.3 + step * 0.06, 0.92);
  if (!chance(odds)) return;

  const count = 1 + (step > 8 && chance(0.4) ? 1 : 0) + (step > 16 && chance(0.3) ? 1 : 0);
  const pool = poolForStep();
  for (let i = 0; i < count; i++) {
    const event = pick(pool);
    setTimeout(event, i * rnd(250, 900));
  }
}

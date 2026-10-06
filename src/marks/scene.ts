// The marks scene: the room goes darker, 3D spotlights on the viewer's side
// aim at the cube (lights3d.ts), and marks left by other visitors sit in
// squares on the back wall. A mark is only readable while a beam spills over it.
import type { Mark } from "./store";
import type { Weather } from "./weather";
import { initLights, lightAtScreen, setWeather } from "./lights3d";
import "./Marks.scss";

type Plate = { el: HTMLDivElement; x: number; y: number; mark: Mark };

const SLOTS_X = [8, 22, 36, 50, 64, 78, 92]; // vw (centres)
const SLOTS_Y = [3, 25]; // vh, back wall rows (far enough apart that squares never overlap)
const MAX_PLATES = 9;

let layer: HTMLDivElement | null = null;
let platesEl: HTMLDivElement;
let dark: HTMLDivElement;
let plates: Plate[] = [];
let onRemove: ((m: Mark) => void) | null = null;
let keeper = false;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function freeSlot(): { x: number; y: number } | null {
  const taken = new Set(plates.map((p) => `${p.x}:${p.y}`));
  const free: { x: number; y: number }[] = [];
  for (const y of SLOTS_Y) for (const x of SLOTS_X) if (!taken.has(`${x}:${y}`)) free.push({ x, y });
  if (!free.length) return null;
  return free[Math.floor(Math.random() * free.length)];
}

function place(mark: Mark, fresh = false) {
  let slot = freeSlot();
  if (!slot) {
    // full wall: the oldest mark fades out to make room
    const old = plates.shift();
    old?.el.remove();
    slot = freeSlot();
  }
  if (!slot) return;
  const el = document.createElement("div");
  el.className = "marks-plate" + (fresh ? " fresh" : "") + (mark.mine ? " mine" : "");
  el.style.left = slot.x + "vw";
  el.style.top = slot.y + "vh";
  el.style.setProperty("--tilt", rand(-4, 4).toFixed(1) + "deg");
  const text = document.createElement("span");
  text.textContent = mark.text; // never innerHTML: marks are user text
  el.appendChild(text);
  if (keeper) {
    const x = document.createElement("button");
    x.className = "marks-remove";
    x.textContent = "×";
    x.setAttribute("aria-label", "remove this mark");
    const stop = (e: Event) => e.stopPropagation();
    ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"].forEach((t) => x.addEventListener(t, stop));
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      plates = plates.filter((p) => p.el !== el);
      el.remove();
      onRemove?.(mark);
    });
    el.appendChild(x);
  }
  platesEl.appendChild(el);
  plates.push({ el, x: slot.x, y: slot.y, mark });
}

function frame() {
  const vw = window.innerWidth / 100;
  const vh = window.innerHeight / 100;

  // light on each plate: how much of a spotlight spills onto it
  for (const p of plates) {
    const l = lightAtScreen(p.x * vw, p.y * vh + p.el.offsetHeight / 2);
    p.el.style.setProperty("--light", l.toFixed(3));
  }

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- api

export function initScene(opts: { keeper: boolean; onRemove: (m: Mark) => void }) {
  if (layer) return;
  keeper = opts.keeper;
  onRemove = opts.onRemove;
  const wrapper = document.getElementById("wrapper");
  layer = document.createElement("div");
  layer.className = "marks-scene";
  dark = document.createElement("div");
  dark.className = "marks-dark";
  platesEl = document.createElement("div");
  platesEl.className = "marks-plates";
  layer.append(dark, platesEl);
  (wrapper ?? document.body).prepend(layer);

  // the light rig renders above the cube (additive), under the fog and UI
  const gl = document.createElement("div");
  gl.className = "marks-gl-host";
  (wrapper ?? document.body).appendChild(gl);
  initLights(gl);

  const bolt = document.createElement("div");
  bolt.className = "marks-lightning";
  document.body.appendChild(bolt);

  requestAnimationFrame(frame);
}

/** Fill the wall with a fresh random selection (a new chamber). */
export function showChamber(marks: Mark[]) {
  plates.forEach((p) => p.el.remove());
  plates = [];
  const pick = [...marks].sort(() => Math.random() - 0.5).slice(0, MAX_PLATES);
  pick.forEach((m) => place(m));
}

/** A mark just left: it burns onto the wall. */
export function addMark(m: Mark) {
  place(m, true);
}

/** Moving to the next chamber: a sweep of darkness, then a new wall. */
export function chamberTransition(next: () => void) {
  dark.classList.add("pass");
  setTimeout(next, 700);
  setTimeout(() => dark.classList.remove("pass"), 1500);
}

/** The visitor's weather: light colour, particles, fog, darkness. */
export function applyWeather(w: Weather) {
  setWeather(w);
  const fog = document.querySelector(".fogwrapper");
  fog?.classList.toggle("marks-fog-heavy", w.kind === "fog" || w.kind === "drizzle");
  // how dark the room is: clear day is brightest, storms and nights darkest
  const darkness =
    w.kind === "storm" ? 0.88 : w.kind === "rain" ? 0.8 : w.kind === "cloudy" || w.kind === "fog" ? 0.76 : w.isDay ? 0.6 : 0.82;
  dark.style.setProperty("--darkness", String(darkness));
}

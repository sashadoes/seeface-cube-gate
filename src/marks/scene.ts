// The marks scene: the room goes darker, slow beams of light sweep down from
// above, and marks left by other visitors sit in squares on the back wall.
// A mark is only readable while a beam is passing over it.
import type { Mark } from "./store";
import "./Marks.scss";

type Beam = { el: HTMLDivElement; x: number; target: number; speed: number; angle: number; width: number };
type Plate = { el: HTMLDivElement; x: number; y: number; mark: Mark };

const SLOTS_X = [8, 22, 36, 50, 64, 78, 92]; // vw (centres)
const SLOTS_Y = [3, 25]; // vh, back wall rows (far enough apart that squares never overlap)
const MAX_PLATES = 9;

let layer: HTMLDivElement | null = null;
let platesEl: HTMLDivElement;
let dark: HTMLDivElement;
const beams: Beam[] = [];
let plates: Plate[] = [];
let onRemove: ((m: Mark) => void) | null = null;
let keeper = false;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function newBeam(i: number): Beam {
  const el = document.createElement("div");
  el.className = "marks-beam";
  layer!.appendChild(el);
  const x = rand(5, 95);
  return { el, x, target: rand(5, 95), speed: rand(1.2, 3.2), angle: rand(-18, 18), width: rand(9, 16) + i };
}

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

  for (const b of beams) {
    const d = b.target - b.x;
    if (Math.abs(d) < 0.5) {
      b.target = rand(3, 97);
      b.speed = rand(1.2, 3.4);
      b.angle = rand(-18, 18);
    }
    b.x += Math.sign(d) * Math.min(Math.abs(d), b.speed * 0.03);
    b.el.style.left = b.x + "vw";
    b.el.style.width = b.width + "vw";
    b.el.style.transform = `translateX(-50%) rotate(${b.angle.toFixed(2)}deg)`;
  }

  // light on each plate: how close the nearest beam passes at that height
  for (const p of plates) {
    let light = 0;
    for (const b of beams) {
      const yPx = p.y * vh + 40; // beam starts above the screen
      const beamX = b.x * vw - Math.tan((b.angle * Math.PI) / 180) * yPx;
      const half = (b.width * vw) / 2;
      const l = 1 - Math.abs(beamX - p.x * vw) / half;
      if (l > light) light = l;
    }
    p.el.style.setProperty("--light", Math.max(0, Math.min(1, light)).toFixed(3));
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
  for (let i = 0; i < 3; i++) beams.push(newBeam(i));
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
  beams.forEach((b) => (b.target = rand(3, 97)));
}

// Apparitions: things that start to live in the room the deeper someone plays.
// Progression never ends: after the last unlock, every 10 spins brings a "wave"
// and everything grows a little stronger (capped so phones stay smooth).
//
//   4+  dust motes        20+ eyes open in the fog     36+ the seeface1 logo floats through
//   14+ companion cube    28+ shadow figure (closer each time)
//   (no ghosts: removed at the owner's request)
//
// No text, ever. Everything sits behind the cube and under the fog.
import { randomIntFromInterval as rnd } from "../helper.js";
import { track } from "../../analytics";
import "./Apparitions.scss";

const chance = (p: number) => Math.random() < p;

let layer: HTMLDivElement | null = null;
let orbitHost: HTMLElement | null = null;
let pointerX = 0.5;
let pointerY = 0.5;
let motes = 0;
let companions = 0;
let figureSeen = 0;
let lastWave = 0;
const unlocked = new Set<string>();

const MAX_MOTES = 36;
const MAX_COMPANIONS = 3;

function ensureLayer() {
  if (layer) return layer;
  const wrapper = document.getElementById("wrapper");
  layer = document.createElement("div");
  layer.className = "apparitions";
  // behind the cube (which has a high z-index), in front of the walls
  (wrapper ?? document.body).prepend(layer);
  orbitHost = document.getElementById("cubeWrapper");
  window.addEventListener(
    "pointermove",
    (e) => {
      pointerX = e.clientX / window.innerWidth;
      pointerY = e.clientY / window.innerHeight;
    },
    { passive: true }
  );
  return layer;
}

function unlock(name: string) {
  if (unlocked.has(name)) return false;
  unlocked.add(name);
  track(`apparition-${name}`);
  return true;
}

// ---------------------------------------------------------------- entities

/** Floating dust: tiny lights rising slowly. Persistent. */
function addMotes(n: number) {
  const host = ensureLayer();
  for (let i = 0; i < n && motes < MAX_MOTES; i++, motes++) {
    const m = document.createElement("span");
    m.className = "app-mote";
    m.style.left = rnd(0, 100) + "vw";
    m.style.setProperty("--drift", rnd(-60, 60) + "px");
    m.style.setProperty("--size", rnd(2, 5) + "px");
    m.style.animationDuration = rnd(9, 22) + "s";
    m.style.animationDelay = -rnd(0, 20) + "s";
    host.appendChild(m);
  }
}

/** A small black-glass cube orbiting the big one. Persistent. */
function addCompanion() {
  ensureLayer();
  if (!orbitHost || companions >= MAX_COMPANIONS) return;
  companions++;
  const orbit = document.createElement("div");
  orbit.className = "app-orbit";
  orbit.style.setProperty("--tilt", rnd(-25, 25) + "deg");
  orbit.style.setProperty("--radius", 150 + companions * 34 + "px");
  orbit.style.animationDuration = rnd(7, 13) + "s";
  orbit.style.animationDirection = chance(0.5) ? "normal" : "reverse";
  const mini = document.createElement("div");
  mini.className = "app-mini";
  const glyphs = ["1", "◐", "✶", "☽", "6", "▲"];
  mini.innerHTML = glyphs.map((g) => `<i>${g}</i>`).join("");
  orbit.appendChild(mini);
  orbitHost.appendChild(orbit);
}

/** Eyes open somewhere in the fog, blink, follow the pointer, close. */
function eyes() {
  const host = ensureLayer();
  const e = document.createElement("div");
  e.className = "app-eyes";
  e.style.left = rnd(6, 80) + "vw";
  e.style.top = rnd(10, 70) + "vh";
  e.style.setProperty("--scale", (0.6 + Math.random() * 0.9).toFixed(2));
  e.innerHTML = '<span class="eye"><b></b></span><span class="eye"><b></b></span>';
  host.appendChild(e);
  const pupils = Array.from(e.querySelectorAll("b")) as HTMLElement[];
  const follow = setInterval(() => {
    const r = e.getBoundingClientRect();
    const dx = pointerX * window.innerWidth - (r.left + r.width / 2);
    const dy = pointerY * window.innerHeight - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    pupils.forEach((p) => (p.style.transform = `translate(${((dx / len) * 3).toFixed(1)}px, ${((dy / len) * 2).toFixed(1)}px)`));
  }, 80);
  const life = rnd(4500, 7500);
  setTimeout(() => e.classList.add("closing"), life - 600);
  setTimeout(() => {
    clearInterval(follow);
    e.remove();
  }, life);
}

const FIGURE_SVG = `<svg viewBox="0 0 60 180" aria-hidden="true"><path d="M30 4c9 0 15 8 15 18s-6 18-15 18-15-8-15-18S21 4 30 4Zm-17 40c5-3 11-4 17-4s12 1 17 4c6 4 9 12 10 22l3 50c0 5-3 8-7 8l-3 58H9l-3-58c-4 0-7-3-7-8l3-50c1-10 4-18 11-22Z" fill="#000"/></svg>`;

/** A shadow figure at the far end of the tunnel. Each appearance it's a little closer. */
function figure() {
  const host = ensureLayer();
  figureSeen++;
  const f = document.createElement("div");
  f.className = "app-figure";
  f.innerHTML = FIGURE_SVG;
  f.style.left = rnd(30, 62) + "vw";
  f.style.setProperty("--scale", Math.min(0.35 + figureSeen * 0.12, 1.4).toFixed(2));
  host.appendChild(f);
  setTimeout(() => f.remove(), 6000);
}

/** The seeface1 logo drifts through like something underwater. */
function floatingLogo() {
  const host = ensureLayer();
  const l = document.createElement("img");
  l.className = "app-logo";
  l.src = "/imgs/seeface-logo-transparent.png";
  l.alt = "";
  l.style.top = rnd(10, 60) + "vh";
  l.style.setProperty("--rot", rnd(-30, 30) + "deg");
  host.appendChild(l);
  setTimeout(() => l.remove(), 16000);
}

// ---------------------------------------------------------------- progression

/** Call once per spin with the current depth. */
export function apparitionsStep(depth: number) {
  ensureLayer();

  if (depth >= 4 && unlock("motes")) addMotes(14);
  if (depth >= 14 && unlock("companion")) addCompanion();
  if (depth >= 20 && unlock("eyes")) eyes();
  if (depth >= 28 && unlock("figure")) figure();
  if (depth >= 36 && unlock("logo")) floatingLogo();

  // ongoing: the deeper, the more often things show up
  const heat = Math.min(depth / 60, 1);
  if (depth >= 20 && chance(0.04 + heat * 0.1)) eyes();
  if (depth >= 28 && chance(0.03 + heat * 0.05)) figure();
  if (depth >= 36 && chance(0.02 + heat * 0.04)) floatingLogo();

  // endless waves: every 10 spins past 40, everything at once and a bit stronger
  if (depth >= 40 && depth - lastWave >= 10) {
    lastWave = depth;
    track(`depth-${depth - (depth % 10)}`);
    addMotes(4);
    addCompanion();
    setTimeout(eyes, 600);
    setTimeout(figure, 2200);
    setTimeout(floatingLogo, 3000);
  }
}

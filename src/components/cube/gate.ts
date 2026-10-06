// The gate: the cube page is the way into the 3D labyrinth.
// Hidden rule (never shown on screen): spin in the code 1 9 9 4 (the owner's
// code; the cube's faces are 1 2 3 4 5 9). That's the hack. Or get lucky.
// The room glitches, the cube rushes at you, a light tears open with the logo
// burning through, and you fall into /labyrinth.
import { Howl } from "howler";
import { track } from "../../analytics";
import "./Gate.scss";

const GATE_CODE = "1994";
let opening = false;

// ...or by luck: after 8 spins, every spin has a small chance to tear the
// gate open, rising slowly the longer you play (3% → 12%).
let spins = 0;
window.addEventListener("cube-spin", () => {
  spins += 1;
  if (opening || spins < 8) return;
  const chance = Math.min(0.12, 0.03 + (spins - 8) * 0.004);
  if (Math.random() < chance) {
    track("gate-luck");
    setTimeout(openGate, 600); // let the spin land first
  }
});

/** Call with the code line after every digit. */
export function checkGate(code: string) {
  if (opening || !code.includes(GATE_CODE)) return;
  openGate();
}

export function openGate() {
  if (opening) return;
  opening = true;
  track("gate-opened");
  new Howl({ src: ["/sounds/BellClick1.mp3"], volume: 0.8 }).play();
  setTimeout(() => new Howl({ src: ["/sounds/MagicClick1.mp3"], volume: 0.8 }).play(), 700);
  try {
    navigator.vibrate?.([60, 40, 60, 40, 400]);
  } catch {
    // unsupported
  }

  // 1. the room glitches
  document.body.classList.add("gate-glitch");
  // 2. the cube rushes forward
  const cube = document.getElementById("shakeCube");
  cube?.classList.add("gate-rush");
  // 3. a tear of light opens with the logo burning through, then the fall
  const tear = document.createElement("div");
  tear.className = "gate-tear";
  tear.innerHTML = '<div class="gate-light"></div><img src="/imgs/seeface-logo-transparent.png" alt="" />';
  document.body.appendChild(tear);

  setTimeout(() => {
    location.href = "/labyrinth?from=gate";
  }, 3200);
}

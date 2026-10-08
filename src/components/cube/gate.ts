// The gate: the cube page is the way into the 3D labyrinth.
// Two ways in (never explained on screen):
//   · play: every spin, tap, touch or key press counts, and after a random
//     8–12 of them (new number every visit, ~10 on average) the gate opens.
//   · or the code 1 9 9 4 opens it at once: spun in (digits count across the
//     4-digit line resets, symbol faces are skipped) or typed on a keyboard.
// The room glitches, the cube rushes at you, a light tears open with the logo
// burning through, and you fall into /labyrinth.
import { Howl } from "howler";
import { track } from "../../analytics";
import "./Gate.scss";

const GATE_CODE = "1994";
// was 10–20: on 2026-10-08, 9 of 47 spinners left before it opened, 4 of them
// after 12+ spins. 8–12 lets everyone who keeps playing in.
const ACTIONS_TO_ENTER = 8 + Math.floor(Math.random() * 5); // 8–12
let opening = false;
let digits = "";
let typed = "";
let actions = 0;

function act() {
  if (opening || location.pathname !== "/") return;
  actions += 1;
  if (actions >= ACTIONS_TO_ENTER) {
    track("gate-actions");
    setTimeout(openGate, 700); // let the last spin land first
  }
}
// a spin is a touch too: count touches/clicks and key presses, not spins twice
window.addEventListener("pointerdown", act, { capture: true, passive: true });

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  act();
  if (opening || !/^\d$/.test(e.key) || location.pathname !== "/") return;
  typed = (typed + e.key).slice(-4);
  if (typed === GATE_CODE) {
    track("gate-code-typed");
    openGate();
  }
});

/** Call with the face that was just entered (digit or symbol). */
export function enterDigit(face: string) {
  if (opening || !/^\d$/.test(face)) return; // symbols don't break the code
  digits = (digits + face).slice(-4);
  if (digits === GATE_CODE) {
    track("gate-code");
    setTimeout(openGate, 300);
  }
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

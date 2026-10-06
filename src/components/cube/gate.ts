// The gate: the cube page is the way into the 3D labyrinth.
// Hidden rule (never shown on screen): spin in the code 1 9 9 4 (the owner's
// code; the cube's faces are 1 2 3 4 5 9). That's the hack.
// The room glitches, the cube rushes at you, a light tears open with the logo
// burning through, and you fall into /labyrinth.
import { Howl } from "howler";
import { track } from "../../analytics";
import "./Gate.scss";

const GATE_CODE = "1994";
let opening = false;

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

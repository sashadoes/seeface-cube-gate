// The gate: the cube page is the way into the 3D labyrinth.
// Hidden rule (never shown on screen): spin at least 12 times this visit, then
// enter today's code (2 digits in a row, from dailyPass.json). That's the hack.
// The room glitches, the cube rushes at you, a light tears open with the logo
// burning through, and you fall into /labyrinth.
import { Howl } from "howler";
import { track } from "../../analytics";
import "./Gate.scss";

const MIN_SPINS = 12;
let spins = 0;
let opening = false;

window.addEventListener("cube-spin", () => {
  spins += 1;
});

/** Call with the code line after every digit. */
export function checkGate(code: string, dailyPass: string) {
  if (opening || !dailyPass || spins < MIN_SPINS || !code.includes(dailyPass)) return;
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

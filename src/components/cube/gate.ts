// The gate: the cube page is the way into the 3D labyrinth.
// Two ways in (never explained on screen):
//   · spin in the code 1 9 9 4 (the cube's faces are 1 2 3 4 5 9). Digits count
//     across the 4-digit line resets and symbol faces are skipped, so "1 9" at
//     the end of one line + "9 4" at the start of the next works. On a computer
//     you can also just type 1994.
//   · or simply keep going: the 9th spin always opens the gate.
// The room glitches, the cube rushes at you, a light tears open with the logo
// burning through, and you fall into /labyrinth.
import { Howl } from "howler";
import { track } from "../../analytics";
import "./Gate.scss";

const GATE_CODE = "1994";
const SPINS_TO_ENTER = 9;
let opening = false;
let digits = "";
let typed = "";
let spins = 0;

window.addEventListener("cube-spin", () => {
  spins += 1;
  if (opening || spins < SPINS_TO_ENTER) return;
  track("gate-9-spins");
  setTimeout(openGate, 700); // let the spin land first
});

// typing the code on a keyboard works too
window.addEventListener("keydown", (e) => {
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

// The gate: the cube page is the way into the 3D labyrinth.
// Two ways in (never explained on screen):
//   · play: while you play with the cube it loads the world (prelaunch.ts) and
//     charges up. Once it's ready (and you've touched it at least
//     MIN_ACTIONS times), your next spin, tap or key press opens the gate.
//   · or the code 1 9 9 4 opens it at once: spun in (digits count across the
//     4-digit line resets, symbol faces are skipped) or typed on a keyboard.
// The cube's click doubles and rises (portal.ts) while the room glitches, the
// cube rushes at you, rings burst on every click, a light tears open with the
// logo burning through, and you fall into /labyrinth.
import { track } from "../../analytics";
import { prelaunchState } from "./prelaunch";
import { playPortal, IMPACT_S } from "./portal";
import "./Gate.scss";

const GATE_CODE = "1994";
const MIN_ACTIONS = 3;
let opening = false;
let digits = "";
let typed = "";
let actions = 0;

function act() {
  if (opening || location.pathname !== "/") return;
  actions += 1;
  if (actions >= MIN_ACTIONS && prelaunchState().ready) {
    track("gate-actions");
    track(`gate-after-${actions <= 5 ? "3-5" : actions <= 12 ? "6-12" : "13+"}`);
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
  if (!prelaunchState().ready) track("gate-before-ready"); // the code, typed before it loaded

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

  // every doubled click: a ring bursts out of the cube and the phone ticks
  playPortal((k) => {
    const ring = document.createElement("i");
    ring.className = "gate-ring";
    ring.style.setProperty("--k", String(k));
    tear.appendChild(ring);
    setTimeout(() => ring.remove(), 1200);
    try {
      navigator.vibrate?.(8 + k * 2);
    } catch {
      // unsupported
    }
  });
  // the impact: white-out and one long buzz
  setTimeout(() => {
    tear.classList.add("gate-impact");
    try {
      navigator.vibrate?.([0, 30, 380]);
    } catch {
      // unsupported
    }
  }, IMPACT_S * 1000);

  setTimeout(() => {
    location.href = "/labyrinth?from=gate";
  }, IMPACT_S * 1000 + 900);
}

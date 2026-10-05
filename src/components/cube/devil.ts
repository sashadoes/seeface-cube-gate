// The devil's game: deep in the session a red seal (⛧) sometimes appears near
// the cube for a few seconds. Tap it to wager one sigil on a coin flip:
//   win  → a missing sigil is granted
//   lose → one collected sigil burns away
// Only offered when there is something to lose AND something to win.
// No money, no purchases: it only ever touches the in-game sigils.
import { Howl } from "howler";
import { randomIntFromInterval as rnd } from "../helper.js";
import { track } from "../../analytics";
import { grantMissing, loseSigil, snapshot, SIGILS } from "./rewards";
import "./Devil.scss";

const sfx = {
  appear: new Howl({ src: ["/sounds/CubeLocked.mp3"], volume: 0.45, preload: true }),
  win: new Howl({ src: ["/sounds/MagicClick1.mp3"], volume: 0.6, preload: true }),
  lose: new Howl({ src: ["/sounds/CubeErrorCode.mp3"], volume: 0.6, preload: true }),
  roll: new Howl({ src: ["/sounds/ShuffleCubeCodeActive.mp3"], volume: 0.5, preload: true }),
};

let active = false;

function canOffer() {
  const s = snapshot();
  return s.found.length > 0 && s.found.length < SIGILS.length && !s.complete;
}

function flash(kind: "win" | "lose") {
  const f = document.createElement("div");
  f.className = "devil-flash " + kind;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1400);
}

function buzz(p: number | number[]) {
  try {
    navigator.vibrate?.(p);
  } catch {
    // unsupported
  }
}

/** Show the seal. Returns early if one is already up or nothing can be wagered. */
export function devilOffer() {
  if (active || !canOffer()) return;
  active = true;
  track("devil-offer");

  const seal = document.createElement("button");
  seal.className = "devil-seal";
  seal.setAttribute("aria-label", "wager a sigil");
  seal.innerHTML = '<span class="devil-ring"></span><span class="devil-glyph">⛧</span>';
  seal.style.left = rnd(12, 74) + "vw";
  seal.style.top = rnd(18, 58) + "vh";
  document.body.appendChild(seal);
  sfx.appear.play();
  buzz([20, 40, 20, 40, 20]);

  // the seal must not spin the cube or enter a digit
  const stop = (e: Event) => e.stopPropagation();
  ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"].forEach((t) =>
    seal.addEventListener(t, stop)
  );

  let taken = false;
  const leave = () => {
    seal.classList.add("leaving");
    setTimeout(() => {
      seal.remove();
      active = false;
    }, 700);
  };
  const timeout = setTimeout(() => {
    if (!taken) leave();
  }, rnd(4500, 6500));

  seal.addEventListener("click", (e) => {
    e.stopPropagation();
    if (taken) return;
    taken = true;
    clearTimeout(timeout);
    track("devil-accepted");
    seal.classList.add("rolling");
    sfx.roll.play();
    buzz([30, 30, 30, 30, 30, 30, 30]);

    setTimeout(() => {
      if (Math.random() < 0.5) {
        grantMissing();
        sfx.win.play();
        flash("win");
        track("devil-win");
        buzz([60, 40, 160]);
      } else {
        loseSigil();
        sfx.lose.play();
        flash("lose");
        track("devil-lose");
        buzz([220]);
      }
      leave();
    }, 1300);
  });
}

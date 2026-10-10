// One switch for every sound on the site (cube effects, labyrinth world,
// radio, voices, the owner's music). OFF by default: a visitor only hears
// anything after they turn sound on themselves. Remembered in this browser.
import { Howler } from "howler";

const KEY = "seeface-sound";
let on = (() => {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
})();
const listeners = new Set<(on: boolean) => void>();

export const soundOn = () => on;

/** Howler (cube + labyrinth effects + music): silent when sound is off or the page is hidden */
export function applyHowlerMute(hidden = document.hidden) {
  Howler.mute(!on || hidden);
}

export function setSoundOn(next: boolean) {
  if (next === on) return;
  on = next;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // storage blocked: works for this visit only
  }
  applyHowlerMute();
  listeners.forEach((f) => f(on));
}

export function onSound(fn: (on: boolean) => void) {
  listeners.add(fn);
  fn(on);
  return () => {
    listeners.delete(fn);
  };
}

document.addEventListener("visibilitychange", () => applyHowlerMute());
window.addEventListener("pagehide", () => applyHowlerMute(true));
window.addEventListener("pageshow", () => applyHowlerMute());
applyHowlerMute();

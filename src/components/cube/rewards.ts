// Rewards: the reasons to keep spinning and to come back. No text anywhere:
// progress is glyphs and light.
//
//  - 7 sigils to collect by locking symbol faces (♔ only appears on the rare golden face)
//  - today's code (2 digits in a row, changes daily) → seeface1 logo reveal
//  - return streak: one notch per consecutive day
//  - all 7 sigils → the big reveal, and the cube glows white for good
//
// Everything is per browser (localStorage) and survives reloads.
import { Howl } from "howler";
import { track } from "../../analytics";

export const SIGILS = ["☽", "☾", "✶", "◐", "♖", "▲", "♔"] as const;
export const RARE_SIGIL = "♔";

const KEY = "seeface-rewards";
const today = () => new Date().toISOString().slice(0, 10);

type State = {
  found: string[];
  crackedDay: string; // last day today's code was cracked
  streak: number;
  lastDay: string;
  complete: boolean;
};

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { found: [], crackedDay: "", streak: 0, lastDay: "", complete: false, ...JSON.parse(raw) };
  } catch {
    // storage blocked: progress lasts this visit only
  }
  return { found: [], crackedDay: "", streak: 0, lastDay: "", complete: false };
}

const state = load();
const listeners = new Set<() => void>(); // UI subscribers, see subscribe()

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

// streak: count consecutive days with a visit
(() => {
  const t = today();
  if (state.lastDay === t) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  state.streak = state.lastDay === yesterday ? state.streak + 1 : 1;
  state.lastDay = t;
  save();
  if (state.streak > 1) track(`streak-${Math.min(state.streak, 30)}`);
})();

// ------------------------------------------------------------ subscriptions (for the UI)

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function snapshot() {
  return { found: [...state.found], streak: state.streak, complete: state.complete, crackedToday: state.crackedDay === today() };
}
export const isComplete = () => state.complete;

// ------------------------------------------------------------ reveal

const sfx = {
  rise: new Howl({ src: ["/sounds/MagicClick1.mp3"], volume: 0.6, preload: true }),
  bell: new Howl({ src: ["/sounds/BellClick1.mp3"], volume: 0.6, preload: true }),
  found: new Howl({ src: ["/sounds/MagicClick2.mp3"], volume: 0.55, preload: true }),
};

/** The seeface1 logo rises out of the dark. `grand` = the full-set version. */
function reveal(grand: boolean) {
  const el = document.createElement("div");
  el.className = "reward-reveal" + (grand ? " grand" : "");
  el.innerHTML = '<img src="/imgs/seeface-logo-transparent.png" alt="" />';
  document.body.appendChild(el);
  sfx.rise.play();
  setTimeout(() => sfx.bell.play(), 900);
  try {
    navigator.vibrate?.(grand ? [80, 60, 80, 60, 300] : [40, 50, 120]);
  } catch {
    // not supported
  }
  setTimeout(() => el.classList.add("leaving"), grand ? 7000 : 4200);
  setTimeout(() => el.remove(), grand ? 8400 : 5400);
}

// ------------------------------------------------------------ api

/** Called for every locked face. Returns true if it was a new sigil. */
export function collect(symbol: string): boolean {
  if (!(SIGILS as readonly string[]).includes(symbol) || state.found.includes(symbol)) return false;
  state.found.push(symbol);
  sfx.found.play();
  track(`sigil-${state.found.length}`);
  if (state.found.length === SIGILS.length && !state.complete) {
    state.complete = true;
    track("collection-complete");
    setTimeout(() => reveal(true), 600);
  }
  save();
  return true;
}

/** Called with the code line after each digit. */
export function checkDailyCode(code: string, dailyPass: string) {
  if (!dailyPass || state.crackedDay === today() || !code.includes(dailyPass)) return;
  state.crackedDay = today();
  track("daily-code-cracked");
  save();
  reveal(false);
}

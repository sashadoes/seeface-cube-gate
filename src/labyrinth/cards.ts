// Teleport cards (⟡): one trip each. Pick a spot on the map and you're there.
// Everyone is told where you appeared, unless you spend one more card to travel
// unseen. Cards recharge on their own, but only while you're in the game:
// one every RECHARGE_S seconds of play, up to MAX_CARDS. The charge in progress
// is kept, so leaving and coming back doesn't lose it.
import { CELL, free, placeOf } from "./maze";
import { PLACE_NAMES } from "./places";
import { LEVELS, levelAtX } from "./zones";

export const TELEPORT_COST = 1;
export const INCOGNITO_COST = 2;
export const MAX_CARDS = 3;
export const RECHARGE_S = 180;
const KEY = "seeface-tp-cards";
const CHARGE_KEY = "seeface-tp-charge";
const SEEN_KEY = "seeface-tp-seen";

const num = (k: string, fallback: number) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? fallback : Number(v) || 0;
  } catch {
    return fallback;
  }
};
const save = (k: string, v: number) => {
  try {
    localStorage.setItem(k, String(v));
  } catch {
    // ignore
  }
};

/** cards in hand (a newcomer starts with one) */
export function readCards() {
  return Math.max(0, Math.min(MAX_CARDS, num(KEY, 1)));
}

/** seconds of play charged towards the next card */
let charge = Math.max(0, Math.min(RECHARGE_S, num(CHARGE_KEY, 0)));
let saved = charge;

const listeners = new Set<(n: number) => void>();
export const onCards = (fn: (n: number) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** add (or spend, with n < 0); returns the new count */
export function addCards(n: number) {
  const v = Math.max(0, Math.min(MAX_CARDS, readCards() + n));
  save(KEY, v);
  listeners.forEach((f) => f(v));
  return v;
}

/** call every frame while playing; returns true when a new card is ready */
export function chargeCards(dt: number) {
  if (readCards() >= MAX_CARDS) {
    charge = 0;
    return false;
  }
  charge += Math.min(dt, 1);
  let ready = false;
  if (charge >= RECHARGE_S) {
    charge -= RECHARGE_S;
    addCards(1);
    ready = true;
  }
  // persist every few seconds of progress, not every frame
  if (ready || Math.abs(charge - saved) >= 5) save(CHARGE_KEY, (saved = charge));
  return ready;
}

/** seconds until the next card (0 when the hand is full) */
export function nextCardIn() {
  return readCards() >= MAX_CARDS ? 0 : Math.max(0, Math.ceil(RECHARGE_S - charge));
}

/** "m:ss" */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** true only the first time a card charges (to explain what it does) */
export function firstCard() {
  try {
    if (localStorage.getItem(SEEN_KEY)) return false;
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    return false;
  }
  return true;
}

/** Where a traveller can land near (x, z): the nearest open cell centre,
 *  never inside the secret dark room and never in furniture. */
export function landingSpot(x: number, z: number) {
  const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
  for (let r = 0; r <= 6; r++) {
    let best: { x: number; z: number } | null = null, bd = Infinity;
    for (let i = ci - r; i <= ci + r; i++)
      for (let j = cj - r; j <= cj + r; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        if (placeOf(i, j)?.kind === "dark") continue;
        const cx = (i + 0.5) * CELL, cz = (j + 0.5) * CELL;
        if (!free(cx, cz, 0.5)) continue;
        const d = Math.hypot(cx - x, cz - z);
        if (d < bd) (bd = d), (best = { x: cx, z: cz });
      }
    if (best) return best;
  }
  return null;
}

/** An untranslated name for where (x, z) is: a place, a secret level, or a corridor. */
export function whereName(x: number, z: number) {
  const pl = placeOf(Math.floor(x / CELL), Math.floor(z / CELL));
  if (pl && pl.kind !== "dark") return PLACE_NAMES[pl.kind];
  const lvl = levelAtX(x);
  if (lvl > 0) return LEVELS[lvl].name;
  return "a corridor";
}

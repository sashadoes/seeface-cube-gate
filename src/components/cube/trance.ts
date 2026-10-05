// Trance: a hidden rhythm combo (no meter). Spin again within ~2.2 s and trance
// rises (max 5); hesitate and it drains. Higher trance keeps the room charged,
// and holding full trance for a while makes the room erupt.
import { track } from "../../analytics";

export const MAX_TRANCE = 5;
const WINDOW_MS = 2200;
const DRAIN_MS = 1400;

let level = 0;
let lastSpin = 0;
let fullStreak = 0; // spins in a row at max trance
let drainTimer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeTrance(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const getTrance = () => level;

/** Call on every spin. Returns true when full trance has been held long enough to erupt. */
export function tranceSpin(): boolean {
  const now = performance.now();
  const inRhythm = now - lastSpin < WINDOW_MS;
  lastSpin = now;

  if (inRhythm) {
    if (level < MAX_TRANCE) {
      level += 1;
      if (level === MAX_TRANCE) track("trance-max");
    }
  } else {
    level = Math.max(level - 2, 1);
  }
  fullStreak = level === MAX_TRANCE ? fullStreak + 1 : 0;
  emit();

  // drain while the player hesitates
  clearInterval(drainTimer);
  drainTimer = setInterval(() => {
    if (performance.now() - lastSpin < WINDOW_MS) return;
    level = Math.max(level - 1, 0);
    fullStreak = 0;
    emit();
    if (level === 0) clearInterval(drainTimer);
  }, DRAIN_MS);

  if (fullStreak > 0 && fullStreak % 8 === 0) {
    track("trance-eruption");
    return true;
  }
  return false;
}

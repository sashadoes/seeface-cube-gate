// Coming back: where you were and how your run stood, so a returning player
// continues instead of starting over (and skips the cube gate). Kept in this
// browser for 7 days; a death clears it (the next run starts at the entrance).
export type Resume = { x: number; z: number; yaw: number; light: number; shards: number; depth: number; metres: number; place: string; at: number };

const KEY = "seeface-resume";
const ENTERED = "seeface-entered";
const MAX_AGE = 7 * 86_400_000;

export function readResume(): Resume | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? "null") as Resume | null;
    if (!r || Date.now() - r.at > MAX_AGE || ![r.x, r.z, r.yaw].every(Number.isFinite)) return null;
    return r;
  } catch {
    return null;
  }
}

export function saveResume(r: Omit<Resume, "at">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...r, at: Date.now() }));
  } catch {
    // ignore
  }
}

export function clearResume() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** has this browser been inside the labyrinth before? (then the cube gate is skipped) */
export function hasEntered() {
  try {
    return localStorage.getItem(ENTERED) === "1";
  } catch {
    return false;
  }
}

export function markEntered() {
  try {
    localStorage.setItem(ENTERED, "1");
  } catch {
    // ignore
  }
}

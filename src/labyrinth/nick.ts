// Nicknames in the labyrinth: 2–16 letters/numbers/_/., filtered for offensive
// words (same filter as marks). Checked when chosen AND when received.
import { filterMark } from "../marks/filter";

const KEY = "seeface-lab-nick";

export function cleanNick(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const n = raw.trim();
  if (!/^[\p{L}\p{N}_.]{2,16}$/u.test(n)) return null;
  if (filterMark(n) === null) return null;
  return n;
}

export function savedNick(): string | null {
  try {
    return cleanNick(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function saveNick(n: string) {
  try {
    localStorage.setItem(KEY, n);
  } catch {
    // ignore
  }
}

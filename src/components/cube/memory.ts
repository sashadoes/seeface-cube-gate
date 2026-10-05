// The cube remembers each visitor (per browser, localStorage): how many times
// they came, how many spins in total, how deep they got. Returning visitors are
// greeted, start deeper in the mystery, and meet a colder cube.
const KEY = "seeface-memory";

export type Memory = {
  visits: number;
  spins: number;
  deepest: number; // highest step reached in one visit
  lastVisit: number; // ms timestamp of the previous visit (0 = first time)
};

function load(): Memory {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { visits: 0, spins: 0, deepest: 0, lastVisit: 0, ...JSON.parse(raw) };
  } catch {
    // storage blocked: the cube simply forgets
  }
  return { visits: 0, spins: 0, deepest: 0, lastVisit: 0 };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...memory, lastVisit: Date.now() }));
  } catch {
    // ignore
  }
}

/** Snapshot of what was remembered *before* this visit started. */
export const previous: Memory = load();

export const memory: Memory = { ...previous, visits: previous.visits + 1 };
save();

export const isReturning = previous.visits > 0;

export function recordSpin(step: number) {
  memory.spins += 1;
  memory.deepest = Math.max(memory.deepest, step);
  save();
}

/** A line for a returning visitor, or null on a first visit. */
export function greeting(): string | null {
  if (!isReturning) return null;
  const days = previous.lastVisit ? (Date.now() - previous.lastVisit) / 86400000 : 0;
  const lines = [
    "you came back",
    `visit ${memory.visits}`,
    previous.spins > 0 ? `${previous.spins} spins. it counted every one` : "you only looked last time",
    "it remembers your hands",
    previous.deepest < 6 ? "you left too early last time" : "deeper this time",
    days > 2 ? `${Math.floor(days)} days. it waited` : "so soon",
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

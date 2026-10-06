// A player's progress. Always kept in this browser; when they register
// (optional) it's also saved to their account so it follows them to any device.
// ◈ and the best distance keep their old storage keys so nobody loses anything.

export type Progress = {
  blood: number;
  best: number; // longest single run, metres
  metres: number; // all runs together
  runs: number;
  levels: number[]; // secret levels found (1–3)
};

const BLOOD_KEY = "seeface-blood";
const BEST_KEY = "seeface-lab-best";
const MORE_KEY = "seeface-progress";

const num = (k: string) => {
  try {
    return Number(localStorage.getItem(k) || 0) || 0;
  } catch {
    return 0;
  }
};
const put = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // private mode / blocked: progress just won't survive a reload
  }
};

export function readProgress(): Progress {
  let more = { metres: 0, runs: 0, levels: [] as number[] };
  try {
    more = { ...more, ...JSON.parse(localStorage.getItem(MORE_KEY) ?? "{}") };
  } catch {
    // ignore
  }
  return { blood: num(BLOOD_KEY), best: num(BEST_KEY), metres: more.metres, runs: more.runs, levels: more.levels };
}

export function writeProgress(p: Progress) {
  put(BLOOD_KEY, String(Math.max(0, Math.round(p.blood))));
  put(BEST_KEY, String(Math.max(0, Math.round(p.best))));
  put(MORE_KEY, JSON.stringify({ metres: Math.round(p.metres), runs: p.runs, levels: p.levels }));
  changed.forEach((f) => f());
}

const changed = new Set<() => void>();
/** called whenever progress changes (used to save it to the account) */
export function onProgress(fn: () => void) {
  changed.add(fn);
  return () => changed.delete(fn);
}

export function noteRun(metres: number) {
  const p = readProgress();
  p.runs += 1;
  p.metres += metres;
  p.best = Math.max(p.best, metres);
  writeProgress(p);
}

export function noteLevel(level: number) {
  const p = readProgress();
  if (level > 0 && !p.levels.includes(level)) {
    p.levels = [...p.levels, level].sort();
    writeProgress(p);
  }
}

/** a ◈ change from the game (wishes.ts keeps writing the same key) */
export function noteBlood() {
  changed.forEach((f) => f());
}

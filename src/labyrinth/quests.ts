// Daily quests: three a day, the same three for everyone (picked from the UTC
// date), so people can talk about them. Doing one pays ◈; doing all three
// pays a bonus. Progress for today is kept in this browser.
export type QuestKind = "walk" | "shards" | "level" | "meet" | "say" | "emote" | "snap" | "relic" | "trade" | "dark" | "treasure" | "wish" | "jump" | "flood" | "place" | "darkroom";

type QuestDef = { kind: QuestKind; goal: number; text: string; reward: number };

const POOL: QuestDef[] = [
  { kind: "walk", goal: 500, text: "walk 500 m", reward: 6 },
  { kind: "walk", goal: 1500, text: "walk 1.5 km without giving up", reward: 15 },
  { kind: "shards", goal: 3, text: "spin 3 room cubes", reward: 8 },
  { kind: "level", goal: 1, text: "fall into a secret level", reward: 15 },
  { kind: "meet", goal: 1, text: "meet a real person", reward: 10 },
  { kind: "say", goal: 3, text: "say 3 things to strangers", reward: 5 },
  { kind: "emote", goal: 3, text: "be weird 3 times (stare, spin, melt…)", reward: 5 },
  { kind: "snap", goal: 1, text: "snapshot a world event", reward: 8 },
  { kind: "relic", goal: 2, text: "pick up 2 relics", reward: 5 },
  { kind: "trade", goal: 1, text: "give the collector a relic", reward: 8 },
  { kind: "dark", goal: 45, text: "survive 45 s with your lantern nearly dead", reward: 10 },
  { kind: "treasure", goal: 1, text: "find a hidden treasure", reward: 6 },
  { kind: "wish", goal: 1, text: "make a wish", reward: 5 },
  { kind: "jump", goal: 25, text: "jump 25 times", reward: 3 },
  { kind: "flood", goal: 1, text: "survive a flood", reward: 12 },
  { kind: "place", goal: 3, text: "visit 3 places (museum, theater, mall…)", reward: 8 },
  { kind: "darkroom", goal: 1, text: "find the secret dark room", reward: 20 },
];

export const ALL_DONE_BONUS = 10;
const KEY = "seeface-quests";

export type QuestView = { kind: QuestKind; text: string; count: number; goal: number; done: boolean; reward: number };

function hash(n: number) {
  let h = Math.imul(n ^ 0x2c1b3c6d, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967295;
}

const today = () => Math.floor(Date.now() / 86_400_000);

/** today's three quests (same for everyone) */
function pick(day: number) {
  const idx: number[] = [];
  for (let k = 0; idx.length < 3 && k < 50; k++) {
    const i = Math.floor(hash(day * 31 + k) * POOL.length);
    // no two of the same kind on one day
    if (!idx.some((j) => POOL[j].kind === POOL[i].kind)) idx.push(i);
  }
  return idx;
}

type Saved = { day: number; counts: number[]; done: boolean[]; bonus: boolean };

export function createQuests() {
  let day = today();
  let idx = pick(day);
  let s: Saved = { day, counts: [0, 0, 0], done: [false, false, false], bonus: false };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (raw && raw.day === day) s = raw;
  } catch {
    // ignore
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // ignore
    }
  };
  const listeners = new Set<() => void>();

  function rollover() {
    if (today() === day) return;
    day = today();
    idx = pick(day);
    s = { day, counts: [0, 0, 0], done: [false, false, false], bonus: false };
    save();
  }

  return {
    list(): QuestView[] {
      rollover();
      return idx.map((i, k) => ({ ...POOL[i], count: Math.min(POOL[i].goal, Math.floor(s.counts[k])), done: s.done[k] }));
    },
    /** something happened; returns what got completed (to pay out and announce) */
    bump(kind: QuestKind, n = 1): { quest: QuestView | null; allDone: boolean } {
      rollover();
      let quest: QuestView | null = null;
      idx.forEach((i, k) => {
        if (POOL[i].kind !== kind || s.done[k]) return;
        s.counts[k] += n;
        if (s.counts[k] >= POOL[i].goal) {
          s.done[k] = true;
          quest = { ...POOL[i], count: POOL[i].goal, done: true };
        }
      });
      let allDone = false;
      if (quest && s.done.every(Boolean) && !s.bonus) {
        s.bonus = true;
        allDone = true;
      }
      // only write when something visible changed (walk/dark bump every frame)
      if (quest || (kind !== "walk" && kind !== "dark")) save();
      else if (Math.random() < 0.02) save();
      if (quest) listeners.forEach((f) => f());
      return { quest, allDone };
    },
    onChange(fn: () => void) {
      listeners.add(fn);
    },
  };
}

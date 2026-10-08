// Daily quests: three a day, the same three for everyone (picked from the UTC
// date), so people can talk about them. Doing one pays ◈; doing all three
// pays a bonus. Progress for today is kept in this browser.
// A newcomer first gets the "first night": three easy quests that show what
// there is to do (a helper, spending ◈ at a TV, a place). Once those are done,
// the daily three open. (Play data 2026-10-08: only 4 of 34 who entered the
// labyrinth ever finished a quest, and those 4 stayed ~6 min instead of ~2.6.)
export type QuestKind = "walk" | "shards" | "level" | "meet" | "say" | "emote" | "snap" | "relic" | "trade" | "dark" | "treasure" | "wish" | "jump" | "flood" | "place" | "darkroom" | "helper" | "order";

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
  { kind: "flood", goal: 1, text: "survive a disaster (flood, tornado, fire, plague)", reward: 12 },
  { kind: "place", goal: 3, text: "visit 3 places (museum, theater, mall…)", reward: 8 },
  { kind: "darkroom", goal: 1, text: "find the secret dark room", reward: 20 },
];

const FIRST: QuestDef[] = [
  { kind: "helper", goal: 1, text: "touch a little helper", reward: 3 },
  { kind: "order", goal: 1, text: "order from an After Life™ TV", reward: 6 },
  { kind: "place", goal: 1, text: "find a place (museum, theater, mall…)", reward: 5 },
];

export const ALL_DONE_BONUS = 10;
const KEY = "seeface-quests";
const FIRST_KEY = "seeface-quests-first";

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

const fresh = (day: number): Saved => ({ day, counts: [0, 0, 0], done: [false, false, false], bonus: false });

export function createQuests() {
  let day = today();
  let idx = pick(day);
  let s = fresh(day);
  // the first night: kept until all three are done (no day rollover)
  let first: Saved | null = fresh(0);
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (raw && raw.day === day) s = raw;
    const f = JSON.parse(localStorage.getItem(FIRST_KEY) ?? "null") as Saved | null;
    // anyone who already did daily quests before this existed skips the first night
    if (f) first = f.bonus ? null : f;
    else if (raw) first = null;
  } catch {
    // ignore
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
      localStorage.setItem(FIRST_KEY, JSON.stringify(first ?? { ...fresh(0), bonus: true }));
    } catch {
      // ignore
    }
  };
  const listeners = new Set<() => void>();

  function rollover() {
    if (today() === day) return;
    day = today();
    idx = pick(day);
    s = fresh(day);
    save();
  }
  // what's on the list right now: the first night, or today's three
  const active = () => (first ? { defs: FIRST, st: first } : { defs: idx.map((i) => POOL[i]), st: s });

  return {
    /** true while the newcomer's first-night quests are on */
    firstNight: () => first !== null,
    list(): QuestView[] {
      rollover();
      const { defs, st } = active();
      return defs.map((q, k) => ({ ...q, count: Math.min(q.goal, Math.floor(st.counts[k])), done: st.done[k] }));
    },
    /** something happened; returns what got completed (to pay out and announce) */
    bump(kind: QuestKind, n = 1): { quest: QuestView | null; allDone: boolean; firstNight: boolean } {
      rollover();
      const { defs, st } = active();
      const wasFirst = first !== null;
      let quest: QuestView | null = null;
      defs.forEach((q, k) => {
        if (q.kind !== kind || st.done[k]) return;
        st.counts[k] += n;
        if (st.counts[k] >= q.goal) {
          st.done[k] = true;
          quest = { ...q, count: q.goal, done: true };
        }
      });
      let allDone = false;
      if (quest && st.done.every(Boolean) && !st.bonus) {
        st.bonus = true;
        allDone = true;
        if (wasFirst) first = null; // the daily three open now
      }
      // only write when something visible changed (walk/dark bump every frame)
      if (quest || (kind !== "walk" && kind !== "dark")) save();
      else if (Math.random() < 0.02) save();
      if (quest) listeners.forEach((f) => f());
      return { quest, allDone, firstNight: wasFirst };
    },
    onChange(fn: () => void) {
      listeners.add(fn);
    },
  };
}

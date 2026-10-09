// /the-eye: turns the players' play journals (src/insight.ts) into answers:
// who spent what, who comes back, where people quit, which features work,
// and plain suggestions for what to improve next. Pure functions, no UI.
import { LOSSES, type Journal } from "../insight";

export type Status = "new today" | "new" | "back today" | "returning" | "lapsed";
const DAY = 86_400_000;

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
export const playMs = (j: Journal) => j.ms.cube + j.ms.lab + j.ms.other;

/** is this a journal we can trust enough to show? (the relay is public) */
export function validJournal(x: unknown): x is Journal {
  const j = x as Journal;
  return (
    !!j &&
    j.v === 1 &&
    typeof j.id === "string" &&
    j.id.length <= 16 &&
    typeof j.first === "number" &&
    typeof j.last === "number" &&
    typeof j.days === "number" &&
    !!j.ms &&
    typeof j.ms.cube === "number" &&
    typeof j.ms.lab === "number" &&
    !!j.did &&
    typeof j.did === "object" &&
    !!j.on &&
    Array.isArray(j.recent) &&
    Array.isArray(j.sess)
  );
}

export function statusOf(j: Journal, now = Date.now()): Status {
  if (now - j.last > 7 * DAY) return "lapsed";
  if (j.days <= 1) return sameDay(j.first, now) ? "new today" : "new";
  return sameDay(j.last, now) ? "back today" : "returning";
}

export const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const has = (j: Journal, ...keys: string[]) => keys.some((k) => (j.did[k] ?? 0) > 0);
const hasPrefix = (j: Journal, prefix: string) => Object.keys(j.did).some((k) => k.startsWith(prefix));

/** dynamic event names folded into families so feature use can be compared */
export function family(event: string) {
  return event
    .replace(/^(depth|chamber|shard|cube-round|return-day|caught)-\d+m?$/, "$1-n")
    .replace(/^npc-([\w-]+)-([\w_]+)$/, (_m, who, act) => (act.startsWith("buy") || act.startsWith("gift") ? `npc-${who}-${act}` : `npc-talk`))
    .replace(/^(src|return-src|vibe)-.+$/, "$1-*");
}

export type Step = { label: string; n: number };
export type Row = { key: string; players: number; times: number };
export type Group = { key: string; players: number; returned: number; medianMs: number };

export type Insights = {
  total: number;
  newToday: number;
  activeToday: number;
  active7: number;
  returning: number;
  /** of players whose first day is over, how many came back another day */
  returnRate: number;
  medianMs: number;
  medianSessionMs: number;
  cubeMs: number;
  labMs: number;
  earned: number;
  /** players who ever spent ◈ */
  spenders: number;
  spent: number;
  lost: number;
  spentOn: Row[];
  earnedFrom: Row[];
  funnel: Step[];
  features: Row[];
  /** what one-day players did last before they left */
  lastActs: Row[];
  bySource: Group[];
  byVibe: Group[];
  suggestions: string[];
};

function groupBy(list: Journal[], key: (j: Journal) => string, now: number): Group[] {
  const m = new Map<string, Journal[]>();
  for (const j of list) {
    const k = key(j);
    m.set(k, [...(m.get(k) ?? []), j]);
  }
  return [...m.entries()]
    .map(([k, js]) => {
      const old = js.filter((j) => !sameDay(j.first, now));
      return { key: k, players: js.length, returned: pct(old.filter((j) => j.days > 1).length, old.length), medianMs: median(js.map(playMs)) };
    })
    .sort((a, b) => b.players - a.players);
}

export function analyse(all: Journal[], now = Date.now()): Insights {
  const list = all.filter((j) => playMs(j) > 0 || Object.keys(j.did).length > 0);
  const total = list.length;
  const old = list.filter((j) => !sameDay(j.first, now)); // had a chance to come back
  const returning = list.filter((j) => j.days > 1).length;

  const reasons = (sign: 1 | -1) => {
    const m = new Map<string, Row>();
    for (const j of list)
      for (const [k, v] of Object.entries(j.on)) {
        if (Math.sign(v) !== sign) continue;
        const key = sign < 0 && LOSSES.has(k) ? `${k} (taken)` : k;
        const r = m.get(key) ?? { key, players: 0, times: 0 };
        r.players += 1;
        r.times += Math.abs(v);
        m.set(key, r);
      }
    return [...m.values()].sort((a, b) => b.times - a.times);
  };

  const fam = new Map<string, Row>();
  for (const j of list) {
    const seen = new Set<string>();
    for (const [k, v] of Object.entries(j.did)) {
      const f = family(k);
      const r = fam.get(f) ?? { key: f, players: 0, times: 0 };
      if (!seen.has(f)) r.players += 1;
      seen.add(f);
      r.times += v;
      fam.set(f, r);
    }
  }
  const features = [...fam.values()].sort((a, b) => b.players - a.players);

  const oneDay = old.filter((j) => j.days === 1);
  const last = new Map<string, Row>();
  for (const j of oneDay) {
    const s = j.sess[j.sess.length - 1];
    const k = s?.end || (j.ms.lab > 0 ? "(in the labyrinth, nothing tracked)" : "(on the cube, never spun)");
    const r = last.get(k) ?? { key: k, players: 0, times: 0 };
    r.players += 1;
    last.set(k, r);
  }

  const inLab = (j: Journal) => j.ms.lab > 0 || has(j, "run-start");
  const funnel: Step[] = [
    { label: "came", n: total },
    { label: "spun the cube", n: list.filter((j) => has(j, "cube-first-spin") || inLab(j)).length },
    { label: "entered the labyrinth", n: list.filter(inLab).length },
    { label: "stayed 1 min", n: list.filter((j) => playMs(j) >= 60_000).length },
    { label: "stayed 5 min", n: list.filter((j) => playMs(j) >= 300_000).length },
    { label: "came back another day", n: returning },
    { label: "3+ days", n: list.filter((j) => j.days >= 3).length },
  ];

  const ins: Insights = {
    total,
    newToday: list.filter((j) => sameDay(j.first, now)).length,
    activeToday: list.filter((j) => sameDay(j.last, now)).length,
    active7: list.filter((j) => now - j.last < 7 * DAY).length,
    returning,
    returnRate: pct(old.filter((j) => j.days > 1).length, old.length),
    medianMs: median(list.map(playMs)),
    medianSessionMs: median(list.flatMap((j) => j.sess.map((s) => s.ms)).filter((ms) => ms > 0)),
    cubeMs: list.reduce((a, j) => a + j.ms.cube, 0),
    labMs: list.reduce((a, j) => a + j.ms.lab, 0),
    earned: list.reduce((a, j) => a + j.earned, 0),
    spenders: list.filter((j) => j.spent > 0).length,
    spent: list.reduce((a, j) => a + j.spent, 0),
    lost: list.reduce((a, j) => a + j.lost, 0),
    spentOn: reasons(-1),
    earnedFrom: reasons(1),
    funnel,
    features,
    lastActs: [...last.values()].sort((a, b) => b.players - a.players),
    bySource: groupBy(list, (j) => j.ref ?? "direct", now),
    byVibe: groupBy(list.filter(inLab), (j) => j.vibe ?? "(none)", now),
    suggestions: [],
  };
  ins.suggestions = suggest(ins, list);
  return ins;
}

/** plain, rule-based hints: where the biggest leak is and what to try */
function suggest(i: Insights, list: Journal[]): string[] {
  const out: string[] = [];
  if (i.total < 10) out.push(`only ${i.total} ${i.total === 1 ? "player has" : "players have"} a journal so far: treat every number here as a hint, not a fact. it gets reliable from ~50.`);
  const f = Object.fromEntries(i.funnel.map((s) => [s.label, s.n]));
  const step = (a: string, b: string) => (f[a] ? 1 - f[b] / f[a] : 0);
  const leaks: [number, string][] = [
    [step("came", "spun the cube"), `${pct(f["came"] - f["spun the cube"], f["came"])}% never touch the cube. the first second has to invite a touch (motion, a hand hint, sound on first tap).`],
    [step("spun the cube", "entered the labyrinth"), `${pct(f["spun the cube"] - f["entered the labyrinth"], f["spun the cube"])}% spin but never reach the labyrinth. the gate may be too long or unclear: try fewer actions to open it.`],
    [step("entered the labyrinth", "stayed 1 min"), `${pct(f["entered the labyrinth"] - f["stayed 1 min"], f["entered the labyrinth"])}% of labyrinth players leave within a minute. the first 60 s need a hook: the dark king, a person or a reward sooner.`],
    [step("stayed 1 min", "stayed 5 min"), `${pct(f["stayed 1 min"] - f["stayed 5 min"], f["stayed 1 min"])}% leave between 1 and 5 minutes. give a clear goal early (quests, a place to find, something to spend ◈ on).`],
  ];
  const worst = leaks.filter(([v]) => v > 0.3).sort((a, b) => b[0] - a[0])[0];
  if (worst) out.push(`biggest leak: ${worst[1]}`);
  if (i.returnRate < 20 && i.total >= 5) out.push(`only ${i.returnRate}% come back another day. give a reason to return tomorrow: a daily gift, a streak, a note waiting, "your plot is waiting".`);
  const earners = list.filter((j) => j.earned > 0);
  const spenders = list.filter((j) => j.spent > 0);
  if (earners.length >= 5 && spenders.length / earners.length < 0.25)
    out.push(`${pct(spenders.length, earners.length)}% of players who earn ◈ ever spend it. make spending visible: show what ◈ buys right when it's earned.`);
  if (i.earned > 0 && i.spent / i.earned < 0.2) out.push(`players keep ${100 - pct(i.spent + i.lost, i.earned)}% of all ◈ earned: there may not be enough worth buying.`);
  const ret = list.filter((j) => j.days > 1), once = list.filter((j) => j.days === 1 && Date.now() - j.first > DAY);
  if (ret.length >= 3 && once.length >= 3) {
    const lift = i.features
      .filter((r) => r.players >= 3)
      .map((r) => {
        const a = ret.filter((j) => Object.keys(j.did).some((k) => family(k) === r.key)).length / ret.length;
        const b = once.filter((j) => Object.keys(j.did).some((k) => family(k) === r.key)).length / once.length;
        return { key: r.key, a, b };
      })
      .filter((x) => x.a - x.b > 0.25)
      .sort((x, y) => y.a - y.b - (x.a - x.b))
      .slice(0, 3);
    if (lift.length)
      out.push(`returners did these far more than one-timers: ${lift.map((x) => `${x.key} (${Math.round(x.a * 100)}% vs ${Math.round(x.b * 100)}%)`).join(", ")}. lead new players to them sooner.`);
  }
  const quit = i.lastActs[0];
  if (quit && quit.players >= 3) out.push(`the most common last thing before someone leaves for good: "${quit.key}" (${quit.players} players). look at that moment.`);
  const vibes = i.byVibe.filter((v) => v.players >= 5 && v.key !== "(none)");
  if (vibes.length >= 2) {
    const best = [...vibes].sort((a, b) => b.medianMs - a.medianMs)[0];
    const worstV = [...vibes].sort((a, b) => a.medianMs - b.medianMs)[0];
    if (best.medianMs > worstV.medianMs * 1.5) out.push(`vibe "${best.key}" keeps people ${fmtTime(best.medianMs)} (median) vs "${worstV.key}" ${fmtTime(worstV.medianMs)}. consider lowering "${worstV.key}"'s weight.`);
  }
  const src = i.bySource.filter((s) => s.players >= 5).sort((a, b) => b.returned - a.returned)[0];
  if (src && src.returned > i.returnRate + 10) out.push(`people from "${src.key}" come back most (${src.returned}%). do more of that.`);
  if (!list.some((j) => hasPrefix(j, "npc-"))) out.push("nobody has talked to the characters yet: they may be hard to find. point to them from the entrance.");
  return out;
}

/** everything in one text block to paste to Claude (or anyone) for a deeper read */
export function exportForAnalysis(all: Journal[], i: Insights) {
  const players = all.map((j) => ({
    nick: j.nick,
    status: statusOf(j),
    days: j.days,
    sessions: j.sessions,
    first: new Date(j.first).toISOString().slice(0, 16),
    last: new Date(j.last).toISOString().slice(0, 16),
    ref: j.ref,
    vibe: j.vibe,
    min_cube: Math.round(j.ms.cube / 60_000),
    min_lab: Math.round(j.ms.lab / 60_000),
    earned: j.earned,
    spent: j.spent,
    lost: j.lost,
    on: j.on,
    did: j.did,
    sessions_recent: j.sess.map((s) => ({ start: new Date(s.t).toISOString().slice(0, 16), min: +(s.ms / 60_000).toFixed(1), ended_after: s.end })),
    best_m: j.best,
    runs: j.runs,
  }));
  const { suggestions, ...summary } = i;
  return [
    "This is play data from seeface.world (a 3D labyrinth game behind a cube page), from the owner's /the-eye page.",
    "Each player is one device. ◈ is the in-game currency (earned by play, never bought). 'did' counts game events; 'on' is ◈ per reason (+ earned, − spent/lost).",
    "Please find: where players drop off, what returning players do differently, what ◈ is spent on and what's ignored, and the 5 most valuable changes to the game, each with the number that supports it.",
    "",
    "SUMMARY",
    JSON.stringify({ ...summary, rule_based_hints: suggestions }),
    "",
    "PLAYERS",
    JSON.stringify(players),
  ].join("\n");
}

// The play journal: what this device did in seeface1, for the owner's /the-eye
// page, so the game can be improved from what people really do.
// It counts: time on the cube / in the labyrinth, ◈ earned, spent (and on what)
// and lost, which days you came (new or returning), sessions and how each one
// ended, and every game event that already goes to GoatCounter (track()).
//
// Kept in localStorage (`sf1.journal`) and shared as ONE retained message per
// device on the relay (`seeface1/lab/v1/stat/<device id>`), so /the-eye sees
// people who played while it was closed. Anonymous: a random device id + the
// nickname the player already shows to everyone. Never emails, IPs or accounts.
// Not sent with Do Not Track / Global Privacy Control. Nothing is recorded on
// /the-eye itself.
// TEMPORARY TRANSPORT: the public relay, like everything else; it moves to our
// own server with the same message shape.
import { shareRetained } from "./online";

// dev builds use their own topic so testing never shows up on the live /the-eye
export const JOURNAL_TOPIC = import.meta.env.DEV ? "seeface1/dev/v1/stat" : "seeface1/lab/v1/stat";
const KEY = "sf1.journal";
const NICK_KEY = "seeface-lab-nick";
const VIBE_KEY = "seeface-vibe";
const SESSION_GAP = 30 * 60_000; // 30 min away = a new session
const TICK_MS = 5_000;
const SHARE_MS = import.meta.env.DEV ? 10_000 : 60_000;
const MAX_KEYS = 140;
const MAX_RECENT = 30;
const MAX_SESSIONS = 12;
/** ◈ that was taken from the player (not chosen): counts as "lost", not "spent" */
export const LOSSES = new Set(["knifed", "plague", "popqueen"]);
/** too frequent to be interesting in the timeline (still counted) */
const QUIET = /^(jump|time-|music-|depth-|chamber-|shard-|blood-|weather-|dream-loaded|vibe-|src-)/;

export type Session = { t: number; ms: number; page: string; end: string };
export type Journal = {
  v: 1;
  id: string;
  nick: string | null;
  first: number;
  last: number;
  /** distinct days with a visit */
  days: number;
  lastDay: number;
  sessions: number;
  ref: string | null;
  vibe: string | null;
  /** visible time in ms per page */
  ms: { cube: number; lab: number; other: number };
  earned: number;
  spent: number;
  lost: number;
  /** ◈ per reason, signed: + earned, − spent/lost */
  on: Record<string, number>;
  /** how many times each game event happened */
  did: Record<string, number>;
  /** the last events [time, name] */
  recent: [number, string][];
  /** the last sessions, newest last; `end` = the last thing that happened */
  sess: Session[];
  /** progress snapshot */
  blood: number;
  best: number;
  metres: number;
  runs: number;
};

const localDay = (t = Date.now()) => Math.floor((t - new Date(t).getTimezoneOffset() * 60_000) / 86_400_000);
const page = () => (location.pathname.startsWith("/labyrinth") ? "lab" : location.pathname === "/" || location.pathname === "" ? "cube" : "other");
const off = () =>
  location.pathname.startsWith("/the-eye") ||
  (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true ||
  navigator.doNotTrack === "1";

let j: Journal | null = null;
let dirty = false;
let started = false;

function fresh(): Journal {
  const now = Date.now();
  const q = new URLSearchParams(location.search);
  const ref = (q.get("ref") || q.get("utm_source") || (q.get("with") ? "invite" : "") || "").toLowerCase();
  return {
    v: 1,
    id: Math.random().toString(36).slice(2, 12),
    nick: null,
    first: now,
    last: now,
    days: 1,
    lastDay: localDay(now),
    sessions: 1,
    ref: /^[\w-]{1,40}$/.test(ref) ? ref : null,
    vibe: null,
    ms: { cube: 0, lab: 0, other: 0 },
    earned: 0,
    spent: 0,
    lost: 0,
    on: {},
    did: {},
    recent: [],
    sess: [{ t: now, ms: 0, page: page(), end: "" }],
    blood: 0,
    best: 0,
    metres: 0,
    runs: 0,
  };
}

function load(): Journal | null {
  if (j) return j;
  if (off()) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Journal | null;
    j = raw && raw.v === 1 && typeof raw.id === "string" ? raw : fresh();
  } catch {
    j = fresh();
  }
  return j;
}

/** a new day or a long break starts a new session (and maybe a new visit day) */
function touch(now = Date.now()) {
  const d = load();
  if (!d) return null;
  const day = localDay(now);
  if (day !== d.lastDay) {
    d.days += 1;
    d.lastDay = day;
  }
  if (now - d.last > SESSION_GAP) {
    d.sessions += 1;
    d.sess.push({ t: now, ms: 0, page: page(), end: "" });
    if (d.sess.length > MAX_SESSIONS) d.sess.splice(0, d.sess.length - MAX_SESSIONS);
  }
  d.last = now;
  dirty = true;
  return d;
}

function bump(map: Record<string, number>, key: string, n: number) {
  if (!(key in map) && Object.keys(map).length >= MAX_KEYS) return;
  map[key] = (map[key] ?? 0) + n;
}

/** every GoatCounter event lands here too (see analytics.ts) */
export function noteEvent(name: string) {
  const d = touch();
  if (!d) return;
  bump(d.did, name, 1);
  if (!QUIET.test(name)) {
    d.recent.push([Date.now(), name]);
    if (d.recent.length > MAX_RECENT) d.recent.splice(0, d.recent.length - MAX_RECENT);
    d.sess[d.sess.length - 1].end = name;
  }
}

/** a ◈ change (wishes.ts addBlood): n is the real change, why says what for */
export function noteBloodChange(n: number, why: string) {
  if (!n) return;
  const d = touch();
  if (!d) return;
  if (n > 0) d.earned += n;
  else if (LOSSES.has(why)) d.lost -= n;
  else d.spent -= n;
  bump(d.on, why, n);
}

function snapshot(d: Journal) {
  try {
    d.nick = localStorage.getItem(NICK_KEY) || d.nick;
    d.vibe = (JSON.parse(localStorage.getItem(VIBE_KEY) ?? "null") as { id?: string } | null)?.id ?? d.vibe;
    d.blood = Number(localStorage.getItem("seeface-blood") || 0) || 0;
    d.best = Number(localStorage.getItem("seeface-lab-best") || 0) || 0;
    const more = JSON.parse(localStorage.getItem("seeface-progress") ?? "{}") as { metres?: number; runs?: number };
    d.metres = Math.round(more.metres ?? 0);
    d.runs = more.runs ?? 0;
  } catch {
    // ignore
  }
}

function save() {
  if (!j || !dirty) return;
  snapshot(j);
  try {
    localStorage.setItem(KEY, JSON.stringify(j));
  } catch {
    // full / blocked: the journal just won't survive a reload
  }
}

let lastShared = "";
function share() {
  if (!j) return;
  save();
  const body = JSON.stringify(j);
  if (body === lastShared) return;
  if (shareRetained(`${JOURNAL_TOPIC}/${j.id}`, body)) lastShared = body;
}

/** start counting time and sharing the journal (main.tsx) */
export function startJournal() {
  if (started || !load()) return;
  started = true;
  touch();
  let prev = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(now - prev, TICK_MS * 2);
    prev = now;
    if (document.hidden || !j) return;
    const d = touch(now)!;
    d.ms[page() as keyof Journal["ms"]] += dt;
    d.sess[d.sess.length - 1].ms += dt;
    save();
  }, TICK_MS);
  // early, so people who look and leave within seconds are seen on the eye too
  // (GoatCounter counts them on load; the eye used to wait 15 s and miss them)
  setTimeout(share, 4_000);
  setInterval(share, SHARE_MS);
  document.addEventListener("visibilitychange", () => document.hidden && share());
  window.addEventListener("pagehide", share);
}

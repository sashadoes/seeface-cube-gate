// Vibes: different looks for the same labyrinth, split-tested on real visitors.
// A vibe only changes the picture on your own screen (the film pass + glow);
// the world, the walls, the people and everything you do together are shared.
//
//   · each visitor gets one vibe at random, the same one all day (`seeface-vibe`)
//   · arriving through an invite (?with=<id>&v=<vibe>) gives you your friend's vibe
//   · ?vibe=<id> forces one (testing)
//
// GoatCounter per vibe: vibe-<id> (entered), vibe-<id>-1m / -5m / -15m (time
// on screen inside), vibe-<id>-returned (came back on a later day within 7
// days, credited to the vibe they had before). Compare these to pick winners,
// then change WEIGHTS (0 retires a vibe) and deploy.
import { track } from "../analytics";

export type VibeId = "clean" | "archive" | "cctv" | "dream" | "noir";

export type Vibe = {
  id: VibeId;
  /** 0 = colour, 1 = black and white */
  mono: number;
  tint: [number, number, number];
  contrast: number;
  /** pastel split toning (teal shadows, pink highlights) */
  split: number;
  /** lifts the blacks into a soft haze */
  lift: number;
  scan: number;
  /** the rolling tape tracking band */
  band: number;
  /** the picture tears near the dark king and drops out now and then */
  signal: boolean;
  chroma: number;
  grain: number;
  vignette: number;
  fisheye: number;
  bloom: number;
};

export const VIBES: Record<VibeId, Vibe> = {
  // the look from before vibes existed: the control group
  clean: { id: "clean", mono: 0, tint: [1, 1, 1], contrast: 1, split: 0, lift: 0, scan: 0, band: 0, signal: false, chroma: 0, grain: 0.045, vignette: 0.9, fisheye: 0, bloom: 0.55 },
  // lost signal: old tape, washed out, tears near the king
  archive: { id: "archive", mono: 0.22, tint: [1.02, 1, 0.9], contrast: 1, split: 0, lift: 0, scan: 0.1, band: 1, signal: true, chroma: 0.0015, grain: 0.05, vignette: 0.9, fisheye: 0, bloom: 0.55 },
  // a security camera someone is watching
  cctv: { id: "cctv", mono: 1, tint: [0.78, 1, 0.82], contrast: 1.15, split: 0, lift: 0.03, scan: 0.14, band: 0.5, signal: true, chroma: 0.001, grain: 0.08, vignette: 1.2, fisheye: 0.35, bloom: 0.4 },
  // soft pastel haze, slow and hypnotic
  dream: { id: "dream", mono: 0, tint: [1, 1, 1], contrast: 0.92, split: 0.55, lift: 0.07, scan: 0, band: 0, signal: false, chroma: 0.0025, grain: 0.02, vignette: 0.6, fisheye: 0, bloom: 0.95 },
  // hard black and white, crushed shadows
  noir: { id: "noir", mono: 1, tint: [1, 1, 1], contrast: 1.25, split: 0, lift: 0.03, scan: 0, band: 0, signal: false, chroma: 0, grain: 0.07, vignette: 1.3, fisheye: 0, bloom: 0.4 },
};

/** Share of new visitors per vibe. 0 = retired. */
export const WEIGHTS: Record<VibeId, number> = { clean: 1, archive: 1, cctv: 1, dream: 1, noir: 1 };

const KEY = "seeface-vibe";
const DAY = 86_400_000;
const isVibe = (v: unknown): v is VibeId => typeof v === "string" && v in VIBES;

function pickRandom(): VibeId {
  const ids = (Object.keys(WEIGHTS) as VibeId[]).filter((k) => WEIGHTS[k] > 0);
  let r = Math.random() * ids.reduce((a, k) => a + WEIGHTS[k], 0);
  for (const k of ids) {
    r -= WEIGHTS[k];
    if (r <= 0) return k;
  }
  return "clean";
}

let current: Vibe | null = null;

/** This visitor's vibe for today (picked once, then remembered). */
export function myVibe(): Vibe {
  if (current) return current;
  const today = Math.floor(Date.now() / DAY);
  const q = new URLSearchParams(location.search);
  let saved: { day: number; id: VibeId } | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    // ignore
  }
  if (saved && !isVibe(saved.id)) saved = null;
  // came back on a later day: that counts for the vibe they had
  if (saved && saved.day < today && today - saved.day <= 7) track(`vibe-${saved.id}-returned`);

  let id: VibeId;
  const forced = q.get("vibe"), friend = q.get("v");
  if (isVibe(forced)) id = forced;
  else if (q.get("with") && isVibe(friend)) id = friend;
  else if (saved && saved.day === today) id = saved.id;
  else id = pickRandom();
  try {
    localStorage.setItem(KEY, JSON.stringify({ day: today, id }));
  } catch {
    // ignore
  }
  current = VIBES[id];
  return current;
}

/** Count entering + time on screen for this visitor's vibe. Returns a stop function. */
export function trackVibe(): () => void {
  const v = myVibe();
  track(`vibe-${v.id}`);
  const marks: [number, string][] = [
    [60, "1m"],
    [300, "5m"],
    [900, "15m"],
  ];
  let seconds = 0;
  const timer = setInterval(() => {
    if (document.hidden) return;
    seconds++;
    for (const [at, name] of marks) if (seconds === at) track(`vibe-${v.id}-${name}`);
  }, 1000);
  return () => clearInterval(timer);
}

// Pre-launch: the cube's real job on a first visit. While the visitor plays
// with it, the world is downloaded and the device is sized up:
//   · the Service Worker fetches the labyrinth's code, sounds and the entrance's
//     wall pictures (warm.ts), reporting progress
//   · the graphics chip is read from a throwaway WebGL context and the first
//     graphics tier is guessed and saved, so the labyrinth's very first frame
//     already runs at the right weight (the real frame-rate check then runs
//     hidden behind the arrival light, Labyrinth.tsx)
//   · the gate's own sounds are decoded in advance (portal.ts)
// The cube charges up as it loads (alive.ts glow). Once everything is there,
// it's "ready": the next spin opens the gate (gate.ts). No text, no bar.
import { warmNow } from "../../warm";
import { guessDevice, probeGpu } from "../../labyrinth/deviceGuess";
import { hasSavedSettings, setSettings } from "../../labyrinth/settings";
import { preparePortal } from "./portal";

export type Prelaunch = { progress: number; ready: boolean };

const MIN_MS = 1800; // the cube always gets a moment to be played with
const MAX_MS = 40_000; // a stalled download never keeps anyone out (the labyrinth loads it itself)

let state: Prelaunch = { progress: 0, ready: false };
const listeners = new Set<(s: Prelaunch) => void>();
let started = false;

export const prelaunchState = () => state;

export function onPrelaunch(fn: (s: Prelaunch) => void) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

function set(next: Prelaunch) {
  if (state.ready && !next.ready) return;
  if (next.progress === state.progress && next.ready === state.ready) return;
  state = next;
  listeners.forEach((f) => f(state));
}

export function startPrelaunch() {
  if (started) return;
  started = true;
  const t0 = performance.now();
  let loaded = 0; // 0–1 of the files
  let warmDone = false;
  let soundsDone = false;

  const tick = () => {
    const time = Math.min(1, (performance.now() - t0) / MIN_MS);
    const ready = (warmDone && soundsDone && time >= 1) || performance.now() - t0 > MAX_MS;
    set({ progress: ready ? 1 : Math.min(loaded, time, 0.99), ready });
    if (!ready) setTimeout(tick, 120);
  };
  tick();

  // the device: a guess right now (a few ms), saved for the labyrinth's first frame
  setTimeout(() => {
    const gpu = probeGpu();
    if (gpu !== null && !hasSavedSettings()) setSettings({ quality: guessDevice(gpu).hint });
  }, 0);

  void preparePortal().finally(() => (soundsDone = true));

  void warmNow((p) => (loaded = p.total ? p.done / p.total : 0)).then(() => {
    // done, or it can't warm here (dev, test site, private mode): the labyrinth loads on entry
    loaded = 1;
    warmDone = true;
  });
}

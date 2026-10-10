// Smooth on every device:
//   · describeDevice: what the device is (deviceGuess.ts, shared with the cube
//     page's pre-launch) + a first guess; bench() + decideTier(): the first-visit check
//     (a ~2.5 s frame-rate measurement on the high look) picks low/medium/high
//   · onStruggle: still too slow at the lowest sharpness for 8 s → the game
//     drops a tier (with a notice)
//   · dynamic resolution: watches the frame time and lowers the sharpness when
//     the device struggles, raising it again when there's room
//   · learned sharpness: the resolution a device settles at on its tier is
//     remembered (seeface-perf-learned), so the next visit starts there instead
//     of stuttering for the first seconds while it finds it again. It still
//     climbs back up whenever there's room (never starts below 0.7).
//   · a light budget: only the nearest N lights are on (every light costs the
//     graphics chip on every pixel). Exactly N stay on at all times, so
//     three.js never has to recompile its shaders while you walk.
import * as THREE from "three";
import { PROFILES, type Tier } from "./tiers";
import { gpuName, guessDevice, type Device } from "./deviceGuess";

export type { Tier };

export type { Device };

export function describeDevice(renderer: THREE.WebGLRenderer): Device {
  return guessDevice(gpuName(renderer.getContext()));
}

/** The old guess (no check), still used until the first-visit check has run. */
export const detectTier = (renderer: THREE.WebGLRenderer): Tier => describeDevice(renderer).hint;

/**
 * The tier from the frame-rate check (run with the HIGH look, ~2.5 s) and the
 * device guess. A device that keeps ~60 fps on high stays on high (an iPhone 16
 * Pro does); a weak chip never gets high from one lucky check.
 */
export function decideTier(d: Device, fps: number): Tier {
  let t: Tier = fps >= 50 ? "high" : fps >= 33 ? "medium" : "low";
  if (d.hint === "low" && t === "high") t = "medium";
  if (d.mem <= 2) t = "low";
  return t;
}

const LEARNED = "seeface-perf-learned";
type Learned = { tier: Tier; scale: number; at: number };

function readLearned(): Learned | null {
  try {
    const v = JSON.parse(localStorage.getItem(LEARNED) ?? "null");
    // a month old: the browser, the OS or the phone may have changed
    return v && typeof v.scale === "number" && Date.now() - v.at < 30 * 864e5 ? (v as Learned) : null;
  } catch {
    return null;
  }
}

function saveLearned(l: Learned) {
  try {
    localStorage.setItem(LEARNED, JSON.stringify(l));
  } catch {
    // private mode
  }
}

/** where to start the dynamic resolution for this tier (1 = full sharpness) */
export function startScale(tier: Tier) {
  const l = readLearned();
  return l && l.tier === tier ? Math.max(0.7, Math.min(1, l.scale)) : 1;
}

export const LIGHT_BUDGET: Record<Tier, number> = { low: PROFILES.low.lights, medium: PROFILES.medium.lights, high: PROFILES.high.lights };

export function createPerf(renderer: THREE.WebGLRenderer, scene: THREE.Scene, onPixelRatio: (pr: number) => void) {
  let base = 1; // the pixel ratio the quality setting asks for
  let scale = 1; // dynamic resolution on top (0.55–1)
  let budget = LIGHT_BUDGET.medium;
  let target = 1000 / 60; // ms per frame the tier aims for (its fps cap)
  let acc = 0, frames = 0, good = 0, lightTick = 0;
  let hold = false; // the frame-rate check: no resolution changes meanwhile
  let bench: { ms: number[]; until: number; done: (fps: number) => void } | null = null;
  let slowFor = 0; // seconds in a row at the lowest resolution and still slow
  let struggling: (() => void) | null = null;
  // for the metrics: frames and time since the last report
  let statFrames = 0, statTime = 0, worst = 0;
  // learning: the average sharpness over real play (not idle, not measuring), saved every 20 s
  let tier: Tier = "medium";
  let learnSum = 0, learnN = 0, learnAt = performance.now();
  const tmp = new THREE.Vector3();

  function apply() {
    const pr = Math.max(0.5, base * scale);
    renderer.setPixelRatio(pr);
    onPixelRatio(pr);
  }

  return {
    setQuality(pixelRatio: number, t: Tier) {
      base = pixelRatio;
      tier = t;
      scale = hold ? 1 : startScale(t);
      learnSum = learnN = 0;
      budget = LIGHT_BUDGET[t];
      target = 1000 / PROFILES[t].fps;
      slowFor = 0;
      apply();
    },
    /** measure the real frame rate for `ms` (resolution held still); resolves with the average fps */
    bench(ms: number) {
      return new Promise<number>((done) => {
        hold = true;
        scale = 1;
        apply();
        bench = { ms: [], until: performance.now() + ms, done };
      });
    },
    /** called when the device stays too slow even at the lowest resolution (once per tier) */
    onStruggle(fn: () => void) {
      struggling = fn;
    },
    /** average fps and the slowest frame since the last call (for the metrics) */
    takeStats() {
      const out = { fps: statTime > 0 ? Math.round(statFrames / statTime) : 0, worstMs: Math.round(worst * 1000) };
      statFrames = statTime = worst = 0;
      return out;
    },
    /** call once per frame with the real frame time */
    frame(dtReal: number, camera: THREE.Camera) {
      statFrames++;
      statTime += dtReal;
      worst = Math.max(worst, dtReal);
      if (bench) {
        bench.ms.push(dtReal * 1000);
        if (performance.now() >= bench.until) {
          const b = bench;
          bench = null;
          hold = false;
          // drop the first few frames (shaders compiling) and average the rest
          const ms = b.ms.slice(Math.min(10, Math.floor(b.ms.length / 4)));
          const avg = ms.reduce((a, x) => a + x, 0) / Math.max(1, ms.length);
          b.done(avg > 0 ? 1000 / avg : 0);
        }
      }
      // ---- dynamic resolution (checked every second)
      acc += dtReal;
      frames++;
      if (acc >= 1) {
        const ms = (acc / frames) * 1000;
        if (hold) {
          // measuring: leave the resolution alone
        } else if (ms > target * 1.55 && scale > 0.55) {
          scale = Math.max(0.55, scale - 0.1);
          good = 0;
          apply();
        } else if (ms < target * 1.08) {
          good++;
          if (good >= 4 && scale < 1) {
            scale = Math.min(1, scale + 0.05);
            good = 0;
            apply();
          }
        } else good = 0;
        // ---- safety net: already at the lowest sharpness and still under ~60% of the target fps for 8 s
        if (!hold && scale <= 0.56 && ms > target * 1.65) {
          slowFor += acc;
          if (slowFor >= 8 && struggling) {
            slowFor = -1e9; // once per tier (setQuality resets it)
            struggling();
          }
        } else if (slowFor > 0) slowFor = 0;
        if (!hold) {
          learnSum += scale;
          learnN++;
          if (performance.now() - learnAt > 20_000 && learnN >= 10) {
            learnAt = performance.now();
            const avg = learnSum / learnN;
            const old = readLearned();
            // ease towards it, so one hot minute doesn't decide the next visit
            const next = old && old.tier === tier ? old.scale * 0.6 + avg * 0.4 : avg;
            saveLearned({ tier, scale: Math.round(next * 100) / 100, at: Date.now() });
            learnSum = learnN = 0;
          }
        }
        acc = 0;
        frames = 0;
      }
      // ---- light budget (twice a second): exactly N point lights on, the nearest ones
      lightTick -= dtReal;
      if (lightTick > 0) return;
      lightTick = 0.5;
      const lights: THREE.PointLight[] = [];
      scene.traverse((o) => {
        if ((o as THREE.PointLight).isPointLight) lights.push(o as THREE.PointLight);
      });
      const cam = camera.getWorldPosition(tmp);
      const scored = lights.map((l) => {
        const d = l.getWorldPosition(new THREE.Vector3()).distanceTo(cam);
        // lights that are switched off (intensity 0) go last
        return { l, s: l.intensity > 0 ? d : 1e6 + d };
      });
      scored.sort((a, b) => a.s - b.s);
      scored.forEach((x, k) => (x.l.visible = k < budget));
    },
    info: () => ({ base, scale, budget, fpsCap: Math.round(1000 / target) }),
  };
}

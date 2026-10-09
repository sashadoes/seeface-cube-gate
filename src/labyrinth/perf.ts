// Smooth on every device:
//   · describeDevice: what the device is (name, graphics chip, cores, memory,
//     screen) + a first guess; bench() + decideTier(): the first-visit check
//     (a ~2.5 s frame-rate measurement on the high look) picks low/medium/high
//   · onStruggle: still too slow at the lowest sharpness for 8 s → the game
//     drops a tier (with a notice)
//   · dynamic resolution: watches the frame time and lowers the sharpness when
//     the device struggles, raising it again when there's room
//   · a light budget: only the nearest N lights are on (every light costs the
//     graphics chip on every pixel). Exactly N stay on at all times, so
//     three.js never has to recompile its shaders while you walk.
import * as THREE from "three";
import { PROFILES, type Tier } from "./tiers";

export type { Tier };

/** What we can tell about this device (for the first-visit check and the metrics). */
export type Device = { label: string; gpu: string; cores: number; mem: number; dpr: number; screen: string; phone: boolean; hint: Tier };

const GPU_NAME = /(Apple [MA]\d+[\w ]*?(?= ?,|$)|Apple GPU|Adreno \(TM\) \d+|Adreno \d+|Mali-[\w-]+|PowerVR [\w ]+|Intel\(R\) [\w ]*Graphics[\w ]*|NVIDIA GeForce [\w ]+|GeForce [\w ]+|AMD Radeon[\w ]*|Radeon[\w ]*|Xclipse \d+)/i;
const WEAK_GPU = /Mali-[4T]|Mali-G(31|51|52|57)|Adreno \(TM\) [3-5]\d\d|Adreno [3-5]\d\d|PowerVR|SGX|Intel\(R\) HD Graphics [2-5]\d{2,3}\b/i;

export function describeDevice(renderer: THREE.WebGLRenderer): Device {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 4; // Safari doesn't say: 4 = "unknown, ordinary"
  const phone = matchMedia("(pointer: coarse)").matches;
  let gpu = "";
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
  } catch {
    // unknown
  }
  const ua = navigator.userAgent;
  const model = /Android [\d.]+; ([^;)]+)/.exec(ua)?.[1]?.trim();
  const name = /iPhone/.test(ua)
    ? "an iPhone"
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      ? "an iPad"
      : /Android/.test(ua)
        ? model && model !== "K" ? model : phone ? "an Android phone" : "an Android tablet"
        : /Macintosh/.test(ua)
          ? "a Mac"
          : /Windows/.test(ua)
            ? "a Windows PC"
            : /CrOS/.test(ua)
              ? "a Chromebook"
              : "this computer";
  const chip = GPU_NAME.exec(gpu)?.[1]?.trim() ?? "";
  const label = chip && chip !== "Apple GPU" ? `${name} · ${chip}` : name;
  // the first guess, before the frame-rate check
  const weak = WEAK_GPU.test(gpu);
  const apple = /Apple/.test(gpu);
  let hint: Tier = "medium";
  if (mem <= 2 || (phone && weak) || (phone && !apple && (mem <= 3 || cores <= 4))) hint = "low";
  else if (!phone && cores >= 8 && mem >= 8 && !weak) hint = "high";
  else if (weak) hint = "low";
  return { label, gpu, cores, mem, dpr: Math.round(devicePixelRatio * 100) / 100, screen: `${screen.width}x${screen.height}`, phone, hint };
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
  const tmp = new THREE.Vector3();

  function apply() {
    const pr = Math.max(0.5, base * scale);
    renderer.setPixelRatio(pr);
    onPixelRatio(pr);
  }

  return {
    setQuality(pixelRatio: number, tier: Tier) {
      base = pixelRatio;
      scale = 1;
      budget = LIGHT_BUDGET[tier];
      target = 1000 / PROFILES[tier].fps;
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

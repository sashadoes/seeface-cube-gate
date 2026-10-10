// Smooth on every device:
//   · a first guess of the device's power (phone? cores? memory? graphics chip?)
//     picks low / medium / high, unless the player already chose in settings
//   · dynamic resolution: watches the frame time and lowers the sharpness when
//     the device struggles, raising it again when there's room
//   · a light budget: only the nearest N lights are on (every light costs the
//     graphics chip on every pixel). Exactly N stay on at all times, so
//     three.js never has to recompile its shaders while you walk.
//   · if the phone still can't keep up at the lowest sharpness, the quality
//     steps down one level by itself (only while the player hasn't picked one)
import * as THREE from "three";
import { deviceTier, isIOS, reducedMotion, type Tier } from "../device";
import { settings, setSettings, type Settings } from "./settings";

export type { Tier };
const RANK: Record<Tier, number> = { low: 0, medium: 1, high: 2 };

/** the settings a first-time player starts with on this device */
export function autoSettings(renderer: THREE.WebGLRenderer): Partial<Settings> {
  const st: Partial<Settings> = { quality: detectTier(renderer), qualityAuto: true };
  // the phone asks for less motion: no head bob or shakes, calmer flashes
  if (reducedMotion) Object.assign(st, { cameraBob: false, shake: false, flashes: false });
  return st;
}

export function detectTier(renderer: THREE.WebGLRenderer): Tier {
  const dev = deviceTier(); // phone model, in-app browser, data saver (device.ts)
  // Safari hides an iPhone's real core count and graphics chip ("Apple GPU"),
  // so the guess below would wrongly call every iPhone weak: trust device.ts
  if (isIOS) return dev;
  const gpuTier = gpuGuess(renderer);
  return RANK[gpuTier] < RANK[dev] ? gpuTier : dev;
}

function gpuGuess(renderer: THREE.WebGLRenderer): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 4;
  const phone = matchMedia("(pointer: coarse)").matches;
  let gpu = "";
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
  } catch {
    // unknown
  }
  const weakGpu = /Mali-[4T]|Mali-G(31|51|52|57)|Adreno \(TM\) [3-5]\d\d|PowerVR|SGX|Intel\(R\) HD Graphics [2-5]\d{2,3}\b/i.test(gpu);
  if (phone && (mem <= 3 || cores <= 4 || weakGpu)) return "low";
  if (!phone && cores >= 8 && mem >= 8 && !weakGpu) return "high";
  if (weakGpu) return "low";
  return "medium";
}

export const LIGHT_BUDGET: Record<Tier, number> = { low: 5, medium: 9, high: 14 };

export function createPerf(renderer: THREE.WebGLRenderer, scene: THREE.Scene, onPixelRatio: (pr: number) => void) {
  let base = 1; // the pixel ratio the quality setting asks for
  let scale = 1; // dynamic resolution on top (0.55–1)
  let budget = LIGHT_BUDGET.medium;
  let acc = 0, frames = 0, good = 0, lightTick = 0, struggling = 0;
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
      apply();
    },
    /** call once per frame with the real frame time */
    frame(dtReal: number, camera: THREE.Camera) {
      // ---- dynamic resolution (checked every second)
      acc += dtReal;
      frames++;
      if (acc >= 1) {
        const ms = (acc / frames) * 1000;
        if (ms > 26 && scale > 0.55) {
          scale = Math.max(0.55, scale - 0.1);
          good = 0;
          struggling = 0;
          apply();
        } else if (ms > 30 && !document.hidden) {
          // already at the lowest sharpness and still slow: after 6 seconds of
          // this, step the quality down (fewer lights, no glow)
          const st = settings();
          if (++struggling >= 6 && st.qualityAuto && st.quality !== "low") {
            struggling = 0;
            setSettings({ quality: st.quality === "high" ? "medium" : "low", qualityAuto: true });
          }
        } else if (ms < 18) {
          good++;
          if (good >= 4 && scale < 1) {
            scale = Math.min(1, scale + 0.05);
            good = 0;
            apply();
          }
        } else good = 0;
        if (ms <= 30) struggling = 0;
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
    info: () => ({ base, scale, budget }),
  };
}

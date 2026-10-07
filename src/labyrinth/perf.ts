// Smooth on every device:
//   · a first guess of the device's power (phone? cores? memory? graphics chip?)
//     picks low / medium / high, unless the player already chose in settings
//   · dynamic resolution: watches the frame time and lowers the sharpness when
//     the device struggles, raising it again when there's room
//   · a light budget: only the nearest N lights are on (every light costs the
//     graphics chip on every pixel). Exactly N stay on at all times, so
//     three.js never has to recompile its shaders while you walk.
import * as THREE from "three";

export type Tier = "low" | "medium" | "high";

export function detectTier(renderer: THREE.WebGLRenderer): Tier {
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
  let acc = 0, frames = 0, good = 0, lightTick = 0;
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
          apply();
        } else if (ms < 18) {
          good++;
          if (good >= 4 && scale < 1) {
            scale = Math.min(1, scale + 0.05);
            good = 0;
            apply();
          }
        } else good = 0;
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

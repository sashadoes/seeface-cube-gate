// Anonymous performance metrics, so we can see which devices struggle.
// Sent through track() (GoatCounter events + the device's play journal for
// /the-eye) as bucketed names only: no ids, no exact numbers, no GPU strings.
//   perf-page-<bucket>        navigation → the labyrinth's code is ready
//   perf-enter-<bucket>       tap "enter" → the first frame of the world (time to interactive)
//   perf-fps-<tier>-<class>-<bucket>   average fps over the first minute of active play
//   perf-heap-<bucket>        JS heap after that minute (Chrome/Android only)
// <class> = phone|tablet|desktop + graphics family (apple, adreno, mali, intel, nvidia, amd, other).
import { track } from "../analytics";
import type { Device } from "./perf";

const MODULE_AT = performance.now(); // the labyrinth chunk was downloaded and evaluated

const secs = (ms: number) => (ms < 1000 ? "lt1s" : ms < 2000 ? "1-2s" : ms < 4000 ? "2-4s" : ms < 8000 ? "4-8s" : "8s+");
const fpsBucket = (f: number) => (f < 20 ? "lt20" : f < 30 ? "20-29" : f < 45 ? "30-44" : f < 55 ? "45-54" : "55+");

export function deviceClass(d: Device) {
  const form = d.phone ? (Math.min(screen.width, screen.height) >= 600 ? "tablet" : "phone") : "desktop";
  const g = d.gpu;
  const fam = /Apple/i.test(g) ? "apple" : /Adreno/i.test(g) ? "adreno" : /Mali/i.test(g) ? "mali" : /Intel/i.test(g) ? "intel" : /NVIDIA|GeForce/i.test(g) ? "nvidia" : /AMD|Radeon/i.test(g) ? "amd" : "other";
  return `${form}-${fam}`;
}

export function createPerfMetrics(device: Device) {
  const enterAt = performance.now();
  let first = false;
  let activeFor = 0, frames = 0, sent = false;
  track(`perf-page-${secs(MODULE_AT)}`);
  return {
    /** call every drawn frame with its real duration (s) and whether the player is active */
    frame(dtReal: number, active: boolean, tier: string) {
      if (!first) {
        first = true;
        track(`perf-enter-${secs(performance.now() - enterAt)}`);
      }
      if (sent || !active || document.hidden) return;
      activeFor += dtReal;
      frames++;
      if (activeFor < 60) return;
      sent = true;
      track(`perf-fps-${tier}-${deviceClass(device)}-${fpsBucket(frames / activeFor)}`);
      const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
      if (heap) {
        const mb = heap / 1048576;
        track(`perf-heap-${mb < 100 ? "lt100" : mb < 200 ? "100-200" : mb < 400 ? "200-400" : "400+"}mb`);
      }
    },
  };
}

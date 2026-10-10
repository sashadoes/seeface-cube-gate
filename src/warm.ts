// Preload: the Service Worker (dist/sw.js, built by scripts/sw.mjs) is
// registered and asked to download the labyrinth's first-frame files in the
// background, so entering the labyrinth (and every repeat visit) is almost
// instant.
//   · the cube page (pre-launch, prelaunch.ts) starts it at once and follows the
//     progress: the cube charges up while it downloads
//   · every page also starts it once the page is idle (a second request just
//     joins the one already running)
// On a save-data or slow connection only the code and sounds are fetched (the
// labyrinth needs them anyway), not the wall pictures.
import { IS_TEST } from "./stage";

type Conn = { saveData?: boolean; effectiveType?: string };

export function slowConnection() {
  const c = (navigator as Navigator & { connection?: Conn }).connection;
  return !!c && (c.saveData === true || /(^|-)2g$|^3g$/.test(c.effectiveType ?? ""));
}

const whenIdle = (fn: () => void) => {
  const go = () => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 1500));
  if (document.readyState === "complete") go();
  else addEventListener("load", go, { once: true });
};

// the Architects' pages (invite, chamber, review, rooms) never preload the labyrinth:
// artists arrive from Instagram, often on mobile data, and the chamber needs the bandwidth
const NO_WARM = /^\/(the-eye|architects|chamber|admin|room)(\/|$)/;

/** can this visit warm at all? (not in dev, on the test site, or without Service Workers) */
export const canWarm = () => import.meta.env.PROD && !IS_TEST && "serviceWorker" in navigator;

export type WarmProgress = { done: number; total: number };

/**
 * Warm now and report progress. Resolves true when everything is cached,
 * false when it can't warm (no Service Worker, private mode, blocked).
 */
export async function warmNow(onProgress?: (p: WarmProgress) => void): Promise<boolean> {
  if (!canWarm()) return false;
  try {
    await navigator.serviceWorker.register("/sw.js");
    const reg = await navigator.serviceWorker.ready;
    const worker = reg.active;
    if (!worker) return false;
    return await new Promise<boolean>((done) => {
      const on = (e: MessageEvent) => {
        if (e.data?.type === "warm-progress") onProgress?.({ done: e.data.done, total: e.data.total });
        else if (e.data?.type === "warmed") {
          navigator.serviceWorker.removeEventListener("message", on);
          done(true);
        }
      };
      navigator.serviceWorker.addEventListener("message", on);
      worker.postMessage({ type: "warm", images: !slowConnection() });
    });
  } catch {
    // private mode / blocked: the site works the same, just without the cache
    return false;
  }
}

export function startWarm() {
  if (!canWarm() || NO_WARM.test(location.pathname)) return;
  whenIdle(() => void warmNow());
}

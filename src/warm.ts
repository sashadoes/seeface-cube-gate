// Preload on landing: once the page is idle, the Service Worker (dist/sw.js,
// built by scripts/sw.mjs) is registered and asked to download the labyrinth's
// first-frame files in the background, so entering the labyrinth (and every
// repeat visit) is almost instant. Nothing heavy is fetched on a save-data or
// slow connection; the worker still caches whatever the visitor loads anyway.
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

export function startWarm() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || location.pathname.startsWith("/the-eye")) return;
  whenIdle(async () => {
    try {
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      if (!slowConnection()) reg.active?.postMessage({ type: "warm" });
    } catch {
      // private mode / blocked: the site works the same, just without the cache
    }
  });
}

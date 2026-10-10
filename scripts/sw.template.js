// seeface1 Service Worker (generated from scripts/sw.template.js by scripts/sw.mjs).
//   · /assets/* (hashed, never change)  → cache first
//   · /imgs, /sounds                    → cache first, refreshed in the background
//   · picsum wall/floor/art images      → cache first (only proper CORS answers), max PICS_MAX
//   · pages (HTML)                      → network first, the cached copy when offline
//   · everything else (/api, /the-eye, /dream, music, videos, analytics) → untouched
// "warm" (sent by the cube page right away, other pages when the browser is
// idle) downloads the labyrinth's first-frame files at low priority.
const VERSION = "__VERSION__";
const WARM = __WARM__;
const ASSETS = `sf-assets-${VERSION}`;
const PAGES = "sf-pages";
const STATIC = "sf-static";
const PICS = "sf-pics";
const PICS_MAX = 160;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // keep this version's assets and the one before it (an open tab from the
      // last deploy may still ask for its lazy chunks)
      const names = (await caches.keys()).filter((n) => n.startsWith("sf-assets-") && n !== ASSETS);
      const keep = names.slice(-1);
      await Promise.all(names.filter((n) => !keep.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

// The cube page asks for progress ("warm-progress" {done, total}) so the cube can
// charge up while it downloads, and "warmed" when it's all there. `images: false`
// (slow / save-data connections) skips the wall pictures but still fetches the
// code and sounds, which the labyrinth needs anyway.
let warming = null;
let progress = { done: 0, total: 0 };
const watchers = new Set();
const tell = (msg) => watchers.forEach((c) => c.postMessage(msg));
self.addEventListener("message", (e) => {
  if (e.data?.type !== "warm") return;
  if (e.source) {
    watchers.add(e.source);
    e.source.postMessage({ type: "warm-progress", ...progress });
  }
  if (!warming) {
    const list = e.data.images === false ? WARM.filter((u) => !u.startsWith("http")) : WARM;
    progress = { done: 0, total: list.length };
    warming = (async () => {
      for (const url of list) {
        const req = new Request(url, url.startsWith("http") ? { mode: "cors", credentials: "omit" } : {});
        const cache = await caches.open(cacheFor(new URL(req.url)));
        if (!(await cache.match(req))) {
          try {
            // one at a time and low priority, so the page itself never waits
            const res = await fetch(req, { priority: "low" });
            if (keepable(res)) await cache.put(req, res);
          } catch {
            // offline or blocked: try again on the next visit
          }
        }
        progress.done++;
        tell({ type: "warm-progress", ...progress });
      }
      tell({ type: "warmed", version: VERSION });
      watchers.clear();
      warming = null; // a later visit's message re-checks (all cache hits: instant)
    })();
  }
  e.waitUntil(warming);
});

function cacheFor(url) {
  if (url.hostname === "picsum.photos" || url.hostname.endsWith(".picsum.photos")) return PICS;
  if (url.pathname.startsWith("/assets/")) return ASSETS;
  return STATIC;
}

const keepable = (res) => res && res.ok && (res.type === "basic" || res.type === "cors");

async function trimPics() {
  const c = await caches.open(PICS);
  const keys = await c.keys();
  for (let k = 0; k < keys.length - PICS_MAX; k++) await c.delete(keys[k]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;

  if (same && req.mode === "navigate") {
    if (url.pathname.startsWith("/the-eye")) return;
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const copy = res.clone();
            e.waitUntil(caches.open(PAGES).then((c) => c.put(url.pathname, copy)));
          }
          return res;
        } catch {
          return (await caches.match(url.pathname, { cacheName: PAGES })) ?? (await caches.match("/", { cacheName: PAGES })) ?? Response.error();
        }
      })(),
    );
    return;
  }

  const pic = url.hostname === "picsum.photos";
  const fixed = same && url.pathname.startsWith("/assets/");
  const fresh = same && (url.pathname.startsWith("/imgs/") || url.pathname.startsWith("/sounds/"));
  if (!pic && !fixed && !fresh) return;

  e.respondWith(
    (async () => {
      const cache = await caches.open(cacheFor(url));
      // older asset caches still answer for an open tab from the previous deploy
      const hit = (await cache.match(req)) ?? (fixed ? await caches.match(req) : undefined);
      const update = fetch(req).then(async (res) => {
        if (keepable(res)) {
          await cache.put(req, res.clone());
          if (pic) await trimPics();
        }
        return res;
      });
      if (hit) {
        if (fresh) e.waitUntil(update.catch(() => {}));
        return hit;
      }
      return update;
    })(),
  );
});

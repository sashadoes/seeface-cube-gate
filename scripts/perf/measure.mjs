// Before/after performance numbers on a throttled mid-range-phone profile.
// No dependencies: drives the installed Google Chrome over the DevTools
// protocol and serves each build with a tiny static server.
//
//   node scripts/perf/measure.mjs <dist-dir> [<dist-dir> …]   (label = folder name)
//   TIER=low|medium|high node scripts/perf/measure.mjs …  → the same graphics tier on every build
//   (default: each build picks its own, like a real first visit)
//   LONG=<seconds> → instead of the steps below: one long walk, live GL textures sampled every 30 s
//   (shows whether graphics memory keeps growing during a long visit)
//
// Profile: 4× slower CPU, "slow 4G" (150 ms RTT, 1.6 Mbps down), 390×844 @3×,
// Android Chrome, touch. The live multiplayer relay, analytics and the API are
// BLOCKED so test players never show up on /the-eye or in the online count.
// Per build, in a fresh browser profile:
//   1. landing (/?cube): first contentful paint, load, bytes; then 12 s idle
//      (the new build warms the labyrinth in the background here)
//   2. /labyrinth/: time until the name screen is ready (code downloaded + run),
//      tap enter → first world frame, bytes
//   3. 30 s walking (W + turns): game frames/s, main-thread busy %, JS heap,
//      live WebGL textures + their memory (counted by hooks injected here)
//   4. 35 s without input: frames/s + busy % (idle throttle)
//   5. repeat visit to /labyrinth/ (same profile): code-ready time + bytes
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dirs = process.argv.slice(2).map((d) => resolve(d));
if (!dirs.length) {
  console.error("usage: node scripts/perf/measure.mjs <dist-dir> [<dist-dir> …]");
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- static server (like GitHub Pages)
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".xml": "application/xml", ".txt": "text/plain" };
function serve(dir, port) {
  const srv = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let f = join(dir, p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
    let status = 200;
    if (!existsSync(f)) (f = join(dir, "404.html")), (status = 404);
    const body = readFileSync(f);
    res.writeHead(status, { "content-type": TYPES[extname(f)] ?? "application/octet-stream", "cache-control": "max-age=600" });
    res.end(body);
  });
  return new Promise((r) => srv.listen(port, () => r(srv)));
}

// ---------------------------------------------------------------- Chrome + DevTools protocol
async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "sf-perf-"));
  const chrome = spawn(CHROME, ["--headless=new", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const ws = await new Promise((res, rej) => {
    let buf = "";
    chrome.stderr.on("data", (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) res(m[1]);
    });
    setTimeout(() => rej(new Error("chrome did not start")), 15000);
  });
  return { chrome, http: ws.replace("ws://", "http://").replace(/\/devtools\/.*/, "") };
}

async function openPage(http) {
  const t = await (await fetch(`${http}/json/new?about:blank`, { method: "PUT" })).json();
  const sock = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => sock.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  sock.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method) listeners.forEach((f) => f(m));
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      sock.send(JSON.stringify({ id: n, method, params }));
    });
  const on = (f) => (listeners.add(f), () => listeners.delete(f));
  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, on, evaluate, close: () => sock.close() };
}

// injected before any page script: counts game frames (a rAF in which WebGL drew) and live textures
const HOOKS = `(() => {
  const w = window; w.__pf = { frames: 0, drew: false, tex: 0, texBytes: 0 };
  const sizes = new WeakMap(), bound = {};
  for (const C of [w.WebGLRenderingContext, w.WebGL2RenderingContext]) {
    if (!C) continue;
    const P = C.prototype;
    for (const k of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const f = P[k]; if (!f) continue;
      P[k] = function () { w.__pf.drew = true; return f.apply(this, arguments); };
    }
    const create = P.createTexture, del = P.deleteTexture, bind = P.bindTexture, img = P.texImage2D, store = P.texStorage2D;
    P.createTexture = function () { w.__pf.tex++; return create.apply(this, arguments); };
    P.deleteTexture = function (t) { if (t) { w.__pf.tex--; w.__pf.texBytes -= sizes.get(t) ?? 0; sizes.delete(t); } return del.apply(this, arguments); };
    P.bindTexture = function (target, t) { bound[target] = t; return bind.apply(this, arguments); };
    const note = (target, wd, ht) => { const t = bound[target === 34069 || (target > 34069 && target < 34075) ? 34067 : target]; if (!t || !wd || !ht) return; const b = wd * ht * 4 * 1.33; w.__pf.texBytes += b - (sizes.get(t) ?? 0); sizes.set(t, b); };
    P.texImage2D = function (target, level) { if (level === 0) { const a = arguments; if (a.length >= 8) note(target, a[3], a[4]); else { const s = a[5]; note(target, s?.width ?? s?.videoWidth, s?.height ?? s?.videoHeight); } } return img.apply(this, arguments); };
    if (store) P.texStorage2D = function (target, levels, fmt, wd, ht) { note(target, wd, ht); return store.apply(this, arguments); };
  }
  const tick = () => { if (w.__pf.drew) w.__pf.frames++; w.__pf.drew = false; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();`;

async function measure(dir, port) {
  const label = basename(resolve(dir, ".."));
  const srv = await serve(dir, port);
  const { chrome, http } = await launch();
  const page = await openPage(http);
  const { send, on, evaluate } = page;
  const origin = `http://localhost:${port}`;
  let bytes = 0, swHits = 0;
  on((m) => {
    if (m.method === "Network.loadingFinished") bytes += m.params.encodedDataLength;
    if (m.method === "Network.responseReceived" && m.params.response.fromServiceWorker) swHits++;
  });
  const takeBytes = () => {
    const b = bytes;
    bytes = 0;
    return Math.round(b / 1024);
  };
  await send("Network.enable");
  await send("Page.enable");
  await send("Performance.enable");
  await send("Network.setBlockedURLs", { urls: ["*emqx*", "*hivemq*", "*goatcounter*", "*gc.zgo.at*", "*:8787*", "*onrender.com*"] });
  await send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36" });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: HOOKS });
  const metrics = async () => Object.fromEntries((await send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const waitFor = async (expr, ms = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await evaluate(expr).catch(() => false)) return Date.now() - t0;
      await sleep(50);
    }
    throw new Error(`timeout: ${expr}`);
  };
  const out = { label };

  // 1. landing
  await send("Page.navigate", { url: `${origin}/?cube` });
  await waitFor("document.readyState === 'complete'");
  Object.assign(
    out,
    await evaluate(`({ landingFcpMs: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0), landingLoadMs: Math.round(performance.getEntriesByType('navigation')[0].loadEventEnd) })`),
  );
  await sleep(12000);
  out.landingKB = takeBytes(); // includes the background warm-up, if any

  // 2. the labyrinth, first visit
  swHits = 0;
  await send("Page.navigate", { url: `${origin}/labyrinth/` });
  await waitFor("!!document.querySelector('button[type=submit]')");
  out.labReadyMs = await evaluate("Math.round(performance.now())");
  out.labFromSW = swHits;
  if (process.env.TIER) {
    // settings are read when the code loads: write them, then load the page again
    await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('seeface-settings') ?? '{}'); localStorage.setItem('seeface-settings', JSON.stringify({ ...s, quality: '${process.env.TIER}' })); localStorage.setItem('seeface-graphics', JSON.stringify({ device: 'test', recommended: '${process.env.TIER}', fps: 0, chosen: 'manual', at: Date.now() })); })()`);
    await send("Page.reload");
    await sleep(300);
    await waitFor("!!document.querySelector('button[type=submit]')");
  }
  const tEnter = await evaluate(`new Promise((res) => { const t0 = performance.now(); document.querySelector('button[type=submit]').click(); const poll = () => { if (document.querySelector('canvas') && __pf.frames > 0) res(Math.round(performance.now() - t0)); else setTimeout(poll, 16); }; poll(); })`);
  out.enterToFirstFrameMs = tEnter;
  out.timeToInteractiveMs = out.labReadyMs + tEnter;
  // the new build's first-visit device check: take the recommendation (like most players)
  await waitFor("!!document.querySelector('.lab-gfx-actions .primary') || !document.querySelector('.lab-gfx') && performance.now() > " + (out.labReadyMs + tEnter + 2000), 15000).catch(() => 0);
  out.tier = await evaluate(`(() => { const b = document.querySelector('.lab-gfx-rec b')?.textContent; document.querySelector('.lab-gfx-actions .primary')?.click(); return b ?? JSON.parse(localStorage.getItem('seeface-settings') ?? '{}').quality ?? '?'; })()`);
  await sleep(3000);
  out.labKB = takeBytes();

  const key = (type, k, code, vk) => send("Input.dispatchKeyEvent", { type, key: k, code, windowsVirtualKeyCode: vk });
  if (process.env.LONG) {
    const total = Number(process.env.LONG) * 1000;
    const samples = [];
    const start = Date.now();
    let turn = 0;
    await key("keyDown", "w", "KeyW", 87);
    while (Date.now() - start < total) {
      await sleep(2600);
      // alternate turning left and right so the walk wanders through new corridors
      const [k, c, vk] = turn++ % 3 === 2 ? ["ArrowRight", "ArrowRight", 39] : ["ArrowLeft", "ArrowLeft", 37];
      await key("keyDown", k, c, vk);
      await sleep(380);
      await key("keyUp", k, c, vk);
      if (samples.length < Math.floor((Date.now() - start) / 30000)) samples.push(await evaluate("[Math.round(performance.now() / 1000), __pf.tex, +(__pf.texBytes / 1048576).toFixed(1)]"));
    }
    await key("keyUp", "w", "KeyW", 87);
    out.long = samples.map(([t, n, mb]) => `${t}s: ${n} tex ${mb} MB`);
    page.close();
    chrome.kill();
    srv.close();
    return out;
  }

  // 3. walk for 30 s
  const m0 = await metrics();
  const f0 = await evaluate("__pf.frames");
  const t0 = Date.now();
  await key("keyDown", "w", "KeyW", 87);
  while (Date.now() - t0 < 30000) {
    await sleep(2600);
    await key("keyDown", "ArrowLeft", "ArrowLeft", 37);
    await sleep(380);
    await key("keyUp", "ArrowLeft", "ArrowLeft", 37);
  }
  await key("keyUp", "w", "KeyW", 87);
  await send("HeapProfiler.collectGarbage"); // heap after a GC, not whenever the last one happened
  const m1 = await metrics();
  const f1 = await evaluate("__pf.frames");
  const secs = (Date.now() - t0) / 1000;
  out.walkFps = +((f1 - f0) / secs).toFixed(1);
  out.walkBusyPct = Math.round(((m1.TaskDuration - m0.TaskDuration) / secs) * 100);
  out.heapMB = +(m1.JSHeapUsedSize / 1048576).toFixed(1);
  out.tierUsed = await evaluate("JSON.parse(localStorage.getItem('seeface-settings') ?? '{}').quality ?? '?'");
  Object.assign(out, await evaluate("({ glTextures: __pf.tex, glTextureMB: +(__pf.texBytes / 1048576).toFixed(1) })"));

  // 4. 35 s without input (the last 5 s measured)
  await sleep(30000);
  const m2 = await metrics();
  const f2 = await evaluate("__pf.frames");
  await sleep(5000);
  const m3 = await metrics();
  const f3 = await evaluate("__pf.frames");
  out.idleFps = +((f3 - f2) / 5).toFixed(1);
  out.idleBusyPct = Math.round(((m3.TaskDuration - m2.TaskDuration) / 5) * 100);
  takeBytes();

  // 5. repeat visit
  swHits = 0;
  await send("Page.navigate", { url: `${origin}/labyrinth/` });
  await waitFor("!!document.querySelector('button[type=submit]')");
  out.repeatLabReadyMs = await evaluate("Math.round(performance.now())");
  await sleep(1500);
  out.repeatKB = takeBytes();
  out.repeatFromSW = swHits;
  out.glRenderer = await evaluate(`(() => { try { const g = document.createElement('canvas').getContext('webgl'); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; } catch { return '?'; } })()`);

  page.close();
  chrome.kill();
  srv.close();
  return out;
}

const results = [];
let port = 5401;
for (const d of dirs) {
  process.stderr.write(`measuring ${d} …\n`);
  results.push(await measure(d, port++));
}
console.log(JSON.stringify(results, null, 1));

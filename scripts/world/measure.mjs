// Measures the built world like a mid-range phone: Pixel 7 viewport, CPU throttled 4×, "fast 4G"
// network. Prints first-load bytes (transferred), time-to-playable, and fps while walking.
// Needs `vite build` first; serves dist with `vite preview` on :4319.
// node scripts/world/measure.mjs [--json]
import { chromium, devices } from "@playwright/test";
import { spawn } from "node:child_process";

const PORT = 4319;
const preview = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1800));
const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
try {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  let bytes = 0;
  cdp.on("Network.loadingFinished", (e) => (bytes += e.encodedDataLength));
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/world/?flags=-onboarding`, { waitUntil: "load" });
  await page.waitForFunction(() => performance.getEntriesByName("world-playable").length > 0, null, { timeout: 30000 });
  const playable = await page.evaluate(() => Math.round(performance.getEntriesByName("world-playable")[0].startTime));
  const firstLoad = bytes;
  // walk around for 8 s and sample fps
  const fps = await page.evaluate(async () => {
    const g = window.__world.game;
    const samples = [];
    for (let i = 0; i < 16; i++) {
      g.input.move.y = 1;
      g.input.move.x = Math.sin(i);
      await new Promise((r) => setTimeout(r, 500));
      samples.push(g.stats().fps);
    }
    g.input.move.x = g.input.move.y = 0;
    return { min: Math.min(...samples), median: samples.sort((a, b) => a - b)[8], stats: g.stats() };
  });
  const out = { firstLoadKB: Math.round(firstLoad / 1024), timeToPlayableMs: playable, wallMs: Date.now() - t0, fps, profile: "Pixel 7 viewport, CPU 4x throttle, 9 Mbps/60 ms, desktop GPU via Chrome" };
  console.log(process.argv.includes("--json") ? JSON.stringify(out) : out);
} finally {
  await browser.close();
  preview.kill();
}

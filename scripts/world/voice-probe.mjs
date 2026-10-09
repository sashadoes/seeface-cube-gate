// Two real browser pages: B speaks into Chrome's fake microphone (a beep), A must hear it.
import { chromium, devices } from "@playwright/test";
const url = process.argv[2] ?? "http://localhost:5311/world/?flags=-onboarding";
const browser = await chromium.launch({ channel: "chrome", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const mk = async (label) => {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], permissions: ["microphone"] });
  const p = await ctx.newPage();
  p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && !m.text().includes("goatcounter") && console.log(`[${label}]`, m.text().slice(0, 200)));
  p.on("pageerror", (e) => console.log(`[${label} pageerror]`, e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.__world?.ui.get().connected, null, { timeout: 15000 });
  await p.evaluate(() => window.__world.session.ageMock());
  await p.waitForFunction(() => window.__world.ui.get().age === "verified");
  await p.mouse.click(10, 300); // a gesture → AudioContext resumes
  return p;
};
const B = await mk("B"), A = await mk("A");
await B.evaluate(() => window.__world.session.jumpTo("night-shift"));
await A.evaluate(() => window.__world.session.jumpTo("night-shift"));
await A.waitForFunction(() => window.__world.ui.get().room === "night-shift", null, { timeout: 15000 });
await B.waitForFunction(() => window.__world.ui.get().room === "night-shift", null, { timeout: 15000 });
const t0 = Date.now();
await B.evaluate(() => window.__world.session.talk(true));
const heard = await A.waitForFunction(() => window.__world.ui.get().heardVoice, null, { timeout: 20000 }).then(() => true, () => false);
const out = await A.evaluate(() => ({ voices: window.__world.session.voices.count(), act: window.__world.session.voices.activity(), rooms: window.__world.ui.get().rooms.find((r) => r.id === "night-shift") }));
console.log(JSON.stringify({ heard, msToHear: Date.now() - t0, ...out }));
if (process.argv[3]) { await A.evaluate(() => { const g = window.__world.game; g.input.look.pitch = 0.5; }); await A.waitForTimeout(800); await A.screenshot({ path: process.argv[3] }); }
await browser.close();

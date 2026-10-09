// B talks in a room; A opens the radio at spawn, hears the 3 s preview, then jumps in.
import { chromium, devices } from "@playwright/test";
const url = process.argv[2] ?? "http://localhost:5311/world/?flags=-onboarding";
const shot = process.argv[3];
const browser = await chromium.launch({ channel: "chrome", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const mk = async (label) => {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], permissions: ["microphone"] });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(`[${label} pageerror]`, e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.__world?.ui.get().connected, null, { timeout: 15000 });
  await p.evaluate(() => window.__world.session.ageMock());
  await p.waitForFunction(() => window.__world.ui.get().age === "verified");
  await p.mouse.click(10, 300);
  return p;
};
const B = await mk("B");
await B.evaluate(() => window.__world.session.jumpTo("cryptid-hotline"));
await B.waitForFunction(() => window.__world.ui.get().room === "cryptid-hotline", null, { timeout: 15000 });
await B.evaluate(() => window.__world.session.talk(true));
const A = await mk("A");
await A.waitForFunction(() => window.__world.ui.get().rooms.find((r) => r.id === "cryptid-hotline")?.people === 1, null, { timeout: 10000 });
await A.getByTestId("radio").click();
await A.waitForTimeout(600);
const station = await A.locator(".w-st-name").textContent();
const heard = await A.waitForFunction(() => window.__world.ui.get().heardVoice, null, { timeout: 8000 }).then(() => true, () => false);
if (shot) await A.screenshot({ path: shot });
// spin away and back: ticks + static
const coins0 = await A.evaluate(() => window.__world.ui.get().coins);
await A.getByTestId("jump-in").click();
const landed = await A.waitForFunction(() => window.__world.ui.get().room === "cryptid-hotline", null, { timeout: 12000 }).then(() => true, () => false);
const coins1 = await A.evaluate(() => window.__world.ui.get().coins);
console.log(JSON.stringify({ station, heardPreview: heard, landed, spinQuestCoins: coins1 - coins0 }));
await browser.close();

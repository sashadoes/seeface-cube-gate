// The success test from the brief: a brand-new user on a phone hears a real human voice within
// 30 seconds, with zero instructions read. Two real browser contexts: "B" is the human already
// talking (Chrome's fake microphone plays a tone), "A" is the newcomer.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

type W = { __world: { ui: { get: () => Record<string, unknown> }; session: { ageMock: () => void; jumpTo: (r: string) => void; talk: (on: boolean) => Promise<void> } } };

test("land → onboard → fall into busiest room → hear voice → press MIC", async ({ browser }) => {
  // B: someone already talking in The Night Shift
  const bctx = await browser.newContext();
  const B = await bctx.newPage();
  await B.goto("/world/?flags=-onboarding");
  await B.waitForFunction(() => (window as unknown as W).__world?.ui.get().connected);
  await B.evaluate(() => (window as unknown as W).__world.session.ageMock());
  await B.waitForFunction(() => (window as unknown as W).__world.ui.get().age === "verified");
  await B.mouse.click(5, 300);
  await B.evaluate(() => (window as unknown as W).__world.session.jumpTo("night-shift"));
  await B.waitForFunction(() => (window as unknown as W).__world.ui.get().room === "night-shift", null, { timeout: 15_000 });
  await B.evaluate(() => (window as unknown as W).__world.session.talk(true));

  // A: a brand-new phone user
  const actx = await browser.newContext();
  const A = await actx.newPage();
  const t0 = Date.now();
  await A.goto("/world/");
  await A.getByTestId("onb-phones").click();
  await A.getByTestId("onb-name").fill("newbie");
  await A.getByTestId("blob-imp").click();
  await A.getByTestId("onb-age").click();
  await expect(A.getByTestId("onb-go")).toBeEnabled();
  await A.getByTestId("onb-go").click();
  for (let i = 0; i < 3; i++) await A.getByTestId("onb-cards").click();
  const onboardedMs = Date.now() - t0;

  // auto-drop into the busiest room (where B is talking)
  await A.waitForFunction(() => (window as unknown as W).__world.ui.get().room === "night-shift", null, { timeout: 15_000 });
  const inRoomMs = Date.now() - t0;
  await A.waitForFunction(() => (window as unknown as W).__world.ui.get().heardVoice === true, null, { timeout: 30_000 });
  const firstVoiceMs = Date.now() - t0;
  expect(firstVoiceMs).toBeLessThan(30_000);

  // press and hold MIC: A goes live and B hears A
  const mic = A.getByTestId("mic");
  const box = (await mic.boundingBox())!;
  await A.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await A.mouse.down();
  await A.waitForFunction(() => (window as unknown as W).__world.ui.get().live === "talk");
  await B.evaluate(() => (window as unknown as W).__world.session.talk(false));
  await B.waitForFunction(() => (window as unknown as W).__world.ui.get().heardVoice === true, null, { timeout: 15_000 });
  await A.mouse.up();
  await A.waitForFunction(() => (window as unknown as W).__world.ui.get().live === false);
  await expect(A.getByTestId("quest")).toBeVisible();

  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/first-voice.json", JSON.stringify({ onboardedMs, inRoomMs, firstVoiceMs, at: new Date().toISOString() }, null, 2));
  console.log({ onboardedMs, inRoomMs, firstVoiceMs });
});

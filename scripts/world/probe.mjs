// Dev probe: open the world in headless Chromium (mobile profile), run a JS snippet, screenshot.
// node scripts/world/probe.mjs <url> <out.png> [jsFile]
import { chromium, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
const [url, out, js] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ ...devices[process.env.DESKTOP ? "Desktop Chrome" : "Pixel 7"], permissions: ["microphone"] });
const page = await ctx.newPage();
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log("[console]", m.type(), m.text().slice(0, 300)));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(url);
await page.waitForTimeout(1500);
if (js) console.log(JSON.stringify(await page.evaluate(readFileSync(js, "utf8")), null, 1));
await page.screenshot({ path: out });
await browser.close();

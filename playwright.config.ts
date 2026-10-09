import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5174",
    ...devices["Pixel 7"],
    channel: "chrome",
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    },
    permissions: ["microphone"],
  },
  webServer: [
    { command: "WORLD_PORT=8797 WORLD_STORE=memory node server/world/index.ts", port: 8797, reuseExistingServer: false },
    { command: "VITE_WORLD_WS=ws://localhost:8797 npx vite --port 5174 --strictPort", port: 5174, reuseExistingServer: false },
  ],
});

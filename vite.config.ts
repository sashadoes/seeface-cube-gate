import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      // the world is its own page (its own small first load, none of the cube's code)
      input: { main: resolve(__dirname, "index.html"), world: resolve(__dirname, "world/index.html") },
    },
  },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});

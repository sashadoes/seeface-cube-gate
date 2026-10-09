# Progress — metrics per milestone

How they're measured: `npm run build && npm run measure` (`scripts/world/measure.mjs`). That means a Pixel 7 viewport,
CPU throttled 4×, network at 9 Mbps / 60 ms, and system Chrome headless. **Caveat:** the GPU is the Mac's,
not a phone's, so fps is CPU-bound evidence only. Real mid-range Android and iPhone runs are still TODO (needs a device in hand).

| Milestone | First load (transferred) | Time to playable | fps (min / median, walking) | Draw calls | Time to first voice |
|---|---|---|---|---|---|
| Targets | < 5 MB | < 3 s | 60 | < 100 | < 30 s |
| M1 movement + labyrinth | 234 KB | 0.96 s | 60 / 60 | 19 | n/a |
| M2 rooms + voice | — | — | — | — | **0.68 s** from mic press to heard (2 real Chrome pages, mesh, localhost; 3/3 runs) |
| M3 radio | — | — | — | — | preview heard ≤ 1 s after the dial locks (radio probe) |
| M4 onboarding (e2e) | 249 KB | 1.06 s | 60 / 60 | 18 | **4.5 s** from landing to first real voice (e2e, automated taps; a human reading the 3 cards adds ~10 s) |
| M5 host + transcripts | — | — | — | — | (server integration tests, no client change in budget) |
| M6 coins + rooms (final build) | **255 KB** | **1.02 s** | **57 / 60** | **26** | **4.5 s** from landing to first real voice (e2e, 2/2 runs) |

Final build: world JS 91 KB + three.js 145 KB + React (gzip). Measured by `npm run measure` on 2026-10-09.

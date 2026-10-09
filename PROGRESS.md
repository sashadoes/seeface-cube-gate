# Progress — metrics per milestone

How they're measured: `npm run build && npm run measure` (`scripts/world/measure.mjs`). That means a Pixel 7 viewport,
CPU throttled 4×, network at 9 Mbps / 60 ms, and system Chrome headless. **Caveat:** the GPU is the Mac's,
not a phone's, so fps is CPU-bound evidence only. Real mid-range Android and iPhone runs are still TODO (needs a device in hand).

| Milestone | First load (transferred) | Time to playable | fps (min / median, walking) | Draw calls | Time to first voice |
|---|---|---|---|---|---|
| Targets | < 5 MB | < 3 s | 60 | < 100 | < 30 s |
| M1 movement + labyrinth | 234 KB | 0.96 s | 60 / 60 | 19 | n/a |
| M2 rooms + voice | (see M3 row, same build) | | | | **0.68 s** mic-press → heard (2 real Chrome pages, mesh, localhost; 3/3 runs) |

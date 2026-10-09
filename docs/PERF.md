# Performance: before / after (2026-10-09)

Measured with `scripts/perf/measure.mjs` (Chrome over the DevTools protocol, no dependencies):
4× slower CPU, "slow 4G" (150 ms RTT, 1.6 Mbps), 390×844 @3×, Android Chrome user agent,
fresh browser profile per build; the live relay, analytics and the API are blocked.
**before** = `main` at f950194, **after** = branch `fix/perf`. The host GPU is an Apple M1 Max,
so frame rates are higher than a real mid-range phone would reach: compare the two columns,
not the absolute numbers. Real-phone fps comes from `?perf` and the `perf-fps-*` metrics.

## Loading (each build picks its own tier, like a real first visit)

| | before | after |
|---|---|---|
| landing page loaded | 2.3 s | 2.1 s |
| labyrinth code ready, first visit after the landing page | 8.3 s | 0.45 s (preloaded by the Service Worker) |
| tap "enter" → first world frame | 7.1 s | 1.4 s |
| **time to interactive in the labyrinth** | **15.4 s** | **1.8 s** |
| bytes downloaded on entering the labyrinth | 1.9 MB | 32 kB (the rest was warmed while on the landing page) |

Repeat visits within GitHub Pages' 10-minute HTTP cache are equally fast in both (~0.44 s, 0 kB).
After that, the old build downloads everything again; the new one is served by the Service Worker.

## Running (the same tier forced on both)

| | medium · before | medium · after | low · before | low · after |
|---|---|---|---|---|
| walking: frames/s | 56.9 | 56.2 | 47.9 | 29 (30 fps cap) |
| walking: main thread busy | 88% | 88% | 81% | **49%** |
| standing idle 35 s: frames/s | 60 | **19** | 60 | **19** |
| standing idle: main thread busy | 72% | **34%** | 68% | **27%** |
| JS heap after a GC | 26.9 MB | 26.4 MB | 26.2 MB | 25.7 MB |
| WebGL texture memory after 30 s | 88 MB | 86 MB | 71 MB | 63 MB |

## Long visit (medium, 5 minutes walking): live WebGL texture memory

| | 1 min | 2 min | 3 min | 4 min | 5 min |
|---|---|---|---|---|---|
| before | 88 MB | 115 MB | 119 MB | 125 MB | **146 MB, still growing** |
| after | 81 MB | 86 MB | 87 MB | 87 MB | **90 MB, flat** |

Main-thread busy % is the best proxy here for heat and battery; the GPU's own load isn't
visible to the harness, but it falls with the same changes (fewer frames when idle, the
30 fps cap and lower resolution on low, nothing drawn during the teleport transit).

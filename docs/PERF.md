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

## The cube as the loader (2026-10-10)

Loading is part of the game now, not a screen in front of it:

- **Pre-launch** (`src/components/cube/prelaunch.ts`): the moment the cube appears, the Service Worker
  starts fetching the labyrinth (code, sounds, entrance pictures; only code + sounds on slow/save-data),
  reporting progress. The graphics chip is read from a throwaway WebGL context and the first tier is
  saved, so the labyrinth's first frame already runs at the right weight. The gate's sounds are decoded.
  The cube's halo charges up with the progress; when everything is in, it breathes slowly and the
  **next spin opens the gate** (at least 3 touches; never more than 40 s of waiting; 1994 still opens at once).
- **The opening** (`portal.ts`): the cube's own click, doubled an octave down and repeated closer and
  higher, over a noise + saw riser, through a ping-pong delay and a generated reverb, landing on a bell
  an octave down with a sub drop. Rings burst on every click; the screen burns white.
- **Arrival**: the labyrinth opens out of the same white, straight into the world (no name screen
  through the gate). On a first visit the frame-rate check runs silently behind the lifting haze and the
  recommended tier is applied (no dialog). A check from a hidden tab or below 8 fps is thrown away.
- **Teleport**: the destination's textures are put on the graphics chip during the 15 s transit
  (two per frame, nothing else is drawn then), and the locations around it start loading.
- **Walking**: every half second the locations ahead (and 25° to each side) start loading, and parked
  textures about to come into view go back on the chip early. The reach grows with the measured
  picture download time.
- **Learned sharpness**: the dynamic resolution a device settles at is remembered per tier
  (`seeface-perf-learned`, 30 days) and the next visit starts there (never below 0.7).

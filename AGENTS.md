# Seeface Cube Gate — brief for agents

## Goal

Turn the handwritten cube prototype into a finished **"hack the password" gate game** for Seeface.

The player spins a 3D cube. **Each spin (each mouse/touch release) locks in the digit on the
face pointing at them, and it appears in the code line at the bottom of the screen.** As the
player progresses, the game triggers fun animations and events: the cube goes dark, the faces
shuffle, the walls open, fire, stars and so on. Cracking today's code opens the gate.

This prototype was extracted from the EverShop store in `../my-evershop-app` (extension
`extensions/sample`). It now runs on its own with Vite + React, with no EverShop and no database.

```bash
npm install
npm run dev        # http://localhost:5173  (riddle screen first)
                   # http://localhost:5173/?screen=cube  (straight to the cube)
npm run typecheck  # currently FAILS: legacy type errors are part of the cleanup
npm run build
```

## Layout

| Path | What it is |
|---|---|
| `src/App.tsx` | Screen flow: riddle (WelcomeForm) → cube → "unlocked". Port of `Entery.tsx` with the gating turned back on. |
| `src/components/cube/Cube.tsx` | **The game.** Cube rotation engine, input, round/step logic and every effect. |
| `src/components/cube/CubeStyle.scss` | Cube, code line, fog, wallpaper/floor tunnel, fire CSS. |
| `src/components/cube/backgrounds/` | Unused effect prototypes: `Stars.js` (canvas warp starfield), `Space.js` (three.js), `Pixi.js` (pixi sprite), `Fire.js` (empty). |
| `src/components/cube/ScriptLoader.js` | Loads `unmute` (iOS audio unlock) from a CDN and also inlines a copy. |
| `src/components/cube/Player.js` | Unused sound helper experiment. |
| `src/components/welcomeForm/` | The riddle screen ("Are you on the list?"). Email "magic link" calls `/api/check/email`, which only exists in EverShop. |
| `src/components/helper.js` | `getYearsDay`, `randomIntFromInterval`, fade and video helpers. |
| `src/config/dailyPass.json` | 380 two-digit codes (digits 1–6). Today's code is `dailyPass[dayOfYear]`. |
| `src/config/magicPass.json` | Bypass codes for returning users (`?special=<code>`). |
| `public/sounds/*.mp3` | Sound effects. Used: SwitchCube, CodeClickInput, CubeErrorCode, CubeLocked, ShuffleCube, ShuffleCubeCodeActive. Unused: BellClick1, MagicClick1/2, SwitchCube1/2. |
| `public/videos/FireCubeBack.mp4` | Fire background video (5.4 MB). Wired up in the markup but its trigger is commented out. |
| `public/imgs/fog*.png` | Fog layers. |
| `reference/evershop-original/` | **Untouched snapshot** of the original files, the EverShop page wrapper, the email API, theme global CSS and the owner's `work.plan`. Read only; don't edit. |

## How the current code works

- **Rotation:** `Viewport` (Cube.tsx ~L400–590) tracks mouse/touch drag into torque with
  inertia, applies `rotateX/rotateY` to `.cube`, and maps the angles to the face pointing at
  the player (`calculatedSide` 1–6). When the face changes it plays `SwitchCube.mp3`, marks
  that face `.active` and mirrors its symbol into `#cube-code-active` (the blinking char at
  the bottom).
- **Input = every release:** `window` `mouseup` → `myFunction` (L683). It appends the active
  face's symbol to `#cube-code`. When the code reaches `maxSteps` (4) it plays the error
  sound, clears the code and starts the next `round`. Then it calls `runCubeBehave()`.
- **Progression:** `runCubeBehave()` (L41) picks an effect by `round`:
  - round 0 → `removeOpacutyCube` (the cube turns solid black, "locked" sound)
  - rounds 1–2 → `shuffleCube` (the faces scramble into numbers, chess symbols, moons and ♔)
  - round 3 → `checkWin()` + `openWallpaper()` (the walls slide apart)
- **Unused effects in the file:** `shuffleActiveCube` (the highlight jumps randomly between
  faces), `shakeCube`, `initStars`, the fire video, the Pixi and three.js backgrounds, and
  the `.fire` CSS.
- **Symbol sets** (`CubeBehave.codes`): numbers 1–6, symbols ♠ ∑ ♖ ♘ ♕ 🀀 ▲, events ☽ ☾,
  luck ♔. The intent seems to be that non-number faces trigger events instead of digits.
  This is not implemented yet.

## Known bugs in the prototype (fix these first)

1. **The game can never be won.** `records` stores the `#cube-code` DOM element (L701, L710)
   instead of the digit. `checkWin` (L286) then compares elements to characters, and its
   loops stop at `length - 1` (off by one). The outer `dailyPass.forEach` doesn't do anything.
2. **`currentStep` is never incremented.** `runCubeBehave` compares it with a fresh random
   0–2 on every call, so effects fire at random about one time in three instead of at
   chosen steps.
3. **Today's password leaks.** It is `console.log`ged at L21, and the whole `dailyPass.json`
   ships in the client bundle. Anyone can open DevTools and read it. See "Security" below.
4. `shakeCube` has a `debugger;` statement (L238), sets margins without `px` units, and is
   never called.
5. Round 3 runs `openWallpaper` on **every** click. `maxRounds` is never used, and nothing
   happens after round 3.
6. `useEffect` has no cleanup: the global mouse/touch listeners and the `setInterval(animate)`
   leak. That's why `main.tsx` doesn't use `<StrictMode>`.
7. Every sound is a `new Howl(...)` per play. Preload them once instead.
8. The wall and floor textures are random `picsum.photos` images (different on every load),
   and the glitter texture is hot-linked from codepen. Replace them with local assets in
   `public/`.
9. `typecheck` errors: `.style` on `Element`/`ParentNode`, numbers assigned to style
   strings, `OLink`.
10. A mouseup anywhere counts as an input, including clicks on UI. A tap without any drag
    also enters a digit.

## Target: what "finished" means

The owner's direction: *each spin → a new digit appears at the bottom → as you progress, a
fun animation or event happens. Make it a real game.* Confirm specifics with the owner
before locking them in. A suggested shape:

- **Clear state machine** instead of DOM-driven globals: `idle → spinning → digit locked →
  event → … → win / fail`. Keep the game state in React (or a small store). The DOM should
  only render that state.
- **An event per step:** a scripted escalation track (step 1: the cube goes dark; step 2:
  faces shuffle; step 3: the active face jumps; step 4: shake plus fog thickens; …). Reuse
  the existing effects and sounds, and use the unused ones (fire video, starfield, Magic and
  Bell sounds).
- **Special faces:** landing on ☽/☾/♔/symbols triggers events (bonus, reshuffle, hint, a
  scare) instead of adding a digit.
- **Win:** the entered sequence contains today's code → a big open sequence (walls open,
  fire or warp, then the gate opens). **Fail/reset** after N rounds, with feedback.
- **Mobile first:** touch spinning, iOS audio unlock, works at 375 px wide.
- **Self-contained assets:** no hot-linked images.

## Security note

This is a client-side gate, so a determined user can always bypass it. The code list and the
`magicPass` list are visible in the JS bundle. For the real site, check the code on a server
(EverShop API route or `../server-activator`) and only ship the game itself to the client.
Keep this standalone build for designing the game, and move the validation to the server
when integrating.

## Integrating back into EverShop

The original page wrapper is `reference/evershop-original/extension-src/pages/frontStore/all/Entery.tsx`
(an EverShop page component with `layout = { areaId: "body", sortOrder: 0 }`). When the game
is done, copy `src/components/cube/*` back into
`../my-evershop-app/extensions/sample/src/components/cube/`, and copy the assets into
`../my-evershop-app/public/`. EverShop compiles the extension's `src` → `dist` in `npm run dev`.

## Working on GitHub

- Agents run through `.github/workflows/claude.yml` when someone writes `@claude` in an issue or PR.
- One issue = one PR. Keep PRs focused, and run `npm run build` (and `npm run typecheck` once it's green) before you push.
- Don't edit `reference/`.
- **Deploys:** every push/merge to `main` builds and publishes to https://seeface1.world via `.github/workflows/deploy.yml` (GitHub Pages). Keep `main` green: a broken build means a broken live site. `public/CNAME` holds the domain; don't delete it.
- **Open branch:** `feature/win-form` has the win check + Instagram winner form (Web3Forms key still missing, not wired into `App.tsx`).

## Current state: the simple, mysterious version (2026-10-05)

**Owner direction: keep it simple and mysterious.** The cube is the only thing a visitor faces. No counters, coins, menus, chat or messages on screen. Don't add UI. If a feature needs explaining, it doesn't belong.

What's live:
- **Cube first:** `App.tsx` renders `<Cube />` and `<MusicToggle />` only. The riddle (`components/welcomeForm`) is kept but unused.
- **Black glass cube** (`CubeStyle.scss`): dark edges, smoky faces.
- **Walls:** a chess pattern of random generated images (picsum, new seed per visit) with the see/face logo as a semi-transparent watermark (`public/imgs/seeface-chess-mixed.png`, source `public/imgs/seeface-logo.png`). The walls are moved by JS in `alive.ts` (`FLOW = 0.7`, the owner asked for 30% slower).
- **Alive layer** (`alive.ts`): the cube breathes, floats, has a heartbeat glow and leans toward or away from the pointer (curious or shy per visit). The room follows the play (speed, direction, hue, dimming and fog when idle).
- **Mystery engine** (`mystery.ts` + `Mystery.scss`): random events after each spin that escalate with depth (big digit flash, shake, self-spin, face shuffle, ghost cube, stolen digit, tunnel speed/reverse, inverted walls, blackout, glitch, fog surge, new skin). The cube fidgets when ignored.
- **Hidden trance** (`trance.ts`, no meter): spinning in rhythm builds trance; holding the max for 8 spins makes the room erupt.
- **Apparitions** (`apparitions.ts`): dust (4), an orbiting black-glass companion cube (14), eyes in the fog that follow the pointer (20), a shadow figure that comes closer each time (28), a floating seeface1 logo (36), then waves every 10 spins forever.
- **Memory** (`memory.ts`): returning visitors start deeper and meet a colder cube (no greeting text).
- **Music** (`MusicToggle.tsx`): the owner's track `public/music/girl_on_the_line_v1.mp3` (keep the name) loops via Howler HTML5 audio, with the old-Tumblr on/off switch top-left. It starts on the first touch and pauses while the page is hidden. All cube sound effects are muted while hidden.
- **Mobile/native feel:** a locked app shell (no scroll/bounce/zoom), non-passive touch handlers, digits on `pointerup`, `dvh` heights, the fog fixed for every window size.
- **Analytics:** GoatCounter (https://seeface1.goatcounter.com, `src/analytics.ts`). Events: `cube-first-spin`, `cube-round-N`, `trance-max`, `trance-eruption`, `apparition-<name>`, `depth-N`.

Removed on request (they're in git history if ever wanted back; ask the owner first): sigils/golden face, daily-code logo reveal, coins + devil's wheel, devil's seal, trance meter, rebirth ranks, the share/contact seal, "the circle" chat, the ask-the-cube oracle.

### Owner rules (permanent)
- Keep it simple and mysterious: no new on-screen UI or counters.
- **No text messages on screen** (no whispers, captions or greetings).
- **Never change the background music**: no volume, speed or effect modulation. Only on/off and pause-when-hidden.
- **No ghosts. No red room / Twin Peaks room visuals.**
- No real-money gambling, purchases or deceptive odds, ever.
- **SEO:** `index.html` has the title/description ("seeface1 — a mystery project"), canonical, Open Graph/Twitter cards (`public/og-image.jpg`, 1200×630), and JSON-LD (WebSite + Organization "seeface1", alternate names see/face / seeface). A visually hidden `<header class="sr-only">` holds the h1 for search engines and screen readers (the no-text-on-screen rule still holds). `public/robots.txt`, `public/sitemap.xml` (update `lastmod` on big changes), `public/site.webmanifest`. When the Instagram handle is known, add it to `sameAs` in the JSON-LD.
- **Engagement analytics:** `src/engagement.ts`: visible-time milestones `time-15s/30s/1m/2m/3m/5m/10m/20m`; music events `music-playing` (first real playback), `music-30s/1m/3m/7m` (listened time), `music-on/off` (switch).

## Branch `feature/marks` (local only, not deployed)
`/marks` mode, which leaves the main page untouched. `App.tsx` renders `MarksMode` only on that path. The build copies `index.html` to `404.html` so the `/marks` deep link works on GitHub Pages.
- `src/marks/scene.ts` + `Marks.scss`: a darker room, 3 light beams sweeping from above, and marks in squares on the back wall that are only readable while a beam passes (`--light`).
- `src/marks/MarksMode.tsx`: an endless journey with a new chamber every 12 spins (new skin + new random marks). After 12 lifetime spins, an 18% chance per spin of a quill ✎ (7 s) opens the composer (80 chars, 3-minute cooldown). `?keeper` shows × to remove marks.
- `src/marks/filter.ts`: the owner chose auto-filtering only. It blocks offensive words (EN/UA/RU/PL, leetspeak and spacing tricks), links, emails, phones and @handles. Test cases live in the scratchpad.
- `src/marks/store.ts`: `LocalStore` (this browser only) for now; a shared Firebase store will implement the same `MarksStore` interface.
- `mystery.ts` dispatches a `cube-spin` window event per spin for modes to listen to.
- Planned: the radio (the owner's tracks as a station, plus visitor music; copyright and moderation still to be decided).

## Branch `feature/labyrinth` (local only, not deployed)
`/labyrinth` is stage 1 of the "3D social labyrinth". It's lazy-loaded and three.js only. The main page stays the simple cube.
- `src/labyrinth/maze.ts`: an infinite deterministic maze (same for every visitor, which is ready for multiplayer). 4 m cells, 45% walls (above the percolation threshold, so it's always connected), one 3×3 room per 7×7 region with doors on every side, and ceiling light panels. `free()` handles collision.
- `src/labyrinth/world.ts`: instanced monogram walls (wallpaper generated from the logo), a polished monogram floor that follows the player, the ceiling, flickering fluorescent panels (pool of 5 point lights), and floating black-glass digit cubes in rooms under spotlights. Weather (rain/snow/fog/storm) comes from `marks/weather.ts`.
- `src/labyrinth/controls.ts`: WASD/arrows + drag to look + Shift to run; on phones, a left-half joystick and right-half look, and a tap spins a nearby cube.
- Next stages: (2) live presence of other visitors (needs a realtime server: PartyKit/Cloudflare or Firebase, which the owner sets up), (3) proximity text chat with filter + block + report, (4) voice later behind an 18+ gate, push-to-talk. **No camera / random video pairing.**

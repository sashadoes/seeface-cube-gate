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

## Current state (2026-10-05)

- **The cube is the first screen.** The riddle (`components/welcomeForm`) is no longer in the flow (`App.tsx`).
- **Mystery engine:** `src/components/cube/mystery.ts` + `Mystery.scss`. After every spin it may trigger random events (giant digits, shake, the cube spinning by itself, face shuffle, ghost cube, stolen digit, tunnel speed/reverse, inverted walls, blackout, glitch, fog surge). Odds and the event pool grow with depth, and the cube fidgets/shakes when ignored. This replaces the old `runCubeBehave()`.
- **Alive layer:** `src/components/cube/alive.ts` runs one rAF loop. The cube breathes, floats, has a heartbeat glow (faster/redder with energy), leans toward or away from the pointer (a random curious/shy personality per visit), and fidgets when ignored. The room follows the play: tunnel speed and direction follow the spin, hue follows the tilt, idle dims everything and thickens the fog, and violent spins swap in a new generated image. The walls are moved by JS (the CSS `pan` animation is turned off at runtime).
- **Walls:** chess pattern = random generated images (picsum, a new random seed per visit) + the see/face logo as a semi-transparent watermark (`public/imgs/seeface-chess-mixed.png`). Logo source: `public/imgs/seeface-logo.png`.
- **Music:** `src/components/music/MusicToggle.tsx` loops the owner's own track `public/music/girl_on_the_line_v1.mp3` (keep this file name) with Howler HTML5 audio, so it works on iOS. It starts on the first touch, has the old-Tumblr on/off switch top-left, follows the cube's mood (volume/rate), and pauses when the page is hidden.
- **Analytics:** GoatCounter (https://seeface1.goatcounter.com), events in `src/analytics.ts`.
- **Memory:** `src/components/cube/memory.ts` (localStorage `seeface-memory`). Returning visitors start deeper in the mystery, and get a colder (more often shy) cube.
- **Reactive music:** `MusicToggle` reads `getMood()` from `alive.ts`. Volume swells with energy; playback slows to 0.75× when idle and speeds to 1.25× when spun hard.
- **Vibration:** `buzz()` in `mystery.ts` (Android only): a tick per digit, plus patterns on shake and the red room.
- **Owner rule: no text messages on screen.** No whispers, greetings or captions. The cube communicates only through motion, light, sound and its digits/symbols. The "ask the cube" oracle (`src/components/oracle/`, Magic-8-Ball answers, no AI) is built but parked in `App.tsx` because its answers were on-screen text.
- **Rewards / retention:** `src/components/cube/rewards.ts` + `SigilBar.tsx` + `Rewards.scss` (localStorage `seeface-rewards`). Locking a symbol face collects one of 7 sigils (☽ ☾ ✶ ◐ ♖ ▲ ♔). ♔ only appears on the rare **golden face** (`goldenFace()` in `mystery.ts`, 9% per spin from step 3, lasts 2.6–4.2 s). Today's code (2 digits in a row, `dailyPass.json`) triggers a seeface1 logo reveal once per day. Streak notches count consecutive visit days. All 7 sigils → the grand gold reveal, and the cube's glow stays gold-white. GoatCounter events: `sigil-N`, `daily-code-cracked`, `collection-complete`, `streak-N`. Progress is glyphs and light only (no text rule).
- **Owner rule: NO red room / Twin Peaks room visuals, ever.** It was removed on request. Don't re-add red curtains or chevron-floor scenes.
- **Silent when not open:** `Cube.tsx` mutes Howler on `visibilitychange`/`pagehide`; `MusicToggle` pauses the YouTube player while hidden and resumes on return (if it was playing). A press that happens before the player is ready is remembered (`wantsStart`).
- **Mobile/native feel:** `global-styles.scss` locks html/body/#root (fixed, no scroll/bounce/zoom/select, `touch-action: none`). Cube touch listeners are non-passive. A digit is entered on `pointerup`, not `mouseup`, because phones never send mouseup after a drag. Heights use `dvh`. Viewport meta disables zoom, uses `viewport-fit=cover`, and adds home-screen app meta.
- **Tunnel speed:** `FLOW = 0.7` in `alive.ts` (the owner asked for 30% slower).
- **Apparitions (endless progression):** `src/components/cube/apparitions.ts` + `Apparitions.scss`, called from `mysteryStep()` with the depth. Unlocks: dust motes (4), orbiting companion cube (14), eyes in the fog that follow the pointer (20), shadow figure at the tunnel's end that comes closer each time (28), floating seeface1 logo (36). From 40, every 10 spins brings a "wave" and everything gets a bit stronger (caps: 36 motes, 3 companions). GoatCounter: `apparition-<name>`, `depth-40/50/...`. The layer sits behind the cube (`#shakeCube` z-index 2) and under the fog.
- **Owner rule: NO ghosts.** They were removed on request. Don't add ghost figures back.
- **Devil's game:** `src/components/cube/devil.ts` + `Devil.scss`. From step 10, 5% per spin, a red ⛧ seal appears for about 5 s. Tapping it wagers a sigil on a coin flip: a win grants a missing sigil, a loss burns one (`loseSigil`/`grantMissing` in `rewards.ts`, burn animation in `SigilBar`). It's only offered when the player has at least 1 sigil and isn't complete. No money or purchases, ever. GoatCounter: `devil-offer/accepted/win/lose`.
- **The seal (share + contact):** `src/components/seal/` is a living seal in the bottom right (a turning glyph ring around a blinking eye). It opens an altar with "summon a friend" (Web Share API, or a clipboard fallback) and "speak" (a contact form to Web3Forms). "speak" stays hidden until `WEB3FORMS_ACCESS_KEY` in `src/config/form.ts` is set. GoatCounter: `share-opened/sent/copied`, `contact-sent`.

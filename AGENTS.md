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

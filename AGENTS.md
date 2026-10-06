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
- **SEO:** `index.html` has the title/description (title just "seeface1"; **owner rule: never call it a "mystery project" in any text**), canonical, Open Graph/Twitter cards (`public/og-image.jpg`, 1200×630), and JSON-LD (WebSite + Organization "seeface1", alternate names see/face / seeface). A visually hidden `<header class="sr-only">` holds the h1 for search engines and screen readers (the no-text-on-screen rule still holds). `public/robots.txt`, `public/sitemap.xml` (update `lastmod` on big changes), `public/site.webmanifest`. When the Instagram handle is known, add it to `sameAs` in the JSON-LD.
- **Engagement analytics:** `src/engagement.ts`: visible-time milestones `time-15s/30s/1m/2m/3m/5m/10m/20m`; music events `music-playing` (first real playback), `music-30s/1m/3m/7m` (listened time), `music-on/off` (switch).

## Branch `feature/marks` (local only, not deployed)
`/marks` mode, which leaves the main page untouched. `App.tsx` renders `MarksMode` only on that path. The build copies `index.html` to `404.html` so the `/marks` deep link works on GitHub Pages.
- `src/marks/scene.ts` + `Marks.scss`: a darker room, 3 light beams sweeping from above, and marks in squares on the back wall that are only readable while a beam passes (`--light`).
- `src/marks/MarksMode.tsx`: an endless journey with a new chamber every 12 spins (new skin + new random marks). After 12 lifetime spins, an 18% chance per spin of a quill ✎ (7 s) opens the composer (80 chars, 3-minute cooldown). `?keeper` shows × to remove marks.
- `src/marks/filter.ts`: the owner chose auto-filtering only. It blocks offensive words (EN/UA/RU/PL, leetspeak and spacing tricks), links, emails, phones and @handles. Test cases live in the scratchpad.
- `src/marks/store.ts`: `LocalStore` (this browser only) for now; a shared Firebase store will implement the same `MarksStore` interface.
- `mystery.ts` dispatches a `cube-spin` window event per spin for modes to listen to.
- Planned: the radio (the owner's tracks as a station, plus visitor music; copyright and moderation still to be decided).

## Labyrinth (merged to `main` and live since 2026-10-06; started as `feature/labyrinth`)
`/labyrinth` is stage 1 of the "3D social labyrinth". It's lazy-loaded and three.js only. The main page stays the simple cube.
- `src/labyrinth/maze.ts`: an infinite deterministic maze (same for every visitor, which is ready for multiplayer). 4 m cells, 45% walls (above the percolation threshold, so it's always connected), one 3×3 room per 7×7 region with doors on every side, and ceiling light panels. `free()` handles collision.
- `src/labyrinth/world.ts`: instanced monogram walls (wallpaper generated from the logo), a polished monogram floor that follows the player, the ceiling, flickering fluorescent panels (pool of 5 point lights), and floating black-glass digit cubes in rooms under spotlights. Weather (rain/snow/fog/storm) comes from `marks/weather.ts`.
- `src/labyrinth/controls.ts`: WASD/arrows + drag to look + Shift to run; on phones, a left-half joystick and right-half look, and a tap spins a nearby cube.
- Next stages: (2) live presence of other visitors (needs a realtime server: PartyKit/Cloudflare or Firebase, which the owner sets up), (3) proximity text chat with filter + block + report, (4) voice later behind an 18+ gate, push-to-talk. **No camera / random video pairing.**
- **Survival (stage 1b):** `Labyrinth.tsx` runs the game loop. The lantern (a SpotLight on the camera) drains in the dark (2.2/s + depth), refills under working panels (`world.isLit`) and in rooms. Spinning a not-yet-claimed room cube gives a shard plus full light; every 6 shards the depth goes up (`world.setDepth`: fog/colour, faster Hollow). It saves the best distance (`seeface-lab-best`). In dev builds, `window.__lab` has debug helpers (`setLight`, `skipGrace`, `state`).
- **The Hollow** (`hunter.ts`): wanders, and hunts when light is under 55 using BFS through real corridors (radius 14 cells). It's blocked by rooms and, while the player has >20 light, by lit cells. Its speed depends on darkness and depth. It catches at under 1 m outside rooms, after a 15 s grace period.
- **Residents** (`residents.ts`): in-world characters, **never presented as real people**. Watchers stand at dead ends and vanish when approached; a wisp appears when light is under 30 and leads toward the nearest room.
- **Radio** (`radio.ts`): Silent-Hill-style static synthesised with Web Audio (band-passed noise bursts) that rises with the Hollow's proximity.
- **Share card** (`card.ts`): a 1080×1920 JPEG for Stories via the Web Share API, with a download fallback.
- **Walls:** about a third use `mixedTexture` (seeded picsum photo + monogram + logo watermark, deterministic seeds so multiplayer stays consistent).
- **Owner request declined:** "100 bot personalities that never say they're AI and mimic real users". Don't build fake users. Residents and echoes of real players are the honest alternative.
- **Future voice:** a radio filter (band-pass + crackle) on proximity voice, 18+ only, push-to-talk.
- **Social layer (prototype):** `net.ts` presence over a free public MQTT relay (EMQX, HiveMQ fallback). **Temporary, testing only**: it must move to our own server before launch, keeping the same message shapes. Anonymous positions at 6 Hz and nicknames; `world/#` retained messages for wishes; `hit/<id>` + `kill/<id>` for knife strikes (the victim's client validates them, so they can be cheated until there's a server referee). `others.ts` draws wanderers (sprite + glow + floating nickname, with a pool of 4 real lights). `LabMap.tsx` shows maze, rooms, players with nicknames, edge arrows with distance, and wishes. Invite links use `/labyrinth?with=<id>`.
- **Nicknames** (`nick.ts`): mandatory on every entry (pre-filled with the last one, or `face_` + 4 random digits for newcomers). 2–16 letters/numbers/_/., run through the marks filter, checked on send AND receive, and drawn only via canvas text.
- **Blood dollars ◈ / wishes** (`wishes.ts`): earned only by play (+1 shard, +1 per 100 m, +3 depth, +2 meeting, +1 money pickup, a kill takes half the victim's ◈ up to 20, minimum 3). A wish costs 10: lantern post (recharges anyone's light), monolith, photo tree, giant cube, pale statue, or change this room (re-rolls its art seed for everyone). **No real-money purchase of ◈.**
- **Props** (`props.ts`): **no furniture (owner request)**. Instead, animated colourful strange objects (orbs, torus knot, candy stack, crystals, a watching eye, neon rings, a melting column, a tesseract), plus blood stains, money piles (pickups), knives (one strike), and, rarely and deep (>60 m), a coffee table with white lines or a coca shrub (owner request). Re-rolled every hour, identical for everyone in the same hour.
- **Knife PvP:** one knife = one strike (F or the † button), range 1.9 m in front. No kills in rooms; newcomers protected for 120 s. The victim respawns, loses half their ◈ (max 20), and the attacker gets it.
- **Movement:** momentum, wall bump, jump (Space or the ⤒ button), sprint FOV kick, lean into turns, landing dip, stamina for running (on phones the run button fills with stamina).
- **Live online counter:** `src/online.ts` + `components/online/OnlineCounter.tsx`. Every open, visible page pulses `seeface1/site/v1/here/<id>` every 10 s on the public relay, and the count is the ids seen in the last 25 s (hidden tabs do not count). It shows on the cube page top-right; labyrinth players are counted too. MQTT is lazy-loaded so the cube page stays light. Like all relay features: own server before launch, because anyone can fake pulses on a public relay.
- **The gate** (`components/cube/gate.ts` + `Gate.scss`): the hidden way into the labyrinth from the cube page. The code is **1994** (owner's choice, 2026-10-06), spun in as four digits; the cube's 6 face became a 9 so it can be entered (faces 1 2 3 4 5 9). It plays glitch → cube rush → tear of light with the logo, then goes to `/labyrinth?from=gate`. GoatCounter: `gate-opened`. `/labyrinth` is still directly reachable for testing; it can be locked to gate arrivals later.
- **Owner rule (declined request):** "always show 30–112 bot users online". Never pad the online counter with bots or fake users; counters must show real people only. Honest alternatives: label residents separately, or hide the counter when few real people are on.
- **Locations / zones** (`zones.ts`): the surface is split into 10×10-cell zones in 8 moods: Monogram Halls (the entrance), The Pools, Red Corridors, Neon Void, Photo Garden, Overexposed White, Ash, The Deep. **Walls and floors are textures made from random images (picsum `?grayscale`), monochrome with per-zone contrast/brightness, tinted by the material colour.** The logo appears only on top of some walls (`logoChance` per zone, opacity 0.12–0.42). There are 4 image variants per zone; `world.ts` lazily creates one instanced mesh per (zone, variant) and lerps fog/ambient/exposure as you cross. Room art and posters are monochrome too, with a vivid light per room. Strange objects stay colourful on purpose.
- **Secret levels** (`rifts.ts`): they live at x ≈ k × 100 000 m on the same maze (I · The Below = pools, II · The Static = neon, III · The White). Surface rifts (28% of 8×8 regions, more than 45 m from the entrance) pull you down; rifts inside a level lead back up. Levels pay double ◈ and the Hollow is faster (+3 depth). The HUD shows I/II/III. GoatCounter: `secret-level-N`, `secret-level-exit`.
- **Speed:** walking and running were doubled at the owner's request (WALK 5.2, RUN 9.0); the Hollow scales with them (×1.9).
- **Snapshot** (`snapshot.ts`, ⊡ button or P): a 9:16 JPEG of the live view (captured right after render) with logo, place, current event, "<nick> was here" and the link. Shared via the Web Share API with an invite link; download fallback.
- **World events** (`events.ts`): clock-based, so everyone sees them at once with no server. One 6-minute slot, 50% chance of a 35 s event: eclipse, photo rain, choir, gold hour (money rains), inversion (low gravity), bloom. The snapshot button glows during events. `?event=<kind>` forces one for testing.
- **Sound** (`sound.ts`): all synthesised with Web Audio. Rain/drizzle/snow/wind beds follow the weather, thunder in storms, footsteps differ per zone, plus the choir and a pickup chime. The owner's background music is never touched.
- **Relics:** small colourful objects to pick up and carry (G / ⤓ to drop). The held relic is sent in presence, so others see what you carry.
- **Sign-ups + MongoDB** (`server/`, `src/api.ts`, `/privacy`): the entry screen has an optional email + an unticked "send me news" box + a privacy link. It POSTs `{nick, email, consent, ref}` fire-and-forget (never blocks entry). The `server/` API (Express + MongoDB driver) validates, rate-limits (8/min/IP), stores a salted IP hash (never raw IPs), upserts by email, and has `POST /api/forget` for deletion. Without `MONGODB_URI` it writes `server/data/players.jsonl` (gitignored). Env: `MONGODB_URI`, `MONGODB_DB`, `ALLOWED_ORIGINS`, `IP_SALT`, `PORT`. The frontend uses `VITE_API_URL` in production (dev default `http://<host>:8787`); with no API set, nothing is sent. Only email people who ticked consent.
- **Declined requests (don't build):** real celebrities (Katy Perry, Donald Trump) as villains; use original characters instead. Shipping other artists' works from `seeface1-site/refs/top-picks/art/` (their README says never ship); only the owner's own images can be used. Open avatar uploads on villains: a curated set or owner-approved uploads only.
- **Email field:** only shown when an API is configured (`VITE_API_URL` at build time, or dev). Live builds hide it until the API is hosted.
- **Demons** (`demons.ts`, owner request 2026-10-06): other players appear as ghostly demonic creatures in 8 styles (imp, wraith, goat, watcher, stag, long one, crowned, moth), picked from the player id so everyone sees the same demon for the same person. Translucent, flickering, glowing eyes, aura-tinted lantern glow. (The "no ghosts" rule is for the cube page; the owner asked for these in the labyrinth.)
- **More logos:** wall `logoChance` raised ×1.5, and about a third of corridor posters are glowing see/face signs.
- **HTTPS:** GitHub Pages enforces HTTPS (certificate auto-renews). `index.html` also redirects any cached http copy to https.
- **Entering (owner request 2026-10-06):** any 10–20 actions open the gate (random per visit, ~15 on average): every touch/click (`pointerdown`, so a spin counts once) and key press. The code 1994 opens it at once: spun in (digits count across the 4-digit line resets, symbol faces skipped) or typed. GoatCounter: `gate-actions`, `gate-code`, `gate-code-typed`.
- **Real page paths:** the build copies `index.html` into `labyrinth/`, `the-eye/`, `privacy/`, `marks/` so those links answer 200 (link previews), not the 404 fallback.
- **Keepers** (`keepers.ts`): the honest answer to the owner's "bots with personalities". Masked characters with a gold ✶ name (the cartographer: directions to rifts/rooms; the collector: trades your relic for 3 ◈; the jester: dares you to jump, +1 ◈; the mourner: shares light). They come only when no real player is within 25 m, stay ~75 s, and leave when a real person comes near ("someone real is near you. go to them."). They are never in the online count, on the map, or using player-style nicknames. Keep it that way.
- **The eye** (`/the-eye`, `src/watch/`): the owner's unlisted live page: people on the site / in the labyrinth / on the cube, peaks, a 3 h sparkline (only while the page is open, kept in localStorage), and a live map with every player, their demon, place, light, relic, and trails (kept 15 min after they leave). Click a player to follow. It only listens to the relay (never publishes), so it isn't counted. It's hidden, not locked: it only shows data the relay already makes public; never add emails/IPs here. `noindex`. Global CSS pins `<section>` to fixed full-screen, so override it when adding pages.
- **Meet from the map:** tap a player on the map → an arrow + distance guides you, and they get "<nick> is coming to find you" (and an arrow back to you). "everyone" zooms the map out to fit all players. `call/<id>` topic, max one call per 10 s.
- **Chat with strangers** (T / Enter / "talk…"): 80-char lines, filtered on send AND receive (`marks/filter.ts`: no links, handles, phones, emails, slurs), 1 line / 2.5 s. Bubble above the speaker + a small log. Clear within 30 m, garbled (░▒▓) up to 80 m, unheard beyond. Tap a line to mute that person. Reporting needs our own server.
- **Weird interactions (emotes):** stare (grows + glows), spin, melt into the floor, float, scream (shakes the screen + thunder for anyone within 14 m).
- **The edge** (`edge.ts`): the labyrinth's radius = 70 m + 45 m per extra person online (max 3 km), around each level's entrance. It grows fast and shrinks slowly. Near the edge the fog thickens with radio static; past it you're thrown back to a room inside. The map shows the edge as a dashed circle. Notices: "the labyrinth grew · N inside", "it grows when more people come in".
- **Twists** (`twists.ts`): personal surprises every 45–110 s after the first 30 s (25% nothing): blackout, doppelgänger (your own demon walks at you), the labyrinth moves you to a nearby room, mirror world (7 s), lost ◈ at your feet, an echo of something said nearby.
- **Progress + optional accounts** (`src/progress.ts`, `src/account.ts`, server `/api/register|login|me|progress|logout|account/delete`): progress = ◈, best run, total metres, runs, secret levels found. Always kept in the browser (old keys `seeface-blood`, `seeface-lab-best` kept). Registering (nickname + password ≥ 6, optional email for news/recovery) saves it to MongoDB and reserves the name (case-insensitive). Logging in on another device merges (best of both; ◈ from the device that's playing). Auto-saves 4 s after any change and on pagehide. Passwords: scrypt + salt; session tokens stored as sha256, 180-day TTL in Mongo; 10 password tries / 10 min / IP. The entry screen shows progress, "save it / log in", "log out", "delete" (needs the password; frees the name). Without `VITE_API_URL` (live builds today) the account UI is hidden. Note: reserved names aren't enforced in the multiplayer relay yet (needs our own server).
- **Hosting the API:** `render.yaml` (Render blueprint, free plan, rootDir `server`), env `MONGODB_URI` (Atlas), `ALLOWED_ORIGINS=https://seeface1.world`, `IP_SALT` generated. The Pages build reads the repo variable `VITE_API_URL` (deploy.yml). Free Render sleeps after 15 min idle (first request ~30–50 s); saving is fire-and-forget so the game never waits.
- **Daily quests** (`quests.ts`): three a day, the same for everyone (UTC date hash), from a pool of 14 (walk, cubes, secret level, meet a real person, chat, emotes, snapshot an event, relics, collector trade, survive the dark, treasure, wish, jumps). Each pays ◈; all three pay +10. HUD chip "◇ quests n/3" top-right. Today's progress is in localStorage `seeface-quests`.
- **More twists:** gravity (12 s low gravity), whisper (where a REAL player is; never invented), a glimpse of the Hollow (1.3 s, only with light > 30), hidden treasure (4 ◈ piles 15–30 m away + arrow, 90 s), fog wall (7 s), wrong colours (9 s). Twists now every 35–90 s (15% nothing).
- **Guest villain slot:** `public/villains/guest.png`, if present, becomes the Hollow's look. Only images the owner has written permission to use; never download celebrity photos from the web (photographers' copyright). See `public/villains/README.md`.

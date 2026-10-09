# Seeface Cube Gate

A password-gate game: spin the cube, and every spin locks in a digit. Crack today's code to get in.
The prototype was extracted from `../my-evershop-app` and now runs standalone.

```bash
npm install
npm run dev
```

- http://localhost:5173 opens the riddle screen first, then "enter it now" opens the cube
- http://localhost:5173/?screen=cube goes straight to the cube

**Agents start here:** [AGENTS.md](AGENTS.md) has the goal, how the code works, known bugs and the target design.

## The Architects (Phase 1)

Artists apply at `/architects` (`?ref=<ig_handle>&invite=<code>` are kept for attribution), get a passwordless account,
and go straight into the Creation Chamber (`/chamber`), where SeeFace (Claude) turns their words, images and sounds
into a **Room Blueprint** that the 3D preview rebuilds live. They submit; the owner reviews at `/admin/architects`;
approved rooms open at `/room/<id>`. Payments, Keys, show scheduling and the marketing kit are Phase 2
(`room.status` and `blueprint.pricing` are the hooks).

### Run it locally

```bash
npm install && (cd server && npm install)
cd server && ADMIN_KEY=dev-admin-key node --watch index.js   # API on :8787, data in server/data/architects/
npm run dev                                                   # site on :5173 (talks to :8787 in dev)
cd server && npm test                                         # blueprint validation + reply streaming tests
```

Open http://localhost:5173/architects. Without `ANTHROPIC_API_KEY` SeeFace is a small scripted stand-in (it says so);
without `MONGODB_URI` everything is stored in `server/data/`; without `RESEND_API_KEY` emails (sign-in links,
"your door is open") are printed in the server log. Server env vars are listed in `render.yaml`.

| Path | What it is |
|---|---|
| `server/architects/blueprint.mjs` | **The schema.** Allowed lists (archetypes, presets, objects), `cleanPatch` (what SeeFace may change), `applyPatch`, submit rules, the JSON schema SeeFace answers in. The browser imports the same lists. |
| `server/architects/seeface.mjs` | SeeFace's system prompt (owner's Prompt 2 + the allowed lists) and the per-turn state block. |
| `server/architects/chamber.mjs` | Chamber API: state, streamed turns (NDJSON), submit, per-Architect daily limit. |
| `server/architects/uploads.mjs` | Uploads (sniffed, private until approved, described by Claude vision), public room API, voice transcription fallback. |
| `server/architects/admin.mjs` | Review: list, detail, approve / request changes / reject (+ emails). |
| `server/architects/routes.mjs` | Invite counter, application, sign-in links. |
| `src/architects/` | Pages: `Invite`, `Join`, `Terms`, `Chamber` (+ `Composer`, `media.ts` for image shrinking and voice), `Admin`, `RoomPage`. |
| `src/architects/room/` | The renderer: `archetypes.ts`, `objects.ts`, `presets.ts`, `build.ts` (blueprint → scene), `view.ts` (orbit + walk). The chamber preview, the admin preview and `/room/<id>` all use it. |

### Add an archetype

1. `server/architects/blueprint.mjs`: add the name to `ARCHETYPES`.
2. `server/architects/seeface.mjs`: add a one-line description to the `archetype:` line under ALLOWED, so SeeFace knows what it looks like.
3. `src/architects/room/archetypes.ts`: add a builder with the same name. It gets the wall/floor materials and the object kit and returns a `Shell`:
   the group, the walkable `floor` (rect or circle), `open` (sky visible), **12** `posterSlots` (position, facing, size), light positions,
   a `spawn` point and an `orbit` view. Walls face inward and are single-sided, so the orbit preview looks in like a dollhouse;
   tag ceilings with `userData.ceiling = true` so they hide in the preview.
4. Add it to `src/architects/types.ts` (`Archetype`) and run `cd server && npm test`.

### Add an object to the library

1. `src/architects/room/objects.ts`: add a builder to `LIBRARY` returning `{ obj, radius, update? }`. Build it from primitives,
   use the kit's palette materials (`base`, `second`, `accent` glows, `dark`, `glass`, `plant`, `flame`), stand it on y = 0,
   keep it low-poly (phones in Instagram's browser render these).
2. `server/architects/blueprint.mjs`: add the name to `OBJECTS` (that list is what SeeFace may use; keep it at 15–25).

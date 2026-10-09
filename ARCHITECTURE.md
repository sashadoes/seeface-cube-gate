# seeface1 world — architecture

Audit date: 2026-10-09, `main` at f950194.

## What already exists

The repo is one Vite + React 19 + TypeScript app deployed to GitHub Pages (seeface.world), plus a
small Express API in `server/` (Render blueprint, MongoDB or a JSONL file).

| Area | Where | State |
|---|---|---|
| Cube gate (landing) | `src/components/cube/` | Live. It converts well, so the owner said don't touch it. |
| Labyrinth | `src/labyrinth/` (~16k lines, `Labyrinth.tsx` alone is 3.2k) | Live at `/labyrinth`. A three.js infinite maze with dozens of features: disasters, villains, market, posts, NPCs, i18n and a lot of HUD buttons. |
| Presence | `src/labyrinth/net.ts` | Public MQTT relay (EMQX/HiveMQ). Anyone can read or fake it. Testing only. |
| Voice | branch `feature/voice-rooms` (not on main) | WebRTC mesh with MQTT signalling. 18+ is self-declared. |
| Perf | `src/labyrinth/perf.ts` | Device tiers, dynamic resolution, light budget. `fix/perf` is unmerged. |
| Analytics | `src/analytics.ts` | GoatCounter events plus a local play journal (`insight.ts`). |
| API | `server/index.js` | Accounts (scrypt), progress, Instagram OAuth, NPC talk through Claude, stats. Not hosted yet. |
| Tests | none | No unit or e2e tests exist. |

### Measured baseline

- The `/labyrinth` chunk is large because three.js plus 16k lines of game ship in one lazy chunk. It works on desktop and the owner's iPhone 16 Pro, but devices run hot (see the perf brief, 2026-10-09).
- `public/` is 18 MB (videos, music, villains). That's fine because it's lazy, but none of it can be in the world's first load.

## Keep / replace

| Keep | Why |
|---|---|
| Vite + React + three.js | Already fast to load. The spec allows keeping the existing renderer if it meets the budget. R3F would add ~150 kB and a second reconciler for no gain here. |
| `src/analytics.ts` `track()` | GoatCounter is already wired. The world adds its funnel events on top. |
| `server/` Express app | Same host (Render). The world server mounts next to it. |
| The cube page and `/labyrinth` | Untouched. They're live, and other sessions are working on them. |

| Replace (for the world only) | With |
|---|---|
| Public MQTT relay | Our own WebSocket world server (`server/world/`). It's authoritative for rooms, permissions, coins and moderation. |
| Self-declared 18+ | An age-assurance adapter. A mock is allowed only in dev with a flag. In production the voice stays locked until a vendor is configured. |
| WebRTC mesh over a public relay | A `VoiceAdapter`: LiveKit when it's configured, otherwise a WebRTC mesh signalled through our own server (no public relay). |
| The HUD-heavy Labyrinth shell | A new lean shell with only three buttons (📻 🎙 👤). |

## Why the world is a new route instead of a refactor of `/labyrinth`

The spec says "keep the screen to the three buttons". `/labyrinth` has ~20 on-screen controls and
owner-requested features that the spec explicitly cuts (inventory, minimap, chat panel, quests). Stripping it would
break a live game other sessions are actively shipping. So the world ships as **`/world/`**, a separate
lazy chunk with its own code under `src/world/`, sharing only `analytics.ts`. When v1 is proven,
the owner decides whether `/` points at it.

## New layout

```
shared/world/          pure TypeScript, used by BOTH client and server (no DOM, no Node APIs)
  maze.ts              seeded chunked labyrinth, curated rooms, wells (giant holes), toys
  rooms.ts             the curated public rooms (name, topic, theme pack, acoustics)
  ledger.ts            coin rules + pure ledger (append-only entries, idempotency keys)
  permissions.ts       who may hear/speak/kick/read transcripts
  transcripts.ts       transcript privacy rules (opt-in, 90-day retention, owner-only, deletion)
  protocol.ts          WebSocket message types
server/world/          the world server (Node ≥ 23.6 runs .ts directly, erasable syntax only)
  index.ts             ws server: sessions, presence, rooms, signalling, rate limits
  store.ts             Store interface + memory/file store (Postgres adapter behind DATABASE_URL)
  adapters/            age, stt, llm host, stripe, livekit token: each with a mock
src/world/             the client (lazy chunk at /world/)
  World.tsx            React shell: the 3 buttons + overlays (tuner, onboarding, ME, avatar card)
  flags.ts             feature flags
  engine/              renderer, game loop, perf (tiers, dynamic resolution)
  scene/               instanced labyrinth chunks, rooms, doors, signs, wells, toys
  player/              kinematic capsule controller, grid collision, camera
  avatar/              blob avatars (squash-and-stretch vertex shader)
  audio/               master bus + limiter + ducking, HRTF voices, occlusion, reverb, soundscapes, one-key SFX
  voice/               VoiceAdapter: mesh (dev/default) and LiveKit
  net/                 world server client
tests/unit/            vitest
tests/e2e/             playwright
```

## Runtime picture

```
phone ──https──▶ GitHub Pages (static /world/ chunk)
   │
   └──wss──▶ world server (Render) ── presence, rooms, coins, moderation, signalling
                 ├─▶ LiveKit (voice SFU)            [adapter, optional]
                 ├─▶ STT provider (text only)       [adapter, mock]
                 ├─▶ Claude (AI host, verdicts)     [adapter, scripted fallback]
                 ├─▶ Postgres                       [adapter, file store fallback]
                 ├─▶ Stripe (test mode)             [adapter, mock checkout]
                 └─▶ age-assurance vendor           [adapter, dev-only mock]
```

Audio never touches the world server or any disk. In mesh mode it flows device to device. In
LiveKit mode it flows through the SFU, with no egress and no recording.

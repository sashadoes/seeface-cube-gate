# seeface1 world — plan

Gaps between the spec and the repo, mapped to the build order (spec section 11). Each milestone
gets its own branch `world/mN-*`, cut from the previous one and merged forward into
`feature/world-core-v1`. Nothing goes to `main` without Sasha (production deploy).

| # | Milestone | Gap today | Deliverable |
|---|---|---|---|
| 0 | Audit | No tests, strict TS, flags or world server | Docs, `.env.example`, strict `tsconfig.world.json`, vitest + playwright, flags |
| 1 | Movement, physics, labyrinth, holes | The existing controller is walk/run with no coyote time, double jump or toys | `/world/`: seeded chunked labyrinth (instanced, ≤ 100 draw calls), kinematic capsule (momentum, coyote, double jump, air control), blob avatars, wells → 2.5 s freefall tunnel, bounce pads, wind vents, low-g, speed strips, secret walls |
| 2 | Rooms, voice, MIC, proximity | No world server; voice only on a branch over a public relay | `server/world` WebSocket server (presence, rooms, permissions, rate limits); VoiceAdapter (mesh + LiveKit); MIC hold/lock/whisper; HRTF voices, wall occlusion, room crossfade, reverb, ducking, limiter, soundscapes |
| 3 | RADIO tuner | — | Circular tuner overlay, static + filter sweep, 3 s live preview, JUMP IN → fall |
| 4 | Onboarding | — | Headphones screen, age gate (adapter), name + 6 blobs, 3 cards, auto-drop into the busiest room, quests (Say hi +20, Spin the radio +10), Transcribe-me switch, TRANSCRIBED door sign |
| 5 | AI host, transcripts, Library | NPC talk exists for `/labyrinth` only | Host adapter (Claude/scripted): greet by name, 30 s silence prompt, verdict at session end; STT adapter; owner-only 90-day transcripts; Library with speaker-approved quotes; data deletion |
| 6 | Coins, rooms, gifts, packs | ◈ is client-side only | Server ledger (idempotent), earn rules, own a room (500), decor drag-and-drop, public/private, invite link, gifts, Stripe test checkout + webhook |
| — | Safety (across 2–6) | — | Mute/Block/Report/Kick, strikes, admin queue with AI-flagged transcript excerpts |
| — | Analytics (from M1) | — | landed → onboarded → heard_voice → spoke → followed_someone → returned_d1 → returned_d7 → purchased |

## Honest limits for this run
- Real devices: I can't hold a mid-range Android. Numbers come from Chromium with CPU throttled 4×
  and a 412×915 mobile viewport, plus the iOS simulator where possible. They're labelled as such in PROGRESS.md.
- "Hears a real human within 30 s" depends on real humans being online. When nobody is, the world says so
  honestly (it never fakes crowds). The e2e test uses a second real browser page with a fake microphone as the human.

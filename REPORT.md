# seeface1 world — core v1 report

Branch `feature/world-core-v1` (worktree `shop_of_horrors/seeface-world-core`), built 2026-10-09 off `main` f950194.
**Not deployed, not merged to `main`.** Production deploy is Sasha's call. Run it locally with the commands in SETUP.md and open `http://localhost:5173/world/`.

## What was built
| # | Milestone | Status |
|---|---|---|
| 0 | Audit, plan, setup, strict TS, test tooling | ✅ ARCHITECTURE / PLAN / SETUP / DECISIONS / PROGRESS / CHANGELOG, `.env.example`, `tsconfig.world.json` (strict), vitest + Playwright |
| 1 | Movement, physics, maze, falling holes | ✅ Seeded chunked maze (shared with the server), kinematic blob with momentum, coyote time, buffered jump, double jump, air control and wall bumps; wells (2.6 s freefall); bounce pads, wind vents, speed strips, low-g district, secret walls; squash-and-stretch blobs; player bumping ("boop") |
| 2 | Rooms, voice, MIC, proximity audio | ✅ Our own authoritative WebSocket server; WebRTC mesh voice (server-signalled, server-linked, 18+ gated, never recorded); MIC hold / lock / whisper / tap-to-type; HRTF voices, wall occlusion, room crossfade, per-room reverb, ducking, limiter; zone soundscapes; Follow · Mute · Report · Block; kick |
| 3 | RADIO tuner | ✅ Spin dial, static and filter sweep, haptic ticks, 3 s live preview, JUMP IN = fall, radio off |
| 4 | Onboarding | ✅ 🎧 screen → 18+ (adapter) + name + 6 blobs → 3 cards → auto-drop into the busiest real room; two quests; ME panel; Transcribe me; delete my data |
| 5 | AI host, transcripts, Library | ✅ Host (Claude with a scripted fallback): greets by name, asks after 30 s of silence, re-tags the topic, writes verdicts; opt-in transcripts, owner-only reads, 90-day purge; quotes need the speaker's ok; moderation queue page |
| 6 | Coins, rooms, gifts, packs | ✅ Server ledger (idempotent, daily caps); own a room (500) with decor drag-and-drop, public/private and invite links; gifts; Stripe test-mode packs + verified webhook (dev mock without keys) |

Hard rules: no audio is stored anywhere. Voice, previews and bubbles need the 18+ check, and the mock check is refused in production. Every count shown is real; nothing is faked. No paid randomness.

## Metrics vs targets (PROGRESS.md)
| | Target | Measured | How |
|---|---|---|---|
| First load | < 5 MB | **255 KB** | built `/world/`, transferred bytes |
| Time to playable | < 3 s | **1.02 s** | Pixel 7 viewport, CPU 4× throttle, 9 Mbps / 60 ms |
| fps in the maze | 60 | **57 min / 60 median** | same profile, walking 8 s (**Mac GPU**, see caveat) |
| Draw calls | < 100 | **18–26** | `renderer.info` |
| Time to first voice (new user) | < 30 s | **4.5 s** | e2e with automated taps; a human reading the 3 cards adds ~10 s |
| Mic press → heard | — | **0.68 s** | 2 real Chrome pages, localhost |

**Caveat:** I couldn't test on a real mid-range Android or iPhone. The fps above is CPU-throttled Chrome on a Mac GPU, so it shows the CPU side is light, not that a Mali/Adreno GPU holds 60. That's the first thing to measure on a device.

## Tests
- `npm run test:unit`: **41 tests**. Coin ledger (idempotency, caps, no negatives, atomic gifts), permissions (18+ gate, stage rules, kick, blocks, owner-only transcripts), transcript privacy (opt-in, 90 days, excerpts, quote approval, deletion), maze connectivity and occlusion, controller feel, plus a real-server integration suite (teleport rejection, quests, captions → verdict → approval, host greeting and silence question, report → admin queue → strike, block cuts links, room purchase, packs, decor clamping, private invites, gifts, Stripe signatures).
- `npm run test:e2e`: **land → onboard → fall into busiest room → hear voice → press MIC → the other person hears you**. Two real Chrome contexts, green.

## Known issues
1. **No real-device numbers yet.** See the caveat above.
2. **Mesh voice only.** That's fine up to about 8 talkers per room. Bigger rooms need the LiveKit client adapter (server token minting exists). Strict mobile NATs need TURN (env ready, server not set up).
3. **Speech-to-text is a no-op** until a provider is chosen, so in practice there are no transcripts or AI verdicts yet. The pipeline is tested with captions fed in directly.
4. **Kick balls aren't synced** between players (local, and they drift home). Owned-room decor is synced.
5. **The world server keeps state in a JSON file** (dev). The Postgres adapter is designed for, but not written.
6. **iOS Safari not tested** (no WebKit build here). iOS needs `AudioContext.resume()` on a tap, which the 🎧 screen does, but it's unverified.
7. Not built from the spec: the slide into the music district (single floor), the "% explored" and secret rooms, the 03:00 secret-room opening (the witching-hour sound is built), music-district speakers playing tracks, the "2 hours, take a breath" moment, streak freezes, the 3-note logo when a followed room goes live (no notifications exist yet), "someone mentioned you" notifications.
8. The decor drag works with mouse and touch, but I only tested it programmatically, not with a finger.

## Needs Sasha
- **The age-assurance vendor** (Yoti, Persona, Veriff, VerifyMy…). Until then, production voice stays locked by design.
- **A streaming STT provider** and key (with no-retention settings), if transcripts and Library verdicts should exist.
- **Hosting + secrets:** the world server on Render (`node server/world/index.ts`, Node ≥ 23.6), `WORLD_SECRET`, `WORLD_ADMIN_KEY`, `ANTHROPIC_API_KEY`, TURN, later Postgres and LiveKit. All are paid or account sign-ups.
- **Stripe:** test keys to try real Checkout; going live is yours.
- **Privacy policy and terms text** (legal review): the in-app copy (cards, Transcribe me, packs) is a draft.
- **Product calls:** should the AI host speak aloud (decision 16)? The prices (room 500, decor 10–60, gifts 5/20/50, packs €2.99/7.99/15.99) are proposals. And should `/` ever point to `/world/`?
- **Deploy:** merging to `main` publishes `/world/` on seeface.world (the static client; it needs the world server hosted first, or it shows the world without people).

## Recommended next 3 steps
1. **Put it on two real phones** (mid-range Android + iPhone) against a hosted world server with TURN. Measure fps, time to first voice and audio CPU, and fix what the GPU and Safari say.
2. **Pick and wire the age vendor and an STT provider.** Together they unlock the success test in production (voice) and the Library (verdicts).
3. **LiveKit client adapter + Postgres store,** so big rooms and real persistence hold up when the first crowd arrives.

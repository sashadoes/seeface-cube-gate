# Decisions

Choices made without asking, per the brief ("make a sensible choice, note it, keep going").

1. **New route `/world/`, not a refactor of `/labyrinth`** (2026-10-09). The three-button rule can't coexist with the live labyrinth's HUD, and other sessions are shipping on it. Shared: `analytics.ts` only.
2. **Worktree `seeface-world-core`, branch `feature/world-core-v1` off `main`.** The main checkout has another session's uncommitted coffee-campaign work.
3. **Plain three.js, no React Three Fiber.** It meets the budget, and the team already knows it. React renders only the three buttons and overlays.
4. **Server in TypeScript run directly by Node ≥ 23.6 (type stripping).** There's no build step, and the server shares `shared/world/*.ts` with the client. Rule: erasable syntax only (no enums, no parameter properties, no namespaces). This is enforced by `erasableSyntaxOnly`.
5. **Our own WebSocket server instead of the public MQTT relay.** The spec requires the server to be authoritative for coins, rooms, permissions and moderation. A public relay can't be.
6. **Voice: a `VoiceAdapter` with a mesh default and LiveKit when configured.** Development never blocks on a LiveKit account. Mesh signalling goes only through our server, and only between members of the same room (or proximity group) who have passed the age gate.
7. **Age gate: the mock adapter is refused in production.** Self-declaration isn't "highly effective age assurance". Without a vendor, production voice stays locked and the world says why. This is stricter than `feature/voice-rooms` (self-declared sheet) on purpose.
8. **The AI host is labelled "AI" (spec section 7).** This overrides the 2026-10-07 `/labyrinth` rule "never show the word ai". The newer brief explicitly requires the label. That older rule still applies to `/labyrinth`.
9. **When no human is online, nothing is faked.** The busiest room is chosen from real counts. With zero people, the player drops into the host's room, which reads "quiet right now · 0 listening". The AI host speaks only as a labelled AI.
10. **Speech-to-text has no "free" fallback.** The browser Web Speech API sends audio to Google on Chrome, and we can't promise what happens to it. So the mock STT produces nothing. Transcripts only exist once a configured provider and an opted-in speaker are both present.
11. **Coins earned by voice need a real listener.** "Speaking" pays only while at least one other human is in the room, and it's capped per day. This stops people farming coins by talking to an empty room.

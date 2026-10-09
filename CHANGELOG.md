# Changelog — seeface1 world

## M5 — AI host, transcripts, Library (world/m5-host)
- The AI host (always labelled AI, Claude `claude-opus-5-5` with server-side refusal fallbacks and structured JSON output; scripted when there's no key or past `HOST_DAILY_CAP`): greets newcomers by name with the current topic, asks a question after 30 s of silence (never more than once every 90 s), re-tags the topic every ~10 min and shifts the room's theme variant (door light hue), writes the Library verdict when a session ends (2 min empty), and flags abuse in transcribed lines to the moderators' queue.
- Transcripts: text only, only from speakers with Transcribe me on (captions from anyone else are dropped server-side); room owners read their own room's transcript (90-day retention, purged automatically); curated public rooms have no owner, so nobody reads theirs.
- Library: verdicts (title, conclusions, key arguments, quotes); a quote shows only after its speaker approves it (ME → the Library). Nobody else can approve your quotes.
- Speech-to-text adapter interface; the mock produces nothing (we never invent speech). A real provider needs Sasha's choice and key.
- Moderation queue page at `/world/admin/` (WORLD_ADMIN_KEY): open reports and AI flags with only the reported person's own lines, the AI's read, and dismiss / strike (1: 24 h voice pause · 2: 7 days · 3: ban) / ban.
- Every HTTP write endpoint is rate limited per address. Closed a hole where a new connection could teleport freely for 8 s.
- Server integration tests: teleport rejection, say-hi only after real speech, caption opt-in, verdict + quote approval (including forged approval), owner-only transcripts, host greeting + silence question, the report → admin flow, blocks cut links.

## M4 — onboarding, age gate, auto-drop, privacy (world/m4-onboarding)
- 🎧 "Put your headphones on" (that tap unlocks audio and plays the 3-note signature) → a name + one of 6 blobs + the 18+ check → three swipeable one-line cards → an automatic fall into the busiest live room (real counts; rooms with someone speaking first; an empty world drops you into First Words with the AI host).
- 18+: a dev-only mock button; in production with no vendor the world says honestly that voice isn't open yet (walking still works).
- Floating quests: "Say hi · +20" (paid by the server only after you really talked or wrote while someone else was in the room), then "Spin the radio · +10" (paid only after a real preview).
- 👤 ME: coins, Transcribe me (off by default, explained), headphones/speakers, 18+ status, privacy link, "delete my data" (transcript lines, quotes, profile, follows; ledger rows anonymised; owned rooms released).
- e2e test (Playwright, 2 real browser contexts): land → onboard → fall into busiest room → hear voice → press MIC → the other person hears you.
- An error boundary, so an overlay crash never blacks out the world.

## M3 — the Radio (world/m3-radio)
- A big glowing dial over the world. Spin it with a thumb; it ticks between real rooms (haptics), with analogue static and a filter sweep between stations, opens on the busiest room, and shows name, topic, real listener count, who's speaking and TRANSCRIBED.
- Locking onto a station plays a 3-second live preview (the server links you one way to that room's speakers), heard flat and band-limited like a radio.
- JUMP IN asks the server, then you fall through a hole that opens under you. "Radio off" mutes the room but you stay.

## M2 — rooms, voice, MIC, proximity audio (world/m2-voice)
- `server/world`: our own WebSocket server (no public relay). It decides rooms from positions, who hears whom (room links, corridor proximity links with hysteresis, 3 s radio previews), who may speak (small rooms: everyone; big rooms: raise hand, host or auto-queue brings you up), rate limits every message type, signed session tokens, and rejects teleports that weren't a server-approved fall.
- Voice: a WebRTC mesh signalled only through our server, only for server-made links, never without the 18+ gate. The mic is requested on the first talk and attached with replaceTrack (nothing is sent while silent). Nothing is recorded.
- Spatial audio: HRTF from the speaker's mouth (nearest 12, equal-power bed beyond), walls muffle (low-pass per wall crossed), a crossfade from muffled to clear on entering a room, per-room reverb (booth, hall, tunnel, closet, corridor), whisper (only within 2.2 m), mute, ducking, limiter.
- Soundscape: drone; district beds (heartbeat entrance, moving-only whispers, market buzz, rain scaled by real crowd, archive clock, music bass leaking through walls, garden pads); wind and a choir at the wells; time-of-day colour and the 03:00 witching hour; crowd sounds only from real reactions.
- UI: MIC (hold, swipe up to lock, tap to unlock, slide down to whisper, tap to type), V to talk, tap an avatar for Follow · Mute · Report · Block (plus "bring up" and "ask to leave" for hosts), a text bubble composer with 5 reactions and a raise-hand button.
- Moderation: block cuts voice both ways; reports carry the target's own transcript lines only; 3 reporters in 24 h pause voice for 1 h pending review; kick bans someone from the room for 10 minutes.

## M1 — movement, physics, labyrinth, wells (world/m1-movement)
- `/world/` is its own page and chunk (none of the cube or labyrinth code).
- Seeded, chunked labyrinth shared by client and server (`shared/world/maze.ts`): spanning-tree corridors with loops, 12 curated rooms around spawn, a hub with a giant well in every nearby chunk, secret walls, bounce pads, wind vents, speed strips, a low-gravity district (Dream Garden).
- Kinematic capsule controller with momentum, coyote time, jump buffer, a double jump, air control and wall bumps (`src/world/player/controller.ts`).
- Blob avatars (6 kinds) with squash-and-stretch, a jelly wobble, blinking and a speaking ring.
- Wells and portals: a 2.6 s freefall through a glowing shaft with a riser, then a flash and a bass-hit splat in the destination room.
- One draw call for all walls, custom shaders (door light, fog, cryptic glitch writing), neon signs in the world.
- Audio engine: master limiter, ducking buses, all SFX synthesised in one key (D pentatonic).
- Tests: maze connectivity, controller feel (12 unit tests).

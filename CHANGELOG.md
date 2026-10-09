# Changelog — seeface1 world

## M1 — movement, physics, labyrinth, wells (world/m1-movement)
- `/world/` is its own page and chunk (none of the cube or labyrinth code).
- Seeded, chunked labyrinth shared by client and server (`shared/world/maze.ts`): spanning-tree corridors with loops, 12 curated rooms around spawn, a hub with a giant well in every nearby chunk, secret walls, bounce pads, wind vents, speed strips, a low-gravity district (Dream Garden).
- Kinematic capsule controller with momentum, coyote time, jump buffer, a double jump, air control and wall bumps (`src/world/player/controller.ts`).
- Blob avatars (6 kinds) with squash-and-stretch, a jelly wobble, blinking and a speaking ring.
- Wells and portals: a 2.6 s freefall through a glowing shaft with a riser, then a flash and a bass-hit splat in the destination room.
- One draw call for all walls, custom shaders (door light, fog, cryptic glitch writing), neon signs in the world.
- Audio engine: master limiter, ducking buses, all SFX synthesised in one key (D pentatonic).
- Tests: maze connectivity, controller feel (12 unit tests).

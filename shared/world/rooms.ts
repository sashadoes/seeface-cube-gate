// The curated public rooms near spawn. Same list on client and server.
// Placement (chunk + local rect) lives in maze.ts; this is what the room IS.

export type Acoustic = "booth" | "hall" | "tunnel" | "closet";
export type District = "entrance" | "whisper" | "market" | "rain" | "archive" | "music" | "garden";

export type ThemePack = {
  /** floor + wall tint, door light colour, neon sign colour (hex ints) */
  floor: number;
  wall: number;
  light: number;
  neon: number;
  /** props drawn in the room, picked from the shared prop shapes */
  props: readonly ("cushion" | "lamp" | "plant" | "speaker" | "books" | "candle" | "tv" | "ball")[];
};

export type RoomDef = {
  id: string;
  name: string;
  topic: string;
  acoustic: Acoustic;
  theme: ThemePack;
  /** big rooms switch to raise-hand mode above this many people in it */
  stageAt: number;
};

const T = (floor: number, wall: number, light: number, neon: number, props: ThemePack["props"]): ThemePack => ({ floor, wall, light, neon, props });

export const ROOMS: readonly RoomDef[] = [
  { id: "first-words", name: "First Words", topic: "new here? say hi", acoustic: "booth", stageAt: 12, theme: T(0x2a1d14, 0x3a2a20, 0xffb070, 0xff9a3c, ["cushion", "lamp", "plant"]) },
  { id: "night-shift", name: "The Night Shift", topic: "insomniacs compare notes", acoustic: "booth", stageAt: 12, theme: T(0x101626, 0x1c2438, 0x8fb4ff, 0x6c8cff, ["lamp", "cushion", "tv"]) },
  { id: "static-church", name: "Static Church", topic: "conspiracies, gently", acoustic: "hall", stageAt: 16, theme: T(0x15141a, 0x24222c, 0xd8c8ff, 0xb28cff, ["candle", "speaker", "books"]) },
  { id: "lost-found", name: "The Lost & Found", topic: "tell us a thing you lost", acoustic: "closet", stageAt: 8, theme: T(0x1f1a12, 0x2e271b, 0xffd58a, 0xffc04d, ["books", "lamp", "ball"]) },
  { id: "bad-advice", name: "Bad Advice Bureau", topic: "ask, then ignore", acoustic: "booth", stageAt: 12, theme: T(0x1a1012, 0x2b1a1e, 0xff9fb0, 0xff5c8a, ["tv", "cushion", "plant"]) },
  { id: "neon-confessional", name: "Neon Confessional", topic: "say it to strangers", acoustic: "closet", stageAt: 8, theme: T(0x0e1416, 0x16242a, 0x7ff5e0, 0x2ee6c8, ["candle", "cushion"]) },
  { id: "weird-science", name: "The Weird Science Fair", topic: "theories nobody asked for", acoustic: "hall", stageAt: 16, theme: T(0x101a10, 0x1c2c1c, 0xb8ff8a, 0x7dff3c, ["tv", "ball", "lamp"]) },
  { id: "basement-radio", name: "Basement Radio", topic: "music you'll pretend to know", acoustic: "tunnel", stageAt: 16, theme: T(0x140f1c, 0x221a30, 0xff8af0, 0xe23cff, ["speaker", "speaker", "cushion"]) },
  { id: "dream-desk", name: "The Dream Desk", topic: "last night's dreams, decoded", acoustic: "booth", stageAt: 12, theme: T(0x12101e, 0x201c34, 0xc8b8ff, 0x9a7dff, ["plant", "candle", "cushion"]) },
  { id: "strangers-kitchen", name: "Strangers' Kitchen", topic: "what are you eating", acoustic: "booth", stageAt: 12, theme: T(0x1c140c, 0x2c2014, 0xffc890, 0xff8c2e, ["lamp", "ball", "plant"]) },
  { id: "archive-steps", name: "The Archive Steps", topic: "books, films, obsessions", acoustic: "hall", stageAt: 16, theme: T(0x16120e, 0x262019, 0xf0dcb0, 0xe8c070, ["books", "books", "lamp"]) },
  { id: "cryptid-hotline", name: "Cryptid Hotline", topic: "seen something?", acoustic: "tunnel", stageAt: 12, theme: T(0x0c1210, 0x16201c, 0x9affc8, 0x3cff9a, ["tv", "candle"]) },
];

export const roomById = (id: string) => ROOMS.find((r) => r.id === id);

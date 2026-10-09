// WebSocket messages between the world client and the world server. JSON, one object per frame.
// The server is authoritative: the client sends intents and positions; the server decides rooms,
// who hears whom, who may speak, coins and moderation.

export type Role = "member" | "speaker" | "host" | "owner" | "moderator";

export type PeerView = {
  id: string;
  name: string;
  blob: string;
  x: number;
  y: number;
  z: number;
  f: number; // facing
  room: string | null;
  talking: 0 | 1 | 2; // 0 silent, 1 talking, 2 whispering
  hand: boolean;
  role: Role;
  bubble?: { text: string; at: number };
};

export type RoomSummary = {
  id: string;
  name: string;
  topic: string;
  people: number;
  speaking: string[]; // names of people talking right now
  stage: boolean; // raise-hand mode
  transcribed: boolean; // someone in it has "transcribe me" on
  owner: string | null;
  public: boolean;
  hostAi: boolean;
};

/** a voice link the server allows: you may connect audio with this peer */
export type Link = { peer: string; initiator: boolean; /** they may send audio to you */ hearThem: boolean; /** you may send audio to them */ theyHearMe: boolean; kind: "room" | "near" };

export type ClientMsg =
  | { t: "hello"; token: string | null; name: string; blob: string; v: number; ref?: string }
  | { t: "age"; action: "start" | "mock" }
  | { t: "profile"; name: string; blob: string }
  | { t: "pos"; x: number; y: number; z: number; f: number; falling: boolean }
  | { t: "talk"; on: boolean; whisper: boolean }
  | { t: "signal"; to: string; data: unknown }
  | { t: "bubble"; text: string }
  | { t: "react"; emoji: string }
  | { t: "hand"; up: boolean }
  | { t: "promote"; who: string; speaker: boolean }
  | { t: "follow"; who: string; on: boolean }
  | { t: "mute"; who: string; on: boolean }
  | { t: "block"; who: string }
  | { t: "report"; who: string; reason: string }
  | { t: "kick"; who: string }
  | { t: "transcribe"; on: boolean }
  | { t: "caption"; text: string; final: boolean }
  | { t: "fallTo"; room: string }
  | { t: "preview"; room: string | null }
  | { t: "heard" }
  | { t: "quest"; id: "say-hi" | "spin-radio" }
  | { t: "ping" };

export type ServerMsg =
  | { t: "welcome"; id: string; token: string; isNew: boolean; ice: RTCIceServer[]; voice: "mesh" | "livekit"; age: AgeState; coins: number; name: string; flags: Record<string, boolean>; mutes: string[]; blocks: string[]; follows: string[] }
  | { t: "peers"; peers: PeerView[]; gone: string[] }
  | { t: "rooms"; rooms: RoomSummary[] }
  | { t: "links"; links: Link[]; room: string | null; canSpeak: boolean; stage: boolean; role: Role }
  | { t: "signal"; from: string; data: unknown }
  | { t: "react"; from: string; emoji: string; room: string }
  | { t: "host"; room: string; text: string; ai: true }
  | { t: "coins"; balance: number; delta: number; reason: string }
  | { t: "kicked"; room: string }
  | { t: "notice"; text: string }
  | { t: "fallTo"; room: string; ok: boolean; reason?: string }
  | { t: "age"; state: AgeState; url?: string }
  | { t: "pong" }
  | { t: "error"; code: string };

export type AgeState = "unverified" | "pending" | "verified" | "unavailable";

export const PROTOCOL_V = 1;
export const MAX_BUBBLE = 80;
export const EMOJIS = ["😂", "🔥", "👏", "😮", "💜"] as const;
export const NEAR_ON = 10; // metres: corridor voice links open
export const NEAR_OFF = 14; // and close again (hysteresis)
export const WHISPER_R = 2.2;
export const MAX_SPEAKERS = 6;

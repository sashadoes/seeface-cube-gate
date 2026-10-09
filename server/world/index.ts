// The seeface1 world server: one WebSocket per player. Authoritative for rooms (from positions),
// who hears whom (voice links), who may speak, coins, and moderation. Audio never passes through
// here: in mesh mode it goes device to device, in LiveKit mode through the SFU. Only WebRTC
// handshakes (signals) are relayed, and only between people the server has linked.
//
// Run: node server/world/index.ts   (Node ≥ 23.6 strips the types itself)
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { CELL, SPAWN, curatedRoomPlace, curatedRooms, roomAtPoint } from "../../shared/world/maze.ts";
import { ROOMS, roomById } from "../../shared/world/rooms.ts";
import { EMOJIS, MAX_BUBBLE, MAX_SPEAKERS, NEAR_OFF, NEAR_ON, PROTOCOL_V, type ClientMsg, type Link, type PeerView, type RoomSummary, type ServerMsg, type AgeState } from "../../shared/world/protocol.ts";
import { isStage, mayEnterRoom, mayKick, mayLink, mayPromote, maySpeak, roleIn, type Actor, type RoomState } from "../../shared/world/permissions.ts";
import { apply, balance, EARN, type Reason } from "../../shared/world/ledger.ts";
import { acceptCaption, deleteUserData, purgeExpired, reportExcerpt } from "../../shared/world/transcripts.ts";
import { filterMark } from "../../src/marks/filter.ts";
import { createStore, type User } from "./store.ts";
import { PROD, ageAdapter, iceServers, livekit, signUser, verifyUser } from "./adapters.ts";
import { createHost } from "./host.ts";
import { createEconomy } from "./economy.ts";

const PORT = Number(process.env.WORLD_PORT ?? 8787);
const ORIGINS = (process.env.WORLD_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const store = createStore();
const age = ageAdapter();
const lk = livekit();

// ------------------------------------------------------------------ sessions
type Session = {
  id: string; // = user id
  ws: WebSocket;
  user: User;
  x: number;
  y: number;
  z: number;
  f: number;
  lastPosAt: number;
  fallUntil: number;
  room: string | null;
  joinedRoomAt: number;
  talking: 0 | 1 | 2;
  talkSince: number;
  hand: boolean;
  handAt: number;
  preview: string | null;
  previewUntil: number;
  previewed: boolean;
  bubble?: { text: string; at: number };
  sentPeers: Set<string>;
  sentLinks: string;
  links: Map<string, Link>;
  buckets: Record<string, { tokens: number; at: number }>;
  listenMs: number;
  speakMs: number;
  saidHi: boolean;
  lastSpokeAt: number;
};
const sessions = new Map<string, Session>();

// ------------------------------------------------------------------ rooms
const rooms = new Map<string, RoomState & { name: string; topic: string; hostAi: boolean }>();
for (const def of ROOMS)
  rooms.set(def.id, { id: def.id, name: def.name, topic: def.topic, owner: null, public: true, invited: new Set(), members: new Set(), speakers: new Set(), hosts: new Set(), stageAt: def.stageAt, kicked: new Map(), hostAi: true });
function ownedRoomState(id: string) {
  let r = rooms.get(id);
  const owned = store.data.ownedRooms[id];
  if (!owned) return r ?? null;
  if (!r) {
    r = { id, name: owned.name, topic: owned.topic, owner: owned.owner, public: owned.public, invited: new Set(owned.invited), members: new Set(), speakers: new Set(), hosts: new Set(), stageAt: 12, kicked: new Map(), hostAi: false };
    rooms.set(id, r);
  }
  Object.assign(r, { name: owned.name, topic: owned.topic, public: owned.public, owner: owned.owner });
  r.invited = new Set(owned.invited);
  return r;
}

const actor = (s: Session): Actor => ({ id: s.id, ageVerified: s.user.ageVerified, role: "member", moderator: s.user.moderator, banned: s.user.bannedUntil > Date.now() || s.user.voiceBannedUntil > Date.now() });
const blocked = (a: string, b: string) => !!store.data.users[a]?.blocks.includes(b);
const send = (s: Session, m: ServerMsg) => s.ws.readyState === 1 && s.ws.send(JSON.stringify(m));
const roomMembers = (id: string) => [...sessions.values()].filter((s) => s.room === id);
const today = () => new Date().toISOString().slice(0, 10);
const ageState = (u: User): AgeState => (u.ageVerified ? "verified" : age.mode === "unavailable" ? "unavailable" : "unverified");

// ------------------------------------------------------------------ coins
function credit(s: Session | null, user: string, delta: number, reason: Reason, key: string) {
  const r = apply(store.data.ledger, { user, delta, reason, key, at: Date.now() }, randomUUID);
  if (r.ok) {
    store.dirty();
    const target = s ?? sessions.get(user);
    if (target) send(target, { t: "coins", balance: r.balance, delta, reason });
  }
  return r;
}
const host = createHost({ send: (room, text) => roomMembers(room).forEach((s) => send(s, { t: "host", room, text, ai: true })), store });
const economy = createEconomy({ store, sessions, credit, send, ownedRoomState });

// ------------------------------------------------------------------ rate limits (token buckets)
const LIMITS: Record<string, [number, number]> = {
  // [burst, per second]
  any: [60, 30],
  pos: [20, 12],
  signal: [80, 40],
  bubble: [2, 0.4],
  react: [4, 1],
  report: [3, 0.05],
  fallTo: [2, 0.34],
  talk: [10, 4],
  caption: [10, 3],
  write: [10, 2],
};
function allow(s: Session, kind: string) {
  const [burst, rate] = LIMITS[kind] ?? LIMITS.write;
  const now = Date.now();
  const b = (s.buckets[kind] ??= { tokens: burst, at: now });
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * rate);
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

// ------------------------------------------------------------------ messages
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const BLOB_IDS = ["moth", "imp", "drip", "eye", "spike", "halo"];
const cleanName = (raw: unknown) => {
  const n = str(raw, 16).replace(/[^\p{L}\p{N}_. ]/gu, "").trim();
  return n.length >= 2 && filterMark(n) === n ? n : null;
};

function onHello(ws: WebSocket, m: Extract<ClientMsg, { t: "hello" }>, ip: string) {
  if (m.v !== PROTOCOL_V) return ws.close(4000, "old client");
  let id = verifyUser(m.token);
  let user = id ? store.data.users[id] : undefined;
  const isNew = !user;
  if (!user) {
    id = randomUUID();
    user = { id, name: cleanName(m.name) ?? `blob_${id.slice(0, 4)}`, blob: BLOB_IDS.includes(m.blob) ? m.blob : "moth", createdAt: Date.now(), lastSeen: Date.now(), ageVerified: false, ageMethod: null, moderator: false, bannedUntil: 0, voiceBannedUntil: 0, transcribe: false, mutes: [], blocks: [], follows: [], quests: [], days: [] };
    store.data.users[id] = user;
    store.dirty();
  }
  if (user.bannedUntil > Date.now()) return ws.close(4003, "banned");
  // one live session per user: the newest wins
  const old = sessions.get(user.id);
  if (old) old.ws.close(4001, "replaced");
  const s: Session = { id: user.id, ws, user, x: SPAWN.x, y: 0, z: SPAWN.z, f: 0, lastPosAt: 0, fallUntil: 0, room: null, joinedRoomAt: 0, talking: 0, talkSince: 0, hand: false, handAt: 0, preview: null, previewUntil: 0, previewed: false, sentPeers: new Set(), sentLinks: "", links: new Map(), buckets: {}, listenMs: 0, speakMs: 0, saidHi: false, lastSpokeAt: 0 };
  sessions.set(user.id, s);
  user.lastSeen = Date.now();
  if (!user.days.includes(today())) user.days.push(today());
  store.dirty();
  if (isNew) credit(null, user.id, EARN.welcome, "welcome", "welcome");
  economy.onHello(s, isNew, m.ref);
  send(s, {
    t: "welcome",
    id: user.id,
    token: signUser(user.id),
    isNew,
    ice: iceServers(),
    voice: lk ? "livekit" : "mesh",
    age: ageState(user),
    coins: balance(store.data.ledger, user.id),
    name: user.name,
    flags: { ageMock: age.mode === "mock" },
    mutes: user.mutes,
    blocks: user.blocks,
    follows: user.follows,
  });
  if (user.days.length > 1 && user.days[user.days.length - 1] === today()) credit(s, user.id, EARN.daily, "daily", `daily:${today()}`);
  sendRooms(s);
  void ip;
  return s;
}

function onMessage(s: Session, m: ClientMsg) {
  const now = Date.now();
  switch (m.t) {
    case "ping":
      return send(s, { t: "pong" });
    case "profile": {
      if (!allow(s, "write")) return;
      const n = cleanName(m.name);
      if (n) s.user.name = n;
      if (BLOB_IDS.includes(m.blob)) s.user.blob = m.blob;
      store.dirty();
      return;
    }
    case "age": {
      if (!allow(s, "write")) return;
      if (m.action === "mock" && age.mode === "mock") {
        s.user.ageVerified = true;
        s.user.ageMethod = "dev-mock";
        store.dirty();
        return send(s, { t: "age", state: "verified" });
      }
      if (m.action === "start" && age.mode === "vendor") {
        void age.start(s.id).then((r) => send(s, { t: "age", state: "pending", url: r.url }));
        return;
      }
      return send(s, { t: "age", state: ageState(s.user) });
    }
    case "pos": {
      if (!allow(s, "pos")) return;
      const x = num(m.x), y = num(m.y), z = num(m.z), f = num(m.f);
      if ([x, y, z, f].some(Number.isNaN)) return;
      const dt = Math.max(0.05, (now - s.lastPosAt) / 1000);
      const jump = Math.hypot(x - s.x, z - s.z);
      // never trust teleports: only allowed while a server-approved fall is in progress
      if (jump > 22 * dt + 2 && now > s.fallUntil) return send(s, { t: "error", code: "pos-rejected" });
      Object.assign(s, { x, y: Math.max(-200, Math.min(40, y)), z, f, lastPosAt: now });
      return;
    }
    case "fallTo": {
      if (!allow(s, "fallTo")) return send(s, { t: "fallTo", room: m.room, ok: false, reason: "slow down" });
      const r = ownedRoomState(m.room);
      if (!r || !(curatedRoomPlace(m.room) || store.data.ownedRooms[m.room])) return send(s, { t: "fallTo", room: m.room, ok: false, reason: "no such room" });
      if (!mayEnterRoom(actor(s), r, now)) return send(s, { t: "fallTo", room: m.room, ok: false, reason: r.public ? "you were asked to leave" : "private room" });
      s.fallUntil = now + 6000;
      return send(s, { t: "fallTo", room: m.room, ok: true });
    }
    case "talk": {
      if (!allow(s, "talk")) return;
      const r = s.room ? rooms.get(s.room) : null;
      const ok = r ? maySpeak(actor(s), r) : actor(s).ageVerified && !actor(s).banned;
      const was = s.talking;
      s.talking = m.on && ok ? (m.whisper ? 2 : 1) : 0;
      if (s.talking && !was) s.talkSince = now;
      if (s.talking) s.lastSpokeAt = now;
      return;
    }
    case "signal": {
      if (!allow(s, "signal")) return;
      const to = sessions.get(str(m.to, 64));
      // relay only between linked people
      if (!to || !s.links.has(to.id)) return;
      const data = JSON.stringify(m.data ?? null);
      if (data.length > 16000) return;
      return send(to, { t: "signal", from: s.id, data: m.data });
    }
    case "bubble": {
      if (!allow(s, "bubble") || !s.user.ageVerified) return;
      const text = filterMark(str(m.text, MAX_BUBBLE));
      if (!text) return send(s, { t: "notice", text: "that one can't be shown" });
      s.bubble = { text, at: now };
      if (s.room && roomMembers(s.room).length > 1) s.saidHi = true;
      host.onText(s.room, s.user.name, text);
      return;
    }
    case "react": {
      if (!allow(s, "react") || !s.room || !EMOJIS.includes(m.emoji as (typeof EMOJIS)[number])) return;
      const room = s.room;
      roomMembers(room).forEach((o) => send(o, { t: "react", from: s.id, emoji: m.emoji, room }));
      return;
    }
    case "hand": {
      if (!allow(s, "write")) return;
      s.hand = !!m.up && !!s.room;
      s.handAt = now;
      return;
    }
    case "promote": {
      if (!allow(s, "write") || !s.room) return;
      const r = rooms.get(s.room)!;
      const who = str(m.who, 64);
      if (!mayPromote(actor(s), r, who)) return;
      if (m.speaker) r.speakers.add(who);
      else r.speakers.delete(who);
      const t = sessions.get(who);
      if (t) t.hand = false;
      return;
    }
    case "follow":
    case "mute": {
      if (!allow(s, "write")) return;
      const who = str(m.who, 64);
      if (!store.data.users[who] || who === s.id) return;
      const list = m.t === "follow" ? s.user.follows : s.user.mutes;
      const i = list.indexOf(who);
      if (m.on && i < 0) list.push(who);
      if (!m.on && i >= 0) list.splice(i, 1);
      store.dirty();
      return;
    }
    case "block": {
      if (!allow(s, "write")) return;
      const who = str(m.who, 64);
      if (!store.data.users[who] || who === s.id || s.user.blocks.includes(who)) return;
      s.user.blocks.push(who);
      store.dirty();
      return;
    }
    case "report": {
      if (!allow(s, "report")) return send(s, { t: "notice", text: "reports are limited, try again in a minute" });
      const who = str(m.who, 64);
      const target = store.data.users[who];
      if (!target || who === s.id) return;
      const room = sessions.get(who)?.room ?? null;
      const report = { id: randomUUID(), at: now, reporter: s.id, target: who, reason: str(m.reason, 200) || "no reason given", room, excerpt: reportExcerpt(store.data.transcripts, who, room, now), aiFlag: null as string | null, status: "open" as const };
      store.data.reports.push(report);
      host.flagReport(report);
      // three different people in 24 h → voice paused for an hour until a moderator looks
      const recent = new Set(store.data.reports.filter((r) => r.target === who && now - r.at < 86_400_000).map((r) => r.reporter));
      if (recent.size >= 3 && target.voiceBannedUntil < now) {
        target.voiceBannedUntil = now + 3_600_000;
        store.data.strikes.push({ at: now, user: who, reason: "3 reports in 24h (automatic, pending review)", by: "system" });
      }
      store.dirty();
      return send(s, { t: "notice", text: "reported. thank you. a human will look at it." });
    }
    case "kick": {
      if (!allow(s, "write") || !s.room) return;
      const r = rooms.get(s.room)!;
      const t = sessions.get(str(m.who, 64));
      if (!t || t.room !== r.id || !mayKick(actor(s), r, actor(t))) return;
      r.kicked.set(t.id, now + 10 * 60_000);
      r.speakers.delete(t.id);
      send(t, { t: "kicked", room: r.id });
      return;
    }
    case "transcribe": {
      if (!allow(s, "write")) return;
      s.user.transcribe = !!m.on;
      store.dirty();
      return;
    }
    case "caption": {
      if (!allow(s, "caption") || !s.room || !m.final) return;
      const text = acceptCaption(s.user, str(m.text, 500));
      if (!text) return;
      host.onCaption(s.room, s.id, s.user.name, text);
      return;
    }
    case "preview": {
      if (!allow(s, "write")) return;
      const r = m.room ? rooms.get(m.room) : null;
      s.preview = r ? r.id : null;
      s.previewUntil = now + 3500;
      if (r) s.previewed = true;
      return;
    }
    case "heard":
      return;
    case "forget": {
      // delete my data: transcript lines, quotes, profile, follows; ledger rows are anonymised
      // (kept only as numbers, so purchase records still add up), owned rooms are released
      const d = deleteUserData(store.data.transcripts, store.data.verdicts, s.id);
      store.data.transcripts = d.lines;
      store.data.verdicts = d.verdicts;
      for (const e of store.data.ledger) if (e.user === s.id) e.user = "deleted";
      for (const [id, r] of Object.entries(store.data.ownedRooms)) if (r.owner === s.id) delete store.data.ownedRooms[id];
      for (const u of Object.values(store.data.users)) {
        u.follows = u.follows.filter((x) => x !== s.id);
        u.mutes = u.mutes.filter((x) => x !== s.id);
        u.blocks = u.blocks.filter((x) => x !== s.id);
      }
      store.data.reports = store.data.reports.filter((r) => r.reporter !== s.id);
      delete store.data.users[s.id];
      store.dirty();
      s.ws.close(4004, "forgotten");
      return;
    }
    case "quest": {
      if (!allow(s, "write")) return;
      if (m.id === "say-hi" && (s.saidHi || s.speakMs > 1500)) credit(s, s.id, EARN["say-hi"], "say-hi", "say-hi");
      if (m.id === "spin-radio" && s.previewed) credit(s, s.id, EARN["spin-radio"], "spin-radio", "spin-radio");
      return;
    }
    default:
      economy.onMessage(s, m as { t: string });
  }
}

// ------------------------------------------------------------------ the tick
function inRoomAllowed(s: Session, id: string | null) {
  if (!id) return null;
  const r = ownedRoomState(id);
  if (!r || !rooms.has(id)) return null;
  if (!mayEnterRoom(actor(s), r, Date.now())) {
    if (s.room !== id) send(s, { t: "kicked", room: id });
    return null;
  }
  return id;
}

function tickRooms(dt: number) {
  const now = Date.now();
  for (const s of sessions.values()) {
    const id = inRoomAllowed(s, roomAtPoint(s.x, s.z)?.id ?? null);
    if (id !== s.room) {
      if (s.room) {
        const old = rooms.get(s.room)!;
        old.members.delete(s.id);
        old.speakers.delete(s.id);
      }
      s.room = id;
      s.hand = false;
      s.joinedRoomAt = now;
      if (id) {
        const r = rooms.get(id)!;
        r.members.add(s.id);
        host.onJoin(id, s.user.name, r.members.size);
      }
    }
    if (s.preview && now > s.previewUntil) s.preview = null;
    if (s.talking && now - s.lastSpokeAt > 15_000) s.talking = 0; // a stuck mic never stays "live" forever without updates
  }
  for (const r of rooms.values()) {
    for (const id of r.members) if (!sessions.has(id)) r.members.delete(id);
    if (!isStage(r)) {
      r.speakers.clear();
      continue;
    }
    // just became a stage: the people already talking here keep the floor (by arrival)
    if (r.speakers.size === 0) {
      [...r.members].map((id) => sessions.get(id)!).sort((a, b) => a.joinedRoomAt - b.joinedRoomAt).slice(0, MAX_SPEAKERS).forEach((s) => r.speakers.add(s.id));
    }
    // no human host here → raised hands get the floor in order as seats free up
    const hasHost = [...r.members].some((id) => {
      const s = sessions.get(id);
      return s && ["owner", "host", "moderator"].includes(roleIn(actor(s), r));
    });
    if (!hasHost) {
      const hands = [...r.members].map((id) => sessions.get(id)!).filter((s) => s.hand).sort((a, b) => a.handAt - b.handAt);
      for (const s of r.speakers) {
        const sp = sessions.get(s);
        if (hands.length && sp && now - Math.max(sp.lastSpokeAt, sp.joinedRoomAt) > 180_000) r.speakers.delete(s);
      }
      while (hands.length && r.speakers.size < MAX_SPEAKERS) {
        const h = hands.shift()!;
        r.speakers.add(h.id);
        h.hand = false;
      }
    }
  }
  // listening / speaking pay (only with at least one other human in the room)
  for (const s of sessions.values()) {
    if (!s.room) continue;
    const others = rooms.get(s.room)!.members.size - 1;
    if (others < 1) continue;
    s.listenMs += dt;
    if (s.talking) s.speakMs += dt;
    if (s.listenMs >= 300_000) {
      s.listenMs -= 300_000;
      credit(s, s.id, EARN.listen, "listen", `listen:${s.id}:${now}`);
    }
    if (s.speakMs >= 60_000) {
      s.speakMs -= 60_000;
      credit(s, s.id, EARN.speak, "speak", `speak:${s.id}:${now}`);
    }
  }
  host.tick(now, (id) => roomMembers(id).map((s) => ({ name: s.user.name, talking: !!s.talking })));
}

function tickLinks() {
  const all = [...sessions.values()];
  for (const a of all) {
    const links = new Map<string, Link>();
    const ra = a.room ? rooms.get(a.room)! : null;
    for (const b of all) {
      if (a === b || !mayLink(actor(a), actor(b), blocked)) continue;
      const rb = b.room ? rooms.get(b.room)! : null;
      const initiator = a.id < b.id;
      if (ra && ra === rb) {
        const hearThem = maySpeak(actor(b), ra), theyHearMe = maySpeak(actor(a), ra);
        if (hearThem || theyHearMe) links.set(b.id, { peer: b.id, initiator, hearThem, theyHearMe, kind: "room" });
      } else if (!ra && !rb) {
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < NEAR_ON || (a.links.has(b.id) && d < NEAR_OFF)) links.set(b.id, { peer: b.id, initiator, hearThem: true, theyHearMe: true, kind: "near" });
      }
      // radio preview: hear a room for 3 s (one way), and the room's speakers send to you
      if (a.preview && rb?.id === a.preview && maySpeak(actor(b), rb)) links.set(b.id, { peer: b.id, initiator, hearThem: true, theyHearMe: links.get(b.id)?.theyHearMe ?? false, kind: "room" });
      if (b.preview && ra?.id === b.preview && maySpeak(actor(a), ra) && !links.has(b.id)) links.set(b.id, { peer: b.id, initiator, hearThem: false, theyHearMe: true, kind: "room" });
    }
    a.links = links;
    const msg: ServerMsg = { t: "links", links: [...links.values()], room: a.room, canSpeak: ra ? maySpeak(actor(a), ra) : actor(a).ageVerified && !actor(a).banned, stage: ra ? isStage(ra) : false, role: ra ? roleIn(actor(a), ra) : "member" };
    const key = JSON.stringify(msg);
    if (key !== a.sentLinks) {
      a.sentLinks = key;
      send(a, msg);
    }
  }
}

const view = (s: Session): PeerView => ({
  id: s.id,
  name: s.user.name,
  blob: s.user.blob,
  x: Math.round(s.x * 100) / 100,
  y: Math.round(s.y * 100) / 100,
  z: Math.round(s.z * 100) / 100,
  f: Math.round(s.f * 100) / 100,
  room: s.room,
  talking: s.talking,
  hand: s.hand,
  role: s.room ? roleIn(actor(s), rooms.get(s.room)!) : "member",
  ...(s.bubble && Date.now() - s.bubble.at < 7000 ? { bubble: s.bubble } : {}),
});

function tickPeers() {
  const all = [...sessions.values()];
  for (const a of all) {
    const near = all
      .filter((b) => b !== a && (Math.hypot(a.x - b.x, a.z - b.z) < 60 || (a.room && a.room === b.room)))
      .sort((p, q) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(a.x - q.x, a.z - q.z))
      .slice(0, 40);
    const ids = new Set(near.map((b) => b.id));
    const gone = [...a.sentPeers].filter((id) => !ids.has(id));
    if (!near.length && !gone.length) continue;
    a.sentPeers = ids;
    send(a, { t: "peers", peers: near.map(view), gone });
  }
}

function summaries(): RoomSummary[] {
  const out: RoomSummary[] = [];
  for (const r of rooms.values()) {
    if (!r.public && !r.owner) continue;
    const members = [...r.members].map((id) => sessions.get(id)).filter((s): s is Session => !!s);
    out.push({ id: r.id, name: r.name, topic: host.topicOf(r.id) ?? r.topic, people: members.length, speaking: members.filter((s) => s.talking).map((s) => s.user.name), stage: isStage(r), transcribed: members.some((s) => s.user.transcribe), owner: r.owner ? store.data.users[r.owner]?.name ?? null : null, public: r.public, hostAi: r.hostAi, variant: host.variantOf(r.id) });
  }
  return out;
}
const sendRooms = (s: Session) => send(s, { t: "rooms", rooms: summaries().filter((r) => r.public || r.id === s.room || store.data.ownedRooms[r.id]?.owner === s.id || store.data.ownedRooms[r.id]?.invited.includes(s.id)) });

let last = Date.now(), n = 0;
setInterval(() => {
  const now = Date.now();
  const dt = now - last;
  last = now;
  n++;
  tickRooms(dt);
  tickPeers();
  if (n % 2 === 0) tickLinks();
  if (n % 16 === 0) sessions.forEach(sendRooms);
  if (n % 6000 === 0) {
    store.data.transcripts = purgeExpired(store.data.transcripts, now);
    store.dirty();
  }
}, 125);

// ------------------------------------------------------------------ http + ws
const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  const origin = req.headers.origin ?? "";
  if (originOk(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  // every write endpoint is rate limited per address
  if (req.method === "POST" && !httpAllow(String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0])) return json(res, 429, { ok: false });
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") return json(res, 200, { ok: true, people: sessions.size, voice: lk ? "livekit" : "mesh", age: age.mode, store: process.env.WORLD_STORE ?? "file" });
  if (url.pathname === "/rooms") return json(res, 200, { rooms: summaries().filter((r) => r.public) });
  economy.http(req, res, url).then((handled) => {
    if (!handled) host.http(req, res, url, verifyUser).then((h2) => (h2 ? null : json(res, 404, { ok: false })));
  }).catch((e) => {
    console.error(e);
    json(res, 500, { ok: false });
  });
});
const httpBuckets = new Map<string, { tokens: number; at: number }>();
function httpAllow(ip: string) {
  const now = Date.now();
  const b = httpBuckets.get(ip) ?? { tokens: 20, at: now };
  b.tokens = Math.min(20, b.tokens + ((now - b.at) / 1000) * 0.5);
  b.at = now;
  httpBuckets.set(ip, b);
  if (httpBuckets.size > 50_000) httpBuckets.clear();
  if (b.tokens < 1) return false;
  b.tokens--;
  return true;
}
const json = (res: ServerResponse, code: number, body: unknown) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(body));
function originOk(origin: string) {
  if (!origin) return !PROD;
  if (ORIGINS.includes(origin)) return true;
  return !PROD && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[\w-]+\.localhost|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin);
}

const wss = new WebSocketServer({ server: httpServer, maxPayload: 32 * 1024 });
wss.on("connection", (ws, req) => {
  if (!originOk(req.headers.origin ?? "")) return ws.close(4002, "origin");
  const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0];
  let s: Session | undefined;
  const helloTimer = setTimeout(() => !s && ws.close(4000, "no hello"), 10_000);
  ws.on("message", (raw) => {
    let m: ClientMsg;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!m || typeof m !== "object" || typeof (m as { t?: unknown }).t !== "string") return;
    if (!s) {
      if (m.t === "hello") {
        s = onHello(ws, m, ip) ?? undefined;
        clearTimeout(helloTimer);
      }
      return;
    }
    if (!allow(s, "any")) return;
    try {
      onMessage(s, m);
    } catch (e) {
      console.error("world: message failed", m.t, e);
    }
  });
  ws.on("close", () => {
    clearTimeout(helloTimer);
    if (s && sessions.get(s.id) === s) {
      sessions.delete(s.id);
      if (s.room) {
        const r = rooms.get(s.room);
        r?.members.delete(s.id);
        r?.speakers.delete(s.id);
      }
    }
  });
});

httpServer.listen(PORT, () => console.log(`seeface1 world server on :${PORT} · voice ${lk ? "livekit" : "mesh"} · age ${age.mode} · ${curatedRooms().length} rooms · cell ${CELL} m`));
const bye = () => {
  store.flush();
  process.exit(0);
};
process.on("SIGINT", bye);
process.on("SIGTERM", bye);
export { roomById };

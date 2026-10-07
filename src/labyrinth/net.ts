// Presence: who else is walking the labyrinth right now.
// TEMPORARY TRANSPORT: a free public MQTT relay (no account, no server of our
// own). Only anonymous positions and light signals are sent, never names or
// text. Anyone can read a public relay, so before launch this moves to our own
// server (same message shapes).
import mqtt, { type MqttClient } from "mqtt";
import { cleanNick } from "./nick";
import { filterMark } from "../marks/filter";

export const EMOTES = ["stare", "spin", "melt", "float", "scream"] as const;
export type Emote = (typeof EMOTES)[number];

const RELAYS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
const ROOT = "seeface1/lab/v1";
// phones send a little less often (battery, data)
const SEND_HZ = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches ? 4 : 6;
// interest areas: you only receive the positions of people in your 64 m square
// and the 8 around it; everyone also sends a light "here I am" beacon every 5 s
// (for the map, the online count and invites to far-away friends)
const AREA_M = 64;
const BEACON_MS = 5000;
const FAR_STALE_MS = 16000;
const areaOf = (x: number, z: number) => `${Math.floor(x / AREA_M)}_${Math.floor(z / AREA_M)}`;
const areasAround = (x: number, z: number) => {
  const ax = Math.floor(x / AREA_M), az = Math.floor(z / AREA_M);
  const out: string[] = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(`${ax + i}_${az + j}`);
  return out;
};

/** someone far away: only their beacon (coarse position) */
export type FarPeer = { id: string; nick: string; x: number; z: number; last: number };
const STALE_MS = 5000;

export type Peer = {
  id: string;
  x: number;
  z: number;
  yaw: number;
  light: number;
  nick: string;
  /** colour of the relic they're carrying (0 = none) */
  held: number;
  last: number;
  signal: number; // timestamp of their last light signal
};

export type Presence = {
  me: string;
  peers: Map<string, Peer>;
  /** everyone in the labyrinth (beacons every 5 s), including people far away */
  far: Map<string, FarPeer>;
  send: (s: { x: number; z: number; yaw: number; light: number; nick: string; held?: number }) => void;
  signal: () => void;
  onSignal: (fn: (p: Peer) => void) => void;
  online: () => number;
  /** Shared, persistent world edits (wishes): retained messages on the relay. */
  publishWorld: (path: string, data: object) => void;
  onWorld: (fn: (path: string, data: Record<string, unknown>) => void) => void;
  /** knife strike at another player; the victim's own client decides if it lands */
  strike: (target: string) => void;
  onStruck: (fn: (from: Peer) => void) => void;
  /** the victim confirms a kill and hands over blood dollars */
  confirmKill: (attacker: string, amount: number) => void;
  onKillConfirmed: (fn: (amount: number) => void) => void;
  /** tell someone you're coming to meet them (from the map) */
  call: (target: string) => void;
  onCalled: (fn: (from: Peer) => void) => void;
  /** chat: a short line everyone near you can read (filtered on both ends) */
  say: (text: string) => boolean;
  onSay: (fn: (from: Peer, text: string) => void) => void;
  /** weird interactions: stare, spin, melt, float, scream */
  emote: (kind: Emote) => void;
  onEmote: (fn: (from: Peer, kind: Emote) => void) => void;
  /** tell everyone you teleported (not sent when travelling incognito) */
  teleported: (from: { x: number; z: number }, to: { x: number; z: number }, nick: string) => void;
  onTeleport: (fn: (t: Teleport) => void) => void;
  close: () => void;
};

/** someone used a teleport card: where they left from and where they arrived */
export type Teleport = { id: string; nick: string; fx: number; fz: number; tx: number; tz: number };

const finite = (n: unknown, lim = 1e7) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < lim;

export function createPresence(myId?: string): Presence {
  const me = myId ?? Math.random().toString(36).slice(2, 10);
  const peers = new Map<string, Peer>();
  const far = new Map<string, FarPeer>();
  const signalFns: ((p: Peer) => void)[] = [];
  const worldFns: ((path: string, data: Record<string, unknown>) => void)[] = [];
  const struckFns: ((from: Peer) => void)[] = [];
  const killFns: ((amount: number) => void)[] = [];
  const callFns: ((from: Peer) => void)[] = [];
  const sayFns: ((from: Peer, text: string) => void)[] = [];
  const emoteFns: ((from: Peer, kind: Emote) => void)[] = [];
  const tpFns: ((t: Teleport) => void)[] = [];
  let lastTp = 0;
  let lastSay = 0, lastEmote = 0;
  let lastCall = 0;
  let client: MqttClient | null = null;
  let relay = 0;
  let lastSend = 0;
  let pending: { x: number; z: number; yaw: number; light: number; nick: string; held?: number } | null = null;

  function connect() {
    client = mqtt.connect(RELAYS[relay], {
      clientId: `sf1-${me}-${Math.random().toString(36).slice(2, 6)}`,
      connectTimeout: 6000,
      reconnectPeriod: 4000,
      clean: true,
      // if we vanish, the relay tells everyone we left
      will: { topic: `${ROOT}/bye/${me}`, payload: "1", qos: 0, retain: false },
    });
    client.on("connect", () => {
      subscribedAreas = new Set();
      lastArea = "";
      client!.subscribe([`${ROOT}/where/+`, `${ROOT}/sig/+`, `${ROOT}/bye/+`, `${ROOT}/world/#`, `${ROOT}/hit/${me}`, `${ROOT}/kill/${me}`, `${ROOT}/call/${me}`, `${ROOT}/say/+`, `${ROOT}/emo/+`, `${ROOT}/tp/+`]);
    });
    client.on("error", () => {
      // try the next relay
      client?.end(true);
      relay = (relay + 1) % RELAYS.length;
      setTimeout(connect, 1500);
    });
    client.on("message", (topic, payload) => {
      const parts = topic.split("/");
      if (parts[3] === "world") {
        if (payload.length > 600) return;
        try {
          const data = JSON.parse(payload.toString());
          if (data && typeof data === "object") worldFns.forEach((f) => f(parts.slice(4).join("/"), data));
        } catch {
          // ignore garbage
        }
        return;
      }
      if (parts[3] === "say" || parts[3] === "emo") {
        const from = peers.get(parts[4]);
        if (!from || payload.length > 400) return;
        try {
          const d = JSON.parse(payload.toString());
          if (parts[3] === "say" && typeof d.t === "string") {
            const text = filterMark(d.t); // never trust what another client sends
            if (text) sayFns.forEach((f) => f(from, text));
          }
          if (parts[3] === "emo" && (EMOTES as readonly string[]).includes(d.k)) emoteFns.forEach((f) => f(from, d.k));
        } catch {
          // ignore garbage
        }
        return;
      }
      if (parts[3] === "tp") {
        const id = parts[4];
        if (!id || id === me || id.length > 16 || payload.length > 200) return;
        try {
          const d = JSON.parse(payload.toString());
          if (![d.fx, d.fz, d.tx, d.tz].every((n) => finite(n))) return;
          // the nickname is checked again here: never trust what another client sends
          const nick = cleanNick(d.n) ?? "wanderer";
          tpFns.forEach((f) => f({ id, nick, fx: d.fx, fz: d.fz, tx: d.tx, tz: d.tz }));
        } catch {
          // ignore garbage
        }
        return;
      }
      if (parts[3] === "call") {
        try {
          const d = JSON.parse(payload.toString());
          // only people who are actually in the labyrinth with you
          const from = typeof d.from === "string" ? peers.get(d.from) : undefined;
          if (from) callFns.forEach((f) => f(from));
        } catch {
          // ignore garbage
        }
        return;
      }
      if (parts[3] === "hit" || parts[3] === "kill") {
        let d: Record<string, unknown>;
        try {
          d = JSON.parse(payload.toString());
        } catch {
          return;
        }
        if (parts[3] === "hit" && typeof d.from === "string") {
          const attacker = peers.get(d.from);
          if (attacker) struckFns.forEach((f) => f(attacker));
        }
        if (parts[3] === "kill" && finite(d.amount, 100)) killFns.forEach((f) => f(Math.max(0, Math.round(d.amount as number))));
        return;
      }
      const kind = parts[3];
      // positions arrive as pos/<area>/<id>
      const id = kind === "pos" ? parts[5] : parts[4];
      if (!id || id === me || id.length > 16) return;
      if (kind === "bye") {
        peers.delete(id);
        return;
      }
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(payload.toString());
      } catch {
        return;
      }
      if (kind === "pos" && finite(m.x) && finite(m.z) && finite(m.y, 100) && finite(m.l, 101)) {
        // names are checked again here: never trust what another client sends
        const nick = cleanNick(m.n) ?? "wanderer";
        const held = finite(m.h, 0x1000000) ? Math.max(0, Math.round(m.h as number)) : 0;
        const p = peers.get(id);
        if (p) Object.assign(p, { x: m.x, z: m.z, yaw: m.y, light: m.l, nick, held, last: Date.now() });
        else peers.set(id, { id, x: m.x as number, z: m.z as number, yaw: m.y as number, light: m.l as number, nick, held, last: Date.now(), signal: 0 });
      }
      if (kind === "where" && finite(m.x) && finite(m.z)) {
        far.set(id, { id, nick: cleanNick(m.n) ?? "wanderer", x: m.x as number, z: m.z as number, last: Date.now() });
      }
      if (kind === "sig") {
        const p = peers.get(id);
        if (p) {
          p.signal = Date.now();
          signalFns.forEach((f) => f(p));
        }
      }
    });
  }
  connect();

  // forget people who stopped sending
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, p] of peers) if (now - p.last > STALE_MS) peers.delete(id);
    for (const [id, p] of far) if (now - p.last > FAR_STALE_MS) far.delete(id);
  }, 1000);

  // listen to the 9 areas around you; change subscriptions only when you cross into a new area
  let subscribedAreas = new Set<string>();
  let lastArea = "";
  function follow(x: number, z: number) {
    const a = areaOf(x, z);
    if (a === lastArea || !client?.connected) return;
    lastArea = a;
    const want = new Set(areasAround(x, z));
    const drop = [...subscribedAreas].filter((k) => !want.has(k)).map((k) => `${ROOT}/pos/${k}/+`);
    const add = [...want].filter((k) => !subscribedAreas.has(k)).map((k) => `${ROOT}/pos/${k}/+`);
    if (drop.length) client.unsubscribe(drop);
    if (add.length) client.subscribe(add);
    subscribedAreas = want;
  }

  let lastBeacon = 0;
  function flush() {
    if (!pending || !client?.connected) return;
    const { x, z, yaw, light, nick, held } = pending;
    follow(x, z);
    client.publish(`${ROOT}/pos/${areaOf(x, z)}/${me}`, JSON.stringify({ x: +x.toFixed(2), z: +z.toFixed(2), y: +yaw.toFixed(2), l: Math.round(light), n: nick, h: held ?? 0 }));
    if (Date.now() - lastBeacon > BEACON_MS) {
      lastBeacon = Date.now();
      client.publish(`${ROOT}/where/${me}`, JSON.stringify({ x: Math.round(x), z: Math.round(z), n: nick }));
    }
    pending = null;
  }

  return {
    me,
    peers,
    send(s) {
      pending = s;
      const now = performance.now();
      if (now - lastSend > 1000 / SEND_HZ) {
        lastSend = now;
        flush();
      }
    },
    signal() {
      client?.publish(`${ROOT}/sig/${me}`, "{}");
    },
    onSignal(fn) {
      signalFns.push(fn);
    },
    // everyone who sent a beacon recently (+ you), not only the people near you
    online: () => new Set([...far.keys(), ...peers.keys()]).size + 1,
    far,
    strike(target) {
      client?.publish(`${ROOT}/hit/${target}`, JSON.stringify({ from: me }));
    },
    onStruck(fn) {
      struckFns.push(fn);
    },
    confirmKill(attacker, amount) {
      client?.publish(`${ROOT}/kill/${attacker}`, JSON.stringify({ amount }));
    },
    onKillConfirmed(fn) {
      killFns.push(fn);
    },
    call(target) {
      // at most one call every 10 s
      if (Date.now() - lastCall < 10_000) return;
      lastCall = Date.now();
      client?.publish(`${ROOT}/call/${target}`, JSON.stringify({ from: me }));
    },
    onCalled(fn) {
      callFns.push(fn);
    },
    say(raw) {
      const text = filterMark(raw);
      if (!text || Date.now() - lastSay < 2500) return false;
      lastSay = Date.now();
      client?.publish(`${ROOT}/say/${me}`, JSON.stringify({ t: text }));
      return true;
    },
    onSay(fn) {
      sayFns.push(fn);
    },
    emote(kind) {
      if (Date.now() - lastEmote < 1500) return;
      lastEmote = Date.now();
      client?.publish(`${ROOT}/emo/${me}`, JSON.stringify({ k: kind }));
    },
    onEmote(fn) {
      emoteFns.push(fn);
    },
    teleported(from, to, nick) {
      // at most one announcement every 3 s
      if (Date.now() - lastTp < 3000) return;
      lastTp = Date.now();
      client?.publish(`${ROOT}/tp/${me}`, JSON.stringify({ fx: Math.round(from.x), fz: Math.round(from.z), tx: Math.round(to.x), tz: Math.round(to.z), n: nick }));
    },
    onTeleport(fn) {
      tpFns.push(fn);
    },
    publishWorld(path, data) {
      client?.publish(`${ROOT}/world/${path}`, JSON.stringify(data), { retain: true, qos: 1 });
    },
    onWorld(fn) {
      worldFns.push(fn);
    },
    close() {
      clearInterval(sweep);
      client?.publish(`${ROOT}/bye/${me}`, "1");
      client?.end();
    },
  };
}

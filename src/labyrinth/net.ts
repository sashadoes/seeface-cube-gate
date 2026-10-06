// Presence: who else is walking the labyrinth right now.
// TEMPORARY TRANSPORT: a free public MQTT relay (no account, no server of our
// own). Only anonymous positions and light signals are sent, never names or
// text. Anyone can read a public relay, so before launch this moves to our own
// server (same message shapes).
import mqtt, { type MqttClient } from "mqtt";
import { cleanNick } from "./nick";

const RELAYS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
const ROOT = "seeface1/lab/v1";
const SEND_HZ = 6;
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
  close: () => void;
};

const finite = (n: unknown, lim = 1e7) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < lim;

export function createPresence(myId?: string): Presence {
  const me = myId ?? Math.random().toString(36).slice(2, 10);
  const peers = new Map<string, Peer>();
  const signalFns: ((p: Peer) => void)[] = [];
  const worldFns: ((path: string, data: Record<string, unknown>) => void)[] = [];
  const struckFns: ((from: Peer) => void)[] = [];
  const killFns: ((amount: number) => void)[] = [];
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
      client!.subscribe([`${ROOT}/pos/+`, `${ROOT}/sig/+`, `${ROOT}/bye/+`, `${ROOT}/world/#`, `${ROOT}/hit/${me}`, `${ROOT}/kill/${me}`]);
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
      const kind = parts[3], id = parts[4];
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
  }, 1000);

  function flush() {
    if (!pending || !client?.connected) return;
    const { x, z, yaw, light, nick, held } = pending;
    client.publish(`${ROOT}/pos/${me}`, JSON.stringify({ x: +x.toFixed(2), z: +z.toFixed(2), y: +yaw.toFixed(2), l: Math.round(light), n: nick, h: held ?? 0 }));
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
    online: () => peers.size + 1,
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

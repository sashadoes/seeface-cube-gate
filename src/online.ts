// Live online counter for the whole site (cube page + labyrinth).
// Every open page sends a tiny anonymous "here" pulse every 10 s; every page
// counts the pulses heard in the last 25 s. Nothing personal is sent.
// TEMPORARY TRANSPORT: the same free public MQTT relay as the labyrinth (it
// moves to our own server before launch). The MQTT library is loaded lazily so
// the cube page stays fast.

const RELAYS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
const TOPIC = "seeface1/site/v1/here";
const PULSE_MS = 10_000;
const ALIVE_MS = 25_000;

const seen = new Map<string, number>();
const listeners = new Set<(n: number) => void>();
const me = Math.random().toString(36).slice(2, 10);
let started = false;
let client: { connected: boolean; publish: (t: string, p: string, o: { retain: boolean; qos: 0 | 1 }) => unknown } | null = null;
const waiting = new Map<string, string>(); // retained messages to send once connected

function flush() {
  if (!client?.connected) return;
  for (const [t, p] of waiting) client.publish(t, p, { retain: true, qos: 1 });
  waiting.clear();
}

/** Send a retained message on the same connection (the play journal, insight.ts).
 *  Queued until connected; returns false when it could only be queued. */
export function shareRetained(topic: string, payload: string) {
  waiting.set(topic, payload);
  if (!started) void start();
  const sent = Boolean(client?.connected);
  flush();
  return sent;
}

function count() {
  const now = Date.now();
  for (const [id, t] of seen) if (now - t > ALIVE_MS) seen.delete(id);
  return seen.size + 1; // + you
}

function emit() {
  const n = count();
  listeners.forEach((l) => l(n));
}

async function start() {
  if (started) return;
  started = true;
  const { default: mqtt } = await import("mqtt");
  let relay = 0;
  const connect = () => {
    const c = mqtt.connect(RELAYS[relay], {
      clientId: `sf1s-${me}-${Math.random().toString(36).slice(2, 6)}`,
      connectTimeout: 6000,
      reconnectPeriod: 5000,
      will: { topic: `${TOPIC}/${me}`, payload: "bye", qos: 0, retain: false },
    });
    client = c;
    const pulse = () => c.connected && !document.hidden && c.publish(`${TOPIC}/${me}`, "1");
    c.on("connect", () => {
      c.subscribe(`${TOPIC}/+`);
      pulse();
      flush();
    });
    c.on("message", (topic, payload) => {
      const id = topic.split("/").pop();
      if (!id || id === me || id.length > 16) return;
      if (payload.toString() === "bye") seen.delete(id);
      else seen.set(id, Date.now());
      emit();
    });
    c.on("error", () => {
      c.end(true);
      relay = (relay + 1) % RELAYS.length;
      setTimeout(connect, 2000);
    });
    setInterval(pulse, PULSE_MS);
    // coming back to the tab counts as a fresh pulse
    document.addEventListener("visibilitychange", pulse);
    window.addEventListener("pagehide", () => c.connected && c.publish(`${TOPIC}/${me}`, "bye"));
  };
  connect();
  setInterval(emit, 5000); // let stale visitors fade out of the count
}

/** Subscribe to the live count. Starts the connection on first use. */
export function onOnline(fn: (n: number) => void) {
  listeners.add(fn);
  fn(count());
  // don't compete with the first paint
  // (with a timeout: a page rendering 3D every frame may never be idle)
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(() => void start(), { timeout: 3000 });
  else setTimeout(() => void start(), 1200);
  return () => {
    listeners.delete(fn);
  };
}

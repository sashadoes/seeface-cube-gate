// The connection to the world server: hello with our signed token, typed messages, reconnect
// with backoff. Everything the server says is authoritative.
import { PROTOCOL_V, type ClientMsg, type ServerMsg } from "../../../shared/world/protocol.ts";

type Handler<T extends ServerMsg["t"]> = (m: Extract<ServerMsg, { t: T }>) => void;

export type WorldNet = ReturnType<typeof connectWorld>;

const TOKEN_KEY = "sf1w.token";
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // private mode: this visit only
    }
  },
};

export function worldUrl() {
  const env = import.meta.env.VITE_WORLD_WS as string | undefined;
  if (env) return env;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:8787`;
}

export function connectWorld(profile: () => { name: string; blob: string }, url = worldUrl()) {
  const handlers = new Map<string, Set<(m: ServerMsg) => void>>();
  let ws: WebSocket | null = null;
  let open = false, closed = false, tries = 0;
  const queue: string[] = [];
  const ref = new URLSearchParams(location.search).get("ref") ?? undefined;

  const emit = (m: ServerMsg) => handlers.get(m.t)?.forEach((h) => h(m));
  const emitState = (s: "open" | "closed") => handlers.get("_state")?.forEach((h) => h({ t: s } as unknown as ServerMsg));

  function dial() {
    if (closed) return;
    ws = new WebSocket(url);
    ws.onopen = () => {
      tries = 0;
      const p = profile();
      ws!.send(JSON.stringify({ t: "hello", token: store.get(TOKEN_KEY), name: p.name, blob: p.blob, v: PROTOCOL_V, ref } satisfies ClientMsg));
    };
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.t === "welcome") {
        store.set(TOKEN_KEY, m.token);
        open = true;
        emitState("open");
        while (queue.length) ws!.send(queue.shift()!);
      }
      emit(m);
    };
    ws.onclose = (e) => {
      const was = open;
      open = false;
      if (was) emitState("closed");
      if (closed || e.code === 4003 || e.code === 4004) return;
      tries++;
      setTimeout(dial, Math.min(15000, 400 * 2 ** tries));
    };
    ws.onerror = () => ws?.close();
  }
  dial();

  return {
    send(m: ClientMsg) {
      const s = JSON.stringify(m);
      if (open && ws?.readyState === 1) ws.send(s);
      else if (m.t !== "pos" && queue.length < 50) queue.push(s);
    },
    on<T extends ServerMsg["t"]>(t: T, h: Handler<T>) {
      let set = handlers.get(t);
      if (!set) handlers.set(t, (set = new Set()));
      set.add(h as (m: ServerMsg) => void);
      return () => set!.delete(h as (m: ServerMsg) => void);
    },
    onState(h: (s: "open" | "closed") => void) {
      let set = handlers.get("_state");
      if (!set) handlers.set("_state", (set = new Set()));
      const f = (m: ServerMsg) => h((m as unknown as { t: "open" | "closed" }).t);
      set.add(f);
      return () => set!.delete(f);
    },
    isOpen: () => open,
    close() {
      closed = true;
      ws?.close();
    },
  };
}

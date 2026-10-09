// Talking to the Architects API (server/architects/). The session token is the
// same one the labyrinth's accounts use, so an Architect is also a player.
import { apiBase, apiReady } from "../api";
import type { Blueprint } from "./types";

export { apiBase, apiReady };
const TOKEN_KEY = "seeface-account-token";

export function token(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // private mode: this visit only
  }
}
const authHeader = (): Record<string, string> => (token() ? { Authorization: `Bearer ${token()}` } : {});

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T & { ok: boolean; error?: string; status: number }> {
  if (!apiBase) return { ok: false, error: "offline", status: 0 } as never;
  try {
    const r = await fetch(`${apiBase}${path}`, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...authHeader(), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({ ok: false }));
    return { ...data, status: r.status };
  } catch {
    return { ok: false, error: "offline", status: 0 } as never;
  }
}

export const claimedCount = () => call<{ claimed: number; of: number }>("GET", "/api/architects/count");

export type Application = {
  alias: string;
  ig: string;
  email: string;
  disciplines: string[];
  links: string[];
  one_liner: string;
  country: string;
  ref: string | null;
  invite: string | null;
  terms: boolean;
};
export async function apply(a: Application) {
  const r = await call<{ token: string; room: string }>("POST", "/api/architects/apply", a);
  if (r.ok) setToken(r.token);
  return r;
}
export const requestLink = (email: string) => call("POST", "/api/architects/link", { email });
export async function redeem(code: string) {
  const r = await call<{ token: string }>("POST", "/api/architects/redeem", { code });
  if (r.ok) setToken(r.token);
  return r;
}

// ------------------------------------------------------------------ chamber
export type Asset = { id: string; type: "image" | "audio"; name: string; description: string | null; palette: string[] | null; mime: string };
export type Message = { role: "seeface" | "artist"; text: string; at: string; assets?: string[] };
export type ChamberState = {
  alias: string;
  disciplines: string[];
  room: { id: string; status: string; stage: string; blueprint: Blueprint; admin_note: string | null };
  messages: Message[];
  assets: Asset[];
  left: number; // messages left today
};
export const chamber = () => call<ChamberState>("GET", "/api/chamber");

export type TurnEvent =
  | { t: "delta"; text: string }
  | { t: "done"; reply: string; blueprint: Blueprint; stage: string; left: number }
  | { t: "error"; error: string };

/** One artist turn. SeeFace's reply streams in as `delta`s; `done` carries the merged blueprint. */
export async function say(text: string, attach: string[], onEvent: (e: TurnEvent) => void) {
  if (!apiBase) return onEvent({ t: "error", error: "offline" });
  try {
    const r = await fetch(`${apiBase}/api/chamber/say`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ text, attach }),
    });
    if (!r.ok || !r.body) {
      const d = await r.json().catch(() => ({}));
      return onEvent({ t: "error", error: d.error || (r.status === 429 ? "limit" : "failed") });
    }
    // newline-delimited JSON events
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) onEvent(JSON.parse(line));
      }
    }
  } catch {
    onEvent({ t: "error", error: "offline" });
  }
}

export async function upload(blob: Blob, name: string, palette: string[]): Promise<{ ok: boolean; asset?: Asset; error?: string }> {
  if (!apiBase) return { ok: false, error: "offline" };
  try {
    const r = await fetch(`${apiBase}/api/chamber/assets?name=${encodeURIComponent(name.slice(0, 80))}`, {
      method: "POST",
      headers: { "Content-Type": blob.type || "application/octet-stream", "x-palette": palette.join(","), ...authHeader() },
      body: blob,
    });
    return await r.json();
  } catch {
    return { ok: false, error: "offline" };
  }
}

/** Server-side transcription for browsers without speech recognition. The audio is never kept. */
export async function transcribe(blob: Blob): Promise<string | null> {
  if (!apiBase) return null;
  try {
    const r = await fetch(`${apiBase}/api/chamber/transcribe`, { method: "POST", headers: { "Content-Type": blob.type || "audio/webm", ...authHeader() }, body: blob });
    const d = await r.json();
    return d.ok ? d.text : null;
  } catch {
    return null;
  }
}

export const removeAsset = (id: string) => call<{ blueprint: Blueprint }>("DELETE", `/api/chamber/assets/${id}`);
export const submitRoom = () => call<{ missing?: string[]; message?: Message; status?: string }>("POST", "/api/chamber/submit", {});
export const health = () => call<{ chamber?: { llm: boolean; transcribe: boolean } }>("GET", "/api/health");

// private assets need the token, so they're fetched and turned into blob URLs
const blobs = new Map<string, Promise<string | null>>();
export function assetUrl(id: string, roomId?: string, admin?: string): Promise<string | null> {
  const key = `${id}:${roomId ?? ""}`;
  if (!blobs.has(key)) {
    blobs.set(
      key,
      fetch(`${apiBase}/api/${roomId ? `rooms/${roomId}/assets/${id}` : `chamber/assets/${id}`}`, { headers: admin ? { "x-admin-key": admin } : authHeader() })
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => (b ? URL.createObjectURL(b) : null))
        .catch(() => null)
    );
  }
  return blobs.get(key)!;
}

// ------------------------------------------------------------------ admin
export const adminCall = <T,>(key: string, method: string, path: string, body?: unknown) => call<T>(method, `/api/admin/architects${path}`, body, { "x-admin-key": key });

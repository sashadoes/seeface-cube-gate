// External services behind adapters. Each one has a safe fallback, so development never blocks
// on a missing secret, and production never silently pretends.
import { createHmac, randomUUID } from "node:crypto";

export const PROD = process.env.NODE_ENV === "production";

// ------------------------------------------------------------------ age assurance
// The vendor is Sasha's choice (SETUP.md). Until one is wired in:
//   dev  → "mock": a button marks you verified (clearly labelled as a dev mock)
//   prod → "unavailable": voice stays locked. Self-declaration is NOT accepted.
export type AgeAdapter = { mode: "mock" | "vendor" | "unavailable"; start: (userId: string) => Promise<{ url?: string; verified?: boolean }> };

export function ageAdapter(): AgeAdapter {
  const provider = process.env.AGE_PROVIDER ?? "mock";
  if (provider === "mock" && !PROD) return { mode: "mock", start: async () => ({ verified: true }) };
  if (provider !== "mock" && process.env.AGE_API_KEY) {
    // a real vendor integration goes here (hosted flow URL + signed webhook → /world/age/webhook)
    return { mode: "vendor", start: async () => ({ url: undefined }) };
  }
  return { mode: "unavailable", start: async () => ({}) };
}

// ------------------------------------------------------------------ LiveKit tokens (rooms only)
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function livekit() {
  const url = process.env.LIVEKIT_URL, key = process.env.LIVEKIT_API_KEY, secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) return null;
  return {
    url,
    /** a short-lived join token; canPublish is decided by the server's permission rules */
    token(identity: string, name: string, room: string, canPublish: boolean) {
      const now = Math.floor(Date.now() / 1000);
      const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      // no recording/egress grants, ever: audio is never stored
      const payload = b64url(JSON.stringify({ iss: key, sub: identity, name, nbf: now - 5, exp: now + 600, jti: randomUUID(), video: { room, roomJoin: true, canPublish, canSubscribe: true, canPublishData: false, canPublishSources: ["microphone"] } }));
      const sig = b64url(createHmac("sha256", secret).update(`${header}.${payload}`).digest());
      return `${header}.${payload}.${sig}`;
    },
  };
}

export function iceServers(): RTCIceServer[] {
  const ice: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
  if (process.env.TURN_URL) ice.push({ urls: process.env.TURN_URL.split(","), username: process.env.TURN_USER, credential: process.env.TURN_PASS });
  return ice;
}

// ------------------------------------------------------------------ session tokens
const SECRET = process.env.WORLD_SECRET || (PROD ? "" : "dev-only-world-secret");
if (!SECRET) throw new Error("WORLD_SECRET is required in production");

export const signUser = (id: string) => `${id}.${createHmac("sha256", SECRET).update(id).digest("base64url").slice(0, 32)}`;
export function verifyUser(token: unknown): string | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const id = token.slice(0, token.lastIndexOf("."));
  return signUser(id) === token ? id : null;
}

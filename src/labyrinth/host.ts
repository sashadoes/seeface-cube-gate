// The eye talks: the owner writes from /the-eye to one guest (or everyone) in
// the labyrinth, and guests can answer. On a public relay anyone could pretend
// to be the owner, so every host line is signed with the moderator key (the
// same ECDSA key that approves posts, kept only in the owner's browser) and
// players verify it with MOD_PUBLIC_KEY. No key in the game yet = no host lines.
import { MOD_PUBLIC_KEY } from "./posts";

export const HOST_NAME = "seeface";
/** host lines older than this are ignored (no replaying old messages) */
const FRESH_MS = 2 * 60_000;
export const HOST_MAX = 200;

/** what gets signed: who it's for, when, and the words */
export const hostText = (to: string, ts: number, text: string) => `host|${to}|${ts}|${text}`;

let key: Promise<CryptoKey> | null = null;

export async function verifyHost(to: string, ts: number, text: string, sig: string) {
  if (!MOD_PUBLIC_KEY || typeof sig !== "string" || Math.abs(Date.now() - ts) > FRESH_MS) return false;
  try {
    key ??= crypto.subtle.importKey("jwk", MOD_PUBLIC_KEY, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const raw = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, await key, raw, new TextEncoder().encode(hostText(to, ts, text)));
  } catch {
    return false;
  }
}

/** the eye's side: sign a line with the moderator's private key */
export async function signHost(priv: JsonWebKey, to: string, ts: number, text: string) {
  const k = await crypto.subtle.importKey("jwk", priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, new TextEncoder().encode(hostText(to, ts, text))));
  return btoa(String.fromCharCode(...sig));
}

/** can players verify host lines yet? (the owner's public key is in the game) */
export const hostReady = () => !!MOD_PUBLIC_KEY;

// The coin ledger: append-only entries, one visible number (the balance). Pure functions; the
// server is the only writer. Every entry has an idempotency key, so retries and replays never
// pay twice. No paid randomness anywhere: every price and reward is fixed and shown.

export type Entry = { id: string; user: string; delta: number; reason: Reason; key: string; at: number; ref?: string };

export type Reason =
  | "welcome" | "daily" | "listen" | "speak" | "say-hi" | "spin-radio" | "referral"
  | "room" | "decor" | "gift-sent" | "gift-received" | "pack" | "refund" | "admin";

export type OwnedRoom = {
  id: string; // plot id
  owner: string;
  name: string;
  topic: string;
  public: boolean;
  invited: string[];
  invite: string; // invite code for the share link
  decor: { kind: string; x: number; z: number; rot: number }[];
  createdAt: number;
};

export const EARN = {
  welcome: 100,
  daily: 10,
  listen: 2, // per 5 minutes listened in a room with at least one other human
  speak: 1, // per minute spoken while someone else is in the room
  "say-hi": 20,
  "spin-radio": 10,
  referral: 50, // a friend you invited is still coming back after 7 days
} as const;

export const DAILY_CAP: Partial<Record<Reason, number>> = { listen: 24, speak: 30, daily: 10 };
export const ONCE: Reason[] = ["welcome", "say-hi", "spin-radio"];

export const PRICES = { room: 500 } as const;
export const DECOR: Record<string, { name: string; price: number }> = {
  lamp: { name: "lava lamp", price: 30 },
  cushion: { name: "giant cushion", price: 20 },
  plant: { name: "night plant", price: 25 },
  speaker: { name: "speaker stack", price: 60 },
  tv: { name: "static tv", price: 45 },
  candle: { name: "candle cluster", price: 15 },
  books: { name: "book tower", price: 35 },
  ball: { name: "kick ball", price: 10 },
};
export const GIFTS: Record<string, { name: string; price: number; emoji: string }> = {
  spark: { name: "spark", price: 5, emoji: "✨" },
  moon: { name: "moon", price: 20, emoji: "🌙" },
  comet: { name: "comet", price: 50, emoji: "☄️" },
};
/** coin packs on web (Stripe, test mode). EUR cents. Fixed amounts, no random bonuses. */
export const PACKS: Record<string, { coins: number; cents: number; label: string }> = {
  small: { coins: 300, cents: 299, label: "300 coins" },
  medium: { coins: 900, cents: 799, label: "900 coins" },
  large: { coins: 2000, cents: 1599, label: "2000 coins" },
};

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function balance(entries: readonly Entry[], user: string) {
  let b = 0;
  for (const e of entries) if (e.user === user) b += e.delta;
  return b;
}

export type Req = { user: string; delta: number; reason: Reason; key: string; at: number; ref?: string };
export type Result = { ok: true; entry: Entry; balance: number } | { ok: false; error: "duplicate" | "insufficient" | "cap" | "once" | "invalid"; balance: number };

/**
 * Validate and (if valid) append one entry. Rules:
 * - the idempotency key is unique per user (a retry returns "duplicate", nothing changes)
 * - spending never takes the balance below zero
 * - one-time rewards pay once; capped rewards stop at their daily cap
 * - deltas are integers and the sign matches the reason
 */
export function apply(entries: Entry[], req: Req, makeId: () => string): Result {
  const bal = balance(entries, req.user);
  if (!Number.isInteger(req.delta) || req.delta === 0 || !req.key) return { ok: false, error: "invalid", balance: bal };
  const spend = req.reason === "room" || req.reason === "decor" || req.reason === "gift-sent";
  if (spend !== req.delta < 0 && req.reason !== "admin" && req.reason !== "refund") return { ok: false, error: "invalid", balance: bal };
  for (const e of entries) if (e.user === req.user && e.key === req.key) return { ok: false, error: "duplicate", balance: bal };
  if (ONCE.includes(req.reason) && entries.some((e) => e.user === req.user && e.reason === req.reason)) return { ok: false, error: "once", balance: bal };
  const cap = DAILY_CAP[req.reason];
  if (cap !== undefined) {
    const today = day(req.at);
    let sum = 0;
    for (const e of entries) if (e.user === req.user && e.reason === req.reason && day(e.at) === today) sum += e.delta;
    if (sum + req.delta > cap) return { ok: false, error: "cap", balance: bal };
  }
  if (bal + req.delta < 0) return { ok: false, error: "insufficient", balance: bal };
  const entry: Entry = { id: makeId(), user: req.user, delta: req.delta, reason: req.reason, key: req.key, at: req.at, ...(req.ref ? { ref: req.ref } : {}) };
  entries.push(entry);
  return { ok: true, entry, balance: bal + req.delta };
}

/** a gift moves coins from sender to receiver atomically (both entries or neither) */
export function gift(entries: Entry[], from: string, to: string, giftId: string, key: string, at: number, makeId: () => string): Result {
  const g = GIFTS[giftId];
  if (!g || from === to) return { ok: false, error: "invalid", balance: balance(entries, from) };
  const sent = apply(entries, { user: from, delta: -g.price, reason: "gift-sent", key: `${key}:out`, at, ref: to }, makeId);
  if (!sent.ok) return sent;
  apply(entries, { user: to, delta: g.price, reason: "gift-received", key: `${key}:in`, at, ref: from }, makeId);
  return sent;
}

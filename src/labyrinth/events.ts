// World events: rare, spectacular moments that happen for EVERYONE online at
// the same time, with no server: the schedule comes from the clock. Every
// 6 minutes there's a slot; about half the slots hold an event of ~35 s.
// These are the moments worth a Snapshot.

export type EventKind = "eclipse" | "photo-rain" | "choir" | "gold-hour" | "inversion" | "bloom" | "popqueen";

export const EVENTS: Record<EventKind, { name: string; glyph: string }> = {
  eclipse: { name: "the eclipse", glyph: "◐" },
  "photo-rain": { name: "it's raining memories", glyph: "▤" },
  choir: { name: "the cubes are singing", glyph: "♫" },
  "gold-hour": { name: "gold hour", glyph: "◈" },
  inversion: { name: "the inversion", glyph: "⇅" },
  bloom: { name: "the bloom", glyph: "❋" },
  popqueen: { name: "the Pop Queen's show", glyph: "♛" },
};

const KINDS = Object.keys(EVENTS) as EventKind[];
const SLOT_MS = 6 * 60 * 1000;
const LENGTH_MS = 35 * 1000;

function hash(n: number) {
  let h = Math.imul(n ^ 0x5bd1e995, 2654435761);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}

/** The event happening right now (same for everyone), or null. */
export function currentEvent(now = Date.now()): { kind: EventKind; progress: number; endsIn: number } | null {
  // ?event=<kind> forces one, for testing
  const forced = new URLSearchParams(location.search).get("event") as EventKind | null;
  if (forced && forced in EVENTS) return { kind: forced, progress: ((now / 1000) % 35) / 35, endsIn: 30 };
  const slot = Math.floor(now / SLOT_MS);
  if (hash(slot) > 0.5) return null;
  const start = slot * SLOT_MS + Math.floor(hash(slot + 7) * (SLOT_MS - LENGTH_MS));
  if (now < start || now > start + LENGTH_MS) return null;
  return { kind: KINDS[Math.floor(hash(slot + 13) * KINDS.length)], progress: (now - start) / LENGTH_MS, endsIn: (start + LENGTH_MS - now) / 1000 };
}

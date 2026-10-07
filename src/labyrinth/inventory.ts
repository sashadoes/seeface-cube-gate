// The inventory: afterlife objects you collect. Found as relics in the
// corridors, in treasures, or ordered from the After Life™ TVs.
// Pictures: drop a PNG at public/items/<id>.png and it replaces the glyph.
export type ItemId =
  | "coin" | "halo" | "feather" | "vhs" | "key" | "tape1994" | "ticket" | "globe" | "jar" | "remote" | "pearl" | "nametag";

export type Item = { id: ItemId; name: string; glyph: string; blurb: string; rarity: number };

export const ITEMS: Record<ItemId, Item> = {
  coin: { id: "coin", name: "ferryman's coin", glyph: "◉", blurb: "the fare. keep it for later.", rarity: 1 },
  halo: { id: "halo", name: "halo (slightly used)", glyph: "◯", blurb: "previous owner unknown.", rarity: 3 },
  feather: { id: "feather", name: "angel feather", glyph: "❦", blurb: "still warm. that's the worrying part.", rarity: 2 },
  vhs: { id: "vhs", name: "your first memory (VHS)", glyph: "▭", blurb: "be kind, rewind.", rarity: 2 },
  key: { id: "key", name: "deco key", glyph: "⚷", blurb: "opens something gold. somewhere.", rarity: 2 },
  tape1994: { id: "tape1994", name: "tape labelled 1994", glyph: "▣", blurb: "it's quiet. then it isn't.", rarity: 3 },
  ticket: { id: "ticket", name: "one-way ticket", glyph: "⌑", blurb: "admit one. no return.", rarity: 1 },
  globe: { id: "globe", name: "snow globe of your hometown", glyph: "◍", blurb: "it's snowing there too.", rarity: 2 },
  jar: { id: "jar", name: "heartbeat in a jar", glyph: "♥", blurb: "do not open during the show.", rarity: 3 },
  remote: { id: "remote", name: "TV remote (no batteries)", glyph: "▯", blurb: "every channel is the after life.", rarity: 1 },
  pearl: { id: "pearl", name: "black pearl", glyph: "●", blurb: "it was a tear once.", rarity: 3 },
  nametag: { id: "nametag", name: "a stranger's name tag", glyph: "⊟", blurb: "hello, my name is ______.", rarity: 1 },
};

const KEY = "seeface-inventory";
export type Bag = Partial<Record<ItemId, number>>;

export function readBag(): Bag {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Bag;
  } catch {
    return {};
  }
}

const listeners = new Set<() => void>();
export const onBag = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function addItem(id: ItemId) {
  const b = readBag();
  b[id] = (b[id] ?? 0) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    // ignore
  }
  listeners.forEach((f) => f());
  return ITEMS[id];
}

/** a random object; luck > 0 makes rare ones likelier */
export function randomItem(luck = 0): ItemId {
  const all = Object.values(ITEMS);
  const weights = all.map((i) => (i.rarity === 1 ? 6 : i.rarity === 2 ? 3 + luck : 1 + luck * 2));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let k = 0; k < all.length; k++) {
    r -= weights[k];
    if (r <= 0) return all[k].id;
  }
  return "coin";
}

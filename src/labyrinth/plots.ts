// Places of your own (SEEFACE1 WORLD, owner brief 2026-10-07): the rooms of the
// labyrinth around the entrance are land. Anyone can claim one room for free
// (one each, while the opening lasts), describe it to the architect, and it is
// built from modular pieces: style, two colours, furniture, a neon sign with
// its name, product shelves, a screen with the owner's picture. The owner's
// name is on every door; visits and ♥ are counted on the door too.
//   districts (by ring around the entrance): the front row (ring 2, prime),
//   the market streets (rings 3–4), the deep (rings 5–7). Ring 1 is all places.
//   world/plot/<id>          {by, nick, t, d?: Design, opened?}  (gone: 1 = given back)
//   world/plotimg/<id>       {img}                 the owner's picture (≤320 px JPEG)
//   world/plotok/<id>        {sig}                 the moderator approves picture + instagram
//   world/pvisit/<id>/<me>   {t}                   one per visitor (latest visit)
//   world/plove/<id>/<me>    {v: 1 | 0}
// Picture and instagram handle are shown to others only after the owner of
// seeface1 approves them on /the-eye (like posts). Names and product lines are
// filtered like chat. Everything is client-side on the public relay until our
// own server: claims can be overwritten by a determined cheater.
import { CELL, placeAt, roomCentre, roomOrigin, inShip } from "./maze";
import type { Presence } from "./net";
import { cleanNick } from "./nick";
import { filterMark } from "../marks/filter";
import { playerId } from "./champions";
import { imgDigest, verifySigned } from "./posts";

export type Purpose = "shop" | "gallery" | "club" | "studio" | "promo" | "event" | "home";
export const PURPOSES: { id: Purpose; glyph: string; label: string }[] = [
  { id: "gallery", glyph: "▣", label: "gallery" },
  { id: "shop", glyph: "◫", label: "shop" },
  { id: "club", glyph: "♫", label: "club" },
  { id: "studio", glyph: "◉", label: "studio" },
  { id: "event", glyph: "✶", label: "event space" },
  { id: "promo", glyph: "◈", label: "promo booth" },
  { id: "home", glyph: "⌂", label: "home" },
];

export type StyleId = "luxury" | "trap" | "subway" | "pinkhorror" | "whitecube" | "deco" | "chapel" | "arcade";
export type Style = { label: string; wall: number; floor: number; rough: number; metal: number; ceil: number; light: number };
export const STYLES: Record<StyleId, Style> = {
  luxury: { label: "dark luxury", wall: 0x111014, floor: 0x0a0a0c, rough: 0.15, metal: 0.6, ceil: 0x060606, light: 0xffd7a0 },
  trap: { label: "cyber trap house", wall: 0x0d0f1c, floor: 0x15151f, rough: 0.35, metal: 0.4, ceil: 0x05050a, light: 0x9a7bff },
  subway: { label: "abandoned subway", wall: 0x3c4038, floor: 0x2a2a26, rough: 0.9, metal: 0.05, ceil: 0x161614, light: 0xd8ffcf },
  pinkhorror: { label: "pink horror", wall: 0x3a0f22, floor: 0x1c0710, rough: 0.5, metal: 0.1, ceil: 0x12040a, light: 0xff7ab8 },
  whitecube: { label: "white cube gallery", wall: 0xe8e6e1, floor: 0xbdbab3, rough: 0.6, metal: 0.0, ceil: 0xf2f0ea, light: 0xffffff },
  deco: { label: "art deco lounge", wall: 0x14231f, floor: 0x0d0c09, rough: 0.25, metal: 0.5, ceil: 0x0a0907, light: 0xffc86a },
  chapel: { label: "candle chapel", wall: 0x1d1814, floor: 0x120f0c, rough: 0.8, metal: 0.05, ceil: 0x080706, light: 0xffa95a },
  arcade: { label: "midnight arcade", wall: 0x06060c, floor: 0x0b0b16, rough: 0.3, metal: 0.3, ceil: 0x020204, light: 0x3cf2ff },
};

export const PALETTE = ["#ff3cf0", "#3cf2ff", "#a4ff3c", "#ffb13c", "#ffffff", "#c8a0ff", "#ff4a5a", "#7affd8", "#ffe14a", "#4a6bff"];

export type PieceId = "stage" | "dj" | "shelves" | "screen" | "sofa" | "counter" | "frames" | "bar" | "plants" | "speakers" | "arcade" | "candles" | "discoball" | "rug";
/** wall: takes one of the 8 wall slots; free: placed elsewhere (ceiling, floor) */
export const PIECES: { id: PieceId; glyph: string; label: string; wall: boolean }[] = [
  { id: "stage", glyph: "▭", label: "stage + mic", wall: true },
  { id: "dj", glyph: "◎", label: "DJ booth", wall: true },
  { id: "shelves", glyph: "▤", label: "product shelves", wall: true },
  { id: "screen", glyph: "▢", label: "big screen", wall: true },
  { id: "frames", glyph: "▣", label: "gallery frames", wall: true },
  { id: "counter", glyph: "▬", label: "shop counter", wall: true },
  { id: "bar", glyph: "⊔", label: "bar", wall: true },
  { id: "sofa", glyph: "◡", label: "velvet sofa", wall: true },
  { id: "speakers", glyph: "▮", label: "speaker stacks", wall: true },
  { id: "arcade", glyph: "◧", label: "arcade cabinets", wall: true },
  { id: "plants", glyph: "♣", label: "night plants", wall: true },
  { id: "candles", glyph: "♆", label: "candle altar", wall: true },
  { id: "discoball", glyph: "◍", label: "mirror ball", wall: false },
  { id: "rug", glyph: "▩", label: "neon rug", wall: false },
];
export const MAX_WALL_PIECES = 8;

export type Product = { name: string; price: string };
export type Design = {
  name: string;
  purpose: Purpose;
  style: StyleId;
  colors: [string, string];
  pieces: PieceId[];
  products: Product[];
  ig: string;
  about: string;
};
export type Plot = { id: string; I: number; J: number; by: string; nick: string; t: number; d?: Design; opened?: number; ver: number };

// ------------------------------------------------------------------ land
export type District = { id: "front" | "streets" | "deep"; name: string; blurb: string };
export const DISTRICTS: Record<District["id"], District> = {
  front: { id: "front", name: "the front row", blurb: "prime: right by the entrance, everyone walks past" },
  streets: { id: "streets", name: "the market streets", blurb: "busy corridors, good for shops and galleries" },
  deep: { id: "deep", name: "the deep", blurb: "far, dark, for the brave and the underground" },
};
const RING_MAX = 7;

export const plotId = (I: number, J: number) => `r${I}_${J}`;
export function parsePlotId(id: string) {
  const m = /^r(-?\d{1,3})_(-?\d{1,3})$/.exec(id);
  return m ? { I: Number(m[1]), J: Number(m[2]) } : null;
}

/** the district of the room in region (I,J), or null when it isn't land */
export function districtOf(I: number, J: number): District | null {
  const ring = Math.max(Math.abs(I), Math.abs(J));
  if (ring < 2 || ring > RING_MAX || placeAt(I, J)) return null;
  const c = roomCentre(I, J);
  if (inShip(c.x, c.z)) return null;
  return DISTRICTS[ring === 2 ? "front" : ring <= 4 ? "streets" : "deep"];
}

/** every piece of land, nearest first */
export const ALL_LOTS = (() => {
  const list: { id: string; I: number; J: number; d: number }[] = [];
  for (let I = -RING_MAX; I <= RING_MAX; I++)
    for (let J = -RING_MAX; J <= RING_MAX; J++) {
      if (!districtOf(I, J)) continue;
      const c = roomCentre(I, J);
      list.push({ id: plotId(I, J), I, J, d: Math.hypot(c.x, c.z) });
    }
  return list.sort((a, b) => a.d - b.d);
})();

/** where to arrive at a room: in the corridor outside its north door, facing in */
export function doorstep(I: number, J: number) {
  const o = roomOrigin(I, J);
  return { x: (o.i + 1.5) * CELL, z: (o.j - 0.5) * CELL, yaw: Math.PI };
}

// ------------------------------------------------------------------ cleaning what other clients send
const STYLE_IDS = Object.keys(STYLES) as StyleId[];
const PIECE_IDS = PIECES.map((p) => p.id);
const PURPOSE_IDS = PURPOSES.map((p) => p.id);
export const IG = /^[a-z0-9._]{1,30}$/;

export function cleanText(v: unknown, max: number) {
  if (typeof v !== "string" || !v.trim()) return "";
  return filterMark(v.slice(0, max)) ?? "";
}
export function cleanDesign(v: unknown): Design | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  const name = cleanText(d.name, 24);
  if (!name) return null;
  const style = STYLE_IDS.includes(d.style as StyleId) ? (d.style as StyleId) : "luxury";
  const purpose = PURPOSE_IDS.includes(d.purpose as Purpose) ? (d.purpose as Purpose) : "gallery";
  const colors = Array.isArray(d.colors) ? d.colors.filter((c) => PALETTE.includes(c as string)).slice(0, 2) : [];
  while (colors.length < 2) colors.push(PALETTE[colors.length]);
  const pieces = Array.isArray(d.pieces) ? [...new Set(d.pieces.filter((p) => PIECE_IDS.includes(p as PieceId)))] as PieceId[] : [];
  const wall = pieces.filter((p) => PIECES.find((x) => x.id === p)!.wall).slice(0, MAX_WALL_PIECES);
  const products = Array.isArray(d.products)
    ? d.products.slice(0, 3).map((p) => ({ name: cleanText((p as Product)?.name, 28), price: typeof (p as Product)?.price === "string" ? (p as Product).price.replace(/[^\p{N}\p{Sc}.,\s◈a-z]/giu, "").slice(0, 10) : "" })).filter((p) => p.name)
    : [];
  const ig = typeof d.ig === "string" && IG.test(d.ig) ? d.ig : "";
  return { name, purpose, style, colors: colors as [string, string], pieces: [...wall, ...pieces.filter((p) => !PIECES.find((x) => x.id === p)!.wall)], products, ig, about: cleanText(d.about, 80) };
}

/** what the moderator signs for a place: its picture and its instagram handle */
export const plotApprovalText = (p: { id: string; by: string }, img: string, ig: string) => `plot|${p.id}|${p.by}|${img ? imgDigest(img) : 0}|${ig}`;

// ------------------------------------------------------------------ the layer
const OPENED_FRESH = 3 * 60_000;
const WEEK = 7 * 86_400_000;

export function createPlots(presence: Presence, myNick: () => string, events: { opened: (p: Plot) => void }) {
  const me = playerId();
  const plots = new Map<string, Plot>();
  const imgs = new Map<string, string>();
  const sigs = new Map<string, string>();
  const okFor = new Map<string, string>(); // plot id → the approval text that verified
  const visits = new Map<string, Map<string, number>>();
  const loves = new Map<string, Set<string>>();
  const announced = new Set<string>();
  const listeners = new Set<() => void>();
  let pending = 0;
  const changed = () => {
    if (pending) return;
    pending = window.setTimeout(() => {
      pending = 0;
      listeners.forEach((f) => f());
    }, 120);
  };

  const recheck = (id: string) => {
    const p = plots.get(id), sig = sigs.get(id);
    if (!p || !sig) return;
    const text = plotApprovalText(p, imgs.get(id) ?? "", p.d?.ig ?? "");
    if (okFor.get(id) === text) return;
    void verifySigned(text, sig).then((ok) => {
      if (ok) okFor.set(id, text);
      else okFor.delete(id);
      changed();
    });
  };

  presence.onWorld((path, d) => {
    const [kind, id, who] = path.split("/");
    if (!id || !parsePlotId(id)) return;
    if (kind === "plot") {
      if (d.gone) {
        plots.delete(id);
        changed();
        return;
      }
      const at = parsePlotId(id)!;
      if (!districtOf(at.I, at.J)) return;
      const nick = cleanNick(d.nick);
      if (!nick || typeof d.by !== "string" || typeof d.t !== "number") return;
      const prev = plots.get(id);
      const p: Plot = {
        id, ...at, by: d.by.slice(0, 24), nick, t: d.t,
        d: cleanDesign(d.d) ?? undefined,
        opened: typeof d.opened === "number" ? d.opened : undefined,
        ver: (prev?.ver ?? 0) + 1,
      };
      plots.set(id, p);
      if (p.opened && p.by !== me && !announced.has(id) && Date.now() - p.opened < OPENED_FRESH && p.d) {
        announced.add(id);
        events.opened(p);
      }
      if (p.opened) announced.add(id);
      recheck(id);
      changed();
    }
    if (kind === "plotimg") {
      if (typeof d.img === "string" && d.img.startsWith("data:image/jpeg;base64,") && d.img.length < 120_000) imgs.set(id, d.img);
      else imgs.delete(id);
      const p = plots.get(id);
      if (p) p.ver++;
      recheck(id);
      changed();
    }
    if (kind === "plotok" && typeof d.sig === "string") {
      sigs.set(id, d.sig);
      recheck(id);
    }
    if (kind === "pvisit" && who && typeof d.t === "number") {
      let m = visits.get(id);
      if (!m) visits.set(id, (m = new Map()));
      if (d.t > 0) m.set(who.slice(0, 24), d.t);
      else m.delete(who.slice(0, 24)); // t: 0 clears a visit
      changed();
    }
    if (kind === "plove" && who) {
      let s = loves.get(id);
      if (!s) loves.set(id, (s = new Set()));
      if (d.v) s.add(who.slice(0, 24));
      else s.delete(who.slice(0, 24));
      changed();
    }
  });

  const approved = (p: Plot) => okFor.get(p.id) === plotApprovalText(p, imgs.get(p.id) ?? "", p.d?.ig ?? "");
  const visitsOf = (id: string) => visits.get(id)?.size ?? 0;
  const weekOf = (id: string) => {
    let n = 0;
    const now = Date.now();
    visits.get(id)?.forEach((t) => now - t < WEEK && n++);
    return n;
  };
  const lovesOf = (id: string) => loves.get(id)?.size ?? 0;

  function publish(p: Plot) {
    presence.publishWorld(`plot/${p.id}`, { by: p.by, nick: p.nick, t: p.t, d: p.d, opened: p.opened });
    p.ver++;
    plots.set(p.id, p);
    changed();
  }

  return {
    me,
    onChange(f: () => void) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    get: (id: string) => plots.get(id) ?? null,
    at: (I: number, J: number) => plots.get(plotId(I, J)) ?? null,
    all: () => [...plots.values()],
    mine: () => [...plots.values()].find((p) => p.by === me) ?? null,
    isMine: (p: Plot) => p.by === me,
    /** the picture as everyone sees it: approved, or always for its owner */
    picture: (p: Plot) => ((p.by === me || approved(p)) && imgs.get(p.id)) || null,
    /** the instagram handle as everyone sees it */
    instagram: (p: Plot) => (p.d?.ig && (p.by === me || approved(p)) ? p.d.ig : null),
    pendingReview: (p: Plot) => Boolean((imgs.get(p.id) || p.d?.ig) && !approved(p)),
    visits: visitsOf,
    week: weekOf,
    loves: lovesOf,
    loved: (id: string) => loves.get(id)?.has(me) ?? false,
    /** the opened places, hottest first: this week's visitors + ♥ */
    open: () =>
      [...plots.values()]
        .filter((p) => p.d && p.opened)
        .sort((a, b) => weekOf(b.id) * 2 + lovesOf(b.id) * 3 - (weekOf(a.id) * 2 + lovesOf(a.id) * 3) || (b.opened ?? 0) - (a.opened ?? 0)),
    /** the furthest opened place from the entrance (the edge never closes over it) */
    reach() {
      let r = 0;
      for (const p of plots.values()) {
        if (!p.opened) continue;
        const c = roomCentre(p.I, p.J);
        r = Math.max(r, Math.hypot(c.x, c.z) + 16);
      }
      return r;
    },
    freeCount: () => ALL_LOTS.filter((l) => !plots.has(l.id)).length,
    /** the nearest free lot to (x,z) */
    nearestFree(x: number, z: number) {
      let best: (typeof ALL_LOTS)[number] | null = null, bd = Infinity;
      for (const l of ALL_LOTS) {
        if (plots.has(l.id)) continue;
        const c = roomCentre(l.I, l.J);
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bd) (bd = d), (best = l);
      }
      return best;
    },
    claim(I: number, J: number): "ok" | "taken" | "have" | "not-land" {
      if (!districtOf(I, J)) return "not-land";
      if (plots.has(plotId(I, J))) return "taken";
      if ([...plots.values()].some((p) => p.by === me)) return "have";
      publish({ id: plotId(I, J), I, J, by: me, nick: myNick(), t: Date.now(), ver: 0 });
      return "ok";
    },
    /** save the architect's build (the room changes for everyone at once) */
    build(d: Design, img: string | null | undefined) {
      const p = [...plots.values()].find((x) => x.by === me);
      if (!p) return false;
      const clean = cleanDesign(d);
      if (!clean) return false;
      publish({ ...p, nick: myNick(), d: clean });
      if (img !== undefined) {
        if (img) imgs.set(p.id, img);
        else imgs.delete(p.id);
        presence.publishWorld(`plotimg/${p.id}`, img ? { img } : { none: 1 });
      }
      return true;
    },
    /** the ribbon: the place opens to everyone */
    openToAll(): Plot | null {
      const p = [...plots.values()].find((x) => x.by === me);
      if (!p?.d) return null;
      const q = { ...p, opened: p.opened ?? Date.now() };
      publish(q);
      return q;
    },
    giveBack() {
      const p = [...plots.values()].find((x) => x.by === me);
      if (!p) return;
      presence.publishWorld(`plot/${p.id}`, { gone: 1 });
      presence.publishWorld(`plotimg/${p.id}`, { none: 1 });
      plots.delete(p.id);
      changed();
    },
    visit(id: string) {
      const p = plots.get(id);
      if (!p || p.by === me) return;
      const last = visits.get(id)?.get(me) ?? 0;
      if (Date.now() - last < 3_600_000) return; // once an hour is enough
      presence.publishWorld(`pvisit/${id}/${me}`, { t: Date.now() });
    },
    love(id: string, on: boolean) {
      presence.publishWorld(`plove/${id}/${me}`, { v: on ? 1 : 0 });
    },
  };
}
export type Plots = ReturnType<typeof createPlots>;

// The labyrinth's characters (◇): the watcher, Velvet, Nyx, the vending
// machines (VEND-0), the architect and Dr. Static (owner brief 2026-10-07,
// cast in server/npc/cast.json). They stand in fixed places near the entrance,
// the same for everyone. Talk to one by chatting within 7 m: with the API
// hosted (VITE_API_URL + ANTHROPIC_API_KEY on the server) Claude writes their
// lines; without it they use their scripted lines, so they always work.
// Like the dreamed ones (ai.ts) they wear the ◇ mark, are never counted as
// people, and never claim to be human.
import * as THREE from "three";
import cast from "../../server/npc/cast.json";
import { apiBase } from "../api";
import { bodyTexture, textSprite } from "./ai";
import { CELL, placeAt, roomCentre, roomOf, placeOf, safeSpot, wallEast, wallSouth } from "./maze";
import { release } from "./gpu";

export type NpcId = keyof typeof cast.characters;
export type ShopItem = { id: string; label: string; price: number; does: string };
export type NpcAction = "none" | "open_shop" | "give_item" | "reveal_clue" | "end_chat";
export type NpcReply = { npc: NpcId; name: string; say: string; action: NpcAction; item: string | null };
export type NpcContext = { username: string; place: string; coins: number; event?: string };

const CAST = cast.characters as Record<NpcId, { name: string; colour: string; items: ShopItem[]; gifts: string[]; samples: string[] }>;
export const LORE: string[] = cast.lore;
export const npcName = (id: NpcId) => CAST[id].name;
export const shopOf = (id: NpcId) => CAST[id].items;
/** every item any character sells or gives, for the bag */
export const NPC_ITEMS: Record<string, { label: string; from: NpcId }> = Object.fromEntries(
  (Object.keys(CAST) as NpcId[]).flatMap((id) => CAST[id].items.map((i) => [i.id, { label: i.label, from: id }]))
);
NPC_ITEMS.architect_badge = { label: "the architect's badge", from: "architect" };

// ------------------------------------------------------------------ what the player has from them (this browser)
const KEY = "seeface-npc";
type Memory = { visits: Partial<Record<NpcId, number>>; lore: number; owned: string[] };
function readMemory(): Memory {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { visits: m.visits ?? {}, lore: Number(m.lore) || 0, owned: Array.isArray(m.owned) ? m.owned : [] };
  } catch {
    return { visits: {}, lore: 0, owned: [] };
  }
}
const memory = readMemory();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {}
};
export const keepsakes = () => memory.owned.slice();
export const lorePages = () => memory.lore;
export function own(item: string) {
  if (!memory.owned.includes(item)) memory.owned.push(item);
  save();
}

// ------------------------------------------------------------------ scripted lines (no API, or it's down)
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const WANTS_SHOP = /\b(buy|shop|sell|sells|price|prices|cost|menu|what do you (have|sell|got)|dose|doses|tape|tapes|coin|coins|pass|invite)\b|◈/i;
const WANTS_LORE = /\b(lore|history|story|stories|who built|built|first|past|why)\b/i;
const RUMOURS = [
  "They say the walls near the entrance count your steps. They don't. Probably.",
  "Someone saw the dark king bow twice to the same person. Nobody bows twice.",
  "The gramophones in the theater play one record nobody chose.",
  "A rift opened in the Pools last night and stayed open an hour.",
  "The vending machines talk to each other after midnight.",
];
const DELIVER: Record<string, () => string> = {
  rumour: () => `Listen: ${pick(RUMOURS)}`,
  room_key_hint: () => "South-west of the entrance there's a room with one door. The door looks like a wall. Walk into it.",
  floor4_whisper: () => "Below The White there's a hum. Count to four when you hear it. That's all I'll say.",
};
const BROKE: Partial<Record<NpcId, string>> = {
  vend: "INSUFFICIENT ◈. TRY CRYING. (NOT ACCEPTED.)",
  velvet: "Come back when your pockets are heavier, darling.",
  nyx: "Secrets aren't free, sweet thing. Come back richer.",
  static: "No ◈, no dose. Walk a bit, find some cubes, come back.",
};
export const brokeLine = (id: NpcId) => BROKE[id] ?? "Not enough ◈.";
const fill = (s: string, ctx: NpcContext) => s.replace(/\{\{username\}\}/g, ctx.username);

function scripted(id: NpcId, said: string, ctx: NpcContext, bought: string | null, firstToday: boolean): Omit<NpcReply, "npc" | "name"> {
  const ch = CAST[id];
  if (bought) {
    const deliver = DELIVER[bought];
    if (deliver) return { say: deliver(), action: "reveal_clue", item: null };
    if (id === "vend") return { say: fill("THANK YOU FOR YOUR PURCHASE, {{username}}. I WILL REMEMBER THIS.", ctx), action: "none", item: null };
    return { say: id === "static" ? "Good choice. Don't play it in the Deep." : "It suits you.", action: "none", item: null };
  }
  if (id === "watcher" && !(memory.visits.watcher ?? 0)) return { say: fill(pick(ch.samples), ctx), action: "end_chat", item: null };
  if (id === "architect" && memory.lore < LORE.length && (firstToday || WANTS_LORE.test(said)))
    return { say: `Piece ${memory.lore + 1}: ${LORE[memory.lore]}`, action: "give_item", item: `lore_${memory.lore + 1}` };
  if (id === "static" && !memory.owned.includes("float_wav")) return { say: "First tape's free. FLOAT.wav. You'll come back. They always come back.", action: "give_item", item: "float_wav" };
  if (ch.items.length && WANTS_SHOP.test(said)) return { say: fill(pick(ch.samples), ctx), action: "open_shop", item: null };
  return { say: fill(pick(ch.samples), ctx), action: "none", item: null };
}

// ------------------------------------------------------------------ where they stand (deterministic: the same for everyone)
type Spot = { id: NpcId; x: number; z: number };

/** dead ends near the entrance, spread apart (the watcher's spots) */
function deadEnds(n: number): Spot[] {
  const found: { x: number; z: number }[] = [];
  for (let i = -12; i <= 12; i++)
    for (let j = -12; j <= 12; j++) {
      if (roomOf(i, j) || placeOf(i, j)) continue;
      const open = [!wallEast(i, j), !wallEast(i - 1, j), !wallSouth(i, j), !wallSouth(i, j - 1)];
      if (open.filter(Boolean).length !== 1) continue;
      // stand at the closed end, facing the way in
      const k = open.indexOf(true);
      const dx = k === 0 ? -1 : k === 1 ? 1 : 0, dz = k === 2 ? -1 : k === 3 ? 1 : 0;
      found.push({ x: (i + 0.5) * CELL + dx * 1.1, z: (j + 0.5) * CELL + dz * 1.1 });
    }
  const picked: { x: number; z: number }[] = [];
  found.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  for (const f of found) {
    if (Math.hypot(f.x, f.z) < 14) continue; // not right at the entrance
    if (picked.every((p) => Math.hypot(p.x - f.x, p.z - f.z) > 30)) picked.push(f);
    if (picked.length === n) break;
  }
  return picked.map((p) => ({ id: "watcher" as NpcId, ...p }));
}

/** a corner of the room in region (I,J), pulled 1 m in from the walls */
function roomCorner(I: number, J: number, cx: number, cz: number) {
  const c = roomCentre(I, J);
  return { x: c.x + cx * (CELL * 1.5 - 1), z: c.z + cz * (CELL * 1.5 - 1) };
}

function spots(): Spot[] {
  const out: Spot[] = [];
  out.push({ id: "architect", ...roomCorner(0, 0, -1, -1) });
  out.push({ id: "vend", ...roomCorner(0, 0, 1, 1) });
  // the places around the entrance (safeSpot = open floor, never furniture)
  const inPlace = (I: number, J: number, dx: number) => {
    const s = safeSpot(I, J);
    return { x: s.x + dx, z: s.z };
  };
  out.push({ id: "velvet", ...inPlace(-1, 0, -1.5) }); // the theater
  out.push({ id: "nyx", ...inPlace(0, -1, 1.5) }); // the mall
  out.push({ id: "static", ...inPlace(1, -1, -1.5) }); // the open market
  // more vending machines in rooms a little further out
  for (const [I, J] of [[0, 2], [-2, 0], [0, -2], [2, 2], [-2, -2], [2, -2]] as const) {
    if (placeAt(I, J)) continue;
    out.push({ id: "vend", ...roomCorner(I, J, I > 0 ? 1 : -1, J > 0 ? 1 : -1) });
    if (out.filter((s) => s.id === "vend").length >= 4) break;
  }
  return [...out, ...deadEnds(3)];
}

// ------------------------------------------------------------------ looks
function machineTexture(colour: string) {
  const W = 160, H = 300;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1b1d1c";
  g.strokeStyle = "#5a4a3a";
  g.lineWidth = 4;
  g.fillRect(10, 10, W - 20, H - 20);
  g.strokeRect(10, 10, W - 20, H - 20);
  // rust
  for (let k = 0; k < 40; k++) {
    g.fillStyle = `rgba(${120 + Math.random() * 60},${50 + Math.random() * 30},20,${0.15 + Math.random() * 0.3})`;
    g.fillRect(10 + Math.random() * (W - 30), 10 + Math.random() * (H - 30), 3 + Math.random() * 10, 2 + Math.random() * 6);
  }
  // the flickering screen
  g.shadowColor = colour;
  g.shadowBlur = 14;
  g.fillStyle = colour;
  g.globalAlpha = 0.85;
  g.fillRect(24, 26, W - 48, 70);
  g.globalAlpha = 1;
  g.shadowBlur = 0;
  // eyes drawn on it
  g.fillStyle = "#081010";
  for (const ex of [W / 2 - 22, W / 2 + 22]) {
    g.beginPath();
    g.ellipse(ex, 60, 9, 13, 0, 0, Math.PI * 2);
    g.fill();
  }
  // product slots + buttons that light up by themselves
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 3; k++) {
      g.fillStyle = ["#ff9ad8", "#9fe8ff", "#ffe6b8", "#7affd8"][(r + k) % 4];
      g.globalAlpha = 0.55;
      g.fillRect(26 + k * 38, 112 + r * 34, 28, 22);
    }
  g.globalAlpha = 1;
  g.fillStyle = "#000";
  g.fillRect(30, H - 52, W - 60, 24);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function watcherTexture() {
  const W = 128, H = 420;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  // a long grey coat
  g.fillStyle = "rgba(70,74,78,0.92)";
  g.beginPath();
  g.moveTo(W / 2 - 26, 96);
  g.lineTo(W / 2 + 26, 96);
  g.lineTo(W / 2 + 40, H);
  g.lineTo(W / 2 - 40, H);
  g.closePath();
  g.fill();
  // the cracked mirror mask
  const grad = g.createLinearGradient(W / 2 - 24, 20, W / 2 + 24, 90);
  grad.addColorStop(0, "#e9f2f6");
  grad.addColorStop(0.5, "#8fa0a8");
  grad.addColorStop(1, "#dfe8ec");
  g.fillStyle = grad;
  g.shadowColor = "#cfe6ff";
  g.shadowBlur = 12;
  g.beginPath();
  g.ellipse(W / 2, 56, 24, 34, 0, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = "rgba(20,24,28,0.8)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(W / 2 - 6, 24);
  g.lineTo(W / 2 + 3, 50);
  g.lineTo(W / 2 - 8, 66);
  g.lineTo(W / 2 + 6, 88);
  g.moveTo(W / 2 + 3, 50);
  g.lineTo(W / 2 + 20, 46);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ the cast in the world
export type Npcs = ReturnType<typeof createNpcs>;

export function createNpcs() {
  const group = new THREE.Group();
  const people = spots().map((s) => {
    const ch = CAST[s.id];
    const holder = new THREE.Group();
    const machine = s.id === "vend";
    const map = machine ? machineTexture(ch.colour) : s.id === "watcher" ? watcherTexture() : bodyTexture(ch.colour);
    const body = new THREE.Sprite(
      new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: machine || s.id === "watcher" ? THREE.NormalBlending : THREE.AdditiveBlending })
    );
    body.scale.set(machine ? 1.15 : s.id === "watcher" ? 0.95 : 0.9, machine ? 2.1 : s.id === "watcher" ? 3.1 : 2.8, 1);
    body.center.set(0.5, 0);
    const label = textSprite(`◇ ${ch.name}`, ch.colour, 28, 384);
    label.position.y = machine ? 2.45 : 3.2;
    holder.add(body, label);
    holder.position.set(s.x, 0, s.z);
    group.add(holder);
    return { ...s, holder, body, bubble: null as THREE.Sprite | null, bubbleT: 0, idleIn: 2 + Math.random() * 4, phase: Math.random() * 10 };
  });

  const histories = new Map<NpcId, { from: "player" | "npc"; text: string }[]>();
  const quietUntil = new Map<NpcId, number>();
  const lastTalk = new Map<NpcId, number>();
  let busy = false;

  function bubble(p: (typeof people)[number], text: string) {
    release(p.bubble);
    p.bubble = textSprite(text.length > 90 ? text.slice(0, 88) + "…" : text, "#e9f6ff");
    p.bubble.position.y = p.id === "vend" ? 2.85 : 3.65;
    p.holder.add(p.bubble);
    p.bubbleT = 7;
  }

  function nearestOf(id: NpcId | null, x: number, z: number, r: number) {
    let best: (typeof people)[number] | null = null, bd = r;
    for (const p of people) {
      if (id && p.id !== id) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) (bd = d), (best = p);
    }
    return best;
  }

  /** a new conversation (5+ minutes since the last one) counts as a visit, after they've answered */
  function visited<T>(id: NpcId, isNew: boolean, reply: T) {
    if (isNew) {
      memory.visits[id] = (memory.visits[id] ?? 0) + 1;
      save();
    }
    return reply;
  }

  async function ask(id: NpcId, said: string, ctx: NpcContext, bought: string | null): Promise<Omit<NpcReply, "npc" | "name">> {
    const now = Date.now();
    const firstToday = now - (lastTalk.get(id) ?? 0) > 5 * 60_000;
    lastTalk.set(id, now);
    const history = histories.get(id) ?? [];
    if (apiBase) {
      try {
        const r = await fetch(`${apiBase}/api/npc/talk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            npc: id,
            said,
            bought,
            history,
            ctx: { username: ctx.username, place: ctx.place, coins: ctx.coins, event: ctx.event, visits: memory.visits[id] ?? 0, lore: memory.lore, owned: memory.owned },
          }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d?.ok && typeof d.say === "string") return visited(id, firstToday && !bought, { say: d.say, action: d.action ?? "none", item: d.item ?? null });
        }
      } catch {
        // offline / API asleep: scripted lines below
      }
    }
    return visited(id, firstToday && !bought, scripted(id, said, ctx, bought, firstToday));
  }

  async function exchange(id: NpcId, said: string, ctx: NpcContext, bought: string | null, x: number, z: number): Promise<NpcReply | null> {
    if ((quietUntil.get(id) ?? 0) > Date.now() || busy) return null;
    busy = true;
    try {
      const r = await ask(id, said, ctx, bought);
      const h = histories.get(id) ?? [];
      h.push({ from: "player", text: bought ? `(bought ${bought})` : said }, { from: "npc", text: r.say });
      histories.set(id, h.slice(-8));
      if (r.action === "end_chat") quietUntil.set(id, Date.now() + 60_000);
      if (r.action === "give_item" && r.item?.startsWith("lore_")) {
        memory.lore = Math.max(memory.lore, Number(r.item.slice(5)) || 0);
        if (memory.lore >= LORE.length) own("architect_badge");
        save();
      }
      const p = nearestOf(id, x, z, 40);
      if (p) bubble(p, r.say);
      return { npc: id, name: CAST[id].name, ...r };
    } finally {
      busy = false;
    }
  }

  return {
    group,
    count: () => people.length,
    /** the character within `r` metres, if any (chat goes to them) */
    near(x: number, z: number, r = 7): NpcId | null {
      return nearestOf(null, x, z, r)?.id ?? null;
    },
    /** the player said something to a character: their answer (or null if they're quiet / busy) */
    talk: (id: NpcId, said: string, ctx: NpcContext, x: number, z: number) => exchange(id, said, ctx, null, x, z),
    /** the player just bought something from them: their reaction (info items are delivered here) */
    bought: (id: NpcId, item: string, ctx: NpcContext, x: number, z: number) => exchange(id, "", ctx, item, x, z),
    /** a line from them without asking anyone (not enough ◈ etc.) */
    say(id: NpcId, text: string, x: number, z: number) {
      const p = nearestOf(id, x, z, 40);
      if (p) bubble(p, text);
    },
    update(dt: number, px: number, pz: number) {
      const t = performance.now() / 1000;
      for (const p of people) {
        p.body.position.y = p.id === "vend" ? 0 : Math.sin(t * 1.3 + p.phase) * 0.04;
        if (p.id === "vend") (p.body.material as THREE.SpriteMaterial).opacity = Math.random() < 0.03 ? 0.6 : 1; // the screen flickers
        p.bubbleT -= dt;
        if (p.bubble) (p.bubble.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, p.bubbleT));
        // a scripted line when you come close (no API call)
        const d = Math.hypot(p.x - px, p.z - pz);
        p.idleIn -= dt;
        if (p.idleIn <= 0 && d < 6 && p.bubbleT <= 0) {
          p.idleIn = 25 + Math.random() * 20;
          bubble(p, pick(CAST[p.id].samples).replace(/\{\{username\}\}/g, "you"));
        }
      }
    },
    /** for the map */
    list: () => people.map((p) => ({ name: CAST[p.id].name, x: p.x, z: p.z })),
  };
}

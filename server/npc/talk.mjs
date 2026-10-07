// POST /api/npc/talk: one line from a labyrinth character (◇), written by Claude.
// The game sends the character id, this visit's short conversation and a small
// player context; we answer {say, emotion, action, item}. Everything that comes
// back is clamped to the cast (cast.json), so a bad answer can't hand out
// anything that isn't on the list. Without ANTHROPIC_API_KEY the route answers
// 503 and the game uses the characters' scripted lines.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { CHARACTERS, WORLD } from "./prompts.mjs";

const cast = JSON.parse(readFileSync(new URL("./cast.json", import.meta.url), "utf8"));
const EMOTIONS = ["neutral", "amused", "threat", "flirty", "sad", "glitch"];
const ACTIONS = ["none", "open_shop", "give_item", "reveal_clue", "end_chat"];
const DAILY_CAP = Number(process.env.NPC_DAILY_CAP || 3000); // Claude calls per UTC day, all players together

export const npcReady = () => Boolean(process.env.ANTHROPIC_API_KEY);
const client = npcReady() ? new Anthropic() : null;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["say", "emotion", "action", "item"],
  properties: {
    say: { type: "string", description: "the character's line, 1-3 short sentences" },
    emotion: { type: "string", enum: EMOTIONS },
    action: { type: "string", enum: ACTIONS },
    item: { type: ["string", "null"], description: "item id for give_item, else null" },
  },
};

// one line of text from the client: no newlines, no control characters, short
const line = (v, max) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, max);
const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
const NICK = /^[\p{L}\p{N}_.]{2,16}$/u;

let day = "", used = 0;
function spend() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) (day = today), (used = 0);
  if (used >= DAILY_CAP) return false;
  used++;
  return true;
}

/** Notes only the server decides: what may be given now, random machine glitches. */
function notesFor(id, ch, ctx) {
  const notes = [];
  if (ch.items.length) notes.push(`YOU SELL (prices in ◈; "does" is exactly what the player gets):\n${ch.items.map((i) => `- ${i.id}: ${i.label}, ${i.price} ◈. Does: ${i.does}`).join("\n")}`);
  else notes.push("You sell nothing: never use open_shop.");
  if (id === "architect") {
    const next = ctx.lore;
    if (next < cast.lore.length) notes.push(`ARCHITECT NOTES: the player has heard ${next} of ${cast.lore.length} lore pieces. Next piece (only this one): lore_${next + 1}: "${cast.lore[next]}"${next + 1 === cast.lore.length ? " (the last one; it also earns the architect's badge)" : ""}.`);
    else notes.push("ARCHITECT NOTES: the player has heard every lore piece. Give nothing; talk about the world.");
  }
  if (id === "static") notes.push(ctx.owned.includes("float_wav") ? "STATIC NOTES: they already have FLOAT.wav. Don't give it again." : "STATIC NOTES: new customer: you may give float_wav free.");
  if (id === "vend") {
    if (Math.random() < 0.1) notes.push('MACHINE NOTES: glitch in this reply (something like "ERR_0x666: SOUL NOT FOUND").');
    if (Math.random() < 0.02) notes.push("MACHINE NOTES: by accident, give a free mystery_capsule in this reply (give_item).");
  }
  return notes.join("\n\n");
}

/** The only gifts a character may hand out right now (anything else becomes "none"). */
function allowedGift(id, ctx) {
  if (id === "architect") return ctx.lore < cast.lore.length ? [`lore_${ctx.lore + 1}`] : [];
  if (id === "static") return ctx.owned.includes("float_wav") ? [] : ["float_wav"];
  if (id === "vend") return ["mystery_capsule"];
  return [];
}

export async function talk(body) {
  const id = String(body?.npc ?? "");
  const ch = cast.characters[id];
  if (!ch || !CHARACTERS[id]) return { status: 400, data: { ok: false, error: "who?" } };
  if (!client) return { status: 503, data: { ok: false, error: "off" } };

  const c = body.ctx ?? {};
  const username = typeof c.username === "string" && NICK.test(c.username) ? c.username : "wanderer";
  const ctx = {
    lore: int(c.lore, cast.lore.length),
    owned: Array.isArray(c.owned) ? c.owned.map((x) => line(x, 24)).slice(0, 40) : [],
  };
  const said = line(body.said, 120);
  const bought = ch.items.find((i) => i.id === body.bought);
  if (!said && !bought) return { status: 400, data: { ok: false, error: "say something" } };
  if (!spend()) return { status: 503, data: { ok: false, error: "busy" } };

  // this visit's conversation with this character (the client keeps it, we clamp it)
  const history = (Array.isArray(body.history) ? body.history : []).slice(-8);
  const messages = [];
  for (const h of history) {
    const role = h?.from === "npc" ? "assistant" : "user";
    const text = line(h?.text, 200);
    if (!text) continue;
    if (role === "assistant") messages.push({ role, content: JSON.stringify({ say: text, emotion: "neutral", action: "none", item: null }) });
    else messages.push({ role, content: text });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();

  const context = `PLAYER CONTEXT
username: ${username}
age_verified_18plus: false
place: ${line(c.place, 40) || "a corridor"}
last_location: ${line(c.last, 40) || "unknown"}
face_coins: ${int(c.coins, 1_000_000)} ◈
visits_to_you: ${int(c.visits, 10_000)}
lore_pieces_found: ${ctx.lore}
recent_event: ${line(c.event, 60) || "none"}`;
  // age_verified_18plus stays false until the game has real age verification
  // (a self-ticked box isn't verification), so nobody gets flirted with.
  const now = bought ? `(${username} just paid ${bought.price} ◈ for ${bought.label}. React, and deliver it if it's information.)` : said;
  messages.push({ role: "user", content: `${context}\n\n${username} says: ${now}` });

  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system: `${WORLD}\n\n${CHARACTERS[id]}\n\n${notesFor(id, ch, ctx)}`,
    messages,
  });
  if (response.stop_reason === "refusal") return { status: 200, data: { ok: true, say: "…", emotion: "glitch", action: "none", item: null } };
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error(`npc: no text (stop_reason ${response.stop_reason})`);
  const out = JSON.parse(text);

  let action = ACTIONS.includes(out.action) ? out.action : "none";
  let item = null;
  if (action === "open_shop" && !ch.items.length) action = "none";
  if (action === "give_item") {
    if (allowedGift(id, ctx).includes(out.item)) item = out.item;
    else action = "none";
  }
  const say = line(out.say, 240).replace(/\bA\.I\.|\bAI\b/g, "dream"); // owner rule: the word "ai" is never shown
  return { status: 200, data: { ok: true, say: say || "…", emotion: EMOTIONS.includes(out.emotion) ? out.emotion : "neutral", action, item } };
}

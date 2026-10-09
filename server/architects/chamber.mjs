// The Creation Chamber (signed-in Architects only).
//   GET  /api/chamber           → { alias, disciplines, room, messages, assets, left }   (SeeFace greets on the first visit)
//   POST /api/chamber/say {text} → newline-delimited JSON: {t:"delta",text}… then {t:"done",reply,blueprint,stage,left} | {t:"error"}
//   POST /api/chamber/submit     → { status } or { missing[], message }   (SeeFace asks for what's missing)
// Uploads and transcription: uploads.mjs.
//
// ANTHROPIC_API_KEY    without it SeeFace runs a small scripted fallback (local testing)
// CHAMBER_DAILY_LIMIT  messages per Architect per UTC day (default 150)
// CHAMBER_DAILY_CAP    model calls per UTC day for everyone together (default 5000)
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { applyPatch, cleanPatch, missingForSubmit, MISSING_WORDS, TURN_SCHEMA, ARCHETYPES } from "./blueprint.mjs";
import { SEEFACE_PROMPT, contextBlock, greeting } from "./seeface.mjs";
import { ReplyStream } from "./stream.mjs";

const PER_DAY = Number(process.env.CHAMBER_DAILY_LIMIT || 150);
const DAILY_CAP = Number(process.env.CHAMBER_DAILY_CAP || 5000);
const STAGES = TURN_SCHEMA.properties.stage.enum;
export const llmReady = () => Boolean(process.env.ANTHROPIC_API_KEY);
const client = llmReady() ? new Anthropic() : null;
const today = () => new Date().toISOString().slice(0, 10);
const line = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");

let capDay = "",
  capUsed = 0;
function spend() {
  if (capDay !== today()) (capDay = today()), (capUsed = 0);
  return ++capUsed <= DAILY_CAP;
}

/** Signed-in Architect → { acc, app, room } (or a 401/404 already sent). */
export function architect(db, auth) {
  return async (req, res, next) => {
    try {
      const a = await auth(req);
      if (!a) return res.status(401).json({ ok: false, error: "signin" });
      const room = await db.rooms.findOne({ owner_id: a.acc.nickLower });
      const app_ = await db.apps.findOne({ user_id: a.acc.nickLower });
      if (!room || !app_) return res.status(404).json({ ok: false, error: "apply" });
      req.arch = { acc: a.acc, app: app_, room };
      next();
    } catch (e) {
      next(e);
    }
  };
}

export const publicAsset = (a) => ({ id: a.id, type: a.type, name: a.name, description: a.description ?? null, palette: a.palette ?? null, mime: a.mime });
const publicRoom = (r) => ({ id: r.id, status: r.status, stage: r.stage, blueprint: { ...r.blueprint, status: r.status }, admin_note: r.admin_note ?? null });
const left = (room) => (room.usage?.day === today() ? Math.max(0, PER_DAY - room.usage.n) : PER_DAY);

export function mountChamber(app, { db, auth, described }) {
  const me = architect(db, auth);
  app.use("/api/chamber", express.json({ limit: "8kb" }));

  const say = (room, role, text, asset_ids) => db.messages.insert({ room_id: room.id, role, text, ...(asset_ids?.length ? { asset_ids } : {}), created_at: new Date() });

  app.get("/api/chamber", me, async (req, res) => {
    const { app: a, room } = req.arch;
    let messages = await db.messages.find({ room_id: room.id }, { sort: { created_at: 1 } });
    if (!messages.length) {
      await say(room, "seeface", greeting(a.alias, a.disciplines));
      messages = await db.messages.find({ room_id: room.id }, { sort: { created_at: 1 } });
    }
    const assets = await db.assets.find({ room_id: room.id }, { sort: { created_at: 1 } });
    res.json({
      ok: true,
      alias: a.alias,
      disciplines: a.disciplines,
      room: publicRoom(room),
      messages: messages.map((m) => ({ role: m.role, text: m.text, at: m.created_at, assets: m.asset_ids ?? [] })),
      assets: assets.map(publicAsset),
      left: left(room),
    });
  });

  app.post("/api/chamber/say", me, async (req, res) => {
    const { app: a, room } = req.arch;
    const text = line(req.body?.text, 1200);
    if (!text) return res.status(400).json({ ok: false, error: "empty" });
    if (!["draft", "rejected"].includes(room.status)) return res.status(409).json({ ok: false, error: "submitted" });
    const usage = room.usage?.day === today() ? { ...room.usage } : { day: today(), n: 0 };
    if (usage.n >= PER_DAY) return res.status(429).json({ ok: false, error: "limit" });
    usage.n++;
    await db.rooms.update({ id: room.id }, { usage });
    // uploads shared with this message (only this room's)
    const mine = new Set((await db.assets.find({ room_id: room.id })).map((x) => x.id));
    const attach = (Array.isArray(req.body?.attach) ? req.body.attach : []).filter((id) => mine.has(id)).slice(0, 15);
    await say(room, "artist", text, attach);

    res.status(200).set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
    const send = (o) => res.write(JSON.stringify(o) + "\n");
    try {
      if (client) await described(room.id); // let SeeFace see freshly uploaded images
      const assets = await db.assets.find({ room_id: room.id }, { sort: { created_at: 1 } });
      const history = (await db.messages.find({ room_id: room.id }, { sort: { created_at: 1 } })).slice(-40);
      const out = client && spend() ? await askSeeFace({ a, room, assets, history, left: PER_DAY - usage.n, send }) : scripted(text, room, assets);
      const { patch, rejected } = cleanPatch(out.blueprint_patch, assets);
      if (rejected.length) console.warn(`chamber ${room.id}: rejected patch fields ${rejected.join(", ")}`);
      const blueprint = applyPatch(room.blueprint, patch);
      const stage = STAGES.includes(out.stage) ? out.stage : room.stage;
      const reply = line(out.reply, 1200) || "…";
      await db.rooms.update({ id: room.id }, { blueprint, stage });
      await say(room, "seeface", reply);
      if (!client) send({ t: "delta", text: reply });
      send({ t: "done", reply, blueprint: { ...blueprint, status: room.status }, stage, left: PER_DAY - usage.n });
    } catch (e) {
      console.error("chamber turn failed", e.message);
      send({ t: "error", error: "failed" });
    }
    res.end();
  });

  app.post("/api/chamber/submit", me, async (req, res) => {
    const { room } = req.arch;
    if (!["draft", "rejected"].includes(room.status)) return res.json({ ok: true, status: room.status });
    const missing = missingForSubmit(room.blueprint);
    if (missing.length) {
      const words = missing.map((m) => MISSING_WORDS[m]);
      const text = `Not yet. The labyrinth still needs ${words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0]}. Shall we start there?`;
      await say(room, "seeface", text);
      return res.json({ ok: false, missing, message: { role: "seeface", text, at: new Date() } });
    }
    await db.rooms.update({ id: room.id }, { status: "submitted", submitted_at: new Date(), blueprint: { ...room.blueprint, status: "submitted" } });
    const text = "It's done. Your room is in the labyrinth's hands now. We'll write to you when the door opens.";
    await say(room, "seeface", text);
    res.json({ ok: true, status: "submitted", message: { role: "seeface", text, at: new Date() } });
  });
}

/** One SeeFace turn through Claude, streaming the reply text as it's written. */
async function askSeeFace({ a, room, assets, history, left, send }) {
  const messages = [];
  for (const m of history) {
    if (m.role === "seeface") messages.push({ role: "assistant", content: JSON.stringify({ reply: m.text, blueprint_patch: null, stage: room.stage }) });
    else {
      const shared = (m.asset_ids ?? []).map((id) => assets.find((x) => x.id === id)).filter(Boolean);
      messages.push({ role: "user", content: shared.length ? `${m.text}\n[shared: ${shared.map((x) => `${x.type} ${x.id} "${x.name}"`).join(", ")}]` : m.text });
    }
  }
  while (messages.length && messages[0].role !== "user") messages.shift(); // the greeting was scripted
  // the chamber state rides along with the artist's latest words (only the text is stored, so
  // earlier turns stay byte-identical and the history before this turn caches)
  const last = messages[messages.length - 1];
  const state = contextBlock({ application: a, assets, blueprint: room.blueprint, missing: missingForSubmit(room.blueprint), left });
  last.content = [
    { type: "text", text: last.content },
    { type: "text", text: `<chamber_state>\n${state}\n</chamber_state>` },
  ];

  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: TURN_SCHEMA } },
    cache_control: { type: "ephemeral" },
    system: SEEFACE_PROMPT,
    messages,
  });
  const rs = new ReplyStream();
  stream.on("text", (delta) => {
    const t = rs.push(delta);
    if (t) send({ t: "delta", text: t });
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") {
    const reply = "The labyrinth won't hold that. Tell me about something else you'd like to build.";
    send({ t: "delta", text: reply });
    return { reply, blueprint_patch: null, stage: room.stage };
  }
  const textBlock = msg.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error(`no text (stop_reason ${msg.stop_reason})`);
  return JSON.parse(textBlock.text);
}

/** Without an API key: a tiny scripted SeeFace, so the chamber can be built and tested locally. */
function scripted(text, room, assets) {
  const t = text.toLowerCase();
  const patch = {};
  const arch = ARCHETYPES.find((k) => t.includes(k.replace("_", " ")) || t.includes(k));
  if (arch) patch.archetype = arch;
  const hex = text.match(/#[0-9a-f]{6}/gi);
  if (hex) patch.palette = { primary: hex[0], ...(hex[1] ? { secondary: hex[1] } : {}), ...(hex[2] ? { accent: hex[2] } : {}) };
  const named = /(?:call it|name it|title)[:\s]+["“]?([^"”.]{2,40})/i.exec(text);
  if (named) patch.title = named[1].trim();
  const welcome = /(?:welcome|they read)[:\s]+["“]([^"”]{2,280})/i.exec(text);
  if (welcome) patch.welcome_text = welcome[1];
  const img = assets.filter((x) => x.type === "image");
  if (img.length && /poster|wall|hang/.test(t)) patch.posters = img.slice(0, 12).map((x, i) => ({ asset_id: x.id, slot: i + 1, caption: "" }));
  const order = ["arrival", "essence", "material", "atmosphere", "naming", "refining"];
  const next = order[Math.min(order.length - 1, order.indexOf(room.stage) + 1)] || "refining";
  const asks = {
    essence: "I feel it. Is it a cathedral, a void, a club, a garden, a gallery corridor, a cave, a rooftop, or the ocean floor?",
    material: "Show me your material. Drawings, photos, textures, sounds.",
    atmosphere: "How should the light fall? Candle, neon, moonlight, daylight, dim, or strobe?",
    naming: "What is this room called? And what should people read when they step in?",
    refining: "Walk inside. Tell me what to change.",
  };
  return { reply: `(SeeFace's mind is offline on this server; this is a scripted stand-in.) ${asks[next] || asks.refining}`, blueprint_patch: Object.keys(patch).length ? patch : null, stage: next };
}

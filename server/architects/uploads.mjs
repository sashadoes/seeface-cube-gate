// Uploads and voice for the Creation Chamber.
//   POST   /api/chamber/assets?name=…   raw body (image/png|jpeg|webp ≤10 MB, max 12; audio/mpeg|wav|ogg ≤20 MB, max 3)
//                                        header x-palette: "#rrggbb,…" (dominant colours, measured in the browser)
//                                        → { asset }   (an image is described by Claude in the background)
//   GET    /api/chamber/assets/:id      the file, for its owner (or the admin key) only
//   DELETE /api/chamber/assets/:id      removes it (and from the blueprint)
//   GET    /api/rooms/:room              an approved/live room's public blueprint
//   GET    /api/rooms/:room/assets/:id   its files: public once approved, before that only with the admin key
//   POST   /api/chamber/transcribe       raw audio → { text }. The audio is held in memory only and dropped
//                                        right after; nothing is written anywhere. For browsers without speech recognition.
//
// TRANSCRIBE_API_KEY   key for an OpenAI-compatible /audio/transcriptions endpoint (without it: 503, the mic
//                      only works where the browser itself can transcribe)
// TRANSCRIBE_URL       default https://api.openai.com/v1/audio/transcriptions   TRANSCRIBE_MODEL  default whisper-1
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { createHash, timingSafeEqual } from "node:crypto";
import { architect, publicAsset } from "./chamber.mjs";
import { newId } from "./store.mjs";
import { SURFACE_PRESETS } from "./blueprint.mjs";

const LIMITS = { image: { bytes: 10 * 1024 * 1024, count: 12 }, audio: { bytes: 20 * 1024 * 1024, count: 3 } };
export const transcribeReady = () => Boolean(process.env.TRANSCRIBE_API_KEY);
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

/** What the bytes really are (never trust the Content-Type alone). */
export function sniff(buf) {
  const s = (a, b) => buf.subarray(a, b).toString("latin1");
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && s(1, 4) === "PNG") return { type: "image", mime: "image/png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: "image", mime: "image/jpeg" };
  if (s(0, 4) === "RIFF" && s(8, 12) === "WEBP") return { type: "image", mime: "image/webp" };
  if (s(0, 4) === "RIFF" && s(8, 12) === "WAVE") return { type: "audio", mime: "audio/wav" };
  if (s(0, 4) === "OggS") return { type: "audio", mime: "audio/ogg" };
  if (s(0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { type: "audio", mime: "audio/mpeg" };
  return null;
}

const isAdmin = (req) => {
  const key = process.env.ADMIN_KEY;
  if (!key) return false;
  const given = createHash("sha256").update(req.get("x-admin-key") || "").digest();
  return timingSafeEqual(given, createHash("sha256").update(key).digest());
};
const PUBLIC = ["approved", "live"];

export function mountUploads(app, { db, auth, limiter }) {
  const me = architect(db, auth);
  const transcribeLimited = limiter(60, 60 * 60_000);
  // image descriptions still being written, per room: a turn waits for them (briefly) so SeeFace can "see"
  const pending = new Map();

  app.post("/api/chamber/assets", me, express.raw({ type: () => true, limit: "20mb" }), async (req, res, next) => {
    try {
      const { room, acc } = req.arch;
      if (room.status !== "draft") return res.status(409).json({ ok: false, error: "submitted" });
      const buf = Buffer.isBuffer(req.body) ? req.body : null;
      const kind = buf && sniff(buf);
      if (!kind) return res.status(415).json({ ok: false, error: "type" });
      if (buf.length > LIMITS[kind.type].bytes) return res.status(413).json({ ok: false, error: "size" });
      if ((await db.assets.count({ room_id: room.id, type: kind.type })) >= LIMITS[kind.type].count) return res.status(409).json({ ok: false, error: "count" });
      const palette = String(req.get("x-palette") || "")
        .split(",")
        .filter((c) => /^#[0-9a-f]{6}$/i.test(c))
        .slice(0, 6);
      const name = String(req.query.name || kind.type).replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 80) || kind.type;
      const id = newId();
      await db.putFile(id, buf, kind.mime);
      const asset = { id, owner_id: acc.nickLower, room_id: room.id, type: kind.type, mime: kind.mime, name, size: buf.length, url: `/api/chamber/assets/${id}`, description: null, palette: palette.length ? palette : null, created_at: new Date() };
      await db.assets.insert(asset);
      if (kind.type === "image" && client) {
        const p = describe(buf, kind.mime)
          .then((d) => d && db.assets.update({ id }, { description: d.description, palette: d.palette.length ? d.palette : asset.palette }))
          .catch((e) => console.warn("describe failed", e.message))
          .finally(() => pending.get(room.id)?.delete(p));
        if (!pending.has(room.id)) pending.set(room.id, new Set());
        pending.get(room.id).add(p);
      }
      res.json({ ok: true, asset: publicAsset(asset) });
    } catch (e) {
      next(e);
    }
  });

  const sendFile = async (res, asset) => {
    res.set({ "Content-Type": asset.mime, "Cache-Control": "private, max-age=3600", "Cross-Origin-Resource-Policy": "cross-origin" });
    res.send(await db.getFile(asset.id));
  };

  app.get("/api/chamber/assets/:id", async (req, res, next) => {
    try {
      const asset = await db.assets.findOne({ id: String(req.params.id) });
      if (!asset) return res.status(404).json({ ok: false });
      if (!isAdmin(req)) {
        const a = await auth(req);
        if (!a || a.acc.nickLower !== asset.owner_id) return res.status(404).json({ ok: false });
      }
      await sendFile(res, asset);
    } catch (e) {
      next(e);
    }
  });

  app.delete("/api/chamber/assets/:id", me, async (req, res, next) => {
    try {
      const { room } = req.arch;
      const asset = await db.assets.findOne({ id: String(req.params.id), room_id: room.id });
      if (!asset) return res.status(404).json({ ok: false });
      if (room.status !== "draft") return res.status(409).json({ ok: false, error: "submitted" });
      // take it out of the room too
      const bp = structuredClone(room.blueprint);
      bp.posters = bp.posters.filter((p) => p.asset_id !== asset.id);
      if (bp.skybox.asset_id === asset.id) bp.skybox.asset_id = null;
      if (bp.audio.ambient_asset_id === asset.id) bp.audio.ambient_asset_id = null;
      if (bp.surfaces.walls === asset.id) bp.surfaces.walls = SURFACE_PRESETS[0];
      if (bp.surfaces.floor === asset.id) bp.surfaces.floor = "stone";
      await db.rooms.update({ id: room.id }, { blueprint: bp });
      await db.assets.remove({ id: asset.id });
      await db.deleteFile(asset.id);
      res.json({ ok: true, blueprint: { ...bp, status: room.status } });
    } catch (e) {
      next(e);
    }
  });

  // ---------------------------------------------------------------- public rooms
  app.get("/api/rooms/:room", async (req, res, next) => {
    try {
      const room = await db.rooms.findOne({ id: String(req.params.room) });
      if (!room || (!PUBLIC.includes(room.status) && !isAdmin(req))) return res.status(404).json({ ok: false });
      const app_ = await db.apps.findOne({ user_id: room.owner_id });
      res.set("Cache-Control", "public, max-age=60");
      res.json({ ok: true, room: { id: room.id, status: room.status, blueprint: { ...room.blueprint, status: room.status }, architect: app_ ? { alias: app_.alias, ig: app_.ig_handle } : null } });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/rooms/:room/assets/:id", async (req, res, next) => {
    try {
      const room = await db.rooms.findOne({ id: String(req.params.room) });
      const asset = room && (await db.assets.findOne({ id: String(req.params.id), room_id: room.id }));
      if (!asset || (!PUBLIC.includes(room.status) && !isAdmin(req))) return res.status(404).json({ ok: false });
      await sendFile(res, asset);
    } catch (e) {
      next(e);
    }
  });

  // ---------------------------------------------------------------- voice → text
  app.post("/api/chamber/transcribe", me, express.raw({ type: () => true, limit: "10mb" }), async (req, res, next) => {
    let audio = Buffer.isBuffer(req.body) ? req.body : null;
    try {
      if (!transcribeReady()) return res.status(503).json({ ok: false, error: "off" });
      if (transcribeLimited(req.arch.acc.nickLower)) return res.status(429).json({ ok: false, error: "slow down" });
      if (!audio?.length) return res.status(400).json({ ok: false, error: "empty" });
      const type = String(req.get("content-type") || "audio/webm").split(";")[0];
      const ext = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-m4a": "m4a" }[type] || "webm";
      const form = new FormData();
      form.append("file", new Blob([audio], { type }), `voice.${ext}`);
      form.append("model", process.env.TRANSCRIBE_MODEL || "whisper-1");
      const r = await fetch(process.env.TRANSCRIBE_URL || "https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.TRANSCRIBE_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || typeof d.text !== "string") return res.status(502).json({ ok: false, error: "failed" });
      res.json({ ok: true, text: d.text.trim().slice(0, 1200) });
    } catch (e) {
      next(e);
    } finally {
      audio = null; // never stored: dropped with the request
      req.body = null;
    }
  });

  /** Before a SeeFace turn: wait (up to 8 s) for this room's image descriptions. */
  return { described: (roomId) => Promise.race([Promise.allSettled([...(pending.get(roomId) ?? [])]), new Promise((r) => setTimeout(r, 8000))]) };
}

const DESCRIBE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["description", "palette"],
  properties: {
    description: { type: "string", description: "one line, max 100 characters: what the image shows and its feel" },
    palette: { type: "array", items: { type: "string" }, description: "3-5 dominant colours as #rrggbb" },
  },
};

/** One line + dominant palette for an uploaded image (Claude vision). */
async function describe(buf, mime) {
  if (buf.length > 3.7 * 1024 * 1024) return null; // over the API's 5 MB (base64) image limit; the browser shrinks uploads, so this is rare
  const msg = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: DESCRIBE_SCHEMA } },
    system: "You describe an artist's uploaded image for a room builder. Be concrete and visual (subjects, materials, light, mood). Never guess who a real person is.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime, data: buf.toString("base64") } },
          { type: "text", text: "Describe this image in one line, and give its dominant colours." },
        ],
      },
    ],
  });
  if (msg.stop_reason === "refusal") return null;
  const text = msg.content.find((b) => b.type === "text")?.text;
  if (!text) return null;
  const d = JSON.parse(text);
  return {
    description: String(d.description || "").replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, 120),
    palette: (Array.isArray(d.palette) ? d.palette : []).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5),
  };
}

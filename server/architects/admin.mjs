// Review for the owner (header x-admin-key: ADMIN_KEY; without it every route answers 404).
//   GET  /api/admin/architects?status=submitted     → { rooms: [...] }  (applicant + room summary)
//   GET  /api/admin/architects/:room                → { room, application, messages, assets }
//   POST /api/admin/architects/:room/decision {action: "approve" | "reject" | "changes", note}
//        approve → status approved, the artist gets "Your door is open. Enter the labyrinth."
//        changes → back to draft; SeeFace passes the note on in the chamber, and the artist gets an email
//        reject  → status rejected (final), with the note
import express from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { STATUSES } from "./blueprint.mjs";
import { publicAsset } from "./chamber.mjs";
import { sendMail } from "./mail.mjs";

function adminOnly(req, res, next) {
  const key = process.env.ADMIN_KEY;
  const given = createHash("sha256").update(req.get("x-admin-key") || "").digest();
  if (!key || !timingSafeEqual(given, createHash("sha256").update(key).digest())) return res.status(404).json({ ok: false });
  next();
}

const applicant = (a) =>
  a && { alias: a.alias, ig: a.ig_handle, email: a.email, disciplines: a.disciplines, links: a.links, one_liner: a.one_liner, country: a.country, ref: a.ref, invite_code: a.invite_code, terms_accepted_at: a.terms_accepted_at, status: a.status, created_at: a.created_at };

export function mountAdmin(app, { db, SITE }) {
  app.use("/api/admin/architects", adminOnly, express.json({ limit: "8kb" }));
  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

  app.get(
    "/api/admin/architects",
    wrap(async (req, res) => {
      const status = STATUSES.includes(req.query.status) ? req.query.status : null;
      const rooms = await db.rooms.find(status ? { status } : {}, { sort: { created_at: -1 }, limit: 500 });
      const out = [];
      for (const r of rooms) {
        out.push({
          id: r.id,
          status: r.status,
          stage: r.stage,
          title: r.blueprint.title,
          archetype: r.blueprint.archetype,
          created_at: r.created_at,
          submitted_at: r.submitted_at,
          approved_at: r.approved_at,
          admin_note: r.admin_note,
          applicant: applicant(await db.apps.findOne({ user_id: r.owner_id })),
          messages: await db.messages.count({ room_id: r.id }),
          assets: await db.assets.count({ room_id: r.id }),
        });
      }
      res.json({ ok: true, rooms: out });
    })
  );

  app.get(
    "/api/admin/architects/:room",
    wrap(async (req, res) => {
      const room = await db.rooms.findOne({ id: String(req.params.room) });
      if (!room) return res.status(404).json({ ok: false });
      const messages = await db.messages.find({ room_id: room.id }, { sort: { created_at: 1 } });
      const assets = await db.assets.find({ room_id: room.id }, { sort: { created_at: 1 } });
      res.json({
        ok: true,
        room: { id: room.id, status: room.status, stage: room.stage, blueprint: { ...room.blueprint, status: room.status }, created_at: room.created_at, submitted_at: room.submitted_at, approved_at: room.approved_at, admin_note: room.admin_note, usage: room.usage },
        application: applicant(await db.apps.findOne({ user_id: room.owner_id })),
        messages: messages.map((m) => ({ role: m.role, text: m.text, at: m.created_at, assets: m.asset_ids ?? [] })),
        assets: assets.map((a) => ({ ...publicAsset(a), size: a.size })),
      });
    })
  );

  app.post(
    "/api/admin/architects/:room/decision",
    wrap(async (req, res) => {
      const room = await db.rooms.findOne({ id: String(req.params.room) });
      if (!room) return res.status(404).json({ ok: false });
      const action = req.body?.action;
      const note = typeof req.body?.note === "string" ? req.body.note.replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, " ").trim().slice(0, 1000) : "";
      const app_ = await db.apps.findOne({ user_id: room.owner_id });
      const now = new Date();
      const tell = (text) => db.messages.insert({ room_id: room.id, role: "seeface", text, created_at: now });

      if (action === "approve") {
        await db.rooms.update({ id: room.id }, { status: "approved", approved_at: now, admin_note: note || null, blueprint: { ...room.blueprint, status: "approved" } });
        await db.apps.update({ user_id: room.owner_id }, { status: "approved" });
        await tell("Your door is open. The labyrinth holds your room now.");
        if (app_)
          await sendMail({
            to: app_.email,
            subject: "Your door is open. Enter the labyrinth.",
            text: `${app_.alias},\n\nYour door is open. Enter the labyrinth.\n\n${room.blueprint.title || "Your room"}: ${SITE}/room/${room.id}\n${note ? `\nFrom the keepers: ${note}\n` : ""}\nseeface`,
          });
      } else if (action === "changes") {
        if (!note) return res.status(400).json({ ok: false, error: "note" });
        await db.rooms.update({ id: room.id }, { status: "draft", admin_note: note, blueprint: { ...room.blueprint, status: "draft" } });
        await tell(`The labyrinth's keepers looked at your room. They ask: ${note} Shall we change it together?`);
        if (app_)
          await sendMail({
            to: app_.email,
            subject: "The labyrinth asks for a change",
            text: `${app_.alias},\n\nThe keepers looked at your room and ask for a change:\n\n${note}\n\nReturn to the chamber: ${SITE}/chamber/\n(on a new device, ask for a sign-in link there with this email)\n\nseeface`,
          });
      } else if (action === "reject") {
        await db.rooms.update({ id: room.id }, { status: "rejected", admin_note: note || null, blueprint: { ...room.blueprint, status: "rejected" } });
        await db.apps.update({ user_id: room.owner_id }, { status: "rejected" });
        await tell(note ? `The labyrinth can't hold this room. ${note}` : "The labyrinth can't hold this room.");
        if (app_)
          await sendMail({
            to: app_.email,
            subject: "About your room in the labyrinth",
            text: `${app_.alias},\n\nThank you for answering the call. The keepers decided not to open this room.${note ? `\n\n${note}` : ""}\n\nseeface`,
          });
      } else return res.status(400).json({ ok: false, error: "action" });

      const fresh = await db.rooms.findOne({ id: room.id });
      res.json({ ok: true, status: fresh.status });
    })
  );
}

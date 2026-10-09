// The Architects, Phase 1: invite → application → Creation Chamber → submit → admin review.
//   GET  /api/architects/count                   → { claimed, of: 100 }   (submitted + approved + live rooms)
//   POST /api/architects/apply   {alias, ig, email, disciplines[], links[], one_liner, country, ref?, invite?, terms: true}
//                                                → { token, room }  (a new passwordless account, or the signed-in one)
//   POST /api/architects/link    {email}         → always { ok }; emails a one-time sign-in link if they applied
//   POST /api/architects/redeem  {code}          → { token }   (the link's code → a session)
// Chamber and admin routes live in chamber.mjs and admin.mjs.
import express from "express";
import { createHash, randomBytes } from "node:crypto";
import { emptyBlueprint } from "./blueprint.mjs";
import { newId } from "./store.mjs";
import { sendMail } from "./mail.mjs";

export const FOUNDING = 100;
export const DISCIPLINES = ["visual", "3d", "ai_art", "sound", "photography", "fashion", "performance", "other"];
const CLAIMED = ["submitted", "approved", "live"];

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const IG = /^[A-Za-z0-9._]{1,30}$/;
const CODE = /^[\w-]{1,40}$/;
const sha = (s) => createHash("sha256").update(s).digest("hex");
const text = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");

/** The application form → a clean doc, or the name of the first bad field. */
export function cleanApplication(b) {
  const alias = text(b?.alias, 40);
  if (alias.length < 1) return { error: "alias" };
  const ig = text(b?.ig, 31).replace(/^@/, "");
  if (!IG.test(ig)) return { error: "ig" };
  const email = text(b?.email, 254).toLowerCase();
  if (!EMAIL.test(email)) return { error: "email" };
  const disciplines = Array.isArray(b?.disciplines) ? [...new Set(b.disciplines.filter((d) => DISCIPLINES.includes(d)))] : [];
  if (!disciplines.length) return { error: "disciplines" };
  const links = [];
  for (const l of Array.isArray(b?.links) ? b.links.slice(0, 3) : []) {
    const s = text(l, 300);
    if (!s) continue;
    try {
      const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return { error: "links" };
      links.push(u.toString());
    } catch {
      return { error: "links" };
    }
  }
  const one_liner = text(b?.one_liner, 200);
  if (one_liner.length < 3) return { error: "one_liner" };
  const country = text(b?.country, 56);
  if (!country) return { error: "country" };
  if (b?.terms !== true) return { error: "terms" };
  // ?ref= is usually an Instagram handle (dots allowed)
  const refRaw = typeof b?.ref === "string" ? b.ref.trim().replace(/^@/, "") : "";
  const ref = IG.test(refRaw) || CODE.test(refRaw) ? refRaw : null;
  const invite_code = typeof b?.invite === "string" && CODE.test(b.invite) ? b.invite : null;
  return { doc: { alias, ig_handle: ig, email, disciplines, links, one_liner, country, ref, invite_code } };
}

export function mountArchitects(app, { db, auth, accounts, limiter, SITE }) {
  const applyLimited = limiter(5, 60 * 60_000); // 5 applications / hour / IP
  const linkLimited = limiter(5, 15 * 60_000);
  app.use("/api/architects", express.json({ limit: "8kb" }));
  const json = (await_) => async (req, res, next) => {
    try {
      await await_(req, res);
    } catch (e) {
      next(e);
    }
  };

  app.get(
    "/api/architects/count",
    json(async (_req, res) => {
      res.set("Cache-Control", "public, max-age=30");
      res.json({ ok: true, claimed: Math.min(FOUNDING, await db.rooms.count({ status: { $in: CLAIMED } })), of: FOUNDING });
    })
  );

  app.post(
    "/api/architects/apply",
    json(async (req, res) => {
      if (applyLimited(req.ip)) return res.status(429).json({ ok: false, error: "slow down" });
      const { doc, error } = cleanApplication(req.body);
      if (error) return res.status(400).json({ ok: false, error });

      // already signed in (e.g. a labyrinth account): attach the application to it
      let me = await auth(req);
      let nickLower = me?.acc.nickLower ?? null;
      if (!nickLower) {
        // this email already answered: never hand out its session to whoever typed it, send a link instead
        if (await db.apps.findOne({ email: doc.email })) {
          await sendLink(doc.email);
          return res.status(409).json({ ok: false, error: "exists" });
        }
        const nick = await accounts.freeNick(doc.alias);
        const now = new Date();
        const acc = { nick, nickLower: nick.toLowerCase(), salt: null, hash: null, email: doc.email, consent: false, consentText: null, progress: accounts.cleanProgress(null), created: now, lastSeen: now, architect: true };
        if (!(await accounts.create(acc))) return res.status(409).json({ ok: false, error: "try again" });
        nickLower = acc.nickLower;
      }
      let room = await db.rooms.findOne({ owner_id: nickLower });
      if (!(await db.apps.findOne({ user_id: nickLower }))) {
        await db.apps.insert({ id: newId(), user_id: nickLower, ...doc, terms_accepted_at: new Date(), status: "pending", created_at: new Date() });
      }
      if (!room) {
        room = { id: newId(), owner_id: nickLower, blueprint: emptyBlueprint(), status: "draft", stage: "arrival", created_at: new Date(), submitted_at: null, approved_at: null, admin_note: null, usage: { day: "", n: 0 } };
        await db.rooms.insert(room);
      }
      const token = me?.token ?? (await accounts.newSession(nickLower));
      res.json({ ok: true, token, room: room.id });
    })
  );

  async function sendLink(email) {
    const app_ = await db.apps.findOne({ email });
    if (!app_) return;
    const code = randomBytes(24).toString("hex");
    await db.links.insert({ hash: sha(code), user_id: app_.user_id, at: new Date() });
    await sendMail({
      to: email,
      subject: "your way back into the chamber",
      text: `${app_.alias},\n\nthe chamber kept your room. this link opens it (it works once, for 20 minutes):\n\n${SITE}/chamber/#code=${code}\n\nif you didn't ask for it, ignore this email.\n\nseeface`,
    });
  }

  app.post(
    "/api/architects/link",
    json(async (req, res) => {
      if (linkLimited(req.ip)) return res.status(429).json({ ok: false, error: "slow down" });
      const email = text(req.body?.email, 254).toLowerCase();
      if (EMAIL.test(email)) await sendLink(email);
      res.json({ ok: true }); // same answer either way: this must not reveal who applied
    })
  );

  app.post(
    "/api/architects/redeem",
    json(async (req, res) => {
      if (linkLimited(req.ip)) return res.status(429).json({ ok: false, error: "slow down" });
      const code = typeof req.body?.code === "string" && /^[0-9a-f]{48}$/.test(req.body.code) ? req.body.code : null;
      const link = code ? await db.links.findOne({ hash: sha(code) }) : null;
      if (!link || Date.now() - new Date(link.at).getTime() > 20 * 60_000) return res.status(401).json({ ok: false, error: "expired" });
      await db.links.remove({ hash: link.hash }); // once only
      res.json({ ok: true, token: await accounts.newSession(link.user_id) });
    })
  );
}

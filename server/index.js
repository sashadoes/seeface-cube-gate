// seeface1 API: stores labyrinth sign-ups in MongoDB.
//   POST /api/players  { nick, email?, consent, ref? }  → { ok: true }
//   POST /api/forget   { email }                        → deletes that person (GDPR "right to erasure")
//   GET  /api/health
//
// MONGODB_URI   MongoDB Atlas (or any Mongo) connection string. If it's missing,
//               sign-ups go to ./data/players.jsonl so the game can be tested locally.
// ALLOWED_ORIGINS comma-separated list of sites allowed to call the API.
// PORT          default 8787
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const ORIGINS = (process.env.ALLOWED_ORIGINS || "https://seeface1.world,http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ------------------------------------------------------------------ storage
let players = null; // Mongo collection, or null = local file
if (process.env.MONGODB_URI) {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  players = client.db(process.env.MONGODB_DB || "seeface1").collection("players");
  await players.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
  await players.createIndex({ nick: 1 });
  console.log("storage: MongoDB");
} else {
  await mkdir("data", { recursive: true });
  console.log("storage: data/players.jsonl (set MONGODB_URI to use MongoDB)");
}

async function save(doc) {
  if (players) {
    if (doc.email) {
      await players.updateOne(
        { email: doc.email },
        { $set: { nick: doc.nick, consent: doc.consent, consentText: doc.consentText, lastSeen: doc.at }, $setOnInsert: { firstSeen: doc.at, ref: doc.ref }, $inc: { visits: 1 } },
        { upsert: true }
      );
    } else {
      await players.insertOne({ nick: doc.nick, consent: false, firstSeen: doc.at, lastSeen: doc.at, ref: doc.ref, visits: 1 });
    }
  } else {
    await appendFile("data/players.jsonl", JSON.stringify(doc) + "\n");
  }
}

async function forget(email) {
  if (players) return (await players.deleteMany({ email })).deletedCount;
  let lines = [];
  try {
    lines = (await readFile("data/players.jsonl", "utf8")).split("\n").filter(Boolean);
  } catch {
    return 0;
  }
  const keep = lines.filter((l) => JSON.parse(l).email !== email);
  await writeFile("data/players.jsonl", keep.join("\n") + (keep.length ? "\n" : ""));
  return lines.length - keep.length;
}

// ------------------------------------------------------------------ validation
const NICK = /^[\p{L}\p{N}_.]{2,16}$/u;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const REF = /^[\w-]{1,40}$/;
const CONSENT_TEXT = "send me news from seeface1 (unsubscribe any time)";

// tiny per-IP rate limit: 8 requests / minute (spam and bots)
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 8;
}
setInterval(() => hits.clear(), 10 * 60_000).unref();

// ------------------------------------------------------------------ app
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "2kb" }));
app.use(
  cors({
    origin: (origin, cb) => {
      // allow the live site, localhost and same-Wi-Fi testing (192.168.x.x)
      const ok = !origin || ORIGINS.includes(origin) || /^http:\/\/192\.168\.\d+\.\d+:5173$/.test(origin);
      cb(null, ok);
    },
  })
);

app.get("/api/health", (_req, res) => res.json({ ok: true, storage: players ? "mongodb" : "file" }));

app.post("/api/players", async (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ ok: false, error: "slow down" });
  const { nick, email, consent, ref } = req.body || {};
  if (typeof nick !== "string" || !NICK.test(nick)) return res.status(400).json({ ok: false, error: "nick" });
  let cleanEmail = null;
  if (email !== undefined && email !== null && email !== "") {
    if (typeof email !== "string" || !EMAIL.test(email.trim())) return res.status(400).json({ ok: false, error: "email" });
    cleanEmail = email.trim().toLowerCase();
  }
  const doc = {
    nick,
    email: cleanEmail,
    // marketing consent only counts if they ticked the box AND gave an email
    consent: Boolean(cleanEmail && consent === true),
    consentText: cleanEmail && consent === true ? CONSENT_TEXT : null,
    ref: typeof ref === "string" && REF.test(ref) ? ref : null,
    // no raw IPs stored: a salted hash is enough to spot spam waves
    ipHash: createHash("sha256").update(`${process.env.IP_SALT || "seeface1"}:${req.ip}`).digest("hex").slice(0, 16),
    at: new Date(),
  };
  try {
    await save(doc);
    res.json({ ok: true });
  } catch (e) {
    console.error("save failed", e.message);
    res.status(500).json({ ok: false });
  }
});

app.post("/api/forget", async (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ ok: false });
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) return res.status(400).json({ ok: false });
  const n = await forget(email);
  res.json({ ok: true, deleted: n });
});

app.listen(PORT, () => console.log(`seeface1 api on :${PORT}`));

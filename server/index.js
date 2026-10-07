// seeface1 API: stores labyrinth sign-ups in MongoDB.
//   POST /api/players  { nick, email?, consent, ref? }  → { ok: true }
//   POST /api/forget   { email }                        → deletes that person (GDPR "right to erasure")
//   POST /api/register { nick, password, email?, consent?, progress } → { token, account }
//   POST /api/login    { nick, password }                → { token, account }
//   GET  /api/me                      (Authorization: Bearer <token>) → { account }
//   PUT  /api/progress { progress }    (auth) → { account }   (merged: best of both)
//   POST /api/logout                   (auth)
//   POST /api/account/delete { password } (auth) → deletes the account and its sessions
//   GET  /api/health
//   GET  /api/stats  (header x-admin-key: ADMIN_KEY) → active players, retention, sources
//
// MONGODB_URI   MongoDB Atlas (or any Mongo) connection string. If it's missing,
//               sign-ups go to ./data/players.jsonl so the game can be tested locally.
// ALLOWED_ORIGINS comma-separated list of sites allowed to call the API.
// ADMIN_KEY     secret for GET /api/stats (no key set = stats disabled)
// PORT          default 8787
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

const PORT = Number(process.env.PORT || 8787);
const ORIGINS = (process.env.ALLOWED_ORIGINS || "https://seeface1.world,http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ------------------------------------------------------------------ storage
let players = null; // Mongo collection, or null = local file
let accounts = null; // Mongo collections for accounts + sessions
let sessions = null;
if (process.env.MONGODB_URI) {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  players = client.db(process.env.MONGODB_DB || "seeface1").collection("players");
  await players.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
  await players.createIndex({ nick: 1 });
  accounts = client.db(process.env.MONGODB_DB || "seeface1").collection("accounts");
  sessions = client.db(process.env.MONGODB_DB || "seeface1").collection("sessions");
  await accounts.createIndex({ nickLower: 1 }, { unique: true });
  await sessions.createIndex({ tokenHash: 1 }, { unique: true });
  await sessions.createIndex({ at: 1 }, { expireAfterSeconds: 180 * 24 * 3600 }); // sessions last 180 days
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

// ------------------------------------------------------------------ accounts storage
// local fallback: data/accounts.json  { accounts: { nickLower: doc }, sessions: { tokenHash: { nickLower, at } } }
let fileDb = null;
async function db() {
  if (fileDb) return fileDb;
  try {
    fileDb = JSON.parse(await readFile("data/accounts.json", "utf8"));
  } catch {
    fileDb = { accounts: {}, sessions: {} };
  }
  return fileDb;
}
const saveDb = () => writeFile("data/accounts.json", JSON.stringify(fileDb, null, 1));

const store = {
  async getAccount(nickLower) {
    if (accounts) return accounts.findOne({ nickLower });
    return (await db()).accounts[nickLower] ?? null;
  },
  async createAccount(doc) {
    if (accounts) {
      try {
        await accounts.insertOne(doc);
        return true;
      } catch (e) {
        if (e.code === 11000) return false; // nickname taken
        throw e;
      }
    }
    const d = await db();
    if (d.accounts[doc.nickLower]) return false;
    d.accounts[doc.nickLower] = doc;
    await saveDb();
    return true;
  },
  async updateAccount(nickLower, set) {
    if (accounts) return accounts.updateOne({ nickLower }, { $set: set });
    const d = await db();
    Object.assign(d.accounts[nickLower], set);
    await saveDb();
  },
  async deleteAccount(nickLower) {
    if (accounts) {
      await accounts.deleteOne({ nickLower });
      await sessions.deleteMany({ nickLower });
      return;
    }
    const d = await db();
    delete d.accounts[nickLower];
    for (const [k, v] of Object.entries(d.sessions)) if (v.nickLower === nickLower) delete d.sessions[k];
    await saveDb();
  },
  async newSession(nickLower) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = sha(token);
    if (sessions) await sessions.insertOne({ tokenHash, nickLower, at: new Date() });
    else {
      (await db()).sessions[tokenHash] = { nickLower, at: Date.now() };
      await saveDb();
    }
    return token;
  },
  async sessionNick(token) {
    const tokenHash = sha(token);
    if (sessions) return (await sessions.findOne({ tokenHash }))?.nickLower ?? null;
    return (await db()).sessions[tokenHash]?.nickLower ?? null;
  },
  async endSession(token) {
    const tokenHash = sha(token);
    if (sessions) await sessions.deleteOne({ tokenHash });
    else {
      delete (await db()).sessions[tokenHash];
      await saveDb();
    }
  },
};

const sha = (s) => createHash("sha256").update(s).digest("hex");

async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const key = await scrypt(password, salt, 64);
  return { salt, hash: key.toString("hex") };
}
async function checkPassword(password, acc) {
  const { hash } = await hashPassword(password, acc.salt);
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(acc.hash, "hex"));
}

// progress: numbers only, sane limits, levels 1–3
function cleanProgress(p) {
  const n = (v, max) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
  const src = p && typeof p === "object" ? p : {};
  return {
    blood: n(src.blood, 1_000_000),
    best: n(src.best, 10_000_000),
    metres: n(src.metres, 1_000_000_000),
    runs: n(src.runs, 10_000_000),
    levels: Array.isArray(src.levels) ? [...new Set(src.levels.filter((l) => [1, 2, 3].includes(l)))].sort() : [],
  };
}
// two copies of progress (this device + the account) → the best of both
function mergeProgress(a, b) {
  return {
    blood: Math.max(a.blood, b.blood),
    best: Math.max(a.best, b.best),
    metres: Math.max(a.metres, b.metres),
    runs: Math.max(a.runs, b.runs),
    levels: [...new Set([...a.levels, ...b.levels])].sort(),
  };
}
const publicAccount = (a) => ({ nick: a.nick, email: a.email ?? null, progress: a.progress, created: a.created });

// ------------------------------------------------------------------ validation
const NICK = /^[\p{L}\p{N}_.]{2,16}$/u;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const REF = /^[\w-]{1,40}$/;
const CONSENT_TEXT = "send me news from seeface1 (unsubscribe any time)";

// tiny per-IP rate limit: 30 requests / minute (spam and bots)
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 30;
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

// ------------------------------------------------------------------ accounts
const PASSWORD_MIN = 6;
// stricter limit for password guesses: 10 tries per 10 minutes per IP
const tries = new Map();
function tooManyTries(ip) {
  const now = Date.now();
  const recent = (tries.get(ip) || []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  tries.set(ip, recent);
  return recent.length > 10;
}
async function auth(req) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(req.get("authorization") || "");
  if (!m) return null;
  const nickLower = await store.sessionNick(m[1]);
  if (!nickLower) return null;
  const acc = await store.getAccount(nickLower);
  return acc ? { acc, token: m[1] } : null;
}

app.post("/api/register", async (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ ok: false, error: "slow down" });
  const { nick, password, email, consent, progress } = req.body || {};
  if (typeof nick !== "string" || !NICK.test(nick)) return res.status(400).json({ ok: false, error: "nick" });
  if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > 200) return res.status(400).json({ ok: false, error: "password" });
  let cleanEmail = null;
  if (email) {
    if (typeof email !== "string" || !EMAIL.test(email.trim())) return res.status(400).json({ ok: false, error: "email" });
    cleanEmail = email.trim().toLowerCase();
  }
  const { salt, hash } = await hashPassword(password);
  const now = new Date();
  const doc = {
    nick,
    nickLower: nick.toLowerCase(),
    salt,
    hash,
    email: cleanEmail,
    consent: Boolean(cleanEmail && consent === true),
    consentText: cleanEmail && consent === true ? CONSENT_TEXT : null,
    progress: cleanProgress(progress),
    created: now,
    lastSeen: now,
  };
  try {
    if (!(await store.createAccount(doc))) return res.status(409).json({ ok: false, error: "taken" });
    const token = await store.newSession(doc.nickLower);
    res.json({ ok: true, token, account: publicAccount(doc) });
  } catch (e) {
    console.error("register failed", e.message);
    res.status(500).json({ ok: false });
  }
});

app.post("/api/login", async (req, res) => {
  if (tooManyTries(req.ip)) return res.status(429).json({ ok: false, error: "slow down" });
  const { nick, password } = req.body || {};
  if (typeof nick !== "string" || typeof password !== "string" || password.length > 200) return res.status(400).json({ ok: false, error: "wrong" });
  const acc = await store.getAccount(nick.toLowerCase());
  // same answer for "no such name" and "wrong password"
  if (!acc || !(await checkPassword(password, acc))) return res.status(401).json({ ok: false, error: "wrong" });
  await store.updateAccount(acc.nickLower, { lastSeen: new Date() });
  const token = await store.newSession(acc.nickLower);
  res.json({ ok: true, token, account: publicAccount(acc) });
});

app.get("/api/me", async (req, res) => {
  const a = await auth(req);
  if (!a) return res.status(401).json({ ok: false });
  store.updateAccount(a.acc.nickLower, { lastSeen: new Date() }).catch(() => {}); // counts as active today
  res.json({ ok: true, account: publicAccount(a.acc) });
});

app.put("/api/progress", async (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ ok: false });
  const a = await auth(req);
  if (!a) return res.status(401).json({ ok: false });
  const progress = mergeProgress(cleanProgress(a.acc.progress), cleanProgress(req.body?.progress));
  // ◈ can go down (wishes, deaths): this device's number wins for ◈
  progress.blood = cleanProgress(req.body?.progress).blood;
  await store.updateAccount(a.acc.nickLower, { progress, lastSeen: new Date() });
  res.json({ ok: true, account: publicAccount({ ...a.acc, progress }) });
});

app.post("/api/logout", async (req, res) => {
  const a = await auth(req);
  if (a) await store.endSession(a.token);
  res.json({ ok: true });
});

app.post("/api/account/delete", async (req, res) => {
  if (tooManyTries(req.ip)) return res.status(429).json({ ok: false });
  const a = await auth(req);
  if (!a) return res.status(401).json({ ok: false });
  if (typeof req.body?.password !== "string" || !(await checkPassword(req.body.password, a.acc))) return res.status(401).json({ ok: false, error: "wrong" });
  await store.deleteAccount(a.acc.nickLower);
  res.json({ ok: true });
});

app.post("/api/forget", async (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ ok: false });
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) return res.status(400).json({ ok: false });
  const n = await forget(email);
  res.json({ ok: true, deleted: n });
});


// ------------------------------------------------------------------ stats (owner only)
// Who is actually coming back. Accounts: created → lastSeen. Sign-ups: firstSeen → lastSeen + ref.
const DAY = 86_400_000;
async function allDocs(kind) {
  if (kind === "accounts") {
    if (accounts) return accounts.find({}, { projection: { created: 1, lastSeen: 1 } }).toArray();
    return Object.values((await db()).accounts);
  }
  if (players) return players.find({}, { projection: { firstSeen: 1, lastSeen: 1, ref: 1, consent: 1 } }).toArray();
  try {
    return (await readFile("data/players.jsonl", "utf8")).split("\n").filter(Boolean).map((l) => {
      const d = JSON.parse(l);
      return { firstSeen: d.at, lastSeen: d.at, ref: d.ref, consent: d.consent };
    });
  } catch {
    return [];
  }
}
function summarise(docs, startKey) {
  const now = Date.now();
  const t = (v) => (v ? new Date(v).getTime() : 0);
  const active = (days) => docs.filter((d) => now - t(d.lastSeen) < days * DAY).length;
  // cohort retention: of those who started ≥N days ago, how many were seen N+ days after starting
  const kept = (n) => {
    const cohort = docs.filter((d) => now - t(d[startKey]) >= n * DAY);
    const back = cohort.filter((d) => t(d.lastSeen) - t(d[startKey]) >= n * DAY).length;
    return { cohort: cohort.length, back, pct: cohort.length ? Math.round((back / cohort.length) * 1000) / 10 : null };
  };
  return {
    total: docs.length,
    new_today: docs.filter((d) => now - t(d[startKey]) < DAY).length,
    new_7d: docs.filter((d) => now - t(d[startKey]) < 7 * DAY).length,
    active_1d: active(1),
    active_7d: active(7),
    active_30d: active(30),
    retained_d1: kept(1),
    retained_d7: kept(7),
    retained_d30: kept(30),
  };
}
app.get("/api/stats", async (req, res) => {
  const key = process.env.ADMIN_KEY;
  const given = req.get("x-admin-key") || "";
  if (!key || given.length !== key.length || !timingSafeEqual(Buffer.from(given), Buffer.from(key))) return res.status(404).end();
  try {
    const acc = await allDocs("accounts");
    const ply = await allDocs("players");
    const sources = {};
    for (const p of ply) sources[p.ref || "direct"] = (sources[p.ref || "direct"] || 0) + 1;
    res.json({
      ok: true,
      at: new Date(),
      accounts: summarise(acc, "created"),
      signups: { ...summarise(ply, "firstSeen"), with_email_consent: ply.filter((p) => p.consent).length, sources },
    });
  } catch (e) {
    console.error("stats failed", e.message);
    res.status(500).json({ ok: false });
  }
});

app.listen(PORT, () => console.log(`seeface1 api on :${PORT}`));

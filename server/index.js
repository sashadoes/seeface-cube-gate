// seeface1 API: stores labyrinth sign-ups in MongoDB.
//   POST /api/players  { nick, email?, consent, ref? }  → { ok: true }
//   POST /api/forget   { email }                        → deletes that person (GDPR "right to erasure"); always { ok: true }
//   POST /api/register { nick, password, email?, consent?, progress } → { token, account }
//   POST /api/login    { nick, password }                → { token, account }
//   GET  /api/me                      (Authorization: Bearer <token>) → { account }
//   PUT  /api/progress { progress }    (auth) → { account }   (merged: best of both)
//   POST /api/logout                   (auth)
//   POST /api/account/delete { password } (auth) → deletes the account and its sessions
//   GET  /api/instagram/start     → sends the player to Instagram
//   GET  /api/instagram/callback  ← Instagram sends them back; we make/find their
//                                   account and hand the game a session token
//   GET  /api/health
//   GET  /api/stats  (header x-admin-key: ADMIN_KEY) → active players, retention, sources
//   POST /api/feedback { stars, text?, ig?, nick?, lang?, minutes? } → { ok: true }
//   GET  /api/feedback (header x-admin-key: ADMIN_KEY) → { count, avg, items } newest first
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
import { npcReady, talk } from "./npc/talk.mjs";

const scrypt = promisify(scryptCb);

const PORT = Number(process.env.PORT || 8787);
// Instagram login (optional): set these and the button appears in the game.
// IG_APP_ID / IG_APP_SECRET come from the Meta app; IG_REDIRECT must match the
// redirect URI you register there, e.g. https://api.seeface1.world/api/instagram/callback
const IG = { id: process.env.IG_APP_ID || "", secret: process.env.IG_APP_SECRET || "", redirect: process.env.IG_REDIRECT || "" };
const SITE = process.env.SITE_URL || "https://seeface1.world";
const ORIGINS = (process.env.ALLOWED_ORIGINS || "https://seeface1.world,http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ------------------------------------------------------------------ storage
let players = null; // Mongo collection, or null = local file
let accounts = null; // Mongo collections for accounts + sessions
let sessions = null;
let feedbackCol = null; // Mongo collection for feedback, or null = data/feedback.jsonl
if (process.env.MONGODB_URI) {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  players = client.db(process.env.MONGODB_DB || "seeface1").collection("players");
  await players.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
  await players.createIndex({ nick: 1 });
  accounts = client.db(process.env.MONGODB_DB || "seeface1").collection("accounts");
  sessions = client.db(process.env.MONGODB_DB || "seeface1").collection("sessions");
  await accounts.createIndex({ nickLower: 1 }, { unique: true });
  await accounts.createIndex({ ig: 1 }, { unique: true, partialFilterExpression: { ig: { $type: "string" } } });
  await sessions.createIndex({ tokenHash: 1 }, { unique: true });
  await sessions.createIndex({ at: 1 }, { expireAfterSeconds: 180 * 24 * 3600 }); // sessions last 180 days
  feedbackCol = client.db(process.env.MONGODB_DB || "seeface1").collection("feedback");
  await feedbackCol.createIndex({ at: -1 });
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
  async accountByIg(ig) {
    if (accounts) return accounts.findOne({ ig });
    const d = await db();
    return Object.values(d.accounts).find((a) => a.ig === ig) ?? null;
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
const publicAccount = (a) => ({ nick: a.nick, email: a.email ?? null, progress: a.progress, created: a.created, instagram: a.igName ?? null });

// ------------------------------------------------------------------ validation
const NICK = /^[\p{L}\p{N}_.]{2,16}$/u;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const REF = /^[\w-]{1,40}$/;
const CONSENT_TEXT = "send me news from seeface1 (unsubscribe any time)";

// tiny in-memory rate limits: `max` hits per `windowMs` per key
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now - v[v.length - 1] > windowMs) hits.delete(k);
  }, 60_000).unref();
  return (key) => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    return recent.length > max;
  };
}
// 30 requests / minute per IP (spam and bots)
const limited = limiter(30, 60_000);

// ------------------------------------------------------------------ app
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
// same-Wi-Fi testing (192.168.x.x) only while ALLOWED_ORIGINS isn't set, i.e. never on Render
const LAN_OK = !process.env.ALLOWED_ORIGINS;
app.use((_req, res, next) => {
  // API answers carry session tokens: never cache them, never frame or sniff them
  res.set({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  });
  next();
});
// the characters' route carries a short conversation, so it gets a bigger body limit
const json2kb = express.json({ limit: "2kb" });
app.use((req, res, next) => (req.path === "/api/npc/talk" ? next() : json2kb(req, res, next)));
app.use(
  cors({
    origin: (origin, cb) => {
      const ok = !origin || ORIGINS.includes(origin) || (LAN_OK && /^http:\/\/192\.168\.\d+\.\d+:5173$/.test(origin));
      cb(null, ok);
    },
  })
);

app.get("/api/health", (_req, res) => res.json({ ok: true, storage: players ? "mongodb" : "file", instagram: igReady(), npc: npcReady() }));

// ------------------------------------------------------------------ the labyrinth's characters (◇, written by Claude)
// 12 lines / minute per IP; NPC_DAILY_CAP caps the whole day (see npc/talk.mjs)
const npcLimited = limiter(12, 60_000);
app.post("/api/npc/talk", express.json({ limit: "8kb" }), async (req, res, next) => {
  if (npcLimited(req.ip)) return res.status(429).json({ ok: false, error: "slow down" });
  try {
    const { status, data } = await talk(req.body);
    res.status(status).json(data);
  } catch (err) {
    next(err);
  }
});

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
// stricter limits for password guesses: 10 tries / 10 min per IP, and 20 / 10 min per
// account so a botnet can't spread guesses at one name across many IPs
const tooManyTries = limiter(10, 10 * 60_000);
const tooManyTriesOn = limiter(20, 10 * 60_000);
// unknown names still pay for one scrypt, so the answer time doesn't reveal who exists
const DUMMY = await hashPassword(randomBytes(16).toString("hex"));
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
  if (typeof nick !== "string" || !NICK.test(nick) || typeof password !== "string" || password.length > 200) return res.status(400).json({ ok: false, error: "wrong" });
  if (tooManyTriesOn(nick.toLowerCase())) return res.status(429).json({ ok: false, error: "slow down" });
  const acc = await store.getAccount(nick.toLowerCase());
  // same answer (and about the same time) for "no such name" and "wrong password"
  const ok = await checkPassword(password, acc?.hash ? acc : DUMMY);
  if (!acc || !acc.hash || !ok) return res.status(401).json({ ok: false, error: "wrong" });
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
  // an instagram account has no password: ask them to confirm their nickname instead
  const ok = a.acc.hash ? typeof req.body?.password === "string" && (await checkPassword(req.body.password, a.acc)) : req.body?.password === a.acc.nick;
  if (!ok) return res.status(401).json({ ok: false, error: "wrong" });
  await store.deleteAccount(a.acc.nickLower);
  if (a.acc.email) await forget(a.acc.email); // their news sign-up goes too
  res.json({ ok: true });
});

// ------------------------------------------------------------------ instagram login
const igReady = () => Boolean(IG.id && IG.secret && IG.redirect);
// short-lived states, so a callback can't be replayed from somewhere else
const igStates = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of igStates) if (now - v > 10 * 60_000) igStates.delete(k);
}, 60_000).unref();

app.get("/api/instagram/start", (req, res) => {
  if (!igReady()) return res.status(503).json({ ok: false, error: "not configured" });
  const state = randomBytes(16).toString("hex");
  igStates.set(state, Date.now());
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("client_id", IG.id);
  u.searchParams.set("redirect_uri", IG.redirect);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "instagram_business_basic");
  u.searchParams.set("state", state);
  res.redirect(u.toString());
});

/** instagram username → a nickname this game accepts, and free */
async function nickFromIg(username) {
  let base = String(username || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_.]/gu, "")
    .slice(0, 16);
  if (base.length < 2) base = "face_" + Math.floor(1000 + Math.random() * 9000);
  for (let k = 0; k < 20; k++) {
    const tryNick = k === 0 ? base : `${base.slice(0, 13)}_${k}`;
    if (!(await store.getAccount(tryNick.toLowerCase()))) return tryNick;
  }
  return "face_" + Math.floor(1000 + Math.random() * 9000);
}

app.get("/api/instagram/callback", async (req, res) => {
  const back = (q) => res.redirect(`${SITE}/labyrinth/${q}`);
  if (!igReady()) return back("?ig=off");
  const { code, state, error } = req.query;
  if (error || !code) return back("?ig=cancelled");
  if (!state || !igStates.delete(state)) return back("?ig=expired");
  try {
    // 1. the code becomes a token
    const form = new URLSearchParams({ client_id: IG.id, client_secret: IG.secret, grant_type: "authorization_code", redirect_uri: IG.redirect, code: String(code) });
    const tokRes = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form, signal: AbortSignal.timeout(10_000) });
    const tok = await tokRes.json();
    if (!tok.access_token) throw new Error(tok.error_message || "no token");
    // 2. who they are (we keep only their instagram id and username)
    const meRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=id,username&access_token=${encodeURIComponent(tok.access_token)}`, { signal: AbortSignal.timeout(10_000) });
    const me = await meRes.json();
    if (!me.id) throw new Error("no profile");
    const ig = String(me.id);
    // 3. their account: the one linked to this instagram, or a new one
    let acc = await store.accountByIg(ig);
    if (!acc) {
      const nick = await nickFromIg(me.username);
      const now = new Date();
      acc = { nick, nickLower: nick.toLowerCase(), salt: null, hash: null, ig, igName: String(me.username || "").slice(0, 40), email: null, consent: false, consentText: null, progress: cleanProgress(null), created: now, lastSeen: now };
      if (!(await store.createAccount(acc))) return back("?ig=taken");
    } else await store.updateAccount(acc.nickLower, { lastSeen: new Date(), igName: String(me.username || "").slice(0, 40) });
    const token = await store.newSession(acc.nickLower);
    // the game reads the token from the address and wipes it from the bar
    back(`?ig=ok#token=${token}`);
  } catch (e) {
    console.error("instagram login failed", e.message);
    back("?ig=failed");
  }
});

app.post("/api/forget", async (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ ok: false });
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) return res.status(400).json({ ok: false });
  await forget(email);
  // same answer whether or not we had it: this endpoint must not tell anyone who signed up
  res.json({ ok: true });
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
/** the owner's requests carry x-admin-key = ADMIN_KEY (no key set = owner routes off) */
function isOwner(req) {
  const key = process.env.ADMIN_KEY;
  // compare fixed-length hashes so neither the key nor its length leaks through timing
  const given = createHash("sha256").update(req.get("x-admin-key") || "").digest();
  return Boolean(key) && timingSafeEqual(given, createHash("sha256").update(key).digest());
}
app.get("/api/stats", async (req, res) => {
  if (!isOwner(req)) return res.status(404).end();
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

// ------------------------------------------------------------------ feedback (asked once, after 15 min of play)
// Only the owner reads it. No IPs, no emails: stars, one answer, and an optional
// Instagram handle the player typed themselves.
const IG_HANDLE = /^[a-z0-9._]{1,30}$/;
const feedbackLimited = limiter(5, 60 * 60_000); // 5 / hour per IP
app.post("/api/feedback", async (req, res) => {
  if (feedbackLimited(req.ip)) return res.status(429).json({ ok: false, error: "slow down" });
  const { stars, text, ig, nick, lang, minutes } = req.body || {};
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return res.status(400).json({ ok: false, error: "stars" });
  const handle = typeof ig === "string" ? ig.trim().replace(/^@/, "").toLowerCase() : "";
  if (handle && !IG_HANDLE.test(handle)) return res.status(400).json({ ok: false, error: "ig" });
  const doc = {
    stars,
    text: typeof text === "string" ? text.trim().slice(0, 600) : "",
    ig: handle || null,
    nick: typeof nick === "string" && NICK.test(nick) ? nick : null,
    lang: typeof lang === "string" && /^[a-z]{2}$/.test(lang) ? lang : null,
    minutes: Number.isFinite(minutes) ? Math.max(0, Math.min(100_000, Math.round(minutes))) : null,
    at: new Date(),
  };
  try {
    if (feedbackCol) await feedbackCol.insertOne(doc);
    else await appendFile("data/feedback.jsonl", JSON.stringify(doc) + "\n");
    res.json({ ok: true });
  } catch (e) {
    console.error("feedback failed", e.message);
    res.status(500).json({ ok: false });
  }
});
app.get("/api/feedback", async (req, res) => {
  if (!isOwner(req)) return res.status(404).end();
  try {
    let items;
    if (feedbackCol) items = await feedbackCol.find({}, { projection: { _id: 0 } }).sort({ at: -1 }).limit(500).toArray();
    else {
      try {
        items = (await readFile("data/feedback.jsonl", "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l)).reverse().slice(0, 500);
      } catch {
        items = [];
      }
    }
    const avg = items.length ? Math.round((items.reduce((s, f) => s + f.stars, 0) / items.length) * 10) / 10 : null;
    res.json({ ok: true, count: items.length, avg, items });
  } catch (e) {
    console.error("feedback list failed", e.message);
    res.status(500).json({ ok: false });
  }
});

// unknown routes and any error (bad JSON, too big, a crash in a handler): short JSON, never a stack trace
app.use((_req, res) => res.status(404).json({ ok: false }));
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error("request failed", err.message);
  res.status(status < 500 ? status : 500).json({ ok: false });
});

app.listen(PORT, () => console.log(`seeface1 api on :${PORT}`));

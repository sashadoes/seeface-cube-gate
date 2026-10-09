// Coins beyond the basics: owning a room (500), decor, invites that drop friends straight in,
// gifts to people in your room, referral rewards, and coin packs via Stripe (TEST MODE ONLY; live
// keys are refused, going live needs Sasha). Every coin movement goes through the shared ledger.
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Store, User } from "./store.ts";
import type { ServerMsg } from "../../shared/world/protocol.ts";
import { chunkAt, placeById, roomGeometry, withBounds, type RoomPlace } from "../../shared/world/maze.ts";
import { DECOR, EARN, GIFTS, PACKS, PRICES, balance, gift, type Reason } from "../../shared/world/ledger.ts";
import { filterMark } from "../../src/marks/filter.ts";
import { PROD, verifyUser } from "./adapters.ts";

type S = { id: string; user: User; room: string | null; x: number; z: number; fallUntil: number };
type Deps<T extends S> = {
  store: Store;
  sessions: Map<string, T>;
  credit: (s: T | null, user: string, delta: number, reason: Reason, key: string) => { ok: boolean; balance: number; error?: string };
  send: (s: T, m: ServerMsg) => unknown;
  ownedRoomState: (id: string) => unknown;
};

type EconomyMsg =
  | { t: "buyRoom" }
  | { t: "roomEdit"; name?: string; topic?: string; public?: boolean }
  | { t: "decorBuy"; kind: string }
  | { t: "decorMove"; index: number; x: number; z: number; rot: number }
  | { t: "decorRemove"; index: number }
  | { t: "invite"; code: string }
  | { t: "gift"; to: string; gift: string; key: string }
  | { t: "myRoom" };

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK = process.env.STRIPE_WEBHOOK_SECRET ?? "";
if (STRIPE_KEY.startsWith("sk_live")) throw new Error("live Stripe keys are refused: going live with real payments needs Sasha (SETUP.md)");
const SITE = process.env.SITE_URL ?? "http://localhost:5173";

export function createEconomy<T extends S>({ store, sessions, credit, send, ownedRoomState }: Deps<T>) {
  const myRoomOf = (user: string) => Object.values(store.data.ownedRooms).find((r) => r.owner === user) ?? null;
  const roomMsg = (s: T) => send(s, { t: "myRoom", room: myRoomOf(s.id) });

  const placeOf = (plotId: string): RoomPlace | null => (plotId.startsWith("plot:") ? placeById(plotId) : null);

  /** the nearest unclaimed plot to the entrance (rings outward from the curated 3×3) */
  function freePlot(): string | null {
    for (let ring = 2; ring < 12; ring++)
      for (let cz = -ring; cz <= ring; cz++)
        for (let cx = -ring; cx <= ring; cx++) {
          if (Math.max(Math.abs(cx), Math.abs(cz)) !== ring) continue;
          const p = chunkAt(cx, cz).rooms.find((r) => r.id.startsWith("plot:"));
          if (p && !store.data.ownedRooms[p.id]) return p.id;
        }
    return null;
  }

  function clampToRoom(plotId: string, x: number, z: number) {
    const p = placeOf(plotId);
    if (!p) return null;
    const b = withBounds(p).bounds;
    const m = 0.8;
    return { x: Math.max(b.x0 + m, Math.min(b.x1 - m, x)), z: Math.max(b.z0 + m, Math.min(b.z1 - m, z)) };
  }

  /** a friend you brought is still coming back after 7 days → +50 for you, once */
  function referralCheck(u: User) {
    const by = (u as User & { referredBy?: string }).referredBy;
    if (!by || !store.data.users[by]) return;
    if (Date.now() - u.createdAt >= 7 * 86_400_000 && u.days.length >= 2) credit(null, by, EARN.referral, "referral", `referral:${u.id}`);
  }

  return {
    onHello(s: T, isNew: boolean, ref?: string) {
      if (isNew && typeof ref === "string" && store.data.users[ref] && ref !== s.id) {
        (s.user as User & { referredBy?: string }).referredBy = ref;
        store.dirty();
      }
      referralCheck(s.user);
      roomMsg(s);
    },
    onMessage(s: T, raw: { t: string }) {
      const m = raw as EconomyMsg;
      const mine = myRoomOf(s.id);
      switch (m.t) {
        case "myRoom":
          return roomMsg(s);
        case "buyRoom": {
          if (mine) return roomMsg(s);
          if (balance(store.data.ledger, s.id) < PRICES.room) return send(s, { t: "notice", text: `a room costs ${PRICES.room} coins` });
          const plot = freePlot();
          if (!plot) return send(s, { t: "notice", text: "no free rooms right now" });
          const r = credit(s, s.id, -PRICES.room, "room", `room:${s.id}`);
          if (!r.ok) return send(s, { t: "notice", text: "couldn't buy the room" });
          const g = roomGeometry(placeOf(plot)!);
          store.data.ownedRooms[plot] = { id: plot, owner: s.id, name: `${s.user.name}'s room`.slice(0, 32), topic: "anything goes", public: true, invited: [], invite: randomBytes(6).toString("base64url"), decor: [{ kind: "lamp", x: g.center.x, z: g.center.z, rot: 0 }], createdAt: Date.now() };
          store.dirty();
          ownedRoomState(plot);
          return roomMsg(s);
        }
        case "roomEdit": {
          if (!mine) return;
          if (typeof m.name === "string") {
            const n = filterMark(m.name.slice(0, 32));
            if (n && n.length >= 2) mine.name = n;
          }
          if (typeof m.topic === "string") {
            const t = filterMark(m.topic.slice(0, 60));
            if (t) mine.topic = t;
          }
          if (typeof m.public === "boolean") mine.public = m.public;
          store.dirty();
          ownedRoomState(mine.id);
          return roomMsg(s);
        }
        case "decorBuy": {
          if (!mine || !DECOR[m.kind] || mine.decor.length >= 24) return;
          const r = credit(s, s.id, -DECOR[m.kind].price, "decor", `decor:${randomUUID()}`);
          if (!r.ok) return send(s, { t: "notice", text: `${DECOR[m.kind].name} costs ${DECOR[m.kind].price} coins` });
          const g = roomGeometry(placeOf(mine.id)!);
          mine.decor.push({ kind: m.kind, x: g.center.x + (Math.random() - 0.5) * 3, z: g.center.z + (Math.random() - 0.5) * 3, rot: 0 });
          store.dirty();
          return roomMsg(s);
        }
        case "decorMove": {
          if (!mine || !mine.decor[m.index]) return;
          const p = clampToRoom(mine.id, Number(m.x), Number(m.z));
          if (!p || Number.isNaN(p.x)) return;
          Object.assign(mine.decor[m.index], { x: p.x, z: p.z, rot: Number(m.rot) || 0 });
          store.dirty();
          return roomMsg(s);
        }
        case "decorRemove": {
          if (!mine || !mine.decor[m.index]) return;
          mine.decor.splice(m.index, 1);
          store.dirty();
          return roomMsg(s);
        }
        case "invite": {
          const r = Object.values(store.data.ownedRooms).find((x) => x.invite === String(m.code));
          if (!r) return send(s, { t: "notice", text: "that invite doesn't open anything any more" });
          if (!r.invited.includes(s.id) && r.owner !== s.id) r.invited.push(s.id);
          store.dirty();
          ownedRoomState(r.id);
          s.fallUntil = Date.now() + 6000;
          return send(s, { t: "fallTo", room: r.id, ok: true });
        }
        case "gift": {
          const to = sessions.get(String(m.to));
          if (!to || !s.room || to.room !== s.room || !GIFTS[m.gift]) return;
          const r = gift(store.data.ledger, s.id, to.id, m.gift, `gift:${s.id}:${String(m.key).slice(0, 40)}`, Date.now(), randomUUID);
          if (!r.ok) return send(s, { t: "notice", text: r.error === "insufficient" ? `a ${GIFTS[m.gift].name} costs ${GIFTS[m.gift].price} coins` : "couldn't send that" });
          store.dirty();
          send(s, { t: "coins", balance: r.balance, delta: -GIFTS[m.gift].price, reason: "gift-sent" });
          send(to, { t: "coins", balance: balance(store.data.ledger, to.id), delta: GIFTS[m.gift].price, reason: "gift-received" });
          for (const o of sessions.values()) if (o.room === s.room) send(o, { t: "gift", from: s.id, to: to.id, emoji: GIFTS[m.gift].emoji, fromName: s.user.name, toName: to.user.name });
          return;
        }
      }
    },
    /** coin packs: Stripe Checkout (test mode) or a dev-only mock; the webhook is the only thing that credits */
    async http(req: IncomingMessage, res: ServerResponse, url: URL) {
      const json = (code: number, body: unknown) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(body));
      const auth = verifyUser((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      if (url.pathname === "/pay/packs" && req.method === "GET") return json(200, { packs: PACKS, mode: STRIPE_KEY ? "stripe-test" : PROD ? "off" : "mock" }), true;
      if (url.pathname === "/pay/checkout" && req.method === "POST") {
        if (!auth || !store.data.users[auth]) return json(401, { ok: false }), true;
        const body = await readJson(req);
        const pack = PACKS[String(body?.pack)];
        if (!pack) return json(400, { ok: false }), true;
        if (STRIPE_KEY) {
          const form = new URLSearchParams({
            mode: "payment",
            success_url: `${SITE}/world/?paid=1`,
            cancel_url: `${SITE}/world/`,
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": "eur",
            "line_items[0][price_data][unit_amount]": String(pack.cents),
            "line_items[0][price_data][product_data][name]": `seeface1 world · ${pack.label}`,
            "metadata[user]": auth,
            "metadata[pack]": String(body?.pack),
          });
          const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { authorization: `Bearer ${STRIPE_KEY}`, "content-type": "application/x-www-form-urlencoded" }, body: form });
          const j = (await r.json()) as { id?: string; url?: string };
          if (!r.ok || !j.url || !j.id) return json(502, { ok: false }), true;
          store.data.payments[j.id] = { user: auth, pack: String(body?.pack), coins: pack.coins, status: "pending", at: Date.now() };
          store.dirty();
          return json(200, { ok: true, url: j.url }), true;
        }
        if (PROD) return json(503, { ok: false, error: "payments are off" }), true;
        const id = `mock_${randomUUID()}`;
        store.data.payments[id] = { user: auth, pack: String(body?.pack), coins: pack.coins, status: "pending", at: Date.now() };
        store.dirty();
        return json(200, { ok: true, url: `${SITE}/world/?mockpay=${id}` }), true;
      }
      if (url.pathname === "/pay/mock-complete" && req.method === "POST") {
        if (PROD || STRIPE_KEY) return json(404, { ok: false }), true;
        const body = await readJson(req);
        return json(complete(String(body?.id)) ? 200 : 400, { ok: true }), true;
      }
      if (url.pathname === "/pay/webhook" && req.method === "POST") {
        const raw = await readRaw(req);
        if (!STRIPE_WEBHOOK || !verifyStripe(raw, String(req.headers["stripe-signature"] ?? ""), STRIPE_WEBHOOK)) return json(400, { ok: false }), true;
        const ev = JSON.parse(raw) as { type: string; data: { object: { id: string; payment_status?: string } } };
        if (ev.type === "checkout.session.completed" && ev.data.object.payment_status === "paid") complete(ev.data.object.id);
        return json(200, { received: true }), true;
      }
      return false;
    },
  };

  function complete(id: string) {
    const p = store.data.payments[id];
    if (!p || p.status === "paid") return false;
    p.status = "paid";
    credit(null, p.user, p.coins, "pack", `pay:${id}`);
    store.dirty();
    return true;
  }
}

/** Stripe-Signature: t=<ts>,v1=<hmac sha256 of `${t}.${payload}`>; reject anything older than 5 min */
export function verifyStripe(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300 || !parts.v1) return false;
  const want = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(want), b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readRaw(req: IncomingMessage) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) break;
  }
  return raw;
}
async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readRaw(req));
  } catch {
    return null;
  }
}

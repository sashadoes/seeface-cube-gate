// Integration: a real world server (memory store, short timers) and real WebSocket clients.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import WebSocket from "ws";
import { curatedRoomPlace, roomGeometry } from "../../shared/world/maze.ts";
import type { ServerMsg } from "../../shared/world/protocol.ts";

const PORT = 8800 + Math.floor(Math.random() * 90);
const HTTP = `http://localhost:${PORT}`;
let proc: ChildProcess;

beforeAll(async () => {
  proc = spawn("node", ["server/world/index.ts"], { env: { ...process.env, WORLD_PORT: String(PORT), WORLD_STORE: "memory", WORLD_SILENCE_MS: "1500", WORLD_PROMPT_GAP_MS: "1500", WORLD_SESSION_END_MS: "800", WORLD_ADMIN_KEY: "test-admin", ANTHROPIC_API_KEY: "", NODE_ENV: "test" }, stdio: "pipe" });
  for (let i = 0; i < 50; i++) {
    const ok = await fetch(`${HTTP}/health`).then((r) => r.ok, () => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});
afterAll(() => proc?.kill());

type Client = { ws: WebSocket; msgs: ServerMsg[]; id: string; token: string; send: (m: object) => void; wait: <T extends ServerMsg["t"]>(t: T, pred?: (m: Extract<ServerMsg, { t: T }>) => boolean, ms?: number) => Promise<Extract<ServerMsg, { t: T }>> };

async function client(name: string): Promise<Client> {
  const ws = new WebSocket(`ws://localhost:${PORT}`, { headers: { origin: "http://localhost:5173" } });
  const msgs: ServerMsg[] = [];
  const waiters: (() => void)[] = [];
  ws.on("message", (d) => {
    msgs.push(JSON.parse(String(d)));
    waiters.splice(0).forEach((w) => w());
  });
  await new Promise((r) => ws.on("open", r));
  const send = (m: object) => ws.send(JSON.stringify(m));
  const wait: Client["wait"] = (t, pred = () => true, ms = 6000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${t}`)), ms);
      const check = () => {
        const m = msgs.find((x) => x.t === t && pred(x as never));
        if (m) {
          clearTimeout(timer);
          msgs.splice(msgs.indexOf(m), 1);
          resolve(m as never);
        } else waiters.push(check);
      };
      check();
    });
  send({ t: "hello", token: null, name, blob: "moth", v: 1 });
  const w = await wait("welcome");
  send({ t: "age", action: "mock" });
  await wait("age", (m) => m.state === "verified");
  return { ws, msgs, id: w.id, token: w.token, send, wait };
}

const enter = async (c: Client, room: string) => {
  c.send({ t: "fallTo", room });
  await c.wait("fallTo", (m) => m.ok);
  const g = roomGeometry(curatedRoomPlace(room)!);
  c.send({ t: "pos", x: g.center.x, y: 0, z: g.center.z, f: 0, falling: false });
  await c.wait("links", (m) => m.room === room);
};
const leave = (c: Client) => c.send({ t: "pos", x: c === undefined ? 0 : 26.6, y: 0, z: 33.5, f: 0, falling: false });

describe("world server", { timeout: 20_000 }, () => {
  it("rejects teleports that weren't a server-approved fall", async () => {
    const c = await client("jumper");
    c.send({ t: "pos", x: 26.6, y: 0, z: 33.5, f: 0, falling: false });
    await new Promise((r) => setTimeout(r, 200));
    c.send({ t: "pos", x: 500, y: 0, z: 500, f: 0, falling: false });
    await c.wait("error", (m) => m.code === "pos-rejected");
    c.ws.close();
  });

  it("gives the welcome coins once and pays say-hi only after really saying something", async () => {
    const a = await client("alice"), b = await client("bob");
    a.msgs.length = 0;
    a.send({ t: "quest", id: "say-hi" });
    await new Promise((r) => setTimeout(r, 300));
    expect(a.msgs.some((m) => m.t === "coins" && m.reason === "say-hi")).toBe(false);
    await enter(a, "dream-desk");
    await enter(b, "dream-desk");
    a.send({ t: "bubble", text: "hello there" });
    await new Promise((r) => setTimeout(r, 200));
    a.send({ t: "quest", id: "say-hi" });
    await a.wait("coins", (m) => m.reason === "say-hi");
    a.ws.close();
    b.ws.close();
  });

  it("keeps captions only from opted-in speakers, writes a verdict, hides quotes until approved", async () => {
    const a = await client("ana"), b = await client("ben");
    a.send({ t: "transcribe", on: true });
    await enter(a, "archive-steps");
    await enter(b, "archive-steps");
    for (let i = 0; i < 7; i++) a.send({ t: "caption", text: `ana thought number ${i} about films that are long`, final: true });
    b.send({ t: "caption", text: "ben was not transcribed", final: true }); // ben has transcription off
    await new Promise((r) => setTimeout(r, 500));
    leave(a);
    leave(b);
    a.send({ t: "pos", x: 26.6, y: 0, z: 33.5, f: 0, falling: false });
    // session ends once the room is empty → verdict
    let lib: { verdicts: { quotes: unknown[]; title: string }[] } = { verdicts: [] };
    for (let i = 0; i < 40 && !lib.verdicts.length; i++) {
      await new Promise((r) => setTimeout(r, 150));
      lib = await fetch(`${HTTP}/library`).then((r) => r.json());
    }
    // the verdict exists but shows no quotes yet (none approved), and nothing of ben's
    const mine = await fetch(`${HTTP}/my/quotes`, { headers: { authorization: `Bearer ${a.token}` } }).then((r) => r.json());
    expect(mine.quotes.length).toBeGreaterThan(0);
    expect(JSON.stringify(mine)).not.toContain("ben was not transcribed");
    const benQuotes = await fetch(`${HTTP}/my/quotes`, { headers: { authorization: `Bearer ${b.token}` } }).then((r) => r.json());
    expect(benQuotes.quotes.length).toBe(0);
    // ben can't approve ana's quote
    const q = mine.quotes[0];
    const forged = await fetch(`${HTTP}/my/quotes`, { method: "POST", headers: { authorization: `Bearer ${b.token}`, "content-type": "application/json" }, body: JSON.stringify({ verdict: q.verdict, quote: q.quote, yes: true }) });
    expect(forged.status).toBe(400);
    await fetch(`${HTTP}/my/quotes`, { method: "POST", headers: { authorization: `Bearer ${a.token}`, "content-type": "application/json" }, body: JSON.stringify({ verdict: q.verdict, quote: q.quote, yes: true }) });
    lib = await fetch(`${HTTP}/library`).then((r) => r.json());
    expect(JSON.stringify(lib)).toContain(q.text);
    // nobody reads a curated room's transcript (no owner), not even a speaker
    const t = await fetch(`${HTTP}/transcript?room=archive-steps`, { headers: { authorization: `Bearer ${a.token}` } });
    expect(t.status).toBe(403);
    a.ws.close();
    b.ws.close();
  });

  it("the host greets by name and asks a question when the room goes quiet", async () => {
    const a = await client("quietone");
    await enter(a, "lost-found");
    const hi = await a.wait("host");
    expect(hi.text).toContain("quietone");
    const q = await a.wait("host", () => true, 6000);
    expect(q.text.endsWith("?")).toBe(true);
    a.ws.close();
  });

  it("reports land in the admin queue with only the target's own lines; admin needs the key", async () => {
    const a = await client("reporter"), t = await client("target");
    t.send({ t: "transcribe", on: true });
    await enter(a, "bad-advice");
    await enter(t, "bad-advice");
    t.send({ t: "caption", text: "something rude", final: true });
    a.send({ t: "caption", text: "reporter line (not transcribed)", final: true });
    await new Promise((r) => setTimeout(r, 200));
    a.send({ t: "report", who: t.id, reason: "harassment" });
    await a.wait("notice");
    expect((await fetch(`${HTTP}/admin/queue`)).status).toBe(403);
    const q = await fetch(`${HTTP}/admin/queue`, { headers: { "x-admin-key": "test-admin" } }).then((r) => r.json());
    const rep = q.reports.find((r: { target: string }) => r.target === t.id);
    expect(rep.excerpt).toEqual(["something rude"]);
    const res = await fetch(`${HTTP}/admin/action`, { method: "POST", headers: { "x-admin-key": "test-admin", "content-type": "application/json" }, body: JSON.stringify({ report: rep.id, action: "strike" }) });
    expect(res.ok).toBe(true);
    a.ws.close();
    t.ws.close();
  });

  it("blocked people never get a voice link", async () => {
    const a = await client("blocker"), b = await client("blocked");
    await enter(a, "strangers-kitchen");
    await enter(b, "strangers-kitchen");
    await a.wait("links", (m) => m.links.some((l) => l.peer === b.id));
    a.send({ t: "block", who: b.id });
    await a.wait("links", (m) => !m.links.some((l) => l.peer === b.id));
    await b.wait("links", (m) => !m.links.some((l) => l.peer === a.id));
    a.ws.close();
    b.ws.close();
  });
});

describe("economy", { timeout: 20_000 }, () => {
  const post = (path: string, token: string, body: unknown) => fetch(`${HTTP}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });

  it("rooms cost 500; packs (mock) credit coins once; decor stays inside; private rooms need the invite", async () => {
    const o = await client("owner"), f = await client("friend"), x = await client("stranger");
    o.send({ t: "buyRoom" });
    await o.wait("notice", (m) => m.text.includes("500"));
    // buy a pack (mock mode), complete it twice: credited once
    const r = await post("/pay/checkout", o.token, { pack: "small" }).then((r) => r.json());
    const id = new URL(r.url).searchParams.get("mockpay")!;
    await post("/pay/mock-complete", o.token, { id });
    await post("/pay/mock-complete", o.token, { id });
    const c = await o.wait("coins", (m) => m.reason === "pack");
    expect(c.balance).toBe(400);
    expect(o.msgs.filter((m) => m.t === "coins" && m.reason === "pack").length).toBe(0);
    // 400 < 500 → second pack, then the room
    const r2 = await post("/pay/checkout", o.token, { pack: "small" }).then((r) => r.json());
    await post("/pay/mock-complete", o.token, { id: new URL(r2.url).searchParams.get("mockpay") });
    await o.wait("coins", (m) => m.reason === "pack");
    o.send({ t: "buyRoom" });
    const mine = await o.wait("myRoom", (m) => !!m.room);
    const room = mine.room!;
    expect(room.id.startsWith("plot:")).toBe(true);
    // decor: buy, then try to drag it far outside → clamped into the room
    o.send({ t: "decorBuy", kind: "plant" });
    await o.wait("myRoom", (m) => (m.room?.decor.length ?? 0) === 2);
    o.send({ t: "decorMove", index: 1, x: 99999, z: -99999, rot: 0 });
    const moved = await o.wait("myRoom", (m) => !!m.room && m.room.decor.length === 2 && m.room.decor[1].x !== room.decor[0].x && Math.abs(m.room.decor[1].x) < 99999);
    expect(Math.abs(moved.room!.decor[1].x)).toBeLessThan(99999);
    // private: a stranger can't fall in; the friend with the invite can
    o.send({ t: "roomEdit", public: false });
    await o.wait("myRoom", (m) => m.room?.public === false);
    x.send({ t: "fallTo", room: room.id });
    const no = await x.wait("fallTo");
    expect(no.ok).toBe(false);
    f.send({ t: "invite", code: room.invite });
    const yes = await f.wait("fallTo");
    expect(yes.ok).toBe(true);
    for (const c2 of [o, f, x]) c2.ws.close();
  });

  it("gifts move coins between people in the same room and everyone there sees it", async () => {
    const a = await client("giver"), b = await client("taker");
    await enter(a, "night-shift");
    await enter(b, "night-shift");
    a.send({ t: "gift", to: b.id, gift: "moon", key: "k1" });
    const g = await b.wait("gift");
    expect(g.emoji).toBe("🌙");
    const got = await b.wait("coins", (m) => m.reason === "gift-received");
    expect(got.balance).toBe(120);
    a.send({ t: "gift", to: b.id, gift: "moon", key: "k1" }); // replay: no double charge
    await new Promise((r) => setTimeout(r, 300));
    expect(b.msgs.some((m) => m.t === "coins" && m.reason === "gift-received")).toBe(false);
    a.ws.close();
    b.ws.close();
  });
});

import { verifyStripe } from "../../server/world/economy.ts";
import { createHmac } from "node:crypto";
describe("stripe webhook signature", () => {
  it("accepts a correct signature and rejects forged or stale ones", () => {
    const secret = "whsec_test", body = '{"type":"x"}', t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    expect(verifyStripe(body, `t=${t},v1=${sig}`, secret)).toBe(true);
    expect(verifyStripe(body + " ", `t=${t},v1=${sig}`, secret)).toBe(false);
    expect(verifyStripe(body, `t=${t - 3600},v1=${createHmac("sha256", secret).update(`${t - 3600}.${body}`).digest("hex")}`, secret)).toBe(false);
    expect(verifyStripe(body, `t=${t},v1=deadbeef`, secret)).toBe(false);
  });
});

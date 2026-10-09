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

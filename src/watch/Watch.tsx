// The owner's secret page (/the-eye): live online numbers for the whole site,
// and a live map of the labyrinth with every player and the path they walked.
// It only LISTENS to the relay: it never sends anything, so it is not counted
// online and never appears in the game. It shows only what the game already
// shares (nickname + position in the maze), never emails or IP addresses.
// Hidden, not locked: anyone who finds the address sees the same public data.
import { useEffect, useRef, useState } from "react";
import mqtt from "mqtt";
import { CELL, roomOf, wallEast, wallSouth } from "../labyrinth/maze";
import { LEVELS, LEVEL_OFFSET, levelAtX, zoneAt } from "../labyrinth/zones";
import { DEMONS, demonOf } from "../labyrinth/demons";
import { cleanNick } from "../labyrinth/nick";
import { MOD_PUBLIC_KEY, approvalText, type Post } from "../labyrinth/posts";
import { JOURNAL_TOPIC, type Journal } from "../insight";
import { validJournal } from "./insights";
import Players from "./Players";
import "./Watch.scss";
import { RELAY } from "../stage";

const RELAYS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
const SITE = `${RELAY}/site/v1/here`;
const LAB = `${RELAY}/lab/v1`;
const ALIVE_MS = 25_000;
const STALE_MS = 6_000;
const TRAIL_KEEP_MS = 15 * 60_000; // trails of people who left stay for 15 min
const HISTORY_KEY = "seeface-eye-history";
const JOURNALS_KEY = "seeface-eye-journals"; // a local copy, in case the relay forgets retained messages
const JOURNALS_KEEP = 600;

type Pt = { x: number; z: number; t: number };
type Who = "real" | "test" | "bot" | "unknown";
type Player = { id: string; who: Who; nick: string; x: number; z: number; yaw: number; light: number; held: number; first: number; last: number; trail: Pt[]; walked: number };
type Sample = { t: number; site: number; lab: number };

const PLACE: Record<string, string> = {
  monogram: "monogram halls", pools: "the pools", red: "red corridors", neon: "neon void",
  photo: "photo garden", white: "overexposed white", ash: "ash", deep: "the deep",
};
const placeOf = (x: number, z: number) => {
  const l = levelAtX(x);
  return l > 0 ? `${["", "I", "II", "III"][l]} · ${LEVELS[l].name}` : PLACE[zoneAt(x, z).kind];
};
const ago = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)}s` : ms < 3_600_000 ? `${Math.round(ms / 60_000)}m` : `${(ms / 3_600_000).toFixed(1)}h`);
// net.ts tags each position with who sent it ("k"); old clients send nothing
const WHO: Record<string, Who> = { r: "real", d: "test", b: "bot" };
const WHO_LABEL: Record<Who, string> = { real: "real person", test: "test build · dev / claude", bot: "automated browser", unknown: "unverified (old version)" };
const REAL = "#7dffa8";
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

function loadHistory(): Sample[] {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as Sample[];
    return h.filter((s) => Date.now() - s.t < 24 * 3_600_000);
  } catch {
    return [];
  }
}

function loadJournals() {
  const m = new Map<string, Journal>();
  try {
    for (const j of JSON.parse(localStorage.getItem(JOURNALS_KEY) ?? "[]") as unknown[]) if (validJournal(j)) m.set(j.id, j);
  } catch {
    // ignore
  }
  return m;
}

export default function Watch() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const spark = useRef<HTMLCanvasElement>(null);
  const players = useRef(new Map<string, Player>());
  const site = useRef(new Map<string, number>());
  const wishes = useRef(0);
  const view = useRef({ x: 10, z: 10, scale: 6, level: 0 }); // scale = px per metre
  const [follow, setFollow] = useState<string | null>(null);
  const followRef = useRef<string | null>(null);
  followRef.current = follow;
  const [, setTick] = useState(0);
  const [relay, setRelay] = useState("connecting…");
  // posts waiting for approval (moderation)
  const posts = useRef(new Map<string, Post>());
  const approvedIds = useRef(new Set<string>());
  const clientRef = useRef<ReturnType<typeof mqtt.connect> | null>(null);
  const [modKey, setModKey] = useState<{ priv: JsonWebKey; pub: JsonWebKey } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("seeface-mod-key") ?? "null");
    } catch {
      return null;
    }
  });
  const history = useRef<Sample[]>(loadHistory());
  const peak = useRef({ site: 0, lab: 0 });
  const journals = useRef(loadJournals());
  const journalsChanged = useRef(true);
  const [journalList, setJournalList] = useState<Journal[]>(() => [...journals.current.values()]);
  const [tab, setTab] = useState<"live" | "players">(() => (location.hash === "#players" ? "players" : "live"));

  // never let search engines index this page
  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots";
    m.content = "noindex, nofollow";
    document.head.appendChild(m);
    document.title = "the eye";
    return () => m.remove();
  }, []);

  // ------------------------------------------------------------ listen
  useEffect(() => {
    let r = 0;
    let client: ReturnType<typeof mqtt.connect> | null = null;
    const connect = () => {
      client = mqtt.connect(RELAYS[r], { clientId: `sf1eye-${Math.random().toString(36).slice(2, 10)}`, connectTimeout: 6000, reconnectPeriod: 4000 });
      client.on("connect", () => {
        setRelay(RELAYS[r].replace("wss://", "").split(":")[0]);
        // listen only: no publish anywhere in this file
        client!.subscribe([`${SITE}/+`, `${LAB}/pos/#`, `${LAB}/bye/+`, `${LAB}/world/#`, `${JOURNAL_TOPIC}/+`]);
      });
      client.on("error", () => {
        client?.end(true);
        r = (r + 1) % RELAYS.length;
        setRelay("reconnecting…");
        setTimeout(connect, 1500);
      });
      client.on("message", (topic, payload) => {
        const parts = topic.split("/");
        const now = Date.now();
        if (topic.startsWith(JOURNAL_TOPIC + "/")) {
          // a player's play journal (src/insight.ts), retained: arrives for everyone ever seen
          if (payload.length > 16_000) return;
          try {
            const j = JSON.parse(payload.toString());
            if (!validJournal(j) || j.id !== parts[parts.length - 1]) return;
            j.nick = cleanNick(j.nick) ?? null;
            const had = journals.current.get(j.id);
            if (!had || had.last <= j.last) {
              journals.current.set(j.id, j);
              journalsChanged.current = true;
            }
          } catch {
            // ignore garbage
          }
          return;
        }
        if (topic.startsWith(SITE)) {
          const id = parts.pop()!;
          if (id.length > 16) return;
          if (payload.toString() === "bye") site.current.delete(id);
          else site.current.set(id, now);
          return;
        }
        if (parts[3] === "world") {
          const [, , , , kind, id] = parts;
          if (kind === "post" && id) {
            try {
              const d = JSON.parse(payload.toString());
              if (typeof d.img === "string" && d.img.startsWith("data:image/jpeg;base64,")) posts.current.set(id, { ...d, id, nick: cleanNick(d.nick) ?? "someone" });
            } catch {
              posts.current.delete(id); // removed (empty retained message)
            }
            return;
          }
          if (kind === "ok" && id) {
            approvedIds.current.add(id);
            return;
          }
          wishes.current += 1;
          return;
        }
        // positions arrive as pos/<area>/<id>; bye as bye/<id>
        const id = parts[parts.length - 1];
        if (!id || id.length > 16) return;
        if (parts[3] === "bye") {
          const p = players.current.get(id);
          if (p) p.last = Math.min(p.last, now - STALE_MS);
          return;
        }
        let m: Record<string, unknown>;
        try {
          m = JSON.parse(payload.toString());
        } catch {
          return;
        }
        if (typeof m.x !== "number" || typeof m.z !== "number" || !Number.isFinite(m.x) || !Number.isFinite(m.z)) return;
        const x = m.x, z = m.z;
        let p = players.current.get(id);
        if (!p || now - p.last > TRAIL_KEEP_MS) {
          p = { id, who: "unknown", nick: "", x, z, yaw: 0, light: 0, held: 0, first: now, last: now, trail: [], walked: 0 };
          players.current.set(id, p);
        }
        const lastPt = p.trail[p.trail.length - 1];
        const jump = lastPt ? Math.hypot(x - lastPt.x, z - lastPt.z) : 0;
        if (!lastPt || jump > 0.6 || now - lastPt.t > 3000) {
          if (lastPt && jump < 50) p.walked += jump; // big jumps are rifts/respawns
          p.trail.push({ x, z, t: now });
          if (p.trail.length > 4000) p.trail.splice(0, 1000);
        }
        Object.assign(p, {
          x, z,
          yaw: typeof m.y === "number" ? m.y : 0,
          light: typeof m.l === "number" ? m.l : 0,
          held: typeof m.h === "number" ? m.h : 0,
          nick: cleanNick(m.n) ?? "wanderer",
          who: WHO[m.k as string] ?? "unknown",
          last: now,
        });
      });
    };
    connect();
    const keep = setInterval(() => (clientRef.current = client), 500);
    return () => {
      clearInterval(keep);
      client?.end(true);
    };
  }, []);

  // ------------------------------------------------------------ numbers + history
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      for (const [id, t] of site.current) if (now - t > ALIVE_MS) site.current.delete(id);
      for (const [id, p] of players.current) if (now - p.last > TRAIL_KEEP_MS) players.current.delete(id);
      const lab = [...players.current.values()].filter((p) => now - p.last < STALE_MS).length;
      const s = { t: now, site: site.current.size, lab };
      peak.current = { site: Math.max(peak.current.site, s.site), lab: Math.max(peak.current.lab, s.lab) };
      const h = history.current;
      if (!h.length || now - h[h.length - 1].t > 10_000) {
        h.push(s);
        if (h.length > 8640) h.splice(0, h.length - 8640);
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
        } catch {
          // full or blocked: history just won't persist
        }
      }
      drawSpark();
      if (journalsChanged.current) {
        journalsChanged.current = false;
        const all = [...journals.current.values()].sort((a, b) => b.last - a.last).slice(0, JOURNALS_KEEP);
        setJournalList(all);
        try {
          localStorage.setItem(JOURNALS_KEY, JSON.stringify(all));
        } catch {
          // full: the relay still has them
        }
      }
      setTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  function drawSpark() {
    const c = spark.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    const W = (c.width = c.clientWidth * 2), H = (c.height = c.clientHeight * 2);
    g.clearRect(0, 0, W, H);
    const h = history.current.filter((s) => Date.now() - s.t < 3 * 3_600_000);
    if (h.length < 2) return;
    const max = Math.max(2, ...h.map((s) => s.site));
    const t0 = h[0].t, t1 = h[h.length - 1].t || t0 + 1;
    for (const [key, col] of [["site", "#e9e4da"], ["lab", "#ff7a5a"]] as const) {
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.beginPath();
      h.forEach((s, k) => {
        const x = ((s.t - t0) / Math.max(1, t1 - t0)) * W;
        const y = H - 4 - (s[key] / max) * (H - 8);
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.stroke();
    }
  }

  // ------------------------------------------------------------ map
  useEffect(() => {
    const c = canvas.current!;
    const g = c.getContext("2d")!;
    let raf = 0;
    const draw = () => {
      const dpr = Math.min(devicePixelRatio, 2);
      const W = c.clientWidth, H = c.clientHeight;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) (c.width = Math.round(W * dpr)), (c.height = Math.round(H * dpr));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#070707";
      g.fillRect(0, 0, W, H);
      const v = view.current;
      const now = Date.now();
      const f = followRef.current && players.current.get(followRef.current);
      if (f) {
        v.x += (f.x - v.x) * 0.15;
        v.z += (f.z - v.z) * 0.15;
        v.level = levelAtX(f.x);
      }
      const sx = (x: number) => W / 2 + (x - v.x) * v.scale;
      const sy = (z: number) => H / 2 + (z - v.z) * v.scale;
      const cellPx = CELL * v.scale;
      const i0 = Math.floor((v.x - W / 2 / v.scale) / CELL) - 1, i1 = Math.ceil((v.x + W / 2 / v.scale) / CELL) + 1;
      const j0 = Math.floor((v.z - H / 2 / v.scale) / CELL) - 1, j1 = Math.ceil((v.z + H / 2 / v.scale) / CELL) + 1;

      // the maze (when zoomed in enough to read it)
      if (cellPx >= 5 && (i1 - i0) * (j1 - j0) < 60_000) {
        g.fillStyle = "rgba(255,240,210,0.06)";
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (roomOf(i, j)) g.fillRect(sx(i * CELL), sy(j * CELL), cellPx + 0.5, cellPx + 0.5);
        g.strokeStyle = `rgba(233,228,218,${Math.min(0.45, cellPx / 40)})`;
        g.lineWidth = 1;
        g.beginPath();
        for (let i = i0; i <= i1; i++)
          for (let j = j0; j <= j1; j++) {
            if (wallEast(i, j)) {
              g.moveTo(sx((i + 1) * CELL), sy(j * CELL));
              g.lineTo(sx((i + 1) * CELL), sy((j + 1) * CELL));
            }
            if (wallSouth(i, j)) {
              g.moveTo(sx(i * CELL), sy((j + 1) * CELL));
              g.lineTo(sx((i + 1) * CELL), sy((j + 1) * CELL));
            }
          }
        g.stroke();
      } else {
        // far out: a grid every 100 m
        g.strokeStyle = "rgba(255,255,255,0.05)";
        g.beginPath();
        const step = 100;
        for (let x = Math.floor((v.x - W / 2 / v.scale) / step) * step; x < v.x + W / 2 / v.scale; x += step) (g.moveTo(sx(x), 0), g.lineTo(sx(x), H));
        for (let z = Math.floor((v.z - H / 2 / v.scale) / step) * step; z < v.z + H / 2 / v.scale; z += step) (g.moveTo(0, sy(z)), g.lineTo(W, sy(z)));
        g.stroke();
      }
      // the entrance
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.strokeRect(sx(v.level * LEVEL_OFFSET) - 4, sy(0) - 4, 8, 8);

      // trails, then players
      for (const p of players.current.values()) {
        const col = hex(DEMONS[demonOf(p.id)].aura);
        const online = now - p.last < STALE_MS;
        const sel = followRef.current === p.id;
        g.strokeStyle = col;
        g.globalAlpha = sel ? 0.9 : online ? 0.45 : 0.18;
        g.lineWidth = sel ? 2.5 : 1.5;
        g.beginPath();
        let prev: Pt | null = null;
        for (const pt of p.trail) {
          if (!prev || Math.hypot(pt.x - prev.x, pt.z - prev.z) > 50) g.moveTo(sx(pt.x), sy(pt.z));
          else g.lineTo(sx(pt.x), sy(pt.z));
          prev = pt;
        }
        g.stroke();
        g.globalAlpha = 1;
        const x = sx(p.x), y = sy(p.z);
        if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
        const real = p.who === "real";
        const r = sel ? 7 : 5;
        if (real) {
          g.fillStyle = online ? col : "#555";
          g.shadowColor = col;
          g.shadowBlur = online ? 14 : 0;
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
          g.shadowBlur = 0;
          if (online) {
            // a breathing ring: this one is a person
            const k = (now % 1600) / 1600;
            g.strokeStyle = REAL;
            g.globalAlpha = 1 - k;
            g.lineWidth = 2;
            g.beginPath();
            g.arc(x, y, r + 3 + k * 12, 0, Math.PI * 2);
            g.stroke();
            g.globalAlpha = 1;
          }
        } else {
          // tests / bots: a hollow grey square, no glow
          g.strokeStyle = online ? "#9a9a9a" : "#555";
          g.lineWidth = 1.5;
          g.setLineDash([3, 2]);
          g.strokeRect(x - r, y - r, r * 2, r * 2);
          g.setLineDash([]);
        }
        if (online) {
          // facing
          g.strokeStyle = col;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - Math.sin(p.yaw) * 14, y - Math.cos(p.yaw) * 14);
          g.stroke();
        }
        g.textAlign = "center";
        const name = online ? p.nick : `${p.nick} (left)`;
        if (real) {
          g.fillStyle = online ? "#fff6e2" : "#777";
          g.font = "bold italic 14px 'Times New Roman', serif";
          g.fillText(name, x, y - 13); // canvas text: names can't inject HTML
          // the mark above: a green pin
          const top = y - 31;
          g.fillStyle = online ? REAL : "#5a7a62";
          g.beginPath();
          g.moveTo(x - 6, top - 8);
          g.lineTo(x + 6, top - 8);
          g.lineTo(x, top);
          g.closePath();
          g.fill();
        } else {
          g.fillStyle = online ? "#8c8c8c" : "#555";
          g.font = "italic 11px 'Times New Roman', serif";
          g.fillText(`${p.who === "bot" ? "⚙ bot" : p.who === "test" ? "⚙ test" : "?"} · ${name}`, x, y - 12);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // pan, zoom, click to follow
  useEffect(() => {
    const c = canvas.current!;
    let drag: { x: number; y: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, moved: false };
      c.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        drag.moved = true;
        setFollow(null);
      }
      view.current.x -= dx / view.current.scale;
      view.current.z -= dy / view.current.scale;
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (drag && !drag.moved) {
        // click: pick the nearest player under the pointer
        const r = c.getBoundingClientRect();
        const v = view.current;
        const wx = v.x + (e.clientX - r.left - r.width / 2) / v.scale, wz = v.z + (e.clientY - r.top - r.height / 2) / v.scale;
        let best: string | null = null, bd = 18 / v.scale;
        for (const p of players.current.values()) {
          const d = Math.hypot(p.x - wx, p.z - wz);
          if (d < bd) (bd = d), (best = p.id);
        }
        setFollow(best);
      }
      drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("wheel", wheel, { passive: false });
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("wheel", wheel);
    };
  }, []);

  const zoom = (k: number) => (view.current.scale = Math.max(0.02, Math.min(40, view.current.scale * k)));

  async function createKey() {
    const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const priv = await crypto.subtle.exportKey("jwk", k.privateKey);
    const pub = await crypto.subtle.exportKey("jwk", k.publicKey);
    const v = { priv, pub };
    localStorage.setItem("seeface-mod-key", JSON.stringify(v));
    setModKey(v);
  }
  async function approve(p: Post) {
    if (!modKey || !clientRef.current) return;
    const key = await crypto.subtle.importKey("jwk", modKey.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(approvalText(p))));
    clientRef.current.publish(`${LAB}/world/ok/${p.id}`, JSON.stringify({ sig: btoa(String.fromCharCode(...sig)) }), { retain: true, qos: 1 });
    approvedIds.current.add(p.id);
    setTick((n) => n + 1);
  }
  function remove(p: Post) {
    clientRef.current?.publish(`${LAB}/world/post/${p.id}`, "", { retain: true, qos: 1 });
    clientRef.current?.publish(`${LAB}/world/ok/${p.id}`, "", { retain: true, qos: 1 });
    posts.current.delete(p.id);
    setTick((n) => n + 1);
  }

  function fitAll() {
    setFollow(null);
    const v = view.current;
    const list = [...players.current.values()].filter((p) => levelAtX(p.x) === v.level);
    if (!list.length) {
      v.x = v.level * LEVEL_OFFSET;
      v.z = 0;
      return;
    }
    const xs = list.map((p) => p.x), zs = list.map((p) => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    v.x = (minX + maxX) / 2;
    v.z = (minZ + maxZ) / 2;
    const c = canvas.current!;
    v.scale = Math.max(0.05, Math.min(12, Math.min(c.clientWidth / (maxX - minX + 40), c.clientHeight / (maxZ - minZ + 40))));
  }

  function goLevel(l: number) {
    setFollow(null);
    view.current.level = l;
    view.current.x = l * LEVEL_OFFSET + 10;
    view.current.z = 10;
  }

  const now = Date.now();
  const list = [...players.current.values()].sort((a, b) => Number(b.who === "real") - Number(a.who === "real") || b.last - a.last);
  const online = list.filter((p) => now - p.last < STALE_MS);
  const onlineReal = online.filter((p) => p.who === "real").length;
  const siteNow = site.current.size;

  return (
    <main className="eye">
      <header className="eye-top">
        <div className="eye-title">◉ the eye</div>
        <nav className="eye-tabs">
          {(["live", "players"] as const).map((k) => (
            <button
              key={k}
              className={tab === k ? "on" : ""}
              onClick={() => {
                setTab(k);
                window.history.replaceState(null, "", k === "players" ? "#players" : location.pathname);
              }}
            >
              {k === "live" ? "live map" : `players & insights · ${journalList.length}`}
            </button>
          ))}
        </nav>
        <div className="eye-stat">
          <b>{siteNow}</b>
          <span>on the site now</span>
        </div>
        <div className="eye-stat lab">
          <b>{onlineReal}</b>
          <span>
            real people in the labyrinth
            {online.length > onlineReal && <em> + {online.length - onlineReal} test / unverified</em>}
          </span>
        </div>
        <div className="eye-stat">
          <b>{Math.max(0, siteNow - online.length)}</b>
          <span>on the cube</span>
        </div>
        <div className="eye-stat small">
          <b>
            {peak.current.site} / {peak.current.lab}
          </b>
          <span>peak while open</span>
        </div>
        <canvas className="eye-spark" ref={spark} title="last 3 hours (only while this page was open): white = site, red = labyrinth" />
        <a className="eye-link" href="https://seeface1.goatcounter.com" target="_blank" rel="noreferrer">
          all-time stats ↗
        </a>
      </header>

      {tab === "players" && (
        <div className="eye-players">
          <Players journals={journalList} />
        </div>
      )}
      <section className="eye-body" style={tab === "players" ? { display: "none" } : undefined}>
        <div className="eye-map">
          <canvas ref={canvas} />
          <div className="eye-tools">
            {LEVELS.map((l, k) => (
              <button key={k} className={view.current.level === k ? "on" : ""} onClick={() => goLevel(k)}>
                {k === 0 ? "surface" : ["", "I", "II", "III"][k]}
              </button>
            ))}
            <button onClick={fitAll}>fit all</button>
            <button onClick={() => zoom(1.4)}>+</button>
            <button onClick={() => zoom(1 / 1.4)}>−</button>
          </div>
          {follow && <div className="eye-following">following {players.current.get(follow)?.nick} · drag to stop</div>}
        </div>

        <aside className="eye-list">
          <div className="eye-list-head">posts waiting · {[...posts.current.values()].filter((p) => !approvedIds.current.has(p.id)).length}</div>
          {!modKey && (
            <div className="eye-mod">
              <button onClick={() => void createKey()}>create my moderator key</button>
              <p>one time. it stays in this browser only: approve posts from this device.</p>
            </div>
          )}
          {modKey && !MOD_PUBLIC_KEY && (
            <div className="eye-mod">
              <p>send this public key to Claude to switch posts on (it's not secret):</p>
              <textarea readOnly value={JSON.stringify(modKey.pub)} onFocus={(e) => e.currentTarget.select()} />
            </div>
          )}
          {[...posts.current.values()]
            .filter((p) => !approvedIds.current.has(p.id))
            .sort((a, b) => a.t - b.t)
            .map((p) => (
              <div key={p.id} className="eye-post">
                <img src={p.img} alt="" />
                <div>
                  <b>@{p.nick}</b> {p.cap}
                  <br />
                  <small>{p.agreed ? "✓ artist agreement accepted" : "no artist agreement (posted before it existed): ask the artist"}</small>
                </div>
                <div className="row">
                  <button disabled={!modKey} onClick={() => void approve(p)}>
                    approve
                  </button>
                  <button onClick={() => remove(p)}>remove</button>
                </div>
              </div>
            ))}
          <div className="eye-list-head">
            players · {onlineReal} real live · {online.length - onlineReal} test live · {list.length - online.length} recently left · relay {relay}
          </div>
          {list.length === 0 && <div className="eye-empty">nobody in the labyrinth right now</div>}
          {list.map((p) => {
            const live = now - p.last < STALE_MS;
            const d = DEMONS[demonOf(p.id)];
            return (
              <button key={p.id} className={"eye-row " + p.who + (live ? "" : " gone") + (follow === p.id ? " sel" : "")} onClick={() => setFollow(p.id)} title={WHO_LABEL[p.who]}>
                <i style={{ background: hex(d.aura) }} />
                <span className="n">
                  {p.who === "real" ? <b className="who-real">▼ real</b> : <b className="who-test">{p.who === "unknown" ? "?" : "⚙ " + p.who}</b>} {p.nick}
                </span>
                <span className="m">
                  {d.name} · {placeOf(p.x, p.z)}
                  <br />
                  {Math.round(p.walked)} m walked · {live ? `here ${ago(now - p.first)}` : `left ${ago(now - p.last)} ago`} · light {Math.round(p.light)}
                  {p.held > 0 && (
                    <>
                      {" "}
                      · carries <i className="relic" style={{ background: hex(p.held) }} />
                    </>
                  )}
                </span>
              </button>
            );
          })}
          <div className="eye-foot">wish messages heard: {wishes.current} · keepers are not shown: they're not people · <b className="who-real">▼ real</b> = a visitor on the live site · ⚙ test = a dev build or preview (often Claude testing) · ? = older game version, can't tell yet</div>
        </aside>
      </section>
    </main>
  );
}

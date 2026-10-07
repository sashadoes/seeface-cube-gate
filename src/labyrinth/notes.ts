// Notes between players:
//   · a note left in the world: a glowing paper where you stand, for anyone who
//     passes (tap it to read)
//   · a note to someone: addressed to a @nickname, waiting in their ✉ inbox the
//     next time they're in the labyrinth
// Text goes through the same filter as chat. Notes last 7 days. They travel on
// the public relay, so they're like postcards: not private (said on screen).
import * as THREE from "three";
import type { Presence } from "./net";
import { cleanNick } from "./nick";
import { filterMark } from "../marks/filter";
import { playerId } from "./champions";

export type Note = { id: string; text: string; from: string; to: string | null; x: number; z: number; t: number };
const LIFE = 7 * 86_400_000;
const READ_KEY = "seeface-notes-read";

function paperTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 80;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f2ead8";
  g.shadowColor = "#fff6e2";
  g.shadowBlur = 14;
  g.fillRect(10, 8, 44, 60);
  g.shadowBlur = 0;
  g.fillStyle = "rgba(60,50,40,0.5)";
  for (let y = 20; y < 60; y += 8) g.fillRect(16, y, 32 - (y % 16), 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createNotes(presence: Presence, myNick: () => string) {
  const group = new THREE.Group();
  const tex = paperTexture();
  const notes = new Map<string, Note>();
  const pool = Array.from({ length: 14 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(0.45, 0.56, 1);
    s.visible = false;
    group.add(s);
    return s;
  });
  const me = playerId();
  const listeners = new Set<() => void>();
  let read = new Set<string>();
  try {
    read = new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]"));
  } catch {
    // ignore
  }

  presence.onWorld((path, d) => {
    const [kind, id] = path.split("/");
    if (kind !== "note" || !id || !/^[\w-]{4,40}$/.test(id)) return;
    const text = typeof d.text === "string" ? filterMark(d.text) : null;
    const from = cleanNick(d.from);
    const to = d.to ? cleanNick(d.to) : null;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
    const n: Note = { id, text: text ?? "", from: from ?? "someone", to, x: num(d.x), z: num(d.z), t: num(d.t) };
    if (!text || [n.x, n.z, n.t].some(Number.isNaN) || Date.now() - n.t > LIFE) return;
    notes.set(id, n);
    listeners.forEach((f) => f());
  });

  const mine = (n: Note) => !!n.to && n.to.toLowerCase() === myNick().toLowerCase();

  return {
    group,
    onChange(fn: () => void) {
      listeners.add(fn);
    },
    /** leave a note: here for anyone, or to someone's inbox */
    leave(text: string, to: string | null, x: number, z: number) {
      const clean = filterMark(text);
      if (!clean) return false;
      const id = `${me}-${Date.now().toString(36)}`;
      presence.publishWorld(`note/${id}`, { text: clean, from: myNick(), to: to ? cleanNick(to) : null, x: +x.toFixed(2), z: +z.toFixed(2), t: Date.now() });
      return true;
    },
    /** your inbox: notes addressed to you, newest first */
    inbox: () => [...notes.values()].filter(mine).sort((a, b) => b.t - a.t),
    unread: () => [...notes.values()].filter((n) => mine(n) && !read.has(n.id)).length,
    markRead() {
      for (const n of notes.values()) if (mine(n)) read.add(n.id);
      try {
        localStorage.setItem(READ_KEY, JSON.stringify([...read].slice(-300)));
      } catch {
        // ignore
      }
      listeners.forEach((f) => f());
    },
    /** the world note you're looking at (within 3 m, roughly ahead) */
    lookingAt(px: number, pz: number, yaw: number) {
      let best: Note | null = null, bd = 3;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      for (const n of notes.values()) {
        if (n.to) continue;
        const dx = n.x - px, dz = n.z - pz, d = Math.hypot(dx, dz);
        if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.5) (bd = d), (best = n);
      }
      return best;
    },
    update(px: number, pz: number, t: number) {
      // the nearest notes left in the world float where they were left
      const near = [...notes.values()].filter((n) => !n.to && Math.hypot(n.x - px, n.z - pz) < 25).sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
      pool.forEach((s, k) => {
        const n = near[k];
        s.visible = !!n;
        if (n) s.position.set(n.x, 1.2 + Math.sin(t * 1.4 + k) * 0.08, n.z);
      });
    },
  };
}

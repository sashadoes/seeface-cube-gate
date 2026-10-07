// Champions: the top 10 players by their best run (metres walked in one life).
// Every player publishes their own best as a retained message on the relay
// (one per player, under a stable id kept in this browser); everyone hears all
// of them and keeps the top 10. Shown on the billboard in the hall of
// champions (and the map). Like everything on the public relay it can be
// cheated until scores move to our own server; numbers are clamped and names
// filtered on receive.
import { cleanNick } from "./nick";
import type { Presence } from "./net";

export type Champion = { id: string; nick: string; best: number; at: number };

const ID_KEY = "seeface-player-id";
export function playerId() {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 12);
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return "anon" + Math.random().toString(36).slice(2, 8);
  }
}

export function createChampions(presence: Presence) {
  const all = new Map<string, Champion>();
  const listeners = new Set<(top: Champion[]) => void>();
  const me = playerId();
  let myBest = 0;
  let published = 0;

  const top = () => [...all.values()].sort((a, b) => b.best - a.best || a.at - b.at).slice(0, 10);
  const emit = () => {
    const t = top();
    listeners.forEach((f) => f(t));
  };

  presence.onWorld((path, d) => {
    const [kind, id] = path.split("/");
    if (kind !== "score" || !id || !/^[\w-]{1,24}$/.test(id)) return;
    const nick = cleanNick(d.n);
    const best = typeof d.b === "number" && Number.isFinite(d.b) ? Math.max(0, Math.min(50_000, Math.round(d.b))) : 0;
    if (!nick || !best) return;
    all.set(id, { id, nick, best, at: typeof d.at === "number" ? d.at : 0 });
    if (id === me) myBest = Math.max(myBest, best);
    emit();
  });

  return {
    top,
    onChange(fn: (top: Champion[]) => void) {
      listeners.add(fn);
      fn(top());
    },
    /** tell everyone your best (call during a run and when it ends) */
    report(nick: string, metres: number) {
      if (import.meta.env.DEV) return; // local testing never reaches the real billboard
      const m = Math.round(metres);
      if (m <= myBest || m - published < 20) return; // only real improvements, not every step
      myBest = m;
      published = m;
      presence.publishWorld(`score/${me}`, { n: nick, b: m, at: Date.now() });
    },
    /** your place in the top 10 (1-based), or 0 */
    rank: () => top().findIndex((c) => c.id === me) + 1,
  };
}

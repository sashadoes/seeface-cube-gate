// The funnel, from day 1: landed → onboarded → heard_voice → spoke → followed_someone →
// returned_d1 → returned_d7 → purchased. Each step is sent once per device as a GoatCounter event
// (the same counter as the rest of the site; it ignores localhost). Nothing personal is sent.
// Not imported from ../analytics on purpose: that pulls the labyrinth's journal + relay code.
declare global {
  interface Window {
    goatcounter?: { count?: (vars: { path: string; title?: string; event?: boolean }) => void };
  }
}
export function track(event: string) {
  try {
    window.goatcounter?.count?.({ path: event, title: event, event: true });
  } catch {
    // analytics must never break the world
  }
}

export type Funnel = "landed" | "onboarded" | "heard_voice" | "spoke" | "followed_someone" | "returned_d1" | "returned_d7" | "purchased";

const KEY = "sf1w.funnel";
const read = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
};

export function funnel(step: Funnel) {
  const seen = read();
  if (seen[step]) return;
  seen[step] = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // private mode: still counted once per page
  }
  track(`world-${step}`);
}

const DAY = 86_400_000;
export function markLanded() {
  const seen = read();
  const first = seen.landed;
  funnel("landed");
  if (first) {
    const days = (Date.now() - first) / DAY;
    if (days >= 1 && days < 2) funnel("returned_d1");
    if (days >= 7 && days < 8) funnel("returned_d7");
  }
}

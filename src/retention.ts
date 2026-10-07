// Retention + source tracking for GoatCounter (no cookies, no personal data).
// GoatCounter can't tell a new visitor from a returning one, so this keeps a tiny
// counter in localStorage (first day, last day, which link brought you) and sends
// one event per new day:
//   visit-new            first time on this device
//   visit-return         came back on a later day
//   return-day-1 … -7    came back exactly N days after the first visit
//   return-week-2 / -month   came back 8–14 / 15–31 days after
//   src-<ref>            first visit came from ?ref=<ref> (or utm_source)
//   return-src-<ref>     a returning visitor who first came from <ref>
// Tag every Reel link: seeface1.world/?ref=reel-cube1 → compare src-reel-cube1 with
// return-src-reel-cube1 to see which Reels bring people who stay.
import { track } from "./analytics";

const KEY = "sf1.visits";
const REF = /^[\w-]{1,40}$/;

type Visits = { first: number; last: number; days: number; ref: string | null };

const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000);

function sourceFromUrl(): string | null {
  const q = new URLSearchParams(location.search);
  const ref = (q.get("ref") || q.get("utm_source") || "").toLowerCase();
  return REF.test(ref) ? ref : null;
}

export function startRetention() {
  try {
    const day = today();
    const raw = localStorage.getItem(KEY);
    const v: Visits | null = raw ? JSON.parse(raw) : null;

    if (!v) {
      const ref = sourceFromUrl();
      localStorage.setItem(KEY, JSON.stringify({ first: day, last: day, days: 1, ref }));
      track("visit-new");
      track(`src-${ref ?? "direct"}`);
      return;
    }
    if (v.last === day) return; // already counted today

    const since = day - v.first;
    track("visit-return");
    if (since >= 1 && since <= 7) track(`return-day-${since}`);
    else if (since <= 14) track("return-week-2");
    else if (since <= 31) track("return-month");
    track(`return-src-${v.ref ?? "direct"}`);
    if (v.days + 1 === 3) track("visit-3-days"); // a habit is forming
    if (v.days + 1 === 7) track("visit-7-days");

    localStorage.setItem(KEY, JSON.stringify({ ...v, last: day, days: v.days + 1 }));
  } catch {
    // private mode / storage blocked: analytics must never break the game
  }
}

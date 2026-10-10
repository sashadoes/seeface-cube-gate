// What kind of device is visiting, decided once on load. Most visitors come
// from Instagram on a phone (GoatCounter, Oct 2026: 93% phones, 57% iOS, ~80%
// via Instagram's in-app browser), so the defaults are tuned for that.
//
// The guess is written onto <html> as data attributes, so CSS can lighten
// itself too:  data-tier="low|medium|high"  data-inapp  data-ios  data-calm
export type Tier = "low" | "medium" | "high";

type Nav = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

const nav = navigator as Nav;
const ua = nav.userAgent || "";

export const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
export const isAndroid = /Android/i.test(ua);
/** Instagram / Facebook / TikTok in-app browsers: less memory, the page gets killed sooner */
export const isInApp = /Instagram|FBAN|FBAV|FB_IAB|musical_ly|BytedanceWebview/i.test(ua);
export const isPhone = matchMedia("(pointer: coarse)").matches;
export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
/** the visitor asked to save data, or is on a slow connection */
export const saveData = !!nav.connection?.saveData || /(^|-)2g|3g/.test(nav.connection?.effectiveType ?? "");

function guess(): Tier {
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 4; // Safari never says; 4 is a fair middle
  if (saveData) return "low";
  if (isIOS) {
    // small iPhones (SE / 6s / 7 / 8: 667pt tall or less) are the older, weaker chips
    const tall = Math.max(screen.width, screen.height);
    return tall <= 667 ? "low" : "medium";
  }
  if (isPhone) {
    if (mem <= 3 || cores <= 4) return "low";
    // in-app browsers on Android run with a tight memory cap
    if (isInApp && mem <= 4) return "low";
    return "medium";
  }
  return cores >= 8 && mem >= 8 ? "high" : "medium";
}

let tier: Tier = guess();
const root = document.documentElement;

function mark() {
  root.dataset.tier = tier;
  if (isInApp) root.dataset.inapp = "";
  if (isIOS) root.dataset.ios = "";
  if (reducedMotion) root.dataset.calm = "";
}
mark();

export const deviceTier = () => tier;

/** lower the tier for the rest of the visit (never raises it) */
export function lowerTier(to: Tier) {
  const rank = { low: 0, medium: 1, high: 2 };
  if (rank[to] >= rank[tier]) return;
  tier = to;
  mark();
}

/**
 * Watch the first seconds of the cube screen: if the phone can't keep up
 * (under ~40 frames a second), switch the page to its light look.
 */
export function watchFrames(seconds = 4) {
  if (tier === "low") return;
  let frames = 0;
  let start = 0;
  let slow = 0;
  const step = (t: number) => {
    if (document.hidden) {
      start = 0; // don't count time spent in the background
      requestAnimationFrame(step);
      return;
    }
    if (!start) start = t;
    frames++;
    const elapsed = (t - start) / 1000;
    if (elapsed < 1) return void requestAnimationFrame(step);
    const fps = frames / elapsed;
    frames = 0;
    start = t;
    if (fps < 40) slow++;
    else slow = 0;
    if (slow >= 2) return lowerTier("low");
    if (--seconds > 0) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

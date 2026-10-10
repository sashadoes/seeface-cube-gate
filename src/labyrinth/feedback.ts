// Feedback: asked once, after 15 minutes of play in the labyrinth (summed over
// visits, only while the game is on screen). Stars, one question, and an
// optional Instagram handle. Goes only to the owner (server /api/feedback).
import { apiBase, apiReady } from "../api";

export const FEEDBACK_AFTER = 15 * 60; // seconds of play
const PLAYED = "sf1.lab.played";
const DONE = "sf1.feedback";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // private mode: the form may ask again next visit, that's fine
  }
};

/** seconds played so far on this device */
export const played = () => Number(read(PLAYED)) || 0;

/** count more play time; true when it's time to ask (never without an API to send to) */
export function addPlay(seconds: number) {
  const s = played() + seconds;
  write(PLAYED, String(s));
  return apiReady && s >= FEEDBACK_AFTER && !read(DONE);
}

/** asked: sent or skipped, never ask again */
export const feedbackDone = (how: "sent" | "skipped") => write(DONE, how);

export const IG_HANDLE = /^@?[a-zA-Z0-9._]{1,30}$/;

export async function sendFeedback(f: { stars: number; text: string; ig: string; nick: string; lang: string }) {
  if (!apiBase) return false;
  try {
    const r = await fetch(`${apiBase}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, ig: f.ig.trim().replace(/^@/, ""), minutes: played() / 60 }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

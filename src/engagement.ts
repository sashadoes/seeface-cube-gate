// Engagement tracking for GoatCounter (no cookies, no personal data).
// GoatCounter has no "time on page", so we send one event per milestone:
//   time-15s … time-20m   → visible time on the site
//   music-30s … music-7m  → time the background music was actually playing
// Only time while the page is open on screen counts.
import { track } from "./analytics";

const SITE_MARKS: [number, string][] = [
  [15, "time-15s"],
  [30, "time-30s"],
  [60, "time-1m"],
  [120, "time-2m"],
  [180, "time-3m"],
  [300, "time-5m"],
  [600, "time-10m"],
  [1200, "time-20m"],
];

const MUSIC_MARKS: [number, string][] = [
  [30, "music-30s"],
  [60, "music-1m"],
  [180, "music-3m"], // ≈ the whole track
  [420, "music-7m"], // two full loops
];

let siteSeconds = 0;
let musicSeconds = 0;
let isMusicPlaying = () => false;

function fire(marks: [number, string][], seconds: number) {
  for (const [at, name] of marks) if (seconds === at) track(name);
}

/** Tell the tracker how to check whether the music is playing right now. */
export function watchMusic(isPlaying: () => boolean) {
  isMusicPlaying = isPlaying;
}

export function startEngagement() {
  setInterval(() => {
    if (document.hidden) return;
    siteSeconds += 1;
    fire(SITE_MARKS, siteSeconds);
    if (isMusicPlaying()) {
      musicSeconds += 1;
      fire(MUSIC_MARKS, musicSeconds);
    }
  }, 1000);
}

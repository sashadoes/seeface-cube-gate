// GoatCounter (https://seeface1.goatcounter.com). The script in index.html
// counts page views; track() records game milestones as events.
// GoatCounter ignores localhost, so nothing is counted during `npm run dev`.
// Every event also goes into this device's play journal for /the-eye (insight.ts).
import { noteEvent } from "./insight";
declare global {
  interface Window {
    goatcounter?: { count?: (vars: { path: string; title?: string; event?: boolean }) => void };
  }
}

export function track(event: string) {
  try {
    noteEvent(event);
  } catch {
    // never break the game
  }
  try {
    window.goatcounter?.count?.({ path: event, title: event, event: true });
  } catch {
    // analytics must never break the game
  }
}

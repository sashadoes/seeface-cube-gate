// GoatCounter (https://seeface1.goatcounter.com). The script in index.html
// counts page views; track() records game milestones as events.
// GoatCounter ignores localhost, so nothing is counted during `npm run dev`.
declare global {
  interface Window {
    goatcounter?: { count?: (vars: { path: string; title?: string; event?: boolean }) => void };
  }
}

export function track(event: string) {
  try {
    window.goatcounter?.count?.({ path: event, title: event, event: true });
  } catch {
    // analytics must never break the game
  }
}

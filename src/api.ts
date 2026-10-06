// The seeface1 API (server/). In development it runs next to Vite on :8787;
// in production set VITE_API_URL at build time. With no API configured,
// nothing is sent and the game still works.
const base: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? (import.meta.env.DEV ? `http://${location.hostname}:8787` : "");

/** False when no API is configured (then the email field is hidden). */
export const apiReady = Boolean(base);

export async function registerPlayer(p: { nick: string; email?: string; consent: boolean; ref?: string | null }) {
  if (!base) return false;
  try {
    const r = await fetch(`${base}/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    return r.ok;
  } catch {
    return false; // offline / API down: never block the game
  }
}

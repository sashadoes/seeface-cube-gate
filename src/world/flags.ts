// Feature flags: every new world feature sits behind one. Defaults below, overridden at build
// time by VITE_WORLD_FLAGS ("voice,-coins") and at runtime by ?flags=voice,-coins (for testing).

const DEFAULTS = {
  toys: true,
  voice: true,
  radio: true,
  onboarding: true,
  host: true,
  transcripts: true,
  coins: true,
  gifts: true,
  bloom: false,
  debug: false,
} as const;

export type Flag = keyof typeof DEFAULTS;

function parse(list: string | null | undefined, into: Record<string, boolean>) {
  for (const raw of (list ?? "").split(",")) {
    const f = raw.trim();
    if (!f) continue;
    if (f.startsWith("-")) into[f.slice(1)] = false;
    else into[f] = true;
  }
}

const state: Record<string, boolean> = { ...DEFAULTS };
parse(import.meta.env.VITE_WORLD_FLAGS as string | undefined, state);
if (typeof location !== "undefined") parse(new URLSearchParams(location.search).get("flags"), state);

export const flag = (f: Flag) => !!state[f];

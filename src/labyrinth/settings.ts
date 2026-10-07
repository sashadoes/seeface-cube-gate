// Player settings (kept in this browser). The owner's background music is NOT
// here on purpose: it only has its own on/off switch (owner rule: never change
// its volume).
export type Settings = {
  // sound
  master: number; // 0–1, all game sounds
  effects: number; // steps, crashes, chimes, pickups
  ambience: number; // rain, wind, snow, thunder
  radio: number; // the Hollow's static
  voices: number; // sirens, the Pop Queen's tune, choirs
  // game
  showNames: boolean;
  showChat: boolean;
  showHints: boolean;
  // controls
  lookSpeed: number; // 0.3–2
  invertY: boolean;
  stickSteers: boolean; // phone stick turns you (true) or side-steps (false)
  stickSide: "left" | "right";
  // graphics
  quality: "low" | "medium" | "high";
  fov: number; // 60–90
  cameraBob: boolean;
  shake: boolean;
  flashes: boolean; // lightning / rift flashes (off = calmer, safer for photosensitivity)
};

export const DEFAULTS: Settings = {
  master: 0.9,
  effects: 1,
  ambience: 1,
  radio: 1,
  voices: 1,
  showNames: true,
  showChat: true,
  showHints: true,
  lookSpeed: 1,
  invertY: false,
  stickSteers: true,
  stickSide: "left",
  quality: "medium",
  fov: 72,
  cameraBob: true,
  shake: true,
  flashes: true,
};

const KEY = "seeface-settings";
let current: Settings = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
})();
const listeners = new Set<(s: Settings) => void>();

export const settings = () => current;

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
  listeners.forEach((f) => f(current));
}

export function onSettings(fn: (s: Settings) => void) {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}

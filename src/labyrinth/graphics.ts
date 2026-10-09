// The first-visit graphics check, remembered in this browser (seeface-graphics):
// what we detected, what we recommended, and whether the player took it.
// The tier itself lives in settings.quality like before.
import type { Tier } from "./tiers";

export type GraphicsCheck = { device: string; recommended: Tier; fps: number; chosen: "recommended" | "manual"; at: number };

const KEY = "seeface-graphics";

export function readGraphics(): GraphicsCheck | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && typeof v === "object" && v.recommended ? (v as GraphicsCheck) : null;
  } catch {
    return null;
  }
}

export function saveGraphics(g: GraphicsCheck) {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    // private mode: asked again next visit
  }
}

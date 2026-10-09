// What each graphics tier means, in the player's words (device check + settings).
import type { Tier } from "./tiers";

export const TIER_NAMES: Record<Tier, string> = { low: "low", medium: "medium", high: "high" };
export const TIER_NOTES: Record<Tier, string> = {
  low: "for older phones: 30 fps, softer picture, no glow, fewer particles. coolest and lightest on the battery.",
  medium: "for most phones and laptops: 60 fps, glow and the film look, balanced sharpness.",
  high: "for strong devices: full sharpness, every particle, lantern shadows when it stays smooth.",
};

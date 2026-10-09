// The Room Blueprint, typed for the browser. The rules (allowed lists, limits)
// live in server/architects/blueprint.mjs, which the browser imports as-is.
export type Archetype = "cathedral" | "void" | "club" | "garden" | "gallery_corridor" | "cave" | "rooftop" | "ocean_floor";
export type Placement = "scattered" | "center" | "walls" | "ring";

export type Blueprint = {
  version: 1;
  title: string;
  tagline: string;
  archetype: Archetype | null;
  mood: string[];
  palette: { primary: string; secondary: string; accent: string; fog: string };
  lighting: { preset: "dim" | "neon" | "candle" | "daylight" | "strobe" | "moonlight"; intensity: number };
  fog: { density: number };
  skybox: { asset_id: string | null; preset: string | null };
  surfaces: { walls: string; floor: string };
  posters: { asset_id: string; slot: number; caption: string }[];
  objects: { type: string; count: number; placement: Placement }[];
  audio: { ambient_asset_id: string | null; preset: string | null; volume: number };
  radio: { enabled: boolean; mode: "push_to_talk" | "open_mic" };
  welcome_text: string;
  capacity: number;
  pricing: { type: "free" | "ticket"; keys: number };
  status: "draft" | "submitted" | "approved" | "rejected" | "live";
};

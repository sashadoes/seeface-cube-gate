// The Room Blueprint: the single source of truth for an Architect's room.
// SeeFace (the Creation Chamber's LLM) only ever sends a *patch*; this file
// decides what's allowed. The same lists drive the renderer in the browser
// (src/architects/room/), so a field that passes here can always be built.
// Plain JS with no Node imports: the browser imports this file too.

export const ARCHETYPES = ["cathedral", "void", "club", "garden", "gallery_corridor", "cave", "rooftop", "ocean_floor"];
export const LIGHTING = ["dim", "neon", "candle", "daylight", "strobe", "moonlight"];
export const PLACEMENTS = ["scattered", "center", "walls", "ring"];
export const RADIO_MODES = ["push_to_talk", "open_mic"];
export const STATUSES = ["draft", "submitted", "approved", "rejected", "live"];

// low-poly object library (built in src/architects/room/objects.ts)
export const OBJECTS = [
  "pillar", "plant", "screen", "chair", "statue", "crystal", "speaker", "candle", "bench", "lamp",
  "orb", "arch", "mirror", "tree", "rock", "neon_ring", "table", "vase", "kelp", "disco_ball", "cage", "throne",
];
// procedural looks that need no upload
export const SKY_PRESETS = ["night_stars", "dusk", "void", "aurora", "overcast", "deep_water", "dawn"];
export const SURFACE_PRESETS = ["concrete", "marble", "velvet", "tile", "sand", "moss", "metal", "wood", "stone", "black_mirror", "neon_grid"];
// synthesised in the browser (Web Audio), no files
export const AUDIO_PRESETS = ["drone", "rain", "hum", "waves", "wind", "choir", "heartbeat", "silence"];

export const POSTER_SLOTS = 12;
export const LIMITS = { title: 40, tagline: 120, welcome_text: 280, caption: 80, mood: 6, moodWord: 24 };

export function emptyBlueprint() {
  return {
    version: 1,
    title: "",
    tagline: "",
    archetype: null,
    mood: [],
    palette: { primary: "#1a1a22", secondary: "#2b2b36", accent: "#d8d2c6", fog: "#050507" },
    lighting: { preset: "dim", intensity: 0.5 },
    fog: { density: 0.3 },
    skybox: { asset_id: null, preset: null },
    surfaces: { walls: "concrete", floor: "stone" },
    posters: [],
    objects: [],
    audio: { ambient_asset_id: null, preset: null, volume: 0.5 },
    radio: { enabled: true, mode: "push_to_talk" },
    welcome_text: "",
    capacity: 40,
    pricing: { type: "free", keys: 0 }, // Phase 2 (Keys wallet); never set by SeeFace
    status: "draft", // only the server's submit/approve flow changes this
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
// one line of text: no control characters, trimmed, cut to max
const text = (v, max) =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .trim()
        .slice(0, max)
    : null;
const unit = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null);
const int = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : null);

/**
 * Patch from the model → the fields we accept + the names of the ones we dropped.
 * `assets` = this room's uploads [{id, type}], so ids can't be invented or borrowed.
 */
export function cleanPatch(raw, assets = []) {
  const patch = {};
  const rejected = [];
  if (!isObj(raw)) return { patch, rejected: raw == null ? [] : ["(not an object)"] };
  const images = new Set(assets.filter((a) => a.type === "image").map((a) => a.id));
  const sounds = new Set(assets.filter((a) => a.type === "audio").map((a) => a.id));
  const surface = (v) => (typeof v === "string" && (SURFACE_PRESETS.includes(v) || images.has(v)) ? v : null);

  // sub-object helper: keeps only valid keys, reports the rest as "parent.key"
  const sub = (key, rules) => {
    const src = raw[key];
    if (!isObj(src)) return rejected.push(key);
    const out = {};
    for (const [k, v] of Object.entries(src)) {
      const rule = rules[k];
      const ok = rule ? rule(v) : undefined;
      if (ok === undefined || ok === null) {
        if (!(rule && v === null && rule.nullable)) {
          rejected.push(`${key}.${k}`);
          continue;
        }
      }
      out[k] = ok ?? null;
    }
    if (Object.keys(out).length) patch[key] = out;
  };
  const nullable = (fn) => Object.assign(fn, { nullable: true });

  for (const key of Object.keys(raw)) {
    const v = raw[key];
    switch (key) {
      case "title":
      case "tagline":
      case "welcome_text": {
        const t = text(v, LIMITS[key]);
        t === null ? rejected.push(key) : (patch[key] = t);
        break;
      }
      case "archetype":
        ARCHETYPES.includes(v) ? (patch.archetype = v) : rejected.push(key);
        break;
      case "mood":
        if (!Array.isArray(v)) rejected.push(key);
        else patch.mood = v.map((m) => text(m, LIMITS.moodWord)).filter(Boolean).slice(0, LIMITS.mood);
        break;
      case "palette":
        sub(key, { primary: (c) => (HEX.test(c) ? c : null), secondary: (c) => (HEX.test(c) ? c : null), accent: (c) => (HEX.test(c) ? c : null), fog: (c) => (HEX.test(c) ? c : null) });
        break;
      case "lighting":
        sub(key, { preset: (p) => (LIGHTING.includes(p) ? p : null), intensity: unit });
        break;
      case "fog":
        sub(key, { density: unit });
        break;
      case "skybox":
        sub(key, { asset_id: nullable((id) => (images.has(id) ? id : null)), preset: nullable((p) => (SKY_PRESETS.includes(p) ? p : null)) });
        break;
      case "surfaces":
        sub(key, { walls: surface, floor: surface });
        break;
      case "audio":
        sub(key, { ambient_asset_id: nullable((id) => (sounds.has(id) ? id : null)), preset: nullable((p) => (AUDIO_PRESETS.includes(p) ? p : null)), volume: unit });
        break;
      case "radio":
        sub(key, { enabled: (b) => (typeof b === "boolean" ? b : null), mode: (m) => (RADIO_MODES.includes(m) ? m : null) });
        break;
      case "posters": {
        if (!Array.isArray(v)) {
          rejected.push(key);
          break;
        }
        const used = new Set();
        patch.posters = [];
        v.forEach((p, i) => {
          const slot = isObj(p) ? int(p.slot, 1, POSTER_SLOTS) : null;
          if (!isObj(p) || !images.has(p.asset_id) || slot === null || used.has(slot)) return rejected.push(`posters[${i}]`);
          used.add(slot);
          patch.posters.push({ asset_id: p.asset_id, slot, caption: text(p.caption, LIMITS.caption) ?? "" });
        });
        break;
      }
      case "objects": {
        if (!Array.isArray(v)) {
          rejected.push(key);
          break;
        }
        patch.objects = [];
        v.slice(0, 12).forEach((o, i) => {
          if (!isObj(o) || !OBJECTS.includes(o.type)) return rejected.push(`objects[${i}]`);
          patch.objects.push({ type: o.type, count: int(o.count, 1, 20) ?? 1, placement: PLACEMENTS.includes(o.placement) ? o.placement : "scattered" });
        });
        break;
      }
      case "capacity": {
        const c = int(v, 10, 200);
        c === null ? rejected.push(key) : (patch.capacity = c);
        break;
      }
      // version, status and pricing belong to the server, never to the model
      default:
        rejected.push(key);
    }
  }
  return { patch, rejected };
}

/** A new blueprint with a clean patch applied: objects merge one level deep, lists are replaced. */
export function applyPatch(bp, patch) {
  const out = structuredClone(bp);
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isObj(v) && isObj(out[k]) ? { ...out[k], ...v } : structuredClone(v);
  }
  return out;
}

/** What still blocks a submit (empty = ready). */
export function missingForSubmit(bp) {
  const missing = [];
  if (!bp.title) missing.push("title");
  if (!bp.archetype) missing.push("archetype");
  const def = emptyBlueprint().palette;
  if (!bp.palette || Object.keys(def).every((k) => bp.palette[k] === def[k])) missing.push("palette");
  const isAsset = (v) => typeof v === "string" && !SURFACE_PRESETS.includes(v);
  const visual = bp.posters?.length || bp.skybox?.asset_id || isAsset(bp.surfaces?.walls) || isAsset(bp.surfaces?.floor);
  if (!visual) missing.push("visual");
  if (!bp.welcome_text) missing.push("welcome_text");
  return missing;
}

/** Human words for missing fields (SeeFace asks for these when a submit is refused). */
export const MISSING_WORDS = {
  title: "a name for the room",
  archetype: "the shape of the room",
  palette: "its colours",
  visual: "at least one of your images on a wall, the floor or the sky",
  welcome_text: "the words visitors read when they enter",
};

// The JSON schema the model must answer in (structured outputs). Top-level patch fields are
// optional ("only the fields that changed"); a nested group (palette, lighting, …) is sent whole,
// because the API allows at most 24 optional fields in a schema. Structured outputs also need
// additionalProperties: false everywhere and can't express ranges or lengths, so cleanPatch
// still checks all of it.
const obj = (properties) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const str = { type: "string" };
const num = { type: "number" };
const PATCH_SCHEMA = { ...obj({
  title: str,
  tagline: str,
  archetype: { type: "string", enum: ARCHETYPES },
  mood: { type: "array", items: str },
  palette: obj({ primary: str, secondary: str, accent: str, fog: str }),
  lighting: obj({ preset: { type: "string", enum: LIGHTING }, intensity: num }),
  fog: obj({ density: num }),
  skybox: obj({ asset_id: { type: ["string", "null"] }, preset: { anyOf: [{ type: "string", enum: SKY_PRESETS }, { type: "null" }] } }),
  surfaces: obj({ walls: str, floor: str }),
  posters: { type: "array", items: { type: "object", additionalProperties: false, required: ["asset_id", "slot", "caption"], properties: { asset_id: str, slot: { type: "integer" }, caption: str } } },
  objects: { type: "array", items: { type: "object", additionalProperties: false, required: ["type", "count", "placement"], properties: { type: { type: "string", enum: OBJECTS }, count: { type: "integer" }, placement: { type: "string", enum: PLACEMENTS } } } },
  audio: obj({ ambient_asset_id: { type: ["string", "null"] }, preset: { anyOf: [{ type: "string", enum: AUDIO_PRESETS }, { type: "null" }] }, volume: num }),
  radio: obj({ enabled: { type: "boolean" }, mode: { type: "string", enum: RADIO_MODES } }),
  welcome_text: str,
  capacity: { type: "integer" },
}), required: [] };
export const TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "blueprint_patch", "stage"],
  properties: {
    reply: { type: "string", description: "what SeeFace says to the artist, 1-3 sentences" },
    blueprint_patch: { anyOf: [PATCH_SCHEMA, { type: "null" }], description: "only the blueprint fields that changed, or null" },
    stage: { type: "string", enum: ["arrival", "essence", "material", "atmosphere", "naming", "refining", "ready"] },
  },
};

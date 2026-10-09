// node --test server/architects/   (run from the repo root or from server/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCHETYPES, OBJECTS, emptyBlueprint, cleanPatch, applyPatch, missingForSubmit } from "./blueprint.mjs";

const assets = [
  { id: "a1", type: "image" },
  { id: "a2", type: "image" },
  { id: "s1", type: "audio" },
];

test("an empty blueprint is a draft with sane defaults", () => {
  const bp = emptyBlueprint();
  assert.equal(bp.version, 1);
  assert.equal(bp.status, "draft");
  assert.equal(bp.radio.enabled, true);
  assert.equal(bp.pricing.type, "free");
  assert.ok(bp.capacity >= 10 && bp.capacity <= 200);
});

test("valid fields pass through, unknown and invalid ones are rejected", () => {
  const { patch, rejected } = cleanPatch(
    { title: "Salt Chapel", archetype: "cathedral", mood: ["hushed", "salt"], palette: { primary: "#112233", accent: "nope" }, hacker: 1 },
    assets
  );
  assert.equal(patch.title, "Salt Chapel");
  assert.equal(patch.archetype, "cathedral");
  assert.deepEqual(patch.mood, ["hushed", "salt"]);
  assert.deepEqual(patch.palette, { primary: "#112233" });
  assert.ok(rejected.includes("hacker"));
  assert.ok(rejected.includes("palette.accent"));
});

test("unknown archetypes, presets and object types are rejected", () => {
  const { patch, rejected } = cleanPatch(
    { archetype: "spaceship", lighting: { preset: "laser", intensity: 0.5 }, objects: [{ type: "dragon", count: 2, placement: "ring" }, { type: "candle", count: 99, placement: "ring" }] },
    assets
  );
  assert.equal(patch.archetype, undefined);
  assert.deepEqual(patch.lighting, { intensity: 0.5 });
  assert.deepEqual(patch.objects, [{ type: "candle", count: 20, placement: "ring" }]);
  assert.ok(rejected.includes("archetype"));
  assert.ok(rejected.includes("lighting.preset"));
  assert.ok(rejected.includes("objects[0]"));
});

test("asset ids must belong to this room and have the right type", () => {
  const { patch, rejected } = cleanPatch(
    {
      skybox: { asset_id: "zzz" },
      surfaces: { walls: "a1", floor: "s1" },
      posters: [{ asset_id: "a2", slot: 3, caption: "the red figure" }, { asset_id: "made-up", slot: 4, caption: "" }],
      audio: { ambient_asset_id: "a1" },
    },
    assets
  );
  assert.deepEqual(patch.skybox, undefined);
  assert.deepEqual(patch.surfaces, { walls: "a1" });
  assert.deepEqual(patch.posters, [{ asset_id: "a2", slot: 3, caption: "the red figure" }]);
  assert.equal(patch.audio, undefined);
  assert.ok(rejected.includes("skybox.asset_id"));
  assert.ok(rejected.includes("surfaces.floor"));
  assert.ok(rejected.includes("posters[1]"));
  assert.ok(rejected.includes("audio.ambient_asset_id"));
});

test("surfaces accept presets as well as image assets", () => {
  const { patch } = cleanPatch({ surfaces: { walls: "marble", floor: "a1" } }, assets);
  assert.deepEqual(patch.surfaces, { walls: "marble", floor: "a1" });
});

test("numbers are clamped and strings are cut to their limits", () => {
  const { patch } = cleanPatch({ title: "x".repeat(80), fog: { density: 3 }, capacity: 5000, welcome_text: "w".repeat(400) }, assets);
  assert.equal(patch.title.length, 40);
  assert.equal(patch.fog.density, 1);
  assert.equal(patch.capacity, 200);
  assert.equal(patch.welcome_text.length, 280);
});

test("the model can never change status or pricing", () => {
  const { patch, rejected } = cleanPatch({ status: "approved", pricing: { type: "ticket", keys: 500 }, version: 9 }, assets);
  assert.deepEqual(patch, {});
  assert.ok(rejected.includes("status"));
  assert.ok(rejected.includes("pricing"));
  assert.ok(rejected.includes("version"));
});

test("applyPatch merges nested objects and replaces lists", () => {
  const bp = emptyBlueprint();
  const a = applyPatch(bp, { palette: { primary: "#000000" }, posters: [{ asset_id: "a1", slot: 1, caption: "" }] });
  const b = applyPatch(a, { palette: { accent: "#ff00ff" }, posters: [{ asset_id: "a2", slot: 2, caption: "two" }] });
  assert.equal(b.palette.primary, "#000000");
  assert.equal(b.palette.accent, "#ff00ff");
  assert.deepEqual(b.posters, [{ asset_id: "a2", slot: 2, caption: "two" }]);
  assert.equal(bp.palette.primary, emptyBlueprint().palette.primary, "the original is not mutated");
});

test("a submit needs a title, archetype, palette, one visual asset and welcome text", () => {
  const bp = emptyBlueprint();
  assert.deepEqual(missingForSubmit(bp), ["title", "archetype", "palette", "visual", "welcome_text"]);
  const done = applyPatch(bp, {
    title: "Salt Chapel",
    archetype: "cathedral",
    palette: { primary: "#111111", secondary: "#222222", accent: "#ffffff", fog: "#000000" },
    posters: [{ asset_id: "a1", slot: 1, caption: "" }],
    welcome_text: "kneel, or don't",
  });
  assert.deepEqual(missingForSubmit(done), []);
});

test("the lists are what the renderer builds", () => {
  assert.equal(ARCHETYPES.length, 8);
  assert.ok(OBJECTS.length >= 15 && OBJECTS.length <= 25);
});

test("the answer schema stays within the API's limit of 24 optional fields", async () => {
  const { TURN_SCHEMA } = await import("./blueprint.mjs");
  let optional = 0;
  const walk = (s) => {
    if (!s || typeof s !== "object") return;
    if (s.type === "object" || s.properties) {
      for (const k of Object.keys(s.properties || {})) if (!(s.required || []).includes(k)) optional++;
    }
    for (const v of Object.values(s)) if (v && typeof v === "object") Array.isArray(v) ? v.forEach(walk) : walk(v);
  };
  walk(TURN_SCHEMA);
  assert.ok(optional <= 24, `${optional} optional fields`);
  const walkObjects = (s) => {
    if (!s || typeof s !== "object") return;
    if (s.type === "object") assert.equal(s.additionalProperties, false);
    for (const v of Object.values(s)) if (v && typeof v === "object") Array.isArray(v) ? v.forEach(walkObjects) : walkObjects(v);
  };
  walkObjects(TURN_SCHEMA);
});

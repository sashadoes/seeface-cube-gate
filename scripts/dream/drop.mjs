// The daily dream drop: once a day Claude invents a handful of strange objects
// and one dream event for the labyrinth, built ONLY from the fixed menu in
// src/labyrinth/dream-menu.json (shapes, motions, gifts, particles). The game
// renders them; nothing here is ever shown as text on screen.
//
//   ANTHROPIC_API_KEY=... node scripts/dream/drop.mjs [YYYY-MM-DD]
//
// Writes public/dream/<date>.json and public/dream/today.json. Run daily by
// .github/workflows/dream.yml. Output is clamped to the menu, so a bad answer
// can never break the game.
import Anthropic from "@anthropic-ai/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const menu = JSON.parse(await readFile(new URL("../../src/labyrinth/dream-menu.json", import.meta.url), "utf8"));
const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const outDir = new URL("../../public/dream/", import.meta.url);

// recent drops, so tomorrow's dream doesn't repeat today's
const recent = [];
for (let d = 1; d <= 5; d++) {
  const day = new Date(Date.parse(date) - d * 86_400_000).toISOString().slice(0, 10);
  try {
    const old = JSON.parse(await readFile(new URL(`${day}.json`, outDir), "utf8"));
    recent.push(`${day}: "${old.title}" — ${old.objects.map((o) => o.name).join(", ")}`);
  } catch {}
}

const hex = { type: "string", description: "colour as #rrggbb" };
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "objects", "event"],
  properties: {
    title: { type: "string", description: "the dream's name, lowercase, 2-6 words" },
    objects: {
      type: "array",
      description: `${menu.objects.min}-${menu.objects.max} objects`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "shape", "colour", "glow", "size", "motion", "tone", "gift"],
        properties: {
          name: { type: "string", description: "lowercase, 1-4 words" },
          shape: { type: "string", enum: menu.shapes },
          colour: hex,
          glow: hex,
          size: { type: "number", description: "0.3 to 1.6 metres" },
          motion: { type: "string", enum: menu.motions },
          tone: { type: "string", enum: menu.tones },
          gift: { type: "string", enum: menu.gifts },
        },
      },
    },
    event: {
      type: "object",
      additionalProperties: false,
      required: ["name", "sky", "fog", "particles", "particleColour", "gravity"],
      properties: {
        name: { type: "string", description: "lowercase, 2-5 words" },
        sky: hex,
        fog: hex,
        particles: { type: "string", enum: menu.particles },
        particleColour: hex,
        gravity: { type: "string", enum: menu.gravity },
      },
    },
  },
};

const system = `You dream up one day of the labyrinth at seeface.world: an endless, dark, dreamlike 3D maze
("the after life") where real people wander, meet and share snapshots. Each day you invent a small set of
strange, beautiful objects that float in its corridors and one shared dream event that happens a few times
that day for everyone at once.

Rules for the names (they appear only on snapshot cards, never as on-screen messages):
- lowercase, short, poetic, a bit eerie; dream logic, not fantasy-RPG.
- original only: no real people, brands, songs, films, games or trademarks.
- never use the words "ai", "bot", "robot" or "artificial".
- no ghosts, no red curtains, no gore, nothing sexual, no drugs.
Colours: the maze is dark and monochrome, so objects should be vivid and glowing; vary the palette day to day.
Gifts: most objects give "nothing" or "blood1"; at most one "blood3"; mix in "light", "float", "colours".`;

const client = new Anthropic();
const response = await client.beta.messages.create({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  output_config: { effort: "medium", format: { type: "json_schema", schema } },
  system,
  messages: [
    {
      role: "user",
      content: `Dream the drop for ${date}.${recent.length ? `\n\nRecent days (don't repeat them):\n${recent.join("\n")}` : ""}`,
    },
  ],
});
if (response.stop_reason === "refusal") throw new Error(`refused: ${JSON.stringify(response.stop_details)}`);
const text = response.content.find((b) => b.type === "text")?.text;
if (!text) throw new Error(`no text in response (stop_reason ${response.stop_reason})`);
const drop = sanitize(JSON.parse(text));

await mkdir(outDir, { recursive: true });
const json = JSON.stringify({ date, ...drop }, null, 2) + "\n";
await writeFile(new URL(`${date}.json`, outDir), json);
await writeFile(new URL("today.json", outDir), json);
console.log(`dreamed "${drop.title}" for ${date}: ${drop.objects.map((o) => o.name).join(", ")} · event "${drop.event.name}"`);

// ------------------------------------------------------------------ clamp to the menu
function sanitize(d) {
  const name = (s, fallback) => {
    const clean = String(s ?? "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N} '\-·]/gu, "")
      .replace(/\b(ai|bot|robot|artificial)\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
    return clean || fallback;
  };
  const colour = (c, fallback) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : fallback);
  const pick = (v, list) => (list.includes(v) ? v : list[0]);
  const objects = (Array.isArray(d.objects) ? d.objects : []).slice(0, menu.objects.max).map((o, i) => ({
    name: name(o.name, `thing ${i + 1}`),
    shape: pick(o.shape, menu.shapes),
    colour: colour(o.colour, "#9fe8ff"),
    glow: colour(o.glow, "#ffffff"),
    size: Math.min(1.6, Math.max(0.3, Number(o.size) || 0.7)),
    motion: pick(o.motion, menu.motions),
    tone: pick(o.tone, menu.tones),
    gift: pick(o.gift, menu.gifts),
  }));
  if (objects.length < menu.objects.min) throw new Error(`only ${objects.length} objects`);
  // at most one big gift a day
  let big = 0;
  for (const o of objects) if (o.gift === "blood3" && big++) o.gift = "blood1";
  const e = d.event ?? {};
  return {
    title: name(d.title, "an untitled dream"),
    objects,
    event: {
      name: name(e.name, "the dreaming"),
      sky: colour(e.sky, "#20103a"),
      fog: colour(e.fog, "#100820"),
      particles: pick(e.particles, menu.particles),
      particleColour: colour(e.particleColour, "#ffffff"),
      gravity: pick(e.gravity, menu.gravity),
    },
  };
}

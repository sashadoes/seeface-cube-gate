// Lists every interface string that needs a translation, and reports which
// language files are missing which lines.
//   node scripts/i18n-keys.mjs            → writes src/i18n/_keys.json, prints gaps
// Keys are the English text: literal tr("…") / t("…") calls, plus the label
// lists that are translated where they're shown (items, quests, settings…).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const keys = new Set();
const add = (k) => k && keys.add(k.replace(/\\"/g, '"'));

// literal calls
for (const f of ["src/labyrinth/Labyrinth.tsx", "src/labyrinth/LabMap.tsx", "src/components/music/MusicToggle.tsx"]) {
  for (const m of read(f).matchAll(/\btr?\("((?:[^"\\]|\\.)+)"/g)) add(m[1]);
}
// quick phrases, settings label pairs, tabs, emotes
const lab = read("src/labyrinth/Labyrinth.tsx");
for (const m of lab.matchAll(/\["\w+", "([^"]+)"\]/g)) add(m[1]);
for (const m of lab.match(/\{\["hi",[^\]]+\]/)[0].matchAll(/"([^"]+)"/g)) add(m[1]);
for (const m of lab.matchAll(/\(\[("[^\]]+")\] as const\)\.map/g)) for (const n of m[1].matchAll(/"([^"]+)"/g)) add(n[1]);
for (const m of lab.matchAll(/kind === "(?:stare|spin|melt|float)" \? "([^"]+)"|: "(screams)"\)/g)) add(m[1] ?? m[2]);
for (const m of (lab.match(/const WARN = \{[^}]+\}/)?.[0] ?? "").matchAll(/: "([^"]+)"/g)) add(m[1]);
for (const m of (lab.match(/const PLACE_NAMES[^;]+;/)?.[0] ?? "").matchAll(/: "([^"]+)"/g)) add(m[1]);
for (const m of (lab.match(/const ERR[^;]+;/)?.[0] ?? "").matchAll(/: "([^"]+)"/g)) add(m[1]);
for (const m of read("src/labyrinth/net.ts").matchAll(/EMOTES = \[([^\]]+)\]/g)) for (const n of m[1].matchAll(/"([^"]+)"/g)) add(n[1]);
// lists from other modules
for (const m of read("src/labyrinth/inventory.ts").matchAll(/name: "([^"]+)", glyph: "[^"]+", blurb: "([^"]+)"/g)) (add(m[1]), add(m[2]));
for (const m of read("src/labyrinth/quests.ts").matchAll(/text: "([^"]+)"/g)) add(m[1]);
for (const m of read("src/labyrinth/events.ts").matchAll(/name: "([^"]+)"/g)) add(m[1]);
for (const m of read("src/labyrinth/music.ts").matchAll(/name: "([^"]+)"/g)) add(m[1]);
for (const m of read("src/labyrinth/stations.ts").matchAll(/name: "([^"]+)" \}/g)) add(m[1]);
for (const m of read("src/labyrinth/wishes.ts").matchAll(/label: "([^"]+)"/g)) add(m[1]);
// the café menu of the brand campaigns (names + notes)
for (const m of read("src/brands/campaigns.ts").matchAll(/name: "([^"]+)", note: "([^"]+)"/g)) (add(m[1]), add(m[2]));

const list = [...keys].sort();
writeFileSync(new URL("../src/i18n/_keys.json", import.meta.url), JSON.stringify(list, null, 1) + "\n");
console.log(`${list.length} strings`);
for (const f of readdirSync(new URL("../src/i18n/", import.meta.url)).filter((f) => /^[a-z]{2}\.json$/.test(f))) {
  const d = JSON.parse(read(`src/i18n/${f}`));
  const missing = list.filter((k) => !d[k]);
  console.log(`${f}: ${missing.length ? `${missing.length} missing` : "complete"}`);
}

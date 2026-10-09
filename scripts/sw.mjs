// After the build: writes dist/sw.js, the Service Worker that makes repeat
// visits load almost instantly. It gets the list of files the labyrinth needs
// on its first frame (its JS chunks + CSS, followed through their imports), the
// entrance zone's images and the game sounds. VERSION is a hash of every built
// file name, so each deploy installs a new worker and old caches are dropped.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";

const assets = await readdir("dist/assets");
const VERSION = createHash("sha1").update(assets.sort().join("|")).digest("hex").slice(0, 10);

// the labyrinth's chunk and everything it imports statically (not the lazy ones)
const core = new Set();
async function follow(file) {
  if (core.has(file)) return;
  core.add(file);
  if (!file.endsWith(".js")) return;
  const src = await readFile(`dist/assets/${file}`, "utf8");
  for (const m of src.matchAll(/from\s*"\.\/([^"]+)"|import\s*"\.\/([^"]+)"/g)) await follow(m[1] ?? m[2]);
}
const entry = assets.find((f) => /^Labyrinth-.*\.js$/.test(f));
if (!entry) throw new Error("sw.mjs: no Labyrinth chunk in dist/assets");
await follow(entry);
for (const f of assets) if (/^Labyrinth-.*\.css$/.test(f)) core.add(f);
// loaded right after the first frame (multiplayer relay), so warm it too
for (const f of assets) if (/^mqtt\.esm-.*\.js$/.test(f)) await follow(f);

// the entrance (monogram halls) wall + floor images, exactly as zones.ts asks for them
const pics = [0, 1, 2, 3].map((v) => `monogram-wall-${v}`).concat("monogram-floor-0").flatMap((s) => [32, 512].map((px) => `https://picsum.photos/seed/seeface1-${s}/${px}?grayscale`));

const sounds = (await readdir("public/sounds")).map((f) => `/sounds/${f}`);
const WARM = [...[...core].map((f) => `/assets/${f}`), "/imgs/seeface-logo-transparent.png", ...sounds, ...pics];

const sw = (await readFile("scripts/sw.template.js", "utf8")).replace("__VERSION__", VERSION).replace("__WARM__", JSON.stringify(WARM, null, 1));
await writeFile("dist/sw.js", sw);
console.log(`sw: version ${VERSION}, ${WARM.length} files to warm (${core.size} core chunks)`);

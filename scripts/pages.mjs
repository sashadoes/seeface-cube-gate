// After the build: one real HTML page per address (so links answer 200 and
// search engines see the right canonical/title for each), plus the 404 fallback.
import { mkdir, readFile, writeFile } from "node:fs/promises";

const html = await readFile("dist/index.html", "utf8");
const SITE = "https://seeface1.world";
const pages = {
  labyrinth: { title: "seeface1 · the labyrinth", description: "The labyrinth behind the seeface1 cube: an endless 3D maze you walk with strangers. Floods, a Pop Queen, secret rooms. Play in your browser.", index: true },
  privacy: { title: "seeface1 · privacy", description: "What seeface1 keeps and why.", index: true },
  artists: { title: "seeface1 · artists", description: "The agreement artists accept when they hang their work in the seeface1 labyrinth.", index: true },
  marks: { title: "seeface1 · marks", description: "seeface1 marks.", index: false },
  "the-eye": { title: "the eye", description: "", index: false },
};

const page = (path, p) =>
  html
    .replace(/<title>[^<]*<\/title>/, `<title>${p.title}</title>`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${SITE}/${path}/" />`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${p.description}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${SITE}/${path}/" />`)
    .replace(/<meta name="robots" content="[^"]*" \/>/, `<meta name="robots" content="${p.index ? "index, follow, max-image-preview:large" : "noindex, nofollow"}" />`);

await writeFile("dist/404.html", html);
for (const [path, p] of Object.entries(pages)) {
  await mkdir(`dist/${path}`, { recursive: true });
  await writeFile(`dist/${path}/index.html`, page(path, p));
}
console.log("pages:", Object.keys(pages).join(", "));

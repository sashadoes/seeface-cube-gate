// After the build: one real HTML page per address (so links answer 200 and
// search engines see the right canonical/title for each), plus the 404 fallback.
import { mkdir, readFile, writeFile } from "node:fs/promises";

// The test site (VITE_STAGE=test: dev.seeface.world + branch previews): hidden
// from search, never counted in GoatCounter, "test ·" in every title.
const TEST = process.env.VITE_STAGE === "test";
const testify = (h) =>
  !TEST
    ? h
    : h
        .replace(/\s*<script data-goatcounter=[^>]*><\/script>/, "")
        .replace(/<title>([^<]*)<\/title>/, "<title>test · $1</title>")
        .replace(/<meta name="robots" content="[^"]*" \/>/, '<meta name="robots" content="noindex, nofollow" />');

const html = await readFile("dist/index.html", "utf8");
const SITE = "https://seeface.world";
const pages = {
  labyrinth: { title: "seeface1 · the labyrinth", description: "The labyrinth behind the seeface1 cube: an endless 3D maze you walk with strangers. Floods, a Pop Queen, secret rooms. Play in your browser.", index: true },
  privacy: { title: "seeface1 · privacy", description: "What seeface1 keeps and why.", index: true },
  artists: { title: "seeface1 · artists", description: "The agreement artists accept when they hang their work in the seeface1 labyrinth.", index: true },
  marks: { title: "seeface1 · marks", description: "seeface1 marks.", index: false },
  "the-eye": { title: "the eye", description: "", index: false },
  architects: { title: "seeface1 · the Architects", description: "The labyrinth is choosing its first 100 Architects. Build a permanent room from your work, host shows, keep your IP.", index: true },
  "architects/join": { title: "seeface1 · answer the call", description: "Apply to become one of the first 100 Architects of the seeface1 labyrinth.", index: true },
  "architects/terms": { title: "seeface1 · Architect Terms", description: "The Architect Terms for seeface1 rooms.", index: true },
  chamber: { title: "the Creation Chamber", description: "", index: false },
  "admin/architects": { title: "architects · review", description: "", index: false },
};

const page = (path, p) =>
  html
    .replace(/<title>[^<]*<\/title>/, `<title>${p.title}</title>`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${SITE}/${path}/" />`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${p.description}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${SITE}/${path}/" />`)
    .replace(/<meta name="robots" content="[^"]*" \/>/, `<meta name="robots" content="${p.index ? "index, follow, max-image-preview:large" : "noindex, nofollow"}" />`);

await writeFile("dist/404.html", testify(html));
for (const [path, p] of Object.entries(pages)) {
  await mkdir(`dist/${path}`, { recursive: true });
  await writeFile(`dist/${path}/index.html`, testify(page(path, p)));
}
if (TEST) {
  await writeFile("dist/index.html", testify(html));
  await writeFile("dist/robots.txt", "User-agent: *\nDisallow: /\n");
  // Cloudflare Pages reads this file: no search engine indexes any test page
  await writeFile("dist/_headers", "/*\n  X-Robots-Tag: noindex, nofollow\n");
  console.log("test site: noindex, no analytics");
}
console.log("pages:", Object.keys(pages).join(", "));

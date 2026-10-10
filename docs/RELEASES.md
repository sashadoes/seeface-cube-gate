# Branches, test site and releases

*Agreed with the owner on 2026-10-10.*

## Three places, three branches

| Branch | Where you see it | Who puts code there |
|---|---|---|
| `main` | **seeface.world** (live, real players) via GitHub Pages | **Only the owner**, by merging a release PR |
| `develop` | **dev.seeface.world** (the test site) via Cloudflare Pages | Finished features, through a PR |
| `feature/*`, `fix/*` | **Its own link** per branch (`<branch>.seeface.pages.dev`) | Every push, automatically |

## The flow

1. **Start** every piece of work as a branch off `develop`: `feature/<name>`, or `fix/<name>` for bugs.
2. **Push early, push often.** Every push builds the branch's own link within about a minute. The owner opens it on their phone, on their own internet, like a real player would. Agents send the link as soon as something can be tried.
3. **Done?** Open a PR into `develop`. Merging it puts the feature on dev.seeface.world, together with everything else that's finished.
4. **Release.** When dev.seeface.world feels right, a PR `develop → main` is prepared ("release: …" with a plain list of what's in it). **The owner merges it.** That is the only way code reaches seeface.world.
5. **Hotfix** (the live site is broken): `fix/<name>` off `main` → PR into `main` (the owner merges) → then merge `main` back into `develop`.

## The test site is its own world

Every build with `VITE_STAGE=test` (`src/stage.ts`) is a test build. It covers dev.seeface.world and every branch link.

- **A separate world on the relay:** it uses `seeface1-test/...` instead of `seeface1/...`. Test players never meet real ones, and unfinished features never reach them.
- **The live data stays clean:** the live /the-eye, the champions' board and the play journals aren't touched. The test site's own `/the-eye` shows the test world.
- **Every visitor is marked "test"** (`k: "d"`).
- **No tracking or caching:** no GoatCounter and no service worker, so every reload shows the newest push.
- **Hidden from search engines:** a noindex meta tag, `X-Robots-Tag`, and a `Disallow: /` robots.txt. Every title starts with "test ·".
- **No accounts API** (`VITE_API_URL` is not set), so no test accounts land in the real database.

## Cloudflare Pages settings (one-time)

The project is connected to GitHub `sashadoes/seeface.world`.

- **Production branch:** `develop`, served at dev.seeface.world.
- **Preview branches:** all branches except `main` (main is served by GitHub Pages).
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment variables** (both production and preview): `VITE_STAGE=test`, `NODE_VERSION=22`
- **Custom domain:** `dev.seeface.world`. At Namecheap, add a CNAME record `dev` → `<project>.pages.dev`.

## Rules for agents

- **Never push to `main`.** The only automatic writer to main is the daily dream drop (`dream.yml`).
- **Commit and push work as you go,** so nothing lives only in a local folder. Give the owner the branch link.
- **One feature per branch, one PR per feature.** Keep `develop` buildable.

# Deploying to Cloudflare Pages

Pages hosts one thing: the `browserbible/` app, built by Vite into
`browserbible/dist` and served as a plain static bundle. Cloudflare's Git
integration runs the build. There is no deploy step in CI.

Nothing else in the monorepo is deployed. Every file in the production bundle
originates in `browserbible/` (`index.html`, `js/bundle.js`, `css/main.css`, and
the `public/` tree: content data, fonts, images, i18n resources, `_headers`,
`robots.txt`, the web manifest). `tools/`, `e2e/`, `tests/`, `docs/`, `sites/`,
and `verse-detection/dist/` are all absent from the output. Keep it that way,
and see [Build watch paths](#build-watch-paths) for keeping commits to those
directories from triggering deployments at all.

## One-time Pages project setup

In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to
Git**, pick this repository, then set:

| Setting | Value |
| --- | --- |
| Project name | `inscript` (must match `name` in `wrangler.toml`) |
| Production branch | `main` (must match `PAGES_PRODUCTION_BRANCH` in `vite.config.js`) |
| Framework preset | None |
| Build command | `pnpm run build:cf` |
| Build output directory | `browserbible/dist` |
| Root directory | *(leave empty, meaning the repo root)* |
| Build watch paths | see [below](#build-watch-paths); the default rebuilds on every push |

The root directory stays the repo root even though only `browserbible/` is
deployed: the build needs the root `package.json`, `pnpm-workspace.yaml`, and
`vite.config.js`, and `vite.config.js` sets `root: 'browserbible'` itself. That
is also why `wrangler.toml` sits at the repo root rather than inside
`browserbible/`.


**No environment variables are needed.** Everything the build depends on is in
version control:

- **Node version**: `.node-version` (`24.18.0`, the current Node 24 LTS).
  Without it the v3 build image defaults to 22.16.0. Pin a full `x.y.z`: the
  Cloudflare docs promise "any version" via `.node-version`/`.nvmrc` but do not
  say a bare major like `24` resolves, and codenames are explicitly unsupported.
- **pnpm version**: the `packageManager` field in `package.json`. The v3 build
  image does *not* infer a pnpm version from `pnpm-lock.yaml`, so this pin is
  what keeps Pages, CI, and local installs on the same pnpm.
- **Site profile**: derived from `CF_PAGES_BRANCH`, see below.

## Build watch paths

This is a monorepo, but Pages hosts only the `browserbible/` app. By default a
Pages project rebuilds on *every* push, so a commit touching only Playwright
specs or a README would burn a build and publish a pointless deployment. Scope it
under **Settings → Build → Build watch paths**:

| Field | Value |
| --- | --- |
| Include paths | `*` |
| Exclude paths | `docs/*`, `e2e/*`, `tests/*`, `tools/*`, `scripts/*`, `dist-offline/*`, `.github/*`, `.qlty/*`, `.claude/*`, `README.md`, `LICENSE`, `knip.json`, `eslint.config.js`, `playwright.config.js`, `vitest.config.js`, `esbuild.config.js` |

Excludes are deny-list rather than allow-list on purpose. Cloudflare evaluates
excludes first and then checks what survives against the includes, so an
allow-list of `browserbible/*, verse-detection/*, sites/*, …` would silently stop
deploying if a new build input ever landed at the repo root. With `*` included,
the failure mode of forgetting to update this list is one wasted build, not a
missed deploy.

What must keep triggering a build, and does:

- `browserbible/*`: the app itself.
- `verse-detection/*`: its *source* compiles into `js/bundle.js` via the
  `@verse-detection` import in `js/windows/NotesWindow/references.js`, so a
  change there does change the deployed bundle. Do not exclude it.
- `sites/*`: read at build time to pick the profile.
- `vite.config.js`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
  `wrangler.toml`, `.node-version`: the build inputs.

`tools/*` is excluded even though it generates content (basemaps, video
manifests): its *output* is committed under `browserbible/public/content`, and
that path triggers a build normally. The tools never run during a Pages build.

Two gotchas in Cloudflare's matching:

- The wildcard is a single splat, not full glob, and `*` matches path separators.
  Patterns are anchored at the repository root, so `tests/*` matches only the
  root `tests/` directory, but a *leading* `*` makes a pattern depth-agnostic
  (`*.md` would match `.md` files anywhere, which is why the list above names
  `README.md` explicitly rather than excluding all Markdown).
- Watch paths are bypassed entirely for pushes with 0 changed files, 3,000+
  changed files, or 20+ commits. A large merge into `main` always rebuilds.

Watch paths are dashboard-only. They cannot be expressed in `wrangler.toml`.

## Site profiles

`sites/*.json` gates windows, features, and the API proxy URLs per deployment.
`vite.config.js` picks the profile in this order:

1. An explicit `SITE` env var (`SITE=dev vite build`).
2. On Pages (`CF_PAGES=1`): `main` → `inscript`, any other branch → `dev`.
3. Otherwise: `vite build` → `inscript`, `vite dev` → `dev`.

So production gets the `inscript` profile (MapWindow/NotesWindow/DeafBibleWindow
disabled, highlighter off, no sourcemaps) while branch previews get the `dev`
profile with every window enabled and sourcemaps on. Preview URLs are public, so
those sourcemaps are public too, which is fine for this repo (MIT, public
source), but worth remembering before pushing a branch with unreleased work.

`pnpm run build:cf` is deliberately just `vite build` with no `SITE`, because setting
one would override the branch detection. Use `pnpm build` / `pnpm build:dev`
locally to force a profile.

## What actually gets deployed

A clean checkout builds to **56 files / ~6 MB**, far under the Pages limits
(20,000 files, 25 MB per file).

That is because the bulk of the content is *not* in the repo. `browserbible/public/content/texts`,
`content/lexicons`, and `content/commentaries` are gitignored and served from
`baseContentUrl` (`https://inscript.bible.cloud/`) at runtime. The build's
`copyPublicExcludingTexts` plugin also skips `content/texts` explicitly, so a
local checkout that *does* have the starter pack unpacked still produces a small
production bundle. Only the small bundled data (maps, parallels, media
manifests, flags) ships with the site.

## Headers

`browserbible/public/_headers` is copied into `dist/` by the build and Pages
applies it verbatim: security headers on `/*`, plus per-path `Cache-Control`.

Nothing in the bundle is content-hashed (the entry is pinned to
`js/bundle.js` and hashes are stripped from CSS/font/image names), so no asset
can be cached immutably: `js/bundle.js` and `css/main.css` must revalidate or a
deploy would not reach returning visitors. Fonts and images get a 30-day
`max-age` because their bytes are stable even when their names are reused.

The Content-Security-Policy is *not* in `_headers`; `vite.config.js` injects it
into `index.html` as a `<meta>` tag so it holds on any host.

Note that same-named headers from multiple matching `_headers` rules are
combined rather than overridden, which is why the `/*` block has no
`Cache-Control`, because a global value would collide with the per-path ones.

There is intentionally **no `_redirects` SPA fallback**. All app state lives in
query parameters, never in the path, so nothing needs rewriting to
`index.html`, and a catch-all would turn missing content files into `200 OK`
HTML, which the runtime's graceful-degradation paths (missing search index,
missing `about.html` per text) rely on seeing as real 404s.

## `wrangler.toml`

Declares the project name, compatibility date, and build output directory.
Adopting it makes those fields read-only in the dashboard: the build command
and root directory stay dashboard-only either way, since Pages does not read
them from the Wrangler config. It also means dashboard-set variables are
ignored, which is why the build takes its inputs from files instead.

## Local verification

```sh
pnpm build:cf                 # exactly what Pages runs
pnpm preview:cf               # serve dist through wrangler, so _headers apply
```

`pnpm preview` (Vite's own preview server) is faster but ignores `_headers`.

To reproduce a Pages build precisely, including the branch-derived profile and
the dropped precompression:

```sh
CF_PAGES=1 CF_PAGES_BRANCH=main pnpm run build:cf        # production
CF_PAGES=1 CF_PAGES_BRANCH=my-branch pnpm run build:cf   # preview
```

Precompressed `.gz`/`.br` siblings are skipped when `CF_PAGES` is set: Pages
compresses responses itself and never serves them, so they would only double the
asset count. Other hosts (nginx `gzip_static`) still get them.

## The API proxy deploys separately

`apiBibleProxyBase`, `bibleBrainProxyBase`, and `esvProxyBase` point at
`https://api.inscript.org`, a Cloudflare Worker that holds the API.Bible,
Bible Brain, and ESV API keys. Its source lives in this repo under `proxy/`
(see `proxy/README.md`), but it is a separate deployment: a Pages deploy does
not update it, and `wrangler deploy` from `proxy/` does not touch the
frontend. Local dev expects it on `http://localhost:8787`; the root `pnpm dev`
starts it alongside Vite (or run `pnpm dev` in `proxy/` alone). The ESV routes (`/esv/v3/passage/html/` and
`/esv/v3/passage/search/`) forward to `https://api.esv.org/v3/` with the
`Authorization: Token` header added.

If the Pages project's build watch paths exclude non-app directories, add
`proxy/*` to the exclusions so worker-only commits don't trigger a frontend
deploy.

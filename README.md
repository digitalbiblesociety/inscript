# BrowserBible v4 (inScript)

Bible study software that runs entirely in the browser. Read, listen to, and
search Bible translations in many languages, side by side, online or from local
files. Created by [John Dyer](https://j.hn/) and maintained by the
[Digital Bible Society](https://dbs.org).

Built with vanilla ES6 JavaScript (no framework), a plugin-based architecture,
and bundled with [Vite](https://vitejs.dev/).

## Features

- Multiple linked, resizable windows: **Bible**, **Commentary**, **Search**,
  **Parallels**, **Text Comparison**, **Statistics**, **Audio**, **Maps**
  (with journeys), **Media**, **Notes**, and **Deaf Bible** video.
- Pluggable text providers (local files, API.Bible, Bible Brain, commentaries).
- Highlighting, Greek/Hebrew lemma popups, cross-references, and visual filters.
- Custom i18n for the UI in 13 languages.
- Deep-linkable state via the URL query string.

## Quick start

Prerequisites: [Node.js](https://nodejs.org) and
[pnpm](https://pnpm.io) (this is a pnpm workspace).

```bash
pnpm install
pnpm fetch-starter-pack   # downloads ~95 MB of 17 freely shareable Bibles
pnpm dev                  # start the Vite dev server on http://localhost:3000
```

The starter pack of 17 Bibles covers roughly 90% of the world's population. For
additional Bibles see [dbs.org](https://dbs.org),
[ebible.org](https://ebible.org/find/), and [fetch.bible](https://fetch.bible).
You can also fetch and unzip it manually:

```bash
wget https://bibles.dbs.org/_assets/starter-pack.zip && unzip starter-pack.zip
```

## Build & deploy

Output goes to `browserbible/dist/` and targets ES2022. The build has two
profiles selected by the `SITE` env var (`sites/{SITE}.json`), which also
control which windows/features are enabled and which proxy URLs are baked in:

```bash
pnpm build        # production (SITE=inscript): no sourcemaps, texts loaded
                  # from the content CDN, prod window/feature gating. Deploy this.
pnpm build:dev    # dev build: sourcemaps + local texts bundled, all windows on.
```

`vite.config.js` defaults any `vite build` to the production profile and any
`vite dev` (serve) to `dev`. The production app expects its content CDN and
API proxies to be reachable from the deploy origin (the proxies are CORS-locked
to a specific origin), so serve it from the configured host.

Deployment is Cloudflare Pages via its Git integration — `pnpm run build:cf`,
output `browserbible/dist`, with the profile derived from the branch. See
[docs/Deployment-Cloudflare.md](docs/Deployment-Cloudflare.md).

## Testing

```bash
pnpm test          # Vitest unit + integration tests (jsdom)
pnpm test:coverage # with coverage
pnpm test:e2e      # Playwright end-to-end tests (auto-starts the dev server)
pnpm lint          # ESLint
```

E2E tests run in two profiles across Chromium/Firefox/WebKit: `*-remote`
(content from the CDN) and `*-local` (`?custom=local`, content from the
extracted starter pack).

## Project layout

- `browserbible/js/` application source (see `CLAUDE.md` for the module map and
  path aliases).
- `browserbible/css/` global styles and theme variables.
- `browserbible/public/` static content, i18n resources, and media.
- `verse-detection/` standalone TypeScript package for detecting Bible
  references in text (workspace dependency).
- `sites/` per-deployment build profiles.
- `tools/` build-time content authoring scripts.

## Configuration

Runtime options live in `browserbible/js/core/config.js` (see `docs/Configuration.md`).
Presets are selectable at runtime with `?custom=<name>` (built-in: `dbs`,
`local`), and user settings persist to `localStorage`.

## License

[MIT](LICENSE) © John Dyer and the Digital Bible Society.

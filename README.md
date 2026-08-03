# inScript

Bible study software that runs entirely in the browser: read, listen to, and search
translations in many languages, side by side, online or from local files. Vanilla ES6
with a plugin architecture, bundled with [Vite](https://vitejs.dev/). Created by
[John Dyer](https://j.hn/), maintained by the [Digital Bible Society](https://dbs.org).

Linked, resizable windows for Bible, Commentary, Search, Parallels, Text Comparison,
Statistics, Audio, Maps, Media, Notes, and Deaf Bible video. Pluggable text providers
(local files, API.Bible, Bible Brain, commentaries), highlighting, Greek/Hebrew lemma
popups, cross-references, UI in 13 languages, and deep-linkable state in the URL.

## Quick start

Needs [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io) (this is a pnpm workspace).

```bash
pnpm install
pnpm fetch-starter-pack   # ~95 MB, 17 Bibles reaching ~90% of the world's population
pnpm dev                  # http://localhost:3000
```

Texts are gitignored. For more, see [dbs.org](https://dbs.org),
[ebible.org](https://ebible.org/find/), and [fetch.bible](https://fetch.bible).

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server on port 3000 |
| `pnpm build` | Production build. Deploy this. |
| `pnpm build:dev` | Sourcemaps, local texts bundled, all windows enabled |
| `pnpm test` | Vitest unit + integration, in jsdom |
| `pnpm test:e2e` | Playwright across Chromium, Firefox, and WebKit |
| `pnpm lint` | ESLint |

Output lands in `browserbible/dist/` targeting ES2022. The `SITE` env var selects a
profile from `sites/` (`inscript` for `build`, `dev` for `build:dev`) which gates
windows and features and bakes in proxy URLs. Production loads texts from the content
CDN, and its API proxies are CORS-locked to one origin, so serve it from the
configured host.

E2E runs two profiles per browser: `*-remote` for CDN content, `*-local` for
starter-pack content via `?custom=local`.

## Configuration

Runtime options live in `browserbible/js/core/config.js`, documented in
[docs/Configuration.md](docs/Configuration.md). Presets apply at runtime via
`?custom=<name>` (built-in: `local`), and user settings persist to `localStorage`.

## License

[MIT](LICENSE) © John Dyer and the Digital Bible Society.

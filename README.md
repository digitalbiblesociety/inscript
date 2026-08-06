# inScript

[![Maintainability](https://qlty.sh/gh/digitalbiblesociety/projects/inscript/maintainability.svg)](https://qlty.sh/gh/digitalbiblesociety/projects/inscript) [![Code Coverage](https://qlty.sh/gh/digitalbiblesociety/projects/inscript/coverage.svg)](https://qlty.sh/gh/digitalbiblesociety/projects/inscript)

Bible study software that runs entirely in the browser: read, listen to, and search
translations in many languages, side by side, online or from local files. Vanilla ES6
with a plugin architecture, bundled with [Vite](https://vitejs.dev/). Originally created by
[John Dyer](https://j.hn/) and maintained by the [Digital Bible Society](https://dbs.org).

Linked, resizable windows for Bible, Commentary, Search, Parallels, Text Comparison,
Statistics, Audio, Maps, Media, Notes, and Deaf Bible video. Pluggable text providers
(local files, API.Bible, Bible Brain, commentaries), highlighting, Greek/Hebrew lemma
popups, cross-references, UI in 13 languages, and deep-linkable.

## Quick start

Needs [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm fetch-starter-pack   # ~95 MB
pnpm dev                  # http://localhost:3000
```

For additional bible texts, see [dbs.org](https://dbs.org), [ebible.org](https://ebible.org/find/), 
and [fetch.bible](https://fetch.bible).

## Scripts

| Command              | Purpose                 |
|----------------------|-------------------------|
| `pnpm dev`           | Dev server on port 3000 |
| `pnpm build`         | Production build.       |
| `pnpm build:dev`     | Development build       |
| `pnpm test`          | Vitest unit             |
| `pnpm test:coverage` | Merged test coverage    |
| `pnpm test:e2e`      | Playwright              |
| `pnpm lint`          | ESLint                  |

Output lands in `browserbible/dist/` targeting ES2022. The `SITE` env var selects a
profile from `sites/` (`inscript` for `build`, `dev` for `build:dev`) which gates
windows and features and bakes in proxy URLs. Production loads texts from the content
CDN, and its API proxies are CORS-locked to one origin, so serve it from the
configured host.

E2E runs two profiles per browser: `*-remote` for CDN content, `*-local` for
starter-pack content via `?custom=local`.

## Configuration

Runtime options live in `browserbible/js/core/config.js` and user settings persist to `localStorage`

## License

[MIT](LICENSE) © John Dyer and the Digital Bible Society.

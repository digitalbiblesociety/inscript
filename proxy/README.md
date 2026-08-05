# inscript-proxy

Cloudflare Worker behind `https://api.inscript.org` that holds the API keys the
inScript frontend (this repo's `browserbible/` app) must never see, and
forwards read-only requests to the upstream Bible APIs.

This is a workspace package of the inscript repo, but it deploys separately:
Cloudflare Pages deploys the frontend, `wrangler deploy` from this directory
deploys the worker. Neither deploys the other.

## Routes

| Proxy path | Upstream | Auth added |
|---|---|---|
| `/abs/v1/*` (and `/v1/*` in dev) | `https://api.scripture.api.bible/v1/*` | `api-key` header |
| `/fcbh/v4/bibles-all` | none: KV-cached daily catalog (see below) | n/a |
| `/fcbh/v4/*` | `https://4.dbt.io/api/*` | `?v=4&key=` query params |
| `/esv/v3/passage/html/`, `/esv/v3/passage/search/` | `https://api.esv.org/v3/passage/*` | `Authorization: Token` header |

Everything else is a 404. Only `GET`/`HEAD`/`OPTIONS` are accepted.

Additional behavior:

- **Cached Bible Brain catalog**: the upstream `/bibles` list is 60+ pages,
  which made the frontend's catalog load painfully slow. A cron trigger
  (every 15 min, no-op until the copy is ~4h old) crawls the whole list,
  keeps only bibles with readable text (`text_plain`/`text_format` filesets),
  prunes each entry to the fields the frontend uses, and stores the result in
  the `CATALOG` KV namespace. `/fcbh/v4/bibles-all` serves it in one request
  (`{ data, meta }`, `Cache-Control: max-age=3600`). While the cache is cold
  (right after the first deploy) the endpoint answers 503 and warms itself in
  the background; the frontend falls back to plain pagination. The crawl is
  resumable in chunks of `CATALOG_PAGES_PER_RUN` pages (default 32) so it
  stays under the free-plan limit of 50 subrequests per invocation, and the
  catalog is only replaced once a crawl fully succeeds: a failed refresh
  keeps the last good version serving.
- **CORS**: browser origins are checked against `ALLOWED_ORIGINS` in
  `wrangler.toml` (exact origins plus a `https://*.inscript.pages.dev`
  wildcard for Pages previews). Disallowed origins get a 403.
- **API.Bible allowlist**: only the bible ids in `API_BIBLE_IDS` are served,
  mirroring `config.apiBibleIncludeIds` in the frontend, so the key can't be
  used to pull other bibles. Keep the two lists in sync.
- **FUMS**: API.Bible fair-use reporting is done here, server-side, from the
  `meta.fumsToken` on content responses. Device/session ids are salted hashes
  of ip+user-agent; no raw PII is sent.
- **Status passthrough**: upstream status codes are preserved. The frontend
  specifically relies on seeing API.Bible 429s (its monthly-limit handling)
  and ESV 429s (rate limiting).

## Setup

All commands below run from this `proxy/` directory.

```sh
pnpm install    # from the repo root or here; installs the whole workspace

# One-time secrets per environment:
pnpm wrangler secret put API_BIBLE_KEY     # api.scripture.api.bible
pnpm wrangler secret put BIBLE_BRAIN_KEY   # 4.dbt.io (Faith Comes By Hearing)
pnpm wrangler secret put ESV_API_KEY       # api.esv.org
```

## Local development

```sh
cp .dev.vars.example .dev.vars   # then fill in the keys
pnpm dev                         # http://localhost:8787
```

`pnpm dev` at the repo root starts this worker and the Vite dev server
together; the command above runs the worker alone.

The inscript frontend's dev profile (`vite dev`) already points at
`http://localhost:8787` (`/v1`, `/fcbh/v4`, `/esv/v3`).

## Deploy

```sh
pnpm test
pnpm run deploy   # `run` is required: bare `pnpm deploy` is pnpm's own
                  # workspace-deploy builtin, which shadows this script
```

The worker is bound to the `api.inscript.org` custom domain via `routes` in
`wrangler.toml`. Deploying this worker does not deploy the frontend, and vice
versa (see `../docs/Deployment-Cloudflare.md`).

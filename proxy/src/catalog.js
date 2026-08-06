import { BIBLE_BRAIN_HOST } from './routes.js';

export const CATALOG_KEY = 'fcbh:bibles:v1';
export const CATALOG_META_KEY = 'fcbh:bibles:meta';
export const CRAWL_STATE_KEY = 'fcbh:bibles:crawl';
export const WARMUP_LOCK_KEY = 'fcbh:bibles:warmup-lock';

const KEEP_TYPES = ['text_plain', 'text_format', 'audio', 'audio_drama'];

const DEFAULT_PAGES_PER_RUN = 32;
const PAGE_CONCURRENCY = 6;
const REFRESH_MAX_AGE_HOURS = 3.75;
const CRAWL_ABANDON_MS = 2 * 3600_000;

const filesetType = (fs) => fs.type ?? fs.set_type_code ?? '';
const filesetSize = (fs) => fs.size ?? fs.set_size_code ?? '';

// Keeps any entry with readable text or audio: the app serves text-carrying
// entries it doesn't already have, and pairs audio (including audio-only
// entries) to texts it does.
export function pruneEntry(entry) {
  const filesets = {};
  let hasContent = false;

  for (const [bucket, list] of Object.entries(entry?.filesets ?? {})) {
    if (!Array.isArray(list)) continue;

    const kept = list
      .filter(fs => fs && KEEP_TYPES.includes(filesetType(fs)))
      .map(fs => ({ id: fs.id, type: filesetType(fs), size: filesetSize(fs) }));

    if (kept.length === 0) continue;
    filesets[bucket] = kept;
    hasContent = true;
  }

  if (!hasContent) return null;

  return {
    abbr: entry.abbr,
    name: entry.name,
    vname: entry.vname,
    language: entry.language,
    autonym: entry.autonym,
    iso: entry.iso,
    filesets
  };
}

async function fetchBiblesPage(fetchImpl, key, page) {
  const url = new URL(`${BIBLE_BRAIN_HOST}/bibles`);
  url.searchParams.set('v', '4');
  url.searchParams.set('key', key);
  url.searchParams.set('page', String(page));

  const response = await fetchImpl(url.toString(), { headers: { 'Accept': 'application/json' } });
  if (!response.ok) throw new Error(`bibles page ${page}: HTTP ${response.status}`);
  return response.json();
}

const newCrawlState = () => ({
  startedAt: new Date().toISOString(),
  nextPage: 1,
  lastPage: null,
  sourceTotal: 0,
  entries: []
});

const isAbandoned = (state) => {
  const started = Date.parse(state?.startedAt ?? '');
  return Number.isFinite(started) && Date.now() - started > CRAWL_ABANDON_MS;
};

async function publishCatalog(kv, state) {
  const meta = {
    generated_at: new Date().toISOString(),
    total: state.entries.length,
    source_total: state.sourceTotal,
    source_pages: state.lastPage
  };

  await kv.put(CATALOG_KEY, JSON.stringify({ data: state.entries, meta }));
  await kv.put(CATALOG_META_KEY, JSON.stringify(meta));
  await kv.delete(CRAWL_STATE_KEY);
  return { done: true, ...meta };
}

export async function advanceCatalogCrawl(env, { maxPages, fetchImpl = fetch } = {}) {
  const kv = env.CATALOG;
  const key = env.BIBLE_BRAIN_KEY ?? '';
  const configured = parseInt(env.CATALOG_PAGES_PER_RUN, 10);
  const budget = maxPages ?? (configured > 0 ? configured : DEFAULT_PAGES_PER_RUN);

  let state = await kv.get(CRAWL_STATE_KEY, 'json');
  if (!state || isAbandoned(state)) state = newCrawlState();

  let fetched = 0;
  while (fetched < budget) {
    const remaining = state.lastPage == null ? 1 : state.lastPage - state.nextPage + 1;
    const batchSize = Math.min(PAGE_CONCURRENCY, budget - fetched, remaining);
    if (batchSize <= 0) break;

    const pages = Array.from({ length: batchSize }, (_, i) => state.nextPage + i);
    const results = await Promise.all(pages.map(page => fetchBiblesPage(fetchImpl, key, page)));

    for (const json of results) {
      for (const entry of json?.data ?? []) {
        const pruned = pruneEntry(entry);
        if (pruned) state.entries.push(pruned);
      }
    }

    const pagination = results[0]?.meta?.pagination ?? {};
    state.lastPage ??= pagination.last_page ?? pagination.total_pages ?? 1;
    state.sourceTotal = pagination.total ?? state.sourceTotal;
    state.nextPage += batchSize;
    fetched += batchSize;

    if (state.nextPage > state.lastPage) {
      return publishCatalog(kv, state);
    }
  }

  await kv.put(CRAWL_STATE_KEY, JSON.stringify(state));
  return { done: false, nextPage: state.nextPage, lastPage: state.lastPage };
}

export async function refreshCatalogIfStale(env, options = {}) {
  const inFlight = await env.CATALOG.get(CRAWL_STATE_KEY, 'json');

  if (!inFlight || isAbandoned(inFlight)) {
    const meta = await env.CATALOG.get(CATALOG_META_KEY, 'json');
    const generated = Date.parse(meta?.generated_at ?? '');
    if (Number.isFinite(generated) && Date.now() - generated < REFRESH_MAX_AGE_HOURS * 3600_000) {
      return { done: true, skipped: true };
    }
  }

  return advanceCatalogCrawl(env, options);
}

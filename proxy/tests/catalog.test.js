import { describe, it, expect, vi } from 'vitest';
import {
  CATALOG_KEY,
  CATALOG_META_KEY,
  CRAWL_STATE_KEY,
  pruneEntry,
  advanceCatalogCrawl,
  refreshCatalogIfStale
} from '../src/catalog.js';

function mockKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async get(key, type) {
      const value = store.get(key) ?? null;
      return type === 'json' && value != null ? JSON.parse(value) : value;
    },
    async put(key, value) { store.set(key, value); },
    async delete(key) { store.delete(key); }
  };
}

const textFileset = { id: 'ABCDEFN_ET', type: 'text_plain', size: 'NT', stock_no: null, volume: 'x' };
const audioFileset = { id: 'ABCDEFN2DA', type: 'audio_drama', size: 'NT', bitrate: '64kbps', codec: 'mp3', container: 'mp3' };
const videoFileset = { id: 'ABCDEFP2DV', type: 'video_stream', size: 'NTP' };

const entry = (overrides = {}) => ({
  abbr: 'ABCDEF',
  name: 'Test Bible',
  vname: 'Vernacular',
  language: 'Testish',
  autonym: 'Testish',
  language_id: 1,
  iso: 'tst',
  date: '2020',
  filesets: { 'dbp-prod': [textFileset, audioFileset] },
  ...overrides
});

function mockBiblesFetch(entries, perPage = 2) {
  const lastPage = Math.max(1, Math.ceil(entries.length / perPage));
  return vi.fn(async (url) => {
    const page = Number(new URL(url).searchParams.get('page'));
    const data = entries.slice((page - 1) * perPage, page * perPage);
    return {
      ok: true,
      json: async () => ({
        data,
        meta: { pagination: { total: entries.length, last_page: lastPage, current_page: page } }
      })
    };
  });
}

describe('pruneEntry', () => {
  it('keeps text and audio filesets, slimmed to id/type/size', () => {
    const pruned = pruneEntry(entry({ filesets: { 'dbp-prod': [textFileset, audioFileset, videoFileset] } }));
    expect(pruned.filesets['dbp-prod']).toEqual([
      { id: 'ABCDEFN_ET', type: 'text_plain', size: 'NT' },
      { id: 'ABCDEFN2DA', type: 'audio_drama', size: 'NT' }
    ]);
  });

  it('keeps only the entry fields the frontend reads', () => {
    expect(Object.keys(pruneEntry(entry())))
      .toEqual(['abbr', 'name', 'vname', 'language', 'autonym', 'iso', 'filesets']);
  });

  it('keeps audio-only bibles (the app pairs their audio to existing texts)', () => {
    expect(pruneEntry(entry({ filesets: { 'dbp-prod': [audioFileset] } }))?.filesets['dbp-prod'])
      .toEqual([{ id: 'ABCDEFN2DA', type: 'audio_drama', size: 'NT' }]);
  });

  it('drops video-only bibles (no text or audio)', () => {
    expect(pruneEntry(entry({ filesets: { 'dbp-prod': [videoFileset] } }))).toBeNull();
  });

  it('drops text_usx/text_json-only bibles but keeps text_format', () => {
    const usx = { id: 'X-usx', type: 'text_usx', size: 'NT' };
    expect(pruneEntry(entry({ filesets: { 'dbp-prod': [usx] } }))).toBeNull();

    const format = { id: 'X', type: 'text_format', size: 'C' };
    expect(pruneEntry(entry({ filesets: { 'dbp-prod': [format] } }))?.filesets['dbp-prod'])
      .toEqual([{ id: 'X', type: 'text_format', size: 'C' }]);
  });

  it('reads the documented set_type_code / set_size_code keys too', () => {
    const legacy = { id: 'X', set_type_code: 'text_plain', set_size_code: 'OT' };
    expect(pruneEntry(entry({ filesets: { 'dbp-prod': [legacy] } }))?.filesets['dbp-prod'])
      .toEqual([{ id: 'X', type: 'text_plain', size: 'OT' }]);
  });

  it('tolerates missing or malformed filesets', () => {
    expect(pruneEntry(entry({ filesets: null }))).toBeNull();
    expect(pruneEntry(entry({ filesets: { 'dbp-prod': 'nope' } }))).toBeNull();
    expect(pruneEntry(null)).toBeNull();
  });
});

describe('advanceCatalogCrawl', () => {
  const entries = [
    entry({ abbr: 'A1' }),
    entry({ abbr: 'A2', filesets: { 'dbp-prod': [videoFileset] } }),
    entry({ abbr: 'A3' }),
    entry({ abbr: 'A4' })
  ];

  it('crawls every page, filters, and publishes to KV in one run', async () => {
    const kv = mockKv();
    const fetchImpl = mockBiblesFetch(entries);

    const result = await advanceCatalogCrawl({ CATALOG: kv, BIBLE_BRAIN_KEY: 'k' }, { fetchImpl });

    expect(result.done).toBe(true);
    expect(result.total).toBe(3);

    const published = JSON.parse(kv.store.get(CATALOG_KEY));
    expect(published.data.map(e => e.abbr)).toEqual(['A1', 'A3', 'A4']);
    expect(published.meta.source_total).toBe(4);
    expect(JSON.parse(kv.store.get(CATALOG_META_KEY)).total).toBe(3);
    expect(kv.store.has(CRAWL_STATE_KEY)).toBe(false);

    const firstUrl = new URL(fetchImpl.mock.calls[0][0]);
    expect(firstUrl.origin + firstUrl.pathname).toBe('https://4.dbt.io/api/bibles');
    expect(firstUrl.searchParams.get('key')).toBe('k');
  });

  it('resumes across runs when maxPages is smaller than the page count', async () => {
    const kv = mockKv();
    const env = { CATALOG: kv, BIBLE_BRAIN_KEY: 'k' };
    const fetchImpl = mockBiblesFetch(entries);

    const first = await advanceCatalogCrawl(env, { fetchImpl, maxPages: 1 });
    expect(first).toEqual({ done: false, nextPage: 2, lastPage: 2 });
    expect(kv.store.has(CATALOG_KEY)).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const second = await advanceCatalogCrawl(env, { fetchImpl, maxPages: 1 });
    expect(second.done).toBe(true);
    expect(JSON.parse(kv.store.get(CATALOG_KEY)).data.map(e => e.abbr)).toEqual(['A1', 'A3', 'A4']);
  });

  it('leaves saved state untouched when a page fetch fails', async () => {
    const kv = mockKv();
    const env = { CATALOG: kv, BIBLE_BRAIN_KEY: 'k' };
    const good = mockBiblesFetch(entries);
    await advanceCatalogCrawl(env, { fetchImpl: good, maxPages: 1 });
    const savedState = kv.store.get(CRAWL_STATE_KEY);

    const bad = vi.fn(async () => ({ ok: false, status: 500 }));
    await expect(advanceCatalogCrawl(env, { fetchImpl: bad, maxPages: 1 })).rejects.toThrow('HTTP 500');
    expect(kv.store.get(CRAWL_STATE_KEY)).toBe(savedState);
  });
});

describe('refreshCatalogIfStale', () => {
  const freshMeta = () => JSON.stringify({ generated_at: new Date().toISOString(), total: 3 });
  const staleMeta = () => JSON.stringify({ generated_at: new Date(Date.now() - 4 * 3600_000).toISOString(), total: 3 });

  it('does nothing while the published catalog is fresh', async () => {
    const kv = mockKv({ [CATALOG_META_KEY]: freshMeta() });
    const fetchImpl = vi.fn();

    const result = await refreshCatalogIfStale({ CATALOG: kv, BIBLE_BRAIN_KEY: 'k' }, { fetchImpl });

    expect(result).toEqual({ done: true, skipped: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('starts a crawl when the catalog is stale', async () => {
    const kv = mockKv({ [CATALOG_META_KEY]: staleMeta() });
    const fetchImpl = mockBiblesFetch([entry()]);

    const result = await refreshCatalogIfStale({ CATALOG: kv, BIBLE_BRAIN_KEY: 'k' }, { fetchImpl });

    expect(result.done).toBe(true);
    expect(kv.store.has(CATALOG_KEY)).toBe(true);
  });

  it('keeps serving the last successful catalog when a refresh fails', async () => {
    const kv = mockKv();
    const env = { CATALOG: kv, BIBLE_BRAIN_KEY: 'k' };
    await advanceCatalogCrawl(env, { fetchImpl: mockBiblesFetch([entry({ abbr: 'GOOD' })]) });
    const published = kv.store.get(CATALOG_KEY);

    kv.store.set(CATALOG_META_KEY, staleMeta());
    const bad = vi.fn(async () => ({ ok: false, status: 502 }));
    await expect(refreshCatalogIfStale(env, { fetchImpl: bad })).rejects.toThrow('HTTP 502');

    expect(kv.store.get(CATALOG_KEY)).toBe(published);
    expect(JSON.parse(kv.store.get(CATALOG_KEY)).data[0].abbr).toBe('GOOD');
  });

  it('resumes an in-flight crawl even when the last publish is fresh', async () => {
    const state = { startedAt: new Date().toISOString(), nextPage: 1, lastPage: null, sourceTotal: 0, entries: [] };
    const kv = mockKv({ [CATALOG_META_KEY]: freshMeta(), [CRAWL_STATE_KEY]: JSON.stringify(state) });
    const fetchImpl = mockBiblesFetch([entry()]);

    const result = await refreshCatalogIfStale({ CATALOG: kv, BIBLE_BRAIN_KEY: 'k' }, { fetchImpl });

    expect(result.done).toBe(true);
    expect(fetchImpl).toHaveBeenCalled();
  });
});

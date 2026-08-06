import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: {},
  createSearchTerms: vi.fn()
}));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));
vi.mock('@texts/Search.js', () => ({
  SearchTools: { createSearchTerms: fixtures.createSearchTerms }
}));

import { createBibleBrainSearchStarter, extractSearchVerses } from '@texts/BibleBrainSearch.js';

function response({ ok = true, json = {} } = {}) {
  return { ok, json: vi.fn().mockResolvedValue(json) };
}

function runSearch(starter, options = {}) {
  return new Promise(resolve => starter.call(options.context ?? null, {
    textid: 'ENG', divisions: [], text: 'love', ...options,
    onSearchComplete: resolve
  }));
}

describe('BibleBrainSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.config = { bibleBrainProxyBase: 'https://proxy.test' };
    fixtures.createSearchTerms.mockReturnValue([/love/gi]);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('extracts each supported result shape and defaults to empty', () => {
    expect(extractSearchVerses({ data: { verses: { data: [1] } } })).toEqual([1]);
    expect(extractSearchVerses({ verses: { data: [2] } })).toEqual([2]);
    expect(extractSearchVerses({ data: { verses: [3] } })).toEqual([3]);
    expect(extractSearchVerses({ data: [4] })).toEqual([4]);
    expect(extractSearchVerses({ data: { verses: {} }, verses: { data: [5] } })).toEqual([5]);
    expect(extractSearchVerses({})).toEqual([]);
  });

  it('completes empty when text info is absent or the provider is disabled', async () => {
    const getTextInfoSync = vi.fn(() => null);
    const isEnabled = vi.fn(() => true);
    const starter = createBibleBrainSearchStarter({ getTextInfoSync, isEnabled, usfmToDbsCode: vi.fn() });
    const context = { id: 'searcher' };
    const missing = await runSearch(starter, { context });
    expect(missing).toMatchObject({
      type: 'complete', target: context,
      data: { results: [], searchIndexesData: [], searchTermsRegExp: [/love/gi], isLemmaSearch: false }
    });
    expect(fetch).not.toHaveBeenCalled();

    getTextInfoSync.mockReturnValue({ biblebrain: { textFilesets: [] } });
    isEnabled.mockReturnValue(false);
    expect((await runSearch(starter)).data.results).toEqual([]);
  });

  it('searches all filesets, filters AND matches/divisions, deduplicates, and highlights terms', async () => {
    fixtures.createSearchTerms.mockReturnValue([/love/gi, /world/gi]);
    const info = { biblebrain: { textFilesets: [{ id: 'OT' }, { id: 'NT' }, { id: 'BAD' }] } };
    const starter = createBibleBrainSearchStarter({
      getTextInfoSync: () => info,
      isEnabled: () => true,
      usfmToDbsCode: usfm => ({ GEN: 'GN', JHN: 'JN' })[usfm]
    });
    fetch
      .mockResolvedValueOnce(response({ json: { data: { verses: { data: [
        { book_id: 'GEN', chapter: 1, verse_start: 1, verse_text: 'Love the world' },
        { book_id: 'BAD', chapter: 1, verse_start: 1, verse_text: 'love world' },
        { book_id: 'GEN', chapter: 1, verse_start: 2, verse_text: 'love only' }
      ] } } } }))
      .mockResolvedValueOnce(response({ json: { verses: { data: [
        { book_id: 'GEN', chapter: 1, verse_start: 1, verse_text: 'love world duplicate' },
        { book_id: 'JHN', chapter: 3, verse_start: 16, verse_text: 'God loved the world' }
      ] } } }))
      .mockResolvedValueOnce(response({ ok: false }));
    const event = await runSearch(starter, { text: 'love world', divisions: ['GN'] });
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'https://proxy.test/search?query=love+world&fileset_id=OT&limit=2000',
      'https://proxy.test/search?query=love+world&fileset_id=NT&limit=2000',
      'https://proxy.test/search?query=love+world&fileset_id=BAD&limit=2000'
    ]);
    expect(event.data.results).toEqual([{
      fragmentid: 'GN1_1',
      html: '<span class="highlight">Love</span> the <span class="highlight">world</span>'
    }]);
  });

  it('uses OR semantics and tolerates individual network failures', async () => {
    fixtures.createSearchTerms.mockReturnValue([/faith/gi, /hope/gi]);
    const info = { biblebrain: { textFilesets: [{ id: 'ONE' }, { id: 'TWO' }] } };
    const starter = createBibleBrainSearchStarter({
      getTextInfoSync: () => info, isEnabled: () => true,
      usfmToDbsCode: () => 'JN'
    });
    fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response({ json: { data: [
        { book_id: 'JHN', chapter: 3, verse_start: 1, verse_text: 'Hope remains' },
        { book_id: 'JHN', chapter: 3, verse_start: 2, verse_text: 'Love remains' }
      ] } }));
    const event = await runSearch(starter, { text: 'faith OR hope' });
    expect(event.data.results).toEqual([{
      fragmentid: 'JN3_1', html: '<span class="highlight">Hope</span> remains'
    }]);
  });

  it('returns no matches when search-term generation is empty', async () => {
    fixtures.createSearchTerms.mockReturnValue([]);
    const starter = createBibleBrainSearchStarter({
      getTextInfoSync: () => ({ biblebrain: { textFilesets: [{ id: 'ONE' }] } }),
      isEnabled: () => true,
      usfmToDbsCode: () => 'JN'
    });
    fetch.mockResolvedValue(response({ json: { data: [
      { book_id: 'JHN', chapter: 1, verse_start: 1, verse_text: 'anything' }
    ] } }));
    expect((await runSearch(starter)).data.results).toEqual([]);
  });

  it('logs unexpected processing failures and still completes', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const starter = createBibleBrainSearchStarter({
      getTextInfoSync: () => ({ biblebrain: { textFilesets: [{ id: 'ONE' }] } }),
      isEnabled: () => true,
      usfmToDbsCode: () => { throw new Error('mapping failed'); }
    });
    fetch.mockResolvedValue(response({ json: { data: [
      { book_id: 'JHN', chapter: 1, verse_start: 1, verse_text: 'love' }
    ] } }));
    const event = await runSearch(starter);
    expect(event.data.results).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith('Bible Brain search error:', expect.any(Error));
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({ config: {} }));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));

import { createEsvSearchStarter } from '@texts/EsvSearch.js';

function response({ ok = true, status = 200, json = {} } = {}) {
  return { ok, status, json: vi.fn().mockResolvedValue(json) };
}

function runSearch(starter, options = {}) {
  return new Promise(resolve => starter.call(options.context ?? null, {
    textid: 'ESV', divisions: [], text: 'love', ...options,
    onSearchComplete: resolve
  }));
}

describe('EsvSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.config = { esvProxyBase: 'https://proxy.test' };
    vi.stubGlobal('fetch', vi.fn());
  });

  it('completes empty when text metadata is unavailable', async () => {
    const starter = createEsvSearchStarter({ getTextInfoSync: () => null, bookName: id => id });
    const context = { id: 'searcher' };
    const event = await runSearch(starter, { context });
    expect(event).toMatchObject({
      type: 'complete', target: context,
      data: { results: [], searchIndexesData: [], isLemmaSearch: false }
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads multiple pages, maps aliases, filters divisions, escapes, and highlights results', async () => {
    const starter = createEsvSearchStarter({
      getTextInfoSync: () => ({ id: 'ESV' }),
      bookName: id => ({ PS: 'Psalms', SS: 'Song of Solomon' })[id] ?? id
    });
    fetch
      .mockResolvedValueOnce(response({ json: {
        total_pages: 2,
        results: [
          { reference: 'John 3:16', content: 'God so love <the world> in mercy' },
          { reference: 'Unknown 1:1', content: 'love and mercy' },
          { reference: 'bad reference', content: 'love and mercy' },
          { reference: 'Genesis 1:1', content: 'love and mercy' }
        ]
      } }))
      .mockResolvedValueOnce(response({ json: {
        total_pages: 2,
        results: [{ reference: 'Psalms 23:1', content: 'love & mercy' }]
      } }));
    const event = await runSearch(starter, { text: 'love mercy', divisions: ['JN', 'PS'] });
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'https://proxy.test/passage/search/?q=love+mercy&page-size=100&page=1',
      'https://proxy.test/passage/search/?q=love+mercy&page-size=100&page=2'
    ]);
    expect(event.data.results).toEqual([
      {
        fragmentid: 'JN3_16',
        html: 'God so <span class="highlight">love</span> &lt;the world&gt; ' +
          'in <span class="highlight">mercy</span>'
      },
      {
        fragmentid: 'PS23_1',
        html: '<span class="highlight">love</span> &amp; <span class="highlight">mercy</span>'
      }
    ]);
  });

  it('keeps only verses matching every AND term', async () => {
    const starter = createEsvSearchStarter({
      getTextInfoSync: () => ({ id: 'ESV' }), bookName: id => id
    });
    fetch.mockResolvedValue(response({ json: { results: [
      { reference: 'John 1:1', content: 'faith and hope' },
      { reference: 'John 1:2', content: 'hope alone' },
      { reference: 'John 1:3', content: 'faith alone' }
    ] } }));
    const event = await runSearch(starter, { text: 'faith hope' });
    expect(event.data.results.map(result => result.fragmentid)).toEqual(['JN1_1']);
  });

  it('keeps verses matching any OR term and ignores the operator', async () => {
    const starter = createEsvSearchStarter({
      getTextInfoSync: () => ({ id: 'ESV' }), bookName: id => id
    });
    fetch.mockResolvedValue(response({ json: { results: [
      { reference: 'John 1:1', content: 'faith alone' },
      { reference: 'John 1:2', content: 'hope alone' },
      { reference: 'John 1:3', content: 'bread or wine' }
    ] } }));
    const event = await runSearch(starter, { text: 'faith OR hope' });
    expect(event.data.results.map(result => result.fragmentid)).toEqual(['JN1_1', 'JN1_2']);
  });

  it('recognizes numbered and alternate book names with an unrestricted division list', async () => {
    const starter = createEsvSearchStarter({
      getTextInfoSync: () => ({ id: 'ESV' }),
      bookName: id => id === 'SS' ? 'Song of Solomon' : id
    });
    fetch.mockResolvedValue(response({ json: { results: [
      { reference: '1 Samuel 2:3', content: 'love' },
      { reference: 'Song of Solomon 1:2', content: 'love' }
    ] } }));
    const event = await runSearch(starter);
    expect(event.data.results.map(result => result.fragmentid)).toEqual(['S12_3', 'SS1_2']);
  });

  it('defaults absent results/pages and completes after one request', async () => {
    const starter = createEsvSearchStarter({
      getTextInfoSync: () => ({ id: 'ESV' }), bookName: id => id
    });
    fetch.mockResolvedValue(response({ json: {} }));
    const event = await runSearch(starter);
    expect(event.data.results).toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('stops pagination at twenty pages even when the API reports more', async () => {
    const starter = createEsvSearchStarter({
      getTextInfoSync: () => ({ id: 'ESV' }), bookName: id => id
    });
    fetch.mockImplementation(() => Promise.resolve(response({
      json: { total_pages: 99, results: [] }
    })));
    await runSearch(starter);
    expect(fetch).toHaveBeenCalledTimes(20);
    expect(fetch.mock.calls.at(-1)[0]).toContain('page=20');
  });

  it('completes after HTTP or network failures', async () => {
    const starter = createEsvSearchStarter({
      getTextInfoSync: () => ({ id: 'ESV' }), bookName: id => id
    });
    fetch.mockResolvedValueOnce(response({ ok: false, status: 503 }));
    expect((await runSearch(starter)).data.results).toEqual([]);
    fetch.mockRejectedValueOnce(new Error('offline'));
    expect((await runSearch(starter)).data.results).toEqual([]);
  });

  it('matches nothing when the query has no terms', async () => {
    const starter = createEsvSearchStarter({
      getTextInfoSync: () => ({ id: 'ESV' }), bookName: () => 'JN'
    });
    fetch.mockResolvedValue(response({ json: { results: [
      { reference: 'John 1:1', content: 'anything' }
    ] } }));
    const event = await runSearch(starter, { text: '' });
    expect(event.data.results).toEqual([]);
  });
});

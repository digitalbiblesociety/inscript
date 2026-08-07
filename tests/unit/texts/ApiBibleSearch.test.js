import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({ config: { apiBibleProxyBase: 'https://proxy.test' } }));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));

import { createApiBibleSearchStarter } from '@texts/ApiBibleSearch.js';

function makeStarter(overrides = {}) {
  return createApiBibleSearchStarter({
    getTextInfoSync: vi.fn(() => ({ apiId: 'api-web' })),
    isQuotaResponse: vi.fn(() => false),
    usfmToDbsCode: vi.fn(code => ({ GEN: 'GN', JHN: 'JN' })[code]),
    ...overrides
  });
}

function run(starter, options = {}) {
  return new Promise(resolve => starter.call({ owner: true }, {
    textid: 'WEB', divisions: [], text: 'word', onSearchComplete: resolve, ...options
  }));
}

describe('createApiBibleSearchStarter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.config = { apiBibleProxyBase: 'https://proxy.test' };
    vi.stubGlobal('fetch', vi.fn());
  });

  it('completes immediately with an empty result when text metadata is absent', async () => {
    const starter = makeStarter({ getTextInfoSync: vi.fn(() => null) });
    const result = await run(starter);
    expect(result.target).toEqual({ owner: true });
    expect(result.data).toMatchObject({ results: [], searchIndexesData: [], isLemmaSearch: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('queries the API, maps ids, filters divisions, escapes HTML, and highlights matches', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { verses: [
        { bookId: 'JHN', id: 'JHN.3.16', text: '<b>Word</b> and word' },
        { bookId: 'GEN', id: 'GEN.1.1', text: 'word in Genesis' },
        { bookId: 'UNK', id: 'UNK.1.1', text: 'word ignored' },
        { bookId: 'JHN', id: 'JHN.3.17', text: 'no match' }
      ] } })
    });
    const starter = makeStarter();
    const result = await run(starter, { text: 'word', divisions: ['JN'] });
    expect(fetch).toHaveBeenCalledWith(
      'https://proxy.test/bibles/api-web/search?query=word&limit=2000'
    );
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].fragmentid).toBe('JN3_16');
    expect(result.data.results[0].html).toContain('&lt;b&gt;');
    expect(result.data.results[0].html.match(/class="highlight"/g)).toHaveLength(2);
  });

  it('requires every AND term, not just the first', async () => {
    fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ data: { verses: [
      { bookId: 'JHN', id: 'JHN.1.1', text: 'faith and hope' },
      { bookId: 'JHN', id: 'JHN.1.2', text: 'faith alone' }
    ] } }) });
    const result = await run(makeStarter(), { text: 'faith hope' });
    expect(result.data.results.map(entry => entry.fragmentid)).toEqual(['JN1_1']);
  });

  it('accepts a verse matching only a later OR term', async () => {
    fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ data: { verses: [
      { bookId: 'JHN', id: 'JHN.1.1', text: 'hope alone' },
      { bookId: 'JHN', id: 'JHN.1.2', text: 'bread or wine' }
    ] } }) });
    const result = await run(makeStarter(), { text: 'faith OR hope' });
    expect(result.data.results.map(entry => entry.fragmentid)).toEqual(['JN1_1']);
  });

  it('encodes spaces as plus signs and accepts every division when none are selected', async () => {
    fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({
      data: { verses: [{ bookId: 'GEN', id: 'GEN.1.1', text: 'two words' }] }
    }) });
    const result = await run(makeStarter(), { text: 'two words' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('query=two+words'));
    expect(result.data.results[0].fragmentid).toBe('GN1_1');
  });

  it('handles missing verse data as an empty result', async () => {
    fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });
    expect((await run(makeStarter())).data.results).toEqual([]);
  });

  it('matches nothing when the query has no terms', async () => {
    fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ data: { verses: [
      { bookId: 'JHN', id: 'JHN.1.1', text: 'anything' }
    ] } }) });
    expect((await run(makeStarter(), { text: '' })).data.results).toEqual([]);
  });

  it.each([
    ['quota responses', { ok: true, status: 200 }, true],
    ['HTTP failures', { ok: false, status: 503 }, false]
  ])('completes with an empty result after %s', async (_label, response, quota) => {
    fetch.mockResolvedValue(response);
    const result = await run(makeStarter({ isQuotaResponse: vi.fn(() => quota) }));
    expect(result.data.results).toEqual([]);
  });

  it('completes with an empty result after network or JSON failures', async () => {
    fetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      ok: true, json: vi.fn().mockRejectedValue(new Error('bad json'))
    });
    expect((await run(makeStarter())).data.results).toEqual([]);
    expect((await run(makeStarter())).data.results).toEqual([]);
  });
});

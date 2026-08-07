import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: {},
  showApocrypha: true,
  hashWord: vi.fn(),
  isApocryphalSection: vi.fn(sectionid => sectionid.startsWith('TB'))
}));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));

vi.mock('@bible/Apocrypha.js', () => ({
  getShowApocrypha: () => fixtures.showApocrypha,
  isApocryphalSection: fixtures.isApocryphalSection
}));

// Real query parsing and word splitting: only hashWord is stubbed, so the index
// urls stay predictable while the terms come from the actual query.
vi.mock('@texts/SearchTools.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { SearchTools: { ...actual.SearchTools, hashWord: fixtures.hashWord } };
});

import { SearchIndexLoader } from '@texts/SearchIndexLoader.js';

function response({ ok = true, status = 200, json = {} } = {}) {
  return { ok, status, json: vi.fn().mockResolvedValue(json) };
}

function complete(loader) {
  return new Promise(resolve => loader.on('complete', resolve));
}

describe('SearchIndexLoader', () => {
  beforeEach(() => {
    fixtures.config = {
      baseContentUrl: 'https://content.test/',
      textsPath: 'texts'
    };
    fixtures.showApocrypha = true;
    vi.clearAllMocks();
    fixtures.hashWord.mockImplementation(word => word.length);
    fixtures.isApocryphalSection.mockImplementation(sectionid => sectionid.startsWith('TB'));
    vi.stubGlobal('fetch', vi.fn());
  });

  it('initializes path, search, stemming, and result defaults', () => {
    const loader = new SearchIndexLoader();
    expect(loader.baseContentPath).toBe('https://content.test/texts/');
    expect(loader).toMatchObject({
      isStemEnabled: true,
      textInfo: null,
      searchTerms: [],
      searchTermsIndex: -1,
      isLemmaSearch: false,
      stemmingData: {},
      stemInfo: [],
      searchDivisions: [],
      loadedIndexes: [],
      loadedResults: [],
      searchType: 'AND'
    });
  });

  it('loads stemming and term indexes sequentially, then merges an OR search', async () => {
    const loader = new SearchIndexLoader();
    const text = { id: 'ENG', sections: ['GN1', 'JN3'] };
    fetch.mockImplementation(url => {
      if (url.endsWith('/stems.json')) {
        return Promise.resolve(response({ json: { love: 'lov' } }));
      }
      if (url.includes('_stems_')) {
        return Promise.resolve(response({ json: {
          lov: { fragmentids: ['JN3_16'], words: ['love', 'loved'] }
        } }));
      }
      return Promise.resolve(response({ json: { hope: ['GN1_2'] } }));
    });
    const done = complete(loader);
    loader.loadIndexes(text, [], 'Love OR hope', false);
    const event = await done;

    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'https://content.test/texts/ENG/index/stems.json',
      'https://content.test/texts/ENG/index/_stems_3.json',
      'https://content.test/texts/ENG/index/_4.json'
    ]);
    expect(loader.searchType).toBe('OR');
    expect(loader.stemmingData).toEqual({ love: 'lov' });
    expect(loader.loadedIndexes).toEqual([['JN3_16'], ['GN1_2']]);
    expect(loader.stemInfo).toEqual([{ word: 'love', stem: 'lov', words: ['love', 'loved'] }]);
    expect(event.data.fragmentids).toEqual(['GN1_2', 'JN3_16']);
    expect(event.data.loadedResults).toEqual([
      { sectionid: 'GN1', fragmentids: ['GN1_2'] },
      { sectionid: 'JN3', fragmentids: ['JN3_16'] }
    ]);
  });

  it('continues without stemming data when its request fails', async () => {
    const loader = new SearchIndexLoader();
    fetch
      .mockResolvedValueOnce(response({ ok: false, status: 404 }))
      .mockResolvedValueOnce(response({ json: { word: ['GN1_1'] } }));
    const done = complete(loader);
    loader.loadIndexes({ id: 'ENG', sections: ['GN1'] }, [], 'Word', false);
    const event = await done;
    expect(loader.stemmingData).toBeNull();
    expect(fetch.mock.calls[1][0]).toContain('/index/_4.json');
    expect(event.data.fragmentids).toEqual(['GN1_1']);
  });

  it('loads lemma indexes directly with long and short Strong-number buckets', async () => {
    const loader = new SearchIndexLoader();
    fetch
      .mockResolvedValueOnce(response({ json: { G12345: ['JN3_16', 'JN3_17'] } }))
      .mockResolvedValueOnce(response({ json: { H12: ['JN3_17'] } }));
    const done = complete(loader);
    loader.loadIndexes({ id: 'GRK', sections: ['JN3'] }, [], 'g12345 h12', true);
    const event = await done;
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'https://content.test/texts/GRK/indexlemma/_G1000.json',
      'https://content.test/texts/GRK/indexlemma/_H0000.json'
    ]);
    expect(loader.stemmingData).toBeNull();
    expect(event.data.fragmentids).toEqual(['JN3_17']);
  });

  it('skips stemming when it is disabled', async () => {
    const loader = new SearchIndexLoader();
    loader.isStemEnabled = false;
    fetch.mockResolvedValue(response({ json: { word: ['GN1_1'] } }));
    const done = complete(loader);
    loader.loadIndexes({ id: 'ENG', sections: ['GN1'] }, [], 'word', false);
    await done;
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toContain('/index/_4.json');
  });

  it('builds lemma, stemmed, and unstemmed index requests', () => {
    const loader = new SearchIndexLoader();
    loader.textInfo = { id: 'ENG' };
    loader.isLemmaSearch = true;
    expect(loader.buildIndexRequest('g12345')).toEqual({
      key: 'G12345', stem: '', useStem: false,
      indexUrl: 'https://content.test/texts/ENG/indexlemma/_G1000.json'
    });

    loader.isLemmaSearch = false;
    loader.stemmingData = { running: 'run' };
    expect(loader.buildIndexRequest('Running')).toEqual({
      key: 'running', stem: 'run', useStem: true,
      indexUrl: 'https://content.test/texts/ENG/index/_stems_3.json'
    });
    loader.isStemEnabled = false;
    expect(loader.buildIndexRequest('Running')).toEqual({
      key: 'running', stem: null, useStem: false,
      indexUrl: 'https://content.test/texts/ENG/index/_7.json'
    });
  });

  it('records empty stem fragments without adding stem word metadata', async () => {
    const loader = new SearchIndexLoader();
    loader.textInfo = { id: 'ENG', sections: [] };
    loader.isLemmaSearch = false;
    loader.stemmingData = { word: 'stem' };
    loader.searchTerms = ['word'];
    loader.searchTermsIndex = 0;
    loader.processIndexes = vi.fn();
    fetch.mockResolvedValue(response({ json: { stem: {} } }));
    loader.loadSearchTermIndex('word');
    await vi.waitFor(() => expect(loader.processIndexes).toHaveBeenCalled());
    expect(loader.loadedIndexes).toEqual([[]]);
    expect(loader.stemInfo).toEqual([]);
  });

  it('records failed term indexes and clears the all-failed sentinel set', async () => {
    const loader = new SearchIndexLoader();
    loader.isStemEnabled = false;
    fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response({ ok: false, status: 500 }));
    const done = complete(loader);
    loader.loadIndexes({ id: 'ENG', sections: [] }, [], 'one two', false);
    const event = await done;
    expect(loader.loadedIndexes).toEqual([]);
    expect(event.data).toMatchObject({
      loadedIndexes: [], loadedResults: [], fragmentids: [], stemInfo: []
    });
  });

  it('never asks for an index of the OR operator itself', async () => {
    const loader = new SearchIndexLoader();
    loader.isStemEnabled = false;
    fetch.mockResolvedValue(response({ json: {} }));
    const done = complete(loader);
    loader.loadIndexes({ id: 'ENG', sections: ['GN1'] }, [], 'love OR hope', false);
    await done;
    expect(loader.searchTerms).toEqual(['love', 'hope']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(call => call[0])).not.toContain(
      'https://content.test/texts/ENG/index/_2.json'
    );
  });

  it('sorts OR fragments by canonical section and numeric verse', () => {
    const loader = new SearchIndexLoader();
    loader.textInfo = { sections: ['GN1', 'EX2', 'JN3'] };
    loader.loadedIndexes = [['JN3_10', 'GN1_12'], ['JN3_2', 'EX2_1']];
    expect(loader.mergeOrIndexes()).toEqual(['GN1_12', 'EX2_1', 'JN3_2', 'JN3_10']);
  });

  it('reports a verse once when several OR terms match it', () => {
    const loader = new SearchIndexLoader();
    loader.textInfo = { sections: ['GN1', 'JN3'] };
    loader.loadedIndexes = [['JN3_16', 'GN1_1'], ['JN3_16'], ['JN3_16', 'GN1_1']];
    expect(loader.mergeOrIndexes()).toEqual(['GN1_1', 'JN3_16']);

    loader.searchDivisions = [];
    loader.searchType = 'OR';
    loader.processIndexes();
    expect(loader.loadedResults).toEqual([
      { sectionid: 'GN1', fragmentids: ['GN1_1'] },
      { sectionid: 'JN3', fragmentids: ['JN3_16'] }
    ]);
  });

  it('intersects zero, one, and several AND indexes', () => {
    const loader = new SearchIndexLoader();
    loader.loadedIndexes = [];
    expect(loader.intersectAndIndexes()).toEqual([]);
    loader.loadedIndexes = [['GN1_1']];
    expect(loader.intersectAndIndexes()).toEqual(['GN1_1']);
    loader.loadedIndexes = [['GN1_1', 'GN1_2'], ['GN1_2', 'GN1_3'], ['GN1_2']];
    expect(loader.intersectAndIndexes()).toEqual(['GN1_2']);
  });

  it('groups fragments, skips blanks and hidden apocrypha, and filters divisions', () => {
    const loader = new SearchIndexLoader();
    loader.searchDivisions = ['GN', 'TB'];
    fixtures.showApocrypha = false;
    expect(loader.groupBySection([
      null, 'GN1_1', 'GN1_2', 'TB1_1', 'JN3_16'
    ])).toEqual([
      { sectionid: 'GN1', fragmentids: ['GN1_1', 'GN1_2'] }
    ]);
    expect(fixtures.isApocryphalSection).toHaveBeenCalledWith('TB1');

    fixtures.showApocrypha = true;
    loader.searchDivisions = [];
    expect(loader.groupBySection(['TB1_1'])).toEqual([
      { sectionid: 'TB1', fragmentids: ['TB1_1'] }
    ]);
  });

  it('normalizes mixed missing indexes and emits the complete result envelope', () => {
    const loader = new SearchIndexLoader();
    loader.textInfo = { sections: ['GN1'] };
    loader.loadedIndexes = [null, ['GN1_1']];
    loader.searchType = 'AND';
    loader.stemInfo = [{ word: 'one' }];
    const received = vi.fn();
    loader.on('complete', received);
    loader.processIndexes();
    expect(loader.loadedIndexes).toEqual([[], ['GN1_1']]);
    expect(received).toHaveBeenCalledWith({
      type: 'complete', target: loader,
      data: {
        loadedIndexes: [[], ['GN1_1']],
        loadedResults: [],
        fragmentids: [],
        stemInfo: [{ word: 'one' }]
      }
    });
  });
});

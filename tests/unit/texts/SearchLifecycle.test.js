import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: {},
  getText: vi.fn(),
  loadSection: vi.fn(),
  collectSectionResults: vi.fn(() => []),
  loaderInstances: []
}));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));
vi.mock('@texts/TextLoader.js', () => ({
  getText: fixtures.getText,
  loadSection: fixtures.loadSection
}));
vi.mock('@texts/SearchIndexLoader.js', () => ({
  SearchIndexLoader: class SearchIndexLoader {
    constructor() {
      this.on = vi.fn((event, callback) => { this.callback = callback; });
      this.loadIndexes = vi.fn();
      fixtures.loaderInstances.push(this);
    }
  }
}));
vi.mock('@texts/SearchMatcher.js', () => ({
  findVerseMatches: vi.fn(() => ({ foundMatch: false, html: '' })),
  collectSectionResults: fixtures.collectSectionResults
}));

import { TextSearch } from '@texts/Search.js';

const textInfo = { id: 'WEB', sections: ['GN1'] };

describe('TextSearch lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.loaderInstances.length = 0;
    fixtures.config = { baseContentUrl: '/base/', textsPath: 'texts', serverSearchPath: '' };
    fixtures.getText.mockImplementation((_textid, callback) => {
      callback(textInfo);
      return textInfo;
    });
    fixtures.collectSectionResults.mockReturnValue([]);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('initializes search state and subscribes to index completion', () => {
    const search = new TextSearch();
    expect(search).toMatchObject({
      isSearching: false, searchText: '', searchTextid: '',
      searchDivisions: [], textInfo: null, isLemmaSearch: false,
      searchTermsRegExp: [], searchIndexesData: [],
      searchIndexesCurrentIndex: 0, searchType: 'AND', searchFinalResults: []
    });
    expect(search.searchIndexLoader.on).toHaveBeenCalledWith('complete', expect.any(Function));
  });

  it('starts a local text search and rejects a concurrent start', () => {
    const search = new TextSearch();
    expect(search.start('WEB', ['GN'], '  word OR hope  ')).toBe(true);
    expect(search).toMatchObject({
      isSearching: true, searchText: 'word OR hope', searchTextid: 'WEB',
      searchDivisions: ['GN'], searchType: 'OR', isLemmaSearch: false
    });
    // The operator is not one of the searched words.
    expect(search.searchTermsRegExp).toHaveLength(2);
    expect(search.searchTermsRegExp.some(regex => regex.test('or'))).toBe(false);
    expect(fixtures.getText).toHaveBeenCalledWith('WEB', expect.any(Function), expect.any(Function));
    expect(search.searchIndexLoader.loadIndexes).toHaveBeenCalledWith(
      textInfo, ['GN'], 'word OR hope', false
    );
    expect(search.start('WEB', [], 'again')).toBe(false);
  });

  it('waits for uncached text metadata before loading indexes', () => {
    let resolveText;
    fixtures.getText.mockImplementation((_textid, callback) => { resolveText = callback; });

    const search = new TextSearch();
    expect(search.start('WEB', [], 'word')).toBe(true);
    expect(search.searchIndexLoader.loadIndexes).not.toHaveBeenCalled();

    resolveText(textInfo);
    expect(search.textInfo).toBe(textInfo);
    expect(search.searchIndexLoader.loadIndexes).toHaveBeenCalledWith(textInfo, [], 'word', false);
  });

  it.each([
    ['metadata resolves to nothing', (callback, errorCallback) => errorCallback(new Error('no info'))],
    ['the provider is missing', (_callback, errorCallback) => errorCallback(new Error('no provider'))]
  ])('reports a failed completion when %s', (_label, resolve) => {
    fixtures.getText.mockImplementation((_textid, callback, errorCallback) =>
      resolve(callback, errorCallback));

    const search = new TextSearch();
    search.trigger = vi.fn();
    expect(search.start('WEB', [], 'word')).toBe(true);
    expect(search.isSearching).toBe(false);
    expect(search.trigger).toHaveBeenCalledWith('complete', expect.objectContaining({
      data: expect.objectContaining({ results: null })
    }));
    expect(search.searchIndexLoader.loadIndexes).not.toHaveBeenCalled();
    // A failed search must not wedge the searcher.
    expect(search.start('WEB', [], 'word')).toBe(true);
  });

  it.each(['', '   ', 'OR', 'and or'])('completes empty for the termless query %o', (text) => {
    const search = new TextSearch();
    search.trigger = vi.fn();
    expect(search.start('WEB', [], text)).toBe(true);
    expect(search.isSearching).toBe(false);
    expect(fixtures.getText).not.toHaveBeenCalled();
    expect(search.searchIndexLoader.loadIndexes).not.toHaveBeenCalled();
    expect(search.trigger).toHaveBeenCalledWith('complete', expect.objectContaining({
      data: expect.objectContaining({ results: [] })
    }));
  });

  it('detects lemma searches and resets state for a fresh run', () => {
    const search = new TextSearch();
    search.searchFinalResults = [1];
    search.searchIndexesData = [1];
    search.searchIndexesCurrentIndex = 9;
    expect(search.start('WEB', [], 'G25')).toBe(true);
    expect(search.isLemmaSearch).toBe(true);
    expect(search.searchFinalResults).toEqual([]);
    expect(search.searchIndexesData).toEqual([]);
    expect(search.searchIndexesCurrentIndex).toBe(0);
    expect(search.searchTermsRegExp).toHaveLength(1);
    expect(search.searchTermsRegExp[0].source).toContain('25');
  });

  it('selects server search for configured HTTP and hosted-relative endpoints', () => {
    const search = new TextSearch();
    search.startServerSearch = vi.fn();
    fixtures.config.serverSearchPath = 'https://search.test/query';
    search.start('WEB', [], 'word');
    expect(search.startServerSearch).toHaveBeenCalledWith(search.textInfo, [], 'word');

    const second = new TextSearch();
    second.startServerSearch = vi.fn();
    fixtures.config.serverSearchPath = '/search';
    second.start('WEB', [], 'word');
    expect(second.startServerSearch).toHaveBeenCalled();
  });

  it('exposes complete-event state and generates stem regexps', () => {
    const search = new TextSearch();
    search.searchIndexesData = [{ sectionid: 'GN1' }];
    search.searchTermsRegExp = [/one/];
    search.isLemmaSearch = true;
    expect(search.completeEventData([1])).toEqual({
      results: [1], searchIndexesData: search.searchIndexesData,
      searchTermsRegExp: search.searchTermsRegExp, isLemmaSearch: true
    });
    search.applyServerStemWords(['love', 'loved']);
    expect(search.searchType).toBe('OR');
    expect(search.searchTermsRegExp).toHaveLength(2);
    expect(search.searchTermsRegExp[0].test('love')).toBe(true);
  });

  it('completes server searches with stemmed and collected results', async () => {
    fixtures.config.serverSearchPath = 'https://search.test/query';
    fetch.mockResolvedValue({ json: vi.fn().mockResolvedValue({
      stem_words: ['love', 'loved'],
      results: [{ GN1_1: 'one' }, { JN3_16: 'two' }]
    }) });
    const search = new TextSearch();
    search.trigger = vi.fn();
    search.startServerSearch({ id: 'WEB' }, ['GN', 'JN'], 'Love');
    await vi.waitFor(() => expect(search.trigger).toHaveBeenCalledWith(
      'complete', expect.objectContaining({ data: expect.objectContaining({
        results: [
          { fragmentid: 'GN1_1', html: 'one' },
          { fragmentid: 'JN3_16', html: 'two' }
        ]
      }) })
    ));
    expect(search.searchType).toBe('OR');
    expect(search.searchTermsRegExp).toHaveLength(2);
    expect(search.isSearching).toBe(false);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('search=love'));
  });

  it('reports server failures as a null completion', async () => {
    const failure = new Error('offline');
    fetch.mockRejectedValue(failure);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const search = new TextSearch();
    search.trigger = vi.fn();
    search.isSearching = true;
    search.startServerSearch({ id: 'WEB' }, [], 'word');
    await vi.waitFor(() => expect(search.trigger).toHaveBeenCalledWith(
      'complete', expect.objectContaining({ data: expect.objectContaining({ results: null }) })
    ));
    expect(search.isSearching).toBe(false);
    expect(error).toHaveBeenCalledWith('error:serverSearch', failure);
  });

  it('handles missing, empty, and stemmed index-loader results', () => {
    const search = new TextSearch();
    search.trigger = vi.fn();
    search.loadNextSectionid = vi.fn();
    search.buildBruteForceIndex = vi.fn(() => [{ sectionid: 'GN1' }]);
    search.indexesLoaded({ data: null });
    expect(search.loadNextSectionid).not.toHaveBeenCalled();

    search.indexesLoaded({ data: { loadedIndexes: [] } });
    expect(search.searchIndexesData).toEqual([{ sectionid: 'GN1' }]);
    expect(search.searchIndexesCurrentIndex).toBe(-1);
    expect(search.loadNextSectionid).toHaveBeenCalledOnce();

    search.loadNextSectionid.mockClear();
    search.indexesLoaded({ data: {
      loadedIndexes: [{}], loadedResults: [{ sectionid: 'JN3' }],
      stemInfo: [{ words: ['love', 'loved'] }]
    } });
    expect(search.trigger).toHaveBeenCalledWith('indexcomplete', expect.objectContaining({
      data: { searchIndexesData: [{ sectionid: 'JN3' }] }
    }));
    expect(search.searchType).toBe('OR');
    expect(search.searchTermsRegExp).toHaveLength(2);
    expect(search.searchIndexesData).toEqual([{ sectionid: 'JN3' }]);
    expect(search.loadNextSectionid).toHaveBeenCalledOnce();
  });

  it('completes, skips empty entries, and stops when index traversal passes the end', () => {
    const search = new TextSearch();
    search.trigger = vi.fn();
    search.searchIndexesData = [];
    search.searchIndexesCurrentIndex = -1;
    search.isSearching = true;
    search.loadNextSectionid();
    expect(search.trigger).toHaveBeenCalledWith('complete', expect.any(Object));
    expect(search.isSearching).toBe(false);

    search.trigger.mockClear();
    search.searchIndexesCurrentIndex = 0;
    search.loadNextSectionid();
    expect(search.isSearching).toBe(false);

    search.searchIndexesData = [null];
    search.searchIndexesCurrentIndex = -1;
    search.loadNextSectionid();
    expect(search.trigger).toHaveBeenCalledWith('complete', expect.any(Object));
  });

  it('loads each indexed section and advances after success or failure', () => {
    const search = new TextSearch();
    search.trigger = vi.fn();
    search.textInfo = { id: 'WEB' };
    search.searchIndexesData = [{ sectionid: 'GN1', fragmentids: ['GN1_1'] }];
    search.searchIndexesCurrentIndex = -1;
    fixtures.collectSectionResults.mockReturnValue([{ fragmentid: 'GN1_1', html: 'match' }]);
    fixtures.loadSection.mockImplementationOnce((_info, _id, success) => success('<section>'));
    search.loadNextSectionid();
    expect(fixtures.collectSectionResults).toHaveBeenCalledWith(
      '<section>', ['GN1_1'], search.matchOptions()
    );
    expect(search.searchFinalResults).toEqual([{ fragmentid: 'GN1_1', html: 'match' }]);
    expect(search.isSearching).toBe(false);

    const second = new TextSearch();
    second.trigger = vi.fn();
    second.textInfo = { id: 'WEB' };
    second.searchIndexesData = [{ sectionid: 'GN2' }];
    second.searchIndexesCurrentIndex = -1;
    fixtures.loadSection.mockImplementationOnce((_info, _id, _success, failure) => failure());
    second.loadNextSectionid();
    expect(second.isSearching).toBe(false);
  });
});

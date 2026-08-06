import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: {},
  parseBibleIndex: vi.fn(),
  parseTimingText: vi.fn(),
  nextDbsFragment: vi.fn(),
  prevDbsFragment: vi.fn()
}));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));

vi.mock('@/media/DbsAudioData.js', () => ({
  parseBibleIndex: fixtures.parseBibleIndex,
  parseTimingText: fixtures.parseTimingText,
  nextDbsFragment: fixtures.nextDbsFragment,
  prevDbsFragment: fixtures.prevDbsFragment
}));

import { DbsAudioProvider } from '@/media/DbsAudioProvider.js';

function response({ ok = true, status = 200, json = {}, text = '' } = {}) {
  return {
    ok, status,
    json: vi.fn().mockResolvedValue(json),
    text: vi.fn().mockResolvedValue(text)
  };
}

function bibleIndex({ empty = false } = {}) {
  const books = new Map();
  if (!empty) {
    books.set('GN', {
      dbsNum: '01', dbsName: 'Genesis', chapters: [1, 2],
      chapterFiles: new Map([[1, '001']])
    });
    books.set('ZZ', {
      dbsNum: '99', dbsName: 'Unknown', chapters: [50], chapterFiles: new Map()
    });
  }
  return { books, bookOrder: [...books.keys()] };
}

describe('DbsAudioProvider lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.config = { dbsAudioEnabled: true, dbsAudioUrl: 'https://audio.test' };
    fixtures.parseBibleIndex.mockReturnValue(bibleIndex());
    fixtures.parseTimingText.mockReturnValue([{ verse: 1, time: 0 }]);
    fixtures.nextDbsFragment.mockReturnValue('GN2_1');
    fixtures.prevDbsFragment.mockReturnValue('GN1_1');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('initializes independent caches and reports provider name', () => {
    const provider = new DbsAudioProvider();
    expect(provider.name).toBe('dbs');
    expect(provider._indexPromise).toBeNull();
    expect(provider._bibleCache).toBeInstanceOf(Map);
  });

  it('returns an empty index while disabled', async () => {
    fixtures.config.dbsAudioEnabled = false;
    const provider = new DbsAudioProvider();
    expect(await provider._getIndex()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads and caches the configured catalog', async () => {
    const index = [{ id: 'ENG', abbr: 'WEB' }];
    fetch.mockResolvedValue(response({ json: index }));
    const provider = new DbsAudioProvider();
    expect(await provider._getIndex()).toBe(index);
    expect(await provider._getIndex()).toBe(index);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('https://audio.test/index.json');
  });

  it('uses the default catalog URL and permits retry after HTTP or network failure', async () => {
    fixtures.config.dbsAudioUrl = '';
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetch
      .mockResolvedValueOnce(response({ ok: false, status: 503 }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response({ json: [{ id: 'OK' }] }));
    const provider = new DbsAudioProvider();
    expect(await provider._getIndex()).toEqual([]);
    expect(provider._indexPromise).toBeNull();
    expect(await provider._getIndex()).toEqual([]);
    expect(await provider._getIndex()).toEqual([{ id: 'OK' }]);
    expect(fetch).toHaveBeenCalledWith('https://audio.dbs.org/index.json');
    expect(consoleWarn).toHaveBeenCalledTimes(2);
  });

  it('finds matching catalog entries or returns null', () => {
    const provider = new DbsAudioProvider();
    const entry = { id: 'ENG', abbr: 'WEB' };
    expect(provider._findMatch([entry], { id: 'WEB', abbr: 'WEB' })).toBe(entry);
    expect(provider._findMatch([entry], { id: 'OTHER', abbr: 'OTHER' })).toBeNull();
  });

  it('loads, parses, and caches a Bible file index', async () => {
    fetch.mockResolvedValue(response({ text: 'listing' }));
    const parsed = bibleIndex();
    fixtures.parseBibleIndex.mockReturnValue(parsed);
    const provider = new DbsAudioProvider();
    expect(await provider._loadBibleIndex('ENG')).toBe(parsed);
    expect(await provider._loadBibleIndex('ENG')).toBe(parsed);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('https://audio.test/ENG/index.txt');
    expect(fixtures.parseBibleIndex).toHaveBeenCalledWith('listing');
  });

  it('returns null for missing or failed Bible indexes without caching them', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetch
      .mockResolvedValueOnce(response({ ok: false, status: 404 }))
      .mockRejectedValueOnce(new Error('offline'));
    const provider = new DbsAudioProvider();
    expect(await provider._loadBibleIndex('ONE')).toBeNull();
    expect(await provider._loadBibleIndex('TWO')).toBeNull();
    expect(provider._bibleCache.size).toBe(0);
    expect(consoleWarn).toHaveBeenCalledWith(
      'DbsAudioProvider: failed to load index.txt for TWO', expect.any(Error)
    );
  });

  it('uses the default base for Bible indexes', async () => {
    fixtures.config.dbsAudioUrl = '';
    fetch.mockResolvedValue(response({ text: 'listing' }));
    const provider = new DbsAudioProvider();
    await provider._loadBibleIndex('ENG');
    expect(fetch).toHaveBeenCalledWith('https://audio.dbs.org/ENG/index.txt');
  });

  it('returns null audio info for disabled, empty, unmatched, or empty-book catalogs', async () => {
    const provider = new DbsAudioProvider();
    fixtures.config.dbsAudioEnabled = false;
    expect(await provider.getAudioInfo({ id: 'WEB' })).toBeNull();
    fixtures.config.dbsAudioEnabled = true;
    provider._getIndex = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([
      { id: 'ENG', abbr: 'WEB' }
    ]);
    expect(await provider.getAudioInfo({ id: 'WEB' })).toBeNull();
    expect(await provider.getAudioInfo({ id: 'OTHER' })).toBeNull();
    provider._loadBibleIndex = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(bibleIndex({ empty: true }));
    expect(await provider.getAudioInfo({ id: 'WEB' })).toBeNull();
    expect(await provider.getAudioInfo({ id: 'WEB' })).toBeNull();
  });

  it('builds playable audio info with title and abbreviation fallback', async () => {
    const provider = new DbsAudioProvider();
    const entry = { id: 'ENG', abbr: 'WEB', tt: 'World English Bible' };
    const parsed = bibleIndex();
    provider._getIndex = vi.fn().mockResolvedValue([entry]);
    provider._loadBibleIndex = vi.fn().mockResolvedValue(parsed);
    expect(await provider.getAudioInfo({ id: 'WEB' })).toEqual({
      type: 'dbs', title: 'World English Bible', dbsId: 'ENG',
      books: parsed.books, bookOrder: parsed.bookOrder
    });
    delete entry.tt;
    expect((await provider.getAudioInfo({ id: 'WEB' })).title).toBe('WEB');
  });

  it('returns null fragments for missing books or unavailable chapters', async () => {
    const provider = new DbsAudioProvider();
    const info = { dbsId: 'ENG', ...bibleIndex() };
    expect(await provider.getFragmentAudio({}, info, 'JN1_1')).toBeNull();
    expect(await provider.getFragmentAudio({}, info, 'GN3_1')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('builds fragment URLs from catalog filenames and Bible verse boundaries', async () => {
    const provider = new DbsAudioProvider();
    const info = { dbsId: 'ENG', ...bibleIndex() };
    provider._loadTimingFile = vi.fn().mockResolvedValue([{ verse: 1, time: 0 }]);
    expect(await provider.getFragmentAudio({}, info, 'GN1_4')).toEqual({
      url: 'https://audio.test/ENG/01_Genesis_001.mp3',
      id: 'dbs:ENG/01_1',
      start: 'GN1_1',
      end: 'GN1_31',
      timestamps: [{ verse: 1, time: 0 }]
    });
    expect(provider._loadTimingFile).toHaveBeenCalledWith('https://audio.test', 'ENG', '01', '001');
  });

  it('pads missing chapter filenames and falls back to verse one for unknown books', async () => {
    fixtures.config.dbsAudioUrl = '';
    const provider = new DbsAudioProvider();
    const info = { dbsId: 'UNK', ...bibleIndex() };
    provider._loadTimingFile = vi.fn().mockResolvedValue(null);
    const result = await provider.getFragmentAudio({}, info, 'ZZ50_1');
    expect(result).toEqual({
      url: 'https://audio.dbs.org/UNK/99_Unknown_50.mp3',
      id: 'dbs:UNK/99_50', start: 'ZZ50_1', end: 'ZZ50_1', timestamps: null
    });
  });

  it('loads timing files and tolerates absent, HTTP, and network failures', async () => {
    const provider = new DbsAudioProvider();
    fetch
      .mockResolvedValueOnce(response({ text: 'timing' }))
      .mockResolvedValueOnce(response({ ok: false, status: 404 }))
      .mockRejectedValueOnce(new Error('offline'));
    expect(await provider._loadTimingFile('base', 'ENG', '01', '001'))
      .toEqual([{ verse: 1, time: 0 }]);
    expect(fixtures.parseTimingText).toHaveBeenCalledWith('timing');
    expect(await provider._loadTimingFile('base', 'ENG', '01', '002')).toBeNull();
    expect(await provider._loadTimingFile('base', 'ENG', '01', '003')).toBeNull();
  });

  it('delegates next and previous fragment navigation', async () => {
    const provider = new DbsAudioProvider();
    const info = bibleIndex();
    expect(await provider.getNextFragment({}, info, 'GN1_1')).toBe('GN2_1');
    expect(await provider.getPrevFragment({}, info, 'GN2_1')).toBe('GN1_1');
    expect(fixtures.nextDbsFragment).toHaveBeenCalledWith(info, 'GN1_1');
    expect(fixtures.prevDbsFragment).toHaveBeenCalledWith(info, 'GN2_1');
  });
});

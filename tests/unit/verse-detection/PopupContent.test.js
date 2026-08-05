import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeConfig } from '@verse-detection/config.ts';
import {
  fetchChapterAndExtractVerses,
  fetchFromTextLoader,
  fetchVerseContent,
  loadAppTextLoader,
  parsePopupReference
} from '@verse-detection/PopupContent.ts';
import {
  applyTextIdMapping,
  getAvailableLanguagesFromIndex,
  getTextsForLanguageFromIndex,
  loadTextsIndex
} from '@verse-detection/PopupTextCatalog.ts';

const chapterHtml = '<div class="section"><span class="v" data-id="JN3_16">For God so loved</span></div>';

function makeConfig(overrides = {}) {
  return mergeConfig({
    contentSource: {
      type: 'remote',
      baseUrl: 'https://content.test/texts',
      textsIndexUrl: '',
      dynamicTextSelection: false,
      textIdsByLanguage: { en: 'ENGWEB' },
      ...overrides
    },
    popup: { cacheContent: true, showVerseNumbers: true }
  });
}

function makeState(config = makeConfig()) {
  return { config, cache: new Map(), textLoader: null, app: null };
}

describe('popup content loading', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('parses verse ranges, chapter references, and invalid references', () => {
    expect(parsePopupReference('John 3:16-18')).toMatchObject({
      bookCode: 'JN', chapter: 3, startVerse: 16, endVerse: 18,
      sectionId: 'JN3', verseId: 'JN3_16'
    });
    expect(parsePopupReference('Psalms 23')).toMatchObject({ startVerse: null, endVerse: null, sectionId: 'PS23' });
    expect(parsePopupReference('Unknown 1:1')).toBeNull();
    expect(parsePopupReference('invalid')).toBeNull();
  });

  it('fetches remote content, extracts a verse, and reuses the cache', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => chapterHtml }));
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState();
    const first = await fetchVerseContent(state, 'John 3:16', 'en');
    const second = await fetchVerseContent(state, 'John 3:16', 'en');
    expect(first.content).toContain('For God so loved');
    expect(first.content).toContain('v-num');
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('https://content.test/texts/ENGWEB/JN3.html');
  });

  it('supports templates and normalizes remote failures', async () => {
    const config = makeConfig({ pathTemplate: '{baseUrl}/chapter/{sectionId}?text={textId}' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => chapterHtml })));
    await fetchChapterAndExtractVerses(makeState(config), parsePopupReference('John 3:16'), 'en', 'NIV');
    expect(fetch).toHaveBeenCalledWith('https://content.test/texts/chapter/JN3?text=NIV');

    fetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(fetchChapterAndExtractVerses(makeState(), parsePopupReference('John 3:16'), 'en'))
      .rejects.toThrow('Chapter not available');
    await expect(fetchVerseContent(makeState(), 'bad reference', 'en')).rejects.toThrow('Invalid verse reference');
    await expect(fetchChapterAndExtractVerses(makeState(makeConfig({ textIdsByLanguage: {} })), parsePopupReference('John 3:16'), 'fr'))
      .rejects.toThrow('No Bible text available');
  });

  it('loads through the host TextLoader and reports each callback failure', async () => {
    const parsed = parsePopupReference('John 3:16');
    const loader = {
      getText: vi.fn((id, success) => success({ id })),
      loadSection: vi.fn((info, section, success) => success(chapterHtml))
    };
    const state = { ...makeState(makeConfig({ type: 'app' })), textLoader: loader, app: {} };
    await expect(fetchVerseContent(state, 'John 3:16', 'en')).resolves.toMatchObject({ content: expect.stringContaining('For God') });
    expect(loader.loadSection).toHaveBeenCalledWith({ id: 'ENGWEB' }, 'JN3', expect.any(Function), expect.any(Function));

    await expect(fetchFromTextLoader({ ...state, textLoader: null }, parsed, 'en')).rejects.toThrow('TextLoader not available');
    const textFailure = { ...loader, getText: vi.fn((id, success, failure) => failure()) };
    await expect(fetchFromTextLoader({ ...state, textLoader: textFailure }, parsed, 'en')).rejects.toThrow('Failed to load text info');
    const sectionFailure = {
      getText: vi.fn((id, success) => success({ id })),
      loadSection: vi.fn((info, section, success, failure) => failure())
    };
    await expect(fetchFromTextLoader({ ...state, textLoader: sectionFailure }, parsed, 'en')).rejects.toThrow('Failed to load chapter');
    await expect(fetchVerseContent(makeState(makeConfig({ type: 'app' })), 'John 3:16', 'en'))
      .rejects.toThrow('App TextLoader not available');
  });

  it('gracefully falls back when the optional host loader cannot be imported', async () => {
    await expect(loadAppTextLoader()).resolves.toBeNull();
  });
});

describe('popup text catalog', () => {
  afterEach(() => vi.unstubAllGlobals());

  const texts = [
    { id: 'ENGWEB', lang: 'eng', type: 'bible', hasText: true },
    { id: 'ENGALT', lang: 'eng', type: 'bible' },
    { id: 'SPABES', lang: 'spa', langNameEnglish: 'Spanish', type: 'bible', hasText: true },
    { id: 'COMMENT', lang: 'eng', type: 'commentary' },
    { id: 'EMPTY', lang: 'eng', type: 'bible', hasText: false }
  ];

  it('loads an index and builds preferred language mappings', async () => {
    const config = makeConfig({ textsIndexUrl: 'https://content.test/texts.json', preferredTextIdsByLanguage: { en: ['MISSING', 'ENGALT'] } });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ textInfoData: texts }) })));
    await expect(loadTextsIndex(config)).resolves.toMatchObject({ textsIndexData: texts, loaded: true });
    expect(config.contentSource.textIdsByLanguage.en).toBe('ENGALT');
  });

  it('falls back to preferences for missing configuration and network errors', async () => {
    const withoutUrl = makeConfig({ textsIndexUrl: '', preferredTextIdsByLanguage: { en: 'ENGWEB' } });
    await expect(loadTextsIndex(withoutUrl)).resolves.toEqual({ textsIndexData: null, loaded: false });
    expect(withoutUrl.contentSource.textIdsByLanguage).toEqual({ en: 'ENGWEB' });

    const failed = makeConfig({ textsIndexUrl: '/missing', preferredTextIdsByLanguage: { es: 'SPABES' } });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(loadTextsIndex(failed)).resolves.toEqual({ textsIndexData: null, loaded: false });
    expect(failed.contentSource.textIdsByLanguage).toEqual({ es: 'SPABES' });
  });

  it('filters and counts only usable Bible texts', () => {
    expect(getTextsForLanguageFromIndex(texts, 'en').map(text => text.id)).toEqual(['ENGWEB', 'ENGALT']);
    expect(getTextsForLanguageFromIndex(null, 'en')).toEqual([]);
    expect(getAvailableLanguagesFromIndex(texts)).toEqual({ en: 2, es: 1 });
    expect(getAvailableLanguagesFromIndex(null)).toEqual({});
    const config = makeConfig({ preferredTextIdsByLanguage: { es: 'SPABES' } });
    applyTextIdMapping(config, texts);
    expect(config.contentSource.textIdsByLanguage.es).toBe('SPABES');
  });
});

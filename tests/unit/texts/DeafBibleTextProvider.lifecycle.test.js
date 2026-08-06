import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: {},
  idFor: vi.fn(entry => `deaf_${entry.iso.toUpperCase()}`),
  buildTitle: vi.fn(),
  buildSectionHtml: vi.fn(() => '<section>deaf</section>')
}));

vi.mock('@core/config.js', () => ({
  getConfig: () => fixtures.config
}));

vi.mock('@texts/DeafBibleTitle.js', () => ({
  idFor: fixtures.idFor,
  parsePassage: vi.fn(),
  buildTitle: fixtures.buildTitle,
  buildSectionHtml: fixtures.buildSectionHtml
}));

import { DeafBibleTextProvider, getPlaylist, loadIndex } from '@texts/DeafBibleTextProvider.js';

function response({ ok = true, status = 200, json = {} } = {}) {
  return { ok, status, json: vi.fn().mockResolvedValue(json) };
}

function manifest() {
  return new Promise(resolve => DeafBibleTextProvider.getTextManifest(resolve));
}

function textInfo(textid, withError = false) {
  return new Promise(resolve => {
    DeafBibleTextProvider.getTextInfo(
      textid,
      info => resolve({ info }),
      withError ? error => resolve({ error }) : undefined
    );
  });
}

function section(textid, sectionid, withError = true) {
  return new Promise(resolve => {
    DeafBibleTextProvider.loadSection(
      textid,
      sectionid,
      html => resolve({ html }),
      withError ? (...error) => resolve({ error }) : undefined
    );
    if (!withError) setTimeout(() => resolve({ noErrorCallback: true }), 0);
  });
}

const catalog = {
  videos: [
    { o: 'DeafBible', i: 'ase', l: 'Zulu Sign Language', c: 'US', j: 'ase_deaf_bible.json' },
    {
      org: 'DeafBible', iso: 'aed', language: 'Argentine Sign Language', direction: 'rtl',
      primaryCountry: 'AR', file: 'aed_title.json'
    },
    { o: 'DeafBible', i: 'bfi', l: 'British Sign Language', j: 'bfi_deaf_bible.json' },
    { o: 'Jesus', i: 'eng', l: 'English', j: 'eng_jesus.json' },
    null,
    { o: 'DeafBible', i: '', l: 'No ISO', j: 'missing_iso.json' },
    { o: 'DeafBible', i: 'mis', l: 'No file' }
  ]
};

function built(entry, raw = {}) {
  const id = `deaf_${entry.iso.toUpperCase()}`;
  const passage = { id: `${id}-passage` };
  return {
    info: {
      id,
      type: 'deafbible',
      lang: entry.iso,
      sections: ['GN1'],
      metadata: raw.metadata
    },
    sectionPassages: new Map([['GN1', [passage]]]),
    orderedPassages: [passage]
  };
}

describe.sequential('DeafBibleTextProvider lifecycle', () => {
  beforeAll(() => {
    fixtures.buildTitle.mockImplementation(built);
  });

  beforeEach(() => {
    fixtures.config = {
      enableOnlineSources: true,
      deafBibleEnabled: true,
      deafBibleCatalogUrl: '',
      deafBibleMetaUrl: 'https://meta.test/base/'
    };
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    fixtures.buildSectionHtml.mockReturnValue('<section>deaf</section>');
  });

  it('exposes provider identity', () => {
    expect(DeafBibleTextProvider.name).toBe('deafbible');
    expect(DeafBibleTextProvider.fullName).toBe('Deaf Bible (Deaf Bible Society)');
  });

  it('returns no manifest when online sources or the provider are disabled', async () => {
    fixtures.config.enableOnlineSources = false;
    expect(await manifest()).toBeNull();
    fixtures.config.enableOnlineSources = true;
    fixtures.config.deafBibleEnabled = false;
    expect(await manifest()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('degrades a failed catalog request to an empty index and permits retry', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockResolvedValueOnce(response({ ok: false, status: 503 }));
    expect(await loadIndex(fixtures.config)).toEqual([]);
    expect(fetch).toHaveBeenCalledWith('https://dbs.org/data/video.json');
    expect(consoleError).toHaveBeenCalledWith('Deaf Bible catalog error:', expect.any(Error));

    fixtures.config.deafBibleCatalogUrl = 'https://catalog.test/video.json';
    fetch.mockResolvedValueOnce(response({ json: catalog }));
    const index = await loadIndex(fixtures.config);
    expect(fetch).toHaveBeenLastCalledWith('https://catalog.test/video.json');
    expect(index).toEqual([
      expect.objectContaining({
        iso: 'aed', language: 'Argentine Sign Language', direction: 'rtl',
        primaryCountry: 'AR', file: 'aed_title.json', directory: 'aed_title.json'
      }),
      expect.objectContaining({
        iso: 'bfi', language: 'British Sign Language', direction: 'ltr',
        primaryCountry: '', file: 'bfi_deaf_bible.json', directory: 'bfi'
      }),
      expect.objectContaining({
        iso: 'ase', language: 'Zulu Sign Language', primaryCountry: 'US',
        file: 'ase_deaf_bible.json', directory: 'ase'
      })
    ]);
  });

  it('reuses the cached index and builds normalized manifest entries', async () => {
    const first = await loadIndex(fixtures.config);
    const second = await loadIndex({});
    expect(second).toBe(first);
    expect(fetch).not.toHaveBeenCalled();

    const texts = await manifest();
    expect(texts.map(text => text.id)).toEqual(['deaf_AED', 'deaf_BFI', 'deaf_ASE']);
    expect(texts[0]).toMatchObject({
      type: 'deafbible', name: 'Argentine Sign Language', title: 'Deaf Bible',
      abbr: 'AED', lang: 'aed', dir: 'rtl', hasText: true, hasAudio: false,
      cover: '', countries: ['AR'],
      _deaf: { file: 'aed_title.json', directory: 'aed_title.json' }
    });
    expect(texts[1].countries).toEqual([]);
  });

  it('returns null text info while disabled and reports unknown titles in both callback styles', async () => {
    fixtures.config.deafBibleEnabled = false;
    expect((await textInfo('deaf_AED')).info).toBeNull();
    fixtures.config.deafBibleEnabled = true;
    expect((await textInfo('missing')).info).toBeNull();
    const missing = await textInfo('missing', true);
    expect(missing.error).toEqual(new Error('No Deaf Bible for "missing"'));
  });

  it('loads per-title metadata from a trimmed base URL and caches built info', async () => {
    fetch.mockResolvedValueOnce(response({ json: { metadata: 'aed' } }));
    const first = await textInfo('provider:deaf_AED', true);
    expect(fetch).toHaveBeenCalledWith('https://meta.test/base/aed_title.json');
    expect(fixtures.buildTitle).toHaveBeenCalledWith(expect.objectContaining({ iso: 'aed' }), { metadata: 'aed' });
    expect(first.info).toMatchObject({ id: 'deaf_AED', metadata: 'aed' });

    fetch.mockClear();
    const cached = await textInfo('deaf_AED', true);
    expect(cached.info).toBe(first.info);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports metadata HTTP and network failures with error or null callbacks', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockResolvedValueOnce(response({ ok: false, status: 404 }));
    const failed = await textInfo('deaf_BFI', true);
    expect(failed.error).toEqual(new Error('HTTP 404'));

    fetch.mockRejectedValueOnce(new Error('offline'));
    expect((await textInfo('deaf_BFI')).info).toBeNull();
    expect(consoleError).toHaveBeenCalledWith('Deaf Bible getTextInfo error:', expect.any(Error));
  });

  it('uses the default metadata base when none is configured', async () => {
    fixtures.config.deafBibleMetaUrl = '';
    fetch.mockResolvedValueOnce(response({ json: { metadata: 'ase' } }));
    const result = await textInfo('deaf_ASE', true);
    expect(result.info.id).toBe('deaf_ASE');
    expect(fetch).toHaveBeenCalledWith(
      'https://meta.dbs.org/data/data-video/video/DeafBible/ase_deaf_bible.json'
    );
  });

  it('returns ordered playlists for cached titles and empty playlists for errors', async () => {
    expect(await getPlaylist('deaf_ASE')).toEqual([{ id: 'deaf_ASE-passage' }]);
    expect(await getPlaylist('missing')).toEqual([]);
  });

  it('renders cached sections and reports missing passages or title failures', async () => {
    expect(await section('deaf_ASE', 'GN1')).toEqual({ html: '<section>deaf</section>' });
    expect(fixtures.buildSectionHtml).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'deaf_ASE' }),
      'GN1',
      [{ id: 'deaf_ASE-passage' }]
    );
    expect((await section('deaf_ASE', 'EX1')).error).toEqual(['deaf_ASE', 'EX1']);
    expect((await section('missing', 'GN1')).error).toEqual(['missing', 'GN1']);
    expect(await section('missing', 'GN1', false)).toEqual({ noErrorCallback: true });

    fixtures.config.deafBibleEnabled = false;
    expect((await section('deaf_ASE', 'GN1')).error).toEqual(['deaf_ASE', 'GN1']);
  });

  it('completes video-only searches with an empty result envelope', () => {
    const onSearchComplete = vi.fn();
    DeafBibleTextProvider.startSearch({ onSearchComplete });
    expect(onSearchComplete).toHaveBeenCalledWith({
      type: 'complete',
      target: null,
      data: {
        results: [], searchIndexesData: [], searchTermsRegExp: [], isLemmaSearch: false
      }
    });
    expect(() => DeafBibleTextProvider.startSearch({})).not.toThrow();
  });
});

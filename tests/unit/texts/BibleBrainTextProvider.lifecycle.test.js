import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: {},
  existingTexts: [],
  processTexts: vi.fn(),
  getTextInfoData: vi.fn(),
  registerLinkedAudio: vi.fn(),
  aliasTargetFor: vi.fn(() => null),
  isPairingBlocked: vi.fn(() => false),
  filesetCoversTestament: vi.fn(),
  selectTextFileset: vi.fn(),
  flattenFilesets: vi.fn(),
  selectFilesets: vi.fn(),
  entryToTextInfo: vi.fn(),
  fetchAllBibles: vi.fn(),
  normalizeChapters: vi.fn(),
  buildStructureFromBooks: vi.fn(),
  versesToHtml: vi.fn(() => '<section>bible-brain</section>'),
  extractSearchVerses: vi.fn(),
  searchStarter: vi.fn(),
  createBibleBrainSearchStarter: vi.fn(() => fixtures.searchStarter)
}));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));

vi.mock('@texts/TextLoader.js', () => ({
  processTexts: fixtures.processTexts,
  getTextInfoData: fixtures.getTextInfoData
}));

vi.mock('@/data/biblebrainDuplicates.js', () => ({
  registerLinkedAudio: fixtures.registerLinkedAudio
}));

vi.mock('@/data/biblebrainAliases.js', () => ({
  aliasTargetFor: fixtures.aliasTargetFor,
  isPairingBlocked: fixtures.isPairingBlocked
}));

vi.mock('@texts/BibleBrainCatalog.js', () => ({
  filesetCoversTestament: fixtures.filesetCoversTestament,
  selectTextFileset: fixtures.selectTextFileset,
  flattenFilesets: fixtures.flattenFilesets,
  selectFilesets: fixtures.selectFilesets,
  entryToTextInfo: fixtures.entryToTextInfo,
  fetchAllBibles: fixtures.fetchAllBibles,
  normalizeChapters: fixtures.normalizeChapters,
  buildStructureFromBooks: fixtures.buildStructureFromBooks,
  versesToHtml: fixtures.versesToHtml
}));

vi.mock('@texts/BibleBrainSearch.js', () => ({
  extractSearchVerses: fixtures.extractSearchVerses,
  createBibleBrainSearchStarter: fixtures.createBibleBrainSearchStarter
}));

const loadProvider = async () => (await import('@texts/BibleBrainTextProvider.js')).BibleBrainTextProvider;

function manifest(provider) {
  return new Promise(resolve => provider.getTextManifest(resolve));
}

function textInfo(provider, textid) {
  return new Promise(resolve => provider.getTextInfo(textid, resolve));
}

function section(provider, textid, sectionid, withError = true) {
  return new Promise(resolve => {
    provider.loadSection(
      textid,
      sectionid,
      html => resolve({ html }),
      withError ? (...error) => resolve({ error }) : undefined
    );
    if (!withError) setTimeout(() => resolve({ noErrorCallback: true }), 0);
  });
}

function response({ ok = true, status = 200, json = {} } = {}) {
  return { ok, status, json: vi.fn().mockResolvedValue(json) };
}

function info(id, overrides = {}) {
  return {
    id,
    providerid: `biblebrain:${id}`,
    abbr: id,
    lang: 'eng',
    dir: 'ltr',
    divisions: [],
    divisionNames: [],
    sections: [],
    hasAudio: false,
    biblebrain: { bibleId: id, textFilesets: [{ id: `${id}_TEXT` }], audioFilesets: [] },
    ...overrides
  };
}

describe('BibleBrainTextProvider lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fixtures.config = {
      enableOnlineSources: true,
      bibleBrainEnabled: true,
      bibleBrainProxyBase: 'https://proxy.test/fcbh/v4',
      bibleBrainLanguages: [],
      bibleBrainExcludeIds: []
    };
    fixtures.existingTexts = [];
    fixtures.getTextInfoData.mockImplementation(() => fixtures.existingTexts);
    fixtures.processTexts.mockImplementation((texts, provider) => {
      for (const text of texts) text.providerid = `${provider}:${text.id}`;
    });
    fixtures.selectFilesets.mockImplementation(filesets => ({
      textFilesets: filesets?.text ?? [],
      audioFilesets: filesets?.audio ?? []
    }));
    fixtures.entryToTextInfo.mockImplementation(entry => entry.info ?? null);
    fixtures.fetchAllBibles.mockResolvedValue([]);
    fixtures.selectTextFileset.mockImplementation(filesets => filesets?.[0] ?? null);
    fixtures.versesToHtml.mockReturnValue('<section>bible-brain</section>');
    fixtures.aliasTargetFor.mockReturnValue(null);
    fixtures.isPairingBlocked.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('exposes provider identity and the injected search starter', async () => {
    const provider = await loadProvider();
    expect(provider).toMatchObject({
      name: 'biblebrain',
      fullName: 'Bible Brain (Faith Comes By Hearing)',
      startSearch: fixtures.searchStarter
    });
  });

  it('returns null while each online-source requirement is disabled', async () => {
    const provider = await loadProvider();
    fixtures.config.enableOnlineSources = false;
    expect(await manifest(provider)).toBeNull();
    expect(await textInfo(provider, 'ONE')).toBeNull();
    fixtures.config.enableOnlineSources = true;
    fixtures.config.bibleBrainEnabled = false;
    expect(await manifest(provider)).toBeNull();
    fixtures.config.bibleBrainEnabled = true;
    fixtures.config.bibleBrainProxyBase = '';
    expect(await manifest(provider)).toBeNull();
    expect(fixtures.fetchAllBibles).not.toHaveBeenCalled();
  });

  it('queues concurrent manifests, filters entries, pairs audio, and caches results', async () => {
    let resolveCatalog;
    fixtures.fetchAllBibles.mockReturnValue(new Promise(resolve => { resolveCatalog = resolve; }));
    fixtures.config.bibleBrainLanguages = ['eng'];
    fixtures.config.bibleBrainExcludeIds = ['EXCLUDED'];
    fixtures.existingTexts = [
      { id: 'LOCAL', abbr: 'DUP', hasAudio: false },
      { id: null, abbr: null, hasAudio: false }
    ];
    fixtures.aliasTargetFor.mockImplementation(abbr => ({
      EXTERNAL: 'ESV', ALIAS_KEPT: 'KEPT', TEXT_ONLY: 'TEXT_TARGET'
    })[abbr] ?? null);
    fixtures.isPairingBlocked.mockImplementation(abbr => abbr === 'BLOCKED');
    const kept = info('KEPT', {
      biblebrain: { bibleId: 'KEPT', textFilesets: [{ id: 'K_TEXT' }], audioFilesets: [{ id: 'OWN' }] }
    });
    const blocked = info('BLOCKED');
    const entries = [
      { abbr: 'SPANISH', iso: 'spa', info: info('SPANISH') },
      { abbr: 'DUP', iso: 'eng', filesets: { audio: [{ id: 'DUP_AUDIO' }] } },
      { abbr: 'DUP', iso: 'eng', filesets: { audio: [{ id: 'DUP_AUDIO' }] } },
      { abbr: 'EXTERNAL', iso: 'eng', filesets: { audio: [{ id: 'EXT_AUDIO' }] } },
      { abbr: 'TEXT_ONLY', iso: 'eng', filesets: { text: [{ id: 'TEXT' }] } },
      { abbr: 'EXCLUDED', iso: 'eng', info: info('EXCLUDED') },
      { abbr: 'EMPTY', iso: 'eng' },
      { abbr: 'KEPT', iso: 'eng', info: kept },
      { abbr: 'ALIAS_KEPT', iso: 'eng', filesets: { audio: [{ id: 'ALIAS_AUDIO' }, { id: 'OWN' }] } },
      { abbr: 'BLOCKED', iso: 'eng', info: blocked, filesets: { audio: [{ id: 'BLOCK_AUDIO' }] } }
    ];
    const provider = await loadProvider();
    const order = [];
    const first = new Promise(resolve => provider.getTextManifest(data => { order.push('first'); resolve(data); }));
    const second = new Promise(resolve => provider.getTextManifest(data => { order.push('second'); resolve(data); }));
    expect(fixtures.fetchAllBibles).toHaveBeenCalledOnce();
    resolveCatalog(entries);
    const [one, two] = await Promise.all([first, second]);

    expect(one).toBe(two);
    expect(order).toEqual(['second', 'first']);
    expect(one.map(text => text.id)).toEqual(['KEPT', 'BLOCKED']);
    expect(fixtures.existingTexts[0].hasAudio).toBe(true);
    expect(kept.biblebrain.audioFilesets).toEqual([{ id: 'OWN' }, { id: 'ALIAS_AUDIO' }]);
    expect(kept.hasAudio).toBe(true);
    expect(fixtures.registerLinkedAudio).toHaveBeenCalledWith([
      { inscriptId: 'LOCAL', bibleBrainIds: ['DUP', 'DUP'], audioFilesets: [{ id: 'DUP_AUDIO' }] },
      { inscriptId: 'ESV', bibleBrainIds: ['EXTERNAL'], audioFilesets: [{ id: 'EXT_AUDIO' }] }
    ]);
    expect(fixtures.processTexts).toHaveBeenCalledWith(one, 'biblebrain');
    expect(await manifest(provider)).toBe(one);
    expect(fixtures.fetchAllBibles).toHaveBeenCalledOnce();
  });

  it('uses empty language/exclusion defaults and handles absent existing-text data', async () => {
    fixtures.config.bibleBrainLanguages = undefined;
    fixtures.config.bibleBrainExcludeIds = undefined;
    fixtures.getTextInfoData.mockReturnValue(null);
    const only = info('ONLY');
    fixtures.fetchAllBibles.mockResolvedValue([{ abbr: 'ONLY', iso: 'zzz', info: only }]);
    const provider = await loadProvider();
    expect(await manifest(provider)).toEqual([only]);
  });

  it('recovers from manifest fetch failure and drains all pending callbacks', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixtures.fetchAllBibles.mockRejectedValue(new Error('offline'));
    const provider = await loadProvider();
    const [first, second] = await Promise.all([manifest(provider), manifest(provider)]);
    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith('Bible Brain manifest error:', expect.any(Error));
    expect(await textInfo(provider, 'missing')).toBeNull();
  });

  it('cold-loads text info, builds book structure, converts USFM codes, and caches it', async () => {
    const text = info('ONE');
    fixtures.fetchAllBibles.mockResolvedValue([{ abbr: 'ONE', iso: 'eng', info: text }]);
    fetch.mockResolvedValue(response({ json: { data: [{ book_id: 'GEN' }] } }));
    let converter;
    fixtures.buildStructureFromBooks.mockImplementation((target, books, convert) => {
      converter = convert;
      target.divisions = ['GN'];
      target.divisionNames = ['Genesis'];
      target.sections = ['GN1'];
    });
    const provider = await loadProvider();
    const loaded = await textInfo(provider, 'ONE');
    expect(fetch).toHaveBeenCalledWith('https://proxy.test/fcbh/v4/bibles/ONE/book');
    expect(fixtures.buildStructureFromBooks).toHaveBeenCalledWith(
      text, [{ book_id: 'GEN' }], expect.any(Function)
    );
    expect(converter('GEN')).toBe('GN');
    expect(converter('TOB')).toBe('TB');
    expect(converter('UNKNOWN')).toBeUndefined();
    expect(loaded.sections).toEqual(['GN1']);

    fetch.mockClear();
    expect(await textInfo(provider, 'biblebrain:ONE')).toBe(loaded);
    expect(await textInfo(provider, 'missing')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null when book metadata responds unsuccessfully or rejects', async () => {
    const one = info('ONE');
    const two = info('TWO');
    fixtures.fetchAllBibles.mockResolvedValue([
      { abbr: 'ONE', iso: 'eng', info: one },
      { abbr: 'TWO', iso: 'eng', info: two }
    ]);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch
      .mockResolvedValueOnce(response({ ok: false, status: 503 }))
      .mockRejectedValueOnce(new Error('offline'));
    const provider = await loadProvider();
    expect(await textInfo(provider, 'ONE')).toBeNull();
    expect(await textInfo(provider, 'TWO')).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it('builds structure from an absent book list as an empty array', async () => {
    const text = info('ONE');
    fixtures.fetchAllBibles.mockResolvedValue([{ abbr: 'ONE', iso: 'eng', info: text }]);
    fetch.mockResolvedValue(response({ json: {} }));
    const provider = await loadProvider();
    await textInfo(provider, 'ONE');
    expect(fixtures.buildStructureFromBooks).toHaveBeenCalledWith(text, [], expect.any(Function));
  });

  it('loads a section with fileset, navigation, language, and division metadata', async () => {
    const text = info('ONE', {
      dir: 'rtl',
      divisions: ['JN'], divisionNames: ['John Custom'],
      sections: ['JN2', 'JN3', 'JN4']
    });
    fixtures.fetchAllBibles.mockResolvedValue([{ abbr: 'ONE', iso: 'eng', info: text }]);
    fixtures.selectTextFileset.mockReturnValue({ id: 'ONE_TEXT' });
    fetch.mockResolvedValue(response({ json: { data: [{ verse_start: 16, verse_text: 'text' }] } }));
    const provider = await loadProvider();
    await manifest(provider);
    const result = await section(provider, 'ONE', 'JN3');
    expect(result).toEqual({ html: '<section>bible-brain</section>' });
    expect(fixtures.selectTextFileset).toHaveBeenCalledWith(text.biblebrain.textFilesets, 'JN');
    expect(fetch).toHaveBeenCalledWith(
      'https://proxy.test/fcbh/v4/bibles/filesets/ONE_TEXT/JHN/3'
    );
    expect(fixtures.versesToHtml).toHaveBeenCalledWith(
      [{ verse_start: 16, verse_text: 'text' }],
      {
        textid: 'ONE', sectionid: 'JN3', bookid: 'JN', chapter: '3',
        lang: 'eng', dir: 'rtl', title: 'John Custom', previd: 'JN2', nextid: 'JN4'
      }
    );
  });

  it('uses fallback title, ltr direction, and null navigation at an unknown section index', async () => {
    const text = info('ONE', {
      dir: undefined,
      divisions: ['GN'], divisionNames: ['Genesis'], sections: ['GN1']
    });
    fixtures.fetchAllBibles.mockResolvedValue([{ abbr: 'ONE', iso: 'eng', info: text }]);
    fixtures.selectTextFileset.mockReturnValue({ id: 'ONE_TEXT' });
    fetch.mockResolvedValue(response({ json: { data: [{}] } }));
    const provider = await loadProvider();
    await manifest(provider);
    await section(provider, 'ONE', 'JN3');
    expect(fixtures.versesToHtml).toHaveBeenCalledWith([{}], expect.objectContaining({
      dir: 'ltr', title: 'John', previd: null, nextid: null
    }));
  });

  it('reports missing text, unknown book, and uncovered fileset before fetching', async () => {
    const text = info('ONE', { divisions: ['GN'], sections: ['GN1'] });
    fixtures.fetchAllBibles.mockResolvedValue([{ abbr: 'ONE', iso: 'eng', info: text }]);
    fixtures.selectTextFileset.mockReturnValue(null);
    const provider = await loadProvider();
    await manifest(provider);
    expect((await section(provider, 'missing', 'GN1')).error).toEqual(['missing', 'GN1']);
    expect((await section(provider, 'ONE', 'ZZ1')).error).toEqual(['ONE', 'ZZ1']);
    expect((await section(provider, 'ONE', 'GN1')).error).toEqual(['ONE', 'GN1']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports empty, malformed, HTTP, and network section responses', async () => {
    const text = info('ONE', { divisions: ['GN'], sections: ['GN1', 'GN2', 'GN3', 'GN4'] });
    fixtures.fetchAllBibles.mockResolvedValue([{ abbr: 'ONE', iso: 'eng', info: text }]);
    fixtures.selectTextFileset.mockReturnValue({ id: 'ONE_TEXT' });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch
      .mockResolvedValueOnce(response({ json: {} }))
      .mockResolvedValueOnce(response({ json: { data: [] } }))
      .mockResolvedValueOnce(response({ json: { data: {} } }))
      .mockResolvedValueOnce(response({ ok: false, status: 500 }))
      .mockRejectedValueOnce(new Error('offline'));
    const provider = await loadProvider();
    await manifest(provider);
    for (const sectionid of ['GN1', 'GN2', 'GN3']) {
      expect((await section(provider, 'ONE', sectionid)).error).toEqual(['ONE', sectionid]);
    }
    expect((await section(provider, 'ONE', 'GN4')).error).toEqual(['ONE', 'GN4']);
    expect((await section(provider, 'ONE', 'GN4')).error).toEqual(['ONE', 'GN4']);
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it('tolerates absent section error callbacks', async () => {
    fixtures.fetchAllBibles.mockResolvedValue([]);
    const provider = await loadProvider();
    expect(await section(provider, 'missing', 'GN1', false)).toEqual({ noErrorCallback: true });
  });
});

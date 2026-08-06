import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: {},
  existingTexts: [],
  getTextInfoData: vi.fn(),
  dbsAudioMatches: vi.fn()
}));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));
vi.mock('@texts/TextLoader.js', () => ({ getTextInfoData: fixtures.getTextInfoData }));
vi.mock('@/media/DbsAudioProvider.js', () => ({ dbsAudioMatches: fixtures.dbsAudioMatches }));

const loadProvider = async () => (await import('@texts/DbsAudioTextProvider.js')).DbsAudioTextProvider;

function response({ ok = true, status = 200, json = [], text = '' } = {}) {
  return {
    ok, status,
    json: vi.fn().mockResolvedValue(json),
    text: vi.fn().mockResolvedValue(text)
  };
}

function manifest(provider) {
  return new Promise(resolve => provider.getTextManifest(resolve));
}

function textInfo(provider, textid) {
  return new Promise(resolve => provider.getTextInfo(textid, resolve));
}

describe('DbsAudioTextProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fixtures.config = { dbsAudioEnabled: true, dbsAudioUrl: 'https://audio.test' };
    fixtures.existingTexts = [];
    fixtures.getTextInfoData.mockImplementation(() => fixtures.existingTexts);
    fixtures.dbsAudioMatches.mockImplementation((entry, text) =>
      [entry.abbr, entry.id, entry.davar_id].includes(text.id) ||
      entry.abbr === (text.abbr || text.id) || entry.id === (text.abbr || text.id));
    vi.stubGlobal('fetch', vi.fn());
  });

  it('exposes provider identity and returns null while disabled', async () => {
    const provider = await loadProvider();
    expect(provider.name).toBe('dbs-audio');
    fixtures.config.dbsAudioEnabled = false;
    expect(await manifest(provider)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null manifests for HTTP, network, empty, and null indexes', async () => {
    let provider = await loadProvider();
    fetch.mockResolvedValueOnce(response({ ok: false, status: 503 }));
    expect(await manifest(provider)).toBeNull();

    vi.resetModules();
    provider = await loadProvider();
    fetch.mockRejectedValueOnce(new Error('offline'));
    expect(await manifest(provider)).toBeNull();

    vi.resetModules();
    provider = await loadProvider();
    fetch.mockResolvedValueOnce(response({ json: [] }));
    expect(await manifest(provider)).toBeNull();

    vi.resetModules();
    provider = await loadProvider();
    fetch.mockResolvedValueOnce(response({ json: null }));
    expect(await manifest(provider)).toBeNull();
  });

  it('annotates matched texts and creates normalized audio-only entries', async () => {
    fixtures.existingTexts = [
      { id: 'WEB', abbr: 'WEB', hasAudio: false },
      { id: 'SILENT', abbr: 'SIL', hasAudio: false }
    ];
    const index = [
      { id: 'ENG', abbr: 'WEB', tt: 'World English Bible', iso: 'eng', ln: 'English' },
      { id: 'SPA', abbr: 'RVR', tt: '', iso: 'spa', ln: '' },
      { id: 'FRA', abbr: '', tt: 'No abbreviation' }
    ];
    fetch.mockResolvedValue(response({ json: index }));
    const provider = await loadProvider();
    const result = await manifest(provider);
    expect(fixtures.existingTexts[0].hasAudio).toBe(true);
    expect(fixtures.existingTexts[1].hasAudio).toBe(false);
    expect(result).toEqual([{
      type: 'bible', id: 'RVR', name: 'RVR', nameEnglish: 'RVR', title: 'RVR',
      abbr: 'RVR', lang: 'spa', langName: '', langNameEnglish: '',
      hasText: false, hasAudio: true, _dbsAudioId: 'SPA'
    }]);
  });

  it('uses the default URL and caches a successful index across manifest calls', async () => {
    fixtures.config.dbsAudioUrl = '';
    fetch.mockResolvedValue(response({ json: [{ id: 'ENG', abbr: 'WEB' }] }));
    const provider = await loadProvider();
    expect((await manifest(provider))[0]).toMatchObject({ id: 'WEB' });
    expect((await manifest(provider))[0]).toMatchObject({ id: 'WEB' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('https://audio.dbs.org/index.json');
  });

  it('returns null info for unknown entries and failed file listings', async () => {
    const index = [{ id: 'ENG', abbr: 'WEB' }];
    fetch
      .mockResolvedValueOnce(response({ json: index }))
      .mockResolvedValueOnce(response({ ok: false, status: 404 }));
    const provider = await loadProvider();
    expect(await textInfo(provider, 'MISSING')).toBeNull();
    expect(await textInfo(provider, 'WEB')).toBeNull();

    vi.resetModules();
    const rejected = await loadProvider();
    fetch
      .mockResolvedValueOnce(response({ json: index }))
      .mockRejectedValueOnce(new Error('offline'));
    expect(await textInfo(rejected, 'WEB')).toBeNull();
  });

  it('parses valid Old and New Testament file listings into text metadata', async () => {
    const index = [{
      id: 'MIX', abbr: 'MIXED', tt: 'Mixed Bible', iso: 'mix', ln: 'Mixed Language'
    }];
    const listing = [
      '01_Genesis_001.mp3',
      '01_Genesis_002.mp3',
      '40_Matthew_01.mp3',
      '66_Revelation_22.mp3',
      '00_Invalid_01.mp3',
      '67_Invalid_01.mp3',
      'not-a-file',
      ''
    ].join('\n');
    fetch
      .mockResolvedValueOnce(response({ json: index }))
      .mockResolvedValueOnce(response({ text: listing }));
    const provider = await loadProvider();
    const result = await textInfo(provider, 'MIXED');
    expect(fetch.mock.calls[1][0]).toBe('https://audio.test/MIX/index.txt');
    expect(result).toEqual({
      type: 'bible', id: 'MIXED', name: 'Mixed Bible', nameEnglish: 'Mixed Bible',
      title: 'Mixed Bible', abbr: 'MIXED', lang: 'mix',
      langName: 'Mixed Language', langNameEnglish: 'Mixed Language',
      hasText: false, hasAudio: true,
      divisions: ['GN', 'MT', 'RV'],
      divisionNames: ['Genesis', 'Matthew', 'The Revelation to John'],
      sections: ['GN1', 'GN2', 'MT1', 'RV22'],
      _dbsAudioId: 'MIX'
    });
  });

  it('uses metadata fallbacks and the default file-list base URL', async () => {
    fixtures.config.dbsAudioUrl = '';
    const index = [{ id: 'X', abbr: 'X' }];
    fetch
      .mockResolvedValueOnce(response({ json: index }))
      .mockResolvedValueOnce(response({ text: '01_Genesis_01.mp3' }));
    const provider = await loadProvider();
    const result = await textInfo(provider, 'X');
    expect(fetch.mock.calls[1][0]).toBe('https://audio.dbs.org/X/index.txt');
    expect(result).toMatchObject({
      id: 'X', name: 'X', nameEnglish: 'X', title: 'X',
      lang: '', langName: '', langNameEnglish: ''
    });
  });

  it('returns no text section because DBS entries are audio-only', async () => {
    const provider = await loadProvider();
    const callback = vi.fn();
    provider.loadSection('WEB', 'JN3', callback);
    expect(callback).toHaveBeenCalledWith(null);
  });
});

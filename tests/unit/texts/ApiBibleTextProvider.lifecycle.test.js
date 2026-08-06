import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: {},
  processTexts: vi.fn(),
  removeProviderTexts: vi.fn(),
  buildStructureFromBooks: vi.fn(),
  buildAboutHtml: vi.fn(() => '<div>about</div>'),
  renderApiBibleSection: vi.fn(() => '<section>rendered</section>'),
  searchStarter: vi.fn(),
  createApiBibleSearchStarter: vi.fn(() => fixtures.searchStarter)
}));

vi.mock('@core/config.js', () => ({
  getConfig: () => fixtures.config
}));

vi.mock('@texts/TextLoader.js', () => ({
  processTexts: fixtures.processTexts,
  removeProviderTexts: fixtures.removeProviderTexts
}));

vi.mock('@texts/ApiBibleChapterParser.js', () => ({
  parseChapterContent: vi.fn(),
  buildAboutHtml: fixtures.buildAboutHtml,
  buildStructureFromBooks: fixtures.buildStructureFromBooks,
  renderApiBibleSection: fixtures.renderApiBibleSection
}));

vi.mock('@texts/ApiBibleSearch.js', () => ({
  createApiBibleSearchStarter: fixtures.createApiBibleSearchStarter
}));

import { ApiBibleTextProvider } from '@texts/ApiBibleTextProvider.js';

const NIV_API_ID = '78a9f6124f344018-01';
const CSB_API_ID = 'a556c5305ee15c3f-01';
const NLT_API_ID = 'd6e14a625393b4da-01';

function manifest() {
  return new Promise(resolve => ApiBibleTextProvider.getTextManifest(resolve));
}

function textInfo(id) {
  return new Promise(resolve => ApiBibleTextProvider.getTextInfo(id, resolve));
}

function section(textid, sectionid) {
  return new Promise(resolve => {
    ApiBibleTextProvider.loadSection(
      textid,
      sectionid,
      html => resolve({ html }),
      (...error) => resolve({ error })
    );
  });
}

function response({ ok = true, status = 200, json = {} } = {}) {
  return { ok, status, json: vi.fn().mockResolvedValue(json) };
}

describe.sequential('ApiBibleTextProvider lifecycle', () => {
  beforeAll(() => {
    fixtures.processTexts.mockImplementation((texts, provider) => {
      for (const text of texts) text.providerid = `${provider}:${text.id}`;
    });
    fixtures.buildStructureFromBooks.mockImplementation((info, books, convert) => {
      info.divisions = [];
      info.divisionNames = [];
      info.sections = [];
      for (const book of books) {
        const code = convert(book.id);
        if (!code) continue;
        info.divisions.push(code);
        info.divisionNames.push(book.name);
        for (const chapter of book.chapters ?? []) {
          if (/^\d+$/.test(chapter.number)) info.sections.push(`${code}${chapter.number}`);
        }
      }
    });
  });

  beforeEach(() => {
    fixtures.config = {
      enableOnlineSources: true,
      apiBibleEnabled: true,
      apiBibleProxyBase: 'https://proxy.test',
      apiBibleIncludeIds: []
    };
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('exposes provider identity and the injected search starter', () => {
    expect(ApiBibleTextProvider.name).toBe('apibible');
    expect(ApiBibleTextProvider.fullName).toBe('API.Bible');
    expect(ApiBibleTextProvider.startSearch).toBe(fixtures.searchStarter);
  });

  it('returns no manifest while any online-source requirement is disabled', async () => {
    fixtures.config.enableOnlineSources = false;
    expect(await manifest()).toBeNull();
    fixtures.config.enableOnlineSources = true;
    fixtures.config.apiBibleEnabled = false;
    expect(await manifest()).toBeNull();
    fixtures.config.apiBibleEnabled = true;
    fixtures.config.apiBibleProxyBase = '';
    expect(await manifest()).toBeNull();
    expect(fixtures.processTexts).not.toHaveBeenCalled();
  });

  it('builds, processes, filters, and caches the manifest', async () => {
    fixtures.config.apiBibleIncludeIds = [NIV_API_ID, CSB_API_ID, NLT_API_ID];
    const first = await manifest();
    expect(first.map(item => item.id)).toEqual(['NIV', 'CSB', 'NLT']);
    expect(first[0]).toMatchObject({
      providerid: 'apibible:NIV',
      apiId: NIV_API_ID,
      type: 'bible',
      lang: 'eng',
      dir: 'ltr',
      loadingMessage: 'Loading from API.Bible…'
    });
    expect(fixtures.processTexts).toHaveBeenCalledWith(first, 'apibible');
    const second = await manifest();
    expect(second).toBe(first);
    expect(fixtures.processTexts).toHaveBeenCalledTimes(1);
  });

  it('returns null for unknown text IDs and accepts bare short IDs', async () => {
    expect(await textInfo('missing')).toBeNull();
    fetch
      .mockResolvedValueOnce(response({ json: { data: { name: 'NIV details' } } }))
      .mockResolvedValueOnce(response({ json: { data: [
        { id: 'GEN', name: 'Genesis', chapters: [{ number: '1' }, { number: 'intro' }] }
      ] } }));
    const info = await textInfo('NIV');
    expect(info.providerid).toBe('apibible:NIV');
  });

  it('loads Bible details and book structure in parallel, then caches it', async () => {
    // NIV was structured by the previous bare-ID lookup.
    const cached = await textInfo('anything:NIV');
    expect(cached).toMatchObject({
      divisions: ['GN'],
      divisionNames: ['Genesis'],
      sections: ['GN1'],
      aboutHtml: '<div>about</div>'
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses sparse about metadata when the details request is not successful', async () => {
    fetch
      .mockResolvedValueOnce(response({ ok: false, status: 503 }))
      .mockResolvedValueOnce(response({ json: { data: [
        { id: 'JHN', name: 'John', chapters: [{ number: '3' }] }
      ] } }));
    const info = await textInfo('apibible:CSB');
    expect(info.sections).toEqual(['JN3']);
    expect(fixtures.buildAboutHtml).toHaveBeenLastCalledWith(info, undefined);
  });

  it('also tolerates a rejected details request', async () => {
    // Clear CSB structure to exercise the request path again.
    const cached = await textInfo('CSB');
    cached.divisions = [];
    fetch
      .mockRejectedValueOnce(new Error('details offline'))
      .mockResolvedValueOnce(response({ json: { data: [
        { id: 'JHN', name: 'John', chapters: [{ number: '1' }] }
      ] } }));
    const info = await textInfo('CSB');
    expect(info.sections).toEqual(['JN1']);
    expect(fixtures.buildAboutHtml).toHaveBeenLastCalledWith(info, undefined);
  });

  it('returns null when the books request fails', async () => {
    fetch
      .mockResolvedValueOnce(response({ json: { data: {} } }))
      .mockResolvedValueOnce(response({ ok: false, status: 500 }));
    expect(await textInfo('NLT')).toBeNull();
  });

  it('never starts metadata fetches while the provider becomes disabled', async () => {
    fixtures.config.apiBibleEnabled = false;
    expect(await textInfo('NIV')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads and renders a section with previous/next navigation and a division title', async () => {
    fixtures.config.apiBibleEnabled = true;
    fixtures.renderApiBibleSection.mockReturnValueOnce('<section>John 3</section>');
    // CSB currently has JN1; make a richer cached structure.
    const info = await textInfo('CSB');
    info.divisions = ['JN'];
    info.divisionNames = ['John'];
    info.sections = ['JN2', 'JN3', 'JN4'];
    info.dir = 'rtl';
    fetch.mockResolvedValueOnce(response({ json: { data: { content: [{ name: 'para' }] } } }));
    const result = await section('CSB', 'JN3');
    expect(result).toEqual({ html: '<section>John 3</section>' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(
      '/bibles/a556c5305ee15c3f-01/chapters/JHN.3?content-type=json'
    ));
    expect(fixtures.renderApiBibleSection).toHaveBeenCalledWith({
      content: [{ name: 'para' }],
      textid: 'CSB',
      sectionid: 'JN3',
      bookid: 'JN',
      chapter: '3',
      lang: 'eng',
      dir: 'rtl',
      previd: 'JN2',
      nextid: 'JN4',
      bookTitle: 'John'
    });
  });

  it('uses null neighbors, ltr default, and BibleData title outside known divisions', async () => {
    const info = await textInfo('NIV');
    info.sections = ['GN1'];
    info.divisions = ['JN'];
    delete info.dir;
    fetch.mockResolvedValueOnce(response({ json: { data: { content: [] } } }));
    await section('NIV', 'GN1');
    expect(fixtures.renderApiBibleSection).toHaveBeenLastCalledWith(expect.objectContaining({
      previd: null,
      nextid: null,
      dir: 'ltr',
      bookTitle: 'Genesis'
    }));
  });

  it('fails sections for unknown texts, unknown books, and malformed content', async () => {
    expect((await section('missing', 'JN3')).error).toEqual(['missing', 'JN3', undefined]);
    expect((await section('NIV', 'ZZ1')).error).toEqual(['NIV', 'ZZ1', undefined]);
    fetch.mockResolvedValueOnce(response({ json: { data: { content: 'not-an-array' } } }));
    expect((await section('NIV', 'GN1')).error).toEqual(['NIV', 'GN1', undefined]);
  });

  it('fails sections on network and HTTP errors and tolerates no error callback', async () => {
    fetch.mockRejectedValueOnce(new Error('offline'));
    expect((await section('NIV', 'GN1')).error).toEqual(['NIV', 'GN1', undefined]);
    fetch.mockResolvedValueOnce(response({ ok: false, status: 500 }));
    expect((await section('NIV', 'GN1')).error).toEqual(['NIV', 'GN1', undefined]);
    expect(() => ApiBibleTextProvider.loadSection('missing', 'JN3', vi.fn())).not.toThrow();
  });

  it('trips quota once, removes provider texts, dispatches notice, and disables retries', async () => {
    const disabled = vi.fn();
    document.addEventListener('texts:provider-disabled', disabled, { once: true });
    const modal = {
      body: document.createElement('div'),
      show: vi.fn()
    };
    window.MovableWindow = vi.fn(function MovableWindow() { return modal; });
    fetch.mockResolvedValueOnce(response({ ok: false, status: 429 }));
    const result = await section('NIV', 'GN1');
    expect(result.error).toEqual([
      'NIV',
      'GN1',
      { message: 'The API.Bible limit has been reached. NIV, CSB, and NLT are unavailable until next month.' }
    ]);
    expect(fixtures.removeProviderTexts).toHaveBeenCalledWith('apibible');
    expect(disabled).toHaveBeenCalled();
    expect(window.MovableWindow).toHaveBeenCalledWith(420, 190, 'API.Bible');
    expect(modal.body.textContent).toContain('limit has been reached');
    expect(modal.show).toHaveBeenCalled();

    expect(await manifest()).toBeNull();
    expect(await textInfo('NIV')).toBeNull();
    expect(fixtures.removeProviderTexts).toHaveBeenCalledTimes(1);
    delete window.MovableWindow;
  });
});

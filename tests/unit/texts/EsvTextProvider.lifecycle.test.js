import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: {},
  processTexts: vi.fn(),
  renderEsvSection: vi.fn(() => '<section>rendered</section>'),
  searchStarter: vi.fn(),
  createEsvSearchStarter: vi.fn(() => fixtures.searchStarter)
}));

vi.mock('@core/config.js', () => ({
  getConfig: () => fixtures.config
}));

vi.mock('@texts/TextLoader.js', () => ({
  processTexts: fixtures.processTexts
}));

vi.mock('@texts/EsvPassageParser.js', () => ({
  parseEsvPassageHtml: vi.fn(),
  renderEsvSection: fixtures.renderEsvSection
}));

vi.mock('@texts/EsvSearch.js', () => ({
  createEsvSearchStarter: fixtures.createEsvSearchStarter
}));

import { EsvTextProvider } from '@texts/EsvTextProvider.js';

function manifest() {
  return new Promise(resolve => EsvTextProvider.getTextManifest(resolve));
}

function textInfo(textid) {
  return new Promise(resolve => EsvTextProvider.getTextInfo(textid, resolve));
}

function section(textid, sectionid, includeError = true) {
  return new Promise(resolve => {
    EsvTextProvider.loadSection(
      textid,
      sectionid,
      html => resolve({ html }),
      includeError ? (...error) => resolve({ error }) : undefined
    );
    if (!includeError) setTimeout(() => resolve({ noErrorCallback: true }), 0);
  });
}

function response({ ok = true, status = 200, json = {} } = {}) {
  return { ok, status, json: vi.fn().mockResolvedValue(json) };
}

describe.sequential('EsvTextProvider lifecycle', () => {
  beforeAll(() => {
    fixtures.processTexts.mockImplementation((texts, provider) => {
      for (const text of texts) text.providerid = `${provider}:${text.id}`;
    });
  });

  beforeEach(() => {
    fixtures.config = {
      enableOnlineSources: true,
      esvEnabled: true,
      esvProxyBase: 'https://proxy.test'
    };
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    fixtures.renderEsvSection.mockReturnValue('<section>rendered</section>');
  });

  it('exposes provider identity and the injected search starter', () => {
    expect(EsvTextProvider).toMatchObject({
      name: 'esv', fullName: 'ESV API', startSearch: fixtures.searchStarter
    });
  });

  it('returns no manifest while each online requirement is disabled', async () => {
    fixtures.config.enableOnlineSources = false;
    expect(await manifest()).toBeNull();
    fixtures.config.enableOnlineSources = true;
    fixtures.config.esvEnabled = false;
    expect(await manifest()).toBeNull();
    fixtures.config.esvEnabled = true;
    fixtures.config.esvProxyBase = '';
    expect(await manifest()).toBeNull();
    expect(fixtures.processTexts).not.toHaveBeenCalled();
  });

  it('cold-loads text info, creates static Bible structure, and caches the manifest', async () => {
    const info = await textInfo('ESV');
    expect(info).toMatchObject({
      id: 'ESV', providerid: 'esv:ESV', type: 'bible', abbr: 'ESV',
      lang: 'eng', langName: 'English', dir: 'ltr',
      loadingMessage: 'Loading from the ESV API…'
    });
    expect(info.divisions[0]).toBe('GN');
    expect(info.divisionNames[0]).toBe('Genesis');
    expect(info.divisionNames[info.divisions.indexOf('PS')]).toBe('Psalms');
    expect(info.divisionNames[info.divisions.indexOf('SS')]).toBe('Song of Solomon');
    expect(info.sections[0]).toBe('GN1');
    expect(info.sections.at(-1)).toBe('RV22');
    expect(info.aboutHtml).toContain('English Standard Version');
    expect(info.aboutHtml).toContain('api.esv.org');
    expect(fixtures.processTexts).toHaveBeenCalledWith([info], 'esv');

    const cached = await manifest();
    expect(cached).toEqual([info]);
    expect(fixtures.processTexts).toHaveBeenCalledTimes(1);
    expect(await textInfo('provider:ESV')).toBe(info);
    expect(await textInfo('missing')).toBeNull();
  });

  it('returns null text info while the provider is disabled', async () => {
    fixtures.config.esvEnabled = false;
    expect(await textInfo('ESV')).toBeNull();
  });

  it('loads and renders a section with encoded query and neighboring chapters', async () => {
    const info = await textInfo('ESV');
    info.dir = 'rtl';
    fixtures.renderEsvSection.mockReturnValueOnce('<section>Genesis 2</section>');
    fetch.mockResolvedValueOnce(response({ json: { passages: ['<p>Passage</p>'] } }));

    const result = await section('ESV', 'GN2');

    expect(result).toEqual({ html: '<section>Genesis 2</section>' });
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(
      /^https:\/\/proxy\.test\/passage\/html\/\?q=Genesis%202&include-passage-references=false/
    ));
    expect(fixtures.renderEsvSection).toHaveBeenCalledWith(expect.objectContaining({
      passage: '<p>Passage</p>', textid: 'ESV', sectionid: 'GN2',
      bookid: 'GN', chapter: '2', lang: 'eng', dir: 'rtl',
      previd: 'GN1', nextid: 'GN3', bookTitle: 'Genesis'
    }));
  });

  it('uses special ESV book names, null boundaries, and the ltr default', async () => {
    const info = await textInfo('ESV');
    delete info.dir;
    fetch
      .mockResolvedValueOnce(response({ json: { passages: ['psalm'] } }))
      .mockResolvedValueOnce(response({ json: { passages: ['song'] } }))
      .mockResolvedValueOnce(response({ json: { passages: ['genesis'] } }))
      .mockResolvedValueOnce(response({ json: { passages: ['revelation'] } }));
    await section('ESV', 'PS1');
    await section('ESV', 'SS1');
    await section('ESV', 'GN1');
    await section('ESV', 'RV22');
    expect(fetch.mock.calls[0][0]).toContain('q=Psalms%201');
    expect(fetch.mock.calls[1][0]).toContain('q=Song%20of%20Solomon%201');
    expect(fixtures.renderEsvSection).toHaveBeenNthCalledWith(3, expect.objectContaining({
      dir: 'ltr', previd: null, nextid: 'GN2'
    }));
    expect(fixtures.renderEsvSection).toHaveBeenNthCalledWith(4, expect.objectContaining({
      previd: 'RV21', nextid: null
    }));
  });

  it('rejects unknown texts, books, and sections without fetching', async () => {
    expect((await section('missing', 'GN1')).error).toEqual(['missing', 'GN1']);
    expect((await section('ESV', 'ZZ1')).error).toEqual(['ESV', 'ZZ1']);
    expect((await section('ESV', 'GN999')).error).toEqual(['ESV', 'GN999']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects missing or empty passages', async () => {
    fetch
      .mockResolvedValueOnce(response({ json: {} }))
      .mockResolvedValueOnce(response({ json: { passages: [] } }))
      .mockResolvedValueOnce(response({ json: { passages: [''] } }))
      .mockResolvedValueOnce(response({ json: { passages: [42] } }));
    for (const sectionid of ['GN1', 'GN2', 'GN3', 'GN4']) {
      expect((await section('ESV', sectionid)).error).toEqual(['ESV', sectionid]);
    }
    expect(fixtures.renderEsvSection).not.toHaveBeenCalled();
  });

  it('maps rate limiting to a reader-facing error and handles other request failures', async () => {
    fetch
      .mockResolvedValueOnce(response({ ok: false, status: 429 }))
      .mockResolvedValueOnce(response({ ok: false, status: 503 }))
      .mockRejectedValueOnce(new Error('offline'));
    expect((await section('ESV', 'GN1')).error).toEqual([
      'ESV', 'GN1',
      { message: 'The ESV API request limit has been reached. Please try again later.' }
    ]);
    expect((await section('ESV', 'GN2')).error).toEqual(['ESV', 'GN2', undefined]);
    expect((await section('ESV', 'GN3')).error).toEqual(['ESV', 'GN3', undefined]);
  });

  it('tolerates a missing error callback', async () => {
    const result = await section('missing', 'GN1', false);
    expect(result).toEqual({ noErrorCallback: true });
  });
});

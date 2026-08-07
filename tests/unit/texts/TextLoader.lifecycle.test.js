import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  addNames: vi.fn(),
  processTexts: vi.fn((data, providerName) => data.forEach(info => { info.providerName = providerName; })),
  processText: vi.fn((data, providerName) => { data.providerName = providerName; data.id = data.id.split(':').at(-1); }),
  resolveSectionId: vi.fn((_info, id) => id),
  htmlToNode: vi.fn(html => ({ html }))
}));

vi.mock('@bible/BibleData.js', () => ({ addNames: fixtures.addNames }));
vi.mock('@texts/TextInfoUtils.js', () => ({
  getTextid: value => value.split(':').at(-1),
  getTextIdentity: info => info?.providerid ?? info?.id ?? '',
  displayAbbr: vi.fn(),
  processTexts: fixtures.processTexts,
  processText: fixtures.processText,
  resolveSectionId: fixtures.resolveSectionId,
  htmlToNode: fixtures.htmlToNode
}));

async function moduleUnderTest() {
  vi.resetModules();
  return import('@texts/TextLoader.js');
}

describe('TextLoader lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window.BrowserBible;
  });

  it('reports unregistered providers and invalid section ids instead of hanging', async () => {
    const loader = await moduleUnderTest();
    const success = vi.fn();
    const error = vi.fn();
    loader.loadSection({ id: 'WEB', providerName: 'missing' }, 'GN1', success, error);
    expect(success).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('WEB', 'GN1', expect.objectContaining({
      message: expect.stringContaining('missing')
    }));
    loader.loadSection({ id: 'WEB' }, null, success, error);
    loader.loadSection({ id: 'WEB' }, 'null', success, error);
    expect(error).toHaveBeenCalledTimes(3);
  });

  it('keeps two providers exposing the same id apart', async () => {
    const loader = await moduleUnderTest();
    const one = {
      getTextInfo: vi.fn((id, callback) => callback({ id, name: 'From one' })),
      loadSection: vi.fn((_id, _section, callback) => callback('<section>one</section>'))
    };
    const two = {
      getTextInfo: vi.fn((id, callback) => callback({ id, name: 'From two' })),
      loadSection: vi.fn((_id, _section, callback) => callback('<section>two</section>'))
    };
    loader.registerTextProvider('one', one);
    loader.registerTextProvider('two', two);

    const first = vi.fn();
    const second = vi.fn();
    loader.getText('one:ESV', first);
    loader.getText('two:ESV', second);
    expect(first).toHaveBeenCalledWith(expect.objectContaining({ name: 'From one' }));
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ name: 'From two' }));

    const firstSection = vi.fn();
    const secondSection = vi.fn();
    loader.loadSection({ id: 'ESV', providerName: 'one' }, 'GN1', firstSection);
    loader.loadSection({ id: 'ESV', providerName: 'two' }, 'GN1', secondSection);
    expect(firstSection).toHaveBeenCalledWith({ html: '<section>one</section>' });
    expect(secondSection).toHaveBeenCalledWith({ html: '<section>two</section>' });
  });

  it('completes a search request for a provider that cannot search', async () => {
    const loader = await moduleUnderTest();
    loader.registerTextProvider('commentary', { getTextInfo: vi.fn(), loadSection: vi.fn() });

    const onSearchComplete = vi.fn();
    loader.startSearch({ textid: 'commentary:MHC', divisions: [], text: 'love', onSearchComplete });
    expect(onSearchComplete).toHaveBeenCalledWith(expect.objectContaining({
      type: 'complete',
      data: expect.objectContaining({ results: null })
    }));
  });

  it('merges the manifest entry under the provider detail response', async () => {
    const loader = await moduleUnderTest();
    loader.registerTextProvider('remote', {
      getTextManifest: vi.fn(callback => callback([
        { id: 'WEB', langName: 'English', hasAudio: true, name: 'Manifest name' }
      ])),
      getTextInfo: vi.fn((id, callback) => callback({ id, name: 'Detail name', sections: ['GN1'] }))
    });
    loader.loadTexts(vi.fn());

    const callback = vi.fn();
    loader.getText('remote:WEB', callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Detail name',
      langName: 'English',
      hasAudio: true,
      sections: ['GN1']
    }));
  });

  it('shares concurrent provider loads, populates cache, and records analytics', async () => {
    const loader = await moduleUnderTest();
    let success;
    const provider = { loadSection: vi.fn((_id, _section, callback) => { success = callback; }) };
    loader.registerTextProvider('remote', provider);
    window.BrowserBible = { analytics: { record: vi.fn() } };
    const one = vi.fn();
    const two = vi.fn();
    const info = { id: 'WEB', providerName: 'remote' };
    loader.loadSection(info, 'GN1', one);
    loader.loadSection(info, 'GN1', two);
    expect(provider.loadSection).toHaveBeenCalledOnce();
    success('<section>one</section>');
    expect(one).toHaveBeenCalledWith({ html: '<section>one</section>' });
    expect(two).toHaveBeenCalledWith({ html: '<section>one</section>' });
    const cached = vi.fn();
    loader.loadSection(info, 'GN1', cached);
    expect(cached).toHaveBeenCalled();
    expect(window.BrowserBible.analytics.record).toHaveBeenCalledWith('load', 'WEB', 'GN1');
  });

  it('fans provider errors out to every waiter and permits retry', async () => {
    const loader = await moduleUnderTest();
    let reject;
    const provider = { loadSection: vi.fn((_id, _section, _success, error) => { reject = error; }) };
    loader.registerTextProvider('remote', provider);
    const first = vi.fn();
    const second = vi.fn();
    const info = { id: 'WEB', providerName: 'remote' };
    loader.loadSection(info, 'GN1', vi.fn(), first);
    loader.loadSection(info, 'GN1', vi.fn(), second);
    reject('WEB', 'GN1', { message: 'failed' });
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
    loader.loadSection(info, 'GN1', vi.fn(), vi.fn());
    expect(provider.loadSection).toHaveBeenCalledTimes(2);
  });

  it('settles every waiter and permits retry when a provider throws synchronously', async () => {
    const loader = await moduleUnderTest();
    const provider = { loadSection: vi.fn(() => { throw new Error('provider exploded'); }) };
    loader.registerTextProvider('remote', provider);
    const first = vi.fn();
    const second = vi.fn();
    const info = { id: 'WEB', providerName: 'remote' };

    loader.loadSection(info, 'GN1', vi.fn(), first);
    loader.loadSection(info, 'GN1', vi.fn(), second);

    expect(first).toHaveBeenCalledWith('WEB', 'GN1', expect.objectContaining({
      message: 'provider exploded', error: expect.any(Error)
    }));
    expect(second).toHaveBeenCalledWith('WEB', 'GN1', expect.objectContaining({
      message: 'provider exploded', error: expect.any(Error)
    }));
    expect(provider.loadSection).toHaveBeenCalledTimes(2);
  });

  it('reports a synchronous text-info exception and can retry', async () => {
    const loader = await moduleUnderTest();
    const provider = { getTextInfo: vi.fn(() => { throw new Error('bad metadata'); }) };
    loader.registerTextProvider('remote', provider);
    const first = vi.fn();
    const second = vi.fn();

    loader.getText('remote:WEB', vi.fn(), first);
    loader.getText('remote:WEB', vi.fn(), second);

    expect(first).toHaveBeenCalledWith(expect.objectContaining({ message: 'bad metadata' }));
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ message: 'bad metadata' }));
    expect(provider.getTextInfo).toHaveBeenCalledTimes(2);
  });

  it('loads string text ids and returns null metadata without an error callback', async () => {
    const loader = await moduleUnderTest();
    const provider = {
      getTextInfo: vi.fn((_id, callback) => callback(null)),
      loadSection: vi.fn()
    };
    loader.registerTextProvider('local', provider);
    const callback = vi.fn();
    loader.getText('MISSING', callback);
    expect(callback).toHaveBeenCalledWith(null);
    loader.loadSection('MISSING', 'GN1', vi.fn(), vi.fn());
  });

  it('resolves provider ids from a loaded manifest and removes provider texts', async () => {
    const loader = await moduleUnderTest();
    const provider = {
      getTextManifest: vi.fn(callback => callback([
        { id: 'WEB', providerid: 'remote:WEB' }, { id: 'OTHER' }
      ]))
    };
    loader.registerTextProvider('remote', provider);
    const callback = vi.fn();
    loader.loadTexts(callback);
    expect(callback).toHaveBeenCalled();
    expect(loader.getProviderId('WEB')).toBe('remote:WEB');
    expect(loader.getProviderId('remote:WEB')).toBe('remote:WEB');
    expect(loader.getProviderId('UNKNOWN')).toBe('UNKNOWN');
    loader.removeProviderTexts('remote');
    expect(loader.getTextInfoData()).toEqual([]);
  });
});

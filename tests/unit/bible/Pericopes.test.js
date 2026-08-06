import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Pericopes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('maps catalog and BCP-47 language codes to every translated dataset', async () => {
    const { pericopeLocaleFor } = await import('@bible/Pericopes.js');
    expect(pericopeLocaleFor('eng-Latn-US')).toBe('en');
    expect(pericopeLocaleFor('spa')).toBe('es');
    expect(pericopeLocaleFor('fra')).toBe('fr');
    expect(pericopeLocaleFor('arb')).toBe('ar');
    expect(pericopeLocaleFor('ben')).toBe('bn');
    expect(pericopeLocaleFor('por')).toBe('pt');
    expect(pericopeLocaleFor('rus')).toBe('ru');
    expect(pericopeLocaleFor('urd')).toBe('ur');
    expect(pericopeLocaleFor('ind')).toBe('id');
    expect(pericopeLocaleFor('deu')).toBe('de');
    expect(pericopeLocaleFor('jpn')).toBe('ja');
    expect(pericopeLocaleFor('kor')).toBe('ko');
    expect(pericopeLocaleFor('hin')).toBe('hi');
    expect(pericopeLocaleFor('cmn-Hans')).toBe('zh-CN');
    expect(pericopeLocaleFor('swh')).toBeNull();
    expect(pericopeLocaleFor()).toBeNull();
  });

  it('fetches, parses, canonically groups, and caches external JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        'JN3.16': 'God Loved the World',
        'GN1.1': 'Creation',
        'unknown': 'Ignored'
      })
    });
    vi.stubGlobal('fetch', fetchMock);
    const { loadPericopesByBook } = await import('@bible/Pericopes.js');

    const groups = await loadPericopesByBook('eng');
    expect(fetchMock).toHaveBeenCalledWith('./content/pericopes/en.json');
    expect(groups.map(group => group.bookid)).toEqual(['GN', 'JN']);
    expect(groups[1].pericopes[0]).toEqual({
      bookid: 'JN', sectionid: 'JN3', fragmentid: 'JN3_16',
      chapter: 3, verse: 16, title: 'God Loved the World'
    });

    await loadPericopesByBook('en-US');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not fetch unsupported languages and recovers from a failed request', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    const { loadPericopesByBook } = await import('@bible/Pericopes.js');

    await expect(loadPericopesByBook('swh')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(loadPericopesByBook('spa')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith('./content/pericopes/es.json');
    expect(warning).toHaveBeenCalledOnce();
  });
});

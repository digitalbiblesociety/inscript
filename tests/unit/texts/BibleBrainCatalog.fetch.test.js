import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchAllBibles } from '../../../browserbible/js/texts/BibleBrainCatalog.js';

const jsonResponse = (body, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body
});

const BASE = 'https://proxy.test/fcbh/v4';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAllBibles', () => {
  it('uses the single-request cached catalog when the proxy has it', async () => {
    const data = [{ abbr: 'ENGESV' }, { abbr: 'DEU199' }];
    const fetchMock = vi.fn(async () => jsonResponse({ data, meta: { total: 2 } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAllBibles(BASE)).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/bibles-all`);
  });

  it('falls back to the paginated list when bibles-all is unavailable', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith('/bibles-all')) return jsonResponse({ error: 'catalog not ready' }, false, 503);
      const page = Number(new URL(url).searchParams.get('page'));
      return jsonResponse({
        data: [{ abbr: `PAGE${page}` }],
        meta: { pagination: { last_page: 2 } }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAllBibles(BASE)).resolves.toEqual([{ abbr: 'PAGE1' }, { abbr: 'PAGE2' }]);
  });

  it('falls back when the cached catalog is empty or the request throws', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith('/bibles-all')) return jsonResponse({ data: [] });
      return jsonResponse({ data: [{ abbr: 'A' }], meta: { pagination: { last_page: 1 } } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchAllBibles(BASE)).resolves.toEqual([{ abbr: 'A' }]);

    const throwingMock = vi.fn(async (url) => {
      if (url.endsWith('/bibles-all')) throw new Error('network down');
      return jsonResponse({ data: [{ abbr: 'B' }], meta: { pagination: { last_page: 1 } } });
    });
    vi.stubGlobal('fetch', throwingMock);
    await expect(fetchAllBibles(BASE)).resolves.toEqual([{ abbr: 'B' }]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: { baseContentUrl: 'https://remote/' },
  dbsEnabled: true
}));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));
vi.mock('@/media/DbsVideoApi.js', () => ({ isDbsVideoEnabled: () => fixtures.dbsEnabled }));
vi.mock('@/media/audioProviders.js', () => ({}));

async function freshLibrary() {
  vi.resetModules();
  await import('@/media/index.js');
  return window.MediaLibrary;
}

function response(body, ok = true, status = 200) {
  return { ok, status, json: vi.fn().mockResolvedValue(body) };
}

function libraries(api, callbacks = 1) {
  const calls = Array.from({ length: callbacks }, () => vi.fn());
  calls.forEach(callback => api.getMediaLibraries(callback));
  return calls;
}

describe('media index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.config = { baseContentUrl: 'https://remote/' };
    fixtures.dbsEnabled = true;
    vi.stubGlobal('fetch', vi.fn());
  });

  it('loads local configuration, all info URL variants, and caches the result', async () => {
    fetch.mockImplementation(async url => {
      if (url === 'content/media/media.json') return response({ media: [
        { folder: 'explicit', type: 'image', infoUrl: 'https://info.test/one' },
        { folder: 'local', type: 'image', baseUrl: true },
        { folder: 'remote', type: 'video' }
      ] });
      return response({ [url]: true });
    });
    const api = await freshLibrary();
    const [one, two] = libraries(api, 2);
    await vi.waitFor(() => expect(one).toHaveBeenCalled());
    expect(two).toHaveBeenCalled();
    expect(one.mock.calls[0][0]).toHaveLength(3);
    expect(fetch).toHaveBeenCalledWith('https://info.test/one');
    expect(fetch).toHaveBeenCalledWith('content/media/local/info.json');
    expect(fetch).toHaveBeenCalledWith('https://remote/content/media/remote/info.json');
    const cached = vi.fn();
    api.getMediaLibraries(cached);
    expect(cached).toHaveBeenCalledWith(one.mock.calls[0][0]);
  });

  it('falls back to remote configuration and filters disabled DBS video', async () => {
    fixtures.dbsEnabled = false;
    fetch.mockImplementation(async url => {
      if (url === 'content/media/media.json') return response({}, false, 404);
      if (url === 'https://remote/content/media/media.json') return response({ media: [
        { folder: 'dbs', type: 'dbsvideo' }, { folder: 'image', type: 'image' }
      ] });
      return response({ ok: true });
    });
    const api = await freshLibrary();
    const [callback] = libraries(api);
    await vi.waitFor(() => expect(callback).toHaveBeenCalled());
    expect(callback.mock.calls[0][0].map(item => item.folder)).toEqual(['image']);
  });

  it('returns an empty list when every library info request fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockImplementation(async url => url.endsWith('media.json')
      ? response({ media: [{ folder: 'bad', type: 'image' }] })
      : response({}, false, 503));
    const api = await freshLibrary();
    const [callback] = libraries(api);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith([]));
    expect(warn).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('reports configuration failures to every pending callback and retries later', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockResolvedValue(response({}, false, 500));
    const api = await freshLibrary();
    const [one, two] = libraries(api, 2);
    await vi.waitFor(() => expect(one).toHaveBeenCalledWith([]));
    expect(two).toHaveBeenCalledWith([]);
    expect(error).toHaveBeenCalled();

    fetch.mockImplementation(async url => url.endsWith('media.json')
      ? response({ media: [] }) : response({}));
    const retry = vi.fn();
    api.getMediaLibraries(retry);
    await vi.waitFor(() => expect(retry).toHaveBeenCalledWith([]));
  });

  it('handles network errors from individual info files', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockImplementation(async url => {
      if (url === 'content/media/media.json') return response({ media: [{ folder: 'offline' }] });
      throw new Error('offline');
    });
    const api = await freshLibrary();
    const [callback] = libraries(api);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith([]));
    expect(warn).toHaveBeenCalledWith('Error loading offline/info.json:', expect.any(Error));
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({ config: {} }));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));

import { LocalAudioProvider } from '@/media/LocalAudioProvider.js';

describe('LocalAudioProvider', () => {
  beforeEach(() => {
    fixtures.config = { localAudioEnabled: true, baseContentUrl: '/base/' };
    vi.stubGlobal('fetch', vi.fn());
  });

  it('reports its provider name and skips disabled or explicitly empty audio', async () => {
    const provider = new LocalAudioProvider();
    expect(provider.name).toBe('local');
    fixtures.config.localAudioEnabled = false;
    expect(await provider.getAudioInfo({ id: 'WEB' })).toBeNull();
    fixtures.config.localAudioEnabled = true;
    expect(await provider.getAudioInfo({ id: 'WEB', audioDirectory: '' })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads a manifest from the explicit directory and preserves its title', async () => {
    const manifest = { title: 'Narrated', fragments: [] };
    fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(manifest) });
    const provider = new LocalAudioProvider();
    expect(await provider.getAudioInfo({ id: 'WEB', audioDirectory: 'spoken-web' })).toEqual({
      title: 'Narrated', fragments: [], type: 'local', directory: 'spoken-web'
    });
    expect(fetch).toHaveBeenCalledWith('/base/content/audio/spoken-web/info.json');
  });

  it('uses the text id and supplies a default title', async () => {
    fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ fragments: [] }) });
    const provider = new LocalAudioProvider();
    expect(await provider.getAudioInfo({ id: 'WEB' })).toMatchObject({
      title: 'Local', type: 'local', directory: 'WEB'
    });
  });

  it('returns null for HTTP, empty, and network failures', async () => {
    const provider = new LocalAudioProvider();
    fetch
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(undefined) })
      .mockRejectedValueOnce(new Error('offline'));
    expect(await provider.getAudioInfo({ id: 'ONE' })).toBeNull();
    expect(await provider.getAudioInfo({ id: 'TWO' })).toBeNull();
    expect(await provider.getAudioInfo({ id: 'THREE' })).toBeNull();
  });

  it('finds inclusive fragment ranges and rejects other books or verses', () => {
    const provider = new LocalAudioProvider();
    const info = { fragments: [
      { start: 'GN1_1', end: 'GN1_3', filename: 'one', exts: ['mp3'] },
      { start: 'GN1_4', end: 'GN1_6', filename: 'two', exts: 'ogg' }
    ] };
    expect(provider._findFragmentData(info, 'GN1_1')).toMatchObject({ index: 0, filename: 'one' });
    expect(provider._findFragmentData(info, 'GN1_6')).toMatchObject({ index: 1, filename: 'two' });
    expect(provider._findFragmentData(info, 'EX1_2')).toBeNull();
    expect(provider._findFragmentData(info, 'GN1_9')).toBeNull();
  });

  it('builds audio URLs for array and scalar extensions', async () => {
    const provider = new LocalAudioProvider();
    const info = { directory: 'WEB', fragments: [
      { start: 'GN1_1', end: 'GN1_3', filename: 'one', exts: ['mp3', 'ogg'] },
      { start: 'GN1_4', end: 'GN1_6', filename: 'two', exts: 'aac' }
    ] };
    expect(await provider.getFragmentAudio({}, info, 'GN1_2')).toEqual({
      url: '/base/content/audio/WEB/one.mp3', id: 0, start: 'GN1_1', end: 'GN1_3'
    });
    expect((await provider.getFragmentAudio({}, info, 'GN1_5')).url).toBe(
      '/base/content/audio/WEB/two.aac'
    );
    expect(await provider.getFragmentAudio({}, info, 'EX1_1')).toBeNull();
  });

  it('navigates between fragments and stops at either edge', async () => {
    const provider = new LocalAudioProvider();
    const info = { fragments: [
      { start: 'GN1_1', end: 'GN1_3' },
      { start: 'GN1_4', end: 'GN1_6' }
    ] };
    expect(await provider.getNextFragment({}, info, 'GN1_2')).toBe('GN1_4');
    expect(await provider.getNextFragment({}, info, 'GN1_5')).toBeNull();
    expect(await provider.getNextFragment({}, info, 'EX1_1')).toBeNull();
    expect(await provider.getPrevFragment({}, info, 'GN1_5')).toBe('GN1_1');
    expect(await provider.getPrevFragment({}, info, 'GN1_2')).toBeNull();
    expect(await provider.getPrevFragment({}, info, 'EX1_1')).toBeNull();
  });
});

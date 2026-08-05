import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAudioSources } = vi.hoisted(() => ({
  getAudioSources: vi.fn()
}));

vi.mock('@/core/registry.js', () => ({ getAudioSources }));

import { AudioDataManager } from '@/media/AudioDataManager.js';

const callbackResult = (invoke) => new Promise((resolve) => invoke(resolve));

describe('AudioDataManager', () => {
  beforeEach(() => {
    getAudioSources.mockReset();
  });

  it('reports no audio when no providers are registered', async () => {
    getAudioSources.mockReturnValue([]);
    const manager = AudioDataManager();
    await expect(callbackResult(cb => manager.getAudioInfo({ id: 'WEB' }, cb))).resolves.toBeNull();
  });

  it('tries providers in order, skips misses and errors, and records the winner', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const miss = { name: 'miss', getAudioInfo: vi.fn().mockResolvedValue(null) };
    const broken = { name: 'broken', getAudioInfo: vi.fn().mockRejectedValue(new Error('offline')) };
    const found = { name: 'found', getAudioInfo: vi.fn().mockResolvedValue({ title: 'Audio' }) };
    getAudioSources.mockReturnValue([miss, broken, found]);

    const result = await callbackResult(cb => AudioDataManager().getAudioInfo({ id: 'WEB' }, cb));

    expect(result).toEqual({ title: 'Audio', audioSourceIndex: 2 });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('provider broken threw'),
      expect.any(Error)
    );
    warn.mockRestore();
  });

  it('returns null after every provider misses', async () => {
    getAudioSources.mockReturnValue([
      { getAudioInfo: vi.fn().mockResolvedValue(null) },
      { getAudioInfo: vi.fn().mockResolvedValue(null) }
    ]);
    await expect(callbackResult(cb => AudioDataManager().getAudioInfo({}, cb))).resolves.toBeNull();
  });

  it.each([
    ['getFragmentAudio', ['text', 'info', 'JN1_1', 'drama'], { url: 'audio.mp3' }],
    ['getNextFragment', ['text', 'info', 'JN1_1'], 'JN2_1'],
    ['getPrevFragment', ['text', 'info', 'JN2_1'], 'JN1_1']
  ])('delegates %s to the selected provider', async (method, args, expected) => {
    const provider = { [method]: vi.fn().mockResolvedValue(expected) };
    getAudioSources.mockReturnValue([provider]);
    const manager = AudioDataManager();
    const audioInfo = { audioSourceIndex: 0 };
    const callArgs = args.map(value => value === 'info' ? audioInfo : value);

    await expect(callbackResult(cb => manager[method](...callArgs, cb))).resolves.toEqual(expected);
    expect(provider[method]).toHaveBeenCalled();
  });

  it.each(['getFragmentAudio', 'getNextFragment', 'getPrevFragment'])('%s returns null without a provider index', async (method) => {
    getAudioSources.mockReturnValue([]);
    const args = method === 'getFragmentAudio'
      ? [{}, {}, 'JN1_1', 'audio']
      : [{}, {}, 'JN1_1'];
    await expect(callbackResult(cb => AudioDataManager()[method](...args, cb))).resolves.toBeNull();
  });

  it.each(['getFragmentAudio', 'getNextFragment', 'getPrevFragment'])('%s absorbs provider errors', async (method) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getAudioSources.mockReturnValue([{ [method]: vi.fn().mockRejectedValue(new Error('failed')) }]);
    const audioInfo = { audioSourceIndex: 0 };
    const args = method === 'getFragmentAudio'
      ? [{}, audioInfo, 'JN1_1', 'audio']
      : [{}, audioInfo, 'JN1_1'];

    await expect(callbackResult(cb => AudioDataManager()[method](...args, cb))).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

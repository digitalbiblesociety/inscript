import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: { bibleBrainProxyBase: 'https://proxy.test' },
  enabled: true,
  selectAudioFileset: vi.fn(),
  parseTimestamps: vi.fn(data => data),
  biblebrainAudioInfo: vi.fn(),
  linkedAudioFor: vi.fn(),
  loadAudioAssociations: vi.fn(() => Promise.resolve())
}));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));
vi.mock('@/media/BibleBrainFilesets.js', () => ({
  isBibleBrainAudioEnabled: () => fixtures.enabled,
  selectAudioFileset: fixtures.selectAudioFileset,
  parseTimestamps: fixtures.parseTimestamps,
  biblebrainAudioInfo: fixtures.biblebrainAudioInfo,
  filesetCoversTestament: vi.fn()
}));
vi.mock('@/data/biblebrainDuplicates.js', () => ({
  linkedAudioFor: fixtures.linkedAudioFor,
  loadAudioAssociations: fixtures.loadAudioAssociations
}));

import {
  BibleBrainAudioProvider,
  LinkedBibleBrainAudioProvider
} from '@/media/BibleBrainAudioProvider.js';

function response({ ok = true, data = [] } = {}) {
  return { ok, json: vi.fn().mockResolvedValue({ data }) };
}

describe('BibleBrain audio provider lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.enabled = true;
    fixtures.config = { bibleBrainProxyBase: 'https://proxy.test' };
    fixtures.selectAudioFileset.mockReturnValue({ id: 'AUDIO', size: 'C' });
    fixtures.biblebrainAudioInfo.mockReturnValue({ audioFilesets: [] });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('reports names and returns provider metadata only while enabled', async () => {
    const provider = new BibleBrainAudioProvider();
    expect(provider.name).toBe('biblebrain');
    const textInfo = { biblebrain: { audioFilesets: [1] } };
    expect(await provider.getAudioInfo(textInfo)).toEqual({ audioFilesets: [] });
    expect(fixtures.biblebrainAudioInfo).toHaveBeenCalledWith(textInfo, [1]);
    fixtures.enabled = false;
    expect(await provider.getAudioInfo(textInfo)).toBeNull();
  });

  it('rejects disabled, unknown-book, missing-fileset, and missing-path audio', async () => {
    const provider = new BibleBrainAudioProvider();
    fixtures.enabled = false;
    expect(await provider.getFragmentAudio({}, {}, 'GN1_1', 'audio')).toBeNull();
    fixtures.enabled = true;
    expect(await provider.getFragmentAudio({}, { audioFilesets: [] }, 'ZZ1_1', 'audio')).toBeNull();
    fixtures.selectAudioFileset.mockReturnValueOnce(null);
    expect(await provider.getFragmentAudio({}, { audioFilesets: [] }, 'GN1_1', 'audio')).toBeNull();
    provider._fetchChapterPath = vi.fn().mockResolvedValue(null);
    expect(await provider.getFragmentAudio({}, { audioFilesets: [] }, 'GN1_1', 'audio')).toBeNull();
  });

  it('builds playable chapter metadata and loads timestamps', async () => {
    const provider = new BibleBrainAudioProvider();
    provider._fetchChapterPath = vi.fn().mockResolvedValue('https://audio.test/gn1.mp3');
    provider._loadTimestamps = vi.fn().mockResolvedValue([{ verse: 1, time: 0 }]);
    const audio = await provider.getFragmentAudio({}, { audioFilesets: [1] }, 'GN1_5', 'drama');
    expect(audio).toMatchObject({
      url: 'https://audio.test/gn1.mp3', id: 'biblebrain:AUDIO/GEN_1',
      start: 'GN1_1', timestamps: [{ verse: 1, time: 0 }]
    });
    expect(audio.end).toMatch(/^GN1_\d+$/);
    expect(fixtures.selectAudioFileset).toHaveBeenCalledWith([1], 'GN', 'drama');
  });

  it('fetches chapter paths across success, empty, HTTP, and network outcomes', async () => {
    const provider = new BibleBrainAudioProvider();
    fetch
      .mockResolvedValueOnce(response({ data: [{ path: 'audio.mp3' }] }))
      .mockResolvedValueOnce(response({ data: {} }))
      .mockResolvedValueOnce(response({ ok: false }))
      .mockRejectedValueOnce(new Error('offline'));
    expect(await provider._fetchChapterPath('base', 'FS', 'GEN', 1)).toBe('audio.mp3');
    expect(await provider._fetchChapterPath('base', 'FS', 'GEN', 2)).toBeNull();
    expect(await provider._fetchChapterPath('base', 'FS', 'GEN', 3)).toBeNull();
    expect(await provider._fetchChapterPath('base', 'FS', 'GEN', 4)).toBeNull();
  });

  it('loads and parses timestamps across success and failure outcomes', async () => {
    const provider = new BibleBrainAudioProvider();
    fetch
      .mockResolvedValueOnce(response({ data: [{ verse_start: 1 }] }))
      .mockResolvedValueOnce(response({ ok: false }))
      .mockRejectedValueOnce(new Error('offline'));
    expect(await provider._loadTimestamps('base', 'FS', 'GEN', 1)).toEqual([{ verse_start: 1 }]);
    expect(fixtures.parseTimestamps).toHaveBeenCalledWith([{ verse_start: 1 }]);
    expect(await provider._loadTimestamps('base', 'FS', 'GEN', 2)).toBeNull();
    expect(await provider._loadTimestamps('base', 'FS', 'GEN', 3)).toBeNull();
  });

  it('stops navigation for absent sections and unknown current fragments', async () => {
    const provider = new BibleBrainAudioProvider();
    expect(await provider.getNextFragment(null, {}, 'GN1_1')).toBeNull();
    expect(await provider.getNextFragment({ sections: [] }, {}, 'GN1_1')).toBeNull();
    expect(await provider.getPrevFragment({ sections: ['GN1'] }, {}, 'GN2_1')).toBeNull();
  });

  it('skips unknown books and books without a matching fileset', async () => {
    const provider = new BibleBrainAudioProvider();
    const info = { sections: ['GN1', 'ZZ1', 'EX1', 'MT1'] };
    fixtures.selectAudioFileset
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ id: 'NT', size: 'C' });
    expect(await provider.getNextFragment(info, { audioFilesets: [] }, 'GN1_1')).toBe('MT1_1');
  });

  it('loads linked associations before returning linked metadata', async () => {
    const provider = new LinkedBibleBrainAudioProvider();
    expect(provider.name).toBe('biblebrain-linked');
    const textInfo = { id: 'WEB' };
    fixtures.linkedAudioFor.mockReturnValue({ audioFilesets: [2] });
    expect(await provider.getAudioInfo(textInfo)).toEqual({ audioFilesets: [] });
    expect(fixtures.loadAudioAssociations).toHaveBeenCalled();
    expect(fixtures.biblebrainAudioInfo).toHaveBeenCalledWith(textInfo, [2]);
    fixtures.enabled = false;
    expect(await provider.getAudioInfo(textInfo)).toBeNull();
  });
});

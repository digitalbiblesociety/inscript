import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: {},
  textInfoData: [],
  hasLinkedAudio: vi.fn(),
  loadAudioAssociations: vi.fn()
}));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));
vi.mock('@texts/TextLoader.js', () => ({ getTextInfoData: () => fixtures.textInfoData }));
vi.mock('@/data/biblebrainDuplicates.js', () => ({
  hasLinkedAudio: fixtures.hasLinkedAudio,
  loadAudioAssociations: fixtures.loadAudioAssociations
}));

import { BibleBrainLinkedAudioTextProvider } from '@texts/BibleBrainLinkedAudioTextProvider.js';

const manifest = () => new Promise((resolve) => {
  BibleBrainLinkedAudioTextProvider.getTextManifest(resolve);
});

describe('BibleBrainLinkedAudioTextProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.config = {
      enableOnlineSources: true,
      bibleBrainEnabled: true,
      bibleBrainProxyBase: 'https://proxy.test'
    };
    fixtures.textInfoData = [];
    fixtures.loadAudioAssociations.mockResolvedValue(undefined);
    fixtures.hasLinkedAudio.mockReturnValue(false);
  });

  it('adds no entries of its own and badges texts with linked audio', async () => {
    const withAudio = { id: 'ENGWEB' };
    const withoutAudio = { id: 'ENGKJV' };
    fixtures.textInfoData = [withAudio, withoutAudio];
    fixtures.hasLinkedAudio.mockImplementation(entry => entry === withAudio);

    expect(await manifest()).toBeNull();
    expect(withAudio.hasAudio).toBe(true);
    expect(withoutAudio.hasAudio).toBeUndefined();
  });

  it('completes without badging when the proxy is not configured', async () => {
    fixtures.config.bibleBrainProxyBase = '';
    expect(await manifest()).toBeNull();
    expect(fixtures.loadAudioAssociations).not.toHaveBeenCalled();
  });

  it('still calls back when the associations fail to load', async () => {
    // The manifest loader runs providers in series, so a missing callback here
    // would stall every text in the app.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixtures.loadAudioAssociations.mockRejectedValue(new Error('offline'));

    expect(await manifest()).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      'Error loading linked Bible Brain audio associations:', expect.any(Error)
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  getPlaylist: vi.fn(),
  DeafPlaylist: vi.fn()
}));

vi.mock('@texts/DeafBibleTextProvider.js', () => ({ getPlaylist: fixtures.getPlaylist }));
vi.mock('@windows/DeafPlaylist.js', () => ({ DeafPlaylist: fixtures.DeafPlaylist }));

import {
  applyPending,
  ensurePlaylist,
  setCurrentIndex,
  togglePlay,
  urlFor
} from '@windows/DeafVideoPlayback.js';

function video() {
  const element = document.createElement('video');
  element.load = vi.fn();
  element.play = vi.fn().mockResolvedValue();
  element.pause = vi.fn();
  Object.defineProperty(element, 'paused', { configurable: true, value: true });
  Object.defineProperty(element, 'ended', { configurable: true, value: false });
  return element;
}

function controller() {
  const mainVideo = video();
  return {
    textInfo: { id: 'DEAF' }, playlist: null, playlistPromise: null, playlistTextId: null,
    quality: 'low', currentIndex: 0, currentItem: null, currentBookid: null,
    pendingSeekSec: 0, pendingAutoplay: false, consecutiveErrors: 0,
    refs: {
      video: mainVideo, preloadVideo: video(), passageTitle: document.createElement('div')
    },
    urlFor(item) { return urlFor(this, item); },
    setCurrentIndex: vi.fn(), preloadNext: vi.fn(),
    updateChapterMarkers: vi.fn(), buildChapterStrip: vi.fn(), updatePlayhead: vi.fn(),
    emitLocation: vi.fn()
  };
}

function item(overrides = {}) {
  return {
    index: 0, sectionid: 'JN3', fragmentid: 'JN3_1', bookid: 'JN', reference: 'John 3',
    urlHigh: 'high.mp4', urlLow: 'low.mp4', poster: 'poster.jpg', ...overrides
  };
}

describe('DeafVideoPlayback lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reuses a loaded playlist or a matching in-flight promise', async () => {
    const ctx = controller();
    const playlist = { id: 1 };
    ctx.playlist = playlist;
    ctx.playlistTextId = 'DEAF';
    expect(await ensurePlaylist(ctx)).toBe(playlist);
    ctx.playlist = null;
    ctx.playlistPromise = Promise.resolve(playlist);
    expect(ensurePlaylist(ctx)).toBe(ctx.playlistPromise);
    expect(fixtures.getPlaylist).not.toHaveBeenCalled();
  });

  it('loads and stores a nonempty playlist', async () => {
    const ctx = controller();
    const playlist = { isEmpty: false };
    fixtures.getPlaylist.mockResolvedValue(['passage']);
    fixtures.DeafPlaylist.mockReturnValue(playlist);
    expect(await ensurePlaylist(ctx)).toBe(playlist);
    expect(fixtures.getPlaylist).toHaveBeenCalledWith('DEAF');
    expect(ctx.playlist).toBe(playlist);
    expect(ctx.playlistTextId).toBe('DEAF');
  });

  it('clears matching empty loads but preserves state after a text-id race', async () => {
    const empty = { isEmpty: true };
    fixtures.DeafPlaylist.mockReturnValue(empty);
    fixtures.getPlaylist.mockResolvedValue([]);
    const ctx = controller();
    expect(await ensurePlaylist(ctx)).toBe(empty);
    expect(ctx.playlistTextId).toBeNull();
    expect(ctx.playlistPromise).toBeNull();

    const raced = controller();
    const promise = ensurePlaylist(raced);
    raced.playlistTextId = 'OTHER';
    await promise;
    expect(raced.playlistTextId).toBe('OTHER');
  });

  it('chooses quality fallbacks and applies pending seek/autoplay state', () => {
    const ctx = controller();
    expect(urlFor(ctx, item())).toBe('low.mp4');
    ctx.quality = 'high';
    expect(urlFor(ctx, item({ urlHigh: '', urlLow: 'only-low.mp4' }))).toBe('only-low.mp4');
    expect(urlFor(ctx, item({ urlHigh: '', urlLow: '' }))).toBe('');
    ctx.pendingSeekSec = 7;
    ctx.pendingAutoplay = true;
    applyPending(ctx);
    expect(ctx.refs.video.currentTime).toBe(7);
    expect(ctx.refs.video.play).toHaveBeenCalled();
    expect(ctx.pendingSeekSec).toBe(0);
    expect(ctx.pendingAutoplay).toBe(false);
  });

  it('ignores unavailable playlists and indexes', () => {
    const ctx = controller();
    setCurrentIndex(ctx, 0);
    ctx.playlist = { get: vi.fn(() => null) };
    setCurrentIndex(ctx, 99);
    expect(ctx.updatePlayhead).not.toHaveBeenCalled();
  });

  it('re-seeks unchanged media and plays without reloading it', () => {
    const ctx = controller();
    const current = item();
    ctx.playlist = { get: vi.fn(() => current) };
    ctx.currentItem = current;
    ctx.currentBookid = 'JN';
    ctx.refs.video.src = 'https://example.test/low.mp4';
    // jsdom resolves the assigned src, so return the provider URL explicitly.
    vi.spyOn(ctx.refs.video, 'getAttribute').mockImplementation(name => name === 'src' ? 'low.mp4' : null);
    setCurrentIndex(ctx, 0, { seekSec: 5, autoplay: true });
    expect(ctx.refs.video.currentTime).toBe(5);
    expect(ctx.refs.video.play).toHaveBeenCalled();
    expect(ctx.refs.video.load).not.toHaveBeenCalled();
  });

  it('stops skipping after repeated missing media', () => {
    const ctx = controller();
    const missing = item({ urlHigh: '', urlLow: '' });
    ctx.playlist = { get: vi.fn(() => missing), next: vi.fn(() => 1) };
    ctx.consecutiveErrors = 3;
    setCurrentIndex(ctx, 0);
    expect(ctx.consecutiveErrors).toBe(4);
    expect(ctx.setCurrentIndex).not.toHaveBeenCalled();
  });

  it('plays paused or ended media and pauses active media', () => {
    const ctx = controller();
    ctx.refs.video.src = 'current.mp4';
    togglePlay(ctx);
    expect(ctx.refs.video.play).toHaveBeenCalled();
    Object.defineProperty(ctx.refs.video, 'paused', { configurable: true, value: false });
    togglePlay(ctx);
    expect(ctx.refs.video.pause).toHaveBeenCalled();
  });
});

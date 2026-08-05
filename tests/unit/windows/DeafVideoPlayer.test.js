import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeafPlaylist } from '@windows/DeafPlaylist.js';
import { DeafVideoPlayer } from '@windows/DeafVideoPlayer.js';
import {
  applyPending,
  emitLocation,
  ensurePlaylist,
  goNext,
  goPrev,
  preloadNext,
  setCurrentIndex,
  togglePlay,
  urlFor
} from '@windows/DeafVideoPlayback.js';
import {
  buildChapterStrip,
  buildPlaybar,
  currentSegment,
  fractionFromEvent,
  seekToFraction,
  updateChapterMarkers,
  updatePlayhead
} from '@windows/DeafVideoTimeline.js';
import { close, load, setTextInfo } from '@windows/DeafVideoLifecycle.js';
import {
  seekToClientX,
  setReadingVerse,
  syncTextToEstimate,
  syncTextToTimestamps,
  updateAudioTime
} from '@windows/AudioSync.js';

const passages = [
  {
    sectionid: 'JN3', verse: 1, book: 'John', reference: 'John 3:1-10',
    web_url: 'https://video.test/jn3-1-high.mp4', web_url_low: 'https://video.test/jn3-1-low.mp4',
    cover: 'https://video.test/poster.webp', length: '1:00'
  },
  {
    sectionid: 'JN3', verse: 11, book: 'John', reference: 'John 3:11-21',
    web_url: 'https://video.test/jn3-2-high.mp4', web_url_low: 'https://video.test/jn3-2-low.mp4',
    length: '0:40'
  },
  {
    sectionid: 'JN4', verse: 1, book: 'John', reference: 'John 4:1-12',
    web_url: 'https://video.test/jn4-high.mp4', web_url_low: '', length: '0:30'
  }
];

function mockMedia(media, { paused = true, ended = false, currentTime = 0, duration = 100 } = {}) {
  let pausedValue = paused;
  let timeValue = currentTime;
  Object.defineProperties(media, {
    paused: { configurable: true, get: () => pausedValue },
    ended: { configurable: true, get: () => ended },
    currentTime: { configurable: true, get: () => timeValue, set: value => { timeValue = value; } },
    duration: { configurable: true, get: () => duration }
  });
  media.play = vi.fn(async () => { pausedValue = false; });
  media.pause = vi.fn(() => { pausedValue = true; });
  media.load = vi.fn();
  return media;
}

function makePlayer() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const player = DeafVideoPlayer(root);
  mockMedia(player.refs.video);
  mockMedia(player.refs.preloadVideo);
  player.playlist = DeafPlaylist(passages);
  player.playlistTextId = 'DEAF';
  player.textInfo = { id: 'DEAF' };
  player.trigger = vi.fn();
  player.refs.track.getBoundingClientRect = () => ({ left: 10, width: 200 });
  return player;
}

describe('Deaf video player UI and events', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('constructs the complete player and controls playback from UI events', async () => {
    const controller = makePlayer();
    expect(controller.refs.player.getAttribute('tabindex')).toBe('0');
    expect(controller.refs.player.querySelectorAll('video')).toHaveLength(2);

    controller.setCurrentIndex(0, { autoplay: true, seekSec: 12 });
    expect(controller.currentItem.reference).toBe('John 3:1-10');
    expect(controller.refs.video.src).toContain('jn3-1-low.mp4');
    expect(controller.refs.video.load).toHaveBeenCalled();
    expect(controller.refs.markersLayer.querySelectorAll('.deaf-marker')).toHaveLength(2);
    expect(controller.refs.chapterStrip.querySelectorAll('button')).toHaveLength(2);

    controller.refs.video.dispatchEvent(new Event('loadedmetadata'));
    expect(controller.refs.video.currentTime).toBe(12);
    expect(controller.refs.video.play).toHaveBeenCalled();
    controller.refs.video.dispatchEvent(new Event('playing'));
    expect(controller.refs.playButton.classList.contains('playing')).toBe(true);
    controller.refs.video.dispatchEvent(new Event('pause'));
    expect(controller.refs.playButton.classList.contains('playing')).toBe(false);
    controller.refs.video.dispatchEvent(new Event('waiting'));
    expect(controller.refs.buffering.classList.contains('active')).toBe(true);
    controller.consecutiveErrors = 2;
    controller.refs.video.dispatchEvent(new Event('canplay'));
    expect(controller.consecutiveErrors).toBe(0);

    controller.refs.playButton.click();
    controller.refs.prevButton.click();
    controller.refs.nextButton.click();
    expect(controller.currentIndex).toBe(1);
    controller.refs.autoplayCheckbox.checked = true;
    controller.refs.video.dispatchEvent(new Event('ended'));
    expect(controller.currentIndex).toBe(2);

    controller.refs.optionsButton.click();
    expect(controller.refs.optionsPanel.style.display).toBe('');
    vi.runOnlyPendingTimers();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(controller.refs.optionsPanel.style.display).toBe('none');
    controller.refs.qualityHigh.checked = true;
    controller.refs.qualityHigh.dispatchEvent(new Event('change'));
    expect(controller.quality).toBe('high');

    const requestFullscreen = vi.fn();
    controller.refs.stage.requestFullscreen = requestFullscreen;
    controller.refs.fullscreenButton.click();
    expect(requestFullscreen).toHaveBeenCalled();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: controller.refs.stage });
    document.exitFullscreen = vi.fn();
    controller.refs.fullscreenButton.click();
    expect(document.exitFullscreen).toHaveBeenCalled();
  });

  it('handles seeking, marker navigation, dragging, chapters, and shortcuts', () => {
    const controller = makePlayer();
    controller.setCurrentIndex(0);
    controller.seekToFraction = vi.fn();
    controller.refs.track.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 110 }));
    expect(controller.seekToFraction).toHaveBeenCalledWith(0.5);

    controller.setCurrentIndex = vi.fn();
    const marker = controller.refs.markersLayer.querySelector('[data-index="1"]');
    marker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(controller.setCurrentIndex).toHaveBeenCalledWith(1, { autoplay: false });

    controller.refs.handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 210 }));
    expect(controller.refs.handle.style.left).toBe('100%');
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 10 }));
    expect(controller.isDragging).toBe(false);
    expect(controller.seekToFraction).toHaveBeenLastCalledWith(0);

    const chapter = controller.refs.chapterStrip.querySelector('[data-sectionid="JN4"]');
    chapter.click();
    expect(controller.setCurrentIndex).toHaveBeenCalledWith(2, { autoplay: false });
    controller.togglePlay = vi.fn();
    controller.goNext = vi.fn();
    controller.goPrev = vi.fn();
    controller.refs.player.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    controller.refs.player.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    controller.refs.player.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
    expect(controller.togglePlay).toHaveBeenCalled();
    expect(controller.goNext).toHaveBeenCalled();
    expect(controller.goPrev).toHaveBeenCalled();
  });

  it('falls back to alternate quality and skips repeatedly broken media', () => {
    const controller = makePlayer();
    controller.setCurrentIndex(0);
    controller.goNext = vi.fn();
    controller.refs.video.dispatchEvent(new Event('error'));
    expect(controller.refs.video.src).toContain('jn3-1-high.mp4');
    controller.refs.video.dispatchEvent(new Event('error'));
    expect(controller.consecutiveErrors).toBe(1);
    expect(controller.goNext).toHaveBeenCalledWith(true);
    controller.currentItem = null;
    controller.refs.video.dispatchEvent(new Event('error'));
  });
});

describe('Deaf video playback and lifecycle functions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it('uses cached playlist state and selects URLs by quality', async () => {
    const controller = makePlayer();
    await expect(ensurePlaylist(controller)).resolves.toBe(controller.playlist);
    controller.playlist = null;
    controller.playlistPromise = Promise.resolve('pending');
    await expect(ensurePlaylist(controller)).resolves.toBe('pending');
    expect(urlFor({ quality: 'high' }, DeafPlaylist(passages).get(0))).toContain('high');
    expect(urlFor({ quality: 'low' }, { urlLow: '', urlHigh: 'fallback' })).toBe('fallback');
    expect(urlFor({ quality: 'low' }, {})).toBe('');
  });

  it('applies pending media state and emits local/global locations', () => {
    const controller = makePlayer();
    controller.pendingSeekSec = 8;
    controller.pendingAutoplay = true;
    applyPending(controller);
    expect(controller.refs.video.currentTime).toBe(8);
    expect(controller.refs.video.play).toHaveBeenCalled();
    emitLocation(controller, true);
    expect(controller.trigger).not.toHaveBeenCalled();
    controller.currentItem = controller.playlist.get(0);
    emitLocation(controller, true);
    expect(controller.locationInfo).toMatchObject({ sectionid: 'JN3', fragmentid: 'JN3_1' });
    expect(controller.trigger).toHaveBeenCalledTimes(2);
  });

  it('loads, preloads, re-seeks, navigates, and handles missing media', () => {
    const controller = makePlayer();
    setCurrentIndex(controller, 0, { autoplay: false });
    expect(controller.refs.preloadVideo.src).toContain('jn3-2-low.mp4');
    const loadCalls = controller.refs.video.load.mock.calls.length;
    setCurrentIndex(controller, 0, { autoplay: true, seekSec: 4 });
    expect(controller.refs.video.currentTime).toBe(4);
    expect(controller.refs.video.load).toHaveBeenCalledTimes(loadCalls);
    goNext(controller, false);
    expect(controller.currentIndex).toBe(1);
    goPrev(controller);
    expect(controller.currentIndex).toBe(0);
    preloadNext(controller);

    controller.refs.video.removeAttribute('src');
    controller.currentItem = controller.playlist.get(0);
    controller.setCurrentIndex = vi.fn();
    togglePlay(controller);
    expect(controller.setCurrentIndex).toHaveBeenCalledWith(0, { autoplay: true, suppressBroadcast: true });
    controller.refs.video.src = 'https://video.test/current.mp4';
    togglePlay(controller);
    expect(controller.refs.video.play).toHaveBeenCalled();

    const noMedia = DeafPlaylist([
      { sectionid: 'JN5', verse: 1, reference: 'John 5', web_url: '', web_url_low: '', length: 1 },
      passages[2]
    ]);
    controller.playlist = noMedia;
    controller.currentItem = null;
    controller.currentIndex = -1;
    controller.setCurrentIndex = (index, options) => setCurrentIndex(controller, index, options);
    setCurrentIndex(controller, 0);
    expect(controller.currentIndex).toBe(1);
  });

  it('resets text state, resolves load targets, and closes cleanly', async () => {
    const controller = makePlayer();
    controller.currentItem = controller.playlist.get(0);
    setTextInfo(controller, { id: 'NEXT' });
    expect(controller.playlist).toBeNull();
    expect(controller.refs.video.hasAttribute('src')).toBe(false);
    setTextInfo(controller, { id: 'NEXT' });

    const playlist = DeafPlaylist(passages);
    controller.ensurePlaylist = vi.fn(async () => playlist);
    controller.setCurrentIndex = vi.fn((index) => { controller.locationInfo = { index }; });
    load(controller, 'JN3', 'JN3_11');
    await Promise.resolve();
    expect(controller.setCurrentIndex).toHaveBeenCalledWith(1, { autoplay: false, suppressBroadcast: true });
    expect(controller.trigger).toHaveBeenCalledWith('load', expect.any(Object));

    controller.playlist = playlist;
    controller.setCurrentIndex.mockClear();
    controller.scrollTo('JN4_1');
    expect(controller.setCurrentIndex).toHaveBeenCalledWith(2, { autoplay: false, suppressBroadcast: true });
    controller.broadcastCurrentContent();
    expect(controller.getTextInfo()).toEqual({ id: 'NEXT' });
    controller.setFocus();
    controller.size();

    controller.clearListeners = vi.fn();
    close(controller);
    expect(controller.clearListeners).toHaveBeenCalled();
    expect(document.body.contains(controller.refs.player)).toBe(false);
  });
});

describe('Deaf video timeline', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it('builds markers, chapter buttons, and playhead values', () => {
    const controller = makePlayer();
    controller.currentIndex = 0;
    controller.currentItem = controller.playlist.get(0);
    controller.currentBookid = 'JN';
    controller.currentChapterTimeline = controller.playlist.chapterTimeline('JN3');
    buildPlaybar(controller);
    expect(controller.refs.markersLayer.children).toHaveLength(2);
    expect(currentSegment(controller).item.index).toBe(0);
    controller.refs.video.currentTime = 30;
    updatePlayhead(controller);
    expect(controller.refs.progress.style.width).toBe('30%');
    expect(controller.refs.currenttime.textContent).toBe('00:30');
    buildChapterStrip(controller);
    expect(controller.refs.chapterStrip.textContent).toContain('John');

    controller.currentChapterTimeline = null;
    buildPlaybar(controller);
    updatePlayhead(controller);
    expect(controller.refs.progress.style.width).toBe('0%');
  });

  it('updates marker state and seeks within or across segments', () => {
    const controller = makePlayer();
    controller.currentIndex = 0;
    controller.currentItem = controller.playlist.get(0);
    controller.currentChapterTimeline = controller.playlist.chapterTimeline('JN3');
    buildPlaybar(controller);
    updateChapterMarkers(controller, controller.playlist.get(1), 1, false);
    expect(controller.refs.markersLayer.querySelector('[data-index="1"]').classList.contains('active')).toBe(true);
    controller.buildPlaybar = vi.fn();
    updateChapterMarkers(controller, controller.playlist.get(2), 2, true);
    expect(controller.buildPlaybar).toHaveBeenCalled();

    expect(fractionFromEvent(controller, 110)).toBe(0.5);
    controller.refs.track.getBoundingClientRect = () => ({ left: 10, width: 0 });
    expect(fractionFromEvent(controller, 110)).toBe(0);

    controller.currentChapterTimeline = controller.playlist.chapterTimeline('JN3');
    controller.currentIndex = 0;
    seekToFraction(controller, 0.2);
    expect(controller.refs.video.currentTime).toBe(20);
    controller.setCurrentIndex = vi.fn();
    seekToFraction(controller, 0.8);
    expect(controller.setCurrentIndex).toHaveBeenCalledWith(1, { seekSec: 20, autoplay: false });
    controller.currentChapterTimeline = null;
    seekToFraction(controller, 0.5);
  });
});

describe('audio-to-text synchronization', () => {
  function makeAudioController() {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="scroller-main"><div class="section" data-id="JN3">
        <span class="v" data-id="JN3_1">one</span><span class="v" data-id="JN3_2">two</span>
      </div></div>`;
    document.body.appendChild(container);
    const audio = mockMedia(document.createElement('audio'), { currentTime: 12, duration: 100 });
    const refs = {
      containerElement: container, audio,
      currenttime: document.createElement('span'), duration: document.createElement('span'),
      sliderCurrent: document.createElement('span'), sliderHandle: document.createElement('span'),
      scrollCheckbox: Object.assign(document.createElement('input'), { checked: true }),
      toggleButtonElement: document.createElement('button'), slider: document.createElement('div')
    };
    Object.defineProperty(refs.slider, 'offsetWidth', { configurable: true, value: 200 });
    refs.slider.getBoundingClientRect = () => ({ left: 20, top: 0, width: 200 });
    const controller = {
      refs, sectionid: 'JN3', sectionNode: null, lastTimestampVerse: null,
      fragmentAudioData: { timestamps: [{ time: 0, verse: 1 }, { time: 10, verse: 2 }] },
      isDraggingSliderHandle: false
    };
    controller.setReadingVerse = verse => setReadingVerse(controller, verse);
    controller.syncTextToTimestamps = pane => syncTextToTimestamps(controller, pane);
    controller.syncTextToEstimate = pane => syncTextToEstimate(controller, pane);
    return controller;
  }

  beforeEach(() => { document.body.innerHTML = ''; });

  it('marks timestamped verses and updates the audio controls', () => {
    const controller = makeAudioController();
    const pane = controller.refs.containerElement.querySelector('.scroller-main');
    controller.sectionNode = controller.refs.containerElement.querySelector('.section');
    syncTextToTimestamps(controller, pane);
    expect(controller.refs.containerElement.querySelector('[data-id="JN3_2"]').classList.contains('audio-reading')).toBe(true);
    updateAudioTime(controller);
    expect(controller.refs.currenttime.textContent).toBe('00:12');
    expect(controller.refs.sliderCurrent.style.width).toBe('12%');
    setReadingVerse(controller, null);
    expect(controller.refs.containerElement.querySelector('.audio-reading')).toBeNull();
  });

  it('estimates scrolling and clamps seeking to the slider', () => {
    const controller = makeAudioController();
    const pane = controller.refs.containerElement.querySelector('.scroller-main');
    controller.fragmentAudioData = {};
    controller.sectionNode = controller.refs.containerElement.querySelector('.section');
    Object.defineProperty(controller.sectionNode, 'offsetHeight', { configurable: true, value: 1000 });
    syncTextToEstimate(controller, pane);
    expect(pane.scrollTop).toBeGreaterThanOrEqual(0);
    seekToClientX(controller, 120);
    expect(controller.refs.audio.currentTime).toBe(50);
    expect(controller.refs.sliderHandle.style.left).toBe('50%');
    Object.defineProperty(controller.refs.slider, 'offsetWidth', { configurable: true, value: 0 });
    seekToClientX(controller, 500);
    expect(controller.refs.audio.currentTime).toBe(50);
  });
});

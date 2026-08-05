import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleAudioInfoResult,
  loadAudio,
  playWhenLoaded,
  setTextInfo,
  skipToFragment,
  togglePlayback,
  updateDramatic
} from '@windows/AudioPlayback.js';

function mediaElement() {
  const audio = document.createElement('audio');
  Object.defineProperties(audio, {
    paused: { value: true, writable: true },
    ended: { value: false, writable: true },
    duration: { value: 0, writable: true }
  });
  audio.play = vi.fn().mockResolvedValue(undefined);
  audio.pause = vi.fn();
  audio.load = vi.fn();
  return audio;
}

function makeController() {
  const audio = mediaElement();
  const containerElement = document.createElement('div');
  const section = document.createElement('div');
  section.className = 'section';
  section.dataset.id = 'JN1';
  Object.defineProperty(section, 'offsetHeight', { value: 240 });
  containerElement.appendChild(section);

  const refs = {
    audio,
    playButton: document.createElement('button'),
    title: document.createElement('span'),
    subtitle: document.createElement('span'),
    sliderCurrent: document.createElement('span'),
    sliderHandle: document.createElement('span'),
    currenttime: document.createElement('span'),
    duration: document.createElement('span'),
    toggleButtonElement: document.createElement('button'),
    block: document.createElement('div'),
    containerElement,
    dramaticBox: document.createElement('div'),
    dramaticAudio: document.createElement('input'),
    dramaticDrama: document.createElement('input'),
    scrollCheckbox: document.createElement('input')
  };
  refs.block.style.display = '';
  refs.scrollCheckbox.checked = true;

  return {
    refs,
    playIcon: '<play>',
    fragmentid: '',
    sectionid: '',
    fragmentAudioData: null,
    loadAudioWhenPlayIsPressed: false,
    hasAudio: true,
    lastTimestampVerse: 9,
    audioRequestId: 0,
    textInfo: { id: 'WEB', type: 'bible' },
    audioInfo: { title: 'Spoken Bible', type: 'local' },
    audioDataManager: {
      getAudioInfo: vi.fn(),
      getFragmentAudio: vi.fn()
    },
    scroller: {
      load: vi.fn(),
      getLocationInfo: vi.fn().mockReturnValue({ fragmentid: 'JN1_1' })
    },
    playWhenLoaded: vi.fn(),
    loadAudio: vi.fn(),
    setReadingVerse: vi.fn(),
    handleAudioInfoResult: vi.fn(),
    trigger: vi.fn()
  };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('AudioPlayback controls', () => {
  let controller;

  beforeEach(() => {
    controller = makeController();
  });

  it('plays once loaded and removes the one-shot listener', () => {
    playWhenLoaded(controller);
    expect(controller.refs.audio.play).toHaveBeenCalled();
    expect(controller.refs.audio.removeEventListener).toBeTypeOf('function');
  });

  it('restores the play button when playback is rejected', async () => {
    controller.refs.playButton.classList.add('playing');
    controller.refs.audio.play.mockRejectedValueOnce(new Error('blocked'));
    playWhenLoaded(controller);
    await flush();
    expect(controller.refs.playButton.innerHTML).toBe('<play></play>');
    expect(controller.refs.playButton.classList.contains('playing')).toBe(false);
  });

  it('reloads dramatic audio and stops an active stream first', () => {
    controller.fragmentid = 'JN1_1';
    controller.sectionid = 'JN1';
    controller.refs.audio.paused = false;
    updateDramatic(controller);
    expect(controller.refs.audio.pause).toHaveBeenCalled();
    expect(controller.refs.audio.load).toHaveBeenCalled();
    expect(controller.loadAudio).toHaveBeenCalledWith('JN1_1');
    expect(controller.fragmentAudioData).toBeNull();
  });

  it('defers the source until play when the controller is collapsed', () => {
    controller.fragmentAudioData = { url: '/audio.mp3' };
    controller.loadAudioWhenPlayIsPressed = true;
    togglePlayback(controller);
    expect(controller.refs.audio.getAttribute('src')).toBe('/audio.mp3');
    expect(controller.refs.audio.load).toHaveBeenCalled();
    expect(controller.loadAudioWhenPlayIsPressed).toBe(false);
  });

  it('toggles between playing and paused states', async () => {
    controller.refs.audio.src = '/audio.mp3';
    togglePlayback(controller);
    expect(controller.refs.audio.play).toHaveBeenCalled();

    controller.refs.audio.paused = false;
    togglePlayback(controller);
    expect(controller.refs.audio.pause).toHaveBeenCalled();

    controller.refs.audio.paused = true;
    controller.refs.audio.play.mockRejectedValueOnce(new Error('blocked'));
    controller.refs.playButton.classList.add('playing');
    togglePlayback(controller);
    await flush();
    expect(controller.refs.playButton.classList.contains('playing')).toBe(false);
  });

  it('navigates, scrolls, and loads a different fragment', () => {
    controller.fragmentAudioData = { fragmentid: 'JN1_1' };
    skipToFragment(controller, (text, info, current, callback) => callback('JN2_1'));
    expect(controller.scroller.load).toHaveBeenCalledWith('text', 'JN2', 'JN2_1');
    expect(controller.loadAudio).toHaveBeenCalledWith('JN2_1');
  });

  it('does nothing for a missing or already-loaded neighboring fragment', () => {
    controller.fragmentAudioData = { fragmentid: 'JN1_1' };
    skipToFragment(controller, (text, info, current, callback) => callback(null));
    skipToFragment(controller, (text, info, current, callback) => callback('JN1_1'));
    expect(controller.loadAudio).not.toHaveBeenCalled();
  });
});

describe('AudioPlayback data loading', () => {
  let controller;

  beforeEach(() => {
    controller = makeController();
  });

  it('requests a chapter with the selected audio option and applies its data', () => {
    controller.refs.dramaticAudio.checked = true;
    controller.audioInfo = { title: 'Spoken Bible', type: 'biblebrain', pericopeBased: true };
    controller.audioDataManager.getFragmentAudio.mockImplementation((text, info, fragment, option, cb) => {
      expect(option).toBe('audio');
      cb({ id: 'clip-1', url: '/john.mp3', fragmentid: 'JN1_1' });
    });

    loadAudio(controller, 'JN1_1');

    expect(controller.refs.audio.getAttribute('src')).toBe('/john.mp3');
    expect(controller.refs.audio.load).toHaveBeenCalled();
    expect(controller.setReadingVerse).toHaveBeenCalledWith(null);
    expect(controller.sectionHeight).toBe(240);
    expect(controller.refs.title.innerHTML).toBe('John 1');
    expect(controller.refs.subtitle.innerHTML).toBe('Spoken Bible');
  });

  it('selects drama and defers loading when the player is collapsed', () => {
    controller.refs.dramaticDrama.checked = true;
    controller.refs.block.style.display = 'none';
    controller.audioInfo = { title: 'Drama', pericopeBased: true };
    controller.audioDataManager.getFragmentAudio.mockImplementation((text, info, fragment, option, cb) => {
      expect(option).toBe('drama');
      cb({ id: 2, url: '/drama.mp3' });
    });
    loadAudio(controller, 'JN1_3');
    expect(controller.loadAudioWhenPlayIsPressed).toBe(true);
    expect(controller.refs.audio.hasAttribute('src')).toBe(false);
  });

  it('shows the no-audio state and hides an attached controller', () => {
    controller.audioInfo = { title: 'None', pericopeBased: true };
    controller.audioDataManager.getFragmentAudio.mockImplementation((a, b, c, d, cb) => cb(null));
    loadAudio(controller, 'JN1_1');
    expect(controller.refs.title.innerHTML).toBe('[No audio]');
    expect(controller.refs.toggleButtonElement.style.display).toBe('none');
    expect(controller.refs.block.style.display).toBe('none');
  });

  it('ignores redundant chapters, duplicate clips, stale replies, and invalid requests', () => {
    controller.audioInfo = { title: 'Audio', pericopeBased: false };
    controller.sectionid = 'JN1';
    loadAudio(controller, 'JN1_2');
    expect(controller.audioDataManager.getFragmentAudio).not.toHaveBeenCalled();

    controller.fragmentid = '';
    controller.sectionid = '';
    controller.fragmentAudioData = { id: 'same' };
    controller.audioDataManager.getFragmentAudio.mockImplementation((a, b, c, d, cb) => cb({ id: 'same', url: '/same' }));
    loadAudio(controller, 'JN1_1');
    expect(controller.setReadingVerse).not.toHaveBeenCalled();

    controller.fragmentid = '';
    controller.audioDataManager.getFragmentAudio.mockImplementation((a, b, c, d, cb) => {
      controller.audioRequestId++;
      cb({ id: 'stale', url: '/stale' });
    });
    loadAudio(controller, 'JN2_1');
    expect(controller.refs.audio.getAttribute('src')).not.toBe('/stale');

    controller.hasAudio = false;
    loadAudio(controller, 'JN3_1');
    loadAudio(controller, undefined);
  });
});

describe('AudioPlayback audio availability', () => {
  let controller;

  beforeEach(() => {
    controller = makeController();
  });

  it('reports unavailable audio and hides an attached controller', () => {
    handleAudioInfoResult(controller, null);
    expect(controller.hasAudio).toBe(false);
    expect(controller.refs.block.style.display).toBe('none');
    expect(controller.trigger).toHaveBeenCalledWith('audioavailable', expect.objectContaining({
      data: { hasAudio: false }
    }));
  });

  it.each([
    [{ type: 'local', title: 'Local' }, 'none'],
    [{ type: 'dbs', title: 'DBS' }, 'none'],
    [{ type: 'biblebrain', title: 'BB', hasPlainAudio: true, hasDramaAudio: true }, 'both'],
    [{ type: 'fcbh', title: 'FCBH', fcbh_drama_nt: true }, 'drama']
  ])('configures %s audio and initializes from the scroller', (info, expected) => {
    handleAudioInfoResult(controller, info);
    expect(controller.hasAudio).toBe(true);
    expect(controller.loadAudio).toHaveBeenCalledWith('JN1_1');
    if (expected === 'none') expect(controller.refs.dramaticBox.style.display).toBe('none');
    if (expected === 'both') {
      expect(controller.refs.dramaticAudio.disabled).toBe(false);
      expect(controller.refs.dramaticDrama.disabled).toBe(false);
      expect(controller.refs.dramaticAudio.checked).toBe(true);
    }
    if (expected === 'drama') {
      expect(controller.refs.dramaticAudio.checked).toBe(false);
      expect(controller.refs.dramaticDrama.checked).toBe(true);
    }
  });

  it('prefers a pending fragment over the scroller position', () => {
    controller.fragmentid = 'RM8_1';
    handleAudioInfoResult(controller, { type: 'local', title: 'Audio' });
    expect(controller.loadAudio).toHaveBeenCalledWith('RM8_1');
    expect(controller.scroller.getLocationInfo).not.toHaveBeenCalled();
  });

  it('resets playback and requests audio metadata for a new Bible', () => {
    controller.refs.audio.paused = false;
    controller.refs.audio.src = '/old.mp3';
    controller.audioDataManager.getAudioInfo.mockImplementation((text, cb) => cb({ type: 'local' }));
    setTextInfo(controller, { id: 'KJV', type: 'bible' });
    expect(controller.refs.audio.pause).toHaveBeenCalled();
    expect(controller.refs.audio.hasAttribute('src')).toBe(false);
    expect(controller.refs.currenttime.innerHTML).toBe('00:00');
    expect(controller.handleAudioInfoResult).toHaveBeenCalledWith({ type: 'local' });
  });

  it('ignores the same text, non-Bibles, and stale metadata replies', () => {
    setTextInfo(controller, controller.textInfo);
    expect(controller.audioDataManager.getAudioInfo).not.toHaveBeenCalled();

    setTextInfo(controller, { id: 'notes', type: 'notes' });
    expect(controller.audioDataManager.getAudioInfo).not.toHaveBeenCalled();

    controller.audioDataManager.getAudioInfo.mockImplementation((text, cb) => {
      controller.audioRequestId++;
      cb({ type: 'local' });
    });
    setTextInfo(controller, { id: 'ASV', type: 'bible' });
    expect(controller.handleAudioInfoResult).not.toHaveBeenCalled();
  });
});

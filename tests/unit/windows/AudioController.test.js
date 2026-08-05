import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioController } from '@windows/AudioController.js';

function makeController({ withToggle = true, withScroller = true } = {}) {
  const container = document.createElement('div');
  const toggle = withToggle ? document.createElement('button') : null;
  document.body.append(container);
  if (toggle) document.body.append(toggle);
  const scroller = withScroller ? {
    on: vi.fn(),
    load: vi.fn(),
    getLocationInfo: vi.fn()
  } : null;
  const controller = AudioController('test-audio', container, toggle, scroller);
  const { audio } = controller.refs;
  Object.defineProperties(audio, {
    paused: { value: true, writable: true },
    ended: { value: false, writable: true },
    duration: { value: 0, writable: true },
    currentTime: { value: 0, writable: true }
  });
  audio.play = vi.fn().mockResolvedValue(undefined);
  audio.pause = vi.fn();
  audio.load = vi.fn();
  return { controller, container, toggle, scroller };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AudioController UI and options', () => {
  it('builds a collapsed controller and toggles its options and body', () => {
    vi.useFakeTimers();
    const { controller, container, toggle } = makeController();
    const { options, optionsButton, optionsCloseButton, block } = controller.refs;

    expect(container.contains(block)).toBe(true);
    expect(block.style.display).toBe('none');
    expect(toggle.style.display).toBe('none');

    optionsButton.click();
    expect(options.style.display).toBe('');
    vi.runAllTimers();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(options.style.display).toBe('none');

    optionsButton.click();
    optionsCloseButton.click();
    expect(options.style.display).toBe('none');

    toggle.click();
    expect(block.style.display).toBe('');
    toggle.click();
    expect(block.style.display).toBe('none');
  });

  it('wires playback, chapter controls, drama choices, and scroller changes', () => {
    const { controller, scroller } = makeController();
    const togglePlayback = vi.spyOn(controller, 'togglePlayback').mockImplementation(() => {});
    const skip = vi.spyOn(controller, 'skipToFragment').mockImplementation(() => {});
    const dramatic = vi.spyOn(controller, 'updateDramatic').mockImplementation(() => {});
    const load = vi.spyOn(controller, 'loadAudio').mockImplementation(() => {});

    controller.refs.playButton.click();
    controller.refs.prevButton.click();
    controller.refs.nextButton.click();
    controller.refs.dramaticAudio.dispatchEvent(new Event('change'));
    controller.refs.dramaticDrama.dispatchEvent(new Event('change'));

    expect(togglePlayback).toHaveBeenCalledOnce();
    expect(skip).toHaveBeenCalledTimes(2);
    expect(dramatic).toHaveBeenCalledTimes(2);

    const locationHandler = scroller.on.mock.calls.find(([name]) => name === 'locationchange')[1];
    locationHandler({ data: null });
    locationHandler({ data: { fragmentid: 'RM8_1' } });
    expect(controller.locationInfo).toEqual({ fragmentid: 'RM8_1' });
    expect(load).toHaveBeenCalledWith('RM8_1');
  });

  it('supports controllers without a toggle or scroller', () => {
    const { controller } = makeController({ withToggle: false, withScroller: false });
    expect(controller.refs.toggleButtonElement).toBeUndefined();
    expect(controller.refs.block.style.display).toBe('');
  });
});

describe('AudioController media events', () => {
  it('marks playback active and pauses other active media', () => {
    const { controller } = makeController();
    const other = document.createElement('video');
    Object.defineProperties(other, {
      paused: { value: false },
      ended: { value: false }
    });
    other.pause = vi.fn();
    document.body.append(other);

    controller.refs.audio.dispatchEvent(new Event('play'));
    expect(controller.refs.playButton.classList.contains('playing')).toBe(true);
    expect(other.pause).toHaveBeenCalled();

    controller.refs.audio.dispatchEvent(new Event('pause'));
    expect(controller.refs.playButton.classList.contains('playing')).toBe(false);
  });

  it('resets and updates time labels during media loading', () => {
    const { controller } = makeController();
    controller.refs.sliderHandle.style.left = '50%';
    controller.refs.currenttime.textContent = '00:30';

    controller.refs.audio.dispatchEvent(new Event('loadstart'));
    expect(controller.refs.sliderHandle.style.left).toBe('0%');
    expect(controller.refs.currenttime.textContent).toBe('00:00');

    controller.refs.audio.duration = 65;
    controller.refs.audio.dispatchEvent(new Event('loadedmetadata'));
    expect(controller.refs.duration.textContent).toBe('01:05');

    const update = vi.spyOn(controller, 'updateAudioTime').mockImplementation(() => {});
    controller.refs.audio.dispatchEvent(new Event('timeupdate'));
    expect(update).toHaveBeenCalled();
  });

  it('handles failed sources but ignores source-less errors', () => {
    const { controller } = makeController();
    controller.refs.audio.dispatchEvent(new Event('error'));
    expect(controller.refs.title.textContent).toBe('');

    controller.refs.audio.src = '/missing.mp3';
    controller.fragmentAudioData = { url: '/missing.mp3' };
    controller.refs.playButton.classList.add('playing');
    controller.refs.audio.dispatchEvent(new Event('error'));
    expect(controller.refs.title.textContent).toBe('[Audio unavailable]');
    expect(controller.refs.audio.hasAttribute('src')).toBe(false);
    expect(controller.loadAudioWhenPlayIsPressed).toBe(true);
    expect(controller.refs.playButton.classList.contains('playing')).toBe(false);
  });

  it('advances on autoplay and clears reading state otherwise', () => {
    const { controller } = makeController();
    const skip = vi.spyOn(controller, 'skipToFragment').mockImplementation(() => {});
    controller.refs.autoplayCheckbox.checked = true;
    controller.refs.audio.dispatchEvent(new Event('ended'));
    expect(skip).toHaveBeenCalled();

    const setReadingVerse = vi.spyOn(controller, 'setReadingVerse').mockImplementation(() => {});
    controller.refs.autoplayCheckbox.checked = false;
    controller.lastTimestampVerse = 4;
    controller.refs.audio.dispatchEvent(new Event('ended'));
    expect(setReadingVerse).toHaveBeenCalledWith(null);
    expect(controller.lastTimestampVerse).toBe(0);
  });
});

describe('AudioController slider and lifecycle', () => {
  it('seeks on slider clicks and pointer drags', () => {
    const { controller } = makeController();
    const seek = vi.spyOn(controller, 'seekToClientX').mockImplementation(() => {});

    controller.refs.slider.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 60 }));
    expect(seek).toHaveBeenCalledWith(60);

    const down = new PointerEvent('pointerdown', { bubbles: true, clientX: 20 });
    controller.refs.sliderHandle.dispatchEvent(down);
    expect(controller.isDraggingSliderHandle).toBe(true);
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 75 }));
    expect(seek).toHaveBeenCalledWith(75);
    document.dispatchEvent(new PointerEvent('pointerup'));
    expect(controller.isDraggingSliderHandle).toBe(false);
  });

  it('sizes and closes the controller cleanly', () => {
    const { controller } = makeController();
    const block = controller.refs.block;
    const options = controller.refs.options;
    controller.size(420);
    expect(block.style.width).toBe('420px');

    controller.close();
    expect(block.isConnected).toBe(false);
    expect(options.isConnected).toBe(false);
    expect(controller.refs.block).toBeNull();
    expect(controller.refs.options).toBeNull();
  });
});

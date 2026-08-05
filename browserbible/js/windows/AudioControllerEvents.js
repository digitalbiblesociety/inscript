import { secondsToTimeCode } from '../lib/helpers.esm.js';
import pauseSvg from '../../css/images/audio/pause-icon.svg?raw';
import { playSvg } from './AudioControllerUi.js';

function bindOptions(controller) {
  const { options, optionsButton, optionsCloseButton, dramaticAudio, dramaticDrama,
    toggleButtonElement, block } = controller.refs;
  controller.docClick = (event) => {
    if (options.contains(event.target)) return;
    options.style.display = 'none';
    document.removeEventListener('click', controller.docClick);
  };
  optionsButton.addEventListener('click', () => {
    const opening = options.style.display === 'none';
    options.style.display = opening ? '' : 'none';
    if (opening) setTimeout(() => document.addEventListener('click', controller.docClick));
    else document.removeEventListener('click', controller.docClick);
  });
  optionsCloseButton.addEventListener('click', () => {
    options.style.display = 'none';
    document.removeEventListener('click', controller.docClick);
  });
  dramaticAudio.addEventListener('change', () => controller.updateDramatic());
  dramaticDrama.addEventListener('change', () => controller.updateDramatic());
  toggleButtonElement?.addEventListener('click', () => {
    block.style.display = block.style.display === 'none' ? '' : 'none';
  });
}

function bindControls(controller) {
  const { playButton, prevButton, nextButton } = controller.refs;
  playButton.addEventListener('click', () => controller.togglePlayback());
  prevButton.addEventListener('click', () => controller.skipToFragment(
    controller.audioDataManager.getPrevFragment.bind(controller.audioDataManager)));
  nextButton.addEventListener('click', () => controller.skipToFragment(
    controller.audioDataManager.getNextFragment.bind(controller.audioDataManager)));
  if (controller.scroller) {
    controller.scroller.on('locationchange', (event) => {
      if (!event.data) return;
      controller.locationInfo = event.data;
      controller.loadAudio(event.data.fragmentid);
    });
  }
}

function bindAudioState(controller) {
  const { audio, playButton, sliderHandle, currenttime, duration, title,
    autoplayCheckbox, nextButton } = controller.refs;
  const playing = () => {
    playButton.innerHTML = pauseSvg;
    playButton.classList.add('playing');
    document.querySelectorAll('audio,video').forEach((media) => {
      if (media !== audio && !media.paused && !media.ended) media.pause();
    });
  };
  const paused = () => {
    playButton.innerHTML = playSvg;
    playButton.classList.remove('playing');
  };
  audio.addEventListener('play', playing);
  audio.addEventListener('playing', playing);
  audio.addEventListener('pause', paused);
  audio.addEventListener('ended', paused);
  audio.addEventListener('loadstart', () => {
    paused();
    sliderHandle.style.left = '0%';
    currenttime.innerHTML = secondsToTimeCode(0);
    duration.innerHTML = secondsToTimeCode(0);
  });
  audio.addEventListener('loadedmetadata', () => {
    duration.innerHTML = secondsToTimeCode(audio.duration);
  });
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    audio.removeEventListener('loadeddata', controller.playWhenLoaded);
    paused();
    title.innerHTML = '[Audio unavailable]';
    audio.removeAttribute('src');
    if (controller.fragmentAudioData?.url) controller.loadAudioWhenPlayIsPressed = true;
  });
  audio.addEventListener('ended', () => {
    if (autoplayCheckbox.checked) {
      audio.addEventListener('loadeddata', controller.playWhenLoaded);
      nextButton.click();
    } else {
      controller.setReadingVerse(null);
      controller.lastTimestampVerse = 0;
    }
  });
  audio.addEventListener('timeupdate', () => controller.updateAudioTime());
}

function bindSlider(controller) {
  const { sliderHandle, slider } = controller.refs;
  controller.documentPointerMove = (event) => controller.seekToClientX(event.clientX);
  controller.documentPointerUp = () => {
    controller.isDraggingSliderHandle = false;
    document.removeEventListener('pointermove', controller.documentPointerMove);
    document.removeEventListener('pointerup', controller.documentPointerUp);
    document.removeEventListener('pointercancel', controller.documentPointerUp);
  };
  sliderHandle.style.touchAction = 'none';
  sliderHandle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    controller.isDraggingSliderHandle = true;
    document.addEventListener('pointermove', controller.documentPointerMove);
    document.addEventListener('pointerup', controller.documentPointerUp);
    document.addEventListener('pointercancel', controller.documentPointerUp);
  });
  slider.addEventListener('click', (event) => controller.seekToClientX(event.clientX));
}

export function bindAudioControllerEvents(controller) {
  bindOptions(controller);
  bindControls(controller);
  bindAudioState(controller);
  bindSlider(controller);
}

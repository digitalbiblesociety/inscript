import pauseSvg from '../../css/images/audio/pause-icon.svg?raw';
import { playSvg } from './DeafVideoUi.js';

function bindPlaybackEvents(controller) {
  const { video, preloadVideo, playButton, buffering, autoplayCheckbox } = controller.refs;
  controller.handlePlaying = () => {
    playButton.innerHTML = pauseSvg;
    playButton.classList.add('playing');
    buffering.classList.remove('active');
    document.querySelectorAll('audio,video').forEach((media) => {
      if (media !== video && media !== preloadVideo && !media.paused && !media.ended) media.pause();
    });
  };
  controller.handlePaused = () => {
    playButton.innerHTML = playSvg;
    playButton.classList.remove('playing');
  };
  video.addEventListener('loadedmetadata', () => controller.applyPending());
  video.addEventListener('play', controller.handlePlaying);
  video.addEventListener('playing', controller.handlePlaying);
  video.addEventListener('pause', controller.handlePaused);
  video.addEventListener('timeupdate', () => controller.updatePlayhead());
  video.addEventListener('waiting', () => buffering.classList.add('active'));
  video.addEventListener('canplay', () => {
    buffering.classList.remove('active');
    controller.consecutiveErrors = 0;
  });
  video.addEventListener('ended', () => {
    controller.handlePaused();
    if (autoplayCheckbox.checked) controller.goNext(true);
  });
  video.addEventListener('error', () => handlePlaybackError(controller));
}

function handlePlaybackError(controller) {
  const { video, buffering } = controller.refs;
  if (!controller.currentItem || !video.getAttribute('src')) return;
  buffering.classList.remove('active');
  const alternate = controller.quality === 'high'
    ? controller.currentItem.urlLow
    : controller.currentItem.urlHigh;
  if (alternate && video.getAttribute('src') !== alternate) {
    video.src = alternate;
    video.load();
    return;
  }
  controller.consecutiveErrors++;
  if (controller.consecutiveErrors <= 3) controller.goNext(true);
}

function bindSeekEvents(controller) {
  const { track, markersLayer, handle } = controller.refs;
  track.addEventListener('click', (event) => {
    if (!event.target.classList.contains('deaf-marker')) {
      controller.seekToFraction(controller.fractionFromEvent(event.clientX));
    }
  });
  markersLayer.addEventListener('click', (event) => {
    const marker = event.target.closest('.deaf-marker');
    if (!marker) return;
    event.stopPropagation();
    controller.setCurrentIndex(parseInt(marker.dataset.index, 10), {
      autoplay: !controller.refs.video.paused
    });
  });
  controller.onDragMove = (event) => {
    if (!controller.isDragging) return;
    const fraction = Math.max(0, Math.min(1, controller.fractionFromEvent(event.clientX)));
    handle.style.left = `${fraction * 100}%`;
  };
  controller.onDragUp = (event) => {
    if (!controller.isDragging) return;
    controller.isDragging = false;
    document.removeEventListener('mousemove', controller.onDragMove);
    document.removeEventListener('mouseup', controller.onDragUp);
    controller.seekToFraction(controller.fractionFromEvent(event.clientX));
  };
  handle.addEventListener('mousedown', (event) => {
    event.preventDefault();
    controller.isDragging = true;
    document.addEventListener('mousemove', controller.onDragMove);
    document.addEventListener('mouseup', controller.onDragUp);
  });
}

function bindOptionEvents(controller) {
  const { optionsPanel, optionsButton, qualityLow, qualityHigh, fullscreenButton, stage } = controller.refs;
  controller.docClick = (event) => {
    if (optionsPanel.contains(event.target) || event.target === optionsButton || optionsButton.contains(event.target)) return;
    optionsPanel.style.display = 'none';
    document.removeEventListener('click', controller.docClick);
  };
  optionsButton.addEventListener('click', () => {
    const open = optionsPanel.style.display === 'none';
    optionsPanel.style.display = open ? '' : 'none';
    if (open) setTimeout(() => document.addEventListener('click', controller.docClick));
    else document.removeEventListener('click', controller.docClick);
  });
  const changeQuality = () => {
    controller.quality = qualityHigh.checked ? 'high' : 'low';
    if (!controller.currentItem) return;
    controller.pendingSeekSec = controller.refs.video.currentTime;
    controller.pendingAutoplay = !controller.refs.video.paused;
    controller.refs.video.src = controller.urlFor(controller.currentItem);
    controller.refs.video.load();
    controller.preloadNext();
  };
  qualityLow.addEventListener('change', changeQuality);
  qualityHigh.addEventListener('change', changeQuality);
  fullscreenButton.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else stage.requestFullscreen?.();
  });
}

function bindNavigationEvents(controller) {
  const { playButton, prevButton, nextButton, chapterStrip, player, video } = controller.refs;
  playButton.addEventListener('click', () => controller.togglePlay());
  prevButton.addEventListener('click', () => controller.goPrev());
  nextButton.addEventListener('click', () => controller.goNext(!video.paused));
  chapterStrip.addEventListener('click', (event) => {
    const button = event.target.closest('.deaf-strip-chapter');
    if (!button) return;
    const index = controller.playlist?.indexOfSection(button.dataset.sectionid) ?? -1;
    if (index > -1) controller.setCurrentIndex(index, { autoplay: !video.paused });
  });
  player.addEventListener('keydown', (event) => handleKeyboard(controller, event));
}

function handleKeyboard(controller, event) {
  if (event.target.tagName === 'INPUT') return;
  const { video } = controller.refs;
  if (event.key === ' ' || event.key === 'k') {
    event.preventDefault();
    controller.togglePlay();
  } else if (event.key === 'ArrowRight') {
    try { video.currentTime += 5; } catch { /* ignore */ }
  } else if (event.key === 'ArrowLeft') {
    try { video.currentTime -= 5; } catch { /* ignore */ }
  } else if (event.key === 'n') controller.goNext(!video.paused);
  else if (event.key === 'p') controller.goPrev();
}

export function bindDeafVideoEvents(controller) {
  bindPlaybackEvents(controller);
  bindSeekEvents(controller);
  bindOptionEvents(controller);
  bindNavigationEvents(controller);
}

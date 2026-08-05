import { offset, secondsToTimeCode } from '../lib/helpers.esm.js';

export function setReadingVerse(controller, verse) {
  controller.refs.containerElement.querySelectorAll('.v.audio-reading')
    .forEach((element) => element.classList.remove('audio-reading'));
  if (verse) verse.classList.add('audio-reading');
}

function scrollPaneTo(controller, pane, scrollTop) {
  if (controller.scroller?.setScrollTop) controller.scroller.setScrollTop(scrollTop);
  else pane.scrollTop = scrollTop;
}

export function syncTextToTimestamps(controller, pane) {
  let currentVerse = 1;
  for (const timestamp of controller.fragmentAudioData.timestamps) {
    if (controller.refs.audio.currentTime < timestamp.time) break;
    currentVerse = timestamp.verse;
  }
  if (currentVerse === controller.lastTimestampVerse) return;
  controller.lastTimestampVerse = currentVerse;
  const verse = controller.sectionNode.querySelector(`.v[data-id="${controller.sectionid}_${currentVerse}"]`);
  controller.setReadingVerse(verse);
  if (!verse) return;
  const scrollTop = offset(verse).top - offset(pane).top + pane.scrollTop;
  scrollPaneTo(controller, pane, scrollTop);
}

export function syncTextToEstimate(controller, pane) {
  const { audio } = controller.refs;
  const section = controller.sectionNode;
  controller.sectionHeight = section.offsetHeight;
  const chapter = parseInt(controller.sectionid.substring(2), 10);
  const skipSeconds = chapter === 1 ? 10 : 8;
  const fraction = (audio.currentTime - skipSeconds) / (audio.duration - skipSeconds);
  const sectionTop = offset(section).top - offset(pane).top + pane.scrollTop;
  const firstVerse = section.querySelector('.v');
  const lastVerse = section.querySelector('.v:last-child');
  let scrollOffset = controller.sectionHeight * fraction
    - (firstVerse?.offsetHeight ?? 0)
    - ((lastVerse?.offsetHeight ?? 0) * fraction);
  if (scrollOffset <= 0) scrollOffset = 0;
  const target = sectionTop + scrollOffset;
  if (Math.abs(target - pane.scrollTop) > 4) scrollPaneTo(controller, pane, target);
}

export function updateAudioTime(controller) {
  const { audio, currenttime, duration, sliderCurrent, sliderHandle,
    scrollCheckbox, toggleButtonElement, containerElement } = controller.refs;
  currenttime.innerHTML = secondsToTimeCode(audio.currentTime);
  duration.innerHTML = secondsToTimeCode(audio.duration);
  const percent = audio.currentTime / audio.duration * 100;
  sliderCurrent.style.width = `${percent}%`;
  if (!controller.isDraggingSliderHandle) sliderHandle.style.left = `${percent}%`;
  if (!scrollCheckbox.checked || !toggleButtonElement) return;
  controller.sectionNode ||= containerElement.querySelector(`.section[data-id="${controller.sectionid}"]`);
  if (!controller.sectionNode) return;
  const pane = containerElement.querySelector('.scroller-main');
  if (!pane) return;
  if (controller.fragmentAudioData?.timestamps) controller.syncTextToTimestamps(pane);
  else controller.syncTextToEstimate(pane);
}

export function seekToClientX(controller, clientX) {
  const { audio, slider, sliderHandle } = controller.refs;
  if (!isFinite(audio.duration) || audio.duration <= 0 || slider.offsetWidth <= 0) return;
  const fraction = Math.min(1, Math.max(0, (clientX - offset(slider).left) / slider.offsetWidth));
  sliderHandle.style.left = `${fraction * 100}%`;
  audio.currentTime = fraction * audio.duration;
}

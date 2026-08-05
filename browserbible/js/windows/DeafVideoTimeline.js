import { elem, secondsToTimeCode } from '../lib/helpers.esm.js';
import { Reference } from '../bible/BibleReference.js';

export function buildPlaybar(controller) {
  const { markersLayer } = controller.refs;
  markersLayer.innerHTML = '';
  if (!controller.currentChapterTimeline) return;
  for (const marker of controller.currentChapterTimeline.markers) {
    const tick = elem('span', {
      className: 'deaf-marker', title: marker.item.reference,
      style: { left: `${marker.startFraction * 100}%` }
    });
    tick.dataset.index = String(marker.item.index);
    if (marker.item.index === controller.currentIndex) tick.classList.add('active');
    markersLayer.appendChild(tick);
  }
}

export const currentSegment = (controller) => controller.currentChapterTimeline?.markers
  .find((marker) => marker.item.index === controller.currentIndex) ?? null;

export function updatePlayhead(controller) {
  const segment = currentSegment(controller);
  const total = controller.currentChapterTimeline?.total ?? 0;
  if (!segment || total <= 0) {
    controller.refs.progress.style.width = '0%';
    if (!controller.isDragging) controller.refs.handle.style.left = '0%';
    return;
  }
  const { video, progress, handle, currenttime, duration } = controller.refs;
  const withinSegment = Math.min(video.currentTime || 0, segment.item.durationSec || video.duration || 0);
  const elapsed = segment.startSec + withinSegment;
  const fraction = Math.max(0, Math.min(1, elapsed / total));
  progress.style.width = `${fraction * 100}%`;
  if (!controller.isDragging) handle.style.left = `${fraction * 100}%`;
  currenttime.textContent = secondsToTimeCode(elapsed);
  duration.textContent = secondsToTimeCode(total);
}

export function buildChapterStrip(controller) {
  const { chapterStrip } = controller.refs;
  chapterStrip.innerHTML = '';
  if (!controller.playlist || !controller.currentItem) return;
  chapterStrip.appendChild(elem('span', { className: 'deaf-strip-book' }, controller.currentItem.book));
  for (const sectionid of controller.playlist.sectionsForBook(controller.currentBookid)) {
    const button = elem('button', {
      className: 'deaf-strip-chapter', type: 'button',
      title: Reference(sectionid)?.toString() ?? sectionid
    }, sectionid.substring(2));
    button.dataset.sectionid = sectionid;
    if (sectionid === controller.currentItem.sectionid) button.classList.add('active');
    chapterStrip.appendChild(button);
  }
  chapterStrip.querySelector('.deaf-strip-chapter.active')
    ?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

export function updateChapterMarkers(controller, item, index, sectionChanged) {
  if (sectionChanged) {
    controller.currentChapterTimeline = controller.playlist.chapterTimeline(item.sectionid);
    controller.buildPlaybar();
    return;
  }
  controller.refs.markersLayer.querySelectorAll('.deaf-marker.active')
    .forEach((marker) => marker.classList.remove('active'));
  controller.refs.markersLayer.querySelector(`.deaf-marker[data-index="${index}"]`)?.classList.add('active');
}

export function fractionFromEvent(controller, clientX) {
  const rectangle = controller.refs.track.getBoundingClientRect();
  return rectangle.width > 0 ? (clientX - rectangle.left) / rectangle.width : 0;
}

export function seekToFraction(controller, fraction) {
  if (!controller.currentChapterTimeline) return;
  const timeline = controller.currentChapterTimeline;
  const target = Math.max(0, Math.min(1, fraction)) * timeline.total;
  const segment = timeline.markers.find((marker) => target >= marker.startSec && target < marker.endSec)
    ?? timeline.markers[timeline.markers.length - 1];
  if (!segment) return;
  const withinSegment = target - segment.startSec;
  if (segment.item.index === controller.currentIndex) {
    try { controller.refs.video.currentTime = withinSegment; } catch { /* ignore */ }
  } else {
    controller.setCurrentIndex(segment.item.index, {
      seekSec: withinSegment, autoplay: !controller.refs.video.paused
    });
  }
}

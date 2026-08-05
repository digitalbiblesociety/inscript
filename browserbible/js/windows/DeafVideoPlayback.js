import { getPlaylist } from '../texts/DeafBibleTextProvider.js';
import { DeafPlaylist } from './DeafPlaylist.js';

const MAX_CONSECUTIVE_SKIPS = 3;

export function ensurePlaylist(controller) {
  if (controller.playlist && controller.playlistTextId === controller.textInfo?.id) {
    return Promise.resolve(controller.playlist);
  }
  if (controller.playlistPromise && controller.playlistTextId === controller.textInfo?.id) {
    return controller.playlistPromise;
  }
  const requestedId = controller.textInfo?.id;
  controller.playlistTextId = requestedId;
  controller.playlistPromise = getPlaylist(requestedId).then((passages) => {
    const playlist = DeafPlaylist(passages);
    if (playlist.isEmpty) {
      if (controller.playlistTextId === requestedId) {
        controller.playlist = null;
        controller.playlistPromise = null;
        controller.playlistTextId = null;
      }
      return playlist;
    }
    controller.playlist = playlist;
    return playlist;
  });
  return controller.playlistPromise;
}

export const urlFor = (controller, item) =>
  (controller.quality === 'high' ? item.urlHigh : item.urlLow) || item.urlHigh || item.urlLow || '';

export function applyPending(controller) {
  if (controller.pendingSeekSec > 0) {
    try { controller.refs.video.currentTime = controller.pendingSeekSec; } catch { /* ignore */ }
  }
  controller.pendingSeekSec = 0;
  if (controller.pendingAutoplay) {
    controller.pendingAutoplay = false;
    controller.refs.video.play().catch(() => {});
  }
}

export function emitLocation(controller, broadcast) {
  const item = controller.currentItem;
  if (!item) return;
  controller.locationInfo = {
    sectionid: item.sectionid,
    fragmentid: item.fragmentid,
    label: item.reference,
    labelLong: `${item.reference} (${item.book})`,
    offset: 0
  };
  controller.trigger('locationchange', {
    type: 'locationchange', target: controller, data: controller.locationInfo
  });
  if (broadcast) {
    controller.trigger('globalmessage', {
      type: 'globalmessage', target: controller,
      data: { messagetype: 'nav', type: 'deafbible', locationInfo: controller.locationInfo }
    });
  }
}

function seekAndMaybePlay(controller, seconds, autoplay) {
  if (seconds > 0) {
    try { controller.refs.video.currentTime = seconds; } catch { /* ignore */ }
  }
  if (autoplay) controller.refs.video.play().catch(() => {});
}

function loadItemMedia(controller, item, options) {
  const { autoplay, seekSec, suppressBroadcast } = options;
  const url = controller.urlFor(item);
  const { video } = controller.refs;
  if (!url) {
    if (video.getAttribute('src')) {
      video.removeAttribute('src');
      video.load();
    }
    controller.consecutiveErrors++;
    const nextIndex = controller.playlist.next(controller.currentIndex);
    if (controller.consecutiveErrors <= MAX_CONSECUTIVE_SKIPS && nextIndex > -1) {
      controller.setCurrentIndex(nextIndex, { autoplay, suppressBroadcast });
      return false;
    }
    return true;
  }
  if (video.getAttribute('src') !== url) {
    controller.pendingSeekSec = seekSec;
    controller.pendingAutoplay = autoplay;
    video.poster = item.poster || '';
    video.src = url;
    video.load();
  } else {
    seekAndMaybePlay(controller, seekSec, autoplay);
  }
  return true;
}

export function setCurrentIndex(controller, index, options = {}) {
  const { autoplay = false, seekSec = 0, suppressBroadcast = false } = options;
  if (!controller.playlist) return;
  const item = controller.playlist.get(index);
  if (!item) return;
  const itemChanged = !controller.currentItem || controller.currentItem.index !== item.index;
  const sectionChanged = !controller.currentItem || controller.currentItem.sectionid !== item.sectionid;
  const bookChanged = controller.currentBookid !== item.bookid;
  controller.currentIndex = index;
  controller.currentItem = item;
  controller.currentBookid = item.bookid;
  controller.refs.passageTitle.textContent = item.reference;
  if (itemChanged) {
    if (!loadItemMedia(controller, item, { autoplay, seekSec, suppressBroadcast })) return;
    controller.preloadNext();
  } else if (seekSec > 0) {
    seekAndMaybePlay(controller, seekSec, autoplay);
  }
  controller.updateChapterMarkers(item, index, sectionChanged);
  if (bookChanged || sectionChanged) controller.buildChapterStrip();
  controller.updatePlayhead();
  controller.emitLocation(!suppressBroadcast);
}

export function preloadNext(controller) {
  const nextIndex = controller.playlist?.next(controller.currentIndex) ?? -1;
  const nextItem = nextIndex > -1 ? controller.playlist.get(nextIndex) : null;
  const url = nextItem ? controller.urlFor(nextItem) : '';
  if (url && controller.refs.preloadVideo.getAttribute('src') !== url) {
    controller.refs.preloadVideo.src = url;
  }
}

export function togglePlay(controller) {
  const { video } = controller.refs;
  if (!video.getAttribute('src')) {
    if (controller.currentItem) {
      controller.setCurrentIndex(controller.currentIndex, { autoplay: true, suppressBroadcast: true });
    }
    return;
  }
  if (video.paused || video.ended) video.play().catch(() => {});
  else video.pause();
}

export function goPrev(controller) {
  const index = controller.playlist?.prev(controller.currentIndex) ?? -1;
  if (index > -1) controller.setCurrentIndex(index, { autoplay: !controller.refs.video.paused });
}

export function goNext(controller, autoplay) {
  const index = controller.playlist?.next(controller.currentIndex) ?? -1;
  if (index > -1) controller.setCurrentIndex(index, { autoplay });
}

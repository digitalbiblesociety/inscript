export function setTextInfo(controller, textInfo) {
  if (controller.textInfo && textInfo && controller.textInfo.id === textInfo.id) return;
  Object.assign(controller, {
    textInfo,
    playlist: null,
    playlistPromise: null,
    playlistTextId: null,
    currentIndex: -1,
    currentItem: null,
    currentChapterTimeline: null,
    currentBookid: null,
    locationInfo: null
  });
  const { video, passageTitle, markersLayer, chapterStrip } = controller.refs;
  if (!video.paused) {
    try { video.pause(); } catch { /* ignore */ }
  }
  video.removeAttribute('src');
  video.load();
  passageTitle.textContent = '';
  markersLayer.innerHTML = '';
  chapterStrip.innerHTML = '';
}

export function load(controller, sectionid, fragmentid) {
  const epoch = ++controller.loadEpoch;
  controller.ensurePlaylist().then((playlist) => {
    if (epoch !== controller.loadEpoch || !playlist) return;
    if (playlist.isEmpty) {
      controller.refs.passageTitle.textContent = 'Videos are unavailable right now. Check your connection and try again.';
      return;
    }
    controller.refs.passageTitle.textContent = '';
    let index = fragmentid ? playlist.indexOfFragment(fragmentid) : -1;
    if (index < 0 && sectionid) index = playlist.indexOfSection(sectionid);
    if (index < 0) index = 0;
    controller.setCurrentIndex(index, { autoplay: false, suppressBroadcast: true });
    controller.trigger('load', { type: 'load', target: controller, data: controller.locationInfo });
  });
}

export function close(controller) {
  controller.clearListeners();
  document.removeEventListener('click', controller.docClick);
  document.removeEventListener('mousemove', controller.onDragMove);
  document.removeEventListener('mouseup', controller.onDragUp);
  const { video, preloadVideo, player } = controller.refs;
  if (!video.paused) {
    try { video.pause(); } catch { /* ignore */ }
  }
  video.removeAttribute('src');
  preloadVideo.removeAttribute('src');
  player.remove();
}

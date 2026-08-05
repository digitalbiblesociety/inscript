// Single continuous <video> player; a Scroller-compatible drop-in for DeafBibleWindow.

import { mixinEventEmitter } from '../common/EventEmitter.js';
import { bindDeafVideoEvents } from './DeafVideoEvents.js';
import {
  applyPending, emitLocation, ensurePlaylist, goNext, goPrev,
  preloadNext, setCurrentIndex, togglePlay, urlFor
} from './DeafVideoPlayback.js';
import { close, load, setTextInfo } from './DeafVideoLifecycle.js';
import {
  buildChapterStrip, buildPlaybar, fractionFromEvent, seekToFraction,
  updateChapterMarkers, updatePlayhead
} from './DeafVideoTimeline.js';
import { buildDeafVideoUi } from './DeafVideoUi.js';

class DeafVideoController {
  constructor(node) {
    this.refs = buildDeafVideoUi(node);
    this.textInfo = null;
    this.playlist = null;
    this.playlistPromise = null;
    this.playlistTextId = null;
    this.loadEpoch = 0;
    this.currentIndex = -1;
    this.currentItem = null;
    this.currentChapterTimeline = null;
    this.currentBookid = null;
    this.locationInfo = null;
    this.quality = 'low';
    this.isDragging = false;
    this.pendingSeekSec = 0;
    this.pendingAutoplay = false;
    this.consecutiveErrors = 0;
    mixinEventEmitter(this);
    this._events = {};
    bindDeafVideoEvents(this);
  }

  ensurePlaylist() {
    return ensurePlaylist(this);
  }

  urlFor(item) {
    return urlFor(this, item);
  }

  applyPending() {
    applyPending(this);
  }

  emitLocation(broadcast) {
    emitLocation(this, broadcast);
  }

  buildPlaybar() {
    buildPlaybar(this);
  }

  updatePlayhead() {
    updatePlayhead(this);
  }

  buildChapterStrip() {
    buildChapterStrip(this);
  }

  updateChapterMarkers(item, index, sectionChanged) {
    updateChapterMarkers(this, item, index, sectionChanged);
  }

  setCurrentIndex(index, options) {
    setCurrentIndex(this, index, options);
  }

  preloadNext() {
    preloadNext(this);
  }

  togglePlay() {
    togglePlay(this);
  }

  goPrev() {
    goPrev(this);
  }

  goNext(autoplay) {
    goNext(this, autoplay);
  }

  seekToFraction(fraction) {
    seekToFraction(this, fraction);
  }

  fractionFromEvent(clientX) {
    return fractionFromEvent(this, clientX);
  }

  setTextInfo(textInfo) {
    setTextInfo(this, textInfo);
  }

  load(_loadType, sectionid, fragmentid) {
    load(this, sectionid, fragmentid);
  }

  scrollTo(fragmentid) {
    if (fragmentid == null || !this.playlist) return;
    const index = this.playlist.indexOfFragment(fragmentid);
    if (index > -1) this.setCurrentIndex(index, { autoplay: false, suppressBroadcast: true });
  }

  broadcastCurrentContent() {
    if (this.currentItem) this.emitLocation(true);
  }

  getLocationInfo() {
    return this.locationInfo;
  }

  getTextInfo() {
    return this.textInfo;
  }

  setFocus() {}

  size() {}

  close() {
    close(this);
  }
}

export function DeafVideoPlayer(node) {
  return new DeafVideoController(node);
}

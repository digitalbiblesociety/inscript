// Controls audio playback synchronized with text scrolling.

import { mixinEventEmitter } from '../common/EventEmitter.js';
import { AudioDataManager } from '../media/AudioDataManager.js';
import { bindAudioControllerEvents } from './AudioControllerEvents.js';
import { buildAudioControllerUi, playSvg } from './AudioControllerUi.js';
import {
  handleAudioInfoResult, loadAudio, playWhenLoaded, setTextInfo,
  skipToFragment, togglePlayback, updateDramatic
} from './AudioPlayback.js';
import {
  seekToClientX, setReadingVerse, syncTextToEstimate, syncTextToTimestamps,
  updateAudioTime
} from './AudioSync.js';

class AudioControllerInstance {
  constructor(id, container, toggleButton, scroller) {
    this.refs = buildAudioControllerUi(id, container, toggleButton);
    this.scroller = scroller;
    this.audioDataManager = new AudioDataManager();
    this.playIcon = playSvg;
    this.isDraggingSliderHandle = false;
    this.textInfo = null;
    this.audioInfo = null;
    this.locationInfo = null;
    this.sectionid = '';
    this.fragmentid = '';
    this.fragmentAudioData = null;
    this.loadAudioWhenPlayIsPressed = false;
    this.sectionHeight = 0;
    this.sectionNode = null;
    this.hasAudio = false;
    this.lastTimestampVerse = 0;
    this.audioRequestId = 0;
    mixinEventEmitter(this);
    bindAudioControllerEvents(this);
  }

  updateDramatic() {
    updateDramatic(this);
  }

  togglePlayback() {
    togglePlayback(this);
  }

  skipToFragment(getFragment) {
    skipToFragment(this, getFragment);
  }

  loadAudio(fragmentid) {
    loadAudio(this, fragmentid);
  }

  playWhenLoaded = () => {
    playWhenLoaded(this);
  };

  setReadingVerse(verse) {
    setReadingVerse(this, verse);
  }

  syncTextToTimestamps(pane) {
    syncTextToTimestamps(this, pane);
  }

  syncTextToEstimate(pane) {
    syncTextToEstimate(this, pane);
  }

  updateAudioTime() {
    updateAudioTime(this);
  }

  seekToClientX(clientX) {
    seekToClientX(this, clientX);
  }

  handleAudioInfoResult(info) {
    handleAudioInfoResult(this, info);
  }

  setTextInfo(textInfo) {
    setTextInfo(this, textInfo);
  }

  size(width) {
    this.refs.block.style.width = `${width}px`;
  }

  close() {
    this.clearListeners();
    document.removeEventListener('click', this.docClick);
    this.isDraggingSliderHandle = false;
    document.removeEventListener('pointermove', this.documentPointerMove);
    document.removeEventListener('pointerup', this.documentPointerUp);
    document.removeEventListener('pointercancel', this.documentPointerUp);
    this.refs.block?.remove();
    this.refs.options?.remove();
    this.refs.block = null;
    this.refs.options = null;
  }
}

export function AudioController(id, container, toggleButton, scroller) {
  return new AudioControllerInstance(id, container, toggleButton, scroller);
}

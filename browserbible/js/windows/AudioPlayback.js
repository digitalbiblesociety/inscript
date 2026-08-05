import { Reference } from '../bible/BibleReference.js';
import { secondsToTimeCode } from '../lib/helpers.esm.js';

export function playWhenLoaded(controller) {
  const { audio, playButton } = controller.refs;
  audio.play().catch(() => {
    playButton.innerHTML = controller.playIcon;
    playButton.classList.remove('playing');
  });
  audio.removeEventListener('loadeddata', controller.playWhenLoaded);
}

export function updateDramatic(controller) {
  const storedFragmentid = controller.fragmentid;
  controller.fragmentid = '';
  controller.sectionid = '';
  controller.fragmentAudioData = null;
  controller.loadAudioWhenPlayIsPressed = false;
  const { audio } = controller.refs;
  if (!audio.paused && !audio.ended) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  audio.addEventListener('loadeddata', controller.playWhenLoaded);
  controller.loadAudio(storedFragmentid);
}

export function togglePlayback(controller) {
  const { audio, playButton } = controller.refs;
  if (!audio.getAttribute('src')) {
    if (controller.loadAudioWhenPlayIsPressed) {
      audio.src = controller.fragmentAudioData.url;
      audio.load();
      audio.addEventListener('loadeddata', controller.playWhenLoaded);
      controller.loadAudioWhenPlayIsPressed = false;
    }
    return;
  }
  if (audio.paused || audio.ended) {
    audio.play().catch(() => {
      playButton.innerHTML = controller.playIcon;
      playButton.classList.remove('playing');
    });
  } else {
    audio.pause();
  }
}

export function skipToFragment(controller, getFragment) {
  getFragment(controller.textInfo, controller.audioInfo, controller.fragmentid, (fragmentid) => {
    if (fragmentid == null) return;
    if (controller.refs.scrollCheckbox.checked && controller.scroller?.load) {
      controller.scroller.load('text', fragmentid.split('_')[0], fragmentid);
    }
    if (controller.fragmentAudioData == null || fragmentid !== controller.fragmentAudioData.fragmentid) {
      controller.loadAudio(fragmentid);
      controller.refs.audio.addEventListener('loadeddata', controller.playWhenLoaded);
    }
  });
}

function audioOption(controller) {
  if (controller.refs.dramaticDrama.checked) return 'drama';
  if (controller.refs.dramaticAudio.checked) return 'audio';
  return '';
}

function showNoAudio(controller, data) {
  const { audio, title, toggleButtonElement, block } = controller.refs;
  audio.removeEventListener('loadeddata', controller.playWhenLoaded);
  audio.removeAttribute('src');
  title.innerHTML = '[No audio]';
  if (toggleButtonElement) {
    toggleButtonElement.style.display = 'none';
    block.style.display = 'none';
  }
  controller.fragmentAudioData = data;
}

function applyFragmentAudio(controller, data) {
  if (controller.fragmentAudioData?.id === data?.id) return;
  controller.setReadingVerse(null);
  if (!data?.url) {
    showNoAudio(controller, data);
    return;
  }
  const { audio, toggleButtonElement, block, containerElement, title, subtitle } = controller.refs;
  if (toggleButtonElement) toggleButtonElement.style.display = '';
  controller.fragmentAudioData = data;
  controller.lastTimestampVerse = 0;
  if (block.style.display !== 'none') {
    audio.src = data.url;
    audio.load();
  } else {
    controller.loadAudioWhenPlayIsPressed = true;
  }
  controller.sectionNode = containerElement.querySelector(`.section[data-id="${controller.sectionid}"]`);
  controller.sectionHeight = controller.sectionNode?.offsetHeight ?? 0;
  title.innerHTML = Reference(controller.sectionid)?.toString() ?? controller.sectionid;
  subtitle.innerHTML = controller.audioInfo.title;
}

export function loadAudio(controller, fragmentid) {
  if (!controller.hasAudio || fragmentid === undefined || controller.fragmentid === fragmentid) return;
  controller.fragmentid = fragmentid;
  const sectionid = fragmentid.split('_')[0];
  const loadNewData = controller.audioInfo.pericopeBased || sectionid !== controller.sectionid;
  controller.sectionid = sectionid;
  if (!loadNewData) return;
  const requestId = ++controller.audioRequestId;
  controller.audioDataManager.getFragmentAudio(
    controller.textInfo, controller.audioInfo, fragmentid, audioOption(controller), (data) => {
      if (!controller.refs.block || requestId !== controller.audioRequestId) return;
      applyFragmentAudio(controller, data);
    }
  );
}

function configureDramaOptions(controller, hasNonDrama, hasDrama) {
  const { dramaticBox, dramaticAudio, dramaticDrama } = controller.refs;
  dramaticBox.style.display = '';
  const both = hasNonDrama && hasDrama;
  dramaticAudio.disabled = !both;
  dramaticDrama.disabled = !both;
  dramaticAudio.checked = hasNonDrama;
  dramaticDrama.checked = !hasNonDrama;
}

function configureAudioType(controller, info) {
  if (info.type === 'local' || info.type === 'dbs') {
    controller.refs.dramaticBox.style.display = 'none';
  } else if (info.type === 'biblebrain') {
    configureDramaOptions(controller, info.hasPlainAudio, info.hasDramaAudio);
  } else if (info.type === 'fcbh') {
    const plain = Boolean(info.fcbh_audio_nt || info.fcbh_audio_ot);
    const drama = Boolean(info.fcbh_drama_nt || info.fcbh_drama_ot);
    configureDramaOptions(controller, plain, drama);
  }
}

function initializePlayback(controller) {
  if (controller.fragmentid) {
    const fragmentid = controller.fragmentid;
    controller.fragmentid = '';
    controller.loadAudio(fragmentid);
    return;
  }
  controller.locationInfo = controller.scroller.getLocationInfo();
  if (controller.locationInfo) controller.loadAudio(controller.locationInfo.fragmentid);
}

export function handleAudioInfoResult(controller, info) {
  if (!info) {
    controller.hasAudio = false;
    controller.refs.audio.removeEventListener('loadeddata', controller.playWhenLoaded);
    if (controller.refs.toggleButtonElement) {
      controller.refs.toggleButtonElement.style.display = 'none';
      controller.refs.block.style.display = 'none';
    }
    controller.trigger('audioavailable', { type: 'audioavailable', data: { hasAudio: false } });
    return;
  }
  controller.audioInfo = info;
  controller.hasAudio = true;
  controller.sectionid = '';
  controller.fragmentAudioData = null;
  configureAudioType(controller, info);
  initializePlayback(controller);
  controller.trigger('audioavailable', { type: 'audioavailable', data: { hasAudio: true } });
}

export function setTextInfo(controller, textInfo) {
  if (controller.textInfo?.id === textInfo.id) return;
  const { title, subtitle, sliderCurrent, sliderHandle, currenttime, duration, audio } = controller.refs;
  title.innerHTML = '';
  subtitle.innerHTML = '';
  sliderCurrent.style.left = '0%';
  sliderHandle.style.left = '0%';
  currenttime.innerHTML = secondsToTimeCode(0);
  duration.innerHTML = secondsToTimeCode(0);
  controller.textInfo = textInfo;
  const requestId = ++controller.audioRequestId;
  if (!audio.paused && !audio.ended) {
    try { audio.pause(); } catch { /* ignore */ }
  }
  audio.removeEventListener('loadeddata', controller.playWhenLoaded);
  audio.removeAttribute('src');
  audio.load();
  if (textInfo.type === 'bible') {
    controller.audioDataManager.getAudioInfo(textInfo, (info) => {
      if (!controller.refs.block || requestId !== controller.audioRequestId) return;
      controller.handleAudioInfoResult(info);
    });
  }
}

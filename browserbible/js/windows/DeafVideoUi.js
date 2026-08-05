import { elem } from '../lib/helpers.esm.js';
import playSvg from '../../css/images/audio/play-icon.svg?raw';
import prevSvg from '../../css/images/audio/previous-icon.svg?raw';
import nextSvg from '../../css/images/audio/next-icon.svg?raw';
import gearSvg from '../../css/images/gear.svg?raw';

const fullscreenSvg = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M4 4h6V2H2v8h2V4zm16 0v6h2V2h-8v2h6zM4 20v-6H2v8h8v-2H4zm16-6v6h-6v2h8v-8h-2z"/></svg>';

export { playSvg };

export function buildDeafVideoUi(node) {
  const nodeElement = node?.nodeType ? node : node?.[0];
  nodeElement.innerHTML = '';
  const video = elem('video', { className: 'deaf-video', playsInline: true, preload: 'metadata' });
  const preloadVideo = elem('video', { className: 'deaf-preload', preload: 'auto', style: { display: 'none' } });
  const passageTitle = elem('div', { className: 'deaf-passage-title' });
  const buffering = elem('div', { className: 'deaf-buffering' });
  const stage = elem('div', { className: 'deaf-stage' }, video, preloadVideo, passageTitle, buffering);
  const prevButton = elem('button', { className: 'deaf-btn deaf-prev', type: 'button', title: 'Previous', innerHTML: prevSvg });
  const playButton = elem('button', { className: 'deaf-btn deaf-play', type: 'button', title: 'Play/Pause', innerHTML: playSvg });
  const nextButton = elem('button', { className: 'deaf-btn deaf-next', type: 'button', title: 'Next', innerHTML: nextSvg });
  const currenttime = elem('span', { className: 'deaf-currenttime' }, '00:00');
  const duration = elem('span', { className: 'deaf-duration' }, '00:00');
  const progress = elem('div', { className: 'deaf-playbar-progress' });
  const handle = elem('span', { className: 'deaf-playbar-handle' });
  const markersLayer = elem('div', { className: 'deaf-playbar-markers' });
  const track = elem('div', { className: 'deaf-playbar-track' }, progress, markersLayer, handle);
  const playbar = elem('div', { className: 'deaf-playbar' }, track);
  const fullscreenButton = elem('button', { className: 'deaf-btn deaf-fullscreen', type: 'button', title: 'Fullscreen', innerHTML: fullscreenSvg });
  const optionsButton = elem('button', { className: 'deaf-btn deaf-options', type: 'button', title: 'Options', innerHTML: gearSvg });
  const controls = elem('div', { className: 'deaf-controls' },
    prevButton, playButton, nextButton, currenttime, playbar, duration, fullscreenButton, optionsButton);
  const chapterStrip = elem('div', { className: 'deaf-chapter-strip' });
  const autoplayCheckbox = elem('input', { type: 'checkbox', className: 'deaf-autoplay', checked: true });
  const qualityLow = elem('input', { type: 'radio', name: 'deaf-quality', className: 'deaf-quality-low', checked: true });
  const qualityHigh = elem('input', { type: 'radio', name: 'deaf-quality', className: 'deaf-quality-high' });
  const optionsPanel = elem('div', { className: 'deaf-options-panel', style: { display: 'none' } },
    elem('label', {}, autoplayCheckbox, elem('span', {}, 'Autoplay next')),
    elem('div', { className: 'deaf-quality-box' },
      elem('label', {}, qualityLow, elem('span', {}, 'Standard (360p)')),
      elem('label', {}, qualityHigh, elem('span', {}, 'High'))));
  const player = elem('div', { className: 'deaf-player', tabIndex: 0 },
    stage, controls, chapterStrip, optionsPanel);
  nodeElement.appendChild(player);
  return {
    nodeElement, video, preloadVideo, passageTitle, buffering, stage, prevButton,
    playButton, nextButton, currenttime, duration, progress, handle, markersLayer,
    track, fullscreenButton, optionsButton, chapterStrip, autoplayCheckbox,
    qualityLow, qualityHigh, optionsPanel, player
  };
}

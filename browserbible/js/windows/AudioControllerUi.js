import { elem } from '../lib/helpers.esm.js';
import { i18n } from '../lib/i18n.js';
import playSvg from '../../css/images/audio/play-icon.svg?raw';
import prevSvg from '../../css/images/audio/previous-icon.svg?raw';
import nextSvg from '../../css/images/audio/next-icon.svg?raw';
import gearSvg from '../../css/images/gear.svg?raw';

export { playSvg };

export function buildAudioControllerUi(id, container, toggleButton) {
  const containerElement = container?.nodeType ? container : container?.[0];
  const audio = elem('audio');
  const sliderCurrent = elem('div', { className: 'audio-slider-current' });
  const sliderLoaded = elem('div', { className: 'audio-slider-loaded' });
  const sliderHandle = elem('span', { className: 'audio-slider-handle' });
  const slider = elem('div', { className: 'audio-slider' }, sliderCurrent, sliderLoaded, sliderHandle);
  const prevButton = elem('div', { className: 'audio-prev', innerHTML: prevSvg });
  const playButton = elem('div', { className: 'audio-play', innerHTML: playSvg });
  const nextButton = elem('div', { className: 'audio-next', innerHTML: nextSvg });
  const currenttime = elem('span', { className: 'audio-currenttime' }, '00:00');
  const duration = elem('span', { className: 'audio-duration' }, '00:00');
  const title = elem('span', { className: 'audio-title' });
  const subtitle = elem('span', { className: 'audio-subtitle' });
  const optionsButton = elem('div', { className: 'audio-options-button', innerHTML: gearSvg });
  const block = elem('div', { className: 'audio-controller' }, audio, slider, prevButton,
    playButton, nextButton, currenttime, duration, title, subtitle, optionsButton);
  containerElement.appendChild(block);

  const optionsCloseButton = elem('span', { className: 'close-button' });
  const scrollCheckbox = elem('input', { type: 'checkbox', className: 'audio-scroll', checked: true });
  const autoplayCheckbox = elem('input', { type: 'checkbox', className: 'audio-autoplay', checked: true });
  const dramaticAudio = elem('input', {
    type: 'radio', name: `${id}-dramatic-option`, className: 'audio-dramatic-audio', disabled: true
  });
  const dramaticDrama = elem('input', {
    type: 'radio', name: `${id}-dramatic-option`, className: 'audio-dramatic-drama', disabled: true
  });
  const dramaticBox = elem('div', { className: 'audio-dramatic-option' },
    elem('label', {}, dramaticAudio,
      elem('span', { className: 'i18n', dataset: { i18n: '[html]windows.audio.nondrama' } })),
    elem('label', {}, dramaticDrama,
      elem('span', { className: 'i18n', dataset: { i18n: '[html]windows.audio.drama' } })));
  const options = elem('div', { className: 'audio-options' }, optionsCloseButton,
    elem('strong', { className: 'i18n', dataset: { i18n: '[html]windows.audio.options' } }),
    elem('label', {}, scrollCheckbox,
      elem('span', { className: 'i18n', dataset: { i18n: '[html]windows.audio.synctext' } })),
    elem('label', {}, autoplayCheckbox,
      elem('span', { className: 'i18n', dataset: { i18n: '[html]windows.audio.autoplay' } })),
    dramaticBox);
  containerElement.appendChild(options);
  i18n.translatePage(options);
  const toggleButtonElement = toggleButton?.nodeType ? toggleButton : toggleButton?.[0];
  if (toggleButtonElement) {
    toggleButtonElement.style.display = 'none';
    block.style.display = 'none';
  }
  options.style.display = 'none';
  return {
    containerElement, toggleButtonElement, audio, sliderCurrent, sliderLoaded,
    sliderHandle, slider, prevButton, playButton, nextButton, currenttime,
    duration, title, subtitle, optionsButton, block, optionsCloseButton,
    scrollCheckbox, autoplayCheckbox, dramaticAudio, dramaticDrama, dramaticBox,
    options
  };
}

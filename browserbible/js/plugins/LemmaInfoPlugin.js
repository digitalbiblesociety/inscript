/** Morphology info on hover over lemma elements. */

import { offset, elem } from '../lib/helpers.esm.js';
import { getConfig } from '../core/config.js';
import { morphology } from '../bible/Morphology.js';
import { delegate, supportsHover } from './PluginEvents.js';

export const LemmaInfoPlugin = () => {
  if (!getConfig().enableLemmaInfoPlugin) return {};

  const windowsMain = document.querySelector('.windows-main');
  if (!supportsHover() || !windowsMain) return {};

  const lemmaInfo = elem('div', { className: 'lemma-info', style: { display: 'none' } });
  document.body.appendChild(lemmaInfo);

  const options = { ignoreInternal: true };
  delegate(windowsMain, 'mouseover', '.BibleWindow l', (l) => {
    const main = l.closest('.scroller-main');
    if (!main) return;
    const morph = l.getAttribute('m');
    const mainOffset = offset(main);
    const section = l.closest('.section');
    const lang = section?.getAttribute('lang') ?? '';

    let morphologyType = '';
    if (lang === 'heb' || lang === 'he') {
      morphologyType = 'Hebrew';
    } else if (lang === 'el' || lang === 'grc' || lang === 'gre') {
      morphologyType = 'Greek';
    }

    const morphInfo = (morph == null || morphologyType === '') ? '' : morphology[morphologyType].format(morph);
    if (morphInfo != null && morphInfo !== '') {
      lemmaInfo.innerHTML = morphInfo;
      lemmaInfo.style.display = '';
      lemmaInfo.style.left = `${mainOffset.left + 15}px`;
      lemmaInfo.style.top = `${mainOffset.top + main.offsetHeight - lemmaInfo.offsetHeight - 10}px`;
    }
  }, options);

  delegate(windowsMain, 'mouseout', '.BibleWindow l', () => {
    lemmaInfo.style.display = 'none';
  }, options);

  return {};
};

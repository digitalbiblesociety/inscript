/** Highlights matching verses across Bible windows on hover. */

import { getConfig } from '../core/config.js';
import { delegate, supportsHover } from './PluginEvents.js';

function toggleMatches(verse, on) {
  const verseid = verse.getAttribute('data-id');
  if (!verseid) return;
  document.querySelectorAll(`.BibleWindow .${CSS.escape(verseid)}`).forEach((el) => {
    el.classList.toggle('selected-verse', on);
  });
}

export const VerseMatchPlugin = () => {
  if (!getConfig().enableVerseMatchPlugin) return {};
  if (!supportsHover()) return {};

  const windowsMain = document.querySelector('.windows-main');
  if (!windowsMain) return {};

  const selector = '.BibleWindow .verse, .BibleWindow .v';
  const options = { ignoreInternal: true };
  delegate(windowsMain, 'mouseover', selector, (verse) => toggleMatches(verse, true), options);
  delegate(windowsMain, 'mouseout', selector, (verse) => toggleMatches(verse, false), options);

  return {};
};

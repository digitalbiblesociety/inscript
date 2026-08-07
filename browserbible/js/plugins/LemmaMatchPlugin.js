/** Highlights matching Strong's numbers across Bible windows on hover. */

import { getConfig } from '../core/config.js';
import { OT_BOOKS } from '../bible/BibleData.js';
import { delegate, supportsHover } from './PluginEvents.js';

function getLangPrefix(verseid) {
  if (!verseid) return 'G';
  const bookid = verseid.substring(0, 2);
  return OT_BOOKS.includes(bookid) ? 'H' : 'G';
}

const normalizeStrong = (strong) => strong.toUpperCase()
  .replace(/^[GH]/, '')
  .replace(/[A-Z]$/, '');

function highlightStrong(strong, langPrefix, verseid) {
  const scope = verseid ? `.${CSS.escape(verseid)} ` : '';
  const target = normalizeStrong(strong);

  document.querySelectorAll(`${scope}l[s]`).forEach(el => {
    const matches = el.getAttribute('s').split(/\s+/).some(token =>
      (!token.startsWith('G') && !token.startsWith('H') || token.toUpperCase().startsWith(langPrefix)) &&
      normalizeStrong(token) === target);
    if (matches) el.classList.add('lemma-highlight');
  });
}

function handleLemmaHover(l) {
  const s = l.getAttribute('s');
  if (!s) return;

  const verse = l.closest('.verse, .v');
  const verseid = verse?.getAttribute('data-id') ?? '';
  const langPrefix = getLangPrefix(verseid);
  const strongParts = s.split(/\s+/).map(normalizeStrong);

  for (const strong of strongParts) {
    if (strong === '3588' && strongParts.length > 1) continue;
    highlightStrong(strong, langPrefix, verseid);
  }
}

function handleLemmaOut() {
  document.querySelectorAll('.lemma-highlight').forEach(el => el.classList.remove('lemma-highlight'));
}

export const LemmaMatchPlugin = () => {
  if (!getConfig().enableLemmaMatchPlugin) return {};
  if (!supportsHover()) return {};

  const windowsMain = document.querySelector('.windows-main');
  if (!windowsMain) return {};

  const options = { ignoreInternal: true };
  delegate(windowsMain, 'mouseover', 'l', handleLemmaHover, options);
  delegate(windowsMain, 'mouseout', 'l', handleLemmaOut, options);

  return {};
};

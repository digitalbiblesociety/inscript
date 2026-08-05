/** localStorage persistence for user highlights, keyed by Bible version (textid). */

import { showNotice } from '../windows/NotesWindow/notice.js';
import { t } from '../lib/i18n.js';

const STORAGE_KEY = 'browserbible_highlights';

function loadHighlights() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

let warnedSaveFailure = false;

function saveHighlights(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn('Highlighter: could not persist highlights', err);
    if (!warnedSaveFailure) {
      warnedSaveFailure = true;
      showNotice(t('plugins.highlighter.savefailed'));
    }
    return false;
  }
}

export function addHighlight(textid, highlight) {
  const data = loadHighlights();
  if (!data[textid]) data[textid] = [];
  data[textid].push(highlight);
  saveHighlights(data);
}

export function removeHighlight(textid, highlightId) {
  const data = loadHighlights();
  if (!data[textid]) return;
  data[textid] = data[textid].filter(h => h.id !== highlightId);
  if (data[textid].length === 0) delete data[textid];
  saveHighlights(data);
}

export function updateHighlightColor(textid, highlightId, newColor) {
  const data = loadHighlights();
  if (!data[textid]) return;
  const hl = data[textid].find(h => h.id === highlightId);
  if (hl) {
    hl.color = newColor;
    saveHighlights(data);
  }
}

export function getHighlightsForVerse(textid, verseId) {
  const data = loadHighlights();
  if (!data[textid]) return [];
  return data[textid].filter(h => h.verseId === verseId);
}

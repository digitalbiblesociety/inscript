/** localStorage persistence for user highlights, keyed by Bible version (textid). */

import { showNotice } from '../windows/NotesWindow/notice.js';
import { t } from '../lib/i18n.js';

const STORAGE_KEY = 'browserbible_highlights';
let cachedRaw;
let cachedHighlights = {};

function loadHighlights() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedHighlights;
    const parsed = raw ? JSON.parse(raw) : {};
    cachedRaw = raw;
    cachedHighlights = parsed && !Array.isArray(parsed) && typeof parsed === 'object' ? parsed : {};
    return cachedHighlights;
  } catch {
    cachedRaw = undefined;
    cachedHighlights = {};
    return {};
  }
}

let warnedSaveFailure = false;

function saveHighlights(data) {
  try {
    const raw = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = raw;
    cachedHighlights = data;
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
  const current = loadHighlights();
  const existing = Array.isArray(current[textid]) ? current[textid] : [];
  const data = { ...current, [textid]: [...existing, highlight] };
  saveHighlights(data);
}

export function removeHighlight(textid, highlightId) {
  const current = loadHighlights();
  if (!Array.isArray(current[textid])) return;
  const data = { ...current };
  const remaining = current[textid].filter(h => h.id !== highlightId);
  if (remaining.length) data[textid] = remaining;
  else delete data[textid];
  saveHighlights(data);
}

export function updateHighlightColor(textid, highlightId, newColor) {
  const current = loadHighlights();
  if (!Array.isArray(current[textid]) || !current[textid].some(h => h.id === highlightId)) return;
  const data = {
    ...current,
    [textid]: current[textid].map((highlight) =>
      highlight.id === highlightId ? { ...highlight, color: newColor } : highlight)
  };
  saveHighlights(data);
}

export function getHighlightsForText(textid) {
  const highlights = loadHighlights()[textid];
  return Array.isArray(highlights) ? highlights : [];
}

export function getHighlightsForVerse(textid, verseId) {
  return getHighlightsForText(textid).filter(h => h.verseId === verseId);
}

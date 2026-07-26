/**
 * Single source of truth for the "show apocryphal books" setting and the
 * book/section classification helpers built on it. When the setting is off
 * (the default) the apocryphal / deuterocanonical books are hidden from the
 * navigators, skipped while scrolling, and excluded from search.
 *
 * Consumers read getShowApocrypha()/isApocryphalSection() at render time and
 * may subscribe to 'change' to refresh when the toggle flips.
 */

import AppSettings from '../common/AppSettings.js';
import { mixinEventEmitter } from '../common/EventEmitter.js';
import { AP_BOOKS } from './BibleData.js';

const SETTING_KEY = 'apocrypha';
const AP_BOOK_SET = new Set(AP_BOOKS);

// Off by default: apocryphal books are hidden until the user opts in.
let showApocrypha = null; // lazily read from storage on first access

const emitter = mixinEventEmitter({});

export function getShowApocrypha() {
  if (showApocrypha === null) {
    showApocrypha = AppSettings.getValue(SETTING_KEY, { checked: false }).checked === true;
  }
  return showApocrypha;
}

export function isApocryphaHidden() {
  return !getShowApocrypha();
}

/**
 * Persist the setting and notify subscribers.
 */
export function setShowApocrypha(value) {
  const next = value === true;
  if (next === getShowApocrypha()) return;
  showApocrypha = next;
  AppSettings.setValue(SETTING_KEY, { checked: next });
  emitter.trigger('change', { type: 'change', data: { showApocrypha: next } });
}

/** `bookid` is a two-letter DBS book code such as "TB". */
export function isApocryphalBook(bookid) {
  return AP_BOOK_SET.has(bookid);
}

/** Accepts a section id ("TB1") or a bare book code; the first two chars decide. */
export function isApocryphalSection(sectionid) {
  return sectionid ? AP_BOOK_SET.has(sectionid.substring(0, 2)) : false;
}

/**
 * Filter a list of book codes or section ids, dropping apocryphal entries while
 * the setting is off. Returns the input unchanged when apocrypha is shown.
 */
export function filterVisibleBooks(ids) {
  if (getShowApocrypha()) return ids;
  return ids.filter((id) => !isApocryphalSection(id));
}

/**
 * Walk `sections` from `sectionid` in `direction` (+1 next / -1 prev) past any
 * apocryphal sections, returning the first non-apocryphal section id — or null
 * if the run reaches the end of the text. Returns `sectionid` unchanged when it
 * isn't apocryphal or isn't found in the list. (Pure: callers decide, via the
 * setting, whether to skip at all.)
 */
export function skipApocryphalSection(sectionid, direction, sections) {
  if (!sectionid || !isApocryphalSection(sectionid)) return sectionid;
  if (!Array.isArray(sections)) return sectionid;

  let idx = sections.indexOf(sectionid);
  if (idx === -1) return sectionid;

  while (idx >= 0 && idx < sections.length && isApocryphalSection(sections[idx])) {
    idx += direction;
  }
  return (idx >= 0 && idx < sections.length) ? sections[idx] : null;
}

/** Subscribe to setting changes. */
export function onApocryphaChange(cb) {
  emitter.on('change', cb);
}

/**
 * Pericopes
 * Section/passage titles ("pericopes") keyed to Bible references.
 *
 * Localized source data lives in content/pericopes/{locale}.json as
 * `reference: title` pairs, where the reference is the internal 2-char book
 * shortCode followed by `chapter.verse` (e.g. `S116.14` = 1 Samuel 16:14,
 * `GN1.1` = Genesis 1:1).
 */

import { BOOK_DATA } from './BibleData.js';
import { toBcp47Lang } from '../lib/bcp47.js';

export const PERICOPE_LOCALES = new Set([
  'ar', 'bn', 'de', 'en', 'es', 'fr', 'hi', 'id', 'ja', 'ko', 'pt', 'ru', 'ur', 'zh-CN'
]);

/** Maps text-catalog ISO 639 codes and BCP-47 variants to a bundled dataset. */
export function pericopeLocaleFor(language) {
  const normalized = toBcp47Lang(language)?.toLowerCase();
  if (!normalized) return null;
  const primary = normalized.split('-')[0];
  const locale = primary === 'zh' ? 'zh-CN' : primary;
  return PERICOPE_LOCALES.has(locale) ? locale : null;
}

/**
 * Parse the raw `reference: title` pairs into navigable pericope records.
 */
function parsePericopes(rows) {
  const out = [];

  for (const [ref, title] of Object.entries(rows)) {
    if (!ref || !title) continue;

    // Book id is always the first two characters (numbered books use a
    // digit in the code, e.g. S1, K2, R1), the remainder is chapter.verse.
    const bookid = ref.slice(0, 2);
    if (!BOOK_DATA[bookid]) continue;

    const rest = ref.slice(2);
    const dot = rest.indexOf('.');
    const chapter = parseInt(dot === -1 ? rest : rest.slice(0, dot), 10);
    const verse = dot === -1 ? 1 : parseInt(rest.slice(dot + 1), 10) || 1;
    if (!chapter) continue;

    const sectionid = bookid + chapter;
    out.push({
      bookid,
      sectionid,
      fragmentid: sectionid + '_' + verse,
      chapter,
      verse,
      title,
    });
  }

  return out;
}

/**
 * Group pericopes by book id, preserving canonical book order.
 */
function groupByBook(pericopes) {
  const groups = new Map();
  for (const p of pericopes) {
    if (!groups.has(p.bookid)) groups.set(p.bookid, []);
    groups.get(p.bookid).push(p);
  }
  return [...groups.entries()]
    .map(([bookid, pericopes]) => ({ bookid, pericopes }))
    .sort((a, b) => (BOOK_DATA[a.bookid]?.sortOrder ?? 999) - (BOOK_DATA[b.bookid]?.sortOrder ?? 999));
}

const loadPromises = new Map();

/** Fetches and caches one localized dataset, grouped in canonical book order. */
export function loadPericopesByBook(language) {
  const locale = pericopeLocaleFor(language);
  if (!locale) return Promise.resolve([]);
  if (!loadPromises.has(locale)) {
    const promise = fetch(`./content/pericopes/${locale}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load ${locale} pericopes (${response.status})`);
        return response.json();
      })
      .then(rows => groupByBook(parsePericopes(rows)))
      .catch((error) => {
        loadPromises.delete(locale);
        console.warn(error);
        return [];
      });
    loadPromises.set(locale, promise);
  }
  return loadPromises.get(locale);
}

/**
 * DbsVideoApi
 * Chapter-linked video from the DBS video catalog: the JESUS film, the LUMO
 * gospels, the Visual Bible, Book of Genesis, Bible Slides and the rest.
 *
 *   catalog  https://dbs.org/data/video.json         every title, grouped by producing org
 *   title    https://meta.dbs.org/data/data-video/video/{org}/{file}
 *   video    https://video.dbs.org/... (LUMO: video2)  plain MP4, CORS-open, no key
 *
 * One catalog fetch serves every org. Chapter numbers (`n`) and cover images are
 * the same in every language; titles, descriptions and video URLs are localized.
 * The verse -> (org, chapter) map is static, generated offline into
 * content/media/dbsvideo/info.json by tools/build-dbs-video-media.mjs; this
 * module turns an (org, chapter) pair into a video in the reader's language.
 *
 * This replaces the Arclight API, which needed an API key the frontend does not
 * have, so Jesus Film libraries were hidden and never played.
 */

import { getConfig } from '../core/config.js';
import {
  resolveIsoCandidates,
  buildCatalogIndex,
  pickCatalogEntry,
  normalizeTitle
} from './DbsVideoCatalogData.js';
import { languageNameFor, buildLanguageList } from './DbsVideoLanguageNames.js';

export { resolveIsoCandidates, pickCatalogEntry, normalizeTitle } from './DbsVideoCatalogData.js';

const DEFAULT_CATALOG_URL = 'https://dbs.org/data/video.json';
const DEFAULT_META_URL = 'https://meta.dbs.org/data/data-video/video';

const FALLBACK_ISO = 'eng';

// org -> iso3 -> catalog entries[], built once per session from one fetch.
let indexPromise = null;
// Resolved value of indexPromise, for the synchronous hasDbsVideoEdition check.
let index = null;
// iso3 -> Map<catalog language name, times used>, for naming languages Intl
// cannot name; built with the index.
let namesByIso = null;
// `${locale}|${orgs}` -> language list, so switching chapters re-uses the work.
const languageLists = new Map();
// `${org}/${file}` -> normalized title promise
const titlePromises = {};

const catalogUrl = (config) => config.dbsVideoCatalogUrl || DEFAULT_CATALOG_URL;
const metaBase = (config) => (config.dbsVideoMetaUrl || DEFAULT_META_URL).replace(/\/$/, '');

/**
 * Whether DBS video can be loaded. Media loading uses this to hide 'dbsvideo'
 * libraries when the source is off rather than showing thumbs that cannot play.
 */
export function isDbsVideoEnabled() {
  const config = getConfig();
  return !!(config.enableOnlineSources && config.dbsVideoEnabled);
}

/**
 * Fetch the video catalog once and index every title by org, then language.
 * Resolves to an empty Map on failure so callers degrade to no video.
 */
function loadIndex(config) {
  if (indexPromise) return indexPromise;

  indexPromise = fetch(catalogUrl(config))
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      const list = Array.isArray(data) ? data : (data?.videos ?? data?.titles ?? []);
      const { byOrg, names } = buildCatalogIndex(list);
      index = byOrg;
      namesByIso = names;
      languageLists.clear();
      return byOrg;
    })
    .catch((error) => {
      console.warn('DBS video catalog error:', error.message);
      indexPromise = null; // allow a later retry
      return new Map();
    });

  return indexPromise;
}

/**
 * Load the catalog ahead of use, so hasDbsVideoEdition() can answer
 * synchronously while thumbs are being rendered.
 */
export function primeDbsVideoCatalog() {
  if (!isDbsVideoEnabled()) return Promise.resolve();
  return loadIndex(getConfig()).then(() => undefined);
}

/**
 * Whether a title has any edition the reader could watch: one in their language,
 * or the English fallback. Several titles exist only in minority languages (Bible
 * Slides, Book of Genesis and JESUS: Luke have no English edition at all), so the
 * static verse map alone would offer thumbs that can never play.
 *
 * Optimistic before the catalog has loaded, and if it failed to load: better to
 * offer a video that may not play than to hide every video on a network blip.
 * Cannot see inside a title, so a language whose edition is missing this
 * particular chapter still fails at play time.
 * @param [options.fallback=true] - count the English edition as available. Off
 *   when the reader picked the language themselves: the point of picking
 *   Swahili is to see what there is in Swahili.
 */
export function hasDbsVideoEdition(org, langCode, { fallback = true } = {}) {
  if (!index) return true;

  const byLang = index.get(org);
  if (!byLang) return false;

  const candidates = resolveIsoCandidates(langCode);
  if (fallback) candidates.push(FALLBACK_ISO);

  return candidates.some((iso) => byLang.has(iso));
}

/**
 * Human-readable name for one of the catalog's language codes: the reader's own
 * word for it where the platform knows the code, otherwise the catalog's English
 * name. Returns the code itself when nothing names it.
 */
export function getDbsVideoLanguageName(iso, locale = 'en') {
  return languageNameFor(iso, locale, namesByIso);
}

/**
 * Languages the given titles can be watched in, for a language picker. Listing
 * only the languages of the titles on screen keeps the choice to ones that
 * actually play: the catalog spans 2,600 languages, but no single chapter's
 * videos come in all of them.
 * An omitted `orgs` covers every title, while an empty list means no titles at
 * all. Sorted by name.
 */
export function getDbsVideoLanguages(orgs, locale = 'en') {
  if (!index || (orgs && !orgs.length)) return [];

  const wanted = [...new Set(orgs ?? index.keys())].sort((a, b) => (a > b) - (a < b));
  const cacheKey = `${locale}|${wanted.join(',')}`;
  const cached = languageLists.get(cacheKey);
  if (cached) return cached;

  const titleCounts = new Map();
  for (const org of wanted) {
    const byLang = index.get(org);
    if (!byLang) continue;
    for (const iso of byLang.keys()) {
      titleCounts.set(iso, (titleCounts.get(iso) ?? 0) + 1);
    }
  }

  const languages = buildLanguageList(titleCounts, locale, namesByIso);
  languageLists.set(cacheKey, languages);
  return languages;
}

/**
 * Fetch and normalize one language's title JSON, cached by org + file name.
 */
function loadTitle(config, entry) {
  const key = `${entry.org}/${entry.file}`;
  if (titlePromises[key]) return titlePromises[key];

  titlePromises[key] = fetch(`${metaBase(config)}/${key}`)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(normalizeTitle)
    .catch((error) => {
      console.warn(`DBS video title error (${key}):`, error.message);
      delete titlePromises[key]; // allow a later retry
      return null;
    });

  return titlePromises[key];
}

/**
 * Resolve one title's chapter to a playable video in the reader's language,
 * falling back to English when that language has no edition or no chapters.
 * `org` is a catalog org such as 'Jesus' or 'Lumo-Mark', `langCode` a text language
 * (ISO 639-3, BCP-47 or 639-1), and `chapterNumber` is 1-based. Resolves to a
 * chapter carrying url/urlAlt/poster/title, or null.
 */
export async function getDbsVideoChapter(org, langCode, chapterNumber) {
  if (!isDbsVideoEnabled() || !org) return null;

  const number = parseInt(chapterNumber, 10);
  if (!Number.isFinite(number)) return null;

  const config = getConfig();
  const byLang = (await loadIndex(config)).get(org);
  if (!byLang) return null;

  const requested = resolveIsoCandidates(langCode);
  const candidates = [...new Set([...requested, FALLBACK_ISO])];

  for (const candidate of candidates) {
    const entry = pickCatalogEntry(byLang.get(candidate));
    if (!entry) continue;

    const title = await loadTitle(config, entry);
    const chapter = title?.chapters.get(number);
    if (!chapter) continue;

    return {
      ...chapter,
      org,
      iso: title.iso || candidate,
      languageName: title.languageName || entry.language,
      filmTitle: title.title,
      isFallback: !requested.includes(candidate)
    };
  }

  return null;
}

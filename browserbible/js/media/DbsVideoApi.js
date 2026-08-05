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
import { ISO_639_3_TO_1 } from '../lib/bcp47.js';

const DEFAULT_CATALOG_URL = 'https://dbs.org/data/video.json';
const DEFAULT_META_URL = 'https://meta.dbs.org/data/data-video/video';

const FALLBACK_ISO = 'eng';

/**
 * ISO 639-1 -> every 639-3 code that maps to it, so a 2-letter text language
 * still finds a video. Several 639-1 codes are ambiguous (ar -> ara/arb,
 * zh -> zho/cmn, ...) and the catalog consistently files recordings under the
 * individual language rather than the macrolanguage, so all are tried.
 */
const ISO_639_1_TO_3 = Object.entries(ISO_639_3_TO_1)
  .reduce((map, [iso3, iso1]) => {
    map[iso1] ??= [];
    map[iso1].push(iso3);
    return map;
  }, {});

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
 * Language codes to look for in the catalog, best first: drop any script/region
 * suffix ("eng-Latn-US" -> "eng") and widen a 2-letter code to every ISO 639-3
 * code it stands for.
 */
export function resolveIsoCandidates(langCode) {
  const primary = String(langCode ?? '').toLowerCase().split('-')[0];
  if (!primary) return [];
  if (primary.length === 2) return ISO_639_1_TO_3[primary] ?? [primary];
  return [primary];
}

// The catalog abbreviates keys: i=iso, l=language, o=org, j=json file, k=video count.
const catalogToEntry = (e) => ({
  org: e.o ?? e.org ?? '',
  iso: String(e.i ?? e.iso ?? '').toLowerCase(),
  language: e.l ?? e.language ?? '',
  file: e.j ?? e.file ?? '',
  videoCount: Number(e.k ?? e.videos ?? 0)
});

/**
 * Pick one recording of a title for a language. Most languages have several
 * (e.g. "Spanish Castilian" and "Spanish Latin American"); prefer the most
 * complete edition, since a sparse one may not hold the chapter being asked
 * for, then the plainest language name, so the choice is stable.
 */
export function pickCatalogEntry(entries) {
  if (!entries?.length) return null;

  return [...entries].sort((a, b) =>
    b.videoCount - a.videoCount ||
    a.language.length - b.language.length ||
    a.language.localeCompare(b.language) ||
    a.file.localeCompare(b.file)
  )[0];
}

/**
 * Reduce a per-language title JSON to the chapters this app plays. Handles both
 * the current "sections[].items" shape and the legacy flat "chapters" one.
 *
 * A title may carry the same chapters several times over, once per audio
 * translation (LUMO Luke ships three); those sections repeat `n`, and the first
 * wins so the partner's primary listing is what plays.
 */
export function normalizeTitle(raw) {
  const items = Array.isArray(raw?.sections)
    ? raw.sections.flatMap((section) => section?.items ?? [])
    : (raw?.chapters ?? []);

  const chapters = new Map();
  for (const item of items) {
    const number = Number(item?.n ?? item?.chapter);
    if (!Number.isFinite(number) || chapters.has(number)) continue;

    // Standard definition first (~5 MB/chapter vs ~70 MB), matching the Deaf
    // Bible player's default; the high copy is the retry on playback error.
    const low = item.media?.low?.url ?? item.web_url_low ?? '';
    const high = item.media?.high?.url ?? item.web_url ?? '';
    if (!low && !high) continue;

    chapters.set(number, {
      number,
      title: String(item.title ?? '').trim(),
      reference: String(item.reference ?? '').trim(),
      description: String(item.description_short ?? item.description ?? '').trim(),
      poster: item.cover ?? '',
      duration: Number(item.duration_seconds ?? 0),
      url: low || high,
      urlAlt: low && high ? high : ''
    });
  }

  return {
    id: raw?.id ?? '',
    iso: String(raw?.iso ?? '').toLowerCase(),
    title: raw?.title_vernacular || raw?.title || '',
    languageName: raw?.language?.name ?? '',
    chapters
  };
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
      const loaded = new Map();
      const names = new Map();
      for (const raw of list) {
        const entry = catalogToEntry(raw);
        if (!entry.org || !entry.iso || !entry.file) continue;
        if (!loaded.has(entry.org)) loaded.set(entry.org, new Map());
        const byLang = loaded.get(entry.org);
        if (!byLang.has(entry.iso)) byLang.set(entry.iso, []);
        byLang.get(entry.iso).push(entry);

        if (entry.language) {
          if (!names.has(entry.iso)) names.set(entry.iso, new Map());
          const counts = names.get(entry.iso);
          counts.set(entry.language, (counts.get(entry.language) ?? 0) + 1);
        }
      }
      index = loaded;
      namesByIso = names;
      languageLists.clear();
      return loaded;
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

/** Intl.DisplayNames per UI locale, or null where the platform has none. */
const displayNamesByLocale = new Map();
function displayNames(locale) {
  if (!displayNamesByLocale.has(locale)) {
    let names = null;
    try {
      names = new Intl.DisplayNames([locale, 'en'], { type: 'language', fallback: 'code' });
    } catch { /* unsupported locale or no Intl.DisplayNames */ }
    displayNamesByLocale.set(locale, names);
  }
  return displayNamesByLocale.get(locale);
}

/**
 * The catalog's own name for a language. Editions disagree ('eng' appears as
 * "English", "English British", "English-American", ...), so take the name most
 * editions use, then the shortest, so the choice is stable and unadorned.
 */
function plainestName(counts) {
  return [...counts.entries()].sort((a, b) =>
    b[1] - a[1] ||
    a[0].length - b[0].length ||
    a[0].localeCompare(b[0])
  )[0][0];
}

/**
 * Human-readable name for one of the catalog's language codes: the reader's own
 * word for it where the platform knows the code (Intl names the ~180 languages
 * with an ISO 639-1 equivalent, plus 'cmn', 'spa' and friends), otherwise the
 * catalog's English name, which is all there is for most of the 2,600 languages
 * the catalog covers.
 * Returns the code itself when nothing names it.
 */
export function getDbsVideoLanguageName(iso, locale = 'en') {
  const code = String(iso ?? '').toLowerCase();
  if (!code) return '';

  let named = '';
  try {
    named = displayNames(locale)?.of(code) ?? '';
  } catch { /* structurally invalid code */ }
  if (named && named !== code) return named;

  const counts = namesByIso?.get(code);
  return counts?.size ? plainestName(counts) : code;
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

  const languages = [...titleCounts.entries()]
    .map(([iso, titles]) => ({ iso, name: getDbsVideoLanguageName(iso, locale), titles }));

  // Intl gives several codes the same name ('cmn' and 'zho' are both Chinese);
  // tell those apart by code rather than offering two identical rows.
  const nameCounts = languages.reduce((counts, language) =>
    counts.set(language.name, (counts.get(language.name) ?? 0) + 1), new Map());
  for (const language of languages) {
    if (nameCounts.get(language.name) > 1) language.name += ` (${language.iso})`;
  }

  languages.sort((a, b) => a.name.localeCompare(b.name));
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

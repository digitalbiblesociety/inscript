/**
 * Pure parsing and selection helpers for the DBS video catalog
 * (see DbsVideoApi for the fetching, caching and public entry points).
 */

import { ISO_639_3_TO_1 } from '../lib/bcp47.js';

/**
 * ISO 639-1 -> every 639-3 code that maps to it, so a 2-letter text language
 * still finds a video. Several 639-1 codes are ambiguous (ar -> ara/arb,
 * zh -> zho/cmn, ...) and the catalog consistently files recordings under the
 * individual language rather than the macrolanguage, so all are tried.
 */
const ISO_639_1_TO_3 = Object.entries(ISO_639_3_TO_1)
  .reduce((map, [iso3, iso1]) => {
    (map[iso1] ??= []).push(iso3);
    return map;
  }, {});

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
 * Index every catalog title by org, then language. Returns the org index and,
 * for naming languages Intl cannot name, iso3 -> Map<language name, times used>.
 */
export function buildCatalogIndex(list) {
  const byOrg = new Map();
  const names = new Map();

  for (const raw of list) {
    const entry = catalogToEntry(raw);
    if (!entry.org || !entry.iso || !entry.file) continue;
    if (!byOrg.has(entry.org)) byOrg.set(entry.org, new Map());
    const byLang = byOrg.get(entry.org);
    if (!byLang.has(entry.iso)) byLang.set(entry.iso, []);
    byLang.get(entry.iso).push(entry);

    if (entry.language) {
      if (!names.has(entry.iso)) names.set(entry.iso, new Map());
      const counts = names.get(entry.iso);
      counts.set(entry.language, (counts.get(entry.language) ?? 0) + 1);
    }
  }

  return { byOrg, names };
}

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

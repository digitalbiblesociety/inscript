// Serves sign-language Deaf Bibles (Deaf Bible Society via DBS) as inline-video passages.

import { getConfig } from '../core/config.js';
import { idFor, parsePassage, buildTitle, buildSectionHtml } from './DeafBibleTitle.js';

export { parsePassage, buildTitle, buildSectionHtml };

const providerName = 'deafbible';
const fullName = 'Deaf Bible (Deaf Bible Society)';

// Master catalog of all DBS video products; Deaf Bibles are the entries whose org is "DeafBible".
const DEFAULT_CATALOG_URL = 'https://dbs.org/data/video.json';
// Base for the per-title Deaf Bible metadata JSON files.
const DEFAULT_META_URL = 'https://meta.dbs.org/data/data-video/video/DeafBible';

// id -> { info, sectionPassages: Map<sectionid, passage[]> }
const titleCache = {};

// Title index (derived from the catalog), fetched once and cached.
let indexPromise = null;

const isEnabled = (config) => config.enableOnlineSources && config.deafBibleEnabled;

const metaBase = (config) => (config.deafBibleMetaUrl || DEFAULT_META_URL).replace(/\/$/, '');

const catalogUrl = (config) => config.deafBibleCatalogUrl || DEFAULT_CATALOG_URL;

const bareId = (textid) => (textid.includes(':') ? textid.split(':')[1] : textid);

// The catalog abbreviates keys; Deaf Bibles are the entries whose org ("o") is "DeafBible".
const isDeafEntry = (e) => !!e && (e.o === 'DeafBible' || e.org === 'DeafBible');

// Normalize a catalog entry to the internal shape the rest of the provider consumes.
// Full country name / text direction aren't in the catalog; they're filled in per-title (buildTitle).
const catalogToEntry = (e) => {
  const file = e.j ?? e.file ?? '';
  return {
    iso: e.i ?? e.iso ?? '',
    language: e.l ?? e.language ?? '',
    direction: e.direction || 'ltr',
    primaryCountry: e.c ?? e.primaryCountry ?? '',
    cover: '',
    file,
    directory: file.replace(/_deaf_bible\.json$/, '')
  };
};

// Fetch the master catalog, keep the Deaf Bible titles, and cache the result;
// resolves to [] on failure so callers degrade gracefully.
export function loadIndex(config) {
  if (indexPromise) return indexPromise;

  indexPromise = fetch(catalogUrl(config))
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      const list = Array.isArray(data) ? data : (data?.videos ?? data?.titles ?? []);
      return list
        .filter(isDeafEntry)
        .map(catalogToEntry)
        .filter((entry) => entry.iso && entry.file)
        .sort((a, b) => a.language.localeCompare(b.language));
    })
    .catch((error) => {
      console.error('Deaf Bible catalog error:', error);
      indexPromise = null; // allow a later retry
      return [];
    });

  return indexPromise;
}

const findEntry = (index, textid) => {
  const id = bareId(textid);
  return index.find((entry) => idFor(entry) === id) ?? null;
};

const entryToManifest = (entry) => ({
  type: 'deafbible',
  id: idFor(entry),
  name: entry.language,
  nameEnglish: entry.language,
  title: 'Deaf Bible',
  abbr: entry.iso.toUpperCase(),
  lang: entry.iso,
  langName: entry.language,
  langNameEnglish: entry.language,
  dir: entry.direction || 'ltr',
  hasText: true,
  hasAudio: false,
  cover: entry.cover || '',
  countries: entry.primaryCountry ? [entry.primaryCountry] : [],
  _deaf: { file: entry.file, directory: entry.directory }
});

function getTextManifest(callback) {
  const config = getConfig();
  if (!isEnabled(config)) {
    callback(null);
    return;
  }

  loadIndex(config).then((index) => {
    callback(index.length > 0 ? index.map(entryToManifest) : null);
  });
}

function getTextInfo(textid, callback, errorCallback) {
  const config = getConfig();
  if (!isEnabled(config)) {
    callback(null);
    return;
  }

  loadIndex(config)
    .then((index) => {
      const entry = findEntry(index, textid);
      if (!entry) {
        if (errorCallback) errorCallback(new Error(`No Deaf Bible for "${textid}"`));
        else callback(null);
        return;
      }

      const id = idFor(entry);
      if (titleCache[id]) {
        callback(titleCache[id].info);
        return;
      }

      return fetch(`${metaBase(config)}/${entry.file}`)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then((raw) => {
          const built = buildTitle(entry, raw);
          titleCache[id] = built;
          callback(built.info);
        });
    })
    .catch((error) => {
      console.error('Deaf Bible getTextInfo error:', error);
      if (errorCallback) errorCallback(error);
      else callback(null);
    });
}

/** Ordered passage list for a title, loading if needed; [] on failure. */
export function getPlaylist(textid) {
  return new Promise((resolve) => {
    getTextInfo(textid, (info) => {
      resolve(info ? (titleCache[info.id]?.orderedPassages ?? []) : []);
    }, () => resolve([]));
  });
}

function loadSection(textid, sectionid, callback, errorCallback) {
  getTextInfo(textid, (info) => {
    if (!info) {
      errorCallback?.(textid, sectionid);
      return;
    }

    const cache = titleCache[info.id];
    const passages = cache?.sectionPassages.get(sectionid);
    if (!passages || passages.length === 0) {
      errorCallback?.(textid, sectionid);
      return;
    }

    callback(buildSectionHtml(info, sectionid, passages));
  }, () => errorCallback?.(textid, sectionid));
}

// Deaf Bibles are video-only; return empty results so Search degrades gracefully.
function startSearch({ onSearchComplete }) {
  onSearchComplete?.({
    type: 'complete',
    target: null,
    data: { results: [], searchIndexesData: [], searchTermsRegExp: [], isLemmaSearch: false }
  });
}

export const DeafBibleTextProvider = {
  name: providerName,
  fullName,
  getTextManifest,
  getTextInfo,
  loadSection,
  startSearch
};

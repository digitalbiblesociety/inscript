// Stop words for word-frequency statistics.
//
// Word lists live in content/stopwords/<iso639-3>.json (one flat array per
// language, served from public/ so they stay out of the JS bundle and new
// languages can be added without code changes). The English list covers
// function words, light verbs, contractions, and KJV-era archaic forms;
// distinctive frequent words (God, Lord, verily, behold, amen) are
// deliberately left out so they stay visible in the stats.

// textInfo.lang is usually a bare ISO 639-3 code but may be suffixed
// ("eng-Latn-US") or, from some providers, a 2-letter ISO 639-1 code.
const LANG_ALIASES = {
  en: 'eng', es: 'spa', pt: 'por', fr: 'fra', hi: 'hin',
  ar: 'ara', arb: 'ara', ja: 'jpn', ko: 'kor', zh: 'zho', cmn: 'zho'
};

export function normalizeLang(lang) {
  if (!lang) return undefined;
  const primary = String(lang).toLowerCase().split('-')[0];
  if (!/^[a-z]{2,3}$/.test(primary)) return undefined;
  return LANG_ALIASES[primary] ?? primary;
}

const cache = new Map();

/**
 * Resolve the stop-word Set for a language, or undefined when no list
 * exists (missing file, network failure, malformed JSON). Results are
 * cached per language; concurrent callers share one fetch.
 */
export function loadStopwords(lang) {
  const code = normalizeLang(lang);
  if (!code) return Promise.resolve(undefined);

  if (!cache.has(code)) {
    cache.set(code, fetch(`content/stopwords/${code}.json`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((words) => (Array.isArray(words) ? new Set(words) : undefined))
      .catch(() => undefined));
  }
  return cache.get(code);
}

// Unicode letters plus combining marks (Devanagari matras, Arabic diacritics)
// with word-internal straight or curly apostrophes; trailing possessive 's is
// stripped so "God's" counts as "God".
const WORD_PATTERN = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;

// Languages written without spaces, segmented via Intl.Segmenter (which needs
// a BCP-47 locale). Everything else splits on the regex above.
const SEGMENTER_LOCALES = {
  zho: 'zh', cmn: 'zh', yue: 'zh', jpn: 'ja', tha: 'th', khm: 'km', lao: 'lo', mya: 'my'
};
const segmenters = new Map();

// Languages where an apostrophe marks elision (l'Éternel, qu'il), so tokens
// split there; in English it marks contractions (don't) and stays internal.
const ELISION_LANGS = new Set(['fra']);

export function tokenizeWords(text, lang) {
  if (!text) return [];
  const code = normalizeLang(lang);

  const locale = SEGMENTER_LOCALES[code];
  if (locale && typeof Intl !== 'undefined' && Intl.Segmenter) {
    if (!segmenters.has(locale)) {
      segmenters.set(locale, new Intl.Segmenter(locale, { granularity: 'word' }));
    }
    const words = [];
    for (const seg of segmenters.get(locale).segment(text)) {
      if (seg.isWordLike && /[\p{L}\p{M}]/u.test(seg.segment)) words.push(seg.segment);
    }
    return words;
  }

  const matches = text.match(WORD_PATTERN) ?? [];
  const tokens = matches.map((token) => token.replace(/['’]s$/i, ''));
  if (ELISION_LANGS.has(code)) {
    return tokens.flatMap((token) => token.split(/['’]/).filter(Boolean));
  }
  return tokens;
}

// Canonical form for counting and stop-word lookup: lowercase with curly
// apostrophes normalized, so "Don’t" matches the "don't" list entry.
export function wordKey(token) {
  return token.toLowerCase().replace(/’/g, "'");
}

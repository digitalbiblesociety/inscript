/**
 * Human-readable names for the DBS video catalog's language codes
 * (see DbsVideoApi, which owns the catalog state these read from).
 */

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
 * catalog's English name from `namesByIso`, which is all there is for most of
 * the 2,600 languages the catalog covers.
 * Returns the code itself when nothing names it.
 */
export function languageNameFor(iso, locale, namesByIso) {
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
 * Build a named, sorted language list from iso3 -> title count, for a picker.
 */
export function buildLanguageList(titleCounts, locale, namesByIso) {
  const languages = [...titleCounts.entries()]
    .map(([iso, titles]) => ({ iso, name: languageNameFor(iso, locale, namesByIso), titles }));

  // Intl gives several codes the same name ('cmn' and 'zho' are both Chinese);
  // tell those apart by code rather than offering two identical rows.
  const nameCounts = languages.reduce((counts, language) =>
    counts.set(language.name, (counts.get(language.name) ?? 0) + 1), new Map());
  for (const language of languages) {
    if (nameCounts.get(language.name) > 1) language.name += ` (${language.iso})`;
  }

  languages.sort((a, b) => a.name.localeCompare(b.name));
  return languages;
}

import { toBcp47Lang } from './bcp47.js';

// Fallbacks for engines without Intl.Locale text-direction data. The primary
// language is used only when a BCP-47 tag does not specify a script explicitly.
const RTL_LANGUAGES = new Set([
  'ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'ks', 'nqo', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi'
]);

// CLDR/Unicode script subtags whose normal horizontal writing direction is RTL.
const RTL_SCRIPTS = new Set([
  'adlm', 'arab', 'armi', 'avst', 'hebr', 'khar', 'lydi', 'mand', 'mani', 'mend',
  'merc', 'mero', 'narb', 'nbat', 'nkoo', 'palm', 'phli', 'phlp', 'phnx', 'prti',
  'rohg', 'samr', 'sarb', 'sogd', 'sogo', 'syrc', 'thaa', 'yezi'
]);

function localeDirection(language) {
  const normalized = toBcp47Lang(language);
  if (!normalized) return null;

  if (typeof Intl !== 'undefined' && typeof Intl.Locale === 'function') {
    try {
      const locale = new Intl.Locale(normalized);
      const textInfo = locale.textInfo ?? locale.getTextInfo?.();
      if (textInfo?.direction === 'rtl' || textInfo?.direction === 'ltr') {
        return textInfo.direction;
      }
    } catch (_error) {
      // Fall through to the deterministic language/script lookup below.
    }
  }

  const parts = String(normalized).toLowerCase().split('-');
  const script = parts.find(part => part.length === 4);
  if (script) return RTL_SCRIPTS.has(script) ? 'rtl' : 'ltr';
  return RTL_LANGUAGES.has(parts[0]) ? 'rtl' : 'ltr';
}

/** Resolve text direction even when catalog metadata incorrectly says LTR. */
export function directionForText(context) {
  const info = typeof context === 'string' ? { lang: context } : (context ?? {});
  if (localeDirection(info.lang) === 'rtl') return 'rtl';

  const script = String(info.script ?? info.fontClass ?? '').toLowerCase();
  if (RTL_SCRIPTS.has(script)) return 'rtl';

  return String(info.dir ?? '').toLowerCase() === 'rtl' ? 'rtl' : 'ltr';
}


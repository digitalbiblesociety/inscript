import { toBcp47Lang } from './bcp47.js';

/** Decimal digit sets keyed by their Unicode CLDR numbering-system name. */
export const NUMBERING_SYSTEM_DIGITS = Object.freeze({
  latn: '0123456789',
  arab: '٠١٢٣٤٥٦٧٨٩',
  arabext: '۰۱۲۳۴۵۶۷۸۹',
  beng: '০১২৩৪৫৬৭৮৯',
  deva: '०१२३४५६७८९'
});

/** Default vernacular numbering system for languages currently supported here. */
const NUMBERING_SYSTEM_BY_LANGUAGE = Object.freeze({
  ar: 'arab',
  bn: 'beng',
  hi: 'deva',
  ur: 'arabext'
});

const ASCII_DIGIT_BY_CHARACTER = new Map(
  Object.values(NUMBERING_SYSTEM_DIGITS).flatMap(digits =>
    [...digits].map((digit, number) => [digit, String(number)]))
);

function textContext(context) {
  return typeof context === 'string' ? { lang: context } : (context ?? {});
}

/**
 * Resolve a CLDR numbering-system name from an explicit text override or its language.
 * Invalid overrides are ignored; unknown languages deliberately fall back to Latin digits.
 */
export function numberingSystemFor(context) {
  const info = textContext(context);
  const explicit = String(info.numberingSystem ?? '').toLowerCase();
  if (Object.hasOwn(NUMBERING_SYSTEM_DIGITS, explicit)) return explicit;

  const language = toBcp47Lang(info.lang)?.toLowerCase() ?? '';
  return NUMBERING_SYSTEM_BY_LANGUAGE[language]
    ?? NUMBERING_SYSTEM_BY_LANGUAGE[language.split('-')[0]]
    ?? 'latn';
}

/**
 * Format a number or digit-bearing label without changing its underlying value or ID.
 * A text's existing non-identity `numbers` lookup remains the highest-priority
 * custom override. Legacy catalogs commonly include an identity Latin table,
 * which should not suppress a language's vernacular numbering system.
 */
export function formatNumeral(value, context) {
  const info = textContext(context);
  const number = Number(value);
  const customLabel = Number.isInteger(number) ? info.numbers?.[number] : null;
  if (customLabel != null && String(customLabel) !== String(number)) {
    return String(customLabel);
  }

  const digits = NUMBERING_SYSTEM_DIGITS[numberingSystemFor(info)];
  return String(value).replace(/[0-9]/g, digit => digits[Number(digit)]);
}

/** Convert every supported decimal digit set back to ASCII for internal parsing. */
export function normalizeNumerals(value) {
  return [...String(value)]
    .map(character => ASCII_DIGIT_BY_CHARACTER.get(character) ?? character).join('');
}

export type {
	CanonicalBookName,
	LanguageCode,
	BookNamePatterns
} from './languages/types.js';

import type {
	CanonicalBookName,
	LanguageCode,
	BookNamePatterns
} from './languages/types.js';

import {
	bookNamesByLanguage,
	getSupportedLanguages,
	isLanguageSupported
} from './languages/index.js';

export type BookNamesByLanguage = Record<LanguageCode, BookNamePatterns>;

/** Import from ./languages/<code>.js instead when tree-shaking matters. */
export const BOOK_NAMES: BookNamesByLanguage = bookNamesByLanguage;

export const SUPPORTED_LANGUAGES: LanguageCode[] = getSupportedLanguages();

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

/** Accepts region-tagged codes and falls back to English for unknown languages. */
export function getBookNames(langCode: string | null | undefined): BookNamePatterns {
	const lang = (langCode?.toLowerCase()?.split('-')[0] ?? DEFAULT_LANGUAGE) as LanguageCode;
	return BOOK_NAMES[lang] || BOOK_NAMES[DEFAULT_LANGUAGE];
}

export function getCombinedBookNames(langCodes: string[]): Partial<Record<CanonicalBookName, string[]>> {
	const combined: Partial<Record<CanonicalBookName, string[]>> = {};

	for (const langCode of langCodes) {
		const names = getBookNames(langCode);
		for (const [canonical, variations] of Object.entries(names) as [CanonicalBookName, string[]][]) {
			if (!combined[canonical]) {
				combined[canonical] = [];
			}
			for (const variation of variations) {
				if (!combined[canonical]!.includes(variation)) {
					combined[canonical]!.push(variation);
				}
			}
		}
	}

	return combined;
}

export { isLanguageSupported, getSupportedLanguages };

export default BOOK_NAMES;

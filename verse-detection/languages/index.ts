import type { BookNamePatterns, LanguageCode } from './types.js';

export type { BookNamePatterns, CanonicalBookName, LanguageCode } from './types.js';

import en from './en.json';
import es from './es.json';
import pt from './pt.json';
import fr from './fr.json';
import de from './de.json';
import ru from './ru.json';
import ar from './ar.json';
import hi from './hi.json';
import zh from './zh.json';
import id from './id.json';

export { en, es, pt, fr, de, ru, ar, hi, zh, id };

export type BookNamesByLanguage = {
	[key in LanguageCode]: BookNamePatterns;
};

export const bookNamesByLanguage: BookNamesByLanguage = {
	en: en as BookNamePatterns,
	es: es as BookNamePatterns,
	pt: pt as BookNamePatterns,
	fr: fr as BookNamePatterns,
	de: de as BookNamePatterns,
	ru: ru as BookNamePatterns,
	ar: ar as BookNamePatterns,
	hi: hi as BookNamePatterns,
	zh: zh as BookNamePatterns,
	id: id as BookNamePatterns
};

export function getLanguagePatterns(languageCode: LanguageCode): BookNamePatterns {
	return bookNamesByLanguage[languageCode];
}

export function getSupportedLanguages(): LanguageCode[] {
	return Object.keys(bookNamesByLanguage) as LanguageCode[];
}

export function isLanguageSupported(code: string): code is LanguageCode {
	return code in bookNamesByLanguage;
}

export default bookNamesByLanguage;

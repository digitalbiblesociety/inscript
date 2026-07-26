export type CanonicalBookName =
	| 'Genesis' | 'Exodus' | 'Leviticus' | 'Numbers' | 'Deuteronomy'
	| 'Joshua' | 'Judges' | 'Ruth'
	| '1 Samuel' | '2 Samuel' | '1 Kings' | '2 Kings'
	| '1 Chronicles' | '2 Chronicles' | 'Ezra' | 'Nehemiah' | 'Esther'
	| 'Job' | 'Psalms' | 'Proverbs' | 'Ecclesiastes' | 'Song of Solomon'
	| 'Isaiah' | 'Jeremiah' | 'Lamentations' | 'Ezekiel' | 'Daniel'
	| 'Hosea' | 'Joel' | 'Amos' | 'Obadiah' | 'Jonah' | 'Micah'
	| 'Nahum' | 'Habakkuk' | 'Zephaniah' | 'Haggai' | 'Zechariah' | 'Malachi'
	| 'Matthew' | 'Mark' | 'Luke' | 'John' | 'Acts' | 'Romans'
	| '1 Corinthians' | '2 Corinthians' | 'Galatians' | 'Ephesians'
	| 'Philippians' | 'Colossians' | '1 Thessalonians' | '2 Thessalonians'
	| '1 Timothy' | '2 Timothy' | 'Titus' | 'Philemon' | 'Hebrews'
	| 'James' | '1 Peter' | '2 Peter' | '1 John' | '2 John' | '3 John'
	| 'Jude' | 'Revelation';

export type LanguageCode = 'en' | 'es' | 'pt' | 'fr' | 'de' | 'ru' | 'ar' | 'hi' | 'zh' | 'id';

export type BookNamePatterns = Record<CanonicalBookName, string[]>;

export type BookNamesByLanguage = Record<LanguageCode, BookNamePatterns>;

/** Language metadata */
export interface LanguageInfo {
	code: LanguageCode;
	name: string;
	nativeName: string;
}

/** All supported languages with metadata */
export const LANGUAGE_INFO: Record<LanguageCode, LanguageInfo> = {
	en: { code: 'en', name: 'English', nativeName: 'English' },
	es: { code: 'es', name: 'Spanish', nativeName: 'Español' },
	pt: { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
	fr: { code: 'fr', name: 'French', nativeName: 'Français' },
	de: { code: 'de', name: 'German', nativeName: 'Deutsch' },
	ru: { code: 'ru', name: 'Russian', nativeName: 'Русский' },
	ar: { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
	hi: { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
	zh: { code: 'zh', name: 'Chinese', nativeName: '中文' },
	id: { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' }
};

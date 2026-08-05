import {
	BOOK_NAMES,
	SUPPORTED_LANGUAGES,
	DEFAULT_LANGUAGE,
	getCombinedBookNames,
	type LanguageCode
} from './bookNames.js';

import {
	buildVariationMap,
	buildVerseRegex,
	parseVerseReference,
	type ParsedVerseReference,
	type VariationLookup
} from './ReferenceParser.js';

export interface VerseDetectionPluginOptions {
	language?: string;
	/** 'all' loads every supported language */
	additionalLanguages?: string[] | 'all';
}

export interface DetectorState {
	currentLanguages: string[];
	variationMap: Map<string, VariationLookup>;
}

/** Returns a base language code, so 'en-US' becomes 'en'. */
export function detectDocumentLanguage(): string {
	if (typeof document === 'undefined') {
		return DEFAULT_LANGUAGE;
	}

	const htmlLang = document.documentElement?.lang;
	if (htmlLang) {
		return htmlLang.toLowerCase().split('-')[0];
	}

	const metaLang = document.querySelector('meta[http-equiv="content-language"]') as HTMLMetaElement | null;
	if (metaLang?.content) {
		return metaLang.content.toLowerCase().split('-')[0];
	}

	if (typeof navigator !== 'undefined' && navigator.language) {
		return navigator.language.toLowerCase().split('-')[0];
	}

	return DEFAULT_LANGUAGE;
}

function resolveLanguages(options: VerseDetectionPluginOptions): string[] {
	let primaryLanguage = options.language ?? detectDocumentLanguage();

	if (!SUPPORTED_LANGUAGES.includes(primaryLanguage as LanguageCode)) {
		console.warn(`VerseDetectionPlugin: Unsupported language '${primaryLanguage}', falling back to English`);
		primaryLanguage = DEFAULT_LANGUAGE;
	}

	const languages: string[] = [primaryLanguage];
	if (options.additionalLanguages === 'all') {
		for (const lang of SUPPORTED_LANGUAGES) {
			if (!languages.includes(lang)) {
				languages.push(lang);
			}
		}
	} else if (options.additionalLanguages) {
		for (const lang of options.additionalLanguages) {
			if (SUPPORTED_LANGUAGES.includes(lang as LanguageCode) && !languages.includes(lang)) {
				languages.push(lang);
			}
		}
	}

	// English stays in the list as a fallback for untranslated book names.
	if (!languages.includes('en')) {
		languages.push('en');
	}

	return languages;
}

export function createDetectorState(options: VerseDetectionPluginOptions = {}): DetectorState {
	const languages = resolveLanguages(options);
	return {
		currentLanguages: languages,
		variationMap: buildVariationMap(languages, BOOK_NAMES)
	};
}

export function setLanguage(state: DetectorState, newLanguages: string | string[]): void {
	const langArray = Array.isArray(newLanguages) ? newLanguages : [newLanguages];
	const validLangs = langArray.filter(l => SUPPORTED_LANGUAGES.includes(l as LanguageCode));

	if (validLangs.length === 0) {
		console.warn('VerseDetectionPlugin: No valid languages provided');
		return;
	}

	if (!validLangs.includes('en')) {
		validLangs.push('en');
	}

	state.currentLanguages = validLangs;
	state.variationMap = buildVariationMap(validLangs, BOOK_NAMES);
}

/** A fresh regex each call, since a shared one carries lastIndex state. */
export function buildCurrentRegex(state: DetectorState): RegExp {
	const patterns = getCombinedBookNames(state.currentLanguages);
	return buildVerseRegex(patterns);
}

export function detectVerses(state: DetectorState, text: string): ParsedVerseReference[] {
	if (!text || typeof text !== 'string') {
		return [];
	}

	const results: ParsedVerseReference[] = [];
	const regex = buildCurrentRegex(state);
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		const parsed = parseVerseReference(match, state.variationMap);
		results.push(parsed);
	}

	return results;
}

export function containsVerses(state: DetectorState, text: string): boolean {
	if (!text || typeof text !== 'string') {
		return false;
	}
	const regex = buildCurrentRegex(state);
	return regex.test(text);
}

export function replaceVerses(
	state: DetectorState,
	text: string,
	formatter: (verse: ParsedVerseReference) => string
): string {
	if (!text || typeof text !== 'string') {
		return text;
	}

	const verses = detectVerses(state, text);
	if (verses.length === 0) {
		return text;
	}

	// Back to front, so each splice leaves the earlier indices valid.
	let result = text;
	for (let i = verses.length - 1; i >= 0; i--) {
		const verse = verses[i];
		const replacement = formatter(verse);
		result = result.slice(0, verse.startIndex) + replacement + result.slice(verse.endIndex);
	}

	return result;
}

/** With no baseUrl the links are inert and rely on the app's click handler. */
export function linkVerses(state: DetectorState, text: string, baseUrl: string = ''): string {
	return replaceVerses(state, text, (verse) => {
		const href = baseUrl
			? `${baseUrl}?ref=${encodeURIComponent(verse.book + ' ' + verse.reference)}`
			: `javascript:void(0)`;
		const dataRef = `${verse.book} ${verse.reference}`;
		return `<a href="${href}" class="verse-link" data-verse-ref="${dataRef}">${verse.original}</a>`;
	});
}

/** "Jhn 3:16" becomes "John 3:16"; null when nothing parses. */
export function normalizeReference(state: DetectorState, reference: string): string | null {
	const verses = detectVerses(state, reference);
	if (verses.length === 0) {
		return null;
	}
	const first = verses[0];
	return `${first.book} ${first.reference}`;
}

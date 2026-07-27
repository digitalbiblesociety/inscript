import {
	BOOK_NAMES,
	SUPPORTED_LANGUAGES,
	DEFAULT_LANGUAGE,
	getBookNames,
	getCombinedBookNames,
	type CanonicalBookName,
	type LanguageCode
} from './bookNames.js';

import {
	type VerseDetectionConfig,
	type PartialVerseDetectionConfig
} from './config.js';

import { VersePopup, type BrowserBibleApp } from './VersePopup.js';
import { BOOK_CODES } from './BookCodes.js';
import {
	getTextIdForLanguage as getTextIdForLanguageUtil,
	buildVerseUrl as buildVerseUrlUtil
} from './VerseUrlBuilder.js';

export interface ParsedChapter {
	chapter: number;
	verses: number[];
	startVerse?: number;
	endVerse?: number;
}

export interface ParsedVerseReference {
	original: string;
	book: string;
	bookVariation: string;
	detectedLanguage: string;
	reference: string;
	chapters: ParsedChapter[];
	startIndex: number;
	endIndex: number;
	version?: string;  // e.g., "KJV", "ESV", "NIV"
}

interface VariationLookup {
	canonical: string;
	language: string;
}

export interface VerseDetectionPluginOptions {
	language?: string;
	/** 'all' loads every supported language */
	additionalLanguages?: string[] | 'all';
}

export interface VerseDetectionPluginAPI {
	name: string;
	detectVerses: (text: string) => ParsedVerseReference[];
	containsVerses: (text: string) => boolean;
	replaceVerses: (text: string, formatter: (verse: ParsedVerseReference) => string) => string;
	linkVerses: (text: string, baseUrl?: string) => string;
	normalizeReference: (reference: string) => string | null;
	setLanguage: (newLanguages: string | string[]) => void;
	getCurrentLanguages: () => string[];
	getSupportedLanguages: () => string[];
	detectDocumentLanguage: () => string;
	getBookPatterns: () => Partial<Record<CanonicalBookName, string[]>>;
	getCanonicalBookName: (variation: string) => VariationLookup | null;
	getVerseRegex: () => RegExp;
}

export interface InitializedVerseDetection extends VerseDetectionPluginAPI {
	popup: VersePopup | null;
	config: VerseDetectionConfig;
	processText: (text: string) => string;
	processContainer: (container: HTMLElement) => void;
	setAvailableTextLanguages: (languages: string[] | Record<string, string> | null) => void;
	hasTextForLanguage: (lang: string) => boolean;
	destroy: () => void;
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

/** Reverse lookup from a book-name variation to its canonical name; earlier languages win. */
function buildVariationMap(
	bookPatterns: Partial<Record<CanonicalBookName, string[]>>,
	languages: string[],
	bookNamesData: typeof BOOK_NAMES
): Map<string, VariationLookup> {
	const map = new Map<string, VariationLookup>();

	for (const lang of languages) {
		const langPatterns = bookNamesData[lang as LanguageCode];
		if (!langPatterns) continue;

		for (const [canonical, variations] of Object.entries(langPatterns) as [CanonicalBookName, string[]][]) {
			for (const variation of variations) {
				const key = variation.toLowerCase();
				if (!map.has(key)) {
					map.set(key, { canonical, language: lang });
				}
			}
		}
	}
	return map;
}

function buildBookPattern(bookPatterns: Partial<Record<CanonicalBookName, string[]>>): string {
	const allVariations: string[] = [];
	for (const variations of Object.values(bookPatterns)) {
		if (variations) {
			allVariations.push(...variations);
		}
	}
	// Longest first, so alternation prefers "1 Samuel" over the "1 Sam" prefix.
	allVariations.sort((a, b) => b.length - a.length);
	const escaped = allVariations.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return escaped.join('|');
}

/**
 * Matches "John 3:16", "1 John 2:3-4", "Genesis 1:1-2:3", "Ps 23",
 * "Matt 5:3, 6, 9", "约翰福音 3:16", "Матфей 5:3".
 */
function buildVerseRegex(bookPatterns: Partial<Record<CanonicalBookName, string[]>>): RegExp {
	const bookPattern = buildBookPattern(bookPatterns);

	const chapter = '\\d{1,3}';
	const verse = '\\d{1,3}';
	const verseRange = `${verse}(?:\\s*[-\u2013\u2014]\\s*${verse})?`; // 3-4 or 3–4 or 3—4
	const verseList = `${verseRange}(?:\\s*,\\s*${verseRange})*`; // 3-4, 6, 9-10
	const chapterVerse = `${chapter}(?:\\s*[:.;]\\s*${verseList})?`; // 3:16 or just 3 (chapter only)
	const chapterRange = `${chapterVerse}(?:\\s*[-\u2013\u2014]\\s*${chapterVerse})?`; // 1:1-2:3

	const versionSuffix = '(?:\\s*\\(([A-Za-z0-9]{2,10})\\))?'; // (KJV), (ESV), (WEB)

	// The leading/trailing character classes stand in for word boundaries, which
	// \b cannot provide for non-Latin scripts, and include CJK/Arabic punctuation.
	const fullPattern = `(?:^|[\\s(\\[{،。、])((${bookPattern})\\.?\\s*(${chapterRange})${versionSuffix})(?=[\\s.,;:!?)\\]}،。、]|$)`;

	return new RegExp(fullPattern, 'giu');
}

function parseVerseReference(match: RegExpExecArray, variationMap: Map<string, VariationLookup>): ParsedVerseReference {
	const fullMatch = match[1];
	const bookMatch = match[2];
	const referenceMatch = match[3];
	const versionMatch = match[4];

	const lookupResult = variationMap.get(bookMatch.toLowerCase().replace(/\.$/, ''));

	const parsed: ParsedVerseReference = {
		original: fullMatch,
		book: lookupResult?.canonical ?? bookMatch,
		bookVariation: bookMatch.replace(/\.$/, ''),
		detectedLanguage: lookupResult?.language ?? 'en',
		reference: referenceMatch,
		chapters: [],
		startIndex: match.index + (match[0].length - match[1].length),
		endIndex: match.index + match[0].length,
		version: versionMatch || undefined
	};

	if (referenceMatch) {
		const chapterVersePattern = /(\d{1,3})(?:\s*[:.;]\s*(\d{1,3}(?:\s*[-\u2013\u2014]\s*\d{1,3})?))?/g;
		let cvMatch: RegExpExecArray | null;
		while ((cvMatch = chapterVersePattern.exec(referenceMatch)) !== null) {
			const chapter: ParsedChapter = {
				chapter: parseInt(cvMatch[1], 10),
				verses: []
			};
			if (cvMatch[2]) {
				const verseParts = cvMatch[2].split(/\s*[-\u2013\u2014]\s*/);
				if (verseParts.length === 2) {
					chapter.startVerse = parseInt(verseParts[0], 10);
					chapter.endVerse = parseInt(verseParts[1], 10);
				} else {
					chapter.startVerse = parseInt(verseParts[0], 10);
					chapter.endVerse = chapter.startVerse;
				}
			}
			parsed.chapters.push(chapter);
		}
	}

	return parsed;
}

export function VerseDetectionPlugin(
	app: BrowserBibleApp | null,
	options: VerseDetectionPluginOptions = {}
): VerseDetectionPluginAPI {
	let primaryLanguage = options.language ?? detectDocumentLanguage();

	if (!SUPPORTED_LANGUAGES.includes(primaryLanguage as LanguageCode)) {
		console.warn(`VerseDetectionPlugin: Unsupported language '${primaryLanguage}', falling back to English`);
		primaryLanguage = DEFAULT_LANGUAGE;
	}

	const languages: string[] = [primaryLanguage];
	if (options.additionalLanguages) {
		if (options.additionalLanguages === 'all') {
			for (const lang of SUPPORTED_LANGUAGES) {
				if (!languages.includes(lang)) {
					languages.push(lang);
				}
			}
		} else {
			for (const lang of options.additionalLanguages) {
				if (SUPPORTED_LANGUAGES.includes(lang as LanguageCode) && !languages.includes(lang)) {
					languages.push(lang);
				}
			}
		}
	}

	// English stays in the list as a fallback for untranslated book names.
	if (!languages.includes('en')) {
		languages.push('en');
	}

	const bookPatterns = getCombinedBookNames(languages);
	const variationMap = buildVariationMap(bookPatterns, languages, BOOK_NAMES);

	let currentLanguages = [...languages];

	function setLanguage(newLanguages: string | string[]): void {
		const langArray = Array.isArray(newLanguages) ? newLanguages : [newLanguages];
		const validLangs = langArray.filter(l => SUPPORTED_LANGUAGES.includes(l as LanguageCode));

		if (validLangs.length === 0) {
			console.warn('VerseDetectionPlugin: No valid languages provided');
			return;
		}

		if (!validLangs.includes('en')) {
			validLangs.push('en');
		}

		currentLanguages = validLangs;

		variationMap.clear();
		for (const lang of currentLanguages) {
			const langPatterns = BOOK_NAMES[lang as LanguageCode];
			if (!langPatterns) continue;

			for (const [canonical, variations] of Object.entries(langPatterns) as [CanonicalBookName, string[]][]) {
				for (const variation of variations) {
					const key = variation.toLowerCase();
					if (!variationMap.has(key)) {
						variationMap.set(key, { canonical, language: lang });
					}
				}
			}
		}
	}

	/** A fresh regex each call, since the shared one carries lastIndex state. */
	function getRegex(): RegExp {
		const patterns = getCombinedBookNames(currentLanguages);
		return buildVerseRegex(patterns);
	}

	function detectVerses(text: string): ParsedVerseReference[] {
		if (!text || typeof text !== 'string') {
			return [];
		}

		const results: ParsedVerseReference[] = [];
		const regex = getRegex();
		let match: RegExpExecArray | null;

		while ((match = regex.exec(text)) !== null) {
			const parsed = parseVerseReference(match, variationMap);
			results.push(parsed);
		}

		return results;
	}

	function replaceVerses(text: string, formatter: (verse: ParsedVerseReference) => string): string {
		if (!text || typeof text !== 'string') {
			return text;
		}

		const verses = detectVerses(text);
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
	function linkVerses(text: string, baseUrl: string = ''): string {
		return replaceVerses(text, (verse) => {
			const href = baseUrl
				? `${baseUrl}?ref=${encodeURIComponent(verse.book + ' ' + verse.reference)}`
				: `javascript:void(0)`;
			const dataRef = `${verse.book} ${verse.reference}`;
			return `<a href="${href}" class="verse-link" data-verse-ref="${dataRef}">${verse.original}</a>`;
		});
	}

	/** "Jhn 3:16" becomes "John 3:16"; null when nothing parses. */
	function normalizeReference(reference: string): string | null {
		const verses = detectVerses(reference);
		if (verses.length === 0) {
			return null;
		}
		const first = verses[0];
		return `${first.book} ${first.reference}`;
	}

	function containsVerses(text: string): boolean {
		if (!text || typeof text !== 'string') {
			return false;
		}
		const regex = getRegex();
		return regex.test(text);
	}

	function getBookPatterns(): Partial<Record<CanonicalBookName, string[]>> {
		return getCombinedBookNames(currentLanguages);
	}

	function getCanonicalBookName(variation: string): VariationLookup | null {
		return variationMap.get(variation.toLowerCase()) || null;
	}

	function getCurrentLanguages(): string[] {
		return [...currentLanguages];
	}

	function getSupportedLanguages(): string[] {
		return [...SUPPORTED_LANGUAGES];
	}

	const api: VerseDetectionPluginAPI = {
		name: 'VerseDetectionPlugin',
		detectVerses,
		containsVerses,
		replaceVerses,
		linkVerses,
		normalizeReference,
		setLanguage,
		getCurrentLanguages,
		getSupportedLanguages,
		detectDocumentLanguage,
		getBookPatterns,
		getCanonicalBookName,
		getVerseRegex: getRegex
	};

	if (app) {
		if (typeof app.on === 'function') {
			app.on('languagechange', (lang: string) => {
				if (lang && SUPPORTED_LANGUAGES.includes(lang as LanguageCode)) {
					setLanguage([lang, 'en']);
				}
			});
		}
	}

	return api;
}

export const createVerseDetector = (options: VerseDetectionPluginOptions = {}): VerseDetectionPluginAPI =>
	VerseDetectionPlugin(null, options);

export async function initVerseDetection(
	app: BrowserBibleApp | null = null,
	userConfig: PartialVerseDetectionConfig = {}
): Promise<InitializedVerseDetection> {
	const { config, mergeConfig } = await import('./config.js');
	const { VersePopup } = await import('./VersePopup.js');

	const finalConfig = mergeConfig(userConfig);

	const detectorOptions: VerseDetectionPluginOptions = {
		language: finalConfig.language.autoDetect ? undefined : (finalConfig.language.primary ?? undefined),
		additionalLanguages: finalConfig.language.additional
	};
	const detector = VerseDetectionPlugin(app, detectorOptions);

	let popup: VersePopup | null = null;
	if (finalConfig.displayMode === 'popup' || finalConfig.displayMode === 'both') {
		popup = new VersePopup(finalConfig);
		await popup.init(app ?? undefined);
	}

	function getTextIdForLanguage(lang: string): string {
		const contentConfig = finalConfig.contentSource;
		const textIdsByLanguage = contentConfig?.textIdsByLanguage || {};
		return getTextIdForLanguageUtil(lang, textIdsByLanguage, finalConfig.defaultTextId);
	}

	function buildVerseUrl(verse: ParsedVerseReference): string {
		return buildVerseUrlUtil({
			book: verse.book,
			reference: verse.reference,
			detectedLanguage: verse.detectedLanguage,
			version: verse.version
		}, finalConfig);
	}

	/** Null means every language is linkable; a set restricts it. */
	let availableTextLanguages: Set<string> | null = null;

	function processText(text: string): string {
		const mode = finalConfig.displayMode;
		const linkConfig = finalConfig.link;
		const stylingConfig = finalConfig.styling;

		return detector.replaceVerses(text, (verse) => {
			// Leave the reference as plain text when we have nothing to link it to.
			const detectedLang = verse.detectedLanguage || 'en';
			if (availableTextLanguages && !availableTextLanguages.has(detectedLang)) {
				return verse.original;
			}

			const classes = [linkConfig.cssClass];
			if (stylingConfig.highlightVerses) {
				classes.push(stylingConfig.highlightClass);
			}

			const bookCode = BOOK_CODES[verse.book as CanonicalBookName] ?? '';
			const chapterMatch = verse.reference?.match(/^(\d+)/);
			const verseMatch = verse.reference?.match(/:(\d+)/);
			const chapter = chapterMatch ? chapterMatch[1] : '';
			const verseNum = verseMatch ? verseMatch[1] : '';
			const sectionId = bookCode && chapter ? `${bookCode}${chapter}` : '';

			const versionAttr = verse.version ? ` data-version="${verse.version}"` : '';
			const dataAttrs = linkConfig.addDataAttributes
				? `data-verse-ref="${verse.book} ${verse.reference}" data-book="${verse.book}" data-book-code="${bookCode}" data-chapter="${chapter}" data-verse="${verseNum}" data-section-id="${sectionId}" data-detected-lang="${detectedLang}"${versionAttr}`
				: '';

			let href = 'javascript:void(0)';
			if (mode === 'link' || mode === 'both') {
				href = buildVerseUrl(verse);
			}

			const target = linkConfig.openInNewTab ? ' target="_blank" rel="noopener"' : '';
			const style = stylingConfig.underline ? '' : ' style="text-decoration:none"';

			return `<a href="${href}" class="${classes.join(' ')}" ${dataAttrs}${target}${style}>${verse.original}</a>`;
		});
	}

	function processContainer(container: HTMLElement): void {
		const walker = document.createTreeWalker(
			container,
			NodeFilter.SHOW_TEXT,
			{
				acceptNode: (node: Text) => {
					const parent = node.parentElement;
					if (!parent) return NodeFilter.FILTER_REJECT;

					const excludeSelectors = finalConfig.detection.excludeSelectors;
					if (excludeSelectors && parent.closest(excludeSelectors)) {
						return NodeFilter.FILTER_REJECT;
					}

					if (!detector.containsVerses(node.textContent ?? '')) {
						return NodeFilter.FILTER_REJECT;
					}

					return NodeFilter.FILTER_ACCEPT;
				}
			}
		);

		const nodesToProcess: Text[] = [];
		let node: Node | null;
		while ((node = walker.nextNode())) {
			nodesToProcess.push(node as Text);
		}

		nodesToProcess.forEach((textNode) => {
			const html = processText(textNode.textContent ?? '');
			const span = document.createElement('span');
			span.innerHTML = html;
			textNode.parentNode?.replaceChild(span, textNode);
		});

		if (popup) {
			popup.attach(container);
		}
	}

	/**
	 * Verses in other languages are still detected, just not linked. Passing a
	 * textIdsByLanguage object also repoints generated URLs at those versions.
	 */
	function setAvailableTextLanguages(languages: string[] | Record<string, string> | null): void {
		if (Array.isArray(languages)) {
			availableTextLanguages = new Set(languages);
		} else if (languages && typeof languages === 'object') {
			availableTextLanguages = new Set(Object.keys(languages));
			finalConfig.contentSource.textIdsByLanguage = { ...languages };
		} else {
			availableTextLanguages = null;
		}
	}

	function hasTextForLanguage(lang: string): boolean {
		if (!availableTextLanguages) return true;
		return availableTextLanguages.has(lang);
	}

	return {
		...detector,
		popup,
		config: finalConfig,
		processText,
		processContainer,
		setAvailableTextLanguages,
		hasTextForLanguage,

		destroy(): void {
			if (popup) {
				popup.destroy();
			}
		}
	};
}

export {
	BOOK_NAMES,
	SUPPORTED_LANGUAGES,
	DEFAULT_LANGUAGE,
	getBookNames,
	getCombinedBookNames
};

export default VerseDetectionPlugin;

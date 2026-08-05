import { BOOK_NAMES, type CanonicalBookName, type LanguageCode } from './bookNames.js';

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

export interface VariationLookup {
	canonical: string;
	language: string;
}

/** Reverse lookup from a book-name variation to its canonical name; earlier languages win. */
export function buildVariationMap(
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
export function buildVerseRegex(bookPatterns: Partial<Record<CanonicalBookName, string[]>>): RegExp {
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

function parseChapterRanges(referenceMatch: string): ParsedChapter[] {
	const chapters: ParsedChapter[] = [];
	if (!referenceMatch) {
		return chapters;
	}

	const chapterVersePattern = /(\d{1,3})(?:\s*[:.;]\s*(\d{1,3}(?:\s*[-\u2013\u2014]\s*\d{1,3})?))?/g;
	let cvMatch: RegExpExecArray | null;
	while ((cvMatch = chapterVersePattern.exec(referenceMatch)) !== null) {
		const chapter: ParsedChapter = {
			chapter: parseInt(cvMatch[1], 10),
			verses: []
		};
		if (cvMatch[2]) {
			const verseParts = cvMatch[2].split(/\s*[-\u2013\u2014]\s*/);
			chapter.startVerse = parseInt(verseParts[0], 10);
			chapter.endVerse = verseParts.length === 2
				? parseInt(verseParts[1], 10)
				: chapter.startVerse;
		}
		chapters.push(chapter);
	}

	return chapters;
}

export function parseVerseReference(match: RegExpExecArray, variationMap: Map<string, VariationLookup>): ParsedVerseReference {
	const fullMatch = match[1];
	const bookMatch = match[2];
	const referenceMatch = match[3];
	const versionMatch = match[4];

	const lookupResult = variationMap.get(bookMatch.toLowerCase().replace(/\.$/, ''));

	return {
		original: fullMatch,
		book: lookupResult?.canonical ?? bookMatch,
		bookVariation: bookMatch.replace(/\.$/, ''),
		detectedLanguage: lookupResult?.language ?? 'en',
		reference: referenceMatch,
		chapters: parseChapterRanges(referenceMatch),
		startIndex: match.index + (match[0].length - match[1].length),
		endIndex: match.index + match[0].length,
		version: versionMatch || undefined
	};
}

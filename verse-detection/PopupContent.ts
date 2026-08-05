import { BOOK_CODES } from './BookCodes.js';
import type { CanonicalBookName } from './bookNames.js';
import type { VerseDetectionConfig } from './config.js';
import { getLanguageName } from './LanguageCodeMapper.js';
import { getTextId } from './VerseUrlBuilder.js';
import { extractVerses, type ExtractedFootnote } from './VerseExtractor.js';
import type { BrowserBibleApp, ParsedReference, TextInfo, TextLoader } from './PopupTypes.js';

export interface CachedVerseContent {
	content: string;
	footnotes: ExtractedFootnote[];
}

export interface VerseContentState {
	config: VerseDetectionConfig;
	cache: Map<string, CachedVerseContent>;
	textLoader: TextLoader | null;
	app: BrowserBibleApp | null;
}

export async function loadAppTextLoader(): Promise<TextLoader | null> {
	try {
		// Path goes through a variable so bundlers don't try to resolve
		// the host app's TextLoader when this package builds standalone.
		const textLoaderPath = '../js/texts/TextLoader.js';
		const textLoaderModule = await import(/* @vite-ignore */ textLoaderPath);
		return textLoaderModule as TextLoader;
	} catch (e) {
		console.warn('VersePopup: Could not load TextLoader (standalone mode)', e);
		return null;
	}
}

/** "John 3:16", "1 John 2:3-4", or chapter-only "Psalm 23". */
export function parsePopupReference(reference: string): ParsedReference | null {
	const match = reference.match(/^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);
	if (!match) return null;

	const [, bookName, chapter, startVerse, endVerse] = match;
	const bookCode = BOOK_CODES[bookName as CanonicalBookName];

	if (!bookCode) return null;

	return {
		book: bookName,
		bookCode,
		chapter: parseInt(chapter, 10),
		startVerse: startVerse ? parseInt(startVerse, 10) : null,
		endVerse: endVerse ? parseInt(endVerse, 10) : (startVerse ? parseInt(startVerse, 10) : null),
		sectionId: `${bookCode}${chapter}`,
		verseId: startVerse ? `${bookCode}${chapter}_${startVerse}` : null
	};
}

function buildVerseCacheKey(reference: string, detectedLang: string | null, version?: string): string {
	if (version) {
		return `${reference}:${version}`;
	}
	return detectedLang ? `${reference}:${detectedLang}` : reference;
}

function resolveTextId(state: VerseContentState, detectedLang: string | null, version?: string): string {
	const textId = version ?? getTextId(detectedLang, state.config);
	if (!textId) {
		const langName = getLanguageName(detectedLang);
		throw new Error(`No Bible text available for ${langName}`);
	}
	return textId;
}

function extractVerseContent(state: VerseContentState, html: string, parsed: ParsedReference): CachedVerseContent {
	return extractVerses(html, parsed, {
		showVerseNumbers: state.config.popup.showVerseNumbers
	});
}

export async function fetchVerseContent(
	state: VerseContentState,
	reference: string,
	detectedLang: string | null = null,
	version?: string
): Promise<CachedVerseContent> {
	const cacheKey = buildVerseCacheKey(reference, detectedLang, version);

	if (state.config.popup.cacheContent && state.cache.has(cacheKey)) {
		return state.cache.get(cacheKey)!;
	}

	const parsed = parsePopupReference(reference);
	if (!parsed) {
		throw new Error('Invalid verse reference');
	}

	const result = await fetchBySourceType(state, parsed, detectedLang, version);

	if (state.config.popup.cacheContent) {
		state.cache.set(cacheKey, {
			content: result.content,
			footnotes: [...result.footnotes]
		});
	}

	return result;
}

function fetchBySourceType(
	state: VerseContentState,
	parsed: ParsedReference,
	detectedLang: string | null,
	version?: string
): Promise<CachedVerseContent> {
	const sourceType = state.config.contentSource?.type || 'remote';

	if (sourceType === 'app') {
		if (state.textLoader && state.app) {
			return fetchFromTextLoader(state, parsed, detectedLang, version);
		}
		throw new Error('App TextLoader not available');
	}

	return fetchChapterAndExtractVerses(state, parsed, detectedLang, version);
}

export async function fetchChapterAndExtractVerses(
	state: VerseContentState,
	parsed: ParsedReference,
	detectedLang: string | null = null,
	version?: string
): Promise<CachedVerseContent> {
	const contentConfig = state.config.contentSource;
	const devTexts = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('dev') === 'true' ? 'texts_dev' : 'texts';
	const baseUrl = contentConfig?.baseUrl || `https://inscript.bible.cloud/content/${devTexts}`;
	const textId = resolveTextId(state, detectedLang, version);

	const pathTemplate = contentConfig?.pathTemplate || '{baseUrl}/{textId}/{sectionId}.html';

	const url = pathTemplate
		.replace('{baseUrl}', baseUrl)
		.replace('{textId}', textId)
		.replace('{sectionId}', parsed.sectionId);

	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to load chapter: ${response.status}`);
		}

		const html = await response.text();
		return extractVerseContent(state, html, parsed);
	} catch (error) {
		console.error('Chapter fetch error:', error);
		throw new Error('Chapter not available');
	}
}

export function fetchFromTextLoader(
	state: VerseContentState,
	parsed: ParsedReference,
	detectedLang: string | null = null,
	version?: string
): Promise<CachedVerseContent> {
	return new Promise((resolve, reject) => {
		// A throw here rejects the promise, matching the remote fetch path.
		const textId = resolveTextId(state, detectedLang, version);

		const textLoader = state.textLoader;
		if (!textLoader) {
			reject(new Error('TextLoader not available'));
			return;
		}

		textLoader.getText(textId, (textInfo: TextInfo) => {
			textLoader.loadSection(textInfo, parsed.sectionId, (html: string) => {
				resolve(extractVerseContent(state, html, parsed));
			}, () => {
				reject(new Error('Failed to load chapter'));
			});
		}, () => {
			reject(new Error('Failed to load text info'));
		});
	});
}

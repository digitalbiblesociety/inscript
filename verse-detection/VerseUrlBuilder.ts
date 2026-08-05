import { BOOK_CODES } from './BookCodes.js';
import type { CanonicalBookName } from './bookNames.js';
import type { VerseDetectionConfig } from './config.js';

export interface VerseReferenceForUrl {
	book: string;
	reference: string;
	detectedLanguage?: string;
	version?: string;
}

export interface TextIdConfig {
	textId?: string | null;
	textIdsByLanguage?: Record<string, string>;
	autoSelectByLanguage?: boolean;
}

export interface GetTextIdConfig {
	contentSource?: TextIdConfig;
	defaultTextId?: string | null;
	language?: {
		primary?: string | null;
	};
}

/**
 * Falls back through default and English so link generation always yields
 * something. Contrast getTextId, which refuses to substitute another language.
 */
export function getTextIdForLanguage(
	lang: string,
	textIdsByLanguage: Record<string, string>,
	defaultTextId?: string | null
): string {
	if (textIdsByLanguage[lang]) {
		return textIdsByLanguage[lang];
	}

	if (defaultTextId) {
		return defaultTextId;
	}

	if (textIdsByLanguage['en']) {
		return textIdsByLanguage['en'];
	}

	return '';
}

function autoSelectTextId(
	textIdsByLanguage: Record<string, string>,
	primaryLanguage: string | null | undefined
): string | null {
	const language = primaryLanguage ?? 'en';

	if (textIdsByLanguage[language]) {
		return textIdsByLanguage[language];
	}

	if (textIdsByLanguage['en']) {
		return textIdsByLanguage['en'];
	}

	const availableLanguages = Object.keys(textIdsByLanguage);
	return availableLanguages.length > 0 ? textIdsByLanguage[availableLanguages[0]] : null;
}

/**
 * Returns null rather than a wrong-language text when detectedLang has no
 * mapping, which is what suppresses the popup for unsupported languages.
 */
export function getTextId(
	detectedLang: string | null = null,
	config: GetTextIdConfig
): string | null {
	const contentConfig = config.contentSource;
	const textIdsByLanguage = contentConfig?.textIdsByLanguage || {};

	if (detectedLang) {
		return textIdsByLanguage[detectedLang] || null;
	}

	if (contentConfig?.textId) {
		return contentConfig.textId;
	}

	if (config.defaultTextId) {
		return config.defaultTextId;
	}

	return contentConfig?.autoSelectByLanguage
		? autoSelectTextId(textIdsByLanguage, config.language?.primary)
		: null;
}

export function buildVerseUrl(
	verse: VerseReferenceForUrl,
	config: VerseDetectionConfig
): string {
	const linkConfig = config.link;
	const appBaseUrl = config.appBaseUrl || '';
	const textIdsByLanguage = config.contentSource?.textIdsByLanguage || {};

	// An explicit version, as in "John 3:16 (KJV)", wins over the language mapping.
	const textId = verse.version
		? verse.version
		: getTextIdForLanguage(
			verse.detectedLanguage ?? 'en',
			textIdsByLanguage,
			config.defaultTextId
		);

	const chapterMatch = verse.reference?.match(/^(\d+)/);
	const verseMatch = verse.reference?.match(/:(\d+)/);
	const chapter = chapterMatch ? chapterMatch[1] : '';
	const verseNum = verseMatch ? verseMatch[1] : '';

	const bookCode = BOOK_CODES[verse.book as CanonicalBookName] ?? '';
	const sectionId = bookCode && chapter ? `${bookCode}${chapter}` : '';
	const fragmentId = sectionId && verseNum ? `${sectionId}_${verseNum}` : sectionId;

	if (linkConfig.urlTemplate) {
		return linkConfig.urlTemplate
			.replace('{ref}', encodeURIComponent(`${verse.book} ${verse.reference}`))
			.replace('{book}', encodeURIComponent(verse.book))
			.replace('{bookCode}', bookCode)
			.replace('{chapter}', chapter)
			.replace('{verse}', verseNum)
			.replace('{version}', textId)
			.replace('{sectionId}', sectionId)
			.replace('{fragmentId}', fragmentId);
	}

	let url = appBaseUrl;

	if (config.versionLinking?.includeVersion && textId) {
		const versionParam = config.versionLinking.versionParam || 'version';
		url += url.includes('?') ? '&' : '?';
		url += `${versionParam}=${encodeURIComponent(textId)}`;
	}

	if (linkConfig.useHashNavigation && fragmentId) {
		url += `#${fragmentId}`;
	} else {
		const refParam = linkConfig.refParam || 'ref';
		url += url.includes('?') ? '&' : '?';
		url += `${refParam}=${encodeURIComponent(`${verse.book} ${verse.reference}`)}`;
	}

	return url || 'javascript:void(0)';
}

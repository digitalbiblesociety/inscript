import { buildTextIdsByLanguage, normalizeLangCode } from './LanguageCodeMapper.js';
import type { VerseDetectionConfig } from './config.js';
import type { TextInfo } from './PopupTypes.js';

export interface TextsIndexResult {
	textsIndexData: TextInfo[] | null;
	loaded: boolean;
}

export function applyTextIdMapping(config: VerseDetectionConfig, textsIndexData: TextInfo[] | null): void {
	const preferred = config.contentSource.preferredTextIdsByLanguage || {};
	config.contentSource.textIdsByLanguage = buildTextIdsByLanguage(textsIndexData, preferred);
}

function usePreferredMappingOnly(config: VerseDetectionConfig): TextsIndexResult {
	config.contentSource.textIdsByLanguage = {
		...config.contentSource.preferredTextIdsByLanguage as Record<string, string>
	};
	return { textsIndexData: null, loaded: false };
}

export async function loadTextsIndex(config: VerseDetectionConfig): Promise<TextsIndexResult> {
	const textsIndexUrl = config.contentSource?.textsIndexUrl;

	if (!textsIndexUrl) {
		console.warn('VersePopup: No textsIndexUrl configured, using preferredTextIdsByLanguage only');
		return usePreferredMappingOnly(config);
	}

	try {
		const response = await fetch(textsIndexUrl);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const data = await response.json();
		const textsIndexData = (data.textInfoData || data) as TextInfo[];

		applyTextIdMapping(config, textsIndexData);

		console.log('VersePopup: Loaded texts index, built language mappings:', config.contentSource.textIdsByLanguage);
		return { textsIndexData, loaded: true };
	} catch (error) {
		console.error('VersePopup: Error loading texts index:', error);
		return usePreferredMappingOnly(config);
	}
}

export function getTextsForLanguageFromIndex(textsIndexData: TextInfo[] | null, langCode: string): TextInfo[] {
	if (!textsIndexData || !Array.isArray(textsIndexData)) {
		return [];
	}

	return textsIndexData.filter(textInfo => {
		if (textInfo.type && textInfo.type !== 'bible') return false;
		if (textInfo.hasText === false) return false;

		const textLangCode = normalizeLangCode(
			textInfo.lang,
			textInfo.langNameEnglish ?? textInfo.langName
		);
		return textLangCode === langCode;
	});
}

/** Language code to number of available texts. */
export function getAvailableLanguagesFromIndex(textsIndexData: TextInfo[] | null): Record<string, number> {
	if (!textsIndexData || !Array.isArray(textsIndexData)) {
		return {};
	}

	const languages: Record<string, number> = {};

	for (const textInfo of textsIndexData) {
		if (textInfo.type && textInfo.type !== 'bible') continue;
		if (textInfo.hasText === false) continue;

		const langCode = normalizeLangCode(
			textInfo.lang,
			textInfo.langNameEnglish ?? textInfo.langName
		);

		if (langCode) {
			languages[langCode] = (languages[langCode] || 0) + 1;
		}
	}

	return languages;
}

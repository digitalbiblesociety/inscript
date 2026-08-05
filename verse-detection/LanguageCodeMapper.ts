import type { TextInfo } from './PopupTypes.js';

const ISO_639_3_TO_1: Record<string, string> = {
	'eng': 'en', 'spa': 'es', 'por': 'pt', 'fra': 'fr', 'deu': 'de',
	'rus': 'ru', 'ara': 'ar', 'hin': 'hi', 'zho': 'zh', 'cmn': 'zh',
	'ind': 'id', 'ita': 'it', 'nld': 'nl', 'pol': 'pl', 'kor': 'ko',
	'jpn': 'ja', 'vie': 'vi', 'tha': 'th', 'tur': 'tr', 'ukr': 'uk',
	'swe': 'sv', 'nor': 'no', 'dan': 'da', 'fin': 'fi', 'ces': 'cs',
	'ell': 'el', 'heb': 'he', 'hun': 'hu', 'ron': 'ro', 'bul': 'bg'
};

const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
	'english': 'en', 'spanish': 'es', 'portuguese': 'pt', 'french': 'fr',
	'german': 'de', 'russian': 'ru', 'arabic': 'ar', 'hindi': 'hi',
	'chinese': 'zh', 'indonesian': 'id', 'italian': 'it', 'dutch': 'nl'
};

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
	'en': 'English', 'es': 'Spanish', 'pt': 'Portuguese', 'fr': 'French',
	'de': 'German', 'ru': 'Russian', 'ar': 'Arabic', 'hi': 'Hindi',
	'zh': 'Chinese', 'id': 'Indonesian', 'it': 'Italian', 'nl': 'Dutch',
	'pl': 'Polish', 'ko': 'Korean', 'ja': 'Japanese', 'vi': 'Vietnamese',
	'th': 'Thai', 'tr': 'Turkish', 'uk': 'Ukrainian', 'sv': 'Swedish',
	'no': 'Norwegian', 'da': 'Danish', 'fi': 'Finnish', 'cs': 'Czech',
	'el': 'Greek', 'he': 'Hebrew', 'hu': 'Hungarian', 'ro': 'Romanian',
	'bg': 'Bulgarian'
};

/** ISO 639-3 to ISO 639-1 ('eng' to 'en'), matching on langName when the code is unknown. */
export function normalizeLangCode(lang3: string | undefined, langName?: string): string | null {
	if (lang3 && ISO_639_3_TO_1[lang3.toLowerCase()]) {
		return ISO_639_3_TO_1[lang3.toLowerCase()];
	}

	if (langName) {
		const normalized = langName.toLowerCase();
		for (const [name, code] of Object.entries(LANGUAGE_NAME_TO_CODE)) {
			if (normalized.includes(name)) {
				return code;
			}
		}
	}

	// Unmappable codes pass through unchanged rather than becoming null.
	return lang3?.toLowerCase() ?? null;
}

export function getLanguageName(langCode: string | null | undefined): string {
	return LANGUAGE_DISPLAY_NAMES[langCode ?? ''] ?? langCode ?? 'this language';
}

function groupBibleTextsByLanguage(textsData: TextInfo[]): Map<string, TextInfo[]> {
	const textsByLanguage = new Map<string, TextInfo[]>();

	for (const textInfo of textsData) {
		const textType = textInfo.type ?? 'bible';
		if (textType !== 'bible') continue;

		if (textInfo.hasText === false) continue;

		const langCode = normalizeLangCode(textInfo.lang, textInfo.langNameEnglish ?? textInfo.langName);

		if (!langCode) continue;

		if (!textsByLanguage.has(langCode)) {
			textsByLanguage.set(langCode, []);
		}
		textsByLanguage.get(langCode)!.push(textInfo);
	}

	return textsByLanguage;
}

function findPreferredTextId(texts: TextInfo[], preferredForLang: string | string[]): string | null {
	const idsToCheck = Array.isArray(preferredForLang) ? preferredForLang : [preferredForLang];

	for (const prefId of idsToCheck) {
		const found = texts.find(t => t.id === prefId || t.id.toUpperCase() === prefId.toUpperCase());
		if (found) {
			return found.id;
		}
	}

	return null;
}

function selectTextIdForLanguage(texts: TextInfo[], preferredForLang: string | string[] | undefined): string | null {
	if (preferredForLang) {
		const preferredId = findPreferredTextId(texts, preferredForLang);
		if (preferredId) {
			return preferredId;
		}
	}

	if (texts.length === 0) {
		return null;
	}

	// Sort so the fallback pick is stable across index orderings.
	texts.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
	return texts[0].id;
}

/** Picks one text per language, honouring preferredIds and falling back to first by name. */
export function buildTextIdsByLanguage(
	textsData: TextInfo[] | null | undefined,
	preferredIds: Record<string, string | string[]> = {}
): Record<string, string> {
	if (!textsData || !Array.isArray(textsData)) {
		return {};
	}

	const mapping: Record<string, string> = {};

	for (const [langCode, texts] of groupBibleTextsByLanguage(textsData)) {
		const selectedTextId = selectTextIdForLanguage(texts, preferredIds[langCode]);
		if (selectedTextId) {
			mapping[langCode] = selectedTextId;
		}
	}

	return mapping;
}

export {
	ISO_639_3_TO_1,
	LANGUAGE_NAME_TO_CODE,
	LANGUAGE_DISPLAY_NAMES
};

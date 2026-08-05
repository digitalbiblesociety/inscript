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

import type { VersePopup, BrowserBibleApp } from './VersePopup.js';
import * as core from './DetectorCore.js';
import { detectDocumentLanguage, type VerseDetectionPluginOptions } from './DetectorCore.js';
import type { ParsedVerseReference, VariationLookup } from './ReferenceParser.js';
import {
	applyAvailableTextLanguages,
	linkifyContainer,
	renderVerseLink,
	type LinkableLanguages
} from './DomLinker.js';

export type { ParsedChapter, ParsedVerseReference } from './ReferenceParser.js';
export type { VerseDetectionPluginOptions } from './DetectorCore.js';

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

export function VerseDetectionPlugin(
	app: BrowserBibleApp | null,
	options: VerseDetectionPluginOptions = {}
): VerseDetectionPluginAPI {
	const state = core.createDetectorState(options);

	const api: VerseDetectionPluginAPI = {
		name: 'VerseDetectionPlugin',
		detectVerses: (text) => core.detectVerses(state, text),
		containsVerses: (text) => core.containsVerses(state, text),
		replaceVerses: (text, formatter) => core.replaceVerses(state, text, formatter),
		linkVerses: (text, baseUrl) => core.linkVerses(state, text, baseUrl),
		normalizeReference: (reference) => core.normalizeReference(state, reference),
		setLanguage: (newLanguages) => core.setLanguage(state, newLanguages),
		getCurrentLanguages: () => [...state.currentLanguages],
		getSupportedLanguages: () => [...SUPPORTED_LANGUAGES],
		detectDocumentLanguage,
		getBookPatterns: () => getCombinedBookNames(state.currentLanguages),
		getCanonicalBookName: (variation) => state.variationMap.get(variation.toLowerCase()) || null,
		getVerseRegex: () => core.buildCurrentRegex(state)
	};

	if (app && typeof app.on === 'function') {
		app.on('languagechange', (lang: string) => {
			if (lang && SUPPORTED_LANGUAGES.includes(lang as LanguageCode)) {
				core.setLanguage(state, [lang, 'en']);
			}
		});
	}

	return api;
}

export const createVerseDetector = (options: VerseDetectionPluginOptions = {}): VerseDetectionPluginAPI =>
	VerseDetectionPlugin(null, options);

export async function initVerseDetection(
	app: BrowserBibleApp | null = null,
	userConfig: PartialVerseDetectionConfig = {}
): Promise<InitializedVerseDetection> {
	const { mergeConfig } = await import('./config.js');
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

	const linkable: LinkableLanguages = { set: null };

	function processText(text: string): string {
		return detector.replaceVerses(text, (verse) => renderVerseLink(verse, finalConfig, linkable));
	}

	function processContainer(container: HTMLElement): void {
		linkifyContainer(container, detector.containsVerses, finalConfig.detection.excludeSelectors, processText);
		if (popup) {
			popup.attach(container);
		}
	}

	return {
		...detector,
		popup,
		config: finalConfig,
		processText,
		processContainer,
		setAvailableTextLanguages: (languages) => applyAvailableTextLanguages(linkable, finalConfig, languages),
		hasTextForLanguage: (lang) => !linkable.set || linkable.set.has(lang),

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
	getCombinedBookNames,
	detectDocumentLanguage
};

export default VerseDetectionPlugin;

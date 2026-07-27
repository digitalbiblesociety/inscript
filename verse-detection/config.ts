export type DisplayMode = 'link' | 'popup' | 'both';

export type ContentSourceType = 'local' | 'remote' | 'app';

export type PopupPosition = 'auto' | 'above' | 'below';

const _isDevMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('dev') === 'true';
const _textsSegment = _isDevMode ? 'texts_dev' : 'texts';

export interface ContentSourceConfig {
	/** 'local' content folder, 'remote' content server, or 'app' to reuse the host app's TextLoader */
	type: ContentSourceType;
	baseUrl: string;
	textsIndexUrl: string;
	/** Falls back to the language-specific default in textIdsByLanguage when null */
	textId: string | null;
	autoSelectByLanguage: boolean;
	/** Build textIdsByLanguage from textsIndexUrl instead of using preferences alone */
	dynamicTextSelection: boolean;
	/** Priority list per language; an array gives fallback order */
	preferredTextIdsByLanguage: Record<string, string | string[]>;
	textIdsByLanguage: Record<string, string>;
	/** Placeholders: {baseUrl}, {textId}, {sectionId} */
	pathTemplate: string;
}

export interface VersionLinkingConfig {
	includeVersion: boolean;
	versionParam: string;
	/** Let the host app's configuration override these settings */
	respectAppConfig: boolean;
}

export interface PopupConfig {
	/** Milliseconds to hover before the popup appears */
	showDelay: number;
	/** Milliseconds after the mouse leaves before the popup hides */
	hideDelay: number;
	maxWidth: number;
	/** Pixels the popup grows to before its content starts scrolling */
	maxHeight: number;
	showVerseNumbers: boolean;
	showHeader: boolean;
	cssClass: string;
	position: PopupPosition;
	showLoadingIndicator: boolean;
	cacheContent: boolean;
	showLogo: boolean;
	logoUrl: string;
	showSocialShare: boolean;
	/** Buttons render in array order */
	socialSharePlatforms: ('facebook' | 'x' | 'bluesky' | 'copy')[];
}

export interface LinkConfig {
	/**
	 * Overrides appBaseUrl-based generation when set. Placeholders: {ref}, {book},
	 * {bookCode}, {chapter}, {verse}, {version}, {sectionId}, {fragmentId}.
	 */
	urlTemplate: string | null;
	refParam: string;
	cssClass: string;
	openInNewTab: boolean;
	/** Adds data-verse-ref, data-book, data-chapter, data-verse, data-section-id */
	addDataAttributes: boolean;
	/** Emit '#JN3_16' rather than '?ref=...' */
	useHashNavigation: boolean;
}

export interface StylingConfig {
	highlightVerses: boolean;
	highlightClass: string;
	underline: boolean;
}

export interface LanguageConfig {
	autoDetect: boolean;
	/** Overrides auto-detection when set */
	primary: string | null;
	/** 'all' loads every supported language */
	additional: string[] | 'all';
	alwaysIncludeEnglish: boolean;
}

export interface DetectionConfig {
	/** Guards against false positives on short words */
	minBookNameLength: number;
	/** When false, a bare "John" is a valid reference */
	requireChapter: boolean;
	/** Accept "Psalm 23" with no verse */
	allowChapterOnly: boolean;
	/** Null disables auto-scanning */
	autoScanSelectors: string | null;
	excludeSelectors: string;
}

export interface AppIntegrationConfig {
	registerAsPlugin: boolean;
	syncLanguage: boolean;
	useAppTextLoader: boolean;
	useAppNavigation: boolean;
}

export interface VerseDetectionConfig {
	/** Origin or path that generated verse links point at, e.g. 'https://inscript.org' or './' */
	appBaseUrl: string;
	/** 'both' shows a popup on hover and navigates on click */
	displayMode: DisplayMode;
	/** Falls back to the host app's active text when null */
	defaultTextId: string | null;
	contentSource: ContentSourceConfig;
	versionLinking: VersionLinkingConfig;
	popup: PopupConfig;
	link: LinkConfig;
	styling: StylingConfig;
	language: LanguageConfig;
	detection: DetectionConfig;
	appIntegration: AppIntegrationConfig;
}

export const config: VerseDetectionConfig = {
	appBaseUrl: 'https://inscript.org',

	displayMode: 'both',

	defaultTextId: null,

	contentSource: {
		type: 'remote',
		baseUrl: `https://inscript.bible.cloud/content/${_textsSegment}`,
		textsIndexUrl: `https://inscript.bible.cloud/content/${_textsSegment}/texts.json`,
		textId: null,
		autoSelectByLanguage: true,
		dynamicTextSelection: true,
		preferredTextIdsByLanguage: {
			'en': 'ENGWEB',
			'es': 'SPNRVG',
		},
		textIdsByLanguage: {},
		pathTemplate: '{baseUrl}/{textId}/{sectionId}.html'
	},

	versionLinking: {
		includeVersion: true,
		versionParam: 'version',
		respectAppConfig: true
	},

	popup: {
		showDelay: 300,
		hideDelay: 200,
		maxWidth: 450,
		maxHeight: 400,
		showVerseNumbers: true,
		showHeader: true,
		cssClass: 'verse-popup',
		position: 'auto',
		showLoadingIndicator: true,
		cacheContent: true,
		showLogo: true,
		logoUrl: 'https://inscript.org',
		showSocialShare: false,
		socialSharePlatforms: ['facebook', 'x', 'bluesky', 'copy']
	},

	link: {
		urlTemplate: null,
		refParam: 'ref',
		cssClass: 'verse-link',
		openInNewTab: false,
		addDataAttributes: true,
		useHashNavigation: true
	},

	styling: {
		highlightVerses: true,
		highlightClass: 'verse-detected',
		underline: true
	},

	language: {
		autoDetect: true,
		primary: null,
		additional: [],
		alwaysIncludeEnglish: true
	},

	detection: {
		minBookNameLength: 2,
		requireChapter: true,
		allowChapterOnly: true,
		autoScanSelectors: null,
		excludeSelectors: 'script, style, code, pre, .verse-popup, .no-verse-detect'
	},

	appIntegration: {
		registerAsPlugin: true,
		syncLanguage: true,
		useAppTextLoader: true,
		useAppNavigation: true
	}
};

export type PartialVerseDetectionConfig = {
	[K in keyof VerseDetectionConfig]?: VerseDetectionConfig[K] extends object
		? Partial<VerseDetectionConfig[K]>
		: VerseDetectionConfig[K];
};

export function mergeConfig(userConfig: PartialVerseDetectionConfig = {}): VerseDetectionConfig {
	return deepMerge(config, userConfig);
}

/** Merges one level into each top-level section; nested objects are replaced wholesale. */
function deepMerge(target: VerseDetectionConfig, source: PartialVerseDetectionConfig): VerseDetectionConfig {
	const result: VerseDetectionConfig = { ...target };

	for (const key of Object.keys(source) as (keyof VerseDetectionConfig)[]) {
		const sourceValue = source[key];
		const targetValue = target[key];

		if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
			const merged = {
				...(targetValue as object || {}),
				...(sourceValue as object)
			};
			(result as unknown as Record<string, unknown>)[key] = merged;
		} else if (sourceValue !== undefined) {
			(result as unknown as Record<string, unknown>)[key] = sourceValue;
		}
	}

	return result;
}

export default config;

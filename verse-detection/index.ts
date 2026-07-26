export {
	VerseDetectionPlugin,
	createVerseDetector,
	initVerseDetection,
	BOOK_NAMES,
	SUPPORTED_LANGUAGES,
	DEFAULT_LANGUAGE,
	getBookNames,
	getCombinedBookNames,
	detectDocumentLanguage,
	default
} from './VerseDetectionPlugin.js';

export type {
	ParsedChapter,
	ParsedVerseReference,
	VerseDetectionPluginOptions,
	VerseDetectionPluginAPI,
	InitializedVerseDetection
} from './VerseDetectionPlugin.js';

export { config, mergeConfig } from './config.js';

export type {
	DisplayMode,
	ContentSourceType,
	PopupPosition,
	ContentSourceConfig,
	VersionLinkingConfig,
	PopupConfig,
	LinkConfig,
	StylingConfig,
	LanguageConfig,
	DetectionConfig,
	AppIntegrationConfig,
	VerseDetectionConfig,
	PartialVerseDetectionConfig
} from './config.js';

export { VersePopup, createVersePopup } from './VersePopup.js';

export type {
	BookCode,
	ParsedReference,
	TextInfo,
	BrowserBibleApp,
	TextLoader
} from './VersePopup.js';

export type {
	CanonicalBookName,
	LanguageCode,
	BookNamePatterns,
	BookNamesByLanguage
} from './bookNames.js';

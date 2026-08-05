import { mergeConfig, VerseDetectionConfig, PartialVerseDetectionConfig } from './config.js';
import {
	buildSocialShareHtml as buildSocialShareHtmlUtil,
	handleSocialShare as handleSocialShareUtil
} from './SocialShareHandler.js';
import {
	buildFootnotesHtml as buildFootnotesHtmlUtil,
	type ExtractedFootnote
} from './VerseExtractor.js';
import { getTextId as getTextIdUtil } from './VerseUrlBuilder.js';
import {
	fetchVerseContent as fetchVerseContentUtil,
	loadAppTextLoader,
	parsePopupReference,
	type CachedVerseContent,
	type VerseContentState
} from './PopupContent.js';
import {
	attachVerseLinkHandlers,
	bindPopupChromeEvents,
	createPopupElement,
	detachVerseLinkHandlers,
	hidePopupElement,
	positionPopup,
	presentPopup,
	type VerseLinkListeners
} from './PopupElement.js';
import {
	handleClickInteraction,
	handleKeyDownInteraction,
	handleTouchEndInteraction,
	navigateAppToVerse,
	type PopupToggleContext
} from './PopupInteractions.js';
import { flashButtonClass, renderErrorContent, renderVerseContent } from './PopupRenderer.js';
import {
	applyTextIdMapping,
	getAvailableLanguagesFromIndex,
	getTextsForLanguageFromIndex,
	loadTextsIndex as loadTextsIndexUtil
} from './PopupTextCatalog.js';
import type { BrowserBibleApp, ParsedReference, TextInfo, TextLoader } from './PopupTypes.js';

/** Re-exported for backward compatibility. */
export type { BookCode } from './BookCodes.js';
export type { ParsedReference, TextInfo, BrowserBibleApp, TextLoader } from './PopupTypes.js';

export class VersePopup {
	private config: VerseDetectionConfig;
	private popup: HTMLDivElement | null = null;
	private currentTarget: HTMLElement | null = null;
	private showTimeout: ReturnType<typeof setTimeout> | null = null;
	private hideTimeout: ReturnType<typeof setTimeout> | null = null;
	private cache: Map<string, CachedVerseContent> = new Map();
	private textLoader: TextLoader | null = null;
	private textsIndexLoaded: boolean = false;
	private textsIndexData: TextInfo[] | null = null;
	private app: BrowserBibleApp | null = null;
	private touchStartTime: number = 0;
	private touchStartTarget: HTMLElement | null = null;
	private hasTouch: boolean = typeof document !== 'undefined' && 'ontouchend' in document;
	private collectedFootnotes: ExtractedFootnote[] = [];
	private currentReference: string = '';
	private currentContent: string = '';

	constructor(options: PartialVerseDetectionConfig = {}) {
		this.config = mergeConfig(options);

		this.handleMouseEnter = this.handleMouseEnter.bind(this);
		this.handleMouseLeave = this.handleMouseLeave.bind(this);
		this.handleClick = this.handleClick.bind(this);
		this.handleTouchStart = this.handleTouchStart.bind(this);
		this.handleTouchEnd = this.handleTouchEnd.bind(this);
		this.handleKeyDown = this.handleKeyDown.bind(this);
	}

	async init(app?: BrowserBibleApp): Promise<void> {
		if (typeof document === 'undefined') return;

		this.popup = createPopupElement(this.config);
		this.app = app || null;

		if (app && this.config.appIntegration.useAppTextLoader) {
			this.textLoader = await loadAppTextLoader();
		}

		if (this.config.contentSource?.dynamicTextSelection) {
			await this.loadTextsIndex();
		}

		bindPopupChromeEvents(this.popup, {
			clearHideTimeout: () => { this.clearHideTimeout(); },
			scheduleHide: () => { this.scheduleHide(); },
			onCrossReferenceClick: (refText) => { this.navigateToVerse(refText); }
		});

		document.addEventListener('keydown', this.handleKeyDown);
	}

	private async loadTextsIndex(): Promise<void> {
		const result = await loadTextsIndexUtil(this.config);
		this.textsIndexData = result.textsIndexData;
		this.textsIndexLoaded = result.loaded;
	}

	private buildTextIdsByLanguage(): void {
		applyTextIdMapping(this.config, this.textsIndexData);
	}

	attach(container: HTMLElement | null): void {
		if (!container) return;
		attachVerseLinkHandlers(container, this.linkListeners(), this.hasTouch, this.popup?.id ?? null);
	}

	detach(container: HTMLElement | null): void {
		if (!container) return;
		detachVerseLinkHandlers(container, this.linkListeners());
	}

	private linkListeners(): VerseLinkListeners {
		return {
			onMouseEnter: this.handleMouseEnter,
			onMouseLeave: this.handleMouseLeave,
			onTouchStart: this.handleTouchStart,
			onTouchEnd: this.handleTouchEnd,
			onClick: this.handleClick
		};
	}

	private toggleContext(): PopupToggleContext {
		return {
			displayMode: this.config.displayMode,
			isPopupOpenFor: (target) => this.isPopupOpenFor(target),
			show: (target) => { this.show(target); },
			hide: () => { this.hide(); }
		};
	}

	private isPopupOpenFor(target: HTMLElement): boolean {
		return this.isPopupVisible() && this.currentTarget === target;
	}

	private isPopupVisible(): boolean {
		return this.popup?.classList.contains('visible') === true;
	}

	private handleMouseEnter(event: Event): void {
		if (this.config.displayMode === 'link') return;

		const target = event.target as HTMLElement;
		this.currentTarget = target;
		this.clearHideTimeout();

		this.showTimeout = setTimeout(() => {
			this.show(target);
		}, this.config.popup.showDelay);
	}

	private handleMouseLeave(): void {
		if (this.config.displayMode === 'link') return;

		this.clearShowTimeout();
		this.scheduleHide();
	}

	private handleTouchStart(event: TouchEvent): void {
		this.touchStartTime = Date.now();
		this.touchStartTarget = event.target as HTMLElement;
	}

	private handleTouchEnd(event: TouchEvent): void {
		const touchDuration = Date.now() - this.touchStartTime;
		handleTouchEndInteraction(event, this.touchStartTarget, touchDuration, this.toggleContext());
	}

	private handleClick(event: Event): void {
		handleClickInteraction(event, {
			...this.toggleContext(),
			hasTouch: this.hasTouch,
			canUseAppNavigation: this.app !== null && this.config.appIntegration.useAppNavigation,
			navigate: (reference, version) => { this.navigateToVerse(reference, version); }
		});
	}

	private handleKeyDown(event: KeyboardEvent): void {
		handleKeyDownInteraction(event, {
			...this.toggleContext(),
			isPopupVisible: () => this.isPopupVisible(),
			focusCurrentTarget: () => { this.currentTarget?.focus(); }
		});
	}

	private navigateToVerse(reference: string, version?: string): void {
		navigateAppToVerse(this.app, reference, version);
	}

	async show(target: HTMLElement): Promise<void> {
		const ref = target.dataset.verseRef;
		if (!ref || !this.popup) return;

		const displayRef = target.textContent?.trim() || ref;

		const detectedLang = target.dataset.detectedLang ?? this.config.language?.primary ?? 'en';
		// An explicit version, as in "John 3:16 (KJV)", wins over the language mapping.
		const version = target.dataset.version ?? undefined;

		// Stay silent rather than popping up an error when the language has no text.
		const textId = version ?? this.getTextId(detectedLang);
		if (!textId) return;

		if (this.currentTarget && this.currentTarget !== target) {
			this.currentTarget.setAttribute('aria-expanded', 'false');
		}
		this.currentTarget = target;

		presentPopup(this.popup, target, this.config, ref);

		try {
			const content = await this.fetchVerseContent(ref, detectedLang, version);
			this.displayContent(displayRef, content, ref);
			// Reposition once the real height is known.
			requestAnimationFrame(() => {
				positionPopup(this.popup, target, this.config);
			});
		} catch (error) {
			this.displayError((error as Error).message);
		}
	}

	hide(): void {
		if (!this.popup) return;

		if (this.currentTarget) {
			this.currentTarget.setAttribute('aria-expanded', 'false');
		}

		hidePopupElement(this.popup);
	}

	parseReference(reference: string): ParsedReference | null {
		return parsePopupReference(reference);
	}

	async fetchVerseContent(reference: string, detectedLang: string | null = null, version?: string): Promise<string> {
		const result = await fetchVerseContentUtil(this.contentState(), reference, detectedLang, version);
		this.collectedFootnotes = result.footnotes;
		return result.content;
	}

	private contentState(): VerseContentState {
		return {
			config: this.config,
			cache: this.cache,
			textLoader: this.textLoader,
			app: this.app
		};
	}

	getTextId(detectedLang: string | null = null): string | null {
		return getTextIdUtil(detectedLang, this.config);
	}

	private buildFootnotesHtml(): string {
		return buildFootnotesHtmlUtil(this.collectedFootnotes);
	}

	private buildSocialShareHtml(): string {
		return buildSocialShareHtmlUtil({
			showSocialShare: this.config.popup.showSocialShare,
			socialSharePlatforms: this.config.popup.socialSharePlatforms,
			appBaseUrl: this.config.appBaseUrl
		});
	}

	private handleSocialShare(platform: string, reference: string, content: string): void {
		const popup = this.popup;
		handleSocialShareUtil({
			platform,
			reference,
			content,
			appBaseUrl: this.config.appBaseUrl,
			parseReference: (ref) => this.parseReference(ref),
			showCopyFeedback: popup
				? (selector, className, duration) => flashButtonClass(popup, selector, className, duration)
				: undefined
		});
	}

	private displayContent(reference: string, content: string, canonicalReference?: string): void {
		if (!this.popup) return;

		this.currentReference = canonicalReference ?? reference;
		this.currentContent = content;

		renderVerseContent(this.popup, {
			reference,
			content,
			footnotesHtml: this.buildFootnotesHtml(),
			socialHtml: this.buildSocialShareHtml(),
			popupConfig: this.config.popup,
			onSocialShare: (platform) => this.handleSocialShare(platform, this.currentReference, this.currentContent)
		});
	}

	private displayError(message: string): void {
		if (!this.popup) return;
		renderErrorContent(this.popup, message);
	}

	private clearShowTimeout(): void {
		if (this.showTimeout) {
			clearTimeout(this.showTimeout);
			this.showTimeout = null;
		}
	}

	private clearHideTimeout(): void {
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}
	}

	private scheduleHide(): void {
		this.hideTimeout = setTimeout(() => {
			this.hide();
		}, this.config.popup.hideDelay);
	}

	getTextsForLanguage(langCode: string): TextInfo[] {
		return getTextsForLanguageFromIndex(this.textsIndexData, langCode);
	}

	/** Language code to number of available texts. */
	getAvailableLanguages(): Record<string, number> {
		return getAvailableLanguagesFromIndex(this.textsIndexData);
	}

	/** An array of text IDs is treated as priority order. */
	setPreferredText(langCode: string, textId: string | string[]): void {
		const contentConfig = this.config.contentSource;
		if (!contentConfig.preferredTextIdsByLanguage) {
			contentConfig.preferredTextIdsByLanguage = {};
		}
		contentConfig.preferredTextIdsByLanguage[langCode] = textId;

		if (this.textsIndexLoaded) {
			this.buildTextIdsByLanguage();
		}
	}

	getTextIdMapping(): Record<string, string> {
		return { ...this.config.contentSource?.textIdsByLanguage };
	}

	destroy(): void {
		this.clearShowTimeout();
		this.clearHideTimeout();
		document.removeEventListener('keydown', this.handleKeyDown);
		if (this.popup && this.popup.parentNode) {
			this.popup.parentNode.removeChild(this.popup);
		}
		this.cache.clear();
	}
}

export function createVersePopup(options: PartialVerseDetectionConfig = {}): VersePopup {
	return new VersePopup(options);
}

export default VersePopup;

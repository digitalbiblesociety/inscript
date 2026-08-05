import type { VerseDetectionConfig } from './config.js';

function buildPopupStyles(config: VerseDetectionConfig): string {
	return `
		.verse-popup {
			position: absolute;
			z-index: 10000;
			background: var(--popup-bg, #fff);
			border: 1px solid var(--popup-border, #ccc);
			border-radius: 6px;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
			padding: 12px 16px;
			width: auto;
			min-width: 200px;
			max-width: ${config.popup.maxWidth}px;
			font-size: 14px;
			line-height: 1.5;
			opacity: 0;
			transform: translateY(8px);
			transition: opacity 0.2s, transform 0.2s;
			pointer-events: none;
		}

		.verse-popup.visible {
			opacity: 1;
			transform: translateY(0);
			pointer-events: auto;
		}

		.verse-popup-header {
			font-weight: 600;
			margin-bottom: 8px;
			padding-bottom: 6px;
			border-bottom: 1px solid var(--popup-border, #eee);
			color: var(--popup-header-color, #333);
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
		}

		.verse-popup-header-text {
			flex: 1;
		}

		.verse-popup-logo {
			flex-shrink: 0;
			width: 20px;
			height: 20px;
			opacity: 0.7;
			transition: opacity 0.2s ease;
		}

		.verse-popup-logo:hover {
			opacity: 1;
		}

		.verse-popup-logo svg {
			width: 100%;
			height: 100%;
			display: block;
		}

		.verse-popup-content {
			color: var(--popup-text-color, #444);
			max-height: ${config.popup.maxHeight}px;
			overflow-y: auto;
		}

		.verse-popup-content.scrollable {
			padding-right: 8px;
		}

		.verse-popup-content::-webkit-scrollbar {
			width: 6px;
		}

		.verse-popup-content::-webkit-scrollbar-track {
			background: var(--popup-scrollbar-track, #f1f1f1);
			border-radius: 3px;
		}

		.verse-popup-content::-webkit-scrollbar-thumb {
			background: var(--popup-scrollbar-thumb, #c1c1c1);
			border-radius: 3px;
		}

		.verse-popup-content::-webkit-scrollbar-thumb:hover {
			background: var(--popup-scrollbar-thumb-hover, #a8a8a8);
		}

		.verse-popup-content .v-num {
			font-weight: 600;
			color: var(--popup-verse-num-color, #666);
			font-size: 0.85em;
			margin-right: 4px;
			vertical-align: super;
		}

		.verse-popup-content .v {
			display: inline;
		}

		.verse-popup-content .note-marker {
			display: inline-block;
			font-size: 0.75em;
			color: var(--popup-footnote-key-color, #4a90d9);
			vertical-align: super;
			padding: 0 1px;
			font-weight: 600;
		}

		.verse-popup-footnotes {
			margin-top: 8px;
			padding-top: 8px;
			border-top: 1px solid var(--popup-border, #ddd);
			font-size: 0.9em;
			color: var(--popup-footnote-text-color, #666);
		}

		.verse-popup-footnote {
			margin-bottom: 6px;
			line-height: 1.4;
		}

		.verse-popup-footnote:last-child {
			margin-bottom: 0;
		}

		.verse-popup-footnote .fn-key {
			font-weight: 600;
			color: var(--popup-footnote-key-color, #4a90d9);
			margin-right: 4px;
		}

		.verse-popup-footnote .fn-text {
			color: var(--popup-footnote-text-color, #555);
		}

		/* .bibleref and .xt are USFM cross-reference markup */
		.verse-popup-footnotes .bibleref,
		.verse-popup-footnotes .xt {
			color: var(--popup-xref-color, #4a90d9);
			text-decoration: underline;
			text-decoration-style: dotted;
			cursor: pointer;
		}

		.verse-popup-footnotes .bibleref:hover,
		.verse-popup-footnotes .xt:hover {
			text-decoration-style: solid;
		}

		.verse-popup-social {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 12px;
			margin-top: 10px;
			padding-top: 10px;
			border-top: 1px solid var(--popup-border, #eee);
		}

		.verse-popup-social-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 32px;
			height: 32px;
			border: none;
			border-radius: 50%;
			background: var(--popup-social-btn-bg, #f0f0f0);
			color: var(--popup-social-btn-color, #555);
			cursor: pointer;
			transition: all 0.2s ease;
			padding: 0;
		}

		.verse-popup-social-btn:hover {
			background: var(--popup-social-btn-hover-bg, #e0e0e0);
			color: var(--popup-social-btn-hover-color, #333);
			transform: scale(1.1);
		}

		.verse-popup-social-btn:active {
			transform: scale(0.95);
		}

		.verse-popup-social-btn svg {
			width: 16px;
			height: 16px;
		}

		.verse-popup-social-btn.facebook:hover {
			background: #1877f2;
			color: #fff;
		}

		.verse-popup-social-btn.x:hover {
			background: #000;
			color: #fff;
		}

		.verse-popup-social-btn.bluesky:hover {
			background: #0085ff;
			color: #fff;
		}

		.verse-popup-social-btn.copy:hover {
			background: #4a90d9;
			color: #fff;
		}

		.verse-popup-social-btn.copied {
			background: #4caf50 !important;
			color: #fff !important;
		}

		.verse-popup-loading {
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 20px;
			color: var(--popup-loading-color, #888);
		}

		.verse-popup-loading::after {
			content: '';
			width: 16px;
			height: 16px;
			margin-left: 8px;
			border: 2px solid currentColor;
			border-top-color: transparent;
			border-radius: 50%;
			animation: verse-popup-spin 0.8s linear infinite;
		}

		@keyframes verse-popup-spin {
			to { transform: rotate(360deg); }
		}

		.verse-popup-error {
			color: var(--popup-error-color, #d32f2f);
			font-style: italic;
		}

		.verse-link {
			color: var(--verse-link-color, inherit);
			text-decoration: underline;
			text-decoration-style: dotted;
			text-underline-offset: 2px;
			cursor: pointer;
			transition: all 0.15s ease;
			border-radius: 2px;
			padding: 0 1px;
			margin: 0 -1px;
		}

		.verse-link:hover {
			text-decoration-style: solid;
			background-color: var(--verse-link-hover-bg, rgba(74, 144, 217, 0.1));
			color: var(--verse-link-hover-color, #4a90d9);
		}

		.verse-link:active {
			background-color: var(--verse-link-active-bg, rgba(74, 144, 217, 0.2));
			transform: scale(0.98);
		}

		@media (hover: none) {
			.verse-link {
				padding: 2px 4px;
				margin: 0 -4px;
			}
		}

		.verse-detected {
			background-color: var(--verse-highlight-bg, rgba(255, 235, 59, 0.2));
			border-radius: 2px;
			padding: 0 2px;
		}

		@media (prefers-color-scheme: dark) {
			.verse-popup {
				--popup-bg: #2d2d2d;
				--popup-border: #444;
				--popup-header-color: #e0e0e0;
				--popup-text-color: #ccc;
				--popup-verse-num-color: #999;
				--popup-footnote-key-color: #6ab0f3;
				--popup-footnote-text-color: #aaa;
				--popup-xref-color: #6ab0f3;
				--popup-social-btn-bg: #3d3d3d;
				--popup-social-btn-color: #aaa;
				--popup-social-btn-hover-bg: #4d4d4d;
				--popup-social-btn-hover-color: #fff;
			}
		}
	`;
}

export function createPopupElement(config: VerseDetectionConfig): HTMLDivElement {
	if (!document.getElementById('verse-popup-styles')) {
		const styles = document.createElement('style');
		styles.id = 'verse-popup-styles';
		styles.textContent = buildPopupStyles(config);
		document.head.appendChild(styles);
	}

	const popup = document.createElement('div');
	popup.className = `verse-popup ${config.popup.cssClass}`;
	popup.setAttribute('role', 'dialog');
	popup.setAttribute('aria-modal', 'false');
	popup.setAttribute('aria-label', 'Verse preview');
	popup.setAttribute('aria-live', 'polite');
	popup.id = 'verse-popup-' + Math.random().toString(36).substr(2, 9);
	popup.style.display = 'none';
	document.body.appendChild(popup);

	return popup;
}

export function positionPopup(popup: HTMLDivElement | null, target: HTMLElement, config: VerseDetectionConfig): void {
	if (!popup) return;

	const rect = target.getBoundingClientRect();
	const viewportHeight = window.innerHeight;
	const viewportWidth = window.innerWidth;

	const popupHeight = Math.min(popup.offsetHeight, config.popup.maxHeight + 80); // +80 for header/padding
	const popupWidth = Math.min(popup.offsetWidth, config.popup.maxWidth);

	let top: number, left: number;

	left = rect.left + (rect.width / 2) - (popupWidth / 2);
	left = Math.max(10, Math.min(left, viewportWidth - popupWidth - 10));

	const spaceAbove = rect.top;
	const spaceBelow = viewportHeight - rect.bottom;
	const preferAbove = config.popup.position === 'above' ||
		(config.popup.position === 'auto' && spaceBelow < popupHeight + 20 && spaceAbove > spaceBelow);

	if (preferAbove) {
		top = rect.top + window.scrollY - popupHeight - 10;
		if (top < window.scrollY + 10) {
			top = window.scrollY + 10;
		}
	} else {
		top = rect.bottom + window.scrollY + 10;
	}

	popup.style.left = `${left}px`;
	popup.style.top = `${top}px`;
}

export function presentPopup(popup: HTMLDivElement, target: HTMLElement, config: VerseDetectionConfig, ref: string): void {
	positionPopup(popup, target, config);

	if (config.popup.showLoadingIndicator) {
		popup.innerHTML = '<div class="verse-popup-loading" role="status" aria-live="polite">Loading</div>';
	}

	target.setAttribute('aria-expanded', 'true');
	popup.setAttribute('aria-label', `Verse preview: ${ref}`);

	popup.style.display = 'block';
	popup.offsetHeight; // Force reflow so the fade-in transition runs.
	popup.classList.add('visible');
}

export function hidePopupElement(popup: HTMLDivElement): void {
	popup.classList.remove('visible');
	setTimeout(() => {
		if (!popup.classList.contains('visible')) {
			popup.style.display = 'none';
		}
	}, 200);
}

export interface PopupChromeContext {
	clearHideTimeout(): void;
	scheduleHide(): void;
	onCrossReferenceClick(refText: string): void;
}

/** Keeps the popup open while hovered and routes cross-reference clicks. */
export function bindPopupChromeEvents(popup: HTMLDivElement, ctx: PopupChromeContext): void {
	popup.addEventListener('mouseenter', () => {
		ctx.clearHideTimeout();
	});

	popup.addEventListener('mouseleave', () => {
		ctx.scheduleHide();
	});

	popup.addEventListener('click', (e) => {
		const target = e.target as HTMLElement;

		if (!target.classList.contains('bibleref') && !target.classList.contains('xt')) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		const refText = target.getAttribute('data-id') ?? target.getAttribute('title') ?? target.textContent;
		if (refText) {
			ctx.onCrossReferenceClick(refText);
		}
	});
}

export interface VerseLinkListeners {
	onMouseEnter: (event: Event) => void;
	onMouseLeave: (event: Event) => void;
	onTouchStart: (event: TouchEvent) => void;
	onTouchEnd: (event: TouchEvent) => void;
	onClick: (event: Event) => void;
}

export function attachVerseLinkHandlers(
	container: HTMLElement,
	listeners: VerseLinkListeners,
	hasTouch: boolean,
	popupId: string | null
): void {
	const links = container.querySelectorAll<HTMLElement>('.verse-link[data-verse-ref]');
	links.forEach(link => {
		const ref = link.dataset.verseRef ?? '';
		link.setAttribute('role', 'button');
		link.setAttribute('tabindex', '0');
		link.setAttribute('aria-haspopup', 'dialog');
		link.setAttribute('aria-expanded', 'false');
		link.setAttribute('aria-label', `View ${ref}`);
		if (popupId) {
			link.setAttribute('aria-controls', popupId);
		}

		if (!hasTouch) {
			link.addEventListener('mouseenter', listeners.onMouseEnter);
			link.addEventListener('mouseleave', listeners.onMouseLeave);
		}

		if (hasTouch) {
			link.addEventListener('touchstart', listeners.onTouchStart, { passive: true });
			link.addEventListener('touchend', listeners.onTouchEnd);
		}

		link.addEventListener('click', listeners.onClick);
	});
}

export function detachVerseLinkHandlers(container: HTMLElement, listeners: VerseLinkListeners): void {
	const links = container.querySelectorAll<HTMLElement>('.verse-link[data-verse-ref]');
	links.forEach(link => {
		link.removeEventListener('mouseenter', listeners.onMouseEnter);
		link.removeEventListener('mouseleave', listeners.onMouseLeave);
		link.removeEventListener('touchstart', listeners.onTouchStart);
		link.removeEventListener('touchend', listeners.onTouchEnd);
		link.removeEventListener('click', listeners.onClick);
	});
}

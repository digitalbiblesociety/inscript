import type { DisplayMode } from './config.js';
import { parsePopupReference } from './PopupContent.js';
import type { BrowserBibleApp } from './PopupTypes.js';

export interface PopupToggleContext {
	displayMode: DisplayMode;
	isPopupOpenFor(target: HTMLElement): boolean;
	show(target: HTMLElement): void;
	hide(): void;
}

/** Long press shows the popup; a short tap toggles it, then handleClick navigates. */
export function handleTouchEndInteraction(
	event: TouchEvent,
	target: HTMLElement | null,
	touchDuration: number,
	ctx: PopupToggleContext
): void {
	if (!target) return;

	const LONG_PRESS_MS = 300;
	if (touchDuration > LONG_PRESS_MS && ctx.displayMode !== 'link') {
		event.preventDefault();
		ctx.show(target);
		return;
	}

	// 'link' mode falls through to handleClick.
	if (ctx.displayMode !== 'both' && ctx.displayMode !== 'popup') return;

	// 'both' only claims the tap when opening; 'popup' always claims it.
	const isOpen = ctx.isPopupOpenFor(target);
	if (ctx.displayMode === 'popup' || !isOpen) {
		event.preventDefault();
	}

	if (isOpen) {
		ctx.hide();
	} else {
		ctx.show(target);
	}
}

export interface ClickInteractionContext extends PopupToggleContext {
	hasTouch: boolean;
	canUseAppNavigation: boolean;
	navigate(reference: string, version?: string): void;
}

export function handleClickInteraction(event: Event, ctx: ClickInteractionContext): void {
	const target = event.target as HTMLElement;
	const ref = target.dataset.verseRef;
	if (!ref) return;

	const version = target.dataset.version ?? undefined;

	if (ctx.displayMode === 'popup') {
		event.preventDefault();
		// Touch devices get the popup from handleTouchEnd instead.
		if (!ctx.hasTouch) {
			ctx.show(target);
		}
		return;
	}

	// Touch 'both' mode is two-stage: handleTouchEnd opens the popup on the
	// first tap, and only a tap while it is already open reaches navigation.
	if (ctx.displayMode === 'both' && ctx.hasTouch) {
		if (ctx.isPopupOpenFor(target)) {
			ctx.hide();
		} else {
			event.preventDefault();
			return;
		}
	}

	if (ctx.canUseAppNavigation) {
		event.preventDefault();
		ctx.navigate(ref, version);
	}
	// With no app, the anchor's own href handles navigation.
}

export interface KeyDownInteractionContext extends PopupToggleContext {
	isPopupVisible(): boolean;
	focusCurrentTarget(): void;
}

/** Escape closes the popup; Enter or Space on a verse link toggles it. */
export function handleKeyDownInteraction(event: KeyboardEvent, ctx: KeyDownInteractionContext): void {
	if (event.key === 'Escape' && ctx.isPopupVisible()) {
		ctx.hide();
		ctx.focusCurrentTarget();
		return;
	}

	if ((event.key !== 'Enter' && event.key !== ' ') || ctx.displayMode === 'link') return;

	const target = event.target as HTMLElement;
	if (!target.classList.contains('verse-link') || !target.dataset.verseRef) return;

	event.preventDefault();
	if (ctx.isPopupOpenFor(target)) {
		ctx.hide();
	} else {
		ctx.show(target);
	}
}

export function navigateAppToVerse(app: BrowserBibleApp | null, reference: string, version?: string): void {
	if (!app) return;

	const parsed = parsePopupReference(reference);
	if (!parsed) return;

	if (typeof app.navigateToRef === 'function') {
		app.navigateToRef(parsed.sectionId, parsed.verseId);
	} else if (typeof app.trigger === 'function') {
		app.trigger('navigate', {
			sectionId: parsed.sectionId,
			verseId: parsed.verseId,
			...(version ? { textId: version } : {})
		});
	}
}

import type { PopupConfig } from './config.js';

const INSCRIPT_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
<path fill="#D1EAF1" d="M44 23Q33 8 9 0q23 34-8 64 30-10 43-40"/>
<path fill="#A5CBE2" d="M61 34Q51 14 34 3q0 44-33 61 39-3 60-30"/>
<path fill="#3F87C1" d="M69 40q-4-14-15-29-8 47-53 53 52-2 68-24"/>
<path fill="#2468B9" d="M72 59q0-6-2-10Q48 64 0 64q30 1 72-5"/>
<rect fill="#666" width="70" height="4" x="2" y="67" rx="2"/>
</svg>`;

export interface RenderVerseContentOptions {
	reference: string;
	content: string;
	footnotesHtml: string;
	socialHtml: string;
	popupConfig: PopupConfig;
	onSocialShare: (platform: string) => void;
}

export function renderVerseContent(popup: HTMLDivElement, options: RenderVerseContentOptions): void {
	popup.innerHTML = buildPopupHtml(options);
	wireSocialButtons(popup, options);
	updateScrollableState(popup);
}

function buildPopupHtml(options: RenderVerseContentOptions): string {
	let html = '';

	if (options.popupConfig.showHeader) {
		const logoHtml = options.popupConfig.showLogo
			? `<a href="${options.popupConfig.logoUrl}" target="_blank" rel="noopener noreferrer" class="verse-popup-logo" title="Powered by inscript.org">${INSCRIPT_LOGO_SVG}</a>`
			: '';
		html += `<div class="verse-popup-header"><span class="verse-popup-header-text">${options.reference}</span>${logoHtml}</div>`;
	}

	html += `<div class="verse-popup-content">${options.content}`;

	if (options.footnotesHtml) {
		html += options.footnotesHtml;
	}

	html += `</div>`;

	if (options.socialHtml) {
		html += options.socialHtml;
	}

	return html;
}

function wireSocialButtons(popup: HTMLDivElement, options: RenderVerseContentOptions): void {
	if (!options.popupConfig.showSocialShare) {
		return;
	}

	popup.querySelectorAll('.verse-popup-social-btn').forEach(btn => {
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			const platform = (btn as HTMLElement).dataset.platform;
			if (platform) {
				options.onSocialShare(platform);
			}
		});
	});
}

function updateScrollableState(popup: HTMLDivElement): void {
	const contentEl = popup.querySelector<HTMLElement>('.verse-popup-content');
	if (!contentEl) {
		return;
	}

	// scrollHeight is only meaningful after the browser has laid out the new innerHTML.
	requestAnimationFrame(() => {
		if (contentEl.scrollHeight > contentEl.clientHeight) {
			contentEl.classList.add('scrollable');
		} else {
			contentEl.classList.remove('scrollable');
		}
	});
}

export function renderErrorContent(popup: HTMLDivElement, message: string): void {
	popup.innerHTML = `<div class="verse-popup-error">${message}</div>`;
}

export function flashButtonClass(popup: HTMLDivElement, selector: string, className: string, duration: number): void {
	const btn = popup.querySelector(selector);
	if (btn) {
		btn.classList.add(className);
		setTimeout(() => btn.classList.remove(className), duration);
	}
}

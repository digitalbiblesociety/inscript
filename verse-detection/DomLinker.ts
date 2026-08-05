import { BOOK_CODES } from './BookCodes.js';
import { buildVerseUrl } from './VerseUrlBuilder.js';
import type { CanonicalBookName } from './bookNames.js';
import type { VerseDetectionConfig } from './config.js';
import type { ParsedVerseReference } from './ReferenceParser.js';

/** A null set means every language is linkable; a set restricts it. */
export interface LinkableLanguages {
	set: Set<string> | null;
}

/**
 * Verses in other languages are still detected, just not linked. Passing a
 * textIdsByLanguage object also repoints generated URLs at those versions.
 */
export function applyAvailableTextLanguages(
	linkable: LinkableLanguages,
	config: VerseDetectionConfig,
	languages: string[] | Record<string, string> | null
): void {
	if (Array.isArray(languages)) {
		linkable.set = new Set(languages);
	} else if (languages && typeof languages === 'object') {
		linkable.set = new Set(Object.keys(languages));
		config.contentSource.textIdsByLanguage = { ...languages };
	} else {
		linkable.set = null;
	}
}

export function renderVerseLink(
	verse: ParsedVerseReference,
	config: VerseDetectionConfig,
	linkable: LinkableLanguages
): string {
	// Leave the reference as plain text when we have nothing to link it to.
	const detectedLang = verse.detectedLanguage || 'en';
	if (linkable.set && !linkable.set.has(detectedLang)) {
		return verse.original;
	}

	const classes = [config.link.cssClass];
	if (config.styling.highlightVerses) {
		classes.push(config.styling.highlightClass);
	}

	const bookCode = BOOK_CODES[verse.book as CanonicalBookName] ?? '';
	const chapterMatch = verse.reference?.match(/^(\d+)/);
	const verseMatch = verse.reference?.match(/:(\d+)/);
	const chapter = chapterMatch ? chapterMatch[1] : '';
	const verseNum = verseMatch ? verseMatch[1] : '';
	const sectionId = bookCode && chapter ? `${bookCode}${chapter}` : '';

	const versionAttr = verse.version ? ` data-version="${verse.version}"` : '';
	const dataAttrs = config.link.addDataAttributes
		? `data-verse-ref="${verse.book} ${verse.reference}" data-book="${verse.book}" data-book-code="${bookCode}" data-chapter="${chapter}" data-verse="${verseNum}" data-section-id="${sectionId}" data-detected-lang="${detectedLang}"${versionAttr}`
		: '';

	let href = 'javascript:void(0)';
	if (config.displayMode === 'link' || config.displayMode === 'both') {
		href = buildVerseUrl({
			book: verse.book,
			reference: verse.reference,
			detectedLanguage: verse.detectedLanguage,
			version: verse.version
		}, config);
	}

	const target = config.link.openInNewTab ? ' target="_blank" rel="noopener"' : '';
	const style = config.styling.underline ? '' : ' style="text-decoration:none"';

	return `<a href="${href}" class="${classes.join(' ')}" ${dataAttrs}${target}${style}>${verse.original}</a>`;
}

function isLinkableTextNode(
	node: Text,
	containsVerses: (text: string) => boolean,
	excludeSelectors: string
): boolean {
	const parent = node.parentElement;
	if (!parent) {
		return false;
	}
	if (excludeSelectors && parent.closest(excludeSelectors)) {
		return false;
	}
	return containsVerses(node.textContent ?? '');
}

/** Replaces each verse-bearing text node with a span of linkified HTML. */
export function linkifyContainer(
	container: HTMLElement,
	containsVerses: (text: string) => boolean,
	excludeSelectors: string,
	renderText: (text: string) => string
): void {
	const walker = document.createTreeWalker(
		container,
		NodeFilter.SHOW_TEXT,
		{
			acceptNode: (node) => isLinkableTextNode(node as Text, containsVerses, excludeSelectors)
				? NodeFilter.FILTER_ACCEPT
				: NodeFilter.FILTER_REJECT
		}
	);

	const nodesToProcess: Text[] = [];
	let node: Node | null;
	while ((node = walker.nextNode())) {
		nodesToProcess.push(node as Text);
	}

	nodesToProcess.forEach((textNode) => {
		const html = renderText(textNode.textContent ?? '');
		const span = document.createElement('span');
		span.innerHTML = html;
		textNode.parentNode?.replaceChild(span, textNode);
	});
}

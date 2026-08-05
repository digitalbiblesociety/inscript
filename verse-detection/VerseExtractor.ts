import type { ParsedReference } from './PopupTypes.js';

export interface ExtractedFootnote {
	key: string;
	text: string;
}

export interface ExtractedVerseResult {
	content: string;
	footnotes: ExtractedFootnote[];
}

export interface VerseExtractorConfig {
	showVerseNumbers: boolean;
}

/** Appends to `footnotes` and returns verse HTML with each note reduced to a marker. */
export function processVerseContent(verseEl: HTMLElement, footnotes: ExtractedFootnote[]): string {
	// Work on a clone; the caller's chapter DOM must survive intact.
	const clone = verseEl.cloneNode(true) as HTMLElement;

	clone.querySelectorAll('.v-num, .verse-num').forEach(el => el.remove());

	clone.querySelectorAll('.note, .cf').forEach(note => {
		const keyEl = note.querySelector('.key');
		const key = keyEl?.textContent?.trim() ?? '*';

		const textEl = note.querySelector('.text');
		let text = '';

		if (textEl) {
			text = textEl.innerHTML.trim();
		} else {
			// No .text wrapper, so gather every child except the key.
			const textParts: string[] = [];
			note.childNodes.forEach(child => {
				if (child !== keyEl) {
					if (child.nodeType === Node.TEXT_NODE) {
						const t = child.textContent?.trim();
						if (t) textParts.push(t);
					} else if (child.nodeType === Node.ELEMENT_NODE) {
						textParts.push((child as HTMLElement).innerHTML ?? child.textContent ?? '');
					}
				}
			});
			text = textParts.join(' ').trim();
		}

		if (text) {
			footnotes.push({ key, text });
		}

		const marker = document.createElement('span');
		marker.className = 'note-marker';
		marker.textContent = key;
		note.parentNode?.replaceChild(marker, note);
	});

	return clone.innerHTML.trim();
}

/** Throws when the requested verses are absent from the chapter. */
export function extractVerses(
	html: string,
	parsed: ParsedReference,
	config: VerseExtractorConfig
): ExtractedVerseResult {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');
	const footnotes: ExtractedFootnote[] = [];

	// A chapter-only reference such as "Psalm 23" returns every verse.
	if (!parsed.startVerse) {
		const section = doc.querySelector('.section');
		if (section) {
			const verseEls = section.querySelectorAll('.v');
			if (verseEls.length > 0) {
				const verses: string[] = [];
				verseEls.forEach((verseEl, index) => {
					const verseNum = config.showVerseNumbers
						? `<span class="v-num">${index + 1}</span>`
						: '';
					const verseContent = processVerseContent(verseEl as HTMLElement, footnotes);
					verses.push(`${verseNum}<span class="v">${verseContent}</span>`);
				});
				return { content: verses.join(' '), footnotes };
			}
		}
		const firstVerse = doc.querySelector('.v');
		const content = firstVerse ? processVerseContent(firstVerse as HTMLElement, footnotes) : '';
		return { content, footnotes };
	}

	const verses: string[] = [];
	const start = parsed.startVerse;
	const end = parsed.endVerse ?? start;

	for (let v = start; v <= end; v++) {
		const verseId = `${parsed.sectionId}_${v}`;
		const verseEl = doc.querySelector(`[data-id="${verseId}"], .${verseId}`);

		if (verseEl) {
			const verseNum = config.showVerseNumbers
				? `<span class="v-num">${v}</span>`
				: '';
			const verseContent = processVerseContent(verseEl as HTMLElement, footnotes);
			verses.push(`${verseNum}<span class="v">${verseContent}</span>`);
		}
	}

	if (verses.length === 0) {
		throw new Error('Verse not found');
	}

	return { content: verses.join(' '), footnotes };
}

export function buildFootnotesHtml(footnotes: ExtractedFootnote[]): string {
	if (footnotes.length === 0) {
		return '';
	}

	const footnoteItems = footnotes.map(fn =>
		`<div class="verse-popup-footnote"><span class="fn-key">${fn.key}</span><span class="fn-text">${fn.text}</span></div>`
	).join('');

	return `<div class="verse-popup-footnotes">${footnoteItems}</div>`;
}

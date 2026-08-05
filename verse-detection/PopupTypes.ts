import type { BookCode } from './BookCodes.js';

export interface ParsedReference {
	book: string;
	bookCode: BookCode;
	chapter: number;
	startVerse: number | null;
	endVerse: number | null;
	sectionId: string;
	verseId: string | null;
}

export interface TextInfo {
	id: string;
	name?: string;
	lang?: string;
	langName?: string;
	langNameEnglish?: string;
	type?: string;
	hasText?: boolean;
}

export interface BrowserBibleApp {
	currentTextId?: string;
	config?: {
		defaultTextId?: string;
		baseContentUrl?: string;
	};
	navigateToRef?: (sectionId: string, verseId: string | null) => void;
	trigger?: (event: string, data: { sectionId: string; verseId: string | null; textId?: string }) => void;
	getActiveWindow?: () => { textId?: string } | null;
	on?: (event: string, callback: (lang: string) => void) => void;
}

export interface TextLoader {
	getText: (
		textId: string,
		onSuccess: (textInfo: TextInfo) => void,
		onError?: (error: Error) => void
	) => void;
	loadSection: (
		textInfo: TextInfo,
		sectionId: string,
		onSuccess: (html: string) => void,
		onError?: (error: Error) => void
	) => void;
}

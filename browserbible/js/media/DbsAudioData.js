/**
 * Parsing and fragment navigation for DBS audio Bibles (see DbsAudioProvider).
 *
 * File listing lines: {bookNum}_{bookName}_{chapter}.mp3
 * Timing file lines: "Verse {n}\t{HH:MM:SS.ms}"
 */

import { OT_BOOKS, NT_BOOKS } from '../bible/BibleData.js';

/** Map DBS book number (1-66) to BrowserBible 2-char code */
export function dbsNumToCode(num) {
  const n = typeof num === 'string' ? parseInt(num, 10) : num;
  if (n >= 1 && n <= 39) return OT_BOOKS[n - 1];
  if (n >= 40 && n <= 66) return NT_BOOKS[n - 40];
  return null;
}

/** Parse an index.txt file listing into { books: Map, bookOrder: string[] }. */
export function parseBibleIndex(text) {
  const lines = text.trim().split('\n');
  const books = new Map();
  const bookOrder = [];

  for (const line of lines) {
    const filename = line.trim();
    if (!filename) continue;

    const match = filename.match(/^(\d+)_(.+?)_(\d+)\.mp3$/);
    if (!match) continue;

    const [, dbsNum, dbsName, chapterStr] = match;
    const code = dbsNumToCode(dbsNum);
    if (!code) continue;

    const chapter = parseInt(chapterStr, 10);

    if (!books.has(code)) {
      books.set(code, {
        dbsNum,
        dbsName,
        chapters: [],
        chapterFiles: new Map()
      });
      bookOrder.push(code);
    }

    books.get(code).chapters.push(chapter);
    books.get(code).chapterFiles.set(chapter, chapterStr);
  }

  for (const bookInfo of books.values()) {
    bookInfo.chapters.sort((a, b) => a - b);
  }

  return { books, bookOrder };
}

/** Parse a timing file into [{ verse, time }], or null when nothing parses. */
export function parseTimingText(text) {
  const timestamps = [];

  for (const line of text.trim().split('\n')) {
    const match = line.match(/^Verse\s+(\d+)\t(\d+):(\d+):(\d+)\.(\d+)/);
    if (!match) continue;

    const verse = parseInt(match[1], 10);
    const hours = parseInt(match[2], 10);
    const minutes = parseInt(match[3], 10);
    const seconds = parseInt(match[4], 10);
    const ms = parseInt(match[5], 10);

    const time = hours * 3600 + minutes * 60 + seconds + ms / 1000;
    timestamps.push({ verse, time });
  }

  return timestamps.length > 0 ? timestamps : null;
}

function locateChapter(audioInfo, fragmentid) {
  const sectionid = fragmentid.split('_')[0];
  const bookCode = sectionid.substring(0, 2);
  const chapter = parseInt(sectionid.substring(2), 10);

  const bookInfo = audioInfo.books.get(bookCode);
  const chapterIdx = bookInfo ? bookInfo.chapters.indexOf(chapter) : -1;

  return { bookCode, bookInfo, chapterIdx };
}

function firstChapterFragment(audioInfo, bookCode) {
  const bookInfo = audioInfo.books.get(bookCode);
  if (!bookInfo || bookInfo.chapters.length === 0) return null;
  return `${bookCode}${bookInfo.chapters[0]}_1`;
}

function lastChapterFragment(audioInfo, bookCode) {
  const bookInfo = audioInfo.books.get(bookCode);
  if (!bookInfo || bookInfo.chapters.length === 0) return null;
  const lastChapter = bookInfo.chapters[bookInfo.chapters.length - 1];
  return `${bookCode}${lastChapter}_1`;
}

export function nextDbsFragment(audioInfo, fragmentid) {
  const { bookCode, bookInfo, chapterIdx } = locateChapter(audioInfo, fragmentid);
  if (chapterIdx < 0) return null;

  if (chapterIdx < bookInfo.chapters.length - 1) {
    const nextChapter = bookInfo.chapters[chapterIdx + 1];
    return `${bookCode}${nextChapter}_1`;
  }

  const bookIdx = audioInfo.bookOrder.indexOf(bookCode);
  if (bookIdx < 0 || bookIdx >= audioInfo.bookOrder.length - 1) return null;

  return firstChapterFragment(audioInfo, audioInfo.bookOrder[bookIdx + 1]);
}

export function prevDbsFragment(audioInfo, fragmentid) {
  const { bookCode, bookInfo, chapterIdx } = locateChapter(audioInfo, fragmentid);
  if (chapterIdx < 0) return null;

  if (chapterIdx > 0) {
    const prevChapter = bookInfo.chapters[chapterIdx - 1];
    return `${bookCode}${prevChapter}_1`;
  }

  const bookIdx = audioInfo.bookOrder.indexOf(bookCode);
  if (bookIdx <= 0) return null;

  return lastChapterFragment(audioInfo, audioInfo.bookOrder[bookIdx - 1]);
}

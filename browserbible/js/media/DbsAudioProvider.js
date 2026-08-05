/**
 * Audio provider for DBS audio Bibles at audio.dbs.org.
 *
 * Bible index: https://audio.dbs.org/index.json
 * File listing: https://audio.dbs.org/{id}/index.txt
 * Audio files: https://audio.dbs.org/{id}/{bookNum}_{bookName}_{chapter}.mp3
 * Timing files: https://audio.dbs.org/{id}/timingfiles/{bookNum}_{chapter}.txt
 */

import { BaseAudioProvider } from './BaseAudioProvider.js';
import { getConfig } from '../core/config.js';
import { BOOK_DATA } from '../bible/BibleData.js';
import {
  parseBibleIndex,
  parseTimingText,
  nextDbsFragment,
  prevDbsFragment
} from './DbsAudioData.js';

export function dbsAudioMatches(entry, textInfo) {
  const id = textInfo.id;
  const abbr = textInfo.abbr || textInfo.id;

  const matchesId = [entry.abbr, entry.id, entry.davar_id].includes(id);
  const matchesAbbr = entry.abbr === abbr || entry.id === abbr;
  return matchesId || matchesAbbr;
}

export class DbsAudioProvider extends BaseAudioProvider {
  constructor() {
    super();
    this._indexPromise = null;
    this._bibleCache = new Map();
  }

  get name() { return 'dbs'; }

  async _getIndex() {
    if (this._indexPromise) return this._indexPromise;

    const config = getConfig();
    if (!config.dbsAudioEnabled) return [];

    const baseUrl = config.dbsAudioUrl || 'https://audio.dbs.org';

    this._indexPromise = fetch(`${baseUrl}/index.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch(err => {
        console.warn('DbsAudioProvider: failed to load index', err);
        this._indexPromise = null;
        return [];
      });

    return this._indexPromise;
  }

  _findMatch(index, textInfo) {
    return index.find(entry => dbsAudioMatches(entry, textInfo)) || null;
  }

  /**
   * Fetch and parse a Bible index.txt into { books: Map, bookOrder: string[] }.
   */
  async _loadBibleIndex(dbsId) {
    if (this._bibleCache.has(dbsId)) return this._bibleCache.get(dbsId);

    const config = getConfig();
    const baseUrl = config.dbsAudioUrl || 'https://audio.dbs.org';

    try {
      const response = await fetch(`${baseUrl}/${dbsId}/index.txt`);
      if (!response.ok) return null;

      const result = parseBibleIndex(await response.text());
      this._bibleCache.set(dbsId, result);
      return result;
    } catch (err) {
      console.warn(`DbsAudioProvider: failed to load index.txt for ${dbsId}`, err);
      return null;
    }
  }

  async getAudioInfo(textInfo) {
    const config = getConfig();
    if (!config.dbsAudioEnabled) return null;

    const index = await this._getIndex();
    if (!index.length) return null;

    const entry = this._findMatch(index, textInfo);
    if (!entry) {
      return null;
    }

    const bibleIndex = await this._loadBibleIndex(entry.id);
    if (!bibleIndex || bibleIndex.books.size === 0) return null;

    return {
      type: 'dbs',
      title: entry.tt || entry.abbr,
      dbsId: entry.id,
      books: bibleIndex.books,
      bookOrder: bibleIndex.bookOrder
    };
  }

  async getFragmentAudio(textInfo, audioInfo, fragmentid, audioOption) {
    const config = getConfig();
    const baseUrl = config.dbsAudioUrl || 'https://audio.dbs.org';

    const sectionid = fragmentid.split('_')[0];
    const bookCode = sectionid.substring(0, 2);
    const chapter = parseInt(sectionid.substring(2), 10);

    const bookInfo = audioInfo.books.get(bookCode);
    if (!bookInfo) return null;
    if (!bookInfo.chapters.includes(chapter)) return null;

    const chapterStr = bookInfo.chapterFiles?.get(chapter) ?? String(chapter).padStart(2, '0');
    const url = `${baseUrl}/${audioInfo.dbsId}/${bookInfo.dbsNum}_${bookInfo.dbsName}_${chapterStr}.mp3`;
    const id = `dbs:${audioInfo.dbsId}/${bookInfo.dbsNum}_${chapter}`;

    const bookData = BOOK_DATA[bookCode];
    const lastVerse = (bookData?.chapters && chapter <= bookData.chapters.length)
      ? bookData.chapters[chapter - 1]
      : 1;

    const timestamps = await this._loadTimingFile(baseUrl, audioInfo.dbsId, bookInfo.dbsNum, chapterStr);

    return {
      url,
      id,
      start: `${bookCode}${chapter}_1`,
      end: `${bookCode}${chapter}_${lastVerse}`,
      timestamps
    };
  }

  /** Resolves to [{ verse, time }] or null when the file is absent. */
  async _loadTimingFile(baseUrl, dbsId, bookNum, chapterStr) {
    try {
      const response = await fetch(`${baseUrl}/${dbsId}/timingfiles/${bookNum}_${chapterStr}.txt`);
      if (!response.ok) return null;

      return parseTimingText(await response.text());
    } catch {
      return null;
    }
  }

  async getNextFragment(textInfo, audioInfo, fragmentid) {
    return nextDbsFragment(audioInfo, fragmentid);
  }

  async getPrevFragment(textInfo, audioInfo, fragmentid) {
    return prevDbsFragment(audioInfo, fragmentid);
  }
}

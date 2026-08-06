import { BaseAudioProvider } from './BaseAudioProvider.js';
import { getConfig } from '../core/config.js';
import { BOOK_DATA } from '../bible/BibleData.js';
import { linkedAudioFor, loadAudioAssociations } from '../data/biblebrainDuplicates.js';
import {
  isBibleBrainAudioEnabled,
  selectAudioFileset,
  parseTimestamps,
  biblebrainAudioInfo
} from './BibleBrainFilesets.js';

export { filesetCoversTestament, selectAudioFileset, parseTimestamps } from './BibleBrainFilesets.js';

export class BibleBrainAudioProvider extends BaseAudioProvider {
  get name() { return 'biblebrain'; }

  async getAudioInfo(textInfo) {
    if (!isBibleBrainAudioEnabled(getConfig())) return null;

    return biblebrainAudioInfo(textInfo, textInfo?.biblebrain?.audioFilesets);
  }

  async getFragmentAudio(textInfo, audioInfo, fragmentid, audioOption) {
    const config = getConfig();
    if (!isBibleBrainAudioEnabled(config)) return null;

    const sectionid = fragmentid.split('_')[0];
    const bookCode = sectionid.substring(0, 2);
    const chapter = parseInt(sectionid.substring(2), 10);

    const bookData = BOOK_DATA[bookCode];
    const fileset = bookData
      ? selectAudioFileset(audioInfo.audioFilesets, bookCode, audioOption)
      : null;
    if (!fileset) return null;

    const base = config.bibleBrainProxyBase;
    const usfm = bookData.usfm;

    const url = await this._fetchChapterPath(base, fileset.id, usfm, chapter);
    if (!url) return null;

    const lastVerse = (bookData.chapters && chapter <= bookData.chapters.length)
      ? bookData.chapters[chapter - 1]
      : 1;

    const timestamps = await this._loadTimestamps(base, fileset.id, usfm, chapter);

    return {
      url,
      id: `biblebrain:${fileset.id}/${usfm}_${chapter}`,
      start: `${bookCode}${chapter}_1`,
      end: `${bookCode}${chapter}_${lastVerse}`,
      timestamps
    };
  }

  /** Resolves to the chapter's audio path, or null when it has none. */
  async _fetchChapterPath(base, filesetId, usfm, chapter) {
    try {
      const response = await fetch(`${base}/bibles/filesets/${filesetId}/${usfm}/${chapter}`);
      if (!response.ok) return null;
      const json = await response.json();
      const entry = Array.isArray(json?.data) ? json.data[0] : null;
      return entry?.path || null;
    } catch {
      return null;
    }
  }

  async _loadTimestamps(base, filesetId, usfm, chapter) {
    try {
      const response = await fetch(`${base}/timestamps/${filesetId}/${usfm}/${chapter}`);
      if (!response.ok) return null;
      const json = await response.json();
      return parseTimestamps(json?.data);
    } catch {
      return null;
    }
  }

  async _step(textInfo, audioInfo, fragmentid, direction) {
    const sections = textInfo?.sections;
    if (!Array.isArray(sections) || sections.length === 0) return null;

    const sectionid = fragmentid.split('_')[0];
    let index = sections.indexOf(sectionid);
    if (index < 0) return null;

    for (index += direction; index >= 0 && index < sections.length; index += direction) {
      const candidate = sections[index];
      const bookCode = candidate.substring(0, 2);
      const bookData = BOOK_DATA[bookCode];
      if (!bookData) continue;

      const fileset = selectAudioFileset(audioInfo.audioFilesets, bookCode, '');
      if (!fileset) continue;

      // Complete filesets have every chapter; partial ('...P') ones can have gaps,
      // so confirm the chapter has audio before navigating (avoids a dead player).
      const isPartial = String(fileset.size ?? '').toUpperCase().includes('P');
      if (!isPartial) return `${candidate}_1`;

      const chapter = parseInt(candidate.substring(2), 10);
      const base = getConfig().bibleBrainProxyBase;
      if (await this._chapterHasAudio(base, fileset.id, bookData.usfm, chapter)) {
        return `${candidate}_1`;
      }
    }
    return null;
  }

  async _chapterHasAudio(base, filesetId, usfm, chapter) {
    return !!(await this._fetchChapterPath(base, filesetId, usfm, chapter));
  }

  async getNextFragment(textInfo, audioInfo, fragmentid) {
    return this._step(textInfo, audioInfo, fragmentid, 1);
  }

  async getPrevFragment(textInfo, audioInfo, fragmentid) {
    return this._step(textInfo, audioInfo, fragmentid, -1);
  }
}

/**
 * Bible Brain audio for an existing text whose *text* duplicates a Bible Brain
 * edition. The duplicate BB text is excluded from the picker, but its audio is
 * kept and matched back here by the text's id/abbr (like DbsAudioProvider, so it
 * doesn't rely on a field surviving on the textInfo). Associations come from the
 * live catalog (registered by BibleBrainTextProvider at manifest time) plus the
 * curated static manifest. Registered last, so it only fills in texts with no
 * local or DBS audio.
 */
export class LinkedBibleBrainAudioProvider extends BibleBrainAudioProvider {
  get name() { return 'biblebrain-linked'; }

  async getAudioInfo(textInfo) {
    if (!isBibleBrainAudioEnabled(getConfig())) return null;

    await loadAudioAssociations();
    return biblebrainAudioInfo(textInfo, linkedAudioFor(textInfo)?.audioFilesets);
  }
}

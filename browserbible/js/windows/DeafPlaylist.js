// DeafPlaylist - pure playlist model for a Deaf Bible title: timeline items, navigation, and per-chapter marker math.

import { BOOK_DATA } from '../bible/BibleData.js';

// Parse a DBS duration ("5:21", "1:02:03") or number into seconds; returns 0 on unparseable input so callers can sum safely.
export function durationToSeconds(length) {
  if (typeof length === 'number') return Number.isFinite(length) && length > 0 ? length : 0;
  if (typeof length !== 'string' || length.trim() === '') return 0;

  const parts = length.split(':').map((n) => parseInt(n, 10));
  if (parts.some((n) => !Number.isFinite(n))) return 0;

  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function createPlaylistItem(passage, index) {
  const sectionid = passage.sectionid;
  const bookid = sectionid.substring(0, 2);
  return {
    index,
    fragmentid: `${sectionid}_${passage.verse ?? 1}`,
    sectionid,
    bookid,
    chapter: sectionid.substring(2),
    book: passage.book || BOOK_DATA[bookid]?.name || bookid,
    reference: passage.reference || passage.title || sectionid,
    title: passage.title || passage.reference || sectionid,
    urlHigh: passage.web_url || passage.web_url_low || '',
    urlLow: passage.web_url_low || passage.web_url || '',
    poster: passage.cover || '',
    durationSec: durationToSeconds(passage.length)
  };
}

class PlaylistModel {
  constructor(passages) {
    this.items = (passages ?? []).map(createPlaylistItem);
    this.length = this.items.length;
    this.isEmpty = this.length === 0;
    this.sections = [];
    this.byFragment = new Map();
    this.sectionItems = new Map();
    this.indexItems();
  }

  indexItems() {
    for (const item of this.items) {
      if (!this.byFragment.has(item.fragmentid)) this.byFragment.set(item.fragmentid, item.index);
      if (!this.sectionItems.has(item.sectionid)) {
        this.sectionItems.set(item.sectionid, []);
        this.sections.push(item.sectionid);
      }
      this.sectionItems.get(item.sectionid).push(item);
    }
  }

  get(index) {
    return this.items[index] ?? null;
  }

  itemsForSection(sectionid) {
    return this.sectionItems.get(sectionid) ?? [];
  }

  indexOfSection(sectionid) {
    const list = this.sectionItems.get(sectionid);
    return list?.length ? list[0].index : -1;
  }

  indexOfFragment(fragmentid) {
    if (fragmentid != null && this.byFragment.has(fragmentid)) return this.byFragment.get(fragmentid);
    const sectionid = String(fragmentid ?? '').split('_')[0];
    return this.indexOfSection(sectionid);
  }

  next(index) {
    return index + 1 < this.items.length ? index + 1 : -1;
  }

  prev(index) {
    return index - 1 >= 0 ? index - 1 : -1;
  }

  // Cumulative timeline for one chapter: total seconds plus each passage's start/end in seconds and as fractions of the total.
  chapterTimeline(sectionid) {
    const list = this.itemsForSection(sectionid);
    const total = list.reduce((sum, item) => sum + item.durationSec, 0);
    let elapsed = 0;
    const markers = list.map((item) => {
      const startSec = elapsed;
      elapsed += item.durationSec;
      return {
        item,
        startSec,
        endSec: elapsed,
        startFraction: total > 0 ? startSec / total : 0,
        endFraction: total > 0 ? elapsed / total : 0
      };
    });
    return { total, markers };
  }

  sectionsForBook(bookid) {
    return this.sections.filter((sectionid) => sectionid.substring(0, 2) === bookid);
  }
}

// Build a playlist model from ordered passage records.
export function DeafPlaylist(passages) {
  return new PlaylistModel(passages);
}

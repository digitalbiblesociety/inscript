import { describe, expect, it } from 'vitest';

import { BOOK_DATA } from '@bible/BibleData.js';
import eng2pVerses from '@/data/eng2p-verses.json';

const verseIds = eng2pVerses.secondPersonPlurals;

const parse = (id) => {
  const [section, verse] = id.split('_');
  return { code: section.slice(0, 2), chapter: Number(section.slice(2)), verse: Number(verse) };
};

describe('Eng2pPlugin secondPersonPlurals table', () => {
  it('holds a substantial list of verse ids', () => {
    expect(verseIds.length).toBeGreaterThan(4000);
  });

  it('every verse id uses a book code this app knows', () => {
    const unknown = [...new Set(verseIds.filter((id) => !BOOK_DATA[parse(id).code]))];
    const codes = [...new Set(unknown.map((id) => parse(id).code))];
    expect(unknown, `unknown book codes ${codes.join(', ')} in ids: ${unknown.slice(0, 10).join(', ')}`).toEqual([]);
  });

  it('every chapter is within its book', () => {
    const bad = verseIds.filter((id) => {
      const { code, chapter } = parse(id);
      const book = BOOK_DATA[code];
      return book && !(chapter >= 1 && chapter <= book.chapters.length);
    });
    expect(bad, `chapter out of range: ${bad.slice(0, 10).join(', ')}`).toEqual([]);
  });

  it('every verse is within its chapter', () => {
    const bad = verseIds.filter((id) => {
      const { code, chapter, verse } = parse(id);
      const counts = BOOK_DATA[code]?.chapters;
      const total = counts?.[chapter - 1];
      return total != null && verse > total;
    });
    expect(bad, `verse out of range: ${bad.slice(0, 10).join(', ')}`).toEqual([]);
  });

  it('contains no duplicate verse ids', () => {
    const seen = new Set();
    const dupes = [...new Set(verseIds.filter((id) => seen.has(id) || (seen.add(id), false)))];
    expect(dupes, `duplicates: ${dupes.slice(0, 10).join(', ')}`).toEqual([]);
  });

  it('uses this app’s book codes, not other schemes for the same books', () => {
    for (const code of ['RM', 'GL', 'C1', 'C2', 'P1', 'P2', 'J1']) {
      expect(verseIds.some((id) => id.startsWith(code)), `no ${code} entries`).toBe(true);
    }
    const foreign = [...new Set(verseIds.filter((id) => /^(RO|GA|\d[A-Z])\d/.test(id))
      .map((id) => id.slice(0, 2)))];
    expect(foreign, `foreign book codes present: ${foreign.join(', ')}`).toEqual([]);
  });
});

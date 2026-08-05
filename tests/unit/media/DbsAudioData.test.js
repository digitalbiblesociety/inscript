import { describe, expect, it } from 'vitest';
import {
  dbsNumToCode,
  nextDbsFragment,
  parseBibleIndex,
  parseTimingText,
  prevDbsFragment
} from '@/media/DbsAudioData.js';

describe('DBS audio index parsing', () => {
  it('maps DBS book numbers and rejects values outside the canon', () => {
    expect(dbsNumToCode(1)).toBe('GN');
    expect(dbsNumToCode('39')).toBe('ML');
    expect(dbsNumToCode(40)).toBe('MT');
    expect(dbsNumToCode('66')).toBe('RV');
    expect(dbsNumToCode(0)).toBeNull();
    expect(dbsNumToCode(67)).toBeNull();
    expect(dbsNumToCode('nope')).toBeNull();
  });

  it('parses, groups, and numerically sorts chapter filenames', () => {
    const result = parseBibleIndex(`
      ignored.txt
      40_Matthew_10.mp3
      40_Matthew_02.mp3

      41_Mark_1.mp3
      99_Invalid_1.mp3
    `);

    expect(result.bookOrder).toEqual(['MT', 'MK']);
    expect(result.books.get('MT')).toMatchObject({
      dbsNum: '40',
      dbsName: 'Matthew',
      chapters: [2, 10]
    });
    expect(result.books.get('MT').chapterFiles.get(2)).toBe('02');
    expect(result.books.get('MK').chapters).toEqual([1]);
  });

  it('parses timing rows into seconds and ignores malformed rows', () => {
    expect(parseTimingText('Verse 1\t00:00:01.250\nwrong\nVerse 12\t01:02:03.5')).toEqual([
      { verse: 1, time: 1.25 },
      { verse: 12, time: 3723.005 }
    ]);
    expect(parseTimingText('not timing data')).toBeNull();
  });
});

describe('DBS chapter navigation', () => {
  const audioInfo = parseBibleIndex(`
    40_Matthew_01.mp3
    40_Matthew_03.mp3
    41_Mark_02.mp3
    43_John_01.mp3
    43_John_02.mp3
  `);

  it('moves within a book and then into the next book', () => {
    expect(nextDbsFragment(audioInfo, 'MT1_17')).toBe('MT3_1');
    expect(nextDbsFragment(audioInfo, 'MT3_1')).toBe('MK2_1');
    expect(nextDbsFragment(audioInfo, 'MK2_5')).toBe('JN1_1');
    expect(nextDbsFragment(audioInfo, 'JN2_1')).toBeNull();
  });

  it('moves within a book and then into the previous book', () => {
    expect(prevDbsFragment(audioInfo, 'JN2_1')).toBe('JN1_1');
    expect(prevDbsFragment(audioInfo, 'JN1_1')).toBe('MK2_1');
    expect(prevDbsFragment(audioInfo, 'MK2_1')).toBe('MT3_1');
    expect(prevDbsFragment(audioInfo, 'MT1_1')).toBeNull();
  });

  it('returns null for unknown chapters and empty adjacent books', () => {
    expect(nextDbsFragment(audioInfo, 'MT2_1')).toBeNull();
    expect(prevDbsFragment(audioInfo, 'XX1_1')).toBeNull();

    const withEmptyBook = {
      books: new Map([
        ['MT', audioInfo.books.get('MT')],
        ['MK', { chapters: [] }]
      ]),
      bookOrder: ['MT', 'MK']
    };
    expect(nextDbsFragment(withEmptyBook, 'MT3_1')).toBeNull();
  });
});

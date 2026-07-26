import { describe, it, expect } from 'vitest';
import { referenceToVerseId } from '../../../tools/build-dbs-video-media.mjs';

/**
 * The generator turns each DBS video item's `reference` into the verse the thumb
 * hangs off. A misparse silently pins a video to the wrong verse, so the shapes
 * the catalog actually uses are pinned here.
 */
describe('referenceToVerseId', () => {
  it('maps a bare chapter to its first verse', () => {
    expect(referenceToVerseId('Matthew 1')).toBe('MT1_1');
    expect(referenceToVerseId('Mark 16')).toBe('MK16_1');
    expect(referenceToVerseId('Acts 27')).toBe('AC27_1');
  });

  it('maps a chapter:verse to that verse', () => {
    expect(referenceToVerseId('Luke 1:1')).toBe('LK1_1');
    expect(referenceToVerseId('John 9:1-41')).toBe('JN9_1');
    expect(referenceToVerseId('Matthew 14:22-36')).toBe('MT14_22');
  });

  it('takes the start of a cross-chapter range', () => {
    expect(referenceToVerseId('Genesis 1:1-2:3')).toBe('GN1_1');
    expect(referenceToVerseId('Luke 11:33-12:34')).toBe('LK11_33');
  });

  it('handles en/em dashes and comma lists', () => {
    expect(referenceToVerseId('Acts 1–7')).toBe('AC1_1');
    expect(referenceToVerseId('Genesis 12, 15, 17')).toBe('GN12_1');
    expect(referenceToVerseId('Exodus 5–20 and beyond')).toBe('EX5_1');
    expect(referenceToVerseId('Genesis 2:4–25')).toBe('GN2_4');
  });

  it('resolves numbered and multi-word book names', () => {
    expect(referenceToVerseId('1 Samuel 3:1')).toBe('S1' + '3_1');
    expect(referenceToVerseId('2 Kings 5')).toBe('K25_1');
    expect(referenceToVerseId('Song of Solomon 2:1')).toBe('SS2_1');
    expect(referenceToVerseId('Psalms 23')).toBe('PS23_1');
  });

  it('accepts the abbreviations in the book alias lists', () => {
    expect(referenceToVerseId('Gen 1')).toBe('GN1_1');
    expect(referenceToVerseId('Mt 5:3')).toBe('MT5_3');
  });

  it('rejects prose and empty references', () => {
    // LUMO: The Covenant opens with "Frame narrative — Ezra in Jerusalem".
    expect(referenceToVerseId('Frame narrative — Ezra in Jerusalem')).toBeNull();
    expect(referenceToVerseId('Invitation to know Jesus personally')).toBeNull();
    expect(referenceToVerseId('')).toBeNull();
    expect(referenceToVerseId(null)).toBeNull();
    expect(referenceToVerseId(undefined)).toBeNull();
  });

  it('rejects a chapter with no recognizable book', () => {
    expect(referenceToVerseId('Chapter 3')).toBeNull();
    expect(referenceToVerseId('Nonesuch 1:1')).toBeNull();
  });
});

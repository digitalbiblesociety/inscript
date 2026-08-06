import { describe, expect, it } from 'vitest';
import {
  formatNumeral,
  normalizeNumerals,
  numberingSystemFor,
  NUMBERING_SYSTEM_DIGITS
} from '@lib/Numerals.js';

describe('Numerals', () => {
  it('defines every supported decimal digit set', () => {
    expect(NUMBERING_SYSTEM_DIGITS).toEqual({
      latn: '0123456789',
      arab: '٠١٢٣٤٥٦٧٨٩',
      arabext: '۰۱۲۳۴۵۶۷۸۹',
      beng: '০১২৩৪৫৬৭৮৯',
      deva: '०१२३४५६७८९'
    });
  });

  it('resolves translated catalog languages through BCP-47 normalization', () => {
    const languageSystems = [
      { languages: ['ar', 'ara', 'arb', 'arb-Arab'], system: 'arab' },
      { languages: ['bn', 'ben', 'ben-Beng'], system: 'beng' },
      { languages: ['hi', 'hin', 'hin-Deva'], system: 'deva' },
      { languages: ['ur', 'urd', 'urd-Arab'], system: 'arabext' }
    ];
    for (const { languages, system } of languageSystems) {
      for (const language of languages) expect(numberingSystemFor(language)).toBe(system);
    }
    expect(numberingSystemFor('eng')).toBe('latn');
  });

  it('honors valid per-text overrides and ignores invalid ones', () => {
    expect(numberingSystemFor({ lang: 'arb', numberingSystem: 'latn' })).toBe('latn');
    expect(numberingSystemFor({ lang: 'eng', numberingSystem: 'ARAB' })).toBe('arab');
    expect(numberingSystemFor({ lang: 'eng', numberingSystem: 'missing' })).toBe('latn');
  });

  it('formats Arabic-Indic digits without changing punctuation or adding grouping', () => {
    expect(formatNumeral(0, 'arb')).toBe('٠');
    expect(formatNumeral(9, 'arb')).toBe('٩');
    expect(formatNumeral(10, 'arb')).toBe('١٠');
    expect(formatNumeral(150, 'arb')).toBe('١٥٠');
    expect(formatNumeral('3:16', 'arb')).toBe('٣:١٦');
    expect(formatNumeral(150, 'eng')).toBe('150');
  });

  it.each([
    ['ben', '১৫০', '৩:১৬'],
    ['hin', '१५०', '३:१६'],
    ['urd', '۱۵۰', '۳:۱۶']
  ])('formats the vernacular decimal digits for %s', (language, number, reference) => {
    expect(formatNumeral(150, language)).toBe(number);
    expect(formatNumeral('3:16', language)).toBe(reference);
  });

  it('preserves the existing custom numbers lookup as the highest-priority override', () => {
    const numbers = [];
    numbers[12] = 'twelve';
    expect(formatNumeral(12, { lang: 'arb', numbers })).toBe('twelve');
    expect(formatNumeral(13, { lang: 'arb', numbers })).toBe('١٣');
  });

  it('ignores a legacy identity Latin table unless Latin is explicitly requested', () => {
    const numbers = Array.from({ length: 151 }, (_, number) => String(number));
    expect(formatNumeral(12, { lang: 'arb', numbers })).toBe('١٢');
    expect(formatNumeral(12, { lang: 'arb', numbers, numberingSystem: 'latn' })).toBe('12');
  });

  it('normalizes supported vernacular digits to ASCII for parsing', () => {
    expect(normalizeNumerals('John ٣:١٦-٤:٢')).toBe('John 3:16-4:2');
    expect(normalizeNumerals('JN٣_١٦')).toBe('JN3_16');
    expect(normalizeNumerals('০१२۳')).toBe('0123');
    expect(normalizeNumerals('John 3:16')).toBe('John 3:16');
  });
});

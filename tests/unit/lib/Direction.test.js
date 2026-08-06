import { describe, expect, it } from 'vitest';
import { directionForText } from '@lib/Direction.js';

describe('Direction', () => {
  it.each([
    ['arb', 'rtl'],
    ['urd', 'rtl'],
    ['pes', 'rtl'],
    ['heb', 'rtl'],
    ['pus', 'rtl'],
    ['snd', 'rtl'],
    ['uig', 'rtl'],
    ['div', 'rtl'],
    ['yid', 'rtl'],
    ['eng', 'ltr']
  ])('resolves %s text as %s', (language, direction) => {
    expect(directionForText(language)).toBe(direction);
  });

  it('overrides incorrect LTR catalog metadata for an RTL language', () => {
    expect(directionForText({ lang: 'arb', dir: 'ltr', script: 'Latn' })).toBe('rtl');
  });

  it('honors RTL metadata and script information for otherwise LTR languages', () => {
    expect(directionForText({ lang: 'eng', dir: 'rtl' })).toBe('rtl');
    expect(directionForText({ lang: 'eng', dir: 'ltr', script: 'Hebr' })).toBe('rtl');
  });

  it('honors an explicit Latin script in a BCP-47 language tag', () => {
    expect(directionForText({ lang: 'ar-Latn', dir: 'ltr' })).toBe('ltr');
  });
});

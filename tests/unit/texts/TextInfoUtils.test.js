import { describe, expect, it } from 'vitest';
import { processText, processTexts } from '@texts/TextInfoUtils.js';

describe('TextInfoUtils direction normalization', () => {
  it.each(['arb', 'urd', 'pes', 'heb'])('corrects bad LTR metadata for %s texts', (lang) => {
    const text = { id: `${lang}TEST`, lang, dir: 'ltr', script: 'Latn' };
    processText(text, 'local');

    expect(text.dir).toBe('rtl');
    expect(text.providerName).toBe('local');
  });

  it('normalizes every text in a provider manifest', () => {
    const texts = [
      { id: 'ARABIC', lang: 'arb', dir: 'ltr' },
      { id: 'ENGLISH', lang: 'eng', dir: 'ltr' }
    ];
    processTexts(texts, 'local');

    expect(texts.map(text => text.dir)).toEqual(['rtl', 'ltr']);
  });
});

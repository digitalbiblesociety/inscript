import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AVAILABLE_LANGUAGES } from '@/resources/index.js';

const resourceDirectory = resolve('browserbible/public/content/pericopes');
const NON_LATIN_LOCALES = new Set(['ar', 'bn', 'hi', 'ja', 'ko', 'ru', 'ur', 'zh-CN']);

function readResource(locale) {
  return JSON.parse(readFileSync(resolve(resourceDirectory, `${locale}.json`), 'utf8'));
}

describe('pericope translation resources', () => {
  it('provides a complete, non-empty dataset for every application language', () => {
    const locales = readdirSync(resourceDirectory)
      .filter(file => file.endsWith('.json'))
      .map(file => file.slice(0, -5))
      .sort();
    expect(locales).toEqual([...AVAILABLE_LANGUAGES].sort());

    const english = readResource('en');
    const englishReferences = Object.keys(english);
    expect(englishReferences).toHaveLength(1915);
    for (const locale of locales) {
      const resource = readResource(locale);
      expect(Object.keys(resource), locale).toEqual(englishReferences);
      expect(Object.values(resource).every(title => typeof title === 'string' && title.trim()), locale)
        .toBe(true);
      if (locale === 'en') continue;
      const unchanged = englishReferences.filter(reference => resource[reference] === english[reference]);
      expect(unchanged.length, `${locale} has an untranslated batch`).toBeLessThan(25);
      if (NON_LATIN_LOCALES.has(locale)) {
        expect(unchanged, `${locale} has untranslated English titles`).toEqual([]);
      }
    }
  });
});

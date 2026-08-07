import { describe, expect, it } from 'vitest';
import { findVerseMatches, collectSectionResults } from '@texts/SearchMatcher.js';

const options = (searchTermsRegExp, searchType = 'AND', isLemmaSearch = false) =>
  ({ searchTermsRegExp, searchType, isLemmaSearch });

describe('findVerseMatches', () => {
  it('requires every term for an AND search and highlights the matches', () => {
    const result = findVerseMatches(
      'faith and hope remain',
      options([/\b(faith)\b/gi, /\b(hope)\b/gi])
    );
    expect(result.foundMatch).toBe(true);
    expect(result.html.match(/class="highlight"/g)).toHaveLength(2);

    expect(findVerseMatches('faith remains', options([/\b(faith)\b/gi, /\b(hope)\b/gi])).foundMatch)
      .toBe(false);
  });

  it('accepts any term for an OR search', () => {
    const terms = [/\b(faith)\b/gi, /\b(hope)\b/gi];
    expect(findVerseMatches('hope remains', options(terms, 'OR')).foundMatch).toBe(true);
    expect(findVerseMatches('love remains', options(terms, 'OR')).foundMatch).toBe(false);
  });

  it('matches nothing when there are no terms', () => {
    // An AND search over an empty term list must not report every verse.
    expect(findVerseMatches('any verse at all', options([])).foundMatch).toBe(false);
    expect(findVerseMatches('any verse at all', options([], 'OR')).foundMatch).toBe(false);
    expect(findVerseMatches('any verse at all', options(undefined)).foundMatch).toBe(false);
  });

  it('leaves lemma matches unhighlighted', () => {
    const html = '<l s="G25">loved</l>';
    const result = findVerseMatches(html, options([/G25/g], 'AND', true));
    expect(result).toEqual({ html, foundMatch: true });
  });
});

describe('collectSectionResults', () => {
  const section = '<div class="section">' +
    '<span class="v JN3_16" data-id="JN3_16">For God so loved<span class="note">n</span></span>' +
    '<span class="v JN3_17" data-id="JN3_17">For God sent</span>' +
    '</div>';

  it('returns one entry per matching fragment, without note markup', () => {
    const results = collectSectionResults(section, ['JN3_16', 'JN3_17', 'JN3_99'],
      options([/\b(loved)\b/gi]));
    expect(results).toEqual([
      { fragmentid: 'JN3_16', html: 'For God so <span class="highlight">loved</span> ' }
    ]);
  });

  it('reports a fragment listed twice twice, so callers must deduplicate', () => {
    const results = collectSectionResults(section, ['JN3_16', 'JN3_16'], options([/\b(loved)\b/gi]));
    expect(results).toHaveLength(2);
  });
});

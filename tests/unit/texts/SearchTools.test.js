import { describe, it, expect } from 'vitest';
import { SearchTools } from '@texts/Search.js';

describe('SearchTools.splitWords', () => {
  it('splits simple ASCII words', () => {
    expect(SearchTools.splitWords('Hello world')).toEqual(['Hello', 'world']);
  });

  it('strips trailing punctuation but preserves intra-word apostrophes/hyphens', () => {
    expect(SearchTools.splitWords("don't, can't!")).toEqual(["don't", "can't"]);
    expect(SearchTools.splitWords('three-fold cord')).toEqual(['three-fold', 'cord']);
  });

  it("strips possessive 's", () => {
    expect(SearchTools.splitWords("God's word")).toEqual(['God', 'word']);
  });

  it('treats CJK characters as their own words', () => {
    const result = SearchTools.splitWords('你好 world');
    expect(result).toContain('你');
    expect(result).toContain('好');
    expect(result).toContain('world');
  });

  it('drops duplicates', () => {
    expect(SearchTools.splitWords('the the and and')).toEqual(['the', 'and']);
  });

  it('strips regex meta chars and Chinese punctuation', () => {
    expect(SearchTools.splitWords('hello (world).')).toEqual(['hello', 'world']);
    expect(SearchTools.splitWords('你好。世界')).toEqual(['你', '好', '世', '界']);
  });

  it('coerces non-string input', () => {
    expect(SearchTools.splitWords(42)).toEqual(['42']);
  });

  it('splits on every kind of whitespace, not just a literal space', () => {
    expect(SearchTools.splitWords('love\nhope\tfaith')).toEqual(['love', 'hope', 'faith']);
  });
});

describe('SearchTools.removeOperators', () => {
  it('drops standalone AND/OR tokens in any case', () => {
    expect(SearchTools.removeOperators('love OR hope')).toBe('love hope');
    expect(SearchTools.removeOperators('love and hope')).toBe('love hope');
    expect(SearchTools.removeOperators('faith or hope AND love')).toBe('faith hope love');
  });

  it('keeps words that merely contain an operator', () => {
    expect(SearchTools.removeOperators('order android')).toBe('order android');
    expect(SearchTools.removeOperators('bread-or-wine faith')).toBe('bread-or-wine faith');
  });

  it('keeps operators inside quoted phrases', () => {
    expect(SearchTools.removeOperators('"war and peace" OR hope')).toBe('"war and peace" hope');
  });

  it('drops a leading or trailing operator too', () => {
    expect(SearchTools.removeOperators('love or')).toBe('love');
    expect(SearchTools.removeOperators('  OR love  ')).toBe('love');
  });
});

describe('SearchTools.parseQuery', () => {
  it('reports OR mode and excludes the operator from the terms', () => {
    const query = SearchTools.parseQuery('love OR hope');
    expect(query.searchType).toBe('OR');
    expect(query.words).toEqual(['love', 'hope']);
    expect(query.searchTermsRegExp).toHaveLength(2);
    expect(query.searchTermsRegExp.some(re => re.test('or'))).toBe(false);
  });

  it('defaults to AND and drops the AND operator', () => {
    const query = SearchTools.parseQuery('love AND hope');
    expect(query.searchType).toBe('AND');
    expect(query.words).toEqual(['love', 'hope']);
    expect(query.searchTermsRegExp).toHaveLength(2);
  });

  it('keeps the words of a quoted phrase as index terms', () => {
    const query = SearchTools.parseQuery('"jesus christ"');
    expect(query.words).toEqual(['jesus', 'christ']);
    expect(query.searchTermsRegExp).toHaveLength(1);
  });

  it('treats a lemma query as whitespace-separated Strong numbers', () => {
    const query = SearchTools.parseQuery('G2424 G5547 G2424', true);
    expect(query.searchType).toBe('AND');
    expect(query.words).toEqual(['G2424', 'G5547']);
  });

  it('applies the operator to a lemma query without indexing it', () => {
    const query = SearchTools.parseQuery('H430 OR H3068', true);
    expect(query.searchType).toBe('OR');
    expect(query.words).toEqual(['H430', 'H3068']);
    expect(query.searchTermsRegExp).toHaveLength(2);
  });

  it('strips operators from non-ASCII queries too', () => {
    expect(SearchTools.parseQuery('神 OR 愛').words).toEqual(['神', '愛']);
  });

  it('does not infer OR mode from a hyphenated word', () => {
    const query = SearchTools.parseQuery('bread-or-wine faith');
    expect(query.searchType).toBe('AND');
    expect(query.words).toEqual(['bread-or-wine', 'faith']);
  });

  it('does not treat an operator inside a quoted phrase as query syntax', () => {
    const query = SearchTools.parseQuery('"war OR peace"');
    expect(query.searchType).toBe('AND');
    expect(query.words).toEqual(['war', 'OR', 'peace']);
    expect(query.searchTermsRegExp).toHaveLength(1);
  });
});

describe('SearchTools.createSearchTerms', () => {
  it('builds AND terms for plain unquoted ASCII input', () => {
    const terms = SearchTools.createSearchTerms('jesus christ');
    expect(terms).toHaveLength(2);
    expect(terms[0].source).toContain('jesus');
    expect(terms[1].source).toContain('christ');
    expect(terms.every(r => r.flags.includes('g') && r.flags.includes('i'))).toBe(true);
  });

  it('treats explicit AND as a separator', () => {
    const terms = SearchTools.createSearchTerms('jesus AND christ');
    expect(terms).toHaveLength(2);
  });

  it('deduplicates AND terms', () => {
    const terms = SearchTools.createSearchTerms('love love love');
    expect(terms).toHaveLength(1);
  });

  it('builds a single phrase regex for quoted input', () => {
    const terms = SearchTools.createSearchTerms('"jesus christ"');
    expect(terms).toHaveLength(1);
    expect(terms[0].test('Jesus Christ')).toBe(true);
    expect(terms[0].test('Jesus the Christ')).toBe(false);
  });

  it('falls back to splitWords for non-ASCII (CJK) text', () => {
    const terms = SearchTools.createSearchTerms('你好');
    expect(terms.length).toBeGreaterThan(0);
    expect(terms.every(r => r instanceof RegExp)).toBe(true);
  });

  it('builds Strong-number regexes when isLemmaSearch=true', () => {
    const terms = SearchTools.createSearchTerms('G2424 G5547', true);
    expect(terms).toHaveLength(2);
    expect(terms[0].source).toContain('2424');
    expect(terms[1].source).toContain('5547');
  });

  it('AND-term regex matches word as a standalone token', () => {
    const [re] = SearchTools.createSearchTerms('love');
    expect('I love you'.match(re)).not.toBeNull();
    expect('beloved'.match(re)).toBeNull();
  });
});

describe('SearchTools.hashWord', () => {
  it('produces a value in [0, HASHSIZE)', () => {
    for (const w of ['', 'a', 'jesus', 'Christ', 'verylongword']) {
      const h = SearchTools.hashWord(w);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(SearchTools.HASHSIZE);
    }
  });

  it('is stable for the same input', () => {
    expect(SearchTools.hashWord('Jesus')).toBe(SearchTools.hashWord('Jesus'));
  });

  it('differs (typically) for different inputs', () => {
    // Not guaranteed by hashing, but with HASHSIZE=20 these spread.
    const set = new Set(['the', 'lord', 'is', 'my', 'shepherd'].map(w => SearchTools.hashWord(w)));
    expect(set.size).toBeGreaterThan(1);
  });
});

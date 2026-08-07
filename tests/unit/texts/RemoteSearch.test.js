import { describe, expect, it } from 'vitest';
import {
  createRemoteSearchEvent,
  matchesSearchTerms,
  highlightSearchTerms,
  isInDivisions
} from '@texts/RemoteSearch.js';

describe('createRemoteSearchEvent', () => {
  it('parses the query once into the operator and the terms', () => {
    const { searchType, event } = createRemoteSearchEvent({ id: 'provider' }, 'love OR hope');
    expect(searchType).toBe('OR');
    expect(event).toMatchObject({
      type: 'complete',
      target: { id: 'provider' },
      data: { results: [], searchIndexesData: [], isLemmaSearch: false }
    });
    expect(event.data.searchTermsRegExp).toHaveLength(2);
  });

  it('defaults to AND', () => {
    expect(createRemoteSearchEvent(null, 'love hope').searchType).toBe('AND');
  });
});

describe('matchesSearchTerms', () => {
  const terms = () => [/\b(faith)\b/gi, /\b(hope)\b/gi];

  it('requires every term in AND mode', () => {
    expect(matchesSearchTerms('faith and hope', terms(), 'AND')).toBe(true);
    expect(matchesSearchTerms('faith alone', terms(), 'AND')).toBe(false);
  });

  it('accepts any term in OR mode, including only the last', () => {
    expect(matchesSearchTerms('hope alone', terms(), 'OR')).toBe(true);
    expect(matchesSearchTerms('love alone', terms(), 'OR')).toBe(false);
  });

  it('matches nothing without terms', () => {
    expect(matchesSearchTerms('anything', [], 'OR')).toBe(false);
    expect(matchesSearchTerms('anything', undefined, 'AND')).toBe(false);
  });

  it('is repeatable with sticky global regexes', () => {
    const shared = terms();
    expect(matchesSearchTerms('faith and hope', shared, 'AND')).toBe(true);
    expect(matchesSearchTerms('faith and hope', shared, 'AND')).toBe(true);
  });

  it('tolerates absent text', () => {
    expect(matchesSearchTerms(undefined, terms(), 'OR')).toBe(false);
  });
});

describe('highlightSearchTerms', () => {
  it('escapes remote markup before wrapping matches', () => {
    expect(highlightSearchTerms('<b>love</b> & hope', [/\b(love)\b/gi])).toBe(
      '&lt;b&gt;<span class="highlight">love</span>&lt;/b&gt; &amp; hope'
    );
  });

  it('highlights every term and leaves reusable regexes rewound', () => {
    const regexes = [/\b(love)\b/gi, /\b(hope)\b/gi];
    const html = highlightSearchTerms('love and hope', regexes);
    expect(html.match(/class="highlight"/g)).toHaveLength(2);
    expect(highlightSearchTerms('love and hope', regexes)).toBe(html);
  });
});

describe('isInDivisions', () => {
  it('includes everything when nothing is selected', () => {
    expect(isInDivisions([], 'GN')).toBe(true);
    expect(isInDivisions(undefined, 'GN')).toBe(true);
  });

  it('filters by the selected divisions', () => {
    expect(isInDivisions(['JN'], 'JN')).toBe(true);
    expect(isInDivisions(['JN'], 'GN')).toBe(false);
  });
});

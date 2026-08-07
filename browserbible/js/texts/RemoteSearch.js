/**
 * Shared pieces of the remote search adapters (API.Bible, ESV, Bible Brain).
 * Each provider only differs in how it fetches and how it names books; term
 * matching, escaping, highlighting and the completion event are the same, and
 * must stay the same as the local search in Search.js.
 */

import { escapeHtml } from '../lib/escapeHtml.js';
import { SearchTools } from './SearchTools.js';

/**
 * The 'complete' event every search provider hands back to SearchWindow, plus
 * the parsed query the adapter needs while filtering results.
 */
export function createRemoteSearchEvent(target, text) {
  const { searchType, searchTermsRegExp } = SearchTools.parseQuery(text, false);

  return {
    searchType,
    event: {
      type: 'complete',
      target,
      data: {
        results: [],
        searchIndexesData: [],
        searchTermsRegExp,
        isLemmaSearch: false
      }
    }
  };
}

/**
 * AND: every term must match; OR: any one. Mirrors findVerseMatches() so a
 * remote search accepts the same verses the local one would. An empty term
 * list matches nothing.
 */
export function matchesSearchTerms(text, searchTermsRegExp, searchType) {
  if (!searchTermsRegExp || searchTermsRegExp.length === 0) return false;

  const test = (regex) => {
    regex.lastIndex = 0;
    const found = regex.test(text ?? '');
    regex.lastIndex = 0;
    return found;
  };

  return searchType === 'OR'
    ? searchTermsRegExp.some(test)
    : searchTermsRegExp.every(test);
}

/**
 * Escape first, then wrap matches: `text` is remote verse text that the results
 * list injects with innerHTML, so unescaped markup would render. Search terms
 * are words, so escaping &<> before matching does not change what highlights.
 */
export function highlightSearchTerms(text, searchTermsRegExp) {
  let processedHtml = escapeHtml(text);

  for (const regex of searchTermsRegExp) {
    regex.lastIndex = 0;
    processedHtml = processedHtml.replace(regex, match => `<span class="highlight">${match}</span>`);
    regex.lastIndex = 0;
  }

  return processedHtml;
}

/** No selection means every division is included. */
export function isInDivisions(divisions, bookCode) {
  return !divisions || divisions.length === 0 || divisions.includes(bookCode);
}

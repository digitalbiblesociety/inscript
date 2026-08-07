import { getConfig } from '../core/config.js';
import { BOOK_DATA, DEFAULT_BIBLE } from '../bible/BibleData.js';
import {
  createRemoteSearchEvent,
  matchesSearchTerms,
  highlightSearchTerms,
  isInDivisions
} from './RemoteSearch.js';

const SEARCH_PAGE_SIZE = 100;
const SEARCH_MAX_PAGES = 20;

/**
 * Builds the ESV startSearch function. Dependencies are injected so this
 * module stays free of the provider's manifest state.
 */
export function createEsvSearchStarter({ getTextInfoSync, bookName }) {
  // "1 Samuel" / "Psalm" / "Song of Solomon" (any BibleData english alias) -> DBS code.
  let bookNameToCode = null;
  const getBookCode = (name) => {
    if (!bookNameToCode) {
      bookNameToCode = new Map();
      for (const bookid of DEFAULT_BIBLE) {
        for (const alias of BOOK_DATA[bookid].names?.eng ?? []) {
          bookNameToCode.set(alias.toLowerCase(), bookid);
        }
        bookNameToCode.set(bookName(bookid).toLowerCase(), bookid);
      }
    }
    return bookNameToCode.get(name.toLowerCase());
  };

  return function startSearch({ textid, divisions, text, onSearchComplete }) {
    const config = getConfig();
    const info = getTextInfoSync(textid);

    const { searchType, event: e } = createRemoteSearchEvent(this, text);
    const terms = e.data.searchTermsRegExp;

    if (!info) {
      onSearchComplete(e);
      return;
    }

    const query = encodeURIComponent(text).replace(/%20/g, '+');

    const addResults = (results) => {
      for (const result of results) {
        const match = /^(.+?)\s+(\d+):(\d+)/.exec(result.reference ?? '');
        if (!match) continue;

        const bookCode = getBookCode(match[1]);
        if (!bookCode) continue;

        if (matchesSearchTerms(result.content, terms, searchType) &&
            isInDivisions(divisions, bookCode)) {
          e.data.results.push({
            fragmentid: `${bookCode}${match[2]}_${match[3]}`,
            html: highlightSearchTerms(result.content, terms)
          });
        }
      }
    };

    const fetchPage = (page) => {
      const url = `${config.esvProxyBase}/passage/search/?q=${query}&page-size=${SEARCH_PAGE_SIZE}&page=${page}`;

      fetch(url)
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then(data => {
          addResults(data?.results ?? []);

          const totalPages = data?.total_pages ?? 1;
          if (page < totalPages && page < SEARCH_MAX_PAGES) {
            fetchPage(page + 1);
          } else {
            onSearchComplete(e);
          }
        })
        .catch(() => {
          onSearchComplete(e);
        });
    };

    fetchPage(1);
  };
}

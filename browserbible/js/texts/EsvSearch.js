import { getConfig } from '../core/config.js';
import { SearchTools } from './SearchTools.js';
import { BOOK_DATA, DEFAULT_BIBLE } from '../bible/BibleData.js';
import { escapeHtml } from './EsvPassageParser.js';

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

  const highlightWords = (text, searchTermsRegExp) => {
    let processedHtml = escapeHtml(text);

    for (const regex of searchTermsRegExp) {
      regex.lastIndex = 0;
      processedHtml = processedHtml.replace(regex, match => `<span class="highlight">${match}</span>`);
    }

    return processedHtml;
  };

  return function startSearch({ textid, divisions, text, onSearchComplete }) {
    const config = getConfig();
    const info = getTextInfoSync(textid);

    const e = {
      type: 'complete',
      target: this,
      data: {
        results: [],
        searchIndexesData: [],
        searchTermsRegExp: SearchTools.createSearchTerms(text, false),
        isLemmaSearch: false
      }
    };

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

        e.data.searchTermsRegExp[0].lastIndex = 0;
        const hasMatch = e.data.searchTermsRegExp[0].test(result.content);

        if (hasMatch && (divisions.length === 0 || divisions.includes(bookCode))) {
          e.data.results.push({
            fragmentid: `${bookCode}${match[2]}_${match[3]}`,
            html: highlightWords(result.content, e.data.searchTermsRegExp)
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

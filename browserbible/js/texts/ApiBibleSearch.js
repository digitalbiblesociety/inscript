import { getConfig } from '../core/config.js';
import { SearchTools } from './Search.js';
import { escapeHtml } from './ApiBibleChapterParser.js';

const highlightWords = (text, searchTermsRegExp) => {
  // Escape first, then wrap matches: `text` is remote verse text and is
  // injected into the results list via innerHTML (SearchWindow), so unescaped
  // markup would render. Search terms are words, so escaping &<> before
  // matching does not affect which words highlight.
  let processedHtml = escapeHtml(text);

  for (const regex of searchTermsRegExp) {
    regex.lastIndex = 0;
    processedHtml = processedHtml.replace(regex, match => `<span class="highlight">${match}</span>`);
  }

  return processedHtml;
};

/**
 * Builds the API.Bible startSearch function. Dependencies are injected so this
 * module stays free of the provider's manifest and quota state.
 */
export function createApiBibleSearchStarter({ getTextInfoSync, isQuotaResponse, usfmToDbsCode }) {
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
    const url = `${config.apiBibleProxyBase}/bibles/${info.apiId}/search?query=${query}&limit=2000`;

    fetch(url)
      .then(response => {
        if (isQuotaResponse(response)) throw new Error('quota_exceeded');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        const verses = data?.data?.verses ?? [];

        for (const verse of verses) {
          const dbsBookCode = usfmToDbsCode(verse.bookId);
          if (!dbsBookCode) continue;

          // verse.id is like "JHN.3.16"
          const parts = verse.id.split('.');
          const fragmentid = `${dbsBookCode}${parts[1]}_${parts[2]}`;

          e.data.searchTermsRegExp[0].lastIndex = 0;
          const hasMatch = e.data.searchTermsRegExp[0].test(verse.text);

          if (hasMatch && (divisions.length === 0 || divisions.includes(dbsBookCode))) {
            e.data.results.push({
              fragmentid,
              html: highlightWords(verse.text, e.data.searchTermsRegExp)
            });
          }
        }

        onSearchComplete(e);
      })
      .catch(() => {
        onSearchComplete(e);
      });
  };
}

import { getConfig } from '../core/config.js';
import {
  createRemoteSearchEvent,
  matchesSearchTerms,
  highlightSearchTerms,
  isInDivisions
} from './RemoteSearch.js';

/**
 * Builds the API.Bible startSearch function. Dependencies are injected so this
 * module stays free of the provider's manifest and quota state.
 */
export function createApiBibleSearchStarter({ getTextInfoSync, isQuotaResponse, usfmToDbsCode }) {
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

          if (matchesSearchTerms(verse.text, terms, searchType) &&
              isInDivisions(divisions, dbsBookCode)) {
            e.data.results.push({
              fragmentid,
              html: highlightSearchTerms(verse.text, terms)
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

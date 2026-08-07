import { getConfig } from '../core/config.js';
import {
  createRemoteSearchEvent,
  matchesSearchTerms,
  highlightSearchTerms,
  isInDivisions
} from './RemoteSearch.js';

export function extractSearchVerses(json) {
  return [
    json?.data?.verses?.data,
    json?.verses?.data,
    json?.data?.verses,
    json?.data
  ].find(Array.isArray) ?? [];
}

/**
 * Builds the Bible Brain startSearch function. Dependencies are injected so
 * this module stays free of the provider's manifest state.
 */
export function createBibleBrainSearchStarter({ getTextInfoSync, isEnabled, usfmToDbsCode }) {
  return function startSearch({ textid, divisions, text, onSearchComplete }) {
    const config = getConfig();
    const info = getTextInfoSync(textid);

    const { searchType, event: e } = createRemoteSearchEvent(this, text);
    const terms = e.data.searchTermsRegExp;

    if (!info || !isEnabled(config)) {
      onSearchComplete(e);
      return;
    }

    const query = encodeURIComponent(text).replace(/%20/g, '+');
    const base = config.bibleBrainProxyBase;

    const requests = info.biblebrain.textFilesets.map(fs =>
      fetch(`${base}/search?query=${query}&fileset_id=${fs.id}&limit=2000`)
        .then(response => (response.ok ? response.json() : null))
        .catch(() => null)
    );

    Promise.all(requests)
      .then(jsons => {
        const seen = new Set();
        for (const json of jsons) {
          if (!json) continue;
          for (const verse of extractSearchVerses(json)) {
            const dbsBookCode = usfmToDbsCode(verse.book_id);
            if (!dbsBookCode) continue;

            const fragmentid = `${dbsBookCode}${verse.chapter}_${verse.verse_start}`;
            if (seen.has(fragmentid)) continue;

            if (matchesSearchTerms(verse.verse_text, terms, searchType) &&
                isInDivisions(divisions, dbsBookCode)) {
              seen.add(fragmentid);
              e.data.results.push({
                fragmentid,
                html: highlightSearchTerms(verse.verse_text, terms)
              });
            }
          }
        }
        onSearchComplete(e);
      })
      .catch(error => {
        console.error('Bible Brain search error:', error);
        onSearchComplete(e);
      });
  };
}

import { getConfig } from '../core/config.js';
import { SearchTools } from './Search.js';

const highlightWords = (text, searchTermsRegExp) => {
  let processedHtml = text;
  for (const regex of searchTermsRegExp) {
    regex.lastIndex = 0;
    processedHtml = processedHtml.replace(regex, match => `<span class="highlight">${match}</span>`);
  }
  return processedHtml;
};

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

    if (!info || !isEnabled(config)) {
      onSearchComplete(e);
      return;
    }

    const searchType = /\bOR\b/gi.test(text) ? 'OR' : 'AND';
    const query = encodeURIComponent(text).replace(/%20/g, '+');
    const base = config.bibleBrainProxyBase;

    const requests = info.biblebrain.textFilesets.map(fs =>
      fetch(`${base}/search?query=${query}&fileset_id=${fs.id}&limit=2000`)
        .then(response => (response.ok ? response.json() : null))
        .catch(() => null)
    );

    Promise.all(requests)
      .then(jsons => {
        // AND: every term must match; OR: any one (matches local TextSearch).
        const terms = e.data.searchTermsRegExp;
        const verseMatches = (verseText) => {
          if (terms.length === 0) return false;
          const test = (re) => { re.lastIndex = 0; return re.test(verseText); };
          return searchType === 'OR' ? terms.some(test) : terms.every(test);
        };

        const seen = new Set();
        for (const json of jsons) {
          if (!json) continue;
          for (const verse of extractSearchVerses(json)) {
            const dbsBookCode = usfmToDbsCode(verse.book_id);
            if (!dbsBookCode) continue;

            const fragmentid = `${dbsBookCode}${verse.chapter}_${verse.verse_start}`;
            if (seen.has(fragmentid)) continue;

            if (verseMatches(verse.verse_text) && (divisions.length === 0 || divisions.includes(dbsBookCode))) {
              seen.add(fragmentid);
              e.data.results.push({
                fragmentid,
                html: highlightWords(verse.verse_text, e.data.searchTermsRegExp)
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

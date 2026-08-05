import { getConfig } from '../core/config.js';
import { EventEmitterMixin } from '../common/EventEmitter.js';
import { BOOK_DATA } from '../bible/BibleData.js';
import { getShowApocrypha, isApocryphalSection } from '../bible/Apocrypha.js';
import { loadSection, getText } from './TextLoader.js';
import { SearchTools } from './SearchTools.js';
import { SearchIndexLoader } from './SearchIndexLoader.js';
import { findVerseMatches, collectSectionResults } from './SearchMatcher.js';

export { SearchTools };

export class TextSearch {
  constructor() {
    this._events = {};

    const config = getConfig();
    this.baseContentPath = `${config.baseContentUrl}${config.textsPath}/`;
    this.isLemmaRegExp = /[GgHh]\d{1,6}/g;

    this.isSearching = false;
    this.canceled = false;
    this.searchText = '';
    this.searchTextid = '';
    this.searchDivisions = [];
    this.textInfo = null;
    this.isLemmaSearch = false;
    this.startTime = null;
    this.searchTermsRegExp = [];
    this.searchIndexesData = [];
    this.searchIndexesCurrentIndex = 0;
    this.searchType = 'AND';
    this.searchFinalResults = [];

    this.searchIndexLoader = new SearchIndexLoader();
    this.searchIndexLoader.on('complete', (e) => this.indexesLoaded(e));
  }

  start(textid, divisions, text) {
    if (this.isSearching) {
      return false;
    }
    this.isSearching = true;

    this.searchText = text.trim();
    this.searchTextid = textid;
    this.searchDivisions = divisions;
    this.textInfo = getText(this.searchTextid);

    this.canceled = false;
    this.startTime = new Date();
    this.searchFinalResults = [];
    this.searchTermsRegExp = [];
    this.searchIndexesData = [];
    this.searchIndexesCurrentIndex = 0;
    this.searchType = /\bOR\b/gi.test(text) ? 'OR' : 'AND';

    this.isLemmaRegExp.lastIndex = 0;
    this.isLemmaSearch = this.isLemmaRegExp.test(this.searchText);
    this.searchTermsRegExp = SearchTools.createSearchTerms(text, this.isLemmaSearch);

    const config = getConfig();
    if (config.serverSearchPath !== '' &&
        (window.location.protocol !== 'file:' || config.baseContentUrl !== '')) {
      this.startServerSearch(this.textInfo, this.searchDivisions, this.searchText);
    } else {
      this.searchIndexLoader.loadIndexes(this.textInfo, this.searchDivisions, this.searchText, this.isLemmaSearch);
    }

    return true;
  }

  completeEventData(results) {
    return {
      results,
      searchIndexesData: this.searchIndexesData,
      searchTermsRegExp: this.searchTermsRegExp,
      isLemmaSearch: this.isLemmaSearch
    };
  }

  applyServerStemWords(stemWords) {
    this.searchType = 'OR';
    this.searchTermsRegExp = stemWords.map(word => new RegExp(`\\b(${word})\\b`, 'gi'));
  }

  collectServerResults(results) {
    const showApocrypha = getShowApocrypha();
    for (const result of results) {
      const fragmentid = Object.keys(result)[0];
      if (!showApocrypha && isApocryphalSection(fragmentid.split('_')[0])) continue;
      const html = result[fragmentid];
      this.searchFinalResults.push({ fragmentid, html });
    }
  }

  startServerSearch(textInfo, searchDivisions, searchText) {
    const config = getConfig();

    const params = new URLSearchParams({
      textid: textInfo.id,
      search: searchText.toLowerCase(),
      divisions: searchDivisions.join(','),
      date: (new Date()).toString()
    });

    const searchUrl = config.serverSearchPath.startsWith('http')
      ? config.serverSearchPath
      : `${config.baseContentUrl}${config.serverSearchPath}`;

    fetch(`${searchUrl}?${params.toString()}`)
      .then(response => response.json())
      .then(data => {
        let results = null;

        if (data?.results) {
          if (data.stem_words?.length > 0) {
            this.applyServerStemWords(data.stem_words);
          }
          this.collectServerResults(data.results);
          results = this.searchFinalResults;
        }

        this.trigger('complete', {
          type: 'complete',
          target: this,
          data: this.completeEventData(results)
        });

        this.isSearching = false;
      })
      .catch(error => {
        console.error('error:serverSearch', error);
        this.isSearching = false;

        this.trigger('complete', {
          type: 'complete',
          target: this,
          data: this.completeEventData(null)
        });
      });
  }

  buildBruteForceIndex() {
    const divisions = this.searchDivisions ?? [];
    const sections = divisions.length > 0
      ? this.textInfo.sections.filter(sectionid => divisions.includes(sectionid.substring(0, 2)))
      : this.textInfo.sections;

    return sections.map(sectionid => {
      const bookCode = sectionid.substr(0, 2);
      const chapterNum = parseInt(sectionid.substr(2), 10);
      const verseCount = BOOK_DATA[bookCode]?.chapters?.[chapterNum - 1] ?? 0;
      const fragmentids = Array.from({ length: verseCount }, (_, i) => `${sectionid}_${i + 1}`);
      return { sectionid, fragmentids };
    });
  }

  buildStemRegexps(stemInfo) {
    return stemInfo.flatMap(info => info.words.map(word => new RegExp(`\\b(${word})\\b`, 'gi')));
  }

  indexesLoaded(e) {
    if (!e.data?.loadedIndexes) return;

    if (e.data.loadedIndexes.length === 0) {
      this.searchIndexesData = this.buildBruteForceIndex();
      this.searchIndexesCurrentIndex = -1;
      this.loadNextSectionid();
      return;
    }

    this.trigger('indexcomplete', {
      type: 'indexcomplete',
      target: this,
      data: { searchIndexesData: e.data.loadedResults }
    });

    if (e.data.stemInfo?.length > 0) {
      this.searchType = 'OR';
      this.searchTermsRegExp = this.buildStemRegexps(e.data.stemInfo);
    }

    this.searchIndexesData = e.data.loadedResults;
    this.searchIndexesCurrentIndex = -1;
    this.loadNextSectionid();
  }

  matchOptions() {
    return {
      searchTermsRegExp: this.searchTermsRegExp,
      isLemmaSearch: this.isLemmaSearch,
      searchType: this.searchType
    };
  }

  loadNextSectionid() {
    this.searchIndexesCurrentIndex++;

    if (this.searchIndexesCurrentIndex > this.searchIndexesData.length) {
      this.isSearching = false;
    } else if (this.searchIndexesCurrentIndex === this.searchIndexesData.length) {
      this.trigger('complete', {
        type: 'complete',
        target: this,
        data: this.completeEventData(this.searchFinalResults)
      });

      this.isSearching = false;
    } else {
      const sectionData = this.searchIndexesData[this.searchIndexesCurrentIndex];

      if (!sectionData) {
        this.loadNextSectionid();
        return;
      }

      this.trigger('load', {
        type: 'load',
        target: this,
        data: {
          sectionid: sectionData.sectionid ?? null,
          index: this.searchIndexesCurrentIndex,
          total: this.searchIndexesData.length
        }
      });

      loadSection(this.textInfo, sectionData.sectionid ?? null, (content) => {
        const results = collectSectionResults(content, sectionData.fragmentids ?? null, this.matchOptions());
        this.searchFinalResults.push(...results);
        this.loadNextSectionid();
      }, () => {
        this.loadNextSectionid();
      });
    }
  }

  findMatchesInVerse(html) {
    return findVerseMatches(html, this.matchOptions());
  }
}

Object.assign(TextSearch.prototype, EventEmitterMixin);

import { getConfig } from '../core/config.js';
import { EventEmitterMixin } from '../common/EventEmitter.js';
import { getShowApocrypha, isApocryphalSection } from '../bible/Apocrypha.js';
import { SearchTools } from './SearchTools.js';

export class SearchIndexLoader {
  constructor() {
    this._events = {};

    const config = getConfig();
    this.baseContentPath = `${config.baseContentUrl}${config.textsPath}/`;
    this.isStemEnabled = true;

    this.textInfo = null;
    this.searchTerms = [];
    this.searchTermsIndex = -1;
    this.isLemmaSearch = false;
    this.stemmingData = {};
    this.stemInfo = [];
    this.searchDivisions = [];
    this.loadedIndexes = [];
    this.loadedResults = [];
    this.searchType = 'AND';
  }

  loadIndexes(newTextInfo, divisions, searchText, isLemma) {
    this.isLemmaSearch = isLemma;
    this.textInfo = newTextInfo;
    this.searchDivisions = divisions;

    this.searchTerms = SearchTools.splitWords(searchText);

    this.searchTermsIndex = -1;
    this.loadedIndexes = [];
    this.loadedResults = [];
    this.stemInfo = [];
    this.stemmingData = isLemma ? null : {};

    this.searchType = /\bOR\b/gi.test(searchText) ? 'OR' : 'AND';

    if (this.isStemEnabled && !isLemma) {
      this.loadStemmingData();
    } else {
      this.loadNextIndex();
    }
  }

  loadStemmingData() {
    const stemUrl = `${this.baseContentPath}${this.textInfo.id}/index/stems.json`;

    fetch(stemUrl)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        this.stemmingData = data;
        this.loadNextIndex();
      })
      .catch(() => {
        this.stemmingData = null;
        this.loadNextIndex();
      });
  }

  loadNextIndex() {
    this.searchTermsIndex++;

    if (this.searchTermsIndex < this.searchTerms.length) {
      this.loadSearchTermIndex(this.searchTerms[this.searchTermsIndex]);
    } else {
      this.processIndexes();
    }
  }

  buildIndexRequest(searchTerm) {
    if (this.isLemmaSearch) {
      const key = searchTerm.toUpperCase();
      const letter = key.substring(0, 1);
      const firstNumber = searchTerm.length >= 5 ? searchTerm.substring(1, 2) : '0';
      return {
        key,
        stem: '',
        useStem: false,
        indexUrl: `${this.baseContentPath}${this.textInfo.id}/indexlemma/_${letter.toUpperCase()}${firstNumber}000.json`
      };
    }

    const key = searchTerm.toLowerCase();
    const stem = this.isStemEnabled && this.stemmingData != null ? this.stemmingData[key] : null;
    const useStem = stem != null;
    const hash = SearchTools.hashWord(useStem ? stem : key);
    const indexUrl = useStem
      ? `${this.baseContentPath}${this.textInfo.id}/index/_stems_${hash}.json`
      : `${this.baseContentPath}${this.textInfo.id}/index/_${hash}.json`;

    return { key, stem, useStem, indexUrl };
  }

  loadSearchTermIndex(searchTerm) {
    const { key, stem, useStem, indexUrl } = this.buildIndexRequest(searchTerm);

    fetch(indexUrl)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        let fragments = null;

        if (useStem) {
          fragments = data[stem]?.fragmentids;
          if (data[stem]?.words) {
            this.stemInfo.push({
              word: key,
              stem,
              words: data[stem].words
            });
          }
        } else {
          fragments = data[key];
        }

        this.loadedIndexes.push(fragments ?? []);
        this.loadNextIndex();
      })
      .catch(() => {
        this.loadedIndexes.push(null);
        this.loadNextIndex();
      });
  }

  mergeOrIndexes() {
    const fragmentids = this.loadedIndexes.flat();
    const sections = this.textInfo.sections;

    const parseFragment = (fid) => {
      const [sectionid, num] = fid.split('_');
      return { sectionid, sectionIndex: sections.indexOf(sectionid), fragmentNum: parseInt(num, 10) };
    };

    return fragmentids.sort((a, b) => {
      const fa = parseFragment(a), fb = parseFragment(b);
      return (fa.sectionIndex - fb.sectionIndex) || (fa.fragmentNum - fb.fragmentNum);
    });
  }

  intersectAndIndexes() {
    const indexes = this.loadedIndexes;
    if (indexes.length === 1) return indexes[0];
    if (indexes.length === 0) return [];
    return indexes[0].filter(val => indexes.slice(1).every(idx => idx.includes(val)));
  }

  groupBySection(fragmentids) {
    const results = [];
    const divisions = this.searchDivisions;
    const showApocrypha = getShowApocrypha();

    for (const fid of fragmentids) {
      if (!fid) continue;
      const sectionid = fid.split('_')[0];
      const bookCode = sectionid.substring(0, 2);

      if (!showApocrypha && isApocryphalSection(sectionid)) continue;
      if (divisions.length > 0 && !divisions.includes(bookCode)) continue;

      const existing = results.find(r => r.sectionid === sectionid);
      if (existing) existing.fragmentids.push(fid);
      else results.push({ sectionid, fragmentids: [fid] });
    }
    return results;
  }

  processIndexes() {
    let fragmentids = [];
    this.loadedResults = [];

    if (this.loadedIndexes.length > 0 && this.loadedIndexes.every(idx => idx == null)) {
      this.loadedIndexes = [];
    } else {
      this.loadedIndexes = this.loadedIndexes.map(idx => idx ?? []);
    }

    if (this.loadedIndexes.length > 0) {
      fragmentids = this.searchType === 'OR' ? this.mergeOrIndexes() : this.intersectAndIndexes();
      this.loadedResults = this.groupBySection(fragmentids);
    }

    this.trigger('complete', {
      type: 'complete',
      target: this,
      data: {
        loadedIndexes: this.loadedIndexes,
        loadedResults: this.loadedResults,
        fragmentids,
        stemInfo: this.stemInfo
      }
    });
  }
}

Object.assign(SearchIndexLoader.prototype, EventEmitterMixin);

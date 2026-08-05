import { BaseWindow, AsyncHelpers, registerWindowComponent } from './BaseWindow.js';
import { offset } from '../lib/helpers.esm.js';
import gearSvg from '../../css/images/gear.svg?raw';

// Curved "enter/return" arrow for the go button inside the search input
const enterArrowSvg = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 3.5v4a2.5 2.5 0 0 1-2.5 2.5H4"/><path d="M6.5 7.5 4 10l2.5 2.5"/></svg>';

import { getApp } from '../core/registry.js';
import { i18n } from '../lib/i18n.js';
import { BOOK_DATA } from '../bible/BibleData.js';
import { Reference } from '../bible/BibleReference.js';
import { getGlobalTextChooser } from '../ui/TextChooser.js';
import { getText, loadTexts, startSearch, displayAbbr } from '../texts/TextLoader.js';
import { checkDivisionHeader, drawDivisions, getSelectedDivisions, setDivisions } from './SearchDivisions.js';
import { createSearchHighlights, highlightLemmaWords, highlightResultsText, removeSearchHighlights } from './SearchHighlights.js';
import { handleResultClick, handleVisualBarClick, handleVisualBarMouseover } from './SearchInteractions.js';
import { determineBookList, formatResultLabel, renderResultsVisual, renderSearchResults, renderUsage } from './SearchResults.js';

const getTextAsync = (textId) => AsyncHelpers.promisify(getText, textId);
const loadTextsAsync = () => AsyncHelpers.promisify(loadTexts);

export function getOpenBibleTextId() {
  const app = getApp();
  const firstBible = app?.windowManager?.getWindows()?.find(w => w.className === 'BibleWindow');
  return firstBible?.getData()?.textid;
}

class SearchWindowComponent extends BaseWindow {
  constructor() {
    super();

    this.state = {
      ...this.state,
      selectedTextInfo: null,
      textInfo: null,
      currentResults: null,
      searchTermsRegExp: null,
      isLemmaSearch: false
    };

    this.textChooser = getGlobalTextChooser();
    this.divisionChooser = null;
    this.divWidth = 480;
  }

  async render() {
    this.innerHTML = `
      <div class="window-header search-header">
        <span class="search-input-wrap">
          <input type="text" class="search-text app-input i18n" data-i18n="[placeholder]windows.search.placeholder" />
          <button type="button" class="search-button search-go-button i18n" data-i18n="[title]windows.search.button"></button>
        </span>
        <div class="text-list app-list" style="">&nbsp;</div>
        <div class="search-options-button header-icon" style=""></div>
      </div>
      <div class="search-main">
        <div class="search-wrapper">
          <div class="search-top">
            <div class="search-progress-bar">
              <div class="search-progress-bar-inner"></div>
              <span class="search-progress-bar-label"></span>
            </div>
            <h2 class="search-results-count"></h2>
            <div class="search-visual"><span class="search-visual-label"></span></div>
            <div class="search-lemma-info"></div>
            <div class="search-usage"></div>
          </div>
          <div class="search-results reading-text"></div>
        </div>
      </div>
      <div class="search-footer window-footer"></div>
    `;

    this.querySelector('.search-options-button').innerHTML = gearSvg;
    this.querySelector('.search-go-button').innerHTML = enterArrowSvg;

    this.divisionChooser = this.createElement(`
      <div class="search-division-chooser" popover>
        <div class="search-division-header">${i18n.t('windows.search.options')}</div>
        <div class="search-division-main"></div>
      </div>
    `);
    this.divisionChooser.style.width = `${this.divWidth}px`;
    document.body.appendChild(this.divisionChooser);
  }

  cacheRefs() {
    super.cacheRefs();

    this.refs.header = this.$('.search-header');
    this.refs.main = this.$('.search-main');
    this.refs.footer = this.$('.search-footer');
    this.refs.input = this.$('.search-text');
    this.refs.button = this.$('.search-button');
    this.refs.textlistui = this.$('.text-list');
    this.refs.searchOptionsButton = this.$('.search-options-button');

    this.refs.topBlock = this.$('.search-top');
    this.refs.resultsCount = this.$('.search-results-count');
    this.refs.topLemmaInfo = this.$('.search-lemma-info');
    this.refs.topVisual = this.$('.search-visual');
    this.refs.topVisualLabel = this.$('.search-visual-label');
    this.refs.topUsage = this.$('.search-usage');
    this.refs.searchProgressBar = this.$('.search-progress-bar');
    this.refs.searchProgressBarInner = this.$('.search-progress-bar-inner');
    this.refs.searchProgressBarLabel = this.$('.search-progress-bar-label');
    this.refs.resultsBlock = this.$('.search-results');

    this.refs.topLemmaInfo.style.display = 'none';
    this.refs.topVisual.style.display = 'none';
    this.refs.searchProgressBar.style.display = 'none';
  }

  attachEventListeners() {
    this.addListener(this.refs.input, 'keypress', (e) => {
      if (e.which === 13) {
        this.doSearch();
      }
    });

    this.addListener(this.refs.button, 'click', () => this.doSearch());

    this.addListener(this.refs.textlistui, 'click', () => this.handleTextListClick());

    this.addListener(this.refs.searchOptionsButton, 'click', () => {
      this.divisionChooser.togglePopover();
    });

    this.addListener(this.divisionChooser, 'beforetoggle', (e) => {
      if (e.newState === 'open') {
        this.positionDivisionChooser();
      }
    });

    this.divisionChooser.addEventListener('click', (e) => {
      const checkbox = e.target.closest('.division-header input');
      if (checkbox) {
        const setChildrenTo = checkbox.checked;
        const divisionList = checkbox.closest('.division-list');
        if (divisionList) {
          divisionList.querySelectorAll('.division-list-items input').forEach((inp) => {
            inp.checked = setChildrenTo;
          });
        }
      }
    });

    this.divisionChooser.addEventListener('click', (e) => {
      const checkbox = e.target.closest('.division-list-items input');
      if (checkbox) {
        this.checkDivisionHeader(checkbox.closest('.division-list'));
      }
    });

    // Results click handler - navigate all Bible windows to clicked reference
    this.addListener(this.refs.resultsBlock, 'click', (e) => {
      const row = e.target.closest('.search-result-row');
      if (row) this.handleResultClick(row);
    });

    this.addListener(this.refs.topVisual, 'mouseover', (e) => {
      const target = e.target.closest('.search-result-book-bar');
      if (target) this.handleVisualBarMouseover(target);
    });

    this.addListener(this.refs.topVisual, 'mouseout', (e) => {
      const target = e.target.closest('.search-result-book-bar');
      if (target) this.refs.topVisualLabel.style.display = 'none';
    });

    this.addListener(this.refs.topVisual, 'click', (e) => {
      const target = e.target.closest('.search-result-book-bar');
      if (target) this.handleVisualBarClick(target);
    });

    this._textChooserHandler = this.bindHandler('textChooserChange', (e) => this.handleTextChooserChange(e));
    this.textChooser.on('change', this._textChooserHandler);

    this.on('message', (e) => this.handleMessage(e));
  }

  async init() {
    i18n.translatePage(this.refs.header);
    await this.loadInitialText();
  }

  cleanup() {
    this.removeHighlights();

    if (this.divisionChooser?.parentNode) {
      this.divisionChooser.parentNode.removeChild(this.divisionChooser);
    }

    if (this._textChooserHandler) {
      this.textChooser.off('change', this._textChooserHandler);
    }

    super.cleanup();

    if (this.textChooser.getTarget() === this.refs.textlistui) {
      this.textChooser.hide();
    }
  }

  handleTextListClick() {
    if (this.textChooser.getTarget() === this.refs.textlistui) {
      this.textChooser.toggle();
    } else {
      this.textChooser.setTarget(this, this.refs.textlistui, 'bible');
      this.textChooser.setTextInfo(this.state.selectedTextInfo);
      this.textChooser.show();
    }
  }

  handleTextChooserChange(e) {
    if (e.data.target !== this.refs.textlistui) return;
    this.setTextInfo(e.data.textInfo, false);
    if (this.refs.input.value.trim()) {
      this.doSearch();
    } else {
      this.clearResults();
    }
  }

  handleResultClick(tr) {
    handleResultClick(this, tr);
  }

  handleVisualBarMouseover(bookBar) {
    handleVisualBarMouseover(this, bookBar);
  }

  handleVisualBarClick(bookBar) {
    handleVisualBarClick(this, bookBar);
  }

  handleMessage(e) {
    if (e.data.messagetype === 'textload') {
      this.createHighlights();
    }
  }

  positionDivisionChooser() {
    const uiPos = offset(this.refs.searchOptionsButton);
    const top = uiPos.top + this.refs.searchOptionsButton.offsetHeight + 12;
    const winWidth = window.innerWidth;
    let left = uiPos.left;

    if (left + this.divWidth > winWidth) {
      left = winWidth - this.divWidth - 50;
    }

    this.divisionChooser.style.top = `${top}px`;
    this.divisionChooser.style.left = `${left}px`;
  }

  drawDivisions() {
    drawDivisions(this);
  }

  setDivisions(divisions) {
    setDivisions(this, divisions);
  }

  checkDivisionHeader(divisionList) {
    checkDivisionHeader(divisionList);
  }

  getSelectedDivisions() {
    return getSelectedDivisions(this);
  }

  doSearch() {
    this.state.textInfo = this.state.selectedTextInfo ?? this.textChooser.getTextInfo();
    if (!this.state.textInfo) return;

    const text = this.refs.input.value.trim();
    const textid = this.state.textInfo.id;
    const allDivisions = this.divisionChooser.querySelectorAll('.division-list-items input');

    let divisions = this.getSelectedDivisions();

    this.updateTabLabel(text);

    if (allDivisions.length === divisions.length) {
      divisions = [];
    }

    this.clearResults();

    const topBlockTitle = this.refs.topBlock.querySelector('h2');
    if (topBlockTitle) {
      topBlockTitle.innerHTML = `[${this.escapeHtml(text)}] in [${this.escapeHtml(this.state.textInfo.name)}]`;
    }

    this.removeHighlights();

    this.refs.resultsBlock.classList.add('loading-indicator');

    // Tag each search so only the latest one touches the UI (searches can't be cancelled).
    const searchId = this._searchId = (this._searchId || 0) + 1;

    startSearch({
      textid,
      divisions,
      text,
      onSearchLoad: (e) => { if (searchId === this._searchId) this.searchLoadHandler(e); },
      onSearchIndexComplete: (e) => { if (searchId === this._searchId) this.searchIndexCompleteHandler(e); },
      onSearchComplete: (e) => { if (searchId === this._searchId) this.searchCompleteHandler(e); }
    });
  }

  searchLoadHandler(e) {
    this.refs.searchProgressBar.style.display = 'block';

    const reference = Reference(e.data.sectionid);
    const progress = `${e.data.index + 1} / ${e.data.total}`;
    let label = e.data.sectionid;

    if (reference && this.state.textInfo && BOOK_DATA['GN'].names[this.state.textInfo.lang]) {
      reference.language = this.state.textInfo.lang;
      label = reference.toString();
    }

    this.refs.footer.innerHTML = i18n.t('windows.search.loadingprogress', { progress, label });
    this.refs.searchProgressBarInner.style.width = `${(e.data.index + 1) / e.data.total * 100}%`;
    this.refs.searchProgressBarLabel.innerHTML = label;

    const progressWidth = this.refs.searchProgressBarInner.offsetWidth;
    const labelWidth = this.refs.searchProgressBarLabel.offsetWidth;

    if (labelWidth > progressWidth) {
      this.refs.searchProgressBarLabel.style.left = `${progressWidth}px`;
      this.refs.searchProgressBarLabel.style.margin = '';
      this.refs.searchProgressBarLabel.classList.add('search-progress-bar-label-outside');
    } else {
      this.refs.searchProgressBarLabel.style.left = `${progressWidth - labelWidth}px`;
      this.refs.searchProgressBarLabel.style.margin = '';
      this.refs.searchProgressBarLabel.classList.remove('search-progress-bar-label-outside');
    }
  }

  searchIndexCompleteHandler(e) {
    this.refs.footer.innerHTML = i18n.t('windows.search.results') + e.data.searchIndexesData.length;
  }

  determineBookList(isLemmaSearch) {
    return determineBookList(this, isLemmaSearch);
  }

  formatResultLabel(fragmentid, short) {
    return formatResultLabel(this, fragmentid, short);
  }

  renderSearchResultsContent(results) {
    renderSearchResults(this, results);
  }

  /**
   * Highlight original-language words for a lemma search by adding the
   * `highlight` class to the <l> word elements whose s attribute contains a
   * searched Strong's number. This mirrors how a normal word search visibly
   * highlights the matched word.
   */
  highlightLemmaWords(root) {
    highlightLemmaWords(this, root);
  }

  highlightResultsText() {
    highlightResultsText(this);
  }

  searchCompleteHandler(e) {
    this.state.currentResults = e.data.results;
    this.state.searchTermsRegExp = e.data.searchTermsRegExp;
    this.state.isLemmaSearch = e.data.isLemmaSearch;

    this.refs.searchProgressBarInner.style.width = '100%';
    this.setFinalResultsCount(e.data.results?.length ?? 0);
    this.refs.resultsBlock.classList.remove('loading-indicator');

    if (e.data.results?.length > 0) {
      this.renderSearchResultsContent(e.data.results);
    } else if (e.data.results == null) {
      this.refs.resultsBlock.innerHTML = i18n.t('windows.search.searchfailed');
    } else {
      this.refs.resultsBlock.innerHTML = i18n.t('windows.search.noresults');
    }

    this.trigger('settingschange', { type: 'settingschange', target: this, data: null });
  }

  setFinalResultsCount(count) {
    this.refs.resultsCount.innerHTML = `${i18n.t('windows.search.results')}: ${count}`;
    this.refs.footer.innerHTML = '';
    this.refs.searchProgressBar.style.display = 'none';
  }

  clearResults() {
    this.refs.footer.innerHTML = '';
    this.refs.resultsCount.innerHTML = '';
    this.refs.resultsBlock.innerHTML = '';
    this.refs.topVisual.innerHTML = '';
    this.refs.topVisual.appendChild(this.refs.topVisualLabel);
    this.refs.topVisualLabel.style.display = 'none';
    this.refs.topVisual.style.display = 'none';
    this.refs.topLemmaInfo.innerHTML = '';
    this.refs.topLemmaInfo.style.display = 'none';
    this.refs.topUsage.innerHTML = '';
    this.refs.topUsage.style.display = 'none';
    this.refs.searchProgressBar.style.display = 'none';
    this.refs.searchProgressBarLabel.innerHTML = '';
    this.refs.searchProgressBarInner.style.width = '0';
  }

  renderLemmaInfo() {
    const text = this.refs.input.value;
    const strongs = text.split(' ')[0];
    const strongsNumber = strongs.substr(1);
    const strongLang = strongs.substr(0, 1);
    const langCode = (strongLang === 'H' ? 'he' : 'el');
    const dir = langCode === 'he' ? 'rtl' : 'ltr';

    fetch(`${this.config.baseContentUrl}content/lexicons/strongs/entries/${strongs}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        const html = `<div class="lemma-word">
          <span lang="${langCode}" dir="${dir}">${this.escapeHtml(data.lemma)}</span>
          <span class="lemma-strongs" dir="ltr"> [strongs:${strongsNumber}]</span>
        </div>`;

        this.refs.topLemmaInfo.innerHTML = html;
        this.refs.topLemmaInfo.style.display = 'block';
      })
      .catch(() => {});
  }

  renderUsage() {
    renderUsage(this);
  }

  renderResultsVisual(divisionCount, bookList) {
    renderResultsVisual(this, divisionCount, bookList);
  }

  removeHighlights() {
    removeSearchHighlights();
  }

  createHighlights() {
    createSearchHighlights(this);
  }

  setTextInfo(newTextInfo, sendToChooser) {
    this.state.selectedTextInfo = newTextInfo;
    this.refs.textlistui.innerHTML = displayAbbr(newTextInfo);
    this.drawDivisions();

    if (sendToChooser) {
      this.textChooser.setTextInfo(newTextInfo);
    }
  }

  async loadFirstAvailableText() {
    try {
      const texts = await loadTextsAsync();
      if (texts?.length > 0) {
        this.setTextInfo(texts[0], true);
      }
      this.refs.input.focus();
    } catch (err) {
      console.error('Error loading texts:', err);
    }
  }

  async loadInitialText() {
    const initData = this.initData || {};

    if (!initData.textid) initData.textid = getOpenBibleTextId();

    if (!initData.textid) {
      await this.loadFirstAvailableText();
      return;
    }

    try {
      const data = await getTextAsync(initData.textid);
      this.setTextInfo(data, true);

      if (initData.divisions) {
        this.setDivisions(initData.divisions);
      }

      if (initData.searchtext) {
        this.refs.input.value = initData.searchtext;
        this.doSearch();
      } else {
        this.refs.input.focus();
      }
    } catch (err) {
      console.error('Error loading text:', initData.textid, err);
    }
  }

  size(width, height) {
    this.refs.header.style.width = `${width}px`;
    this.refs.footer.style.width = `${width}px`;
    this.refs.main.style.width = `${width}px`;
    this.refs.main.style.height = `${height - this.refs.header.offsetHeight - this.refs.footer.offsetHeight}px`;
  }

  getData() {
    const otHeader = this.divisionChooser.querySelector('.division-list-ot .division-header input');
    const apHeader = this.divisionChooser.querySelector('.division-list-ap .division-header input');
    const ntHeader = this.divisionChooser.querySelector('.division-list-nt .division-header input');
    const allChecked = (otHeader?.checked !== false) && (apHeader?.checked !== false) && (ntHeader?.checked !== false);

    const divisions = allChecked ? [] : this.getSelectedDivisions();

    return {
      searchtext: this.refs.input.value.trim(),
      textid: this.state.selectedTextInfo?.providerid ?? null,
      divisions,
      params: {
        'win': 'search',
        'textid': this.state.selectedTextInfo?.providerid ?? null,
        'searchtext': this.refs.input.value,
        divisions
      }
    };
  }
}

registerWindowComponent('search-window', SearchWindowComponent, {
  windowType: 'search',
  displayName: 'Search',
  paramKeys: { textid: 't', searchtext: 's', divisions: 'd' }
});

export { SearchWindowComponent as SearchWindow };

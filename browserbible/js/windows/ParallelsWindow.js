import { BaseWindow, AsyncHelpers, registerWindowComponent } from './BaseWindow.js';
import { i18n } from '../lib/i18n.js';
import { getGlobalTextChooser } from '../ui/TextChooser.js';
import { getText, loadTexts } from '../texts/TextLoader.js';
import { renderParallelTable } from './ParallelTable.js';
import { loadParallelCells, processParallelCell } from './ParallelPassages.js';

export { getBookName, parsePassageReference } from './ParallelReferences.js';

const getTextAsync = (textId) => AsyncHelpers.promisify(getText, textId);
const loadTextsAsync = () => AsyncHelpers.promisify(loadTexts);

class ParallelsWindowComponent extends BaseWindow {
  constructor() {
    super();

    this.state = {
      ...this.state,
      currentTextInfo: null,
      textsInitialized: false,
      parallelsData: null,
      currentParallelData: null
    };

    this.textChooser = getGlobalTextChooser();
    // bumped whenever the parallel set or version changes, so in-flight
    // passage loads for the previous table know to stop
    this._loadGeneration = 0;
  }

  async render() {
    this.innerHTML = `
      <div class="parallels-container">
        <div class="window-header parallels-header">
          <div class="scroller-header-inner">
            <div class="parallel-list">
              <select class="header-list app-list"></select>
            </div>
            <div class="header-list app-list text-list"></div>
          </div>
        </div>
        <div class="parallels-main"></div>
      </div>
    `;
  }

  cacheRefs() {
    super.cacheRefs();

    this.refs.container = this.$('.parallels-container');
    this.refs.header = this.$('.parallels-header');
    this.refs.main = this.$('.parallels-main');
    this.refs.textlistui = this.$('.text-list');
    this.refs.parallelsList = this.$('.parallel-list select');
  }

  attachEventListeners() {
    this.addListener(this.refs.parallelsList, 'change', () => this.loadParallelData());

    this.addListener(this.refs.textlistui, 'click', () => this.handleTextListClick());

    this._textChooserHandler = this.bindHandler('textChooserChange', (e) => this.handleTextChooserChange(e));
    this.textChooser.on('change', this._textChooserHandler);

    this.refs.main.addEventListener('click', (e) => {
      const headerRow = e.target.closest('.parallel-entry-header');
      if (headerRow) {
        this.handleHeaderRowClick(headerRow);
      }
    });

    this.refs.main.addEventListener('click', (e) => {
      const target = e.target.closest('.parallel-show-all');
      if (target) this.handleShowAll();
    });

    this.refs.main.addEventListener('click', (e) => {
      const target = e.target.closest('.parallel-hide-all');
      if (target) this.handleHideAll();
    });
  }

  async init() {
    this.refs.textlistui.innerHTML = 'Version';

    // A window added from the menu arrives with empty initData; fall back to
    // defaults so the first open isn't a blank pane.
    const initData = this.initData || {};

    await Promise.all([
      this.loadParallelsIndex(initData.parallelid),
      this.loadInitialText(initData.textid || this.config.newBibleWindowVersion)
    ]);

    this.startup();
  }

  cleanup() {
    if (this._textChooserHandler) {
      this.textChooser.off('change', this._textChooserHandler);
    }

    super.cleanup();
    this.textChooser.hide();
  }

  handleTextListClick() {
    if (this.textChooser.getTarget() === this.refs.textlistui) {
      this.textChooser.toggle();
    } else {
      this.textChooser.setTarget(this.refs.container, this.refs.textlistui, 'bible');
      this.textChooser.setTextInfo(this.state.currentTextInfo);
      this.textChooser.show();
    }
  }

  handleTextChooserChange(e) {
    if (e.data.target !== this.refs.textlistui) return;

    const newTextInfo = e.data.textInfo;
    if (!newTextInfo) return;

    this.refs.textlistui.innerHTML = newTextInfo.abbr;

    if (this.state.currentTextInfo === null || newTextInfo.id !== this.state.currentTextInfo.id) {
      this.state.currentTextInfo = newTextInfo;
      this.refs.main.innerHTML = '';
      this.loadParallelData();
    }
  }

  handleHeaderRowClick(headerRow) {
    const textRow = headerRow.nextElementSibling;

    if (textRow?.classList.contains('parallel-entry-text-collapsed')) {
      textRow.classList.remove('parallel-entry-text-collapsed');
      this.loadCells(textRow.querySelectorAll('td'));
    } else if (textRow) {
      textRow.classList.add('parallel-entry-text-collapsed');
    }
  }

  handleShowAll() {
    this.loadCells(this.refs.main.querySelectorAll('tr.parallel-entry-text-collapsed td'));
  }

  handleHideAll() {
    this.refs.main.querySelectorAll('tr.parallel-entry-text').forEach(tr => {
      tr.classList.add('parallel-entry-text-collapsed');
    });
  }

  async loadParallelsIndex(parallelid) {
    try {
      const response = await fetch(`${this.config.baseContentUrl}content/parallels/parallels.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      this.state.parallelsData = data.parallels;

      for (let i = 0, il = this.state.parallelsData.length; i < il; i++) {
        const option = document.createElement('option');
        option.setAttribute('data-id', this.state.parallelsData[i].id);
        option.value = this.state.parallelsData[i].filename;
        option.textContent = this.state.parallelsData[i].title;
        this.refs.parallelsList.appendChild(option);
      }

      if (parallelid) {
        const targetOption = this.refs.parallelsList.querySelector(`option[data-id="${parallelid}"]`);
        if (targetOption) targetOption.selected = true;
      } else {
        const gospelOption = this.refs.parallelsList.querySelector('option[data-id*="gospel"]');
        if (gospelOption) gospelOption.selected = true;
      }
    } catch (err) {
      console.error('Error loading parallels data', err);
      this.showError(i18n.t('windows.parallel.loadlistfailed'), err);
    }
  }

  async loadInitialText(textid) {
    try {
      const loadedTextInfo = await getTextAsync(textid);
      this.state.currentTextInfo = loadedTextInfo;
      this.state.textsInitialized = true;

      this.textChooser.setTextInfo(this.state.currentTextInfo);
      this.refs.textlistui.innerHTML = this.state.currentTextInfo.abbr;
    } catch (err) {
      console.error('Error loading text', textid, err);

      try {
        const textInfoData = await loadTextsAsync();
        let newTextInfo = null;
        const lang = textid.toString().split('-')[0].split('_')[0];

        for (let i = 0, il = textInfoData.length; i < il; i++) {
          const textInfo = textInfoData[i];
          if (textInfo.type === 'bible' && (textInfo.lang === lang || textInfo.id.substring(0, lang.length) === lang)) {
            newTextInfo = textInfo;
            break;
          }
        }

        if (newTextInfo === null) {
          newTextInfo = textInfoData[0];
        }

        const loadedTextInfo = await getTextAsync(newTextInfo.id);
        this.state.currentTextInfo = loadedTextInfo;
        this.state.textsInitialized = true;

        this.textChooser.setTextInfo(this.state.currentTextInfo);
        this.refs.textlistui.innerHTML = this.state.currentTextInfo.abbr;
      } catch (fallbackErr) {
        console.error('Error loading fallback text', fallbackErr);
        this.showError(i18n.t('windows.parallel.loadtextfailed'), fallbackErr);
      }
    }
  }

  startup() {
    if (this.state.textsInitialized && this.state.parallelsData !== null) {
      this.loadParallelData();
    }
  }

  async loadParallelData() {
    this.refs.main.innerHTML = '';
    this.state.currentParallelData = null;
    const generation = ++this._loadGeneration;

    if (!this.refs.parallelsList.value) return;

    try {
      const response = await fetch(`${this.config.baseContentUrl}content/parallels/${this.refs.parallelsList.value}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (generation !== this._loadGeneration) return;

      this.state.currentParallelData = data;
      this.createParallel();
    } catch (err) {
      if (generation !== this._loadGeneration) return;
      console.error('Error loading parallel data', err);
      this.showError(i18n.t('windows.parallel.loadpassagesfailed'), err);
    }
  }

  createParallel() {
    renderParallelTable(this);
  }

  async loadCells(cells) {
    await loadParallelCells(this, cells);
  }

  async processCell(cell, generation) {
    await processParallelCell(this, cell, generation);
  }

  size(width, height) {
    this.refs.container.style.width = `${width}px`;
    this.refs.container.style.height = `${height}px`;

    const headerHeight = this.refs.header.offsetHeight;
    this.refs.main.style.width = `${width}px`;
    this.refs.main.style.height = `${height - headerHeight}px`;

    this.textChooser.size(width, height);
  }

  getData() {
    const selectedOption = this.refs.parallelsList.querySelector('option:checked');

    return {
      textid: this.state.currentTextInfo?.providerid ?? '',
      parallelid: selectedOption?.getAttribute('data-id') ?? '',
      label: 'Parallel',
      labelLong: 'Parallel',
      params: {
        win: 'parallel',
        textid: this.state.currentTextInfo?.providerid ?? '',
        parallelid: selectedOption?.getAttribute('data-id') ?? ''
      }
    };
  }
}

registerWindowComponent('parallels-window', ParallelsWindowComponent, {
  windowType: 'parallel',
  displayName: 'Parallels',
  paramKeys: { textid: 't', parallelid: 'p' }
});

export { ParallelsWindowComponent as ParallelsWindow };

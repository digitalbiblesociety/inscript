import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  app: null,
  chooser: null,
  getText: vi.fn(),
  loadTexts: vi.fn(),
  startSearch: vi.fn(),
  displayAbbr: vi.fn(info => `abbr:${info?.name}`),
  drawDivisions: vi.fn(),
  setDivisions: vi.fn(),
  checkDivisionHeader: vi.fn(),
  getSelectedDivisions: vi.fn(() => []),
  createSearchHighlights: vi.fn(),
  highlightLemmaWords: vi.fn(),
  highlightResultsText: vi.fn(),
  removeSearchHighlights: vi.fn(),
  handleResultClick: vi.fn(),
  handleVisualBarClick: vi.fn(),
  handleVisualBarMouseover: vi.fn(),
  determineBookList: vi.fn(() => ['GN']),
  formatResultLabel: vi.fn(() => 'formatted'),
  renderResultsVisual: vi.fn(),
  renderSearchResults: vi.fn(),
  renderUsage: vi.fn(),
  offset: vi.fn(() => ({ top: 10, left: 20 })),
  translatePage: vi.fn(),
  translate: vi.fn((key, values = {}) => `${key}:${values.progress ?? ''}:${values.label ?? ''}`)
}));

vi.mock('@core/registry.js', () => ({
  getApp: () => fixtures.app
}));

vi.mock('@ui/TextChooser.js', () => ({
  getGlobalTextChooser: () => fixtures.chooser
}));

vi.mock('@texts/TextLoader.js', () => ({
  getText: fixtures.getText,
  loadTexts: fixtures.loadTexts,
  startSearch: fixtures.startSearch,
  displayAbbr: fixtures.displayAbbr
}));

vi.mock('@windows/SearchDivisions.js', () => ({
  drawDivisions: fixtures.drawDivisions,
  setDivisions: fixtures.setDivisions,
  checkDivisionHeader: fixtures.checkDivisionHeader,
  getSelectedDivisions: fixtures.getSelectedDivisions
}));

vi.mock('@windows/SearchHighlights.js', () => ({
  createSearchHighlights: fixtures.createSearchHighlights,
  highlightLemmaWords: fixtures.highlightLemmaWords,
  highlightResultsText: fixtures.highlightResultsText,
  removeSearchHighlights: fixtures.removeSearchHighlights
}));

vi.mock('@windows/SearchInteractions.js', () => ({
  handleResultClick: fixtures.handleResultClick,
  handleVisualBarClick: fixtures.handleVisualBarClick,
  handleVisualBarMouseover: fixtures.handleVisualBarMouseover
}));

vi.mock('@windows/SearchResults.js', () => ({
  determineBookList: fixtures.determineBookList,
  formatResultLabel: fixtures.formatResultLabel,
  renderResultsVisual: fixtures.renderResultsVisual,
  renderSearchResults: fixtures.renderSearchResults,
  renderUsage: fixtures.renderUsage
}));

vi.mock('@lib/helpers.esm.js', () => ({
  offset: fixtures.offset
}));

vi.mock('@lib/i18n.js', () => ({
  i18n: {
    t: fixtures.translate,
    translatePage: fixtures.translatePage
  }
}));

import { SearchWindow, getOpenBibleTextId } from '@windows/SearchWindow.js';

function makeChooser() {
  return {
    getTarget: vi.fn(() => null),
    getTextInfo: vi.fn(() => null),
    setTarget: vi.fn(),
    setTextInfo: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    toggle: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  };
}

async function makeWindow() {
  const component = document.createElement('search-window');
  await component.render();
  component.cacheRefs();
  return component;
}

function listener(listeners, target, event) {
  return listeners.find(entry => entry.target === target && entry.event === event).handler;
}

function nestedTarget(className) {
  const parent = document.createElement('div');
  parent.className = className;
  const child = document.createElement('span');
  parent.appendChild(child);
  return { parent, child };
}

describe('SearchWindow lifecycle and orchestration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    fixtures.app = null;
    fixtures.chooser = makeChooser();
    vi.clearAllMocks();
    fixtures.getSelectedDivisions.mockReturnValue([]);
    fixtures.offset.mockReturnValue({ top: 10, left: 20 });
    fixtures.translate.mockImplementation((key, values = {}) =>
      `${key}:${values.progress ?? ''}:${values.label ?? ''}`);
    fixtures.displayAbbr.mockImplementation(info => `abbr:${info?.name}`);
    fixtures.getText.mockImplementation((_id, callback) => callback({ id: 'loaded' }));
    fixtures.loadTexts.mockImplementation(callback => callback([]));
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('initializes search-specific state and chooser defaults', () => {
    const component = document.createElement('search-window');
    expect(component.state).toMatchObject({
      selectedTextInfo: null,
      textInfo: null,
      currentResults: null,
      searchTermsRegExp: null,
      isLemmaSearch: false
    });
    expect(component.textChooser).toBe(fixtures.chooser);
    expect(component.divisionChooser).toBeNull();
    expect(component.divWidth).toBe(480);
  });

  it('renders controls, icons, and a body-level division popover', async () => {
    const component = await makeWindow();
    expect(component.querySelector('.search-header')).toBeTruthy();
    expect(component.querySelector('.search-options-button').innerHTML).toBeTruthy();
    expect(component.querySelector('.search-go-button svg')).toBeTruthy();
    expect(component.divisionChooser.parentNode).toBe(document.body);
    expect(component.divisionChooser.style.width).toBe('480px');
    expect(component.divisionChooser.textContent).toContain('windows.search.options');
  });

  it('caches references and starts transient panels hidden', async () => {
    const component = await makeWindow();
    expect(component.refs.header).toBe(component.querySelector('.search-header'));
    expect(component.refs.input).toBe(component.querySelector('.search-text'));
    expect(component.refs.resultsBlock).toBe(component.querySelector('.search-results'));
    expect(component.refs.topLemmaInfo.style.display).toBe('none');
    expect(component.refs.topVisual.style.display).toBe('none');
    expect(component.refs.searchProgressBar.style.display).toBe('none');
  });

  it('wires component, popover, chooser, and message events', async () => {
    const component = await makeWindow();
    const listeners = [];
    component.addListener = vi.fn((target, event, handler, options) => {
      listeners.push({ target, event, handler, options });
    });
    component.on = vi.fn();
    component.doSearch = vi.fn();
    component.handleTextListClick = vi.fn();
    component.handleResultClick = vi.fn();
    component.handleVisualBarMouseover = vi.fn();
    component.handleVisualBarClick = vi.fn();
    component.positionDivisionChooser = vi.fn();
    component.handleTextChooserChange = vi.fn();
    component.handleMessage = vi.fn();
    component.divisionChooser.togglePopover = vi.fn();

    component.attachEventListeners();

    expect(component.addListener).toHaveBeenCalledTimes(9);
    expect(fixtures.chooser.on).toHaveBeenCalledWith('change', expect.any(Function));
    expect(component.on).toHaveBeenCalledWith('message', expect.any(Function));

    listener(listeners, component.refs.input, 'keypress')({ which: 12 });
    listener(listeners, component.refs.input, 'keypress')({ which: 13 });
    listener(listeners, component.refs.button, 'click')();
    expect(component.doSearch).toHaveBeenCalledTimes(2);
    listener(listeners, component.refs.textlistui, 'click')();
    expect(component.handleTextListClick).toHaveBeenCalled();
    listener(listeners, component.refs.searchOptionsButton, 'click')();
    expect(component.divisionChooser.togglePopover).toHaveBeenCalled();

    listener(listeners, component.divisionChooser, 'beforetoggle')({ newState: 'closed' });
    listener(listeners, component.divisionChooser, 'beforetoggle')({ newState: 'open' });
    expect(component.positionDivisionChooser).toHaveBeenCalledOnce();

    const plain = document.createElement('span');
    listener(listeners, component.refs.resultsBlock, 'click')({ target: plain });
    const result = nestedTarget('search-result-row');
    listener(listeners, component.refs.resultsBlock, 'click')({ target: result.child });
    expect(component.handleResultClick).toHaveBeenCalledWith(result.parent);

    listener(listeners, component.refs.topVisual, 'mouseover')({ target: plain });
    const bar = nestedTarget('search-result-book-bar');
    listener(listeners, component.refs.topVisual, 'mouseover')({ target: bar.child });
    expect(component.handleVisualBarMouseover).toHaveBeenCalledWith(bar.parent);
    component.refs.topVisualLabel.style.display = 'block';
    listener(listeners, component.refs.topVisual, 'mouseout')({ target: bar.child });
    expect(component.refs.topVisualLabel.style.display).toBe('none');
    listener(listeners, component.refs.topVisual, 'click')({ target: bar.child });
    expect(component.handleVisualBarClick).toHaveBeenCalledWith(bar.parent);

    component._textChooserHandler({ data: 1 });
    expect(component.handleTextChooserChange).toHaveBeenCalledWith({ data: 1 });
    component.on.mock.calls[0][1]({ data: 2 });
    expect(component.handleMessage).toHaveBeenCalledWith({ data: 2 });
  });

  it('cascades division header changes to children and recomputes headers', async () => {
    const component = await makeWindow();
    component.addListener = vi.fn();
    component.on = vi.fn();
    component.attachEventListeners();
    component.divisionChooser.innerHTML = `
      <div class="division-list">
        <label class="division-header"><input type="checkbox" checked></label>
        <div class="division-list-items"><input type="checkbox"><input type="checkbox"></div>
      </div>`;
    const header = component.divisionChooser.querySelector('.division-header input');
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    component.divisionChooser.querySelectorAll('.division-list-items input')
      .forEach(input => expect(input.checked).toBe(header.checked));

    const item = component.divisionChooser.querySelector('.division-list-items input');
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fixtures.checkDivisionHeader).toHaveBeenCalledWith(component.divisionChooser.querySelector('.division-list'));
  });

  it('initializes translations before loading text', async () => {
    const component = await makeWindow();
    component.loadInitialText = vi.fn().mockResolvedValue();
    await component.init();
    expect(fixtures.translatePage).toHaveBeenCalledWith(component.refs.header);
    expect(component.loadInitialText).toHaveBeenCalled();
  });

  it('cleans highlights, chooser bindings, popover DOM, and an open chooser target', async () => {
    const component = await makeWindow();
    component._textChooserHandler = vi.fn();
    component._boundHandlers.set('test', vi.fn());
    fixtures.chooser.getTarget.mockReturnValue(component.refs.textlistui);
    component.cleanup();

    expect(fixtures.removeSearchHighlights).toHaveBeenCalled();
    expect(component.divisionChooser.parentNode).toBeNull();
    expect(fixtures.chooser.off).toHaveBeenCalledWith('change', component._textChooserHandler);
    expect(fixtures.chooser.hide).toHaveBeenCalled();
    expect(component._boundHandlers.size).toBe(0);
  });

  it('cleanup tolerates absent bindings/popover and leaves another chooser target alone', async () => {
    const component = await makeWindow();
    component.divisionChooser.remove();
    component._textChooserHandler = null;
    fixtures.chooser.getTarget.mockReturnValue(document.body);
    expect(() => component.cleanup()).not.toThrow();
    expect(fixtures.chooser.off).not.toHaveBeenCalled();
    expect(fixtures.chooser.hide).not.toHaveBeenCalled();
  });

  it('toggles an already-targeted chooser or configures and shows a new target', async () => {
    const component = await makeWindow();
    fixtures.chooser.getTarget.mockReturnValue(component.refs.textlistui);
    component.handleTextListClick();
    expect(fixtures.chooser.toggle).toHaveBeenCalled();

    fixtures.chooser.getTarget.mockReturnValue(null);
    component.state.selectedTextInfo = { id: 'eng' };
    component.handleTextListClick();
    expect(fixtures.chooser.setTarget).toHaveBeenCalledWith(component, component.refs.textlistui, 'bible');
    expect(fixtures.chooser.setTextInfo).toHaveBeenCalledWith(component.state.selectedTextInfo);
    expect(fixtures.chooser.show).toHaveBeenCalled();
  });

  it('responds only to chooser changes for its own text list', async () => {
    const component = await makeWindow();
    component.setTextInfo = vi.fn();
    component.doSearch = vi.fn();
    component.clearResults = vi.fn();
    component.handleTextChooserChange({ data: { target: document.body, textInfo: {} } });
    expect(component.setTextInfo).not.toHaveBeenCalled();

    const info = { id: 'eng' };
    component.refs.input.value = 'word';
    component.handleTextChooserChange({ data: { target: component.refs.textlistui, textInfo: info } });
    expect(component.setTextInfo).toHaveBeenCalledWith(info, false);
    expect(component.doSearch).toHaveBeenCalled();

    component.refs.input.value = '   ';
    component.handleTextChooserChange({ data: { target: component.refs.textlistui, textInfo: info } });
    expect(component.clearResults).toHaveBeenCalled();
  });

  it('delegates result, visual, division, usage, and highlight helpers', async () => {
    const component = await makeWindow();
    const node = document.createElement('div');
    component.handleResultClick(node);
    component.handleVisualBarMouseover(node);
    component.handleVisualBarClick(node);
    component.drawDivisions();
    component.setDivisions(['GN']);
    component.checkDivisionHeader(node);
    component.getSelectedDivisions();
    component.determineBookList(true);
    component.formatResultLabel('GN1_1', true);
    component.renderSearchResultsContent([1]);
    component.highlightLemmaWords(node);
    component.highlightResultsText();
    component.renderUsage();
    component.renderResultsVisual(1, ['GN']);
    component.removeHighlights();
    component.createHighlights();

    expect(fixtures.handleResultClick).toHaveBeenCalledWith(component, node);
    expect(fixtures.handleVisualBarMouseover).toHaveBeenCalledWith(component, node);
    expect(fixtures.handleVisualBarClick).toHaveBeenCalledWith(component, node);
    expect(fixtures.drawDivisions).toHaveBeenCalledWith(component);
    expect(fixtures.setDivisions).toHaveBeenCalledWith(component, ['GN']);
    expect(fixtures.checkDivisionHeader).toHaveBeenCalledWith(node);
    expect(fixtures.getSelectedDivisions).toHaveBeenCalledWith(component);
    expect(fixtures.determineBookList).toHaveBeenCalledWith(component, true);
    expect(fixtures.formatResultLabel).toHaveBeenCalledWith(component, 'GN1_1', true);
    expect(fixtures.renderSearchResults).toHaveBeenCalledWith(component, [1]);
    expect(fixtures.highlightLemmaWords).toHaveBeenCalledWith(component, node);
    expect(fixtures.highlightResultsText).toHaveBeenCalledWith(component);
    expect(fixtures.renderUsage).toHaveBeenCalledWith(component);
    expect(fixtures.renderResultsVisual).toHaveBeenCalledWith(component, 1, ['GN']);
    expect(fixtures.removeSearchHighlights).toHaveBeenCalled();
    expect(fixtures.createSearchHighlights).toHaveBeenCalledWith(component);
  });

  it('creates highlights only on text-load messages', async () => {
    const component = await makeWindow();
    component.createHighlights = vi.fn();
    component.handleMessage({ data: { messagetype: 'nav' } });
    component.handleMessage({ data: { messagetype: 'textload' } });
    expect(component.createHighlights).toHaveBeenCalledOnce();
  });

  it('positions the division chooser and shifts it away from the right edge', async () => {
    const component = await makeWindow();
    Object.defineProperty(component.refs.searchOptionsButton, 'offsetHeight', { value: 30 });
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    component.positionDivisionChooser();
    expect(component.divisionChooser.style.top).toBe('52px');
    expect(component.divisionChooser.style.left).toBe('20px');

    fixtures.offset.mockReturnValue({ top: 5, left: 800 });
    component.positionDivisionChooser();
    expect(component.divisionChooser.style.left).toBe('470px');
  });

  it('does not search without text metadata', async () => {
    const component = await makeWindow();
    fixtures.chooser.getTextInfo.mockReturnValue(null);
    component.doSearch();
    expect(fixtures.startSearch).not.toHaveBeenCalled();
  });

  it('starts a scoped search and ignores callbacks from superseded searches', async () => {
    const component = await makeWindow();
    const info = { id: 'eng', name: '<English>' };
    fixtures.chooser.getTextInfo.mockReturnValue(info);
    fixtures.getSelectedDivisions.mockReturnValue(['GN']);
    component.divisionChooser.innerHTML = `
      <div class="division-list-items"><input><input></div>`;
    component.refs.input.value = '  <word>  ';
    component.clearResults = vi.fn();
    component.removeHighlights = vi.fn();
    component.searchLoadHandler = vi.fn();
    component.searchIndexCompleteHandler = vi.fn();
    component.searchCompleteHandler = vi.fn();

    component.doSearch();

    expect(component.state.textInfo).toBe(info);
    expect(component.refs.resultsCount.innerHTML).toContain('&lt;word&gt;');
    expect(component.refs.resultsCount.innerHTML).toContain('&lt;English&gt;');
    expect(component.refs.resultsBlock.classList).toContain('loading-indicator');
    expect(fixtures.startSearch).toHaveBeenCalledWith(expect.objectContaining({
      textid: 'eng', divisions: ['GN'], text: '<word>'
    }));
    const first = fixtures.startSearch.mock.calls[0][0];
    first.onSearchLoad({ data: 1 });
    first.onSearchIndexComplete({ data: 2 });
    first.onSearchComplete({ data: 3 });
    expect(component.searchLoadHandler).toHaveBeenCalledWith({ data: 1 });

    component.doSearch();
    component.searchLoadHandler.mockClear();
    first.onSearchLoad({ stale: true });
    first.onSearchIndexComplete({ stale: true });
    first.onSearchComplete({ stale: true });
    expect(component.searchLoadHandler).not.toHaveBeenCalled();
  });

  it('collapses an all-division selection to an empty filter', async () => {
    const component = await makeWindow();
    component.state.selectedTextInfo = { id: 'eng', name: 'English' };
    component.divisionChooser.innerHTML = '<div class="division-list-items"><input><input></div>';
    fixtures.getSelectedDivisions.mockReturnValue(['GN', 'EX']);
    component.refs.input.value = 'word';
    component.doSearch();
    expect(fixtures.startSearch.mock.calls[0][0].divisions).toEqual([]);
  });

  it('renders localized search progress with inside and outside label positions', async () => {
    const component = await makeWindow();
    component.state.textInfo = { lang: 'eng' };
    Object.defineProperty(component.refs.searchProgressBarInner, 'offsetWidth', { value: 20, configurable: true });
    Object.defineProperty(component.refs.searchProgressBarLabel, 'offsetWidth', { value: 50, configurable: true });
    component.searchLoadHandler({ data: { sectionid: 'GN1', index: 0, total: 4 } });
    expect(component.refs.searchProgressBar.style.display).toBe('block');
    expect(component.refs.searchProgressBarInner.style.width).toBe('25%');
    expect(component.refs.searchProgressBarLabel.textContent).toBe('Genesis 1');
    expect(component.refs.searchProgressBarLabel.style.left).toBe('20px');
    expect(component.refs.searchProgressBarLabel.classList).toContain('search-progress-bar-label-outside');

    Object.defineProperty(component.refs.searchProgressBarInner, 'offsetWidth', { value: 100, configurable: true });
    component.searchLoadHandler({ data: { sectionid: 'unknown', index: 1, total: 4 } });
    expect(component.refs.searchProgressBarLabel.style.left).toBe('50px');
    expect(component.refs.searchProgressBarLabel.classList).not.toContain('search-progress-bar-label-outside');
  });

  it('uses raw section labels when language data is unavailable', async () => {
    const component = await makeWindow();
    component.state.textInfo = null;
    component.searchLoadHandler({ data: { sectionid: 'GN1', index: 0, total: 1 } });
    expect(component.refs.searchProgressBarLabel.textContent).toBe('GN1');
  });

  it('reports completed index count', async () => {
    const component = await makeWindow();
    component.searchIndexCompleteHandler({ data: { searchIndexesData: [1, 2, 3] } });
    expect(component.refs.footer.textContent).toContain('3');
  });

  it.each([
    [[{ fragmentid: 'GN1_1' }], 'render'],
    [null, 'failed'],
    [[], 'empty']
  ])('finalizes search results for %j', async (results, outcome) => {
    const component = await makeWindow();
    component.renderSearchResultsContent = vi.fn();
    component.trigger = vi.fn();
    component.refs.resultsBlock.classList.add('loading-indicator');
    component.searchCompleteHandler({ data: {
      results,
      searchTermsRegExp: [/word/],
      isLemmaSearch: true
    } });

    expect(component.state.currentResults).toBe(results);
    expect(component.state.searchTermsRegExp).toEqual([/word/]);
    expect(component.state.isLemmaSearch).toBe(true);
    expect(component.refs.searchProgressBarInner.style.width).toBe('100%');
    expect(component.refs.resultsBlock.classList).not.toContain('loading-indicator');
    if (outcome === 'render') expect(component.renderSearchResultsContent).toHaveBeenCalledWith(results);
    if (outcome === 'failed') expect(component.refs.resultsBlock.textContent).toContain('searchfailed');
    if (outcome === 'empty') expect(component.refs.resultsBlock.textContent).toContain('noresults');
    expect(component.trigger).toHaveBeenCalledWith('settingschange', expect.any(Object));
  });

  it('sets final count and clears every results surface', async () => {
    const component = await makeWindow();
    component.setFinalResultsCount(4);
    expect(component.refs.resultsCount.textContent).toContain('4');
    expect(component.refs.footer.innerHTML).toBe('');
    expect(component.refs.searchProgressBar.style.display).toBe('none');

    component.refs.topVisualLabel.style.display = 'block';
    component.refs.topVisual.innerHTML = '<b>old</b>';
    component.clearResults();
    expect(component.refs.resultsCount.innerHTML).toBe('');
    expect(component.refs.resultsBlock.innerHTML).toBe('');
    expect(component.refs.topVisual.firstChild).toBe(component.refs.topVisualLabel);
    expect(component.refs.topVisual.style.display).toBe('none');
    expect(component.refs.topLemmaInfo.style.display).toBe('none');
    expect(component.refs.topUsage.style.display).toBe('none');
    expect(component.refs.searchProgressBarLabel.innerHTML).toBe('');
    expect(component.refs.searchProgressBarInner.style.width).toBe('0px');
  });

  it.each([
    ['H123 word', 'he', 'rtl'],
    ['G456', 'el', 'ltr']
  ])('renders fetched lemma metadata for %s', async (query, lang, dir) => {
    const component = await makeWindow();
    component.config.baseContentUrl = 'https://content/';
    component.refs.input.value = query;
    fetch.mockResolvedValue({ ok: true, json: async () => ({ lemma: '<lemma>' }) });
    component.renderLemmaInfo();
    await vi.waitFor(() => expect(component.refs.topLemmaInfo.style.display).toBe('block'));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(query.split(' ')[0]));
    expect(component.refs.topLemmaInfo.innerHTML).toContain(`lang="${lang}"`);
    expect(component.refs.topLemmaInfo.innerHTML).toContain(`dir="${dir}"`);
    expect(component.refs.topLemmaInfo.innerHTML).toContain('&lt;lemma&gt;');
  });

  it('silently ignores lemma HTTP and network failures', async () => {
    const component = await makeWindow();
    component.refs.input.value = 'H1';
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    component.renderLemmaInfo();
    await Promise.resolve();
    await Promise.resolve();
    expect(component.refs.topLemmaInfo.style.display).toBe('none');
    fetch.mockRejectedValueOnce(new Error('offline'));
    expect(() => component.renderLemmaInfo()).not.toThrow();
  });

  it('sets selected text metadata and optionally syncs the chooser', async () => {
    const component = await makeWindow();
    component.drawDivisions = vi.fn();
    const info = { id: 'eng', name: 'English' };
    component.setTextInfo(info, false);
    expect(component.refs.textlistui.innerHTML).toBe('abbr:English');
    expect(component.drawDivisions).toHaveBeenCalled();
    expect(fixtures.chooser.setTextInfo).not.toHaveBeenCalled();

    component.setTextInfo(info, true);
    expect(fixtures.chooser.setTextInfo).toHaveBeenCalledWith(info);
  });

  it('loads the first available text and focuses even for an empty catalog', async () => {
    const component = await makeWindow();
    component.setTextInfo = vi.fn();
    const focus = vi.spyOn(component.refs.input, 'focus');
    fixtures.loadTexts.mockImplementation(callback => callback([{ id: 'first' }]));
    await component.loadFirstAvailableText();
    expect(component.setTextInfo).toHaveBeenCalledWith({ id: 'first' }, true);
    expect(focus).toHaveBeenCalled();

    component.setTextInfo.mockClear();
    fixtures.loadTexts.mockImplementation(callback => callback([]));
    await component.loadFirstAvailableText();
    expect(component.setTextInfo).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('logs first-text load errors', async () => {
    const component = await makeWindow();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixtures.loadTexts.mockImplementation(() => { throw new Error('catalog'); });
    await component.loadFirstAvailableText();
    expect(error).toHaveBeenCalledWith('Error loading texts:', expect.any(Error));
  });

  it('loads configured text, divisions, and search text', async () => {
    const component = await makeWindow();
    component.initData = { textid: 'eng', divisions: ['GN'], searchtext: 'word' };
    component.setTextInfo = vi.fn();
    component.setDivisions = vi.fn();
    component.doSearch = vi.fn();
    fixtures.getText.mockImplementation((_id, callback) => callback({ id: 'eng' }));
    await component.loadInitialText();
    expect(component.setTextInfo).toHaveBeenCalledWith({ id: 'eng' }, true);
    expect(component.setDivisions).toHaveBeenCalledWith(['GN']);
    expect(component.refs.input.value).toBe('word');
    expect(component.doSearch).toHaveBeenCalled();
  });

  it('focuses configured text without search text and logs load errors', async () => {
    const component = await makeWindow();
    component.initData = { textid: 'eng' };
    component.setTextInfo = vi.fn();
    const focus = vi.spyOn(component.refs.input, 'focus');
    await component.loadInitialText();
    expect(focus).toHaveBeenCalled();

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixtures.getText.mockImplementation(() => { throw new Error('missing'); });
    await component.loadInitialText();
    expect(error).toHaveBeenCalledWith('Error loading text:', 'eng', expect.any(Error));
  });

  it('uses the open Bible text or falls back to the catalog', async () => {
    fixtures.app = {
      windowManager: {
        getWindows: () => [{ className: 'BibleWindow', getData: () => ({ textid: 'open' }) }]
      }
    };
    const component = await makeWindow();
    component.initData = {};
    component.setTextInfo = vi.fn();
    fixtures.getText.mockImplementation((_id, callback) => callback({ id: 'open' }));
    await component.loadInitialText();
    expect(fixtures.getText).toHaveBeenCalledWith('open', expect.any(Function));

    fixtures.app = null;
    const fallback = await makeWindow();
    fallback.initData = {};
    fallback.loadFirstAvailableText = vi.fn();
    await fallback.loadInitialText();
    expect(fallback.loadFirstAvailableText).toHaveBeenCalled();
  });

  it('reads an open Bible id defensively', () => {
    expect(getOpenBibleTextId()).toBeUndefined();
    fixtures.app = { windowManager: { getWindows: () => [{ className: 'BibleWindow', getData: () => null }] } };
    expect(getOpenBibleTextId()).toBeUndefined();
  });

  it('sizes each pane around header and footer heights', async () => {
    const component = await makeWindow();
    Object.defineProperty(component.refs.header, 'offsetHeight', { value: 30 });
    Object.defineProperty(component.refs.footer, 'offsetHeight', { value: 20 });
    component.size(640, 480);
    expect(component.refs.header.style.width).toBe('640px');
    expect(component.refs.footer.style.width).toBe('640px');
    expect(component.refs.main.style.width).toBe('640px');
    expect(component.refs.main.style.height).toBe('430px');
  });

  it('serializes all-selected and filtered division state', async () => {
    const component = await makeWindow();
    component.divisionChooser.innerHTML = `
      <div class="division-list-ot"><label class="division-header"><input checked></label></div>
      <div class="division-list-ap"><label class="division-header"><input checked></label></div>
      <div class="division-list-nt"><label class="division-header"><input checked></label></div>`;
    component.refs.input.value = ' word ';
    component.state.selectedTextInfo = { providerid: 'eng-provider' };
    fixtures.getSelectedDivisions.mockReturnValue(['GN']);
    expect(component.getData()).toEqual({
      searchtext: 'word',
      textid: 'eng-provider',
      divisions: [],
      params: {
        win: 'search', textid: 'eng-provider', searchtext: ' word ', divisions: []
      }
    });

    component.divisionChooser.querySelector('.division-list-ap input').checked = false;
    expect(component.getData().divisions).toEqual(['GN']);
  });

  it('serializes safely when headers and selected text are absent', async () => {
    const component = await makeWindow();
    component.divisionChooser.innerHTML = '';
    fixtures.getSelectedDivisions.mockReturnValue(['GN']);
    const data = component.getData();
    expect(data.textid).toBeNull();
    expect(data.divisions).toEqual([]);
    expect(data.params.textid).toBeNull();
  });
});

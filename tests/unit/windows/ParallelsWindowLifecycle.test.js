import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  chooser: null,
  getText: vi.fn(),
  loadTexts: vi.fn(),
  renderParallelTable: vi.fn(),
  loadParallelCells: vi.fn(() => Promise.resolve()),
  processParallelCell: vi.fn(() => Promise.resolve()),
  translate: vi.fn(key => key)
}));

vi.mock('@ui/TextChooser.js', () => ({ getGlobalTextChooser: () => fixtures.chooser }));

vi.mock('@texts/TextLoader.js', () => ({
  getText: fixtures.getText,
  loadTexts: fixtures.loadTexts
}));

vi.mock('@windows/ParallelTable.js', () => ({ renderParallelTable: fixtures.renderParallelTable }));

vi.mock('@windows/ParallelPassages.js', () => ({
  loadParallelCells: fixtures.loadParallelCells,
  processParallelCell: fixtures.processParallelCell
}));

vi.mock('@lib/i18n.js', () => ({ i18n: { t: fixtures.translate } }));

import { ParallelsWindow } from '@windows/ParallelsWindow.js';

function makeChooser() {
  return {
    on: vi.fn(), off: vi.fn(), getTarget: vi.fn(() => null),
    toggle: vi.fn(), setTarget: vi.fn(), setTextInfo: vi.fn(),
    show: vi.fn(), hide: vi.fn(), size: vi.fn()
  };
}

async function makeWindow() {
  const component = document.createElement('parallels-window');
  await component.render();
  component.cacheRefs();
  return component;
}

function response({ ok = true, status = 200, json = {} } = {}) {
  return { ok, status, json: vi.fn().mockResolvedValue(json) };
}

function listener(listeners, target, event) {
  return listeners.find(entry => entry.target === target && entry.event === event)?.handler;
}

describe('ParallelsWindow lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    fixtures.chooser = makeChooser();
    fixtures.getText.mockImplementation((id, callback) => callback({ id, abbr: id, providerid: `local:${id}` }));
    fixtures.loadTexts.mockImplementation(callback => callback([]));
    fixtures.loadParallelCells.mockResolvedValue();
    fixtures.processParallelCell.mockResolvedValue();
    fixtures.translate.mockImplementation(key => key);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('initializes state, chooser, and generation defaults', () => {
    const component = document.createElement('parallels-window');
    expect(component.state).toMatchObject({
      currentTextInfo: null,
      textsInitialized: false,
      parallelsData: null,
      currentParallelData: null
    });
    expect(component.textChooser).toBe(fixtures.chooser);
    expect(component._loadGeneration).toBe(0);
  });

  it('renders and caches the parallel selector, version anchor, and content pane', async () => {
    const component = await makeWindow();
    expect(component.refs.container).toBe(component.querySelector('.parallels-container'));
    expect(component.refs.header).toBe(component.querySelector('.parallels-header'));
    expect(component.refs.main).toBe(component.querySelector('.parallels-main'));
    expect(component.refs.textlistui).toBe(component.querySelector('.text-list'));
    expect(component.refs.parallelsList).toBe(component.querySelector('.parallel-list select'));
  });

  it('wires selector, chooser, and delegated table actions', async () => {
    const component = await makeWindow();
    const listeners = [];
    component.addListener = vi.fn((target, event, handler) => listeners.push({ target, event, handler }));
    component.bindHandler = vi.fn((_name, handler) => handler);
    component.loadParallelData = vi.fn();
    component.handleTextListClick = vi.fn();
    component.handleTextChooserChange = vi.fn();
    component.handleHeaderRowClick = vi.fn();
    component.handleShowAll = vi.fn();
    component.handleHideAll = vi.fn();
    component.attachEventListeners();

    listener(listeners, component.refs.parallelsList, 'change')();
    listener(listeners, component.refs.textlistui, 'click')();
    expect(component.loadParallelData).toHaveBeenCalled();
    expect(component.handleTextListClick).toHaveBeenCalled();
    expect(fixtures.chooser.on).toHaveBeenCalledWith('change', component._textChooserHandler);
    component._textChooserHandler({ data: 1 });
    expect(component.handleTextChooserChange).toHaveBeenCalledWith({ data: 1 });

    component.refs.main.innerHTML = `
      <div class="parallel-entry-header"><span class="header-child"></span></div>
      <button class="parallel-show-all"><span class="show-child"></span></button>
      <button class="parallel-hide-all"><span class="hide-child"></span></button>`;
    component.refs.main.querySelector('.header-child').click();
    component.refs.main.querySelector('.show-child').click();
    component.refs.main.querySelector('.hide-child').click();
    component.refs.main.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(component.handleHeaderRowClick).toHaveBeenCalledOnce();
    expect(component.handleShowAll).toHaveBeenCalledOnce();
    expect(component.handleHideAll).toHaveBeenCalledOnce();
  });

  it('initializes indexes and the default text before startup', async () => {
    const component = await makeWindow();
    component.initData = null;
    component.config.newBibleWindowVersion = 'DEFAULT';
    component.loadParallelsIndex = vi.fn().mockResolvedValue();
    component.loadInitialText = vi.fn().mockResolvedValue();
    component.startup = vi.fn();
    await component.init();
    expect(component.refs.textlistui.innerHTML).toBe('Version');
    expect(component.loadParallelsIndex).toHaveBeenCalledWith(undefined);
    expect(component.loadInitialText).toHaveBeenCalledWith('DEFAULT');
    expect(component.startup).toHaveBeenCalled();

    component.initData = { parallelid: 'gospels', textid: 'ENG' };
    await component.init();
    expect(component.loadParallelsIndex).toHaveBeenLastCalledWith('gospels');
    expect(component.loadInitialText).toHaveBeenLastCalledWith('ENG');
  });

  it('cleans chooser bindings and always hides the shared chooser', async () => {
    const component = await makeWindow();
    component._textChooserHandler = vi.fn();
    component._boundHandlers.set('one', vi.fn());
    component.cleanup();
    expect(fixtures.chooser.off).toHaveBeenCalledWith('change', component._textChooserHandler);
    expect(fixtures.chooser.hide).toHaveBeenCalled();
    expect(component._boundHandlers.size).toBe(0);

    const idle = await makeWindow();
    fixtures.chooser.off.mockClear();
    idle.cleanup();
    expect(fixtures.chooser.off).not.toHaveBeenCalled();
    expect(fixtures.chooser.hide).toHaveBeenCalled();
  });

  it('toggles an active chooser or configures and shows it for this window', async () => {
    const component = await makeWindow();
    component.state.currentTextInfo = { id: 'ENG' };
    fixtures.chooser.getTarget.mockReturnValue(component.refs.textlistui);
    component.handleTextListClick();
    expect(fixtures.chooser.toggle).toHaveBeenCalled();

    fixtures.chooser.getTarget.mockReturnValue(null);
    component.handleTextListClick();
    expect(fixtures.chooser.setTarget).toHaveBeenCalledWith(
      component.refs.container, component.refs.textlistui, 'bible'
    );
    expect(fixtures.chooser.setTextInfo).toHaveBeenCalledWith(component.state.currentTextInfo);
    expect(fixtures.chooser.show).toHaveBeenCalled();
  });

  it('accepts valid chooser changes only and reloads only a different version', async () => {
    const component = await makeWindow();
    component.loadParallelData = vi.fn();
    component.handleTextChooserChange({ data: { target: document.body, textInfo: { id: 'ENG' } } });
    component.handleTextChooserChange({ data: { target: component.refs.textlistui, textInfo: null } });
    expect(component.loadParallelData).not.toHaveBeenCalled();

    const eng = { id: 'ENG', abbr: 'WEB' };
    component.handleTextChooserChange({ data: { target: component.refs.textlistui, textInfo: eng } });
    expect(component.state.currentTextInfo).toBe(eng);
    expect(component.refs.textlistui.innerHTML).toBe('WEB');
    expect(component.loadParallelData).toHaveBeenCalled();

    component.refs.main.innerHTML = '<span>keep</span>';
    component.loadParallelData.mockClear();
    component.handleTextChooserChange({ data: {
      target: component.refs.textlistui, textInfo: { id: 'ENG', abbr: 'same' }
    } });
    expect(component.refs.textlistui.innerHTML).toBe('same');
    expect(component.refs.main.textContent).toBe('keep');
    expect(component.loadParallelData).not.toHaveBeenCalled();
  });

  it('expands collapsed rows, loads their cells, and collapses open rows', async () => {
    const component = await makeWindow();
    component.loadCells = vi.fn();
    component.refs.main.innerHTML = `
      <div class="parallel-entry-header"></div>
      <table><tbody><tr class="parallel-entry-text parallel-entry-text-collapsed"><td></td><td></td></tr></tbody></table>`;
    const header = component.refs.main.querySelector('.parallel-entry-header');
    const row = component.refs.main.querySelector('tr');
    header.after(row);
    component.handleHeaderRowClick(header);
    expect(row.classList).not.toContain('parallel-entry-text-collapsed');
    expect(component.loadCells).toHaveBeenCalledWith(row.querySelectorAll('td'));
    component.handleHeaderRowClick(header);
    expect(row.classList).toContain('parallel-entry-text-collapsed');
    row.remove();
    expect(() => component.handleHeaderRowClick(header)).not.toThrow();
  });

  it('shows every collapsed row and hides every text row', async () => {
    const component = await makeWindow();
    component.refs.main.innerHTML = `
      <table><tbody>
        <tr class="parallel-entry-text parallel-entry-text-collapsed"><td id="one"></td></tr>
        <tr class="parallel-entry-text"><td id="two"></td></tr>
      </tbody></table>`;
    component.loadCells = vi.fn();
    component.handleShowAll();
    expect(component.loadCells).toHaveBeenCalledWith(
      component.refs.main.querySelectorAll('tr.parallel-entry-text-collapsed td')
    );
    component.handleHideAll();
    component.refs.main.querySelectorAll('tr.parallel-entry-text')
      .forEach(row => expect(row.classList).toContain('parallel-entry-text-collapsed'));
  });

  it('loads the parallel index and selects an explicit or Gospel default option', async () => {
    const data = { parallels: [
      { id: 'letters', filename: 'letters.json', title: 'Letters' },
      { id: 'gospel-synopsis', filename: 'gospels.json', title: 'Gospels' }
    ] };
    fetch.mockResolvedValue(response({ json: data }));
    const component = await makeWindow();
    await component.loadParallelsIndex('letters');
    expect(component.state.parallelsData).toBe(data.parallels);
    expect(component.refs.parallelsList.options).toHaveLength(2);
    expect(component.refs.parallelsList.value).toBe('letters.json');

    const fallback = await makeWindow();
    await fallback.loadParallelsIndex();
    expect(fallback.refs.parallelsList.value).toBe('gospels.json');

    const noMatch = await makeWindow();
    await noMatch.loadParallelsIndex('missing');
    expect(noMatch.refs.parallelsList.value).toBe('letters.json');
  });

  it('reports index HTTP and request failures', async () => {
    const component = await makeWindow();
    component.showError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockResolvedValueOnce(response({ ok: false, status: 503 }));
    await component.loadParallelsIndex();
    fetch.mockRejectedValueOnce(new Error('offline'));
    await component.loadParallelsIndex();
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(component.showError).toHaveBeenCalledWith(
      'windows.parallel.loadlistfailed', expect.any(Error)
    );
  });

  it('loads the requested initial text', async () => {
    const component = await makeWindow();
    await component.loadInitialText('ENG');
    expect(component.state.currentTextInfo).toMatchObject({ id: 'ENG' });
    expect(component.state.textsInitialized).toBe(true);
    expect(fixtures.chooser.setTextInfo).toHaveBeenCalledWith(component.state.currentTextInfo);
    expect(component.refs.textlistui.innerHTML).toBe('ENG');
  });

  it('falls back to a matching Bible language after initial text failure', async () => {
    const component = await makeWindow();
    const texts = [
      { id: 'COMMENT', type: 'commentary', lang: 'spa' },
      { id: 'spa_BIBLE', type: 'bible', lang: 'spa' },
      { id: 'ENG', type: 'bible', lang: 'eng' }
    ];
    fixtures.getText
      .mockImplementationOnce((_id, _success, error) => error(new Error('missing')))
      .mockImplementationOnce((id, success) => success({ id, abbr: 'SPA' }));
    fixtures.loadTexts.mockImplementation(callback => callback(texts));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await component.loadInitialText('spa-special');
    expect(fixtures.getText).toHaveBeenLastCalledWith('spa_BIBLE', expect.any(Function));
    expect(component.state.currentTextInfo).toMatchObject({ id: 'spa_BIBLE' });
    expect(consoleError).toHaveBeenCalledWith('Error loading text', 'spa-special', expect.any(Error));
  });

  it('matches a fallback by ID prefix or defaults to the first available text', async () => {
    const byPrefix = await makeWindow();
    fixtures.getText
      .mockImplementationOnce((_id, _success, error) => error(new Error('missing')))
      .mockImplementationOnce((id, success) => success({ id, abbr: id }));
    fixtures.loadTexts.mockImplementationOnce(callback => callback([
      { id: 'fraABC', type: 'bible', lang: 'other' }, { id: 'ENG', type: 'bible', lang: 'eng' }
    ]));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await byPrefix.loadInitialText('fra_extra');
    expect(byPrefix.state.currentTextInfo.id).toBe('fraABC');

    const first = await makeWindow();
    fixtures.getText
      .mockImplementationOnce((_id, _success, error) => error(new Error('missing')))
      .mockImplementationOnce((id, success) => success({ id, abbr: id }));
    fixtures.loadTexts.mockImplementationOnce(callback => callback([
      { id: 'FIRST', type: 'bible', lang: 'eng' }
    ]));
    await first.loadInitialText('zzz');
    expect(first.state.currentTextInfo.id).toBe('FIRST');
  });

  it('reports fallback loading failures', async () => {
    const component = await makeWindow();
    fixtures.getText.mockImplementation((_id, _success, error) => error(new Error('missing')));
    fixtures.loadTexts.mockImplementation((_callback) => { throw new Error('catalog offline'); });
    component.showError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await component.loadInitialText('ENG');
    expect(consoleError).toHaveBeenCalledWith('Error loading fallback text', expect.any(Error));
    expect(component.showError).toHaveBeenCalledWith(
      'windows.parallel.loadtextfailed', expect.any(Error)
    );
  });

  it('starts only after texts and parallel metadata are both ready', async () => {
    const component = await makeWindow();
    component.loadParallelData = vi.fn();
    component.startup();
    component.state.textsInitialized = true;
    component.startup();
    component.state.parallelsData = [];
    component.startup();
    expect(component.loadParallelData).toHaveBeenCalledOnce();
  });

  it('clears stale content and skips loading when no parallel is selected', async () => {
    const component = await makeWindow();
    component.refs.main.innerHTML = '<span>old</span>';
    component.state.currentParallelData = { old: true };
    await component.loadParallelData();
    expect(component.refs.main.innerHTML).toBe('');
    expect(component.state.currentParallelData).toBeNull();
    expect(component._loadGeneration).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads current parallel data and renders it', async () => {
    const component = await makeWindow();
    component.refs.parallelsList.innerHTML = '<option value="gospels.json" selected>Gospels</option>';
    component.createParallel = vi.fn();
    fetch.mockResolvedValue(response({ json: { entries: [1] } }));
    await component.loadParallelData();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('content/parallels/gospels.json')
    );
    expect(component.state.currentParallelData).toEqual({ entries: [1] });
    expect(component.createParallel).toHaveBeenCalled();
  });

  it('ignores stale parallel success and failure responses', async () => {
    const component = await makeWindow();
    component.refs.parallelsList.innerHTML = '<option value="gospels.json" selected>Gospels</option>';
    component.createParallel = vi.fn();
    component.showError = vi.fn();
    let resolveFirst;
    fetch.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }));
    const first = component.loadParallelData();
    component._loadGeneration++;
    resolveFirst(response({ json: { entries: ['stale'] } }));
    await first;
    expect(component.createParallel).not.toHaveBeenCalled();

    fetch.mockRejectedValueOnce(new Error('stale failure'));
    const failed = component.loadParallelData();
    component._loadGeneration++;
    await failed;
    expect(component.showError).not.toHaveBeenCalled();
  });

  it('reports current parallel HTTP and request failures', async () => {
    const component = await makeWindow();
    component.refs.parallelsList.innerHTML = '<option value="gospels.json" selected>Gospels</option>';
    component.showError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockResolvedValueOnce(response({ ok: false, status: 500 }));
    await component.loadParallelData();
    fetch.mockRejectedValueOnce(new Error('offline'));
    await component.loadParallelData();
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(component.showError).toHaveBeenCalledWith(
      'windows.parallel.loadpassagesfailed', expect.any(Error)
    );
  });

  it('delegates table rendering and asynchronous cell loaders', async () => {
    const component = await makeWindow();
    const cells = component.refs.main.querySelectorAll('td');
    const cell = document.createElement('td');
    component.createParallel();
    await component.loadCells(cells);
    await component.processCell(cell, 3);
    expect(fixtures.renderParallelTable).toHaveBeenCalledWith(component);
    expect(fixtures.loadParallelCells).toHaveBeenCalledWith(component, cells);
    expect(fixtures.processParallelCell).toHaveBeenCalledWith(component, cell, 3);
  });

  it('sizes the container and chooser and serializes selected state', async () => {
    const component = await makeWindow();
    Object.defineProperty(component.refs.header, 'offsetHeight', { value: 40 });
    component.refs.parallelsList.innerHTML = `
      <option data-id="gospels" value="gospels.json" selected>Gospels</option>`;
    component.state.currentTextInfo = { providerid: 'local:ENG' };
    component.size(800, 600);
    expect(component.refs.container.style).toMatchObject({ width: '800px', height: '600px' });
    expect(component.refs.main.style).toMatchObject({ width: '800px', height: '560px' });
    expect(fixtures.chooser.size).toHaveBeenCalledWith(800, 600);
    expect(component.getData()).toEqual({
      textid: 'local:ENG', parallelid: 'gospels', label: 'Parallel', labelLong: 'Parallel',
      params: { win: 'parallel', textid: 'local:ENG', parallelid: 'gospels' }
    });

    component.state.currentTextInfo = null;
    component.refs.parallelsList.innerHTML = '';
    expect(component.getData()).toEqual({
      textid: '', parallelid: '', label: 'Parallel', labelLong: 'Parallel',
      params: { win: 'parallel', textid: '', parallelid: '' }
    });
  });
});

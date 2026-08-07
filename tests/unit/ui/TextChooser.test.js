import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  settings: {},
  getValue: vi.fn(),
  setValue: vi.fn(),
  getText: vi.fn(),
  getTextIdentity: vi.fn(info => info?.providerid ?? info?.id ?? ''),
  loadTexts: vi.fn(),
  buildFilteredIndices: vi.fn(() => []),
  buildGroupedData: vi.fn(() => ['grouped']),
  buildPinnedTop: vi.fn(() => ['pinned']),
  processTexts: vi.fn(),
  renderNow: vi.fn(),
  renderVisible: vi.fn(),
  scheduleRender: vi.fn(),
  offset: vi.fn(() => ({ top: 20, left: 30 }))
}));

vi.mock('@common/AppSettings.js', () => ({
  default: { getValue: fixtures.getValue, setValue: fixtures.setValue }
}));

vi.mock('@texts/TextLoader.js', () => ({
  getText: fixtures.getText,
  getTextIdentity: fixtures.getTextIdentity,
  loadTexts: fixtures.loadTexts
}));

vi.mock('@ui/TextChooserData.js', () => ({
  buildFilteredIndices: fixtures.buildFilteredIndices,
  buildGroupedData: fixtures.buildGroupedData,
  buildPinnedTop: fixtures.buildPinnedTop,
  processTexts: fixtures.processTexts
}));

vi.mock('@ui/TextChooserRows.js', () => ({
  renderNow: fixtures.renderNow,
  renderVisible: fixtures.renderVisible,
  scheduleRender: fixtures.scheduleRender,
  ROW_HEIGHT: 40
}));

vi.mock('@lib/helpers.esm.js', async (importOriginal) => ({
  ...(await importOriginal()),
  offset: fixtures.offset
}));

import { getGlobalTextChooser, TextChooser } from '@ui/TextChooser.js';

function makeChooser() {
  const chooser = TextChooser();
  chooser.refs.chooser.showPopover = vi.fn();
  chooser.refs.chooser.hidePopover = vi.fn();
  chooser.refs.chooser.togglePopover = vi.fn();
  chooser.refs.chooser.matches = vi.fn(() => false);
  return chooser;
}

describe('TextChooser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    fixtures.settings = { recent: [] };
    fixtures.getValue.mockImplementation((_key, fallback) => fixtures.settings ?? fallback);
    fixtures.getText.mockImplementation((id, callback) => callback({ id, name: id }));
    fixtures.loadTexts.mockImplementation(callback => callback([]));
    fixtures.buildFilteredIndices.mockReturnValue([]);
    fixtures.buildGroupedData.mockReturnValue(['grouped']);
    fixtures.buildPinnedTop.mockReturnValue(['pinned']);
    fixtures.offset.mockReturnValue({ top: 20, left: 30 });
  });

  it('initializes state, recent settings, UI, and event-emitter behavior', () => {
    fixtures.settings = { recent: ['ENG'] };
    const chooser = makeChooser();
    expect(chooser).toMatchObject({
      textType: null, target: null, selectedTextInfo: null, listData: null,
      langFilter: null, processedData: [], filteredIndices: [], scrollTop: 0,
      filterText: '', filterTokens: [], rafId: null,
      groupedCache: null, groupedCacheKey: null, processedDataKey: null,
      cachedChooserWidth: 320
    });
    expect(chooser.recentlyUsed).toEqual({ recent: ['ENG'] });
    expect(chooser.refs.chooser.parentNode).toBe(document.body);
    expect(chooser.refs.filter.dataset.i18n).toBe('[placeholder]windows.bible.filter');
    expect(chooser.on).toBeTypeOf('function');
  });

  it('routes input, key, scroll, row, toggle, and provider-disabled events', () => {
    const chooser = makeChooser();
    chooser.handleFilterInput = vi.fn();
    chooser.handleFilterKeydown = vi.fn();
    chooser.handleScroll = vi.fn();
    chooser.selectText = vi.fn();
    chooser.handleToggle = vi.fn();
    chooser.refresh = vi.fn();
    chooser.refs.filter.dispatchEvent(new Event('input'));
    chooser.refs.filter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    chooser.refs.main.dispatchEvent(new Event('scroll'));
    chooser.refs.scrollContent.innerHTML = '<div class="text-chooser-row" data-id="one:ENG"><span></span></div><button></button>';
    chooser.refs.scrollContent.querySelector('span').click();
    chooser.refs.scrollContent.querySelector('button').click();
    chooser.refs.chooser.dispatchEvent(new Event('toggle'));
    document.dispatchEvent(new CustomEvent('texts:provider-disabled'));
    expect(chooser.handleFilterInput).toHaveBeenCalled();
    expect(chooser.handleFilterKeydown).toHaveBeenCalled();
    expect(chooser.handleScroll).toHaveBeenCalled();
    expect(chooser.selectText).toHaveBeenCalledWith('one:ENG');
    expect(chooser.handleToggle).toHaveBeenCalled();
    expect(chooser.refresh).toHaveBeenCalled();
  });

  it('clears filtering and applies the full index', () => {
    const chooser = makeChooser();
    chooser.processedData = [{}, {}, {}];
    chooser.filterText = 'old';
    chooser.filterTokens = ['old'];
    chooser.refs.filter.value = 'old';
    chooser.clearFilter();
    expect(chooser.refs.filter.value).toBe('');
    expect(chooser.filterText).toBe('');
    expect(chooser.filterTokens).toEqual([]);
    expect(chooser.filteredIndices).toEqual([0, 1, 2]);
    expect(chooser.refs.scrollContent.style.height).toBe('120px');
    expect(fixtures.scheduleRender).toHaveBeenCalledWith(chooser);
  });

  it('selects the sole visible text on Enter and ignores other key/list shapes', () => {
    const chooser = makeChooser();
    chooser.processedData = [
      { type: 'heading' },
      { type: 'text', data: { id: 'ENG', providerid: 'one:ENG' } },
      { type: 'heading' }
    ];
    chooser.filteredIndices = [0, 1, 2];
    chooser.selectText = vi.fn();
    chooser.clearFilter = vi.fn();
    chooser.handleFilterKeydown({ key: 'x' });
    chooser.handleFilterKeydown({ key: 'Enter' });
    expect(chooser.selectText).toHaveBeenCalledWith('one:ENG');
    expect(chooser.clearFilter).toHaveBeenCalled();

    chooser.processedData.push({ type: 'text', data: { id: 'SPA' } });
    chooser.filteredIndices.push(3);
    chooser.selectText.mockClear();
    chooser.handleFilterKeydown({ key: 'Enter' });
    expect(chooser.selectText).not.toHaveBeenCalled();
  });

  it('normalizes changed filter input and skips unchanged values', () => {
    const chooser = makeChooser();
    chooser.applyFilter = vi.fn();
    chooser.refs.filter.value = '  King   James  ';
    chooser.handleFilterInput();
    expect(chooser.filterText).toBe('king   james');
    expect(chooser.filterTokens).toEqual(['king', 'james']);
    expect(chooser.applyFilter).toHaveBeenCalled();
    chooser.applyFilter.mockClear();
    chooser.handleFilterInput();
    expect(chooser.applyFilter).not.toHaveBeenCalled();
  });

  it('applies delegated filtered indexes and exposes row delegates', () => {
    const chooser = makeChooser();
    chooser.processedData = [{}, {}];
    chooser.filterText = 'eng';
    fixtures.buildFilteredIndices.mockReturnValue([1]);
    chooser.applyFilter();
    expect(chooser.filteredIndices).toEqual([1]);
    expect(chooser.refs.scrollContent.style.height).toBe('40px');
    expect(chooser.buildFilteredIndices()).toEqual([1]);
    expect(chooser.buildGroupedData()).toEqual(['grouped']);
    expect(chooser.buildPinnedTop()).toEqual(['pinned']);
    chooser.processTexts(['data']);
    chooser.renderNow();
    chooser.renderVisible();
    chooser.scheduleRender();
    expect(fixtures.processTexts).toHaveBeenCalledWith(chooser, ['data']);
    expect(fixtures.renderNow).toHaveBeenCalledWith(chooser);
    expect(fixtures.renderVisible).toHaveBeenCalledWith(chooser);
  });

  it('tracks scrolling and schedules a render', () => {
    const chooser = makeChooser();
    chooser.refs.main.scrollTop = 80;
    chooser.handleScroll();
    expect(chooser.scrollTop).toBe(80);
    expect(fixtures.scheduleRender).toHaveBeenCalledWith(chooser);
  });

  it('selects a text, persists it, hides the popover, and retains the click target', () => {
    const chooser = makeChooser();
    const target = document.createElement('button');
    chooser.target = target;
    chooser.textType = 'bible';
    let resolveText;
    fixtures.getText.mockImplementation((_id, callback) => { resolveText = callback; });
    const changed = vi.fn();
    chooser.on('change', changed);
    chooser.selectText('one:ENG');
    chooser.target = document.body;
    resolveText({ id: 'ENG', abbr: 'WEB' });
    expect(chooser.refs.chooser.hidePopover).toHaveBeenCalled();
    expect(chooser.selectedTextInfo).toEqual({ id: 'ENG', abbr: 'WEB' });
    expect(changed).toHaveBeenCalledWith({
      type: 'change', target: null,
      data: { textInfo: { id: 'ENG', abbr: 'WEB' }, textid: 'one:ENG', target }
    });
  });

  it('stores up to five unique recent Bible IDs and ignores invalid/non-Bible input', () => {
    const chooser = makeChooser();
    chooser.textType = 'audio';
    chooser.storeRecentlyUsed('ENG');
    chooser.textType = 'bible';
    chooser.storeRecentlyUsed(null);
    expect(fixtures.setValue).not.toHaveBeenCalled();
    chooser.recentlyUsed = { recent: ['A', 'B', 'C', 'D', 'E'] };
    chooser.storeRecentlyUsed('C');
    chooser.storeRecentlyUsed({ id: 'F', providerid: 'remote:F' });
    expect(chooser.recentlyUsed.recent).toEqual(['remote:F', 'C', 'A', 'B', 'D']);
    expect(fixtures.setValue).toHaveBeenLastCalledWith('texts-recently-used', chooser.recentlyUsed);
  });

  it('sets target filters and reprocesses only meaningful changes after data loads', () => {
    const chooser = makeChooser();
    const target = document.createElement('button');
    chooser.listData = ['texts'];
    chooser.processTexts = vi.fn();
    chooser.setTarget(null, target, 'bible', 'eng');
    expect(chooser.getTarget()).toBe(target);
    expect(chooser.processTexts).toHaveBeenCalledWith(['texts']);
    chooser.processTexts.mockClear();
    chooser.setTarget(null, target, 'bible', 'eng');
    expect(chooser.processTexts).not.toHaveBeenCalled();
    chooser.listData = null;
    chooser.setTarget(null, target, 'audio', null);
    expect(chooser.processTexts).not.toHaveBeenCalled();
    chooser.setTarget(null, target, 'bible');
    expect(chooser.langFilter).toBeNull();
  });

  it('stores selected info, recent use, and schedules rendering', () => {
    const chooser = makeChooser();
    chooser.textType = 'bible';
    chooser.setTextInfo(null);
    expect(fixtures.setValue).not.toHaveBeenCalled();
    const info = { id: 'ENG' };
    chooser.setTextInfo(info);
    expect(chooser.getTextInfo()).toBe(info);
    expect(fixtures.setValue).toHaveBeenCalled();
    expect(fixtures.scheduleRender).toHaveBeenCalledWith(chooser);
  });

  it('refreshes caches and reloads immediately only while open', () => {
    const chooser = makeChooser();
    chooser.listData = ['old'];
    chooser.groupedCache = {};
    chooser.groupedCacheKey = 'key';
    chooser.processedData = [{}];
    chooser.processedDataKey = 'processed';
    chooser.refs.chooser.matches.mockReturnValue(false);
    chooser.refresh();
    expect(chooser.listData).toBeNull();
    expect(chooser.groupedCache).toBeNull();
    expect(chooser.processedData).toEqual([]);
    expect(fixtures.loadTexts).not.toHaveBeenCalled();

    chooser.refs.chooser.matches.mockReturnValue(true);
    chooser.processTexts = vi.fn();
    chooser.renderNow = vi.fn();
    fixtures.loadTexts.mockImplementation(callback => callback(['fresh']));
    chooser.refresh();
    expect(chooser.listData).toEqual(['fresh']);
    expect(chooser.processTexts).toHaveBeenCalledWith(['fresh']);
    expect(chooser.renderNow).toHaveBeenCalled();
  });

  it('positions under its target, caches measured width, and clamps overflow', () => {
    const chooser = makeChooser();
    chooser.position();
    expect(fixtures.offset).not.toHaveBeenCalled();
    const target = document.createElement('button');
    Object.defineProperty(target, 'offsetHeight', { value: 25 });
    chooser.target = target;
    Object.defineProperty(chooser.refs.chooser, 'offsetWidth', { configurable: true, value: 400 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    chooser.position();
    expect(chooser.cachedChooserWidth).toBe(400);
    expect(chooser.refs.chooser.style.top).toBe('55px');
    expect(chooser.refs.chooser.style.left).toBe('30px');

    fixtures.offset.mockReturnValue({ top: 10, left: 900 });
    chooser.position();
    expect(chooser.refs.chooser.style.left).toBe('600px');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 200 });
    chooser.position();
    expect(chooser.refs.chooser.style.left).toBe('0px');
  });

  it('handles close toggles and emits an offclick event', () => {
    const chooser = makeChooser();
    const offclick = vi.fn();
    chooser.on('offclick', offclick);
    chooser.handleToggle({ newState: 'closed' });
    expect(offclick).toHaveBeenCalledWith({ type: 'offclick' });
    expect(fixtures.loadTexts).not.toHaveBeenCalled();
  });

  it('opens by loading data, resetting scroll/filter, and processing rows', () => {
    const chooser = makeChooser();
    chooser.target = document.createElement('button');
    chooser.position = vi.fn();
    chooser.processTexts = vi.fn();
    chooser.clearFilter = vi.fn();
    chooser.refs.filter.value = 'old';
    chooser.refs.main.scrollTop = 45;
    fixtures.loadTexts.mockImplementation(callback => callback(['texts']));
    chooser.handleToggle({ newState: 'open' });
    expect(chooser.position).toHaveBeenCalled();
    expect(chooser.refs.main.classList).not.toContain('loading-indicator');
    expect(chooser.listData).toEqual(['texts']);
    expect(chooser.processTexts).toHaveBeenCalledWith(['texts']);
    expect(chooser.clearFilter).toHaveBeenCalled();
    expect(chooser.refs.main.scrollTop).toBe(0);
    expect(chooser.scrollTop).toBe(0);
  });

  it('reopens cached data with refreshed recents and an immediate render', () => {
    const chooser = makeChooser();
    chooser.listData = ['cached'];
    chooser.refs.filter.value = '';
    chooser.processTexts = vi.fn();
    chooser.renderNow = vi.fn();
    fixtures.settings = { recent: ['SPA'] };
    chooser.handleToggle({ newState: 'open' });
    expect(chooser.recentlyUsed).toEqual({ recent: ['SPA'] });
    expect(chooser.processTexts).toHaveBeenCalledWith(['cached']);
    expect(chooser.renderNow).toHaveBeenCalled();
  });

  it('shows, hides, toggles, reports visibility, and exposes its node', () => {
    const chooser = makeChooser();
    chooser.position = vi.fn();
    chooser.show();
    chooser.hide();
    chooser.refs.chooser.matches.mockReturnValueOnce(false).mockReturnValueOnce(true);
    chooser.toggle();
    expect(chooser.position).toHaveBeenCalledTimes(2);
    expect(chooser.refs.chooser.showPopover).toHaveBeenCalled();
    expect(chooser.refs.chooser.hidePopover).toHaveBeenCalled();
    expect(chooser.refs.chooser.togglePopover).toHaveBeenCalled();
    expect(chooser.isVisible()).toBe(true);
    expect(chooser.node()).toBe(chooser.refs.chooser);
    expect(chooser.size()).toBeUndefined();
  });

  it('returns a stable global chooser singleton', () => {
    const first = getGlobalTextChooser();
    const second = getGlobalTextChooser();
    expect(second).toBe(first);
  });
});

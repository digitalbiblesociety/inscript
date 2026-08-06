import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: { newBibleWindowVersion: 'DEFAULT' },
  loadSection: vi.fn()
}));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));
vi.mock('@texts/TextLoader.js', () => ({ loadSection: fixtures.loadSection }));

import {
  createDetailPanel,
  destroyDetailPanel,
  hydrateVerseTexts,
  openDetailPanel
} from '@windows/MapWindow/detail-panel.js';

function location(count = 1) {
  return {
    name: 'Place', type: 'city', coordinates: [0, 0],
    verses: Array.from({ length: count }, (_, index) => `GN${index + 1}_1`)
  };
}

function loader(_textid, sectionid, success) {
  const content = document.createElement('div');
  content.innerHTML = `<span class="${sectionid}_1">Text for ${sectionid}</span>`;
  success(content);
}

describe('detail panel lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    fixtures.config = { newBibleWindowVersion: 'DEFAULT' };
    fixtures.loadSection.mockImplementation(loader);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('creates and destroys a native popover panel', () => {
    const panel = createDetailPanel();
    expect(panel.isConnected).toBe(true);
    expect(panel.className).toBe('map-detail-panel');
    expect(panel.hasAttribute('popover')).toBe(true);
    panel.matches = vi.fn(() => true);
    panel.hidePopover = vi.fn();
    panel._hydrateObserver = { disconnect: vi.fn() };
    const observer = panel._hydrateObserver;
    destroyDetailPanel(panel);
    expect(observer.disconnect).toHaveBeenCalled();
    expect(panel.hidePopover).toHaveBeenCalled();
    expect(panel.isConnected).toBe(false);
    expect(() => destroyDetailPanel(null)).not.toThrow();
  });

  it('opens below an anchor, clamps horizontally, and avoids reopening an open popover', () => {
    const panel = createDetailPanel();
    panel.matches = vi.fn(() => true);
    panel.showPopover = vi.fn();
    openDetailPanel({
      panel, location: location(), anchorRect: { left: -100, top: 10, bottom: 20, width: 10 },
      verseTextLookup: () => 'already loaded', colocated: [{ name: 'Nearby' }]
    });
    expect(panel._colocatedLocations).toEqual([{ name: 'Nearby' }]);
    expect(panel.style.left).toBe('8px');
    expect(panel.style.top).toBe('28px');
    expect(panel.style.transform).toBe('');
    expect(panel.showPopover).not.toHaveBeenCalled();
  });

  it('positions above a low anchor and opens a closed popover', () => {
    const panel = createDetailPanel();
    panel.matches = vi.fn(() => false);
    panel.showPopover = vi.fn();
    openDetailPanel({
      panel, location: location(), textid: 'WEB',
      anchorRect: { left: 790, top: 550, bottom: 570, width: 20 }
    });
    expect(panel.style.left).toBe('492px');
    expect(panel.style.top).toBe('542px');
    expect(panel.style.transform).toBe('translateY(-100%)');
    expect(panel.showPopover).toHaveBeenCalled();
    expect(fixtures.loadSection).toHaveBeenCalledWith('WEB', 'GN1', expect.any(Function), expect.any(Function));
  });

  it('resolves text ids from an open Bible and then configuration', () => {
    document.body.innerHTML = '<div class="BibleWindow"><div class="section" data-textid="LIVE"></div></div>';
    const first = document.createElement('div');
    first.innerHTML = '<div class="verse" data-sectionid="GN1" data-fragmentid="GN1_1"><span class="verse-text-pending"></span></div>';
    hydrateVerseTexts(first, null, fixtures.loadSection);
    expect(fixtures.loadSection).toHaveBeenLastCalledWith('LIVE', 'GN1', expect.any(Function), expect.any(Function));

    document.body.innerHTML = '';
    const second = document.createElement('div');
    second.innerHTML = '<div class="verse" data-sectionid="GN1" data-fragmentid="GN1_1"><span class="verse-text-pending"></span></div>';
    hydrateVerseTexts(second, null, fixtures.loadSection);
    expect(fixtures.loadSection).toHaveBeenLastCalledWith('DEFAULT', 'GN1', expect.any(Function), expect.any(Function));
  });

  it('stops for absent containers, unresolved text ids, and ungrouped pending spans', () => {
    hydrateVerseTexts(null, 'WEB', fixtures.loadSection);
    fixtures.config.newBibleWindowVersion = '';
    const unresolved = document.createElement('div');
    unresolved.innerHTML = '<span class="verse-text-pending"></span>';
    hydrateVerseTexts(unresolved, null, fixtures.loadSection);
    expect(fixtures.loadSection).not.toHaveBeenCalled();

    fixtures.config.newBibleWindowVersion = 'DEFAULT';
    hydrateVerseTexts(unresolved, null, fixtures.loadSection);
    expect(fixtures.loadSection).not.toHaveBeenCalled();
  });

  it('hydrates lazy sections immediately without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const panel = document.createElement('div');
    panel.innerHTML = location(11).verses.map((id, index) =>
      `<div class="verse" data-sectionid="GN${index + 1}" data-fragmentid="${id}">` +
      '<span class="verse-text-pending"></span></div>').join('');
    hydrateVerseTexts(panel, 'WEB', fixtures.loadSection);
    expect(fixtures.loadSection).toHaveBeenCalledTimes(11);
    expect(panel.querySelectorAll('.verse-text-pending')).toHaveLength(0);
  });

  it('observes lazy rows and hydrates them when they intersect', () => {
    let callback;
    const observer = {
      observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn()
    };
    vi.stubGlobal('IntersectionObserver', vi.fn(function IntersectionObserver(cb) {
      callback = cb;
      return observer;
    }));
    const panel = document.createElement('div');
    panel.innerHTML = location(11).verses.map((id, index) =>
      `<div class="verse" data-sectionid="GN${index + 1}" data-fragmentid="${id}">` +
      '<span class="verse-text-pending"></span></div>').join('');
    hydrateVerseTexts(panel, 'WEB', fixtures.loadSection);
    expect(observer.observe).toHaveBeenCalledOnce();
    const row = observer.observe.mock.calls[0][0];
    callback([{ isIntersecting: false, target: row }]);
    expect(fixtures.loadSection).toHaveBeenCalledTimes(10);
    callback([{ isIntersecting: true, target: row }]);
    expect(observer.unobserve).toHaveBeenCalledWith(row);
    expect(fixtures.loadSection).toHaveBeenCalledTimes(11);
    expect(observer.disconnect).toHaveBeenCalled();

    hydrateVerseTexts(panel, 'WEB', fixtures.loadSection);
    expect(observer.disconnect).toHaveBeenCalledTimes(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  enabled: true,
  colorPick: null,
  erase: null,
  palette: null,
  addHighlight: vi.fn(),
  removeHighlight: vi.fn(),
  updateHighlightColor: vi.fn(),
  applyHighlightMark: vi.fn(),
  applyHighlightsToSection: vi.fn(),
  getVerseOffset: vi.fn(),
  recolorHighlightMarks: vi.fn(),
  removeHighlightMarks: vi.fn(),
  createPalette: vi.fn(),
  hidePalette: vi.fn(palette => { palette.style.display = 'none'; }),
  showPalette: vi.fn((palette) => { palette.style.display = 'flex'; })
}));

vi.mock('@core/config.js', () => ({
  getConfig: () => ({ enableHighlighterPlugin: fixtures.enabled })
}));

vi.mock('@plugins/HighlighterStorage.js', () => ({
  addHighlight: fixtures.addHighlight,
  removeHighlight: fixtures.removeHighlight,
  updateHighlightColor: fixtures.updateHighlightColor
}));

vi.mock('@plugins/HighlighterMarks.js', () => ({
  applyHighlightMark: fixtures.applyHighlightMark,
  applyHighlightsToSection: fixtures.applyHighlightsToSection,
  getVerseOffset: fixtures.getVerseOffset,
  recolorHighlightMarks: fixtures.recolorHighlightMarks,
  removeHighlightMarks: fixtures.removeHighlightMarks
}));

vi.mock('@plugins/HighlighterPalette.js', () => ({
  createPalette: fixtures.createPalette,
  hidePalette: fixtures.hidePalette,
  showPalette: fixtures.showPalette
}));

import { HighlighterPlugin } from '@plugins/HighlighterPlugin.js';

function setupChrome() {
  document.body.innerHTML = `
    <div id="main-menu-features"></div>
    <div id="main-menu-dropdown"></div>
    <div class="windows-main"></div>`;
  return document.querySelector('.windows-main');
}

function addController(parent, { tag = 'bible-window', textid = 'ENGWEB', sectionid = 'JN3' } = {}) {
  const controller = document.createElement(tag);
  controller.state = { currentTextInfo: { id: textid } };
  controller.innerHTML = `<div class="section ${sectionid}">
    <span class="v" data-id="JN3_16">Hello world</span>
  </div>`;
  parent.appendChild(controller);
  return controller;
}

function activate() {
  const extension = HighlighterPlugin();
  document.querySelector('.highlighter-toggle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return extension;
}

describe('HighlighterPlugin controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fixtures.enabled = true;
    fixtures.colorPick = null;
    fixtures.erase = null;
    fixtures.palette = null;
    fixtures.createPalette.mockImplementation((onColorPick, onErase) => {
      fixtures.colorPick = onColorPick;
      fixtures.erase = onErase;
      const palette = document.createElement('div');
      palette.className = 'test-palette';
      palette.style.display = 'none';
      document.body.appendChild(palette);
      fixtures.palette = palette;
      return palette;
    });
    fixtures.hidePalette.mockImplementation(palette => { palette.style.display = 'none'; });
    fixtures.showPalette.mockImplementation(palette => { palette.style.display = 'flex'; });
    fixtures.getVerseOffset.mockReturnValue(0);
    setupChrome();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('returns an inert object when the plugin is disabled', () => {
    fixtures.enabled = false;
    expect(HighlighterPlugin()).toEqual({});
    expect(document.querySelector('.highlighter-toggle')).toBeNull();
    expect(fixtures.createPalette).not.toHaveBeenCalled();
  });

  it('constructs safely when optional menu and window containers are absent', () => {
    document.body.innerHTML = '';
    const extension = HighlighterPlugin();
    expect(extension.on).toBeTypeOf('function');
    expect(document.querySelector('.highlighter-toggle')).toBeNull();
    expect(fixtures.createPalette).toHaveBeenCalled();
  });

  it('toggles active state, closes an open menu, and clears selection on deactivation', () => {
    const dropdown = document.querySelector('#main-menu-dropdown');
    dropdown.matches = vi.fn(() => true);
    dropdown.hidePopover = vi.fn();
    const removeAllRanges = vi.fn();
    vi.spyOn(window, 'getSelection').mockReturnValue({ removeAllRanges });
    HighlighterPlugin();
    const toggle = document.querySelector('.highlighter-toggle');

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(toggle.classList).toContain('active');
    expect(document.body.classList).toContain('highlighter-active');
    expect(dropdown.hidePopover).toHaveBeenCalled();

    dropdown.matches.mockReturnValue(false);
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(toggle.classList).not.toContain('active');
    expect(document.body.classList).not.toContain('highlighter-active');
    expect(fixtures.hidePalette).toHaveBeenCalledWith(fixtures.palette);
    expect(removeAllRanges).toHaveBeenCalled();
    expect(dropdown.hidePopover).toHaveBeenCalledOnce();
  });

  it('ignores mouseup while inactive and defers selection processing while active', () => {
    const main = document.querySelector('.windows-main');
    const getSelection = vi.spyOn(window, 'getSelection').mockReturnValue(null);
    HighlighterPlugin();
    main.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.runAllTimers();
    expect(getSelection).not.toHaveBeenCalled();

    document.querySelector('.highlighter-toggle').click();
    main.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(getSelection).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(getSelection).toHaveBeenCalled();
  });

  it('edits an existing highlight from a collapsed selection and recolors it', () => {
    const main = document.querySelector('.windows-main');
    const controller = addController(main);
    const verse = controller.querySelector('.v');
    verse.innerHTML = '<mark class="user-highlight" data-hl-id="hl-one" style="background-color: rgb(255, 255, 119)">Hello</mark> world';
    const mark = verse.querySelector('mark');
    mark.getBoundingClientRect = () => ({ left: 100, top: 200, width: 50 });
    vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: true, rangeCount: 1 });
    activate();

    mark.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(10);
    expect(fixtures.showPalette).toHaveBeenCalledWith(fixtures.palette, 50, 160, 'rgb(255, 255, 119)');

    fixtures.colorPick('#ada');
    expect(fixtures.recolorHighlightMarks).toHaveBeenCalledWith('hl-one', '#ada');
    expect(fixtures.updateHighlightColor).toHaveBeenCalledWith('ENGWEB', 'hl-one', '#ada');
    expect(fixtures.hidePalette).toHaveBeenCalledWith(fixtures.palette);
    fixtures.colorPick('#9cf');
    expect(fixtures.addHighlight).not.toHaveBeenCalled();
  });

  it('erases an existing highlight and ignores marks lacking identity or text context', () => {
    const main = document.querySelector('.windows-main');
    const controller = addController(main);
    const verse = controller.querySelector('.v');
    verse.innerHTML = '<mark class="user-highlight" data-hl-id="hl-one">Hello</mark>';
    const mark = verse.querySelector('mark');
    mark.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0 });
    vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: true, rangeCount: 0 });
    activate();
    mark.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(10);
    fixtures.erase();
    expect(fixtures.removeHighlightMarks).toHaveBeenCalledWith('hl-one');
    expect(fixtures.removeHighlight).toHaveBeenCalledWith('ENGWEB', 'hl-one');

    mark.removeAttribute('data-hl-id');
    fixtures.showPalette.mockClear();
    mark.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(10);
    expect(fixtures.showPalette).not.toHaveBeenCalled();

    mark.dataset.hlId = 'hl-two';
    controller.state.currentTextInfo.id = '';
    mark.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(10);
    expect(fixtures.showPalette).not.toHaveBeenCalled();
  });

  it('creates a normalized highlight and mirrors it into matching versions', () => {
    const main = document.querySelector('.windows-main');
    const source = addController(main);
    const duplicate = addController(main, { tag: 'commentary-window' });
    const alreadyMarked = addController(main);
    const otherVersion = addController(main, { textid: 'OTHER' });
    const verse = source.querySelector('.v');
    const sourceText = verse.firstChild;
    const range = {
      commonAncestorContainer: sourceText,
      startContainer: sourceText,
      startOffset: 8,
      endContainer: sourceText,
      endOffset: 2,
      getBoundingClientRect: () => ({ left: 100, top: 200, width: 50 })
    };
    const removeAllRanges = vi.fn();
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false, rangeCount: 1, getRangeAt: () => range, removeAllRanges
    });
    fixtures.getVerseOffset.mockReturnValueOnce(8).mockReturnValueOnce(2);
    fixtures.applyHighlightMark.mockImplementationOnce((_verse, _start, _end, _color, id) => {
      alreadyMarked.querySelector('.v').innerHTML = `<mark class="user-highlight" data-hl-id="${id}">Hello</mark>`;
    });
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    activate();

    verse.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(10);
    expect(fixtures.showPalette).toHaveBeenCalledWith(fixtures.palette, 50, 160, null);
    fixtures.colorPick('#ff7');

    expect(removeAllRanges).toHaveBeenCalled();
    const highlight = fixtures.addHighlight.mock.calls[0][1];
    expect(fixtures.addHighlight).toHaveBeenCalledWith('ENGWEB', expect.objectContaining({
      verseId: 'JN3_16', startOffset: 2, endOffset: 8, color: '#ff7', created: 12345
    }));
    expect(highlight.id).toMatch(/^hl_/);
    expect(fixtures.applyHighlightMark).toHaveBeenCalledWith(verse, 2, 8, '#ff7', highlight.id);
    expect(fixtures.applyHighlightMark).toHaveBeenCalledWith(
      duplicate.querySelector('.v'), 2, 8, '#ff7', highlight.id
    );
    expect(fixtures.applyHighlightMark.mock.calls.some(
      ([target]) => target === otherVersion.querySelector('.v')
    )).toBe(false);
    expect(fixtures.applyHighlightMark).toHaveBeenCalledTimes(2);
  });

  it('accepts an element range ancestor and uses a controller nested inside the verse container', () => {
    const main = document.querySelector('.windows-main');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<span class="v" data-id="JN3_16"><b>Hello</b></span><bible-window></bible-window>';
    const nestedController = wrapper.querySelector('bible-window');
    nestedController.state = { currentTextInfo: { id: 'ENGWEB' } };
    const verse = wrapper.querySelector('.v');
    verse.appendChild(nestedController);
    main.appendChild(wrapper);
    const range = {
      commonAncestorContainer: verse,
      startContainer: verse.firstChild,
      startOffset: 0,
      endContainer: verse.firstChild,
      endOffset: 1,
      getBoundingClientRect: () => ({ left: 0, top: 50, width: 20 })
    };
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false, rangeCount: 1, getRangeAt: () => range
    });
    fixtures.getVerseOffset.mockReturnValueOnce(0).mockReturnValueOnce(5);
    activate();
    verse.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(10);
    expect(fixtures.showPalette).toHaveBeenCalledWith(fixtures.palette, -65, 10, null);
  });

  it('hides the palette for selections outside a version or with zero length', () => {
    const main = document.querySelector('.windows-main');
    const verse = document.createElement('span');
    verse.className = 'v';
    verse.dataset.id = 'JN3_16';
    verse.textContent = 'Hello';
    main.appendChild(verse);
    const range = {
      commonAncestorContainer: verse.firstChild,
      startContainer: verse.firstChild,
      startOffset: 0,
      endContainer: verse.firstChild,
      endOffset: 1,
      getBoundingClientRect: vi.fn()
    };
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false, rangeCount: 1, getRangeAt: () => range
    });
    activate();
    verse.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(10);
    expect(fixtures.hidePalette).toHaveBeenCalledWith(fixtures.palette);

    const controller = document.createElement('bible-window');
    controller.state = { currentTextInfo: { id: 'ENGWEB' } };
    controller.appendChild(verse);
    main.appendChild(controller);
    fixtures.getVerseOffset.mockReturnValue(3);
    verse.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(10);
    expect(fixtures.hidePalette).toHaveBeenCalledTimes(2);
    expect(range.getBoundingClientRect).not.toHaveBeenCalled();
  });

  it('hides an open palette on outside mousedown but leaves inside clicks alone', () => {
    HighlighterPlugin();
    fixtures.palette.style.display = 'flex';
    const child = document.createElement('span');
    fixtures.palette.appendChild(child);
    child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(fixtures.hidePalette.mock.calls.some(([palette]) => palette === fixtures.palette)).toBe(false);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(fixtures.hidePalette).toHaveBeenCalledWith(fixtures.palette);

    fixtures.hidePalette.mockClear();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(fixtures.hidePalette.mock.calls.some(([palette]) => palette === fixtures.palette)).toBe(false);
  });

  it('restores a text-load section once only in controllers showing that version', () => {
    const main = document.querySelector('.windows-main');
    const matching = addController(main);
    const alreadyApplied = addController(main);
    alreadyApplied.querySelector('.section').dataset.hlApplied = 'true';
    addController(main, { textid: 'OTHER' });
    const missingSection = addController(main, { sectionid: 'EX1' });
    const extension = HighlighterPlugin();

    extension.trigger('message', { data: { messagetype: 'ignored', textid: 'ENGWEB', sectionid: 'JN3' } });
    extension.trigger('message', { data: { messagetype: 'textload', sectionid: 'JN3' } });
    extension.trigger('message', { data: { messagetype: 'textload', textid: 'ENGWEB' } });
    expect(vi.getTimerCount()).toBe(0);
    extension.trigger('message', { data: { messagetype: 'textload', textid: 'ENGWEB', sectionid: 'JN3' } });
    vi.advanceTimersByTime(50);

    const section = matching.querySelector('.section');
    expect(section.dataset.hlApplied).toBe('true');
    expect(fixtures.applyHighlightsToSection).toHaveBeenCalledOnce();
    expect(fixtures.applyHighlightsToSection).toHaveBeenCalledWith('ENGWEB', section);
    expect(missingSection.querySelector('.section').dataset.hlApplied).toBeUndefined();

    extension.trigger('message', { data: { messagetype: 'textload', textid: 'ENGWEB', sectionid: 'JN3' } });
    vi.advanceTimersByTime(50);
    expect(fixtures.applyHighlightsToSection).toHaveBeenCalledOnce();
  });
});

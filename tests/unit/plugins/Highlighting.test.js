import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateConfig } from '@core/config.js';
import { HighlighterPlugin } from '@plugins/HighlighterPlugin.js';
import {
  applyHighlightMark,
  applyHighlightsToSection,
  getVerseOffset,
  recolorHighlightMarks,
  removeHighlightMarks
} from '@plugins/HighlighterMarks.js';
import {
  addHighlight,
  getHighlightsForVerse,
  removeHighlight,
  updateHighlightColor
} from '@plugins/HighlighterStorage.js';
import { createPalette, hidePalette, showPalette } from '@plugins/HighlighterPalette.js';

describe('highlight persistence and DOM marks', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    vi.stubGlobal('requestAnimationFrame', callback => callback());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('adds, updates, filters, and removes version-scoped highlights', () => {
    addHighlight('ENGWEB', { id: 'one', verseId: 'JN3_16', startOffset: 0, endOffset: 3, color: '#ff7' });
    addHighlight('ENGWEB', { id: 'two', verseId: 'JN3_17', startOffset: 1, endOffset: 4, color: '#ada' });
    expect(getHighlightsForVerse('ENGWEB', 'JN3_16')).toHaveLength(1);
    expect(getHighlightsForVerse('OTHER', 'JN3_16')).toEqual([]);
    updateHighlightColor('ENGWEB', 'one', '#9cf');
    expect(getHighlightsForVerse('ENGWEB', 'JN3_16')[0].color).toBe('#9cf');
    updateHighlightColor('MISSING', 'one', '#000');
    removeHighlight('ENGWEB', 'one');
    expect(getHighlightsForVerse('ENGWEB', 'JN3_16')).toEqual([]);
    removeHighlight('MISSING', 'one');
    localStorage.setItem('browserbible_highlights', '{broken');
    expect(getHighlightsForVerse('ENGWEB', 'JN3_17')).toEqual([]);
  });

  it('maps visible offsets, wraps ranges, recolors, removes, and restores marks', () => {
    const verse = document.createElement('span');
    verse.className = 'v';
    verse.dataset.id = 'JN3_16';
    verse.innerHTML = '<span class="v-num">16</span>Hello <em>world</em><span class="note">ignored</span>';
    document.body.appendChild(verse);
    const hello = verse.childNodes[1];
    const world = verse.querySelector('em').firstChild;
    expect(getVerseOffset(verse, hello, 2)).toBe(2);
    expect(getVerseOffset(verse, world, 3)).toBe(9);
    expect(getVerseOffset(verse, document.createTextNode('outside'), 0)).toBe(11);

    applyHighlightMark(verse, 0, 5, '#ff7', 'one');
    expect(verse.querySelector('[data-hl-id="one"]').textContent).toBe('Hello');
    recolorHighlightMarks('one', '#ada');
    expect(verse.querySelector('[data-hl-id="one"]').style.backgroundColor).toBe('rgb(170, 221, 170)');
    removeHighlightMarks('one');
    expect(verse.querySelector('.user-highlight')).toBeNull();

    addHighlight('ENGWEB', { id: 'restore', verseId: 'JN3_16', startOffset: 6, endOffset: 11, color: '#9cf' });
    const section = document.createElement('div');
    section.innerHTML = '<span class="v" data-id="JN3_16">Hello world</span><span class="v">no id</span>';
    applyHighlightsToSection('ENGWEB', section);
    expect(section.querySelector('[data-hl-id="restore"]').textContent).toBe('world');
    applyHighlightsToSection('', section);
    applyHighlightsToSection('ENGWEB', null);
  });

  it('creates and positions a selectable palette', () => {
    const pick = vi.fn();
    const erase = vi.fn();
    const palette = createPalette(pick, erase);
    palette.getBoundingClientRect = () => ({ right: 1000, bottom: 1000, width: 150, height: 40 });
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 800 },
      innerHeight: { configurable: true, value: 600 }
    });
    showPalette(palette, 790, 590, '#ff7');
    expect(palette.style.left).toBe('642px');
    expect(palette.querySelector('[data-color="#ff7"]').classList.contains('selected')).toBe(true);
    palette.querySelector('[data-color="#ada"]').click();
    palette.querySelector('.eraser').click();
    expect(pick).toHaveBeenCalledWith('#ada');
    expect(erase).toHaveBeenCalled();
    hidePalette(palette);
    expect(palette.style.display).toBe('none');
  });
});

describe('highlighter plugin integration', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <div id="main-menu-features"></div><div id="main-menu-dropdown"></div>
      <div class="windows-main"></div>`;
    updateConfig({ enableHighlighterPlugin: true });
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', callback => callback());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('toggles activation and restores stored highlights after text loads', () => {
    addHighlight('ENGWEB', { id: 'restore', verseId: 'JN3_16', startOffset: 0, endOffset: 5, color: '#ff7' });
    const bible = document.createElement('bible-window');
    bible.state = { currentTextInfo: { id: 'ENGWEB' } };
    bible.innerHTML = '<div class="section JN3"><span class="v" data-id="JN3_16">Hello world</span></div>';
    document.querySelector('.windows-main').appendChild(bible);

    const extension = HighlighterPlugin();
    const toggle = document.querySelector('.highlighter-toggle');
    toggle.click();
    expect(document.body.classList.contains('highlighter-active')).toBe(true);
    toggle.click();
    expect(document.body.classList.contains('highlighter-active')).toBe(false);

    extension.trigger('message', { data: { messagetype: 'ignored' } });
    extension.trigger('message', { data: { messagetype: 'textload', textid: 'ENGWEB', sectionid: 'JN3' } });
    vi.advanceTimersByTime(50);
    expect(bible.querySelector('[data-hl-id="restore"]').textContent).toBe('Hello');
    expect(bible.querySelector('.section').dataset.hlApplied).toBe('true');
  });
});

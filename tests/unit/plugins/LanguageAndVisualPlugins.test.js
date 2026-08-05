import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateConfig } from '@core/config.js';
import AppSettings from '@common/AppSettings.js';
import { Eng2pPlugin } from '@plugins/Eng2pPlugin.js';
import { MorphologySelector } from '@plugins/MorphologySelector.js';
import { VisualFilters } from '@plugins/VisualFilters.js';
import {
  createFilterRow,
  drawTransforms,
  readTransforms,
  removeFilterRow
} from '@plugins/VisualFilterRows.js';

function installPopoverStubs() {
  HTMLElement.prototype.showPopover = vi.fn(function showPopover() { this.dataset.popoverOpen = 'true'; });
  HTMLElement.prototype.hidePopover = vi.fn(function hidePopover() { delete this.dataset.popoverOpen; });
  const nativeMatches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function matches(selector) {
    if (selector === ':popover-open') return this.dataset?.popoverOpen === 'true';
    return nativeMatches.call(this, selector);
  });
}

describe('morphology selector and visual filter rows', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    installPopoverStubs();
  });
  afterEach(() => vi.restoreAllMocks());

  it('selects Greek and Hebrew morphology components and emits selectors', () => {
    const selector = MorphologySelector();
    const updates = [];
    selector.addEventListener('update', event => updates.push(event.detail));
    const input = document.createElement('input');
    selector.currentInput = input;
    selector.updateMorphSelector('N-NSM');
    expect(selector.querySelector('.morph-pos .selected').dataset.value).toBe('N');
    expect(selector.querySelectorAll('.morph-main-row .selected').length).toBeGreaterThan(1);
    selector.querySelector('.morph-pos [data-value="V"]').click();
    expect(input.value.startsWith('V')).toBe(true);
    expect(updates.at(-1)).toBe(input.value);
    selector.setMorphology('morphhb');
    selector.updateMorphSelector('Npmsa');
    expect(selector.querySelector('.morph-pos .selected').dataset.value).toBe('N');
    selector.updateMorphSelector('');
    expect(selector.querySelector('.selected')).toBeNull();
    selector.setMorphology('missing');
  });

  it('round-trips visual transform rows and removes a complete row', () => {
    const grid = document.createElement('div');
    grid.appendChild(createFilterRow());
    const strongInput = grid.querySelector('.visualfilters-strongs input');
    strongInput.value = 'G2424';
    grid.querySelector('.visualfilters-morph input').value = 'V-A?';
    grid.querySelector('.visualfilters-morph select').value = 'robinson';
    grid.querySelector('.style-type').value = 'background';
    const [transform] = readTransforms(grid);
    expect(transform.style).toContain('background-color');
    expect(transform.morphRegExp.test('V-AA')).toBe(true);

    drawTransforms(grid, [transform, { ...transform, strongs: 'H1', styleType: 'underline' }]);
    expect(readTransforms(grid)).toHaveLength(2);
    removeFilterRow(grid.querySelector('.visualfilters-remove'));
    expect(readTransforms(grid)).toHaveLength(1);
  });
});

describe('language and visual plugins', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <div id="config-tools"><div class="config-body"></div></div>
      <div id="config-window"></div>
      <div class="windows-main"></div>`;
    installPopoverStubs();
    vi.useFakeTimers();
    updateConfig({
      enableEng2pPlugin: true,
      eng2pEnableAll: true,
      eng2pDefaultSetting: 'none',
      eng2pShowWindowAtStartup: false,
      enableVisualFilters: true
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    AppSettings.removeValue('docs-config-eng2p-setting');
    AppSettings.removeValue('docs-config-visualfilters');
  });

  it('highlights and replaces second-person plurals in English chapters', () => {
    const chapter = document.createElement('div');
    chapter.className = 'chapter';
    chapter.setAttribute('lang', 'eng-Latn');
    chapter.innerHTML = '<span class="v" data-id="GN1_22">You and yours bless yourselves.</span>';
    document.body.appendChild(chapter);
    const extension = Eng2pPlugin();

    document.querySelector('#eng2p-option-highlight').click();
    expect(chapter.querySelectorAll('.eng2p-highlight').length).toBeGreaterThan(0);
    document.querySelector('#eng2p-option-yall').click();
    expect(chapter.querySelector('.eng2p-corrected').textContent.toLowerCase()).toMatch(/y[’']all/);

    const loaded = document.createElement('div');
    loaded.className = 'chapter';
    loaded.lang = 'eng';
    loaded.innerHTML = '<span class="v" data-id="GN1_22">you</span>';
    extension.trigger('message', { data: { messagetype: 'textload', type: 'bible', content: loaded } });
    expect(loaded.querySelector('.eng2p-corrected')).not.toBeNull();
    extension.trigger('message', { data: { messagetype: 'other', type: 'bible', content: loaded } });
    document.querySelector('#config-eng2p-button').click();
  });

  it('builds visual-filter UI, persists rows, and applies strong/morph styles', () => {
    AppSettings.setValue('docs-config-visualfilters', {
      transforms: [{
        active: true, strongs: 'G2424', morphType: 'robinson', morph: 'V-A?',
        styleType: 'background', styleColor: '#ff0000',
        style: 'background-color: #ff0000;', morphRegExp: {}
      }]
    });
    const extension = VisualFilters();
    const content = document.createElement('div');
    content.className = 'section';
    content.lang = 'grc';
    content.innerHTML = '<l s="G2424" m="V-AA">word</l><l s="G1" m="N-NSM">other</l>';
    extension.trigger('message', { data: { messagetype: 'textload', content } });
    expect(content.querySelector('[s="G2424"]').style.backgroundColor).toBe('rgb(255, 0, 0)');
    extension.trigger('message', { data: { messagetype: 'ignored', content } });

    document.querySelector('#config-visualfilters-button').click();
    const add = document.querySelector('#visualfilters-config > input');
    add.click();
    expect(document.querySelectorAll('.visualfilters-cell[data-row-start="true"]').length).toBe(2);
    const strong = document.querySelector('.visualfilters-strongs input');
    strong.value = 'G1';
    strong.dispatchEvent(new Event('keyup', { bubbles: true }));
    vi.advanceTimersByTime(250);
    const morphInput = document.querySelector('.visualfilters-morph input');
    morphInput.click();
    expect(document.querySelector('.morph-selector').style.display).toBe('');
    document.querySelector('.visualfilters-remove').click();
  });
});

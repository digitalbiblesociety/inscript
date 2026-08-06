import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  determineBookList,
  formatResultLabel,
  renderResultsVisual,
  renderSearchResults,
  renderUsage
} from '@windows/SearchResults.js';

function component(overrides = {}) {
  return {
    refs: {
      input: { value: '' },
      resultsBlock: document.createElement('div'),
      topBlock: { offsetHeight: 44 },
      topUsage: document.createElement('div'),
      topVisual: document.createElement('div'),
      topVisualLabel: document.createElement('span')
    },
    state: {
      textInfo: { type: 'bible', lang: 'eng', divisions: ['GN', 'EX', 'JN'] },
      isLemmaSearch: false,
      ...overrides
    },
    escapeHtml: vi.fn(value => String(value).replace(/</g, '&lt;')),
    formatResultLabel: vi.fn(id => `label:${id}`),
    highlightResultsText: vi.fn(),
    renderResultsVisual: vi.fn(),
    renderLemmaInfo: vi.fn(),
    renderUsage: vi.fn(),
    createHighlights: vi.fn()
  };
}

describe('SearchResults', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chooses testament lists for lemma prefixes and otherwise text divisions', () => {
    const view = component();
    view.refs.input.value = 'G25';
    expect(determineBookList(view, true)).toContain('JN');
    expect(determineBookList(view, true)).not.toContain('GN');
    view.refs.input.value = 'H430';
    expect(determineBookList(view, true)).toContain('GN');
    expect(determineBookList(view, true)).not.toContain('JN');
    view.refs.input.value = 'word';
    expect(determineBookList(view, true)).toBe(view.state.textInfo.divisions);
    expect(determineBookList(view, false)).toBe(view.state.textInfo.divisions);
  });

  it('formats Bible references and leaves non-Bible or invalid ids unchanged', () => {
    const view = component();
    expect(formatResultLabel(view, 'JN3_16', true)).toBe('3:16');
    expect(formatResultLabel(view, 'JN3_16', false)).toContain('John');
    expect(formatResultLabel(view, 'invalid', true)).toBe('invalid');
    view.state.textInfo.type = 'book';
    expect(formatResultLabel(view, 'page-2', true)).toBe('page-2');
  });

  it('sorts, groups, renders, and decorates ordinary search results', () => {
    const view = component();
    const marker = '<span class="v-num">1</span>';
    renderSearchResults(view, [
      { fragmentid: 'JN3_16', html: `${marker}John` },
      { fragmentid: 'GN1_1', html: `${marker}Genesis` },
      { fragmentid: 'GN1_2', html: 'Second' }
    ]);
    const rows = [...view.refs.resultsBlock.querySelectorAll('.search-result-row')];
    expect(rows.map(row => row.dataset.fragmentid)).toEqual(['GN1_1', 'GN1_2', 'JN3_16']);
    expect(view.refs.resultsBlock.querySelectorAll('.search-result-book-header')).toHaveLength(2);
    expect(view.refs.resultsBlock.querySelector('.v-num')).toBeNull();
    expect(view.highlightResultsText).toHaveBeenCalled();
    expect(view.renderResultsVisual).toHaveBeenCalledWith(
      expect.objectContaining({ GN: 2, JN: 1 }), ['GN', 'EX', 'JN']
    );
    expect(view.refs.resultsBlock.style.getPropertyValue('--search-top-height')).toBe('44px');
    expect(view.renderLemmaInfo).not.toHaveBeenCalled();
    expect(view.createHighlights).toHaveBeenCalled();
  });

  it('renders lemma metadata and falls back for unknown books and languages', () => {
    const view = component({
      isLemmaSearch: true,
      textInfo: { type: 'bible', lang: 'missing', divisions: ['ZZ'] }
    });
    view.refs.input.value = 'word';
    renderSearchResults(view, [{ fragmentid: 'ZZ1_1', html: 'result' }]);
    expect(view.refs.resultsBlock.textContent).toContain('ZZ');
    expect(view.renderLemmaInfo).toHaveBeenCalled();
    expect(view.renderUsage).toHaveBeenCalled();
  });

  it('summarizes highlighted phrases by descending frequency', () => {
    const view = component();
    view.refs.resultsBlock.innerHTML = `
      <div class="search-result-row"><span class="highlight">the love of God</span></div>
      <div class="search-result-row"><span class="highlight">love and God</span></div>
      <div class="search-result-row"><span>none</span></div>`;
    renderUsage(view);
    expect(view.refs.topUsage.textContent).toContain('love  God (2)');
    expect(view.refs.topUsage.textContent).toContain('(1)');
    expect(view.refs.topUsage.style.display).toBe('block');
  });

  it('renders proportional visual bars and reattaches the label', () => {
    const view = component();
    renderResultsVisual(view, { GN: 4, EX: 2 }, ['GN', 'EX']);
    const bars = view.refs.topVisual.querySelectorAll('.search-result-book-bar');
    expect(bars).toHaveLength(2);
    expect(bars[0].style.width).toBe('50%');
    expect(bars[0].dataset.count).toBe('4');
    expect(view.refs.topVisual.lastChild).toBe(view.refs.topVisualLabel);
    expect(view.refs.topVisual.style.display).toBe('');
  });
});

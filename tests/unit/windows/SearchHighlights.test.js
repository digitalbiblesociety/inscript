import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  createLemmaHighlightRegExps: vi.fn(),
  highlightTextMatches: vi.fn()
}));

vi.mock('@texts/Search.js', () => ({
  SearchTools: { createLemmaHighlightRegExps: fixtures.createLemmaHighlightRegExps }
}));
vi.mock('@lib/textHighlighter.js', () => ({
  highlightTextMatches: fixtures.highlightTextMatches
}));

import {
  createSearchHighlights,
  highlightLemmaWords,
  highlightResultsText,
  removeSearchHighlights
} from '@windows/SearchHighlights.js';

function component(overrides = {}) {
  const resultsBlock = document.createElement('div');
  resultsBlock.innerHTML = '<div class="search-result-text">one</div><div class="search-result-text">two</div>';
  return {
    refs: { input: { value: 'lemma' }, resultsBlock },
    state: {
      isLemmaSearch: false,
      searchTermsRegExp: [/word/gi],
      currentResults: [],
      ...overrides
    }
  };
}

describe('SearchHighlights', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    fixtures.createLemmaHighlightRegExps.mockReturnValue([/^G1$/]);
    if (!globalThis.CSS) vi.stubGlobal('CSS', {});
    if (!CSS.escape) CSS.escape = value => value;
  });

  it('highlights lemma elements whose Strong numbers match', () => {
    const root = document.createElement('div');
    root.innerHTML = '<l s="G1">one</l><l s="G2">two</l><l>none</l><span>plain</span>';
    const view = component();
    highlightLemmaWords(view, root);
    expect(fixtures.createLemmaHighlightRegExps).toHaveBeenCalledWith('lemma');
    expect(root.querySelector('[s="G1"]').classList.contains('highlight')).toBe(true);
    expect(root.querySelector('[s="G2"]').classList.contains('highlight')).toBe(false);
  });

  it('does nothing when no lemma regexps can be created', () => {
    fixtures.createLemmaHighlightRegExps.mockReturnValue([]);
    const root = document.createElement('div');
    root.innerHTML = '<l s="G1">one</l>';
    highlightLemmaWords(component(), root);
    expect(root.firstChild.classList.contains('highlight')).toBe(false);
  });

  it('highlights each result as lemma or ordinary text', () => {
    const ordinary = component();
    highlightResultsText(ordinary);
    expect(fixtures.highlightTextMatches).toHaveBeenCalledTimes(2);

    fixtures.highlightTextMatches.mockClear();
    const lemma = component({ isLemmaSearch: true });
    lemma.refs.resultsBlock.querySelectorAll('.search-result-text').forEach((el, i) => {
      el.innerHTML = `<l s="G${i + 1}">word</l>`;
    });
    highlightResultsText(lemma);
    expect(lemma.refs.resultsBlock.querySelector('[s="G1"]').classList.contains('highlight')).toBe(true);
    expect(fixtures.highlightTextMatches).not.toHaveBeenCalled();
  });

  it('skips ordinary result highlighting without search terms', () => {
    const view = component({ searchTermsRegExp: null });
    highlightResultsText(view);
    view.state.searchTermsRegExp = [];
    highlightResultsText(view);
    expect(fixtures.highlightTextMatches).not.toHaveBeenCalled();
  });

  it('removes lemma classes and unwraps ordinary highlights', () => {
    document.body.innerHTML = `<div class="BibleWindow">
      <l class="word highlight extra">lemma</l>
      <p>A <span class="highlight">match</span> here</p>
      <span class="highlight">orphan</span>
    </div>`;
    const orphan = document.querySelector('.BibleWindow > span');
    orphan.remove();
    removeSearchHighlights();
    expect(document.querySelector('l').className).not.toContain('highlight');
    expect(document.querySelector('p').textContent).toBe('A match here');
    expect(document.querySelector('p .highlight')).toBeNull();
  });

  it('creates ordinary highlights for all matching rendered fragments', () => {
    document.body.innerHTML = '<div class="BibleWindow"><span class="GN1_1">one</span>' +
      '<span class="GN1_1">two</span></div>';
    const view = component({ currentResults: [{ fragmentid: 'GN1_1' }] });
    createSearchHighlights(view);
    expect(fixtures.highlightTextMatches).toHaveBeenCalledTimes(2);
    expect(fixtures.highlightTextMatches).toHaveBeenCalledWith(
      expect.any(Element), view.state.searchTermsRegExp
    );
  });

  it('creates lemma highlights and skips null result sets', () => {
    document.body.innerHTML = '<div class="BibleWindow"><span class="GN1_1"><l s="G1">one</l></span></div>';
    const view = component({ isLemmaSearch: true, currentResults: null });
    createSearchHighlights(view);
    expect(document.querySelector('l').classList.contains('highlight')).toBe(false);
    view.state.currentResults = [{ fragmentid: 'GN1_1' }];
    createSearchHighlights(view);
    expect(document.querySelector('l').classList.contains('highlight')).toBe(true);
  });
});

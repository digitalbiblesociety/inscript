import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  escapeRegExp: vi.fn(value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  highlightTextMatches: vi.fn(),
  tokenizeWords: vi.fn(text => text.split(/\s+/)),
  wordKey: vi.fn(token => token.toLowerCase())
}));

vi.mock('@lib/textHighlighter.js', () => ({
  escapeRegExp: fixtures.escapeRegExp,
  highlightTextMatches: fixtures.highlightTextMatches
}));
vi.mock('@lib/stopwords.js', () => ({
  tokenizeWords: fixtures.tokenizeWords,
  wordKey: fixtures.wordKey
}));

import {
  createStatisticHighlights,
  removeStatisticHighlights
} from '@windows/StatisticsHighlights.js';

describe('StatisticsHighlights', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    fixtures.tokenizeWords.mockImplementation(text => text.split(/\s+/));
    fixtures.wordKey.mockImplementation(token => token.toLowerCase());
  });

  it('removes classes from lemma highlights and unwraps ordinary highlights', () => {
    document.body.innerHTML = `<div class="BibleWindow">
      <l class="highlight highlight-stats lemma-highlight other">Word</l>
      <p>A <span class="highlight-stats">word</span> here</p>
    </div>`;
    removeStatisticHighlights();
    expect(document.querySelector('l').className).toBe('other');
    expect(document.querySelector('p').textContent).toBe('A word here');
    expect(document.querySelector('p span')).toBeNull();
  });

  it('matches normalized lemma tokens in every current section', () => {
    document.body.innerHTML = `<div class="BibleWindow">
      <div class="GN1"><l>Other WORD</l><l>Nope</l></div>
      <div class="GN1"><l>word</l></div>
    </div>`;
    const component = { state: { sectionid: 'GN1', textInfo: { lang: 'eng' } } };
    const first = createStatisticHighlights(component, { key: 'word', word: 'Word' });
    expect(document.querySelectorAll('l.highlight-stats')).toHaveLength(2);
    expect(document.querySelectorAll('l.highlight-stats')[0].classList.contains('lemma-highlight')).toBe(true);
    expect(fixtures.tokenizeWords).toHaveBeenCalledWith('Other WORD', 'eng');
    expect(first).toBe(document.querySelector('.BibleWindow .highlight-stats'));
  });

  it('uses text highlighting when a section has no lemma markup', () => {
    document.body.innerHTML = '<div class="BibleWindow"><div class="GN1">Word and word.</div></div>';
    const section = document.querySelector('.GN1');
    const component = { state: { sectionid: 'GN1', textInfo: null } };
    expect(createStatisticHighlights(component, { key: 'word', word: 'wo.rd' })).toBeNull();
    expect(fixtures.escapeRegExp).toHaveBeenCalledWith('wo.rd');
    expect(fixtures.highlightTextMatches).toHaveBeenCalledWith(
      section, [expect.any(RegExp)], 'highlight highlight-stats'
    );
  });
});

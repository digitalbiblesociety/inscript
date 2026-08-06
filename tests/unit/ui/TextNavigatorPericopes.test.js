import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  loadPericopesByBook: vi.fn(),
  pericopeLocaleFor: vi.fn((language) => ({ eng: 'en', en: 'en', spa: 'es', es: 'es' })[language] ?? null)
}));

vi.mock('@bible/Pericopes.js', () => ({
  loadPericopesByBook: fixtures.loadPericopesByBook,
  pericopeLocaleFor: fixtures.pericopeLocaleFor
}));
vi.mock('@lib/i18n.js', () => ({ i18n: { t: vi.fn(() => 'Results') } }));

import {
  applyFilter,
  ensurePericopes,
  filterBooks,
  highlightCurrentPassage,
  hasPericopeTranslation,
  renderActiveBookPassages,
  renderSearchResults,
  setActiveBook
} from '@ui/TextNavigatorPericopes.js';

const groups = [
  { bookid: 'GN', pericopes: [
    { title: 'Creation', sectionid: 'GN1', fragmentid: 'GN1_1', chapter: 1, verse: 1 },
    { title: 'The Fall', sectionid: 'GN3', fragmentid: 'GN3_1', chapter: 3, verse: 1 }
  ] },
  { bookid: 'JN', pericopes: [
    { title: 'New Birth', sectionid: 'JN3', fragmentid: 'JN3_1', chapter: 3, verse: 1 },
    { title: 'Living Water', sectionid: 'JN4', fragmentid: 'JN4_1', chapter: 4, verse: 1 }
  ] }
];

function controller() {
  const divisions = document.createElement('div');
  divisions.innerHTML = `
    <div class="text-navigator-division-header">OT</div>
    <div class="text-navigator-division divisionid-GN" data-id="GN" data-name="genesis"></div>
    <div class="text-navigator-division-header">NT</div>
    <div class="text-navigator-division divisionid-JN" data-id="JN" data-name="john"></div>`;
  const periList = document.createElement('div');
  return {
    textInfo: { lang: 'eng', divisions: ['GN', 'JN'], sections: ['GN1', 'JN3', 'JN4'] },
    activeBookId: null,
    refs: {
      divisions, changer: divisions,
      periHeader: document.createElement('div'), periList,
      filter: { value: '' }
    },
    hasPericopeTranslation: vi.fn(() => true),
    renderSearchResults: vi.fn(() => new Set(['JN'])),
    renderActiveBookPassages: vi.fn(),
    highlightCurrentPassage: vi.fn()
  };
}

describe('TextNavigatorPericopes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    fixtures.loadPericopesByBook.mockResolvedValue(groups);
    ensurePericopes('eng');
    await Promise.resolve();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('loads pericopes only once', async () => {
    // The module may already be initialized by beforeEach; repeated calls are intentionally no-ops.
    ensurePericopes('eng', vi.fn());
    expect(fixtures.loadPericopesByBook).toHaveBeenCalledOnce();
  });

  it('recognizes translated languages and rejects unsupported languages', () => {
    for (const lang of ['eng', 'en', 'spa', 'es']) {
      expect(hasPericopeTranslation({ textInfo: { lang } })).toBe(true);
    }
    expect(hasPericopeTranslation({ textInfo: { lang: 'swh' } })).toBe(false);
    expect(hasPericopeTranslation({ textInfo: null })).toBe(false);
  });

  it('renders only available passages for the active book', () => {
    const view = controller();
    renderActiveBookPassages(view, 'GN');
    expect(view.refs.periHeader.textContent).toBeTruthy();
    expect(view.refs.periList.querySelectorAll('.peri-item')).toHaveLength(1);
    renderActiveBookPassages(view, null);
    expect(view.refs.periHeader.textContent).toBe('');
  });

  it('renders grouped search results while respecting divisions and sections', () => {
    const view = controller();
    const ids = renderSearchResults(view, 'birth');
    expect([...ids]).toEqual(['JN']);
    expect(view.refs.periHeader.textContent).toBe('Results');
    expect(view.refs.periList.classList.contains('peri-grouped')).toBe(true);
    expect(view.refs.periList.querySelector('.peri-book-header').textContent).toBeTruthy();
    expect(renderSearchResults(view, 'missing').size).toBe(0);
  });

  it('filters book divisions and their group headers', () => {
    const view = controller();
    filterBooks(view, 'john');
    const divisions = view.refs.divisions.querySelectorAll('.text-navigator-division');
    expect(divisions[0].style.display).toBe('none');
    expect(divisions[1].style.display).toBe('');
    const headers = view.refs.divisions.querySelectorAll('.text-navigator-division-header');
    expect(headers[0].style.display).toBe('none');
    expect(headers[1].style.display).toBe('');
    filterBooks(view, '');
    expect(divisions[0].style.display).toBe('');
  });

  it('switches between passage search and ordinary book filtering', () => {
    const view = controller();
    view.refs.filter.value = ' Birth ';
    applyFilter(view);
    expect(view.renderSearchResults).toHaveBeenCalledWith('birth');
    expect(view.refs.divisions.querySelector('.divisionid-GN').style.display).toBe('none');

    view.hasPericopeTranslation.mockReturnValue(false);
    view.refs.filter.value = 'john';
    applyFilter(view);
    expect(view.renderActiveBookPassages).not.toHaveBeenCalled();
    view.hasPericopeTranslation.mockReturnValue(true);
    view.refs.filter.value = '';
    applyFilter(view);
    expect(view.renderActiveBookPassages).toHaveBeenCalledWith(view.activeBookId);
  });

  it('highlights the nearest preceding passage and clears the old one', () => {
    const view = controller();
    renderActiveBookPassages(view, 'JN');
    const items = view.refs.periList.querySelectorAll('.peri-item');
    items[0].classList.add('current');
    highlightCurrentPassage(view, 'JN4_5');
    expect(items[0].classList.contains('current')).toBe(false);
    expect(items[1].classList.contains('current')).toBe(true);
    expect(items[1].scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    highlightCurrentPassage(view, null);
    highlightCurrentPassage(view, 'GN1_1');
  });

  it('updates the active book, scrolls its division, and refreshes passages when eligible', () => {
    const view = controller();
    const division = view.refs.divisions.querySelector('.divisionid-JN');
    Object.defineProperty(division, 'offsetTop', { value: 100 });
    Object.defineProperty(view.refs.divisions, 'offsetTop', { value: 10 });
    setActiveBook(view, 'JN', 'JN3_1');
    expect(view.activeBookId).toBe('JN');
    expect(view.lastFragmentid).toBe('JN3_1');
    expect(view.refs.divisions.scrollTop).toBe(82);
    expect(view.renderActiveBookPassages).toHaveBeenCalledWith('JN');
    expect(view.highlightCurrentPassage).toHaveBeenCalledWith('JN3_1');

    view.refs.filter.value = 'query';
    view.renderActiveBookPassages.mockClear();
    setActiveBook(view, 'GN');
    expect(view.lastFragmentid).toBeNull();
    expect(view.renderActiveBookPassages).not.toHaveBeenCalled();
  });
});

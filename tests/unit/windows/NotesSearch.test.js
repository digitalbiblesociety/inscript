import { beforeEach, describe, expect, it } from 'vitest';
import { filterAndSortNotes, searchNotes, SORT_MODES } from '@windows/NotesWindow/query.js';
import {
  hideSearchSuggestions,
  selectSuggestion,
  updateSearchSuggestions,
  updateSuggestionSelection
} from '@windows/NotesWindow/search.js';

const notes = [
  { id: 'a', title: 'Grace', reference: 'JN1_1', pinned: false, modified: 20, created: 1 },
  { id: 'b', title: 'Alpha', reference: null, pinned: true, modified: 10, created: 3 },
  { id: 'c', title: 'Mercy', reference: 'JN1_1', pinned: false, modified: 30, created: 2 }
];
const text = { a: 'Beginning', b: 'Standalone body', c: 'Love and truth' };
const getPlainText = id => text[id];

describe('notes query helpers', () => {
  it('exposes the supported sort modes and searches titles and cached text', () => {
    expect(SORT_MODES).toEqual(['modified', 'created', 'title']);
    expect(searchNotes(notes, 'grace', getPlainText).map(n => n.id)).toEqual(['a']);
    expect(searchNotes(notes, 'love', getPlainText).map(n => n.id)).toEqual(['c']);
    expect(searchNotes(notes, 'a', getPlainText, 2)).toHaveLength(2);
    expect(searchNotes(notes, '  ', getPlainText)).toEqual([]);
    expect(searchNotes(notes, 'body').map(n => n.id)).toEqual([]);
  });

  it('filters linked, standalone, and current-reference notes', () => {
    expect(filterAndSortNotes(notes, { filterMode: 'linked', getPlainText }).map(n => n.id)).toEqual(['c', 'a']);
    expect(filterAndSortNotes(notes, { filterMode: 'standalone', getPlainText }).map(n => n.id)).toEqual(['b']);
    expect(filterAndSortNotes(notes, {
      filterMode: 'reference', currentReference: 'JN1_1', getPlainText
    }).map(n => n.id)).toEqual(['c', 'a']);
  });

  it('sorts all modes, keeps pinned notes first, and falls back to modified', () => {
    expect(filterAndSortNotes(notes, { sortMode: 'title', getPlainText }).map(n => n.id)).toEqual(['b', 'a', 'c']);
    expect(filterAndSortNotes(notes, { sortMode: 'created', getPlainText }).map(n => n.id)).toEqual(['b', 'c', 'a']);
    expect(filterAndSortNotes(notes, { sortMode: 'unknown', getPlainText }).map(n => n.id)).toEqual(['b', 'c', 'a']);
    expect(filterAndSortNotes(notes, { searchQuery: 'truth', getPlainText }).map(n => n.id)).toEqual(['c']);
  });
});

describe('notes search suggestions', () => {
  let state;
  let refs;

  beforeEach(() => {
    state = { searchSuggestions: [], selectedSuggestionIndex: -1, searchQuery: '' };
    refs = {
      search: document.createElement('input'),
      searchSuggestions: document.createElement('div')
    };
  });

  it('renders matches and initially selects the first', () => {
    refs.search.value = 'love';
    updateSearchSuggestions(state, refs, notes, getPlainText);
    expect(state.searchSuggestions.map(n => n.id)).toEqual(['c']);
    expect(state.selectedSuggestionIndex).toBe(0);
    expect(refs.searchSuggestions.classList.contains('visible')).toBe(true);
    expect(refs.searchSuggestions.querySelector('.notes-suggestion-item').classList.contains('selected')).toBe(true);
  });

  it('hides suggestions for blank or unmatched input', () => {
    refs.searchSuggestions.classList.add('visible');
    refs.search.value = ' ';
    updateSearchSuggestions(state, refs, notes, getPlainText);
    expect(refs.searchSuggestions.classList.contains('visible')).toBe(false);

    refs.search.value = 'unfindable';
    updateSearchSuggestions(state, refs, notes, getPlainText);
    expect(state.selectedSuggestionIndex).toBe(-1);
  });

  it('wraps keyboard selection and updates selected classes', () => {
    state.searchSuggestions = notes;
    refs.searchSuggestions.innerHTML = notes.map(() => '<div class="notes-suggestion-item"></div>').join('');
    updateSuggestionSelection(state, refs, -1);
    expect(state.selectedSuggestionIndex).toBe(2);
    updateSuggestionSelection(state, refs, 3);
    expect(state.selectedSuggestionIndex).toBe(0);

    state.searchSuggestions = [];
    updateSuggestionSelection(state, refs, 1);
    expect(state.selectedSuggestionIndex).toBe(0);
  });

  it('selects a valid suggestion and clears the search', () => {
    state.searchSuggestions = notes;
    refs.search.value = 'mercy';
    state.searchQuery = 'mercy';
    expect(selectSuggestion(state, refs, 2)).toBe('c');
    expect(refs.search.value).toBe('');
    expect(state.searchQuery).toBe('');
    expect(state.searchSuggestions).toEqual([]);
    expect(selectSuggestion(state, refs, -1)).toBeNull();
  });

  it('explicitly clears dropdown state', () => {
    state.searchSuggestions = notes;
    refs.searchSuggestions.innerHTML = '<div></div>';
    refs.searchSuggestions.classList.add('visible');
    hideSearchSuggestions(state, refs);
    expect(refs.searchSuggestions.innerHTML).toBe('');
    expect(state.selectedSuggestionIndex).toBe(-1);
  });
});

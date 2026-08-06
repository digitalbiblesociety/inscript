import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@lib/i18n.js';
import {
  applyReferenceSuggestion,
  handleSearchInput,
  handleSearchKeydown,
  hideSuggestions,
  selectSuggestion,
  showSuggestions
} from '@windows/MapWindow/SearchSuggestions.js';

const locations = [
  { name: 'Jerusalem', altNames: ['Zion <City>'], verses: ['JN3_16', 'PS122_2'] },
  { name: 'Jericho', verses: ['JS6_1'] },
  { name: 'Jerahmeel', verses: [] },
  { name: 'Bethlehem', verses: ['MT2_1'] }
];

function makeComponent() {
  const input = document.createElement('input');
  const suggestions = document.createElement('div');
  const mapPanel = {
    locationData: locations,
    filterBySection: vi.fn(),
    openLocation: vi.fn()
  };

  return {
    refs: {
      mapSearchInput: input,
      searchSuggestions: suggestions
    },
    state: {
      currentSuggestions: [],
      referenceSuggestion: null,
      selectedSuggestionIndex: -1
    },
    mapPanel,
    setMode: vi.fn(),
    updateEmptyState: vi.fn(),
    escapeHtml: (value) => String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  };
}

function keyEvent(key) {
  return { key, preventDefault: vi.fn() };
}

describe('MapWindow search suggestions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(i18n, 't').mockImplementation((key, values = {}) =>
      key === 'windows.map.placesin'
        ? `Places in ${values.reference}`
        : `${values.count} more results`
    );
  });

  it('hides suggestions for short input or unavailable map data', () => {
    const component = makeComponent();
    component.refs.mapSearchInput.value = ' j ';
    component.state.currentSuggestions = [{ location: locations[0] }];

    handleSearchInput(component);
    expect(component.refs.searchSuggestions.style.display).toBe('none');
    expect(component.state.currentSuggestions).toEqual([]);

    component.refs.mapSearchInput.value = 'Jerusalem';
    component.mapPanel = null;
    handleSearchInput(component);
    expect(component.state.referenceSuggestion).toBeNull();
  });

  it('renders escaped primary and alternate names plus a remaining-results row', () => {
    const component = makeComponent();
    component.refs.mapSearchInput.value = 'Zi';

    handleSearchInput(component, 1);

    expect(component.state.currentSuggestions).toHaveLength(1);
    expect(component.refs.searchSuggestions.style.display).toBe('block');
    expect(component.refs.searchSuggestions.innerHTML).toContain('Zion &lt;City&gt; → Jerusalem');
    expect(component.refs.searchSuggestions.innerHTML).toContain('2 verses');

    component.refs.mapSearchInput.value = 'Jer';
    handleSearchInput(component, 1);
    expect(component.refs.searchSuggestions.innerHTML).toContain('more results');
  });

  it('offers a Bible-reference filter only when the passage has mapped places', () => {
    const component = makeComponent();
    component.refs.mapSearchInput.value = 'John 3';

    handleSearchInput(component);
    expect(component.state.referenceSuggestion).toEqual({
      sectionid: 'JN3',
      count: 1,
      label: 'Places in John 3'
    });
    expect(component.refs.searchSuggestions.innerHTML).toContain('map-suggestion-reference');
    expect(component.refs.searchSuggestions.innerHTML).toContain('1 locations');

    component.refs.mapSearchInput.value = 'John 4';
    handleSearchInput(component);
    expect(component.state.referenceSuggestion).toBeNull();
    expect(component.refs.searchSuggestions.style.display).toBe('none');
  });

  it('applies and clears a reference suggestion', () => {
    const component = makeComponent();

    applyReferenceSuggestion(component);
    expect(component.setMode).not.toHaveBeenCalled();

    component.state.referenceSuggestion = { sectionid: 'JN3', count: 1 };
    applyReferenceSuggestion(component);

    expect(component.setMode).toHaveBeenCalledWith('passage');
    expect(component.mapPanel.filterBySection).toHaveBeenCalledWith('JN3');
    expect(component.updateEmptyState).toHaveBeenCalled();
    expect(component.refs.searchSuggestions.style.display).toBe('none');
    expect(component.state.referenceSuggestion).toBeNull();
  });

  it('renders nothing and hides when there are no result rows', () => {
    const component = makeComponent();
    component.refs.searchSuggestions.style.display = 'block';

    showSuggestions(component, { results: [], total: 0, reference: null });

    expect(component.refs.searchSuggestions.style.display).toBe('none');
    expect(component.state.currentSuggestions).toEqual([]);
    expect(component.state.selectedSuggestionIndex).toBe(-1);
  });

  it('moves selection through reference and location rows with boundary clamping', () => {
    const component = makeComponent();
    const results = locations.slice(0, 2).map(location => ({ location, altName: null }));
    showSuggestions(component, {
      results,
      total: results.length,
      reference: { sectionid: 'JN3', count: 1, label: 'Places in John 3' }
    });

    const down = keyEvent('ArrowDown');
    handleSearchKeydown(component, down);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(component.state.selectedSuggestionIndex).toBe(0);
    expect(component.refs.searchSuggestions.querySelector('[data-index="0"]').classList).toContain('selected');

    handleSearchKeydown(component, keyEvent('ArrowDown'));
    handleSearchKeydown(component, keyEvent('ArrowDown'));
    expect(component.state.selectedSuggestionIndex).toBe(1);

    handleSearchKeydown(component, keyEvent('ArrowUp'));
    handleSearchKeydown(component, keyEvent('ArrowUp'));
    expect(component.state.selectedSuggestionIndex).toBe(-1);
    const reference = component.refs.searchSuggestions.querySelector('.map-suggestion-reference');
    expect(reference.classList).toContain('selected');
    expect(reference.getAttribute('aria-selected')).toBe('true');
  });

  it('does not select a reference row when none is present', () => {
    const component = makeComponent();
    showSuggestions(component, {
      results: [{ location: locations[0], altName: null }],
      total: 1,
      reference: null
    });

    handleSearchKeydown(component, keyEvent('ArrowUp'));
    expect(component.state.selectedSuggestionIndex).toBe(0);
    expect(component.refs.searchSuggestions.querySelector('[data-index="0"]').getAttribute('aria-selected')).toBe('true');
  });

  it('opens the selected location, writes its canonical name, and hides the menu', () => {
    const component = makeComponent();
    showSuggestions(component, {
      results: locations.slice(0, 2).map(location => ({ location, altName: null })),
      total: 2,
      reference: null
    });
    selectSuggestion(component, 1);

    const enter = keyEvent('Enter');
    handleSearchKeydown(component, enter);

    expect(enter.preventDefault).toHaveBeenCalled();
    expect(component.mapPanel.openLocation).toHaveBeenCalledWith(locations[1]);
    expect(component.refs.mapSearchInput.value).toBe('Jericho');
    expect(component.refs.searchSuggestions.style.display).toBe('none');
  });

  it('opens the top location when Enter has no explicit selection', () => {
    const component = makeComponent();
    showSuggestions(component, {
      results: [{ location: locations[0], altName: null }],
      total: 1,
      reference: null
    });

    handleSearchKeydown(component, keyEvent('Enter'));
    expect(component.mapPanel.openLocation).toHaveBeenCalledWith(locations[0]);
  });

  it('prefers an unselected reference row over the top location', () => {
    const component = makeComponent();
    showSuggestions(component, {
      results: [{ location: locations[0], altName: null }],
      total: 1,
      reference: { sectionid: 'JN3', count: 1, label: 'Places in John 3' }
    });

    handleSearchKeydown(component, keyEvent('Enter'));

    expect(component.mapPanel.filterBySection).toHaveBeenCalledWith('JN3');
    expect(component.mapPanel.openLocation).not.toHaveBeenCalled();
  });

  it('dismisses on Escape and ignores unrelated keys or an empty state', () => {
    const component = makeComponent();
    const emptyEvent = keyEvent('ArrowDown');
    handleSearchKeydown(component, emptyEvent);
    expect(emptyEvent.preventDefault).not.toHaveBeenCalled();

    showSuggestions(component, {
      results: [{ location: locations[0], altName: null }],
      total: 1,
      reference: null
    });
    const unrelated = keyEvent('Tab');
    handleSearchKeydown(component, unrelated);
    expect(unrelated.preventDefault).not.toHaveBeenCalled();
    expect(component.refs.searchSuggestions.style.display).toBe('block');

    handleSearchKeydown(component, keyEvent('Escape'));
    expect(component.refs.searchSuggestions.style.display).toBe('none');
    expect(component.state.currentSuggestions).toEqual([]);
  });

  it('safely handles a selected row when the map panel is absent', () => {
    const component = makeComponent();
    showSuggestions(component, {
      results: [{ location: locations[0], altName: null }],
      total: 1,
      reference: null
    });
    component.mapPanel = null;

    expect(() => handleSearchKeydown(component, keyEvent('Enter'))).not.toThrow();
    expect(component.refs.mapSearchInput.value).toBe('Jerusalem');
  });

  it('hideSuggestions resets all transient state', () => {
    const component = makeComponent();
    component.state.currentSuggestions = [{ location: locations[0] }];
    component.state.referenceSuggestion = { sectionid: 'JN3' };
    component.state.selectedSuggestionIndex = 0;

    hideSuggestions(component);

    expect(component.state).toEqual({
      currentSuggestions: [],
      referenceSuggestion: null,
      selectedSuggestionIndex: -1
    });
  });
});

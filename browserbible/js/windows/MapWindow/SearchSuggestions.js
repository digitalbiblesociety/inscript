/** Location search box: suggestion dropdown state and rendering for MapWindow. */

import { i18n } from '../../lib/i18n.js';
import { searchLocations, parseReferenceQuery } from './fuzzy-search.js';
import { getLocationsForReference } from './map-data.js';

export function handleSearchInput(component, limit = 8) {
  const value = component.refs.mapSearchInput.value.trim();
  if (value.length < 2 || !component.mapPanel?.locationData) {
    hideSuggestions(component);
    return;
  }

  const { results, total } = searchLocations(value, component.mapPanel.locationData, limit);

  // A query like "John 3" also offers "Places in John 3" (map-only filter)
  let reference = null;
  const sectionid = parseReferenceQuery(value);
  if (sectionid) {
    const count = getLocationsForReference(component.mapPanel.locationData, sectionid).length;
    if (count > 0) {
      reference = { sectionid, count, label: i18n.t('windows.map.placesin', { reference: value }) };
    }
  }

  showSuggestions(component, { results, total, reference });
}

export function applyReferenceSuggestion(component) {
  const ref = component.state.referenceSuggestion;
  if (!ref) return;
  component.setMode('passage');
  component.mapPanel?.filterBySection(ref.sectionid);
  component.updateEmptyState();
  hideSuggestions(component);
}

function openSelectedSuggestion(component) {
  // No explicit selection: a reference suggestion wins, then the top hit
  if (component.state.selectedSuggestionIndex < 0 && component.state.referenceSuggestion) {
    applyReferenceSuggestion(component);
    return;
  }
  const entry = component.state.currentSuggestions[component.state.selectedSuggestionIndex] ||
                component.state.currentSuggestions[0];
  if (entry) {
    component.mapPanel?.openLocation(entry.location);
    component.refs.mapSearchInput.value = entry.location.name;
  }
  hideSuggestions(component);
}

export function handleSearchKeydown(component, e) {
  if (!component.state.currentSuggestions.length && !component.state.referenceSuggestion) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectSuggestion(component,
      Math.min(component.state.selectedSuggestionIndex + 1, component.state.currentSuggestions.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    // Index -1 selects the reference row when one is shown
    const min = component.state.referenceSuggestion ? -1 : 0;
    selectSuggestion(component, Math.max(component.state.selectedSuggestionIndex - 1, min));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    openSelectedSuggestion(component);
  } else if (e.key === 'Escape') {
    hideSuggestions(component);
  }
}

function suggestionRows(component, { results, total, reference }) {
  const rows = [];

  if (reference) {
    rows.push(`<div class="map-suggestion-reference" role="option" aria-selected="false">
      <span>${component.escapeHtml(reference.label)}</span>
      <span class="verse-count">${reference.count} locations</span>
    </div>`);
  }

  rows.push(...results.map(({ location, altName }, i) => {
    const display = altName ? `${altName} → ${location.name}` : location.name;
    return `<div class="map-suggestion-item" role="option" aria-selected="false" data-index="${i}">
      <span>${component.escapeHtml(display)}</span>
      <span class="verse-count">${location.verses?.length || 0} verses</span>
    </div>`;
  }));

  const remaining = total - results.length;
  if (remaining > 0) {
    rows.push(`<div class="map-suggestion-more" role="button">
      ${component.escapeHtml(i18n.t('windows.map.moreresults', { count: remaining }))}
    </div>`);
  }

  return rows;
}

export function showSuggestions(component, { results, total, reference }) {
  component.state.currentSuggestions = results;
  component.state.referenceSuggestion = reference || null;
  component.state.selectedSuggestionIndex = -1;

  if (!results.length && !reference) {
    component.refs.searchSuggestions.style.display = 'none';
    return;
  }

  component.refs.searchSuggestions.innerHTML = suggestionRows(component, { results, total, reference }).join('');
  component.refs.searchSuggestions.style.display = 'block';
}

export function hideSuggestions(component) {
  component.refs.searchSuggestions.style.display = 'none';
  component.state.currentSuggestions = [];
  component.state.referenceSuggestion = null;
  component.state.selectedSuggestionIndex = -1;
}

export function selectSuggestion(component, index) {
  const reference = component.refs.searchSuggestions.querySelector('.map-suggestion-reference');
  if (reference) {
    reference.classList.toggle('selected', index === -1);
    reference.setAttribute('aria-selected', String(index === -1));
  }
  component.refs.searchSuggestions.querySelectorAll('.map-suggestion-item').forEach((item, i) => {
    item.classList.toggle('selected', i === index);
    item.setAttribute('aria-selected', String(i === index));
  });
  component.state.selectedSuggestionIndex = index;
}

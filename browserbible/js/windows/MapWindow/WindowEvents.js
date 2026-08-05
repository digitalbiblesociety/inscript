/** DOM event wiring for MapWindow's chrome: search box, mode toggles, detail area. */

import {
  handleSearchInput,
  handleSearchKeydown,
  hideSuggestions,
  applyReferenceSuggestion,
  selectSuggestion
} from './SearchSuggestions.js';

function onModeToggleClick(component, e) {
  const btn = e.target.closest('.map-mode-btn');
  if (!btn) return;
  component.setMode(btn.dataset.mode);
  if (btn.dataset.mode !== 'journeys' || !component.mapPanel) return;

  // First entry shows the first journey immediately; re-entry restores
  // the stop list of the journey already selected in the dropdown
  const activeIds = component.mapPanel.getActiveJourneyIds();
  if (activeIds.length === 0) {
    const first = component.refs.journeyMenu.querySelector('.map-journey-menu-item');
    if (first) component.selectJourney(first.dataset.journeyId);
  } else {
    component.showJourneyStops(component.mapPanel.getJourney(activeIds[0]));
  }
}

function onJourneyMenuClick(component, e) {
  const item = e.target.closest('.map-journey-menu-item');
  if (item) component.selectJourney(item.dataset.journeyId);
}

function onDocumentClick(component, e) {
  if (component.refs.journeyMenu.style.display !== 'block') return;
  if (e.target.closest('.map-journey-list, .map-journey-menu')) return;
  component.toggleJourneyMenu(false);
}

function onHeaderKeydown(component, e) {
  if (e.key === 'Escape' && component.refs.journeyMenu.style.display === 'block') {
    e.preventDefault();
    component.toggleJourneyMenu(false);
    component.refs.journeyList.focus();
  }
}

function onEraFilterClick(component, e) {
  const btn = e.target.closest('.map-era-btn');
  if (!btn) return;
  component.refs.eraFilter.querySelectorAll('.map-era-btn').forEach(b => {
    b.classList.toggle('active', b === btn);
    b.setAttribute('aria-pressed', String(b === btn));
  });
  component.mapPanel?.setExploreEra(btn.dataset.era);
}

function onDetailBackClick(component) {
  // From a stop's location detail, back returns to the journey stop list
  if (component._detailFromJourney && component._journeyListJourney) {
    component.showJourneyStops(component._journeyListJourney);
    component.mapPanel?.resetMarkerOpacity();
    return;
  }
  component.hideDetail();
}

// Escape anywhere in the window body closes the open detail panel
function onMainKeydown(component, e) {
  if (e.key === 'Escape' && !component.refs.detail.classList.contains('hidden')) {
    e.preventDefault();
    component.hideDetail();
  }
}

// Click on the map background (not a drag, not a marker/cluster/control) closes it too
function onMapContainerClick(component, e) {
  if (component.refs.detail.classList.contains('hidden')) return;
  if (e.target.closest('.map-marker, .map-cluster, .map-zoom-controls, .map-empty-state, .journey-stop')) return;
  const moved = component._pointerDown
    ? Math.hypot(e.clientX - component._pointerDown.x, e.clientY - component._pointerDown.y)
    : 0;
  if (moved < 5) component.hideDetail();
}

function onDetailContentClick(component, e) {
  const coloc = e.target.closest('.map-detail-colocated-item');
  if (coloc) {
    const idx = parseInt(coloc.getAttribute('data-index'), 10);
    const loc = component.refs.detail._colocatedLocations?.[idx];
    if (loc) component.mapPanel?.openLocation(loc);
    return;
  }
  const link = e.target.closest('.verse');
  if (link) {
    component.trigger('globalmessage', {
      type: 'globalmessage',
      target: component,
      data: { messagetype: 'nav', type: 'bible', locationInfo: {
        sectionid: link.getAttribute('data-sectionid'),
        fragmentid: link.getAttribute('data-fragmentid')
      }}
    });
    return;
  }
  // Journey stop rows (outside the verse links) open the stop's location
  const stopRow = e.target.closest('.map-journey-stop-row');
  if (stopRow && component._journeyListJourney) {
    const stop = component._journeyListJourney.stops[
      parseInt(stopRow.getAttribute('data-stop-index'), 10)];
    if (stop) component.mapPanel?.openStop(stop);
  }
}

function onSuggestionsClick(component, e) {
  if (e.target.closest('.map-suggestion-reference')) {
    applyReferenceSuggestion(component);
    return;
  }
  if (e.target.closest('.map-suggestion-more')) {
    // show 50 more per click; the dropdown scrolls
    handleSearchInput(component, component.state.currentSuggestions.length + 50);
    return;
  }
  const item = e.target.closest('.map-suggestion-item');
  if (!item) return;
  const index = parseInt(item.getAttribute('data-index'), 10);
  const entry = component.state.currentSuggestions[index];
  if (entry) {
    component.mapPanel?.openLocation(entry.location);
    component.refs.mapSearchInput.value = entry.location.name;
    hideSuggestions(component);
  }
}

function onSuggestionsMouseEnter(component, e) {
  const item = e.target.closest('.map-suggestion-item');
  if (!item) return;
  selectSuggestion(component, parseInt(item.getAttribute('data-index'), 10));
}

// Clicking a highlighted place name in any Bible window opens it on the map.
// The .linked-location spans only exist while this window is alive (created
// by MapPanel.highlight()), so this window owns the listener.
function onLinkedLocationClick(component, e) {
  const span = e.target.closest('.linked-location');
  if (!span || !component.mapPanel?.locationData) return;

  const name = span.getAttribute('data-location-name') || span.textContent;
  const verseid = span.closest('.verse, .v')?.getAttribute('data-id');

  const location =
    (verseid && component.mapPanel.locationDataByVerse?.[verseid]?.find(l => l.name === name)) ||
    component.mapPanel.locationData.find(l => l.name === name);

  if (location) component.mapPanel.openLocation(location);
}

export function attachMapWindowListeners(component) {
  const refs = component.refs;

  component.addListener(refs.mapSearchInput, 'input', () => handleSearchInput(component));
  component.addListener(refs.mapSearchInput, 'keydown', (e) => handleSearchKeydown(component, e));
  component.addListener(refs.mapSearchInput, 'blur', () => {
    setTimeout(() => hideSuggestions(component), 150);
  });

  component.addListener(refs.modeToggle, 'click', (e) => onModeToggleClick(component, e));

  // Journey dropdown (replaces the search box while in journeys mode)
  component.addListener(refs.journeyList, 'click', () => component.toggleJourneyMenu());
  component.addListener(refs.journeyMenu, 'click', (e) => onJourneyMenuClick(component, e));
  component.addListener(document, 'click', (e) => onDocumentClick(component, e));
  component.addListener(refs.header, 'keydown', (e) => onHeaderKeydown(component, e));

  component.addListener(refs.eraFilter, 'click', (e) => onEraFilterClick(component, e));

  component.addListener(refs.emptyExploreBtn, 'click', () => component.setMode('explore'));

  component.addListener(refs.detailBack, 'click', () => onDetailBackClick(component));
  component.addListener(refs.main, 'keydown', (e) => onMainKeydown(component, e));

  component.addListener(refs.mapContainer, 'mousedown', (e) => {
    component._pointerDown = { x: e.clientX, y: e.clientY };
  });
  component.addListener(refs.mapContainer, 'click', (e) => onMapContainerClick(component, e));
  component.addListener(refs.detailContent, 'click', (e) => onDetailContentClick(component, e));

  // Keep focus in the input while clicking inside the dropdown (blur would close it)
  component.addListener(refs.searchSuggestions, 'mousedown', (e) => e.preventDefault());
  component.addListener(refs.searchSuggestions, 'click', (e) => onSuggestionsClick(component, e));
  component.addListener(refs.searchSuggestions, 'mouseenter',
    (e) => onSuggestionsMouseEnter(component, e), { capture: true });

  const windowsMain = document.querySelector('.windows-main');
  if (windowsMain) {
    component.addListener(windowsMain, 'click', (e) => onLinkedLocationClick(component, e));
  }

  component.on('message', (e) => component.handleMessage(e));
  component.on('globalmessage', (e) => component.handleGlobalMessage(e));
}

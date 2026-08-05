/** Window chrome around MapPanel: search, mode toggles, and message handling. */

import { BaseWindow, registerWindowComponent } from '../BaseWindow.js';
import { buildDetailHTML, hydrateVerseTexts } from './detail-panel.js';
import { MapPanel } from './map-panel.js';
import { DEFAULT_CENTER } from './constants.js';
import { attachMapWindowListeners } from './WindowEvents.js';
import { hideSuggestions } from './SearchSuggestions.js';
import {
  renderJourneyMenu,
  renderJourneySelection,
  toggleJourneyMenu as toggleJourneyMenuUI,
  showJourneyStops as showJourneyStopsUI
} from './JourneyUi.js';
import {
  updateEmptyState as updateEmptyStateUI,
  handleTextLoad,
  handleNavigation
} from './WindowMessages.js';

class MapWindowComponent extends BaseWindow {
  constructor() {
    super();

    this.state = {
      ...this.state,
      selectedSuggestionIndex: -1,
      currentSuggestions: [], // Array<{location, altName}>
      referenceSuggestion: null // {sectionid, count, label} when the query parses as a reference
    };

    this.mapPanel = null;
  }

  async render() {
    this.innerHTML = `
      <div class="window-header map-header">
        <div class="map-header-inner">
          <input type="text" placeholder="Search locations…" class="app-input map-nav" aria-label="Search locations" />
          <div class="map-search-suggestions" role="listbox" aria-label="Location suggestions"></div>
          <button type="button" class="app-list map-journey-list hidden" aria-haspopup="listbox" aria-expanded="false" aria-label="Journey"></button>
          <div class="map-journey-menu" role="listbox" aria-label="Journeys"></div>
        </div>
      </div>
      <div class="window-main map-main">
        <div class="svg-map-container">
          <div class="map-empty-state">
            <p class="map-empty-message"></p>
            <button class="map-empty-explore-btn">Explore all locations</button>
          </div>
        </div>
        <div class="map-controls-bar">
          <button class="map-detail-back hidden" aria-label="Back to map">&#8592; Back</button>
          <div class="map-mode-toggle" role="group" aria-label="Map mode">
            <button class="map-mode-btn active" data-mode="passage" aria-pressed="true">Passage</button>
            <button class="map-mode-btn" data-mode="explore" aria-pressed="false">Explore</button>
            <button class="map-mode-btn hidden" data-mode="journeys" aria-pressed="false">Journeys</button>
          </div>
          <div class="map-era-filter hidden" role="group" aria-label="Era filter">
            <button class="map-era-btn active" data-era="all" aria-pressed="true">All</button>
            <button class="map-era-btn" data-era="ot" aria-pressed="false">OT</button>
            <button class="map-era-btn" data-era="nt" aria-pressed="false">NT</button>
          </div>
          <span class="map-location-count" aria-live="polite"></span>
        </div>
        <div class="map-detail hidden">
          <div class="map-detail-content"></div>
        </div>
      </div>
    `;
  }

  cacheRefs() {
    super.cacheRefs();

    this.refs.header = this.$('.map-header');
    this.refs.main = this.$('.map-main');
    this.refs.mapSearchInput = this.$('.map-nav');
    this.refs.searchSuggestions = this.$('.map-search-suggestions');
    this.refs.mapContainer = this.$('.svg-map-container');
    this.refs.modeToggle = this.$('.map-mode-toggle');
    this.refs.journeysModeBtn = this.$('.map-mode-btn[data-mode="journeys"]');
    this.refs.eraFilter = this.$('.map-era-filter');
    this.refs.journeyList = this.$('.map-journey-list');
    this.refs.journeyMenu = this.$('.map-journey-menu');
    this.refs.locationCount = this.$('.map-location-count');
    this.refs.emptyState = this.$('.map-empty-state');
    this.refs.emptyMessage = this.$('.map-empty-message');
    this.refs.emptyExploreBtn = this.$('.map-empty-explore-btn');
    this.refs.detail = this.$('.map-detail');
    this.refs.detailContent = this.$('.map-detail-content');
    this.refs.detailBack = this.$('.map-detail-back');
  }

  attachEventListeners() {
    attachMapWindowListeners(this);
  }

  async init() {
    const initData = this.initData || {};

    this.mapPanel = new MapPanel(this.refs.mapContainer);

    this.mapPanel._onLocationOpen = (location, colocated, verseTextLookup) => {
      this.showDetail(location, colocated, verseTextLookup);
    };

    this.mapPanel._onVerseClick = (sectionid, fragmentid) => {
      this.trigger('globalmessage', {
        type: 'globalmessage',
        target: this,
        data: { messagetype: 'nav', type: 'bible', locationInfo: { sectionid, fragmentid } }
      });
    };

    this.mapPanel._onSettingsChange = (lat, lon) => {
      this.trigger('settingschange', {
        type: 'settingschange',
        target: this,
        data: { latitude: lat, longitude: lon, label: `Map: ${lat.toFixed(3)}, ${lon.toFixed(3)}` }
      });
    };

    await this.mapPanel.init(initData.latitude, initData.longitude);

    // Journeys are additive: the mode button stays hidden unless journeys.json
    // loads (the file is absent on content servers that predate the feature)
    this.mapPanel.loadJourneys().then((journeys) => {
      if (!journeys?.length || !this.refs.journeysModeBtn) return;
      this.refs.journeysModeBtn.classList.remove('hidden');
      renderJourneyMenu(this, journeys);
      if (initData.journey) this.restoreJourneys(String(initData.journey));
    }).catch(() => { /* stays hidden */ });

    this.requestCurrentBibleContent();
  }

  cleanup() {
    this.mapPanel?.destroy();
    super.cleanup();
  }

  setMode(mode) {
    this.refs.modeToggle.querySelectorAll('.map-mode-btn').forEach(btn => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    this.refs.eraFilter.classList.toggle('hidden', mode !== 'explore');

    // Journeys mode swaps the location search box for the journey dropdown
    const journeysMode = mode === 'journeys';
    this.refs.mapSearchInput.classList.toggle('hidden', journeysMode);
    this.refs.journeyList.classList.toggle('hidden', !journeysMode);
    if (journeysMode) {
      hideSuggestions(this);
    } else {
      this.toggleJourneyMenu(false);
      // Close the journey stop list or a stop's location detail; both are
      // journey-scoped UI (Back returns to the stop list) and must not
      // outlive journeys mode.
      if (this._journeyListShowing || this._detailFromJourney) this.hideDetail();
    }

    this.mapPanel?.setMode(mode);
    this.updateEmptyState();
  }

  // --- Journeys ---

  toggleJourneyMenu(open) {
    toggleJourneyMenuUI(this, open);
  }

  selectJourney(journeyId) {
    if (!this.mapPanel?.selectJourney(journeyId)) return;
    const journey = this.mapPanel.getJourney(journeyId);

    renderJourneySelection(this, journey);
    this.toggleJourneyMenu(false);
    this.showJourneyStops(journey);
    this.updateEmptyState();
    this.mapPanel.triggerSettingsChange(); // persist journey selection via getData()
  }

  showJourneyStops(journey) {
    showJourneyStopsUI(this, journey);
  }

  /** Restore journeys mode from a persisted/shared journey id. */
  restoreJourneys(param) {
    const ids = String(param).split(',').filter(id => this.mapPanel?.getJourney(id));
    if (!ids.length) return;
    this.setMode('journeys');
    this.selectJourney(ids[0]);
  }

  updateEmptyState() {
    updateEmptyStateUI(this);
  }

  // --- Detail panel ---

  showDetail(location, colocated, verseTextLookup) {
    const hadFocusInside = this.contains(document.activeElement);

    // A location opened while the journey stop list is up (stop badge or row
    // click) gets a Back that returns to the list rather than closing
    this._detailFromJourney = this._journeyListShowing || this._detailFromJourney;
    this._journeyListShowing = false;

    this.refs.detail._colocatedLocations = colocated;
    this.refs.detailContent.innerHTML = buildDetailHTML(location, verseTextLookup, colocated);
    hydrateVerseTexts(this.refs.detailContent, this.state.currentTextid);
    this.refs.detail.classList.remove('hidden');
    this.refs.detailBack.classList.remove('hidden');

    if (hadFocusInside) {
      const heading = this.refs.detailContent.querySelector('.map-detail-header h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    }
  }

  hideDetail() {
    const hadFocusInside = this.contains(document.activeElement);
    this._journeyListShowing = false;
    this._detailFromJourney = false;
    this._journeyListJourney = null;
    this.refs.detail.classList.add('hidden');
    this.refs.detailBack.classList.add('hidden');
    // stop lazy verse hydration while hidden
    this.refs.detailContent._hydrateObserver?.disconnect();
    this.refs.detailContent._hydrateObserver = null;
    this.mapPanel?.resetMarkerOpacity();
    if (hadFocusInside) this.refs.mapContainer.focus();
  }

  /**
   * Retry verse snippets in an open location detail. Rows that previously failed
   * (marked "not available") are reset to pending so hydrateVerseTexts fetches
   * them again against the now-known Bible text. No-op for the journey stop list
   * (it has no snippet rows) or a closed detail (reopening rebuilds it fresh).
   */
  rehydrateOpenDetail() {
    if (this.refs.detail.classList.contains('hidden')) return;

    const content = this.refs.detailContent;
    content.querySelectorAll('.verse-text-missing').forEach(el => {
      el.classList.remove('verse-text-missing');
      el.classList.add('verse-text-pending');
      el.textContent = '…';
    });

    if (content.querySelector('.verse-text-pending')) {
      hydrateVerseTexts(content, this.state.currentTextid);
    }
  }

  // --- Messages ---

  requestCurrentBibleContent() {
    this.trigger('globalmessage', {
      type: 'globalmessage',
      target: this,
      data: { messagetype: 'maprequest', requesttype: 'currentcontent' }
    });
  }

  handleMessage(e) {
    handleTextLoad(this, e);
  }

  handleGlobalMessage(e) {
    handleNavigation(this, e);
  }

  // --- Sizing ---

  size(width, height) {
    const headerHeight = this.refs.header?.offsetHeight || 50;
    this.refs.main.style.width = `${width}px`;
    this.refs.main.style.height = `${height - headerHeight}px`;
    if (this.mapPanel) this.mapPanel.onResize();
  }

  getData() {
    const lat = this.mapPanel?.state.currentCenter?.lat ?? DEFAULT_CENTER.lat;
    const lon = this.mapPanel?.state.currentCenter?.lon ?? DEFAULT_CENTER.lon;
    const data = {
      latitude: lat,
      longitude: lon,
      params: { win: 'map', latitude: lat, longitude: lon }
    };

    // Persist/share the journey selection only while journeys mode is on
    if (this.mapPanel?.state.mode === 'journeys') {
      const ids = this.mapPanel.getActiveJourneyIds();
      if (ids.length) {
        data.journey = ids.join(',');
        data.params.journey = data.journey;
      }
    }
    return data;
  }
}

registerWindowComponent('map-window', MapWindowComponent, {
  windowType: 'map',
  displayName: 'Map',
  paramKeys: {}
});

export { MapWindowComponent as MapWindow };

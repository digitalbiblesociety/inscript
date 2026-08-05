/**
 * Shared by MapWindow and MediaWindow, and duck-typed to match the interface
 * pan-zoom.js expects: refs.mapContainer, viewBox, state.isPanning, panStart,
 * addListener, updateMarkerScales, triggerSettingsChange.
 */

import { SVG_WIDTH, SVG_HEIGHT, DEFAULT_CENTER, ZOOM_STEP } from './constants.js';
import { i18n } from '../../lib/i18n.js';
import { svgToGeo } from './geo-utils.js';
import * as MarkerRenderer from './marker-renderer.js';
import { getLocationsForReference, resolveStopLocation } from './map-data.js';
import { fetchSvgText, fetchPinData, fetchJourneyData, lazyLoadRelief } from './MapAssets.js';
import { ensureJourneyLayer, renderJourney, removeJourney } from './journey-layer.js';
import { journeyBoundsLocations } from './route-geometry.js';
import { setupPanZoom, centerOn, centerOnBounds, refit, zoomBy, isAtMinZoom, isAtMaxZoom } from './pan-zoom.js';
import { createDetailPanel, destroyDetailPanel } from './detail-panel.js';
import { highlightLocations, removeTextHighlights, removeMarkerHighlights } from './highlight.js';
import { computeClusters, renderClusters, applyClusterVisibility } from './clustering.js';
import { wireDetailPanel } from './PanelEvents.js';
import { filterMarkers, openLocationDetail } from './MarkerActions.js';

// Trailing delay before clusters/labels recompute after a burst of zoom input
const DECORATION_SETTLE_MS = 150;

// The .linked-location spans in Bible window text are document-wide and shared
// by every live panel that has highlighted. Each such panel holds a claim here;
// the spans are only stripped when the last claimant releases (close/destroy).
const _textHighlightOwners = new Set();

export class MapPanel {
  constructor(container) {
    this.container = container;

    this.refs = { mapContainer: container };
    this.state = {
      isPanning: false,
      mode: 'passage',
      currentReference: null,
      currentCenter: { ...DEFAULT_CENTER },
      exploreEra: 'all', // 'all' | 'ot' | 'nt'
      activeJourneys: new Set() // journey ids shown in 'journeys' mode
    };
    this.viewBox = { x: 0, y: 0, width: SVG_WIDTH, height: SVG_HEIGHT };
    this.panStart = { x: 0, y: 0 };

    this.svgElement = null;
    this.markersOverlay = null;
    this.locationData = null;
    this.locationDataByVerse = null;
    this.detailPanel = null;
    this._journeys = null; // loaded journeys.json records (MapWindow opt-in)
    this._journeyLayer = null; // <g> hosting route paths inside the basemap SVG

    this._panOffset = { x: 0, y: 0 };
    this._eventListeners = [];
    this._onVerseClick = null; // optional callback(sectionid, fragmentid)
    this._onSettingsChange = null; // optional callback(lat, lon)
    this._verseTextLookup = null; // optional (verseId: string) => string | null
    this._onLocationOpen = null;
    this._detailTextid = null; // optional Bible text id for hydrating detail verse snippets
  }

  /**
   * Initialise the map: fetch SVG, create overlay, load pins, wire pan/zoom.
   * Centers on Jerusalem when lat/lon are omitted.
   */
  async init(lat, lon) {
    if (lat !== undefined) this.state.currentCenter.lat = lat;
    if (lon !== undefined) this.state.currentCenter.lon = lon;
    this.detailPanel = createDetailPanel();
    wireDetailPanel(this);
    await this._initMap();
  }

  /**
   * Filter visible markers to those that mention the given Bible section ID.
   */
  filterBySection(sectionId) {
    this.state.currentReference = sectionId;

    const locations = (this.state.mode === 'passage' && sectionId && this.locationData)
      ? getLocationsForReference(this.locationData, sectionId)
      : null;
    const willRecenter = !!locations && locations.length > 0;

    this._filterMarkers({ updateScales: !willRecenter });
    if (willRecenter) centerOnBounds(this, locations);
  }

  /**
   * Switch between 'passage', 'explore', and 'journeys' modes.
   */
  setMode(mode) {
    this.state.mode = mode;
    this._syncJourneyRendering();
    // resetView always ends in a decoration pass (centerOn/centerOnBounds)
    this._filterMarkers({ updateScales: false });
    this.resetView();
  }

  /**
   * Reset the view to the natural fit for the current mode: the current
   * passage's locations in passage mode, the active journeys in journeys
   * mode, otherwise the full map.
   */
  resetView() {
    if (this.state.mode === 'journeys') {
      const locations = this._activeJourneys().flatMap(journeyBoundsLocations);
      if (locations.length > 0) {
        centerOnBounds(this, locations);
        return;
      }
    }
    if (this.state.mode === 'passage' && this.state.currentReference && this.locationData) {
      const locations = getLocationsForReference(this.locationData, this.state.currentReference);
      if (locations.length > 0) {
        centerOnBounds(this, locations);
        return;
      }
    }
    centerOn(this, DEFAULT_CENTER.lon, DEFAULT_CENTER.lat, 1);
  }

  /**
   * Set the era filter for explore mode ('all' | 'ot' | 'nt').
   */
  setExploreEra(era) {
    this.state.exploreEra = era;
    this._filterMarkers();
  }

  /**
   * Fetch journey definitions (cached module-wide, like the pins and SVG).
   * Opt-in: only MapWindow calls this, so other MapPanel hosts pay nothing.
   * Failure propagates so the caller can hide the Journeys UI.
   */
  async loadJourneys() {
    this._journeys = await fetchJourneyData();
    return this._journeys;
  }

  /**
   * Look up a loaded journey by id.
   */
  getJourney(id) {
    return this._journeys?.find(j => j.id === id);
  }

  /** Ids of the journeys currently toggled on. */
  getActiveJourneyIds() {
    return [...this.state.activeJourneys];
  }

  /**
   * Show exactly one journey (journeys mode is single-select) and fit the
   * view to its full extent (stops plus route waypoints).
   * Returns false when no journey has that id.
   */
  selectJourney(id) {
    const journey = this.getJourney(id);
    if (!journey) return false;

    this.state.activeJourneys = new Set([id]);
    this._syncJourneyRendering();
    // centerOnBounds ends in a decoration pass, which positions the new badges
    centerOnBounds(this, journeyBoundsLocations(journey));
    return true;
  }

  /**
   * Open the location detail for a journey stop, resolving it to its full
   * maps.json record (complete verse list) when one exists.
   */
  openStop(stop) {
    this._openLocation(resolveStopLocation(stop, this.locationData));
  }

  /**
   * Open the detail panel for a location (from search or external call).
   */
  openLocation(location) {
    this._openLocation(location);
  }

  /**
   * Highlight location names in Bible window text and their map markers.
   * A `sectionid` scopes the text walk to one loaded section. Returns false
   * while pins are still loading, meaning the walk did not run.
   */
  highlight(sectionid = null) {
    if (!this.locationDataByVerse) return false;
    _textHighlightOwners.add(this);
    highlightLocations(this.markersOverlay, this.locationDataByVerse, sectionid);
    // reposition skips hidden markers, so freshly unhidden ones sit stale
    if (this.markersOverlay) {
      MarkerRenderer.repositionAllMarkers(
        this.markersOverlay, this.viewBox, this.container.getBoundingClientRect());
    }
    return true;
  }

  removeHighlights() {
    _textHighlightOwners.delete(this);
    removeMarkerHighlights(this.markersOverlay);
    if (_textHighlightOwners.size === 0) removeTextHighlights();
  }

  resetMarkerOpacity() {
    MarkerRenderer.resetMarkerOpacity(this.markersOverlay);
  }

  /**
   * Clean up event listeners and remove the detail panel.
   */
  destroy() {
    clearTimeout(this._settleTimer);
    clearTimeout(this._decorTimer);
    destroyDetailPanel(this.detailPanel);
    this.removeHighlights();
    this._eventListeners.forEach(({ el, event, handler }) => {
      el.removeEventListener(event, handler);
    });
    this._eventListeners = [];
  }

  // --- Interface required by pan-zoom.js ---

  /** Register an event listener and track it for cleanup. */
  addListener(el, event, handler, opts) {
    el.addEventListener(event, handler, opts);
    this._eventListeners.push({ el, event, handler });
  }

  panMarkersBy(dx, dy) {
    if (!this.markersOverlay) return;
    this._panOffset.x += dx;
    this._panOffset.y += dy;
    this.markersOverlay.style.transform = `translate3d(${this._panOffset.x}px,${this._panOffset.y}px,0)`;
  }

  /** Re-fit the viewBox to the container's new aspect after a resize, then re-render. */
  onResize() {
    refit(this);
  }

  updateMarkerScales({ defer = false } = {}) {
    if (!this.markersOverlay) return;

    // Reset the pan-translate so individual marker positions are authoritative again
    this._panOffset.x = 0;
    this._panOffset.y = 0;
    this.markersOverlay.style.transform = '';

    clearTimeout(this._decorTimer);
    if (defer) {
      // Existing markers and cluster badges track the new viewBox right away
      const containerRect = this.container.getBoundingClientRect();
      MarkerRenderer.repositionAllMarkers(this.markersOverlay, this.viewBox, containerRect);
      this._updateZoomControlState();
      this._decorTimer = setTimeout(() => this._decorateMarkers(), DECORATION_SETTLE_MS);
    } else {
      this._decorateMarkers();
    }
  }

  /** Decoration pass: recompute clusters, then position everything and deconflict labels. */
  _decorateMarkers() {
    if (!this.markersOverlay) return;

    // Clear any pan translate accumulated while the settle timer was pending;
    // the positions below are absolute, and translate on top double-shifts.
    this._panOffset.x = 0;
    this._panOffset.y = 0;
    this.markersOverlay.style.transform = '';

    this.markersOverlay.querySelectorAll('.map-marker.clustered').forEach(m => {
      m.classList.remove('clustered');
    });

    const containerWidth = this.container.offsetWidth || 800;
    const { clusters, singles, hidden } = computeClusters(this.markersOverlay, this.viewBox, containerWidth);
    applyClusterVisibility(clusters, singles, hidden);
    renderClusters(this.markersOverlay, clusters);

    const containerRect = this.container.getBoundingClientRect();
    MarkerRenderer.repositionAllMarkers(this.markersOverlay, this.viewBox, containerRect);
    MarkerRenderer.deconflictLabels(this.markersOverlay);
    this._updateZoomControlState();
  }

  /** Called by pan-zoom.js when panning ends. */
  triggerSettingsChange() {
    const center = svgToGeo(
      this.viewBox.x + this.viewBox.width / 2,
      this.viewBox.y + this.viewBox.height / 2
    );
    this.state.currentCenter = { lat: center.lat, lon: center.lon };
    if (this._onSettingsChange) {
      this._onSettingsChange(center.lat, center.lon);
    }
  }

  // --- Private ---

  /** Loaded journey records currently toggled on. */
  _activeJourneys() {
    return (this._journeys || []).filter(j => this.state.activeJourneys.has(j.id));
  }

  /**
   * Bring the rendered journey overlays in line with the current mode and
   * active set: in journeys mode every active journey is (re)rendered,
   * otherwise all journey elements are removed. Idempotent and cheap.
   */
  _syncJourneyRendering() {
    if (!this.svgElement || !this.markersOverlay || !this._journeys) return;
    if (!this._journeyLayer) this._journeyLayer = ensureJourneyLayer(this.svgElement);

    const inJourneysMode = this.state.mode === 'journeys';
    for (const journey of this._journeys) {
      if (inJourneysMode && this.state.activeJourneys.has(journey.id)) {
        renderJourney(this._journeyLayer, this.markersOverlay, journey,
          (stop) => this.openStop(stop));
      } else {
        removeJourney(this._journeyLayer, this.markersOverlay, journey.id);
      }
    }
  }

  async _initMap() {
    try {
      const pinDataPromise = fetchPinData(); // starts alongside the SVG fetch
      const svgText = await fetchSvgText();

      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
      this.svgElement = svgDoc.documentElement;
      this.svgElement.setAttribute('width', '100%');
      this.svgElement.setAttribute('height', '100%');
      // Cover: fill the container (crop overflow) so there are never letterbox bars.
      // Markers/pointer math use the matching transform in view-transform.js.
      this.svgElement.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      this.svgElement.style.display = 'block';

      this.markersOverlay = document.createElement('div');
      this.markersOverlay.className = 'map-markers-overlay';

      this.container.tabIndex = 0;
      this.container.setAttribute('role', 'application');
      this.container.setAttribute('aria-label',
        'Interactive Bible map. Use arrow keys to pan, plus and minus to zoom, Home to reset the view.');

      this.container.appendChild(this.svgElement);
      this.container.appendChild(this.markersOverlay);
      this._createZoomControls();

      centerOn(this, this.state.currentCenter.lon, this.state.currentCenter.lat, 4);
      setupPanZoom(this);
      await this._loadPins(pinDataPromise);
      lazyLoadRelief(this.svgElement);
    } catch (err) {
      console.error('MapPanel: failed to load SVG map:', err);
      this.container.innerHTML = `<div style="padding:20px;color:var(--text-color)">${i18n.t('windows.map.loadfailed')}</div>`;
    }
  }

  /** On-screen zoom controls: + / − / reset view. */
  _createZoomControls() {
    const controls = document.createElement('div');
    controls.className = 'map-zoom-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Map zoom');

    const makeButton = (className, label, html) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `map-zoom-btn ${className}`;
      button.setAttribute('aria-label', label);
      button.title = label;
      button.innerHTML = html;
      controls.appendChild(button);
      return button;
    };

    this._zoomInBtn = makeButton('map-zoom-in', 'Zoom in', '+');
    this._zoomOutBtn = makeButton('map-zoom-out', 'Zoom out', '−');
    const fitBtn = makeButton('map-zoom-fit', 'Reset view',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
      '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/></svg>');

    this.addListener(this._zoomInBtn, 'click', () => {
      zoomBy(this, 1 / ZOOM_STEP);
      this.triggerSettingsChange();
    });
    this.addListener(this._zoomOutBtn, 'click', () => {
      zoomBy(this, ZOOM_STEP);
      this.triggerSettingsChange();
    });
    this.addListener(fitBtn, 'click', () => {
      this.resetView();
      this.triggerSettingsChange();
    });

    this.container.appendChild(controls);
  }

  /** Disable +/− at the zoom bounds; doubles as the zoom-level indicator. */
  _updateZoomControlState() {
    if (!this._zoomInBtn) return;
    this._zoomInBtn.disabled = isAtMaxZoom(this);
    this._zoomOutBtn.disabled = isAtMinZoom(this);
  }

  async _loadPins(pinDataPromise = fetchPinData()) {
    try {
      this.locationData = await pinDataPromise;
      this.locationDataByVerse = MarkerRenderer.createPins(
        this.markersOverlay,
        this.locationData,
        (location) => this._openLocation(location)
      );
      this._filterMarkers(); // ends in a full decoration pass
    } catch (err) {
      console.error('MapPanel: error loading pins', err);
    }
  }

  _filterMarkers(opts) {
    filterMarkers(this, opts);
  }

  _openLocation(location) {
    openLocationDetail(this, location);
  }
}

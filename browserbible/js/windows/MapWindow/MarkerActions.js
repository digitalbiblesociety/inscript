import * as MarkerRenderer from './marker-renderer.js';
import { SVG_WIDTH, COLOCATED_EPSILON } from './constants.js';
import { geoToSvg } from './geo-utils.js';
import { getViewTransform } from './view-transform.js';
import { centerOn, constrainViewBox, updateViewBox } from './pan-zoom.js';
import { openDetailPanel } from './detail-panel.js';

function markerVisible(panel, marker) {
  const isPassageMode = panel.state.mode === 'passage';
  if (panel.state.mode === 'journeys') {
    // Numbered journey badges replace the regular pins, highlighted or not
    return false;
  }
  if (marker.classList.contains('highlighted')) {
    // Pins named in the rendered Bible text stay visible through passage/era filters
    return true;
  }
  if (isPassageMode && panel.state.currentReference && marker.locationData) {
    return marker.locationData.verses.some(v => v.startsWith(panel.state.currentReference + '_'));
  }
  if (!isPassageMode && panel.state.exploreEra !== 'all' && marker.locationData) {
    const era = marker.locationData._era;
    return era === 'both' || era === panel.state.exploreEra;
  }
  return !isPassageMode;
}

export function filterMarkers(panel, { updateScales = true } = {}) {
  if (!panel.markersOverlay || !panel.locationDataByVerse) return;

  panel.markersOverlay.querySelectorAll('.map-marker').forEach((marker) => {
    marker.classList.toggle('filtered-out', !markerVisible(panel, marker));
  });

  if (updateScales) panel.updateMarkerScales();
}

/** Zoom the view to a location: at least level 6, or keep the current tighter zoom. */
function zoomToLocation(panel, location) {
  const level6Width = SVG_WIDTH / 6;
  if (panel.viewBox.width > level6Width) {
    centerOn(panel, location.coordinates[0], location.coordinates[1], 6);
    return;
  }
  const { x, y } = geoToSvg(location.coordinates[0], location.coordinates[1]);
  panel.viewBox.x = x - panel.viewBox.width / 2;
  panel.viewBox.y = y - panel.viewBox.height / 2;
  constrainViewBox(panel.viewBox);
  updateViewBox(panel.svgElement, panel.viewBox);
  panel.updateMarkerScales();
  panel.triggerSettingsChange();
}

/**
 * Anchor rect from the screen position of the geographic coordinate.
 * We can't rely on getBoundingClientRect() from the marker element because
 * it may still be display:none (clustered) after zoom, returning {0,0}.
 */
function anchorRectFor(panel, svgX, svgY) {
  const containerRect = panel.container.getBoundingClientRect();
  const t = getViewTransform(panel.viewBox, containerRect);
  const screenX = containerRect.left + t.offsetX + (svgX - panel.viewBox.x) * t.scale;
  const screenY = containerRect.top + t.offsetY + (svgY - panel.viewBox.y) * t.scale;
  return { left: screenX - 12, right: screenX + 12, top: screenY - 12, bottom: screenY + 12, width: 24, height: 24 };
}

/** Co-located locations sharing this pin's position. */
function findColocated(panel, location, svgX, svgY) {
  const colocated = [];
  if (!panel.markersOverlay) return colocated;
  panel.markersOverlay.querySelectorAll('.map-marker').forEach(marker => {
    if (!marker.locationData || marker.locationData === location || marker._svgX === undefined) return;
    const dx = marker._svgX - svgX;
    const dy = marker._svgY - svgY;
    if (dx * dx + dy * dy < COLOCATED_EPSILON * COLOCATED_EPSILON) colocated.push(marker.locationData);
  });
  return colocated;
}

export function openLocationDetail(panel, location) {
  MarkerRenderer.fadeMarkers(panel.markersOverlay, location);
  zoomToLocation(panel, location);

  const { x: svgX, y: svgY } = geoToSvg(location.coordinates[0], location.coordinates[1]);
  const anchorRect = anchorRectFor(panel, svgX, svgY);
  const colocated = findColocated(panel, location, svgX, svgY);

  if (panel._onLocationOpen) {
    panel._onLocationOpen(location, colocated, panel._verseTextLookup);
  } else {
    openDetailPanel({
      panel: panel.detailPanel,
      location,
      anchorRect,
      verseTextLookup: panel._verseTextLookup,
      colocated,
      textid: panel._detailTextid
    });
  }
}

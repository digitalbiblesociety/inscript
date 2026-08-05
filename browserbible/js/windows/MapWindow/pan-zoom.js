import { SVG_WIDTH, SVG_HEIGHT, MIN_VIEW_WIDTH } from './constants.js';
import { geoToSvg, svgToGeo } from './geo-utils.js';
import { getViewTransform, screenToSvg } from './view-transform.js';

export { setupPanZoom } from './PanZoomGestures.js';

/** Current container aspect (w/h), falling back to the map aspect before layout. */
function containerAspect(component) {
  const r = component.refs.mapContainer.getBoundingClientRect();
  return (r.width > 0 && r.height > 0) ? r.width / r.height : SVG_WIDTH / SVG_HEIGHT;
}

export function setViewBoxSize(component, width) {
  const ca = containerAspect(component);
  let w = Math.max(MIN_VIEW_WIDTH, width);
  let h = w / ca;
  if (w > SVG_WIDTH) { w = SVG_WIDTH; h = w / ca; }
  if (h > SVG_HEIGHT) { h = SVG_HEIGHT; w = h * ca; }
  component.viewBox.width = w;
  component.viewBox.height = h;
}

export function refit(component) {
  if (!component.svgElement) return;
  component._gestureRect = null; // container geometry changed
  setViewBoxSize(component, component.viewBox.width);
  constrainViewBox(component.viewBox);
  updateViewBox(component.svgElement, component.viewBox);
  component.updateMarkerScales();
}

/**
 * Constrain the viewBox to stay within map bounds.
 * Padding scales with zoom: full overshoot at max zoom-in, zero at full extent
 * so the map can never be panned to show negative space when fully zoomed out.
 */
export function constrainViewBox(viewBox) {
  viewBox.x = Math.max(0, Math.min(SVG_WIDTH - viewBox.width, viewBox.x));
  viewBox.y = Math.max(0, Math.min(SVG_HEIGHT - viewBox.height, viewBox.y));
}

export function updateViewBox(svgElement, viewBox) {
  if (svgElement) {
    svgElement.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
  }
}

/**
 * Zoom by a viewBox-width factor (>1 zooms out, <1 zooms in), keeping the SVG
 * point under the given container-relative pixel fixed on screen.
 * `defer` postpones the marker decoration pass during rapid input bursts.
 */
export function zoomAtPoint(component, px, py, factor, { defer = false, rect = null } = {}) {
  // callers in an input burst pass the rect they already measured
  rect = rect || component.refs.mapContainer.getBoundingClientRect();

  // SVG point under the anchor before zooming
  const before = screenToSvg(px, py, component.viewBox, getViewTransform(component.viewBox, rect));

  setViewBoxSize(component, component.viewBox.width * factor);

  // Keep that same SVG point under the anchor after zooming
  const t = getViewTransform(component.viewBox, rect);
  component.viewBox.x = before.x - (px - t.offsetX) / t.scale;
  component.viewBox.y = before.y - (py - t.offsetY) / t.scale;

  constrainViewBox(component.viewBox);
  updateViewBox(component.svgElement, component.viewBox);
  component.updateMarkerScales({ defer });
}

export function zoomBy(component, factor) {
  const rect = component.refs.mapContainer.getBoundingClientRect();
  zoomAtPoint(component, rect.width / 2, rect.height / 2, factor, { rect });
}

export function isAtMinZoom(component) {
  return component.viewBox.width >= SVG_WIDTH || component.viewBox.height >= SVG_HEIGHT;
}

export function isAtMaxZoom(component) {
  return component.viewBox.width <= MIN_VIEW_WIDTH;
}

/** Recompute currentCenter from the viewBox midpoint. */
function storeCenter(component) {
  const center = svgToGeo(
    component.viewBox.x + component.viewBox.width / 2,
    component.viewBox.y + component.viewBox.height / 2
  );
  component.state.currentCenter = { lat: center.lat, lon: center.lon };
}

export function centerOn(component, lon, lat, zoomLevel = 1) {
  const { x, y } = geoToSvg(lon, lat);
  setViewBoxSize(component, SVG_WIDTH / zoomLevel);
  component.viewBox.x = x - component.viewBox.width / 2;
  component.viewBox.y = y - component.viewBox.height / 2;

  constrainViewBox(component.viewBox);
  updateViewBox(component.svgElement, component.viewBox);
  component.updateMarkerScales();

  storeCenter(component);
}

/** Geographic bounding box of a location set, in SVG coordinates. */
function locationsBBox(locations) {
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  for (const loc of locations) {
    const [lon, lat] = loc.coordinates;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const topLeft = geoToSvg(minLon, maxLat);
  const bottomRight = geoToSvg(maxLon, minLat);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y
  };
}

/**
 * Fit the map viewport around a set of locations, with padding.
 */
export function centerOnBounds(component, locations) {
  if (!locations || locations.length === 0) return;

  if (locations.length === 1) {
    centerOn(component, locations[0].coordinates[0], locations[0].coordinates[1], 6);
    return;
  }

  const bbox = locationsBBox(locations);

  const paddingFactor = 0.2;
  const padX = Math.max(bbox.width * paddingFactor, 40);
  const padY = Math.max(bbox.height * paddingFactor, 30);

  let vw = bbox.width + padX * 2;
  let vh = bbox.height + padY * 2;

  const ca = containerAspect(component);
  if (vw / vh > ca) {
    vh = vw / ca;
  } else {
    vw = vh * ca;
  }

  // Clamp to the full map extent (can't show more than the whole map either way).
  if (vw > SVG_WIDTH) { vw = SVG_WIDTH; vh = vw / ca; }
  if (vh > SVG_HEIGHT) { vh = SVG_HEIGHT; vw = vh * ca; }

  component.viewBox.x = bbox.x + bbox.width / 2 - vw / 2;
  component.viewBox.y = bbox.y + bbox.height / 2 - vh / 2;
  component.viewBox.width = vw;
  component.viewBox.height = vh;

  constrainViewBox(component.viewBox);
  updateViewBox(component.svgElement, component.viewBox);
  component.updateMarkerScales();

  storeCenter(component);
}

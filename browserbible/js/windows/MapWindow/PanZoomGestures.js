import { ZOOM_STEP, WHEEL_ZOOM_FACTOR, ARROW_KEY_PAN_FRACTION } from './constants.js';
import { getViewTransform } from './view-transform.js';
import { constrainViewBox, updateViewBox, zoomAtPoint, zoomBy } from './pan-zoom.js';

/**
 * Trailing debounce after a burst of zoom/pan inputs: persist the map center,
 * and (for inputs that only translated the overlay) recalculate marker positions.
 */
const SETTLE_MS = 400;
function scheduleSettle(component, refreshMarkers = false) {
  clearTimeout(component._settleTimer);
  component._settleTimer = setTimeout(() => {
    if (refreshMarkers) component.updateMarkerScales();
    component.triggerSettingsChange();
  }, SETTLE_MS);
}

// Trackpads fire several wheel events per painted frame, so factors
// accumulate and apply once per rAF.
function handleWheel(component, gesture, e) {
  e.preventDefault();
  const factor = e.deltaY > 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
  if (gesture.pendingWheel) {
    gesture.pendingWheel.factor *= factor;
    gesture.pendingWheel.clientX = e.clientX;
    gesture.pendingWheel.clientY = e.clientY;
    return;
  }
  gesture.pendingWheel = { factor, clientX: e.clientX, clientY: e.clientY };
  requestAnimationFrame(() => {
    const { factor, clientX, clientY } = gesture.pendingWheel;
    gesture.pendingWheel = null;
    const rect = component.refs.mapContainer.getBoundingClientRect();
    zoomAtPoint(component, clientX - rect.left, clientY - rect.top, factor, { defer: true, rect });
    scheduleSettle(component);
  });
}

// Double-click zoom (markers, clusters, and controls handle their own clicks)
function handleDblClick(component, e) {
  if (e.target.closest('.map-marker, .map-cluster, .map-zoom-controls, .journey-stop, .map-empty-state')) return;
  e.preventDefault();
  const rect = component.refs.mapContainer.getBoundingClientRect();
  zoomAtPoint(component, e.clientX - rect.left, e.clientY - rect.top, 1 / ZOOM_STEP, { rect });
  scheduleSettle(component);
}

// The container rect can't change mid-gesture, so it's measured once on
// pointer-down rather than per mousemove.
function handleMouseDown(component, e) {
  // Left button only: a right-click's mouseup can be swallowed by the context
  // menu, which would leave isPanning stuck on.
  if (e.button !== 0) return;
  if (e.target.closest('.map-marker, .map-cluster, .map-zoom-controls, .journey-stop, .map-empty-state')) return;
  component.state.isPanning = true;
  component.panStart = { x: e.clientX, y: e.clientY };
  component._gestureRect = component.refs.mapContainer.getBoundingClientRect();
  component.refs.mapContainer.classList.add('panning');
}

/** Pan so the pointer's travel since panStart moves the map, then advance panStart. */
function panTo(component, clientX, clientY, rect) {
  const t = getViewTransform(component.viewBox, rect);
  const dx = (clientX - component.panStart.x) / t.scale;
  const dy = (clientY - component.panStart.y) / t.scale;

  const prevX = component.viewBox.x;
  const prevY = component.viewBox.y;
  component.viewBox.x -= dx;
  component.viewBox.y -= dy;
  component.panStart = { x: clientX, y: clientY };

  constrainViewBox(component.viewBox);
  updateViewBox(component.svgElement, component.viewBox);

  // Translate the marker overlay by the actual screen pixels the SVG moved.
  // Using the constrained delta means we stop at map edges just like the SVG does.
  const screenDx = (prevX - component.viewBox.x) * t.scale;
  const screenDy = (prevY - component.viewBox.y) * t.scale;
  component.panMarkersBy(screenDx, screenDy);
}

function handleMouseMove(component, e) {
  if (!component.state.isPanning) return;
  const rect = component._gestureRect || component.refs.mapContainer.getBoundingClientRect();
  panTo(component, e.clientX, e.clientY, rect);
}

function handleMouseUp(component) {
  if (!component.state.isPanning) return;
  component.state.isPanning = false;
  component.refs.mapContainer.classList.remove('panning');
  component.updateMarkerScales();
  component.triggerSettingsChange();
}

function handleTouchStart(component, gesture, e) {
  // The empty-state overlay is pointer-events: none except for its button;
  // a press on the button must not also drag the map underneath.
  if (e.target.closest('.map-empty-state')) return;
  component._gestureRect = component.refs.mapContainer.getBoundingClientRect();
  if (e.touches.length === 1) {
    component.state.isPanning = true;
    component.panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  } else if (e.touches.length === 2) {
    component.state.isPanning = false;
    gesture.lastTouchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
}

function handleTouchMove(component, gesture, e) {
  e.preventDefault();
  const rect = component._gestureRect || component.refs.mapContainer.getBoundingClientRect();

  if (e.touches.length === 1 && component.state.isPanning) {
    panTo(component, e.touches[0].clientX, e.touches[0].clientY, rect);
  } else if (e.touches.length === 2) {
    const newDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
    const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

    // Zoom anchored at the pinch midpoint
    zoomAtPoint(component, centerX, centerY, gesture.lastTouchDist / newDist, { defer: true, rect });
    gesture.lastTouchDist = newDist;
  }
}

function handleTouchEnd(component) {
  component.state.isPanning = false;
  component.updateMarkerScales();
  component.triggerSettingsChange();
}

function keyPan(component, fx, fy) {
  const rect = component.refs.mapContainer.getBoundingClientRect();
  const t = getViewTransform(component.viewBox, rect);
  const prevX = component.viewBox.x;
  const prevY = component.viewBox.y;
  component.viewBox.x += component.viewBox.width * fx;
  component.viewBox.y += component.viewBox.height * fy;
  constrainViewBox(component.viewBox);
  updateViewBox(component.svgElement, component.viewBox);
  // Same overlay-translate technique as drag panning; decorations refresh on settle
  component.panMarkersBy((prevX - component.viewBox.x) * t.scale, (prevY - component.viewBox.y) * t.scale);
  scheduleSettle(component, true);
}

/**
 * Keyboard controls on the (focusable) map container:
 * arrows pan, +/− zoom, Home/0 resets the view.
 */
function handleKeydown(component, e) {
  if (e.target !== component.refs.mapContainer) return;

  switch (e.key) {
    case 'ArrowLeft': keyPan(component, -ARROW_KEY_PAN_FRACTION, 0); break;
    case 'ArrowRight': keyPan(component, ARROW_KEY_PAN_FRACTION, 0); break;
    case 'ArrowUp': keyPan(component, 0, -ARROW_KEY_PAN_FRACTION); break;
    case 'ArrowDown': keyPan(component, 0, ARROW_KEY_PAN_FRACTION); break;
    case '+': case '=':
      zoomBy(component, 1 / ZOOM_STEP);
      scheduleSettle(component);
      break;
    case '-': case '_':
      zoomBy(component, ZOOM_STEP);
      scheduleSettle(component);
      break;
    case 'Home': case '0':
      if (typeof component.resetView === 'function') {
        component.resetView();
        component.triggerSettingsChange();
      }
      break;
    default:
      return;
  }
  e.preventDefault();
}

export function setupPanZoom(component) {
  const mapContainer = component.refs.mapContainer;
  const gesture = { pendingWheel: null, lastTouchDist: 0 };

  component.addListener(mapContainer, 'wheel', (e) => handleWheel(component, gesture, e), { passive: false });
  component.addListener(mapContainer, 'dblclick', (e) => handleDblClick(component, e));
  component.addListener(mapContainer, 'mousedown', (e) => handleMouseDown(component, e));
  component.addListener(document, 'mousemove', (e) => handleMouseMove(component, e));
  component.addListener(document, 'mouseup', () => handleMouseUp(component));
  component.addListener(mapContainer, 'touchstart', (e) => handleTouchStart(component, gesture, e), { passive: true });
  component.addListener(mapContainer, 'touchmove', (e) => handleTouchMove(component, gesture, e), { passive: false });
  component.addListener(mapContainer, 'touchend', () => handleTouchEnd(component), { passive: true });
  component.addListener(mapContainer, 'keydown', (e) => handleKeydown(component, e));
}

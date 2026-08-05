import * as MarkerRenderer from './marker-renderer.js';
import { SVG_WIDTH, CLUSTER_RADIUS_PX, COLOCATED_EPSILON, CLUSTER_BREAK_MARGIN } from './constants.js';
import { centerOnBounds, constrainViewBox, updateViewBox, setViewBoxSize } from './pan-zoom.js';

// Verse links in the detail panel navigate the Bible window
function onDetailClick(panel, e) {
  const coloc = e.target.closest('.map-detail-colocated-item');
  if (coloc) {
    const idx = parseInt(coloc.getAttribute('data-index'), 10);
    const loc = panel.detailPanel._colocatedLocations?.[idx];
    if (loc) panel._openLocation(loc);
    return;
  }

  const link = e.target.closest('.verse');
  if (!link || !panel._onVerseClick) return;
  panel._onVerseClick(
    link.getAttribute('data-sectionid'),
    link.getAttribute('data-fragmentid')
  );
}

// Reset marker fading when the detail panel closes
function onDetailToggle(panel, e) {
  if (e.newState === 'closed') {
    MarkerRenderer.resetMarkerOpacity(panel.markersOverlay);
  }
}

function onContainerClick(panel, e) {
  const cluster = e.target.closest('.map-cluster');
  if (cluster && cluster._clusterData) {
    e.stopPropagation();
    handleClusterClick(panel, cluster._clusterData);
  }
}

// Cluster keyboard activation (clusters are focusable buttons)
function onContainerKeydown(panel, e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const cluster = e.target.closest?.('.map-cluster');
  if (cluster && cluster._clusterData) {
    e.preventDefault();
    e.stopPropagation();
    handleClusterClick(panel, cluster._clusterData);
  }
}

export function wireDetailPanel(panel) {
  panel.addListener(panel.detailPanel, 'click', (e) => onDetailClick(panel, e));
  panel.addListener(panel.detailPanel, 'toggle', (e) => onDetailToggle(panel, e));
  panel.addListener(panel.container, 'click', (e) => onContainerClick(panel, e));
  panel.addListener(panel.container, 'keydown', (e) => onContainerKeydown(panel, e));
}

/** Max pairwise SVG distance between cluster members. */
function maxPairwiseDistance(members) {
  let maxDist = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const dx = (members[i]._svgX || 0) - (members[j]._svgX || 0);
      const dy = (members[i]._svgY || 0) - (members[j]._svgY || 0);
      maxDist = Math.max(maxDist, Math.hypot(dx, dy));
    }
  }
  return maxDist;
}

/** Zoom in far enough that the cluster's members separate. */
function breakClusterZoom(panel, maxDist, containerWidth) {
  const separationWidth = Math.max(
    Math.sqrt(maxDist * SVG_WIDTH * containerWidth / (6 * CLUSTER_RADIUS_PX)) * CLUSTER_BREAK_MARGIN,
    30
  );
  const cx = panel.viewBox.x + panel.viewBox.width / 2;
  const cy = panel.viewBox.y + panel.viewBox.height / 2;
  setViewBoxSize(panel, separationWidth);
  panel.viewBox.x = cx - panel.viewBox.width / 2;
  panel.viewBox.y = cy - panel.viewBox.height / 2;
  constrainViewBox(panel.viewBox);
  updateViewBox(panel.svgElement, panel.viewBox);
  panel.updateMarkerScales();
  panel.triggerSettingsChange();
}

export function handleClusterClick(panel, clusterData) {
  const locations = clusterData.members.map(m => m.locationData).filter(Boolean);
  if (!locations.length) return;

  const maxDist = maxPairwiseDistance(clusterData.members);
  if (maxDist < COLOCATED_EPSILON) {
    panel._openLocation(locations[0]);
    return;
  }

  // Use centerOnBounds to center on the pins, then check whether the resulting
  // zoom is tight enough to actually break the cluster radius.
  centerOnBounds(panel, locations);

  const containerWidth = panel.container.offsetWidth || 800;
  const zoomRatio = panel.viewBox.width / SVG_WIDTH;
  const zoomScale = Math.min(1, zoomRatio * 6);
  const clusterRadiusSvg = CLUSTER_RADIUS_PX * zoomScale * panel.viewBox.width / containerWidth;

  if (maxDist <= clusterRadiusSvg) {
    breakClusterZoom(panel, maxDist, containerWidth);
  }
}

import { elem } from '../../lib/helpers.esm.js';
import { SVG_WIDTH, CLUSTER_RADIUS_PX, COLOCATED_EPSILON } from './constants.js';

/**
 * Visible markers with cached SVG coordinates, sorted by tier:
 * lower number = more important = becomes cluster center.
 */
function collectEligibleMarkers(overlay) {
  const eligible = [];
  overlay.querySelectorAll('.map-marker').forEach((marker) => {
    if (marker.classList.contains('filtered-out')) return;
    if (marker._svgX === undefined) return;

    eligible.push({
      marker,
      x: marker._svgX,
      y: marker._svgY,
      tier: parseInt(marker.getAttribute('data-tier') || '4', 10)
    });
  });
  eligible.sort((a, b) => a.tier - b.tier);
  return eligible;
}

/** Unassigned markers within the cluster radius of `item` (excluding itself). */
function collectNearby(item, eligible, assigned, radiusSq) {
  return eligible.filter((other) => {
    if (assigned.has(other) || other === item) return false;
    const dx = item.x - other.x;
    const dy = item.y - other.y;
    return dx * dx + dy * dy < radiusSq;
  });
}

function maxPairwiseDistSq(members) {
  let maxDistSq = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const dx = members[i].x - members[j].x;
      const dy = members[i].y - members[j].y;
      maxDistSq = Math.max(maxDistSq, dx * dx + dy * dy);
    }
  }
  return maxDistSq;
}

/**
 * Pins at the same geographic point (can never be separated by zooming):
 * show only the pin with the most verse entries; hide the rest.
 */
function assignColocated(members, singles, hidden) {
  const best = members.reduce((a, b) => {
    const av = a.marker.locationData?.verses?.length ?? 0;
    const bv = b.marker.locationData?.verses?.length ?? 0;
    return bv > av ? b : a;
  });
  singles.push(best.marker);
  for (const m of members) {
    if (m !== best) hidden.push(m.marker);
  }
}

/**
 * Cluster radius in SVG coordinates for the current viewport. Scales down at
 * high zoom so nearby locations can separate.
 */
function clusterRadiusSq(viewBox, containerWidth) {
  const zoomRatio = viewBox.width / SVG_WIDTH; // 1 at full extent, small at max zoom
  const zoomScale = Math.min(1, zoomRatio * 6);
  const effectiveRadiusPx = CLUSTER_RADIUS_PX * zoomScale;
  const clusterRadiusSvg = effectiveRadiusPx * (viewBox.width / containerWidth);
  return clusterRadiusSvg * clusterRadiusSvg;
}

/**
 * Compute clusters from visible markers based on the current viewport.
 */
export function computeClusters(overlay, viewBox, containerWidth) {
  if (!overlay || !containerWidth) return { clusters: [], singles: [], hidden: [] };

  const radiusSq = clusterRadiusSq(viewBox, containerWidth);
  const eligible = collectEligibleMarkers(overlay);

  const assigned = new Set();
  const clusters = [];
  const singles = [];
  const hidden = []; // co-located non-representative markers (hidden but not clustered-badged)

  for (const item of eligible) {
    if (assigned.has(item)) continue;

    const nearby = collectNearby(item, eligible, assigned, radiusSq);
    if (nearby.length === 0) {
      singles.push(item.marker);
      continue;
    }

    const members = [item, ...nearby];
    for (const m of members) assigned.add(m);

    if (maxPairwiseDistSq(members) < COLOCATED_EPSILON * COLOCATED_EPSILON) {
      assignColocated(members, singles, hidden);
    } else {
      clusters.push({
        x: item.x,
        y: item.y,
        members: members.map(m => m.marker),
        count: members.length
      });
    }
  }

  return { clusters, singles, hidden };
}

/**
 * Render cluster indicators as HTML divs in the overlay.
 * Positions are stored as _svgX/_svgY for later repositioning by repositionAllMarkers.
 */
export function renderClusters(overlay, clusters) {
  clearClusters(overlay);

  for (const cluster of clusters) {
    const div = document.createElement('div');
    div.className = 'map-cluster';
    div.setAttribute('tabindex', '0');
    div.setAttribute('role', 'button');
    div.setAttribute('aria-label', `Group of ${cluster.count} locations, activate to zoom in`);
    div._svgX = cluster.x;
    div._svgY = cluster.y;
    div._clusterData = cluster;

    // Size scales slightly with member count
    const countScale = Math.min(1.5, 1 + (cluster.count - 2) * 0.08);
    const size = Math.round(28 * countScale);
    div.style.width = `${size}px`;
    div.style.height = `${size}px`;

    // Precompute anchor for translate3d positioning (Leaflet pattern)
    div._anchorX = size / 2;
    div._anchorY = size / 2;

    div.appendChild(elem('span', { className: 'map-cluster-text', textContent: cluster.count }));

    overlay.appendChild(div);
  }
}

export function clearClusters(overlay) {
  if (!overlay) return;
  overlay.querySelectorAll('.map-cluster').forEach(el => el.remove());
}

/**
 * Apply clustering results: add .clustered to grouped markers, remove from singles.
 * `hidden` holds co-located non-representative markers, which stay hidden.
 */
export function applyClusterVisibility(clusters, singles, hidden = []) {
  for (const cluster of clusters) {
    for (const marker of cluster.members) {
      marker.classList.add('clustered');
    }
  }
  for (const marker of singles) {
    marker.classList.remove('clustered');
  }
  for (const marker of hidden) {
    marker.classList.add('clustered');
  }
}

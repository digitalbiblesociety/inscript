import { elem } from '../../lib/helpers.esm.js';
import { SVG_WIDTH, CLUSTER_RADIUS_PX, COLOCATED_EPSILON } from './constants.js';

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

  // Sort by tier: lower number = more important = becomes cluster center
  eligible.sort((a, b) => a.tier - b.tier);
  return eligible;
}

function findNearby(item, eligible, assigned, radiusSq) {
  const nearby = [];
  for (const other of eligible) {
    if (assigned.has(other) || other === item) continue;
    const dx = item.x - other.x;
    const dy = item.y - other.y;
    if (dx * dx + dy * dy < radiusSq) {
      nearby.push(other);
    }
  }
  return nearby;
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

function classifyGroup(item, nearby, { clusters, singles, hidden }) {
  const allMembers = [item, ...nearby];

  if (maxPairwiseDistSq(allMembers) < COLOCATED_EPSILON * COLOCATED_EPSILON) {
    const best = allMembers.reduce((a, b) => {
      const av = a.marker.locationData?.verses?.length ?? 0;
      const bv = b.marker.locationData?.verses?.length ?? 0;
      return bv > av ? b : a;
    }, allMembers[0]);
    singles.push(best.marker);
    for (const m of allMembers) {
      if (m !== best) hidden.push(m.marker);
    }
  } else {
    const members = allMembers.map(m => m.marker);
    clusters.push({
      x: item.x,
      y: item.y,
      members,
      count: members.length
    });
  }
}

export function computeClusters(overlay, viewBox, containerWidth) {
  if (!overlay || !containerWidth) return { clusters: [], singles: [], hidden: [] };

  const zoomRatio = viewBox.width / SVG_WIDTH;
  const zoomScale = Math.min(1, zoomRatio * 6);
  const effectiveRadiusPx = CLUSTER_RADIUS_PX * zoomScale;

  const clusterRadiusSvg = effectiveRadiusPx * (viewBox.width / containerWidth);
  const radiusSq = clusterRadiusSvg * clusterRadiusSvg;

  const eligible = collectEligibleMarkers(overlay);

  const assigned = new Set();
  const result = {
    clusters: [],
    singles: [],
    hidden: []
  };

  for (const item of eligible) {
    if (assigned.has(item)) continue;

    const nearby = findNearby(item, eligible, assigned, radiusSq);
    if (nearby.length === 0) {
      result.singles.push(item.marker);
      continue;
    }

    assigned.add(item);
    for (const n of nearby) assigned.add(n);
    classifyGroup(item, nearby, result);
  }

  return result;
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

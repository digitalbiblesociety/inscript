import { geoToSvg } from '../browserbible/js/windows/MapWindow/geo-utils.js';
import { clipRing, clipSegment, simplify } from './basemap-clip.mjs';

const SIMPLIFY_EPS = 0.008;
const RIVER_EPS = 0.025;
const RIVER_MAX_SCALERANK = 6;

const fmt = (n) => (Math.round(n * 10) / 10).toString();

function ringToPath(ring) {
  const proj = ring.map(([lon, lat]) => geoToSvg(lon, lat));
  let d = `M${fmt(proj[0].x)},${fmt(proj[0].y)}`;
  for (let i = 1; i < proj.length; i++) d += `L${fmt(proj[i].x)},${fmt(proj[i].y)}`;
  return d + 'Z';
}

function* eachPolygon(geometry) {
  if (!geometry) return;
  if (geometry.type === 'Polygon') yield geometry.coordinates;
  else if (geometry.type === 'MultiPolygon') yield* geometry.coordinates;
}
function* eachLine(geometry) {
  if (!geometry) return;
  if (geometry.type === 'LineString') yield geometry.coordinates;
  else if (geometry.type === 'MultiLineString') yield* geometry.coordinates;
}

export function polygonLayerPath(fc) {
  let d = '';
  let rings = 0;
  for (const feature of fc.features) {
    for (const polygon of eachPolygon(feature.geometry)) {
      for (const ring of polygon) {
        const clipped = clipRing(ring);
        if (clipped.length < 4) continue;
        const simplified = simplify(clipped, SIMPLIFY_EPS);
        if (simplified.length < 4) continue;
        d += ringToPath(simplified);
        rings++;
      }
    }
  }
  return { d, rings };
}

export function riverLayerPath(fc) {
  let d = '';
  let segs = 0;
  for (const feature of fc.features) {
    const rank = feature.properties?.scalerank;
    if (typeof rank === 'number' && rank > RIVER_MAX_SCALERANK) continue;
    for (const line of eachLine(feature.geometry)) {
      const simplified = simplify(line, RIVER_EPS);
      for (let i = 0; i < simplified.length - 1; i++) {
        const seg = clipSegment(simplified[i][0], simplified[i][1], simplified[i + 1][0], simplified[i + 1][1]);
        if (!seg) continue;
        const a = geoToSvg(seg[0][0], seg[0][1]);
        const b = geoToSvg(seg[1][0], seg[1][1]);
        d += `M${fmt(a.x)},${fmt(a.y)}L${fmt(b.x)},${fmt(b.y)}`;
        segs++;
      }
    }
  }
  return { d, segs };
}

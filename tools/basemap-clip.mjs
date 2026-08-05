import { MAP_BOUNDS } from '../browserbible/js/windows/MapWindow/constants.js';

const BBOX = {
  minLon: MAP_BOUNDS.minLon,
  maxLon: MAP_BOUNDS.maxLon,
  minLat: MAP_BOUNDS.minLat,
  maxLat: MAP_BOUNDS.maxLat
};

const interpX = (a, b, cx) => [cx, a[1] + ((cx - a[0]) / (b[0] - a[0])) * (b[1] - a[1])];
const interpY = (a, b, cy) => [a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), cy];

function clipEdge(poly, inside, intersect) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

export function clipRing(ring) {
  let p = ring;
  p = clipEdge(p, c => c[0] >= BBOX.minLon, (a, b) => interpX(a, b, BBOX.minLon));
  if (!p.length) return p;
  p = clipEdge(p, c => c[0] <= BBOX.maxLon, (a, b) => interpX(a, b, BBOX.maxLon));
  if (!p.length) return p;
  p = clipEdge(p, c => c[1] >= BBOX.minLat, (a, b) => interpY(a, b, BBOX.minLat));
  if (!p.length) return p;
  p = clipEdge(p, c => c[1] <= BBOX.maxLat, (a, b) => interpY(a, b, BBOX.maxLat));
  return p;
}

/** One Liang-Barsky axis test; null rejects the segment, else updated [t0, t1]. */
function clipParam(p, q, t0, t1) {
  if (p === 0) return q < 0 ? null : [t0, t1];
  const r = q / p;
  if (p < 0) {
    if (r > t1) return null;
    return [Math.max(t0, r), t1];
  }
  if (r < t0) return null;
  return [t0, Math.min(t1, r)];
}

export function clipSegment(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - BBOX.minLon, BBOX.maxLon - x0, y0 - BBOX.minLat, BBOX.maxLat - y0];
  let t = [0, 1];
  for (let i = 0; i < 4; i++) {
    t = clipParam(p[i], q[i], t[0], t[1]);
    if (!t) return null;
  }
  return [[x0 + t[0] * dx, y0 + t[0] * dy], [x0 + t[1] * dx, y0 + t[1] * dy]];
}

export function simplify(points, eps) {
  if (points.length < 3) return points;
  const sqEps = eps * eps;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = points[s];
    const [bx, by] = points[e];
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy || 1e-12;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = points[i];
      const t = ((px - ax) * dx + (py - ay) * dy) / len;
      const cx = ax + t * dx, cy = ay + t * dy;
      const d = (px - cx) ** 2 + (py - cy) ** 2;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > sqEps && idx !== -1) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

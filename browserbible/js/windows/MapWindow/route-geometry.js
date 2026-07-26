/**
 * Pure math for journey route overlays: projects geographic waypoints into
 * SVG space and smooths them into cubic-bezier path strings. No DOM or SVG
 * APIs, so everything here is unit-testable in jsdom.
 */

import { geoToSvg } from './geo-utils.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Project a leg geographic points (from + via + to), each [lon, lat], into SVG space.
 */
export function legPointsToSvg(fromCoords, via, toCoords) {
  return [fromCoords, ...(via || []), toCoords]
    .map(([lon, lat]) => geoToSvg(lon, lat));
}

/**
 * Build an SVG path `d` through the given points using a uniform Catmull-Rom
 * spline converted to cubic beziers. Endpoints are duplicated as phantom
 * points, so the curve passes through every input point and a two-point
 * input yields a straight segment.
 * A `tension` of 1 is standard Catmull-Rom, 0 gives straight lines. Fewer than
 * two points yields an empty string.
 */
export function catmullRomPath(points, tension = 1) {
  if (!points || points.length < 2) return '';

  const p = [points[0], ...points, points[points.length - 1]];
  let d = `M${round2(points[0].x)},${round2(points[0].y)}`;

  for (let i = 1; i < p.length - 2; i++) {
    const c1x = p[i].x + ((p[i + 1].x - p[i - 1].x) / 6) * tension;
    const c1y = p[i].y + ((p[i + 1].y - p[i - 1].y) / 6) * tension;
    const c2x = p[i + 1].x - ((p[i + 2].x - p[i].x) / 6) * tension;
    const c2y = p[i + 1].y - ((p[i + 2].y - p[i].y) / 6) * tension;
    d += ` C${round2(c1x)},${round2(c1y)} ${round2(c2x)},${round2(c2y)} ${round2(p[i + 1].x)},${round2(p[i + 1].y)}`;
  }

  return d;
}

/** Convenience: geographic leg definition to a smoothed SVG path string. */
export function buildLegPath(fromCoords, via, toCoords) {
  return catmullRomPath(legPointsToSvg(fromCoords, via, toCoords));
}

/**
 * Every geographic point of a journey (stops plus leg waypoints) shaped as
 * location-like objects for centerOnBounds().
 */
export function journeyBoundsLocations(journey) {
  const locations = (journey.stops || []).map(s => ({ coordinates: s.coordinates }));
  for (const leg of journey.legs || []) {
    for (const coordinates of leg.via || []) {
      locations.push({ coordinates });
    }
  }
  return locations;
}

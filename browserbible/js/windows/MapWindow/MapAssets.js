import { getConfig } from '../../core/config.js';
import { NT_BOOKS } from '../../bible/BibleData.js';
import { loadLocationData, loadJourneyData } from './map-data.js';

// Map assets never change, so panels share one fetch across open/close
// cycles. Failures aren't cached; a later open retries.
let _svgTextPromise = null;
export function fetchSvgText() {
  if (!_svgTextPromise) {
    _svgTextPromise = fetch(`${getConfig().baseContentUrl}content/maps/biblical-map.svg`).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });
    _svgTextPromise.catch(() => { _svgTextPromise = null; });
  }
  return _svgTextPromise;
}

/** Precompute era for each location (verse IDs use 2-char book prefixes; NT/OT sets don't collide). */
function tagLocationEras(mapData) {
  const ntBookSet = new Set(NT_BOOKS);
  for (const loc of mapData) {
    let hasOT = false, hasNT = false;
    for (const v of loc.verses) {
      if (ntBookSet.has(v.slice(0, 2))) { hasNT = true; } else { hasOT = true; }
      if (hasOT && hasNT) break;
    }
    loc._era = (hasOT && hasNT) ? 'both' : (hasNT ? 'nt' : 'ot');
  }
  return mapData;
}

let _pinDataPromise = null;
export function fetchPinData() {
  if (!_pinDataPromise) {
    _pinDataPromise = loadLocationData().then(tagLocationEras);
    _pinDataPromise.catch(() => { _pinDataPromise = null; });
  }
  return _pinDataPromise;
}

let _journeyDataPromise = null;
export function fetchJourneyData() {
  if (!_journeyDataPromise) {
    _journeyDataPromise = loadJourneyData();
    _journeyDataPromise.catch(() => { _journeyDataPromise = null; });
  }
  return _journeyDataPromise;
}

// Cached AVIF decode-support probe (1×1 AVIF data URI). Resolves once, reused thereafter.
let _avifSupport = null;
function supportsAvif() {
  if (_avifSupport) return _avifSupport;
  _avifSupport = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgABogQEDQgMgkQAAAAB8dSLfI=';
  });
  return _avifSupport;
}

/**
 * Lazy-load the (large) shaded-relief raster: the basemap ships the <image> with
 * no href, so the vector coastline + pins paint immediately; we set the href once
 * the browser is idle. If the format can't be decoded, the flat land fill remains.
 */
export function lazyLoadRelief(svgElement) {
  const img = svgElement?.querySelector('#relief-layer');
  if (!img) return;
  const avif = img.getAttribute('data-src');
  const webp = img.getAttribute('data-src-fallback');
  const apply = async () => {
    const src = (avif && await supportsAvif()) ? avif : (webp || avif);
    if (src) img.setAttribute('href', src);
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(apply, { timeout: 1500 });
  else setTimeout(apply, 200);
}

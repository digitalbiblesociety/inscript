export const MAP_BOUNDS = {
  minLat: 26,
  maxLat: 44,
  minLon: 10,
  maxLon: 50
};

// Longitude degrees are compressed by cos(standard parallel) so that east–west
// and north–south scales match (square pixels → geographically faithful shapes).
// The standard parallel is the mid-latitude of the bounds.
const STANDARD_PARALLEL = (MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2; // 27.5°
export const PROJ_COS_PHI0 = Math.cos(STANDARD_PARALLEL * Math.PI / 180);
export const SVG_WIDTH = 1200;
export const PADDING = 40;
export const CONTENT_WIDTH = SVG_WIDTH - 2 * PADDING;

// Uniform scale in SVG px per degree of latitude. Width fixes the scale; height
// then follows from the latitude range so pixels stay square.
const LON_RANGE = MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon;
const LAT_RANGE = MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat;
export const PROJ_SCALE = CONTENT_WIDTH / (LON_RANGE * PROJ_COS_PHI0);

// Derived so the viewBox matches the projected aspect (no built-in distortion).
export const CONTENT_HEIGHT = LAT_RANGE * PROJ_SCALE;     // ≈ 572.6
export const SVG_HEIGHT = CONTENT_HEIGHT + 2 * PADDING;   // ≈ 652.6

export const IMPORTANT_LOCATIONS = new Set([
  'Rome', 'Athens', 'Corinth', 'Ephesus', 'Antioch', 'Alexandria',
  'Thessalonica', 'Philippi', 'Galatia', 'Colossae', 'Patmos',
  'Crete', 'Malta', 'Puteoli', 'Cyprus', 'Iconium', 'Lystra', 'Derbe',
  'Troas', 'Miletus', 'Caesarea Philippi', 'Decapolis', 'Petra'
]);

export const DEMOTED_LOCATIONS = new Set([
  'Most Holy Place', 'Most Holy Place 2', 'Holy Place', 'Holy Place 2',
  'Mount Seir 1',
  'Valley of the Son of Hinnom', 'Zorah', 'Valley of the Arnon',
  'Kadesh-barnea', 'Mount Hor', 'Shephelah', 'Succoth',
  'Jazer', 'Jabesh-gilead', 'Tirzah',
  'Hazor', 'Ziklag', 'Gezer', 'Rabbah', 'Ramah',
  'Ashkelon', 'Megiddo', 'Aroer', 'Ekron', 'Lachish',
  'Mahanaim?', 'Kiriath-jearim?'
]);

// Default map center (Jerusalem) used before any saved position exists
export const DEFAULT_CENTER = { lat: 31.78, lon: 35.23 };
export const MIN_VIEW_WIDTH = 12;
export const ZOOM_STEP = 1.5;
export const WHEEL_ZOOM_FACTOR = 1.1;
export const ARROW_KEY_PAN_FRACTION = 0.15;
export const CLUSTER_RADIUS_PX = 60;

// Markers closer than this are treated as the same geographic point
export const COLOCATED_EPSILON = 0.5;

// Safety margin applied to the computed cluster-breaking viewBox width so one
// cluster click reliably zooms past the radius where the cluster re-forms
export const CLUSTER_BREAK_MARGIN = 0.75;

export const ICON_SIZES = {
  1: 28,
  2: 22,
  3: 18,
  4: 14
};


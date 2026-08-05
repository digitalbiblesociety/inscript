import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { PADDING, SVG_WIDTH, SVG_HEIGHT } from '../browserbible/js/windows/MapWindow/constants.js';

export const CACHE = join(tmpdir(), 'browserbible-basemap-cache', 'terrarium');
export const ZOOM = 8;
export const CONTENT_W = SVG_WIDTH - 2 * PADDING;
export const CONTENT_H = SVG_HEIGHT - 2 * PADDING;

const SCALE = 4;
export const OUT_W = Math.round(CONTENT_W * SCALE);
export const OUT_H = Math.round(CONTENT_H * SCALE);

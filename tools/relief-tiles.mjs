import { writeFile, readFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';

import { CACHE, ZOOM } from './relief-config.mjs';
import { decodePng } from './relief-png.mjs';

const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const n = 2 ** ZOOM;
export const lonToGX = (lon) => ((lon + 180) / 360) * n * 256;
export const latToGY = (lat) => {
  const r = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
  return (1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * n * 256;
};

export async function fetchTile(z, x, y) {
  await mkdir(join(CACHE, `${z}/${x}`), { recursive: true });
  const file = join(CACHE, `${z}/${x}/${y}.png`);
  try { await access(file); return readFile(file); } catch {  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(TILE_URL(z, x, y));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = Buffer.from(await res.arrayBuffer());
      await writeFile(file, data);
      return data;
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
}

export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }));
  return results;
}

function copyTileElevation(buffer, elev, mosaicW, ox, oy) {
  const { data, channels } = decodePng(buffer);
  for (let yy = 0; yy < 256; yy++) {
    for (let xx = 0; xx < 256; xx++) {
      const s = (yy * 256 + xx) * channels;
      const e = data[s] * 256 + data[s + 1] + data[s + 2] / 256 - 32768;
      elev[(oy + yy) * mosaicW + (ox + xx)] = e;
    }
  }
}

export async function buildElevationMosaic(x0, x1, y0, y1) {
  const tiles = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push({ x, y });
  process.stdout.write(`  relief: ${tiles.length} terrarium tiles (z${ZOOM}, x${x0}..${x1}, y${y0}..${y1})\n`);

  const mosaicW = (x1 - x0 + 1) * 256;
  const mosaicH = (y1 - y0 + 1) * 256;
  const elev = new Float32Array(mosaicW * mosaicH);

  const buffers = await pool(tiles, 12, t => fetchTile(ZOOM, t.x, t.y));
  tiles.forEach((t, k) => {
    if (!buffers[k]) return;
    copyTileElevation(buffers[k], elev, mosaicW, (t.x - x0) * 256, (t.y - y0) * 256);
  });

  return { elev, mosaicW, mosaicH };
}

/** Bilinear elevation sampler over the mosaic, addressed by lon/lat. */
export function makeSampler(elev, mosaicW, mosaicH, ox, oy) {
  return (lon, lat) => {
    const gx = lonToGX(lon) - ox;
    const gy = latToGY(lat) - oy;
    const fx = Math.max(0, Math.min(mosaicW - 1.001, gx));
    const fy = Math.max(0, Math.min(mosaicH - 1.001, gy));
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const i = iy * mosaicW + ix;
    const a = elev[i], b = elev[i + 1], c = elev[i + mosaicW], d = elev[i + mosaicW + 1];
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  };
}

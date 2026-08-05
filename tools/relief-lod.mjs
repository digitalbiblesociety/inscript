import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAP_BOUNDS, PADDING } from '../browserbible/js/windows/MapWindow/constants.js';
import { geoToSvg } from '../browserbible/js/windows/MapWindow/geo-utils.js';
import { OUT_W, OUT_H, CONTENT_W, CONTENT_H } from './relief-config.mjs';

const MAPS_JSON = join(dirname(fileURLToPath(import.meta.url)), '../browserbible/public/content/maps/maps.json');

const LOD_BANDWIDTH_DEG = 1.6;
const LOD_BLUR_FACTOR = 5;
const LOD_BLUR_FACTOR2 = 14;
const LOD_DESOLATE_T = 0.18;
const LOD_FLOOR = 0.12;
const LOD_GAMMA = 0.6;
const LOD_NORM_PCTL = 0.80;
const LOD_WEIGHT = (verses) => Math.min(3, 1 + Math.log10(1 + (verses || 0)));

export async function buildDetailWeight() {
  const locs = JSON.parse(await readFile(MAPS_JSON, 'utf8'));
  const DS = 8;
  const dW = Math.ceil(OUT_W / DS), dH = Math.ceil(OUT_H / DS);
  const dens = new Float64Array(dW * dH);

  const lonRange = MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon;
  const bwCells = (LOD_BANDWIDTH_DEG / lonRange) * OUT_W / DS;
  const inv2s2 = 1 / (2 * bwCells * bwCells);
  const rad = Math.ceil(bwCells * 3);

  let placed = 0;
  for (const l of locs) {
    const [lon, lat] = l.coordinates;
    const { x, y } = geoToSvg(lon, lat);
    const px = (x - PADDING) / CONTENT_W * OUT_W;
    const py = (y - PADDING) / CONTENT_H * OUT_H;
    if (px < 0 || px >= OUT_W || py < 0 || py >= OUT_H) continue;
    placed++;
    const cx = px / DS, cy = py / DS;
    const w = LOD_WEIGHT(l.verses?.length);
    const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(dW - 1, Math.ceil(cx + rad));
    const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(dH - 1, Math.ceil(cy + rad));
    for (let gy = y0; gy <= y1; gy++) {
      const ddy = gy - cy;
      for (let gx = x0; gx <= x1; gx++) {
        const ddx = gx - cx;
        dens[gy * dW + gx] += w * Math.exp(-(ddx * ddx + ddy * ddy) * inv2s2);
      }
    }
  }

  const nonzero = Array.from(dens).filter(v => v > 0).sort((a, b) => a - b);
  const ref = nonzero.length ? nonzero[Math.floor(nonzero.length * LOD_NORM_PCTL)] : 1;
  const detail = new Float32Array(dW * dH);
  for (let i = 0; i < dens.length; i++) {
    detail[i] = Math.min(1, Math.pow(dens[i] / ref, LOD_GAMMA));
  }
  return { detail, dW, dH, DS, placed };
}

export function makeSmoothBase(rgb, factor) {
  const sw = Math.ceil(OUT_W / factor), sh = Math.ceil(OUT_H / factor);
  const acc = new Float32Array(sw * sh * 3), cnt = new Float32Array(sw * sh);
  for (let y = 0; y < OUT_H; y++) {
    const sy = (y / factor) | 0;
    for (let x = 0; x < OUT_W; x++) {
      const si = sy * sw + ((x / factor) | 0), o = (y * OUT_W + x) * 3;
      acc[si * 3] += rgb[o]; acc[si * 3 + 1] += rgb[o + 1]; acc[si * 3 + 2] += rgb[o + 2]; cnt[si]++;
    }
  }
  for (let i = 0; i < sw * sh; i++) if (cnt[i]) { acc[i * 3] /= cnt[i]; acc[i * 3 + 1] /= cnt[i]; acc[i * 3 + 2] /= cnt[i]; }
  const out = Buffer.alloc(OUT_W * OUT_H * 3);
  for (let y = 0; y < OUT_H; y++) {
    const fy = Math.min(sh - 1.001, y / factor), iy = fy | 0, ty = fy - iy;
    for (let x = 0; x < OUT_W; x++) {
      const fx = Math.min(sw - 1.001, x / factor), ix = fx | 0, tx = fx - ix;
      const i00 = (iy * sw + ix) * 3, i10 = i00 + 3, i01 = i00 + sw * 3, i11 = i01 + 3, o = (y * OUT_W + x) * 3;
      for (let c = 0; c < 3; c++) {
        out[o + c] = acc[i00 + c] * (1 - tx) * (1 - ty) + acc[i10 + c] * tx * (1 - ty)
                   + acc[i01 + c] * (1 - tx) * ty + acc[i11 + c] * tx * ty;
      }
    }
  }
  return out;
}

/**
 * Blend rgb (in place) toward two blur levels so sparsely annotated regions
 * lose detail. Returns the count of pixels kept at near-full sharpness.
 */
export function applyDetailBlend(rgb, { detail, dW, dH, DS }) {
  const base1 = makeSmoothBase(rgb, LOD_BLUR_FACTOR);
  const base2 = makeSmoothBase(rgb, LOD_BLUR_FACTOR2);
  let sharpPx = 0;
  for (let py = 0; py < OUT_H; py++) {
    const fy = Math.min(dH - 1.001, py / DS), iy = fy | 0, ty = fy - iy;
    for (let px = 0; px < OUT_W; px++) {
      const fx = Math.min(dW - 1.001, px / DS), ix = fx | 0, tx = fx - ix;
      const i00 = iy * dW + ix;
      const d = detail[i00] * (1 - tx) * (1 - ty) + detail[i00 + 1] * tx * (1 - ty)
              + detail[i00 + dW] * (1 - tx) * ty + detail[i00 + dW + 1] * tx * ty;
      const e = Math.min(1, Math.max(0, (LOD_DESOLATE_T - d) / LOD_DESOLATE_T));
      const w = d * (1 - LOD_FLOOR) + LOD_FLOOR * (1 - e);
      if (w > 0.8) sharpPx++;
      const o = (py * OUT_W + px) * 3;
      for (let c = 0; c < 3; c++) {
        const base = base1[o + c] + e * (base2[o + c] - base1[o + c]);
        rgb[o + c] = Math.max(0, Math.min(255, base + w * (rgb[o + c] - base)));
      }
    }
  }
  return sharpPx;
}

import { execFileSync } from 'node:child_process';

const MAGICK = (() => {
  try { execFileSync('magick', ['-version'], { stdio: 'ignore' }); return ['magick']; }
  catch { return ['convert']; }
})();
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { MAP_BOUNDS, PADDING } from '../browserbible/js/windows/MapWindow/constants.js';
import { svgToGeo } from '../browserbible/js/windows/MapWindow/geo-utils.js';
import { CACHE, CONTENT_W, CONTENT_H, OUT_W, OUT_H } from './relief-config.mjs';
import { lonToGX, latToGY, buildElevationMosaic, makeSampler } from './relief-tiles.mjs';
import { buildDetailWeight, applyDetailBlend } from './relief-lod.mjs';

const RAMP = [
  [-500, [196, 210, 170]], [0, [202, 222, 156]], [200, [222, 216, 150]],
  [600, [214, 190, 130]], [1200, [196, 160, 104]], [2200, [160, 120, 82]],
  [3200, [188, 170, 150]], [4500, [240, 240, 240]]
];
function tint(elev) {
  if (elev <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) {
    if (elev <= RAMP[i][0]) {
      const [e0, c0] = RAMP[i - 1], [e1, c1] = RAMP[i];
      const t = (elev - e0) / (e1 - e0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

function logElevationChecks(sample) {
  const checks = {
    'Dead Sea (35.5,31.5)': sample(35.5, 31.5),
    'Mediterranean (32,34)': sample(32, 34),
    'Mt Ararat (44.3,39.7)': sample(44.3, 39.7),
    'C Anatolia (35,39)': sample(35, 39)
  };
  process.stdout.write('  elevation check: ' +
    Object.entries(checks).map(([k, v]) => `${k}=${v.toFixed(0)}m`).join(', ') + '\n');
}

function renderShadedRelief(sample) {
  const ZF = 5, azRad = (360 - 315 + 90) * Math.PI / 180, zenith = (90 - 45) * Math.PI / 180;
  const dLon = (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon) / OUT_W;
  const dLat = (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat) / OUT_H;
  const rgb = Buffer.alloc(OUT_W * OUT_H * 3);

  for (let py = 0; py < OUT_H; py++) {
    const sy = PADDING + ((py + 0.5) / OUT_H) * CONTENT_H;
    for (let px = 0; px < OUT_W; px++) {
      const sx = PADDING + ((px + 0.5) / OUT_W) * CONTENT_W;
      const { lon, lat } = svgToGeo(sx, sy);
      const e = sample(lon, lat);

      const latRad = lat * Math.PI / 180;
      const dzdx = (sample(lon + dLon, lat) - sample(lon - dLon, lat)) / (2 * dLon * 111320 * Math.cos(latRad));
      const dzdy = (sample(lon, lat - dLat) - sample(lon, lat + dLat)) / (2 * dLat * 110540);
      const slope = Math.atan(ZF * Math.hypot(dzdx, dzdy));
      let aspect = Math.atan2(dzdy, -dzdx);
      if (aspect < 0) aspect += 2 * Math.PI;
      let hs = Math.cos(zenith) * Math.cos(slope) + Math.sin(zenith) * Math.sin(slope) * Math.cos(azRad - aspect);
      hs = Math.max(0, hs);

      const [r, g, b] = tint(e);
      const f = 0.55 + 0.7 * hs;
      const o = (py * OUT_W + px) * 3;
      rgb[o] = Math.max(0, Math.min(255, r * f));
      rgb[o + 1] = Math.max(0, Math.min(255, g * f));
      rgb[o + 2] = Math.max(0, Math.min(255, b * f));
    }
  }
  return rgb;
}

async function writeDebugWeight({ detail, dW, dH, DS }) {
  const dbg = Buffer.alloc(OUT_W * OUT_H);
  for (let py = 0; py < OUT_H; py++) for (let px = 0; px < OUT_W; px++) {
    dbg[py * OUT_W + px] = Math.round(detail[Math.min(dH - 1, (py / DS) | 0) * dW + Math.min(dW - 1, (px / DS) | 0)] * 255);
  }
  const dbgRaw = join(CACHE, 'weight.gray');
  await writeFile(dbgRaw, dbg);
  execFileSync(MAGICK[0], [...MAGICK.slice(1), '-size', `${OUT_W}x${OUT_H}`, '-depth', '8', `GRAY:${dbgRaw}`, process.env.RELIEF_DEBUG]);
}

async function encodeOutputs(rgb, targets, defaultQuality) {
  const rawFile = join(CACHE, 'relief.rgb');
  await writeFile(rawFile, rgb);
  for (const t of targets) {
    const enc = [...MAGICK.slice(1), '-size', `${OUT_W}x${OUT_H}`, '-depth', '8', `RGB:${rawFile}`];
    if (/\.avif$/i.test(t.path)) enc.push('-define', 'heic:speed=5');
    enc.push('-quality', String(t.quality ?? defaultQuality), t.path);
    execFileSync(MAGICK[0], enc);
    const bytes = (await readFile(t.path)).length;
    process.stdout.write(`  relief: wrote ${t.path} (${OUT_W}×${OUT_H}, ${(bytes / 1024).toFixed(0)} KB)\n`);
  }
}

export async function buildRelief({ outputs, outPath, quality = 55 }) {
  const x0 = Math.floor(lonToGX(MAP_BOUNDS.minLon) / 256);
  const x1 = Math.floor(lonToGX(MAP_BOUNDS.maxLon) / 256);
  const y0 = Math.floor(latToGY(MAP_BOUNDS.maxLat) / 256);
  const y1 = Math.floor(latToGY(MAP_BOUNDS.minLat) / 256);

  const { elev, mosaicW, mosaicH } = await buildElevationMosaic(x0, x1, y0, y1);
  const sample = makeSampler(elev, mosaicW, mosaicH, x0 * 256, y0 * 256);
  logElevationChecks(sample);

  const rgb = renderShadedRelief(sample);

  const lod = await buildDetailWeight();
  const sharpPx = applyDetailBlend(rgb, lod);
  process.stdout.write(`  relief LOD: ${lod.placed} locations, ${(100 * sharpPx / (OUT_W * OUT_H)).toFixed(0)}% of pixels at near-full detail\n`);

  if (process.env.RELIEF_DEBUG) {
    await writeDebugWeight(lod);
  }

  await encodeOutputs(rgb, outputs || [{ path: outPath, quality }], quality);
  return { width: OUT_W, height: OUT_H };
}

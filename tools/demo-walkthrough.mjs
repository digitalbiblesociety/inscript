#!/usr/bin/env node

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile, readFile, rename, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const opts = {
    url: null,
    port: 5179,
    site: 'inscript',
    content: 'demo',
    out: join(rootDir, 'demo-output'),
    width: 1600,
    height: 900,
    video: true,
    cursor: true,
    headed: false,
    dwell: 1,
    only: null,
    from: null,
    gif: false,
    gifOnly: false,
    gifWidth: 1200,
    gifFps: 8,
    gifColors: 64,
    gifName: 'inscript-walkthrough.gif'
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i];

    switch (arg) {
      case '--url': opts.url = value(); break;
      case '--port': opts.port = Number(value()); break;
      case '--site': opts.site = value(); break;
      case '--content': opts.content = value(); break;
      case '--out': opts.out = resolve(value()); break;
      case '--viewport': {
        const [w, h] = value().split('x').map(Number);
        opts.width = w; opts.height = h;
        break;
      }
      case '--gif': opts.gif = true; break;
      case '--gif-only': opts.gif = true; opts.gifOnly = true; break;
      case '--gif-width': opts.gifWidth = Number(value()); break;
      case '--gif-fps': opts.gifFps = Number(value()); break;
      case '--gif-colors': opts.gifColors = Number(value()); break;
      case '--gif-name': opts.gifName = value(); break;
      case '--no-video': opts.video = false; break;
      case '--no-cursor': opts.cursor = false; break;
      case '--headed': opts.headed = true; break;
      case '--fast': opts.dwell = 0.4; break;
      case '--slow': opts.dwell = 1.6; break;
      case '--dwell': opts.dwell = Number(value()); break;
      case '--only': opts.only = value().split(',').map(s => s.trim()).filter(Boolean); break;
      case '--from': opts.from = value(); break;
      case '--help': case '-h': opts.help = true; break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return opts;
}

const HELP = `
Record a walkthrough of inScript by playing its in-app guided tour.

  --url <url>          Record an already-running app instead of booting one
  --port <n>           Port for the dev server this script starts (default 5179)
  --site <profile>     Build profile for that server (default inscript)
  --content demo|local|none
                       Which runtime preset to load (?custom=). demo (default)
                       takes texts from the content CDN and searches
                       client-side; local serves the starter pack from public/;
                       none records the app exactly as deployed. Use it with
                       --url against a real site, where the search API and the
                       audio/API.Bible proxies accept the origin.
  --viewport <WxH>     Recording size (default 1600x900)
  --out <dir>          Output directory (default demo-output/)
  --only <ids>         Record only these tour steps, comma-separated
  --from <id>          Start at this step
  --fast | --slow      Shorten or lengthen the pause on each step
  --dwell <factor>     Fine control over that pause (1 = default)
  --gif                Also write a GIF beside the video (needs ffmpeg)
  --gif-only           Re-encode the GIF from the video already in --out,
                       without recording again. Use it to tune the settings below.
  --gif-width <px>     GIF width, height follows (default 1200)
  --gif-fps <n>        GIF frame rate (default 8)
  --gif-colors <n>     Palette size (default 64)
  --gif-name <file>    Output filename (default inscript-walkthrough.gif)
  --no-video           Screenshots only
  --no-cursor          Don't draw the demo cursor
  --headed             Show the browser while recording
`;

const sleep = (ms) => new Promise(resolve => { setTimeout(resolve, ms); });

const pad = (n) => String(n).padStart(2, '0');

async function startServer({ port, site }) {
  const child = spawn(
    'pnpm',
    ['exec', 'vite', '--port', String(port), '--strictPort', '--open', 'false'],
    { cwd: rootDir, env: { ...process.env, SITE: site }, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });

  const url = `http://localhost:${port}/`;
  const deadline = Date.now() + 60_000;

  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`vite exited with code ${child.exitCode}:\n${log}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) break;
    } catch {
      void 0;
    }
    if (Date.now() > deadline) throw new Error(`vite did not start on ${port}:\n${log}`);
    await sleep(250);
  }

  return { url, stop: () => child.kill('SIGTERM') };
}

const CURSOR_SCRIPT = `
  (() => {
    const draw = () => {
      if (document.getElementById('demo-cursor')) return;
      const style = document.createElement('style');
      style.textContent = \`
        #demo-cursor, #demo-cursor:popover-open {
          position: fixed; inset: auto; left: -100px; top: -100px;
          width: 22px; height: 22px; margin: -11px 0 0 -11px;
          padding: 0; border-radius: 50%; overflow: visible;
          pointer-events: none; background: oklch(0.62 0.17 254 / 0.4);
          border: 2px solid oklch(1 0 0 / 0.95);
          box-shadow: 0 1px 6px oklch(0 0 0 / 0.5);
          transition: scale 0.12s ease;
        }
        #demo-cursor::backdrop { background: transparent; }
        #demo-cursor.down { scale: 0.7; background: oklch(0.62 0.17 254 / 0.8); }
        #demo-cursor .demo-ripple {
          position: absolute; left: 50%; top: 50%;
          width: 14px; height: 14px; margin: -7px 0 0 -7px;
          border-radius: 50%; pointer-events: none;
          border: 2px solid oklch(0.62 0.17 254 / 0.9);
          animation: demo-ripple 0.55s ease-out forwards;
        }
        @keyframes demo-ripple { to { scale: 3.4; opacity: 0; } }
      \`;
      document.head.appendChild(style);

      const dot = document.createElement('div');
      dot.id = 'demo-cursor';
      dot.popover = 'manual';
      document.body.appendChild(dot);

      const raise = () => {
        try {
          if (dot.matches(':popover-open')) dot.hidePopover();
          dot.showPopover();
        } catch { void 0; }
      };
      window.__demoCursorRaise = raise;
      raise();

      addEventListener('mousemove', (e) => {
        dot.style.left = e.clientX + 'px';
        dot.style.top = e.clientY + 'px';
      }, true);
      addEventListener('mousedown', () => {
        dot.classList.add('down');
        const ripple = document.createElement('div');
        ripple.className = 'demo-ripple';
        dot.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      }, true);
      addEventListener('mouseup', () => dot.classList.remove('down'), true);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', draw);
    } else {
      draw();
    }
  })();
`;

let pointer = null;

async function glide(page, x, y) {
  const from = pointer ?? { x: page.viewportSize().width / 2, y: 24 };
  const distance = Math.hypot(x - from.x, y - from.y);
  const steps = Math.max(6, Math.min(20, Math.round(distance / 45)));

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - ((1 - t) ** 2) * 2;
    await page.mouse.move(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased);
    await sleep(10);
  }
  pointer = { x, y };
}

async function pointOfInterest(page) {
  return page.evaluate(() => {
    const box = window.BrowserBible.tour().getState().spotlight
      ?? document.querySelector('.tour-layer .tour-card')?.getBoundingClientRect();
    if (!box) return null;
    const y = box.height > 300
      ? box.top + Math.min(210, Math.max(140, box.height * 0.18))
      : box.top + box.height / 2;
    return { x: Math.round(box.left + box.width / 2), y: Math.round(y) };
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', d => { err += d; });
    child.on('error', () => reject(new Error('ffmpeg not found. Install it, or drop --gif.')));
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}):\n${err.trim()}`));
    });
  });
}

function hasGifsicle() {
  return new Promise(resolve => {
    const child = spawn('gifsicle', ['--version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', code => resolve(code === 0));
  });
}

async function makeGif(videoPath, gifPath, { width, fps, colors }) {
  const palette = `${gifPath}.palette.png`;
  const chain = `fps=${fps},mpdecimate,scale=${width}:-1:flags=lanczos`;

  await runFfmpeg(['-i', videoPath, '-vf',
    `${chain},palettegen=stats_mode=diff:max_colors=${colors}`, '-y', palette]);
  await runFfmpeg([
    '-i', videoPath, '-i', palette,
    '-lavfi', `${chain}[v];[v][1:v]paletteuse=dither=none:diff_mode=rectangle`,
    '-fps_mode', 'vfr', '-loop', '0', '-y', gifPath
  ]);
  await rm(palette, { force: true });

  if (await hasGifsicle()) {
    await new Promise((resolve, reject) => {
      const child = spawn('gifsicle', ['-O3', '--lossy=60', gifPath, '-o', gifPath], { stdio: 'ignore' });
      child.on('error', reject);
      child.on('close', code => (code === 0 ? resolve() : reject(new Error(`gifsicle failed (${code})`))));
    });
  }
}

function dwellFor(step, factor) {
  const words = `${step.title ?? ''} ${step.body ?? ''}`.trim().split(/\s+/).length;
  return Math.round(Math.min(7000, Math.max(1700, words * 185)) * factor);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }

  if (opts.gifOnly) {
    const video = join(opts.out, 'inscript-walkthrough.webm');
    if (!existsSync(video)) throw new Error(`No recording at ${video}. Run without --gif-only first.`);

    const gif = join(opts.out, opts.gifName);
    console.log(`[demo] converting to GIF at ${opts.gifWidth}px / ${opts.gifFps}fps / ${opts.gifColors} colours…`);
    await makeGif(video, gif, { width: opts.gifWidth, fps: opts.gifFps, colors: opts.gifColors });

    const manifestPath = join(opts.out, 'walkthrough.json');
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.gif = opts.gifName;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await writeFile(join(opts.out, 'index.html'), contactSheet(manifest));
    }

    const size = ((await stat(gif)).size / 1024 / 1024).toFixed(1);
    console.log(`[demo] gif → ${gif}  (${size} MB)`);
    return;
  }

  const screensDir = join(opts.out, 'screens');
  const videoDir = join(opts.out, '.video');
  await rm(opts.out, { recursive: true, force: true });
  await mkdir(screensDir, { recursive: true });

  let server = null;
  if (!opts.url) {
    if (!existsSync(join(rootDir, 'node_modules'))) {
      throw new Error('Dependencies are not installed. Run `pnpm install` first.');
    }
    console.log(`[demo] starting vite (SITE=${opts.site}) on port ${opts.port}…`);
    server = await startServer(opts);
  }

  const base = (opts.url ?? server.url).replace(/\/+$/, '/');
  const params = new URLSearchParams();
  if (opts.content !== 'none') params.set('custom', opts.content);
  params.set('w1', 'bible');
  params.set('t1', 'ENGWEB');
  params.set('v1', 'JN1_1');
  params.set('w2', 'bible');
  params.set('t2', opts.content === 'local' ? 'SPABES' : 'ENGASV');
  params.set('v2', 'JN1_1');
  params.set('tour', '0');
  const target = `${base}?${params}`;

  const browser = await chromium.launch({ headless: !opts.headed });
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    recordVideo: opts.video ? { dir: videoDir, size: { width: opts.width, height: opts.height } } : undefined
  });
  if (opts.cursor) await context.addInitScript(CURSOR_SCRIPT);

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  const manifest = { url: target, viewport: `${opts.width}x${opts.height}`, steps: [] };

  try {
    console.log(`[demo] opening ${target}`);
    await page.goto(target, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('.window.BibleWindow .section .verse, .window.BibleWindow .section .v',
      { timeout: 60_000 });
    try {
      await page.waitForFunction(() => window.BrowserBible?.tour?.() != null, null, { timeout: 20_000 });
    } catch {
      throw new Error(
        `No guided tour at ${base}. That build predates browserbible/js/menu/GuidedTour.js. ` +
        'Record a local server (drop --url) or deploy the tour first.'
      );
    }
    await sleep(1200);

    const all = await page.evaluate(() => window.BrowserBible.tour().getSteps().map(s => s.id));
    const wanted = opts.only ?? all;
    const startIndex = opts.from ? Math.max(0, all.indexOf(opts.from)) : 0;

    console.log(`[demo] ${wanted.length} step${wanted.length === 1 ? '' : 's'} to record\n`);

    let state = await page.evaluate(i => window.BrowserBible.tour().start({ from: i }), startIndex);
    let shot = 0;

    while (state.active && !state.done) {
      if (wanted.includes(state.id)) {
        await sleep(360);

        const point = await pointOfInterest(page);
        if (point && opts.cursor) {
          await page.evaluate(() => window.__demoCursorRaise?.());
          await glide(page, point.x, point.y);
        }

        const dwell = dwellFor(state, opts.dwell);
        shot += 1;
        const file = `${pad(shot)}-${state.id}.png`;
        await page.screenshot({ path: join(screensDir, file) });

        console.log(
          `[demo] ${pad(state.index + 1)}/${state.total}  ${state.id.padEnd(14)} ${state.title}`
        );

        manifest.steps.push({
          order: shot,
          index: state.index,
          id: state.id,
          title: state.title,
          body: state.body,
          screenshot: `screens/${file}`,
          dwellMs: dwell
        });

        await sleep(dwell);
      }

      state = await page.evaluate(() => window.BrowserBible.tour().next());
    }

    await sleep(1200);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    server?.stop();
  }

  if (opts.video) {
    const files = await readdir(videoDir).catch(() => []);
    const webm = files.find(f => f.endsWith('.webm'));
    if (webm) {
      await rename(join(videoDir, webm), join(opts.out, 'inscript-walkthrough.webm'));
      manifest.video = 'inscript-walkthrough.webm';
    }
    await rm(videoDir, { recursive: true, force: true });
  }

  if (opts.gif) {
    if (!manifest.video) throw new Error('--gif needs the video; drop --no-video.');
    console.log(`\n[demo] converting to GIF at ${opts.gifWidth}px / ${opts.gifFps}fps…`);
    const gif = join(opts.out, opts.gifName);
    await makeGif(join(opts.out, manifest.video), gif,
      { width: opts.gifWidth, fps: opts.gifFps, colors: opts.gifColors });
    manifest.gif = opts.gifName;
  }

  await writeFile(join(opts.out, 'walkthrough.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(opts.out, 'index.html'), contactSheet(manifest));

  const mb = async (name) => `${((await stat(join(opts.out, name))).size / 1024 / 1024).toFixed(1)} MB`;

  console.log(`\n[demo] ${manifest.steps.length} screenshots → ${join(opts.out, 'screens')}`);
  if (manifest.video) console.log(`[demo] video            → ${join(opts.out, manifest.video)}  (${await mb(manifest.video)})`);
  if (manifest.gif) console.log(`[demo] gif              → ${join(opts.out, manifest.gif)}  (${await mb(manifest.gif)})`);
  console.log(`[demo] contact sheet    → ${join(opts.out, 'index.html')}`);

  if (pageErrors.length) {
    console.log(`\n[demo] ${pageErrors.length} page error(s) during recording:`);
    for (const e of pageErrors.slice(0, 10)) console.log(`   ${e}`);
  }
}

function contactSheet(manifest) {
  const escape = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const shots = manifest.steps.map(step => `
    <figure>
      <img src="${step.screenshot}" alt="${escape(step.title)}" loading="lazy">
      <figcaption>
        <span class="n">${pad(step.order)}</span>
        <strong>${escape(step.title)}</strong>
        <span class="id">${escape(step.id)}</span>
        <p>${escape(step.body)}</p>
      </figcaption>
    </figure>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>inScript guided tour walkthrough</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 15px/1.55 system-ui, sans-serif; max-width: 1100px; margin-inline: auto; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .meta { color: #888; font-size: 13px; margin-bottom: 28px; }
  video { width: 100%; border-radius: 8px; background: #000; margin-bottom: 36px; }
  figure { margin: 0 0 40px; }
  img { width: 100%; border-radius: 6px; border: 1px solid #8883; display: block; }
  figcaption { padding-top: 10px; }
  .n { display: inline-block; min-width: 22px; color: #888; font-variant-numeric: tabular-nums; }
  .id { color: #888; font-size: 12px; font-family: ui-monospace, monospace; margin-left: 8px; }
  figcaption p { margin: 6px 0 0 22px; color: #666; max-width: 70ch; }
  @media (prefers-color-scheme: dark) { figcaption p, .meta { color: #999; } }
</style>
</head>
<body>
<h1>inScript guided tour walkthrough</h1>
<p class="meta">${manifest.steps.length} steps · ${escape(manifest.viewport)} · recorded from ${escape(manifest.url)}</p>
${manifest.video ? `<video src="${manifest.video}" controls playsinline></video>` : ''}
${manifest.gif ? `<p class="meta"><a href="${manifest.gif}">${manifest.gif}</a>, the same walkthrough as an animated GIF.</p>` : ''}
${shots}
</body>
</html>
`;
}

main().catch(err => {
  console.error(`\n[demo] ${err.message}`);
  process.exitCode = 1;
});

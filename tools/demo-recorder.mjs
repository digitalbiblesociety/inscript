import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const sleep = (ms) => new Promise(resolve => { setTimeout(resolve, ms); });

export const pad = (n) => String(n).padStart(2, '0');

export async function startServer({ port, site }) {
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

export const CURSOR_SCRIPT = `
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

function dwellFor(step, factor) {
  const words = `${step.title ?? ''} ${step.body ?? ''}`.trim().split(/\s+/).length;
  return Math.round(Math.min(7000, Math.max(1700, words * 185)) * factor);
}

export async function openApp(page, target, base) {
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
}

async function captureStep(page, opts, screensDir, manifest, state) {
  await sleep(360);

  const point = await pointOfInterest(page);
  if (point && opts.cursor) {
    await page.evaluate(() => window.__demoCursorRaise?.());
    await glide(page, point.x, point.y);
  }

  const dwell = dwellFor(state, opts.dwell);
  const shot = manifest.steps.length + 1;
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

/** Plays the in-app tour, screenshotting each wanted step into manifest.steps. */
export async function recordSteps(page, opts, screensDir, manifest) {
  const all = await page.evaluate(() => window.BrowserBible.tour().getSteps().map(s => s.id));
  const wanted = opts.only ?? all;
  const startIndex = opts.from ? Math.max(0, all.indexOf(opts.from)) : 0;

  console.log(`[demo] ${wanted.length} step${wanted.length === 1 ? '' : 's'} to record\n`);

  let state = await page.evaluate(i => window.BrowserBible.tour().start({ from: i }), startIndex);

  while (state.active && !state.done) {
    if (wanted.includes(state.id)) {
      await captureStep(page, opts, screensDir, manifest, state);
    }
    state = await page.evaluate(() => window.BrowserBible.tour().next());
  }

  await sleep(1200);
}

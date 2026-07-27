import { test, expect } from './fixtures.js';

const START = {
  w1: 'bible', t1: 'ENGWEB', v1: 'JN1_1',
  w2: 'bible', t2: 'ENGASV', v2: 'JN1_1',
  tour: '0'
};

const bootTour = async (page, makeUrl, profile) => {
  await page.goto(makeUrl({ ...START, t2: profile === 'local' ? 'SPABES' : 'ENGASV' }));
  await page.waitForSelector('.window.BibleWindow .section .verse, .window.BibleWindow .section .v',
    { timeout: 60_000 });
  await page.waitForFunction(() => window.BrowserBible?.tour?.() != null, null, { timeout: 20_000 });
};

test.describe('guided tour', () => {
  test('is offered in the main menu and the command palette', async ({ page, makeUrl, profile }) => {
    await bootTour(page, makeUrl, profile);

    await page.locator('#main-menu-button').click();
    await expect(page.locator('#main-menu-tour-button')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.keyboard.press('Control+k');
    await page.locator('.command-palette-input').fill('> tour');
    await expect(page.locator('.command-palette-item', { hasText: 'Guided Tour' })).toBeVisible();
  });

  test('every step finds its subject and has copy to show', async ({ page, makeUrl, profile }) => {
    test.setTimeout(240_000);

    await bootTour(page, makeUrl, profile);

    const total = await page.evaluate(() => window.BrowserBible.tour().getSteps().length);
    expect(total).toBeGreaterThan(10);

    let state = await page.evaluate(() => window.BrowserBible.tour().start());
    const visited = [];

    while (state.active && !state.done) {
      visited.push(state.id);

      if (!['welcome', 'finish'].includes(state.id)) {
        expect(state.centered, `step "${state.id}" found nothing to point at`).toBe(false);
        expect(state.spotlight, `step "${state.id}" has no spotlight`).not.toBeNull();
        expect(state.spotlight.width, `step "${state.id}" spotlight has no width`).toBeGreaterThan(0);
        expect(state.spotlight.height, `step "${state.id}" spotlight has no height`).toBeGreaterThan(0);
      }

      expect(state.title, `step "${state.id}" has no title`).toBeTruthy();
      expect(state.title, `step "${state.id}" is missing its i18n strings`).not.toContain('tour.steps.');
      expect(state.body, `step "${state.id}" is missing its i18n strings`).not.toContain('tour.steps.');

      state = await page.evaluate(() => window.BrowserBible.tour().next());
    }

    expect(state.done).toBe(true);
    expect(visited).toHaveLength(total);
    expect(new Set(visited).size, 'a step was visited twice').toBe(total);
  });

  test('the dim never lifts while advancing', async ({ page, makeUrl, profile }) => {
    test.setTimeout(240_000);

    await bootTour(page, makeUrl, profile);

    await page.evaluate(() => {
      window.__minDim = 1;
      const tick = () => {
        const layer = document.querySelector('.tour-layer');
        const ring = layer?.querySelector('.tour-ring');
        if (ring && document.body.classList.contains('tour-active')) {
          // The scrim is the ring's box-shadow, and the tour lifts its layer by
          // hiding and re-showing it, so an unrendered frame is no dim at all.
          const dim = layer.matches(':popover-open')
            ? Number(getComputedStyle(layer).opacity) * Number(getComputedStyle(ring).opacity)
            : 0;
          if (dim < window.__minDim) window.__minDim = dim;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await page.evaluate(async () => {
      const tour = window.BrowserBible.tour();
      let state = await tour.start();
      while (state.active && !state.done) state = await tour.next();
    });

    expect(await page.evaluate(() => window.__minDim)).toBe(1);
  });

  test('shows each card before that step acts', async ({ page, makeUrl, profile }) => {
    test.setTimeout(240_000);

    await bootTour(page, makeUrl, profile);

    await page.evaluate(() => {
      window.__order = [];
      const seen = new Set();
      const mark = (event) => {
        if (seen.has(event)) return;
        seen.add(event);
        window.__order.push(event);
      };
      const tick = () => {
        const step = document.querySelector('.tour-layer')?.dataset.step;
        if (step && document.body.classList.contains('tour-active')) mark(`card:${step}`);

        if (document.querySelector('.window.BibleWindow .section[data-id="GN1"]')) mark('acted:navigate');
        if (document.querySelector('#main-search-input')?.value) mark('acted:search');
        if (document.querySelector('.command-palette-input')?.value) mark('acted:palette');

        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await page.evaluate(async () => {
      const tour = window.BrowserBible.tour();
      let state = await tour.start();
      while (state.active && !state.done) state = await tour.next();
    });

    const order = await page.evaluate(() => window.__order);

    for (const id of ['navigate', 'search', 'palette']) {
      const card = order.indexOf(`card:${id}`);
      const acted = order.indexOf(`acted:${id}`);
      expect(card, `step "${id}" never showed its card`).toBeGreaterThan(-1);
      expect(acted, `step "${id}" never acted`).toBeGreaterThan(-1);
      expect(card, `step "${id}" acted before its card was up`).toBeLessThan(acted);
    }
  });

  test('arrow keys still work after a step types in a field', async ({ page, makeUrl, profile }) => {
    await bootTour(page, makeUrl, profile);

    const ids = await page.evaluate(() => window.BrowserBible.tour().getSteps().map(s => s.id));
    const at = ids.indexOf('search');

    const state = await page.evaluate(i => window.BrowserBible.tour().start({ from: i }), at);
    expect(state.id).toBe('search');
    expect(await page.evaluate(() => document.activeElement?.id),
      'the search step is meant to leave focus in the input').toBe('main-search-input');

    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => page.evaluate(() => window.BrowserBible.tour().getState().id),
      { timeout: 30_000 }).toBe(ids[at - 1]);

    // Typing in the field hands the arrows back to it.
    await page.evaluate(i => window.BrowserBible.tour().goTo(i), at);
    await page.locator('#main-search-input').click();
    await page.keyboard.type('s');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.BrowserBible.tour().getState().id)).toBe('search');
  });

  test('leaves the workspace as it found it', async ({ page, makeUrl, profile }) => {
    test.setTimeout(240_000);

    await bootTour(page, makeUrl, profile);
    const before = await page.locator('.window').count();

    await page.evaluate(async () => {
      const tour = window.BrowserBible.tour();
      let state = await tour.start();
      while (state.active && !state.done) state = await tour.next();
    });

    await expect(page.locator('.window')).toHaveCount(before);
    await expect(page.locator('.tour-card')).toBeHidden();
  });

  test('Escape leaves the tour, but only once the app has nothing open', async ({ page, makeUrl, profile }) => {
    await bootTour(page, makeUrl, profile);

    await page.evaluate(() => window.BrowserBible.tour().start());
    await expect(page.locator('.tour-card')).toBeVisible();

    await page.evaluate(() => window.BrowserBible.tour().goTo(2));
    await expect(page.locator('#main-menu-dropdown')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#main-menu-dropdown')).toBeHidden();
    expect(await page.evaluate(() => window.BrowserBible.tour().isActive())).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.locator('.tour-card')).toBeHidden();
    expect(await page.evaluate(() => window.BrowserBible.tour().isActive())).toBe(false);
  });
});

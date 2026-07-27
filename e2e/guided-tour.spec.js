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
        const ring = document.querySelector('.tour-layer .tour-ring');
        if (ring && document.body.classList.contains('tour-active')) {
          const opacity = Number(getComputedStyle(ring).opacity);
          if (opacity < window.__minDim) window.__minDim = opacity;
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

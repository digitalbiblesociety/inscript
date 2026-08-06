import { test, expect } from './fixtures.js';

test.describe('navigation history', () => {
  test('navigating then pressing back returns to the previous passage', async ({ page, makeUrl }) => {
    await page.goto(makeUrl({ w1: 'bible', t1: 'ENGWEB', v1: 'JN1_1' }));
    await expect(page.locator('.BibleWindow .section').first()).toBeVisible({ timeout: 30_000 });

    await page.locator('#main-search-input').fill('Genesis 1:1');
    await page.locator('#main-search-input').press('ArrowDown');
    await page.locator('#main-search-input').press('Enter');

    // Wait until at least one section reflects the new chapter.
    await expect.poll(async () => {
      const ids = await page.locator('.BibleWindow .section').evaluateAll(els =>
        els.map(el => (el.getAttribute('data-id') ?? '').toLowerCase())
      );
      return ids.some(id => id.includes('gn1'));
    }, { timeout: 15_000 }).toBe(true);

    await page.locator('#main-search-input').fill('Romans 1:1');
    await page.locator('#main-search-input').press('ArrowDown');
    await page.locator('#main-search-input').press('Enter');

    await expect.poll(async () => {
      const ids = await page.locator('.BibleWindow .section').evaluateAll(els =>
        els.map(el => (el.getAttribute('data-id') ?? '').toLowerCase())
      );
      return ids.some(id => id.includes('rm1'));
    }, { timeout: 15_000 }).toBe(true);

    await page.goBack();
    await expect.poll(async () => {
      const ids = await page.locator('.BibleWindow .section').evaluateAll(els =>
        els.map(el => (el.getAttribute('data-id') ?? '').toLowerCase())
      );
      return ids.some(id => id.includes('gn1'));
    }, { timeout: 15_000 }).toBe(true);

    await page.goForward();
    await expect.poll(async () => {
      const ids = await page.locator('.BibleWindow .section').evaluateAll(els =>
        els.map(el => (el.getAttribute('data-id') ?? '').toLowerCase())
      );
      return ids.some(id => id.includes('rm1'));
    }, { timeout: 15_000 }).toBe(true);
  });
});

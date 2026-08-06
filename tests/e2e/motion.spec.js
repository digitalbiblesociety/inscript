import { test, expect } from './fixtures.js';

// motion.css loads first, so a component stylesheet redeclaring `transition` on
// one of these wins the whole shorthand and silently drops the press scale.
const PRESS_SELECTORS = [
  '.close-button',
  '.link-button',
  '.header-icon',
  '.main-menu-item',
  '#main-menu-button',
  '#main-search-button',
  '#main-back-button',
  '#main-forward-button'
];

test.describe('motion', () => {
  test('every pressable control still transitions scale', async ({ page, makeUrl }) => {
    await page.goto(makeUrl({ w1: 'bible', t1: 'ENGWEB', v1: 'JN1_1', tour: '0' }));
    await expect(page.locator('.BibleWindow .section').first()).toBeVisible({ timeout: 30_000 });

    // Brings the menu items and their dialogs into the document.
    await page.locator('#main-menu-button').click();
    await expect(page.locator('#main-menu-dropdown')).toBeVisible();

    const { missing, found } = await page.evaluate((selectors) => {
      const missing = [];
      const found = [];
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          found.push(selector);
          if (!getComputedStyle(el).transitionProperty.split(', ').includes('scale')) {
            missing.push(`${selector} (${el.className || el.id})`);
          }
        }
      }
      return { missing, found: [...new Set(found)] };
    }, PRESS_SELECTORS);

    expect(missing, 'a component stylesheet overrode the shared press transition').toEqual([]);
    // Fail rather than pass vacuously if nothing matched.
    expect(found).toContain('.main-menu-item');
    expect(found).toContain('.close-button');
  });
});

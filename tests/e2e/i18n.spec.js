import { test, expect } from './fixtures.js';

test.describe('i18n', () => {
  test('default language is English with ltr direction', async ({ page, appPath }) => {
    await page.goto(appPath);

    await expect.poll(async () => page.evaluate(() => document.documentElement.dir)).toBe('ltr');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  });

  test('switching to Spanish updates <html lang> and translated elements', async ({ page, appPath }) => {
    await page.goto(appPath);

    // Wait for app to settle so i18n has finished its initial load.
    await expect(page.locator('#main-search-input')).toBeAttached({ timeout: 30_000 });

    const ok = await page.evaluate(async () => {
      return await window.BrowserBible.i18n.setLng('es');
    });
    expect(ok).toBe(true);

    await expect.poll(async () => page.evaluate(() => document.documentElement.lang)).toBe('es');

    // The search input has data-i18n="[placeholder]menu.search.placeholder";
    // Spanish translation is "Búsqueda".
    await expect.poll(async () =>
      page.locator('#main-search-input').getAttribute('placeholder')
    ).toBe('Búsqueda');
  });

  test('switching to Arabic flips dir to rtl', async ({ page, appPath }) => {
    await page.goto(appPath);
    await expect(page.locator('#main-search-input')).toBeAttached({ timeout: 30_000 });

    const ok = await page.evaluate(async () =>
      window.BrowserBible.i18n.setLng('ar')
    );
    expect(ok).toBe(true);

    await expect.poll(async () => page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  });
});

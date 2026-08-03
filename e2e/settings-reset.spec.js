import { test, expect } from './fixtures.js';

async function openSettings(page) {
  await expect(page.locator('#config-reset-button')).toBeAttached({ timeout: 15_000 });
  await page.evaluate(() => document.querySelector('#config-window').showPopover());
  await expect(page.locator('#config-reset-button')).toBeVisible();
}

test.describe('settings reset', () => {
  test('clears stored settings and returns to the defaults', async ({ page, appPath }) => {
    await page.goto(appPath);

    await expect(page.locator('#config-theme-shiloh')).toBeAttached({ timeout: 15_000 });
    await page.locator('#config-theme-shiloh').dispatchEvent('click');
    await expect.poll(async () =>
      page.evaluate(() => document.body.classList.contains('theme-shiloh'))
    ).toBe(true);

    await openSettings(page);

    await page.locator('#config-reset-button').click();
    await expect(page.locator('#config-reset-confirm-button')).toBeVisible();
    await expect(page.locator('#config-reset-button')).toBeHidden();

    await page.locator('#config-reset-confirm-button').click();

    await expect(page.locator('#config-theme-default')).toBeAttached({ timeout: 15_000 });
    await expect.poll(async () =>
      page.evaluate(() => document.body.classList.contains('theme-default'))
    ).toBe(true);
    expect(await page.evaluate(() => document.body.classList.contains('theme-shiloh'))).toBe(false);
  });

  test('cancelling leaves settings untouched', async ({ page, appPath }) => {
    await page.goto(appPath);

    await expect(page.locator('#config-theme-jabbok')).toBeAttached({ timeout: 15_000 });
    await page.locator('#config-theme-jabbok').dispatchEvent('click');
    await expect.poll(async () =>
      page.evaluate(() => document.body.classList.contains('theme-jabbok'))
    ).toBe(true);

    await openSettings(page);
    await page.locator('#config-reset-button').click();
    await page.locator('#config-reset-cancel-button').click();

    await expect(page.locator('#config-reset-button')).toBeVisible();
    await expect(page.locator('#config-reset-confirm-button')).toBeHidden();
    expect(await page.evaluate(() => document.body.classList.contains('theme-jabbok'))).toBe(true);
  });

  test('closing the dialog abandons a pending confirmation', async ({ page, appPath }) => {
    await page.goto(appPath);
    await openSettings(page);

    await page.locator('#config-reset-button').click();
    await expect(page.locator('#config-reset-confirm-button')).toBeVisible();

    await page.evaluate(() => document.querySelector('#config-window').hidePopover());
    await page.evaluate(() => document.querySelector('#config-window').showPopover());

    await expect(page.locator('#config-reset-button')).toBeVisible();
    await expect(page.locator('#config-reset-confirm-button')).toBeHidden();
  });

  test('the command palette arms the confirmation rather than resetting outright', async ({ page, appPath }) => {
    await page.goto(appPath);
    await expect(page.locator('#config-reset-button')).toBeAttached({ timeout: 15_000 });

    await page.keyboard.press('Control+k');
    await page.locator('.command-palette-input').fill('> reset settings');
    await expect(page.locator('.command-palette-item').first()).toContainText('Reset Settings');
    await page.locator('.command-palette-input').press('Enter');

    await expect(page.locator('#config-reset-confirm-button')).toBeVisible();
    await expect(page.locator('#config-reset-button')).toBeHidden();
  });

  test('notes and highlights survive a settings reset', async ({ page, appPath }) => {
    await page.goto(appPath);
    await expect(page.locator('#config-theme-shiloh')).toBeAttached({ timeout: 15_000 });

    await page.locator('#config-theme-shiloh').dispatchEvent('click');
    await expect.poll(async () =>
      page.evaluate(() => document.body.classList.contains('theme-shiloh'))
    ).toBe(true);

    await page.evaluate(() => {
      window.localStorage.setItem('browserbible_notes', JSON.stringify({
        version: 1,
        notes: [{ id: 'note_keepme', title: 'Keep me', content: 'survives a reset', created: 1, modified: 1 }]
      }));
      window.localStorage.setItem('browserbible_highlights', JSON.stringify({ ENGWEB: ['JN1_1'] }));
    });

    await openSettings(page);
    await page.locator('#config-reset-button').click();
    await page.locator('#config-reset-confirm-button').click();

    await expect(page.locator('#config-theme-default')).toBeAttached({ timeout: 15_000 });
    await expect.poll(async () =>
      page.evaluate(() => document.body.classList.contains('theme-default'))
    ).toBe(true);

    const kept = await page.evaluate(() => ({
      notes: window.localStorage.getItem('browserbible_notes'),
      highlights: window.localStorage.getItem('browserbible_highlights')
    }));

    expect(kept.notes).toContain('note_keepme');
    expect(kept.highlights).toContain('JN1_1');
  });
});

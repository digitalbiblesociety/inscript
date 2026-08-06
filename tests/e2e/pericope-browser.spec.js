import { test, expect } from './fixtures.js';

const navigatorLocator = (page) => page.locator('.text-navigator:not(.verse-navigator)');
const SUPPORTED_STARTER_BIBLES = [
  ['ARBNAV', 'ar'],
  ['BENERV', 'bn'],
  ['DEUL12', 'de'],
  ['ENGWEB', 'en'],
  ['SPABES', 'es'],
  ['FRALSG', 'fr'],
  ['HINERV', 'hi'],
  ['INDERV', 'id'],
  ['JPNN65', 'ja'],
  ['PORTFT', 'pt'],
  ['RUSS76', 'ru'],
  ['URDERV', 'ur'],
  ['CMNUNVS', 'zh'],
];
const UNSUPPORTED_STARTER_BIBLES = ['PESOPV', 'TGLTAB', 'SWHULB', 'VIEVCB'];
const VERNACULAR_NUMERAL_BIBLES = [
  { textid: 'BENERV', digits: '০১২৩৪৫৬৭৮৯', chapter: '৩', reference: '৩:১৬', input: 'JN৪_১', result: '৪:১' },
  { textid: 'HINERV', digits: '०१२३४५६७८९', chapter: '३', reference: '३:१६', input: 'JN४_१', result: '४:१' },
  { textid: 'URDERV', digits: '۰۱۲۳۴۵۶۷۸۹', chapter: '۳', reference: '۳:۱۶', input: 'JN۴_۱', result: '۴:۱' }
];
const RTL_STARTER_BIBLES = ['ARBNAV', 'PESOPV', 'URDERV'];

async function openNavigator(page, url) {
  await page.goto(url);
  await expect(page.locator('.BibleWindow .section').first()).toBeVisible({ timeout: 30_000 });
  const nav = page.locator('.BibleWindow .text-nav').filter({ visible: true }).first();
  await nav.click();
  const navigator = navigatorLocator(page);
  await expect(navigator).toBeVisible();
  return { nav, navigator };
}

test.describe('passages column (right of the books)', () => {
  test('shows the active book\'s passages with the current one highlighted', async ({ page, makeUrl }) => {
    const { navigator } = await openNavigator(page, makeUrl({ w1: 'bible', t1: 'ENGWEB', v1: 'JN3_16' }));

    // Two-column layout with a passages column
    await expect(navigator).toHaveClass(/text-navigator-2col/);
    const passages = navigator.locator('.text-navigator-pericopes');
    await expect(passages).toBeVisible();

    // Active book = John (from the current reference)
    await expect(passages.locator('.text-navigator-peri-header')).toHaveText('John');
    await expect(passages.locator('.peri-item').first()).toBeVisible();

    // Exactly one passage is marked current (the one containing John 3:16)
    await expect(passages.locator('.peri-item.current')).toHaveCount(1);
    await expect(passages.locator('.peri-item.current')).toHaveAttribute('data-section', 'JN3');
  });

  test('selecting a book updates the passages column', async ({ page, makeUrl }) => {
    const { navigator } = await openNavigator(page, makeUrl({ w1: 'bible', t1: 'ENGWEB', v1: 'JN3_16' }));

    await navigator.locator('.text-navigator-division[data-id="GN"]').click();

    const passages = navigator.locator('.text-navigator-pericopes');
    await expect(passages.locator('.text-navigator-peri-header')).toHaveText('Genesis');
    await expect(passages.locator('.peri-item[data-fragment="GN1_1"]')).toBeVisible();
  });

  test('selecting a book scrolls it to the top of the book list', async ({ page, makeUrl }) => {
    const { navigator } = await openNavigator(page, makeUrl({ w1: 'bible', t1: 'ENGWEB', v1: 'JN3_16' }));

    await navigator.locator('.text-navigator-division[data-id="S1"]').click();
    await page.waitForTimeout(400); // let the chapter grid animate open

    const delta = await page.evaluate(() => {
      const d = document.querySelector('.text-navigator:not(.verse-navigator) .divisionid-S1');
      const c = document.querySelector('.text-navigator:not(.verse-navigator) .text-navigator-divisions');
      return d.getBoundingClientRect().top - c.getBoundingClientRect().top;
    });
    // Book sits just below the container top, not scrolled past its end
    expect(delta).toBeGreaterThanOrEqual(0);
    expect(delta).toBeLessThan(24);
  });

  // Unlike the click path above, this positions the list while the popover is
  // still scaled by its open transition.
  test('opens with the current book at the top of the book list', async ({ page, makeUrl }) => {
    const { navigator } = await openNavigator(page, makeUrl({ w1: 'bible', t1: 'ENGWEB', v1: 'RM8_28' }));

    await expect(navigator.locator('.divisionid-RM')).toBeVisible();
    await page.waitForTimeout(300); // let the open transition settle at scale 1

    const delta = await page.evaluate(() => {
      const d = document.querySelector('.text-navigator:not(.verse-navigator) .divisionid-RM');
      const c = document.querySelector('.text-navigator:not(.verse-navigator) .text-navigator-divisions');
      return d.getBoundingClientRect().top - c.getBoundingClientRect().top;
    });

    expect(delta).toBeGreaterThanOrEqual(0);
    expect(delta).toBeLessThan(24);
  });

  test('the filter searches passages across books and jumps', async ({ page, makeUrl }) => {
    const { nav, navigator } = await openNavigator(page, makeUrl({ w1: 'bible', t1: 'ENGWEB', v1: 'JN3_16' }));

    await navigator.locator('.text-navigator-filter').fill('Samson');
    const item = navigator.locator('.peri-item', { hasText: 'Samson and Delilah' });
    await expect(item).toBeVisible();
    await item.click();

    await expect(navigator).toBeHidden();
    await expect.poll(async () => nav.inputValue(), { timeout: 15_000 }).toContain('16');
  });

  test('search keeps the result books visible in the left column', async ({ page, makeUrl }) => {
    const { navigator } = await openNavigator(page, makeUrl({ w1: 'bible', t1: 'ENGWEB', v1: 'JN3_16' }));

    await navigator.locator('.text-navigator-filter').fill('abraham');

    for (const id of ['GN', 'R1', 'JN', 'RM']) {
      await expect(navigator.locator(`.text-navigator-division[data-id="${id}"]`)).toBeVisible();
    }
    await expect(navigator.locator('.text-navigator-division[data-id="EX"]')).toBeHidden();
  });

  test('non-English text shows translated passages', async ({ page, makeUrl }) => {
    const { navigator } = await openNavigator(page, makeUrl({ w1: 'bible', t1: 'SPABES', v1: 'JN1_1' }));

    await expect(navigator).toHaveClass(/text-navigator-2col/);
    const passages = navigator.locator('.text-navigator-pericopes');
    await expect(passages).toBeVisible();
    await expect(passages.locator('.text-navigator-peri-header')).toHaveText('Juan');
    await expect(passages.locator('.peri-item[data-fragment="JN1_1"]'))
      .toContainText('La palabra se hizo carne');
  });

  test('Arabic navigation uses Arabic-Indic labels with ASCII navigation IDs', async ({ page, makeUrl }) => {
    const { nav, navigator } = await openNavigator(
      page,
      makeUrl({ w1: 'bible', t1: 'ARBNAV', v1: 'JN3_16' })
    );

    await expect(nav).toHaveValue(/[٠-٩]+:[٠-٩]+/);
    await expect(nav).not.toHaveValue(/[0-9]+:[0-9]+/);

    const chapter = navigator.locator('.text-navigator-section.section-JN3');
    await expect(chapter).toHaveText('٣');
    await expect(chapter).toHaveAttribute('data-id', 'JN3');

    const passage = navigator.locator('.peri-item[data-fragment="JN3_16"]');
    await expect(passage.locator('.peri-ref')).toHaveText('٣:١٦');
    await expect(passage).toHaveAttribute('data-section', 'JN3');
    await expect(passage).toHaveAttribute('data-fragment', 'JN3_16');
    await expect(passage.locator('.peri-ref')).toHaveAttribute('dir', 'ltr');

    await nav.fill('JN٤_٢');
    await nav.press('Enter');
    await expect.poll(() => nav.getAttribute('data-fragmentid')).toBe('JN4_2');
    await expect(nav).toHaveValue(/٤:٢/);
  });

  for (const { textid, digits, chapter, reference, input, result } of VERNACULAR_NUMERAL_BIBLES) {
    test(`${textid} uses vernacular reference digits with ASCII navigation IDs`, async ({ page, makeUrl }) => {
      const { nav, navigator } = await openNavigator(
        page,
        makeUrl({ w1: 'bible', t1: textid, v1: 'JN3_16' })
      );

      await expect(nav).toHaveValue(new RegExp(`[${digits}]+:[${digits}]+`));
      await expect(nav).not.toHaveValue(/[0-9]+:[0-9]+/);

      const chapterNode = navigator.locator('.text-navigator-section.section-JN3');
      await expect(chapterNode).toHaveText(chapter);
      await expect(chapterNode).toHaveAttribute('data-id', 'JN3');

      const passage = navigator.locator('.peri-item[data-fragment="JN3_16"]');
      await expect(passage.locator('.peri-ref')).toHaveText(reference);
      await expect(passage).toHaveAttribute('data-section', 'JN3');
      await expect(passage).toHaveAttribute('data-fragment', 'JN3_16');

      await nav.fill(input);
      await nav.press('Enter');
      await expect.poll(() => nav.getAttribute('data-fragmentid')).toBe('JN4_1');
      await expect(nav).toHaveValue(new RegExp(result));
    });
  }

  for (const textid of RTL_STARTER_BIBLES) {
    test(`${textid} renders its text content right-to-left`, async ({ page, makeUrl }) => {
      await page.goto(makeUrl({ w1: 'bible', t1: textid, v1: 'JN3_16' }));
      const section = page.locator('.BibleWindow .section[data-id="JN3"]').first();

      await expect(section).toBeVisible({ timeout: 30_000 });
      await expect(section).toHaveAttribute('dir', 'rtl');
      await expect.poll(() => section.evaluate(element => getComputedStyle(element).direction))
        .toBe('rtl');
    });
  }

  test('remote Reina Valera 1909 gets Spanish passages', async ({ page, makeUrl, profile }) => {
    test.skip(profile !== 'remote', 'SPARV09 is served by the remote text catalog');

    const { navigator } = await openNavigator(
      page,
      makeUrl({ w1: 'bible', t1: 'SPARV09', v1: 'JN1_1' })
    );

    await expect(navigator).toHaveClass(/text-navigator-2col/);
    const passages = navigator.locator('.text-navigator-pericopes');
    await expect(passages).toBeVisible();
    await expect(passages).toHaveAttribute('lang', 'es');
    await expect(passages.locator('.text-navigator-peri-header')).toHaveText('Juan');
    await expect(passages.locator('.peri-item[data-fragment="JN1_1"]'))
      .toContainText('La palabra se hizo carne');
  });

  test.describe('starter Bible language coverage', () => {
    for (const [textid, lang] of SUPPORTED_STARTER_BIBLES) {
      test(`${textid} gets localized titles in its book picker`, async ({ page, makeUrl }) => {
        const { navigator } = await openNavigator(
          page,
          makeUrl({ w1: 'bible', t1: textid, v1: 'JN1_1' })
        );

        await expect(navigator).toHaveClass(/text-navigator-2col/);
        const passages = navigator.locator('.text-navigator-pericopes');
        await expect(passages).toBeVisible();
        await expect(passages).toHaveAttribute('lang', lang);
        await expect(passages.locator('.peri-item[data-fragment="JN1_1"] .peri-title'))
          .not.toHaveText('');
      });
    }

    for (const textid of UNSUPPORTED_STARTER_BIBLES) {
      test(`${textid} keeps the one-column book picker`, async ({ page, makeUrl }) => {
        const { navigator } = await openNavigator(
          page,
          makeUrl({ w1: 'bible', t1: textid, v1: 'JN1_1' })
        );

        await expect(navigator).not.toHaveClass(/text-navigator-2col/);
        await expect(navigator.locator('.text-navigator-pericopes')).toBeHidden();
      });
    }
  });
});

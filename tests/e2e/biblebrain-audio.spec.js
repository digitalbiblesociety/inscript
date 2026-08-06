import { test, expect } from './fixtures.js';

// Reference by provider id so it resolves to Bible Brain unambiguously (a bare
// "ENGNKJV" can collide with / fall back to the local provider). This is the same
// providerid form the text chooser produces. Has to be a text Bible Brain still
// serves in its own right: the ESV editions are aliased onto our ESV API text
// now (js/data/biblebrainAliases.js), so they no longer appear as BB texts.
const TEXT = 'biblebrain:ENGNKJV'; // text_plain NT/OT + timestamped audio (ENGNKJN1DA)
const SECTION = 'JN3';

test.describe('Bible Brain karaoke audio', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'audio path tested in chromium only');

  test('current verse highlights and scrolls as audio time advances', async ({ page, makeUrl }) => {
    test.setTimeout(120_000);

    await page.goto(makeUrl({ w1: 'bible', t1: TEXT, v1: `${SECTION}_1` }));

    const section = page.locator(`.section[data-id="${SECTION}"]`).first();
    const available = await section.waitFor({ state: 'visible', timeout: 90_000 })
      .then(() => true).catch(() => false);
    test.skip(!available, 'Bible Brain not reachable. Is the key-hiding proxy running on :8787?');
    await expect(section.locator('.v').first()).toBeVisible({ timeout: 30_000 });

    // Audio detected for this text → the ear/toggle button is shown.
    const audioButton = page.locator('.audio-button').first();
    const audioAvailable = await audioButton.waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true).catch(() => false);
    test.skip(!audioAvailable, 'Bible Brain audio metadata is unavailable without the proxy');
    // Reveal the audio bar (also ensures the controller is initialised).
    await audioButton.click();

    // Drive the controller's timeupdate at a given time and report the highlighted
    // verse + scroll position. Returns null until the timestamps have loaded.
    const driveTo = async (t) => page.evaluate((time) => {
      const audio = document.querySelector('.audio-controller audio');
      const pane = document.querySelector('.scroller-main');
      if (!audio || !pane) return null;
      // Force currentTime regardless of media readiness, then fire the handler.
      try {
        Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => time, set: () => {} });
      } catch { /* already overridden */ }
      audio.dispatchEvent(new Event('timeupdate'));
      const reading = document.querySelector('.v.audio-reading');
      return { id: reading?.getAttribute('data-id') ?? null, scrollTop: pane.scrollTop };
    }, t);

    const verseNum = (id) => (id ? parseInt(id.split('_')[1], 10) : null);

    // Poll early in the chapter until the timestamps have loaded and a verse lights up.
    let early = null;
    await expect.poll(async () => {
      early = await driveTo(12); // past v3's ~11.2s mark
      return early?.id;
    }, { timeout: 30_000, message: 'expected a verse to highlight once timestamps load' }).toBeTruthy();

    expect(early.id).toMatch(new RegExp(`^${SECTION}_\\d+$`));
    const earlyVerse = verseNum(early.id);
    expect(earlyVerse).toBeGreaterThanOrEqual(1);
    expect(earlyVerse).toBeLessThanOrEqual(5);

    await page.screenshot({ path: 'test-results/biblebrain-karaoke-early.png' });

    // Seek near the end of the chapter: the highlight must move to a later verse
    // and the pane must have scrolled further down.
    const late = await driveTo(250);
    expect(verseNum(late.id)).toBeGreaterThan(earlyVerse);
    expect(late.scrollTop).toBeGreaterThan(early.scrollTop);

    await page.screenshot({ path: 'test-results/biblebrain-karaoke-late.png' });
  });
});

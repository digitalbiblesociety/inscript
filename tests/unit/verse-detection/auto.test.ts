import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  initVerseDetection: vi.fn()
}));

vi.mock('@verse-detection/VerseDetectionPlugin.ts', () => ({
  initVerseDetection: fixtures.initVerseDetection
}));

async function importAuto(readyState: DocumentReadyState) {
  vi.resetModules();
  vi.spyOn(document, 'readyState', 'get').mockReturnValue(readyState);
  await import('@verse-detection/auto.ts');
}

describe('verse-detection auto initialization', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    history.replaceState({}, '', '/');
    vi.clearAllMocks();
    delete (window as typeof window & { verseDetection?: unknown }).verseDetection;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('uses the newest script configuration and processes matching containers', async () => {
    history.replaceState({}, '', '/?dev=true');
    document.head.innerHTML = `
      <script src="verse-detection-old.js" data-app-url="https://old.test"></script>
      <script src="verse-detection.js" data-app-url="https://app.test" data-mode="popup"
        data-selector=".article" data-new-tab="false" data-language="es" data-show-logo="false"></script>`;
    document.body.innerHTML = '<div class="article"></div><div class="article"></div><div></div>';
    const system = { processContainer: vi.fn() };
    fixtures.initVerseDetection.mockResolvedValue(system);
    await importAuto('complete');
    await vi.waitFor(() => expect(fixtures.initVerseDetection).toHaveBeenCalled());
    expect(fixtures.initVerseDetection).toHaveBeenCalledWith(null, expect.objectContaining({
      appBaseUrl: 'https://app.test', displayMode: 'popup',
      contentSource: expect.objectContaining({
        baseUrl: expect.stringContaining('/texts_dev'),
        textsIndexUrl: expect.stringContaining('/texts_dev/texts.json')
      }),
      language: { autoDetect: false, primary: 'es', additional: 'all' },
      link: expect.objectContaining({ openInNewTab: false }),
      popup: { showLogo: false, logoUrl: 'https://app.test' }
    }));
    expect(system.processContainer).toHaveBeenCalledTimes(2);
    expect((window as typeof window & { verseDetection?: unknown }).verseDetection).toBe(system);
    expect(console.log).toHaveBeenCalledWith('[Verse Detection] Processed', 2, 'container(s)');
  });

  it('uses defaults and waits for DOMContentLoaded while the document is loading', async () => {
    const system = { processContainer: vi.fn() };
    fixtures.initVerseDetection.mockResolvedValue(system);
    await importAuto('loading');
    expect(fixtures.initVerseDetection).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => expect(fixtures.initVerseDetection).toHaveBeenCalled());
    expect(fixtures.initVerseDetection).toHaveBeenCalledWith(null, expect.objectContaining({
      appBaseUrl: 'https://inscript.org', displayMode: 'both',
      language: { autoDetect: true, primary: undefined, additional: 'all' },
      link: expect.objectContaining({ openInNewTab: true }),
      popup: { showLogo: true, logoUrl: 'https://inscript.org' }
    }));
    expect(system.processContainer).toHaveBeenCalledWith(document.body);
  });

  it('reports initialization failures without exposing a partial system', async () => {
    const failure = new Error('failed');
    fixtures.initVerseDetection.mockRejectedValue(failure);
    await importAuto('complete');
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith(
      '[Verse Detection] Initialization failed:', failure
    ));
    expect((window as typeof window & { verseDetection?: unknown }).verseDetection).toBeUndefined();
  });
});

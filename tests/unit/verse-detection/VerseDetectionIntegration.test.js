import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeConfig } from '@verse-detection/config.ts';
import {
  applyAvailableTextLanguages,
  linkifyContainer,
  renderVerseLink
} from '@verse-detection/DomLinker.ts';
import { initVerseDetection, VerseDetectionPlugin } from '@verse-detection/VerseDetectionPlugin.ts';
import { VersePopup, createVersePopup } from '@verse-detection/VersePopup.ts';

function makeConfig(overrides = {}) {
  return mergeConfig({
    displayMode: 'both',
    contentSource: {
      type: 'remote', baseUrl: 'https://content.test/texts', textsIndexUrl: '',
      dynamicTextSelection: false, textIdsByLanguage: { en: 'ENGWEB' }
    },
    popup: { showDelay: 0, hideDelay: 0, showSocialShare: true, socialSharePlatforms: ['copy'] },
    appIntegration: { useAppTextLoader: false, useAppNavigation: true }
  }, overrides);
}

const parsedVerse = {
  book: 'John', reference: '3:16', original: 'John 3:16',
  detectedLanguage: 'en', version: 'NIV'
};

describe('DOM verse linking', () => {
  it('updates language availability and renders configured links', () => {
    const config = makeConfig();
    const linkable = { set: null };
    applyAvailableTextLanguages(linkable, config, ['en']);
    expect(renderVerseLink(parsedVerse, config, linkable)).toContain('data-section-id="JN3"');
    expect(renderVerseLink({ ...parsedVerse, detectedLanguage: 'es' }, config, linkable)).toBe('John 3:16');

    applyAvailableTextLanguages(linkable, config, { en: 'ENGWEB', es: 'SPABES' });
    expect(config.contentSource.textIdsByLanguage.es).toBe('SPABES');
    const linked = renderVerseLink(parsedVerse, {
      ...config,
      displayMode: 'link',
      link: { ...config.link, openInNewTab: true, addDataAttributes: false },
      styling: { ...config.styling, highlightVerses: false, underline: false }
    }, linkable);
    expect(linked).toContain('target="_blank"');
    expect(linked).toContain('text-decoration:none');
    applyAvailableTextLanguages(linkable, config, null);
    expect(linkable.set).toBeNull();
  });

  it('linkifies eligible text nodes while preserving excluded content', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>Read John 3:16 now</p><code>John 3:16</code><p>nothing here</p>';
    linkifyContainer(
      container,
      text => text.includes('John'),
      'code',
      text => text.replace('John 3:16', '<a class="verse-link">John 3:16</a>')
    );
    expect(container.querySelectorAll('.verse-link')).toHaveLength(1);
    expect(container.querySelector('code').textContent).toBe('John 3:16');
  });
});

describe('integrated verse detection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', callback => callback());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('connects detector APIs to language-change events', () => {
    let languageHandler;
    const app = { on: vi.fn((name, handler) => { languageHandler = handler; }) };
    const detector = VerseDetectionPlugin(app, { language: 'en' });
    expect(detector.name).toBe('VerseDetectionPlugin');
    expect(detector.getVerseRegex()).toBeInstanceOf(RegExp);
    expect(detector.getBookPatterns().John).toContain('John');
    expect(detector.getCanonicalBookName('jn')).toMatchObject({ canonical: 'John' });
    languageHandler('es');
    expect(detector.getCurrentLanguages()).toContain('es');
    languageHandler('unsupported');
    expect(detector.getCurrentLanguages()).toContain('es');
  });

  it('initializes, processes a container, restricts languages, and tears down', async () => {
    const system = await initVerseDetection(null, {
      displayMode: 'link',
      language: { autoDetect: false, primary: 'en' },
      contentSource: { dynamicTextSelection: false, textIdsByLanguage: { en: 'ENGWEB' } },
      link: { openInNewTab: false }
    });
    const container = document.createElement('div');
    container.textContent = 'Read John 3:16 and Juan 3:16.';
    system.processContainer(container);
    expect(container.querySelector('.verse-link')).not.toBeNull();
    expect(system.processText('John 3:16')).toContain('verse-link');
    system.setAvailableTextLanguages(['es']);
    expect(system.hasTextForLanguage('en')).toBe(false);
    expect(system.hasTextForLanguage('es')).toBe(true);
    system.setAvailableTextLanguages(null);
    expect(system.hasTextForLanguage('en')).toBe(true);
    system.destroy();
  });

  it('drives VersePopup loading, display, navigation, hiding, and cleanup', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '<div class="section"><span class="v" data-id="JN3_16">For God so loved</span></div>'
    }));
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(() => Promise.resolve()) }
    });
    const app = { navigateToRef: vi.fn() };
    const popup = new VersePopup(makeConfig());
    expect(createVersePopup()).toBeInstanceOf(VersePopup);
    await popup.init(app);

    const container = document.createElement('div');
    container.innerHTML = '<a class="verse-link" data-verse-ref="John 3:16" data-detected-lang="en">John 3:16</a>';
    document.body.appendChild(container);
    const link = container.querySelector('a');
    popup.attach(container);
    await popup.show(link);
    const popupElement = document.querySelector('.verse-popup');
    expect(popupElement.classList.contains('visible')).toBe(true);
    expect(popupElement.textContent).toContain('For God so loved');
    expect(popup.parseReference('John 3:16')).toMatchObject({ sectionId: 'JN3' });
    expect(popup.getTextId('en')).toBe('ENGWEB');
    expect(await popup.fetchVerseContent('John 3:16', 'en')).toContain('For God so loved');

    link.click();
    expect(app.navigateToRef).toHaveBeenCalledWith('JN3', 'JN3_16');
    popupElement.querySelector('[data-platform="copy"]').click();
    await Promise.resolve();
    popup.hide();
    vi.advanceTimersByTime(200);
    expect(link.getAttribute('aria-expanded')).toBe('false');

    expect(popup.getTextsForLanguage('en')).toEqual([]);
    expect(popup.getAvailableLanguages()).toEqual({});
    popup.setPreferredText('en', ['ENGALT', 'ENGWEB']);
    expect(popup.getTextIdMapping()).toEqual({ en: 'ENGWEB' });
    popup.detach(container);
    popup.destroy();
    expect(document.body.contains(popupElement)).toBe(false);
  });

  it('keeps invalid or unavailable popup targets silent and renders fetch errors', async () => {
    const popup = new VersePopup(makeConfig());
    await popup.init();
    await popup.show(document.createElement('a'));
    const unavailable = document.createElement('a');
    unavailable.dataset.verseRef = 'John 3:16';
    unavailable.dataset.detectedLang = 'fr';
    await popup.show(unavailable);
    expect(document.querySelector('.verse-popup').classList.contains('visible')).toBe(false);

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    const valid = document.createElement('a');
    valid.dataset.verseRef = 'John 3:16';
    valid.dataset.detectedLang = 'en';
    valid.textContent = 'John 3:16';
    await popup.show(valid);
    expect(document.querySelector('.verse-popup-error').textContent).toContain('Chapter not available');
    popup.destroy();
  });
});

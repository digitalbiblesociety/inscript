import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: null,
  popup: null,
  chrome: null,
  mergeConfig: vi.fn(),
  buildSocialShareHtml: vi.fn(() => '<div>social</div>'),
  handleSocialShare: vi.fn(),
  buildFootnotesHtml: vi.fn(() => '<div>notes</div>'),
  getTextId: vi.fn(() => 'ENG'),
  fetchVerseContent: vi.fn(),
  loadAppTextLoader: vi.fn(),
  parsePopupReference: vi.fn(),
  attachVerseLinkHandlers: vi.fn(),
  bindPopupChromeEvents: vi.fn(),
  createPopupElement: vi.fn(),
  detachVerseLinkHandlers: vi.fn(),
  hidePopupElement: vi.fn(),
  positionPopup: vi.fn(),
  presentPopup: vi.fn(),
  handleClickInteraction: vi.fn(),
  handleKeyDownInteraction: vi.fn(),
  handleTouchEndInteraction: vi.fn(),
  navigateAppToVerse: vi.fn(),
  flashButtonClass: vi.fn(),
  renderErrorContent: vi.fn(),
  renderVerseContent: vi.fn(),
  applyTextIdMapping: vi.fn(),
  getAvailableLanguagesFromIndex: vi.fn(() => ({})),
  getTextsForLanguageFromIndex: vi.fn(() => []),
  loadTextsIndex: vi.fn()
}));

vi.mock('@verse-detection/config.js', () => ({ mergeConfig: fixtures.mergeConfig }));
vi.mock('@verse-detection/SocialShareHandler.js', () => ({
  buildSocialShareHtml: fixtures.buildSocialShareHtml,
  handleSocialShare: fixtures.handleSocialShare
}));
vi.mock('@verse-detection/VerseExtractor.js', () => ({
  buildFootnotesHtml: fixtures.buildFootnotesHtml
}));
vi.mock('@verse-detection/VerseUrlBuilder.js', () => ({ getTextId: fixtures.getTextId }));
vi.mock('@verse-detection/PopupContent.js', () => ({
  fetchVerseContent: fixtures.fetchVerseContent,
  loadAppTextLoader: fixtures.loadAppTextLoader,
  parsePopupReference: fixtures.parsePopupReference
}));
vi.mock('@verse-detection/PopupElement.js', () => ({
  attachVerseLinkHandlers: fixtures.attachVerseLinkHandlers,
  bindPopupChromeEvents: fixtures.bindPopupChromeEvents,
  createPopupElement: fixtures.createPopupElement,
  detachVerseLinkHandlers: fixtures.detachVerseLinkHandlers,
  hidePopupElement: fixtures.hidePopupElement,
  positionPopup: fixtures.positionPopup,
  presentPopup: fixtures.presentPopup
}));
vi.mock('@verse-detection/PopupInteractions.js', () => ({
  handleClickInteraction: fixtures.handleClickInteraction,
  handleKeyDownInteraction: fixtures.handleKeyDownInteraction,
  handleTouchEndInteraction: fixtures.handleTouchEndInteraction,
  navigateAppToVerse: fixtures.navigateAppToVerse
}));
vi.mock('@verse-detection/PopupRenderer.js', () => ({
  flashButtonClass: fixtures.flashButtonClass,
  renderErrorContent: fixtures.renderErrorContent,
  renderVerseContent: fixtures.renderVerseContent
}));
vi.mock('@verse-detection/PopupTextCatalog.js', () => ({
  applyTextIdMapping: fixtures.applyTextIdMapping,
  getAvailableLanguagesFromIndex: fixtures.getAvailableLanguagesFromIndex,
  getTextsForLanguageFromIndex: fixtures.getTextsForLanguageFromIndex,
  loadTextsIndex: fixtures.loadTextsIndex
}));

import { createVersePopup, VersePopup } from '@verse-detection/VersePopup.ts';

function config(overrides = {}) {
  return {
    displayMode: 'popup',
    language: { primary: 'en' },
    popup: {
      showDelay: 20, hideDelay: 30, showSocialShare: true,
      socialSharePlatforms: ['copy']
    },
    appIntegration: { useAppTextLoader: true, useAppNavigation: true },
    contentSource: {
      dynamicTextSelection: true,
      textIdsByLanguage: { en: 'ENG' },
      preferredTextIdsByLanguage: null
    },
    appBaseUrl: 'https://app.test',
    ...overrides
  };
}

function makePopupElement() {
  const popup = document.createElement('div');
  popup.id = 'verse-popup';
  document.body.appendChild(popup);
  return popup;
}

function target(overrides = {}) {
  const el = document.createElement('a');
  el.dataset.verseRef = 'John 3:16';
  el.dataset.detectedLang = 'en';
  el.textContent = 'John 3:16';
  Object.assign(el.dataset, overrides);
  return el;
}

describe('VersePopup controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.useFakeTimers();
    fixtures.config = config();
    fixtures.popup = makePopupElement();
    fixtures.chrome = null;
    fixtures.mergeConfig.mockImplementation(() => fixtures.config);
    fixtures.createPopupElement.mockImplementation(() => fixtures.popup);
    fixtures.bindPopupChromeEvents.mockImplementation((_popup, chrome) => { fixtures.chrome = chrome; });
    fixtures.loadAppTextLoader.mockResolvedValue({ getText: vi.fn() });
    fixtures.loadTextsIndex.mockResolvedValue({ textsIndexData: [{ id: 'ENG' }], loaded: true });
    fixtures.fetchVerseContent.mockResolvedValue({ content: 'verse content', footnotes: [{ id: 1 }] });
    fixtures.getTextId.mockReturnValue('ENG');
    fixtures.parsePopupReference.mockReturnValue({ sectionId: 'JN3' });
    fixtures.buildFootnotesHtml.mockReturnValue('<div>notes</div>');
    fixtures.buildSocialShareHtml.mockReturnValue('<div>social</div>');
    fixtures.getTextsForLanguageFromIndex.mockReturnValue([{ id: 'ENG' }]);
    fixtures.getAvailableLanguagesFromIndex.mockReturnValue({ en: 1 });
    vi.stubGlobal('requestAnimationFrame', callback => callback());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('creates instances and skips initialization when document is unavailable', async () => {
    expect(createVersePopup()).toBeInstanceOf(VersePopup);
    const popup = new VersePopup();
    vi.stubGlobal('document', undefined);
    await popup.init();
    expect(fixtures.createPopupElement).not.toHaveBeenCalled();
  });

  it('initializes app loading, dynamic catalog, chrome callbacks, and keyboard binding', async () => {
    const app = { navigateToRef: vi.fn() };
    const popup = new VersePopup();
    const add = vi.spyOn(document, 'addEventListener');
    await popup.init(app);
    expect(fixtures.createPopupElement).toHaveBeenCalledWith(fixtures.config);
    expect(fixtures.loadAppTextLoader).toHaveBeenCalled();
    expect(fixtures.loadTextsIndex).toHaveBeenCalledWith(fixtures.config);
    expect(popup.textsIndexData).toEqual([{ id: 'ENG' }]);
    expect(popup.textsIndexLoaded).toBe(true);
    expect(add).toHaveBeenCalledWith('keydown', popup.handleKeyDown);

    popup.hideTimeout = setTimeout(() => {}, 100);
    fixtures.chrome.clearHideTimeout();
    expect(popup.hideTimeout).toBeNull();
    popup.hide = vi.fn();
    fixtures.chrome.scheduleHide();
    vi.advanceTimersByTime(30);
    expect(popup.hide).toHaveBeenCalled();
    fixtures.chrome.onCrossReferenceClick('John 4:1');
    expect(fixtures.navigateAppToVerse).toHaveBeenCalledWith(app, 'John 4:1', undefined);
  });

  it('initializes without optional app integration or dynamic catalog', async () => {
    fixtures.config = config({
      appIntegration: { useAppTextLoader: false, useAppNavigation: false },
      contentSource: { dynamicTextSelection: false, textIdsByLanguage: {} }
    });
    const popup = new VersePopup();
    await popup.init({});
    expect(fixtures.loadAppTextLoader).not.toHaveBeenCalled();
    expect(fixtures.loadTextsIndex).not.toHaveBeenCalled();
  });

  it('attaches and detaches full listener maps and ignores null containers', async () => {
    const popup = new VersePopup();
    await popup.init();
    popup.attach(null);
    popup.detach(null);
    expect(fixtures.attachVerseLinkHandlers).not.toHaveBeenCalled();
    const container = document.createElement('div');
    popup.attach(container);
    popup.detach(container);
    const listeners = fixtures.attachVerseLinkHandlers.mock.calls[0][1];
    expect(listeners).toMatchObject({
      onMouseEnter: popup.handleMouseEnter,
      onMouseLeave: popup.handleMouseLeave,
      onTouchStart: popup.handleTouchStart,
      onTouchEnd: popup.handleTouchEnd,
      onClick: popup.handleClick
    });
    expect(fixtures.attachVerseLinkHandlers).toHaveBeenCalledWith(
      container, listeners, popup.hasTouch, 'verse-popup'
    );
    expect(fixtures.detachVerseLinkHandlers).toHaveBeenCalledWith(container, expect.any(Object));
  });

  it('schedules hover show/hide outside link-only mode and clears pending timers', async () => {
    const popup = new VersePopup();
    await popup.init();
    const link = target();
    popup.show = vi.fn();
    popup.hide = vi.fn();
    popup.hideTimeout = setTimeout(() => {}, 100);
    popup.handleMouseEnter({ target: link });
    expect(popup.currentTarget).toBe(link);
    expect(popup.hideTimeout).toBeNull();
    vi.advanceTimersByTime(20);
    expect(popup.show).toHaveBeenCalledWith(link);
    popup.handleMouseLeave();
    vi.advanceTimersByTime(30);
    expect(popup.hide).toHaveBeenCalled();

    popup.showTimeout = setTimeout(() => {}, 100);
    popup.clearShowTimeout();
    expect(popup.showTimeout).toBeNull();
    popup.clearShowTimeout();
    popup.clearHideTimeout();
  });

  it('ignores hover behavior in link display mode', async () => {
    fixtures.config = config({ displayMode: 'link' });
    const popup = new VersePopup();
    await popup.init();
    popup.show = vi.fn();
    popup.handleMouseEnter({ target: target() });
    popup.handleMouseLeave();
    vi.runAllTimers();
    expect(popup.show).not.toHaveBeenCalled();
    expect(popup.showTimeout).toBeNull();
    expect(popup.hideTimeout).toBeNull();
  });

  it('delegates touch interactions with duration, target, and toggle callbacks', async () => {
    const popup = new VersePopup();
    await popup.init();
    const link = target();
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(175);
    popup.handleTouchStart({ target: link });
    const event = { preventDefault: vi.fn() };
    popup.handleTouchEnd(event);
    expect(fixtures.handleTouchEndInteraction).toHaveBeenCalledWith(
      event, link, 75, expect.objectContaining({ displayMode: 'popup' })
    );
    const context = fixtures.handleTouchEndInteraction.mock.calls[0][3];
    popup.show = vi.fn();
    popup.hide = vi.fn();
    context.show(link);
    context.hide();
    expect(popup.show).toHaveBeenCalledWith(link);
    expect(popup.hide).toHaveBeenCalled();
  });

  it('delegates click navigation and popup state context', async () => {
    const app = {};
    const popup = new VersePopup();
    await popup.init(app);
    const link = target();
    popup.currentTarget = link;
    fixtures.popup.classList.add('visible');
    const event = { target: link };
    popup.handleClick(event);
    const context = fixtures.handleClickInteraction.mock.calls[0][1];
    expect(context.hasTouch).toBe(popup.hasTouch);
    expect(context.canUseAppNavigation).toBe(true);
    expect(context.isPopupOpenFor(link)).toBe(true);
    expect(context.isPopupOpenFor(target())).toBe(false);
    context.navigate('John 3:16', 'KJV');
    expect(fixtures.navigateAppToVerse).toHaveBeenCalledWith(app, 'John 3:16', 'KJV');
  });

  it('delegates key handling and focuses the current target when requested', async () => {
    const popup = new VersePopup();
    await popup.init();
    const link = target();
    link.focus = vi.fn();
    popup.currentTarget = link;
    fixtures.popup.classList.add('visible');
    const event = { key: 'Escape' };
    popup.handleKeyDown(event);
    const context = fixtures.handleKeyDownInteraction.mock.calls[0][1];
    expect(context.isPopupVisible()).toBe(true);
    context.focusCurrentTarget();
    expect(link.focus).toHaveBeenCalled();
    popup.currentTarget = null;
    expect(() => context.focusCurrentTarget()).not.toThrow();
  });

  it('keeps invalid targets silent and honors explicit versions and display fallback', async () => {
    const popup = new VersePopup();
    await popup.show(target());
    expect(fixtures.presentPopup).not.toHaveBeenCalled();
    await popup.init();
    await popup.show(document.createElement('a'));
    expect(fixtures.presentPopup).not.toHaveBeenCalled();
    fixtures.getTextId.mockReturnValueOnce(null);
    await popup.show(target());
    expect(fixtures.presentPopup).not.toHaveBeenCalled();

    const first = target();
    first.setAttribute('aria-expanded', 'true');
    popup.currentTarget = first;
    const second = target({ version: 'KJV', detectedLang: 'fr' });
    second.textContent = '';
    popup.fetchVerseContent = vi.fn().mockResolvedValue('content');
    popup.displayContent = vi.fn();
    await popup.show(second);
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(fixtures.getTextId).toHaveBeenCalledTimes(1);
    expect(fixtures.presentPopup).toHaveBeenCalledWith(
      fixtures.popup, second, fixtures.config, 'John 3:16'
    );
    expect(popup.fetchVerseContent).toHaveBeenCalledWith('John 3:16', 'fr', 'KJV');
    expect(popup.displayContent).toHaveBeenCalledWith('John 3:16', 'content', 'John 3:16');
    expect(fixtures.positionPopup).toHaveBeenCalledWith(fixtures.popup, second, fixtures.config);
  });

  it('renders show failures through the error surface', async () => {
    const popup = new VersePopup();
    await popup.init();
    popup.fetchVerseContent = vi.fn().mockRejectedValue(new Error('offline'));
    popup.displayError = vi.fn();
    await popup.show(target());
    expect(popup.displayError).toHaveBeenCalledWith('offline');
  });

  it('hides visible state, resets target aria, and tolerates absent popup/target', async () => {
    const popup = new VersePopup();
    popup.hide();
    expect(fixtures.hidePopupElement).not.toHaveBeenCalled();
    await popup.init();
    popup.hide();
    expect(fixtures.hidePopupElement).toHaveBeenCalledWith(fixtures.popup);
    const link = target();
    link.setAttribute('aria-expanded', 'true');
    popup.currentTarget = link;
    popup.hide();
    expect(link.getAttribute('aria-expanded')).toBe('false');
  });

  it('delegates parsing, fetching, text mapping, footnotes, and catalog queries', async () => {
    const popup = new VersePopup();
    await popup.init();
    expect(popup.parseReference('John 3:16')).toEqual({ sectionId: 'JN3' });
    expect(await popup.fetchVerseContent('John 3:16', 'en', 'KJV')).toBe('verse content');
    expect(popup.collectedFootnotes).toEqual([{ id: 1 }]);
    expect(fixtures.fetchVerseContent).toHaveBeenCalledWith(expect.objectContaining({
      config: fixtures.config, cache: popup.cache, textLoader: popup.textLoader, app: null
    }), 'John 3:16', 'en', 'KJV');
    expect(popup.getTextId('en')).toBe('ENG');
    expect(popup.buildFootnotesHtml()).toBe('<div>notes</div>');
    expect(popup.buildSocialShareHtml()).toBe('<div>social</div>');
    expect(popup.getTextsForLanguage('en')).toEqual([{ id: 'ENG' }]);
    expect(popup.getAvailableLanguages()).toEqual({ en: 1 });
  });

  it('delegates social sharing with feedback when mounted and without it otherwise', async () => {
    const popup = new VersePopup();
    await popup.init();
    popup.handleSocialShare('copy', 'John 3:16', 'content');
    let options = fixtures.handleSocialShare.mock.calls[0][0];
    expect(options).toMatchObject({
      platform: 'copy', reference: 'John 3:16', content: 'content', appBaseUrl: 'https://app.test'
    });
    expect(options.parseReference('John 3:16')).toEqual({ sectionId: 'JN3' });
    options.showCopyFeedback('.copy', 'copied', 1500);
    expect(fixtures.flashButtonClass).toHaveBeenCalledWith(fixtures.popup, '.copy', 'copied', 1500);

    popup.popup = null;
    popup.handleSocialShare('email', 'John 1:1', 'text');
    options = fixtures.handleSocialShare.mock.calls[1][0];
    expect(options.showCopyFeedback).toBeUndefined();
  });

  it('renders content/error only with a popup and routes social callbacks with canonical state', async () => {
    const popup = new VersePopup();
    popup.displayContent('Ref', 'Content');
    popup.displayError('error');
    expect(fixtures.renderVerseContent).not.toHaveBeenCalled();
    expect(fixtures.renderErrorContent).not.toHaveBeenCalled();
    await popup.init();
    popup.handleSocialShare = vi.fn();
    popup.displayContent('Display', 'Content', 'Canonical');
    expect(fixtures.renderVerseContent).toHaveBeenCalledWith(fixtures.popup, expect.objectContaining({
      reference: 'Display', content: 'Content', footnotesHtml: '<div>notes</div>',
      socialHtml: '<div>social</div>', popupConfig: fixtures.config.popup
    }));
    fixtures.renderVerseContent.mock.calls[0][1].onSocialShare('copy');
    expect(popup.handleSocialShare).toHaveBeenCalledWith('copy', 'Canonical', 'Content');
    popup.displayContent('Fallback', 'Other');
    expect(popup.currentReference).toBe('Fallback');
    popup.displayError('bad');
    expect(fixtures.renderErrorContent).toHaveBeenCalledWith(fixtures.popup, 'bad');
  });

  it('sets preferred text configuration and rebuilds loaded dynamic mappings', async () => {
    const popup = new VersePopup();
    popup.setPreferredText('en', ['ONE', 'TWO']);
    expect(fixtures.config.contentSource.preferredTextIdsByLanguage).toEqual({ en: ['ONE', 'TWO'] });
    expect(fixtures.applyTextIdMapping).not.toHaveBeenCalled();
    await popup.init();
    popup.setPreferredText('es', 'SPA');
    expect(fixtures.applyTextIdMapping).toHaveBeenCalledWith(fixtures.config, [{ id: 'ENG' }]);
    expect(popup.getTextIdMapping()).toEqual({ en: 'ENG' });
  });

  it('destroys timers, keyboard binding, popup DOM, and cache safely', async () => {
    const popup = new VersePopup();
    await popup.init();
    popup.cache.set('one', { content: 'cached' });
    popup.showTimeout = setTimeout(() => {}, 100);
    popup.hideTimeout = setTimeout(() => {}, 100);
    const remove = vi.spyOn(document, 'removeEventListener');
    popup.destroy();
    expect(popup.showTimeout).toBeNull();
    expect(popup.hideTimeout).toBeNull();
    expect(remove).toHaveBeenCalledWith('keydown', popup.handleKeyDown);
    expect(fixtures.popup.parentNode).toBeNull();
    expect(popup.cache.size).toBe(0);
    popup.popup = null;
    expect(() => popup.destroy()).not.toThrow();
  });
});

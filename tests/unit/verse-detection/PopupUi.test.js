import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeConfig } from '@verse-detection/config.ts';
import {
  attachVerseLinkHandlers,
  bindPopupChromeEvents,
  createPopupElement,
  detachVerseLinkHandlers,
  hidePopupElement,
  positionPopup,
  presentPopup
} from '@verse-detection/PopupElement.ts';
import {
  handleClickInteraction,
  handleKeyDownInteraction,
  handleTouchEndInteraction,
  navigateAppToVerse
} from '@verse-detection/PopupInteractions.ts';
import {
  flashButtonClass,
  renderErrorContent,
  renderVerseContent
} from '@verse-detection/PopupRenderer.ts';
import { buildSocialShareHtml, handleSocialShare } from '@verse-detection/SocialShareHandler.ts';

function popupConfig(overrides = {}) {
  return mergeConfig({
    popup: { showDelay: 0, hideDelay: 0, maxWidth: 320, maxHeight: 180, ...overrides }
  });
}

function eventFor(target, key) {
  const event = key
    ? new KeyboardEvent('keydown', { key, cancelable: true })
    : new MouseEvent('click', { cancelable: true });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('verse popup DOM helpers', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', callback => callback());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates, positions, presents, and hides an accessible popup', () => {
    const config = popupConfig({ position: 'auto', showLoadingIndicator: true });
    const popup = createPopupElement(config);
    const second = createPopupElement(config);
    expect(document.querySelectorAll('#verse-popup-styles')).toHaveLength(1);
    expect(second.id).not.toBe(popup.id);

    Object.defineProperties(popup, {
      offsetHeight: { value: 120 },
      offsetWidth: { value: 300 }
    });
    const target = document.createElement('a');
    target.getBoundingClientRect = () => ({
      top: 700, bottom: 720, left: 790, right: 820, width: 30, height: 20
    });
    Object.defineProperties(window, {
      innerHeight: { configurable: true, value: 800 },
      innerWidth: { configurable: true, value: 800 },
      scrollY: { configurable: true, value: 5 }
    });

    presentPopup(popup, target, config, 'John 3:16');
    expect(popup.classList.contains('visible')).toBe(true);
    expect(popup.innerHTML).toContain('Loading');
    expect(popup.getAttribute('aria-label')).toContain('John 3:16');
    expect(target.getAttribute('aria-expanded')).toBe('true');
    expect(parseFloat(popup.style.left)).toBeGreaterThanOrEqual(10);
    expect(parseFloat(popup.style.top)).toBeGreaterThanOrEqual(15);

    positionPopup(popup, target, popupConfig({ position: 'below' }));
    expect(parseFloat(popup.style.top)).toBeGreaterThan(720);
    positionPopup(null, target, config);

    hidePopupElement(popup);
    vi.advanceTimersByTime(200);
    expect(popup.style.display).toBe('none');
  });

  it('binds popup chrome and link mouse/touch/click handlers', () => {
    const popup = createPopupElement(popupConfig());
    const clear = vi.fn();
    const schedule = vi.fn();
    const navigate = vi.fn();
    bindPopupChromeEvents(popup, {
      clearHideTimeout: clear,
      scheduleHide: schedule,
      onCrossReferenceClick: navigate
    });
    popup.dispatchEvent(new MouseEvent('mouseenter'));
    popup.dispatchEvent(new MouseEvent('mouseleave'));
    popup.innerHTML = '<a class="bibleref" data-id="Romans 8:1">Romans 8:1</a><span>plain</span>';
    popup.querySelector('.bibleref').click();
    popup.querySelector('span').click();
    expect(clear).toHaveBeenCalledOnce();
    expect(schedule).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('Romans 8:1');

    const container = document.createElement('div');
    container.innerHTML = '<a class="verse-link" data-verse-ref="John 3:16">John 3:16</a>';
    const listeners = {
      onMouseEnter: vi.fn(), onMouseLeave: vi.fn(), onTouchStart: vi.fn(),
      onTouchEnd: vi.fn(), onClick: vi.fn()
    };
    const link = container.querySelector('a');
    attachVerseLinkHandlers(container, listeners, false, popup.id);
    link.dispatchEvent(new MouseEvent('mouseenter'));
    link.dispatchEvent(new MouseEvent('mouseleave'));
    link.click();
    expect(link.getAttribute('role')).toBe('button');
    expect(link.getAttribute('aria-controls')).toBe(popup.id);
    expect(listeners.onMouseEnter).toHaveBeenCalledOnce();
    expect(listeners.onClick).toHaveBeenCalledOnce();
    detachVerseLinkHandlers(container, listeners);
    link.click();
    expect(listeners.onClick).toHaveBeenCalledOnce();

    attachVerseLinkHandlers(container, listeners, true, null);
    link.dispatchEvent(new Event('touchstart'));
    link.dispatchEvent(new Event('touchend'));
    expect(listeners.onTouchStart).toHaveBeenCalledOnce();
    expect(listeners.onTouchEnd).toHaveBeenCalledOnce();
  });

  it('renders content, wires social buttons, and updates transient classes', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    const popup = document.createElement('div');
    const share = vi.fn();
    renderVerseContent(popup, {
      reference: 'John 3:16',
      content: '<span class="v">For God so loved</span>',
      footnotesHtml: '<div class="verse-popup-footnotes">note</div>',
      socialHtml: '<button class="verse-popup-social-btn" data-platform="copy">copy</button>',
      popupConfig: { showHeader: true, showLogo: true, showSocialShare: true, logoUrl: 'https://example.test' },
      onSocialShare: share
    });
    expect(popup.querySelector('.verse-popup-logo')).not.toBeNull();
    expect(popup.querySelector('.verse-popup-content').classList.contains('scrollable')).toBe(true);
    popup.querySelector('[data-platform="copy"]').click();
    expect(share).toHaveBeenCalledWith('copy');

    renderErrorContent(popup, 'Unavailable');
    expect(popup.textContent).toBe('Unavailable');
    popup.innerHTML = '<button class="copy"></button>';
    flashButtonClass(popup, '.copy', 'copied', 25);
    expect(popup.querySelector('.copy').classList.contains('copied')).toBe(true);
    vi.advanceTimersByTime(25);
    expect(popup.querySelector('.copy').classList.contains('copied')).toBe(false);
    flashButtonClass(popup, '.missing', 'copied', 25);
  });
});

describe('popup interactions and sharing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('handles long presses, taps, clicks, and keyboard toggles', () => {
    const target = document.createElement('a');
    target.className = 'verse-link';
    target.dataset.verseRef = 'John 3:16';
    target.dataset.version = 'NIV';
    const ctx = {
      displayMode: 'both',
      isPopupOpenFor: vi.fn(() => false),
      show: vi.fn(),
      hide: vi.fn()
    };

    const longPress = new Event('touchend', { cancelable: true });
    handleTouchEndInteraction(longPress, target, 400, ctx);
    expect(longPress.defaultPrevented).toBe(true);
    expect(ctx.show).toHaveBeenCalledWith(target);
    handleTouchEndInteraction(new Event('touchend'), null, 10, ctx);

    ctx.show.mockClear();
    const tap = new Event('touchend', { cancelable: true });
    handleTouchEndInteraction(tap, target, 20, ctx);
    expect(tap.defaultPrevented).toBe(true);
    expect(ctx.show).toHaveBeenCalledWith(target);
    ctx.isPopupOpenFor.mockReturnValue(true);
    handleTouchEndInteraction(new Event('touchend'), target, 20, ctx);
    expect(ctx.hide).toHaveBeenCalled();

    const navigate = vi.fn();
    const click = eventFor(target);
    handleClickInteraction(click, { ...ctx, displayMode: 'popup', hasTouch: false, canUseAppNavigation: false, navigate });
    expect(click.defaultPrevented).toBe(true);
    handleClickInteraction(eventFor(target), { ...ctx, displayMode: 'both', hasTouch: true, canUseAppNavigation: true, navigate });
    expect(navigate).toHaveBeenCalledWith('John 3:16', 'NIV');

    const keyCtx = { ...ctx, displayMode: 'both', isPopupVisible: () => true, focusCurrentTarget: vi.fn() };
    handleKeyDownInteraction(eventFor(target, 'Escape'), keyCtx);
    expect(keyCtx.focusCurrentTarget).toHaveBeenCalled();
    ctx.isPopupOpenFor.mockReturnValue(false);
    const enter = eventFor(target, 'Enter');
    handleKeyDownInteraction(enter, keyCtx);
    expect(enter.defaultPrevented).toBe(true);
    handleKeyDownInteraction(eventFor(document.body, 'x'), keyCtx);
  });

  it('navigates through either supported app API', () => {
    const direct = { navigateToRef: vi.fn() };
    navigateAppToVerse(direct, 'John 3:16', 'NIV');
    expect(direct.navigateToRef).toHaveBeenCalledWith('JN3', 'JN3_16');
    const eventApp = { trigger: vi.fn() };
    navigateAppToVerse(eventApp, 'Psalms 23', 'WEB');
    expect(eventApp.trigger).toHaveBeenCalledWith('navigate', {
      sectionId: 'PS23', verseId: null, textId: 'WEB'
    });
    navigateAppToVerse(null, 'John 3:16');
    navigateAppToVerse(eventApp, 'not a reference');
  });

  it('builds and dispatches every supported share action', async () => {
    expect(buildSocialShareHtml({ showSocialShare: false, appBaseUrl: '/' })).toBe('');
    const html = buildSocialShareHtml({
      showSocialShare: true,
      socialSharePlatforms: ['facebook', 'x', 'bluesky', 'copy'],
      appBaseUrl: 'https://example.test/'
    });
    expect(html).toContain('Share on Facebook');
    expect(html).toContain('Copy to clipboard');

    const open = vi.fn();
    vi.stubGlobal('open', open);
    const parseReference = () => ({ sectionId: 'JN3' });
    for (const platform of ['facebook', 'x', 'bluesky']) {
      handleSocialShare({ platform, reference: 'John 3:16', content: '<b>Love</b>', appBaseUrl: 'https://app/', parseReference });
    }
    expect(open).toHaveBeenCalledTimes(3);

    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const feedback = vi.fn();
    handleSocialShare({
      platform: 'copy', reference: 'John 3:16', content: '<b>Love</b>',
      appBaseUrl: 'https://app/', parseReference, showCopyFeedback: feedback
    });
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('"Love" - John 3:16');
    expect(feedback).toHaveBeenCalledWith('.verse-popup-social-btn.copy', 'copied', 1500);
  });
});

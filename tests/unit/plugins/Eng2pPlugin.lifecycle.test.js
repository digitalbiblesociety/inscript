import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AppSettings from '@common/AppSettings.js';
import { updateConfig } from '@core/config.js';
import { Eng2pPlugin } from '@plugins/Eng2pPlugin.js';

function installPopoverStubs() {
  HTMLElement.prototype.showPopover = vi.fn(function showPopover() { this.dataset.popoverOpen = 'true'; });
  HTMLElement.prototype.hidePopover = vi.fn(function hidePopover() { delete this.dataset.popoverOpen; });
  const nativeMatches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function matches(selector) {
    if (selector === ':popover-open') return this.dataset?.popoverOpen === 'true';
    return nativeMatches.call(this, selector);
  });
}

describe('Eng2pPlugin supplemental lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState({}, '', '/');
    document.body.innerHTML = `
      <div id="config-tools"><div class="config-body"></div></div>
      <div id="config-window" data-popover-open="true"></div>`;
    installPopoverStubs();
    updateConfig({
      enableEng2pPlugin: true, eng2pEnableAll: true,
      eng2pDefaultSetting: 'none', eng2pShowWindowAtStartup: false
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    AppSettings.removeValue('docs-config-eng2p-setting');
    history.replaceState({}, '', '/');
  });

  it('returns an inert object while disabled', () => {
    updateConfig({ enableEng2pPlugin: false });
    expect(Eng2pPlugin()).toEqual({});
  });

  it('honors URL selection/startup flags and closes the config popover', () => {
    history.replaceState({}, '', '/?eng2p=yall&eng2pshow=1');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    const extension = Eng2pPlugin();
    expect(extension.sendMessage()).toBeUndefined();
    const movable = document.querySelector('.movable-window');
    expect(movable.showPopover).toHaveBeenCalled();
    expect(movable.style.left).toMatch(/px$/);
    expect(document.querySelector('#eng2p-option-yall').checked).toBe(true);
    document.querySelector('#config-eng2p-button').click();
    expect(document.querySelector('#config-window').hidePopover).toHaveBeenCalled();
  });

  it('covers possessive/reflexive replacements and removes earlier transforms', () => {
    const chapter = document.createElement('div');
    chapter.className = 'chapter';
    chapter.lang = 'en-US';
    chapter.innerHTML = '<span class="v" data-id="GN1_22">Your Yours Yourselves</span>';
    document.body.appendChild(chapter);
    Eng2pPlugin();
    document.querySelector('#eng2p-option-yall').click();
    expect(chapter.querySelectorAll('.eng2p-corrected')).toHaveLength(3);
    document.querySelector('#eng2p-option-highlight').click();
    expect(chapter.querySelector('.eng2p-corrected')).toBeNull();
    expect(chapter.querySelector('.eng2p-original')).toBeNull();
    expect(chapter.querySelectorAll('.eng2p-highlight')).toHaveLength(3);
  });

  it('skips non-English and unlisted verses in documents and loaded content', () => {
    const spanish = document.createElement('div');
    spanish.className = 'chapter';
    spanish.lang = 'spa';
    spanish.innerHTML = '<span class="v" data-id="GN1_22">You</span>';
    const unlisted = document.createElement('div');
    unlisted.className = 'chapter';
    unlisted.lang = 'eng';
    unlisted.innerHTML = '<span class="v" data-id="ZZ1_1">You</span>';
    document.body.append(spanish, unlisted);
    const extension = Eng2pPlugin();
    document.querySelector('#eng2p-option-highlight').click();
    expect(document.querySelector('.eng2p-highlight')).toBeNull();

    extension.trigger('message', { data: { messagetype: 'textload', type: 'bible', content: 'html' } });
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<div class="chapter" lang="spa"><span class="v" data-id="GN1_22">You</span></div>';
    extension.trigger('message', { data: { messagetype: 'textload', type: 'bible', content: wrapper } });
    expect(wrapper.querySelector('.eng2p-highlight')).toBeNull();
  });
});

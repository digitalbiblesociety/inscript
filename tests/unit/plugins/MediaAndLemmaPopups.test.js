import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateConfig } from '@core/config.js';
import { setApp } from '@core/registry.js';
import { LemmaPopupPlugin } from '@plugins/LemmaPopupPlugin.js';
import { MediaLibraryPopups, playableVideos } from '@plugins/MediaLibraryPopups.js';

function installPopoverStubs() {
  HTMLElement.prototype.showPopover = vi.fn(function showPopover() {
    this.dataset.popoverOpen = 'true';
    this.dispatchEvent(new Event('toggle'));
  });
  HTMLElement.prototype.hidePopover = vi.fn(function hidePopover() {
    delete this.dataset.popoverOpen;
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', { value: 'closed' });
    this.dispatchEvent(event);
  });
  const nativeMatches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function matches(selector) {
    if (selector === ':popover-open') return this.dataset?.popoverOpen === 'true';
    return nativeMatches.call(this, selector);
  });
}

describe('media library popups', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    installPopoverStubs();
    updateConfig({ baseContentUrl: 'https://content.test/' });
  });
  afterEach(() => {
    setApp(null);
    vi.restoreAllMocks();
  });

  it('renders image thumbnails and routes an ordinary click to a new media window', () => {
    const add = vi.fn();
    setApp({ windowManager: { getWindows: () => [], add, activate: vi.fn() } });
    const popups = new MediaLibraryPopups();
    const icon = document.createElement('button');
    document.body.appendChild(icon);
    popups.showImage({
      icon,
      mediaLibrary: { folder: 'art', baseUrl: 'https://images.test/', thumbSuffix: '-thumb.jpg', largeSuffix: '-large.jpg' },
      mediaForVerse: [{ filename: 'john', exts: ['jpg'] }],
      reference: 'John 3:16', verseid: 'JN3_16', sectionid: 'JN3'
    });
    const anchor = popups.popup.body.querySelector('a');
    expect(anchor.href).toContain('john-large.jpg');
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }));
    expect(add).toHaveBeenCalledWith('MediaWindow', {
      select: { sectionid: 'JN3', verseid: 'JN3_16', folder: 'art', filename: 'john' }
    });
  });

  it('renders video, cleans it on hide, and activates an existing media window', () => {
    const selectMediaItem = vi.fn();
    const activate = vi.fn();
    setApp({ windowManager: {
      getWindows: () => [{ id: 'media-1', className: 'MediaWindow', controller: { selectMediaItem } }],
      add: vi.fn(), activate
    } });
    const popups = new MediaLibraryPopups();
    const icon = document.createElement('button');
    document.body.appendChild(icon);
    popups.showVideo(icon, { folder: 'video' }, [{ filename: 'clip', exts: 'mp4', name: 'Clip' }]);
    const video = popups.popup.body.querySelector('video');
    video.pause = vi.fn();
    expect(video.src).toContain('/content/media/video/clip.mp4');
    popups.popup.hide();
    expect(video.pause).toHaveBeenCalled();
    popups.openInMediaWindow({ filename: 'other' });
    expect(selectMediaItem).toHaveBeenCalledWith({ filename: 'other' });
    expect(activate).toHaveBeenCalledWith('media-1');
  });

  it('builds an escaped DBS video chooser and ignores unavailable editions', async () => {
    const popups = new MediaLibraryPopups();
    const section = document.createElement('div');
    section.className = 'section';
    section.dataset.lang3 = 'zzz';
    const icon = document.createElement('button');
    section.appendChild(icon);
    document.body.appendChild(section);
    expect(playableVideos([{ org: 'missing' }], 'zzz')).toEqual([{ org: 'missing' }]);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    await popups.showDbsVideo({ icon, mediaLibrary: { folder: 'dbsvideo' }, mediaForVerse: [{ org: 'missing' }] });
    popups.showVideoChooser({
      icon, mediaLibrary: { folder: 'dbsvideo' },
      mediaForVerse: [{ name: 'A < B', source: 'DBS', cover: 'cover.jpg', filename: 'clip' }],
      reference: 'John', verseid: 'JN3_16', sectionid: 'JN3'
    });
    expect(popups.popup.body.querySelector('a').title).toBe('A < B - DBS');
  });
});

describe('lemma popup plugin', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="windows-main"></div>';
    installPopoverStubs();
    updateConfig({ enableLemmaPopupPlugin: true, baseContentUrl: 'https://content.test/' });
  });
  afterEach(() => {
    setApp(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads Greek lemma data, launches find-all, and clears selection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ lemma: 'λόγος', frequency: 12, outline: '<p>word</p>' })
    })));
    const add = vi.fn();
    setApp({ windowManager: { add } });
    LemmaPopupPlugin();
    const section = document.createElement('div');
    section.className = 'BibleWindow section';
    section.lang = 'grc';
    section.innerHTML = '<div class="chapter" data-textid="ENG"><span class="v" data-id="JN1_1"><l s="G3588 G3056" m="T-NSM N-NSM">word</l></span></div>';
    document.querySelector('.windows-main').appendChild(section);
    section.querySelector('l').click();
    const popup = document.querySelector('#lemma-popup');
    await vi.waitFor(() => expect(popup.textContent).toContain('λόγος'));
    popup.querySelector('.lemma-findall').click();
    expect(add).toHaveBeenCalledWith('SearchWindow', { searchtext: 'G3056', textid: 'ENG' });
    expect(section.querySelector('l').classList.contains('selected-lemma')).toBe(false);
  });

  it('handles Hebrew, missing Strong values, and failed lexicon requests', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    LemmaPopupPlugin();
    const section = document.createElement('div');
    section.className = 'BibleWindow section';
    section.lang = 'heb';
    section.innerHTML = '<div class="chapter" data-textid="HEB"><span class="v" data-id="GN1_1"><l s="H853 H430" m="To Ncmpa">word</l><l>plain</l></span></div>';
    document.querySelector('.windows-main').appendChild(section);
    section.querySelector('[s]').click();
    await vi.waitFor(() => expect(document.querySelector('#lemma-popup').textContent).toContain('Error loading'));
    section.querySelector('l:not([s])').click();
    expect(document.querySelector('#lemma-popup').textContent).toContain("No Strong's data");
    section.querySelector('l:not([s])').click();
  });
});

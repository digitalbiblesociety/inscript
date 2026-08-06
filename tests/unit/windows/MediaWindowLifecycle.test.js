import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  translatePage: vi.fn(),
  primeDbsVideoCatalog: vi.fn(() => Promise.resolve()),
  effectiveVideoLanguage: vi.fn(() => 'effective'),
  rankLanguages: vi.fn(() => ['ranked']),
  reloadForLanguage: vi.fn(),
  renderLanguageOption: vi.fn(() => '<option>'),
  renderLanguageOptions: vi.fn(),
  setVideoLanguage: vi.fn(),
  toggleLanguageMenu: vi.fn(),
  updateLanguageLabel: vi.fn(),
  updateLanguageMenu: vi.fn(),
  buildItemTitle: vi.fn(() => 'title'),
  createDbsVideoElement: vi.fn(() => 'dbs-video'),
  createImageElement: vi.fn(() => 'image'),
  createMediaElement: vi.fn(() => 'media'),
  createVideoElement: vi.fn(() => 'video'),
  findGalleryIndex: vi.fn(() => 4),
  navigateGallery: vi.fn(),
  selectMediaItem: vi.fn(),
  showGalleryItem: vi.fn(() => Promise.resolve('shown')),
  updateGalleryUi: vi.fn(),
  buildMediaUrls: vi.fn(() => ['url']),
  createGalleryItem: vi.fn(() => ({ id: 'gallery-item' })),
  getFilterCategory: vi.fn(() => 'art'),
  renderLibraryMediaInto: vi.fn(),
  renderThumbLink: vi.fn(() => '<a>thumb</a>'),
  renderVerseInto: vi.fn((_win, verseid, _reference, parts) => parts.push(`<span>${verseid}</span>`)),
  resizeImages: vi.fn(),
  handleMediaMessage: vi.fn(),
  pickSection: vi.fn(),
  toContainer: vi.fn()
}));

vi.mock('@lib/i18n.js', () => ({
  i18n: { translatePage: fixtures.translatePage }
}));

vi.mock('@/media/DbsVideoApi.js', () => ({
  primeDbsVideoCatalog: fixtures.primeDbsVideoCatalog
}));

vi.mock('@windows/MediaLanguages.js', () => ({
  effectiveVideoLanguage: fixtures.effectiveVideoLanguage,
  rankLanguages: fixtures.rankLanguages,
  reloadForLanguage: fixtures.reloadForLanguage,
  renderLanguageOption: fixtures.renderLanguageOption,
  renderLanguageOptions: fixtures.renderLanguageOptions,
  setVideoLanguage: fixtures.setVideoLanguage,
  toggleLanguageMenu: fixtures.toggleLanguageMenu,
  updateLanguageLabel: fixtures.updateLanguageLabel,
  updateLanguageMenu: fixtures.updateLanguageMenu
}));

vi.mock('@windows/MediaGallery.js', () => ({
  buildItemTitle: fixtures.buildItemTitle,
  createDbsVideoElement: fixtures.createDbsVideoElement,
  createImageElement: fixtures.createImageElement,
  createMediaElement: fixtures.createMediaElement,
  createVideoElement: fixtures.createVideoElement,
  findGalleryIndex: fixtures.findGalleryIndex,
  navigateGallery: fixtures.navigateGallery,
  selectMediaItem: fixtures.selectMediaItem,
  showGalleryItem: fixtures.showGalleryItem,
  updateGalleryUi: fixtures.updateGalleryUi
}));

vi.mock('@windows/MediaThumbs.js', () => ({
  buildMediaUrls: fixtures.buildMediaUrls,
  createGalleryItem: fixtures.createGalleryItem,
  getFilterCategory: fixtures.getFilterCategory,
  renderLibraryMediaInto: fixtures.renderLibraryMediaInto,
  renderThumbLink: fixtures.renderThumbLink,
  renderVerseInto: fixtures.renderVerseInto,
  resizeImages: fixtures.resizeImages
}));

vi.mock('@windows/MediaContent.js', () => ({
  handleMediaMessage: fixtures.handleMediaMessage,
  pickSection: fixtures.pickSection,
  toContainer: fixtures.toContainer
}));

import { MediaWindow } from '@windows/MediaWindow.js';

async function makeWindow() {
  const component = document.createElement('media-window');
  await component.render();
  component.cacheRefs();
  return component;
}

function findListener(listeners, target, event) {
  return listeners.find(entry => entry.target === target && entry.event === event)?.handler;
}

function optionTarget(iso = 'spa') {
  const option = document.createElement('button');
  option.className = 'media-language-option';
  option.dataset.iso = iso;
  const child = document.createElement('span');
  option.appendChild(child);
  return { option, child };
}

describe('MediaWindow lifecycle and orchestration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    fixtures.primeDbsVideoCatalog.mockResolvedValue();
    fixtures.effectiveVideoLanguage.mockReturnValue('effective');
    fixtures.rankLanguages.mockReturnValue(['ranked']);
    fixtures.renderLanguageOption.mockReturnValue('<option>');
    fixtures.showGalleryItem.mockResolvedValue('shown');
    fixtures.buildItemTitle.mockReturnValue('title');
    fixtures.createVideoElement.mockReturnValue('video');
    fixtures.createImageElement.mockReturnValue('image');
    fixtures.createMediaElement.mockReturnValue('media');
    fixtures.createDbsVideoElement.mockReturnValue('dbs-video');
    fixtures.findGalleryIndex.mockReturnValue(4);
    fixtures.getFilterCategory.mockReturnValue('art');
    fixtures.buildMediaUrls.mockReturnValue(['url']);
    fixtures.createGalleryItem.mockReturnValue({ id: 'gallery-item' });
    fixtures.renderThumbLink.mockReturnValue('<a>thumb</a>');
    fixtures.renderVerseInto.mockImplementation((_win, verseid, _reference, parts) => {
      parts.push(`<span>${verseid}</span>`);
    });
    delete window.MediaLibrary;
    vi.stubGlobal('requestAnimationFrame', callback => callback());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete window.MediaLibrary;
    document.body.innerHTML = '';
  });

  it('starts with media defaults and renders and caches the complete view', async () => {
    const component = await makeWindow();

    expect(component).toBeInstanceOf(MediaWindow);
    expect(component.state).toMatchObject({
      currentSectionId: '', currentLanguage: 'eng', videoLanguage: '',
      filters: { art: true, video: true }, galleryItems: [], currentGalleryIndex: -1
    });
    expect(component.mediaLibraries).toBeNull();
    expect(component.chapterVideoOrgs).toBeInstanceOf(Set);
    expect(component.refs.header).toBe(component.querySelector('.window-header'));
    expect(component.refs.languageFilter).toBe(component.querySelector('.media-language-filter'));
    expect(component.refs.galleryContent).toBe(component.querySelector('.media-gallery-content'));
    expect(component.refs.thumbsContainer).toBe(component.querySelector('.media-thumbs-container'));
  });

  it('wires filters, language controls, gallery controls, resize, and messages', async () => {
    vi.useFakeTimers();
    const component = await makeWindow();
    const listeners = [];
    component.addListener = vi.fn((target, event, handler, options) => {
      listeners.push({ target, event, handler, options });
    });
    component.on = vi.fn();
    component.setFilter = vi.fn();
    component.toggleLanguageMenu = vi.fn();
    component.renderLanguageOptions = vi.fn();
    component.setVideoLanguage = vi.fn();
    component.navigateGallery = vi.fn();
    component.handleMessage = vi.fn();
    component.startResize = vi.fn();
    const addWindowListener = vi.spyOn(window, 'addEventListener');

    component.attachEventListeners();

    const filterButtons = [...component.$$('.media-filter-btn')];
    findListener(listeners, filterButtons[0], 'click')();
    findListener(listeners, filterButtons[1], 'click')();
    expect(component.setFilter).toHaveBeenNthCalledWith(1, 'art', false);
    expect(component.setFilter).toHaveBeenNthCalledWith(2, 'video', false);

    findListener(listeners, component.refs.languageBtn, 'click')();
    component.refs.languageFilter.value = 'spa';
    findListener(listeners, component.refs.languageFilter, 'input')();
    expect(component.toggleLanguageMenu).toHaveBeenCalled();
    expect(component.renderLanguageOptions).toHaveBeenCalledWith('spa');

    const filterKeydown = findListener(listeners, component.refs.languageFilter, 'keydown');
    filterKeydown({ key: 'x' });
    filterKeydown({ key: 'Enter' });
    const { option } = optionTarget('fra');
    component.refs.languageOptions.appendChild(option);
    filterKeydown({ key: 'Enter' });
    expect(component.setVideoLanguage).toHaveBeenCalledWith('fra');

    const menuClick = findListener(listeners, component.refs.languageMenu, 'click');
    menuClick({ target: document.createElement('span') });
    const nested = optionTarget('deu');
    menuClick({ target: nested.child });
    expect(component.setVideoLanguage).toHaveBeenCalledWith('deu');

    findListener(listeners, component.refs.galleryPrev, 'click')();
    findListener(listeners, component.refs.galleryNext, 'click')();
    expect(component.navigateGallery).toHaveBeenNthCalledWith(1, -1);
    expect(component.navigateGallery).toHaveBeenNthCalledWith(2, 1);

    const mainKeydown = findListener(listeners, component.refs.main, 'keydown');
    mainKeydown({ key: 'ArrowLeft' });
    expect(component.navigateGallery).toHaveBeenCalledTimes(2);
    component.refs.gallery.classList.add('active');
    mainKeydown({ key: 'ArrowLeft' });
    mainKeydown({ key: 'ArrowRight' });
    mainKeydown({ key: 'Other' });
    mainKeydown({ key: 'Escape' });
    expect(component.navigateGallery).toHaveBeenNthCalledWith(3, -1);
    expect(component.navigateGallery).toHaveBeenNthCalledWith(4, 1);
    expect(component.refs.gallery.classList).not.toContain('active');

    const contentClick = findListener(listeners, component.refs.galleryContent, 'click');
    component.refs.gallery.classList.add('active');
    contentClick({ target: document.createElement('span') });
    expect(component.refs.gallery.classList).toContain('active');
    contentClick({ target: document.createElement('img') });
    expect(component.refs.gallery.classList).not.toContain('active');

    expect(addWindowListener).toHaveBeenCalledWith('resize', component._resizeHandler, { passive: true });
    component._resizeHandler();
    component._resizeHandler();
    vi.runAllTimers();
    expect(component.startResize).toHaveBeenCalledOnce();

    expect(component.on).toHaveBeenCalledWith('message', expect.any(Function));
    component.on.mock.calls[0][1]({ data: 1 });
    expect(component.handleMessage).toHaveBeenCalledWith({ data: 1 });
  });

  it('closes the language menu only for outside clicks or Escape', async () => {
    const component = await makeWindow();
    const listeners = [];
    component.addListener = vi.fn((target, event, handler) => listeners.push({ target, event, handler }));
    component.on = vi.fn();
    component.toggleLanguageMenu = vi.fn(open => {
      component.refs.languageMenu.classList.toggle('open', open);
    });
    component.attachEventListeners();
    const documentClick = findListener(listeners, document, 'click');
    const headerKeydown = findListener(listeners, component.refs.header, 'keydown');
    const focus = vi.spyOn(component.refs.languageBtn, 'focus');

    documentClick({ target: document.body });
    component.refs.languageMenu.classList.add('open');
    documentClick({ target: component.refs.languageBtn });
    expect(component.toggleLanguageMenu).not.toHaveBeenCalled();
    documentClick({ target: document.body });
    expect(component.toggleLanguageMenu).toHaveBeenCalledWith(false);

    component.refs.languageMenu.classList.add('open');
    headerKeydown({ key: 'x', preventDefault: vi.fn() });
    const escape = { key: 'Escape', preventDefault: vi.fn() };
    headerKeydown(escape);
    expect(escape.preventDefault).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
  });

  it('initializes translation and a normalized saved language without a media API', async () => {
    const component = await makeWindow();
    component.getParam = vi.fn(() => 'SPA');
    component.updateLanguageLabel = vi.fn();

    await component.init();

    expect(fixtures.translatePage).toHaveBeenCalledWith(component.refs.header);
    expect(component.state.videoLanguage).toBe('spa');
    expect(component.updateLanguageLabel).toHaveBeenCalled();
    expect(fixtures.primeDbsVideoCatalog).toHaveBeenCalled();
  });

  it('replays a pending valid selection once media libraries arrive', async () => {
    const component = await makeWindow();
    const select = { sectionid: 'GN1' };
    component.pendingSelect = select;
    component.initData = { select: { sectionid: 'EX1' } };
    component.selectMediaItem = vi.fn();
    const section = document.createElement('div');
    section.className = 'section';
    section.dataset.id = 'GN1';
    document.body.appendChild(section);
    window.MediaLibrary = {
      getMediaLibraries: vi.fn(callback => callback(['library']))
    };

    await component.init();

    expect(component.mediaLibraries).toEqual(['library']);
    expect(component.pendingSelect).toBeNull();
    expect(component.selectMediaItem).toHaveBeenCalledWith(select);
  });

  it('uses an init selection when no focus request is pending', async () => {
    const component = await makeWindow();
    const select = { sectionid: 'EX1' };
    component.initData = { select };
    component.selectMediaItem = vi.fn();
    const section = document.createElement('div');
    section.className = 'section';
    section.dataset.id = 'EX1';
    document.body.appendChild(section);
    window.MediaLibrary = { getMediaLibraries: callback => callback([]) };

    await component.init();

    expect(component.selectMediaItem).toHaveBeenCalledWith(select);
  });

  it('processes queued content or requests current content after libraries load', async () => {
    const withContent = await makeWindow();
    withContent.contentToProcess = document.createElement('div');
    withContent.processContent = vi.fn();
    withContent.requestCurrentContent = vi.fn();
    window.MediaLibrary = { getMediaLibraries: callback => callback([]) };
    await withContent.init();
    expect(withContent.processContent).toHaveBeenCalled();
    expect(withContent.requestCurrentContent).not.toHaveBeenCalled();

    const withoutContent = await makeWindow();
    withoutContent.initData = { select: { sectionid: 'MISSING' } };
    withoutContent.processContent = vi.fn();
    withoutContent.requestCurrentContent = vi.fn();
    await withoutContent.init();
    expect(withoutContent.processContent).not.toHaveBeenCalled();
    expect(withoutContent.requestCurrentContent).toHaveBeenCalled();
  });

  it('toggles filters, forces a rerender, and tolerates missing filter buttons', async () => {
    const component = await makeWindow();
    component.state.currentSectionId = 'GN1';
    component.processContent = vi.fn();

    component.setFilter('art', false);
    expect(component.state.filters.art).toBe(false);
    expect(component.$('[data-filter="art"]').classList).not.toContain('active');
    expect(component.state.currentSectionId).toBe('');
    expect(component.processContent).toHaveBeenCalled();

    component.$('[data-filter="video"]').remove();
    expect(() => component.setFilter('video', false)).not.toThrow();
  });

  it('delegates language, gallery, media, and message helpers with the window context', async () => {
    const component = await makeWindow();
    const item = { id: 1 };
    const options = { autoplay: true };
    const selection = { folder: 'art', filename: 'a', verseid: 'GN1_1' };

    expect(component.effectiveVideoLanguage()).toBe('effective');
    component.updateLanguageMenu();
    expect(component.rankLanguages('sp')).toEqual(['ranked']);
    component.renderLanguageOptions('sp');
    expect(component.renderLanguageOption({ iso: 'spa' })).toBe('<option>');
    component.updateLanguageLabel();
    component.toggleLanguageMenu(true);
    component.setVideoLanguage('spa');
    component.reloadForLanguage();
    component.selectMediaItem(selection);
    expect(component.findGalleryIndex(selection)).toBe(4);
    expect(await component.showGalleryItem(2)).toBe('shown');
    expect(component.createVideoElement('v.mp4', options)).toBe('video');
    expect(component.createImageElement('a.jpg', 'alt')).toBe('image');
    expect(await component.createMediaElement(item)).toBe('media');
    expect(await component.createDbsVideoElement(item)).toBe('dbs-video');
    expect(component.buildItemTitle(item)).toBe('title');
    component.updateGalleryUI(item, 2);
    component.navigateGallery(-1);
    component.handleMessage({ data: 1 });

    expect(fixtures.effectiveVideoLanguage).toHaveBeenCalledWith(component);
    expect(fixtures.rankLanguages).toHaveBeenCalledWith(component, 'sp');
    expect(fixtures.renderLanguageOptions).toHaveBeenCalledWith(component, 'sp');
    expect(fixtures.renderLanguageOption).toHaveBeenCalledWith(component, { iso: 'spa' });
    expect(fixtures.toggleLanguageMenu).toHaveBeenCalledWith(component, true);
    expect(fixtures.setVideoLanguage).toHaveBeenCalledWith(component, 'spa');
    expect(fixtures.findGalleryIndex).toHaveBeenCalledWith(component, selection);
    expect(fixtures.createVideoElement).toHaveBeenCalledWith('v.mp4', options);
    expect(fixtures.updateGalleryUi).toHaveBeenCalledWith(component, item, 2);
    expect(fixtures.handleMediaMessage).toHaveBeenCalledWith(component, { data: 1 });
  });

  it('requests the current content using the global message envelope', async () => {
    const component = await makeWindow();
    component.trigger = vi.fn();
    component.requestCurrentContent();
    expect(component.trigger).toHaveBeenCalledWith('globalmessage', {
      type: 'globalmessage', target: component,
      data: { messagetype: 'maprequest', requesttype: 'currentcontent' }
    });
  });

  it('does not process absent content or a section already displayed', async () => {
    const component = await makeWindow();
    component.resetGalleryState = vi.fn();
    component.processContent();
    component.mediaLibraries = [];
    component.processContent();
    component.contentToProcess = document.createElement('div');
    component.contentToProcess.setAttribute('data-id', 'GN1');
    component.state.currentSectionId = 'GN1';
    component.processContent();
    expect(component.resetGalleryState).not.toHaveBeenCalled();
  });

  it('coordinates a complete content render and records its section language', async () => {
    const component = await makeWindow();
    const content = document.createElement('div');
    content.dataset.id = 'GN1';
    content.setAttribute('data-lang3', 'spa');
    content.setAttribute('lang', 'es');
    component.mediaLibraries = [];
    component.contentToProcess = content;
    component.chapterVideoOrgs.add('old');
    component.resetGalleryState = vi.fn();
    component.clearCheckedMediaMarkers = vi.fn();
    const gallery = document.createElement('div');
    component.createThumbsContainer = vi.fn(() => gallery);
    component.renderVerses = vi.fn(() => '<a>rendered</a>');
    component.attachThumbClickHandlers = vi.fn();
    component.setupImageLoadTracking = vi.fn();
    component.updateLanguageMenu = vi.fn();

    component.processContent();

    expect(component.state.currentSectionId).toBe('GN1');
    expect(component.state.currentLanguage).toBe('spa');
    expect(component.chapterVideoOrgs.size).toBe(0);
    expect(gallery.innerHTML).toBe('<a>rendered</a>');
    expect(component.createThumbsContainer).toHaveBeenCalledWith(expect.objectContaining({
      bookid: 'GN', chapter1: 1, language: 'es'
    }));
    expect(component.attachThumbClickHandlers).toHaveBeenCalledWith(gallery);
    expect(component.setupImageLoadTracking).toHaveBeenCalledWith(gallery);
    expect(component.updateLanguageMenu).toHaveBeenCalled();
  });

  it('extracts content language by priority and falls back to English', () => {
    const component = document.createElement('media-window');
    const el = document.createElement('div');
    el.setAttribute('data-lang3', 'spa');
    el.setAttribute('lang3', 'fra');
    el.setAttribute('lang', 'de');
    expect(component.extractContentLanguage(el)).toBe('spa');
    el.removeAttribute('data-lang3');
    expect(component.extractContentLanguage(el)).toBe('fra');
    el.removeAttribute('lang3');
    expect(component.extractContentLanguage(el)).toBe('de');
    el.removeAttribute('lang');
    expect(component.extractContentLanguage(el)).toBe('eng');
  });

  it('resets gallery state and clears checked markers in content or the document', async () => {
    const component = await makeWindow();
    component.state.galleryItems = [{ id: 1 }];
    component.state.currentGalleryIndex = 2;
    component.refs.gallery.classList.add('active');
    component.refs.galleryContent.innerHTML = '<span>old</span>';
    component.refs.thumbsContainer.innerHTML = '<span>old</span>';
    component.refs.main.scrollTop = 40;
    component.resetGalleryState();
    expect(component.state.galleryItems).toEqual([]);
    expect(component.state.currentGalleryIndex).toBe(-1);
    expect(component.refs.gallery.classList).not.toContain('active');
    expect(component.refs.galleryContent.innerHTML).toBe('');
    expect(component.refs.thumbsContainer.innerHTML).toBe('');
    expect(component.refs.main.scrollTop).toBe(0);

    const local = document.createElement('div');
    local.innerHTML = '<span class="checked-media"></span><span class="checked-media"></span>';
    component.contentToProcess = local;
    component.clearCheckedMediaMarkers();
    expect(local.querySelectorAll('.checked-media')).toHaveLength(0);
    component.contentToProcess = null;
    document.body.innerHTML = '<span class="checked-media"></span>';
    component.clearCheckedMediaMarkers();
    expect(document.querySelectorAll('.checked-media')).toHaveLength(0);
  });

  it('creates a titled thumbs container', async () => {
    const component = await makeWindow();
    const gallery = component.createThumbsContainer({ toString: () => 'Genesis 1' });
    expect(component.refs.thumbsContainer.querySelector('h2').textContent).toBe('Genesis 1');
    expect(gallery.classList).toContain('media-library-thumbs');
  });

  it('renders each usable verse once, preferring the chapter verse node', () => {
    const component = document.createElement('media-window');
    const content = document.createElement('div');
    content.innerHTML = `
      <div class="chapter">
        <span class="verse GN1_1" data-id="GN1_1"></span>
        <span class="v" data-id="GN1_1"></span>
      </div>
      <span class="verse checked-media" data-id="GN1_2"></span>
      <span class="verse"></span>
      <span class="v" data-id="GN1_3"></span>`;

    expect(component.renderVerses(content)).toBe('<span>GN1_1</span><span>GN1_3</span>');
    expect(fixtures.renderVerseInto).toHaveBeenCalledTimes(2);
    expect(content.querySelector('.GN1_1').classList).toContain('checked-media');
  });

  it('opens valid thumbnail indexes and ignores unrelated or invalid clicks', () => {
    const component = document.createElement('media-window');
    const gallery = document.createElement('div');
    gallery.innerHTML = '<a data-index="3"><span class="child"></span></a><a data-index="bad"></a><button></button>';
    component.showGalleryItem = vi.fn();
    component.attachThumbClickHandlers(gallery);

    gallery.querySelector('button').click();
    gallery.querySelector('a[data-index="bad"]').click();
    gallery.querySelector('.child').click();
    expect(component.showGalleryItem).toHaveBeenCalledOnce();
    expect(component.showGalleryItem).toHaveBeenCalledWith(3);
  });

  it('shows a no-content message when a chapter has no images', () => {
    const component = document.createElement('media-window');
    const gallery = document.createElement('div');
    component.setupImageLoadTracking(gallery);
    expect(gallery.querySelector('.media-no-content').textContent).toBe('No media for this chapter');
    expect(gallery.classList).toContain('resized');
  });

  it('coalesces completed image resizing and marks the gallery ready', () => {
    const frames = [];
    vi.stubGlobal('requestAnimationFrame', callback => frames.push(callback));
    const component = document.createElement('media-window');
    component.resizeImages = vi.fn();
    const gallery = document.createElement('div');
    gallery.innerHTML = '<img><img>';
    gallery.querySelectorAll('img').forEach(img => {
      Object.defineProperty(img, 'complete', { configurable: true, value: true });
    });

    component.setupImageLoadTracking(gallery);
    expect(frames).toHaveLength(1);
    expect(gallery.querySelectorAll('.loaded')).toHaveLength(2);
    frames[0]();
    expect(component.resizeImages).toHaveBeenCalledWith(gallery);
    expect(gallery.classList).toContain('resized');
  });

  it('tracks image load and error events until every image is ready', () => {
    const component = document.createElement('media-window');
    component.resizeImages = vi.fn();
    const gallery = document.createElement('div');
    gallery.innerHTML = '<img><img>';
    gallery.querySelectorAll('img').forEach(img => {
      Object.defineProperty(img, 'complete', { configurable: true, value: false });
    });
    component.setupImageLoadTracking(gallery);
    const [loaded, failed] = gallery.querySelectorAll('img');

    loaded.dispatchEvent(new Event('load'));
    expect(loaded.classList).toContain('loaded');
    expect(gallery.classList).not.toContain('resized');
    failed.dispatchEvent(new Event('error'));
    expect(failed.classList).not.toContain('loaded');
    expect(gallery.classList).toContain('resized');
    expect(component.resizeImages).toHaveBeenCalledTimes(2);
  });

  it('delegates thumbnail construction helpers', () => {
    const component = document.createElement('media-window');
    const library = { id: 'lib' };
    const info = { id: 'info' };
    const reference = { id: 'ref' };
    const parts = [];
    const options = { library };
    expect(component.getFilterCategory(library)).toBe('art');
    component.renderVerseInto('GN1_1', reference, parts);
    component.renderLibraryMediaInto(options);
    expect(component.buildMediaUrls(library, info)).toEqual(['url']);
    expect(component.createGalleryItem(options)).toEqual({ id: 'gallery-item' });
    expect(component.renderThumbLink({ id: 1 }, library, info, reference)).toBe('<a>thumb</a>');
    expect(fixtures.renderVerseInto).toHaveBeenCalledWith(component, 'GN1_1', reference, parts);
    expect(fixtures.renderLibraryMediaInto).toHaveBeenCalledWith(component, options);
    expect(fixtures.buildMediaUrls).toHaveBeenCalledWith(component, library, info);
    expect(fixtures.renderThumbLink).toHaveBeenCalledWith(component, { id: 1 }, library, info, reference);
  });

  it('resizes the current gallery and sizes the main pane beneath the header', async () => {
    const component = await makeWindow();
    const gallery = document.createElement('div');
    gallery.className = 'media-library-thumbs';
    component.refs.thumbsContainer.appendChild(gallery);
    Object.defineProperty(component.refs.header, 'offsetHeight', { value: 24 });
    component.startResize();
    expect(fixtures.resizeImages).toHaveBeenCalledWith(gallery);

    component.size(640, 480);
    expect(component.refs.main.style.width).toBe('640px');
    expect(component.refs.main.style.height).toBe('456px');
    expect(fixtures.resizeImages).toHaveBeenCalledTimes(2);
  });

  it('clears gallery content and serializes only an explicit language choice', async () => {
    const component = await makeWindow();
    component.refs.galleryContent.innerHTML = '<img>';
    component.clearGalleryContent();
    expect(component.refs.galleryContent.innerHTML).toBe('');
    expect(component.getData()).toEqual({ params: { win: 'media' } });
    component.state.videoLanguage = 'spa';
    expect(component.getData()).toEqual({
      videoLanguage: 'spa', params: { win: 'media', videoLanguage: 'spa' }
    });
  });

  it('removes resize resources during cleanup and tolerates an idle window', async () => {
    vi.useFakeTimers();
    const component = await makeWindow();
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    component._resizeHandler = vi.fn();
    component._resizeTimeout = setTimeout(() => {}, 1000);
    component._boundHandlers.set('bound', vi.fn());
    component.cleanup();
    expect(removeWindowListener).toHaveBeenCalledWith('resize', component._resizeHandler);
    expect(component._boundHandlers.size).toBe(0);

    const idle = await makeWindow();
    expect(() => idle.cleanup()).not.toThrow();
  });
});

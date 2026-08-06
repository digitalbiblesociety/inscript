import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  getDbsVideoChapter: vi.fn()
}));

vi.mock('@/media/DbsVideoApi.js', () => ({
  getDbsVideoChapter: fixtures.getDbsVideoChapter
}));

import {
  buildItemTitle,
  createDbsVideoElement,
  createImageElement,
  createMediaElement,
  createVideoElement,
  findGalleryIndex,
  navigateGallery,
  selectMediaItem,
  showGalleryItem,
  updateGalleryUi
} from '@windows/MediaGallery.js';

function makeComponent(items = []) {
  const gallery = document.createElement('div');
  const galleryContent = document.createElement('div');
  const galleryTitle = document.createElement('span');
  const galleryCounter = document.createElement('span');
  const galleryPrev = document.createElement('button');
  const galleryNext = document.createElement('button');
  const thumbsContainer = document.createElement('div');
  thumbsContainer.innerHTML = '<div class="media-library-thumbs"><a></a><a></a><a></a></div>';
  return {
    state: {
      galleryItems: items,
      currentGalleryIndex: -1,
      currentSectionId: 'GN1',
      filters: { art: true, video: true }
    },
    refs: { gallery, galleryContent, galleryTitle, galleryCounter, galleryPrev, galleryNext, thumbsContainer },
    mediaLibraries: [],
    pendingSelect: null,
    contentToProcess: null,
    processContent: vi.fn(),
    findGalleryIndex: vi.fn(),
    setFilter: vi.fn(),
    showGalleryItem: vi.fn(() => Promise.resolve()),
    effectiveVideoLanguage: vi.fn(() => 'spa'),
    createElement: vi.fn(html => {
      const template = document.createElement('template');
      template.innerHTML = html;
      return template.content.firstChild;
    }),
    createVideoElement: vi.fn(() => document.createElement('video')),
    createImageElement: vi.fn(() => document.createElement('img')),
    createDbsVideoElement: vi.fn(() => document.createElement('video')),
    createMediaElement: vi.fn(),
    clearGalleryContent: vi.fn(function clear() { galleryContent.innerHTML = ''; }),
    buildItemTitle: vi.fn(item => item.title),
    updateGalleryUI: vi.fn()
  };
}

describe('MediaGallery', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('finds exact, color-base, verse fallback, and missing gallery items', () => {
    const component = makeComponent([
      { folder: 'art', filename: 'first', verseid: 'GN1_1' },
      { folder: 'maps', filename: 'second', verseid: 'GN1_2' }
    ]);
    expect(findGalleryIndex(component, { folder: 'maps', filename: 'second', verseid: 'x' })).toBe(1);
    expect(findGalleryIndex(component, { folder: 'art', filename: 'first-color-lg', verseid: 'x' })).toBe(0);
    expect(findGalleryIndex(component, { folder: 'none', filename: 'missing', verseid: 'GN1_2' })).toBe(1);
    expect(findGalleryIndex(component, { folder: 'none', filename: undefined, verseid: 'x' })).toBe(-1);
  });

  it('ignores an empty selection and queues one until libraries load', () => {
    const component = makeComponent();
    selectMediaItem(component, null);
    expect(component.pendingSelect).toBeNull();
    component.mediaLibraries = null;
    const select = { sectionid: 'GN1' };
    selectMediaItem(component, select);
    expect(component.pendingSelect).toBe(select);
  });

  it('switches to a loaded section before locating the selected item', async () => {
    const component = makeComponent();
    component.state.currentSectionId = 'GN1';
    component.findGalleryIndex.mockReturnValue(1);
    const section = document.createElement('div');
    section.className = 'section';
    section.dataset.id = 'EX1';
    document.body.appendChild(section);
    const selected = component.refs.thumbsContainer.querySelectorAll('a')[1];
    selected.classList.add('selected');
    selected.scrollIntoView = vi.fn();

    selectMediaItem(component, { sectionid: 'EX1' });
    await Promise.resolve();

    expect(component.contentToProcess).toBe(section);
    expect(component.processContent).toHaveBeenCalled();
    expect(component.showGalleryItem).toHaveBeenCalledWith(1);
    expect(selected.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('continues when a requested section is absent or already current', () => {
    const component = makeComponent();
    component.findGalleryIndex.mockReturnValue(0);
    selectMediaItem(component, { sectionid: 'EX1' });
    selectMediaItem(component, { sectionid: 'GN1' });
    expect(component.processContent).not.toHaveBeenCalled();
    expect(component.showGalleryItem).toHaveBeenCalledTimes(2);
  });

  it('reenables art for a filtered selection and gives up if it is still absent', () => {
    const component = makeComponent();
    component.state.filters.art = false;
    component.findGalleryIndex.mockReturnValueOnce(-1).mockReturnValueOnce(2);
    selectMediaItem(component, { sectionid: 'GN1' });
    expect(component.setFilter).toHaveBeenCalledWith('art', true);
    expect(component.showGalleryItem).toHaveBeenCalledWith(2);

    component.findGalleryIndex.mockReset().mockReturnValue(-1);
    component.showGalleryItem.mockClear();
    component.state.filters.art = true;
    selectMediaItem(component, { sectionid: 'GN1' });
    expect(component.setFilter).toHaveBeenCalledTimes(1);
    expect(component.showGalleryItem).not.toHaveBeenCalled();
  });

  it('creates videos with defaults, explicit options, and an alternate source', () => {
    const plain = createVideoElement('main.mp4');
    expect(plain.controls).toBe(true);
    expect(plain.autoplay).toBe(true);
    expect(plain.poster).toBe('');

    const video = createVideoElement('main.mp4', {
      autoplay: false, poster: 'poster.jpg', altSrc: 'fallback.mp4'
    });
    video.load = vi.fn();
    expect(video.autoplay).toBe(false);
    expect(video.poster).toContain('poster.jpg');
    video.dispatchEvent(new Event('error'));
    video.dispatchEvent(new Event('error'));
    expect(video.src).toContain('fallback.mp4');
    expect(video.load).toHaveBeenCalledOnce();
  });

  it('creates images with descriptive or empty alternative text', () => {
    expect(createImageElement('image.jpg', 'An image').alt).toBe('An image');
    expect(createImageElement('image.jpg').alt).toBe('');
  });

  it('loads a DBS video and records catalog title and fallback language', async () => {
    const component = makeComponent();
    const item = { org: 'org', chapterNumber: 2, thumbUrl: 'thumb.jpg' };
    fixtures.getDbsVideoChapter.mockResolvedValue({
      title: 'Chapter title', isFallback: true, languageName: 'French',
      url: 'main.mp4', urlAlt: 'alt.mp4', poster: ''
    });

    const result = await createDbsVideoElement(component, item);

    expect(component.refs.galleryContent.querySelector('.media-gallery-loading')).toBeTruthy();
    expect(fixtures.getDbsVideoChapter).toHaveBeenCalledWith('org', 'spa', 2);
    expect(item).toMatchObject({ title: 'Chapter title', spokenLanguage: 'French' });
    expect(component.createVideoElement).toHaveBeenCalledWith('main.mp4', {
      poster: 'thumb.jpg', altSrc: 'alt.mp4'
    });
    expect(result).toBeInstanceOf(HTMLVideoElement);
  });

  it('uses the catalog poster and clears fallback language when no fallback occurred', async () => {
    const component = makeComponent();
    const item = { org: 'org', chapterNumber: 1, title: 'Existing', thumbUrl: 'thumb.jpg' };
    fixtures.getDbsVideoChapter.mockResolvedValue({
      title: '', isFallback: false, languageName: 'English',
      url: 'main.mp4', poster: 'catalog.jpg'
    });
    await createDbsVideoElement(component, item);
    expect(item.title).toBe('Existing');
    expect(item.spokenLanguage).toBe('');
    expect(component.createVideoElement).toHaveBeenCalledWith('main.mp4', {
      poster: 'catalog.jpg', altSrc: undefined
    });
  });

  it('renders unavailable content when the DBS lookup fails or has no chapter', async () => {
    const component = makeComponent();
    fixtures.getDbsVideoChapter.mockRejectedValue(new Error('offline'));
    expect((await createDbsVideoElement(component, {})).classList).toContain('media-no-content');
    fixtures.getDbsVideoChapter.mockResolvedValue(null);
    expect((await createDbsVideoElement(component, {})).textContent).toBe('Video unavailable');
  });

  it('dispatches each supported media type and returns null for unknown items', async () => {
    const component = makeComponent();
    component.createImageElement.mockReturnValue('image');
    component.createVideoElement.mockReturnValue('video');
    component.createDbsVideoElement.mockReturnValue('dbs');
    expect(await createMediaElement(component, { type: 'image', url: 'i', title: 'Title' })).toBe('image');
    expect(await createMediaElement(component, { type: 'image', url: 'i', reference: 'Ref' })).toBe('image');
    expect(await createMediaElement(component, { type: 'video', url: 'v' })).toBe('video');
    expect(await createMediaElement(component, { type: 'dbsvideo' })).toBe('dbs');
    expect(await createMediaElement(component, { type: 'audio' })).toBeNull();
    expect(component.createImageElement).toHaveBeenNthCalledWith(1, 'i', 'Title');
    expect(component.createImageElement).toHaveBeenNthCalledWith(2, 'i', 'Ref');
  });

  it('builds titles from reference, artist, date, source, and spoken language', () => {
    expect(buildItemTitle({ reference: 'Genesis 1' })).toBe('Genesis 1');
    expect(buildItemTitle({ title: 'Creation', artist: 'Artist' })).toBe('Creation - Artist');
    expect(buildItemTitle({ title: 'Creation', artist: 'Artist', date: '1900' })).toBe('Creation - Artist (1900)');
    expect(buildItemTitle({ title: 'Creation', source: 'Museum', spokenLanguage: 'Spanish' }))
      .toBe('Creation - Museum (Spanish)');
    expect(buildItemTitle({ title: 'Creation', source: 'Creation' })).toBe('Creation');
  });

  it('updates gallery labels, boundaries, selection, and active state', () => {
    const component = makeComponent([{ title: 'one' }, { title: 'two' }, { title: 'three' }]);
    component.buildItemTitle.mockReturnValue('Item title');
    updateGalleryUi(component, component.state.galleryItems[1], 1);
    expect(component.refs.galleryTitle.textContent).toBe('Item title');
    expect(component.refs.galleryCounter.textContent).toBe('2 / 3');
    expect(component.refs.galleryPrev.disabled).toBe(false);
    expect(component.refs.galleryNext.disabled).toBe(false);
    expect(component.refs.gallery.classList).toContain('active');
    expect([...component.refs.thumbsContainer.querySelectorAll('a')].map(a => a.classList.contains('selected')))
      .toEqual([false, true, false]);
    updateGalleryUi(component, component.state.galleryItems[0], 0);
    expect(component.refs.galleryPrev.disabled).toBe(true);
    updateGalleryUi(component, component.state.galleryItems[2], 2);
    expect(component.refs.galleryNext.disabled).toBe(true);
  });

  it('ignores out-of-range gallery indexes', async () => {
    const component = makeComponent([{ id: 1 }]);
    await showGalleryItem(component, -1);
    await showGalleryItem(component, 1);
    expect(component.createMediaElement).not.toHaveBeenCalled();
  });

  it('pauses prior video, replaces content, and updates the gallery', async () => {
    const item = { id: 1 };
    const component = makeComponent([item]);
    const oldVideo = document.createElement('video');
    oldVideo.pause = vi.fn();
    component.refs.galleryContent.appendChild(oldVideo);
    const image = document.createElement('img');
    component.createMediaElement.mockResolvedValue(image);

    await showGalleryItem(component, 0);

    expect(oldVideo.pause).toHaveBeenCalled();
    expect(component.state.currentGalleryIndex).toBe(0);
    expect(component.clearGalleryContent).toHaveBeenCalled();
    expect(component.refs.galleryContent.firstChild).toBe(image);
    expect(component.updateGalleryUI).toHaveBeenCalledWith(item, 0);
  });

  it('does not replace a newer gallery request and tolerates empty media', async () => {
    const component = makeComponent([{ id: 1 }, { id: 2 }]);
    let resolveMedia;
    component.createMediaElement.mockReturnValue(new Promise(resolve => { resolveMedia = resolve; }));
    const pending = showGalleryItem(component, 0);
    component.state.currentGalleryIndex = 1;
    resolveMedia(document.createElement('img'));
    await pending;
    expect(component.clearGalleryContent).not.toHaveBeenCalled();

    component.createMediaElement.mockResolvedValue(null);
    await showGalleryItem(component, 1);
    expect(component.clearGalleryContent).toHaveBeenCalled();
    expect(component.refs.galleryContent.children).toHaveLength(0);
    expect(component.updateGalleryUI).toHaveBeenCalledWith(component.state.galleryItems[1], 1);
  });

  it('navigates only within gallery bounds', () => {
    const component = makeComponent([{}, {}, {}]);
    component.state.currentGalleryIndex = 1;
    navigateGallery(component, -1);
    navigateGallery(component, 1);
    expect(component.showGalleryItem).toHaveBeenNthCalledWith(1, 0);
    expect(component.showGalleryItem).toHaveBeenNthCalledWith(2, 2);
    component.showGalleryItem.mockClear();
    component.state.currentGalleryIndex = 0;
    navigateGallery(component, -1);
    component.state.currentGalleryIndex = 2;
    navigateGallery(component, 1);
    expect(component.showGalleryItem).not.toHaveBeenCalled();
  });
});

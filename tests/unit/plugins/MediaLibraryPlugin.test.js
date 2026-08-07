import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  enabled: true,
  primeCatalog: vi.fn(() => Promise.resolve()),
  popupInstances: [],
  contentInstances: [],
  Reference: vi.fn(id => ({ toString: () => `ref:${id}` }))
}));

vi.mock('@core/config.js', () => ({
  getConfig: () => ({ enableMediaLibraryPlugin: fixtures.enabled })
}));
vi.mock('@bible/BibleReference.js', () => ({ Reference: fixtures.Reference }));
vi.mock('@/media/DbsVideoApi.js', () => ({ primeDbsVideoCatalog: fixtures.primeCatalog }));
vi.mock('@plugins/MediaLibraryPopups.js', () => ({
  MediaLibraryPopups: function MediaLibraryPopups() {
    this.showImage = vi.fn(); this.showVideo = vi.fn(); this.showDbsVideo = vi.fn();
    fixtures.popupInstances.push(this);
  }
}));
vi.mock('@plugins/MediaLibraryContent.js', () => ({
  MediaLibraryContent: function MediaLibraryContent(getLibraries) {
    this.getLibraries = getLibraries; this.process = vi.fn(); this.enqueue = vi.fn();
    fixtures.contentInstances.push(this);
  }
}));

import { MediaLibraryPlugin } from '@plugins/MediaLibraryPlugin.js';

const libraries = [
  { folder: 'images', type: 'image', data: { GN1_1: [{ id: 1 }] } },
  { folder: 'videos', type: 'video', data: { GN1_1: [{ id: 2 }] } },
  { folder: 'dbs', type: 'dbsvideo', data: { GN1_1: [{ id: 3 }] } },
  { folder: 'empty', type: 'image', data: {} }
];

function mediaIcon(folder, { verseid = 'GN1_1', sectionid = 'GN1' } = {}) {
  const section = document.createElement('div');
  section.className = 'section';
  if (sectionid != null) section.dataset.id = sectionid;
  section.innerHTML = `<span class="verse" data-id="${verseid}">` +
    `<button class="mediathumb" data-mediafolder="${folder}"><i></i></button></span>`;
  document.querySelector('.windows-main').appendChild(section);
  return section.querySelector('i');
}

const textload = (content = 'section') =>
  ({ data: { messagetype: 'textload', type: 'bible', content } });

async function enableWithLibraries() {
  window.MediaLibrary = { getMediaLibraries: vi.fn(callback => callback(libraries)) };
  const extension = MediaLibraryPlugin();
  extension.trigger('message', textload());
  await Promise.resolve();
  await Promise.resolve();
  return extension;
}

describe('MediaLibraryPlugin', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="windows-main"></div>';
    vi.clearAllMocks();
    fixtures.popupInstances.length = 0;
    fixtures.contentInstances.length = 0;
    fixtures.enabled = true;
    fixtures.primeCatalog.mockResolvedValue();
    delete window.MediaLibrary;
  });

  it('returns an inert object while disabled', () => {
    fixtures.enabled = false;
    expect(MediaLibraryPlugin()).toEqual({});
    expect(fixtures.popupInstances).toHaveLength(0);
  });

  it('constructs safely when the host media API is absent', () => {
    const extension = MediaLibraryPlugin();
    expect(extension.on).toBeTypeOf('function');
    expect(fixtures.primeCatalog).not.toHaveBeenCalled();
  });

  it('loads libraries after priming and processes existing content', async () => {
    await enableWithLibraries();
    expect(fixtures.primeCatalog).toHaveBeenCalled();
    expect(window.MediaLibrary.getMediaLibraries).toHaveBeenCalled();
    expect(fixtures.contentInstances[0].getLibraries()).toBe(libraries);
    expect(fixtures.contentInstances[0].process).toHaveBeenCalled();
  });

  describe('catalog fetch is deferred to first text load', () => {
    it('fetches nothing at construction', () => {
      window.MediaLibrary = { getMediaLibraries: vi.fn() };
      MediaLibraryPlugin();
      expect(fixtures.primeCatalog).not.toHaveBeenCalled();
      expect(window.MediaLibrary.getMediaLibraries).not.toHaveBeenCalled();
    });

    it('fetches once on the first Bible text load, not again on later ones', async () => {
      const extension = await enableWithLibraries();
      extension.trigger('message', textload('another'));
      extension.trigger('message', textload('a third'));
      await Promise.resolve();
      expect(fixtures.primeCatalog).toHaveBeenCalledOnce();
      expect(window.MediaLibrary.getMediaLibraries).toHaveBeenCalledOnce();
    });

    it('does not fetch for non-Bible or non-textload messages', () => {
      window.MediaLibrary = { getMediaLibraries: vi.fn() };
      const extension = MediaLibraryPlugin();
      extension.trigger('message', { data: { messagetype: 'nav', type: 'bible', content: 'x' } });
      extension.trigger('message', { data: { messagetype: 'textload', type: 'book', content: 'x' } });
      expect(window.MediaLibrary.getMediaLibraries).not.toHaveBeenCalled();
    });

    it('retries on a later text load when the host media API was not ready', async () => {
      const extension = MediaLibraryPlugin();
      extension.trigger('message', textload());
      expect(fixtures.primeCatalog).not.toHaveBeenCalled();

      window.MediaLibrary = { getMediaLibraries: vi.fn(callback => callback(libraries)) };
      extension.trigger('message', textload());
      await Promise.resolve();
      await Promise.resolve();
      expect(window.MediaLibrary.getMediaLibraries).toHaveBeenCalledOnce();
      expect(fixtures.contentInstances[0].getLibraries()).toBe(libraries);
    });

    it('still loads non-DBS libraries when DBS catalog priming fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      fixtures.primeCatalog.mockRejectedValueOnce(new Error('offline'));
      window.MediaLibrary = { getMediaLibraries: vi.fn(callback => callback(libraries)) };
      const extension = MediaLibraryPlugin();
      extension.trigger('message', textload());
      await Promise.resolve();
      await Promise.resolve();
      expect(window.MediaLibrary.getMediaLibraries).toHaveBeenCalledOnce();
      expect(fixtures.contentInstances[0].process).toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('DBS video catalog unavailable:', 'offline');
    });
  });

  it.each([
    ['images', 'showImage'],
    ['videos', 'showVideo'],
    ['dbs', 'showDbsVideo']
  ])('routes %s thumbnails to the matching popup', async (folder, method) => {
    await enableWithLibraries();
    mediaIcon(folder).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fixtures.popupInstances[0][method]).toHaveBeenCalled();
  });

  it('ignores unregistered or empty media and unrelated clicks', async () => {
    await enableWithLibraries();
    mediaIcon('missing').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    mediaIcon('empty').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('.windows-main').click();
    const popups = fixtures.popupInstances[0];
    expect(popups.showImage).not.toHaveBeenCalled();
    expect(popups.showVideo).not.toHaveBeenCalled();
    expect(popups.showDbsVideo).not.toHaveBeenCalled();
  });

  it('derives missing section ids and tolerates a missing verse reference', async () => {
    fixtures.Reference.mockReturnValueOnce(null);
    await enableWithLibraries();
    mediaIcon('images', { sectionid: null }).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fixtures.popupInstances[0].showImage).toHaveBeenCalledWith(expect.objectContaining({
      verseid: 'GN1_1', sectionid: 'GN1', reference: 'GN1_1'
    }));
  });

  it('enqueues only Bible text-load messages', () => {
    const extension = MediaLibraryPlugin();
    extension.trigger('message', { data: { messagetype: 'nav', type: 'bible', content: 'no' } });
    extension.trigger('message', { data: { messagetype: 'textload', type: 'book', content: 'no' } });
    extension.trigger('message', { data: { messagetype: 'textload', type: 'bible', content: 'yes' } });
    expect(fixtures.contentInstances[0].enqueue).toHaveBeenCalledOnce();
    expect(fixtures.contentInstances[0].enqueue).toHaveBeenCalledWith('yes');
  });

  it('loads libraries safely without a windows container', async () => {
    document.body.innerHTML = '';
    await enableWithLibraries();
    expect(fixtures.contentInstances[0].process).toHaveBeenCalled();
  });
});

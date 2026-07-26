import { describe, it, expect, vi } from 'vitest';
import { pickSection, toContainer } from '@windows/MediaWindow.js';

/**
 * Builds a scroller-wrapper-like container holding one or more chapter sections,
 * mirroring the markup produced by the text providers
 * (`<div class="section chapter ... ${sectionid}" data-id="${sectionid}">`).
 */
function buildWrapper(sections) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sections
    .map(({ id, verses }) => {
      const verseHtml = verses
        .map((vid) => `<span class="v ${vid}" data-id="${vid}">${vid}</span>`)
        .join('');
      return `<div class="section chapter ${id}" data-id="${id}">${verseHtml}</div>`;
    })
    .join('');
  return wrapper;
}

describe('MediaWindow pickSection', () => {
  it('picks the section matching sectionid when several chapters are loaded', () => {
    // Regression: broadcastCurrentContent can ship the whole wrapper (Luke 14 + 15 + …).
    // Picking the first section showed Luke 14 media under a "Luke 15" title.
    const wrapper = buildWrapper([
      { id: 'LK14', verses: ['LK14_7', 'LK14_12', 'LK14_25'] },
      { id: 'LK15', verses: ['LK15_1', 'LK15_11'] },
      { id: 'LK16', verses: ['LK16_1'] },
    ]);

    const section = pickSection(wrapper, 'LK15');

    expect(section.getAttribute('data-id')).toBe('LK15');
    const verseIds = [...section.querySelectorAll('.v')].map((v) => v.getAttribute('data-id'));
    expect(verseIds).toEqual(['LK15_1', 'LK15_11']);
  });

  it('returns the lone section when only one chapter is loaded', () => {
    const wrapper = buildWrapper([{ id: 'LK15', verses: ['LK15_1'] }]);
    expect(pickSection(wrapper, 'LK15').getAttribute('data-id')).toBe('LK15');
  });

  it('falls back to the first section when sectionid is not present', () => {
    const wrapper = buildWrapper([
      { id: 'LK14', verses: ['LK14_7'] },
      { id: 'LK16', verses: ['LK16_1'] },
    ]);
    expect(pickSection(wrapper, 'LK15').getAttribute('data-id')).toBe('LK14');
  });

  it('falls back to the container when there are no sections', () => {
    const wrapper = document.createElement('div');
    expect(pickSection(wrapper, 'LK15')).toBe(wrapper);
  });
});

describe('MediaWindow toContainer', () => {
  it('parses an HTML string', () => {
    const container = toContainer('<div class="section" data-id="LK15"><span class="v" data-id="LK15_1"></span></div>');
    expect(container.querySelectorAll('.v')).toHaveLength(1);
  });

  it('passes a live element through', () => {
    // Regression: text providers hand back the inserted element rather than a
    // string, and `innerHTML = element` stringified it to "[object HTMLDivElement]",
    // leaving the window with no verses and so no media.
    const section = document.createElement('div');
    section.className = 'section';
    section.setAttribute('data-id', 'LK15');
    section.innerHTML = '<span class="v" data-id="LK15_1"></span>';

    expect(toContainer(section)).toBe(section);
    expect(toContainer(section).querySelectorAll('.v')).toHaveLength(1);
  });

  it('yields an empty container for junk', () => {
    expect(toContainer(undefined).children).toHaveLength(0);
    expect(toContainer({}).children).toHaveLength(0);
  });
});

/**
 * Unconnected media-window element with processContent stubbed: handleMessage
 * only decides *which* content to adopt, and processContent needs refs that
 * render() would have created.
 */
function buildMessageWindow(currentSectionId = '') {
  const win = document.createElement('media-window');
  win.state.currentSectionId = currentSectionId;
  win.processContent = vi.fn();
  return win;
}

const section = (id) => {
  const el = document.createElement('div');
  el.className = `section ${id}`;
  el.setAttribute('data-id', id);
  el.innerHTML = `<span class="v ${id}_1" data-id="${id}_1"></span>`;
  return el;
};

const textload = (sectionid, content) => ({ data: { messagetype: 'textload', sectionid, content } });
const nav = (sectionid) => ({ data: { messagetype: 'nav', type: 'bible', locationInfo: { sectionid } } });

describe('MediaWindow handleMessage', () => {
  it('fills an empty window from a textload', () => {
    const win = buildMessageWindow();
    const el = section('LK2');

    win.handleMessage(textload('LK2', el));

    expect(win.contentToProcess).toBe(el);
    expect(win.processContent).toHaveBeenCalled();
  });

  it('ignores a preloaded neighbouring chapter', () => {
    // Scrollers broadcast textload for the chapters they preload either side of
    // the reader; adopting those walked the window off the chapter being read.
    const win = buildMessageWindow('LK2');

    win.handleMessage(textload('LK1', section('LK1')));

    expect(win.processContent).not.toHaveBeenCalled();
    expect(win.contentToProcess).toBeNull();
  });

  it('refreshes the chapter already shown', () => {
    const win = buildMessageWindow('LK2');
    const el = section('LK2');

    win.handleMessage(textload('LK2', el));

    expect(win.contentToProcess).toBe(el);
  });

  it('follows a nav to a chapter that has not loaded yet', () => {
    // An explicit navigation is announced before the chapter is in the DOM, so
    // the nav alone finds nothing and the matching textload finishes the move.
    const win = buildMessageWindow('LK2');

    win.handleMessage(nav('LK5'));
    expect(win.processContent).not.toHaveBeenCalled();

    const el = section('LK5');
    win.handleMessage(textload('LK5', el));

    expect(win.contentToProcess).toBe(el);
    expect(win.state.pendingSectionId).toBe('');
  });

  it('takes a nav straight from the DOM when the chapter is loaded', () => {
    const win = buildMessageWindow('LK2');
    const el = section('LK5');
    document.body.appendChild(el);

    win.handleMessage(nav('LK5'));

    expect(win.contentToProcess).toBe(el);
    el.remove();
  });

  it('labels a parsed container with the section id, but never relabels a live section', () => {
    const win = buildMessageWindow();
    win.handleMessage(textload('LK2', '<span class="v LK2_1" data-id="LK2_1"></span>'));
    expect(win.contentToProcess.getAttribute('data-id')).toBe('LK2');

    const win2 = buildMessageWindow();
    const el = section('LK2');
    el.innerHTML = `<div class="section" data-id="LK1"></div>${el.innerHTML}`;
    win2.handleMessage(textload('LK2', el));
    expect(win2.contentToProcess.getAttribute('data-id')).toBe('LK1');
  });
});

/**
 * Unconnected media-window element: the constructor runs (state, refs), but
 * render/init never do, so tests drive selectMediaItem/findGalleryIndex
 * directly with stubbed collaborators.
 */
function buildWindow({ items = [], filters, sectionid = 'GN12' } = {}) {
  const win = document.createElement('media-window');
  win.mediaLibraries = [];
  win.state.currentSectionId = sectionid;
  if (filters) win.state.filters = filters;
  win.state.galleryItems = items;
  win.showGalleryItem = vi.fn(() => Promise.resolve());
  return win;
}

const item = (folder, filename, verseid) => ({ folder, filename, verseid });

describe('MediaWindow findGalleryIndex', () => {
  const items = [
    item('art', 'abraham-journey', 'GN12_1'),
    item('art', 'lot-parts', 'GN13_11'),
    item('maps', 'abraham-journey', 'GN12_4')
  ];

  it('matches exact folder + filename', () => {
    const win = buildWindow({ items });
    expect(win.findGalleryIndex({ folder: 'maps', filename: 'abraham-journey', verseid: 'GN12_4' })).toBe(2);
  });

  it('falls back to the base file for a -color variant', () => {
    // The gallery skips '-color' files but the popup lists them
    const win = buildWindow({ items });
    expect(win.findGalleryIndex({ folder: 'art', filename: 'abraham-journey-color', verseid: 'GN12_1' })).toBe(0);
  });

  it('falls back to any item on the same verse', () => {
    const win = buildWindow({ items });
    expect(win.findGalleryIndex({ folder: 'art', filename: 'not-in-gallery', verseid: 'GN13_11' })).toBe(1);
  });

  it('returns -1 when nothing matches', () => {
    const win = buildWindow({ items });
    expect(win.findGalleryIndex({ folder: 'art', filename: 'nope', verseid: 'GN99_1' })).toBe(-1);
  });
});

/**
 * Rendered but unconnected media window: render()/cacheRefs() give the picker
 * its markup and refs, while init() (which needs the media libraries and the
 * video catalog) is left out.
 */
async function buildPickerWindow(videoLanguages = []) {
  const win = document.createElement('media-window');
  await win.render();
  win.cacheRefs();
  win.state.videoLanguages = videoLanguages;
  return win;
}

const language = (iso, name, titles = 1) => ({ iso, name, titles });

describe('MediaWindow video language picker', () => {
  const languages = [
    language('eng', 'English', 3),
    language('spa', 'Spanish', 2),
    language('tac', 'Tarahumara Baja')
  ];

  it('resolves videos in the text language until one is picked', () => {
    const win = document.createElement('media-window');
    win.state.currentLanguage = 'fra';
    expect(win.effectiveVideoLanguage()).toBe('fra');

    win.state.videoLanguage = 'spa';
    expect(win.effectiveVideoLanguage()).toBe('spa');
  });

  it('lists every language, with Auto first', async () => {
    const win = await buildPickerWindow(languages);

    win.renderLanguageOptions();

    const options = [...win.refs.languageOptions.querySelectorAll('.media-language-option')];
    expect(options.map((option) => option.dataset.iso)).toEqual(['', 'eng', 'spa', 'tac']);
    // The count tells apart a language with one of the chapter's videos from
    // one with all of them
    expect(options[1].querySelector('.media-language-count').textContent).toBe('3');
    expect(options[3].querySelector('.media-language-count')).toBeNull();
  });

  it('filters by name or code, and drops Auto while filtering', async () => {
    const win = await buildPickerWindow(languages);

    win.renderLanguageOptions('span');
    expect([...win.refs.languageOptions.querySelectorAll('.media-language-option')]
      .map((option) => option.dataset.iso)).toEqual(['spa']);

    win.renderLanguageOptions('ta');
    expect([...win.refs.languageOptions.querySelectorAll('.media-language-option')]
      .map((option) => option.dataset.iso)).toEqual(['tac']);
  });

  it('puts the language named for the query above the ones that merely contain it', async () => {
    const win = await buildPickerWindow([
      language('mix', 'Coatzospan Mixtec'),
      language('spa', 'Spanish'),
      language('usp', 'Uspanteco')
    ]);

    win.renderLanguageOptions('span');

    expect([...win.refs.languageOptions.querySelectorAll('.media-language-option')]
      .map((option) => option.dataset.iso)).toEqual(['spa', 'mix', 'usp']);
  });

  it('says so when nothing matches', async () => {
    const win = await buildPickerWindow(languages);

    win.renderLanguageOptions('klingon');

    expect(win.refs.languageOptions.querySelectorAll('.media-language-option')).toHaveLength(0);
    expect(win.refs.languageOptions.querySelector('.media-language-empty')).not.toBeNull();
  });

  it('marks the picked language and names it on the button', async () => {
    const win = await buildPickerWindow(languages);
    win.state.videoLanguage = 'spa';

    win.renderLanguageOptions();
    win.updateLanguageLabel();

    expect(win.refs.languageOptions.querySelector('[aria-selected="true"]').dataset.iso).toBe('spa');
    expect(win.refs.languageLabel.textContent).toBe('Spanish');
  });

  it('re-renders the chapter and persists the choice when a language is picked', async () => {
    const win = await buildPickerWindow(languages);
    win.processContent = vi.fn();
    const saved = vi.fn();
    win.on('settingschange', saved);

    win.setVideoLanguage('spa');

    expect(win.state.videoLanguage).toBe('spa');
    expect(win.processContent).toHaveBeenCalled();
    expect(saved).toHaveBeenCalled();
    expect(win.getData().params.videoLanguage).toBe('spa');
  });

  it('reopens whatever was playing in the newly picked language', async () => {
    // Switching language rebuilds the thumbs, and the open video has to come
    // back rather than dropping the reader out of the gallery.
    const win = await buildPickerWindow(languages);
    win.state.galleryItems = [item('dbsvideo', 'Jesus-02', 'LK2_1')];
    win.state.currentGalleryIndex = 0;
    win.showGalleryItem = vi.fn(() => Promise.resolve());
    win.processContent = vi.fn(() => {
      win.state.galleryItems = [item('dbsvideo', 'Jesus-02', 'LK2_1')];
    });

    win.setVideoLanguage('spa');

    expect(win.showGalleryItem).toHaveBeenCalledWith(0);
  });

  it('keeps Auto out of the persisted window data', async () => {
    const win = await buildPickerWindow(languages);
    win.processContent = vi.fn();

    win.setVideoLanguage('spa');
    win.setVideoLanguage('');

    expect(win.getData()).toEqual({ params: { win: 'media' } });
    expect(win.refs.languageLabel.textContent).toBe('windows.media.videolanguageauto');
  });

  it('hides the picker on a chapter whose videos it cannot offer', async () => {
    // No catalog in the test environment, so no languages: an art-only chapter
    // must not leave an empty dropdown in the header.
    const win = await buildPickerWindow(languages);

    win.updateLanguageMenu();

    expect(win.state.videoLanguages).toEqual([]);
    expect(win.refs.language.classList.contains('hidden')).toBe(true);
  });
});

describe('MediaWindow selectMediaItem', () => {
  const select = { sectionid: 'GN12', verseid: 'GN12_1', folder: 'art', filename: 'abraham-journey' };

  it('stashes the request until the media libraries load', () => {
    const win = buildWindow();
    win.mediaLibraries = null;

    win.selectMediaItem(select);

    expect(win.pendingSelect).toBe(select);
    expect(win.showGalleryItem).not.toHaveBeenCalled();
  });

  it('shows the matching gallery item', () => {
    const win = buildWindow({ items: [item('art', 'abraham-journey', 'GN12_1')] });

    win.selectMediaItem(select);

    expect(win.showGalleryItem).toHaveBeenCalledWith(0);
  });

  it('switches to the requested section before matching', () => {
    const win = buildWindow({ items: [], sectionid: 'GN11' });
    const section = document.createElement('div');
    section.className = 'section';
    section.setAttribute('data-id', 'GN12');
    document.body.appendChild(section);
    win.processContent = vi.fn(() => {
      win.state.galleryItems = [item('art', 'abraham-journey', 'GN12_1')];
    });

    win.selectMediaItem(select);

    expect(win.contentToProcess).toBe(section);
    expect(win.processContent).toHaveBeenCalled();
    expect(win.showGalleryItem).toHaveBeenCalledWith(0);
    section.remove();
  });

  it('re-enables the art filter and retries when the item is filtered out', () => {
    const win = buildWindow({ items: [], filters: { art: false, video: true } });
    win.setFilter = vi.fn((type, enabled) => {
      win.state.filters[type] = enabled;
      // simulates the re-render that setFilter triggers
      win.state.galleryItems = [item('art', 'abraham-journey', 'GN12_1')];
    });

    win.selectMediaItem(select);

    expect(win.setFilter).toHaveBeenCalledWith('art', true);
    expect(win.showGalleryItem).toHaveBeenCalledWith(0);
  });

  it('gives up gracefully when nothing matches', () => {
    const win = buildWindow({ items: [item('art', 'other-image', 'GN12_9')] });

    win.selectMediaItem(select);

    expect(win.showGalleryItem).not.toHaveBeenCalled();
  });
});

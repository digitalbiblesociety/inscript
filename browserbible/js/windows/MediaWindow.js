import { BaseWindow, registerWindowComponent } from './BaseWindow.js';
import { Reference } from '../bible/BibleReference.js';
import { i18n } from '../lib/i18n.js';
import {
  getDbsVideoChapter,
  getDbsVideoLanguageName,
  getDbsVideoLanguages,
  hasDbsVideoEdition,
  primeDbsVideoCatalog
} from '../media/DbsVideoApi.js';

const DEFAULT_LANGUAGE = 'eng';
const RESIZE_DEBOUNCE_MS = 100;
const TARGET_ROW_HEIGHT = 80;
const TARGET_GUTTER_WIDTH = 4;

/**
 * From a container that may hold several loaded `.section` elements, pick the one
 * matching sectionid. broadcastCurrentContent can ship the whole scroller wrapper
 * (multiple chapters); picking the first section instead of the matching one made
 * the title and the rendered verses disagree by a chapter. Falls back to the first
 * section, then the container itself.
 */
export function pickSection(containerEl, sectionid) {
  return containerEl.querySelector(`.section[data-id="${sectionid}"]`)
    || containerEl.querySelector('.section')
    || containerEl;
}

/**
 * A textload message's content is either an HTML string or the live element the
 * scroller inserted, depending on the text provider. Assuming a string turned
 * the element into "[object HTMLDivElement]", i.e. a container with no verses,
 * so local content produced an empty media window.
 */
export function toContainer(content) {
  if (content?.nodeType) return content;

  const temp = document.createElement('div');
  temp.innerHTML = typeof content === 'string' ? content : '';
  return temp;
}

class MediaWindowComponent extends BaseWindow {
  constructor() {
    super();

    this.state = {
      ...this.state,
      currentSectionId: '',
      pendingSectionId: '',
      currentLanguage: DEFAULT_LANGUAGE,
      // Video language the reader picked; '' follows the Bible text's language
      videoLanguage: '',
      // languages this chapter's videos come in, for the picker
      videoLanguages: [],
      filters: {
        art: true,
        video: true
      },
      galleryItems: [],
      currentGalleryIndex: -1
    };

    this.mediaLibraries = null;
    this.contentToProcess = null;
    this.pendingSelect = null;
    // Video titles mapped to the current chapter, before any language filtering,
    // so the picker offers the same languages whichever one is selected.
    this.chapterVideoOrgs = new Set();

    this._resizeTimeout = null;
    this._resizeHandler = null;
  }

  async render() {
    this.innerHTML = `
      <div class="window-header">
        <div class="media-filters">
          <button class="media-filter-btn active" data-filter="art" title="Art &amp; Images">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </button>
          <button class="media-filter-btn active" data-filter="video" title="Videos">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </button>
        </div>
        <div class="media-language hidden">
          <button type="button" class="app-list media-language-btn" aria-haspopup="listbox"
            aria-expanded="false" data-i18n="[title]windows.media.videolanguage">
            <svg class="media-language-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"></path>
            </svg>
            <span class="media-language-label"></span>
          </button>
          <div class="media-language-menu" role="listbox" data-i18n="[aria-label]windows.media.videolanguage">
            <input type="search" class="app-input media-language-filter" autocomplete="off"
              data-i18n="[placeholder]windows.media.videolanguagefilter" />
            <div class="media-language-options"></div>
          </div>
        </div>
      </div>
      <div class="window-main">
        <div class="media-gallery">
          <div class="media-gallery-viewer">
            <div class="media-gallery-content"></div>
          </div>
          <div class="media-gallery-controls">
            <button class="media-gallery-prev" title="Previous">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <div class="media-gallery-info">
              <span class="media-gallery-title"></span>
              <span class="media-gallery-counter"></span>
            </div>
            <button class="media-gallery-next" title="Next">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>
        </div>
        <div class="media-thumbs-container">
          <div class="media-video"></div>
          <div class="media-content"></div>
        </div>
      </div>
    `;
  }

  cacheRefs() {
    super.cacheRefs();

    this.refs.header = this.$('.window-header');
    this.refs.language = this.$('.media-language');
    this.refs.languageBtn = this.$('.media-language-btn');
    this.refs.languageLabel = this.$('.media-language-label');
    this.refs.languageMenu = this.$('.media-language-menu');
    this.refs.languageFilter = this.$('.media-language-filter');
    this.refs.languageOptions = this.$('.media-language-options');
    this.refs.main = this.$('.window-main');
    this.refs.gallery = this.$('.media-gallery');
    this.refs.galleryContent = this.$('.media-gallery-content');
    this.refs.galleryTitle = this.$('.media-gallery-title');
    this.refs.galleryCounter = this.$('.media-gallery-counter');
    this.refs.galleryPrev = this.$('.media-gallery-prev');
    this.refs.galleryNext = this.$('.media-gallery-next');
    this.refs.thumbsContainer = this.$('.media-thumbs-container');
  }

  attachEventListeners() {
    this.$$('.media-filter-btn').forEach(btn => {
      this.addListener(btn, 'click', () => {
        const filterType = btn.getAttribute('data-filter');
        this.setFilter(filterType, !this.state.filters[filterType]);
      });
    });

    this.addListener(this.refs.languageBtn, 'click', () => this.toggleLanguageMenu());
    this.addListener(this.refs.languageFilter, 'input', () => {
      this.renderLanguageOptions(this.refs.languageFilter.value);
    });
    this.addListener(this.refs.languageFilter, 'keydown', (e) => {
      // Type enough of a language to bring it to the top, then Enter
      if (e.key !== 'Enter') return;
      const first = this.refs.languageOptions.querySelector('.media-language-option');
      if (first) this.setVideoLanguage(first.dataset.iso);
    });
    this.addListener(this.refs.languageMenu, 'click', (e) => {
      const option = e.target.closest('.media-language-option');
      if (option) this.setVideoLanguage(option.dataset.iso);
    });
    this.addListener(document, 'click', (e) => {
      if (!this.refs.languageMenu.classList.contains('open')) return;
      if (e.target.closest('.media-language')) return;
      this.toggleLanguageMenu(false);
    });
    this.addListener(this.refs.header, 'keydown', (e) => {
      if (e.key === 'Escape' && this.refs.languageMenu.classList.contains('open')) {
        e.preventDefault();
        this.toggleLanguageMenu(false);
        this.refs.languageBtn.focus();
      }
    });

    this.addListener(this.refs.galleryPrev, 'click', () => this.navigateGallery(-1));
    this.addListener(this.refs.galleryNext, 'click', () => this.navigateGallery(1));

    this.addListener(this.refs.main, 'keydown', (e) => {
      if (!this.refs.gallery.classList.contains('active')) return;
      if (e.key === 'ArrowLeft') this.navigateGallery(-1);
      else if (e.key === 'ArrowRight') this.navigateGallery(1);
      else if (e.key === 'Escape') this.refs.gallery.classList.remove('active');
    });

    this.addListener(this.refs.galleryContent, 'click', (e) => {
      if (e.target.tagName === 'IMG') {
        this.refs.gallery.classList.remove('active');
      }
    });

    this._resizeHandler = () => {
      if (this._resizeTimeout !== null) {
        clearTimeout(this._resizeTimeout);
      }
      this._resizeTimeout = setTimeout(() => {
        requestAnimationFrame(() => this.startResize());
      }, RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', this._resizeHandler, { passive: true });

    this.on('message', (e) => this.handleMessage(e));
  }

  async init() {
    i18n.translatePage(this.refs.header);

    const savedLanguage = this.getParam('videoLanguage');
    if (savedLanguage) this.state.videoLanguage = String(savedLanguage).toLowerCase();
    this.updateLanguageLabel();

    // Thumbs are rendered synchronously and need to know which video titles the
    // reader's language actually has; nothing renders before the libraries
    // resolve below, so awaiting the catalog here keeps that check accurate.
    await primeDbsVideoCatalog();

    const MediaLibrary = window.MediaLibrary;
    if (MediaLibrary) {
      MediaLibrary.getMediaLibraries((data) => {
        this.mediaLibraries = data;

        // A focus request that arrived before the libraries loaded, or came
        // in as init data on a freshly opened window
        const select = this.pendingSelect ?? this.initData?.select;
        this.pendingSelect = null;
        if (select?.sectionid && document.querySelector(`.section[data-id="${select.sectionid}"]`)) {
          this.selectMediaItem(select);
          return;
        }

        if (this.contentToProcess) {
          this.processContent();
        } else {
          this.requestCurrentContent();
        }
      });
    }
  }

  setFilter(filterType, enabled) {
    this.state.filters[filterType] = enabled;
    this.$(`.media-filter-btn[data-filter="${filterType}"]`)?.classList.toggle('active', enabled);
    this.state.currentSectionId = ''; // force re-render of thumbs
    this.processContent();
  }

  /**
   * Language to resolve videos in: the reader's own choice, else the language of
   * the Bible text being read.
   */
  effectiveVideoLanguage() {
    return this.state.videoLanguage || this.state.currentLanguage;
  }

  /**
   * Rebuild the picker from the video titles on this chapter. Hidden when the
   * chapter has no video at all (most of the Bible) or videos are filtered out,
   * so the header stays as it was for art-only chapters.
   */
  updateLanguageMenu() {
    const languages = getDbsVideoLanguages([...this.chapterVideoOrgs], i18n.lng());
    this.state.videoLanguages = languages;

    this.refs.language.classList.toggle('hidden', languages.length === 0);
    if (languages.length === 0) {
      this.toggleLanguageMenu(false);
      return;
    }

    this.renderLanguageOptions(this.refs.languageFilter.value);
    this.updateLanguageLabel();
  }

  /**
   * Languages matching a query, the ones named for it first: typing "span"
   * should not bury Spanish under Coatzospan Mixtec and Uspanteco. Both groups
   * keep the alphabetical order they came in.
   * `search` arrives lowercased and trimmed.
   */
  rankLanguages(search) {
    const named = [];
    const mentioned = [];

    for (const language of this.state.videoLanguages) {
      const name = language.name.toLowerCase();
      if (name.startsWith(search) || language.iso.startsWith(search)) named.push(language);
      else if (name.includes(search)) mentioned.push(language);
    }
    return [...named, ...mentioned];
  }

  /**
   * @param {string} [query] - part of a language name, or a code prefix
   */
  renderLanguageOptions(query = '') {
    const search = query.trim().toLowerCase();
    const matches = search ? this.rankLanguages(search) : this.state.videoLanguages;

    // 'Auto' is the default rather than a language, so it stays at the top and
    // out of the filtered results.
    const auto = search ? '' : this.renderLanguageOption({
      iso: '',
      name: i18n.t('windows.media.videolanguageauto'),
      titles: 0
    });
    const options = matches.map((language) => this.renderLanguageOption(language)).join('');

    this.refs.languageOptions.innerHTML = auto + options ||
      `<div class="media-language-empty">${this.escapeHtml(i18n.t('windows.media.videolanguagenone'))}</div>`;
  }

  renderLanguageOption({ iso, name, titles }) {
    const selected = iso === this.state.videoLanguage;
    const count = titles > 1 ? `<span class="media-language-count">${titles}</span>` : '';
    return `<button type="button" class="media-language-option" role="option"
      aria-selected="${selected}" data-iso="${this.escapeHtml(iso)}">
      <span class="media-language-name">${this.escapeHtml(name)}</span>${count}
    </button>`;
  }

  /** The button shows what videos will play in. */
  updateLanguageLabel() {
    const iso = this.state.videoLanguage;
    this.refs.languageLabel.textContent = iso
      // A restored or off-chapter selection is not in this chapter's list
      ? (this.state.videoLanguages.find((language) => language.iso === iso)?.name
        ?? getDbsVideoLanguageName(iso, i18n.lng()))
      : i18n.t('windows.media.videolanguageauto');
  }

  toggleLanguageMenu(open) {
    const show = open ?? !this.refs.languageMenu.classList.contains('open');
    this.refs.languageMenu.classList.toggle('open', show);
    this.refs.languageBtn.setAttribute('aria-expanded', String(show));

    if (!show) return;
    // Every open starts from the full list, and typing filters it
    this.refs.languageFilter.value = '';
    this.renderLanguageOptions();
    this.refs.languageFilter.focus();
  }

  /**
   * @param {string} iso - ISO 639-3 code, or '' to follow the Bible text
   */
  setVideoLanguage(iso) {
    this.toggleLanguageMenu(false);
    if (iso === this.state.videoLanguage) return;

    this.state.videoLanguage = iso;
    this.reloadForLanguage();
    this.trigger('settingschange', { type: 'settingschange', target: this, data: null });
  }

  /**
   * Re-render the chapter's thumbs in the new language, reopening whatever was
   * playing if that title has an edition in it.
   */
  reloadForLanguage() {
    const current = this.state.galleryItems[this.state.currentGalleryIndex] ?? null;

    this.state.currentSectionId = ''; // force re-render of thumbs
    this.processContent();
    this.updateLanguageLabel(); // no content to process yet, e.g. a fresh window

    if (!current) return;
    const index = this.findGalleryIndex(current);
    if (index >= 0) this.showGalleryItem(index);
  }

  /**
   * Open the gallery on a specific item, e.g. from the media popup.
   * Safe at any lifecycle point: before the libraries load the request is
   * stashed and init() replays it.
   * @param {{sectionid: string, verseid: string, folder: string, filename: string}} select
   */
  selectMediaItem(select) {
    if (!select) return;

    if (!this.mediaLibraries) {
      this.pendingSelect = select;
      return;
    }

    if (this.state.currentSectionId !== select.sectionid) {
      const section = document.querySelector(`.section[data-id="${select.sectionid}"]`);
      if (section) {
        this.contentToProcess = section;
        this.processContent();
      }
    }

    let index = this.findGalleryIndex(select);
    if (index < 0 && !this.state.filters.art) {
      this.setFilter('art', true); // the popup only lists art images
      index = this.findGalleryIndex(select);
    }
    if (index < 0) return; // no match; the rendered thumbs are still useful

    this.showGalleryItem(index).then(() => {
      this.refs.thumbsContainer?.querySelector('.media-library-thumbs a.selected')
        ?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  /**
   * Gallery index for a popup selection: exact folder+filename, then the
   * base file of a `-color` variant (the gallery skips those but the popup
   * shows them), then anything on the same verse.
   * @returns {number} index into state.galleryItems, or -1
   */
  findGalleryIndex({ folder, filename, verseid }) {
    const items = this.state.galleryItems;
    let index = items.findIndex(item => item.folder === folder && item.filename === filename);

    const base = filename?.replace(/-color.*$/, '');
    if (index < 0 && base !== filename) {
      index = items.findIndex(item => item.folder === folder && item.filename === base);
    }
    if (index < 0) {
      index = items.findIndex(item => item.verseid === verseid);
    }
    return index;
  }

  cleanup() {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
    }
    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
    }

    super.cleanup();
  }

  handleMessage(e) {
    const { data } = e;
    let content = null;

    if (data.messagetype === 'nav' && data.type === 'bible' && data.locationInfo) {
      // An explicit navigation is announced before the chapter has loaded, so
      // the section is often not in the DOM yet; remember the target so the
      // textload that follows completes the move.
      this.state.pendingSectionId = data.locationInfo.sectionid;
      content = document.querySelector(`.section[data-id="${data.locationInfo.sectionid}"]`);
    } else if (data.messagetype === 'textload' && data.sectionid && data.content) {
      // A scroller broadcasts textload for the neighbouring chapters it
      // preloads too, which is not where the reader is; following those walked
      // the window off the chapter being read. Take a textload only for the
      // chapter navigated to, the one already shown, or to fill an empty window
      // (the reply to requestCurrentContent).
      const wanted = this.state.pendingSectionId || this.state.currentSectionId;
      if (wanted && wanted !== data.sectionid) return;

      const container = toContainer(data.content);
      content = pickSection(container, data.sectionid);
      // Only label a container we built ourselves; the message may carry the
      // live section element, whose own data-id is authoritative.
      if (!content.getAttribute('data-id')) content.setAttribute('data-id', data.sectionid);
    }

    if (content) {
      this.state.pendingSectionId = '';
      this.contentToProcess = content;
      this.processContent();
    }
  }

  requestCurrentContent() {
    this.trigger('globalmessage', {
      type: 'globalmessage',
      target: this,
      data: {
        messagetype: 'maprequest',
        requesttype: 'currentcontent'
      }
    });
  }

  async showGalleryItem(index) {
    if (index < 0 || index >= this.state.galleryItems.length) return;
    this.state.currentGalleryIndex = index;
    const item = this.state.galleryItems[index];
    const oldVideo = this.refs.galleryContent.querySelector('video');
    if (oldVideo) oldVideo.pause();

    const mediaEl = await this.createMediaElement(item);
    if (this.state.currentGalleryIndex !== index) return;

    this.clearGalleryContent();
    if (mediaEl) {
      this.refs.galleryContent.appendChild(mediaEl);
    }

    this.updateGalleryUI(item, index);
  }

  clearGalleryContent() {
    this.refs.galleryContent.innerHTML = '';
  }

  createVideoElement(src, options = {}) {
    const video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.autoplay = options.autoplay ?? true;
    if (options.poster) video.poster = options.poster;
    // DBS publishes each video at two qualities; if the preferred copy is
    // missing or broken, retry the other once before giving up.
    if (options.altSrc) {
      video.addEventListener('error', () => {
        video.src = options.altSrc;
        video.load();
      }, { once: true });
    }
    return video;
  }

  createImageElement(src, alt) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt || '';
    return img;
  }

  async createMediaElement(item) {
    if (item.type === 'image') {
      return this.createImageElement(item.url, item.title || item.reference);
    }

    if (item.type === 'video') {
      return this.createVideoElement(item.url);
    }

    if (item.type === 'dbsvideo') {
      return this.createDbsVideoElement(item);
    }

    return null;
  }

  async createDbsVideoElement(item) {
    this.refs.galleryContent.innerHTML = '<div class="media-gallery-loading">Loading video...</div>';

    let chapter = null;
    try {
      chapter = await getDbsVideoChapter(item.org, this.effectiveVideoLanguage(), item.chapterNumber);
    } catch { /* empty */ }

    if (!chapter) {
      // item.url is the chapter cover image, not a video, so there is nothing
      // to fall back to.
      return this.createElement('<div class="media-no-content">Video unavailable</div>');
    }

    if (chapter.title) item.title = chapter.title;
    // A title with no edition in the wanted language plays in English instead;
    // say so rather than leave the reader wondering.
    item.spokenLanguage = chapter.isFallback ? chapter.languageName : '';
    return this.createVideoElement(chapter.url, {
      poster: chapter.poster || item.thumbUrl || '',
      altSrc: chapter.urlAlt
    });
  }

  buildItemTitle(item) {
    let title = item.title || item.reference;
    if (item.artist) {
      title += ` - ${item.artist}`;
      if (item.date) {
        title += ` (${item.date})`;
      }
    }
    // Several titles cover the same verse (LUMO Matthew and the Visual Bible
    // both open on Matthew 1), so name the production they come from.
    if (item.source && item.source !== title) {
      title += ` - ${item.source}`;
    }
    if (item.spokenLanguage) {
      title += ` (${item.spokenLanguage})`;
    }
    return title;
  }

  updateGalleryUI(item, index) {
    this.refs.galleryTitle.textContent = this.buildItemTitle(item);
    this.refs.galleryCounter.textContent = `${index + 1} / ${this.state.galleryItems.length}`;

    this.refs.galleryPrev.disabled = index === 0;
    this.refs.galleryNext.disabled = index === this.state.galleryItems.length - 1;

    this.refs.gallery.classList.add('active');

    this.refs.thumbsContainer.querySelectorAll('.media-library-thumbs a').forEach((a, i) => {
      a.classList.toggle('selected', i === index);
    });
  }

  navigateGallery(delta) {
    const newIndex = this.state.currentGalleryIndex + delta;
    if (newIndex >= 0 && newIndex < this.state.galleryItems.length) {
      this.showGalleryItem(newIndex);
    }
  }

  processContent() {
    if (!this.mediaLibraries || !this.contentToProcess) return;

    const contentEl = this.contentToProcess;
    const sectionid = contentEl.getAttribute('data-id');

    if (this.state.currentSectionId === sectionid) return;

    this.state.currentSectionId = sectionid;
    this.state.currentLanguage = this.extractContentLanguage(contentEl);

    const bibleReference = new Reference(sectionid);
    bibleReference.language = contentEl.getAttribute('lang');

    this.resetGalleryState();
    this.clearCheckedMediaMarkers();
    this.chapterVideoOrgs.clear();

    const thumbsGallery = this.createThumbsContainer(bibleReference);
    const html = this.renderVerses(contentEl);

    thumbsGallery.innerHTML = html;
    this.attachThumbClickHandlers(thumbsGallery);
    this.setupImageLoadTracking(thumbsGallery);
    this.updateLanguageMenu(); // renderVerses collected this chapter's video titles
  }

  extractContentLanguage(el) {
    return el.getAttribute('data-lang3') ||
           el.getAttribute('lang3') ||
           el.getAttribute('lang') ||
           DEFAULT_LANGUAGE;
  }

  resetGalleryState() {
    this.state.galleryItems = [];
    this.state.currentGalleryIndex = -1;
    this.refs.gallery.classList.remove('active');
    this.clearGalleryContent();
    this.refs.thumbsContainer.innerHTML = '';
    this.refs.main.scrollTop = 0;
  }

  clearCheckedMediaMarkers() {
    const scope = this.contentToProcess || document;
    const markers = scope.querySelectorAll('.checked-media');
    for (let i = 0; i < markers.length; i++) {
      markers[i].classList.remove('checked-media');
    }
  }

  createThumbsContainer(bibleReference) {
    const node = this.createElement(`<div class="media-library-verses">
      <h2>${bibleReference.toString()}</h2>
      <div class="media-library-thumbs"></div>
    </div>`);
    this.refs.thumbsContainer.appendChild(node);
    return node.querySelector('.media-library-thumbs');
  }

  renderVerses(contentEl) {
    const htmlParts = [];
    const verses = contentEl.querySelectorAll('.verse, .v');

    for (let i = 0; i < verses.length; i++) {
      let verse = verses[i];
      const verseid = verse.getAttribute('data-id');
      if (!verseid) continue;

      const chapter = verse.closest('.chapter');
      if (chapter) {
        verse = chapter.querySelector(`.${verseid}`) ?? verse;
      }

      if (verse.classList.contains('checked-media')) continue;

      const reference = new Reference(verseid);
      this.renderVerseInto(verseid, reference, htmlParts);
      verse.classList.add('checked-media');
    }

    return htmlParts.join('');
  }

  attachThumbClickHandlers(gallery) {
    gallery.addEventListener('click', (e) => {
      const anchor = e.target.closest('a');
      if (!anchor) return;
      e.preventDefault();
      const index = parseInt(anchor.dataset.index, 10);
      if (!isNaN(index)) {
        this.showGalleryItem(index);
      }
    });
  }

  setupImageLoadTracking(gallery) {
    const images = gallery.querySelectorAll('img');

    if (images.length === 0) {
      gallery.innerHTML = '<div class="media-no-content">No media for this chapter</div>';
      gallery.classList.add('resized');
      return;
    }

    let loadedCount = 0;
    const totalImages = images.length;
    let resizeScheduled = false;

    const scheduleResize = () => {
      if (resizeScheduled) return;
      resizeScheduled = true;
      requestAnimationFrame(() => {
        this.resizeImages(gallery);
        resizeScheduled = false;
        if (loadedCount === totalImages) {
          gallery.classList.add('resized');
        }
      });
    };

    const onImageReady = () => {
      loadedCount++;
      scheduleResize();
    };

    images.forEach((img) => {
      if (img.complete) {
        img.classList.add('loaded');
        onImageReady();
      } else {
        img.addEventListener('load', () => {
          img.classList.add('loaded');
          onImageReady();
        }, { once: true });
        img.addEventListener('error', onImageReady, { once: true });
      }
    });
  }

  getFilterCategory(mediaLibrary) {
    if (mediaLibrary.type === 'dbsvideo' || mediaLibrary.type === 'video') {
      return 'video';
    }
    return 'art';
  }

  renderVerseInto(verseid, reference, htmlParts) {
    const libraries = this.mediaLibraries;
    const filters = this.state.filters;

    for (let i = 0; i < libraries.length; i++) {
      const mediaLibrary = libraries[i];
      const category = this.getFilterCategory(mediaLibrary);
      if (!filters[category]) continue;

      const mediaForVerse = mediaLibrary.data?.[verseid];
      if (!mediaForVerse) continue;

      this.renderLibraryMediaInto(mediaLibrary, mediaForVerse, category, verseid, reference, htmlParts);
    }
  }

  renderLibraryMediaInto(mediaLibrary, mediaForVerse, category, verseid, reference, htmlParts) {
    for (let j = 0; j < mediaForVerse.length; j++) {
      const mediaInfo = mediaForVerse[j];
      if (mediaInfo.filename?.includes('-color')) continue;
      if (mediaLibrary.type === 'dbsvideo') {
        this.chapterVideoOrgs.add(mediaInfo.org);
        if (!hasDbsVideoEdition(mediaInfo.org, this.effectiveVideoLanguage(),
          { fallback: !this.state.videoLanguage })) continue;
      }

      const { fullUrl, thumbUrl } = this.buildMediaUrls(mediaLibrary, mediaInfo);
      const galleryItem = this.createGalleryItem(mediaLibrary, mediaInfo, fullUrl, thumbUrl, reference, category, verseid);
      this.state.galleryItems.push(galleryItem);

      htmlParts.push(this.renderThumbLink(galleryItem, mediaLibrary, mediaInfo, reference));
    }
  }

  buildMediaUrls(mediaLibrary, mediaInfo) {
    // Remote catalogs (DBS video) name their own cover per item; the naming is
    // too irregular across productions to rebuild from a base + suffix.
    if (mediaInfo.cover) {
      return { fullUrl: mediaInfo.cover, thumbUrl: mediaInfo.cover };
    }

    if (mediaLibrary.baseUrl) {
      const ext = Array.isArray(mediaInfo.exts) ? mediaInfo.exts[0] : mediaInfo.exts;
      const largeSuffix = mediaLibrary.largeSuffix || `.${ext}`;
      const thumbSuffix = mediaLibrary.thumbSuffix || '-thumb.jpg';
      return {
        fullUrl: `${mediaLibrary.baseUrl}${mediaInfo.filename}${largeSuffix}`,
        thumbUrl: `${mediaLibrary.baseUrl}${mediaInfo.filename}${thumbSuffix}`
      };
    }

    const baseUrl = `${this.config.baseContentUrl}content/media/${mediaLibrary.folder}/`;
    const ext = Array.isArray(mediaInfo.exts) ? mediaInfo.exts[0] : mediaInfo.exts;
    return {
      fullUrl: `${baseUrl}${mediaInfo.filename}.${ext}`,
      thumbUrl: `${baseUrl}${mediaInfo.filename}-thumb.jpg`
    };
  }

  createGalleryItem(mediaLibrary, mediaInfo, fullUrl, thumbUrl, reference, category, verseid) {
    return {
      url: fullUrl,
      thumbUrl,
      type: mediaLibrary.type,
      title: mediaInfo.name || mediaInfo.title || '',
      artist: mediaInfo.artist || '',
      date: mediaInfo.date || '',
      reference: reference.toString(),
      category,
      source: mediaInfo.source || '',
      // which DBS production, and which of its chapters, to resolve at play time
      org: mediaInfo.org || '',
      chapterNumber: mediaLibrary.type === 'dbsvideo' ? (mediaInfo.chapter ?? mediaInfo.filename) : null,
      // identity for selectMediaItem lookups from the media popup
      folder: mediaLibrary.folder,
      filename: mediaInfo.filename,
      verseid
    };
  }

  renderThumbLink(galleryItem, mediaLibrary, mediaInfo, reference) {
    const titleAttr = galleryItem.title ? `title="${this.escapeHtml(galleryItem.title)}"` : '';
    const playIndicator = mediaLibrary.type !== 'image' ? '<b><i></i></b>' : '';

    return `<a href="${galleryItem.url}" class="mediatype-${mediaLibrary.type} mediacategory-${galleryItem.category}" ${titleAttr} data-filename="${mediaInfo.filename}" data-index="${this.state.galleryItems.length - 1}">
      <img src="${galleryItem.thumbUrl}" alt="${this.escapeHtml(reference.toString())}" />
      ${playIndicator}
      <span>${reference.toString()}</span>
    </a>`;
  }

  startResize() {
    this.resizeImages(this.refs.thumbsContainer.querySelector('.media-library-thumbs'));
  }

  resizeImages(gallery) {
    if (!gallery) return;
    const images = gallery.querySelectorAll('img');
    if (!images.length) return;

    const containerWidth = gallery.offsetWidth;
    let row = [], rowWidth = 0;

    const flushRow = (fit) => {
      if (!row.length) return;
      const scale = fit && row.length > 1 ? containerWidth / rowWidth : 1;
      for (let i = 0; i < row.length; i++) {
        const { anchor, img, sw } = row[i];
        this.applyThumbStyles(anchor, img,
          Math.round(sw * scale),
          Math.round(TARGET_ROW_HEIGHT * scale),
          fit && i === row.length - 1);
      }
      row = [];
      rowWidth = 0;
    };

    for (const img of images) {
      const anchor = img.closest('a');
      if (!anchor) continue;

      let { originalWidth: ow, originalHeight: oh } = img.dataset;
      if (!ow) {
        ow = img.offsetWidth || img.naturalWidth || TARGET_ROW_HEIGHT;
        oh = img.offsetHeight || img.naturalHeight || TARGET_ROW_HEIGHT;
        img.dataset.originalWidth = ow;
        img.dataset.originalHeight = oh;
      }

      const sw = Math.floor(TARGET_ROW_HEIGHT * ow / (oh || TARGET_ROW_HEIGHT));
      if (rowWidth + sw > containerWidth && row.length) flushRow(true);
      row.push({ anchor, img, sw });
      rowWidth += sw + TARGET_GUTTER_WIDTH;
    }
    flushRow(false);
  }

  applyThumbStyles(anchor, img, width, height, isLastInRow) {
    const widthPx = `${width}px`;
    const heightPx = `${height}px`;

    anchor.style.cssText = `width:${widthPx};height:${heightPx};margin-right:${isLastInRow ? '0' : TARGET_GUTTER_WIDTH + 'px'};margin-bottom:${TARGET_GUTTER_WIDTH}px`;
    img.style.cssText = `width:${widthPx};height:${heightPx}`;
  }

  size(width, height) {
    const headerHeight = this.refs.header.offsetHeight;
    this.refs.main.style.height = `${height - headerHeight}px`;
    this.refs.main.style.width = `${width}px`;

    this.startResize();
  }

  getData() {
    const data = {
      params: {
        'win': 'media'
      }
    };

    // Only a picked language is worth restoring; 'auto' is the default
    if (this.state.videoLanguage) {
      data.videoLanguage = this.state.videoLanguage;
      data.params.videoLanguage = this.state.videoLanguage;
    }
    return data;
  }
}

registerWindowComponent('media-window', MediaWindowComponent, {
  windowType: 'media',
  displayName: 'Media',
  paramKeys: { videoLanguage: 'vl' }
});

export { MediaWindowComponent as MediaWindow };

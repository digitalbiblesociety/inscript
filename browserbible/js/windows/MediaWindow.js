import { BaseWindow, registerWindowComponent } from './BaseWindow.js';
import { Reference } from '../bible/BibleReference.js';
import { i18n } from '../lib/i18n.js';
import { primeDbsVideoCatalog } from '../media/DbsVideoApi.js';
import {
  effectiveVideoLanguage, rankLanguages, reloadForLanguage, renderLanguageOption,
  renderLanguageOptions, setVideoLanguage, toggleLanguageMenu, updateLanguageLabel,
  updateLanguageMenu
} from './MediaLanguages.js';
import {
  buildItemTitle, createDbsVideoElement, createImageElement, createMediaElement,
  createVideoElement, findGalleryIndex, navigateGallery, selectMediaItem,
  showGalleryItem, updateGalleryUi
} from './MediaGallery.js';
import {
  buildMediaUrls, createGalleryItem, getFilterCategory, renderLibraryMediaInto,
  renderThumbLink, renderVerseInto, resizeImages
} from './MediaThumbs.js';
import { handleMediaMessage } from './MediaContent.js';

export { pickSection, toContainer } from './MediaContent.js';

const DEFAULT_LANGUAGE = 'eng';
const RESIZE_DEBOUNCE_MS = 100;

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
    return effectiveVideoLanguage(this);
  }

  /**
   * Rebuild the picker from the video titles on this chapter. Hidden when the
   * chapter has no video at all (most of the Bible) or videos are filtered out,
   * so the header stays as it was for art-only chapters.
   */
  updateLanguageMenu() {
    updateLanguageMenu(this);
  }

  /**
   * Languages matching a query, the ones named for it first: typing "span"
   * should not bury Spanish under Coatzospan Mixtec and Uspanteco. Both groups
   * keep the alphabetical order they came in.
   * `search` arrives lowercased and trimmed.
   */
  rankLanguages(search) {
    return rankLanguages(this, search);
  }

  /**
   * @param {string} [query] - part of a language name, or a code prefix
   */
  renderLanguageOptions(query = '') {
    renderLanguageOptions(this, query);
  }

  renderLanguageOption(language) {
    return renderLanguageOption(this, language);
  }

  /** The button shows what videos will play in. */
  updateLanguageLabel() {
    updateLanguageLabel(this);
  }

  toggleLanguageMenu(open) {
    toggleLanguageMenu(this, open);
  }

  /**
   * @param {string} iso - ISO 639-3 code, or '' to follow the Bible text
   */
  setVideoLanguage(iso) {
    setVideoLanguage(this, iso);
  }

  /**
   * Re-render the chapter's thumbs in the new language, reopening whatever was
   * playing if that title has an edition in it.
   */
  reloadForLanguage() {
    reloadForLanguage(this);
  }

  /**
   * Open the gallery on a specific item, e.g. from the media popup.
   * Safe at any lifecycle point: before the libraries load the request is
   * stashed and init() replays it.
   * @param {{sectionid: string, verseid: string, folder: string, filename: string}} select
   */
  selectMediaItem(select) {
    selectMediaItem(this, select);
  }

  /**
   * Gallery index for a popup selection: exact folder+filename, then the
   * base file of a `-color` variant (the gallery skips those but the popup
   * shows them), then anything on the same verse.
   * @returns {number} index into state.galleryItems, or -1
   */
  findGalleryIndex({ folder, filename, verseid }) {
    return findGalleryIndex(this, { folder, filename, verseid });
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
    handleMediaMessage(this, e);
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
    return showGalleryItem(this, index);
  }

  clearGalleryContent() {
    this.refs.galleryContent.innerHTML = '';
  }

  createVideoElement(src, options = {}) {
    return createVideoElement(src, options);
  }

  createImageElement(src, alt) {
    return createImageElement(src, alt);
  }

  async createMediaElement(item) {
    return createMediaElement(this, item);
  }

  async createDbsVideoElement(item) {
    return createDbsVideoElement(this, item);
  }

  buildItemTitle(item) {
    return buildItemTitle(item);
  }

  updateGalleryUI(item, index) {
    updateGalleryUi(this, item, index);
  }

  navigateGallery(delta) {
    navigateGallery(this, delta);
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
    return getFilterCategory(mediaLibrary);
  }

  renderVerseInto(verseid, reference, htmlParts) {
    renderVerseInto(this, verseid, reference, htmlParts);
  }

  renderLibraryMediaInto(options) {
    renderLibraryMediaInto(this, options);
  }

  buildMediaUrls(mediaLibrary, mediaInfo) {
    return buildMediaUrls(this, mediaLibrary, mediaInfo);
  }

  createGalleryItem(options) {
    return createGalleryItem(options);
  }

  renderThumbLink(galleryItem, mediaLibrary, mediaInfo, reference) {
    return renderThumbLink(this, galleryItem, mediaLibrary, mediaInfo, reference);
  }

  startResize() {
    this.resizeImages(this.refs.thumbsContainer.querySelector('.media-library-thumbs'));
  }

  resizeImages(gallery) {
    resizeImages(gallery);
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

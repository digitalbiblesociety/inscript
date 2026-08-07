import { elem } from '../lib/helpers.esm.js';
import { getConfig } from '../core/config.js';
import { getApp } from '../core/registry.js';
import { InfoWindow } from '../ui/InfoWindow.js';
import { getDbsVideoChapter, hasDbsVideoEdition } from '../media/DbsVideoApi.js';

export const playableVideos = (mediaForVerse, lang) =>
  mediaForVerse.filter((mediaInfo) => hasDbsVideoEdition(mediaInfo.org, lang));

const safeMediaUrl = (value) => {
  try {
    const url = new URL(value, document.baseURI);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

function getMediaUrl(mediaLibrary, filename, extension, suffix) {
  if (mediaLibrary.baseUrl) {
    return `${mediaLibrary.baseUrl}${filename}${suffix || '.' + extension}`;
  }
  const baseUrl = getConfig().baseContentUrl;
  return `${baseUrl}content/media/${mediaLibrary.folder}/${filename}${suffix || '.' + extension}`;
}

const isModifiedClick = (event) => {
  const hasModifier = event.metaKey || event.ctrlKey || event.shiftKey;
  return hasModifier || event.button !== 0;
};

export class MediaLibraryPopups {
  constructor() {
    this.popup = InfoWindow('mediapopup');
    this.requestId = 0;
    this.popup.on('hide', () => this.requestId++);
    this.popup.body.addEventListener('click', (event) => this.handleThumbnailClick(event));
  }

  showImage({ icon, mediaLibrary, mediaForVerse, reference, verseid, sectionid }) {
    this.requestId++;
    const items = mediaForVerse.map((mediaInfo) => {
      const extension = Array.isArray(mediaInfo.exts) ? mediaInfo.exts[0] : mediaInfo.exts;
      const fullUrl = safeMediaUrl(getMediaUrl(mediaLibrary, mediaInfo.filename, extension, mediaLibrary.largeSuffix));
      const thumbUrl = safeMediaUrl(getMediaUrl(mediaLibrary, mediaInfo.filename, extension, mediaLibrary.thumbSuffix || null));
      if (!fullUrl || !thumbUrl) return null;
      return this.createThumbnail({
        href: fullUrl,
        src: thumbUrl,
        alt: reference,
        dataset: { folder: mediaLibrary.folder, filename: mediaInfo.filename, verseid, sectionid },
        newTab: true
      });
    }).filter(Boolean);
    this.showThumbnailList(icon, reference, items);
  }

  showVideo(icon, mediaLibrary, mediaForVerse) {
    this.requestId++;
    const mediaInfo = mediaForVerse[0];
    const extension = Array.isArray(mediaInfo.exts) ? mediaInfo.exts[0] : mediaInfo.exts;
    const videoUrl = safeMediaUrl(getMediaUrl(mediaLibrary, mediaInfo.filename, extension));
    if (!videoUrl) return;
    this.showVideoPopup(icon, videoUrl, mediaInfo.name || mediaInfo.filename);
  }

  async showDbsVideo({ icon, mediaLibrary, mediaForVerse, reference, verseid, sectionid }) {
    const requestId = ++this.requestId;
    const lang = icon.closest('.section')?.getAttribute('data-lang3') ?? 'eng';
    const playable = playableVideos(mediaForVerse, lang);
    if (!playable.length) return;
    if (playable.length > 1) {
      this.showVideoChooser({ icon, mediaLibrary, mediaForVerse: playable, reference, verseid, sectionid });
      return;
    }
    const mediaInfo = playable[0];
    let chapter = null;
    try {
      chapter = await getDbsVideoChapter(mediaInfo.org, lang, mediaInfo.chapter ?? mediaInfo.filename);
    } catch (error) {
      console.warn('DBS video error:', error.message);
    }
    if (!chapter || requestId !== this.requestId) return;
    const langSuffix = chapter.isFallback && chapter.languageName ? ` (${chapter.languageName})` : '';
    const videoUrl = safeMediaUrl(chapter.url);
    if (videoUrl) this.showVideoPopup(icon, videoUrl, (chapter.title || mediaInfo.name || mediaInfo.filename) + langSuffix);
  }

  showVideoChooser({ icon, mediaLibrary, mediaForVerse, reference, verseid, sectionid }) {
    const items = mediaForVerse.map((mediaInfo) => {
      const label = [mediaInfo.name, mediaInfo.source].filter(Boolean).join(' - ');
      const cover = safeMediaUrl(mediaInfo.cover);
      if (!cover) return null;
      return this.createThumbnail({
        href: cover,
        src: cover,
        alt: label,
        title: label,
        dataset: { folder: mediaLibrary.folder, filename: mediaInfo.filename, verseid, sectionid },
        extra: elem('b', {}, elem('i'))
      });
    }).filter(Boolean);
    this.showThumbnailList(icon, reference, items);
  }

  createThumbnail({ href, src, alt, title = '', dataset, newTab = false, extra = null }) {
    const anchor = elem('a', {
      href,
      title,
      dataset,
      ...(newTab && { target: '_blank', rel: 'noopener noreferrer' })
    }, elem('img', { src, alt }), extra);
    return elem('li', {}, anchor);
  }

  showThumbnailList(icon, reference, items) {
    this.popup.body.innerHTML = '';
    this.popup.body.appendChild(elem('strong', {}, reference));
    this.popup.body.appendChild(elem('ul', { className: 'inline-image-library-thumbs' }, items));
    this.popup.position(icon).show();
  }

  showVideoPopup(icon, videoUrl, title) {
    this.popup.body.innerHTML = '';
    if (title) this.popup.body.appendChild(elem('strong', {}, title));
    const video = elem('video', {
      controls: true,
      autoplay: true,
      style: 'width:100%;max-height:300px;margin-top:8px;border-radius:4px;'
    });
    video.src = videoUrl;
    this.popup.body.appendChild(video);
    const stopHandler = () => {
      video.pause();
      video.src = '';
      this.popup.off('hide', stopHandler);
    };
    this.popup.on('hide', stopHandler);
    this.popup.position(icon).show();
  }

  handleThumbnailClick(event) {
    const anchor = event.target.closest('.inline-image-library-thumbs a');
    if (!anchor || isModifiedClick(event)) return;
    event.preventDefault();
    this.popup.hide();
    this.openInMediaWindow({
      sectionid: anchor.getAttribute('data-sectionid'),
      verseid: anchor.getAttribute('data-verseid'),
      folder: anchor.getAttribute('data-folder'),
      filename: anchor.getAttribute('data-filename')
    });
  }

  openInMediaWindow(select) {
    const windowManager = getApp()?.windowManager;
    if (!windowManager) return;
    const mediaWindow = windowManager.getWindows().find((win) => win.className === 'MediaWindow');
    if (!mediaWindow) {
      windowManager.add('MediaWindow', { select });
      return;
    }
    mediaWindow.controller?.selectMediaItem?.(select);
    windowManager.activate(mediaWindow.id);
  }
}

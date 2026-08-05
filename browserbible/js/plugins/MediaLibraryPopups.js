import { elem } from '../lib/helpers.esm.js';
import { getConfig } from '../core/config.js';
import { getApp } from '../core/registry.js';
import { InfoWindow } from '../ui/InfoWindow.js';
import { getDbsVideoChapter, hasDbsVideoEdition } from '../media/DbsVideoApi.js';

export const playableVideos = (mediaForVerse, lang) =>
  mediaForVerse.filter((mediaInfo) => hasDbsVideoEdition(mediaInfo.org, lang));

const escapeAttr = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/"/g, '&quot;');

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
    this.popup.body.addEventListener('click', (event) => this.handleThumbnailClick(event));
  }

  showImage({ icon, mediaLibrary, mediaForVerse, reference, verseid, sectionid }) {
    const html = mediaForVerse.map((mediaInfo) => {
      const extension = Array.isArray(mediaInfo.exts) ? mediaInfo.exts[0] : mediaInfo.exts;
      const fullUrl = getMediaUrl(mediaLibrary, mediaInfo.filename, extension, mediaLibrary.largeSuffix);
      const thumbUrl = getMediaUrl(mediaLibrary, mediaInfo.filename, extension, mediaLibrary.thumbSuffix || null);
      return `<li><a href="${fullUrl}" target="_blank" rel="noopener noreferrer" data-folder="${mediaLibrary.folder}" data-filename="${mediaInfo.filename}" data-verseid="${verseid}" data-sectionid="${sectionid}"><img src="${thumbUrl}" alt="${reference}" /></a></li>`;
    }).join('');
    this.showThumbnailList(icon, reference, html);
  }

  showVideo(icon, mediaLibrary, mediaForVerse) {
    const mediaInfo = mediaForVerse[0];
    const extension = Array.isArray(mediaInfo.exts) ? mediaInfo.exts[0] : mediaInfo.exts;
    const videoUrl = getMediaUrl(mediaLibrary, mediaInfo.filename, extension);
    this.showVideoPopup(icon, videoUrl, mediaInfo.name || mediaInfo.filename);
  }

  async showDbsVideo({ icon, mediaLibrary, mediaForVerse, reference, verseid, sectionid }) {
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
    if (!chapter) return;
    const langSuffix = chapter.isFallback && chapter.languageName ? ` (${chapter.languageName})` : '';
    this.showVideoPopup(icon, chapter.url, (chapter.title || mediaInfo.name || mediaInfo.filename) + langSuffix);
  }

  showVideoChooser({ icon, mediaLibrary, mediaForVerse, reference, verseid, sectionid }) {
    const html = mediaForVerse.map((mediaInfo) => {
      const label = [mediaInfo.name, mediaInfo.source].filter(Boolean).join(' - ');
      return `<li><a href="${mediaInfo.cover}" data-folder="${mediaLibrary.folder}" data-filename="${mediaInfo.filename}" data-verseid="${verseid}" data-sectionid="${sectionid}" title="${escapeAttr(label)}"><img src="${mediaInfo.cover}" alt="${escapeAttr(label)}" /><b><i></i></b></a></li>`;
    }).join('');
    this.showThumbnailList(icon, reference, html);
  }

  showThumbnailList(icon, reference, html) {
    this.popup.body.innerHTML = '';
    this.popup.body.appendChild(elem('strong', {}, reference));
    this.popup.body.appendChild(elem('ul', { className: 'inline-image-library-thumbs', innerHTML: html }));
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

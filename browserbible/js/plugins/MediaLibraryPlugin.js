import { elem, insertAfter } from '../lib/helpers.esm.js';
import { getConfig } from '../core/config.js';
import { getApp } from '../core/registry.js';
import { InfoWindow } from '../ui/InfoWindow.js';
import { Reference } from '../bible/BibleReference.js';
import { mixinEventEmitter } from '../common/EventEmitter.js';
import { getDbsVideoChapter, hasDbsVideoEdition, primeDbsVideoCatalog } from '../media/DbsVideoApi.js';

/** DBS videos of a verse that the reader's language (or English) actually has. */
const playableVideos = (mediaForVerse, lang) =>
  mediaForVerse.filter((mediaInfo) => hasDbsVideoEdition(mediaInfo.org, lang));

const escapeAttr = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/"/g, '&quot;');

function getMediaUrl(mediaLibrary, filename, ext, suffix) {
  const config = getConfig();
  if (mediaLibrary.baseUrl) {
    return `${mediaLibrary.baseUrl}${filename}${suffix || '.' + ext}`;
  }
  return `${config.baseContentUrl}content/media/${mediaLibrary.folder}/${filename}${suffix || '.' + ext}`;
}

export const MediaLibraryPlugin = () => {
  const config = getConfig();

  if (!config.enableMediaLibraryPlugin) {
    return {};
  }

  let mediaLibraries = null;
  const mediaPopup = InfoWindow('mediapopup');
  const contentToProcess = [];

  const MediaLibrary = window.MediaLibrary;

  const showImagePopup = (icon, mediaLibrary, mediaForVerse, reference, verseid, sectionid) => {
    const bodyEl = mediaPopup.body;
    bodyEl.innerHTML = '';

    let html = '';
    for (const mediaInfo of mediaForVerse) {
      const ext = Array.isArray(mediaInfo.exts) ? mediaInfo.exts[0] : mediaInfo.exts;
      const fullUrl = getMediaUrl(mediaLibrary, mediaInfo.filename, ext, mediaLibrary.largeSuffix);
      const thumbUrl = getMediaUrl(mediaLibrary, mediaInfo.filename, ext, mediaLibrary.thumbSuffix || null);
      html += `<li><a href="${fullUrl}" target="_blank" rel="noopener noreferrer" data-folder="${mediaLibrary.folder}" data-filename="${mediaInfo.filename}" data-verseid="${verseid}" data-sectionid="${sectionid}"><img src="${thumbUrl}" alt="${reference}" /></a></li>`;
    }

    bodyEl.appendChild(elem('strong', {}, reference));
    bodyEl.appendChild(elem('ul', { className: 'inline-image-library-thumbs', innerHTML: html }));
    mediaPopup.position(icon).show();
  };

  // A direct controller call rather than a message broadcast: it works on
  // unlinked MediaWindows (App only broadcasts to linked ones) and a
  // just-created controller may not have attached its message listener yet.
  const openInMediaWindow = (select) => {
    const wm = getApp()?.windowManager;
    if (!wm) return;

    const mediaWin = wm.getWindows().find(w => w.className === 'MediaWindow');
    if (mediaWin) {
      mediaWin.controller?.selectMediaItem?.(select);
      wm.activate(mediaWin.id);
    } else {
      wm.add('MediaWindow', { select }); // the Window ctor self-activates
    }
  };

  // A plain click on a popup thumb opens it in the MediaWindow; modified
  // clicks keep the browser's open-in-new-tab behavior. Used by the image
  // popup and by the chooser a verse with several videos shows.
  mediaPopup.body.addEventListener('click', (e) => {
    const anchor = e.target.closest('.inline-image-library-thumbs a');
    if (!anchor) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

    e.preventDefault();
    mediaPopup.hide();
    openInMediaWindow({
      sectionid: anchor.getAttribute('data-sectionid'),
      verseid: anchor.getAttribute('data-verseid'),
      folder: anchor.getAttribute('data-folder'),
      filename: anchor.getAttribute('data-filename')
    });
  });

  const showVideo = (icon, mediaLibrary, mediaForVerse) => {
    const videoMediaInfo = mediaForVerse[0];
    const videoExt = Array.isArray(videoMediaInfo.exts) ? videoMediaInfo.exts[0] : videoMediaInfo.exts;
    const videoUrl = getMediaUrl(mediaLibrary, videoMediaInfo.filename, videoExt);

    showVideoPopup(icon, videoUrl, videoMediaInfo.name || videoMediaInfo.filename);
  };

  /**
   * DBS video on a verse. One video plays in the popup; several (LUMO Matthew
   * and the Visual Bible both open on Matthew 1) list as covers that open in
   * the MediaWindow, which is the better place to watch and page through them.
   */
  const showDbsVideo = async (icon, mediaLibrary, allForVerse, reference, verseid, sectionid) => {
    const section = icon.closest('.section');
    const lang = section?.getAttribute('data-lang3') ?? 'eng';

    const mediaForVerse = playableVideos(allForVerse, lang);
    if (!mediaForVerse.length) return;

    if (mediaForVerse.length > 1) {
      showVideoChooser(icon, mediaLibrary, mediaForVerse, reference, verseid, sectionid);
      return;
    }

    const mediaInfo = mediaForVerse[0];

    let chapter = null;
    try {
      chapter = await getDbsVideoChapter(mediaInfo.org, lang, mediaInfo.chapter ?? mediaInfo.filename);
    } catch (error) {
      console.warn('DBS video error:', error.message);
    }
    if (!chapter) return;

    // Name the language only when it is not the one being read.
    const langSuffix = chapter.isFallback && chapter.languageName ? ` (${chapter.languageName})` : '';
    const title = (chapter.title || mediaInfo.name || mediaInfo.filename) + langSuffix;

    showVideoPopup(icon, chapter.url, title);
  };

  const showVideoChooser = (icon, mediaLibrary, mediaForVerse, reference, verseid, sectionid) => {
    const bodyEl = mediaPopup.body;
    bodyEl.innerHTML = '';

    const html = mediaForVerse.map((mediaInfo) => {
      const label = [mediaInfo.name, mediaInfo.source].filter(Boolean).join(' - ');
      return `<li><a href="${mediaInfo.cover}" data-folder="${mediaLibrary.folder}" data-filename="${mediaInfo.filename}" data-verseid="${verseid}" data-sectionid="${sectionid}" title="${escapeAttr(label)}"><img src="${mediaInfo.cover}" alt="${escapeAttr(label)}" /><b><i></i></b></a></li>`;
    }).join('');

    bodyEl.appendChild(elem('strong', {}, reference));
    bodyEl.appendChild(elem('ul', { className: 'inline-image-library-thumbs', innerHTML: html }));
    mediaPopup.position(icon).show();
  };

  const showVideoPopup = (icon, videoUrl, title) => {
    const bodyEl = mediaPopup.body;
    bodyEl.innerHTML = '';

    if (title) {
      bodyEl.appendChild(elem('strong', {}, title));
    }

    const video = elem('video', {
      controls: true,
      autoplay: true,
      style: 'width:100%;max-height:300px;margin-top:8px;border-radius:4px;'
    });
    video.src = videoUrl;
    bodyEl.appendChild(video);

    const stopHandler = () => {
      video.pause();
      video.src = '';
      mediaPopup.off('hide', stopHandler);
    };
    mediaPopup.on('hide', stopHandler);

    mediaPopup.position(icon).show();
  };

  const setupMediaEvents = () => {
    const windowsMain = document.querySelector('.windows-main');
    if (!windowsMain) return;

    windowsMain.addEventListener('click', (e) => {
      const icon = e.target.closest('.mediathumb');
      if (!icon) return;

      const mediaFolder = icon.getAttribute('data-mediafolder');
      const verse = icon.closest('.verse, .v');
      const verseid = verse?.getAttribute('data-id') ?? '';
      const ref = Reference(verseid);
      const reference = ref ? ref.toString() : verseid;
      const mediaLibrary = mediaLibraries.find(ml => ml.folder === mediaFolder);

      if (!mediaLibrary) return;

      const mediaForVerse = mediaLibrary.data?.[verseid];
      if (!mediaForVerse || mediaForVerse.length === 0) return;

      const sectionid = icon.closest('.section')?.getAttribute('data-id') ?? verseid.split('_')[0];

      if (mediaLibrary.type === 'image') showImagePopup(icon, mediaLibrary, mediaForVerse, reference, verseid, sectionid);
      else if (mediaLibrary.type === 'video') showVideo(icon, mediaLibrary, mediaForVerse);
      else if (mediaLibrary.type === 'dbsvideo') showDbsVideo(icon, mediaLibrary, mediaForVerse, reference, verseid, sectionid);
    });
  };

  const usableMediaForVerse = (mediaLibrary, verseid, lang) => {
    const mediaForVerse = mediaLibrary.data?.[verseid];
    if (mediaForVerse && mediaLibrary.type === 'dbsvideo') {
      const playable = playableVideos(mediaForVerse, lang);
      return playable.length ? playable : undefined;
    }
    return mediaForVerse;
  };

  const addMediaIcon = (verse, mediaLibrary) => {
    const iconEl = elem('span', { className: `inline-icon ${mediaLibrary.iconClassName} mediathumb`, dataset: { mediafolder: mediaLibrary.folder } });
    const verseNumber = verse.querySelector('.verse-num, .v-num');

    if (verseNumber) {
      insertAfter(iconEl, verseNumber);
    } else {
      verse.insertBefore(iconEl, verse.firstChild);
    }
  };

  const addMedia = () => {
    if (mediaLibraries === null) {
      return;
    }

    while (contentToProcess.length > 0) {
      const content = contentToProcess.pop();

      let contentEl;
      if (typeof content === 'string') {
        const temp = document.createElement('div');
        temp.innerHTML = content;
        const sectionEl = temp.querySelector('.section') ?? temp.firstElementChild;
        const sectionid = sectionEl?.getAttribute('data-id');
        contentEl = sectionid
          ? document.querySelector(`.BibleWindow .section[data-id="${CSS.escape(sectionid)}"]`)
          : null;
        if (!contentEl) continue;
      } else {
        contentEl = content;
      }

      if (contentEl.getAttribute('data-has-media') !== null) {
        continue;
      }

      contentEl.querySelectorAll('.verse, .v').forEach(function(verse) {
        const verseid = verse.getAttribute('data-id');

        const section = verse.closest('.section');
        if (section) {
          verse = section.querySelector(`.${verseid}`) ?? verse;
        }

        if (verse.classList.contains('has-media')) return;

        const lang = section?.getAttribute('data-lang3') ?? 'eng';

        for (const mediaLibrary of mediaLibraries) {
          const mediaForVerse = usableMediaForVerse(mediaLibrary, verseid, lang);
          if (mediaForVerse !== undefined) {
            addMediaIcon(verse, mediaLibrary);
          }
        }

        if (section) {
          section.querySelectorAll(`.${verseid}`).forEach((v) => {
            v.classList.add('has-media');
          });
        }
      });

      contentEl.setAttribute('data-has-media', 'true');
    }
  };

  if (MediaLibrary?.getMediaLibraries) {
    // Icons are added synchronously per verse and need the catalog to know which
    // video titles this language has; priming first keeps that check accurate.
    primeDbsVideoCatalog().then(() => MediaLibrary.getMediaLibraries((data) => {
      mediaLibraries = data;

      setupMediaEvents();
      addMedia();
    }));
  }

  let ext = {};
  mixinEventEmitter(ext);

  ext.on('message', (e) => {
    if (e.data.messagetype === 'textload' && e.data.type === 'bible') {
      contentToProcess.push(e.data.content);
      addMedia();
    }
  });

  return ext;
};

import { getDbsVideoChapter } from '../media/DbsVideoApi.js';

export function findGalleryIndex(component, { folder, filename, verseid }) {
  const items = component.state.galleryItems;
  let index = items.findIndex((item) => item.folder === folder && item.filename === filename);
  const base = filename?.replace(/-color.*$/, '');
  if (index < 0 && base !== filename) {
    index = items.findIndex((item) => item.folder === folder && item.filename === base);
  }
  if (index < 0) index = items.findIndex((item) => item.verseid === verseid);
  return index;
}

export function selectMediaItem(component, select) {
  if (!select) return;
  if (!component.mediaLibraries) {
    component.pendingSelect = select;
    return;
  }
  if (component.state.currentSectionId !== select.sectionid) {
    const section = document.querySelector(`.section[data-id="${select.sectionid}"]`);
    if (section) {
      component.contentToProcess = section;
      component.processContent();
    }
  }
  let index = component.findGalleryIndex(select);
  if (index < 0 && !component.state.filters.art) {
    component.setFilter('art', true);
    index = component.findGalleryIndex(select);
  }
  if (index < 0) return;
  component.showGalleryItem(index).then(() => {
    component.refs.thumbsContainer?.querySelector('.media-library-thumbs a.selected')
      ?.scrollIntoView?.({ block: 'nearest' });
  });
}

export function createVideoElement(src, options = {}) {
  const video = document.createElement('video');
  video.src = src;
  video.controls = true;
  video.autoplay = options.autoplay ?? true;
  if (options.poster) video.poster = options.poster;
  if (options.altSrc) {
    video.addEventListener('error', () => {
      video.src = options.altSrc;
      video.load();
    }, { once: true });
  }
  return video;
}

export function createImageElement(src, alt) {
  const image = document.createElement('img');
  image.src = src;
  image.alt = alt || '';
  return image;
}

export async function createDbsVideoElement(component, item) {
  component.refs.galleryContent.innerHTML = '<div class="media-gallery-loading">Loading video...</div>';
  let chapter = null;
  try {
    chapter = await getDbsVideoChapter(item.org, component.effectiveVideoLanguage(), item.chapterNumber);
  } catch { /* unavailable */ }
  if (!chapter) return component.createElement('<div class="media-no-content">Video unavailable</div>');
  if (chapter.title) item.title = chapter.title;
  item.spokenLanguage = chapter.isFallback ? chapter.languageName : '';
  return component.createVideoElement(chapter.url, {
    poster: chapter.poster || item.thumbUrl || '', altSrc: chapter.urlAlt
  });
}

export async function createMediaElement(component, item) {
  if (item.type === 'image') return component.createImageElement(item.url, item.title || item.reference);
  if (item.type === 'video') return component.createVideoElement(item.url);
  if (item.type === 'dbsvideo') return component.createDbsVideoElement(item);
  return null;
}

export function buildItemTitle(item) {
  let title = item.title || item.reference;
  if (item.artist) title += ` - ${item.artist}${item.date ? ` (${item.date})` : ''}`;
  if (item.source && item.source !== title) title += ` - ${item.source}`;
  if (item.spokenLanguage) title += ` (${item.spokenLanguage})`;
  return title;
}

export function updateGalleryUi(component, item, index) {
  component.refs.galleryTitle.textContent = component.buildItemTitle(item);
  component.refs.galleryCounter.textContent = `${index + 1} / ${component.state.galleryItems.length}`;
  component.refs.galleryPrev.disabled = index === 0;
  component.refs.galleryNext.disabled = index === component.state.galleryItems.length - 1;
  component.refs.gallery.classList.add('active');
  component.refs.thumbsContainer.querySelectorAll('.media-library-thumbs a').forEach((anchor, itemIndex) => {
    anchor.classList.toggle('selected', itemIndex === index);
  });
}

export async function showGalleryItem(component, index) {
  if (index < 0 || index >= component.state.galleryItems.length) return;
  component.state.currentGalleryIndex = index;
  const item = component.state.galleryItems[index];
  component.refs.galleryContent.querySelector('video')?.pause();
  const mediaElement = await component.createMediaElement(item);
  if (component.state.currentGalleryIndex !== index) return;
  component.clearGalleryContent();
  if (mediaElement) component.refs.galleryContent.appendChild(mediaElement);
  component.updateGalleryUI(item, index);
}

export function navigateGallery(component, delta) {
  const index = component.state.currentGalleryIndex + delta;
  if (index >= 0 && index < component.state.galleryItems.length) component.showGalleryItem(index);
}

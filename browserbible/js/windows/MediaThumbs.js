import { hasDbsVideoEdition } from '../media/DbsVideoApi.js';

const TARGET_ROW_HEIGHT = 80;
const TARGET_GUTTER_WIDTH = 4;

export function getFilterCategory(mediaLibrary) {
  return ['dbsvideo', 'video'].includes(mediaLibrary.type) ? 'video' : 'art';
}

export function buildMediaUrls(component, mediaLibrary, mediaInfo) {
  if (mediaInfo.cover) return { fullUrl: mediaInfo.cover, thumbUrl: mediaInfo.cover };
  if (mediaLibrary.baseUrl) {
    const extension = Array.isArray(mediaInfo.exts) ? mediaInfo.exts[0] : mediaInfo.exts;
    const largeSuffix = mediaLibrary.largeSuffix || `.${extension}`;
    const thumbSuffix = mediaLibrary.thumbSuffix || '-thumb.jpg';
    return {
      fullUrl: `${mediaLibrary.baseUrl}${mediaInfo.filename}${largeSuffix}`,
      thumbUrl: `${mediaLibrary.baseUrl}${mediaInfo.filename}${thumbSuffix}`
    };
  }
  const baseUrl = `${component.config.baseContentUrl}content/media/${mediaLibrary.folder}/`;
  const extension = Array.isArray(mediaInfo.exts) ? mediaInfo.exts[0] : mediaInfo.exts;
  return {
    fullUrl: `${baseUrl}${mediaInfo.filename}.${extension}`,
    thumbUrl: `${baseUrl}${mediaInfo.filename}-thumb.jpg`
  };
}

export function createGalleryItem({ mediaLibrary, mediaInfo, fullUrl, thumbUrl, reference, category, verseid }) {
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
    org: mediaInfo.org || '',
    chapterNumber: mediaLibrary.type === 'dbsvideo' ? (mediaInfo.chapter ?? mediaInfo.filename) : null,
    folder: mediaLibrary.folder,
    filename: mediaInfo.filename,
    verseid
  };
}

export function renderThumbLink(component, galleryItem, mediaLibrary, mediaInfo, reference) {
  const title = galleryItem.title ? `title="${component.escapeHtml(galleryItem.title)}"` : '';
  const play = mediaLibrary.type !== 'image' ? '<b><i></i></b>' : '';
  return `<a href="${galleryItem.url}" class="mediatype-${mediaLibrary.type} mediacategory-${galleryItem.category}" ${title} data-filename="${mediaInfo.filename}" data-index="${component.state.galleryItems.length - 1}">
    <img src="${galleryItem.thumbUrl}" alt="${component.escapeHtml(reference.toString())}" />
    ${play}<span>${reference.toString()}</span>
  </a>`;
}

export function renderLibraryMediaInto(component, options) {
  const { mediaLibrary, mediaForVerse, category, verseid, reference, htmlParts } = options;
  for (const mediaInfo of mediaForVerse) {
    if (mediaInfo.filename?.includes('-color')) continue;
    if (mediaLibrary.type === 'dbsvideo') {
      component.chapterVideoOrgs.add(mediaInfo.org);
      const available = hasDbsVideoEdition(mediaInfo.org, component.effectiveVideoLanguage(), {
        fallback: !component.state.videoLanguage
      });
      if (!available) continue;
    }
    const urls = component.buildMediaUrls(mediaLibrary, mediaInfo);
    const galleryItem = component.createGalleryItem({
      mediaLibrary, mediaInfo, ...urls, reference, category, verseid
    });
    component.state.galleryItems.push(galleryItem);
    htmlParts.push(component.renderThumbLink(galleryItem, mediaLibrary, mediaInfo, reference));
  }
}

export function renderVerseInto(component, verseid, reference, htmlParts) {
  for (const mediaLibrary of component.mediaLibraries) {
    const category = component.getFilterCategory(mediaLibrary);
    if (!component.state.filters[category]) continue;
    const mediaForVerse = mediaLibrary.data?.[verseid];
    if (!mediaForVerse) continue;
    component.renderLibraryMediaInto({
      mediaLibrary, mediaForVerse, category, verseid, reference, htmlParts
    });
  }
}

function applyThumbStyles(anchor, image, width, height, isLastInRow) {
  const widthPx = `${width}px`;
  const heightPx = `${height}px`;
  const marginRight = isLastInRow ? '0' : `${TARGET_GUTTER_WIDTH}px`;
  anchor.style.cssText = `width:${widthPx};height:${heightPx};margin-right:${marginRight};margin-bottom:${TARGET_GUTTER_WIDTH}px`;
  image.style.cssText = `width:${widthPx};height:${heightPx}`;
}

function imageRowEntry(image) {
  const anchor = image.closest('a');
  if (!anchor) return null;
  let { originalWidth: width, originalHeight: height } = image.dataset;
  if (!width) {
    width = image.offsetWidth || image.naturalWidth || TARGET_ROW_HEIGHT;
    height = image.offsetHeight || image.naturalHeight || TARGET_ROW_HEIGHT;
    image.dataset.originalWidth = width;
    image.dataset.originalHeight = height;
  }
  const scaledWidth = Math.floor(TARGET_ROW_HEIGHT * width / (height || TARGET_ROW_HEIGHT));
  return { anchor, image, scaledWidth };
}

export function resizeImages(gallery) {
  if (!gallery) return;
  const images = gallery.querySelectorAll('img');
  if (!images.length) return;
  const containerWidth = gallery.offsetWidth;
  let row = [];
  let rowWidth = 0;
  const flushRow = (fit) => {
    if (!row.length) return;
    const scale = fit && row.length > 1 ? containerWidth / rowWidth : 1;
    row.forEach(({ anchor, image, scaledWidth }, index) => applyThumbStyles(
      anchor, image, Math.round(scaledWidth * scale), Math.round(TARGET_ROW_HEIGHT * scale),
      fit && index === row.length - 1
    ));
    row = [];
    rowWidth = 0;
  };
  for (const image of images) {
    const entry = imageRowEntry(image);
    if (!entry) continue;
    if (rowWidth + entry.scaledWidth > containerWidth && row.length) flushRow(true);
    row.push(entry);
    rowWidth += entry.scaledWidth + TARGET_GUTTER_WIDTH;
  }
  flushRow(false);
}

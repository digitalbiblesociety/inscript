import { elem } from '../lib/helpers.esm.js';
import { playableVideos } from './MediaLibraryPopups.js';

export class MediaLibraryContent {
  constructor(getMediaLibraries) {
    this.getMediaLibraries = getMediaLibraries;
    this.pending = [];
  }

  enqueue(content) {
    this.pending.push(content);
    this.process();
  }

  process() {
    if (this.getMediaLibraries() === null) return;
    while (this.pending.length > 0) {
      const content = this.resolveContent(this.pending.pop());
      if (content) this.decorate(content);
    }
  }

  resolveContent(content) {
    if (typeof content !== 'string') return content;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = content;
    const section = wrapper.querySelector('.section') ?? wrapper.firstElementChild;
    const sectionid = section?.getAttribute('data-id');
    if (!sectionid) return null;
    return document.querySelector(`.BibleWindow .section[data-id="${CSS.escape(sectionid)}"]`);
  }

  decorate(content) {
    if (content.getAttribute('data-has-media') !== null) return;
    content.querySelectorAll('.verse, .v').forEach((verse) => this.decorateVerse(verse));
    content.setAttribute('data-has-media', 'true');
  }

  decorateVerse(initialVerse) {
    const verseid = initialVerse.getAttribute('data-id');
    const section = initialVerse.closest('.section');
    const verse = section?.querySelector(`.${verseid}`) ?? initialVerse;
    if (verse.classList.contains('has-media')) return;
    const lang = section?.getAttribute('data-lang3') ?? 'eng';
    for (const library of this.getMediaLibraries()) {
      if (this.hasMedia(library, verseid, lang)) this.insertIcon(verse, library);
    }
    section?.querySelectorAll(`.${verseid}`).forEach((item) => item.classList.add('has-media'));
  }

  hasMedia(library, verseid, lang) {
    const media = library.data?.[verseid];
    if (!media) return false;
    return library.type !== 'dbsvideo' || playableVideos(media, lang).length > 0;
  }

  insertIcon(verse, library) {
    const icon = elem('span', {
      className: `inline-icon ${library.iconClassName} mediathumb`,
      dataset: { mediafolder: library.folder }
    });
    const verseNumber = verse.querySelector('.verse-num, .v-num');
    if (verseNumber) verseNumber.parentNode.insertBefore(icon, verseNumber.nextSibling);
    else verse.insertBefore(icon, verse.firstChild);
  }
}

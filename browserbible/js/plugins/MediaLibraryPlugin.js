import { getConfig } from '../core/config.js';
import { Reference } from '../bible/BibleReference.js';
import { mixinEventEmitter } from '../common/EventEmitter.js';
import { primeDbsVideoCatalog } from '../media/DbsVideoApi.js';
import { MediaLibraryPopups } from './MediaLibraryPopups.js';
import { MediaLibraryContent } from './MediaLibraryContent.js';

class MediaLibraryController {
  constructor() {
    this.mediaLibraries = null;
    this.popups = new MediaLibraryPopups();
    this.content = new MediaLibraryContent(() => this.mediaLibraries);
    this.extension = {};
    mixinEventEmitter(this.extension);
    this.librariesRequested = false;
    this.extension.on('message', (event) => this.handleMessage(event));
  }

  loadLibraries() {
    if (this.librariesRequested) return;
    const MediaLibrary = window.MediaLibrary;
    if (!MediaLibrary?.getMediaLibraries) return;
    this.librariesRequested = true;
    primeDbsVideoCatalog().then(() => MediaLibrary.getMediaLibraries((data) => {
      this.mediaLibraries = data;
      this.bindMediaEvents();
      this.content.process();
    }));
  }

  bindMediaEvents() {
    document.querySelector('.windows-main')?.addEventListener('click', (event) => {
      const icon = event.target.closest('.mediathumb');
      if (icon) this.handleMediaClick(icon);
    });
  }

  handleMediaClick(icon) {
    const mediaFolder = icon.getAttribute('data-mediafolder');
    const verse = icon.closest('.verse, .v');
    const verseid = verse?.getAttribute('data-id') ?? '';
    const reference = Reference(verseid)?.toString() ?? verseid;
    const mediaLibrary = this.mediaLibraries.find((library) => library.folder === mediaFolder);
    const mediaForVerse = mediaLibrary?.data?.[verseid];
    if (!mediaForVerse?.length) return;
    const sectionid = icon.closest('.section')?.getAttribute('data-id') ?? verseid.split('_')[0];
    const details = { icon, mediaLibrary, mediaForVerse, reference, verseid, sectionid };
    if (mediaLibrary.type === 'image') this.popups.showImage(details);
    else if (mediaLibrary.type === 'video') this.popups.showVideo(icon, mediaLibrary, mediaForVerse);
    else if (mediaLibrary.type === 'dbsvideo') this.popups.showDbsVideo(details);
  }

  handleMessage(event) {
    if (event.data.messagetype !== 'textload' || event.data.type !== 'bible') return;
    this.loadLibraries();
    this.content.enqueue(event.data.content);
  }
}

export const MediaLibraryPlugin = () => {
  if (!getConfig().enableMediaLibraryPlugin) return {};
  return new MediaLibraryController().extension;
};

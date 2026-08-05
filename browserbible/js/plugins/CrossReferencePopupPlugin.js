import { getConfig } from '../core/config.js';
import { InfoWindow } from '../ui/InfoWindow.js';
import { elem } from '../lib/helpers.esm.js';
const hasTouch = 'ontouchend' in document;
import { Reference } from '../bible/BibleReference.js';
import { mixinEventEmitter } from '../common/EventEmitter.js';
import { PlaceKeeper } from '../common/PlaceKeeper.js';
import { TextNavigation } from '../common/TextNavigation.js';
import { getText, loadSection } from '../texts/TextLoader.js';

// Store global handlers for cross-plugin communication
let handleBibleRefClick = null;
let handleBibleRefMouseover = null;
let handleBibleRefMouseout = null;

const removeNotesFromVerse = (verse) => {
  verse.querySelectorAll('.note').forEach((note) => {
    note.parentNode.removeChild(note);
  });
};

function getFragmentidFromNode(node) {
  const possibleTexts = [node.getAttribute('data-id'), node.getAttribute('title'), node.innerHTML];
  for (const text of possibleTexts) {
    if (text == null) continue;
    const reference = new Reference(text.split(';')[0].trim());
    if (typeof reference.toSection !== 'undefined') return reference.toSection();
  }
  return null;
}

class CrossReferencePopupController {
  constructor() {
    this.referencePopup = InfoWindow('CrossReferencePopup');
    this.referencePopup.container.classList.add('info-window-elevated');
    this.extension = { getData: () => null };
    mixinEventEmitter(this.extension);
    this.exposeHandlers();
    this.bindEvents();
  }

  exposeHandlers() {
    const controller = this;
    handleBibleRefClick = function(e) {
      controller.handleClick(this, e);
    };
    handleBibleRefMouseover = function(e, textid) {
      controller.handleMouseover(this, textid);
    };
    handleBibleRefMouseout = function() {
      controller.referencePopup.hide();
    };
  }

  handleClick(link) {
    const fragmentid = getFragmentidFromNode(link);
    const currentLocation = PlaceKeeper.getFirstLocation();
    if (currentLocation?.fragmentid) {
      TextNavigation.locationChange(currentLocation.fragmentid);
    }

    if (!fragmentid) return;
    TextNavigation.locationChange(fragmentid);
    this.extension.trigger('globalmessage', {
      type: 'globalmessage',
      target: link,
      data: {
        messagetype: 'nav',
        type: 'bible',
        locationInfo: {
          fragmentid,
          sectionid: fragmentid.split('_')[0],
          offset: 0
        }
      }
    });
  }

  handleMouseover(link, requestedTextid) {
    const fragmentid = getFragmentidFromNode(link);
    if (fragmentid === null) return;
    const textid = requestedTextid ?? this.getTextid(link);
    if (!textid) return;
    getText(textid, (textInfo) => this.loadReference(textInfo, fragmentid, link));
  }

  getTextid(link) {
    const section = link.closest('.section');
    if (section?.classList.contains('commentary')) {
      return document.querySelector('.BibleWindow .section')?.getAttribute('data-textid') ?? '';
    }
    return section?.getAttribute('data-textid') ?? '';
  }

  loadReference(textInfo, fragmentid, link) {
    if (!textInfo) return;
    loadSection(textInfo, fragmentid.split('_')[0], (contentNode) => {
      const contentEl = typeof contentNode === 'string'
        ? elem('div', { innerHTML: contentNode })
        : contentNode;
      if (!contentEl?.querySelectorAll) return;
      let html = '';
      for (const verse of contentEl.querySelectorAll(`.${fragmentid}`)) {
        const clone = verse.cloneNode(true);
        removeNotesFromVerse(clone);
        html += clone.innerHTML;
      }
      if (!html) return;
      this.referencePopup.body.innerHTML = html;
      this.referencePopup.show();
      this.referencePopup.position(link);
    });
  }

  bindEvents() {
    const windowsMain = document.querySelector('.windows-main');
    if (!windowsMain) return;
    windowsMain.addEventListener('click', (e) => {
      const target = e.target.closest('.bibleref, .xt');
      if (target) handleBibleRefClick.call(target, e);
    });

    if (!hasTouch) {
      windowsMain.addEventListener('mouseover', (e) => {
        const target = e.target.closest('.bibleref, .xt');
        if (target) handleBibleRefMouseover.call(target, e);
      });
      windowsMain.addEventListener('mouseout', (e) => {
        const target = e.target.closest('.bibleref, .xt');
        if (target) handleBibleRefMouseout.call(target, e);
      });
    }
  }
}

export const CrossReferencePopupPlugin = () => {
  if (!getConfig().enableCrossReferencePopupPlugin) return {};
  return new CrossReferencePopupController().extension;
};

export const getBibleRefClickHandler = () => handleBibleRefClick;

export const getBibleRefMouseoverHandler = () => handleBibleRefMouseover;

export const getBibleRefMouseoutHandler = () => handleBibleRefMouseout;

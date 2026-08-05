import { offset } from '../lib/helpers.esm.js';
import { Reference } from '../bible/BibleReference.js';

export const TEXT_TYPES = {
  BIBLE: 'bible', COMMENTARY: 'commentary', VIDEOBIBLE: 'videobible',
  DEAFBIBLE: 'deafbible', BOOK: 'book'
};

const fragmentSelector = (type) => type === TEXT_TYPES.BOOK ? '.page' : '.verse, .v';

function createLocationInfo(fragment, textInfo, contentTop) {
  const fragmentid = fragment.getAttribute('data-id');
  const section = fragment.closest('.section');
  const info = {
    fragmentid,
    sectionid: fragment.classList.contains('section')
      ? fragmentid
      : (section?.getAttribute('data-id') ?? ''),
    offset: contentTop - offset(fragment).top,
    textid: textInfo?.id ?? '',
    _textInfo: textInfo
  };
  const computeLabels = function() {
    const type = this._textInfo?.type?.toLowerCase() ?? TEXT_TYPES.BIBLE;
    this._label = '';
    this._labelLong = '';
    if ([TEXT_TYPES.BIBLE, TEXT_TYPES.COMMENTARY, TEXT_TYPES.VIDEOBIBLE, TEXT_TYPES.DEAFBIBLE].includes(type)) {
      const reference = Reference(this.fragmentid);
      if (reference && this._textInfo) {
        reference.language = this._textInfo.lang;
        this._label = reference.toString();
        this._labelLong = `${this._label} (${this._textInfo.abbr})`;
      }
    } else if (type === TEXT_TYPES.BOOK && this._textInfo) {
      this._labelLong = this._label = `${this._textInfo.name} ${this.fragmentid}`;
    }
  };
  Object.defineProperties(info, {
    label: { enumerable: true, get() { if (this._label === undefined) computeLabels.call(this); return this._label; } },
    labelLong: { enumerable: true, get() { if (this._labelLong === undefined) computeLabels.call(this); return this._labelLong; } }
  });
  return info;
}

function firstVisibleFragment(fragments, contentTop) {
  for (const candidate of fragments) {
    let fragment = candidate;
    if (offset(fragment).top - contentTop <= -2) continue;
    const fragmentid = fragment.getAttribute('data-id');
    const duplicates = fragment.parentNode?.querySelectorAll(`.${fragmentid}`) ?? [];
    if (duplicates.length > 1) {
      fragment = duplicates[0];
      if (offset(fragment).top - contentTop <= -2) continue;
    }
    return fragment;
  }
  return null;
}

export function updateLocationInfo(controller) {
  const contentTop = offset(controller.nodeElement).top;
  const selector = controller.currentTextInfo?.fragmentSelector
    || fragmentSelector(controller.currentTextInfo?.type?.toLowerCase());
  let fragments = controller.nodeElement.querySelectorAll(selector);
  if (fragments.length === 1) fragments = controller.nodeElement.querySelectorAll('.section');
  const fragment = firstVisibleFragment(fragments, contentTop);
  const location = fragment
    ? createLocationInfo(fragment, controller.currentTextInfo, contentTop)
    : null;
  if (location && controller.locationInfo?.fragmentid !== location.fragmentid) {
    controller.trigger('locationchange', { type: 'locationchange', target: controller, data: location });
  }
  controller.locationInfo = location;
}

export function setScrollTop(controller, top) {
  const before = controller.nodeElement.scrollTop;
  controller.nodeElement.scrollTop = top;
  if (controller.nodeElement.scrollTop !== before) {
    controller.suppressedScrollTop = controller.nodeElement.scrollTop;
  }
}

function nearestFragment(controller, fragmentid) {
  const [sectionid, verseText] = fragmentid.split('_');
  if (!verseText) return null;
  const targetVerse = parseInt(verseText, 10);
  const section = controller.wrapper.querySelector(`.${sectionid}`);
  if (!section || isNaN(targetVerse)) return null;
  let best = null;
  let distance = Infinity;
  for (const element of section.querySelectorAll('.verse, .v')) {
    const id = element.getAttribute('data-id');
    if (!id?.startsWith(`${sectionid}_`)) continue;
    const verse = parseInt(id.split('_')[1], 10);
    if (isNaN(verse)) continue;
    const candidateDistance = Math.abs(verse - targetVerse);
    if (candidateDistance < distance) {
      best = element;
      distance = candidateDistance;
    }
  }
  return best;
}

function scrollToElement(controller, element, scrollOffset = 0) {
  const top = offset(element).top - offset(controller.nodeElement).top
    + controller.nodeElement.scrollTop + scrollOffset;
  controller.setScrollTop(top);
}

export function scrollTo(controller, fragmentid, scrollOffset) {
  if (fragmentid == null || !controller.wrapper) return;
  const fragment = controller.wrapper.querySelector(`.${fragmentid}`)
    ?? nearestFragment(controller, fragmentid);
  if (fragment) {
    scrollToElement(controller, fragment, scrollOffset);
    return;
  }
  const sectionid = fragmentid.split('_')[0];
  const section = controller.wrapper.querySelector(`.${sectionid}`);
  if (section) scrollToElement(controller, section);
  else if (controller.currentTextInfo?.sections?.includes(sectionid)) {
    controller.load('text', sectionid, fragmentid);
  }
}

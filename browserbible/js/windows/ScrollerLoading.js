import { offset } from '../lib/helpers.esm.js';
import { getShowApocrypha, skipApocryphalSection } from '../bible/Apocrypha.js';
import { loadSection } from '../texts/TextLoader.js';
import { TEXT_TYPES } from './ScrollerLocation.js';

const MAX_SECTIONS = 50;

// How far a node sits into the scrollable content. Measured against the wrapper
// so the reading is independent of the current scroll position: removing a tall
// section shrinks the scroll range, and the browser clamps scrollTop as it goes,
// which would otherwise be mistaken for part of the content shift.
const contentTop = (controller, node) => offset(node).top - offset(controller.wrapper).top;

function trimTop(controller, sections) {
  const anchor = sections[1]?.firstElementChild ?? null;
  const scrollTop = controller.nodeElement.scrollTop;
  const before = anchor ? contentTop(controller, anchor) : 0;
  sections[0]?.remove();
  const after = anchor ? contentTop(controller, anchor) : 0;
  controller.setScrollTop(scrollTop - Math.abs(after - before));
}

// A section may only be dropped when the buffer it leaves behind still clears
// the two-viewport reload threshold, with a viewport to spare. Commentary
// chapters run twenty viewports tall, so trimming one blindly throws the
// reading position clear out of the remaining range and re-triggers the load
// that put it there, jittering the view for as long as it stays open.
const leavesBuffer = (buffer, section, nodeHeight) =>
  buffer - (section?.offsetHeight ?? 0) > nodeHeight * 3;

function nextVisibleSection(controller, sectionid, direction) {
  if (!sectionid || sectionid === 'null' || getShowApocrypha()) return sectionid;
  return skipApocryphalSection(sectionid, direction, controller.currentTextInfo?.sections);
}

export function loadMore(controller) {
  if (!controller.wrapper || controller.speedDelta !== 0) return;
  const nodeHeight = controller.nodeElement.offsetHeight;
  const scrollTop = controller.nodeElement.scrollTop;
  const sections = controller.wrapper.querySelectorAll('.section');
  const below = controller.wrapper.offsetHeight - nodeHeight - scrollTop;
  if (below < nodeHeight * 2 && sections.length < MAX_SECTIONS) {
    const nextid = nextVisibleSection(controller,
      sections[sections.length - 1]?.getAttribute('data-nextid'), 1);
    if (nextid && nextid !== 'null') controller.load('next', nextid);
  } else if (scrollTop < nodeHeight * 2 && sections.length < MAX_SECTIONS) {
    const previd = nextVisibleSection(controller, sections[0]?.getAttribute('data-previd'), -1);
    if (previd && previd !== 'null') controller.load('prev', previd);
  } else if (scrollTop > nodeHeight * 15 && sections.length >= 2
    && leavesBuffer(scrollTop, sections[0], nodeHeight)) {
    trimTop(controller, sections);
  } else if (below > nodeHeight * 15 && sections.length > 4
    && leavesBuffer(below, sections[sections.length - 1], nodeHeight)) {
    sections[sections.length - 1].remove();
  }
}

function isAlreadyLoaded(controller, loadType, sectionid, fragmentid) {
  if (!controller.wrapper.querySelector(`.${sectionid}`)) return false;
  if (loadType === 'text') {
    controller.scrollTo(fragmentid?.trim() ? fragmentid : sectionid);
    controller.locationInfo = null;
    controller.updateLocationInfo();
  }
  return true;
}

function clearDirectional(controller, loadType, epoch) {
  if (loadType !== 'text' && controller.inflightDirectional[loadType] === epoch) {
    controller.inflightDirectional[loadType] = null;
  }
}

function handleError(controller, options, detail) {
  const { loadType, sectionid, epoch } = options;
  clearDirectional(controller, loadType, epoch);
  if (epoch !== controller.loadEpoch || !controller.wrapper || loadType !== 'text') return;
  controller.pendingLoadSectionid = null;
  controller.pendingLoadFragmentid = null;
  if (detail?.message) controller.showLoadError(detail.message);
  else controller.showChapterUnavailable(sectionid);
}

function emitTextLoad(controller, sectionid, fragmentid, content) {
  if (!controller.currentTextInfo) return;
  const type = controller.currentTextInfo.type?.toLowerCase() ?? TEXT_TYPES.BIBLE;
  controller.trigger('globalmessage', {
    type: 'globalmessage', target: controller,
    data: {
      messagetype: 'textload', texttype: type, type,
      textid: controller.currentTextInfo.id, abbr: controller.currentTextInfo.abbr,
      sectionid, fragmentid, content
    }
  });
}

function handleContent(controller, options, content) {
  const { loadType, sectionid, fragmentid, epoch } = options;
  clearDirectional(controller, loadType, epoch);
  if (epoch !== controller.loadEpoch || !controller.wrapper) return;
  let target = fragmentid;
  if (loadType === 'text') {
    target = controller.pendingLoadFragmentid ?? fragmentid;
    controller.pendingLoadSectionid = null;
    controller.pendingLoadFragmentid = null;
  }
  if (isAlreadyLoaded(controller, loadType, sectionid, fragmentid)) return;
  controller.insertContent(loadType, content);
  if (loadType === 'text') {
    if (target) controller.scrollTo(target);
    controller.locationInfo = null;
    controller.updateLocationInfo();
  }
  emitTextLoad(controller, sectionid, fragmentid, content);
  controller.loadMore();
}

function prepareLoad(controller, loadType, sectionid, fragmentid) {
  if (loadType === 'text') {
    if (sectionid === controller.pendingLoadSectionid) {
      controller.pendingLoadFragmentid = fragmentid;
      return null;
    }
    controller.loadEpoch++;
    controller.pendingLoadSectionid = null;
    controller.pendingLoadFragmentid = null;
  } else if (controller.inflightDirectional[loadType] === controller.loadEpoch) {
    return null;
  }
  return controller.loadEpoch;
}

export function load(controller, loadType, sectionid, fragmentid) {
  if (!sectionid || sectionid === 'null' || !controller.wrapper) return;
  const epoch = prepareLoad(controller, loadType, sectionid, fragmentid);
  if (epoch == null || isAlreadyLoaded(controller, loadType, sectionid, fragmentid)) return;
  if (loadType === 'text') {
    controller.pendingLoadSectionid = sectionid;
    controller.pendingLoadFragmentid = fragmentid;
    const message = controller.currentTextInfo?.loadingMessage
      ? `<div class="loading-message">${controller.currentTextInfo.loadingMessage}</div>` : '';
    controller.wrapper.innerHTML = `<div class="loading-indicator" style="height:${controller.nodeElement.offsetHeight}px;">${message}</div>`;
    controller.setScrollTop(0);
  } else {
    controller.inflightDirectional[loadType] = epoch;
  }
  const options = { loadType, sectionid, fragmentid, epoch };
  loadSection(controller.currentTextInfo, sectionid,
    (content) => handleContent(controller, options, content),
    (_textid, _sectionid, detail) => handleError(controller, options, detail));
}

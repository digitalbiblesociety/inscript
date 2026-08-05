import { elem } from '../lib/helpers.esm.js';
import { Reference } from '../bible/BibleReference.js';
import { APOCRYPHAL_BIBLE } from '../bible/BibleData.js';

export function findNearestSection(desired, sections) {
  if (!sections?.length) return null;
  if (sections.includes(desired)) return desired;
  const bookid = desired.substring(0, 2);
  const chapter = parseInt(desired.substring(2), 10) || 1;
  const sameBook = sections.filter((sectionid) => sectionid.startsWith(bookid));
  if (sameBook.length) {
    return sameBook.reduce((best, sectionid) => {
      const distance = Math.abs(parseInt(sectionid.substring(2), 10) - chapter);
      const bestDistance = Math.abs(parseInt(best.substring(2), 10) - chapter);
      return distance < bestDistance ? sectionid : best;
    });
  }
  const desiredIndex = APOCRYPHAL_BIBLE.indexOf(bookid);
  if (desiredIndex === -1) return sections[0];
  return sections.reduce((best, sectionid) => {
    const distance = Math.abs(APOCRYPHAL_BIBLE.indexOf(sectionid.substring(0, 2)) - desiredIndex);
    const bestDistance = Math.abs(APOCRYPHAL_BIBLE.indexOf(best.substring(0, 2)) - desiredIndex);
    return distance < bestDistance ? sectionid : best;
  });
}

export function insertContent(controller, loadType, content) {
  const element = typeof content === 'string' ? null : (content?.nodeType ? content : content?.[0]);
  if (loadType === 'text') {
    controller.wrapper.innerHTML = '';
    controller.setScrollTop(0);
    if (typeof content === 'string') controller.wrapper.innerHTML = content;
    else if (element) controller.wrapper.appendChild(element);
  } else if (loadType === 'next') {
    if (typeof content === 'string') controller.wrapper.insertAdjacentHTML('beforeend', content);
    else if (element) controller.wrapper.appendChild(element);
  } else if (loadType === 'prev') {
    const scrollTop = controller.nodeElement.scrollTop;
    const height = controller.wrapper.offsetHeight;
    if (typeof content === 'string') controller.wrapper.insertAdjacentHTML('afterbegin', content);
    else if (element) controller.wrapper.insertBefore(element, controller.wrapper.firstChild);
    controller.setScrollTop(scrollTop + controller.wrapper.offsetHeight - height);
  }
}

function sectionLabel(controller, sectionid) {
  const reference = Reference(sectionid);
  if (!reference) return sectionid;
  if (controller.currentTextInfo?.lang) reference.language = controller.currentTextInfo.lang;
  return reference.toString() || sectionid;
}

export function showChapterUnavailable(controller, sectionid) {
  if (!controller.wrapper) return;
  const nearest = findNearestSection(sectionid, controller.currentTextInfo?.sections);
  controller.wrapper.innerHTML = '';
  controller.setScrollTop(0);
  const message = elem('p', {
    className: 'chapter-unavailable-message',
    textContent: `${sectionLabel(controller, sectionid)} is not available in this text.`
  });
  const container = elem('div', { className: 'chapter-unavailable' }, message);
  if (nearest && nearest !== sectionid) {
    const link = elem('a', {
      className: 'chapter-unavailable-link', href: '#',
      textContent: `Go to ${sectionLabel(controller, nearest)}`
    });
    link.addEventListener('click', (event) => {
      event.preventDefault();
      controller.load('text', nearest);
    });
    container.appendChild(link);
  }
  controller.wrapper.appendChild(container);
}

export function showLoadError(controller, message) {
  if (!controller.wrapper) return;
  controller.wrapper.innerHTML = '';
  controller.setScrollTop(0);
  controller.wrapper.appendChild(elem('div', { className: 'chapter-unavailable' },
    elem('p', { className: 'chapter-unavailable-message', textContent: message })));
}

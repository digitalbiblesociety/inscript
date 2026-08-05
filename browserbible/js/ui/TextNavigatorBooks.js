import { elem, forceReflow } from '../lib/helpers.esm.js';
import { BOOK_DATA, OT_BOOKS, NT_BOOKS, AP_BOOKS, numbers as bibleNumbers } from '../bible/BibleData.js';
import { getShowApocrypha } from '../bible/Apocrypha.js';
import { i18n } from '../lib/i18n.js';

const TESTAMENT_HEADERS = [
  { books: OT_BOOKS, key: 'ot', i18nKey: 'windows.bible.ot' },
  { books: AP_BOOKS, key: 'ap', i18nKey: 'windows.bible.dc' },
  { books: NT_BOOKS, key: 'nt', i18nKey: 'windows.bible.nt' }
];

function sortDivisionEntries(controller) {
  const groups = { ot: [], ap: [], nt: [], other: [] };
  controller.textInfo.divisions.forEach((divisionid, index) => {
    const entry = { divisionid, index };
    if (OT_BOOKS.includes(divisionid)) groups.ot.push(entry);
    else if (NT_BOOKS.includes(divisionid)) groups.nt.push(entry);
    else if (AP_BOOKS.includes(divisionid)) groups.ap.push(entry);
    else groups.other.push(entry);
  });
  return getShowApocrypha()
    ? [...groups.ot, ...groups.ap, ...groups.nt, ...groups.other]
    : [...groups.ot, ...groups.nt, ...groups.other];
}

function appendTestamentHeader(fragment, divisionid, printed) {
  for (const { books, key, i18nKey } of TESTAMENT_HEADERS) {
    if (books.includes(divisionid) && !printed[key]) {
      fragment.appendChild(elem('div', {
        className: 'text-navigator-division-header', textContent: i18n.t(i18nKey)
      }));
      printed[key] = true;
    }
  }
}

function divisionElement(controller, divisionid, index) {
  const name = controller.textInfo.divisionNames?.[index] ?? null;
  const abbreviation = controller.textInfo.divisionAbbreviations?.[index] ?? null;
  const displayName = controller.fullBookMode
    ? name
    : (abbreviation ?? name ?? '').replace(/\s/i, '').substring(0, 3);
  const chapters = controller.textInfo.sections.filter((code) => code.substring(0, 2) === divisionid);
  return elem('div', {
    className: `text-navigator-division divisionid-${divisionid} division-section-${BOOK_DATA[divisionid]?.section ?? ''}`,
    dataset: { id: divisionid, chapters: chapters.join(','), name }
  }, elem('span', displayName));
}

export function renderDivisions(controller) {
  const fragment = document.createDocumentFragment();
  const printed = { ot: false, nt: false, ap: false };
  controller.fullBookMode = true;
  controller.refs.divisions.classList.toggle('text-navigator-divisions-full', true);
  for (const { divisionid, index } of sortDivisionEntries(controller)) {
    if (!BOOK_DATA[divisionid]) continue;
    appendTestamentHeader(fragment, divisionid, printed);
    fragment.appendChild(divisionElement(controller, divisionid, index));
  }
  controller.refs.divisions.replaceChildren(fragment);
  controller.refs.divisions.style.display = '';
}

function buildChapterElements(controller, chapters) {
  const numbers = controller.textInfo.numbers ?? bibleNumbers.default;
  const fragment = document.createDocumentFragment();
  for (const code of chapters) {
    fragment.appendChild(elem('span', {
      className: `text-navigator-section section-${code}`,
      textContent: numbers[parseInt(code.substring(2), 10)], dataset: { id: code }
    }));
  }
  return fragment;
}

function insertSectionNodes(controller, selected, sections, animated) {
  const label = selected?.querySelector('span');
  if (label) label.parentNode.insertBefore(sections, label.nextSibling);
  const isLast = selected && !selected.nextElementSibling;
  if (animated && !isLast) forceReflow(sections);
  sections.classList.remove('collapsed');
  if (isLast) controller.refs.divisions.scrollTop += 500;
}

export function renderSections(controller, animated) {
  const type = (controller.textInfo.type || 'bible').toLowerCase();
  if (!['bible', 'deafbible', 'videobible', 'commentary'].includes(type)) return;
  const selected = controller.refs.changer.querySelector('.text-navigator-division.selected');
  const chapters = selected?.getAttribute('data-chapters')?.split(',') ?? [];
  const inner = elem('div', { className: 'text-navigator-sections-inner' });
  inner.appendChild(buildChapterElements(controller, chapters));
  const sections = elem('div', { className: 'text-navigator-sections collapsed' }, inner);
  insertSectionNodes(controller, selected, sections, animated);
}

export function handleDivisionClick(controller, division) {
  if (division.classList.contains('selected')) {
    const sections = division.querySelector('.text-navigator-sections');
    if (!sections) division.classList.remove('selected');
    else {
      sections.classList.add('collapsed');
      sections.addEventListener('transitionend', () => division.classList.remove('selected'), { once: true });
    }
    return;
  }
  division.classList.add('selected');
  [...division.parentElement.children].filter((sibling) => sibling !== division)
    .forEach((sibling) => sibling.classList.remove('selected'));
  const before = division.offsetTop;
  const scrollTop = controller.refs.divisions.scrollTop;
  controller.refs.changer.querySelectorAll('.text-navigator-sections').forEach((element) => element.remove());
  const after = division.offsetTop;
  if (before > after) controller.refs.divisions.scrollTop = scrollTop - (before - after);
  controller.renderSections(true);
  controller.setActiveBook(division.dataset.id);
}

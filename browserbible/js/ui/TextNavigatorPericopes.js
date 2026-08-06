import { elem } from '../lib/helpers.esm.js';
import { BOOK_DATA } from '../bible/BibleData.js';
import { loadPericopesByBook, pericopeLocaleFor } from '../bible/Pericopes.js';
import { i18n } from '../lib/i18n.js';

const groupsByLocale = new Map();
const pericopesByLocale = new Map();

export function ensurePericopes(language, onReady) {
  const locale = pericopeLocaleFor(language);
  if (!locale || groupsByLocale.has(locale)) return;
  loadPericopesByBook(language).then((groups) => {
    if (!groups.length) {
      onReady?.();
      return;
    }
    groupsByLocale.set(locale, groups);
    pericopesByLocale.set(locale, new Map(groups.map((group) => [group.bookid, group.pericopes])));
    onReady?.();
  });
}

export function hasPericopeTranslation(controller) {
  return !!pericopeLocaleFor(controller.textInfo?.lang);
}

const groupsFor = controller => groupsByLocale.get(pericopeLocaleFor(controller.textInfo?.lang)) ?? [];
const pericopesFor = controller => pericopesByLocale.get(pericopeLocaleFor(controller.textInfo?.lang));

const availableSection = (controller) => {
  const available = new Set(controller.textInfo?.sections ?? []);
  return available.size ? (sectionid) => available.has(sectionid) : () => true;
};

function pericopeItem(pericope) {
  return elem('div', {
    className: 'peri-item',
    dataset: {
      title: pericope.title.toLowerCase(), section: pericope.sectionid,
      fragment: pericope.fragmentid
    }
  }, elem('span', { className: 'peri-title', textContent: pericope.title }),
  elem('span', { className: 'peri-ref', textContent: `${pericope.chapter}:${pericope.verse}` }));
}

function bookName(controller, bookid) {
  const index = controller.textInfo?.divisions?.indexOf(bookid) ?? -1;
  return controller.textInfo?.divisionNames?.[index] || BOOK_DATA[bookid]?.name || bookid;
}

export function renderActiveBookPassages(controller, bookid) {
  const { periHeader, periList } = controller.refs;
  periHeader.textContent = bookid ? bookName(controller, bookid) : '';
  periList.classList.remove('peri-grouped');
  const available = availableSection(controller);
  const fragment = document.createDocumentFragment();
  for (const pericope of pericopesFor(controller)?.get(bookid) ?? []) {
    if (available(pericope.sectionid)) fragment.appendChild(pericopeItem(pericope));
  }
  periList.replaceChildren(fragment);
}

export function renderSearchResults(controller, query) {
  const { periHeader, periList } = controller.refs;
  periHeader.textContent = i18n.t('windows.search.results') || 'Results';
  periList.classList.add('peri-grouped');
  const available = availableSection(controller);
  const bookIds = new Set();
  const fragment = document.createDocumentFragment();
  for (const { bookid, pericopes } of groupsFor(controller)) {
    if (controller.textInfo?.divisions && !controller.textInfo.divisions.includes(bookid)) continue;
    const displayBookName = bookName(controller, bookid);
    const matches = pericopes.filter((pericope) => available(pericope.sectionid)
      && (displayBookName.toLowerCase().includes(query) || pericope.title.toLowerCase().includes(query)));
    if (!matches.length) continue;
    bookIds.add(bookid);
    const group = elem('div', { className: 'peri-book-group' },
      elem('div', { className: 'peri-book-header', textContent: displayBookName }));
    matches.forEach((pericope) => group.appendChild(pericopeItem(pericope)));
    fragment.appendChild(group);
  }
  periList.replaceChildren(fragment);
  return bookIds;
}

function showOnlyBooks(controller, bookIds) {
  let header = null;
  let headerVisible = false;
  const flush = () => { if (header) header.style.display = headerVisible ? '' : 'none'; };
  for (const child of controller.refs.divisions.children) {
    if (child.classList.contains('text-navigator-division-header')) {
      flush();
      header = child;
      headerVisible = false;
    } else if (child.classList.contains('text-navigator-division')) {
      const visible = bookIds.has(child.dataset.id);
      child.style.display = visible ? '' : 'none';
      if (visible) headerVisible = true;
    }
  }
  flush();
}

export function filterBooks(controller, query) {
  const ids = new Set();
  controller.refs.divisions.querySelectorAll('.text-navigator-division').forEach((division) => {
    const visible = !query || (division.dataset.name || '').toLowerCase().includes(query);
    if (visible) ids.add(division.dataset.id);
  });
  showOnlyBooks(controller, ids);
}

export function applyFilter(controller) {
  const query = controller.refs.filter.value.trim().toLowerCase();
  if (controller.hasPericopeTranslation() && query) {
    showOnlyBooks(controller, controller.renderSearchResults(query));
  } else {
    filterBooks(controller, query);
    if (controller.hasPericopeTranslation()) controller.renderActiveBookPassages(controller.activeBookId);
  }
}

export function highlightCurrentPassage(controller, fragmentid) {
  if (!fragmentid) return;
  const [sectionid, verseText] = fragmentid.split('_');
  const bookid = sectionid.substring(0, 2);
  const chapter = parseInt(sectionid.substring(2), 10);
  const verse = parseInt(verseText || '1', 10) || 1;
  let best = null;
  for (const pericope of pericopesFor(controller)?.get(bookid) ?? []) {
    if (pericope.chapter < chapter || (pericope.chapter === chapter && pericope.verse <= verse)) best = pericope;
    else break;
  }
  if (!best) return;
  const node = controller.refs.periList.querySelector(`.peri-item[data-fragment="${best.fragmentid}"]`);
  if (!node) return;
  controller.refs.periList.querySelectorAll('.peri-item.current')
    .forEach((item) => item.classList.remove('current'));
  node.classList.add('current');
  node.scrollIntoView({ block: 'nearest' });
}

export function setActiveBook(controller, bookid, fragmentid) {
  controller.activeBookId = bookid;
  controller.lastFragmentid = fragmentid ?? null;
  const division = controller.refs.changer.querySelector(`.divisionid-${bookid}`);
  if (division) {
    controller.refs.divisions.scrollTop = Math.max(0,
      division.offsetTop - controller.refs.divisions.offsetTop - 8);
  }
  if (!controller.hasPericopeTranslation() || controller.refs.filter.value.trim()) return;
  controller.renderActiveBookPassages(bookid);
  controller.refs.periList.scrollTop = 0;
  if (fragmentid) controller.highlightCurrentPassage(fragmentid);
}

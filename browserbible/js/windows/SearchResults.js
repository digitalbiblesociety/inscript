import { BOOK_DATA, OT_BOOKS, NT_BOOKS, APOCRYPHAL_BIBLE } from '../bible/BibleData.js';
import { Reference } from '../bible/BibleReference.js';

export function determineBookList(component, isLemmaSearch) {
  if (isLemmaSearch) {
    const prefix = component.refs.input.value.slice(0, 1);
    if (prefix === 'G') return NT_BOOKS;
    if (prefix === 'H') return OT_BOOKS;
  }
  return component.state.textInfo.divisions;
}

export function formatResultLabel(component, fragmentid, short) {
  if (component.state.textInfo.type.toLowerCase() !== 'bible') return fragmentid;
  const reference = Reference(fragmentid);
  if (!reference?.isValid()) return fragmentid;
  const language = component.state.textInfo.lang;
  if (BOOK_DATA.GN.names[language]) reference.language = language;
  return short ? reference.toShortString() : reference.toString();
}

function countByDivision(results, bookList) {
  const counts = Object.fromEntries(bookList.map((book) => [book, 0]));
  for (const result of results) {
    const book = result.fragmentid.slice(0, 2);
    counts[book] = (counts[book] || 0) + 1;
  }
  return counts;
}

function buildResultsHtml(component, results, divisionCount) {
  let html = '';
  const langCode = component.state.textInfo.lang ?? 'en';
  const emittedBooks = new Set();
  for (const result of results) {
    const bookCode = result.fragmentid.slice(0, 2);
    if (!emittedBooks.has(bookCode)) {
      emittedBooks.add(bookCode);
      const bookInfo = BOOK_DATA[bookCode];
      const bookName = bookInfo?.names?.[langCode]?.[0] ?? bookInfo?.names?.eng?.[0] ?? bookCode;
      html += `<div class="search-result-book-header divisionid-${bookCode}">${component.escapeHtml(bookName)} <span class="search-result-book-count">${divisionCount[bookCode]}</span></div>`;
    }
    const label = component.formatResultLabel(result.fragmentid, true);
    html += `<div data-fragmentid="${result.fragmentid}" class="search-result-row divisionid-${bookCode}"><span class="search-result-ref">${label}</span><span class="search-result-text" lang="${langCode}">${result.html}</span></div>`;
  }
  return html;
}

export function renderSearchResults(component, sourceResults) {
  const order = Object.fromEntries(APOCRYPHAL_BIBLE.map((book, index) => [book, index]));
  const byBookOrder = (a, b) => (order[a] ?? 999) - (order[b] ?? 999);
  const bookList = determineBookList(component, component.state.isLemmaSearch).slice().sort(byBookOrder);
  const results = [...sourceResults].sort((a, b) => byBookOrder(a.fragmentid.slice(0, 2), b.fragmentid.slice(0, 2)));
  const divisionCount = countByDivision(results, bookList);
  component.refs.resultsBlock.innerHTML = buildResultsHtml(component, results, divisionCount);
  component.refs.resultsBlock.querySelectorAll('.v-num').forEach((element) => element.remove());
  component.highlightResultsText();
  component.renderResultsVisual(divisionCount, bookList);
  component.refs.resultsBlock.style.setProperty('--search-top-height', `${component.refs.topBlock.offsetHeight}px`);
  if (component.state.isLemmaSearch) {
    component.renderLemmaInfo();
    component.renderUsage();
  }
  component.createHighlights();
}

export function renderUsage(component) {
  const counts = new Map();
  component.refs.resultsBlock.querySelectorAll('.search-result-row').forEach((row) => {
    const phrase = (row.querySelector('.highlight')?.textContent ?? '')
      .replace(/\b(with|or|and|if|a|the|in|a|by|of|for)\b/gi, '').trim();
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  });
  const usage = [...counts].map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count);
  component.refs.topUsage.innerHTML = usage
    .map((item) => `${component.escapeHtml(item.text)} (${item.count})`).join(', ');
  component.refs.topUsage.style.display = 'block';
}

export function renderResultsVisual(component, divisionCount, bookList) {
  const width = 100 / bookList.length;
  const baseHeight = 2;
  const maxHeight = 38;
  const maxCount = Math.max(...bookList.map((book) => divisionCount[book]));
  component.refs.topVisual.innerHTML = bookList.map((book) => {
    const count = divisionCount[book];
    const height = maxHeight * count / maxCount + baseHeight;
    const top = maxHeight + baseHeight - height;
    return `<span class="search-result-book-bar ${book}" data-count="${count}" data-id="${book}" style="width:${width}%;"><span class="divisionid-${book}" style="height:${height}px; margin-top: ${top}px;"></span></span>`;
  }).join('');
  component.refs.topVisual.appendChild(component.refs.topVisualLabel);
  component.refs.topVisual.style.display = '';
}

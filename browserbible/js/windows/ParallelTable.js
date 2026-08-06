import { i18n } from '../lib/i18n.js';
import { toBcp47Lang } from '../lib/bcp47.js';
import { getBookName } from './ParallelReferences.js';

function createHeader(component, data) {
  return [
    `<h1>${component.escapeHtml(data.title)}</h1>`,
    `<p class="parallel-description">${data.description ?? ''}</p>`,
    '<div class="parallels-buttons">',
    `<button type="button" class="parallel-show-all">${i18n.t('windows.parallel.showall')}</button>`,
    `<button type="button" class="parallel-hide-all">${i18n.t('windows.parallel.hideall')}</button>`,
    '</div>'
  ];
}

function createPassageCells(component, row, style) {
  const books = row.books ?? component.state.currentParallelData.books;
  const lang = toBcp47Lang(component.state.currentTextInfo?.lang) ?? '';
  return row.passages.map((passage, index) => {
    if (passage === null) return `<td class="parallel-passage" ${style}>-</td>`;
    const bookName = getBookName(component.state.currentTextInfo, books[index]);
    return `<td class="parallel-passage" ${style} lang="${lang}">${component.escapeHtml(bookName)} ${component.escapeHtml(passage)}</td>`;
  });
}

function createTextCells(component, row) {
  const books = row.books ?? component.state.currentParallelData.books;
  const lang = toBcp47Lang(component.state.currentTextInfo?.lang) ?? '';
  return row.passages.map((passage, index) => passage === null
    ? '<td></td>'
    : `<td class="reading-text" data-bookid="${component.escapeHtml(books[index])}" data-passage="${component.escapeHtml(passage)}" lang="${lang}"></td>`
  );
}

function createRows(component, style) {
  const rows = [];
  const data = component.state.currentParallelData;
  for (const row of data.parallels) {
    if (row.sectionTitle !== undefined) {
      rows.push(`<tr><th class="section-title" colspan="${data.books.length + 1}">${component.escapeHtml(row.sectionTitle)}</th></tr>`);
      continue;
    }
    rows.push(`<tr class="parallel-entry-header"><th class="parallel-title" ${style}>${component.escapeHtml(row.title)}</th>`);
    rows.push(...createPassageCells(component, row, style), '</tr>');
    rows.push('<tr class="parallel-entry-text parallel-entry-text-collapsed"><th></th>');
    rows.push(...createTextCells(component, row), '</tr>');
  }
  return rows;
}

export function renderParallelTable(component) {
  const data = component.state.currentParallelData;
  const html = createHeader(component, data);
  html.push(`<table dir="${component.state.currentTextInfo?.dir ?? 'ltr'}">`);
  const style = ` style="width: ${100 / (data.books.length + 1)}%"`;
  html.push('<tbody>', ...createRows(component, style), '</tbody>');
  html.push('</table>');
  component.refs.main.innerHTML = html.join('');
}

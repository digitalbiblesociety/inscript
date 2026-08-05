import { BOOK_DATA } from '../bible/BibleData.js';
import { displayAbbr } from '../texts/TextLoader.js';
import { diffWords } from '../lib/SimpleDiff.js';
import { extractPlainText } from './TextComparisonData.js';

function generateDiffHtml(baseText, comparisonText) {
  let html = '';
  for (const part of diffWords(baseText, comparisonText)) {
    if (part.added) html += `<ins>${part.value}</ins>`;
    else if (part.removed) html += `<del>${part.value}</del>`;
    else html += part.value;
  }
  return html;
}

function renderVerseRow(textData, verse) {
  const baseVerseId = `${textData[0].sectionId}_${verse}`;
  const baseText = extractPlainText(textData[0].content, baseVerseId);
  let html = `<tr><th>${verse}</th>`;
  html += `<td class="reading-text" style="width:${100 / textData.length}%">${baseText}</td>`;
  for (let index = 1; index < textData.length; index++) {
    const comparisonText = extractPlainText(textData[index].content, `${textData[index].sectionId}_${verse}`);
    html += `<td class="reading-text" style="width:${100 / textData.length}%">${generateDiffHtml(baseText, comparisonText)}</td>`;
  }
  return html + '</tr>';
}

export function renderComparison(component, textData) {
  const reference = component.state.currentReference;
  const headers = textData.map(({ textInfo }) => `<th>${displayAbbr(textInfo)}</th>`).join('');
  let html = `<table class="comparison-table section"><thead><tr><th></th>${headers}</tr></thead><tbody>`;
  const startVerse = reference.verse1 > 0 ? reference.verse1 : 1;
  const endVerse = reference.verse2 > 0
    ? reference.verse2
    : BOOK_DATA[reference.bookid].chapters[reference.chapter1 - 1];
  for (let verse = startVerse; verse <= endVerse; verse++) {
    html += renderVerseRow(textData, verse);
  }
  component.refs.main.innerHTML = html + '</tbody></table>';
}

import { loadSection } from '../texts/TextLoader.js';
import { parsePassageReference } from './ParallelReferences.js';

const loadSectionAsync = (textInfo, sectionid) => new Promise((resolve, reject) => {
  loadSection(textInfo, sectionid, resolve, reject);
});

function prepareContentElement(content) {
  let element = content;
  if (typeof content === 'string') {
    element = document.createElement('div');
    element.innerHTML = content;
  }
  element.querySelectorAll('.cf,.note').forEach((item) => item.remove());
  return element;
}

function appendVerseNodes(cell, content, fragmentids) {
  for (const fragmentid of fragmentids) {
    const verse = content.querySelector(`.v[data-id="${fragmentid}"]`);
    if (!verse) continue;
    const verseNumber = verse.previousElementSibling;
    if (verseNumber?.classList.contains('v-num')) cell.appendChild(verseNumber.cloneNode(true));
    cell.appendChild(verse.cloneNode(true));
  }
}

export async function processParallelCell(component, cell, generation) {
  cell.closest('tr')?.classList.remove('parallel-entry-text-collapsed');
  if (cell.classList.contains('parallel-text-loaded')) return;
  const bookid = cell.getAttribute('data-bookid');
  const passage = cell.getAttribute('data-passage');
  if (!bookid || !passage) return;
  cell.innerHTML = '';
  let hadError = false;
  for (const { sectionid, fragmentids } of parsePassageReference(passage, bookid)) {
    try {
      const content = await loadSectionAsync(component.state.currentTextInfo, sectionid);
      if (generation !== component._loadGeneration || !cell.isConnected) return;
      appendVerseNodes(cell, prepareContentElement(content), fragmentids);
    } catch {
      hadError = true;
    }
  }
  if (!hadError || cell.childNodes.length > 0) cell.classList.add('parallel-text-loaded');
}

export async function loadParallelCells(component, cells) {
  const generation = component._loadGeneration;
  for (const cell of cells) {
    if (generation !== component._loadGeneration) return;
    await processParallelCell(component, cell, generation);
  }
}

import { getText, loadSection } from '../texts/TextLoader.js';

const getTextAsync = (textId) => new Promise((resolve, reject) => {
  getText(textId, resolve, reject);
});
const loadSectionAsync = (textInfo, sectionId) => new Promise((resolve, reject) => {
  loadSection(textInfo, sectionId, resolve, reject);
});

function contentElement(content) {
  if (typeof content !== 'string') return content?.nodeType ? content : content?.[0];
  const wrapper = document.createElement('div');
  wrapper.innerHTML = content;
  return wrapper;
}

function hasVerses(content, sectionId) {
  const element = contentElement(content);
  if (!element) return false;
  return !!(
    element.querySelector(`.${sectionId}_1`) ||
    element.querySelector(`.v.${sectionId}_1`) ||
    element.querySelector(`[class*="${sectionId}_"]`)
  );
}

export async function loadComparisonText(textId, sectionId) {
  try {
    const textInfo = await getTextAsync(textId);
    const content = await loadSectionAsync(textInfo, sectionId);
    const actualSectionId = contentElement(content)?.querySelector('.section')?.getAttribute('data-id') || sectionId;
    return hasVerses(content, actualSectionId)
      ? { textInfo, content, sectionId: actualSectionId }
      : null;
  } catch (error) {
    console.error(`Failed to load ${textId}:`, error);
    return null;
  }
}

export function extractPlainText(content, verseId) {
  const element = contentElement(content);
  let plainText = '';
  for (const verse of element.querySelectorAll(`.${verseId}`)) {
    const clone = verse.cloneNode(true);
    clone.querySelectorAll('.note, .cf, .v-num, .verse-num').forEach((item) => item.remove());
    plainText += `${clone.innerHTML.replace(/<[^>]+>/gi, '').replace(/¶/g, '')} `;
  }
  return plainText.replace(/\s+/g, ' ').trim();
}

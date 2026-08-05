import { escapeRegExp, highlightTextMatches } from '../lib/textHighlighter.js';
import { tokenizeWords, wordKey } from '../lib/stopwords.js';

export function removeStatisticHighlights() {
  document.querySelectorAll('.BibleWindow .highlight-stats').forEach((element) => {
    if (element.tagName.toLowerCase() === 'l') {
      element.classList.remove('highlight', 'highlight-stats', 'lemma-highlight');
    } else {
      const textFragment = document.createTextNode(element.textContent);
      element.parentNode?.replaceChild(textFragment, element);
    }
  });
}

export function createStatisticHighlights(component, wordInfo) {
  removeStatisticHighlights();

  const { lang } = component.state.textInfo ?? {};

  document.querySelectorAll(`.${component.state.sectionid}`).forEach((element) => {
    const lemmaElements = element.querySelectorAll('l');

    if (lemmaElements.length) {
      lemmaElements.forEach((lemmaElement) => {
        const matches = tokenizeWords(lemmaElement.textContent, lang)
          .some((token) => wordKey(token) === wordInfo.key);
        if (matches) {
          lemmaElement.classList.add('highlight', 'highlight-stats', 'lemma-highlight');
        }
      });
    } else {
      const regexp = new RegExp(`\\b${escapeRegExp(wordInfo.word)}\\b`, 'gi');
      highlightTextMatches(element, [regexp], 'highlight highlight-stats');
    }
  });

  return document.querySelector('.BibleWindow .highlight-stats');
}

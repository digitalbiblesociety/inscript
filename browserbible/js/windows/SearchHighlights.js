import { SearchTools } from '../texts/Search.js';
import { highlightTextMatches } from '../lib/textHighlighter.js';

export function highlightLemmaWords(component, root) {
  const regexps = SearchTools.createLemmaHighlightRegExps(component.refs.input.value);
  if (!regexps.length) return;
  root.querySelectorAll('l[s]').forEach((element) => {
    const strongs = element.getAttribute('s') || '';
    if (regexps.some((regexp) => regexp.test(strongs))) element.classList.add('highlight');
  });
}

export function highlightResultsText(component) {
  const results = component.refs.resultsBlock.querySelectorAll('.search-result-text');
  if (component.state.isLemmaSearch) {
    results.forEach((element) => highlightLemmaWords(component, element));
    return;
  }
  if (!component.state.searchTermsRegExp?.length) return;
  results.forEach((element) => highlightTextMatches(element, component.state.searchTermsRegExp));
}

export function removeSearchHighlights() {
  document.querySelectorAll('.BibleWindow .highlight').forEach((element) => {
    if (element.tagName.toLowerCase() === 'l') {
      element.className = element.className.replace(/highlight/gi, '');
      return;
    }
    element.parentNode?.replaceChild(document.createTextNode(element.textContent), element);
  });
}

export function createSearchHighlights(component) {
  if (component.state.currentResults == null) return;
  removeSearchHighlights();
  for (const result of component.state.currentResults) {
    document.querySelectorAll(`.${CSS.escape(result.fragmentid)}`).forEach((element) => {
      if (component.state.isLemmaSearch) highlightLemmaWords(component, element);
      else highlightTextMatches(element, component.state.searchTermsRegExp);
    });
  }
}

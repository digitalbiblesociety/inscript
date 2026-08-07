import { highlightTextMatches } from '../lib/textHighlighter.js';

/**
 * Tests one verse's html against the search terms and, for non-lemma matches,
 * returns the html with matches highlighted.
 */
export function findVerseMatches(html, { searchTermsRegExp, isLemmaSearch, searchType }) {
  let processedHtml = html;
  let foundMatch = false;

  // No terms matches nothing: an AND search over an empty term list would
  // otherwise report every verse as a match.
  if (!searchTermsRegExp || searchTermsRegExp.length === 0) {
    return { html: processedHtml, foundMatch: false };
  }

  const regMatches = new Array(searchTermsRegExp.length);

  const temp = document.createElement('div');
  temp.innerHTML = html;
  const text = temp.textContent;

  for (let j = 0, jl = searchTermsRegExp.length; j < jl; j++) {
    searchTermsRegExp[j].lastIndex = 0;

    if (isLemmaSearch) {
      if (searchTermsRegExp[j].test(processedHtml)) {
        regMatches[j] = true;
        foundMatch = true;
      }
    } else {
      if (searchTermsRegExp[j].test(text)) {
        regMatches[j] = true;
        foundMatch = true;
      }
      searchTermsRegExp[j].lastIndex = 0;
    }
  }

  if (searchType === 'AND') {
    let foundAll = true;
    for (const match of regMatches) {
      if (match !== true) {
        foundAll = false;
        break;
      }
    }
    foundMatch = foundAll;
  }

  if (foundMatch && !isLemmaSearch) {
    highlightTextMatches(temp, searchTermsRegExp);
    processedHtml = temp.innerHTML;
  }

  return { html: processedHtml, foundMatch };
}

function buildSectionDom(content) {
  const temp = document.createElement('div');
  if (typeof content === 'string') {
    temp.innerHTML = content;
  } else {
    const contentEl = content?.nodeType ? content : content?.[0];
    if (contentEl) temp.appendChild(contentEl.cloneNode(true));
  }
  return temp;
}

function extractFragmentHtml(temp, fragmentid) {
  const fragmentNodes = temp.querySelectorAll(`.${fragmentid}`);
  let html = '';

  fragmentNodes.forEach(el => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.note, .cf, .v-num, .verse-num').forEach(note => {
      note.parentNode.removeChild(note);
    });
    html += `${clone.innerHTML} `;
  });

  return { html, found: fragmentNodes.length > 0 };
}

/** Collects the matching fragments of one loaded section as result entries. */
export function collectSectionResults(content, fragmentids, matchOptions) {
  const results = [];
  const temp = buildSectionDom(content);

  for (const fragmentid of fragmentids) {
    const fragment = extractFragmentHtml(temp, fragmentid);
    if (!fragment.found) continue;

    const result = findVerseMatches(fragment.html, matchOptions);
    if (result.foundMatch) {
      results.push({ fragmentid, html: result.html });
    }
  }

  return results;
}

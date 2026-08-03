/**
 * ESV Text Provider
 * Loads the English Standard Version from Crossway's ESV API (api.esv.org).
 *
 */

import { getConfig } from '../core/config.js';
import { processTexts } from './TextLoader.js';
import { SearchTools } from './Search.js';
import { BOOK_DATA, DEFAULT_BIBLE } from '../bible/BibleData.js';
import { toBcp47Lang } from '../lib/bcp47.js';

const providerName = 'esv';
const fullName = 'ESV API';

const TEXT_ID = 'ESV';
const LOADING_MESSAGE = 'Loading from the ESV API…';
const LIMIT_MESSAGE = 'The ESV API request limit has been reached. Please try again later.';
const ESV_BOOK_NAMES = { PS: 'Psalms', SS: 'Song of Solomon' };

const bookName = (bookid) => ESV_BOOK_NAMES[bookid] ?? BOOK_DATA[bookid]?.names?.eng?.[0] ?? BOOK_DATA[bookid]?.name;

let textData = [];
let textDataIsLoaded = false;

const isEnabled = (config) =>
  config.enableOnlineSources && config.esvEnabled && !!config.esvProxyBase;

const getProviderid = (textid) => {
  const parts = textid.split(':');
  return `${providerName}:${parts.length > 1 ? parts[1] : parts[0]}`;
};

const getTextInfoSync = (textid) => {
  const providerid = getProviderid(textid);
  return textData.find(text => text.providerid === providerid);
};

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const SKIPPED_INLINE = ['footnote', 'crossref', 'audio', 'extra_text', 'copyright'];
// Passage reference headings, footnote blocks and audio links are turned
// off in the request; drop any that show up anyway.
const SKIPPED_BLOCK = ['extra_text', 'footnotes', 'audio'];
const hasSkippedClass = (cls, skipList) => skipList.some(c => cls.contains(c));

// Inline styling wrappers as [open, close] pairs; "small-caps" marks the
// divine name and .nog is the app's small-caps style.
const WRAP_WOC = ['<span class="woc">', '</span>'];
const WRAP_NOG = ['<span class="nog">', '</span>'];
const WRAP_ITALIC = ['<i>', '</i>'];

const inlineWrapper = (node, cls) => {
  if (cls.contains('woc')) return WRAP_WOC;
  if (cls.contains('small-caps')) return WRAP_NOG;
  if (node.tagName === 'I' || node.tagName === 'EM') return WRAP_ITALIC;
  return null;
};

export function parseEsvPassageHtml(passageHtml, sectionid) {
  const doc = new DOMParser().parseFromString(passageHtml, 'text/html');
  const html = [];
  let openVerse = false;
  let currentVerseNum = null;

  const closeVerse = () => {
    if (openVerse) {
      html.push('</span>');
      openVerse = false;
    }
  };

  const openVerseSpan = () => {
    html.push(`<span class="v ${sectionid}_${currentVerseNum}" data-id="${sectionid}_${currentVerseNum}">`);
    openVerse = true;
  };

  const ensureVerseOpen = () => {
    if (openVerse) return;
    if (currentVerseNum == null) currentVerseNum = '1';
    openVerseSpan();
  };

  const markerVerseNum = (el) => {
    const raw = el.textContent.replace(/\u00a0/g, ' ').trim();
    return raw.includes(':') ? raw.split(':').pop() : raw;
  };

  const isVerseMarker = (el) =>
    el.tagName === 'B' && (el.classList.contains('verse-num') || el.classList.contains('chapter-num'));

  const verseNumHtml = () =>
    `<span class="v-num v-${currentVerseNum}">${escapeHtml(currentVerseNum)}&nbsp;</span>`;

  const inlineText = (text) => {
    if (!text) return;
    if (!openVerse && text.trim() === '') return;
    ensureVerseOpen();
    html.push(escapeHtml(text));
  };

  const walkInline = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      inlineText(node.nodeValue ?? '');
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const cls = node.classList;
    if (hasSkippedClass(cls, SKIPPED_INLINE)) return;
    if (node.tagName === 'BR') return;

    if (isVerseMarker(node)) {
      closeVerse();
      currentVerseNum = markerVerseNum(node);
      html.push(verseNumHtml());
      openVerseSpan();
      return;
    }

    // Wrapped inline content keeps its styling span; any other inline tag
    // (anchors, spans) keeps its content and drops the tag.
    const [open, close] = inlineWrapper(node, cls) ?? [];
    if (open) {
      ensureVerseOpen();
      html.push(open);
    }
    for (const child of node.childNodes) walkInline(child);
    if (close) html.push(close);
  };

  // Poetry: <p class="line-group"> holds <span class="line"> / <span
  // class="indent line"> runs with verse-num markers between them. Each line
  // becomes its own q/q2 div; a marker before a line is buffered so the number
  // renders inside that line's div.
  const walkLineGroup = (el) => {
    closeVerse();
    let pendingVerseNum = '';

    const renderLine = (line) => {
      html.push(`<div class="${line.classList.contains('indent') ? 'q2' : 'q'}">`);
      if (pendingVerseNum) {
        html.push(pendingVerseNum);
        pendingVerseNum = '';
      }
      for (const lineChild of line.childNodes) walkInline(lineChild);
      closeVerse();
      html.push('</div>');
    };

    for (const child of el.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE && isVerseMarker(child)) {
        closeVerse();
        currentVerseNum = markerVerseNum(child);
        pendingVerseNum += verseNumHtml();
        continue;
      }

      if (child.nodeType === Node.ELEMENT_NODE && child.classList.contains('line')) {
        renderLine(child);
        continue;
      }

      walkInline(child);
    }
  };

  const pushHeading = (node, className) => {
    closeVerse();
    const title = node.textContent.trim();
    if (title) html.push(`<div class="${className}">${escapeHtml(title)}</div>`);
  };

  const walkParagraph = (node) => {
    closeVerse();
    html.push('<div class="p">');
    for (const child of node.childNodes) walkInline(child);
    closeVerse();
    html.push('</div>');
  };

  const walkBlock = (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    const cls = node.classList;

    if (hasSkippedClass(cls, SKIPPED_BLOCK)) return;

    if (tag === 'H3') {
      pushHeading(node, 's');
      return;
    }

    if (cls.contains('psalm-title') || tag === 'H4') {
      pushHeading(node, 'd');
      return;
    }

    if (tag === 'P' && cls.contains('line-group')) {
      walkLineGroup(node);
      return;
    }

    if (tag === 'P') {
      if (!node.querySelector('a.copyright')) walkParagraph(node);
      return;
    }

    // block-indent and any other wrapper: recurse into its children.
    walkBlocks(node.childNodes);
  };

  const walkBlocks = (nodes) => {
    for (const node of nodes) walkBlock(node);
  };

  walkBlocks(doc.body.childNodes);
  closeVerse();
  return html.join('');
}

const ABOUT_HTML = `<div class="about-text">
  <h1>English Standard Version</h1>
  <p class="about-language">English</p>
  <p class="about-copyright">The Holy Bible, English Standard Version® (ESV®), copyright © 2001 by Crossway,
  a publishing ministry of Good News Publishers. Used by permission. All rights reserved.
  ESV Text Edition: 2016.</p>
  <p class="about-source">Provided through the <a href="https://api.esv.org" target="_blank" rel="noopener">ESV API</a> by Crossway.</p>
</div>`;

function buildManifest() {
  return [{
    type: 'bible',
    id: TEXT_ID,
    name: 'English Standard Version',
    nameEnglish: 'English Standard Version',
    abbr: 'ESV',
    lang: 'eng',
    langName: 'English',
    langNameEnglish: 'English',
    dir: 'ltr',
    loadingMessage: LOADING_MESSAGE
  }];
}

function addStaticStructure(info) {
  info.divisions = [];
  info.divisionNames = [];
  info.sections = [];

  for (const bookid of DEFAULT_BIBLE) {
    info.divisions.push(bookid);
    info.divisionNames.push(bookName(bookid));

    const chapterCount = BOOK_DATA[bookid].chapters.length;
    for (let chapter = 1; chapter <= chapterCount; chapter++) {
      info.sections.push(`${bookid}${chapter}`);
    }
  }

  info.aboutHtml = ABOUT_HTML;
}

function getTextManifest(callback) {
  const config = getConfig();

  if (!isEnabled(config)) {
    callback(null);
    return;
  }

  if (textDataIsLoaded) {
    callback(textData);
    return;
  }

  textData = buildManifest();
  processTexts(textData, providerName);
  textDataIsLoaded = true;

  callback(textData);
}

function getTextInfo(textid, callback) {
  const config = getConfig();

  if (!isEnabled(config)) {
    callback(null);
    return;
  }

  if (!textDataIsLoaded) {
    getTextManifest(() => getTextInfo(textid, callback));
    return;
  }

  const info = getTextInfoSync(textid);

  if (!info) {
    callback(null);
    return;
  }

  if (!info.divisions?.length) {
    addStaticStructure(info);
  }

  callback(info);
}

const PASSAGE_PARAMS = 'include-passage-references=false' +
  '&include-verse-numbers=true' +
  '&include-first-verse-numbers=true' +
  '&include-chapter-numbers=false' +
  '&include-footnotes=false' +
  '&include-footnote-body=false' +
  '&include-headings=true' +
  '&include-short-copyright=false' +
  '&include-audio-link=false' +
  '&include-css-link=false';

function loadSection(textid, sectionid, callback, errorCallback) {
  const config = getConfig();

  getTextInfo(textid, (textinfo) => {
    if (!textinfo) {
      errorCallback?.(textid, sectionid);
      return;
    }

    const bookid = sectionid.substring(0, 2);
    const chapter = sectionid.substring(2);
    const bookData = BOOK_DATA[bookid];

    if (!bookData || !textinfo.sections.includes(sectionid)) {
      errorCallback?.(textid, sectionid);
      return;
    }

    const lang = textinfo.lang;
    const dir = textinfo.dir ?? 'ltr';
    const sectionIndex = textinfo.sections.indexOf(sectionid);
    const previd = sectionIndex > 0 ? textinfo.sections[sectionIndex - 1] : null;
    const nextid = sectionIndex < textinfo.sections.length - 1
      ? textinfo.sections[sectionIndex + 1]
      : null;

    const q = encodeURIComponent(`${bookName(bookid)} ${chapter}`);
    const url = `${config.esvProxyBase}/passage/html/?q=${q}&${PASSAGE_PARAMS}`;

    fetch(url)
      .then(response => {
        if (response.status === 429) throw new Error('rate_limited');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(json => {
        const passage = json?.passages?.[0];
        if (typeof passage !== 'string' || passage === '') {
          errorCallback?.(textid, sectionid);
          return;
        }

        const html = [];

        html.push(`<div class="section chapter ${textid} ${bookid} ${sectionid} ${lang}" ` +
          ` data-textid="${textid}"` +
          ` data-id="${sectionid}"` +
          ` data-nextid="${nextid}"` +
          ` data-previd="${previd}"` +
          ` lang="${toBcp47Lang(lang)}"` +
          ` data-lang3="${lang}"` +
          ` dir="${dir}"` +
          `>`);

        if (chapter === '1') {
          html.push(`<div class="mt">${escapeHtml(bookName(bookid))}</div>`);
        }

        html.push(`<div class="c">${chapter}</div>`);
        html.push(parseEsvPassageHtml(passage, sectionid));
        html.push('</div>');

        callback(html.join(''));
      })
      .catch((e) => {
        errorCallback?.(textid, sectionid, e?.message === 'rate_limited' ? { message: LIMIT_MESSAGE } : undefined);
      });
  });
}

// "1 Samuel" / "Psalm" / "Song of Solomon" (any BibleData english alias) -> DBS code.
let bookNameToCode = null;
const getBookCode = (name) => {
  if (!bookNameToCode) {
    bookNameToCode = new Map();
    for (const bookid of DEFAULT_BIBLE) {
      for (const alias of BOOK_DATA[bookid].names?.eng ?? []) {
        bookNameToCode.set(alias.toLowerCase(), bookid);
      }
      bookNameToCode.set(bookName(bookid).toLowerCase(), bookid);
    }
  }
  return bookNameToCode.get(name.toLowerCase());
};

const highlightWords = (text, searchTermsRegExp) => {
  let processedHtml = escapeHtml(text);

  for (const regex of searchTermsRegExp) {
    regex.lastIndex = 0;
    processedHtml = processedHtml.replace(regex, match => `<span class="highlight">${match}</span>`);
  }

  return processedHtml;
};

const SEARCH_PAGE_SIZE = 100;
const SEARCH_MAX_PAGES = 20;

function startSearch(textid, divisions, text, onSearchLoad, onSearchIndexComplete, onSearchComplete) {
  const config = getConfig();
  const info = getTextInfoSync(textid);

  const e = {
    type: 'complete',
    target: this,
    data: {
      results: [],
      searchIndexesData: [],
      searchTermsRegExp: SearchTools.createSearchTerms(text, false),
      isLemmaSearch: false
    }
  };

  if (!info) {
    onSearchComplete(e);
    return;
  }

  const query = encodeURIComponent(text).replace(/%20/g, '+');

  const addResults = (results) => {
    for (const result of results) {
      const match = /^(.+?)\s+(\d+):(\d+)/.exec(result.reference ?? '');
      if (!match) continue;

      const bookCode = getBookCode(match[1]);
      if (!bookCode) continue;

      e.data.searchTermsRegExp[0].lastIndex = 0;
      const hasMatch = e.data.searchTermsRegExp[0].test(result.content);

      if (hasMatch && (divisions.length === 0 || divisions.includes(bookCode))) {
        e.data.results.push({
          fragmentid: `${bookCode}${match[2]}_${match[3]}`,
          html: highlightWords(result.content, e.data.searchTermsRegExp)
        });
      }
    }
  };

  const fetchPage = (page) => {
    const url = `${config.esvProxyBase}/passage/search/?q=${query}&page-size=${SEARCH_PAGE_SIZE}&page=${page}`;

    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        addResults(data?.results ?? []);

        const totalPages = data?.total_pages ?? 1;
        if (page < totalPages && page < SEARCH_MAX_PAGES) {
          fetchPage(page + 1);
        } else {
          onSearchComplete(e);
        }
      })
      .catch(() => {
        onSearchComplete(e);
      });
  };

  fetchPage(1);
}

export const EsvTextProvider = {
  name: providerName,
  fullName,
  getTextManifest,
  getTextInfo,
  loadSection,
  startSearch
};

/**
 * ESV Text Provider
 * Loads the English Standard Version from Crossway's ESV API (api.esv.org).
 *
 */

import { getConfig } from '../core/config.js';
import { processTexts } from './TextLoader.js';
import { BOOK_DATA, DEFAULT_BIBLE } from '../bible/BibleData.js';
import { parseEsvPassageHtml, renderEsvSection } from './EsvPassageParser.js';
import { createEsvSearchStarter } from './EsvSearch.js';

export { parseEsvPassageHtml };

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

        callback(renderEsvSection({
          passage,
          textid,
          sectionid,
          bookid,
          chapter,
          lang: textinfo.lang,
          dir: textinfo.dir ?? 'ltr',
          previd,
          nextid,
          bookTitle: bookName(bookid)
        }));
      })
      .catch((e) => {
        errorCallback?.(textid, sectionid, e?.message === 'rate_limited' ? { message: LIMIT_MESSAGE } : undefined);
      });
  });
}

const startSearch = createEsvSearchStarter({ getTextInfoSync, bookName });

export const EsvTextProvider = {
  name: providerName,
  fullName,
  getTextManifest,
  getTextInfo,
  loadSection,
  startSearch
};

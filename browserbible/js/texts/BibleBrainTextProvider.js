import { getConfig } from '../core/config.js';
import { processTexts } from './TextLoader.js';
import {
  BOOK_DATA,
  DEFAULT_BIBLE,
  DEFAULT_BIBLE_USFM,
  APOCRYPHAL_BIBLE,
  APOCRYPHAL_BIBLE_USFM
} from '../bible/BibleData.js';
import {
  filesetCoversTestament,
  selectTextFileset,
  flattenFilesets,
  selectFilesets,
  entryToTextInfo,
  fetchAllBibles,
  normalizeChapters,
  buildStructureFromBooks,
  versesToHtml
} from './BibleBrainCatalog.js';
import { extractSearchVerses, createBibleBrainSearchStarter } from './BibleBrainSearch.js';

export {
  filesetCoversTestament,
  selectTextFileset,
  flattenFilesets,
  selectFilesets,
  entryToTextInfo,
  normalizeChapters,
  versesToHtml,
  extractSearchVerses
};

const providerName = 'biblebrain';
const fullName = 'Bible Brain (Faith Comes By Hearing)';

let textData = [];
let textDataIsLoaded = false;
let textDataIsLoading = false;
let textDataCallbacks = [];

const finish = () => {
  textDataIsLoading = false;
  textDataIsLoaded = true;
  while (textDataCallbacks.length > 0) {
    textDataCallbacks.pop()(textData);
  }
};

const usfmToDbsCode = (usfm) => APOCRYPHAL_BIBLE[APOCRYPHAL_BIBLE_USFM.indexOf(usfm)] ??
  DEFAULT_BIBLE[DEFAULT_BIBLE_USFM.indexOf(usfm)];

const isEnabled = (config) =>
  config.enableOnlineSources && config.bibleBrainEnabled && !!config.bibleBrainProxyBase;

const getProviderid = (textid) => {
  const parts = textid.split(':');
  return `${providerName}:${parts.length > 1 ? parts[1] : parts[0]}`;
};

const getTextInfoSync = (textid) => {
  const providerid = getProviderid(textid);
  return textData.find(text => text.providerid === providerid);
};

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

  textDataCallbacks.push(callback);
  if (textDataIsLoading) return;
  textDataIsLoading = true;

  fetchAllBibles(config.bibleBrainProxyBase)
    .then(entries => {
      const languages = config.bibleBrainLanguages ?? [];
      const excludeIds = config.bibleBrainExcludeIds ?? [];

      textData = [];
      for (const entry of entries) {
        if (languages.length > 0 && !languages.includes(entry.iso)) continue;
        if (excludeIds.includes(entry.abbr)) continue;

        const info = entryToTextInfo(entry);
        if (info) textData.push(info);
      }

      processTexts(textData, providerName);
      finish();
    })
    .catch(error => {
      console.error('Bible Brain manifest error:', error);
      // Keep an array so getTextInfoSync's .find() degrades to "not found"
      // instead of throwing on null.
      textData = [];
      finish();
    });
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

  if (info.divisions?.length > 0) {
    callback(info);
    return;
  }

  fetch(`${config.bibleBrainProxyBase}/bibles/${info.biblebrain.bibleId}/book`)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(json => {
      buildStructureFromBooks(info, json?.data ?? [], usfmToDbsCode);
      callback(info);
    })
    .catch(error => {
      console.error('Bible Brain getTextInfo error:', error);
      callback(null);
    });
}

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
    if (!bookData) {
      errorCallback?.(textid, sectionid);
      return;
    }

    const textFileset = selectTextFileset(textinfo.biblebrain.textFilesets, bookid);
    if (!textFileset) {
      errorCallback?.(textid, sectionid);
      return;
    }

    const usfm = bookData.usfm;
    const lang = textinfo.lang;
    const dir = textinfo.dir ?? 'ltr';
    const sectionIndex = textinfo.sections.indexOf(sectionid);
    const previd = sectionIndex > 0 ? textinfo.sections[sectionIndex - 1] : null;
    const nextid = sectionIndex > -1 && sectionIndex < textinfo.sections.length - 1
      ? textinfo.sections[sectionIndex + 1]
      : null;
    const divIndex = textinfo.divisions.indexOf(bookid);
    const title = divIndex > -1 ? textinfo.divisionNames[divIndex] : bookData.name;

    fetch(`${config.bibleBrainProxyBase}/bibles/filesets/${textFileset.id}/${usfm}/${chapter}`)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(json => {
        const verses = json?.data;
        if (!Array.isArray(verses) || verses.length === 0) {
          errorCallback?.(textid, sectionid);
          return;
        }
        callback(versesToHtml(verses, { textid, sectionid, bookid, chapter, lang, dir, title, previd, nextid }));
      })
      .catch(error => {
        console.error('Bible Brain loadSection error:', error);
        errorCallback?.(textid, sectionid);
      });
  });
}

const startSearch = createBibleBrainSearchStarter({ getTextInfoSync, isEnabled, usfmToDbsCode });

export const BibleBrainTextProvider = {
  name: providerName,
  fullName,
  getTextManifest,
  getTextInfo,
  loadSection,
  startSearch
};

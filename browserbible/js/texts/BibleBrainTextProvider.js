import { getConfig } from '../core/config.js';
import { processTexts, getTextInfoData } from './TextLoader.js';
import { registerLinkedAudio } from '../data/biblebrainDuplicates.js';
import { aliasTargetFor, isPairingBlocked } from '../data/biblebrainAliases.js';
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

/**
 * Index of the texts already loaded before this provider runs (providers load
 * in registration order, so this is the local catalog), keyed by upper id/abbr.
 */
const buildExistingTextIndex = () => {
  const byCode = new Map();
  for (const text of getTextInfoData() ?? []) {
    for (const code of [text.id, text.abbr]) {
      const key = String(code ?? '').toUpperCase();
      if (key && !byCode.has(key)) byCode.set(key, text);
    }
  }
  return byCode;
};

/**
 * Adds a catalog entry's audio to the association for `targetId`, merging it
 * with any other Bible Brain entry that reads the same text (the ESV, for one,
 * arrives under three codes with a different recording each). Returns false when
 * the entry is text-only and there was nothing to pair.
 */
const pairAudioToText = (associations, targetId, entry) => {
  const { audioFilesets } = selectFilesets(entry.filesets);
  if (audioFilesets.length === 0) return false;

  const key = String(targetId).toUpperCase();
  let association = associations.get(key);
  if (!association) {
    association = { inscriptId: targetId, bibleBrainIds: [], audioFilesets: [] };
    associations.set(key, association);
  }

  association.bibleBrainIds.push(entry.abbr);
  for (const fileset of audioFilesets) {
    if (!association.audioFilesets.some(kept => kept.id === fileset.id)) {
      association.audioFilesets.push(fileset);
    }
  }
  return true;
};

/**
 * Hands an association's audio to a Bible Brain text we kept, for aliases whose
 * target is itself a Bible Brain entry. Without this the audio would be dropped:
 * BibleBrainAudioProvider answers first for those texts and only reads the
 * entry's own filesets.
 */
const mergeIntoOwnFilesets = (texts, association) => {
  const target = texts.find(text => text.id === association.inscriptId);
  if (!target) return false;

  const own = target.biblebrain.audioFilesets;
  for (const fileset of association.audioFilesets) {
    if (!own.some(kept => kept.id === fileset.id)) own.push(fileset);
  }
  target.hasAudio = own.length > 0;
  return true;
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
      const existingTexts = buildExistingTextIndex();

      textData = [];
      const associations = new Map();
      for (const entry of entries) {
        if (languages.length > 0 && !languages.includes(entry.iso)) continue;

        // A text we already serve, either by the same FCBH code or through a
        // curated alias: never add the Bible Brain copy, just pair its audio.
        // Blocklisted ids share a code with one of our texts without being the
        // same work, so they skip pairing and are treated as any other entry.
        const localText = existingTexts.get(String(entry.abbr ?? '').toUpperCase());
        const targetId = isPairingBlocked(entry.abbr)
          ? null
          : localText?.id ?? aliasTargetFor(entry.abbr);
        if (targetId) {
          const paired = pairAudioToText(associations, targetId, entry);
          if (paired && localText) localText.hasAudio = true;
          continue;
        }

        if (excludeIds.includes(entry.abbr)) continue;

        const info = entryToTextInfo(entry);
        if (info) textData.push(info);
      }

      // Aliases pointing at a text we serve elsewhere (local, API.Bible, ESV API)
      // become linked audio; those pointing at a Bible Brain text we kept fold
      // into that text's own filesets. Targets that never load stay dormant.
      registerLinkedAudio([...associations.values()]
        .filter(association => !mergeIntoOwnFilesets(textData, association)));

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

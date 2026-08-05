/**
 * API.Bible Text Provider
 * Loads Bible texts from API.Bible (api.scripture.api.bible).
 *
 * API.Bible needs a secret `api-key` header, which a browser app can't keep
 * secret. So every request here goes to the proxy worker (config.apiBibleProxyBase),
 * which adds the key. The key lives only in that worker; there's none in this file.
 */

import { getConfig } from '../core/config.js';
import { processTexts, removeProviderTexts } from './TextLoader.js';
import {
  BOOK_DATA,
  DEFAULT_BIBLE,
  DEFAULT_BIBLE_USFM,
  APOCRYPHAL_BIBLE,
  APOCRYPHAL_BIBLE_USFM
} from '../bible/BibleData.js';
import {
  parseChapterContent,
  buildAboutHtml,
  buildStructureFromBooks,
  renderApiBibleSection
} from './ApiBibleChapterParser.js';
import { createApiBibleSearchStarter } from './ApiBibleSearch.js';

export { parseChapterContent };

const providerName = 'apibible';
const fullName = 'API.Bible';

/**
 * Known API.Bible texts. `apiId` is the API.Bible Bible ID; `id` is the short
 * id used inside the app. config.apiBibleIncludeIds picks which ones show.
 */
const CATALOG = [
  { id: 'NIV', apiId: '78a9f6124f344018-01', name: 'New International Version', abbr: 'NIV' },
  { id: 'CSB', apiId: 'a556c5305ee15c3f-01', name: 'Christian Standard Bible', abbr: 'CSB' },
  { id: 'NLT', apiId: 'd6e14a625393b4da-01', name: 'New Living Translation', abbr: 'NLT' }
];

// USFM book id -> in-app 2-letter DBS code (covers protocanon + apocrypha).
const usfmToDbsCode = (usfm) => APOCRYPHAL_BIBLE[APOCRYPHAL_BIBLE_USFM.indexOf(usfm)] ??
  DEFAULT_BIBLE[DEFAULT_BIBLE_USFM.indexOf(usfm)];

// FUMS fair-use reporting is all done server-side by the proxy (from the
// meta.fumsToken on each content response), so there's no FUMS code here.

let textData = [];
let textDataIsLoaded = false;

// Set for the session when the proxy reports the monthly limit is hit (HTTP 429).
// After that, tripQuota() pulls the three texts from the chooser and the
// manifest stops offering them.
let quotaExceeded = false;

const QUOTA_MESSAGE = 'The API.Bible limit has been reached. NIV, CSB, and NLT are unavailable until next month.';
const LOADING_MESSAGE = 'Loading from API.Bible…';

const showQuotaNotice = () => {
  if (typeof window === 'undefined' || !window.MovableWindow) return;

  const modal = new window.MovableWindow(420, 190, 'API.Bible');
  const body = modal.body?.nodeType ? modal.body : modal.body?.[0];
  if (body) {
    body.innerHTML = `<div style="padding:16px;line-height:1.5">${QUOTA_MESSAGE}</div>`;
  }
  modal.show();
};

// Disable the API.Bible texts for the rest of the session: drop them from the
// manifest, refresh any open chooser, and tell the user once.
const tripQuota = () => {
  if (quotaExceeded) return;
  quotaExceeded = true;
  textData = [];
  textDataIsLoaded = false;

  try {
    removeProviderTexts(providerName);
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent('texts:provider-disabled', {
        detail: { providerName }
      }));
    }
  } catch (_e) { /* non-DOM environment */ }

  showQuotaNotice();
};

// Returns true (and trips the quota) when a proxy response signals the monthly
// limit is reached, so callers can bail out of the .then() chain.
const isQuotaResponse = (response) => {
  if (response.status === 429) {
    tripQuota();
    return true;
  }
  return false;
};

const failSection = (errorCallback, textid, sectionid) => {
  errorCallback?.(textid, sectionid, quotaExceeded ? { message: QUOTA_MESSAGE } : undefined);
};

const getProviderid = (textid) => {
  const parts = textid.split(':');
  return `${providerName}:${parts.length > 1 ? parts[1] : parts[0]}`;
};

const getTextInfoSync = (textid) => {
  const providerid = getProviderid(textid);
  return textData.find(text => text.providerid === providerid);
};

function buildManifest() {
  const config = getConfig();
  const includeIds = config.apiBibleIncludeIds ?? [];

  return CATALOG
    .filter(b => includeIds.length === 0 || includeIds.includes(b.apiId))
    .map(b => ({
      type: 'bible',
      id: b.id,
      apiId: b.apiId,
      name: b.name,
      nameEnglish: b.name,
      abbr: b.abbr,
      lang: 'eng',
      langName: 'English',
      langNameEnglish: 'English',
      dir: 'ltr',
      loadingMessage: LOADING_MESSAGE
    }));
}

function getTextManifest(callback) {
  const config = getConfig();

  if (quotaExceeded || !config.enableOnlineSources || !config.apiBibleEnabled || !config.apiBibleProxyBase) {
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

  // Bail when disabled/limit-reached so we never loop retrying the manifest.
  if (quotaExceeded || !config.enableOnlineSources || !config.apiBibleEnabled || !config.apiBibleProxyBase) {
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

  const base = config.apiBibleProxyBase;

  // Bible-level metadata (copyright, publisher blurb) for the about panel. Runs
  // alongside the books call; best-effort, so a failure just means a sparser panel.
  const detailsReq = fetch(`${base}/bibles/${info.apiId}?include-full-details=true`)
    .then(response => (response.ok ? response.json() : null))
    .catch(() => null);

  fetch(`${base}/bibles/${info.apiId}/books?include-chapters=true`)
    .then(response => {
      if (isQuotaResponse(response)) throw new Error('quota_exceeded');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(async data => {
      buildStructureFromBooks(info, data.data, usfmToDbsCode);

      const details = await detailsReq;
      info.aboutHtml = buildAboutHtml(info, details?.data);

      callback(info);
    })
    .catch(() => callback(null));
}

function loadSection(textid, sectionid, callback, errorCallback) {
  const config = getConfig();

  getTextInfo(textid, (textinfo) => {
    if (!textinfo) {
      failSection(errorCallback, textid, sectionid);
      return;
    }

    const bookid = sectionid.substring(0, 2);
    const chapter = sectionid.substring(2);
    const bookData = BOOK_DATA[bookid];

    if (!bookData) {
      failSection(errorCallback, textid, sectionid);
      return;
    }

    const sectionIndex = textinfo.sections.indexOf(sectionid);
    const previd = sectionIndex > 0 ? textinfo.sections[sectionIndex - 1] : null;
    const nextid = sectionIndex > -1 && sectionIndex < textinfo.sections.length - 1
      ? textinfo.sections[sectionIndex + 1]
      : null;

    const params = 'content-type=json&include-verse-numbers=true&include-titles=true' +
      '&include-notes=false&include-chapter-numbers=false';
    const url = `${config.apiBibleProxyBase}/bibles/${textinfo.apiId}/chapters/${bookData.usfm}.${chapter}?${params}`;

    fetch(url)
      .then(response => {
        if (isQuotaResponse(response)) throw new Error('quota_exceeded');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(json => {
        const content = json?.data?.content;
        if (!Array.isArray(content)) {
          failSection(errorCallback, textid, sectionid);
          return;
        }

        const divIndex = textinfo.divisions.indexOf(bookid);
        callback(renderApiBibleSection({
          content,
          textid,
          sectionid,
          bookid,
          chapter,
          lang: textinfo.lang,
          dir: textinfo.dir ?? 'ltr',
          previd,
          nextid,
          bookTitle: divIndex > -1 ? textinfo.divisionNames[divIndex] : bookData.name
        }));
      })
      .catch(() => {
        failSection(errorCallback, textid, sectionid);
      });
  });
}

const startSearch = createApiBibleSearchStarter({ getTextInfoSync, isQuotaResponse, usfmToDbsCode });

export const ApiBibleTextProvider = {
  name: providerName,
  fullName,
  getTextManifest,
  getTextInfo,
  loadSection,
  startSearch
};

import { addNames } from '../bible/BibleData.js';

const textProviders = new Map();

let textInfoDataIsLoading = false;
let textInfoLoadingCallbacks = [];
let textInfoDataIsLoaded = false;

let textInfoData = [];

const textData = {};

const cachedTexts = {};

// In-flight section loads by "textid|sectionid"; concurrent callers share one fetch
const pendingSectionLoads = {};

export function registerTextProvider(name, provider) {
  textProviders.set(name, provider);
}

export function loadSection(textInfo, sectionid, successCallback, errorCallback) {
  if (sectionid == 'null' || sectionid == null) {
    errorCallback?.(textInfo?.id ?? '', sectionid, { message: 'No section id given.' });
    return;
  }

  if (typeof textInfo === 'string') {
    loadSectionByTextid(textInfo, sectionid, successCallback, errorCallback);
    return;
  }

  const textid = textInfo.id;
  sectionid = resolveSectionid(textInfo, sectionid);

  if (window?.BrowserBible?.analytics?.record) {
    window.BrowserBible.analytics.record('load', textInfo.id, sectionid);
  }

  if (typeof cachedTexts[textid] === 'undefined') {
    cachedTexts[textid] = {};
  }
  if (typeof cachedTexts[textid][sectionid] !== 'undefined') {
    const temp = document.createElement('div');
    temp.innerHTML = cachedTexts[textid][sectionid];
    successCallback(temp.firstChild || temp);
    return;
  }

  const provider = textProviders.get(textInfo.providerName);
  if (!provider) return;

  const pendingKey = `${textid}|${sectionid}`;
  if (pendingSectionLoads[pendingKey]) {
    pendingSectionLoads[pendingKey].push({ successCallback, errorCallback });
    return;
  }
  pendingSectionLoads[pendingKey] = [{ successCallback, errorCallback }];

  provider.loadSection(textid, sectionid,
    (html) => resolveSectionLoad(textid, sectionid, pendingKey, html),
    (...args) => rejectSectionLoad(pendingKey, args));
}

function loadSectionByTextid(textid, sectionid, successCallback, errorCallback) {
  getText(textid, (textInfo) => {
    if (!textInfo) {
      errorCallback?.(new Error(`No text info for "${textid}"`));
      return;
    }
    loadSection(textInfo, sectionid, successCallback, errorCallback);
  }, errorCallback);
}

function resolveSectionid(textInfo, sectionid) {
  if (!textInfo.sections?.length || textInfo.sections.indexOf(sectionid) > -1) {
    return sectionid;
  }

  const bookPrefix = sectionid.substring(0, 2);
  const chapterNum = parseInt(sectionid.substring(2), 10);

  const matchingSection = textInfo.sections.find(s => {
    if (!s.startsWith(bookPrefix)) return false;
    return parseInt(s.substring(2), 10) === chapterNum;
  });

  return matchingSection ?? sectionid;
}

function resolveSectionLoad(textid, sectionid, pendingKey, html) {
  cachedTexts[textid][sectionid] = html;

  const waiters = pendingSectionLoads[pendingKey] || [];
  delete pendingSectionLoads[pendingKey];
  for (const waiter of waiters) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    waiter.successCallback(temp.firstChild || temp);
  }
}

function rejectSectionLoad(pendingKey, args) {
  const waiters = pendingSectionLoads[pendingKey] || [];
  delete pendingSectionLoads[pendingKey];
  for (const waiter of waiters) waiter.errorCallback?.(...args);
}

export function getTextid(input) {
  const parts = input.split(':');
  return (parts.length > 1) ? parts[1] : parts[0];
}

/**
 * Version abbreviation for display: strips the leading ISO 639-3 language
 * prefix from ids like "ENGKJV" so the UI shows "KJV".
 */
export function displayAbbr(textInfo) {
  if (!textInfo) return '';
  const abbr = textInfo.abbr || textInfo.id || '';
  const lang = (textInfo.lang || '').toUpperCase();

  if (lang.length === 3 && abbr.toUpperCase().startsWith(lang) && abbr.length - lang.length >= 2) {
    return abbr.slice(lang.length);
  }

  return abbr;
}

export function getProviderName(input) {
  const parts = input.split(':');
  const textid = parts.length > 1 ? parts[1] : parts[0];
  let providerName = parts.length > 1 ? parts[0] : '';

  if (providerName === '') {
    const textInfo = textInfoData.find((info) => info.id === textid);

    if (textInfo?.providerName) {
      providerName = textInfo.providerName;
    } else {
      providerName = 'local';
    }
  }

  return providerName;
}

export function getProviderId(input) {
  if (input.indexOf(':') > -1) {
    return input;
  } else {
    const textid = input;
    const textInfo = textInfoData.find((info) => info.id === textid);

    return textInfo?.providerid ?? input;
  }
}

export function getText(textid, callback, errorCallback) {
  // textData is keyed by the bare id (data.id after processText strips any
  // "provider:" prefix). Normalize the lookup key the same way so prefixed
  // and bare forms hit the same cache slot.
  const bareId = getTextid(textid);
  const textinfo = textData[bareId];

  if (typeof textinfo !== 'undefined') {
    if (typeof callback !== 'undefined') {
      callback(textinfo);
    }
    return textinfo;
  }

  const providerName = getProviderName(textid);
  textid = bareId;

  const provider = textProviders.get(providerName);
  if (!provider) {
    if (errorCallback) {
      errorCallback(new Error(`Provider "${providerName}" not found`));
    }
    return;
  }

  provider.getTextInfo(textid, (data) => {
    if (!data) {
      if (errorCallback) errorCallback(new Error(`No data for "${textid}"`));
      else if (callback) callback(null);
      return;
    }

    const initialInfo = textInfoData[textid];
    data = { ...initialInfo, ...data };

    processText(data, providerName);

    textData[data.id] = data;

    if (data.divisionNames) {
      addNames(data.lang, data.divisions, data.divisionNames);
    }

    callback(data);
  }, errorCallback);
}

export function loadTexts(callback) {
  if (textInfoDataIsLoaded) {
    callback(textInfoData);
  } else {
    loadTextsManifest(callback);
  }
}

function loadTextsManifest(callback) {
  if (callback) {
    textInfoLoadingCallbacks.push(callback);
  }

  if (textInfoDataIsLoading) {
    return;
  }

  textInfoDataIsLoading = true;

  const providerKeys = Array.from(textProviders.keys());
  let currentProviderIndex = 0;

  const loadNextProvider = () => {
    if (currentProviderIndex < providerKeys.length) {
      const providerName = providerKeys[currentProviderIndex];
      const provider = textProviders.get(providerName);

      provider.getTextManifest((data) => {
        if (data && data != null) {
          processTexts(data, providerName);
          textInfoData = textInfoData.concat(data);
        }

        currentProviderIndex++;
        loadNextProvider();
      });
    } else {
      textInfoDataIsLoading = false;
      textInfoDataIsLoaded = true;

      while (textInfoLoadingCallbacks.length > 0) {
        const cb = textInfoLoadingCallbacks.pop();
        if (typeof cb === 'function') {
          cb(textInfoData);
        }
      }
    }
  };

  loadNextProvider();
}

export function processTexts(textArray, providerName) {
  for (const text of textArray) {
    processText(text, providerName);
  }
}

export function processText(text, providerName) {
  if (text.id.split(':').length > 1) {
    text.id = text.id.split(':')[1];
  }

  text.providerName = providerName;
  text.providerid = `${providerName}:${text.id}`;

  if (text.country && !text.countries &&
      text.country !== text.langName && text.country !== text.langNameEnglish) {
    text.countries = [];
  }
}

export function startSearch(textid, divisions, searchTerms, onSearchLoad, onSearchIndexComplete, onSearchComplete) {
  const providerName = getProviderName(textid);
  const provider = textProviders.get(providerName);

  if (provider && provider.startSearch) {
    provider.startSearch(textid, divisions, searchTerms, onSearchLoad, onSearchIndexComplete, onSearchComplete);
  }
}

export function getTextInfoData() {
  return textInfoData;
}

/**
 * Drop all of a provider's texts from the loaded manifest, so it can be disabled
 * at runtime (e.g. API.Bible once its monthly limit is hit). Refresh the text
 * chooser afterwards to reflect it.
 */
export function removeProviderTexts(providerName) {
  textInfoData = textInfoData.filter((info) => info.providerName !== providerName);
}


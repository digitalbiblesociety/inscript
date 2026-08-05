import { addNames } from '../bible/BibleData.js';
import {
  getTextid,
  displayAbbr,
  processTexts,
  processText,
  resolveSectionId,
  htmlToNode
} from './TextInfoUtils.js';

export { getTextid, displayAbbr, processTexts, processText };

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

function loadSectionByTextid(textid, sectionid, successCallback, errorCallback) {
  getText(textid, (textInfo) => {
    // getText calls back with null when it has no errorCallback to use
    if (!textInfo) {
      errorCallback?.(new Error(`No text info for "${textid}"`));
      return;
    }
    loadSection(textInfo, sectionid, successCallback, errorCallback);
  }, errorCallback);
}

function loadSectionFromProvider(textInfo, sectionid, successCallback, errorCallback) {
  const provider = textProviders.get(textInfo.providerName);
  if (!provider) return;

  const textid = textInfo.id;
  const pendingKey = `${textid}|${sectionid}`;
  if (pendingSectionLoads[pendingKey]) {
    pendingSectionLoads[pendingKey].push({ successCallback, errorCallback });
    return;
  }
  pendingSectionLoads[pendingKey] = [{ successCallback, errorCallback }];

  provider.loadSection(textid, sectionid, (html) => {
    cachedTexts[textid][sectionid] = html;

    const waiters = pendingSectionLoads[pendingKey] || [];
    delete pendingSectionLoads[pendingKey];
    for (const waiter of waiters) {
      waiter.successCallback(htmlToNode(html));
    }
  }, (...args) => {
    const waiters = pendingSectionLoads[pendingKey] || [];
    delete pendingSectionLoads[pendingKey];
    for (const waiter of waiters) waiter.errorCallback?.(...args);
  });
}

export function loadSection(textInfo, sectionid, successCallback, errorCallback) {
  if (sectionid == 'null' || sectionid == null) {
    errorCallback?.(textInfo?.id ?? '', sectionid, { message: 'No section id given.' });
    return;
  }

  if (textInfo != null && typeof textInfo === 'string') {
    loadSectionByTextid(textInfo, sectionid, successCallback, errorCallback);
    return;
  }

  const textid = textInfo.id;
  sectionid = resolveSectionId(textInfo, sectionid);

  if (window?.BrowserBible?.analytics?.record) {
    window.BrowserBible.analytics.record('load', textInfo.id, sectionid);
  }

  if (typeof cachedTexts[textid] === 'undefined') {
    cachedTexts[textid] = {};
  }
  if (typeof cachedTexts[textid][sectionid] !== 'undefined') {
    successCallback(htmlToNode(cachedTexts[textid][sectionid]));
    return;
  }

  loadSectionFromProvider(textInfo, sectionid, successCallback, errorCallback);
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

/**
 * @param {object} searchRequest - { textid, divisions, text,
 *   onSearchLoad, onSearchIndexComplete, onSearchComplete }
 */
export function startSearch(searchRequest) {
  const providerName = getProviderName(searchRequest.textid);
  const provider = textProviders.get(providerName);

  if (provider && provider.startSearch) {
    provider.startSearch(searchRequest);
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

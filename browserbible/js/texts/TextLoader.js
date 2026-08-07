import { addNames } from '../bible/BibleData.js';
import {
  getTextid,
  getTextIdentity,
  displayAbbr,
  processTexts,
  processText,
  resolveSectionId,
  htmlToNode
} from './TextInfoUtils.js';

export { getTextid, getTextIdentity, displayAbbr, processTexts, processText };

const textProviders = new Map();

let textInfoDataIsLoading = false;
let textInfoLoadingCallbacks = [];
let textInfoDataIsLoaded = false;

let textInfoData = [];

// All three caches are keyed by "providerName:textid", never by the bare id:
// two providers can expose the same id (e.g. an "ESV" from both the ESV API and
// API.Bible) and must not share metadata or chapter html.
const textData = {};

const cachedTexts = {};

// In-flight section loads by "providerName:textid|sectionid"; concurrent callers
// share one fetch
const pendingSectionLoads = {};

export function registerTextProvider(name, provider) {
  textProviders.set(name, provider);
}

/** The cache key for an already-resolved textInfo. */
function cacheKey(textInfo) {
  return textInfo.providerid ?? `${textInfo.providerName ?? 'local'}:${textInfo.id}`;
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
  if (!provider) {
    errorCallback?.(textInfo.id, sectionid, {
      message: `Provider "${textInfo.providerName}" not found`
    });
    return;
  }

  const textid = textInfo.id;
  const key = cacheKey(textInfo);
  const pendingKey = `${key}|${sectionid}`;
  if (pendingSectionLoads[pendingKey]) {
    pendingSectionLoads[pendingKey].push({ successCallback, errorCallback });
    return;
  }
  pendingSectionLoads[pendingKey] = [{ successCallback, errorCallback }];

  let settled = false;
  const succeed = (html) => {
    if (settled) return;
    settled = true;
    cachedTexts[key][sectionid] = html;

    const waiters = pendingSectionLoads[pendingKey] || [];
    delete pendingSectionLoads[pendingKey];
    for (const waiter of waiters) {
      waiter.successCallback(htmlToNode(html));
    }
  };
  const fail = (...args) => {
    if (settled) return;
    settled = true;
    const waiters = pendingSectionLoads[pendingKey] || [];
    delete pendingSectionLoads[pendingKey];
    for (const waiter of waiters) waiter.errorCallback?.(...args);
  };

  try {
    provider.loadSection(textid, sectionid, succeed, fail);
  } catch (error) {
    if (settled) throw error;
    fail(textid, sectionid, { message: error?.message ?? String(error), error });
  }
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

  sectionid = resolveSectionId(textInfo, sectionid);

  if (window?.BrowserBible?.analytics?.record) {
    window.BrowserBible.analytics.record('load', textInfo.id, sectionid);
  }

  const key = cacheKey(textInfo);
  if (typeof cachedTexts[key] === 'undefined') {
    cachedTexts[key] = {};
  }
  if (typeof cachedTexts[key][sectionid] !== 'undefined') {
    successCallback(htmlToNode(cachedTexts[key][sectionid]));
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
  // Both the bare "ENGKJV" and prefixed "local:ENGKJV" forms resolve to the same
  // provider-qualified key, so they share one cache slot without letting two
  // providers' texts of the same id collide.
  const bareId = getTextid(textid);
  const providerName = getProviderName(textid);
  const key = `${providerName}:${bareId}`;

  const textinfo = textData[key];

  if (typeof textinfo !== 'undefined') {
    if (typeof callback !== 'undefined') {
      callback(textinfo);
    }
    return textinfo;
  }

  const provider = textProviders.get(providerName);
  if (!provider) {
    if (errorCallback) {
      errorCallback(new Error(`Provider "${providerName}" not found`));
    } else if (callback) {
      callback(null);
    }
    return;
  }

  let settled = false;
  const fail = (...args) => {
    if (settled) return;
    settled = true;
    if (errorCallback) errorCallback(...args);
    else callback?.(null);
  };
  const succeed = (data) => {
    if (settled) return;

    if (!data) {
      fail(new Error(`No data for "${bareId}"`));
      return;
    }

    try {
      // The manifest entry carries fields a provider's detail response can omit
      // (language names, runtime flags such as hasAudio), so start from it.
      const manifestInfo = textInfoData.find((info) =>
        info.providerid === key || (info.providerName === providerName && info.id === bareId));
      data = { ...manifestInfo, ...data };

      processText(data, providerName);

      textData[key] = data;
      if (data.providerid !== key) {
        textData[data.providerid] = data;
      }

      if (data.divisionNames) {
        addNames(data.lang, data.divisions, data.divisionNames);
      }
    } catch (error) {
      fail(error);
      return;
    }

    settled = true;
    callback?.(data);
  };

  try {
    provider.getTextInfo(bareId, succeed, fail);
  } catch (error) {
    if (settled) throw error;
    fail(error);
  }
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
    if (currentProviderIndex >= providerKeys.length) {
      textInfoDataIsLoading = false;
      textInfoDataIsLoaded = true;

      while (textInfoLoadingCallbacks.length > 0) {
        const cb = textInfoLoadingCallbacks.pop();
        if (typeof cb === 'function') {
          cb(textInfoData);
        }
      }
      return;
    }

    const providerName = providerKeys[currentProviderIndex];
    const provider = textProviders.get(providerName);

    // Providers load in series, so one that answers twice (or throws) would
    // otherwise skip a provider or stall every text in the app.
    let settled = false;
    const next = (data) => {
      if (settled) return;
      settled = true;

      if (data) {
        processTexts(data, providerName);
        textInfoData = textInfoData.concat(data);
      }

      currentProviderIndex++;
      loadNextProvider();
    };

    try {
      provider.getTextManifest(next);
    } catch (error) {
      console.error(`Error loading the "${providerName}" text manifest:`, error);
      next(null);
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

  if (provider?.startSearch) {
    provider.startSearch(searchRequest);
    return;
  }

  // Commentaries and audio-only providers cannot search. Report a failed
  // completion so the search window stops waiting on a result that never comes.
  searchRequest.onSearchComplete?.({
    type: 'complete',
    target: null,
    data: {
      results: null,
      searchIndexesData: [],
      searchTermsRegExp: [],
      isLemmaSearch: false
    }
  });
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

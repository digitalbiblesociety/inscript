let currentLanguage = 'en';
let fallbackLanguage = 'en';
let resources = {};
let resourceBasePath = './js/resources';
const loadingPromises = new Map();
const RTL_LANGUAGES = new Set(['ar', 'ur', 'he', 'fa']);

/** Resolves to null when the resource cannot be fetched. */
async function loadLanguage(lang) {
  if (resources[lang]) {
    return resources[lang];
  }

  if (loadingPromises.has(lang)) {
    return loadingPromises.get(lang);
  }

  const promise = (async () => {
    try {
      const response = await fetch(`${resourceBasePath}/${lang}.json`);
      if (!response.ok) {
        console.warn(`Failed to load language resource: ${lang}`);
        return null;
      }
      const data = await response.json();
      resources[lang] = data;
      return data;
    } catch (err) {
      console.warn(`Error loading language resource ${lang}:`, err);
      return null;
    } finally {
      loadingPromises.delete(lang);
    }
  })();

  loadingPromises.set(lang, promise);
  return promise;
}

/**
 * Language precedence: `options.lng`, then the i18next cookie, then
 * `options.defaultLng`, then navigator.language. `options.resStore` supplies
 * preloaded translations instead of fetching from `options.basePath`.
 */
export async function init(options = {}) {
  if (options.basePath) {
    resourceBasePath = options.basePath;
  }

  if (options.resStore) {
    resources = { ...resources, ...options.resStore };
  }

  if (options.fallbackLng) {
    fallbackLanguage = options.fallbackLng;
  }

  if (options.lng && options.lng !== '') {
    currentLanguage = options.lng;
  } else {
    const cookieLang = getCookie('i18next');
    if (cookieLang) {
      currentLanguage = cookieLang;
    } else if (options.defaultLng) {
      currentLanguage = options.defaultLng;
    } else if (typeof navigator !== 'undefined' && navigator.language) {
      currentLanguage = navigator.language.split('-')[0];
    }
  }

  await loadLanguage(fallbackLanguage);

  if (currentLanguage !== fallbackLanguage) {
    const loaded = await loadLanguage(currentLanguage);
    if (!loaded) {
      currentLanguage = fallbackLanguage;
    }
  }

  updateDocumentDirection();
}

function updateDocumentDirection() {
  if (typeof document === 'undefined') return;
  const dir = RTL_LANGUAGES.has(currentLanguage) ? 'rtl' : 'ltr';
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = dir;
}

function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length; i++) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[parts[i]];
  }

  return current;
}

function interpolate(str, options) {
  if (!options) return str;

  if (options.count !== undefined) {
    str = str.replace(/__count__/g, options.count);
  }

  if (Array.isArray(options)) {
    for (let i = 0; i < options.length; i++) {
      str = str.replace(new RegExp('\\{' + i + '\\}', 'g'), options[i]);
    }
    return str;
  }

  for (const prop in options) {
    if (Object.hasOwn(options, prop)) {
      str = str.replace(new RegExp('\\{' + prop + '\\}', 'g'), options[prop]);
    }
  }
  return str;
}

/**
 * Keys use dot notation. `options` supplies interpolation values, named or
 * positional. Returns the key itself when nothing matches.
 */
export function t(key, options) {
  let translation = getNestedValue(resources, currentLanguage + '.translation.' + key);

  if (translation === undefined && currentLanguage !== fallbackLanguage) {
    translation = getNestedValue(resources, fallbackLanguage + '.translation.' + key);
  }

  if (translation === undefined) return key;

  return interpolate(translation, options);
}

export function lng() {
  return currentLanguage;
}

function getCookie(name) {
  if (typeof document === 'undefined') return '';
  const value = '; ' + document.cookie;
  const parts = value.split('; ' + name + '=');
  if (parts.length === 2) {
    return parts.pop().split(';').shift();
  }
  return '';
}

function setCookie(name, value, days) {
  if (typeof document === 'undefined') return;
  let expires = '';
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = '; expires=' + date.toUTCString();
  }
  // Secure only over HTTPS so the preference still persists on http://localhost
  // dev and file:// (offline) use; SameSite=Lax on all origins.
  const secure = (typeof location !== 'undefined' && location.protocol === 'https:') ? '; Secure' : '';
  document.cookie = name + '=' + (value || '') + expires + '; path=/; SameSite=Lax' + secure;
}

/**
 * Returns false, leaving the language unchanged, when the resource fails to load.
 */
export async function setLng(langCode) {
  const loaded = await loadLanguage(langCode);

  if (loaded) {
    currentLanguage = langCode;
    setCookie('i18next', langCode, 365);
    updateDocumentDirection();
    translatePage();
    return true;
  }
  return false;
}

/**
 * Reads the element data-i18n attribute, which may target an attribute rather
 * than the text, as in "[title]tooltip.help", and syncs lang/dir to match.
 */
export function translateElement(el) {
  const attr = el.getAttribute('data-i18n');
  if (!attr) return;

  // Hyphens are part of the attribute name, or "[aria-label]key" would be read
  // as no target at all and overwrite the element's contents instead.
  const match = attr.match(/^\[([\w-]+)\](.+)$/);
  let target, key;

  if (match) {
    target = match[1];
    key = match[2];
  } else {
    target = 'html';
    key = attr;
  }

  const translation = t(key);

  switch (target) {
    case 'html':
      el.innerHTML = translation;
      break;
    case 'text':
      el.textContent = translation;
      break;
    case 'title':
      el.setAttribute('title', translation);
      break;
    case 'placeholder':
      el.setAttribute('placeholder', translation);
      break;
    case 'value':
      el.value = translation;
      break;
    default:
      el.setAttribute(target, translation);
  }

  el.lang = currentLanguage;
  el.dir = RTL_LANGUAGES.has(currentLanguage) ? 'rtl' : 'ltr';
}

function translatePage(container) {
  if (typeof document === 'undefined') return;
  container = container || document;
  const elements = container.querySelectorAll('[data-i18n]');

  elements.forEach(el => {
    translateElement(el);
  });
}

export function isLoaded(lang) {
  return !!resources[lang];
}

/** Preload a language without switching to it. */
export async function preload(lang) {
  const loaded = await loadLanguage(lang);
  return !!loaded;
}

export function getResource(lang) {
  return resources[lang] ?? null;
}

function clearLng() {
  setCookie('i18next', '', -1);
}

export const i18n = {
  init,
  t,
  lng,
  setLng,
  clearLng,
  translatePage,
  translateElement,
  isLoaded,
  preload,
  getResource
};

import helpers from './lib/helpers.esm.js';
import { i18n } from './lib/i18n.js';
import { getConfig, updateConfig, getCustomConfig } from './core/config.js';
import registry, { getApp, VERSION } from './core/registry.js';
import { App } from './core/App.js';
import { getGuidedTour } from './menu/GuidedTour.js';

// Imported for side effects: each barrel self-registers with the registry.
import './resources/index.js';
import './texts/index.js';

import './media/index.js';

import './ui/index.js';

import './plugins/index.js';

import './windows/index.js';

import './menu/index.js';


// Every menu, dropdown, and popup relies on the native Popover API (Chrome 114,
// Firefox 125, Safari 17). On older engines those controls silently fail to
// open, so warn the user rather than leaving them with dead buttons. English
// only by design: the visitor's browser predates the app's baseline.
function checkBrowserSupport() {
  if ('popover' in HTMLElement.prototype) return;

  const banner = document.createElement('div');
  banner.setAttribute('role', 'alert');
  banner.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#8a1c1c;' +
    'color:#fff;padding:10px 44px 10px 16px;font:14px/1.4 system-ui,sans-serif;text-align:center;';
  banner.textContent =
    'Your browser is out of date, so some menus and dialogs may not open. ' +
    'Please update to the latest Chrome, Edge, Firefox, or Safari.';

  const dismiss = document.createElement('button');
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.textContent = '×';
  dismiss.style.cssText =
    'position:absolute;top:6px;right:12px;background:none;border:none;color:#fff;' +
    'font-size:22px;line-height:1;cursor:pointer;';
  dismiss.addEventListener('click', () => banner.remove());
  banner.appendChild(dismiss);

  document.body.appendChild(banner);
}

async function startup() {
  checkBrowserSupport();

  const startupEl = document.getElementById('startup');
  if (startupEl) {
    startupEl.style.display = 'none';
  }

  if (window.location.protocol === 'file:') {
    fetch('about.html')
      .then(() => init())
      .catch(e => {
        showLocalFileError(e);
      });
  } else {
    init();
  }
}

function showLocalFileError(e) {
  const modal = document.createElement('div');
  modal.className = 'local-file-error';
  modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#000;color:#fff;padding:20px;max-width:500px;z-index:var(--z-top);';

  const ua = navigator.userAgent.toLowerCase();
  let errorMessage = '';

  if (ua.indexOf('chrome') > -1) {
    if (ua.indexOf('mac os') > -1) {
      errorMessage =
        '<p>Mac, Terminal</p>' +
        '<code>/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --allow-file-access-from-files</code>';
    } else if (ua.indexOf('windows') > -1) {
      errorMessage =
        '<p>Windows, Command Prompt</p>' +
        '<code>chrome.exe --allow-file-access-from-files</code>';
    }
  } else {
    errorMessage = '<p>Unknown error loading files (cannot load about.html): ' + e + '</p>';
  }

  modal.innerHTML = '<h3>Local Files Error</h3>' + errorMessage;
  document.body.appendChild(modal);
}

async function init() {
  const cfg = getConfig();

  const params = Object.fromEntries(new URLSearchParams(window.location.search));
  const custom = params['custom'];

  if (custom) {
    const customizations = getCustomConfig(custom);
    if (customizations) {
      updateConfig(customizations);
    }
  }

  const finalConfig = getConfig();
  if (finalConfig.customCssUrl) {
    const link = document.createElement('link');
    link.href = finalConfig.customCssUrl;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }

  const isiOSApp = (navigator.userAgent.toLowerCase().indexOf('ipad') > -1 ||
    navigator.userAgent.toLowerCase().indexOf('iphone') > -1) &&
    window.location.protocol === 'file:';

  if (window.navigator.standalone === true || isiOSApp) {
    document.body.classList.add('app-mobile-fullscreen');
  }

  const app = new App();

  // i18n.init reads the 'i18next' cookie itself; defaultLng only applies when
  // no cookie is set.
  await i18n.init({
    fallbackLng: 'en',
    defaultLng: cfg.defaultLanguage
  });

  app.init();

  i18n.translatePage();

  setTimeout(() => {
    const lang = i18n.lng();
    const langSelector = document.getElementById('config-language');

    if (langSelector) {
      langSelector.value = lang;

      if (lang !== langSelector.value) {
        langSelector.value = lang.split('-')[0];
      }

      if (langSelector.localizeLanguages) {
        langSelector.localizeLanguages();
      }
    }
  }, 50);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startup);
} else {
  startup();
}

if (typeof window !== 'undefined') {
  window.BrowserBible = {
    VERSION,
    config: getConfig,
    registry,
    getApp,
    helpers,
    i18n,
    tour: getGuidedTour
  };
}

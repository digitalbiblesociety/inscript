/** Popup with Strong's number details, shown on clicking a tagged word. */

import { getConfig } from '../core/config.js';
import { getApp } from '../core/registry.js';
import { i18n } from '../lib/i18n.js';
import { InfoWindow } from '../ui/InfoWindow.js';
import { OT_BOOKS } from '../bible/BibleData.js';
import { morphology } from '../bible/Morphology.js';
import { elem } from '../lib/helpers.esm.js';
import { sanitizeHtml } from '../lib/sanitizeHtml.js';

// Articles are dropped when a selection spans several words.
const GREEK_ARTICLE = 3588;  // G3588 - the Greek definite article
const HEBREW_ARTICLE = 853;  // H853 - the Hebrew direct object marker

const GREEK_CONFIG = { langPrefix: 'G', langCode: 'el', dir: 'ltr', morphType: 'Greek' };
const HEBREW_CONFIG = { langPrefix: 'H', langCode: 'he', dir: 'rtl', morphType: 'Hebrew' };

const HEBREW_SECTION_LANGS = ['he', 'heb'];

function getLangConfig(sectionLang, bookId) {
  if (HEBREW_SECTION_LANGS.includes(sectionLang) || OT_BOOKS.includes(bookId)) {
    return HEBREW_CONFIG;
  }
  return GREEK_CONFIG;
}

/** Mutates both arrays; returns whether an article was removed. */
function removeArticle(strongs, morphs, langPrefix) {
  const articleNum = langPrefix === 'G' ? GREEK_ARTICLE : HEBREW_ARTICLE;
  const articleIndex = strongs.indexOf(articleNum);

  if (articleIndex > -1) {
    strongs.splice(articleIndex, 1);
    if (morphs.length > articleIndex) {
      morphs.splice(articleIndex, 1);
    }
    return true;
  }
  return false;
}

function parseStrongs(strongAttr) {
  if (!strongAttr) return [];
  return strongAttr
    .replace(/[GH]/gi, '')
    .split(' ')
    .map(s => parseInt(s, 10))
    .filter(n => !isNaN(n));
}

function parseMorphs(morphAttr) {
  return morphAttr ? morphAttr.split(' ') : [];
}

function buildLemmaElements({ data, strongsNumber, morphKey, langConfig, textid }) {
  const { langPrefix, langCode, dir, morphType } = langConfig;
  const word = elem('div', { className: 'lemma-word' },
    elem('span', { lang: langCode, dir }, data.lemma),
    elem('span', { className: 'lemma-strongs', dir: 'ltr' }, `(${strongsNumber})`)
  );
  return [
    word,
    morphKey && morphology[morphType] && elem('span', { className: 'lemma-morphology', innerHTML: morphology[morphType].format(morphKey) }),
    elem('span', {
      className: 'lemma-findall',
      textContent: i18n.t('plugins.lemmapopup.findalloccurrences', { count: data.frequency }),
      dataset: { lemma: `${langPrefix}${strongsNumber}`, textid }
    }),
    elem('div', { className: 'lemma-outline', innerHTML: sanitizeHtml(data.outline) })
  ].filter(Boolean);
}

class LemmaPopupController {
  constructor(config) {
    this.config = config;
    this.popup = InfoWindow('lemma-popup');
    this.container = this.popup.container;
    this.body = this.popup.body;
    this.requestId = 0;
    this.abortController = null;
    this.popup.on('hide', () => {
      this.cancelLoads();
      this.clearSelection();
    });
    this.container.addEventListener('click', (event) => this.handleFindAll(event));
    document.querySelector('.windows-main')?.addEventListener('click', (event) => this.handleWordClick(event));
  }

  clearSelection() {
    this.popup.currentWord = null;
    document.querySelectorAll('.selected-lemma').forEach((el) => {
      el.classList.remove('selected-lemma');
    });
  }

  cancelLoads() {
    this.requestId++;
    this.abortController?.abort();
    this.abortController = null;
  }

  async loadStrongsData(opts, signal) {
    const { textid, strongsNumber, morphKey, langConfig } = opts;
    const url = `${this.config.baseContentUrl}content/lexicons/strongs/entries/${langConfig.langPrefix}${strongsNumber}.json`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return buildLemmaElements({ data, strongsNumber, morphKey, langConfig, textid });
  }

  loadAllStrongs(options, targetEl) {
    this.cancelLoads();
    const requestId = this.requestId;
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    Promise.allSettled(options.map((option) => this.loadStrongsData(option, signal)))
      .then((results) => {
        if (requestId !== this.requestId) return;
        this.abortController = null;
        this.body.classList.remove('loading-indicator');
        this.body.innerHTML = '';
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            this.body.append(...result.value);
          } else {
            const { langConfig, strongsNumber } = options[index];
            this.body.appendChild(elem('div', {
              className: 'lemma-error',
              textContent: `Error loading ... ${langConfig.langPrefix}${strongsNumber}`
            }));
          }
        });
        this.popup.position(targetEl);
      });
  }

  handleFindAll(event) {
    const link = event.target.closest('.lemma-findall');
    if (!link) return;
    const lemma = link.getAttribute('data-lemma');
    const textid = link.getAttribute('data-textid');
    const appInstance = getApp();
    appInstance?.windowManager?.add('SearchWindow', { searchtext: lemma, textid });
    this.popup.hide();
  }

  handleWordClick(event) {
    const lemmaEl = event.target.closest('.BibleWindow l');
    if (!lemmaEl) return;
    if (this.isCurrentWord(lemmaEl)) {
      this.popup.hide();
      this.clearSelection();
      return;
    }
    this.selectWord(lemmaEl);
  }

  isCurrentWord(lemmaEl) {
    return this.container.matches(':popover-open') && this.popup.currentWord === lemmaEl;
  }

  selectWord(lemmaEl) {
    this.popup.currentWord = lemmaEl;
    document.querySelectorAll('.selected-lemma').forEach((el) => el.classList.remove('selected-lemma'));
    lemmaEl.classList.add('selected-lemma');
    const strongs = parseStrongs(lemmaEl.getAttribute('s'));
    const morphs = parseMorphs(lemmaEl.getAttribute('m'));
    const bookId = lemmaEl.closest('.verse, .v')?.getAttribute('data-id')?.substring(0, 2) ?? '';
    const textid = lemmaEl.closest('.chapter')?.getAttribute('data-textid') ?? '';
    const sectionLang = lemmaEl.closest('.section')?.getAttribute('lang') ?? '';
    const langConfig = getLangConfig(sectionLang, bookId);
    if (strongs.length > 1) removeArticle(strongs, morphs, langConfig.langPrefix);
    this.popup.show();
    this.popup.position(lemmaEl);
    if (strongs.length === 0) {
      this.cancelLoads();
      this.body.classList.remove('loading-indicator');
      this.body.innerHTML = 'No Strong\'s data available';
      return;
    }
    this.body.innerHTML = '';
    this.body.classList.add('loading-indicator');
    const options = strongs.map((strongsNumber, index) => ({
      textid,
      strongsNumber,
      morphKey: morphs[index] || '',
      langConfig
    }));
    this.loadAllStrongs(options, lemmaEl);
  }
}

export function LemmaPopupPlugin() {
  const config = getConfig();
  if (!config.enableLemmaPopupPlugin) return {};
  return new LemmaPopupController(config);
}

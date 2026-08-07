/**
 * Highlights or replaces second person plural pronouns in English texts.
 *
 * @author John Dyer (http://j.hn/)
 */

import { elem } from '../lib/helpers.esm.js';
import { getConfig } from '../core/config.js';
import { MovableWindow } from '../ui/MovableWindow.js';
import { mixinEventEmitter } from '../common/EventEmitter.js';
import AppSettings from '../common/AppSettings.js';
import twoPeopleSvg from '../../css/images/two-people.svg?raw';

const eng2p = {
  youPluralRegExp: /\b(?:ye|you(?:r(?:s(?:elves)?)?)?)\b/gi,
  forms: ["Y'all", "Y'all's", "Y'all's", "Y'allselves"],

  removePluralTransforms(node) {
    node.querySelectorAll('.eng2p-corrected').forEach((el) => el.remove());
    node.querySelectorAll('.eng2p-highlight, .eng2p-original').forEach((span) => {
      span.replaceWith(document.createTextNode(span.textContent));
    });
    node.querySelectorAll('.eng2p-verbs').forEach((verse) => verse.classList.remove('eng2p-verbs'));
    node.normalize();
  },

  replacement(match) {
    const formIndex = { ye: 0, you: 0, your: 1, yours: 2, yourselves: 3 }[match.toLowerCase()];
    if (formIndex == null) return match;
    const replacement = this.forms[formIndex].replaceAll("'", '’');
    const first = match[0] === match[0].toUpperCase()
      ? replacement[0].toUpperCase()
      : replacement[0].toLowerCase();
    return first + replacement.slice(1);
  }
};

const PLURAL_OPTIONS = [
  { value: 'none', label: 'None', forms: ['You', 'Your', 'Yours', 'Yourselves'] },
  { value: 'highlight', label: 'Highlight', forms: ['You', 'Your', 'Yours', 'Yourselves'], demo: true },
  { value: 'youall', label: 'General US', forms: ['You all', "You all's", "You all's", 'You allselves'] },
  { value: 'yall', label: 'Southern US', forms: ["Y'all", "Y'all's", "Y'all's", "Y'allselves"] },
  { value: 'youguys', label: 'Western US', forms: ['You guys', "Your guys's", "Your guys's", 'Your guys selves'] },
  { value: 'youseguys', label: 'NYC/Chicago', forms: ['Youse guys', "Youse guys's", "Youse guys's", 'Youse guys selves'] },
  { value: 'yinz', label: 'Pittsburgh', forms: ['Yinz', "Yinz's", "Yinz's", 'Yinzselves'] },
  { value: 'youlot', label: 'United Kingdom', forms: ['You lot', "You lot's", "You lot's", "Yourlot's"] },
  { value: 'ye', label: 'Old English', forms: ['Ye', "Ye's", "Ye's", 'Yeselves'] }
];

const SKIP_TEXT_SELECTOR = '.verse-num, .v-num, .note, .cf, .chapter-num, .c, .c-num, script, style';

function transformTextNode(textNode, setting) {
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  eng2p.youPluralRegExp.lastIndex = 0;
  for (const match of textNode.data.matchAll(eng2p.youPluralRegExp)) {
    fragment.append(textNode.data.slice(lastIndex, match.index));
    if (setting.eng2p === 'highlight') {
      fragment.appendChild(elem('span', { className: 'eng2p-highlight', textContent: match[0] }));
    } else {
      fragment.append(
        elem('span', { className: 'eng2p-original', textContent: match[0] }),
        elem('span', { className: 'eng2p-corrected', textContent: eng2p.replacement(match[0]) })
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex === 0) return;
  fragment.append(textNode.data.slice(lastIndex));
  textNode.replaceWith(fragment);
}

// Loaded on first use, not at import: the feature is off by default, and the id
// list is ~69 kB of JSON. A Set, because this is probed once per verse rendered.
let pluralVerses = null;
let pluralVersesPromise = null;
function loadPluralVerses() {
  pluralVersesPromise ??= import('../data/eng2p-verses.json')
    .then(({ default: data }) => { pluralVerses = new Set(data.secondPersonPlurals); });
  return pluralVersesPromise;
}

const isEnglishLang = (lang) => {
  if (!lang) return false;
  const normalized = lang.toLowerCase();
  return normalized === 'en' || normalized === 'eng' ||
    normalized.startsWith('en-') || normalized.startsWith('eng-');
};

function updatePluralForms(setting) {
  const option = PLURAL_OPTIONS.find(({ value }) => value === setting.eng2p);
  if (option) eng2p.forms = option.forms;
}

function runPluralTransforms(node, setting) {
  if (setting.eng2p === 'none') return;
  node.querySelectorAll('.verse, .v').forEach((verse) => {
    const verseid = verse.getAttribute('data-id');
    if (!pluralVerses?.has(verseid) || verse.classList.contains('eng2p-verbs')) return;
    verse.classList.add('eng2p-verbs');
    const walker = document.createTreeWalker(verse, NodeFilter.SHOW_TEXT, {
      acceptNode: (textNode) => textNode.parentElement.closest(SKIP_TEXT_SELECTOR)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((textNode) => transformTextNode(textNode, setting));
  });
}

async function transformEnglishChapters(root, setting, isCurrent = () => true) {
  if (setting.eng2p !== 'none') await loadPluralVerses();
  if (!isCurrent()) return;
  root.querySelectorAll('div.chapter[lang]').forEach((chapter) => {
    if (!isEnglishLang(chapter.getAttribute('lang'))) return;
    eng2p.removePluralTransforms(chapter);
    runPluralTransforms(chapter, setting);
  });
}

async function handleTextLoad(event, getSetting) {
  if (event.data.messagetype !== 'textload' || event.data.type !== 'bible') return;
  const contentEl = event.data.content;
  const setting = getSetting();
  if (!contentEl || typeof contentEl === 'string' || setting.eng2p === 'none') return;
  await loadPluralVerses();
  if (setting !== getSetting()) return;
  if (isEnglishLang(contentEl.getAttribute('lang')) && contentEl.classList.contains('chapter')) {
    runPluralTransforms(contentEl, setting);
  }
  contentEl.querySelectorAll('div.chapter[lang]').forEach((chapter) => {
    if (isEnglishLang(chapter.getAttribute('lang'))) runPluralTransforms(chapter, setting);
  });
}

function createOptionRow(option) {
  const input = elem('input', {
    type: 'radio',
    name: 'eng2p-option',
    id: `eng2p-option-${option.value}`,
    value: option.value
  });
  const label = elem('label', { htmlFor: input.id, textContent: option.label });
  const cells = option.forms.map((form) => elem('td', {},
    option.demo ? elem('span', { className: 'eng2p-highlight-demo', textContent: form }) : form
  ));
  return elem('tr', {}, elem('th', {}, input, label), cells);
}

export const Eng2pPlugin = () => {
  const config = getConfig();

  if (!config.enableEng2pPlugin) {
    return {};
  }

  const engWindow = MovableWindow(550, 290);

  const configBlock = elem('div', { className: 'config-options', id: 'config-eng2p' });
  const availableOptions = config.eng2pEnableAll ? PLURAL_OPTIONS : PLURAL_OPTIONS.slice(0, 2);
  configBlock.append(
    elem('p', { className: 'i18n', dataset: { i18n: '[html]plugins.eng2p.description' } }),
    elem('table', {}, elem('tbody', {}, availableOptions.map(createOptionRow)))
  );

  engWindow.body.appendChild(configBlock);

  const configToolsBody = document.querySelector('#config-tools .config-body');
  const button = elem('span', { className: 'config-button i18n', id: 'config-eng2p-button', dataset: { i18n: '[html]plugins.eng2p.title' } });
  const e2pIconSpan = elem('span', { className: 'config-button-icon' });
  e2pIconSpan.innerHTML = twoPeopleSvg;
  button.prepend(e2pIconSpan);

  if (configToolsBody) {
    configToolsBody.appendChild(button);
  }

  const engWindowTitle = engWindow.title;
  engWindowTitle.classList.add('i18n');
  engWindowTitle.setAttribute('data-i18n', '[html]plugins.eng2p.title');

  button.addEventListener('click', () => {
    // Close the config popover first
    const configWindow = document.getElementById('config-window');
    if (configWindow?.matches(':popover-open')) {
      configWindow.hidePopover();
    }

    engWindow.show();
  });

  let eng2pSetting = AppSettings.getValue('docs-config-eng2p-setting', { eng2p: config.eng2pDefaultSetting });

  const params = Object.fromEntries(new URLSearchParams(window.location.search));

  if (params.eng2p !== undefined) {
    const tempEng2pSetting = params.eng2p;

    if (availableOptions.some(({ value }) => value === tempEng2pSetting)) {
      eng2pSetting.eng2p = tempEng2pSetting;
    }
  }

  if (params.eng2pshow !== undefined || config.eng2pShowWindowAtStartup === true) {
    engWindow.show();
    const engWindowContainer = engWindow.container;
    engWindowContainer.style.left = `${window.innerWidth - engWindowContainer.offsetWidth - 10}px`;
  }

  const optionInput = document.getElementById(`eng2p-option-${eng2pSetting.eng2p}`);
  if (optionInput) {
    optionInput.checked = true;
  }
  updatePluralForms(eng2pSetting);

  configBlock.querySelectorAll('input[name="eng2p-option"]').forEach((input) => {
    input.addEventListener('click', function() {
      eng2pSetting = { eng2p: this.value };

      AppSettings.setValue('docs-config-eng2p-setting', eng2pSetting);

      updatePluralForms(eng2pSetting);
      const requestedSetting = eng2pSetting;
      transformEnglishChapters(document, requestedSetting, () => eng2pSetting === requestedSetting);
    });
  });

  const ext = {};

  mixinEventEmitter(ext);

  ext.on('message', (e) => handleTextLoad(e, () => eng2pSetting));

  return ext;
};

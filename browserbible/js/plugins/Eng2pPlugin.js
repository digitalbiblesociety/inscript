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
  youPluralRegExp: /\b([yY])(e|ou(r(s(elves)?)?)?)\b/g,

  youPluralSubject: "Y'all",
  youPluralPossessiveDeterminer: "Y'all's",
  youPluralPossessivePronoun: "Y'all's",
  youPluralReflexive: "Y'allselves",

  removePluralTransforms(node) {
    const nodeEl = node;

    nodeEl.querySelectorAll('.eng2p-corrected').forEach((el) => {
      el.parentNode.removeChild(el);
    });

    // remove the surrounding spans
    nodeEl.querySelectorAll('.eng2p-highlight').forEach((span) => {
      span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
    });

    // remove the surrounding spans
    nodeEl.querySelectorAll('.eng2p-original').forEach((span) => {
      span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
    });

    // remove the eng2p-verbs class from verses
    nodeEl.querySelectorAll('.eng2p-verbs').forEach((verse) => {
      verse.classList.remove('eng2p-verbs');
    });
  },

  highlightPlurals(input) {
    return input.replace(this.youPluralRegExp, (match) => `<span class="eng2p-highlight">${match}</span>`);
  },

  replacePlurals(input) {
    return input.replace(this.youPluralRegExp, (match, $1) => {
      let replacement = '';

      switch (match.toLowerCase()) {
        case 'ye':
        case 'you':
          replacement = this.youPluralSubject;
          break;
        case 'your':
          replacement = this.youPluralPossessiveDeterminer;
          break;
        case 'yours':
          replacement = this.youPluralPossessivePronoun;
          break;
        case 'yourselves':
          replacement = this.youPluralReflexive;
          break;
        default:
          replacement = match;
          break;
      }

      // You vs. you
      if ($1 === $1.toUpperCase()) {
        replacement = replacement.substring(0, 1).toUpperCase() + replacement.substring(1);
      } else {
        replacement = replacement.substring(0, 1).toLowerCase() + replacement.substring(1);
      }

      // replace standard ' with '
      replacement = replacement.replace(/'/gi, '&rsquo;');

      return `<span class="eng2p-original">${match}</span><span class="eng2p-corrected">${replacement}</span>`;
    });
  }
};

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

function updatePluralValues(setting) {
  const selectedOption = document.getElementById(`eng2p-option-${setting.eng2p}`);
  const cells = selectedOption?.closest('tr')?.querySelectorAll('td');
  if (!cells) return;
  eng2p.youPluralSubject = cells[0]?.innerHTML ?? '';
  eng2p.youPluralPossessiveDeterminer = cells[1]?.innerHTML ?? '';
  eng2p.youPluralPossessivePronoun = cells[2]?.innerHTML ?? '';
  eng2p.youPluralReflexive = cells[3]?.innerHTML ?? '';
}

function runPluralTransforms(node, setting) {
  node.querySelectorAll('.verse, .v').forEach((verse) => {
    const verseid = verse.getAttribute('data-id');
    if (!pluralVerses?.has(verseid) || verse.classList.contains('eng2p-verbs')) return;
    verse.classList.add('eng2p-verbs');
    let html = verse.innerHTML;
    if (setting.eng2p === 'highlight') html = eng2p.highlightPlurals(html);
    else if (setting.eng2p !== 'none') html = eng2p.replacePlurals(html);
    verse.innerHTML = html;
  });
}

async function transformEnglishChapters(root, setting) {
  if (setting.eng2p !== 'none') await loadPluralVerses();
  root.querySelectorAll('div.chapter[lang]').forEach((chapter) => {
    if (!isEnglishLang(chapter.getAttribute('lang'))) return;
    eng2p.removePluralTransforms(chapter);
    runPluralTransforms(chapter, setting);
  });
}

async function handleTextLoad(event, setting) {
  if (event.data.messagetype !== 'textload' || event.data.type !== 'bible') return;
  const contentEl = event.data.content;
  if (!contentEl || typeof contentEl === 'string' || setting.eng2p === 'none') return;
  await loadPluralVerses();
  if (isEnglishLang(contentEl.getAttribute('lang')) && contentEl.classList.contains('chapter')) {
    runPluralTransforms(contentEl, setting);
  }
  contentEl.querySelectorAll('div.chapter[lang]').forEach((chapter) => {
    if (isEnglishLang(chapter.getAttribute('lang'))) runPluralTransforms(chapter, setting);
  });
}

export const Eng2pPlugin = () => {
  const config = getConfig();

  if (!config.enableEng2pPlugin) {
    return {};
  }

  const engWindow = MovableWindow(550, 290);

  let optionsHtml = '';
  if (config.eng2pEnableAll === true) {
    optionsHtml = `
      <tr>
        <th>
          <input type="radio" name="eng2p-option" id="eng2p-option-youall" value="youall" />
          <label for="eng2p-option-youall">General US</label>
        </th>
        <td>You all</td>
        <td>You all's</td>
        <td>You all's</td>
        <td>You allselves</td>
      </tr>
      <tr>
        <th>
          <input type="radio" name="eng2p-option" id="eng2p-option-yall" value="yall" />
          <label for="eng2p-option-yall">Southern US</label>
        </th>
        <td>Y'all</td>
        <td>Y'all's</td>
        <td>Y'all's</td>
        <td>Y'allselves</td>
      </tr>
      <tr>
        <th>
          <input type="radio" name="eng2p-option" id="eng2p-option-youguys" value="youguys" />
          <label for="eng2p-option-youguys">Western US</label>
        </th>
        <td>You guys</td>
        <td>Your guys's</td>
        <td>Your guys's</td>
        <td>Your guys selves</td>
      </tr>
      <tr>
        <th>
          <input type="radio" name="eng2p-option" id="eng2p-option-youseguys" value="youseguys" />
          <label for="eng2p-option-youseguys">NYC/Chicago</label>
        </th>
        <td>Youse guys</td>
        <td>Youse guys's</td>
        <td>Youse guys's</td>
        <td>Youse guys selves</td>
      </tr>
      <tr>
        <th>
          <input type="radio" name="eng2p-option" id="eng2p-option-yinz" value="yinz" />
          <label for="eng2p-option-yinz">Pittsburgh</label>
        </th>
        <td>Yinz</td>
        <td>Yinz's</td>
        <td>Yinz's</td>
        <td>Yinzselves</td>
      </tr>
      <tr>
        <th>
          <input type="radio" name="eng2p-option" id="eng2p-option-youlot" value="youlot" />
          <label for="eng2p-option-youlot">United Kingdom</label>
        </th>
        <td>You lot</td>
        <td>You lot's</td>
        <td>You lot's</td>
        <td>Yourlot's</td>
      </tr>
      <tr>
        <th>
          <input type="radio" name="eng2p-option" id="eng2p-option-ye" value="ye" />
          <label for="eng2p-option-ye">Old English</label>
        </th>
        <td>Ye</td>
        <td>Ye's</td>
        <td>Ye's</td>
        <td>Yeselves</td>
      </tr>`;
  }

  const configBlock = elem('div', { className: 'config-options', id: 'config-eng2p' });
  configBlock.innerHTML = `
    <p class="i18n" data-i18n="[html]plugins.eng2p.description"></p>
    <table>
      <tbody>
        <tr>
          <th>
            <input type="radio" name="eng2p-option" id="eng2p-option-none" value="none" />
            <label for="eng2p-option-none">None</label>
          </th>
          <td>You</td>
          <td>Your</td>
          <td>Yours</td>
          <td>Yourselves</td>
        </tr>
        <tr>
          <th>
            <input type="radio" name="eng2p-option" id="eng2p-option-highlight" value="highlight" />
            <label for="eng2p-option-highlight">Highlight</label>
          </th>
          <td><span class="eng2p-highlight-demo">You</span></td>
          <td><span class="eng2p-highlight-demo">Your</span></td>
          <td><span class="eng2p-highlight-demo">Yours</span></td>
          <td><span class="eng2p-highlight-demo">Yourselves</span></td>
        </tr>
        ${optionsHtml}
      </tbody>
    </table>
  `;

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

  if (params['eng2p'] !== undefined) {
    const tempEng2pSetting = params['eng2p'];

    if (document.getElementById(`eng2p-option-${tempEng2pSetting}`)) {
      eng2pSetting.eng2p = tempEng2pSetting;
    }
  }

  if (params['eng2pshow'] !== undefined || config.eng2pShowWindowAtStartup === true) {
    engWindow.show();
    const engWindowContainer = engWindow.container;
    engWindowContainer.style.left = `${window.innerWidth - engWindowContainer.offsetWidth - 10}px`;
  }

  const optionInput = document.getElementById(`eng2p-option-${eng2pSetting.eng2p}`);
  if (optionInput) {
    optionInput.checked = true;
  }
  updatePluralValues(eng2pSetting);

  document.querySelectorAll('input[name="eng2p-option"]').forEach((input) => {
    input.addEventListener('click', function() {
      eng2pSetting = { eng2p: this.value };

      AppSettings.setValue('docs-config-eng2p-setting', eng2pSetting);

      updatePluralValues(eng2pSetting);
      transformEnglishChapters(document, eng2pSetting);
    });
  });

  let ext = {
    sendMessage() {}
  };

  mixinEventEmitter(ext);

  ext.on('message', (e) => handleTextLoad(e, eng2pSetting));

  return ext;
};

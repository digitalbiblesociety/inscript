/** Highlights words by Strong's number or Greek/Hebrew morphology. */

import { elem, offset } from '../lib/helpers.esm.js';
import { mixinEventEmitter } from '../common/EventEmitter.js';
import { getConfig } from '../core/config.js';
import AppSettings from '../common/AppSettings.js';
import { MovableWindow } from '../ui/MovableWindow.js';
import morphologySvg from '../../css/images/morphology.svg?raw';
import { MorphologySelector } from './MorphologySelector.js';
import { createFilterRow, drawTransforms, readTransforms, removeFilterRow } from './VisualFilterRows.js';

/** "background-color" -> "backgroundColor" */
const toCamelCase = (str) => {
  return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
};

const applyStyle = (node, css) => {
  if (css == null || css === '') return;

  for (const prop of css.split(';')) {
    const parts = prop.split(':');
    if (parts.length === 2) {
      node.style[toCamelCase(parts[0].trim())] = parts[1].trim();
    }
  }
};

const matchesTransform = (word, transform) => {
  if (!transform.active) return false;

  if (transform.strongs !== '' && word.getAttribute('s') !== transform.strongs) return false;

  if (transform.morph !== '' && transform.morphRegExp?.test) {
    const wordMorphData = word.getAttribute('m');
    if (wordMorphData == null || !transform.morphRegExp.test(wordMorphData)) return false;
  }

  // Must have at least one filter criteria
  return transform.strongs !== '' || transform.morph !== '';
};

const VisualTransformer = {
  resetTransforms(visualSettings) {
    document.querySelectorAll('l').forEach(el => {
      el.setAttribute('style', '');
    });

    document.querySelectorAll('.section').forEach(section => {
      VisualTransformer.runTransforms(section, visualSettings);
    });
  },

  runTransforms(sectionNode, visualSettings) {
    if (visualSettings.transforms.length === 0) return;

    sectionNode.querySelectorAll('l').forEach(word => {
      for (const transform of visualSettings.transforms) {
        if (matchesTransform(word, transform)) {
          applyStyle(word, transform.style);
        }
      }
    });
  },

  applyStyle
};

export function VisualFilters() {
  const config = getConfig();

  if (!config.enableVisualFilters) {
    return {};
  }

  const settingsKey = 'docs-config-visualfilters';

  const filtersWindow = MovableWindow(580, 320);
  filtersWindow.hide();

  const defaultSettings = {
    transforms: [
      {
        active: false,
        strongs: 'G2424',
        morphType: '',
        morph: '',
        styleType: 'underline',
        styleColor: '#ff3333'
      },
      {
        active: false,
        strongs: '',
        morphType: 'robinson',
        morph: 'V-A',
        styleType: 'text',
        styleColor: '#3333cc'
      },
      {
        active: false,
        strongs: '',
        morphType: 'morphhb',
        morph: 'Np',
        styleType: 'text',
        styleColor: '#999999'
      }
    ]
  };

  const visualSettings = AppSettings.getValue(settingsKey, defaultSettings);

  const visualNode = elem('div', { id: 'visualfilters-config' });
  const addRowButton = elem('input', { type: 'button', value: 'New Filter' });
  const visualGrid = elem('div', {
    className: 'visualfilters-grid',
    style: {
      display: 'grid',
      gridTemplateColumns: 'auto 1fr 1fr 1fr auto',
      gap: '4px 8px',
      alignItems: 'center'
    }
  });
  const thActive = elem('div', { className: 'visualfilters-active visualfilters-th' });
  const thStrongs = elem('div', { className: 'visualfilters-strongs visualfilters-th i18n', dataset: { i18n: '[html]plugins.visualfilters.strongsnumber' } }, "Strong's");
  const thMorph = elem('div', { className: 'visualfilters-morph visualfilters-th i18n', dataset: { i18n: '[html]plugins.visualfilters.morphology' } }, 'Morphology');
  const thStyle = elem('div', { className: 'visualfilters-style visualfilters-th i18n', dataset: { i18n: '[html]plugins.visualfilters.style' } }, 'Style');
  const thRemove = elem('div', { className: 'visualfilters-remove visualfilters-th' });
  visualGrid.append(thActive, thStrongs, thMorph, thStyle, thRemove);
  const tbody = visualGrid; // tbody is now the grid itself (rows added directly)
  visualNode.append(addRowButton, visualGrid);

  const filtersWindowBody = filtersWindow.body;
  filtersWindowBody.appendChild(visualNode);

  const morphSelector = MorphologySelector();

  const configToolsBody = document.querySelector('#config-tools .config-body');
  const openVisualizationsButton = elem('span', { className: 'config-button i18n', id: 'config-visualfilters-button', dataset: { i18n: '[html]plugins.visualfilters.button' } });
  openVisualizationsButton.prepend(elem('span', { className: 'config-button-icon', innerHTML: morphologySvg }));

  if (configToolsBody) {
    configToolsBody.appendChild(openVisualizationsButton);
  }

  const saveTransforms = () => {
    visualSettings.transforms = readTransforms(tbody);
    AppSettings.setValue(settingsKey, visualSettings);
  };

  addRowButton.addEventListener('click', () => {
    const row = createFilterRow();
    tbody.appendChild(row);
  });

  const filtersWindowTitle = filtersWindow.title;
  filtersWindowTitle.classList.add('i18n');
  filtersWindowTitle.setAttribute('data-i18n', '[html]plugins.visualfilters.title');

  openVisualizationsButton.addEventListener('click', () => {
    filtersWindow.show();

    // Close the config window popover when opening visual filters
    const configWindow = document.querySelector('#config-window');
    if (configWindow?.matches(':popover-open')) {
      configWindow.hidePopover();
    }
  });

  tbody.addEventListener('click', (e) => {
    const target = e.target.closest('.visualfilters-remove');
    if (!target) return;

    removeFilterRow(target);
    saveTransforms();
    VisualTransformer.resetTransforms(visualSettings);
  });

  tbody.addEventListener('change', (e) => {
    const target = e.target.closest('.visualfilters-active input, .visualfilters-morph select, .visualfilters-strongs input, .visualfilters-morph input, .style-type, .style-color');
    if (target) {
      saveTransforms();
      VisualTransformer.resetTransforms(visualSettings);
    }
  });

  let keyupTimer = null;
  tbody.addEventListener('keyup', (e) => {
    const target = e.target.closest('.visualfilters-strongs input, .visualfilters-morph input');
    if (target) {
      clearTimeout(keyupTimer);
      keyupTimer = setTimeout(() => {
        saveTransforms();
        VisualTransformer.resetTransforms(visualSettings);
      }, 250);
    }
  });

  const filtersWindowContainer = filtersWindow.container;
  const closeButton = filtersWindowContainer.querySelector('.close-button');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      morphSelector.style.display = 'none';
    });
  }

  filtersWindowBody.addEventListener('click', (e) => {
    const input = e.target.closest('.visualfilters-morph input');
    if (!input) return;
    e.preventDefault();

    const morphSelectorVisible = morphSelector.style.display !== 'none';
    if (morphSelectorVisible && morphSelector.currentInput != null && morphSelector.currentInput === input) {
      morphSelector.style.display = 'none';
      return;
    }

    const inputOffset = offset(input);
    morphSelector.style.top = `${inputOffset.top + input.offsetHeight}px`;
    morphSelector.style.left = `${inputOffset.left}px`;
    morphSelector.style.display = '';

    morphSelector.currentInput = input;
    const selectSibling = [...input.parentElement.children].find(s => s !== input && s.matches('select'));
    morphSelector.setMorphology(selectSibling?.value ?? '');
    morphSelector.updateMorphSelector(input.value);
  });

  morphSelector.addEventListener('update', () => {
    saveTransforms();
    VisualTransformer.resetTransforms(visualSettings);
  });

  filtersWindowBody.addEventListener('click', (event) => {
    if (event.target.closest('.visualfilters-morph input')) return;
    if (morphSelector.style.display !== 'none') {
      morphSelector.style.display = 'none';
    }
  });

  let ext = {
    sendMessage: () => {}
  };
  mixinEventEmitter(ext);

  ext.on('message', (e) => {
    if (e.data.messagetype === 'textload') {
      const contentEl = e.data.content;
      const lang = contentEl && typeof contentEl !== 'string'
        ? contentEl.getAttribute('lang')
        : null;

      // Prefix match so variants like 'eng-Latn-US' and 'heb-Hebr' still count.
      const validLangPrefixes = ['heb', 'gre', 'grc', 'eng'];
      const isValidLang = lang && validLangPrefixes.some(prefix =>
        lang === prefix || lang.startsWith(prefix + '-')
      );

      if (isValidLang) {
        VisualTransformer.runTransforms(contentEl, visualSettings);
      }
    }
  });

  drawTransforms(tbody, visualSettings.transforms);
  saveTransforms();

  return ext;
}

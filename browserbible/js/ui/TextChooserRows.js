import { elem } from '../lib/helpers.esm.js';
import { matchRanges } from '../lib/fuzzy.js';
import { displayAbbr, getTextIdentity } from '../texts/TextLoader.js';
import { hasAudioContent } from './TextChooserData.js';
import audioEarSvg from '../../css/images/audio-ear.svg?raw';
import morphSvg from '../../css/images/morphology-gray-dark.svg?raw';
import bibleApiLogoSvg from '../../public/img/bible-api_logo.svg?raw';
import bibleBrainLogoSvg from '../../public/img/bible-brain_logo.svg?raw';

export const ROW_HEIGHT = 32;
const BUFFER_ROWS = 5;

function iconTemplate(className, svg, title) {
  const element = document.createElement('span');
  element.className = className;
  if (title) element.title = title;
  element.innerHTML = svg;
  return element;
}

const templates = {
  lemma: iconTemplate('text-chooser-lemma', morphSvg),
  audio: iconTemplate('text-chooser-audio', audioEarSvg),
  apibible: iconTemplate('text-chooser-provider-apibible', bibleApiLogoSvg, 'Powered by API.Bible'),
  biblebrain: iconTemplate('text-chooser-provider-biblebrain', bibleBrainLogoSvg, 'Powered by Bible Brain')
};

function highlighted(controller, value) {
  if (!controller.filterTokens.length || !value) return value;
  const ranges = matchRanges(value, controller.filterTokens);
  if (!ranges.length) return value;
  const parts = [];
  let position = 0;
  for (const [start, end] of ranges) {
    if (start > position) parts.push(value.slice(position, start));
    parts.push(elem('mark', { className: 'text-chooser-match' }, value.slice(start, end)));
    position = end;
  }
  if (position < value.length) parts.push(value.slice(position));
  return parts;
}

function appendLangCode(row, item) {
  if (item.langCode) row.appendChild(elem('span', { className: 'text-chooser-lang-code' }, item.langCode));
}

function appendBadges(row, text) {
  if (text.hasLemma) row.appendChild(templates.lemma.cloneNode(true));
  if (hasAudioContent(text)) row.appendChild(templates.audio.cloneNode(true));
  if (templates[text.providerName]) row.appendChild(templates[text.providerName].cloneNode(true));
}

function buildTextRow(controller, row, item) {
  const text = item.data;
  const selected = getTextIdentity(controller.selectedTextInfo) === getTextIdentity(text);
  row.className = `text-chooser-row${selected ? ' selected' : ''}`;
  row.dataset.id = getTextIdentity(text);
  row.appendChild(elem('span', { className: 'text-chooser-abbr' },
    highlighted(controller, displayAbbr(text))));
  row.appendChild(elem('span', { className: 'text-chooser-name' },
    highlighted(controller, text.name)));
  appendBadges(row, text);
}

function createRow(controller, item, top) {
  const row = elem('div', {
    style: { position: 'absolute', top: `${top}px`, left: '0', right: '0', height: `${ROW_HEIGHT}px` }
  });
  if (item.type === 'section-header') {
    row.className = 'text-chooser-row-header text-chooser-section-header';
    row.appendChild(elem('span', { className: 'name' }, item.data));
    appendLangCode(row, item);
  } else if (item.type === 'header') {
    row.className = 'text-chooser-row-header';
    row.dataset.langName = item.data;
    row.appendChild(elem('span', { className: 'name' }, highlighted(controller, item.data)));
    appendLangCode(row, item);
  } else {
    buildTextRow(controller, row, item);
  }
  return row;
}

export function renderVisible(controller) {
  if (!controller.processedData.length) return;
  const height = controller.refs.main.clientHeight;
  const start = Math.max(0, Math.floor(controller.scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const end = Math.min(controller.filteredIndices.length,
    Math.ceil((controller.scrollTop + height) / ROW_HEIGHT) + BUFFER_ROWS);
  const fragment = document.createDocumentFragment();
  for (let index = start; index < end; index++) {
    const item = controller.processedData[controller.filteredIndices[index]];
    fragment.appendChild(createRow(controller, item, index * ROW_HEIGHT));
  }
  controller.refs.scrollContent.replaceChildren(fragment);
}

export function scheduleRender(controller) {
  if (controller.rafId) return;
  controller.rafId = requestAnimationFrame(() => {
    controller.rafId = null;
    renderVisible(controller);
  });
}

export function renderNow(controller) {
  if (controller.rafId) cancelAnimationFrame(controller.rafId);
  controller.rafId = null;
  renderVisible(controller);
}

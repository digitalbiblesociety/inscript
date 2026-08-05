/** Highlights are persisted in localStorage, keyed by Bible version (textid). */

import { getConfig } from '../core/config.js';
import { elem } from '../lib/helpers.esm.js';
import { getWindowIcon } from '../core/windowIcons.js';
import { mixinEventEmitter } from '../common/EventEmitter.js';
import { addHighlight, removeHighlight, updateHighlightColor } from './HighlighterStorage.js';
import { applyHighlightMark, applyHighlightsToSection, getVerseOffset, recolorHighlightMarks, removeHighlightMarks } from './HighlighterMarks.js';
import { createPalette, hidePalette, showPalette } from './HighlighterPalette.js';

const CONTROLLER_SELECTORS = 'bible-window, commentary-window';

function getTextIdFromElement(el) {
  const controller = el.closest(CONTROLLER_SELECTORS)
    || el.querySelector(CONTROLLER_SELECTORS);
  return controller?.state?.currentTextInfo?.id || null;
}

class HighlighterController {
  constructor() {
    this.active = false;
    this.clearPending();
    this.toggleButton = elem('div', { className: 'main-menu-item highlighter-toggle' },
      elem('span', { className: 'main-menu-icon', innerHTML: getWindowIcon('highlighter') || '' }),
      'Highlight'
    );
    document.querySelector('#main-menu-features')?.appendChild(this.toggleButton);
    this.palette = createPalette(
      (color) => this.handleColorPick(color),
      () => this.handleErase()
    );
    this.extension = {};
    mixinEventEmitter(this.extension);
    this.bindEvents();
  }

  bindEvents() {
    this.toggleButton.addEventListener('click', (event) => this.toggle(event));
    document.querySelector('.windows-main')?.addEventListener('mouseup', (event) => this.handleMouseup(event));
    document.addEventListener('mousedown', (event) => this.handleOutsideClick(event));
    this.extension.on('message', (event) => this.handleMessage(event));
  }

  toggle(event) {
    event.preventDefault();
    this.setActive(!this.active);
    const menu = document.querySelector('#main-menu-dropdown');
    if (menu?.matches(':popover-open')) menu.hidePopover();
  }

  setActive(state) {
    this.active = state;
    this.toggleButton.classList.toggle('active', state);
    document.body.classList.toggle('highlighter-active', state);
    if (!state) {
      hidePalette(this.palette);
      window.getSelection()?.removeAllRanges();
    }
  }

  clearPending() {
    this.pendingSelection = null;
    this.pendingVerse = null;
    this.pendingTextId = null;
    this.pendingEditHlId = null;
    this.pendingEditTextId = null;
  }

  handleColorPick(color) {
    if (this.pendingEditHlId && this.pendingEditTextId) {
      recolorHighlightMarks(this.pendingEditHlId, color);
      updateHighlightColor(this.pendingEditTextId, this.pendingEditHlId, color);
      this.finishPaletteAction();
      return;
    }
    if (!this.pendingVerse || !this.pendingSelection || !this.pendingTextId) {
      hidePalette(this.palette);
      return;
    }
    const { startOffset, endOffset } = this.pendingSelection;
    const highlight = {
      id: 'hl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 11),
      verseId: this.pendingVerse.getAttribute('data-id'),
      startOffset,
      endOffset,
      color,
      created: Date.now()
    };
    window.getSelection()?.removeAllRanges();
    applyHighlightMark(this.pendingVerse, startOffset, endOffset, color, highlight.id);
    addHighlight(this.pendingTextId, highlight);
    this.applyToMatchingVerses(highlight);
    this.finishPaletteAction();
  }

  applyToMatchingVerses(highlight) {
    document.querySelectorAll(CONTROLLER_SELECTORS).forEach((controller) => {
      if (controller.state?.currentTextInfo?.id !== this.pendingTextId) return;
      const selector = `.v[data-id="${CSS.escape(highlight.verseId)}"], .verse[data-id="${CSS.escape(highlight.verseId)}"]`;
      controller.querySelectorAll(selector).forEach((verse) => {
        if (verse === this.pendingVerse) return;
        if (verse.querySelector(`.user-highlight[data-hl-id="${highlight.id}"]`)) return;
        applyHighlightMark(verse, highlight.startOffset, highlight.endOffset, highlight.color, highlight.id);
      });
    });
  }

  handleErase() {
    if (this.pendingEditHlId && this.pendingEditTextId) {
      removeHighlightMarks(this.pendingEditHlId);
      removeHighlight(this.pendingEditTextId, this.pendingEditHlId);
    }
    this.finishPaletteAction();
  }

  finishPaletteAction() {
    hidePalette(this.palette);
    this.clearPending();
  }

  handleMouseup(event) {
    if (this.active) setTimeout(() => this.processSelection(event), 10);
  }

  processSelection(event) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      this.editExistingHighlight(event.target.closest('.user-highlight'));
      return;
    }
    const range = selection.getRangeAt(0);
    const verse = this.getRangeVerse(range);
    const textid = verse && getTextIdFromElement(verse);
    if (!verse || !textid) {
      hidePalette(this.palette);
      return;
    }
    const startOffset = getVerseOffset(verse, range.startContainer, range.startOffset);
    const endOffset = getVerseOffset(verse, range.endContainer, range.endOffset);
    if (startOffset === endOffset) {
      hidePalette(this.palette);
      return;
    }
    this.pendingSelection = {
      startOffset: Math.min(startOffset, endOffset),
      endOffset: Math.max(startOffset, endOffset)
    };
    this.pendingVerse = verse;
    this.pendingTextId = textid;
    const rect = range.getBoundingClientRect();
    showPalette(this.palette, rect.left + rect.width / 2 - 75, rect.top - 40, null);
  }

  getRangeVerse(range) {
    const ancestor = range.commonAncestorContainer;
    return ancestor.nodeType === Node.TEXT_NODE
      ? ancestor.parentElement?.closest('.verse, .v')
      : ancestor.closest?.('.verse, .v');
  }

  editExistingHighlight(mark) {
    const highlightId = mark?.dataset.hlId;
    const textid = mark && getTextIdFromElement(mark);
    if (!highlightId || !textid) return;
    this.pendingEditHlId = highlightId;
    this.pendingEditTextId = textid;
    const rect = mark.getBoundingClientRect();
    showPalette(this.palette, rect.left + rect.width / 2 - 75, rect.top - 40, mark.style.backgroundColor);
  }

  handleOutsideClick(event) {
    if (!this.palette.contains(event.target) && this.palette.style.display !== 'none') {
      this.finishPaletteAction();
    }
  }

  handleMessage({ data }) {
    if (data.messagetype !== 'textload' || !data.textid || !data.sectionid) return;
    setTimeout(() => this.restoreSectionHighlights(data), 50);
  }

  restoreSectionHighlights(data) {
    document.querySelectorAll(CONTROLLER_SELECTORS).forEach((controller) => {
      if (controller.state?.currentTextInfo?.id !== data.textid) return;
      const section = controller.querySelector(`.section.${data.sectionid}`);
      if (!section || section.dataset.hlApplied) return;
      section.dataset.hlApplied = 'true';
      applyHighlightsToSection(data.textid, section);
    });
  }
}

export const HighlighterPlugin = () => {
  if (!getConfig().enableHighlighterPlugin) return {};
  return new HighlighterController().extension;
};

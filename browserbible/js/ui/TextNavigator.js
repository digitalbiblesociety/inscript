/** A popover for navigating Bible books, chapters, and localized passage titles. */

import { elem, offset } from '../lib/helpers.esm.js';
import { toBcp47Lang } from '../lib/bcp47.js';
import { i18n } from '../lib/i18n.js';
import { mixinEventEmitter } from '../common/EventEmitter.js';
import { addNames } from '../bible/BibleData.js';
import { Reference } from '../bible/BibleReference.js';
import { handleDivisionClick, renderDivisions, renderSections } from './TextNavigatorBooks.js';
import {
  applyFilter, ensurePericopes, filterBooks, highlightCurrentPassage,
  hasPericopeTranslation, renderActiveBookPassages, renderSearchResults, setActiveBook
} from './TextNavigatorPericopes.js';

function translation(key, fallback) {
  const value = i18n.t(key);
  return value === key ? fallback : value;
}

class TextNavigatorController {
  constructor() {
    this.container = null;
    this.target = null;
    this.isFull = false;
    this.textInfo = null;
    this.fullBookMode = false;
    this.activeBookId = null;
    this.lastFragmentid = null;
    this.buildUi();
    mixinEventEmitter(this);
    this.attachEvents();
  }

  buildUi() {
    const filter = elem('input', {
      className: 'text-navigator-filter', type: 'text',
      placeholder: translation('windows.bible.filterbooks', 'Filter books…')
    });
    const header = elem('div', { className: 'text-navigator-header' }, filter);
    const divisions = elem('div', { className: 'text-navigator-divisions' });
    const periHeader = elem('div', { className: 'text-navigator-peri-header' });
    const periList = elem('div', { className: 'text-navigator-peri-list' });
    const pericopes = elem('div', { className: 'text-navigator-pericopes' }, periHeader, periList);
    const body = elem('div', { className: 'text-navigator-body' }, divisions, pericopes);
    const changer = elem('div', { className: 'text-navigator nav-drop-list', popover: '' },
      header, body);
    document.body.appendChild(changer);
    this.refs = { filter, header, divisions, periHeader, periList, pericopes, body, changer };
  }

  attachEvents() {
    this.refs.filter.addEventListener('input', () => this.applyFilter());
    this.refs.filter.addEventListener('keydown', (event) => this.handleFilterKeydown(event));
    this.refs.periList.addEventListener('click', (event) => {
      const item = event.target.closest('.peri-item');
      if (item) this.navigateToPericope(item);
    });
    this.refs.changer.addEventListener('click', (event) => {
      const division = event.target.closest('.text-navigator-division');
      if (division) this.handleDivisionClick(division);
    });
    this.refs.changer.addEventListener('click', (event) => {
      const section = event.target.closest('.text-navigator-section');
      if (section) this.navigateToSection(section);
    });
  }

  hasPericopeTranslation() {
    return hasPericopeTranslation(this);
  }

  renderActiveBookPassages(bookid) {
    renderActiveBookPassages(this, bookid);
  }

  renderSearchResults(query) {
    return renderSearchResults(this, query);
  }

  filterBooks(query) {
    filterBooks(this, query);
  }

  applyFilter() {
    applyFilter(this);
  }

  highlightCurrentPassage(fragmentid) {
    highlightCurrentPassage(this, fragmentid);
  }

  setActiveBook(bookid, fragmentid) {
    setActiveBook(this, bookid, fragmentid);
  }

  handleFilterKeydown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (this.refs.filter.value.trim() && this.hasPericopeTranslation()) {
      this.navigateToPericope(this.refs.periList.querySelector('.peri-item'));
      return;
    }
    const division = [...this.refs.divisions.querySelectorAll('.text-navigator-division')]
      .find((item) => item.style.display !== 'none');
    if (division && !division.classList.contains('selected')) division.click();
  }

  navigateToPericope(item) {
    if (!item) return;
    this.trigger('change', {
      type: 'change', target: item,
      data: {
        sectionid: item.dataset.section, fragmentid: item.dataset.fragment,
        target: this.target
      }
    });
    this.hide();
  }

  navigateToSection(section) {
    section.classList.add('selected');
    this.trigger('change', {
      type: 'change', target: section,
      data: { sectionid: section.getAttribute('data-id'), target: this.target }
    });
    this.hide();
  }

  hide() {
    this.refs.changer.hidePopover();
  }

  toggle() {
    if (this.refs.changer.matches(':popover-open')) this.hide();
    else this.show();
  }

  applyDivisionAttrs() {
    this.refs.divisions.style.display = '';
    for (const element of [this.refs.divisions, this.refs.pericopes]) {
      if (this.textInfo.dir) element.setAttribute('dir', this.textInfo.dir);
      else element.removeAttribute('dir');
      if (this.textInfo.lang) element.setAttribute('lang', toBcp47Lang(this.textInfo.lang));
      else element.removeAttribute('lang');
    }
  }

  selectCurrentReference(fragmentid) {
    if (!fragmentid) return;
    const sectionid = fragmentid.split('_')[0];
    const divisionid = sectionid.substring(0, 2);
    const division = this.refs.changer.querySelector(`.divisionid-${divisionid}`);
    if (!division) return;
    division.classList.add('selected');
    this.renderSections(false);
    division.querySelector(`.section-${sectionid}`)?.classList.add('selected');
    this.setActiveBook(divisionid, fragmentid);
  }

  showBibleNav() {
    const stableFragmentid = this.target?.dataset.fragmentid;
    const reference = stableFragmentid ? null : Reference(this.target?.value ?? '');
    const fragmentid = stableFragmentid || (reference ? reference.toSection() : null);
    this.renderDivisions();
    this.applyDivisionAttrs();
    this.selectCurrentReference(fragmentid);
  }

  preparePericopes() {
    const language = this.textInfo?.lang;
    const translated = this.hasPericopeTranslation();
    if (translated) {
      ensurePericopes(language, () => {
        if (!this.refs.changer.matches(':popover-open')
          || this.textInfo?.lang !== language || !this.hasPericopeTranslation()) return;
        if (this.refs.filter.value.trim()) this.applyFilter();
        else if (this.activeBookId) this.setActiveBook(this.activeBookId, this.lastFragmentid);
      });
    }
    this.refs.changer.classList.toggle('text-navigator-2col', translated);
    this.refs.pericopes.style.display = translated ? '' : 'none';
    this.refs.filter.placeholder = translated
      ? translation('windows.bible.filterbooksorpassages', 'Filter books or passages…')
      : translation('windows.bible.filterbooks', 'Filter books…');
    this.refs.periHeader.textContent = '';
    this.refs.periList.innerHTML = '';
  }

  show() {
    if (!this.textInfo) {
      console.warn('navigator has no textInfo!');
      return;
    }
    this.refs.filter.value = '';
    this.activeBookId = null;
    this.preparePericopes();
    this.size();
    this.refs.changer.showPopover();
    this.size();
    this.refs.changer.querySelectorAll('.selected').forEach((element) => element.classList.remove('selected'));
    this.refs.divisions.scrollTop = 0;
    const type = (this.textInfo.type || 'bible').toLowerCase();
    if (['bible', 'deafbible', 'videobible', 'commentary'].includes(type)) this.showBibleNav();
    else if (type === 'book') {
      this.renderSections();
      this.refs.divisions.style.display = 'none';
    }
  }

  renderDivisions() {
    renderDivisions(this);
  }

  renderSections(animated) {
    renderSections(this, animated);
  }

  handleDivisionClick(division) {
    handleDivisionClick(this, division);
  }

  size(width, height) {
    if (this.isFull) {
      width ||= this.container.offsetWidth;
      height ||= this.container.offsetHeight;
      const containerOffset = offset(this.container);
      Object.assign(this.refs.changer.style, {
        width: `${width}px`, height: `${height}px`, top: `${containerOffset.top}px`,
        left: `${containerOffset.left}px`
      });
      return;
    }
    if (!this.target) return;
    const targetOffset = offset(this.target);
    const top = targetOffset.top + this.target.offsetHeight + 10;
    const maxHeight = window.innerHeight - 40 - top;
    let left = targetOffset.left;
    if (window.innerWidth < left + this.refs.changer.offsetWidth) {
      left = Math.max(0, window.innerWidth - this.refs.changer.offsetWidth);
    }
    Object.assign(this.refs.changer.style, {
      height: `${maxHeight}px`, top: `${top}px`, left: `${left}px`
    });
    this.refs.changer.style.setProperty('--arrow-left', `${targetOffset.left - left + 20}px`);
    this.refs.body.style.height = `${maxHeight - this.refs.header.offsetHeight}px`;
  }

  setTextInfo(textInfo) {
    this.textInfo = textInfo;
    if (!textInfo) return;
    if (this.hasPericopeTranslation()) ensurePericopes(textInfo.lang);
    if (textInfo.divisionNames) addNames(textInfo.lang, textInfo.divisions, textInfo.divisionNames);
  }

  isVisible() {
    return this.refs.changer.matches(':popover-open');
  }

  node() {
    return this.refs.changer;
  }

  close() {
    this.hide();
  }

  setTarget(container, target) {
    this.container = container;
    this.target = target;
  }

  getTarget() {
    return this.target;
  }

  destroy() {
    this.refs.changer.remove();
  }
}

export function TextNavigator() {
  return new TextNavigatorController();
}

let globalTextNavigator = null;

export function getGlobalTextNavigator() {
  globalTextNavigator ||= TextNavigator();
  return globalTextNavigator;
}

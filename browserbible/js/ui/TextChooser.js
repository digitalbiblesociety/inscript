/** Bible version dropdown; virtual-scrolled to stay smooth over long lists. */

import { elem, offset } from '../lib/helpers.esm.js';
import { mixinEventEmitter } from '../common/EventEmitter.js';
import AppSettings from '../common/AppSettings.js';
import { getText, loadTexts } from '../texts/TextLoader.js';
import {
  buildFilteredIndices, buildGroupedData, buildPinnedTop, processTexts
} from './TextChooserData.js';
import { renderNow, renderVisible, ROW_HEIGHT, scheduleRender } from './TextChooserRows.js';

const hasTouch = 'ontouchend' in document;
const RECENTLY_USED_KEY = 'texts-recently-used';

class TextChooserController {
  constructor() {
    this.textType = null;
    this.target = null;
    this.selectedTextInfo = null;
    this.listData = null;
    this.langFilter = null;
    this.processedData = [];
    this.filteredIndices = [];
    this.scrollTop = 0;
    this.filterText = '';
    this.filterTokens = [];
    this.rafId = null;
    this.recentlyUsed = AppSettings.getValue(RECENTLY_USED_KEY, { recent: [] });
    this.groupedCache = null;
    this.groupedCacheKey = null;
    this.processedDataKey = null;
    this.cachedChooserWidth = 320;
    this.buildUi();
    mixinEventEmitter(this);
    this.attachEvents();
  }

  buildUi() {
    const filter = elem('input', {
      type: 'text', className: 'text-chooser-filter-text i18n',
      dataset: { i18n: '[placeholder]windows.bible.filter' }
    });
    const scrollContent = elem('div', { className: 'text-chooser-scroll-content' });
    const main = elem('div', { className: 'text-chooser-main' }, scrollContent);
    const chooser = elem('div', {
      className: 'text-chooser nav-drop-list', popover: 'auto'
    }, elem('div', { className: 'text-chooser-header' }, filter), main);
    document.body.appendChild(chooser);
    this.refs = { filter, scrollContent, main, chooser };
  }

  attachEvents() {
    const { filter, main, scrollContent, chooser } = this.refs;
    filter.addEventListener('input', () => this.handleFilterInput());
    filter.addEventListener('keydown', (event) => this.handleFilterKeydown(event));
    main.addEventListener('scroll', () => this.handleScroll(), { passive: true });
    scrollContent.addEventListener('click', (event) => {
      const textid = event.target.closest('.text-chooser-row')?.getAttribute('data-id');
      if (textid) this.selectText(textid);
    });
    chooser.addEventListener('toggle', (event) => this.handleToggle(event));
    document.addEventListener('texts:provider-disabled', () => this.refresh());
  }

  clearFilter() {
    this.refs.filter.value = '';
    this.filterText = '';
    this.filterTokens = [];
    this.applyFilter();
  }

  handleFilterKeydown(event) {
    if (event.key !== 'Enter') return;
    const visible = this.filteredIndices.filter((index) => this.processedData[index].type === 'text');
    if (visible.length === 1) {
      this.selectText(this.processedData[visible[0]].data.id);
      this.clearFilter();
    }
  }

  handleFilterInput() {
    const value = this.refs.filter.value.toLowerCase().trim();
    if (value === this.filterText) return;
    this.filterText = value;
    this.filterTokens = value.split(/\s+/).filter(Boolean);
    this.applyFilter();
  }

  applyFilter() {
    this.filteredIndices = this.filterText
      ? this.buildFilteredIndices()
      : this.processedData.map((_, index) => index);
    this.updateScrollHeight();
    this.scheduleRender();
  }

  buildFilteredIndices() {
    return buildFilteredIndices(this);
  }

  handleScroll() {
    this.scrollTop = this.refs.main.scrollTop;
    this.scheduleRender();
  }

  scheduleRender() {
    scheduleRender(this);
  }

  renderNow() {
    renderNow(this);
  }

  renderVisible() {
    renderVisible(this);
  }

  updateScrollHeight() {
    this.refs.scrollContent.style.height = `${this.filteredIndices.length * ROW_HEIGHT}px`;
  }

  selectText(textid) {
    this.storeRecentlyUsed(textid);
    this.refs.chooser.hidePopover();
    const clickTarget = this.target;
    getText(textid, (data) => {
      this.selectedTextInfo = data;
      this.trigger('change', {
        type: 'change', target: null,
        data: { textInfo: data, textid, target: clickTarget }
      });
    });
  }

  storeRecentlyUsed(textInfo) {
    if (this.textType !== 'bible') return;
    const textid = typeof textInfo === 'string' ? textInfo : textInfo?.id;
    if (!textid) return;
    this.recentlyUsed.recent = this.recentlyUsed.recent.filter((id) => id !== textid);
    this.recentlyUsed.recent.unshift(textid);
    this.recentlyUsed.recent.splice(5);
    AppSettings.setValue(RECENTLY_USED_KEY, this.recentlyUsed);
  }

  buildGroupedData() {
    return buildGroupedData(this);
  }

  buildPinnedTop() {
    return buildPinnedTop(this);
  }

  processTexts(data) {
    processTexts(this, data);
  }

  setTarget(_container, target, textType, langFilter = null) {
    const rerender = textType !== this.textType || langFilter !== this.langFilter;
    this.target = target;
    this.textType = textType;
    this.langFilter = langFilter;
    if (rerender && this.listData) this.processTexts(this.listData);
  }

  getTarget() {
    return this.target;
  }

  getTextInfo() {
    return this.selectedTextInfo;
  }

  setTextInfo(textInfo) {
    this.selectedTextInfo = textInfo;
    if (textInfo) this.storeRecentlyUsed(textInfo);
    this.scheduleRender();
  }

  refresh() {
    this.listData = null;
    this.groupedCache = null;
    this.groupedCacheKey = null;
    this.processedData = [];
    this.processedDataKey = null;
    if (this.refs.chooser.matches(':popover-open')) {
      loadTexts((data) => {
        this.listData = data;
        this.processTexts(data);
        this.renderNow();
      });
    }
  }

  position() {
    if (!this.target) return;
    if (this.refs.chooser.offsetWidth) this.cachedChooserWidth = this.refs.chooser.offsetWidth;
    const targetOffset = offset(this.target);
    let left = targetOffset.left;
    if (window.innerWidth < left + this.cachedChooserWidth) {
      left = Math.max(0, window.innerWidth - this.cachedChooserWidth);
    }
    this.refs.chooser.style.top = `${targetOffset.top + this.target.offsetHeight + 10}px`;
    this.refs.chooser.style.left = `${left}px`;
  }

  handleToggle(event) {
    if (event.newState !== 'open') {
      this.trigger('offclick', { type: 'offclick' });
      return;
    }
    this.position();
    if (!this.listData) {
      this.refs.main.classList.add('loading-indicator');
      loadTexts((data) => {
        this.listData = data;
        this.refs.main.classList.remove('loading-indicator');
        this.processTexts(data);
      });
    } else {
      this.recentlyUsed = AppSettings.getValue(RECENTLY_USED_KEY, { recent: [] });
      this.processTexts(this.listData);
    }
    if (this.refs.filter.value) this.clearFilter();
    this.refs.main.scrollTop = 0;
    this.scrollTop = 0;
    if (this.listData) this.renderNow();
    if (!hasTouch) this.refs.filter.focus();
  }

  show() {
    this.position();
    this.refs.chooser.showPopover();
  }

  hide() {
    this.refs.chooser.hidePopover();
  }

  toggle() {
    if (!this.refs.chooser.matches(':popover-open')) this.position();
    this.refs.chooser.togglePopover();
  }

  isVisible() {
    return this.refs.chooser.matches(':popover-open');
  }

  node() {
    return this.refs.chooser;
  }

  size() {}
}

export function TextChooser() {
  return new TextChooserController();
}

let globalTextChooser = null;

export function getGlobalTextChooser() {
  globalTextChooser ||= TextChooser();
  return globalTextChooser;
}

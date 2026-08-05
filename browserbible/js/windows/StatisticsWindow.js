import { BaseWindow, AsyncHelpers, registerWindowComponent } from './BaseWindow.js';
import { Reference } from '../bible/BibleReference.js';
import { i18n } from '../lib/i18n.js';
import { getApp } from '../core/registry.js';
import { getText, loadSection, displayAbbr } from '../texts/TextLoader.js';
import { renderWordCloud } from '../lib/SimpleWordCloud.js';
import { loadStopwords } from '../lib/stopwords.js';
import { getShowApocrypha, skipApocryphalSection } from '../bible/Apocrypha.js';
import { countWord, processLemmaVerse, processTextVerse, tallyLemma } from './StatisticsCounting.js';
import { createStatisticHighlights, removeStatisticHighlights } from './StatisticsHighlights.js';

const INIT_DELAY_MS = 1500;
const FONT_SIZE_MIN = 11;
const FONT_SIZE_MAX = 26;
const CASCADE_STAGGER_MS = 14;
const CASCADE_STAGGER_MAX_MS = 600;

const getTextAsync = (textId) => AsyncHelpers.promisifyWithError(getText, textId);
const loadSectionAsync = (textInfo, sectionId) => AsyncHelpers.promisifyWithError(loadSection, textInfo, sectionId);

const byCountDescending = (a, b) => b.count - a.count;

function lerp(start, end, min, max, value) {
  if (max === min) return start;
  return start + (end - start) * (value - min) / (max - min);
}

class StatisticsWindowComponent extends BaseWindow {
  constructor() {
    super();

    this.state = {
      ...this.state,
      textid: '',
      sectionid: '',
      textInfo: null,
      wordStats: [],
      lemmaTally: [],
      lemmaData: [],
      hasLemma: false
    };

    this._wordIndex = new Map();
    this._lemmaIndex = new Map();
  }

  async render() {
    this.innerHTML = `
      <div class="window-header">
        <span class="stats-chapter-cycler">
          <button type="button" class="chapter-arrow chapter-prev" tabindex="-1" title="${i18n.t('windows.bible.prevchapter')}" aria-label="${i18n.t('windows.bible.prevchapter')}">&lsaquo;</button>
          <span class="window-title i18n" data-i18n="[html]windows.stats.label"></span>
          <button type="button" class="chapter-arrow chapter-next" tabindex="-1" title="${i18n.t('windows.bible.nextchapter')}" aria-label="${i18n.t('windows.bible.nextchapter')}">&rsaquo;</button>
        </span>
      </div>
      <div class="window-main">
        <div class="statistics-content loading-indicator"></div>
      </div>
    `;
  }

  cacheRefs() {
    super.cacheRefs();

    this.refs.header = this.$('.window-header');
    this.refs.main = this.$('.window-main');
    this.refs.statsMainNode = this.$('.statistics-content');
    this.refs.chapterCycler = this.$('.stats-chapter-cycler');
    this.refs.chapterPrev = this.$('.chapter-prev');
    this.refs.chapterNext = this.$('.chapter-next');
  }

  attachEventListeners() {
    this.on('message', (e) => this.handleMessage(e));

    this.addListener(this.refs.chapterPrev, 'click', () => this.cycleChapter(-1));
    this.addListener(this.refs.chapterNext, 'click', () => this.cycleChapter(1));
  }

  async init() {
    setTimeout(() => {
      const app = getApp();
      if (!app?.windowManager) return;

      const bibleSettings = app.windowManager.getSettings()
        .find((s) => s?.data?.textid && s?.data?.sectionid);

      if (bibleSettings) {
        this.startProcess(bibleSettings.data.textid, bibleSettings.data.sectionid);
      } else {
        this.refs.statsMainNode.innerHTML =
          `<div class="statistics-empty">${i18n.t('windows.stats.intro')}</div>`;
      }
    }, INIT_DELAY_MS);
  }

  cleanup() {
    this._pinnedWord = null;
    this.removeHighlights();
    super.cleanup();
  }

  handleMessage(e) {
    if (e.data.messagetype === 'nav' && e.data.type === 'bible' && e.data.locationInfo) {
      const { textid, sectionid } = e.data.locationInfo;
      this.startProcess(textid || this.state.textid, sectionid);
    }
  }

  startProcess(tid, sid) {
    if (!tid || !sid) return;

    tid = tid.split(':').pop();

    if (tid === this.state.textid && sid === this.state.sectionid) return;

    this.removeHighlights();
    this._pinnedWord = null;
    this._statsEpoch = (this._statsEpoch ?? 0) + 1;
    this._wordIndex = new Map();
    this._lemmaIndex = new Map();

    Object.assign(this.state, {
      textid: tid,
      sectionid: sid,
      textInfo: null,
      wordStats: [],
      lemmaTally: [],
      lemmaData: [],
      hasLemma: false
    });

    this.refs.main.scrollTop = 0;
    this.refs.statsMainNode.innerHTML = '';
    this.refs.statsMainNode.classList.add('loading-indicator');

    this.loadIntro(this._statsEpoch);
  }

  async loadIntro(epoch) {
    if (!this.state.sectionid || !this.state.textid) return;

    try {
      const data = await getTextAsync(this.state.textid);
      if (epoch !== this._statsEpoch) return;
      this.refs.statsMainNode.classList.remove('loading-indicator');

      if (!data) {
        this.refs.statsMainNode.innerHTML =
          `<div class="statistics-empty">${i18n.t('windows.stats.loadtextfailed')}</div>`;
        return;
      }

      this.state.textInfo = data;

      const bibleReference = Reference(this.state.sectionid);
      if (bibleReference) {
        bibleReference.language = data.lang;
        const headerSpan = this.refs.header.querySelector('.window-title');
        if (headerSpan) {
          headerSpan.innerHTML = `${bibleReference.toString()} (${displayAbbr(data)})`;
        }
      }

      this.updateChapterArrows();
      this.loadChapterInfo(epoch);
    } catch (err) {
      this.refs.statsMainNode.classList.remove('loading-indicator');
      console.error('Error loading text info', err);
    }
  }

  chapterTarget(direction) {
    const sections = this.state.textInfo?.sections;
    const current = this.state.sectionid;
    if (!Array.isArray(sections) || !current) return null;

    const idx = sections.indexOf(current);
    if (idx === -1) return null;

    const candidate = sections[idx + direction] ?? null;
    if (candidate && !getShowApocrypha()) {
      return skipApocryphalSection(candidate, direction, sections);
    }
    return candidate;
  }

  cycleChapter(direction) {
    const target = this.chapterTarget(direction);
    if (!target) return;

    this.trigger('globalmessage', {
      type: 'globalmessage',
      target: this,
      data: {
        messagetype: 'nav',
        type: 'bible',
        locationInfo: { fragmentid: `${target}_1`, sectionid: target, offset: 0 }
      }
    });

    this.startProcess(this.state.textid, target);
  }

  updateChapterArrows() {
    const cycler = this.refs.chapterCycler;
    if (!cycler) return;

    const sections = this.state.textInfo?.sections;
    const hasChapters = Array.isArray(sections) && sections.length > 1;
    cycler.classList.toggle('has-chapters', hasChapters);
    if (!hasChapters) return;

    for (const [button, direction] of [[this.refs.chapterPrev, -1], [this.refs.chapterNext, 1]]) {
      const atEnd = !this.chapterTarget(direction);
      button.classList.toggle('inactive', atEnd);
      button.setAttribute('aria-disabled', atEnd ? 'true' : 'false');
    }
  }

  processLemmaVerse(verse) {
    processLemmaVerse(this, verse);
  }

  processTextVerse(verse) {
    processTextVerse(this, verse);
  }

  countWord(word) {
    countWord(this, word);
  }

  tallyLemma(strongs, words) {
    tallyLemma(this, strongs, words);
  }

  async loadChapterInfo(epoch) {
    const resultsNode = this.createElement(`<div class="statistics-section statistics-frequent-words">
      <h3>${i18n.t('windows.stats.frequentwords')}</h3>
      <div class="statistics-wordcloud"></div>
      <div class="statistics-results loading-indicator"></div>
    </div>`);
    this.refs.statsMainNode.appendChild(resultsNode);

    const wordFrequenciesNode = resultsNode.querySelector('.statistics-results');
    const wordCloudNode = resultsNode.querySelector('.statistics-wordcloud');

    try {
      const [content, stopwords] = await Promise.all([
        loadSectionAsync(this.state.textInfo, this.state.sectionid),
        loadStopwords(this.state.textInfo.lang)
      ]);
      if (epoch !== this._statsEpoch) {
        resultsNode.remove();
        return;
      }
      this._stopwords = stopwords;

      let contentEl = content;
      if (typeof content === 'string') {
        contentEl = document.createElement('div');
        contentEl.innerHTML = content;
      } else if (!content?.nodeType) {
        contentEl = content?.[0];
      }

      contentEl.querySelectorAll('.verse, .v').forEach((verse) => {
        verse.querySelectorAll('.note').forEach((n) => n.remove());

        if (verse.querySelector('l[s]')) {
          this.state.hasLemma = true;
          this.processLemmaVerse(verse);
        } else {
          this.processTextVerse(verse);
        }
      });

      this.state.wordStats.sort(byCountDescending);

      for (const entry of this.state.wordStats) {
        entry.word = Object.keys(entry.formCounts)
          .sort((a, b) => entry.formCounts[b] - entry.formCounts[a])[0];
      }

      const counts = this.state.wordStats.map((o) => o.count);
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      const { dir } = this.state.textInfo;

      const totalOccurrences = counts.reduce((sum, c) => sum + c, 0);
      const summary = i18n.t('windows.stats.summary', [this.state.wordStats.length, totalOccurrences]);
      resultsNode.querySelector('h3').insertAdjacentHTML(
        'afterend',
        `<div class="statistics-summary">${summary} <span class="statistics-summary-note">${i18n.t('windows.stats.commonfiltered')}</span></div>`
      );

      const html = this.state.wordStats.map((wordInfo, i) => {
        const size = lerp(FONT_SIZE_MIN, FONT_SIZE_MAX, min, max, wordInfo.count);
        const delay = Math.min(i * CASCADE_STAGGER_MS, CASCADE_STAGGER_MAX_MS);
        return `<span class="word" style="font-size:${size}px;animation-delay:${delay}ms" data-wordindex="${i}"><span class="word-form" dir="${dir}">${this.escapeHtml(wordInfo.word)}</span> <span class="word-count" dir="ltr">(${wordInfo.count})</span></span>`;
      }).join('');
      const wordcloudData = this.state.wordStats.map((wi) => [wi.word, wi.count]);

      wordFrequenciesNode.setAttribute('dir', dir);
      wordFrequenciesNode.innerHTML = html;
      wordFrequenciesNode.classList.remove('loading-indicator');

      wordFrequenciesNode.querySelectorAll('.word').forEach((wordEl) => {
        const index = parseInt(wordEl.getAttribute('data-wordindex'), 10);
        const wordInfo = this.state.wordStats[index];
        const formEl = wordEl.querySelector('.word-form');

        formEl.addEventListener('mouseout', () => this.previewEnd());
        formEl.addEventListener('mouseover', () => this.createHighlights(wordInfo));
        formEl.addEventListener('click', () => this.activateWord(wordInfo));
      });

      this.renderWordCloud(wordCloudNode, wordcloudData, min, max);

      if (this.state.hasLemma) {
        this.loadLemmaInfo(epoch);
      }
    } catch (err) {
      console.error('Error loading chapter info', err);
      wordFrequenciesNode.classList.remove('loading-indicator');
      wordFrequenciesNode.textContent = i18n.t('windows.stats.loadchapterfailed');
    }
  }

  renderWordCloud(wordCloudNode, wordcloudData, min, max) {
    const computedStyle = window.getComputedStyle(this.refs.statsMainNode);
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
    const availableWidth = this.refs.statsMainNode.offsetWidth - paddingLeft - paddingRight;

    const cloudWidth = Math.max(300, availableWidth);
    const cloudHeight = Math.floor(cloudWidth * 3 / 4);

    wordCloudNode.style.width = `${cloudWidth}px`;
    wordCloudNode.style.minHeight = `${cloudHeight}px`;

    const sizeMax = Math.min(cloudWidth / 7, 80);
    const sizeMin = sizeMax * 0.1;

    renderWordCloud(wordCloudNode, {
      minSize: 5,
      weightFactor: (weight) => lerp(sizeMin, sizeMax, min, max, weight),
      list: wordcloudData,
      hover: (hoverWordInfo) => {
        if (!hoverWordInfo) {
          this.previewEnd();
          return;
        }

        const wordInfo = this.state.wordStats.find((wi) => wi.word === hoverWordInfo[0]);
        if (wordInfo) this.createHighlights(wordInfo);
      },
      click: (clickWordInfo) => {
        const wordInfo = this.state.wordStats.find((wi) => wi.word === clickWordInfo[0]);
        if (wordInfo) this.activateWord(wordInfo);
      },
      color: (word, weight) => {
        const mutedPct = Math.round(lerp(70, 0, min, max, weight));
        return `color-mix(in oklab, var(--color-primary), var(--color-text-muted) ${mutedPct}%)`;
      }
    });
  }

  async loadLemmaInfo(epoch) {
    const lemmaNodeWrapper = this.createElement(`<div class="statistics-section statistics-rare-words">
      <h3>${i18n.t('windows.stats.rarewords')}</h3>
      <div class="statistics-results loading-indicator"></div>
    </div>`);
    this.refs.statsMainNode.appendChild(lemmaNodeWrapper);
    const lemmaNode = lemmaNodeWrapper.querySelector('.statistics-results');

    const lemmaData = await this.loadAllLemmas();
    if (epoch !== this._statsEpoch) {
      lemmaNodeWrapper.remove();
      return;
    }

    this.state.lemmaData = lemmaData.sort(byCountDescending);

    const html = this.state.lemmaData
      .filter((lemma) => lemma.frequency <= 5)
      .map((lemma) => {
        const isGreek = lemma.word_info.strongs[0].toUpperCase() === 'G';
        const lang = isGreek ? 'grc' : 'he';
        const dir = isGreek ? 'ltr' : 'rtl';
        const testament = isGreek ? 'NT' : 'OT';

        return `<tr class="rare"><td><l s="${lemma.word_info.strongs}" lang="${lang}" dir="${dir}">${this.escapeHtml(lemma.lemma)}</l></td><td>${this.escapeHtml(lemma.word_info.words.join(', '))}</td><td>${lemma.word_info.count} of ${lemma.frequency} in ${testament}</td></tr>`;
      }).join('');

    lemmaNode.innerHTML = `<table>${html}</table>`;
    lemmaNode.classList.remove('loading-indicator');
  }

  async loadAllLemmas() {
    const results = await Promise.all(this.state.lemmaTally.map(async (wordInfo) => {
      try {
        const response = await fetch(`${this.config.baseContentUrl}content/lexicons/strongs/entries/${wordInfo.strongs}.json`);
        if (!response.ok) return null;
        const data = await response.json();
        data.word_info = wordInfo;
        return data;
      } catch {
        return null;
      }
    }));

    return results.filter(Boolean);
  }

  removeHighlights() {
    removeStatisticHighlights();
  }

  createHighlights(wordInfo) {
    return createStatisticHighlights(this, wordInfo);
  }

  previewEnd() {
    if (this._pinnedWord) {
      this.createHighlights(this._pinnedWord);
    } else {
      this.removeHighlights();
    }
  }

  activateWord(wordInfo) {
    this._pinnedWord = wordInfo;

    const firstMatch = this.createHighlights(wordInfo);
    const fragmentid = firstMatch?.closest('.verse, .v')?.getAttribute('data-id');
    if (!fragmentid) return;

    this.trigger('globalmessage', {
      type: 'globalmessage',
      target: this,
      data: {
        messagetype: 'nav',
        type: 'bible',
        locationInfo: { fragmentid, sectionid: this.state.sectionid, offset: 0 }
      }
    });
  }

  size(width, height) {
    this.refs.main.style.height = `${height - this.refs.header.offsetHeight}px`;
    this.refs.main.style.width = `${width}px`;
  }

  getData() {
    return {
      params: {
        'win': 'stats'
      }
    };
  }
}

registerWindowComponent('statistics-window', StatisticsWindowComponent, {
  windowType: 'stats',
  displayName: 'Statistics',
  paramKeys: {}
});

export { StatisticsWindowComponent as StatisticsWindow };

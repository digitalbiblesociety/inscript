import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  app: null,
  getText: vi.fn(),
  loadSection: vi.fn(),
  displayAbbr: vi.fn(info => `abbr:${info?.id}`),
  renderWordCloud: vi.fn(),
  loadStopwords: vi.fn(),
  showApocrypha: true,
  skipApocryphalSection: vi.fn((candidate) => candidate),
  countWord: vi.fn(),
  processLemmaVerse: vi.fn(),
  processTextVerse: vi.fn(),
  tallyLemma: vi.fn(),
  createStatisticHighlights: vi.fn(),
  removeStatisticHighlights: vi.fn(),
  Reference: vi.fn(),
  translate: vi.fn((key, values) => values ? `${key}:${values.join(',')}` : key)
}));

vi.mock('@core/registry.js', () => ({ getApp: () => fixtures.app }));

vi.mock('@texts/TextLoader.js', () => ({
  getText: fixtures.getText,
  loadSection: fixtures.loadSection,
  displayAbbr: fixtures.displayAbbr
}));

vi.mock('@lib/SimpleWordCloud.js', () => ({ renderWordCloud: fixtures.renderWordCloud }));
vi.mock('@lib/stopwords.js', () => ({ loadStopwords: fixtures.loadStopwords }));

vi.mock('@bible/Apocrypha.js', () => ({
  getShowApocrypha: () => fixtures.showApocrypha,
  skipApocryphalSection: fixtures.skipApocryphalSection
}));

vi.mock('@windows/StatisticsCounting.js', () => ({
  countWord: fixtures.countWord,
  processLemmaVerse: fixtures.processLemmaVerse,
  processTextVerse: fixtures.processTextVerse,
  tallyLemma: fixtures.tallyLemma
}));

vi.mock('@windows/StatisticsHighlights.js', () => ({
  createStatisticHighlights: fixtures.createStatisticHighlights,
  removeStatisticHighlights: fixtures.removeStatisticHighlights
}));

vi.mock('@bible/BibleReference.js', () => ({ Reference: fixtures.Reference }));

vi.mock('@lib/i18n.js', () => ({
  i18n: { t: fixtures.translate }
}));

import { StatisticsWindow } from '@windows/StatisticsWindow.js';

function reference(sectionid) {
  return { sectionid, language: '', toString: () => `ref:${sectionid}` };
}

async function makeWindow() {
  const component = document.createElement('statistics-window');
  await component.render();
  component.cacheRefs();
  return component;
}

function listener(listeners, target, event) {
  return listeners.find(entry => entry.target === target && entry.event === event)?.handler;
}

function textInfo(overrides = {}) {
  return {
    id: 'ENG', lang: 'eng', dir: 'ltr', sections: ['GN1', 'GN2', 'GN3'],
    ...overrides
  };
}

describe('StatisticsWindow lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    fixtures.app = null;
    fixtures.showApocrypha = true;
    fixtures.skipApocryphalSection.mockImplementation(candidate => candidate);
    fixtures.Reference.mockImplementation(sectionid => reference(sectionid));
    fixtures.translate.mockImplementation((key, values) => values ? `${key}:${values.join(',')}` : key);
    fixtures.getText.mockImplementation((_id, success) => success(textInfo()));
    fixtures.loadSection.mockImplementation((_info, _section, success) => success('<div></div>'));
    fixtures.loadStopwords.mockResolvedValue(new Set());
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('initializes state, indexes, translated chrome, and cached references', async () => {
    const component = await makeWindow();
    expect(component.state).toMatchObject({
      textid: '', sectionid: '', textInfo: null,
      wordStats: [], lemmaTally: [], lemmaData: [], hasLemma: false
    });
    expect(component._wordIndex).toBeInstanceOf(Map);
    expect(component._lemmaIndex).toBeInstanceOf(Map);
    expect(component.refs.chapterPrev.title).toBe('windows.bible.prevchapter');
    expect(component.refs.chapterNext.title).toBe('windows.bible.nextchapter');
    expect(component.refs.statsMainNode).toBe(component.querySelector('.statistics-content'));
  });

  it('wires message and chapter navigation listeners', async () => {
    const component = await makeWindow();
    const listeners = [];
    component.on = vi.fn();
    component.addListener = vi.fn((target, event, handler) => listeners.push({ target, event, handler }));
    component.handleMessage = vi.fn();
    component.cycleChapter = vi.fn();
    component.attachEventListeners();
    component.on.mock.calls[0][1]({ data: 1 });
    listener(listeners, component.refs.chapterPrev, 'click')();
    listener(listeners, component.refs.chapterNext, 'click')();
    expect(component.handleMessage).toHaveBeenCalledWith({ data: 1 });
    expect(component.cycleChapter).toHaveBeenNthCalledWith(1, -1);
    expect(component.cycleChapter).toHaveBeenNthCalledWith(2, 1);
  });

  it('starts from the first Bible window settings after the initialization delay', async () => {
    const component = await makeWindow();
    component.startProcess = vi.fn();
    fixtures.app = {
      windowManager: {
        getSettings: () => [
          { data: {} },
          { data: { textid: 'ENG', sectionid: 'JN3' } }
        ]
      }
    };
    await component.init();
    vi.advanceTimersByTime(1500);
    expect(component.startProcess).toHaveBeenCalledWith('ENG', 'JN3');
  });

  it('shows an intro when no Bible settings exist and tolerates an unavailable app', async () => {
    const component = await makeWindow();
    await component.init();
    vi.advanceTimersByTime(1500);
    expect(component.refs.statsMainNode.innerHTML).toBe('');

    fixtures.app = { windowManager: { getSettings: () => [{ data: {} }, null] } };
    await component.init();
    vi.advanceTimersByTime(1500);
    expect(component.refs.statsMainNode.textContent).toBe('windows.stats.intro');
  });

  it('cleans pinned state and highlights', async () => {
    const component = await makeWindow();
    component._pinnedWord = { word: 'faith' };
    component._boundHandlers.set('one', vi.fn());
    component.cleanup();
    expect(component._pinnedWord).toBeNull();
    expect(fixtures.removeStatisticHighlights).toHaveBeenCalled();
    expect(component._boundHandlers.size).toBe(0);
  });

  it('follows Bible navigation and retains the current text when omitted', async () => {
    const component = await makeWindow();
    component.state.textid = 'ENG';
    component.startProcess = vi.fn();
    component.handleMessage({ data: { messagetype: 'other' } });
    component.handleMessage({ data: { messagetype: 'nav', type: 'map', locationInfo: {} } });
    component.handleMessage({ data: { messagetype: 'nav', type: 'bible' } });
    component.handleMessage({ data: {
      messagetype: 'nav', type: 'bible', locationInfo: { sectionid: 'JN3' }
    } });
    component.handleMessage({ data: {
      messagetype: 'nav', type: 'bible', locationInfo: { textid: 'SPA', sectionid: 'JN4' }
    } });
    expect(component.startProcess).toHaveBeenNthCalledWith(1, 'ENG', 'JN3');
    expect(component.startProcess).toHaveBeenNthCalledWith(2, 'SPA', 'JN4');
  });

  it('guards duplicate starts and resets state for a new provider-qualified chapter', async () => {
    const component = await makeWindow();
    component.loadIntro = vi.fn();
    component.removeHighlights = vi.fn();
    component.startProcess('', 'GN1');
    component.startProcess('ENG', '');
    expect(component.loadIntro).not.toHaveBeenCalled();

    component.state.textid = 'ENG';
    component.state.sectionid = 'GN1';
    component.startProcess('provider:ENG', 'GN1');
    expect(component.loadIntro).not.toHaveBeenCalled();

    component._pinnedWord = { word: 'old' };
    component._wordIndex.set('old', {});
    component.refs.main.scrollTop = 25;
    component.refs.statsMainNode.innerHTML = '<span>old</span>';
    component.startProcess('provider:SPA', 'JN3');
    expect(component.state).toMatchObject({
      textid: 'SPA', sectionid: 'JN3', textInfo: null,
      wordStats: [], lemmaTally: [], lemmaData: [], hasLemma: false
    });
    expect(component._pinnedWord).toBeNull();
    expect(component._wordIndex.size).toBe(0);
    expect(component._lemmaIndex.size).toBe(0);
    expect(component.refs.main.scrollTop).toBe(0);
    expect(component.refs.statsMainNode.classList).toContain('loading-indicator');
    expect(component.loadIntro).toHaveBeenCalledWith(1);
  });

  it('does not load an intro without a selected text and section', async () => {
    const component = await makeWindow();
    await component.loadIntro(1);
    expect(fixtures.getText).not.toHaveBeenCalled();
  });

  it('loads intro metadata, formats its title, arrows, and chapter', async () => {
    const component = await makeWindow();
    component.state.textid = 'ENG';
    component.state.sectionid = 'JN3';
    component._statsEpoch = 2;
    const data = textInfo({ id: 'ENG', lang: 'spa' });
    fixtures.getText.mockImplementation((_id, success) => success(data));
    component.updateChapterArrows = vi.fn();
    component.loadChapterInfo = vi.fn();
    await component.loadIntro(2);
    expect(component.state.textInfo).toBe(data);
    expect(fixtures.Reference).toHaveBeenCalledWith('JN3');
    expect(component.refs.header.querySelector('.window-title').innerHTML).toBe('ref:JN3 (abbr:ENG)');
    expect(component.updateChapterArrows).toHaveBeenCalled();
    expect(component.loadChapterInfo).toHaveBeenCalledWith(2);
  });

  it('ignores stale intro responses and reports missing text', async () => {
    const component = await makeWindow();
    component.state.textid = 'ENG';
    component.state.sectionid = 'JN3';
    component._statsEpoch = 2;
    component.loadChapterInfo = vi.fn();
    await component.loadIntro(1);
    expect(component.loadChapterInfo).not.toHaveBeenCalled();

    fixtures.getText.mockImplementation((_id, success) => success(null));
    await component.loadIntro(2);
    expect(component.refs.statsMainNode.textContent).toBe('windows.stats.loadtextfailed');
    expect(component.refs.statsMainNode.classList).not.toContain('loading-indicator');
  });

  it('tolerates an invalid reference or missing title span', async () => {
    const component = await makeWindow();
    component.state.textid = 'ENG';
    component.state.sectionid = 'bad';
    component._statsEpoch = 1;
    fixtures.Reference.mockReturnValueOnce(null);
    component.updateChapterArrows = vi.fn();
    component.loadChapterInfo = vi.fn();
    await component.loadIntro(1);
    component.refs.header.querySelector('.window-title').remove();
    fixtures.Reference.mockImplementationOnce(sectionid => reference(sectionid));
    await component.loadIntro(1);
    expect(component.loadChapterInfo).toHaveBeenCalledTimes(2);
  });

  it('logs intro loading errors and removes the loading state', async () => {
    const component = await makeWindow();
    component.state.textid = 'ENG';
    component.state.sectionid = 'JN3';
    component._statsEpoch = 1;
    fixtures.getText.mockImplementation((_id, _success, error) => error(new Error('offline')));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await component.loadIntro(1);
    expect(consoleError).toHaveBeenCalledWith('Error loading text info', expect.any(Error));
    expect(component.refs.statsMainNode.classList).not.toContain('loading-indicator');
  });

  it('finds adjacent chapters and skips hidden apocrypha', async () => {
    const component = await makeWindow();
    expect(component.chapterTarget(1)).toBeNull();
    component.state.textInfo = textInfo({ sections: 'bad' });
    component.state.sectionid = 'GN1';
    expect(component.chapterTarget(1)).toBeNull();
    component.state.textInfo.sections = ['GN1', 'TB1', 'EX1'];
    component.state.sectionid = 'MISSING';
    expect(component.chapterTarget(1)).toBeNull();
    component.state.sectionid = 'GN1';
    fixtures.showApocrypha = false;
    fixtures.skipApocryphalSection.mockReturnValue('EX1');
    expect(component.chapterTarget(1)).toBe('EX1');
    expect(fixtures.skipApocryphalSection).toHaveBeenCalledWith('TB1', 1, component.state.textInfo.sections);
    fixtures.showApocrypha = true;
    expect(component.chapterTarget(1)).toBe('TB1');
    component.state.sectionid = 'EX1';
    expect(component.chapterTarget(1)).toBeNull();
  });

  it('cycles available chapters and broadcasts navigation', async () => {
    const component = await makeWindow();
    component.chapterTarget = vi.fn().mockReturnValueOnce(null).mockReturnValueOnce('GN2');
    component.startProcess = vi.fn();
    component.trigger = vi.fn();
    component.state.textid = 'ENG';
    component.state.sectionid = 'GN1';
    component.cycleChapter(-1);
    component.cycleChapter(1);
    expect(component.trigger).toHaveBeenCalledWith('globalmessage', {
      type: 'globalmessage', target: component,
      data: {
        messagetype: 'nav', type: 'bible',
        locationInfo: { fragmentid: 'GN2_1', sectionid: 'GN2', offset: 0 }
      }
    });
    expect(component.startProcess).toHaveBeenCalledWith('ENG', 'GN2');
  });

  it('updates chapter arrow visibility and disabled boundaries', async () => {
    const component = await makeWindow();
    const cycler = component.refs.chapterCycler;
    component.refs.chapterCycler = null;
    expect(() => component.updateChapterArrows()).not.toThrow();
    component.refs.chapterCycler = cycler;
    component.state.textInfo = textInfo({ sections: ['GN1'] });
    component.updateChapterArrows();
    expect(cycler.classList).not.toContain('has-chapters');

    component.state.textInfo.sections = ['GN1', 'GN2'];
    component.chapterTarget = vi.fn(direction => direction < 0 ? null : 'GN2');
    component.updateChapterArrows();
    expect(cycler.classList).toContain('has-chapters');
    expect(component.refs.chapterPrev.classList).toContain('inactive');
    expect(component.refs.chapterPrev.getAttribute('aria-disabled')).toBe('true');
    expect(component.refs.chapterNext.classList).not.toContain('inactive');
    expect(component.refs.chapterNext.getAttribute('aria-disabled')).toBe('false');
  });

  it('delegates counting helpers', () => {
    const component = document.createElement('statistics-window');
    const verse = document.createElement('span');
    component.processLemmaVerse(verse);
    component.processTextVerse(verse);
    component.countWord('faith');
    component.tallyLemma('G4102', ['faith']);
    expect(fixtures.processLemmaVerse).toHaveBeenCalledWith(component, verse);
    expect(fixtures.processTextVerse).toHaveBeenCalledWith(component, verse);
    expect(fixtures.countWord).toHaveBeenCalledWith(component, 'faith');
    expect(fixtures.tallyLemma).toHaveBeenCalledWith(component, 'G4102', ['faith']);
  });

  it('loads chapter content, strips notes, renders sorted words, and wires interactions', async () => {
    const component = await makeWindow();
    component.state.textInfo = textInfo({ dir: 'rtl' });
    component.state.sectionid = 'GN1';
    component._statsEpoch = 1;
    fixtures.loadSection.mockImplementation((_info, _section, success) => success(`
      <span class="v" data-id="GN1_1"><span class="note">note</span><l s="H1">Faith</l></span>
      <span class="verse" data-id="GN1_2">Hope</span>`));
    const stopwords = new Set(['the']);
    fixtures.loadStopwords.mockResolvedValue(stopwords);
    fixtures.processLemmaVerse.mockImplementation((target) => {
      target.state.wordStats = [
        { key: 'faith', word: '', count: 3, formCounts: { Faith: 1, faith: 2 } },
        { key: 'hope', word: '', count: 1, formCounts: { Hope: 1 } }
      ];
    });
    component.renderWordCloud = vi.fn();
    component.loadLemmaInfo = vi.fn();
    component.previewEnd = vi.fn();
    component.createHighlights = vi.fn();
    component.activateWord = vi.fn();
    await component.loadChapterInfo(1);

    expect(component._stopwords).toBe(stopwords);
    expect(component.state.hasLemma).toBe(true);
    expect(fixtures.processLemmaVerse).toHaveBeenCalled();
    expect(fixtures.processTextVerse).toHaveBeenCalled();
    expect(component.state.wordStats.map(word => word.word)).toEqual(['faith', 'Hope']);
    const results = component.refs.statsMainNode.querySelector('.statistics-results');
    expect(results.getAttribute('dir')).toBe('rtl');
    expect(results.textContent).toContain('faith (3)');
    expect(component.refs.statsMainNode.querySelector('.statistics-summary').textContent)
      .toContain('windows.stats.summary:2,4');
    expect(component.renderWordCloud).toHaveBeenCalledWith(
      expect.any(Element), [['faith', 3], ['Hope', 1]], 1, 3
    );
    expect(component.loadLemmaInfo).toHaveBeenCalledWith(1);

    const form = results.querySelector('.word-form');
    form.dispatchEvent(new MouseEvent('mouseover'));
    form.dispatchEvent(new MouseEvent('mouseout'));
    form.dispatchEvent(new MouseEvent('click'));
    expect(component.createHighlights).toHaveBeenCalled();
    expect(component.previewEnd).toHaveBeenCalled();
    expect(component.activateWord).toHaveBeenCalled();
  });

  it('handles array-like chapter content and equal word counts', async () => {
    const component = await makeWindow();
    component.state.textInfo = textInfo();
    component.state.sectionid = 'GN1';
    component._statsEpoch = 1;
    const content = document.createElement('div');
    content.innerHTML = '<span class="v">Word</span>';
    fixtures.loadSection.mockImplementation((_info, _section, success) => success({ 0: content }));
    fixtures.processTextVerse.mockImplementation(target => {
      target.state.wordStats = [{ key: 'word', word: '', count: 1, formCounts: { Word: 1 } }];
    });
    component.renderWordCloud = vi.fn();
    await component.loadChapterInfo(1);
    expect(component.refs.statsMainNode.querySelector('.word').style.fontSize).toBe('11px');
  });

  it('removes stale chapter results and reports chapter failures', async () => {
    const stale = await makeWindow();
    stale.state.textInfo = textInfo();
    stale.state.sectionid = 'GN1';
    stale._statsEpoch = 2;
    await stale.loadChapterInfo(1);
    expect(stale.refs.statsMainNode.querySelector('.statistics-section')).toBeNull();

    const failed = await makeWindow();
    failed.state.textInfo = textInfo();
    failed.state.sectionid = 'GN1';
    failed._statsEpoch = 1;
    fixtures.loadSection.mockImplementation((_info, _section, _success, error) => error(new Error('offline')));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await failed.loadChapterInfo(1);
    expect(consoleError).toHaveBeenCalledWith('Error loading chapter info', expect.any(Error));
    expect(failed.refs.statsMainNode.querySelector('.statistics-results').textContent)
      .toBe('windows.stats.loadchapterfailed');
  });

  it('renders a responsive word cloud and routes hover, click, and color callbacks', async () => {
    const component = await makeWindow();
    Object.defineProperty(component.refs.statsMainNode, 'offsetWidth', { configurable: true, value: 500 });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ paddingLeft: '20px', paddingRight: '30px' });
    component.state.wordStats = [{ word: 'faith', count: 4 }];
    component.createHighlights = vi.fn();
    component.previewEnd = vi.fn();
    component.activateWord = vi.fn();
    const cloud = document.createElement('div');
    component.renderWordCloud(cloud, [['faith', 4]], 1, 5);
    expect(cloud.style.width).toBe('450px');
    expect(cloud.style.minHeight).toBe('337px');
    const options = fixtures.renderWordCloud.mock.calls[0][1];
    expect(options.minSize).toBe(5);
    expect(options.weightFactor(5)).toBeCloseTo(64.2857);
    expect(options.color('faith', 5)).toContain('0%');
    options.hover(null);
    options.hover(['missing']);
    options.hover(['faith']);
    options.click(['missing']);
    options.click(['faith']);
    expect(component.previewEnd).toHaveBeenCalled();
    expect(component.createHighlights).toHaveBeenCalledWith(component.state.wordStats[0]);
    expect(component.activateWord).toHaveBeenCalledWith(component.state.wordStats[0]);

    Object.defineProperty(component.refs.statsMainNode, 'offsetWidth', { configurable: true, value: 100 });
    component.renderWordCloud(document.createElement('div'), [], 1, 1);
    expect(fixtures.renderWordCloud).toHaveBeenCalledTimes(2);
  });

  it('renders rare Greek and Hebrew lemmas and drops common entries', async () => {
    const component = await makeWindow();
    component._statsEpoch = 1;
    component.loadAllLemmas = vi.fn().mockResolvedValue([
      { lemma: 'logos', frequency: 5, word_info: { strongs: 'G3056', words: ['word'], count: 2 } },
      { lemma: 'דבר', frequency: 1, word_info: { strongs: 'H1697', words: ['word', 'thing'], count: 1 } },
      { lemma: 'common', frequency: 6, word_info: { strongs: 'G1', words: ['common'], count: 9 } }
    ]);
    await component.loadLemmaInfo(1);
    const rows = component.refs.statsMainNode.querySelectorAll('tr.rare');
    expect(rows).toHaveLength(2);
    expect(rows[0].innerHTML).toContain('lang="grc" dir="ltr"');
    expect(rows[0].textContent).toContain('2 of 5 in NT');
    expect(rows[1].innerHTML).toContain('lang="he" dir="rtl"');
    expect(rows[1].textContent).toContain('1 of 1 in OT');
  });

  it('removes stale lemma results', async () => {
    const component = await makeWindow();
    component._statsEpoch = 2;
    component.loadAllLemmas = vi.fn().mockResolvedValue([]);
    await component.loadLemmaInfo(1);
    expect(component.refs.statsMainNode.querySelector('.statistics-rare-words')).toBeNull();
  });

  it('loads available lemma records and filters HTTP and network failures', async () => {
    const component = document.createElement('statistics-window');
    component.state.lemmaTally = [
      { strongs: 'G1' }, { strongs: 'H2' }, { strongs: 'G3' }
    ];
    fetch
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ lemma: 'one' }) })
      .mockResolvedValueOnce({ ok: false })
      .mockRejectedValueOnce(new Error('offline'));
    const result = await component.loadAllLemmas();
    expect(result).toEqual([{ lemma: 'one', word_info: { strongs: 'G1' } }]);
    expect(fetch.mock.calls[0][0]).toContain('/content/lexicons/strongs/entries/G1.json');
  });

  it('delegates highlights, restores pinned previews, and removes unpinned previews', () => {
    const component = document.createElement('statistics-window');
    const word = { word: 'faith' };
    fixtures.createStatisticHighlights.mockReturnValue('first');
    expect(component.createHighlights(word)).toBe('first');
    component._pinnedWord = word;
    component.previewEnd();
    expect(fixtures.createStatisticHighlights).toHaveBeenCalledWith(component, word);
    component._pinnedWord = null;
    component.previewEnd();
    expect(fixtures.removeStatisticHighlights).toHaveBeenCalled();
  });

  it('pins words and broadcasts the first matching verse only when available', async () => {
    const component = await makeWindow();
    const word = { word: 'faith' };
    component.createHighlights = vi.fn().mockReturnValueOnce(null);
    component.trigger = vi.fn();
    component.activateWord(word);
    expect(component._pinnedWord).toBe(word);
    expect(component.trigger).not.toHaveBeenCalled();

    const verse = document.createElement('span');
    verse.className = 'v';
    verse.dataset.id = 'GN1_1';
    const mark = document.createElement('mark');
    verse.appendChild(mark);
    component.createHighlights.mockReturnValue(mark);
    component.state.sectionid = 'GN1';
    component.activateWord(word);
    expect(component.trigger).toHaveBeenCalledWith('globalmessage', {
      type: 'globalmessage', target: component,
      data: {
        messagetype: 'nav', type: 'bible',
        locationInfo: { fragmentid: 'GN1_1', sectionid: 'GN1', offset: 0 }
      }
    });
  });

  it('sizes beneath the header and serializes window data', async () => {
    const component = await makeWindow();
    Object.defineProperty(component.refs.header, 'offsetHeight', { value: 35 });
    component.size(700, 500);
    expect(component.refs.main.style.width).toBe('700px');
    expect(component.refs.main.style.height).toBe('465px');
    expect(component.getData()).toEqual({ params: { win: 'stats' } });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  chooser: null,
  navigator: null,
  textData: [],
  loadTexts: vi.fn(),
  getText: vi.fn(),
  displayAbbr: vi.fn(info => `abbr:${info?.id}`),
  Reference: vi.fn(),
  loadComparisonText: vi.fn(),
  renderComparison: vi.fn(),
  translate: vi.fn(key => key)
}));

vi.mock('@texts/TextLoader.js', () => ({
  loadTexts: fixtures.loadTexts,
  getText: fixtures.getText,
  displayAbbr: fixtures.displayAbbr
}));

vi.mock('@ui/TextChooser.js', () => ({
  getGlobalTextChooser: () => fixtures.chooser
}));

vi.mock('@ui/TextNavigator.js', () => ({
  TextNavigator: () => fixtures.navigator
}));

vi.mock('@bible/BibleReference.js', () => ({
  Reference: fixtures.Reference
}));

vi.mock('@windows/TextComparisonData.js', () => ({
  loadComparisonText: fixtures.loadComparisonText
}));

vi.mock('@windows/TextComparisonRender.js', () => ({
  renderComparison: fixtures.renderComparison
}));

vi.mock('@lib/i18n.js', () => ({
  i18n: { t: fixtures.translate }
}));

import { TextComparisonWindow } from '@windows/TextComparisonWindow.js';

function makeChooser() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    isVisible: vi.fn(() => false),
    getTarget: vi.fn(() => null),
    setTarget: vi.fn(),
    setTextInfo: vi.fn(),
    show: vi.fn(),
    hide: vi.fn()
  };
}

function makeNavigator() {
  return {
    on: vi.fn(),
    getTarget: vi.fn(() => null),
    toggle: vi.fn(),
    setTarget: vi.fn(),
    setTextInfo: vi.fn(),
    show: vi.fn(),
    destroy: vi.fn()
  };
}

function ref(input = 'John 3:16') {
  return {
    input,
    toString: () => `formatted:${input}`,
    toSection: () => 'JN3_16'
  };
}

async function makeWindow() {
  const component = document.createElement('text-comparison-window');
  await component.render();
  component.cacheRefs();
  return component;
}

describe('TextComparisonWindow', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    fixtures.chooser = makeChooser();
    fixtures.navigator = makeNavigator();
    fixtures.textData = [];
    fixtures.loadTexts.mockImplementation(callback => callback(fixtures.textData));
    fixtures.getText.mockImplementation((textId, callback) => callback({ id: textId, name: `Text ${textId}` }));
    fixtures.Reference.mockImplementation(function MockReference(input) {
      return ref(input);
    });
    fixtures.displayAbbr.mockImplementation(info => `abbr:${info?.id}`);
    fixtures.translate.mockImplementation(key => key);
    fixtures.loadComparisonText.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('initializes comparison state and shared UI collaborators', () => {
    const component = document.createElement('text-comparison-window');
    expect(component.state).toMatchObject({
      sourceTextId: null,
      targetTextId: null,
      currentSourceLang3: null,
      textInfoData: null,
      currentReference: null,
      currentSectionId: null
    });
    expect(component.textChooser).toBe(fixtures.chooser);
    expect(component.textNavigator).toBe(fixtures.navigator);
  });

  it('renders the comparison chrome and caches all references', async () => {
    const component = await makeWindow();
    expect(component.refs.inputFragment.placeholder).toBe('John 3:16');
    expect(component.refs.sourceTitle).toBe(component.querySelector('.comparison-source-title'));
    expect(component.refs.targetTitle).toBe(component.querySelector('.comparison-target-title'));
    expect(component.refs.main).toBe(component.querySelector('.comparison-main'));
    expect(component.refs.footer).toBe(component.querySelector('.comparison-footer'));
  });

  it('wires chooser anchors, fragment input, navigator, and Enter comparison', async () => {
    const component = await makeWindow();
    component.showChooser = vi.fn();
    component.handleFragmentClick = vi.fn();
    component.handleNavigatorChange = vi.fn();
    component.handleTextChooserChange = vi.fn();
    component.doComparison = vi.fn();
    component.bindHandler = vi.fn((_name, handler) => handler);
    component.attachEventListeners();

    expect(fixtures.chooser.on).toHaveBeenCalledWith('change', component._textChooserHandler);
    component._textChooserHandler({ data: 1 });
    expect(component.handleTextChooserChange).toHaveBeenCalledWith({ data: 1 });
    expect(fixtures.navigator.on).toHaveBeenCalledWith('change', expect.any(Function));
    fixtures.navigator.on.mock.calls[0][1]({ data: 2 });
    expect(component.handleNavigatorChange).toHaveBeenCalledWith({ data: 2 });

    fixtures.chooser.isVisible.mockReturnValue(true);
    fixtures.chooser.getTarget.mockReturnValue(component.refs.sourceTitle);
    component.refs.sourceTitle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(component._chooserWasOpenHere).toBe(true);
    component.refs.sourceTitle.click();
    component.refs.targetTitle.click();
    expect(component.showChooser).toHaveBeenNthCalledWith(1, component.refs.sourceTitle);
    expect(component.showChooser).toHaveBeenNthCalledWith(2, component.refs.targetTitle);

    component.refs.inputFragment.click();
    component.refs.inputFragment.dispatchEvent(new KeyboardEvent('keypress', { keyCode: 12, bubbles: true }));
    component.refs.inputFragment.dispatchEvent(new KeyboardEvent('keypress', { keyCode: 13, bubbles: true }));
    expect(component.handleFragmentClick).toHaveBeenCalled();
    expect(component.doComparison).toHaveBeenCalledOnce();
  });

  it('records a closed chooser during pointerdown', async () => {
    const component = await makeWindow();
    component.showChooser = vi.fn();
    component.attachEventListeners();
    fixtures.chooser.isVisible.mockReturnValue(false);
    component.refs.targetTitle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(component._chooserWasOpenHere).toBe(false);
  });

  it('initializes restored versions, language, labels, and the first comparison', async () => {
    fixtures.textData = [
      { id: 'SRC', lang3: 'spa' },
      { id: 'TGT', lang: 'spa' }
    ];
    const component = await makeWindow();
    component.config.newComparisonWindowSourceVersion = 'DEFAULT_SRC';
    component.config.newComparisonWindowTargetVersion = 'DEFAULT_TGT';
    const params = new Map([['fragmentid', 'GN1_1'], ['sourceId', 'SRC'], ['targetId', 'TGT']]);
    component.getParam = vi.fn((key, fallback) => params.get(key) ?? fallback);
    component.updateTargetForNewLanguage = vi.fn();
    component.doComparison = vi.fn().mockResolvedValue();

    await component.init();

    expect(component.refs.inputFragment.value).toBe('GN1_1');
    expect(component.state.textInfoData).toBe(fixtures.textData);
    expect(component.state.currentSourceLang3).toBe('spa');
    expect(component.refs.sourceTitle.textContent).toBe('abbr:SRC');
    expect(component.refs.targetTitle.textContent).toBe('abbr:TGT');
    expect(component.updateTargetForNewLanguage).toHaveBeenCalled();
    expect(component.doComparison).toHaveBeenCalled();
  });

  it('uses defaults and tolerates missing manifests or source language', async () => {
    fixtures.textData = [{ id: 'SRC' }];
    const component = await makeWindow();
    component.config.newComparisonWindowSourceVersion = 'SRC';
    component.config.newComparisonWindowTargetVersion = 'MISSING';
    component.getParam = vi.fn((_key, fallback) => fallback);
    component.updateTargetForNewLanguage = vi.fn();
    component.doComparison = vi.fn().mockResolvedValue();
    await component.init();
    expect(component.state.sourceTextId).toBe('SRC');
    expect(component.state.targetTextId).toBe('MISSING');
    expect(component.state.currentSourceLang3).toBeNull();
    expect(component.refs.targetTitle.textContent).toBe('');
  });

  it('cleans chooser and navigator bindings and closes only its own chooser', async () => {
    const component = await makeWindow();
    component._textChooserHandler = vi.fn();
    fixtures.chooser.getTarget.mockReturnValue(component.refs.sourceTitle);
    component.cleanup();
    expect(fixtures.chooser.off).toHaveBeenCalledWith('change', component._textChooserHandler);
    expect(fixtures.chooser.hide).toHaveBeenCalled();
    expect(fixtures.navigator.destroy).toHaveBeenCalled();

    const other = await makeWindow();
    other._textChooserHandler = null;
    fixtures.chooser.getTarget.mockReturnValue(document.body);
    fixtures.chooser.off.mockClear();
    fixtures.chooser.hide.mockClear();
    other.textNavigator = null;
    other.cleanup();
    expect(fixtures.chooser.off).not.toHaveBeenCalled();
    expect(fixtures.chooser.hide).not.toHaveBeenCalled();
  });

  it('also closes the chooser when the target title owns it', async () => {
    const component = await makeWindow();
    fixtures.chooser.getTarget.mockReturnValue(component.refs.targetTitle);
    component.cleanup();
    expect(fixtures.chooser.hide).toHaveBeenCalled();
  });

  it('routes chooser changes from direct and wrapped targets and falls back to manifest info', async () => {
    const component = await makeWindow();
    component.state.textInfoData = [{ id: 'SRC', lang3: 'eng' }, { id: 'TGT', lang3: 'eng' }];
    component.handleSourceChange = vi.fn();
    component.handleTargetChange = vi.fn();

    component.handleTextChooserChange({ data: { target: component.refs.sourceTitle, textInfo: { id: 'DIRECT' } } });
    component.handleTextChooserChange({ data: { target: [component.refs.targetTitle], textid: 'TGT', textInfo: null } });
    component.handleTextChooserChange({ data: { target: document.body, textInfo: { id: 'OTHER' } } });
    component.handleTextChooserChange({ data: { target: component.refs.sourceTitle, textid: 'MISSING' } });

    expect(component.handleSourceChange).toHaveBeenCalledWith({ id: 'DIRECT' });
    expect(component.handleTargetChange).toHaveBeenCalledWith(component.state.textInfoData[1]);
    expect(component.handleSourceChange).toHaveBeenCalledOnce();
  });

  it('changes target and source, preferring source manifest metadata', async () => {
    const component = await makeWindow();
    component.state.textInfoData = [{ id: 'SRC', lang3: 'fra', name: 'Manifest' }];
    component.updateTargetForNewLanguage = vi.fn();
    component.doComparison = vi.fn();
    component.handleTargetChange({ id: 'TGT' });
    expect(component.state.targetTextId).toBe('TGT');
    expect(component.refs.targetTitle.textContent).toBe('abbr:TGT');

    component.handleSourceChange({ id: 'SRC', lang3: 'eng', name: 'Details' });
    expect(component.state.sourceTextId).toBe('SRC');
    expect(component.state.currentSourceLang3).toBe('fra');
    expect(fixtures.displayAbbr).toHaveBeenCalledWith(component.state.textInfoData[0]);
    expect(component.updateTargetForNewLanguage).toHaveBeenCalled();
    expect(component.doComparison).toHaveBeenCalledTimes(2);

    component.state.textInfoData = null;
    component.handleSourceChange({ id: 'OTHER', lang: 'deu' });
    expect(component.state.currentSourceLang3).toBe('deu');
  });

  it('does nothing when showing a chooser before text metadata loads', async () => {
    const component = await makeWindow();
    component.showChooser(component.refs.sourceTitle);
    expect(fixtures.chooser.setTarget).not.toHaveBeenCalled();
  });

  it('configures source and target chooser constraints and toggles an already-open anchor', async () => {
    const component = await makeWindow();
    component.state.textInfoData = [{ id: 'SRC' }, { id: 'TGT' }];
    component.state.sourceTextId = 'SRC';
    component.state.targetTextId = 'TGT';
    component.state.currentSourceLang3 = 'spa';

    component._chooserWasOpenHere = false;
    component.showChooser(component.refs.sourceTitle);
    expect(fixtures.chooser.setTarget).toHaveBeenNthCalledWith(1, component, component.refs.sourceTitle, 'bible', null);
    expect(fixtures.chooser.setTextInfo).toHaveBeenCalledWith(component.state.textInfoData[0]);
    expect(fixtures.chooser.show).toHaveBeenCalled();

    component._chooserWasOpenHere = true;
    component.showChooser(component.refs.targetTitle);
    expect(fixtures.chooser.setTarget).toHaveBeenNthCalledWith(2, component, component.refs.targetTitle, 'bible', 'spa');
    expect(fixtures.chooser.setTextInfo).toHaveBeenCalledWith(component.state.textInfoData[1]);
    expect(fixtures.chooser.hide).toHaveBeenCalled();
    expect(component._chooserWasOpenHere).toBe(false);

    component.state.targetTextId = 'MISSING';
    fixtures.chooser.setTextInfo.mockClear();
    component.showChooser(component.refs.targetTitle);
    expect(fixtures.chooser.setTextInfo).not.toHaveBeenCalled();
  });

  it('toggles an existing navigator target or configures a new one', async () => {
    const component = await makeWindow();
    component.state.sourceTextId = null;
    await component.handleFragmentClick();
    expect(fixtures.navigator.toggle).not.toHaveBeenCalled();
    expect(fixtures.getText).not.toHaveBeenCalled();

    component.state.sourceTextId = 'SRC';
    fixtures.navigator.getTarget.mockReturnValue(component.refs.inputFragment);
    await component.handleFragmentClick();
    expect(fixtures.navigator.toggle).toHaveBeenCalled();

    fixtures.navigator.getTarget.mockReturnValue(null);
    await component.handleFragmentClick();
    expect(fixtures.getText).toHaveBeenCalledWith('SRC', expect.any(Function));
    expect(fixtures.navigator.setTarget).toHaveBeenCalledWith(component, component.refs.inputFragment);
    expect(fixtures.navigator.setTextInfo).toHaveBeenCalledWith(expect.objectContaining({ id: 'SRC' }));
    expect(fixtures.navigator.show).toHaveBeenCalled();
  });

  it('uses touch blur when the environment exposes touch input', async () => {
    if (!('ontouchend' in document)) return;
    const component = await makeWindow();
    component.state.sourceTextId = null;
    const blur = vi.spyOn(component.refs.inputFragment, 'blur');
    await component.handleFragmentClick();
    expect(blur).toHaveBeenCalled();
  });

  it('navigates only for changes belonging to its input', async () => {
    const component = await makeWindow();
    component.doComparison = vi.fn();
    component.handleNavigatorChange({ data: { target: document.body, sectionid: 'GN1' } });
    expect(component.doComparison).not.toHaveBeenCalled();
    component.handleNavigatorChange({ data: { target: component.refs.inputFragment, sectionid: 'JN3' } });
    expect(fixtures.Reference).toHaveBeenCalledWith('JN3');
    expect(component.refs.inputFragment.value).toBe('formatted:JN3');
    expect(component.doComparison).toHaveBeenCalled();
  });

  it('filters comparable texts by source language, text availability, and type', async () => {
    const component = await makeWindow();
    component.state.currentSourceLang3 = 'eng';
    component.state.textInfoData = [
      { id: 'a', lang3: 'eng' },
      { id: 'b', lang: 'eng', type: 'bible' },
      { id: 'c', lang3: 'eng', hasText: false },
      { id: 'd', lang3: 'eng', type: 'commentary' },
      { id: 'e', lang3: 'spa' }
    ];
    expect(component.getComparableTexts().map(text => text.id)).toEqual(['a', 'b']);
  });

  it('keeps a same-language target and repairs stale or cross-language targets', async () => {
    const component = await makeWindow();
    component.updateTargetForNewLanguage();
    component.state.textInfoData = [];
    component.updateTargetForNewLanguage();
    expect(component.state.targetTextId).toBeNull();

    component.state.currentSourceLang3 = 'eng';
    component.state.sourceTextId = 'SRC';
    component.state.targetTextId = 'TGT';
    component.state.textInfoData = [
      { id: 'SRC', lang3: 'eng' },
      { id: 'TGT', lang: 'eng' },
      { id: 'ALT', lang3: 'eng' }
    ];
    component.updateTargetForNewLanguage();
    expect(component.state.targetTextId).toBe('TGT');

    component.state.textInfoData[1].lang = 'spa';
    component.updateTargetForNewLanguage();
    expect(component.state.targetTextId).toBe('ALT');
    expect(component.refs.targetTitle.textContent).toBe('abbr:ALT');

    component.state.textInfoData = [{ id: 'SRC', lang3: 'eng' }];
    component.state.targetTextId = 'UNKNOWN';
    component.updateTargetForNewLanguage();
    expect(component.state.targetTextId).toBe('SRC');

    component.state.textInfoData = [{ id: 'NOPE', lang3: 'spa' }];
    component.state.targetTextId = 'UNKNOWN';
    component.updateTargetForNewLanguage();
    expect(component.state.targetTextId).toBe('UNKNOWN');
  });

  it('delegates text loading and rendering', async () => {
    const component = await makeWindow();
    fixtures.loadComparisonText.mockResolvedValue({ id: 'text' });
    expect(await component.loadTextContent('SRC', 'JN3')).toEqual({ id: 'text' });
    component.renderComparison([{ id: 'text' }]);
    expect(fixtures.loadComparisonText).toHaveBeenCalledWith('SRC', 'JN3');
    expect(fixtures.renderComparison).toHaveBeenCalledWith(component, [{ id: 'text' }]);
  });

  it('skips missing versions and queues a rerun while loading', async () => {
    const component = await makeWindow();
    component.state.sourceTextId = null;
    component.state.targetTextId = 'TGT';
    await component.doComparison();
    expect(fixtures.loadComparisonText).not.toHaveBeenCalled();
    component.state.isLoading = true;
    await component.doComparison();
    expect(component._rerunComparison).toBe(true);
  });

  it('reports an invalid reference and always stops loading', async () => {
    const component = await makeWindow();
    component.state.sourceTextId = 'SRC';
    component.state.targetTextId = 'TGT';
    component.refs.inputFragment.value = 'invalid';
    fixtures.Reference.mockImplementationOnce(function InvalidReference() {
      return {};
    });
    component.showError = vi.fn();
    component.hideLoading = vi.fn();
    await component.doComparison();
    expect(component.showError).toHaveBeenCalledWith('windows.comparison.invalidreference');
    expect(component.hideLoading).toHaveBeenCalled();
  });

  it('reports zero or one loaded Bible', async () => {
    const component = await makeWindow();
    component.state.sourceTextId = 'SRC';
    component.state.targetTextId = 'TGT';
    component.refs.inputFragment.value = 'John 3';
    component.showError = vi.fn();
    component.loadTextContent = vi.fn().mockResolvedValue(null);
    await component.doComparison();
    expect(component.showError).toHaveBeenCalledWith('windows.comparison.nobibles');

    component.showError.mockClear();
    component.loadTextContent.mockResolvedValueOnce({ id: 'source' }).mockResolvedValueOnce(null);
    await component.doComparison();
    expect(component.showError).toHaveBeenCalledWith('windows.comparison.onebible');
  });

  it('renders two texts, normalizes reference state, and emits settings', async () => {
    const component = await makeWindow();
    component.state.sourceTextId = 'SRC';
    component.state.targetTextId = 'TGT';
    component.refs.inputFragment.value = 'John 3:16';
    component.loadTextContent = vi.fn()
      .mockResolvedValueOnce({ id: 'source' })
      .mockResolvedValueOnce({ id: 'target' });
    component.renderComparison = vi.fn();
    component.trigger = vi.fn();
    await component.doComparison();

    expect(component.refs.inputFragment.value).toBe('formatted:John 3:16');
    expect(component.state.currentReference).toEqual(expect.objectContaining({ input: 'John 3:16' }));
    expect(component.state.currentSectionId).toBe('JN3');
    expect(component.loadTextContent).toHaveBeenNthCalledWith(1, 'SRC', 'JN3');
    expect(component.loadTextContent).toHaveBeenNthCalledWith(2, 'TGT', 'JN3');
    expect(component.renderComparison).toHaveBeenCalledWith([{ id: 'source' }, { id: 'target' }]);
    expect(component.trigger).toHaveBeenCalledWith('settingschange', expect.objectContaining({
      target: component,
      data: { params: expect.objectContaining({ sourceId: 'SRC', targetId: 'TGT' }) }
    }));
    expect(component.state.isLoading).toBe(false);
  });

  it('reports load failures and reruns a comparison requested in flight', async () => {
    const component = await makeWindow();
    component.state.sourceTextId = 'SRC';
    component.state.targetTextId = 'TGT';
    component.refs.inputFragment.value = 'John 3';
    component.showError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    component.loadTextContent = vi.fn().mockRejectedValueOnce(new Error('offline'));
    await component.doComparison();
    expect(consoleError).toHaveBeenCalled();
    expect(component.showError).toHaveBeenCalledWith('windows.comparison.loadfailed');

    let resolveFirst;
    component.showError.mockClear();
    component.loadTextContent = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValue({ id: 'text' });
    const first = component.doComparison();
    await Promise.resolve();
    await component.doComparison();
    expect(component._rerunComparison).toBe(true);
    resolveFirst({ id: 'source' });
    await first;
    await vi.waitFor(() => expect(component.loadTextContent).toHaveBeenCalledTimes(4));
    expect(component._rerunComparison).toBe(false);
  });

  it('sizes around header and footer and serializes comparison state', async () => {
    const component = await makeWindow();
    Object.defineProperty(component.refs.header, 'offsetHeight', { value: 30 });
    Object.defineProperty(component.refs.footer, 'offsetHeight', { value: 20 });
    component.size(800, 600);
    expect(component.refs.main.style.width).toBe('800px');
    expect(component.refs.main.style.height).toBe('550px');
    component.state.sourceTextId = 'SRC';
    component.state.targetTextId = 'TGT';
    component.refs.inputFragment.value = 'John 3:16';
    expect(component.getData()).toEqual({
      params: {
        win: 'comparison', sourceId: 'SRC', targetId: 'TGT', fragmentid: 'John 3:16'
      }
    });
  });
});
